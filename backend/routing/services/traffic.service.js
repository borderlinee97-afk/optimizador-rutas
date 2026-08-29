// backend/routing/services/traffic.service.js

import {
  roundDecimal
} from '../utils/money.js'

/**
 * Servicio de análisis de tráfico
 * del Motor Operativo Integral.
 *
 * Google Routes puede devolver:
 *
 * speedReadingIntervals:
 *
 * - NORMAL
 * - SLOW
 * - TRAFFIC_JAM
 *
 * Este servicio transforma esos segmentos
 * técnicos en indicadores utilizables por
 * operación y posteriormente por frontend.
 *
 * IMPORTANTE:
 *
 * Los porcentajes calculados aquí representan
 * cobertura relativa por índices de la polilínea.
 *
 * NO equivalen todavía a:
 *
 * - porcentaje exacto de kilómetros
 * - porcentaje exacto de tiempo
 *
 * Para obtener esos indicadores sería necesario
 * enriquecer cada intervalo con geometría/distancia
 * real del segmento.
 */

export const TRAFFIC_SPEED =
  Object.freeze({
    NORMAL:
      'NORMAL',

    SLOW:
      'SLOW',

    TRAFFIC_JAM:
      'TRAFFIC_JAM',

    UNKNOWN:
      'UNKNOWN'
  })

export const TRAFFIC_LEVEL =
  Object.freeze({
    CLEAR:
      'CLEAR',

    MODERATE:
      'MODERATE',

    CONGESTED:
      'CONGESTED',

    SEVERE:
      'SEVERE',

    UNKNOWN:
      'UNKNOWN'
  })

/**
 * Normaliza el código de velocidad
 * proveniente de Google.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTrafficSpeed(
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
      TRAFFIC_SPEED.NORMAL
  ) {
    return TRAFFIC_SPEED
      .NORMAL
  }

  if (
    normalized ===
      TRAFFIC_SPEED.SLOW
  ) {
    return TRAFFIC_SPEED
      .SLOW
  }

  if (
    normalized ===
      TRAFFIC_SPEED.TRAFFIC_JAM
  ) {
    return TRAFFIC_SPEED
      .TRAFFIC_JAM
  }

  return TRAFFIC_SPEED
    .UNKNOWN
}

/**
 * Normaliza un intervalo.
 *
 * @param {object} interval
 * @param {number} index
 * @returns {object|null}
 */
export function normalizeTrafficInterval(
  interval,
  index = 0
) {
  if (
    !interval ||
    typeof interval !==
      'object'
  ) {
    return null
  }

  const startRaw =
    Number(
      interval
        .startPolylinePointIndex ??
      0
    )

  const endRaw =
    Number(
      interval
        .endPolylinePointIndex
    )

  const startIndex =
    Number.isFinite(
      startRaw
    )
      ? Math.max(
          0,
          Math.floor(
            startRaw
          )
        )
      : 0

  const endIndex =
    Number.isFinite(
      endRaw
    )
      ? Math.max(
          startIndex,
          Math.floor(
            endRaw
          )
        )
      : startIndex +
        1

  /*
   * Google maneja el intervalo mediante índices
   * de la polilínea.
   *
   * Usamos la amplitud únicamente como peso
   * relativo del análisis.
   */
  const span =
    Math.max(
      1,
      endIndex -
      startIndex
    )

  return {
    index,

    startPolylinePointIndex:
      startIndex,

    endPolylinePointIndex:
      endIndex,

    span,

    speed:
      normalizeTrafficSpeed(
        interval.speed
      )
  }
}

/**
 * Analiza una colección de intervalos.
 *
 * @param {object[]} intervals
 * @returns {object}
 */
