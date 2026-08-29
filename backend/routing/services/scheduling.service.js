// backend/routing/services/scheduling.service.js

import {
  haversine,
  isValidLatLng
} from '../utils/geo.js'

import {
  normalizeClock,
  timeToSeconds,
  hoursToSeconds,
  minutesToSeconds,
  secondsToClock,
  formatDuration
} from '../utils/time.js'

import {
  roundDecimal
} from '../utils/money.js'

/**
 * Servicio de programación operativa
 * del Motor Operativo Integral.
 *
 * RESPONSABILIDADES:
 *
 * - normalizar reglas de jornada
 * - estimar tiempos preliminares
 * - incorporar tiempo de servicio por unidad
 * - evaluar hora límite
 * - evaluar duración máxima de jornada
 * - detectar jornadas críticas
 * - generar KPIs temporales
 *
 * IMPORTANTE:
 *
 * Las estimaciones geográficas de este servicio
 * NO sustituyen las duraciones reales de Google.
 *
 * Haversine + velocidad promedio se utiliza sólo
 * para:
 *
 * - preevaluación
 * - partición preliminar
 * - fallback
 * - detección temprana de problemas
 *
 * La ruta final deberá utilizar tiempos reales
 * provenientes de Google Routes.
 */

export const SCHEDULING_DEFAULTS = Object.freeze({
  startClock:
    '08:00',

  shiftHours:
    8,

  lastArrivalClock:
    '16:00',

  serviceMinutesPerUnit:
    45,

  preliminaryAverageSpeedKmh:
    45,

  criticalUtilizationPercent:
    90,

  maxForeignDays:
    3
})

export const SCHEDULING_DAY_START_MODES = Object.freeze({
  ORIGIN:
    'ORIGIN',

  CONTINUE:
    'CONTINUE'
})

/**
 * Convierte un valor positivo a número.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveNumber(
  value,
  fallback
) {
  const number =
    Number(
      value
    )

  return (
    Number.isFinite(
      number
    ) &&
    number >
      0
  )
    ? number
    : fallback
}

/**
 * Normaliza la configuración operativa
 * utilizada para programación.
 *
 * @param {object} config
 * @returns {object}
 */
export function normalizeSchedulingConfig(
  config = {}
) {
  const startClock =
    normalizeClock(
      config.startClock,
      SCHEDULING_DEFAULTS
        .startClock
    )

  const lastArrivalClock =
    normalizeClock(
      config.lastArrivalClock,
      SCHEDULING_DEFAULTS
        .lastArrivalClock
    )

  const shiftHours =
    positiveNumber(
      config.shiftHours,
      SCHEDULING_DEFAULTS
        .shiftHours
    )

  const serviceMinutesPerUnit =
    positiveNumber(
      config.serviceMinutesPerUnit,
      SCHEDULING_DEFAULTS
        .serviceMinutesPerUnit
    )

  const preliminaryAverageSpeedKmh =
    positiveNumber(
      config.preliminaryAverageSpeedKmh,
      SCHEDULING_DEFAULTS
        .preliminaryAverageSpeedKmh
    )

  const maxForeignDays =
    Math.max(
      1,
      Math.floor(
        positiveNumber(
          config.maxForeignDays,
          SCHEDULING_DEFAULTS
            .maxForeignDays
        )
      )
    )

  const criticalUtilizationPercent =
    Math.min(
      100,
      Math.max(
        1,
        positiveNumber(
          config.criticalUtilizationPercent,
          SCHEDULING_DEFAULTS
            .criticalUtilizationPercent
        )
      )
    )

  const startSeconds =
    timeToSeconds(
      startClock
    )

  const shiftSeconds =
    hoursToSeconds(
      shiftHours
    )

  const shiftEndSeconds =
    startSeconds +
    shiftSeconds

  const lastArrivalSeconds =
    timeToSeconds(
      lastArrivalClock
    )

  return {
    startClock,

    startSeconds,

    shiftHours,

    shiftSeconds,

    shiftEndSeconds,

    shiftEndClock:
      secondsToClock(
        shiftEndSeconds
      ),

    lastArrivalClock,

    lastArrivalSeconds,

    serviceMinutesPerUnit,

    serviceSecondsPerUnit:
      minutesToSeconds(
        serviceMinutesPerUnit
      ),

    preliminaryAverageSpeedKmh,

    criticalUtilizationPercent,

    maxForeignDays
  }
}

