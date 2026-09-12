<template>
  <div
    v-if="open"
    class="modal-backdrop"
    @click.self="emit('close')"
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="route-modal-title"
    >
      <div class="modal-header">
        <div class="header-copy">
          <div class="header-kicker">
            Calculador de rutas
          </div>

          <h3 id="route-modal-title">
            Configurar ruta
          </h3>

          <p class="modal-subtitle">
            Selecciona el ámbito, origen y estrategia
            para el proyecto activo.
          </p>
        </div>

        <button
          type="button"
          class="btn-icon"
          aria-label="Cerrar modal"
          title="Cerrar"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <section class="project-context">
          <div>
            <span class="context-label">
              Proyecto activo
            </span>

            <strong>
              {{
                normalizedProject ||
                'Sin proyecto seleccionado'
              }}
            </strong>
          </div>

          <span
            class="context-status"
            :class="{
              ready: normalizedProject,
            }"
          >
            {{
              normalizedProject
                ? 'Ámbito aplicado'
                : 'Pendiente'
            }}
          </span>
        </section>

        <!-- =================================================
             1. ÁMBITO
        ================================================== -->
        <details
          open
          class="section-card"
        >
          <summary>
            <span>
              1. Ámbito de cálculo
            </span>
          </summary>

          <div class="section-content">
            <div class="radio-card-group">
              <label
                class="radio-card"
                :class="{
                  selected:
                    criteria.scope ===
                    'single',
                }"
              >
                <input
                  v-model="criteria.scope"
                  type="radio"
                  value="single"
                />

                <span class="radio-card-copy">
                  <strong>
                    Una jurisdicción / región
                  </strong>

                  <small>
                    Calcula únicamente las unidades
                    de la región seleccionada.
                  </small>
                </span>
              </label>

              <div
                v-if="
                  criteria.scope ===
                  'single'
                "
                class="field-block nested-block"
              >
                <label class="field-label">
                  Jurisdicción / región sanitaria
                </label>

                <select
                  v-model="criteria.region"
                  class="field-control"
                >
                  <option
                    value=""
                    disabled
                  >
                    Selecciona una región
                  </option>

                  <option
                    v-for="region in regiones"
                    :key="region"
                    :value="region"
                  >
                    {{ region }}
                  </option>
                </select>

                <p
                  v-if="!regiones.length"
                  class="notice notice-warning"
                >
                  No se encontraron regiones para
                  el proyecto seleccionado.
                </p>
              </div>

              <label
                class="radio-card"
                :class="{
                  selected:
                    criteria.scope ===
                    'all',
                }"
              >
                <input
                  v-model="criteria.scope"
                  type="radio"
                  value="all"
                />

                <span class="radio-card-copy">
                  <strong>
                    Todo el proyecto
                  </strong>

                  <small>
                    Calcula las regiones disponibles
                    del proyecto activo.
                  </small>
                </span>
              </label>

              <p
                v-if="
                  criteria.scope ===
                  'all'
                "
                class="hint"
              >
                El cálculo utilizará únicamente las
                regiones correspondientes al proyecto
                seleccionado.
              </p>
            </div>
          </div>
        </details>

        <!-- =================================================
             2. ORIGEN
        ================================================== -->
        <details
          open
          class="section-card"
        >
          <summary>
            <span>
              2. Origen
            </span>
          </summary>

          <div class="section-content">
            <p class="section-description">
              Define desde dónde saldrán las rutas.
              Si el proyecto no tiene CEDIS registrado,
              puedes buscar cualquier lugar o dirección.
            </p>

            <div class="origin-option-grid">
              <label
                class="origin-option"
                :class="{
                  selected:
                    originModeProxy ===
                    'cedis',

                  disabled:
                    !hasProjectCedis,
                }"
              >
                <input
                  v-model="originModeProxy"
                  type="radio"
                  value="cedis"
                  :disabled="
                    !hasProjectCedis
                  "
                />

                <span class="origin-icon">
                  C
                </span>

                <span class="origin-copy">
                  <strong>
                    CEDIS registrado
                  </strong>

                  <small>
                    {{
                      hasProjectCedis
                        ? `${proyectoCedis.length} disponible${proyectoCedis.length === 1 ? '' : 's'}`
                        : 'No configurado'
                    }}
                  </small>
                </span>
              </label>

              <label
                class="origin-option"
                :class="{
                  selected:
                    originModeProxy ===
                    'coords',
                }"
              >
                <input
                  v-model="originModeProxy"
                  type="radio"
                  value="coords"
                />

                <span class="origin-icon">
                  ⌕
                </span>

                <span class="origin-copy">
                  <strong>
                    Buscar otro origen
                  </strong>

                  <small>
                    Lugar, dirección o coordenadas
                  </small>
                </span>
              </label>

              <label
                class="origin-option"
                :class="{
                  selected:
                    originModeProxy ===
                    'pharmacy',
                }"
              >
                <input
                  v-model="originModeProxy"
                  type="radio"
                  value="pharmacy"
                />

                <span class="origin-icon">
                  U
                </span>

                <span class="origin-copy">
                  <strong>
                    Unidad como origen
                  </strong>

                  <small>
                    Usar una unidad del proyecto
                  </small>
                </span>
              </label>
            </div>

            <div
              v-if="
                originModeProxy ===
                'cedis'
              "
              class="origin-panel"
            >
              <template v-if="hasProjectCedis">
                <div class="field-block">
                  <label class="field-label">
                    CEDIS de origen
                  </label>

                  <select
                    v-model.number="
                      selectedCedisIdProxy
                    "
                    class="field-control"
                  >
                    <option
                      v-for="cedis in proyectoCedis"
                      :key="cedis.id"
                      :value="cedis.id"
                    >
                      {{
                        cedis.nombre ||
                        'CEDIS'
                      }}
                      {{
                        cedis.clues
                          ? ` — ${cedis.clues}`
                          : ''
                      }}
                    </option>
                  </select>
                </div>

                <div
                  v-if="selectedCedis"
                  class="selected-origin-card"
                >
                  <div class="selected-origin-icon">
                    C
                  </div>

                  <div class="selected-origin-copy">
                    <strong>
                      {{
                        selectedCedis.nombre ||
                        'CEDIS seleccionado'
                      }}
                    </strong>

                    <span
                      v-if="
                        selectedCedis.clues
                      "
                    >
                      CLUES:
                      {{ selectedCedis.clues }}
                    </span>

                    <span>
                      {{
                        formatCoordinate(
                          selectedCedis.latitud
                        )
                      }},
                      {{
                        formatCoordinate(
                          selectedCedis.longitud
                        )
                      }}
                    </span>

                    <span>
                      Servicio:
                      {{
                        selectedCedis
                          .minutos_servicio_por_unidad ||
                        45
                      }}
                      min
                    </span>
                  </div>
                </div>
              </template>

              <div
                v-else
                class="notice notice-warning"
              >
                <strong>
                  Este proyecto no tiene un CEDIS
                  activo configurado.
                </strong>

                <span>
                  Utiliza “Buscar otro origen”.
                  No necesitas registrar previamente
                  el lugar para calcular la ruta.
                </span>

                <button
                  type="button"
                  class="btn-link-action"
                  @click="
                    originModeProxy =
                      'coords'
                  "
                >
                  Buscar un origen
                </button>
              </div>
            </div>

            <div
              v-if="
                originModeProxy ===
                'coords'
              "
              class="origin-panel"
            >
              <div class="field-block">
                <label class="field-label">
                  Buscar lugar, CEDIS o dirección
                </label>

                <div class="search-row">
                  <input
                    v-model="originSearch"
                    type="text"
                    class="field-control search-input"
                    :placeholder="
                      searchPlaceholder
                    "
                    autocomplete="off"
                    @keydown.enter.prevent="
                      searchOriginPlace
                    "
                  />

                  <button
                    type="button"
                    class="btn-search"
                    :disabled="
                      searchBusy ||
                      !originSearch.trim()
                    "
                    @click="
                      searchOriginPlace
                    "
                  >
                    {{
                      searchBusy
                        ? 'Buscando...'
                        : 'Buscar'
                    }}
                  </button>
                </div>

                <p class="field-help">
                  Ejemplo:
                  “CEDIS Aguascalientes”,
                  “Hospital Hidalgo Aguascalientes”
                  o una dirección completa.
                </p>
              </div>

              <div
                v-if="searchError"
                class="notice notice-error"
              >
                {{ searchError }}
              </div>

              <div
                v-if="
                  searchResults.length
                "
                class="search-results"
              >
                <div class="results-title">
                  Resultados
                </div>

                <button
                  v-for="result in searchResults"
                  :key="result.id"
                  type="button"
                  class="search-result"
                  :class="{
                    selected:
                      selectedSearchResultId ===
                      result.id,
                  }"
                  @click="
                    selectOriginResult(
                      result
                    )
                  "
                >
                  <span class="result-pin">
                    •
                  </span>

                  <span class="result-copy">
                    <strong>
                      {{ result.name }}
                    </strong>

                    <small>
                      {{
                        result.address ||
                        'Sin dirección disponible'
                      }}
                    </small>

                    <small class="result-coordinates">
                      {{
                        result.lat.toFixed(
                          6
                        )
                      }},
                      {{
                        result.lng.toFixed(
                          6
                        )
                      }}
                    </small>
                  </span>

                  <span class="result-action">
                    {{
                      selectedSearchResultId ===
                        result.id
                        ? 'Seleccionado'
                        : 'Usar'
                    }}
                  </span>
                </button>
              </div>

              <div
                v-if="hasValidCustomCoordinates"
                class="selected-origin-card success-card"
              >
                <div class="selected-origin-icon success">
                  ✓
                </div>

                <div class="selected-origin-copy">
                  <strong>
                    {{
                      selectedOriginName ||
                      'Origen personalizado'
                    }}
                  </strong>

                  <span
                    v-if="
                      selectedOriginAddress
                    "
                  >
                    {{ selectedOriginAddress }}
                  </span>

                  <span>
                    {{
                      Number(
                        criteria.originCoords.lat
                      ).toFixed(6)
                    }},
                    {{
                      Number(
                        criteria.originCoords.lng
                      ).toFixed(6)
                    }}
                  </span>
                </div>
              </div>

              <details class="manual-coordinates">
                <summary>
                  Capturar coordenadas manualmente
                </summary>

                <div class="coords-grid">
                  <div class="field-block">
                    <label class="field-label">
                      Latitud
                    </label>

                    <input
                      v-model.number="
                        criteria.originCoords.lat
                      "
                      type="number"
                      step="0.000001"
                      class="field-control"
                      placeholder="21.885300"
                      @input="
                        clearSelectedSearchLabel
                      "
                    />
                  </div>

                  <div class="field-block">
                    <label class="field-label">
                      Longitud
                    </label>

                    <input
                      v-model.number="
                        criteria.originCoords.lng
                      "
                      type="number"
                      step="0.000001"
                      class="field-control"
                      placeholder="-102.291600"
                      @input="
                        clearSelectedSearchLabel
                      "
                    />
                  </div>
                </div>
              </details>
            </div>

            <div
              v-if="
                originModeProxy ===
                'pharmacy'
              "
              class="origin-panel"
            >
              <div
                v-if="
                  criteria.scope ===
                  'single'
                "
                class="field-block"
              >
                <label class="field-label">
                  Unidad de origen
                </label>

                <select
                  v-model.number="
                    originPharmacyIdProxy
                  "
                  class="field-control"
                >
                  <option
                    value=""
                    disabled
                  >
                    Selecciona una unidad
                  </option>

                  <option
                    v-for="farmacia in farmaciasRegion"
                    :key="farmacia.id"
                    :value="farmacia.id"
                  >
                    {{
                      farmacia.clues ||
                      farmacia.unidad
                    }}
                    {{
                      farmacia.unidad &&
                      farmacia.clues
                        ? ` — ${farmacia.unidad}`
                        : ''
                    }}
                  </option>
                </select>

                <p
                  v-if="
                    !farmaciasRegion.length
                  "
                  class="notice notice-warning"
                >
                  No hay unidades disponibles en la
                  región seleccionada.
                </p>
              </div>

              <div
                v-else
                class="notice notice-warning"
              >
                Para calcular todo el proyecto utiliza
                un CEDIS o un origen buscado por
                dirección/coordenadas.
              </div>
            </div>
          </div>
        </details>

        <!-- =================================================
             3. ESTRATEGIA
        ================================================== -->
        <details
          open
          class="section-card"
        >
          <summary>
            <span>
              3. Estrategia y recursos
            </span>
          </summary>

          <div class="section-content">
            <div class="form-grid">
              <div class="field-block">
                <label class="field-label">
                  Motor de rutas
                </label>

                <select
                  v-model="
                    criteria.routeEngine
                  "
                  class="field-control"
                >
                  <option value="GOOGLE_ROUTES_PLUS">
                    Google Routes Plus
                  </option>

                  <option value="OWN_OPERATIVE">
                    Motor propio operativo
                  </option>

                  <option value="GOOGLE_OPTIMIZATION">
                    Google Route Optimization
                  </option>
                </select>
              </div>

              <div class="field-block">
                <label class="field-label">
                  Modo de cálculo
                </label>

                <select
                  v-model="
                    criteria.strategy
                  "
                  class="field-control"
                >
                  <option value="FASTEST">
                    Optimizar tiempo
                  </option>

                  <option value="NEAREST_FIRST">
                    Cercanas primero
                  </option>

                  <option value="FARTHEST_FIRST">
                    Lejanas primero
                  </option>

                  <option
                    value="MANUAL"
                    :disabled="
                      criteria.scope ===
                      'all'
                    "
                  >
                    Manual
                  </option>
                </select>
              </div>

              <div class="field-block">
                <label class="field-label">
                  Tipo de ruta
                </label>

                <select
                  v-model="
                    criteria.routeMode
                  "
                  class="field-control"
                >
                  <option value="ROUND_TRIP">
                    Ida y vuelta al origen
                  </option>

                  <option value="FOREIGN_ROUTE">
                    Ruta foránea
                  </option>
                </select>
              </div>

              <div
                v-if="
                  criteria.routeMode ===
                  'ROUND_TRIP'
                "
                class="field-block"
              >
                <label class="field-label">
                  Planificación de rutas
                </label>

                <select
                  v-model="
                    roundTripPlanningModeProxy
                  "
                  class="field-control"
                >
                  <option value="AUTO">
                    Calcular automáticamente
                  </option>

                  <option value="MANUAL">
                    Definir número de rutas
                  </option>
                </select>
              </div>

              <div
                v-else
                class="field-block"
              >
                <label class="field-label">
                  Operadores disponibles
                </label>

                <input
                  v-model.number="
                    availableOperatorsProxy
                  "
                  type="number"
                  min="1"
                  max="50"
                  class="field-control"
                />

                <p class="field-help">
                  Indica la capacidad disponible para
                  la operación foránea. El motor
                  determinará cuántos necesita usar.
                </p>
              </div>
            </div>

            <div
              v-if="
                criteria.routeMode ===
                  'ROUND_TRIP' &&
                roundTripPlanningModeProxy ===
                  'AUTO'
              "
              class="planning-card planning-card-auto"
            >
              <div class="planning-icon">
                A
              </div>

              <div class="planning-copy">
                <strong>
                  Rutas calculadas automáticamente
                </strong>

                <span>
                  El motor determinará el mínimo de
                  rutas ida y vuelta necesarias para
                  cubrir la selección dentro de la
                  jornada operativa configurada.
                </span>

                <small>
                  Cada ruta saldrá del origen y
                  regresará al origen.
                </small>
              </div>
            </div>

            <div
              v-if="
                criteria.routeMode ===
                  'ROUND_TRIP' &&
                roundTripPlanningModeProxy ===
                  'MANUAL'
              "
              class="planning-card"
            >
              <div class="planning-manual-grid">
                <div class="field-block">
                  <label class="field-label">
                    Número de rutas
                  </label>

                  <input
                    v-model.number="
                      requestedRouteCountProxy
                    "
                    type="number"
                    min="1"
                    max="50"
                    class="field-control"
                  />

                  <p class="field-help">
                    Fuerza una simulación con esta
                    cantidad de rutas. El resultado
                    podrá indicar si son insuficientes
                    para cumplir la jornada.
                  </p>
                </div>
              </div>
            </div>

            <div
              v-if="
                criteria.routeMode ===
                'FOREIGN_ROUTE'
              "
              class="planning-card planning-card-foreign"
            >
              <div class="planning-manual-grid">
                <div class="field-block">
                  <label class="field-label">
                    Máximo de días por operador
                  </label>

                  <input
                    v-model.number="
                      maxForeignDaysProxy
                    "
                    type="number"
                    min="1"
                    max="30"
                    class="field-control"
                  />

                  <p class="field-help">
                    El motor calculará la operación
                    completa y comparará los operadores
                    disponibles contra los requeridos
                    para cumplir este límite.
                  </p>
                </div>
              </div>
            </div>

            <div class="metrics-grid">
              <div class="field-block">
                <label class="field-label">
                  Rendimiento km/L
                </label>

                <input
                  v-model.number="
                    criteria.kmPerLiter
                  "
                  type="number"
                  min="1"
                  step="0.1"
                  class="field-control"
                />
              </div>

              <div class="field-block">
                <label class="field-label">
                  Combustible $/L
                </label>

                <input
                  v-model.number="
                    criteria.fuelPricePerLiter
                  "
                  type="number"
                  min="0"
                  step="0.01"
                  class="field-control"
                />
              </div>

              <div class="field-block">
                <label class="field-label">
                  Viático diario
                </label>

                <input
                  v-model.number="
                    criteria.dailyAllowance
                  "
                  type="number"
                  min="0"
                  step="0.01"
                  class="field-control"
                />
              </div>
            </div>
          </div>
        </details>

        <!-- =================================================
             4. MANUAL
        ================================================== -->
        <details
          v-if="
            criteria.strategy ===
              'MANUAL' &&
            criteria.scope ===
              'single'
          "
          open
          class="section-card"
        >
          <summary>
            <span>
              4. Orden manual
            </span>
          </summary>

          <div class="section-content">
            <p class="hint">
              Arrastra para reordenar. Desmarca una
              unidad para excluirla del cálculo.
            </p>

            <div
              class="manual-list"
              @dragover.prevent
              @drop="
                emit(
                  'drop'
                )
              "
            >
              <div
                v-for="(
                  point,
                  index
                ) in manualPoints"
                :key="point.id"
                class="manual-item"
                draggable="true"
                @dragstart="
                  emit(
                    'drag-start',
                    index
                  )
                "
                @dragenter.prevent="
                  emit(
                    'drag-enter',
                    index
                  )
                "
              >
                <div class="manual-left">
                  <input
                    v-model="
                      point.enabled
                    "
                    type="checkbox"
                  />

                  <span class="drag-handle">
                    ⣿
                  </span>

                  <span class="manual-name">
                    {{ point.name }}
                  </span>

                  <span
                    v-if="point.hard"
                    class="badge-hard"
                  >
                    Difícil acceso
                  </span>
                </div>
              </div>

              <div
                v-if="
                  !manualPoints.length
                "
                class="empty-state"
              >
                No hay unidades disponibles.
              </div>
            </div>
          </div>
        </details>

        <!-- =================================================
             OPCIONES
        ================================================== -->
        <details class="section-card">
          <summary>
            <span>
              Opciones adicionales
            </span>
          </summary>

          <div class="section-content">
            <div class="options-grid">
              <label
                class="check-card"
                :class="{
                  checked:
                    criteria.options
                      .avoidTolls,
                }"
              >
                <input
                  v-model="
                    criteria.options
                      .avoidTolls
                  "
                  type="checkbox"
                />

                <span>
                  Evitar cuota
                </span>
              </label>

              <label
                class="check-card"
                :class="{
                  checked:
                    criteria.options
                      .showAlternatives,
                }"
              >
                <input
                  v-model="
                    criteria.options
                      .showAlternatives
                  "
                  type="checkbox"
                />

                <span>
                  Mostrar alternativas
                </span>
              </label>

              <label
                v-if="
                  criteria.routeMode ===
                  'ROUND_TRIP'
                "
                class="check-card checked fixed-option"
              >
                <input
                  type="checkbox"
                  checked
                  disabled
                />

                <span class="check-copy">
                  <strong>
                    Regresar al origen
                  </strong>

                  <small>
                    Obligatorio en ida y vuelta
                  </small>
                </span>
              </label>

              <label
                class="check-card"
                :class="{
                  checked:
                    criteria.options
                      .avoidDificilAcceso,
                }"
              >
                <input
                  v-model="
                    criteria.options
                      .avoidDificilAcceso
                  "
                  type="checkbox"
                />

                <span>
                  Evitar difícil acceso
                </span>
              </label>
            </div>
          </div>
        </details>
      </div>

      <div class="modal-footer">
        <div class="footer-status">
          <span
            class="status-dot"
            :class="{
              ready:
                canCalculate,
            }"
          ></span>

          <span>
            {{
              calculationStatusText
            }}
          </span>
        </div>

        <div class="footer-actions">
          <button
            type="button"
            class="btn-secondary"
            @click="
              emit(
                'close'
              )
            "
          >
            Cerrar
          </button>

          <button
            type="button"
            class="btn-primary"
            :disabled="
              !canCalculate
            "
            @click="
              handleCalculate
            "
          >
            Calcular ruta
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  computed,
  ref,
  watch,
} from 'vue'

