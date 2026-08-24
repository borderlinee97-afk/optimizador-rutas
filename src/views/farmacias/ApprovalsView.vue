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
                v-if="canDecide"
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
  min-height: 100vh;
  padding: 104px 28px 48px;
  background: linear-gradient(145deg, #f8fafc, #eef6fb);
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.approvals-container {
  width: min(1180px, 100%);
  margin: 0 auto;
}

.approvals-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.page-kicker {
  color: #0f64ad;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .09em;
  text-transform: uppercase;
}

.approvals-header h1 {
  margin: 6px 0 7px;
  color: #0f172a;
  font-size: 30px;
}

.approvals-header p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.refresh-button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid #bfdbfe;
  border-radius: 11px;
  background: #eff8ff;
  color: #0f64ad;
  cursor: pointer;
  font-size: 9px;
  font-weight: 900;
}

.refresh-button:disabled {
  cursor: wait;
  opacity: .55;
}

.success-box {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 16px;
  padding: 11px 13px;
  border: 1px solid #bbf7d0;
  border-radius: 13px;
  background: #f0fdf4;
  color: #166534;
}

.success-box > div {
  display: grid;
  width: 27px;
  height: 27px;
  flex: 0 0 27px;
  place-items: center;
  border-radius: 8px;
  background: #dcfce7;
  font-weight: 900;
}

.success-box span {
  flex: 1;
  font-size: 9px;
  font-weight: 800;
}

.success-box button {
  border: 0;
  background: transparent;
  color: #166534;
  cursor: pointer;
  font-size: 18px;
}

.approval-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 9px;
  margin-top: 22px;
}

.metric {
  display: flex;
  min-height: 104px;
  flex-direction: column;
  justify-content: center;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 15px;
  background: #fff;
}

.metric span {
  color: #64748b;
  font-size: 8px;
  font-weight: 900;
  text-transform: uppercase;
}

.metric strong {
  margin-top: 4px;
  color: #0f172a;
  font-size: 24px;
}

.metric small {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 8px;
}

.metric.total {
  border-color: #bfdbfe;
  background: #eff8ff;
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
  background: #faf8ff;
}

.readonly-notice {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-top: 13px;
  padding: 12px;
  border: 1px solid #bfdbfe;
  border-radius: 13px;
  background: #eff8ff;
}

.readonly-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 10px;
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 900;
}

.readonly-notice > div:last-child {
  display: flex;
  flex-direction: column;
}

.readonly-notice strong {
  color: #1e3a8a;
  font-size: 10px;
}

.readonly-notice span {
  margin-top: 2px;
  color: #475569;
  font-size: 9px;
}

.approval-section {
  overflow: hidden;
  margin-top: 13px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, .045);
}

.coverage-section {
  border-color: #ddd6fe;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #eef2f7;
}

.section-header > div {
  display: flex;
  flex-direction: column;
}

.section-header span {
  color: #64748b;
  font-size: 8px;
  font-weight: 900;
  text-transform: uppercase;
}

.section-header strong {
  margin-top: 2px;
  color: #0f172a;
  font-size: 12px;
}

.section-count {
  display: grid;
  min-width: 27px;
  height: 27px;
  place-items: center;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569 !important;
  font-size: 9px !important;
}

.coverage-count {
  background: #ede9fe;
  color: #6d28d9 !important;
}

.plan-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
}

.plan-card {
  padding: 14px;
  border: 1px solid #e7edf4;
  border-radius: 15px;
  background: #fbfdff;
}

.plan-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.type-badge,
.revision-badge {
  display: inline-flex;
  min-height: 23px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 7.5px;
  font-weight: 900;
  text-transform: uppercase;
}

.type-badge.ordinary {
  background: #dbeafe;
  color: #1d4ed8;
}

.type-badge.extraordinary {
  background: #ede9fe;
  color: #6d28d9;
}

.revision-badge {
  background: #f1f5f9;
  color: #64748b;
}

.person-block {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 13px;
}

.avatar {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 11px;
  background: #eaf4fc;
  color: #0f64ad;
  font-size: 9px;
  font-weight: 900;
}

.person-block > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.person-block strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-block span {
  overflow: hidden;
  margin-top: 2px;
  color: #64748b;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-data {
  display: grid;
  grid-template-columns: 1.4fr .6fr 1fr;
  gap: 7px;
  margin-top: 12px;
}

.plan-data > div {
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-radius: 9px;
  background: #f8fafc;
}

.plan-data span {
  color: #94a3b8;
  font-size: 7px;
  font-weight: 850;
  text-transform: uppercase;
}

.plan-data strong {
  margin-top: 3px;
  color: #334155;
  font-size: 8px;
  line-height: 1.35;
}

.review-plan-button {
  width: 100%;
  min-height: 37px;
  margin-top: 11px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff8ff;
  color: #0f64ad;
  cursor: pointer;
  font-size: 9px;
  font-weight: 900;
}

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
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
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

.coverage-kicker {
  color: #7c3aed;
  font-size: 7px;
  font-weight: 900;
  text-transform: uppercase;
}

.cancel-kicker {
  color: #c2410c;
  font-size: 7px;
  font-weight: 900;
  text-transform: uppercase;
}

.coverage-heading h3,
.cancel-heading h3 {
  margin: 3px 0 0;
  color: #0f172a;
  font-size: 11px;
}

