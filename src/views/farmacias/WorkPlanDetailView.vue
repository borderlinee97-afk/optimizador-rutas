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

      <!-- =====================================================
           CARGA
      ====================================================== -->

      <div
        v-if="loading"
        class="detail-loading"
      >
        <div class="spinner"></div>

        <span>
          Cargando plan...
        </span>
      </div>

      <!-- =====================================================
           ERROR
      ====================================================== -->

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
        <WorkPlanEditAccess v-if="detail.plan.status === 'APPROVED'" :plan-id="detail.plan.id" />
        <CancelRemainingVisits v-if="detail.permissions?.canCancelRemaining" :plan="detail.plan" @updated="loadDetail" />
        <!-- ===================================================
             CABECERA
        ==================================================== -->

        <section class="plan-hero">
          <div class="hero-main">
            <div class="hero-avatar">
              {{
                getInitials(
                  detail.supervisor?.name
                )
              }}
            </div>

            <div class="hero-copy">
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

        <!-- ===================================================
             REVISIÓN
        ==================================================== -->

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

        <!-- ===================================================
             INFORMACIÓN GENERAL
        ==================================================== -->

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

        <!-- ===================================================
             RECHAZO
        ==================================================== -->

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

        <!-- ===================================================
             EJECUCIÓN
        ==================================================== -->

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

        <!-- ===================================================
             AGENDA
        ==================================================== -->

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
                            item.status, item
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

                    <VisitExecutionSummary :item="item" />

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

                    <!-- =========================================
                         ACTIVIDADES PLANEADAS
                    ========================================== -->

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
                            <small class="activity-execution-state">
                              {{ activity.status === 'DONE' ? 'Completada' : activity.status === 'SKIPPED' ? 'Omitida' : 'Pendiente' }}
                              <template v-if="activity.completedAt || activity.skippedAt"> · {{ formatRecordedAt(activity.completedAt || activity.skippedAt) }}</template>
                            </small>
                            <span v-if="activity.executionNote">Ejecución: {{ activity.executionNote }}</span>
                            <span v-if="activity.skipReason">Motivo: {{ activity.skipReason }}</span>
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

                    <!-- =========================================
                         EVIDENCIAS
                    ========================================== -->

                    <VisitEvidenceGallery :item-id="item.id" />

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

        <!-- ===================================================
             REVISIONES
        ==================================================== -->

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

    <!-- =====================================================
         MODAL APROBAR
    ====================================================== -->

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

    <!-- =====================================================
         MODAL RECHAZAR
    ====================================================== -->

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
import VisitEvidenceGallery from '../../components/VisitEvidenceGallery.vue'
import WorkPlanEditAccess from '../../components/WorkPlanEditAccess.vue'
import CancelRemainingVisits from '../../components/CancelRemainingVisits.vue'
import VisitExecutionSummary from '../../components/VisitExecutionSummary.vue'
import { formatRecordedAt, isAdministrativelyUnfinished } from '../../utils/farmaciasReports.js'
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

/*
 * ============================================================
 * PERMISOS DE REVISIÓN
 * ============================================================
 */

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

/*
 * ============================================================
 * APROBAR
 * ============================================================
 */

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

/*
 * ============================================================
 * RECHAZAR
 * ============================================================
 */

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

/*
 * ============================================================
 * AGRUPACIÓN POR DÍA
 * ============================================================
 */

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

/*
 * ============================================================
 * MÉTRICAS DE EJECUCIÓN
 * ============================================================
 */

