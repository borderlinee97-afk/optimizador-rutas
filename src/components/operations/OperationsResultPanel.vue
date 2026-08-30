<!-- src/components/operations/OperationsResultPanel.vue -->

<template>
  <div class="operations-result">
    <!-- =====================================================
         HEADER
    ====================================================== -->

    <header class="result-header">
      <div>
        <span class="result-eyebrow">
          Operaciones
        </span>

        <h2 class="result-title">
          Resumen general
        </h2>

        <p class="result-subtitle">
          {{
            hasResult
              ? resultSubtitle
              : 'Los resultados del cálculo aparecerán aquí.'
          }}
        </p>
      </div>

      <div
        v-if="hasResult"
        class="result-status"
        :class="resultStatusClass"
      >
        <span class="result-status__dot"></span>

        {{ resultStatusLabel }}
      </div>
    </header>

    <!-- =====================================================
         CARGANDO
    ====================================================== -->

    <section
      v-if="loading"
      class="state-card state-card--loading"
    >
      <div class="loading-spinner"></div>

      <strong>
        Calculando operación
      </strong>

      <span>
        El motor está determinando cobertura, rutas y recursos
        requeridos.
      </span>
    </section>

    <!-- =====================================================
         ERROR
    ====================================================== -->

    <section
      v-else-if="error && !hasResult"
      class="state-card state-card--error"
    >
      <div class="state-icon">
        !
      </div>

      <strong>
        No fue posible calcular
      </strong>

      <span>
        {{ error }}
      </span>

      <button
        type="button"
        class="secondary-action"
        @click="$emit('calculate')"
      >
        Revisar criterios
      </button>
    </section>

    <!-- =====================================================
         SIN RESULTADO
    ====================================================== -->

    <section
      v-else-if="!hasResult"
      class="empty-state"
    >
      <div class="empty-state__visual">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="8"
          />

          <path
            d="M8.5 13.5 11 11l2 2 3-3"
          />

          <path
            d="M8 17h8"
          />
        </svg>
      </div>

      <strong>
        Sin cálculo activo
      </strong>

      <p>
        Selecciona un proyecto o región y calcula la operación.
        El motor determinará automáticamente las rutas,
        operadores, vehículos y jornadas necesarias.
      </p>

      <button
        type="button"
        class="primary-action"
        @click="$emit('calculate')"
      >
        Calcular operación
      </button>
    </section>

    <!-- =====================================================
         RESULTADO
    ====================================================== -->

    <template v-else>
      <!-- ===================================================
           COBERTURA
      ==================================================== -->

      <section class="result-section result-section--first">
        <div class="section-heading">
          <div>
            <span class="section-kicker">
              Demanda
            </span>

            <h3>
              Cobertura
            </h3>
          </div>

          <strong class="coverage-percent">
            {{ coveragePercentText }}
          </strong>
        </div>

        <div class="coverage-card">
          <div class="coverage-numbers">
            <strong>
              {{ assignedDestinations }}
            </strong>

            <span>
              de
            </span>

            <strong>
              {{ totalDestinations }}
            </strong>

            <span>
              unidades
            </span>
          </div>

          <div class="coverage-track">
            <div
              class="coverage-track__fill"
              :style="{
                width:
                  `${normalizedCoveragePercent}%`,
              }"
            ></div>
          </div>

          <div class="coverage-footer">
            <span>
              Cobertura obligatoria
            </span>

            <strong>
              {{
                mandatoryCoverageSatisfied
                  ? 'Cumplida'
                  : 'Pendiente'
              }}
            </strong>
          </div>
        </div>
      </section>

      <!-- ===================================================
           TOTAL DEL TERRITORIO
      ==================================================== -->

      <section class="result-section territory-section">
        <div class="section-heading">
          <div>
            <span class="section-kicker">
              Total acumulado
            </span>

            <h3>
              Total del territorio
            </h3>
          </div>
        </div>

        <p class="section-description">
          Sumatoria de todas las rutas necesarias para recorrer
          la totalidad del ámbito seleccionado.
        </p>

        <div class="territory-total">
          <div class="territory-primary">
            <span>
              Distancia acumulada
            </span>

            <strong>
              {{ formatDistance(totalDistanceMeters) }}
            </strong>
          </div>

          <div class="territory-metrics">
            <div class="territory-metric">
              <span>
                Conducción acumulada
              </span>

              <strong>
                {{
                  formatDuration(
                    totalDrivingSeconds
                  )
                }}
              </strong>
            </div>

            <div class="territory-metric">
              <span>
                Servicio acumulado
              </span>

              <strong>
                {{
                  formatDuration(
                    totalServiceSeconds
                  )
                }}
              </strong>
            </div>

            <div class="territory-metric territory-metric--important">
              <span>
                Tiempo operativo acumulado
              </span>

              <strong>
                {{
                  formatDuration(
                    totalOperationalSeconds
                  )
                }}
              </strong>
            </div>

            <div class="territory-metric">
              <span>
                Combustible estimado
              </span>

              <strong>
                {{
                  economicEstimate?.fuelLiters !==
                    null &&
                  economicEstimate?.fuelLiters !==
                    undefined
                    ? `${formatDecimal(
                        economicEstimate.fuelLiters,
                        1
                      )} L`
                    : 'No estimado'
                }}
              </strong>
            </div>
          </div>
        </div>

        <p class="territory-note">
          El tiempo acumulado representa la carga total del
          territorio. No significa que toda la operación deba
          ejecutarse de forma consecutiva por una sola persona.
        </p>
      </section>

      <!-- ===================================================
           EJECUCIÓN SIMULTÁNEA
      ==================================================== -->

      <section class="result-section">
        <div class="section-heading">
          <div>
            <span class="section-kicker">
              Capacidad requerida
            </span>

            <h3>
              Ejecución simultánea
            </h3>
          </div>
        </div>

        <p class="section-description">
          Tiempo aproximado para completar la operación cuando
          las rutas calculadas se ejecutan en paralelo.
        </p>

        <div class="simultaneous-card">
          <span class="simultaneous-card__label">
            Tiempo estimado para completar la operación
          </span>

          <strong class="simultaneous-card__time">
            {{
              formatDuration(
                simultaneousExecutionSeconds
              )
            }}
          </strong>

          <small>
            {{
              simultaneousExplanation
            }}
          </small>
        </div>

        <div class="resource-grid">
          <article class="resource-card">
            <span class="resource-card__label">
              Rutas
            </span>

            <strong>
              {{ valueOrDash(requiredResources?.routes) }}
            </strong>

            <small>
              Simultáneas
            </small>
          </article>

          <article class="resource-card">
            <span class="resource-card__label">
              Operadores
            </span>

            <strong>
              {{ valueOrDash(requiredResources?.operators) }}
            </strong>

            <small>
              Requeridos
            </small>
          </article>

          <article class="resource-card">
            <span class="resource-card__label">
              Vehículos
            </span>

            <strong>
              {{ valueOrDash(requiredResources?.vehicles) }}
            </strong>

            <small>
              Requeridos
            </small>
          </article>

          <article class="resource-card">
            <span class="resource-card__label">
              Jornadas
            </span>

            <strong>
              {{ valueOrDash(requiredResources?.days) }}
            </strong>

            <small>
              Requeridas
            </small>
          </article>
        </div>

        <p class="resource-note">
          Los recursos mostrados representan la necesidad
          determinada por el motor. Todavía no se comparan contra
          operadores o vehículos registrados.
        </p>
      </section>

      <!-- ===================================================
           VALIDACIÓN OPERATIVA
      ==================================================== -->

      <section class="result-section">
        <div class="section-heading">
          <div>
            <span class="section-kicker">
              Validación
            </span>

            <h3>
              Resultado del motor
            </h3>
          </div>
        </div>

        <div class="summary-list">
          <div class="summary-row">
            <span>
              Tipo de operación
            </span>

            <strong>
              {{ routeModeLabel }}
            </strong>
          </div>

          <div class="summary-row">
            <span>
              Validación carretera
            </span>

            <strong
              :class="{
                good:
                  feasibility?.roadVerified ===
                  true,

                warning:
                  feasibility?.roadVerified ===
                  false,
              }"
            >
              {{ roadValidationLabel }}
            </strong>
          </div>

          <div class="summary-row">
            <span>
              Calidad de rutas
            </span>

            <strong
              :class="qualityTextClass"
            >
              {{ qualityLabel }}
            </strong>
          </div>
        </div>
      </section>

      <!-- ===================================================
           ESTIMACIÓN ECONÓMICA
      ==================================================== -->

      <section class="result-section">
        <div class="section-heading">
          <div>
            <span class="section-kicker">
              Estimación
            </span>

            <h3>
              Combustible y viáticos
            </h3>
          </div>

          <span class="estimate-badge">
            Aproximado
          </span>
        </div>

        <div class="estimate-list">
          <div class="estimate-row">
            <div>
              <span>
                Combustible total
              </span>

              <small>
                {{
                  economicEstimate?.kmPerLiter
                    ? `${formatDecimal(
                        economicEstimate.kmPerLiter,
                        1
                      )} km/L`
                    : 'Sin rendimiento indicado'
                }}
              </small>
            </div>

            <strong>
              {{
                economicEstimate?.fuelLiters !==
                  null &&
                economicEstimate?.fuelLiters !==
                  undefined
                  ? `${formatDecimal(
                      economicEstimate.fuelLiters,
                      1
                    )} L`
                  : 'No estimado'
              }}
            </strong>
          </div>

          <div class="estimate-row">
            <div>
              <span>
                Costo de combustible
              </span>

              <small>
                {{
                  economicEstimate
                    ?.fuelPricePerLiter !==
                    null &&
                  economicEstimate
                    ?.fuelPricePerLiter !==
                    undefined
                    ? `${formatCurrency(
                        economicEstimate
                          .fuelPricePerLiter
                      )} por litro`
                    : 'Falta precio por litro'
                }}
              </small>
            </div>

            <strong>
              {{
                economicEstimate?.fuelCost !==
                  null &&
                economicEstimate?.fuelCost !==
                  undefined
                  ? formatCurrency(
                      economicEstimate.fuelCost
                    )
                  : 'No estimado'
              }}
            </strong>
          </div>

          <div class="estimate-row">
            <div>
              <span>
                Viáticos totales
              </span>

              <small>
                {{ allowanceDetail }}
              </small>
            </div>

            <strong>
              {{
                economicEstimate
                  ?.allowanceCost !==
                  null &&
                economicEstimate
                  ?.allowanceCost !==
                  undefined
                  ? formatCurrency(
                      economicEstimate
                        .allowanceCost
                    )
                  : 'No estimado'
              }}
            </strong>
          </div>

          <div class="estimate-row estimate-row--total">
            <div>
              <span>
                Total conocido
              </span>

              <small>
                No incluye conceptos todavía no evaluados.
              </small>
            </div>

            <strong>
              {{
                economicEstimate
                  ?.knownTotal !==
                  null &&
                economicEstimate
                  ?.knownTotal !==
                  undefined
                  ? formatCurrency(
                      economicEstimate
                        .knownTotal
                    )
                  : 'Pendiente'
              }}
            </strong>
          </div>
        </div>

        <p class="estimate-note">
          El consumo utiliza un rendimiento genérico mientras no
          exista un vehículo asignado. No representa el consumo
          certificado de una unidad específica.
        </p>
      </section>

      <!-- ===================================================
           RUTAS
      ==================================================== -->

      <section class="result-section">
        <div class="section-heading route-heading">
          <div>
            <span class="section-kicker">
              Desglose
            </span>

            <h3>
              Rutas generadas
            </h3>
          </div>

          <button
            v-if="routes.length > 1"
            type="button"
            class="text-action"
            @click="$emit('show-all-routes')"
          >
            Ver todas
          </button>
        </div>

        <div
          v-if="routes.length"
          class="route-list"
        >
          <article
            v-for="route in routes"
            :key="
              route.vehicleIndex ??
              route.index
            "
            class="route-card"
            :class="{
              selected:
                Number(selectedRouteIndex) ===
                Number(route.index),
            }"
            @click="
              $emit(
                'focus-route',
                route.index
              )
            "
          >
            <div class="route-card__top">
              <div class="route-card__identity">
                <span
                  class="route-color"
                  :style="{
                    background:
                      route.color,
                  }"
                ></span>

                <div>
                  <strong>
                    Ruta {{ route.number }}
                  </strong>

                  <small>
                    {{ route.pointCount }}
                    {{
                      route.pointCount === 1
                        ? 'unidad'
                        : 'unidades'
                    }}
                  </small>
                </div>
              </div>

              <span
                v-if="route.workdayStatus"
                class="route-workday"
                :class="
                  workdayClass(
                    route.workdayStatus
                  )
                "
              >
                {{
                  workdayLabel(
                    route.workdayStatus
                  )
                }}
              </span>
            </div>

            <!-- ===============================================
                 DESGLOSE DE MÉTRICAS POR RUTA
            ================================================ -->

            <div class="route-card__metrics">
              <div>
                <span>
                  Distancia
                </span>

                <strong>
                  {{
                    formatDistance(
                      route.distanceMeters
                    )
                  }}
                </strong>
              </div>

              <div>
                <span>
                  Conducción
                </span>

                <strong>
                  {{
                    formatDuration(
                      getRouteDrivingSeconds(
                        route
                      )
                    )
                  }}
                </strong>
              </div>

              <div>
                <span>
                  Servicio
                </span>

                <strong>
                  {{
                    formatDuration(
                      getRouteServiceSeconds(
                        route
                      )
                    )
                  }}
                </strong>
              </div>

              <div>
                <span>
                  Tiempo operativo
                </span>

                <strong>
                  {{
                    formatDuration(
                      getRouteOperationalSeconds(
                        route
                      )
                    )
                  }}
                </strong>
              </div>

              <div>
                <span>
                  Combustible est.
                </span>

                <strong>
                  {{
                    route
                      .estimatedFuelLiters !==
                      null &&
                    route
                      .estimatedFuelLiters !==
                      undefined
                      ? `${formatDecimal(
                          route
                            .estimatedFuelLiters,
                          1
                        )} L`
                      : '—'
                  }}
                </strong>
              </div>
            </div>

            <ol
              v-if="route.points?.length"
              class="route-stops"
            >
              <li
                v-for="point in route.points"
                :key="
                  `${route.index}-${point.pointKey}`
                "
              >
                <span class="stop-number">
                  {{ point.order }}
                </span>

                <div>
                  <strong>
                    {{ point.unidad }}
                  </strong>

                  <small v-if="point.clues">
                    {{ point.clues }}
                  </small>
                </div>
              </li>
            </ol>

            <div class="route-card__footer">
              <span>
                {{
                  Number(
                    selectedRouteIndex
                  ) ===
                  Number(
                    route.index
                  )
                    ? 'Selecciona nuevamente para mostrar todas'
                    : 'Selecciona para enfocar en el mapa'
                }}
              </span>

              <span aria-hidden="true">
                →
              </span>
            </div>
          </article>
        </div>

        <div
          v-else
          class="routes-empty"
        >
          El resultado no contiene geometrías de ruta.
        </div>
      </section>

      <!-- ===================================================
           OBSERVACIONES
      ==================================================== -->

      <section
        v-if="hasObservations"
        class="result-section"
      >
        <div class="section-heading">
          <div>
            <span class="section-kicker">
              Control
            </span>

            <h3>
              Observaciones
            </h3>
          </div>
        </div>

        <div class="observation-list">
          <div
            v-if="
              planning?.recommendationStatus ===
              'REVIEW_REQUIRED'
            "
            class="observation observation--warning"
          >
            El cálculo es utilizable, pero requiere revisión antes
            de considerarlo una recomendación final.
          </div>

          <div
            v-if="
              feasibility?.roadVerified ===
              false
            "
            class="observation observation--warning"
          >
            La validación final con la red carretera no pudo
            confirmarse completamente.
          </div>

          <div
            v-if="
              quality?.status ===
              'REVIEW'
            "
            class="observation observation--warning"
          >
            El validador territorial detectó elementos que conviene
            revisar.
          </div>

          <div
            v-if="
              quality?.status ===
              'REJECT'
            "
            class="observation observation--danger"
          >
            La calidad territorial del resultado no es aceptable
            para recomendación.
          </div>
        </div>
      </section>

      <!-- ===================================================
           ACCIONES
      ==================================================== -->

      <footer class="result-actions">
        <button
          type="button"
          class="secondary-action"
          @click="$emit('clear')"
        >
          Cerrar resultado
        </button>

        <button
          type="button"
          class="primary-action"
          @click="$emit('calculate')"
        >
          Nuevo cálculo
        </button>
      </footer>
    </template>
  </div>
