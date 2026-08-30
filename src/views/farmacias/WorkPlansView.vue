<template>
  <main class="plans-page">
    <div class="plans-container">
      <header class="plans-header">
        <div>
          <span class="plans-kicker">
            {{ pageKicker }}
          </span>

          <h1>
            Planes de trabajo
          </h1>

          <p>
            Consulta los planes ordinarios semanales
            y la operación extraordinaria de tu estructura.
          </p>
        </div>

        <div
          v-if="states.length > 1"
          class="state-selector"
        >
          <label>
            Estado
          </label>

          <select
            v-model="selectedState"
            @change="handleStateChange"
          >
            <option
              v-for="state in states"
              :key="state.name"
              :value="state.name"
            >
              {{ state.name }}
            </option>
          </select>
        </div>
      </header>

      <!-- =============================================
           TIPO DE PLAN
      ============================================== -->

      <nav class="plan-tabs">
        <button
          type="button"
          :class="{
            active:
              mode ===
              'ORDINARY',
          }"
          @click="
            changeMode(
              'ORDINARY'
            )
          "
        >
          <span>
            Ordinarios
          </span>

          <small>
            Planeación semanal
          </small>
        </button>

        <button
          type="button"
          :class="{
            active:
              mode ===
              'EXTRAORDINARY',
          }"
          @click="
            changeMode(
              'EXTRAORDINARY'
            )
          "
        >
          <span>
            Extraordinarios
          </span>

          <small>
            Actividades excepcionales
          </small>
        </button>
      </nav>

      <!-- =============================================
           NAVEGACIÓN TEMPORAL
      ============================================== -->

      <section class="period-toolbar">
        <button
          type="button"
          class="period-arrow"
          @click="movePeriod(-1)"
        >
          ‹
        </button>

        <div class="period-copy">
          <span>
            {{
              mode ===
                'ORDINARY'
                ? 'Semana'
                : 'Mes'
            }}
          </span>

          <strong>
            {{ periodLabel }}
          </strong>
        </div>

        <button
          type="button"
          class="period-arrow"
          @click="movePeriod(1)"
        >
          ›
        </button>

        <button
          type="button"
          class="current-period-button"
          :disabled="isCurrentPeriod"
          @click="goCurrentPeriod"
        >
          {{
            mode ===
              'ORDINARY'
              ? 'Esta semana'
              : 'Este mes'
          }}
        </button>
      </section>

      <!-- =============================================
           ERROR / CARGA
      ============================================== -->

      <div
        v-if="error"
        class="message-box error"
      >
        <strong>
          No se pudieron cargar los planes
        </strong>

        <span>
          {{ error }}
        </span>

        <button
          type="button"
          @click="loadPlans"
        >
          Reintentar
        </button>
      </div>

      <div
        v-else-if="loading"
        class="message-box loading"
      >
        <div class="spinner"></div>

        <div>
          <strong>
            Cargando planes
          </strong>

          <span>
            Consultando la operación...
          </span>
        </div>
      </div>

      <template v-else>
        <!-- ===========================================
             MÉTRICAS ORDINARIAS
        ============================================ -->

        <section
          v-if="
            mode ===
            'ORDINARY'
          "
          class="metrics-grid six"
        >
          <MetricCard
            label="Supervisores"
            :value="
              totals.supervisorsCount
            "
            helper="Dentro de tu ámbito"
            variant="primary"
          />

          <MetricCard
            label="Aprobados"
            :value="
              totals.approvedCount
            "
            helper="Listos para ejecución"
          />

          <MetricCard
            label="Pendientes"
            :value="
              totals.pendingApprovalCount
            "
            helper="Esperando revisión"
            variant="warning"
          />

          <MetricCard
            label="Borrador"
            :value="
              totals.draftCount
            "
            helper="Sin enviar"
          />

          <MetricCard
            label="Rechazados"
            :value="
              totals.rejectedCount
            "
            helper="Requieren corrección"
            variant="danger"
          />

          <MetricCard
            label="Sin plan"
            :value="
              totals.noPlanCount
            "
            helper="Sin ordinario semanal"
            variant="orange"
          />
        </section>

        <!-- ===========================================
             MÉTRICAS EXTRAORDINARIAS
        ============================================ -->

        <section
          v-else
          class="metrics-grid six"
        >
          <MetricCard
            label="Extraordinarios"
            :value="
              totals.plansCount
            "
            helper="Planes del periodo"
            variant="violet"
          />

          <MetricCard
            label="Aprobados"
            :value="
              totals.approvedCount
            "
            helper="Autorizados"
          />

          <MetricCard
            label="Pendientes"
            :value="
              totals.pendingApprovalCount
            "
            helper="Esperando revisión"
            variant="warning"
          />

          <MetricCard
            label="Borrador"
            :value="
              totals.draftCount
            "
            helper="Sin enviar"
          />

          <MetricCard
            label="Rechazados"
            :value="
              totals.rejectedCount
            "
            helper="Requieren corrección"
            variant="danger"
          />

          <MetricCard
            label="Actividades"
            :value="
              totals.totalItems
            "
            helper="Dentro del periodo"
            variant="violet"
          />
        </section>

        <!-- ===========================================
             FILTROS
        ============================================ -->

        <section class="filters-card">
          <div class="search-field">
            <span>
              ⌕
            </span>

            <input
              v-model="search"
              type="search"
              placeholder="Buscar supervisor..."
            />
          </div>

          <select
            v-if="
              coordinators.length >
              1
            "
            v-model="coordinatorFilter"
          >
            <option value="">
              Todos los coordinadores
            </option>

            <option
              v-for="coordinator in coordinators"
              :key="coordinator.id"
              :value="coordinator.id"
            >
              {{ coordinator.name }}
            </option>
          </select>

          <select
            v-model="statusFilter"
          >
            <option value="">
              Todos los estados
            </option>

            <option value="APPROVED">
              Aprobados
            </option>

            <option value="PENDING_APPROVAL">
              Pendientes
            </option>

            <option value="DRAFT">
              Borradores
            </option>

            <option value="REJECTED">
              Rechazados
            </option>

            <option
              v-if="
                mode ===
                'ORDINARY'
              "
              value="NO_PLAN"
            >
              Sin plan
            </option>
          </select>

          <button
            v-if="hasFilters"
            type="button"
            class="clear-button"
            @click="clearFilters"
          >
            Limpiar
          </button>
        </section>

        <!-- ===========================================
             TABLA
        ============================================ -->

        <section class="plans-card">
          <header class="table-header">
            <div>
              <span>
                {{
                  mode ===
                    'ORDINARY'
                    ? 'Planes ordinarios'
                    : 'Planes extraordinarios'
                }}
              </span>

              <strong>
                {{
                  filteredPlans.length
                }}
                resultados
              </strong>
            </div>

            <small>
              {{ selectedState }}
            </small>
          </header>

          <div
            v-if="
              filteredPlans.length
            "
            class="plan-list"
          >
            <article
              v-for="plan in filteredPlans"
              :key="
                plan.planId ||
                plan.supervisorId
              "
              class="plan-row"
              :class="{
                clickable:
                  plan.hasPlan,
              }"
              @click="
                openPlan(
                  plan
                )
              "
            >
              <div class="person-cell">
                <div class="avatar">
                  {{
                    initials(
                      plan.supervisorName
                    )
                  }}
                </div>

                <div>
                  <strong>
                    {{ plan.supervisorName }}
                  </strong>

                  <span>
                    {{
                      plan.coordinatorName ||
                      'Supervisión directa'
                    }}
                  </span>
                </div>
              </div>

              <div
                v-if="
                  mode ===
                  'EXTRAORDINARY'
                "
                class="period-cell"
              >
                <strong>
                  {{
                    formatRange(
                      plan.periodStart,
                      plan.periodEnd
                    )
                  }}
                </strong>

                <span>
                  Periodo
                </span>
              </div>

              <div class="status-cell">
                <span
                  class="status-badge"
                  :class="
                    statusClass(
                      plan.status
                    )
                  "
                >
                  {{
                    statusLabel(
                      plan.status
                    )
                  }}
                </span>

                <small
                  v-if="
                    plan.status ===
                      'REJECTED' &&
                    plan.rejectionComment
                  "
                >
                  {{
                    truncate(
                      plan.rejectionComment,
                      55
                    )
                  }}
                </small>
              </div>

              <div class="number-cell">
                <strong>
                  {{
                    plan.hasPlan
                      ? plan.totalItems
                      : '—'
                  }}
                </strong>

                <span>
                  actividades
                </span>
              </div>

              <div class="revision-cell">
                <strong
                  v-if="
                    plan.hasPlan
                  "
                >
                  R{{ plan.revisionNumber }}
                </strong>

                <span>
                  {{
                    plan.hasPlan
                      ? 'revisión'
                      : 'sin registro'
                  }}
                </span>
              </div>

              <div class="arrow-cell">
                {{
                  plan.hasPlan
                    ? '›'
                    : ''
                }}
              </div>
            </article>
          </div>

          <div
            v-else
            class="empty-state"
          >
            <div>
              {{
                mode ===
                  'EXTRAORDINARY'
                  ? 'E'
                  : 'P'
              }}
            </div>

            <strong>
              {{
                mode ===
                  'EXTRAORDINARY'
                  ? 'No hay planes extraordinarios'
                  : 'No hay resultados'
              }}
            </strong>

            <span>
              {{
                mode ===
                  'EXTRAORDINARY'
                  ? 'Consulta otro mes o modifica los filtros.'
                  : 'Ajusta los filtros o consulta otra semana.'
              }}
            </span>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<script setup>
