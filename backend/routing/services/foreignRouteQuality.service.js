// backend/routing/services/foreignRouteQuality.service.js

/**
 * ============================================================
 * FOREIGN ROUTE QUALITY VALIDATOR
 * ============================================================
 *
 * Validador territorial específico para FOREIGN_ROUTE.
 *
 * NO reutilizamos directamente las reglas ROUND_TRIP porque:
 *
 * - permanecer lejos del CEDIS es esperado;
 * - no existe retorno diario al origen;
 * - una expedición puede avanzar territorialmente durante días;
 * - una transición nocturna puede contener desplazamiento útil.
 *
 * Objetivo:
 *
 * detectar patrones realmente malos como:
 *
 * - regresar cerca del CEDIS a mitad de expedición
 *   y volver a salir;
 * - saltos territoriales extremos;
 * - zig-zag severo dentro de una jornada;
 * - jornadas que mezclan sectores opuestos sin necesidad;
 * - discontinuidades enormes entre jornadas.
 *
 * Las heurísticas son GUARDAS DE CALIDAD.
 * No sustituyen a Route Optimization ni Google Routes.
 */

export const FOREIGN_ROUTE_QUALITY_STATUS =
  Object.freeze({
    PASS:
      'PASS',

    REVIEW:
      'REVIEW',

    REJECT:
      'REJECT',

    INVALID:
      'INVALID'
  })

export const FOREIGN_ROUTE_QUALITY_SEVERITY =
  Object.freeze({
    INFO:
      'INFO',

    WARNING:
      'WARNING',

    CRITICAL:
      'CRITICAL'
  })

export const FOREIGN_ROUTE_QUALITY_CODE =
  Object.freeze({
    PREMATURE_ORIGIN_RECROSS:
      'PREMATURE_ORIGIN_RECROSS',

    RADIAL_BACKTRACKING:
      'RADIAL_BACKTRACKING',

    DAILY_SEVERE_DIRECTION_REVERSAL:
      'DAILY_SEVERE_DIRECTION_REVERSAL',

    DAILY_LARGE_SPATIAL_JUMP:
      'DAILY_LARGE_SPATIAL_JUMP',

    MULTI_SECTOR_DAY:
      'MULTI_SECTOR_DAY',

    OVERNIGHT_SPATIAL_DISCONTINUITY:
      'OVERNIGHT_SPATIAL_DISCONTINUITY',

    HIGH_ROAD_DETOUR:
      'HIGH_ROAD_DETOUR',

    LOW_FINAL_DAY_UTILIZATION:
      'LOW_FINAL_DAY_UTILIZATION',

    POLYLINE_UNAVAILABLE:
      'POLYLINE_UNAVAILABLE',

    UNRESOLVED_POINTS:
      'UNRESOLVED_POINTS'
  })

export const DEFAULT_FOREIGN_ROUTE_QUALITY_OPTIONS =
  Object.freeze({
    /*
     * Corredor alrededor del CEDIS usado
     * para detectar un regreso prematuro.
     */
    minimumOriginCorridorMeters:
      1500,

    maximumOriginCorridorMeters:
      5000,

    originCorridorRatio:
      0.08,

    minimumFarRadiusForOriginRecrossMeters:
      15000,

    /*
     * Far -> near -> far respecto al CEDIS.
     */
    minimumRadialOscillationMeters:
      5000,

    radialOscillationRatio:
      0.18,

    /*
     * Cambios bruscos de dirección.
     */
    severeTurnDegrees:
      145,

    minimumTurnSegmentMeters:
      4000,

    /*
     * Salto dentro de una jornada.
     *
     * Debe ser grande absoluta Y relativamente.
     */
    largeDailyJumpMeters:
      20000,

    largeDailyJumpMedianRatio:
      4,

    /*
     * Una jornada cubriendo sectores opuestos
     * puede indicar mala agrupación.
     */
    multiSectorDaySpanDegrees:
      210,

    multiSectorMinimumRadiusMeters:
      15000,

    /*
     * Entre el último destino de un día
     * y el primero del siguiente.
     *
     * FOREIGN_ROUTE permite desplazamiento
     * de cierre, por eso el umbral es alto.
     */
    overnightJumpMeters:
      120000,

    overnightJumpMedianRatio:
      6,

    /*
     * Carretera real vs cadena geodésica.
     *
     * Sólo WARNING; geografía/carreteras
     * pueden explicar ratios elevados.
     */
    roadDetourWarningRatio:
      2.5,

    /*
     * Sólo informativo.
     *
     * Una última jornada corta puede ser
     * completamente necesaria.
     */
    lowFinalDayStopCount:
      2,

    lowFinalDayReturnBeforeSeconds:
      12 *
      3600
  })

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