</template>

<script setup>
import {
  computed,
} from 'vue'

/*
 * ============================================================
 * PROPS
 * ============================================================
 */

const props =
  defineProps({
    loading: {
      type:
        Boolean,

      default:
        false,
    },

    error: {
      type:
        String,

      default:
        '',
    },

    result: {
      type:
        Object,

      default:
        null,
    },

    planning: {
      type:
        Object,

      default:
        null,
    },

    requiredResources: {
      type:
        Object,

      default:
        () => ({
          routes:
            null,

          operators:
            null,

          vehicles:
            null,

          days:
            null,
        }),
    },

    demand: {
      type:
        Object,

      default:
        null,
    },

    quality: {
      type:
        Object,

      default:
        null,
    },

    feasibility: {
      type:
        Object,

      default:
        null,
    },

    routes: {
      type:
        Array,

      default:
        () => [],
    },

    totalDistanceMeters: {
      type:
        Number,

      default:
        0,
    },

    totalTravelDurationSeconds: {
      type:
        Number,

      default:
        0,
    },

    economicEstimate: {
      type:
        Object,

      default:
        null,
    },

    selectedRouteIndex: {
      type:
        Number,

      default:
        null,
    },
  })

defineEmits([
  'calculate',
  'clear',
  'focus-route',
  'show-all-routes',
])

