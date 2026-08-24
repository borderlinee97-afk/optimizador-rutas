<!-- src/components/MapPage.vue -->
<template>
  <div id="map-wrapper">
    <div
      ref="mapEl"
      class="map"
    ></div>

    <!-- =====================================================
         OPERACIONES
    ====================================================== -->
    <FabGroup
      v-if="isOperations"
      :trafficEnabled="trafficEnabled"
      :markersVisible="markersVisible"
      :hasAnyRoute="hasAnyRoute"
      @open-criteria="openCriteria"
      @toggle-traffic="toggleTraffic"
      @toggle-markers="toggleMarkers"
      @close-route="handleCloseRoute"
    />

    <!-- =====================================================
         FARMACIAS
    ====================================================== -->
    <div
      v-else-if="isFarmacias"
      class="farmacias-map-tools"
    >
      <button
        type="button"
        class="map-tool-button"
        :class="{
          active: markersVisible
        }"
        :title="
          markersVisible
            ? 'Ocultar marcadores'
            : 'Mostrar marcadores'
        "
        :aria-label="
          markersVisible
            ? 'Ocultar marcadores'
            : 'Mostrar marcadores'
        "
        @click="toggleMarkers"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"
          />

          <circle
            cx="12"
            cy="10"
            r="2.3"
          />
        </svg>

        <span class="map-tool-tooltip">
          {{
            markersVisible
              ? 'Ocultar marcadores'
              : 'Mostrar marcadores'
          }}
        </span>
      </button>

      <button
        type="button"
        class="map-tool-button"
        :class="{
          active: trafficEnabled
        }"
        :title="
          trafficEnabled
            ? 'Ocultar tráfico'
            : 'Mostrar tráfico'
        "
        :aria-label="
          trafficEnabled
            ? 'Ocultar tráfico'
            : 'Mostrar tráfico'
        "
        @click="toggleTraffic"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M8 3h8l2 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7l2-4Z"
          />

          <circle
            cx="12"
            cy="8"
            r="1.4"
          />

          <circle
            cx="12"
            cy="12"
            r="1.4"
          />

          <circle
            cx="12"
            cy="16"
            r="1.4"
          />
        </svg>

        <span class="map-tool-tooltip">
          {{
            trafficEnabled
              ? 'Ocultar tráfico'
              : 'Mostrar tráfico'
          }}
        </span>
      </button>

      <button
        type="button"
        class="map-tool-button"
        title="Ajustar mapa al ámbito visible"
        aria-label="Ajustar mapa al ámbito visible"
        @click="fitCurrentFarmacias"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"
          />

          <path
            d="M9 9h6v6H9z"
          />
        </svg>

        <span class="map-tool-tooltip">
          Ajustar mapa
        </span>
      </button>
    </div>

    <!-- =====================================================
         NAVEGACIÓN OPERACIONES
    ====================================================== -->
    <Legend
      v-if="isOperations"
      :projects="projects"
      :selectedProject="selectedLegendProject"
      :regiones="filteredRegiones"
      :getColorForRegion="getColorForRegion"
      @select-project="handleLegendProject"
      @select-region="handleLegendRegion"
      @back-projects="handleLegendBackProjects"
      @clear-filters="handleLegendClear"
    />

    <!-- =====================================================
         NAVEGACIÓN FARMACIAS
    ====================================================== -->
    <StructureNavigator
      v-else-if="isFarmacias"
      :profile="profile"
      :states="webContext?.states || []"
      :selectedState="selectedWebState"
      :structure="webStructure"
      :selectedCoordinator="selectedCoordinator"
      :selectedSupervisor="selectedSupervisor"
      :coordinatorSupervisors="coordinatorSupervisors"
      :unitsCount="visibleUnitsCount"
      :coordinatorAssignmentStatus="coordinatorAssignmentStatus"
      :loading="structureLoading"
      :error="structureError"
      @select-state="handleWebStateSelect"
      @select-coordinator="handleWebCoordinatorSelect"
      @select-supervisor="handleWebSupervisorSelect"
      @select-assignment-status="handleWebCoordinatorAssignmentStatus"
      @back="handleWebStructureBack"
    />

    <!-- =====================================================
         PANEL OPERACIONES
    ====================================================== -->
    <PanelSandbox
      v-if="isOperations"
      :collapsed="panelCollapsed"
      @toggle-collapsed="onPanelToggle"
    >
      <template v-if="showRouteCart">
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
          @calculate="handleRunCustomRoute"
          @generate-pdf="openPlanPdf"
        />

        <hr class="panel-separator" />
      </template>

      <PanelGeneral
        :routeTotal="routeTotal"
        :routeFuel="routeFuel"
        :routeTolls="routeTolls"
        :operatorRoutes="operatorRoutes"
        :selectedOperator="selectedOperator"
        :selectedOperatorDay="selectedOperatorDay"
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
        @select-operator="applyOperatorFilter"
        @select-operator-day="applyOperatorDayFilter"
      />
    </PanelSandbox>

    <!-- =====================================================
         MODAL CRITERIOS
    ====================================================== -->
    <CriteriaModal
      v-if="isOperations"
      :open="criteriaOpen"
      :regiones="criteriaRegiones"
      :criteria="criteria"
      :originMode="originMode"
      :originPharmacyId="originPharmacyId"
      :proyectoCedis="proyectoCedis"
      :selectedCedisId="selectedCedisId"
      :selectedCedis="selectedCedis"
      :farmaciasRegion="farmaciasRegion"
      :manualPoints="manualPoints"
      @update:originMode="val => originMode = val"
      @update:originPharmacyId="val => originPharmacyId = val"
      @update:selectedCedisId="val => selectedCedisId = val"
      @drag-start="onDragStart"
      @drag-enter="onDragEnter"
      @drop="onDrop"
      @close="criteriaOpen = false"
      @calculate="handleRunCompute"
    />

    <!-- =====================================================
         AÑADIR UNIDADES
    ====================================================== -->
    <AddStopsModal
      v-if="isOperations"
      :open="addStopsOpen"
      :regiones="regiones"
      :items="addStopsItems"
      :existingIds="customPointIds"
      @close="closeAddStopsModal"
      @load-region="loadAddStopsRegion"
      @add="handleAddStops"
    />

    <!-- =====================================================
         PDF
    ====================================================== -->
    <PlanTrabajoPrintView
      v-if="isOperations"
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
import {
  computed,
  nextTick,
  onMounted,
  ref,
  watch,
} from 'vue'

