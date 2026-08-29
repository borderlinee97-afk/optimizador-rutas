// backend/routing/providers/googlePlaces.provider.js

import {
  isValidLatLng
} from '../utils/geo.js'

import {
  roundDecimal,
  toOptionalNumber
} from '../utils/money.js'

/**
 * Provider de Google Places API (New)
 * para el Motor Operativo Integral.
 *
 * RESPONSABILIDADES:
 *
 * - Nearby Search
 * - búsqueda de hospedajes
 * - búsqueda de gasolineras
 * - normalización básica de Places
 * - lectura opcional de precios de combustible
 *
 * NO:
 *
 * - decide qué hotel utilizar
 * - decide dónde cargar combustible
 * - calcula costos empresariales
 * - consulta PostgreSQL
 * - conoce Express
 * - decide rutas
 */

const GOOGLE_PLACES_NEARBY_URL =
  'https://places.googleapis.com/v1/places:searchNearby'

export const GOOGLE_PLACE_TYPES = {
  LODGING:
    'lodging',

  HOTEL:
    'hotel',

  MOTEL:
    'motel',

  HOSTEL:
    'hostel',

  INN:
    'inn',

  GUEST_HOUSE:
    'guest_house',

  EXTENDED_STAY_HOTEL:
    'extended_stay_hotel',

  RESORT_HOTEL:
    'resort_hotel',

  GAS_STATION:
    'gas_station',

  REST_STOP:
    'rest_stop'
}

export const GOOGLE_FUEL_TYPES = {
  DIESEL:
    'DIESEL',

  DIESEL_PLUS:
    'DIESEL_PLUS',

  TRUCK_DIESEL:
    'TRUCK_DIESEL',

  REGULAR_UNLEADED:
    'REGULAR_UNLEADED',

  MIDGRADE:
    'MIDGRADE',

  PREMIUM:
    'PREMIUM',

  LPG:
    'LPG',

  BIO_DIESEL:
    'BIO_DIESEL'
}

/**
 * Error especializado del provider.
 */
export class GooglePlacesProviderError extends Error {
  constructor(
    message,
    {
      status = null,
      code = null,
      details = null
    } = {}
  ) {
    super(
      message
    )

    this.name =
      'GooglePlacesProviderError'

    this.status =
      status

    this.code =
      code

    this.details =
      details
  }
}

/**
 * Obtiene la API key.
 *
 * @returns {string}
 */
function getApiKey() {
  const apiKey =
    String(
      process.env
        .GMAPS_API_KEY ||
      ''
    ).trim()

  if (
    !apiKey
  ) {
    throw new GooglePlacesProviderError(
      'Falta GMAPS_API_KEY en backend',
      {
        code:
          'GOOGLE_MAPS_KEY_MISSING'
      }
    )
  }

  return apiKey
}

/**
 * Limita el radio permitido por Nearby Search.
 *
 * Google admite un círculo de búsqueda.
 * Por seguridad interna mantenemos:
 *
 * mínimo: 100 m
 * máximo: 50 km
 *
 * @param {unknown} value
 * @returns {number}
 */
export function normalizePlacesRadiusMeters(
  value
) {
  const number =
    Number(
      value
    )

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 20_000
  }

  return Math.min(
    Math.max(
      number,
      100
    ),
    50_000
  )
}

/**
 * Nearby Search permite un número limitado
 * de resultados por petición.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function normalizePlacesMaxResults(
  value
) {
  const number =
    Math.floor(
      Number(
        value
      )
    )

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 10
  }

  return Math.min(
    Math.max(
      number,
      1
    ),
    20
  )
}

/**
 * Limpia tipos de Place.
 *
 * @param {unknown} values
 * @returns {string[]}
 */
export function normalizeIncludedTypes(
  values
) {
  if (
    !Array.isArray(
      values
    )
  ) {
    return []
  }

  return Array.from(
    new Set(
      values
        .map(
          value =>
            String(
              value ||
              ''
            )
              .trim()
              .toLowerCase()
        )
        .filter(
          Boolean
        )
    )
  )
}

/**
 * Construye el FieldMask.
 *
 * Por defecto NO pedimos fuelOptions.
 *
 * @param {{
 *   includeRating?: boolean,
 *   includeTypes?: boolean,
 *   includeBusinessStatus?: boolean,
 *   includeGoogleMapsUri?: boolean,
 *   includeFuelOptions?: boolean
 * }} options
 *
 * @returns {string}
 */
