// backend/routing/domain/planningPolicy.js

/**
 * Política de planificación
 * del Motor Operativo Integral.
 *
 * Este archivo define QUÉ significa
 * planificar una operación.
 *
 * No consulta:
 * - PostgreSQL
 * - Google
 * - Express
 * - personas
 * - vehículos
 */

export const ROUTE_OPERATION_MODE =
  Object.freeze({
    ROUND_TRIP:
      'ROUND_TRIP',

    FOREIGN_ROUTE:
      'FOREIGN_ROUTE'
  })

export const RESOURCE_PLANNING_MODE =
  Object.freeze({
    AUTO_REQUIREMENTS:
      'AUTO_REQUIREMENTS',

    CAPACITY_SIMULATION:
      'CAPACITY_SIMULATION'
  })

export const ROUTE_MODE_AUTHORITY =
  Object.freeze({
    USER_POLICY:
      'USER_POLICY',

    HYBRID_ADVISORY:
      'HYBRID_ADVISORY'
  })

export const PLANNING_OBJECTIVE =
  Object.freeze({
    REQUIRED_RESOURCES:
      'REQUIRED_RESOURCES',

    FEASIBLE_WITH_CAPACITY:
      'FEASIBLE_WITH_CAPACITY'
  })

export const PLANNING_PRIORITY =
  Object.freeze({
    COVERAGE:
      1000,

    OPERATIONAL_FEASIBILITY:
      900,

    TERRITORIAL_COHERENCE:
      800,

    AVOID_UNNECESSARY_FOREIGN:
      700,

    MINIMIZE_REQUIRED_RESOURCES:
      600,

    MINIMIZE_OPERATIONAL_TIME:
      500,

    MINIMIZE_DEADHEAD:
      400,

    MINIMIZE_DISTANCE:
      300,

    MINIMIZE_COST:
      200,

    BALANCE_WORKLOAD:
      100
  })

export const DEFAULT_PLANNING_POLICY =
  Object.freeze({
    resourcePlanningMode:
      RESOURCE_PLANNING_MODE
        .AUTO_REQUIREMENTS,

    objective:
      PLANNING_OBJECTIVE
        .REQUIRED_RESOURCES,

    routeModeAuthority:
      ROUTE_MODE_AUTHORITY
        .USER_POLICY,

    mandatoryCoverage:
      true,

    requireOperationalFeasibility:
      true,

    requireTerritorialCoherence:
      true,

    preferRoundTripWhenFeasible:
      true,

    allowAutomaticForeignConversion:
      false,

    allowHybridAdvisory:
      false,

    compareRealRoadRoutes:
      true,

    validateWithGoogleRoutes:
      true
  })

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

/**
 * Normaliza tipo de operación.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRouteOperationMode(
  value
) {
  const normalized =
    String(
      value ||
      ''
    )
      .trim()
      .toUpperCase()

  if (
    normalized ===
    ROUTE_OPERATION_MODE
      .FOREIGN_ROUTE
  ) {
    return ROUTE_OPERATION_MODE
      .FOREIGN_ROUTE
  }

  return ROUTE_OPERATION_MODE
    .ROUND_TRIP
}

/**
 * Política de planificación principal.
 *
 * @param {object} input
 * @returns {object}
 */
export function normalizePlanningPolicy(
  input = {}
) {
  const routeMode =
    normalizeRouteOperationMode(
      input.routeMode
    )

  const resourcePlanningMode =
    input.resourcePlanningMode ===
      RESOURCE_PLANNING_MODE
        .CAPACITY_SIMULATION
      ? RESOURCE_PLANNING_MODE
          .CAPACITY_SIMULATION
      : RESOURCE_PLANNING_MODE
          .AUTO_REQUIREMENTS

  const capacitySimulation =
    resourcePlanningMode ===
    RESOURCE_PLANNING_MODE
      .CAPACITY_SIMULATION

  const availableOperators =
    capacitySimulation
      ? normalizePositiveInteger(
          input.availableOperators
        )
      : null

  const availableVehicles =
    capacitySimulation
      ? normalizePositiveInteger(
          input.availableVehicles
        )
      : null

  return {
    routeMode,

    resourcePlanningMode,

    objective:
      capacitySimulation
        ? PLANNING_OBJECTIVE
            .FEASIBLE_WITH_CAPACITY
        : PLANNING_OBJECTIVE
            .REQUIRED_RESOURCES,

    routeModeAuthority:
      ROUTE_MODE_AUTHORITY
        .USER_POLICY,

    /*
     * En la planeación recomendada
     * NO recibimos cantidad de rutas
     * ni operadores disponibles.
     */
    requestedRouteCount:
      null,

    availableOperators,

    availableVehicles,

    determineRequiredRoutes:
      true,

    determineRequiredOperators:
      true,

    determineRequiredVehicles:
      true,

    mandatoryCoverage:
      true,

    requireOperationalFeasibility:
      true,

    requireTerritorialCoherence:
      true,

    /*
     * Protección explícita:
     *
     * El motor NO puede transformar
     * automáticamente toda una operación
     * ROUND_TRIP en FOREIGN_ROUTE.
     */
    preferRoundTripWhenFeasible:
      true,

    allowAutomaticForeignConversion:
      false,

    /*
     * Futuro:
     *
     * Podremos analizar por clusters
     * una solución híbrida, pero será
     * una recomendación independiente.
     */
    allowHybridAdvisory:
      input.allowHybridAdvisory ===
      true,

    compareRealRoadRoutes:
      true,

    validateWithGoogleRoutes:
      true,

    maxForeignDays:
      normalizePositiveInteger(
        input.maxForeignDays,
        3
      ),

    priorities: {
      coverage:
        PLANNING_PRIORITY
          .COVERAGE,

      operationalFeasibility:
        PLANNING_PRIORITY
          .OPERATIONAL_FEASIBILITY,

      territorialCoherence:
        PLANNING_PRIORITY
          .TERRITORIAL_COHERENCE,

      avoidUnnecessaryForeign:
        PLANNING_PRIORITY
          .AVOID_UNNECESSARY_FOREIGN,

      minimizeRequiredResources:
        PLANNING_PRIORITY
          .MINIMIZE_REQUIRED_RESOURCES,

      minimizeOperationalTime:
        PLANNING_PRIORITY
          .MINIMIZE_OPERATIONAL_TIME,

      minimizeDeadhead:
        PLANNING_PRIORITY
          .MINIMIZE_DEADHEAD,

      minimizeDistance:
        PLANNING_PRIORITY
          .MINIMIZE_DISTANCE,

      minimizeCost:
        PLANNING_PRIORITY
          .MINIMIZE_COST,

      balanceWorkload:
        PLANNING_PRIORITY
          .BALANCE_WORKLOAD
    }
  }
}

