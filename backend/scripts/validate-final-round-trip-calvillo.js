// backend/scripts/validate-final-round-trip-calvillo.js

import { pool } from '../db/pool.js'

import {
  solveGoogleRoundTripScenarioOAuth
} from '../routing/providers/googleOptimizationOAuth.provider.js'

import {
  validateRoundTripPlanWithGoogleRoutes
} from '../routing/services/routeFinalValidation.service.js'

import {
  assertGoogleCloudAuthentication,
  getGoogleCloudProjectId
} from '../routing/providers/googleCloudAuth.provider.js'

/**
 * ============================================================
 * F8A.6D
 * VALIDACIÓN FINAL ROUND_TRIP
 * ============================================================
 *
 * Flujo:
 *
 * 1. cargar demanda real
 * 2. Route Optimization FINAL_QUALITY con 3 recursos
 * 3. conservar asignación y orden de Google Optimization
 * 4. validar cada ruta con Google Routes
 * 5. reconstruir:
 *
 *    conducción
 *    + servicio por unidad
 *    + regreso
 *
 * 6. validar:
 *
 *    - llegada máxima a unidades
 *    - jornada ordinaria
 *    - margen de retorno
 *    - límite duro
 *    - distancia carretera
 *    - duración carretera
 *    - polilínea
 *
 * No consulta operadores ni vehículos registrados.
 */

const TEST_CONFIG =
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

    /*
     * Ya validado por F8A.6C:
     *
     * 2 = insuficiente
     * 3 = mínimo factible
     */
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
 * FORMATTERS
 * ============================================================
 */

function formatNumber(
  value,
  decimals = 1
) {
  const number =
    Number(value)

  if (
    !Number.isFinite(
      number
    )
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
    !Number.isFinite(
      number
    )
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
    !Number.isFinite(
      number
    )
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
      total / 3600
    )

  const minutes =
    Math.floor(
      (
        total % 3600
      ) /
      60
    )

  if (
    hours ===
    0
  ) {
    return `${minutes} min`
  }

  return (
    `${hours} h ${minutes} min`
  )
}

