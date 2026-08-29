// backend/routing/providers/googleOptimizationPlanner.provider.js

/**
 * ============================================================
 * GOOGLE OPTIMIZATION PLANNER PROVIDER
 * ============================================================
 *
 * Solver especializado para:
 *
 * automaticResourcePlanner.service.js
 *
 * ROUND_TRIP:
 *
 * - cobertura obligatoria
 * - salida desde origen
 * - regreso al mismo origen
 * - llegada a unidades dentro del horario normal
 * - jornada normal preferida
 * - margen controlado para terminar servicio y regresar
 *
 * IMPORTANTE:
 *
 * Los vehículos creados aquí son RECURSOS VIRTUALES
 * DE PLANIFICACIÓN.
 *
 * No representan vehículos registrados en BD.
 */

export const GOOGLE_OPTIMIZATION_PLANNER_SOURCE =
  'GOOGLE_ROUTE_OPTIMIZATION'

export const GOOGLE_OPTIMIZATION_BASE_URL =
  'https://routeoptimization.googleapis.com/v1'

export const GOOGLE_OPTIMIZATION_SEARCH_MODE =
  Object.freeze({
    SEARCH:
      'RETURN_FAST',

    FINAL_QUALITY:
      'CONSUME_ALL_AVAILABLE_TIME'
  })

export const GOOGLE_OPTIMIZATION_SOLVING_MODE =
  'DEFAULT_SOLVE'

export const GOOGLE_OPTIMIZATION_DEFAULTS =
  Object.freeze({
    timeZone:
      'America/Mexico_City',

    startClock:
      '08:00',

    lastArrivalClock:
      '16:00',

    shiftHours:
      8,

    serviceMinutesPerUnit:
      45,

    /*
     * Margen estándar para:
     *
     * - terminar el último servicio
     * - regresar al origen
     *
     * NO para seguir agregando entregas.
     */
    returnGraceMinutes:
      90,

    /*
     * Techo configurable recomendado.
     */
    maxReturnGraceMinutes:
      120,

    /*
     * ========================================================
     * COSTOS DEL SOLVER
     * ========================================================
     *
     * NO SON MXN.
     *
     * Son pesos relativos dentro de la función
     * objetivo matemática.
     */
    solverFixedCost:
      10000,

    solverCostPerHour:
      100,

    solverCostPerTraveledHour:
      25,

    solverCostPerKilometer:
      1,

    /*
     * Penalización por utilizar tiempo después
     * de la jornada preferente.
     */
    solverCostPerHourAfterSoftMax:
      500,

    considerRoadTraffic:
      true,

    avoidTolls:
      false,

    maxValidationErrors:
      20
  })

/**
 * ============================================================
 * ERROR
 * ============================================================
 */

export class GoogleOptimizationPlannerError
  extends Error {
  constructor(
    message,
    {
      code =
        'GOOGLE_OPTIMIZATION_PLANNER_ERROR',

      status =
        null,

      details =
        null,

      retryable =
        false
    } = {}
  ) {
    super(
      message
    )

    this.name =
      'GoogleOptimizationPlannerError'

    this.code =
      code

    this.status =
      status

    this.details =
      details

    this.retryable =
      retryable
  }
}

/**
 * ============================================================
 * ENV
 * ============================================================
 */

function getGoogleApiKey() {
  const value =
    String(
      process.env
        .GMAPS_API_KEY ||
      ''
    )
      .trim()

  if (
    !value
  ) {
    throw new GoogleOptimizationPlannerError(
      'Falta GMAPS_API_KEY para Google Route Optimization.',
      {
        code:
          'GMAPS_API_KEY_MISSING'
      }
    )
  }

  return value
}

function getGoogleCloudProjectId() {
  const value =
    String(
      process.env
        .GOOGLE_CLOUD_PROJECT_ID ||
      ''
    )
      .trim()

  if (
    !value
  ) {
    throw new GoogleOptimizationPlannerError(
      'Falta GOOGLE_CLOUD_PROJECT_ID para Google Route Optimization.',
      {
        code:
          'GOOGLE_CLOUD_PROJECT_ID_MISSING'
      }
    )
  }

  return value
}

/**
 * ============================================================
 * NORMALIZACIÓN
 * ============================================================
 */

function normalizePositiveNumber(
  value,
  fallback
) {
  const number =
    Number(
      value
    )

  if (
    !Number.isFinite(
      number
    ) ||
    number <=
      0
  ) {
    return fallback
  }

  return number
}

function normalizeNonNegativeNumber(
  value,
  fallback = 0
) {
  const number =
    Number(
      value
    )

  if (
    !Number.isFinite(
      number
    ) ||
    number <
      0
  ) {
    return fallback
  }

  return number
}

function normalizePositiveInteger(
  value,
  fallback
) {
  const number =
    Math.floor(
      Number(
        value
      )
    )

  if (
    !Number.isFinite(
      number
    ) ||
    number <
      1
  ) {
    return fallback
  }

  return number
}

