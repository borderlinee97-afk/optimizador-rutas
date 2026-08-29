// backend/routing/services/routeQuality.service.js

/**
 * ============================================================
 * ROUTE QUALITY VALIDATOR
 * ============================================================
 *
 * Evalúa CALIDAD TERRITORIAL.
 *
 * No decide:
 *
 * - cobertura
 * - jornada laboral
 * - factibilidad temporal
 * - cantidad de recursos
 *
 * Esas responsabilidades pertenecen a:
 *
 * Route Optimization
 * +
 * Google Routes Final Validation.
 *
 * Este módulo responde otra pregunta:
 *
 * "Aunque la ruta sea técnicamente factible,
 *  ¿territorialmente tiene sentido?"
 *
 * ============================================================
 *
 * PRINCIPIO:
 *
 * Las heurísticas geométricas NO sustituyen
 * Google Routes.
 *
 * Se utilizan como:
 *
 * - guardas de calidad
 * - detección de anomalías
 * - regresiones
 * - explicación al usuario
 *
 * ============================================================
 */

export const ROUTE_QUALITY_STATUS =
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

export const ROUTE_QUALITY_SEVERITY =
  Object.freeze({
    INFO:
      'INFO',

    WARNING:
      'WARNING',

    CRITICAL:
      'CRITICAL'
  })

export const ROUTE_QUALITY_CODES =
  Object.freeze({
    ORIGIN_RECROSSING:
      'ORIGIN_RECROSSING',

    RADIAL_BACKTRACKING:
      'RADIAL_BACKTRACKING',

    SEVERE_DIRECTION_REVERSAL:
      'SEVERE_DIRECTION_REVERSAL',

    LARGE_SPATIAL_JUMP:
      'LARGE_SPATIAL_JUMP',

    MULTI_SECTOR_ROUTE:
      'MULTI_SECTOR_ROUTE',

    HIGH_ROAD_DETOUR:
      'HIGH_ROAD_DETOUR',

    HIGH_DEADHEAD:
      'HIGH_DEADHEAD',

    POLYLINE_UNAVAILABLE:
      'POLYLINE_UNAVAILABLE'
  })

export const ROUTE_QUALITY_DEFAULTS =
  Object.freeze({
    /*
     * Sólo consideramos "recruce del origen"
     * una señal fuerte cuando la ruta realmente
     * se alejó del CEDIS.
     */
    minimumRadialDistanceForRecrossMeters:
      15000,

    /*
     * Radio mínimo alrededor del origen utilizado
     * para detectar que una ruta vuelve prácticamente
     * al CEDIS antes de terminar.
     */
    minimumOriginCorridorMeters:
      1500,

    maximumOriginCorridorMeters:
      5000,

    originCorridorRatio:
      0.08,

    /*
     * Cambio radial mínimo para considerar
     * lejos -> cerca -> lejos.
     */
    minimumRadialOscillationMeters:
      3000,

    radialOscillationRatio:
      0.15,

    /*
     * Cambio de rumbo casi contrario.
     */
    severeTurnDegrees:
      145,

    minimumTurnSegmentMeters:
      4000,

    /*
     * Salto territorial.
     */
    minimumLargeJumpMeters:
      15000,

    largeJumpMedianMultiplier:
      3.5,

    /*
     * Ruta repartida alrededor de sectores
     * prácticamente opuestos del origen.
     */
    multiSectorSpanDegrees:
      200,

    minimumMultiSectorRadiusMeters:
      15000,

    /*
     * Carretera / línea geodésica.
     *
     * Sólo advertencia: montaña y red vial
     * pueden producir relaciones naturalmente altas.
     */
    roadDetourReviewRatio:
      2.2,

    /*
     * origen -> primera parada
     * +
     * última parada -> origen
     *
     * respecto al recorrido carretero total.
     */
    highDeadheadRatio:
      0.72,

    minimumDeadheadRoadMeters:
      50000
  })

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function toFiniteNumber(
  value
) {
  const number =
    Number(value)

  return Number.isFinite(number)
    ? number
    : null
}

