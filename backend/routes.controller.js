import { pool } from './db/pool.js'
import { chunkArray } from './utils/chunk.js'

const DEFAULT_PROJECT = 'JALISCO'

const ROUTE_ENGINES = {
  GOOGLE_ROUTES_PLUS: 'GOOGLE_ROUTES_PLUS',
  OWN_OPERATIVE: 'OWN_OPERATIVE',
  GOOGLE_OPTIMIZATION: 'GOOGLE_OPTIMIZATION'
}

function normalizeRouteEngine(value) {
  const engine = String(
    value || ROUTE_ENGINES.GOOGLE_ROUTES_PLUS
  ).trim().toUpperCase()

  return Object.values(ROUTE_ENGINES).includes(engine)
    ? engine
    : ROUTE_ENGINES.GOOGLE_ROUTES_PLUS
}

function normalizeProject(value) {
  return String(value || DEFAULT_PROJECT).trim()
}

function normalizeOptionalText(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function haversine(a, b) {
  const toRad = d => (d * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function parseDurationSec(d) {
  return Math.round(parseFloat(String(d).replace('s', '')) || 0)
}

function normalizeTollInfo(tollInfo) {
  if (!tollInfo) {
    return {
      hasTolls: false,
      known: false,
      currencyCode: null,
      units: null,
      nanos: null,
      amount: null,
      text: null
    }
  }

  const price = Array.isArray(tollInfo.estimatedPrice) && tollInfo.estimatedPrice.length
    ? tollInfo.estimatedPrice[0]
    : null

  if (!price) {
    return {
      hasTolls: true,
      known: false,
      currencyCode: null,
      units: null,
      nanos: null,
      amount: null,
      text: 'Peajes detectados sin importe estimado'
    }
  }

  const units = Number(price.units || 0)
  const nanos = Number(price.nanos || 0)
  const amount = units + (nanos / 1e9)

  return {
    hasTolls: true,
    known: true,
    currencyCode: price.currencyCode || null,
    units,
    nanos,
    amount,
    text: `${amount.toFixed(2)} ${price.currencyCode || ''}`.trim()
  }
}

function sumTollTotals(items = []) {
  const knownItems = items.filter(
    i =>
      i?.tolls?.known &&
      typeof i.tolls.amount === 'number'
  )

  if (!knownItems.length) {
    const anyTolls = items.some(
      i =>
        i?.tolls?.hasTolls
    )

    return {
      hasTolls: anyTolls,
      known: false,
      currencyCode: null,
      amount: null,
      text: anyTolls
        ? 'Peajes detectados sin importe estimado'
        : 'Sin peajes estimados'
    }
  }

  const currencyCode =
    knownItems[0].tolls.currencyCode ||
    null

  const sameCurrency =
    knownItems.every(
      i =>
        (
          i.tolls.currencyCode ||
          null
        ) === currencyCode
    )

  if (!sameCurrency) {
    return {
      hasTolls: true,
      known: false,
      currencyCode: null,
      amount: null,
      text: 'Peajes estimados en múltiples monedas'
    }
  }

  const amount =
    knownItems.reduce(
      (acc, item) =>
        acc +
        Number(
          item.tolls.amount ||
          0
        ),
      0
    )

  return {
    hasTolls: true,
    known: true,
    currencyCode,
    amount,
    text: `${amount.toFixed(2)} ${currencyCode || ''}`.trim()
  }
}

function isValidLatLng(point) {
  return (
    point &&
    Number.isFinite(
      Number(
        point.lat
      )
    ) &&
    Number.isFinite(
      Number(
        point.lng
      )
    )
  )
}

function clampOperatorCount(
  value,
  totalPoints
) {
  const n =
    Math.floor(
      Number(
        value ||
        1
      )
    )

  if (
    !Number.isFinite(n) ||
    n < 1
  ) {
    return 1
  }

  return Math.min(
    n,
    Math.max(
      1,
      totalPoints
    )
  )
}

function estimateFuelLiters(
  distanceMeters,
  kmPerLiter
) {
  const km =
    Number(
      distanceMeters ||
      0
    ) /
    1000

  const rendimiento =
    Number(
      kmPerLiter ||
      0
    )

  if (
    !Number.isFinite(
      rendimiento
    ) ||
    rendimiento <= 0
  ) {
    return null
  }

  return km /
    rendimiento
}

function operativeSweepOrder(
  points,
  origin
) {
  if (
    !Array.isArray(
      points
    ) ||
    points.length <= 1
  ) {
    return [
      ...points
    ]
  }

  const withScore =
    points.map(
      point => {
        const distance =
          haversine(
            origin,
            point
          )

        const angle =
          Math.atan2(
            point.lat -
              origin.lat,

            point.lng -
              origin.lng
          )

        return {
          point,
          distance,
          angle
        }
      }
    )

  withScore.sort(
    (
      a,
      b
    ) => {
      if (
        Math.abs(
          b.distance -
          a.distance
        ) >
        5000
      ) {
        return (
          b.distance -
          a.distance
        )
      }

      return (
        a.angle -
        b.angle
      )
    }
  )

  const farthest =
    withScore[0]
      ?.point

  const remaining =
    withScore
      .slice(1)
      .map(
        x =>
          x.point
      )

  return [
    farthest,
    ...nearestNeighborOrder(
      remaining,
      farthest
    )
  ].filter(Boolean)
}

function nearestNeighborOrder(
  points,
  origin
) {
  const pending = [
    ...points
  ]

  const ordered = []

  let current =
    origin

  while (
    pending.length
  ) {
    let bestIdx =
      0

    let bestDist =
      Infinity

    for (
      let i = 0;
      i < pending.length;
      i++
    ) {
      const d =
        haversine(
          current,
          pending[i]
        )

      if (
        d <
        bestDist
      ) {
        bestDist =
          d

        bestIdx =
          i
      }
    }

    const next =
      pending.splice(
        bestIdx,
        1
      )[0]

    ordered.push(
      next
    )

    current =
      next
  }

  return ordered
}

function getPointRegion(
  point
) {
  return (
    point
      ?.meta
      ?.region_sanitaria ||
    'SIN REGIÓN'
  )
}

function getCentroid(
  points = []
) {
  const total =
    points.length ||
    1

  return {
    lat:
      points.reduce(
        (
          acc,
          p
        ) =>
          acc +
          Number(
            p.lat ||
            0
          ),
        0
      ) /
      total,

    lng:
      points.reduce(
        (
          acc,
          p
        ) =>
          acc +
          Number(
            p.lng ||
            0
          ),
        0
      ) /
      total
  }
}

function estimateClusterWorkload(
  points = [],
  origin
) {
  if (
    !points.length
  ) {
    return 0
  }

  const centroid =
    getCentroid(
      points
    )

  const roundTrip =
    haversine(
      origin,
      centroid
    ) *
    2

  const ordered =
    nearestNeighborOrder(
      points,
      centroid
    )

  let internal =
    0

  for (
    let i = 1;
    i < ordered.length;
    i++
  ) {
    internal +=
      haversine(
        ordered[i - 1],
        ordered[i]
      )
  }

  return (
    roundTrip +
    internal
  )
}

function splitClusterGeographically(
  cluster
) {
  const points =
    cluster.points ||
    []

  if (
    points.length <= 1
  ) {
    return [
      cluster
    ]
  }

  const centroid =
    getCentroid(
      points
    )

  const sorted = [
    ...points
  ].sort(
    (
      a,
      b
    ) => {
      const angleA =
        Math.atan2(
          a.lat -
            centroid.lat,

          a.lng -
            centroid.lng
        )

      const angleB =
        Math.atan2(
          b.lat -
            centroid.lat,

          b.lng -
            centroid.lng
        )

      return (
        angleA -
        angleB
      )
    }
  )

  const mid =
    Math.ceil(
      sorted.length /
      2
    )

  return [
    {
      region:
        `${cluster.region} A`,

      sourceRegion:
        cluster.sourceRegion ||
        cluster.region,

      points:
        sorted.slice(
          0,
          mid
        )
    },

    {
      region:
        `${cluster.region} B`,

      sourceRegion:
        cluster.sourceRegion ||
        cluster.region,

      points:
        sorted.slice(
          mid
        )
    }
  ]
}

function getTomorrowRfc3339Time(
  clock = '08:00'
) {
  const [
    hour,
    minute
  ] =
    String(
      clock ||
      '08:00'
    )
      .split(':')
      .map(Number)

  const now =
    new Date()

  const target =
    new Date(
      now
    )

  target.setDate(
    target.getDate() +
    1
  )

  target.setHours(
    hour ||
      8,

    minute ||
      0,

    0,
    0
  )

  return target.toISOString()
}

function buildOptimizeToursRequest({
  start,
  points,
  operatorCount,
  kmPerLiter
}) {
  const cedis =
    start?.cedis ||
    {}

  const serviceSeconds =
    Number(
      cedis.minutosServicioPorUnidad ||
      45
    ) *
    60

  const globalStartTime =
    getTomorrowRfc3339Time(
      '08:00'
    )

  const globalEndTime =
    getTomorrowRfc3339Time(
      cedis.horaLimiteLlegadaUltimaUnidad ||
      '16:00'
    )

  const shipments =
    points.map(
      point => ({
        label:
          String(
            point.id
          ),

        deliveries: [
          {
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
              `${serviceSeconds}s`
          }
        ],

        penaltyCost:
          1000000
      })
    )

  const vehicles =
    Array.from(
      {
        length:
          operatorCount
      },

      (
        _,
        i
      ) => ({
        label:
          `Operador ${i + 1}`,

        startLocation: {
          latitude:
            Number(
              start.lat
            ),

          longitude:
            Number(
              start.lng
            )
        },

        endLocation: {
          latitude:
            Number(
              start.lat
            ),

          longitude:
            Number(
              start.lng
            )
        },

        costPerKilometer:
          kmPerLiter >
          0
            ? 1 /
              kmPerLiter
            : 1,

        costPerHour:
          1
      })
    )

  return {
    parent:
      `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}`,

    model: {
      shipments,
      vehicles,
      globalStartTime,
      globalEndTime
    },

    searchMode:
      'RETURN_FAST'
  }
}

async function callOptimizeTours(
  requestBody
) {
  if (
    !process.env
      .GOOGLE_CLOUD_PROJECT_ID
  ) {
    throw new Error(
      'Falta GOOGLE_CLOUD_PROJECT_ID en backend'
    )
  }

  const url =
    `https://routeoptimization.googleapis.com/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}:optimizeTours`

  const response =
    await fetch(
      url,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',

          'X-Goog-Api-Key':
            process.env
              .GMAPS_API_KEY
        },

        body:
          JSON.stringify(
            requestBody
          )
      }
    )

  const text =
    await response.text()

  let data

  try {
    data =
      JSON.parse(
        text
      )
  } catch {
    throw new Error(
      `Route Optimization non-JSON: ${text.slice(0, 500)}`
    )
  }

  if (
    !response.ok
  ) {
    console.error(
      'Route Optimization API error response:',
      data
    )

    throw new Error(
      `Route Optimization API ${response.status}: ${JSON.stringify(data)}`
    )
  }

  return data
}

async function findLodgingNear(
  point,
  radiusKm = 20,
  nextPoint = null,
  previousLodgings = []
) {
  if (
    !process.env
      .GMAPS_API_KEY
  ) {
    throw new Error(
      'Falta GMAPS_API_KEY en backend'
    )
  }

  if (
    !isValidLatLng(
      point
    )
  ) {
    return null
  }

  const radiusMeters =
    Math.min(
      Math.max(
        Number(
          radiusKm ||
          20
        ) *
          1000,

        1000
      ),

      50000
    )

  const response =
    await fetch(
      'https://places.googleapis.com/v1/places:searchNearby',
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',

          'X-Goog-Api-Key':
            process.env
              .GMAPS_API_KEY,

          'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.location',
            'places.rating',
            'places.googleMapsUri',
            'places.businessStatus',
            'places.types'
          ].join(',')
        },

        body:
          JSON.stringify({
            includedTypes: [
              'lodging'
            ],

            maxResultCount:
              10,

            locationRestriction: {
              circle: {
                center: {
                  latitude:
                    Number(
                      point.lat
                    ),

                  longitude:
                    Number(
                      point.lng
                    )
                },

                radius:
                  radiusMeters
              }
            }
          })
      }
    )

  const text =
    await response.text()

  let data

  try {
    data =
      JSON.parse(
        text
      )
  } catch {
    throw new Error(
      `Places non-JSON: ${text.slice(0, 500)}`
    )
  }

  if (
    !response.ok
  ) {
    console.error(
      'Places API error response:',
      data
    )

    throw new Error(
      `Places API ${response.status}: ${JSON.stringify(data)}`
    )
  }

  const lodgingKeywords = [
    'hotel',
    'motel',
    'posada',
    'hostal',
    'hostel',
    'hospedaje',
    'alojamiento',
    'inn',
    'suites'
  ]

  const places =
    Array.isArray(
      data.places
    )
      ? data.places
      : []

  const candidates =
    places
      .map(
        place => {
          const name =
            place.displayName
              ?.text ||
            ''

          const address =
            place.formattedAddress ||
            ''

          const textValue =
            `${name} ${address}`
              .toLowerCase()

          const lat =
            Number(
              place.location
                ?.latitude
            )

          const lng =
            Number(
              place.location
                ?.longitude
            )

          if (
            !Number.isFinite(
              lat
            ) ||
            !Number.isFinite(
              lng
            )
          ) {
            return null
          }

          const looksLikeLodging =
            lodgingKeywords.some(
              k =>
                textValue.includes(
                  k
                )
            ) ||
            (
              place.types ||
              []
            ).includes(
              'lodging'
            )

          if (
            !looksLikeLodging
          ) {
            return null
          }

          if (
            place.businessStatus &&
            place.businessStatus !==
              'OPERATIONAL'
          ) {
            return null
          }

          const lodgingPoint = {
            lat,
            lng
          }

          const distanceFromLast =
            haversine(
              point,
              lodgingPoint
            )

          const distanceToNext =
            isValidLatLng(
              nextPoint
            )
              ? haversine(
                  lodgingPoint,
                  nextPoint
                )
              : 0

          const ratingBonus =
            Number(
              place.rating ||
              0
            ) *
            3000

          return {
            id:
              place.id ||
              null,

            name:
              name ||
              'Hospedaje cercano',

            address,

            lat,
            lng,

            rating:
              place.rating ??
              null,

            googleMapsUri:
              place.googleMapsUri ||
              null,

            score:
              distanceFromLast *
                0.45 +
              distanceToNext *
                1.15 -
              ratingBonus
          }
        }
      )
      .filter(Boolean)

  for (
    const old
    of previousLodgings ||
      []
  ) {
    if (
      !isValidLatLng(
        old
      )
    ) {
      continue
    }

    const distanceFromLast =
      haversine(
        point,
        old
      )

    const distanceToNext =
      isValidLatLng(
        nextPoint
      )
        ? haversine(
            old,
            nextPoint
          )
        : 0

    candidates.push({
      ...old,

      score:
        distanceFromLast *
          0.45 +
        distanceToNext *
          1.15 -
        8000
    })
  }

  candidates.sort(
    (
      a,
      b
    ) =>
      a.score -
      b.score
  )

  return (
    candidates[0] ||
    null
  )
}

