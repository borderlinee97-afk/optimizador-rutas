<template>
  <main class="detail-page">
    <div class="detail-container">
      <button
        type="button"
        class="back-button"
        @click="goBack"
      >
        ← Planes de trabajo
      </button>

      <div
        v-if="loading"
        class="detail-loading"
      >
        <div class="spinner"></div>

        <span>
          Cargando plan...
        </span>
      </div>

      <div
        v-else-if="error"
        class="detail-error"
      >
        <strong>
          No se pudo cargar el plan
        </strong>

        <span>
          {{ error }}
        </span>
      </div>

      <template v-else-if="detail">
        <!-- =============================================
             CABECERA
        ============================================== -->
        <section class="plan-hero">
          <div class="hero-main">
            <div class="hero-avatar">
              {{
                getInitials(
                  detail.supervisor?.name
                )
              }}
            </div>

            <div>
              <span class="hero-kicker">
                {{
                  planTypeLabel(
                    detail.plan.planType
                  )
                }}
              </span>

              <h1>
                {{ detail.supervisor?.name }}
              </h1>

              <p>
                {{
                  formatDateRange(
                    detail.plan.periodStart,
                    detail.plan.periodEnd
                  )
                }}
              </p>
            </div>
          </div>

          <div class="hero-status">
            <span
              class="status-badge"
              :class="
                statusClass(
                  detail.plan.status
                )
              "
            >
              {{
                statusLabel(
                  detail.plan.status
                )
              }}
            </span>

            <small>
              Revisión
              {{
                detail.plan.revisionNumber
              }}
            </small>
          </div>
        </section>

        <section
          v-if="canReviewPlan"
          class="review-actions"
          >
          <div class="review-copy">
              <span>
              Revisión requerida
              </span>

              <strong>
              Este plan está esperando una decisión
              </strong>

              <small>
              Revisa las visitas programadas antes
              de aprobar o rechazar.
              </small>
          </div>

          <div class="review-buttons">
              <button
              type="button"
              class="reject-button"
              :disabled="actionLoading"
              @click="openRejectModal"
              >
              Rechazar
              </button>

              <button
              type="button"
              class="approve-button"
              :disabled="actionLoading"
              @click="openApproveModal"
              >
              Aprobar plan
              </button>
          </div>
          </section>

          <div
          v-if="actionSuccess"
          class="action-message success"
          >
          {{ actionSuccess }}
          </div>

          <div
          v-if="actionError"
          class="action-message error"
          >
          {{ actionError }}
          </div>

        <!-- =============================================
             INFORMACIÓN
        ============================================== -->
        <section class="info-grid">
          <article>
            <span>
              Coordinador
            </span>

            <strong>
              {{
                detail.supervisor
                  ?.coordinatorName ||
                'Supervisión directa'
              }}
            </strong>
          </article>

          <article>
            <span>
              Visitas
            </span>

            <strong>
              {{
                formatNumber(
                  detail.items.length
                )
              }}
            </strong>
          </article>

          <article>
            <span>
              Revisión actual
            </span>

            <strong>
              R{{
                detail.plan.revisionNumber
              }}
            </strong>
          </article>

          <article>
            <span>
              Última actualización
            </span>

            <strong>
              {{
                formatDateTime(
                  detail.plan.updatedAt
                )
              }}
            </strong>
          </article>
        </section>

        <!-- =============================================
             RECHAZO
        ============================================== -->
        <div
          v-if="
            detail.plan.status ===
              'REJECTED' &&
            detail.plan.rejectionComment
          "
          class="rejection-box"
        >
          <strong>
            Motivo del rechazo
          </strong>

          <p>
            {{
              detail.plan.rejectionComment
            }}
          </p>
        </div>

        <!-- =============================================
             EJECUCIÓN
        ============================================== -->
        <section class="execution-summary">
          <div
            v-for="metric in executionMetrics"
            :key="metric.status"
            class="execution-item"
          >
            <strong>
              {{ metric.count }}
            </strong>

            <span>
              {{ metric.label }}
            </span>
          </div>
        </section>

        <!-- =============================================
             AGENDA
        ============================================== -->
        <section class="agenda-card">
          <header class="section-heading">
            <div>
              <span>
                Agenda
              </span>

              <strong>
                Visitas programadas
              </strong>
            </div>

            <small>
              {{
                formatNumber(
                  detail.items.length
                )
              }}
              visitas
            </small>
          </header>

          <div
            v-if="dayGroups.length"
            class="day-groups"
          >
            <section
              v-for="group in dayGroups"
              :key="group.date"
              class="day-group"
            >
              <header class="day-header">
                <div>
                  <span>
                    {{
                      weekdayLabel(
                        group.date
                      )
                    }}
                  </span>

                  <strong>
                    {{
                      longDateLabel(
                        group.date
                      )
                    }}
                  </strong>
                </div>

                <small>
                  {{
                    group.items.length
                  }}
                  visitas
                </small>
              </header>

              <div class="visit-list">
                <article
                  v-for="item in group.items"
                  :key="item.id"
                  class="visit-row"
                >
                  <div class="visit-time">
                    {{
                      formatTime(
                        item.scheduledTime
                      )
                    }}
                  </div>

                  <div class="visit-content">
                    <div class="visit-name-row">
                      <strong>
                        {{ item.name }}
                      </strong>

                      <span
                        class="item-status"
                        :class="
                          statusClass(
                            item.status
                          )
                        "
                      >
                        {{
                          itemStatusLabel(
                            item.status
                          )
                        }}
                      </span>
                    </div>

                    <span
                      v-if="item.clues"
                      class="visit-clues"
                    >
                      {{ item.clues }}
                    </span>

                    <span
                      v-if="item.address"
                      class="visit-address"
                    >
                      {{ item.address }}
                    </span>

                    <div class="visit-meta">
                      <span
                        v-if="item.region"
                      >
                        {{ item.region }}
                      </span>

                      <span
                        v-if="item.project"
                      >
                        {{ item.project }}
                      </span>

                      <span
                        v-if="
                          item.itemType !==
                          'PHARMACY'
                        "
                        class="extra-tag"
                      >
                        Actividad
                      </span>
                    </div>

                    <div
                      v-if="
                        item.itemType ===
                          'PHARMACY' &&
                        item.source ===
                          'PLAN'
                      "
                      class="planned-activities"
                    >
                      <div class="planned-activities-heading">
                        <strong>
                          Actividades planeadas
                        </strong>

                        <span>
                          {{
                            item.activities?.length ||
                            0
                          }}
                        </span>
                      </div>

                      <ol
                        v-if="item.activities?.length"
                        class="planned-activities-list"
                      >
                        <li
                          v-for="activity in [...item.activities].sort(
                            (a, b) =>
                              a.order - b.order
                          )"
                          :key="activity.id"
                        >
                          <div>
                            <strong>
                              {{ activity.activityType }}
                            </strong>

                            <span
                              v-if="activity.note"
                            >
                              {{ activity.note }}
                            </span>
                          </div>
                        </li>
                      </ol>

                      <div
                        v-else
                        class="planned-activities-empty"
                      >
                        Esta visita no tiene actividades
                        planeadas registradas.
                      </div>
                    </div>

                    <div
                      v-if="
                        item.cancellationRequestStatus
                      "
                      class="cancellation-tag"
                    >
                      Cancelación:
                      {{
                        item.cancellationRequestStatus
                      }}
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>

          <div
            v-else
            class="empty-agenda"
          >
            Este plan no tiene actividades activas.
          </div>
        </section>

        <!-- =============================================
             REVISIONES
        ============================================== -->
        <section class="revisions-card">
          <header class="section-heading">
            <div>
              <span>
                Historial
              </span>

              <strong>
                Revisiones
              </strong>
            </div>

            <small>
              {{
                detail.revisions.length
              }}
            </small>
          </header>

          <div
            v-if="detail.revisions.length"
            class="revision-list"
          >
            <article
              v-for="revision in detail.revisions"
              :key="revision.id"
              class="revision-row"
            >
              <div class="revision-number">
                R{{ revision.revisionNumber }}
              </div>

              <div class="revision-copy">
                <strong>
                  {{
                    statusLabel(
                      revision.status
                    )
                  }}
                </strong>

                <span>
                  Enviado:
                  {{
                    formatDateTime(
                      revision.submittedAt
                    )
                  }}
                </span>

                <p
                  v-if="revision.reviewComment"
                >
                  {{ revision.reviewComment }}
                </p>
              </div>
            </article>
          </div>

          <div
            v-else
            class="empty-revisions"
          >
            Todavía no existen revisiones enviadas.
          </div>
        </section>
      </template>
    </div>
    <div
      v-if="showApproveModal"
      class="modal-backdrop"
      @click.self="closeActionModals"
    >
      <section class="action-modal">
        <div class="modal-icon approve">
          ✓
        </div>

        <span class="modal-kicker">
          Confirmar autorización
        </span>

        <h2>
          Aprobar plan de trabajo
        </h2>

        <p>
          Esta acción autorizará el plan para
          su ejecución.
        </p>

        <div class="modal-summary">
          <div>
            <span>
              Supervisor
            </span>

            <strong>
              {{ detail?.supervisor?.name }}
            </strong>
          </div>

          <div>
            <span>
              Periodo
            </span>

            <strong>
              {{
                formatDateRange(
                  detail?.plan?.periodStart,
                  detail?.plan?.periodEnd
                )
              }}
            </strong>
          </div>

          <div>
            <span>
              Visitas
            </span>

            <strong>
              {{ detail?.items?.length || 0 }}
            </strong>
          </div>

          <div>
            <span>
              Revisión
            </span>

            <strong>
              R{{ detail?.plan?.revisionNumber }}
            </strong>
          </div>
        </div>

        <div class="modal-actions">
          <button
            type="button"
            class="modal-cancel"
            :disabled="actionLoading"
            @click="closeActionModals"
          >
            Cancelar
          </button>

          <button
            type="button"
            class="modal-confirm approve"
            :disabled="actionLoading"
            @click="handleApprove"
          >
            {{
              actionLoading
                ? 'Aprobando...'
                : 'Aprobar plan'
            }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="showRejectModal"
      class="modal-backdrop"
      @click.self="closeActionModals"
    >
      <section class="action-modal">
        <div class="modal-icon reject">
          !
        </div>

        <span class="modal-kicker">
          Solicitar correcciones
        </span>

        <h2>
          Rechazar plan
        </h2>

        <p>
          El supervisor podrá corregir el plan
          y enviarlo nuevamente para revisión.
        </p>

        <label class="rejection-field">
          <span>
            Motivo del rechazo *
          </span>

          <textarea
            v-model="rejectionComment"
            rows="5"
            maxlength="2000"
            :disabled="actionLoading"
            placeholder="Describe claramente qué debe corregirse..."
          ></textarea>

          <small>
            {{ rejectionComment.length }}/2000
          </small>
        </label>

        <div
          v-if="actionError"
          class="modal-error"
        >
          {{ actionError }}
        </div>

        <div class="modal-actions">
          <button
            type="button"
            class="modal-cancel"
            :disabled="actionLoading"
            @click="closeActionModals"
          >
            Cancelar
          </button>

          <button
            type="button"
            class="modal-confirm reject"
            :disabled="
              actionLoading ||
              !rejectionComment.trim()
            "
            @click="handleReject"
          >
            {{
              actionLoading
                ? 'Rechazando...'
                : 'Rechazar plan'
            }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import {
  computed,
  onMounted,
  ref,
} from 'vue'

import {
  useRoute,
  useRouter,
} from 'vue-router'

import {
  approveWebWorkPlan,
  getWebWorkPlanDetail,
  rejectWebWorkPlan,
} from '../../services/api.js'

const route =
  useRoute()

const router =
  useRouter()

const loading =
  ref(true)

const error =
  ref(null)

const detail =
  ref(null)

const actionLoading =
  ref(false)

const actionError =
  ref(null)

const actionSuccess =
  ref(null)

const showApproveModal =
  ref(false)

const showRejectModal =
  ref(false)

const rejectionComment =
  ref('')

const canReviewPlan =
  computed(
    () =>
      detail.value?.plan?.status ===
        'PENDING_APPROVAL' &&
      (
        detail.value?.permissions
          ?.canApprove ||
        detail.value?.permissions
          ?.canReject
      )
  )

async function handleApprove() {
  if (
    !detail.value?.plan?.id ||
    actionLoading.value
  ) {
    return
  }

  actionLoading.value =
    true

  actionError.value =
    null

  actionSuccess.value =
    null

  try {
    await approveWebWorkPlan(
      detail.value.plan.id
    )

    showApproveModal.value =
      false

    actionSuccess.value =
      'El plan fue aprobado correctamente.'

    await loadDetail()
  } catch (err) {
    console.error(
      '[WorkPlanDetailView][approve]',
      err
    )

    actionError.value =
      err?.message ||
      'No fue posible aprobar el plan.'
  } finally {
    actionLoading.value =
      false
  }
}

async function handleReject() {
  if (
    !detail.value?.plan?.id ||
    actionLoading.value
  ) {
    return
  }

  const comment =
    rejectionComment.value
      .trim()

  if (!comment) {
    actionError.value =
      'Debes indicar el motivo del rechazo.'

    return
  }

  if (
    comment.length >
    2000
  ) {
    actionError.value =
      'El motivo no puede superar 2000 caracteres.'

    return
  }

  actionLoading.value =
    true

  actionError.value =
    null

  actionSuccess.value =
    null

  try {
    await rejectWebWorkPlan(
      detail.value.plan.id,
      comment
    )

    rejectionComment.value =
      ''

    showRejectModal.value =
      false

    actionSuccess.value =
      'El plan fue rechazado y regresó al supervisor para corrección.'

    await loadDetail()
  } catch (err) {
    console.error(
      '[WorkPlanDetailView][reject]',
      err
    )

    actionError.value =
      err?.message ||
      'No fue posible rechazar el plan.'
  } finally {
    actionLoading.value =
      false
  }
}

function openApproveModal() {
  actionError.value =
    null

  actionSuccess.value =
    null

  showApproveModal.value =
    true
}

function openRejectModal() {
  actionError.value =
    null

  actionSuccess.value =
    null

  rejectionComment.value =
    ''

  showRejectModal.value =
    true
}

function closeActionModals() {
  if (
    actionLoading.value
  ) {
    return
  }

  showApproveModal.value =
    false

  showRejectModal.value =
    false

  rejectionComment.value =
    ''

  actionError.value =
    null
}

const dayGroups =
  computed(
    () => {
      const map =
        new Map()

      for (
        const item
        of detail.value?.items ||
        []
      ) {
        const date =
          item.scheduledDate ||
          'SIN_FECHA'

        if (
          !map.has(
            date
          )
        ) {
          map.set(
            date,
            []
          )
        }

        map
          .get(date)
          .push(item)
      }

      return Array.from(
        map.entries()
      )
        .map(
          ([
            date,
            items,
          ]) => ({
            date,
            items,
          })
        )
        .sort(
          (
            a,
            b
          ) =>
            a.date.localeCompare(
              b.date
            )
        )
    }
  )

const executionMetrics =
  computed(
    () => {
      const counts = {
        PENDING:
          0,

        IN_PROGRESS:
          0,

        DONE:
          0,

        SKIPPED:
          0,

        CANCELLED:
          0,
      }

      for (
        const item
        of detail.value?.items ||
        []
      ) {
        if (
          Object.prototype
            .hasOwnProperty
            .call(
              counts,
              item.status
            )
        ) {
          counts[
            item.status
          ] += 1
        }
      }

      return [
        {
          status:
            'PENDING',

          label:
            'Pendientes',

          count:
            counts.PENDING,
        },

        {
          status:
            'IN_PROGRESS',

          label:
            'En proceso',

          count:
            counts.IN_PROGRESS,
        },

        {
          status:
            'DONE',

          label:
            'Realizadas',

          count:
            counts.DONE,
        },

        {
          status:
            'SKIPPED',

          label:
            'No realizadas',

          count:
            counts.SKIPPED,
        },

        {
          status:
            'CANCELLED',

          label:
            'Canceladas',

          count:
            counts.CANCELLED,
        },
      ]
    }
  )

onMounted(
  async () => {
    await loadDetail()
  }
)

async function loadDetail() {
  loading.value =
    true

  error.value =
    null

  try {
    detail.value =
      await getWebWorkPlanDetail(
        route.params.planId
      )
  } catch (err) {
    console.error(
      '[WorkPlanDetailView]',
      err
    )

    error.value =
      err?.message ||
      'No fue posible cargar el plan.'
  } finally {
    loading.value =
      false
  }
}

function goBack() {
  if (
    route.query.from ===
    'approvals'
  ) {
    router.push({
      name:
        'farmacias-aprobaciones',
    })

    return
  }

  router.push({
    name:
      'farmacias-planes',

    query: {
      state:
        route.query.state ||
        undefined,

      start:
        route.query.start ||
        undefined,

      view:
        route.query.view ||
        undefined,

      month:
        route.query.month ||
        undefined,
    },
  })
}

function getInitials(
  value
) {
  const words =
    String(
      value ||
      '?'
    )
      .trim()
      .split(
        /\s+/
      )
      .filter(
        Boolean
      )

  if (
    words.length <
    2
  ) {
    return (
      words[0]
        ?.charAt(0)
        .toUpperCase() ||
      '?'
    )
  }

  return (
    words[0].charAt(0) +
    words[1].charAt(0)
  ).toUpperCase()
}

function statusLabel(
  status
) {
  const labels = {
    APPROVED:
      'Aprobado',

    PENDING_APPROVAL:
      'Pendiente de aprobación',

    DRAFT:
      'Borrador',

    REJECTED:
      'Rechazado',

    ARCHIVED:
      'Archivado',
  }

  return (
    labels[status] ||
    status ||
    'Sin estado'
  )
}

function itemStatusLabel(
  status
) {
  const labels = {
    PENDING:
      'Pendiente',

    IN_PROGRESS:
      'En proceso',

    DONE:
      'Realizada',

    SKIPPED:
      'No realizada',

    CANCELLED:
      'Cancelada',

    RESCHEDULED:
      'Reprogramada',
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
    'UNKNOWN'
  )
    .trim()
    .toLowerCase()
    .replace(
      /_/g,
      '-'
    )
}

function planTypeLabel(
  type
) {
  return type ===
    'EXTRAORDINARY'
    ? 'Plan extraordinario'
    : 'Plan ordinario'
}

function formatDateRange(
  start,
  end
) {
  return (
    `${longDateLabel(start)} — ${longDateLabel(end)}`
  )
}

function weekdayLabel(
  isoDate
) {
  const date =
    parseIsoDate(
      isoDate
    )

  if (!date) {
    return 'Sin fecha'
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      weekday:
        'long',
    }
  )
    .format(date)
    .toUpperCase()
}

function longDateLabel(
  isoDate
) {
  const date =
    parseIsoDate(
      isoDate
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
        'long',

      year:
        'numeric',
    }
  ).format(
    date
  )
}

