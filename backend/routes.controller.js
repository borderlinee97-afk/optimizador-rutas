import pkg from 'pg'
import { chunkArray } from './utils/chunk.js'

const { Pool } = pkg

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
})

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
  const knownItems = items.filter(i => i?.tolls?.known && typeof i.tolls.amount === 'number')

  if (!knownItems.length) {
    const anyTolls = items.some(i => i?.tolls?.hasTolls)
    return {
      hasTolls: anyTolls,
      known: false,
      currencyCode: null,
      amount: null,
      text: anyTolls ? 'Peajes detectados sin importe estimado' : 'Sin peajes estimados'
    }
  }

  const currencyCode = knownItems[0].tolls.currencyCode || null
  const sameCurrency = knownItems.every(i => (i.tolls.currencyCode || null) === currencyCode)

  if (!sameCurrency) {
    return {
      hasTolls: true,
      known: false,
      currencyCode: null,
      amount: null,
      text: 'Peajes estimados en múltiples monedas'
    }
  }

  const amount = knownItems.reduce((acc, item) => acc + Number(item.tolls.amount || 0), 0)

  return {
    hasTolls: true,
    known: true,
    currencyCode,
    amount,
    text: `${amount.toFixed(2)} ${currencyCode || ''}`.trim()
  }
}

