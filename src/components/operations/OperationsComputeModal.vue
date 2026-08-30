<!-- src/components/operations/OperationsComputeModal.vue -->

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="operations-modal-backdrop"
      @mousedown.self="handleClose"
    >
      <section
        class="operations-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-compute-title"
      >
        <!-- ===================================================
             HEADER
        ==================================================== -->

        <header class="operations-modal__header">
          <div>
            <span class="operations-modal__eyebrow">
              Operaciones
            </span>

            <h2
              id="operations-compute-title"
              class="operations-modal__title"
            >
              Calcular operación
            </h2>

            <p class="operations-modal__subtitle">
              El motor determinará automáticamente las rutas,
              operadores, vehículos y jornadas necesarias.
            </p>
          </div>

          <button
            type="button"
            class="operations-modal__close"
            aria-label="Cerrar"
            :disabled="loading"
            @click="handleClose"
          >
            ×
          </button>
        </header>

        <!-- ===================================================
             CONTENIDO
        ==================================================== -->

        <div class="operations-modal__body">
          <!-- =================================================
               CONTEXTO
          ================================================== -->

          <section class="form-section">
            <div class="form-section__header">
              <div>
                <h3>Ámbito operativo</h3>

                <p>
                  Define qué territorio debe cubrir el cálculo.
                </p>
              </div>
            </div>

            <div class="context-card">
              <div class="context-card__item">
                <span class="context-card__label">
                  Proyecto
                </span>

                <strong>
                  {{ projectLabel || 'Sin proyecto seleccionado' }}
                </strong>
              </div>

              <div
                v-if="selectedRegion"
                class="context-card__item"
              >
                <span class="context-card__label">
                  Región visible
                </span>

                <strong>
                  {{ selectedRegion }}
                </strong>
              </div>
            </div>

            <div class="choice-grid">
              <label
                class="choice-card"
                :class="{
                  active:
                    localCriteria.scope ===
                    'REGION',
                }"
              >
                <input
                  v-model="localCriteria.scope"
                  type="radio"
                  value="REGION"
                  :disabled="loading"
                />

                <span class="choice-card__indicator"></span>

                <span class="choice-card__content">
                  <strong>
                    Región
                  </strong>

                  <small>
                    Calcula únicamente la región sanitaria
                    seleccionada.
                  </small>
                </span>
              </label>

              <label
                class="choice-card"
                :class="{
                  active:
                    localCriteria.scope ===
                    'PROJECT',
                }"
              >
                <input
                  v-model="localCriteria.scope"
                  type="radio"
                  value="PROJECT"
                  :disabled="loading"
                />

                <span class="choice-card__indicator"></span>

                <span class="choice-card__content">
                  <strong>
                    Todo el proyecto
                  </strong>

                  <small>
                    Incluye todas las unidades del proyecto.
                  </small>
                </span>
              </label>
            </div>

            <div
              v-if="
                localCriteria.scope ===
                'REGION'
              "
              class="field-group"
            >
              <label for="operations-region">
                Región sanitaria
              </label>

              <select
                id="operations-region"
                v-model="localCriteria.region"
                :disabled="loading"
              >
                <option value="">
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
            </div>
          </section>

          <!-- =================================================
               TIPO DE OPERACIÓN
          ================================================== -->

          <section class="form-section">
            <div class="form-section__header">
              <div>
                <h3>
                  Tipo de operación
                </h3>

                <p>
                  Define la política operativa; el motor calculará
                  los recursos necesarios.
                </p>
              </div>
            </div>

            <div class="choice-grid">
              <label
                class="choice-card"
                :class="{
                  active:
                    localCriteria.routeMode ===
                    'ROUND_TRIP',
                }"
              >
                <input
                  v-model="localCriteria.routeMode"
                  type="radio"
                  value="ROUND_TRIP"
                  :disabled="loading"
                />

                <span class="choice-card__indicator"></span>

                <span class="choice-card__content">
                  <strong>
                    Ida y vuelta
                  </strong>

                  <small>
                    Cada ruta inicia y termina en el origen dentro
                    de la misma jornada operativa.
                  </small>
                </span>
              </label>

              <label
                class="choice-card"
                :class="{
                  active:
                    localCriteria.routeMode ===
                    'FOREIGN_ROUTE',
                }"
              >
                <input
                  v-model="localCriteria.routeMode"
                  type="radio"
                  value="FOREIGN_ROUTE"
                  :disabled="loading"
                />

                <span class="choice-card__indicator"></span>

                <span class="choice-card__content">
                  <strong>
                    Ruta foránea
                  </strong>

                  <small>
                    Expedición continua de varios días con retorno
                    al origen al finalizar.
                  </small>
                </span>
              </label>
            </div>

            <div
              v-if="
                localCriteria.routeMode ===
                'FOREIGN_ROUTE'
              "
              class="field-group compact-field"
            >
              <label for="operations-max-days">
                Máximo de días por expedición
              </label>

              <input
                id="operations-max-days"
                v-model.number="localCriteria.maxForeignDays"
                type="number"
                min="1"
                max="10"
                step="1"
                :disabled="loading"
              />

              <small class="field-help">
                Es una política máxima, no una cantidad de días
                solicitada. El motor determinará los días requeridos.
              </small>
            </div>
          </section>

          <!-- =================================================
               ORIGEN
          ================================================== -->

          <section class="form-section">
            <div class="form-section__header">
              <div>
                <h3>
                  Origen
                </h3>

                <p>
                  Punto desde el cual inicia la operación.
                </p>
              </div>
            </div>

            <div class="choice-grid">
              <label
                class="choice-card"
                :class="{
                  active:
                    localCriteria.originMode ===
                    'cedis',
                }"
              >
                <input
                  v-model="localCriteria.originMode"
                  type="radio"
                  value="cedis"
                  :disabled="
                    loading ||
                    !cedis.length
                  "
                />

                <span class="choice-card__indicator"></span>

                <span class="choice-card__content">
                  <strong>
                    CEDIS
                  </strong>

                  <small v-if="cedis.length">
                    Utiliza un centro de distribución registrado.
                  </small>

                  <small v-else>
                    Este proyecto no tiene CEDIS registrado.
                  </small>
                </span>
              </label>

              <label
                class="choice-card"
                :class="{
                  active:
                    localCriteria.originMode ===
                    'coords',
                }"
              >
                <input
                  v-model="localCriteria.originMode"
                  type="radio"
                  value="coords"
                  :disabled="loading"
                />

                <span class="choice-card__indicator"></span>

                <span class="choice-card__content">
                  <strong>
                    Otro origen
                  </strong>

                  <small>
                    Busca una dirección, establecimiento o ubicación.
                  </small>
                </span>
              </label>
            </div>

            <!-- CEDIS -->

            <div
              v-if="
                localCriteria.originMode ===
                'cedis'
              "
              class="field-group"
            >
              <label for="operations-cedis">
                CEDIS de origen
              </label>

              <select
                id="operations-cedis"
                v-model="localCriteria.selectedCedisId"
                :disabled="loading"
              >
                <option :value="null">
                  Selecciona un CEDIS
                </option>

                <option
                  v-for="item in cedis"
                  :key="item.id"
                  :value="Number(item.id)"
                >
                  {{
                    item.nombre ||
                    item.name ||
                    item.descripcion ||
                    `CEDIS ${item.id}`
                  }}
                </option>
              </select>
            </div>

            <!-- BUSCAR OTRO ORIGEN -->

            <div
              v-else
              class="origin-search"
            >
              <label for="operations-origin-search">
                Buscar ubicación
              </label>

              <div class="origin-search__row">
                <input
                  id="operations-origin-search"
                  v-model="originSearchText"
                  type="text"
                  placeholder="Ej. CEDIS Aguascalientes, Av. Convención..."
                  autocomplete="off"
                  :disabled="loading || searchingOrigin"
                  @keydown.enter.prevent="searchOrigin"
                />

                <button
                  type="button"
                  class="secondary-button"
                  :disabled="
                    loading ||
                    searchingOrigin ||
                    !originSearchText.trim()
                  "
                  @click="searchOrigin"
                >
                  {{
                    searchingOrigin
                      ? 'Buscando...'
                      : 'Buscar'
                  }}
                </button>
              </div>

              <p
                v-if="originSearchError"
                class="field-error"
              >
                {{ originSearchError }}
              </p>

              <div
                v-if="originResolvedLabel"
                class="resolved-origin"
              >
                <span class="resolved-origin__icon">
                  ✓
                </span>

                <div>
                  <strong>
                    Origen seleccionado
                  </strong>

                  <span>
                    {{ originResolvedLabel }}
                  </span>

                  <small>
                    {{
                      formatCoordinate(
                        localCriteria
                          .originCoords
                          .lat
                      )
                    }},
                    {{
                      formatCoordinate(
                        localCriteria
                          .originCoords
                          .lng
                      )
                    }}
                  </small>
                </div>
              </div>

              <details class="coordinates-details">
                <summary>
                  Capturar coordenadas manualmente
                </summary>

                <div class="coordinates-grid">
                  <div class="field-group">
                    <label for="operations-origin-lat">
                      Latitud
                    </label>

                    <input
                      id="operations-origin-lat"
                      v-model="localCriteria.originCoords.lat"
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      :disabled="loading"
                      @input="clearResolvedOriginLabel"
                    />
                  </div>

                  <div class="field-group">
                    <label for="operations-origin-lng">
                      Longitud
                    </label>

                    <input
                      id="operations-origin-lng"
                      v-model="localCriteria.originCoords.lng"
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      :disabled="loading"
                      @input="clearResolvedOriginLabel"
                    />
                  </div>
                </div>
              </details>
            </div>
          </section>

          <!-- =================================================
               CRITERIOS OPERATIVOS
          ================================================== -->

          <section class="form-section">
            <div class="form-section__header">
              <div>
                <h3>
                  Criterios operativos
                </h3>

                <p>
                  Ajustes que sí afectan el cálculo de la operación.
                </p>
              </div>
            </div>

            <div class="toggle-list">
              <label class="toggle-row">
                <span>
                  <strong>
                    Excluir difícil acceso
                  </strong>

                  <small>
                    Omite unidades identificadas con condición de
                    acceso especial.
                  </small>
                </span>

                <input
                  v-model="
                    localCriteria
                      .options
                      .avoidDificilAcceso
                  "
                  type="checkbox"
                  :disabled="loading"
                />
              </label>

              <label class="toggle-row">
                <span>
                  <strong>
                    Evitar peajes
                  </strong>

                  <small>
                    Solicita evitar carreteras de cuota cuando sea
                    posible.
                  </small>
                </span>

                <input
                  v-model="
                    localCriteria
                      .options
                      .avoidTolls
                  "
                  type="checkbox"
                  :disabled="loading"
                />
              </label>
            </div>
          </section>

          <!-- =================================================
               ESTIMACIÓN ECONÓMICA
          ================================================== -->

          <section class="form-section">
            <div class="form-section__header">
              <div>
                <h3>
                  Estimación económica
                </h3>

                <p>
                  Datos opcionales. No condicionan el cálculo de
                  rutas ni recursos.
                </p>
              </div>

              <span class="optional-badge">
                Opcional
              </span>
            </div>

            <div class="economics-note">
              Mientras no exista un vehículo asignado, el consumo
              se estima con el rendimiento indicado aquí.
            </div>

            <div class="economics-grid">
              <div class="field-group">
                <label for="operations-kml">
                  Rendimiento estimado
                </label>

                <div class="input-suffix">
                  <input
                    id="operations-kml"
                    v-model="localCriteria.kmPerLiter"
                    type="number"
                    min="0.1"
                    step="0.1"
                    :disabled="loading"
                  />

                  <span>
                    km/L
                  </span>
                </div>
              </div>

              <div class="field-group">
                <label for="operations-fuel-price">
                  Precio combustible
                </label>

                <div class="input-prefix">
                  <span>
                    $
                  </span>

                  <input
                    id="operations-fuel-price"
                    v-model="localCriteria.fuelPricePerLiter"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Opcional"
                    :disabled="loading"
                  />
                </div>

                <small class="field-help">
                  Precio por litro.
                </small>
              </div>

              <div class="field-group">
                <label for="operations-allowance">
                  Viático diario por operador
                </label>

                <div class="input-prefix">
                  <span>
                    $
                  </span>

                  <input
                    id="operations-allowance"
                    v-model="localCriteria.dailyAllowance"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Opcional"
                    :disabled="loading"
                  />
                </div>

                <small class="field-help">
                  Se multiplicará por operadores requeridos y
                  jornadas determinadas por el motor.
                </small>
              </div>
            </div>
          </section>

          <!-- =================================================
               MENSAJES
          ================================================== -->

          <div
            v-if="validationMessage"
            class="validation-message"
          >
            {{ validationMessage }}
          </div>

          <div
            v-if="error"
            class="request-error"
          >
            {{ error }}
          </div>
        </div>

        <!-- ===================================================
             FOOTER
        ==================================================== -->

        <footer class="operations-modal__footer">
          <div class="footer-note">
            Rutas, operadores, vehículos y jornadas serán
            determinados automáticamente.
          </div>

          <div class="footer-actions">
            <button
              type="button"
              class="ghost-button"
              :disabled="loading"
              @click="handleClose"
            >
              Cancelar
            </button>

            <button
              type="button"
              class="primary-button"
              :disabled="
                loading ||
                !canCalculate
              "
              @click="submit"
            >
              <span
                v-if="loading"
                class="button-spinner"
              ></span>

              {{
                loading
                  ? 'Calculando...'
                  : 'Calcular operación'
              }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import {
  computed,
  reactive,
  ref,
  watch,
} from 'vue'

/*
 * ============================================================
 * PROPS / EMITS
 * ============================================================
 */

const props =
  defineProps({
    open: {
      type:
        Boolean,

      default:
        false,
    },

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

    criteria: {
      type:
        Object,

      required:
        true,
    },

    project: {
      type:
        String,

      default:
        '',
    },

    selectedRegion: {
      type:
        String,

      default:
        '',
    },

    regiones: {
      type:
        Array,

      default:
        () => [],
    },

    cedis: {
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
    'update:criteria',
  ])

/*
 * ============================================================
 * ESTADO LOCAL
 * ============================================================
 */

const localCriteria =
  reactive(
    buildLocalCriteria(
      props.criteria
    )
  )

const originSearchText =
  ref('')

const originResolvedLabel =
  ref('')

const originSearchError =
  ref('')

const searchingOrigin =
  ref(false)

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function buildLocalCriteria(
  source
) {
  return {
    scope:
      source?.scope ||
      'REGION',

    region:
      source?.region ||
      '',

    routeMode:
      source?.routeMode ||
      'ROUND_TRIP',

    originMode:
      source?.originMode ||
      (
        props.cedis.length
          ? 'cedis'
          : 'coords'
      ),

    selectedCedisId:
      source
        ?.selectedCedisId ??
      props.cedis?.[0]?.id ??
      null,

    originCoords: {
      lat:
        source
          ?.originCoords
          ?.lat ??
        '',

      lng:
        source
          ?.originCoords
          ?.lng ??
        '',
    },

    options: {
      avoidTolls:
        Boolean(
          source
            ?.options
            ?.avoidTolls
        ),

      avoidDificilAcceso:
        source
          ?.options
          ?.avoidDificilAcceso !==
        false,
    },

    maxForeignDays:
      Number(
        source
          ?.maxForeignDays ??
        3
      ),

    kmPerLiter:
      source
        ?.kmPerLiter ??
      '10',

    fuelPricePerLiter:
      source
        ?.fuelPricePerLiter ??
      '',

    dailyAllowance:
      source
        ?.dailyAllowance ??
      '',
  }
}

function syncLocalCriteria(
  source
) {
  const next =
    buildLocalCriteria(
      source
    )

  localCriteria.scope =
    next.scope

  localCriteria.region =
    next.region

  localCriteria.routeMode =
    next.routeMode

  localCriteria.originMode =
    next.originMode

  localCriteria.selectedCedisId =
    next.selectedCedisId

  localCriteria.originCoords.lat =
    next.originCoords.lat

  localCriteria.originCoords.lng =
    next.originCoords.lng

  localCriteria.options.avoidTolls =
    next.options.avoidTolls

  localCriteria.options.avoidDificilAcceso =
    next.options.avoidDificilAcceso

  localCriteria.maxForeignDays =
    next.maxForeignDays

  localCriteria.kmPerLiter =
    next.kmPerLiter

  localCriteria.fuelPricePerLiter =
    next.fuelPricePerLiter

  localCriteria.dailyAllowance =
    next.dailyAllowance
}

function normalizeCriteriaForEmit() {
  return {
    scope:
      localCriteria.scope,

    region:
      localCriteria.region,

    routeMode:
      localCriteria.routeMode,

    originMode:
      localCriteria.originMode,

    selectedCedisId:
      localCriteria
        .selectedCedisId,

    originCoords: {
      lat:
        localCriteria
          .originCoords
          .lat,

      lng:
        localCriteria
          .originCoords
          .lng,
    },

    options: {
      avoidTolls:
        Boolean(
          localCriteria
            .options
            .avoidTolls
        ),

      avoidDificilAcceso:
        Boolean(
          localCriteria
            .options
            .avoidDificilAcceso
        ),
    },

    maxForeignDays:
      Number(
        localCriteria
          .maxForeignDays ||
        3
      ),

    kmPerLiter:
      localCriteria
        .kmPerLiter,

    fuelPricePerLiter:
      localCriteria
        .fuelPricePerLiter,

    dailyAllowance:
      localCriteria
        .dailyAllowance,
  }
}

function validCoordinates() {
  const lat =
    Number(
      localCriteria
        .originCoords
        .lat
    )

  const lng =
    Number(
      localCriteria
        .originCoords
        .lng
    )

  return Boolean(
    Number.isFinite(
      lat
    ) &&
    Number.isFinite(
      lng
    ) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

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

function clearResolvedOriginLabel() {
  originResolvedLabel.value =
    ''

  originSearchError.value =
    ''
}

/*
 * ============================================================
 * COMPUTED
 * ============================================================
 */

const projectLabel =
  computed(
    () =>
      String(
        props.project ||
        ''
      )
        .trim()
        .toUpperCase()
  )

const validationMessage =
  computed(
    () => {
      if (
        !projectLabel.value
      ) {
        return 'Selecciona primero un proyecto en el mapa.'
      }

      if (
        localCriteria.scope ===
          'REGION' &&
        !String(
          localCriteria.region ||
          ''
        ).trim()
      ) {
        return 'Selecciona una región sanitaria.'
      }

      if (
        localCriteria.originMode ===
          'cedis' &&
        !localCriteria
          .selectedCedisId
      ) {
        return 'Selecciona un CEDIS de origen.'
      }

      if (
        localCriteria.originMode ===
          'coords' &&
        !validCoordinates()
      ) {
        return 'Busca una ubicación o captura coordenadas válidas.'
      }

      if (
        localCriteria.routeMode ===
          'FOREIGN_ROUTE' &&
        (
          !Number.isFinite(
            Number(
              localCriteria
                .maxForeignDays
            )
          ) ||
          Number(
            localCriteria
              .maxForeignDays
          ) <
            1
        )
      ) {
        return 'El máximo de días debe ser mayor o igual a 1.'
      }

      return ''
    }
  )

const canCalculate =
  computed(
    () =>
      !validationMessage.value
  )

/*
 * ============================================================
 * GEOCODER
 * ============================================================
 */

async function searchOrigin() {
  const query =
    String(
      originSearchText.value ||
      ''
    ).trim()

  if (
    !query
  ) {
    return
  }

  originSearchError.value =
    ''

  originResolvedLabel.value =
    ''

  if (
    !window
      ?.google
      ?.maps
      ?.importLibrary
  ) {
    originSearchError.value =
      'Google Maps todavía no está disponible.'

    return
  }

  searchingOrigin.value =
    true

  try {
    const {
      Place,
    } =
      await window.google.maps
        .importLibrary(
          'places'
        )

    if (
      !Place?.searchByText
    ) {
      throw new Error(
        'Places API (New) no está disponible en el navegador.'
      )
    }

    const {
      places,
    } =
      await Place.searchByText({
        textQuery:
          query,

        fields: [
          'displayName',
          'formattedAddress',
          'location',
          'id',
        ],

        maxResultCount:
          5,

        region:
          'MX',

        language:
          'es-MX',
      })

    const place =
      Array.isArray(
        places
      )
        ? places.find(
            item =>
              item?.location
          )
        : null

    if (
      !place ||
      !place.location
    ) {
      originSearchError.value =
        'No se encontró una ubicación con esa búsqueda.'

      return
    }

    const lat =
      typeof place.location.lat ===
        'function'
        ? place.location.lat()
        : Number(
            place.location.lat
          )

    const lng =
      typeof place.location.lng ===
        'function'
        ? place.location.lng()
        : Number(
            place.location.lng
          )

    if (
      !Number.isFinite(
        lat
      ) ||
      !Number.isFinite(
        lng
      )
    ) {
      originSearchError.value =
        'Google Places no devolvió coordenadas válidas.'

      return
    }

    localCriteria.originCoords.lat =
      lat

    localCriteria.originCoords.lng =
      lng

    originResolvedLabel.value =
      place.formattedAddress ||
      place.displayName ||
      query
  } catch (
    searchError
  ) {
    console.error(
      '[OperationsComputeModal][searchOrigin]',
      searchError
    )

    const message =
      String(
        searchError?.message ||
        ''
      )

    if (
      message.includes(
        'REQUEST_DENIED'
      ) ||
      message.includes(
        'not authorized'
      )
    ) {
      originSearchError.value =
        'Google Places rechazó la búsqueda. Revisa las restricciones de la API key para Places API (New).'

      return
    }

    originSearchError.value =
      searchError
        ?.message ||
      'No fue posible buscar la ubicación.'
  } finally {
    searchingOrigin.value =
      false
  }
}

/*
 * ============================================================
 * ACCIONES
 * ============================================================
 */

function handleClose() {
  if (
    props.loading
  ) {
    return
  }

  emit(
    'close'
  )
}

function submit() {
  if (
    !canCalculate.value ||
    props.loading
  ) {
    return
  }

  const value =
    normalizeCriteriaForEmit()

  emit(
    'update:criteria',
    value
  )

  emit(
    'calculate',
    value
  )
}

/*
 * ============================================================
 * WATCH
 * ============================================================
 */

watch(
  () =>
    props.open,

  opened => {
    if (
      !opened
    ) {
      return
    }

    syncLocalCriteria(
      props.criteria
    )

    originSearchError.value =
      ''

    if (
      !props.cedis.length &&
      localCriteria.originMode ===
        'cedis'
    ) {
      localCriteria.originMode =
        'coords'

      localCriteria.selectedCedisId =
        null
    }

    if (
      props.selectedRegion &&
      localCriteria.scope ===
        'REGION'
    ) {
      localCriteria.region =
        props.selectedRegion
    }
  }
)

watch(
  () =>
    props.cedis,

  list => {
    if (
      !props.open
    ) {
      return
    }

    if (
      !Array.isArray(
        list
      ) ||
      !list.length
    ) {
      if (
        localCriteria.originMode ===
        'cedis'
      ) {
        localCriteria.originMode =
          'coords'

        localCriteria.selectedCedisId =
          null
      }

      return
    }

    const currentExists =
      list.some(
        item =>
          Number(
            item.id
          ) ===
          Number(
            localCriteria
              .selectedCedisId
          )
      )

    if (
      !currentExists
    ) {
      localCriteria.selectedCedisId =
        Number(
          list[0].id
        )
    }
  },
  {
    deep:
      true,
  }
)

watch(
  () =>
    localCriteria.scope,

  scope => {
    if (
      scope !==
      'REGION'
    ) {
      return
    }

    if (
      !localCriteria.region &&
      props.selectedRegion
    ) {
      localCriteria.region =
        props.selectedRegion
    }
  }
)
</script>

<style scoped>
.operations-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.46);
  backdrop-filter: blur(4px);
}

.operations-modal {
  display: flex;
  width: min(780px, 100%);
  max-height: calc(100vh - 48px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dbe3ec;
  border-radius: 18px;
  background: #ffffff;
  box-shadow:
    0 24px 70px rgba(15, 23, 42, 0.22),
    0 4px 16px rgba(15, 23, 42, 0.08);
  color: #172033;
}

.operations-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid #e8edf3;
}

.operations-modal__eyebrow {
  display: inline-block;
  margin-bottom: 5px;
  color: #0f64ad;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.operations-modal__title {
  margin: 0;
  color: #152033;
  font-size: 23px;
  font-weight: 800;
  line-height: 1.15;
}

.operations-modal__subtitle {
  max-width: 590px;
  margin: 7px 0 0;
  color: #677489;
  font-size: 15px;
  line-height: 1.45;
}

.operations-modal__close {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 1px solid #e0e7ef;
  border-radius: 10px;
  background: #ffffff;
  color: #64748b;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.operations-modal__close:hover:not(:disabled) {
  background: #f8fafc;
  color: #172033;
}

.operations-modal__body {
  overflow-y: auto;
  padding: 20px 24px 24px;
}

.form-section + .form-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #edf1f5;
}

.form-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.form-section__header h3 {
  margin: 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 800;
}

.form-section__header p {
  margin: 4px 0 0;
  color: #7a8799;
  font-size: 14px;
  line-height: 1.4;
}

.context-card {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.context-card__item {
  display: flex;
  min-width: 150px;
  flex-direction: column;
  gap: 2px;
}

.context-card__label {
  color: #8a96a8;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.context-card strong {
  color: #243146;
  font-size: 15px;
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.choice-card {
  position: relative;
  display: flex;
  min-height: 82px;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
  border: 1px solid #dce3eb;
  border-radius: 12px;
  background: #ffffff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.choice-card:hover {
  border-color: #b9cfe3;
}

.choice-card.active {
  border-color: #78add7;
  background: #f5faff;
  box-shadow: 0 0 0 2px rgba(15, 100, 173, 0.07);
}

.choice-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.choice-card__indicator {
  position: relative;
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  margin-top: 1px;
  border: 1.5px solid #b7c1ce;
  border-radius: 50%;
  background: #ffffff;
}

.choice-card.active .choice-card__indicator {
  border-color: #0f64ad;
}

.choice-card.active .choice-card__indicator::after {
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: #0f64ad;
  content: '';
}

.choice-card__content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.choice-card__content strong {
  color: #243146;
  font-size: 15px;
}

.choice-card__content small {
  color: #768397;
  font-size: 13px;
  line-height: 1.4;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.field-group label,
.origin-search > label {
  color: #334155;
  font-size: 14px;
  font-weight: 700;
}

.field-group input,
.field-group select,
.origin-search input {
  width: 100%;
  min-height: 40px;
  box-sizing: border-box;
  padding: 9px 11px;
  border: 1px solid #d9e1ea;
  border-radius: 9px;
  outline: none;
  background: #ffffff;
  color: #1f2937;
  font: inherit;
  font-size: 15px;
}

.field-group input:focus,
.field-group select:focus,
.origin-search input:focus {
  border-color: #6da6d4;
  box-shadow: 0 0 0 3px rgba(15, 100, 173, 0.08);
}

.compact-field {
  max-width: 260px;
}

.field-help {
  color: #8a96a8;
  font-size: 12px;
  line-height: 1.4;
}

.origin-search {
  margin-top: 12px;
}

.origin-search__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-top: 6px;
}

.secondary-button,
.ghost-button,
.primary-button {
  border-radius: 9px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;
}

.secondary-button {
  min-width: 90px;
  padding: 0 14px;
  border: 1px solid #d7e0e9;
  background: #f8fafc;
  color: #334155;
}

.secondary-button:hover:not(:disabled) {
  background: #eef4f8;
}

.field-error {
  margin: 7px 0 0;
  color: #b42318;
  font-size: 13px;
}

.resolved-origin {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 10px;
  padding: 11px 12px;
  border: 1px solid #cde8d8;
  border-radius: 10px;
  background: #f3fbf6;
}

.resolved-origin__icon {
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: #16803c;
  color: #ffffff;
  font-size: 13px;
  font-weight: 900;
}

.resolved-origin div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.resolved-origin strong {
  color: #245337;
  font-size: 13px;
}

.resolved-origin span {
  color: #3e5e49;
  font-size: 14px;
}

.resolved-origin small {
  color: #71867a;
  font-size: 12px;
}

.coordinates-details {
  margin-top: 10px;
  color: #64748b;
  font-size: 13px;
}

.coordinates-details summary {
  cursor: pointer;
  font-weight: 700;
}

.coordinates-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.toggle-list {
  overflow: hidden;
  border: 1px solid #e0e7ef;
  border-radius: 12px;
}

.toggle-row {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 11px 14px;
  background: #ffffff;
  cursor: pointer;
}

.toggle-row + .toggle-row {
  border-top: 1px solid #edf1f5;
}

.toggle-row > span {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.toggle-row strong {
  color: #334155;
  font-size: 14px;
}

.toggle-row small {
  color: #8490a0;
  font-size: 12px;
  line-height: 1.35;
}

.toggle-row input {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  accent-color: #0f64ad;
}

.optional-badge {
  padding: 4px 7px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.economics-note {
  margin-bottom: 12px;
  padding: 9px 11px;
  border-left: 3px solid #9ebdd7;
  border-radius: 0 8px 8px 0;
  background: #f7fafc;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.economics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.input-suffix,
.input-prefix {
  display: flex;
  align-items: center;
}

.input-suffix input {
  border-radius: 9px 0 0 9px;
}

.input-suffix span {
  display: grid;
  min-height: 40px;
  place-items: center;
  padding: 0 10px;
  border: 1px solid #d9e1ea;
  border-left: 0;
  border-radius: 0 9px 9px 0;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.input-prefix span {
  display: grid;
  min-height: 40px;
  place-items: center;
  padding: 0 10px;
  border: 1px solid #d9e1ea;
  border-right: 0;
  border-radius: 9px 0 0 9px;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.input-prefix input {
  border-radius: 0 9px 9px 0;
}

.validation-message,
.request-error {
  margin-top: 18px;
  padding: 10px 12px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.validation-message {
  border: 1px solid #f2dfae;
  background: #fffaf0;
  color: #8a6215;
}

.request-error {
  border: 1px solid #f2c7c4;
  background: #fff5f4;
  color: #a62b23;
}

.operations-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 15px 24px;
  border-top: 1px solid #e8edf3;
  background: #fbfcfd;
}

.footer-note {
  max-width: 390px;
  color: #8490a0;
  font-size: 12px;
  line-height: 1.4;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.ghost-button {
  min-height: 39px;
  padding: 0 15px;
  border: 1px solid #dbe3eb;
  background: #ffffff;
  color: #475569;
}

.primary-button {
  display: inline-flex;
  min-height: 39px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 17px;
  border: 1px solid #0f64ad;
  background: #0f64ad;
  color: #ffffff;
}

.primary-button:hover:not(:disabled) {
  background: #0b5798;
}

button:disabled,
input:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.button-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.42);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: operations-spin 0.7s linear infinite;
}

@keyframes operations-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .operations-modal-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .operations-modal {
    width: 100%;
    max-height: 94vh;
    border-radius: 18px 18px 0 0;
  }

  .operations-modal__header,
  .operations-modal__body,
  .operations-modal__footer {
    padding-right: 16px;
    padding-left: 16px;
  }

  .choice-grid,
  .economics-grid,
  .coordinates-grid {
    grid-template-columns: 1fr;
  }

  .operations-modal__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .footer-actions {
    width: 100%;
  }

  .footer-actions button {
    flex: 1;
  }

  .footer-note {
    max-width: none;
  }
}
</style>