export function buildPlacesFieldMask({
  includeRating = true,
  includeTypes = true,
  includeBusinessStatus = true,
  includeGoogleMapsUri = true,
  includeFuelOptions = false
} = {}) {
  const fields =
    new Set([
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location'
    ])

  if (
    includeRating
  ) {
    fields.add(
      'places.rating'
    )
  }

  if (
    includeTypes
  ) {
    fields.add(
      'places.types'
    )

    fields.add(
      'places.primaryType'
    )
  }

  if (
    includeBusinessStatus
  ) {
    fields.add(
      'places.businessStatus'
    )
  }

  if (
    includeGoogleMapsUri
  ) {
    fields.add(
      'places.googleMapsUri'
    )
  }

  /*
   * Este campo puede elevar el SKU/costo.
   * Sólo debe habilitarse cuando realmente
   * necesitemos analizar combustible.
   */
  if (
    includeFuelOptions
  ) {
    fields.add(
      'places.fuelOptions'
    )
  }

  return Array.from(
    fields
  ).join(',')
}

/**
 * Construye request para Nearby Search.
 *
 * @param {{
 *   center: object,
 *   radiusMeters?: number,
 *   includedTypes?: string[],
 *   maxResultCount?: number,
 *   languageCode?: string|null,
 *   regionCode?: string|null
 * }} params
 *
 * @returns {object}
 */
export function buildNearbySearchRequest({
  center,
  radiusMeters = 20_000,
  includedTypes = [],
  maxResultCount = 10,
  languageCode = 'es-MX',
  regionCode = 'MX'
} = {}) {
  if (
    !isValidLatLng(
      center
    )
  ) {
    throw new GooglePlacesProviderError(
      `Centro de búsqueda inválido: ${JSON.stringify(center)}`,
      {
        code:
          'INVALID_SEARCH_CENTER'
      }
    )
  }

  const types =
    normalizeIncludedTypes(
      includedTypes
    )

  const request = {
    maxResultCount:
      normalizePlacesMaxResults(
        maxResultCount
      ),

    locationRestriction: {
      circle: {
        center: {
          latitude:
            Number(
              center.lat
            ),

          longitude:
            Number(
              center.lng
            )
        },

        radius:
          normalizePlacesRadiusMeters(
            radiusMeters
          )
      }
    }
  }

  if (
    types.length
  ) {
    request.includedTypes =
      types
  }

  if (
    languageCode
  ) {
    request.languageCode =
      String(
        languageCode
      )
  }

  if (
    regionCode
  ) {
    request.regionCode =
      String(
        regionCode
      )
        .trim()
        .toUpperCase()
  }

  return request
}

/**
 * Ejecuta Nearby Search.
 *
 * @param {{
 *   center: object,
 *   radiusMeters?: number,
 *   includedTypes?: string[],
 *   maxResultCount?: number,
 *   languageCode?: string,
 *   regionCode?: string,
 *   includeRating?: boolean,
 *   includeTypes?: boolean,
 *   includeBusinessStatus?: boolean,
 *   includeGoogleMapsUri?: boolean,
 *   includeFuelOptions?: boolean,
 *   signal?: AbortSignal
 * }} params
 *
 * @returns {Promise<object>}
 */
export async function searchNearbyPlaces(
  params = {}
) {
  const apiKey =
    getApiKey()

  const request =
    buildNearbySearchRequest(
      params
    )

  const fieldMask =
    buildPlacesFieldMask({
      includeRating:
        params.includeRating !==
        false,

      includeTypes:
        params.includeTypes !==
        false,

      includeBusinessStatus:
        params.includeBusinessStatus !==
        false,

      includeGoogleMapsUri:
        params.includeGoogleMapsUri !==
        false,

      includeFuelOptions:
        params.includeFuelOptions ===
        true
    })

  let response

  try {
    response =
      await fetch(
        GOOGLE_PLACES_NEARBY_URL,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'X-Goog-Api-Key':
              apiKey,

            'X-Goog-FieldMask':
              fieldMask
          },

          body:
            JSON.stringify(
              request
            ),

          signal:
            params.signal
        }
      )
  } catch (
    error
  ) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw error
    }

    throw new GooglePlacesProviderError(
      'No fue posible conectar con Google Places API',
      {
        code:
          'GOOGLE_PLACES_NETWORK_ERROR',

        details:
          error?.message ||
          String(
            error
          )
      }
    )
  }

  const text =
    await response.text()

  let data =
    null

  if (
    text
  ) {
    try {
      data =
        JSON.parse(
          text
        )
    } catch {
      throw new GooglePlacesProviderError(
        `Google Places devolvió una respuesta no JSON: ${text.slice(0, 500)}`,
        {
          status:
            response.status,

          code:
            'GOOGLE_PLACES_NON_JSON'
        }
      )
    }
  }

  if (
    !response.ok
  ) {
    const googleMessage =
      data
        ?.error
        ?.message ||
      null

    const googleStatus =
      data
        ?.error
        ?.status ||
      null

    throw new GooglePlacesProviderError(
      googleMessage ||
      `Google Places API respondió HTTP ${response.status}`,
      {
        status:
          response.status,

        code:
          googleStatus ||
          'GOOGLE_PLACES_HTTP_ERROR',

        details:
          data
      }
    )
  }

  return (
    data ||
    {
      places: []
    }
  )
}

