<template>
  <main class="agenda-page">
    <div class="agenda-container">
      <header class="agenda-header">
        <div><span class="kicker">Operación diaria</span><h1>Agenda</h1><p>Asigna, prioriza y da seguimiento a las tareas de tu estructura.</p></div>
        <button class="primary" type="button" @click="openCreate">Nueva tarea</button>
      </header>

      <section class="toolbar">
        <label>Vista<select v-model="filters.mode"><option value="agenda">Mis tareas</option><option value="assigned">Mi estructura</option></select></label>
        <label>Supervisor / responsable<select v-model="filters.assigneeId"><option value="">Todos</option><option v-for="person in assignees" :key="person.id" :value="person.id">{{ person.name }}</option></select></label>
        <label>Estado<select v-model="filters.status"><option value="ALL">Todos</option><option v-for="entry in statuses" :key="entry" :value="entry">{{ statusLabel(entry) }}</option></select></label>
        <label>Prioridad<select v-model="filters.priority"><option value="ALL">Todas</option><option v-for="entry in priorities" :key="entry" :value="entry">{{ priorityLabel(entry) }}</option></select></label>
        <label>Desde<input v-model="filters.dueFrom" type="date"></label>
        <label>Hasta<input v-model="filters.dueTo" type="date"></label>
        <button type="button" class="secondary" :disabled="loading" @click="load">Actualizar</button>
      </section>

      <div v-if="error" class="message error"><strong>No fue posible cargar la Agenda</strong><span>{{ error }}</span></div>
      <div v-else-if="loading" class="message"><span class="spinner"></span><strong>Consultando tareas...</strong></div>
      <div v-else-if="!groups.length" class="empty"><strong>Agenda al día</strong><span>No hay tareas con los filtros seleccionados.</span></div>
      <template v-else>
        <section v-for="group in groups" :key="group.key" class="task-group">
          <header><div><span>{{ group.label }}</span><strong>{{ group.tasks.length }} {{ group.tasks.length === 1 ? 'tarea' : 'tareas' }}</strong></div></header>
          <div class="task-grid">
            <article v-for="task in group.tasks" :key="task.id" class="task-card" @click="openDetail(task)">
              <div class="card-top"><span class="status" :class="task.status.toLowerCase()">{{ statusLabel(task.status) }}</span><span class="priority" :class="task.priority.toLowerCase()">{{ priorityLabel(task.priority) }}</span></div>
              <h2>{{ task.title }}</h2><p>{{ task.description || 'Sin descripción' }}</p>
              <dl><div><dt>Responsable</dt><dd>{{ task.assigneeName }}</dd></div><div><dt>Vencimiento</dt><dd>{{ formatDate(task.dueAt) }}</dd></div></dl>
              <footer><span>{{ task.commentCount }} comentarios</span><span>{{ task.evidenceCount }} evidencias</span></footer>
            </article>
          </div>
        </section>
      </template>
    </div>

    <div v-if="formOpen" class="overlay" @click.self="formOpen = false"><form class="modal" @submit.prevent="saveTask">
      <header><div><span class="kicker">{{ form.id ? 'Editar' : 'Asignar' }}</span><h2>{{ form.id ? 'Editar tarea' : 'Nueva tarea' }}</h2></div><button type="button" class="close" @click="formOpen = false">×</button></header>
      <p v-if="error" class="form-error">{{ error }}</p>
      <label>Título<input v-model.trim="form.title" required minlength="3" maxlength="200"></label>
      <label>Descripción<textarea v-model.trim="form.description" maxlength="4000" rows="4"></textarea></label>
      <div class="form-grid"><label v-if="!form.id">Responsable<select v-model="form.assigneeId" required><option v-for="person in assignees" :key="person.id" :value="person.id">{{ person.name }} · {{ person.role }}</option></select></label><label>Prioridad<select v-model="form.priority"><option v-for="entry in priorities" :key="entry" :value="entry">{{ priorityLabel(entry) }}</option></select></label><label>Vencimiento<input v-model="form.dueAt" type="datetime-local"></label></div>
      <label class="check"><input v-model="form.requiresEvidence" type="checkbox"> Requiere evidencia antes de terminar</label>
      <footer><button type="button" class="secondary" @click="formOpen = false">Cancelar</button><button class="primary" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar' }}</button></footer>
    </form></div>

    <div v-if="detail" class="overlay" @click.self="detail = null"><section class="modal detail-modal">
      <header><div><span class="kicker">Detalle de tarea</span><h2>{{ detail.task.title }}</h2></div><button type="button" class="close" @click="detail = null">×</button></header>
      <p class="description">{{ detail.task.description || 'Sin descripción' }}</p>
      <dl class="detail-data"><div><dt>Responsable</dt><dd>{{ detail.task.assigneeName }}</dd></div><div><dt>Asignó</dt><dd>{{ detail.task.assignedByName }}</dd></div><div><dt>Vence</dt><dd>{{ formatDate(detail.task.dueAt) }}</dd></div><div><dt>Evidencias</dt><dd>{{ detail.evidence.length }}</dd></div></dl>
      <div class="actions"><button v-if="detail.task.permissions.edit" type="button" class="secondary" @click="openEdit">Editar</button><button v-if="detail.task.permissions.start" type="button" class="secondary" @click="changeStatus('IN_PROGRESS')">Iniciar</button><button v-if="detail.task.permissions.complete" type="button" class="primary" @click="changeStatus('DONE')">Terminar</button><button v-if="detail.task.permissions.cancel" type="button" class="danger" @click="changeStatus('CANCELLED')">Cancelar</button></div>
      <div class="detail-columns"><section><h3>Comentarios</h3><div v-for="item in detail.comments" :key="item.id" class="timeline"><strong>{{ item.author_name || 'Usuario' }}</strong><p>{{ item.body }}</p><small>{{ formatDate(item.created_at) }}</small></div><form class="comment" @submit.prevent="submitComment"><textarea v-model.trim="comment" maxlength="2000" placeholder="Agregar seguimiento"></textarea><button class="primary" :disabled="!comment">Comentar</button></form></section><section><h3>Historial</h3><div v-for="item in detail.events" :key="item.id" class="timeline"><strong>{{ eventLabel(item.event_type) }}</strong><p v-if="item.previous_status">{{ statusLabel(item.previous_status) }} → {{ statusLabel(item.new_status) }}</p><small>{{ item.actor_name || 'Sistema' }} · {{ formatDate(item.created_at) }}</small></div></section></div>
    </section></div>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { addWebTaskComment, createWebTask, getWebTaskAssignees, getWebTaskDetail, getWebTasks, updateWebTask, updateWebTaskStatus } from '../../services/api.js'

