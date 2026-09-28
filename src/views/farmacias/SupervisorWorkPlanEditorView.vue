<template>
  <main class="editor-page">
    <div class="content">
      <header class="heading">
        <div>
          <button type="button" class="text-button" @click="router.push({ name: 'farmacias-planes' })">← Mis planes</button>
          <span class="kicker">Planeación del supervisor</span>
          <h1>{{ plan?.planType === 'EXTRAORDINARY' ? 'Plan extraordinario' : 'Plan semanal' }}</h1>
          <p v-if="plan">{{ displayDate(plan.periodStart) }} — {{ displayDate(plan.periodEnd) }} · Revisión {{ plan.revisionNumber }}</p>
        </div>
        <span v-if="plan" class="badge" :class="plan.status.toLowerCase()">{{ statusLabel(plan.status) }}</span>
      </header>

      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <p v-if="success" class="notice success" role="status">{{ success }}</p>
      <p v-if="loading" class="card muted">Cargando plan…</p>

      <template v-else-if="plan">
        <section v-if="plan.status === 'REJECTED'" class="notice rejected">
          <strong>Plan rechazado</strong>
          <p>{{ plan.rejectionComment || 'Revisa el plan y corrige las observaciones antes de reenviarlo.' }}</p>
          <small>Al guardar cambios, el backend puede devolverlo a borrador.</small>
        </section>

        <section class="card toolbar">
          <div><h2>Preparación</h2><p>{{ activeItems.length }} visitas activas · {{ dayGroups.length }} días</p></div>
          <div class="toolbar-actions">
            <button type="button" class="secondary" :disabled="busy" @click="periodOpen = !periodOpen">Modificar periodo</button>
            <button type="button" class="secondary" :disabled="busy" @click="openVisit()">Agregar visita</button>
            <button type="button" class="primary" :disabled="busy || !activeItems.length" @click="submitPlan">Enviar para aprobación</button>
          </div>
        </section>

        <section v-if="periodOpen" class="card">
          <h2>Periodo del plan</h2>
          <div class="form-grid">
            <div class="field"><label for="period-type">Tipo</label><select id="period-type" v-model="periodType"><option value="ORDINARY">Plan semanal</option><option value="EXTRAORDINARY">Plan extraordinario</option></select></div>
            <div v-if="periodType === 'ORDINARY'" class="field"><label for="period-week">Semana</label><input id="period-week" v-model="periodWeek" type="date" /></div>
            <template v-else>
              <div class="field"><label for="period-start">Inicio</label><input id="period-start" v-model="periodStart" type="date" /></div>
              <div class="field"><label for="period-end">Fin</label><input id="period-end" v-model="periodEnd" type="date" :min="periodStart" /></div>
            </template>
          </div>
          <div class="form-actions"><button type="button" class="secondary" @click="periodOpen = false">Cancelar</button><button type="button" class="primary" :disabled="busy" @click="savePeriod">Guardar periodo</button></div>
        </section>

        <section class="agenda">
          <article v-for="day in dayGroups" :key="day.date" class="card day-card">
            <header class="day-heading"><div><h2>{{ displayDay(day.date) }}</h2><span>{{ day.items.length }} {{ day.items.length === 1 ? 'visita' : 'visitas' }}</span></div><button type="button" class="text-button" :disabled="busy" @click="openVisit(null, day.date)">+ Agregar visita</button></header>
            <p v-if="!day.items.length" class="muted">Sin visitas programadas.</p>
            <div v-else class="visit-list">
              <div v-for="(item, index) in day.items" :key="item.id" class="visit-row">
                <div class="order-controls"><strong>{{ item.order }}</strong><button type="button" aria-label="Subir visita" :disabled="busy || !canReorderDay(day) || index === 0" @click="moveItem(day, index, -1)">↑</button><button type="button" aria-label="Bajar visita" :disabled="busy || !canReorderDay(day) || index === day.items.length - 1" @click="moveItem(day, index, 1)">↓</button></div>
                <div class="visit-copy"><h3>{{ item.name || 'Visita' }}</h3><p>{{ item.scheduledTime || 'Sin hora' }} · CLUES {{ item.clues || '—' }}<span v-if="item.region"> · {{ item.region }}</span><span v-if="item.project"> · {{ item.project }}</span></p><p>{{ item.required ? 'Obligatoria' : 'Opcional' }} · {{ itemStatusLabel(item.status) }}</p><ol v-if="item.activities?.length" class="activity-list"><li v-for="activity in item.activities" :key="activity.id || activity.order">{{ activity.activityType }}<span v-if="activity.note"> — {{ activity.note }}</span></li></ol></div>
                <div v-if="canEditItem(item)" class="visit-actions"><button type="button" class="secondary" :disabled="busy" @click="openVisit(item)">Editar</button><button type="button" class="danger" :disabled="busy" @click="removeVisit(item)">Retirar</button></div>
              </div>
            </div>
          </article>
        </section>

        <div class="footer-actions"><button type="button" class="danger" :disabled="busy" @click="archivePlan">Archivar borrador</button></div>
      </template>

      <div v-if="visitOpen && plan" class="modal-backdrop" @click.self="closeVisit">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="visit-title">
          <header class="modal-heading"><div><span class="kicker">{{ editingItem ? 'Editar' : 'Agregar' }}</span><h2 id="visit-title">Visita del plan</h2></div><button type="button" class="text-button" :disabled="busy" @click="closeVisit">Cerrar</button></header>
          <p v-if="formError" class="notice error" role="alert">{{ formError }}</p>
          <div class="field"><label>Farmacia</label><strong>{{ chosenPharmacy?.name || editingItem?.name || 'Selecciona una farmacia' }}</strong><small v-if="visitForm.pharmacyId">CLUES {{ chosenPharmacy?.clues || editingItem?.clues || '—' }}</small></div>
          <div class="catalog">
            <div class="catalog-filters"><input v-model="catalogSearch" type="search" placeholder="Buscar nombre o CLUES" aria-label="Buscar farmacia" @keyup.enter="searchCatalog" /><select v-model="catalogRegion" aria-label="Región" @change="searchCatalog"><option value="">Todas las regiones</option><option v-for="region in catalogFilters.regions" :key="region" :value="region">{{ region }}</option></select><select v-model="catalogProject" aria-label="Proyecto" @change="searchCatalog"><option value="">Todos los proyectos</option><option v-for="project in catalogFilters.projects" :key="project" :value="project">{{ project }}</option></select><select v-model="catalogState" aria-label="Estado" @change="searchCatalog"><option value="">Todos los estados</option><option v-for="state in catalogFilters.states" :key="state" :value="state">{{ state }}</option></select><select v-model="catalogStatus" aria-label="Estatus" @change="searchCatalog"><option value="">Todos los estatus</option><option v-for="status in catalogFilters.statuses" :key="status" :value="status">{{ status }}</option></select><button type="button" class="secondary" :disabled="catalogLoading" @click="searchCatalog">Buscar</button></div>
            <p v-if="catalogLoading" class="muted">Buscando farmacias…</p>
            <p v-else-if="!catalog.length && !catalogError" class="muted">No hay farmacias para estos filtros.</p>
            <div v-else-if="catalog.length" class="catalog-list"><button v-for="pharmacy in catalog" :key="pharmacy.id" type="button" class="catalog-option" :class="{ selected: visitForm.pharmacyId === pharmacy.id }" :disabled="pharmacy.accessType === 'NONE'" @click="choosePharmacy(pharmacy)"><strong>{{ pharmacy.name }}</strong><small>CLUES {{ pharmacy.clues }} · {{ pharmacy.region || 'Sin región' }}<span v-if="pharmacy.project"> · {{ pharmacy.project }}</span></small><small>{{ accessLabel(pharmacy) }}<span v-if="pharmacy.temporaryCoverage"> · {{ pharmacy.temporaryCoverage.startDate }} a {{ pharmacy.temporaryCoverage.endDate }}</span></small></button></div>
            <p v-if="catalogError" class="notice error" role="alert">{{ catalogError }}</p>
            <button v-if="catalogHasMore" type="button" class="secondary more" :disabled="catalogLoading" @click="loadCatalog(true)">Cargar más</button>
          </div>
          <div class="form-grid"><div class="field"><label for="visit-date">Fecha</label><input id="visit-date" v-model="visitForm.scheduledDate" type="date" :min="plan.periodStart" :max="plan.periodEnd" /></div><div class="field"><label for="visit-time">Hora (opcional)</label><input id="visit-time" v-model="visitForm.scheduledTime" type="time" /></div></div>
          <p v-if="visitAccessError" class="notice error" role="alert">{{ visitAccessError }}</p>
          <label class="checkbox"><input v-model="visitForm.required" type="checkbox" /> Visita obligatoria</label>
          <section class="activities"><div class="section-heading"><h3>Actividades planeadas</h3><button type="button" class="secondary" :disabled="visitForm.activities.length >= 50" @click="addActivity">+ Actividad</button></div><p class="muted">Al menos una actividad. Máximo 50.</p><div v-for="(activity, index) in visitForm.activities" :key="activity.key" class="activity-edit"><div class="activity-header"><strong>Actividad {{ index + 1 }}</strong><div><button type="button" :disabled="index === 0" @click="moveActivity(index, -1)">↑</button><button type="button" :disabled="index === visitForm.activities.length - 1" @click="moveActivity(index, 1)">↓</button><button type="button" @click="visitForm.activities.splice(index, 1)">Eliminar</button></div></div><input v-model="activity.activityType" maxlength="160" placeholder="Descripción de la actividad" aria-label="Descripción de la actividad" /><textarea v-model="activity.note" maxlength="1000" rows="2" placeholder="Nota opcional" aria-label="Nota de la actividad"></textarea></div></section>
          <div class="form-actions"><button type="button" class="secondary" :disabled="busy" @click="closeVisit">Cancelar</button><button type="button" class="primary" :disabled="busy || Boolean(visitAccessError)" @click="saveVisit">{{ busy ? 'Guardando…' : 'Guardar visita' }}</button></div>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import {
  addSupervisorWorkPlanItem, archiveSupervisorWorkPlan, getSupervisorWorkPlan,
  getSupervisorWorkPlanPharmacies, getSupervisorWorkPlanPharmacyFilters,
  removeSupervisorWorkPlanItem, reorderSupervisorWorkPlanItems,
  submitSupervisorWorkPlan, updateSupervisorWorkPlan,
  updateSupervisorWorkPlanItem,
} from '../../services/api.js'