function isValidPoint(
  point
) {
  const lat =
    toFiniteNumber(
      point?.lat
    )

  const lng =
    toFiniteNumber(
      point?.lng
    )

  return (
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

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

function clamp(
  value,
  minimum,
  maximum
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value
    )
  )
}

/**
 * ============================================================
 * DISTANCIA
 * ============================================================
 */

export function haversineMeters(
  pointA,
  pointB
) {
  if (
    !isValidPoint(pointA) ||
    !isValidPoint(pointB)
  ) {
    return null
  }

  const earthRadius =
    6371000

  const lat1 =
    Number(pointA.lat) *
    Math.PI /
    180

  const lat2 =
    Number(pointB.lat) *
    Math.PI /
    180

  const deltaLat =
    (
      Number(pointB.lat) -
      Number(pointA.lat)
    ) *
    Math.PI /
    180

  const deltaLng =
    (
      Number(pointB.lng) -
      Number(pointA.lng)
    ) *
    Math.PI /
    180

  const a =
    (
      Math.sin(
        deltaLat / 2
      ) **
      2
    ) +
    (
      Math.cos(lat1) *
      Math.cos(lat2) *
      (
        Math.sin(
          deltaLng / 2
        ) **
        2
      )
    )

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )

  return (
    earthRadius *
    c
  )
}

/**
 * ============================================================
 * BEARING
 * ============================================================
 */

export function bearingDegrees(
  pointA,
  pointB
) {
  if (
    !isValidPoint(pointA) ||
    !isValidPoint(pointB)
  ) {
    return null
  }

  const lat1 =
    Number(pointA.lat) *
    Math.PI /
    180

  const lat2 =
    Number(pointB.lat) *
    Math.PI /
    180

  const deltaLng =
    (
      Number(pointB.lng) -
      Number(pointA.lng)
    ) *
    Math.PI /
    180

  const y =
    Math.sin(deltaLng) *
    Math.cos(lat2)

  const x =
    (
      Math.cos(lat1) *
      Math.sin(lat2)
    ) -
    (
      Math.sin(lat1) *
      Math.cos(lat2) *
      Math.cos(deltaLng)
    )

  const degrees =
    Math.atan2(
      y,
      x
    ) *
    180 /
    Math.PI

  return (
    degrees +
    360
  ) %
  360
}

export function angularDifferenceDegrees(
  bearingA,
  bearingB
) {
  const a =
    toFiniteNumber(
      bearingA
    )

  const b =
    toFiniteNumber(
      bearingB
    )

  if (
    a === null ||
    b === null
  ) {
    return null
  }

  const difference =
    Math.abs(
      a -
      b
    ) %
    360

  return Math.min(
    difference,
    360 -
    difference
  )
}

/**
 * ============================================================
 * MEDIAN
 * ============================================================
 */

function median(
  values
) {
  const numbers =
    values
      .map(Number)
      .filter(
        Number.isFinite
      )
      .sort(
        (a, b) =>
          a -
          b
      )

  if (!numbers.length) {
    return null
  }

  const middle =
    Math.floor(
      numbers.length /
      2
    )

  if (
    numbers.length %
    2
  ) {
    return numbers[
      middle
    ]
  }

  return (
    numbers[
      middle - 1
    ] +
    numbers[
      middle
    ]
  ) /
  2
}

/**
 * ============================================================
 * ENCODED POLYLINE
 * ============================================================
 *
 * Implementación local para no agregar otra
 * dependencia únicamente para auditoría.
 */

export function decodeGooglePolyline(
  encoded
) {
  if (
    !encoded ||
    typeof encoded !==
      'string'
  ) {
    return []
  }

  const points =
    []

  let index =
    0

  let latitude =
    0

  let longitude =
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
      if (
        index >=
        encoded.length
      ) {
        return points
      }

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

    latitude +=
      deltaLat

    result =
      0

    shift =
      0

    do {
      if (
        index >=
        encoded.length
      ) {
        return points
      }

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

    longitude +=
      deltaLng

    points.push({
      lat:
        latitude /
        1e5,

      lng:
        longitude /
        1e5
    })
  }

  return points
}