const statuses = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const tasks = ref([]); const assignees = ref([]); const loading = ref(true); const saving = ref(false); const error = ref(null); const formOpen = ref(false); const detail = ref(null); const comment = ref('')
const filters = reactive({ mode: 'assigned', assigneeId: '', status: 'ALL', priority: 'ALL', dueFrom: '', dueTo: '' })
const blank = () => ({ id: null, assigneeId: assignees.value[0]?.id || '', title: '', description: '', priority: 'MEDIUM', dueAt: '', requiresEvidence: false })
const form = reactive(blank())
const groups = computed(() => {
  const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(); const end = start + 86400000
  const result = [{ key: 'overdue', label: 'Vencidas', tasks: [] }, { key: 'today', label: 'Para hoy', tasks: [] }, { key: 'upcoming', label: 'Próximas', tasks: [] }, { key: 'none', label: 'Sin fecha', tasks: [] }, { key: 'closed', label: 'Terminadas y canceladas', tasks: [] }]
  tasks.value.forEach(task => { if (['DONE', 'CANCELLED'].includes(task.status)) result[4].tasks.push(task); else if (!task.dueAt) result[3].tasks.push(task); else if (Date.parse(task.dueAt) < start) result[0].tasks.push(task); else if (Date.parse(task.dueAt) < end) result[1].tasks.push(task); else result[2].tasks.push(task) })
  return result.filter(group => group.tasks.length)
})
async function load() { loading.value = true; error.value = null; try { const params = { ...filters, dueFrom: filters.dueFrom ? new Date(`${filters.dueFrom}T00:00:00`).toISOString() : '', dueTo: filters.dueTo ? new Date(`${filters.dueTo}T23:59:59`).toISOString() : '' }; tasks.value = (await getWebTasks(params)).tasks } catch (reason) { error.value = reason.message } finally { loading.value = false } }
async function openDetail(task) { try { detail.value = await getWebTaskDetail(task.id) } catch (reason) { error.value = reason.message } }
function openCreate() { error.value = null; Object.assign(form, blank()); formOpen.value = true }
function toLocalDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}
function openEdit() { error.value = null; const task = detail.value.task; Object.assign(form, { id: task.id, title: task.title, description: task.description || '', priority: task.priority, dueAt: toLocalDateTimeInput(task.dueAt), requiresEvidence: task.requiresEvidence }); formOpen.value = true }
async function saveTask() { saving.value = true; error.value = null; try { const payload = { title: form.title, description: form.description, priority: form.priority, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, requiresEvidence: form.requiresEvidence }; if (form.id) await updateWebTask(form.id, payload); else await createWebTask({ ...payload, assigneeId: form.assigneeId }); formOpen.value = false; await load(); if (form.id) detail.value = await getWebTaskDetail(form.id) } catch (reason) { error.value = reason.message } finally { saving.value = false } }
async function changeStatus(status) { try { await updateWebTaskStatus(detail.value.task.id, status); detail.value = await getWebTaskDetail(detail.value.task.id); await load() } catch (reason) { error.value = reason.message } }
async function submitComment() { if (!comment.value) return; try { await addWebTaskComment(detail.value.task.id, comment.value); comment.value = ''; detail.value = await getWebTaskDetail(detail.value.task.id); await load() } catch (reason) { error.value = reason.message } }
const statusLabel = value => ({ TODO: 'Pendiente', IN_PROGRESS: 'En curso', DONE: 'Terminada', CANCELLED: 'Cancelada' }[value] || value)
const priorityLabel = value => ({ LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente' }[value] || value)
const eventLabel = value => ({ CREATED: 'Tarea creada', UPDATED: 'Tarea editada', STATUS_CHANGED: 'Estado actualizado', COMMENT_ADDED: 'Comentario agregado', EVIDENCE_ADDED: 'Evidencia registrada' }[value] || value)
const formatDate = value => value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin vencimiento'
watch(() => [filters.mode, filters.assigneeId, filters.status, filters.priority], load)
onMounted(async () => { try { assignees.value = (await getWebTaskAssignees()).assignees } catch (reason) { error.value = reason.message } await load() })
</script>

<style scoped>
.agenda-page{min-height:100vh;padding:104px 28px 48px;background:linear-gradient(145deg,#f8fafc,#eef6fb);font-family:Inter,system-ui,sans-serif;color:#0f172a}.agenda-container{width:min(1180px,100%);margin:auto}.agenda-header{display:flex;align-items:end;justify-content:space-between;gap:24px}.kicker{color:#0f64ad;font-size:12px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.agenda-header h1,.modal h2{margin:6px 0;color:#0f172a}.agenda-header h1{font-size:30px}.agenda-header p{margin:0;color:#64748b}.primary,.secondary,.danger{min-height:40px;padding:0 16px;border-radius:11px;font-weight:800;cursor:pointer}.primary{border:0;background:#0f64ad;color:#fff}.secondary{border:1px solid #cbd5e1;background:#fff;color:#334155}.danger{border:1px solid #fecaca;background:#fff1f2;color:#be123c}.toolbar{display:grid;grid-template-columns:repeat(6,minmax(0,1fr)) auto;gap:10px;margin-top:24px;padding:14px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.toolbar label,.modal>label,.form-grid label{display:flex;flex-direction:column;gap:5px;color:#64748b;font-size:10px;font-weight:900;text-transform:uppercase}.toolbar select,.toolbar input,.modal input,.modal select,.modal textarea{min-height:40px;padding:8px 10px;border:1px solid #dbe3ec;border-radius:10px;background:#fff;color:#334155;font:inherit;text-transform:none}.toolbar button{align-self:end}.message,.empty{display:flex;gap:12px;align-items:center;margin-top:18px;padding:22px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.message.error{flex-direction:column;align-items:start;border-color:#fecaca;background:#fff1f2;color:#9f1239}.empty{flex-direction:column;color:#64748b}.empty strong{color:#334155}.spinner{width:20px;height:20px;border:3px solid #bfdbfe;border-top-color:#0f64ad;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.task-group{margin-top:24px}.task-group>header{margin-bottom:10px}.task-group>header div{display:flex;align-items:baseline;gap:10px}.task-group>header span{font-size:17px;font-weight:900}.task-group>header strong{color:#94a3b8;font-size:12px}.task-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.task-card{padding:17px;border:1px solid #e2e8f0;border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.04);cursor:pointer}.card-top,.task-card footer{display:flex;justify-content:space-between;gap:8px}.status,.priority{padding:5px 8px;border-radius:999px;background:#f1f5f9;font-size:10px;font-weight:900;text-transform:uppercase}.status.in_progress{background:#dbeafe;color:#1d4ed8}.status.done{background:#d1fae5;color:#047857}.status.cancelled{background:#f1f5f9;color:#64748b}.priority.high{background:#fef3c7;color:#b45309}.priority.urgent{background:#ffe4e6;color:#be123c}.task-card h2{margin:14px 0 5px;font-size:16px}.task-card>p{min-height:40px;margin:0;color:#64748b;font-size:13px;line-height:1.5}.task-card dl,.detail-data{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:14px 0}.task-card dt,.detail-data dt{color:#94a3b8;font-size:9px;font-weight:900;text-transform:uppercase}.task-card dd,.detail-data dd{margin:3px 0 0;color:#334155;font-size:12px;font-weight:700}.task-card footer{padding-top:11px;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:10px}.overlay{position:fixed;z-index:100;inset:0;display:grid;place-items:center;padding:24px;background:rgba(15,23,42,.55)}.modal{width:min(680px,100%);max-height:90vh;overflow:auto;padding:22px;border-radius:22px;background:#fff;box-shadow:0 30px 80px rgba(15,23,42,.25)}.detail-modal{width:min(900px,100%)}.modal>header{display:flex;justify-content:space-between;gap:16px}.close{border:0;background:transparent;color:#64748b;font-size:28px;cursor:pointer}.modal>label{margin-top:14px}.form-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.check{display:block!important;color:#334155!important;font-size:13px!important;text-transform:none!important}.check input{min-height:0;margin-right:7px}.modal>footer,.actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.description{color:#64748b;line-height:1.6}.detail-data{grid-template-columns:repeat(4,1fr)}.detail-columns{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:24px}.detail-columns h3{font-size:14px}.timeline{margin-top:10px;padding:11px;border-left:3px solid #bfdbfe;background:#f8fafc}.timeline strong{font-size:12px}.timeline p{margin:5px 0;color:#475569;font-size:13px}.timeline small{color:#94a3b8}.comment textarea{width:100%;min-height:75px;margin-top:12px}.comment button{margin-top:7px}@media(max-width:900px){.toolbar{grid-template-columns:repeat(2,1fr)}.task-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.agenda-page{padding:88px 16px 32px}.agenda-header{align-items:start}.task-grid,.detail-columns,.detail-data,.form-grid{grid-template-columns:1fr}.toolbar{grid-template-columns:1fr}}
.form-error{padding:10px;border-radius:10px;background:#fff1f2;color:#be123c;font-size:12px}
</style>