function clamp(
  value,
  minimum,
  maximum
) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      value
    )
  )
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

function normalizePoint(
  point
) {
  if (
    !point ||
    !Number.isFinite(
      Number(point.lat)
    ) ||
    !Number.isFinite(
      Number(point.lng)
    )
  ) {
    return null
  }

  return {
    ...point,

    lat:
      Number(point.lat),

    lng:
      Number(point.lng)
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
        raw,
        index
      ) => {
        const point =
          normalizePoint(
            raw
          )

        if (!point) {
          return
        }

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
 * GEOMETRY
 * ============================================================
 */

const EARTH_RADIUS_METERS =
  6371008.8

function degreesToRadians(
  value
) {
  return (
    Number(value) *
    Math.PI /
    180
  )
}

export function haversineMeters(
  a,
  b
) {
  const pointA =
    normalizePoint(a)

  const pointB =
    normalizePoint(b)

  if (
    !pointA ||
    !pointB
  ) {
    return null
  }

  const lat1 =
    degreesToRadians(
      pointA.lat
    )

  const lat2 =
    degreesToRadians(
      pointB.lat
    )

  const deltaLat =
    degreesToRadians(
      pointB.lat -
      pointA.lat
    )

  const deltaLng =
    degreesToRadians(
      pointB.lng -
      pointA.lng
    )

  const h =
    Math.sin(
      deltaLat /
      2
    ) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(
      deltaLng /
      2
    ) ** 2

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(h)
      )
    )
  )
}

export function bearingDegrees(
  a,
  b
) {
  const pointA =
    normalizePoint(a)

  const pointB =
    normalizePoint(b)

  if (
    !pointA ||
    !pointB
  ) {
    return null
  }

  const lat1 =
    degreesToRadians(
      pointA.lat
    )

  const lat2 =
    degreesToRadians(
      pointB.lat
    )

  const deltaLng =
    degreesToRadians(
      pointB.lng -
      pointA.lng
    )

  const y =
    Math.sin(deltaLng) *
    Math.cos(lat2)

  const x =
    Math.cos(lat1) *
      Math.sin(lat2) -
    Math.sin(lat1) *
      Math.cos(lat2) *
      Math.cos(deltaLng)

  const bearing =
    Math.atan2(
      y,
      x
    ) *
    180 /
    Math.PI

  return (
    bearing +
    360
  ) %
  360
}

function angularDifferenceDegrees(
  a,
  b
) {
  const first =
    asFiniteNumber(a)

  const second =
    asFiniteNumber(b)

  if (
    first === null ||
    second === null
  ) {
    return null
  }

  const difference =
    Math.abs(
      first -
      second
    ) %
    360

  return Math.min(
    difference,
    360 -
      difference
  )
}

function median(
  values = []
) {
  const safe =
    asArray(values)
      .map(Number)
      .filter(
        Number.isFinite
      )
      .sort(
        (
          a,
          b
        ) =>
          a -
          b
      )

  if (!safe.length) {
    return null
  }

  const middle =
    Math.floor(
      safe.length /
      2
    )

  if (
    safe.length %
      2
  ) {
    return safe[
      middle
    ]
  }

  return (
    safe[
      middle -
      1
    ] +
    safe[
      middle
    ]
  ) /
  2
}

function circularBearingSpan(
  bearings = []
) {
  const safe =
    asArray(bearings)
      .map(Number)
      .filter(
        Number.isFinite
      )
      .map(
        value =>
          (
            value %
              360 +
            360
          ) %
          360
      )
      .sort(
        (
          a,
          b
        ) =>
          a -
          b
      )

  if (
    safe.length <=
    1
  ) {
    return 0
  }

  let largestGap =
    0

  for (
    let index = 0;
    index <
      safe.length;
    index++
  ) {
    const current =
      safe[index]

    const next =
      index ===
        safe.length -
          1
        ? safe[0] +
          360
        : safe[
            index +
              1
          ]

    largestGap =
      Math.max(
        largestGap,
        next -
          current
      )
  }

  return round(
    360 -
      largestGap,
    1
  )
}

/**
 * ============================================================
 * GOOGLE ENCODED POLYLINE
 * ============================================================
 */

