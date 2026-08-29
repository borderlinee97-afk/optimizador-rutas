// backend/routing/services/foreignFinalValidation.service.js

import {
  computeGoogleRoute,
  GOOGLE_ROUTING_PREFERENCES,
  parseGoogleDurationSeconds
} from '../providers/googleRoutes.provider.js'

import {
  normalizeForeignPlanningPolicy
} from './automaticForeignResourcePlanner.service.js'

/**
 * ============================================================
 * FOREIGN_ROUTE FINAL VALIDATION
 * ============================================================
 *
 * Route Optimization ya decidió:
 *
 * - expedición
 * - orden completo
 * - asignación de destinos
 * - días
 * - descansos
 *
 * Esta capa valida:
 *
 * 1. ventanas operativas por día
 * 2. última llegada <= límite diario
 * 3. servicio iniciado dentro del horario
 * 4. servicio/cierre dentro del máximo diario
 * 5. descansos nocturnos
 * 6. regreso final dentro del límite
 * 7. carretera real con Google Routes
 * 8. consistencia de distancia y conducción
 *
 * ============================================================
 *
 * IMPORTANTE:
 *
 * FOREIGN_ROUTE NO regresa al CEDIS diariamente.
 *
 * La validación carretera reconstruye:
 *
 * ORIGEN
 * → TODA LA SECUENCIA
 * → ORIGEN
 *
 * sin reordenar destinos.
 *
 * Los descansos y ventanas diarias se validan
 * mediante los timestamps producidos por
 * Route Optimization.
 */

export const FOREIGN_FINAL_VALIDATION_STATUS =
  Object.freeze({
    VERIFIED:
      'VERIFIED',

    PARTIAL:
      'PARTIAL',

    INFEASIBLE:
      'INFEASIBLE',

    INVALID_INPUT:
      'INVALID_INPUT'
  })

export const FOREIGN_DAY_STATUS =
  Object.freeze({
    NORMAL:
      'NORMAL',

    EXTENDED_CLOSE:
      'EXTENDED_CLOSE',

    INFEASIBLE:
      'INFEASIBLE'
  })

const DEFAULT_TIME_TOLERANCE_SECONDS =
  60

const GOOGLE_INTERMEDIATE_LIMIT =
  25

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function asArray(
  value
) {
  return Array.isArray(
    value
  )
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
    asFiniteNumber(
      value
    )

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

function parseClockSeconds(
  value
) {
  const match =
    String(
      value || ''
    )
      .trim()
      .match(
        /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
      )

  if (!match) {
    return null
  }

  const hour =
    Number(match[1])

  const minute =
    Number(match[2])

  const second =
    Number(
      match[3] ||
      0
    )

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null
  }

  return (
    hour *
      3600 +
    minute *
      60 +
    second
  )
}

function getLocalParts(
  value,
  timeZone
) {
  if (!value) {
    return null
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null
  }

  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
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

  const values =
    {}

  for (
    const part
    of formatter.formatToParts(
      date
    )
  ) {
    if (
      part.type ===
      'literal'
    ) {
      continue
    }

    values[
      part.type
    ] =
      part.value
  }

  return {
    year:
      Number(values.year),

    month:
      Number(values.month),

    day:
      Number(values.day),

    hour:
      Number(values.hour),

    minute:
      Number(values.minute),

    second:
      Number(values.second),

    date:
      `${values.year}-${values.month}-${values.day}`,

    secondsOfDay:
      Number(values.hour) *
        3600 +
      Number(values.minute) *
        60 +
      Number(values.second)
  }
}

function addSecondsToIso(
  value,
  seconds
) {
  const milliseconds =
    Date.parse(value)

  const delta =
    Number(seconds)

  if (
    !Number.isFinite(milliseconds) ||
    !Number.isFinite(delta)
  ) {
    return null
  }

  return new Date(
    milliseconds +
    delta *
      1000
  ).toISOString()
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
    point?.id !== null &&
    point?.id !== undefined
  ) {
    return (
      `id:${String(point.id)}`
    )
  }

  return (
    `index:${index}`
  )
}

