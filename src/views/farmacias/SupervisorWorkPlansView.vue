<template>
  <main class="supervisor-plans">
    <div class="content">
      <header class="heading">
        <div>
          <span class="kicker">Mi operación</span>
          <h1>Planes de trabajo</h1>
          <p>Prepara tus visitas y envía el plan para aprobación.</p>
        </div>
        <button class="primary" type="button" @click="showCreate = !showCreate">
          {{ showCreate ? 'Cerrar formulario' : 'Crear plan' }}
        </button>
      </header>

      <p v-if="error" class="notice error" role="alert">{{ error }}</p>

      <section v-if="showCreate" class="card create-card">
        <h2>Nuevo plan</h2>
        <div class="type-selector" role="group" aria-label="Tipo de plan">
          <button type="button" :class="{ active: planType === 'ORDINARY' }" @click="planType = 'ORDINARY'">Plan semanal</button>
          <button type="button" :class="{ active: planType === 'EXTRAORDINARY' }" @click="planType = 'EXTRAORDINARY'">Plan extraordinario</button>
        </div>
        <form @submit.prevent="createPlan">
          <div v-if="planType === 'ORDINARY'" class="field">
            <label for="week-date">Semana del plan</label>
            <input id="week-date" v-model="weekDate" type="date" required />
            <small>Del {{ displayDate(weekStart) }} al {{ displayDate(weekEnd) }}. Se guarda la semana completa, de lunes a domingo.</small>
            <small v-if="ordinaryExists" class="inline-error">Ya conoces un plan ordinario activo para esta semana.</small>
          </div>
          <div v-else class="date-grid">
            <div class="field"><label for="extra-start">Inicio</label><input id="extra-start" v-model="extraStart" type="date" required /></div>
            <div class="field"><label for="extra-end">Fin</label><input id="extra-end" v-model="extraEnd" type="date" :min="extraStart" required /></div>
          </div>
          <div class="actions"><button class="primary" type="submit" :disabled="saving || loading || (planType === 'ORDINARY' && ordinaryExists)">{{ saving ? 'Creando…' : 'Crear y abrir editor' }}</button></div>
        </form>
      </section>

      <section class="card">
        <div class="section-heading"><h2>Mis planes</h2><button type="button" class="secondary" :disabled="loading" @click="loadPlans">Actualizar</button></div>
        <p v-if="loading" class="muted">Cargando planes…</p>
        <p v-else-if="!plans.length" class="muted">Aún no tienes planes activos.</p>
        <div v-else class="plan-list">
          <article v-for="plan in plans" :key="plan.id" class="plan-row">
            <div>
              <span class="kicker">{{ plan.planType === 'EXTRAORDINARY' ? 'Extraordinario' : 'Semanal' }}</span>
              <h3>{{ displayDate(plan.periodStart) }} — {{ displayDate(plan.periodEnd) }}</h3>
              <p>{{ plan.totalItems }} visitas · Revisión {{ plan.revisionNumber }}</p>
              <p v-if="plan.status === 'REJECTED' && plan.rejectionComment" class="rejection">{{ plan.rejectionComment }}</p>
            </div>
            <div class="row-actions">
              <span class="badge" :class="plan.status.toLowerCase()">{{ statusLabel(plan.status) }}</span>
              <button v-if="editable(plan)" type="button" class="secondary" @click="openPlan(plan, true)">Editar</button>
              <button type="button" class="secondary" @click="openPlan(plan, false)">Ver detalle</button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { createSupervisorWorkPlan, getSupervisorWorkPlans } from '../../services/api.js'

const router = useRouter()
const { profile } = useAuth()
const allowed = computed(() => profile.value?.area === 'FARMACIAS' && profile.value?.rol === 'SUPERVISOR')
const plans = ref([])
const loading = ref(false)
const saving = ref(false)
const showCreate = ref(false)
const error = ref('')
const planType = ref('ORDINARY')
const weekDate = ref(localISO(new Date()))
const extraStart = ref(localISO(new Date()))
const extraEnd = ref(localISO(new Date()))
const weekStart = computed(() => {
  const date = parseDate(weekDate.value)
  if (!date) return ''
  date.setDate(date.getDate() - (date.getDay() + 6) % 7)
  return localISO(date)
})
const weekEnd = computed(() => {
  const date = parseDate(weekStart.value)
  if (!date) return ''
  date.setDate(date.getDate() + 6)
  return localISO(date)
})
const ordinaryExists = computed(() => plans.value.some(plan =>
  plan.planType === 'ORDINARY' && plan.status !== 'ARCHIVED' &&
  plan.periodStart === weekStart.value
))

onMounted(() => { if (allowed.value) void loadPlans() })