/**
 * Obtiene el tiempo de servicio configurado
 * específicamente para un punto.
 *
 * Admite futuras fuentes sin romper
 * el contrato actual.
 *
 * @param {object} point
 * @param {number} defaultMinutes
 * @returns {number}
 */
export function getPointServiceMinutes(
  point,
  defaultMinutes =
    SCHEDULING_DEFAULTS
      .serviceMinutesPerUnit
) {
  const candidates = [
    point?.serviceMinutes,
    point?.service_minutes,

    point
      ?.meta
      ?.serviceMinutes,

    point
      ?.meta
      ?.service_minutes,

    point
      ?.meta
      ?.minutosServicio,

    point
      ?.meta
      ?.minutos_servicio
  ]

  for (
    const candidate
    of candidates
  ) {
    const number =
      Number(
        candidate
      )

    if (
      Number.isFinite(
        number
      ) &&
      number >
        0
    ) {
      return number
    }
  }

  return positiveNumber(
    defaultMinutes,
    SCHEDULING_DEFAULTS
      .serviceMinutesPerUnit
  )
}

/**
 * Estima tiempo de traslado mediante
 * distancia geodésica y velocidad promedio.
 *
 * NO representa carretera real.
 *
 * @param {object} from
 * @param {object} to
 * @param {number} averageSpeedKmh
 * @returns {number}
 */
export function estimateTravelSeconds(
  from,
  to,
  averageSpeedKmh =
    SCHEDULING_DEFAULTS
      .preliminaryAverageSpeedKmh
) {
  if (
    !isValidLatLng(
      from
    ) ||
    !isValidLatLng(
      to
    )
  ) {
    return 0
  }

  const speedKmh =
    positiveNumber(
      averageSpeedKmh,
      SCHEDULING_DEFAULTS
        .preliminaryAverageSpeedKmh
    )

  const meters =
    haversine(
      from,
      to
    )

  const metersPerSecond =
    (
      speedKmh *
      1000
    ) /
    3600

  if (
    metersPerSecond <=
      0
  ) {
    return 0
  }

  return Math.round(
    meters /
    metersPerSecond
  )
}

/**
 * Evalúa una secuencia completa de puntos.
 *
 * Puede trabajar con:
 *
 * - tiempos preliminares Haversine
 * - tiempos reales proporcionados posteriormente
 *
 * Si point.travelSecondsFromPrevious existe,
 * tendrá prioridad sobre la estimación.
 *
 * @param {{
 *   points: object[],
 *   origin: object,
 *   config?: object,
 *   returnToOrigin?: boolean
 * }} params
 *
 * @returns {object}
 */