export async function computeRoutes(req, res) {
  try {
    const {
      region_sanitaria,
      estatus,
      strategy = 'FASTEST',
      options = {},
      origin,
      manualOrderIds
    } = req.body

    if (!process.env.GMAPS_API_KEY) {
      return res.status(500).json({ error: 'Falta GMAPS_API_KEY en backend/.env' })
    }

    const STRAT = String(strategy || 'FASTEST').toUpperCase()
    const isManual = STRAT === 'MANUAL'
    const isFastest = STRAT === 'FASTEST'
    const isResources = STRAT === 'RESOURCES'
    const isNearest = STRAT === 'NEAREST_FIRST'
    const isFarthest = STRAT === 'FARTHEST_FIRST'

    const wantedIds = Array.isArray(manualOrderIds)
      ? manualOrderIds.map(Number).filter(Number.isFinite)
      : []

    const hasManualSubset = wantedIds.length > 0

    if (!hasManualSubset && !region_sanitaria) {
      return res.status(400).json({ error: 'region_sanitaria es requerida' })
    }

    const avoidDificilAcceso = options.avoidDificilAcceso !== false
    const applyAvoidHard = avoidDificilAcceso && !isManual && !hasManualSubset

    const clauses = ['f.latitud IS NOT NULL', 'f.longitud IS NOT NULL']
    const params = []
    let idx = 1

    if (hasManualSubset) {
      clauses.push(`f.id = ANY($${idx++}::bigint[])`)
      params.push(wantedIds)
    } else {
      clauses.push(`f.region_sanitaria = $${idx++}`)
      params.push(region_sanitaria)
    }

    if (estatus) {
      clauses.push(`f.estatus = $${idx++}::farmacia_estatus`)
      params.push(String(estatus).toUpperCase())
    }

    if (applyAvoidHard) {
      clauses.push(`fda.clues IS NULL`)
    }

    const sql = `
      SELECT
        f.id, f.clues, f.unidad, f.region_sanitaria, f.estatus, f.supervisor,
        f.direccion, f.latitud, f.longitud,
        (fda.clues IS NOT NULL) AS dificil_acceso
      FROM public.farmacia f
      LEFT JOIN public.farmacia_dificil_acceso fda
        ON fda.clues = f.clues
      WHERE ${clauses.join(' AND ')}
      ORDER BY f.clues
      LIMIT 2000
    `

    const { rows } = await pool.query(sql, params)

    if (!rows || !rows.length) {
      return res.json({
        input: {
          region_sanitaria: region_sanitaria ?? null,
          strategy: STRAT,
          options,
          manualOrderIds: wantedIds
        },
        start: null,
        dest: null,
        points: [],
        subroutes: [],
        legs: [],
        total: { distanceMeters: 0, duration: '0s' },
        tolls: {
          hasTolls: false,
          known: false,
          currencyCode: null,
          amount: null,
          text: 'Sin peajes estimados'
        },
        readableOrder: [],
        visitOrder: [],
        info: hasManualSubset
          ? 'No hay puntos válidos con coordenadas para la selección enviada'
          : 'No hay puntos con coordenadas para esta región'
      })
    }

    const points = rows.map(r => ({
      id: Number(r.id),
      name: r.clues,
      lat: Number(r.latitud),
      lng: Number(r.longitud),
      meta: {
        unidad: r.unidad,
        direccion: r.direccion,
        region_sanitaria: r.region_sanitaria,
        dificil: !!r.dificil_acceso
      }
    }))

    const start =
      origin && typeof origin.lat === 'number' && typeof origin.lng === 'number'
        ? origin
        : { lat: points[0].lat, lng: points[0].lng }

    let ordered = [...points]

    if (hasManualSubset) {
      const byId = new Map(ordered.map(p => [p.id, p]))
      ordered = wantedIds.map(id => byId.get(Number(id))).filter(Boolean)

      if (!ordered.length) {
        return res.json({
          input: {
            region_sanitaria: region_sanitaria ?? null,
            strategy: STRAT,
            options,
            manualOrderIds: wantedIds
          },
          start,
          dest: null,
          points: [],
          subroutes: [],
          legs: [],
          total: { distanceMeters: 0, duration: '0s' },
          tolls: {
            hasTolls: false,
            known: false,
            currencyCode: null,
            amount: null,
            text: 'Sin peajes estimados'
          },
          readableOrder: ['ORIGEN'],
          visitOrder: [{ name: 'ORIGEN', lat: start.lat, lng: start.lng }],
          info: 'No hay puntos seleccionados válidos'
        })
      }

      if (isNearest || isFarthest) {
        ordered.sort((a, b) => {
          const da = haversine(start, a)
          const db = haversine(start, b)
          return isNearest ? (da - db) : (db - da)
        })
      }
    } else if (isNearest || isFarthest) {
      ordered.sort((a, b) => {
        const da = haversine(start, a)
        const db = haversine(start, b)
        return isNearest ? (da - db) : (db - da)
      })
    } else if (isManual && Array.isArray(manualOrderIds)) {
      const wanted = manualOrderIds.map(Number)
      const byId = new Map(ordered.map(p => [p.id, p]))
      ordered = wanted.map(id => byId.get(id)).filter(Boolean)

      if (!ordered.length) {
        return res.json({
          input: {
            region_sanitaria: region_sanitaria ?? null,
            strategy: STRAT,
            options,
            manualOrderIds: wanted
          },
          start,
          dest: null,
          points: [],
          subroutes: [],
          legs: [],
          total: { distanceMeters: 0, duration: '0s' },
          tolls: {
            hasTolls: false,
            known: false,
            currencyCode: null,
            amount: null,
            text: 'Sin peajes estimados'
          },
          readableOrder: ['ORIGEN'],
          visitOrder: [{ name: 'ORIGEN', lat: start.lat, lng: start.lng }],
          info: 'No hay puntos seleccionados (Manual)'
        })
      }
    }

    const returnToOrigin = !!options.returnToOrigin

    if (!returnToOrigin && ordered.length < 1) {
      return res.json({
        input: {
          region_sanitaria: region_sanitaria ?? null,
          strategy: STRAT,
          options,
          manualOrderIds: wantedIds
        },
        start,
        dest: null,
        points: ordered,
        subroutes: [],
        legs: [],
        total: { distanceMeters: 0, duration: '0s' },
        tolls: {
          hasTolls: false,
          known: false,
          currencyCode: null,
          amount: null,
          text: 'Sin peajes estimados'
        },
        readableOrder: ['ORIGEN'],
        visitOrder: [{ name: 'ORIGEN', lat: start.lat, lng: start.lng }],
        info: 'No hay suficientes puntos para trazar'
      })
    }

    const dest = returnToOrigin ? start : ordered[ordered.length - 1]
    const fullIntermediates = returnToOrigin ? ordered : ordered.slice(0, -1)
    const MAX_INTERMEDIATES = Math.min(Number(options.maxStopsPerSubroute || 25) || 25, 25)

    async function callComputeRoutes(originLL, destinationLL, intermediatesLL) {
      const shouldAvoidTolls = isResources ? true : !!options.avoidTolls

      const routesReq = {
        origin: {
          location: {
            latLng: { latitude: originLL.lat, longitude: originLL.lng }
          }
        },
        destination: {
          location: {
            latLng: { latitude: destinationLL.lat, longitude: destinationLL.lng }
          }
        },
        intermediates: intermediatesLL.map(p => ({
          location: {
            latLng: { latitude: p.lat, longitude: p.lng }
          }
        })),
        travelMode: 'DRIVE',
        routingPreference: isFastest ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
        computeAlternativeRoutes: !!options.showAlternatives,
        extraComputations: ['TOLLS'],
        routeModifiers: {
          avoidTolls: shouldAvoidTolls,
          avoidHighways: !!options.avoidHighways,
          avoidFerries: !!options.avoidFerries
        },
        optimizeWaypointOrder: isFastest || isResources
      }

      const gmRes = await fetch(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': process.env.GMAPS_API_KEY,
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
          body: JSON.stringify(routesReq)
        }
      )

      const text = await gmRes.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Routes non-JSON: ${text.slice(0, 200)}`)
      }

      if (!gmRes.ok) {
        throw new Error(`Routes API ${gmRes.status}: ${JSON.stringify(data)}`)
      }

      if (!data.routes || !Array.isArray(data.routes) || data.routes.length === 0) {
        return null
      }

      return data.routes[0]
    }

    const subroutes = []
    const mergedLegs = []
    let totalDistance = 0
    let totalDuration = 0
    const finalOrderNames = []
    const finalOrderPoints = [{ name: 'ORIGEN', lat: start.lat, lng: start.lng }]

    if (fullIntermediates.length <= MAX_INTERMEDIATES) {
      const r = await callComputeRoutes(start, dest, fullIntermediates)

      if (!r) {
        return res.json({
          input: {
            region_sanitaria: region_sanitaria ?? null,
            strategy: STRAT,
            options,
            manualOrderIds: wantedIds
          },
          start,
          dest,
          points: ordered,
          subroutes: [],
          legs: [],
          total: { distanceMeters: 0, duration: '0s' },
          tolls: {
            hasTolls: false,
            known: false,
            currencyCode: null,
            amount: null,
            text: 'Sin peajes estimados'
          },
          readableOrder: ['ORIGEN', returnToOrigin ? 'ORIGEN' : (dest?.name ?? 'DESTINO')],
          visitOrder: finalOrderPoints,
          info: 'No se encontró ruta para la configuración solicitada'
        })
      }

      const legs = Array.isArray(r.legs) ? r.legs : []
      mergedLegs.push(...legs)

      const count =
        Array.isArray(r.optimizedIntermediateWaypointIndex) &&
        r.optimizedIntermediateWaypointIndex.length
          ? r.optimizedIntermediateWaypointIndex.length
          : fullIntermediates.length

      subroutes.push({
        polyline: r.polyline?.encodedPolyline,
        distance: r.distanceMeters || 0,
        duration: r.duration || '0s',
        count,
        tolls: normalizeTollInfo(r.travelAdvisory?.tollInfo)
      })

      totalDistance += r.distanceMeters || 0
      totalDuration += parseDurationSec(r.duration || '0s')

      let batchOrder = fullIntermediates
      if (
        Array.isArray(r.optimizedIntermediateWaypointIndex) &&
        r.optimizedIntermediateWaypointIndex.length
      ) {
        batchOrder = r.optimizedIntermediateWaypointIndex
          .map(i => fullIntermediates[i])
          .filter(Boolean)
      }

      batchOrder.forEach(p => {
        finalOrderPoints.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })
      })

      const names = batchOrder.map(p => p.name)
      const tail = returnToOrigin ? ['ORIGEN'] : [dest?.name ?? 'DESTINO']
      finalOrderNames.push('ORIGEN', ...names, ...tail)

      if (returnToOrigin) {
        finalOrderPoints.push({ name: 'ORIGEN', lat: start.lat, lng: start.lng })
      }
    } else {
      const batches = chunkArray(fullIntermediates, MAX_INTERMEDIATES)
      let currentOrigin = start

      for (let i = 0; i < batches.length; i++) {
        const lastBatch = i === batches.length - 1
        const currentBatch = batches[i]
        const currentDestination = lastBatch
          ? dest
          : currentBatch[currentBatch.length - 1]

        const r = await callComputeRoutes(currentOrigin, currentDestination, currentBatch)
        if (!r) continue

        const legs = Array.isArray(r.legs) ? r.legs : []
        mergedLegs.push(...legs)

        const count =
          Array.isArray(r.optimizedIntermediateWaypointIndex) &&
          r.optimizedIntermediateWaypointIndex.length
            ? r.optimizedIntermediateWaypointIndex.length
            : currentBatch.length

        subroutes.push({
          polyline: r.polyline?.encodedPolyline,
          distance: r.distanceMeters || 0,
          duration: r.duration || '0s',
          count,
          tolls: normalizeTollInfo(r.travelAdvisory?.tollInfo)
        })

        totalDistance += r.distanceMeters || 0
        totalDuration += parseDurationSec(r.duration || '0s')

        let batchOrder = currentBatch
        if (
          Array.isArray(r.optimizedIntermediateWaypointIndex) &&
          r.optimizedIntermediateWaypointIndex.length
        ) {
          batchOrder = r.optimizedIntermediateWaypointIndex
            .map(i => currentBatch[i])
            .filter(Boolean)
        }

        batchOrder.forEach(p => {
          finalOrderPoints.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })
        })

        currentOrigin = currentDestination
      }

      if (returnToOrigin && (dest.lat !== start.lat || dest.lng !== start.lng)) {
        const rBack = await callComputeRoutes(currentOrigin, start, [])
        if (rBack) {
          const legs = Array.isArray(rBack.legs) ? rBack.legs : []
          mergedLegs.push(...legs)
          subroutes.push({
            polyline: rBack.polyline?.encodedPolyline,
            distance: rBack.distanceMeters || 0,
            duration: rBack.duration || '0s',
            count: 0,
            tolls: normalizeTollInfo(rBack.travelAdvisory?.tollInfo)
          })
          totalDistance += rBack.distanceMeters || 0
          totalDuration += parseDurationSec(rBack.duration || '0s')
        }
        finalOrderPoints.push({ name: 'ORIGEN', lat: start.lat, lng: start.lng })
      }

      const namesOnly = finalOrderPoints
        .filter(p => p.name && p.name !== 'ORIGEN')
        .map(p => p.name)

      finalOrderNames.push(
        'ORIGEN',
        ...namesOnly,
        ...(returnToOrigin ? ['ORIGEN'] : [dest?.name ?? 'DESTINO'])
      )
    }

    const tolls = sumTollTotals(subroutes)

    return res.json({
      input: {
        region_sanitaria: region_sanitaria ?? null,
        strategy: STRAT,
        options,
        manualOrderIds: wantedIds
      },
      start,
      dest,
      points: ordered,
      subroutes,
      legs: mergedLegs,
      total: { distanceMeters: totalDistance, duration: `${totalDuration}s` },
      tolls,
      readableOrder: finalOrderNames,
      visitOrder: finalOrderPoints
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error calculando rutas', details: String(e) })
  }
}

function buildStaticMapUrl({ subroutes = [], center, zoom, width = 640, height = 360 }) {
  const base = 'https://maps.googleapis.com/maps/api/staticmap'
  const params = new URLSearchParams()

  params.set('size', `${width}x${height}`)
  params.set('scale', '2')
  params.set('maptype', 'roadmap')
  params.set('center', `${Number(center.lat)},${Number(center.lng)}`)
  params.set('zoom', String(Number(zoom)))

  for (const sr of subroutes) {
    if (!sr?.polyline) continue
    params.append('path', `weight:5|color:0x2563EB|enc:${sr.polyline}`)
  }

  params.set('key', process.env.GMAPS_API_KEY)
  return `${base}?${params.toString()}`
}

export async function getStaticRouteMap(req, res) {
  try {
    if (!process.env.GMAPS_API_KEY) {
      return res.status(500).json({ error: 'Falta GMAPS_API_KEY en backend/.env' })
    }

    const {
      subroutes = [],
      center = null,
      zoom = null,
      width = 640,
      height = 360
    } = req.body || {}

    if (!center || !Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng))) {
      return res.status(400).json({ error: 'center es requerido' })
    }

    if (!Number.isFinite(Number(zoom))) {
      return res.status(400).json({ error: 'zoom es requerido' })
    }

    const safeWidth = Math.min(Math.max(Number(width) || 640, 100), 640)
    const safeHeight = Math.min(Math.max(Number(height) || 360, 100), 640)

    const url = buildStaticMapUrl({
      subroutes,
      center: {
        lat: Number(center.lat),
        lng: Number(center.lng)
      },
      zoom: Number(zoom),
      width: safeWidth,
      height: safeHeight
    })

    const response = await fetch(url)
    if (!response.ok) {
      const txt = await response.text()
      throw new Error(`Static Maps ${response.status}: ${txt.slice(0, 300)}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'no-store')
    return res.send(buffer)
  } catch (e) {
    console.error(e)
    return res.status(500).json({
      error: 'Error generando mapa estático',
      details: String(e)
    })
  }
}