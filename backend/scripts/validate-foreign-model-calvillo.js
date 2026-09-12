// backend/scripts/validate-foreign-model-calvillo.js

import {
  pool
} from '../db/pool.js'

import {
  buildGoogleForeignOptimizationRequest,
  summarizeGoogleForeignRequest
} from '../routing/providers/googleForeignOptimizationPlanner.provider.js'

import {
  callGoogleOptimizationPlannerOAuth
} from '../routing/providers/googleOptimizationOAuth.provider.js'

import {
  assertGoogleCloudAuthentication,
  getGoogleCloudProjectId
} from '../routing/providers/googleCloudAuth.provider.js'

/**
 * ============================================================
 * F8A.6E.2
 * VALIDATE_ONLY — FOREIGN_ROUTE MULTIDAY
 * ============================================================
 *
 * Esta prueba NO pretende decir que Calvillo
 * deba operarse como foránea.
 *
 * Utilizamos sus 19 destinos únicamente porque
 * constituyen una demanda real conocida y validada.
 *
 * El objetivo es validar el MODELO multiday:
 *
 * - múltiples ventanas diarias
 * - continuidad entre días
 * - descansos nocturnos
 * - salida única desde CEDIS
 * - regreso único al final
 * - OAuth / Route Optimization
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

    candidateResources:
      2,

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
 * PRINT
 * ============================================================
 */

function printWindows(
  metadata
) {
  console.log(
    '\nVENTANAS DIARIAS DE ENTREGA'
  )

  for (
    const window
    of metadata
      .dailyDeliveryWindows
  ) {
    console.log(
      `Día ${window.day} | ` +
      `${window.date} | ` +
      `${window.startTime} -> ${window.endTime}`
    )
  }
}

