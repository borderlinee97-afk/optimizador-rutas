// backend/routing/providers/googleForeignOptimizationPlanner.provider.js

import {
  isValidLatLng
} from '../utils/geo.js'

import {
  normalizeForeignPlanningPolicy
} from '../services/automaticForeignResourcePlanner.service.js'

/**
 * ============================================================
 * GOOGLE ROUTE OPTIMIZATION — FOREIGN_ROUTE MODEL
 * ============================================================
 *
 * Modelo multiday continuo:
 *
 * DÍA 1
 * ORIGEN
 * → entregas
 * → desplazamiento de cierre
 * → descanso nocturno
 *
 * DÍA 2
 * continúa desde la ubicación donde descansó
 * → entregas
 * → desplazamiento de cierre
 * → descanso nocturno
 *
 * ...
 *
 * ÚLTIMO DÍA
 * → entregas
 * → ORIGEN
 *
 * ============================================================
 *
 * PRINCIPIOS:
 *
 * - NO regreso diario al CEDIS.
 * - El vehículo sólo tiene un startLocation:
 *   el origen inicial.
 * - Sólo tiene un endLocation:
 *   el mismo origen, al terminar la expedición.
 * - Cada entrega tiene una ventana 08:00–16:00
 *   por cada día operativo permitido.
 * - Los descansos nocturnos inmovilizan el vehículo.
 * - El hotel todavía NO forma parte del solver.
 *   Se seleccionará posteriormente cerca del punto
 *   operativo donde quedó la ruta.
 */

export const GOOGLE_FOREIGN_OPTIMIZATION_SOURCE =
  'GOOGLE_ROUTE_OPTIMIZATION_FOREIGN'

export const GOOGLE_FOREIGN_SOLVE_MODE =
  Object.freeze({
    SEARCH:
      'SEARCH',

    FINAL_QUALITY:
      'FINAL_QUALITY'
  })

export class GoogleForeignOptimizationPlannerError
  extends Error {
  constructor(
    message,
    {
      code =
        'GOOGLE_FOREIGN_OPTIMIZATION_ERROR',

      details =
        null
    } = {}
  ) {
    super(message)

    this.name =
      'GoogleForeignOptimizationPlannerError'

    this.code =
      code

    this.details =
      details
  }
}

/**
 * ============================================================
 * DATE / TIME HELPERS
 * ============================================================
 */

function pad2(
  value
) {
  return String(
    value
  ).padStart(
    2,
    '0'
  )
}

function parseDateOnly(
  value
) {
  const match =
    String(
      value || ''
    )
      .trim()
      .match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      )

  if (!match) {
    throw new GoogleForeignOptimizationPlannerError(
      `Fecha inválida: ${String(value)}`,
      {
        code:
          'INVALID_PLANNING_DATE'
      }
    )
  }

  const year =
    Number(match[1])

  const month =
    Number(match[2])

  const day =
    Number(match[3])

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    )

  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !==
      day
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      `Fecha inexistente: ${String(value)}`,
      {
        code:
          'INVALID_PLANNING_DATE'
      }
    )
  }

  return {
    year,
    month,
    day
  }
}

function parseClock(
  value
) {
  const match =
    String(
      value || ''
    )
      .trim()
      .match(
        /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
      )

  if (!match) {
    throw new GoogleForeignOptimizationPlannerError(
      `Hora inválida: ${String(value)}`,
      {
        code:
          'INVALID_CLOCK'
      }
    )
  }

  const hour =
    Number(match[1])

  const minute =
    Number(match[2])

  const second =
    Number(
      match[3] ||
      0
    )

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      `Hora inválida: ${String(value)}`,
      {
        code:
          'INVALID_CLOCK'
      }
    )
  }

  return {
    hour,
    minute,
    second,

    seconds:
      hour *
        3600 +
      minute *
        60 +
      second
  }
}

