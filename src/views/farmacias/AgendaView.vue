<template>
  <main class="agenda-page">
    <div class="agenda-container">
      <header class="agenda-header">
        <div>
          <span class="kicker">Operación diaria</span>

          <h1>Agenda</h1>

          <p>
            {{
              canAssign
                ? 'Asigna, prioriza y da seguimiento a las tareas de tu estructura.'
                : 'Organiza, prioriza y da seguimiento a tus tareas operativas.'
            }}
          </p>
        </div>

        <button
          class="primary"
          type="button"
          :disabled="!permissionsReady"
          @click="openCreate"
        >
          Nueva tarea
        </button>
      </header>

      <section class="toolbar">
        <label>
          Vista

          <select v-model="filters.mode">
            <option value="agenda">
              Mis tareas
            </option>

            <option
              v-if="canAssign"
              value="assigned"
            >
              Mi estructura
            </option>
          </select>
        </label>

        <label v-if="canAssign">
          Supervisor / responsable

          <select v-model="filters.assigneeId">
            <option value="">
              Todos
            </option>

            <option
              v-for="person in assignees"
              :key="person.id"
              :value="person.id"
            >
              {{ person.name }}
            </option>
          </select>
        </label>

        <label>
          Estado

          <select v-model="filters.status">
            <option value="ALL">
              Todos
            </option>

            <option
              v-for="entry in statuses"
              :key="entry"
              :value="entry"
            >
              {{ statusLabel(entry) }}
            </option>
          </select>
        </label>

        <label>
          Prioridad

          <select v-model="filters.priority">
            <option value="ALL">
              Todas
            </option>

            <option
              v-for="entry in priorities"
              :key="entry"
              :value="entry"
            >
              {{ priorityLabel(entry) }}
            </option>
          </select>
        </label>

        <label>
          Desde

          <input
            v-model="filters.dueFrom"
            type="date"
          >
        </label>

        <label>
          Hasta

          <input
            v-model="filters.dueTo"
            type="date"
          >
        </label>

        <button
          type="button"
          class="secondary"
          :disabled="loading"
          @click="load"
        >
          Actualizar
        </button>
      </section>

      <div
        v-if="assigneesError"
        class="message error"
      >
        <strong>
          No fue posible confirmar los permisos de Agenda
        </strong>

        <span>
          {{ assigneesError }}
        </span>
      </div>

      <div
        v-if="error"
        class="message error"
      >
        <strong>
          No fue posible cargar la Agenda
        </strong>

        <span>
          {{ error }}
        </span>
      </div>

      <div
        v-else-if="loading"
        class="message"
      >
        <span class="spinner"></span>

        <strong>
          Consultando tareas...
        </strong>
      </div>

      <div
        v-else-if="!groups.length"
        class="empty"
      >
        <strong>
          Agenda al día
        </strong>

        <span>
          No hay tareas con los filtros seleccionados.
        </span>
      </div>

      <template v-else>
        <section
          v-for="group in groups"
          :key="group.key"
          class="task-group"
        >
          <header>
            <div>
              <span>
                {{ group.label }}
              </span>

              <strong>
                {{ group.tasks.length }}
                {{ group.tasks.length === 1 ? 'tarea' : 'tareas' }}
              </strong>
            </div>
          </header>

          <div class="task-grid">
            <article
              v-for="task in group.tasks"
              :key="task.id"
              class="task-card"
              @click="openDetail(task)"
            >
              <div class="card-top">
                <span
                  class="status"
                  :class="task.status.toLowerCase()"
                >
                  {{ statusLabel(task.status) }}
                </span>

                <span
                  class="priority"
                  :class="task.priority.toLowerCase()"
                >
                  {{ priorityLabel(task.priority) }}
                </span>
              </div>

              <h2>
                {{ task.title }}
              </h2>

              <p>
                {{ task.description || 'Sin descripción' }}
              </p>

              <dl>
                <div>
                  <dt>
                    Responsable
                  </dt>

                  <dd>
                    {{ task.assigneeName }}
                  </dd>
                </div>

                <div>
                  <dt>
                    Vencimiento
                  </dt>

                  <dd>
                    {{ formatDate(task.dueAt) }}
                  </dd>
                </div>
              </dl>

              <footer>
                <span>
                  {{ task.commentCount }} comentarios
                </span>

                <span>
                  {{ task.evidenceCount }} evidencias
                </span>
              </footer>
            </article>
          </div>
        </section>
      </template>
    </div>

    <div
      v-if="formOpen"
      class="overlay"
      @click.self="formOpen = false"
    >
      <form
        class="modal"
        @submit.prevent="saveTask"
      >
        <header>
          <div>
            <span class="kicker">
              {{
                form.id
                  ? 'Editar'
                  : canAssign
                    ? 'Asignar'
                    : 'Tarea personal'
              }}
            </span>

            <h2>
              {{ form.id ? 'Editar tarea' : 'Nueva tarea' }}
            </h2>
          </div>

          <button
            type="button"
            class="close"
            @click="formOpen = false"
          >
            ×
          </button>
        </header>

        <p
          v-if="error"
          class="form-error"
        >
          {{ error }}
        </p>

        <label>
          Título

          <input
            v-model.trim="form.title"
            required
            minlength="3"
            maxlength="200"
          >
        </label>

        <label>
          Descripción

          <textarea
            v-model.trim="form.description"
            maxlength="4000"
            rows="4"
          ></textarea>
        </label>

        <div class="form-grid">
          <label v-if="!form.id && canAssign">
            Responsable

            <select
              v-model="form.assigneeId"
              required
            >
              <option
                v-for="person in assignees"
                :key="person.id"
                :value="person.id"
              >
                {{ person.name }} · {{ person.role }}
              </option>
            </select>
          </label>

          <label>
            Prioridad

            <select v-model="form.priority">
              <option
                v-for="entry in priorities"
                :key="entry"
                :value="entry"
              >
                {{ priorityLabel(entry) }}
              </option>
            </select>
          </label>

          <label>
            Vencimiento

            <input
              v-model="form.dueAt"
              type="datetime-local"
            >
          </label>
        </div>

        <label class="check">
          <input
            v-model="form.requiresEvidence"
            type="checkbox"
          >

          Requiere evidencia antes de terminar
        </label>

        <footer>
          <button
            type="button"
            class="secondary"
            @click="formOpen = false"
          >
            Cancelar
          </button>

          <button
            class="primary"
            :disabled="saving"
          >
            {{ saving ? 'Guardando...' : 'Guardar' }}
          </button>
        </footer>
      </form>
    </div>

    <div
      v-if="detail"
      class="overlay"
      @click.self="detail = null"
    >
      <section class="modal detail-modal">
        <header>
          <div>
            <span class="kicker">
              Detalle de tarea
            </span>

            <h2>
              {{ detail.task.title }}
            </h2>
          </div>

          <button
            type="button"
            class="close"
            @click="detail = null"
          >
            ×
          </button>
        </header>

        <p class="description">
          {{ detail.task.description || 'Sin descripción' }}
        </p>

        <dl class="detail-data">
          <div>
            <dt>
              Responsable
            </dt>

            <dd>
              {{ detail.task.assigneeName }}
            </dd>
          </div>

          <div>
            <dt>
              Asignó
            </dt>

            <dd>
              {{ detail.task.assignedByName }}
            </dd>
          </div>

          <div>
            <dt>
              Vence
            </dt>

            <dd>
              {{ formatDate(detail.task.dueAt) }}
            </dd>
          </div>

          <div>
            <dt>
              Evidencias
            </dt>

            <dd>
              {{ detail.evidence.length }}
            </dd>
          </div>
        </dl>

        <section
          v-if="detail.evidence.length"
          class="evidence-section"
        >
          <header>
            <div>
              <span class="kicker">
                Evidencias
              </span>

              <h3>
                Fotografías de la tarea
              </h3>
            </div>

            <small>
              Los enlaces se renuevan al abrir la tarea
            </small>
          </header>

          <div class="evidence-grid">
            <article
              v-for="item in detail.evidence"
              :key="item.id"
              class="evidence-card"
            >
              <a
                v-if="item.signedUrl"
                :href="item.signedUrl"
                target="_blank"
                rel="noopener noreferrer"
                referrerpolicy="no-referrer"
                title="Abrir evidencia"
              >
                <img
                  :src="item.signedUrl"
                  alt="Evidencia fotográfica de la tarea"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                >
              </a>

              <div
                v-else
                class="evidence-unavailable"
              >
                {{ evidenceStatusLabel(item.status) }}
              </div>

              <footer>
                <strong>
                  {{ evidenceStatusLabel(item.status) }}
                </strong>

                <span>
                  {{ formatDate(item.captured_at) }}
                </span>
              </footer>
            </article>
          </div>
        </section>

        <div class="actions">
          <button
            v-if="detail.task.permissions.edit"
            type="button"
            class="secondary"
            @click="openEdit"
          >
            Editar
          </button>

          <button
            v-if="detail.task.permissions.start"
            type="button"
            class="secondary"
            @click="changeStatus('IN_PROGRESS')"
          >
            Iniciar
          </button>

          <button
            v-if="detail.task.permissions.complete"
            type="button"
            class="primary"
            @click="changeStatus('DONE')"
          >
            Terminar
          </button>

          <button
            v-if="detail.task.permissions.cancel"
            type="button"
            class="danger"
            @click="changeStatus('CANCELLED')"
          >
            Cancelar
          </button>
        </div>

        <div class="detail-columns">
          <section>
            <h3>
              Comentarios
            </h3>

            <div
              v-for="item in detail.comments"
              :key="item.id"
              class="timeline"
            >
              <strong>
                {{ item.author_name || 'Usuario' }}
              </strong>

              <p>
                {{ item.body }}
              </p>

              <small>
                {{ formatDate(item.created_at) }}
              </small>
            </div>

            <form
              class="comment"
              @submit.prevent="submitComment"
            >
              <textarea
                v-model.trim="comment"
                maxlength="2000"
                placeholder="Agregar seguimiento"
              ></textarea>

              <button
                class="primary"
                :disabled="!comment"
              >
                Comentar
              </button>
            </form>
          </section>

          <section>
            <h3>
              Historial
            </h3>

            <div
              v-for="item in detail.events"
              :key="item.id"
              class="timeline"
            >
              <strong>
                {{ eventLabel(item.event_type) }}
              </strong>

              <p v-if="item.previous_status">
                {{ statusLabel(item.previous_status) }}
                →
                {{ statusLabel(item.new_status) }}
              </p>

              <small>
                {{ item.actor_name || 'Sistema' }}
                ·
                {{ formatDate(item.created_at) }}
              </small>
            </div>
          </section>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import {
  computed,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'

import {
  addWebTaskComment,
  createWebTask,
  getWebTaskAssignees,
  getWebTaskDetail,
  getWebTasks,
  updateWebTask,
  updateWebTaskStatus,
} from '../../services/api.js'

const statuses = [
  'TODO',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
]

const priorities = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
]

