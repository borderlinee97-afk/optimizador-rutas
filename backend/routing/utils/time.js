// backend/routing/utils/time.js

/**
 * Utilidades temporales puras del Motor Operativo Integral.
 *
 * Este módulo NO:
 * - consulta base de datos
 * - consulta Google
 * - conoce Express
 * - decide jornadas
 * - decide rutas
 *
 * Sólo normaliza, convierte y presenta valores de tiempo.
 */

/**
 * Convierte una duración compatible con Google Routes
 * a segundos enteros.
 *
 * Ejemplos:
 * "3600s"    -> 3600
 * "45.7s"    -> 46
 * 900        -> 900
 * null       -> 0
 *
 * @param {string|number|null|undefined} value
 * @returns {number}
 */
export function parseDurationSec(
  value
) {
  if (
    value == null ||
    value === ''
  ) {
    return 0
  }

  const normalized =
    String(
      value
    )
      .trim()
      .replace(
        /s$/i,
        ''
      )

  const seconds =
    Number.parseFloat(
      normalized
    )

  if (
    !Number.isFinite(
      seconds
    )
  ) {
    return 0
  }

  return Math.max(
    0,
    Math.round(
      seconds
    )
  )
}

/**
 * Convierte HH:MM a segundos transcurridos desde 00:00.
 *
 * Ejemplo:
 * "16:00" -> 57600
 *
 * @param {string} value
 * @param {string} fallback
 * @returns {number}
 */
export function timeToSeconds(
  value = '00:00',
  fallback = '00:00'
) {
  const normalized =
    normalizeClock(
      value,
      fallback
    )

  const [
    hours,
    minutes
  ] =
    normalized
      .split(':')
      .map(Number)

  return (
    hours *
      3600 +
    minutes *
      60
  )
}

/**
 * Convierte segundos desde 00:00 a HH:MM.
 *
 * Por compatibilidad con el motor actual:
 * - valores negativos se convierten a 00:00
 * - no se fuerza un máximo de 23:59
 *
 * Ejemplo:
 * 57600 -> "16:00"
 *
 * @param {number} seconds
 * @returns {string}
 */
export function secondsToClock(
  seconds
) {
  const safeSeconds =
    Math.max(
      0,
      Math.round(
        Number(
          seconds
        ) ||
        0
      )
    )

  const hours =
    Math.floor(
      safeSeconds /
      3600
    )

  const minutes =
    Math.floor(
      (
        safeSeconds %
        3600
      ) /
      60
    )

  return (
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  )
}

/**
 * Valida un horario HH:MM en formato de 24 horas.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidClock(
  value
) {
  if (
    typeof value !==
    'string'
  ) {
    return false
  }

  const match =
    value
      .trim()
      .match(
        /^(\d{1,2}):(\d{2})$/
      )

  if (
    !match
  ) {
    return false
  }

  const hours =
    Number(
      match[1]
    )

  const minutes =
    Number(
      match[2]
    )

  return (
    Number.isInteger(
      hours
    ) &&
    Number.isInteger(
      minutes
    ) &&
    hours >=
      0 &&
    hours <=
      23 &&
    minutes >=
      0 &&
    minutes <=
      59
  )
}

/**
 * Normaliza un horario al formato HH:MM.
 *
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
export function normalizeClock(
  value,
  fallback = '00:00'
) {
  const candidate =
    String(
      value ??
      ''
    ).trim()

  if (
    isValidClock(
      candidate
    )
  ) {
    const [
      hours,
      minutes
    ] =
      candidate
        .split(':')
        .map(Number)

    return (
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    )
  }

  if (
    isValidClock(
      fallback
    )
  ) {
    const [
      hours,
      minutes
    ] =
      String(
        fallback
      )
        .trim()
        .split(':')
        .map(Number)

    return (
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    )
  }

  return '00:00'
}

/**
 * Obtiene una fecha RFC3339/ISO correspondiente al día siguiente
 * en un horario determinado.
 *
 * IMPORTANTE:
 * por ahora conserva el comportamiento del motor existente:
 * utiliza la zona horaria del proceso Node.
 *
 * La utilización formal de timezone por proyecto/CEDIS
 * se realizará posteriormente dentro de scheduling.service.js.
 *
 * @param {string} clock
 * @param {Date} baseDate
 * @returns {string}
 */
export function getTomorrowRfc3339Time(
  clock = '08:00',
  baseDate = new Date()
) {
  const normalizedClock =
    normalizeClock(
      clock,
      '08:00'
    )

  const [
    hour,
    minute
  ] =
    normalizedClock
      .split(':')
      .map(Number)

  const target =
    new Date(
      baseDate
    )

  target.setDate(
    target.getDate() +
    1
  )

  target.setHours(
    hour,
    minute,
    0,
    0
  )

  return target.toISOString()
}

/**
 * Convierte minutos a segundos.
 *
 * @param {number} minutes
 * @returns {number}
 */
export function minutesToSeconds(
  minutes
) {
  const value =
    Number(
      minutes
    )

  if (
    !Number.isFinite(
      value
    ) ||
    value <=
      0
  ) {
    return 0
  }

  return Math.round(
    value *
    60
  )
}

/**
 * Convierte horas a segundos.
 *
 * @param {number} hours
 * @returns {number}
 */
export function hoursToSeconds(
  hours
) {
  const value =
    Number(
      hours
    )

  if (
    !Number.isFinite(
      value
    ) ||
    value <=
      0
  ) {
    return 0
  }

  return Math.round(
    value *
    3600
  )
}

/**
 * Convierte segundos a horas decimales.
 *
 * Ejemplo:
 * 5400 -> 1.5
 *
 * @param {number} seconds
 * @returns {number}
 */
export function secondsToHours(
  seconds
) {
  const value =
    Number(
      seconds
    )

  if (
    !Number.isFinite(
      value
    ) ||
    value <=
      0
  ) {
    return 0
  }

  return (
    value /
    3600
  )
}

/**
 * Convierte segundos a minutos decimales.
 *
 * @param {number} seconds
 * @returns {number}
 */
export function secondsToMinutes(
  seconds
) {
  const value =
    Number(
      seconds
    )

  if (
    !Number.isFinite(
      value
    ) ||
    value <=
      0
  ) {
    return 0
  }

  return (
    value /
    60
  )
}

/**
 * Suma varias duraciones expresadas en segundos,
 * ignorando valores inválidos.
 *
 * @param {...number} values
 * @returns {number}
 */
export function sumSeconds(
  ...values
) {
  return values.reduce(
    (
      total,
      value
    ) => {
      const seconds =
        Number(
          value
        )

      if (
        !Number.isFinite(
          seconds
        )
      ) {
        return total
      }

      return (
        total +
        Math.max(
          0,
          seconds
        )
      )
    },
    0
  )
}

/**
 * Presentación legible para paneles operativos/ejecutivos.
 *
 * Ejemplos:
 * 3660   -> "1 h 1 min"
 * 7200   -> "2 h"
 * 1800   -> "30 min"
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(
  seconds
) {
  const safeSeconds =
    Math.max(
      0,
      Math.round(
        Number(
          seconds
        ) ||
        0
      )
    )

  const totalMinutes =
    Math.round(
      safeSeconds /
      60
    )

  const hours =
    Math.floor(
      totalMinutes /
      60
    )

  const minutes =
    totalMinutes %
    60

  if (
    hours >
      0 &&
    minutes >
      0
  ) {
    return (
      `${hours} h ${minutes} min`
    )
  }

  if (
    hours >
      0
  ) {
    return (
      `${hours} h`
    )
  }

  return (
    `${minutes} min`
  )
}