export function decodeGooglePolyline(
  encoded
) {
  if (
    typeof encoded !==
      'string' ||
    !encoded.length
  ) {
    return []
  }

  const points =
    []

  let index =
    0

  let lat =
    0

  let lng =
    0

  while (
    index <
    encoded.length
  ) {
    let result =
      0

    let shift =
      0

    let byte

    do {
      byte =
        encoded.charCodeAt(
          index++
        ) -
        63

      result |=
        (
          byte &
          0x1f
        ) <<
        shift

      shift +=
        5
    } while (
      byte >=
      0x20
    )

    const deltaLat =
      (
        result &
        1
      )
        ? ~(
            result >>
            1
          )
        : (
            result >>
            1
          )

    lat +=
      deltaLat

    result =
      0

    shift =
      0

    do {
      byte =
        encoded.charCodeAt(
          index++
        ) -
        63

      result |=
        (
          byte &
          0x1f
        ) <<
        shift

      shift +=
        5
    } while (
      byte >=
      0x20
    )

    const deltaLng =
      (
        result &
        1
      )
        ? ~(
            result >>
            1
          )
        : (
            result >>
            1
          )

    lng +=
      deltaLng

    points.push({
      lat:
        lat /
        1e5,

      lng:
        lng /
        1e5
    })
  }

  return points
}

/**
 * ============================================================
 * POLYLINE FROM ROAD VALIDATION
 * ============================================================
 */

function collectRoadPolyline(
  validatedRoute
) {
  if (
    Array.isArray(
      validatedRoute
        ?.roadValidation
        ?.decodedPolyline
    )
  ) {
    return validatedRoute
      .roadValidation
      .decodedPolyline
      .map(
        normalizePoint
      )
      .filter(Boolean)
  }

  const chunks =
    asArray(
      validatedRoute
        ?.roadValidation
        ?.chunks
    )

  const result =
    []

  for (
    const chunk
    of chunks
  ) {
    const decoded =
      decodeGooglePolyline(
        chunk?.polyline
      )

    for (
      const point
      of decoded
    ) {
      const previous =
        result[
          result.length -
            1
        ]

      if (
        previous
      ) {
        const distance =
          haversineMeters(
            previous,
            point
          )

        if (
          distance !== null &&
          distance <
            5
        ) {
          continue
        }
      }

      result.push(
        point
      )
    }
  }

  return result
}

/**
 * ============================================================
 * ROUTE DAYS
 * ============================================================
 */

function resolveRouteDays({
  plannedRoute,
  validatedRoute,
  lookup
}) {
  const sourceDays =
    asArray(
      plannedRoute?.days
    ).length
      ? asArray(
          plannedRoute.days
        )
      : asArray(
          validatedRoute
            ?.schedule
            ?.days
        )

  const days =
    []

  const missing =
    []

  sourceDays.forEach(
    (
      day,
      index
    ) => {
      const pointKeys =
        asArray(
          day?.pointKeys
        ).length
          ? asArray(
              day.pointKeys
            ).map(String)
          : asArray(
              day?.visits
            )
              .map(
                visit =>
                  visit?.pointKey
              )
              .filter(Boolean)
              .map(String)

      const resolved =
        []

      for (
        const key
        of pointKeys
      ) {
        const point =
          lookup.get(key)

        if (!point) {
          missing.push(
            key
          )

          continue
        }

        resolved.push(
          point
        )
      }

      days.push({
        day:
          day?.day ??
          index +
            1,

        date:
          day?.date ||
          null,

        pointKeys,

        points:
          resolved
      })
    }
  )

  return {
    days,

    missing:
      Array.from(
        new Set(
          missing
        )
      )
  }
}

/**
 * ============================================================
 * SEQUENCE METRICS
 * ============================================================
 */

function calculateJumps(
  points
) {
  const jumps =
    []

  for (
    let index = 0;
    index <
      points.length -
        1;
    index++
  ) {
    const distance =
      haversineMeters(
        points[index],
        points[
          index +
            1
        ]
      )

    if (
      distance !== null
    ) {
      jumps.push(
        distance
      )
    }
  }

  return jumps
}