const route = useRoute()
const router = useRouter()
const { profile } = useAuth()
const allowed = computed(() => profile.value?.area === 'FARMACIAS' && profile.value?.rol === 'SUPERVISOR')
const planId = computed(() => String(route.params.planId || ''))
const plan = ref(null)
const items = ref([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const success = ref('')
const periodOpen = ref(false)
const periodType = ref('ORDINARY')
const periodWeek = ref('')
const periodStart = ref('')
const periodEnd = ref('')
const visitOpen = ref(false)
const editingItem = ref(null)
const chosenPharmacy = ref(null)
const visitForm = ref({ pharmacyId: '', scheduledDate: '', scheduledTime: '', required: true, activities: [] })
const formError = ref('')
const catalog = ref([])
const catalogFilters = ref({ regions: [], projects: [], states: [], statuses: [] })
const catalogSearch = ref('')
const catalogRegion = ref('')
const catalogProject = ref('')
const catalogState = ref('')
const catalogStatus = ref('')
const catalogOffset = ref(0)
const catalogHasMore = ref(false)
const catalogLoading = ref(false)
const catalogError = ref('')
let catalogRequestSequence = 0
let catalogSession = 0
let catalogQuery = ''
let nextActivityKey = 0
const activeItems = computed(() => items.value.filter(item => !item.removedAt))
const selectedPharmacy = computed(() =>
  chosenPharmacy.value?.id === visitForm.value.pharmacyId
    ? chosenPharmacy.value
    : editingItem.value?.pharmacyId === visitForm.value.pharmacyId ? editingItem.value : null
)
const visitAccessError = computed(() => {
  const pharmacy = selectedPharmacy.value
  if (pharmacy?.accessType === 'NONE') return 'No tienes acceso a esta farmacia para la fecha de la visita.'
  if (pharmacy?.accessType !== 'TEMPORARY_COVERAGE') return ''
  const coverage = pharmacy.temporaryCoverage
  if (!parseDate(coverage?.startDate) || !parseDate(coverage?.endDate)) return 'No se pudo verificar la vigencia de la cobertura temporal.'
  if (visitForm.value.scheduledDate < coverage.startDate || visitForm.value.scheduledDate > coverage.endDate) {
    return `La cobertura temporal sólo permite visitas del ${coverage.startDate} al ${coverage.endDate}.`
  }
  return ''
})
const dayGroups = computed(() => {
  if (!plan.value) return []
  const groups = []
  const start = parseDate(plan.value.periodStart)
  const end = parseDate(plan.value.periodEnd)
  if (!start || !end) return groups
  for (let day = start; day <= end; day = nextDay(day)) {
    const date = localISO(day)
    groups.push({ date, items: activeItems.value.filter(item => item.scheduledDate === date).sort((a, b) => a.order - b.order) })
  }
  return groups
})

onMounted(() => { if (allowed.value) void loadDetail() })
watch(planId, () => { if (allowed.value) void loadDetail() })

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    const response = await getSupervisorWorkPlan(planId.value)
    plan.value = response.plan
    items.value = Array.isArray(response.items) ? response.items : []
    if (!['DRAFT', 'REJECTED'].includes(plan.value.status)) {
      await router.replace({ name: 'farmacias-plan-detail', params: { planId: planId.value } })
      return
    }
    periodType.value = plan.value.planType
    periodWeek.value = plan.value.periodStart
    periodStart.value = plan.value.periodStart
    periodEnd.value = plan.value.periodEnd
  } catch (err) {
    error.value = err?.message || 'No fue posible cargar el plan.'
  } finally {
    loading.value = false
  }
}