/*
 * ============================================================
 * HELPERS DE DURACIÓN
 * ============================================================
 */

function finiteNumber(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number =
    Number(
      value
    )

  return Number.isFinite(
    number
  )
    ? number
    : null
}

function parseDurationSeconds(
  value
) {
  if (
    typeof value ===
    'number'
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0
  }

  const text =
    String(
      value ??
      ''
    ).trim()

  const match =
    text.match(
      /^(-?\d+(?:\.\d+)?)s$/
    )

  if (
    !match
  ) {
    return 0
  }

  const seconds =
    Number(
      match[1]
    )

  return Number.isFinite(
    seconds
  )
    ? seconds
    : 0
}

function routeMetrics(
  route
) {
  return (
    route
      ?.raw
      ?.metrics ||
    route
      ?.metrics ||
    {}
  )
}

function getRouteDrivingSeconds(
  route
) {
  return parseDurationSeconds(
    routeMetrics(
      route
    )
      ?.travelDuration
  )
}

function getRouteServiceSeconds(
  route
) {
  return parseDurationSeconds(
    routeMetrics(
      route
    )
      ?.visitDuration
  )
}

function getRouteWaitSeconds(
  route
) {
  return parseDurationSeconds(
    routeMetrics(
      route
    )
      ?.waitDuration
  )
}

