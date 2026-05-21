import { pool } from './db/pool.js'
import { chunkArray } from './utils/chunk.js'

const DEFAULT_PROJECT = 'JALISCO'

function normalizeProject(value) {
  return String(value || DEFAULT_PROJECT).trim().toUpperCase()
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

function isValidLatLng(point) {
  return (
    point &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng))
  )
}

function clampOperatorCount(value, totalPoints) {
  const n = Math.floor(Number(value || 1))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, Math.max(1, totalPoints))
}

function estimateFuelLiters(distanceMeters, kmPerLiter) {
  const km = Number(distanceMeters || 0) / 1000
  const rendimiento = Number(kmPerLiter || 0)

  if (!Number.isFinite(rendimiento) || rendimiento <= 0) {
    return null
  }

  return km / rendimiento
}

function nearestNeighborOrder(points, origin) {
  const pending = [...points]
  const ordered = []
  let current = origin

  while (pending.length) {
    let bestIdx = 0
    let bestDist = Infinity

    for (let i = 0; i < pending.length; i++) {
      const d = haversine(current, pending[i])
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }

    const next = pending.splice(bestIdx, 1)[0]
    ordered.push(next)
    current = next
  }

  return ordered
}

function getPointRegion(point) {
  return point?.meta?.region_sanitaria || 'SIN REGIÓN'
}

function getCentroid(points = []) {
  const total = points.length || 1

  return {
    lat: points.reduce((acc, p) => acc + Number(p.lat || 0), 0) / total,
    lng: points.reduce((acc, p) => acc + Number(p.lng || 0), 0) / total
  }
}

function estimateClusterWorkload(points = [], origin) {
  if (!points.length) return 0

  const centroid = getCentroid(points)
  const roundTrip = haversine(origin, centroid) * 2

  const ordered = nearestNeighborOrder(points, centroid)
  let internal = 0

  for (let i = 1; i < ordered.length; i++) {
    internal += haversine(ordered[i - 1], ordered[i])
  }

  return roundTrip + internal
}

function splitClusterGeographically(cluster) {
  const points = cluster.points || []
  if (points.length <= 1) return [cluster]

  const centroid = getCentroid(points)

  const sorted = [...points].sort((a, b) => {
    const angleA = Math.atan2(a.lat - centroid.lat, a.lng - centroid.lng)
    const angleB = Math.atan2(b.lat - centroid.lat, b.lng - centroid.lng)
    return angleA - angleB
  })

  const mid = Math.ceil(sorted.length / 2)

  return [
    {
      region: `${cluster.region} A`,
      sourceRegion: cluster.sourceRegion || cluster.region,
      points: sorted.slice(0, mid)
    },
    {
      region: `${cluster.region} B`,
      sourceRegion: cluster.sourceRegion || cluster.region,
      points: sorted.slice(mid)
    }
  ]
}

function splitPointsByOperators(points, operatorCount, origin) {
  const count = clampOperatorCount(operatorCount, points.length)

  if (count <= 1) {
    return [
      {
        operator: 1,
        label: 'Operador 1',
        regions: Array.from(new Set(points.map(getPointRegion))),
        points: nearestNeighborOrder(points, origin)
      }
    ]
  }

  const byRegion = new Map()

  for (const point of points) {
    const region = getPointRegion(point)
    if (!byRegion.has(region)) byRegion.set(region, [])
    byRegion.get(region).push(point)
  }

  let clusters = Array.from(byRegion.entries()).map(([region, regionPoints]) => ({
    region,
    sourceRegion: region,
    points: regionPoints
  }))

  while (clusters.length < count) {
    clusters.sort((a, b) => b.points.length - a.points.length)

    const biggest = clusters.shift()
    if (!biggest || biggest.points.length <= 1) {
      if (biggest) clusters.unshift(biggest)
      break
    }

    clusters.push(...splitClusterGeographically(biggest))
  }

  clusters = clusters.map(cluster => ({
    ...cluster,
    workload: estimateClusterWorkload(cluster.points, origin),
    centroid: getCentroid(cluster.points)
  }))

  clusters.sort((a, b) => {
    const angleA = Math.atan2(a.centroid.lat - origin.lat, a.centroid.lng - origin.lng)
    const angleB = Math.atan2(b.centroid.lat - origin.lat, b.centroid.lng - origin.lng)
    return angleA - angleB
  })

  const operators = Array.from({ length: count }, (_, i) => ({
    operator: i + 1,
    label: `Operador ${i + 1}`,
    workload: 0,
    regions: [],
    points: []
  }))

  for (const cluster of clusters) {
    operators.sort((a, b) => a.workload - b.workload)

    operators[0].points.push(...cluster.points)
    operators[0].regions.push(cluster.region)
    operators[0].workload += cluster.workload
  }

  operators.sort((a, b) => a.operator - b.operator)

  return operators
    .filter(op => op.points.length)
    .map(op => ({
      operator: op.operator,
      label: op.label,
      regions: op.regions,
      points: nearestNeighborOrder(op.points, origin)
    }))
}

