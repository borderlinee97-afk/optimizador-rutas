<template>
  <div v-if="open" class="plan-print-root">
    <div class="plan-print-toolbar">
      <div class="toolbar-left">
        <b>Vista previa del plan de trabajo</b>
      </div>

      <div class="toolbar-actions">
        <button class="btn-primary" :disabled="isExporting || mapLoading" @click="exportPdf">
          {{ isExporting ? 'Exportando…' : 'Exportar PDF' }}
        </button>
        <button class="btn-ghost" :disabled="isExporting" @click="$emit('close')">
          Cerrar
        </button>
      </div>
    </div>

    <div v-if="showRenderHint" class="render-hint-banner">
      <strong>Exportando PDF…</strong>
      <span>
        Baja a la última página donde está el mapa para que termine de renderizarse y se complete la exportación.
      </span>
    </div>

    <div class="plan-print-document">
      <section class="preview-page landscape-preview">
        <div class="doc-header">
          <div>
            <h1>Plan de trabajo - Ruta personalizada</h1>
            <p class="muted">
              Documento temporal generado para seguimiento operativo.
            </p>
          </div>

          <div class="meta-box">
            <div><b>Fecha:</b> {{ generatedDate }}</div>
            <div><b>Hora:</b> {{ generatedTime }}</div>
          </div>
        </div>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Modo de cálculo</div>
            <div class="summary-value">{{ strategyLabel }}</div>
          </div>

          <div class="summary-card">
            <div class="summary-label">Punto de inicio</div>
            <div class="summary-value">{{ originLabel }}</div>
          </div>

          <div class="summary-card">
            <div class="summary-label">Total de unidades</div>
            <div class="summary-value">{{ totalStops }}</div>
          </div>

          <div class="summary-card">
            <div class="summary-label">Regiones involucradas</div>
            <div class="summary-value">{{ regionsLabel }}</div>
          </div>

          <div class="summary-card">
            <div class="summary-label">Distancia total</div>
            <div class="summary-value">
              {{ formatKm(routeTotal?.distanceMeters || 0) }}
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-label">Duración estimada</div>
            <div class="summary-value">
              {{ formatDur(routeTotal?.duration || '0s') }}
            </div>
          </div>
        </div>

        <div class="summary-grid one-row">
          <div class="summary-card wide-card">
            <div class="summary-label">Peajes estimados</div>
            <div class="summary-value">{{ tollsLabel }}</div>
            <div class="summary-help">
              Estimación agregada de la ruta. La ubicación exacta de casetas no se detalla en esta versión.
            </div>
          </div>
        </div>

        <div class="section-block">
          <h2>Resumen de subrutas</h2>
          <table class="clean-table">
            <thead>
              <tr>
                <th>Subruta</th>
                <th>Rango</th>
                <th>Distancia</th>
                <th>Duración</th>
                <th>Peajes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sr in subroutesUi" :key="sr.idx">
                <td>#{{ sr.idx + 1 }}</td>
                <td>{{ sr.range }}</td>
                <td>{{ formatKm(sr.distance) }}</td>
                <td>{{ formatDur(sr.duration) }}</td>
                <td>{{ sr.tolls?.text || 'Sin peajes estimados' }}</td>
              </tr>
              <tr v-if="!subroutesUi.length">
                <td colspan="5" class="empty-row">Sin subrutas</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="section-block">
          <h2>Observación</h2>
          <p class="note">
            Esta ruta es temporal y fue generada únicamente como plan de trabajo
            operativo. No representa persistencia ni asignación definitiva en el sistema.
          </p>
        </div>
      </section>

      <section class="preview-page landscape-preview">
        <h2>Orden de visita</h2>

        <table class="clean-table">
          <thead>
            <tr>
              <th>Orden</th>
              <th>CLUES</th>
              <th>Unidad</th>
              <th>Región</th>
              <th>Difícil acceso</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(v, i) in printableVisits" :key="`${v.id}-${i}`">
              <td>{{ i + 1 }}</td>
              <td>{{ v.clues || '-' }}</td>
              <td>{{ v.unidad || v.name || '-' }}</td>
              <td>{{ v.region || '-' }}</td>
              <td>{{ v.hard ? 'Sí' : 'No' }}</td>
            </tr>
            <tr v-if="!printableVisits.length">
              <td colspan="5" class="empty-row">No hay visitas para mostrar</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="preview-page landscape-preview">
        <h2>Enlaces de apoyo</h2>
        <p class="muted">
          Estos enlaces permiten abrir segmentos de la ruta en Google Maps.
        </p>

        <table class="clean-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Tramo</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, idx) in mapsLinks" :key="idx">
              <td>{{ idx + 1 }}</td>
              <td>{{ l.from }} - {{ l.to }}</td>
              <td class="url-cell">{{ l.url }}</td>
            </tr>
            <tr v-if="!mapsLinks.length">
              <td colspan="3" class="empty-row">No hay enlaces disponibles</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="preview-page landscape-preview">
        <div class="map-page-header">
          <div>
            <h2>Mapa de la ruta personalizada</h2>
            <p class="muted">
              Vista de la ruta trazada con marcadores.
            </p>
          </div>
        </div>

        <div ref="mapCaptureEl" class="preview-map-shell">
          <div ref="previewMapEl" class="preview-live-map"></div>

          <div v-if="mapLoading" class="preview-map-loading">
            Preparando mapa...
          </div>

          <div v-if="mapError" class="preview-map-error">
            {{ mapError }}
          </div>
        </div>

        <div class="map-footnote">
          Los marcadores visibles en el mapa corresponden al trazado de la ruta personalizada.
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'

