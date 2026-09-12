// backend/scripts/evaluate-route-quality-calvillo.js

import { pool } from '../db/pool.js'

import {
  solveGoogleRoundTripScenarioOAuth
} from '../routing/providers/googleOptimizationOAuth.provider.js'

import {
  validateRoundTripPlanWithGoogleRoutes
} from '../routing/services/routeFinalValidation.service.js'

import {
  evaluatePlanRouteQuality
} from '../routing/services/routeQuality.service.js'

import {
  assertGoogleCloudAuthentication
} from '../routing/providers/googleCloudAuth.provider.js'

/**
 * ============================================================
 * F8A.6F.1
 * ROUTE QUALITY — CASO REAL CALVILLO
 * ============================================================
 *
 * Flujo:
 *
 * PostgreSQL
 *      ↓
 * Route Optimization FINAL_QUALITY
 *      ↓
 * Google Routes Final Validation
 *      ↓
 * Route Quality Validator
 *
 * Objetivo:
 *
 * comprobar que las tres rutas reales:
 *
 * - tienen 100% cobertura
 * - son operativamente factibles
 * - tienen carretera validada
 * - son territorialmente coherentes
 *
 * Ningún operador ni vehículo registrado
 * es requisito para esta prueba.
 */

const CONFIG =
  Object.freeze({
    estado:
      'Aguascalientes',

    proyecto:
      'Aguascalientes',

    region:
      'Calvillo',

    origin: {
      lat:
        21.8852562,

      lng:
        -102.29156770000002
    },

    requiredResources:
      3,

    avoidDificilAcceso:
      true,

    avoidTolls:
      false,

    workday: {
      shiftHours:
        8,

      serviceMinutesPerUnit:
        45,

      startClock:
        '08:00',

      lastArrivalClock:
        '16:00',

      returnGraceMinutes:
        90,

      maxReturnGraceMinutes:
        120,

      timeZone:
        'America/Mexico_City'
    }
  })

/**
 * ============================================================
 * FORMAT
 * ============================================================
 */

function formatNumber(
  value,
  decimals = 1
) {
  const number =
    Number(value)

  if (
    !Number.isFinite(number)
  ) {
    return 'N/D'
  }

  return number.toLocaleString(
    'es-MX',
    {
      minimumFractionDigits:
        decimals,

      maximumFractionDigits:
        decimals
    }
  )
}

function formatKm(
  meters
) {
  const value =
    Number(meters)

  if (
    !Number.isFinite(value)
  ) {
    return 'N/D'
  }

  return (
    `${formatNumber(
      value / 1000,
      1
    )} km`
  )
}

/**
 * ============================================================
 * DEMANDA
 * ============================================================
 */

async function loadPoints() {
  const params = [
    CONFIG.proyecto,
    CONFIG.estado,
    CONFIG.region
  ]

  const difficultClause =
    CONFIG
      .avoidDificilAcceso
      ? `
        AND
          fda.clues IS NULL
        `
      : ''

  const {
    rows
  } =
    await pool.query(
      `
      SELECT
        f.id,
        f.clues,
        f.unidad,
        f.region_sanitaria,
        f.estatus::text AS estatus,
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
        f.latitud IS NOT NULL

        AND

        f.longitud IS NOT NULL

        AND

        UPPER(
          BTRIM(
            f.proyecto
          )
        )
        =
        UPPER(
          BTRIM(
            $1
          )
        )

        AND

        UPPER(
          BTRIM(
            f.estado
          )
        )
        =
        UPPER(
          BTRIM(
            $2
          )
        )

        AND

        UPPER(
          BTRIM(
            f.region_sanitaria
          )
        )
        =
        UPPER(
          BTRIM(
            $3
          )
        )

        AND

        COALESCE(
          UPPER(
            f.estatus::text
          ),
          ''
        )
        <>
        'INACTIVA'

        ${difficultClause}

      ORDER BY
        f.clues
      `,
      params
    )

  return rows.map(
    row => ({
      id:
        Number(row.id),

      __plannerKey:
        `id:${Number(row.id)}`,

      lat:
        Number(row.latitud),

      lng:
        Number(row.longitud),

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

        region:
          row.region_sanitaria ||
          null,

        estado:
          row.estado ||
          null,

        proyecto:
          row.proyecto ||
          null
      }
    })
  )
}

