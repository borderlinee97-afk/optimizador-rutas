// backend/routing/providers/googleOptimizationOAuth.provider.js

import {
  GOOGLE_OPTIMIZATION_BASE_URL,
  GOOGLE_OPTIMIZATION_PLANNER_SOURCE,
  GoogleOptimizationPlannerError,
  buildGoogleOptimizationPlannerRequest,
  normalizeGoogleOptimizationPlannerResponse
} from './googleOptimizationPlanner.provider.js'

import {
  getGoogleCloudProjectId,
  requestGoogleCloudJson
} from './googleCloudAuth.provider.js'

/**
 * ============================================================
 * GOOGLE ROUTE OPTIMIZATION — OAUTH TRANSPORT
 * ============================================================
 *
 * Esta capa reutiliza:
 *
 * googleOptimizationPlanner.provider.js
 *
 * para:
 *
 * - construir el ShipmentModel
 * - crear vehículos virtuales
 * - aplicar horarios
 * - aplicar soft/hard duration limits
 * - normalizar respuesta
 *
 * Pero sustituye:
 *
 * API KEY
 *
 * por:
 *
 * Application Default Credentials / OAuth / IAM
 *
 * ============================================================
 */

export const GOOGLE_OPTIMIZATION_AUTH_MODE =
  'OAUTH_ADC'

function isRetryableStatus(status) {
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  )
}

/**
 * Llamada HTTP OAuth real.
 */
export async function callGoogleOptimizationPlannerOAuth({
  request,
  signal
} = {}) {
  if (!request) {
    throw new GoogleOptimizationPlannerError(
      'Route Optimization requiere un request.',
      {
        code: 'GOOGLE_OPTIMIZATION_REQUEST_REQUIRED'
      }
    )
  }

  const projectId = getGoogleCloudProjectId()

  const encodedProject = encodeURIComponent(projectId)

  const url =
    `${GOOGLE_OPTIMIZATION_BASE_URL}/projects/` +
    `${encodedProject}:optimizeTours`

  try {
    const response = await requestGoogleCloudJson({
      url,
      method: 'POST',
      data: request,
      signal
    })

    return response.data || {}
  } catch (error) {
    const status =
      error?.details?.status ??
      error?.cause?.response?.status ??
      null

    const details =
      error?.details?.data ??
      error?.cause?.response?.data ??
      error?.details ??
      null

    throw new GoogleOptimizationPlannerError(
      status
        ? `Google Route Optimization OAuth respondió HTTP ${status}.`
        : 'No fue posible ejecutar Google Route Optimization mediante OAuth.',
      {
        code: 'GOOGLE_OPTIMIZATION_OAUTH_ERROR',

        status,

        details,

        retryable: isRetryableStatus(status)
      }
    )
  }
}

/**
 * ============================================================
 * SOLVE ROUND_TRIP
 * ============================================================
 */

export async function solveGoogleRoundTripScenarioOAuth({
  origin,

  points,

  candidateResourceCount,

  maxActiveResources,

  workday,

  solveMode = 'SEARCH',

  mandatoryCoverage = true,

  planningDate = null,

  timeZone = null,

  scoreModel = {},

  avoidTolls = false,

  considerRoadTraffic = true,

  signal
} = {}) {
  if (mandatoryCoverage !== true) {
    throw new GoogleOptimizationPlannerError(
      'El planificador operativo requiere mandatoryCoverage=true.',
      {
        code: 'MANDATORY_COVERAGE_REQUIRED'
      }
    )
  }

  const {
    request,
    metadata
  } = buildGoogleOptimizationPlannerRequest({
    origin,

    points,

    candidateResourceCount,

    maxActiveResources,

    workday,

    solveMode,

    planningDate,

    timeZone:
      timeZone ||
      workday?.timeZone ||
      process.env.ROUTING_TIME_ZONE ||
      'America/Mexico_City',

    scoreModel,

    avoidTolls,

    considerRoadTraffic,

    label:
      `ROUND_TRIP_${candidateResourceCount}_${solveMode}`
  })

  const response =
    await callGoogleOptimizationPlannerOAuth({
      request,
      signal
    })

  return normalizeGoogleOptimizationPlannerResponse({
    response,
    request,
    metadata
  })
}

/**
 * ============================================================
 * CALLBACK PARA AUTOMATIC RESOURCE PLANNER
 * ============================================================
 *
 * Contrato compatible directamente con:
 *
 * planAutomaticRoundTripResources({
 *   solveScenario
 * })
 */

export function createGoogleRoundTripOAuthSolveScenario({
  planningDate = null,

  timeZone = null,

  scoreModel = {},

  avoidTolls = false,

  considerRoadTraffic = true,

  signal = null
} = {}) {
  return async ({
    routeMode,

    origin,

    points,

    candidateResourceCount,

    maxActiveResources,

    workday,

    solveMode,

    mandatoryCoverage
  }) => {
    if (routeMode !== 'ROUND_TRIP') {
      throw new GoogleOptimizationPlannerError(
        `Modo no soportado por este solver: ${routeMode}`,
        {
          code: 'UNSUPPORTED_ROUTE_MODE'
        }
      )
    }

    return solveGoogleRoundTripScenarioOAuth({
      origin,

      points,

      candidateResourceCount,

      maxActiveResources,

      workday,

      solveMode,

      mandatoryCoverage,

      planningDate,

      timeZone,

      scoreModel,

      avoidTolls,

      considerRoadTraffic,

      signal
    })
  }
}

export default Object.freeze({
  callGoogleOptimizationPlannerOAuth,
  solveGoogleRoundTripScenarioOAuth,
  createGoogleRoundTripOAuthSolveScenario,

  authMode:
    GOOGLE_OPTIMIZATION_AUTH_MODE,

  source:
    GOOGLE_OPTIMIZATION_PLANNER_SOURCE
})