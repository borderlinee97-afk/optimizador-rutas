// backend/routing/services/automaticResourcePlanner.service.js

import {
  ROUTE_OPERATION_MODE,
  RESOURCE_PLANNING_MODE,
  normalizePlanningPolicy
} from '../domain/planningPolicy.js'

import {
  isValidLatLng
} from '../utils/geo.js'

import {
  roundDecimal
} from '../utils/money.js'

/**
 * ============================================================
 * AUTOMATIC RESOURCE PLANNER
 * ============================================================
 *
 * Determina la cantidad mínima de recursos requerida
 * para ejecutar una operación.
 *
 * PRINCIPIO:
 *
 * El usuario proporciona:
 *
 * - demanda
 * - origen
 * - reglas operativas
 *
 * El motor determina:
 *
 * - rutas necesarias
 * - operadores requeridos
 * - vehículos requeridos
 *
 * NO depende de:
 *
 * - operadores registrados
 * - vehículos registrados
 * - plantilla disponible
 *
 * ============================================================
 * JORNADA FLEXIBLE ROUND_TRIP
 * ============================================================
 *
 * Ejemplo:
 *
 * Jornada normal:
 * 08:00 → 16:00
 *
 * Última llegada a una unidad:
 * ≤ 16:00
 *
 * Margen operativo de retorno:
 * 90 min por defecto
 *
 * Fin duro máximo:
 * 17:30
 *
 * Una ruta puede superar las 8 horas únicamente
 * dentro del margen permitido.
 *
 * La llegada a nuevas unidades después de la hora
 * límite NO está permitida.
 */

export const AUTO_PLANNER_STATUS =
  Object.freeze({
    FEASIBLE:
      'FEASIBLE',

    INFEASIBLE:
      'INFEASIBLE',

    INVALID_INPUT:
      'INVALID_INPUT',

    SOLVER_UNAVAILABLE:
      'SOLVER_UNAVAILABLE'
  })

export const AUTO_PLANNER_SOURCE =
  Object.freeze({
    ROUTE_OPTIMIZATION:
      'GOOGLE_ROUTE_OPTIMIZATION',

    FALLBACK:
      'FALLBACK',

    UNKNOWN:
      'UNKNOWN'
  })

export const AUTO_PLANNER_SOLVE_MODE =
  Object.freeze({
    SEARCH:
      'SEARCH',

    FINAL_QUALITY:
      'FINAL_QUALITY'
  })

export const ROUTE_WORKDAY_STATUS =
  Object.freeze({
    NORMAL:
      'NORMAL',

    EXTENDED_RETURN:
      'EXTENDED_RETURN',

    INFEASIBLE:
      'INFEASIBLE',

    UNKNOWN:
      'UNKNOWN'
  })