function calculateSevereTurns({
  points,
  options
}) {
  let count =
    0

  const turns =
    []

  for (
    let index = 1;
    index <
      points.length -
        1;
    index++
  ) {
    const previous =
      points[
        index -
          1
      ]

    const current =
      points[index]

    const next =
      points[
        index +
          1
      ]

    const firstDistance =
      haversineMeters(
        previous,
        current
      )

    const secondDistance =
      haversineMeters(
        current,
        next
      )

    if (
      firstDistance ===
        null ||
      secondDistance ===
        null ||
      firstDistance <
        options
          .minimumTurnSegmentMeters ||
      secondDistance <
        options
          .minimumTurnSegmentMeters
    ) {
      continue
    }

    const incoming =
      bearingDegrees(
        previous,
        current
      )

    const outgoing =
      bearingDegrees(
        current,
        next
      )

    const difference =
      angularDifferenceDegrees(
        incoming,
        outgoing
      )

    if (
      difference !==
        null &&
      difference >=
        options
          .severeTurnDegrees
    ) {
      count++

      turns.push({
        index,

        differenceDegrees:
          round(
            difference,
            1
          ),

        firstDistanceMeters:
          Math.round(
            firstDistance
          ),

        secondDistanceMeters:
          Math.round(
            secondDistance
          )
      })
    }
  }

  return {
    count,

    turns
  }
}

function calculateRadialOscillations({
  origin,
  points,
  options
}) {
  const radii =
    points.map(
      point =>
        haversineMeters(
          origin,
          point
        )
    )

  let count =
    0

  const occurrences =
    []

  for (
    let index = 1;
    index <
      radii.length -
        1;
    index++
  ) {
    const previous =
      radii[
        index -
          1
      ]

    const current =
      radii[index]

    const next =
      radii[
        index +
          1
      ]

    if (
      previous ===
        null ||
      current ===
        null ||
      next ===
        null
    ) {
      continue
    }

    const outerRadius =
      Math.min(
        previous,
        next
      )

    const requiredDrop =
      Math.max(
        options
          .minimumRadialOscillationMeters,

        outerRadius *
          options
            .radialOscillationRatio
      )

    if (
      previous -
        current >=
        requiredDrop &&
      next -
        current >=
        requiredDrop
    ) {
      count++

      occurrences.push({
        index,

        previousRadiusMeters:
          Math.round(
            previous
          ),

        currentRadiusMeters:
          Math.round(
            current
          ),

        nextRadiusMeters:
          Math.round(
            next
          )
      })
    }
  }

  return {
    count,

    occurrences
  }
}

/**
 * ============================================================
 * ORIGIN RECROSS
 * ============================================================
 */

function countPrematureOriginRecrossings({
  origin,
  polyline,
  corridorMeters,
  minimumFarRadiusMeters
}) {
  const points =
    asArray(polyline)

  if (
    points.length <
    3
  ) {
    return 0
  }

  const radii =
    points.map(
      point =>
        haversineMeters(
          origin,
          point
        )
    )

  const reachedFarArea =
    radii.some(
      value =>
        value !==
          null &&
        value >=
          minimumFarRadiusMeters
    )

  if (!reachedFarArea) {
    return 0
  }

  let count =
    0

  let hasGoneOutside =
    false

  let currentlyInsideAfterOutside =
    false

  for (
    let index = 0;
    index <
      radii.length;
    index++
  ) {
    const radius =
      radii[index]

    if (
      radius === null
    ) {
      continue
    }

    if (
      radius >
      corridorMeters
    ) {
      hasGoneOutside =
        true

      currentlyInsideAfterOutside =
        false

      continue
    }

    if (
      !hasGoneOutside ||
      currentlyInsideAfterOutside
    ) {
      continue
    }

    const futureLeavesAgain =
      radii
        .slice(
          index +
            1
        )
        .some(
          value =>
            value !==
              null &&
            value >
              corridorMeters
        )

    if (
      futureLeavesAgain
    ) {
      count++

      currentlyInsideAfterOutside =
        true
    }
  }

  return count
}

/**
 * ============================================================
 * DAILY METRICS
 * ============================================================
 */