export function evaluateWorkday({
  points = [],
  origin,
  config = {},
  returnToOrigin = false
} = {}) {
  const scheduling =
    normalizeSchedulingConfig(
      config
    )

  const safePoints =
    Array.isArray(
      points
    )
      ? points.filter(
          isValidLatLng
        )
      : []

  if (
    !isValidLatLng(
      origin
    )
  ) {
    return {
      feasible:
        false,

      reason:
        'INVALID_ORIGIN',

      stops: [],

      metrics:
        buildEmptyWorkdayMetrics(
          scheduling
        )
    }
  }

  let currentPoint =
    origin

  let currentClockSeconds =
    scheduling
      .startSeconds

  let drivingSeconds =
    0

  let serviceSeconds =
    0

  let distanceMeters =
    0

  let lastArrivalSeconds =
    null

  const stops =
    []

  const violations =
    []

  for (
    let index = 0;
    index <
    safePoints.length;
    index++
  ) {
    const point =
      safePoints[
        index
      ]

    const explicitTravelSeconds =
      Number(
        point
          ?.travelSecondsFromPrevious
      )

    const travelSeconds =
      (
        Number.isFinite(
          explicitTravelSeconds
        ) &&
        explicitTravelSeconds >=
          0
      )
        ? explicitTravelSeconds
        : estimateTravelSeconds(
            currentPoint,
            point,
            scheduling
              .preliminaryAverageSpeedKmh
          )

    const legDistanceMeters =
      (
        isValidLatLng(
          currentPoint
        ) &&
        isValidLatLng(
          point
        )
      )
        ? haversine(
            currentPoint,
            point
          )
        : 0

    currentClockSeconds +=
      travelSeconds

    drivingSeconds +=
      travelSeconds

    distanceMeters +=
      legDistanceMeters

    const arrivalSeconds =
      currentClockSeconds

    lastArrivalSeconds =
      arrivalSeconds

    const pointServiceMinutes =
      getPointServiceMinutes(
        point,
        scheduling
          .serviceMinutesPerUnit
      )

    const pointServiceSeconds =
      minutesToSeconds(
        pointServiceMinutes
      )

    const arrivalAfterLimit =
      arrivalSeconds >
      scheduling
        .lastArrivalSeconds

    if (
      arrivalAfterLimit
    ) {
      violations.push({
        type:
          'LAST_ARRIVAL_LIMIT',

        stopIndex:
          index,

        pointId:
          point.id ??
          null,

        expected:
          scheduling
            .lastArrivalClock,

        actual:
          secondsToClock(
            arrivalSeconds
          )
      })
    }

    currentClockSeconds +=
      pointServiceSeconds

    serviceSeconds +=
      pointServiceSeconds

    stops.push({
      index,

      pointId:
        point.id ??
        null,

      name:
        point.nombre ||
        point.name ||
        point
          ?.meta
          ?.nombre ||
        '',

      arrivalSeconds,

      arrivalClock:
        secondsToClock(
          arrivalSeconds
        ),

      serviceMinutes:
        pointServiceMinutes,

      departureSeconds:
        currentClockSeconds,

      departureClock:
        secondsToClock(
          currentClockSeconds
        ),

      travelSecondsFromPrevious:
        travelSeconds,

      estimatedDistanceMetersFromPrevious:
        Math.round(
          legDistanceMeters
        ),

      arrivalAfterLimit
    })

    currentPoint =
      point
  }

  let returnSeconds =
    0

  let returnDistanceMeters =
    0

  if (
    returnToOrigin &&
    safePoints.length
  ) {
    const explicitReturnSeconds =
      Number(
        safePoints[
          safePoints.length -
          1
        ]
          ?.travelSecondsToOrigin
      )

    returnSeconds =
      (
        Number.isFinite(
          explicitReturnSeconds
        ) &&
        explicitReturnSeconds >=
          0
      )
        ? explicitReturnSeconds
        : estimateTravelSeconds(
            currentPoint,
            origin,
            scheduling
              .preliminaryAverageSpeedKmh
          )

    returnDistanceMeters =
      haversine(
        currentPoint,
        origin
      )

    drivingSeconds +=
      returnSeconds

    distanceMeters +=
      returnDistanceMeters

    currentClockSeconds +=
      returnSeconds
  }

  const totalOperationalSeconds =
    Math.max(
      0,
      currentClockSeconds -
      scheduling
        .startSeconds
    )

  const shiftExceeded =
    totalOperationalSeconds >
    scheduling
      .shiftSeconds

  if (
    shiftExceeded
  ) {
    violations.push({
      type:
        'SHIFT_DURATION_EXCEEDED',

      expectedSeconds:
        scheduling
          .shiftSeconds,

      actualSeconds:
        totalOperationalSeconds
    })
  }

  const utilizationPercent =
    scheduling
      .shiftSeconds >
      0
      ? roundDecimal(
          (
            totalOperationalSeconds /
            scheduling
              .shiftSeconds
          ) *
          100,
          1
        )
      : 0

  const critical =
    (
      utilizationPercent ??
      0
    ) >=
    scheduling
      .criticalUtilizationPercent

  return {
    feasible:
      violations.length ===
      0,

    critical,

    violations,

    stops,

    metrics: {
      stopCount:
        safePoints.length,

      estimatedDistanceMeters:
        Math.round(
          distanceMeters
        ),

      estimatedDistanceKm:
        roundDecimal(
          distanceMeters /
          1000,
          2
        ),

      drivingSeconds:
        Math.round(
          drivingSeconds
        ),

      drivingFormatted:
        formatDuration(
          drivingSeconds
        ),

      serviceSeconds:
        Math.round(
          serviceSeconds
        ),

      serviceFormatted:
        formatDuration(
          serviceSeconds
        ),

      returnSeconds:
        Math.round(
          returnSeconds
        ),

      returnDistanceMeters:
        Math.round(
          returnDistanceMeters
        ),

      totalOperationalSeconds:
        Math.round(
          totalOperationalSeconds
        ),

      totalOperationalFormatted:
        formatDuration(
          totalOperationalSeconds
        ),

      startClock:
        scheduling
          .startClock,

      endClock:
        secondsToClock(
          currentClockSeconds
        ),

      lastArrivalClock:
        lastArrivalSeconds !=
          null
          ? secondsToClock(
              lastArrivalSeconds
            )
          : null,

      shiftHours:
        scheduling
          .shiftHours,

      utilizationPercent:
        utilizationPercent ??
        0
    }
  }
}