/**
 * ============================================================
 * LOOKUP
 * ============================================================
 */

function buildPointLookup(
  points = []
) {
  const map =
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
      if (
        point?.__plannerKey
      ) {
        map.set(
          String(
            point.__plannerKey
          ),
          point
        )
      }

      if (
        point?.id !==
          null &&
        point?.id !==
          undefined
      ) {
        map.set(
          `id:${String(point.id)}`,
          point
        )
      }

      map.set(
        `index:${index}`,
        point
      )
    }
  )

  return map
}

function resolveStops({
  route,
  pointLookup
}) {
  const pointKeys =
    Array.isArray(
      route?.pointKeys
    )
      ? route.pointKeys
      : []

  const stops =
    []

  const unresolved =
    []

  pointKeys.forEach(
    (
      key,
      index
    ) => {
      const point =
        pointLookup.get(
          String(key)
        )

      if (
        !point ||
        !isValidPoint(
          point
        )
      ) {
        unresolved.push(
          String(key)
        )

        return
      }

      stops.push({
        ...point,

        __routeOrder:
          index + 1,

        __plannerKey:
          String(key)
      })
    }
  )

  return {
    pointKeys:
      pointKeys.map(String),

    stops,

    unresolved,

    valid:
      pointKeys.length >
        0 &&
      unresolved.length ===
        0 &&
      stops.length ===
        pointKeys.length
  }
}

/**
 * ============================================================
 * SEQUENCE DISTANCES
 * ============================================================
 */

function calculateSequenceMetrics(
  origin,
  stops
) {
  const complete =
    [
      origin,
      ...stops,
      origin
    ]

  const segments =
    []

  for (
    let index = 0;
    index <
      complete.length -
        1;
    index++
  ) {
    const from =
      complete[
        index
      ]

    const to =
      complete[
        index + 1
      ]

    const meters =
      haversineMeters(
        from,
        to
      )

    segments.push({
      segmentIndex:
        index,

      fromType:
        index === 0
          ? 'ORIGIN'
          : 'STOP',

      toType:
        index ===
          complete.length -
            2
          ? 'ORIGIN'
          : 'STOP',

      meters
    })
  }

  const stopToStopMeters =
    segments
      .slice(
        1,
        -1
      )
      .map(
        item =>
          item.meters
      )
      .filter(
        Number.isFinite
      )

  const allMeters =
    segments
      .map(
        item =>
          item.meters
      )
      .filter(
        Number.isFinite
      )

  const geodesicChainMeters =
    allMeters.reduce(
      (
        sum,
        value
      ) =>
        sum +
        value,
      0
    )

  const maximumStopJumpMeters =
    stopToStopMeters.length
      ? Math.max(
          ...stopToStopMeters
        )
      : 0

  const medianStopJumpMeters =
    median(
      stopToStopMeters
    )

  const firstDeadheadMeters =
    segments[0]
      ?.meters ||
    0

  const finalDeadheadMeters =
    segments[
      segments.length -
        1
    ]
      ?.meters ||
    0

  return {
    segments,

    stopToStopMeters,

    geodesicChainMeters,

    maximumStopJumpMeters,

    medianStopJumpMeters,

    firstDeadheadMeters,

    finalDeadheadMeters,

    totalGeodesicDeadheadMeters:
      firstDeadheadMeters +
      finalDeadheadMeters
  }
}

/**
 * ============================================================
 * RADIAL METRICS
 * ============================================================
 */

