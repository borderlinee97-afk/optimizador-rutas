// backend/routing/services/lodging.service.js

import {
  haversine,
  isValidLatLng
} from '../utils/geo.js'

import {
  roundDecimal,
  toOptionalNonNegativeNumber
} from '../utils/money.js'

import {
  searchLodgingNearby
} from '../providers/googlePlaces.provider.js'

/**
 * Servicio de hospedaje
 * del Motor Operativo Integral.
 *
 * RESPONSABILIDADES:
 *
 * - decidir si una jornada requiere hospedaje
 * - buscar candidatos
 * - evaluar distancia al cierre de jornada
 * - evaluar conveniencia respecto al siguiente destino
 * - seleccionar hospedaje
 * - preparar continuidad de ruta foránea
 *
 * NO:
 *
 * - calcula la ruta principal
 * - calcula jornadas
 * - conoce Express
 * - consulta PostgreSQL
 */

export const LODGING_DECISION =
  Object.freeze({
    REQUIRED:
      'REQUIRED',

    NOT_REQUIRED:
      'NOT_REQUIRED',

    UNKNOWN:
      'UNKNOWN'
  })

export const LODGING_SOURCE =
  Object.freeze({
    GOOGLE_PLACES:
      'GOOGLE_PLACES',

    MANUAL:
      'MANUAL',

    PREFERRED:
      'PREFERRED',

    NOT_AVAILABLE:
      'NOT_AVAILABLE'
  })

export const LODGING_DEFAULTS =
  Object.freeze({
    searchRadiusKm:
      20,

    maxResults:
      10,

    /*
     * Peso del hotel respecto al final
     * de la jornada.
     */
    currentEndpointWeight:
      0.65,

    /*
     * Peso respecto al siguiente punto
     * que se atenderá.
     */
    nextStopWeight:
      0.35
  })

/**
 * Decide si se requiere hospedaje.
 *
 * Regla inicial:
 *
 * - Si existen más jornadas después de ésta,
 *   hay necesidad potencial de hospedaje.
 *
 * - El último día no requiere hospedaje
 *   si la ruta regresa al origen.
 *
 * @param {{
 *   currentDay?: number,
 *   totalDays?: number,
 *   returnToOriginAtEnd?: boolean
 * }} params
 *
 * @returns {string}
 */
export function determineLodgingRequirement({
  currentDay,
  totalDays,
  returnToOriginAtEnd = true
} = {}) {
  const day =
    Number(
      currentDay
    )

  const total =
    Number(
      totalDays
    )

  if (
    !Number.isFinite(
      day
    ) ||
    !Number.isFinite(
      total
    ) ||
    day <=
      0 ||
    total <=
      0
  ) {
    return LODGING_DECISION
      .UNKNOWN
  }

  if (
    day <
    total
  ) {
    return LODGING_DECISION
      .REQUIRED
  }

  if (
    day ===
      total &&
    returnToOriginAtEnd
  ) {
    return LODGING_DECISION
      .NOT_REQUIRED
  }

  return LODGING_DECISION
    .NOT_REQUIRED
}

/**
 * Calcula distancia entre dos puntos en km.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number|null}
 */
export function distanceKm(
  a,
  b
) {
  if (
    !isValidLatLng(
      a
    ) ||
    !isValidLatLng(
      b
    )
  ) {
    return null
  }

  return roundDecimal(
    haversine(
      a,
      b
    ) /
    1000,
    3
  )
}

/**
 * Normaliza candidato de hospedaje.
 *
 * @param {object} lodging
 * @returns {object|null}
 */
export function normalizeLodgingCandidate(
  lodging
) {
  if (
    !lodging ||
    !isValidLatLng(
      lodging
    )
  ) {
    return null
  }

  return {
    id:
      lodging.id ??
      null,

    name:
      lodging.name ??
      lodging.nombre ??
      '',

    address:
      lodging.address ??
      lodging.direccion ??
      '',

    lat:
      Number(
        lodging.lat
      ),

    lng:
      Number(
        lodging.lng
      ),

    rating:
      toOptionalNonNegativeNumber(
        lodging.rating
      ),

    businessStatus:
      lodging.businessStatus ??
      null,

    googleMapsUri:
      lodging.googleMapsUri ??
      null,

    source:
      lodging.source ??
      LODGING_SOURCE
        .GOOGLE_PLACES,

    raw:
      lodging.raw ??
      lodging
  }
}