const tasks = ref([])
const assignees = ref([])
const canAssign = ref(false)
const permissionsReady = ref(false)
const assigneesError = ref(null)

const loading = ref(true)
const saving = ref(false)

const error = ref(null)
const formOpen = ref(false)
const detail = ref(null)
const comment = ref('')

const filters = reactive({
  mode: 'agenda',
  assigneeId: '',
  status: 'ALL',
  priority: 'ALL',
  dueFrom: '',
  dueTo: '',
})

const blank = () => ({
  id: null,
  assigneeId:
    canAssign.value
      ? assignees.value[0]?.id || ''
      : '',
  title: '',
  description: '',
  priority: 'MEDIUM',
  dueAt: '',
  requiresEvidence: false,
})

const form = reactive(blank())

const groups = computed(() => {
  const today = new Date()

  const start =
    new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime()

  const end =
    start + 86400000

  const result = [
    {
      key: 'overdue',
      label: 'Vencidas',
      tasks: [],
    },
    {
      key: 'today',
      label: 'Para hoy',
      tasks: [],
    },
    {
      key: 'upcoming',
      label: 'Próximas',
      tasks: [],
    },
    {
      key: 'none',
      label: 'Sin fecha',
      tasks: [],
    },
    {
      key: 'closed',
      label: 'Terminadas y canceladas',
      tasks: [],
    },
  ]

  tasks.value.forEach(task => {
    if (
      ['DONE', 'CANCELLED'].includes(
        task.status,
      )
    ) {
      result[4].tasks.push(task)
      return
    }

    if (!task.dueAt) {
      result[3].tasks.push(task)
      return
    }

    if (
      Date.parse(task.dueAt) <
      start
    ) {
      result[0].tasks.push(task)
      return
    }

    if (
      Date.parse(task.dueAt) <
      end
    ) {
      result[1].tasks.push(task)
      return
    }

    result[2].tasks.push(task)
  })

  return result.filter(
    group => group.tasks.length,
  )
})