async function runMutation(action, message, reload = true) {
  if (busy.value || !allowed.value || !['DRAFT', 'REJECTED'].includes(plan.value?.status)) return false
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    await action()
    if (reload) await loadDetail()
    success.value = message
    return true
  } catch (err) {
    error.value = err?.message || 'No fue posible guardar el cambio.'
    return false
  } finally {
    busy.value = false
  }
}

async function savePeriod() {
  let start = periodStart.value
  let end = periodEnd.value
  if (periodType.value === 'ORDINARY') {
    const date = parseDate(periodWeek.value)
    if (!date) { error.value = 'Selecciona una semana válida.'; return }
    date.setDate(date.getDate() - (date.getDay() + 6) % 7)
    start = localISO(date)
    date.setDate(date.getDate() + 6)
    end = localISO(date)
  }
  if (!parseDate(start) || !parseDate(end) || end < start) { error.value = 'Selecciona un periodo válido.'; return }
  if (activeItems.value.some(item => item.scheduledDate < start || item.scheduledDate > end)) {
    error.value = 'Hay visitas fuera del nuevo periodo. Ajusta sus fechas antes de reducirlo.'
    return
  }
  if (await runMutation(() => updateSupervisorWorkPlan(planId.value, { periodStart: start, periodEnd: end, planType: periodType.value }), 'Periodo actualizado.')) periodOpen.value = false
}

