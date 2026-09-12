// backend/scripts/test-planning-result-modes.js

import {
  buildRecommendedPlanningResult,
  MOTOR_RESULT_VERSION
} from '../routing/engine/resultBuilder.js'

/**
 * ============================================================
 * F8A.6H
 * UNIVERSAL PLANNING RESULT CONTRACT
 * ============================================================
 *
 * Valida:
 *
 * ROUND_TRIP
 * FOREIGN_ROUTE
 *
 * contra exactamente el mismo contrato.
 *
 * NO consume Google.
 */

/**
 * ============================================================
 * ROUND_TRIP
 * ============================================================
 */

const roundRoutes = [
  {
    vehicleLabel:
      'ROUND_ROUTE_1',

    pointKeys: [
      '1',
      '2',
      '3',
      '4',
      '5'
    ]
  },

  {
    vehicleLabel:
      'ROUND_ROUTE_2',

    pointKeys: [
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12'
    ]
  },

  {
    vehicleLabel:
      'ROUND_ROUTE_3',

    pointKeys: [
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19'
    ]
  }
]

const roundPlanner = {
  feasible:
    true,

  status:
    'FEASIBLE',

  routeMode:
    'ROUND_TRIP',

  requiredRoutes:
    3,

  requiredOperators:
    3,

  requiredVehicles:
    3,

  requiredDays:
    1,

  targetOperationalDays:
    1,

  coveragePercent:
    100,

  allDestinationsAssigned:
    true,

  solverCalls:
    4,

  lowerBound:
    2,

  upperBound:
    3,

  routes:
    roundRoutes
}

const roundFinalValidation = {
  status:
    'VERIFIED',

  verified:
    true,

  routeCount:
    3,

  normalRoutes:
    3,

  extendedReturnRoutes:
    0,

  infeasibleRouteCount:
    0,

  invalidRouteCount:
    0,

  maxGraceUsedMinutes:
    0,

  totals: {
    distanceMeters:
      400600,

    travelDurationSeconds:
      27960,

    operationalDurationSeconds:
      79200,

    maximumRouteOperationalSeconds:
      28620
  }
}

const roundQuality = {
  status:
    'PASS',

  acceptable:
    true,

  passedRouteCount:
    3,

  reviewRouteCount:
    0,

  rejectedRouteCount:
    0
}

/**
 * ============================================================
 * FOREIGN_ROUTE
 * ============================================================
 */

const foreignPointKeys =
  Array.from(
    {
      length:
        19
    },
    (
      _,
      index
    ) =>
      String(
        index +
        1
      )
  )

const foreignRoutes = [
  {
    vehicleLabel:
      'FOREIGN_EXPEDITION_1',

    pointKeys:
      foreignPointKeys,

    requiredDays:
      3,

    daysUsed:
      3,

    /*
     * Aproximaciones del caso real
     * sólo para probar contrato.
     */
    travelDurationSeconds:
      4 *
        3600 +
      29 *
        60,

    visitDurationSeconds:
      19 *
      45 *
      60,

    breakDurationSeconds:
      2 *
      52200,

    waitDurationSeconds:
      0,

    totalDurationSeconds:
      2 *
        86400 +
      2 *
        3600 +
      25 *
        60
  }
]

const foreignPlanner = {
  feasible:
    true,

  status:
    'FEASIBLE',

  routeMode:
    'FOREIGN_ROUTE',

  requiredRoutes:
    1,

  requiredOperators:
    1,

  requiredVehicles:
    1,

  requiredDays:
    3,

  maxForeignDays:
    3,

  coveragePercent:
    100,

  allDestinationsAssigned:
    true,

  solverCalls:
    2,

  lowerBound:
    1,

  upperBound:
    1,

  routes:
    foreignRoutes
}

const foreignFinalValidation = {
  status:
    'VERIFIED',

  verified:
    true,

  routeCount:
    1,

  verifiedRouteCount:
    1,

  partialRouteCount:
    0,

  infeasibleRouteCount:
    0,

  invalidRouteCount:
    0,

  requiredDays:
    3,

  normalDays:
    1,

  extendedCloseDays:
    2,

  infeasibleDays:
    0,

  totals: {
    distanceMeters:
      203700,

    travelDurationSeconds:
      4 *
        3600 +
      33 *
        60
  }
}

const foreignQuality = {
  status:
    'PASS',

  acceptable:
    true,

  passedRouteCount:
    1,

  reviewRouteCount:
    0,

  rejectedRouteCount:
    0
}

/**
 * ============================================================
 * BUILD
 * ============================================================
 */

const roundResult =
  buildRecommendedPlanningResult({
    context: {
      area:
        'OPERACIONES',

      estado:
        'Aguascalientes',

      proyecto:
        'Aguascalientes',

      regionSanitaria:
        'Calvillo'
    },

    engine: {
      routingProvider:
        'GOOGLE_ROUTES',

      optimizationProvider:
        'GOOGLE_ROUTE_OPTIMIZATION'
    },

    request: {
      routeMode:
        'ROUND_TRIP',

      returnToOrigin:
        true
    },

    planner:
      roundPlanner,

    finalValidation:
      roundFinalValidation,

    routeQuality:
      roundQuality,

    demand: {
      totalDestinations:
        19
    }
  })