function getRouteBreakSeconds(
  route
) {
  return parseDurationSeconds(
    routeMetrics(
      route
    )
      ?.breakDuration
  )
}

function getRouteOperationalSeconds(
  route
) {
  const direct =
    finiteNumber(
      route
        ?.durationSeconds
    )

  if (
    direct !==
    null
  ) {
    return direct
  }

  return (
    getRouteDrivingSeconds(
      route
    ) +
    getRouteServiceSeconds(
      route
    ) +
    getRouteWaitSeconds(
      route
    ) +
    getRouteBreakSeconds(
      route
    )
  )
}

function sumRoutes(
  resolver
) {
  return props.routes.reduce(
    (
      total,
      route
    ) =>
      total +
      Number(
        resolver(
          route
        ) ||
        0
      ),
    0
  )
}

/*
 * ============================================================
 * RESULTADO
 * ============================================================
 */

const hasResult =
  computed(
    () =>
      Boolean(
        props.result
      )
  )

/*
 * ============================================================
 * COBERTURA
 * ============================================================
 */

const normalizedCoveragePercent =
  computed(
    () => {
      const value =
        Number(
          props
            .demand
            ?.coveragePercent ??
          0
        )

      if (
        !Number.isFinite(
          value
        )
      ) {
        return 0
      }

      return Math.max(
        0,
        Math.min(
          100,
          value
        )
      )
    }
  )