async function loadPlans() {
  if (!allowed.value) return
  loading.value = true
  error.value = ''
  try {
    const response = await getSupervisorWorkPlans()
    plans.value = Array.isArray(response?.plans) ? response.plans : []
  } catch (err) {
    error.value = err?.message || 'No fue posible cargar tus planes.'
  } finally {
    loading.value = false
  }
}

async function createPlan() {
  if (!allowed.value || saving.value) return
  error.value = ''
  const periodStart = planType.value === 'ORDINARY' ? weekStart.value : extraStart.value
  const periodEnd = planType.value === 'ORDINARY' ? weekEnd.value : extraEnd.value
  if (!periodStart || !periodEnd || periodEnd < periodStart) {
    error.value = 'Selecciona un periodo válido.'
    return
  }
  if (planType.value === 'ORDINARY' && ordinaryExists.value) {
    error.value = 'Ya existe un plan ordinario activo para esta semana.'
    return
  }
  saving.value = true
  try {
    const response = await createSupervisorWorkPlan({ periodStart, periodEnd, planType: planType.value })
    await router.push({ name: 'farmacias-supervisor-plan-editor', params: { planId: response.plan.id } })
  } catch (err) {
    error.value = err?.message || 'No fue posible crear el plan.'
  } finally {
    saving.value = false
  }
}

function openPlan(plan, edit) {
  router.push({
    name: edit ? 'farmacias-supervisor-plan-editor' : 'farmacias-plan-detail',
    params: { planId: plan.id },
  })
}
function editable(plan) { return ['DRAFT', 'REJECTED'].includes(plan.status) }
function statusLabel(status) {
  return ({ DRAFT: 'Borrador', REJECTED: 'Rechazado', PENDING_APPROVAL: 'Pendiente de aprobación', APPROVED: 'Aprobado', ARCHIVED: 'Archivado' })[status] || status
}
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return localISO(date) === value ? date : null
}
function localISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function displayDate(value) {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : value
}
</script>

<style scoped>
.supervisor-plans { min-height: 100%; padding: 28px 28px 48px; background: var(--color-background); color: var(--color-text); }
.content { width: min(var(--content-max-width), 100%); margin: auto; display: grid; gap: 20px; }
.heading, .section-heading, .plan-row, .row-actions, .actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.heading h1 { margin: 4px 0; font-size: var(--font-size-page-title); }
.heading p, .plan-row p, .muted, .field small { color: var(--color-text-secondary); }
.kicker { color: var(--color-primary-dark); font-size: 12px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.card { padding: 24px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.card h2 { margin: 0 0 16px; font-size: 19px; }
.section-heading h2 { margin: 0; }
.primary, .secondary, .type-selector button { min-height: 42px; padding: 9px 16px; border-radius: var(--radius-md); font: inherit; font-weight: 650; cursor: pointer; }
.primary { border: 1px solid var(--color-primary); background: var(--color-primary); color: white; }
.secondary, .type-selector button { border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-primary-dark); }
.type-selector { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.type-selector button.active { border-color: var(--color-primary); background: var(--color-primary-soft); }
.field { display: grid; gap: 7px; min-width: 0; }
.field label { font-size: 13px; font-weight: 700; }
.field input { min-height: 42px; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); font: inherit; }
.date-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.actions { justify-content: flex-end; margin-top: 20px; }
.plan-list { display: grid; }
.plan-row { padding: 16px 0; border-top: 1px solid var(--color-border); }
.plan-row h3 { margin: 4px 0; font-size: 17px; }
.plan-row p { margin: 4px 0 0; font-size: 13px; }
.row-actions { flex-wrap: wrap; justify-content: flex-end; }
.badge { padding: 6px 10px; border-radius: 999px; background: var(--color-primary-soft); color: var(--color-primary-dark); font-size: 12px; font-weight: 700; }
.badge.rejected, .rejection, .inline-error { color: #b91c1c; }
.badge.rejected { background: #fef2f2; }
.badge.approved { background: #ecfdf5; color: #047857; }
.badge.pending_approval { background: #fffbeb; color: #92400e; }
.notice { margin: 0; padding: 12px 14px; border-radius: var(--radius-md); }
.notice.error { background: #fef2f2; color: #991b1b; }
.notice.success { background: #ecfdf5; color: #047857; }
button:disabled { cursor: not-allowed; opacity: .55; }
@media (max-width: 700px) {
  .supervisor-plans { padding: 16px; }
  .heading, .plan-row { align-items: stretch; flex-direction: column; }
  .row-actions { justify-content: flex-start; }
  .date-grid { grid-template-columns: 1fr; }
  .card { padding: 18px; }
}
</style>