const props =
  defineProps({
    open: {
      type:
        Boolean,

      required:
        true,
    },

    regiones: {
      type:
        Array,

      default:
        () => [],
    },

    criteria: {
      type:
        Object,

      required:
        true,
    },

    originMode: {
      type:
        String,

      required:
        true,
    },

    originPharmacyId: {
      type: [
        Number,
        String,
      ],

      default:
        null,
    },

    proyectoCedis: {
      type:
        Array,

      default:
        () => [],
    },

    selectedCedisId: {
      type: [
        Number,
        String,
      ],

      default:
        null,
    },

    selectedCedis: {
      type:
        Object,

      default:
        null,
    },

    farmaciasRegion: {
      type:
        Array,

      default:
        () => [],
    },

    manualPoints: {
      type:
        Array,

      default:
        () => [],
    },
  })

const emit =
  defineEmits([
    'close',
    'calculate',

    'drag-start',
    'drag-enter',
    'drop',

    'update:originMode',
    'update:originPharmacyId',
    'update:selectedCedisId',
  ])

/*
 * ============================================================
 * PROXIES
 * ============================================================
 */

const originModeProxy =
  computed({
    get:
      () =>
        props.originMode,

    set:
      value =>
        emit(
          'update:originMode',
          value
        ),
  })

