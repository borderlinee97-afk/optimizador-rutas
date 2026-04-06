// src/composables/useRouting.js
import { ref, computed } from 'vue'
import { computeRoute } from '../services/api.js'
import { copyToClipboard as copyLinkToClipboard } from '../utils/links.js'

export function useRouting({ map, trackOverlay, detachOverlay, clearAllOverlays }) {
  // ====== Estado base / UI ======
  const criteriaOpen = ref(false)
  const criteria = ref({
    scope: 'single',
    region: '',
    strategy: 'FASTEST',
    options: {
      avoidTolls: false,
      showAlternatives: true,
      returnToOrigin: true,
      maxStopsPerSubroute: 25,
      avoidDificilAcceso: true
    }
  })

  const originMode = ref('first')
  const originPharmacyId = ref(null)

  // ====== Inyección desde MapPage ======
  const farmacias = ref([])

  const regiones = computed(() =>
    Array.from(new Set(farmacias.value.map(f => f.region_sanitaria).filter(Boolean))).sort()
  )

  const farmaciasRegion = computed(() =>
    farmacias.value.filter(f => f.region_sanitaria === criteria.value.region)
  )

  function openCriteria() {
    criteria.value.scope = 'single'
    criteria.value.region = regiones.value[0] || ''
    originMode.value = 'first'
    originPharmacyId.value =
      farmaciasRegion.value[0]?.id != null
        ? Number(farmaciasRegion.value[0].id)
        : null

    manualPoints.value = farmaciasRegion.value.map(f => ({
      id: Number(f.id),
      name: f.clues || f.unidad || String(f.id),
      clues: f.clues || '',
      unidad: f.unidad || '',
      region: f.region_sanitaria || '',
      enabled: true,
      hard: !!f.dificil_acceso
    }))

    criteriaOpen.value = true
  }

  // ====== Manual pre-cálculo (flujo general) ======
  const manualPoints = ref([])
  const lockManualFromTemplate = ref(false)

  let dragSrcIndex = -1
  function onDragStart(i) {
    dragSrcIndex = i
  }
  function onDragEnter(i) {
    if (dragSrcIndex === -1 || dragSrcIndex === i) return
    const a = [...manualPoints.value]
    const it = a.splice(dragSrcIndex, 1)[0]
    a.splice(i, 0, it)
    manualPoints.value = a
    dragSrcIndex = i
  }
  function onDrop() {
    dragSrcIndex = -1
  }

  // ====== Ruta personalizada (carrito temporal) ======
  const customPoints = ref([])
  const customStrategy = ref('FASTEST')

  const customOriginMode = ref('first') // first | coords | pharmacy
  const customOriginPharmacyId = ref(null)
  const customOriginCoords = ref({ lat: '', lng: '' })

  function normalizeCustomPoint(raw) {
    if (!raw) return null
    return {
      id: Number(raw.id),
      clues: raw.clues || '',
      unidad: raw.unidad || '',
      region: raw.region || raw.region_sanitaria || '',
      name: raw.name || raw.clues || raw.unidad || String(raw.id),
      enabled: raw.enabled !== false,
      hard: !!raw.hard
    }
  }

  function ensureValidCustomOriginSelection() {
    const ids = new Set(customPoints.value.map(p => Number(p.id)))
    if (!ids.size) {
      customOriginPharmacyId.value = null
      return
    }
    if (
      customOriginMode.value === 'pharmacy' &&
      !ids.has(Number(customOriginPharmacyId.value))
    ) {
      customOriginPharmacyId.value = Number(customPoints.value[0].id)
    }
  }

  function addCustomStops(ids = []) {
    const existing = new Set(customPoints.value.map(p => Number(p.id)))
    const next = [...customPoints.value]

    for (const id of ids) {
      const f = farmacias.value.find(ff => Number(ff.id) === Number(id))
      if (!f) continue
      if (existing.has(Number(f.id))) continue

      next.push({
        id: Number(f.id),
        clues: f.clues || '',
        unidad: f.unidad || '',
        region: f.region_sanitaria || '',
        name: f.clues || f.unidad || String(f.id),
        enabled: true,
        hard: !!f.dificil_acceso
      })
    }

    customPoints.value = next
    if (!customOriginPharmacyId.value && customPoints.value.length) {
      customOriginPharmacyId.value = Number(customPoints.value[0].id)
    }
    ensureValidCustomOriginSelection()
  }

  function setCustomPoints(list = []) {
    customPoints.value = (Array.isArray(list) ? list : [])
      .map(normalizeCustomPoint)
      .filter(Boolean)

    ensureValidCustomOriginSelection()
  }

  function clearCustomPoints() {
    customPoints.value = []
    customStrategy.value = 'FASTEST'
    customOriginMode.value = 'first'
    customOriginPharmacyId.value = null
    customOriginCoords.value = { lat: '', lng: '' }
  }

  const customOriginCandidates = computed(() =>
    customPoints.value.map(p => ({
      id: Number(p.id),
      label: `${p.clues || p.name}${p.unidad ? ` — ${p.unidad}` : ''}`
    }))
  )

  function resolveCustomOrigin() {
    if (!customPoints.value.length) return null

    if (customOriginMode.value === 'coords') {
      const lat = Number(customOriginCoords.value.lat)
      const lng = Number(customOriginCoords.value.lng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng }
      }
      return null
    }

    if (customOriginMode.value === 'pharmacy') {
      const chosenId = Number(customOriginPharmacyId.value)
      const f = farmacias.value.find(ff => Number(ff.id) === chosenId)
      if (f?.latitud != null && f?.longitud != null) {
        return { lat: Number(f.latitud), lng: Number(f.longitud) }
      }
      return null
    }

    const first = farmacias.value.find(
      f => Number(f.id) === Number(customPoints.value[0]?.id)
    )
    if (first?.latitud != null && first?.longitud != null) {
      return { lat: Number(first.latitud), lng: Number(first.longitud) }
    }
    return null
  }

  function rotateIdsFromCustomOrigin(ids) {
    if (!ids.length) return ids
    if (customOriginMode.value !== 'pharmacy') return ids

    const firstId = Number(customOriginPharmacyId.value)
    const idx = ids.findIndex(id => Number(id) === firstId)
    if (idx <= 0) return ids

    return [...ids.slice(idx), ...ids.slice(0, idx)]
  }

  // ====== Post-cálculo (edición) ======
  const postOrder = ref([])
  let postDragIdx = -1

  function initPostOrderFromVisit(visit) {
    postOrder.value = []
    if (!Array.isArray(visit)) return

    for (const p of visit) {
      if (!p?.id) continue

      const f = farmacias.value.find(ff => Number(ff.id) === Number(p.id))

      postOrder.value.push({
        id: Number(p.id),
        name: p.name || f?.clues || f?.unidad || String(p.id),
        clues: f?.clues || null,
        unidad: f?.unidad || null,
        region: f?.region_sanitaria || null,
        enabled: true,
        hard: !!f?.dificil_acceso
      })
    }
  }

  function postDragStart(i) {
    postDragIdx = i
  }

  function postDragEnter(i) {
    if (postDragIdx === -1 || postDragIdx === i) return
    const a = [...postOrder.value]
    const it = a.splice(postDragIdx, 1)[0]
    a.splice(i, 0, it)
    postOrder.value = a
    postDragIdx = i
  }

  function postDrop() {
    postDragIdx = -1
  }

  // ====== Resultados ======
  const routeTotal = ref(null)
  const routeLegs = ref([])
  const readableOrder = ref([])
  const routeTolls = ref({
    hasTolls: false,
    known: false,
    currencyCode: null,
    amount: null,
    text: 'Sin peajes estimados'
  })

  const massiveResults = ref([])
  const currentPolylines = ref([])
  const sequenceMarkers = ref([])

  const subroutesUi = ref([])
  const subrouteColors = ref([])
  const unifyColors = ref(false)

  const hasAnyRoute = computed(() =>
    !!(
      currentPolylines.value.length ||
      sequenceMarkers.value.length ||
      massiveResults.value.length
    )
  )

  function clearRoutes() {
    try {
      typeof clearAllOverlays === 'function' && clearAllOverlays()
    } catch {}

    try {
      for (const mr of massiveResults.value) {
        ;(mr.polylines || []).forEach(o => {
          try { o && o.setMap(null) } catch {}
        })
        ;(mr.sequenceMarkers || []).forEach(o => {
          try { o && (o.map = null) } catch {}
        })
      }
    } catch {}

    try {
      currentPolylines.value.forEach(o => {
        try { o && o.setMap(null) } catch {}
      })
      sequenceMarkers.value.forEach(o => {
        try { o && (o.map = null) } catch {}
      })
    } catch {}

    currentPolylines.value = []
    sequenceMarkers.value = []
    massiveResults.value = []

    routeTotal.value = null
    routeLegs.value = []
    readableOrder.value = []
    routeTolls.value = {
      hasTolls: false,
      known: false,
      currencyCode: null,
      amount: null,
      text: 'Sin peajes estimados'
    }
    subroutesUi.value = []
    subrouteColors.value = []

    postOrder.value = []
    mapsLinks.value = []
  }

  const computeRunId = ref(0)
  const controllers = ref([])

  function abortAllFetches() {
    controllers.value.forEach(c => {
      try { c.abort() } catch {}
    })
    controllers.value = []
  }

  function onCloseRoute() {
    computeRunId.value++
    abortAllFetches()
    clearRoutes()
  }

  const lastRegionUsed = ref(null)
  const lastOriginUsed = ref(null)
  const lastRawData = ref(null)

  function buildPayload(region) {
    let origin

    if (originMode.value === 'center' && map.value) {
      const c = map.value.getCenter()
      origin = { lat: c.lat(), lng: c.lng() }
    } else if (originMode.value === 'pharmacy') {
      const all = farmacias.value.filter(f => f.region_sanitaria === region)
      const chosen =
        all.find(f => Number(f.id) === Number(originPharmacyId.value)) || all[0]

      if (chosen) {
        origin = { lat: +chosen.latitud, lng: +chosen.longitud }
      }
    }

    const payload = {
      region_sanitaria: region,
      strategy: criteria.value.strategy,
      options: {
        ...criteria.value.options,
        avoidDificilAcceso: criteria.value.options.avoidDificilAcceso !== false
      }
    }

    if (origin) payload.origin = origin

    if (criteria.value.scope === 'single' && criteria.value.strategy === 'MANUAL') {
      payload.manualOrderIds = manualPoints.value
        .filter(p => p.enabled)
        .map(p => Number(p.id))
    }

    lastRegionUsed.value = region
    lastOriginUsed.value = origin || null
    return payload
  }

  async function postCompute(payload, runId) {
    try {
      const controller = new AbortController()
      controllers.value.push(controller)

      const data = await computeRoute(payload, { signal: controller.signal })

      controllers.value = controllers.value.filter(c => c !== controller)
      if (runId !== computeRunId.value) return null

      if (Array.isArray(data?.subroutes) && data.subroutes.length === 0) {
        alert(data.info || 'No se encontró ruta con los puntos seleccionados.')
      }

      return data
    } catch (err) {
      if (err?.name === 'AbortError') return null
      console.error(err)
      alert(err?.message || 'Fallo de red calculando la ruta')
      return null
    }
  }

  async function drawSubroutesAndNumbers(data) {
    if (!window.google || !google.maps) {
      throw new Error('Google Maps JS API no está cargada aún.')
    }

    await google.maps.importLibrary('geometry')

    const paletteSR = ['#1565C0', '#2E7D32', '#6A1B9A', '#EF6C00', '#00897B', '#D81B60', '#5D4037']
    const colors = data.subroutes.map((_, i) => paletteSR[i % paletteSR.length])

    const bounds = new google.maps.LatLngBounds()
    const polys = []

    data.subroutes.forEach((sr, idx) => {
      if (!sr?.polyline) return
      const path = google.maps.geometry.encoding.decodePath(sr.polyline)

      const pl = new google.maps.Polyline({
        path,
        strokeColor: colors[idx],
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map: map.value
      })

      polys.push(pl)
      trackOverlay(pl)
      path.forEach(ll => bounds.extend(ll))
    })

    if (!bounds.isEmpty()) map.value.fitBounds(bounds)

    const seq = []
    if (Array.isArray(data.visitOrder) && data.visitOrder.length) {
      const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary('marker')

      let i = 1
      for (const p of data.visitOrder) {
        if (p.name === 'ORIGEN') continue
        if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue

        const pin = new PinElement({
          background: '#111827',
          borderColor: '#ffffff',
          glyphColor: '#ffffff',
          glyphText: String(i++)
        })

        const m = new AdvancedMarkerElement({
          map: map.value,
          position: { lat: p.lat, lng: p.lng },
          title: p.name,
          content: pin
        })

        seq.push(m)
        trackOverlay(m)
      }
    }

    subrouteColors.value = colors
    return { polylines: polys, seqMarkers: seq }
  }

  function buildSubroutesUi(data) {
    subroutesUi.value = []
    if (!data || !Array.isArray(data.subroutes)) return

    let acc = 1
    data.subroutes.forEach((sr, idx) => {
      const start = acc
      const end = acc + Number(sr.count || 0) - 1
      acc = end + 1

      subroutesUi.value.push({
        idx,
        color: subrouteColors.value[idx] || '#1565C0',
        distance: sr.distance || 0,
        duration: sr.duration || '0s',
        range: sr.count ? `${start}→${end}` : '—',
        tolls: sr.tolls || {
          hasTolls: false,
          known: false,
          currencyCode: null,
          amount: null,
          text: 'Sin peajes estimados'
        }
      })
    })
  }

  function recolorCurrent() {
    currentPolylines.value.forEach((pl, i) => {
      pl.setOptions({
        strokeColor: unifyColors.value ? '#1565C0' : (subrouteColors.value[i] || '#1565C0')
      })
    })

    subroutesUi.value = subroutesUi.value.map((sr, i) => ({
      ...sr,
      color: unifyColors.value ? '#1565C0' : (subrouteColors.value[i] || '#1565C0')
    }))
  }

  function focusSubroute(i) {
    const pl = currentPolylines.value[i]
    if (!pl) return

    const path = pl.getPath()
    const b = new google.maps.LatLngBounds()

    for (let j = 0; j < path.getLength(); j++) {
      b.extend(path.getAt(j))
    }

    if (!b.isEmpty()) map.value.fitBounds(b)
  }

  const mapsLinks = ref([])
  const linkChunkSize = ref(8)

  function toFiniteNumber(v) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  function normalizePoint(point) {
    if (!point) return null

    const lat = toFiniteNumber(point.lat)
    const lng = toFiniteNumber(point.lng)

    if (lat == null || lng == null) return null

    return {
      ...point,
      lat,
      lng
    }
  }

  function sameCoords(a, b, precision = 6) {
    if (!a || !b) return false
    return (
      Number(a.lat).toFixed(precision) === Number(b.lat).toFixed(precision) &&
      Number(a.lng).toFixed(precision) === Number(b.lng).toFixed(precision)
    )
  }

  function buildGoogleMapsDirUrl(origin, destination, waypoints = []) {
    const params = new URLSearchParams()
    params.set('api', '1')
    params.set('travelmode', 'driving')
    params.set('origin', `${origin.lat},${origin.lng}`)
    params.set('destination', `${destination.lat},${destination.lng}`)

    if (waypoints.length) {
      params.set(
        'waypoints',
        waypoints.map(p => `${p.lat},${p.lng}`).join('|')
      )
    }

    return `https://www.google.com/maps/dir/?${params.toString()}`
  }

  function rebuildLinks(data) {
    if (!data || !Array.isArray(data.visitOrder) || !data.visitOrder.length) {
      mapsLinks.value = []
      return
    }

    const origin = normalizePoint(data.start)
    const visitPoints = data.visitOrder
      .filter(p => p && p.name !== 'ORIGEN')
      .map(normalizePoint)
      .filter(Boolean)

    if (!origin && !visitPoints.length) {
      mapsLinks.value = []
      return
    }

    const safeOrigin = origin || visitPoints[0]
    let routeStops = [...visitPoints]

    if (routeStops.length && sameCoords(safeOrigin, routeStops[0])) {
      routeStops.shift()
    }

    let fullRoute = [safeOrigin, ...routeStops]

    if (criteria.value.options?.returnToOrigin) {
      const last = fullRoute[fullRoute.length - 1]
      if (!sameCoords(last, safeOrigin)) {
        fullRoute.push(safeOrigin)
      }
    }

    fullRoute = fullRoute.filter((p, idx, arr) => {
      if (idx === 0) return true
      return !sameCoords(p, arr[idx - 1])
    })

    if (fullRoute.length < 2) {
      mapsLinks.value = []
      return
    }

    const links = []
    const maxIntermediate = Math.max(1, Number(linkChunkSize.value) || 8)

    let startIdx = 0
    while (startIdx < fullRoute.length - 1) {
      const endIdx = Math.min(startIdx + maxIntermediate + 1, fullRoute.length - 1)
      const chunk = fullRoute.slice(startIdx, endIdx + 1)

      if (chunk.length >= 2) {
        const chunkOrigin = chunk[0]
        const chunkDestination = chunk[chunk.length - 1]
        const chunkWaypoints = chunk.slice(1, -1)

        links.push({
          url: buildGoogleMapsDirUrl(chunkOrigin, chunkDestination, chunkWaypoints),
          from: startIdx + 1,
          to: endIdx + 1
        })
      }

      startIdx = endIdx
    }

    mapsLinks.value = links
  }

  function copyToClipboard(url) {
    return copyLinkToClipboard(url)
  }

  async function applyComputedRoute(data, runId) {
    if (!data || runId !== computeRunId.value) return

    lastRawData.value = data
    routeTotal.value = data.total
    routeLegs.value = Array.isArray(data.legs) ? data.legs : []
    readableOrder.value = data.readableOrder || []
    routeTolls.value = data.tolls || {
      hasTolls: false,
      known: false,
      currencyCode: null,
      amount: null,
      text: 'Sin peajes estimados'
    }
    initPostOrderFromVisit(data.visitOrder)

    const { polylines, seqMarkers } = await drawSubroutesAndNumbers(data)

    if (runId !== computeRunId.value) {
      polylines.forEach(detachOverlay)
      seqMarkers.forEach(detachOverlay)
      return
    }

    currentPolylines.value = polylines
    sequenceMarkers.value = seqMarkers
    buildSubroutesUi(data)
    recolorCurrent()
    rebuildLinks(data)
  }

  async function runCompute() {
    criteriaOpen.value = false
    onCloseRoute()

    const runId = computeRunId.value

    if (criteria.value.scope === 'single') {
      const payload = buildPayload(criteria.value.region)
      const data = await postCompute(payload, runId)
      await applyComputedRoute(data, runId)
      return
    }

    for (const region of regiones.value) {
      const payload = buildPayload(region)
      const data = await postCompute(payload, runId)
      if (!data || runId !== computeRunId.value) return

      const { polylines, seqMarkers } = await drawSubroutesAndNumbers(data)

      if (runId !== computeRunId.value) {
        polylines.forEach(detachOverlay)
        seqMarkers.forEach(detachOverlay)
        return
      }

      massiveResults.value.push({
        region,
        polylines,
        total: data.total,
        tolls: data.tolls || null,
        visible: true,
        sequenceMarkers: seqMarkers,
        _rawData: data
      })
    }
  }

  async function runCustomRoute() {
    if (!customPoints.value.length) {
      alert('Agrega al menos una unidad a la ruta personalizada.')
      return
    }

    const enabledPoints = customPoints.value.filter(p => p.enabled !== false)
    const idsBase = enabledPoints.map(p => Number(p.id))

    if (!idsBase.length) {
      alert('Agrega al menos una unidad válida a la ruta personalizada.')
      return
    }

    const origin = resolveCustomOrigin()
    if (customOriginMode.value === 'coords' && !origin) {
      alert('Captura coordenadas válidas para el punto de inicio.')
      return
    }
    if (customOriginMode.value === 'pharmacy' && !origin) {
      alert('Selecciona una unidad válida como punto de inicio.')
      return
    }

    const ids = rotateIdsFromCustomOrigin(idsBase)

    const payload = {
      strategy: customStrategy.value || 'FASTEST',
      manualOrderIds: ids,
      options: {
        ...criteria.value.options,
        avoidDificilAcceso: false,
        avoidTolls: customStrategy.value === 'RESOURCES' ? true : criteria.value.options.avoidTolls
      }
    }

    if (origin) {
      payload.origin = origin
      lastOriginUsed.value = origin
    } else {
      lastOriginUsed.value = null
    }

    lastRegionUsed.value = null

    onCloseRoute()
    const runId = computeRunId.value
    const data = await postCompute(payload, runId)
    await applyComputedRoute(data, runId)
  }

  async function recalcWithPostOrder() {
    if (!postOrder.value.length) {
      alert('No hay puntos activos para recalcular')
      return
    }

    const ids = postOrder.value.filter(p => p.enabled).map(p => Number(p.id))
    if (!ids.length) {
      alert('Selecciona al menos un punto')
      return
    }

    const payload = {
      strategy: 'MANUAL',
      options: { ...criteria.value.options },
      manualOrderIds: ids
    }

    const region = lastRegionUsed.value || criteria.value.region || null
    if (region) payload.region_sanitaria = region
    if (lastOriginUsed.value) payload.origin = lastOriginUsed.value

    onCloseRoute()
    const runId = computeRunId.value
    const data = await postCompute(payload, runId)
    await applyComputedRoute(data, runId)
  }

  function toggleMassiveVisibility(mr) {
    mr.visible = !mr.visible
    ;(mr.polylines || []).forEach(o => {
      if (o) o.setMap(mr.visible ? map.value : null)
    })
    ;(mr.sequenceMarkers || []).forEach(o => {
      if (o) o.map = mr.visible ? map.value : null
    })
  }

  function seedPostOrderFromManual() {
    postOrder.value = []
    for (const p of manualPoints.value || []) {
      if (!p?.id) continue
      postOrder.value.push({
        id: Number(p.id),
        name: p.name || String(p.id),
        clues: p.clues || '',
        unidad: p.unidad || '',
        region: p.region || '',
        enabled: p.enabled !== false,
        hard: !!p.hard
      })
    }
  }

  return {
    farmacias,
    regiones,
    farmaciasRegion,

    criteriaOpen,
    criteria,
    originMode,
    originPharmacyId,
    openCriteria,
    manualPoints,
    lockManualFromTemplate,
    onDragStart,
    onDragEnter,
    onDrop,

    customPoints,
    customStrategy,
    customOriginMode,
    customOriginPharmacyId,
    customOriginCoords,
    customOriginCandidates,
    addCustomStops,
    setCustomPoints,
    clearCustomPoints,
    runCustomRoute,

    postOrder,
    postDragStart,
    postDragEnter,
    postDrop,

    routeTotal,
    routeLegs,
    readableOrder,
    routeTolls,
    massiveResults,
    currentPolylines,
    sequenceMarkers,
    subroutesUi,
    subrouteColors,
    unifyColors,
    recolorCurrent,
    focusSubroute,
    hasAnyRoute,

    mapsLinks,
    linkChunkSize,
    copyToClipboard,

    runCompute,
    recalcWithPostOrder,
    onCloseRoute,

    lastRegionUsed,
    lastOriginUsed,
    lastRawData,
    toggleMassiveVisibility,
    seedPostOrderFromManual
  }
}