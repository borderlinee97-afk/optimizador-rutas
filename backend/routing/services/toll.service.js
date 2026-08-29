// backend/routing/services/toll.service.js

import {
  haversine,
  isValidLatLng
} from '../utils/geo.js'

import {
  roundDecimal,
  roundMoney,
  toOptionalNonNegativeNumber,
  toOptionalNumber
} from '../utils/money.js'

/**
 * Servicio de casetas / peajes
 * del Motor Operativo Integral.
 *
 * OBJETIVO:
 *
 * Separar:
 *
 * 1. estimación de peajes de Google
 * 2. identificación geográfica de plazas
 * 3. tarifa de catálogo
 * 4. tarifa oficial vigente
 *
 * De esta manera el motor puede funcionar hoy
 * sin catálogo nacional y enriquecerse
 * posteriormente sin cambiar su contrato.
 *
 * ESTE SERVICIO NO:
 *
 * - consulta Google directamente
 * - consulta PostgreSQL
 * - conoce Express
 * - calcula rutas
 */

export const TOLL_SOURCES =
  Object.freeze({
    GOOGLE_ESTIMATE:
      'GOOGLE_ESTIMATE',

    CATALOG_MATCH:
      'CATALOG_MATCH',

    OFFICIAL_TARIFF:
      'OFFICIAL_TARIFF',

    MANUAL:
      'MANUAL',

    NOT_AVAILABLE:
      'NOT_AVAILABLE'
  })

export const TOLL_CONFIDENCE =
  Object.freeze({
    OFFICIAL:
      'OFFICIAL',

    HIGH:
      'HIGH',

    MEDIUM:
      'MEDIUM',

    LOW:
      'LOW',

    UNKNOWN:
      'UNKNOWN'
  })

export const TOLL_VEHICLE_CLASSES =
  Object.freeze({
    LIGHT:
      'LIGHT',

    VAN:
      'VAN',

    LIGHT_TRUCK:
      'LIGHT_TRUCK',

    MEDIUM_TRUCK:
      'MEDIUM_TRUCK',

    UNKNOWN:
      'UNKNOWN'
  })

/**
 * Convierte Google Money a número.
 *
 * @param {object|null} money
 * @returns {number|null}
 */
export function googleTollMoneyToNumber(
  money
) {
  if (
    !money ||
    typeof money !==
      'object'
  ) {
    return null
  }

  const units =
    toOptionalNumber(
      money.units
    )

  const nanos =
    toOptionalNumber(
      money.nanos
    )

  if (
    units ==
      null &&
    nanos ==
      null
  ) {
    return null
  }

  return roundDecimal(
    (
      units ||
      0
    ) +
    (
      (
        nanos ||
        0
      ) /
      1_000_000_000
    ),
    4
  )
}

/**
 * Extrae estimación de peajes desde una
 * Route de Google Routes API.
 *
 * @param {object|null} route
 * @param {string} preferredCurrency
 *
 * @returns {object}
 */
export function extractGoogleTollEstimate(
  route,
  preferredCurrency = 'MXN'
) {
  const prices =
    route
      ?.travelAdvisory
      ?.tollInfo
      ?.estimatedPrice

  if (
    !Array.isArray(
      prices
    ) ||
    !prices.length
  ) {
    return {
      hasTolls:
        false,

      amount:
        0,

      currencyCode:
        preferredCurrency,

      source:
        TOLL_SOURCES
          .GOOGLE_ESTIMATE,

      confidence:
        TOLL_CONFIDENCE
          .MEDIUM,

      estimated:
        true,

      available:
        true,

      prices: []
    }
  }

  const normalizedPrices =
    prices
      .map(
        price => ({
          amount:
            googleTollMoneyToNumber(
              price
            ),

          currencyCode:
            price
              ?.currencyCode ||
            null
        })
      )
      .filter(
        price =>
          price.amount !=
          null
      )

  if (
    !normalizedPrices.length
  ) {
    return {
      hasTolls:
        true,

      amount:
        null,

      currencyCode:
        null,

      source:
        TOLL_SOURCES
          .GOOGLE_ESTIMATE,

      confidence:
        TOLL_CONFIDENCE
          .LOW,

      estimated:
        true,

      available:
        false,

      prices: []
    }
  }

  const preferred =
    normalizedPrices.find(
      price =>
        String(
          price.currencyCode ||
          ''
        )
          .toUpperCase() ===
        String(
          preferredCurrency ||
          ''
        )
          .toUpperCase()
    )

  const selected =
    preferred ||
    normalizedPrices[0]

  return {
    hasTolls:
      true,

    amount:
      roundMoney(
        selected.amount
      ),

    currencyCode:
      selected.currencyCode ||
      preferredCurrency,

    source:
      TOLL_SOURCES
        .GOOGLE_ESTIMATE,

    confidence:
      TOLL_CONFIDENCE
        .MEDIUM,

    estimated:
      true,

    available:
      true,

    prices:
      normalizedPrices
  }
}

