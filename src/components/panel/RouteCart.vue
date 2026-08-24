<template>
  <section class="route-cart">
    <!-- =====================================================
         CABECERA
    ====================================================== -->
    <div class="cart-header">
      <div class="cart-title-block">
        <div class="cart-kicker">
          Herramienta auxiliar
        </div>

        <h5>
          Ruta personalizada
        </h5>

        <p class="subtext">
          Selecciona unidades, define el origen y calcula
          una ruta temporal. No modifica los planes de trabajo.
        </p>
      </div>

      <span
        class="count"
        :class="{
          active: customPoints.length
        }"
      >
        {{ customPoints.length }}
        unidad{{
          customPoints.length === 1
            ? ''
            : 'es'
        }}
      </span>
    </div>

    <!-- =====================================================
         CONTROLES
    ====================================================== -->
    <div class="cart-controls">
      <!-- ===================================================
           1. ESTRATEGIA
      ==================================================== -->
      <div class="control-card">
        <div class="control-heading">
          <span class="control-number">
            1
          </span>

          <div>
            <strong>
              Modo de cálculo
            </strong>

            <small>
              Define cómo ordenar los destinos.
            </small>
          </div>
        </div>

        <select
          class="field-control"
          :value="customStrategy"
          @change="
            emit(
              'update:customStrategy',
              $event.target.value
            )
          "
        >
          <option value="FASTEST">
            Optimizar tiempo
          </option>

          <option value="RESOURCES">
            Optimizar recursos
          </option>

          <option value="NEAREST_FIRST">
            Visitar cercanas primero
          </option>

          <option value="FARTHEST_FIRST">
            Visitar lejanas primero
          </option>

          <option value="MANUAL">
            Respetar el orden del carrito
          </option>
        </select>

        <small class="field-help">
          Tiempo y recursos optimizan la ruta.
          Cercanas y lejanas aplican una heurística de orden.
        </small>
      </div>

      <!-- ===================================================
           2. ORIGEN
      ==================================================== -->
      <div class="control-card">
        <div class="control-heading">
          <span class="control-number">
            2
          </span>

          <div>
            <strong>
              Punto de inicio
            </strong>

            <small>
              Define desde dónde sale la ruta.
            </small>
          </div>
        </div>

        <div class="origin-options">
          <!-- PRIMERA UNIDAD -->
          <label
            class="origin-option"
            :class="{
              selected:
                customOriginMode === 'first'
            }"
          >
            <input
              type="radio"
              name="custom-origin-mode"
              value="first"
              :checked="
                customOriginMode === 'first'
              "
              @change="
                emit(
                  'update:customOriginMode',
                  'first'
                )
              "
            />

            <span class="origin-option-icon">
              1
            </span>

            <span class="origin-option-copy">
              <strong>
                Primera unidad
              </strong>

              <small>
                Inicia en el primer destino del carrito.
              </small>
            </span>
          </label>

          <!-- UNIDAD ESPECÍFICA -->
          <label
            class="origin-option"
            :class="{
              selected:
                customOriginMode === 'pharmacy'
            }"
          >
            <input
              type="radio"
              name="custom-origin-mode"
              value="pharmacy"
              :checked="
                customOriginMode === 'pharmacy'
              "
              @change="
                emit(
                  'update:customOriginMode',
                  'pharmacy'
                )
              "
            />

            <span class="origin-option-icon">
              U
            </span>

            <span class="origin-option-copy">
              <strong>
                Elegir unidad
              </strong>

              <small>
                Usa una unidad del carrito como origen.
              </small>
            </span>
          </label>

          <!-- ORIGEN EXTERNO -->
          <label
            class="origin-option"
            :class="{
              selected:
                customOriginMode === 'coords'
            }"
          >
            <input
              type="radio"
              name="custom-origin-mode"
              value="coords"
              :checked="
                customOriginMode === 'coords'
              "
              @change="
                emit(
                  'update:customOriginMode',
                  'coords'
                )
              "
            />

            <span class="origin-option-icon">
              ⌕
            </span>

            <span class="origin-option-copy">
              <strong>
                Otro origen
              </strong>

              <small>
                Busca un lugar o captura coordenadas.
              </small>
            </span>
          </label>
        </div>

        <!-- =================================================
             ORIGEN = UNIDAD
        ================================================== -->
        <div
          v-if="
            customOriginMode === 'pharmacy'
          "
          class="origin-detail-panel"
        >
          <label class="section-label">
            Unidad de inicio
          </label>

          <select
            class="field-control"
            :value="
              customOriginPharmacyId ?? ''
            "
            :disabled="
              !customOriginCandidates.length
            "
            @change="
              emit(
                'update:customOriginPharmacyId',
                $event.target.value
                  ? Number($event.target.value)
                  : null
              )
            "
          >
            <option
              value=""
              disabled
            >
              {{
                customOriginCandidates.length
                  ? 'Selecciona una unidad'
                  : 'Primero añade unidades'
              }}
            </option>

            <option
              v-for="candidate in customOriginCandidates"
              :key="candidate.id"
              :value="candidate.id"
            >
              {{ candidate.label }}
            </option>
          </select>
        </div>

        <!-- =================================================
             ORIGEN = LUGAR / COORDENADAS
        ================================================== -->
        <div
          v-if="
            customOriginMode === 'coords'
          "
          class="origin-detail-panel"
        >
          <label class="section-label">
            Buscar lugar o dirección
          </label>

          <div class="search-row">
            <input
              v-model="searchText"
              type="text"
              class="field-control"
              placeholder="Ej. CEDIS Aguascalientes..."
              autocomplete="off"
              @keydown.enter.prevent="
                searchPlace
              "
            />

            <button
              type="button"
              class="btn-search"
              :disabled="
                searching ||
                !searchText.trim()
              "
              @click="
                searchPlace
              "
            >
              {{
                searching
                  ? 'Buscando...'
                  : 'Buscar'
              }}
            </button>
          </div>

          <small class="field-help">
            Puedes buscar CEDIS, almacenes,
            establecimientos o una dirección.
          </small>

          <div
            v-if="searchError"
            class="search-error"
          >
            {{ searchError }}
          </div>

          <!-- RESULTADOS -->
          <div
            v-if="
              searchResults.length
            "
            class="search-results"
          >
            <button
              v-for="result in searchResults"
              :key="result.id"
              type="button"
              class="search-result"
              :class="{
                selected:
                  selectedSearchResultId === result.id
              }"
              @click="
                selectSearchResult(result)
              "
            >
              <span class="search-result-icon">
                •
              </span>

              <span class="search-result-copy">
                <strong>
                  {{ result.name }}
                </strong>

                <small>
                  {{
                    result.address ||
                    'Sin dirección disponible'
                  }}
                </small>
              </span>

              <span class="search-result-action">
                {{
                  selectedSearchResultId === result.id
                    ? 'Seleccionado'
                    : 'Usar'
                }}
              </span>
            </button>
          </div>

          <!-- ORIGEN YA RESUELTO -->
          <div
            v-if="hasValidCoords"
            class="origin-selected"
          >
            <span class="origin-selected-icon">
              ✓
            </span>

            <div>
              <strong>
                {{
                  selectedSearchName ||
                  'Origen definido'
                }}
              </strong>

              <small>
                {{
                  Number(
                    customOriginCoords?.lat
                  ).toFixed(6)
                }},
                {{
                  Number(
                    customOriginCoords?.lng
                  ).toFixed(6)
                }}
              </small>
            </div>
          </div>

          <!-- COORDENADAS MANUALES -->
          <details class="manual-coordinates">
            <summary>
              Capturar coordenadas manualmente
            </summary>

            <div class="coords-grid">
              <div class="field">
                <label class="section-label">
                  Latitud
                </label>

                <input
                  type="number"
                  step="any"
                  class="field-control"
                  :value="
                    customOriginCoords?.lat ?? ''
                  "
                  placeholder="21.885300"
                  @input="
                    updateCoordinate(
                      'lat',
                      $event.target.value
                    )
                  "
                />
              </div>

              <div class="field">
                <label class="section-label">
                  Longitud
                </label>

                <input
                  type="number"
                  step="any"
                  class="field-control"
                  :value="
                    customOriginCoords?.lng ?? ''
                  "
                  placeholder="-102.291600"
                  @input="
                    updateCoordinate(
                      'lng',
                      $event.target.value
                    )
                  "
                />
              </div>
            </div>
          </details>
        </div>
      </div>

      <!-- ===================================================
           3. UNIDADES
      ==================================================== -->
      <div class="control-card">
        <div class="control-heading">
          <span class="control-number">
            3
          </span>

          <div>
            <strong>
              Unidades de la ruta
            </strong>

            <small>
              Añade únicamente las unidades que deseas visitar.
            </small>
          </div>
        </div>

        <div class="cart-actions-top">
          <button
            type="button"
            class="btn-add"
            @click="
              emit('add-stops')
            "
          >
            <span class="button-plus">
              +
            </span>

            Añadir unidades
          </button>

          <button
            type="button"
            class="btn-secondary"
            :disabled="
              !customPoints.length
            "
            @click="
              emit('clear')
            "
          >
            Limpiar
          </button>
        </div>
      </div>
    </div>

    <!-- =====================================================
         SIN UNIDADES
    ====================================================== -->
    <div
      v-if="
        !customPoints.length
      "
      class="empty"
    >
      <div class="empty-icon">
        +
      </div>

      <strong>
        No hay unidades añadidas
      </strong>

      <small>
        Usa “Añadir unidades” para construir
        una ruta personalizada.
      </small>
    </div>

    <!-- =====================================================
         LISTA DE UNIDADES
    ====================================================== -->
    <div
      v-else
      class="cart-list"
      @dragover.prevent
      @drop="onDrop"
    >
      <div class="list-header">
        <span>
          Orden de visita
        </span>

        <small>
          Arrastra para reordenar
        </small>
      </div>

      <div
        v-for="(point, index) in customPoints"
        :key="point.id"
        class="cart-item"
        draggable="true"
        @dragstart="
          onDragStart(index)
        "
        @dragenter.prevent="
          onDragEnter(index)
        "
      >
        <div class="sequence-number">
          {{ index + 1 }}
        </div>

        <span
          class="drag-handle"
          title="Arrastrar"
        >
          ⣿
        </span>

        <div class="info">
          <b>
            {{
              point.clues ||
              point.name
            }}
          </b>

          <div class="unidad">
            {{
              point.unidad ||
              'Sin nombre de unidad'
            }}
          </div>

          <div class="meta">
            <span
              v-if="
                point.region
              "
              class="badge"
            >
              {{ point.region }}
            </span>

            <span
              v-if="
                point.hard
              "
              class="badge-hard"
            >
              Difícil acceso
            </span>
          </div>
        </div>

        <button
          type="button"
          class="btn-remove"
          title="Quitar unidad"
          aria-label="Quitar unidad"
          @click="
            remove(index)
          "
        >
          ✕
        </button>
      </div>
    </div>

    <!-- =====================================================
         ACCIONES FINALES
    ====================================================== -->
    <div class="cart-actions-bottom">
      <div class="calculation-status">
        <span
          class="status-dot"
          :class="{
            ready: canCalculate
          }"
        ></span>

        <span>
          {{ statusText }}
        </span>
      </div>

      <button
        type="button"
        class="btn-primary"
        :disabled="
          !canCalculate
        "
        @click="
          emit('calculate')
        "
      >
        Calcular ruta personalizada
      </button>

      <button
        type="button"
        class="btn-pdf"
        :disabled="
          !canGeneratePdf
        "
        @click="
          emit('generate-pdf')
        "
      >
        Plan de trabajo PDF
      </button>
    </div>
  </section>