function addDaysToDateString(
  dateString,
  days
) {
  const {
    year,
    month,
    day
  } =
    parseDateOnly(
      dateString
    )

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day +
          Number(days)
      )
    )

  return [
    date.getUTCFullYear(),
    pad2(
      date.getUTCMonth() +
      1
    ),
    pad2(
      date.getUTCDate()
    )
  ].join('-')
}

function secondsToClock(
  seconds
) {
  const normalized =
    Number(seconds)

  if (
    !Number.isFinite(
      normalized
    ) ||
    normalized < 0 ||
    normalized >=
      86400
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      `No es posible convertir ${String(seconds)} a hora del día.`,
      {
        code:
          'INVALID_DAY_SECONDS'
      }
    )
  }

  const hour =
    Math.floor(
      normalized /
      3600
    )

  const minute =
    Math.floor(
      (
        normalized %
        3600
      ) /
      60
    )

  const second =
    Math.floor(
      normalized %
      60
    )

  return (
    `${pad2(hour)}:` +
    `${pad2(minute)}:` +
    `${pad2(second)}`
  )
}

/**
 * Obtiene los componentes locales de un instante
 * dentro de un IANA time zone.
 */
function getZonedParts(
  date,
  timeZone
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
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

        second:
          '2-digit',

        hourCycle:
          'h23'
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
      Number(
        part.value
      )
  }

  return {
    year:
      values.year,

    month:
      values.month,

    day:
      values.day,

    hour:
      values.hour,

    minute:
      values.minute,

    second:
      values.second
  }
}

/**
 * Convierte:
 *
 * 2026-08-27 + 08:00 + America/Mexico_City
 *
 * a:
 *
 * Timestamp UTC RFC3339.
 *
 * No hardcodeamos UTC-6 porque el motor debe
 * poder operar internacionalmente.
 */
export function zonedLocalDateTimeToUtcIso({
  date,
  clock,
  timeZone
} = {}) {
  const localDate =
    parseDateOnly(
      date
    )

  const localClock =
    parseClock(
      clock
    )

  const desiredUtcLike =
    Date.UTC(
      localDate.year,
      localDate.month -
        1,
      localDate.day,
      localClock.hour,
      localClock.minute,
      localClock.second
    )

  /*
   * Primer candidato:
   *
   * tratamos temporalmente el horario local
   * como UTC y después corregimos según
   * el time zone real.
   */
  let candidate =
    desiredUtcLike

  for (
    let attempt = 0;
    attempt < 4;
    attempt++
  ) {
    const zoned =
      getZonedParts(
        new Date(
          candidate
        ),
        timeZone
      )

    const representedUtcLike =
      Date.UTC(
        zoned.year,
        zoned.month -
          1,
        zoned.day,
        zoned.hour,
        zoned.minute,
        zoned.second
      )

    const correction =
      desiredUtcLike -
      representedUtcLike

    candidate +=
      correction

    if (
      Math.abs(
        correction
      ) <
      1000
    ) {
      break
    }
  }

  const finalDate =
    new Date(
      candidate
    )

  const verification =
    getZonedParts(
      finalDate,
      timeZone
    )

  const matches =
    verification.year ===
      localDate.year &&
    verification.month ===
      localDate.month &&
    verification.day ===
      localDate.day &&
    verification.hour ===
      localClock.hour &&
    verification.minute ===
      localClock.minute &&
    verification.second ===
      localClock.second

  if (!matches) {
    throw new GoogleForeignOptimizationPlannerError(
      `El horario local ${date} ${clock} no pudo resolverse en ${timeZone}.`,
      {
        code:
          'UNRESOLVABLE_ZONED_TIME',

        details: {
          date,
          clock,
          timeZone,
          verification
        }
      }
    )
  }

  return finalDate
    .toISOString()
}

/**
 * ============================================================
 * POINTS
 * ============================================================
 */

