// backend/scripts/solve-round-trip-calvillo.js

import { pool } from '../db/pool.js'

import {
  planAutomaticRoundTripResources,
  summarizeAutomaticResourcePlan
} from '../routing/services/automaticResourcePlanner.service.js'

import {
  createGoogleRoundTripOAuthSolveScenario
} from '../routing/providers/googleOptimizationOAuth.provider.js'

import {
  assertGoogleCloudAuthentication,
  getGoogleCloudProjectId
} from '../routing/providers/googleCloudAuth.provider.js'

/**
 * ============================================================
 * F8A.6C.3
 * PRIMER SOLVE REAL — ROUND_TRIP AUTOMÁTICO
 * ============================================================
 *
 * Caso de regresión:
 *
 * Estado:        Aguascalientes
 * Proyecto:      Aguascalientes
 * Región:        Calvillo
 * Demanda:       unidades reales desde PostgreSQL
 *
 * El usuario NO proporciona:
 *
 * - cantidad de operadores
 * - cantidad de vehículos
 * - cantidad de rutas
 *
 * El motor determina:
 *
 * - requiredRoutes
 * - requiredOperators
 * - requiredVehicles
 *
 * ============================================================
 */

const TEST_CONFIG = Object.freeze({
  estado:
    'Aguascalientes',

  proyecto:
    'Aguascalientes',

  region:
    'Calvillo',

  /*
   * Origen utilizado en las pruebas anteriores.
   */
  origin: {
    lat:
      21.8852562,

    lng:
      -102.29156770000002
  },

  avoidDificilAcceso:
    true,

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
  },

  /*
   * Para este primer caso mantenemos peajes
   * permitidos, igual que la prueba anterior.
   */
  avoidTolls:
    false,

  /*
   * Route Optimization tendrá en cuenta
   * condiciones de tráfico.
   */
  considerRoadTraffic:
    true
})

/**
 * ============================================================
 * FORMATO
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

  return `${formatNumber(value / 1000, 1)} km`
}

function formatDuration(
  seconds
) {
  const total =
    Number(seconds)

  if (
    !Number.isFinite(total)
  ) {
    return 'N/D'
  }

  const rounded =
    Math.max(
      0,
      Math.round(total)
    )

  const hours =
    Math.floor(
      rounded / 3600
    )

  const minutes =
    Math.floor(
      (
        rounded % 3600
      ) /
      60
    )

  if (
    hours <=
    0
  ) {
    return `${minutes} min`
  }

  return `${hours} h ${minutes} min`
}

function formatLocalDateTime(
  value,
  timeZone =
    'America/Mexico_City'
) {
  if (
    !value
  ) {
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
      timeZone,

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
 * DEMANDA REAL
 * ============================================================
 */

async function loadCalvilloPoints() {
  const params = [
    TEST_CONFIG.proyecto,
    TEST_CONFIG.estado,
    TEST_CONFIG.region
  ]

  const difficultClause =
    TEST_CONFIG.avoidDificilAcceso
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
        f.estatus::text
          AS estatus,
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
        f.latitud
          IS NOT NULL

        AND

        f.longitud
          IS NOT NULL

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

      /*
       * Esta llave viaja hasta Google y vuelve
       * en la asignación de cada ruta.
       */
      __plannerKey:
        `id:${Number(row.id)}`,

      name:
        row.clues ||
        row.unidad ||
        String(row.id),

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

        regionSanitaria:
          row.region_sanitaria ||
          null,

        estado:
          row.estado ||
          null,

        proyecto:
          row.proyecto ||
          null,

        dificilAcceso:
          Boolean(
            row.dificil_acceso
          )
      }
    })
  )
}

/**
 * ============================================================
 * VALIDACIÓN LOCAL
 * ============================================================
 */