/**
 * Calcula puntuación geográfica.
 *
 * Menor puntuación = mejor.
 *
 * @param {{
 *   lodging: object,
 *   currentEndpoint: object,
 *   nextStop?: object|null,
 *   currentEndpointWeight?: number,
 *   nextStopWeight?: number
 * }} params
 *
 * @returns {object|null}
 */
export function scoreLodgingCandidate({
  lodging,
  currentEndpoint,
  nextStop = null,

  currentEndpointWeight =
    LODGING_DEFAULTS
      .currentEndpointWeight,

  nextStopWeight =
    LODGING_DEFAULTS
      .nextStopWeight
} = {}) {
  const candidate =
    normalizeLodgingCandidate(
      lodging
    )

  if (
    !candidate ||
    !isValidLatLng(
      currentEndpoint
    )
  ) {
    return null
  }

  const fromEndpointKm =
    distanceKm(
      currentEndpoint,
      candidate
    )

  const toNextStopKm =
    isValidLatLng(
      nextStop
    )
      ? distanceKm(
          candidate,
          nextStop
        )
      : null

  const endpointWeight =
    Number.isFinite(
      Number(
        currentEndpointWeight
      )
    )
      ? Number(
          currentEndpointWeight
        )
      : LODGING_DEFAULTS
          .currentEndpointWeight

  const nextWeight =
    Number.isFinite(
      Number(
        nextStopWeight
      )
    )
      ? Number(
          nextStopWeight
        )
      : LODGING_DEFAULTS
          .nextStopWeight

  let score =
    (
      fromEndpointKm ??
      Infinity
    ) *
    endpointWeight

  if (
    toNextStopKm !=
    null
  ) {
    score +=
      toNextStopKm *
      nextWeight
  }

  /*
   * Rating se utiliza sólo como desempate
   * ligero.
   *
   * Nunca queremos elegir un hotel lejano
   * únicamente porque tiene mejor calificación.
   */
  const rating =
    candidate.rating

  let ratingAdjustment =
    0

  if (
    rating !=
      null
  ) {
    ratingAdjustment =
      Math.max(
        0,
        5 -
        rating
      ) *
      0.1

    score +=
      ratingAdjustment
  }

  return {
    ...candidate,

    distanceFromEndpointKm:
      fromEndpointKm,

    distanceToNextStopKm:
      toNextStopKm,

    score:
      roundDecimal(
        score,
        4
      ),

    ratingAdjustment:
      roundDecimal(
        ratingAdjustment,
        4
      )
  }
}

/**
 * Ordena candidatos.
 *
 * @param {{
 *   candidates?: object[],
 *   currentEndpoint: object,
 *   nextStop?: object|null
 * }} params
 *
 * @returns {object[]}
 */
export function rankLodgingCandidates({
  candidates = [],
  currentEndpoint,
  nextStop = null
} = {}) {
  return (
    Array.isArray(
      candidates
    )
      ? candidates
      : []
  )
    .map(
      lodging =>
        scoreLodgingCandidate({
          lodging,
          currentEndpoint,
          nextStop
        })
    )
    .filter(
      Boolean
    )
    .sort(
      (
        a,
        b
      ) =>
        a.score -
        b.score
    )
}

/**
 * Selecciona mejor hospedaje
 * de una colección existente.
 *
 * @param {object} params
 * @returns {object|null}
 */
export function selectBestLodging(
  params = {}
) {
  const ranked =
    rankLodgingCandidates(
      params
    )

  return (
    ranked[0] ||
    null
  )
}

/**
 * Busca hospedaje usando Google Places
 * y selecciona el más conveniente.
 *
 * @param {{
 *   currentEndpoint: object,
 *   nextStop?: object|null,
 *   radiusKm?: number,
 *   maxResults?: number,
 *   signal?: AbortSignal
 * }} params
 *
 * @returns {Promise<object>}
 */