/**
 * Genera métricas vacías consistentes.
 *
 * @param {object} config
 * @returns {object}
 */
function buildEmptyWorkdayMetrics(
  config
) {
  return {
    stopCount:
      0,

    estimatedDistanceMeters:
      0,

    estimatedDistanceKm:
      0,

    drivingSeconds:
      0,

    drivingFormatted:
      '0 min',

    serviceSeconds:
      0,

    serviceFormatted:
      '0 min',

    returnSeconds:
      0,

    returnDistanceMeters:
      0,

    totalOperationalSeconds:
      0,

    totalOperationalFormatted:
      '0 min',

    startClock:
      config
        .startClock,

    endClock:
      config
        .startClock,

    lastArrivalClock:
      null,

    shiftHours:
      config
        .shiftHours,

    utilizationPercent:
      0
  }
}

/**
 * Divide preliminarmente puntos en jornadas.
 *
 * Algoritmo greedy:
 *
 * - intenta agregar la siguiente unidad
 * - evalúa la jornada
 * - si deja de ser viable, cierra el día
 * - abre una nueva jornada
 *
 * Esto NO sustituye la validación final con
 * duraciones reales de Google.
 *
 * @param {{
 *   points: object[],
 *   origin: object,
 *   config?: object,
 *   maxDays?: number,
 *   dayStartMode?: string,
 *   returnToOriginEachDay?: boolean
 * }} params
 *
 * @returns {object}
 */
export function splitIntoPreliminaryWorkdays({
  points = [],
  origin,
  config = {},
  maxDays = null,

  dayStartMode =
    SCHEDULING_DAY_START_MODES
      .CONTINUE,

  returnToOriginEachDay = false
} = {}) {
  const scheduling =
    normalizeSchedulingConfig(
      config
    )

  const effectiveMaxDays =
    Math.max(
      1,
      Math.floor(
        Number(
          maxDays
        ) ||
        scheduling
          .maxForeignDays
      )
    )

  const safePoints =
    Array.isArray(
      points
    )
      ? points.filter(
          isValidLatLng
        )
      : []

  if (
    !safePoints.length
  ) {
    return {
      days: [],
      overflowPoints: [],
      complete: true,
      totalDays: 0
    }
  }

  if (
    !isValidLatLng(
      origin
    )
  ) {
    return {
      days: [],
      overflowPoints:
        safePoints,

      complete:
        false,

      totalDays:
        0,

      reason:
        'INVALID_ORIGIN'
    }
  }

  const days =
    []

  let remaining = [
    ...safePoints
  ]

  let dayOrigin =
    origin

  while (
    remaining.length &&
    days.length <
      effectiveMaxDays
  ) {
    const accepted =
      []

    let lastAcceptedEvaluation =
      null

    while (
      remaining.length
    ) {
      const candidate =
        remaining[0]

      const candidatePoints = [
        ...accepted,
        candidate
      ]

      const evaluation =
        evaluateWorkday({
          points:
            candidatePoints,

          origin:
            dayOrigin,

          config:
            scheduling,

          returnToOrigin:
            returnToOriginEachDay
        })

      if (
        evaluation.feasible
      ) {
        accepted.push(
          candidate
        )

        remaining.shift()

        lastAcceptedEvaluation =
          evaluation

        continue
      }

      /*
       * Si ni siquiera una sola unidad cabe
       * dentro de los límites, la conservamos
       * en una jornada marcada con violación.
       *
       * No la desaparecemos silenciosamente.
       */
      if (
        accepted.length ===
        0
      ) {
        accepted.push(
          candidate
        )

        remaining.shift()

        lastAcceptedEvaluation =
          evaluation
      }

      break
    }

    if (
      !accepted.length
    ) {
      break
    }

    const finalEvaluation =
      lastAcceptedEvaluation ||
      evaluateWorkday({
        points:
          accepted,

        origin:
          dayOrigin,

        config:
          scheduling,

        returnToOrigin:
          returnToOriginEachDay
      })

    days.push({
      day:
        days.length +
        1,

      origin: {
        lat:
          Number(
            dayOrigin.lat
          ),

        lng:
          Number(
            dayOrigin.lng
          )
      },

      points:
        accepted,

      ...finalEvaluation
    })

    if (
      dayStartMode ===
        SCHEDULING_DAY_START_MODES
          .CONTINUE &&
      accepted.length
    ) {
      /*
       * En rutas foráneas el siguiente día
       * puede continuar desde la zona donde
       * terminó la jornada anterior.
       *
       * lodging.service.js posteriormente
       * sustituirá este punto por el hotel real.
       */
      dayOrigin =
        accepted[
          accepted.length -
          1
        ]
    } else {
      dayOrigin =
        origin
    }
  }

  return {
    days,

    overflowPoints:
      remaining,

    complete:
      remaining.length ===
      0,

    totalDays:
      days.length,

    maxDays:
      effectiveMaxDays
  }
}