const coveragePercentText =
  computed(
    () =>
      `${formatDecimal(
        normalizedCoveragePercent
          .value,
        normalizedCoveragePercent
          .value %
          1 ===
          0
          ? 0
          : 1
      )}%`
  )

const assignedDestinations =
  computed(
    () =>
      Number(
        props
          .demand
          ?.assignedDestinations ??
        0
      )
  )

const totalDestinations =
  computed(
    () =>
      Number(
        props
          .demand
          ?.totalDestinations ??
        0
      )
  )

const mandatoryCoverageSatisfied =
  computed(
    () =>
      Boolean(
        props
          .demand
          ?.mandatoryCoverageSatisfied
      )
  )

/*
 * ============================================================
 * TOTALES DEL TERRITORIO
 *
 * Autoridad:
 * 1. planning.totals validado por backend
 * 2. fallback a suma de rutas
 * ============================================================
 */

const totalDrivingSeconds =
  computed(
    () => {
      const validated =
        finiteNumber(
          props
            .planning
            ?.totals
            ?.travelDurationSeconds
        )

      if (
        validated !==
        null
      ) {
        return validated
      }

      return sumRoutes(
        getRouteDrivingSeconds
      )
    }
  )

const totalServiceSeconds =
  computed(
    () => {
      const validated =
        finiteNumber(
          props
            .planning
            ?.totals
            ?.serviceDurationSeconds
        )

      if (
        validated !==
        null
      ) {
        return validated
      }

      return sumRoutes(
        getRouteServiceSeconds
      )
    }
  )

const totalOperationalSeconds =
  computed(
    () => {
      const validated =
        finiteNumber(
          props
            .planning
            ?.totals
            ?.operationalDurationSeconds
        )

      if (
        validated !==
        null
      ) {
        return validated
      }

      return sumRoutes(
        getRouteOperationalSeconds
      )
    }
  )

/*
 * calendarDurationSeconds representa el tiempo calendario
 * necesario para completar el plan simultáneo en ROUND_TRIP.
 *
 * Si el backend no lo entrega, usamos como fallback la ruta
 * crítica: la ruta individual de mayor duración.
 */

const simultaneousExecutionSeconds =
  computed(
    () => {
      const validated =
        finiteNumber(
          props
            .planning
            ?.totals
            ?.calendarDurationSeconds
        )

      if (
        validated !==
          null &&
        validated >
          0
      ) {
        return validated
      }

      const durations =
        props.routes.map(
          getRouteOperationalSeconds
        )

      if (
        !durations.length
      ) {
        return 0
      }

      return Math.max(
        ...durations
      )
    }
  )

/*
 * ============================================================
 * MODO
 * ============================================================
 */

const normalizedRouteMode =
  computed(
    () =>
      String(
        props
          .planning
          ?.routeMode ||
        ''
      )
        .trim()
        .toUpperCase()
  )

const routeModeLabel =
  computed(
    () => {
      if (
        normalizedRouteMode
          .value ===
        'FOREIGN_ROUTE'
      ) {
        return 'Ruta foránea'
      }

      if (
        normalizedRouteMode
          .value ===
        'ROUND_TRIP'
      ) {
        return 'Ida y vuelta'
      }

      return '—'
    }
  )

const simultaneousExplanation =
  computed(
    () => {
      const routes =
        Number(
          props
            .requiredResources
            ?.routes
        )

      if (
        normalizedRouteMode
          .value ===
        'FOREIGN_ROUTE'
      ) {
        return routes ===
          1
          ? 'Duración aproximada de la expedición completa.'
          : `Considerando ${routes} expediciones operando en paralelo.`
      }

      return routes ===
        1
        ? 'La operación requiere una sola ruta.'
        : `Considerando ${routes} rutas ejecutándose en paralelo.`
    }
  )

/*
 * ============================================================
 * VALIDACIONES
 * ============================================================
 */

const roadValidationLabel =
  computed(
    () => {
      if (
        props
          .feasibility
          ?.roadValidationEvaluated !==
        true
      ) {
        return 'No evaluada'
      }

      return props
        .feasibility
        ?.roadVerified
        ? 'Verificada'
        : 'Revisión requerida'
    }
  )

const qualityLabel =
  computed(
    () => {
      const status =
        String(
          props
            .quality
            ?.status ||
          ''
        )
          .trim()
          .toUpperCase()

      if (
        status ===
        'PASS'
      ) {
        return 'Aprobada'
      }

      if (
        status ===
        'REVIEW'
      ) {
        return 'Revisión'
      }

      if (
        status ===
        'REJECT'
      ) {
        return 'No aceptable'
      }

      return 'No evaluada'
    }
  )

const qualityTextClass =
  computed(
    () => {
      const status =
        String(
          props
            .quality
            ?.status ||
          ''
        )
          .trim()
          .toUpperCase()

      return {
        good:
          status ===
          'PASS',

        warning:
          status ===
          'REVIEW',

        danger:
          status ===
          'REJECT',
      }
    }
  )