const props = defineProps({
  open: { type: Boolean, default: false },
  routeTotal: { type: Object, default: null },
  routeTolls: {
    type: Object,
    default: () => ({
      hasTolls: false,
      known: false,
      currencyCode: null,
      amount: null,
      text: 'Sin peajes estimados'
    })
  },
  subroutesUi: { type: Array, default: () => [] },
  mapsLinks: { type: Array, default: () => [] },
  customPoints: { type: Array, default: () => [] },
  customStrategy: { type: String, default: 'FASTEST' },
  customOriginMode: { type: String, default: 'first' },
  customOriginPharmacyId: { type: Number, default: null },
  customOriginCoords: {
    type: Object,
    default: () => ({ lat: '', lng: '' })
  },
  visitOrder: { type: Array, default: () => [] },
  routeRawData: { type: Object, default: null },
  formatKm: { type: Function, required: true },
  formatDur: { type: Function, required: true }
})

defineEmits(['close'])

const isExporting = ref(false)
const previewMapEl = ref(null)
const mapCaptureEl = ref(null)
const mapLoading = ref(false)
const mapError = ref('')
const showRenderHint = ref(false)

let previewMap = null
let previewPolylines = []
let previewMarkers = []

const generatedAt = ref(new Date())

const MAP_WIDTH = 1280
const MAP_HEIGHT = 720
const MAP_PADDING = 12
const EXTRA_ZOOM_AFTER_FIT = 0
const MAX_AUTO_ZOOM = 15

const generatedDate = computed(() =>
  generatedAt.value.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
)

const generatedTime = computed(() =>
  generatedAt.value.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit'
  })
)

const strategyLabel = computed(() => {
  const map = {
    FASTEST: 'Optimizar tiempo',
    RESOURCES: 'Optimizar recursos',
    NEAREST_FIRST: 'Visitar cercanas primero',
    FARTHEST_FIRST: 'Visitar lejanas primero',
    MANUAL: 'Respetar el orden del carrito'
  }
  return map[String(props.customStrategy || '').toUpperCase()] || props.customStrategy
})