async function getProjectCedis(
  projectCode,
  selectedCedisId = null
) {
  const params = [
    projectCode
  ]

  let idFilter = ''

  if (
    selectedCedisId
  ) {
    params.push(
      Number(
        selectedCedisId
      )
    )

    idFilter =
      'AND id = $2'
  }

  const {
    rows
  } =
    await pool.query(
      `
      SELECT
        id,
        proyecto,
        nombre,
        clues,
        latitud,
        longitud,
        timezone,
        horas_turno,
        hora_limite_llegada_ultima_unidad,
        minutos_servicio_por_unidad
      FROM public.proyecto_cedis
      WHERE UPPER(BTRIM(proyecto)) = UPPER(BTRIM($1))
        ${idFilter}
        AND activo = true
      ORDER BY es_principal DESC, id ASC
      LIMIT 1
      `,
      params
    )

  return (
    rows[0] ||
    null
  )
}

function timeToSeconds(
  value = '16:00'
) {
  const [
    h,
    m
  ] =
    String(
      value
    )
      .split(':')
      .map(Number)

  return (
    (
      h ||
      0
    ) *
      3600
  ) +
    (
      (
        m ||
        0
      ) *
      60
    )
}

function secondsToClock(
  seconds
) {
  const safe =
    Math.max(
      0,
      Math.round(
        seconds ||
        0
      )
    )

  const h =
    Math.floor(
      safe /
      3600
    )

  const m =
    Math.floor(
      (
        safe %
        3600
      ) /
      60
    )

  return (
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  )
}

function getWorkdayConfig(
  start
) {
  const cedis =
    start?.cedis ||
    {}

  return {
    serviceSeconds:
      Number(
        cedis.minutosServicioPorUnidad ||
        45
      ) *
      60,

    shiftSeconds:
      Number(
        cedis.horasTurno ||
        8
      ) *
      3600,

    limitSeconds:
      timeToSeconds(
        cedis.horaLimiteLlegadaUltimaUnidad ||
        '16:00'
      )
  }
}

function estimateTravelSeconds(
  a,
  b
) {
  const meters =
    haversine(
      a,
      b
    )

  const avgMetersPerSecond =
    45_000 /
    3600

  return (
    meters /
    avgMetersPerSecond
  )
}

function estimateArrivalToLastSeconds(
  origin,
  points,
  serviceSeconds
) {
  if (
    !points.length
  ) {
    return 0
  }

  let total =
    0

  let current =
    origin

  points.forEach(
    (
      point,
      index
    ) => {
      total +=
        estimateTravelSeconds(
          current,
          point
        )

      if (
        index <
        points.length -
          1
      ) {
        total +=
          serviceSeconds
      }

      current =
        point
    }
  )

  return total
}