function errorMessage(
  reason,
  fallback = 'Ocurrió un error.',
) {
  return reason instanceof Error
    ? reason.message
    : fallback
}

async function load() {
  loading.value = true
  error.value = null

  try {
    if (!canAssign.value) {
      filters.mode = 'agenda'
      filters.assigneeId = ''
    }

    const params = {
      ...filters,

      dueFrom:
        filters.dueFrom
          ? new Date(
              `${filters.dueFrom}T00:00:00`,
            ).toISOString()
          : '',

      dueTo:
        filters.dueTo
          ? new Date(
              `${filters.dueTo}T23:59:59`,
            ).toISOString()
          : '',
    }

    const response =
      await getWebTasks(params)

    tasks.value =
      response.tasks
  } catch (reason) {
    error.value =
      errorMessage(
        reason,
        'No fue posible cargar la Agenda.',
      )
  } finally {
    loading.value = false
  }
}

async function openDetail(task) {
  error.value = null

  try {
    detail.value =
      await getWebTaskDetail(
        task.id,
      )
  } catch (reason) {
    error.value =
      errorMessage(
        reason,
        'No fue posible abrir la tarea.',
      )
  }
}

function openCreate() {
  if (!permissionsReady.value) {
    return
  }

  error.value = null

  Object.assign(
    form,
    blank(),
  )

  formOpen.value = true
}