import {
  computed,
  defineComponent,
  h,
  onMounted,
  ref,
} from 'vue'

import {
  useRoute,
  useRouter,
} from 'vue-router'

import {
  getWebContext,
  getWebExtraordinaryWorkPlans,
  getWebWorkPlans,
} from '../../services/api.js'

import {
  useAuth,
} from '../../composables/useAuth.js'

const route =
  useRoute()

const router =
  useRouter()

const {
  profile,
} =
  useAuth()

const mode =
  ref(
    String(
      route.query.view ||
      '',
    ).toLowerCase() ===
      'extraordinary'
      ? 'EXTRAORDINARY'
      : 'ORDINARY'
  )

const loading =
  ref(true)

const error =
  ref(null)

const states =
  ref([])

const selectedState =
  ref('')

const plans =
  ref([])

const totals =
  ref(
    emptyTotals()
  )

const search =
  ref('')

const coordinatorFilter =
  ref('')

const statusFilter =
  ref('')

const weekStart =
  ref(
    initialWeek()
  )

const monthCursor =
  ref(
    initialMonth()
  )

const normalizedRole =
  computed(
    () =>
      String(
        profile.value?.rol ||
        profile.value?.role ||
        '',
      )
        .trim()
        .toUpperCase()
  )

const pageKicker =
  computed(
    () => {
      if (
        normalizedRole.value ===
        'GERENTE'
      ) {
        return 'Vista gerencial'
      }

      if (
        normalizedRole.value ===
        'COORDINADOR'
      ) {
        return 'Mi coordinación'
      }

      return 'Mi operación'
    }
  )

