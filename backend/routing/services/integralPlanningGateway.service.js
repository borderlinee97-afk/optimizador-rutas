// backend/routing/services/integralPlanningGateway.service.js

import {
  pool
} from '../../db/pool.js'

import {
  planAutomaticRoundTripResources
} from './automaticResourcePlanner.service.js'

import {
  solveGoogleRoundTripScenarioOAuth
} from '../providers/googleOptimizationOAuth.provider.js'

import {
  validateRoundTripPlanWithGoogleRoutes
} from './routeFinalValidation.service.js'

import {
  evaluatePlanRouteQuality
} from './routeQuality.service.js'

import {
  planAutomaticForeignResources
} from './automaticForeignResourcePlanner.service.js'

import {
  solveGoogleForeignScenarioOAuth
} from '../providers/googleForeignOptimizationOAuth.provider.js'

import {
  validateForeignPlanWithGoogleRoutes
} from './foreignFinalValidation.service.js'

import {
  evaluateForeignPlanRouteQuality
} from './foreignRouteQuality.service.js'

import {
  buildRecommendedPlanningResult
} from '../engine/resultBuilder.js'

/**
 * ============================================================
 * MOTOR OPERATIVO INTEGRAL — PLANNING GATEWAY
 * ============================================================
 *
 * Primera integración real de:
 *
 * POST /api/routes/compute
 *
 * con:
 *
 * ROUND_TRIP
 * FOREIGN_ROUTE
 *
 * ============================================================
 *
 * PRINCIPIOS:
 *
 * - NO usa operatorCount como restricción.
 * - NO usa vehículos registrados para habilitar cálculo.
 * - NO usa personas registradas para habilitar cálculo.
 * - calcula necesidad de recursos automáticamente.
 * - Route Optimization decide asignación/secuencia.
 * - Google Routes verifica carretera.
 * - Route Quality protege calidad territorial.
 * - planningResult 1.3 unifica el resultado.
 *
 * ============================================================
 *
 * IMPORTANTE:
 *
 * Este gateway se activa EXPLÍCITAMENTE mediante:
 *
 * motorMode = INTEGRAL_V1_3
 *
 * Mientras no se envíe ese valor, routes.controller.js
 * continúa utilizando el núcleo legacy.
 */

export const INTEGRAL_MOTOR_MODE =
  'INTEGRAL_V1_3'

export const INTEGRAL_ROUTE_MODES =
  Object.freeze({
    ROUND_TRIP:
      'ROUND_TRIP',

    FOREIGN_ROUTE:
      'FOREIGN_ROUTE',

    HYBRID_PROJECT:
      'HYBRID_PROJECT'
  })

export class IntegralPlanningGatewayError
  extends Error {
  constructor(
    message,
    {
      code =
        'INTEGRAL_PLANNING_ERROR',

      statusCode =
        400,

      details =
        null
    } = {}
  ) {
    super(message)

    this.name =
      'IntegralPlanningGatewayError'

    this.code =
      code

    this.statusCode =
      statusCode

    this.details =
      details
  }
}

/**
 * ============================================================
 * GENERIC HELPERS
 * ============================================================
 */

function asArray(
  value
) {
  return Array.isArray(value)
    ? value
    : []
}

function asFiniteNumber(
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

  return Number.isFinite(number)
    ? number
    : null
}

function normalizeOptionalText(
  value
) {
  const normalized =
    String(
      value ??
      ''
    ).trim()

  return normalized ||
    null
}

function normalizeUpperText(
  value
) {
  const normalized =
    normalizeOptionalText(
      value
    )

  return normalized
    ? normalized.toUpperCase()
    : null
}

function isValidLatLng(
  point
) {
  const lat =
    Number(
      point?.lat
    )

  const lng =
    Number(
      point?.lng
    )

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

function normalizeLatLng(
  point
) {
  if (
    !isValidLatLng(
      point
    )
  ) {
    return null
  }

  return {
    lat:
      Number(
        point.lat
      ),

    lng:
      Number(
        point.lng
      )
  }
}

function serializeError(
  error
) {
  return {
    name:
      error?.name ||
      'Error',

    code:
      error?.code ||
      null,

    status:
      error?.status ||
      null,

    message:
      error?.message ||
      String(error),

    details:
      error?.details ||
      null
  }
}

function normalizeRouteMode(
  value
) {
  const mode =
    String(
      value ||
      INTEGRAL_ROUTE_MODES
        .ROUND_TRIP
    )
      .trim()
      .toUpperCase()

  if (
    mode ===
    INTEGRAL_ROUTE_MODES
      .ROUND_TRIP
  ) {
    return mode
  }

  if (
    mode ===
    INTEGRAL_ROUTE_MODES
      .FOREIGN_ROUTE
  ) {
    return mode
  }

  if (
    mode ===
    INTEGRAL_ROUTE_MODES
      .HYBRID_PROJECT
  ) {
    return mode
  }

  throw new IntegralPlanningGatewayError(
    `routeMode no soportado por ${INTEGRAL_MOTOR_MODE}: ${String(value)}`,
    {
      code:
        'INTEGRAL_ROUTE_MODE_NOT_SUPPORTED',

      statusCode:
        400,

      details: {
        received:
          value,

        supported: [
          INTEGRAL_ROUTE_MODES
            .ROUND_TRIP,

          INTEGRAL_ROUTE_MODES
            .FOREIGN_ROUTE,

          INTEGRAL_ROUTE_MODES
            .HYBRID_PROJECT
        ]
      }
    }
  )
}

function normalizeOriginMode(
  value
) {
  return String(
    value ||
    'cedis'
  )
    .trim()
    .toLowerCase()
}

function normalizeScope(
  body
) {
  const explicit =
    normalizeUpperText(
      body?.scope
    )

  if (
    explicit ===
    'PROJECT'
  ) {
    return 'PROJECT'
  }

  if (
    explicit ===
    'REGION'
  ) {
    return 'REGION'
  }

  if (
    body?.projectWide ===
    true
  ) {
    return 'PROJECT'
  }

  if (
    normalizeOptionalText(
      body?.region_sanitaria
    )
  ) {
    return 'REGION'
  }

  return null
}

function clampPositiveInteger(
  value,
  fallback,
  {
    minimum =
      1,

    maximum =
      100
  } = {}
) {
  const number =
    Math.floor(
      Number(value)
    )

  if (
    !Number.isFinite(number)
  ) {
    return fallback
  }

  return Math.max(
    minimum,
    Math.min(
      maximum,
      number
    )
  )
}

/**
 * ============================================================
 * DATE / TIMEZONE
 * ============================================================
 */

function getDatePartsInTimeZone(
  date,
  timeZone
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit'
      }
    )

  const values =
    {}

  for (
    const part
    of formatter.formatToParts(
      date
    )
  ) {
    if (
      part.type ===
      'literal'
    ) {
      continue
    }

    values[
      part.type
    ] =
      Number(
        part.value
      )
  }

  return {
    year:
      values.year,

    month:
      values.month,

    day:
      values.day
  }
}

function formatDateOnly({
  year,
  month,
  day
}) {
  return (
    `${String(year).padStart(4, '0')}-` +
    `${String(month).padStart(2, '0')}-` +
    `${String(day).padStart(2, '0')}`
  )
}