function parseIsoDate(
  value
) {
  if (!value) {
    return null
  }

  const date =
    new Date(
      `${String(value).slice(0, 10)}T12:00:00`
    )

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date
}

function formatTime(
  value
) {
  if (!value) {
    return 'Sin hora'
  }

  return String(
    value
  ).slice(
    0,
    5
  )
}

function formatDateTime(
  value
) {
  if (!value) {
    return '—'
  }

  const date =
    new Date(
      value
    )

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—'
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day:
        '2-digit',

      month:
        'short',

      year:
        'numeric',

      hour:
        '2-digit',

      minute:
        '2-digit',
    }
  ).format(
    date
  )
}

function formatNumber(
  value
) {
  return new Intl.NumberFormat(
    'es-MX'
  ).format(
    Number(
      value ||
      0
    )
  )
}
</script>

<style scoped>
.detail-page {
  min-height: 100vh;

  padding:
    104px
    28px
    48px;

  background:
    linear-gradient(
      145deg,
      #f8fafc,
      #eef6fb
    );

  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.detail-container {
  width: min(
    1050px,
    100%
  );

  margin: 0 auto;
}

.back-button {
  padding: 0;

  border: 0;

  background: transparent;

  color: #0f64ad;

  cursor: pointer;

  font-size: 12px;
  font-weight: 850;
}

.plan-hero {
  display: flex;

  align-items: center;
  justify-content: space-between;

  gap: 20px;

  margin-top: 15px;

  padding: 20px;

  border:
    1px solid #dfe8f0;

  border-radius: 20px;

  background: #fff;

  box-shadow:
    0 12px 34px
    rgba(
      15,
      23,
      42,
      .06
    );
}

.hero-main {
  display: flex;

  min-width: 0;

  align-items: center;

  gap: 14px;
}

.hero-avatar {
  display: grid;

  width: 52px;
  height: 52px;

  flex: 0 0 52px;

  place-items: center;

  border-radius: 15px;

  background: #eaf4fc;

  color: #0f64ad;

  font-size: 16px;
  font-weight: 900;
}

.hero-kicker {
  color: #0f64ad;

  font-size: 11px;
  font-weight: 900;

  text-transform: uppercase;
}

.hero-main h1 {
  margin:
    4px
    0
    3px;

  color: #0f172a;

  font-size: 20px;
}

.hero-main p {
  margin: 0;

  color: #64748b;

  font-size: 12px;

  text-transform: capitalize;
}

.hero-status {
  display: flex;

  align-items: flex-end;

  flex-direction: column;

  gap: 5px;
}

.status-badge,
.item-status {
  display: inline-flex;

  align-items: center;

  min-height: 25px;

  padding:
    0
    8px;

  border-radius: 999px;

  font-size: 10px;
  font-weight: 900;

  text-transform: uppercase;
}

.status-badge.approved,
.item-status.done {
  background: #dcfce7;

  color: #166534;
}

.status-badge.pending-approval,
.item-status.pending {
  background: #fef3c7;

  color: #92400e;
}

.status-badge.rejected,
.item-status.cancelled,
.item-status.skipped {
  background: #fee2e2;

  color: #b91c1c;
}

.status-badge.draft {
  background: #f1f5f9;

  color: #475569;
}

.item-status.in-progress {
  background: #dbeafe;

  color: #1d4ed8;
}

.item-status.rescheduled {
  background: #ede9fe;

  color: #6d28d9;
}

.hero-status small {
  color: #64748b;

  font-size: 11px;
}

.info-grid,
.execution-summary {
  display: grid;

  gap: 9px;

  margin-top: 11px;
}

.info-grid {
  grid-template-columns:
    repeat(
      4,
      minmax(0, 1fr)
    );
}

.info-grid article {
  display: flex;

  flex-direction: column;

  padding: 12px;

  border:
    1px solid #e2e8f0;

  border-radius: 13px;

  background: #fff;
}

.info-grid span {
  color: #94a3b8;

  font-size: 10px;
  font-weight: 850;

  text-transform: uppercase;
}

.info-grid strong {
  margin-top: 4px;

  color: #334155;

  font-size: 12px;

  line-height: 1.35;
}

.rejection-box {
  margin-top: 11px;

  padding: 13px;

  border:
    1px solid #fecaca;

  border-radius: 13px;

  background: #fef2f2;
}

.rejection-box strong {
  color: #b91c1c;

  font-size: 12px;
}

.rejection-box p {
  margin:
    5px
    0
    0;

  color: #7f1d1d;

  font-size: 12px;

  line-height: 1.5;
}

.execution-summary {
  grid-template-columns:
    repeat(
      5,
      minmax(0, 1fr)
    );
}

.execution-item {
  display: flex;

  flex-direction: column;

  padding: 11px;

  border:
    1px solid #e7edf4;

  border-radius: 12px;

  background: #fff;
}

.execution-item strong {
  color: #0f172a;

  font-size: 18px;
}

.execution-item span {
  margin-top: 2px;

  color: #64748b;

  font-size: 10px;

  text-transform: uppercase;
}

.agenda-card,
.revisions-card {
  overflow: hidden;

  margin-top: 12px;

  border:
    1px solid #e2e8f0;

  border-radius: 18px;

  background: #fff;
}

.section-heading {
  display: flex;

  align-items: center;
  justify-content: space-between;

  padding:
    14px
    16px;

  border-bottom:
    1px solid #eef2f7;
}

.section-heading > div {
  display: flex;

  flex-direction: column;
}

.section-heading span {
  color: #64748b;

  font-size: 10px;
  font-weight: 850;

  text-transform: uppercase;
}

.section-heading strong {
  margin-top: 2px;

  color: #0f172a;

  font-size: 14px;
}

.section-heading small {
  color: #64748b;

  font-size: 11px;
}

.day-group {
  border-bottom:
    1px solid #eef2f7;
}

.day-group:last-child {
  border-bottom: 0;
}

.day-header {
  display: flex;

  align-items: center;
  justify-content: space-between;

  padding:
    11px
    16px;

  background: #f8fafc;
}

.day-header > div {
  display: flex;

  flex-direction: column;
}

.day-header span {
  color: #0f64ad;

  font-size: 10px;
  font-weight: 900;
}

.day-header strong {
  margin-top: 2px;

  color: #334155;

  font-size: 12px;

  text-transform: capitalize;
}

.day-header small {
  color: #64748b;

  font-size: 10px;
}

.visit-list {
  display: grid;
}

.visit-row {
  display: grid;

  grid-template-columns:
    68px
    minmax(0, 1fr);

  gap: 12px;

  padding:
    12px
    16px;

  border-bottom:
    1px solid #f3f6f9;
}

.visit-row:last-child {
  border-bottom: 0;
}

.visit-time {
  color: #0f64ad;

  font-size: 12px;
  font-weight: 900;
}

.visit-content {
  min-width: 0;
}

.visit-name-row {
  display: flex;

  align-items: flex-start;
  justify-content: space-between;

  gap: 10px;
}

.visit-name-row strong {
  color: #0f172a;

  font-size: 12px;
}

.visit-clues,
.visit-address {
  display: block;

  margin-top: 3px;

  color: #64748b;

  font-size: 8.5px;
}

.visit-meta {
  display: flex;

  flex-wrap: wrap;

  gap: 5px;

  margin-top: 6px;
}

.visit-meta span,
.extra-tag {
  padding:
    3px
    6px;

  border-radius: 999px;

  background: #f1f5f9;

  color: #64748b;

  font-size: 7.5px;
  font-weight: 750;
}

.planned-activities {
  margin-top: 9px;

  padding: 9px;

  border:
    1px solid #e2e8f0;

  border-radius: 10px;

  background: #f8fafc;
}

.planned-activities-heading {
  display: flex;

  align-items: center;
  justify-content: space-between;

  gap: 8px;
}

.planned-activities-heading strong {
  color: #475569;

  font-size: 8.5px;
  font-weight: 900;

  letter-spacing: .04em;

  text-transform: uppercase;
}

.planned-activities-heading span {
  display: inline-grid;

  min-width: 20px;
  height: 20px;

  place-items: center;

  padding: 0 5px;

  border-radius: 999px;

  background: #fff;

  color: #64748b;

  font-size: 8px;
  font-weight: 900;
}

.planned-activities-list {
  display: grid;

  gap: 6px;

  margin:
    7px
    0
    0;

  padding-left: 18px;
}

.planned-activities-list li {
  color: #64748b;

  font-size: 8.5px;
}

.planned-activities-list li > div {
  display: flex;

  flex-direction: column;

  gap: 2px;
}

.planned-activities-list strong {
  color: #334155;

  font-size: 9px;
}

.planned-activities-list span {
  color: #64748b;

  font-size: 8.5px;
  line-height: 1.4;
}

.planned-activities-empty {
  margin-top: 7px;

  padding: 7px 8px;

  border:
    1px solid #fde68a;

  border-radius: 8px;

  background: #fffbeb;

  color: #92400e;

  font-size: 8.5px;
  line-height: 1.4;
}

.cancellation-tag {
  margin-top: 6px;

  color: #c2410c;

  font-size: 10px;
  font-weight: 800;
}

.revision-list {
  display: grid;
}

.revision-row {
  display: flex;

  gap: 10px;

  padding:
    12px
    16px;

  border-bottom:
    1px solid #f1f5f9;
}

.revision-row:last-child {
  border-bottom: 0;
}

.revision-number {
  display: grid;

  width: 34px;
  height: 34px;

  flex: 0 0 34px;

  place-items: center;

  border-radius: 10px;

  background: #eef6fb;

  color: #0f64ad;

  font-size: 11px;
  font-weight: 900;
}

.revision-copy {
  display: flex;

  flex-direction: column;
}

.revision-copy strong {
  color: #334155;

  font-size: 11px;
}

.revision-copy span {
  margin-top: 2px;

  color: #94a3b8;

  font-size: 10px;
}

.revision-copy p {
  margin:
    5px
    0
    0;

  color: #64748b;

  font-size: 11px;
}

.empty-agenda,
.empty-revisions {
  padding: 24px;

  color: #94a3b8;

  font-size: 12px;

  text-align: center;
}

.detail-loading,
.detail-error {
  margin-top: 20px;

  padding: 25px;

  border:
    1px solid #e2e8f0;

  border-radius: 16px;

  background: #fff;
}

.detail-loading {
  display: flex;

  align-items: center;

  gap: 10px;

  color: #64748b;

  font-size: 12px;
}

.spinner {
  width: 21px;
  height: 21px;

  border:
    3px solid #dbeafe;

  border-top-color: #0f64ad;

  border-radius: 999px;

  animation:
    detail-spin
    .7s
    linear
    infinite;
}

.detail-error {
  display: flex;

  flex-direction: column;

  gap: 4px;

  border-color: #fecaca;

  background: #fef2f2;
}

.detail-error strong {
  color: #b91c1c;

  font-size: 13px;
}

.detail-error span {
  color: #7f1d1d;

  font-size: 11px;
}

@keyframes detail-spin {
  to {
    transform:
      rotate(360deg);
  }
}

@media (
  max-width: 760px
) {
  .detail-page {
    padding:
      94px
      14px
      30px;
  }

  .plan-hero {
    align-items: flex-start;

    flex-direction: column;
  }

  .hero-status {
    align-items: flex-start;
  }

  .info-grid {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .execution-summary {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .visit-row {
    grid-template-columns:
      55px
      minmax(0, 1fr);
  }

  .review-actions {
  display: flex;

  align-items: center;
  justify-content: space-between;

  gap: 20px;

  margin-top: 11px;

  padding: 14px 16px;

  border:
    1px solid #fde68a;

  border-radius: 15px;

  background: #fffbeb;
}

.review-copy {
  display: flex;

  flex-direction: column;
}

.review-copy span {
  color: #b45309;

  font-size: 10px;
  font-weight: 900;

  letter-spacing: .06em;

  text-transform: uppercase;
}

.review-copy strong {
  margin-top: 3px;

  color: #78350f;

  font-size: 13px;
}

.review-copy small {
  margin-top: 3px;

  color: #92400e;

  font-size: 11px;
}

.review-buttons {
  display: flex;

  gap: 8px;
}

.reject-button,
.approve-button {
  min-height: 39px;

  padding: 0 14px;

  border-radius: 11px;

  cursor: pointer;

  font-size: 11px;
  font-weight: 900;
}

.reject-button {
  border:
    1px solid #fecaca;

  background: #fff;

  color: #b91c1c;
}

.approve-button {
  border:
    1px solid #15803d;

  background: #15803d;

  color: #fff;
}

.reject-button:disabled,
.approve-button:disabled {
  cursor: wait;

  opacity: .55;
}

.action-message {
  margin-top: 11px;

  padding: 11px 13px;

  border-radius: 12px;

  font-size: 11px;
  font-weight: 750;
}

.action-message.success {
  border:
    1px solid #bbf7d0;

  background: #f0fdf4;

  color: #166534;
}

.action-message.error {
  border:
    1px solid #fecaca;

  background: #fef2f2;

  color: #b91c1c;
}

.modal-backdrop {
  position: fixed;

  inset: 0;

  z-index: 20000;

  display: grid;

  place-items: center;

  padding: 20px;

  background:
    rgba(
      15,
      23,
      42,
      .42
    );

  backdrop-filter:
    blur(4px);
}

.action-modal {
  width:
    min(
      480px,
      100%
    );

  padding: 22px;

  border:
    1px solid #e2e8f0;

  border-radius: 20px;

  background: #fff;

  box-shadow:
    0 30px 80px
    rgba(
      15,
      23,
      42,
      .22
    );
}

.modal-icon {
  display: grid;

  width: 42px;
  height: 42px;

  place-items: center;

  border-radius: 13px;

  font-size: 17px;
  font-weight: 900;
}

.modal-icon.approve {
  background: #dcfce7;

  color: #15803d;
}

.modal-icon.reject {
  background: #fee2e2;

  color: #b91c1c;
}

.modal-kicker {
  display: block;

  margin-top: 14px;

  color: #0f64ad;

  font-size: 10px;
  font-weight: 900;

  letter-spacing: .07em;

  text-transform: uppercase;
}

.action-modal h2 {
  margin:
    5px
    0
    6px;

  color: #0f172a;

  font-size: 19px;
}

.action-modal > p {
  margin: 0;

  color: #64748b;

  font-size: 12px;

  line-height: 1.5;
}

.modal-summary {
  display: grid;

  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );

  gap: 8px;

  margin-top: 17px;
}

.modal-summary > div {
  display: flex;

  flex-direction: column;

  min-height: 62px;

  padding: 10px;

  border:
    1px solid #e7edf4;

  border-radius: 11px;

  background: #f8fafc;
}

.modal-summary span,
.rejection-field > span {
  color: #94a3b8;

  font-size: 7.5px;
  font-weight: 900;

  text-transform: uppercase;
}

.modal-summary strong {
  margin-top: 4px;

  color: #334155;

  font-size: 11px;

  line-height: 1.4;
}

.rejection-field {
  display: flex;

  flex-direction: column;

  margin-top: 17px;
}

.rejection-field textarea {
  width: 100%;

  margin-top: 7px;

  padding: 11px;

  resize: vertical;

  outline: 0;

  border:
    1px solid #cbd5e1;

  border-radius: 12px;

  color: #0f172a;

  font: inherit;

  font-size: 12px;

  line-height: 1.5;
}

.rejection-field textarea:focus {
  border-color: #ef4444;

  box-shadow:
    0 0 0 3px
    rgba(
      239,
      68,
      68,
      .08
    );
}

.rejection-field small {
  margin-top: 5px;

  color: #94a3b8;

  font-size: 10px;

  text-align: right;
}

.modal-error {
  margin-top: 8px;

  padding: 9px;

  border-radius: 9px;

  background: #fef2f2;

  color: #b91c1c;

  font-size: 8.5px;
}

.modal-actions {
  display: flex;

  justify-content: flex-end;

  gap: 8px;

  margin-top: 18px;
}

.modal-cancel,
.modal-confirm {
  min-height: 40px;

  padding: 0 14px;

  border-radius: 11px;

  cursor: pointer;

  font-size: 11px;
  font-weight: 900;
}

.modal-cancel {
  border:
    1px solid #e2e8f0;

  background: #fff;

  color: #475569;
}

.modal-confirm.approve {
  border:
    1px solid #15803d;

  background: #15803d;

  color: #fff;
}

.modal-confirm.reject {
  border:
    1px solid #dc2626;

  background: #dc2626;

  color: #fff;
}

.modal-confirm:disabled,
.modal-cancel:disabled {
  cursor: wait;

  opacity: .55;
}

@media (
  max-width: 620px
) {
  .review-actions {
    align-items: stretch;

    flex-direction: column;
  }

  .review-buttons {
    display: grid;

    grid-template-columns:
      1fr
      1fr;
  }

  .modal-summary {
    grid-template-columns:
      1fr;
  }
}
}
</style>