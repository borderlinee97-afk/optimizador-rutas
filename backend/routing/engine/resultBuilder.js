// backend/routing/engine/resultBuilder.js

import {
  buildExecutiveKpiSummary
} from '../services/kpi.service.js'

/**
 * ============================================================
 * MOTOR OPERATIVO INTEGRAL — UNIVERSAL RESULT CONTRACT
 * ============================================================
 *
 * VERSION 1.3
 *
 * PRINCIPIOS:
 *
 * 1. ROUTING STATUS
 *
 * El status principal describe el resultado
 * del núcleo de cálculo de ruta.
 *
 * La ausencia de:
 *
 * - combustible
 * - casetas
 * - hospedaje
 * - mantenimiento
 * - depreciación
 * - seguros
 * - costos
 *
 * NO transforma por sí sola una ruta válida
 * en PARTIAL o FAILED.
 *
 * ------------------------------------------------------------
 *
 * 2. PLANNING != CAPACITY != ASSIGNMENT
 *
 * PLANNING
 * → qué necesita la operación.
 *
 * CAPACITY
 * → qué recursos tenemos realmente.
 *
 * ASSIGNMENT
 * → qué persona / vehículo ejecutará cada ruta.
 *
 * El planner NO depende de operadores ni
 * vehículos registrados en BD.
 *
 * ------------------------------------------------------------
 *
 * 3. ROUTE MODES
 *
 * El contrato soporta:
 *
 * ROUND_TRIP
 * FOREIGN_ROUTE
 *
 * sin deformar sus semánticas particulares.
 *
 * ------------------------------------------------------------
 *
 * 4. TECHNICAL FEASIBILITY != RECOMMENDATION
 *
 * Un plan puede ser técnicamente FEASIBLE
 * pero requerir REVIEW antes de convertirse
 * en recomendación.
 *
 * Ejemplos:
 *
 * - validación carretera no disponible
 * - Route Quality = REVIEW
 * - módulo auxiliar incompleto
 *
 * ============================================================
 */

export const MOTOR_RESULT_VERSION =
  '1.3'

export const MOTOR_RESULT_STATUS =
  Object.freeze({
    SUCCESS:
      'SUCCESS',

    PARTIAL:
      'PARTIAL',

    FAILED:
      'FAILED'
  })

export const ANALYSIS_STATUS =
  Object.freeze({
    COMPLETE:
      'COMPLETE',

    INCOMPLETE:
      'INCOMPLETE',

    NOT_EVALUATED:
      'NOT_EVALUATED'
  })

export const MOTOR_EXECUTION_MODE =
  Object.freeze({
    STANDARD:
      'STANDARD',

    FALLBACK:
      'FALLBACK',

    LEGACY_CORE:
      'LEGACY_CORE',

    MANUAL:
      'MANUAL'
  })

export const PLANNING_STATUS =
  Object.freeze({
    FEASIBLE:
      'FEASIBLE',

    INFEASIBLE:
      'INFEASIBLE',

    NOT_EVALUATED:
      'NOT_EVALUATED'
  })

export const PLANNING_RECOMMENDATION_STATUS =
  Object.freeze({
    READY:
      'READY',

    REVIEW_REQUIRED:
      'REVIEW_REQUIRED',

    REJECTED:
      'REJECTED',

    NOT_READY:
      'NOT_READY',

    NOT_EVALUATED:
      'NOT_EVALUATED'
  })

export const CAPACITY_STATUS =
  Object.freeze({
    SUFFICIENT:
      'SUFFICIENT',

    INSUFFICIENT:
      'INSUFFICIENT',

    PARTIAL:
      'PARTIAL',

    NOT_EVALUATED:
      'NOT_EVALUATED'
  })

export const ASSIGNMENT_STATUS =
  Object.freeze({
    COMPLETE:
      'COMPLETE',

    PARTIAL:
      'PARTIAL',

    NOT_EVALUATED:
      'NOT_EVALUATED'
  })

export const PLANNING_ROUTE_MODE =
  Object.freeze({
    ROUND_TRIP:
      'ROUND_TRIP',

    FOREIGN_ROUTE:
      'FOREIGN_ROUTE'
  })

/**
 * ============================================================
 * GENERIC HELPERS
 * ============================================================
 */

function asArray(
  value
) {
  return Array.isArray(value)
    ? value
    : []
}

function asFiniteNumber(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number =
    Number(value)

  return Number.isFinite(number)
    ? number
    : null
}

function round(
  value,
  decimals = 2
) {
  const number =
    asFiniteNumber(value)

  if (
    number === null
  ) {
    return null
  }

  const factor =
    10 ** decimals

  return (
    Math.round(
      number *
      factor
    ) /
    factor
  )
}

function clampPercent(
  value
) {
  const number =
    asFiniteNumber(value)

  if (
    number === null
  ) {
    return null
  }

  return Math.max(
    0,
    Math.min(
      100,
      round(
        number,
        2
      )
    )
  )
}

function normalizeRouteMode(
  value
) {
  const normalized =
    String(
      value || ''
    )
      .trim()
      .toUpperCase()

  if (
    normalized ===
    PLANNING_ROUTE_MODE
      .ROUND_TRIP
  ) {
    return PLANNING_ROUTE_MODE
      .ROUND_TRIP
  }

  if (
    normalized ===
    PLANNING_ROUTE_MODE
      .FOREIGN_ROUTE
  ) {
    return PLANNING_ROUTE_MODE
      .FOREIGN_ROUTE
  }

  return normalized ||
    null
}