function openVisit(item = null, date = null) {
  if (!allowed.value || !['DRAFT', 'REJECTED'].includes(plan.value?.status)) return
  editingItem.value = item
  chosenPharmacy.value = null
  visitForm.value = {
    pharmacyId: item?.pharmacyId || '', scheduledDate: item?.scheduledDate || date || plan.value.periodStart,
    scheduledTime: item?.scheduledTime?.slice(0, 5) || '', required: item?.required ?? true,
    activities: item?.activities?.map(activity => ({ key: ++nextActivityKey, activityType: activity.activityType, note: activity.note || '' })) || [],
  }
  if (!visitForm.value.activities.length) addActivity()
  formError.value = ''
  catalogSearch.value = ''
  catalogRegion.value = ''
  catalogProject.value = ''
  catalogState.value = ''
  catalogStatus.value = ''
  ++catalogSession
  ++catalogRequestSequence
  catalog.value = []
  catalogOffset.value = 0
  catalogHasMore.value = false
  catalogLoading.value = false
  catalogError.value = ''
  catalogQuery = ''
  visitOpen.value = true
  void loadFiltersAndCatalog()
}
function closeVisit() { if (!busy.value) { visitOpen.value = false; ++catalogSession; ++catalogRequestSequence; catalogLoading.value = false } }
function addActivity() { if (visitForm.value.activities.length < 50) visitForm.value.activities.push({ key: ++nextActivityKey, activityType: '', note: '' }) }
function moveActivity(index, delta) {
  const list = visitForm.value.activities
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target], list[index]]
}
function choosePharmacy(pharmacy) { if (pharmacy.accessType === 'NONE') return; chosenPharmacy.value = pharmacy; visitForm.value.pharmacyId = pharmacy.id }