</template>

<script setup>
import {
  computed,
  ref,
} from 'vue'

const props =
  defineProps({
    customPoints: {
      type: Array,
      required: true,
    },

    customStrategy: {
      type: String,
      default: 'FASTEST',
    },

    customOriginMode: {
      type: String,
      default: 'first',
    },

    customOriginPharmacyId: {
      type: [
        Number,
        String,
      ],

      default: null,
    },

    customOriginCoords: {
      type: Object,

      default:
        () => ({
          lat: '',
          lng: '',
        }),
    },

    customOriginCandidates: {
      type: Array,

      default:
        () => [],
    },

    canGeneratePdf: {
      type: Boolean,
      default: false,
    },
  })

const emit =
  defineEmits([
    'update:customPoints',
    'update:customStrategy',
    'update:customOriginMode',
    'update:customOriginPharmacyId',
    'update:customOriginCoords',

    'add-stops',
    'clear',
    'calculate',
    'generate-pdf',
  ])

/*
 * ============================================================
 * DRAG & DROP
 * ============================================================
 */

let dragIdx =
  -1

function onDragStart(
  index
) {
  dragIdx =
    index
}

function onDragEnter(
  index
) {
  if (
    dragIdx === -1 ||
    dragIdx === index
  ) {
    return
  }

  const items = [
    ...props.customPoints,
  ]

  const item =
    items.splice(
      dragIdx,
      1
    )[0]

  items.splice(
    index,
    0,
    item
  )

  dragIdx =
    index

  emit(
    'update:customPoints',
    items
  )
}