/**
 * Resume varias jornadas para consumo
 * operativo y ejecutivo.
 *
 * @param {object[]} days
 * @returns {object}
 */
export function summarizeWorkdays(
  days = []
) {
  const safeDays =
    Array.isArray(
      days
    )
      ? days
      : []

  let stopCount =
    0

  let distanceMeters =
    0

  let drivingSeconds =
    0

  let serviceSeconds =
    0

  let operationalSeconds =
    0

  let criticalDays =
    0

  let infeasibleDays =
    0

  for (
    const day
    of safeDays
  ) {
    const metrics =
      day?.metrics ||
      {}

    stopCount +=
      Number(
        metrics.stopCount
      ) ||
      0

    distanceMeters +=
      Number(
        metrics
          .estimatedDistanceMeters
      ) ||
      0

    drivingSeconds +=
      Number(
        metrics.drivingSeconds
      ) ||
      0

    serviceSeconds +=
      Number(
        metrics.serviceSeconds
      ) ||
      0

    operationalSeconds +=
      Number(
        metrics
          .totalOperationalSeconds
      ) ||
      0

    if (
      day?.critical
    ) {
      criticalDays++
    }

    if (
      day?.feasible ===
      false
    ) {
      infeasibleDays++
    }
  }

  return {
    days:
      safeDays.length,

    stopCount,

    estimatedDistanceMeters:
      Math.round(
        distanceMeters
      ),

    estimatedDistanceKm:
      roundDecimal(
        distanceMeters /
        1000,
        2
      ),

    drivingSeconds:
      Math.round(
        drivingSeconds
      ),

    drivingFormatted:
      formatDuration(
        drivingSeconds
      ),

    serviceSeconds:
      Math.round(
        serviceSeconds
      ),

    serviceFormatted:
      formatDuration(
        serviceSeconds
      ),

    operationalSeconds:
      Math.round(
        operationalSeconds
      ),

    operationalFormatted:
      formatDuration(
        operationalSeconds
      ),

    criticalDays,

    infeasibleDays
  }
}

/**
 * Construye alertas temporales simples.
 *
 * @param {object[]} days
 * @returns {object[]}
 */
export function buildSchedulingAlerts(
  days = []
) {
  const alerts =
    []

  const safeDays =
    Array.isArray(
      days
    )
      ? days
      : []

  for (
    const day
    of safeDays
  ) {
    if (
      day?.critical
    ) {
      alerts.push({
        severity:
          'WARNING',

        code:
          'CRITICAL_WORKDAY_UTILIZATION',

        day:
          day.day,

        message:
          `La jornada ${day.day} utiliza ${day?.metrics?.utilizationPercent || 0}% del tiempo disponible.`
      })
    }

    for (
      const violation
      of (
        day?.violations ||
        []
      )
    ) {
      if (
        violation.type ===
          'LAST_ARRIVAL_LIMIT'
      ) {
        alerts.push({
          severity:
            'HIGH',

          code:
            'LAST_ARRIVAL_LIMIT',

          day:
            day.day,

          pointId:
            violation.pointId,

          message:
            `La jornada ${day.day} contempla una llegada posterior al horario límite.`
        })
      }

      if (
        violation.type ===
          'SHIFT_DURATION_EXCEEDED'
      ) {
        alerts.push({
          severity:
            'HIGH',

          code:
            'SHIFT_DURATION_EXCEEDED',

          day:
            day.day,

          message:
            `La jornada ${day.day} supera la duración máxima configurada.`
        })
      }
    }
  }

  return alerts
}