import {
  waitForEl,
  formatKm as fmtKm,
  formatDur as fmtDur,
} from '../utils/format.js'

import {
  createRegionColorer,
} from '../utils/colors.js'

import {
  exportCsv,
  exportToExcelSingle,
} from '../utils/export.js'

import {
  getFarmacias,
  getWebContext,
  getWebCoordinatorSupervisors,
  getWebStructure,
  getWebUnits,
  listProyectoCedis,
} from '../services/api.js'

import {
  useMap,
} from '../composables/useMap.js'

import {
  useRouting,
} from '../composables/useRouting.js'

import {
  useAuth,
} from '../composables/useAuth.js'

import FabGroup
  from './ui/FabGroup.vue'

import Legend
  from './ui/Legend.vue'

import StructureNavigator
  from './ui/StructureNavigator.vue'

import PanelSandbox
  from './panel/PanelSandbox.vue'

import PanelGeneral
  from './panel/PanelGeneral.vue'

import RouteCart
  from './panel/RouteCart.vue'

import CriteriaModal
  from './modals/CriteriaModal.vue'

import AddStopsModal
  from './modals/AddStopsModal.vue'

import PlanTrabajoPrintView
  from './print/PlanTrabajoPrintView.vue'

/*
 * ============================================================
 * PERFIL
 * ============================================================
 */

const {
  profile,
} =
  useAuth()

const isFarmacias =
  computed(
    () =>
      profile.value?.area ===
      'FARMACIAS'
  )

const isOperations =
  computed(
    () =>
      profile.value?.area ===
      'OPERACIONES'
  )

/*
 * ============================================================
 * PROYECTO / CEDIS
 * ============================================================
 */

const selectedProject =
  ref(
    'JALISCO'
  )

const proyectoCedis =
  ref([])

const selectedCedisId =
  ref(null)

const selectedCedis =
  computed(
    () =>
      proyectoCedis.value.find(
        cedis =>
          Number(
            cedis.id
          ) ===
          Number(
            selectedCedisId.value
          )
      ) ||
      null
  )

const selectedLegendProject =
  ref(null)

const selectedLegendRegion =
  ref(null)

/*
 * ============================================================
 * FARMACIAS WEB
 * ============================================================
 */

const webContext =
  ref(null)

const webStructure =
  ref(null)

const selectedWebState =
  ref(null)

const selectedCoordinator =
  ref(null)

const selectedSupervisor =
  ref(null)

const coordinatorSupervisors =
  ref([])

const visibleUnitsCount =
  ref(0)

const coordinatorAssignmentStatus =
  ref(
    'ALL'
  )

const structureLoading =
  ref(false)

const structureError =
  ref(null)

/*
 * ============================================================
 * MAPA
 * ============================================================
 */

const {
  mapEl,
  map,

  initMap,

  toggleTraffic,
  toggleMarkers,

  trafficEnabled,
  markersVisible,

  markers,

  filterPharmacyMarkersByIds,
  clearPharmacyMarkerFilter,
  filterPharmacyMarkers,

  trackOverlay,
  detachOverlay,
  clearAllOverlays,
} =
  useMap()

/*
 * ============================================================
 * ROUTING
 * ============================================================
 */

const routing =
  useRouting({
    map,

    trackOverlay,
    detachOverlay,
    clearAllOverlays,

    filterPharmacyMarkersByIds,
    clearPharmacyMarkerFilter,
  })

const {
  farmacias,
  scopedFarmacias,

  regiones,
  farmaciasRegion,

  criteriaOpen,
  criteria,

  originMode,
  originPharmacyId,

  openCriteria,

  manualPoints,

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

  operatorRoutes,
  routeFuel,

  selectedOperator,
  selectedOperatorDay,

  applyOperatorFilter,
  applyOperatorDayFilter,

  routeTolls,

  subroutesUi,
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
} =
  routing

linkChunkSize.value =
  10

/*
 * ============================================================
 * COLORES
 * ============================================================
 */

const {
  getColorForRegion,
  reset,
} =
  createRegionColorer()

/*
 * ============================================================
 * PANEL
 * ============================================================
 */

const panelCollapsed =
  ref(false)

function onPanelToggle() {
  panelCollapsed.value =
    !panelCollapsed.value
}

/*
 * ============================================================
 * MODAL AÑADIR UNIDADES
 * ============================================================
 */

const addStopsOpen =
  ref(false)

const addStopsItems =
  ref([])

const showRouteCart =
  ref(true)

const customPointIds =
  computed(
    () =>
      customPoints.value.map(
        point =>
          Number(
            point.id
          )
      )
  )

/*
 * ============================================================
 * VISIT ORDER
 * ============================================================
 */

