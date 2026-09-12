// backend/scripts/validate-final-foreign-calvillo.js

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
  assertGoogleCloudAuthentication
} from '../routing/providers/googleCloudAuth.provider.js'

/**
 * ============================================================
 * F8A.6E.4
 * FOREIGN FINAL OPERATIONAL VALIDATION
 * ============================================================
 *
 * Ya sabemos por F8A.6E.3:
 *
 * Calvillo / FOREIGN_ROUTE
 *
 * → 1 expedición
 * → 1 operador
 * → 1 vehículo
 * → 3 días
 *
 * No volvemos a hacer búsqueda 1→2→...
 *
 * Ejecutamos:
 *
 * 1 FINAL_QUALITY
 * +
 * Google Routes validation.
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

  return (
    `${hours} h ${minutes} min`
  )
}

function formatLocalDateTime(
  value
) {
  if (!value) {
    return 'N/D'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value)
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      timeZone:
        CONFIG.timeZone,

      year:
        'numeric',

      month:
        '2-digit',

      day:
        '2-digit',

      hour:
        '2-digit',

      minute:
        '2-digit',

      hour12:
        false
    }
  ).format(date)
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
          BTRIM(f.proyecto)
        )
        =
        UPPER(
          BTRIM($1)
        )

        AND

        UPPER(
          BTRIM(f.estado)
        )
        =
        UPPER(
          BTRIM($2)
        )

        AND

        UPPER(
          BTRIM(f.region_sanitaria)
        )
        =
        UPPER(
          BTRIM($3)
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
          null
      }
    })
  )
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
 * DAY PRINT
 * ============================================================
 */

