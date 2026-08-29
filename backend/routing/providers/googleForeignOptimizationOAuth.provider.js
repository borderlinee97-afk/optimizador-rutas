// backend/routing/providers/googleForeignOptimizationOAuth.provider.js

import {
  buildGoogleForeignOptimizationRequest,
  GOOGLE_FOREIGN_SOLVE_MODE,
  GoogleForeignOptimizationPlannerError
} from './googleForeignOptimizationPlanner.provider.js'

import {
  callGoogleOptimizationPlannerOAuth
} from './googleOptimizationOAuth.provider.js'

/**
 * ============================================================
 * GOOGLE FOREIGN OPTIMIZATION — OAUTH SOLVER
 * ============================================================
 *
 * Responsabilidades:
 *
 * - construir el modelo FOREIGN_ROUTE
 * - ejecutar Route Optimization mediante OAuth
 * - normalizar rutas/expediciones
 * - reconstruir días utilizados
 * - reconstruir asignación de shipments
 * - devolver contrato compatible con:
 *
 *   planAutomaticForeignResources()
 *
 * ============================================================
 */

export const GOOGLE_FOREIGN_AUTH_MODE =
  'OAUTH_ADC'

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function asArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : []
}

function asFiniteNumber(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number =
    Number(value)

  return Number.isFinite(number)
    ? number
    : null
}

function parseGoogleDurationSeconds(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  if (
    typeof value ===
      'number' &&
    Number.isFinite(value)
  ) {
    return Math.max(
      0,
      value
    )
  }

  const text =
    String(value).trim()

  if (
    !text.endsWith('s')
  ) {
    return null
  }

  const number =
    Number(
      text.slice(
        0,
        -1
      )
    )

  if (
    !Number.isFinite(number)
  ) {
    return null
  }

  return Math.max(
    0,
    number
  )
}

function getLocalDateKey(
  value,
  timeZone
) {
  if (!value) {
    return null
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null
  }

  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit'
      }
    )

  const parts =
    formatter.formatToParts(
      date
    )

  const values =
    {}

  for (
    const part
    of parts
  ) {
    if (
      part.type ===
      'literal'
    ) {
      continue
    }

    values[
      part.type
    ] =
      part.value
  }

  if (
    !values.year ||
    !values.month ||
    !values.day
  ) {
    return null
  }

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  )
}

function getInclusiveCalendarDays({
  startTime,
  endTime,
  timeZone
} = {}) {
  const startKey =
    getLocalDateKey(
      startTime,
      timeZone
    )

  const endKey =
    getLocalDateKey(
      endTime,
      timeZone
    )

  if (
    !startKey ||
    !endKey
  ) {
    return null
  }

  const start =
    Date.parse(
      `${startKey}T00:00:00.000Z`
    )

  const end =
    Date.parse(
      `${endKey}T00:00:00.000Z`
    )

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start
  ) {
    return null
  }

  return (
    Math.floor(
      (
        end -
        start
      ) /
      86400000
    ) +
    1
  )
}

function getShipmentKey({
  visit,
  shipments
} = {}) {
  if (
    visit?.shipmentLabel
  ) {
    return String(
      visit.shipmentLabel
    )
  }

  const shipmentIndex =
    asFiniteNumber(
      visit?.shipmentIndex
    )

  if (
    shipmentIndex ===
    null
  ) {
    return null
  }

  const shipment =
    shipments[
      shipmentIndex
    ]

  if (
    shipment?.label
  ) {
    return String(
      shipment.label
    )
  }

  return (
    `shipment:${shipmentIndex}`
  )
}

function getSkippedShipmentKey({
  skipped,
  shipments
} = {}) {
  if (
    skipped?.shipmentLabel
  ) {
    return String(
      skipped.shipmentLabel
    )
  }

  const index =
    asFiniteNumber(
      skipped?.shipmentIndex
    )

  if (
    index ===
    null
  ) {
    return null
  }

  return (
    shipments[
      index
    ]?.label ||
    `shipment:${index}`
  )
}

/**
 * ============================================================
 * DAYS
 * ============================================================
 */