const visitOrderDetailed =
  computed(
    () => {
      const visitOrder =
        lastRawData.value
          ?.visitOrder ??
        []

      return visitOrder.map(
        point => {
          if (
            !point ||
            point.name ===
              'ORIGEN'
          ) {
            return point
          }

          const farmacia =
            farmacias.value.find(
              item =>
                Number(
                  item.id
                ) ===
                Number(
                  point.id
                )
            )

          return {
            ...point,

            clues:
              farmacia?.clues ||
              point.name ||
              '',

            unidad:
              farmacia?.unidad ||
              '',

            region:
              farmacia
                ?.region_sanitaria ||
              '',

            hard:
              Boolean(
                farmacia
                  ?.dificil_acceso
              ),
          }
        }
      )
    }
  )

/*
 * ============================================================
 * NORMALIZACIÓN DE ÁMBITO
 * ============================================================
 */

function normalizeScopeValue(
  value
) {
  return String(
    value ??
    ''
  )
    .trim()
    .normalize(
      'NFD'
    )
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toUpperCase()
}

function getUnitProject(
  unit
) {
  return String(
    unit?.proyecto ||
    unit?.project ||
    unit?.estado ||
    ''
  )
    .trim()
    .toUpperCase()
}

function getUnitState(
  unit
) {
  return String(
    unit?.estado ||
    unit?.state ||
    unit?.proyecto ||
    ''
  ).trim()
}

function findStateForProject(
  project
) {
  const normalizedProject =
    normalizeScopeValue(
      project
    )

  const match =
    farmacias.value.find(
      unit =>
        normalizeScopeValue(
          getUnitProject(
            unit
          )
        ) ===
        normalizedProject
    )

  return getUnitState(
    match
  )
}

function syncOperationScope(
  project
) {
  const normalizedProject =
    String(
      project ||
      ''
    )
      .trim()
      .toUpperCase()

  selectedProject.value =
    normalizedProject

  criteria.value.proyecto =
    normalizedProject

  criteria.value.estado =
    findStateForProject(
      normalizedProject
    ) ||
    normalizedProject
}

/*
 * ============================================================
 * PROYECTOS
 * ============================================================
 */

const projects =
  computed(
    () =>
      Array.from(
        new Set(
          farmacias.value
            .map(
              getUnitProject
            )
            .filter(
              Boolean
            )
        )
      ).sort(
        (
          a,
          b
        ) =>
          a.localeCompare(
            b,
            'es'
          )
      )
  )

const filteredRegiones =
  computed(
    () => {
      const activeProject =
        selectedLegendProject.value ||
        selectedProject.value

      return Array.from(
        new Set(
          farmacias.value
            .filter(
              unit =>
                !activeProject ||
                normalizeScopeValue(
                  getUnitProject(
                    unit
                  )
                ) ===
                normalizeScopeValue(
                  activeProject
                )
            )
            .map(
              unit =>
                unit.region_sanitaria
            )
            .filter(
              Boolean
            )
        )
      ).sort(
        (
          a,
          b
        ) =>
          String(
            a
          ).localeCompare(
            String(
              b
            ),
            'es'
          )
      )
    }
  )

const criteriaRegiones =
  computed(
    () =>
      regiones.value
  )

/*
 * ============================================================
 * PDF DISPONIBLE
 * ============================================================
 */

const canGeneratePdf =
  computed(
    () =>
      Boolean(
        routeTotal.value &&
        lastRawData.value &&
        Array.isArray(
          lastRawData.value
            ?.subroutes
        ) &&
        lastRawData.value
          .subroutes.length
      )
  )

/*
 * ============================================================
 * CEDIS
 * ============================================================
 */

async function loadProjectCedis() {
  const project =
    selectedProject.value ||
    criteria.value.proyecto

  if (
    !project
  ) {
    proyectoCedis.value =
      []

    selectedCedisId.value =
      null

    criteria.value.selectedCedisId =
      null

    return
  }

  try {
    const data =
      await listProyectoCedis({
        estado:
          criteria.value.estado ||
          undefined,

        proyecto:
          project,
      })

    const list =
      Array.isArray(
        data
      )
        ? data
        : Array.isArray(
            data?.items
          )
          ? data.items
          : Array.isArray(
              data?.cedis
            )
            ? data.cedis
            : []

    proyectoCedis.value =
      list.map(
        cedis => ({
          ...cedis,

          id:
            Number(
              cedis.id
            ),
        })
      )

    selectedCedisId.value =
      proyectoCedis.value[0]
        ?.id ??
      null

    criteria.value.selectedCedisId =
      selectedCedisId.value
  } catch (
    error
  ) {
    console.warn(
      '[MapPage] No fue posible cargar CEDIS del proyecto:',
      error
    )

    proyectoCedis.value =
      []

    selectedCedisId.value =
      null

    criteria.value.selectedCedisId =
      null
  }
}

/*
 * ============================================================
 * MARCADORES
 * ============================================================
 */

function clearCurrentMarkers() {
  clearAllOverlays()

  for (
    const marker
    of markers.value ||
    []
  ) {
    try {
      marker.map =
        null
    } catch {}
  }

  markers.value =
    []
}

async function renderUnitsOnMap(
  units
) {
  clearCurrentMarkers()

  farmacias.value =
    Array.isArray(
      units
    )
      ? units.map(
          normalizeWebUnit
        )
      : []

  reset()

  farmacias.value.forEach(
    farmacia =>
      getColorForRegion(
        farmacia.region_sanitaria
      )
  )

  await initMap({
    getColorForRegion,
    farmacias,
  })
}