function calculateRadialMetrics({
  origin,
  stops,
  policy
}) {
  const radialDistances =
    stops.map(
      stop =>
        haversineMeters(
          origin,
          stop
        ) ||
        0
    )

  const maxRadiusMeters =
    radialDistances.length
      ? Math.max(
          ...radialDistances
        )
      : 0

  const minimumSignificantDelta =
    Math.max(
      policy
        .minimumRadialOscillationMeters,

      maxRadiusMeters *
      policy
        .radialOscillationRatio
    )

  const oscillations =
    []

  /*
   * Detectamos:
   *
   * lejos -> significativamente más cerca -> lejos
   *
   * No contamos el regreso final al CEDIS.
   */
  for (
    let index = 1;
    index <
      radialDistances.length -
        1;
    index++
  ) {
    const previous =
      radialDistances[
        index - 1
      ]

    const current =
      radialDistances[
        index
      ]

    const next =
      radialDistances[
        index + 1
      ]

    const cameCloser =
      (
        previous -
        current
      ) >=
      minimumSignificantDelta

    const wentFartherAgain =
      (
        next -
        current
      ) >=
      minimumSignificantDelta

    if (
      cameCloser &&
      wentFartherAgain
    ) {
      oscillations.push({
        stopIndex:
          index,

        previousMeters:
          previous,

        currentMeters:
          current,

        nextMeters:
          next
      })
    }
  }

  return {
    radialDistances,

    maxRadiusMeters,

    minimumSignificantDelta,

    oscillations,

    oscillationCount:
      oscillations.length
  }
}

/**
 * ============================================================
 * TURN METRICS
 * ============================================================
 */

function calculateTurnMetrics({
  origin,
  stops,
  policy
}) {
  const sequence =
    [
      origin,
      ...stops,
      origin
    ]

  const severeTurns =
    []

  /*
   * Excluimos el último regreso al origen como
   * "anomalía", porque naturalmente debe regresar.
   */
  for (
    let index = 1;
    index <
      sequence.length -
        2;
    index++
  ) {
    const before =
      sequence[
        index - 1
      ]

    const current =
      sequence[
        index
      ]

    const after =
      sequence[
        index + 1
      ]

    const beforeMeters =
      haversineMeters(
        before,
        current
      ) ||
      0

    const afterMeters =
      haversineMeters(
        current,
        after
      ) ||
      0

    if (
      beforeMeters <
        policy
          .minimumTurnSegmentMeters ||
      afterMeters <
        policy
          .minimumTurnSegmentMeters
    ) {
      continue
    }

    const incoming =
      bearingDegrees(
        before,
        current
      )

    const outgoing =
      bearingDegrees(
        current,
        after
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
        policy
          .severeTurnDegrees
    ) {
      severeTurns.push({
        stopIndex:
          index - 1,

        incomingBearing:
          incoming,

        outgoingBearing:
          outgoing,

        turnDegrees:
          difference,

        beforeMeters,

        afterMeters
      })
    }
  }

  return {
    severeTurns,

    severeTurnCount:
      severeTurns.length
  }
}

/**
 * ============================================================
 * ANGULAR SPAN
 * ============================================================
 *
 * Devuelve el arco circular mínimo que contiene
 * todos los bearings de los destinos.
 */

export function calculateCircularBearingSpan(
  bearings
) {
  const normalized =
    bearings
      .map(
        value =>
          Number(value)
      )
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
        (a, b) =>
          a -
          b
      )

  if (
    normalized.length <=
    1
  ) {
    return 0
  }

  let largestGap =
    0

  for (
    let index = 0;
    index <
      normalized.length;
    index++
  ) {
    const current =
      normalized[
        index
      ]

    const next =
      index ===
        normalized.length -
          1
        ? (
            normalized[0] +
            360
          )
        : normalized[
            index + 1
          ]

    largestGap =
      Math.max(
        largestGap,
        next -
        current
      )
  }

  return (
    360 -
    largestGap
  )
}

/**
 * ============================================================
 * ORIGIN RECROSSING
 * ============================================================
 */