export function analyzeTrafficIntervals(
  intervals = []
) {
  const normalized =
    (
      Array.isArray(
        intervals
      )
        ? intervals
        : []
    )
      .map(
        (
          interval,
          index
        ) =>
          normalizeTrafficInterval(
            interval,
            index
          )
      )
      .filter(
        Boolean
      )

  if (
    !normalized.length
  ) {
    return {
      available:
        false,

      intervalCount:
        0,

      weightedSpan:
        0,

      normalSpan:
        0,

      slowSpan:
        0,

      jamSpan:
        0,

      unknownSpan:
        0,

      normalPercent:
        null,

      slowPercent:
        null,

      jamPercent:
        null,

      unknownPercent:
        null,

      dominantSpeed:
        TRAFFIC_SPEED
          .UNKNOWN,

      level:
        TRAFFIC_LEVEL
          .UNKNOWN,

      intervals: []
    }
  }

  const spans = {
    [
      TRAFFIC_SPEED
        .NORMAL
    ]:
      0,

    [
      TRAFFIC_SPEED
        .SLOW
    ]:
      0,

    [
      TRAFFIC_SPEED
        .TRAFFIC_JAM
    ]:
      0,

    [
      TRAFFIC_SPEED
        .UNKNOWN
    ]:
      0
  }

  for (
    const interval
    of normalized
  ) {
    spans[
      interval.speed
    ] +=
      interval.span
  }

  const weightedSpan =
    Object
      .values(
        spans
      )
      .reduce(
        (
          total,
          value
        ) =>
          total +
          value,
        0
      )

  const percent =
    value =>
      weightedSpan >
        0
        ? (
            roundDecimal(
              (
                value /
                weightedSpan
              ) *
              100,
              1
            ) ??
            0
          )
        : 0

  const normalPercent =
    percent(
      spans[
        TRAFFIC_SPEED
          .NORMAL
      ]
    )

  const slowPercent =
    percent(
      spans[
        TRAFFIC_SPEED
          .SLOW
      ]
    )

  const jamPercent =
    percent(
      spans[
        TRAFFIC_SPEED
          .TRAFFIC_JAM
      ]
    )

  const unknownPercent =
    percent(
      spans[
        TRAFFIC_SPEED
          .UNKNOWN
      ]
    )

  const dominantSpeed =
    Object
      .entries(
        spans
      )
      .sort(
        (
          a,
          b
        ) =>
          b[1] -
          a[1]
      )[0]?.[0] ||
    TRAFFIC_SPEED
      .UNKNOWN

  return {
    available:
      true,

    intervalCount:
      normalized.length,

    weightedSpan,

    normalSpan:
      spans[
        TRAFFIC_SPEED
          .NORMAL
      ],

    slowSpan:
      spans[
        TRAFFIC_SPEED
          .SLOW
      ],

    jamSpan:
      spans[
        TRAFFIC_SPEED
          .TRAFFIC_JAM
      ],

    unknownSpan:
      spans[
        TRAFFIC_SPEED
          .UNKNOWN
      ],

    normalPercent,

    slowPercent,

    jamPercent,

    unknownPercent,

    dominantSpeed,

    level:
      calculateTrafficLevel({
        normalPercent,
        slowPercent,
        jamPercent
      }),

    intervals:
      normalized
  }
}

/**
 * Clasificación técnica de tráfico.
 *
 * Los umbrales son únicamente una clasificación
 * visual inicial del sistema.
 *
 * No representan todavía una política
 * corporativa.
 *
 * @param {{
 *   normalPercent?: number,
 *   slowPercent?: number,
 *   jamPercent?: number
 * }} params
 *
 * @returns {string}
 */
export function calculateTrafficLevel({
  normalPercent = 0,
  slowPercent = 0,
  jamPercent = 0
} = {}) {
  const jam =
    Number(
      jamPercent
    ) ||
    0

  const slow =
    Number(
      slowPercent
    ) ||
    0

  const normal =
    Number(
      normalPercent
    ) ||
    0

  if (
    jam >=
    35
  ) {
    return TRAFFIC_LEVEL
      .SEVERE
  }

  if (
    jam >=
      10 ||
    slow >=
      45
  ) {
    return TRAFFIC_LEVEL
      .CONGESTED
  }

  if (
    jam >
      0 ||
    slow >=
      15
  ) {
    return TRAFFIC_LEVEL
      .MODERATE
  }

  if (
    normal >
      0
  ) {
    return TRAFFIC_LEVEL
      .CLEAR
  }

  return TRAFFIC_LEVEL
    .UNKNOWN
}

/**
 * Analiza tráfico de una Route de Google.
 *
 * Prioridad:
 *
 * 1. información a nivel ruta
 * 2. información agregada desde legs
 *
 * @param {object|null} route
 * @returns {object}
 */
export function analyzeRouteTraffic(
  route
) {
  if (
    !route
  ) {
    return {
      available:
        false,

      source:
        'GOOGLE_ROUTES',

      scope:
        null,

      analysis:
        analyzeTrafficIntervals(
          []
        ),

      legs: []
    }
  }

  const routeIntervals =
    route
      ?.travelAdvisory
      ?.speedReadingIntervals

  if (
    Array.isArray(
      routeIntervals
    ) &&
    routeIntervals.length
  ) {
    return {
      available:
        true,

      source:
        'GOOGLE_ROUTES',

      scope:
        'ROUTE',

      analysis:
        analyzeTrafficIntervals(
          routeIntervals
        ),

      legs:
        analyzeTrafficByLeg(
          route
        )
    }
  }

  const legs =
    analyzeTrafficByLeg(
      route
    )

  const allIntervals =
    legs.flatMap(
      leg =>
        leg
          ?.analysis
          ?.intervals ||
        []
    )

  return {
    available:
      allIntervals.length >
      0,

    source:
      'GOOGLE_ROUTES',

    scope:
      allIntervals.length >
        0
        ? 'LEGS'
        : null,

    analysis:
      analyzeTrafficIntervals(
        allIntervals
      ),

    legs
  }
}

