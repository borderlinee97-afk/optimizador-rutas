// backend/routing/engine/operationalEngine.js

import {
  evaluateWorkday,
  splitIntoPreliminaryWorkdays,
  summarizeWorkdays,
  buildSchedulingAlerts
} from '../services/scheduling.service.js'

import {
  buildFuelPlan,
  buildFuelAlerts
} from '../services/fuel.service.js'

import {
  buildGoogleTollAnalysis,
  buildTollAlerts,
  toCostServiceTolls
} from '../services/toll.service.js'

import {
  buildLodgingPlan,
  buildLodgingAlerts
} from '../services/lodging.service.js'

import {
  analyzeRouteTraffic,
  buildTrafficAlerts
} from '../services/traffic.service.js'

import {
  buildOperationalCostAnalysis,
  buildCostAlerts
} from '../services/cost.service.js'

import {
  buildRouteKpis,
  buildKpiAlerts
} from '../services/kpi.service.js'

import {
  formatDuration,
  parseDurationSec
} from '../utils/time.js'

import {
  isValidLatLng
} from '../utils/geo.js'

import {
  roundDecimal,
  toOptionalNonNegativeNumber
} from '../utils/money.js'

import {
  buildOperationalResult,
  buildFailedOperationalResult,
  MOTOR_EXECUTION_MODE
} from './resultBuilder.js'

/**
 * Motor Operativo Integral.
 *
 * FASE DE INTEGRACIÓN CON EL NÚCLEO ACTUAL.
 *
 * El cálculo principal continúa siendo realizado
 * por routes.controller.js.
 *
 * Este motor recibe rutas YA CALCULADAS y agrega:
 *
 * - normalización operacional
 * - jornadas
 * - combustible
 * - autonomía cuando existe vehículo
 * - tráfico cuando exista información
 * - peajes
 * - hospedaje
 * - costos
 * - KPIs
 * - calidad de datos
 *
 * PRINCIPIO FUNDAMENTAL:
 *
 * NINGÚN módulo complementario puede impedir
 * que una ruta correctamente calculada sea
 * utilizada por el usuario.
 */

export const OPERATIONAL_ENGINE_NAME =
  'MOTOR_OPERATIVO_INTEGRAL'

export const OPERATIONAL_ENGINE_VERSION =
  '1.2'

export const ROUTE_MODES =
  Object.freeze({
    ROUND_TRIP:
      'ROUND_TRIP',

    FOREIGN_ROUTE:
      'FOREIGN_ROUTE'
  })

export const CAPABILITY_STATUS =
  Object.freeze({
    AVAILABLE:
      'AVAILABLE',

    INCOMPLETE:
      'INCOMPLETE',

    UNAVAILABLE:
      'UNAVAILABLE',

    DISABLED:
      'DISABLED',

    NOT_APPLICABLE:
      'NOT_APPLICABLE'
  })

/**
 * Normaliza criterios provenientes
 * principalmente de CriteriaModal.
 *
 * operatorCount:
 *
 * Es una variable de PLANEACIÓN.
 * No depende de personas registradas.
 *
 * @param {object} criteria
 * @returns {object}
 */
export function normalizeCriteria(
  criteria = {}
) {
  const routeModeRaw =
    String(
      criteria.routeMode ||
      ROUTE_MODES
        .ROUND_TRIP
    )
      .trim()
      .toUpperCase()

  const routeMode =
    routeModeRaw ===
      ROUTE_MODES
        .FOREIGN_ROUTE
      ? ROUTE_MODES
          .FOREIGN_ROUTE
      : ROUTE_MODES
          .ROUND_TRIP

  const operatorCount =
    Math.max(
      1,
      Math.floor(
        Number(
          criteria.operatorCount ??
          criteria.requestedOperators ??
          1
        ) ||
        1
      )
    )

  const usedOperatorsRaw =
    Number(
      criteria.usedOperators
    )

  const usedOperators =
    Number.isFinite(
      usedOperatorsRaw
    ) &&
    usedOperatorsRaw >=
      0
      ? Math.floor(
          usedOperatorsRaw
        )
      : null

  const kmPerLiterRaw =
    Number(
      criteria.kmPerLiter
    )

  /*
   * El sistema ya utiliza 10 km/L
   * como valor base de CriteriaModal.
   *
   * Esto permite calcular litros aproximados
   * incluso sin vehicle_profile.
   */
  const kmPerLiter =
    Number.isFinite(
      kmPerLiterRaw
    ) &&
    kmPerLiterRaw >
      0
      ? kmPerLiterRaw
      : 10

  const fuelPriceRaw =
    Number(
      criteria.fuelPricePerLiter
    )

  /*
   * 0 proveniente del formulario representa
   * normalmente dato no configurado.
   *
   * En análisis económico:
   *
   * null = desconocido
   * 0    = cero real
   */
  const fuelPricePerLiter =
    Number.isFinite(
      fuelPriceRaw
    ) &&
    fuelPriceRaw >
      0
      ? fuelPriceRaw
      : null

  const allowanceRaw =
    Number(
      criteria.dailyAllowance
    )

  const dailyAllowance =
    Number.isFinite(
      allowanceRaw
    ) &&
    allowanceRaw >
      0
      ? allowanceRaw
      : null

  const explicitReturnToOrigin =
    typeof criteria.returnToOrigin ===
      'boolean'
      ? criteria.returnToOrigin
      : (
          typeof criteria
            ?.options
            ?.returnToOrigin ===
            'boolean'
            ? criteria
                .options
                .returnToOrigin
            : null
        )

  /*
   * En FOREIGN_ROUTE el núcleo actual:
   *
   * - no vuelve al CEDIS al cerrar cada jornada
   * - puede continuar desde hospedaje
   * - en la última jornada regresa al origen
   *
   * returnToOrigin representa aquí la naturaleza
   * de la ruta diaria/normal, no la última pierna
   * de cierre de una ruta foránea.
   */
  const returnToOrigin =
    routeMode ===
      ROUTE_MODES
        .FOREIGN_ROUTE
      ? false
      : (
          explicitReturnToOrigin ??
          true
        )

  return {
    strategy:
      String(
        criteria.strategy ||
        'FASTEST'
      )
        .trim()
        .toUpperCase(),

    routeEngine:
      criteria.routeEngine ||
      null,

    routeMode,

    operatorCount,

    usedOperators,

    returnToOrigin,

    avoidTolls:
      criteria.avoidTolls ===
        true ||
      criteria
        ?.options
        ?.avoidTolls ===
        true,

    avoidDificilAcceso:
      (
        criteria.avoidDificilAcceso ??
        criteria
          ?.options
          ?.avoidDificilAcceso
      ) !==
      false,

    maxForeignDays:
      Math.max(
        1,
        Math.floor(
          Number(
            criteria.maxForeignDays
          ) ||
          3
        )
      ),

    kmPerLiter,

    fuelPricePerLiter,

    dailyAllowance
  }
}

