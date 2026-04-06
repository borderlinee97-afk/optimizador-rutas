<!-- src/components/MapPage.vue -->
<template>
  <div id="map-wrapper">
    <div ref="mapEl" class="map"></div>

    <FabGroup
      :trafficEnabled="trafficEnabled"
      :markersVisible="markersVisible"
      :hasAnyRoute="hasAnyRoute"
      @open-criteria="openCriteria"
      @toggle-traffic="toggleTraffic"
      @toggle-markers="toggleMarkers"
      @close-route="onCloseRoute"
    />

    <Legend
      :regiones="regiones"
      :getColorForRegion="getColorForRegion"
    />

    <PanelSandbox
      :collapsed="panelCollapsed"
      @toggle-collapsed="onPanelToggle"
    >
      <RouteCart
        :customPoints="customPoints"
        :customStrategy="customStrategy"
        :customOriginMode="customOriginMode"
        :customOriginPharmacyId="customOriginPharmacyId"
        :customOriginCoords="customOriginCoords"
        :customOriginCandidates="customOriginCandidates"
        :canGeneratePdf="canGeneratePdf"
        @update:customPoints="setCustomPoints"
        @update:customStrategy="val => customStrategy = val"
        @update:customOriginMode="val => customOriginMode = val"
        @update:customOriginPharmacyId="val => customOriginPharmacyId = val"
        @update:customOriginCoords="val => customOriginCoords = val"
        @add-stops="openAddStopsModal"
        @clear="clearCustomPoints"
        @calculate="runCustomRoute"
        @generate-pdf="openPlanPdf"
      />

      <hr class="panel-separator" />

      <PanelGeneral
        :routeTotal="routeTotal"
        :routeTolls="routeTolls"
        :subroutesUi="subroutesUi"
        :readableOrder="readableOrder"
        :routeLegs="routeLegs"
        :postOrder="postOrder"
        :mapsLinks="mapsLinks"
        :formatKm="formatKm"
        :formatDur="formatDur"
        @focus-subroute="focusSubroute"
        @post-drag-start="postDragStart"
        @post-drag-enter="postDragEnter"
        @post-drop="postDrop"
        @toggle-post-item="togglePostItem"
        @recalc="recalcWithPostOrder"
        @copy-link="copyToClipboard"
        @export-excel="exportToExcel"
        @export-csv="exportCsvVisits"
      />
    </PanelSandbox>

    <CriteriaModal
      :open="criteriaOpen"
      :regiones="regiones"
      :criteria="criteria"
      :originMode="originMode"
      :originPharmacyId="originPharmacyId"
      :farmaciasRegion="farmaciasRegion"
      :manualPoints="manualPoints"
      @update:originMode="val => originMode = val"
      @update:originPharmacyId="val => originPharmacyId = val"
      @drag-start="onDragStart"
      @drag-enter="onDragEnter"
      @drop="onDrop"
      @close="criteriaOpen = false"
      @calculate="runCompute"
    />

    <AddStopsModal
      :open="addStopsOpen"
      :regiones="regiones"
      :items="addStopsItems"
      :existingIds="customPointIds"
      @close="closeAddStopsModal"
      @load-region="loadAddStopsRegion"
      @add="handleAddStops"
    />

    <PlanTrabajoPrintView
      :open="planPrintOpen"
      :routeTotal="routeTotal"
      :routeTolls="routeTolls"
      :subroutesUi="subroutesUi"
      :mapsLinks="mapsLinks"
      :customPoints="customPoints"
      :customStrategy="customStrategy"
      :customOriginMode="customOriginMode"
      :customOriginPharmacyId="customOriginPharmacyId"
      :customOriginCoords="customOriginCoords"
      :visitOrder="visitOrderDetailed"
      :routeRawData="lastRawData"
      :formatKm="formatKm"
      :formatDur="formatDur"
      @close="closePlanPdf"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, computed } from 'vue'
import { waitForEl, formatKm as fmtKm, formatDur as fmtDur } from '../utils/format.js'
import { createRegionColorer } from '../utils/colors.js'
import { exportToExcelSingle, exportCsv } from '../utils/export.js'
import { getFarmacias } from '../services/api.js'
import { useMap } from '../composables/useMap.js'
import { useRouting } from '../composables/useRouting.js'

import FabGroup from './ui/FabGroup.vue'
import Legend from './ui/Legend.vue'
import PanelSandbox from './panel/PanelSandbox.vue'
import PanelGeneral from './panel/PanelGeneral.vue'
import RouteCart from './panel/RouteCart.vue'
import CriteriaModal from './modals/CriteriaModal.vue'
import AddStopsModal from './modals/AddStopsModal.vue'
import PlanTrabajoPrintView from './print/PlanTrabajoPrintView.vue'

const {
  mapEl, map, initMap,
  toggleTraffic, toggleMarkers,
  trafficEnabled, markersVisible,
  trackOverlay, detachOverlay, clearAllOverlays
} = useMap()