const weekEnd =
  computed(
    () =>
      addDays(
        weekStart.value,
        6
      )
  )

const monthStart =
  computed(
    () =>
      new Date(
        monthCursor.value
          .getFullYear(),

        monthCursor.value
          .getMonth(),

        1,
        12
      )
  )

const monthEnd =
  computed(
    () =>
      new Date(
        monthCursor.value
          .getFullYear(),

        monthCursor.value
          .getMonth() +
          1,

        0,
        12
      )
  )

const periodLabel =
  computed(
    () => {
      if (
        mode.value ===
        'ORDINARY'
      ) {
        return formatWeekRange(
          weekStart.value,
          weekEnd.value
        )
      }

      return new Intl.DateTimeFormat(
        'es-MX',
        {
          month:
            'long',

          year:
            'numeric',
        }
      ).format(
        monthCursor.value
      )
    }
  )

const isCurrentPeriod =
  computed(
    () => {
      const now =
        new Date()

      if (
        mode.value ===
        'ORDINARY'
      ) {
        return (
          toIso(
            weekStart.value
          ) ===
          toIso(
            getMonday(
              now
            )
          )
        )
      }

      return (
        now.getFullYear() ===
          monthCursor.value
            .getFullYear() &&
        now.getMonth() ===
          monthCursor.value
            .getMonth()
      )
    }
  )

const coordinators =
  computed(
    () => {
      const map =
        new Map()

      for (
        const plan
        of plans.value
      ) {
        if (
          plan.coordinatorId &&
          plan.coordinatorName
        ) {
          map.set(
            plan.coordinatorId,
            {
              id:
                plan.coordinatorId,

              name:
                plan.coordinatorName,
            }
          )
        }
      }

      return Array
        .from(
          map.values()
        )
        .sort(
          (
            a,
            b
          ) =>
            a.name.localeCompare(
              b.name,
              'es'
            )
        )
    }
  )