const originPharmacyIdProxy =
  computed({
    get:
      () =>
        props.originPharmacyId,

    set:
      value =>
        emit(
          'update:originPharmacyId',
          value
        ),
  })

const selectedCedisIdProxy =
  computed({
    get:
      () =>
        props.selectedCedisId,

    set:
      value =>
        emit(
          'update:selectedCedisId',
          value
        ),
  })

/*
 * ============================================================
 * PLANIFICACIÓN DE RUTAS
 * ============================================================
 */

function normalizePositiveInteger(
  value,
  fallback = 1
) {
  const number =
    Math.floor(
      Number(
        value
      )
    )

  if (
    !Number.isFinite(
      number
    ) ||
    number < 1
  ) {
    return fallback
  }

  return number
}

const roundTripPlanningModeProxy =
  computed({
    get:
      () => {
        const value =
          String(
            props.criteria
              ?.routePlanningMode ||
            'AUTO'
          )
            .trim()
            .toUpperCase()

        return value ===
          'MANUAL'
          ? 'MANUAL'
          : 'AUTO'
      },

    set:
      value => {
        const normalized =
          String(
            value ||
            'AUTO'
          )
            .trim()
            .toUpperCase() ===
          'MANUAL'
            ? 'MANUAL'
            : 'AUTO'

        props.criteria
          .routePlanningMode =
          normalized

        if (
          normalized ===
          'AUTO'
        ) {
          /*
           * Compatibilidad temporal.
           *
           * F8A.5.3B hará que el backend
           * calcule automáticamente el número
           * real de rutas.
           */
          props.criteria
            .operatorCount =
            1

          return
        }

        const routeCount =
          normalizePositiveInteger(
            props.criteria
              ?.requestedRouteCount ??
            props.criteria
              ?.operatorCount,
            1
          )

        props.criteria
          .requestedRouteCount =
          routeCount

        props.criteria
          .operatorCount =
          routeCount
      },
  })

