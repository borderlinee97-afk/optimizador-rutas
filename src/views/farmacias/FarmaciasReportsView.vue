<template>
  <main class="reports-page">
    <header class="report-hero">
      <div>
        <span class="eyebrow">FARMACIAS · CONTROL DE EJECUCIÓN</span>
        <h1>
          {{
            mode === 'reports'
              ? 'Reportes de actividad'
              : 'Indicadores de operación'
          }}
        </h1>
        <p>Visitas, cobertura y tiempo registrado por tu equipo.</p>
      </div>
      <div class="hero-actions">
        <button :disabled="loading" @click="loadReport()">
          {{ loading ? 'Consultando…' : 'Actualizar' }}</button
        ><button
          :disabled="!report || loading || exporting"
          @click="downloadPdf"
        >
          PDF resumen
        </button>
      </div>
    </header>
    <nav class="module-tabs" aria-label="Módulos de seguimiento">
      <RouterLink
        to="/farmacias/indicadores"
        :class="{ selected: mode === 'indicators' }"
        >Indicadores</RouterLink
      ><RouterLink
        to="/farmacias/reportes"
        :class="{ selected: mode === 'reports' }"
        >Reportes e historial</RouterLink
      >
    </nav>
    <section class="filter-card" aria-label="Filtros del reporte">
      <div class="presets">
        <span>Consultar a hoy</span
        ><button
          v-for="p in presets"
          :key="p.key"
          @click="usePreset(p.key)"
          :disabled="loading"
        >
          {{ p.name }}
        </button>
      </div>
      <form @submit.prevent="loadReport()" class="filter-grid">
        <label
          >Desde<input
            v-model="filters.startDate"
            type="date"
            required
            :disabled="loading" /></label
        ><label
          >Hasta<input
            v-model="filters.endDate"
            type="date"
            required
            :disabled="loading"
        /></label>
        <label
          >Coordinación<select
            v-model="filters.coordinatorId"
            :disabled="loading"
          >
            <option value="">Toda mi estructura</option>
            <option v-for="p in options.coordinators" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select></label
        >
        <label
          >Supervisor / persona<select
            v-model="filters.personId"
            :disabled="loading"
          >
            <option value="">Todo el personal</option>
            <option v-for="p in eligiblePeople" :key="p.id" :value="p.id">
              {{ p.name }}{{ p.role === 'COORDINADOR' ? ' · Coordinador' : '' }}
            </option>
          </select></label
        >
        <label
          >Proyecto<select v-model="filters.project" :disabled="loading">
            <option value="">Todos</option>
            <option v-for="v in options.projects" :key="v">{{ v }}</option>
          </select></label
        >
        <label
          >Jurisdicción<select
            v-model="filters.jurisdiction"
            :disabled="loading"
          >
            <option value="">Todas</option>
            <option v-for="v in options.jurisdictions" :key="v">{{ v }}</option>
          </select></label
        >
        <label
          >Entidad<select v-model="filters.state" :disabled="loading">
            <option value="">Todas</option>
            <option v-for="v in options.states" :key="v">{{ v }}</option>
          </select></label
        >
        <div class="filter-actions">
          <button class="primary" :disabled="loading">Consultar</button
          ><button type="button" @click="resetFilters" :disabled="loading">
            Limpiar
          </button>
        </div>
      </form>
      <p v-if="dirty && report" class="filter-hint">
        Hay filtros pendientes de aplicar. Presiona Consultar.
      </p>
    </section>
    <div v-if="error" class="message error" role="alert">{{ error }}</div>
    <div v-if="loading" class="message" role="status">
      Consultando registros de ejecución…
    </div>
    <template v-if="report && !loading">
      <div class="report-cut">
        <strong
          >{{ report.period.startDate }} a {{ report.period.endDate }}</strong
        ><span
          >Corte: {{ formatRecordedAt(report.generatedAt) }} · Hora
          Guadalajara</span
        >
      </div>
      <section class="kpi-grid" aria-label="Resumen de indicadores">
        <article
          v-for="(k, i) in kpis"
          :key="k.label"
          class="kpi"
          :class="{ blue: i === 0 }"
        >
          <span>{{ k.label }}</span
          ><strong>{{ k.value }}</strong
          ><small>{{ k.note }}</small>
        </article>
      </section>
      <div class="context-strip">
        <span
          >{{ report.summary.temporaryAssigned }} farmacias en cobertura
          temporal</span
        ><span>{{ report.summary.coverageVisits }} visitas por cobertura</span
        ><span
          >{{ report.summary.vacationDays }} días-persona de vacaciones
          aprobadas</span
        ><span>{{ report.summary.inProgress }} visitas en curso</span>
      </div>
      <div
        v-if="
          report.summary.missingTimes ||
          report.summary.longVisits ||
          report.daily.some((d) => d.overlaps)
        "
        class="message attention"
      >
        Calidad del registro: {{ report.summary.missingTimes }} finalizadas sin
        entrada/salida válidas; {{ report.summary.longVisits }} visitas de más
        de 12 horas.<span v-if="report.daily.some((d) => d.overlaps)">
          Hay marcas superpuestas: el tiempo se cuenta una sola vez por
          persona.</span
        >
      </div>
      <template v-if="mode === 'indicators'">
        <section class="panel">
          <div class="section-title">
            <div>
              <h2>Visitas finalizadas por día</h2>
              <p>
                {{
                  chart.length > 31
                    ? 'Últimos 31 días del intervalo'
                    : 'Fechas del intervalo consultado'
                }}
              </p>
            </div>
            <span class="subtle"
              >{{ n(report.summary.completedVisits) }} en el periodo
              completo</span
            >
          </div>
          <div
            class="bar-chart"
            role="img"
            aria-label="Visitas finalizadas por fecha"
          >
            <div
              v-for="d in chart.slice(-31)"
              :key="d.date"
              class="bar-column"
              :title="`${d.date}: ${d.visits} visitas`"
            >
              <span class="bar-value">{{ d.visits || '' }}</span>
              <div
                class="bar"
                :style="{
                  height: Math.max(2, (d.visits / chartMax) * 110) + 'px',
                }"
              ></div>
              <small>{{ d.date.slice(8) }}</small>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="section-title">
            <div>
              <h2>Seguimiento por persona</h2>
              <p>
                Las vacaciones y coberturas explican variaciones entre periodos.
              </p>
            </div>
            <button :disabled="exporting" @click="downloadCsv('people')">
              CSV de personal
            </button>
          </div>
          <FarmaciasReportTable
            :columns="peopleColumns"
            :rows="peopleRows"
            @action="tableAction"
          />
        </section>
        <section class="panel">
          <div class="section-title">
            <h2>Distribución territorial y coordinación</h2>
            <select v-model="groupBy" aria-label="Agrupar indicadores">
              <option value="project">Por proyecto</option>
              <option value="jurisdiction">Por jurisdicción</option>
              <option value="coordinator">Por coordinador</option>
            </select>
          </div>
          <p v-if="groupBy === 'coordinator'" class="subtle group-note">
            Puebla puede aparecer en ambas coordinaciones por su supervisión
            compartida. Estos grupos no deben sumarse entre sí; el total general
            no duplica personas.
          </p>
          <FarmaciasReportTable :columns="groupColumns" :rows="groupRows" />
        </section>
      </template>
      <section class="panel">
        <div class="section-title">
          <div>
            <h2>Reportes e historial</h2>
            <p>Detalle registrado y unidades atendidas por cobertura.</p>
          </div>
          <button :disabled="exporting" @click="downloadCsv(csvDataset)">
            {{ exporting ? 'Preparando…' : 'Exportar CSV' }}
          </button>
        </div>
        <div class="detail-tabs" role="group" aria-label="Detalle del reporte">
          <button
            v-for="t in detailTabs"
            :key="t.key"
            :class="{ selected: tab === t.key }"
            @click="tab = t.key"
          >
            {{ t.name }}
          </button>
        </div>
        <div v-if="tab === 'periods'" class="period-kind">
          <label
            >Comparar por
            <select v-model="periodKind">
              <option value="weekly">Semana</option>
              <option value="fortnightly">Quincena</option>
              <option value="monthly">Mes</option>
            </select></label
          ><small>Los extremos se limitan a las fechas consultadas.</small>
        </div>
        <FarmaciasReportTable
          :columns="detailColumns"
          :rows="detailRows"
          @action="tableAction"
        />
        <div v-if="tab === 'visits'" class="pagination">
          <span
            >{{ report.pagination.total }} registros, incluyendo apoyos
            temporales autorizados</span
          >
          <div>
            <button
              :disabled="report.pagination.page <= 1"
              @click="changePage(-1)"
            >
              Anterior</button
            ><span
              >{{ report.pagination.page }} /
              {{
                Math.max(
                  1,
                  Math.ceil(
                    report.pagination.total / report.pagination.pageSize
                  )
                )
              }}</span
            ><button
              :disabled="
                report.pagination.page * report.pagination.pageSize >=
                report.pagination.total
              "
              @click="changePage(1)"
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>
      <details class="methodology">
        <summary>Cómo leer los indicadores</summary>
        <ul>
          <li>
            El 100% corresponde a las farmacias con asignación titular vigente
            en algún momento del intervalo, una sola vez por unidad. Las
            asignaciones temporales se muestran aparte.
          </li>
          <li>
            La cobertura propia cuenta farmacias visitadas por su titular
            durante la vigencia de su asignación. La cobertura con apoyo también
            reconoce visitas finalizadas de quien tuvo una cobertura temporal
            autorizada.
          </li>
          <li>
            Las visitas finalizadas se atribuyen a la fecha de salida. El tiempo
            se reparte por día local al cruzar medianoche y no suma intervalos
            superpuestos de la misma persona.
          </li>
          <li>
            Tiempo en unidades es permanencia registrada, no jornada laboral ni
            tiempo de traslado. Una entrada sin salida no genera horas
            estimadas.
          </li>
          <li>
            Se consultan planes aprobados y su historial archivado. Sólo
            aparecen registros sincronizados; lo pendiente en el celular aún no
            se incluye.
          </li>
          <li>
            Las vacaciones son las aprobadas y registradas en el sistema, en
            días calendario. No sustituyen ni eliminan visitas.
          </li>
          <li>
            Las revisitas se cuentan dentro de cada intervalo mostrado. CEDIS y
            paradas sin farmacia vinculada no incrementan la cobertura.
          </li>
        </ul>
      </details>
    </template>
    <dialog ref="historyDialog" class="history-dialog" @close="closeHistory">
      <div class="section-title">
        <div>
          <span class="eyebrow">HISTORIAL POR UNIDAD</span>
          <h2>{{ historyUnit?.name }}</h2>
          <p>
            {{ applied.startDate }} a {{ applied.endDate }} ·
            {{ historyUnit?.clues }}
          </p>
        </div>
        <button @click="historyDialog.close()">Cerrar</button>
      </div>
      <p v-if="historyLoading">Consultando historial…</p>
      <p v-if="historyError" role="alert" class="warning-text">
        {{ historyError }}
      </p>
      <template v-if="history"
        ><p>
          {{ history.pagination.total }} registros. Se identifica al visitante
          efectivo y su cobertura.
        </p>
        <FarmaciasReportTable :columns="historyColumns" :rows="historyRows" />
        <div class="pagination">
          <button
            :disabled="historyLoading || history.pagination.page <= 1"
            @click="loadHistory(history.pagination.page - 1)"
          >
            Anterior</button
          ><span>Página {{ history.pagination.page }}</span
          ><button
            :disabled="
              historyLoading ||
              history.pagination.page * history.pagination.pageSize >=
                history.pagination.total
            "
            @click="loadHistory(history.pagination.page + 1)"
          >
            Siguiente
          </button>
        </div></template
      >
    </dialog>
  </main>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import FarmaciasReportTable from '../../components/FarmaciasReportTable.vue'