function getPointKey(
  point,
  index
) {
  if (
    point?.__plannerKey
  ) {
    return String(
      point.__plannerKey
    )
  }

  if (
    point?.id !== null &&
    point?.id !==
      undefined
  ) {
    return (
      `id:${String(
        point.id
      )}`
    )
  }

  return (
    `index:${index}`
  )
}

function validatePoints(
  points
) {
  if (
    !Array.isArray(
      points
    ) ||
    !points.length
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      'Se requieren destinos para construir FOREIGN_ROUTE.',
      {
        code:
          'FOREIGN_POINTS_REQUIRED'
      }
    )
  }

  const invalid =
    points
      .map(
        (
          point,
          index
        ) => ({
          point,
          index
        })
      )
      .filter(
        ({
          point
        }) =>
          !isValidLatLng(
            point
          )
      )

  if (
    invalid.length
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      `${invalid.length} destino(s) contienen coordenadas inválidas.`,
      {
        code:
          'FOREIGN_INVALID_POINTS',

        details:
          invalid.map(
            ({
              index,
              point
            }) => ({
              index,
              point
            })
          )
      }
    )
  }
}

/**
 * ============================================================
 * DAILY TIME WINDOWS
 * ============================================================
 */

export function buildForeignDailyDeliveryWindows({
  planningDate,
  maxForeignDays,
  startClock,
  lastArrivalClock,
  timeZone
} = {}) {
  const windows =
    []

  for (
    let dayIndex = 0;
    dayIndex <
      maxForeignDays;
    dayIndex++
  ) {
    const date =
      addDaysToDateString(
        planningDate,
        dayIndex
      )

    windows.push({
      day:
        dayIndex +
        1,

      date,

      startTime:
        zonedLocalDateTimeToUtcIso({
          date,
          clock:
            startClock,
          timeZone
        }),

      endTime:
        zonedLocalDateTimeToUtcIso({
          date,
          clock:
            lastArrivalClock,
          timeZone
        })
    })
  }

  return windows
}

/**
 * ============================================================
 * OVERNIGHT BREAKS
 * ============================================================
 *
 * Ejemplo:
 *
 * jornada preferente:
 * 08:00 - 16:00
 *
 * cierre máximo:
 * 17:30
 *
 * descanso:
 * 17:30 - 08:00 siguiente día
 *
 * = 14 h 30 min.
 *
 * Durante el break:
 *
 * - no se realizan visitas
 * - no se continúa conduciendo
 *
 * El descanso ocurre donde se encuentre
 * físicamente la expedición.
 */

export function buildForeignOvernightBreaks({
  planningDate,
  maxForeignDays,
  startClock,
  shiftSeconds,
  dayCloseTravelGraceSeconds,
  timeZone
} = {}) {
  if (
    maxForeignDays <=
    1
  ) {
    return {
      hardDayEndClock:
        null,

      hardDaySpanSeconds:
        shiftSeconds +
        dayCloseTravelGraceSeconds,

      overnightRestSeconds:
        0,

      breaks: []
    }
  }

  const start =
    parseClock(
      startClock
    )

  const hardDaySpanSeconds =
    shiftSeconds +
    dayCloseTravelGraceSeconds

  const hardEndSeconds =
    start.seconds +
    hardDaySpanSeconds

  if (
    hardEndSeconds >=
    86400
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      'La jornada FOREIGN_ROUTE excede el día calendario.',
      {
        code:
          'FOREIGN_DAY_TOO_LONG',

        details: {
          startClock,
          shiftSeconds,
          dayCloseTravelGraceSeconds
        }
      }
    )
  }

  const hardDayEndClock =
    secondsToClock(
      hardEndSeconds
    )

  const overnightRestSeconds =
    86400 -
    hardDaySpanSeconds

  if (
    overnightRestSeconds <=
    0
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      'FOREIGN_ROUTE requiere descanso nocturno positivo.',
      {
        code:
          'FOREIGN_OVERNIGHT_REST_INVALID'
      }
    )
  }

  const breaks =
    []

  /*
   * Si maxForeignDays = 3:
   *
   * break 1:
   * noche día 1 -> día 2
   *
   * break 2:
   * noche día 2 -> día 3
   */
  for (
    let dayIndex = 0;
    dayIndex <
      maxForeignDays -
        1;
    dayIndex++
  ) {
    const date =
      addDaysToDateString(
        planningDate,
        dayIndex
      )

    const breakStart =
      zonedLocalDateTimeToUtcIso({
        date,
        clock:
          hardDayEndClock,
        timeZone
      })

    breaks.push({
      dayAfter:
        dayIndex +
        1,

      earliestStartTime:
        breakStart,

      latestStartTime:
        breakStart,

      minDuration:
        `${overnightRestSeconds}s`
    })
  }

  return {
    hardDayEndClock,

    hardDaySpanSeconds,

    overnightRestSeconds,

    breaks
  }
}