const requestedRouteCountProxy =
  computed({
    get:
      () =>
        normalizePositiveInteger(
          props.criteria
            ?.requestedRouteCount ??
          props.criteria
            ?.operatorCount,
          1
        ),

    set:
      value => {
        const normalized =
          normalizePositiveInteger(
            value,
            1
          )

        props.criteria
          .requestedRouteCount =
          normalized

        /*
         * Compatibilidad con backend actual.
         */
        props.criteria
          .operatorCount =
          normalized
      },
  })

const availableOperatorsProxy =
  computed({
    get:
      () =>
        normalizePositiveInteger(
          props.criteria
            ?.availableOperators ??
          props.criteria
            ?.operatorCount,
          1
        ),

    set:
      value => {
        const normalized =
          normalizePositiveInteger(
            value,
            1
          )

        props.criteria
          .availableOperators =
          normalized

        /*
         * Para FOREIGN_ROUTE operatorCount
         * sigue siendo temporalmente el campo
         * enviado al núcleo actual.
         */
        props.criteria
          .operatorCount =
          normalized
      },
  })

const maxForeignDaysProxy =
  computed({
    get:
      () =>
        normalizePositiveInteger(
          props.criteria
            ?.maxForeignDays,
          3
        ),

    set:
      value => {
        props.criteria
          .maxForeignDays =
          normalizePositiveInteger(
            value,
            3
          )
      },
  })

/*
 * ============================================================
 * PROYECTO
 * ============================================================
 */

const normalizedProject =
  computed(
    () =>
      String(
        props.criteria
          ?.proyecto ||
        ''
      )
        .trim()
        .toUpperCase()
  )

const hasProjectCedis =
  computed(
    () =>
      Array.isArray(
        props.proyectoCedis
      ) &&
      props.proyectoCedis.length >
        0
  )

/*
 * ============================================================
 * BUSCADOR DE ORIGEN
 * ============================================================
 */

const originSearch =
  ref('')

const searchBusy =
  ref(false)

const searchError =
  ref('')

const searchResults =
  ref([])

const selectedSearchResultId =
  ref(null)

const selectedOriginName =
  ref('')

const selectedOriginAddress =
  ref('')

const searchPlaceholder =
  computed(
    () =>
      normalizedProject.value
        ? `Buscar en ${normalizedProject.value}...`
        : 'Buscar lugar, dirección o CEDIS...'
  )

const hasValidCustomCoordinates =
  computed(
    () => {
      const lat =
        Number(
          props.criteria
            ?.originCoords
            ?.lat
        )

      const lng =
        Number(
          props.criteria
            ?.originCoords
            ?.lng
        )

      return (
        Number.isFinite(
          lat
        ) &&
        Number.isFinite(
          lng
        ) &&
        lat >=
          -90 &&
        lat <=
          90 &&
        lng >=
          -180 &&
        lng <=
          180
      )
    }
  )

/*
 * ============================================================
 * VALIDACIÓN GENERAL
 * ============================================================
 */

const hasValidScope =
  computed(
    () => {
      if (
        props.criteria
          ?.scope ===
        'all'
      ) {
        return (
          props.regiones.length >
          0
        )
      }

      return Boolean(
        props.criteria
          ?.region
      )
    }
  )

const hasValidOrigin =
  computed(
    () => {
      if (
        originModeProxy.value ===
        'cedis'
      ) {
        return Boolean(
          hasProjectCedis.value &&
          selectedCedisIdProxy.value
        )
      }

      if (
        originModeProxy.value ===
        'coords'
      ) {
        return (
          hasValidCustomCoordinates.value
        )
      }

      if (
        originModeProxy.value ===
        'pharmacy'
      ) {
        return Boolean(
          props.criteria
            ?.scope ===
            'single' &&
          originPharmacyIdProxy.value
        )
      }

      return false
    }
  )

const hasValidPlanning =
  computed(
    () => {
      if (
        props.criteria
          ?.routeMode ===
        'FOREIGN_ROUTE'
      ) {
        return (
          availableOperatorsProxy.value >=
            1 &&
          maxForeignDaysProxy.value >=
            1
        )
      }

      if (
        roundTripPlanningModeProxy.value ===
        'MANUAL'
      ) {
        return (
          requestedRouteCountProxy.value >=
          1
        )
      }

      return true
    }
  )

const canCalculate =
  computed(
    () =>
      Boolean(
        normalizedProject.value &&
        hasValidScope.value &&
        hasValidOrigin.value &&
        hasValidPlanning.value
      )
  )