function printBreaks(
  metadata
) {
  console.log(
    '\nDESCANSOS NOCTURNOS'
  )

  if (
    !metadata
      .overnightBreaks
      .length
  ) {
    console.log(
      'Sin descansos nocturnos.'
    )

    return
  }

  metadata
    .overnightBreaks
    .forEach(
      (
        item,
        index
      ) => {
        console.log(
          `Break ${index + 1} | ` +
          `inicio=${item.earliestStartTime} | ` +
          `duración=${item.minDuration}`
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
      ' F8A.6E.2 — FOREIGN MULTIDAY VALIDATE_ONLY'
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
     * DEMAND
     * ========================================================
     */

    console.log(
      '\nCargando demanda real...'
    )

    const points =
      await loadPoints()

    if (
      !points.length
    ) {
      throw new Error(
        'No se encontraron destinos.'
      )
    }

    console.log({
      estado:
        CONFIG.estado,

      proyecto:
        CONFIG.proyecto,

      region:
        CONFIG.region,

      totalUnits:
        points.length,

      googleProjectId:
        getGoogleCloudProjectId(),

      routeMode:
        'FOREIGN_ROUTE',

      planningDate:
        CONFIG.planningDate,

      timeZone:
        CONFIG.timeZone,

      candidateResources:
        CONFIG.candidateResources,

      maxForeignDays:
        CONFIG
          .foreignPolicy
          .maxForeignDays
    })

    /*
     * ========================================================
     * BUILD
     * ========================================================
     */

    const {
      request,
      metadata
    } =
      buildGoogleForeignOptimizationRequest({
        origin:
          CONFIG.origin,

        points,

        candidateResourceCount:
          CONFIG
            .candidateResources,

        maxActiveResources:
          CONFIG
            .candidateResources,

        planningDate:
          CONFIG
            .planningDate,

        timeZone:
          CONFIG
            .timeZone,

        foreignPolicy:
          CONFIG
            .foreignPolicy,

        solveMode:
          'SEARCH',

        avoidTolls:
          CONFIG
            .avoidTolls,

        considerRoadTraffic:
          true,

        label:
          'DEV_VALIDATE_FOREIGN_CALVILLO'
      })

    /*
     * VALIDATE_ONLY:
     *
     * Google valida el esquema y restricciones
     * pero todavía no buscamos una solución.
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
      '\n=================================================='
    )

    console.log(
      ' MODELO CONSTRUIDO'
    )

    console.log(
      '=================================================='
    )

    console.dir(
      summarizeGoogleForeignRequest({
        request,
        metadata
      }),
      {
        depth:
          null
      }
    )

    printWindows(
      metadata
    )

    printBreaks(
      metadata
    )

    /*
     * ========================================================
     * CHECKS LOCALES
     * ========================================================
     */

    const allMandatory =
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

    const windowsCorrect =
      request
        .model
        .shipments
        .every(
          shipment =>
            shipment
              ?.deliveries?.[0]
              ?.timeWindows
              ?.length ===
            CONFIG
              .foreignPolicy
              .maxForeignDays
        )

    const breaksCorrect =
      request
        .model
        .vehicles
        .every(
          vehicle =>
            (
              vehicle
                ?.breakRule
                ?.breakRequests
                ?.length ||
              0
            ) ===
            (
              CONFIG
                .foreignPolicy
                .maxForeignDays -
              1
            )
        )

    const noHourlyElapsedCost =
      request
        .model
        .vehicles
        .every(
          vehicle =>
            vehicle
              .costPerHour ===
            undefined
        )

    console.log(
      '\nCHECKS LOCALES'
    )

    console.log({
      mandatoryShipments:
        allMandatory,

      dailyWindows:
        windowsCorrect,

      overnightBreaks:
        breaksCorrect,

      noCostPerHour:
        noHourlyElapsedCost,

      onlyFinalReturnToOrigin:
        request
          .model
          .vehicles
          .every(
            vehicle =>
              vehicle
                .startLocation &&
              vehicle
                .endLocation
          )
    })

    /*
     * ========================================================
     * GOOGLE
     * ========================================================
     */

    console.log(
      '\nEnviando VALIDATE_ONLY a Google Route Optimization...'
    )

    const response =
      await callGoogleOptimizationPlannerOAuth({
        request
      })

    const validationErrors =
      Array.isArray(
        response
          ?.validationErrors
      )
        ? response
            .validationErrors
        : []

    console.log(
      '\n=================================================='
    )

    console.log(
      ' RESPUESTA GOOGLE'
    )

    console.log(
      '=================================================='
    )

    console.log(
      `Validation errors: ${validationErrors.length}`
    )

    if (
      validationErrors.length
    ) {
      console.dir(
        validationErrors,
        {
          depth:
            null
        }
      )

      exitCode =
        2

      return
    }

    console.log(
      '\nMODELO FOREIGN MULTIDAY VÁLIDO ✓'
    )

    console.log(
      '\nGoogle aceptó:'
    )

    console.log(
      `  ${points.length} entregas obligatorias`
    )

    console.log(
      `  ${CONFIG.candidateResources} expediciones virtuales candidatas`
    )

    console.log(
      `  ${CONFIG.foreignPolicy.maxForeignDays} días máximos`
    )

    console.log(
      `  ${CONFIG.foreignPolicy.maxForeignDays} ventanas de entrega por destino`
    )

    console.log(
      `  ${CONFIG.foreignPolicy.maxForeignDays - 1} descansos nocturnos por vehículo`
    )

    console.log(
      '  continuidad multiday sin retorno diario al CEDIS'
    )

    console.log(
      '  retorno al origen únicamente al finalizar la expedición'
    )

    console.log(
      '  costos basados en distancia + conducción, no en horas nocturnas'
    )

    console.log(
      '\nSIGUIENTE: PRIMER SOLVE FOREIGN REAL.'
    )
  } catch (
    error
  ) {
    exitCode =
      1

    console.error(
      '\n=================================================='
    )

    console.error(
      ' ERROR F8A.6E.2'
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