import {
  getFarmaciasReportOptions,
  getFarmaciasReport,
  getFarmaciasReportExport,
} from '../../services/api.js'
import {
  formatRecordedAt,
  formatPresence,
  formatPercent,
  reportPreset,
  downloadReportFile,
  exportReportPdf,
} from '../../utils/farmaciasReports.js'
defineProps({ mode: { type: String, default: 'indicators' } })
const initial = () => ({
  ...reportPreset('monthly'),
  coordinatorId: '',
  personId: '',
  project: '',
  jurisdiction: '',
  state: '',
})
const filters = ref(initial()),
  applied = ref({ ...filters.value }),
  options = ref({
    people: [],
    coordinators: [],
    projects: [],
    jurisdictions: [],
    states: [],
  })
const report = ref(null),
  loading = ref(false),
  exporting = ref(false),
  error = ref(''),
  groupBy = ref('project'),
  tab = ref('visits'),
  periodKind = ref('weekly')
const historyDialog = ref(null),
  historyUnit = ref(null),
  history = ref(null),
  historyLoading = ref(false),
  historyError = ref('')
let sequence = 0,
  historySequence = 0,
  alive = true,
  optionsLoaded = false
const presets = [
  { key: 'weekly', name: 'Semana' },
  { key: 'fortnightly', name: 'Quincena' },
  { key: 'monthly', name: 'Mes' },
  { key: 'previousMonth', name: 'Mes anterior' },
]
const detailTabs = [
  { key: 'visits', name: 'Visitas' },
  { key: 'daily', name: 'Jornada registrada' },
  { key: 'units', name: 'Farmacias / historial' },
  { key: 'periods', name: 'Semana · quincena · mes' },
  { key: 'coverage', name: 'Coberturas' },
  { key: 'vacations', name: 'Vacaciones' },
]
const eligiblePeople = computed(() =>
  options.value.people.filter(
    (p) =>
      !filters.value.coordinatorId ||
      p.id === filters.value.coordinatorId ||
      p.coordinatorIds.includes(filters.value.coordinatorId)
  )
)
watch(
  () => filters.value.coordinatorId,
  () => {
    if (
      filters.value.personId &&
      !eligiblePeople.value.some((p) => p.id === filters.value.personId)
    )
      filters.value.personId = ''
  }
)
const dirty = computed(
  () => JSON.stringify(filters.value) !== JSON.stringify(applied.value)
)
const csvDataset = computed(
  () =>
    ({
      units: 'units',
      daily: 'daily',
      vacations: 'vacations',
      coverage: 'coverages',
      periods: periodKind.value,
    })[tab.value] || 'visits'
)
const chart = computed(() => {
  if (!report.value) return []
  const counts = new Map()
  for (const d of report.value.daily)
    counts.set(d.date, (counts.get(d.date) || 0) + d.completedVisits)
  const result = []
  for (
    let d = new Date(report.value.period.startDate + 'T12:00:00Z');
    d.toISOString().slice(0, 10) <= report.value.period.endDate;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const date = d.toISOString().slice(0, 10)
    result.push({ date, visits: counts.get(date) || 0 })
  }
  return result
})
const chartMax = computed(() =>
  Math.max(1, ...chart.value.slice(-31).map((d) => d.visits))
)
const n = (v) => Number(v || 0).toLocaleString('es-MX')
const unitLabel = (v) =>
  ({ PHARMACY: 'Farmacia', CEDIS: 'CEDIS', EXTRA_STOP: 'Parada adicional' })[
    v
  ] || v