function sumKnownNumbers(
  values = []
) {
  const normalized =
    asArray(values)
      .map(asFiniteNumber)

  if (
    !normalized.length ||
    normalized.some(
      value =>
        value === null
    )
  ) {
    return null
  }

  return normalized.reduce(
    (
      total,
      value
    ) =>
      total +
      value,
    0
  )
}

function maxKnownNumber(
  values = []
) {
  const normalized =
    asArray(values)
      .map(asFiniteNumber)
      .filter(
        value =>
          value !== null
      )

  if (
    !normalized.length
  ) {
    return null
  }

  return Math.max(
    ...normalized
  )
}

function countUniqueAssignedDestinations(
  routes = []
) {
  const keys =
    new Set()

  for (
    const route
    of asArray(routes)
  ) {
    for (
      const key
      of asArray(
        route?.pointKeys
      )
    ) {
      if (
        key === null ||
        key === undefined
      ) {
        continue
      }

      keys.add(
        String(key)
      )
    }
  }

  return keys.size
}

/**
 * ============================================================
 * ALERTS
 * ============================================================
 */

export function deduplicateAlerts(
  alerts = []
) {
  const seen =
    new Set()

  const result =
    []

  for (
    const alert
    of asArray(alerts)
  ) {
    if (
      !alert ||
      typeof alert !==
        'object'
    ) {
      continue
    }

    const key = [
      alert.code ||
        'UNKNOWN',

      alert.day ??
        '',

      alert.pointId ??
        '',

      alert.operator ??
        '',

      alert.routeIndex ??
        '',

      alert.message ||
        ''
    ].join('|')

    if (
      seen.has(key)
    ) {
      continue
    }

    seen.add(key)

    result.push(alert)
  }

  return result
}

export function summarizeAlerts(
  alerts = []
) {
  const safe =
    deduplicateAlerts(alerts)

  let high =
    0

  let critical =
    0

  let warning =
    0

  let info =
    0

  let other =
    0

  for (
    const alert
    of safe
  ) {
    const severity =
      String(
        alert?.severity ||
        ''
      )
        .trim()
        .toUpperCase()

    if (
      severity ===
      'HIGH'
    ) {
      high++
      continue
    }

    if (
      severity ===
      'CRITICAL'
    ) {
      critical++
      continue
    }

    if (
      severity ===
      'WARNING'
    ) {
      warning++
      continue
    }

    if (
      severity ===
      'INFO'
    ) {
      info++
      continue
    }

    other++
  }

  return {
    total:
      safe.length,

    high,

    critical,

    warning,

    info,

    other
  }
}

/**
 * ============================================================
 * DATA QUALITY
 * ============================================================
 */

export function buildDataQualitySummary({
  fuelPlans = [],
  tollAnalyses = [],
  lodgingPlans = [],
  costAnalysis = null,
  kpis = null
} = {}) {
  const fuels =
    asArray(fuelPlans)

  const tolls =
    asArray(tollAnalyses)

  const lodgings =
    asArray(lodgingPlans)

  const completeFuelPlans =
    fuels.filter(
      plan =>
        plan
          ?.completeness
          ?.complete ===
        true
    ).length

  const incompleteFuelPlans =
    fuels.length -
    completeFuelPlans

  const completeTollAnalyses =
    tolls.filter(
      analysis =>
        (
          analysis
            ?.hasTolls ===
            false
        ) ||
        (
          analysis
            ?.hasTolls ===
            true &&
          analysis
            ?.total !=
            null
        )
    ).length

  const incompleteTollAnalyses =
    tolls.length -
    completeTollAnalyses

  const requiredLodgings =
    lodgings.filter(
      plan =>
        plan?.required ===
        true
    )

  const completeLodgings =
    requiredLodgings.filter(
      plan =>
        plan?.complete ===
        true
    ).length

  const incompleteLodgings =
    requiredLodgings.length -
    completeLodgings

  const economicPercent =
    costAnalysis
      ?.completeness
      ?.percent ??
    kpis
      ?.financial
      ?.completenessPercent ??
    null

  const economicComplete =
    costAnalysis
      ?.completeness
      ?.complete ??
    kpis
      ?.financial
      ?.complete ??
    null

  const issues =
    []

  if (
    incompleteFuelPlans >
    0
  ) {
    issues.push({
      area:
        'FUEL',

      code:
        'FUEL_INFORMATION_INCOMPLETE',

      count:
        incompleteFuelPlans
    })
  }

  if (
    incompleteTollAnalyses >
    0
  ) {
    issues.push({
      area:
        'TOLLS',

      code:
        'TOLL_INFORMATION_INCOMPLETE',

      count:
        incompleteTollAnalyses
    })
  }

  if (
    incompleteLodgings >
    0
  ) {
    issues.push({
      area:
        'LODGING',

      code:
        'LODGING_INFORMATION_INCOMPLETE',

      count:
        incompleteLodgings
    })
  }

  if (
    economicComplete ===
    false
  ) {
    issues.push({
      area:
        'ECONOMICS',

      code:
        'ECONOMIC_INFORMATION_INCOMPLETE',

      percent:
        economicPercent
    })
  }

  const evaluatedSomething =
    fuels.length >
      0 ||
    tolls.length >
      0 ||
    lodgings.length >
      0 ||
    costAnalysis !=
      null ||
    kpis !=
      null

  const status =
    !evaluatedSomething
      ? ANALYSIS_STATUS
          .NOT_EVALUATED
      : (
          issues.length
            ? ANALYSIS_STATUS
                .INCOMPLETE
            : ANALYSIS_STATUS
                .COMPLETE
        )

  return {
    status,

    complete:
      status ===
      ANALYSIS_STATUS
        .COMPLETE,

    fuel: {
      evaluated:
        fuels.length,

      complete:
        completeFuelPlans,

      incomplete:
        incompleteFuelPlans
    },

    tolls: {
      evaluated:
        tolls.length,

      complete:
        completeTollAnalyses,

      incomplete:
        incompleteTollAnalyses
    },

    lodging: {
      required:
        requiredLodgings.length,

      complete:
        completeLodgings,

      incomplete:
        incompleteLodgings
    },

    economics: {
      complete:
        economicComplete,

      completenessPercent:
        economicPercent
    },

    issues
  }
}