function onDrop() {
  dragIdx =
    -1
}

function remove(
  index
) {
  const items = [
    ...props.customPoints,
  ]

  items.splice(
    index,
    1
  )

  emit(
    'update:customPoints',
    items
  )
}

/*
 * ============================================================
 * BUSCADOR DE ORIGEN
 * ============================================================
 */

const searchText =
  ref('')

const searching =
  ref(false)

const searchError =
  ref('')

const searchResults =
  ref([])

const selectedSearchResultId =
  ref(null)

const selectedSearchName =
  ref('')

const hasValidCoords =
  computed(
    () => {
      const lat =
        Number(
          props.customOriginCoords?.lat
        )

      const lng =
        Number(
          props.customOriginCoords?.lng
        )

      return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      )
    }
  )

function updateCoordinate(
  key,
  value
) {
  selectedSearchResultId.value =
    null

  selectedSearchName.value =
    ''

  emit(
    'update:customOriginCoords',
    {
      ...props.customOriginCoords,

      [key]:
        value,
    }
  )
}

async function searchPlace() {
  const query =
    String(
      searchText.value ||
      ''
    ).trim()

  if (
    !query ||
    searching.value
  ) {
    return
  }

  searching.value =
    true

  searchError.value =
    ''

  searchResults.value =
    []

  selectedSearchResultId.value =
    null

  try {
    if (
      !window.google?.maps
    ) {
      throw new Error(
        'Google Maps todavía no está disponible.'
      )
    }

    let results =
      []

    /*
     * Intentar primero Places.
     */
    try {
      results =
        await searchWithPlaces(
          query
        )
    } catch (
      placesError
    ) {
      console.warn(
        '[RouteCart] Places no disponible; usando Geocoder:',
        placesError
      )
    }

    /*
     * Respaldo con Geocoder.
     */
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
        'No se encontraron resultados. Prueba con un nombre o dirección más específica.'
    }
  } catch (
    error
  ) {
    console.error(
      '[RouteCart][searchPlace]',
      error
    )

    searchError.value =
      error?.message ||
      'No fue posible buscar el origen.'
  } finally {
    searching.value =
      false
  }
}