function groupVisitsByOperationalDay({
  visits,
  shipments,
  timeZone
} = {}) {
  const groups =
    new Map()

  for (
    const visit
    of asArray(visits)
  ) {
    /*
     * Nuestro modelo sólo contiene deliveries.
     *
     * Si Google algún día agrega explícitamente
     * otro tipo de visita, evitamos contaminar
     * la asignación.
     */
    if (
      visit?.isPickup ===
      true
    ) {
      continue
    }

    const key =
      getShipmentKey({
        visit,
        shipments
      })

    if (!key) {
      continue
    }

    const date =
      getLocalDateKey(
        visit.startTime,
        timeZone
      ) ||
      'UNKNOWN_DATE'

    if (
      !groups.has(date)
    ) {
      groups.set(
        date,
        {
          date,

          pointKeys:
            [],

          visits:
            []
        }
      )
    }

    const group =
      groups.get(date)

    group.pointKeys.push(
      key
    )

    group.visits.push({
      pointKey:
        key,

      shipmentIndex:
        visit.shipmentIndex ??
        null,

      startTime:
        visit.startTime ||
        null,

      detour:
        visit.detour ||
        null,

      visitLabel:
        visit.visitLabel ||
        null,

      raw:
        visit
    })
  }

  return Array.from(
    groups.values()
  )
    .sort(
      (
        a,
        b
      ) =>
        String(a.date)
          .localeCompare(
            String(b.date)
          )
    )
    .map(
      (
        day,
        index
      ) => ({
        day:
          index +
          1,

        date:
          day.date,

        pointKeys:
          day.pointKeys,

        visits:
          day.visits,

        firstVisitTime:
          day.visits[0]
            ?.startTime ||
          null,

        lastVisitTime:
          day.visits[
            day.visits.length -
              1
          ]
            ?.startTime ||
          null
      })
    )
}

/**
 * ============================================================
 * NORMALIZACIÓN DE RUTA
 * ============================================================
 */

function normalizeForeignRoute({
  route,
  routeIndex,
  request,
  metadata
} = {}) {
  const shipments =
    asArray(
      request
        ?.model
        ?.shipments
    )

  const vehicles =
    asArray(
      request
        ?.model
        ?.vehicles
    )

  const visits =
    asArray(
      route?.visits
    )

  const pointKeys =
    visits
      .filter(
        visit =>
          visit?.isPickup !==
          true
      )
      .map(
        visit =>
          getShipmentKey({
            visit,
            shipments
          })
      )
      .filter(Boolean)

  const vehicleIndex =
    asFiniteNumber(
      route?.vehicleIndex
    ) ??
    routeIndex

  const vehicleLabel =
    route?.vehicleLabel ||
    vehicles[
      vehicleIndex
    ]?.label ||
    `FOREIGN_EXPEDITION_${routeIndex + 1}`

  const vehicleStartTime =
    route
      ?.vehicleStartTime ||
    null

  const vehicleEndTime =
    route
      ?.vehicleEndTime ||
    null

  const days =
    groupVisitsByOperationalDay({
      visits,

      shipments,

      timeZone:
        metadata.timeZone
    })

  /*
   * Una expedición puede utilizar un día sin
   * realizar una entrega, por ejemplo:
   *
   * - desplazamiento
   * - regreso al CEDIS
   *
   * Por ello requiredDays considera primero
   * inicio/fin completos de la expedición.
   */
  const calendarDays =
    getInclusiveCalendarDays({
      startTime:
        vehicleStartTime,

      endTime:
        vehicleEndTime,

      timeZone:
        metadata.timeZone
    })

  const requiredDays =
    Math.max(
      1,

      calendarDays ??
      days.length ??
      1
    )

  const metrics =
    route?.metrics ||
    {}

  const travelDistanceMeters =
    asFiniteNumber(
      metrics
        ?.travelDistanceMeters ??
      route
        ?.travelDistanceMeters
    )

  const travelDurationSeconds =
    parseGoogleDurationSeconds(
      metrics
        ?.travelDuration ??
      route
        ?.travelDuration
    )

  const visitDurationSeconds =
    parseGoogleDurationSeconds(
      metrics
        ?.visitDuration
    )

  const breakDurationSeconds =
    parseGoogleDurationSeconds(
      metrics
        ?.breakDuration
    )

  const waitDurationSeconds =
    parseGoogleDurationSeconds(
      metrics
        ?.waitDuration
    )

  const totalDurationSeconds =
    parseGoogleDurationSeconds(
      metrics
        ?.totalDuration
    ) ??
    (
      vehicleStartTime &&
      vehicleEndTime
        ? Math.max(
            0,

            (
              new Date(
                vehicleEndTime
              ).getTime() -
              new Date(
                vehicleStartTime
              ).getTime()
            ) /
            1000
          )
        : null
    )

  return {
    routeIndex,

    vehicleIndex,

    vehicleLabel,

    pointKeys,

    requiredDays,

    daysUsed:
      requiredDays,

    days,

    visitCount:
      pointKeys.length,

    vehicleStartTime,

    vehicleEndTime,

    distanceMeters:
      travelDistanceMeters,

    travelDurationSeconds,

    visitDurationSeconds,

    breakDurationSeconds,

    waitDurationSeconds,

    totalDurationSeconds,

    breaks:
      asArray(
        route?.breaks
      ),

    transitions:
      asArray(
        route?.transitions
      ),

    routePolyline:
      route
        ?.routePolyline
        ?.points ||
      route
        ?.routePolyline
        ?.encodedPolyline ||
      null,

    metrics,

    raw:
      route
  }
}