const resultStatusLabel =
  computed(
    () => {
      const status =
        String(
          props
            .planning
            ?.recommendationStatus ||
          ''
        )
          .trim()
          .toUpperCase()

      if (
        status ===
        'READY'
      ) {
        return 'Listo'
      }

      if (
        status ===
        'REVIEW_REQUIRED'
      ) {
        return 'Revisar'
      }

      return props.result
        ?.usable
        ? 'Utilizable'
        : 'No utilizable'
    }
  )

const resultStatusClass =
  computed(
    () => {
      const status =
        String(
          props
            .planning
            ?.recommendationStatus ||
          ''
        )
          .trim()
          .toUpperCase()

      return {
        'result-status--ready':
          status ===
          'READY',

        'result-status--review':
          status ===
          'REVIEW_REQUIRED',
      }
    }
  )

const resultSubtitle =
  computed(
    () => {
      if (
        normalizedRouteMode
          .value ===
        'FOREIGN_ROUTE'
      ) {
        return 'Resultado consolidado de la expedición calculada.'
      }

      return 'Resultado consolidado de todas las rutas calculadas.'
    }
  )

/*
 * ============================================================
 * VIÁTICOS
 * ============================================================
 */

const allowanceDetail =
  computed(
    () => {
      const dailyAllowance =
        props
          .economicEstimate
          ?.dailyAllowance

      const operators =
        Number(
          props
            .requiredResources
            ?.operators
        )

      const days =
        Number(
          props
            .requiredResources
            ?.days
        )

      if (
        dailyAllowance ===
          null ||
        dailyAllowance ===
          undefined
      ) {
        return 'Falta viático diario.'
      }

      if (
        !Number.isFinite(
          operators
        ) ||
        !Number.isFinite(
          days
        )
      ) {
        return 'Pendiente de recursos requeridos.'
      }

      return `${operators} ${
        operators === 1
          ? 'operador'
          : 'operadores'
      } × ${days} ${
        days === 1
          ? 'jornada'
          : 'jornadas'
      } × ${formatCurrency(
        dailyAllowance
      )}`
    }
  )

/*
 * ============================================================
 * OBSERVACIONES
 * ============================================================
 */

const hasObservations =
  computed(
    () =>
      props
        .planning
        ?.recommendationStatus ===
        'REVIEW_REQUIRED' ||
      props
        .feasibility
        ?.roadVerified ===
        false ||
      [
        'REVIEW',
        'REJECT',
      ].includes(
        String(
          props
            .quality
            ?.status ||
          ''
        )
          .trim()
          .toUpperCase()
      )
  )

/*
 * ============================================================
 * FORMAT
 * ============================================================
 */

function valueOrDash(
  value
) {
  const number =
    Number(
      value
    )

  return Number.isFinite(
    number
  )
    ? number
    : '—'
}

function formatDecimal(
  value,
  decimals = 1
) {
  const number =
    Number(
      value
    )

  if (
    !Number.isFinite(
      number
    )
  ) {
    return '—'
  }

  return number.toLocaleString(
    'es-MX',
    {
      minimumFractionDigits:
        decimals,

      maximumFractionDigits:
        decimals,
    }
  )
}

function formatDistance(
  meters
) {
  const value =
    Number(
      meters
    )

  if (
    !Number.isFinite(
      value
    )
  ) {
    return '—'
  }

  const kilometers =
    value /
    1000

  return `${kilometers.toLocaleString(
    'es-MX',
    {
      minimumFractionDigits:
        1,

      maximumFractionDigits:
        1,
    }
  )} km`
}

function formatDuration(
  seconds
) {
  const value =
    Number(
      seconds
    )

  if (
    !Number.isFinite(
      value
    ) ||
    value <
      0
  ) {
    return '—'
  }

  const totalMinutes =
    Math.round(
      value /
      60
    )

  const hours =
    Math.floor(
      totalMinutes /
      60
    )

  const minutes =
    totalMinutes %
    60

  if (
    hours <=
    0
  ) {
    return `${minutes} min`
  }

  if (
    minutes ===
    0
  ) {
    return `${hours} h`
  }

  return `${hours} h ${minutes} min`
}

function formatCurrency(
  value
) {
  const number =
    Number(
      value
    )

  if (
    !Number.isFinite(
      number
    )
  ) {
    return '—'
  }

  return number.toLocaleString(
    'es-MX',
    {
      style:
        'currency',

      currency:
        'MXN',

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    }
  )
}

function workdayLabel(
  status
) {
  const value =
    String(
      status ||
      ''
    )
      .trim()
      .toUpperCase()

  if (
    value ===
    'NORMAL'
  ) {
    return 'Normal'
  }

  if (
    value ===
    'EXTENDED_RETURN'
  ) {
    return 'Retorno extendido'
  }

  if (
    value ===
    'INFEASIBLE'
  ) {
    return 'No factible'
  }

  return status ||
    '—'
}

function workdayClass(
  status
) {
  const value =
    String(
      status ||
      ''
    )
      .trim()
      .toUpperCase()

  return {
    'route-workday--normal':
      value ===
      'NORMAL',

    'route-workday--extended':
      value ===
      'EXTENDED_RETURN',

    'route-workday--danger':
      value ===
      'INFEASIBLE',
  }
}
</script>

<style scoped>
.operations-result {
  color: #1e293b;
}

/*
 * ============================================================
 * HEADER
 * ============================================================
 */

