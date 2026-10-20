<template>
  <aside class="task-alerts" aria-label="Notificaciones de agenda">
    <button class="toggle" @click="open = !open">
      Agenda <span v-if="tasks.length">{{ tasks.length }}</span>
    </button>
    <section v-if="open">
      <header>
        <strong>Mis recordatorios</strong
        ><button @click="open = false" aria-label="Cerrar avisos">×</button>
      </header>
      <p>
        Vencimientos y tareas asignadas por tu superior. Los avisos web
        requieren mantener la página abierta.
      </p>
      <button v-if="supported && permission !== 'granted'" @click="enable">
        Activar avisos del navegador
      </button>
      <p v-if="permission === 'denied'">
        El navegador bloqueó los avisos. Puedes habilitarlos en sus permisos.
      </p>
      <p v-if="error" role="status">{{ error }}</p>
      <ul>
        <li v-for="t in tasks.slice(0, 8)" :key="t.id">
          <RouterLink
            :to="{ path: '/farmacias/agenda', query: { task: t.id } }"
            @click="open = false"
            >{{ t.title }}</RouterLink
          ><small
            >{{ t.assignedByName || 'Tarea propia' }} ·
            {{ t.dueAt ? formatDate(t.dueAt) : 'Sin vencimiento' }}</small
          >
        </li>
      </ul>
      <RouterLink to="/farmacias/agenda" @click="open = false"
        >Ver agenda completa</RouterLink
      >
    </section>
  </aside>
</template>
<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { getWebTasks } from '../services/api.js'
const props = defineProps({ personaId: String })
const tasks = ref([]),
  open = ref(false),
  error = ref(''),
  supported = typeof Notification !== 'undefined',
  permission = ref(supported ? Notification.permission : 'unavailable')
const formatDate = (v) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(v))
const prefix = 'agenda-notices:' + props.personaId + ':'
let alive = true,
  busy = false,
  timer,
  startedAt = Date.now()
const seen = new Set()
function announce(t, kind) {
  if (permission.value !== 'granted') return
  const key = prefix + t.id + ':' + kind + (kind === 'due' ? ':' + t.dueAt : '')
  try {
    if (seen.has(key) || localStorage.getItem(key)) return
    seen.add(key)
    localStorage.setItem(key, '1')
  } catch {
    if (seen.has(key)) return
    seen.add(key)
  }
  if (permission.value === 'granted') {
    const n = new Notification(
      kind === 'assigned' ? 'Nueva tarea asignada' : 'Recordatorio de agenda',
      {
        body: 'Tienes una tarea pendiente. Abre la agenda para revisarla.',
        tag: key,
      }
    )
    n.onclick = () => {
      window.focus()
      window.location.assign(
        '/farmacias/agenda?task=' + encodeURIComponent(t.id)
      )
    }
  }
}
async function load() {
  if (busy || document.visibilityState === 'hidden' || !navigator.onLine) return
  busy = true
  try {
    const results = await Promise.all([
      getWebTasks({ mode: 'agenda', status: 'TODO' }),
      getWebTasks({ mode: 'agenda', status: 'IN_PROGRESS' }),
    ])
    if (!alive) return
    tasks.value = results
      .flatMap((r) => r.tasks)
      .sort(
        (a, b) =>
          (a.dueAt ? Date.parse(a.dueAt) : Infinity) -
          (b.dueAt ? Date.parse(b.dueAt) : Infinity)
      )
    error.value = ''
    for (const t of tasks.value) {
      if (
        t.assignedBy !== props.personaId &&
        Date.parse(t.createdAt) >= startedAt - 24 * 3600000
      )
        announce(t, 'assigned')
      if (
        t.dueAt &&
        Date.parse(t.dueAt) <= Date.now() + 30 * 60000 &&
        Date.parse(t.dueAt) > Date.now() - 86400000
      )
        announce(t, 'due')
    }
  } catch {
    if (alive)
      error.value =
        'No se pudieron actualizar los avisos. Tus tareas permanecen en Agenda.'
  } finally {
    busy = false
  }
}
async function enable() {
  if (!supported) return
  permission.value = await Notification.requestPermission()
  if (permission.value === 'granted') await load()
}
onMounted(() => {
  load()
  timer = setInterval(load, 60000)
  window.addEventListener('focus', load)
  window.addEventListener('online', load)
})
onUnmounted(() => {
  alive = false
  clearInterval(timer)
  window.removeEventListener('focus', load)
  window.removeEventListener('online', load)
})
</script>
<style scoped>
.task-alerts {
  position: fixed;
  right: 24px;
  bottom: 22px;
  z-index: 60;
  color: #172b45;
}
.task-alerts .toggle {
  background: #224c79;
  color: #fff;
  border-radius: 24px;
  padding: 12px 20px;
  border: 0;
  box-shadow: 0 4px 16px #142c4633;
}
.task-alerts button {
  cursor: pointer;
  font: inherit;
}
.task-alerts span {
  background: white;
  color: #224c79;
  border-radius: 15px;
  margin-left: 6px;
  padding: 2px 7px;
}
.task-alerts section {
  position: absolute;
  bottom: 52px;
  right: 0;
  width: min(360px, calc(100vw - 36px));
  max-height: 65vh;
  overflow: auto;
  background: white;
  border: 1px solid #d5dfec;
  box-shadow: 0 10px 40px #132d4522;
  border-radius: 15px;
  padding: 20px;
}
.task-alerts header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.task-alerts header button {
  border: 0;
  background: none;
  font-size: 25px;
}
.task-alerts p {
  font-size: 13px;
  line-height: 1.5;
}
.task-alerts ul {
  list-style: none;
  padding: 0;
}
.task-alerts li {
  padding: 12px 0;
  border-top: 1px solid #e2e8f0;
}
.task-alerts small {
  display: block;
  margin-top: 5px;
}
.task-alerts a {
  color: #255b91;
}
</style>