const calculationStatusText =
  computed(
    () => {
      if (
        !normalizedProject.value
      ) {
        return 'Selecciona un proyecto.'
      }

      if (
        !hasValidScope.value
      ) {
        return 'Selecciona una jurisdicción o región.'
      }

      if (
        !hasValidOrigin.value
      ) {
        if (
          originModeProxy.value ===
          'cedis' &&
          !hasProjectCedis.value
        ) {
          return 'Este proyecto no tiene CEDIS. Busca otro origen.'
        }

        if (
          originModeProxy.value ===
          'coords'
        ) {
          return 'Busca y selecciona un origen.'
        }

        return 'Selecciona un origen válido.'
      }

      if (
        !hasValidPlanning.value
      ) {
        return 'Revisa la configuración de planeación.'
      }

      if (
        props.criteria
          ?.routeMode ===
        'FOREIGN_ROUTE'
      ) {
        return 'Configuración lista. El motor evaluará los operadores disponibles.'
      }

      if (
        roundTripPlanningModeProxy.value ===
        'AUTO'
      ) {
        return 'Configuración lista. El motor determinará las rutas necesarias.'
      }

      return 'Configuración lista para simular el número de rutas definido.'
    }
  )

/*
 * ============================================================
 * SEMÁNTICA DE PLANEACIÓN
 * ============================================================
 */

watch(
  [
    () =>
      props.open,

    () =>
      props.criteria
        ?.routeMode,
  ],

  ([
    isOpen,
    routeMode,
  ]) => {
    if (
      !isOpen
    ) {
      return
    }

    if (
      !props.criteria
        .options
    ) {
      props.criteria
        .options = {}
    }

    if (
      routeMode ===
      'FOREIGN_ROUTE'
    ) {
      const operators =
        normalizePositiveInteger(
          props.criteria
            ?.availableOperators ??
          props.criteria
            ?.operatorCount,
          1
        )

      props.criteria
        .availableOperators =
        operators

      props.criteria
        .operatorCount =
        operators

      props.criteria
        .maxForeignDays =
        normalizePositiveInteger(
          props.criteria
            ?.maxForeignDays,
          3
        )

      /*
       * La ruta foránea no regresa al
       * CEDIS entre jornadas.
       *
       * El núcleo gestiona el retorno
       * final de la operación.
       */
      props.criteria
        .options
        .returnToOrigin =
        false

      return
    }

    if (
      !props.criteria
        .routePlanningMode
    ) {
      props.criteria
        .routePlanningMode =
        'AUTO'
    }

    if (
      roundTripPlanningModeProxy.value ===
      'AUTO'
    ) {
      props.criteria
        .operatorCount =
        1
    } else {
      const routeCount =
        normalizePositiveInteger(
          props.criteria
            ?.requestedRouteCount ??
          props.criteria
            ?.operatorCount,
          1
        )

      props.criteria
        .requestedRouteCount =
        routeCount

      props.criteria
        .operatorCount =
        routeCount
    }

    /*
     * ROUND_TRIP significa siempre:
     *
     * ORIGEN → ENTREGAS → ORIGEN
     */
    props.criteria
      .options
      .returnToOrigin =
      true
  },

  {
    immediate:
      true,
  }
)

/*
 * ============================================================
 * CAMBIO AUTOMÁTICO CUANDO NO HAY CEDIS
 * ============================================================
 */

watch(
  [
    () =>
      props.open,

    () =>
      props.proyectoCedis
        ?.length,
  ],

  (
    [
      isOpen,
      cedisCount,
    ]
  ) => {
    if (
      !isOpen
    ) {
      return
    }

    if (
      Number(
        cedisCount ||
        0
      ) ===
        0 &&
      originModeProxy.value ===
        'cedis'
    ) {
      originModeProxy.value =
        'coords'
    }
  },

  {
    immediate:
      true,
  }
)

/*
 * ============================================================
 * BÚSQUEDA GOOGLE
 * ============================================================
 */

async function searchOriginPlace() {
  const rawQuery =
    String(
      originSearch.value ||
      ''
    ).trim()

  if (
    !rawQuery ||
    searchBusy.value
  ) {
    return
  }

  searchBusy.value =
    true

  searchError.value =
    ''

  searchResults.value =
    []

  selectedSearchResultId.value =
    null

  try {
    if (
      !window.google
        ?.maps
    ) {
      throw new Error(
        'Google Maps todavía no está disponible.'
      )
    }

    const query =
      buildSearchQuery(
        rawQuery
      )

    let results =
      []

    try {
      results =
        await searchWithPlaces(
          query
        )
    } catch (
      placesError
    ) {
      console.warn(
        '[CriteriaModal] Places Search no disponible, usando Geocoder:',
        placesError
      )
    }

    if (
      !results.length
    ) {
      results =
        await searchWithGeocoder(
          query
        )
    }

    searchResults.value =
      results

    if (
      !results.length
    ) {
      searchError.value =
        'No se encontraron lugares. Prueba con otro nombre o una dirección más completa.'
    }
  } catch (
    error
  ) {
    console.error(
      '[CriteriaModal][searchOriginPlace]',
      error
    )

    searchError.value =
      error?.message ||
      'No fue posible buscar el lugar.'
  } finally {
    searchBusy.value =
      false
  }
}

function buildSearchQuery(
  value
) {
  const project =
    normalizedProject.value

  const normalizedValue =
    value.toUpperCase()

  if (
    project &&
    !normalizedValue.includes(
      project
    )
  ) {
    return `${value}, ${project}, México`
  }

  return `${value}, México`
}

async function searchWithPlaces(
  query
) {
  if (
    typeof window.google
      ?.maps
      ?.importLibrary !==
    'function'
  ) {
    return []
  }

  const placesLibrary =
    await window.google.maps
      .importLibrary(
        'places'
      )

  const Place =
    placesLibrary?.Place

  if (
    !Place ||
    typeof Place.searchByText !==
      'function'
  ) {
    return []
  }

  const response =
    await Place.searchByText({
      textQuery:
        query,

      fields: [
        'displayName',
        'formattedAddress',
        'location',
      ],

      language:
        'es',

      region:
        'MX',

      maxResultCount:
        6,
    })

  const places =
    Array.isArray(
      response?.places
    )
      ? response.places
      : []

  return places
    .map(
      (
        place,
        index
      ) => {
        const location =
          place?.location

        const lat =
          typeof location?.lat ===
            'function'
            ? location.lat()
            : Number(
                location?.lat
              )

        const lng =
          typeof location?.lng ===
            'function'
            ? location.lng()
            : Number(
                location?.lng
              )

        if (
          !Number.isFinite(
            lat
          ) ||
          !Number.isFinite(
            lng
          )
        ) {
          return null
        }

        const displayName =
          typeof place
            ?.displayName ===
            'string'
            ? place.displayName
            : place
                ?.displayName
                ?.text ||
              place
                ?.formattedAddress ||
              `Resultado ${index + 1}`

        return {
          id:
            `place-${index}-${lat}-${lng}`,

          name:
            displayName,

          address:
            place
              ?.formattedAddress ||
            '',

          lat,

          lng,
        }
      }
    )
    .filter(
      Boolean
    )
}

async function searchWithGeocoder(
  query
) {
  const Geocoder =
    window.google
      ?.maps
      ?.Geocoder

  if (
    !Geocoder
  ) {
    return []
  }

  const geocoder =
    new Geocoder()

  const results =
    await new Promise(
      (
        resolve,
        reject
      ) => {
        geocoder.geocode(
          {
            address:
              query,

            region:
              'MX',
          },

          (
            geocoderResults,
            status
          ) => {
            if (
              status ===
                'OK' ||
              status ===
                window.google
                  ?.maps
                  ?.GeocoderStatus
                  ?.OK
            ) {
              resolve(
                geocoderResults ||
                []
              )

              return
            }

            if (
              status ===
              'ZERO_RESULTS'
            ) {
              resolve(
                []
              )

              return
            }

            reject(
              new Error(
                `Google no pudo completar la búsqueda (${status}).`
              )
            )
          }
        )
      }
    )

  return results
    .slice(
      0,
      6
    )
    .map(
      (
        result,
        index
      ) => {
        const location =
          result
            ?.geometry
            ?.location

        if (
          !location
        ) {
          return null
        }

        const lat =
          Number(
            location.lat()
          )

        const lng =
          Number(
            location.lng()
          )

        if (
          !Number.isFinite(
            lat
          ) ||
          !Number.isFinite(
            lng
          )
        ) {
          return null
        }

        const firstComponent =
          result
            ?.address_components
            ?.[0]
            ?.long_name

        return {
          id:
            `geocode-${index}-${lat}-${lng}`,

          name:
            firstComponent ||
            result
              ?.formatted_address ||
            `Resultado ${index + 1}`,

          address:
            result
              ?.formatted_address ||
            '',

          lat,

          lng,
        }
      }
    )
    .filter(
      Boolean
    )
}