function normalizeBoolean(
  value,
  fallback = false
) {
  if (
    typeof value ===
    'boolean'
  ) {
    return value
  }

  return fallback
}

function toDuration(
  seconds
) {
  const normalized =
    Math.max(
      0,
      Number(
        seconds
      ) ||
      0
    )

  return `${Math.round(normalized)}s`
}

function parseDurationSeconds(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return null
  }

  const numeric =
    Number(
      value
    )

  if (
    Number.isFinite(
      numeric
    )
  ) {
    return Math.max(
      0,
      numeric
    )
  }

  const text =
    String(
      value
    )
      .trim()

  if (
    !text.endsWith(
      's'
    )
  ) {
    return null
  }

  const parsed =
    Number(
      text.slice(
        0,
        -1
      )
    )

  return Number.isFinite(
    parsed
  )
    ? Math.max(
        0,
        parsed
      )
    : null
}

/**
 * ============================================================
 * COORDENADAS
 * ============================================================
 */

function isValidLatLng(
  point
) {
  const lat =
    Number(
      point?.lat ??
      point?.latitude
    )

  const lng =
    Number(
      point?.lng ??
      point?.longitude
    )

  return (
    Number.isFinite(
      lat
    ) &&
    Number.isFinite(
      lng
    ) &&
    lat >=
      -90 &&
    lat <=
      90 &&
    lng >=
      -180 &&
    lng <=
      180
  )
}

function toLatLng(
  point
) {
  if (
    !isValidLatLng(
      point
    )
  ) {
    throw new GoogleOptimizationPlannerError(
      'Se recibió una coordenada inválida.',
      {
        code:
          'INVALID_LAT_LNG',

        details:
          point
      }
    )
  }

  return {
    latitude:
      Number(
        point.lat ??
        point.latitude
      ),

    longitude:
      Number(
        point.lng ??
        point.longitude
      )
  }
}

function getPointKey(
  point,
  index
) {
  if (
    point?.__plannerKey
  ) {
    return String(
      point.__plannerKey
    )
  }

  if (
    point?.id !==
      null &&
    point?.id !==
      undefined
  ) {
    return (
      `id:${String(point.id)}`
    )
  }

  return [
    'geo',
    Number(
      point?.lat
    ),
    Number(
      point?.lng
    ),
    index
  ].join(':')
}

/**
 * ============================================================
 * CLOCK
 * ============================================================
 */

function parseClock(
  value,
  fallback
) {
  const text =
    String(
      value ||
      fallback
    )
      .trim()

  const match =
    text.match(
      /^(\d{1,2}):(\d{2})$/
    )

  if (
    !match
  ) {
    return parseClock(
      fallback,
      '08:00'
    )
  }

  const hour =
    Number(
      match[1]
    )

  const minute =
    Number(
      match[2]
    )

  if (
    hour <
      0 ||
    hour >
      23 ||
    minute <
      0 ||
    minute >
      59
  ) {
    return parseClock(
      fallback,
      '08:00'
    )
  }

  return {
    hour,
    minute
  }
}

/**
 * ============================================================
 * TIMEZONE
 * ============================================================
 */

function getZonedParts(
  date,
  timeZone
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        second:
          '2-digit',

        hourCycle:
          'h23'
      }
    )

  const parts =
    formatter
      .formatToParts(
        date
      )

  const result =
    {}

  for (
    const part
    of parts
  ) {
    if (
      part.type ===
      'literal'
    ) {
      continue
    }

    result[
      part.type
    ] =
      Number(
        part.value
      )
  }

  return result
}

function zonedLocalToUtc({
  year,
  month,
  day,
  hour,
  minute,
  second = 0,
  timeZone
}) {
  const targetAsUtc =
    Date.UTC(
      year,
      month -
        1,
      day,
      hour,
      minute,
      second
    )

  let guess =
    targetAsUtc

  for (
    let iteration = 0;
    iteration <
      4;
    iteration++
  ) {
    const observed =
      getZonedParts(
        new Date(
          guess
        ),
        timeZone
      )

    const observedAsUtc =
      Date.UTC(
        observed.year,
        observed.month -
          1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second
      )

    const delta =
      targetAsUtc -
      observedAsUtc

    guess +=
      delta

    if (
      Math.abs(
        delta
      ) <
      1000
    ) {
      break
    }
  }

  return new Date(
    guess
  )
}

function getLocalCalendarDate(
  date,
  timeZone
) {
  const parts =
    getZonedParts(
      date,
      timeZone
    )

  return {
    year:
      parts.year,

    month:
      parts.month,

    day:
      parts.day
  }
}

function addCalendarDays(
  calendarDate,
  days
) {
  const base =
    new Date(
      Date.UTC(
        calendarDate.year,
        calendarDate.month -
          1,
        calendarDate.day
      )
    )

  base.setUTCDate(
    base.getUTCDate() +
    Number(
      days ||
      0
    )
  )

  return {
    year:
      base.getUTCFullYear(),

    month:
      base.getUTCMonth() +
      1,

    day:
      base.getUTCDate()
  }
}

