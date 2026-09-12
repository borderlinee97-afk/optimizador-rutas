// backend/scripts/compare-foreign-day1-reorders-calvillo-20260828.js

import {
  pool
} from '../db/pool.js'

const GOOGLE_ROUTES_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes'

const DEPARTURE_TIME =
  '2026-08-28T14:00:00Z'
// 08:00 en Aguascalientes / America/Mexico_City.

const CLUES = Object.freeze({
  COLOMOS:
    'ASSSA000433',

  SAN_TADEO:
    'ASSSA000503',

  TEMAZCAL:
    'ASSSA000515',

  LA_LABOR:
    'ASSSA000462',

  TERRERO:
    'ASSSA000520',

  UNEME:
    'ASSSA001265',

  HOSPITAL:
    'ASSSA000404',

  CARAVANA:
    'ASSSA001092'
})

function parseGoogleDurationSeconds(
  value
) {
  if (
    typeof value !== 'string'
  ) {
    return null
  }

  const match =
    value.match(
      /^(-?\d+(?:\.\d+)?)s$/
    )

  if (
    !match
  ) {
    return null
  }

  const seconds =
    Number(
      match[1]
    )

  return Number.isFinite(
    seconds
  )
    ? seconds
    : null
}

function km(
  meters
) {
  const value =
    Number(
      meters
    )

  if (
    !Number.isFinite(value)
  ) {
    return null
  }

  return Number(
    (
      value /
      1000
    ).toFixed(2)
  )
}

function minutes(
  seconds
) {
  const value =
    Number(
      seconds
    )

  if (
    !Number.isFinite(value)
  ) {
    return null
  }

  return Number(
    (
      value /
      60
    ).toFixed(1)
  )
}

function permutations(
  values
) {
  if (
    values.length <= 1
  ) {
    return [
      values
    ]
  }

  const result =
    []

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    const current =
      values[index]

    const remaining = [
      ...values.slice(
        0,
        index
      ),

      ...values.slice(
        index + 1
      )
    ]

    for (
      const tail
      of permutations(
        remaining
      )
    ) {
      result.push([
        current,
        ...tail
      ])
    }
  }

  return result
}

async function loadPoints() {
  const requestedClues =
    Object.values(
      CLUES
    )

  const {
    rows
  } =
    await pool.query(
      `
      SELECT
        f.id,
        f.clues,
        f.unidad,
        f.latitud,
        f.longitud

      FROM
        public.farmacia f

      WHERE
        f.clues = ANY(
          $1::text[]
        )

        AND
        f.latitud IS NOT NULL

        AND
        f.longitud IS NOT NULL
      `,
      [
        requestedClues
      ]
    )

  const lookup =
    new Map()

  for (
    const row
    of rows
  ) {
    lookup.set(
      row.clues,
      {
        id:
          Number(
            row.id
          ),

        clues:
          row.clues,

        unidad:
          row.unidad,

        lat:
          Number(
            row.latitud
          ),

        lng:
          Number(
            row.longitud
          )
      }
    )
  }

  const missing =
    requestedClues.filter(
      clues =>
        !lookup.has(
          clues
        )
    )

  if (
    missing.length
  ) {
    throw new Error(
      `No se encontraron CLUES requeridas: ${missing.join(
        ', '
      )}`
    )
  }

  return lookup
}

function waypoint(
  point
) {
  return {
    location: {
      latLng: {
        latitude:
          point.lat,

        longitude:
          point.lng
      }
    }
  }
}