function splitLongDeadheadSegments(
  days,
  origin,
  maxDeadheadKm = 60
) {
  const maxMeters =
    Number(
      maxDeadheadKm ||
      60
    ) *
    1000

  const repairedDays = []

  for (
    const day
    of days
  ) {
    const points =
      day.points ||
      []

    if (
      points.length <= 1
    ) {
      repairedDays.push(
        points
      )

      continue
    }

    let current = []

    for (
      let i = 0;
      i < points.length;
      i++
    ) {
      const point =
        points[i]

      const prev =
        current.length
          ? current[
              current.length -
              1
            ]
          : origin

      const jumpMeters =
        haversine(
          prev,
          point
        )

      if (
        current.length &&
        jumpMeters >
          maxMeters
      ) {
        repairedDays.push(
          current
        )

        current = [
          point
        ]
      } else {
        current.push(
          point
        )
      }
    }

    if (
      current.length
    ) {
      repairedDays.push(
        current
      )
    }
  }

  return repairedDays
    .filter(
      dayPoints =>
        dayPoints.length
    )
    .map(
      (
        dayPoints,
        index
      ) => ({
        day:
          index +
          1,

        points:
          dayPoints
      })
    )
}

function splitPointsIntoWorkDays(
  points,
  origin,
  start,
  routeEngine =
    ROUTE_ENGINES.GOOGLE_ROUTES_PLUS
) {
  const {
    serviceSeconds,
    shiftSeconds
  } =
    getWorkdayConfig(
      start
    )

  const ordered =
    routeEngine ===
    ROUTE_ENGINES.OWN_OPERATIVE
      ? operativeSweepOrder(
          points,
          origin
        )
      : nearestNeighborOrder(
          points,
          origin
        )

  const days = []

  let currentDay = []

  for (
    const point
    of ordered
  ) {
    const candidate = [
      ...currentDay,
      point
    ]

    const estimatedArrival =
      estimateArrivalToLastSeconds(
        origin,
        candidate,
        serviceSeconds
      )

    if (
      currentDay.length &&
      estimatedArrival >
        shiftSeconds
    ) {
      days.push(
        currentDay
      )

      currentDay = [
        point
      ]
    } else {
      currentDay =
        candidate
    }
  }

  if (
    currentDay.length
  ) {
    days.push(
      currentDay
    )
  }

  let resultDays =
    days.map(
      (
        dayPoints,
        index
      ) => ({
        day:
          index +
          1,

        points:
          routeEngine ===
          ROUTE_ENGINES.OWN_OPERATIVE
            ? operativeSweepOrder(
                dayPoints,
                origin
              )
            : nearestNeighborOrder(
                dayPoints,
                origin
              )
      })
    )

  if (
    routeEngine ===
    ROUTE_ENGINES.OWN_OPERATIVE
  ) {
    resultDays =
      splitLongDeadheadSegments(
        resultDays,
        origin,
        60
      )
  }

  return resultDays
}

function buildDaySchedule({
  dayPoints,
  route,
  start
}) {
  const {
    serviceSeconds,
    shiftSeconds,
    limitSeconds
  } =
    getWorkdayConfig(
      start
    )

  const legs =
    Array.isArray(
      route?.legs
    )
      ? route.legs
      : []

  let arrivalLastSeconds =
    0

  for (
    let i = 0;
    i < dayPoints.length;
    i++
  ) {
    const leg =
      legs[i]

    arrivalLastSeconds +=
      parseDurationSec(
        leg?.duration ||
        '0s'
      )

    if (
      i <
      dayPoints.length -
        1
    ) {
      arrivalLastSeconds +=
        serviceSeconds
    }
  }

  const returnSeconds =
    parseDurationSec(
      legs[
        dayPoints.length
      ]?.duration ||
      '0s'
    )

  const totalServiceSeconds =
    dayPoints.length *
    serviceSeconds

  const driveSeconds =
    parseDurationSec(
      route?.duration ||
      '0s'
    )

  const totalSeconds =
    driveSeconds +
    totalServiceSeconds

  const suggestedStartSeconds =
    limitSeconds -
    arrivalLastSeconds

  const shiftStartSeconds =
    limitSeconds -
    shiftSeconds

  return {
    suggestedStart:
      secondsToClock(
        suggestedStartSeconds
      ),

    earliestShiftStart:
      secondsToClock(
        shiftStartSeconds
      ),

    limitLastArrival:
      secondsToClock(
        limitSeconds
      ),

    arrivalLastSeconds,

    returnSeconds,

    serviceSeconds,

    serviceMinutesPerUnit:
      Math.round(
        serviceSeconds /
        60
      ),

    totalServiceSeconds,

    driveSeconds,

    totalSeconds,

    exceedsShift:
      arrivalLastSeconds >
      shiftSeconds,

    exceedsLastArrivalLimit:
      suggestedStartSeconds <
      shiftStartSeconds
  }
}

function estimateRouteDaysForPoints(
  points = [],
  origin,
  start,
  routeEngine =
    ROUTE_ENGINES.GOOGLE_ROUTES_PLUS
) {
  if (
    !points.length
  ) {
    return 0
  }

  const days =
    splitPointsIntoWorkDays(
      points,
      origin,
      start,
      routeEngine
    )

  return (
    days.length ||
    1
  )
}

function estimateOperatorBalancedWorkload(
  points = [],
  origin,
  start,
  routeEngine =
    ROUTE_ENGINES.GOOGLE_ROUTES_PLUS
) {
  if (
    !points.length
  ) {
    return {
      days:
        0,

      meters:
        0,

      score:
        0
    }
  }

  const days =
    estimateRouteDaysForPoints(
      points,
      origin,
      start,
      routeEngine
    )

  const meters =
    estimateClusterWorkload(
      points,
      origin
    )

  const score =
    (
      days *
      1_000_000
    ) +
    meters

  return {
    days,
    meters,
    score
  }
}

function balanceOperatorGroupsByWorkload(
  groups = [],
  origin,
  start,
  routeEngine =
    ROUTE_ENGINES.GOOGLE_ROUTES_PLUS
) {
  if (
    !Array.isArray(
      groups
    ) ||
    groups.length <= 1
  ) {
    return groups
  }

  const balanced =
    groups.map(
      g => ({
        ...g,

        points: [
          ...(
            g.points ||
            []
          )
        ]
      })
    )

  const maxPasses =
    8

  const maxDayGapAllowed =
    2

  for (
    let pass = 0;
    pass < maxPasses;
    pass++
  ) {
    const scored =
      balanced
        .map(
          (
            group,
            index
          ) => ({
            index,

            ...estimateOperatorBalancedWorkload(
              group.points,
              origin,
              start,
              routeEngine
            )
          })
        )
        .sort(
          (
            a,
            b
          ) =>
            b.score -
            a.score
        )

    const heavy =
      scored[0]

    const light =
      scored[
        scored.length -
        1
      ]

    if (
      !heavy ||
      !light
    ) {
      break
    }

    const dayGap =
      heavy.days -
      light.days

    if (
      dayGap <
      maxDayGapAllowed
    ) {
      break
    }

    const heavyGroup =
      balanced[
        heavy.index
      ]

    const lightGroup =
      balanced[
        light.index
      ]

    if (
      !heavyGroup
        ?.points
        ?.length
    ) {
      break
    }

    const lightCentroid =
      lightGroup
        .points
        .length
        ? getCentroid(
            lightGroup.points
          )
        : origin

    const candidates =
      heavyGroup.points
        .map(
          point => ({
            point,

            distanceToLight:
              haversine(
                point,
                lightCentroid
              ),

            distanceToOrigin:
              haversine(
                point,
                origin
              ),

            region:
              getPointRegion(
                point
              )
          })
        )
        .sort(
          (
            a,
            b
          ) => {
            if (
              Math.abs(
                a.distanceToLight -
                b.distanceToLight
              ) >
              1000
            ) {
              return (
                a.distanceToLight -
                b.distanceToLight
              )
            }

            return (
              a.distanceToOrigin -
              b.distanceToOrigin
            )
          }
        )

    const candidate =
      candidates[0]
        ?.point

    if (
      !candidate
    ) {
      break
    }

    const candidateRegion =
      getPointRegion(
        candidate
      )

    const sameRegionLeft =
      heavyGroup.points
        .filter(
          p =>
            getPointRegion(
              p
            ) ===
            candidateRegion
        )
        .length

    if (
      heavyGroup.points.length <=
        1 ||
      sameRegionLeft <=
        1
    ) {
      break
    }

    heavyGroup.points =
      heavyGroup.points
        .filter(
          p =>
            Number(
              p.id
            ) !==
            Number(
              candidate.id
            )
        )

    lightGroup.points.push(
      candidate
    )

    heavyGroup.regions =
      Array.from(
        new Set(
          heavyGroup.points
            .map(
              getPointRegion
            )
        )
      )

    lightGroup.regions =
      Array.from(
        new Set(
          lightGroup.points
            .map(
              getPointRegion
            )
        )
      )
  }

  return balanced.map(
    group => ({
      ...group,

      points:
        routeEngine ===
        ROUTE_ENGINES.OWN_OPERATIVE
          ? operativeSweepOrder(
              group.points,
              origin
            )
          : nearestNeighborOrder(
              group.points,
              origin
            )
    })
  )
}