.result-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.result-eyebrow,
.section-kicker {
  display: block;
  margin-bottom: 4px;
  color: #0f64ad;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.result-title {
  margin: 0;
  color: #172033;
  font-size: 19px;
  font-weight: 850;
  line-height: 1.2;
}

.result-subtitle {
  margin: 5px 0 0;
  color: #7b8798;
  font-size: 12px;
  line-height: 1.45;
}

.result-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  padding: 5px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.result-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.result-status--ready {
  background: #edf9f1;
  color: #1f7a42;
}

.result-status--review {
  background: #fff8e6;
  color: #9a6812;
}

/*
 * ============================================================
 * STATES
 * ============================================================
 */

.state-card,
.empty-state {
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 30px 18px;
  border: 1px solid #e3e9f0;
  border-radius: 14px;
  background: #fafcfd;
  text-align: center;
}

.state-card strong,
.empty-state strong {
  margin-top: 8px;
  color: #263449;
  font-size: 15px;
}

.state-card span,
.empty-state p {
  max-width: 310px;
  margin: 6px 0 0;
  color: #7a8798;
  font-size: 12px;
  line-height: 1.5;
}

.state-card--error {
  border-color: #f0cfcc;
  background: #fff8f7;
}

.state-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  background: #ba2d25;
  color: #fff;
  font-size: 18px;
  font-weight: 900;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #d8e7f3;
  border-top-color: #0f64ad;
  border-radius: 50%;
  animation: result-spin 0.75s linear infinite;
}

@keyframes result-spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state__visual {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 14px;
  background: #eef7fd;
  color: #0f64ad;
}

.empty-state__visual svg {
  width: 25px;
  height: 25px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.empty-state .primary-action {
  margin-top: 15px;
}

/*
 * ============================================================
 * SECTIONS
 * ============================================================
 */

.result-section {
  padding: 18px 0;
  border-top: 1px solid #edf1f5;
}

.result-section--first {
  border-top: 0;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 11px;
}

.section-heading h3 {
  margin: 0;
  color: #253248;
  font-size: 15px;
  font-weight: 850;
}

.section-description {
  margin: -3px 0 12px;
  color: #7e8a9a;
  font-size: 12px;
  line-height: 1.45;
}

/*
 * ============================================================
 * COVERAGE
 * ============================================================
 */

.coverage-percent {
  color: #19824a;
  font-size: 16px;
}

.coverage-card {
  padding: 13px;
  border: 1px solid #dce6df;
  border-radius: 11px;
  background: #f8fcf9;
}

.coverage-numbers {
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: #64748b;
  font-size: 12px;
}

.coverage-numbers strong {
  color: #233044;
  font-size: 19px;
}

.coverage-track {
  height: 7px;
  margin: 10px 0 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #e1ebe4;
}

.coverage-track__fill {
  height: 100%;
  border-radius: inherit;
  background: #29945a;
}

.coverage-footer {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #708078;
  font-size: 11px;
}

.coverage-footer strong {
  color: #217645;
}

/*
 * ============================================================
 * TOTAL TERRITORY
 * ============================================================
 */

.territory-total {
  overflow: hidden;
  border: 1px solid #d9e4ed;
  border-radius: 13px;
  background: #fff;
}

.territory-primary {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 15px;
  border-bottom: 1px solid #e8edf3;
  background: #f7fafc;
}

.territory-primary span {
  color: #66758a;
  font-size: 12px;
  font-weight: 700;
}

.territory-primary strong {
  color: #172033;
  font-size: 22px;
  line-height: 1;
}

.territory-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.territory-metric {
  display: flex;
  min-height: 70px;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 11px 12px;
  border-bottom: 1px solid #edf1f5;
}

.territory-metric:nth-child(odd) {
  border-right: 1px solid #edf1f5;
}

.territory-metric span {
  color: #8190a2;
  font-size: 11px;
}

.territory-metric strong {
  color: #28364b;
  font-size: 15px;
}

.territory-metric--important {
  background: #f6faff;
}

.territory-metric--important strong {
  color: #0f64ad;
}

.territory-note {
  margin: 10px 0 0;
  color: #8490a0;
  font-size: 11px;
  line-height: 1.45;
}

/*
 * ============================================================
 * SIMULTANEOUS
 * ============================================================
 */

.simultaneous-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  padding: 14px;
  border: 1px solid #cfe0ee;
  border-radius: 12px;
  background: #f4f9fd;
}

.simultaneous-card__label {
  color: #60758b;
  font-size: 12px;
  font-weight: 700;
}

.simultaneous-card__time {
  color: #0e5e9e;
  font-size: 24px;
  line-height: 1.1;
}

.simultaneous-card small {
  color: #75899d;
  font-size: 11px;
}

.resource-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.resource-card {
  display: flex;
  min-height: 76px;
  flex-direction: column;
  justify-content: center;
  padding: 10px 11px;
  border: 1px solid #e1e7ee;
  border-radius: 10px;
  background: #fbfcfd;
}

.resource-card__label {
  color: #8290a2;
  font-size: 11px;
  font-weight: 750;
}

.resource-card strong {
  margin-top: 2px;
  color: #1f2d42;
  font-size: 23px;
  line-height: 1;
}

.resource-card small {
  margin-top: 4px;
  color: #96a0ae;
  font-size: 10px;
}