function normalizeWebUnit(
  unit
) {
  return {
    ...unit,

    id:
      Number(
        unit.id
      ),

    supervisor:
      unit.assignedSupervisorName ||
      '—',

    coordinador:
      unit.assignedCoordinatorName ||
      '—',

    dificil_acceso:
      Boolean(
        unit.dificil_acceso
      ),
  }
}

/*
 * ============================================================
 * FIT MAP
 * ============================================================
 */

function fitCurrentFarmacias() {
  if (
    !map.value ||
    !window.google?.maps ||
    !Array.isArray(
      farmacias.value
    ) ||
    !farmacias.value.length
  ) {
    return
  }

  const bounds =
    new window.google.maps
      .LatLngBounds()

  let validPoints =
    0

  let singlePoint =
    null

  for (
    const farmacia
    of farmacias.value
  ) {
    const lat =
      Number(
        farmacia.latitud
      )

    const lng =
      Number(
        farmacia.longitud
      )

    if (
      !Number.isFinite(
        lat
      ) ||
      !Number.isFinite(
        lng
      )
    ) {
      continue
    }

    const point = {
      lat,
      lng,
    }

    bounds.extend(
      point
    )

    singlePoint =
      point

    validPoints +=
      1
  }

  if (
    validPoints ===
    0
  ) {
    return
  }

  if (
    validPoints ===
    1
  ) {
    map.value.setCenter(
      singlePoint
    )

    map.value.setZoom(
      14
    )

    return
  }

  map.value.fitBounds(
    bounds,
    70
  )
}

/*
 * ============================================================
 * RESPUESTAS FARMACIAS
 * ============================================================
 */

function extractFarmaciasResponse(
  data
) {
  if (
    Array.isArray(
      data
    )
  ) {
    return data
  }

  if (
    Array.isArray(
      data?.items
    )
  ) {
    return data.items
  }

  if (
    Array.isArray(
      data?.farmacias
    )
  ) {
    return data.farmacias
  }

  if (
    Array.isArray(
      data?.units
    )
  ) {
    return data.units
  }

  return []
}

/*
 * ============================================================
 * CARGA TOTAL OPERATIVA
 * ============================================================
 */

async function fetchAllOperationalFarmacias() {
  const PAGE_SIZE =
    500

  const MAX_PAGES =
    20

  const collected =
    []

  const seenIds =
    new Set()

  for (
    let page = 1;
    page <= MAX_PAGES;
    page += 1
  ) {
    const response =
      await getFarmacias({
        withCoords:
          true,

        page,

        limit:
          PAGE_SIZE,
      })

    const items =
      extractFarmaciasResponse(
        response
      )

    if (
      !items.length
    ) {
      break
    }

    let added =
      0

    for (
      const item
      of items
    ) {
      const key =
        item?.id != null
          ? String(
              item.id
            )
          : `${getUnitProject(item)}|${item?.clues || ''}|${item?.latitud || ''}|${item?.longitud || ''}`

      if (
        seenIds.has(
          key
        )
      ) {
        continue
      }

      seenIds.add(
        key
      )

      collected.push(
        item
      )

      added +=
        1
    }

    if (
      items.length <
        PAGE_SIZE ||
      added ===
        0
    ) {
      break
    }
  }

  return collected
}

/*
 * ============================================================
 * INICIALIZAR OPERACIONES
 * ============================================================
 */

async function loadProjectFarmacias() {
  const data =
    await fetchAllOperationalFarmacias()

  await renderUnitsOnMap(
    data
  )

  const currentExists =
    projects.value.some(
      project =>
        normalizeScopeValue(
          project
        ) ===
        normalizeScopeValue(
          selectedProject.value
        )
    )

  if (
    !currentExists
  ) {
    selectedProject.value =
      projects.value[0] ||
      ''
  }

  syncOperationScope(
    selectedProject.value
  )
}

/*
 * ============================================================
 * CAMBIO DE PROYECTO
 * ============================================================
 */

async function handleProjectChange() {
  handleCloseRoute()

  clearCustomPoints()

  addStopsItems.value =
    []

  selectedLegendProject.value =
    selectedProject.value ||
    null

  selectedLegendRegion.value =
    null

  criteria.value.region =
    ''

  syncOperationScope(
    selectedProject.value
  )

  await loadProjectCedis()

  criteria.value.region =
    regiones.value[0] ||
    ''

  filterPharmacyMarkers({
    proyecto:
      selectedProject.value,
  })
}

async function handleLegendProject(
  project
) {
  const normalized =
    String(
      project ||
      ''
    )
      .trim()
      .toUpperCase()

  if (
    !normalized
  ) {
    return
  }

  handleCloseRoute()

  clearCustomPoints()

  addStopsItems.value =
    []

  selectedLegendProject.value =
    normalized

  selectedLegendRegion.value =
    null

  criteria.value.region =
    ''

  syncOperationScope(
    normalized
  )

  await loadProjectCedis()

  criteria.value.region =
    regiones.value[0] ||
    ''

  filterPharmacyMarkers({
    proyecto:
      normalized,
  })
}

function handleLegendRegion(
  region
) {
  selectedLegendRegion.value =
    region

  criteria.value.region =
    region

  filterPharmacyMarkers({
    proyecto:
      selectedLegendProject.value ||
      selectedProject.value,

    region,
  })
}

function handleLegendBackProjects() {
  handleCloseRoute()

  clearCustomPoints()

  addStopsItems.value =
    []

  selectedLegendProject.value =
    null

  selectedLegendRegion.value =
    null

  criteria.value.region =
    ''

  clearPharmacyMarkerFilter()
}

function handleLegendClear() {
  handleCloseRoute()

  clearCustomPoints()

  addStopsItems.value =
    []

  selectedLegendProject.value =
    null

  selectedLegendRegion.value =
    null

  criteria.value.region =
    ''

  clearPharmacyMarkerFilter()
}

