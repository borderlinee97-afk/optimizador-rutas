// backend/scripts/diagnose-foreign-turns-calvillo-20260828.js

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
  evaluateForeignPlanRouteQuality,
  haversineMeters,
  bearingDegrees
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

function km(
  meters
) {
  const value =
    Number(meters)

  return Number.isFinite(value)
    ? Number(
        (
          value /
          1000
        ).toFixed(2)
      )
    : null
}

function degrees(
  value
) {
  const number =
    Number(value)

  return Number.isFinite(number)
    ? Number(
        number.toFixed(1)
      )
    : null
}

function angularDifference(
  a,
  b
) {
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  ) {
    return null
  }

  const difference =
    Math.abs(
      a -
      b
    ) %
    360

  return Math.min(
    difference,
    360 -
      difference
  )
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
        f.longitud

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

        AND
        fda.clues IS NULL

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

function printPoint(
  label,
  point
) {
  console.log(
    `${label}: ${point?.meta?.clues || point?.__plannerKey}`
  )

  console.log(
    `    ${point?.meta?.unidad || 'SIN NOMBRE'}`
  )

  console.log(
    `    lat=${point?.lat}, lng=${point?.lng}`
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
      ' DIAGNÓSTICO REVERSALS FOREIGN — CALVILLO'
    )

    console.log(
      '=================================================='
    )

    const auth =
      await assertGoogleCloudAuthentication()

    console.log({
      projectId:
        auth.projectId,

      tokenAvailable:
        auth.tokenAvailable
    })

    const points =
      await loadPoints()

    const lookup =
      buildLookup(
        points
      )

    console.log({
      totalUnits:
        points.length,

      planningDate:
        CONFIG.planningDate
    })

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
          false,

        considerRoadTraffic:
          true
      })

    if (
      !optimized.feasible
    ) {
      throw new Error(
        'FINAL_QUALITY no fue factible.'
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
          false
      })

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
      ' RESUMEN'
    )

    console.log(
      '=================================================='
    )

    console.dir(
      {
        optimizationFeasible:
          optimized.feasible,

        roadVerified:
          finalValidation.verified,

        qualityStatus:
          quality.status,

        acceptable:
          quality.acceptable
      },
      {
        depth:
          null
      }
    )

    const route =
      plan.routes[0]

    const qualityRoute =
      quality.routes[0]

    console.log(
      '\n=================================================='
    )

    console.log(
      ' SECUENCIA POR DÍA'
    )

    console.log(
      '=================================================='
    )

    route.days.forEach(
      day => {
        console.log(
          `\nDÍA ${day.day} — ${day.date}`
        )

        day.pointKeys.forEach(
          (
            key,
            index
          ) => {
            const point =
              lookup.get(
                key
              )

            console.log(
              `${String(
                index + 1
              ).padStart(
                2,
                '0'
              )}. ${
                point
                  ?.meta
                  ?.clues ||
                key
              } — ${
                point
                  ?.meta
                  ?.unidad ||
                'SIN NOMBRE'
              }`
            )
          }
        )
      }
    )

    const warning =
      qualityRoute
        .flags
        .find(
          flag =>
            flag.code ===
            'DAILY_SEVERE_DIRECTION_REVERSAL'
        )

    console.log(
      '\n=================================================='
    )

    console.log(
      ' REVERSALS DETECTADAS'
    )

    console.log(
      '=================================================='
    )

    if (
      !warning
    ) {
      console.log(
        'Esta ejecución no produjo DAILY_SEVERE_DIRECTION_REVERSAL.'
      )

      console.log(
        'Esto también es un dato importante: el solver encontró otra solución.'
      )

      return
    }

    console.dir(
      warning,
      {
        depth:
          null
      }
    )

    const warningDayNumber =
      warning
        ?.details
        ?.day

    const plannedDay =
      route.days.find(
        day =>
          Number(day.day) ===
          Number(
            warningDayNumber
          )
      )

    if (
      !plannedDay
    ) {
      throw new Error(
        `No encontré el día ${warningDayNumber} dentro de route.days.`
      )
    }

    const dayPoints =
      plannedDay
        .pointKeys
        .map(
          key =>
            lookup.get(key)
        )
        .filter(Boolean)

    for (
      const turn
      of warning
        .details
        .turns
    ) {
      const index =
        Number(
          turn.index
        )

      const previous =
        dayPoints[
          index -
          1
        ]

      const current =
        dayPoints[
          index
        ]

      const next =
        dayPoints[
          index +
          1
        ]

      console.log(
        '\n--------------------------------------------------'
      )

      console.log(
        `REVERSAL EN ÍNDICE ${index}`
      )

      console.log(
        '--------------------------------------------------'
      )

      printPoint(
        'ANTERIOR',
        previous
      )

      printPoint(
        'ACTUAL',
        current
      )

      printPoint(
        'SIGUIENTE',
        next
      )

      const firstDistance =
        haversineMeters(
          previous,
          current
        )

      const secondDistance =
        haversineMeters(
          current,
          next
        )

      const firstBearing =
        bearingDegrees(
          previous,
          current
        )

      const secondBearing =
        bearingDegrees(
          current,
          next
        )

      const change =
        angularDifference(
          firstBearing,
          secondBearing
        )

      const previousRadius =
        haversineMeters(
          CONFIG.origin,
          previous
        )

      const currentRadius =
        haversineMeters(
          CONFIG.origin,
          current
        )

      const nextRadius =
        haversineMeters(
          CONFIG.origin,
          next
        )

      console.log(
        '\nGEOMETRÍA'
      )

      console.dir(
        {
          anteriorActualKm:
            km(
              firstDistance
            ),

          actualSiguienteKm:
            km(
              secondDistance
            ),

          bearingEntrada:
            degrees(
              firstBearing
            ),

          bearingSalida:
            degrees(
              secondBearing
            ),

          cambioDireccion:
            degrees(
              change
            ),

          radioAnteriorCediskm:
            km(
              previousRadius
            ),

          radioActualCediskm:
            km(
              currentRadius
            ),

          radioSiguienteCediskm:
            km(
              nextRadius
            )
        },
        {
          depth:
            null
        }
      )
    }

    console.log(
      '\n=================================================='
    )

    console.log(
      ' INDICADORES CORROBORANTES'
    )

    console.log(
      '=================================================='
    )

    console.dir(
      {
        prematureOriginRecrossings:
          qualityRoute
            ?.metrics
            ?.prematureOriginRecrossings,

        radialOscillationCount:
          qualityRoute
            ?.metrics
            ?.radialOscillationCount,

        roadDetourRatio:
          qualityRoute
            ?.metrics
            ?.roadDetourRatio,

        days:
          qualityRoute.days.map(
            day => ({
              day:
                day.day,

              bearingSpanDegrees:
                day
                  .bearingSpanDegrees,

              largeJump:
                day.largeJump,

              multiSector:
                day.multiSector,

              severeTurnCount:
                day
                  .severeTurnCount
            })
          )
      },
      {
        depth:
          null
      }
    )
  } catch (
    error
  ) {
    exitCode =
      1

    console.error(
      '\nERROR'
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