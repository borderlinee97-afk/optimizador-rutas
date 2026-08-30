// src/composables/useOperationsRouting.js

import {
  computed,
  ref,
  shallowRef,
  unref,
} from 'vue'

import {
  computeRoute,
} from '../services/api.js'

const MOTOR_MODE =
  'INTEGRAL_V1_3'

const ROUTE_MODE = Object.freeze({
  ROUND_TRIP:
    'ROUND_TRIP',

  FOREIGN_ROUTE:
    'FOREIGN_ROUTE',
})

const SCOPE = Object.freeze({
  REGION:
    'REGION',

  PROJECT:
    'PROJECT',
})

const ORIGIN_MODE = Object.freeze({
  CEDIS:
    'cedis',

  COORDS:
    'coords',
})

const ROUTE_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4f46e5',
  '#65a30d',
  '#c026d3',
]

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeText(
  value
) {
  return String(
    value ??
    ''
  ).trim()
}

function normalizeUpper(
  value
) {
  return normalizeText(
    value
  ).toUpperCase()
}

function finiteNumber(
  value
) {
  const number =
    Number(
      value
    )

  return Number.isFinite(
    number
  )
    ? number
    : null
}

function optionalNumber(
  value
) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return null
  }

  return finiteNumber(
    value
  )
}

function positiveNumber(
  value
) {
  const number =
    optionalNumber(
      value
    )

  if (
    number === null ||
    number <= 0
  ) {
    return null
  }

  return number
}

function nonNegativeNumber(
  value
) {
  const number =
    optionalNumber(
      value
    )

  if (
    number === null ||
    number < 0
  ) {
    return null
  }

  return number
}