function evaluateDay({
  day,
  origin,
  options
}) {
  const points =
    day.points

  const jumps =
    calculateJumps(
      points
    )

  const maximumJumpMeters =
    jumps.length
      ? Math.max(
          ...jumps
        )
      : 0

  const medianJumpMeters =
    median(
      jumps
    ) ??
    0

  const jumpRatio =
    medianJumpMeters >
      0
      ? (
          maximumJumpMeters /
          medianJumpMeters
        )
      : null

  const radii =
    points
      .map(
        point =>
          haversineMeters(
            origin,
            point
          )
      )
      .filter(
        value =>
          value !==
          null
      )

  const maxRadiusMeters =
    radii.length
      ? Math.max(
          ...radii
        )
      : 0

  const bearings =
    points
      .map(
        point =>
          bearingDegrees(
            origin,
            point
          )
      )
      .filter(
        value =>
          value !==
          null
      )

  const bearingSpanDegrees =
    circularBearingSpan(
      bearings
    )

  const severeTurns =
    calculateSevereTurns({
      points,
      options
    })

  const largeJump =
    maximumJumpMeters >=
      options
        .largeDailyJumpMeters &&
    jumpRatio !==
      null &&
    jumpRatio >=
      options
        .largeDailyJumpMedianRatio

  const multiSector =
    maxRadiusMeters >=
      options
        .multiSectorMinimumRadiusMeters &&
    bearingSpanDegrees >=
      options
        .multiSectorDaySpanDegrees

  return {
    day:
      day.day,

    date:
      day.date,

    stopCount:
      points.length,

    maximumJumpMeters:
      Math.round(
        maximumJumpMeters
      ),

    medianJumpMeters:
      Math.round(
        medianJumpMeters
      ),

    maximumToMedianJumpRatio:
      round(
        jumpRatio,
        2
      ),

    maxRadiusMeters:
      Math.round(
        maxRadiusMeters
      ),

    bearingSpanDegrees,

    severeTurnCount:
      severeTurns.count,

    severeTurns:
      severeTurns.turns,

    largeJump,

    multiSector
  }
}

/**
 * ============================================================
 * ONE FOREIGN EXPEDITION
 * ============================================================
 */