function selectOriginResult(
  result
) {
  if (
    !result
  ) {
    return
  }

  if (
    !props.criteria
      .originCoords
  ) {
    props.criteria
      .originCoords = {
        lat:
          '',
        lng:
          '',
      }
  }

  props.criteria
    .originCoords
    .lat =
      Number(
        result.lat
      )

  props.criteria
    .originCoords
    .lng =
      Number(
        result.lng
      )

  selectedSearchResultId.value =
    result.id

  selectedOriginName.value =
    result.name ||
    'Origen seleccionado'

  selectedOriginAddress.value =
    result.address ||
    ''

  originModeProxy.value =
    'coords'
}

function clearSelectedSearchLabel() {
  selectedSearchResultId.value =
    null

  selectedOriginName.value =
    ''

  selectedOriginAddress.value =
    ''
}

/*
 * ============================================================
 * CALCULAR
 * ============================================================
 */

function handleCalculate() {
  if (
    !canCalculate.value
  ) {
    return
  }

  emit(
    'calculate'
  )
}

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function formatCoordinate(
  value
) {
  const number =
    Number(
      value
    )

  return Number.isFinite(
    number
  )
    ? number.toFixed(
        6
      )
    : '—'
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 20px;

  background:
    rgba(
      15,
      23,
      42,
      .46
    );

  backdrop-filter:
    blur(3px);
}

.modal {
  display: flex;

  width:
    min(
      780px,
      96vw
    );

  max-height:
    90vh;

  overflow: hidden;

  flex-direction: column;

  border:
    1px solid #dbe4ee;

  border-radius: 20px;

  background: #ffffff;

  color: #0f172a;

  box-shadow:
    0 24px 70px
      rgba(
        15,
        23,
        42,
        .22
      );
}

.modal-header {
  display: flex;

  flex:
    0
    0
    auto;

  align-items: flex-start;
  justify-content: space-between;

  gap: 18px;

  padding:
    18px
    20px
    16px;

  border-bottom:
    1px solid #e5edf5;

  background:
    linear-gradient(
      180deg,
      #ffffff,
      #f8fbfe
    );
}

.header-copy {
  min-width: 0;
}

.header-kicker {
  margin-bottom: 4px;

  color: #0f64ad;

  font-size: 11px;
  font-weight: 850;

  letter-spacing: .08em;

  text-transform: uppercase;
}

.modal-header h3 {
  margin: 0;

  color: #0f172a;

  font-size: 24px;
  font-weight: 850;

  line-height: 1.15;
}

.modal-subtitle {
  margin:
    6px
    0
    0;

  color: #64748b;

  font-size: 13px;

  line-height: 1.4;
}

.btn-icon {
  display: grid;

  width: 38px;
  height: 38px;

  flex:
    0
    0
    38px;

  place-items: center;

  border:
    1px solid #d8e1ea;

  border-radius: 10px;

  background: #ffffff;

  color: #475569;

  cursor: pointer;

  font-size: 14px;

  transition:
    background .15s ease,
    border-color .15s ease,
    color .15s ease;
}

.btn-icon:hover {
  border-color:
    #bfdbfe;

  background:
    #eff8ff;

  color:
    #0f64ad;
}

.modal-body {
  overflow:
    auto;

  flex: 1;

  padding:
    16px
    20px
    8px;

  background:
    #f8fafc;
}

.project-context {
  display: flex;

  align-items: center;
  justify-content: space-between;

  gap: 14px;

  margin-bottom:
    14px;

  padding:
    12px
    14px;

  border:
    1px solid #bfdbfe;

  border-radius:
    13px;

  background:
    #eff8ff;
}

.project-context > div {
  display: flex;

  min-width: 0;

  flex-direction: column;

  gap: 2px;
}

.context-label {
  color:
    #64748b;

  font-size: 10px;
  font-weight: 750;

  text-transform:
    uppercase;

  letter-spacing:
    .06em;
}