/**
 * ============================================================
 * JORNADA
 * ============================================================
 *
 * Ejemplo:
 *
 * 08:00 inicio
 *
 * 16:00 fin preferente
 *
 * 16:00 última llegada permitida
 *
 * 17:30 cierre máximo con margen
 */

export function buildGoogleOptimizationPlanningWindow({
  planningDate = null,

  timeZone =
    process.env
      .ROUTING_TIME_ZONE ||
    GOOGLE_OPTIMIZATION_DEFAULTS
      .timeZone,

  startClock =
    GOOGLE_OPTIMIZATION_DEFAULTS
      .startClock,

  lastArrivalClock =
    GOOGLE_OPTIMIZATION_DEFAULTS
      .lastArrivalClock,

  shiftHours =
    GOOGLE_OPTIMIZATION_DEFAULTS
      .shiftHours,

  returnGraceMinutes =
    GOOGLE_OPTIMIZATION_DEFAULTS
      .returnGraceMinutes,

  maxReturnGraceMinutes =
    GOOGLE_OPTIMIZATION_DEFAULTS
      .maxReturnGraceMinutes
} = {}) {
  /*
   * Validación de timezone IANA.
   */
  try {
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone
      }
    ).format(
      new Date()
    )
  } catch {
    throw new GoogleOptimizationPlannerError(
      `Timezone IANA inválido: ${timeZone}`,
      {
        code:
          'INVALID_TIME_ZONE'
      }
    )
  }

  let calendarDate

  if (
    planningDate
  ) {
    const match =
      String(
        planningDate
      )
        .trim()
        .match(
          /^(\d{4})-(\d{2})-(\d{2})$/
        )

    if (
      !match
    ) {
      throw new GoogleOptimizationPlannerError(
        'planningDate debe usar formato YYYY-MM-DD.',
        {
          code:
            'INVALID_PLANNING_DATE'
        }
      )
    }

    calendarDate = {
      year:
        Number(
          match[1]
        ),

      month:
        Number(
          match[2]
        ),

      day:
        Number(
          match[3]
        )
    }
  } else {
    const today =
      getLocalCalendarDate(
        new Date(),
        timeZone
      )

    calendarDate =
      addCalendarDays(
        today,
        1
      )
  }

  const start =
    parseClock(
      startClock,
      '08:00'
    )

  const lastArrival =
    parseClock(
      lastArrivalClock,
      '16:00'
    )

  const startDate =
    zonedLocalToUtc({
      ...calendarDate,

      hour:
        start.hour,

      minute:
        start.minute,

      timeZone
    })

  const normalizedShiftHours =
    normalizePositiveNumber(
      shiftHours,
      GOOGLE_OPTIMIZATION_DEFAULTS
        .shiftHours
    )

  const shiftSeconds =
    Math.round(
      normalizedShiftHours *
      3600
    )

  const configuredMaxGrace =
    normalizeNonNegativeNumber(
      maxReturnGraceMinutes,
      GOOGLE_OPTIMIZATION_DEFAULTS
        .maxReturnGraceMinutes
    )

  const requestedGrace =
    normalizeNonNegativeNumber(
      returnGraceMinutes,
      GOOGLE_OPTIMIZATION_DEFAULTS
        .returnGraceMinutes
    )

  /*
   * Nunca exceder el máximo permitido.
   */
  const configuredGrace =
    Math.min(
      requestedGrace,
      configuredMaxGrace
    )

  const returnGraceSeconds =
    Math.round(
      configuredGrace *
      60
    )

  /*
   * 16:00 en ejemplo estándar.
   */
  const normalShiftEndDate =
    new Date(
      startDate.getTime() +
      shiftSeconds *
      1000
    )

  /*
   * 17:30 con 90 minutos de margen.
   */
  const hardEndDate =
    new Date(
      normalShiftEndDate.getTime() +
      returnGraceSeconds *
      1000
    )

  const requestedLastArrivalDate =
    zonedLocalToUtc({
      ...calendarDate,

      hour:
        lastArrival.hour,

      minute:
        lastArrival.minute,

      timeZone
    })

  /*
   * Una llegada nueva jamás puede ocurrir
   * después del final de jornada ordinaria.
   */
  const effectiveLastArrivalDate =
    new Date(
      Math.min(
        requestedLastArrivalDate
          .getTime(),

        normalShiftEndDate
          .getTime()
      )
    )

  return {
    planningDate:
      [
        calendarDate.year,

        String(
          calendarDate.month
        ).padStart(
          2,
          '0'
        ),

        String(
          calendarDate.day
        ).padStart(
          2,
          '0'
        )
      ].join('-'),

    timeZone,

    globalStartTime:
      startDate
        .toISOString(),

    normalShiftEndTime:
      normalShiftEndDate
        .toISOString(),

    lastArrivalTime:
      effectiveLastArrivalDate
        .toISOString(),

    /*
     * Global end SÍ incluye
     * margen de regreso.
     */
    globalEndTime:
      hardEndDate
        .toISOString(),

    shiftSeconds,

    returnGraceMinutes:
      configuredGrace,

    returnGraceSeconds,

    maxReturnGraceMinutes:
      configuredMaxGrace,

    maxRouteSeconds:
      shiftSeconds +
      returnGraceSeconds
  }
}