async function computeSequence(
  sequence
) {
  const apiKey =
    process.env
      .GMAPS_API_KEY

  if (
    !apiKey
  ) {
    throw new Error(
      'Falta GMAPS_API_KEY.'
    )
  }

  const origin =
    sequence[0]

  const destination =
    sequence[
      sequence.length -
      1
    ]

  const intermediates =
    sequence.slice(
      1,
      -1
    )

  const response =
    await fetch(
      GOOGLE_ROUTES_URL,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',

          'X-Goog-Api-Key':
            apiKey,

          'X-Goog-FieldMask':
            [
              'routes.distanceMeters',
              'routes.duration',
              'routes.staticDuration'
            ].join(',')
        },

        body:
          JSON.stringify({
            origin:
              waypoint(
                origin
              ),

            destination:
              waypoint(
                destination
              ),

            intermediates:
              intermediates.map(
                waypoint
              ),

            travelMode:
              'DRIVE',

            routingPreference:
              'TRAFFIC_AWARE',

            departureTime:
              DEPARTURE_TIME,

            computeAlternativeRoutes:
              false,

            routeModifiers: {
              avoidTolls:
                false,

              avoidHighways:
                false,

              avoidFerries:
                false
            },

            languageCode:
              'es-MX',

            units:
              'METRIC'
          })
      }
    )

  const raw =
    await response.text()

  let payload =
    null

  try {
    payload =
      raw
        ? JSON.parse(
            raw
          )
        : null
  } catch {
    payload =
      null
  }

  if (
    !response.ok
  ) {
    throw new Error(
      [
        `Google Routes HTTP ${response.status}.`,
        raw
      ].join(
        '\n'
      )
    )
  }

  const route =
    payload
      ?.routes
      ?.[0]

  if (
    !route
  ) {
    throw new Error(
      'Google Routes no devolvió routes[0].'
    )
  }

  return {
    distanceMeters:
      Number(
        route.distanceMeters
      ),

    durationSeconds:
      parseGoogleDurationSeconds(
        route.duration
      ),

    staticDurationSeconds:
      parseGoogleDurationSeconds(
        route.staticDuration
      )
  }
}

function sequenceText(
  sequence
) {
  return sequence
    .map(
      point =>
        point.unidad
    )
    .join(
      ' → '
    )
}

