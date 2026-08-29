// backend/routes.controller.js

import {
  computeRoutes as computeRoutesLegacy,
  getStaticRouteMap as getStaticRouteMapLegacy
} from './routes.legacy.controller.js'

import operationalEngine from './routing/engine/operationalEngine.js'

import {
  computeIntegralPlanning,
  INTEGRAL_MOTOR_MODE,
  IntegralPlanningGatewayError
} from './routing/services/integralPlanningGateway.service.js'

/**
 * ============================================================
 * ROUTES CONTROLLER
 * ============================================================
 *
 * Dos caminos controlados:
 *
 * 1. LEGACY / COMPATIBILIDAD
 *
 *    comportamiento actual de la WebApp.
 *
 * 2. INTEGRAL_V1_3
 *
 *    nuevo Motor Operativo Integral:
 *
 *    - auto resource planning
 *    - Route Optimization
 *    - Google Routes
 *    - Route Quality
 *    - planningResult 1.3
 *
 * ============================================================
 *
 * IMPORTANTE:
 *
 * No existe fallback silencioso:
 *
 * si el cliente solicita expresamente
 * motorMode=INTEGRAL_V1_3 y el motor falla,
 * la petición reporta el error.
 *
 * De esta forma DEV no oculta regresiones
 * ejecutando accidentalmente el legacy.
 */

/**
 * ============================================================
 * LEGACY ENRICHMENT HELPERS
 * ============================================================
 */

function toOptionalNonNegativeNumber(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number =
    Number(value)

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return null
  }

  return number
}

function parseDurationSeconds(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  const numeric =
    toOptionalNonNegativeNumber(
      value
    )

  if (
    numeric != null
  ) {
    return numeric
  }

  const parsed =
    parseFloat(
      String(value)
        .trim()
        .replace(
          's',
          ''
        )
    )

  return Number.isFinite(
    parsed
  )
    ? Math.max(
        0,
        Math.round(
          parsed
        )
      )
    : null
}

function getValidVisitPoints(
  payload
) {
  const source =
    Array.isArray(
      payload?.visitOrder
    )
      ? payload.visitOrder
      : []

  return source
    .filter(
      point =>
        point?.id !=
          null &&
        Number.isFinite(
          Number(
            point.lat
          )
        ) &&
        Number.isFinite(
          Number(
            point.lng
          )
        )
    )
    .map(
      point => ({
        id:
          point.id,

        name:
          point.name ||
          null,

        lat:
          Number(
            point.lat
          ),

        lng:
          Number(
            point.lng
          ),

        operator:
          point.operator ??
          null,

        day:
          point.day ??
          null
      })
    )
}

function buildSingleComputedRoute(
  payload
) {
  const distanceMeters =
    toOptionalNonNegativeNumber(
      payload
        ?.total
        ?.distanceMeters
    )

  const duration =
    payload
      ?.total
      ?.duration ??
    null

  const durationSeconds =
    parseDurationSeconds(
      duration
    )

  const points =
    getValidVisitPoints(
      payload
    )

  const hasSubroutes =
    Array.isArray(
      payload?.subroutes
    ) &&
    payload.subroutes.length >
      0

  if (
    !hasSubroutes &&
    distanceMeters ==
      null
  ) {
    return null
  }

  return {
    operator:
      1,

    label:
      'Ruta 1',

    pointCount:
      points.length,

    distanceMeters:
      distanceMeters ??
      0,

    duration,

    durationSeconds,

    fuelLiters:
      toOptionalNonNegativeNumber(
        payload
          ?.total
          ?.fuelLiters
      ) ??
      toOptionalNonNegativeNumber(
        payload
          ?.fuel
          ?.totalLiters
      ),

    tolls:
      payload?.tolls ||
      null,

    points
  }
}

function extractComputedRoutes(
  payload
) {
  const operatorRoutes =
    Array.isArray(
      payload?.operatorRoutes
    )
      ? payload.operatorRoutes
      : []

  if (
    operatorRoutes.length
  ) {
    return operatorRoutes
  }

  const singleRoute =
    buildSingleComputedRoute(
      payload
    )

  return singleRoute
    ? [
        singleRoute
      ]
    : []
}

function buildContext(
  req,
  payload
) {
  const body =
    req?.body ||
    {}

  const input =
    payload?.input ||
    {}

  const requestedScope =
    String(
      input.scope ??
      body.scope ??
      ''
    )
      .trim()
      .toUpperCase()

  let scope =
    requestedScope ||
    null

  if (
    !scope &&
    body.projectWide ===
      true
  ) {
    scope =
      'PROJECT'
  }

  if (
    !scope &&
    (
      input.region_sanitaria ||
      body.region_sanitaria
    )
  ) {
    scope =
      'REGION'
  }

  return {
    area:
      'OPERACIONES',

    estado:
      input.estado ??
      body.estado ??
      null,

    proyecto:
      input.proyecto ??
      body.proyecto ??
      null,

    regionSanitaria:
      input.region_sanitaria ??
      body.region_sanitaria ??
      null,

    scope,

    cedisId:
      payload
        ?.start
        ?.cedis
        ?.id ??
      null,

    cedisName:
      payload
        ?.start
        ?.cedis
        ?.nombre ??
      null
  }
}