async function loadFiltersAndCatalog() {
  const session = catalogSession
  try {
    const filters = await getSupervisorWorkPlanPharmacyFilters()
    if (session !== catalogSession) return
    catalogFilters.value = { regions: filters.regions || [], projects: filters.projects || [], states: filters.states || [], statuses: filters.statuses || [] }
  } catch (err) { if (session === catalogSession) formError.value = err?.message || 'No fue posible cargar los filtros.' }
  if (session === catalogSession && visitOpen.value) await searchCatalog()
}
function currentCatalogParams() {
  return {
    search: catalogSearch.value.trim() || undefined, region: catalogRegion.value || undefined,
    project: catalogProject.value || undefined, state: catalogState.value || undefined,
    status: catalogStatus.value || undefined,
  }
}
async function searchCatalog() {
  const params = currentCatalogParams()
  catalogQuery = JSON.stringify(params)
  const requestId = ++catalogRequestSequence
  catalog.value = []
  catalogOffset.value = 0
  catalogHasMore.value = false
  catalogError.value = ''
  await loadCatalog(false, requestId, params)
}
async function loadCatalog(more, requestId = catalogRequestSequence, params = currentCatalogParams()) {
  if (more && (catalogLoading.value || !catalogHasMore.value)) return
  if (more && JSON.stringify(params) !== catalogQuery) { await searchCatalog(); return }
  catalogLoading.value = true
  catalogError.value = ''
  const offset = more ? catalogOffset.value : 0
  try {
    const response = await getSupervisorWorkPlanPharmacies({
      ...params, limit: 20, offset,
    })
    if (requestId !== catalogRequestSequence) return
    const page = Array.isArray(response.pharmacies) ? response.pharmacies : []
    const seen = new Set(more ? catalog.value.map(pharmacy => pharmacy.id) : [])
    catalog.value = more ? [...catalog.value, ...page.filter(pharmacy => !seen.has(pharmacy.id))] : page
    catalogOffset.value = offset + page.length
    catalogHasMore.value = Boolean(response.pagination?.hasMore)
  } catch (err) { if (requestId === catalogRequestSequence) catalogError.value = err?.message || 'No fue posible cargar el catálogo.' }
  finally { if (requestId === catalogRequestSequence) catalogLoading.value = false }
}

async function saveVisit() {
  const value = visitForm.value
  if (!value.pharmacyId) { formError.value = 'Selecciona una farmacia.'; return }
  if (visitAccessError.value) { formError.value = visitAccessError.value; return }
  if (!parseDate(value.scheduledDate) || value.scheduledDate < plan.value.periodStart || value.scheduledDate > plan.value.periodEnd) { formError.value = 'La fecha debe estar dentro del periodo del plan.'; return }
  if (!value.activities.length || value.activities.length > 50) { formError.value = 'Agrega entre 1 y 50 actividades.'; return }
  const activities = value.activities.map(activity => ({ activityType: activity.activityType.trim(), note: activity.note.trim() || null }))
  if (activities.some(activity => !activity.activityType || activity.activityType.length > 160 || (activity.note?.length || 0) > 1000)) { formError.value = 'Revisa las actividades: descripción de 1 a 160 caracteres y nota de hasta 1000.'; return }
  formError.value = ''
  const payload = { pharmacyId: value.pharmacyId, scheduledDate: value.scheduledDate, scheduledTime: value.scheduledTime || null, required: value.required, activities }
  const succeeded = await runMutation(() => editingItem.value
    ? updateSupervisorWorkPlanItem(planId.value, editingItem.value.id, payload)
    : addSupervisorWorkPlanItem(planId.value, payload), 'Visita guardada.')
  if (succeeded) visitOpen.value = false
  else formError.value = error.value
}