function getTomorrowDateInTimeZone(
  timeZone
) {
  const current =
    getDatePartsInTimeZone(
      new Date(),
      timeZone
    )

  const tomorrow =
    new Date(
      Date.UTC(
        current.year,
        current.month -
          1,
        current.day +
          1
      )
    )

  return formatDateOnly({
    year:
      tomorrow
        .getUTCFullYear(),

    month:
      tomorrow
        .getUTCMonth() +
      1,

    day:
      tomorrow
        .getUTCDate()
  })
}

function validateDateOnly(
  value
) {
  const text =
    String(
      value ||
      ''
    ).trim()

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(text)
  ) {
    return null
  }

  const [
    year,
    month,
    day
  ] =
    text
      .split('-')
      .map(Number)

  const date =
    new Date(
      Date.UTC(
        year,
        month -
          1,
        day
      )
    )

  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month -
        1 ||
    date.getUTCDate() !==
      day
  ) {
    return null
  }

  return text
}

/**
 * ============================================================
 * DATABASE — CEDIS
 * ============================================================
 */

async function getProjectCedis(
  projectCode,
  selectedCedisId =
    null
) {
  const params = [
    projectCode
  ]

  let idFilter =
    ''

  if (
    selectedCedisId !==
      null &&
    selectedCedisId !==
      undefined &&
    selectedCedisId !==
      ''
  ) {
    const id =
      Number(
        selectedCedisId
      )

    if (
      !Number.isFinite(id)
    ) {
      throw new IntegralPlanningGatewayError(
        'selectedCedisId no es válido.',
        {
          code:
            'INVALID_CEDIS_ID',

          statusCode:
            400
        }
      )
    }

    params.push(id)

    idFilter =
      'AND id = $2'
  }

  const {
    rows
  } =
    await pool.query(
      `
      SELECT
        id,
        proyecto,
        nombre,
        clues,
        latitud,
        longitud,
        timezone,
        horas_turno,
        hora_limite_llegada_ultima_unidad,
        minutos_servicio_por_unidad

      FROM
        public.proyecto_cedis

      WHERE
        UPPER(
          BTRIM(
            proyecto
          )
        )
        =
        UPPER(
          BTRIM(
            $1
          )
        )

        ${idFilter}

        AND
          activo =
          true

      ORDER BY
        es_principal DESC,
        id ASC

      LIMIT 1
      `,
      params
    )

  return rows[0] ||
    null
}

/**
 * ============================================================
 * DATABASE — DEMAND
 * ============================================================
 */

async function loadDemandPoints({
  proyecto,

  estado =
    null,

  regionSanitaria =
    null,

  scope,

  projectWide =
    false,

  manualOrderIds =
    [],

  estatus =
    null,

  avoidDificilAcceso =
    true
}) {
  const wantedIds =
    asArray(
      manualOrderIds
    )
      .map(Number)
      .filter(
        Number.isFinite
      )

  const hasManualSubset =
    wantedIds.length >
    0

  const projectWideRequest =
    !hasManualSubset &&
    !regionSanitaria &&
    (
      scope ===
        'PROJECT' ||
      projectWide ===
        true
    )

  if (
    !hasManualSubset &&
    !regionSanitaria &&
    !projectWideRequest
  ) {
    throw new IntegralPlanningGatewayError(
      'region_sanitaria es requerida cuando el alcance no es PROJECT.',
      {
        code:
          'INTEGRAL_REGION_REQUIRED',

        statusCode:
          400
      }
    )
  }

  const clauses = [
    'f.latitud IS NOT NULL',
    'f.longitud IS NOT NULL',
    'UPPER(BTRIM(f.proyecto)) = UPPER(BTRIM($1))'
  ]

  const params = [
    proyecto
  ]

  let index =
    2

  if (
    estado
  ) {
    clauses.push(
      `UPPER(BTRIM(f.estado)) = UPPER(BTRIM($${index++}))`
    )

    params.push(
      estado
    )
  }

  if (
    hasManualSubset
  ) {
    clauses.push(
      `f.id = ANY($${index++}::bigint[])`
    )

    params.push(
      wantedIds
    )
  } else if (
    regionSanitaria
  ) {
    clauses.push(
      `UPPER(BTRIM(f.region_sanitaria)) = UPPER(BTRIM($${index++}))`
    )

    params.push(
      regionSanitaria
    )
  }

  if (
    estatus
  ) {
    clauses.push(
      `UPPER(BTRIM(f.estatus::text)) = UPPER(BTRIM($${index++}))`
    )

    params.push(
      String(
        estatus
      )
    )
  } else {
    clauses.push(
      `COALESCE(UPPER(f.estatus::text), '') <> 'INACTIVA'`
    )
  }

  /*
   * Igual que el comportamiento seguro anterior:
   *
   * una selección manual explícita representa
   * demanda elegida deliberadamente y no se
   * elimina silenciosamente por difícil acceso.
   */
  const applyAvoidHard =
    avoidDificilAcceso &&
    !hasManualSubset

  if (
    applyAvoidHard
  ) {
    clauses.push(
      'fda.clues IS NULL'
    )
  }

  const sql = `
    SELECT
      f.id,
      f.clues,
      f.unidad,
      f.region_sanitaria,
      f.estatus::text AS estatus,
      f.supervisor,
      f.direccion,
      f.latitud,
      f.longitud,
      f.estado,
      f.proyecto,

      (
        fda.clues IS NOT NULL
      ) AS dificil_acceso

    FROM
      public.farmacia f

    LEFT JOIN
      public.farmacia_dificil_acceso fda

      ON
        fda.clues =
        f.clues

    WHERE
      ${clauses.join(' AND ')}

    ORDER BY
      f.clues

    LIMIT 2000
  `

  const {
    rows
  } =
    await pool.query(
      sql,
      params
    )

  const points =
    asArray(rows)
      .map(
        row => ({
          id:
            Number(
              row.id
            ),

          __plannerKey:
            `id:${Number(
              row.id
            )}`,

          name:
            row.clues ||
            row.unidad ||
            String(
              row.id
            ),

          lat:
            Number(
              row.latitud
            ),

          lng:
            Number(
              row.longitud
            ),

          meta: {
            clues:
              row.clues ||
              null,

            unidad:
              row.unidad ||
              null,

            direccion:
              row.direccion ||
              null,

            region_sanitaria:
              row.region_sanitaria ||
              null,

            estado:
              row.estado ||
              null,

            proyecto:
              row.proyecto ||
              null,

            estatus:
              row.estatus ||
              null,

            dificil:
              Boolean(
                row.dificil_acceso
              )
          }
        })
      )
      .filter(
        isValidLatLng
      )

  return {
    points,

    hasManualSubset,

    wantedIds,

    projectWideRequest
  }
}

/**
 * ============================================================
 * ORIGIN + OPERATIONAL POLICY
 * ============================================================
 */

