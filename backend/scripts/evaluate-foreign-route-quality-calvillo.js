// backend/scripts/evaluate-foreign-route-quality-calvillo.js

import {
  pool
} from '../db/pool.js'

import {
  solveGoogleForeignScenarioOAuth
} from '../routing/providers/googleForeignOptimizationOAuth.provider.js'

import {
  validateForeignPlanWithGoogleRoutes
} from '../routing/services/foreignFinalValidation.service.js'

import {
  evaluateForeignPlanRouteQuality
} from '../routing/services/foreignRouteQuality.service.js'

import {
  assertGoogleCloudAuthentication
} from '../routing/providers/googleCloudAuth.provider.js'

/**
 * ============================================================
 * F8A.6E.6
 * FOREIGN ROUTE QUALITY — CALVILLO REAL
 * ============================================================
 *
 * Flujo:
 *
 * demanda real
 *      ↓
 * 1 FINAL_QUALITY
 *      ↓
 * Google Routes
 *      ↓
 * validación operativa FOREIGN
 *      ↓
 * calidad territorial FOREIGN
 *
 * No hacemos búsqueda automática de recursos:
 *
 * F8A.6E.3 ya demostró que:
 *
 * requiredRoutes    = 1
 * requiredOperators = 1
 * requiredVehicles  = 1
 * requiredDays      = 3
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

    planningDate:
      '2026-08-27',

    timeZone:
      'America/Mexico_City',

    requiredResources:
      1,

    avoidDificilAcceso:
      true,

    avoidTolls:
      false,

    foreignPolicy: {
      maxForeignDays:
        3,

      shiftHours:
        8,

      serviceMinutesPerUnit:
        45,

      startClock:
        '08:00',

      lastArrivalClock:
        '16:00',

      dayCloseTravelGraceMinutes:
        90
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
  const number =
    Number(meters)

  if (
    !Number.isFinite(number)
  ) {
    return 'N/D'
  }

  return `${formatNumber(
    number / 1000,
    1
  )} km`
}

function formatDuration(
  seconds
) {
  const number =
    Number(seconds)

  if (
    !Number.isFinite(number)
  ) {
    return 'N/D'
  }

  const total =
    Math.max(
      0,
      Math.round(number)
    )

  const hours =
    Math.floor(
      total /
      3600
    )

  const minutes =
    Math.floor(
      (
        total %
        3600
      ) /
      60
    )

  return `${hours} h ${minutes} min`
}

/**
 * ============================================================
 * DATABASE
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
        Number(
          row.id
        ),

      __plannerKey:
        `id:${Number(
          row.id
        )}`,

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

        regionSanitaria:
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
      'No se encontraron destinos.'
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
        )
    )

  if (
    invalid.length
  ) {
    throw new Error(
      `${invalid.length} destino(s) contienen coordenadas inválidas.`
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
 * PRINT DAY QUALITY
 * ============================================================
 */

function printDayQuality(
  day
) {
  console.log(
    `\n  DÍA ${day.day}${
      day.date
        ? ` — ${day.date}`
        : ''
    }`
  )

  console.log(
    `  Destinos:                     ${day.stopCount}`
  )

  console.log(
    `  Radio máximo desde CEDIS:     ${formatKm(
      day.maxRadiusMeters
    )}`
  )

  console.log(
    `  Span territorial:             ${
      day.bearingSpanDegrees ??
      'N/D'
    }°`
  )

  console.log(
    `  Mayor salto:                  ${formatKm(
      day.maximumJumpMeters
    )}`
  )

  console.log(
    `  Salto mediano:                ${formatKm(
      day.medianJumpMeters
    )}`
  )

  console.log(
    `  Ratio salto máximo/mediano:   ${
      day.maximumToMedianJumpRatio ??
      'N/D'
    }`
  )

  console.log(
    `  Reversiones fuertes:          ${day.severeTurnCount}`
  )

  console.log(
    `  Large jump:                   ${
      day.largeJump
        ? 'SÍ'
        : 'NO'
    }`
  )

  console.log(
    `  Multi-sector:                 ${
      day.multiSector
        ? 'SÍ'
        : 'NO'
    }`
  )
}

/**
 * ============================================================
 * PRINT FLAGS
 * ============================================================
 */

