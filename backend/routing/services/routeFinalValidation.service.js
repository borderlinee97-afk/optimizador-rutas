// backend/routing/services/routeFinalValidation.service.js

import {
  computeGoogleRoute,
  GOOGLE_ROUTING_PREFERENCES,
  parseGoogleDurationSeconds
} from '../providers/googleRoutes.provider.js'

import {
  normalizePlannerWorkday,
  ROUTE_WORKDAY_STATUS
} from './automaticResourcePlanner.service.js'

/**
 * ============================================================
 * GOOGLE ROUTES FINAL VALIDATION
 * ============================================================
 *
 * Route Optimization decide:
 *
 * - cuántas rutas
 * - qué unidades pertenecen a cada ruta
 * - orden de visita
 *
 * Google Routes valida posteriormente:
 *
 * - carretera real
 * - distancia real de conducción
 * - duración de conducción
 * - geometría
 * - secuencia exacta
 * - regreso al origen
 *
 * IMPORTANTE:
 *
 * Google Routes calcula tiempo de CONDUCCIÓN.
 *
 * Nosotros agregamos:
 *
 * serviceMinutesPerUnit
 *
 * para reconstruir la jornada operativa.
 *
 * La secuencia NO se vuelve a optimizar aquí.
 *
 * optimizeWaypointOrder = false
 *
 * porque Route Optimization ya decidió el orden.
 */

export const FINAL_ROUTE_VALIDATION_STATUS =
  Object.freeze({
    VERIFIED:
      'VERIFIED',

    PARTIAL:
      'PARTIAL',

    INFEASIBLE:
      'INFEASIBLE',

    PROVIDER_ERROR:
      'PROVIDER_ERROR',

    INVALID_INPUT:
      'INVALID_INPUT'
  })

export const FINAL_ROUTE_VALIDATION_SOURCE =
  'GOOGLE_ROUTES'