function validatePoints(
  points
) {
  if (
    !Array.isArray(points) ||
    !points.length
  ) {
    throw new Error(
      'La consulta no devolvió unidades para Calvillo.'
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
        point.lat <
          -90 ||
        point.lat >
          90 ||
        point.lng <
          -180 ||
        point.lng >
          180
    )

  if (
    invalid.length
  ) {
    throw new Error(
      `${invalid.length} unidad(es) contienen coordenadas inválidas.`
    )
  }
}

/**
 * ============================================================
 * LOOKUP
 * ============================================================
 */

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
 * AUDITORÍA BÁSICA DE COBERTURA
 * ============================================================
 *
 * El planner ya valida cobertura internamente.
 *
 * Esta segunda revisión existe únicamente
 * como diagnóstico de este primer solve real.
 */

function auditAssignments(
  points,
  routes
) {
  const expected =
    points.map(
      point =>
        point.__plannerKey
    )

  const assigned =
    routes.flatMap(
      route =>
        Array.isArray(
          route.pointKeys
        )
          ? route.pointKeys
          : []
    )

  const counts =
    new Map()

  for (
    const key
    of assigned
  ) {
    counts.set(
      key,
      (
        counts.get(key) ||
        0
      ) +
      1
    )
  }

  const missing =
    expected.filter(
      key =>
        !counts.has(key)
    )

  const duplicated =
    Array.from(
      counts.entries()
    )
      .filter(
        (
          [
            _,
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

  const unexpected =
    Array.from(
      counts.keys()
    )
      .filter(
        key =>
          !expected.includes(key)
      )

  return {
    expected:
      expected.length,

    assigned:
      assigned.length,

    missing,

    duplicated,

    unexpected,

    valid:
      missing.length ===
        0 &&
      duplicated.length ===
        0 &&
      unexpected.length ===
        0 &&
      assigned.length ===
        expected.length
  }
}

/**
 * ============================================================
 * RUTAS
 * ============================================================
 */

function printRoute(
  route,
  routeIndex,
  lookup,
  workdayStatus
) {
  console.log(
    '\n--------------------------------------------------'
  )

  console.log(
    ` RUTA ${routeIndex + 1}`
  )

  console.log(
    '--------------------------------------------------'
  )

  console.log(
    `Recurso virtual: ${
      route.vehicleLabel ||
      route.vehicleIndex ||
      routeIndex + 1
    }`
  )

  console.log(
    `Unidades:        ${route.pointKeys?.length || 0}`
  )

  console.log(
    `Distancia:       ${formatKm(route.distanceMeters)}`
  )

  console.log(
    `Duración:        ${formatDuration(route.durationSeconds)}`
  )

  console.log(
    `Inicio:          ${formatLocalDateTime(
      route.vehicleStartTime,
      TEST_CONFIG.workday.timeZone
    )}`
  )

  console.log(
    `Regreso origen:  ${formatLocalDateTime(
      route.vehicleEndTime,
      TEST_CONFIG.workday.timeZone
    )}`
  )

  console.log(
    `Jornada:         ${
      workdayStatus?.status ||
      route.workdayStatus ||
      'N/D'
    }`
  )

  const graceMinutes =
    workdayStatus
      ?.graceUsedMinutes ??
    route
      ?.graceUsedMinutes

  console.log(
    `Margen usado:    ${
      Number.isFinite(
        Number(graceMinutes)
      )
        ? `${formatNumber(graceMinutes, 1)} min`
        : 'N/D'
    }`
  )

  console.log(
    `Tráfico inválido: ${
      route.hasTrafficInfeasibilities
        ? 'SÍ'
        : 'NO'
    }`
  )

  console.log(
    '\nOrden de visitas:'
  )

  const pointKeys =
    Array.isArray(
      route.pointKeys
    )
      ? route.pointKeys
      : []

  pointKeys.forEach(
    (
      pointKey,
      stopIndex
    ) => {
      const point =
        lookup.get(
          pointKey
        )

      if (
        !point
      ) {
        console.log(
          `  ${stopIndex + 1}. ${pointKey} — SIN LOOKUP`
        )

        return
      }

      console.log(
        `  ${String(stopIndex + 1).padStart(2, '0')}. ` +
        `${point.meta.clues || pointKey} — ` +
        `${point.meta.unidad || 'SIN NOMBRE'}`
      )
    }
  )
}

/**
 * ============================================================
 * TRACE DE BÚSQUEDA
 * ============================================================
 */

function printSearchTrace(
  trace = []
) {
  console.log(
    '\n=============================================='
  )

  console.log(
    ' BÚSQUEDA AUTOMÁTICA DE RECURSOS'
  )

  console.log(
    '=============================================='
  )

  for (
    const item
    of trace
  ) {
    console.log(
      [
        `Llamada ${item.call}`,
        `${item.candidateResourceCount} recursos`,
        item.solveMode,
        item.feasible
          ? 'FACTIBLE'
          : 'NO FACTIBLE',
        `usados=${item.usedResourceCount}`,
        `cobertura=${item.coveragePercent}%`,
        `normal=${item.normalRoutes}`,
        `margen=${item.extendedReturnRoutes}`,
        `violaciones=${item.workdayViolations}`,
        `graceMax=${item.maxGraceUsedMinutes ?? 0}min`
      ].join(
        ' | '
      )
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
      '\n=============================================='
    )

    console.log(
      ' F8A.6C.3 — SOLVE REAL'
    )

    console.log(
      ' AUTOMATIC ROUND_TRIP PLANNER'
    )

    console.log(
      '=============================================='
    )

    /*
     * ========================================================
     * AUTH
     * ========================================================
     */

    console.log(
      '\nComprobando ADC/OAuth...'
    )

    const auth =
      await assertGoogleCloudAuthentication()

    console.log({
      authMode:
        auth.authMode,

      googleProjectId:
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
      '\nCargando demanda real desde PostgreSQL...'
    )

    const points =
      await loadCalvilloPoints()

    validatePoints(
      points
    )

    const lookup =
      buildPointLookup(
        points
      )

    console.log({
      estado:
        TEST_CONFIG.estado,

      proyecto:
        TEST_CONFIG.proyecto,

      region:
        TEST_CONFIG.region,

      totalUnits:
        points.length,

      googleProjectId:
        getGoogleCloudProjectId(),

      routeMode:
        'ROUND_TRIP',

      userProvidedRouteCount:
        false,

      userProvidedOperatorCount:
        false,

      userProvidedVehicleCount:
        false,

      avoidDificilAcceso:
        TEST_CONFIG
          .avoidDificilAcceso
    })

    console.log(
      '\nPolítica de jornada:'
    )

    console.log({
      startClock:
        TEST_CONFIG
          .workday
          .startClock,

      preferredShiftHours:
        TEST_CONFIG
          .workday
          .shiftHours,

      lastArrivalClock:
        TEST_CONFIG
          .workday
          .lastArrivalClock,

      returnGraceMinutes:
        TEST_CONFIG
          .workday
          .returnGraceMinutes,

      hardMaximumHours:
        TEST_CONFIG
          .workday
          .shiftHours +
        (
          TEST_CONFIG
            .workday
            .returnGraceMinutes /
          60
        )
    })

    /*
     * ========================================================
     * GOOGLE SOLVER
     * ========================================================
     */

    const solveScenario =
      createGoogleRoundTripOAuthSolveScenario({
        timeZone:
          TEST_CONFIG
            .workday
            .timeZone,

        avoidTolls:
          TEST_CONFIG
            .avoidTolls,

        considerRoadTraffic:
          TEST_CONFIG
            .considerRoadTraffic
      })

    console.log(
      '\nEjecutando Automatic Resource Planner...'
    )

    console.log(
      'Google puede realizar varias optimizaciones para encontrar el mínimo factible.'
    )

    /*
     * ========================================================
     * AUTO PLANNER
     * ========================================================
     */

    const plan =
      await planAutomaticRoundTripResources({
        origin:
          TEST_CONFIG.origin,

        points,

        workday:
          TEST_CONFIG.workday,

        solveScenario,

        /*
         * No imponemos plantilla disponible.
         *
         * El máximo teórico es una ruta por unidad.
         */
        maxCandidateResources:
          points.length,

        /*
         * Protección de consumo/API.
         *
         * Para 19 unidades normalmente esperamos:
         *
         * lower bound
         * expansión
         * refinamiento
         * pasada final
         *
         * El límite evita loops anormales.
         */
        maxSolverCalls:
          8,

        finalQualityPass:
          true
      })

    /*
     * ========================================================
     * RESULTADO GENERAL
     * ========================================================
     */

    console.log(
      '\n=============================================='
    )

    console.log(
      ' RESULTADO DEL PLANIFICADOR'
    )

    console.log(
      '=============================================='
    )

    console.dir(
      summarizeAutomaticResourcePlan(
        plan
      ),
      {
        depth:
          null
      }
    )

    printSearchTrace(
      plan.searchTrace
    )

    /*
     * ========================================================
     * INVIABLE
     * ========================================================
     */

    if (
      !plan.feasible
    ) {
      console.log(
        '\n=============================================='
      )

      console.log(
        ' PLAN NO FACTIBLE'
      )

      console.log(
        '=============================================='
      )

      console.dir(
        {
          status:
            plan.status,

          reason:
            plan.reason,

          lowerBound:
            plan.lowerBound,

          upperBound:
            plan.upperBound,

          solverCalls:
            plan.solverCalls,

          errors:
            plan.errors ||
            plan
              ?.validation
              ?.errors ||
            []
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
     * AUDITORÍA
     * ========================================================
     */

    const audit =
      auditAssignments(
        points,
        plan.routes
      )

    console.log(
      '\n=============================================='
    )

    console.log(
      ' AUDITORÍA DE COBERTURA'
    )

    console.log(
      '=============================================='
    )

    console.dir(
      audit,
      {
        depth:
          null
      }
    )

    /*
     * ========================================================
     * NECESIDAD OPERATIVA
     * ========================================================
     */

    console.log(
      '\n=============================================='
    )

    console.log(
      ' NECESIDAD OPERATIVA RECOMENDADA'
    )

    console.log(
      '=============================================='
    )

    console.log(
      `Rutas requeridas:       ${plan.requiredRoutes}`
    )

    console.log(
      `Operadores requeridos:  ${plan.requiredOperators}`
    )

    console.log(
      `Vehículos requeridos:   ${plan.requiredVehicles}`
    )

    console.log(
      `Días objetivo:          ${plan.requiredDays}`
    )

    console.log(
      `Cobertura:              ${plan.coveragePercent}%`
    )

    console.log(
      `Rutas normales:         ${
        plan
          ?.routeWorkdaySummary
          ?.normalRoutes ??
        0
      }`
    )

    console.log(
      `Con margen retorno:     ${
        plan
          ?.routeWorkdaySummary
          ?.extendedReturnRoutes ??
        0
      }`
    )

    console.log(
      `Mayor margen utilizado: ${
        formatNumber(
          plan
            ?.routeWorkdaySummary
            ?.maxGraceUsedMinutes ??
          0,
          1
        )
      } min`
    )

    /*
     * ========================================================
     * MÉTRICAS GOOGLE
     * ========================================================
     */

    if (
      plan.solverMetrics
    ) {
      console.log(
        '\n=============================================='
      )

      console.log(
        ' MÉTRICAS GOOGLE'
      )

      console.log(
        '=============================================='
      )

      console.dir(
        {
          usedVehicleCount:
            plan
              .solverMetrics
              ?.usedVehicleCount,

          performedShipmentCount:
            plan
              .solverMetrics
              ?.aggregatedRouteMetrics
              ?.performedShipmentCount,

          skippedMandatoryShipmentCount:
            plan
              .solverMetrics
              ?.skippedMandatoryShipmentCount,

          totalDistance:
            formatKm(
              plan
                .solverMetrics
                ?.aggregatedRouteMetrics
                ?.travelDistanceMeters
            ),

          totalDuration:
            formatDuration(
              (() => {
                const raw =
                  plan
                    .solverMetrics
                    ?.aggregatedRouteMetrics
                    ?.totalDuration

                if (
                  typeof raw ===
                    'string' &&
                  raw.endsWith('s')
                ) {
                  return Number(
                    raw.slice(
                      0,
                      -1
                    )
                  )
                }

                return Number(raw)
              })()
            ),

          totalCostSolver:
            plan
              .solverMetrics
              ?.totalCost
        },
        {
          depth:
            null
        }
      )
    }

    /*
     * ========================================================
     * DETALLE POR RUTA
     * ========================================================
     */

    const routeStatuses =
      plan
        ?.routeWorkdaySummary
        ?.routeStatuses ||
      []

    plan.routes.forEach(
      (
        route,
        index
      ) => {
        const workdayStatus =
          routeStatuses.find(
            item =>
              item.routeIndex ===
              index
          )

        printRoute(
          route,
          index,
          lookup,
          workdayStatus
        )
      }
    )

    /*
     * ========================================================
     * VEREDICTO TÉCNICO
     * ========================================================
     */

    console.log(
      '\n=============================================='
    )

    console.log(
      ' VEREDICTO DEL TEST'
    )

    console.log(
      '=============================================='
    )

    console.log(
      `Cobertura íntegra: ${
        audit.valid
          ? 'SÍ'
          : 'NO'
      }`
    )

    console.log(
      `Plan factible:     ${
        plan.feasible
          ? 'SÍ'
          : 'NO'
      }`
    )

    console.log(
      `Recursos auto:     ${plan.requiredRoutes}`
    )

    console.log(
      `Solver calls:      ${plan.solverCalls}`
    )

    if (
      audit.valid &&
      plan.feasible
    ) {
      console.log(
        '\nPRIMER PLAN AUTOMÁTICO REAL GENERADO ✓'
      )
    } else {
      exitCode =
        3

      console.log(
        '\nEL RESULTADO REQUIERE REVISIÓN.'
      )
    }
  } catch (
    error
  ) {
    exitCode =
      1

    console.error(
      '\n=============================================='
    )

    console.error(
      ' ERROR DURANTE EL SOLVE'
    )

    console.error(
      '=============================================='
    )

    console.error(
      error
    )

    if (
      error?.details
    ) {
      console.error(
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
      console.error(
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