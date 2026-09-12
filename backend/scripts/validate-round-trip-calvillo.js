// backend/scripts/validate-round-trip-calvillo.js

import { pool } from '../db/pool.js'

import {
  buildGoogleOptimizationPlannerRequest
} from '../routing/providers/googleOptimizationPlanner.provider.js'

import {
  callGoogleOptimizationPlannerOAuth
} from '../routing/providers/googleOptimizationOAuth.provider.js'

import {
  assertGoogleCloudAuthentication,
  getGoogleCloudProjectId
} from '../routing/providers/googleCloudAuth.provider.js'

/**
 * ============================================================
 * F8A.6C.2
 * VALIDACIÓN REAL DEL MODELO CONTRA GOOGLE
 * ============================================================
 *
 * Caso:
 *
 * Estado:    Aguascalientes
 * Proyecto:  Aguascalientes
 * Región:    Calvillo
 *
 * solvingMode:
 *
 * VALIDATE_ONLY
 *
 * Todavía NO estamos solicitando la solución definitiva.
 */

const TEST_CONFIG = Object.freeze({
  estado: 'Aguascalientes',

  proyecto: 'Aguascalientes',

  region: 'Calvillo',

  /*
   * Mismo origen utilizado anteriormente.
   */
  origin: {
    lat: 21.8852562,
    lng: -102.29156770000002
  },

  candidateResourceCount: 3,

  avoidDificilAcceso: true,

  workday: {
    shiftHours: 8,

    serviceMinutesPerUnit: 45,

    startClock: '08:00',

    lastArrivalClock: '16:00',

    returnGraceMinutes: 90,

    maxReturnGraceMinutes: 120,

    timeZone: 'America/Mexico_City'
  }
})

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
    TEST_CONFIG.avoidDificilAcceso
      ? `
        AND
          fda.clues IS NULL
        `
      : ''

  const { rows } = await pool.query(
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
        fda.clues = f.clues

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
        UPPER(f.estatus::text),
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
      id: Number(row.id),

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
          row.clues || null,

        unidad:
          row.unidad || null,

        direccion:
          row.direccion || null,

        regionSanitaria:
          row.region_sanitaria || null,

        estado:
          row.estado || null,

        proyecto:
          row.proyecto || null,

        dificilAcceso:
          Boolean(row.dificil_acceso)
      }
    })
  )
}

/**
 * ============================================================
 * VALIDACIÓN LOCAL
 * ============================================================
 */

function validatePoints(points) {
  if (!Array.isArray(points) || !points.length) {
    throw new Error(
      'La consulta no devolvió unidades para Calvillo.'
    )
  }

  const invalid = points.filter(
    point =>
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lng) ||
      point.lat < -90 ||
      point.lat > 90 ||
      point.lng < -180 ||
      point.lng > 180
  )

  if (invalid.length) {
    throw new Error(
      `${invalid.length} unidad(es) contienen coordenadas inválidas.`
    )
  }
}

/**
 * ============================================================
 * SALIDA
 * ============================================================
 */