function calculateOriginRecrossing({
  origin,
  polylinePoints,
  maxRadiusMeters,
  policy
}) {
  if (
    !Array.isArray(
      polylinePoints
    ) ||
    polylinePoints.length <
      3
  ) {
    return {
      available:
        false,

      corridorRadiusMeters:
        null,

      midRouteReentries:
        0,

      reentries: []
    }
  }

  const corridorRadiusMeters =
    clamp(
      maxRadiusMeters *
      policy
        .originCorridorRatio,

      policy
        .minimumOriginCorridorMeters,

      policy
        .maximumOriginCorridorMeters
    )

  /*
   * Para rutas locales cortas volver cerca del origen
   * puede ser totalmente natural.
   */
  if (
    maxRadiusMeters <
    policy
      .minimumRadialDistanceForRecrossMeters
  ) {
    return {
      available:
        true,

      corridorRadiusMeters,

      applicable:
        false,

      midRouteReentries:
        0,

      reentries: []
    }
  }

  const inside =
    polylinePoints.map(
      point =>
        (
          haversineMeters(
            origin,
            point
          ) ||
          Infinity
        ) <=
        corridorRadiusMeters
    )

  const reentries =
    []

  /*
   * Buscamos:
   *
   * fuera
   * -> entra al corredor
   * -> posteriormente vuelve a salir
   *
   * La última entrada para finalizar en el CEDIS
   * NO cuenta.
   */
  for (
    let index = 1;
    index <
      inside.length -
        1;
    index++
  ) {
    const entered =
      !inside[
        index - 1
      ] &&
      inside[
        index
      ]

    if (!entered) {
      continue
    }

    const exitsAgain =
      inside
        .slice(
          index + 1
        )
        .some(
          value =>
            value ===
            false
        )

    if (
      exitsAgain
    ) {
      reentries.push({
        polylineIndex:
          index,

        point:
          polylinePoints[
            index
          ]
      })
    }
  }

  return {
    available:
      true,

    applicable:
      true,

    corridorRadiusMeters,

    midRouteReentries:
      reentries.length,

    reentries
  }
}

/**
 * ============================================================
 * ROUTE QUALITY
 * ============================================================
 */