function splitPointsByOperators(
  points,
  operatorCount,
  origin,
  routeEngine =
    ROUTE_ENGINES.GOOGLE_ROUTES_PLUS
) {
  const count =
    clampOperatorCount(
      operatorCount,
      points.length
    )

  if (
    count <= 1
  ) {
    return [
      {
        operator:
          1,

        label:
          'Operador 1',

        regions:
          Array.from(
            new Set(
              points.map(
                getPointRegion
              )
            )
          ),

        points:
          routeEngine ===
          ROUTE_ENGINES.OWN_OPERATIVE
            ? operativeSweepOrder(
                points,
                origin
              )
            : nearestNeighborOrder(
                points,
                origin
              )
      }
    ]
  }

  const byRegion =
    new Map()

  for (
    const point
    of points
  ) {
    const region =
      getPointRegion(
        point
      )

    if (
      !byRegion.has(
        region
      )
    ) {
      byRegion.set(
        region,
        []
      )
    }

    byRegion
      .get(
        region
      )
      .push(
        point
      )
  }

  let clusters =
    Array.from(
      byRegion.entries()
    ).map(
      (
        [
          region,
          regionPoints
        ]
      ) => ({
        region,

        sourceRegion:
          region,

        points:
          regionPoints
      })
    )

  while (
    clusters.length <
    count
  ) {
    clusters.sort(
      (
        a,
        b
      ) =>
        b.points.length -
        a.points.length
    )

    const biggest =
      clusters.shift()

    if (
      !biggest ||
      biggest.points.length <=
        1
    ) {
      if (
        biggest
      ) {
        clusters.unshift(
          biggest
        )
      }

      break
    }

    clusters.push(
      ...splitClusterGeographically(
        biggest
      )
    )
  }

  clusters =
    clusters.map(
      cluster => ({
        ...cluster,

        workload:
          estimateClusterWorkload(
            cluster.points,
            origin
          ),

        centroid:
          getCentroid(
            cluster.points
          )
      })
    )

  clusters.sort(
    (
      a,
      b
    ) => {
      const angleA =
        Math.atan2(
          a.centroid.lat -
            origin.lat,

          a.centroid.lng -
            origin.lng
        )

      const angleB =
        Math.atan2(
          b.centroid.lat -
            origin.lat,

          b.centroid.lng -
            origin.lng
        )

      return (
        angleA -
        angleB
      )
    }
  )

  const operators =
    Array.from(
      {
        length:
          count
      },

      (
        _,
        i
      ) => ({
        operator:
          i +
          1,

        label:
          `Operador ${i + 1}`,

        workload:
          0,

        regions:
          [],

        points:
          []
      })
    )

  for (
    const cluster
    of clusters
  ) {
    operators.sort(
      (
        a,
        b
      ) =>
        a.workload -
        b.workload
    )

    operators[0]
      .points
      .push(
        ...cluster.points
      )

    operators[0]
      .regions
      .push(
        cluster.region
      )

    operators[0]
      .workload +=
      cluster.workload
  }

  operators.sort(
    (
      a,
      b
    ) =>
      a.operator -
      b.operator
  )

  return operators
    .filter(
      op =>
        op.points.length
    )
    .map(
      op => ({
        operator:
          op.operator,

        label:
          op.label,

        regions:
          op.regions,

        points:
          nearestNeighborOrder(
            op.points,
            origin
          )
      })
    )
}

