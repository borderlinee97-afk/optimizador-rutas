// backend/routing/providers/googleRoutes.provider.js

import {
  isValidLatLng
} from '../utils/geo.js'

/**
 * Proveedor oficial de Google Routes API
 * para el Motor Operativo Integral.
 *
 * RESPONSABILIDADES:
 *
 * - construir requests válidos para Compute Routes
 * - validar coordenadas
 * - administrar field masks
 * - solicitar peajes
 * - soportar departureTime para validación operativa
 * - dejar preparado tráfico sobre polilínea
 * - dejar preparado consumo estimado de combustible
 * - normalizar errores de Google
 *
 * ESTE MÓDULO NO:
 *
 * - decide qué unidades visitar
 * - asigna operadores
 * - divide jornadas
 * - calcula costos empresariales
 * - consulta PostgreSQL
 * - conoce Express
 */

const GOOGLE_ROUTES_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes'

export const GOOGLE_ROUTE_EXTRA_COMPUTATIONS =
  Object.freeze({
    TOLLS:
      'TOLLS',

    TRAFFIC:
      'TRAFFIC_ON_POLYLINE',

    FUEL:
      'FUEL_CONSUMPTION'
  })

export const GOOGLE_ROUTING_PREFERENCES =
  Object.freeze({
    TRAFFIC_AWARE:
      'TRAFFIC_AWARE',

    TRAFFIC_AWARE_OPTIMAL:
      'TRAFFIC_AWARE_OPTIMAL',

    TRAFFIC_UNAWARE:
      'TRAFFIC_UNAWARE'
  })

export const GOOGLE_VEHICLE_EMISSION_TYPES =
  Object.freeze({
    GASOLINE:
      'GASOLINE',

    DIESEL:
      'DIESEL',

    HYBRID:
      'HYBRID',

    ELECTRIC:
      'ELECTRIC'
  })

/**
 * Error especializado del proveedor.
 */
export class GoogleRoutesProviderError
  extends Error {
  constructor(
    message,
    {
      status = null,
      code = null,
      details = null
    } = {}
  ) {
    super(message)

    this.name =
      'GoogleRoutesProviderError'

    this.status =
      status

    this.code =
      code

    this.details =
      details
  }
}

/**
 * ============================================================
 * ENV
 * ============================================================
 */