/**
 * ============================================================
 * NORMALIZAR RESPONSE
 * ============================================================
 */

export function normalizeGoogleForeignOptimizationResponse({
  response,
  request,
  metadata
} = {}) {
  const validationErrors =
    asArray(
      response
        ?.validationErrors
    )

  const shipments =
    asArray(
      request
        ?.model
        ?.shipments
    )

  const rawRoutes =
    asArray(
      response?.routes
    )

  const normalizedRoutes =
    rawRoutes.map(
      (
        route,
        index
      ) =>
        normalizeForeignRoute({
          route,

          routeIndex:
            index,

          request,

          metadata
        })
    )

  /*
   * Para necesidad de recursos sólo cuentan
   * expediciones que realmente atienden demanda.
   */
  const activeRoutes =
    normalizedRoutes.filter(
      route =>
        route.pointKeys.length >
        0
    )

  const skippedPointKeys =
    asArray(
      response
        ?.skippedShipments
    )
      .map(
        skipped =>
          getSkippedShipmentKey({
            skipped,
            shipments
          })
      )
      .filter(Boolean)

  const assignedPointKeys =
    activeRoutes.flatMap(
      route =>
        route.pointKeys
    )

  const expectedPointKeys =
    shipments
      .map(
        shipment =>
          shipment?.label
      )
      .filter(Boolean)
      .map(String)

  const expectedSet =
    new Set(
      expectedPointKeys
    )

  const assignedSet =
    new Set(
      assignedPointKeys
    )

  const missingPointKeys =
    expectedPointKeys.filter(
      key =>
        !assignedSet.has(key)
    )

  const unexpectedPointKeys =
    assignedPointKeys.filter(
      key =>
        !expectedSet.has(key)
    )

  const assignmentCounts =
    new Map()

  for (
    const key
    of assignedPointKeys
  ) {
    assignmentCounts.set(
      key,
      (
        assignmentCounts.get(key) ||
        0
      ) +
      1
    )
  }

  const duplicatedPointKeys =
    Array.from(
      assignmentCounts.entries()
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

  const usedVehicleCount =
    asFiniteNumber(
      response
        ?.metrics
        ?.usedVehicleCount
    ) ??
    activeRoutes.length

  const maxDaysUsed =
    activeRoutes.length
      ? Math.max(
          ...activeRoutes.map(
            route =>
              route.requiredDays
          )
        )
      : 0

  const coverageValid =
    missingPointKeys.length ===
      0 &&
    unexpectedPointKeys.length ===
      0 &&
    duplicatedPointKeys.length ===
      0 &&
    assignedPointKeys.length ===
      expectedPointKeys.length

  const feasible =
    validationErrors.length ===
      0 &&
    skippedPointKeys.length ===
      0 &&
    activeRoutes.length >
      0 &&
    coverageValid &&
    maxDaysUsed <=
      metadata.maxForeignDays

  return {
    source:
      'GOOGLE_ROUTE_OPTIMIZATION_FOREIGN',

    feasible,

    usedResourceCount:
      usedVehicleCount,

    routes:
      activeRoutes,

    maxDaysUsed,

    coveragePercent:
      expectedPointKeys.length
        ? (
            (
              expectedPointKeys.length -
              missingPointKeys.length
            ) /
            expectedPointKeys.length *
            100
          )
        : 100,

    allDestinationsAssigned:
      coverageValid,

    assignedPointKeys,

    skippedPointKeys,

    missingPointKeys,

    unexpectedPointKeys,

    duplicatedPointKeys,

    validationErrors,

    metrics:
      response?.metrics ||
      null,

    requestMetadata:
      metadata,

    raw:
      response
  }
}

/**
 * ============================================================
 * SOLVE
 * ============================================================
 */

export async function solveGoogleForeignScenarioOAuth({
  origin,

  points,

  candidateResourceCount,

  maxActiveResources =
    candidateResourceCount,

  maxForeignDays =
    3,

  foreignPolicy = {},

  planningDate,

  timeZone =
    'America/Mexico_City',

  solveMode =
    GOOGLE_FOREIGN_SOLVE_MODE
      .SEARCH,

  mandatoryCoverage =
    true,

  avoidTolls =
    false,

  considerRoadTraffic =
    true,

  signal =
    undefined
} = {}) {
  if (
    mandatoryCoverage !==
    true
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      'FOREIGN_ROUTE requiere mandatoryCoverage=true.',
      {
        code:
          'FOREIGN_MANDATORY_COVERAGE_REQUIRED'
      }
    )
  }

  if (
    !planningDate
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      'FOREIGN_ROUTE requiere planningDate.',
      {
        code:
          'FOREIGN_PLANNING_DATE_REQUIRED'
      }
    )
  }

  const {
    request,
    metadata
  } =
    buildGoogleForeignOptimizationRequest({
      origin,

      points,

      candidateResourceCount,

      maxActiveResources,

      planningDate,

      timeZone,

      foreignPolicy: {
        ...foreignPolicy,

        maxForeignDays
      },

      solveMode,

      avoidTolls,

      considerRoadTraffic,

      label:
        `FOREIGN_${candidateResourceCount}_${solveMode}`
    })

  const response =
    await callGoogleOptimizationPlannerOAuth({
      request,
      signal
    })

  return normalizeGoogleForeignOptimizationResponse({
    response,
    request,
    metadata
  })
}