function toLocalDateTimeInput(value) {
  if (!value) {
    return ''
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return ''
  }

  const local =
    new Date(
      date.getTime() -
      date.getTimezoneOffset() *
      60000,
    )

  return local
    .toISOString()
    .slice(0, 16)
}

function openEdit() {
  if (!detail.value) {
    return
  }

  error.value = null

  const task =
    detail.value.task

  Object.assign(
    form,
    {
      id: task.id,
      assigneeId:
        task.assigneeId || '',
      title:
        task.title,
      description:
        task.description || '',
      priority:
        task.priority,
      dueAt:
        toLocalDateTimeInput(
          task.dueAt,
        ),
      requiresEvidence:
        task.requiresEvidence,
    },
  )

  formOpen.value = true
}

async function saveTask() {
  saving.value = true
  error.value = null

  const editingId =
    form.id

  try {
    const payload = {
      title:
        form.title,

      description:
        form.description,

      priority:
        form.priority,

      dueAt:
        form.dueAt
          ? new Date(
              form.dueAt,
            ).toISOString()
          : null,

      requiresEvidence:
        form.requiresEvidence,
    }

    if (editingId) {
      await updateWebTask(
        editingId,
        payload,
      )
    } else if (canAssign.value) {
      await createWebTask({
        ...payload,
        assigneeId:
          form.assigneeId,
      })
    } else {
      /*
       * SUPERVISOR:
       * no mandamos assigneeId.
       *
       * El backend resuelve:
       * body.assigneeId ?? actor.id
       *
       * Por lo tanto la tarea queda
       * asignada al propio supervisor.
       */
      await createWebTask(
        payload,
      )
    }

    formOpen.value = false

    await load()

    if (editingId) {
      detail.value =
        await getWebTaskDetail(
          editingId,
        )
    }
  } catch (reason) {
    error.value =
      errorMessage(
        reason,
        'No fue posible guardar la tarea.',
      )
  } finally {
    saving.value = false
  }
}

async function changeStatus(status) {
  if (!detail.value) {
    return
  }

  error.value = null

  try {
    await updateWebTaskStatus(
      detail.value.task.id,
      status,
    )

    detail.value =
      await getWebTaskDetail(
        detail.value.task.id,
      )

    await load()
  } catch (reason) {
    error.value =
      errorMessage(
        reason,
        'No fue posible cambiar el estado.',
      )
  }
}