const DEFAULT_TOLERANCE_SECONDS =
  60

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function round(
  value,
  decimals = 2
) {
  const number =
    Number(value)

  if (!Number.isFinite(number)) {
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

function getPointKey(
  point,
  index = 0
) {
  if (point?.__plannerKey) {
    return String(
      point.__plannerKey
    )
  }

  if (
    point?.id !== null &&
    point?.id !== undefined
  ) {
    return (
      `id:${String(point.id)}`
    )
  }

  return [
    'geo',
    Number(point?.lat),
    Number(point?.lng),
    index
  ].join(':')
}

function buildPointLookup(
  points = []
) {
  const lookup =
    new Map()

  const safePoints =
    Array.isArray(points)
      ? points
      : []

  safePoints.forEach(
    (
      point,
      index
    ) => {
      lookup.set(
        getPointKey(
          point,
          index
        ),
        point
      )
    }
  )

  return lookup
}

function parseClockSeconds(
  value
) {
  const match =
    String(
      value || ''
    )
      .trim()
      .match(
        /^(\d{1,2}):(\d{2})$/
      )

  if (!match) {
    return null
  }

  const hour =
    Number(match[1])

  const minute =
    Number(match[2])

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null
  }

  return (
    hour *
    3600 +
    minute *
    60
  )
}

function secondsBetweenClocks(
  startClock,
  endClock
) {
  const start =
    parseClockSeconds(
      startClock
    )

  const end =
    parseClockSeconds(
      endClock
    )

  if (
    start === null ||
    end === null
  ) {
    return null
  }

  let difference =
    end -
    start

  if (
    difference <
    0
  ) {
    difference +=
      24 *
      3600
  }

  return difference
}

function addSecondsToIso(
  iso,
  seconds
) {
  const start =
    Date.parse(
      iso
    )

  if (
    !Number.isFinite(start)
  ) {
    return null
  }

  const delta =
    Number(seconds)

  if (
    !Number.isFinite(delta)
  ) {
    return null
  }

  return new Date(
    start +
    delta *
    1000
  ).toISOString()
}

function sumDurations(
  values = []
) {
  let total =
    0

  for (
    const value
    of values
  ) {
    const seconds =
      parseGoogleDurationSeconds(
        value
      )

    if (
      seconds === null
    ) {
      return null
    }

    total +=
      seconds
  }

  return total
}

/**
 * ============================================================
 * PUNTOS DE UNA RUTA
 * ============================================================
 */

export function resolvePlannedRoutePoints({
  plannedRoute,
  pointLookup
} = {}) {
  const keys =
    Array.isArray(
      plannedRoute?.pointKeys
    )
      ? plannedRoute.pointKeys
      : []

  const points =
    []

  const missingKeys =
    []

  for (
    const key
    of keys
  ) {
    const point =
      pointLookup.get(
        String(key)
      )

    if (!point) {
      missingKeys.push(
        String(key)
      )

      continue
    }

    points.push(
      point
    )
  }

  return {
    keys:
      keys.map(String),

    points,

    missingKeys,

    valid:
      keys.length >
        0 &&
      missingKeys.length ===
        0 &&
      points.length ===
        keys.length
  }
}

/**
 * ============================================================
 * RECONSTRUCCIÓN DE JORNADA
 * ============================================================
 *
 * Ejemplo:
 *
 * 08:00 salida
 *   ↓ viaje leg 0
 * 09:20 llegada stop 1
 *   ↓ 45 min servicio
 * 10:05 salida stop 1
 *   ↓ viaje leg 1
 * ...
 *   ↓
 * última unidad <= 16:00
 *   ↓ servicio
 *   ↓ regreso
 * CEDIS <= 17:30
 */

export function buildRoundTripOperationalSchedule({
  googleRoute,
  stopCount,
  departureTime,
  workday = {},
  toleranceSeconds =
    DEFAULT_TOLERANCE_SECONDS
} = {}) {
  const normalizedWorkday =
    normalizePlannerWorkday(
      workday
    )

  const legs =
    Array.isArray(
      googleRoute?.legs
    )
      ? googleRoute.legs
      : []

  const expectedLegCount =
    Number(stopCount) +
    1

  const errors =
    []

  if (
    legs.length !==
    expectedLegCount
  ) {
    errors.push({
      code:
        'UNEXPECTED_LEG_COUNT',

      expected:
        expectedLegCount,

      received:
        legs.length
    })
  }

  const arrivalLimitSeconds =
    secondsBetweenClocks(
      normalizedWorkday
        .startClock,

      normalizedWorkday
        .lastArrivalClock
    )

  if (
    arrivalLimitSeconds ===
    null
  ) {
    errors.push({
      code:
        'INVALID_ARRIVAL_CLOCK_POLICY'
    })
  }

  let elapsedSeconds =
    0

  const stops =
    []

  let unknownLegDuration =
    false

  const safeStopCount =
    Math.max(
      0,
      Number(stopCount) ||
      0
    )

  for (
    let stopIndex = 0;
    stopIndex <
      safeStopCount;
    stopIndex++
  ) {
    const leg =
      legs[
        stopIndex
      ]

    const travelSeconds =
      parseGoogleDurationSeconds(
        leg?.duration
      )

    if (
      travelSeconds ===
      null
    ) {
      unknownLegDuration =
        true

      errors.push({
        code:
          'UNKNOWN_LEG_DURATION',

        legIndex:
          stopIndex
      })

      continue
    }

    elapsedSeconds +=
      travelSeconds

    const arrivalElapsedSeconds =
      elapsedSeconds

    const arrivalWithinWindow =
      arrivalLimitSeconds !==
        null &&
      arrivalElapsedSeconds <=
        (
          arrivalLimitSeconds +
          toleranceSeconds
        )

    const arrivalTime =
      addSecondsToIso(
        departureTime,
        arrivalElapsedSeconds
      )

    elapsedSeconds +=
      normalizedWorkday
        .serviceSecondsPerUnit

    const serviceEndElapsedSeconds =
      elapsedSeconds

    const serviceEndTime =
      addSecondsToIso(
        departureTime,
        serviceEndElapsedSeconds
      )

    stops.push({
      stopIndex,

      legIndex:
        stopIndex,

      travelSeconds,

      arrivalElapsedSeconds,

      arrivalTime,

      arrivalWithinWindow,

      serviceSeconds:
        normalizedWorkday
          .serviceSecondsPerUnit,

      serviceEndElapsedSeconds,

      serviceEndTime
    })
  }

  /*
   * Último leg:
   *
   * última unidad -> origen.
   */
  const returnLegIndex =
    safeStopCount

  const returnLeg =
    legs[
      returnLegIndex
    ]

  const returnTravelSeconds =
    parseGoogleDurationSeconds(
      returnLeg?.duration
    )

  if (
    returnTravelSeconds ===
    null
  ) {
    unknownLegDuration =
      true

    errors.push({
      code:
        'UNKNOWN_RETURN_LEG_DURATION',

      legIndex:
        returnLegIndex
    })
  } else {
    elapsedSeconds +=
      returnTravelSeconds
  }

  const totalOperationalSeconds =
    unknownLegDuration
      ? null
      : elapsedSeconds

  const lastStop =
    stops.length
      ? stops[
          stops.length -
          1
        ]
      : null

  const allArrivalsWithinWindow =
    stops.length ===
      safeStopCount &&
    stops.every(
      stop =>
        stop.arrivalWithinWindow
    )

  let workdayStatus =
    ROUTE_WORKDAY_STATUS
      .UNKNOWN

  let graceUsedSeconds =
    null

  if (
    totalOperationalSeconds !==
    null
  ) {
    graceUsedSeconds =
      Math.max(
        0,

        totalOperationalSeconds -
        normalizedWorkday
          .shiftSeconds
      )

    if (
      totalOperationalSeconds <=
      (
        normalizedWorkday
          .shiftSeconds +
        toleranceSeconds
      )
    ) {
      workdayStatus =
        ROUTE_WORKDAY_STATUS
          .NORMAL

      graceUsedSeconds =
        0
    } else if (
      totalOperationalSeconds <=
      (
        normalizedWorkday
          .maxRouteSeconds +
        toleranceSeconds
      )
    ) {
      workdayStatus =
        ROUTE_WORKDAY_STATUS
          .EXTENDED_RETURN
    } else {
      workdayStatus =
        ROUTE_WORKDAY_STATUS
          .INFEASIBLE
    }
  }

  const returnTime =
    totalOperationalSeconds !==
      null
      ? addSecondsToIso(
          departureTime,
          totalOperationalSeconds
        )
      : null

  const scheduleValid =
    errors.length ===
      0 &&
    allArrivalsWithinWindow &&
    (
      workdayStatus ===
        ROUTE_WORKDAY_STATUS
          .NORMAL ||
      workdayStatus ===
        ROUTE_WORKDAY_STATUS
          .EXTENDED_RETURN
    )

  return {
    valid:
      scheduleValid,

    workdayStatus,

    departureTime,

    returnTime,

    stopCount:
      safeStopCount,

    expectedLegCount,

    receivedLegCount:
      legs.length,

    preferredShiftSeconds:
      normalizedWorkday
        .shiftSeconds,

    returnGraceSeconds:
      normalizedWorkday
        .returnGraceSeconds,

    maxRouteSeconds:
      normalizedWorkday
        .maxRouteSeconds,

    lastArrivalLimitSeconds:
      arrivalLimitSeconds,

    allArrivalsWithinWindow,

    lastArrivalElapsedSeconds:
      lastStop
        ?.arrivalElapsedSeconds ??
      null,

    lastArrivalTime:
      lastStop
        ?.arrivalTime ??
      null,

    totalOperationalSeconds,

    graceUsedSeconds,

    graceUsedMinutes:
      graceUsedSeconds !==
        null
        ? round(
            graceUsedSeconds /
            60,
            1
          )
        : null,

    returnTravelSeconds:
      returnTravelSeconds ??
      null,

    stops,

    errors
  }
}

/**
 * ============================================================
 * VALIDAR UNA RUTA
 * ============================================================
 */

export async function validateOnePlannedRoundTrip({
  plannedRoute,
  routeIndex,
  origin,
  pointLookup,
  workday = {},

  departureTime = null,

  routingPreference =
    GOOGLE_ROUTING_PREFERENCES
      .TRAFFIC_AWARE,

  avoidTolls = false,

  signal = undefined
} = {}) {
  const resolved =
    resolvePlannedRoutePoints({
      plannedRoute,
      pointLookup
    })

  if (!resolved.valid) {
    return {
      routeIndex,

      status:
        FINAL_ROUTE_VALIDATION_STATUS
          .INVALID_INPUT,

      verified:
        false,

      baseRouteUsable:
        true,

      pointKeys:
        resolved.keys,

      missingPointKeys:
        resolved.missingKeys,

      errors: [
        {
          code:
            'PLANNED_ROUTE_POINTS_UNRESOLVED',

          missingPointKeys:
            resolved.missingKeys
        }
      ]
    }
  }

  const effectiveDepartureTime =
    plannedRoute
      ?.vehicleStartTime ||
    departureTime

  if (!effectiveDepartureTime) {
    return {
      routeIndex,

      status:
        FINAL_ROUTE_VALIDATION_STATUS
          .INVALID_INPUT,

      verified:
        false,

      baseRouteUsable:
        true,

      pointKeys:
        resolved.keys,

      errors: [
        {
          code:
            'DEPARTURE_TIME_REQUIRED'
        }
      ]
    }
  }

  let googleRoute

  try {
    googleRoute =
      await computeGoogleRoute({
        origin,

        destination:
          origin,

        intermediates:
          resolved.points,

        /*
         * Route Optimization ya decidió
         * el orden.
         */
        optimizeWaypointOrder:
          false,

        routingPreference,

        departureTime:
          effectiveDepartureTime,

        avoidTolls,

        /*
         * F8A.6D:
         *
         * todavía no pedimos cálculos extra
         * de peajes/tráfico/fuel.
         *
         * El routingPreference sí permite
         * duración sensible a tráfico.
         */
        includeTolls:
          false,

        includeTraffic:
          false,

        includeFuel:
          false,

        showAlternatives:
          false,

        signal
      })
  } catch (error) {
    return {
      routeIndex,

      status:
        FINAL_ROUTE_VALIDATION_STATUS
          .PROVIDER_ERROR,

      verified:
        false,

      baseRouteUsable:
        true,

      pointKeys:
        resolved.keys,

      provider:
        FINAL_ROUTE_VALIDATION_SOURCE,

      error: {
        name:
          error?.name ||
          'Error',

        code:
          error?.code ||
          null,

        status:
          error?.status ||
          null,

        message:
          error?.message ||
          String(error),

        details:
          error?.details ||
          null
      }
    }
  }

  if (!googleRoute) {
    return {
      routeIndex,

      status:
        FINAL_ROUTE_VALIDATION_STATUS
          .INFEASIBLE,

      verified:
        false,

      baseRouteUsable:
        true,

      pointKeys:
        resolved.keys,

      errors: [
        {
          code:
            'GOOGLE_ROUTES_NO_ROUTE'
        }
      ]
    }
  }

  const schedule =
    buildRoundTripOperationalSchedule({
      googleRoute,

      stopCount:
        resolved.points.length,

      departureTime:
        effectiveDepartureTime,

      workday
    })

  const routeTravelSeconds =
    parseGoogleDurationSeconds(
      googleRoute.duration
    )

  const routeStaticSeconds =
    parseGoogleDurationSeconds(
      googleRoute.staticDuration
    )

  const legTravelSeconds =
    sumDurations(
      (
        Array.isArray(
          googleRoute.legs
        )
          ? googleRoute.legs
          : []
      ).map(
        leg =>
          leg?.duration
      )
    )

  const plannedDurationSeconds =
    Number.isFinite(
      Number(
        plannedRoute
          ?.durationSeconds
      )
    )
      ? Number(
          plannedRoute
            .durationSeconds
        )
      : null

  const plannedDistanceMeters =
    Number.isFinite(
      Number(
        plannedRoute
          ?.distanceMeters
      )
    )
      ? Number(
          plannedRoute
            .distanceMeters
        )
      : null

  const finalDistanceMeters =
    Number.isFinite(
      Number(
        googleRoute
          ?.distanceMeters
      )
    )
      ? Number(
          googleRoute
            .distanceMeters
        )
      : null

  const durationDeltaSeconds =
    plannedDurationSeconds !==
      null &&
    schedule
      .totalOperationalSeconds !==
      null
      ? (
          schedule
            .totalOperationalSeconds -
          plannedDurationSeconds
        )
      : null

  const durationDeltaPercent =
    plannedDurationSeconds >
      0 &&
    durationDeltaSeconds !==
      null
      ? round(
          (
            durationDeltaSeconds /
            plannedDurationSeconds
          ) *
          100,
          2
        )
      : null

  const distanceDeltaMeters =
    plannedDistanceMeters !==
      null &&
    finalDistanceMeters !==
      null
      ? (
          finalDistanceMeters -
          plannedDistanceMeters
        )
      : null

  const distanceDeltaPercent =
    plannedDistanceMeters >
      0 &&
    distanceDeltaMeters !==
      null
      ? round(
          (
            distanceDeltaMeters /
            plannedDistanceMeters
          ) *
          100,
          2
        )
      : null

  const warnings =
    []

  if (
    durationDeltaPercent !==
      null &&
    Math.abs(
      durationDeltaPercent
    ) >
      15
  ) {
    warnings.push({
      code:
        'DURATION_PROVIDER_DEVIATION',

      deltaPercent:
        durationDeltaPercent
    })
  }

  if (
    distanceDeltaPercent !==
      null &&
    Math.abs(
      distanceDeltaPercent
    ) >
      15
  ) {
    warnings.push({
      code:
        'DISTANCE_PROVIDER_DEVIATION',

      deltaPercent:
        distanceDeltaPercent
    })
  }

  if (
    !googleRoute
      ?.polyline
      ?.encodedPolyline
  ) {
    warnings.push({
      code:
        'ROUTE_POLYLINE_MISSING'
    })
  }

  const verified =
    schedule.valid ===
    true

  return {
    routeIndex,

    status:
      verified
        ? FINAL_ROUTE_VALIDATION_STATUS
            .VERIFIED
        : FINAL_ROUTE_VALIDATION_STATUS
            .INFEASIBLE,

    verified,

    baseRouteUsable:
      true,

    provider:
      FINAL_ROUTE_VALIDATION_SOURCE,

    vehicleIndex:
      plannedRoute
        ?.vehicleIndex ??
      null,

    vehicleLabel:
      plannedRoute
        ?.vehicleLabel ??
      null,

    pointKeys:
      resolved.keys,

    stopCount:
      resolved.points.length,

    departureTime:
      effectiveDepartureTime,

    /*
     * Route Optimization.
     */
    optimization: {
      distanceMeters:
        plannedDistanceMeters,

      durationSeconds:
        plannedDurationSeconds
    },

    /*
     * Google Routes.
     */
    roadValidation: {
      distanceMeters:
        finalDistanceMeters,

      travelDurationSeconds:
        routeTravelSeconds,

      staticTravelDurationSeconds:
        routeStaticSeconds,

      legsTravelDurationSeconds:
        legTravelSeconds,

      polyline:
        googleRoute
          ?.polyline
          ?.encodedPolyline ||
        null,

      legs:
        Array.isArray(
          googleRoute?.legs
        )
          ? googleRoute.legs
          : []
    },

    /*
     * Jornada reconstruida:
     *
     * conducción + servicio.
     */
    schedule,

    comparison: {
      durationDeltaSeconds,

      durationDeltaPercent,

      distanceDeltaMeters,

      distanceDeltaPercent
    },

    warnings,

    errors:
      schedule.errors
  }
}

/**
 * ============================================================
 * VALIDAR PLAN COMPLETO
 * ============================================================
 */

export async function validateRoundTripPlanWithGoogleRoutes({
  plan,
  origin,
  points = [],
  workday = {},

  departureTime = null,

  routingPreference =
    GOOGLE_ROUTING_PREFERENCES
      .TRAFFIC_AWARE,

  avoidTolls = false,

  signal = undefined
} = {}) {
  if (
    !plan ||
    !Array.isArray(
      plan.routes
    ) ||
    !plan.routes.length
  ) {
    return {
      status:
        FINAL_ROUTE_VALIDATION_STATUS
          .INVALID_INPUT,

      verified:
        false,

      basePlanUsable:
        Boolean(
          plan?.feasible
        ),

      errors: [
        {
          code:
            'PLAN_WITH_ROUTES_REQUIRED'
        }
      ],

      routes: []
    }
  }

  const pointLookup =
    buildPointLookup(
      points
    )

  const results =
    []

  /*
   * Secuencial deliberadamente:
   *
   * limita presión sobre Google y facilita
   * diagnóstico por ruta.
   */
  for (
    let routeIndex = 0;
    routeIndex <
      plan.routes.length;
    routeIndex++
  ) {
    const result =
      await validateOnePlannedRoundTrip({
        plannedRoute:
          plan.routes[
            routeIndex
          ],

        routeIndex,

        origin,

        pointLookup,

        workday,

        departureTime,

        routingPreference,

        avoidTolls,

        signal
      })

    results.push(
      result
    )
  }

  const verifiedRoutes =
    results.filter(
      route =>
        route.verified ===
        true
    )

  const infeasibleRoutes =
    results.filter(
      route =>
        route.status ===
        FINAL_ROUTE_VALIDATION_STATUS
          .INFEASIBLE
    )

  const providerErrors =
    results.filter(
      route =>
        route.status ===
        FINAL_ROUTE_VALIDATION_STATUS
          .PROVIDER_ERROR
    )

  const invalidRoutes =
    results.filter(
      route =>
        route.status ===
        FINAL_ROUTE_VALIDATION_STATUS
          .INVALID_INPUT
    )

  let status

  if (
    infeasibleRoutes.length ||
    invalidRoutes.length
  ) {
    status =
      FINAL_ROUTE_VALIDATION_STATUS
        .INFEASIBLE
  } else if (
    providerErrors.length
  ) {
    status =
      FINAL_ROUTE_VALIDATION_STATUS
        .PARTIAL
  } else {
    status =
      FINAL_ROUTE_VALIDATION_STATUS
        .VERIFIED
  }

  const totalDistanceMeters =
    results.reduce(
      (
        accumulator,
        result
      ) =>
        accumulator +
        (
          Number(
            result
              ?.roadValidation
              ?.distanceMeters
          ) ||
          0
        ),
      0
    )

  const totalTravelSeconds =
    results.reduce(
      (
        accumulator,
        result
      ) =>
        accumulator +
        (
          Number(
            result
              ?.roadValidation
              ?.travelDurationSeconds
          ) ||
          0
        ),
      0
    )

  const totalOperationalSeconds =
    results.reduce(
      (
        accumulator,
        result
      ) =>
        accumulator +
        (
          Number(
            result
              ?.schedule
              ?.totalOperationalSeconds
          ) ||
          0
        ),
      0
    )

  const maximumRouteOperationalSeconds =
    results.reduce(
      (
        maximum,
        result
      ) =>
        Math.max(
          maximum,

          Number(
            result
              ?.schedule
              ?.totalOperationalSeconds
          ) ||
          0
        ),
      0
    )

  const normalRoutes =
    results.filter(
      result =>
        result
          ?.schedule
          ?.workdayStatus ===
        ROUTE_WORKDAY_STATUS
          .NORMAL
    ).length

  const extendedReturnRoutes =
    results.filter(
      result =>
        result
          ?.schedule
          ?.workdayStatus ===
        ROUTE_WORKDAY_STATUS
          .EXTENDED_RETURN
    ).length

  const maxGraceUsedMinutes =
    results.reduce(
      (
        maximum,
        result
      ) =>
        Math.max(
          maximum,

          Number(
            result
              ?.schedule
              ?.graceUsedMinutes
          ) ||
          0
        ),
      0
    )

  return {
    status,

    verified:
      status ===
      FINAL_ROUTE_VALIDATION_STATUS
        .VERIFIED,

    /*
     * Un fallo de esta capa no destruye
     * el plan base producido por
     * Route Optimization.
     */
    basePlanUsable:
      plan.feasible ===
      true,

    source:
      FINAL_ROUTE_VALIDATION_SOURCE,

    routeCount:
      results.length,

    verifiedRouteCount:
      verifiedRoutes.length,

    infeasibleRouteCount:
      infeasibleRoutes.length,

    providerErrorCount:
      providerErrors.length,

    invalidRouteCount:
      invalidRoutes.length,

    normalRoutes,

    extendedReturnRoutes,

    maxGraceUsedMinutes:
      round(
        maxGraceUsedMinutes,
        1
      ),

    totals: {
      distanceMeters:
        totalDistanceMeters,

      travelDurationSeconds:
        totalTravelSeconds,

      /*
       * Suma de horas-persona/vehículo
       * de todas las rutas.
       */
      operationalDurationSeconds:
        totalOperationalSeconds,

      /*
       * Tiempo calendario del plan:
       *
       * duración de la ruta más larga,
       * porque las rutas trabajan simultáneamente.
       */
      maximumRouteOperationalSeconds
    },

    routes:
      results
  }
}

export default Object.freeze({
  resolvePlannedRoutePoints,
  buildRoundTripOperationalSchedule,
  validateOnePlannedRoundTrip,
  validateRoundTripPlanWithGoogleRoutes
})