.coverage-pending-pill,
.pending-pill {
  padding: 4px 7px;
  border-radius: 999px;
  font-size: 7px;
  font-weight: 900;
  text-transform: uppercase;
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
  gap: 5px;
  margin-top: 7px;
}

.coverage-meta span,
.cancel-meta span {
  padding: 3px 6px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 7.5px;
}

.coverage-people {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin-top: 9px;
}

.coverage-people > div {
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-radius: 9px;
  background: #f8fafc;
}

.coverage-people .covering-person {
  background: #faf8ff;
}

.coverage-people span,
.coverage-reason span,
.cancel-reason span {
  color: #94a3b8;
  font-size: 7px;
  font-weight: 900;
  text-transform: uppercase;
}

.coverage-people strong {
  margin-top: 3px;
  color: #334155;
  font-size: 8.5px;
}

.coverage-reason,
.cancel-reason {
  display: flex;
  flex-direction: column;
  margin-top: 9px;
}

.coverage-reason p,
.cancel-reason p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 8.5px;
}

.cancel-reason strong {
  margin-top: 2px;
  color: #475569;
  font-size: 9px;
}

.requested-at {
  display: block;
  margin-top: 7px;
  color: #94a3b8;
  font-size: 7px;
}

.coverage-actions,
.cancel-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 7px;
}

.reject-action,
.approve-action {
  min-height: 37px;
  padding: 0 11px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 8px;
  font-weight: 900;
}

.reject-action {
  border: 1px solid #fecaca;
  background: #fff;
  color: #b91c1c;
}

.approve-action {
  border: 1px solid #15803d;
  background: #15803d;
  color: #fff;
}

.coverage-approve {
  border-color: #7c3aed;
  background: #7c3aed;
}

.follow-up-label {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 8px;
  font-weight: 800;
}

.section-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 20px;
  text-align: center;
}

.section-empty strong {
  color: #475569;
  font-size: 10px;
}

.section-empty span {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 8.5px;
}

.loading-box,
.error-box {
  margin-top: 20px;
  padding: 22px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.loading-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.loading-box > div:last-child,
.error-box {
  display: flex;
  flex-direction: column;
}

.loading-box strong,
.error-box strong {
  color: #334155;
  font-size: 10px;
}

.loading-box span,
.error-box span {
  margin-top: 3px;
  color: #64748b;
  font-size: 8.5px;
}

.error-box {
  border-color: #fecaca;
  background: #fef2f2;
}

.error-box strong,
.error-box span {
  color: #b91c1c;
}

.error-box button {
  width: fit-content;
  margin-top: 8px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff;
  color: #b91c1c;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 3px solid #dbeafe;
  border-top-color: #0f64ad;
  border-radius: 999px;
  animation: approvals-spin .7s linear infinite;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, .42);
  backdrop-filter: blur(4px);
}

.action-modal {
  width: min(470px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 22px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 30px 80px rgba(15, 23, 42, .22);
}

.modal-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 13px;
  font-size: 16px;
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

.modal-icon.coverage {
  background: #ede9fe;
  color: #6d28d9;
}

.modal-kicker {
  display: block;
  margin-top: 13px;
  color: #0f64ad;
  font-size: 8px;
  font-weight: 900;
  text-transform: uppercase;
}

.modal-kicker.coverage {
  color: #7c3aed;
}

.action-modal h2 {
  margin: 5px 0;
  color: #0f172a;
  font-size: 19px;
}

.action-modal > p {
  margin: 0 0 14px;
  color: #64748b;
  font-size: 9.5px;
  line-height: 1.5;
}

.modal-detail {
  display: flex;
  flex-direction: column;
  margin-top: 7px;
  padding: 9px;
  border-radius: 9px;
  background: #f8fafc;
}

.modal-detail span,
.comment-field > span {
  color: #94a3b8;
  font-size: 7px;
  font-weight: 900;
  text-transform: uppercase;
}

.modal-detail strong {
  margin-top: 3px;
  color: #334155;
  font-size: 9px;
}

.comment-field {
  display: flex;
  flex-direction: column;
  margin-top: 14px;
}

.comment-field textarea {
  margin-top: 6px;
  padding: 10px;
  resize: vertical;
  border: 1px solid #cbd5e1;
  border-radius: 11px;
  outline: 0;
  color: #0f172a;
  font: inherit;
  font-size: 10px;
}

.comment-field small {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 7.5px;
  text-align: right;
}

.modal-error {
  margin-top: 8px;
  padding: 8px;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 16px;
}

.modal-cancel,
.modal-confirm {
  min-height: 39px;
  padding: 0 13px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 8px;
  font-weight: 900;
}

.modal-cancel {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
}

.modal-confirm.approve {
  border: 1px solid #15803d;
  background: #15803d;
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
  opacity: .5;
}

@keyframes approvals-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 850px) {
  .approval-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .plan-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .approvals-page {
    padding: 94px 14px 30px;
  }

  .approvals-header {
    align-items: stretch;
    flex-direction: column;
  }

  .coverage-card,
  .cancellation-card {
    align-items: stretch;
    flex-direction: column;
  }

  .coverage-actions,
  .cancel-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .coverage-people {
    grid-template-columns: 1fr;
  }
}
</style>