const executionMetrics =
  computed(
    () => {
      const counts = {
        PENDING: 0,
        IN_PROGRESS: 0,
        DONE: 0,
        SKIPPED: 0,
        CANCELLED: 0,
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

/*
 * ============================================================
 * CARGA
 * ============================================================
 */

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

/*
 * ============================================================
 * VOLVER
 * ============================================================
 */

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

/*
 * ============================================================
 * FORMATOS
 * ============================================================
 */

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
  status, item = null
) {
  if (isAdministrativelyUnfinished(item)) return 'No finalizada'
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

      timeZone: 'America/Mexico_City',
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
.activity-execution-state { color:#526d8c; font-size:12px; display:block; margin-top:5px; }
.detail-page {
  width: 100%;
  min-height: 100%;
  padding: 28px 28px 48px;
  background: var(--color-background);
  color: var(--color-text);
}

.detail-container {
  width: min(1240px, 100%);
  margin: 0 auto;
}

/* ============================================================
   VOLVER
   ============================================================ */

.back-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-primary-dark);
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
  transition:
    border-color 150ms ease,
    background 150ms ease;
}

.back-button:hover {
  border-color: var(--color-border);
  background: var(--color-surface);
}

/* ============================================================
   HERO
   ============================================================ */

.plan-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 10px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.hero-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
}

.hero-copy {
  min-width: 0;
}

.hero-avatar {
  display: grid;
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  place-items: center;
  border-radius: var(--radius-lg);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
  font-size: 17px;
  font-weight: 800;
}

.hero-kicker {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.hero-main h1 {
  margin: 4px 0 3px;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 22px;
  font-weight: 750;
  line-height: 1.25;
}

.hero-main p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.4;
  text-transform: capitalize;
}

.hero-status {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-end;
  flex-direction: column;
  gap: 6px;
}

.hero-status small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   BADGES
   ============================================================ */

.status-badge,
.item-status {
  display: inline-flex;
  min-height: 27px;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
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

/* ============================================================
   REVISIÓN
   ============================================================ */

.review-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid #fde68a;
  border-radius: var(--radius-lg);
  background: var(--color-warning-soft);
}

.review-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.review-copy span {
  color: var(--color-warning);
  font-size: 12px;
  font-weight: 700;
}

.review-copy strong {
  margin-top: 3px;
  color: #78350f;
  font-size: 14px;
}

.review-copy small {
  margin-top: 3px;
  color: #92400e;
  font-size: 12px;
}

.review-buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.reject-button,
.approve-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.reject-button {
  border: 1px solid #fecaca;
  background: #fff;
  color: var(--color-error);
}

.reject-button:hover:not(:disabled) {
  background: var(--color-error-soft);
}

.approve-button {
  border: 1px solid var(--color-success);
  background: var(--color-success);
  color: #fff;
}

.approve-button:hover:not(:disabled) {
  filter: brightness(.95);
}

.reject-button:disabled,
.approve-button:disabled {
  cursor: wait;
  opacity: .55;
}

/* ============================================================
   MENSAJES
   ============================================================ */

.action-message {
  margin-top: 11px;
  padding: 11px 13px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 650;
}

.action-message.success {
  border: 1px solid #bbf7d0;
  background: var(--color-success-soft);
  color: #166534;
}

.action-message.error {
  border: 1px solid #fecaca;
  background: var(--color-error-soft);
  color: var(--color-error);
}

/* ============================================================
   INFORMACIÓN
   ============================================================ */

.info-grid,
.execution-summary {
  display: grid;
  gap: 10px;
  margin-top: 12px;
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
  min-width: 0;
  min-height: 82px;
  flex-direction: column;
  justify-content: center;
  padding: 13px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.info-grid span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.info-grid strong {
  margin-top: 5px;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}

.rejection-box {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid #fecaca;
  border-radius: var(--radius-lg);
  background: var(--color-error-soft);
}

.rejection-box strong {
  color: var(--color-error);
  font-size: 13px;
}

.rejection-box p {
  margin: 5px 0 0;
  color: #7f1d1d;
  font-size: 13px;
  line-height: 1.5;
}

/* ============================================================
   EJECUCIÓN
   ============================================================ */

.execution-summary {
  grid-template-columns:
    repeat(
      5,
      minmax(0, 1fr)
    );
}

.execution-item {
  display: flex;
  min-width: 0;
  min-height: 78px;
  flex-direction: column;
  justify-content: center;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.execution-item strong {
  color: var(--color-text);
  font-size: 21px;
  font-weight: 750;
}

.execution-item span {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   TARJETAS
   ============================================================ */

.agenda-card,
.revisions-card {
  overflow: hidden;
  margin-top: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 15px 17px;
  border-bottom: 1px solid var(--color-border);
  background: #fcfdff;
}

.section-heading > div {
  display: flex;
  flex-direction: column;
}

.section-heading span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.section-heading strong {
  margin-top: 2px;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 700;
}

.section-heading small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   DÍAS
   ============================================================ */

.day-group {
  border-bottom: 1px solid var(--color-border);
}

.day-group:last-child {
  border-bottom: 0;
}

.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 17px;
  background: var(--color-surface-muted);
}

.day-header > div {
  display: flex;
  flex-direction: column;
}

.day-header span {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
}

.day-header strong {
  margin-top: 2px;
  color: #334155;
  font-size: 13px;
  text-transform: capitalize;
}

.day-header small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   VISITAS
   ============================================================ */

.visit-list {
  display: grid;
}

.visit-row {
  display: grid;
  grid-template-columns:
    82px
    minmax(0, 1fr);
  gap: 14px;
  padding: 16px 17px;
  border-bottom: 1px solid #eef2f7;
}

.visit-row:last-child {
  border-bottom: 0;
}

.visit-time {
  color: var(--color-primary-dark);
  font-size: 13px;
  font-weight: 700;
}

.visit-content {
  min-width: 0;
}

.visit-name-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.visit-name-row strong {
  min-width: 0;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
}

.visit-clues,
.visit-address {
  display: block;
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.visit-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.visit-meta span,
.extra-tag {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

/* ============================================================
   ACTIVIDADES PLANEADAS
   ============================================================ */

.planned-activities {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: #fafcff;
}

.planned-activities-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.planned-activities-heading strong {
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.planned-activities-heading span {
  display: inline-grid;
  min-width: 24px;
  height: 24px;
  place-items: center;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.planned-activities-list {
  display: grid;
  gap: 8px;
  margin: 9px 0 0;
  padding-left: 20px;
}

.planned-activities-list li {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.planned-activities-list li > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.planned-activities-list strong {
  color: #334155;
  font-size: 13px;
}

.planned-activities-list span {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.planned-activities-empty {
  margin-top: 9px;
  padding: 9px 10px;
  border: 1px solid #fde68a;
  border-radius: var(--radius-md);
  background: var(--color-warning-soft);
  color: #92400e;
  font-size: 12px;
  line-height: 1.4;
}

.cancellation-tag {
  margin-top: 8px;
  color: #c2410c;
  font-size: 12px;
  font-weight: 700;
}

/* ============================================================
   REVISIONES
   ============================================================ */

.revision-list {
  display: grid;
}

.revision-row {
  display: flex;
  gap: 11px;
  padding: 14px 17px;
  border-bottom: 1px solid #eef2f7;
}

.revision-row:last-child {
  border-bottom: 0;
}

.revision-number {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 750;
}

.revision-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.revision-copy strong {
  color: #334155;
  font-size: 13px;
}

.revision-copy span {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.revision-copy p {
  margin: 5px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.empty-agenda,
.empty-revisions {
  padding: 32px;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: center;
}

/* ============================================================
   CARGA / ERROR
   ============================================================ */

.detail-loading,
.detail-error {
  margin-top: 18px;
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.detail-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.spinner {
  width: 21px;
  height: 21px;
  flex: 0 0 21px;
  border: 3px solid #dbeafe;
  border-top-color: var(--color-primary);
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
  background: var(--color-error-soft);
}

.detail-error strong {
  color: var(--color-error);
  font-size: 14px;
}

.detail-error span {
  color: #7f1d1d;
  font-size: 13px;
}

/* ============================================================
   MODALES
   ============================================================ */

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
      .48
    );
  backdrop-filter: blur(4px);
}

.action-modal {
  width: min(480px, 100%);
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.modal-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: var(--radius-lg);
  font-size: 17px;
  font-weight: 800;
}

.modal-icon.approve {
  background: #dcfce7;
  color: var(--color-success);
}

.modal-icon.reject {
  background: #fee2e2;
  color: var(--color-error);
}

.modal-kicker {
  display: block;
  margin-top: 14px;
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
}

.action-modal h2 {
  margin: 5px 0 6px;
  color: var(--color-text);
  font-size: 20px;
}

.action-modal > p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
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
  min-width: 0;
  min-height: 66px;
  flex-direction: column;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.modal-summary span,
.rejection-field > span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.modal-summary strong {
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: #334155;
  font-size: 13px;
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
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-md);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
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
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: right;
}

.modal-error {
  margin-top: 8px;
  padding: 9px;
  border-radius: var(--radius-md);
  background: var(--color-error-soft);
  color: var(--color-error);
  font-size: 12px;
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
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.modal-cancel {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: #475569;
}

.modal-confirm.approve {
  border: 1px solid var(--color-success);
  background: var(--color-success);
  color: #fff;
}

.modal-confirm.reject {
  border: 1px solid #dc2626;
  background: #dc2626;
  color: #fff;
}

.modal-confirm:disabled,
.modal-cancel:disabled {
  cursor: wait;
  opacity: .55;
}

@keyframes detail-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================================
   TABLET
   ============================================================ */

@media (
  max-width: 900px
) {
  .detail-page {
    padding:
      22px
      18px
      36px;
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
        3,
        minmax(0, 1fr)
      );
  }


}

/* ============================================================
   MÓVIL
   ============================================================ */

@media (
  max-width: 650px
) {
  .detail-page {
    padding:
      18px
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

  .info-grid,
  .execution-summary {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .visit-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .visit-time {
    padding-bottom: 6px;
    border-bottom:
      1px solid
      var(--color-border);
  }

  .visit-name-row {
    flex-direction: column;
  }



  .modal-summary {
    grid-template-columns: 1fr;
  }





}
</style>