export async function findOperationalLodging({
  currentEndpoint,
  nextStop = null,

  radiusKm =
    LODGING_DEFAULTS
      .searchRadiusKm,

  maxResults =
    LODGING_DEFAULTS
      .maxResults,

  signal
} = {}) {
  if (
    !isValidLatLng(
      currentEndpoint
    )
  ) {
    return {
      available:
        false,

      selected:
        null,

      candidates: [],

      reason:
        'INVALID_ENDPOINT'
    }
  }

  const candidates =
    await searchLodgingNearby({
      center:
        currentEndpoint,

      radiusKm,

      maxResults,

      signal
    })

  const ranked =
    rankLodgingCandidates({
      candidates,

      currentEndpoint,

      nextStop
    })

  return {
    available:
      ranked.length >
      0,

    selected:
      ranked[0] ||
      null,

    candidates:
      ranked,

    searchedRadiusKm:
      Number(
        radiusKm
      ),

    source:
      LODGING_SOURCE
        .GOOGLE_PLACES
  }
}

/**
 * Construye un plan de hospedaje
 * para una ruta de múltiples jornadas.
 *
 * No realiza búsqueda automáticamente.
 * Sólo organiza resultados ya resueltos.
 *
 * @param {{
 *   totalDays?: number,
 *   nights?: object[]
 * }} params
 *
 * @returns {object}
 */
export function buildLodgingPlan({
  totalDays = 1,
  nights = []
} = {}) {
  const days =
    Math.max(
      1,
      Math.floor(
        Number(
          totalDays
        ) ||
        1
      )
    )

  const expectedNights =
    Math.max(
      0,
      days -
      1
    )

  const normalizedNights =
    (
      Array.isArray(
        nights
      )
        ? nights
        : []
    )
      .map(
        (
          night,
          index
        ) => ({
          night:
            index +
            1,

          afterDay:
            night.afterDay ??
            index +
            1,

          lodging:
            normalizeLodgingCandidate(
              night.lodging ??
              night
            ),

          estimatedCost:
            toOptionalNonNegativeNumber(
              night.estimatedCost ??
              night.cost
            )
        })
      )
      .filter(
        night =>
          night.lodging
      )

  const knownCosts =
    normalizedNights
      .map(
        night =>
          night.estimatedCost
      )
      .filter(
        value =>
          value !=
          null
      )

  const totalKnownCost =
    knownCosts.length
      ? roundDecimal(
          knownCosts.reduce(
            (
              total,
              value
            ) =>
              total +
              value,
            0
          ),
          2
        )
      : (
          expectedNights ===
            0
            ? 0
            : null
        )

  return {
    required:
      expectedNights >
      0,

    totalDays:
      days,

    expectedNights,

    resolvedNights:
      normalizedNights.length,

    unresolvedNights:
      Math.max(
        0,
        expectedNights -
        normalizedNights.length
      ),

    nights:
      normalizedNights,

    totalKnownCost,

    complete:
      normalizedNights.length >=
      expectedNights
  }
}

/**
 * Devuelve coordenadas desde las que
 * debe continuar el siguiente día.
 *
 * @param {object|null} lodging
 * @param {object} fallback
 * @returns {object}
 */
export function resolveNextDayOrigin(
  lodging,
  fallback
) {
  const normalized =
    normalizeLodgingCandidate(
      lodging
    )

  if (
    normalized
  ) {
    return {
      lat:
        normalized.lat,

      lng:
        normalized.lng,

      lodgingId:
        normalized.id,

      lodgingName:
        normalized.name
    }
  }

  return fallback
}

/**
 * Alertas operativas.
 *
 * @param {object|null} plan
 * @returns {object[]}
 */
export function buildLodgingAlerts(
  plan
) {
  const alerts =
    []

  if (
    !plan
  ) {
    return alerts
  }

  if (
    plan.required &&
    plan.unresolvedNights >
      0
  ) {
    alerts.push({
      severity:
        'WARNING',

      code:
        'LODGING_NOT_RESOLVED',

      message:
        `Falta resolver hospedaje para ${plan.unresolvedNights} noche(s).`
    })
  }

  if (
    plan.required &&
    plan.totalKnownCost ==
      null
  ) {
    alerts.push({
      severity:
        'INFO',

      code:
        'LODGING_COST_UNKNOWN',

      message:
        'El hospedaje fue considerado operativamente, pero todavía no existe un costo completo disponible.'
    })
  }

  return alerts
}