export async function computeRoutes(req, res) {
  try {
    const {
      region_sanitaria,
      estatus,
      strategy = 'FASTEST',
      options = {},
      origin,
      manualOrderIds,
      proyecto = DEFAULT_PROJECT,
      operatorCount = 1,
      kmPerLiter = 10
    } = req.body || {}

    const projectCode = normalizeProject(proyecto)
    
    console.log('==== POST /api/routes/compute ====')
    console.log('body:', JSON.stringify(req.body, null, 2))

    if (!process.env.GMAPS_API_KEY) {
      return res.status(500).json({ error: 'Falta GMAPS_API_KEY en backend' })
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

    const isProjectWideOperators =
      !hasManualSubset &&
      !region_sanitaria &&
      Number(operatorCount || 1) > 1

    if (!hasManualSubset && !region_sanitaria && !isProjectWideOperators) {
      return res.status(400).json({ error: 'region_sanitaria es requerida' })
    }

    const avoidDificilAcceso = options.avoidDificilAcceso !== false
    const applyAvoidHard = avoidDificilAcceso && !isManual && !hasManualSubset

    const clauses = [
      'f.latitud IS NOT NULL',
      'f.longitud IS NOT NULL',
      'f.proyecto = $1'
    ]
    const params = [projectCode]
    let idx = 2

    if (hasManualSubset) {
      clauses.push(`f.id = ANY($${idx++}::bigint[])`)
      params.push(wantedIds)
    } else if (region_sanitaria) {
      clauses.push(`f.region_sanitaria = $${idx++}`)
      params.push(region_sanitaria)
    }

    if (estatus) {
      clauses.push(`f.estatus = $${idx++}::farmacia_estatus`)
      params.push(String(estatus).toUpperCase())
    }

    if (applyAvoidHard) {
      clauses.push('fda.clues IS NULL')
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
        f.proyecto,
        (fda.clues IS NOT NULL) AS dificil_acceso
      FROM public.farmacia f
      LEFT JOIN public.farmacia_dificil_acceso fda
        ON fda.clues = f.clues
      WHERE ${clauses.join(' AND ')}
      ORDER BY f.clues
      LIMIT 2000
    `

    console.log('Executing SQL with params:', params)

    const { rows } = await pool.query(sql, params)

    if (!rows || !rows.length) {
      return res.json({
        input: {
          proyecto: projectCode,
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
        proyecto: r.proyecto,
        dificil: !!r.dificil_acceso
      }
    }))

    const validPoints = points.filter(isValidLatLng)

    if (!validPoints.length) {
      return res.status(400).json({
        error: 'No hay puntos con coordenadas válidas'
      })
    }

    const start = isValidLatLng(origin)
      ? {
          lat: Number(origin.lat),
          lng: Number(origin.lng)
        }
      : {
          lat: validPoints[0].lat,
          lng: validPoints[0].lng
        }

    let ordered = [...validPoints]

    if (hasManualSubset) {
      const byId = new Map(ordered.map(p => [p.id, p]))
      ordered = wantedIds.map(id => byId.get(Number(id))).filter(Boolean)

      if (!ordered.length) {
        return res.json({
          input: {
            proyecto: projectCode,
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
            proyecto: projectCode,
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
          proyecto: projectCode,
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
      if (!isValidLatLng(originLL)) {
        throw new Error(`Origen inválido: ${JSON.stringify(originLL)}`)
      }

      if (!isValidLatLng(destinationLL)) {
        throw new Error(`Destino inválido: ${JSON.stringify(destinationLL)}`)
      }

      const invalidIntermediate = (intermediatesLL || []).find(p => !isValidLatLng(p))
      if (invalidIntermediate) {
        throw new Error(`Intermedio inválido: ${JSON.stringify(invalidIntermediate)}`)
      }

      const shouldAvoidTolls = isResources ? true : !!options.avoidTolls

      const routesReq = {
        origin: {
          location: {
            latLng: {
              latitude: Number(originLL.lat),
              longitude: Number(originLL.lng)
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: Number(destinationLL.lat),
              longitude: Number(destinationLL.lng)
            }
          }
        },
        intermediates: (intermediatesLL || []).map(p => ({
          location: {
            latLng: {
              latitude: Number(p.lat),
              longitude: Number(p.lng)
            }
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

      console.log('Calling Google Routes API with payload:', JSON.stringify(routesReq, null, 2))

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
        throw new Error(`Routes non-JSON: ${text.slice(0, 500)}`)
      }

      if (!gmRes.ok) {
        console.error('Google Routes API error response:', data)
        throw new Error(`Routes API ${gmRes.status}: ${JSON.stringify(data)}`)
      }

      if (!data.routes || !Array.isArray(data.routes) || data.routes.length === 0) {
        return null
      }

      return data.routes[0]
    }

    const effectiveOperatorCount = clampOperatorCount(operatorCount, ordered.length)
    const fuelKmPerLiter = Number(kmPerLiter || 0)

    if (effectiveOperatorCount > 1 && !hasManualSubset && STRAT !== 'MANUAL') {
      const operatorGroups = splitPointsByOperators(ordered, effectiveOperatorCount, start)

      const operatorRoutes = []
      const allSubroutes = []
      const allLegs = []
      const allVisitOrder = [{ name: 'ORIGEN', lat: start.lat, lng: start.lng }]
      const allReadableOrder = ['ORIGEN']

      let operatorTotalDistance = 0
      let operatorTotalDuration = 0

      for (const group of operatorGroups) {
        if (!group.points.length) continue

        const operatorStart = start
        const operatorDest = returnToOrigin
          ? start
          : group.points[group.points.length - 1]

        const operatorIntermediates = returnToOrigin
          ? group.points
          : group.points.slice(0, -1)

        const operatorChunks = chunkArray(operatorIntermediates, MAX_INTERMEDIATES)

        let operatorDistance = 0
        let operatorDuration = 0
        let operatorLegs = []
        let operatorSubroutePolylines = []
        let operatorTollItems = []
        let operatorOrder = []

        let currentOperatorOrigin = operatorStart

        for (let chunkIndex = 0; chunkIndex < operatorChunks.length; chunkIndex++) {
          const chunk = operatorChunks[chunkIndex]
          const isLastChunk = chunkIndex === operatorChunks.length - 1

          const chunkDestination = isLastChunk
            ? operatorDest
            : chunk[chunk.length - 1]

          const chunkIntermediates = isLastChunk
            ? chunk
            : chunk.slice(0, -1)

          const r = await callComputeRoutes(
            currentOperatorOrigin,
            chunkDestination,
            chunkIntermediates
          )

          if (!r) continue

          operatorDistance += Number(r.distanceMeters || 0)
          operatorDuration += parseDurationSec(r.duration || '0s')
          operatorLegs.push(...(Array.isArray(r.legs) ? r.legs : []))

          operatorSubroutePolylines.push({
            polyline: r.polyline?.encodedPolyline,
            distance: Number(r.distanceMeters || 0),
            duration: r.duration || '0s',
            count: chunk.length,
            tolls: normalizeTollInfo(r.travelAdvisory?.tollInfo)
          })

          operatorTollItems.push({
            tolls: normalizeTollInfo(r.travelAdvisory?.tollInfo)
          })

          let chunkOrder = chunkIntermediates

          if (
            Array.isArray(r.optimizedIntermediateWaypointIndex) &&
            r.optimizedIntermediateWaypointIndex.length
          ) {
            chunkOrder = r.optimizedIntermediateWaypointIndex
              .map(i => chunkIntermediates[i])
              .filter(Boolean)
          }

        if (!isLastChunk && chunkDestination?.id) {
          operatorOrder.push(...chunkOrder, chunkDestination)
        } else {
          operatorOrder.push(...chunkOrder)
        }

          currentOperatorOrigin = chunkDestination
        }

        if (!operatorSubroutePolylines.length) continue

        const operatorFuel = estimateFuelLiters(operatorDistance, fuelKmPerLiter)
        const operatorTolls = sumTollTotals(operatorTollItems)
        const operatorVisitOrder = [
          { name: `OPERADOR ${group.operator} - ORIGEN`, lat: start.lat, lng: start.lng },
          ...operatorOrder.map(p => ({
            id: p.id,
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            operator: group.operator
          }))
        ]

        if (returnToOrigin) {
          operatorVisitOrder.push({
            name: `OPERADOR ${group.operator} - ORIGEN`,
            lat: start.lat,
            lng: start.lng
          })
        }

        for (const part of operatorSubroutePolylines) {
          allSubroutes.push({
            operator: group.operator,
            label: `Operador ${group.operator}`,
            polyline: part.polyline,
            distance: part.distance,
            duration: part.duration,
            count: part.count,
            fuelLiters: operatorFuel,
            tolls: part.tolls
          })
        }

        allLegs.push(...operatorLegs)
        allVisitOrder.push(...operatorVisitOrder)
        allReadableOrder.push(
          `Operador ${group.operator}`,
          ...operatorOrder.map(p => p.name),
          returnToOrigin ? `Operador ${group.operator} - ORIGEN` : (operatorDest?.name || 'DESTINO')
        )

        operatorRoutes.push({
          operator: group.operator,
          label: `Operador ${group.operator}`,
          regions: group.regions || [],
          pointCount: group.points.length,
          distanceMeters: operatorDistance,
          duration: `${operatorDuration}s`,
          durationSeconds: operatorDuration,
          fuelLiters: operatorFuel,
          tolls: operatorTolls,
          points: operatorOrder.map((p, index) => ({
            order: index + 1,
            id: p.id,
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            meta: p.meta
          }))
        })

        operatorTotalDistance += operatorDistance
        operatorTotalDuration += operatorDuration
      }

      const totalFuelLiters = estimateFuelLiters(operatorTotalDistance, fuelKmPerLiter)
      const tolls = sumTollTotals(allSubroutes)

      return res.json({
        input: {
          proyecto: projectCode,
          region_sanitaria: region_sanitaria ?? null,
          scope: isProjectWideOperators ? 'PROJECT' : 'REGION',
          strategy: STRAT,
          operatorCount: effectiveOperatorCount,
          kmPerLiter: fuelKmPerLiter,
          options,
          manualOrderIds: wantedIds
        },
        mode: 'OPERATORS',
        start,
        dest: returnToOrigin ? start : null,
        points: ordered,
        operatorRoutes,
        subroutes: allSubroutes,
        legs: allLegs,
        total: {
          distanceMeters: operatorTotalDistance,
          duration: `${operatorTotalDuration}s`,
          fuelLiters: totalFuelLiters
        },
        fuel: {
          kmPerLiter: fuelKmPerLiter,
          totalLiters: totalFuelLiters
        },
        tolls,
        readableOrder: allReadableOrder,
        visitOrder: allVisitOrder,
        info: `Ruta dividida en ${operatorRoutes.length} operadores`
      })
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
            proyecto: projectCode,
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
        proyecto: projectCode,
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
    console.error('computeRoutes error:', e)
    console.error(e?.stack)

    return res.status(500).json({
      error: 'Error calculando rutas',
      details: e?.message || String(e)
    })
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
      return res.status(500).json({ error: 'Falta GMAPS_API_KEY en backend' })
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
    console.error('getStaticRouteMap error:', e)
    console.error(e?.stack)

    return res.status(500).json({
      error: 'Error generando mapa estático',
      details: e?.message || String(e)
    })
  }
}