/**
 * ============================================================
 * SCORE MODEL
 * ============================================================
 */

export function normalizeOptimizationScoreModel(
  scoreModel = {}
) {
  return {
    fixedCost:
      normalizePositiveNumber(
        scoreModel.fixedCost,
        GOOGLE_OPTIMIZATION_DEFAULTS
          .solverFixedCost
      ),

    costPerHour:
      normalizePositiveNumber(
        scoreModel.costPerHour,
        GOOGLE_OPTIMIZATION_DEFAULTS
          .solverCostPerHour
      ),

    costPerTraveledHour:
      normalizePositiveNumber(
        scoreModel.costPerTraveledHour,
        GOOGLE_OPTIMIZATION_DEFAULTS
          .solverCostPerTraveledHour
      ),

    costPerKilometer:
      normalizePositiveNumber(
        scoreModel.costPerKilometer,
        GOOGLE_OPTIMIZATION_DEFAULTS
          .solverCostPerKilometer
      ),

    costPerHourAfterSoftMax:
      normalizePositiveNumber(
        scoreModel
          .costPerHourAfterSoftMax,
        GOOGLE_OPTIMIZATION_DEFAULTS
          .solverCostPerHourAfterSoftMax
      )
  }
}

/**
 * ============================================================
 * SHIPMENTS
 * ============================================================
 */

export function buildMandatoryOptimizationShipments({
  points = [],

  serviceSeconds,

  deliveryStartTime,

  deliveryEndTime
} = {}) {
  return (
    Array.isArray(
      points
    )
      ? points
      : []
  )
    .map(
      (
        point,
        index
      ) => {
        const pointKey =
          getPointKey(
            point,
            index
          )

        const delivery = {
          arrivalLocation:
            toLatLng(
              point
            ),

          duration:
            toDuration(
              serviceSeconds
            ),

          label:
            pointKey
        }

        if (
          deliveryStartTime &&
          deliveryEndTime
        ) {
          delivery.timeWindows = [
            {
              startTime:
                deliveryStartTime,

              /*
               * Límite de ARRIBO.
               *
               * El servicio puede continuar
               * después de esta hora.
               */
              endTime:
                deliveryEndTime
            }
          ]
        }

        return {
          label:
            pointKey,

          deliveries: [
            delivery
          ]

          /*
           * SIN penaltyCost.
           *
           * Esto hace obligatoria
           * la cobertura.
           */
        }
      }
    )
}

/**
 * ============================================================
 * VEHÍCULOS VIRTUALES
 * ============================================================
 */

export function buildVirtualRoundTripVehicles({
  origin,

  candidateResourceCount,

  preferredRouteDurationSeconds,

  maxRouteDurationSeconds,

  routeStartTime = null,

  scoreModel = {},

  avoidTolls = false
} = {}) {
  const count =
    normalizePositiveInteger(
      candidateResourceCount,
      1
    )

  const score =
    normalizeOptimizationScoreModel(
      scoreModel
    )

  const location =
    toLatLng(
      origin
    )

  const preferredDuration =
    Math.max(
      0,
      Number(
        preferredRouteDurationSeconds
      ) ||
      0
    )

  const maxDuration =
    Math.max(
      preferredDuration,

      Number(
        maxRouteDurationSeconds
      ) ||
      preferredDuration
    )

  return Array.from(
    {
      length:
        count
    },

    (
      _,
      index
    ) => {
      /*
       * Restricción dura.
       */
      const routeDurationLimit = {
        maxDuration:
          toDuration(
            maxDuration
          )
      }

      /*
       * Si existe margen:
       *
       * 8h = preferente
       * 9h30 = límite duro
       */
      if (
        maxDuration >
        preferredDuration
      ) {
        routeDurationLimit
          .softMaxDuration =
            toDuration(
              preferredDuration
            )

        routeDurationLimit
          .costPerHourAfterSoftMax =
            score
              .costPerHourAfterSoftMax
      }

      const vehicle = {
        label:
          `PLANNING_ROUTE_${index + 1}`,

        /*
         * Ida y vuelta:
         *
         * origen = destino final.
         */
        startLocation: {
          ...location
        },

        endLocation: {
          ...location
        },

        travelMode:
          'DRIVING',

        /*
         * Costos relativos del solver.
         */
        fixedCost:
          score.fixedCost,

        costPerHour:
          score.costPerHour,

        costPerTraveledHour:
          score.costPerTraveledHour,

        costPerKilometer:
          score.costPerKilometer,

        routeDurationLimit,

        /*
         * Si no tiene visitas,
         * no cuenta como utilizado.
         */
        usedIfRouteIsEmpty:
          false,

        routeModifiers: {
          avoidTolls:
            Boolean(
              avoidTolls
            )
        }
      }

      /*
       * Todos salen al inicio de jornada.
       *
       * Así evitamos que Google retrase
       * artificialmente una ruta.
       */
      if (
        routeStartTime
      ) {
        vehicle.startTimeWindows = [
          {
            startTime:
              routeStartTime,

            endTime:
              routeStartTime
          }
        ]
      }

      return vehicle
    }
  )
}