function validatePoints(
  points
) {
  if (
    !Array.isArray(points) ||
    !points.length
  ) {
    throw new Error(
      'No existen unidades para evaluar.'
    )
  }

  const invalid =
    points.filter(
      point =>
        !Number.isFinite(
          point.lat
        ) ||
        !Number.isFinite(
          point.lng
        ) ||
        point.lat < -90 ||
        point.lat > 90 ||
        point.lng < -180 ||
        point.lng > 180
    )

  if (
    invalid.length
  ) {
    throw new Error(
      `${invalid.length} unidad(es) contienen coordenadas inválidas.`
    )
  }
}

function buildLookup(
  points
) {
  return new Map(
    points.map(
      point => [
        point.__plannerKey,
        point
      ]
    )
  )
}

/**
 * ============================================================
 * PRINT ROUTE QUALITY
 * ============================================================
 */

function printRouteQuality({
  quality,
  plannedRoute,
  validatedRoute,
  routeIndex,
  lookup
}) {
  console.log(
    '\n=================================================='
  )

  console.log(
    ` RUTA ${routeIndex + 1} — ${quality.status}`
  )

  console.log(
    '=================================================='
  )

  console.log(
    `Aceptable:                    ${
      quality.acceptable
        ? 'SÍ'
        : 'NO'
    }`
  )

  console.log(
    `Unidades:                     ${quality.stopCount}`
  )

  console.log(
    `Distancia carretera:          ${formatKm(
      quality
        ?.metrics
        ?.roadDistanceMeters
    )}`
  )

  console.log(
    `Radio máximo desde origen:    ${formatKm(
      quality
        ?.metrics
        ?.maxRadiusMeters
    )}`
  )

  console.log(
    `Span territorial:             ${
      quality
        ?.metrics
        ?.bearingSpanDegrees ??
      'N/D'
    }°`
  )

  console.log(
    `Mayor salto entre unidades:   ${formatKm(
      quality
        ?.metrics
        ?.maximumStopJumpMeters
    )}`
  )

  console.log(
    `Salto mediano:                ${formatKm(
      quality
        ?.metrics
        ?.medianStopJumpMeters
    )}`
  )

  console.log(
    `Ratio salto máx/mediano:      ${
      quality
        ?.metrics
        ?.maximumToMedianJumpRatio ??
      'N/D'
    }`
  )

  console.log(
    `Backtracking radial:          ${
      quality
        ?.metrics
        ?.radialOscillationCount ??
      0
    }`
  )

  console.log(
    `Reversiones fuertes:          ${
      quality
        ?.metrics
        ?.severeTurnCount ??
      0
    }`
  )

  console.log(
    `Recruces corredor origen:     ${
      quality
        ?.metrics
        ?.midRouteOriginRecrossings ??
      0
    }`
  )

  console.log(
    `Detour carretera/geodésico:   ${
      quality
        ?.metrics
        ?.roadDetourRatio ??
      'N/D'
    }`
  )

  console.log(
    `Deadhead ratio:               ${
      quality
        ?.metrics
        ?.deadheadRatio ??
      'N/D'
    }`
  )

  console.log(
    `Estado jornada:               ${
      validatedRoute
        ?.schedule
        ?.workdayStatus ||
      'N/D'
    }`
  )

  console.log(
    `Margen retorno usado:         ${
      validatedRoute
        ?.schedule
        ?.graceUsedMinutes ??
      0
    } min`
  )

  /*
   * =========================================================
   * FLAGS
   * =========================================================
   */

  console.log('')

  if (
    Array.isArray(
      quality.flags
    ) &&
    quality.flags.length
  ) {
    console.log(
      'FLAGS:'
    )

    quality.flags.forEach(
      (
        flag,
        index
      ) => {
        console.log(
          `  ${index + 1}. ` +
          `[${flag.severity}] ` +
          `${flag.code}`
        )

        if (
          flag.message
        ) {
          console.log(
            `     ${flag.message}`
          )
        }

        if (
          flag.details
        ) {
          console.log(
            '     Detalles:'
          )

          console.dir(
            flag.details,
            {
              depth:
                null
            }
          )
        }
      }
    )
  } else {
    console.log(
      'FLAGS: ninguno ✓'
    )
  }

  /*
   * =========================================================
   * VISITAS
   * =========================================================
   */

  console.log(
    '\nORDEN DE VISITAS'
  )

  const keys =
    Array.isArray(
      plannedRoute
        ?.pointKeys
    )
      ? plannedRoute.pointKeys
      : []

  keys.forEach(
    (
      key,
      index
    ) => {
      const point =
        lookup.get(
          key
        )

      console.log(
        `  ${String(
          index + 1
        ).padStart(
          2,
          '0'
        )}. ` +
        `${
          point
            ?.meta
            ?.clues ||
          key
        } — ` +
        `${
          point
            ?.meta
            ?.unidad ||
          'SIN NOMBRE'
        }`
      )
    }
  )
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  let exitCode =
    0

  try {
    console.log(
      '\n=================================================='
    )

    console.log(
      ' F8A.6F.1 — ROUTE QUALITY CALVILLO'
    )

    console.log(
      '=================================================='
    )

    /*
     * ========================================================
     * AUTH
     * ========================================================
     */

    console.log(
      '\nComprobando OAuth/ADC...'
    )

    const auth =
      await assertGoogleCloudAuthentication()

    console.log({
      projectId:
        auth.projectId,

      tokenAvailable:
        auth.tokenAvailable
    })

    /*
     * ========================================================
     * DEMANDA
     * ========================================================
     */

    console.log(
      '\nCargando demanda...'
    )

    const points =
      await loadPoints()

    validatePoints(
      points
    )

    const lookup =
      buildLookup(
        points
      )

    console.log({
      estado:
        CONFIG.estado,

      proyecto:
        CONFIG.proyecto,

      region:
        CONFIG.region,

      units:
        points.length,

      requiredResources:
        CONFIG.requiredResources
    })

    /*
     * ========================================================
     * ROUTE OPTIMIZATION
     * ========================================================
     */

    console.log(
      '\nEjecutando FINAL_QUALITY...'
    )

    const optimized =
      await solveGoogleRoundTripScenarioOAuth({
        origin:
          CONFIG.origin,

        points,

        candidateResourceCount:
          CONFIG.requiredResources,

        maxActiveResources:
          CONFIG.requiredResources,

        workday:
          CONFIG.workday,

        solveMode:
          'FINAL_QUALITY',

        mandatoryCoverage:
          true,

        timeZone:
          CONFIG
            .workday
            .timeZone,

        avoidTolls:
          CONFIG
            .avoidTolls,

        considerRoadTraffic:
          true
      })

    if (
      !optimized.feasible
    ) {
      throw new Error(
        'Route Optimization no produjo un plan factible.'
      )
    }

    console.log({
      feasible:
        optimized.feasible,

      routes:
        optimized.routes.length,

      usedResources:
        optimized.usedResourceCount,

      skipped:
        optimized
          .skippedPointKeys
          ?.length ||
        0
    })

    /*
     * ========================================================
     * PLAN
     * ========================================================
     */

    const plan = {
      feasible:
        true,

      routeMode:
        'ROUND_TRIP',

      requiredRoutes:
        optimized
          .usedResourceCount,

      requiredOperators:
        optimized
          .usedResourceCount,

      requiredVehicles:
        optimized
          .usedResourceCount,

      requiredDays:
        1,

      routes:
        optimized.routes
    }

    /*
     * ========================================================
     * GOOGLE ROUTES
     * ========================================================
     */

    console.log(
      '\nValidando carretera con Google Routes...'
    )

    const finalValidation =
      await validateRoundTripPlanWithGoogleRoutes({
        plan,

        origin:
          CONFIG.origin,

        points,

        workday:
          CONFIG.workday,

        departureTime:
          optimized
            .routes?.[0]
            ?.vehicleStartTime ||
          null,

        routingPreference:
          'TRAFFIC_AWARE',

        avoidTolls:
          CONFIG
            .avoidTolls
      })

    console.log({
      status:
        finalValidation.status,

      verified:
        finalValidation.verified,

      verifiedRoutes:
        finalValidation
          .verifiedRouteCount,

      normalRoutes:
        finalValidation
          .normalRoutes,

      extendedReturnRoutes:
        finalValidation
          .extendedReturnRoutes,

      maxGraceUsedMinutes:
        finalValidation
          .maxGraceUsedMinutes
    })

    if (
      !finalValidation.verified
    ) {
      throw new Error(
        'Google Routes no verificó completamente el plan.'
      )
    }

    /*
     * ========================================================
     * ROUTE QUALITY
     * ========================================================
     */

    console.log(
      '\nEvaluando calidad territorial...'
    )

    const quality =
      evaluatePlanRouteQuality({
        origin:
          CONFIG.origin,

        plan,

        finalValidation,

        points
      })

    /*
     * ========================================================
     * RESUMEN
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' RESULTADO ROUTE QUALITY'
    )

    console.log(
      '=================================================='
    )

    console.log({
      status:
        quality.status,

      acceptable:
        quality.acceptable,

      routeCount:
        quality.routeCount,

      passed:
        quality.passedRouteCount,

      review:
        quality.reviewRouteCount,

      rejected:
        quality.rejectedRouteCount
    })

    /*
     * ========================================================
     * DETALLE
     * ========================================================
     */

    quality.routes.forEach(
      (
        routeQuality,
        index
      ) => {
        printRouteQuality({
          quality:
            routeQuality,

          plannedRoute:
            plan.routes[
              index
            ],

          validatedRoute:
            finalValidation
              .routes[
                index
              ],

          routeIndex:
            index,

          lookup
        })
      }
    )

    /*
     * ========================================================
     * VEREDICTO
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' VEREDICTO F8A.6F'
    )

    console.log(
      '=================================================='
    )

    if (
      quality.status ===
      'PASS'
    ) {
      console.log(
        'Calidad territorial: PASS ✓'
      )

      console.log(
        'Todas las rutas superaron las guardas iniciales.'
      )
    } else if (
      quality.status ===
      'REVIEW'
    ) {
      console.log(
        'Calidad territorial: REVIEW'
      )

      console.log(
        'El plan sigue siendo utilizable, pero existen señales que debemos revisar.'
      )
    } else if (
      quality.status ===
      'REJECT'
    ) {
      console.log(
        'Calidad territorial: REJECT'
      )

      console.log(
        'Una o más rutas deben ser reoptimizadas antes de convertirse en recomendación.'
      )

      exitCode =
        2
    } else {
      console.log(
        `Calidad territorial: ${quality.status}`
      )

      exitCode =
        3
    }
  } catch (
    error
  ) {
    exitCode =
      1

    console.error(
      '\n=================================================='
    )

    console.error(
      ' ERROR F8A.6F'
    )

    console.error(
      '=================================================='
    )

    console.error(
      error
    )

    if (
      error?.details
    ) {
      console.dir(
        error.details,
        {
          depth:
            null
        }
      )
    }
  } finally {
    try {
      await pool.end()
    } catch {}

    process.exitCode =
      exitCode
  }
}

await main()