/**
 * ============================================================
 * REQUEST BUILDER
 * ============================================================
 */

export function buildGoogleForeignOptimizationRequest({
  origin,

  points,

  candidateResourceCount,

  maxActiveResources =
    candidateResourceCount,

  planningDate,

  timeZone =
    'America/Mexico_City',

  foreignPolicy = {},

  solveMode =
    GOOGLE_FOREIGN_SOLVE_MODE
      .SEARCH,

  avoidTolls =
    false,

  considerRoadTraffic =
    true,

  label =
    'FOREIGN_ROUTE_PLANNER'
} = {}) {
  if (
    !isValidLatLng(
      origin
    )
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      'FOREIGN_ROUTE requiere un origen válido.',
      {
        code:
          'FOREIGN_INVALID_ORIGIN'
      }
    )
  }

  validatePoints(
    points
  )

  const resources =
    Math.floor(
      Number(
        candidateResourceCount
      )
    )

  if (
    !Number.isFinite(
      resources
    ) ||
    resources <
      1
  ) {
    throw new GoogleForeignOptimizationPlannerError(
      'candidateResourceCount debe ser >= 1.',
      {
        code:
          'FOREIGN_INVALID_RESOURCE_COUNT'
      }
    )
  }

  const activeResources =
    Math.max(
      1,
      Math.min(
        resources,
        Math.floor(
          Number(
            maxActiveResources
          ) ||
          resources
        )
      )
    )

  const policy =
    normalizeForeignPlanningPolicy({
      ...foreignPolicy
    })

  const deliveryWindows =
    buildForeignDailyDeliveryWindows({
      planningDate,

      maxForeignDays:
        policy.maxForeignDays,

      startClock:
        policy.startClock,

      lastArrivalClock:
        policy.lastArrivalClock,

      timeZone
    })

  const overnight =
    buildForeignOvernightBreaks({
      planningDate,

      maxForeignDays:
        policy.maxForeignDays,

      startClock:
        policy.startClock,

      shiftSeconds:
        policy.shiftSeconds,

      dayCloseTravelGraceSeconds:
        policy
          .dayCloseTravelGraceSeconds,

      timeZone
    })

  const firstDate =
    planningDate

  const lastDate =
    addDaysToDateString(
      planningDate,
      policy.maxForeignDays -
        1
    )

  const globalStartTime =
    zonedLocalDateTimeToUtcIso({
      date:
        firstDate,

      clock:
        policy.startClock,

      timeZone
    })

  const globalEndTime =
    zonedLocalDateTimeToUtcIso({
      date:
        lastDate,

      clock:
        overnight
          .hardDayEndClock ||
        secondsToClock(
          parseClock(
            policy.startClock
          ).seconds +
          policy.shiftSeconds +
          policy
            .dayCloseTravelGraceSeconds
        ),

      timeZone
    })

  const routeSpanSeconds =
    Math.round(
      (
        new Date(
          globalEndTime
        ).getTime() -
        new Date(
          globalStartTime
        ).getTime()
      ) /
      1000
    )

  const shipments =
    points.map(
      (
        point,
        index
      ) => {
        const key =
          getPointKey(
            point,
            index
          )

        return {
          label:
            key,

          deliveries: [
            {
              label:
                key,

              arrivalLocation: {
                latitude:
                  Number(
                    point.lat
                  ),

                longitude:
                  Number(
                    point.lng
                  )
              },

              duration:
                `${policy.serviceSecondsPerUnit}s`,

              /*
               * Una ventana por cada día.
               *
               * No especificamos penaltyCost:
               * la entrega es obligatoria.
               */
              timeWindows:
                deliveryWindows.map(
                  window => ({
                    startTime:
                      window.startTime,

                    endTime:
                      window.endTime
                  })
                )
            }
          ]
        }
      }
    )

  const vehicles =
    Array.from(
      {
        length:
          resources
      },
      (
        _,
        index
      ) => {
        const vehicle = {
          label:
            `FOREIGN_EXPEDITION_${index + 1}`,

          startLocation: {
            latitude:
              Number(
                origin.lat
              ),

            longitude:
              Number(
                origin.lng
              )
          },

          /*
           * Sólo el final de TODA la expedición
           * regresa al origen.
           *
           * No existen endLocations diarios.
           */
          endLocation: {
            latitude:
              Number(
                origin.lat
              ),

            longitude:
              Number(
                origin.lng
              )
          },

          startTimeWindows: [
            {
              startTime:
                globalStartTime,

              endTime:
                globalStartTime
            }
          ],

          /*
           * Puede terminar día 1, día 2, ...
           * hasta el límite del último día.
           */
          endTimeWindows: [
            {
              startTime:
                globalStartTime,

              endTime:
                globalEndTime
            }
          ],

          /*
           * Prioridad:
           *
           * - minimizar recursos se decide fuera,
           *   en AutomaticForeignResourcePlanner.
           *
           * Dentro de una cantidad candidata:
           *
           * - reducir km
           * - reducir horas de conducción
           *
           * NO usamos costPerHour porque incluiría
           * los descansos nocturnos.
           */
          fixedCost:
            10000,

          costPerKilometer:
            1,

          costPerTraveledHour:
            100,

          routeDurationLimit: {
            maxDuration:
              `${routeSpanSeconds}s`
          },

          routeModifiers: {
            avoidTolls:
              Boolean(
                avoidTolls
              ),

            avoidHighways:
              false,

            avoidFerries:
              false
          }
        }

        if (
          overnight.breaks.length
        ) {
          vehicle.breakRule = {
            breakRequests:
              overnight
                .breaks
                .map(
                  item => ({
                    earliestStartTime:
                      item.earliestStartTime,

                    latestStartTime:
                      item.latestStartTime,

                    minDuration:
                      item.minDuration
                  })
                )
          }
        }

        return vehicle
      }
    )

  const searchMode =
    solveMode ===
      GOOGLE_FOREIGN_SOLVE_MODE
        .FINAL_QUALITY
      ? 'CONSUME_ALL_AVAILABLE_TIME'
      : 'RETURN_FAST'

  const timeout =
    solveMode ===
      GOOGLE_FOREIGN_SOLVE_MODE
        .FINAL_QUALITY
      ? '60s'
      : '20s'

  const request = {
    timeout,

    solvingMode:
      'DEFAULT_SOLVE',

    searchMode,

    considerRoadTraffic:
      Boolean(
        considerRoadTraffic
      ),

    populatePolylines:
      solveMode ===
      GOOGLE_FOREIGN_SOLVE_MODE
        .FINAL_QUALITY,

    populateTransitionPolylines:
      false,

    label,

    maxValidationErrors:
      50,

    model: {
      globalStartTime,

      globalEndTime,

      shipments,

      vehicles,

      maxActiveVehicles:
        activeResources
    }
  }

  const metadata = {
    source:
      GOOGLE_FOREIGN_OPTIMIZATION_SOURCE,

    routeMode:
      'FOREIGN_ROUTE',

    planningDate,

    timeZone,

    candidateResourceCount:
      resources,

    maxActiveResources:
      activeResources,

    maxForeignDays:
      policy.maxForeignDays,

    serviceMinutesPerUnit:
      policy
        .serviceMinutesPerUnit,

    startClock:
      policy.startClock,

    lastArrivalClock:
      policy
        .lastArrivalClock,

    hardDayEndClock:
      overnight
        .hardDayEndClock,

    dayCloseTravelGraceMinutes:
      policy
        .dayCloseTravelGraceMinutes,

    overnightRestSeconds:
      overnight
        .overnightRestSeconds,

    overnightBreakCount:
      overnight
        .breaks
        .length,

    globalStartTime,

    globalEndTime,

    routeSpanSeconds,

    dailyDeliveryWindows:
      deliveryWindows,

    overnightBreaks:
      overnight.breaks,

    mandatoryShipments:
      shipments.every(
        shipment =>
          !Object.prototype
            .hasOwnProperty
            .call(
              shipment,
              'penaltyCost'
            )
      )
  }

  return {
    request,
    metadata
  }
}