function formatLocalTime(
  value,
  timeZone =
    TEST_CONFIG
      .workday
      .timeZone
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
      timeZone,

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
 * DEMANDA
 * ============================================================
 */

async function loadCalvilloPoints() {
  const params = [
    TEST_CONFIG.proyecto,
    TEST_CONFIG.estado,
    TEST_CONFIG.region
  ]

  const difficultClause =
    TEST_CONFIG
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
    !Array.isArray(
      points
    ) ||
    !points.length
  ) {
    throw new Error(
      'No se encontraron unidades válidas para Calvillo.'
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
      `${invalid.length} unidad(es) tienen coordenadas inválidas.`
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
 * COVERAGE
 * ============================================================
 */

function auditCoverage(
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
          !expected.includes(
            key
          )
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
      expected.length ===
        assigned.length &&
      missing.length ===
        0 &&
      duplicated.length ===
        0 &&
      unexpected.length ===
        0
  }
}

/**
 * ============================================================
 * DETALLE DE RUTA
 * ============================================================
 */

function printRouteResult({
  optimizationRoute,
  validationRoute,
  routeIndex,
  lookup
}) {
  console.log(
    '\n=================================================='
  )

  console.log(
    ` RUTA ${routeIndex + 1}`
  )

  console.log(
    '=================================================='
  )

  console.log(
    `Recurso: ${
      optimizationRoute
        ?.vehicleLabel ||
      `PLANNING_ROUTE_${routeIndex + 1}`
    }`
  )

  console.log(
    `Unidades: ${
      optimizationRoute
        ?.pointKeys
        ?.length ||
      0
    }`
  )

  console.log(
    ''
  )

  console.log(
    'ROUTE OPTIMIZATION'
  )

  console.log(
    `  Distancia:       ${formatKm(
      optimizationRoute
        ?.distanceMeters
    )}`
  )

  console.log(
    `  Duración:        ${formatDuration(
      optimizationRoute
        ?.durationSeconds
    )}`
  )

  console.log(
    `  Inicio:          ${formatLocalTime(
      optimizationRoute
        ?.vehicleStartTime
    )}`
  )

  console.log(
    `  Fin estimado:    ${formatLocalTime(
      optimizationRoute
        ?.vehicleEndTime
    )}`
  )

  console.log(
    ''
  )

  console.log(
    'GOOGLE ROUTES — VALIDACIÓN CARRETERA'
  )

  console.log(
    `  Estado:          ${
      validationRoute
        ?.status ||
      'N/D'
    }`
  )

  console.log(
    `  Verificada:      ${
      validationRoute
        ?.verified
        ? 'SÍ'
        : 'NO'
    }`
  )

  console.log(
    `  Distancia:       ${formatKm(
      validationRoute
        ?.roadValidation
        ?.distanceMeters
    )}`
  )

  console.log(
    `  Conducción:      ${formatDuration(
      validationRoute
        ?.roadValidation
        ?.travelDurationSeconds
    )}`
  )

  console.log(
    `  Conducción base: ${formatDuration(
      validationRoute
        ?.roadValidation
        ?.staticTravelDurationSeconds
    )}`
  )

  console.log(
    ''
  )

  console.log(
    'JORNADA OPERATIVA RECONSTRUIDA'
  )

  console.log(
    `  Salida:          ${formatLocalTime(
      validationRoute
        ?.schedule
        ?.departureTime
    )}`
  )

  console.log(
    `  Última llegada:  ${formatLocalTime(
      validationRoute
        ?.schedule
        ?.lastArrivalTime
    )}`
  )

  console.log(
    `  Regreso CEDIS:   ${formatLocalTime(
      validationRoute
        ?.schedule
        ?.returnTime
    )}`
  )

  console.log(
    `  Duración total:  ${formatDuration(
      validationRoute
        ?.schedule
        ?.totalOperationalSeconds
    )}`
  )

  console.log(
    `  Estado jornada:  ${
      validationRoute
        ?.schedule
        ?.workdayStatus ||
      'N/D'
    }`
  )

  console.log(
    `  Margen usado:    ${
      Number.isFinite(
        Number(
          validationRoute
            ?.schedule
            ?.graceUsedMinutes
        )
      )
        ? (
            `${formatNumber(
              validationRoute
                .schedule
                .graceUsedMinutes,
              1
            )} min`
          )
        : 'N/D'
    }`
  )

  console.log(
    `  Llegadas válidas: ${
      validationRoute
        ?.schedule
        ?.allArrivalsWithinWindow
        ? 'SÍ'
        : 'NO'
    }`
  )

  console.log(
    ''
  )

  console.log(
    'COMPARACIÓN ENTRE PROVEEDORES'
  )

  console.log(
    `  Δ distancia:     ${
      validationRoute
        ?.comparison
        ?.distanceDeltaPercent ??
      'N/D'
    }%`
  )

  console.log(
    `  Δ duración:      ${
      validationRoute
        ?.comparison
        ?.durationDeltaPercent ??
      'N/D'
    }%`
  )

  console.log(
    `  Polilínea:       ${
      validationRoute
        ?.roadValidation
        ?.polyline
        ? 'SÍ'
        : 'NO'
    }`
  )

  if (
    validationRoute
      ?.warnings
      ?.length
  ) {
    console.log(
      ''
    )

    console.log(
      'ADVERTENCIAS:'
    )

    console.dir(
      validationRoute.warnings,
      {
        depth:
          null
      }
    )
  }

  if (
    validationRoute
      ?.errors
      ?.length
  ) {
    console.log(
      ''
    )

    console.log(
      'ERRORES:'
    )

    console.dir(
      validationRoute.errors,
      {
        depth:
          null
      }
    )
  }

  console.log(
    ''
  )

  console.log(
    'ORDEN DE VISITAS'
  )

  const keys =
    Array.isArray(
      optimizationRoute
        ?.pointKeys
    )
      ? optimizationRoute
          .pointKeys
      : []

  keys.forEach(
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

  /**
   * Detalle cronológico.
   */
  const scheduleStops =
    validationRoute
      ?.schedule
      ?.stops

  if (
    Array.isArray(
      scheduleStops
    ) &&
    scheduleStops.length
  ) {
    console.log(
      ''
    )

    console.log(
      'HORARIOS POR PARADA'
    )

    scheduleStops.forEach(
      (
        stop,
        stopIndex
      ) => {
        const key =
          keys[
            stopIndex
          ]

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
          }`
        )

        console.log(
          `      llegada:      ${formatLocalTime(
            stop.arrivalTime
          )}`
        )

        console.log(
          `      fin servicio: ${formatLocalTime(
            stop.serviceEndTime
          )}`
        )

        console.log(
          `      dentro horario: ${
            stop.arrivalWithinWindow
              ? 'SÍ'
              : 'NO'
          }`
        )
      }
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
      ' F8A.6D — GOOGLE ROUTES FINAL VALIDATION'
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
      '\nCargando unidades...'
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

      units:
        points.length,

      googleProjectId:
        getGoogleCloudProjectId(),

      routeMode:
        'ROUND_TRIP',

      fixedValidatedResourceCount:
        TEST_CONFIG.requiredResources
    })

    /*
     * ========================================================
     * FINAL QUALITY
     * ========================================================
     */

    console.log(
      '\nEjecutando una sola optimización FINAL_QUALITY con 3 recursos...'
    )

    const optimized =
      await solveGoogleRoundTripScenarioOAuth({
        origin:
          TEST_CONFIG.origin,

        points,

        candidateResourceCount:
          TEST_CONFIG
            .requiredResources,

        maxActiveResources:
          TEST_CONFIG
            .requiredResources,

        workday:
          TEST_CONFIG.workday,

        solveMode:
          'FINAL_QUALITY',

        mandatoryCoverage:
          true,

        timeZone:
          TEST_CONFIG
            .workday
            .timeZone,

        avoidTolls:
          TEST_CONFIG
            .avoidTolls,

        considerRoadTraffic:
          true
      })

    console.log(
      '\n=================================================='
    )

    console.log(
      ' ROUTE OPTIMIZATION FINAL'
    )

    console.log(
      '=================================================='
    )

    console.log({
      feasible:
        optimized.feasible,

      usedResourceCount:
        optimized.usedResourceCount,

      routeCount:
        optimized.routes?.length ||
        0,

      skipped:
        optimized
          .skippedPointKeys
          ?.length ||
        0,

      validationErrors:
        optimized
          .validationErrors
          ?.length ||
        0,

      trafficInfeasibility:
        optimized
          .hasTrafficInfeasibility,

      hardDurationViolation:
        optimized
          .hasHardDurationViolation
    })

    if (
      !optimized.feasible
    ) {
      console.log(
        '\nLa solución FINAL_QUALITY no fue factible.'
      )

      console.dir(
        {
          skippedPointKeys:
            optimized
              .skippedPointKeys,

          validationErrors:
            optimized
              .validationErrors
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
     * COBERTURA
     * ========================================================
     */

    const coverage =
      auditCoverage(
        points,
        optimized.routes
      )

    console.log(
      '\nCobertura después de FINAL_QUALITY:'
    )

    console.dir(
      coverage,
      {
        depth:
          null
      }
    )

    if (
      !coverage.valid
    ) {
      console.log(
        '\nERROR: cobertura no íntegra.'
      )

      exitCode =
        3

      return
    }

    /*
     * ========================================================
     * PLAN TRANSITORIO
     * ========================================================
     *
     * routeFinalValidation sólo requiere:
     *
     * feasible
     * routes
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
      '\nValidando las rutas con Google Routes...'
    )

    console.log(
      `Se realizarán ${plan.routes.length} validaciones de carretera.`
    )

    const finalValidation =
      await validateRoundTripPlanWithGoogleRoutes({
        plan,

        origin:
          TEST_CONFIG.origin,

        points,

        workday:
          TEST_CONFIG.workday,

        /*
         * Cada route ya trae vehicleStartTime
         * desde Route Optimization.
         *
         * Se deja fallback por seguridad.
         */
        departureTime:
          optimized
            .routes?.[0]
            ?.vehicleStartTime ||
          null,

        routingPreference:
          'TRAFFIC_AWARE',

        avoidTolls:
          TEST_CONFIG
            .avoidTolls
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
      ' RESULTADO FINAL GOOGLE ROUTES'
    )

    console.log(
      '=================================================='
    )

    console.dir(
      {
        status:
          finalValidation.status,

        verified:
          finalValidation.verified,

        basePlanUsable:
          finalValidation.basePlanUsable,

        routeCount:
          finalValidation.routeCount,

        verifiedRoutes:
          finalValidation
            .verifiedRouteCount,

        infeasibleRoutes:
          finalValidation
            .infeasibleRouteCount,

        providerErrors:
          finalValidation
            .providerErrorCount,

        normalRoutes:
          finalValidation.normalRoutes,

        extendedReturnRoutes:
          finalValidation
            .extendedReturnRoutes,

        maxGraceUsedMinutes:
          finalValidation
            .maxGraceUsedMinutes,

        totalRoadDistance:
          formatKm(
            finalValidation
              ?.totals
              ?.distanceMeters
          ),

        totalDrivingTime:
          formatDuration(
            finalValidation
              ?.totals
              ?.travelDurationSeconds
          ),

        totalOperationalHours:
          formatDuration(
            finalValidation
              ?.totals
              ?.operationalDurationSeconds
          ),

        planCalendarDuration:
          formatDuration(
            finalValidation
              ?.totals
              ?.maximumRouteOperationalSeconds
          )
      },
      {
        depth:
          null
      }
    )

    /*
     * ========================================================
     * DETALLE
     * ========================================================
     */

    for (
      let index = 0;
      index <
        optimized.routes.length;
      index++
    ) {
      printRouteResult({
        optimizationRoute:
          optimized.routes[
            index
          ],

        validationRoute:
          finalValidation
            .routes[
              index
            ],

        routeIndex:
          index,

        lookup
      })
    }

    /*
     * ========================================================
     * VEREDICTO
     * ========================================================
     */

    console.log(
      '\n=================================================='
    )

    console.log(
      ' VEREDICTO F8A.6D'
    )

    console.log(
      '=================================================='
    )

    console.log(
      `Cobertura Optimization: ${
        coverage.valid
          ? '100% ✓'
          : 'INCORRECTA'
      }`
    )

    console.log(
      `Google Routes verified: ${
        finalValidation.verified
          ? 'SÍ ✓'
          : 'NO'
      }`
    )

    console.log(
      `Rutas normales: ${
        finalValidation
          .normalRoutes
      }`
    )

    console.log(
      `Rutas con margen: ${
        finalValidation
          .extendedReturnRoutes
      }`
    )

    console.log(
      `Mayor margen usado: ${
        formatNumber(
          finalValidation
            .maxGraceUsedMinutes,
          1
        )
      } min`
    )

    console.log(
      `Duración calendario del plan: ${
        formatDuration(
          finalValidation
            ?.totals
            ?.maximumRouteOperationalSeconds
        )
      }`
    )

    if (
      coverage.valid &&
      finalValidation.verified
    ) {
      console.log(
        '\nF8A.6D — VALIDACIÓN CARRETERA EXITOSA ✓'
      )

      console.log(
        'El plan base queda listo para evaluación de calidad territorial.'
      )
    } else {
      console.log(
        '\nF8A.6D requiere revisión antes de continuar.'
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
      ' ERROR F8A.6D'
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