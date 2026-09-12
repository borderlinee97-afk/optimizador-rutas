// backend/scripts/solve-foreign-calvillo.js

import {
  pool
} from '../db/pool.js'

import {
  planAutomaticForeignResources,
  summarizeAutomaticForeignPlan
} from '../routing/services/automaticForeignResourcePlanner.service.js'

import {
  createGoogleForeignOAuthSolveScenario
} from '../routing/providers/googleForeignOptimizationOAuth.provider.js'

import {
  assertGoogleCloudAuthentication
} from '../routing/providers/googleCloudAuth.provider.js'

/**
 * ============================================================
 * F8A.6E.3
 * PRIMER SOLVE FOREIGN REAL
 * ============================================================
 *
 * IMPORTANTE:
 *
 * Esta prueba NO concluye que Calvillo deba
 * operarse como FOREIGN_ROUTE.
 *
 * Solamente valida que el motor foráneo:
 *
 * - determine expediciones automáticamente
 * - distribuya destinos entre días
 * - mantenga continuidad
 * - cumpla maxForeignDays
 *
 * La comparación ROUND_TRIP vs FOREIGN_ROUTE
 * será otra capa posterior.
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

  return (
    `${formatNumber(
      number / 1000,
      1
    )} km`
  )
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

  const days =
    Math.floor(
      total /
      86400
    )

  const hours =
    Math.floor(
      (
        total %
        86400
      ) /
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

  const parts =
    []

  if (days) {
    parts.push(
      `${days} d`
    )
  }

  if (
    hours ||
    days
  ) {
    parts.push(
      `${hours} h`
    )
  }

  parts.push(
    `${minutes} min`
  )

  return parts.join(' ')
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
      `${invalid.length} destino(s) tienen coordenadas inválidas.`
    )
  }
}

function buildPointLookup(
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
 * PRINT ROUTE
 * ============================================================
 */