async function submitComment() {
  if (
    !detail.value ||
    !comment.value
  ) {
    return
  }

  error.value = null

  try {
    await addWebTaskComment(
      detail.value.task.id,
      comment.value,
    )

    comment.value = ''

    detail.value =
      await getWebTaskDetail(
        detail.value.task.id,
      )

    await load()
  } catch (reason) {
    error.value =
      errorMessage(
        reason,
        'No fue posible guardar el comentario.',
      )
  }
}

const statusLabel =
  value =>
    ({
      TODO:
        'Pendiente',

      IN_PROGRESS:
        'En curso',

      DONE:
        'Terminada',

      CANCELLED:
        'Cancelada',
    }[value] || value)

const priorityLabel =
  value =>
    ({
      LOW:
        'Baja',

      MEDIUM:
        'Media',

      HIGH:
        'Alta',

      URGENT:
        'Urgente',
    }[value] || value)

const eventLabel =
  value =>
    ({
      CREATED:
        'Tarea creada',

      UPDATED:
        'Tarea editada',

      STATUS_CHANGED:
        'Estado actualizado',

      COMMENT_ADDED:
        'Comentario agregado',

      EVIDENCE_ADDED:
        'Evidencia registrada',
    }[value] || value)

const evidenceStatusLabel =
  value =>
    ({
      READY:
        'Disponible',

      PENDING_UPLOAD:
        'Pendiente de carga',

      REJECTED:
        'Rechazada',
    }[value] || value)

const formatDate =
  value =>
    value
      ? new Date(
          value,
        ).toLocaleString(
          'es-MX',
          {
            dateStyle:
              'medium',

            timeStyle:
              'short',
          },
        )
      : 'Sin vencimiento'

watch(
  () => [
    filters.mode,
    filters.assigneeId,
    filters.status,
    filters.priority,
  ],
  load,
)

onMounted(
  async () => {
    assigneesError.value = null

    try {
      const response =
        await getWebTaskAssignees()

      assignees.value =
        response.assignees || []

      canAssign.value =
        Boolean(
          response.canAssign,
        )

      permissionsReady.value = true

      /*
       * Seguridad adicional de UI:
       * Supervisor nunca arranca
       * en "Mi estructura".
       */
      if (!canAssign.value) {
        filters.mode =
          'agenda'

        filters.assigneeId =
          ''
      }
    } catch (reason) {
      permissionsReady.value = false

      assigneesError.value =
        errorMessage(
          reason,
          'No fue posible cargar los responsables.',
        )
    }

    await load()
  },
)
</script>

<style scoped>
.agenda-page {
  width: 100%;
  min-height: 100%;
  padding: 28px 28px 52px;
  background: var(--color-background);
  color: var(--color-text);
}

.agenda-container {
  width: min(var(--content-max-width), 100%);
  margin: 0 auto;
}

/* ============================================================
   CABECERA
   ============================================================ */

.agenda-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.agenda-header > div {
  min-width: 0;
}

.kicker {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: .055em;
  text-transform: uppercase;
}

.agenda-header h1 {
  margin: 5px 0;
  color: var(--color-text);
  font-size: var(--font-size-page-title);
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -.02em;
}