const tollsLabel = computed(() => {
  const direct = props.routeTolls?.text?.trim()
  const directAmount = Number(props.routeTolls?.amount)

  if (direct && direct !== 'Sin peajes estimados') return direct

  const withKnownTolls = (props.subroutesUi || []).filter(sr =>
    sr?.tolls?.known && Number.isFinite(Number(sr?.tolls?.amount))
  )

  if (withKnownTolls.length) {
    const currency = withKnownTolls[0]?.tolls?.currencyCode || 'MXN'
    const total = withKnownTolls.reduce((acc, sr) => acc + Number(sr.tolls.amount || 0), 0)
    return `${total.toFixed(2)} ${currency}`
  }

  const withUnknownTolls = (props.subroutesUi || []).some(sr => sr?.tolls?.hasTolls)
  if (withUnknownTolls) return 'Peajes detectados sin importe estimado'

  if (Number.isFinite(directAmount) && directAmount > 0) {
    return `${directAmount.toFixed(2)} ${props.routeTolls?.currencyCode || 'MXN'}`
  }

  return 'Sin peajes estimados'
})

const originLabel = computed(() => {
  if (props.customOriginMode === 'coords') {
    const lat = props.customOriginCoords?.lat ?? ''
    const lng = props.customOriginCoords?.lng ?? ''
    return `Coordenadas (${lat}, ${lng})`
  }

  if (props.customOriginMode === 'pharmacy') {
    const found = props.customPoints.find(
      p => Number(p.id) === Number(props.customOriginPharmacyId)
    )
    if (found) {
      return `${found.clues || found.name}${found.unidad ? ` - ${found.unidad}` : ''}`
    }
    return 'Unidad seleccionada'
  }

  return 'Primera unidad del carrito'
})

const totalStops = computed(() =>
  props.visitOrder.filter(v => v && v.name !== 'ORIGEN').length || props.customPoints.length
)

const regionsLabel = computed(() => {
  const regions = Array.from(
    new Set(props.customPoints.map(p => p.region).filter(Boolean))
  )
  return regions.length ? regions.join(', ') : '-'
})

const printableVisits = computed(() =>
  props.visitOrder
    .filter(v => v && v.name !== 'ORIGEN')
    .map(v => {
      const src = props.customPoints.find(p => Number(p.id) === Number(v.id))
      return {
        ...v,
        clues: src?.clues || v.name || '',
        unidad: src?.unidad || '',
        region: src?.region || '',
        hard: !!src?.hard
      }
    })
)

function clearPreviewMap() {
  previewPolylines.forEach(pl => {
    try { pl.setMap(null) } catch {}
  })

  previewMarkers.forEach(m => {
    try { m.setMap(null) } catch {}
  })

  previewPolylines = []
  previewMarkers = []

  if (previewMapEl.value) {
    previewMapEl.value.innerHTML = ''
  }

  previewMap = null
}