const filteredPlans =
  computed(
    () => {
      const query =
        search.value
          .trim()
          .toLocaleLowerCase(
            'es-MX'
          )

      return plans.value.filter(
        plan => {
          if (query) {
            const text =
              [
                plan.supervisorName,
                plan.coordinatorName,
                statusLabel(
                  plan.status
                ),
              ]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase(
                  'es-MX'
                )

            if (
              !text.includes(
                query
              )
            ) {
              return false
            }
          }

          if (
            coordinatorFilter.value &&
            plan.coordinatorId !==
              coordinatorFilter.value
          ) {
            return false
          }

          if (
            statusFilter.value &&
            plan.status !==
              statusFilter.value
          ) {
            return false
          }

          return true
        }
      )
    }
  )

const hasFilters =
  computed(
    () =>
      Boolean(
        search.value ||
        coordinatorFilter.value ||
        statusFilter.value
      )
  )

const MetricCard =
  defineComponent({
    props: {
      label:
        String,

      value: {
        type:
          [
            Number,
            String,
          ],

        default:
          0,
      },

      helper:
        String,

      variant:
        String,
    },

    setup(
      props
    ) {
      return () =>
        h(
          'article',
          {
            class: [
              'metric-card',
              props.variant ||
              '',
            ],
          },
          [
            h(
              'span',
              props.label
            ),

            h(
              'strong',
              String(
                props.value ??
                0
              )
            ),

            h(
              'small',
              props.helper
            ),
          ]
        )
    },
  })

onMounted(
  initialize
)

async function initialize() {
  loading.value =
    true

  error.value =
    null

  try {
    const context =
      await getWebContext()

    states.value =
      Array.isArray(
        context?.states
      )
        ? context.states
        : []

    const queryState =
      String(
        route.query.state ||
        ''
      )

    const found =
      states.value.find(
        state =>
          state.name ===
          queryState
      )

    selectedState.value =
      found?.name ||
      states.value[0]?.name ||
      ''

    if (
      !selectedState.value
    ) {
      throw new Error(
        'No existe un estado autorizado para este perfil.'
      )
    }

    await loadPlans()
  } catch (
    err
  ) {
    console.error(
      '[WorkPlansView][initialize]',
      err
    )

    error.value =
      err?.message ||
      'No fue posible cargar los planes.'

    loading.value =
      false
  }
}

async function loadPlans() {
  if (
    !selectedState.value
  ) {
    return
  }

  loading.value =
    true

  error.value =
    null

  try {
    let response

    if (
      mode.value ===
      'ORDINARY'
    ) {
      response =
        await getWebWorkPlans({
          state:
            selectedState.value,

          periodStart:
            toIso(
              weekStart.value
            ),

          periodEnd:
            toIso(
              weekEnd.value
            ),
        })
    } else {
      response =
        await getWebExtraordinaryWorkPlans({
          state:
            selectedState.value,

          periodStart:
            toIso(
              monthStart.value
            ),

          periodEnd:
            toIso(
              monthEnd.value
            ),
        })
    }

    plans.value =
      Array.isArray(
        response?.plans
      )
        ? response.plans
        : []

    totals.value = {
      ...emptyTotals(),

      ...(
        response?.totals ||
        {}
      ),
    }

    await syncQuery()
  } catch (
    err
  ) {
    console.error(
      '[WorkPlansView][loadPlans]',
      err
    )

    plans.value =
      []

    totals.value =
      emptyTotals()

    error.value =
      err?.message ||
      'No fue posible cargar los planes.'
  } finally {
    loading.value =
      false
  }
}

async function changeMode(
  nextMode
) {
  if (
    mode.value ===
    nextMode
  ) {
    return
  }

  mode.value =
    nextMode

  clearFilters()

  await loadPlans()
}

async function handleStateChange() {
  clearFilters()

  await loadPlans()
}

async function movePeriod(
  direction
) {
  if (
    mode.value ===
    'ORDINARY'
  ) {
    weekStart.value =
      addDays(
        weekStart.value,
        direction * 7
      )
  } else {
    monthCursor.value =
      new Date(
        monthCursor.value
          .getFullYear(),

        monthCursor.value
          .getMonth() +
          direction,

        1,
        12
      )
  }

  clearFilters()

  await loadPlans()
}