async function main() {
  let exitCode =
    0

  try {
    console.log(
      '\n============================================================'
    )

    console.log(
      ' COMPARACIÓN GOOGLE ROUTES — FOREIGN DÍA 1'
    )

    console.log(
      ' CALVILLO — 2026-08-28'
    )

    console.log(
      '============================================================'
    )

    const lookup =
      await loadPoints()

    const colomos =
      lookup.get(
        CLUES.COLOMOS
      )

    const sanTadeo =
      lookup.get(
        CLUES.SAN_TADEO
      )

    const temazcal =
      lookup.get(
        CLUES.TEMAZCAL
      )

    const laLabor =
      lookup.get(
        CLUES.LA_LABOR
      )

    const terrero =
      lookup.get(
        CLUES.TERRERO
      )

    const uneme =
      lookup.get(
        CLUES.UNEME
      )

    const hospital =
      lookup.get(
        CLUES.HOSPITAL
      )

    const caravana =
      lookup.get(
        CLUES.CARAVANA
      )

    /*
     * Solamente modificamos el orden de:
     *
     * - El Temazcal
     * - La Labor
     * - Terrero de la Labor
     *
     * Los demás puntos permanecen fijos.
     */

    const variablePoints = [
      temazcal,
      laLabor,
      terrero
    ]

    const orders =
      permutations(
        variablePoints
      )

    const results =
      []

    console.log(
      '\nSe evaluarán 6 alternativas reales por carretera.'
    )

    console.log(
      `DepartureTime: ${DEPARTURE_TIME}`
    )

    for (
      let index = 0;
      index < orders.length;
      index += 1
    ) {
      const variableOrder =
        orders[index]

      const sequence = [
        colomos,
        sanTadeo,
        ...variableOrder,
        uneme,
        hospital,
        caravana
      ]

      const isCurrent =
        variableOrder[0]
          .clues ===
          CLUES.TEMAZCAL
        &&
        variableOrder[1]
          .clues ===
          CLUES.LA_LABOR
        &&
        variableOrder[2]
          .clues ===
          CLUES.TERRERO

      console.log(
        `\nCalculando ${index + 1}/6${
          isCurrent
            ? ' [ACTUAL]'
            : ''
        }...`
      )

      const route =
        await computeSequence(
          sequence
        )

      results.push({
        isCurrent,

        sequence,

        distanceMeters:
          route.distanceMeters,

        durationSeconds:
          route.durationSeconds,

        staticDurationSeconds:
          route
            .staticDurationSeconds
      })

      console.log({
        distanceKm:
          km(
            route.distanceMeters
          ),

        trafficMinutes:
          minutes(
            route.durationSeconds
          ),

        staticMinutes:
          minutes(
            route
              .staticDurationSeconds
          )
      })
    }

    results.sort(
      (
        a,
        b
      ) => {
        const aStatic =
          Number.isFinite(
            a.staticDurationSeconds
          )
            ? a.staticDurationSeconds
            : Number.MAX_SAFE_INTEGER

        const bStatic =
          Number.isFinite(
            b.staticDurationSeconds
          )
            ? b.staticDurationSeconds
            : Number.MAX_SAFE_INTEGER

        if (
          aStatic !==
          bStatic
        ) {
          return (
            aStatic -
            bStatic
          )
        }

        return (
          a.distanceMeters -
          b.distanceMeters
        )
      }
    )

    const best =
      results[0]

    const current =
      results.find(
        item =>
          item.isCurrent
      )

    console.log(
      '\n============================================================'
    )

    console.log(
      ' RANKING'
    )

    console.log(
      '============================================================'
    )

    results.forEach(
      (
        result,
        index
      ) => {
        console.log(
          `\n#${index + 1}${
            result.isCurrent
              ? '  ← SECUENCIA ACTUAL'
              : ''
          }`
        )

        console.log(
          sequenceText(
            result.sequence
          )
        )

        console.log({
          distanceKm:
            km(
              result.distanceMeters
            ),

          trafficMinutes:
            minutes(
              result.durationSeconds
            ),

          staticMinutes:
            minutes(
              result
                .staticDurationSeconds
            )
        })
      }
    )

    console.log(
      '\n============================================================'
    )

    console.log(
      ' COMPARACIÓN ACTUAL VS MEJOR'
    )

    console.log(
      '============================================================'
    )

    if (
      !current
    ) {
      throw new Error(
        'No se encontró la secuencia actual.'
      )
    }

    const distanceSavingMeters =
      current.distanceMeters -
      best.distanceMeters

    const staticSavingSeconds =
      current.staticDurationSeconds -
      best.staticDurationSeconds

    const trafficSavingSeconds =
      current.durationSeconds -
      best.durationSeconds

    const distanceSavingPercent =
      current.distanceMeters > 0
        ? (
            distanceSavingMeters /
            current.distanceMeters
          ) *
          100
        : null

    const staticSavingPercent =
      current.staticDurationSeconds > 0
        ? (
            staticSavingSeconds /
            current.staticDurationSeconds
          ) *
          100
        : null

    console.log(
      '\nACTUAL'
    )

    console.log(
      sequenceText(
        current.sequence
      )
    )

    console.log({
      distanceKm:
        km(
          current.distanceMeters
        ),

      trafficMinutes:
        minutes(
          current.durationSeconds
        ),

      staticMinutes:
        minutes(
          current.staticDurationSeconds
        )
    })

    console.log(
      '\nMEJOR'
    )

    console.log(
      sequenceText(
        best.sequence
      )
    )

    console.log({
      distanceKm:
        km(
          best.distanceMeters
        ),

      trafficMinutes:
        minutes(
          best.durationSeconds
        ),

      staticMinutes:
        minutes(
          best.staticDurationSeconds
        )
    })

    console.log(
      '\nAHORRO POTENCIAL'
    )

    console.log({
      distanceKm:
        km(
          distanceSavingMeters
        ),

      distancePercent:
        Number.isFinite(
          distanceSavingPercent
        )
          ? Number(
              distanceSavingPercent.toFixed(
                2
              )
            )
          : null,

      staticMinutes:
        minutes(
          staticSavingSeconds
        ),

      staticPercent:
        Number.isFinite(
          staticSavingPercent
        )
          ? Number(
              staticSavingPercent.toFixed(
                2
              )
            )
          : null,

      trafficMinutes:
        minutes(
          trafficSavingSeconds
        )
    })

    console.log(
      '\n============================================================'
    )

    console.log(
      ' INTERPRETACIÓN'
    )

    console.log(
      '============================================================'
    )

    if (
      current ===
      best
    ) {
      console.log(
        'La secuencia marcada por el validador también es la mejor de las 6 alternativas en Google Routes.'
      )

      console.log(
        'La reversión angular probablemente es un falso positivo geométrico causado por la red carretera.'
      )
    } else {
      console.log(
        'Existe al menos una secuencia alternativa mejor según Google Routes.'
      )

      console.log(
        'La advertencia DAILY_SEVERE_DIRECTION_REVERSAL merece conservarse y debemos estudiar reparación/reoptimización.'
      )
    }
  } catch (
    error
  ) {
    exitCode =
      1

    console.error(
      '\nERROR'
    )

    console.error(
      error
    )
  } finally {
    try {
      await pool.end()
    } catch {}

    process.exitCode =
      exitCode
  }
}

await main()