function buildCriteria(
  req,
  payload,
  computedRoutes
) {
  const body =
    req?.body ||
    {}

  const input =
    payload?.input ||
    {}

  const costs =
    payload?.costs ||
    {}

  const options = {
    ...(
      input.options ||
      {}
    ),

    ...(
      body.options ||
      {}
    )
  }

  return {
    strategy:
      input.strategy ??
      body.strategy ??
      'FASTEST',

    routeEngine:
      body.routeEngine ??
      null,

    routeMode:
      input.routeMode ??
      body.routeMode ??
      'ROUND_TRIP',

    /**
     * LEGACY ONLY.
     *
     * Este valor se mantiene para no modificar
     * el contrato del enriquecimiento antiguo.
     *
     * INTEGRAL_V1_3 nunca entra aquí.
     */
    operatorCount:
      body.operatorCount ??
      input.requestedOperators ??
      input.operatorCount ??
      1,

    usedOperators:
      toOptionalNonNegativeNumber(
        input.usedOperators
      ) ??
      computedRoutes.length,

    maxForeignDays:
      input.maxForeignDays ??
      body.maxForeignDays ??
      3,

    kmPerLiter:
      input.kmPerLiter ??
      body.kmPerLiter ??
      payload
        ?.fuel
        ?.kmPerLiter ??
      10,

    fuelPricePerLiter:
      body.fuelPricePerLiter ??
      costs.fuelPricePerLiter ??
      0,

    dailyAllowance:
      body.dailyAllowance ??
      costs.dailyAllowance ??
      0,

    options
  }
}

function buildSchedulingConfig(
  req,
  payload
) {
  const body =
    req?.body ||
    {}

  const cedis =
    payload
      ?.start
      ?.cedis ||
    {}

  return {
    startClock:
      '08:00',

    shiftHours:
      Number(
        cedis.horasTurno ||
        8
      ),

    lastArrivalClock:
      String(
        cedis.horaLimiteLlegadaUltimaUnidad ||
        '16:00'
      ),

    serviceMinutesPerUnit:
      Number(
        cedis.minutosServicioPorUnidad ||
        45
      ),

    maxForeignDays:
      Number(
        body.maxForeignDays ||
        payload
          ?.input
          ?.maxForeignDays ||
        3
      )
  }
}

function buildCoverage(
  payload
) {
  const points =
    Array.isArray(
      payload?.points
    )
      ? payload.points
      : []

  return {
    totalUnits:
      points.length,

    excludedUnits:
      0,

    difficultAccessUnits:
      0,

    unitsWithoutCoordinates:
      0
  }
}

function buildEconomics(
  req,
  payload
) {
  const body =
    req?.body ||
    {}

  const costs =
    payload?.costs ||
    {}

  const raw =
    body.dailyAllowance ??
    costs.dailyAllowance

  const dailyAllowance =
    Number(raw)

  return {
    dailyAllowance:
      Number.isFinite(
        dailyAllowance
      ) &&
      dailyAllowance >
        0
        ? dailyAllowance
        : null
  }
}

function buildUnavailableAnalysis(
  error
) {
  return {
    status:
      'UNAVAILABLE',

    usable:
      true,

    analysisStatus:
      'NOT_EVALUATED',

    generatedAt:
      new Date()
        .toISOString(),

    error: {
      code:
        'OPERATIONAL_ANALYSIS_UNAVAILABLE',

      message:
        error?.message ||
        String(error)
    },

    metadata: {
      motor:
        'MOTOR_OPERATIVO_INTEGRAL',

      integrationMode:
        'ENRICH_EXISTING_CORE',

      progressiveEnrichment:
        true,

      optionalModulesBlocking:
        false,

      operatorDatabaseRequired:
        false,

      vehicleDatabaseRequired:
        false,

      routeCalculationPreserved:
        true
    }
  }
}

async function enrichPayload(
  req,
  payload
) {
  const computedRoutes =
    extractComputedRoutes(
      payload
    )

  /**
   * Si el núcleo devolvió una respuesta sin ruta
   * no tratamos de inventar un análisis.
   */
  if (
    !computedRoutes.length
  ) {
    return payload
  }

  try {
    const operationalAnalysis =
      await operationalEngine
        .analyzeComputed({
          context:
            buildContext(
              req,
              payload
            ),

          criteria:
            buildCriteria(
              req,
              payload,
              computedRoutes
            ),

          origin:
            payload.start,

          computedRoutes,

          assignments: [],

          unresolved: [],

          excluded: [],

          schedulingConfig:
            buildSchedulingConfig(
              req,
              payload
            ),

          /**
           * El enriquecimiento no depende
           * de personas/vehículos registrados.
           */
          vehicleProfile:
            null,

          vehicleProfiles: [],

          economics:
            buildEconomics(
              req,
              payload
            ),

          coverage:
            buildCoverage(
              payload
            ),

          enableTraffic:
            false,

          enableFuel:
            true,

          enableTolls:
            true,

          enableLodging:
            true,

          enableCosts:
            true,

          enableKpis:
            true
        })

    return {
      ...payload,

      operationalAnalysis
    }
  } catch (
    error
  ) {
    /**
     * Regla no negociable del flujo legacy:
     *
     * el enriquecimiento no puede tumbar
     * una ruta ya calculada.
     */
    console.error(
      'Operational analysis enrichment failed:',
      error
    )

    console.error(
      error?.stack
    )

    return {
      ...payload,

      operationalAnalysis:
        buildUnavailableAnalysis(
          error
        )
    }
  }
}