/**
 * ============================================================
 * TIMEOUT
 * ============================================================
 */

export function resolveOptimizationTimeoutSeconds({
  pointCount,
  solveMode
} = {}) {
  const count =
    Math.max(
      1,
      Number(
        pointCount
      ) ||
      1
    )

  const finalQuality =
    solveMode ===
    'FINAL_QUALITY'

  if (
    count <=
    8
  ) {
    return finalQuality
      ? 8
      : 3
  }

  if (
    count <=
    32
  ) {
    return finalQuality
      ? 20
      : 8
  }

  if (
    count <=
    100
  ) {
    return finalQuality
      ? 60
      : 20
  }

  if (
    count <=
    1000
  ) {
    return finalQuality
      ? 180
      : 60
  }

  return finalQuality
    ? 360
    : 120
}

/**
 * ============================================================
 * REQUEST
 * ============================================================
 */

export function buildGoogleOptimizationPlannerRequest({
  origin,

  points = [],

  candidateResourceCount,

  maxActiveResources =
    candidateResourceCount,

  workday = {},

  solveMode =
    'SEARCH',

  planningDate =
    null,

  timeZone =
    workday.timeZone ||
    process.env
      .ROUTING_TIME_ZONE ||
    GOOGLE_OPTIMIZATION_DEFAULTS
      .timeZone,

  scoreModel = {},

  avoidTolls =
    false,

  considerRoadTraffic =
    GOOGLE_OPTIMIZATION_DEFAULTS
      .considerRoadTraffic,

  label =
    null
} = {}) {
  if (
    !isValidLatLng(
      origin
    )
  ) {
    throw new GoogleOptimizationPlannerError(
      'El origen del planificador no contiene coordenadas válidas.',
      {
        code:
          'INVALID_ORIGIN'
      }
    )
  }

  const validPoints =
    (
      Array.isArray(
        points
      )
        ? points
        : []
    )
      .filter(
        isValidLatLng
      )

  if (
    !validPoints.length
  ) {
    throw new GoogleOptimizationPlannerError(
      'No existen destinos válidos para Route Optimization.',
      {
        code:
          'NO_VALID_DESTINATIONS'
      }
    )
  }

  const resourceCount =
    normalizePositiveInteger(
      candidateResourceCount,
      1
    )

  const maxActiveVehicles =
    Math.min(
      resourceCount,

      normalizePositiveInteger(
        maxActiveResources,
        resourceCount
      )
    )

  const shiftHours =
    normalizePositiveNumber(
      workday.shiftHours,
      GOOGLE_OPTIMIZATION_DEFAULTS
        .shiftHours
    )

  const serviceMinutes =
    normalizePositiveNumber(
      workday.serviceMinutesPerUnit,
      GOOGLE_OPTIMIZATION_DEFAULTS
        .serviceMinutesPerUnit
    )

  const returnGraceMinutes =
    normalizeNonNegativeNumber(
      workday.returnGraceMinutes,
      GOOGLE_OPTIMIZATION_DEFAULTS
        .returnGraceMinutes
    )

  const maxReturnGraceMinutes =
    normalizeNonNegativeNumber(
      workday.maxReturnGraceMinutes,
      GOOGLE_OPTIMIZATION_DEFAULTS
        .maxReturnGraceMinutes
    )

  const window =
    buildGoogleOptimizationPlanningWindow({
      planningDate,

      timeZone,

      startClock:
        workday.startClock ||
        GOOGLE_OPTIMIZATION_DEFAULTS
          .startClock,

      lastArrivalClock:
        workday.lastArrivalClock ||
        GOOGLE_OPTIMIZATION_DEFAULTS
          .lastArrivalClock,

      shiftHours,

      returnGraceMinutes,

      maxReturnGraceMinutes
    })

  const shipments =
    buildMandatoryOptimizationShipments({
      points:
        validPoints,

      serviceSeconds:
        serviceMinutes *
        60,

      deliveryStartTime:
        window.globalStartTime,

      /*
       * No se permiten nuevas llegadas
       * después del límite normal.
       */
      deliveryEndTime:
        window.lastArrivalTime
    })

  const vehicles =
    buildVirtualRoundTripVehicles({
      origin,

      candidateResourceCount:
        resourceCount,

      /*
       * 8 horas preferentes.
       */
      preferredRouteDurationSeconds:
        window.shiftSeconds,

      /*
       * 9h30 con configuración estándar.
       */
      maxRouteDurationSeconds:
        window.maxRouteSeconds,

      routeStartTime:
        window.globalStartTime,

      scoreModel,

      avoidTolls
    })

  const searchMode =
    solveMode ===
      'FINAL_QUALITY'
      ? GOOGLE_OPTIMIZATION_SEARCH_MODE
          .FINAL_QUALITY
      : GOOGLE_OPTIMIZATION_SEARCH_MODE
          .SEARCH

  const timeoutSeconds =
    resolveOptimizationTimeoutSeconds({
      pointCount:
        validPoints.length,

      solveMode
    })

  const request = {
    timeout:
      `${timeoutSeconds}s`,

    solvingMode:
      GOOGLE_OPTIMIZATION_SOLVING_MODE,

    searchMode,

    considerRoadTraffic:
      normalizeBoolean(
        considerRoadTraffic,
        true
      ),

    populatePolylines:
      solveMode ===
      'FINAL_QUALITY',

    populateTransitionPolylines:
      false,

    maxValidationErrors:
      GOOGLE_OPTIMIZATION_DEFAULTS
        .maxValidationErrors,

    model: {
      /*
       * 08:00
       */
      globalStartTime:
        window.globalStartTime,

      /*
       * 17:30 estándar.
       *
       * Incluye margen de regreso.
       */
      globalEndTime:
        window.globalEndTime,

      shipments,

      vehicles,

      maxActiveVehicles
    }
  }

  if (
    label
  ) {
    request.label =
      String(
        label
      )
  }

  return {
    request,

    metadata: {
      planningDate:
        window.planningDate,

      timeZone:
        window.timeZone,

      globalStartTime:
        window.globalStartTime,

      normalShiftEndTime:
        window.normalShiftEndTime,

      lastArrivalTime:
        window.lastArrivalTime,

      globalEndTime:
        window.globalEndTime,

      shiftSeconds:
        window.shiftSeconds,

      returnGraceMinutes:
        window.returnGraceMinutes,

      returnGraceSeconds:
        window.returnGraceSeconds,

      maxReturnGraceMinutes:
        window.maxReturnGraceMinutes,

      maxRouteSeconds:
        window.maxRouteSeconds,

      candidateResourceCount:
        resourceCount,

      maxActiveVehicles,

      pointCount:
        validPoints.length,

      searchMode,

      timeoutSeconds
    }
  }
}