/*
 * ============================================================
 * GOOGLE PLACES
 * ============================================================
 */

async function searchWithPlaces(
  rawQuery
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
        `${rawQuery}, México`,

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
        5,
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
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          return null
        }

        const name =
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

          name,

          address:
            place?.formattedAddress ||
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

/*
 * ============================================================
 * GOOGLE GEOCODER
 * ============================================================
 */

async function searchWithGeocoder(
  rawQuery
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
              `${rawQuery}, México`,

            region:
              'MX',
          },

          (
            geocoderResults,
            status
          ) => {
            if (
              status === 'OK' ||
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
      5
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
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          return null
        }

        const name =
          result
            ?.address_components
            ?.[0]
            ?.long_name ||
          result
            ?.formatted_address ||
          `Resultado ${index + 1}`

        return {
          id:
            `geo-${index}-${lat}-${lng}`,

          name,

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

/*
 * ============================================================
 * SELECCIONAR RESULTADO
 * ============================================================
 */

function selectSearchResult(
  result
) {
  if (
    !result
  ) {
    return
  }

  emit(
    'update:customOriginCoords',
    {
      lat:
        Number(
          result.lat
        ),

      lng:
        Number(
          result.lng
        ),
    }
  )

  emit(
    'update:customOriginMode',
    'coords'
  )

  selectedSearchResultId.value =
    result.id

  selectedSearchName.value =
    result.name ||
    'Origen seleccionado'
}

/*
 * ============================================================
 * VALIDACIÓN
 * ============================================================
 */

const hasValidOrigin =
  computed(
    () => {
      if (
        props.customOriginMode ===
        'first'
      ) {
        return (
          props.customPoints.length >
          0
        )
      }

      if (
        props.customOriginMode ===
        'pharmacy'
      ) {
        return Boolean(
          props.customOriginPharmacyId &&
          props.customOriginCandidates
            .some(
              candidate =>
                Number(
                  candidate.id
                ) ===
                Number(
                  props.customOriginPharmacyId
                )
            )
        )
      }

      if (
        props.customOriginMode ===
        'coords'
      ) {
        return hasValidCoords.value
      }

      return false
    }
  )

const canCalculate =
  computed(
    () =>
      Boolean(
        props.customPoints.length &&
        hasValidOrigin.value
      )
  )

const statusText =
  computed(
    () => {
      if (
        !props.customPoints.length
      ) {
        return 'Añade al menos una unidad.'
      }

      if (
        props.customOriginMode ===
          'pharmacy' &&
        !hasValidOrigin.value
      ) {
        return 'Selecciona la unidad de inicio.'
      }

      if (
        props.customOriginMode ===
          'coords' &&
        !hasValidCoords.value
      ) {
        return 'Busca o captura un origen válido.'
      }

      return 'Ruta lista para calcular.'
    }
  )
</script>

<style scoped>
/*
 * ============================================================
 * BASE
 * ============================================================
 */

.route-cart {
  margin-bottom:
    12px;

  color:
    #0f172a;

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
 * HEADER
 * ============================================================
 */

.cart-header {
  display: flex;

  align-items:
    flex-start;

  justify-content:
    space-between;

  gap: 10px;

  margin-bottom:
    12px;
}

.cart-title-block {
  min-width: 0;
}

.cart-kicker {
  margin-bottom:
    3px;

  color:
    #0f64ad;

  font-size:
    9px;

  font-weight:
    850;

  letter-spacing:
    .08em;

  text-transform:
    uppercase;
}

.cart-header h5 {
  margin:
    0
    0
    4px;

  color:
    #0f172a;

  font-size:
    15px;

  font-weight:
    850;

  line-height:
    1.2;
}

.subtext {
  margin: 0;

  color:
    #64748b;

  font-size:
    10px;

  line-height:
    1.4;
}

.count {
  flex:
    0
    0
    auto;

  padding:
    5px
    8px;

  border:
    1px solid #e2e8f0;

  border-radius:
    999px;

  background:
    #f8fafc;

  color:
    #64748b;

  font-size:
    9px;

  font-weight:
    750;

  white-space:
    nowrap;
}

.count.active {
  border-color:
    #bfdbfe;

  background:
    #eff8ff;

  color:
    #0f64ad;
}

/*
 * ============================================================
 * CONTROLES
 * ============================================================
 */

.cart-controls {
  display: grid;

  gap: 9px;

  margin:
    0
    0
    10px;
}

.control-card {
  padding:
    10px;

  border:
    1px solid #e2e8f0;

  border-radius:
    11px;

  background:
    #ffffff;
}

.control-heading {
  display: flex;

  align-items:
    center;

  gap: 8px;

  margin-bottom:
    9px;
}

.control-number {
  display: grid;

  width: 24px;
  height: 24px;

  flex:
    0
    0
    24px;

  place-items:
    center;

  border-radius:
    7px;

  background:
    #eaf4fc;

  color:
    #0f64ad;

  font-size:
    10px;

  font-weight:
    900;
}

.control-heading > div {
  display: flex;

  min-width: 0;

  flex-direction:
    column;

  gap: 1px;
}

.control-heading strong {
  color:
    #1e293b;

  font-size:
    11px;

  font-weight:
    800;
}

.control-heading small {
  color:
    #64748b;

  font-size:
    9px;

  line-height:
    1.25;
}

.section-label {
  display: block;

  margin-bottom:
    5px;

  color:
    #334155;

  font-size:
    10px;

  font-weight:
    800;
}

/*
 * ============================================================
 * CAMPOS
 * ============================================================
 */

.field-control {
  width: 100%;

  min-height:
    38px;

  box-sizing:
    border-box;

  padding:
    7px
    9px;

  border:
    1px solid #cbd5e1;

  border-radius:
    8px;

  outline:
    none;

  background:
    #ffffff !important;

  color:
    #0f172a !important;

  font-size:
    11px;

  line-height:
    1.3;

  transition:
    border-color .15s ease,
    box-shadow .15s ease;
}

.field-control:hover:not(:disabled) {
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
        .11
      );
}

.field-control:disabled {
  background:
    #f1f5f9 !important;

  color:
    #94a3b8 !important;

  cursor:
    not-allowed;
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

  margin-top:
    5px;

  color:
    #64748b;

  font-size:
    9px;

  line-height:
    1.35;
}

/*
 * ============================================================
 * OPCIONES ORIGEN
 * ============================================================
 */

.origin-options {
  display: grid;

  grid-template-columns:
    repeat(
      3,
      minmax(
        0,
        1fr
      )
    );

  gap: 5px;
}

.origin-option {
  display: flex;

  min-width: 0;

  min-height:
    58px;

  align-items:
    center;

  gap: 6px;

  padding:
    7px;

  border:
    1px solid #e2e8f0;

  border-radius:
    9px;

  background:
    #ffffff;

  color:
    #334155;

  cursor:
    pointer;

  transition:
    border-color .15s ease,
    background .15s ease;
}

.origin-option:hover {
  border-color:
    #bfdbfe;

  background:
    #f8fbff;
}

.origin-option.selected {
  border-color:
    #60a5fa;

  background:
    #eff8ff;
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

.origin-option-icon {
  display: grid;

  width: 25px;
  height: 25px;

  flex:
    0
    0
    25px;

  place-items:
    center;

  border-radius:
    7px;

  background:
    #eaf4fc;

  color:
    #0f64ad;

  font-size:
    9px;

  font-weight:
    900;
}

.origin-option-copy {
  display: flex;

  min-width: 0;

  flex-direction:
    column;

  gap: 1px;
}

.origin-option-copy strong {
  overflow:
    hidden;

  color:
    #1e293b;

  font-size:
    9px;

  font-weight:
    800;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.origin-option-copy small {
  display:
    -webkit-box;

  overflow:
    hidden;

  color:
    #64748b;

  font-size:
    8px;

  line-height:
    1.2;

  -webkit-box-orient:
    vertical;

  -webkit-line-clamp:
    2;

  line-clamp:
    2;
}

.origin-detail-panel {
  margin-top:
    9px;

  padding:
    9px;

  border:
    1px solid #e2e8f0;

  border-radius:
    9px;

  background:
    #f8fafc;
}

/*
 * ============================================================
 * BUSCADOR
 * ============================================================
 */

.search-row {
  display: grid;

  grid-template-columns:
    minmax(
      0,
      1fr
    )
    auto;

  gap: 6px;
}

.btn-search {
  min-width:
    72px;

  min-height:
    38px;

  padding:
    0
    10px;

  border:
    1px solid #0f64ad;

  border-radius:
    8px;

  background:
    #0f64ad;

  color:
    #ffffff !important;

  cursor:
    pointer;

  font-size:
    9px;

  font-weight:
    850;
}

.btn-search:hover:not(:disabled) {
  background:
    #0b568f;

  border-color:
    #0b568f;
}

.btn-search:disabled {
  border-color:
    #cbd5e1;

  background:
    #e2e8f0;

  color:
    #94a3b8 !important;

  cursor:
    not-allowed;
}

.search-error {
  margin-top:
    7px;

  padding:
    7px
    8px;

  border:
    1px solid #fecaca;

  border-radius:
    8px;

  background:
    #fff1f2;

  color:
    #b91c1c;

  font-size:
    9px;

  line-height:
    1.35;
}

.search-results {
  display: grid;

  gap: 5px;

  margin-top:
    8px;
}

.search-result {
  display: flex;

  width: 100%;

  min-width: 0;

  align-items:
    center;

  gap: 6px;

  padding:
    7px;

  border:
    1px solid #dbe4ee;

  border-radius:
    8px;

  background:
    #ffffff;

  color:
    #1e293b;

  cursor:
    pointer;

  text-align:
    left;
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

.search-result-icon {
  display: grid;

  width: 22px;
  height: 22px;

  flex:
    0
    0
    22px;

  place-items:
    center;

  border-radius:
    6px;

  background:
    #eaf4fc;

  color:
    #0f64ad;

  font-size:
    15px;
}

.search-result-copy {
  display: flex;

  min-width: 0;

  flex: 1;

  flex-direction:
    column;

  gap: 1px;
}

.search-result-copy strong,
.search-result-copy small {
  overflow:
    hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.search-result-copy strong {
  color:
    #1e293b;

  font-size:
    9px;
}

.search-result-copy small {
  color:
    #64748b;

  font-size:
    8px;
}

.search-result-action {
  flex:
    0
    0
    auto;

  color:
    #0f64ad;

  font-size:
    8px;

  font-weight:
    850;
}

/*
 * ============================================================
 * ORIGEN SELECCIONADO
 * ============================================================
 */

.origin-selected {
  display: flex;

  align-items:
    center;

  gap: 7px;

  margin-top:
    8px;

  padding:
    7px
    8px;

  border:
    1px solid #bbf7d0;

  border-radius:
    8px;

  background:
    #f0fdf4;
}

.origin-selected-icon {
  display: grid;

  width: 22px;
  height: 22px;

  flex:
    0
    0
    22px;

  place-items:
    center;

  border-radius:
    7px;

  background:
    #dcfce7;

  color:
    #15803d;

  font-size:
    10px;

  font-weight:
    900;
}

.origin-selected > div {
  display: flex;

  min-width: 0;

  flex-direction:
    column;

  gap: 1px;
}

.origin-selected strong {
  color:
    #166534;

  font-size:
    9px;
}

.origin-selected small {
  color:
    #64748b;

  font-size:
    8px;
}

/*
 * ============================================================
 * COORDENADAS
 * ============================================================
 */

.manual-coordinates {
  margin-top:
    8px;

  padding-top:
    7px;

  border-top:
    1px solid #e2e8f0;
}

.manual-coordinates summary {
  color:
    #0f64ad;

  cursor:
    pointer;

  font-size:
    9px;

  font-weight:
    800;
}

.coords-grid {
  display: grid;

  grid-template-columns:
    1fr
    1fr;

  gap: 7px;

  margin-top:
    7px;
}

.field label {
  display: block;

  margin-bottom:
    4px;
}

/*
 * ============================================================
 * AÑADIR / LIMPIAR
 * ============================================================
 */

.cart-actions-top {
  display: flex;

  gap: 6px;
}

.btn-add,
.btn-secondary {
  min-height:
    36px;

  border-radius:
    8px;

  cursor:
    pointer;

  font-size:
    9px;

  font-weight:
    800;
}

.btn-add {
  display: inline-flex;

  flex: 1;

  align-items:
    center;

  justify-content:
    center;

  gap: 5px;

  padding:
    0
    11px;

  border:
    1px solid #0f64ad;

  background:
    #eff8ff;

  color:
    #0f64ad !important;
}

.btn-add:hover {
  background:
    #dff1ff;
}

.button-plus {
  font-size:
    15px;

  line-height:
    1;
}

.btn-secondary {
  padding:
    0
    10px;

  border:
    1px solid #cbd5e1;

  background:
    #ffffff;

  color:
    #475569 !important;
}

.btn-secondary:hover:not(:disabled) {
  background:
    #f8fafc;

  color:
    #1e293b !important;
}

/*
 * ============================================================
 * VACÍO
 * ============================================================
 */

.empty {
  display: flex;

  flex-direction:
    column;

  align-items:
    center;

  gap: 3px;

  padding:
    14px
    10px;

  border:
    1px dashed #cbd5e1;

  border-radius:
    10px;

  background:
    #f8fafc;

  text-align:
    center;
}

.empty-icon {
  display: grid;

  width: 28px;
  height: 28px;

  margin-bottom:
    2px;

  place-items:
    center;

  border-radius:
    8px;

  background:
    #eaf4fc;

  color:
    #0f64ad;

  font-size:
    17px;

  font-weight:
    500;
}

.empty strong {
  color:
    #475569;

  font-size:
    10px;
}

.empty small {
  color:
    #94a3b8;

  font-size:
    8px;

  line-height:
    1.35;
}

/*
 * ============================================================
 * LISTA
 * ============================================================
 */

.cart-list {
  max-height:
    235px;

  overflow:
    auto;

  margin-top:
    7px;

  padding:
    6px;

  border:
    1px solid #dbe4ee;

  border-radius:
    10px;

  background:
    #f8fafc;
}

.list-header {
  display: flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap: 8px;

  padding:
    1px
    3px
    6px;
}

.list-header span {
  color:
    #475569;

  font-size:
    9px;

  font-weight:
    800;
}

.list-header small {
  color:
    #94a3b8;

  font-size:
    8px;
}

.cart-item {
  display: flex;

  align-items:
    flex-start;

  gap: 6px;

  padding:
    7px;

  margin-bottom:
    5px;

  border:
    1px solid #e2e8f0;

  border-radius:
    8px;

  background:
    #ffffff;

  cursor:
    grab;
}

.cart-item:last-child {
  margin-bottom:
    0;
}

.sequence-number {
  display: grid;

  width: 23px;
  height: 23px;

  flex:
    0
    0
    23px;

  place-items:
    center;

  border-radius:
    7px;

  background:
    #0f64ad;

  color:
    #ffffff !important;

  font-size:
    9px;

  font-weight:
    900;
}

.drag-handle {
  padding-top:
    3px;

  color:
    #94a3b8;

  font-size:
    10px;

  user-select:
    none;
}

.info {
  min-width: 0;

  flex: 1;
}

.info b {
  display: block;

  overflow:
    hidden;

  color:
    #1e293b;

  font-size:
    9px;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.unidad {
  overflow:
    hidden;

  margin-top:
    2px;

  color:
    #475569;

  font-size:
    8px;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.meta {
  display: flex;

  flex-wrap:
    wrap;

  gap: 4px;

  margin-top:
    5px;
}

.badge,
.badge-hard {
  padding:
    2px
    5px;

  border-radius:
    999px;

  font-size:
    7px;

  font-weight:
    700;
}

.badge {
  border:
    1px solid #cbd5e1;

  background:
    #ffffff;

  color:
    #475569;
}

.badge-hard {
  border:
    1px solid #fecaca;

  background:
    #fff1f2;

  color:
    #b91c1c;
}

.btn-remove {
  display: grid;

  width: 25px;
  height: 25px;

  flex:
    0
    0
    25px;

  place-items:
    center;

  padding: 0;

  border:
    1px solid transparent;

  border-radius:
    7px;

  background:
    transparent;

  color:
    #94a3b8;

  cursor:
    pointer;

  font-size:
    9px;
}

.btn-remove:hover {
  border-color:
    #fecaca;

  background:
    #fff1f2;

  color:
    #b91c1c;
}

/*
 * ============================================================
 * ACCIONES FINALES
 * ============================================================
 */

.cart-actions-bottom {
  display: grid;

  gap: 6px;

  margin-top:
    10px;
}

.calculation-status {
  display: flex;

  align-items:
    center;

  gap: 6px;

  padding:
    0
    2px;

  color:
    #64748b;

  font-size:
    8px;
}

.status-dot {
  width: 7px;
  height: 7px;

  flex:
    0
    0
    7px;

  border-radius:
    999px;

  background:
    #f59e0b;
}

.status-dot.ready {
  background:
    #22c55e;
}

/*
 * ============================================================
 * BOTONES
 *
 * Ningún botón primario negro.
 * ============================================================
 */

.btn-primary,
.btn-pdf {
  width: 100%;

  min-height:
    39px;

  padding:
    0
    11px;

  border-radius:
    8px;

  cursor:
    pointer;

  font-size:
    10px;

  font-weight:
    850;

  transition:
    background .15s ease,
    border-color .15s ease,
    color .15s ease;
}

.btn-primary {
  border:
    1px solid #0f64ad;

  background:
    #0f64ad;

  color:
    #ffffff !important;
}

.btn-primary:hover:not(:disabled) {
  border-color:
    #0b568f;

  background:
    #0b568f;
}

.btn-pdf {
  border:
    1px solid #cbd5e1;

  background:
    #ffffff;

  color:
    #334155 !important;
}

.btn-pdf:hover:not(:disabled) {
  border-color:
    #94a3b8;

  background:
    #f8fafc;
}

.btn-primary:disabled,
.btn-pdf:disabled,
.btn-secondary:disabled {
  border-color:
    #d9e0e7;

  background:
    #edf1f5;

  color:
    #94a3b8 !important;

  cursor:
    not-allowed;

  opacity:
    1;
}

/*
 * ============================================================
 * RESPONSIVE
 * ============================================================
 */

@media (
  max-width:
    520px
) {
  .origin-options {
    grid-template-columns:
      1fr;
  }

  .origin-option {
    min-height:
      48px;
  }

  .search-row {
    grid-template-columns:
      1fr;
  }

  .btn-search {
    width: 100%;
  }

  .coords-grid {
    grid-template-columns:
      1fr;
  }
}
</style>