export const AUTO_PLANNER_DEFAULTS =
  Object.freeze({
    shiftHours:
      8,

    serviceMinutesPerUnit:
      45,

    /*
     * Margen operativo autorizado para
     * terminar servicio y regresar.
     */
    returnGraceMinutes:
      90,

    /*
     * Techo de configuración recomendado.
     *
     * El proyecto podrá definir un valor menor,
     * pero por defecto no permitiremos convertir
     * silenciosamente una jornada en una ruta
     * extremadamente larga.
     */
    maxReturnGraceMinutes:
      120,

    maxSolverCalls:
      8,

    finalQualityPass:
      true,

    /*
     * Tolerancia técnica exclusivamente para
     * redondeos entre APIs.
     *
     * No representa tiempo laboral adicional.
     */
    durationToleranceSeconds:
      60
  })

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizePositiveInteger(
  value,
  fallback = null
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

function normalizePositiveNumber(
  value,
  fallback = null
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

/**
 * Convierte:
 *
 * 3600
 * "3600"
 * "3600s"
 *
 * a segundos.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parsePlannerDurationSeconds(
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
 * Identificador interno estable.
 *
 * @param {object} point
 * @param {number} index
 * @returns {string}
 */
export function getPlannerPointKey(
  point,
  index = 0
) {
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
 * Normaliza destinos.
 *
 * @param {object[]} points
 * @returns {object}
 */
export function normalizePlannerPoints(
  points = []
) {
  const source =
    Array.isArray(
      points
    )
      ? points
      : []

  const valid =
    []

  const invalid =
    []

  source.forEach(
    (
      point,
      index
    ) => {
      if (
        !isValidLatLng(
          point
        )
      ) {
        invalid.push({
          index,
          point
        })

        return
      }

      valid.push({
        ...point,

        __plannerKey:
          getPlannerPointKey(
            point,
            index
          )
      })
    }
  )

  return {
    source,

    valid,

    invalid
  }
}

/**
 * ============================================================
 * JORNADA OPERATIVA
 * ============================================================
 */

export function normalizePlannerWorkday(
  workday = {}
) {
  const shiftHours =
    normalizePositiveNumber(
      workday.shiftHours,
      AUTO_PLANNER_DEFAULTS
        .shiftHours
    )

  const serviceMinutesPerUnit =
    normalizePositiveNumber(
      workday.serviceMinutesPerUnit,
      AUTO_PLANNER_DEFAULTS
        .serviceMinutesPerUnit
    )

  const maxReturnGraceMinutes =
    normalizeNonNegativeNumber(
      workday.maxReturnGraceMinutes,
      AUTO_PLANNER_DEFAULTS
        .maxReturnGraceMinutes
    )

  const requestedReturnGraceMinutes =
    normalizeNonNegativeNumber(
      workday.returnGraceMinutes,
      AUTO_PLANNER_DEFAULTS
        .returnGraceMinutes
    )

  /*
   * Seguridad:
   *
   * el margen utilizado nunca puede superar
   * el techo configurado.
   */
  const returnGraceMinutes =
    Math.min(
      requestedReturnGraceMinutes,
      maxReturnGraceMinutes
    )

  const shiftSeconds =
    Math.round(
      shiftHours *
      3600
    )

  const returnGraceSeconds =
    Math.round(
      returnGraceMinutes *
      60
    )

  const maxRouteSeconds =
    shiftSeconds +
    returnGraceSeconds

  return {
    shiftHours,

    shiftSeconds,

    serviceMinutesPerUnit,

    serviceSecondsPerUnit:
      serviceMinutesPerUnit *
      60,

    startClock:
      workday.startClock ||
      '08:00',

    lastArrivalClock:
      workday.lastArrivalClock ||
      '16:00',

    returnGraceMinutes,

    returnGraceSeconds,

    maxReturnGraceMinutes,

    /*
     * Preferencia:
     *
     * <= shiftSeconds
     */
    preferredRouteSeconds:
      shiftSeconds,

    /*
     * Restricción dura:
     *
     * <= jornada + margen
     */
    maxRouteSeconds
  }
}

/**
 * Clasifica duración de una ruta.
 *
 * @param {number|null} durationSeconds
 * @param {object} workday
 * @returns {object}
 */
export function classifyRouteWorkday(
  durationSeconds,
  workday
) {
  const normalizedWorkday =
    normalizePlannerWorkday(
      workday
    )

  if (
    durationSeconds ===
    null ||
    durationSeconds ===
    undefined ||
    !Number.isFinite(
      Number(
        durationSeconds
      )
    )
  ) {
    return {
      status:
        ROUTE_WORKDAY_STATUS
          .UNKNOWN,

      durationSeconds:
        null,

      graceUsedSeconds:
        null,

      graceUsedMinutes:
        null
    }
  }

  const duration =
    Math.max(
      0,
      Number(
        durationSeconds
      )
    )

  const graceUsedSeconds =
    Math.max(
      0,
      duration -
      normalizedWorkday
        .shiftSeconds
    )

  if (
    duration <=
    normalizedWorkday
      .shiftSeconds
  ) {
    return {
      status:
        ROUTE_WORKDAY_STATUS
          .NORMAL,

      durationSeconds:
        duration,

      graceUsedSeconds:
        0,

      graceUsedMinutes:
        0
    }
  }

  if (
    duration <=
    normalizedWorkday
      .maxRouteSeconds
  ) {
    return {
      status:
        ROUTE_WORKDAY_STATUS
          .EXTENDED_RETURN,

      durationSeconds:
        duration,

      graceUsedSeconds,

      graceUsedMinutes:
        roundDecimal(
          graceUsedSeconds /
          60,
          1
        )
    }
  }

  return {
    status:
      ROUTE_WORKDAY_STATUS
        .INFEASIBLE,

    durationSeconds:
      duration,

    graceUsedSeconds,

    graceUsedMinutes:
      roundDecimal(
        graceUsedSeconds /
        60,
        1
      )
  }
}

/**
 * ============================================================
 * LOWER BOUND
 * ============================================================
 *
 * Sólo es un límite matemático inferior.
 *
 * Usamos maxRouteSeconds, no únicamente
 * shiftSeconds.
 *
 * Motivo:
 *
 * una ruta puede iniciar su última visita antes
 * del límite y finalizar el servicio/retorno
 * durante el margen permitido.
 *
 * Utilizar sólo 8 h podría producir un lower bound
 * demasiado alto y descartar una solución factible.
 */

export function calculateRoundTripResourceLowerBound({
  points = [],
  workday = {},
  maxStopsPerRoute = null
} = {}) {
  const normalizedPoints =
    normalizePlannerPoints(
      points
    )

  const normalizedWorkday =
    normalizePlannerWorkday(
      workday
    )

  const pointCount =
    normalizedPoints
      .valid
      .length

  if (
    pointCount ===
    0
  ) {
    return {
      lowerBound:
        0,

      pointCount:
        0,

      totalServiceSeconds:
        0,

      serviceTimeBound:
        0,

      stopCountBound:
        0
    }
  }

  const totalServiceSeconds =
    pointCount *
    normalizedWorkday
      .serviceSecondsPerUnit

  const serviceTimeBound =
    Math.max(
      1,

      Math.ceil(
        totalServiceSeconds /
        normalizedWorkday
          .maxRouteSeconds
      )
    )

  const normalizedMaxStops =
    normalizePositiveInteger(
      maxStopsPerRoute
    )

  const stopCountBound =
    normalizedMaxStops
      ? Math.max(
          1,

          Math.ceil(
            pointCount /
            normalizedMaxStops
          )
        )
      : 1

  return {
    lowerBound:
      Math.max(
        1,
        serviceTimeBound,
        stopCountBound
      ),

    pointCount,

    totalServiceSeconds,

    serviceTimeBound,

    stopCountBound,

    preferredRouteSeconds:
      normalizedWorkday
        .preferredRouteSeconds,

    maxRouteSeconds:
      normalizedWorkday
        .maxRouteSeconds
  }
}

/**
 * ============================================================
 * SOLVER RESULT
 * ============================================================
 */

export function extractRoutePointKeys(
  route
) {
  if (
    Array.isArray(
      route?.pointKeys
    )
  ) {
    return route
      .pointKeys
      .map(
        String
      )
  }

  if (
    Array.isArray(
      route?.shipmentKeys
    )
  ) {
    return route
      .shipmentKeys
      .map(
        String
      )
  }

  if (
    Array.isArray(
      route?.points
    )
  ) {
    return route
      .points
      .map(
        (
          point,
          index
        ) =>
          point?.__plannerKey ||
          getPlannerPointKey(
            point,
            index
          )
      )
  }

  if (
    Array.isArray(
      route?.visits
    )
  ) {
    return route
      .visits
      .map(
        visit =>
          visit?.pointKey ??
          visit?.shipmentKey ??
          visit?.shipmentLabel ??
          visit?.label ??
          null
      )
      .filter(
        value =>
          value !==
            null &&
          value !==
            undefined
      )
      .map(
        value => {
          const text =
            String(
              value
            )

          return text.startsWith(
            'id:'
          )
            ? text
            : `id:${text}`
        }
      )
  }

  return []
}

/**
 * Obtiene duración de una ruta del solver.
 *
 * @param {object} route
 * @returns {number|null}
 */
export function getSolverRouteDurationSeconds(
  route
) {
  const direct = [
    route?.durationSeconds,
    route?.totalDurationSeconds,

    route
      ?.metrics
      ?.totalDurationSeconds,

    route
      ?.metrics
      ?.totalDuration
  ]

  for (
    const value
    of direct
  ) {
    const parsed =
      parsePlannerDurationSeconds(
        value
      )

    if (
      parsed !==
      null
    ) {
      return parsed
    }
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

/**
 * Valida cobertura.
 *
 * @param {object} params
 * @returns {object}
 */
export function validateSolverCoverage({
  points = [],
  routes = [],
  skippedPointKeys = []
} = {}) {
  const normalized =
    normalizePlannerPoints(
      points
    )

  const expected =
    normalized
      .valid
      .map(
        point =>
          point.__plannerKey
      )

  const assigned =
    (
      Array.isArray(
        routes
      )
        ? routes
        : []
    )
      .flatMap(
        extractRoutePointKeys
      )

  const expectedCounts =
    new Map()

  const assignedCounts =
    new Map()

  for (
    const key
    of expected
  ) {
    expectedCounts.set(
      key,
      (
        expectedCounts.get(
          key
        ) ||
        0
      ) +
      1
    )
  }

  for (
    const key
    of assigned
  ) {
    assignedCounts.set(
      key,
      (
        assignedCounts.get(
          key
        ) ||
        0
      ) +
      1
    )
  }

  const missing =
    []

  const duplicated =
    []

  const unexpected =
    []

  for (
    const [
      key,
      expectedCount
    ]
    of expectedCounts
  ) {
    const actualCount =
      assignedCounts.get(
        key
      ) ||
      0

    if (
      actualCount <
      expectedCount
    ) {
      missing.push({
        key,

        expected:
          expectedCount,

        actual:
          actualCount
      })
    }

    if (
      actualCount >
      expectedCount
    ) {
      duplicated.push({
        key,

        expected:
          expectedCount,

        actual:
          actualCount
      })
    }
  }

  for (
    const [
      key,
      actualCount
    ]
    of assignedCounts
  ) {
    if (
      !expectedCounts.has(
        key
      )
    ) {
      unexpected.push({
        key,

        actual:
          actualCount
      })
    }
  }

  const skipped =
    Array.isArray(
      skippedPointKeys
    )
      ? skippedPointKeys
          .map(
            String
          )
      : []

  const valid =
    expected.length >
      0 &&
    missing.length ===
      0 &&
    duplicated.length ===
      0 &&
    unexpected.length ===
      0 &&
    skipped.length ===
      0 &&
    assigned.length ===
      expected.length

  return {
    valid,

    expectedCount:
      expected.length,

    assignedCount:
      assigned.length,

    coveragePercent:
      expected.length >
        0
        ? (
            roundDecimal(
              Math.min(
                100,

                (
                  assigned.length /
                  expected.length
                ) *
                100
              ),
              2
            ) ??
            0
          )
        : 0,

    missing,

    duplicated,

    unexpected,

    skipped
  }
}

/**
 * ============================================================
 * WORKDAY VALIDATION
 * ============================================================
 *
 * NORMAL
 * <= jornada ordinaria.
 *
 * EXTENDED_RETURN
 * > jornada ordinaria
 * <= jornada + margen.
 *
 * INFEASIBLE
 * > límite duro.
 */

export function validateSolverWorkday({
  routes = [],
  workday = {},
  toleranceSeconds =
    AUTO_PLANNER_DEFAULTS
      .durationToleranceSeconds
} = {}) {
  const normalizedWorkday =
    normalizePlannerWorkday(
      workday
    )

  const safeRoutes =
    Array.isArray(
      routes
    )
      ? routes
      : []

  const violations =
    []

  const unknownDurationRoutes =
    []

  const routeStatuses =
    []

  let normalRoutes =
    0

  let extendedReturnRoutes =
    0

  let maxGraceUsedSeconds =
    0

  for (
    let index = 0;
    index <
      safeRoutes.length;
    index++
  ) {
    const route =
      safeRoutes[
        index
      ]

    const durationSeconds =
      getSolverRouteDurationSeconds(
        route
      )

    if (
      durationSeconds ===
      null
    ) {
      unknownDurationRoutes.push(
        index
      )

      routeStatuses.push({
        routeIndex:
          index,

        status:
          ROUTE_WORKDAY_STATUS
            .UNKNOWN,

        durationSeconds:
          null,

        graceUsedSeconds:
          null,

        graceUsedMinutes:
          null
      })

      continue
    }

    const preferredLimit =
      normalizedWorkday
        .shiftSeconds +
      toleranceSeconds

    const hardLimit =
      normalizedWorkday
        .maxRouteSeconds +
      toleranceSeconds

    let status

    let graceUsedSeconds =
      Math.max(
        0,
        durationSeconds -
        normalizedWorkday
          .shiftSeconds
      )

    if (
      durationSeconds <=
      preferredLimit
    ) {
      status =
        ROUTE_WORKDAY_STATUS
          .NORMAL

      normalRoutes++

      graceUsedSeconds =
        0
    } else if (
      durationSeconds <=
      hardLimit
    ) {
      status =
        ROUTE_WORKDAY_STATUS
          .EXTENDED_RETURN

      extendedReturnRoutes++

      maxGraceUsedSeconds =
        Math.max(
          maxGraceUsedSeconds,
          graceUsedSeconds
        )
    } else {
      status =
        ROUTE_WORKDAY_STATUS
          .INFEASIBLE

      violations.push({
        routeIndex:
          index,

        durationSeconds,

        preferredSeconds:
          normalizedWorkday
            .shiftSeconds,

        allowedSeconds:
          normalizedWorkday
            .maxRouteSeconds,

        exceededBySeconds:
          Math.max(
            0,
            durationSeconds -
            normalizedWorkday
              .maxRouteSeconds
          )
      })
    }

    routeStatuses.push({
      routeIndex:
        index,

      status,

      durationSeconds,

      graceUsedSeconds,

      graceUsedMinutes:
        roundDecimal(
          graceUsedSeconds /
          60,
          1
        )
    })
  }

  /*
   * Una duración desconocida no debe
   * certificarse como factible.
   */
  const valid =
    violations.length ===
      0 &&
    unknownDurationRoutes.length ===
      0

  return {
    valid,

    preferredShiftSeconds:
      normalizedWorkday
        .shiftSeconds,

    returnGraceSeconds:
      normalizedWorkday
        .returnGraceSeconds,

    maxRouteSeconds:
      normalizedWorkday
        .maxRouteSeconds,

    normalRoutes,

    extendedReturnRoutes,

    infeasibleRoutes:
      violations.length,

    unknownDurationRoutes,

    maxGraceUsedSeconds,

    maxGraceUsedMinutes:
      roundDecimal(
        maxGraceUsedSeconds /
        60,
        1
      ),

    routeStatuses,

    violations
  }
}

/**
 * Resultado normalizado.
 *
 * @param {object} params
 * @returns {object}
 */
export function normalizeSolverResult({
  raw = {},
  points = [],
  workday = {},
  candidateResourceCount
} = {}) {
  const routes =
    (
      Array.isArray(
        raw?.routes
      )
        ? raw.routes
        : []
    )
      .filter(
        route =>
          extractRoutePointKeys(
            route
          ).length >
          0
      )

  const skippedPointKeys =
    Array.isArray(
      raw?.skippedPointKeys
    )
      ? raw.skippedPointKeys
      : []

  const coverage =
    validateSolverCoverage({
      points,

      routes,

      skippedPointKeys
    })

  const workdayValidation =
    validateSolverWorkday({
      routes,

      workday
    })

  const validationErrors =
    Array.isArray(
      raw?.validationErrors
    )
      ? raw.validationErrors
      : []

  const reportedUsed =
    normalizePositiveInteger(
      raw?.usedResourceCount ??
      raw?.usedVehicleCount
    )

  const usedResourceCount =
    reportedUsed ??
    routes.length

  const feasible =
    raw?.feasible !==
      false &&
    validationErrors.length ===
      0 &&
    coverage.valid &&
    workdayValidation.valid &&
    usedResourceCount >=
      1 &&
    usedResourceCount <=
      candidateResourceCount

  return {
    feasible,

    source:
      raw?.source ||
      AUTO_PLANNER_SOURCE
        .UNKNOWN,

    candidateResourceCount,

    usedResourceCount,

    routes,

    coverage,

    workday:
      workdayValidation,

    validationErrors,

    solverMetrics:
      raw?.metrics ||
      null,

    raw
  }
}

/**
 * ============================================================
 * INPUT VALIDATION
 * ============================================================
 */

export function validateAutomaticPlannerInput({
  routeMode,
  origin,
  points,
  solveScenario
} = {}) {
  const errors =
    []

  if (
    routeMode !==
    ROUTE_OPERATION_MODE
      .ROUND_TRIP
  ) {
    errors.push({
      code:
        'UNSUPPORTED_ROUTE_MODE',

      message:
        'Esta fase del planificador automático sólo admite ROUND_TRIP.'
    })
  }

  if (
    !isValidLatLng(
      origin
    )
  ) {
    errors.push({
      code:
        'INVALID_ORIGIN',

      message:
        'El origen no contiene coordenadas válidas.'
    })
  }

  const normalized =
    normalizePlannerPoints(
      points
    )

  if (
    !normalized.valid.length
  ) {
    errors.push({
      code:
        'NO_VALID_POINTS',

      message:
        'No existen destinos válidos para planificar.'
    })
  }

  if (
    normalized.invalid.length
  ) {
    errors.push({
      code:
        'INVALID_POINTS_PRESENT',

      message:
        `${normalized.invalid.length} destino(s) no tienen coordenadas válidas.`
    })
  }

  if (
    typeof solveScenario !==
    'function'
  ) {
    errors.push({
      code:
        'SOLVER_REQUIRED',

      message:
        'No se proporcionó un solver para realizar la optimización.'
    })
  }

  return {
    valid:
      errors.length ===
      0,

    errors,

    points:
      normalized
  }
}

/**
 * ============================================================
 * SEARCH ALGORITHM
 * ============================================================
 */

export function getNextResourceCandidate(
  current,
  upper
) {
  return Math.min(
    upper,

    Math.max(
      current +
      1,

      Math.ceil(
        current *
        1.7
      )
    )
  )
}

/**
 * ============================================================
 * ROUND TRIP AUTO PLANNER
 * ============================================================
 */

export async function planAutomaticRoundTripResources({
  origin,

  points = [],

  workday = {},

  policy = {},

  maxStopsPerRoute = null,

  maxCandidateResources = null,

  maxSolverCalls =
    AUTO_PLANNER_DEFAULTS
      .maxSolverCalls,

  finalQualityPass =
    AUTO_PLANNER_DEFAULTS
      .finalQualityPass,

  solveScenario
} = {}) {
  const normalizedPolicy =
    normalizePlanningPolicy({
      ...policy,

      routeMode:
        ROUTE_OPERATION_MODE
          .ROUND_TRIP,

      resourcePlanningMode:
        RESOURCE_PLANNING_MODE
          .AUTO_REQUIREMENTS
    })

  const validation =
    validateAutomaticPlannerInput({
      routeMode:
        normalizedPolicy
          .routeMode,

      origin,

      points,

      solveScenario
    })

  if (
    !validation.valid
  ) {
    return {
      status:
        AUTO_PLANNER_STATUS
          .INVALID_INPUT,

      feasible:
        false,

      planningPolicy:
        normalizedPolicy,

      errors:
        validation.errors,

      solverCalls:
        0,

      searchTrace:
        []
    }
  }

  const normalizedPoints =
    validation
      .points
      .valid

  const normalizedWorkday =
    normalizePlannerWorkday(
      workday
    )

  const lowerBoundInfo =
    calculateRoundTripResourceLowerBound({
      points:
        normalizedPoints,

      workday:
        normalizedWorkday,

      maxStopsPerRoute
    })

  const pointCount =
    normalizedPoints.length

  const upperBound =
    Math.min(
      pointCount,

      normalizePositiveInteger(
        maxCandidateResources,
        pointCount
      )
    )

  const lowerBound =
    lowerBoundInfo
      .lowerBound

  if (
    lowerBound >
    upperBound
  ) {
    return {
      status:
        AUTO_PLANNER_STATUS
          .INFEASIBLE,

      feasible:
        false,

      planningPolicy:
        normalizedPolicy,

      lowerBound,

      upperBound,

      workday:
        normalizedWorkday,

      solverCalls:
        0,

      searchTrace:
        [],

      reason:
        'RESOURCE_LIMIT_BELOW_MATHEMATICAL_MINIMUM'
    }
  }

  const safeMaxSolverCalls =
    Math.max(
      1,

      normalizePositiveInteger(
        maxSolverCalls,
        AUTO_PLANNER_DEFAULTS
          .maxSolverCalls
      )
    )

  const cache =
    new Map()

  const searchTrace =
    []

  let solverCalls =
    0

  async function solve(
    candidateResourceCount,
    solveMode =
      AUTO_PLANNER_SOLVE_MODE
        .SEARCH,
    force =
      false
  ) {
    const cacheKey =
      `${candidateResourceCount}:${solveMode}`

    if (
      !force &&
      cache.has(
        cacheKey
      )
    ) {
      return cache.get(
        cacheKey
      )
    }

    if (
      solverCalls >=
      safeMaxSolverCalls
    ) {
      return null
    }

    solverCalls++

    let raw

    try {
      raw =
        await solveScenario({
          routeMode:
            ROUTE_OPERATION_MODE
              .ROUND_TRIP,

          origin,

          points:
            normalizedPoints,

          candidateResourceCount,

          maxActiveResources:
            candidateResourceCount,

          workday:
            normalizedWorkday,

          solveMode,

          mandatoryCoverage:
            true
        })
    } catch (
      error
    ) {
      console.error(
        '[automatic-resource-planner] SOLVER_ERROR',
        {
          candidateResourceCount,

          solveMode,

          name:
            error?.name ||
            null,

          code:
            error?.code ||
            null,

          message:
            error?.message ||
            String(
              error
            ),

          status:
            error?.status ??
            error?.details?.status ??
            null,

          details:
            error?.details ??
            null
        }
      )

      raw = {
        feasible:
          false,

        routes: [],

        validationErrors: [
          {
            code:
              error?.code ||
              'SOLVER_ERROR',

            message:
              error?.message ||
              String(
                error
              ),

            details:
              error?.details ??
              null
          }
        ],

        source:
          AUTO_PLANNER_SOURCE
            .UNKNOWN
      }
    }

    const result =
      normalizeSolverResult({
        raw,

        points:
          normalizedPoints,

        workday:
          normalizedWorkday,

        candidateResourceCount
      })

    cache.set(
      cacheKey,
      result
    )

    searchTrace.push({
      call:
        solverCalls,

      candidateResourceCount,

      solveMode,

      feasible:
        result.feasible,

      usedResourceCount:
        result.usedResourceCount,

      coveragePercent:
        result
          .coverage
          .coveragePercent,

      missing:
        result
          .coverage
          .missing
          .length,

      skipped:
        result
          .coverage
          .skipped
          .length,

      normalRoutes:
        result
          .workday
          .normalRoutes,

      extendedReturnRoutes:
        result
          .workday
          .extendedReturnRoutes,

      workdayViolations:
        result
          .workday
          .violations
          .length,

      unknownDurationRoutes:
        result
          .workday
          .unknownDurationRoutes
          .length,

      maxGraceUsedMinutes:
        result
          .workday
          .maxGraceUsedMinutes
    })

    return result
  }

  /*
   * =========================================================
   * 1. LOWER BOUND
   * =========================================================
   */

  let bestSolution =
    await solve(
      lowerBound
    )

  let bestResourceCount =
    bestSolution?.feasible
      ? (
          bestSolution
            .usedResourceCount ||
          lowerBound
        )
      : null

  let lastInfeasible =
    bestSolution?.feasible
      ? lowerBound -
        1
      : lowerBound

  let firstFeasible =
    bestSolution?.feasible
      ? lowerBound
      : null

  /*
   * =========================================================
   * 2. EXPANSIVE SEARCH
   * =========================================================
   */

  if (
    !bestSolution?.feasible
  ) {
    let current =
      lowerBound

    while (
      current <
        upperBound &&
      solverCalls <
        safeMaxSolverCalls
    ) {
      const next =
        getNextResourceCandidate(
          current,
          upperBound
        )

      if (
        next ===
        current
      ) {
        break
      }

      const result =
        await solve(
          next
        )

      if (
        !result
      ) {
        break
      }

      if (
        result.feasible
      ) {
        firstFeasible =
          next

        bestResourceCount =
          result
            .usedResourceCount ||
          next

        bestSolution =
          result

        break
      }

      lastInfeasible =
        next

      current =
        next
    }
  }

  /*
   * =========================================================
   * 3. UPPER BOUND FALLBACK
   * =========================================================
   */

  if (
    !bestSolution?.feasible &&
    solverCalls <
      safeMaxSolverCalls &&
    lastInfeasible <
      upperBound
  ) {
    const upperResult =
      await solve(
        upperBound
      )

    if (
      upperResult?.feasible
    ) {
      firstFeasible =
        upperBound

      bestResourceCount =
        upperResult
          .usedResourceCount ||
        upperBound

      bestSolution =
        upperResult
    } else {
      lastInfeasible =
        upperBound
    }
  }

  if (
    !bestSolution?.feasible
  ) {
    return {
      status:
        AUTO_PLANNER_STATUS
          .INFEASIBLE,

      feasible:
        false,

      planningPolicy:
        normalizedPolicy,

      workday:
        normalizedWorkday,

      lowerBound,

      upperBound,

      lowerBoundInfo,

      solverCalls,

      searchTrace,

      reason:
        solverCalls >=
          safeMaxSolverCalls
          ? 'SOLVER_CALL_LIMIT_REACHED_WITHOUT_FEASIBLE_PLAN'
          : 'NO_FEASIBLE_ROUND_TRIP_PLAN'
    }
  }

  /*
   * =========================================================
   * 4. TIGHTEN USED RESOURCE COUNT
   * =========================================================
   */

  if (
    bestSolution
      .usedResourceCount &&
    bestSolution
      .usedResourceCount <
      firstFeasible
  ) {
    firstFeasible =
      Math.max(
        lowerBound,

        bestSolution
          .usedResourceCount
      )
  }

  /*
   * =========================================================
   * 5. BINARY SEARCH
   * =========================================================
   */

  let low =
    Math.max(
      lowerBound,
      lastInfeasible +
      1
    )

  let high =
    Math.max(
      low -
        1,
      firstFeasible -
        1
    )

  while (
    low <=
      high &&
    solverCalls <
      safeMaxSolverCalls
  ) {
    const middle =
      Math.floor(
        (
          low +
          high
        ) /
        2
      )

    const result =
      await solve(
        middle
      )

    if (
      !result
    ) {
      break
    }

    if (
      result.feasible
    ) {
      bestSolution =
        result

      bestResourceCount =
        result
          .usedResourceCount ||
        middle

      firstFeasible =
        middle

      high =
        middle -
        1
    } else {
      lastInfeasible =
        middle

      low =
        middle +
        1
    }
  }

  /*
   * =========================================================
   * 6. FINAL RESOURCE COUNT
   * =========================================================
   */

  const candidateFinalCount =
    Math.max(
      lowerBound,

      bestResourceCount ||
      firstFeasible
    )

  if (
    candidateFinalCount !==
      bestSolution
        .candidateResourceCount &&
    solverCalls <
      safeMaxSolverCalls
  ) {
    const tightened =
      await solve(
        candidateFinalCount
      )

    if (
      tightened?.feasible
    ) {
      bestSolution =
        tightened

      bestResourceCount =
        tightened
          .usedResourceCount ||
        candidateFinalCount
    }
  }

  /*
   * =========================================================
   * 7. FINAL QUALITY PASS
   * =========================================================
   */

  if (
    finalQualityPass &&
    solverCalls <
      safeMaxSolverCalls
  ) {
    const finalResult =
      await solve(
        bestResourceCount,
        AUTO_PLANNER_SOLVE_MODE
          .FINAL_QUALITY,
        true
      )

    if (
      finalResult?.feasible
    ) {
      bestSolution =
        finalResult
    }
  }

  const requiredRoutes =
    bestSolution
      .usedResourceCount ||
    bestSolution
      .routes
      .length

  return {
    status:
      AUTO_PLANNER_STATUS
        .FEASIBLE,

    feasible:
      true,

    routeMode:
      ROUTE_OPERATION_MODE
        .ROUND_TRIP,

    resourcePlanningMode:
      RESOURCE_PLANNING_MODE
        .AUTO_REQUIREMENTS,

    planningPolicy:
      normalizedPolicy,

    requiredRoutes,

    requiredOperators:
      requiredRoutes,

    requiredVehicles:
      requiredRoutes,

    requiredDays:
      1,

    coveragePercent:
      bestSolution
        .coverage
        .coveragePercent,

    allDestinationsAssigned:
      bestSolution
        .coverage
        .valid,

    /*
     * =======================================================
     * JORNADA
     * =======================================================
     */

    workday:
      normalizedWorkday,

    routeWorkdaySummary: {
      normalRoutes:
        bestSolution
          .workday
          .normalRoutes,

      extendedReturnRoutes:
        bestSolution
          .workday
          .extendedReturnRoutes,

      infeasibleRoutes:
        bestSolution
          .workday
          .infeasibleRoutes,

      maxGraceUsedSeconds:
        bestSolution
          .workday
          .maxGraceUsedSeconds,

      maxGraceUsedMinutes:
        bestSolution
          .workday
          .maxGraceUsedMinutes,

      routeStatuses:
        bestSolution
          .workday
          .routeStatuses
    },

    lowerBound,

    upperBound,

    lowerBoundInfo,

    routes:
      bestSolution
        .routes,

    solverSource:
      bestSolution
        .source,

    solverMetrics:
      bestSolution
        .solverMetrics,

    solverCalls,

    searchTrace,

    validation: {
      coverage:
        bestSolution
          .coverage,

      workday:
        bestSolution
          .workday,

      errors:
        bestSolution
          .validationErrors
    }
  }
}

/**
 * ============================================================
 * SUMMARY
 * ============================================================
 */

export function summarizeAutomaticResourcePlan(
  plan
) {
  if (
    !plan
  ) {
    return {
      available:
        false
    }
  }

  return {
    available:
      true,

    status:
      plan.status,

    feasible:
      plan.feasible ===
      true,

    routeMode:
      plan.routeMode ||
      null,

    requiredRoutes:
      plan.requiredRoutes ??
      null,

    requiredOperators:
      plan.requiredOperators ??
      null,

    requiredVehicles:
      plan.requiredVehicles ??
      null,

    requiredDays:
      plan.requiredDays ??
      null,

    coveragePercent:
      plan.coveragePercent ??
      null,

    allDestinationsAssigned:
      plan.allDestinationsAssigned ===
      true,

    normalRoutes:
      plan
        ?.routeWorkdaySummary
        ?.normalRoutes ??
      null,

    extendedReturnRoutes:
      plan
        ?.routeWorkdaySummary
        ?.extendedReturnRoutes ??
      null,

    maxGraceUsedMinutes:
      plan
        ?.routeWorkdaySummary
        ?.maxGraceUsedMinutes ??
      null,

    solverCalls:
      plan.solverCalls ??
      0,

    lowerBound:
      plan.lowerBound ??
      null
  }
}