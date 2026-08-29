// backend/routing/providers/googleOptimization.provider.js

import {
  isValidLatLng
} from '../utils/geo.js'

import {
  getTomorrowRfc3339Time
} from '../utils/time.js'

import {
  toOptionalNonNegativeNumber
} from '../utils/money.js'

/**
 * Provider de Google Route Optimization API.
 *
 * RESPONSABILIDADES:
 *
 * - construir modelos OptimizeTours
 * - representar operadores como vehículos
 * - representar unidades como shipments
 * - definir costos de optimización
 * - ejecutar Route Optimization API
 * - normalizar errores del proveedor
 *
 * NO:
 *
 * - consulta PostgreSQL
 * - decide qué proyecto utilizar
 * - calcula costos ejecutivos finales
 * - divide jornadas
 * - decide hospedajes
 * - conoce Express
 */

const GOOGLE_ROUTE_OPTIMIZATION_BASE_URL =
  'https://routeoptimization.googleapis.com/v1'

export const GOOGLE_OPTIMIZATION_SEARCH_MODES = {
  RETURN_FAST:
    'RETURN_FAST',

  CONSUME_ALL_AVAILABLE_TIME:
    'CONSUME_ALL_AVAILABLE_TIME'
}

/**
 * Error especializado del provider.
 */
export class GoogleOptimizationProviderError extends Error {
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
      'GoogleOptimizationProviderError'

    this.status =
      status

    this.code =
      code

    this.details =
      details
  }
}

/**
 * API Key.
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
    throw new GoogleOptimizationProviderError(
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
 * Google Cloud Project ID.
 *
 * @returns {string}
 */
function getGoogleCloudProjectId() {
  const projectId =
    String(
      process.env
        .GOOGLE_CLOUD_PROJECT_ID ||
      ''
    ).trim()

  if (
    !projectId
  ) {
    throw new GoogleOptimizationProviderError(
      'Falta GOOGLE_CLOUD_PROJECT_ID en backend',
      {
        code:
          'GOOGLE_CLOUD_PROJECT_ID_MISSING'
      }
    )
  }

  return projectId
}

/**
 * Normaliza número de operadores.
 *
 * @param {unknown} value
 * @param {number} pointCount
 * @returns {number}
 */
export function normalizeOptimizationOperatorCount(
  value,
  pointCount
) {
  const requested =
    Math.floor(
      Number(
        value ||
        1
      )
    )

  const safeRequested =
    Number.isFinite(
      requested
    ) &&
    requested >
      0
      ? requested
      : 1

  const safePointCount =
    Math.max(
      1,
      Math.floor(
        Number(
          pointCount
        ) ||
        1
      )
    )

  return Math.min(
    safeRequested,
    safePointCount
  )
}

/**
 * Convierte un punto interno a Location.
 *
 * @param {object} point
 * @returns {object}
 */
function toOptimizationLocation(
  point
) {
  if (
    !isValidLatLng(
      point
    )
  ) {
    throw new GoogleOptimizationProviderError(
      `Coordenadas inválidas: ${JSON.stringify(point)}`,
      {
        code:
          'INVALID_COORDINATES'
      }
    )
  }

  return {
    latitude:
      Number(
        point.lat
      ),

    longitude:
      Number(
        point.lng
      )
  }
}

/**
 * Normaliza searchMode.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeOptimizationSearchMode(
  value
) {
  const normalized =
    String(
      value ||
      GOOGLE_OPTIMIZATION_SEARCH_MODES
        .RETURN_FAST
    )
      .trim()
      .toUpperCase()

  return Object.values(
    GOOGLE_OPTIMIZATION_SEARCH_MODES
  ).includes(
    normalized
  )
    ? normalized
    : GOOGLE_OPTIMIZATION_SEARCH_MODES
        .RETURN_FAST
}

/**
 * Construye el costo/km que verá el optimizador.
 *
 * PRIORIDAD:
 *
 * 1. costo/km empresarial explícito
 * 2. fallback histórico 1 / kmPorLitro
 * 3. valor neutro 1
 *
 * El fallback existe únicamente para mantener
 * compatibilidad con el comportamiento actual.
 *
 * @param {{
 *   costPerKilometer?: number|null,
 *   kmPerLiter?: number|null
 * }} params
 *
 * @returns {number}
 */
export function resolveOptimizationCostPerKilometer({
  costPerKilometer = null,
  kmPerLiter = null
} = {}) {
  const explicitCost =
    toOptionalNonNegativeNumber(
      costPerKilometer
    )

  if (
    explicitCost !=
    null
  ) {
    return explicitCost
  }

  const performance =
    Number(
      kmPerLiter
    )

  if (
    Number.isFinite(
      performance
    ) &&
    performance >
      0
  ) {
    return (
      1 /
      performance
    )
  }

  return 1
}