/*
 * ============================================================
 * CONTEXTO FARMACIAS
 * ============================================================
 */

async function loadWebContext() {
  structureLoading.value =
    true

  structureError.value =
    null

  try {
    const context =
      await getWebContext()

    webContext.value =
      context

    const firstState =
      context?.states?.[0]

    if (
      !firstState
    ) {
      selectedWebState.value =
        null

      webStructure.value =
        null

      visibleUnitsCount.value =
        0

      coordinatorAssignmentStatus.value =
        'ALL'

      await renderUnitsOnMap(
        []
      )

      return
    }

    await handleWebStateSelect(
      firstState
    )
  } catch (
    error
  ) {
    console.error(
      '[MapPage] Error cargando contexto web:',
      error
    )

    structureError.value =
      error?.message ||
      'No fue posible cargar tu ámbito.'

    await renderUnitsOnMap(
      []
    )
  } finally {
    structureLoading.value =
      false
  }
}

async function handleWebStateSelect(
  stateOrName
) {
  const stateName =
    typeof stateOrName ===
      'string'
      ? stateOrName
      : stateOrName?.name

  if (
    !stateName
  ) {
    return
  }

  structureLoading.value =
    true

  structureError.value =
    null

  selectedCoordinator.value =
    null

  selectedSupervisor.value =
    null

  coordinatorSupervisors.value =
    []

  coordinatorAssignmentStatus.value =
    'ALL'

  prepareStructureChange()

  selectedWebState.value =
    stateName

  selectedProject.value =
    String(
      stateName
    )
      .trim()
      .toUpperCase()

  criteria.value.estado =
    stateName

  criteria.value.proyecto =
    selectedProject.value

  criteria.value.region =
    ''

  try {
    await loadProjectCedis()

    const [
      structure,
      unitsResponse,
    ] =
      await Promise.all([
        getWebStructure({
          state:
            stateName,
        }),

        getWebUnits({
          state:
            stateName,
        }),
      ])

    webStructure.value =
      structure

    const stateUnits =
      Array.isArray(
        unitsResponse?.units
      )
        ? unitsResponse.units
        : []

    const mapUnits =
      currentWebRole() ===
        'GERENTE'
        ? stateUnits.filter(
            unit =>
              String(
                unit?.estatus ||
                ''
              )
                .trim()
                .toUpperCase() !==
              'INACTIVA'
          )
        : stateUnits

    visibleUnitsCount.value =
      mapUnits.length

    await renderUnitsOnMap(
      mapUnits
    )
  } catch (
    error
  ) {
    console.error(
      '[MapPage] Error cargando estado:',
      error
    )

    structureError.value =
      error?.message ||
      'No fue posible cargar el estado.'
  } finally {
    structureLoading.value =
      false
  }
}

async function handleWebCoordinatorSelect(
  coordinator
) {
  if (
    !coordinator?.id ||
    !selectedWebState.value
  ) {
    return
  }

  structureLoading.value =
    true

  structureError.value =
    null

  selectedCoordinator.value = {
    ...coordinator,
  }

  selectedSupervisor.value =
    null

  coordinatorSupervisors.value =
    []

  coordinatorAssignmentStatus.value =
    'ALL'

  prepareStructureChange()

  try {
    const [
      supervisorsResponse,
      unitsResponse,
    ] =
      await Promise.all([
        getWebCoordinatorSupervisors({
          state:
            selectedWebState.value,

          coordinatorId:
            coordinator.id,
        }),

        getCoordinatorUnits({
          coordinatorId:
            coordinator.id,

          assignmentStatus:
            'ALL',
        }),
      ])

    coordinatorSupervisors.value =
      supervisorsResponse
        ?.supervisors ||
      []

    selectedCoordinator.value = {
      ...coordinator,

      supervisorsCount:
        Number(
          supervisorsResponse
            ?.supervisorsCount ??
          coordinator
            .supervisorsCount ??
          coordinatorSupervisors
            .value.length
        ),

      unitsCount:
        Number(
          supervisorsResponse
            ?.unitsCount ??
          coordinator
            .unitsCount ??
          unitsResponse?.count ??
          0
        ),

      assignedUnitsCount:
        Number(
          supervisorsResponse
            ?.assignedUnitsCount ??
          coordinator
            .assignedUnitsCount ??
          0
        ),

      unassignedUnitsCount:
        Number(
          supervisorsResponse
            ?.unassignedUnitsCount ??
          coordinator
            .unassignedUnitsCount ??
          0
        ),
    }

    visibleUnitsCount.value =
      Number(
        unitsResponse?.count ||
        0
      )

    await renderUnitsOnMap(
      unitsResponse?.units ||
      []
    )
  } catch (
    error
  ) {
    console.error(
      '[MapPage] Error cargando coordinador:',
      error
    )

    structureError.value =
      error?.message ||
      'No fue posible cargar el coordinador.'
  } finally {
    structureLoading.value =
      false
  }
}