function getApiKey() {
  const apiKey =
    String(
      process.env.GMAPS_API_KEY ||
      ''
    ).trim()

  if (!apiKey) {
    throw new GoogleRoutesProviderError(
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
 * ============================================================
 * DURACIONES
 * ============================================================
 */

export function parseGoogleDurationSeconds(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return Math.max(
      0,
      value
    )
  }

  const text =
    String(value).trim()

  if (!text.endsWith('s')) {
    return null
  }

  const parsed =
    Number(
      text.slice(
        0,
        -1
      )
    )

  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(
    0,
    parsed
  )
}

/**
 * ============================================================
 * DEPARTURE TIME
 * ============================================================
 */

export function normalizeGoogleDepartureTime(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
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
    throw new GoogleRoutesProviderError(
      `departureTime inválido: ${String(value)}`,
      {
        code:
          'INVALID_DEPARTURE_TIME'
      }
    )
  }

  return date.toISOString()
}

/**
 * ============================================================
 * WAYPOINTS
 * ============================================================
 */

function toGoogleWaypoint(
  point
) {
  if (
    !isValidLatLng(
      point
    )
  ) {
    throw new GoogleRoutesProviderError(
      `Coordenadas inválidas: ${JSON.stringify(point)}`,
      {
        code:
          'INVALID_COORDINATES'
      }
    )
  }

  return {
    location: {
      latLng: {
        latitude:
          Number(point.lat),

        longitude:
          Number(point.lng)
      }
    }
  }
}

function normalizeIntermediates(
  intermediates = []
) {
  if (
    !Array.isArray(
      intermediates
    )
  ) {
    throw new GoogleRoutesProviderError(
      'intermediates debe ser un arreglo',
      {
        code:
          'INVALID_INTERMEDIATES'
      }
    )
  }

  if (
    intermediates.length >
    25
  ) {
    throw new GoogleRoutesProviderError(
      'Google Routes admite máximo 25 puntos intermedios por solicitud',
      {
        code:
          'TOO_MANY_INTERMEDIATES',

        details: {
          received:
            intermediates.length,

          maximum:
            25
        }
      }
    )
  }

  return intermediates.map(
    toGoogleWaypoint
  )
}

/**
 * ============================================================
 * NORMALIZACIONES
 * ============================================================
 */

export function normalizeVehicleEmissionType(
  value
) {
  const normalized =
    String(
      value || ''
    )
      .trim()
      .toUpperCase()

  return Object.values(
    GOOGLE_VEHICLE_EMISSION_TYPES
  ).includes(
    normalized
  )
    ? normalized
    : null
}

export function normalizeRoutingPreference(
  value
) {
  const normalized =
    String(
      value || ''
    )
      .trim()
      .toUpperCase()

  if (
    Object.values(
      GOOGLE_ROUTING_PREFERENCES
    ).includes(
      normalized
    )
  ) {
    return normalized
  }

  return (
    GOOGLE_ROUTING_PREFERENCES
      .TRAFFIC_AWARE
  )
}

/**
 * ============================================================
 * EXTRA COMPUTATIONS
 * ============================================================
 */

export function buildExtraComputations({
  includeTolls = true,
  includeTraffic = false,
  includeFuel = false
} = {}) {
  const computations =
    []

  if (includeTolls) {
    computations.push(
      GOOGLE_ROUTE_EXTRA_COMPUTATIONS
        .TOLLS
    )
  }

  if (includeTraffic) {
    computations.push(
      GOOGLE_ROUTE_EXTRA_COMPUTATIONS
        .TRAFFIC
    )
  }

  if (includeFuel) {
    computations.push(
      GOOGLE_ROUTE_EXTRA_COMPUTATIONS
        .FUEL
    )
  }

  return computations
}

/**
 * ============================================================
 * FIELD MASK
 * ============================================================
 */

export function buildGoogleRoutesFieldMask({
  includeTolls = true,
  includeTraffic = false,
  includeFuel = false
} = {}) {
  const fields =
    new Set([
      'routes.distanceMeters',
      'routes.duration',
      'routes.staticDuration',

      'routes.legs',
      'routes.legs.distanceMeters',
      'routes.legs.duration',
      'routes.legs.staticDuration',

      'routes.polyline.encodedPolyline',

      'routes.optimizedIntermediateWaypointIndex',

      'routes.routeLabels'
    ])

  if (includeTolls) {
    fields.add(
      'routes.travelAdvisory.tollInfo'
    )

    fields.add(
      'routes.legs.travelAdvisory.tollInfo'
    )
  }

  if (includeTraffic) {
    fields.add(
      'routes.travelAdvisory.speedReadingIntervals'
    )

    fields.add(
      'routes.legs.polyline.encodedPolyline'
    )

    fields.add(
      'routes.legs.travelAdvisory.speedReadingIntervals'
    )
  }

  if (includeFuel) {
    fields.add(
      'routes.travelAdvisory.fuelConsumptionMicroliters'
    )
  }

  return Array.from(
    fields
  ).join(',')
}

/**
 * ============================================================
 * REQUEST
 * ============================================================
 */

export function buildGoogleRoutesRequest({
  origin,
  destination,
  intermediates = [],

  routingPreference =
    GOOGLE_ROUTING_PREFERENCES
      .TRAFFIC_AWARE,

  departureTime = null,

  avoidTolls = false,
  avoidHighways = false,
  avoidFerries = false,

  showAlternatives = false,

  optimizeWaypointOrder = false,

  includeTolls = true,
  includeTraffic = false,
  includeFuel = false,

  vehicleEmissionType = null
} = {}) {
  if (
    !isValidLatLng(
      origin
    )
  ) {
    throw new GoogleRoutesProviderError(
      `Origen inválido: ${JSON.stringify(origin)}`,
      {
        code:
          'INVALID_ORIGIN'
      }
    )
  }

  if (
    !isValidLatLng(
      destination
    )
  ) {
    throw new GoogleRoutesProviderError(
      `Destino inválido: ${JSON.stringify(destination)}`,
      {
        code:
          'INVALID_DESTINATION'
      }
    )
  }

  let selectedRoutingPreference =
    normalizeRoutingPreference(
      routingPreference
    )

  if (
    includeTraffic &&
    selectedRoutingPreference ===
      GOOGLE_ROUTING_PREFERENCES
        .TRAFFIC_UNAWARE
  ) {
    selectedRoutingPreference =
      GOOGLE_ROUTING_PREFERENCES
        .TRAFFIC_AWARE
  }

  const request = {
    origin:
      toGoogleWaypoint(
        origin
      ),

    destination:
      toGoogleWaypoint(
        destination
      ),

    intermediates:
      normalizeIntermediates(
        intermediates
      ),

    travelMode:
      'DRIVE',

    routingPreference:
      selectedRoutingPreference,

    computeAlternativeRoutes:
      Boolean(
        showAlternatives
      ),

    extraComputations:
      buildExtraComputations({
        includeTolls,
        includeTraffic,
        includeFuel
      }),

    routeModifiers: {
      avoidTolls:
        Boolean(
          avoidTolls
        ),

      avoidHighways:
        Boolean(
          avoidHighways
        ),

      avoidFerries:
        Boolean(
          avoidFerries
        )
    },

    optimizeWaypointOrder:
      Boolean(
        optimizeWaypointOrder
      )
  }

  /*
   * Para validación operativa necesitamos evaluar
   * la ruta a la hora en la que realmente
   * planeamos salir.
   *
   * Si no se manda departureTime, Google utiliza
   * la hora de ejecución de la petición.
   */
  const normalizedDepartureTime =
    normalizeGoogleDepartureTime(
      departureTime
    )

  if (
    normalizedDepartureTime &&
    selectedRoutingPreference !==
      GOOGLE_ROUTING_PREFERENCES
        .TRAFFIC_UNAWARE
  ) {
    request.departureTime =
      normalizedDepartureTime
  }

  if (includeFuel) {
    const emissionType =
      normalizeVehicleEmissionType(
        vehicleEmissionType
      )

    if (emissionType) {
      request
        .routeModifiers
        .vehicleInfo = {
          emissionType
        }
    }
  }

  return request
}

/**
 * ============================================================
 * HTTP
 * ============================================================
 */

export async function computeGoogleRoutes(
  params = {}
) {
  const apiKey =
    getApiKey()

  const {
    includeTolls = true,
    includeTraffic = false,
    includeFuel = false,
    signal = undefined
  } =
    params

  const request =
    buildGoogleRoutesRequest(
      params
    )

  const fieldMask =
    buildGoogleRoutesFieldMask({
      includeTolls,
      includeTraffic,
      includeFuel
    })

  let response

  try {
    response =
      await fetch(
        GOOGLE_ROUTES_URL,
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

          signal
        }
      )
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw error
    }

    throw new GoogleRoutesProviderError(
      'No fue posible conectar con Google Routes API',
      {
        code:
          'GOOGLE_ROUTES_NETWORK_ERROR',

        details:
          error?.message ||
          String(error)
      }
    )
  }

  const text =
    await response.text()

  let data =
    null

  if (text) {
    try {
      data =
        JSON.parse(
          text
        )
    } catch {
      throw new GoogleRoutesProviderError(
        `Google Routes devolvió una respuesta no JSON: ${text.slice(0, 500)}`,
        {
          status:
            response.status,

          code:
            'GOOGLE_ROUTES_NON_JSON'
        }
      )
    }
  }

  if (!response.ok) {
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

    throw new GoogleRoutesProviderError(
      googleMessage ||
      `Google Routes API respondió HTTP ${response.status}`,
      {
        status:
          response.status,

        code:
          googleStatus ||
          'GOOGLE_ROUTES_HTTP_ERROR',

        details:
          data
      }
    )
  }

  return (
    data ||
    {
      routes: []
    }
  )
}