function printExpedition({
  route,
  index,
  lookup
}) {
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
    `Recurso virtual:        ${route.vehicleLabel}`
  )

  console.log(
    `Destinos:               ${route.pointKeys.length}`
  )

  console.log(
    `Días utilizados:        ${route.requiredDays}`
  )

  console.log(
    `Inicio expedición:      ${formatLocalDateTime(
      route.vehicleStartTime
    )}`
  )

  console.log(
    `Fin expedición:         ${formatLocalDateTime(
      route.vehicleEndTime
    )}`
  )

  console.log(
    `Distancia:              ${formatKm(
      route.distanceMeters
    )}`
  )

  console.log(
    `Tiempo conducción:      ${formatDuration(
      route.travelDurationSeconds
    )}`
  )

  console.log(
    `Tiempo servicio:        ${formatDuration(
      route.visitDurationSeconds
    )}`
  )

  console.log(
    `Tiempo descansos:       ${formatDuration(
      route.breakDurationSeconds
    )}`
  )

  console.log(
    `Tiempo total expedición:${route.totalDurationSeconds != null ? ` ${formatDuration(route.totalDurationSeconds)}` : ' N/D'}`
  )

  console.log(
    `Breaks recibidos:       ${route.breaks.length}`
  )

  console.log(
    ''
  )

  console.log(
    'DISTRIBUCIÓN POR DÍA'
  )

  if (
    !route.days.length
  ) {
    console.log(
      '  Sin visitas agrupables por fecha.'
    )
  }

  route.days.forEach(
    day => {
      console.log(
        `\n  DÍA ${day.day} — ${day.date}`
      )

      console.log(
        `  Destinos: ${day.pointKeys.length}`
      )

      day.visits.forEach(
        (
          visit,
          stopIndex
        ) => {
          const point =
            lookup.get(
              visit.pointKey
            )

          console.log(
            `    ${String(
              stopIndex + 1
            ).padStart(
              2,
              '0'
            )}. ` +
            `${
              point
                ?.meta
                ?.clues ||
              visit.pointKey
            } — ` +
            `${
              point
                ?.meta
                ?.unidad ||
              'SIN NOMBRE'
            }`
          )

          console.log(
            `        llegada/inicio servicio: ${formatLocalDateTime(
              visit.startTime
            )}`
          )
        }
      )
    }
  )

  console.log(
    '\nSECUENCIA COMPLETA'
  )

  route.pointKeys.forEach(
    (
      key,
      stopIndex
    ) => {
      const point =
        lookup.get(
          key
        )

      console.log(
        `  ${String(
          stopIndex + 1
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
      ' F8A.6E.3 — FOREIGN REAL SOLVE'
    )

    console.log(
      ' AUTOMATIC FOREIGN RESOURCE PLANNER'
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
      buildPointLookup(
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

      planningDate:
        CONFIG.planningDate,

      maxForeignDays:
        CONFIG
          .foreignPolicy
          .maxForeignDays,

      userProvidedRouteCount:
        false,

      userProvidedOperatorCount:
        false,

      userProvidedVehicleCount:
        false
    })

    /*
     * ========================================================
     * SOLVER FACTORY
     * ========================================================
     */

    const solveScenario =
      createGoogleForeignOAuthSolveScenario({
        planningDate:
          CONFIG.planningDate,

        timeZone:
          CONFIG.timeZone,

        avoidTolls:
          CONFIG.avoidTolls,

        considerRoadTraffic:
          true
      })

    /*
     * ========================================================
     * AUTOMATIC RESOURCE PLANNER
     * ========================================================
     */

    console.log(
      '\nBuscando automáticamente el mínimo de expediciones...'
    )

    const plan =
      await planAutomaticForeignResources({
        origin:
          CONFIG.origin,

        points,

        foreignPolicy:
          CONFIG.foreignPolicy,

        solveScenario,

        /*
         * No representa plantilla disponible.
         *
         * Es solamente el máximo matemático de
         * recursos virtuales permitidos durante
         * la búsqueda.
         */
        maxCandidateResources:
          points.length,

        maxSolverCalls:
          8,

        finalQualityPass:
          true
      })

    /*
     * ========================================================
     * SUMMARY
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' RESULTADO AUTOMATIC FOREIGN PLANNER'
    )

    console.log(
      '=================================================='
    )

    console.dir(
      summarizeAutomaticForeignPlan(
        plan
      ),
      {
        depth:
          null
      }
    )

    /*
     * ========================================================
     * TRACE
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' BÚSQUEDA AUTOMÁTICA'
    )

    console.log(
      '=================================================='
    )

    for (
      const trace
      of plan.searchTrace
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
          `límite=${trace.maxForeignDays}`,
          `violacionesDía=${trace.dayLimitViolations}`
        ].join(
          ' | '
        )
      )
    }

    /*
     * ========================================================
     * INFEASIBLE
     * ========================================================
     */

    if (
      !plan.feasible
    ) {
      console.log(
        '\n=================================================='
      )

      console.log(
        ' PLAN FOREIGN NO FACTIBLE'
      )

      console.log(
        '=================================================='
      )

      console.dir(
        {
          status:
            plan.status,

          lowerBound:
            plan.lowerBound,

          solverCalls:
            plan.solverCalls,

          coveragePercent:
            plan.coveragePercent,

          validation:
            plan.validation
        },
        {
          depth:
            null
        }
      )

      exitCode =
        2

      return
    }

    /*
     * ========================================================
     * RECOMMENDED NEED
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' NECESIDAD OPERATIVA FOREIGN'
    )

    console.log(
      '=================================================='
    )

    console.log(
      `Expediciones requeridas: ${plan.requiredRoutes}`
    )

    console.log(
      `Operadores requeridos:   ${plan.requiredOperators}`
    )

    console.log(
      `Vehículos requeridos:    ${plan.requiredVehicles}`
    )

    console.log(
      `Días requeridos:         ${plan.requiredDays}`
    )

    console.log(
      `Máximo permitido:        ${plan.maxForeignDays}`
    )

    console.log(
      `Cobertura:               ${plan.coveragePercent}%`
    )

    console.log(
      `Destinos asignados:      ${
        plan.allDestinationsAssigned
          ? 'TODOS'
          : 'INCOMPLETO'
      }`
    )

    /*
     * ========================================================
     * EXPEDITIONS
     * ========================================================
     */

    plan.routes.forEach(
      (
        route,
        index
      ) => {
        printExpedition({
          route,
          index,
          lookup
        })
      }
    )

    /*
     * ========================================================
     * COVERAGE AUDIT
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' AUDITORÍA'
    )

    console.log(
      '=================================================='
    )

    console.dir(
      plan.validation,
      {
        depth:
          null
      }
    )

    /*
     * ========================================================
     * VERDICT
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' VEREDICTO F8A.6E.3'
    )

    console.log(
      '=================================================='
    )

    console.log(
      `Factible: ${
        plan.feasible
          ? 'SÍ'
          : 'NO'
      }`
    )

    console.log(
      `Cobertura 100%: ${
        plan.coveragePercent ===
          100
          ? 'SÍ'
          : 'NO'
      }`
    )

    console.log(
      `Dentro de maxForeignDays: ${
        plan.requiredDays <=
          plan.maxForeignDays
          ? 'SÍ'
          : 'NO'
      }`
    )

    console.log(
      `Recursos determinados automáticamente: ${
        plan.requiredRoutes
      }`
    )

    if (
      plan.feasible &&
      plan.coveragePercent ===
        100 &&
      plan.requiredDays <=
        plan.maxForeignDays
    ) {
      console.log(
        '\nPRIMER PLAN FOREIGN REAL GENERADO ✓'
      )

      console.log(
        'El resultado todavía NO compara FOREIGN contra ROUND_TRIP.'
      )
    } else {
      console.log(
        '\nEL PLAN FOREIGN REQUIERE REVISIÓN.'
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
      ' ERROR F8A.6E.3'
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

    if (
      error?.cause?.details
    ) {
      console.log(
        '\nDetalles internos:'
      )

      console.dir(
        error.cause.details,
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