/**
 * ============================================================
 * MOTOR CORE STATUS
 * ============================================================
 */

export function determineMotorResultStatus({
  fatalError = null,
  routes = [],
  unresolved = []
} = {}) {
  if (
    fatalError
  ) {
    return MOTOR_RESULT_STATUS
      .FAILED
  }

  const routeCount =
    asArray(routes).length

  if (
    routeCount ===
    0
  ) {
    return MOTOR_RESULT_STATUS
      .FAILED
  }

  if (
    asArray(unresolved).length >
    0
  ) {
    return MOTOR_RESULT_STATUS
      .PARTIAL
  }

  return MOTOR_RESULT_STATUS
    .SUCCESS
}

/**
 * ============================================================
 * CONTEXT
 * ============================================================
 */

export function buildResultContext(
  context = {}
) {
  return {
    area:
      context.area ||
      'OPERACIONES',

    estado:
      context.estado ||
      null,

    proyecto:
      context.proyecto ||
      null,

    projectId:
      context.projectId ??
      context.project_id ??
      null,

    projectStatus:
      context.projectStatus ??
      context.project_status ??
      null,

    regionSanitaria:
      context.regionSanitaria ??
      context.region_sanitaria ??
      null,

    scope:
      context.scope ||
      null,

    cedisId:
      context.cedisId ??
      context.cedis_id ??
      null,

    cedisName:
      context.cedisName ??
      context.cedis_name ??
      null
  }
}

/**
 * ============================================================
 * ENGINE METADATA
 * ============================================================
 */

export function buildEngineMetadata(
  engine = {}
) {
  return {
    name:
      'MOTOR_OPERATIVO_INTEGRAL',

    version:
      MOTOR_RESULT_VERSION,

    executionMode:
      engine.executionMode ||
      MOTOR_EXECUTION_MODE
        .STANDARD,

    routingProvider:
      engine.routingProvider ||
      null,

    optimizationProvider:
      engine.optimizationProvider ||
      null,

    placesProvider:
      engine.placesProvider ||
      null,

    assignmentStrategy:
      engine.assignmentStrategy ||
      null,

    resourcePlanningMode:
      engine.resourcePlanningMode ||
      null,

    routeModeAuthority:
      engine.routeModeAuthority ||
      null,

    trafficEnabled:
      engine.trafficEnabled ===
      true,

    tollsEnabled:
      engine.tollsEnabled !==
      false,

    fuelEnabled:
      engine.fuelEnabled !==
      false
  }
}

/**
 * ============================================================
 * PLANNER DURATION SUMMARY
 * ============================================================
 */

function buildPlannerDurationSummary({
  routeMode,
  planner,
  finalValidation
}) {
  const routes =
    asArray(
      planner?.routes
    )

  const finalTotals =
    finalValidation
      ?.totals ||
    {}

  const routeTravelSeconds =
    routes.map(
      route =>
        route
          ?.travelDurationSeconds
    )

  const routeVisitSeconds =
    routes.map(
      route =>
        route
          ?.visitDurationSeconds
    )

  const routeBreakSeconds =
    routes.map(
      route =>
        route
          ?.breakDurationSeconds
    )

  const routeWaitSeconds =
    routes.map(
      route =>
        route
          ?.waitDurationSeconds
    )

  const routeElapsedSeconds =
    routes.map(
      route =>
        route
          ?.totalDurationSeconds
    )

  const travelDurationSeconds =
    asFiniteNumber(
      finalTotals
        .travelDurationSeconds
    ) ??
    sumKnownNumbers(
      routeTravelSeconds
    )

  const serviceDurationSeconds =
    sumKnownNumbers(
      routeVisitSeconds
    )

  const breakDurationSeconds =
    sumKnownNumbers(
      routeBreakSeconds
    )

  const waitDurationSeconds =
    sumKnownNumbers(
      routeWaitSeconds
    )

  let operationalDurationSeconds =
    asFiniteNumber(
      finalTotals
        .operationalDurationSeconds
    )

  /*
   * En FOREIGN_ROUTE totalDurationSeconds incluye
   * descansos nocturnos.
   *
   * Por eso "operationalDuration" se forma con:
   *
   * conducción + servicio
   *
   * cuando ambos están disponibles.
   */
  if (
    operationalDurationSeconds ===
      null &&
    routeMode ===
      PLANNING_ROUTE_MODE
        .FOREIGN_ROUTE &&
    travelDurationSeconds !==
      null &&
    serviceDurationSeconds !==
      null
  ) {
    operationalDurationSeconds =
      travelDurationSeconds +
      serviceDurationSeconds
  }

  const calendarDurationSeconds =
    asFiniteNumber(
      finalTotals
        .maximumRouteOperationalSeconds
    ) ??
    maxKnownNumber(
      routeElapsedSeconds
    )

  const elapsedDurationSeconds =
    maxKnownNumber(
      routeElapsedSeconds
    )

  return {
    distanceMeters:
      asFiniteNumber(
        finalTotals
          .distanceMeters
      ),

    travelDurationSeconds,

    serviceDurationSeconds,

    breakDurationSeconds,

    waitDurationSeconds,

    operationalDurationSeconds,

    /*
     * Tiempo de calendario hasta completar el plan
     * cuando las rutas/expediciones se ejecutan
     * concurrentemente.
     */
    calendarDurationSeconds,

    /*
     * Duración elapsed máxima directamente reportada
     * por el solver, útil especialmente en FOREIGN.
     */
    elapsedDurationSeconds
  }
}