/**
 * ============================================================
 * HTTP
 * ============================================================
 */

function isRetryableStatus(
  status
) {
  return (
    status ===
      408 ||
    status ===
      429 ||
    status ===
      500 ||
    status ===
      502 ||
    status ===
      503 ||
    status ===
      504
  )
}

export async function callGoogleOptimizationPlanner({
  request,

  signal
} = {}) {
  const projectId =
    getGoogleCloudProjectId()

  const apiKey =
    getGoogleApiKey()

  const encodedProject =
    encodeURIComponent(
      projectId
    )

  const url =
    `${GOOGLE_OPTIMIZATION_BASE_URL}/projects/${encodedProject}:optimizeTours`

  let response

  try {
    response =
      await fetch(
        url,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'X-Goog-Api-Key':
              apiKey
          },

          body:
            JSON.stringify(
              request
            ),

          signal
        }
      )
  } catch (
    error
  ) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw error
    }

    throw new GoogleOptimizationPlannerError(
      'No fue posible conectar con Google Route Optimization.',
      {
        code:
          'GOOGLE_OPTIMIZATION_NETWORK_ERROR',

        details:
          error?.message ||
          String(
            error
          ),

        retryable:
          true
      }
    )
  }

  const text =
    await response.text()

  let data

  try {
    data =
      text
        ? JSON.parse(
            text
          )
        : {}
  } catch {
    throw new GoogleOptimizationPlannerError(
      'Google Route Optimization devolvió una respuesta no JSON.',
      {
        code:
          'GOOGLE_OPTIMIZATION_NON_JSON',

        status:
          response.status,

        details:
          text.slice(
            0,
            1000
          ),

        retryable:
          isRetryableStatus(
            response.status
          )
      }
    )
  }

  if (
    !response.ok
  ) {
    throw new GoogleOptimizationPlannerError(
      `Google Route Optimization respondió HTTP ${response.status}.`,
      {
        code:
          'GOOGLE_OPTIMIZATION_HTTP_ERROR',

        status:
          response.status,

        details:
          data,

        retryable:
          isRetryableStatus(
            response.status
          )
      }
    )
  }

  return data
}

/**
 * ============================================================
 * RESPONSE
 * ============================================================
 */

function getRouteDurationSeconds(
  route
) {
  const metricDuration =
    parseDurationSeconds(
      route
        ?.metrics
        ?.totalDuration
    )

  if (
    metricDuration !==
    null
  ) {
    return metricDuration
  }

  if (
    route?.vehicleStartTime &&
    route?.vehicleEndTime
  ) {
    const start =
      Date.parse(
        route.vehicleStartTime
      )

    const end =
      Date.parse(
        route.vehicleEndTime
      )

    if (
      Number.isFinite(
        start
      ) &&
      Number.isFinite(
        end
      ) &&
      end >=
        start
    ) {
      return (
        end -
        start
      ) /
      1000
    }
  }

  return null
}