export async function computeRoutes(
  req,
  res
) {
  try {
    const {
      region_sanitaria,
      estatus,
      strategy = 'FASTEST',
      options = {},
      origin,
      manualOrderIds,
      estado = null,
      proyecto = DEFAULT_PROJECT,
      operatorCount = 1,
      kmPerLiter = 10,
      fuelPricePerLiter = 0,
      dailyAllowance = 0,
      originMode = 'cedis',
      selectedCedisId = null,
      routeEngine = ROUTE_ENGINES.GOOGLE_ROUTES_PLUS,
      routeMode = 'ROUND_TRIP',
      maxForeignDays = 3,
      foreignOperatorsPerRoute = 1,
      lodgingSearchRadiusKm = 20
    } =
      req.body ||
      {}

    const projectCode =
      normalizeProject(
        proyecto
      )

    const stateCode =
      normalizeOptionalText(
        estado
      )

    const selectedRouteEngine =
      normalizeRouteEngine(
        routeEngine
      )

    const selectedRouteMode =
      String(
        routeMode ||
        'ROUND_TRIP'
      )
        .trim()
        .toUpperCase()

    const isForeignRoute =
      selectedRouteMode ===
      'FOREIGN_ROUTE'

    console.log(
      '==== POST /api/routes/compute ===='
    )

    console.log(
      'body:',
      JSON.stringify(
        req.body,
        null,
        2
      )
    )

    console.log(
      'Selected route engine:',
      selectedRouteEngine
    )

    console.log(
      'Selected route mode:',
      selectedRouteMode
    )

    if (
      selectedRouteEngine ===
      ROUTE_ENGINES.GOOGLE_OPTIMIZATION
    ) {
      console.log(
        'Google Route Optimization seleccionado. Usando fallback temporal GOOGLE_ROUTES_PLUS.'
      )
    }

    if (
      !process.env
        .GMAPS_API_KEY
    ) {
      return res
        .status(500)
        .json({
          error:
            'Falta GMAPS_API_KEY en backend'
        })
    }

    const STRAT =
      String(
        strategy ||
        'FASTEST'
      )
        .toUpperCase()

    const isManual =
      STRAT ===
      'MANUAL'

    const isFastest =
      STRAT ===
      'FASTEST'

    const isResources =
      STRAT ===
      'RESOURCES'

    const isNearest =
      STRAT ===
      'NEAREST_FIRST'

    const isFarthest =
      STRAT ===
      'FARTHEST_FIRST'

    const wantedIds =
      Array.isArray(
        manualOrderIds
      )
        ? manualOrderIds
            .map(Number)
            .filter(
              Number.isFinite
            )
        : []

    const hasManualSubset =
      wantedIds.length >
      0

    const isProjectWideOperators =
      !hasManualSubset &&
      !region_sanitaria &&
      Number(
        operatorCount ||
        1
      ) >
        1

    if (
      !hasManualSubset &&
      !region_sanitaria &&
      !isProjectWideOperators
    ) {
      return res
        .status(400)
        .json({
          error:
            'region_sanitaria es requerida'
        })
    }

    const avoidDificilAcceso =
      options
        .avoidDificilAcceso !==
      false

    const applyAvoidHard =
      avoidDificilAcceso &&
      !isManual &&
      !hasManualSubset

    const clauses = [
      'f.latitud IS NOT NULL',
      'f.longitud IS NOT NULL',
      'UPPER(BTRIM(f.proyecto)) = UPPER(BTRIM($1))'
    ]

    const params = [
      projectCode
    ]

    let idx =
      2

    if (
      stateCode
    ) {
      clauses.push(
        `UPPER(BTRIM(f.estado)) = UPPER(BTRIM($${idx++}))`
      )

      params.push(
        stateCode
      )
    }

    if (
      hasManualSubset
    ) {
      clauses.push(
        `f.id = ANY($${idx++}::bigint[])`
      )

      params.push(
        wantedIds
      )
    } else if (
      region_sanitaria
    ) {
      clauses.push(
        `UPPER(BTRIM(f.region_sanitaria)) = UPPER(BTRIM($${idx++}))`
      )

      params.push(
        region_sanitaria
      )
    }

    if (
      estatus
    ) {
      clauses.push(
        `f.estatus = $${idx++}::farmacia_estatus`
      )

      params.push(
        String(
          estatus
        )
          .toUpperCase()
      )
    } else {
      clauses.push(
        `COALESCE(UPPER(f.estatus::text), '') <> 'INACTIVA'`
      )
    }

    if (
      applyAvoidHard
    ) {
      clauses.push(
        'fda.clues IS NULL'
      )
    }

    const sql = `
      SELECT
        f.id,
        f.clues,
        f.unidad,
        f.region_sanitaria,
        f.estatus,
        f.supervisor,
        f.direccion,
        f.latitud,
        f.longitud,
        f.estado,
        f.proyecto,
        (fda.clues IS NOT NULL) AS dificil_acceso
      FROM public.farmacia f
      LEFT JOIN public.farmacia_dificil_acceso fda
        ON fda.clues = f.clues
      WHERE ${clauses.join(' AND ')}
      ORDER BY f.clues
      LIMIT 2000
    `

    console.log(
      'Executing SQL with params:',
      params
    )

    const {
      rows
    } =
      await pool.query(
        sql,
        params
      )

    if (
      !rows ||
      !rows.length
    ) {
      return res.json({
        input: {
          estado:
            stateCode,

          proyecto:
            projectCode,

          region_sanitaria:
            region_sanitaria ??
            null,

          strategy:
            STRAT,

          options,

          manualOrderIds:
            wantedIds
        },

        start:
          null,

        dest:
          null,

        points:
          [],

        subroutes:
          [],

        legs:
          [],

        total: {
          distanceMeters:
            0,

          duration:
            '0s'
        },

        tolls: {
          hasTolls:
            false,

          known:
            false,

          currencyCode:
            null,

          amount:
            null,

          text:
            'Sin peajes estimados'
        },

        readableOrder:
          [],

        visitOrder:
          [],

        info:
          hasManualSubset
            ? 'No hay puntos válidos con coordenadas para la selección enviada'
            : 'No hay puntos con coordenadas para esta región'
      })
    }

    const points =
      rows.map(
        r => ({
          id:
            Number(
              r.id
            ),

          name:
            r.clues,

          lat:
            Number(
              r.latitud
            ),

          lng:
            Number(
              r.longitud
            ),

          meta: {
            unidad:
              r.unidad,

            direccion:
              r.direccion,

            region_sanitaria:
              r.region_sanitaria,

            estado:
              r.estado,

            proyecto:
              r.proyecto,

            dificil:
              !!r.dificil_acceso
          }
        })
      )

    const validPoints =
      points.filter(
        isValidLatLng
      )

    if (
      !validPoints.length
    ) {
      return res
        .status(400)
        .json({
          error:
            'No hay puntos con coordenadas válidas'
        })
    }

    const cedisConfig =
      originMode ===
      'cedis'
        ? await getProjectCedis(
            projectCode,
            selectedCedisId
          )
        : null

    if (
      originMode ===
        'cedis' &&
      !cedisConfig
    ) {
      return res
        .status(400)
        .json({
          error:
            selectedCedisId
              ? 'El CEDIS seleccionado no existe, está inactivo o no pertenece al proyecto'
              : 'El proyecto no tiene un CEDIS activo configurado',

          code:
            selectedCedisId
              ? 'CEDIS_NOT_AVAILABLE'
              : 'CEDIS_NOT_CONFIGURED',

          estado:
            stateCode,

          proyecto:
            projectCode,

          selectedCedisId:
            selectedCedisId ??
            null
        })
    }

    const start =
      originMode ===
        'cedis' &&
      cedisConfig
        ? {
            lat:
              Number(
                cedisConfig.latitud
              ),

            lng:
              Number(
                cedisConfig.longitud
              ),

            isCedis:
              true,

            cedis: {
              id:
                Number(
                  cedisConfig.id
                ),

              proyecto:
                cedisConfig.proyecto,

              nombre:
                cedisConfig.nombre,

              clues:
                cedisConfig.clues,

              timezone:
                cedisConfig.timezone,

              horasTurno:
                Number(
                  cedisConfig.horas_turno ||
                  8
                ),

              horaLimiteLlegadaUltimaUnidad:
                String(
                  cedisConfig.hora_limite_llegada_ultima_unidad ||
                  '16:00'
                ),

              minutosServicioPorUnidad:
                Number(
                  cedisConfig.minutos_servicio_por_unidad ||
                  45
                )
            }
          }
        : isValidLatLng(
            origin
          )
          ? {
              lat:
                Number(
                  origin.lat
                ),

              lng:
                Number(
                  origin.lng
                ),

              isCedis:
                false
            }
          : {
              lat:
                validPoints[0]
                  .lat,

              lng:
                validPoints[0]
                  .lng,

              isCedis:
                false
            }

    let ordered = [
      ...validPoints
    ]

    if (
      hasManualSubset
    ) {
      const byId =
        new Map(
          ordered.map(
            p => [
              p.id,
              p
            ]
          )
        )

      ordered =
        wantedIds
          .map(
            id =>
              byId.get(
                Number(
                  id
                )
              )
          )
          .filter(Boolean)

      if (
        !ordered.length
      ) {
        return res.json({
          input: {
            estado:
              stateCode,

            proyecto:
              projectCode,

            region_sanitaria:
              region_sanitaria ??
              null,

            strategy:
              STRAT,

            options,

            manualOrderIds:
              wantedIds
          },

          start,

          dest:
            null,

          points:
            [],

          subroutes:
            [],

          legs:
            [],

          total: {
            distanceMeters:
              0,

            duration:
              '0s'
          },

          tolls: {
            hasTolls:
              false,

            known:
              false,

            currencyCode:
              null,

            amount:
              null,

            text:
              'Sin peajes estimados'
          },

          readableOrder: [
            'ORIGEN'
          ],

          visitOrder: [
            {
              name:
                'ORIGEN',

              lat:
                start.lat,

              lng:
                start.lng
            }
          ],

          info:
            'No hay puntos seleccionados válidos'
        })
      }

      if (
        isNearest ||
        isFarthest
      ) {
        ordered.sort(
          (
            a,
            b
          ) => {
            const da =
              haversine(
                start,
                a
              )

            const db =
              haversine(
                start,
                b
              )

            return isNearest
              ? da -
                db
              : db -
                da
          }
        )
      }
    } else if (
      isNearest ||
      isFarthest
    ) {
      ordered.sort(
        (
          a,
          b
        ) => {
          const da =
            haversine(
              start,
              a
            )

          const db =
            haversine(
              start,
              b
            )

          return isNearest
            ? da -
              db
            : db -
              da
        }
      )
    } else if (
      isManual &&
      Array.isArray(
        manualOrderIds
      )
    ) {
      const wanted =
        manualOrderIds
          .map(Number)

      const byId =
        new Map(
          ordered.map(
            p => [
              p.id,
              p
            ]
          )
        )

      ordered =
        wanted
          .map(
            id =>
              byId.get(
                id
              )
          )
          .filter(Boolean)

      if (
        !ordered.length
      ) {
        return res.json({
          input: {
            estado:
              stateCode,

            proyecto:
              projectCode,

            region_sanitaria:
              region_sanitaria ??
              null,

            strategy:
              STRAT,

            options,

            manualOrderIds:
              wanted
          },

          start,

          dest:
            null,

          points:
            [],

          subroutes:
            [],

          legs:
            [],

          total: {
            distanceMeters:
              0,

            duration:
              '0s'
          },

          tolls: {
            hasTolls:
              false,

            known:
              false,

            currencyCode:
              null,

            amount:
              null,

            text:
              'Sin peajes estimados'
          },

          readableOrder: [
            'ORIGEN'
          ],

          visitOrder: [
            {
              name:
                'ORIGEN',

              lat:
                start.lat,

              lng:
                start.lng
            }
          ],

          info:
            'No hay puntos seleccionados (Manual)'
        })
      }
    }

    const returnToOrigin =
      isForeignRoute
        ? false
        : !!options.returnToOrigin

    if (
      !returnToOrigin &&
      ordered.length <
        1
    ) {
      return res.json({
        input: {
          estado:
            stateCode,

          proyecto:
            projectCode,

          region_sanitaria:
            region_sanitaria ??
            null,

          strategy:
            STRAT,

          options,

          manualOrderIds:
            wantedIds
        },

        start,

        dest:
          null,

        points:
          ordered,

        subroutes:
          [],

        legs:
          [],

        total: {
          distanceMeters:
            0,

          duration:
            '0s'
        },

        tolls: {
          hasTolls:
            false,

          known:
            false,

          currencyCode:
            null,

          amount:
            null,

          text:
            'Sin peajes estimados'
        },

        readableOrder: [
          'ORIGEN'
        ],

        visitOrder: [
          {
            name:
              'ORIGEN',

            lat:
              start.lat,

            lng:
              start.lng
          }
        ],

        info:
          'No hay suficientes puntos para trazar'
      })
    }

    const dest =
      returnToOrigin
        ? start
        : ordered[
            ordered.length -
            1
          ]

    const fullIntermediates =
      returnToOrigin
        ? ordered
        : ordered.slice(
            0,
            -1
          )

    const MAX_INTERMEDIATES =
      Math.min(
        Number(
          options.maxStopsPerSubroute ||
          25
        ) ||
          25,

        25
      )

    async function callComputeRoutes(
      originLL,
      destinationLL,
      intermediatesLL
    ) {
      if (
        !isValidLatLng(
          originLL
        )
      ) {
        throw new Error(
          `Origen inválido: ${JSON.stringify(originLL)}`
        )
      }

      if (
        !isValidLatLng(
          destinationLL
        )
      ) {
        throw new Error(
          `Destino inválido: ${JSON.stringify(destinationLL)}`
        )
      }

      const invalidIntermediate =
        (
          intermediatesLL ||
          []
        ).find(
          p =>
            !isValidLatLng(
              p
            )
        )

      if (
        invalidIntermediate
      ) {
        throw new Error(
          `Intermedio inválido: ${JSON.stringify(invalidIntermediate)}`
        )
      }

      const shouldAvoidTolls =
        isResources
          ? true
          : !!options.avoidTolls

      const routesReq = {
        origin: {
          location: {
            latLng: {
              latitude:
                Number(
                  originLL.lat
                ),

              longitude:
                Number(
                  originLL.lng
                )
            }
          }
        },

        destination: {
          location: {
            latLng: {
              latitude:
                Number(
                  destinationLL.lat
                ),

              longitude:
                Number(
                  destinationLL.lng
                )
            }
          }
        },

        intermediates:
          (
            intermediatesLL ||
            []
          ).map(
            p => ({
              location: {
                latLng: {
                  latitude:
                    Number(
                      p.lat
                    ),

                  longitude:
                    Number(
                      p.lng
                    )
                }
              }
            })
          ),

        travelMode:
          'DRIVE',

        routingPreference:
          isFastest
            ? 'TRAFFIC_AWARE'
            : 'TRAFFIC_UNAWARE',

        computeAlternativeRoutes:
          !!options
            .showAlternatives,

        extraComputations: [
          'TOLLS'
        ],

        routeModifiers: {
          avoidTolls:
            shouldAvoidTolls,

          avoidHighways:
            !!options
              .avoidHighways,

          avoidFerries:
            !!options
              .avoidFerries
        },

        optimizeWaypointOrder:
          isFastest ||
          isResources
      }

      console.log(
        'Calling Google Routes API with payload:',
        JSON.stringify(
          routesReq,
          null,
          2
        )
      )

      const gmRes =
        await fetch(
          'https://routes.googleapis.com/directions/v2:computeRoutes',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              'X-Goog-Api-Key':
                process.env
                  .GMAPS_API_KEY,

              'X-Goog-FieldMask': [
                'routes.distanceMeters',
                'routes.duration',
                'routes.legs',
                'routes.legs.distanceMeters',
                'routes.legs.duration',
                'routes.polyline.encodedPolyline',
                'routes.optimizedIntermediateWaypointIndex',
                'routes.travelAdvisory.tollInfo',
                'routes.routeLabels'
              ].join(',')
            },

            body:
              JSON.stringify(
                routesReq
              )
          }
        )

      const text =
        await gmRes.text()

      let data

      try {
        data =
          JSON.parse(
            text
          )
      } catch {
        throw new Error(
          `Routes non-JSON: ${text.slice(0, 500)}`
        )
      }

      if (
        !gmRes.ok
      ) {
        console.error(
          'Google Routes API error response:',
          data
        )

        throw new Error(
          `Routes API ${gmRes.status}: ${JSON.stringify(data)}`
        )
      }

      if (
        !data.routes ||
        !Array.isArray(
          data.routes
        ) ||
        data.routes.length ===
          0
      ) {
        return null
      }

      return (
        data.routes[0]
      )
    }

    const requestedOperatorCount =
      clampOperatorCount(
        operatorCount,
        ordered.length
      )

    let effectiveOperatorCount =
      isForeignRoute
        ? 1
        : requestedOperatorCount

    const fuelKmPerLiter =
      Number(
        kmPerLiter ||
        0
      )

    const fuelUnitPrice =
      Number(
        fuelPricePerLiter ||
        0
      )

    const dailyAllowanceAmount =
      Number(
        dailyAllowance ||
        0
      )

    if (
      effectiveOperatorCount >=
        1 &&
      !hasManualSubset &&
      STRAT !==
        'MANUAL'
    ) {
      let optimizationResponse =
        null

      if (
        selectedRouteEngine ===
        ROUTE_ENGINES.GOOGLE_OPTIMIZATION
      ) {
        try {
          const optimizeRequest =
            buildOptimizeToursRequest({
              projectCode,
              start,
              points:
                ordered,
              operatorCount:
                effectiveOperatorCount,
              kmPerLiter
            })

          console.log(
            'Calling Route Optimization API:',
            JSON.stringify(
              optimizeRequest,
              null,
              2
            )
          )

          optimizationResponse =
            await callOptimizeTours(
              optimizeRequest
            )

          console.log(
            'Route Optimization response received.'
          )
        } catch (
          error
        ) {
          console.error(
            'Route Optimization failed:',
            error
          )
        }
      }

      let operatorGroups = []

      if (
        isForeignRoute
      ) {
        const maxAllowedDays =
          Number(
            maxForeignDays ||
            3
          )

        let bestGroups =
          null

        let bestCount =
          1

        for (
          let count = 1;
          count <= requestedOperatorCount;
          count++
        ) {
          const candidateGroups =
            splitPointsByOperators(
              ordered,
              count,
              start,
              selectedRouteEngine
            )

          const maxDaysNeeded =
            Math.max(
              ...candidateGroups.map(
                group =>
                  splitPointsIntoWorkDays(
                    group.points,
                    start,
                    start,
                    selectedRouteEngine
                  ).length
              )
            )

          bestGroups =
            candidateGroups

          bestCount =
            count

          if (
            maxDaysNeeded <=
            maxAllowedDays
          ) {
            break
          }
        }

        effectiveOperatorCount =
          bestCount

        operatorGroups =
          bestGroups ||
          []
      } else {
        operatorGroups =
          optimizationResponse
            ?.routes
            ?.length
            ? optimizationResponse.routes.map(
                (
                  route,
                  idx
                ) => {
                  const visitIds =
                    (
                      route.visits ||
                      []
                    )
                      .map(
                        v =>
                          Number(
                            v.shipmentLabel
                          )
                      )
                      .filter(Boolean)

                  const routePoints =
                    visitIds
                      .map(
                        id =>
                          ordered.find(
                            p =>
                              Number(
                                p.id
                              ) ===
                              id
                          )
                      )
                      .filter(Boolean)

                  return {
                    operator:
                      idx +
                      1,

                    label:
                      `Operador ${idx + 1}`,

                    regions:
                      Array.from(
                        new Set(
                          routePoints.map(
                            getPointRegion
                          )
                        )
                      ),

                    points:
                      routePoints
                  }
                }
              )
            : splitPointsByOperators(
                ordered,
                effectiveOperatorCount,
                start,
                selectedRouteEngine
              )
      }

      if (
        selectedRouteEngine ===
        ROUTE_ENGINES.OWN_OPERATIVE
      ) {
        operatorGroups =
          operatorGroups.map(
            group => ({
              ...group,

              points:
                operativeSweepOrder(
                  group.points,
                  start
                )
            })
          )
      }

      const operatorRoutes = []
      const allSubroutes = []
      const allLegs = []

      const allVisitOrder = [
        {
          name:
            'ORIGEN',

          lat:
            start.lat,

          lng:
            start.lng
        }
      ]

      const allReadableOrder = [
        'ORIGEN'
      ]

      let operatorTotalDistance =
        0

      let operatorTotalDuration =
        0

      for (
        const group
        of operatorGroups
      ) {
        if (
          !group.points.length
        ) {
          continue
        }

        const operatorStart =
          start

        let currentForeignStart =
          start

        const workDays =
          splitPointsIntoWorkDays(
            group.points,
            operatorStart,
            start,
            selectedRouteEngine
          )

        let operatorDistance =
          0

        let operatorDuration =
          0

        let operatorLegs = []
        let operatorTollItems = []
        let operatorOrder = []

        const operatorDays = []

        const previousForeignLodgings = []

        for (
          const workDay
          of workDays
        ) {
          const dayPoints =
            (
              workDay.points ||
              []
            ).filter(
              p =>
                p?.id
            )

          if (
            !dayPoints.length
          ) {
            continue
          }

          const isLastForeignDay =
            isForeignRoute &&
            Number(
              workDay.day
            ) ===
              Number(
                workDays.length
              )

          const lastPointOfDay =
            dayPoints[
              dayPoints.length -
              1
            ]

          const nextWorkDay =
            workDays.find(
              d =>
                Number(
                  d.day
                ) ===
                Number(
                  workDay.day
                ) +
                  1
            )

          const nextFirstPoint =
            nextWorkDay
              ?.points
              ?.[0] ||
            null

          const needsOvernightStop =
            isForeignRoute &&
            !isLastForeignDay &&
            !!nextFirstPoint

          const lodging =
            needsOvernightStop
              ? await findLodgingNear(
                  lastPointOfDay,
                  lodgingSearchRadiusKm,
                  nextFirstPoint,
                  previousForeignLodgings
                )
              : null

          if (
            lodging
          ) {
            previousForeignLodgings.push(
              lodging
            )
          }

          const dayDestination =
            isForeignRoute
              ? (
                  needsOvernightStop
                    ? (
                        lodging ||
                        lastPointOfDay
                      )
                    : start
                )
              : start

          const dayIntermediates =
            dayPoints

          const routeStart =
            isForeignRoute
              ? currentForeignStart
              : operatorStart

          const r =
            await callComputeRoutes(
              routeStart,
              dayDestination,
              dayIntermediates
            )

          if (
            !r
          ) {
            continue
          }

          if (
            isForeignRoute
          ) {
            currentForeignStart =
              dayDestination
          }

          let dayOrder =
            dayIntermediates

          if (
            Array.isArray(
              r.optimizedIntermediateWaypointIndex
            ) &&
            r.optimizedIntermediateWaypointIndex.length
          ) {
            const optimizedOrder =
              r.optimizedIntermediateWaypointIndex
                .map(
                  i =>
                    dayIntermediates[
                      i
                    ]
                )
                .filter(
                  p =>
                    p?.id
                )

            if (
              optimizedOrder.length
            ) {
              dayOrder =
                optimizedOrder
            }
          }

          dayOrder =
            dayOrder.filter(
              p =>
                p?.id
            )

          if (
            !dayOrder.length
          ) {
            continue
          }

          const dayDistance =
            Number(
              r.distanceMeters ||
              0
            )

          const dayDriveSeconds =
            parseDurationSec(
              r.duration ||
              '0s'
            )

          const daySchedule =
            buildDaySchedule({
              dayPoints:
                dayOrder,

              route:
                r,

              start
            })

          const dayFuel =
            estimateFuelLiters(
              dayDistance,
              fuelKmPerLiter
            )

          const dayTolls =
            normalizeTollInfo(
              r.travelAdvisory
                ?.tollInfo
            )

          const dayLegs =
            Array.isArray(
              r.legs
            )
              ? r.legs
              : []

          operatorDistance +=
            dayDistance

          operatorDuration +=
            daySchedule.totalSeconds

          operatorLegs.push(
            ...dayLegs
          )

          operatorTollItems.push({
            tolls:
              dayTolls
          })

          operatorOrder.push(
            ...dayOrder
          )

          allSubroutes.push({
            operator:
              group.operator,

            day:
              workDay.day,

            label:
              `Ruta ${group.operator} · Operador ${workDay.day}`,

            polyline:
              r.polyline
                ?.encodedPolyline,

            distance:
              dayDistance,

            duration:
              `${daySchedule.totalSeconds}s`,

            driveDuration:
              r.duration ||
              '0s',

            count:
              dayOrder.length,

            fuelLiters:
              dayFuel,

            tolls:
              dayTolls,

            schedule:
              daySchedule
          })

          operatorDays.push({
            day:
              workDay.day,

            label:
              `Operador ${workDay.day}`,

            pointCount:
              dayOrder.length,

            distanceMeters:
              dayDistance,

            duration:
              `${daySchedule.totalSeconds}s`,

            driveDuration:
              r.duration ||
              '0s',

            durationSeconds:
              daySchedule.totalSeconds,

            fuelLiters:
              dayFuel,

            tolls:
              dayTolls,

            schedule:
              daySchedule,

            startRest:
              isForeignRoute &&
              routeStart !==
                start
                ? {
                    name:
                      routeStart.name ||
                      'Inicio desde descanso',

                    address:
                      routeStart.address ||
                      '',

                    lat:
                      routeStart.lat,

                    lng:
                      routeStart.lng,

                    googleMapsUri:
                      routeStart.googleMapsUri ||
                      null
                  }
                : null,

            lodging,

            points:
              dayOrder.map(
                (
                  p,
                  index
                ) => ({
                  order:
                    index +
                    1,

                  id:
                    p.id,

                  name:
                    p.name,

                  lat:
                    p.lat,

                  lng:
                    p.lng,

                  meta:
                    p.meta
                })
              )
          })

          allVisitOrder.push(
            {
              name:
                isForeignRoute
                  ? `OPERADOR ${group.operator} - DÍA ${workDay.day} - INICIO`
                  : `RUTA ${group.operator} - OPERADOR ${workDay.day} - ORIGEN`,

              lat:
                routeStart.lat,

              lng:
                routeStart.lng
            },

            ...dayOrder.map(
              p => ({
                id:
                  p.id,

                name:
                  p.name,

                lat:
                  p.lat,

                lng:
                  p.lng,

                operator:
                  group.operator,

                day:
                  workDay.day
              })
            ),

            {
              name:
                isForeignRoute
                  ? `OPERADOR ${group.operator} - DÍA ${workDay.day} - FIN`
                  : `RUTA ${group.operator} - OPERADOR ${workDay.day} - ORIGEN`,

              lat:
                dayDestination.lat,

              lng:
                dayDestination.lng
            }
          )

          allReadableOrder.push(
            `Ruta ${group.operator} · Operador ${workDay.day}`,

            ...dayOrder.map(
              p =>
                p.name
            ),

            `Ruta ${group.operator} · Operador ${workDay.day} · ORIGEN`
          )
        }

        if (
          !operatorDays.length
        ) {
          continue
        }

        const operatorFuel =
          estimateFuelLiters(
            operatorDistance,
            fuelKmPerLiter
          )

        const operatorTolls =
          sumTollTotals(
            operatorTollItems
          )

        const operatorFuelCost =
          operatorFuel != null &&
          fuelUnitPrice >
            0
            ? operatorFuel *
              fuelUnitPrice
            : 0

        const operatorAllowanceCost =
          dailyAllowanceAmount >
          0
            ? operatorDays.length *
              dailyAllowanceAmount
            : 0

        const operatorEstimatedCost =
          operatorFuelCost +
          operatorAllowanceCost

        allLegs.push(
          ...operatorLegs
        )

        operatorRoutes.push({
          operator:
            group.operator,

          label:
            `Ruta ${group.operator}`,

          regions:
            group.regions ||
            [],

          pointCount:
            operatorOrder.length,

          distanceMeters:
            operatorDistance,

          duration:
            `${operatorDuration}s`,

          durationSeconds:
            operatorDuration,

          fuelLiters:
            operatorFuel,

          costs: {
            fuelPricePerLiter:
              fuelUnitPrice,

            fuelCost:
              operatorFuelCost,

            dailyAllowance:
              dailyAllowanceAmount,

            routeDays:
              operatorDays.length,

            allowanceCost:
              operatorAllowanceCost,

            totalEstimatedCost:
              operatorEstimatedCost
          },

          tolls:
            operatorTolls,

          days:
            operatorDays,

          points:
            operatorOrder.map(
              (
                p,
                index
              ) => ({
                order:
                  index +
                  1,

                id:
                  p.id,

                name:
                  p.name,

                lat:
                  p.lat,

                lng:
                  p.lng,

                meta:
                  p.meta
              })
            )
        })

        operatorTotalDistance +=
          operatorDistance

        operatorTotalDuration +=
          operatorDuration
      }

      const totalFuelLiters =
        estimateFuelLiters(
          operatorTotalDistance,
          fuelKmPerLiter
        )

      const totalFuelCost =
        totalFuelLiters !=
          null &&
        fuelUnitPrice >
          0
          ? totalFuelLiters *
            fuelUnitPrice
          : 0

      const totalRouteDays =
        operatorRoutes.reduce(
          (
            acc,
            op
          ) =>
            acc +
            Number(
              op.days
                ?.length ||
              0
            ),
          0
        )

      const totalAllowanceCost =
        dailyAllowanceAmount >
        0
          ? totalRouteDays *
            dailyAllowanceAmount
          : 0

      const totalEstimatedCost =
        totalFuelCost +
        totalAllowanceCost

      const tolls =
        sumTollTotals(
          allSubroutes
        )

      return res.json({
        input: {
          estado:
            stateCode,

          proyecto:
            projectCode,

          region_sanitaria:
            region_sanitaria ??
            null,

          scope:
            isProjectWideOperators
              ? 'PROJECT'
              : 'REGION',

          strategy:
            STRAT,

          routeMode:
            selectedRouteMode,

          operatorCount:
            effectiveOperatorCount,

          requestedOperators:
            Number(
              operatorCount ||
              1
            ),

          usedOperators:
            operatorRoutes.length,

          maxForeignDays:
            Number(
              maxForeignDays ||
              3
            ),

          kmPerLiter:
            fuelKmPerLiter,

          originMode,

          selectedCedisId,

          options,

          manualOrderIds:
            wantedIds
        },

        mode:
          'OPERATORS',

        start,

        dest:
          start,

        points:
          ordered,

        operatorRoutes,

        subroutes:
          allSubroutes,

        legs:
          allLegs,

        total: {
          distanceMeters:
            operatorTotalDistance,

          duration:
            `${operatorTotalDuration}s`,

          fuelLiters:
            totalFuelLiters,

          fuelCost:
            totalFuelCost,

          allowanceCost:
            totalAllowanceCost,

          totalEstimatedCost
        },

        fuel: {
          kmPerLiter:
            fuelKmPerLiter,

          totalLiters:
            totalFuelLiters,

          totalFuelCost
        },

        costs: {
          fuelPricePerLiter:
            fuelUnitPrice,

          dailyAllowance:
            dailyAllowanceAmount,

          totalRouteDays,

          fuelCost:
            totalFuelCost,

          allowanceCost:
            totalAllowanceCost,

          totalEstimatedCost
        },

        tolls,

        readableOrder:
          allReadableOrder,

        visitOrder:
          allVisitOrder,

        info:
          isForeignRoute
            ? `${operatorRoutes.length} operador(es) calculado(s) para ruta foránea`
            : `${operatorRoutes.length} ruta(s) calculada(s) con operadores requeridos`,

        warnings:
          isForeignRoute &&
          operatorRoutes.some(
            op =>
              Number(
                op.days
                  ?.length ||
                0
              ) >
              Number(
                maxForeignDays ||
                3
              )
          )
            ? [
                `La ruta foránea supera el límite de ${Number(maxForeignDays || 3)} días con los operadores disponibles.`
              ]
            : []
      })
    }

    const subroutes = []
    const mergedLegs = []

    let totalDistance =
      0

    let totalDuration =
      0

    const finalOrderNames =
      []

    const finalOrderPoints = [
      {
        name:
          'ORIGEN',

        lat:
          start.lat,

        lng:
          start.lng
      }
    ]

    if (
      fullIntermediates.length <=
      MAX_INTERMEDIATES
    ) {
      const r =
        await callComputeRoutes(
          start,
          dest,
          fullIntermediates
        )

      if (
        !r
      ) {
        return res.json({
          input: {
            estado:
              stateCode,

            proyecto:
              projectCode,

            region_sanitaria:
              region_sanitaria ??
              null,

            strategy:
              STRAT,

            options,

            manualOrderIds:
              wantedIds
          },

          start,

          dest,

          points:
            ordered,

          subroutes:
            [],

          legs:
            [],

          total: {
            distanceMeters:
              0,

            duration:
              '0s'
          },

          tolls: {
            hasTolls:
              false,

            known:
              false,

            currencyCode:
              null,

            amount:
              null,

            text:
              'Sin peajes estimados'
          },

          readableOrder: [
            'ORIGEN',

            returnToOrigin
              ? 'ORIGEN'
              : (
                  dest?.name ??
                  'DESTINO'
                )
          ],

          visitOrder:
            finalOrderPoints,

          info:
            'No se encontró ruta para la configuración solicitada'
        })
      }

      const legs =
        Array.isArray(
          r.legs
        )
          ? r.legs
          : []

      mergedLegs.push(
        ...legs
      )

      const count =
        Array.isArray(
          r.optimizedIntermediateWaypointIndex
        ) &&
        r.optimizedIntermediateWaypointIndex.length
          ? r.optimizedIntermediateWaypointIndex.length
          : fullIntermediates.length

      subroutes.push({
        polyline:
          r.polyline
            ?.encodedPolyline,

        distance:
          r.distanceMeters ||
          0,

        duration:
          r.duration ||
          '0s',

        count,

        tolls:
          normalizeTollInfo(
            r.travelAdvisory
              ?.tollInfo
          )
      })

      totalDistance +=
        r.distanceMeters ||
        0

      totalDuration +=
        parseDurationSec(
          r.duration ||
          '0s'
        )

      let batchOrder =
        fullIntermediates

      if (
        Array.isArray(
          r.optimizedIntermediateWaypointIndex
        ) &&
        r.optimizedIntermediateWaypointIndex.length
      ) {
        batchOrder =
          r.optimizedIntermediateWaypointIndex
            .map(
              i =>
                fullIntermediates[
                  i
                ]
            )
            .filter(Boolean)
      }

      batchOrder.forEach(
        p => {
          finalOrderPoints.push({
            id:
              p.id,

            name:
              p.name,

            lat:
              p.lat,

            lng:
              p.lng
          })
        }
      )

      const names =
        batchOrder.map(
          p =>
            p.name
        )

      const tail =
        returnToOrigin
          ? [
              'ORIGEN'
            ]
          : [
              dest?.name ??
              'DESTINO'
            ]

      finalOrderNames.push(
        'ORIGEN',
        ...names,
        ...tail
      )

      if (
        returnToOrigin
      ) {
        finalOrderPoints.push({
          name:
            'ORIGEN',

          lat:
            start.lat,

          lng:
            start.lng
        })
      }
    } else {
      const batches =
        chunkArray(
          fullIntermediates,
          MAX_INTERMEDIATES
        )

      let currentOrigin =
        start

      for (
        let i = 0;
        i < batches.length;
        i++
      ) {
        const lastBatch =
          i ===
          batches.length -
            1

        const currentBatch =
          batches[i]

        const currentDestination =
          lastBatch
            ? dest
            : currentBatch[
                currentBatch.length -
                1
              ]

        const r =
          await callComputeRoutes(
            currentOrigin,
            currentDestination,
            currentBatch
          )

        if (
          !r
        ) {
          continue
        }

        const legs =
          Array.isArray(
            r.legs
          )
            ? r.legs
            : []

        mergedLegs.push(
          ...legs
        )

        const count =
          Array.isArray(
            r.optimizedIntermediateWaypointIndex
          ) &&
          r.optimizedIntermediateWaypointIndex.length
            ? r.optimizedIntermediateWaypointIndex.length
            : currentBatch.length

        subroutes.push({
          polyline:
            r.polyline
              ?.encodedPolyline,

          distance:
            r.distanceMeters ||
            0,

          duration:
            r.duration ||
            '0s',

          count,

          tolls:
            normalizeTollInfo(
              r.travelAdvisory
                ?.tollInfo
            )
        })

        totalDistance +=
          r.distanceMeters ||
          0

        totalDuration +=
          parseDurationSec(
            r.duration ||
            '0s'
          )

        let batchOrder =
          currentBatch

        if (
          Array.isArray(
            r.optimizedIntermediateWaypointIndex
          ) &&
          r.optimizedIntermediateWaypointIndex.length
        ) {
          batchOrder =
            r.optimizedIntermediateWaypointIndex
              .map(
                i =>
                  currentBatch[
                    i
                  ]
              )
              .filter(Boolean)
        }

        batchOrder.forEach(
          p => {
            finalOrderPoints.push({
              id:
                p.id,

              name:
                p.name,

              lat:
                p.lat,

              lng:
                p.lng
            })
          }
        )

        currentOrigin =
          currentDestination
      }

      if (
        returnToOrigin &&
        (
          dest.lat !==
            start.lat ||
          dest.lng !==
            start.lng
        )
      ) {
        const rBack =
          await callComputeRoutes(
            currentOrigin,
            start,
            []
          )

        if (
          rBack
        ) {
          const legs =
            Array.isArray(
              rBack.legs
            )
              ? rBack.legs
              : []

          mergedLegs.push(
            ...legs
          )

          subroutes.push({
            polyline:
              rBack.polyline
                ?.encodedPolyline,

            distance:
              rBack.distanceMeters ||
              0,

            duration:
              rBack.duration ||
              '0s',

            count:
              0,

            tolls:
              normalizeTollInfo(
                rBack.travelAdvisory
                  ?.tollInfo
              )
          })

          totalDistance +=
            rBack.distanceMeters ||
            0

          totalDuration +=
            parseDurationSec(
              rBack.duration ||
              '0s'
            )
        }

        finalOrderPoints.push({
          name:
            'ORIGEN',

          lat:
            start.lat,

          lng:
            start.lng
        })
      }

      const namesOnly =
        finalOrderPoints
          .filter(
            p =>
              p.name &&
              p.name !==
                'ORIGEN'
          )
          .map(
            p =>
              p.name
          )

      finalOrderNames.push(
        'ORIGEN',

        ...namesOnly,

        ...(
          returnToOrigin
            ? [
                'ORIGEN'
              ]
            : [
                dest?.name ??
                'DESTINO'
              ]
        )
      )
    }

    const tolls =
      sumTollTotals(
        subroutes
      )

    return res.json({
      input: {
        estado:
          stateCode,

        proyecto:
          projectCode,

        region_sanitaria:
          region_sanitaria ??
          null,

        strategy:
          STRAT,

        options,

        manualOrderIds:
          wantedIds
      },

      start,

      dest,

      points:
        ordered,

      subroutes,

      legs:
        mergedLegs,

      total: {
        distanceMeters:
          totalDistance,

        duration:
          `${totalDuration}s`
      },

      tolls,

      readableOrder:
        finalOrderNames,

      visitOrder:
        finalOrderPoints
    })
  } catch (
    e
  ) {
    console.error(
      'computeRoutes error:',
      e
    )

    console.error(
      e?.stack
    )

    return res
      .status(500)
      .json({
        error:
          'Error calculando rutas',

        details:
          e?.message ||
          String(
            e
          )
      })
  }
}

