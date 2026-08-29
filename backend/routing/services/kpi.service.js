// backend/routing/services/kpi.service.js

import {
  calculateUnitCost,
  roundDecimal,
  roundMoney,
  toOptionalNonNegativeNumber
} from '../utils/money.js'

import {
  formatDuration,
  parseDurationSec
} from '../utils/time.js'

/**
 * Servicio de indicadores del
 * Motor Operativo Integral.
 *
 * OBJETIVO:
 *
 * Transformar resultados técnicos en
 * indicadores operativos y ejecutivos.
 *
 * ESTE SERVICIO NO:
 *
 * - consulta Google
 * - consulta PostgreSQL
 * - calcula rutas
 * - modifica asignaciones
 * - conoce Express
 */

export const KPI_STATUS =
  Object.freeze({
    GOOD:
      'GOOD',

    WARNING:
      'WARNING',

    CRITICAL:
      'CRITICAL',

    UNKNOWN:
      'UNKNOWN'
  })

/**
 * Devuelve primer número no negativo válido.
 *
 * @param  {...unknown} values
 * @returns {number|null}
 */
function firstNonNegative(
  ...values
) {
  for (
    const value
    of values
  ) {
    const normalized =
      toOptionalNonNegativeNumber(
        value
      )

    if (
      normalized !=
      null
    ) {
      return normalized
    }
  }

  return null
}

/**
 * Obtiene distancia de una ruta
 * independientemente de la forma exacta
 * del resultado.
 *
 * @param {object} route
 * @returns {number}
 */
function getRouteDistanceMeters(
  route
) {
  return (
    firstNonNegative(
      route?.distanceMeters,
      route?.distance_meters,
      route
        ?.metrics
        ?.distanceMeters,
      route
        ?.route
        ?.distanceMeters
    ) ??
    0
  )
}

/**
 * Obtiene duración de una ruta.
 *
 * @param {object} route
 * @returns {number}
 */
function getRouteDurationSeconds(
  route
) {
  const numeric =
    firstNonNegative(
      route?.durationSeconds,
      route?.duration_seconds,
      route
        ?.metrics
        ?.durationSeconds,
      route
        ?.metrics
        ?.totalOperationalSeconds,
      route
        ?.route
        ?.durationSeconds
    )

  if (
    numeric !=
    null
  ) {
    return numeric
  }

  if (
    route?.duration !=
    null
  ) {
    return parseDurationSec(
      route.duration
    )
  }

  return 0
}

/**
 * Obtiene cantidad de paradas.
 *
 * @param {object} route
 * @returns {number}
 */
function getRouteStopCount(
  route
) {
  return (
    firstNonNegative(
      route?.stopCount,
      route
        ?.metrics
        ?.stopCount
    ) ??
    (
      Array.isArray(
        route?.points
      )
        ? route.points.length
        : (
            Array.isArray(
              route?.stops
            )
              ? route.stops.length
              : 0
          )
    )
  )
}

/**
 * Obtiene jornadas.
 *
 * @param {object} route
 * @returns {number}
 */
function getRouteDays(
  route
) {
  const explicit =
    firstNonNegative(
      route?.routeDays,
      route?.daysCount,
      route
        ?.metrics
        ?.routeDays
    )

  if (
    explicit !=
    null
  ) {
    return explicit
  }

  if (
    Array.isArray(
      route?.days
    )
  ) {
    return route
      .days
      .length
  }

  return 1
}

/**
 * KPIs de cobertura.
 *
 * @param {{
 *   totalUnits?: number,
 *   routedUnits?: number,
 *   excludedUnits?: number,
 *   difficultAccessUnits?: number,
 *   unitsWithoutCoordinates?: number
 * }} params
 *
 * @returns {object}
 */