/**
 * Convierte Google Money a número decimal.
 *
 * @param {object|null} money
 * @returns {number|null}
 */
export function googleMoneyToNumber(
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
 * Normaliza precios de combustible.
 *
 * @param {object|null} place
 *
 * @returns {Array<{
 *   type:string|null,
 *   amount:number|null,
 *   currencyCode:string|null,
 *   updateTime:string|null,
 *   source:string,
 *   estimated:boolean
 * }>}
 */
export function extractFuelPrices(
  place
) {
  const prices =
    place
      ?.fuelOptions
      ?.fuelPrices

  if (
    !Array.isArray(
      prices
    )
  ) {
    return []
  }

  return prices.map(
    price => ({
      type:
        price?.type ||
        null,

      amount:
        googleMoneyToNumber(
          price?.price
        ),

      currencyCode:
        price
          ?.price
          ?.currencyCode ||
        null,

      updateTime:
        price?.updateTime ||
        null,

      source:
        'GOOGLE_PLACES',

      estimated:
        true
    })
  )
}

/**
 * Normaliza un Place para uso interno.
 *
 * @param {object} place
 * @returns {object|null}
 */
export function normalizeGooglePlace(
  place
) {
  if (
    !place
  ) {
    return null
  }

  const lat =
    Number(
      place
        ?.location
        ?.latitude
    )

  const lng =
    Number(
      place
        ?.location
        ?.longitude
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
      place.id ||
      null,

    name:
      place
        ?.displayName
        ?.text ||
      '',

    address:
      place
        ?.formattedAddress ||
      '',

    lat,

    lng,

    rating:
      toOptionalNumber(
        place.rating
      ),

    businessStatus:
      place
        ?.businessStatus ||
      null,

    primaryType:
      place
        ?.primaryType ||
      null,

    types:
      Array.isArray(
        place.types
      )
        ? [
            ...place.types
          ]
        : [],

    googleMapsUri:
      place
        ?.googleMapsUri ||
      null,

    fuelPrices:
      extractFuelPrices(
        place
      ),

    source:
      'GOOGLE_PLACES',

    raw:
      place
  }
}

/**
 * Normaliza una respuesta completa.
 *
 * @param {object} response
 * @returns {object[]}
 */
export function normalizeGooglePlacesResponse(
  response
) {
  const places =
    Array.isArray(
      response?.places
    )
      ? response.places
      : []

  return places
    .map(
      normalizeGooglePlace
    )
    .filter(
      Boolean
    )
}

/**
 * Busca hospedajes alrededor de un punto.
 *
 * Mantiene el uso actual del motor:
 * búsqueda cercana para descanso de rutas foráneas.
 *
 * La selección del MEJOR hospedaje se hará
 * posteriormente en lodging.service.js.
 *
 * @param {{
 *   center: object,
 *   radiusKm?: number,
 *   maxResults?: number,
 *   signal?: AbortSignal
 * }} params
 *
 * @returns {Promise<object[]>}
 */
export async function searchLodgingNearby({
  center,
  radiusKm = 20,
  maxResults = 10,
  signal
} = {}) {
  const data =
    await searchNearbyPlaces({
      center,

      radiusMeters:
        Number(
          radiusKm ||
          20
        ) *
        1000,

      includedTypes: [
        GOOGLE_PLACE_TYPES
          .LODGING
      ],

      maxResultCount:
        maxResults,

      includeRating:
        true,

      includeTypes:
        true,

      includeBusinessStatus:
        true,

      includeGoogleMapsUri:
        true,

      /*
       * Los precios de combustible no tienen
       * sentido en hospedajes.
       */
      includeFuelOptions:
        false,

      signal
    })

  return normalizeGooglePlacesResponse(
    data
  )
    .filter(
      place =>
        !place
          .businessStatus ||
        place
          .businessStatus ===
          'OPERATIONAL'
    )
}

/**
 * Busca gasolineras alrededor de un punto.
 *
 * Por defecto NO solicita fuelOptions.
 *
 * Esto permite localizar candidatas a bajo costo
 * antes de pedir información dinámica más cara.
 *
 * @param {{
 *   center: object,
 *   radiusKm?: number,
 *   maxResults?: number,
 *   includeFuelPrices?: boolean,
 *   signal?: AbortSignal
 * }} params
 *
 * @returns {Promise<object[]>}
 */
export async function searchGasStationsNearby({
  center,
  radiusKm = 10,
  maxResults = 10,
  includeFuelPrices = false,
  signal
} = {}) {
  const data =
    await searchNearbyPlaces({
      center,

      radiusMeters:
        Number(
          radiusKm ||
          10
        ) *
        1000,

      includedTypes: [
        GOOGLE_PLACE_TYPES
          .GAS_STATION
      ],

      maxResultCount:
        maxResults,

      includeRating:
        false,

      includeTypes:
        true,

      includeBusinessStatus:
        true,

      includeGoogleMapsUri:
        true,

      includeFuelOptions:
        includeFuelPrices ===
        true,

      signal
    })

  return normalizeGooglePlacesResponse(
    data
  )
    .filter(
      place =>
        !place
          .businessStatus ||
        place
          .businessStatus ===
          'OPERATIONAL'
    )
}

/**
 * Busca una estación por ID dentro de una colección.
 *
 * Posteriormente servirá para enriquecer
 * candidatos seleccionados por fuel.service.js.
 *
 * @param {object[]} places
 * @param {string} placeId
 * @returns {object|null}
 */
export function findPlaceById(
  places,
  placeId
) {
  if (
    !Array.isArray(
      places
    ) ||
    !placeId
  ) {
    return null
  }

  return (
    places.find(
      place =>
        String(
          place?.id ||
          ''
        ) ===
        String(
          placeId
        )
    ) ||
    null
  )
}

/**
 * Obtiene un precio de combustible específico.
 *
 * @param {object} place
 * @param {string|string[]} preferredFuelTypes
 *
 * @returns {object|null}
 */
export function findPreferredFuelPrice(
  place,
  preferredFuelTypes
) {
  const preferred =
    (
      Array.isArray(
        preferredFuelTypes
      )
        ? preferredFuelTypes
        : [
            preferredFuelTypes
          ]
    )
      .filter(
        Boolean
      )
      .map(
        value =>
          String(
            value
          )
            .trim()
            .toUpperCase()
      )

  if (
    !preferred.length
  ) {
    return null
  }

  const prices =
    Array.isArray(
      place?.fuelPrices
    )
      ? place.fuelPrices
      : []

  for (
    const fuelType
    of preferred
  ) {
    const match =
      prices.find(
        price =>
          String(
            price?.type ||
            ''
          )
            .trim()
            .toUpperCase() ===
          fuelType
      )

    if (
      match
    ) {
      return match
    }
  }

  return null
}

/**
 * Determina las preferencias iniciales
 * de combustible para nuestros vehículos
 * de distribución.
 *
 * Esto NO decide el vehículo.
 *
 * Sólo traduce un fuelType empresarial
 * a los tipos conocidos por Google Places.
 *
 * @param {unknown} fuelType
 * @returns {string[]}
 */
export function mapBusinessFuelTypeToGoogle(
  fuelType
) {
  const normalized =
    String(
      fuelType ||
      ''
    )
      .trim()
      .toUpperCase()

  if (
    normalized ===
      'DIESEL'
  ) {
    return [
      GOOGLE_FUEL_TYPES
        .DIESEL,

      GOOGLE_FUEL_TYPES
        .TRUCK_DIESEL,

      GOOGLE_FUEL_TYPES
        .DIESEL_PLUS
    ]
  }

  if (
    normalized ===
      'GASOLINE' ||
    normalized ===
      'GASOLINA' ||
    normalized ===
      'REGULAR'
  ) {
    return [
      GOOGLE_FUEL_TYPES
        .REGULAR_UNLEADED,

      GOOGLE_FUEL_TYPES
        .MIDGRADE
    ]
  }

  if (
    normalized ===
      'PREMIUM'
  ) {
    return [
      GOOGLE_FUEL_TYPES
        .PREMIUM
    ]
  }

  return []
}