export function evaluateOneRouteQuality({
  origin,

  plannedRoute,

  validatedRoute,

  points = [],

  policy = {}
} = {}) {
  const effectivePolicy = {
    ...ROUTE_QUALITY_DEFAULTS,
    ...policy
  }

  if (
    !isValidPoint(
      origin
    )
  ) {
    return {
      status:
        ROUTE_QUALITY_STATUS
          .INVALID,

      acceptable:
        false,

      flags: [
        {
          code:
            'INVALID_ORIGIN',

          severity:
            ROUTE_QUALITY_SEVERITY
              .CRITICAL
        }
      ]
    }
  }

  const pointLookup =
    buildPointLookup(
      points
    )

  const resolved =
    resolveStops({
      route:
        plannedRoute,

      pointLookup
    })

  if (
    !resolved.valid
  ) {
    return {
      status:
        ROUTE_QUALITY_STATUS
          .INVALID,

      acceptable:
        false,

      unresolvedPointKeys:
        resolved.unresolved,

      flags: [
        {
          code:
            'UNRESOLVED_ROUTE_POINTS',

          severity:
            ROUTE_QUALITY_SEVERITY
              .CRITICAL,

          details: {
            unresolved:
              resolved.unresolved
          }
        }
      ]
    }
  }

  const sequenceMetrics =
    calculateSequenceMetrics(
      origin,
      resolved.stops
    )

  const radialMetrics =
    calculateRadialMetrics({
      origin,

      stops:
        resolved.stops,

      policy:
        effectivePolicy
    })

  const turnMetrics =
    calculateTurnMetrics({
      origin,

      stops:
        resolved.stops,

      policy:
        effectivePolicy
    })

  const stopBearings =
    resolved.stops
      .map(
        stop =>
          bearingDegrees(
            origin,
            stop
          )
      )
      .filter(
        Number.isFinite
      )

  const bearingSpanDegrees =
    calculateCircularBearingSpan(
      stopBearings
    )

  const encodedPolyline =
    validatedRoute
      ?.roadValidation
      ?.polyline ||
    null

  const directDecodedPolyline =
    validatedRoute
      ?.roadValidation
      ?.decodedPolyline

  const polylinePoints =
    Array.isArray(
      directDecodedPolyline
    )
      ? directDecodedPolyline
      : decodeGooglePolyline(
          encodedPolyline
        )

  const originRecrossing =
    calculateOriginRecrossing({
      origin,

      polylinePoints,

      maxRadiusMeters:
        radialMetrics
          .maxRadiusMeters,

      policy:
        effectivePolicy
    })

  const roadDistanceMeters =
    toFiniteNumber(
      validatedRoute
        ?.roadValidation
        ?.distanceMeters
    )

  const roadDetourRatio =
    (
      roadDistanceMeters !==
        null &&
      sequenceMetrics
        .geodesicChainMeters >
        0
    )
      ? (
          roadDistanceMeters /
          sequenceMetrics
            .geodesicChainMeters
        )
      : null

  const deadheadRatio =
    (
      roadDistanceMeters !==
        null &&
      roadDistanceMeters >
        0
    )
      ? (
          sequenceMetrics
            .totalGeodesicDeadheadMeters /
          roadDistanceMeters
        )
      : null

  const medianJump =
    sequenceMetrics
      .medianStopJumpMeters

  const maximumJump =
    sequenceMetrics
      .maximumStopJumpMeters

  const largeJump =
    (
      maximumJump >=
        effectivePolicy
          .minimumLargeJumpMeters &&
      medianJump !==
        null &&
      medianJump >
        0 &&
      maximumJump >=
        (
          medianJump *
          effectivePolicy
            .largeJumpMedianMultiplier
        )
    )

  const multiSector =
    (
      bearingSpanDegrees >=
        effectivePolicy
          .multiSectorSpanDegrees &&
      radialMetrics
        .maxRadiusMeters >=
        effectivePolicy
          .minimumMultiSectorRadiusMeters
    )

  const flags =
    []

  /*
   * =========================================================
   * CRITICAL
   * =========================================================
   */

  if (
    originRecrossing
      .midRouteReentries >
      0
  ) {
    flags.push({
      code:
        ROUTE_QUALITY_CODES
          .ORIGIN_RECROSSING,

      severity:
        ROUTE_QUALITY_SEVERITY
          .CRITICAL,

      message:
        'La ruta vuelve al corredor del origen antes de terminar y posteriormente vuelve a alejarse.',

      details: {
        count:
          originRecrossing
            .midRouteReentries,

        corridorRadiusMeters:
          round(
            originRecrossing
              .corridorRadiusMeters,
            0
          )
      }
    })
  }

  /*
   * =========================================================
   * WARNINGS
   * =========================================================
   */

  if (
    radialMetrics
      .oscillationCount >
      0
  ) {
    flags.push({
      code:
        ROUTE_QUALITY_CODES
          .RADIAL_BACKTRACKING,

      severity:
        ROUTE_QUALITY_SEVERITY
          .WARNING,

      message:
        'La secuencia muestra uno o más patrones lejos → cerca del origen → lejos.',

      details: {
        count:
          radialMetrics
            .oscillationCount
      }
    })
  }

  if (
    turnMetrics
      .severeTurnCount >
      0
  ) {
    flags.push({
      code:
        ROUTE_QUALITY_CODES
          .SEVERE_DIRECTION_REVERSAL,

      severity:
        ROUTE_QUALITY_SEVERITY
          .WARNING,

      message:
        'Se detectaron cambios fuertes de dirección entre destinos alejados.',

      details: {
        count:
          turnMetrics
            .severeTurnCount,

        thresholdDegrees:
          effectivePolicy
            .severeTurnDegrees
      }
    })
  }

  if (
    largeJump
  ) {
    flags.push({
      code:
        ROUTE_QUALITY_CODES
          .LARGE_SPATIAL_JUMP,

      severity:
        ROUTE_QUALITY_SEVERITY
          .WARNING,

      message:
        'Existe un salto territorial muy superior a la separación habitual entre paradas de la ruta.',

      details: {
        maximumJumpMeters:
          round(
            maximumJump,
            0
          ),

        medianJumpMeters:
          round(
            medianJump,
            0
          ),

        ratio:
          round(
            maximumJump /
            medianJump,
            2
          )
      }
    })
  }

  if (
    multiSector
  ) {
    flags.push({
      code:
        ROUTE_QUALITY_CODES
          .MULTI_SECTOR_ROUTE,

      severity:
        ROUTE_QUALITY_SEVERITY
          .WARNING,

      message:
        'La ruta contiene destinos distribuidos en sectores muy amplios alrededor del origen.',

      details: {
        bearingSpanDegrees:
          round(
            bearingSpanDegrees,
            1
          ),

        maxRadiusMeters:
          round(
            radialMetrics
              .maxRadiusMeters,
            0
          )
      }
    })
  }

  if (
    roadDetourRatio !==
      null &&
    roadDetourRatio >=
      effectivePolicy
        .roadDetourReviewRatio
  ) {
    flags.push({
      code:
        ROUTE_QUALITY_CODES
          .HIGH_ROAD_DETOUR,

      severity:
        ROUTE_QUALITY_SEVERITY
          .WARNING,

      message:
        'La distancia carretera es muy superior a la cadena geodésica de los destinos.',

      details: {
        roadDistanceMeters:
          round(
            roadDistanceMeters,
            0
          ),

        geodesicChainMeters:
          round(
            sequenceMetrics
              .geodesicChainMeters,
            0
          ),

        ratio:
          round(
            roadDetourRatio,
            2
          )
      }
    })
  }

  if (
    deadheadRatio !==
      null &&
    roadDistanceMeters >=
      effectivePolicy
        .minimumDeadheadRoadMeters &&
    deadheadRatio >=
      effectivePolicy
        .highDeadheadRatio
  ) {
    flags.push({
      code:
        ROUTE_QUALITY_CODES
          .HIGH_DEADHEAD,

      severity:
        ROUTE_QUALITY_SEVERITY
          .INFO,

      message:
        'Una proporción alta del recorrido corresponde a acceso desde/hacia el origen.',

      details: {
        deadheadRatio:
          round(
            deadheadRatio,
            3
          ),

        deadheadMeters:
          round(
            sequenceMetrics
              .totalGeodesicDeadheadMeters,
            0
          )
      }
    })
  }

  if (
    !polylinePoints.length
  ) {
    flags.push({
      code:
        ROUTE_QUALITY_CODES
          .POLYLINE_UNAVAILABLE,

      severity:
        ROUTE_QUALITY_SEVERITY
          .INFO,

      message:
        'No existe polilínea para evaluar recruces del corredor de origen.'
    })
  }

  const criticalFlags =
    flags.filter(
      flag =>
        flag.severity ===
        ROUTE_QUALITY_SEVERITY
          .CRITICAL
    )

  const warningFlags =
    flags.filter(
      flag =>
        flag.severity ===
        ROUTE_QUALITY_SEVERITY
          .WARNING
    )

  /*
   * =========================================================
   * VEREDICTO
   * =========================================================
   *
   * REJECT:
   *
   * - recruce claro del origen
   *
   * o
   *
   * - combinación de múltiples señales fuertes.
   *
   * Una sola heurística geométrica aislada no
   * debe destruir automáticamente una ruta válida.
   */

  const severeCombinedPattern =
    (
      warningFlags.length >=
        3 &&
      (
        radialMetrics
          .oscillationCount >
          0 ||
        multiSector
      )
    )

  let status

  if (
    criticalFlags.length >
      0 ||
    severeCombinedPattern
  ) {
    status =
      ROUTE_QUALITY_STATUS
        .REJECT
  } else if (
    warningFlags.length >
      0
  ) {
    status =
      ROUTE_QUALITY_STATUS
        .REVIEW
  } else {
    status =
      ROUTE_QUALITY_STATUS
        .PASS
  }

  return {
    status,

    acceptable:
      status !==
      ROUTE_QUALITY_STATUS
        .REJECT,

    routeLabel:
      plannedRoute
        ?.vehicleLabel ||
      null,

    stopCount:
      resolved.stops.length,

    pointKeys:
      resolved.pointKeys,

    metrics: {
      /*
       * Geografía básica.
       */
      maxRadiusMeters:
        round(
          radialMetrics
            .maxRadiusMeters,
          0
        ),

      bearingSpanDegrees:
        round(
          bearingSpanDegrees,
          1
        ),

      /*
       * Saltos.
       */
      maximumStopJumpMeters:
        round(
          maximumJump,
          0
        ),

      medianStopJumpMeters:
        round(
          medianJump,
          0
        ),

      maximumToMedianJumpRatio:
        (
          medianJump >
            0
        )
          ? round(
              maximumJump /
              medianJump,
              2
            )
          : null,

      /*
       * Retornos y cambios.
       */
      radialOscillationCount:
        radialMetrics
          .oscillationCount,

      severeTurnCount:
        turnMetrics
          .severeTurnCount,

      midRouteOriginRecrossings:
        originRecrossing
          .midRouteReentries,

      originCorridorMeters:
        round(
          originRecrossing
            .corridorRadiusMeters,
          0
        ),

      /*
       * Distancias.
       */
      roadDistanceMeters:
        roadDistanceMeters !==
          null
          ? round(
              roadDistanceMeters,
              0
            )
          : null,

      geodesicChainMeters:
        round(
          sequenceMetrics
            .geodesicChainMeters,
          0
        ),

      roadDetourRatio:
        round(
          roadDetourRatio,
          2
        ),

      deadheadRatio:
        round(
          deadheadRatio,
          3
        )
    },

    flags,

    diagnostics: {
      radialOscillations:
        radialMetrics
          .oscillations,

      severeTurns:
        turnMetrics
          .severeTurns,

      originRecrossing,

      sequenceSegments:
        sequenceMetrics
          .segments
    }
  }
}