/**
 * ============================================================
 * INTEGRAL MODE
 * ============================================================
 */

function wantsIntegralMotor(
  req
) {
  return (
    String(
      req
        ?.body
        ?.motorMode ||
      ''
    )
      .trim()
      .toUpperCase() ===
    INTEGRAL_MOTOR_MODE
  )
}

async function computeRoutesIntegral(
  req,
  res
) {
  try {
    const result =
      await computeIntegralPlanning(
        req?.body ||
        {}
      )

    return res
      .status(200)
      .json(
        result
      )
  } catch (
    error
  ) {
    console.error(
      '[INTEGRAL_V1_3] route calculation failed:',
      error
    )

    console.error(
      error?.stack
    )

    const statusCode =
      error instanceof
      IntegralPlanningGatewayError
        ? error.statusCode
        : 500

    return res
      .status(
        statusCode
      )
      .json({
        status:
          'FAILED',

        usable:
          false,

        motorMode:
          INTEGRAL_MOTOR_MODE,

        error: {
          code:
            error?.code ||
            'INTEGRAL_PLANNING_ERROR',

          message:
            error?.message ||
            'No fue posible ejecutar el Motor Operativo Integral.',

          details:
            error?.details ||
            null
        },

        metadata: {
          motor:
            'MOTOR_OPERATIVO_INTEGRAL',

          integrationMode:
            'DIRECT_INTEGRAL_PLANNING',

          legacyFallbackUsed:
            false,

          operatorDatabaseRequired:
            false,

          vehicleDatabaseRequired:
            false
        }
      })
  }
}

/**
 * ============================================================
 * LEGACY MODE
 * ============================================================
 */

async function computeRoutesLegacyCompatible(
  req,
  res
) {
  const originalJson =
    res.json.bind(
      res
    )

  const originalJsonProperty =
    res.json

  const hadOwnJson =
    Object.prototype
      .hasOwnProperty
      .call(
        res,
        'json'
      )

  let captured =
    false

  let capturedPayload =
    null

  res.json =
    function captureJson(
      payload
    ) {
      captured =
        true

      capturedPayload =
        payload

      return res
    }

  try {
    await computeRoutesLegacy(
      req,
      res
    )
  } catch (
    error
  ) {
    /**
     * El controlador legado normalmente
     * maneja sus errores internamente.
     */
    console.error(
      'Legacy route core unexpected error:',
      error
    )

    console.error(
      error?.stack
    )

    if (
      !captured
    ) {
      captured =
        true

      capturedPayload = {
        error:
          'Error calculando rutas',

        details:
          error?.message ||
          String(error)
      }

      if (
        res.statusCode <
        400
      ) {
        res.statusCode =
          500
      }
    }
  } finally {
    /**
     * Restaurar res.json antes de
     * emitir respuesta definitiva.
     */
    if (
      hadOwnJson
    ) {
      res.json =
        originalJsonProperty
    } else {
      delete res.json
    }
  }

  /**
   * Si legacy envió por otro mecanismo,
   * no duplicamos respuesta.
   */
  if (
    res.headersSent
  ) {
    return res
  }

  if (
    !captured
  ) {
    return res
      .status(500)
      .json({
        error:
          'El núcleo de rutas no generó una respuesta JSON'
      })
  }

  /**
   * Errores legacy se conservan.
   */
  if (
    Number(
      res.statusCode
    ) >=
    400
  ) {
    return originalJson(
      capturedPayload
    )
  }

  const enrichedPayload =
    await enrichPayload(
      req,
      capturedPayload
    )

  return originalJson(
    enrichedPayload
  )
}

/**
 * ============================================================
 * PUBLIC ENDPOINT
 * ============================================================
 */

export async function computeRoutes(
  req,
  res
) {
  /**
   * Sólo una petición explícita entra
   * al nuevo motor.
   */
  if (
    wantsIntegralMotor(
      req
    )
  ) {
    return computeRoutesIntegral(
      req,
      res
    )
  }

  /**
   * Comportamiento vigente de WebApp.
   */
  return computeRoutesLegacyCompatible(
    req,
    res
  )
}

/**
 * El mapa estático continúa exactamente
 * sobre el controlador legacy.
 */
export const getStaticRouteMap =
  getStaticRouteMapLegacy