/**
 * Construye el costo/hora utilizado en optimización.
 *
 * Mientras no tengamos configurado el costo empresarial,
 * conserva el valor histórico 1.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function resolveOptimizationCostPerHour(
  value
) {
  const explicit =
    toOptionalNonNegativeNumber(
      value
    )

  return explicit !=
    null
    ? explicit
    : 1
}

/**
 * Genera shipments a partir de las unidades.
 *
 * @param {Array<object>} points
 * @param {number} serviceSeconds
 * @param {number} penaltyCost
 * @returns {Array<object>}
 */
export function buildOptimizationShipments(
  points,
  serviceSeconds,
  penaltyCost
) {
  if (
    !Array.isArray(
      points
    ) ||
    !points.length
  ) {
    return []
  }

  return points.map(
    point => {
      if (
        point?.id ==
        null
      ) {
        throw new GoogleOptimizationProviderError(
          'Todos los puntos de Route Optimization requieren id',
          {
            code:
              'OPTIMIZATION_POINT_ID_MISSING',

            details:
              point
          }
        )
      }

      return {
        label:
          String(
            point.id
          ),

        deliveries: [
          {
            arrivalLocation:
              toOptimizationLocation(
                point
              ),

            duration:
              `${serviceSeconds}s`
          }
        ],

        penaltyCost
      }
    }
  )
}

/**
 * Construye vehículos/operadores del modelo.
 *
 * @param {{
 *   start: object,
 *   operatorCount: number,
 *   costPerKilometer: number,
 *   costPerHour: number,
 *   costPerTraveledHour?: number|null,
 *   fixedCost?: number|null
 * }} params
 *
 * @returns {Array<object>}
 */
export function buildOptimizationVehicles({
  start,
  operatorCount,
  costPerKilometer,
  costPerHour,
  costPerTraveledHour = null,
  fixedCost = null
}) {
  const location =
    toOptimizationLocation(
      start
    )

  const traveledHourCost =
    toOptionalNonNegativeNumber(
      costPerTraveledHour
    )

  const normalizedFixedCost =
    toOptionalNonNegativeNumber(
      fixedCost
    )

  return Array.from(
    {
      length:
        operatorCount
    },

    (
      _,
      index
    ) => {
      const vehicle = {
        label:
          `Operador ${index + 1}`,

        startLocation: {
          ...location
        },

        endLocation: {
          ...location
        },

        costPerKilometer,

        costPerHour
      }

      if (
        traveledHourCost !=
        null
      ) {
        vehicle
          .costPerTraveledHour =
          traveledHourCost
      }

      if (
        normalizedFixedCost !=
        null
      ) {
        vehicle.fixedCost =
          normalizedFixedCost
      }

      return vehicle
    }
  )
}

/**
 * Construye request completo OptimizeTours.
 *
 * Mantiene compatibilidad con los defaults
 * que actualmente usa routes.controller.js.
 *
 * @param {{
 *   start: object,
 *   points: Array<object>,
 *   operatorCount?: number,
 *   kmPerLiter?: number,
 *   serviceMinutesPerUnit?: number,
 *   globalStartClock?: string,
 *   globalEndClock?: string,
 *   costPerKilometer?: number|null,
 *   costPerHour?: number|null,
 *   costPerTraveledHour?: number|null,
 *   fixedCost?: number|null,
 *   penaltyCost?: number,
 *   searchMode?: string
 * }} params
 *
 * @returns {object}
 */