function printFlags(
  flags
) {
  if (
    !Array.isArray(flags) ||
    !flags.length
  ) {
    console.log(
      '\nFLAGS: ninguno ✓'
    )

    return
  }

  console.log(
    '\nFLAGS'
  )

  flags.forEach(
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
}

/**
 * ============================================================
 * PRINT SEQUENCE
 * ============================================================
 */

function printSequence({
  route,
  lookup
}) {
  console.log(
    '\nSECUENCIA COMPLETA'
  )

  route.pointKeys.forEach(
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
      ' F8A.6E.6 — FOREIGN ROUTE QUALITY CALVILLO'
    )

    console.log(
      '=================================================='
    )

    /**
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

    /**
     * ========================================================
     * DEMAND
     * ========================================================
     */

    console.log(
      '\nCargando demanda real...'
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

      totalUnits:
        points.length,

      routeMode:
        'FOREIGN_ROUTE',

      requiredResources:
        CONFIG.requiredResources,

      maxForeignDays:
        CONFIG
          .foreignPolicy
          .maxForeignDays
    })

    /**
     * ========================================================
     * ROUTE OPTIMIZATION
     * ========================================================
     */

    console.log(
      '\nEjecutando FOREIGN FINAL_QUALITY...'
    )

    const optimized =
      await solveGoogleForeignScenarioOAuth({
        origin:
          CONFIG.origin,

        points,

        candidateResourceCount:
          CONFIG.requiredResources,

        maxActiveResources:
          CONFIG.requiredResources,

        maxForeignDays:
          CONFIG
            .foreignPolicy
            .maxForeignDays,

        foreignPolicy:
          CONFIG.foreignPolicy,

        planningDate:
          CONFIG.planningDate,

        timeZone:
          CONFIG.timeZone,

        solveMode:
          'FINAL_QUALITY',

        mandatoryCoverage:
          true,

        avoidTolls:
          CONFIG.avoidTolls,

        considerRoadTraffic:
          true
      })

    console.log(
      '\nROUTE OPTIMIZATION'
    )

    console.dir(
      {
        feasible:
          optimized.feasible,

        routeCount:
          optimized.routes.length,

        usedResources:
          optimized.usedResourceCount,

        maxDaysUsed:
          optimized.maxDaysUsed,

        coveragePercent:
          optimized.coveragePercent,

        skipped:
          optimized
            .skippedPointKeys
            .length,

        missing:
          optimized
            .missingPointKeys
            .length,

        duplicated:
          optimized
            .duplicatedPointKeys
            .length
      },
      {
        depth:
          null
      }
    )

    if (
      !optimized.feasible
    ) {
      throw new Error(
        'FOREIGN FINAL_QUALITY no produjo una solución factible.'
      )
    }

    const plan = {
      feasible:
        true,

      routeMode:
        'FOREIGN_ROUTE',

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
        optimized.maxDaysUsed,

      coveragePercent:
        optimized.coveragePercent,

      allDestinationsAssigned:
        optimized
          .allDestinationsAssigned,

      routes:
        optimized.routes
    }

    /**
     * ========================================================
     * ROAD / OPERATIONAL VALIDATION
     * ========================================================
     */

    console.log(
      '\nValidando carretera y jornadas...'
    )

    const finalValidation =
      await validateForeignPlanWithGoogleRoutes({
        plan,

        origin:
          CONFIG.origin,

        points,

        foreignPolicy:
          CONFIG.foreignPolicy,

        timeZone:
          CONFIG.timeZone,

        avoidTolls:
          CONFIG.avoidTolls
      })

    console.log(
      '\nFINAL VALIDATION'
    )

    console.dir(
      {
        status:
          finalValidation.status,

        verified:
          finalValidation.verified,

        routeCount:
          finalValidation.routeCount,

        verifiedRoutes:
          finalValidation
            .verifiedRouteCount,

        requiredDays:
          finalValidation.requiredDays,

        normalDays:
          finalValidation.normalDays,

        extendedCloseDays:
          finalValidation
            .extendedCloseDays,

        infeasibleDays:
          finalValidation
            .infeasibleDays,

        roadDistance:
          formatKm(
            finalValidation
              ?.totals
              ?.distanceMeters
          ),

        roadDrivingTime:
          formatDuration(
            finalValidation
              ?.totals
              ?.travelDurationSeconds
          )
      },
      {
        depth:
          null
      }
    )

    if (
      !finalValidation.verified
    ) {
      throw new Error(
        `La validación FOREIGN previa a Route Quality terminó en ${finalValidation.status}.`
      )
    }

    /**
     * ========================================================
     * QUALITY
     * ========================================================
     */

    console.log(
      '\nEvaluando calidad territorial FOREIGN...'
    )

    const quality =
      evaluateForeignPlanRouteQuality({
        origin:
          CONFIG.origin,

        points,

        plan,

        finalValidation
      })

    /**
     * ========================================================
     * SUMMARY
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' RESULTADO FOREIGN ROUTE QUALITY'
    )

    console.log(
      '=================================================='
    )

    console.dir(
      {
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
      },
      {
        depth:
          null
      }
    )

    /**
     * ========================================================
     * DETAIL
     * ========================================================
     */

    quality.routes.forEach(
      (
        routeQuality,
        index
      ) => {
        const plannedRoute =
          plan.routes[
            index
          ]

        const validatedRoute =
          finalValidation
            .routes[
              index
            ]

        console.log(
          '\n=================================================='
        )

        console.log(
          ` EXPEDICIÓN ${index + 1} — ${routeQuality.status}`
        )

        console.log(
          '=================================================='
        )

        console.log(
          `Aceptable:                      ${
            routeQuality.acceptable
              ? 'SÍ'
              : 'NO'
          }`
        )

        console.log(
          `Destinos:                       ${routeQuality.stopCount}`
        )

        console.log(
          `Jornadas con entregas:          ${routeQuality.dayCount}`
        )

        console.log(
          `Radio máximo desde CEDIS:       ${formatKm(
            routeQuality
              ?.metrics
              ?.maxRadiusMeters
          )}`
        )

        console.log(
          `Corredor del origen:            ${formatKm(
            routeQuality
              ?.metrics
              ?.originCorridorMeters
          )}`
        )

        console.log(
          `Recruces prematuros CEDIS:      ${
            routeQuality
              ?.metrics
              ?.prematureOriginRecrossings ??
            0
          }`
        )

        console.log(
          `Backtracking radial:            ${
            routeQuality
              ?.metrics
              ?.radialOscillationCount ??
            0
          }`
        )

        console.log(
          `Salto diario típico:            ${formatKm(
            routeQuality
              ?.metrics
              ?.typicalDailyJumpMeters
          )}`
        )

        console.log(
          `Distancia carretera:            ${formatKm(
            routeQuality
              ?.metrics
              ?.roadDistanceMeters
          )}`
        )

        console.log(
          `Cadena geodésica:               ${formatKm(
            routeQuality
              ?.metrics
              ?.geodesicChainMeters
          )}`
        )

        console.log(
          `Road detour ratio:              ${
            routeQuality
              ?.metrics
              ?.roadDetourRatio ??
            'N/D'
          }`
        )

        /**
         * ====================================================
         * DAYS
         * ====================================================
         */

        console.log(
          '\nCALIDAD POR JORNADA'
        )

        routeQuality
          .days
          .forEach(
            printDayQuality
          )

        /**
         * ====================================================
         * OVERNIGHT
         * ====================================================
         */

        console.log(
          '\nTRANSICIONES ENTRE JORNADAS'
        )

        if (
          !routeQuality
            .overnightTransitions
            .length
        ) {
          console.log(
            '  No aplica.'
          )
        }

        routeQuality
          .overnightTransitions
          .forEach(
            transition => {
              console.log(
                `  Día ${transition.fromDay} → Día ${transition.toDay}`
              )

              console.log(
                `    distancia: ${formatKm(
                  transition.distanceMeters
                )}`
              )

              console.log(
                `    ratio vs salto típico: ${
                  transition.ratioToTypicalJump ??
                  'N/D'
                }`
              )

              console.log(
                `    sospechosa: ${
                  transition.suspicious
                    ? 'SÍ'
                    : 'NO'
                }`
              )
            }
          )

        /**
         * ====================================================
         * FLAGS
         * ====================================================
         */

        printFlags(
          routeQuality.flags
        )

        /**
         * ====================================================
         * SEQUENCE
         * ====================================================
         */

        printSequence({
          route:
            plannedRoute,

          lookup
        })

        /**
         * ====================================================
         * OPERATIONAL CONTEXT
         * ====================================================
         */

        console.log(
          '\nCONTEXTO OPERATIVO'
        )

        console.log(
          `  Validación carretera: ${
            validatedRoute
              ?.roadValidation
              ?.verified
              ? 'VERIFIED'
              : 'NO VERIFICADA'
          }`
        )

        console.log(
          `  Jornadas normales: ${
            validatedRoute
              ?.schedule
              ?.normalDays ??
            0
          }`
        )

        console.log(
          `  Jornadas extended close: ${
            validatedRoute
              ?.schedule
              ?.extendedCloseDays ??
            0
          }`
        )

        console.log(
          `  Jornadas infeasibles: ${
            validatedRoute
              ?.schedule
              ?.infeasibleDays ??
            0
          }`
        )
      }
    )

    /**
     * ========================================================
     * VERDICT
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' VEREDICTO F8A.6E.6'
    )

    console.log(
      '=================================================='
    )

    if (
      quality.status ===
      'PASS'
    ) {
      console.log(
        'FOREIGN ROUTE QUALITY: PASS ✓'
      )

      console.log(
        'La expedición real supera las guardas territoriales.'
      )
    } else if (
      quality.status ===
      'REVIEW'
    ) {
      console.log(
        'FOREIGN ROUTE QUALITY: REVIEW'
      )

      console.log(
        'La expedición es utilizable, pero existen señales territoriales que deben revisarse.'
      )

      exitCode =
        2
    } else if (
      quality.status ===
      'REJECT'
    ) {
      console.log(
        'FOREIGN ROUTE QUALITY: REJECT'
      )

      console.log(
        'La expedición no debe convertirse todavía en recomendación.'
      )

      exitCode =
        3
    } else {
      console.log(
        `FOREIGN ROUTE QUALITY: ${quality.status}`
      )

      exitCode =
        4
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
      ' ERROR F8A.6E.6'
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
      console.log(
        '\nDetalles:'
      )

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