/**
 * Distancia de ruta ya calculada.
 *
 * @param {object} route
 * @returns {number|null}
 */
export function getComputedRouteDistanceMeters(
  route
) {
  const candidates = [
    route?.distanceMeters,
    route?.distance_meters,

    route
      ?.metrics
      ?.distanceMeters,

    route
      ?.route
      ?.distanceMeters,

    route
      ?.summary
      ?.distanceMeters,

    route?.distance
  ]

  for (
    const candidate
    of candidates
  ) {
    const value =
      toOptionalNonNegativeNumber(
        candidate
      )

    if (
      value !=
      null
    ) {
      return value
    }
  }

  return null
}

/**
 * Duración de ruta ya calculada.
 *
 * @param {object} route
 * @returns {number|null}
 */
export function getComputedRouteDurationSeconds(
  route
) {
  const numericCandidates = [
    route?.durationSeconds,
    route?.duration_seconds,

    route
      ?.metrics
      ?.durationSeconds,

    route
      ?.summary
      ?.durationSeconds
  ]

  for (
    const candidate
    of numericCandidates
  ) {
    const value =
      toOptionalNonNegativeNumber(
        candidate
      )

    if (
      value !=
      null
    ) {
      return value
    }
  }

  if (
    route?.duration !=
    null
  ) {
    return parseDurationSec(
      route.duration
    )
  }

  return null
}

/**
 * Puntos atendidos por ruta.
 *
 * @param {object} route
 * @returns {object[]}
 */
export function getComputedRoutePoints(
  route
) {
  const candidates = [
    route?.points,
    route?.stops,
    route?.orderedPoints,

    route
      ?.route
      ?.points
  ]

  for (
    const candidate
    of candidates
  ) {
    if (
      Array.isArray(
        candidate
      )
    ) {
      return candidate
    }
  }

  return []
}

/**
 * Google Route cruda cuando exista.
 *
 * En la primera integración normalmente
 * no estará presente porque el controlador
 * todavía no la conserva para análisis.
 *
 * @param {object} route
 * @returns {object|null}
 */
export function getRawGoogleRoute(
  route
) {
  return (
    route?.rawRoute ||
    route?.googleRoute ||
    route?.raw ||
    null
  )
}

/**
 * Número de ruta/operador planeado.
 *
 * NO implica que exista una Persona
 * con ese número.
 *
 * @param {object} route
 * @param {number} index
 * @returns {number}
 */
function getRouteOperatorNumber(
  route,
  index
) {
  const value =
    Number(
      route?.operator ??
      route?.operatorNumber ??
      route?.routeNumber
    )

  if (
    Number.isFinite(
      value
    ) &&
    value >
      0
  ) {
    return Math.floor(
      value
    )
  }

  return index +
    1
}

/**
 * Resuelve vehicle_profile cuando exista.
 *
 * Es opcional.
 *
 * @param {{
 *   operator:number,
 *   vehicleProfile?:object|null,
 *   vehicleProfiles?:object[]
 * }} params
 *
 * @returns {object|null}
 */
function resolveVehicleProfile({
  operator,
  vehicleProfile,
  vehicleProfiles
}) {
  if (
    Array.isArray(
      vehicleProfiles
    )
  ) {
    const specific =
      vehicleProfiles.find(
        profile =>
          Number(
            profile?.operator
          ) ===
          Number(
            operator
          )
      )

    if (
      specific
    ) {
      return specific
    }
  }

  return (
    vehicleProfile ||
    null
  )
}

/**
 * Perfil mínimo generado desde CriteriaModal.
 *
 * Permite estimar litros sin vehículo
 * registrado.
 *
 * No inventa:
 *
 * - tanque
 * - autonomía
 * - tipo de combustible
 * - dimensiones
 * - capacidad
 *
 * @param {object} criteria
 * @returns {object}
 */
function buildCriteriaFuelProfile(
  criteria
) {
  return {
    fuelType:
      'UNKNOWN',

    cargoType:
      'UNKNOWN',

    tankCapacityLiters:
      null,

    kmPerLiter:
      criteria.kmPerLiter,

    reservePercent:
      15,

    auxiliaryFuelMode:
      'UNKNOWN',

    auxiliaryFuelLitersPerHour:
      null
  }
}