function isValidCoordinates(
  coordinates
) {
  const lat =
    finiteNumber(
      coordinates?.lat
    )

  const lng =
    finiteNumber(
      coordinates?.lng
    )

  return Boolean(
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

function normalizeCoordinates(
  coordinates
) {
  if (
    !isValidCoordinates(
      coordinates
    )
  ) {
    return null
  }

  return {
    lat:
      Number(
        coordinates.lat
      ),

    lng:
      Number(
        coordinates.lng
      ),
  }
}

function parsePointKeyId(
  pointKey
) {
  const match =
    String(
      pointKey ??
      ''
    ).match(
      /^id:(\d+)$/i
    )

  if (
    !match
  ) {
    return null
  }

  const id =
    Number(
      match[1]
    )

  return Number.isFinite(
    id
  )
    ? id
    : null
}

function unitId(
  unit
) {
  const id =
    Number(
      unit?.id
    )

  return Number.isFinite(
    id
  )
    ? id
    : null
}

function resolveUnits(
  unitsSource
) {
  const value =
    unref(
      unitsSource
    )

  return Array.isArray(
    value
  )
    ? value
    : []
}

function buildUnitLookup(
  unitsSource
) {
  const lookup =
    new Map()

  for (
    const unit
    of resolveUnits(
      unitsSource
    )
  ) {
    const id =
      unitId(
        unit
      )

    if (
      id === null
    ) {
      continue
    }

    lookup.set(
      id,
      unit
    )
  }

  return lookup
}

function getEncodedPolyline(
  route
) {
  const direct =
    normalizeText(
      route?.polyline
    )

  if (
    direct
  ) {
    return direct
  }

  const routePolyline =
    normalizeText(
      route
        ?.routePolyline
        ?.points
    )

  if (
    routePolyline
  ) {
    return routePolyline
  }

  const rawPolyline =
    normalizeText(
      route
        ?.raw
        ?.routePolyline
        ?.points
    )

  if (
    rawPolyline
  ) {
    return rawPolyline
  }

  const rawEncoded =
    normalizeText(
      route
        ?.raw
        ?.routePolyline
        ?.encodedPolyline
    )

  return rawEncoded ||
    null
}

function decodeGooglePolyline(
  encoded
) {
  const text =
    String(
      encoded ??
      ''
    )

  if (
    !text
  ) {
    return []
  }

  const path =
    []

  let index =
    0

  let latitude =
    0

  let longitude =
    0

  while (
    index <
    text.length
  ) {
    let result =
      0

    let shift =
      0

    let byte =
      null

    do {
      byte =
        text.charCodeAt(
          index++
        ) -
        63

      result |=
        (
          byte &
          0x1f
        ) <<
        shift

      shift +=
        5
    } while (
      byte >=
      0x20 &&
      index <=
      text.length
    )

    const latitudeDelta =
      result &
      1
        ? ~(
            result >>
            1
          )
        : result >>
          1

    latitude +=
      latitudeDelta

    result =
      0

    shift =
      0

    do {
      byte =
        text.charCodeAt(
          index++
        ) -
        63

      result |=
        (
          byte &
          0x1f
        ) <<
        shift

      shift +=
        5
    } while (
      byte >=
      0x20 &&
      index <=
      text.length
    )

    const longitudeDelta =
      result &
      1
        ? ~(
            result >>
            1
          )
        : result >>
          1

    longitude +=
      longitudeDelta

    path.push({
      lat:
        latitude /
        1e5,

      lng:
        longitude /
        1e5,
    })
  }

  return path
}

function routeColor(
  index
) {
  return ROUTE_COLORS[
    Number(
      index
    ) %
    ROUTE_COLORS.length
  ]
}

function routeDurationSeconds(
  route
) {
  const value =
    finiteNumber(
      route?.durationSeconds
    )

  if (
    value !== null
  ) {
    return value
  }

  const rawDuration =
    normalizeText(
      route
        ?.metrics
        ?.totalDuration
    )

  const match =
    rawDuration.match(
      /^(-?\d+(?:\.\d+)?)s$/
    )

  if (
    !match
  ) {
    return 0
  }

  return Number(
    match[1]
  ) ||
    0
}

function normalizeRoutePoint(
  pointKey,
  lookup,
  order
) {
  const id =
    parsePointKeyId(
      pointKey
    )

  const unit =
    id !== null
      ? lookup.get(
          id
        )
      : null

  return {
    order,

    pointKey,

    id,

    clues:
      unit?.clues ||
      null,

    unidad:
      unit?.unidad ||
      unit?.name ||
      unit?.clues ||
      `Unidad ${id ?? order}`,

    direccion:
      unit?.direccion ||
      null,

    region:
      unit
        ?.region_sanitaria ||
      unit?.region ||
      null,

    proyecto:
      unit?.proyecto ||
      null,

    estado:
      unit?.estado ||
      null,

    dificilAcceso:
      Boolean(
        unit?.dificil_acceso
      ),

    lat:
      finiteNumber(
        unit?.latitud ??
        unit?.lat
      ),

    lng:
      finiteNumber(
        unit?.longitud ??
        unit?.lng
      ),
  }
}

function normalizeOperationRoute(
  route,
  index,
  lookup
) {
  const pointKeys =
    Array.isArray(
      route?.pointKeys
    )
      ? route.pointKeys
      : []

  const points =
    pointKeys.map(
      (
        pointKey,
        pointIndex
      ) =>
        normalizeRoutePoint(
          pointKey,
          lookup,
          pointIndex +
            1
        )
    )

  const polyline =
    getEncodedPolyline(
      route
    )

  return {
    index,

    number:
      index +
      1,

    label:
      route
        ?.vehicleLabel ||
      `Ruta ${index + 1}`,

    vehicleIndex:
      finiteNumber(
        route?.vehicleIndex
      ),

    pointKeys,

    points,

    pointCount:
      points.length,

    distanceMeters:
      finiteNumber(
        route?.distanceMeters
      ) ||
      0,

    durationSeconds:
      routeDurationSeconds(
        route
      ),

    startTime:
      route
        ?.vehicleStartTime ||
      null,

    endTime:
      route
        ?.vehicleEndTime ||
      null,

    workdayStatus:
      route
        ?.workdayStatus ||
      null,

    graceUsedSeconds:
      finiteNumber(
        route?.graceUsedSeconds
      ) ||
      0,

    graceUsedMinutes:
      finiteNumber(
        route?.graceUsedMinutes
      ) ||
      0,

    hasTrafficInfeasibilities:
      Boolean(
        route
          ?.hasTrafficInfeasibilities
      ),

    days:
      Array.isArray(
        route?.days
      )
        ? route.days
        : [],

    polyline,

    color:
      routeColor(
        index
      ),

    raw:
      route,
  }
}

function getErrorMessage(
  error
) {
  if (
    !error
  ) {
    return 'No fue posible calcular la operación.'
  }

  if (
    typeof error ===
    'string'
  ) {
    return error
  }

  return (
    error?.message ||
    error?.error ||
    'No fue posible calcular la operación.'
  )
}

/*
 * ============================================================
 * COMPOSABLE
 * ============================================================
 */

export function useOperationsRouting({
  map = null,

  units = null,

  trackOverlay = null,

  detachOverlay = null,

  filterPharmacyMarkersByIds = null,

  clearPharmacyMarkerFilter = null,
} = {}) {
  /*
   * ==========================================================
   * UI
   * ==========================================================
   */

  const modalOpen =
    ref(false)

  const loading =
    ref(false)

  const error =
    ref(null)

  const result =
    ref(null)

  const selectedRouteIndex =
    ref(null)

  const routeLineOverlays =
    shallowRef([])

  const routeMarkerOverlays =
    shallowRef([])

  const originMarkerOverlay =
    shallowRef(null)

  let activeAbortController =
    null

  /*
   * ==========================================================
   * CRITERIOS
   * ==========================================================
   */

  const criteria =
    ref({
      scope:
        SCOPE.REGION,

      region:
        '',

      routeMode:
        ROUTE_MODE
          .ROUND_TRIP,

      originMode:
        ORIGIN_MODE
          .CEDIS,

      selectedCedisId:
        null,

      originCoords: {
        lat:
          '',

        lng:
          '',
      },

      options: {
        avoidTolls:
          false,

        avoidDificilAcceso:
          true,
      },

      maxForeignDays:
        3,

      kmPerLiter:
        '10',

      fuelPricePerLiter:
        '',

      dailyAllowance:
        '',
    })

  /*
   * ==========================================================
   * RESULTADO NORMALIZADO
   * ==========================================================
   */

  const planning =
    computed(
      () =>
        result.value
          ?.planning ||
        null
    )

  const requiredResources =
    computed(
      () =>
        planning.value
          ?.requiredResources ||
        {
          routes:
            null,

          operators:
            null,

          vehicles:
            null,

          days:
            null,
        }
    )

  const demand =
    computed(
      () =>
        planning.value
          ?.demand ||
        null
    )

  const quality =
    computed(
      () =>
        planning.value
          ?.quality ||
        null
    )

  const feasibility =
    computed(
      () =>
        planning.value
          ?.feasibility ||
        null
    )

  const planningTotals =
    computed(
      () =>
        planning.value
          ?.totals ||
        null
    )

  const operationRoutes =
    computed(
      () => {
        const rawRoutes =
          Array.isArray(
            result.value
              ?.operation
              ?.routes
          )
            ? result.value
                .operation
                .routes
            : []

        const lookup =
          buildUnitLookup(
            units
          )

        return rawRoutes.map(
          (
            route,
            index
          ) =>
            normalizeOperationRoute(
              route,
              index,
              lookup
            )
        )
      }
    )

  const hasResult =
    computed(
      () =>
        Boolean(
          result.value
        )
    )

  const hasAnyRoute =
    computed(
      () =>
        operationRoutes
          .value
          .length >
        0
    )

  const ready =
    computed(
      () =>
        Boolean(
          result.value
            ?.usable &&
          planning.value
            ?.readyForRecommendation
        )
    )

  const totalDistanceMeters =
    computed(
      () => {
        const planningDistance =
          finiteNumber(
            planningTotals.value
              ?.distanceMeters
          )

        if (
          planningDistance !==
          null
        ) {
          return planningDistance
        }

        return operationRoutes
          .value
          .reduce(
            (
              total,
              route
            ) =>
              total +
              Number(
                route
                  .distanceMeters ||
                0
              ),
            0
          )
      }
    )

  const totalTravelDurationSeconds =
    computed(
      () => {
        const planningDuration =
          finiteNumber(
            planningTotals.value
              ?.travelDurationSeconds
          )

        if (
          planningDuration !==
          null
        ) {
          return planningDuration
        }

        return operationRoutes
          .value
          .reduce(
            (
              total,
              route
            ) =>
              total +
              Number(
                route
                  .durationSeconds ||
                0
              ),
            0
          )
      }
    )

  /*
   * ==========================================================
   * ESTIMACIÓN ECONÓMICA
   * ==========================================================
   */

  const economicEstimate =
    computed(
      () => {
        const distanceKm =
          totalDistanceMeters
            .value /
          1000

        const kmPerLiter =
          positiveNumber(
            criteria.value
              .kmPerLiter
          )

        const fuelPrice =
          nonNegativeNumber(
            criteria.value
              .fuelPricePerLiter
          )

        const dailyAllowance =
          nonNegativeNumber(
            criteria.value
              .dailyAllowance
          )

        const operators =
          finiteNumber(
            requiredResources
              .value
              ?.operators
          )

        const days =
          finiteNumber(
            requiredResources
              .value
              ?.days
          )

        const fuelLiters =
          kmPerLiter
            ? distanceKm /
              kmPerLiter
            : null

        const fuelCost =
          fuelLiters !==
            null &&
          fuelPrice !==
            null
            ? fuelLiters *
              fuelPrice
            : null

        const allowanceCost =
          dailyAllowance !==
            null &&
          operators !==
            null &&
          days !==
            null
            ? dailyAllowance *
              operators *
              days
            : null

        const knownCostParts = [
          fuelCost,
          allowanceCost,
        ].filter(
          value =>
            value !==
            null
        )

        const knownTotal =
          knownCostParts.length
            ? knownCostParts.reduce(
                (
                  total,
                  value
                ) =>
                  total +
                  value,
                0
              )
            : null

        return {
          distanceKm,

          kmPerLiter,

          fuelPricePerLiter:
            fuelPrice,

          fuelLiters,

          fuelCost,

          dailyAllowance,

          allowanceCost,

          knownTotal,

          complete:
            fuelCost !==
              null &&
            allowanceCost !==
              null,

          fuelEstimated:
            fuelLiters !==
            null,

          fuelCostEstimated:
            fuelCost !==
            null,

          allowanceEstimated:
            allowanceCost !==
            null,
        }
      }
    )

  const routesWithEstimates =
    computed(
      () => {
        const kmPerLiter =
          positiveNumber(
            criteria.value
              .kmPerLiter
          )

        return operationRoutes
          .value
          .map(
            route => {
              const distanceKm =
                route
                  .distanceMeters /
                1000

              const fuelLiters =
                kmPerLiter
                  ? distanceKm /
                    kmPerLiter
                  : null

              return {
                ...route,

                estimatedFuelLiters:
                  fuelLiters,
              }
            }
          )
      }
    )

  /*
   * ==========================================================
   * ORIGEN DEL RESULTADO
   * ==========================================================
   */

  const resultOrigin =
    computed(
      () => {
        const candidates = [
          result.value
            ?.metadata
            ?.origin,

          result.value
            ?.operation
            ?.origin,

          result.value
            ?.request
            ?.origin,
        ]

        for (
          const candidate
          of candidates
        ) {
          const normalized =
            normalizeCoordinates(
              candidate
            )

          if (
            normalized
          ) {
            return normalized
          }
        }

        const criteriaOrigin =
          normalizeCoordinates(
            criteria.value
              .originCoords
          )

        return criteriaOrigin
      }
    )

  /*
   * ==========================================================
   * MODAL
   * ==========================================================
   */

  function openModal(
    initial = {}
  ) {
    if (
      initial.scope
    ) {
      criteria.value.scope =
        normalizeUpper(
          initial.scope
        ) ===
        SCOPE.PROJECT
          ? SCOPE.PROJECT
          : SCOPE.REGION
    }

    if (
      initial.region !==
      undefined
    ) {
      criteria.value.region =
        normalizeText(
          initial.region
        )
    }

    if (
      initial.routeMode
    ) {
      const mode =
        normalizeUpper(
          initial.routeMode
        )

      criteria.value.routeMode =
        mode ===
        ROUTE_MODE
          .FOREIGN_ROUTE
          ? ROUTE_MODE
              .FOREIGN_ROUTE
          : ROUTE_MODE
              .ROUND_TRIP
    }

    if (
      initial.originMode
    ) {
      criteria.value.originMode =
        normalizeText(
          initial.originMode
        ) ===
        ORIGIN_MODE.COORDS
          ? ORIGIN_MODE.COORDS
          : ORIGIN_MODE.CEDIS
    }

    if (
      initial.selectedCedisId !==
      undefined
    ) {
      criteria.value.selectedCedisId =
        initial
          .selectedCedisId
    }

    if (
      initial.originCoords
    ) {
      criteria.value.originCoords = {
        lat:
          initial
            .originCoords
            ?.lat ??
          '',

        lng:
          initial
            .originCoords
            ?.lng ??
          '',
      }
    }

    modalOpen.value =
      true

    error.value =
      null
  }

  function closeModal() {
    if (
      loading.value
    ) {
      return
    }

    modalOpen.value =
      false
  }

  /*
   * ==========================================================
   * PAYLOAD
   * ==========================================================
   */

  function buildPayload({
    estado,
    proyecto,
  } = {}) {
    const state =
      normalizeText(
        estado
      )

    const project =
      normalizeText(
        proyecto
      )

    const scope =
      criteria.value.scope ===
      SCOPE.PROJECT
        ? SCOPE.PROJECT
        : SCOPE.REGION

    const region =
      normalizeText(
        criteria.value
          .region
      )

    const routeMode =
      criteria.value
        .routeMode ===
      ROUTE_MODE
        .FOREIGN_ROUTE
        ? ROUTE_MODE
            .FOREIGN_ROUTE
        : ROUTE_MODE
            .ROUND_TRIP

    const originMode =
      criteria.value
        .originMode ===
      ORIGIN_MODE.COORDS
        ? ORIGIN_MODE.COORDS
        : ORIGIN_MODE.CEDIS

    if (
      !project
    ) {
      throw new Error(
        'Selecciona un proyecto antes de calcular.'
      )
    }

    if (
      !state
    ) {
      throw new Error(
        'No fue posible determinar el estado del proyecto.'
      )
    }

    if (
      scope ===
        SCOPE.REGION &&
      !region
    ) {
      throw new Error(
        'Selecciona una región sanitaria.'
      )
    }

    const payload = {
      motorMode:
        MOTOR_MODE,

      estado:
        state,

      proyecto:
        project,

      region_sanitaria:
        scope ===
        SCOPE.REGION
          ? region
          : null,

      scope,

      routeMode,

      originMode,

      options: {
        returnToOrigin:
          true,

        avoidTolls:
          Boolean(
            criteria.value
              .options
              ?.avoidTolls
          ),

        avoidDificilAcceso:
          Boolean(
            criteria.value
              .options
              ?.avoidDificilAcceso
          ),
      },
    }

    if (
      originMode ===
      ORIGIN_MODE.CEDIS
    ) {
      const cedisId =
        finiteNumber(
          criteria.value
            .selectedCedisId
        )

      if (
        cedisId ===
        null
      ) {
        throw new Error(
          'Selecciona un CEDIS de origen.'
        )
      }

      payload.selectedCedisId =
        cedisId
    }

    if (
      originMode ===
      ORIGIN_MODE.COORDS
    ) {
      const origin =
        normalizeCoordinates(
          criteria.value
            .originCoords
        )

      if (
        !origin
      ) {
        throw new Error(
          'Selecciona una ubicación de origen válida.'
        )
      }

      payload.origin =
        origin
    }

    if (
      routeMode ===
      ROUTE_MODE
        .FOREIGN_ROUTE
    ) {
      const maxForeignDays =
        positiveNumber(
          criteria.value
            .maxForeignDays
        )

      payload.maxForeignDays =
        Math.max(
          1,
          Math.round(
            maxForeignDays ||
            3
          )
        )
    }

    return payload
  }

  /*
   * ==========================================================
   * OVERLAY HELPERS
   * ==========================================================
   */

  function detachRouteOverlay(
    overlay
  ) {
    if (
      !overlay
    ) {
      return
    }

    try {
      if (
        typeof detachOverlay ===
        'function'
      ) {
        detachOverlay(
          overlay
        )

        return
      }
    } catch {}

    try {
      if (
        typeof overlay.setMap ===
        'function'
      ) {
        overlay.setMap(
          null
        )
      } else if (
        'map' in overlay
      ) {
        overlay.map =
          null
      }
    } catch {}
  }

  function registerOverlay(
    overlay
  ) {
    if (
      !overlay
    ) {
      return
    }

    try {
      if (
        typeof trackOverlay ===
        'function'
      ) {
        trackOverlay(
          overlay
        )
      }
    } catch {}
  }

  function clearRouteOverlays() {
    for (
      const item
      of routeLineOverlays.value
    ) {
      detachRouteOverlay(
        item?.overlay
      )
    }

    for (
      const item
      of routeMarkerOverlays.value
    ) {
      detachRouteOverlay(
        item?.marker
      )
    }

    detachRouteOverlay(
      originMarkerOverlay.value
    )

    routeLineOverlays.value =
      []

    routeMarkerOverlays.value =
      []

    originMarkerOverlay.value =
      null

    selectedRouteIndex.value =
      null
  }

  /*
   * ==========================================================
   * MARCADORES DE RUTA
   * ==========================================================
   */

  async function createRouteMarkers() {
    const mapInstance =
      unref(
        map
      )

    if (
      !mapInstance ||
      !window
        ?.google
        ?.maps
        ?.importLibrary
    ) {
      return
    }

    const {
      AdvancedMarkerElement,
      PinElement,
    } =
      await window.google.maps
        .importLibrary(
          'marker'
        )

    const created =
      []

    for (
      const route
      of operationRoutes.value
    ) {
      for (
        const point
        of route.points
      ) {
        if (
          !Number.isFinite(
            point.lat
          ) ||
          !Number.isFinite(
            point.lng
          )
        ) {
          continue
        }

        const pin =
          new PinElement({
            background:
              route.color,

            borderColor:
              '#ffffff',

            glyphColor:
              '#ffffff',

            glyph:
              String(
                point.order
              ),

            scale:
              1.15,
          })

        const marker =
          new AdvancedMarkerElement({
            map:
              mapInstance,

            position: {
              lat:
                point.lat,

              lng:
                point.lng,
            },

            title:
              `${point.order}. ${point.unidad}`,

            content:
              pin,
          })

        marker.__routeIndex =
          route.index

        marker.__pointOrder =
          point.order

        marker.__pointId =
          point.id

        marker.addEventListener(
          'gmp-click',
          () => {
            focusRoute(
              route.index
            )
          }
        )

        registerOverlay(
          marker
        )

        created.push({
          routeIndex:
            route.index,

          pointOrder:
            point.order,

          pointId:
            point.id,

          marker,
        })
      }
    }

    routeMarkerOverlays.value =
      created
  }

  async function createOriginMarker() {
    const mapInstance =
      unref(
        map
      )

    const origin =
      resultOrigin.value

    if (
      !mapInstance ||
      !origin ||
      !window
        ?.google
        ?.maps
        ?.importLibrary
    ) {
      return
    }

    const {
      AdvancedMarkerElement,
      PinElement,
    } =
      await window.google.maps
        .importLibrary(
          'marker'
        )

    const pin =
      new PinElement({
        background:
          '#111827',

        borderColor:
          '#ffffff',

        glyphColor:
          '#ffffff',

        glyph:
          'O',

        scale:
          1.3,
      })

    const marker =
      new AdvancedMarkerElement({
        map:
          mapInstance,

        position:
          origin,

        title:
          'Origen de la operación',

        content:
          pin,

        zIndex:
          1000,
      })

    registerOverlay(
      marker
    )

    originMarkerOverlay.value =
      marker
  }

  function setRouteMarkerVisibility(
    routeIndex = null
  ) {
    const mapInstance =
      unref(
        map
      )

    for (
      const item
      of routeMarkerOverlays.value
    ) {
      const visible =
        routeIndex ===
          null ||
        item.routeIndex ===
          routeIndex

      try {
        item.marker.map =
          visible
            ? mapInstance
            : null
      } catch {}
    }

    /*
     * El origen permanece visible siempre que exista
     * un resultado activo, aunque se enfoque una ruta.
     */
    if (
      originMarkerOverlay.value
    ) {
      try {
        originMarkerOverlay.value.map =
          mapInstance
      } catch {}
    }
  }

  /*
   * ==========================================================
   * DIBUJAR RUTAS
   * ==========================================================
   */

  async function drawRoutes() {
    clearRouteOverlays()

    const googleMaps =
      window
        ?.google
        ?.maps

    const mapInstance =
      unref(
        map
      )

    if (
      !googleMaps ||
      !mapInstance
    ) {
      return
    }

    /*
     * Los pines verdes generales se ocultan cuando existe
     * un resultado. A partir de aquí mandan los pines
     * numerados por ruta.
     */
    if (
      typeof filterPharmacyMarkersByIds ===
      'function'
    ) {
      try {
        filterPharmacyMarkersByIds(
          []
        )
      } catch {}
    }

    const bounds =
      new googleMaps
        .LatLngBounds()

    let hasBounds =
      false

    const lines =
      []

    for (
      const route
      of operationRoutes.value
    ) {
      if (
        !route.polyline
      ) {
        continue
      }

      const path =
        decodeGooglePolyline(
          route.polyline
        )

      if (
        !path.length
      ) {
        continue
      }

      const overlay =
        new googleMaps
          .Polyline({
            map:
              mapInstance,

            path,

            strokeColor:
              route.color,

            strokeOpacity:
              0.92,

            strokeWeight:
              5,

            clickable:
              true,

            zIndex:
              20 +
              route.index,
          })

      registerOverlay(
        overlay
      )

      for (
        const point
        of path
      ) {
        bounds.extend(
          point
        )

        hasBounds =
          true
      }

      overlay.addListener(
        'click',
        () => {
          focusRoute(
            route.index
          )
        }
      )

      lines.push({
        routeIndex:
          route.index,

        overlay,

        path,
      })
    }

    routeLineOverlays.value =
      lines

    await createRouteMarkers()

    await createOriginMarker()

    if (
      resultOrigin.value
    ) {
      bounds.extend(
        resultOrigin.value
      )

      hasBounds =
        true
    }

    if (
      hasBounds
    ) {
      mapInstance.fitBounds(
        bounds,
        70
      )
    }
  }

  /*
   * ==========================================================
   * SELECCIÓN / DESELECCIÓN
   * ==========================================================
   */

  function showAllRoutes() {
    selectedRouteIndex.value =
      null

    for (
      const item
      of routeLineOverlays.value
    ) {
      try {
        item.overlay.setOptions({
          strokeOpacity:
            0.92,

          strokeWeight:
            5,

          zIndex:
            20 +
            item.routeIndex,
        })
      } catch {}
    }

    setRouteMarkerVisibility(
      null
    )

    fitAllRoutes()
  }

  function fitAllRoutes() {
    const googleMaps =
      window
        ?.google
        ?.maps

    const mapInstance =
      unref(
        map
      )

    if (
      !googleMaps ||
      !mapInstance ||
      !routeLineOverlays
        .value
        .length
    ) {
      return
    }

    const bounds =
      new googleMaps
        .LatLngBounds()

    let count =
      0

    for (
      const item
      of routeLineOverlays.value
    ) {
      for (
        const point
        of item.path ||
        []
      ) {
        bounds.extend(
          point
        )

        count +=
          1
      }
    }

    if (
      resultOrigin.value
    ) {
      bounds.extend(
        resultOrigin.value
      )

      count +=
        1
    }

    if (
      count
    ) {
      mapInstance.fitBounds(
        bounds,
        70
      )
    }
  }

  function focusRoute(
    routeIndex
  ) {
    const normalizedIndex =
      Number(
        routeIndex
      )

    /*
     * Segundo clic sobre la misma ruta:
     * deselecciona y vuelve a mostrar todo.
     */
    if (
      selectedRouteIndex.value ===
      normalizedIndex
    ) {
      showAllRoutes()

      return
    }

    const selected =
      routeLineOverlays
        .value
        .find(
          item =>
            item.routeIndex ===
            normalizedIndex
        )

    if (
      !selected
    ) {
      return
    }

    selectedRouteIndex.value =
      normalizedIndex

    for (
      const item
      of routeLineOverlays.value
    ) {
      const isSelected =
        item.routeIndex ===
        normalizedIndex

      try {
        item.overlay.setOptions({
          strokeOpacity:
            isSelected
              ? 1
              : 0.13,

          strokeWeight:
            isSelected
              ? 7
              : 3,

          zIndex:
            isSelected
              ? 100
              : 10,
        })
      } catch {}
    }

    /*
     * Sólo quedan visibles los puntos de esta ruta.
     */
    setRouteMarkerVisibility(
      normalizedIndex
    )

    const googleMaps =
      window
        ?.google
        ?.maps

    const mapInstance =
      unref(
        map
      )

    if (
      !googleMaps ||
      !mapInstance
    ) {
      return
    }

    const bounds =
      new googleMaps
        .LatLngBounds()

    let count =
      0

    for (
      const point
      of selected.path ||
      []
    ) {
      bounds.extend(
        point
      )

      count +=
        1
    }

    if (
      resultOrigin.value
    ) {
      bounds.extend(
        resultOrigin.value
      )

      count +=
        1
    }

    if (
      count
    ) {
      mapInstance.fitBounds(
        bounds,
        90
      )
    }
  }

  /*
   * ==========================================================
   * CALCULAR
   * ==========================================================
   */

  async function calculate({
    estado,
    proyecto,
  } = {}) {
    if (
      loading.value
    ) {
      return null
    }

    let payload =
      null

    try {
      payload =
        buildPayload({
          estado,
          proyecto,
        })
    } catch (
      validationError
    ) {
      error.value =
        getErrorMessage(
          validationError
        )

      throw validationError
    }

    if (
      activeAbortController
    ) {
      try {
        activeAbortController
          .abort()
      } catch {}
    }

    const controller =
      new AbortController()

    activeAbortController =
      controller

    loading.value =
      true

    error.value =
      null

    clearRouteOverlays()

    try {
      const data =
        await computeRoute(
          payload,
          {
            signal:
              controller.signal,
          }
        )

      if (
        controller.signal
          .aborted
      ) {
        return null
      }

      if (
        !data ||
        data.status !==
          'SUCCESS' ||
        data.usable ===
          false
      ) {
        const message =
          data
            ?.error
            ?.message ||
          data?.error ||
          'El motor no produjo un resultado utilizable.'

        throw new Error(
          message
        )
      }

      if (
        data
          ?.metadata
          ?.motorMode !==
        MOTOR_MODE
      ) {
        throw new Error(
          'La respuesta recibida no pertenece al Motor Operativo Integral 1.3.'
        )
      }

      result.value =
        data

      modalOpen.value =
        false

      await drawRoutes()

      return data
    } catch (
      requestError
    ) {
      if (
        requestError?.name ===
          'AbortError' ||
        controller.signal
          .aborted
      ) {
        return null
      }

      console.error(
        '[useOperationsRouting][calculate]',
        requestError
      )

      error.value =
        getErrorMessage(
          requestError
        )

      throw requestError
    } finally {
      if (
        activeAbortController ===
        controller
      ) {
        activeAbortController =
          null
      }

      loading.value =
        false
    }
  }

  /*
   * ==========================================================
   * CERRAR RESULTADO
   * ==========================================================
   */

  function restoreMarkerFilter() {
    if (
      typeof clearPharmacyMarkerFilter !==
      'function'
    ) {
      return
    }

    try {
      clearPharmacyMarkerFilter()
    } catch {}
  }

  function clearResult() {
    if (
      activeAbortController
    ) {
      try {
        activeAbortController
          .abort()
      } catch {}

      activeAbortController =
        null
    }

    clearRouteOverlays()

    restoreMarkerFilter()

    result.value =
      null

    error.value =
      null

    loading.value =
      false

    selectedRouteIndex.value =
      null
  }

  /*
   * ==========================================================
   * RETURN
   * ==========================================================
   */

  return {
    MOTOR_MODE,

    ROUTE_MODE,
    SCOPE,
    ORIGIN_MODE,

    modalOpen,
    loading,
    error,

    criteria,

    result,
    planning,

    requiredResources,
    demand,
    quality,
    feasibility,
    planningTotals,

    operationRoutes,
    routesWithEstimates,

    hasResult,
    hasAnyRoute,
    ready,

    totalDistanceMeters,
    totalTravelDurationSeconds,

    economicEstimate,

    selectedRouteIndex,

    openModal,
    closeModal,

    buildPayload,
    calculate,

    drawRoutes,
    focusRoute,
    showAllRoutes,
    fitAllRoutes,

    clearResult,
  }
}