async function handleWebCoordinatorAssignmentStatus(
  status
) {
  if (
    !selectedWebState.value
  ) {
    return
  }

  const normalizedStatus =
    normalizeAssignmentStatus(
      status
    )

  const role =
    currentWebRole()

  if (
    role ===
      'GERENTE' &&
    !selectedCoordinator.value?.id
  ) {
    return
  }

  if (
    role !==
      'GERENTE' &&
    role !==
      'COORDINADOR'
  ) {
    return
  }

  structureLoading.value =
    true

  structureError.value =
    null

  selectedSupervisor.value =
    null

  coordinatorAssignmentStatus.value =
    normalizedStatus

  prepareStructureChange()

  try {
    const unitsResponse =
      await getCoordinatorUnits({
        coordinatorId:
          selectedCoordinator.value
            ?.id ??
          null,

        assignmentStatus:
          normalizedStatus,
      })

    visibleUnitsCount.value =
      Number(
        unitsResponse?.count ||
        0
      )

    await renderUnitsOnMap(
      unitsResponse?.units ||
      []
    )
  } catch (
    error
  ) {
    console.error(
      '[MapPage] Error filtrando territorio del coordinador:',
      error
    )

    structureError.value =
      error?.message ||
      'No fue posible aplicar el filtro territorial.'
  } finally {
    structureLoading.value =
      false
  }
}

async function handleWebSupervisorSelect(
  supervisor
) {
  if (
    !supervisor?.id ||
    !selectedWebState.value
  ) {
    return
  }

  structureLoading.value =
    true

  structureError.value =
    null

  selectedSupervisor.value =
    supervisor

  coordinatorAssignmentStatus.value =
    'ALL'

  prepareStructureChange()

  try {
    const unitsResponse =
      await getWebUnits({
        state:
          selectedWebState.value,

        supervisorId:
          supervisor.id,
      })

    visibleUnitsCount.value =
      Number(
        unitsResponse?.count ||
        0
      )

    await renderUnitsOnMap(
      unitsResponse?.units ||
      []
    )
  } catch (
    error
  ) {
    console.error(
      '[MapPage] Error cargando supervisor:',
      error
    )

    structureError.value =
      error?.message ||
      'No fue posible cargar el supervisor.'
  } finally {
    structureLoading.value =
      false
  }
}

async function handleWebStructureBack() {
  if (
    selectedSupervisor.value
  ) {
    selectedSupervisor.value =
      null

    if (
      selectedCoordinator.value
    ) {
      await handleWebCoordinatorSelect(
        selectedCoordinator.value
      )

      return
    }

    if (
      currentWebRole() ===
      'COORDINADOR'
    ) {
      await handleWebCoordinatorAssignmentStatus(
        'ALL'
      )

      return
    }

    await handleWebStateSelect(
      selectedWebState.value
    )

    return
  }

  if (
    (
      selectedCoordinator.value ||
      currentWebRole() ===
        'COORDINADOR'
    ) &&
    coordinatorAssignmentStatus.value !==
      'ALL'
  ) {
    await handleWebCoordinatorAssignmentStatus(
      'ALL'
    )

    return
  }

  if (
    selectedCoordinator.value
  ) {
    selectedCoordinator.value =
      null

    coordinatorSupervisors.value =
      []

    coordinatorAssignmentStatus.value =
      'ALL'

    await handleWebStateSelect(
      selectedWebState.value
    )
  }
}

/*
 * ============================================================
 * UNIDADES COORDINADOR
 * ============================================================
 */

async function getCoordinatorUnits({
  coordinatorId,
  assignmentStatus,
}) {
  const normalizedStatus =
    normalizeAssignmentStatus(
      assignmentStatus
    )

  const query = {
    state:
      selectedWebState.value,

    assignmentStatus:
      normalizedStatus,
  }

  if (
    currentWebRole() ===
      'GERENTE' &&
    coordinatorId
  ) {
    query.coordinatorId =
      coordinatorId
  }

  const response =
    await getWebUnits(
      query
    )

  const units =
    Array.isArray(
      response?.units
    )
      ? response.units
      : []

  const filteredUnits =
    filterUnitsByAssignmentStatus(
      units,
      normalizedStatus
    )

  return {
    ...response,

    count:
      filteredUnits.length,

    units:
      filteredUnits,
  }
}

function filterUnitsByAssignmentStatus(
  units,
  assignmentStatus
) {
  const status =
    normalizeAssignmentStatus(
      assignmentStatus
    )

  if (
    status ===
    'ALL'
  ) {
    return units
  }

  if (
    status ===
    'ASSIGNED'
  ) {
    return units.filter(
      unit =>
        Boolean(
          unit
            ?.assignedSupervisorId
        )
    )
  }

  return units.filter(
    unit =>
      !unit
        ?.assignedSupervisorId
  )
}

function normalizeAssignmentStatus(
  status
) {
  const normalized =
    String(
      status ||
      'ALL'
    )
      .trim()
      .toUpperCase()

  if (
    normalized ===
      'ASSIGNED' ||
    normalized ===
      'UNASSIGNED'
  ) {
    return normalized
  }

  return 'ALL'
}

function currentWebRole() {
  return String(
    profile.value?.rol ||
    profile.value?.role ||
    ''
  )
    .trim()
    .toUpperCase()
}

function prepareStructureChange() {
  handleCloseRoute()

  clearCustomPoints()

  addStopsItems.value =
    []
}

/*
 * ============================================================
 * RUTA PERSONALIZADA
 * ============================================================
 */

function openAddStopsModal() {
  showRouteCart.value =
    true

  addStopsItems.value =
    []

  addStopsOpen.value =
    true
}

function closeAddStopsModal() {
  addStopsOpen.value =
    false

  addStopsItems.value =
    []
}

function loadAddStopsRegion(
  region
) {
  addStopsItems.value =
    scopedFarmacias.value
      .filter(
        unit =>
          unit.region_sanitaria ===
          region
      )
      .sort(
        (
          a,
          b
        ) => {
          const aa =
            `${a.clues || ''} ${a.unidad || ''}`
              .trim()
              .toLowerCase()

          const bb =
            `${b.clues || ''} ${b.unidad || ''}`
              .trim()
              .toLowerCase()

          return aa.localeCompare(
            bb,
            'es'
          )
        }
      )
}