/**
 * Configuración de jornada.
 *
 * @param {object} config
 * @returns {object}
 */
function normalizeSchedulingConfig(
  config = {}
) {
  const shiftHoursRaw =
    Number(
      config.shiftHours ??
      config.horasTurno
    )

  const serviceMinutesRaw =
    Number(
      config.serviceMinutesPerUnit ??
      config.minutosServicioPorUnidad
    )

  return {
    startClock:
      config.startClock ||
      '08:00',

    shiftHours:
      Number.isFinite(
        shiftHoursRaw
      ) &&
      shiftHoursRaw >
        0
        ? shiftHoursRaw
        : 8,

    lastArrivalClock:
      config.lastArrivalClock ||
      config.horaLimiteLlegadaUltimaUnidad ||
      '16:00',

    serviceMinutesPerUnit:
      Number.isFinite(
        serviceMinutesRaw
      ) &&
      serviceMinutesRaw >
        0
        ? serviceMinutesRaw
        : 45,

    maxForeignDays:
      Number(
        config.maxForeignDays ||
        3
      )
  }
}

/**
 * Convierte una jornada YA calculada por
 * routes.controller.js a la forma requerida
 * por scheduling.service.js.
 *
 * No vuelve a dividir puntos.
 *
 * @param {object} day
 * @param {object} schedulingConfig
 * @returns {object}
 */
function adaptComputedDayToSchedule(
  day,
  schedulingConfig
) {
  const config =
    normalizeSchedulingConfig(
      schedulingConfig
    )

  const points =
    Array.isArray(
      day?.points
    )
      ? day.points
      : []

  const schedule =
    day?.schedule ||
    {}

  const distanceMeters =
    toOptionalNonNegativeNumber(
      day?.distanceMeters
    ) ??
    0

  const totalSeconds =
    toOptionalNonNegativeNumber(
      day?.durationSeconds
    ) ??
    toOptionalNonNegativeNumber(
      schedule.totalSeconds
    ) ??
    (
      day?.duration
        ? parseDurationSec(
            day.duration
          )
        : 0
    )

  const driveSeconds =
    toOptionalNonNegativeNumber(
      schedule.driveSeconds
    ) ??
    (
      day?.driveDuration
        ? parseDurationSec(
            day.driveDuration
          )
        : 0
    )

  const serviceSeconds =
    toOptionalNonNegativeNumber(
      schedule.totalServiceSeconds
    ) ??
    Math.max(
      0,
      totalSeconds -
      driveSeconds
    )

  const shiftSeconds =
    config.shiftHours *
    3600

  const utilizationPercent =
    shiftSeconds >
      0
      ? (
          roundDecimal(
            (
              totalSeconds /
              shiftSeconds
            ) *
              100,
            1
          ) ??
          0
        )
      : 0

  const violations =
    []

  if (
    schedule.exceedsShift ===
    true
  ) {
    violations.push({
      type:
        'SHIFT_DURATION_EXCEEDED',

      expectedSeconds:
        shiftSeconds,

      actualSeconds:
        totalSeconds
    })
  }

  if (
    schedule
      .exceedsLastArrivalLimit ===
      true
  ) {
    violations.push({
      type:
        'LAST_ARRIVAL_LIMIT',

      pointId:
        points[
          points.length -
          1
        ]?.id ??
        null,

      expected:
        schedule.limitLastArrival ||
        config.lastArrivalClock,

      actual:
        null
    })
  }

  return {
    day:
      Number(
        day?.day
      ) ||
      1,

    points,

    feasible:
      violations.length ===
      0,

    critical:
      utilizationPercent >=
      90,

    violations,

    stops:
      points,

    metrics: {
      stopCount:
        points.length,

      estimatedDistanceMeters:
        Math.round(
          distanceMeters
        ),

      estimatedDistanceKm:
        roundDecimal(
          distanceMeters /
          1000,
          2
        ),

      drivingSeconds:
        Math.round(
          driveSeconds
        ),

      drivingFormatted:
        formatDuration(
          driveSeconds
        ),

      serviceSeconds:
        Math.round(
          serviceSeconds
        ),

      serviceFormatted:
        formatDuration(
          serviceSeconds
        ),

      returnSeconds:
        toOptionalNonNegativeNumber(
          schedule.returnSeconds
        ) ??
        0,

      returnDistanceMeters:
        null,

      totalOperationalSeconds:
        Math.round(
          totalSeconds
        ),

      totalOperationalFormatted:
        formatDuration(
          totalSeconds
        ),

      startClock:
        schedule.suggestedStart ||
        config.startClock,

      endClock:
        null,

      lastArrivalClock:
        schedule.limitLastArrival ||
        config.lastArrivalClock,

      shiftHours:
        config.shiftHours,

      utilizationPercent
    },

    source:
      'CURRENT_ROUTE_CORE',

    raw:
      day
  }
}

/**
 * Obtiene jornadas directamente del
 * núcleo actual cuando ya existen.
 *
 * Sólo utiliza cálculo preliminar cuando
 * la estructura original no contiene days.
 *
 * @param {{
 *   route:object,
 *   routeMode:string,
 *   origin:object,
 *   schedulingConfig:object,
 *   maxForeignDays:number
 * }} params
 *
 * @returns {object|null}
 */
