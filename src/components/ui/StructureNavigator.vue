<template>
  <aside class="structure">
    <!-- =====================================================
         ZONA FIJA
         No participa en el scroll interno.
    ====================================================== -->
    <div class="structure-fixed">
      <header class="structure-header">
        <div class="structure-header-icon">
          <span>
            {{ roleInitial }}
          </span>
        </div>

        <div class="structure-header-copy">
          <span class="structure-eyebrow">
            {{ headerEyebrow }}
          </span>

          <strong>
            {{ headerTitle }}
          </strong>
        </div>
      </header>

      <!-- ===================================================
           ESTADO
      ==================================================== -->
      <div
        v-if="states.length"
        class="state-section"
      >
        <span class="section-label">
          Estado
        </span>

        <div
          v-if="states.length > 1"
          class="state-options"
        >
          <button
            v-for="state in states"
            :key="state.name"
            type="button"
            class="state-chip"
            :class="{
              active:
                state.name ===
                selectedState
            }"
            @click="$emit(
              'select-state',
              state
            )"
          >
            <span>
              {{ state.name }}
            </span>

            <small>
              {{
                formatNumber(
                  state.unitsCount
                )
              }}
            </small>
          </button>
        </div>

        <div
          v-else
          class="single-state"
        >
          <div>
            <strong>
              {{ states[0].name }}
            </strong>

            <!-- SUPERVISOR -->
            <template
              v-if="
                profileRole ===
                'SUPERVISOR'
              "
            >
              <span>
                {{
                  formatNumber(
                    states[0].unitsCount
                  )
                }}
                unidades totales
              </span>

              <small class="single-state-assigned">
                {{
                  formatNumber(
                    unitsCount
                  )
                }}
                asignadas a ti
              </small>
            </template>

            <!-- GERENTE -->
            <template
              v-else-if="
                profileRole ===
                'GERENTE'
              "
            >
              <span>
                {{
                  formatNumber(
                    structure
                      ?.totals
                      ?.registeredUnitsCount ??
                    states[0].unitsCount
                  )
                }}
                unidades registradas
              </span>
            </template>

            <!-- COORDINADOR / OTROS -->
            <template v-else>
              <span>
                {{
                  formatNumber(
                    states[0].unitsCount
                  )
                }}
                unidades registradas
              </span>
            </template>
          </div>

          <span class="state-dot"></span>
        </div>
      </div>

      <!-- ===================================================
           REGRESAR
      ==================================================== -->
      <button
        v-if="
          showBackButton &&
          !loading &&
          !error
        "
        type="button"
        class="back-button"
        @click="$emit('back')"
      >
        <span class="back-arrow">
          ←
        </span>

        <span>
          {{ backLabel }}
        </span>
      </button>
    </div>

    <!-- =====================================================
         ZONA DESPLAZABLE
    ====================================================== -->
    <div class="structure-body">
      <!-- ===================================================
           CARGA
      ==================================================== -->
      <div
        v-if="loading"
        class="structure-loading"
      >
        <div class="spinner"></div>

        <span>
          Cargando estructura...
        </span>
      </div>

      <!-- ===================================================
           ERROR
      ==================================================== -->
      <div
        v-else-if="error"
        class="structure-error"
      >
        <strong>
          No se pudo cargar
        </strong>

        <span>
          {{ error }}
        </span>
      </div>

      <template
        v-else-if="
          selectedState &&
          structure
        "
      >
        <!-- =================================================
             SUPERVISOR SELECCIONADO
        ================================================== -->
        <section
          v-if="selectedSupervisor"
          class="detail-view"
        >
          <div class="person-hero">
            <div class="person-avatar supervisor">
              {{
                getInitials(
                  selectedSupervisor.name
                )
              }}
            </div>

            <div class="person-hero-copy">
              <span>
                Supervisor
              </span>

              <strong>
                {{
                  selectedSupervisor.name
                }}
              </strong>
            </div>
          </div>

          <!-- ACORDEÓN RESUMEN SUPERVISOR -->
          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                supervisorSummaryOpen =
                  !supervisorSummaryOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Resumen
                </span>

                <small>
                  {{
                    formatNumber(
                      unitsCount
                    )
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    supervisorSummaryOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="supervisorSummaryOpen"
              class="accordion-panel"
            >
              <div class="summary-grid two">
                <div class="summary-item">
                  <strong>
                    {{
                      formatNumber(
                        unitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Unidades visibles
                  </span>
                </div>

                <div class="summary-item">
                  <strong>
                    {{
                      formatScopeMode(
                        selectedSupervisor
                          .pharmacyScopeMode
                      )
                    }}
                  </strong>

                  <span>
                    Ámbito
                  </span>
                </div>
              </div>

              <div
                v-if="
                  unitsCount === 0
                "
                class="empty-warning"
              >
                <strong>
                  Sin unidades asignadas
                </strong>

                <span>
                  Este supervisor todavía
                  no tiene asignaciones
                  formales activas.
                </span>
              </div>

              <div
                v-else
                class="map-indicator"
              >
                <span class="map-indicator-dot"></span>

                <span>
                  El mapa muestra únicamente
                  las unidades de este supervisor.
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- =================================================
             COORDINADOR SELECCIONADO POR GERENTE
        ================================================== -->
        <section
          v-else-if="selectedCoordinator"
        >
          <div class="person-hero compact">
            <div class="person-avatar coordinator">
              {{
                getInitials(
                  selectedCoordinator.name
                )
              }}
            </div>

            <div class="person-hero-copy">
              <span>
                Coordinador
              </span>

              <strong>
                {{
                  selectedCoordinator.name
                }}
              </strong>

              <small>
                {{
                  formatNumber(
                    coordinatorTotals
                      .unitsCount
                  )
                }}
                unidades territoriales
              </small>
            </div>
          </div>

          <!-- ===============================================
               ACORDEÓN RESUMEN TERRITORIAL
          ================================================ -->
          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                coordinatorSummaryOpen =
                  !coordinatorSummaryOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Resumen territorial
                </span>

                <small>
                  {{
                    formatNumber(
                      coordinatorTotals
                        .unitsCount
                    )
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    coordinatorSummaryOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="coordinatorSummaryOpen"
              class="accordion-panel"
            >
              <div class="summary-grid three">
                <div class="summary-item">
                  <strong>
                    {{
                      formatNumber(
                        coordinatorTotals
                          .unitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Territorio
                  </span>
                </div>

                <div class="summary-item">
                  <strong>
                    {{
                      formatNumber(
                        coordinatorTotals
                          .assignedUnitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Con supervisor
                  </span>
                </div>

                <div
                  class="summary-item"
                  :class="{
                    warning:
                      coordinatorTotals
                        .unassignedUnitsCount >
                      0
                  }"
                >
                  <strong>
                    {{
                      formatNumber(
                        coordinatorTotals
                          .unassignedUnitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Sin supervisor
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- ===============================================
               ACORDEÓN FILTRO DE MAPA
          ================================================ -->
          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                coordinatorMapOpen =
                  !coordinatorMapOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Mostrar en mapa
                </span>

                <small>
                  {{
                    assignmentStatusLabel
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    coordinatorMapOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="coordinatorMapOpen"
              class="accordion-panel"
            >
              <div class="territory-filter-list">
                <button
                  v-for="filter in territoryFilters"
                  :key="filter.value"
                  type="button"
                  class="territory-filter"
                  :class="{
                    active:
                      coordinatorAssignmentStatus ===
                      filter.value,

                    warning:
                      filter.value ===
                        'UNASSIGNED' &&
                      filter.count > 0
                  }"
                  @click="$emit(
                    'select-assignment-status',
                    filter.value
                  )"
                >
                  <div>
                    <strong>
                      {{ filter.label }}
                    </strong>

                    <span>
                      {{ filter.description }}
                    </span>
                  </div>

                  <div class="territory-filter-end">
                    <small>
                      {{
                        formatNumber(
                          filter.count
                        )
                      }}
                    </small>

                    <span>
                      ›
                    </span>
                  </div>
                </button>
              </div>

              <div class="map-indicator">
                <span class="map-indicator-dot"></span>

                <span>
                  {{ coordinatorMapMessage }}
                </span>
              </div>
            </div>
          </div>

          <!-- ===============================================
               ACORDEÓN SUPERVISORES
          ================================================ -->
          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                coordinatorSupervisorsOpen =
                  !coordinatorSupervisorsOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Supervisores
                </span>

                <small>
                  {{
                    coordinatorSupervisors
                      .length
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    coordinatorSupervisorsOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="coordinatorSupervisorsOpen"
              class="accordion-panel"
            >
              <div
                v-if="
                  coordinatorSupervisors.length
                "
                class="person-list"
              >
                <button
                  v-for="supervisor in coordinatorSupervisors"
                  :key="supervisor.id"
                  type="button"
                  class="person-row"
                  @click="$emit(
                    'select-supervisor',
                    supervisor
                  )"
                >
                  <div class="row-avatar supervisor">
                    {{
                      getInitials(
                        supervisor.name
                      )
                    }}
                  </div>

                  <div class="row-copy">
                    <strong>
                      {{ supervisor.name }}
                    </strong>

                    <span>
                      {{
                        formatNumber(
                          supervisor.unitsCount
                        )
                      }}
                      unidades
                    </span>
                  </div>

                  <span class="row-arrow">
                    ›
                  </span>
                </button>
              </div>

              <div
                v-else
                class="empty-state"
              >
                <strong>
                  Sin supervisores
                </strong>

                <span>
                  Este coordinador todavía
                  no tiene supervisores asignados
                  para {{ selectedState }}.
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- =================================================
             GERENTE
        ================================================== -->
        <section
          v-else-if="
            profileRole ===
            'GERENTE'
          "
        >
          <!-- ===============================================
               ACORDEÓN RESUMEN OPERATIVO
          ================================================ -->
          <div class="accordion-block first">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                managerSummaryOpen =
                  !managerSummaryOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Resumen operativo
                </span>

                <small>
                  {{
                    formatNumber(
                      managerTotals
                        .operationalUnitsCount
                    )
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    managerSummaryOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="managerSummaryOpen"
              class="accordion-panel"
            >
              <div class="state-summary manager">
                <div>
                  <span>
                    {{ selectedState }}
                  </span>

                  <strong>
                    Operación vigente
                  </strong>
                </div>

                <div class="state-summary-status">
                  <span class="state-dot"></span>

                  <small>
                    Activa
                  </small>
                </div>
              </div>

              <div class="manager-metrics">
                <div class="manager-metric">
                  <strong>
                    {{
                      formatNumber(
                        managerTotals
                          .registeredUnitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Registradas
                  </span>
                </div>

                <div class="manager-metric">
                  <strong>
                    {{
                      formatNumber(
                        managerTotals
                          .operationalUnitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Operativas
                  </span>
                </div>

                <div class="manager-metric">
                  <strong>
                    {{
                      formatNumber(
                        managerTotals
                          .assignedUnitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Con supervisor
                  </span>
                </div>

                <div
                  class="manager-metric"
                  :class="{
                    warning:
                      managerTotals
                        .unassignedUnitsCount >
                      0
                  }"
                >
                  <strong>
                    {{
                      formatNumber(
                        managerTotals
                          .unassignedUnitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Sin supervisor
                  </span>
                </div>

                <div class="manager-metric muted">
                  <strong>
                    {{
                      formatNumber(
                        managerTotals
                          .inactiveUnitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Inactivas
                  </span>
                </div>
              </div>

              <div class="map-indicator">
                <span class="map-indicator-dot"></span>

                <span>
                  El mapa muestra
                  {{
                    formatNumber(
                      unitsCount
                    )
                  }}
                  unidades operativas visibles.
                </span>
              </div>

              <div
                v-if="
                  managerTotals
                    .unclassifiedUnitsCount >
                  0
                "
                class="data-warning"
              >
                <strong>
                  Revisión de datos requerida
                </strong>

                <span>
                  Existen
                  {{
                    formatNumber(
                      managerTotals
                        .unclassifiedUnitsCount
                    )
                  }}
                  unidades sin territorio activo
                  y que tampoco están marcadas
                  como inactivas.
                </span>
              </div>
            </div>
          </div>

          <!-- ===============================================
               ACORDEÓN COORDINADORES
          ================================================ -->
          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                managerCoordinatorsOpen =
                  !managerCoordinatorsOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Coordinadores
                </span>

                <small>
                  {{
                    structure
                      .coordinators
                      ?.length ??
                    0
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    managerCoordinatorsOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="managerCoordinatorsOpen"
              class="accordion-panel"
            >
              <div
                v-if="
                  structure.coordinators
                    ?.length
                "
                class="person-list"
              >
                <button
                  v-for="coordinator in structure.coordinators"
                  :key="coordinator.id"
                  type="button"
                  class="person-row"
                  @click="$emit(
                    'select-coordinator',
                    coordinator
                  )"
                >
                  <div class="row-avatar coordinator">
                    {{
                      getInitials(
                        coordinator.name
                      )
                    }}
                  </div>

                  <div class="row-copy">
                    <strong>
                      {{ coordinator.name }}
                    </strong>

                    <span>
                      {{
                        coordinator.supervisorsCount
                      }}
                      supervisores ·
                      {{
                        formatNumber(
                          coordinator.unitsCount
                        )
                      }}
                      unidades
                    </span>

                    <small
                      v-if="
                        Number(
                          coordinator
                            .unassignedUnitsCount ||
                          0
                        ) > 0
                      "
                      class="row-warning"
                    >
                      {{
                        formatNumber(
                          coordinator
                            .assignedUnitsCount
                        )
                      }}
                      con supervisor ·
                      {{
                        formatNumber(
                          coordinator
                            .unassignedUnitsCount
                        )
                      }}
                      sin supervisor
                    </small>
                  </div>

                  <span class="row-arrow">
                    ›
                  </span>
                </button>
              </div>

              <div
                v-else
                class="empty-state"
              >
                <strong>
                  Sin coordinadores
                </strong>

                <span>
                  Todavía no existen
                  coordinadores asociados
                  a este gerente en
                  {{ selectedState }}.
                </span>
              </div>
            </div>
          </div>

          <!-- ===============================================
               ACORDEÓN SUPERVISORES DIRECTOS
          ================================================ -->
          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                managerDirectSupervisorsOpen =
                  !managerDirectSupervisorsOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Supervisores directos
                </span>

                <small>
                  {{
                    structure
                      .directSupervisors
                      ?.length ??
                    0
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    managerDirectSupervisorsOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="managerDirectSupervisorsOpen"
              class="accordion-panel"
            >
              <div
                v-if="
                  structure.directSupervisors
                    ?.length
                "
                class="person-list"
              >
                <button
                  v-for="supervisor in structure.directSupervisors"
                  :key="supervisor.id"
                  type="button"
                  class="person-row"
                  @click="$emit(
                    'select-supervisor',
                    supervisor
                  )"
                >
                  <div class="row-avatar supervisor">
                    {{
                      getInitials(
                        supervisor.name
                      )
                    }}
                  </div>

                  <div class="row-copy">
                    <strong>
                      {{ supervisor.name }}
                    </strong>

                    <span>
                      {{
                        formatNumber(
                          supervisor.unitsCount
                        )
                      }}
                      unidades
                    </span>
                  </div>

                  <span class="row-arrow">
                    ›
                  </span>
                </button>
              </div>

              <div
                v-else
                class="empty-state compact-empty"
              >
                <strong>
                  Sin supervisores directos
                </strong>

                <span>
                  Los supervisores actuales
                  están organizados bajo
                  coordinadores.
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- =================================================
             COORDINADOR AUTENTICADO
        ================================================== -->
        <section
          v-else-if="
            profileRole ===
            'COORDINADOR'
          "
        >
          <div class="person-hero compact">
            <div class="person-avatar coordinator">
              {{
                getInitials(
                  profileName
                )
              }}
            </div>

            <div class="person-hero-copy">
              <span>
                Coordinador
              </span>

              <strong>
                {{ profileName }}
              </strong>

              <small>
                {{ selectedState }}
              </small>
            </div>
          </div>

          <!-- ===============================================
               ACORDEÓN RESUMEN
          ================================================ -->
          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                coordinatorSummaryOpen =
                  !coordinatorSummaryOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Resumen territorial
                </span>

                <small>
                  {{
                    formatNumber(
                      coordinatorTotals
                        .unitsCount
                    )
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    coordinatorSummaryOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="coordinatorSummaryOpen"
              class="accordion-panel"
            >
              <div class="summary-grid three">
                <div class="summary-item">
                  <strong>
                    {{
                      formatNumber(
                        coordinatorTotals
                          .unitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Territorio
                  </span>
                </div>

                <div class="summary-item">
                  <strong>
                    {{
                      formatNumber(
                        coordinatorTotals
                          .assignedUnitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Con supervisor
                  </span>
                </div>

                <div
                  class="summary-item"
                  :class="{
                    warning:
                      coordinatorTotals
                        .unassignedUnitsCount >
                      0
                  }"
                >
                  <strong>
                    {{
                      formatNumber(
                        coordinatorTotals
                          .unassignedUnitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Sin supervisor
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- ===============================================
               ACORDEÓN MOSTRAR EN MAPA
          ================================================ -->
          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                coordinatorMapOpen =
                  !coordinatorMapOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Mostrar en mapa
                </span>

                <small>
                  {{ assignmentStatusLabel }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    coordinatorMapOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="coordinatorMapOpen"
              class="accordion-panel"
            >
              <div class="territory-filter-list">
                <button
                  v-for="filter in territoryFilters"
                  :key="filter.value"
                  type="button"
                  class="territory-filter"
                  :class="{
                    active:
                      coordinatorAssignmentStatus ===
                      filter.value,

                    warning:
                      filter.value ===
                        'UNASSIGNED' &&
                      filter.count > 0
                  }"
                  @click="$emit(
                    'select-assignment-status',
                    filter.value
                  )"
                >
                  <div>
                    <strong>
                      {{ filter.label }}
                    </strong>

                    <span>
                      {{ filter.description }}
                    </span>
                  </div>

                  <div class="territory-filter-end">
                    <small>
                      {{
                        formatNumber(
                          filter.count
                        )
                      }}
                    </small>

                    <span>
                      ›
                    </span>
                  </div>
                </button>
              </div>

              <div class="map-indicator">
                <span class="map-indicator-dot"></span>

                <span>
                  {{ coordinatorMapMessage }}
                </span>
              </div>
            </div>
          </div>

          <!-- ===============================================
               ACORDEÓN MIS SUPERVISORES
          ================================================ -->
          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                coordinatorSupervisorsOpen =
                  !coordinatorSupervisorsOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Mis supervisores
                </span>

                <small>
                  {{
                    structure.supervisors
                      ?.length ??
                    0
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    coordinatorSupervisorsOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="coordinatorSupervisorsOpen"
              class="accordion-panel"
            >
              <div
                v-if="
                  structure.supervisors
                    ?.length
                "
                class="person-list"
              >
                <button
                  v-for="supervisor in structure.supervisors"
                  :key="supervisor.id"
                  type="button"
                  class="person-row"
                  @click="$emit(
                    'select-supervisor',
                    supervisor
                  )"
                >
                  <div class="row-avatar supervisor">
                    {{
                      getInitials(
                        supervisor.name
                      )
                    }}
                  </div>

                  <div class="row-copy">
                    <strong>
                      {{ supervisor.name }}
                    </strong>

                    <span>
                      {{
                        formatNumber(
                          supervisor.unitsCount
                        )
                      }}
                      unidades
                    </span>
                  </div>

                  <span class="row-arrow">
                    ›
                  </span>
                </button>
              </div>

              <div
                v-else
                class="empty-state"
              >
                <strong>
                  Sin supervisores asignados
                </strong>

                <span>
                  No existen supervisores
                  asociados a tu estructura
                  en este estado.
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- =================================================
             SUPERVISOR AUTENTICADO
        ================================================== -->
        <section
          v-else-if="
            profileRole ===
            'SUPERVISOR'
          "
        >
          <div class="person-hero">
            <div class="person-avatar supervisor">
              {{
                getInitials(
                  profileName
                )
              }}
            </div>

            <div class="person-hero-copy">
              <span>
                Supervisor
              </span>

              <strong>
                {{ profileName }}
              </strong>
            </div>
          </div>

          <div class="accordion-block">
            <button
              type="button"
              class="accordion-trigger"
              @click="
                supervisorSummaryOpen =
                  !supervisorSummaryOpen
              "
            >
              <div class="accordion-title">
                <span>
                  Resumen
                </span>

                <small>
                  {{
                    formatNumber(
                      unitsCount
                    )
                  }}
                </small>
              </div>

              <span
                class="accordion-chevron"
                :class="{
                  open:
                    supervisorSummaryOpen
                }"
              >
                ›
              </span>
            </button>

            <div
              v-if="supervisorSummaryOpen"
              class="accordion-panel"
            >
              <div class="summary-grid two">
                <div class="summary-item">
                  <strong>
                    {{
                      formatNumber(
                        unitsCount
                      )
                    }}
                  </strong>

                  <span>
                    Unidades visibles
                  </span>
                </div>

                <div class="summary-item">
                  <strong>
                    {{
                      formatScopeMode(
                        structure.supervisor
                          ?.pharmacyScopeMode ||
                        profile
                          ?.pharmacyScopeMode
                      )
                    }}
                  </strong>

                  <span>
                    Ámbito
                  </span>
                </div>
              </div>

              <div
                v-if="
                  (
                    structure.supervisor
                      ?.pharmacyScopeMode ||
                    profile
                      ?.pharmacyScopeMode
                  ) === 'ALL'
                "
                class="scope-notice"
              >
                <strong>
                  Ámbito temporal completo
                </strong>

                <span>
                  Actualmente puedes ver
                  todas las unidades autorizadas
                  de {{ selectedState }}.
                </span>
              </div>

              <div
                v-else
                class="map-indicator"
              >
                <span class="map-indicator-dot"></span>

                <span>
                  El mapa muestra tus
                  unidades asignadas.
                </span>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </aside>
</template>

<script setup>
import {
  computed,
  ref,
  watch,
} from 'vue'

const props =
  defineProps({
    profile: {
      type: Object,
      default: null,
    },

    states: {
      type: Array,
      default: () => [],
    },

    selectedState: {
      type: String,
      default: null,
    },

    structure: {
      type: Object,
      default: null,
    },

    selectedCoordinator: {
      type: Object,
      default: null,
    },

    selectedSupervisor: {
      type: Object,
      default: null,
    },

    coordinatorSupervisors: {
      type: Array,
      default: () => [],
    },

    unitsCount: {
      type: Number,
      default: 0,
    },

    coordinatorAssignmentStatus: {
      type: String,
      default: 'ALL',
    },

    loading: {
      type: Boolean,
      default: false,
    },

    error: {
      type: String,
      default: null,
    },
  })

defineEmits([
  'select-state',
  'select-coordinator',
  'select-supervisor',
  'select-assignment-status',
  'back',
])

/*
 * ============================================================
 * ESTADO DE ACORDEONES
 * ============================================================
 */

/*
 * GERENTE
 *
 * Resumen:
 * cerrado por defecto.
 *
 * Coordinadores:
 * abierto por defecto.
 *
 * Supervisores directos:
 * cerrado por defecto.
 */
const managerSummaryOpen =
  ref(false)

const managerCoordinatorsOpen =
  ref(true)

const managerDirectSupervisorsOpen =
  ref(false)

/*
 * COORDINADOR
 *
 * Resumen:
 * cerrado por defecto.
 *
 * Mostrar en mapa:
 * abierto.
 *
 * Supervisores:
 * abierto.
 */
const coordinatorSummaryOpen =
  ref(false)

const coordinatorMapOpen =
  ref(true)

const coordinatorSupervisorsOpen =
  ref(true)

/*
 * SUPERVISOR
 */
const supervisorSummaryOpen =
  ref(true)

/*
 * ============================================================
 * PERFIL
 * ============================================================
 */

const profileRole =
  computed(
    () =>
      String(
        props.profile?.rol ||
        props.profile?.role ||
        '',
      )
        .trim()
        .toUpperCase()
  )

const profileName =
  computed(
    () =>
      props.profile?.nombre ||
      props.profile?.name ||
      'Usuario'
  )

const roleInitial =
  computed(
    () =>
      (
        profileRole.value ||
        'F'
      )
        .charAt(
          0,
        )
        .toUpperCase()
  )

const headerEyebrow =
  computed(
    () => {
      if (
        profileRole.value ===
        'GERENTE'
      ) {
        return 'Vista gerencial'
      }

      if (
        profileRole.value ===
        'COORDINADOR'
      ) {
        return 'Coordinación'
      }

      return 'Mi ámbito'
    }
  )

const headerTitle =
  computed(
    () => {
      if (
        props.selectedSupervisor
      ) {
        return 'Supervisor'
      }

      if (
        props.selectedCoordinator
      ) {
        return 'Estructura'
      }

      return 'Mi estructura'
    }
  )

/*
 * ============================================================
 * ESTADO DEL FILTRO TERRITORIAL
 * ============================================================
 */

const normalizedAssignmentStatus =
  computed(
    () => {
      const value =
        String(
          props
            .coordinatorAssignmentStatus ||
          'ALL',
        )
          .trim()
          .toUpperCase()

      if (
        value ===
          'ASSIGNED' ||
        value ===
          'UNASSIGNED'
      ) {
        return value
      }

      return 'ALL'
    }
  )

const coordinatorAssignmentStatus =
  computed(
    () =>
      normalizedAssignmentStatus.value
  )

const assignmentStatusLabel =
  computed(
    () => {
      if (
        normalizedAssignmentStatus
          .value ===
        'ASSIGNED'
      ) {
        return 'Con supervisor'
      }

      if (
        normalizedAssignmentStatus
          .value ===
        'UNASSIGNED'
      ) {
        return 'Sin supervisor'
      }

      return 'Todo'
    }
  )

/*
 * ============================================================
 * TOTALES GERENCIALES
 * ============================================================
 */

const managerTotals =
  computed(
    () => ({
      registeredUnitsCount:
        numberValue(
          props.structure
            ?.totals
            ?.registeredUnitsCount ??
          props.structure
            ?.totals
            ?.unitsCount ??
          0,
        ),

      operationalUnitsCount:
        numberValue(
          props.structure
            ?.totals
            ?.operationalUnitsCount ??
          0,
        ),

      assignedUnitsCount:
        numberValue(
          props.structure
            ?.totals
            ?.assignedUnitsCount ??
          0,
        ),

      unassignedUnitsCount:
        numberValue(
          props.structure
            ?.totals
            ?.unassignedUnitsCount ??
          0,
        ),

      inactiveUnitsCount:
        numberValue(
          props.structure
            ?.totals
            ?.inactiveUnitsCount ??
          0,
        ),

      unclassifiedUnitsCount:
        numberValue(
          props.structure
            ?.totals
            ?.unclassifiedUnitsCount ??
          0,
        ),
    })
  )

/*
 * ============================================================
 * TOTALES DEL COORDINADOR
 * ============================================================
 */

const coordinatorTotals =
  computed(
    () => {
      const source =
        props.selectedCoordinator ||
        (
          profileRole.value ===
          'COORDINADOR'
            ? props.structure
                ?.totals
            : null
        ) ||
        {}

      return {
        unitsCount:
          numberValue(
            source.unitsCount ??
            0,
          ),

        assignedUnitsCount:
          numberValue(
            source.assignedUnitsCount ??
            0,
          ),

        unassignedUnitsCount:
          numberValue(
            source.unassignedUnitsCount ??
            0,
          ),
      }
    }
  )

/*
 * ============================================================
 * FILTROS DE TERRITORIO
 * ============================================================
 */

const territoryFilters =
  computed(
    () => [
      {
        value:
          'ALL',

        label:
          'Todo el territorio',

        description:
          'Unidades con y sin supervisor',

        count:
          coordinatorTotals.value
            .unitsCount,
      },

      {
        value:
          'ASSIGNED',

        label:
          'Con supervisor',

        description:
          'Asignación formal activa',

        count:
          coordinatorTotals.value
            .assignedUnitsCount,
      },

      {
        value:
          'UNASSIGNED',

        label:
          'Sin supervisor',

        description:
          'Territorio pendiente de titular',

        count:
          coordinatorTotals.value
            .unassignedUnitsCount,
      },
    ]
  )

const coordinatorMapMessage =
  computed(
    () => {
      if (
        normalizedAssignmentStatus
          .value ===
        'UNASSIGNED'
      ) {
        return (
          `El mapa muestra ${formatNumber(
            props.unitsCount,
          )} unidades sin supervisor.`
        )
      }

      if (
        normalizedAssignmentStatus
          .value ===
        'ASSIGNED'
      ) {
        return (
          `El mapa muestra ${formatNumber(
            props.unitsCount,
          )} unidades con supervisor.`
        )
      }

      return (
        `El mapa muestra las ${formatNumber(
          props.unitsCount,
        )} unidades del territorio.`
      )
    }
  )

/*
 * ============================================================
 * BOTÓN REGRESAR
 * ============================================================
 */

const showBackButton =
  computed(
    () =>
      Boolean(
        props.selectedCoordinator ||
        props.selectedSupervisor ||
        (
          profileRole.value ===
            'COORDINADOR' &&
          normalizedAssignmentStatus
            .value !==
            'ALL'
        )
      )
  )

const backLabel =
  computed(
    () => {
      if (
        props.selectedSupervisor &&
        props.selectedCoordinator
      ) {
        return (
          props.selectedCoordinator
            .name
        )
      }

      if (
        props.selectedSupervisor &&
        profileRole.value ===
          'COORDINADOR'
      ) {
        return 'Mi coordinación'
      }

      if (
        normalizedAssignmentStatus
          .value !==
        'ALL'
      ) {
        return 'Todo el territorio'
      }

      return (
        props.selectedState ||
        'Estructura'
      )
    }
  )

/*
 * ============================================================
 * RESETEO DE ACORDEONES SEGÚN NIVEL
 * ============================================================
 */

watch(
  [
    profileRole,
    () =>
      props.selectedState,

    () =>
      props.selectedCoordinator
        ?.id,

    () =>
      props.selectedSupervisor
        ?.id,
  ],

  () => {
    if (
      props.selectedSupervisor
    ) {
      supervisorSummaryOpen.value =
        true

      return
    }

    if (
      props.selectedCoordinator ||
      profileRole.value ===
        'COORDINADOR'
    ) {
      coordinatorSummaryOpen.value =
        false

      coordinatorMapOpen.value =
        true

      coordinatorSupervisorsOpen.value =
        true

      return
    }

    if (
      profileRole.value ===
      'GERENTE'
    ) {
      managerSummaryOpen.value =
        false

      managerCoordinatorsOpen.value =
        true

      managerDirectSupervisorsOpen.value =
        false
    }
  },
  {
    immediate:
      true,
  },
)

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function numberValue(
  value,
) {
  const parsed =
    Number(
      value ??
      0,
    )

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0
}

function getInitials(
  value,
) {
  const words =
    String(
      value ||
      '?',
    )
      .trim()
      .split(
        /\s+/,
      )
      .filter(
        Boolean,
      )

  if (
    !words.length
  ) {
    return '?'
  }

  if (
    words.length ===
    1
  ) {
    return words[0]
      .charAt(
        0,
      )
      .toUpperCase()
  }

  return (
    words[0]
      .charAt(
        0,
      ) +
    words[1]
      .charAt(
        0,
      )
  ).toUpperCase()
}

function formatNumber(
  value,
) {
  return new Intl.NumberFormat(
    'es-MX',
  ).format(
    numberValue(
      value,
    )
  )
}

function formatScopeMode(
  value,
) {
  const mode =
    String(
      value ||
      '',
    )
      .trim()
      .toUpperCase()

  if (
    mode ===
    'ASSIGNED_ONLY'
  ) {
    return 'Solo asignadas'
  }

  if (
    mode ===
    'ALL'
  ) {
    return 'Todas'
  }

  return '—'
}
</script>

<style scoped>
/*
 * ============================================================
 * PANEL PRINCIPAL
 * ============================================================
 */

.structure {
  position: absolute;

  bottom: 20px;
  left: 20px;

  z-index: 9999;

  display: flex;

  width: min(
    380px,
    calc(100vw - 40px)
  );

  max-height: min(
    660px,
    calc(100vh - 120px)
  );

  flex-direction: column;

  overflow: hidden;

  padding: 0;

  border: 1px solid
    rgba(203, 213, 225, .95);

  border-radius: 20px;

  background:
    rgba(255, 255, 255, .96);

  box-shadow:
    0 16px 44px
      rgba(15, 23, 42, .16);

  backdrop-filter:
    blur(14px);

  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

/*
 * ============================================================
 * ZONA FIJA
 * ============================================================
 */

.structure-fixed {
  position: relative;

  z-index: 2;

  flex: 0 0 auto;

  padding:
    15px
    15px
    0;

  background:
    rgba(
      255,
      255,
      255,
      .97
    );

  box-shadow:
    0 6px 14px
      rgba(
        15,
        23,
        42,
        .035
      );
}

/*
 * ============================================================
 * ZONA CON SCROLL
 * ============================================================
 */

.structure-body {
  min-height: 0;

  flex: 1 1 auto;

  overflow-x: hidden;
  overflow-y: auto;

  padding:
    12px
    11px
    15px
    15px;

  scrollbar-width: thin;

  scrollbar-color:
    #cbd5e1
    transparent;
}

.structure-body::-webkit-scrollbar {
  width: 6px;
}

.structure-body::-webkit-scrollbar-track {
  background: transparent;
}

.structure-body::-webkit-scrollbar-thumb {
  border-radius: 999px;

  background: #cbd5e1;
}

.structure-body::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/*
 * ============================================================
 * CABECERA
 * ============================================================
 */

.structure-header {
  display: flex;

  align-items: center;

  gap: 11px;

  padding-bottom: 13px;

  border-bottom:
    1px solid #eef2f7;
}

.structure-header-icon {
  display: grid;

  width: 38px;
  height: 38px;

  flex: 0 0 38px;

  place-items: center;

  border-radius: 12px;

  background:
    linear-gradient(
      145deg,
      #e9f4fd,
      #dceefa
    );

  color: #0f64ad;

  font-size: 16px;
  font-weight: 900;
}

.structure-header-copy {
  display: flex;

  min-width: 0;

  flex-direction: column;
}

.structure-header-copy strong {
  margin-top: 2px;

  color: #0f172a;

  font-size: 16px;
}

.structure-eyebrow,
.section-label {
  color: #64748b;

  font-size: 12px;
  font-weight: 800;

  letter-spacing: .08em;

  text-transform: uppercase;
}

/*
 * ============================================================
 * ESTADO
 * ============================================================
 */

.state-section {
  padding-top: 13px;
}

.state-options {
  display: flex;

  flex-wrap: wrap;

  gap: 7px;

  margin-top: 8px;
}

.state-chip {
  display: flex;

  align-items: center;

  gap: 7px;

  min-height: 36px;

  padding: 0 11px;

  border: 1px solid #dbe3ec;
  border-radius: 11px;

  background: #fff;

  color: #475569;

  cursor: pointer;

  font-weight: 700;
}

.state-chip small {
  display: grid;

  min-width: 22px;
  height: 22px;

  place-items: center;

  padding: 0 6px;

  border-radius: 999px;

  background: #f1f5f9;

  color: #64748b;

  font-size: 12px;
}

.state-chip.active {
  border-color: #79b6e6;

  background: #eff8ff;

  color: #0f64ad;
}

.state-chip.active small {
  background: #dceefa;

  color: #0f64ad;
}

.single-state {
  display: flex;

  align-items: center;
  justify-content: space-between;

  margin-top: 8px;

  padding: 10px 12px;

  border-radius: 13px;

  background: #f8fafc;
}

.single-state > div {
  display: flex;

  flex-direction: column;
}

.single-state strong {
  color: #0f172a;

  font-size: 16px;
}

.single-state span:not(.state-dot) {
  margin-top: 2px;

  color: #64748b;

  font-size: 13px;
}

.single-state-assigned {
  margin-top: 3px;

  color: #0f64ad;

  font-size: 12px;
  font-weight: 800;
}

.state-dot {
  width: 9px;
  height: 9px;

  flex: 0 0 9px;

  border-radius: 999px;

  background: #22c55e;

  box-shadow:
    0 0 0 4px
      rgba(
        34,
        197,
        94,
        .12
      );
}

/*
 * ============================================================
 * BOTÓN REGRESAR
 * ============================================================
 */

.back-button {
  display: flex;

  width: 100%;

  align-items: center;

  gap: 8px;

  margin-top: 9px;
  margin-bottom: 10px;

  padding: 8px 10px;

  border: 0;
  border-radius: 10px;

  background: #f8fafc;

  color: #475569;

  cursor: pointer;

  font-size: 13px;
  font-weight: 800;

  text-align: left;
}

.back-button:hover {
  background: #f1f5f9;
}

.back-arrow {
  color: #0f64ad;

  font-size: 16px;
}

/*
 * ============================================================
 * ACORDEONES
 * ============================================================
 */

.accordion-block {
  overflow: hidden;

  margin-bottom: 8px;

  border: 1px solid #e7edf4;
  border-radius: 14px;

  background: #fff;
}

.accordion-block.first {
  margin-top: 0;
}

.accordion-trigger {
  display: flex;

  width: 100%;
  min-height: 44px;

  align-items: center;
  justify-content: space-between;

  gap: 12px;

  padding: 10px 12px;

  border: 0;

  background: #fff;

  cursor: pointer;

  text-align: left;

  transition:
    background .15s ease;
}

.accordion-trigger:hover {
  background: #f8fbfe;
}

.accordion-title {
  display: flex;

  min-width: 0;

  align-items: center;

  gap: 8px;
}

.accordion-title > span {
  overflow: hidden;

  color: #334155;

  font-size: 13px;
  font-weight: 850;

  letter-spacing: .04em;

  text-overflow: ellipsis;

  text-transform: uppercase;

  white-space: nowrap;
}

.accordion-title > small {
  display: grid;

  min-width: 24px;
  height: 22px;

  place-items: center;

  padding: 0 7px;

  border-radius: 999px;

  background: #eaf4fc;

  color: #0f64ad;

  font-size: 11px;
  font-weight: 900;

  white-space: nowrap;
}

.accordion-chevron {
  display: grid;

  width: 24px;
  height: 24px;

  flex: 0 0 24px;

  place-items: center;

  color: #64748b;

  font-size: 22px;
  font-weight: 400;

  line-height: 1;

  transform:
    rotate(0deg);

  transition:
    transform .2s ease,
    color .2s ease;
}

.accordion-chevron.open {
  color: #0f64ad;

  transform:
    rotate(90deg);
}

.accordion-panel {
  padding:
    0
    10px
    10px;

  border-top:
    1px solid #f1f5f9;

  animation:
    accordion-in
    .18s ease;
}

@keyframes accordion-in {
  from {
    opacity: 0;

    transform:
      translateY(-4px);
  }

  to {
    opacity: 1;

    transform:
      translateY(0);
  }
}

/*
 * ============================================================
 * CARGA Y ERROR
 * ============================================================
 */

.structure-loading {
  display: flex;

  align-items: center;
  justify-content: center;

  gap: 10px;

  padding: 25px 8px;

  color: #64748b;

  font-size: 14px;
}

.spinner {
  width: 18px;
  height: 18px;

  border: 2px solid #dbeafe;

  border-top-color:
    #0f64ad;

  border-radius: 999px;

  animation:
    spin
    .7s
    linear
    infinite;
}

.structure-error {
  display: flex;

  flex-direction: column;

  gap: 4px;

  padding: 12px;

  border: 1px solid #fecdd3;
  border-radius: 12px;

  background: #fff1f2;

  color: #be123c;
}

.structure-error strong {
  font-size: 14px;
}

.structure-error span {
  font-size: 13px;

  line-height: 1.45;
}

/*
 * ============================================================
 * RESUMEN ESTATAL
 * ============================================================
 */

.state-summary {
  display: flex;

  align-items: center;
  justify-content: space-between;

  gap: 12px;

  margin-top: 10px;

  padding: 12px;

  border-radius: 13px;

  background:
    linear-gradient(
      145deg,
      #f7fbff,
      #eef7fd
    );
}

.state-summary > div:first-child {
  display: flex;

  flex-direction: column;
}

.state-summary span {
  color: #64748b;

  font-size: 13px;
}

.state-summary strong {
  margin-top: 3px;

  color: #0f172a;

  font-size: 16px;
}

.state-summary-status {
  display: flex;

  align-items: center;

  gap: 8px;
}

.state-summary-status small {
  color: #166534;

  font-size: 11px;
  font-weight: 800;

  text-transform: uppercase;
}

/*
 * ============================================================
 * MÉTRICAS GERENCIALES
 * ============================================================
 */

.manager-metrics {
  display: grid;

  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );

  gap: 7px;

  margin-top: 8px;
}

.manager-metric {
  display: flex;

  min-width: 0;

  flex-direction: column;

  padding: 10px;

  border: 1px solid #edf2f7;
  border-radius: 12px;

  background: #fff;
}

.manager-metric strong {
  color: #0f172a;

  font-size: 16px;
}

.manager-metric span {
  margin-top: 3px;

  color: #64748b;

  font-size: 10px;
  font-weight: 800;

  letter-spacing: .02em;

  text-transform: uppercase;
}

.manager-metric.warning {
  border-color: #fed7aa;

  background: #fff7ed;
}

.manager-metric.warning strong,
.manager-metric.warning span {
  color: #c2410c;
}

.manager-metric.muted {
  background: #f8fafc;
}

/*
 * ============================================================
 * PERSONAS
 * ============================================================
 */

.person-list {
  display: grid;

  gap: 5px;

  padding-top: 7px;
}

.person-row {
  display: flex;

  width: 100%;

  align-items: center;

  gap: 10px;

  padding: 9px;

  border: 1px solid transparent;
  border-radius: 12px;

  background: #fff;

  cursor: pointer;

  text-align: left;

  transition:
    border-color .14s ease,
    background .14s ease,
    transform .14s ease;
}

.person-row:hover {
  transform:
    translateX(2px);

  border-color: #d9e9f6;

  background: #f8fbfe;
}

.row-avatar,
.person-avatar {
  display: grid;

  place-items: center;

  border-radius: 11px;

  font-weight: 900;
}

.row-avatar {
  width: 36px;
  height: 36px;

  flex: 0 0 36px;

  font-size: 13px;
}

.row-avatar.coordinator,
.person-avatar.coordinator {
  background: #f3e8ff;

  color: #7e22ce;
}

.row-avatar.supervisor,
.person-avatar.supervisor {
  background: #eaf4fc;

  color: #0f64ad;
}

.row-copy {
  display: flex;

  min-width: 0;

  flex: 1;

  flex-direction: column;
}

.row-copy strong {
  overflow: hidden;

  color: #0f172a;

  font-size: 13px;

  text-overflow: ellipsis;

  white-space: nowrap;
}

.row-copy span {
  margin-top: 3px;

  color: #64748b;

  font-size: 11px;
}

.row-copy .row-warning {
  margin-top: 4px;

  color: #c2410c;

  font-size: 8.5px;
  font-weight: 800;
}

.row-arrow {
  color: #94a3b8;

  font-size: 21px;
  font-weight: 300;
}

/*
 * ============================================================
 * HERO PERSONA
 * ============================================================
 */

.person-hero {
  display: flex;

  align-items: center;

  gap: 11px;

  margin-bottom: 8px;

  padding: 12px;

  border: 1px solid #e5edf5;
  border-radius: 14px;

  background: #fff;
}

.person-hero.compact {
  margin-bottom: 8px;
}

.person-avatar {
  width: 44px;
  height: 44px;

  flex: 0 0 44px;

  font-size: 14px;
}

.person-hero-copy {
  display: flex;

  min-width: 0;

  flex-direction: column;
}

.person-hero-copy > span {
  color: #64748b;

  font-size: 11px;
  font-weight: 800;

  text-transform: uppercase;
}

.person-hero-copy strong {
  margin-top: 3px;

  color: #0f172a;

  font-size: 14px;

  line-height: 1.3;
}

.person-hero-copy small {
  margin-top: 3px;

  color: #64748b;

  font-size: 11px;
}

/*
 * ============================================================
 * RESUMEN
 * ============================================================
 */

.summary-grid {
  display: grid;

  gap: 7px;

  margin-top: 9px;
}

.summary-grid.two {
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
}

.summary-grid.three {
  grid-template-columns:
    repeat(
      3,
      minmax(0, 1fr)
    );
}

.summary-item {
  display: flex;

  min-width: 0;

  flex-direction: column;

  padding: 10px;

  border: 1px solid transparent;
  border-radius: 12px;

  background: #f8fafc;
}

.summary-item strong {
  overflow: hidden;

  color: #0f172a;

  font-size: 16px;

  text-overflow: ellipsis;
}

.summary-item span {
  margin-top: 3px;

  color: #64748b;

  font-size: 10px;
  font-weight: 750;

  text-transform: uppercase;
}

.summary-item.warning {
  border-color: #fed7aa;

  background: #fff7ed;
}

.summary-item.warning strong,
.summary-item.warning span {
  color: #c2410c;
}

/*
 * ============================================================
 * FILTROS TERRITORIALES
 * ============================================================
 */

.territory-filter-list {
  display: grid;

  gap: 6px;

  padding-top: 9px;
}

.territory-filter {
  display: flex;

  width: 100%;

  align-items: center;
  justify-content: space-between;

  gap: 10px;

  padding: 9px 10px;

  border: 1px solid #e5edf5;
  border-radius: 11px;

  background: #fff;

  cursor: pointer;

  text-align: left;

  transition:
    border-color .15s ease,
    background .15s ease;
}

.territory-filter:hover {
  border-color: #bfdcf2;

  background: #f8fbfe;
}

.territory-filter.active {
  border-color: #79b6e6;

  background: #eff8ff;
}

.territory-filter.warning:not(.active) {
  border-color: #fed7aa;

  background: #fffaf5;
}

.territory-filter > div:first-child {
  display: flex;

  min-width: 0;

  flex-direction: column;
}

.territory-filter strong {
  color: #0f172a;

  font-size: 12px;
}

.territory-filter > div:first-child span {
  margin-top: 2px;

  color: #64748b;

  font-size: 8.5px;
}

.territory-filter-end {
  display: flex;

  align-items: center;

  gap: 7px;
}

.territory-filter-end small {
  display: grid;

  min-width: 28px;
  height: 23px;

  place-items: center;

  padding: 0 7px;

  border-radius: 999px;

  background: #f1f5f9;

  color: #475569;

  font-size: 11px;
  font-weight: 900;
}

.territory-filter.active
.territory-filter-end small {
  background: #dceefa;

  color: #0f64ad;
}

.territory-filter.warning
.territory-filter-end small {
  background: #ffedd5;

  color: #c2410c;
}

.territory-filter-end span {
  color: #94a3b8;

  font-size: 18px;
}

/*
 * ============================================================
 * MENSAJES
 * ============================================================
 */

.empty-state,
.empty-warning,
.scope-notice,
.map-indicator,
.data-warning {
  display: flex;

  flex-direction: column;

  gap: 4px;

  margin-top: 9px;

  padding: 10px;

  border-radius: 12px;
}

.empty-state {
  border: 1px dashed #cbd5e1;

  background: #f8fafc;
}

.empty-state.compact-empty {
  margin-bottom: 1px;
}

.empty-warning {
  border: 1px solid #fed7aa;

  background: #fff7ed;
}

.scope-notice {
  border: 1px solid #bfdbfe;

  background: #eff6ff;
}

.data-warning {
  border: 1px solid #fecaca;

  background: #fef2f2;
}

.empty-state strong,
.empty-warning strong,
.scope-notice strong,
.data-warning strong {
  color: #334155;

  font-size: 12px;
}

.empty-warning strong {
  color: #c2410c;
}

.scope-notice strong {
  color: #1d4ed8;
}

.data-warning strong {
  color: #b91c1c;
}

.empty-state span,
.empty-warning span,
.scope-notice span,
.data-warning span {
  color: #64748b;

  font-size: 11px;

  line-height: 1.45;
}

.map-indicator {
  flex-direction: row;

  align-items: center;

  background: #f0fdf4;

  color: #166534;

  font-size: 11px;

  line-height: 1.4;
}

.map-indicator-dot {
  width: 8px;
  height: 8px;

  flex: 0 0 8px;

  border-radius: 999px;

  background: #22c55e;
}

/*
 * ============================================================
 * ANIMACIONES
 * ============================================================
 */

@keyframes spin {
  to {
    transform:
      rotate(360deg);
  }
}

/*
 * ============================================================
 * RESPONSIVE
 * ============================================================
 */

@media (
  max-width: 640px
) {
  .structure {
    bottom: 12px;
    left: 12px;

    width:
      calc(100vw - 24px);

    max-height:
      min(
        62vh,
        590px
      );
  }

  .structure-fixed {
    padding:
      12px
      12px
      0;
  }

  .structure-body {
    padding:
      10px
      8px
      12px
      12px;
  }

  .summary-grid.three {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }
}
</style>