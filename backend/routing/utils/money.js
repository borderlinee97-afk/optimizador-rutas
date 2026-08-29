// backend/routing/utils/money.js

/**
 * Utilidades numéricas y monetarias puras
 * del Motor Operativo Integral.
 *
 * PRINCIPIO IMPORTANTE:
 *
 * 0 !== null
 *
 * 0:
 *   valor conocido cuyo importe real es cero.
 *
 * null:
 *   valor desconocido, no configurado o no disponible.
 *
 * Este módulo NO:
 * - consulta base de datos
 * - consulta APIs
 * - conoce Express
 * - decide costos operativos
 *
 * Sólo normaliza y opera valores monetarios.
 */

/**
 * Convierte un valor a número finito.
 *
 * Devuelve null cuando:
 * - es null
 * - es undefined
 * - es cadena vacía
 * - no puede convertirse a número finito
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function toOptionalNumber(
  value
) {
  if (
    value == null ||
    value === ''
  ) {
    return null
  }

  const number =
    Number(
      value
    )

  return Number.isFinite(
    number
  )
    ? number
    : null
}

/**
 * Normaliza un valor numérico no negativo.
 *
 * Si el valor no existe o no es válido:
 * devuelve null.
 *
 * Si es negativo:
 * devuelve null.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function toOptionalNonNegativeNumber(
  value
) {
  const number =
    toOptionalNumber(
      value
    )

  if (
    number ==
      null ||
    number <
      0
  ) {
    return null
  }

  return number
}

/**
 * Normaliza un número no negativo utilizando
 * un fallback cuando el valor no sea válido.
 *
 * A diferencia de toOptionalNonNegativeNumber(),
 * esta función SIEMPRE devuelve un número.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
export function toNonNegativeNumber(
  value,
  fallback = 0
) {
  const number =
    toOptionalNonNegativeNumber(
      value
    )

  if (
    number !=
    null
  ) {
    return number
  }

  const fallbackNumber =
    Number(
      fallback
    )

  if (
    !Number.isFinite(
      fallbackNumber
    ) ||
    fallbackNumber <
      0
  ) {
    return 0
  }

  return fallbackNumber
}

/**
 * Redondea un número a determinada cantidad
 * de decimales.
 *
 * Si el valor es null o inválido:
 * devuelve null.
 *
 * @param {unknown} value
 * @param {number} decimals
 * @returns {number|null}
 */
export function roundDecimal(
  value,
  decimals = 2
) {
  const number =
    toOptionalNumber(
      value
    )

  if (
    number ==
      null
  ) {
    return null
  }

  const safeDecimals =
    Math.min(
      Math.max(
        Math.trunc(
          Number(
            decimals
          ) ||
          0
        ),
        0
      ),
      8
    )

  const factor =
    10 **
    safeDecimals

  return (
    Math.round(
      (
        number +
        Number.EPSILON
      ) *
      factor
    ) /
    factor
  )
}

/**
 * Redondeo monetario estándar a centavos.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function roundMoney(
  value
) {
  return roundDecimal(
    value,
    2
  )
}

/**
 * Multiplica dos valores monetarios/operativos.
 *
 * IMPORTANTE:
 * si cualquiera de los dos componentes
 * es desconocido, devuelve null.
 *
 * Ejemplo:
 *
 * litros = 100
 * precio = null
 *
 * resultado = null
 *
 * No debe devolver 0, porque eso implicaría
 * falsamente que el combustible no cuesta.
 *
 * @param {unknown} quantity
 * @param {unknown} unitCost
 * @param {number} decimals
 * @returns {number|null}
 */
export function multiplyCost(
  quantity,
  unitCost,
  decimals = 2
) {
  const normalizedQuantity =
    toOptionalNumber(
      quantity
    )

  const normalizedUnitCost =
    toOptionalNumber(
      unitCost
    )

  if (
    normalizedQuantity ==
      null ||
    normalizedUnitCost ==
      null
  ) {
    return null
  }

  return roundDecimal(
    normalizedQuantity *
    normalizedUnitCost,
    decimals
  )
}

/**
 * Suma únicamente valores conocidos.
 *
 * Devuelve 0 si todos los valores proporcionados
 * son valores conocidos en cero.
 *
 * Devuelve null cuando no existe ningún valor
 * numérico conocido.
 *
 * @param {...unknown} values
 * @returns {number|null}
 */
export function sumKnownValues(
  ...values
) {
  const knownValues =
    values
      .map(
        toOptionalNumber
      )
      .filter(
        value =>
          value !=
          null
      )

  if (
    !knownValues.length
  ) {
    return null
  }

  return roundDecimal(
    knownValues.reduce(
      (
        total,
        value
      ) =>
        total +
        value,
      0
    ),
    4
  )
}

/**
 * Suma costos conocidos y devuelve información
 * sobre la completitud del cálculo.
 *
 * Ejemplo:
 *
 * sumCostComponents({
 *   fuel: 1000,
 *   tolls: 500,
 *   maintenance: null
 * })
 *
 * =>
 *
 * {
 *   totalKnown: 1500,
 *   knownCount: 2,
 *   unknownCount: 1,
 *   totalComponents: 3,
 *   complete: false
 * }
 *
 * @param {Record<string, unknown>} components
 * @returns {{
 *   totalKnown: number,
 *   knownCount: number,
 *   unknownCount: number,
 *   totalComponents: number,
 *   complete: boolean,
 *   knownKeys: string[],
 *   unknownKeys: string[]
 * }}
 */