function buildRouteSchedule({
  route,
  routeMode,
  origin,
  schedulingConfig,
  maxForeignDays
}) {
  const computedDays =
    Array.isArray(
      route?.days
    )
      ? route.days
      : []

  /*
   * PRIORIDAD ABSOLUTA:
   *
   * utilizar las jornadas que ya calculó
   * correctamente routes.controller.js.
   */
  if (
    computedDays.length
  ) {
    const days =
      computedDays.map(
        day =>
          adaptComputedDayToSchedule(
            day,
            schedulingConfig
          )
      )

    return {
      totalDays:
        days.length,

      maxDays:
        routeMode ===
          ROUTE_MODES
            .FOREIGN_ROUTE
          ? maxForeignDays
          : null,

      complete:
        true,

      overflowPoints: [],

      days,

      source:
        'CURRENT_ROUTE_CORE'
    }
  }

  /*
   * Fallback para rutas manuales u otras
   * estructuras que todavía no tengan days.
   */

  const points =
    getComputedRoutePoints(
      route
    )

  if (
    !points.length ||
    !isValidLatLng(
      origin
    )
  ) {
    return null
  }

  if (
    routeMode ===
    ROUTE_MODES
      .ROUND_TRIP
  ) {
    const evaluation =
      evaluateWorkday({
        points,

        origin,

        config:
          schedulingConfig,

        returnToOrigin:
          true
      })

    return {
      totalDays:
        1,

      complete:
        true,

      overflowPoints: [],

      days: [
        {
          day:
            1,

          points,

          ...evaluation
        }
      ],

      source:
        'SCHEDULING_FALLBACK'
    }
  }

  return {
    ...splitIntoPreliminaryWorkdays({
      points,

      origin,

      config: {
        ...schedulingConfig,

        maxForeignDays
      },

      maxDays:
        maxForeignDays,

      dayStartMode:
        'CONTINUE',

      returnToOriginEachDay:
        false
    }),

    source:
      'SCHEDULING_FALLBACK'
  }
}

/**
 * Convierte peajes ya calculados
 * por routes.controller.js.
 *
 * @param {object|null} tolls
 * @returns {object|null}
 */
function adaptComputedTolls(
  tolls
) {
  if (
    !tolls ||
    typeof tolls !==
      'object'
  ) {
    return null
  }

  const hasTolls =
    typeof tolls.hasTolls ===
      'boolean'
      ? tolls.hasTolls
      : null

  const known =
    tolls.known ===
    true

  const amount =
    toOptionalNonNegativeNumber(
      tolls.amount
    )

  /*
   * Cuando el núcleo indica explícitamente
   * que no detectó peajes:
   *
   * el importe operativo es 0.
   */
  if (
    hasTolls ===
    false
  ) {
    return {
      mode:
        'GOOGLE_ESTIMATE',

      hasTolls:
        false,

      total:
        0,

      currencyCode:
        tolls.currencyCode ||
        'MXN',

      source:
        'GOOGLE_ESTIMATE',

      confidence:
        'MEDIUM',

      estimated:
        true,

      available:
        true,

      plazas: [],

      catalogMatched:
        false,

      officialTariffs:
        false,

      raw:
        tolls
    }
  }

  return {
    mode:
      'GOOGLE_ESTIMATE',

    hasTolls:
      hasTolls,

    total:
      known &&
      amount !=
        null
        ? amount
        : null,

    currencyCode:
      tolls.currencyCode ||
      null,

    source:
      'GOOGLE_ESTIMATE',

    confidence:
      known
        ? 'MEDIUM'
        : 'LOW',

    estimated:
      true,

    available:
      known,

    plazas: [],

    catalogMatched:
      false,

    officialTariffs:
      false,

    raw:
      tolls
  }
}

/**
 * Obtiene análisis de peajes.
 *
 * Prioridad:
 *
 * 1. tolls ya calculados por núcleo actual
 * 2. Google Route cruda
 *
 * @param {object} route
 * @returns {object|null}
 */
function resolveTollAnalysis(
  route
) {
  const precomputed =
    adaptComputedTolls(
      route?.tolls
    )

  if (
    precomputed
  ) {
    return precomputed
  }

  const rawGoogleRoute =
    getRawGoogleRoute(
      route
    )

  if (
    rawGoogleRoute
  ) {
    return buildGoogleTollAnalysis(
      rawGoogleRoute
    )
  }

  return null
}

/**
 * Hospedajes ya resueltos por el
 * núcleo de rutas foráneas.
 *
 * @param {object} route
 * @returns {object}
 */
function buildComputedLodgingPlan(
  route
) {
  const days =
    Array.isArray(
      route?.days
    )
      ? route.days
      : []

  const totalDays =
    Math.max(
      1,
      days.length ||
      1
    )

  const nights =
    days
      .slice(
        0,
        -1
      )
      .filter(
        day =>
          day?.lodging
      )
      .map(
        day => ({
          afterDay:
            day.day,

          lodging:
            day.lodging,

          estimatedCost:
            null
        })
      )

  return buildLodgingPlan({
    totalDays,

    nights
  })
}

/**
 * Ejecuta enriquecimiento opcional.
 *
 * Cualquier fallo queda aislado.
 *
 * @param {{
 *   capability:string,
 *   operation:Function,
 *   alerts:object[],
 *   fallback?:any
 * }} params
 *
 * @returns {Promise<any>}
 */
async function safelyEnrich({
  capability,
  operation,
  alerts,
  fallback = null
}) {
  try {
    return await operation()
  } catch (
    error
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        `${String(capability).toUpperCase()}_ENRICHMENT_UNAVAILABLE`,

      message:
        `No fue posible completar ${capability}. El cálculo principal permanece disponible.`,

      details:
        error?.message ||
        String(
          error
        )
    })

    return fallback
  }
}