/**
 * ============================================================
 * MODE-SPECIFIC FEASIBILITY
 * ============================================================
 */

function buildModeFeasibility({
  routeMode,
  planner,
  finalValidation
}) {
  const finalStatus =
    String(
      finalValidation
        ?.status ||
      ''
    )
      .trim()
      .toUpperCase()

  const routeCount =
    asFiniteNumber(
      finalValidation
        ?.routeCount
    ) ??
    asArray(
      planner?.routes
    ).length

  const infeasibleRoutes =
    asFiniteNumber(
      finalValidation
        ?.infeasibleRouteCount
    ) ??
    0

  const invalidRoutes =
    asFiniteNumber(
      finalValidation
        ?.invalidRouteCount
    ) ??
    0

  const hardFinalValidationFailure =
    [
      'INFEASIBLE',
      'INVALID_INPUT',
      'INVALID'
    ].includes(
      finalStatus
    ) ||
    infeasibleRoutes >
      0 ||
    invalidRoutes >
      0

  if (
    routeMode ===
    PLANNING_ROUTE_MODE
      .FOREIGN_ROUTE
  ) {
    const normalDays =
      asFiniteNumber(
        finalValidation
          ?.normalDays
      )

    const extendedCloseDays =
      asFiniteNumber(
        finalValidation
          ?.extendedCloseDays
      )

    const infeasibleDays =
      asFiniteNumber(
        finalValidation
          ?.infeasibleDays
      ) ??
      0

    return {
      routeCount,

      infeasibleRoutes,

      invalidRoutes,

      hardFinalValidationFailure:
        hardFinalValidationFailure ||
        infeasibleDays >
          0,

      normalRoutes:
        null,

      extendedReturnRoutes:
        null,

      maxGraceUsedMinutes:
        null,

      normalDays,

      extendedCloseDays,

      infeasibleDays,

      roundTrip:
        null,

      foreign: {
        requiredDays:
          asFiniteNumber(
            finalValidation
              ?.requiredDays ??
            planner
              ?.requiredDays
          ),

        normalDays,

        extendedCloseDays,

        infeasibleDays,

        maxForeignDays:
          asFiniteNumber(
            planner
              ?.maxForeignDays ??
            planner
              ?.policy
              ?.maxForeignDays
          )
      }
    }
  }

  const normalRoutes =
    asFiniteNumber(
      finalValidation
        ?.normalRoutes ??
      planner
        ?.routeWorkdaySummary
        ?.normalRoutes ??
      planner
        ?.normalRoutes
    )

  const extendedReturnRoutes =
    asFiniteNumber(
      finalValidation
        ?.extendedReturnRoutes ??
      planner
        ?.routeWorkdaySummary
        ?.extendedReturnRoutes ??
      planner
        ?.extendedReturnRoutes
    )

  const maxGraceUsedMinutes =
    asFiniteNumber(
      finalValidation
        ?.maxGraceUsedMinutes ??
      planner
        ?.routeWorkdaySummary
        ?.maxGraceUsedMinutes ??
      planner
        ?.maxGraceUsedMinutes
    )

  return {
    routeCount,

    infeasibleRoutes,

    invalidRoutes,

    hardFinalValidationFailure,

    normalRoutes,

    extendedReturnRoutes,

    maxGraceUsedMinutes,

    normalDays:
      null,

    extendedCloseDays:
      null,

    infeasibleDays:
      null,

    roundTrip: {
      targetOperationalDays:
        asFiniteNumber(
          planner
            ?.targetOperationalDays ??
          planner
            ?.requiredDays ??
          1
        ),

      normalRoutes,

      extendedReturnRoutes,

      infeasibleRoutes,

      maxGraceUsedMinutes
    },

    foreign:
      null
  }
}

/**
 * ============================================================
 * PLANNING SUMMARY
 * ============================================================
 */