/**
 * ============================================================
 * PLAN COMPLETO
 * ============================================================
 */

export function evaluatePlanRouteQuality({
  origin,

  plan,

  finalValidation,

  points = [],

  policy = {}
} = {}) {
  const plannedRoutes =
    Array.isArray(
      plan?.routes
    )
      ? plan.routes
      : []

  const validatedRoutes =
    Array.isArray(
      finalValidation?.routes
    )
      ? finalValidation.routes
      : []

  if (
    !plannedRoutes.length
  ) {
    return {
      status:
        ROUTE_QUALITY_STATUS
          .INVALID,

      acceptable:
        false,

      routeCount:
        0,

      routes: [],

      flags: [
        {
          code:
            'ROUTES_REQUIRED',

          severity:
            ROUTE_QUALITY_SEVERITY
              .CRITICAL
        }
      ]
    }
  }

  const routes =
    plannedRoutes.map(
      (
        plannedRoute,
        index
      ) =>
        evaluateOneRouteQuality({
          origin,

          plannedRoute,

          validatedRoute:
            validatedRoutes[
              index
            ] ||
            null,

          points,

          policy
        })
    )

  const rejectedRoutes =
    routes.filter(
      route =>
        route.status ===
        ROUTE_QUALITY_STATUS
          .REJECT
    )

  const reviewRoutes =
    routes.filter(
      route =>
        route.status ===
        ROUTE_QUALITY_STATUS
          .REVIEW
    )

  const passedRoutes =
    routes.filter(
      route =>
        route.status ===
        ROUTE_QUALITY_STATUS
          .PASS
    )

  let status

  if (
    rejectedRoutes.length
  ) {
    status =
      ROUTE_QUALITY_STATUS
        .REJECT
  } else if (
    reviewRoutes.length
  ) {
    status =
      ROUTE_QUALITY_STATUS
        .REVIEW
  } else {
    status =
      ROUTE_QUALITY_STATUS
        .PASS
  }

  return {
    status,

    acceptable:
      rejectedRoutes.length ===
      0,

    routeCount:
      routes.length,

    passedRouteCount:
      passedRoutes.length,

    reviewRouteCount:
      reviewRoutes.length,

    rejectedRouteCount:
      rejectedRoutes.length,

    routes
  }
}

export default Object.freeze({
  haversineMeters,
  bearingDegrees,
  angularDifferenceDegrees,
  calculateCircularBearingSpan,
  decodeGooglePolyline,
  evaluateOneRouteQuality,
  evaluatePlanRouteQuality
})