export function sumCostComponents(
  components = {}
) {
  const safeComponents =
    (
      components &&
      typeof components ===
        'object' &&
      !Array.isArray(
        components
      )
    )
      ? components
      : {}

  let totalKnown =
    0

  const knownKeys =
    []

  const unknownKeys =
    []

  for (
    const [
      key,
      rawValue
    ]
    of Object.entries(
      safeComponents
    )
  ) {
    const value =
      toOptionalNumber(
        rawValue
      )

    if (
      value ==
      null
    ) {
      unknownKeys.push(
        key
      )

      continue
    }

    totalKnown +=
      value

    knownKeys.push(
      key
    )
  }

  const totalComponents =
    knownKeys.length +
    unknownKeys.length

  return {
    totalKnown:
      roundMoney(
        totalKnown
      ) ??
      0,

    knownCount:
      knownKeys.length,

    unknownCount:
      unknownKeys.length,

    totalComponents,

    complete:
      totalComponents >
        0 &&
      unknownKeys.length ===
        0,

    knownKeys,

    unknownKeys
  }
}

/**
 * Calcula un costo unitario.
 *
 * Ejemplos:
 *
 * costo/km
 * costo/unidad
 * costo/parada
 * costo/día
 * costo/operador
 *
 * Devuelve null si:
 * - el costo es desconocido
 * - la cantidad es desconocida
 * - la cantidad es <= 0
 *
 * @param {unknown} totalCost
 * @param {unknown} quantity
 * @param {number} decimals
 * @returns {number|null}
 */
export function calculateUnitCost(
  totalCost,
  quantity,
  decimals = 2
) {
  const cost =
    toOptionalNumber(
      totalCost
    )

  const divisor =
    toOptionalNumber(
      quantity
    )

  if (
    cost ==
      null ||
    divisor ==
      null ||
    divisor <=
      0
  ) {
    return null
  }

  return roundDecimal(
    cost /
    divisor,
    decimals
  )
}

/**
 * Calcula costo de combustible a partir
 * de distancia y rendimiento.
 *
 * NO estima precio.
 *
 * Si rendimiento o precio no existen,
 * la propiedad correspondiente queda null.
 *
 * @param {{
 *   distanceMeters?: number,
 *   kmPerLiter?: number,
 *   pricePerLiter?: number
 * }} params
 *
 * @returns {{
 *   distanceKm: number|null,
 *   kmPerLiter: number|null,
 *   liters: number|null,
 *   pricePerLiter: number|null,
 *   cost: number|null
 * }}
 */
export function calculateFuelCost({
  distanceMeters,
  kmPerLiter,
  pricePerLiter
} = {}) {
  const meters =
    toOptionalNonNegativeNumber(
      distanceMeters
    )

  const performance =
    toOptionalNumber(
      kmPerLiter
    )

  const price =
    toOptionalNonNegativeNumber(
      pricePerLiter
    )

  const distanceKm =
    meters !=
      null
      ? roundDecimal(
          meters /
          1000,
          3
        )
      : null

  const validPerformance =
    performance !=
      null &&
    performance >
      0
      ? performance
      : null

  const liters =
    (
      distanceKm !=
        null &&
      validPerformance !=
        null
    )
      ? roundDecimal(
          distanceKm /
          validPerformance,
          4
        )
      : null

  const cost =
    multiplyCost(
      liters,
      price,
      2
    )

  return {
    distanceKm,

    kmPerLiter:
      validPerformance,

    liters,

    pricePerLiter:
      price,

    cost
  }
}

/**
 * Calcula un porcentaje de integridad.
 *
 * Este porcentaje NO expresa precisión matemática.
 * Expresa cuántos conceptos esperados tienen
 * información disponible.
 *
 * Ejemplo:
 *
 * 4 conceptos conocidos de 5
 * => 80
 *
 * @param {number} known
 * @param {number} total
 * @returns {number}
 */
export function calculateCompletenessPercent(
  known,
  total
) {
  const knownValue =
    Math.max(
      0,
      Number(
        known
      ) ||
      0
    )

  const totalValue =
    Math.max(
      0,
      Number(
        total
      ) ||
      0
    )

  if (
    totalValue <=
      0
  ) {
    return 0
  }

  return (
    roundDecimal(
      Math.min(
        100,
        (
          knownValue /
          totalValue
        ) *
        100
      ),
      1
    ) ??
    0
  )
}

/**
 * Formatea un valor monetario para texto.
 *
 * Se utiliza únicamente para presentaciones
 * sencillas generadas desde backend.
 *
 * El frontend seguirá teniendo libertad
 * para presentar los valores como requiera.
 *
 * @param {unknown} value
 * @param {string} currency
 * @param {string} locale
 * @returns {string|null}
 */
export function formatMoney(
  value,
  currency = 'MXN',
  locale = 'es-MX'
) {
  const number =
    toOptionalNumber(
      value
    )

  if (
    number ==
      null
  ) {
    return null
  }

  try {
    return new Intl
      .NumberFormat(
        locale,
        {
          style:
            'currency',

          currency,

          minimumFractionDigits:
            2,

          maximumFractionDigits:
            2
        }
      )
      .format(
        number
      )
  } catch {
    return (
      `${roundMoney(number)} ${currency}`
    )
  }
}