/**
 * Determina si el motor tiene autorización
 * para cambiar el tipo de operación.
 *
 * En la fase actual SIEMPRE es false.
 *
 * @param {object} policy
 * @returns {boolean}
 */
export function canAutomaticallyChangeRouteMode(
  policy
) {
  return (
    policy
      ?.routeModeAuthority ===
        ROUTE_MODE_AUTHORITY
          .HYBRID_ADVISORY &&
    policy
      ?.allowAutomaticForeignConversion ===
        true
  )
}

/**
 * Indica si una solución ROUND_TRIP
 * puede convertirse automáticamente
 * a FOREIGN_ROUTE.
 *
 * Actualmente está prohibido.
 *
 * @returns {boolean}
 */
export function canConvertRoundTripToForeign() {
  return false
}

/**
 * Construye el contrato mínimo que
 * debe recibir el planificador.
 *
 * @param {object} params
 * @returns {object}
 */
export function buildPlanningContract({
  routeMode,
  maxForeignDays = 3,
  resourcePlanningMode =
    RESOURCE_PLANNING_MODE
      .AUTO_REQUIREMENTS,

  availableOperators = null,
  availableVehicles = null,

  allowHybridAdvisory = false
} = {}) {
  return normalizePlanningPolicy({
    routeMode,

    maxForeignDays,

    resourcePlanningMode,

    availableOperators,

    availableVehicles,

    allowHybridAdvisory
  })
}

/**
 * Explica qué debe calcular el motor.
 *
 * Útil para logs, debugging y frontend.
 *
 * @param {object} policy
 * @returns {object}
 */
export function describePlanningPolicy(
  policy
) {
  const normalized =
    normalizePlanningPolicy(
      policy
    )

  if (
    normalized.routeMode ===
    ROUTE_OPERATION_MODE
      .FOREIGN_ROUTE
  ) {
    return {
      operation:
        'FOREIGN_ROUTE',

      requirement:
        'CALCULATE_REQUIRED_EXPEDITIONS',

      determines: [
        'requiredRoutes',
        'requiredOperators',
        'requiredVehicles',
        'requiredDays'
      ],

      userProvidesCapacity:
        normalized
          .resourcePlanningMode ===
        RESOURCE_PLANNING_MODE
          .CAPACITY_SIMULATION,

      automaticRouteModeChange:
        false
    }
  }

  return {
    operation:
      'ROUND_TRIP',

    requirement:
      'CALCULATE_REQUIRED_ROUND_TRIPS',

    determines: [
      'requiredRoutes',
      'requiredOperators',
      'requiredVehicles'
    ],

    userProvidesCapacity:
      normalized
        .resourcePlanningMode ===
      RESOURCE_PLANNING_MODE
        .CAPACITY_SIMULATION,

    automaticRouteModeChange:
      false
  }
}

export default Object.freeze({
  ROUTE_OPERATION_MODE,
  RESOURCE_PLANNING_MODE,
  ROUTE_MODE_AUTHORITY,
  PLANNING_OBJECTIVE,
  PLANNING_PRIORITY,

  normalizeRouteOperationMode,
  normalizePlanningPolicy,
  canAutomaticallyChangeRouteMode,
  canConvertRoundTripToForeign,
  buildPlanningContract,
  describePlanningPolicy
})