async function resolveOriginAndPolicy({
  body,
  proyecto
}) {
  const originMode =
    normalizeOriginMode(
      body.originMode
    )

  const selectedCedisId =
    body.selectedCedisId ??
    null

  let cedis =
    null

  let origin =
    null

  if (
    originMode ===
    'cedis'
  ) {
    cedis =
      await getProjectCedis(
        proyecto,
        selectedCedisId
      )

    if (
      !cedis
    ) {
      throw new IntegralPlanningGatewayError(
        selectedCedisId
          ? 'El CEDIS seleccionado no existe, está inactivo o no pertenece al proyecto.'
          : 'El proyecto no tiene un CEDIS activo configurado.',
        {
          code:
            selectedCedisId
              ? 'CEDIS_NOT_AVAILABLE'
              : 'CEDIS_NOT_CONFIGURED',

          statusCode:
            400,

          details: {
            proyecto,

            selectedCedisId
          }
        }
      )
    }

    origin = {
      lat:
        Number(
          cedis.latitud
        ),

      lng:
        Number(
          cedis.longitud
        )
    }

    if (
      !isValidLatLng(
        origin
      )
    ) {
      throw new IntegralPlanningGatewayError(
        'El CEDIS seleccionado no tiene coordenadas válidas.',
        {
          code:
            'CEDIS_INVALID_COORDINATES',

          statusCode:
            400
        }
      )
    }
  } else if (
    originMode ===
    'coords'
  ) {
    origin =
      normalizeLatLng(
        body.origin ??
        body.originCoords
      )

    if (
      !origin
    ) {
      throw new IntegralPlanningGatewayError(
        'originMode=coords requiere origin.lat y origin.lng válidos.',
        {
          code:
            'INTEGRAL_ORIGIN_COORDS_REQUIRED',

          statusCode:
            400
        }
      )
    }
  } else if (
    originMode ===
    'pharmacy'
  ) {
    /*
     * Todavía no activamos este origen en el nuevo motor.
     *
     * El legacy continúa soportándolo.
     *
     * Lo habilitaremos después de validar la primera
     * integración HTTP para no mezclar cambios.
     */
    throw new IntegralPlanningGatewayError(
      'originMode=pharmacy todavía no está habilitado en INTEGRAL_V1_3. Utiliza CEDIS o coordenadas durante la validación DEV.',
      {
        code:
          'INTEGRAL_PHARMACY_ORIGIN_NOT_ENABLED',

        statusCode:
          400
      }
    )
  } else {
    throw new IntegralPlanningGatewayError(
      `originMode no soportado por INTEGRAL_V1_3: ${originMode}`,
      {
        code:
          'INTEGRAL_ORIGIN_MODE_NOT_SUPPORTED',

        statusCode:
          400
      }
    )
  }

  const options = {
    ...(
      body.options ||
      {}
    )
  }

  const shiftHours =
    asFiniteNumber(
      body.shiftHours ??
      options.shiftHours ??
      cedis
        ?.horas_turno
    ) ??
    8

  const serviceMinutesPerUnit =
    asFiniteNumber(
      body.serviceMinutesPerUnit ??
      options.serviceMinutesPerUnit ??
      cedis
        ?.minutos_servicio_por_unidad
    ) ??
    45

  const startClock =
    String(
      body.startClock ??
      options.startClock ??
      '08:00'
    )

  const lastArrivalClock =
    String(
      body.lastArrivalClock ??
      options.lastArrivalClock ??
      cedis
        ?.hora_limite_llegada_ultima_unidad ??
      '16:00'
    )

  const returnGraceMinutes =
    asFiniteNumber(
      body.returnGraceMinutes ??
      options.returnGraceMinutes
    ) ??
    90

  const maxReturnGraceMinutes =
    asFiniteNumber(
      body.maxReturnGraceMinutes ??
      options.maxReturnGraceMinutes
    ) ??
    120

  const dayCloseTravelGraceMinutes =
    asFiniteNumber(
      body.dayCloseTravelGraceMinutes ??
      options.dayCloseTravelGraceMinutes
    ) ??
    returnGraceMinutes

  const maxForeignDays =
    clampPositiveInteger(
      body.maxForeignDays ??
      options.maxForeignDays ??
      3,
      3,
      {
        minimum:
          1,

        maximum:
          30
      }
    )

  const timeZone =
    normalizeOptionalText(
      body.timeZone ??
      options.timeZone ??
      cedis?.timezone
    ) ||
    'America/Mexico_City'

  const explicitPlanningDate =
    validateDateOnly(
      body.planningDate ??
      body.planDate ??
      body.date
    )

  const planningDate =
    explicitPlanningDate ||
    getTomorrowDateInTimeZone(
      timeZone
    )

  return {
    originMode,

    origin,

    cedis,

    planningDate,

    timeZone,

    roundTripPolicy: {
      shiftHours,

      serviceMinutesPerUnit,

      startClock,

      lastArrivalClock,

      returnGraceMinutes,

      maxReturnGraceMinutes
    },

    foreignPolicy: {
      maxForeignDays,

      shiftHours,

      serviceMinutesPerUnit,

      startClock,

      lastArrivalClock,

      dayCloseTravelGraceMinutes
    }
  }
}

/**
 * ============================================================
 * OPTIONAL VERIFICATION FALLBACK
 * ============================================================
 *
 * Un fallo de Google Routes o de Route Quality
 * posterior a un planner factible NO borra la ruta.
 *
 * planning quedará FEASIBLE pero:
 *
 * recommendationStatus = REVIEW_REQUIRED.
 */

function buildUnavailableFinalValidation({
  routeMode,
  planner,
  error
}) {
  const routeCount =
    asArray(
      planner?.routes
    ).length

  if (
    routeMode ===
    INTEGRAL_ROUTE_MODES
      .FOREIGN_ROUTE
  ) {
    return {
      status:
        'PARTIAL',

      verified:
        false,

      basePlanUsable:
        planner?.feasible ===
        true,

      routeCount,

      verifiedRouteCount:
        0,

      partialRouteCount:
        routeCount,

      infeasibleRouteCount:
        0,

      invalidRouteCount:
        0,

      requiredDays:
        planner?.requiredDays ??
        null,

      normalDays:
        null,

      extendedCloseDays:
        null,

      infeasibleDays:
        0,

      totals: {},

      error:
        serializeError(
          error
        )
    }
  }

  return {
    status:
      'PARTIAL',

    verified:
      false,

    basePlanUsable:
      planner?.feasible ===
      true,

    routeCount,

    verifiedRoutes:
      0,

    partialRoutes:
      routeCount,

    infeasibleRouteCount:
      0,

    invalidRouteCount:
      0,

    normalRoutes:
      null,

    extendedReturnRoutes:
      null,

    maxGraceUsedMinutes:
      null,

    totals: {},

    error:
      serializeError(
        error
      )
  }
}

function buildUnavailableRouteQuality({
  planner,
  error
}) {
  const routeCount =
    asArray(
      planner?.routes
    ).length

  return {
    status:
      'REVIEW',

    acceptable:
      true,

    routeCount,

    passedRouteCount:
      0,

    reviewRouteCount:
      routeCount,

    rejectedRouteCount:
      0,

    error:
      serializeError(
        error
      )
  }
}

/**
 * ============================================================
 * ROUND_TRIP
 * ============================================================
 */