const foreignResult =
  buildRecommendedPlanningResult({
    context: {
      area:
        'OPERACIONES',

      estado:
        'Aguascalientes',

      proyecto:
        'Aguascalientes',

      regionSanitaria:
        'Calvillo'
    },

    engine: {
      routingProvider:
        'GOOGLE_ROUTES',

      optimizationProvider:
        'GOOGLE_ROUTE_OPTIMIZATION'
    },

    request: {
      routeMode:
        'FOREIGN_ROUTE',

      returnToOrigin:
        true,

      maxForeignDays:
        3
    },

    planner:
      foreignPlanner,

    finalValidation:
      foreignFinalValidation,

    routeQuality:
      foreignQuality,

    demand: {
      totalDestinations:
        19
    }
  })

/**
 * ============================================================
 * PRINT
 * ============================================================
 */

console.log(
  '\n=================================================='
)

console.log(
  ` MOTOR RESULT CONTRACT ${MOTOR_RESULT_VERSION}`
)

console.log(
  '=================================================='
)

console.log(
  '\nROUND_TRIP'
)

console.dir(
  {
    status:
      roundResult.status,

    analysisStatus:
      roundResult.analysisStatus,

    request:
      roundResult.request,

    planning:
      roundResult.planning,

    capacity:
      roundResult.capacity,

    assignment:
      roundResult.assignment
  },
  {
    depth:
      null
  }
)

console.log(
  '\nFOREIGN_ROUTE'
)

console.dir(
  {
    status:
      foreignResult.status,

    analysisStatus:
      foreignResult.analysisStatus,

    request:
      foreignResult.request,

    planning:
      foreignResult.planning,

    capacity:
      foreignResult.capacity,

    assignment:
      foreignResult.assignment
  },
  {
    depth:
      null
  }
)

/**
 * ============================================================
 * ASSERTIONS — ROUND
 * ============================================================
 */

const roundOk =
  roundResult.status ===
    'SUCCESS' &&

  roundResult
    .planning
    .status ===
    'FEASIBLE' &&

  roundResult
    .planning
    .recommendationStatus ===
    'READY' &&

  roundResult
    .planning
    .routeMode ===
    'ROUND_TRIP' &&

  roundResult
    .planning
    .requiredResources
    .routes ===
    3 &&

  roundResult
    .planning
    .requiredResources
    .operators ===
    3 &&

  roundResult
    .planning
    .requiredResources
    .vehicles ===
    3 &&

  roundResult
    .planning
    .requiredResources
    .days ===
    1 &&

  roundResult
    .planning
    .feasibility
    .roundTrip
    .normalRoutes ===
    3 &&

  roundResult
    .planning
    .feasibility
    .roundTrip
    .extendedReturnRoutes ===
    0 &&

  roundResult
    .planning
    .feasibility
    .foreign ===
    null &&

  roundResult
    .request
    .operatorCountRequested ===
    null &&

  roundResult
    .capacity
    .status ===
    'NOT_EVALUATED' &&

  roundResult
    .assignment
    .status ===
    'NOT_EVALUATED' &&

  roundResult
    .assignment
    .unassignedRoutes ===
    null

/**
 * ============================================================
 * ASSERTIONS — FOREIGN
 * ============================================================
 */

const foreignOk =
  foreignResult.status ===
    'SUCCESS' &&

  foreignResult
    .planning
    .status ===
    'FEASIBLE' &&

  foreignResult
    .planning
    .recommendationStatus ===
    'READY' &&

  foreignResult
    .planning
    .routeMode ===
    'FOREIGN_ROUTE' &&

  foreignResult
    .planning
    .requiredResources
    .routes ===
    1 &&

  foreignResult
    .planning
    .requiredResources
    .operators ===
    1 &&

  foreignResult
    .planning
    .requiredResources
    .vehicles ===
    1 &&

  foreignResult
    .planning
    .requiredResources
    .days ===
    3 &&

  foreignResult
    .planning
    .feasibility
    .foreign
    .requiredDays ===
    3 &&

  foreignResult
    .planning
    .feasibility
    .foreign
    .normalDays ===
    1 &&

  foreignResult
    .planning
    .feasibility
    .foreign
    .extendedCloseDays ===
    2 &&

  foreignResult
    .planning
    .feasibility
    .foreign
    .infeasibleDays ===
    0 &&

  foreignResult
    .planning
    .feasibility
    .roundTrip ===
    null &&

  foreignResult
    .planning
    .quality
    .status ===
    'PASS' &&

  foreignResult
    .request
    .operatorCountRequested ===
    null &&

  foreignResult
    .capacity
    .status ===
    'NOT_EVALUATED' &&

  foreignResult
    .assignment
    .status ===
    'NOT_EVALUATED' &&

  foreignResult
    .assignment
    .unassignedRoutes ===
    null

/**
 * ============================================================
 * VERDICT
 * ============================================================
 */

console.log(
  '\n=================================================='
)

console.log(
  ' VEREDICTO'
)

console.log(
  '=================================================='
)

console.log(
  `ROUND_TRIP contract: ${
    roundOk
      ? 'OK ✓'
      : 'ERROR'
  }`
)

console.log(
  `FOREIGN_ROUTE contract: ${
    foreignOk
      ? 'OK ✓'
      : 'ERROR'
  }`
)

if (
  roundOk &&
  foreignOk
) {
  console.log(
    '\nUNIVERSAL PLANNING RESULT CONTRACT OK ✓'
  )

  console.log(
    'ROUND_TRIP y FOREIGN_ROUTE hablan el mismo contrato.'
  )

  console.log(
    'Planning, Capacity y Assignment permanecen separados.'
  )
} else {
  console.error(
    '\nEL CONTRATO UNIVERSAL REQUIERE REVISIÓN.'
  )

  process.exitCode =
    1
}