function buildSvgDataUrl(text, { fill = '#111827', stroke = '#ffffff', textColor = '#ffffff' } = {}) {
  const safe = String(text)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42">
      <circle cx="21" cy="21" r="16" fill="${fill}" stroke="${stroke}" stroke-width="3" />
      <text x="21" y="26" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${textColor}">
        ${safe}
      </text>
    </svg>
  `
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function createBasicMarker(position, title, text, isOrigin = false) {
  return new google.maps.Marker({
    position,
    map: previewMap,
    title,
    icon: {
      url: buildSvgDataUrl(text, {
        fill: isOrigin ? '#0f172a' : '#111827',
        stroke: '#ffffff',
        textColor: '#ffffff'
      }),
      scaledSize: new google.maps.Size(32, 32),
      anchor: new google.maps.Point(16, 16)
    },
    zIndex: isOrigin ? 999 : 100 + Number(text || 0)
  })
}

function getRouteBounds() {
  const bounds = new google.maps.LatLngBounds()
  let hasPoints = false

  const subroutes = props.routeRawData?.subroutes || []

  for (const sr of subroutes) {
    if (!sr?.polyline) continue
    const path = google.maps.geometry.encoding.decodePath(sr.polyline)
    path.forEach(point => {
      bounds.extend(point)
      hasPoints = true
    })
  }

  const originPoint = props.routeRawData?.start
  if (originPoint?.lat != null && originPoint?.lng != null) {
    bounds.extend({
      lat: Number(originPoint.lat),
      lng: Number(originPoint.lng)
    })
    hasPoints = true
  }

  for (const v of props.visitOrder || []) {
    if (!v || v.name === 'ORIGEN') continue
    if (typeof v.lat !== 'number' || typeof v.lng !== 'number') continue

    bounds.extend({ lat: v.lat, lng: v.lng })
    hasPoints = true
  }

  return hasPoints ? bounds : null
}

async function waitForMapIdle(map, extraDelay = 500) {
  await new Promise(resolve => {
    google.maps.event.addListenerOnce(map, 'idle', () => {
      setTimeout(resolve, extraDelay)
    })
  })
}

async function renderInteractiveMap() {
  if (!previewMapEl.value || !window.google || !google.maps) return

  mapLoading.value = true
  mapError.value = ''

  try {
    await google.maps.importLibrary('geometry')

    clearPreviewMap()
    await nextTick()

    previewMap = new google.maps.Map(previewMapEl.value, {
      center: { lat: 20.6736, lng: -103.344 },
      zoom: 8,
      disableDefaultUI: true,
      gestureHandling: 'none',
      keyboardShortcuts: false,
      clickableIcons: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    })

    const palette = ['#1565C0', '#2E7D32', '#6A1B9A', '#EF6C00', '#00897B', '#D81B60', '#5D4037']
    const subroutes = props.routeRawData?.subroutes || []

    subroutes.forEach((sr, idx) => {
      if (!sr?.polyline) return

      const path = google.maps.geometry.encoding.decodePath(sr.polyline)
      const polyline = new google.maps.Polyline({
        path,
        strokeColor: palette[idx % palette.length],
        strokeOpacity: 0.95,
        strokeWeight: 5,
        clickable: false,
        geodesic: false,
        map: previewMap
      })

      previewPolylines.push(polyline)
    })

    const originPoint = props.routeRawData?.start
    if (originPoint?.lat != null && originPoint?.lng != null) {
      const originMarker = createBasicMarker(
        { lat: Number(originPoint.lat), lng: Number(originPoint.lng) },
        'ORIGEN',
        'O',
        true
      )
      previewMarkers.push(originMarker)
    }

    let i = 1
    props.visitOrder
      .filter(v => v && v.name !== 'ORIGEN' && typeof v.lat === 'number' && typeof v.lng === 'number')
      .forEach(v => {
        const marker = createBasicMarker(
          { lat: v.lat, lng: v.lng },
          v.name,
          String(i++),
          false
        )
        previewMarkers.push(marker)
      })

    const bounds = getRouteBounds()

    if (bounds) {
      previewMap.fitBounds(bounds, MAP_PADDING)
      await waitForMapIdle(previewMap, 700)

      const currentZoom = previewMap.getZoom()
      if (typeof currentZoom === 'number') {
        const adjustedZoom = Math.min(currentZoom + EXTRA_ZOOM_AFTER_FIT, MAX_AUTO_ZOOM)
        if (adjustedZoom !== currentZoom) {
          previewMap.setZoom(adjustedZoom)
          await waitForMapIdle(previewMap, 500)
        }
      }
    } else {
      await waitForMapIdle(previewMap, 500)
    }
  } catch (err) {
    console.error(err)
    mapError.value = 'No se pudo preparar el mapa para exportación.'
  } finally {
    mapLoading.value = false
  }
}

async function ensureMapReady() {
  await nextTick()
  await renderInteractiveMap()
}

function drawSummaryCard(doc, x, y, w, h, label, value) {
  doc.setDrawColor(209, 213, 219)
  doc.setFillColor(250, 250, 250)
  doc.roundedRect(x, y, w, h, 3, 3, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(75, 85, 99)
  doc.text(label, x + w / 2, y + 8, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(17, 24, 39)
  const lines = doc.splitTextToSize(String(value || '-'), w - 10)
  doc.text(lines, x + w / 2, y + 18, { align: 'center', maxWidth: w - 10 })
}

function buildFileName() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `plan_trabajo_ruta_personalizada_${yyyy}${mm}${dd}.pdf`
}

async function getImageSize(dataUrl) {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = dataUrl
  })
}

function fitRect(srcW, srcH, boxW, boxH) {
  const srcRatio = srcW / srcH
  const boxRatio = boxW / boxH

  if (srcRatio > boxRatio) {
    const w = boxW
    const h = w / srcRatio
    return { w, h }
  }

  const h = boxH
  const w = h * srcRatio
  return { w, h }
}

async function getMapDataUrlForPdf() {
  if (!mapCaptureEl.value) {
    throw new Error('No hay contenedor del mapa para exportar.')
  }

  const canvas = await html2canvas(mapCaptureEl.value, {
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    scale: 2,
    logging: false,
    width: mapCaptureEl.value.offsetWidth,
    height: mapCaptureEl.value.offsetHeight,
    windowWidth: document.documentElement.clientWidth,
    windowHeight: document.documentElement.clientHeight
  })

  return canvas.toDataURL('image/png', 1.0)
}

async function exportPdf() {
  if (isExporting.value) return

  try {
    isExporting.value = true
    showRenderHint.value = true

    await ensureMapReady()

    if (mapError.value) {
      throw new Error(mapError.value)
    }

    const mapDataUrl = await getMapDataUrlForPdf()
    const imgSize = await getImageSize(mapDataUrl)

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'letter',
      compress: true
    })

    const now = new Date()
    const fecha = now.toLocaleDateString('es-MX')
    const hora = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(17, 24, 39)
    doc.text('Plan de trabajo - Ruta personalizada', 14, 16)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(75, 85, 99)
    doc.text('Documento temporal generado para seguimiento operativo.', 14, 23)

    doc.setDrawColor(209, 213, 219)
    doc.setFillColor(250, 250, 250)
    doc.roundedRect(205, 10, 58, 20, 3, 3, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(17, 24, 39)
    doc.text(`Fecha: ${fecha}`, 234, 17, { align: 'center' })
    doc.text(`Hora: ${hora}`, 234, 24, { align: 'center' })

    const x1 = 14
    const x2 = 78
    const x3 = 142
    const x4 = 206
    const row1 = 36
    const row2 = 63
    const cardW = 56
    const cardH = 22

    drawSummaryCard(doc, x1, row1, cardW, cardH, 'Modo de cálculo', strategyLabel.value)
    drawSummaryCard(doc, x2, row1, cardW, cardH, 'Punto de inicio', originLabel.value)
    drawSummaryCard(doc, x3, row1, cardW, cardH, 'Total de unidades', totalStops.value)
    drawSummaryCard(doc, x4, row1, cardW, cardH, 'Regiones involucradas', regionsLabel.value)

    drawSummaryCard(doc, x1, row2, cardW, cardH, 'Distancia total', props.formatKm(props.routeTotal?.distanceMeters || 0))
    drawSummaryCard(doc, x2, row2, cardW, cardH, 'Duración estimada', props.formatDur(props.routeTotal?.duration || '0s'))
    drawSummaryCard(doc, x3, row2, 120, cardH, 'Peajes estimados', tollsLabel.value)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('Resumen de subrutas', 14, 96)

    autoTable(doc, {
      startY: 100,
      theme: 'grid',
      headStyles: {
        fillColor: [243, 244, 246],
        textColor: [17, 24, 39],
        lineColor: [209, 213, 219]
      },
      styles: {
        fontSize: 9,
        textColor: [17, 24, 39],
        lineColor: [209, 213, 219]
      },
      head: [[
        'Subruta',
        'Rango',
        'Distancia',
        'Duración',
        'Peajes'
      ]],
      body: props.subroutesUi.length
        ? props.subroutesUi.map(sr => [
            `#${sr.idx + 1}`,
            sr.range,
            props.formatKm(sr.distance),
            props.formatDur(sr.duration),
            sr.tolls?.text || 'Sin peajes estimados'
          ])
        : [['-', '-', '-', '-', 'Sin subrutas']]
    })

    const finalY1 = doc.lastAutoTable?.finalY || 120
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('Observación', 14, finalY1 + 10)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(
      doc.splitTextToSize(
        'Esta ruta es temporal y fue generada únicamente como plan de trabajo operativo. No representa persistencia ni asignación definitiva en el sistema.',
        240
      ),
      14,
      finalY1 + 18
    )

    doc.addPage('letter', 'landscape')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text('Orden de visita', 14, 16)

    autoTable(doc, {
      startY: 22,
      theme: 'grid',
      headStyles: {
        fillColor: [243, 244, 246],
        textColor: [17, 24, 39],
        lineColor: [209, 213, 219]
      },
      styles: {
        fontSize: 9,
        textColor: [17, 24, 39],
        lineColor: [209, 213, 219]
      },
      head: [[
        'Orden',
        'CLUES',
        'Unidad',
        'Región',
        'Difícil acceso'
      ]],
      body: printableVisits.value.length
        ? printableVisits.value.map((v, i) => [
            i + 1,
            v.clues || '-',
            v.unidad || v.name || '-',
            v.region || '-',
            v.hard ? 'Sí' : 'No'
          ])
        : [['-', '-', '-', '-', '-']]
    })

    doc.addPage('letter', 'landscape')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(17, 24, 39)
    doc.text('Enlaces de apoyo', 14, 16)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(75, 85, 99)
    doc.text('Estos enlaces permiten abrir segmentos de la ruta en Google Maps.', 14, 22)

    autoTable(doc, {
      startY: 28,
      theme: 'grid',
      headStyles: {
        fillColor: [243, 244, 246],
        textColor: [17, 24, 39],
        lineColor: [209, 213, 219]
      },
      styles: {
        fontSize: 8,
        textColor: [17, 24, 39],
        lineColor: [209, 213, 219],
        cellWidth: 'wrap',
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 48 },
        2: { cellWidth: 190, textColor: [37, 99, 235], halign: 'center' }
      },
      head: [[
        '#',
        'Tramo',
        'Acción'
      ]],
      body: props.mapsLinks.length
        ? props.mapsLinks.map((l, idx) => [
            idx + 1,
            `${l.from} - ${l.to}`,
            'Abrir ruta en Google Maps'
          ])
        : [['-', '-', 'No hay enlaces disponibles']],
      didDrawCell: data => {
        if (
          data.section === 'body' &&
          data.column.index === 2 &&
          props.mapsLinks.length &&
          props.mapsLinks[data.row.index]?.url
        ) {
          const url = String(props.mapsLinks[data.row.index].url).trim()
          if (!url) return

          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url })
        }
      }
    })

    doc.addPage('letter', 'landscape')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(17, 24, 39)
    doc.text('Mapa de la ruta personalizada', 14, 16)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(75, 85, 99)
    doc.text('Vista de la ruta trazada con marcadores.', 14, 22)

    const boxX = 10
    const boxY = 28
    const boxW = 258
    const boxH = 145

    doc.setFillColor(255, 255, 255)
    doc.rect(boxX, boxY, boxW, boxH, 'F')

    const fitted = fitRect(imgSize.width, imgSize.height, boxW, boxH)
    const drawX = boxX + (boxW - fitted.w) / 2
    const drawY = boxY + (boxH - fitted.h) / 2

    doc.addImage(mapDataUrl, 'PNG', drawX, drawY, fitted.w, fitted.h, undefined, 'FAST')

    doc.setDrawColor(209, 213, 219)
    doc.rect(boxX, boxY, boxW, boxH)

    doc.setFontSize(9)
    doc.setTextColor(75, 85, 99)
    doc.text(
      'Los marcadores visibles en el mapa corresponden al trazado de la ruta personalizada.',
      14,
      183
    )

    doc.save(buildFileName())
  } catch (err) {
    console.error(err)
    alert('No se pudo exportar el PDF.')
  } finally {
    isExporting.value = false
    showRenderHint.value = false
  }
}