/**
 * Suma una propiedad numérica conocida.
 *
 * Si no hay ningún valor conocido devuelve null.
 *
 * @param {object[]} items
 * @param {Function} getter
 * @returns {number|null}
 */
function sumKnown(
  items,
  getter
) {
  const values =
    (
      Array.isArray(
        items
      )
        ? items
        : []
    )
      .map(
        getter
      )
      .map(
        toOptionalNonNegativeNumber
      )
      .filter(
        value =>
          value !=
          null
      )

  if (
    !values.length
  ) {
    return null
  }

  return values.reduce(
    (
      total,
      value
    ) =>
      total +
      value,
    0
  )
}

/**
 * Reporte de módulos disponibles.
 *
 * Ninguno de los módulos complementarios
 * es blocking.
 *
 * @param {object} params
 * @returns {object}
 */
function buildCapabilityReport({
  criteria,

  routes,

  schedules,

  traffic,

  fuelPlans,

  tollAnalyses,

  lodgingPlans,

  costAnalysis,

  kpis,

  vehicleConfigured
}) {
  const fuelAvailable =
    fuelPlans.some(
      plan =>
        plan
          ?.consumption
          ?.totalLiters !=
        null
    )

  const tollAvailable =
    tollAnalyses.length >
    0

  const trafficAvailable =
    traffic.some(
      item =>
        item?.available ===
          true ||
        item
          ?.analysis
          ?.available ===
          true
    )

  return {
    coreRouting: {
      status:
        routes.length
          ? CAPABILITY_STATUS
              .AVAILABLE
          : CAPABILITY_STATUS
              .UNAVAILABLE,

      blocking:
        true
    },

    operatorDatabase: {
      /*
       * No es requisito para calcular.
       */
      status:
        CAPABILITY_STATUS
          .NOT_APPLICABLE,

      blocking:
        false
    },

    vehicleProfile: {
      status:
        vehicleConfigured
          ? CAPABILITY_STATUS
              .AVAILABLE
          : CAPABILITY_STATUS
              .UNAVAILABLE,

      blocking:
        false
    },

    scheduling: {
      status:
        schedules.length
          ? CAPABILITY_STATUS
              .AVAILABLE
          : CAPABILITY_STATUS
              .UNAVAILABLE,

      blocking:
        false
    },

    traffic: {
      status:
        trafficAvailable
          ? CAPABILITY_STATUS
              .AVAILABLE
          : CAPABILITY_STATUS
              .UNAVAILABLE,

      blocking:
        false
    },

    fuel: {
      status:
        fuelAvailable
          ? (
              vehicleConfigured
                ? CAPABILITY_STATUS
                    .AVAILABLE
                : CAPABILITY_STATUS
                    .INCOMPLETE
            )
          : CAPABILITY_STATUS
              .UNAVAILABLE,

      blocking:
        false,

      approximateWithoutVehicle:
        fuelAvailable &&
        !vehicleConfigured
    },

    tolls: {
      status:
        tollAvailable
          ? CAPABILITY_STATUS
              .AVAILABLE
          : CAPABILITY_STATUS
              .UNAVAILABLE,

      blocking:
        false
    },

    lodging: {
      status:
        criteria.routeMode ===
          ROUTE_MODES
            .ROUND_TRIP
          ? CAPABILITY_STATUS
              .NOT_APPLICABLE
          : (
              lodgingPlans.length
                ? (
                    lodgingPlans.every(
                      plan =>
                        plan.complete
                    )
                      ? CAPABILITY_STATUS
                          .AVAILABLE
                      : CAPABILITY_STATUS
                          .INCOMPLETE
                  )
                : CAPABILITY_STATUS
                    .NOT_APPLICABLE
            ),

      blocking:
        false
    },

    costs: {
      status:
        costAnalysis
          ? (
              costAnalysis
                ?.completeness
                ?.complete
                ? CAPABILITY_STATUS
                    .AVAILABLE
                : CAPABILITY_STATUS
                    .INCOMPLETE
            )
          : CAPABILITY_STATUS
              .UNAVAILABLE,

      blocking:
        false
    },

    kpis: {
      status:
        kpis
          ? CAPABILITY_STATUS
              .AVAILABLE
          : CAPABILITY_STATUS
              .UNAVAILABLE,

      blocking:
        false
    }
  }
}

/**
 * Motor de enriquecimiento.
 *
 * Recibe el resultado del núcleo actual.
 *
 * @param {{
 *   context?:object,
 *   criteria?:object,
 *   origin?:object,
 *
 *   computedRoutes:object[],
 *   assignments?:object[],
 *   unresolved?:object[],
 *   excluded?:object[],
 *
 *   schedulingConfig?:object,
 *
 *   vehicleProfile?:object|null,
 *   vehicleProfiles?:object[],
 *
 *   economics?:object,
 *   coverage?:object,
 *
 *   enableTraffic?:boolean,
 *   enableFuel?:boolean,
 *   enableTolls?:boolean,
 *   enableLodging?:boolean,
 *   enableCosts?:boolean,
 *   enableKpis?:boolean
 * }} params
 *
 * @returns {Promise<object>}
 */