export function buildOptimizeToursRequest({
  start,
  points,
  operatorCount = 1,
  kmPerLiter = null,

  serviceMinutesPerUnit = null,

  globalStartClock =
    '08:00',

  globalEndClock =
    '16:00',

  costPerKilometer = null,
  costPerHour = null,
  costPerTraveledHour = null,
  fixedCost = null,

  penaltyCost =
    1_000_000,

  searchMode =
    GOOGLE_OPTIMIZATION_SEARCH_MODES
      .RETURN_FAST
} = {}) {
  if (
    !isValidLatLng(
      start
    )
  ) {
    throw new GoogleOptimizationProviderError(
      'El origen de Route Optimization no es válido',
      {
        code:
          'OPTIMIZATION_INVALID_START',

        details:
          start
      }
    )
  }

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
    throw new GoogleOptimizationProviderError(
      'Route Optimization requiere al menos un punto válido',
      {
        code:
          'OPTIMIZATION_POINTS_EMPTY'
      }
    )
  }

  const effectiveOperatorCount =
    normalizeOptimizationOperatorCount(
      operatorCount,
      safePoints.length
    )

  /*
   * Prioridad:
   *
   * parámetro explícito
   * ↓
   * configuración CEDIS
   * ↓
   * default actual de 45 min
   */
  const configuredServiceMinutes =
    Number(
      serviceMinutesPerUnit ??
      start
        ?.cedis
        ?.minutosServicioPorUnidad ??
      45
    )

  const safeServiceMinutes =
    Number.isFinite(
      configuredServiceMinutes
    ) &&
    configuredServiceMinutes >
      0
      ? configuredServiceMinutes
      : 45

  const serviceSeconds =
    Math.round(
      safeServiceMinutes *
      60
    )

  const resolvedEndClock =
    String(
      globalEndClock ||
      start
        ?.cedis
        ?.horaLimiteLlegadaUltimaUnidad ||
      '16:00'
    )

  const globalStartTime =
    getTomorrowRfc3339Time(
      globalStartClock ||
      '08:00'
    )

  const globalEndTime =
    getTomorrowRfc3339Time(
      resolvedEndClock
    )

  const optimizationCostPerKm =
    resolveOptimizationCostPerKilometer({
      costPerKilometer,
      kmPerLiter
    })

  const optimizationCostPerHour =
    resolveOptimizationCostPerHour(
      costPerHour
    )

  const shipments =
    buildOptimizationShipments(
      safePoints,
      serviceSeconds,
      Number(
        penaltyCost
      ) ||
      1_000_000
    )

  const vehicles =
    buildOptimizationVehicles({
      start,

      operatorCount:
        effectiveOperatorCount,

      costPerKilometer:
        optimizationCostPerKm,

      costPerHour:
        optimizationCostPerHour,

      costPerTraveledHour,

      fixedCost
    })

  return {
    model: {
      shipments,

      vehicles,

      globalStartTime,

      globalEndTime
    },

    searchMode:
      normalizeOptimizationSearchMode(
        searchMode
      )
  }
}

/**
 * Ejecuta Google Route Optimization API.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function optimizeTours(
  params = {}
) {
  const apiKey =
    getApiKey()

  const projectId =
    getGoogleCloudProjectId()

  const request =
    buildOptimizeToursRequest(
      params
    )

  const url =
    `${GOOGLE_ROUTE_OPTIMIZATION_BASE_URL}/projects/${encodeURIComponent(projectId)}:optimizeTours`

  let response

  try {
    response =
      await fetch(
        url,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'X-Goog-Api-Key':
              apiKey
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

    throw new GoogleOptimizationProviderError(
      'No fue posible conectar con Google Route Optimization API',
      {
        code:
          'GOOGLE_OPTIMIZATION_NETWORK_ERROR',

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
      throw new GoogleOptimizationProviderError(
        `Route Optimization devolvió una respuesta no JSON: ${text.slice(0, 500)}`,
        {
          status:
            response.status,

          code:
            'GOOGLE_OPTIMIZATION_NON_JSON'
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

    throw new GoogleOptimizationProviderError(
      googleMessage ||
      `Route Optimization API respondió HTTP ${response.status}`,
      {
        status:
          response.status,

        code:
          googleStatus ||
          'GOOGLE_OPTIMIZATION_HTTP_ERROR',

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
 * Extrae los IDs de las visitas que Google
 * asignó a una ruta/vehículo.
 *
 * Mantiene exactamente la lógica que posteriormente
 * necesita assignment.service.js.
 *
 * @param {object} route
 * @returns {number[]}
 */
export function extractOptimizationVisitIds(
  route
) {
  return (
    route
      ?.visits ||
    []
  )
    .map(
      visit =>
        Number(
          visit
            ?.shipmentLabel
        )
    )
    .filter(
      Number.isFinite
    )
}

/**
 * Convierte la respuesta de Google en asignaciones
 * básicas por operador.
 *
 * Todavía NO hace enriquecimiento con regiones,
 * costos o jornadas.
 *
 * @param {object} optimizationResponse
 * @param {Array<object>} availablePoints
 *
 * @returns {Array<{
 *   operator:number,
 *   label:string,
 *   points:Array<object>
 * }>}
 */
export function mapOptimizationRoutesToOperators(
  optimizationResponse,
  availablePoints = []
) {
  const routes =
    Array.isArray(
      optimizationResponse
        ?.routes
    )
      ? optimizationResponse
          .routes
      : []

  const points =
    Array.isArray(
      availablePoints
    )
      ? availablePoints
      : []

  const byId =
    new Map(
      points.map(
        point => [
          Number(
            point.id
          ),

          point
        ]
      )
    )

  return routes
    .map(
      (
        route,
        index
      ) => {
        const ids =
          extractOptimizationVisitIds(
            route
          )

        const routePoints =
          ids
            .map(
              id =>
                byId.get(
                  Number(
                    id
                  )
                )
            )
            .filter(
              Boolean
            )

        return {
          operator:
            index +
            1,

          label:
            `Operador ${index + 1}`,

          points:
            routePoints,

          rawRoute:
            route
        }
      }
    )
    .filter(
      operator =>
        operator
          .points
          .length >
        0
    )
}