/**
 * ============================================================
 * DIAGNOSTIC SUMMARY
 * ============================================================
 */

export function summarizeGoogleForeignRequest({
  request,
  metadata
} = {}) {
  const firstVehicle =
    request
      ?.model
      ?.vehicles?.[0] ||
    null

  const firstShipment =
    request
      ?.model
      ?.shipments?.[0] ||
    null

  return {
    routeMode:
      metadata
        ?.routeMode ||
      'FOREIGN_ROUTE',

    shipments:
      request
        ?.model
        ?.shipments
        ?.length ||
      0,

    vehicles:
      request
        ?.model
        ?.vehicles
        ?.length ||
      0,

    maxActiveVehicles:
      request
        ?.model
        ?.maxActiveVehicles ??
      null,

    maxForeignDays:
      metadata
        ?.maxForeignDays ??
      null,

    globalStartTime:
      request
        ?.model
        ?.globalStartTime ||
      null,

    globalEndTime:
      request
        ?.model
        ?.globalEndTime ||
      null,

    startClock:
      metadata
        ?.startClock ||
      null,

    lastArrivalClock:
      metadata
        ?.lastArrivalClock ||
      null,

    hardDayEndClock:
      metadata
        ?.hardDayEndClock ||
      null,

    deliveryWindowsPerShipment:
      firstShipment
        ?.deliveries?.[0]
        ?.timeWindows
        ?.length ||
      0,

    overnightBreaksPerVehicle:
      firstVehicle
        ?.breakRule
        ?.breakRequests
        ?.length ||
      0,

    fixedCost:
      firstVehicle
        ?.fixedCost ??
      null,

    costPerTraveledHour:
      firstVehicle
        ?.costPerTraveledHour ??
      null,

    costPerKilometer:
      firstVehicle
        ?.costPerKilometer ??
      null,

    costPerHour:
      firstVehicle
        ?.costPerHour ??
      null,

    routeDurationLimit:
      firstVehicle
        ?.routeDurationLimit
        ?.maxDuration ||
      null,

    mandatoryShipments:
      metadata
        ?.mandatoryShipments ===
      true,

    considerRoadTraffic:
      request
        ?.considerRoadTraffic ===
      true
  }
}

export default Object.freeze({
  zonedLocalDateTimeToUtcIso,
  buildForeignDailyDeliveryWindows,
  buildForeignOvernightBreaks,
  buildGoogleForeignOptimizationRequest,
  summarizeGoogleForeignRequest
})