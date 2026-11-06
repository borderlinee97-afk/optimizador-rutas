<template>
  <main class="followup-page">
    <header class="page-header">
      <div>
        <span class="kicker">Control operativo</span>
        <h1>Seguimiento de visitas</h1>
        <p>
          Visitas anteriores no realizadas o sin finalizar. El trabajo de hoy
          puede continuar.
        </p>
      </div>
      <button class="primary" :disabled="loading" @click="load(0)">
        {{ loading ? "Actualizando…" : "Actualizar" }}
      </button>
    </header>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <section class="card followup-tools">
      <strong
        >{{ snapshot?.total ?? "—" }} requieren revisión o aclaración</strong
      ><label
        >Buscar en las visitas cargadas<input
          v-model="search"
          type="search"
          placeholder="Responsable, farmacia o fecha" /></label
      ><label
        >Estado<select v-model="status">
          <option value="">Todos</option>
          <option value="PENDING">No realizadas</option>
          <option value="IN_PROGRESS">Sin finalizar</option>
        </select></label
      >
    </section>
    <p v-if="loading && !snapshot" role="status">Cargando seguimiento…</p>
    <p v-else-if="snapshot && !snapshot.total" class="card" role="status">
      No hay visitas anteriores pendientes dentro de tu alcance.
    </p>
    <div class="followup-grid">
      <article v-for="visit in filtered" :key="visit.id" class="card">
        <span class="followup-status">{{ visit.reason }}</span>
        <h2>{{ visit.personName }}</h2>
        <strong>{{ visit.name }}</strong>
        <p>{{ visit.scheduledDate.split("-").reverse().join("/") }}</p>
        <p>Requiere revisión o aclaración</p>
        <RouterLink
          class="primary"
          :to="{
            name: 'farmacias-plan-detail',
            params: { planId: visit.planId },
          }"
          >Revisar plan</RouterLink
        >
      </article>
    </div>
    <p v-if="snapshot?.visits.length && !filtered.length" role="status">
      No hay coincidencias en las visitas cargadas.
    </p>
    <button
      v-if="snapshot?.hasMore"
      class="secondary"
      :disabled="loading"
      @click="load(snapshot.visits.length)"
    >
      Cargar más visitas
    </button>
    <p class="muted">
      Se muestran {{ snapshot?.visits.length || 0 }} de
      {{ snapshot?.total || 0 }} registros. Revisar un plan no cierra una visita
      ni cambia su cumplimiento.
    </p>
  </main>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { useAuth } from "../../composables/useAuth.js";
import { getVisitFollowUp } from "../../services/api.js";
const { user } = useAuth(),
  snapshot = ref(null),
  error = ref(""),
  loading = ref(false),
  search = ref(""),
  status = ref("");
let version = 0;
const filtered = computed(() =>
  (snapshot.value?.visits || []).filter(
    (v) =>
      (!status.value || v.status === status.value) &&
      `${v.personName} ${v.name} ${v.scheduledDate}`
        .toLocaleLowerCase("es")
        .includes(search.value.toLocaleLowerCase("es")),
  ),
);
async function load(offset = 0) {
  const request = ++version,
    owner = user.value?.id;
  loading.value = true;
  error.value = "";
  try {
    const result = await getVisitFollowUp({ offset });
    if (request !== version || owner !== user.value?.id) return;
    snapshot.value = {
      ...result,
      visits:
        offset && result.offset !== 0
          ? [...(snapshot.value?.visits || []), ...result.visits]
          : result.visits,
    };
  } catch (e) {
    if (request === version) {
      error.value = e.message || "No fue posible cargar el seguimiento.";
      if ([401, 403].includes(e.status)) snapshot.value = null;
    }
  } finally {
    if (request === version) loading.value = false;
  }
}
onMounted(() => load());
watch(
  () => user.value?.id,
  () => {
    ++version;
    snapshot.value = null;
    search.value = "";
    status.value = "";
    if (user.value) void load();
  },
);
onBeforeUnmount(() => ++version);
</script>
<style scoped>
.followup-page {
  padding: 28px;
  display: grid;
  gap: 18px;
  max-width: 1500px;
  margin: auto;
}
.page-header {
  display: flex;
  gap: 20px;
  justify-content: space-between;
  align-items: center;
}
.followup-tools {
  display: flex;
  gap: 20px;
  align-items: end;
  flex-wrap: wrap;
}
.followup-tools label {
  display: grid;
  gap: 7px;
  flex: 1;
  min-width: 180px;
}
.followup-tools input,
.followup-tools select {
  padding: 10px;
  border: 1px solid #9db3c3;
  border-radius: 8px;
  font: inherit;
}
.followup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 16px;
}
.card {
  padding: 20px;
  background: #fff;
  border: 1px solid #cbd5df;
  border-radius: 12px;
  box-shadow: 0 2px 0 #10233210;
}
.card h2 {
  font-size: 18px;
  margin: 12px 0 8px;
}
.followup-status {
  display: inline-block;
  padding: 5px 9px;
  background: #fff1cb;
  color: #754d00;
  border: 1px solid #e1be64;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
}
.primary,
.secondary {
  display: inline-block;
  padding: 11px 15px;
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid #096e91;
  cursor: pointer;
}
.primary {
  background: #096e91;
  color: #fff;
}
.secondary {
  background: #fff;
  color: #075671;
}
.muted {
  color: #435667;
}
.notice {
  padding: 14px;
  background: #fff1f2;
  color: #9f1239;
  border-radius: 8px;
}
button:disabled {
  opacity: 0.6;
}
@media (max-width: 600px) {
  .followup-page {
    padding: 16px;
  }
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