async function goCurrentPeriod() {
  if (
    mode.value ===
    'ORDINARY'
  ) {
    weekStart.value =
      getMonday(
        new Date()
      )
  } else {
    const now =
      new Date()

    monthCursor.value =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        12
      )
  }

  clearFilters()

  await loadPlans()
}

function openPlan(
  plan
) {
  if (
    !plan?.hasPlan ||
    !plan.planId
  ) {
    return
  }

  router.push({
    name:
      'farmacias-plan-detail',

    params: {
      planId:
        plan.planId,
    },

    query: {
      state:
        selectedState.value,

      start:
        mode.value ===
          'ORDINARY'
          ? toIso(
              weekStart.value
            )
          : undefined,

      view:
        mode.value ===
          'EXTRAORDINARY'
          ? 'extraordinary'
          : 'ordinary',

      month:
        mode.value ===
          'EXTRAORDINARY'
          ? toIso(
              monthStart.value
            )
          : undefined,
    },
  })
}

async function syncQuery() {
  await router.replace({
    name:
      'farmacias-planes',

    query: {
      state:
        selectedState.value,

      view:
        mode.value ===
          'EXTRAORDINARY'
          ? 'extraordinary'
          : 'ordinary',

      start:
        mode.value ===
          'ORDINARY'
          ? toIso(
              weekStart.value
            )
          : undefined,

      month:
        mode.value ===
          'EXTRAORDINARY'
          ? toIso(
              monthStart.value
            )
          : undefined,
    },
  })
}

function clearFilters() {
  search.value =
    ''

  coordinatorFilter.value =
    ''

  statusFilter.value =
    ''
}

function initialWeek() {
  const value =
    parseQueryDate(
      route.query.start
    )

  return getMonday(
    value ||
    new Date()
  )
}

function initialMonth() {
  const value =
    parseQueryDate(
      route.query.month
    )

  const source =
    value ||
    new Date()

  return new Date(
    source.getFullYear(),
    source.getMonth(),
    1,
    12
  )
}

function parseQueryDate(
  value
) {
  const text =
    String(
      value ||
      ''
    )

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    return null
  }

  const date =
    new Date(
      `${text}T12:00:00`
    )

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date
}

function getMonday(
  date
) {
  const value =
    new Date(
      date
    )

  value.setHours(
    12,
    0,
    0,
    0
  )

  const day =
    value.getDay()

  value.setDate(
    value.getDate() +
    (
      day === 0
        ? -6
        : 1 - day
    )
  )

  return value
}

function addDays(
  date,
  amount
) {
  const value =
    new Date(
      date
    )

  value.setDate(
    value.getDate() +
    amount
  )

  return value
}

function toIso(
  date
) {
  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() +
      1
    ).padStart(
      2,
      '0'
    )

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      '0'
    )

  return `${year}-${month}-${day}`
}

function formatWeekRange(
  start,
  end
) {
  const first =
    new Intl.DateTimeFormat(
      'es-MX',
      {
        day:
          'numeric',

        month:
          'short',
      }
    ).format(
      start
    )

  const last =
    new Intl.DateTimeFormat(
      'es-MX',
      {
        day:
          'numeric',

        month:
          'short',

        year:
          'numeric',
      }
    ).format(
      end
    )

  return `${first} — ${last}`
}

function formatRange(
  start,
  end
) {
  if (
    !start ||
    !end
  ) {
    return '—'
  }

  if (
    start ===
    end
  ) {
    return formatDate(
      start
    )
  }

  return `${formatDate(start)} — ${formatDate(end)}`
}

function formatDate(
  value
) {
  const date =
    parseQueryDate(
      String(
        value
      ).slice(
        0,
        10
      )
    )

  if (!date) {
    return '—'
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day:
        'numeric',

      month:
        'short',
    }
  ).format(
    date
  )
}

function statusLabel(
  status
) {
  const labels = {
    APPROVED:
      'Aprobado',

    PENDING_APPROVAL:
      'Pendiente',

    DRAFT:
      'Borrador',

    REJECTED:
      'Rechazado',

    NO_PLAN:
      'Sin plan',
  }

  return (
    labels[status] ||
    status ||
    'Sin estado'
  )
}

function statusClass(
  status
) {
  return String(
    status ||
    ''
  )
    .toLowerCase()
    .replace(
      /_/g,
      '-'
    )
}