/**
 * Normaliza una plaza de cobro proveniente
 * de futuro catálogo propio.
 *
 * @param {object} plaza
 * @returns {object|null}
 */
export function normalizeTollPlaza(
  plaza
) {
  if (
    !plaza ||
    typeof plaza !==
      'object'
  ) {
    return null
  }

  const lat =
    Number(
      plaza.lat ??
      plaza.latitude
    )

  const lng =
    Number(
      plaza.lng ??
      plaza.longitude
    )

  if (
    !Number.isFinite(
      lat
    ) ||
    !Number.isFinite(
      lng
    )
  ) {
    return null
  }

  return {
    id:
      plaza.id ??
      null,

    name:
      plaza.name ??
      plaza.nombre ??
      '',

    operator:
      plaza.operator ??
      plaza.concesionario ??
      null,

    road:
      plaza.road ??
      plaza.carretera ??
      null,

    section:
      plaza.section ??
      plaza.tramo ??
      null,

    direction:
      plaza.direction ??
      plaza.sentido ??
      null,

    state:
      plaza.state ??
      plaza.estado ??
      null,

    lat,

    lng,

    active:
      plaza.active !==
      false,

    source:
      plaza.source ??
      null,

    raw:
      plaza
  }
}

/**
 * Normaliza tarifa de caseta.
 *
 * @param {object} tariff
 * @returns {object|null}
 */
export function normalizeTollTariff(
  tariff
) {
  if (
    !tariff ||
    typeof tariff !==
      'object'
  ) {
    return null
  }

  const amount =
    toOptionalNonNegativeNumber(
      tariff.amount ??
      tariff.tarifa
    )

  if (
    amount ==
      null
  ) {
    return null
  }

  return {
    id:
      tariff.id ??
      null,

    tollPlazaId:
      tariff.tollPlazaId ??
      tariff.toll_plaza_id ??
      null,

    vehicleClass:
      String(
        tariff.vehicleClass ??
        tariff.vehicle_class ??
        TOLL_VEHICLE_CLASSES
          .UNKNOWN
      )
        .trim()
        .toUpperCase(),

    axles:
      toOptionalNonNegativeNumber(
        tariff.axles
      ),

    amount:
      roundMoney(
        amount
      ),

    currency:
      tariff.currency ??
      'MXN',

    validFrom:
      tariff.validFrom ??
      tariff.valid_from ??
      null,

    validTo:
      tariff.validTo ??
      tariff.valid_to ??
      null,

    source:
      tariff.source ??
      null
  }
}

/**
 * Determina si una tarifa está vigente
 * para una fecha determinada.
 *
 * @param {object} tariff
 * @param {Date|string} date
 * @returns {boolean}
 */
export function isTollTariffEffective(
  tariff,
  date = new Date()
) {
  if (
    !tariff
  ) {
    return false
  }

  const target =
    date instanceof Date
      ? date
      : new Date(
          date
        )

  if (
    Number.isNaN(
      target.getTime()
    )
  ) {
    return false
  }

  if (
    tariff.validFrom
  ) {
    const from =
      new Date(
        tariff.validFrom
      )

    if (
      !Number.isNaN(
        from.getTime()
      ) &&
      target <
        from
    ) {
      return false
    }
  }

  if (
    tariff.validTo
  ) {
    const to =
      new Date(
        tariff.validTo
      )

    if (
      !Number.isNaN(
        to.getTime()
      ) &&
      target >
        to
    ) {
      return false
    }
  }

  return true
}

/**
 * Selecciona la mejor tarifa disponible.
 *
 * @param {{
 *   tariffs?: object[],
 *   vehicleClass?: string,
 *   axles?: number|null,
 *   date?: Date|string
 * }} params
 *
 * @returns {object|null}
 */
