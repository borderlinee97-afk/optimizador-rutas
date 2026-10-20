<template>
  <section class="followup">
    <header>
      <div>
        <h2>Seguimiento de visitas</h2>
        <p>
          Asignaciones del periodo. Una visita completada por cobertura
          autorizada cuenta como atención de la farmacia.
        </p>
      </div>
    </header>
    <nav>
      <button :class="{ selected: tab === 'pending' }" @click="tab = 'pending'">
        Farmacias pendientes ({{ data.pending.length }})</button
      ><button
        :class="{ selected: tab === 'comparison' }"
        @click="tab = 'comparison'"
      >
        Planeado contra realizado
      </button>
    </nav>
    <button
      :disabled="exporting"
      @click="emit('export', tab === 'pending' ? 'pending' : 'planned')"
    >
      Exportar esta tabla CSV
    </button>
    <template v-if="tab === 'pending'">
      <label
        >Buscar farmacia o responsable
        <input
          v-model="search"
          type="search"
          placeholder="Nombre, CLUES, supervisor…"
      /></label>
      <p class="hint">
        Pendientes de atención en el intervalo, no necesariamente vencidas. Las
        vacaciones no eliminan asignaciones. La última visita corresponde a los
        registros autorizados hasta el cierre del periodo.
      </p>
      <FarmaciasReportTable :columns="pendingColumns" :rows="pendingRows" />
      <p v-if="filtered.length > 100" class="hint">
        Se muestran {{ Math.min(limit, filtered.length) }} de
        {{ filtered.length }}.
        <button v-if="limit < filtered.length" @click="limit += 100">
          Mostrar otras 100
        </button>
      </p>
    </template>
    <template v-else>
      <p class="hint">
        Las canceladas y reprogramadas se muestran aparte. Vacaciones y
        coberturas aportan contexto; no se cambian planes ni metas
        automáticamente. Las finalizadas sin marcas válidas se señalan para
        revisión.
      </p>
      <FarmaciasReportTable
        :columns="comparisonColumns"
        :rows="comparisonRows"
      />
    </template>
  </section>
</template>
<script setup>
const emit = defineEmits(['export'])
import { computed, ref, watch } from 'vue'
import FarmaciasReportTable from './FarmaciasReportTable.vue'
import { formatRecordedAt } from '../utils/farmaciasReports.js'
const props = defineProps({
  data: { type: Object, required: true },
  exporting: Boolean,
})
const tab = ref('pending'),
  search = ref(''),
  limit = ref(100)
watch(search, () => (limit.value = 100))
const cell = (text, secondary = []) => ({ text: text ?? '—', secondary })
const periods = (xs) => xs.map((v) => `${v.startDate} a ${v.endDate}`)
const filtered = computed(() =>
  props.data.pending.filter((v) =>
    [v.name, v.clues, v.personName, v.jurisdiction]
      .join(' ')
      .toLocaleLowerCase('es')
      .includes(search.value.toLocaleLowerCase('es'))
  )
)
const pendingColumns = [
  'Farmacia / CLUES',
  'Responsable',
  'Última visita registrada',
  'Planeación',
  'Vacaciones / cobertura',
]
const pendingRows = computed(() =>
  filtered.value.slice(0, limit.value).map((v) => ({
    id: v.id,
    cells: [
      cell(v.name, [v.clues, v.project, v.jurisdiction].filter(Boolean)),
      v.personName,
      cell(
        v.lastVisitedAt
          ? formatRecordedAt(v.lastVisitedAt)
          : 'Sin visita registrada',
        v.daysSinceVisit != null
          ? [`${v.daysSinceVisit} días al cierre del periodo`]
          : []
      ),
      cell(
        v.plannedDates.length
          ? 'Programada'
          : 'Sin programación en el intervalo',
        v.plannedDates
      ),
      cell(
        v.vacations.length
          ? 'Vacaciones en el periodo'
          : 'Sin vacaciones aprobadas',
        [
          ...periods(v.vacations),
          ...v.coverages.map(
            (c) => `Cobertura: ${c.name} · ${c.startDate} a ${c.endDate}`
          ),
        ]
      ),
    ],
  }))
)
const comparisonColumns = [
  'Persona',
  'Programadas',
  'Realizadas',
  'Pendientes / en curso',
  'Omitidas / incidencias',
  'Canceladas / reprogramadas',
  'Adicionales / cobertura',
  'Contexto',
]
const comparisonRows = computed(() =>
  props.data.comparison.map((p) => ({
    id: p.personId,
    cells: [
      p.name,
      cell(p.planned, [`${p.activePlanned} vigentes`]),
      cell(p.completed, [
        `${p.completedLater || 0} realizadas después del cierre consultado`,
      ]),
      `${p.pending} / ${p.inProgress}`,
      cell(p.omitted, [
        `${p.missingTimes} finalizadas sin marcas válidas`,
        ...p.incidents.map((v) => `${v.date} · ${v.name}: ${v.reason}`),
      ]),
      `${p.cancelled} / ${p.rescheduled}`,
      `${p.additional} / ${p.coverageCompleted}`,
      cell(
        p.vacations.length
          ? 'Vacaciones aprobadas'
          : 'Sin vacaciones aprobadas',
        [
          ...periods(p.vacations),
          `${p.duringVacation} visitas programadas durante vacaciones`,
        ]
      ),
    ],
  }))
)
</script>
<style scoped>
.followup {
  background: #fff;
  border: 1px solid #dbe3ee;
  border-radius: 18px;
  padding: 24px;
  margin: 20px 0;
  color: #172b45;
}
.followup h2 {
  margin: 0;
  font-size: 21px;
}
.followup p {
  line-height: 1.5;
}
.followup nav {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 18px 0;
}
.followup button {
  font: inherit;
  padding: 9px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  background: #f4f7fb;
  color: #234166;
  cursor: pointer;
}
.followup button.selected {
  background: #234d7b;
  color: white;
}
.followup label {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.followup input {
  padding: 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
  min-width: 240px;
}
.hint {
  font-size: 13px;
  color: #475569;
}
</style>