export function evaluateOneForeignRouteQuality({
  origin,
  points = [],
  plannedRoute,
  validatedRoute = null,
  options = {}
} = {}) {
  const normalizedOrigin =
    normalizePoint(
      origin
    )

  if (
    !normalizedOrigin ||
    !plannedRoute
  ) {
    return {
      status:
        FOREIGN_ROUTE_QUALITY_STATUS
          .INVALID,

      acceptable:
        false,

      flags: [
        {
          code:
            FOREIGN_ROUTE_QUALITY_CODE
              .UNRESOLVED_POINTS,

          severity:
            FOREIGN_ROUTE_QUALITY_SEVERITY
              .CRITICAL,

          message:
            'No fue posible evaluar la expedición por datos inválidos.'
        }
      ]
    }
  }

  const config = {
    ...DEFAULT_FOREIGN_ROUTE_QUALITY_OPTIONS,
    ...options
  }

  const lookup =
    buildPointLookup(
      points
    )

  const resolved =
    resolveRouteDays({
      plannedRoute,
      validatedRoute,
      lookup
    })

  const flags =
    []

  if (
    resolved.missing.length
  ) {
    flags.push({
      code:
        FOREIGN_ROUTE_QUALITY_CODE
          .UNRESOLVED_POINTS,

      severity:
        FOREIGN_ROUTE_QUALITY_SEVERITY
          .CRITICAL,

      message:
        'Existen destinos de la expedición que no pudieron resolverse.',

      details: {
        missing:
          resolved.missing
      }
    })
  }

  const allPoints =
    resolved.days.flatMap(
      day =>
        day.points
    )

  if (
    !allPoints.length
  ) {
    return {
      status:
        FOREIGN_ROUTE_QUALITY_STATUS
          .INVALID,

      acceptable:
        false,

      routeLabel:
        plannedRoute
          ?.vehicleLabel ||
        null,

      flags: [
        ...flags,

        {
          code:
            FOREIGN_ROUTE_QUALITY_CODE
              .UNRESOLVED_POINTS,

          severity:
            FOREIGN_ROUTE_QUALITY_SEVERITY
              .CRITICAL,

          message:
            'La expedición no contiene destinos evaluables.'
        }
      ]
    }
  }

  /**
   * =========================================================
   * GENERAL
   * =========================================================
   */

  const radii =
    allPoints
      .map(
        point =>
          haversineMeters(
            normalizedOrigin,
            point
          )
      )
      .filter(
        value =>
          value !==
          null
      )

  const maxRadiusMeters =
    radii.length
      ? Math.max(
          ...radii
        )
      : 0

  const corridorMeters =
    clamp(
      maxRadiusMeters *
        config
          .originCorridorRatio,

      config
        .minimumOriginCorridorMeters,

      config
        .maximumOriginCorridorMeters
    )

  const radial =
    calculateRadialOscillations({
      origin:
        normalizedOrigin,

      points:
        allPoints,

      options:
        config
    })

  /**
   * =========================================================
   * ROAD POLYLINE / ORIGIN RECROSS
   * =========================================================
   */

  const roadPolyline =
    collectRoadPolyline(
      validatedRoute
    )

  let prematureOriginRecrossings =
    0

  if (
    roadPolyline.length
  ) {
    prematureOriginRecrossings =
      countPrematureOriginRecrossings({
        origin:
          normalizedOrigin,

        polyline:
          roadPolyline,

        corridorMeters,

        minimumFarRadiusMeters:
          config
            .minimumFarRadiusForOriginRecrossMeters
      })

    if (
      prematureOriginRecrossings >
      0
    ) {
      flags.push({
        code:
          FOREIGN_ROUTE_QUALITY_CODE
            .PREMATURE_ORIGIN_RECROSS,

        severity:
          FOREIGN_ROUTE_QUALITY_SEVERITY
            .CRITICAL,

        message:
          'La expedición vuelve al corredor del CEDIS antes de terminar y posteriormente vuelve a alejarse.',

        details: {
          count:
            prematureOriginRecrossings,

          corridorRadiusMeters:
            Math.round(
              corridorMeters
            )
        }
      })
    }
  } else {
    flags.push({
      code:
        FOREIGN_ROUTE_QUALITY_CODE
          .POLYLINE_UNAVAILABLE,

      severity:
        FOREIGN_ROUTE_QUALITY_SEVERITY
          .INFO,

      message:
        'No existe geometría carretera disponible para comprobar recruces del origen.'
    })
  }

  /**
   * =========================================================
   * RADIAL BACKTRACKING
   * =========================================================
   */

  if (
    radial.count >
    0
  ) {
    flags.push({
      code:
        FOREIGN_ROUTE_QUALITY_CODE
          .RADIAL_BACKTRACKING,

      severity:
        FOREIGN_ROUTE_QUALITY_SEVERITY
          .WARNING,

      message:
        'La expedición presenta movimientos lejos → cerca del origen → lejos que requieren revisión.',

      details: {
        count:
          radial.count,

        occurrences:
          radial.occurrences
      }
    })
  }

  /**
   * =========================================================
   * DAILY QUALITY
   * =========================================================
   */

  const dayMetrics =
    resolved.days.map(
      day =>
        evaluateDay({
          day,

          origin:
            normalizedOrigin,

          options:
            config
        })
    )

  for (
    const day
    of dayMetrics
  ) {
    if (
      day.largeJump
    ) {
      flags.push({
        code:
          FOREIGN_ROUTE_QUALITY_CODE
            .DAILY_LARGE_SPATIAL_JUMP,

        severity:
          FOREIGN_ROUTE_QUALITY_SEVERITY
            .WARNING,

        message:
          'Una jornada contiene un salto territorial desproporcionado entre entregas.',

        details: {
          day:
            day.day,

          date:
            day.date,

          maximumJumpMeters:
            day.maximumJumpMeters,

          medianJumpMeters:
            day.medianJumpMeters,

          ratio:
            day
              .maximumToMedianJumpRatio
        }
      })
    }

    if (
      day.severeTurnCount >
      0
    ) {
      const reversalCorroborated =
        day.largeJump ||
        day.multiSector

      flags.push({
        code:
          FOREIGN_ROUTE_QUALITY_CODE
            .DAILY_SEVERE_DIRECTION_REVERSAL,

        severity:
          reversalCorroborated
            ? FOREIGN_ROUTE_QUALITY_SEVERITY
                .WARNING
            : FOREIGN_ROUTE_QUALITY_SEVERITY
                .INFO,

        message:
          reversalCorroborated
            ? 'Una jornada presenta cambios fuertes de dirección respaldados por otras señales territoriales.'
            : 'Se detectaron cambios fuertes de dirección, pero sin evidencia territorial adicional que justifique revisión operativa.',

        details: {
          day:
            day.day,

          date:
            day.date,

          count:
            day.severeTurnCount,

          turns:
            day.severeTurns,

          corroborated:
            reversalCorroborated,

          corroboratingSignals: {
            largeJump:
              day.largeJump,

            multiSector:
              day.multiSector
          }
        }
      })
    }

    if (
      day.multiSector
    ) {
      flags.push({
        code:
          FOREIGN_ROUTE_QUALITY_CODE
            .MULTI_SECTOR_DAY,

        severity:
          FOREIGN_ROUTE_QUALITY_SEVERITY
            .WARNING,

        message:
          'Una sola jornada mezcla sectores territoriales ampliamente separados.',

        details: {
          day:
            day.day,

          date:
            day.date,

          bearingSpanDegrees:
            day.bearingSpanDegrees,

          maxRadiusMeters:
            day.maxRadiusMeters
        }
      })
    }
  }

  /**
   * =========================================================
   * OVERNIGHT TRANSITIONS
   * =========================================================
   */

  const allDailyJumps =
    resolved.days.flatMap(
      day =>
        calculateJumps(
          day.points
        )
    )

  const typicalJumpMeters =
    median(
      allDailyJumps
    ) ??
    0

  const overnightTransitions =
    []

  for (
    let index = 0;
    index <
      resolved.days.length -
        1;
    index++
  ) {
    const currentDay =
      resolved.days[index]

    const nextDay =
      resolved.days[
        index +
          1
      ]

    const from =
      currentDay.points[
        currentDay.points.length -
          1
      ]

    const to =
      nextDay.points[0]

    if (
      !from ||
      !to
    ) {
      continue
    }

    const distanceMeters =
      haversineMeters(
        from,
        to
      )

    const ratio =
      (
        typicalJumpMeters >
          0 &&
        distanceMeters !==
          null
      )
        ? (
            distanceMeters /
            typicalJumpMeters
          )
        : null

    const suspicious =
      distanceMeters !==
        null &&
      distanceMeters >=
        config
          .overnightJumpMeters &&
      ratio !==
        null &&
      ratio >=
        config
          .overnightJumpMedianRatio

    const transition = {
      fromDay:
        currentDay.day,

      toDay:
        nextDay.day,

      fromDate:
        currentDay.date,

      toDate:
        nextDay.date,

      distanceMeters:
        distanceMeters !==
          null
          ? Math.round(
              distanceMeters
            )
          : null,

      ratioToTypicalJump:
        round(
          ratio,
          2
        ),

      suspicious
    }

    overnightTransitions.push(
      transition
    )

    if (
      suspicious
    ) {
      flags.push({
        code:
          FOREIGN_ROUTE_QUALITY_CODE
            .OVERNIGHT_SPATIAL_DISCONTINUITY,

        severity:
          FOREIGN_ROUTE_QUALITY_SEVERITY
            .WARNING,

        message:
          'Existe una discontinuidad territorial extrema entre el cierre de una jornada y el inicio de la siguiente.',

        details:
          transition
      })
    }
  }

  /**
   * =========================================================
   * ROAD DETOUR
   * =========================================================
   */

  const geodesicSequence =
    [
      normalizedOrigin,
      ...allPoints,
      normalizedOrigin
    ]

  let geodesicChainMeters =
    0

  for (
    let index = 0;
    index <
      geodesicSequence.length -
        1;
    index++
  ) {
    geodesicChainMeters +=
      haversineMeters(
        geodesicSequence[index],
        geodesicSequence[
          index +
            1
        ]
      ) ||
      0
  }

  const roadDistanceMeters =
    asFiniteNumber(
      validatedRoute
        ?.roadValidation
        ?.distanceMeters
    )

  const roadDetourRatio =
    (
      roadDistanceMeters !==
        null &&
      geodesicChainMeters >
        0
    )
      ? (
          roadDistanceMeters /
          geodesicChainMeters
        )
      : null

  if (
    roadDetourRatio !==
      null &&
    roadDetourRatio >=
      config
        .roadDetourWarningRatio
  ) {
    flags.push({
      code:
        FOREIGN_ROUTE_QUALITY_CODE
          .HIGH_ROAD_DETOUR,

      severity:
        FOREIGN_ROUTE_QUALITY_SEVERITY
          .WARNING,

      message:
        'La distancia carretera es muy superior a la cadena geodésica de la expedición.',

      details: {
        roadDistanceMeters:
          Math.round(
            roadDistanceMeters
          ),

        geodesicChainMeters:
          Math.round(
            geodesicChainMeters
          ),

        ratio:
          round(
            roadDetourRatio,
            2
          )
      }
    })
  }

  /**
   * =========================================================
   * FINAL DAY UTILIZATION — INFO ONLY
   * =========================================================
   */

  const finalDay =
    dayMetrics[
      dayMetrics.length -
        1
    ]

  const requiredDays =
    Math.max(
      1,
      Number(
        plannedRoute
          ?.requiredDays ||
        plannedRoute
          ?.daysUsed ||
        dayMetrics.length ||
        1
      )
    )

  const finalReturnSeconds =
    asFiniteNumber(
      validatedRoute
        ?.schedule
        ?.expeditionEndLocal
        ?.secondsOfDay
    )

  if (
    requiredDays >
      1 &&
    finalDay &&
    finalDay.stopCount <=
      config
        .lowFinalDayStopCount &&
    finalReturnSeconds !==
      null &&
    finalReturnSeconds <
      config
        .lowFinalDayReturnBeforeSeconds
  ) {
    flags.push({
      code:
        FOREIGN_ROUTE_QUALITY_CODE
          .LOW_FINAL_DAY_UTILIZATION,

      severity:
        FOREIGN_ROUTE_QUALITY_SEVERITY
          .INFO,

      message:
        'La última jornada termina temprano y contiene pocas entregas; conviene conservar este dato para la comparación económica entre modos.',

      details: {
        day:
          finalDay.day,

        stopCount:
          finalDay.stopCount,

        finalReturnSeconds
      }
    })
  }

  /**
   * =========================================================
   * STATUS
   * =========================================================
   */

  const criticalFlags =
    flags.filter(
      flag =>
        flag.severity ===
        FOREIGN_ROUTE_QUALITY_SEVERITY
          .CRITICAL
    )

  const warningFlags =
    flags.filter(
      flag =>
        flag.severity ===
        FOREIGN_ROUTE_QUALITY_SEVERITY
          .WARNING
    )

  let status =
    FOREIGN_ROUTE_QUALITY_STATUS
      .PASS

  if (
    criticalFlags.length
  ) {
    status =
      FOREIGN_ROUTE_QUALITY_STATUS
        .REJECT
  } else if (
    warningFlags.length
  ) {
    status =
      FOREIGN_ROUTE_QUALITY_STATUS
        .REVIEW
  }

  return {
    status,

    acceptable:
      status !==
      FOREIGN_ROUTE_QUALITY_STATUS
        .REJECT,

    routeLabel:
      plannedRoute
        ?.vehicleLabel ||
      null,

    stopCount:
      allPoints.length,

    dayCount:
      dayMetrics.length,

    metrics: {
      maxRadiusMeters:
        Math.round(
          maxRadiusMeters
        ),

      originCorridorMeters:
        Math.round(
          corridorMeters
        ),

      prematureOriginRecrossings,

      radialOscillationCount:
        radial.count,

      typicalDailyJumpMeters:
        Math.round(
          typicalJumpMeters
        ),

      roadDistanceMeters:
        roadDistanceMeters !==
          null
          ? Math.round(
              roadDistanceMeters
            )
          : null,

      geodesicChainMeters:
        Math.round(
          geodesicChainMeters
        ),

      roadDetourRatio:
        round(
          roadDetourRatio,
          2
        )
    },

    days:
      dayMetrics,

    overnightTransitions,

    flags
  }
}