/**
 * Analiza tráfico por cada leg.
 *
 * @param {object|null} route
 * @returns {object[]}
 */
export function analyzeTrafficByLeg(
  route
) {
  const legs =
    Array.isArray(
      route?.legs
    )
      ? route.legs
      : []

  return legs.map(
    (
      leg,
      index
    ) => {
      const intervals =
        leg
          ?.travelAdvisory
          ?.speedReadingIntervals

      return {
        legIndex:
          index,

        distanceMeters:
          Number.isFinite(
            Number(
              leg
                ?.distanceMeters
            )
          )
            ? Number(
                leg
                  .distanceMeters
              )
            : null,

        duration:
          leg?.duration ||
          null,

        polyline:
          leg
            ?.polyline
            ?.encodedPolyline ||
          null,

        analysis:
          analyzeTrafficIntervals(
            intervals
          )
      }
    }
  )
}

/**
 * Consolida análisis de tráfico
 * de varias rutas/operadores.
 *
 * @param {object[]} trafficAnalyses
 * @returns {object}
 */
export function summarizeTrafficAnalyses(
  trafficAnalyses = []
) {
  const analyses =
    (
      Array.isArray(
        trafficAnalyses
      )
        ? trafficAnalyses
        : []
    )
      .filter(
        Boolean
      )

  let weightedSpan =
    0

  let normalSpan =
    0

  let slowSpan =
    0

  let jamSpan =
    0

  let unknownSpan =
    0

  let routesWithTraffic =
    0

  let congestedRoutes =
    0

  let severeRoutes =
    0

  for (
    const item
    of analyses
  ) {
    const analysis =
      item?.analysis ||
      item

    if (
      analysis?.available
    ) {
      routesWithTraffic++
    }

    weightedSpan +=
      Number(
        analysis
          ?.weightedSpan
      ) ||
      0

    normalSpan +=
      Number(
        analysis
          ?.normalSpan
      ) ||
      0

    slowSpan +=
      Number(
        analysis
          ?.slowSpan
      ) ||
      0

    jamSpan +=
      Number(
        analysis
          ?.jamSpan
      ) ||
      0

    unknownSpan +=
      Number(
        analysis
          ?.unknownSpan
      ) ||
      0

    if (
      analysis?.level ===
      TRAFFIC_LEVEL
        .CONGESTED
    ) {
      congestedRoutes++
    }

    if (
      analysis?.level ===
      TRAFFIC_LEVEL
        .SEVERE
    ) {
      severeRoutes++
    }
  }

  const percent =
    value =>
      weightedSpan >
        0
        ? (
            roundDecimal(
              (
                value /
                weightedSpan
              ) *
              100,
              1
            ) ??
            0
          )
        : null

  const normalPercent =
    percent(
      normalSpan
    )

  const slowPercent =
    percent(
      slowSpan
    )

  const jamPercent =
    percent(
      jamSpan
    )

  const unknownPercent =
    percent(
      unknownSpan
    )

  return {
    evaluatedRoutes:
      analyses.length,

    routesWithTraffic,

    weightedSpan,

    normalPercent,

    slowPercent,

    jamPercent,

    unknownPercent,

    congestedRoutes,

    severeRoutes,

    level:
      weightedSpan >
        0
        ? calculateTrafficLevel({
            normalPercent,
            slowPercent,
            jamPercent
          })
        : TRAFFIC_LEVEL
            .UNKNOWN,

    /*
     * Declaramos explícitamente la naturaleza
     * del porcentaje para evitar interpretaciones
     * incorrectas en frontend/BI.
     */
    measurement:
      'POLYLINE_INDEX_WEIGHT'
  }
}

/**
 * Construye alertas de tráfico.
 *
 * @param {object|null} traffic
 * @returns {object[]}
 */
export function buildTrafficAlerts(
  traffic
) {
  const alerts =
    []

  if (
    !traffic
  ) {
    return alerts
  }

  const analysis =
    traffic.analysis ||
    traffic

  if (
    !analysis.available
  ) {
    return alerts
  }

  if (
    analysis.level ===
    TRAFFIC_LEVEL
      .SEVERE
  ) {
    alerts.push({
      severity:
        'HIGH',

      code:
        'SEVERE_TRAFFIC',

      message:
        `La ruta presenta congestión severa en aproximadamente ${analysis.jamPercent || 0}% de los intervalos analizados.`
    })

    return alerts
  }

  if (
    analysis.level ===
    TRAFFIC_LEVEL
      .CONGESTED
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'CONGESTED_ROUTE',

      message:
        'La ruta presenta una proporción relevante de circulación lenta o congestionada.'
    })

    return alerts
  }

  if (
    analysis.level ===
    TRAFFIC_LEVEL
      .MODERATE
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'MODERATE_TRAFFIC',

      message:
        'Se detectaron segmentos con circulación lenta o congestionada.'
    })
  }

  return alerts
}