export function buildCoverageKpis({
  totalUnits = 0,
  routedUnits = 0,
  excludedUnits = 0,
  difficultAccessUnits = 0,
  unitsWithoutCoordinates = 0
} = {}) {
  const total =
    Math.max(
      0,
      Number(
        totalUnits
      ) ||
      0
    )

  const routed =
    Math.max(
      0,
      Number(
        routedUnits
      ) ||
      0
    )

  const excluded =
    Math.max(
      0,
      Number(
        excludedUnits
      ) ||
      0
    )

  const difficult =
    Math.max(
      0,
      Number(
        difficultAccessUnits
      ) ||
      0
    )

  const withoutCoordinates =
    Math.max(
      0,
      Number(
        unitsWithoutCoordinates
      ) ||
      0
    )

  const calculable =
    Math.max(
      0,
      total -
      excluded -
      withoutCoordinates
    )

  const coveragePercent =
    total >
      0
      ? roundDecimal(
          (
            routed /
            total
          ) *
          100,
          1
        )
      : 0

  const calculableCoveragePercent =
    calculable >
      0
      ? roundDecimal(
          (
            routed /
            calculable
          ) *
          100,
          1
        )
      : 0

  return {
    totalUnits:
      total,

    calculableUnits:
      calculable,

    routedUnits:
      routed,

    excludedUnits:
      excluded,

    difficultAccessUnits:
      difficult,

    unitsWithoutCoordinates:
      withoutCoordinates,

    coveragePercent:
      coveragePercent ??
      0,

    calculableCoveragePercent:
      calculableCoveragePercent ??
      0
  }
}

/**
 * Agrega métricas de rutas.
 *
 * @param {object[]} routes
 * @returns {object}
 */
export function aggregateRouteMetrics(
  routes = []
) {
  const safeRoutes =
    Array.isArray(
      routes
    )
      ? routes
      : []

  let distanceMeters =
    0

  let durationSeconds =
    0

  let stopCount =
    0

  let routeDays =
    0

  for (
    const route
    of safeRoutes
  ) {
    distanceMeters +=
      getRouteDistanceMeters(
        route
      )

    durationSeconds +=
      getRouteDurationSeconds(
        route
      )

    stopCount +=
      getRouteStopCount(
        route
      )

    routeDays +=
      getRouteDays(
        route
      )
  }

  return {
    routeCount:
      safeRoutes.length,

    distanceMeters:
      Math.round(
        distanceMeters
      ),

    distanceKm:
      roundDecimal(
        distanceMeters /
        1000,
        2
      ),

    durationSeconds:
      Math.round(
        durationSeconds
      ),

    durationFormatted:
      formatDuration(
        durationSeconds
      ),

    stopCount,

    routeDays
  }
}

/**
 * KPIs operativos.
 *
 * @param {{
 *   routes?: object[],
 *   operatorCount?: number|null,
 *   workdaySummary?: object|null
 * }} params
 *
 * @returns {object}
 */
export function buildOperationalKpis({
  routes = [],
  operatorCount = null,
  workdaySummary = null
} = {}) {
  const routeMetrics =
    aggregateRouteMetrics(
      routes
    )

  const operators =
    Math.max(
      0,
      Number(
        operatorCount ??
        routeMetrics.routeCount
      ) ||
      0
    )

  const days =
    firstNonNegative(
      workdaySummary
        ?.days,
      routeMetrics
        .routeDays
    ) ??
    0

  const drivingSeconds =
    firstNonNegative(
      workdaySummary
        ?.drivingSeconds
    )

  const serviceSeconds =
    firstNonNegative(
      workdaySummary
        ?.serviceSeconds
    )

  const operationalSeconds =
    firstNonNegative(
      workdaySummary
        ?.operationalSeconds,
      routeMetrics
        .durationSeconds
    ) ??
    0

  return {
    routes:
      routeMetrics.routeCount,

    operators,

    days,

    stops:
      routeMetrics.stopCount,

    distanceMeters:
      routeMetrics.distanceMeters,

    distanceKm:
      routeMetrics.distanceKm,

    durationSeconds:
      routeMetrics.durationSeconds,

    durationFormatted:
      routeMetrics.durationFormatted,

    drivingSeconds,

    drivingFormatted:
      drivingSeconds !=
        null
        ? formatDuration(
            drivingSeconds
          )
        : null,

    serviceSeconds,

    serviceFormatted:
      serviceSeconds !=
        null
        ? formatDuration(
            serviceSeconds
          )
        : null,

    operationalSeconds,

    operationalFormatted:
      formatDuration(
        operationalSeconds
      ),

    criticalDays:
      firstNonNegative(
        workdaySummary
          ?.criticalDays
      ) ??
      0,

    infeasibleDays:
      firstNonNegative(
        workdaySummary
          ?.infeasibleDays
      ) ??
      0
  }
}

/**
 * Consolida múltiples planes de combustible.
 *
 * @param {object[]} fuelPlans
 * @returns {object}
 */