.project-context strong {
  overflow: hidden;

  color:
    #0f4f87;

  font-size: 14px;
  font-weight: 850;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.context-status {
  padding:
    5px
    9px;

  border:
    1px solid #d1d5db;

  border-radius:
    999px;

  background:
    #ffffff;

  color:
    #64748b;

  font-size:
    10px;

  font-weight:
    750;

  white-space:
    nowrap;
}

.context-status.ready {
  border-color:
    #bbf7d0;

  background:
    #f0fdf4;

  color:
    #166534;
}

.section-card {
  margin:
    0
    0
    12px;

  overflow:
    hidden;

  border:
    1px solid #dfe7ef;

  border-radius:
    14px;

  background:
    #ffffff;
}

.section-card summary {
  padding:
    13px
    15px;

  border-bottom:
    1px solid transparent;

  color:
    #0f172a;

  cursor: pointer;

  font-size:
    14px;

  font-weight:
    850;

  list-style:
    none;

  user-select:
    none;
}

.section-card summary::-webkit-details-marker {
  display: none;
}

.section-card[open]
summary {
  border-bottom-color:
    #edf2f7;

  background:
    #fbfdff;
}

.section-content {
  padding:
    14px
    15px
    16px;
}

.section-description {
  margin:
    0
    0
    13px;

  color:
    #64748b;

  font-size:
    12px;

  line-height:
    1.5;
}

.radio-card-group {
  display: grid;

  gap: 9px;
}

.radio-card {
  display: flex;

  align-items:
    center;

  gap: 10px;

  padding:
    11px
    12px;

  border:
    1px solid #dfe7ef;

  border-radius:
    11px;

  background:
    #ffffff;

  color:
    #334155;

  cursor:
    pointer;
}

.radio-card.selected {
  border-color:
    #93c5fd;

  background:
    #eff8ff;
}

.radio-card-copy {
  display: flex;

  min-width: 0;

  flex-direction:
    column;

  gap: 2px;
}

.radio-card-copy strong {
  color:
    #1e293b;

  font-size:
    13px;
}

.radio-card-copy small {
  color:
    #64748b;

  font-size:
    11px;

  line-height:
    1.35;
}

.origin-option-grid {
  display: grid;

  grid-template-columns:
    repeat(
      3,
      minmax(
        0,
        1fr
      )
    );

  gap: 8px;
}

.origin-option {
  display: flex;

  min-height: 72px;

  align-items:
    center;

  gap: 9px;

  padding:
    10px;

  border:
    1px solid #dfe7ef;

  border-radius:
    12px;

  background:
    #ffffff;

  color:
    #334155;

  cursor:
    pointer;

  transition:
    border-color .15s ease,
    background .15s ease,
    box-shadow .15s ease;
}

.origin-option:hover:not(.disabled) {
  border-color:
    #bfdbfe;

  background:
    #f8fbfe;
}

.origin-option.selected {
  border-color:
    #60a5fa;

  background:
    #eff8ff;

  box-shadow:
    0 0 0 2px
      rgba(
        96,
        165,
        250,
        .10
      );
}

.origin-option.disabled {
  cursor:
    not-allowed;

  background:
    #f8fafc;

  opacity:
    .58;
}

.origin-option input {
  position:
    absolute;

  width: 1px;
  height: 1px;

  opacity: 0;

  pointer-events:
    none;
}

.origin-icon {
  display: grid;

  width: 32px;
  height: 32px;

  flex:
    0
    0
    32px;

  place-items:
    center;

  border-radius:
    9px;

  background:
    #eaf4fc;

  color:
    #0f64ad;

  font-size:
    13px;

  font-weight:
    900;
}

.origin-copy {
  display: flex;

  min-width: 0;

  flex-direction:
    column;

  gap: 2px;
}

.origin-copy strong {
  color:
    #1e293b;

  font-size:
    11px;

  line-height:
    1.25;
}

.origin-copy small {
  color:
    #64748b;

  font-size:
    9px;

  line-height:
    1.25;
}

.origin-panel {
  margin-top:
    12px;

  padding:
    13px;

  border:
    1px solid #e2e8f0;

  border-radius:
    12px;

  background:
    #fbfdff;
}

.field-block {
  margin-top:
    0;
}

.field-block +
.field-block {
  margin-top:
    12px;
}

.nested-block {
  margin:
    0
    0
    2px
    22px;

  padding:
    12px;

  border-left:
    2px solid #dbeafe;

  background:
    #f8fbff;
}

.field-label {
  display: block;

  margin-bottom:
    6px;

  color:
    #334155;

  font-size:
    11px;

  font-weight:
    800;
}

.field-control {
  width: 100%;

  min-height:
    42px;

  padding:
    9px
    11px;

  box-sizing:
    border-box;

  border:
    1px solid #cbd5e1;

  border-radius:
    9px;

  outline:
    none;

  background:
    #ffffff !important;

  color:
    #0f172a !important;

  font-size:
    13px;

  line-height:
    1.3;

  transition:
    border-color .15s ease,
    box-shadow .15s ease;
}

.field-control:hover {
  border-color:
    #94a3b8;
}

.field-control:focus {
  border-color:
    #3b82f6;

  box-shadow:
    0 0 0 3px
      rgba(
        59,
        130,
        246,
        .12
      );
}

select.field-control {
  color-scheme:
    light;
}

select.field-control option {
  background:
    #ffffff !important;

  color:
    #0f172a !important;
}

.field-help {
  display: block;

  margin:
    5px
    0
    0;

  color:
    #64748b;

  font-size:
    10px;

  line-height:
    1.4;
}

.hint {
  margin:
    8px
    0
    0;

  color:
    #64748b;

  font-size:
    11px;

  line-height:
    1.45;
}

.search-row {
  display: grid;

  grid-template-columns:
    minmax(
      0,
      1fr
    )
    auto;

  gap: 8px;
}

.search-input {
  min-width: 0;
}

.btn-search {
  min-width:
    92px;

  min-height:
    42px;

  padding:
    0
    14px;

  border:
    1px solid #0f64ad;

  border-radius:
    9px;

  background:
    #0f64ad;

  color:
    #ffffff;

  cursor:
    pointer;

  font-size:
    12px;

  font-weight:
    800;

  transition:
    background .15s ease,
    border-color .15s ease,
    transform .15s ease;
}

.btn-search:hover:not(:disabled) {
  border-color:
    #0b568f;

  background:
    #0b568f;
}

.btn-search:active:not(:disabled) {
  transform:
    translateY(1px);
}

.btn-search:disabled {
  border-color:
    #cbd5e1;

  background:
    #e2e8f0;

  color:
    #94a3b8;

  cursor:
    not-allowed;
}

.search-results {
  display: grid;

  gap: 6px;

  margin-top:
    12px;
}

.results-title {
  margin-bottom:
    1px;

  color:
    #64748b;

  font-size:
    10px;

  font-weight:
    800;

  letter-spacing:
    .05em;

  text-transform:
    uppercase;
}

.search-result {
  display: flex;

  width: 100%;

  align-items:
    center;

  gap: 9px;

  padding:
    9px
    10px;

  border:
    1px solid #dfe7ef;

  border-radius:
    10px;

  background:
    #ffffff;

  color:
    #1e293b;

  cursor:
    pointer;

  text-align:
    left;

  transition:
    border-color .15s ease,
    background .15s ease;
}

.search-result:hover {
  border-color:
    #93c5fd;

  background:
    #f8fbff;
}

.search-result.selected {
  border-color:
    #60a5fa;

  background:
    #eff8ff;
}

.result-pin {
  display: grid;

  width: 26px;
  height: 26px;

  flex:
    0
    0
    26px;

  place-items:
    center;

  border-radius:
    8px;

  background:
    #eaf4fc;

  color:
    #0f64ad;

  font-size:
    18px;
}

.result-copy {
  display: flex;

  min-width: 0;

  flex: 1;

  flex-direction:
    column;

  gap: 2px;
}

.result-copy strong {
  overflow:
    hidden;

  color:
    #1e293b;

  font-size:
    11px;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.result-copy small {
  overflow:
    hidden;

  color:
    #64748b;

  font-size:
    9px;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.result-coordinates {
  color:
    #94a3b8 !important;
}

.result-action {
  flex:
    0
    0
    auto;

  color:
    #0f64ad;

  font-size:
    9px;

  font-weight:
    850;
}

.selected-origin-card {
  display: flex;

  align-items:
    flex-start;

  gap: 10px;

  margin-top:
    11px;

  padding:
    11px
    12px;

  border:
    1px solid #bfdbfe;

  border-radius:
    11px;

  background:
    #eff8ff;
}

.selected-origin-card.success-card {
  border-color:
    #bbf7d0;

  background:
    #f0fdf4;
}

.selected-origin-icon {
  display: grid;

  width: 30px;
  height: 30px;

  flex:
    0
    0
    30px;

  place-items:
    center;

  border-radius:
    9px;

  background:
    #dbeafe;

  color:
    #0f64ad;

  font-size:
    12px;

  font-weight:
    900;
}

.selected-origin-icon.success {
  background:
    #dcfce7;

  color:
    #15803d;
}

.selected-origin-copy {
  display: flex;

  min-width: 0;

  flex-direction:
    column;

  gap: 2px;
}

.selected-origin-copy strong {
  color:
    #1e293b;

  font-size:
    11px;
}

.selected-origin-copy span {
  color:
    #64748b;

  font-size:
    9px;

  line-height:
    1.35;
}

.manual-coordinates {
  margin-top:
    12px;

  padding-top:
    10px;

  border-top:
    1px solid #e2e8f0;
}

.manual-coordinates summary {
  color:
    #0f64ad;

  cursor:
    pointer;

  font-size:
    10px;

  font-weight:
    800;
}

.coords-grid {
  display: grid;

  grid-template-columns:
    repeat(
      2,
      minmax(
        0,
        1fr
      )
    );

  gap: 10px;

  margin-top:
    10px;
}

.form-grid {
  display: grid;

  grid-template-columns:
    repeat(
      2,
      minmax(
        0,
        1fr
      )
    );

  gap: 12px;
}

/*
 * ============================================================
 * PLANIFICACIÓN
 * ============================================================
 */

.planning-card {
  display: flex;

  align-items:
    flex-start;

  gap: 11px;

  margin-top:
    12px;

  padding:
    12px;

  border:
    1px solid #dbe4ee;

  border-radius:
    11px;

  background:
    #f8fafc;
}

.planning-card-auto {
  border-color:
    #bfdbfe;

  background:
    #eff8ff;
}

.planning-card-foreign {
  border-color:
    #d8e1ea;

  background:
    #fbfdff;
}

.planning-icon {
  display: grid;

  width: 32px;
  height: 32px;

  flex:
    0
    0
    32px;

  place-items:
    center;

  border-radius:
    9px;

  background:
    #dbeafe;

  color:
    #0f64ad;

  font-size:
    12px;

  font-weight:
    900;
}

.planning-copy {
  display: flex;

  min-width: 0;

  flex-direction:
    column;

  gap: 3px;
}

.planning-copy strong {
  color:
    #1e293b;

  font-size:
    11px;
}

.planning-copy span {
  color:
    #475569;

  font-size:
    10px;

  line-height:
    1.45;
}

.planning-copy small {
  color:
    #64748b;

  font-size:
    9px;

  line-height:
    1.4;
}

.planning-manual-grid {
  width: 100%;
}

.metrics-grid {
  display: grid;

  grid-template-columns:
    repeat(
      3,
      minmax(
        0,
        1fr
      )
    );

  gap: 12px;

  margin-top:
    12px;

  padding-top:
    12px;

  border-top:
    1px solid #edf2f7;
}

.options-grid {
  display: grid;

  grid-template-columns:
    repeat(
      2,
      minmax(
        0,
        1fr
      )
    );

  gap: 8px;
}

.check-card {
  display: flex;

  min-height:
    44px;

  align-items:
    center;

  gap: 8px;

  padding:
    9px
    11px;

  border:
    1px solid #dfe7ef;

  border-radius:
    10px;

  background:
    #ffffff;

  color:
    #475569;

  cursor:
    pointer;

  font-size:
    11px;

  font-weight:
    700;
}

.check-card.checked {
  border-color:
    #93c5fd;

  background:
    #eff8ff;

  color:
    #0f4f87;
}

.check-card.fixed-option {
  cursor:
    default;
}

.check-copy {
  display: flex;

  flex-direction:
    column;

  gap: 1px;
}

.check-copy strong {
  font-size:
    11px;
}

.check-copy small {
  color:
    #64748b;

  font-size:
    9px;

  font-weight:
    600;
}

input[type="radio"],
input[type="checkbox"] {
  accent-color:
    #0f64ad;
}

.manual-list {
  display: grid;

  gap: 6px;

  margin-top:
    10px;

  padding:
    7px;

  border:
    1px solid #e2e8f0;

  border-radius:
    11px;

  background:
    #f8fafc;
}

.manual-item {
  padding:
    8px
    10px;

  border:
    1px solid #e2e8f0;

  border-radius:
    9px;

  background:
    #ffffff;
}

.manual-left {
  display: flex;

  min-width: 0;

  align-items:
    center;

  gap: 8px;
}

.drag-handle {
  color:
    #94a3b8;

  cursor:
    grab;

  user-select:
    none;
}

.manual-name {
  min-width: 0;

  overflow:
    hidden;

  flex: 1;

  color:
    #334155;

  font-size:
    11px;

  font-weight:
    650;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.badge-hard {
  padding:
    3px
    6px;

  border:
    1px solid #fecaca;

  border-radius:
    999px;

  background:
    #fff1f2;

  color:
    #b91c1c;

  font-size:
    8px;

  font-weight:
    800;

  white-space:
    nowrap;
}

.empty-state {
  padding:
    16px;

  color:
    #64748b;

  font-size:
    11px;

  text-align:
    center;
}

.notice {
  display: flex;

  flex-direction:
    column;

  gap: 5px;

  margin-top:
    10px;

  padding:
    10px
    11px;

  border-radius:
    10px;

  font-size:
    10px;

  line-height:
    1.4;
}

.notice-warning {
  border:
    1px solid #fde68a;

  background:
    #fffbeb;

  color:
    #92400e;
}

.notice-error {
  border:
    1px solid #fecaca;

  background:
    #fff1f2;

  color:
    #b91c1c;
}

.btn-link-action {
  width:
    fit-content;

  margin-top:
    3px;

  padding: 0;

  border: 0;

  background:
    transparent;

  color:
    #0f64ad;

  cursor:
    pointer;

  font-size:
    10px;

  font-weight:
    850;

  text-decoration:
    underline;
}

.modal-footer {
  display: flex;

  flex:
    0
    0
    auto;

  align-items:
    center;

  justify-content:
    space-between;

  gap: 12px;

  padding:
    13px
    20px;

  border-top:
    1px solid #e5edf5;

  background:
    #ffffff;
}

.footer-status {
  display: flex;

  min-width: 0;

  align-items:
    center;

  gap: 7px;

  color:
    #64748b;

  font-size:
    10px;

  line-height:
    1.3;
}

.status-dot {
  width: 8px;
  height: 8px;

  flex:
    0
    0
    8px;

  border-radius:
    999px;

  background:
    #f59e0b;
}

.status-dot.ready {
  background:
    #22c55e;
}

.footer-actions {
  display: flex;

  flex:
    0
    0
    auto;

  gap: 8px;
}

.btn-primary,
.btn-secondary {
  min-height:
    40px;

  padding:
    0
    16px;

  border-radius:
    9px;

  cursor:
    pointer;

  font-size:
    11px;

  font-weight:
    850;

  transition:
    background .15s ease,
    border-color .15s ease,
    color .15s ease,
    box-shadow .15s ease;
}

.btn-primary {
  border:
    1px solid #0f64ad;

  background:
    #0f64ad;

  color:
    #ffffff !important;

  box-shadow:
    0 3px 10px
      rgba(
        15,
        100,
        173,
        .16
      );
}

.btn-primary:hover:not(:disabled) {
  border-color:
    #0b568f;

  background:
    #0b568f;
}

.btn-primary:disabled {
  border-color:
    #d1d9e2;

  background:
    #e5eaf0;

  color:
    #94a3b8 !important;

  cursor:
    not-allowed;

  box-shadow:
    none;
}

.btn-secondary {
  border:
    1px solid #cbd5e1;

  background:
    #ffffff;

  color:
    #475569 !important;
}

.btn-secondary:hover {
  border-color:
    #94a3b8;

  background:
    #f8fafc;

  color:
    #1e293b !important;
}

@media (
  max-width: 700px
) {
  .modal-backdrop {
    padding:
      8px;
  }

  .modal {
    width:
      100%;

    max-height:
      96vh;

    border-radius:
      14px;
  }

  .modal-header {
    padding:
      14px;
  }

  .modal-header h3 {
    font-size:
      20px;
  }

  .modal-body {
    padding:
      12px
      12px
      4px;
  }

  .origin-option-grid {
    grid-template-columns:
      1fr;
  }

  .origin-option {
    min-height:
      58px;
  }

  .form-grid,
  .metrics-grid,
  .coords-grid,
  .options-grid {
    grid-template-columns:
      1fr;
  }

  .search-row {
    grid-template-columns:
      1fr;
  }

  .btn-search {
    width:
      100%;
  }

  .modal-footer {
    flex-direction:
      column;

    align-items:
      stretch;

    padding:
      11px
      12px;
  }

  .footer-actions {
    width: 100%;
  }

  .btn-primary,
  .btn-secondary {
    flex: 1;
  }
}
</style>