function buildStaticMapUrl({
  subroutes = [],
  center,
  zoom,
  width = 640,
  height = 360
}) {
  const base =
    'https://maps.googleapis.com/maps/api/staticmap'

  const params =
    new URLSearchParams()

  params.set(
    'size',
    `${width}x${height}`
  )

  params.set(
    'scale',
    '2'
  )

  params.set(
    'maptype',
    'roadmap'
  )

  params.set(
    'center',
    `${Number(center.lat)},${Number(center.lng)}`
  )

  params.set(
    'zoom',
    String(
      Number(
        zoom
      )
    )
  )

  for (
    const sr
    of subroutes
  ) {
    if (
      !sr?.polyline
    ) {
      continue
    }

    params.append(
      'path',
      `weight:5|color:0x2563EB|enc:${sr.polyline}`
    )
  }

  params.set(
    'key',
    process.env
      .GMAPS_API_KEY
  )

  return (
    `${base}?${params.toString()}`
  )
}

export async function getStaticRouteMap(
  req,
  res
) {
  try {
    if (
      !process.env
        .GMAPS_API_KEY
    ) {
      return res
        .status(500)
        .json({
          error:
            'Falta GMAPS_API_KEY en backend'
        })
    }

    const {
      subroutes = [],
      center = null,
      zoom = null,
      width = 640,
      height = 360
    } =
      req.body ||
      {}

    if (
      !center ||
      !Number.isFinite(
        Number(
          center.lat
        )
      ) ||
      !Number.isFinite(
        Number(
          center.lng
        )
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'center es requerido'
        })
    }

    if (
      !Number.isFinite(
        Number(
          zoom
        )
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'zoom es requerido'
        })
    }

    const safeWidth =
      Math.min(
        Math.max(
          Number(
            width
          ) ||
          640,

          100
        ),

        640
      )

    const safeHeight =
      Math.min(
        Math.max(
          Number(
            height
          ) ||
          360,

          100
        ),

        640
      )

    const url =
      buildStaticMapUrl({
        subroutes,

        center: {
          lat:
            Number(
              center.lat
            ),

          lng:
            Number(
              center.lng
            )
        },

        zoom:
          Number(
            zoom
          ),

        width:
          safeWidth,

        height:
          safeHeight
      })

    const response =
      await fetch(
        url
      )

    if (
      !response.ok
    ) {
      const txt =
        await response.text()

      throw new Error(
        `Static Maps ${response.status}: ${txt.slice(0, 300)}`
      )
    }

    const arrayBuffer =
      await response.arrayBuffer()

    const buffer =
      Buffer.from(
        arrayBuffer
      )

    res.setHeader(
      'Content-Type',
      'image/png'
    )

    res.setHeader(
      'Cache-Control',
      'no-store'
    )

    return res.send(
      buffer
    )
  } catch (
    e
  ) {
    console.error(
      'getStaticRouteMap error:',
      e
    )

    console.error(
      e?.stack
    )

    return res
      .status(500)
      .json({
        error:
          'Error generando mapa estático',

        details:
          e?.message ||
          String(
            e
          )
      })
  }
}