export function buildFuelKpis(
  fuelPlans = []
) {
  const plans =
    (
      Array.isArray(
        fuelPlans
      )
        ? fuelPlans
        : []
    )
      .filter(
        Boolean
      )

  let liters =
    0

  let cost =
    0

  let plansWithLiters =
    0

  let plansWithCost =
    0

  let onRouteRefuels =
    0

  let finalCedisRefillLiters =
    0

  let incompletePlans =
    0

  for (
    const plan
    of plans
  ) {
    const planLiters =
      toOptionalNonNegativeNumber(
        plan
          ?.consumption
          ?.totalLiters
      )

    if (
      planLiters !=
      null
    ) {
      liters +=
        planLiters

      plansWithLiters++
    }

    const planCost =
      toOptionalNonNegativeNumber(
        plan
          ?.cost
          ?.totalEstimated
      )

    if (
      planCost !=
      null
    ) {
      cost +=
        planCost

      plansWithCost++
    }

    onRouteRefuels +=
      Number(
        plan
          ?.refueling
          ?.minimumOnRouteRefuels
      ) ||
      0

    finalCedisRefillLiters +=
      Number(
        plan
          ?.refueling
          ?.finalCedisRefillLiters
      ) ||
      0

    if (
      plan
        ?.completeness
        ?.complete !==
      true
    ) {
      incompletePlans++
    }
  }

  return {
    plans:
      plans.length,

    totalLiters:
      plansWithLiters >
        0
        ? roundDecimal(
            liters,
            2
          )
        : null,

    estimatedCost:
      plansWithCost >
        0
        ? roundMoney(
            cost
          )
        : null,

    onRouteRefuels,

    finalCedisRefillLiters:
      plans.length
        ? roundDecimal(
            finalCedisRefillLiters,
            2
          )
        : null,

    incompletePlans,

    complete:
      plans.length >
        0 &&
      incompletePlans ===
        0
  }
}

/**
 * Consolida peajes de varias rutas.
 *
 * @param {object[]} tollAnalyses
 * @returns {object}
 */
export function buildTollKpis(
  tollAnalyses = []
) {
  const analyses =
    (
      Array.isArray(
        tollAnalyses
      )
        ? tollAnalyses
        : []
    )
      .filter(
        Boolean
      )

  let totalKnown =
    0

  let known =
    0

  let unknown =
    0

  let tollRoutes =
    0

  let officialRoutes =
    0

  for (
    const analysis
    of analyses
  ) {
    if (
      analysis
        ?.hasTolls ===
      true
    ) {
      tollRoutes++
    }

    const amount =
      toOptionalNonNegativeNumber(
        analysis?.total
      )

    if (
      amount !=
      null
    ) {
      totalKnown +=
        amount

      known++
    } else {
      unknown++
    }

    if (
      analysis
        ?.officialTariffs ===
      true
    ) {
      officialRoutes++
    }
  }

  return {
    evaluatedRoutes:
      analyses.length,

    routesWithTolls:
      tollRoutes,

    knownRoutes:
      known,

    unknownRoutes:
      unknown,

    totalKnown:
      analyses.length
        ? roundMoney(
            totalKnown
          )
        : null,

    officialRoutes,

    complete:
      analyses.length >
        0 &&
      unknown ===
        0
  }
}

/**
 * KPIs financieros provenientes de cost.service.js.
 *
 * @param {object|null} costAnalysis
 * @returns {object}
 */
export function buildFinancialKpis(
  costAnalysis
) {
  if (
    !costAnalysis
  ) {
    return {
      available:
        false
    }
  }

  return {
    available:
      true,

    currency:
      costAnalysis.currency ||
      'MXN',

    knownTotal:
      costAnalysis
        ?.totals
        ?.known ??
      null,

    completeTotal:
      costAnalysis
        ?.totals
        ?.complete ??
      null,

    complete:
      costAnalysis
        ?.totals
        ?.isComplete ===
      true,

    completenessPercent:
      costAnalysis
        ?.completeness
        ?.percent ??
      0,

    unknownComponents: [
      ...(
        costAnalysis
          ?.unknownComponents ||
        []
      )
    ],

    perKm:
      costAnalysis
        ?.unitCosts
        ?.perKm ??
      null,

    perStop:
      costAnalysis
        ?.unitCosts
        ?.perStop ??
      null,

    perDay:
      costAnalysis
        ?.unitCosts
        ?.perDay ??
      null,

    perOperator:
      costAnalysis
        ?.unitCosts
        ?.perOperator ??
      null
  }
}

