<template>
  <main class="approvals-page">
    <div class="approvals-container">
      <header class="approvals-header">
        <div>
          <span class="page-kicker">
            {{
              canDecide
                ? 'Centro de decisiones'
                : 'Seguimiento'
            }}
          </span>

          <h1>
            Aprobaciones
          </h1>

          <p>
            {{
              canDecide
                ? 'Revisa y resuelve planes, cancelaciones y coberturas pendientes dentro de tu estructura.'
                : 'Consulta las solicitudes pendientes de los supervisores y unidades de tu coordinación.'
            }}
          </p>
        </div>

        <button
          type="button"
          class="refresh-button"
          :disabled="loading || actionLoading"
          @click="loadApprovals()"
        >
          Actualizar
        </button>
      </header>

      <div
        v-if="successMessage"
        class="success-box"
      >
        <div>
          ✓
        </div>

        <span>
          {{ successMessage }}
        </span>

        <button
          type="button"
          @click="successMessage = null"
        >
          ×
        </button>
      </div>

      <div
        v-if="error"
        class="error-box"
      >
        <strong>
          No se pudo cargar el centro de aprobaciones
        </strong>

        <span>
          {{ error }}
        </span>

        <button
          type="button"
          @click="loadApprovals()"
        >
          Reintentar
        </button>
      </div>

      <div
        v-else-if="loading"
        class="loading-box"
      >
        <div class="spinner"></div>

        <div>
          <strong>
            Consultando pendientes
          </strong>

          <span>
            Revisando planes, cancelaciones y coberturas...
          </span>
        </div>
      </div>

      <template v-else>
        <section class="approval-metrics">
          <article class="metric total">
            <span>
              Pendientes
            </span>

            <strong>
              {{ counts.total }}
            </strong>

            <small>
              En tu bandeja
            </small>
          </article>

          <article class="metric">
            <span>
              Ordinarios
            </span>

            <strong>
              {{ counts.ordinaryPlans }}
            </strong>

            <small>
              Planes por revisar
            </small>
          </article>

          <article class="metric extraordinary">
            <span>
              Extraordinarios
            </span>

            <strong>
              {{ counts.extraordinaryPlans }}
            </strong>

            <small>
              Planes por revisar
            </small>
          </article>

          <article class="metric cancellation">
            <span>
              Cancelaciones
            </span>

            <strong>
              {{ counts.cancellationRequests }}
            </strong>

            <small>
              Visitas pendientes
            </small>
          </article>

          <article class="metric coverage">
            <span>
              Coberturas
            </span>

            <strong>
              {{ counts.coverages }}
            </strong>

            <small>
              Solicitudes por revisar
            </small>
          </article>
        </section>

        <div
          v-if="!canDecide"
          class="readonly-notice"
        >
          <div class="readonly-icon">
            i
          </div>

          <div>
            <strong>
              Vista de seguimiento
            </strong>

            <span>
              Como coordinador puedes consultar las solicitudes
              de tu estructura. La decisión final corresponde al
              gerente.
            </span>
          </div>
        </div>

        <!-- PLANES -->

        <section class="approval-section">
          <header class="section-header">
            <div>
              <span>
                Planes
              </span>

              <strong>
                Pendientes de aprobación
              </strong>
            </div>

            <span class="section-count">
              {{ plans.length }}
            </span>
          </header>

          <div
            v-if="plans.length"
            class="plan-grid"
          >
            <article
              v-for="plan in plans"
              :key="plan.planId"
              class="plan-card"
            >
              <div class="plan-card-top">
                <span
                  class="type-badge"
                  :class="
                    plan.planType ===
                      'EXTRAORDINARY'
                      ? 'extraordinary'
                      : 'ordinary'
                  "
                >
                  {{
                    plan.planType ===
                      'EXTRAORDINARY'
                      ? 'Extraordinario'
                      : 'Ordinario'
                  }}
                </span>

                <span class="revision-badge">
                  R{{ plan.revisionNumber }}
                </span>
              </div>

              <div class="person-block">
                <div class="avatar">
                  {{ initials(plan.supervisorName) }}
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

              <div class="plan-data">
                <div>
                  <span>
                    Periodo
                  </span>

                  <strong>
                    {{
                      formatRange(
                        plan.periodStart,
                        plan.periodEnd
                      )
                    }}
                  </strong>
                </div>

                <div>
                  <span>
                    Visitas
                  </span>

                  <strong>
                    {{ plan.totalItems }}
                  </strong>
                </div>

                <div>
                  <span>
                    Recibido
                  </span>

                  <strong>
                    {{ formatDateTime(plan.submittedAt) }}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                class="review-plan-button"
                @click="reviewPlan(plan)"
              >
                {{
                  canDecide
                    ? 'Revisar plan'
                    : 'Ver plan'
                }}
                →
              </button>
            </article>
          </div>

          <div
            v-else
            class="section-empty"
          >
            <strong>
              No hay planes pendientes
            </strong>

            <span>
              Cuando un supervisor envíe un plan,
              aparecerá en esta sección.
            </span>
          </div>
        </section>

        <!-- COBERTURAS -->

        <section class="approval-section coverage-section">
          <header class="section-header">
            <div>
              <span>
                Coberturas temporales
              </span>

              <strong>
                Solicitudes pendientes
              </strong>
            </div>

            <span class="section-count coverage-count">
              {{ coverageRequests.length }}
            </span>
          </header>

          <div
            v-if="coverageRequests.length"
            class="coverage-list"
          >
            <article
              v-for="coverage in coverageRequests"
              :key="coverage.coverageId"
              class="coverage-card"
            >
              <div class="coverage-main">
                <div class="coverage-heading">
                  <div>
                    <span class="coverage-kicker">
                      Cobertura temporal
                    </span>

                    <h3>
                      {{ coverage.pharmacyName }}
                    </h3>
                  </div>

                  <span class="coverage-pending-pill">
                    Pendiente
                  </span>
                </div>

                <div class="coverage-meta">
                  <span v-if="coverage.clues">
                    {{ coverage.clues }}
                  </span>

                  <span>
                    {{
                      formatRange(
                        coverage.startDate,
                        coverage.endDate
                      )
                    }}
                  </span>

                  <span>
                    {{ coverage.coordinatorName }}
                  </span>

                  <span>
                    Solicitó:
                    {{
                      coverage.requestedByName ||
                      'Sin identificar'
                    }}
                  </span>
                </div>

                <div class="coverage-people">
                  <div>
                    <span>
                      Supervisor titular
                    </span>

                    <strong>
                      {{
                        coverage.titularSupervisorName ||
                        'Unidad sin supervisor titular'
                      }}
                    </strong>
                  </div>

                  <div class="covering-person">
                    <span>
                      Supervisor de cobertura
                    </span>

                    <strong>
                      {{ coverage.coveringSupervisorName }}
                    </strong>
                  </div>
                </div>

                <div class="coverage-reason">
                  <span>
                    Motivo
                  </span>

                  <p>
                    {{
                      coverage.requestComment ||
                      'Sin motivo especificado'
                    }}
                  </p>
                </div>

                <small class="requested-at">
                  Recibido:
                  {{ formatDateTime(coverage.requestedAt) }}
                </small>
              </div>

              <div
                v-if="canDecide"
                class="coverage-actions"
              >
                <button
                  type="button"
                  class="reject-action"
                  :disabled="actionLoading"
                  @click="openRejectCoverage(coverage)"
                >
                  Rechazar
                </button>

                <button
                  type="button"
                  class="approve-action coverage-approve"
                  :disabled="actionLoading"
                  @click="openApproveCoverage(coverage)"
                >
                  Aprobar cobertura
                </button>
              </div>

              <div
                v-else
                class="follow-up-label"
              >
                Esperando decisión gerencial
              </div>
            </article>
          </div>

          <div
            v-else
            class="section-empty"
          >
            <strong>
              No hay coberturas pendientes
            </strong>

            <span>
              Las solicitudes de los coordinadores
              aparecerán aquí.
            </span>
          </div>
        </section>

        <!-- CANCELACIONES -->

        <section class="approval-section">
          <header class="section-header">
            <div>
              <span>
                Ejecución
              </span>

              <strong>
                Solicitudes de cancelación
              </strong>
            </div>

            <span class="section-count">
              {{ cancellationRequests.length }}
            </span>
          </header>

          <div
            v-if="cancellationRequests.length"
            class="cancellation-list"
          >
            <article
              v-for="request in cancellationRequests"
              :key="request.itemId"
              class="cancellation-card"
            >
              <div class="cancel-main">
                <div class="cancel-heading">
                  <div>
                    <span class="cancel-kicker">
                      Visita programada
                    </span>

                    <h3>
                      {{ request.name }}
                    </h3>
                  </div>

                  <span class="pending-pill">
                    Pendiente
                  </span>
                </div>

                <div class="cancel-meta">
                  <span v-if="request.clues">
                    {{ request.clues }}
                  </span>

                  <span>
                    {{ formatDate(request.scheduledDate) }}
                    ·
                    {{ formatTime(request.scheduledTime) }}
                  </span>

                  <span>
                    {{ request.supervisorName }}
                  </span>

                  <span v-if="request.coordinatorName">
                    {{ request.coordinatorName }}
                  </span>
                </div>

                <div class="cancel-reason">
                  <span>
                    Motivo
                  </span>

                  <strong>
                    {{
                      request.requestReason ||
                      'Sin motivo especificado'
                    }}
                  </strong>

                  <p v-if="request.requestNotes">
                    {{ request.requestNotes }}
                  </p>
                </div>
              </div>

              <div
                v-if="canDecide && request.canDecide"
                class="cancel-actions"
              >
                <button
                  type="button"
                  class="reject-action"
                  :disabled="actionLoading"
                  @click="openRejectCancellation(request)"
                >
                  Rechazar
                </button>

                <button
                  type="button"
                  class="approve-action"
                  :disabled="actionLoading"
                  @click="openApproveCancellation(request)"
                >
                  Aprobar cancelación
                </button>
              </div>

              <div
                v-else
                class="follow-up-label"
              >
                Esperando decisión gerencial
              </div>
            </article>
          </div>

          <div
            v-else
            class="section-empty"
          >
            <strong>
              No hay cancelaciones pendientes
            </strong>

            <span>
              Las solicitudes nuevas aparecerán aquí.
            </span>
          </div>
        </section>
      </template>
    </div>

    <!-- APROBAR COBERTURA -->

    <div
      v-if="coverageApproveTarget"
      class="modal-backdrop"
      @click.self="closeModal"
    >
      <section class="action-modal">
        <div class="modal-icon coverage">
          ✓
        </div>

        <span class="modal-kicker coverage">
          Autorizar cobertura
        </span>

        <h2>
          Aprobar cobertura temporal
        </h2>

        <p>
          El supervisor de cobertura podrá consultar y programar
          esta unidad únicamente dentro del periodo autorizado.
        </p>

        <div class="modal-detail">
          <span>
            Unidad
          </span>

          <strong>
            {{ coverageApproveTarget.pharmacyName }}
          </strong>
        </div>

        <div class="modal-detail">
          <span>
            Supervisor de cobertura
          </span>

          <strong>
            {{ coverageApproveTarget.coveringSupervisorName }}
          </strong>
        </div>

        <div class="modal-detail">
          <span>
            Periodo
          </span>

          <strong>
            {{
              formatRange(
                coverageApproveTarget.startDate,
                coverageApproveTarget.endDate
              )
            }}
          </strong>
        </div>

        <label class="comment-field">
          <span>
            Comentario de aprobación
          </span>

          <textarea
            v-model="coverageApprovalComment"
            rows="4"
            maxlength="2000"
            :disabled="actionLoading"
            placeholder="Comentario opcional..."
          ></textarea>

          <small>
            {{ coverageApprovalComment.length }}/2000
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
            @click="closeModal"
          >
            Volver
          </button>

          <button
            type="button"
            class="modal-confirm coverage"
            :disabled="actionLoading"
            @click="confirmApproveCoverage"
          >
            {{
              actionLoading
                ? 'Aprobando...'
                : 'Aprobar cobertura'
            }}
          </button>
        </div>
      </section>
    </div>

    <!-- RECHAZAR COBERTURA -->

    <div
      v-if="coverageRejectTarget"
      class="modal-backdrop"
      @click.self="closeModal"
    >
      <section class="action-modal">
        <div class="modal-icon reject">
          !
        </div>

        <span class="modal-kicker">
          Rechazar cobertura
        </span>

        <h2>
          Rechazar solicitud
        </h2>

        <p>
          La cobertura no entrará en vigor y el supervisor
          solicitado no recibirá acceso temporal.
        </p>

        <div class="modal-detail">
          <span>
            Unidad
          </span>

          <strong>
            {{ coverageRejectTarget.pharmacyName }}
          </strong>
        </div>

        <div class="modal-detail">
          <span>
            Supervisor solicitado
          </span>

          <strong>
            {{ coverageRejectTarget.coveringSupervisorName }}
          </strong>
        </div>

        <label class="comment-field">
          <span>
            Motivo del rechazo *
          </span>

          <textarea
            v-model="coverageRejectionComment"
            rows="5"
            maxlength="2000"
            :disabled="actionLoading"
            placeholder="Indica por qué no se autoriza la cobertura..."
          ></textarea>

          <small>
            {{ coverageRejectionComment.length }}/2000
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
            @click="closeModal"
          >
            Volver
          </button>

          <button
            type="button"
            class="modal-confirm reject"
            :disabled="
              actionLoading ||
              coverageRejectionComment.trim().length < 5
            "
            @click="confirmRejectCoverage"
          >
            {{
              actionLoading
                ? 'Rechazando...'
                : 'Rechazar cobertura'
            }}
          </button>
        </div>
      </section>
    </div>

    <!-- APROBAR CANCELACIÓN -->

    <div
      v-if="cancellationApproveTarget"
      class="modal-backdrop"
      @click.self="closeModal"
    >
      <section class="action-modal">
        <div class="modal-icon approve">
          ✓
        </div>

        <span class="modal-kicker">
          Confirmar cancelación
        </span>

        <h2>
          Aprobar solicitud
        </h2>

        <p>
          La visita quedará cancelada dentro
          del plan aprobado.
        </p>

        <div class="modal-detail">
          <span>
            Unidad
          </span>

          <strong>
            {{ cancellationApproveTarget.name }}
          </strong>
        </div>

        <div class="modal-detail">
          <span>
            Supervisor
          </span>

          <strong>
            {{ cancellationApproveTarget.supervisorName }}
          </strong>
        </div>

        <div class="modal-detail">
          <span>
            Fecha
          </span>

          <strong>
            {{ formatDate(cancellationApproveTarget.scheduledDate) }}
            ·
            {{ formatTime(cancellationApproveTarget.scheduledTime) }}
          </strong>
        </div>

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
            @click="closeModal"
          >
            Volver
          </button>

          <button
            type="button"
            class="modal-confirm approve"
            :disabled="actionLoading"
            @click="confirmApproveCancellation"
          >
            {{
              actionLoading
                ? 'Aprobando...'
                : 'Aprobar cancelación'
            }}
          </button>
        </div>
      </section>
    </div>

    <!-- RECHAZAR CANCELACIÓN -->

    <div
      v-if="cancellationRejectTarget"
      class="modal-backdrop"
      @click.self="closeModal"
    >
      <section class="action-modal">
        <div class="modal-icon reject">
          !
        </div>

        <span class="modal-kicker">
          Mantener visita
        </span>

        <h2>
          Rechazar cancelación
        </h2>

        <p>
          La visita continuará pendiente dentro
          del plan y el supervisor recibirá
          la observación.
        </p>

        <div class="modal-detail">
          <span>
            Unidad
          </span>

          <strong>
            {{ cancellationRejectTarget.name }}
          </strong>
        </div>

        <label class="comment-field">
          <span>
            Motivo del rechazo *
          </span>

          <textarea
            v-model="cancellationRejectionComment"
            rows="5"
            maxlength="2000"
            :disabled="actionLoading"
            placeholder="Indica por qué debe mantenerse la visita..."
          ></textarea>

          <small>
            {{ cancellationRejectionComment.length }}/2000
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
            @click="closeModal"
          >
            Volver
          </button>

          <button
            type="button"
            class="modal-confirm reject"
            :disabled="
              actionLoading ||
              cancellationRejectionComment.trim().length < 5
            "
            @click="confirmRejectCancellation"
          >
            {{
              actionLoading
                ? 'Rechazando...'
                : 'Rechazar solicitud'
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
  useRouter,
} from 'vue-router'

import {
  approveWebCancellationRequest,
  approveWebCoverage,
  getWebApprovals,
  rejectWebCancellationRequest,
  rejectWebCoverage,
} from '../../services/api.js'

const router =
  useRouter()

const loading =
  ref(true)

const error =
  ref(null)

const successMessage =
  ref(null)

const response =
  ref(null)

const actionLoading =
  ref(false)

const actionError =
  ref(null)

const cancellationApproveTarget =
  ref(null)

const cancellationRejectTarget =
  ref(null)

const cancellationRejectionComment =
  ref('')

const coverageApproveTarget =
  ref(null)

const coverageRejectTarget =
  ref(null)

const coverageApprovalComment =
  ref('')

const coverageRejectionComment =
  ref('')

const canDecide =
  computed(
    () =>
      Boolean(
        response.value
          ?.context
          ?.canDecide
      )
  )

const counts =
  computed(
    () => ({
      ordinaryPlans:
        Number(
          response.value
            ?.counts
            ?.ordinaryPlans ||
          0
        ),

      extraordinaryPlans:
        Number(
          response.value
            ?.counts
            ?.extraordinaryPlans ||
          0
        ),

      cancellationRequests:
        Number(
          response.value
            ?.counts
            ?.cancellationRequests ||
          0
        ),

      coverages:
        Number(
          response.value
            ?.counts
            ?.coverages ||
          0
        ),

      total:
        Number(
          response.value
            ?.counts
            ?.total ||
          0
        ),
    })
  )

const plans =
  computed(
    () =>
      Array.isArray(
        response.value?.plans
      )
        ? response.value.plans
        : []
  )

const cancellationRequests =
  computed(
    () =>
      Array.isArray(
        response.value
          ?.cancellationRequests
      )
        ? response.value
            .cancellationRequests
        : []
  )

const coverageRequests =
  computed(
    () =>
      Array.isArray(
        response.value
          ?.coverageRequests
      )
        ? response.value
            .coverageRequests
        : []
  )

onMounted(
  async () => {
    await loadApprovals()
  }
)

async function loadApprovals({
  silent = false,
} = {}) {
  if (!silent) {
    loading.value =
      true
  }

  error.value =
    null

  try {
    response.value =
      await getWebApprovals()
  } catch (
    err
  ) {
    console.error(
      '[ApprovalsView][load]',
      err
    )

    response.value =
      null

    error.value =
      err?.message ||
      'No fue posible cargar las aprobaciones.'
  } finally {
    if (!silent) {
      loading.value =
        false
    }
  }
}

function reviewPlan(
  plan
) {
  router.push({
    name:
      'farmacias-plan-detail',

    params: {
      planId:
        plan.planId,
    },

    query: {
      from:
        'approvals',
    },
  })
}

function openApproveCancellation(
  request
) {
  resetModalState()

  cancellationApproveTarget.value =
    request
}

function openRejectCancellation(
  request
) {
  resetModalState()

  cancellationRejectTarget.value =
    request
}

function openApproveCoverage(
  coverage
) {
  resetModalState()

  coverageApproveTarget.value =
    coverage
}

function openRejectCoverage(
  coverage
) {
  resetModalState()

  coverageRejectTarget.value =
    coverage
}

function closeModal() {
  if (
    actionLoading.value
  ) {
    return
  }

  resetModalState()
}

function resetModalState() {
  cancellationApproveTarget.value =
    null

  cancellationRejectTarget.value =
    null

  cancellationRejectionComment.value =
    ''

  coverageApproveTarget.value =
    null

  coverageRejectTarget.value =
    null

  coverageApprovalComment.value =
    ''

  coverageRejectionComment.value =
    ''

  actionError.value =
    null
}

async function confirmApproveCancellation() {
  if (
    !cancellationApproveTarget.value?.itemId ||
    actionLoading.value
  ) {
    return
  }

  actionLoading.value =
    true

  actionError.value =
    null

  try {
    await approveWebCancellationRequest(
      cancellationApproveTarget.value.itemId
    )

    resetModalState()

    successMessage.value =
      'La cancelación fue aprobada correctamente.'

    await loadApprovals({
      silent:
        true,
    })
  } catch (
    err
  ) {
    console.error(
      '[ApprovalsView][cancel-approve]',
      err
    )

    actionError.value =
      err?.message ||
      'No fue posible aprobar la cancelación.'
  } finally {
    actionLoading.value =
      false
  }
}

async function confirmRejectCancellation() {
  if (
    !cancellationRejectTarget.value?.itemId ||
    actionLoading.value
  ) {
    return
  }

  const comment =
    cancellationRejectionComment.value
      .trim()

  if (
    comment.length <
    5
  ) {
    actionError.value =
      'Debes indicar un motivo de al menos 5 caracteres.'

    return
  }

  actionLoading.value =
    true

  actionError.value =
    null

  try {
    await rejectWebCancellationRequest(
      cancellationRejectTarget.value.itemId,
      comment
    )

    resetModalState()

    successMessage.value =
      'La cancelación fue rechazada y la visita se mantiene.'

    await loadApprovals({
      silent:
        true,
    })
  } catch (
    err
  ) {
    console.error(
      '[ApprovalsView][cancel-reject]',
      err
    )

    actionError.value =
      err?.message ||
      'No fue posible rechazar la cancelación.'
  } finally {
    actionLoading.value =
      false
  }
}

async function confirmApproveCoverage() {
  if (
    !coverageApproveTarget.value?.coverageId ||
    actionLoading.value
  ) {
    return
  }

  actionLoading.value =
    true

  actionError.value =
    null

  try {
    await approveWebCoverage(
      coverageApproveTarget.value.coverageId,
      {
        comment:
          coverageApprovalComment.value
            .trim(),
      }
    )

    resetModalState()

    successMessage.value =
      'La cobertura fue aprobada y el acceso temporal quedó autorizado.'

    await loadApprovals({
      silent:
        true,
    })
  } catch (
    err
  ) {
    console.error(
      '[ApprovalsView][coverage-approve]',
      err
    )

    actionError.value =
      err?.message ||
      'No fue posible aprobar la cobertura.'
  } finally {
    actionLoading.value =
      false
  }
}

async function confirmRejectCoverage() {
  if (
    !coverageRejectTarget.value?.coverageId ||
    actionLoading.value
  ) {
    return
  }

  const comment =
    coverageRejectionComment.value
      .trim()

  if (
    comment.length <
    5
  ) {
    actionError.value =
      'Debes indicar un motivo de al menos 5 caracteres.'

    return
  }

  actionLoading.value =
    true

  actionError.value =
    null

  try {
    await rejectWebCoverage(
      coverageRejectTarget.value.coverageId,
      {
        comment,
      }
    )

    resetModalState()

    successMessage.value =
      'La solicitud de cobertura fue rechazada.'

    await loadApprovals({
      silent:
        true,
    })
  } catch (
    err
  ) {
    console.error(
      '[ApprovalsView][coverage-reject]',
      err
    )

    actionError.value =
      err?.message ||
      'No fue posible rechazar la cobertura.'
  } finally {
    actionLoading.value =
      false
  }
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

function parseDate(
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

function formatDate(
  value
) {
  const date =
    parseDate(
      value
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

      year:
        'numeric',
    }
  ).format(
    date
  )
}

function formatRange(
  start,
  end
) {
  return `${formatDate(start)} — ${formatDate(end)}`
}

function formatTime(
  value
) {
  return value
    ? String(
        value
      ).slice(
        0,
        5
      )
    : 'Sin hora'
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
</script>

<style scoped>
.approvals-page {
  width: 100%;
  min-height: 100%;
  padding: 28px 28px 52px;
  background: var(--color-background);
  color: var(--color-text);
}

.approvals-container {
  width: min(var(--content-max-width), 100%);
  margin: 0 auto;
}

/* ============================================================
   CABECERA
   ============================================================ */

.approvals-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.approvals-header > div {
  min-width: 0;
}

.page-kicker {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: .055em;
  text-transform: uppercase;
}

.approvals-header h1 {
  margin: 5px 0;
  color: var(--color-text);
  font-size: var(--font-size-page-title);
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -.02em;
}

.approvals-header p {
  max-width: 780px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.refresh-button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.refresh-button:hover:not(:disabled) {
  background: #dbeafe;
}

.refresh-button:disabled {
  cursor: wait;
  opacity: .55;
}

/* ============================================================
   ESTADOS GENERALES
   ============================================================ */

.success-box,
.error-box,
.loading-box,
.readonly-notice {
  margin-top: 16px;
  border-radius: var(--radius-lg);
}

.success-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid #bbf7d0;
  background: var(--color-success-soft);
  color: #166534;
}

.success-box > div {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border-radius: var(--radius-md);
  background: #dcfce7;
  font-size: 13px;
  font-weight: 800;
}

.success-box span {
  flex: 1;
  font-size: 13px;
  font-weight: 650;
}

.success-box button {
  border: 0;
  background: transparent;
  color: #166534;
  cursor: pointer;
  font-size: 20px;
}

.error-box {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border: 1px solid #fecaca;
  background: var(--color-error-soft);
  color: var(--color-error);
}

.error-box strong {
  font-size: 14px;
}

.error-box span {
  font-size: 13px;
  line-height: 1.45;
}

.error-box button {
  min-height: 35px;
  margin-top: 6px;
  padding: 0 11px;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--color-error);
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}

.loading-box {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.loading-box > div:last-child {
  display: flex;
  flex-direction: column;
}

.loading-box strong {
  font-size: 13px;
}

.loading-box span {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.spinner {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border: 3px solid #dbeafe;
  border-top-color: var(--color-primary);
  border-radius: 999px;
  animation:
    approvals-spin
    .7s
    linear
    infinite;
}

/* ============================================================
   MÉTRICAS
   ============================================================ */

.approval-metrics {
  display: grid;
  grid-template-columns:
    repeat(
      5,
      minmax(0, 1fr)
    );
  gap: 10px;
  margin-top: 22px;
}

.metric {
  display: flex;
  min-width: 0;
  min-height: 100px;
  flex-direction: column;
  justify-content: center;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.metric span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.metric strong {
  margin-top: 5px;
  color: var(--color-text);
  font-size: 24px;
  font-weight: 750;
}

.metric small {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.metric.total {
  border-color: #bfdbfe;
  background: var(--color-primary-soft);
}

.metric.extraordinary {
  border-color: #c7d2fe;
  background: #eef2ff;
}

.metric.cancellation {
  border-color: #fed7aa;
  background: #fff7ed;
}

.metric.coverage {
  border-color: #ddd6fe;
  background: #f5f3ff;
}

/* ============================================================
   SOLO LECTURA
   ============================================================ */

.readonly-notice {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px;
  border: 1px solid #bfdbfe;
  background: var(--color-primary-soft);
}

.readonly-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: var(--radius-md);
  background: #dbeafe;
  color: var(--color-primary-dark);
  font-weight: 800;
}

.readonly-notice > div:last-child {
  display: flex;
  flex-direction: column;
}

.readonly-notice strong {
  color: #334155;
  font-size: 13px;
}

.readonly-notice span {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

/* ============================================================
   SECCIONES
   ============================================================ */

.approval-section {
  overflow: hidden;
  margin-top: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 17px;
  border-bottom: 1px solid var(--color-border);
  background: #fcfdff;
}

.section-header > div {
  display: flex;
  flex-direction: column;
}

.section-header span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.section-header strong {
  margin-top: 2px;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 700;
}

.section-count {
  display: inline-grid;
  min-width: 30px;
  height: 30px;
  place-items: center;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: #475569 !important;
  font-size: 12px !important;
  font-weight: 700 !important;
}

.section-count.coverage-count {
  background: #ede9fe;
  color: #6d28d9 !important;
}

/* ============================================================
   PLANES
   ============================================================ */

.plan-grid {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 12px;
  padding: 14px;
}

.plan-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: #fcfdff;
}

.plan-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.type-badge,
.revision-badge {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.type-badge.ordinary {
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
}

.type-badge.extraordinary {
  background: #ede9fe;
  color: #6d28d9;
}

.revision-badge {
  background: var(--color-surface-muted);
  color: #64748b;
}

.person-block {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  margin-top: 13px;
}

.avatar {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 800;
}

.person-block > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.person-block strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-block span {
  margin-top: 2px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-data {
  display: grid;
  grid-template-columns:
    minmax(0, 1.5fr)
    minmax(80px, .5fr)
    minmax(0, 1fr);
  gap: 8px;
  margin-top: 13px;
}

.plan-data > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 9px;
  border: 1px solid #eef2f7;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.plan-data span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.plan-data strong {
  margin-top: 3px;
  overflow: hidden;
  color: #334155;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
}

.review-plan-button {
  width: 100%;
  min-height: 36px;
  margin-top: 11px;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.review-plan-button:hover {
  background: #dbeafe;
}

/* ============================================================
   COBERTURAS / CANCELACIONES
   ============================================================ */

.coverage-list,
.cancellation-list {
  display: grid;
}

.coverage-card,
.cancellation-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 17px;
  border-bottom: 1px solid #eef2f7;
}

.coverage-card:last-child,
.cancellation-card:last-child {
  border-bottom: 0;
}

.coverage-main,
.cancel-main {
  min-width: 0;
  flex: 1;
}

.coverage-heading,
.cancel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.coverage-kicker,
.cancel-kicker {
  font-size: 12px;
  font-weight: 700;
}

.coverage-kicker {
  color: #7c3aed;
}

.cancel-kicker {
  color: #c2410c;
}

.coverage-heading h3,
.cancel-heading h3 {
  margin: 3px 0 0;
  color: var(--color-text);
  font-size: 14px;
}

.coverage-pending-pill,
.pending-pill {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.coverage-pending-pill {
  background: #ede9fe;
  color: #6d28d9;
}

.pending-pill {
  background: #ffedd5;
  color: #c2410c;
}

.coverage-meta,
.cancel-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.coverage-meta span,
.cancel-meta span {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-size: 12px;
}

.coverage-people {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 8px;
  margin-top: 10px;
}

.coverage-people > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 10px;
  border: 1px solid #eef2f7;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.coverage-people .covering-person {
  border-color: #ddd6fe;
  background: #f5f3ff;
}

.coverage-people span,
.coverage-reason span,
.cancel-reason span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.coverage-people strong {
  margin-top: 3px;
  color: #334155;
  font-size: 13px;
  line-height: 1.4;
}

.coverage-reason,
.cancel-reason {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
}

.coverage-reason p,
.cancel-reason p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.cancel-reason strong {
  margin-top: 4px;
  color: #334155;
  font-size: 13px;
}

.requested-at {
  display: block;
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.coverage-actions,
.cancel-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 7px;
}

.reject-action,
.approve-action {
  min-height: 36px;
  padding: 0 11px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.reject-action {
  border: 1px solid #fecaca;
  background: #fff;
  color: var(--color-error);
}

.approve-action {
  border: 1px solid var(--color-success);
  background: var(--color-success);
  color: #fff;
}

.approve-action.coverage-approve {
  border-color: #7c3aed;
  background: #7c3aed;
}

.reject-action:disabled,
.approve-action:disabled {
  cursor: wait;
  opacity: .55;
}

.follow-up-label {
  flex: 0 0 auto;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

/* ============================================================
   VACÍOS
   ============================================================ */

.section-empty {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 24px;
  text-align: center;
}

.section-empty strong {
  color: #334155;
  font-size: 14px;
}

.section-empty span {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   MODALES
   ============================================================ */

.modal-backdrop {
  position: fixed;
  z-index: 20000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background:
    rgba(
      15,
      23,
      42,
      .52
    );
  backdrop-filter: blur(4px);
}

.action-modal {
  width: min(500px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
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

.modal-icon.coverage {
  background: #ede9fe;
  color: #7c3aed;
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

.modal-kicker.coverage {
  color: #7c3aed;
}

.action-modal h2 {
  margin: 5px 0 6px;
  color: var(--color-text);
  font-size: 20px;
}

.action-modal > p {
  margin: 0 0 14px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.modal-detail {
  display: flex;
  flex-direction: column;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid #eef2f7;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.modal-detail span,
.comment-field > span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.modal-detail strong {
  margin-top: 3px;
  color: #334155;
  font-size: 13px;
  line-height: 1.4;
}

.comment-field {
  display: flex;
  flex-direction: column;
  margin-top: 14px;
}

.comment-field textarea {
  margin-top: 6px;
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

.comment-field textarea:focus {
  border-color: var(--color-primary);
  box-shadow:
    0 0 0 3px
    rgba(37, 99, 235, .09);
}

.comment-field small {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: right;
}

.modal-error {
  margin-top: 9px;
  padding: 9px 10px;
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

.modal-confirm.coverage {
  border: 1px solid #7c3aed;
  background: #7c3aed;
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

@keyframes approvals-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

@media (
  max-width: 1050px
) {
  .approval-metrics {
    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      );
  }
}

@media (
  max-width: 850px
) {
  .approvals-page {
    padding:
      22px
      18px
      40px;
  }

  .approvals-header {
    align-items: stretch;
    flex-direction: column;
  }

  .plan-grid {
    grid-template-columns: 1fr;
  }

  .coverage-card,
  .cancellation-card {
    align-items: stretch;
    flex-direction: column;
  }

  .coverage-actions,
  .cancel-actions {
    align-self: flex-end;
  }
}

@media (
  max-width: 620px
) {
  .approvals-page {
    padding:
      18px
      14px
      32px;
  }

  .approvals-header h1 {
    font-size: 24px;
  }

  .refresh-button {
    width: 100%;
  }

  .approval-metrics {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .plan-grid {
    padding: 10px;
  }

  .plan-data,
  .coverage-people {
    grid-template-columns: 1fr;
  }

  .coverage-actions,
  .cancel-actions {
    display: grid;
    width: 100%;
    grid-template-columns:
      1fr
      1fr;
  }

  .reject-action,
  .approve-action {
    width: 100%;
  }

  .modal-backdrop {
    padding: 10px;
  }

  .action-modal {
    max-height: calc(100vh - 20px);
    padding: 18px;
  }

  .modal-actions {
    display: grid;
    grid-template-columns:
      1fr
      1fr;
  }

  .modal-actions button {
    width: 100%;
  }
}
</style>