const routing = useRouting({ map, trackOverlay, detachOverlay, clearAllOverlays })
const {
  farmacias, regiones, farmaciasRegion,
  criteriaOpen, criteria, originMode, originPharmacyId,
  openCriteria, manualPoints,
  onDragStart, onDragEnter, onDrop,

  customPoints, customStrategy,
  customOriginMode, customOriginPharmacyId, customOriginCoords, customOriginCandidates,
  addCustomStops, setCustomPoints, clearCustomPoints, runCustomRoute,

  postOrder, postDragStart, postDragEnter, postDrop,
  routeTotal, routeLegs, readableOrder, routeTolls,
  subroutesUi,
  focusSubroute, hasAnyRoute,
  mapsLinks, linkChunkSize, copyToClipboard,
  runCompute, recalcWithPostOrder, onCloseRoute,
  lastRegionUsed, lastOriginUsed, lastRawData
} = routing

linkChunkSize.value = 10

const { getColorForRegion, reset } = createRegionColorer()

const panelCollapsed = ref(false)
function onPanelToggle() {
  panelCollapsed.value = !panelCollapsed.value
}

const addStopsOpen = ref(false)
const addStopsItems = ref([])

const customPointIds = computed(() =>
  customPoints.value.map(p => Number(p.id))
)

const visitOrderDetailed = computed(() => {
  const vo = lastRawData.value?.visitOrder ?? []
  return vo.map(p => {
    if (!p || p.name === 'ORIGEN') return p
    const f = farmacias.value.find(ff => Number(ff.id) === Number(p.id))
    return {
      ...p,
      clues: f?.clues || p.name || '',
      unidad: f?.unidad || '',
      region: f?.region_sanitaria || '',
      hard: !!f?.dificil_acceso
    }
  })
})

const canGeneratePdf = computed(() =>
  !!(
    routeTotal.value &&
    lastRawData.value &&
    Array.isArray(lastRawData.value?.subroutes) &&
    lastRawData.value.subroutes.length
  )
)

function openAddStopsModal() {
  addStopsItems.value = []
  addStopsOpen.value = true
}

function closeAddStopsModal() {
  addStopsOpen.value = false
  addStopsItems.value = []
}

function loadAddStopsRegion(region) {
  addStopsItems.value = farmacias.value
    .filter(f => f.region_sanitaria === region)
    .sort((a, b) => {
      const aa = `${a.clues || ''} ${a.unidad || ''}`.trim().toLowerCase()
      const bb = `${b.clues || ''} ${b.unidad || ''}`.trim().toLowerCase()
      return aa.localeCompare(bb, 'es')
    })
}

function handleAddStops(ids) {
  addCustomStops(ids)
  closeAddStopsModal()
}

function togglePostItem(i) {
  const it = postOrder.value[i]
  if (!it) return

  if (!it.enabled && it.hard) {
    const ok = confirm(
      `"${it.unidad || it.name}" está marcada como DIFÍCIL ACCESO.\n¿Quieres incluirla en la ruta de todos modos?`
    )
    if (!ok) return
  }

  it.enabled = !it.enabled
}

const formatKm = m => fmtKm(m)
const formatDur = d => fmtDur(d)

async function exportToExcel() {
  if (!lastRawData.value) {
    alert('No hay ruta calculada')
    return
  }

  try {
    await exportToExcelSingle({
      criteria,
      lastRegionUsed,
      lastOriginUsed,
      linkChunkSize,
      lastRawData,
      mapsLinks,
      farmacias
    })
  } catch (err) {
    console.error(err)
    alert('Para exportar a Excel instala primero: npm i xlsx')
  }
}

function exportCsvVisits() {
  const vo = (lastRawData.value?.visitOrder ?? [])
    .filter(p =>
      p &&
      p.name !== 'ORIGEN' &&
      typeof p.lat === 'number' &&
      typeof p.lng === 'number'
    )
    .map((p, i) => ({
      orden: i + 1,
      id: p.id,
      nombre: p.name,
      lat: p.lat,
      lng: p.lng
    }))

  if (!vo.length) {
    alert('No hay visitas')
    return
  }

  exportCsv(vo, 'visitas')
}

const planPrintOpen = ref(false)

function openPlanPdf() {
  if (!canGeneratePdf.value) {
    alert('Primero calcula una ruta personalizada válida.')
    return
  }
  planPrintOpen.value = true
}

function closePlanPdf() {
  planPrintOpen.value = false
}

onMounted(async () => {
  await nextTick()

  const el = await waitForEl(mapEl)
  if (!el) return

  const data = await getFarmacias({ withCoords: true })

  farmacias.value = Array.isArray(data)
    ? data.map(f => ({ ...f, id: Number(f.id) }))
    : []

  reset()
  farmacias.value.forEach(f => getColorForRegion(f.region_sanitaria))
  await initMap({ getColorForRegion, farmacias })
})
</script>

<style>
html, body, #app, #map-wrapper {
  margin: 0;
  padding: 0;
  width: 100vw;
  height: 100vh;
}

.map {
  width: 100%;
  height: 100%;
}

* {
  color: #111827;
}

a {
  color: #111827;
  text-decoration: underline;
}

.panel-separator {
  border: 0;
  border-top: 1px solid #e5e7eb;
  margin: 12px 0;
}
</style>