export async function analyzeComputedOperation({
  context = {},

  criteria = {},

  origin = null,

  computedRoutes = [],

  assignments = [],

  unresolved = [],

  excluded = [],

  schedulingConfig = {},

  vehicleProfile = null,

  vehicleProfiles = [],

  economics = {},

  coverage = {},

  enableTraffic = true,
  enableFuel = true,
  enableTolls = true,
  enableLodging = true,
  enableCosts = true,
  enableKpis = true
} = {}) {
  const startedAt =
    Date.now()

  const normalizedCriteria =
    normalizeCriteria(
      criteria
    )

  const routes =
    Array.isArray(
      computedRoutes
    )
      ? computedRoutes
      : []

  /*
   * El núcleo actual ya realizó la ruta.
   *
   * Si aquí no recibimos ninguna ruta,
   * no existe nada que enriquecer.
   */
  if (
    !routes.length
  ) {
    return buildFailedOperationalResult({
      context,

      request:
        normalizedCriteria,

      error: {
        code:
          'NO_COMPUTED_ROUTES',

        message:
          'El núcleo de cálculo no devolvió rutas utilizables.'
      },

      metadata: {
        integrationMode:
          'ENRICH_EXISTING_CORE'
      }
    })
  }

  const alerts =
    []

  const schedules =
    []

  const traffic =
    []

  const fuelPlans =
    []

  const tollAnalyses =
    []

  const lodgingPlans =
    []

  const allWorkdays =
    []

  let vehicleConfigured =
    Boolean(
      vehicleProfile
    ) ||
    (
      Array.isArray(
        vehicleProfiles
      ) &&
      vehicleProfiles.length >
        0
    )

  /*
   * =========================================================
   * ENRIQUECIMIENTO POR RUTA
   * =========================================================
   */

  for (
    let index = 0;
    index <
    routes.length;
    index++
  ) {
    const route =
      routes[
        index
      ]

    const operator =
      getRouteOperatorNumber(
        route,
        index
      )

    const distanceMeters =
      getComputedRouteDistanceMeters(
        route
      )

    const durationSeconds =
      getComputedRouteDurationSeconds(
        route
      )

    /*
     * ---------------------------------------------------------
     * SCHEDULING
     * ---------------------------------------------------------
     */

    const schedule =
      await safelyEnrich({
        capability:
          'scheduling',

        alerts,

        operation:
          async () =>
            buildRouteSchedule({
              route,

              routeMode:
                normalizedCriteria
                  .routeMode,

              origin,

              schedulingConfig,

              maxForeignDays:
                normalizedCriteria
                  .maxForeignDays
            })
      })

    if (
      schedule
    ) {
      schedules.push({
        operator,

        ...schedule
      })

      allWorkdays.push(
        ...(
          schedule.days ||
          []
        )
      )

      alerts.push(
        ...buildSchedulingAlerts(
          schedule.days
        )
          .map(
            alert => ({
              ...alert,

              operator
            })
          )
      )
    }

    /*
     * ---------------------------------------------------------
     * TRAFFIC
     * ---------------------------------------------------------
     *
     * Sólo se procesa si el núcleo conserva
     * información Google con
     * speedReadingIntervals.
     *
     * En F8B ampliaremos el FieldMask
     * del controlador actual.
     */

    if (
      enableTraffic
    ) {
      const rawGoogleRoute =
        getRawGoogleRoute(
          route
        )

      if (
        rawGoogleRoute
      ) {
        const trafficAnalysis =
          await safelyEnrich({
            capability:
              'traffic',

            alerts,

            operation:
              async () =>
                analyzeRouteTraffic(
                  rawGoogleRoute
                )
          })

        if (
          trafficAnalysis
        ) {
          traffic.push({
            operator,

            ...trafficAnalysis
          })

          alerts.push(
            ...buildTrafficAlerts(
              trafficAnalysis
            )
              .map(
                alert => ({
                  ...alert,

                  operator
                })
              )
          )
        }
      }
    }

    /*
     * ---------------------------------------------------------
     * FUEL
     * ---------------------------------------------------------
     */

    if (
      enableFuel &&
      distanceMeters !=
        null
    ) {
      const configuredVehicle =
        resolveVehicleProfile({
          operator,

          vehicleProfile,

          vehicleProfiles
        })

      const effectiveFuelProfile =
        configuredVehicle ||
        buildCriteriaFuelProfile(
          normalizedCriteria
        )

      const fuelPlan =
        await safelyEnrich({
          capability:
            'fuel',

          alerts,

          operation:
            async () =>
              buildFuelPlan({
                distanceMeters,

                durationSeconds,

                vehicleProfile:
                  effectiveFuelProfile,

                pricePerLiter:
                  normalizedCriteria
                    .fuelPricePerLiter
              })
        })

      if (
        fuelPlan
      ) {
        const enrichedFuelPlan = {
          operator,

          profileSource:
            configuredVehicle
              ? 'VEHICLE_PROFILE'
              : 'CRITERIA_MODAL',

          approximate:
            !configuredVehicle,

          ...fuelPlan
        }

        fuelPlans.push(
          enrichedFuelPlan
        )

        /*
         * Con vehicle_profile sí podemos generar
         * alertas de tanque/autonomía.
         *
         * Sin vehicle_profile sólo queremos
         * calcular litros aproximados.
         * No generamos falsos problemas porque
         * todavía no conozcamos el tanque.
         */
        if (
          configuredVehicle
        ) {
          alerts.push(
            ...buildFuelAlerts(
              fuelPlan
            )
              .map(
                alert => ({
                  ...alert,

                  operator
                })
              )
          )
        }
      }
    }

    /*
     * ---------------------------------------------------------
     * TOLLS
     * ---------------------------------------------------------
     *
     * Primero reutilizamos exactamente
     * el cálculo que ya hizo el núcleo.
     */

    if (
      enableTolls
    ) {
      const tollAnalysis =
        await safelyEnrich({
          capability:
            'tolls',

          alerts,

          operation:
            async () =>
              resolveTollAnalysis(
                route
              )
        })

      if (
        tollAnalysis
      ) {
        tollAnalyses.push({
          operator,

          ...tollAnalysis
        })

        alerts.push(
          ...buildTollAlerts(
            tollAnalysis
          )
            .map(
              alert => ({
                ...alert,

                operator
              })
            )
        )
      }
    }

    /*
     * ---------------------------------------------------------
     * LODGING
     * ---------------------------------------------------------
     *
     * Sólo FOREIGN_ROUTE.
     *
     * Reutilizamos los hoteles que
     * routes.controller.js ya resolvió.
     */

    if (
      enableLodging &&
      normalizedCriteria
        .routeMode ===
        ROUTE_MODES
          .FOREIGN_ROUTE
    ) {
      const lodgingPlan =
        await safelyEnrich({
          capability:
            'lodging',

          alerts,

          operation:
            async () =>
              buildComputedLodgingPlan(
                route
              )
        })

      if (
        lodgingPlan &&
        lodgingPlan.required
      ) {
        lodgingPlans.push({
          operator,

          ...lodgingPlan
        })

        alerts.push(
          ...buildLodgingAlerts(
            lodgingPlan
          )
            .map(
              alert => ({
                ...alert,

                operator
              })
            )
        )
      }
    }
  }

  /*
   * =========================================================
   * RESUMEN DE JORNADAS
   * =========================================================
   */

  const workdaySummary =
    allWorkdays.length
      ? summarizeWorkdays(
          allWorkdays
        )
      : null

  /*
   * =========================================================
   * COSTOS
   * =========================================================
   */

  let costAnalysis =
    null

  if (
    enableCosts
  ) {
    costAnalysis =
      await safelyEnrich({
        capability:
          'costs',

        alerts,

        operation:
          async () => {
            const totalDistanceMeters =
              routes.reduce(
                (
                  total,
                  route
                ) =>
                  total +
                  (
                    getComputedRouteDistanceMeters(
                      route
                    ) ||
                    0
                  ),
                0
              )

            const totalDurationSeconds =
              routes.reduce(
                (
                  total,
                  route
                ) =>
                  total +
                  (
                    getComputedRouteDurationSeconds(
                      route
                    ) ||
                    0
                  ),
                0
              )

            const stopCount =
              routes.reduce(
                (
                  total,
                  route
                ) =>
                  total +
                  getComputedRoutePoints(
                    route
                  ).length,
                0
              )

            /*
             * Aquí days significa total de
             * jornadas-operador calculadas.
             *
             * Ejemplo:
             *
             * Ruta 1 = 2 días
             * Ruta 2 = 1 día
             *
             * total = 3 jornadas operativas.
             */
            const routeDays =
              workdaySummary
                ?.days ??
              routes.reduce(
                (
                  total,
                  route
                ) =>
                  total +
                  Math.max(
                    1,
                    route
                      ?.days
                      ?.length ||
                    1
                  ),
                0
              )

            /*
             * COMBUSTIBLE
             */

            const totalFuelLiters =
              sumKnown(
                fuelPlans,
                plan =>
                  plan
                    ?.consumption
                    ?.totalLiters
              )

            const totalFuelCost =
              sumKnown(
                fuelPlans,
                plan =>
                  plan
                    ?.cost
                    ?.totalEstimated
              )

            const combinedFuelPlan =
              fuelPlans.length
                ? {
                    consumption: {
                      totalLiters:
                        totalFuelLiters !=
                          null
                          ? roundDecimal(
                              totalFuelLiters,
                              4
                            )
                          : null
                    },

                    cost: {
                      totalEstimated:
                        totalFuelCost !=
                          null
                          ? roundDecimal(
                              totalFuelCost,
                              2
                            )
                          : null,

                      pricePerLiter:
                        normalizedCriteria
                          .fuelPricePerLiter,

                      source:
                        'CALCULATED'
                    }
                  }
                : null

            /*
             * CASETAS
             */

            const normalizedTolls =
              tollAnalyses.map(
                analysis =>
                  toCostServiceTolls(
                    analysis
                  )
              )

            const knownTollAmounts =
              normalizedTolls
                .map(
                  toll =>
                    toOptionalNonNegativeNumber(
                      toll.amount
                    )
                )
                .filter(
                  value =>
                    value !=
                    null
                )

            const hasUnknownToll =
              normalizedTolls.some(
                toll =>
                  toll.amount ==
                    null &&
                  toll.hasTolls !==
                    false
              )

            const combinedTolls =
              normalizedTolls.length
                ? {
                    hasTolls:
                      normalizedTolls.some(
                        toll =>
                          toll.hasTolls ===
                          true
                      ),

                    amount:
                      hasUnknownToll
                        ? null
                        : roundDecimal(
                            knownTollAmounts.reduce(
                              (
                                total,
                                value
                              ) =>
                                total +
                                value,
                              0
                            ),
                            2
                          ),

                    currencyCode:
                      'MXN',

                    source:
                      'GOOGLE_ESTIMATE',

                    estimated:
                      true
                  }
                : null

            return buildOperationalCostAnalysis({
              distanceMeters:
                totalDistanceMeters,

              durationSeconds:
                totalDurationSeconds,

              stopCount,

              routeDays,

              /*
               * Número de rutas planeadas.
               *
               * No personas registradas en BD.
               */
              operatorCount:
                routes.length,

              fuelPlan:
                combinedFuelPlan,

              tolls:
                combinedTolls,

              dailyAllowance:
                economics.dailyAllowance ??
                normalizedCriteria
                  .dailyAllowance,

              lodgingNights:
                economics.lodgingNights ??
                null,

              lodgingCostPerNight:
                economics.lodgingCostPerNight ??
                null,

              maintenanceCostPerKm:
                economics.maintenanceCostPerKm ??
                null,

              depreciationCostPerKm:
                economics.depreciationCostPerKm ??
                null,

              operatorCostPerDay:
                economics.operatorCostPerDay ??
                null,

              operatorCostPerHour:
                economics.operatorCostPerHour ??
                null,

              vehicleFixedCostPerDay:
                economics.vehicleFixedCostPerDay ??
                null,

              insuranceCostPerDay:
                economics.insuranceCostPerDay ??
                null,

              refrigerationCost:
                economics.refrigerationCost ??
                null,

              refrigerationCostPerHour:
                economics.refrigerationCostPerHour ??
                null,

              otherCost:
                economics.otherCost ??
                null
            })
          }
      })

    if (
      costAnalysis
    ) {
      alerts.push(
        ...buildCostAlerts(
          costAnalysis
        )
      )
    }
  }

  /*
   * =========================================================
   * KPIs
   * =========================================================
   */

  let kpis =
    null

  if (
    enableKpis
  ) {
    kpis =
      await safelyEnrich({
        capability:
          'kpis',

        alerts,

        operation:
          async () => {
            const routedUnits =
              routes.reduce(
                (
                  total,
                  route
                ) =>
                  total +
                  getComputedRoutePoints(
                    route
                  ).length,
                0
              )

            const requestedTotal =
              Number(
                coverage.totalUnits
              )

            const totalUnits =
              Number.isFinite(
                requestedTotal
              ) &&
              requestedTotal >
                0
                ? requestedTotal
                : routedUnits

            return buildRouteKpis({
              coverage: {
                totalUnits,

                routedUnits,

                excludedUnits:
                  coverage.excludedUnits ??
                  excluded.length,

                difficultAccessUnits:
                  coverage.difficultAccessUnits ??
                  0,

                unitsWithoutCoordinates:
                  coverage.unitsWithoutCoordinates ??
                  0
              },

              routes,

              /*
               * Cantidad de rutas realmente
               * utilizadas en el plan.
               */
              operatorCount:
                routes.length,

              workdaySummary,

              fuelPlans,

              tollAnalyses,

              costAnalysis
            })
          }
      })

    if (
      kpis
    ) {
      alerts.push(
        ...buildKpiAlerts(
          kpis
        )
      )
    }
  }

  /*
   * =========================================================
   * CAPABILITIES
   * =========================================================
   */

  const capabilities =
    buildCapabilityReport({
      criteria:
        normalizedCriteria,

      routes,

      schedules,

      traffic,

      fuelPlans,

      tollAnalyses,

      lodgingPlans,

      costAnalysis,

      kpis,

      vehicleConfigured
    })

  /*
   * =========================================================
   * RESULTADO UNIVERSAL
   * =========================================================
   */

  return buildOperationalResult({
    context,

    engine: {
      executionMode:
        MOTOR_EXECUTION_MODE
          .LEGACY_CORE,

      routingProvider:
        'CURRENT_ROUTE_CORE',

      optimizationProvider:
        null,

      placesProvider:
        normalizedCriteria
          .routeMode ===
          ROUTE_MODES
            .FOREIGN_ROUTE
          ? 'CURRENT_ROUTE_CORE'
          : null,

      assignmentStrategy:
        'CURRENT_ROUTE_CORE',

      trafficEnabled:
        enableTraffic,

      tollsEnabled:
        enableTolls,

      fuelEnabled:
        enableFuel
    },

    request: {
      strategy:
        normalizedCriteria
          .strategy,

      routeMode:
        normalizedCriteria
          .routeMode,

      operatorCountRequested:
        normalizedCriteria
          .operatorCount,

      operatorCountUsed:
        normalizedCriteria
          .usedOperators ??
        routes.length,

      returnToOrigin:
        normalizedCriteria
          .returnToOrigin,

      avoidTolls:
        normalizedCriteria
          .avoidTolls,

      avoidDificilAcceso:
        normalizedCriteria
          .avoidDificilAcceso,

      maxForeignDays:
        normalizedCriteria
          .maxForeignDays
    },

    routes,

    assignments,

    schedules,

    traffic,

    fuelPlans,

    tollAnalyses,

    lodgingPlans,

    costAnalysis,

    kpis,

    alerts,

    excluded,

    unresolved,

    timings: {
      totalMs:
        Date.now() -
        startedAt
    },

    metadata: {
      motor:
        OPERATIONAL_ENGINE_NAME,

      motorVersion:
        OPERATIONAL_ENGINE_VERSION,

      integrationMode:
        'ENRICH_EXISTING_CORE',

      progressiveEnrichment:
        true,

      /*
       * REGLAS NO NEGOCIABLES.
       */
      optionalModulesBlocking:
        false,

      operatorDatabaseRequired:
        false,

      vehicleDatabaseRequired:
        false,

      routeCalculationPreserved:
        true,

      capabilities
    }
  })
}

/**
 * Alias público.
 */
export const operationalEngine =
  Object.freeze({
    analyze:
      analyzeComputedOperation,

    analyzeComputed:
      analyzeComputedOperation
  })

export default operationalEngine