export function buildPlanningSummary({
  planner = null,
  finalValidation = null,
  routeQuality = null,
  demand = {}
} = {}) {
  if (
    !planner ||
    typeof planner !==
      'object'
  ) {
    return {
      evaluated:
        false,

      status:
        PLANNING_STATUS
          .NOT_EVALUATED,

      recommendationStatus:
        PLANNING_RECOMMENDATION_STATUS
          .NOT_EVALUATED,

      readyForRecommendation:
        false,

      routeMode:
        null,

      resourcePlanningMode:
        'AUTO_REQUIREMENTS',

      capacityIndependent:
        true,

      demand: {
        totalDestinations:
          null,

        assignedDestinations:
          null,

        coveragePercent:
          null,

        mandatoryCoverageSatisfied:
          null
      },

      requiredResources: {
        routes:
          null,

        operators:
          null,

        vehicles:
          null,

        days:
          null
      },

      feasibility: {
        feasible:
          null,

        plannerFeasible:
          null,

        roadValidationEvaluated:
          false,

        roadVerified:
          null,

        routeCount:
          null,

        infeasibleRoutes:
          null,

        invalidRoutes:
          null,

        normalRoutes:
          null,

        extendedReturnRoutes:
          null,

        maxGraceUsedMinutes:
          null,

        normalDays:
          null,

        extendedCloseDays:
          null,

        infeasibleDays:
          null,

        roundTrip:
          null,

        foreign:
          null
      },

      quality: {
        evaluated:
          false,

        status:
          null,

        acceptable:
          null,

        passedRoutes:
          null,

        reviewRoutes:
          null,

        rejectedRoutes:
          null
      },

      totals: {
        distanceMeters:
          null,

        travelDurationSeconds:
          null,

        serviceDurationSeconds:
          null,

        breakDurationSeconds:
          null,

        waitDurationSeconds:
          null,

        operationalDurationSeconds:
          null,

        calendarDurationSeconds:
          null,

        elapsedDurationSeconds:
          null
      },

      solver: {
        calls:
          null,

        lowerBound:
          null,

        upperBound:
          null
      }
    }
  }

  const routeMode =
    normalizeRouteMode(
      planner.routeMode
    )

  const routes =
    asArray(
      planner.routes
    )

  const assignedDestinations =
    countUniqueAssignedDestinations(
      routes
    )

  const totalDestinations =
    asFiniteNumber(
      demand.totalDestinations ??
      demand.total ??
      planner.totalDestinations ??
      planner.destinationCount
    ) ??
    assignedDestinations

  const coveragePercent =
    clampPercent(
      planner.coveragePercent ??
      (
        totalDestinations >
          0
          ? (
              assignedDestinations /
              totalDestinations *
              100
            )
          : null
      )
    )

  const mandatoryCoverageSatisfied =
    planner
      .allDestinationsAssigned ===
      true ||
    (
      coveragePercent ===
      100
    )

  const requiredRoutes =
    asFiniteNumber(
      planner.requiredRoutes ??
      planner.usedResourceCount ??
      routes.length
    )

  const requiredOperators =
    asFiniteNumber(
      planner.requiredOperators ??
      requiredRoutes
    )

  const requiredVehicles =
    asFiniteNumber(
      planner.requiredVehicles ??
      requiredRoutes
    )

  const requiredDays =
    asFiniteNumber(
      planner.requiredDays ??
      planner.targetOperationalDays ??
      (
        planner.feasible
          ? 1
          : null
      )
    )

  const plannerFeasible =
    planner.feasible ===
    true

  const roadValidationEvaluated =
    Boolean(
      finalValidation &&
      typeof finalValidation ===
        'object'
    )

  const roadVerified =
    roadValidationEvaluated
      ? (
          finalValidation
            .verified ===
          true
        )
      : null

  const modeFeasibility =
    buildModeFeasibility({
      routeMode,

      planner,

      finalValidation
    })

  /*
   * FEASIBLE describe factibilidad técnica.
   *
   * Un fallo puramente auxiliar de Google Routes
   * que deje basePlanUsable=true no convierte
   * automáticamente el planner en INFEASIBLE.
   */
  const operationalFeasible =
    plannerFeasible &&
    mandatoryCoverageSatisfied &&
    !modeFeasibility
      .hardFinalValidationFailure

  const qualityEvaluated =
    Boolean(
      routeQuality &&
      typeof routeQuality ===
        'object'
    )

  const qualityStatus =
    qualityEvaluated
      ? (
          routeQuality.status ||
          null
        )
      : null

  const qualityAcceptable =
    qualityEvaluated
      ? (
          routeQuality
            .acceptable !==
          false
        )
      : null

  const normalizedQualityStatus =
    String(
      qualityStatus ||
      ''
    )
      .trim()
      .toUpperCase()

  let recommendationStatus =
    PLANNING_RECOMMENDATION_STATUS
      .NOT_READY

  if (
    !operationalFeasible
  ) {
    recommendationStatus =
      PLANNING_RECOMMENDATION_STATUS
        .NOT_READY
  } else if (
    !roadValidationEvaluated ||
    roadVerified !==
      true
  ) {
    /*
     * El planner puede seguir siendo FEASIBLE,
     * pero todavía no se considera READY.
     */
    recommendationStatus =
      PLANNING_RECOMMENDATION_STATUS
        .REVIEW_REQUIRED
  } else if (
    !qualityEvaluated
  ) {
    recommendationStatus =
      PLANNING_RECOMMENDATION_STATUS
        .REVIEW_REQUIRED
  } else if (
    normalizedQualityStatus ===
      'REJECT' ||
    normalizedQualityStatus ===
      'INVALID' ||
    qualityAcceptable ===
      false
  ) {
    recommendationStatus =
      PLANNING_RECOMMENDATION_STATUS
        .REJECTED
  } else if (
    normalizedQualityStatus ===
      'REVIEW'
  ) {
    recommendationStatus =
      PLANNING_RECOMMENDATION_STATUS
        .REVIEW_REQUIRED
  } else {
    recommendationStatus =
      PLANNING_RECOMMENDATION_STATUS
        .READY
  }

  const planningStatus =
    operationalFeasible
      ? PLANNING_STATUS
          .FEASIBLE
      : PLANNING_STATUS
          .INFEASIBLE

  const totals =
    buildPlannerDurationSummary({
      routeMode,

      planner,

      finalValidation
    })

  return {
    evaluated:
      true,

    status:
      planningStatus,

    recommendationStatus,

    readyForRecommendation:
      recommendationStatus ===
      PLANNING_RECOMMENDATION_STATUS
        .READY,

    routeMode,

    resourcePlanningMode:
      'AUTO_REQUIREMENTS',

    /*
     * La necesidad calculada no depende
     * de la plantilla/flota registrada.
     */
    capacityIndependent:
      true,

    demand: {
      totalDestinations,

      assignedDestinations,

      coveragePercent,

      mandatoryCoverageSatisfied
    },

    requiredResources: {
      routes:
        requiredRoutes,

      operators:
        requiredOperators,

      vehicles:
        requiredVehicles,

      days:
        requiredDays
    },

    feasibility: {
      feasible:
        operationalFeasible,

      plannerFeasible,

      roadValidationEvaluated,

      roadVerified,

      routeCount:
        modeFeasibility
          .routeCount,

      infeasibleRoutes:
        modeFeasibility
          .infeasibleRoutes,

      invalidRoutes:
        modeFeasibility
          .invalidRoutes,

      /*
       * Compatibilidad directa
       * ROUND_TRIP.
       */
      normalRoutes:
        modeFeasibility
          .normalRoutes,

      extendedReturnRoutes:
        modeFeasibility
          .extendedReturnRoutes,

      maxGraceUsedMinutes:
        modeFeasibility
          .maxGraceUsedMinutes,

      /*
       * Compatibilidad directa
       * FOREIGN_ROUTE.
       */
      normalDays:
        modeFeasibility
          .normalDays,

      extendedCloseDays:
        modeFeasibility
          .extendedCloseDays,

      infeasibleDays:
        modeFeasibility
          .infeasibleDays,

      /*
       * Contrato semántico recomendado.
       */
      roundTrip:
        modeFeasibility
          .roundTrip,

      foreign:
        modeFeasibility
          .foreign
    },

    quality: {
      evaluated:
        qualityEvaluated,

      status:
        qualityStatus,

      acceptable:
        qualityAcceptable,

      passedRoutes:
        asFiniteNumber(
          routeQuality
            ?.passedRouteCount
        ),

      reviewRoutes:
        asFiniteNumber(
          routeQuality
            ?.reviewRouteCount
        ),

      rejectedRoutes:
        asFiniteNumber(
          routeQuality
            ?.rejectedRouteCount
        )
    },

    totals,

    solver: {
      calls:
        asFiniteNumber(
          planner.solverCalls
        ),

      lowerBound:
        asFiniteNumber(
          planner.lowerBound
        ),

      upperBound:
        asFiniteNumber(
          planner.upperBound
        )
    }
  }
}