/**
 * ============================================================
 * PLAN QUALITY
 * ============================================================
 */

export function evaluateForeignPlanRouteQuality({
  origin,
  points = [],
  plan,
  finalValidation,
  options = {}
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
        FOREIGN_ROUTE_QUALITY_STATUS
          .INVALID,

      acceptable:
        false,

      routeCount:
        0,

      passedRouteCount:
        0,

      reviewRouteCount:
        0,

      rejectedRouteCount:
        0,

      routes: []
    }
  }

  const results =
    routes.map(
      (
        route,
        index
      ) =>
        evaluateOneForeignRouteQuality({
          origin,

          points,

          plannedRoute:
            route,

          validatedRoute:
            finalValidation
              ?.routes?.[
                index
              ] ||
            null,

          options
        })
    )

  const passed =
    results.filter(
      result =>
        result.status ===
        FOREIGN_ROUTE_QUALITY_STATUS
          .PASS
    )

  const review =
    results.filter(
      result =>
        result.status ===
        FOREIGN_ROUTE_QUALITY_STATUS
          .REVIEW
    )

  const rejected =
    results.filter(
      result =>
        result.status ===
        FOREIGN_ROUTE_QUALITY_STATUS
          .REJECT ||
        result.status ===
        FOREIGN_ROUTE_QUALITY_STATUS
          .INVALID
    )

  let status =
    FOREIGN_ROUTE_QUALITY_STATUS
      .PASS

  if (
    rejected.length
  ) {
    status =
      FOREIGN_ROUTE_QUALITY_STATUS
        .REJECT
  } else if (
    review.length
  ) {
    status =
      FOREIGN_ROUTE_QUALITY_STATUS
        .REVIEW
  }

  return {
    status,

    acceptable:
      rejected.length ===
      0,

    routeCount:
      results.length,

    passedRouteCount:
      passed.length,

    reviewRouteCount:
      review.length,

    rejectedRouteCount:
      rejected.length,

    routes:
      results
  }
}

export default Object.freeze({
  haversineMeters,
  bearingDegrees,
  decodeGooglePolyline,
  evaluateOneForeignRouteQuality,
  evaluateForeignPlanRouteQuality
})