function handleAddStops(
  ids
) {
  showRouteCart.value =
    true

  addCustomStops(
    ids
  )

  closeAddStopsModal()
}

/*
 * ============================================================
 * POST ORDEN
 * ============================================================
 */

function togglePostItem(
  index
) {
  const item =
    postOrder.value[index]

  if (
    !item
  ) {
    return
  }

  if (
    !item.enabled &&
    item.hard
  ) {
    const confirmed =
      confirm(
        `"${item.unidad || item.name}" está marcada como DIFÍCIL ACCESO.\n¿Quieres incluirla en la ruta de todos modos?`
      )

    if (
      !confirmed
    ) {
      return
    }
  }

  item.enabled =
    !item.enabled
}

/*
 * ============================================================
 * FORMAT
 * ============================================================
 */

const formatKm =
  meters =>
    fmtKm(
      meters
    )

const formatDur =
  duration =>
    fmtDur(
      duration
    )

/*
 * ============================================================
 * EJECUTAR CALCULADOR
 * ============================================================
 */

async function handleRunCompute() {
  const activeProject =
    selectedLegendProject.value ||
    selectedProject.value

  if (
    isOperations.value &&
    !activeProject
  ) {
    alert(
      'Selecciona primero un proyecto en el filtro del mapa.'
    )

    return
  }

  syncOperationScope(
    activeProject
  )

  /*
   * ==========================================================
   * VALIDAR JURISDICCIÓN
   * ==========================================================
   */

  if (
    criteria.value.scope ===
      'single' &&
    !criteria.value.region
  ) {
    alert(
      'Selecciona una jurisdicción/región sanitaria.'
    )

    return
  }

  /*
   * ==========================================================
   * VALIDAR ORIGEN CEDIS
   * ==========================================================
   */

  if (
    originMode.value ===
    'cedis'
  ) {
    /*
     * El proyecto simplemente no tiene CEDIS configurado.
     */
    if (
      !proyectoCedis.value.length
    ) {
      alert(
        `El proyecto ${activeProject} no tiene un CEDIS registrado.\n\nSelecciona "Buscar otro origen" y elige una ubicación antes de calcular la ruta.`
      )

      return
    }

    /*
     * Sí existen CEDIS, pero el usuario no seleccionó uno.
     */
    if (
      !selectedCedisId.value
    ) {
      alert(
        'Debes seleccionar un CEDIS de origen antes de calcular la ruta.'
      )

      return
    }
  }

  /*
   * ==========================================================
   * VALIDAR ORIGEN POR COORDENADAS / BÚSQUEDA
   * ==========================================================
   */

  if (
    originMode.value ===
    'coords'
  ) {
    const lat =
      Number(
        criteria.value
          .originCoords
          ?.lat
      )

    const lng =
      Number(
        criteria.value
          .originCoords
          ?.lng
      )

    const validCoords =
      Number.isFinite(
        lat
      ) &&
      Number.isFinite(
        lng
      ) &&
      lat >=
        -90 &&
      lat <=
        90 &&
      lng >=
        -180 &&
      lng <=
        180

    if (
      !validCoords
    ) {
      alert(
        'Debes seleccionar un origen antes de calcular la ruta.\n\nBusca una dirección, establecimiento o ubicación y selecciónala como origen.'
      )

      return
    }
  }

  /*
   * ==========================================================
   * VALIDAR UNIDAD COMO ORIGEN
   * ==========================================================
   */

  if (
    originMode.value ===
      'pharmacy' &&
    !originPharmacyId.value
  ) {
    alert(
      'Debes seleccionar una unidad de origen antes de calcular la ruta.'
    )

    return
  }

  /*
   * ==========================================================
   * TODO CORRECTO
   * ==========================================================
   */

  criteria.value.selectedCedisId =
    selectedCedisId.value

  showRouteCart.value =
    false

  await runCompute()
}

/*
 * ============================================================
 * EJECUTAR RUTA PERSONALIZADA
 * ============================================================
 */

async function handleRunCustomRoute() {
  showRouteCart.value =
    true

  const activeProject =
    selectedLegendProject.value ||
    selectedProject.value

  if (
    !activeProject
  ) {
    alert(
      'Selecciona primero un proyecto.'
    )

    return
  }

  syncOperationScope(
    activeProject
  )

  await runCustomRoute()
}

function handleCloseRoute() {
  onCloseRoute()

  showRouteCart.value =
    true
}

/*
 * ============================================================
 * EXPORTAR
 * ============================================================
 */

async function exportToExcel() {
  if (
    !lastRawData.value
  ) {
    alert(
      'No hay ruta calculada'
    )

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
      farmacias,
    })
  } catch (
    error
  ) {
    console.error(
      error
    )

    alert(
      'Para exportar a Excel instala primero: npm i xlsx'
    )
  }
}

function exportCsvVisits() {
  const visits =
    (
      lastRawData.value
        ?.visitOrder ??
      []
    )
      .filter(
        point =>
          point &&
          point.name !==
            'ORIGEN' &&
          typeof point.lat ===
            'number' &&
          typeof point.lng ===
            'number'
      )
      .map(
        (
          point,
          index
        ) => ({
          orden:
            index + 1,

          id:
            point.id,

          nombre:
            point.name,

          lat:
            point.lat,

          lng:
            point.lng,
        })
      )

  if (
    !visits.length
  ) {
    alert(
      'No hay visitas'
    )

    return
  }

  exportCsv(
    visits,
    'visitas'
  )
}

/*
 * ============================================================
 * PDF
 * ============================================================
 */