function printDemandSummary(points) {
  console.log(
    '\n=============================================='
  )

  console.log(
    ' F8A.6C.2 — VALIDACIÓN GOOGLE OAUTH'
  )

  console.log(
    '=============================================='
  )

  console.log(
    `Google Project ID:   ${getGoogleCloudProjectId()}`
  )

  console.log(
    `Estado:              ${TEST_CONFIG.estado}`
  )

  console.log(
    `Proyecto operativo:  ${TEST_CONFIG.proyecto}`
  )

  console.log(
    `Región:              ${TEST_CONFIG.region}`
  )

  console.log(
    `Unidades:            ${points.length}`
  )

  console.log(
    `Difícil acceso:      ${
      TEST_CONFIG.avoidDificilAcceso
        ? 'EXCLUIDO'
        : 'INCLUIDO'
    }`
  )

  console.log(
    `Recursos candidatos: ${TEST_CONFIG.candidateResourceCount}`
  )

  console.log('')

  console.log(
    'Jornada:'
  )

  console.log(
    '  Inicio:             08:00'
  )

  console.log(
    '  Fin preferente:     16:00'
  )

  console.log(
    '  Última llegada:     16:00'
  )

  console.log(
    '  Margen retorno:     90 min'
  )

  console.log(
    '  Fin máximo:         17:30'
  )

  console.log('')

  console.log(
    'Origen:'
  )

  console.log(
    `  ${TEST_CONFIG.origin.lat}, ${TEST_CONFIG.origin.lng}`
  )

  console.log(
    '\nUnidades seleccionadas:'
  )

  points.forEach(
    (point, index) => {
      console.log(
        `${String(index + 1).padStart(2, '0')}. ` +
        `${point.meta.clues || 'SIN CLUES'} — ` +
        `${point.meta.unidad || 'SIN NOMBRE'}`
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
  let exitCode = 0

  try {
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

    console.log(
      '\nCargando demanda real desde PostgreSQL...'
    )

    const points =
      await loadCalvilloPoints()

    validatePoints(points)

    printDemandSummary(points)

    /*
     * ========================================================
     * CONSTRUIR MODELO
     * ========================================================
     */

    const {
      request,
      metadata
    } =
      buildGoogleOptimizationPlannerRequest({
        origin:
          TEST_CONFIG.origin,

        points,

        candidateResourceCount:
          TEST_CONFIG
            .candidateResourceCount,

        maxActiveResources:
          TEST_CONFIG
            .candidateResourceCount,

        workday:
          TEST_CONFIG.workday,

        solveMode:
          'SEARCH',

        avoidTolls:
          false,

        considerRoadTraffic:
          true,

        label:
          'DEV_VALIDATE_CALVILLO_ROUND_TRIP'
      })

    /*
     * ========================================================
     * VALIDATE ONLY
     * ========================================================
     */

    request.solvingMode =
      'VALIDATE_ONLY'

    request.searchMode =
      'RETURN_FAST'

    request.populatePolylines =
      false

    request.populateTransitionPolylines =
      false

    console.log(
      '\n=============================================='
    )

    console.log(
      ' REQUEST CONSTRUIDO'
    )

    console.log(
      '=============================================='
    )

    console.log({
      authMode:
        'OAUTH_ADC',

      googleProjectId:
        getGoogleCloudProjectId(),

      solvingMode:
        request.solvingMode,

      searchMode:
        request.searchMode,

      shipments:
        request.model.shipments.length,

      vehicles:
        request.model.vehicles.length,

      maxActiveVehicles:
        request.model.maxActiveVehicles,

      globalStartTime:
        request.model.globalStartTime,

      normalShiftEndTime:
        metadata.normalShiftEndTime,

      lastArrivalTime:
        metadata.lastArrivalTime,

      globalEndTime:
        request.model.globalEndTime,

      softMaxDuration:
        request
          .model
          .vehicles[0]
          ?.routeDurationLimit
          ?.softMaxDuration,

      hardMaxDuration:
        request
          .model
          .vehicles[0]
          ?.routeDurationLimit
          ?.maxDuration,

      overtimePenalty:
        request
          .model
          .vehicles[0]
          ?.routeDurationLimit
          ?.costPerHourAfterSoftMax,

      mandatoryShipments:
        request
          .model
          .shipments
          .every(
            shipment =>
              !Object.prototype
                .hasOwnProperty
                .call(
                  shipment,
                  'penaltyCost'
                )
          )
    })

    console.log(
      '\nEnviando VALIDATE_ONLY mediante OAuth...'
    )

    const response =
      await callGoogleOptimizationPlannerOAuth({
        request
      })

    const validationErrors =
      Array.isArray(
        response?.validationErrors
      )
        ? response.validationErrors
        : []

    console.log(
      '\n=============================================='
    )

    console.log(
      ' RESPUESTA GOOGLE'
    )

    console.log(
      '=============================================='
    )

    console.log(
      `Validation errors: ${validationErrors.length}`
    )

    if (validationErrors.length) {
      console.dir(
        validationErrors,
        {
          depth: null
        }
      )

      exitCode = 2

      return
    }

    console.log('')

    console.log(
      'MODELO VÁLIDO ✓'
    )

    console.log('')

    console.log(
      'Google aceptó:'
    )

    console.log(
      `  ${points.length} entregas obligatorias`
    )

    console.log(
      `  ${TEST_CONFIG.candidateResourceCount} recursos virtuales`
    )

    console.log(
      '  OAuth / ADC'
    )

    console.log(
      `  proyecto Google Cloud: ${getGoogleCloudProjectId()}`
    )

    console.log(
      '  inicio y retorno al mismo origen'
    )

    console.log(
      '  jornada preferente de 8 h'
    )

    console.log(
      '  margen operativo de retorno de 90 min'
    )

    console.log(
      '  última llegada máxima a las 16:00'
    )

    console.log(
      '  tráfico habilitado'
    )

    console.log('')

    console.log(
      'SIGUIENTE PASO: SOLVE REAL DEL NUEVO MOTOR.'
    )
  } catch (error) {
    exitCode = 1

    console.error(
      '\n=============================================='
    )

    console.error(
      ' ERROR'
    )

    console.error(
      '=============================================='
    )

    console.error(error)

    if (error?.details) {
      console.error(
        '\nDetalles:'
      )

      console.dir(
        error.details,
        {
          depth: null
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
          depth: null
        }
      )
    }
  } finally {
    try {
      await pool.end()
    } catch {}

    process.exitCode = exitCode
  }
}

await main()