export function selectTollTariff({
  tariffs = [],
  vehicleClass =
    TOLL_VEHICLE_CLASSES
      .UNKNOWN,
  axles = null,
  date = new Date()
} = {}) {
  const normalized =
    (
      Array.isArray(
        tariffs
      )
        ? tariffs
        : []
    )
      .map(
        normalizeTollTariff
      )
      .filter(
        Boolean
      )
      .filter(
        tariff =>
          isTollTariffEffective(
            tariff,
            date
          )
      )

  if (
    !normalized.length
  ) {
    return null
  }

  const requestedClass =
    String(
      vehicleClass ||
      TOLL_VEHICLE_CLASSES
        .UNKNOWN
    )
      .trim()
      .toUpperCase()

  const requestedAxles =
    toOptionalNonNegativeNumber(
      axles
    )

  /*
   * Prioridad:
   *
   * clase + ejes
   * clase
   * UNKNOWN
   * primera vigente
   */

  const exact =
    normalized.find(
      tariff =>
        tariff.vehicleClass ===
          requestedClass &&
        (
          requestedAxles ==
            null ||
          tariff.axles ==
            null ||
          Number(
            tariff.axles
          ) ===
            Number(
              requestedAxles
            )
        )
    )

  if (
    exact
  ) {
    return exact
  }

  const byClass =
    normalized.find(
      tariff =>
        tariff.vehicleClass ===
        requestedClass
    )

  if (
    byClass
  ) {
    return byClass
  }

  const generic =
    normalized.find(
      tariff =>
        tariff.vehicleClass ===
        TOLL_VEHICLE_CLASSES
          .UNKNOWN
    )

  return (
    generic ||
    normalized[0]
  )
}

/**
 * Calcula distancia mínima aproximada entre
 * una plaza y los puntos conocidos de una ruta.
 *
 * IMPORTANTE:
 *
 * Esto NO demuestra que la carretera atraviese
 * físicamente la caseta.
 *
 * Sólo es un filtro preliminar para reducir
 * candidatos del futuro catálogo.
 *
 * @param {object} plaza
 * @param {object[]} routePoints
 * @returns {number|null}
 */
export function minimumDistanceToRoutePointsMeters(
  plaza,
  routePoints = []
) {
  const normalizedPlaza =
    normalizeTollPlaza(
      plaza
    )

  if (
    !normalizedPlaza
  ) {
    return null
  }

  const validPoints =
    (
      Array.isArray(
        routePoints
      )
        ? routePoints
        : []
    )
      .filter(
        isValidLatLng
      )

  if (
    !validPoints.length
  ) {
    return null
  }

  let minimum =
    Infinity

  for (
    const point
    of validPoints
  ) {
    const distance =
      haversine(
        normalizedPlaza,
        point
      )

    if (
      distance <
      minimum
    ) {
      minimum =
        distance
    }
  }

  return Number.isFinite(
    minimum
  )
    ? minimum
    : null
}

/**
 * Obtiene candidatos geográficos de casetas.
 *
 * NO los considera todavía casetas confirmadas.
 *
 * @param {{
 *   plazas?: object[],
 *   routePoints?: object[],
 *   maxDistanceMeters?: number
 * }} params
 *
 * @returns {object[]}
 */
export function findCandidateTollPlazas({
  plazas = [],
  routePoints = [],
  maxDistanceMeters = 5000
} = {}) {
  const radius =
    Math.max(
      100,
      Number(
        maxDistanceMeters
      ) ||
      5000
    )

  return (
    Array.isArray(
      plazas
    )
      ? plazas
      : []
  )
    .map(
      normalizeTollPlaza
    )
    .filter(
      plaza =>
        plaza &&
        plaza.active
    )
    .map(
      plaza => {
        const distanceMeters =
          minimumDistanceToRoutePointsMeters(
            plaza,
            routePoints
          )

        return {
          ...plaza,

          distanceToRouteMeters:
            distanceMeters
        }
      }
    )
    .filter(
      plaza =>
        plaza
          .distanceToRouteMeters !=
          null &&
        plaza
          .distanceToRouteMeters <=
          radius
    )
    .sort(
      (
        a,
        b
      ) =>
        a.distanceToRouteMeters -
        b.distanceToRouteMeters
    )
}

/**
 * Construye análisis de peajes
 * con estimación Google únicamente.
 *
 * Será el modo inicial del motor.
 *
 * @param {object|null} route
 * @returns {object}
 */
export function buildGoogleTollAnalysis(
  route
) {
  const estimate =
    extractGoogleTollEstimate(
      route
    )

  return {
    mode:
      TOLL_SOURCES
        .GOOGLE_ESTIMATE,

    hasTolls:
      estimate.hasTolls,

    total:
      estimate.amount,

    currencyCode:
      estimate.currencyCode,

    source:
      estimate.source,

    confidence:
      estimate.confidence,

    estimated:
      true,

    available:
      estimate.available,

    plazas: [],

    catalogMatched:
      false,

    officialTariffs:
      false
  }
}

/**
 * Construye análisis a partir de plazas
 * confirmadas y sus tarifas.
 *
 * @param {{
 *   plazas?: object[],
 *   tariffsByPlaza?: Map|object,
 *   vehicleClass?: string,
 *   axles?: number|null,
 *   date?: Date|string
 * }} params
 *
 * @returns {object}
 */