async function removeVisit(item) {
  if (!canEditItem(item) || !window.confirm(`¿Retirar la visita a ${item.name}?`)) return
  await runMutation(() => removeSupervisorWorkPlanItem(planId.value, item.id), 'Visita retirada.')
}
async function moveItem(day, index, delta) {
  if (!canReorderDay(day)) return
  const itemIds = day.items.map(item => item.id)
  const target = index + delta
  if (target < 0 || target >= itemIds.length) return
  ;[itemIds[index], itemIds[target]] = [itemIds[target], itemIds[index]]
  await runMutation(() => reorderSupervisorWorkPlanItems(planId.value, { scheduledDate: day.date, itemIds }), 'Orden actualizado.')
}
async function submitPlan() {
  const itemWithoutActivities = activeItems.value.find(item =>
    item.itemType === 'PHARMACY' && item.source === 'PLAN' &&
    (!Array.isArray(item.activities) || item.activities.length === 0)
  )
  if (itemWithoutActivities) {
    error.value = `La visita "${itemWithoutActivities.name || 'Sin nombre'}" necesita al menos una actividad antes de enviar el plan.`
    return
  }
  if (!window.confirm('¿Enviar este plan para aprobación?')) return
  if (await runMutation(() => submitSupervisorWorkPlan(planId.value), 'Plan enviado para aprobación.', false)) {
    await router.replace({ name: 'farmacias-plan-detail', params: { planId: planId.value } })
  }
}
async function archivePlan() {
  if (!window.confirm('¿Archivar este borrador?')) return
  if (await runMutation(() => archiveSupervisorWorkPlan(planId.value), 'Plan archivado.', false)) {
    await router.replace({ name: 'farmacias-planes' })
  }
}
function canEditItem(item) { return item.itemType === 'PHARMACY' && item.source === 'PLAN' && item.status === 'PENDING' && !item.removedAt }
function canReorderDay(day) { return day.items.length > 1 && day.items.every(canEditItem) }
function accessLabel(pharmacy) { return ({ PERMANENT_ASSIGNMENT: 'Asignación permanente', TEMPORARY_COVERAGE: 'Cobertura temporal', ALL: 'Acceso general', NONE: 'Sin acceso' })[pharmacy.accessType] || 'Acceso sujeto a validación' }
function statusLabel(status) { return ({ DRAFT: 'Borrador', REJECTED: 'Rechazado', PENDING_APPROVAL: 'Pendiente de aprobación', APPROVED: 'Aprobado', ARCHIVED: 'Archivado' })[status] || status }
function itemStatusLabel(status) { return ({ PENDING: 'Pendiente', IN_PROGRESS: 'En curso', DONE: 'Realizada', SKIPPED: 'Omitida', CANCELLED: 'Cancelada', RESCHEDULED: 'Reprogramada' })[status] || status }
function parseDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null; const [y, m, d] = value.split('-').map(Number); const result = new Date(y, m - 1, d); return localISO(result) === value ? result : null }
function localISO(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function nextDay(date) { const result = new Date(date); result.setDate(result.getDate() + 1); return result }
function displayDate(value) { const date = parseDate(value); return date ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : value }
function displayDay(value) { const date = parseDate(value); return date ? new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(date) : value }
</script>

<style scoped>
.editor-page { min-height: 100%; padding: 28px 28px 48px; background: var(--color-background); color: var(--color-text); }
.content { width: min(var(--content-max-width), 100%); margin: auto; display: grid; gap: 18px; }
.heading, .toolbar, .toolbar-actions, .day-heading, .visit-row, .visit-actions, .section-heading, .form-actions, .modal-heading, .activity-header, .footer-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.heading h1 { margin: 5px 0; font-size: var(--font-size-page-title); }
.heading p, .toolbar p, .muted, .visit-copy p, .day-heading span { color: var(--color-text-secondary); }
.kicker { display: block; color: var(--color-primary-dark); font-size: 12px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.card { padding: 22px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.card h2 { margin: 0 0 8px; font-size: 19px; }
.toolbar-actions, .visit-actions { flex-wrap: wrap; justify-content: flex-end; }
.primary, .secondary, .danger, .text-button { min-height: 38px; padding: 8px 13px; border-radius: var(--radius-md); font: inherit; font-weight: 650; cursor: pointer; }
.primary { border: 1px solid var(--color-primary); background: var(--color-primary); color: white; }
.secondary { border: 1px solid var(--color-border); background: white; color: var(--color-primary-dark); }
.danger { border: 1px solid #fecaca; background: #fff; color: #b91c1c; }
.text-button { border: 0; background: transparent; color: var(--color-primary-dark); }
.badge { padding: 7px 11px; border-radius: 999px; background: var(--color-primary-soft); color: var(--color-primary-dark); font-weight: 700; font-size: 12px; }
.badge.rejected, .notice.rejected { background: #fff1f2; color: #9f1239; }
.notice { padding: 13px 16px; border-radius: var(--radius-md); }
.notice p { margin: 5px 0; }
.notice.error { background: #fef2f2; color: #991b1b; }
.notice.success { background: #ecfdf5; color: #047857; }
.agenda { display: grid; gap: 14px; }
.day-heading { padding-bottom: 10px; border-bottom: 1px solid var(--color-border); }
.day-heading h2 { text-transform: capitalize; }
.visit-list { display: grid; }
.visit-row { align-items: flex-start; padding: 15px 0; border-bottom: 1px solid var(--color-border); }
.visit-row:last-child { border-bottom: 0; }
.order-controls { display: grid; gap: 3px; justify-items: center; }
.order-controls button, .activity-header button { border: 1px solid var(--color-border); border-radius: 6px; background: white; cursor: pointer; }
.visit-copy { flex: 1; min-width: 0; }
.visit-copy h3 { margin: 0 0 4px; font-size: 16px; }
.visit-copy p { margin: 3px 0; font-size: 13px; }
.activity-list { margin: 8px 0 0; padding-left: 22px; font-size: 13px; }
.footer-actions { justify-content: flex-end; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.field { display: grid; gap: 6px; min-width: 0; margin-bottom: 12px; }
.field label { font-size: 13px; font-weight: 700; }
.field input, .field select, .catalog-filters input, .catalog-filters select, .activity-edit input, .activity-edit textarea { width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: white; color: var(--color-text); font: inherit; }
.form-actions { justify-content: flex-end; margin-top: 16px; }
.modal-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 16px; background: #0f172a99; }
.modal { width: min(760px, 100%); max-height: min(94vh, 1000px); overflow-y: auto; padding: 24px; border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-lg); }
.modal-heading { margin-bottom: 16px; }
.modal-heading h2 { margin: 2px 0; }
.catalog { margin: 12px 0 18px; padding: 14px; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.catalog-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.catalog-list { max-height: 220px; overflow-y: auto; margin-top: 10px; display: grid; gap: 6px; }
.catalog-option { display: grid; gap: 3px; width: 100%; padding: 9px 11px; text-align: left; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: white; cursor: pointer; }
.catalog-option.selected { border-color: var(--color-primary); background: var(--color-primary-soft); }
.catalog-option small { color: var(--color-text-secondary); }
.more { margin-top: 8px; }
.checkbox { display: flex; align-items: center; gap: 8px; margin: 10px 0 18px; }
.activities { border-top: 1px solid var(--color-border); padding-top: 12px; }
.activities h3 { margin: 0; font-size: 17px; }
.activity-edit { display: grid; gap: 7px; margin-top: 12px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.activity-header button { margin-left: 5px; padding: 5px 8px; }
button:disabled { cursor: not-allowed; opacity: .5; }
@media (max-width: 800px) { .editor-page { padding: 16px; } .heading, .toolbar, .visit-row { align-items: stretch; flex-direction: column; } .toolbar-actions, .visit-actions { justify-content: flex-start; } .catalog-filters { grid-template-columns: 1fr 1fr; } .modal { padding: 16px; } }
@media (max-width: 520px) { .form-grid, .catalog-filters { grid-template-columns: 1fr; } .card { padding: 16px; } .day-heading { align-items: flex-start; } }
</style>