/**
 * ============================================================
 * CAPACITY
 * ============================================================
 *
 * PLANNING:
 * necesito 5 operadores.
 *
 * CAPACITY:
 * tengo 3.
 *
 * El planning sigue siendo FEASIBLE.
 */

export function buildCapacitySummary({
  capacity = null,
  requiredResources = {}
} = {}) {
  if (
    !capacity ||
    typeof capacity !==
      'object' ||
    capacity.evaluated ===
      false
  ) {
    return {
      evaluated:
        false,

      status:
        CAPACITY_STATUS
          .NOT_EVALUATED,

      available: {
        operators:
          null,

        vehicles:
          null
      },

      required: {
        operators:
          asFiniteNumber(
            requiredResources
              ?.operators
          ),

        vehicles:
          asFiniteNumber(
            requiredResources
              ?.vehicles
          )
      },

      deficits: {
        operators:
          null,

        vehicles:
          null
      },

      sufficient:
        null
    }
  }

  const requiredOperators =
    asFiniteNumber(
      requiredResources
        ?.operators
    )

  const requiredVehicles =
    asFiniteNumber(
      requiredResources
        ?.vehicles
    )

  const availableOperators =
    asFiniteNumber(
      capacity
        .availableOperators ??
      capacity
        .operators
    )

  const availableVehicles =
    asFiniteNumber(
      capacity
        .availableVehicles ??
      capacity
        .vehicles
    )

  const operatorDeficit =
    requiredOperators !==
      null &&
    availableOperators !==
      null
      ? Math.max(
          0,
          requiredOperators -
          availableOperators
        )
      : null

  const vehicleDeficit =
    requiredVehicles !==
      null &&
    availableVehicles !==
      null
      ? Math.max(
          0,
          requiredVehicles -
          availableVehicles
        )
      : null

  const operatorsEvaluated =
    availableOperators !==
    null

  const vehiclesEvaluated =
    availableVehicles !==
    null

  let status

  if (
    !operatorsEvaluated &&
    !vehiclesEvaluated
  ) {
    status =
      CAPACITY_STATUS
        .NOT_EVALUATED
  } else if (
    (
      operatorDeficit !==
        null &&
      operatorDeficit >
        0
    ) ||
    (
      vehicleDeficit !==
        null &&
      vehicleDeficit >
        0
    )
  ) {
    status =
      CAPACITY_STATUS
        .INSUFFICIENT
  } else if (
    operatorsEvaluated &&
    vehiclesEvaluated
  ) {
    status =
      CAPACITY_STATUS
        .SUFFICIENT
  } else {
    status =
      CAPACITY_STATUS
        .PARTIAL
  }

  return {
    evaluated:
      status !==
      CAPACITY_STATUS
        .NOT_EVALUATED,

    status,

    available: {
      operators:
        availableOperators,

      vehicles:
        availableVehicles
    },

    required: {
      operators:
        requiredOperators,

      vehicles:
        requiredVehicles
    },

    deficits: {
      operators:
        operatorDeficit,

      vehicles:
        vehicleDeficit
    },

    sufficient:
      status ===
      CAPACITY_STATUS
        .SUFFICIENT
  }
}

