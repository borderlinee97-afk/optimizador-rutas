<template>
  <main class="assignments-page">
    <div class="assignments-container">
      <!-- ===============================================
           ENCABEZADO
      ================================================ -->

      <header class="page-header">
        <div>
          <span class="page-kicker">
            Estructura territorial
          </span>

          <h1>
            Asignaciones
          </h1>

          <p>
            Administra supervisores titulares y
            coberturas temporales sin perder el historial.
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

      <!-- ===============================================
           ERROR
      ================================================ -->

      <div
        v-if="error"
        class="state-box error"
      >
        <strong>
          No se pudieron cargar las asignaciones
        </strong>

        <span>
          {{ error }}
        </span>

        <button
          type="button"
          @click="loadAssignments()"
        >
          Reintentar
        </button>
      </div>

      <!-- ===============================================
           CARGA
      ================================================ -->

      <div
        v-else-if="loading"
        class="state-box loading"
      >
        <div class="spinner"></div>

        <div>
          <strong>
            Cargando estructura
          </strong>

          <span>
            Consultando territorio, titulares y coberturas...
          </span>
        </div>
      </div>

      <template v-else>
        <!-- =============================================
             MENSAJE DE RESULTADO
        ============================================== -->

        <div
          v-if="successMessage"
          class="success-message"
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

        <!-- =============================================
             MÉTRICAS
        ============================================== -->

        <section class="metrics-grid">
          <MetricCard
            label="Registradas"
            :value="totals.registeredUnitsCount"
            helper="Dentro del ámbito visible"
            variant="registered"
          />

          <MetricCard
            label="Operativas"
            :value="totals.operationalUnitsCount"
            helper="Con territorio activo"
          />

          <MetricCard
            label="Asignadas"
            :value="totals.assignedUnitsCount"
            helper="Con supervisor titular"
            variant="assigned"
          />

          <MetricCard
            label="Sin supervisor"
            :value="totals.unassignedUnitsCount"
            helper="Vacantes operativas"
            variant="unassigned"
          />

          <MetricCard
            label="Inactivas"
            :value="totals.inactiveUnitsCount"
            helper="Registro histórico"
          />

          <MetricCard
            label="Coberturas"
            :value="
              coverageTotals.active +
              coverageTotals.scheduled
            "
            :helper="
              `${coverageTotals.pending} pendientes`
            "
            variant="coverage"
          />
        </section>

        <!-- =============================================
             AVISO DE VACANTES
        ============================================== -->

        <section
          v-if="totals.unassignedUnitsCount > 0"
          class="vacancy-notice"
        >
          <div class="notice-icon">
            !
          </div>

          <div>
            <strong>
              {{ totals.unassignedUnitsCount }}
              unidades operativas no tienen supervisor titular
            </strong>

            <span>
              Conservan su coordinador territorial y pueden
              recibir una cobertura temporal.
            </span>
          </div>
        </section>

        <!-- =============================================
             RESUMEN DE COBERTURAS
        ============================================== -->

        <section
          v-if="
            coverageTotals.active > 0 ||
            coverageTotals.scheduled > 0 ||
            coverageTotals.pending > 0
          "
          class="coverage-summary"
        >
          <div class="coverage-summary-copy">
            <span>
              Coberturas temporales
            </span>

            <strong>
              Seguimiento operativo
            </strong>
          </div>

          <div class="coverage-summary-counts">
            <div>
              <strong>
                {{ coverageTotals.active }}
              </strong>

              <span>
                Activas
              </span>
            </div>

            <div>
              <strong>
                {{ coverageTotals.scheduled }}
              </strong>

              <span>
                Programadas
              </span>
            </div>

            <div>
              <strong>
                {{ coverageTotals.pending }}
              </strong>

              <span>
                Pendientes
              </span>
            </div>
          </div>
        </section>

        <!-- =============================================
             COORDINADORES
        ============================================== -->

        <section
          v-if="coordinators.length"
          class="coordinator-summary"
        >
          <article
            v-for="coordinator in coordinators"
            :key="coordinator.id"
            class="coordinator-card"
            :class="{
              selected:
                coordinatorFilter === coordinator.id,
            }"
            @click="
              toggleCoordinator(
                coordinator.id
              )
            "
          >
            <div class="coordinator-avatar">
              {{ initials(coordinator.name) }}
            </div>

            <div class="coordinator-copy">
              <strong>
                {{ coordinator.name }}
              </strong>

              <span>
                {{ coordinator.supervisorsCount }}
                supervisores
              </span>
            </div>

            <div class="coordinator-counts">
              <strong>
                {{ coordinator.unitsCount }}
              </strong>

              <span>
                unidades
              </span>

              <small
                v-if="coordinator.unassignedUnitsCount > 0"
              >
                {{ coordinator.unassignedUnitsCount }}
                sin supervisor
              </small>
            </div>
          </article>
        </section>

        <!-- =============================================
             FILTROS
        ============================================== -->

        <section class="filters-card">
          <div class="search-field">
            <span>
              ⌕
            </span>

            <input
              v-model="search"
              type="search"
              placeholder="Buscar CLUES, unidad, región..."
            />
          </div>

          <select
            v-if="coordinators.length > 1"
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
            v-model="supervisorFilter"
          >
            <option value="">
              Todos los supervisores
            </option>

            <option
              v-for="supervisor in availableSupervisors"
              :key="supervisor.id"
              :value="supervisor.id"
            >
              {{ supervisor.name }}
              ·
              {{ supervisor.assignedUnitsCount }}
            </option>
          </select>

          <select
            v-model="assignmentFilter"
          >
            <option value="">
              Todos los estados
            </option>

            <option value="ASSIGNED">
              Asignadas
            </option>

            <option value="UNASSIGNED">
              Sin supervisor
            </option>

            <option value="INACTIVE">
              Inactivas
            </option>

            <option value="UNCLASSIFIED">
              Sin clasificar
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

        <!-- =============================================
             UNIDADES
        ============================================== -->

        <section class="units-card">
          <header class="table-header">
            <div>
              <span>
                Unidades
              </span>

              <strong>
                {{ filteredUnits.length }}
                resultados
              </strong>
            </div>

            <div class="table-context">
              <span>
                {{ selectedState }}
              </span>

              <small>
                {{
                  context.canManageDirectly
                    ? 'Gestión gerencial'
                    : 'Consulta territorial'
                }}
              </small>
            </div>
          </header>

          <div
            v-if="pagedUnits.length"
            class="table-wrapper"
          >
            <table>
              <thead>
                <tr>
                  <th>
                    Unidad
                  </th>

                  <th>
                    Región
                  </th>

                  <th>
                    Coordinador
                  </th>

                  <th>
                    Supervisor
                  </th>

                  <th>
                    Estado
                  </th>

                  <th></th>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="unit in pagedUnits"
                  :key="unit.id"
                  @click="openUnit(unit)"
                >
                  <td>
                    <div class="unit-cell">
                      <strong>
                        {{ unit.name }}
                      </strong>

                      <span>
                        {{ unit.clues || 'Sin CLUES' }}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div class="simple-cell">
                      <strong>
                        {{ unit.region || 'Sin región' }}
                      </strong>

                      <span v-if="unit.project">
                        {{ unit.project }}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div class="simple-cell">
                      <strong>
                        {{
                          unit.coordinatorName ||
                          'Sin territorio'
                        }}
                      </strong>
                    </div>
                  </td>

                  <td>
                    <div class="supervisor-stack">
                      <div class="supervisor-cell">
                        <template v-if="unit.supervisorName">
                          <div class="person-dot">
                            {{ initials(unit.supervisorName) }}
                          </div>

                          <strong>
                            {{ unit.supervisorName }}
                          </strong>
                        </template>

                        <span
                          v-else
                          class="vacant-label"
                        >
                          Sin supervisor titular
                        </span>
                      </div>

                      <span
                        v-if="coverageSummaryFor(unit.id)"
                        class="coverage-mini"
                        :class="
                          coverageClass(
                            coverageSummaryFor(unit.id)
                              .effectiveStatus
                          )
                        "
                      >
                        {{
                          coverageShortLabel(
                            coverageSummaryFor(unit.id)
                          )
                        }}
                      </span>
                    </div>
                  </td>

                  <td>
                    <span
                      class="status-badge"
                      :class="
                        unit.assignmentStatus
                          .toLowerCase()
                      "
                    >
                      {{
                        assignmentLabel(
                          unit.assignmentStatus
                        )
                      }}
                    </span>
                  </td>

                  <td class="arrow">
                    ›
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            v-else
            class="empty-state"
          >
            <div>
              A
            </div>

            <strong>
              No hay resultados
            </strong>

            <span>
              Modifica los filtros para consultar
              otras unidades.
            </span>
          </div>

          <footer
            v-if="filteredUnits.length > pageSize"
            class="pagination"
          >
            <button
              type="button"
              :disabled="currentPage <= 1"
              @click="currentPage--"
            >
              ‹
            </button>

            <span>
              Página
              {{ currentPage }}
              de
              {{ totalPages }}
            </span>

            <button
              type="button"
              :disabled="currentPage >= totalPages"
              @click="currentPage++"
            >
              ›
            </button>
          </footer>
        </section>
      </template>
    </div>

    <!-- ===============================================
         DETALLE DE UNIDAD
    ================================================ -->

    <div
      v-if="selectedUnit"
      class="drawer-backdrop"
      @click.self="closeDrawer"
    >
      <aside class="unit-drawer">
        <header class="drawer-header">
          <div>
            <span>
              Detalle de asignación
            </span>

            <h2>
              {{ selectedUnit.name }}
            </h2>

            <p>
              {{ selectedUnit.clues || 'Sin CLUES' }}
            </p>
          </div>

          <button
            type="button"
            @click="closeDrawer"
          >
            ×
          </button>
        </header>

        <div class="drawer-status">
          <span
            class="status-badge"
            :class="
              selectedUnit.assignmentStatus
                .toLowerCase()
            "
          >
            {{
              assignmentLabel(
                selectedUnit.assignmentStatus
              )
            }}
          </span>
        </div>

        <section class="detail-grid">
          <div>
            <span>
              Estado
            </span>

            <strong>
              {{ selectedUnit.state }}
            </strong>
          </div>

          <div>
            <span>
              Región
            </span>

            <strong>
              {{ selectedUnit.region || 'Sin región' }}
            </strong>
          </div>

          <div>
            <span>
              Proyecto
            </span>

            <strong>
              {{ selectedUnit.project || 'Sin proyecto' }}
            </strong>
          </div>

          <div>
            <span>
              Estatus
            </span>

            <strong>
              {{ selectedUnit.status || 'Sin estatus' }}
            </strong>
          </div>
        </section>

        <section class="assignment-block">
          <span>
            Coordinador territorial
          </span>

          <strong>
            {{
              selectedUnit.coordinatorName ||
              'Sin coordinador'
            }}
          </strong>
        </section>

        <section
          class="assignment-block"
          :class="{
            vacant:
              !selectedUnit.supervisorName,
          }"
        >
          <span>
            Supervisor titular
          </span>

          <strong>
            {{
              selectedUnit.supervisorName ||
              'Sin supervisor asignado'
            }}
          </strong>
        </section>

        <!-- =============================================
             COBERTURA VIGENTE / PROGRAMADA
        ============================================== -->

        <section
          v-if="selectedCoverageSummary"
          class="current-coverage-card"
          :class="
            coverageClass(
              selectedCoverageSummary.effectiveStatus
            )
          "
        >
          <header>
            <div>
              <span>
                Cobertura temporal
              </span>

              <strong>
                {{
                  coverageStatusLabel(
                    selectedCoverageSummary
                      .effectiveStatus
                  )
                }}
              </strong>
            </div>

            <span
              class="coverage-status-pill"
              :class="
                coverageClass(
                  selectedCoverageSummary
                    .effectiveStatus
                )
              "
            >
              {{
                coverageStatusLabel(
                  selectedCoverageSummary
                    .effectiveStatus
                )
              }}
            </span>
          </header>

          <div class="coverage-person">
            <div class="coverage-avatar">
              {{
                initials(
                  selectedCoverageSummary
                    .coveringSupervisorName
                )
              }}
            </div>

            <div>
              <strong>
                {{
                  selectedCoverageSummary
                    .coveringSupervisorName
                }}
              </strong>

              <span>
                Supervisor de cobertura
              </span>
            </div>
          </div>

          <div class="coverage-period">
            <span>
              Periodo autorizado
            </span>

            <strong>
              {{
                formatDateRange(
                  selectedCoverageSummary.startDate,
                  selectedCoverageSummary.endDate
                )
              }}
            </strong>
          </div>

          <p
            v-if="
              selectedCoverageSummary.requestComment
            "
          >
            {{
              selectedCoverageSummary
                .requestComment
            }}
          </p>

          <button
            v-if="
              context.canManageDirectly &&
              canCancelCoverage(
                selectedCoverageSummary
              )
            "
            type="button"
            class="cancel-coverage-button"
            @click="
              openCancelCoverageModal(
                selectedCoverageSummary
              )
            "
          >
            Cancelar cobertura
          </button>
        </section>

        <!-- =============================================
             GESTIÓN PERMANENTE
        ============================================== -->

        <section
          v-if="
            context.canManageDirectly &&
            canManageSelectedUnit
          "
          class="management-actions"
        >
          <span>
            Gestión permanente
          </span>

          <div
            v-if="selectedUnit.supervisorId"
            class="action-grid"
          >
            <button
              type="button"
              class="action-button primary"
              @click="openReassignModal"
            >
              Reasignar supervisor
            </button>

            <button
              type="button"
              class="action-button danger"
              @click="openRevokeModal"
            >
              Dejar sin supervisor
            </button>
          </div>

          <button
            v-else
            type="button"
            class="action-button primary full"
            @click="openAssignModal"
          >
            Asignar supervisor titular
          </button>

          <small>
            Los cambios permanentes actualizan el ámbito
            del supervisor en web y móvil.
          </small>
        </section>

        <!-- =============================================
             CREAR O SOLICITAR COBERTURA
        ============================================== -->

        <section
          v-if="
            canManageSelectedUnit &&
            (
              context.canManageDirectly ||
              context.canRequestChanges
            )
          "
          class="coverage-actions"
        >
          <span>
            Cobertura temporal
          </span>

          <strong>
            {{
              context.canManageDirectly
                ? 'Crear cobertura directa'
                : 'Solicitar cobertura'
            }}
          </strong>

          <p>
            {{
              context.canManageDirectly
                ? 'La cobertura quedará autorizada inmediatamente.'
                : 'La solicitud será enviada al gerente para aprobación.'
            }}
          </p>

          <button
            type="button"
            class="coverage-action-button"
            :disabled="drawerSupervisors.length === 0"
            @click="openCoverageModal"
          >
            {{
              context.canManageDirectly
                ? 'Crear cobertura temporal'
                : 'Solicitar cobertura temporal'
            }}
          </button>

          <small
            v-if="drawerSupervisors.length === 0"
          >
            No existe otro supervisor activo dentro
            de esta coordinación.
          </small>
        </section>

        <!-- =============================================
             HISTORIAL DE COBERTURAS
        ============================================== -->

        <section class="coverage-history-section">
          <header>
            <div>
              <span>
                Coberturas
              </span>

              <strong>
                Historial temporal
              </strong>
            </div>

            <span class="history-count">
              {{ selectedUnitCoverages.length }}
            </span>
          </header>

          <div
            v-if="selectedUnitCoverages.length"
            class="coverage-history-list"
          >
            <article
              v-for="coverage in selectedUnitCoverages"
              :key="coverage.id"
              class="coverage-history-item"
            >
              <div
                class="coverage-history-dot"
                :class="
                  coverageClass(
                    coverage.effectiveStatus
                  )
                "
              ></div>

              <div class="coverage-history-copy">
                <div class="coverage-history-heading">
                  <strong>
                    {{ coverage.coveringSupervisorName }}
                  </strong>

                  <span
                    class="coverage-status-pill"
                    :class="
                      coverageClass(
                        coverage.effectiveStatus
                      )
                    "
                  >
                    {{
                      coverageStatusLabel(
                        coverage.effectiveStatus
                      )
                    }}
                  </span>
                </div>

                <span>
                  {{
                    formatDateRange(
                      coverage.startDate,
                      coverage.endDate
                    )
                  }}
                </span>

                <span>
                  Solicitado por:
                  {{
                    coverage.requestedByName ||
                    'Sin identificar'
                  }}
                </span>

                <p v-if="coverage.requestComment">
                  {{ coverage.requestComment }}
                </p>

                <p
                  v-if="coverage.reviewComment"
                  class="review-comment"
                >
                  Revisión:
                  {{ coverage.reviewComment }}
                </p>

                <p
                  v-if="coverage.cancellationReason"
                  class="cancel-comment"
                >
                  Cancelación:
                  {{ coverage.cancellationReason }}
                </p>
              </div>
            </article>
          </div>

          <div
            v-else
            class="history-empty"
          >
            Esta unidad no tiene coberturas registradas.
          </div>
        </section>

        <!-- =============================================
             HISTORIAL PERMANENTE
        ============================================== -->

        <section class="history-section">
          <header>
            <div>
              <span>
                Trazabilidad
              </span>

              <strong>
                Historial de titularidad
              </strong>
            </div>

            <button
              type="button"
              :disabled="historyLoading"
              @click="loadHistory"
            >
              Actualizar
            </button>
          </header>

          <div
            v-if="historyLoading"
            class="history-loading"
          >
            Cargando historial...
          </div>

          <div
            v-else-if="historyError"
            class="history-error"
          >
            {{ historyError }}
          </div>

          <div
            v-else-if="assignmentHistory.length"
            class="timeline"
          >
            <article
              v-for="assignment in assignmentHistory"
              :key="assignment.id"
              class="timeline-item"
            >
              <div
                class="timeline-dot"
                :class="{
                  active:
                    assignment.active,
                }"
              ></div>

              <div>
                <strong>
                  {{ assignment.supervisorName }}
                </strong>

                <span>
                  Asignado:
                  {{
                    formatDateTime(
                      assignment.assignedAt
                    )
                  }}
                </span>

                <span v-if="assignment.assignedByName">
                  Por:
                  {{ assignment.assignedByName }}
                </span>

                <p v-if="assignment.assignmentComment">
                  {{ assignment.assignmentComment }}
                </p>

                <template v-if="assignment.revokedAt">
                  <span class="revoked">
                    Revocado:
                    {{
                      formatDateTime(
                        assignment.revokedAt
                      )
                    }}
                  </span>

                  <p v-if="assignment.revocationReason">
                    {{ assignment.revocationReason }}
                  </p>
                </template>

                <span
                  v-else
                  class="active-label"
                >
                  Asignación vigente
                </span>
              </div>
            </article>
          </div>

          <div
            v-else
            class="history-empty"
          >
            No existen asignaciones históricas.
          </div>
        </section>
      </aside>
    </div>

    <!-- ===============================================
         MODAL ASIGNAR / REASIGNAR
    ================================================ -->

    <div
      v-if="
        assignmentActionMode === 'ASSIGN' ||
        assignmentActionMode === 'REASSIGN'
      "
      class="modal-backdrop"
      @click.self="closeAssignmentModal"
    >
      <section class="action-modal">
        <span class="modal-kicker">
          Gestión permanente
        </span>

        <h2>
          {{
            assignmentActionMode === 'ASSIGN'
              ? 'Asignar supervisor'
              : 'Reasignar supervisor'
          }}
        </h2>

        <p>
          {{ selectedUnit?.name }}
        </p>

        <label class="modal-field">
          <span>
            Nuevo supervisor *
          </span>

          <select
            v-model="targetSupervisorId"
            :disabled="actionLoading"
          >
            <option value="">
              Selecciona un supervisor
            </option>

            <option
              v-for="supervisor in drawerSupervisors"
              :key="supervisor.id"
              :value="supervisor.id"
              :disabled="
                supervisor.id ===
                selectedUnit?.supervisorId
              "
            >
              {{ supervisor.name }}
              ·
              {{ supervisor.assignedUnitsCount }}
              unidades
            </option>
          </select>
        </label>

        <label class="modal-field">
          <span>
            Motivo del cambio *
          </span>

          <textarea
            v-model="actionComment"
            rows="5"
            maxlength="1000"
            :disabled="actionLoading"
            placeholder="Describe el motivo de la asignación..."
          ></textarea>

          <small>
            {{ actionComment.length }}/1000
          </small>
        </label>

        <ActionError
          :message="actionError"
          :details="actionErrorDetails"
        />

        <div class="modal-actions">
          <button
            type="button"
            class="cancel-button"
            :disabled="actionLoading"
            @click="closeAssignmentModal"
          >
            Cancelar
          </button>

          <button
            type="button"
            class="confirm-button"
            :disabled="
              actionLoading ||
              !targetSupervisorId ||
              actionComment.trim().length < 5
            "
            @click="submitAssignment"
          >
            {{
              actionLoading
                ? 'Guardando...'
                : assignmentActionMode === 'ASSIGN'
                  ? 'Asignar supervisor'
                  : 'Confirmar reasignación'
            }}
          </button>
        </div>
      </section>
    </div>

    <!-- ===============================================
         MODAL DEJAR VACANTE
    ================================================ -->

    <div
      v-if="assignmentActionMode === 'REVOKE'"
      class="modal-backdrop"
      @click.self="closeAssignmentModal"
    >
      <section class="action-modal">
        <span class="modal-kicker danger">
          Dejar vacante
        </span>

        <h2>
          Dejar unidad sin supervisor
        </h2>

        <p>
          La unidad conservará su coordinador territorial.
        </p>

        <div class="warning-box">
          <strong>
            Supervisor actual
          </strong>

          <span>
            {{ selectedUnit?.supervisorName }}
          </span>
        </div>

        <label class="modal-field">
          <span>
            Motivo *
          </span>

          <textarea
            v-model="actionComment"
            rows="5"
            maxlength="1000"
            :disabled="actionLoading"
            placeholder="Describe por qué la unidad quedará vacante..."
          ></textarea>

          <small>
            {{ actionComment.length }}/1000
          </small>
        </label>

        <ActionError
          :message="actionError"
          :details="actionErrorDetails"
        />

        <div class="modal-actions">
          <button
            type="button"
            class="cancel-button"
            :disabled="actionLoading"
            @click="closeAssignmentModal"
          >
            Cancelar
          </button>

          <button
            type="button"
            class="confirm-button danger"
            :disabled="
              actionLoading ||
              actionComment.trim().length < 5
            "
            @click="submitRevoke"
          >
            {{
              actionLoading
                ? 'Procesando...'
                : 'Dejar sin supervisor'
            }}
          </button>
        </div>
      </section>
    </div>

    <!-- ===============================================
         MODAL CREAR / SOLICITAR COBERTURA
    ================================================ -->

    <div
      v-if="coverageModalOpen"
      class="modal-backdrop"
      @click.self="closeCoverageModal"
    >
      <section class="action-modal coverage-modal">
        <span class="modal-kicker coverage">
          Cobertura temporal
        </span>

        <h2>
          {{
            context.canManageDirectly
              ? 'Crear cobertura directa'
              : 'Solicitar cobertura'
          }}
        </h2>

        <p>
          {{ selectedUnit?.name }}
        </p>

        <div class="coverage-explanation">
          <strong>
            {{
              context.canManageDirectly
                ? 'Autorización inmediata'
                : 'Requiere aprobación'
            }}
          </strong>

          <span>
            {{
              context.canManageDirectly
                ? 'La cobertura quedará aprobada y disponible durante el periodo indicado.'
                : 'El gerente deberá revisar y aprobar la solicitud antes de que entre en vigor.'
            }}
          </span>
        </div>

        <label class="modal-field">
          <span>
            Supervisor de cobertura *
          </span>

          <select
            v-model="coverageSupervisorId"
            :disabled="coverageLoading"
          >
            <option value="">
              Selecciona un supervisor
            </option>

            <option
              v-for="supervisor in drawerSupervisors"
              :key="supervisor.id"
              :value="supervisor.id"
            >
              {{ supervisor.name }}
              ·
              {{ supervisor.assignedUnitsCount }}
              unidades titulares
            </option>
          </select>
        </label>

        <div class="date-fields">
          <label class="modal-field">
            <span>
              Fecha inicial *
            </span>

            <input
              v-model="coverageStartDate"
              type="date"
              :min="todayIso"
              :disabled="coverageLoading"
              @change="ensureCoverageEndDate"
            />
          </label>

          <label class="modal-field">
            <span>
              Fecha final *
            </span>

            <input
              v-model="coverageEndDate"
              type="date"
              :min="coverageStartDate || todayIso"
              :disabled="coverageLoading"
            />
          </label>
        </div>

        <label class="modal-field">
          <span>
            Motivo de la cobertura *
          </span>

          <textarea
            v-model="coverageComment"
            rows="5"
            maxlength="2000"
            :disabled="coverageLoading"
            placeholder="Vacaciones, incapacidad, apoyo temporal, vacante operativa..."
          ></textarea>

          <small>
            {{ coverageComment.length }}/2000
          </small>
        </label>

        <ActionError
          :message="coverageError"
          :details="coverageErrorDetails"
        />

        <div class="modal-actions">
          <button
            type="button"
            class="cancel-button"
            :disabled="coverageLoading"
            @click="closeCoverageModal"
          >
            Cancelar
          </button>

          <button
            type="button"
            class="confirm-button coverage"
            :disabled="
              coverageLoading ||
              !coverageSupervisorId ||
              !coverageStartDate ||
              !coverageEndDate ||
              coverageComment.trim().length < 5
            "
            @click="submitCoverage"
          >
            {{
              coverageLoading
                ? 'Procesando...'
                : context.canManageDirectly
                  ? 'Crear y autorizar'
                  : 'Enviar solicitud'
            }}
          </button>
        </div>
      </section>
    </div>

    <!-- ===============================================
         MODAL CANCELAR COBERTURA
    ================================================ -->

    <div
      v-if="coverageCancelTarget"
      class="modal-backdrop"
      @click.self="closeCancelCoverageModal"
    >
      <section class="action-modal">
        <span class="modal-kicker danger">
          Cancelar cobertura
        </span>

        <h2>
          Finalizar cobertura temporal
        </h2>

        <p>
          El supervisor de cobertura perderá el acceso
          temporal a la unidad.
        </p>

        <div class="warning-box">
          <strong>
            {{ coverageCancelTarget.coveringSupervisorName }}
          </strong>

          <span>
            {{
              formatDateRange(
                coverageCancelTarget.startDate,
                coverageCancelTarget.endDate
              )
            }}
          </span>
        </div>

        <label class="modal-field">
          <span>
            Motivo de cancelación *
          </span>

          <textarea
            v-model="coverageCancellationComment"
            rows="5"
            maxlength="2000"
            :disabled="coverageLoading"
            placeholder="Describe por qué se cancela la cobertura..."
          ></textarea>

          <small>
            {{ coverageCancellationComment.length }}/2000
          </small>
        </label>

        <ActionError
          :message="coverageError"
          :details="coverageErrorDetails"
        />

        <div class="modal-actions">
          <button
            type="button"
            class="cancel-button"
            :disabled="coverageLoading"
            @click="closeCancelCoverageModal"
          >
            Volver
          </button>

          <button
            type="button"
            class="confirm-button danger"
            :disabled="
              coverageLoading ||
              coverageCancellationComment.trim().length < 5
            "
            @click="submitCancelCoverage"
          >
            {{
              coverageLoading
                ? 'Cancelando...'
                : 'Cancelar cobertura'
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
  defineComponent,
  h,
  onMounted,
  ref,
  watch,
} from 'vue'

import {
  assignWebPharmacySupervisor,
  cancelWebCoverage,
  createWebCoverage,
  getWebAssignmentHistory,
  getWebAssignments,
  getWebContext,
  getWebCoverages,
  revokeWebPharmacySupervisor,
} from '../../services/api.js'

// ============================================================
// ESTADO GENERAL
// ============================================================

const loading =
  ref(true)

const error =
  ref(null)

const successMessage =
  ref(null)

const states =
  ref([])

const selectedState =
  ref('')

const response =
  ref(null)

const coverageResponse =
  ref(null)

// ============================================================
// FILTROS
// ============================================================

const search =
  ref('')

const coordinatorFilter =
  ref('')

const supervisorFilter =
  ref('')

const assignmentFilter =
  ref('')

const selectedUnit =
  ref(null)

const currentPage =
  ref(1)

const pageSize =
  50

// ============================================================
// HISTORIAL PERMANENTE
// ============================================================

const historyLoading =
  ref(false)

const historyError =
  ref(null)

const historyResponse =
  ref(null)

// ============================================================
// ACCIONES PERMANENTES
// ============================================================

const assignmentActionMode =
  ref(null)

const targetSupervisorId =
  ref('')

const actionComment =
  ref('')

const actionLoading =
  ref(false)

const actionError =
  ref(null)

const actionErrorDetails =
  ref(null)

// ============================================================
// COBERTURAS
// ============================================================

const coverageModalOpen =
  ref(false)

const coverageSupervisorId =
  ref('')

const coverageStartDate =
  ref('')

const coverageEndDate =
  ref('')

const coverageComment =
  ref('')

const coverageLoading =
  ref(false)

const coverageError =
  ref(null)

const coverageErrorDetails =
  ref(null)

const coverageCancelTarget =
  ref(null)

const coverageCancellationComment =
  ref('')

// ============================================================
// CONTEXTO
// ============================================================

const context =
  computed(
    () => ({
      role:
        response.value
          ?.context
          ?.role ||
        '',

      canManageDirectly:
        Boolean(
          response.value
            ?.context
            ?.canManageDirectly
        ),

      canRequestChanges:
        Boolean(
          response.value
            ?.context
            ?.canRequestChanges
        ),
    })
  )

const totals =
  computed(
    () => ({
      registeredUnitsCount:
        Number(
          response.value
            ?.totals
            ?.registeredUnitsCount ||
          0
        ),

      operationalUnitsCount:
        Number(
          response.value
            ?.totals
            ?.operationalUnitsCount ||
          0
        ),

      assignedUnitsCount:
        Number(
          response.value
            ?.totals
            ?.assignedUnitsCount ||
          0
        ),

      unassignedUnitsCount:
        Number(
          response.value
            ?.totals
            ?.unassignedUnitsCount ||
          0
        ),

      inactiveUnitsCount:
        Number(
          response.value
            ?.totals
            ?.inactiveUnitsCount ||
          0
        ),
    })
  )

const coverageTotals =
  computed(
    () => ({
      total:
        Number(
          coverageResponse.value
            ?.totals
            ?.total ||
          0
        ),

      pending:
        Number(
          coverageResponse.value
            ?.totals
            ?.pending ||
          0
        ),

      scheduled:
        Number(
          coverageResponse.value
            ?.totals
            ?.scheduled ||
          0
        ),

      active:
        Number(
          coverageResponse.value
            ?.totals
            ?.active ||
          0
        ),

      expired:
        Number(
          coverageResponse.value
            ?.totals
            ?.expired ||
          0
        ),

      rejected:
        Number(
          coverageResponse.value
            ?.totals
            ?.rejected ||
          0
        ),

      cancelled:
        Number(
          coverageResponse.value
            ?.totals
            ?.cancelled ||
          0
        ),
    })
  )

const coordinators =
  computed(
    () =>
      Array.isArray(
        response.value?.coordinators
      )
        ? response.value.coordinators
        : []
  )

const supervisors =
  computed(
    () =>
      Array.isArray(
        response.value?.supervisors
      )
        ? response.value.supervisors
        : []
  )

const units =
  computed(
    () =>
      Array.isArray(
        response.value?.units
      )
        ? response.value.units
        : []
  )

const coverages =
  computed(
    () =>
      Array.isArray(
        coverageResponse.value?.coverages
      )
        ? coverageResponse.value.coverages
        : []
  )

const assignmentHistory =
  computed(
    () =>
      Array.isArray(
        historyResponse.value
          ?.assignments
      )
        ? historyResponse.value
            .assignments
        : []
  )

// ============================================================
// COBERTURAS POR UNIDAD
// ============================================================

const coverageSummaryByUnit =
  computed(
    () => {
      const result =
        new Map()

      const priority = {
        ACTIVE:
          1,

        SCHEDULED:
          2,

        PENDING_APPROVAL:
          3,

        APPROVED:
          4,

        EXPIRED:
          5,

        REJECTED:
          6,

        CANCELLED:
          7,
      }

      for (
        const coverage
        of coverages.value
      ) {
        const key =
          String(
            coverage.pharmacyId
          )

        const current =
          result.get(
            key
          )

        if (!current) {
          result.set(
            key,
            coverage
          )

          continue
        }

        const currentPriority =
          priority[
            current.effectiveStatus
          ] ??
          99

        const nextPriority =
          priority[
            coverage.effectiveStatus
          ] ??
          99

        if (
          nextPriority <
          currentPriority
        ) {
          result.set(
            key,
            coverage
          )
        }
      }

      return result
    }
  )

const selectedUnitCoverages =
  computed(
    () => {
      if (
        !selectedUnit.value?.id
      ) {
        return []
      }

      return coverages.value
        .filter(
          coverage =>
            String(
              coverage.pharmacyId
            ) ===
            String(
              selectedUnit.value.id
            )
        )
        .sort(
          (
            first,
            second
          ) =>
            String(
              second.startDate ||
              ''
            ).localeCompare(
              String(
                first.startDate ||
                ''
              )
            )
        )
    }
  )

const selectedCoverageSummary =
  computed(
    () => {
      if (
        !selectedUnit.value?.id
      ) {
        return null
      }

      const summary =
        coverageSummaryByUnit.value.get(
          String(
            selectedUnit.value.id
          )
        )

      if (
        !summary ||
        ![
          'ACTIVE',
          'SCHEDULED',
          'PENDING_APPROVAL',
        ].includes(
          summary.effectiveStatus
        )
      ) {
        return null
      }

      return summary
    }
  )

// ============================================================
// SUPERVISORES
// ============================================================

const availableSupervisors =
  computed(
    () => {
      if (
        !coordinatorFilter.value
      ) {
        return supervisors.value
      }

      return supervisors.value.filter(
        supervisor =>
          supervisor.coordinatorId ===
          coordinatorFilter.value
      )
    }
  )

const drawerSupervisors =
  computed(
    () => {
      if (
        !selectedUnit.value
          ?.coordinatorId
      ) {
        return []
      }

      return supervisors.value.filter(
        supervisor =>
          supervisor.coordinatorId ===
            selectedUnit.value
              .coordinatorId &&
          supervisor.id !==
            selectedUnit.value
              .supervisorId
      )
    }
  )

const canManageSelectedUnit =
  computed(
    () =>
      Boolean(
        selectedUnit.value &&
        selectedUnit.value
          .assignmentStatus !==
          'INACTIVE' &&
        selectedUnit.value
          .assignmentStatus !==
          'UNCLASSIFIED' &&
        selectedUnit.value
          .coordinatorId
      )
  )

// ============================================================
// FILTRADO Y PAGINACIÓN
// ============================================================

const filteredUnits =
  computed(
    () => {
      const query =
        search.value
          .trim()
          .toLocaleLowerCase(
            'es-MX'
          )

      return units.value.filter(
        unit => {
          if (
            coordinatorFilter.value &&
            unit.coordinatorId !==
              coordinatorFilter.value
          ) {
            return false
          }

          if (
            supervisorFilter.value &&
            unit.supervisorId !==
              supervisorFilter.value
          ) {
            return false
          }

          if (
            assignmentFilter.value &&
            unit.assignmentStatus !==
              assignmentFilter.value
          ) {
            return false
          }

          if (query) {
            const text =
              [
                unit.clues,
                unit.name,
                unit.region,
                unit.project,
                unit.address,
                unit.coordinatorName,
                unit.supervisorName,
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

          return true
        }
      )
    }
  )

const totalPages =
  computed(
    () =>
      Math.max(
        1,
        Math.ceil(
          filteredUnits.value.length /
          pageSize
        )
      )
  )

const pagedUnits =
  computed(
    () => {
      const safePage =
        Math.min(
          currentPage.value,
          totalPages.value
        )

      const start =
        (
          safePage -
          1
        ) *
        pageSize

      return filteredUnits.value.slice(
        start,
        start + pageSize
      )
    }
  )

const hasFilters =
  computed(
    () =>
      Boolean(
        search.value ||
        coordinatorFilter.value ||
        supervisorFilter.value ||
        assignmentFilter.value
      )
  )

const todayIso =
  computed(
    () =>
      toLocalIsoDate(
        new Date()
      )
  )

// ============================================================
// COMPONENTES INTERNOS
// ============================================================

const MetricCard =
  defineComponent({
    props: {
      label:
        String,

      value: {
        type: [
          String,
          Number,
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

const ActionError =
  defineComponent({
    props: {
      message:
        String,

      details:
        Object,
    },

    setup(
      props
    ) {
      return () => {
        if (!props.message) {
          return null
        }

        const children = [
          h(
            'strong',
            props.message
          ),
        ]

        if (
          props.details
            ?.supervisorName
        ) {
          children.push(
            h(
              'span',
              `Supervisor: ${props.details.supervisorName}`
            )
          )
        }

        if (
          props.details
            ?.scheduledDate
        ) {
          children.push(
            h(
              'span',
              `Fecha: ${props.details.scheduledDate}`
            )
          )
        }

        if (
          props.details
            ?.startDate &&
          props.details
            ?.endDate
        ) {
          children.push(
            h(
              'span',
              `Periodo existente: ${props.details.startDate} — ${props.details.endDate}`
            )
          )
        }

        return h(
          'div',
          {
            class:
              'action-error-box',
          },
          children
        )
      }
    },
  })

// ============================================================
// WATCHERS
// ============================================================

watch(
  [
    search,
    coordinatorFilter,
    supervisorFilter,
    assignmentFilter,
  ],
  () => {
    currentPage.value =
      1
  }
)

watch(
  coordinatorFilter,
  () => {
    if (
      supervisorFilter.value &&
      !availableSupervisors.value.some(
        supervisor =>
          supervisor.id ===
          supervisorFilter.value
      )
    ) {
      supervisorFilter.value =
        ''
    }
  }
)

// ============================================================
// INICIALIZACIÓN
// ============================================================

onMounted(
  initialize
)

async function initialize() {
  loading.value =
    true

  error.value =
    null

  try {
    const webContext =
      await getWebContext()

    states.value =
      Array.isArray(
        webContext?.states
      )
        ? webContext.states
        : []

    selectedState.value =
      states.value[0]?.name ||
      ''

    if (
      !selectedState.value
    ) {
      throw new Error(
        'No existe un estado autorizado para este perfil.'
      )
    }

    await loadAssignments()
  } catch (
    err
  ) {
    console.error(
      '[AssignmentsView][initialize]',
      err
    )

    error.value =
      err?.message ||
      'No fue posible cargar las asignaciones.'
  } finally {
    loading.value =
      false
  }
}

async function loadAssignments({
  silent = false,
  preserveUnitId = null,
} = {}) {
  if (
    !selectedState.value
  ) {
    return
  }

  if (!silent) {
    loading.value =
      true
  }

  error.value =
    null

  try {
    const [
      assignmentsData,
      coveragesData,
    ] =
      await Promise.all([
        getWebAssignments({
          state:
            selectedState.value,
        }),

        getWebCoverages({
          state:
            selectedState.value,
        }),
      ])

    response.value =
      assignmentsData

    coverageResponse.value =
      coveragesData

    if (preserveUnitId) {
      selectedUnit.value =
        units.value.find(
          unit =>
            unit.id ===
            String(
              preserveUnitId
            )
        ) ||
        null
    }
  } catch (
    err
  ) {
    console.error(
      '[AssignmentsView][load]',
      err
    )

    error.value =
      err?.message ||
      'No fue posible cargar las asignaciones.'
  } finally {
    loading.value =
      false
  }
}

async function handleStateChange() {
  clearFilters()
  closeDrawer()

  await loadAssignments()
}

// ============================================================
// FILTROS
// ============================================================

function toggleCoordinator(
  coordinatorId
) {
  coordinatorFilter.value =
    coordinatorFilter.value ===
      coordinatorId
      ? ''
      : coordinatorId
}

function clearFilters() {
  search.value =
    ''

  coordinatorFilter.value =
    ''

  supervisorFilter.value =
    ''

  assignmentFilter.value =
    ''

  currentPage.value =
    1
}

// ============================================================
// DRAWER
// ============================================================

async function openUnit(
  unit
) {
  selectedUnit.value =
    unit

  historyResponse.value =
    null

  await loadHistory()
}

function closeDrawer() {
  selectedUnit.value =
    null

  historyResponse.value =
    null

  historyError.value =
    null

  closeAssignmentModal()
  closeCoverageModal()
  closeCancelCoverageModal()
}

async function loadHistory() {
  if (
    !selectedUnit.value?.id
  ) {
    return
  }

  historyLoading.value =
    true

  historyError.value =
    null

  try {
    historyResponse.value =
      await getWebAssignmentHistory(
        selectedUnit.value.id
      )
  } catch (
    err
  ) {
    console.error(
      '[AssignmentsView][history]',
      err
    )

    historyResponse.value =
      null

    historyError.value =
      err?.message ||
      'No fue posible cargar el historial.'
  } finally {
    historyLoading.value =
      false
  }
}

// ============================================================
// ASIGNACIÓN PERMANENTE
// ============================================================

function openAssignModal() {
  assignmentActionMode.value =
    'ASSIGN'

  targetSupervisorId.value =
    ''

  resetAssignmentAction()
}

function openReassignModal() {
  assignmentActionMode.value =
    'REASSIGN'

  targetSupervisorId.value =
    ''

  resetAssignmentAction()
}

function openRevokeModal() {
  assignmentActionMode.value =
    'REVOKE'

  targetSupervisorId.value =
    ''

  resetAssignmentAction()
}

function resetAssignmentAction() {
  actionComment.value =
    ''

  actionError.value =
    null

  actionErrorDetails.value =
    null
}

function closeAssignmentModal() {
  if (
    actionLoading.value
  ) {
    return
  }

  assignmentActionMode.value =
    null

  targetSupervisorId.value =
    ''

  resetAssignmentAction()
}

async function submitAssignment() {
  if (
    !selectedUnit.value?.id ||
    !targetSupervisorId.value ||
    actionLoading.value
  ) {
    return
  }

  actionLoading.value =
    true

  actionError.value =
    null

  actionErrorDetails.value =
    null

  const unitId =
    selectedUnit.value.id

  try {
    await assignWebPharmacySupervisor(
      unitId,
      {
        supervisorId:
          targetSupervisorId.value,

        comment:
          actionComment.value.trim(),
      }
    )

    assignmentActionMode.value =
      null

    successMessage.value =
      'La asignación permanente se actualizó correctamente.'

    await loadAssignments({
      silent:
        true,

      preserveUnitId:
        unitId,
    })

    await loadHistory()
  } catch (
    err
  ) {
    console.error(
      '[AssignmentsView][assignment]',
      err
    )

    actionError.value =
      err?.message ||
      'No fue posible guardar la asignación.'

    actionErrorDetails.value =
      err?.details ||
      null
  } finally {
    actionLoading.value =
      false
  }
}

async function submitRevoke() {
  if (
    !selectedUnit.value?.id ||
    actionLoading.value
  ) {
    return
  }

  actionLoading.value =
    true

  actionError.value =
    null

  actionErrorDetails.value =
    null

  const unitId =
    selectedUnit.value.id

  try {
    await revokeWebPharmacySupervisor(
      unitId,
      {
        comment:
          actionComment.value.trim(),
      }
    )

    assignmentActionMode.value =
      null

    successMessage.value =
      'La unidad quedó sin supervisor titular.'

    await loadAssignments({
      silent:
        true,

      preserveUnitId:
        unitId,
    })

    await loadHistory()
  } catch (
    err
  ) {
    console.error(
      '[AssignmentsView][revoke]',
      err
    )

    actionError.value =
      err?.message ||
      'No fue posible dejar la unidad sin supervisor.'

    actionErrorDetails.value =
      err?.details ||
      null
  } finally {
    actionLoading.value =
      false
  }
}

// ============================================================
// COBERTURAS
// ============================================================

function openCoverageModal() {
  coverageSupervisorId.value =
    ''

  coverageStartDate.value =
    todayIso.value

  coverageEndDate.value =
    addDaysIso(
      todayIso.value,
      7
    )

  coverageComment.value =
    ''

  coverageError.value =
    null

  coverageErrorDetails.value =
    null

  coverageModalOpen.value =
    true
}

function closeCoverageModal() {
  if (
    coverageLoading.value
  ) {
    return
  }

  coverageModalOpen.value =
    false

  coverageSupervisorId.value =
    ''

  coverageStartDate.value =
    ''

  coverageEndDate.value =
    ''

  coverageComment.value =
    ''

  coverageError.value =
    null

  coverageErrorDetails.value =
    null
}

function ensureCoverageEndDate() {
  if (
    !coverageStartDate.value
  ) {
    return
  }

  if (
    !coverageEndDate.value ||
    coverageEndDate.value <
      coverageStartDate.value
  ) {
    coverageEndDate.value =
      addDaysIso(
        coverageStartDate.value,
        7
      )
  }
}

async function submitCoverage() {
  if (
    !selectedUnit.value?.id ||
    !coverageSupervisorId.value ||
    coverageLoading.value
  ) {
    return
  }

  coverageLoading.value =
    true

  coverageError.value =
    null

  coverageErrorDetails.value =
    null

  const unitId =
    selectedUnit.value.id

  try {
    const result =
      await createWebCoverage({
        pharmacyId:
          unitId,

        coveringSupervisorId:
          coverageSupervisorId.value,

        startDate:
          coverageStartDate.value,

        endDate:
          coverageEndDate.value,

        comment:
          coverageComment.value.trim(),
      })

    coverageModalOpen.value =
      false

    successMessage.value =
      result?.action ===
        'CREATED_AND_APPROVED'
        ? 'La cobertura fue creada y autorizada correctamente.'
        : 'La solicitud de cobertura fue enviada para aprobación.'

    await loadAssignments({
      silent:
        true,

      preserveUnitId:
        unitId,
    })
  } catch (
    err
  ) {
    console.error(
      '[AssignmentsView][coverage-create]',
      err
    )

    coverageError.value =
      err?.message ||
      'No fue posible crear la cobertura.'

    coverageErrorDetails.value =
      err?.details ||
      null
  } finally {
    coverageLoading.value =
      false
  }
}

function openCancelCoverageModal(
  coverage
) {
  coverageCancelTarget.value =
    coverage

  coverageCancellationComment.value =
    ''

  coverageError.value =
    null

  coverageErrorDetails.value =
    null
}

function closeCancelCoverageModal() {
  if (
    coverageLoading.value
  ) {
    return
  }

  coverageCancelTarget.value =
    null

  coverageCancellationComment.value =
    ''

  coverageError.value =
    null

  coverageErrorDetails.value =
    null
}

async function submitCancelCoverage() {
  if (
    !coverageCancelTarget.value?.id ||
    coverageLoading.value
  ) {
    return
  }

  coverageLoading.value =
    true

  coverageError.value =
    null

  coverageErrorDetails.value =
    null

  const unitId =
    selectedUnit.value?.id

  try {
    await cancelWebCoverage(
      coverageCancelTarget.value.id,
      {
        comment:
          coverageCancellationComment.value.trim(),
      }
    )

    coverageCancelTarget.value =
      null

    successMessage.value =
      'La cobertura temporal fue cancelada.'

    await loadAssignments({
      silent:
        true,

      preserveUnitId:
        unitId,
    })
  } catch (
    err
  ) {
    console.error(
      '[AssignmentsView][coverage-cancel]',
      err
    )

    coverageError.value =
      err?.message ||
      'No fue posible cancelar la cobertura.'

    coverageErrorDetails.value =
      err?.details ||
      null
  } finally {
    coverageLoading.value =
      false
  }
}

function canCancelCoverage(
  coverage
) {
  return (
    coverage?.status ===
      'APPROVED' &&
    [
      'ACTIVE',
      'SCHEDULED',
    ].includes(
      coverage?.effectiveStatus
    )
  )
}

// ============================================================
// PRESENTACIÓN
// ============================================================

function coverageSummaryFor(
  unitId
) {
  return (
    coverageSummaryByUnit.value.get(
      String(
        unitId
      )
    ) ||
    null
  )
}

function coverageShortLabel(
  coverage
) {
  if (!coverage) {
    return ''
  }

  const prefix =
    coverage.effectiveStatus ===
      'ACTIVE'
      ? 'Cobertura activa'
      : coverage.effectiveStatus ===
          'SCHEDULED'
        ? 'Cobertura programada'
        : coverage.effectiveStatus ===
            'PENDING_APPROVAL'
          ? 'Cobertura pendiente'
          : 'Cobertura'

  return `${prefix}: ${coverage.coveringSupervisorName}`
}

function coverageStatusLabel(
  status
) {
  const labels = {
    ACTIVE:
      'Activa',

    SCHEDULED:
      'Programada',

    EXPIRED:
      'Finalizada',

    PENDING_APPROVAL:
      'Pendiente',

    APPROVED:
      'Aprobada',

    REJECTED:
      'Rechazada',

    CANCELLED:
      'Cancelada',
  }

  return (
    labels[status] ||
    status ||
    'Sin estado'
  )
}

function coverageClass(
  status
) {
  return String(
    status ||
    ''
  )
    .trim()
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

function assignmentLabel(
  status
) {
  const labels = {
    ASSIGNED:
      'Asignada',

    UNASSIGNED:
      'Sin supervisor',

    INACTIVE:
      'Inactiva',

    UNCLASSIFIED:
      'Sin clasificar',
  }

  return (
    labels[status] ||
    status
  )
}

function formatDateRange(
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
    start === end
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
  if (!value) {
    return '—'
  }

  const date =
    new Date(
      `${String(value).slice(0, 10)}T12:00:00`
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
    }
  ).format(
    date
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

function toLocalIsoDate(
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

function addDaysIso(
  value,
  days
) {
  const date =
    new Date(
      `${value}T12:00:00`
    )

  date.setDate(
    date.getDate() +
    days
  )

  return toLocalIsoDate(
    date
  )
}
</script>

<style scoped>
.assignments-page {
  width: 100%;
  min-height: 100%;
  padding: 28px 28px 52px;
  background: var(--color-background);
  color: var(--color-text);
}

.assignments-container {
  width: min(var(--content-max-width), 100%);
  margin: 0 auto;
}

/* ============================================================
   CABECERA
   ============================================================ */

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.page-header > div:first-child {
  min-width: 0;
}

.page-kicker {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: .055em;
  text-transform: uppercase;
}

.page-header h1 {
  margin: 5px 0;
  color: var(--color-text);
  font-size: var(--font-size-page-title);
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -.02em;
}

.page-header p {
  max-width: 780px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.state-selector {
  display: flex;
  min-width: 210px;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 6px;
}

.state-selector label,
.modal-field > span {
  color: #475569;
  font-size: 12px;
  font-weight: 650;
}

.state-selector select,
.filters-card select,
.modal-field select,
.modal-field input {
  min-height: 41px;
  padding: 0 11px;
  outline: 0;
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}

.state-selector select:focus,
.filters-card select:focus,
.modal-field select:focus,
.modal-field input:focus,
.modal-field textarea:focus {
  border-color: var(--color-primary);
  box-shadow:
    0 0 0 3px
    rgba(37, 99, 235, .09);
}

/* ============================================================
   MENSAJE DE ÉXITO
   ============================================================ */

.success-message {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid #bbf7d0;
  border-radius: var(--radius-lg);
  background: var(--color-success-soft);
  color: #166534;
}

.success-message > div {
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

.success-message span {
  flex: 1;
  font-size: 13px;
  font-weight: 650;
}

.success-message button {
  border: 0;
  background: transparent;
  color: #166534;
  cursor: pointer;
  font-size: 20px;
}

/* ============================================================
   MÉTRICAS
   ============================================================ */

.metrics-grid {
  display: grid;
  grid-template-columns:
    repeat(
      6,
      minmax(0, 1fr)
    );
  gap: 10px;
  margin-top: 22px;
}

.metric-card {
  display: flex;
  min-width: 0;
  min-height: 102px;
  flex-direction: column;
  justify-content: center;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.metric-card span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.metric-card strong {
  margin-top: 5px;
  color: var(--color-text);
  font-size: 23px;
  font-weight: 750;
}

.metric-card small {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.metric-card.registered {
  border-color: #bfdbfe;
  background: var(--color-primary-soft);
}

.metric-card.assigned {
  border-color: #bbf7d0;
  background: var(--color-success-soft);
}

.metric-card.unassigned {
  border-color: #fed7aa;
  background: #fff7ed;
}

.metric-card.coverage {
  border-color: #ddd6fe;
  background: #f5f3ff;
}

/* ============================================================
   AVISO VACANTES
   ============================================================ */

.vacancy-notice {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-top: 12px;
  padding: 13px;
  border: 1px solid #fed7aa;
  border-radius: var(--radius-lg);
  background: #fff7ed;
}

.notice-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: var(--radius-md);
  background: #ffedd5;
  color: #c2410c;
  font-weight: 800;
}

.vacancy-notice > div:last-child {
  display: flex;
  flex-direction: column;
}

.vacancy-notice strong {
  color: #9a3412;
  font-size: 13px;
}

.vacancy-notice span {
  margin-top: 3px;
  color: #7c2d12;
  font-size: 12px;
  line-height: 1.4;
}

/* ============================================================
   RESUMEN COBERTURAS
   ============================================================ */

.coverage-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid #ddd6fe;
  border-radius: var(--radius-lg);
  background: #f5f3ff;
}

.coverage-summary-copy {
  display: flex;
  flex-direction: column;
}

.coverage-summary-copy span {
  color: #7c3aed;
  font-size: 12px;
  font-weight: 700;
}

.coverage-summary-copy strong {
  margin-top: 3px;
  color: #4c1d95;
  font-size: 14px;
}

.coverage-summary-counts {
  display: flex;
  gap: 8px;
}

.coverage-summary-counts > div {
  display: flex;
  min-width: 78px;
  flex-direction: column;
  align-items: center;
  padding: 8px 11px;
  border: 1px solid #ede9fe;
  border-radius: var(--radius-md);
  background: #fff;
}

.coverage-summary-counts strong {
  color: #4c1d95;
  font-size: 17px;
}

.coverage-summary-counts span {
  margin-top: 2px;
  color: #7c3aed;
  font-size: 12px;
}

/* ============================================================
   COORDINADORES
   ============================================================ */

.coordinator-summary {
  display: grid;
  grid-template-columns:
    repeat(
      5,
      minmax(0, 1fr)
    );
  gap: 9px;
  margin-top: 13px;
}

.coordinator-card {
  display: grid;
  min-width: 0;
  min-height: 76px;
  grid-template-columns:
    36px
    minmax(0, 1fr)
    auto;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  cursor: pointer;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.coordinator-card:hover {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.coordinator-card.selected {
  border-color: #93c5fd;
  background: var(--color-primary-soft);
  box-shadow:
    0 0 0 2px
    rgba(37, 99, 235, .05);
}

.coordinator-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 800;
}

.coordinator-copy,
.coordinator-counts {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.coordinator-copy strong {
  overflow: hidden;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coordinator-copy span,
.coordinator-counts span {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.coordinator-counts {
  align-items: flex-end;
}

.coordinator-counts strong {
  color: var(--color-text);
  font-size: 16px;
}

.coordinator-counts small {
  margin-top: 2px;
  color: #c2410c;
  font-size: 12px;
  font-weight: 650;
  text-align: right;
}

/* ============================================================
   FILTROS
   ============================================================ */

.filters-card {
  display: flex;
  gap: 8px;
  margin-top: 13px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.search-field {
  display: flex;
  min-width: 250px;
  flex: 1;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.search-field:focus-within {
  border-color: var(--color-primary);
  box-shadow:
    0 0 0 3px
    rgba(37, 99, 235, .09);
}

.search-field span {
  color: #94a3b8;
  font-size: 18px;
}

.search-field input {
  width: 100%;
  height: 40px;
  outline: 0;
  border: 0;
  background: transparent;
  color: var(--color-text) !important;
  caret-color: var(--color-primary);
  font: inherit;
  font-size: 13px;
  -webkit-text-fill-color: var(--color-text);
}

.search-field input::placeholder {
  color: #94a3b8;
  opacity: 1;
  -webkit-text-fill-color: #94a3b8;
}

.clear-button {
  min-height: 41px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}

.clear-button:hover {
  border-color: #bfdbfe;
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
}

/* ============================================================
   TABLA UNIDADES
   ============================================================ */

.units-card {
  overflow: hidden;
  margin-top: 13px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 17px;
  border-bottom: 1px solid var(--color-border);
  background: #fcfdff;
}

.table-header > div {
  display: flex;
  flex-direction: column;
}

.table-header span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.table-header strong {
  margin-top: 2px;
  color: var(--color-text);
  font-size: 15px;
}

.table-context {
  align-items: flex-end;
}

.table-context small {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.table-wrapper {
  max-height: 610px;
  overflow: auto;
}

table {
  width: 100%;
  min-width: 1040px;
  border-collapse: separate;
  border-spacing: 0;
}

th {
  position: sticky;
  z-index: 2;
  top: 0;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border);
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
}

td {
  padding: 11px 14px;
  border-bottom: 1px solid #eef2f7;
  vertical-align: middle;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: #f8fbff;
}

tbody tr:last-child td {
  border-bottom: 0;
}

.unit-cell,
.simple-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.unit-cell {
  min-width: 230px;
}

.unit-cell strong,
.simple-cell strong {
  color: #334155;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
}

.unit-cell span,
.simple-cell span {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.supervisor-stack {
  display: flex;
  min-width: 190px;
  flex-direction: column;
  align-items: flex-start;
}

.supervisor-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.person-dot {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
  font-size: 11px;
  font-weight: 800;
}

.supervisor-cell strong {
  color: #334155;
  font-size: 12px;
  font-weight: 650;
}

.vacant-label {
  color: #c2410c;
  font-size: 12px;
  font-weight: 700;
}

.coverage-mini {
  display: inline-flex;
  max-width: 250px;
  min-height: 24px;
  align-items: center;
  margin-top: 5px;
  padding: 0 7px;
  overflow: hidden;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coverage-mini.active,
.coverage-status-pill.active {
  background: #ede9fe;
  color: #6d28d9;
}

.coverage-mini.scheduled,
.coverage-status-pill.scheduled {
  background: #dbeafe;
  color: #1d4ed8;
}

.coverage-mini.pending-approval,
.coverage-status-pill.pending-approval {
  background: #fef3c7;
  color: #92400e;
}

.coverage-status-pill.expired,
.coverage-status-pill.cancelled {
  background: #f1f5f9;
  color: #64748b;
}

.coverage-status-pill.rejected {
  background: #fee2e2;
  color: #b91c1c;
}

.status-badge {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-badge.assigned {
  background: #dcfce7;
  color: #166534;
}

.status-badge.unassigned {
  background: #ffedd5;
  color: #c2410c;
}

.status-badge.inactive {
  background: #f1f5f9;
  color: #64748b;
}

.status-badge.unclassified {
  background: #fee2e2;
  color: #b91c1c;
}

.arrow {
  color: #94a3b8;
  font-size: 20px;
}

/* ============================================================
   PAGINACIÓN / VACÍOS
   ============================================================ */

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 13px;
  border-top: 1px solid #eef2f7;
}

.pagination button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: #475569;
  cursor: pointer;
}

.pagination button:disabled {
  cursor: default;
  opacity: .35;
}

.pagination span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.empty-state,
.state-box {
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 34px;
}

.empty-state > div {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: #64748b;
  font-weight: 750;
}

.empty-state strong {
  margin-top: 8px;
  color: #334155;
  font-size: 14px;
}

.empty-state span {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.state-box.error {
  align-items: flex-start;
  gap: 4px;
  margin-top: 18px;
  border: 1px solid #fecaca;
  border-radius: var(--radius-lg);
  background: var(--color-error-soft);
  color: var(--color-error);
}

.state-box.error strong {
  font-size: 14px;
}

.state-box.error span {
  font-size: 12px;
}

.state-box.error button {
  min-height: 35px;
  margin-top: 6px;
  padding: 0 10px;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--color-error);
  cursor: pointer;
}

.state-box.loading {
  flex-direction: row;
  justify-content: center;
  gap: 11px;
  margin-top: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.state-box.loading > div:last-child {
  display: flex;
  flex-direction: column;
}

.state-box.loading strong {
  font-size: 13px;
}

.state-box.loading span {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   DRAWER
   ============================================================ */

.drawer-backdrop {
  position: fixed;
  z-index: 20000;

  top: 64px;
  right: 0;
  bottom: 0;
  left: 0;

  display: flex;
  justify-content: flex-end;

  background:
    rgba(
      15,
      23,
      42,
      .42
    );

  backdrop-filter: blur(3px);
}

.unit-drawer {
  width: min(520px, 100%);
  height: 100%;
  overflow-y: auto;
  padding: 22px;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow:
    -20px 0 60px
    rgba(15, 23, 42, .16);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 13px;
  border-bottom: 1px solid #eef2f7;
}

.drawer-header > div {
  min-width: 0;
}

.drawer-header > div > span,
.history-section header span,
.coverage-history-section header span,
.management-actions > span,
.coverage-actions > span {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
}

.drawer-header h2 {
  margin: 5px 0 3px;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 20px;
}

.drawer-header p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.drawer-header button {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: #64748b;
  cursor: pointer;
  font-size: 20px;
}

.drawer-header button:hover {
  background: var(--color-surface-muted);
}

.drawer-status {
  margin-top: 14px;
}

/* ============================================================
   DATOS DE UNIDAD
   ============================================================ */

.detail-grid {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 8px;
  margin-top: 12px;
}

.detail-grid > div,
.assignment-block {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 11px;
  border: 1px solid #eef2f7;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.detail-grid span,
.assignment-block span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.detail-grid strong,
.assignment-block strong {
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: #334155;
  font-size: 13px;
}

.assignment-block {
  margin-top: 8px;
  border-color: #bfdbfe;
  background: var(--color-primary-soft);
}

.assignment-block.vacant {
  border-color: #fed7aa;
  background: #fff7ed;
}

/* ============================================================
   COBERTURA ACTUAL
   ============================================================ */

.current-coverage-card {
  margin-top: 10px;
  padding: 13px;
  border: 1px solid #ddd6fe;
  border-radius: var(--radius-lg);
  background: #f5f3ff;
}

.current-coverage-card.pending-approval {
  border-color: #fde68a;
  background: #fffbeb;
}

.current-coverage-card.scheduled {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.current-coverage-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.current-coverage-card header > div {
  display: flex;
  flex-direction: column;
}

.current-coverage-card header > div > span {
  color: #7c3aed;
  font-size: 12px;
  font-weight: 700;
}

.current-coverage-card header > div > strong {
  margin-top: 2px;
  color: #4c1d95;
  font-size: 13px;
}

.coverage-status-pill {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.coverage-person {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 11px;
}

.coverage-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: var(--radius-md);
  background: #ede9fe;
  color: #6d28d9;
  font-size: 11px;
  font-weight: 800;
}

.coverage-person > div:last-child {
  display: flex;
  flex-direction: column;
}

.coverage-person strong {
  color: #334155;
  font-size: 13px;
}

.coverage-person span {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.coverage-period {
  display: flex;
  flex-direction: column;
  margin-top: 9px;
  padding: 9px;
  border: 1px solid rgba(221, 214, 254, .8);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, .72);
}

.coverage-period span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.coverage-period strong {
  margin-top: 3px;
  color: #334155;
  font-size: 13px;
}

.current-coverage-card p {
  margin: 9px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.cancel-coverage-button {
  width: 100%;
  min-height: 37px;
  margin-top: 10px;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--color-error);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

/* ============================================================
   GESTIÓN
   ============================================================ */

.management-actions,
.coverage-actions,
.history-section,
.coverage-history-section {
  margin-top: 16px;
  padding-top: 15px;
  border-top: 1px solid var(--color-border);
}

.action-grid {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 8px;
  margin-top: 9px;
}

.action-button {
  min-height: 40px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.action-button.primary {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.action-button.danger {
  border: 1px solid #fecaca;
  background: #fff;
  color: var(--color-error);
}

.action-button.full {
  width: 100%;
  margin-top: 9px;
}

.management-actions small,
.coverage-actions small {
  display: block;
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.coverage-actions {
  display: flex;
  flex-direction: column;
}

.coverage-actions > strong {
  margin-top: 4px;
  color: #334155;
  font-size: 13px;
}

.coverage-actions > p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.coverage-action-button {
  width: 100%;
  min-height: 40px;
  margin-top: 9px;
  border: 1px solid #7c3aed;
  border-radius: var(--radius-md);
  background: #7c3aed;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.coverage-action-button:disabled {
  cursor: default;
  opacity: .45;
}

/* ============================================================
   HISTORIALES
   ============================================================ */

.coverage-history-section header,
.history-section header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.coverage-history-section header > div,
.history-section header > div {
  display: flex;
  flex-direction: column;
}

.coverage-history-section header strong,
.history-section header strong {
  margin-top: 2px;
  color: #334155;
  font-size: 13px;
}

.history-count {
  display: grid;
  min-width: 27px;
  height: 27px;
  place-items: center;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: #64748b !important;
  font-size: 12px !important;
}

.coverage-history-list {
  margin-top: 11px;
}

.coverage-history-item {
  display: grid;
  grid-template-columns:
    12px
    minmax(0, 1fr);
  gap: 8px;
  padding-bottom: 14px;
}

.coverage-history-dot {
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 999px;
  background: #cbd5e1;
}

.coverage-history-dot.active {
  background: #7c3aed;
}

.coverage-history-dot.scheduled {
  background: #2563eb;
}

.coverage-history-dot.pending-approval {
  background: #d97706;
}

.coverage-history-dot.rejected {
  background: #dc2626;
}

.coverage-history-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.coverage-history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
}

.coverage-history-heading strong {
  overflow-wrap: anywhere;
  color: #334155;
  font-size: 13px;
}

.coverage-history-copy > span,
.coverage-history-copy > p {
  margin: 3px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.coverage-history-copy .review-comment {
  color: #92400e;
}

.coverage-history-copy .cancel-comment {
  color: #b91c1c;
}

.history-section header button {
  border: 0;
  background: transparent;
  color: var(--color-primary-dark);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.timeline {
  margin-top: 12px;
}

.timeline-item {
  display: grid;
  grid-template-columns:
    12px
    minmax(0, 1fr);
  gap: 8px;
  padding-bottom: 14px;
}

.timeline-dot {
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border-radius: 999px;
  background: #cbd5e1;
}

.timeline-dot.active {
  background: #22c55e;
}

.timeline-item > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.timeline-item strong {
  color: #334155;
  font-size: 13px;
}

.timeline-item span,
.timeline-item p {
  margin: 3px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.timeline-item .active-label {
  color: var(--color-success);
  font-weight: 700;
}

.timeline-item .revoked {
  color: var(--color-error);
}

.history-loading,
.history-error,
.history-empty {
  margin-top: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.history-error {
  color: var(--color-error);
}

/* ============================================================
   MODALES
   ============================================================ */

.modal-backdrop {
  position: fixed;
  z-index: 30000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background:
    rgba(
      15,
      23,
      42,
      .50
    );
  backdrop-filter: blur(4px);
}

.action-modal {
  width: min(500px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.modal-kicker {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
}

.modal-kicker.danger {
  color: var(--color-error);
}

.modal-kicker.coverage {
  color: #7c3aed;
}

.action-modal h2 {
  margin: 5px 0;
  color: var(--color-text);
  font-size: 20px;
}

.action-modal > p {
  margin: 0 0 14px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.modal-field {
  display: flex;
  flex-direction: column;
  margin-top: 13px;
}

.modal-field select,
.modal-field textarea,
.modal-field input {
  margin-top: 6px;
}

.modal-field textarea {
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

.modal-field small {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: right;
}

.date-fields {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 9px;
}

.coverage-explanation {
  display: flex;
  flex-direction: column;
  margin-top: 11px;
  padding: 11px;
  border: 1px solid #ddd6fe;
  border-radius: var(--radius-md);
  background: #f5f3ff;
}

.coverage-explanation strong {
  color: #6d28d9;
  font-size: 13px;
}

.coverage-explanation span {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.warning-box,
.action-error-box {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
  padding: 10px;
  border-radius: var(--radius-md);
}

.warning-box {
  border: 1px solid #fed7aa;
  background: #fff7ed;
  color: #9a3412;
}

.action-error-box {
  border: 1px solid #fecaca;
  background: var(--color-error-soft);
  color: var(--color-error);
}

.warning-box strong,
.action-error-box strong {
  font-size: 13px;
}

.warning-box span,
.action-error-box span {
  margin-top: 3px;
  font-size: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.cancel-button,
.confirm-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.cancel-button {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: #475569;
}

.confirm-button {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.confirm-button.coverage {
  border-color: #7c3aed;
  background: #7c3aed;
}

.confirm-button.danger {
  border-color: #dc2626;
  background: #dc2626;
}

.confirm-button:disabled,
.cancel-button:disabled {
  cursor: wait;
  opacity: .5;
}

/* ============================================================
   CARGA
   ============================================================ */

.spinner {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border: 3px solid #dbeafe;
  border-top-color: var(--color-primary);
  border-radius: 999px;
  animation:
    assignments-spin
    .7s
    linear
    infinite;
}

@keyframes assignments-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

@media (
  max-width: 1180px
) {
  .metrics-grid {
    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      );
  }

  .coordinator-summary {
    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      );
  }
}

@media (
  max-width: 900px
) {
  .assignments-page {
    padding:
      22px
      18px
      40px;
  }

  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .state-selector {
    width: 100%;
  }

  .coordinator-summary {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .filters-card {
    display: grid;
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .search-field {
    min-width: 0;
    grid-column:
      1 /
      -1;
  }
}

@media (
  max-width: 640px
) {
  .assignments-page {
    padding:
      18px
      14px
      32px;
  }

  .page-header h1 {
    font-size: 24px;
  }

  .metrics-grid {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .coordinator-summary,
  .filters-card,
  .detail-grid,
  .action-grid,
  .date-fields {
    grid-template-columns: 1fr;
  }

  .coverage-summary {
    align-items: stretch;
    flex-direction: column;
  }

  .coverage-summary-counts {
    display: grid;
    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      );
  }

  .unit-drawer {
    width: 100%;
    padding: 17px;
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