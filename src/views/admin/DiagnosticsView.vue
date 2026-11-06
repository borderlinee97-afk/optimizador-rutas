<template>
  <main class="diagnostics">
    <header class="page-header">
      <div>
        <span>Estado de la operación</span>
        <h1>Monitoreo y diagnóstico</h1>
        <p>Versión, errores y tiempos recientes del servidor.</p>
      </div>
      <button class="primary" :disabled="loading" @click="load">
        Actualizar
      </button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="data"
      ><section class="metrics">
        <article>
          <span>Versión</span><strong>{{ data.version.slice(0, 12) }}</strong>
        </article>
        <article>
          <span>Solicitudes recientes</span><strong>{{ data.requests }}</strong>
        </article>
        <article>
          <span>Errores de servidor</span
          ><strong>{{ data.serverErrors }}</strong>
        </article>
        <article>
          <span>Tiempo p95</span
          ><strong>{{
            data.p95Ms == null ? "—" : Math.round(data.p95Ms) + " ms"
          }}</strong>
        </article>
      </section>
      <p>
        {{ data.retention }} Inicio:
        {{ new Date(data.startedAt).toLocaleString("es-MX") }}.
      </p>
      <section class="metrics" aria-label="Cola de notificaciones">
        <article><span>Notificaciones pendientes</span><strong>{{ data.pushQueue?.available ? data.pushQueue.groups.reduce((sum,group)=>sum+Number(group.total),0) : 'No disponible' }}</strong><span>Incluye pendientes, envíos en curso y fallos.</span></article>
        <article v-for="group in data.pushQueue?.groups || []" :key="group.status"><span>{{ ({PENDING:'Por enviar',SENDING:'Enviando',FAILED:'Fallidas'})[group.status] || group.status }}</span><strong>{{ group.total }}</strong><span>Más antigua: {{ group.oldest_at ? new Date(group.oldest_at).toLocaleString('es-MX') : '—' }}</span></article>
      </section>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Origen</th>
              <th>Operación</th>
              <th>Estado</th>
              <th>Tiempo</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(event, i) in data.events" :key="i">
              <td>{{ new Date(event.at).toLocaleTimeString("es-MX") }}</td>
              <td>{{ event.source }}</td>
              <td>{{ event.operation }}</td>
              <td>{{ event.status || event.kind }}</td>
              <td>{{ Math.round(event.durationMs) }} ms</td>
              <td>{{ event.requestId }}</td>
            </tr>
          </tbody>
        </table>
      </div></template
    >
  </main>
</template>
<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { getSystemDiagnostics } from "../../services/api.js";
import { useAuth } from "../../composables/useAuth.js";
const { user } = useAuth(),
  data = ref(null),
  error = ref(""),
  loading = ref(false);
let version = 0;
async function load() {
  const id = ++version,
    owner = user.value?.id;
  loading.value = true;
  try {
    const result = await getSystemDiagnostics();
    if (id === version && owner === user.value?.id) {
      data.value = result;
      error.value = "";
    }
  } catch (e) {
    if (id === version) {
      data.value = null;
      error.value = e.message;
    }
  } finally {
    if (id === version) loading.value = false;
  }
}
onMounted(load);
watch(
  () => user.value?.id,
  () => {
    ++version;
    data.value = null;
  },
);
onBeforeUnmount(() => ++version);
</script>
<style scoped>
.diagnostics {
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
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
}
.metrics article {
  display: grid;
  gap: 10px;
  padding: 20px;
  border: 1px solid #cbd5df;
  border-radius: 12px;
  background: #fff;
}
.metrics strong {
  font-size: 25px;
}
.table-wrap {
  overflow: auto;
  background: #fff;
  border: 1px solid #cbd5df;
  border-radius: 12px;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th,
td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
}
.primary {
  padding: 12px;
  background: #096e91;
  color: #fff;
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
}
@media (max-width: 600px) {
  .diagnostics {
    padding: 16px;
  }
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
