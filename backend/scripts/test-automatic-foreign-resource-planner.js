// backend/scripts/test-automatic-foreign-resource-planner.js

import {
  planAutomaticForeignResources,
  summarizeAutomaticForeignPlan
} from '../routing/services/automaticForeignResourcePlanner.service.js'

/**
 * ============================================================
 * F8A.6E.1
 * SMOKE TEST AUTOMATIC FOREIGN RESOURCE PLANNER
 * ============================================================
 *
 * Simulación:
 *
 * 19 destinos
 *
 * 1 expedición:
 * necesita 4 días
 * → NO cumple maxForeignDays=3
 *
 * 2 expediciones:
 * → ambas terminan máximo en 3 días
 * → cobertura 100%
 *
 * Resultado esperado:
 *
 * requiredRoutes:     2
 * requiredOperators:  2
 * requiredVehicles:   2
 * requiredDays:       3
 */

const origin = {
  lat:
    21.8852562,

  lng:
    -102.2915677
}

const points =
  Array.from(
    {
      length:
        19
    },
    (
      _,
      index
    ) => ({
      id:
        index + 1,

      __plannerKey:
        `id:${index + 1}`,

      lat:
        21.9 +
        index *
        0.002,

      lng:
        -102.3 -
        index *
        0.002
    })
  )

function makeDays(
  pointKeys,
  dayCount
) {
  const days =
    Array.from(
      {
        length:
          dayCount
      },
      (
        _,
        index
      ) => ({
        day:
          index + 1,

        pointKeys:
          []
      })
    )

  pointKeys.forEach(
    (
      key,
      index
    ) => {
      days[
        index %
        dayCount
      ].pointKeys.push(
        key
      )
    }
  )

  return days
}

/**
 * Fake solver.
 *
 * Importante:
 *
 * NO utiliza plantilla real.
 *
 * Simula el contrato que posteriormente
 * cumplirá Google Route Optimization.
 */
async function solveScenario({
  candidateResourceCount,
  solveMode
}) {
  const keys =
    points.map(
      point =>
        point.__plannerKey
    )

  /*
   * 1 expedición:
   *
   * cubre todo, pero necesita 4 días.
   *
   * El provider podría decir "feasible",
   * pero nuestro planner debe rechazarlo porque
   * excede maxForeignDays=3.
   */
  if (
    candidateResourceCount ===
    1
  ) {
    return {
      feasible:
        true,

      usedResourceCount:
        1,

      solveMode,

      routes: [
        {
          vehicleLabel:
            'FOREIGN_EXPEDITION_1',

          pointKeys:
            keys,

          requiredDays:
            4,

          days:
            makeDays(
              keys,
              4
            )
        }
      ]
    }
  }

  /*
   * 2 o más recursos:
   *
   * Google matemáticamente usa solamente 2.
   */
  const first =
    keys.slice(
      0,
      10
    )

  const second =
    keys.slice(
      10
    )

  return {
    feasible:
      true,

    usedResourceCount:
      2,

    solveMode,

    routes: [
      {
        vehicleLabel:
          'FOREIGN_EXPEDITION_1',

        pointKeys:
          first,

        requiredDays:
          3,

        days:
          makeDays(
            first,
            3
          )
      },

      {
        vehicleLabel:
          'FOREIGN_EXPEDITION_2',

        pointKeys:
          second,

        requiredDays:
          2,

        days:
          makeDays(
            second,
            2
          )
      }
    ]
  }
}

async function main() {
  console.log(
    '\n=============================================='
  )

  console.log(
    ' F8A.6E.1 — AUTOMATIC FOREIGN PLANNER'
  )

  console.log(
    '=============================================='
  )

  const result =
    await planAutomaticForeignResources({
      origin,

      points,

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
      },

      solveScenario,

      maxSolverCalls:
        8,

      finalQualityPass:
        true
    })

  console.log(
    '\nRESUMEN'
  )

  console.dir(
    summarizeAutomaticForeignPlan(
      result
    ),
    {
      depth:
        null
    }
  )

  console.log(
    '\nBÚSQUEDA'
  )

  for (
    const trace
    of result.searchTrace
  ) {
    console.log(
      [
        `Llamada ${trace.call}`,
        `${trace.candidateResourceCount} expedición(es)`,
        trace.solveMode,
        trace.feasible
          ? 'FACTIBLE'
          : 'NO FACTIBLE',
        `usadas=${trace.usedResourceCount}`,
        `cobertura=${trace.coveragePercent}%`,
        `díasMáx=${trace.maxDaysUsed}`,
        `límite=${trace.maxForeignDays}`
      ].join(
        ' | '
      )
    )
  }

  console.log(
    '\nRUTAS'
  )

  result.routes.forEach(
    (
      route,
      index
    ) => {
      console.log(
        `Expedición ${index + 1}: ` +
        `${route.pointKeys.length} destinos, ` +
        `${route.requiredDays} día(s)`
      )
    }
  )

  const success =
    result.feasible ===
      true &&
    result.requiredRoutes ===
      2 &&
    result.requiredOperators ===
      2 &&
    result.requiredVehicles ===
      2 &&
    result.requiredDays ===
      3 &&
    result.coveragePercent ===
      100 &&
    result
      .allDestinationsAssigned ===
      true

  console.log(
    '\n=============================================='
  )

  console.log(
    ' VEREDICTO'
  )

  console.log(
    '=============================================='
  )

  if (
    success
  ) {
    console.log(
      'AUTOMATIC FOREIGN RESOURCE PLANNER OK ✓'
    )

    console.log(
      'El motor determinó automáticamente 2 expediciones.'
    )

    console.log(
      'No se proporcionó operatorCount.'
    )
  } else {
    console.error(
      'RESULTADO INESPERADO'
    )

    console.dir(
      result,
      {
        depth:
          null
      }
    )

    process.exitCode =
      1
  }
}

await main()