watch(
  () => props.open,
  async v => {
    if (!v) {
      clearPreviewMap()
      return
    }

    generatedAt.value = new Date()
    await nextTick()
    await ensureMapReady()
  }
)

watch(
  () => props.routeRawData,
  async () => {
    if (!props.open) return
    generatedAt.value = new Date()
    await nextTick()
    await ensureMapReady()
  },
  { deep: true }
)

watch(
  () => props.visitOrder,
  async () => {
    if (!props.open) return
    generatedAt.value = new Date()
    await nextTick()
    await ensureMapReady()
  },
  { deep: true }
)

onBeforeUnmount(() => {
  clearPreviewMap()
})
</script>

<style scoped>
.plan-print-root {
  position: fixed;
  inset: 0;
  background: #f3f4f6;
  z-index: 20000;
  overflow: auto;
  color: #111827;
}

.plan-print-root,
.plan-print-root * {
  box-sizing: border-box;
}

.plan-print-toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(6px);
}

.toolbar-left {
  font-size: 16px;
  color: #111827;
}

.toolbar-actions {
  display: flex;
  gap: 10px;
}

.btn-primary,
.btn-ghost {
  appearance: none;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
}

.btn-primary {
  background: #111827;
  color: #ffffff;
  border-color: #111827;
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-ghost {
  background: #ffffff;
  color: #111827;
}

.render-hint-banner {
  position: sticky;
  top: 68px;
  z-index: 19;
  margin: 0 24px;
  padding: 12px 16px;
  border: 1px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
}

.plan-print-document {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.preview-page {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 28px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.landscape-preview {
  min-height: 700px;
}

.doc-header,
.map-page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.doc-header h1,
.preview-page h2 {
  margin: 0 0 8px;
  color: #111827;
}

.muted {
  margin: 0;
  color: #6b7280;
}

.meta-box {
  min-width: 180px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 14px;
  color: #111827;
}

.summary-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.summary-grid.one-row {
  grid-template-columns: 1fr;
}

.summary-card {
  border: 1px solid #e5e7eb;
  background: #fafafa;
  border-radius: 14px;
  padding: 14px;
}

.wide-card {
  min-height: 86px;
}

.summary-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}

.summary-value {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
}

.summary-help {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}

.section-block {
  margin-top: 24px;
}

.note {
  margin: 8px 0 0;
  color: #374151;
  line-height: 1.5;
}

.clean-table {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  table-layout: fixed;
}

.clean-table th,
.clean-table td {
  border: 1px solid #d1d5db;
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
  font-size: 14px;
  color: #111827;
  word-break: break-word;
}

.clean-table th {
  background: #f3f4f6;
}

.empty-row {
  text-align: center;
  color: #6b7280;
}

.url-cell {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
}

.preview-map-shell {
  position: relative;
  width: 100%;
  margin-top: 18px;
  border: 1px solid #d1d5db;
  border-radius: 16px;
  overflow: hidden;
  background: #ffffff;
}

.preview-live-map {
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 520px;
  background: #eef2f7;
}

.preview-map-loading,
.preview-map-error {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 5;
  background: rgba(17, 24, 39, 0.82);
  color: #ffffff;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
}

.preview-map-error {
  background: rgba(127, 29, 29, 0.9);
}

.map-footnote {
  margin-top: 14px;
  color: #6b7280;
  font-size: 13px;
}

@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .plan-print-toolbar,
  .doc-header,
  .map-page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .preview-page {
    padding: 18px;
  }

  .preview-live-map {
    min-height: 360px;
  }

  .render-hint-banner {
    margin: 0 16px;
  }
}
</style>