const statusLabel = (v) =>
  ({
    DONE: 'Finalizada',
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En curso',
    SKIPPED: 'Omitida',
    CANCELLED: 'Cancelada',
    RESCHEDULED: 'Reprogramada',
  })[v] || v
const cell = (text, secondary = [], extra = {}) => ({
  text,
  secondary: secondary.filter((v) => v !== null && v !== undefined && v !== ''),
  ...extra,
})
const row = (id, cells) => ({ id, cells })
const kpis = computed(() => {
  if (!report.value) return []
  const s = report.value.summary
  return [
    {
      label: 'Visitas finalizadas',
      value: n(s.completedVisits),
      note: `${s.pharmacyVisits} a farmacias · ${s.warehouseVisits} a CEDIS · ${s.extraStops} adicionales`,
    },
    {
      label: 'Cobertura propia',
      value: formatPercent(s.personalCoveragePct),
      note: `${s.visitedAssigned} de ${s.assignedPharmacies} farmacias asignadas visitadas por su titular`,
    },
    {
      label: 'Cobertura con apoyo',
      value: formatPercent(s.serviceCoveragePct),
      note: `${s.servicedAssigned} atendidas entre titular y cobertura temporal · ${s.unvisitedAssigned} sin visita`,
    },
    {
      label: 'Tiempo efectivo en unidades',
      value: formatPresence(s.effectiveSeconds),
      note: 'Entrada a salida, sin sumar marcas superpuestas',
    },
    {
      label: 'Revisitas del personal',
      value: n(s.repeatVisits),
      note: 'Visitas adicionales a la primera por persona y farmacia en el intervalo',
    },
    {
      label: 'Cumplimiento del plan',
      value: formatPercent(s.planCompliancePct),
      note: `${s.completedPlanned} de ${s.plannedVisits} visitas planeadas finalizadas al cierre`,
    },
  ]
})
const peopleColumns = [
  'Persona / coordinación',
  'Asignadas',
  'Cobertura propia',
  'Con apoyo',
  'Visitas',
  'Revisitas',
  'Tiempo en unidades',
  'Vacaciones',
]
const peopleRows = computed(
  () =>
    report.value?.people.map((p) =>
      row(p.id, [
        cell(
          p.name,
          [
            p.role === 'COORDINADOR'
              ? 'Coordinador'
              : p.coordinatorNames.join(' / ') || 'Sin coordinador directo',
          ],
          { action: 'person', id: p.id }
        ),
        cell(p.assignedPharmacies, [`+ ${p.temporaryAssigned} temporales`]),
        cell(formatPercent(p.personalCoveragePct), [
          `${p.visitedAssigned} propias visitadas`,
        ]),
        cell(formatPercent(p.serviceCoveragePct), [
          `${p.servicedAssigned} atendidas`,
        ]),
        cell(p.completedVisits, [`${p.coverageVisits} por cobertura`]),
        p.repeatVisits,
        formatPresence(p.effectiveSeconds),
        cell(
          `${p.vacationDays} días`,
          p.vacations.map((v) => `${v.start_date} a ${v.end_date}`),
          { tone: p.vacationDays ? 'vacation' : null }
        ),
      ])
    ) || []
)
const groupColumns = [
  'Grupo',
  'Visitas',
  'Asignadas',
  'Cobertura propia',
  'Con apoyo',
  'Tiempo en unidades',
]
const groupRows = computed(
  () =>
    report.value?.groups[groupBy.value].map((g) =>
      row(g.name, [
        g.name,
        g.completedVisits,
        g.assignedPharmacies,
        formatPercent(g.personalCoveragePct),
        formatPercent(g.serviceCoveragePct),
        formatPresence(g.effectiveSeconds),
      ])
    ) || []
)
const columns = {
  visits: [
    'Persona / unidad',
    'Tipo y procedencia',
    'Planeada',
    'Entrada',
    'Salida',
    'Permanencia',
    'Estado / actividades',
    'Plan',
  ],
  daily: [
    'Fecha',
    'Persona',
    'Primera entrada',
    'Última salida',
    'Finalizadas',
    'Tiempo en unidades',
    'Contexto',
  ],
  units: [
    'Farmacia / CLUES',
    'Proyecto / jurisdicción',
    'Titulares en el periodo',
    'Visitas',
    'Por cobertura',
    'Última visita',
    'Historial',
  ],
  periods: [
    'Intervalo',
    'Visitas',
    'Farmacias únicas',
    'Revisitas',
    'Cobertura propia',
    'Con apoyo',
    'Tiempo en unidades',
    'Vacaciones',
  ],
  coverage: [
    'Farmacia / CLUES',
    'Titular',
    'Persona que cubre',
    'Desde',
    'Hasta',
    'Cancelación',
  ],
  vacations: ['Persona', 'Inicio autorizado', 'Fin autorizado', 'Estatus'],
}
const detailColumns = computed(() => columns[tab.value])
const detailRows = computed(() => {
  const r = report.value
  if (!r) return []
  if (tab.value === 'visits')
    return r.visits.map((v) =>
      row(v.id, [
        cell(v.personName, [
          v.name,
          `${v.clues || ''} · ${v.project || 'Sin proyecto'} · ${v.jurisdiction || 'Sin jurisdicción'}`,
        ]),
        cell(unitLabel(v.unitKind), [
          v.source === 'SUPERVISOR_ADHOC' ? 'Adicional' : 'Plan',
          v.coverageId
            ? `Cobertura temporal${v.coverageTitular ? ' de ' + v.coverageTitular : ''}`
            : null,
        ]),
        cell(v.scheduledDate, [
          v.scheduledTime?.slice(0, 5) || 'Sin hora planeada',
        ]),
        formatRecordedAt(v.checkInAt),
        formatRecordedAt(v.checkOutAt),
        cell(formatPresence(v.dwellSeconds), [v.executionIssue]),
        cell(
          statusLabel(v.status),
          [
            `${v.activities.filter((a) => a.status === 'DONE').length} / ${v.activities.length} actividades completadas`,
          ],
          {
            tone:
              v.status === 'DONE'
                ? 'done'
                : v.status === 'IN_PROGRESS'
                  ? 'progress'
                  : null,
            details: [
              v.notes,
              v.skipReason && `Omisión: ${v.skipReason}`,
              ...v.activities.map(
                (a) =>
                  `${a.name} · ${statusLabel(a.status)}${a.completedAt ? ' · ' + formatRecordedAt(a.completedAt) : ''}${a.executionNote ? ' · ' + a.executionNote : ''}${a.skipReason ? ' · ' + a.skipReason : ''}`
              ),
            ].filter(Boolean),
          }
        ),
        v.externalCoverage
          ? 'Apoyo temporal externo'
          : cell('Ver plan', [], { link: `/farmacias/planes/${v.planId}` }),
      ])
    )
  if (tab.value === 'daily')
    return r.daily.map((d) =>
      row(d.personId + d.date, [
        d.date,
        d.name,
        formatRecordedAt(d.firstCheckIn),
        formatRecordedAt(d.lastCheckOut),
        d.completedVisits,
        formatPresence(d.effectiveSeconds),
        cell(
          d.vacation ? 'Vacaciones aprobadas' : '—',
          [d.overlaps ? 'Marcas superpuestas: tiempo conciliado' : null],
          { tone: d.vacation ? 'vacation' : null }
        ),
      ])
    )
  if (tab.value === 'units')
    return r.units.map((u) =>
      row(u.id, [
        cell(u.name, [u.clues]),
        cell(u.project, [u.jurisdiction]),
        cell(
          u.owners.join(' / ') || 'Atención por cobertura / visita adicional',
          u.temporaryVisitors.length
            ? ['Apoyo: ' + u.temporaryVisitors.join(' / ')]
            : []
        ),
        cell(u.visits, [], { tone: u.visits ? 'done' : 'vacation' }),
        u.coverageVisits,
        cell(formatRecordedAt(u.lastVisitedAt), [u.visitors.join(' / ')]),
        cell('Ver quién la visitó', [], { action: 'unit', id: u.id }),
      ])
    )
  if (tab.value === 'periods')
    return r.periods[periodKind.value].map((p) =>
      row(p.startDate, [
        `${p.startDate} a ${p.endDate}`,
        p.completedVisits,
        p.uniquePharmacies,
        p.repeatVisits,
        formatPercent(p.personalCoveragePct),
        formatPercent(p.serviceCoveragePct),
        formatPresence(p.effectiveSeconds),
        `${p.vacationDays} días-persona`,
      ])
    )
  if (tab.value === 'coverage')
    return r.coverages.map((c) =>
      row(c.id, [
        cell(c.unit_name, [c.clues]),
        c.titular_name || 'Sin titular',
        c.covering_name,
        c.start_date,
        c.end_date,
        formatRecordedAt(c.cancelled_at),
      ])
    )
  return r.vacations.map((v) =>
    row(v.id, [
      v.name,
      v.start_date,
      v.end_date,
      cell('Aprobadas', [], { tone: 'vacation' }),
    ])
  )
})
const historyColumns = [
  'Visitante',
  'Entrada',
  'Salida',
  'Permanencia',
  'Tipo de atención',
  'Estado',
]
const historyRows = computed(
  () =>
    history.value?.visits.map((v) =>
      row(v.id, [
        v.personName,
        formatRecordedAt(v.checkInAt),
        formatRecordedAt(v.checkOutAt),
        formatPresence(v.dwellSeconds),
        cell(
          v.coverageId ? 'Cobertura temporal' : 'Visita propia / adicional',
          v.coverageTitular ? ['Titular: ' + v.coverageTitular] : []
        ),
        statusLabel(v.status),
      ])
    ) || []
)
async function loadReport(page = 1) {
  const current = ++sequence
  loading.value = true
  error.value = ''
  const request = page === 1 ? { ...filters.value } : { ...applied.value }
  try {
    if (!optionsLoaded) {
      const value = await getFarmaciasReportOptions()
      if (!alive || current !== sequence) return
      options.value = value
      optionsLoaded = true
    }
    const result = await getFarmaciasReport({ ...request, page, pageSize: 50 })
    if (!alive || current !== sequence) return
    report.value = result
    applied.value = request
  } catch (e) {
    if (alive && current === sequence) {
      error.value = e.message || 'No fue posible consultar el reporte.'
      report.value = null
    }
  } finally {
    if (alive && current === sequence) loading.value = false
  }
}
function usePreset(kind) {
  filters.value = { ...filters.value, ...reportPreset(kind) }
  loadReport()
}
function resetFilters() {
  filters.value = initial()
  loadReport()
}
function tableAction(action) {
  if (action.kind === 'person') {
    filters.value.personId = action.id
    loadReport()
  } else {
    const u = report.value.units.find((u) => u.id === action.id)
    if (u) showUnit(u)
  }
}
function changePage(delta) {
  loadReport(report.value.pagination.page + delta)
}
async function downloadCsv(dataset) {
  exporting.value = true
  error.value = ''
  try {
    const r = await getFarmaciasReportExport(applied.value, dataset)
    if (alive) downloadReportFile(r.csv, r.filename)
  } catch (e) {
    if (alive) error.value = e.message
  } finally {
    if (alive) exporting.value = false
  }
}
async function downloadPdf() {
  exporting.value = true
  error.value = ''
  try {
    await exportReportPdf(report.value, {
      ...applied.value,
      coordinatorName: options.value.coordinators.find(
        (p) => p.id === applied.value.coordinatorId
      )?.name,
    })
  } catch {
    if (alive) error.value = 'No fue posible preparar el PDF.'
  } finally {
    if (alive) exporting.value = false
  }
}
async function showUnit(unit) {
  historyUnit.value = unit
  history.value = null
  historyDialog.value.showModal()
  await loadHistory(1)
}
function closeHistory() {
  history.value = null
  ++historySequence
  historyLoading.value = false
}
async function loadHistory(page) {
  const current = ++historySequence
  historyLoading.value = true
  historyError.value = ''
  try {
    const r = await getFarmaciasReport({
      ...applied.value,
      pharmacyId: historyUnit.value.id,
      page,
      pageSize: 50,
    })
    if (alive && current === historySequence) history.value = r
  } catch (e) {
    if (alive && current === historySequence) historyError.value = e.message
  } finally {
    if (alive && current === historySequence) historyLoading.value = false
  }
}
onMounted(() => loadReport())
onUnmounted(() => {
  alive = false
  ++sequence
  ++historySequence
})
</script>
<style scoped>
.reports-page {
  max-width: 1550px;
  margin: auto;
  padding: 28px 32px 48px;
  color: #20334c;
  font-family: inherit;
}
.report-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 26px 28px;
  background: linear-gradient(115deg, #14263f, #254b77);
  border-radius: 16px;
  color: #fff;
}
.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  opacity: 0.85;
}
.report-hero h1 {
  font-size: 28px;
  line-height: 1.2;
  margin: 9px 0;
}
.report-hero p {
  margin: 0;
  color: #c6d7ed;
  font-size: 14px;
}
.hero-actions {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
}
.reports-page button,
.reports-page select,
.reports-page input {
  font: inherit;
  font-size: 13px;
}
.reports-page button {
  border: 1px solid #d6e1ef;
  border-radius: 8px;
  padding: 9px 12px;
  background: white;
  color: #255486;
  cursor: pointer;
  font-weight: 650;
}
.reports-page button:hover:not(:disabled) {
  background: #edf4fe;
  border-color: #92b7e6;
}
.reports-page button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.reports-page button:focus-visible,
.reports-page a:focus-visible,
.reports-page select:focus-visible,
.reports-page input:focus-visible {
  outline: 3px solid #77aaff;
  outline-offset: 2px;
}
.hero-actions button {
  background: #ffffff13;
  color: white;
  border-color: #ffffff45;
}
.hero-actions button:hover:not(:disabled) {
  background: #ffffff27;
  color: white;
}
.module-tabs {
  display: flex;
  gap: 24px;
  margin: 20px 0;
  border-bottom: 1px solid #dae3ee;
}
.module-tabs a {
  color: #65778e;
  text-decoration: none;
  padding: 12px 0;
  font-weight: 700;
  border-bottom: 3px solid transparent;
}
.module-tabs a.selected {
  color: #245fa4;
  border-bottom-color: #245fa4;
}
.filter-card,
.panel {
  background: white;
  border: 1px solid #dce5ef;
  border-radius: 13px;
  padding: 20px;
  margin: 18px 0;
  box-shadow: 0 3px 10px #19345504;
}
.presets {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.presets > span {
  font-size: 12px;
  color: #61748b;
  margin-right: 8px;
}
.presets button {
  padding: 6px 11px;
  background: #f6f9fd;
  font-size: 12px;
}
.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 15px;
}
.filter-grid label {
  font-size: 12px;
  font-weight: 700;
  color: #52667f;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.reports-page input,
.reports-page select {
  min-width: 0;
  width: 100%;
  padding: 10px;
  border: 1px solid #d6e1ef;
  border-radius: 8px;
  background: #fff;
  color: #20334c;
  box-sizing: border-box;
}
.filter-actions {
  display: flex;
  align-items: end;
  gap: 8px;
}
.reports-page .primary {
  background: #2867b2;
  color: white;
  border-color: #2867b2;
}
.reports-page .primary:hover:not(:disabled) {
  background: #245794;
}
.filter-hint {
  font-size: 12px;
  color: #9a5d14;
  margin: 15px 0 0;
}
.report-cut {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  align-items: center;
  margin: 22px 0 15px;
  font-size: 13px;
}
.report-cut span {
  color: #697b91;
  font-size: 12px;
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 15px;
}
.kpi {
  background: white;
  border: 1px solid #dce5ef;
  border-radius: 13px;
  padding: 20px;
  border-top: 3px solid #9eb9d7;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.kpi > span {
  font-size: 13px;
  color: #5f7189;
  font-weight: 650;
}
.kpi strong {
  font-size: 29px;
  line-height: 1.2;
  color: #193a62;
}
.kpi small {
  font-size: 12px;
  color: #65768a;
  line-height: 1.5;
}
.kpi.blue {
  background: #f1f6ff;
  border-top-color: #2867b2;
}
.context-strip {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  margin: 14px 0 20px;
}
.context-strip span {
  background: #eef3f9;
  border: 1px solid #dce5ef;
  border-radius: 20px;
  padding: 7px 12px;
  font-size: 12px;
  color: #4f6682;
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 17px;
}
.section-title h2 {
  font-size: 18px;
  line-height: 1.4;
  margin: 0;
  color: #213a59;
}
.section-title p,
.subtle {
  color: #697b91;
  font-size: 12px;
  line-height: 1.5;
  margin: 5px 0 0;
}
.section-title select {
  max-width: 240px;
}
.group-note {
  margin-bottom: 14px;
}
.message {
  padding: 15px 18px;
  border: 1px solid #d7e5f8;
  background: #f1f6ff;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  margin: 18px 0;
}
.message.error {
  background: #fff3f2;
  color: #9e302b;
  border-color: #f3d1ce;
}
.message.attention {
  background: #fff9ee;
  color: #896022;
  border-color: #efe0c4;
}
.warning-text {
  color: #a75124 !important;
}
.detail-tabs {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.detail-tabs button {
  border-color: transparent;
  background: #f2f5fa;
  color: #60748c;
  font-size: 12px;
}
.detail-tabs button.selected {
  background: #e5effe;
  color: #235eaa;
  border-color: #bbd2f2;
}
.pagination {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  font-size: 12px;
  color: #60758e;
}
.pagination > div {
  display: flex;
  align-items: center;
  gap: 12px;
}
.period-kind {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  margin: 16px 0;
}
.period-kind select {
  width: auto;
  margin-left: 10px;
}
.period-kind small {
  color: #6d7f96;
}
.methodology {
  border: 1px solid #dce5ef;
  border-radius: 10px;
  padding: 16px 20px;
  background: #fafcff;
  font-size: 12px;
  color: #5a708b;
  line-height: 1.8;
}
.methodology summary {
  cursor: pointer;
  color: #3a659b;
  font-weight: 650;
}
.methodology ul {
  padding-left: 18px;
}
.bar-chart {
  height: 156px;
  display: flex;
  gap: 5px;
  align-items: flex-end;
  border-bottom: 1px solid #dce5ef;
  padding-top: 10px;
}
.bar-column {
  flex: 1;
  min-width: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  height: 150px;
}
.bar {
  width: 100%;
  max-width: 40px;
  min-height: 2px;
  background: linear-gradient(#4d8cce, #2763aa);
  border-radius: 4px 4px 0 0;
}
.bar-value {
  font-size: 10px;
  color: #456487;
}
.bar-column small {
  font-size: 10px;
  color: #71849d;
}
.history-dialog {
  border: 1px solid #d4dfec;
  border-radius: 15px;
  padding: 24px;
  max-width: 1100px;
  width: 90vw;
  max-height: 85vh;
  color: #20334c;
  background: white;
  box-shadow: 0 30px 90px #132b4a33;
}
.history-dialog::backdrop {
  background: #10253d80;
}
.history-dialog > p {
  font-size: 13px;
}
.history-dialog .eyebrow {
  color: #49749f;
}
.history-dialog h2 {
  margin: 7px 0;
}
@media (max-width: 1050px) {
  .reports-page {
    padding: 20px;
  }
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .report-hero {
    padding: 22px;
  }
  .report-hero h1 {
    font-size: 24px;
  }
}
@media (max-width: 640px) {
  .reports-page {
    padding: 12px;
  }
  .report-hero {
    align-items: start;
    flex-direction: column;
  }
  .filter-grid,
  .kpi-grid {
    grid-template-columns: 1fr;
  }
  .report-cut,
  .section-title,
  .pagination {
    flex-wrap: wrap;
  }
  .report-cut {
    align-items: start;
    flex-direction: column;
  }
  .panel {
    padding: 14px;
  }
  .kpi strong {
    font-size: 27px;
  }
  .module-tabs {
    gap: 18px;
    font-size: 14px;
  }
  .bar-column small {
    font-size: 8px;
  }
  .history-dialog {
    padding: 15px;
  }
  .section-title h2 {
    font-size: 17px;
  }
}
</style>
