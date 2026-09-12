// backend/scripts/diagnose-foreign-quality-calvillo-20260828.js

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

const CONFIG = Object.freeze({
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
      -102.2915677
  },

  planningDate:
    '2026-08-28',

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

  return `${(
    value /
    1000
  ).toFixed(1)} km`
}

async function loadPoints() {
  const {
    rows
  } =
    await pool.query(
      `
      SELECT
        f.id,
        f.clues,
        f.unidad,
        f.direccion,
        f.latitud,
        f.longitud,
        f.region_sanitaria,
        f.estado,
        f.proyecto

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
        UPPER(BTRIM(f.proyecto))
        =
        UPPER(BTRIM($1))

        AND
        UPPER(BTRIM(f.estado))
        =
        UPPER(BTRIM($2))

        AND
        UPPER(BTRIM(f.region_sanitaria))
        =
        UPPER(BTRIM($3))

        AND
        COALESCE(
          UPPER(
            f.estatus::text
          ),
          ''
        )
        <>
        'INACTIVA'

        ${
          CONFIG.avoidDificilAcceso
            ? 'AND fda.clues IS NULL'
            : ''
        }

      ORDER BY
        f.clues
      `,
      [
        CONFIG.proyecto,
        CONFIG.estado,
        CONFIG.region
      ]
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
          null
      }
    })
  )
}

async function main() {
  let exitCode =
    0

  try {
    console.log(
      '\n=================================================='
    )

    console.log(
      ' DIAGNÓSTICO FOREIGN QUALITY — 2026-08-28'
    )

    console.log(
      '=================================================='
    )

    const auth =
      await assertGoogleCloudAuthentication()

    console.log(
      '\nOAuth/ADC'
    )

    console.log({
      projectId:
        auth.projectId,

      tokenAvailable:
        auth.tokenAvailable
    })

    const points =
      await loadPoints()

    console.log(
      '\nDEMANDA'
    )

    console.log({
      totalUnits:
        points.length,

      estado:
        CONFIG.estado,

      proyecto:
        CONFIG.proyecto,

      region:
        CONFIG.region,

      planningDate:
        CONFIG.planningDate
    })

    if (
      points.length !==
      19
    ) {
      console.warn(
        `ADVERTENCIA: esperábamos 19 destinos y se obtuvieron ${points.length}.`
      )
    }

    console.log(
      '\nEjecutando FINAL_QUALITY...'
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

        routes:
          optimized.routes.length,

        usedResources:
          optimized.usedResourceCount,

        maxDaysUsed:
          optimized.maxDaysUsed,

        coveragePercent:
          optimized.coveragePercent,

        missing:
          optimized
            .missingPointKeys
            .length,

        duplicated:
          optimized
            .duplicatedPointKeys
            .length,

        skipped:
          optimized
            .skippedPointKeys
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
        'FINAL_QUALITY no produjo una solución factible.'
      )
    }

    const plan = {
      feasible:
        true,

      routeMode:
        'FOREIGN_ROUTE',

      requiredRoutes:
        optimized.usedResourceCount,

      requiredOperators:
        optimized.usedResourceCount,

      requiredVehicles:
        optimized.usedResourceCount,

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

    console.log(
      '\nValidando Google Routes...'
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

        roadTravelSeconds:
          finalValidation
            ?.totals
            ?.travelDurationSeconds
      },
      {
        depth:
          null
      }
    )

    console.log(
      '\nEvaluando Foreign Route Quality...'
    )

    const quality =
      evaluateForeignPlanRouteQuality({
        origin:
          CONFIG.origin,

        points,

        plan,

        finalValidation
      })

    console.log(
      '\n=================================================='
    )

    console.log(
      ' QUALITY GENERAL'
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

    quality.routes.forEach(
      (
        route,
        index
      ) => {
        console.log(
          '\n=================================================='
        )

        console.log(
          ` EXPEDICIÓN ${index + 1}`
        )

        console.log(
          '=================================================='
        )

        console.log({
          status:
            route.status,

          acceptable:
            route.acceptable,

          stopCount:
            route.stopCount,

          dayCount:
            route.dayCount
        })

        console.log(
          '\nMÉTRICAS'
        )

        console.dir(
          route.metrics,
          {
            depth:
              null
          }
        )

        console.log(
          '\nCALIDAD POR DÍA'
        )

        console.dir(
          route.days,
          {
            depth:
              null
          }
        )

        console.log(
          '\nTRANSICIONES NOCTURNAS'
        )

        console.dir(
          route
            .overnightTransitions,
          {
            depth:
              null
          }
        )

        console.log(
          '\nFLAGS COMPLETOS'
        )

        if (
          !route.flags.length
        ) {
          console.log(
            'NINGUNO'
          )
        } else {
          console.dir(
            route.flags,
            {
              depth:
                null
            }
          )
        }
      }
    )

    console.log(
      '\n=================================================='
    )

    console.log(
      ' VEREDICTO'
    )

    console.log(
      '=================================================='
    )

    if (
      quality.status ===
      'PASS'
    ) {
      console.log(
        'PASS ✓'
      )
    } else if (
      quality.status ===
      'REVIEW'
    ) {
      console.log(
        'REVIEW — revisar FLAGS anteriores.'
      )

      /*
       * No marcamos esto como error de ejecución.
       * REVIEW es un resultado válido.
       */
    } else {
      console.log(
        quality.status
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
      '\nERROR:'
    )

    console.error(
      error
    )
  } finally {
    try {
      await pool.end()
    } catch {}

    process.exitCode =
      exitCode
  }
}

await main()