async function executeRoundTripPlanning({
  origin,
  points,
  planningDate,
  timeZone,
  policy,
  avoidTolls,
  maxSolverCalls,
  warnings
}) {
  /**
   * Adaptador directo al provider OAuth.
   *
   * Incluimos aliases de política de forma deliberada.
   * JS ignorará propiedades que el provider no utilice.
   *
   * Esto mantiene el gateway desacoplado del nombre
   * interno concreto utilizado por cada módulo.
   */
  const solveScenario =
    async (
      scenario = {}
    ) =>
      solveGoogleRoundTripScenarioOAuth({
        ...scenario,

        origin:
          scenario.origin ??
          origin,

        points:
          scenario.points ??
          points,

        planningDate,

        timeZone,

        workday:
          scenario.workday ??
          policy,

        workdayConfig:
          scenario.workdayConfig ??
          policy,

        workdayPolicy:
          scenario.workdayPolicy ??
          policy,

        planningPolicy:
          scenario.planningPolicy ??
          policy,

        avoidTolls,

        considerRoadTraffic:
          true,

        mandatoryCoverage:
          scenario.mandatoryCoverage !==
          false
      })

  const rawPlanner =
    await planAutomaticRoundTripResources({
      origin,

      points,

      workday:
        policy,

      workdayConfig:
        policy,

      workdayPolicy:
        policy,

      planningPolicy:
        policy,

      solveScenario,

      /*
       * NO representa recursos disponibles.
       *
       * Es únicamente el techo matemático
       * de la búsqueda.
       */
      maxCandidateResources:
        points.length,

      maxSolverCalls,

      finalQualityPass:
        true
    })

  const planner = {
    ...rawPlanner,

    routeMode:
      INTEGRAL_ROUTE_MODES
        .ROUND_TRIP
  }

  if (
    !planner.feasible
  ) {
    return {
      planner,

      finalValidation:
        null,

      routeQuality:
        null
    }
  }

  let finalValidation

  try {
    finalValidation =
      await validateRoundTripPlanWithGoogleRoutes({
        plan:
          planner,

        planner,

        origin,

        points,

        planningDate,

        timeZone,

        workday:
          policy,

        workdayConfig:
          policy,

        workdayPolicy:
          policy,

        planningPolicy:
          policy,

        avoidTolls,

        considerRoadTraffic:
          true
      })
  } catch (
    error
  ) {
    console.error(
      '[INTEGRAL][ROUND_TRIP] final validation unavailable:',
      error
    )

    warnings.push({
      severity:
        'WARNING',

      code:
        'ROUND_TRIP_FINAL_VALIDATION_UNAVAILABLE',

      message:
        'El plan base fue calculado, pero la validación carretera adicional no estuvo disponible.',

      details:
        serializeError(
          error
        )
    })

    finalValidation =
      buildUnavailableFinalValidation({
        routeMode:
          INTEGRAL_ROUTE_MODES
            .ROUND_TRIP,

        planner,

        error
      })
  }

  let routeQuality

  if (
    finalValidation
      ?.verified ===
    true
  ) {
    try {
      routeQuality =
        evaluatePlanRouteQuality({
          origin,

          points,

          plan:
            planner,

          planner,

          finalValidation
        })
    } catch (
      error
    ) {
      console.error(
        '[INTEGRAL][ROUND_TRIP] route quality unavailable:',
        error
      )

      warnings.push({
        severity:
          'WARNING',

        code:
          'ROUND_TRIP_ROUTE_QUALITY_UNAVAILABLE',

        message:
          'El plan permanece utilizable, pero Route Quality no pudo evaluarse.',

        details:
          serializeError(
            error
          )
      })

      routeQuality =
        buildUnavailableRouteQuality({
          planner,

          error
        })
    }
  } else {
    routeQuality =
      buildUnavailableRouteQuality({
        planner,

        error:
          new Error(
            'Route Quality no se ejecutó porque la validación carretera no quedó VERIFIED.'
          )
      })
  }

  return {
    planner,

    finalValidation,

    routeQuality
  }
}

/**
 * ============================================================
 * FOREIGN_ROUTE
 * ============================================================
 */

async function executeForeignPlanning({
  origin,
  points,
  planningDate,
  timeZone,
  policy,
  avoidTolls,
  maxSolverCalls,
  warnings
}) {
  const solveScenario =
    async (
      scenario = {}
    ) =>
      solveGoogleForeignScenarioOAuth({
        ...scenario,

        origin:
          scenario.origin ??
          origin,

        points:
          scenario.points ??
          points,

        planningDate,

        timeZone,

        foreignPolicy:
          scenario.foreignPolicy ??
          policy,

        maxForeignDays:
          scenario.maxForeignDays ??
          policy.maxForeignDays,

        avoidTolls,

        considerRoadTraffic:
          true,

        mandatoryCoverage:
          scenario.mandatoryCoverage !==
          false
      })

  const rawPlanner =
    await planAutomaticForeignResources({
      origin,

      points,

      foreignPolicy:
        policy,

      solveScenario,

      /*
       * Nuevamente:
       *
       * NO es plantilla disponible.
       */
      maxCandidateResources:
        points.length,

      maxSolverCalls,

      finalQualityPass:
        true
    })

  const planner = {
    ...rawPlanner,

    routeMode:
      INTEGRAL_ROUTE_MODES
        .FOREIGN_ROUTE
  }

  if (
    !planner.feasible
  ) {
    return {
      planner,

      finalValidation:
        null,

      routeQuality:
        null
    }
  }

  let finalValidation

  try {
    finalValidation =
      await validateForeignPlanWithGoogleRoutes({
        plan:
          planner,

        planner,

        origin,

        points,

        planningDate,

        foreignPolicy:
          policy,

        timeZone,

        avoidTolls
      })
  } catch (
    error
  ) {
    console.error(
      '[INTEGRAL][FOREIGN_ROUTE] final validation unavailable:',
      error
    )

    warnings.push({
      severity:
        'WARNING',

      code:
        'FOREIGN_FINAL_VALIDATION_UNAVAILABLE',

      message:
        'La expedición base fue calculada, pero la validación carretera adicional no estuvo disponible.',

      details:
        serializeError(
          error
        )
    })

    finalValidation =
      buildUnavailableFinalValidation({
        routeMode:
          INTEGRAL_ROUTE_MODES
            .FOREIGN_ROUTE,

        planner,

        error
      })
  }

  let routeQuality

  if (
    finalValidation
      ?.verified ===
    true
  ) {
    try {
      routeQuality =
        evaluateForeignPlanRouteQuality({
          origin,

          points,

          plan:
            planner,

          finalValidation
        })
    } catch (
      error
    ) {
      console.error(
        '[INTEGRAL][FOREIGN_ROUTE] route quality unavailable:',
        error
      )

      warnings.push({
        severity:
          'WARNING',

        code:
          'FOREIGN_ROUTE_QUALITY_UNAVAILABLE',

        message:
          'La expedición permanece utilizable, pero Foreign Route Quality no pudo evaluarse.',

        details:
          serializeError(
            error
          )
      })

      routeQuality =
        buildUnavailableRouteQuality({
          planner,

          error
        })
    }
  } else {
    routeQuality =
      buildUnavailableRouteQuality({
        planner,

        error:
          new Error(
            'Foreign Route Quality no se ejecutó porque la validación carretera no quedó VERIFIED.'
          )
      })
  }

  return {
    planner,

    finalValidation,

    routeQuality
  }
}