/**
 * ============================================================
 * ASSIGNMENT
 * ============================================================
 */

export function buildAssignmentSummary({
  assignments = [],
  requiredResources = {},
  assignment = null
} = {}) {
  const safeAssignments =
    asArray(assignments)

  const explicitlyEvaluated =
    assignment
      ?.evaluated ===
    true

  const evaluated =
    explicitlyEvaluated ||
    safeAssignments.length >
      0

  const requiredRoutes =
    asFiniteNumber(
      requiredResources
        ?.routes
    )

  if (
    !evaluated
  ) {
    return {
      evaluated:
        false,

      status:
        ASSIGNMENT_STATUS
          .NOT_EVALUATED,

      requiredRoutes,

      assignedRoutes:
        null,

      /*
       * IMPORTANTE:
       *
       * si assignment ni siquiera fue evaluado,
       * no afirmamos que las rutas estén
       * "sin asignar".
       */
      unassignedRoutes:
        null,

      complete:
        null
    }
  }

  const assignedRoutes =
    asFiniteNumber(
      assignment
        ?.assignedRoutes
    ) ??
    safeAssignments.length

  const unassignedRoutes =
    requiredRoutes !==
      null
      ? Math.max(
          0,
          requiredRoutes -
          assignedRoutes
        )
      : null

  const complete =
    requiredRoutes !==
      null
      ? assignedRoutes >=
        requiredRoutes
      : (
          assignment
            ?.complete ===
          true
        )

  return {
    evaluated:
      true,

    status:
      complete
        ? ASSIGNMENT_STATUS
            .COMPLETE
        : ASSIGNMENT_STATUS
            .PARTIAL,

    requiredRoutes,

    assignedRoutes,

    unassignedRoutes,

    complete
  }
}

/**
 * ============================================================
 * UNIVERSAL RESULT
 * ============================================================
 */