function getRouteDistanceMeters(
  route
) {
  const value =
    Number(
      route
        ?.metrics
        ?.travelDistanceMeters
    )

  return Number.isFinite(
    value
  )
    ? Math.max(
        0,
        value
      )
    : null
}

function resolveVisitPointKey({
  visit,

  shipments
}) {
  if (
    visit?.shipmentLabel
  ) {
    return String(
      visit.shipmentLabel
    )
  }

  if (
    visit?.visitLabel
  ) {
    return String(
      visit.visitLabel
    )
  }

  const shipmentIndex =
    Number(
      visit?.shipmentIndex
    )

  if (
    Number.isInteger(
      shipmentIndex
    ) &&
    shipmentIndex >=
      0
  ) {
    const shipment =
      shipments[
        shipmentIndex
      ]

    if (
      shipment?.label
    ) {
      return String(
        shipment.label
      )
    }
  }

  return null
}

function resolveSkippedPointKey({
  skipped,

  shipments
}) {
  if (
    skipped?.label
  ) {
    return String(
      skipped.label
    )
  }

  const index =
    Number(
      skipped?.index
    )

  if (
    Number.isInteger(
      index
    ) &&
    index >=
      0
  ) {
    const shipment =
      shipments[
        index
      ]

    if (
      shipment?.label
    ) {
      return String(
        shipment.label
      )
    }
  }

  return null
}

export function normalizeGoogleOptimizationPlannerResponse({
  response = {},

  request = {},

  metadata = {}
} = {}) {
  const shipments =
    Array.isArray(
      request
        ?.model
        ?.shipments
    )
      ? request
          .model
          .shipments
      : []

  /*
   * Google puede devolver rutas vacías
   * para recursos no utilizados.
   *
   * Sólo conservamos las que
   * contienen visitas.
   */
  const routes =
    (
      Array.isArray(
        response?.routes
      )
        ? response.routes
        : []
    )
      .map(
        (
          route,
          index
        ) => {
          const visits =
            Array.isArray(
              route?.visits
            )
              ? route.visits
              : []

          const pointKeys =
            visits
              .map(
                visit =>
                  resolveVisitPointKey({
                    visit,

                    shipments
                  })
              )
              .filter(
                Boolean
              )

          const durationSeconds =
            getRouteDurationSeconds(
              route
            )

          const preferredSeconds =
            Number(
              metadata
                .shiftSeconds
            )

          const maxSeconds =
            Number(
              metadata
                .maxRouteSeconds
            )

          let workdayStatus =
            'UNKNOWN'

          let graceUsedSeconds =
            null

          if (
            durationSeconds !==
              null &&
            Number.isFinite(
              preferredSeconds
            ) &&
            Number.isFinite(
              maxSeconds
            )
          ) {
            graceUsedSeconds =
              Math.max(
                0,

                durationSeconds -
                preferredSeconds
              )

            if (
              durationSeconds <=
              preferredSeconds
            ) {
              workdayStatus =
                'NORMAL'
            } else if (
              durationSeconds <=
              maxSeconds
            ) {
              workdayStatus =
                'EXTENDED_RETURN'
            } else {
              workdayStatus =
                'INFEASIBLE'
            }
          }

          return {
            vehicleIndex:
              Number.isInteger(
                Number(
                  route
                    ?.vehicleIndex
                )
              )
                ? Number(
                    route.vehicleIndex
                  )
                : index,

            vehicleLabel:
              route?.vehicleLabel ||
              `PLANNING_ROUTE_${index + 1}`,

            pointKeys,

            visits,

            transitions:
              Array.isArray(
                route?.transitions
              )
                ? route.transitions
                : [],

            durationSeconds,

            distanceMeters:
              getRouteDistanceMeters(
                route
              ),

            vehicleStartTime:
              route?.vehicleStartTime ||
              null,

            vehicleEndTime:
              route?.vehicleEndTime ||
              null,

            workdayStatus,

            graceUsedSeconds,

            graceUsedMinutes:
              graceUsedSeconds !==
                null
                ? (
                    Math.round(
                      (
                        graceUsedSeconds /
                        60
                      ) *
                      10
                    ) /
                    10
                  )
                : null,

            hasTrafficInfeasibilities:
              route
                ?.hasTrafficInfeasibilities ===
              true,

            polyline:
              route
                ?.routePolyline
                ?.points ||
              null,

            routeTotalCost:
              Number.isFinite(
                Number(
                  route
                    ?.routeTotalCost
                )
              )
                ? Number(
                    route.routeTotalCost
                  )
                : null,

            metrics:
              route?.metrics ||
              null,

            raw:
              route
          }
        }
      )
      .filter(
        route =>
          route.pointKeys.length >
          0
      )

  const skippedPointKeys =
    (
      Array.isArray(
        response
          ?.skippedShipments
      )
        ? response.skippedShipments
        : []
    )
      .map(
        skipped =>
          resolveSkippedPointKey({
            skipped,

            shipments
          })
      )
      .filter(
        Boolean
      )

  const validationErrors =
    Array.isArray(
      response
        ?.validationErrors
    )
      ? response.validationErrors
      : []

  const metrics =
    response?.metrics ||
    null

  const reportedUsedVehicles =
    Number(
      metrics
        ?.usedVehicleCount
    )

  const usedResourceCount =
    Number.isFinite(
      reportedUsedVehicles
    )
      ? Math.max(
          0,
          Math.round(
            reportedUsedVehicles
          )
        )
      : routes.length

  const hasTrafficInfeasibility =
    routes.some(
      route =>
        route
          .hasTrafficInfeasibilities ===
        true
    )

  const hasHardDurationViolation =
    routes.some(
      route =>
        route
          .workdayStatus ===
        'INFEASIBLE'
    )

  /*
   * La cobertura completa será validada
   * nuevamente por
   * automaticResourcePlanner.service.js.
   */
  const feasible =
    validationErrors.length ===
      0 &&
    skippedPointKeys.length ===
      0 &&
    routes.length >
      0 &&
    !hasTrafficInfeasibility &&
    !hasHardDurationViolation

  return {
    feasible,

    source:
      GOOGLE_OPTIMIZATION_PLANNER_SOURCE,

    routes,

    usedResourceCount,

    usedVehicleCount:
      usedResourceCount,

    skippedPointKeys,

    validationErrors,

    hasTrafficInfeasibility,

    hasHardDurationViolation,

    metrics,

    requestMetadata:
      metadata,

    raw:
      response
  }
}