/**
 * Calcula productividad.
 *
 * @param {{
 *   coverage?: object,
 *   operation?: object,
 *   financial?: object
 * }} params
 *
 * @returns {object}
 */
export function buildProductivityKpis({
  coverage = {},
  operation = {},
  financial = {}
} = {}) {
  const routedUnits =
    Number(
      coverage.routedUnits
    ) ||
    Number(
      operation.stops
    ) ||
    0

  const distanceKm =
    toOptionalNonNegativeNumber(
      operation.distanceKm
    )

  const operators =
    toOptionalNonNegativeNumber(
      operation.operators
    )

  const days =
    toOptionalNonNegativeNumber(
      operation.days
    )

  const operationalSeconds =
    toOptionalNonNegativeNumber(
      operation
        .operationalSeconds
    )

  const operationalHours =
    operationalSeconds !=
      null
      ? operationalSeconds /
        3600
      : null

  const knownCost =
    toOptionalNonNegativeNumber(
      financial.knownTotal
    )

  return {
    unitsPerOperator:
      calculateUnitCost(
        routedUnits,
        operators,
        2
      ),

    unitsPerDay:
      calculateUnitCost(
        routedUnits,
        days,
        2
      ),

    unitsPerOperationalHour:
      calculateUnitCost(
        routedUnits,
        operationalHours,
        2
      ),

    kmPerUnit:
      calculateUnitCost(
        distanceKm,
        routedUnits,
        2
      ),

    kmPerOperator:
      calculateUnitCost(
        distanceKm,
        operators,
        2
      ),

    kmPerDay:
      calculateUnitCost(
        distanceKm,
        days,
        2
      ),

    operationalHoursPerOperator:
      calculateUnitCost(
        operationalHours,
        operators,
        2
      ),

    costPerUnit:
      calculateUnitCost(
        knownCost,
        routedUnits,
        2
      ),

    costPerKm:
      calculateUnitCost(
        knownCost,
        distanceKm,
        2
      )
  }
}

/**
 * Construye el conjunto principal de KPIs.
 *
 * @param {{
 *   coverage?: object,
 *   routes?: object[],
 *   operatorCount?: number,
 *   workdaySummary?: object|null,
 *   fuelPlans?: object[],
 *   tollAnalyses?: object[],
 *   costAnalysis?: object|null
 * }} params
 *
 * @returns {object}
 */
export function buildRouteKpis({
  coverage = {},
  routes = [],
  operatorCount = null,
  workdaySummary = null,
  fuelPlans = [],
  tollAnalyses = [],
  costAnalysis = null
} = {}) {
  const coverageKpis =
    buildCoverageKpis(
      coverage
    )

  const operationalKpis =
    buildOperationalKpis({
      routes,
      operatorCount,
      workdaySummary
    })

  const fuelKpis =
    buildFuelKpis(
      fuelPlans
    )

  const tollKpis =
    buildTollKpis(
      tollAnalyses
    )

  const financialKpis =
    buildFinancialKpis(
      costAnalysis
    )

  const productivityKpis =
    buildProductivityKpis({
      coverage:
        coverageKpis,

      operation:
        operationalKpis,

      financial:
        financialKpis
    })

  return {
    coverage:
      coverageKpis,

    operation:
      operationalKpis,

    fuel:
      fuelKpis,

    tolls:
      tollKpis,

    financial:
      financialKpis,

    productivity:
      productivityKpis
  }
}

/**
 * Genera alertas ejecutivas a partir
 * de los KPIs.
 *
 * @param {object|null} kpis
 * @returns {object[]}
 */