export function buildCatalogTollAnalysis({
  plazas = [],
  tariffsByPlaza = {},
  vehicleClass =
    TOLL_VEHICLE_CLASSES
      .UNKNOWN,
  axles = null,
  date = new Date()
} = {}) {
  const normalizedPlazas =
    (
      Array.isArray(
        plazas
      )
        ? plazas
        : []
    )
      .map(
        normalizeTollPlaza
      )
      .filter(
        Boolean
      )

  let total =
    0

  let knownTariffs =
    0

  const resolvedPlazas =
    []

  for (
    const plaza
    of normalizedPlazas
  ) {
    let tariffs =
      []

    if (
      tariffsByPlaza instanceof
      Map
    ) {
      tariffs =
        tariffsByPlaza.get(
          plaza.id
        ) ||
        []
    } else if (
      tariffsByPlaza &&
      typeof tariffsByPlaza ===
        'object'
    ) {
      tariffs =
        tariffsByPlaza[
          plaza.id
        ] ||
        []
    }

    const tariff =
      selectTollTariff({
        tariffs,
        vehicleClass,
        axles,
        date
      })

    if (
      tariff
    ) {
      total +=
        tariff.amount

      knownTariffs++
    }

    resolvedPlazas.push({
      ...plaza,

      tariff:
        tariff ||
        null
    })
  }

  const complete =
    normalizedPlazas.length >
      0 &&
    knownTariffs ===
      normalizedPlazas.length

  return {
    mode:
      complete
        ? TOLL_SOURCES
            .OFFICIAL_TARIFF
        : TOLL_SOURCES
            .CATALOG_MATCH,

    hasTolls:
      normalizedPlazas.length >
      0,

    total:
      normalizedPlazas.length
        ? (
            knownTariffs >
              0
              ? roundMoney(
                  total
                )
              : null
          )
        : 0,

    currencyCode:
      'MXN',

    source:
      complete
        ? TOLL_SOURCES
            .OFFICIAL_TARIFF
        : TOLL_SOURCES
            .CATALOG_MATCH,

    confidence:
      complete
        ? TOLL_CONFIDENCE
            .OFFICIAL
        : TOLL_CONFIDENCE
            .HIGH,

    estimated:
      !complete,

    available:
      normalizedPlazas.length ===
        0 ||
      knownTariffs >
        0,

    plazas:
      resolvedPlazas,

    catalogMatched:
      true,

    officialTariffs:
      complete,

    completeness: {
      plazas:
        normalizedPlazas.length,

      tariffsKnown:
        knownTariffs,

      tariffsUnknown:
        normalizedPlazas.length -
        knownTariffs,

      percent:
        normalizedPlazas.length >
          0
          ? roundDecimal(
              (
                knownTariffs /
                normalizedPlazas.length
              ) *
              100,
              1
            )
          : 100
    }
  }
}

/**
 * Adapta TollAnalysis al formato esperado
 * actualmente por cost.service.js.
 *
 * @param {object|null} analysis
 * @returns {object}
 */
export function toCostServiceTolls(
  analysis
) {
  if (
    !analysis
  ) {
    return {
      hasTolls:
        null,

      amount:
        null,

      currencyCode:
        null,

      source:
        TOLL_SOURCES
          .NOT_AVAILABLE,

      estimated:
        true
    }
  }

  return {
    hasTolls:
      typeof analysis.hasTolls ===
        'boolean'
        ? analysis.hasTolls
        : null,

    amount:
      toOptionalNonNegativeNumber(
        analysis.total
      ),

    currencyCode:
      analysis.currencyCode ||
      null,

    source:
      analysis.source ||
      TOLL_SOURCES
        .NOT_AVAILABLE,

    estimated:
      analysis.estimated !==
      false
  }
}

/**
 * Alertas para operación / alta dirección.
 *
 * @param {object|null} analysis
 * @returns {object[]}
 */
export function buildTollAlerts(
  analysis
) {
  const alerts =
    []

  if (
    !analysis
  ) {
    return alerts
  }

  if (
    analysis.hasTolls ===
      true &&
    analysis.total ==
      null
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'TOLL_AMOUNT_UNKNOWN',

      message:
        'La ruta contiene peajes pero el importe no está completamente determinado.'
    })
  }

  if (
    analysis.source ===
      TOLL_SOURCES
        .GOOGLE_ESTIMATE &&
    analysis.hasTolls ===
      true
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'TOLL_GOOGLE_ESTIMATE',

      message:
        'El costo de peajes proviene de una estimación de Google y todavía no está respaldado por catálogo oficial de plazas.'
    })
  }

  if (
    analysis.catalogMatched &&
    !analysis.officialTariffs
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'TOLL_TARIFFS_INCOMPLETE',

      message:
        'Se identificaron plazas de cobro, pero existen tarifas pendientes de validar.'
    })
  }

  return alerts
}