/**
 * ============================================================
 * SOLVE
 * ============================================================
 */

export async function solveGoogleRoundTripScenario({
  origin,

  points,

  candidateResourceCount,

  maxActiveResources,

  workday,

  solveMode =
    'SEARCH',

  mandatoryCoverage =
    true,

  planningDate =
    null,

  timeZone =
    null,

  scoreModel = {},

  avoidTolls =
    false,

  considerRoadTraffic =
    true,

  signal
} = {}) {
  if (
    mandatoryCoverage !==
    true
  ) {
    throw new GoogleOptimizationPlannerError(
      'El planificador operativo requiere mandatoryCoverage=true.',
      {
        code:
          'MANDATORY_COVERAGE_REQUIRED'
      }
    )
  }

  const {
    request,
    metadata
  } =
    buildGoogleOptimizationPlannerRequest({
      origin,

      points,

      candidateResourceCount,

      maxActiveResources,

      workday,

      solveMode,

      planningDate,

      timeZone:
        timeZone ||
        workday?.timeZone ||
        process.env
          .ROUTING_TIME_ZONE ||
        GOOGLE_OPTIMIZATION_DEFAULTS
          .timeZone,

      scoreModel,

      avoidTolls,

      considerRoadTraffic,

      label:
        `ROUND_TRIP_${candidateResourceCount}_${solveMode}`
    })

  const response =
    await callGoogleOptimizationPlanner({
      request,

      signal
    })

  return normalizeGoogleOptimizationPlannerResponse({
    response,

    request,

    metadata
  })
}

/**
 * ============================================================
 * FACTORY
 * ============================================================
 */

export function createGoogleRoundTripSolveScenario({
  planningDate =
    null,

  timeZone =
    null,

  scoreModel = {},

  avoidTolls =
    false,

  considerRoadTraffic =
    true,

  signal =
    null
} = {}) {
  return async ({
    routeMode,

    origin,

    points,

    candidateResourceCount,

    maxActiveResources,

    workday,

    solveMode,

    mandatoryCoverage
  }) => {
    if (
      routeMode !==
      'ROUND_TRIP'
    ) {
      throw new GoogleOptimizationPlannerError(
        `Modo no soportado por este solver: ${routeMode}`,
        {
          code:
            'UNSUPPORTED_ROUTE_MODE'
        }
      )
    }

    return solveGoogleRoundTripScenario({
      origin,

      points,

      candidateResourceCount,

      maxActiveResources,

      workday,

      solveMode,

      mandatoryCoverage,

      planningDate,

      timeZone,

      scoreModel,

      avoidTolls,

      considerRoadTraffic,

      signal
    })
  }
}

export default Object.freeze({
  buildGoogleOptimizationPlanningWindow,
  normalizeOptimizationScoreModel,
  buildMandatoryOptimizationShipments,
  buildVirtualRoundTripVehicles,
  resolveOptimizationTimeoutSeconds,
  buildGoogleOptimizationPlannerRequest,
  callGoogleOptimizationPlanner,
  normalizeGoogleOptimizationPlannerResponse,
  solveGoogleRoundTripScenario,
  createGoogleRoundTripSolveScenario
})