function buildPointLookup(
  points = []
) {
  const lookup =
    new Map()

  asArray(points)
    .forEach(
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

/**
 * ============================================================
 * RESOLVE SEQUENCE
 * ============================================================
 */

export function resolveForeignRoutePoints({
  route,
  points = []
} = {}) {
  const lookup =
    buildPointLookup(
      points
    )

  const pointKeys =
    asArray(
      route?.pointKeys
    )
      .map(String)

  const resolved =
    []

  const missing =
    []

  pointKeys.forEach(
    key => {
      const point =
        lookup.get(key)

      if (!point) {
        missing.push(
          key
        )

        return
      }

      resolved.push(
        point
      )
    }
  )

  return {
    pointKeys,

    points:
      resolved,

    missing,

    valid:
      pointKeys.length >
        0 &&
      missing.length ===
        0 &&
      pointKeys.length ===
        resolved.length
  }
}

/**
 * ============================================================
 * BREAK NORMALIZATION
 * ============================================================
 */

function normalizeBreak(
  breakItem,
  timeZone
) {
  const startTime =
    breakItem?.startTime ||
    breakItem?.earliestStartTime ||
    null

  const durationSeconds =
    parseGoogleDurationSeconds(
      breakItem?.duration ??
      breakItem?.minDuration
    )

  const startParts =
    getLocalParts(
      startTime,
      timeZone
    )

  const endTime =
    (
      startTime &&
      durationSeconds !== null
    )
      ? addSecondsToIso(
          startTime,
          durationSeconds
        )
      : null

  return {
    startTime,

    endTime,

    durationSeconds,

    localDate:
      startParts?.date ||
      null,

    localStartSeconds:
      startParts
        ?.secondsOfDay ??
      null,

    raw:
      breakItem
  }
}

/**
 * ============================================================
 * DAILY SCHEDULE VALIDATION
 * ============================================================
 */

export function validateForeignOperationalSchedule({
  route,
  foreignPolicy = {},
  timeZone =
    'America/Mexico_City',
  toleranceSeconds =
    DEFAULT_TIME_TOLERANCE_SECONDS
} = {}) {
  const policy =
    normalizeForeignPlanningPolicy(
      foreignPolicy
    )

  const startClockSeconds =
    parseClockSeconds(
      policy.startClock
    )

  const lastArrivalSeconds =
    parseClockSeconds(
      policy.lastArrivalClock
    )

  const hardDayEndSeconds =
    (
      startClockSeconds +
      policy.shiftSeconds +
      policy.dayCloseTravelGraceSeconds
    )

  const normalShiftEndSeconds =
    (
      startClockSeconds +
      policy.shiftSeconds
    )

  const errors =
    []

  const warnings =
    []

  if (
    startClockSeconds === null ||
    lastArrivalSeconds === null
  ) {
    return {
      valid:
        false,

      errors: [
        {
          code:
            'INVALID_FOREIGN_CLOCK_POLICY'
        }
      ]
    }
  }

  if (
    hardDayEndSeconds >=
    86400
  ) {
    return {
      valid:
        false,

      errors: [
        {
          code:
            'FOREIGN_HARD_DAY_END_EXCEEDS_CALENDAR_DAY',

          hardDayEndSeconds
        }
      ]
    }
  }

  const days =
    asArray(
      route?.days
    )

  const normalizedBreaks =
    asArray(
      route?.breaks
    )
      .map(
        item =>
          normalizeBreak(
            item,
            timeZone
          )
      )

  const dayResults =
    []

  for (
    const day
    of days
  ) {
    const visits =
      asArray(
        day?.visits
      )

    const visitResults =
      []

    for (
      const visit
      of visits
    ) {
      const local =
        getLocalParts(
          visit.startTime,
          timeZone
        )

      if (!local) {
        errors.push({
          code:
            'FOREIGN_VISIT_TIME_INVALID',

          day:
            day.day,

          pointKey:
            visit.pointKey
        })

        continue
      }

      const arrivalWithinWindow =
        local.secondsOfDay >=
          (
            startClockSeconds -
            toleranceSeconds
          ) &&
        local.secondsOfDay <=
          (
            lastArrivalSeconds +
            toleranceSeconds
          )

      const serviceEndSeconds =
        local.secondsOfDay +
        policy
          .serviceSecondsPerUnit

      const serviceEndsBeforeHardClose =
        serviceEndSeconds <=
        (
          hardDayEndSeconds +
          toleranceSeconds
        )

      if (
        !arrivalWithinWindow
      ) {
        errors.push({
          code:
            'FOREIGN_LAST_ARRIVAL_WINDOW_VIOLATION',

          day:
            day.day,

          date:
            local.date,

          pointKey:
            visit.pointKey,

          arrivalSeconds:
            local.secondsOfDay,

          lastArrivalSeconds
        })
      }

      if (
        !serviceEndsBeforeHardClose
      ) {
        errors.push({
          code:
            'FOREIGN_SERVICE_EXCEEDS_HARD_DAY_CLOSE',

          day:
            day.day,

          date:
            local.date,

          pointKey:
            visit.pointKey,

          serviceEndSeconds,

          hardDayEndSeconds
        })
      }

      visitResults.push({
        pointKey:
          visit.pointKey,

        startTime:
          visit.startTime,

        localDate:
          local.date,

        arrivalSeconds:
          local.secondsOfDay,

        arrivalWithinWindow,

        serviceEndSeconds,

        serviceEndsBeforeHardClose
      })
    }

    const lastVisit =
      visitResults[
        visitResults.length -
          1
      ] ||
      null

    let status =
      FOREIGN_DAY_STATUS
        .NORMAL

    if (
      lastVisit
    ) {
      if (
        lastVisit
          .serviceEndSeconds >
        (
          hardDayEndSeconds +
          toleranceSeconds
        )
      ) {
        status =
          FOREIGN_DAY_STATUS
            .INFEASIBLE
      } else if (
        lastVisit
          .serviceEndSeconds >
        (
          normalShiftEndSeconds +
          toleranceSeconds
        )
      ) {
        /*
         * Servicio ya iniciado antes de las 16:00
         * y terminado después.
         *
         * Es completamente válido.
         */
        status =
          FOREIGN_DAY_STATUS
            .EXTENDED_CLOSE
      }
    }

    dayResults.push({
      day:
        day.day,

      date:
        day.date,

      status,

      visitCount:
        visitResults.length,

      visits:
        visitResults,

      firstVisitTime:
        visitResults[0]
          ?.startTime ||
        null,

      lastArrivalTime:
        lastVisit
          ?.startTime ||
        null,

      lastArrivalSeconds:
        lastVisit
          ?.arrivalSeconds ??
        null,

      lastServiceEndSeconds:
        lastVisit
          ?.serviceEndSeconds ??
        null
    })
  }

  /**
   * =========================================================
   * EXPEDITION START / END
   * =========================================================
   */

  const expeditionStart =
    getLocalParts(
      route?.vehicleStartTime,
      timeZone
    )

  const expeditionEnd =
    getLocalParts(
      route?.vehicleEndTime,
      timeZone
    )

  if (
    !expeditionStart ||
    !expeditionEnd
  ) {
    errors.push({
      code:
        'FOREIGN_EXPEDITION_START_END_INVALID'
    })
  }

  if (
    expeditionStart &&
    expeditionStart.secondsOfDay <
      (
        startClockSeconds -
        toleranceSeconds
      )
  ) {
    errors.push({
      code:
        'FOREIGN_EXPEDITION_STARTS_TOO_EARLY',

      startTime:
        route?.vehicleStartTime
    })
  }

  /*
   * El regreso al CEDIS sólo se exige al final
   * de toda la expedición.
   *
   * Puede ocurrir después de 16:00, siempre
   * dentro del hard close diario.
   */
  if (
    expeditionEnd &&
    expeditionEnd.secondsOfDay >
      (
        hardDayEndSeconds +
        toleranceSeconds
      )
  ) {
    errors.push({
      code:
        'FOREIGN_FINAL_RETURN_EXCEEDS_HARD_DAY_CLOSE',

      endTime:
        route?.vehicleEndTime,

      localEndSeconds:
        expeditionEnd.secondsOfDay,

      hardDayEndSeconds
    })
  }

  /**
   * =========================================================
   * BREAKS
   * =========================================================
   *
   * Para una expedición de N días esperamos
   * al menos N-1 descansos nocturnos.
   *
   * No exigimos que Google devuelva únicamente
   * ese número porque puede conservar break
   * requests externos al tramo efectivo.
   */

  const requiredDays =
    Math.max(
      1,
      Number(
        route?.requiredDays ||
        route?.daysUsed ||
        days.length ||
        1
      )
    )

  const expectedMinimumBreaks =
    Math.max(
      0,
      requiredDays -
        1
    )

  if (
    normalizedBreaks.length <
    expectedMinimumBreaks
  ) {
    errors.push({
      code:
        'FOREIGN_OVERNIGHT_BREAKS_MISSING',

      required:
        expectedMinimumBreaks,

      received:
        normalizedBreaks.length
    })
  }

  /*
   * Breaks del modelo actual deben empezar
   * aproximadamente al hard close.
   */
  normalizedBreaks.forEach(
    (
      breakItem,
      index
    ) => {
      if (
        breakItem
          .localStartSeconds ===
        null
      ) {
        warnings.push({
          code:
            'FOREIGN_BREAK_TIME_UNAVAILABLE',

          breakIndex:
            index
        })

        return
      }

      const deviation =
        Math.abs(
          breakItem
            .localStartSeconds -
          hardDayEndSeconds
        )

      if (
        deviation >
        toleranceSeconds
      ) {
        warnings.push({
          code:
            'FOREIGN_BREAK_START_DEVIATION',

          breakIndex:
            index,

          deviationSeconds:
            deviation
        })
      }
    }
  )

  const infeasibleDays =
    dayResults.filter(
      day =>
        day.status ===
        FOREIGN_DAY_STATUS
          .INFEASIBLE
    )

  const extendedCloseDays =
    dayResults.filter(
      day =>
        day.status ===
        FOREIGN_DAY_STATUS
          .EXTENDED_CLOSE
    )

  const normalDays =
    dayResults.filter(
      day =>
        day.status ===
        FOREIGN_DAY_STATUS
          .NORMAL
    )

  return {
    valid:
      errors.length ===
        0 &&
      infeasibleDays.length ===
        0,

    policy: {
      startClock:
        policy.startClock,

      lastArrivalClock:
        policy.lastArrivalClock,

      shiftSeconds:
        policy.shiftSeconds,

      serviceSecondsPerUnit:
        policy
          .serviceSecondsPerUnit,

      dayCloseTravelGraceSeconds:
        policy
          .dayCloseTravelGraceSeconds,

      normalShiftEndSeconds,

      hardDayEndSeconds,

      maxForeignDays:
        policy.maxForeignDays
    },

    requiredDays,

    activeDeliveryDays:
      days.length,

    expectedMinimumBreaks,

    receivedBreaks:
      normalizedBreaks.length,

    normalDays:
      normalDays.length,

    extendedCloseDays:
      extendedCloseDays.length,

    infeasibleDays:
      infeasibleDays.length,

    expeditionStartTime:
      route?.vehicleStartTime ||
      null,

    expeditionEndTime:
      route?.vehicleEndTime ||
      null,

    expeditionStartLocal:
      expeditionStart,

    expeditionEndLocal:
      expeditionEnd,

    days:
      dayResults,

    breaks:
      normalizedBreaks,

    warnings,

    errors
  }
}

/**
 * ============================================================
 * ROAD CHUNKS
 * ============================================================
 *
 * Compute Routes admite máximo 25 intermediates.
 *
 * Una expedición futura puede superar ese número,
 * por lo que no dejamos la validación limitada
 * al caso actual de 19 unidades.
 *
 * Cadena:
 *
 * ORIGEN
 * → stop1
 * → ...
 * → stopN
 * → ORIGEN
 *
 * Cada chunk preserva exactamente el orden.
 */

export function buildForeignRoadValidationChunks({
  origin,
  orderedPoints = []
} = {}) {
  const sequence =
    [
      origin,
      ...asArray(
        orderedPoints
      ),
      origin
    ]

  const chunks =
    []

  let startIndex =
    0

  /*
   * Cada Compute Routes puede abarcar:
   *
   * origin
   * + 25 intermediates
   * + destination
   *
   * = 26 legs como máximo.
   */
  const maximumLegsPerRequest =
    GOOGLE_INTERMEDIATE_LIMIT +
    1

  while (
    startIndex <
    sequence.length -
      1
  ) {
    const endIndex =
      Math.min(
        sequence.length -
          1,

        startIndex +
          maximumLegsPerRequest
      )

    const from =
      sequence[
        startIndex
      ]

    const to =
      sequence[
        endIndex
      ]

    const intermediates =
      sequence.slice(
        startIndex +
          1,

        endIndex
      )

    chunks.push({
      chunkIndex:
        chunks.length,

      startSequenceIndex:
        startIndex,

      endSequenceIndex:
        endIndex,

      origin:
        from,

      destination:
        to,

      intermediates,

      legCount:
        endIndex -
        startIndex
    })

    startIndex =
      endIndex
  }

  return chunks
}

/**
 * ============================================================
 * ROAD VALIDATION
 * ============================================================
 */

export async function validateForeignRoadSequence({
  origin,
  orderedPoints,
  departureTime,
  routingPreference =
    GOOGLE_ROUTING_PREFERENCES
      .TRAFFIC_AWARE,
  avoidTolls =
    false,
  signal =
    undefined
} = {}) {
  const chunks =
    buildForeignRoadValidationChunks({
      origin,
      orderedPoints
    })

  const results =
    []

  let totalDistanceMeters =
    0

  let totalTravelDurationSeconds =
    0

  let totalStaticDurationSeconds =
    0

  let travelDurationKnown =
    true

  let staticDurationKnown =
    true

  for (
    const chunk
    of chunks
  ) {
    try {
      const route =
        await computeGoogleRoute({
          origin:
            chunk.origin,

          destination:
            chunk.destination,

          intermediates:
            chunk.intermediates,

          /*
           * Route Optimization ya decidió
           * toda la secuencia.
           */
          optimizeWaypointOrder:
            false,

          routingPreference,

          departureTime,

          avoidTolls,

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

      if (!route) {
        results.push({
          chunkIndex:
            chunk.chunkIndex,

          verified:
            false,

          error: {
            code:
              'GOOGLE_ROUTES_NO_ROUTE'
          }
        })

        continue
      }

      const distanceMeters =
        asFiniteNumber(
          route.distanceMeters
        )

      const travelDurationSeconds =
        parseGoogleDurationSeconds(
          route.duration
        )

      const staticDurationSeconds =
        parseGoogleDurationSeconds(
          route.staticDuration
        )

      if (
        distanceMeters !==
        null
      ) {
        totalDistanceMeters +=
          distanceMeters
      }

      if (
        travelDurationSeconds ===
        null
      ) {
        travelDurationKnown =
          false
      } else {
        totalTravelDurationSeconds +=
          travelDurationSeconds
      }

      if (
        staticDurationSeconds ===
        null
      ) {
        staticDurationKnown =
          false
      } else {
        totalStaticDurationSeconds +=
          staticDurationSeconds
      }

      results.push({
        chunkIndex:
          chunk.chunkIndex,

        verified:
          true,

        legCount:
          chunk.legCount,

        distanceMeters,

        travelDurationSeconds,

        staticDurationSeconds,

        polyline:
          route
            ?.polyline
            ?.encodedPolyline ||
          null,

        legs:
          asArray(
            route?.legs
          )
      })
    } catch (
      error
    ) {
      results.push({
        chunkIndex:
          chunk.chunkIndex,

        verified:
          false,

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
      })
    }
  }

  const failedChunks =
    results.filter(
      result =>
        result.verified !==
        true
    )

  return {
    verified:
      results.length >
        0 &&
      failedChunks.length ===
        0,

    chunkCount:
      results.length,

    failedChunkCount:
      failedChunks.length,

    distanceMeters:
      totalDistanceMeters,

    travelDurationSeconds:
      travelDurationKnown
        ? totalTravelDurationSeconds
        : null,

    staticDurationSeconds:
      staticDurationKnown
        ? totalStaticDurationSeconds
        : null,

    chunks:
      results
  }
}

/**
 * ============================================================
 * ONE EXPEDITION
 * ============================================================
 */

export async function validateOneForeignExpedition({
  route,
  routeIndex,
  origin,
  points,
  foreignPolicy = {},
  timeZone =
    'America/Mexico_City',
  avoidTolls =
    false,
  signal =
    undefined
} = {}) {
  const resolved =
    resolveForeignRoutePoints({
      route,
      points
    })

  if (
    !resolved.valid
  ) {
    return {
      routeIndex,

      status:
        FOREIGN_FINAL_VALIDATION_STATUS
          .INVALID_INPUT,

      verified:
        false,

      baseRouteUsable:
        true,

      missingPointKeys:
        resolved.missing,

      errors: [
        {
          code:
            'FOREIGN_ROUTE_POINTS_UNRESOLVED',

          missing:
            resolved.missing
        }
      ]
    }
  }

  const schedule =
    validateForeignOperationalSchedule({
      route,

      foreignPolicy,

      timeZone
    })

  const road =
    await validateForeignRoadSequence({
      origin,

      orderedPoints:
        resolved.points,

      departureTime:
        route?.vehicleStartTime,

      routingPreference:
        GOOGLE_ROUTING_PREFERENCES
          .TRAFFIC_AWARE,

      avoidTolls,

      signal
    })

  const optimizationDistanceMeters =
    asFiniteNumber(
      route?.distanceMeters
    )

  const optimizationTravelSeconds =
    asFiniteNumber(
      route
        ?.travelDurationSeconds
    )

  const distanceDeltaMeters =
    (
      optimizationDistanceMeters !==
        null &&
      road.distanceMeters !==
        null
    )
      ? (
          road.distanceMeters -
          optimizationDistanceMeters
        )
      : null

  const distanceDeltaPercent =
    (
      optimizationDistanceMeters >
        0 &&
      distanceDeltaMeters !==
        null
    )
      ? round(
          (
            distanceDeltaMeters /
            optimizationDistanceMeters
          ) *
          100,
          2
        )
      : null

  const travelDeltaSeconds =
    (
      optimizationTravelSeconds !==
        null &&
      road.travelDurationSeconds !==
        null
    )
      ? (
          road.travelDurationSeconds -
          optimizationTravelSeconds
        )
      : null

  const travelDeltaPercent =
    (
      optimizationTravelSeconds >
        0 &&
      travelDeltaSeconds !==
        null
    )
      ? round(
          (
            travelDeltaSeconds /
            optimizationTravelSeconds
          ) *
          100,
          2
        )
      : null

  const warnings =
    [
      ...asArray(
        schedule.warnings
      )
    ]

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
        'FOREIGN_DISTANCE_PROVIDER_DEVIATION',

      deltaPercent:
        distanceDeltaPercent
    })
  }

  if (
    travelDeltaPercent !==
      null &&
    Math.abs(
      travelDeltaPercent
    ) >
      20
  ) {
    warnings.push({
      code:
        'FOREIGN_TRAVEL_TIME_PROVIDER_DEVIATION',

      deltaPercent:
        travelDeltaPercent
    })
  }

  let status

  if (
    !schedule.valid
  ) {
    status =
      FOREIGN_FINAL_VALIDATION_STATUS
        .INFEASIBLE
  } else if (
    !road.verified
  ) {
    /*
     * La ruta de Optimization sigue siendo
     * utilizable.
     *
     * Falló una capa de verificación adicional.
     */
    status =
      FOREIGN_FINAL_VALIDATION_STATUS
        .PARTIAL
  } else {
    status =
      FOREIGN_FINAL_VALIDATION_STATUS
        .VERIFIED
  }

  return {
    routeIndex,

    status,

    verified:
      status ===
      FOREIGN_FINAL_VALIDATION_STATUS
        .VERIFIED,

    baseRouteUsable:
      true,

    vehicleLabel:
      route?.vehicleLabel ||
      null,

    pointKeys:
      resolved.pointKeys,

    stopCount:
      resolved.points.length,

    requiredDays:
      route?.requiredDays ??
      null,

    optimization: {
      distanceMeters:
        optimizationDistanceMeters,

      travelDurationSeconds:
        optimizationTravelSeconds,

      totalDurationSeconds:
        asFiniteNumber(
          route
            ?.totalDurationSeconds
        ),

      breakDurationSeconds:
        asFiniteNumber(
          route
            ?.breakDurationSeconds
        ),

      visitDurationSeconds:
        asFiniteNumber(
          route
            ?.visitDurationSeconds
        )
    },

    schedule,

    roadValidation:
      road,

    comparison: {
      distanceDeltaMeters,

      distanceDeltaPercent,

      travelDeltaSeconds,

      travelDeltaPercent
    },

    warnings,

    errors:
      asArray(
        schedule.errors
      )
  }
}

/**
 * ============================================================
 * COMPLETE FOREIGN PLAN
 * ============================================================
 */

export async function validateForeignPlanWithGoogleRoutes({
  plan,
  origin,
  points,
  foreignPolicy = {},
  timeZone =
    'America/Mexico_City',
  avoidTolls =
    false,
  signal =
    undefined
} = {}) {
  const routes =
    asArray(
      plan?.routes
    )

  if (
    !routes.length
  ) {
    return {
      status:
        FOREIGN_FINAL_VALIDATION_STATUS
          .INVALID_INPUT,

      verified:
        false,

      basePlanUsable:
        Boolean(
          plan?.feasible
        ),

      routeCount:
        0,

      routes: [],

      errors: [
        {
          code:
            'FOREIGN_PLAN_ROUTES_REQUIRED'
        }
      ]
    }
  }

  const results =
    []

  /*
   * Secuencial:
   *
   * evita ráfagas innecesarias de requests
   * y facilita diagnóstico.
   */
  for (
    let routeIndex = 0;
    routeIndex <
      routes.length;
    routeIndex++
  ) {
    const result =
      await validateOneForeignExpedition({
        route:
          routes[
            routeIndex
          ],

        routeIndex,

        origin,

        points,

        foreignPolicy,

        timeZone,

        avoidTolls,

        signal
      })

    results.push(
      result
    )
  }

  const verifiedRoutes =
    results.filter(
      item =>
        item.status ===
        FOREIGN_FINAL_VALIDATION_STATUS
          .VERIFIED
    )

  const partialRoutes =
    results.filter(
      item =>
        item.status ===
        FOREIGN_FINAL_VALIDATION_STATUS
          .PARTIAL
    )

  const infeasibleRoutes =
    results.filter(
      item =>
        item.status ===
        FOREIGN_FINAL_VALIDATION_STATUS
          .INFEASIBLE
    )

  const invalidRoutes =
    results.filter(
      item =>
        item.status ===
        FOREIGN_FINAL_VALIDATION_STATUS
          .INVALID_INPUT
    )

  let status

  if (
    infeasibleRoutes.length ||
    invalidRoutes.length
  ) {
    status =
      FOREIGN_FINAL_VALIDATION_STATUS
        .INFEASIBLE
  } else if (
    partialRoutes.length
  ) {
    status =
      FOREIGN_FINAL_VALIDATION_STATUS
        .PARTIAL
  } else {
    status =
      FOREIGN_FINAL_VALIDATION_STATUS
        .VERIFIED
  }

  const totalRoadDistanceMeters =
    results.reduce(
      (
        total,
        route
      ) =>
        total +
        (
          Number(
            route
              ?.roadValidation
              ?.distanceMeters
          ) ||
          0
        ),
      0
    )

  const totalRoadTravelSeconds =
    results.reduce(
      (
        total,
        route
      ) =>
        total +
        (
          Number(
            route
              ?.roadValidation
              ?.travelDurationSeconds
          ) ||
          0
        ),
      0
    )

  const requiredDays =
    results.length
      ? Math.max(
          ...results.map(
            route =>
              Number(
                route.requiredDays
              ) ||
              1
          )
        )
      : null

  const normalDays =
    results.reduce(
      (
        total,
        route
      ) =>
        total +
        (
          Number(
            route
              ?.schedule
              ?.normalDays
          ) ||
          0
        ),
      0
    )

  const extendedCloseDays =
    results.reduce(
      (
        total,
        route
      ) =>
        total +
        (
          Number(
            route
              ?.schedule
              ?.extendedCloseDays
          ) ||
          0
        ),
      0
    )

  const infeasibleDays =
    results.reduce(
      (
        total,
        route
      ) =>
        total +
        (
          Number(
            route
              ?.schedule
              ?.infeasibleDays
          ) ||
          0
        ),
      0
    )

  return {
    status,

    verified:
      status ===
      FOREIGN_FINAL_VALIDATION_STATUS
        .VERIFIED,

    basePlanUsable:
      plan?.feasible ===
      true,

    routeCount:
      results.length,

    verifiedRouteCount:
      verifiedRoutes.length,

    partialRouteCount:
      partialRoutes.length,

    infeasibleRouteCount:
      infeasibleRoutes.length,

    invalidRouteCount:
      invalidRoutes.length,

    requiredDays,

    normalDays,

    extendedCloseDays,

    infeasibleDays,

    totals: {
      distanceMeters:
        totalRoadDistanceMeters,

      travelDurationSeconds:
        totalRoadTravelSeconds
    },

    routes:
      results
  }
}

export default Object.freeze({
  resolveForeignRoutePoints,
  validateForeignOperationalSchedule,
  buildForeignRoadValidationChunks,
  validateForeignRoadSequence,
  validateOneForeignExpedition,
  validateForeignPlanWithGoogleRoutes
})