export function buildKpiAlerts(
  kpis
) {
  const alerts =
    []

  if (
    !kpis
  ) {
    return alerts
  }

  const coverage =
    Number(
      kpis
        ?.coverage
        ?.coveragePercent
    )

  if (
    Number.isFinite(
      coverage
    ) &&
    coverage <
      90
  ) {
    alerts.push({
      severity:
        coverage <
        75
          ? 'HIGH'
          : 'WARNING',

      code:
        'LOW_ROUTE_COVERAGE',

      message:
        `La cobertura total calculada es de ${coverage}%.`
    })
  }

  const missingCoordinates =
    Number(
      kpis
        ?.coverage
        ?.unitsWithoutCoordinates
    ) ||
    0

  if (
    missingCoordinates >
    0
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'UNITS_WITHOUT_COORDINATES',

      message:
        `${missingCoordinates} unidad(es) no tienen coordenadas utilizables.`
    })
  }

  const infeasibleDays =
    Number(
      kpis
        ?.operation
        ?.infeasibleDays
    ) ||
    0

  if (
    infeasibleDays >
    0
  ) {
    alerts.push({
      severity:
        'HIGH',

      code:
        'INFEASIBLE_WORKDAYS',

      message:
        `${infeasibleDays} jornada(s) exceden las reglas operativas configuradas.`
    })
  }

  const criticalDays =
    Number(
      kpis
        ?.operation
        ?.criticalDays
    ) ||
    0

  if (
    criticalDays >
    0
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'CRITICAL_WORKDAYS',

      message:
        `${criticalDays} jornada(s) se encuentran cerca de su límite operativo.`
    })
  }

  const refuels =
    Number(
      kpis
        ?.fuel
        ?.onRouteRefuels
    ) ||
    0

  if (
    refuels >
    0
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'ON_ROUTE_REFUELING',

      message:
        `El plan requiere al menos ${refuels} abastecimiento(s) durante las rutas.`
    })
  }

  const economicCompleteness =
    Number(
      kpis
        ?.financial
        ?.completenessPercent
    )

  if (
    Number.isFinite(
      economicCompleteness
    ) &&
    economicCompleteness <
      100
  ) {
    alerts.push({
      severity:
        economicCompleteness <
        70
          ? 'WARNING'
          : 'INFO',

      code:
        'ECONOMIC_INFORMATION_INCOMPLETE',

      message:
        `La integridad económica del análisis es de ${economicCompleteness}%.`
    })
  }

  const unknownTolls =
    Number(
      kpis
        ?.tolls
        ?.unknownRoutes
    ) ||
    0

  if (
    unknownTolls >
    0
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'TOLL_INFORMATION_INCOMPLETE',

      message:
        `${unknownTolls} ruta(s) no tienen costo de peaje completamente determinado.`
    })
  }

  return alerts
}

/**
 * Construye resumen ejecutivo compacto.
 *
 * Este objeto será especialmente útil
 * para frontend, PDF y futuras integraciones BI.
 *
 * @param {object|null} kpis
 * @returns {object}
 */
export function buildExecutiveKpiSummary(
  kpis
) {
  if (
    !kpis
  ) {
    return {
      available:
        false
    }
  }

  return {
    available:
      true,

    coveragePercent:
      kpis
        ?.coverage
        ?.coveragePercent ??
      null,

    routedUnits:
      kpis
        ?.coverage
        ?.routedUnits ??
      null,

    operators:
      kpis
        ?.operation
        ?.operators ??
      null,

    routes:
      kpis
        ?.operation
        ?.routes ??
      null,

    days:
      kpis
        ?.operation
        ?.days ??
      null,

    distanceKm:
      kpis
        ?.operation
        ?.distanceKm ??
      null,

    operationalTime:
      kpis
        ?.operation
        ?.operationalFormatted ??
      null,

    fuelLiters:
      kpis
        ?.fuel
        ?.totalLiters ??
      null,

    fuelCost:
      kpis
        ?.fuel
        ?.estimatedCost ??
      null,

    tollCost:
      kpis
        ?.tolls
        ?.totalKnown ??
      null,

    knownOperatingCost:
      kpis
        ?.financial
        ?.knownTotal ??
      null,

    completeOperatingCost:
      kpis
        ?.financial
        ?.completeTotal ??
      null,

    economicCompletenessPercent:
      kpis
        ?.financial
        ?.completenessPercent ??
      null,

    costPerUnit:
      kpis
        ?.productivity
        ?.costPerUnit ??
      null,

    costPerKm:
      kpis
        ?.productivity
        ?.costPerKm ??
      null,

    unitsPerOperator:
      kpis
        ?.productivity
        ?.unitsPerOperator ??
      null,

    unitsPerDay:
      kpis
        ?.productivity
        ?.unitsPerDay ??
      null,

    kmPerUnit:
      kpis
        ?.productivity
        ?.kmPerUnit ??
      null,

    criticalDays:
      kpis
        ?.operation
        ?.criticalDays ??
      0,

    infeasibleDays:
      kpis
        ?.operation
        ?.infeasibleDays ??
      0
  }
}