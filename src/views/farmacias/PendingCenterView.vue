<template>
  <main class="pending-center">
    <header class="page-header">
      <div>
        <span>Prioridades de la operación</span>
        <h1>Mis pendientes</h1>
        <p>
          Accede a tus decisiones, tareas y seguimiento desde un solo lugar.
        </p>
      </div>
      <button class="primary" :disabled="loading" @click="load">
        Actualizar
      </button>
    </header>
    <p v-if="loading" role="status">Actualizando pendientes…</p>
    <div class="pending-grid">
      <article v-for="group in groups" :key="group.key" class="card">
        <span>{{ group.label }}</span
        ><strong>{{ group.error ? "—" : group.count }}</strong>
        <p>{{ group.error || group.note }}</p>
        <RouterLink class="primary" :to="group.to">{{
          group.action
        }}</RouterLink>
      </article>
    </div>
    <section class="card">
      <h2>Tareas vencidas y próximas</h2>
      <p v-if="!tasks.length">Sin tareas pendientes cargadas.</p>
      <article v-for="task in tasks" :key="task.id" class="task">
        <strong>{{ task.title }}</strong
        ><span>{{ task.assigneeName || "Mi tarea" }} · {{ task.priority }}</span
        ><span>{{
          task.dueAt
            ? new Date(task.dueAt).toLocaleString("es-MX")
            : "Sin vencimiento"
        }}</span
        ><RouterLink
          :to="{ path: '/farmacias/agenda', query: { taskId: task.id } }"
          >Abrir tarea</RouterLink
        >
      </article>
    </section>
    <p>
      Los fallos de sincronización del celular se consultan en Mis pendientes de
      la APK. Los avisos existentes conservan su comportamiento; esta vista no
      envía notificaciones nuevas.
    </p>
  </main>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { RouterLink } from "vue-router";
import { useAuth } from "../../composables/useAuth.js";
import {
  getWebTasks,
  getWebApprovals,
  getVisitFollowUp,
} from "../../services/api.js";
const { profile, user } = useAuth(),
  groups = ref([]),
  tasks = ref([]),
  loading = ref(false);
let version = 0;
async function load() {
  const id = ++version,
    owner = user.value?.id;
  loading.value = true;
  const defs = [
    {
      key: "tasks",
      label: "Tareas pendientes",
      to: "/farmacias/agenda",
      action: "Abrir agenda",
      note: "Ordenadas por vencimiento y prioridad.",
      request: () => getWebTasks({ status: "ALL", mode: "agenda" }),
    },
  ];
  if (
    ["GERENTE", "COORDINADOR"].includes(profile.value?.rol) ||
    profile.value?.system_role === "ADMIN"
  )
    defs.push(
      {
        key: "approvals",
        label: "Solicitudes por aprobar",
        to: "/farmacias/aprobaciones",
        action: "Ir a aprobaciones",
        note: "Planes, ediciones, cancelaciones y coberturas.",
        request: getWebApprovals,
      },
      {
        key: "followup",
        label: "Visitas por revisar",
        to: "/farmacias/seguimiento",
        action: "Ir a seguimiento",
        note: "Visitas anteriores no realizadas o sin finalizar.",
        request: getVisitFollowUp,
      },
    );
  const results = await Promise.allSettled(defs.map((d) => d.request()));
  if (id !== version || owner !== user.value?.id) return;
  groups.value = defs.map((d, i) => {
    const r = results[i];
    if (r.status === "rejected") {
      if (d.key === "tasks") tasks.value = [];
      return {
        ...d,
        count: 0,
        error: "No se pudo actualizar este apartado. Vuelve a intentar.",
      };
    }
    const value = r.value;
    if (d.key === "tasks")
      tasks.value = (value.tasks || [])
        .filter((t) => !["DONE", "CANCELLED"].includes(t.status))
        .sort(
          (a, b) =>
            (a.dueAt ? Date.parse(a.dueAt) : Infinity) -
              (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
            ["URGENT", "HIGH", "MEDIUM", "LOW"].indexOf(a.priority) -
              ["URGENT", "HIGH", "MEDIUM", "LOW"].indexOf(b.priority),
        );
    return {
      ...d,
      count:
        d.key === "tasks"
          ? tasks.value.length
          : d.key === "approvals"
            ? value.counts?.total || 0
            : value.total || 0,
    };
  });
  loading.value = false;
}
onMounted(load);
watch(
  () => user.value?.id,
  () => {
    ++version;
    groups.value = [];
    tasks.value = [];
    loading.value = false;
    if (user.value) void load();
  },
);
onBeforeUnmount(() => ++version);
</script>
<style scoped>
.pending-center {
  padding: 28px;
  display: grid;
  gap: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.pending-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.card {
  padding: 22px;
  border: 1px solid #cbd5df;
  border-radius: 12px;
  background: #fff;
}
.pending-grid .card > strong {
  display: block;
  font-size: 34px;
  margin: 14px 0;
}
.primary {
  display: inline-block;
  padding: 11px 14px;
  background: #096e91;
  color: #fff;
  border: 0;
  border-radius: 8px;
  text-decoration: none;
  font: inherit;
  font-weight: 700;
}
.task {
  display: grid;
  gap: 7px;
  padding: 16px 0;
  border-bottom: 1px solid #e2e8f0;
}
.task span {
  color: #435667;
}
@media (max-width: 600px) {
  .pending-center {
    padding: 16px;
  }
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