.resource-note,
.estimate-note {
  margin: 9px 0 0;
  color: #8792a1;
  font-size: 11px;
  line-height: 1.45;
}

/*
 * ============================================================
 * SUMMARY / ESTIMATES
 * ============================================================
 */

.summary-list,
.estimate-list {
  overflow: hidden;
  border: 1px solid #e2e8ef;
  border-radius: 11px;
}

.summary-row,
.estimate-row {
  display: flex;
  min-height: 47px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 11px;
}

.summary-row + .summary-row,
.estimate-row + .estimate-row {
  border-top: 1px solid #eef2f6;
}

.summary-row span,
.estimate-row span {
  color: #718095;
  font-size: 12px;
}

.summary-row strong,
.estimate-row strong {
  color: #29374b;
  font-size: 12px;
  text-align: right;
}

.good {
  color: #19824a !important;
}

.warning {
  color: #a36d13 !important;
}

.danger {
  color: #b42318 !important;
}

.estimate-badge {
  padding: 4px 7px;
  border-radius: 999px;
  background: #f2f5f8;
  color: #788596;
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
}

.estimate-row > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.estimate-row small {
  color: #9aa4b1;
  font-size: 10px;
}

.estimate-row--total {
  background: #f8fafc;
}

.estimate-row--total span,
.estimate-row--total strong {
  color: #1f2d42;
  font-weight: 850;
}

/*
 * ============================================================
 * ROUTES
 * ============================================================
 */

.route-heading {
  align-items: center;
}

.text-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: #0f64ad;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.route-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.route-card {
  overflow: hidden;
  border: 1px solid #e0e6ed;
  border-radius: 11px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.route-card:hover {
  border-color: #a9c5db;
  box-shadow: 0 5px 14px rgba(15, 23, 42, 0.06);
  transform: translateY(-1px);
}

.route-card.selected {
  border-color: #6ea6d1;
  box-shadow: 0 0 0 2px rgba(15, 100, 173, 0.08);
}

.route-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 12px;
}

.route-card__identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.route-color {
  width: 5px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 999px;
}

.route-card__identity > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.route-card__identity strong {
  color: #233146;
  font-size: 13px;
}

.route-card__identity small {
  color: #8793a2;
  font-size: 10px;
}

.route-workday {
  padding: 4px 6px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
}

.route-workday--normal {
  background: #edf9f1;
  color: #217847;
}

.route-workday--extended {
  background: #fff7e8;
  color: #9b6811;
}

.route-workday--danger {
  background: #fff0ef;
  color: #b42318;
}

.route-card__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid #eef2f6;
  border-bottom: 1px solid #eef2f6;
  background: #fbfcfd;
}

.route-card__metrics > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px;
  border-bottom: 1px solid #eef2f6;
}

.route-card__metrics > div:nth-child(odd) {
  border-right: 1px solid #eef2f6;
}

.route-card__metrics span {
  color: #929dab;
  font-size: 10px;
}

.route-card__metrics strong {
  overflow: hidden;
  color: #344256;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-stops {
  max-height: 210px;
  margin: 0;
  padding: 8px 11px;
  overflow-y: auto;
  list-style: none;
}

.route-stops li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
}

.route-stops li + li {
  border-top: 1px dashed #edf1f5;
}

.stop-number {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: #edf5fb;
  color: #0f64ad;
  font-size: 10px;
  font-weight: 900;
}

.route-stops li > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.route-stops strong {
  overflow: hidden;
  color: #425067;
  font-size: 11px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-stops small {
  color: #9aa4b1;
  font-size: 10px;
}

.route-card__footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid #eef2f6;
  color: #7d8999;
  font-size: 10px;
}

.routes-empty {
  padding: 15px;
  border: 1px dashed #d8e0e8;
  border-radius: 10px;
  color: #8793a2;
  font-size: 11px;
  text-align: center;
}

/*
 * ============================================================
 * OBSERVATIONS
 * ============================================================
 */

.observation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.observation {
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.45;
}

.observation--warning {
  border: 1px solid #f0dfb3;
  background: #fffaf0;
  color: #8a6419;
}

.observation--danger {
  border: 1px solid #f0c5c1;
  background: #fff5f4;
  color: #a92a22;
}

/*
 * ============================================================
 * ACTIONS
 * ============================================================
 */

.result-actions {
  display: flex;
  gap: 7px;
  padding-top: 16px;
  border-top: 1px solid #edf1f5;
}

.primary-action,
.secondary-action {
  min-height: 39px;
  flex: 1;
  padding: 0 12px;
  border-radius: 9px;
  font: inherit;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}

.primary-action {
  border: 1px solid #0f64ad;
  background: #0f64ad;
  color: #fff;
}

.primary-action:hover {
  background: #0b5798;
}

.secondary-action {
  border: 1px solid #dbe3eb;
  background: #fff;
  color: #526174;
}

.secondary-action:hover {
  background: #f7f9fb;
}

@media (max-width: 520px) {
  .territory-metrics,
  .resource-grid,
  .route-card__metrics {
    grid-template-columns: 1fr;
  }

  .territory-metric:nth-child(odd),
  .route-card__metrics > div:nth-child(odd) {
    border-right: 0;
  }
}
</style>