/**
 * ============================================================
 * FACTORY PARA AUTOMATIC FOREIGN PLANNER
 * ============================================================
 */

export function createGoogleForeignOAuthSolveScenario({
  planningDate,

  timeZone =
    'America/Mexico_City',

  avoidTolls =
    false,

  considerRoadTraffic =
    true,

  signal =
    undefined
} = {}) {
  if (
    !planningDate
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      'createGoogleForeignOAuthSolveScenario requiere planningDate.',
      {
        code:
          'FOREIGN_PLANNING_DATE_REQUIRED'
      }
    )
  }

  return async ({
    routeMode,

    origin,

    points,

    candidateResourceCount,

    maxActiveResources,

    maxForeignDays,

    foreignPolicy,

    solveMode,

    mandatoryCoverage
  }) => {
    if (
      routeMode !==
      'FOREIGN_ROUTE'
    ) {
      throw new GoogleForeignOptimizationPlannerError(
        `Modo no soportado: ${String(routeMode)}`,
        {
          code:
            'FOREIGN_UNSUPPORTED_ROUTE_MODE'
        }
      )
    }

    return solveGoogleForeignScenarioOAuth({
      origin,

      points,

      candidateResourceCount,

      maxActiveResources,

      maxForeignDays,

      foreignPolicy,

      planningDate,

      timeZone,

      solveMode,

      mandatoryCoverage,

      avoidTolls,

      considerRoadTraffic,

      signal
    })
  }
}

export default Object.freeze({
  normalizeGoogleForeignOptimizationResponse,
  solveGoogleForeignScenarioOAuth,
  createGoogleForeignOAuthSolveScenario,

  authMode:
    GOOGLE_FOREIGN_AUTH_MODE
})