.agenda-header p {
  max-width: 760px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

/* ============================================================
   BOTONES
   ============================================================ */

.primary,
.secondary,
.danger {
  min-height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}

.primary {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.secondary {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: #475569;
}

.secondary:hover:not(:disabled) {
  border-color: #bfdbfe;
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
}

.danger {
  border: 1px solid #fecaca;
  background: var(--color-error-soft);
  color: var(--color-error);
}

.danger:hover:not(:disabled) {
  background: #fee2e2;
}

.primary:disabled,
.secondary:disabled,
.danger:disabled {
  cursor: wait;
  opacity: .55;
}

/* ============================================================
   FILTROS
   ============================================================ */

.toolbar {
  display: grid;
  grid-template-columns:
    minmax(145px, .8fr)
    minmax(180px, 1fr)
    minmax(140px, .8fr)
    minmax(140px, .8fr)
    minmax(145px, .85fr)
    minmax(145px, .85fr)
    auto;
  gap: 10px;
  margin-top: 22px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.toolbar label,
.modal > label,
.form-grid label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  color: #475569;
  font-size: 12px;
  font-weight: 650;
}

.toolbar select,
.toolbar input,
.modal input,
.modal select,
.modal textarea {
  width: 100%;
  min-width: 0;
  min-height: 41px;
  padding: 8px 11px;
  outline: 0;
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}

.toolbar select:focus,
.toolbar input:focus,
.modal input:focus,
.modal select:focus,
.modal textarea:focus {
  border-color: var(--color-primary);
  box-shadow:
    0 0 0 3px
    rgba(37, 99, 235, .09);
}

.toolbar button {
  align-self: end;
}

/* ============================================================
   MENSAJES
   ============================================================ */

.message,
.empty {
  display: flex;
  gap: 11px;
  align-items: center;
  margin-top: 16px;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.message {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.message.error {
  align-items: flex-start;
  flex-direction: column;
  border-color: #fecaca;
  background: var(--color-error-soft);
  color: var(--color-error);
}

.message.error strong {
  font-size: 13px;
}

.message.error span {
  font-size: 12px;
  line-height: 1.45;
}

.empty {
  min-height: 150px;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}

.empty strong {
  color: #334155;
  font-size: 16px;
}

.empty span {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.spinner {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  border: 3px solid #dbeafe;
  border-top-color: var(--color-primary);
  border-radius: 999px;
  animation:
    agenda-spin
    .7s
    linear
    infinite;
}

@keyframes agenda-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================================
   AGRUPACIONES
   ============================================================ */

.task-group {
  margin-top: 22px;
}

.task-group > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
}

.task-group > header div {
  display: flex;
  align-items: center;
  gap: 9px;
}

.task-group > header span {
  color: #334155;
  font-size: 16px;
  font-weight: 700;
}

.task-group > header strong {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

/* ============================================================
   TARJETAS
   ============================================================ */

.task-grid {
  display: grid;
  grid-template-columns:
    repeat(
      3,
      minmax(0, 1fr)
    );
  gap: 12px;
}

.task-card {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 240px;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}

.task-card:hover {
  border-color: #bfdbfe;
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.card-top,
.task-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* ============================================================
   ESTADOS / PRIORIDADES
   ============================================================ */

.status,
.priority {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status.todo {
  background: #f1f5f9;
  color: #475569;
}

.status.in_progress {
  background: #dbeafe;
  color: #1d4ed8;
}

.status.done {
  background: #dcfce7;
  color: #166534;
}

.status.cancelled {
  background: #f1f5f9;
  color: #64748b;
}

.priority.low {
  background: #f1f5f9;
  color: #64748b;
}

.priority.medium {
  background: #e0f2fe;
  color: #0369a1;
}

.priority.high {
  background: #fef3c7;
  color: #92400e;
}

.priority.urgent {
  background: #fee2e2;
  color: #b91c1c;
}

/* ============================================================
   CONTENIDO DE TARJETA
   ============================================================ */

.task-card h2 {
  margin: 14px 0 5px;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
}

.task-card > p {
  display: -webkit-box;
  min-height: 42px;
  margin: 0;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;

  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.task-card dl,
.detail-data {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 9px;
  margin: 14px 0;
}

.task-card dl {
  margin-top: auto;
  padding-top: 14px;
}

.task-card dt,
.detail-data dt {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.task-card dd,
.detail-data dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  color: #334155;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}

.task-card footer {
  padding-top: 10px;
  border-top: 1px solid #eef2f7;
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   OVERLAY / MODALES
   ============================================================ */

.overlay {
  position: fixed;
  z-index: 20000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 22px;
  background:
    rgba(
      15,
      23,
      42,
      .52
    );
  backdrop-filter: blur(4px);
}

.modal {
  width: min(680px, 100%);
  max-height: calc(100vh - 44px);
  overflow: auto;
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.detail-modal {
  width: min(980px, 100%);
}

.modal > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
}

.modal h2 {
  margin: 5px 0 0;
  color: var(--color-text);
  font-size: 20px;
  font-weight: 750;
  line-height: 1.3;
}

.close {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: #64748b;
  cursor: pointer;
  font-size: 23px;
  line-height: 1;
}

.close:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.modal > label {
  margin-top: 14px;
}

.modal textarea {
  resize: vertical;
  line-height: 1.5;
}

.form-grid {
  display: grid;
  grid-template-columns:
    repeat(
      3,
      minmax(0, 1fr)
    );
  gap: 10px;
  margin-top: 14px;
}

.check {
  display: flex !important;
  align-items: center;
  flex-direction: row !important;
  gap: 8px !important;
  margin-top: 15px !important;
  color: #334155 !important;
  font-size: 13px !important;
}

.check input {
  width: 17px;
  height: 17px;
  min-height: 0;
  margin: 0;
}

.modal > footer,
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

/* ============================================================
   DETALLE
   ============================================================ */

.description {
  margin: 15px 0 0;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.detail-data {
  grid-template-columns:
    repeat(
      4,
      minmax(0, 1fr)
    );
  gap: 9px;
  margin-top: 14px;
}

.detail-data > div {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: #fcfdff;
}

/* ============================================================
   EVIDENCIAS
   ============================================================ */

.evidence-section {
  margin-top: 20px;
  padding-top: 17px;
  border-top: 1px solid var(--color-border);
}

.evidence-section > header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
}

.evidence-section h3 {
  margin: 3px 0 0;
  color: var(--color-text);
  font-size: 15px;
}

.evidence-section small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.evidence-grid {
  display: grid;
  grid-template-columns:
    repeat(
      auto-fill,
      minmax(
        170px,
        1fr
      )
    );
  gap: 10px;
  margin-top: 11px;
}

.evidence-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.evidence-card a,
.evidence-unavailable {
  display: grid;
  width: 100%;
  height: 145px;
  place-items: center;
  overflow: hidden;
  background: #e2e8f0;
}

.evidence-card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-orientation: from-image;
  transition: transform 170ms ease;
}

.evidence-card a:hover img {
  transform: scale(1.025);
}

.evidence-unavailable {
  padding: 14px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
  text-align: center;
}

.evidence-card footer {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px;
}

.evidence-card footer strong {
  color: #334155;
  font-size: 12px;
}

.evidence-card footer span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   ACCIONES DE TAREA
   ============================================================ */

.actions {
  padding-top: 14px;
  border-top: 1px solid #eef2f7;
}

/* ============================================================
   COMENTARIOS / HISTORIAL
   ============================================================ */

.detail-columns {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 18px;
  margin-top: 20px;
}

.detail-columns > section {
  min-width: 0;
}

.detail-columns h3 {
  margin: 0 0 9px;
  color: var(--color-text);
  font-size: 15px;
}

.timeline {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #93c5fd;
  border-radius:
    0
    var(--radius-md)
    var(--radius-md)
    0;
  background: #f8fafc;
}

.timeline strong {
  color: #334155;
  font-size: 13px;
}

.timeline p {
  margin: 4px 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.45;
}

.timeline small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.comment {
  margin-top: 12px;
}

.comment textarea {
  width: 100%;
  min-height: 88px;
  margin: 0;
}

.comment button {
  margin-top: 7px;
}

.form-error {
  margin-top: 12px;
  padding: 10px 11px;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  background: var(--color-error-soft);
  color: var(--color-error);
  font-size: 12px;
  line-height: 1.45;
}

/* ============================================================
   TABLET
   ============================================================ */

@media (
  max-width: 1150px
) {
  .toolbar {
    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      );
  }

  .task-grid {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }
}

@media (
  max-width: 850px
) {
  .agenda-page {
    padding:
      22px
      18px
      40px;
  }

  .agenda-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .detail-data {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}

/* ============================================================
   MÓVIL
   ============================================================ */

@media (
  max-width: 620px
) {
  .agenda-page {
    padding:
      18px
      14px
      32px;
  }

  .agenda-header h1 {
    font-size: 24px;
  }

  .agenda-header .primary {
    width: 100%;
  }

  .toolbar,
  .task-grid,
  .detail-columns,
  .detail-data,
  .evidence-grid {
    grid-template-columns: 1fr;
  }

  .toolbar button {
    width: 100%;
  }

  .task-card {
    min-height: auto;
  }

  .overlay {
    padding: 10px;
  }

  .modal {
    max-height: calc(100vh - 20px);
    padding: 17px;
    border-radius: var(--radius-lg);
  }

  .modal > footer,
  .actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .modal > footer button,
  .actions button {
    width: 100%;
  }
}
</style>