function printDay({
  day,
  route,
  lookup
}) {
  console.log(
    `\n  DÍA ${day.day} — ${day.date}`
  )

  console.log(
    `  Estado:          ${day.status}`
  )

  console.log(
    `  Entregas:        ${day.visitCount}`
  )

  console.log(
    `  Última llegada:  ${formatLocalDateTime(
      day.lastArrivalTime
    )}`
  )

  for (
    const visit
    of day.visits
  ) {
    const point =
      lookup.get(
        visit.pointKey
      )

    console.log(
      `    ${
        point
          ?.meta
          ?.clues ||
        visit.pointKey
      } — ${
        point
          ?.meta
          ?.unidad ||
        'SIN NOMBRE'
      }`
    )

    console.log(
      `      llegada: ${
        formatLocalDateTime(
          visit.startTime
        )
      }`
    )

    console.log(
      `      llegada válida: ${
        visit.arrivalWithinWindow
          ? 'SÍ'
          : 'NO'
      }`
    )

    console.log(
      `      servicio dentro cierre duro: ${
        visit.serviceEndsBeforeHardClose
          ? 'SÍ'
          : 'NO'
      }`
    )
  }
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
      ' F8A.6E.4 — FOREIGN FINAL VALIDATION'
    )

    console.log(
      '=================================================='
    )

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

    console.log(
      '\nCargando demanda...'
    )

    const points =
      await loadPoints()

    if (!points.length) {
      throw new Error(
        'No se encontraron destinos.'
      )
    }

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

      fixedValidatedResourceCount:
        CONFIG.requiredResources
    })

    /**
     * ========================================================
     * ONE FINAL QUALITY
     * ========================================================
     */

    console.log(
      '\nEjecutando una sola optimización FOREIGN FINAL_QUALITY...'
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

        usedResources:
          optimized.usedResourceCount,

        routeCount:
          optimized.routes.length,

        maxDaysUsed:
          optimized.maxDaysUsed,

        coveragePercent:
          optimized.coveragePercent,

        skipped:
          optimized.skippedPointKeys.length,

        missing:
          optimized.missingPointKeys.length,

        duplicated:
          optimized.duplicatedPointKeys.length
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
        'FINAL_QUALITY FOREIGN no fue factible.'
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

      routes:
        optimized.routes
    }

    /**
     * ========================================================
     * FINAL VALIDATION
     * ========================================================
     */

    console.log(
      '\nValidando operación multiday + Google Routes...'
    )

    const validation =
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
      '\n=================================================='
    )

    console.log(
      ' RESULTADO FINAL'
    )

    console.log(
      '=================================================='
    )

    console.dir(
      {
        status:
          validation.status,

        verified:
          validation.verified,

        basePlanUsable:
          validation.basePlanUsable,

        routeCount:
          validation.routeCount,

        verifiedRoutes:
          validation.verifiedRouteCount,

        partialRoutes:
          validation.partialRouteCount,

        infeasibleRoutes:
          validation.infeasibleRouteCount,

        requiredDays:
          validation.requiredDays,

        normalDays:
          validation.normalDays,

        extendedCloseDays:
          validation.extendedCloseDays,

        infeasibleDays:
          validation.infeasibleDays,

        roadDistance:
          formatKm(
            validation
              ?.totals
              ?.distanceMeters
          ),

        roadDrivingTime:
          formatDuration(
            validation
              ?.totals
              ?.travelDurationSeconds
          )
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

    validation.routes.forEach(
      (
        result,
        index
      ) => {
        const sourceRoute =
          plan.routes[
            index
          ]

        console.log(
          '\n=================================================='
        )

        console.log(
          ` EXPEDICIÓN ${index + 1}`
        )

        console.log(
          '=================================================='
        )

        console.log(
          `Estado:                   ${result.status}`
        )

        console.log(
          `Verificada:               ${
            result.verified
              ? 'SÍ'
              : 'NO'
          }`
        )

        console.log(
          `Destinos:                 ${result.stopCount}`
        )

        console.log(
          `Días:                     ${result.requiredDays}`
        )

        console.log(
          `Inicio:                   ${formatLocalDateTime(
            result
              ?.schedule
              ?.expeditionStartTime
          )}`
        )

        console.log(
          `Regreso final CEDIS:      ${formatLocalDateTime(
            result
              ?.schedule
              ?.expeditionEndTime
          )}`
        )

        console.log(
          `Breaks esperados mínimo: ${result.schedule.expectedMinimumBreaks}`
        )

        console.log(
          `Breaks recibidos:         ${result.schedule.receivedBreaks}`
        )

        console.log(
          ''
        )

        console.log(
          'ROUTE OPTIMIZATION'
        )

        console.log(
          `  Distancia:       ${formatKm(
            result
              ?.optimization
              ?.distanceMeters
          )}`
        )

        console.log(
          `  Conducción:      ${formatDuration(
            result
              ?.optimization
              ?.travelDurationSeconds
          )}`
        )

        console.log(
          ''
        )

        console.log(
          'GOOGLE ROUTES'
        )

        console.log(
          `  Verificada:      ${
            result
              ?.roadValidation
              ?.verified
              ? 'SÍ'
              : 'NO'
          }`
        )

        console.log(
          `  Chunks:          ${result
            ?.roadValidation
            ?.chunkCount}`
        )

        console.log(
          `  Distancia:       ${formatKm(
            result
              ?.roadValidation
              ?.distanceMeters
          )}`
        )

        console.log(
          `  Conducción:      ${formatDuration(
            result
              ?.roadValidation
              ?.travelDurationSeconds
          )}`
        )

        console.log(
          ''
        )

        console.log(
          'COMPARACIÓN'
        )

        console.log(
          `  Δ distancia:     ${
            result
              ?.comparison
              ?.distanceDeltaPercent ??
            'N/D'
          }%`
        )

        console.log(
          `  Δ conducción:    ${
            result
              ?.comparison
              ?.travelDeltaPercent ??
            'N/D'
          }%`
        )

        console.log(
          ''
        )

        console.log(
          'JORNADAS'
        )

        for (
          const day
          of result.schedule.days
        ) {
          printDay({
            day,
            route:
              sourceRoute,
            lookup
          })
        }

        if (
          result.warnings.length
        ) {
          console.log(
            '\nADVERTENCIAS'
          )

          console.dir(
            result.warnings,
            {
              depth:
                null
            }
          )
        }

        if (
          result.errors.length
        ) {
          console.log(
            '\nERRORES'
          )

          console.dir(
            result.errors,
            {
              depth:
                null
            }
          )
        }
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
      ' VEREDICTO F8A.6E.4'
    )

    console.log(
      '=================================================='
    )

    console.log(
      `Cobertura Optimization: ${
        optimized.coveragePercent ===
          100
          ? '100% ✓'
          : `${optimized.coveragePercent}%`
      }`
    )

    console.log(
      `Validación FOREIGN: ${
        validation.verified
          ? 'VERIFIED ✓'
          : validation.status
      }`
    )

    console.log(
      `Días requeridos: ${validation.requiredDays}`
    )

    console.log(
      `Normal days: ${validation.normalDays}`
    )

    console.log(
      `Extended close days: ${validation.extendedCloseDays}`
    )

    console.log(
      `Infeasible days: ${validation.infeasibleDays}`
    )

    if (
      optimized.coveragePercent ===
        100 &&
      validation.verified
    ) {
      console.log(
        '\nF8A.6E.4 — FOREIGN OPERATIVO VALIDADO ✓'
      )
    } else {
      console.log(
        '\nF8A.6E.4 requiere revisión.'
      )

      exitCode =
        2
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
      ' ERROR F8A.6E.4'
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