export function buildOperationalResult({
  context = {},
  engine = {},
  request = {},

  planning = null,

  capacity = null,

  assignment = null,

  routes = [],
  assignments = [],
  schedules = [],
  traffic = [],
  fuelPlans = [],
  tollAnalyses = [],
  lodgingPlans = [],

  costAnalysis = null,
  kpis = null,

  alerts = [],
  warnings = [],

  excluded = [],
  unresolved = [],

  fatalError = null,

  timings = {},
  metadata = {}
} = {}) {
  const normalizedRoutes =
    asArray(routes)

  const normalizedAssignments =
    asArray(assignments)

  const normalizedSchedules =
    asArray(schedules)

  const normalizedTraffic =
    asArray(traffic)

  const normalizedFuelPlans =
    asArray(fuelPlans)

  const normalizedTolls =
    asArray(tollAnalyses)

  const normalizedLodging =
    asArray(lodgingPlans)

  const normalizedUnresolved =
    asArray(unresolved)

  const normalizedAlerts =
    deduplicateAlerts([
      ...asArray(alerts),
      ...asArray(warnings)
    ])

  const planningSummary =
    buildPlanningSummary(
      planning ||
      {}
    )

  const capacitySummary =
    buildCapacitySummary({
      capacity,

      requiredResources:
        planningSummary
          .requiredResources
    })

  const assignmentSummary =
    buildAssignmentSummary({
      assignments:
        normalizedAssignments,

      requiredResources:
        planningSummary
          .requiredResources,

      assignment
    })

  const dataQuality =
    buildDataQualitySummary({
      fuelPlans:
        normalizedFuelPlans,

      tollAnalyses:
        normalizedTolls,

      lodgingPlans:
        normalizedLodging,

      costAnalysis,

      kpis
    })

  const status =
    determineMotorResultStatus({
      fatalError,

      routes:
        normalizedRoutes,

      unresolved:
        normalizedUnresolved
    })

  const executiveSummary =
    kpis
      ? buildExecutiveKpiSummary(
          kpis
        )
      : {
          available:
            false
        }

  const usable =
    normalizedRoutes.length >
    0

  return {
    status,

    usable,

    analysisStatus:
      dataQuality.status,

    generatedAt:
      new Date()
        .toISOString(),

    context:
      buildResultContext(
        context
      ),

    engine:
      buildEngineMetadata(
        engine
      ),

    request: {
      strategy:
        request.strategy ||
        null,

      routeMode:
        normalizeRouteMode(
          request.routeMode
        ),

      resourcePlanningMode:
        request.resourcePlanningMode ||
        (
          planningSummary.evaluated
            ? 'AUTO_REQUIREMENTS'
            : null
        ),

      routeModeAuthority:
        request.routeModeAuthority ||
        null,

      /*
       * LEGACY ONLY.
       *
       * Nunca inventar "1" si el usuario
       * no proporcionó capacidad.
       */
      operatorCountRequested:
        request.operatorCountRequested ??
        request.operatorCount ??
        null,

      operatorCountUsed:
        request.operatorCountUsed ??
        null,

      requestedRouteCount:
        request.requestedRouteCount ??
        null,

      returnToOrigin:
        request.returnToOrigin ===
        true,

      avoidTolls:
        request.avoidTolls ===
        true,

      avoidDificilAcceso:
        request.avoidDificilAcceso !==
        false,

      maxForeignDays:
        request.maxForeignDays ??
        null
    },

    /**
     * ========================================================
     * CENTRAL CONTRACT
     * ========================================================
     */

    planning:
      planningSummary,

    capacity:
      capacitySummary,

    assignment:
      assignmentSummary,

    summary: {
      routeCount:
        normalizedRoutes.length,

      assignmentCount:
        normalizedAssignments.length,

      scheduleCount:
        normalizedSchedules.length,

      excludedCount:
        asArray(excluded)
          .length,

      unresolvedCount:
        normalizedUnresolved
          .length,

      alerts:
        summarizeAlerts(
          normalizedAlerts
        ),

      requiredResources:
        planningSummary
          .requiredResources,

      recommendationStatus:
        planningSummary
          .recommendationStatus
    },

    executiveSummary,

    kpis,

    /**
     * ========================================================
     * OPERATION
     * ========================================================
     *
     * Conservado para compatibilidad.
     */

    operation: {
      assignments:
        normalizedAssignments,

      schedules:
        normalizedSchedules,

      routes:
        normalizedRoutes
    },

    /**
     * ========================================================
     * OPTIONAL ANALYSIS
     * ========================================================
     */

    analysis: {
      traffic:
        normalizedTraffic,

      fuel:
        normalizedFuelPlans,

      tolls:
        normalizedTolls,

      lodging:
        normalizedLodging,

      costs:
        costAnalysis
    },

    dataQuality,

    exceptions: {
      excluded:
        asArray(excluded),

      unresolved:
        normalizedUnresolved,

      fatalError:
        fatalError ||
        null
    },

    alerts:
      normalizedAlerts,

    timings: {
      totalMs:
        timings.totalMs ??
        null,

      assignmentMs:
        timings.assignmentMs ??
        null,

      optimizationMs:
        timings.optimizationMs ??
        null,

      routingMs:
        timings.routingMs ??
        null,

      analysisMs:
        timings.analysisMs ??
        null,

      planningMs:
        timings.planningMs ??
        null,

      validationMs:
        timings.validationMs ??
        null,

      qualityMs:
        timings.qualityMs ??
        null
    },

    metadata: {
      ...metadata,

      usable,

      resultVersion:
        MOTOR_RESULT_VERSION,

      planningEvaluated:
        planningSummary
          .evaluated,

      capacityEvaluated:
        capacitySummary
          .evaluated,

      assignmentEvaluated:
        assignmentSummary
          .evaluated
    }
  }
}

/**
 * ============================================================
 * RECOMMENDED PLANNING RESULT
 * ============================================================
 */

export function buildRecommendedPlanningResult({
  context = {},
  engine = {},
  request = {},

  planner,

  finalValidation = null,
  routeQuality = null,

  demand = {},

  capacity = null,

  assignments = [],
  assignment = null,

  schedules = [],

  traffic = [],
  fuelPlans = [],
  tollAnalyses = [],
  lodgingPlans = [],

  costAnalysis = null,
  kpis = null,

  alerts = [],
  warnings = [],

  excluded = [],
  unresolved = [],

  timings = {},
  metadata = {}
} = {}) {
  const routes =
    asArray(
      planner?.routes
    )

  return buildOperationalResult({
    context,

    engine: {
      resourcePlanningMode:
        'AUTO_REQUIREMENTS',

      ...engine
    },

    request: {
      resourcePlanningMode:
        'AUTO_REQUIREMENTS',

      routeMode:
        planner?.routeMode ??
        request.routeMode ??
        null,

      ...request
    },

    planning: {
      planner,

      finalValidation,

      routeQuality,

      demand
    },

    capacity,

    assignment,

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

    warnings,

    excluded,

    unresolved,

    timings,

    metadata
  })
}

/**
 * ============================================================
 * FAILED RESULT
 * ============================================================
 */

export function buildFailedOperationalResult({
  context = {},
  engine = {},
  request = {},
  error = null,
  metadata = {}
} = {}) {
  const normalizedError =
    typeof error ===
      'string'
      ? {
          code:
            'MOTOR_ERROR',

          message:
            error
        }
      : {
          code:
            error?.code ||
            'MOTOR_ERROR',

          message:
            error?.message ||
            'No fue posible calcular ninguna ruta.',

          details:
            error?.details ??
            null
        }

  return buildOperationalResult({
    context,

    engine,

    request,

    routes: [],

    fatalError:
      normalizedError,

    alerts: [
      {
        severity:
          'HIGH',

        code:
          normalizedError.code,

        message:
          normalizedError.message
      }
    ],

    metadata
  })
}

export default Object.freeze({
  buildOperationalResult,
  buildRecommendedPlanningResult,
  buildFailedOperationalResult,
  buildPlanningSummary,
  buildCapacitySummary,
  buildAssignmentSummary,
  buildDataQualitySummary,
  determineMotorResultStatus,
  buildResultContext,
  buildEngineMetadata,
  deduplicateAlerts,
  summarizeAlerts
})