function initials(
  value
) {
  const words =
    String(
      value ||
      '?'
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean)

  return (
    (
      words[0]
        ?.charAt(0) ||
      '?'
    ) +
    (
      words[1]
        ?.charAt(0) ||
      ''
    )
  ).toUpperCase()
}

function truncate(
  value,
  length
) {
  const text =
    String(
      value ||
      ''
    )

  return text.length >
    length
    ? `${text.slice(
        0,
        length - 1
      )}…`
    : text
}

function emptyTotals() {
  return {
    supervisorsCount:
      0,

    plansCount:
      0,

    noPlanCount:
      0,

    draftCount:
      0,

    pendingApprovalCount:
      0,

    approvedCount:
      0,

    rejectedCount:
      0,

    totalItems:
      0,
  }
}
</script>

<style scoped>
.plans-page {
  min-height: 100vh;
  padding: 104px 28px 48px;
  background: linear-gradient(145deg, #f8fafc, #eef6fb);
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.plans-container {
  width: min(1180px, 100%);
  margin: 0 auto;
}

.plans-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.plans-kicker {
  color: #0f64ad;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: .09em;
  text-transform: uppercase;
}

.plans-header h1 {
  margin: 6px 0 7px;
  color: #0f172a;
  font-size: 30px;
}

.plans-header p {
  margin: 0;
  color: #64748b;
  font-size: 15px;
}

.state-selector {
  display: flex;
  min-width: 190px;
  flex-direction: column;
  gap: 5px;
}

.state-selector label {
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.state-selector select,
.filters-card select {
  height: 42px;
  padding: 0 11px;
  border: 1px solid #dbe3ec;
  border-radius: 11px;
  background: #fff;
  color: #334155;
  outline: 0;
}

.plan-tabs {
  display: inline-flex;
  gap: 4px;
  margin-top: 22px;
  padding: 4px;
  border: 1px solid #dbe3ec;
  border-radius: 14px;
  background: #fff;
}

.plan-tabs button {
  display: flex;
  min-width: 150px;
  flex-direction: column;
  align-items: flex-start;
  padding: 9px 13px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.plan-tabs button.active {
  background: #eff8ff;
  color: #0f64ad;
}

.plan-tabs span {
  font-size: 12px;
  font-weight: 900;
}

.plan-tabs small {
  margin-top: 2px;
  font-size: 10px;
  opacity: .7;
}

.period-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 15px;
  background: rgba(255,255,255,.94);
}

.period-arrow {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  font-size: 23px;
}

.period-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.period-copy span {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.period-copy strong {
  margin-top: 2px;
  color: #0f172a;
  font-size: 14px;
  text-transform: capitalize;
}

.current-period-button {
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff8ff;
  color: #0f64ad;
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
}

.current-period-button:disabled {
  opacity: .45;
  cursor: default;
}

.metrics-grid {
  display: grid;
  gap: 8px;
  margin-top: 13px;
}

.metrics-grid.six {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.metric-card {
  display: flex;
  min-height: 100px;
  flex-direction: column;
  justify-content: center;
  padding: 13px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}

.metric-card span {
  color: #64748b;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.metric-card strong {
  margin-top: 4px;
  color: #0f172a;
  font-size: 23px;
}

.metric-card small {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 10px;
}

.metric-card.primary {
  border-color: #bfdbfe;
  background: #eff8ff;
}

.metric-card.warning {
  border-color: #fde68a;
  background: #fffbeb;
}

.metric-card.danger {
  border-color: #fecaca;
  background: #fef2f2;
}

.metric-card.orange {
  border-color: #fed7aa;
  background: #fff7ed;
}

.metric-card.violet {
  border-color: #c7d2fe;
  background: #eef2ff;
}

.filters-card {
  display: flex;
  gap: 8px;
  margin-top: 13px;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}

.search-field {
  display: flex;
  min-width: 220px;
  flex: 1;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid #dbe3ec;
  border-radius: 11px;
}

.search-field span {
  color: #94a3b8;
}

.search-field input {
  width: 100%;
  height: 40px;
  border: 0;
  outline: 0;
  background: transparent;
}

.clear-button {
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-size: 11px;
  font-weight: 850;
}

.plans-card {
  overflow: hidden;
  margin-top: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 17px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(15,23,42,.05);
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #eef2f7;
}

.table-header > div {
  display: flex;
  flex-direction: column;
}

.table-header span,
.table-header small {
  color: #64748b;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.table-header strong {
  margin-top: 2px;
  color: #0f172a;
  font-size: 14px;
}

.plan-row {
  display: grid;
  grid-template-columns:
    minmax(230px, 1.8fr)
    minmax(130px, 1fr)
    90px
    80px
    24px;
  align-items: center;
  gap: 10px;
  min-height: 67px;
  padding: 9px 14px;
  border-bottom: 1px solid #f1f5f9;
}

.plan-row:has(.period-cell) {
  grid-template-columns:
    minmax(210px, 1.6fr)
    minmax(135px, 1fr)
    minmax(120px, .9fr)
    80px
    70px
    24px;
}

.plan-row:last-child {
  border-bottom: 0;
}

.plan-row.clickable {
  cursor: pointer;
}

.plan-row.clickable:hover {
  background: #f8fbfe;
}

.person-cell {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.avatar {
  display: grid;
  width: 35px;
  height: 35px;
  flex: 0 0 35px;
  place-items: center;
  border-radius: 10px;
  background: #eaf4fc;
  color: #0f64ad;
  font-size: 11px;
  font-weight: 900;
}

.person-cell > div:last-child,
.number-cell,
.revision-cell,
.period-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.person-cell strong,
.period-cell strong,
.number-cell strong,
.revision-cell strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-cell span,
.period-cell span,
.number-cell span,
.revision-cell span {
  margin-top: 2px;
  color: #94a3b8;
  font-size: 7.5px;
  text-transform: uppercase;
}

.status-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
}

.status-badge {
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 7.5px;
  font-weight: 900;
  text-transform: uppercase;
}

.status-badge.approved {
  background: #dcfce7;
  color: #166534;
}

.status-badge.pending-approval {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.draft {
  background: #f1f5f9;
  color: #475569;
}

.status-badge.rejected {
  background: #fee2e2;
  color: #b91c1c;
}

.status-badge.no-plan {
  background: #ffedd5;
  color: #c2410c;
}

.status-cell small {
  max-width: 180px;
  margin-top: 3px;
  overflow: hidden;
  color: #b91c1c;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow-cell {
  color: #94a3b8;
  font-size: 23px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 38px 20px;
  text-align: center;
}

.empty-state > div {
  display: grid;
  width: 43px;
  height: 43px;
  place-items: center;
  border-radius: 13px;
  background: #f1f5f9;
  color: #64748b;
  font-weight: 900;
}

.empty-state strong {
  margin-top: 9px;
  color: #475569;
  font-size: 12px;
}

.empty-state span {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 8.5px;
}

.message-box {
  margin-top: 18px;
  padding: 22px;
  border-radius: 15px;
  background: #fff;
}

.message-box.loading {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #e2e8f0;
}

.message-box.loading > div:last-child,
.message-box.error {
  display: flex;
  flex-direction: column;
}

.message-box strong {
  color: #334155;
  font-size: 12px;
}

.message-box span {
  margin-top: 3px;
  color: #64748b;
  font-size: 8.5px;
}

.message-box.error {
  border: 1px solid #fecaca;
  background: #fef2f2;
}

.message-box.error strong,
.message-box.error span {
  color: #b91c1c;
}

.message-box button {
  width: fit-content;
  margin-top: 8px;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 3px solid #dbeafe;
  border-top-color: #0f64ad;
  border-radius: 999px;
  animation: spin .7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (
  max-width: 980px
) {
  .metrics-grid.six {
    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      );
  }

  .plan-row,
  .plan-row:has(.period-cell) {
    grid-template-columns:
      minmax(200px, 1.5fr)
      minmax(120px, 1fr)
      75px
      22px;
  }

  .period-cell,
  .revision-cell {
    display: none;
  }
}

@media (
  max-width: 700px
) {
  .plans-page {
    padding:
      94px
      14px
      30px;
  }

  .plans-header,
  .filters-card {
    flex-direction: column;
    align-items: stretch;
  }

  .plan-tabs {
    display: grid;
    grid-template-columns:
      1fr
      1fr;
  }

  .plan-tabs button {
    min-width: 0;
  }

  .metrics-grid.six {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .search-field {
    min-width: 0;
  }

  .plan-row,
  .plan-row:has(.period-cell) {
    grid-template-columns:
      minmax(0, 1fr)
      auto
      20px;
  }

  .number-cell,
  .revision-cell,
  .period-cell {
    display: none;
  }
}
</style>