/**
 * Primera Route devuelta por Google.
 */
export async function computeGoogleRoute(
  params = {}
) {
  const data =
    await computeGoogleRoutes(
      params
    )

  if (
    !Array.isArray(
      data?.routes
    ) ||
    data.routes.length === 0
  ) {
    return null
  }

  return (
    data.routes[0] ||
    null
  )
}

/**
 * ============================================================
 * FUEL
 * ============================================================
 */

export function googleMicrolitersToLiters(
  microliters
) {
  if (
    microliters == null ||
    microliters === ''
  ) {
    return null
  }

  const value =
    Number(
      microliters
    )

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null
  }

  return (
    value /
    1_000_000
  )
}

export function extractGoogleFuelEstimate(
  route
) {
  const microliters =
    route
      ?.travelAdvisory
      ?.fuelConsumptionMicroliters ??
    null

  return {
    microliters:
      microliters != null
        ? Number(microliters)
        : null,

    liters:
      googleMicrolitersToLiters(
        microliters
      ),

    source:
      'GOOGLE_ROUTES',

    estimated:
      true
  }
}

/**
 * ============================================================
 * TRAFFIC
 * ============================================================
 */

export function extractRouteTrafficIntervals(
  route
) {
  const intervals =
    route
      ?.travelAdvisory
      ?.speedReadingIntervals

  return Array.isArray(
    intervals
  )
    ? intervals
    : []
}

export function extractLegTrafficIntervals(
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
    ) => ({
      legIndex:
        index,

      polyline:
        leg
          ?.polyline
          ?.encodedPolyline ||
        null,

      intervals:
        Array.isArray(
          leg
            ?.travelAdvisory
            ?.speedReadingIntervals
        )
          ? leg
              .travelAdvisory
              .speedReadingIntervals
          : []
    })
  )
}

export function hasTrafficData(
  route
) {
  if (
    extractRouteTrafficIntervals(
      route
    ).length
  ) {
    return true
  }

  return extractLegTrafficIntervals(
    route
  ).some(
    leg =>
      leg.intervals.length >
      0
  )
}