const planPrintOpen =
  ref(false)

function openPlanPdf() {
  if (
    !canGeneratePdf.value
  ) {
    alert(
      'Primero calcula una ruta personalizada válida.'
    )

    return
  }

  planPrintOpen.value =
    true
}

function closePlanPdf() {
  planPrintOpen.value =
    false
}

/*
 * ============================================================
 * INIT
 * ============================================================
 */

const pageMounted =
  ref(false)

async function initializeOperationsMap() {
  await loadProjectFarmacias()

  if (
    selectedProject.value
  ) {
    syncOperationScope(
      selectedProject.value
    )

    await loadProjectCedis()
  }
}

onMounted(
  async () => {
    await nextTick()

    const element =
      await waitForEl(
        mapEl
      )

    if (
      !element
    ) {
      return
    }

    pageMounted.value =
      true

    if (
      isFarmacias.value
    ) {
      await loadWebContext()

      return
    }

    await initializeOperationsMap()
  }
)

/*
 * ADMIN puede cambiar de área sin desmontar
 * necesariamente el mismo componente.
 */
watch(
  () =>
    profile.value?.area,

  async (
    nextArea,
    previousArea
  ) => {
    if (
      !pageMounted.value ||
      nextArea ===
        previousArea
    ) {
      return
    }

    handleCloseRoute()

    clearCustomPoints()

    addStopsItems.value =
      []

    if (
      nextArea ===
      'FARMACIAS'
    ) {
      await loadWebContext()

      return
    }

    if (
      nextArea ===
      'OPERACIONES'
    ) {
      await initializeOperationsMap()
    }
  }
)
</script>

<style>
html,
body,
#app,
#map-wrapper {
  margin: 0;
  padding: 0;

  width: 100vw;
  height: 100vh;
}

.map {
  width: 100%;
  height: 100%;
}

/*
 * ============================================================
 * FARMACIAS MAP TOOLS
 * ============================================================
 */

.farmacias-map-tools {
  position: absolute;

  top: 18px;
  right: 18px;

  z-index: 9999;

  display: flex;

  align-items: center;

  gap: 4px;

  padding: 5px;

  border:
    1px solid
    rgba(
      203,
      213,
      225,
      .95
    );

  border-radius:
    13px;

  background:
    rgba(
      255,
      255,
      255,
      .96
    );

  box-shadow:
    0 8px 24px
      rgba(
        15,
        23,
        42,
        .14
      );

  backdrop-filter:
    blur(
      12px
    );
}

.map-tool-button {
  position: relative;

  display: grid;

  width: 38px;
  height: 38px;

  place-items: center;

  padding: 0;

  border:
    1px solid transparent;

  border-radius:
    9px;

  background:
    transparent;

  color:
    #64748b;

  cursor: pointer;

  transition:
    background .15s ease,
    border-color .15s ease,
    color .15s ease,
    transform .15s ease;
}

.map-tool-button:hover {
  border-color:
    #dbeafe;

  background:
    #f8fbfe;

  color:
    #0f64ad;
}

.map-tool-button:active {
  transform:
    scale(
      .96
    );
}

.map-tool-button.active {
  background:
    #eff8ff;

  color:
    #0f64ad;
}

.map-tool-button svg {
  width: 20px;
  height: 20px;

  fill: none;

  stroke:
    currentColor;

  stroke-width:
    1.8;

  stroke-linecap:
    round;

  stroke-linejoin:
    round;
}

.map-tool-tooltip {
  position: absolute;

  top:
    calc(
      100% + 8px
    );

  right: 0;

  z-index: 10000;

  width:
    max-content;

  max-width:
    180px;

  padding:
    6px 8px;

  border-radius:
    7px;

  background:
    #0f172a;

  color:
    #ffffff !important;

  font-size:
    10px;

  font-weight:
    700;

  line-height:
    1.2;

  opacity: 0;

  pointer-events:
    none;

  transform:
    translateY(
      -3px
    );

  transition:
    opacity .14s ease,
    transform .14s ease;
}

.map-tool-button:hover
.map-tool-tooltip {
  opacity: 1;

  transform:
    translateY(
      0
    );
}

/*
 * ============================================================
 * OPERACIONES
 * ============================================================
 */

.project-switch {
  position: absolute;

  top: 86px;
  left: 20px;

  z-index: 9999;

  display: flex;

  align-items: center;

  gap: 8px;

  padding:
    10px 12px;

  border:
    1px solid
    #d1d5db;

  border-radius:
    8px;

  background:
    #ffffff;

  box-shadow:
    0 2px 6px
      rgba(
        0,
        0,
        0,
        .15
      );

  font-weight:
    600;
}

.project-switch label {
  font-size:
    13px;
}

.project-switch select {
  padding:
    6px 8px;

  border:
    1px solid
    #d1d5db;

  border-radius:
    6px;

  background:
    #ffffff;

  color:
    #111827;

  font-weight:
    600;
}

/*
 * No usar:
 *
 * #map-wrapper * {
 *   color: #111827;
 * }
 *
 * porque pisaba texto blanco de botones internos.
 */

#map-wrapper {
  color:
    #111827;
}

#map-wrapper a {
  color:
    inherit;
}

.panel-separator {
  margin:
    12px 0;

  border: 0;

  border-top:
    1px solid
    #e5e7eb;
}

@media (
  max-width:
    640px
) {
  .farmacias-map-tools {
    top: 12px;
    right: 12px;

    gap: 3px;

    padding: 4px;
  }

  .map-tool-button {
    width: 36px;
    height: 36px;
  }

  .map-tool-button svg {
    width: 19px;
    height: 19px;
  }
}
</style>