/**
 * ============================================================
 * HYBRID_PROJECT
 * ============================================================
 *
 * Orquestador de proyecto completo.
 *
 * PRINCIPIO:
 *
 * 1. La demanda se divide inicialmente por región sanitaria.
 *
 * 2. Cada región intenta primero ROUND_TRIP.
 *
 * 3. Si ROUND_TRIP no resulta técnicamente viable,
 *    la región pasa automáticamente a FOREIGN_ROUTE.
 *
 * 4. Los dos motores existentes siguen siendo la autoridad
 *    técnica. HYBRID_PROJECT únicamente los coordina.
 *
 * 5. El resultado consolida:
 *
 *    - cobertura
 *    - rutas ida/vuelta
 *    - expediciones foráneas
 *    - operadores requeridos
 *    - vehículos requeridos
 *    - días de ejecución
 *    - kilómetros
 *    - tiempos
 *
 * 6. La capacidad real disponible NO modifica la necesidad
 *    recomendada por el planner.
 *
 * ============================================================
 */

async function executeHybridProjectPlanning({
  origin,
  points,
  planningDate,
  timeZone,
  roundTripPolicy,
  foreignPolicy,
  avoidTolls,
  maxSolverCalls,
  warnings
}) {
  const HYBRID_ROUTE_MODE =
    'HYBRID_PROJECT'

  /*
   * ==========================================================
   * HELPERS
   * ==========================================================
   */

  const finiteNumber =
    value => {
      if (
        value === null ||
        value === undefined ||
        value === ''
      ) {
        return null
      }

      const number =
        Number(value)

      return Number.isFinite(number)
        ? number
        : null
    }

  const sum =
    values =>
      values.reduce(
        (
          total,
          value
        ) => {
          const number =
            finiteNumber(value)

          return (
            total +
            (
              number ??
              0
            )
          )
        },
        0
      )

  const maximum =
    values => {
      const numbers =
        values
          .map(
            finiteNumber
          )
          .filter(
            value =>
              value !==
              null
          )

      if (
        !numbers.length
      ) {
        return null
      }

      return Math.max(
        ...numbers
      )
    }

  const getPointKey =
    (
      point,
      index = 0
    ) => {
      if (
        point?.__plannerKey
      ) {
        return String(
          point.__plannerKey
        )
      }

      if (
        point?.id !==
          null &&
        point?.id !==
          undefined
      ) {
        return (
          `id:${String(point.id)}`
        )
      }

      return [
        'geo',
        Number(
          point?.lat
        ),
        Number(
          point?.lng
        ),
        index
      ].join(':')
    }

  const getPointRegion =
    point =>
      normalizeOptionalText(
        point?.meta?.region_sanitaria ??
        point?.meta?.regionSanitaria ??
        point?.regionSanitaria ??
        point?.region_sanitaria ??
        point?.region ??
        point?.jurisdiccion ??
        point?.jurisdicción
      ) ||
      'SIN_REGION'

  /*
   * ==========================================================
   * AGRUPACIÓN TERRITORIAL INICIAL
   * ==========================================================
   *
   * La región sanitaria funciona como partición territorial
   * estable para esta primera versión del coordinador.
   *
   * El motor sigue decidiendo posteriormente si esa demanda
   * corresponde a ROUND_TRIP o FOREIGN_ROUTE.
   * ==========================================================
   */

  const groupsByRegion =
    new Map()

  for (
    const point
    of asArray(points)
  ) {
    const region =
      getPointRegion(
        point
      )

    if (
      !groupsByRegion.has(
        region
      )
    ) {
      groupsByRegion.set(
        region,
        []
      )
    }

    groupsByRegion
      .get(region)
      .push(point)
  }

  const groups =
    Array.from(
      groupsByRegion.entries()
    )
      .map(
        (
          [
            region,
            regionPoints
          ]
        ) => ({
          region,
          points:
            regionPoints
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          a.region.localeCompare(
            b.region,
            'es'
          )
      )

  /*
   * ==========================================================
   * RESULTADOS PARCIALES
   * ==========================================================
   */

  const selectedExecutions =
    []

  const failedGroups =
    []

  /*
   * ==========================================================
   * EVALUACIÓN DE CADA TERRITORIO
   * ==========================================================
   */

  for (
    const group
    of groups
  ) {
    /*
     * --------------------------------------------------------
     * 1. PRIMER INTENTO: ROUND_TRIP
     * --------------------------------------------------------
     */

    let roundTripExecution =
      null

    try {
      roundTripExecution =
        await executeRoundTripPlanning({
          origin,

          points:
            group.points,

          planningDate,

          timeZone,

          policy:
            roundTripPolicy,

          avoidTolls,

          maxSolverCalls,

          warnings
        })
    } catch (
      error
    ) {
      warnings.push({
        severity:
          'WARNING',

        code:
          'HYBRID_ROUND_TRIP_EVALUATION_ERROR',

        message:
          `No fue posible completar la evaluación ROUND_TRIP de ${group.region}. Se intentará como FOREIGN_ROUTE.`,

        details: {
          region:
            group.region,

          error:
            serializeError(
              error
            )
        }
      })
    }

    if (
      roundTripExecution
        ?.planner
        ?.feasible ===
      true
    ) {
      selectedExecutions.push({
        region:
          group.region,

        mode:
          INTEGRAL_ROUTE_MODES
            .ROUND_TRIP,

        points:
          group.points,

        execution:
          roundTripExecution
      })

      continue
    }

    /*
     * --------------------------------------------------------
     * 2. SEGUNDO INTENTO: FOREIGN_ROUTE
     * --------------------------------------------------------
     */

    let foreignExecution =
      null

    try {
      foreignExecution =
        await executeForeignPlanning({
          origin,

          points:
            group.points,

          planningDate,

          timeZone,

          policy:
            foreignPolicy,

          avoidTolls,

          maxSolverCalls,

          warnings
        })
    } catch (
      error
    ) {
      warnings.push({
        severity:
          'WARNING',

        code:
          'HYBRID_FOREIGN_EVALUATION_ERROR',

        message:
          `No fue posible completar la evaluación FOREIGN_ROUTE de ${group.region}.`,

        details: {
          region:
            group.region,

          error:
            serializeError(
              error
            )
        }
      })
    }

    if (
      foreignExecution
        ?.planner
        ?.feasible ===
      true
    ) {
      selectedExecutions.push({
        region:
          group.region,

        mode:
          INTEGRAL_ROUTE_MODES
            .FOREIGN_ROUTE,

        points:
          group.points,

        execution:
          foreignExecution
      })

      continue
    }

    /*
     * --------------------------------------------------------
     * 3. TERRITORIO NO RESUELTO
     * --------------------------------------------------------
     */

    failedGroups.push({
      region:
        group.region,

      pointCount:
        group.points.length,

      pointKeys:
        group.points
          .map(
            getPointKey
          )
          .filter(
            key =>
              key !==
              null &&
              key !==
              undefined
          ),

      roundTripPlanner:
        roundTripExecution
          ?.planner ??
        null,

      foreignPlanner:
        foreignExecution
          ?.planner ??
        null
    })
  }

  /*
   * ==========================================================
   * CONSOLIDACIÓN DE RUTAS
   * ==========================================================
   */

  const routes =
    []

  let nextRouteIndex =
    0

  for (
    const selected
    of selectedExecutions
  ) {
    const childPlanner =
      selected
        .execution
        ?.planner

    const childFinalRoutes =
      asArray(
        selected
          .execution
          ?.finalValidation
          ?.routes
      )

    const childRoutes =
      asArray(
        childPlanner
          ?.routes
      )

    for (
      let childRouteIndex = 0;
      childRouteIndex <
        childRoutes.length;
      childRouteIndex++
    ) {
      const route =
        childRoutes[
          childRouteIndex
        ]

      const validatedRoute =
        childFinalRoutes.find(
          candidate =>
            candidate
              ?.routeIndex ===
            childRouteIndex
        ) ||
        childFinalRoutes[
          childRouteIndex
        ] ||
        null

      const resolvedPolyline =
        route?.polyline ||
        route
          ?.routePolyline
          ?.points ||
        route
          ?.routePolyline
          ?.encodedPolyline ||
        validatedRoute
          ?.roadValidation
          ?.polyline ||
        null

      routes.push({
        ...route,

        routeIndex:
          nextRouteIndex,

        polyline:
          resolvedPolyline,

        hybrid: {
          mode:
            selected.mode,

          region:
            selected.region,

          childRouteIndex
        }
      })

      nextRouteIndex++
    }
  }

  /*
   * ==========================================================
   * COBERTURA
   * ==========================================================
   */

  const expectedPointKeys =
    new Set(
      asArray(points)
        .map(
          getPointKey
        )
        .filter(
          key =>
            key !==
            null &&
            key !==
            undefined
        )
        .map(
          key =>
            String(key)
        )
    )

  const assignedPointKeys =
    new Set()

  for (
    const route
    of routes
  ) {
    for (
      const key
      of asArray(
        route?.pointKeys
      )
    ) {
      if (
        key === null ||
        key === undefined
      ) {
        continue
      }

      assignedPointKeys.add(
        String(key)
      )
    }
  }

  const unresolvedPointKeys =
    Array.from(
      expectedPointKeys
    )
      .filter(
        key =>
          !assignedPointKeys.has(
            key
          )
      )

  const duplicateAssignments =
    (() => {
      const counts =
        new Map()

      for (
        const route
        of routes
      ) {
        for (
          const key
          of asArray(
            route?.pointKeys
          )
        ) {
          if (
            key === null ||
            key === undefined
          ) {
            continue
          }

          const normalized =
            String(key)

          counts.set(
            normalized,
            (
              counts.get(
                normalized
              ) ||
              0
            ) +
            1
          )
        }
      }

      return Array.from(
        counts.entries()
      )
        .filter(
          (
            [
              ,
              count
            ]
          ) =>
            count >
            1
        )
        .map(
          (
            [
              key,
              count
            ]
          ) => ({
            key,
            count
          })
        )
    })()

  const coveragePercent =
    expectedPointKeys.size >
      0
      ? (
          assignedPointKeys.size /
          expectedPointKeys.size *
          100
        )
      : 0

  /*
   * ==========================================================
   * COMPOSICIÓN OPERATIVA
   * ==========================================================
   */

  const roundTripSelections =
    selectedExecutions.filter(
      selected =>
        selected.mode ===
        INTEGRAL_ROUTE_MODES
          .ROUND_TRIP
    )

  const foreignSelections =
    selectedExecutions.filter(
      selected =>
        selected.mode ===
        INTEGRAL_ROUTE_MODES
          .FOREIGN_ROUTE
    )

  const roundTripRoutes =
    routes.filter(
      route =>
        route
          ?.hybrid
          ?.mode ===
        INTEGRAL_ROUTE_MODES
          .ROUND_TRIP
    )

  const foreignRoutes =
    routes.filter(
      route =>
        route
          ?.hybrid
          ?.mode ===
        INTEGRAL_ROUTE_MODES
          .FOREIGN_ROUTE
    )

  const roundTripDestinationCount =
    sum(
      roundTripSelections.map(
        selected =>
          selected
            .points
            .length
      )
    )

  const foreignDestinationCount =
    sum(
      foreignSelections.map(
        selected =>
          selected
            .points
            .length
      )
    )

  /*
   * ==========================================================
   * RECURSOS
   * ==========================================================
   *
   * Para el plan recomendado:
   *
   * operadores / vehículos =
   * recursos simultáneos necesarios para ejecutar todas
   * las rutas y expediciones recomendadas.
   *
   * requiredDays =
   * horizonte máximo necesario entre todos los componentes.
   * ==========================================================
   */

  const requiredRoutes =
    routes.length

  const requiredOperators =
    sum(
      selectedExecutions.map(
        selected =>
          selected
            .execution
            ?.planner
            ?.requiredOperators ??
          selected
            .execution
            ?.planner
            ?.requiredRoutes ??
          asArray(
            selected
              .execution
              ?.planner
              ?.routes
          ).length
      )
    )

  const requiredVehicles =
    sum(
      selectedExecutions.map(
        selected =>
          selected
            .execution
            ?.planner
            ?.requiredVehicles ??
          selected
            .execution
            ?.planner
            ?.requiredRoutes ??
          asArray(
            selected
              .execution
              ?.planner
              ?.routes
          ).length
      )
    )

  const requiredDays =
    maximum(
      selectedExecutions.map(
        selected =>
          selected
            .execution
            ?.planner
            ?.requiredDays ??
          selected
            .execution
            ?.planner
            ?.targetOperationalDays ??
          1
      )
    ) ??
    1

  /*
   * ==========================================================
   * VALIDACIÓN CARRETERA CONSOLIDADA
   * ==========================================================
   */

  const childFinalValidations =
    selectedExecutions
      .map(
        selected =>
          selected
            .execution
            ?.finalValidation
      )
      .filter(Boolean)

  const roadVerified =
    selectedExecutions.length >
      0 &&
    childFinalValidations.length ===
      selectedExecutions.length &&
    childFinalValidations.every(
      validation =>
        validation
          ?.verified ===
        true
    )

  const totalDistanceMeters =
    sum(
      selectedExecutions.map(
        selected =>
          selected
            .execution
            ?.finalValidation
            ?.totals
            ?.distanceMeters ??
          selected
            .execution
            ?.planner
            ?.totalDistanceMeters
      )
    )

  const totalTravelDurationSeconds =
    sum(
      selectedExecutions.map(
        selected =>
          selected
            .execution
            ?.finalValidation
            ?.totals
            ?.travelDurationSeconds
      )
    )

  const totalOperationalDurationSeconds =
    sum(
      selectedExecutions.map(
        selected =>
          selected
            .execution
            ?.finalValidation
            ?.totals
            ?.operationalDurationSeconds
      )
    )

  const maximumRouteOperationalSeconds =
    maximum(
      selectedExecutions.map(
        selected =>
          selected
            .execution
            ?.finalValidation
            ?.totals
            ?.maximumRouteOperationalSeconds
      )
    )

  const normalRoutes =
    sum(
      roundTripSelections.map(
        selected =>
          selected
            .execution
            ?.finalValidation
            ?.normalRoutes ??
          selected
            .execution
            ?.planner
            ?.normalRoutes ??
          0
      )
    )

  const extendedReturnRoutes =
    sum(
      roundTripSelections.map(
        selected =>
          selected
            .execution
            ?.finalValidation
            ?.extendedReturnRoutes ??
          selected
            .execution
            ?.planner
            ?.extendedReturnRoutes ??
          0
      )
    )

  const maxGraceUsedMinutes =
    maximum(
      roundTripSelections.map(
        selected =>
          selected
            .execution
            ?.finalValidation
            ?.maxGraceUsedMinutes ??
          selected
            .execution
            ?.planner
            ?.maxGraceUsedMinutes
      )
    )

  const finalValidation = {
    status:
      roadVerified
        ? 'VERIFIED'
        : 'PARTIAL',

    verified:
      roadVerified,

    basePlanUsable:
      routes.length >
      0,

    routeCount:
      routes.length,

    infeasibleRouteCount:
      0,

    invalidRouteCount:
      0,

    normalRoutes,

    extendedReturnRoutes,

    maxGraceUsedMinutes,

    routes: [],

    totals: {
      distanceMeters:
        totalDistanceMeters,

      travelDurationSeconds:
        totalTravelDurationSeconds,

      operationalDurationSeconds:
        totalOperationalDurationSeconds,

      maximumRouteOperationalSeconds
    }
  }

  /*
   * ==========================================================
   * ROUTE QUALITY CONSOLIDADO
   * ==========================================================
   */

  const qualityResults =
    selectedExecutions
      .map(
        selected =>
          selected
            .execution
            ?.routeQuality
      )
      .filter(Boolean)

  const rejectedRouteCount =
    sum(
      qualityResults.map(
        quality =>
          quality
            ?.rejectedRouteCount ??
          0
      )
    )

  const reviewRouteCount =
    sum(
      qualityResults.map(
        quality =>
          quality
            ?.reviewRouteCount ??
          0
      )
    )

  const passedRouteCount =
    sum(
      qualityResults.map(
        quality =>
          quality
            ?.passedRouteCount ??
          0
      )
    )

  const qualityStatus =
    rejectedRouteCount >
      0
      ? 'REJECT'
      : (
          reviewRouteCount >
            0 ||
          qualityResults.length !==
            selectedExecutions.length
            ? 'REVIEW'
            : 'PASS'
        )

  const routeQuality = {
    status:
      qualityStatus,

    acceptable:
      rejectedRouteCount ===
      0,

    routeCount:
      routes.length,

    passedRouteCount,

    reviewRouteCount,

    rejectedRouteCount
  }

  /*
   * ==========================================================
   * PLANNER CONSOLIDADO
   * ==========================================================
   */

  const feasible =
    routes.length >
      0 &&
    failedGroups.length ===
      0 &&
    unresolvedPointKeys.length ===
      0 &&
    duplicateAssignments.length ===
      0 &&
    assignedPointKeys.size ===
      expectedPointKeys.size

  const planner = {
    feasible,

    routeMode:
      HYBRID_ROUTE_MODE,

    resourcePlanningMode:
      'AUTO_REQUIREMENTS',

    allDestinationsAssigned:
      unresolvedPointKeys.length ===
        0 &&
      assignedPointKeys.size ===
        expectedPointKeys.size,

    totalDestinations:
      expectedPointKeys.size,

    destinationCount:
      expectedPointKeys.size,

    assignedDestinations:
      assignedPointKeys.size,

    coveragePercent,

    requiredRoutes,

    requiredOperators,

    requiredVehicles,

    requiredDays,

    targetOperationalDays:
      requiredDays,

    routes,

    composition: {
      roundTrip: {
        groups:
          roundTripSelections.length,

        regions:
          roundTripSelections.map(
            selected =>
              selected.region
          ),

        destinations:
          roundTripDestinationCount,

        routes:
          roundTripRoutes.length
      },

      foreign: {
        groups:
          foreignSelections.length,

        regions:
          foreignSelections.map(
            selected =>
              selected.region
          ),

        destinations:
          foreignDestinationCount,

        expeditions:
          foreignRoutes.length
      },

      total: {
        groups:
          selectedExecutions.length,

        destinations:
          expectedPointKeys.size,

        routesAndExpeditions:
          routes.length
      }
    },

    hybridFeasibility: {
      totalGroups:
        groups.length,

      resolvedGroups:
        selectedExecutions.length,

      failedGroups:
        failedGroups.length,

      unresolvedDestinations:
        unresolvedPointKeys.length,

      duplicateAssignments:
        duplicateAssignments.length,

      roadVerified
    },

    unresolvedPointKeys,

    duplicateAssignments,

    failedGroups
  }

  /*
   * Si la cobertura híbrida queda incompleta,
   * no ocultamos el problema.
   */

  if (
    !feasible
  ) {
    warnings.push({
      severity:
        'HIGH',

      code:
        'HYBRID_PROJECT_INCOMPLETE',

      message:
        'La planeación híbrida no logró cubrir correctamente el 100% del proyecto.',

      details: {
        totalDestinations:
          expectedPointKeys.size,

        assignedDestinations:
          assignedPointKeys.size,

        coveragePercent,

        unresolvedPointKeys,

        duplicateAssignments,

        failedGroups:
          failedGroups.map(
            group => ({
              region:
                group.region,

              pointCount:
                group.pointCount
            })
          )
      }
    })
  }

  return {
    planner,

    finalValidation,

    routeQuality,

    hybrid: {
      composition:
        planner.composition,

      feasibility:
        planner.hybridFeasibility,

      unresolvedPointKeys,

      duplicateAssignments,

      failedGroups
    }
  }
}

/**
 * ============================================================
 * MAIN GATEWAY
 * ============================================================
 */

export async function computeIntegralPlanning(
  body = {}
) {
  const startedAt =
    performance.now()

  const proyecto =
    normalizeOptionalText(
      body.proyecto
    )

  const estado =
    normalizeOptionalText(
      body.estado
    )

  const regionSanitaria =
    normalizeOptionalText(
      body.region_sanitaria
    )

  if (
    !proyecto
  ) {
    throw new IntegralPlanningGatewayError(
      'proyecto es requerido por INTEGRAL_V1_3.',
      {
        code:
          'INTEGRAL_PROJECT_REQUIRED',

        statusCode:
          400
      }
    )
  }

  const routeMode =
    normalizeRouteMode(
      body.routeMode
    )

  const scope =
    normalizeScope(
      body
    )

  const options = {
    ...(
      body.options ||
      {}
    )
  }

  /*
   * Ambos modos que estamos validando
   * requieren retorno:
   *
   * ROUND_TRIP:
   * cada ruta vuelve al origen.
   *
   * FOREIGN_ROUTE:
   * sólo vuelve al finalizar la expedición.
   */
  if (
    options.returnToOrigin ===
    false
  ) {
    throw new IntegralPlanningGatewayError(
      `${routeMode} requiere retorno al origen bajo la política operativa actual.`,
      {
        code:
          'INTEGRAL_RETURN_TO_ORIGIN_REQUIRED',

        statusCode:
          400,

        details: {
          routeMode
        }
      }
    )
  }

  const avoidDificilAcceso =
    options
      .avoidDificilAcceso !==
    false

  const avoidTolls =
    options
      .avoidTolls ===
    true

  const maxSolverCalls =
    clampPositiveInteger(
      body.maxSolverCalls,
      8,
      {
        minimum:
          1,

        maximum:
          12
      }
    )

  /**
   * ==========================================================
   * ORIGIN / POLICY
   * ==========================================================
   */

  const originStartedAt =
    performance.now()

  const originConfig =
    await resolveOriginAndPolicy({
      body,

      proyecto
    })

  const originMs =
    performance.now() -
    originStartedAt

  /**
   * ==========================================================
   * DEMAND
   * ==========================================================
   */

  const demandStartedAt =
    performance.now()

  const hybridProjectMode =
    routeMode ===
    INTEGRAL_ROUTE_MODES
      .HYBRID_PROJECT

  const effectiveRegionSanitaria =
    hybridProjectMode
      ? null
      : regionSanitaria

  const effectiveScope =
    hybridProjectMode
      ? 'PROJECT'
      : scope

  const demand =
    await loadDemandPoints({
      proyecto,

      estado,

      regionSanitaria:
        effectiveRegionSanitaria,

      scope:
        effectiveScope,

      projectWide:
        hybridProjectMode ||
        body.projectWide ===
          true,

      manualOrderIds:
        body.manualOrderIds,

      estatus:
        body.estatus,

      avoidDificilAcceso
    })

  const demandMs =
    performance.now() -
    demandStartedAt

  const points =
    demand.points

  if (
    !points.length
  ) {
    throw new IntegralPlanningGatewayError(
      'No se encontraron destinos operativos con coordenadas para la demanda solicitada.',
      {
        code:
          'INTEGRAL_NO_DEMAND',

        statusCode:
          404,

        details: {
          estado,

          proyecto,

          regionSanitaria,

          scope,

          avoidDificilAcceso
        }
      }
    )
  }

  /**
   * ==========================================================
   * PLANNING
   * ==========================================================
   */

  const warnings =
    []

  const planningStartedAt =
    performance.now()

  let execution

  if (
    routeMode ===
    INTEGRAL_ROUTE_MODES
      .ROUND_TRIP
  ) {
    execution =
      await executeRoundTripPlanning({
        origin:
          originConfig.origin,

        points,

        planningDate:
          originConfig
            .planningDate,

        timeZone:
          originConfig
            .timeZone,

        policy:
          originConfig
            .roundTripPolicy,

        avoidTolls,

        maxSolverCalls,

        warnings
      })
  } else if (
    routeMode ===
    INTEGRAL_ROUTE_MODES
      .FOREIGN_ROUTE
  ) {
    execution =
      await executeForeignPlanning({
        origin:
          originConfig.origin,

        points,

        planningDate:
          originConfig
            .planningDate,

        timeZone:
          originConfig
            .timeZone,

        policy:
          originConfig
            .foreignPolicy,

        avoidTolls,

        maxSolverCalls,

        warnings
      })
  } else if (
    routeMode ===
    INTEGRAL_ROUTE_MODES
      .HYBRID_PROJECT
  ) {
    execution =
      await executeHybridProjectPlanning({
        origin:
          originConfig.origin,

        points,

        planningDate:
          originConfig
            .planningDate,

        timeZone:
          originConfig
            .timeZone,

        roundTripPolicy:
          originConfig
            .roundTripPolicy,

        foreignPolicy:
          originConfig
            .foreignPolicy,

        avoidTolls,

        maxSolverCalls,

        warnings
      })
  } else {
    throw new IntegralPlanningGatewayError(
      `routeMode no soportado por ${INTEGRAL_MOTOR_MODE}: ${String(routeMode)}`,
      {
        code:
          'INTEGRAL_ROUTE_MODE_NOT_SUPPORTED',

        statusCode:
          400,

        details: {
          routeMode
        }
      }
    )
  }

  const planningMs =
    performance.now() -
    planningStartedAt

  /**
   * ==========================================================
   * RESULT 1.3
   * ==========================================================
   */

  const planner =
    execution.planner

  const finalValidation =
    execution.finalValidation

  const routeQuality =
    execution.routeQuality

  const result =
    buildRecommendedPlanningResult({
      context: {
        area:
          'OPERACIONES',

        estado,

        proyecto,

        regionSanitaria,

        scope,

        cedisId:
          originConfig
            .cedis
            ?.id ??
          null,

        cedisName:
          originConfig
            .cedis
            ?.nombre ??
          null
      },

      engine: {
        executionMode:
          'STANDARD',

        routingProvider:
          'GOOGLE_ROUTES',

        optimizationProvider:
          'GOOGLE_ROUTE_OPTIMIZATION',

        resourcePlanningMode:
          'AUTO_REQUIREMENTS',

        routeModeAuthority:
          'USER_SELECTED_POLICY',

        trafficEnabled:
          true,

        tollsEnabled:
          false,

        fuelEnabled:
          false
      },

      request: {
        strategy:
          normalizeOptionalText(
            body.strategy
          ) ||
          'FASTEST',

        routeMode,

        resourcePlanningMode:
          'AUTO_REQUIREMENTS',

        routeModeAuthority:
          'USER_SELECTED_POLICY',

        /*
         * Deliberadamente NO copiamos:
         *
         * operatorCount
         * foreignOperatorsPerRoute
         * requestedRouteCount
         *
         * porque dejaron de ser inputs
         * del planning base.
         */
        operatorCountRequested:
          null,

        operatorCountUsed:
          null,

        requestedRouteCount:
          null,

        returnToOrigin:
          true,

        avoidTolls,

        avoidDificilAcceso,

        maxForeignDays:
          routeMode ===
          INTEGRAL_ROUTE_MODES
            .FOREIGN_ROUTE
            ? originConfig
                .foreignPolicy
                .maxForeignDays
            : null
      },

      planner,

      finalValidation,

      routeQuality,

      demand: {
        totalDestinations:
          points.length
      },

      capacity:
        null,

      assignments: [],

      assignment:
        null,

      warnings,

      timings: {
        totalMs:
          performance.now() -
          startedAt,

        planningMs,

        validationMs:
          null,

        qualityMs:
          null
      },

      metadata: {
        motorMode:
          INTEGRAL_MOTOR_MODE,

        integrationMode:
          'DIRECT_INTEGRAL_PLANNING',

        legacyCoreUsed:
          false,

        planningDate:
          originConfig
            .planningDate,

        timeZone:
          originConfig
            .timeZone,

        originMode:
          originConfig
            .originMode,

        origin: {
          lat:
            originConfig
              .origin
              .lat,

          lng:
            originConfig
              .origin
              .lng
        },

        demandScope:
          scope,

        manualSubset:
          demand
            .hasManualSubset,

        demandCount:
          points.length,

        selectedCedisId:
          originConfig
            .cedis
            ?.id ??
          null,

        selectedCedisName:
          originConfig
            .cedis
            ?.nombre ??
          null,

        stages: {
          originMs:
            Math.round(
              originMs
            ),

          demandMs:
            Math.round(
              demandMs
            ),

          planningMs:
            Math.round(
              planningMs
            )
        },

        optionalModulesBlocking:
          false,

        operatorDatabaseRequired:
          false,

        vehicleDatabaseRequired:
          false
      }
    })

  return result
}

export default Object.freeze({
  computeIntegralPlanning,

  motorMode:
    INTEGRAL_MOTOR_MODE
})