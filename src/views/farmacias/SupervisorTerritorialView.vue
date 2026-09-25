<template>
  <main class="territorial-view">
    <div class="territorial-container">
      <!-- =====================================================
           CABECERA
      ====================================================== -->

      <header class="page-header">
        <div class="page-header-copy">
          <span class="page-kicker">
            Farmacias
          </span>

          <h1>
            Ruta territorial
          </h1>

          <p>
            Carga teórica de todas las unidades permanentes
            de cada supervisor. Una ruta continua, sin división
            en jornadas.
          </p>
        </div>

        <div class="page-actions">
          <button
            type="button"
            class="button secondary"
            :disabled="busy"
            @click="load"
          >
            Actualizar supervisores
          </button>

          <button
            type="button"
            class="button primary"
            :disabled="
              busy ||
              !supervisors.length
            "
            @click="calculateAll"
          >
            Calcular todos
          </button>

          <button
            v-if="batch"
            type="button"
            class="button secondary"
            :disabled="busy"
            @click="report(batch)"
          >
            Reporte general PDF
          </button>
        </div>
      </header>

      <!-- =====================================================
           MENSAJES
      ====================================================== -->

      <div
        v-if="error"
        class="message error-message"
        role="alert"
      >
        <strong>
          No fue posible completar la operación
        </strong>

        <span>
          {{ error }}
        </span>
      </div>

      <div
        v-if="notice"
        class="message notice-message"
        role="status"
      >
        <strong>
          Información
        </strong>

        <span>
          {{ notice }}
        </span>
      </div>

      <div
        v-if="busy"
        class="progress-card"
        role="status"
      >
        <div class="spinner"></div>

        <div>
          <strong>
            Procesando
          </strong>

          <span>
            {{ progress }}
          </span>
        </div>
      </div>

      <div
        v-if="
          !busy &&
          !supervisors.length
        "
        class="empty-card"
      >
        <div class="empty-icon">
          0
        </div>

        <strong>
          Sin supervisores disponibles
        </strong>

        <span>
          No hay supervisores dentro de tu alcance
          completo de jerarquía y estados.
        </span>
      </div>

      <!-- =====================================================
           RESUMEN GENERAL
      ====================================================== -->

      <section
        v-if="batch"
        class="panel batch-panel"
      >
        <header class="panel-header">
          <div>
            <span>
              Resultado general
            </span>

            <h2>
              Comparativo territorial
            </h2>
          </div>

          <span class="panel-status">
            {{
              batch.summary.supervisorsCalculated
            }}
            calculados
          </span>
        </header>

        <div class="summary-grid">
          <article class="metric-card">
            <span>
              Supervisores
            </span>

            <strong>
              {{
                batch.summary.supervisorsConsidered
              }}
            </strong>

            <small>
              Dentro del alcance
            </small>
          </article>

          <article class="metric-card success">
            <span>
              Calculados
            </span>

            <strong>
              {{
                batch.summary.supervisorsCalculated
              }}
            </strong>

            <small>
              Con resultado
            </small>
          </article>

          <article
            class="metric-card"
            :class="{
              danger:
                batch.summary.supervisorsWithError >
                0
            }"
          >
            <span>
              Con error
            </span>

            <strong>
              {{
                batch.summary.supervisorsWithError
              }}
            </strong>

            <small>
              Requieren revisión
            </small>
          </article>

          <article class="metric-card">
            <span>
              Unidades
            </span>

            <strong>
              {{
                batch.summary.totalUnits
              }}
            </strong>

            <small>
              Consideradas
            </small>
          </article>

          <article class="metric-card">
            <span>
              Kilómetros
            </span>

            <strong>
              {{
                km(
                  batch.summary.distanceMeters
                )
              }}
            </strong>

            <small>
              Acumulados
            </small>
          </article>

          <article class="metric-card">
            <span>
              Conducción
            </span>

            <strong class="metric-time">
              {{
                time(
                  batch.summary.drivingSeconds
                )
              }}
            </strong>

            <small>
              Tiempo acumulado
            </small>
          </article>
        </div>

        <div class="batch-insights">
          <div>
            <span>
              Promedio
            </span>

            <strong>
              {{
                batch.summary.averageKmPerSupervisor
                  ?.toFixed(1) ??
                '—'
              }}
              km por supervisor
            </strong>
          </div>

          <div>
            <span>
              Mayor carga
            </span>

            <strong>
              {{
                batch.summary.highestLoad
                  ?.nombre ||
                '—'
              }}
            </strong>
          </div>

          <div>
            <span>
              Menor carga
            </span>

            <strong>
              {{
                batch.summary.lowestLoad
                  ?.nombre ||
                '—'
              }}
            </strong>
          </div>
        </div>

        <p class="panel-note">
          Los totales de distancia y tiempo incluyen
          únicamente cálculos correctos; pueden excluir
          unidades sin coordenadas. Cada resultado conserva
          su propio origen.
        </p>
      </section>

      <!-- =====================================================
           TABLA DE SUPERVISORES
      ====================================================== -->

      <section class="panel supervisors-panel">
        <header class="panel-header">
          <div>
            <span>
              Planeación territorial
            </span>

            <h2>
              Supervisores
            </h2>
          </div>

          <span class="panel-status neutral">
            {{ supervisors.length }}
            registros
          </span>
        </header>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  Supervisor
                </th>

                <th>
                  Unidades
                </th>

                <th>
                  Punto de inicio
                </th>

                <th>
                  Km
                </th>

                <th>
                  Conducción
                </th>

                <th>
                  Regreso
                </th>

                <th>
                  Estado
                </th>

                <th class="actions-column">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="s in supervisors"
                :key="s.id"
              >
                <td>
                  <div class="supervisor-cell">
                    <div class="supervisor-avatar">
                      {{
                        String(
                          s.nombre ||
                          '?'
                        )
                          .trim()
                          .charAt(0)
                          .toUpperCase()
                      }}
                    </div>

                    <strong>
                      {{ s.nombre }}
                    </strong>
                  </div>
                </td>

                <td>
                  <strong class="numeric-value">
                    {{ s.units_count }}
                  </strong>
                </td>

                <td>
                  <span class="origin-name">
                    {{
                      results[s.id]
                        ?.origin
                        ?.name ||
                      s.origin?.name ||
                      'Sin configurar'
                    }}
                  </span>
                </td>

                <td>
                  <strong class="numeric-value">
                    {{
                      km(
                        results[s.id]
                          ?.distanceMeters
                      )
                    }}
                  </strong>
                </td>

                <td>
                  <span class="table-secondary">
                    {{
                      time(
                        results[s.id]
                          ?.drivingSeconds
                      )
                    }}
                  </span>
                </td>

                <td>
                  <span class="table-secondary">
                    {{
                      results[s.id]
                        ? (
                            results[s.id]
                              .returnToOrigin
                              ? 'Sí'
                              : 'No'
                          )
                        : 'Sí (predeterminado)'
                    }}
                  </span>
                </td>

                <td>
                  <div class="status-cell">
                    <span
                      class="result-status"
                      :class="{
                        success:
                          results[s.id]?.status &&
                          results[s.id]?.status !==
                            'ERROR',

                        error:
                          results[s.id]?.status ===
                          'ERROR',

                        pending:
                          !results[s.id],
                      }"
                    >
                      {{
                        results[s.id]
                          ?.status ||
                        'Pendiente'
                      }}
                    </span>

                    <small
                      v-if="
                        results[s.id]?.error
                      "
                    >
                      {{
                        results[s.id]
                          .error
                          .message
                      }}
                    </small>
                  </div>
                </td>

                <td>
                  <div class="row-actions">
                    <button
                      type="button"
                      class="table-action"
                      :disabled="busy"
                      @click="
                        selectSupervisor(s)
                      "
                    >
                      Configurar / detalle
                    </button>

                    <button
                      type="button"
                      class="table-action primary"
                      :disabled="busy"
                      @click="
                        calculateOne(s)
                      "
                    >
                      Calcular ruta
                    </button>

                    <button
                      v-if="
                        results[s.id] &&
                        results[s.id]
                          .status !==
                          'ERROR'
                      "
                      type="button"
                      class="table-action"
                      :disabled="busy"
                      @click="
                        showResult(
                          results[s.id]
                        )
                      "
                    >
                      Ver recorrido y mapa
                    </button>

                    <button
                      v-if="results[s.id]"
                      type="button"
                      class="table-action"
                      :disabled="busy"
                      @click="
                        report({
                          results: [
                            results[s.id],
                          ],
                        })
                      "
                    >
                      Reporte PDF
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- =====================================================
           CONFIGURAR ORIGEN
      ====================================================== -->

      <section
        v-if="territory"
        class="panel configuration-panel"
      >
        <header class="panel-header">
          <div>
            <span>
              Configuración territorial
            </span>

            <h2>
              {{
                territory.supervisor
                  .nombre
              }}
            </h2>
          </div>

          <span class="panel-status neutral">
            {{
              territory.units.length
            }}
            unidades
          </span>
        </header>

        <div class="configuration-intro">
          <strong>
            Punto de inicio habitual
          </strong>

          <span>
            El origen habitual pertenece al supervisor.
            Guardarlo lo aplicará al siguiente cálculo general.
          </span>
        </div>

        <form
          class="origin-form"
          @submit.prevent="saveOrigin"
        >
          <fieldset :disabled="busy">
            <div class="origin-choice-grid">
              <label>
                <span>
                  Elegir origen
                </span>

                <select
                  v-model="originMode"
                  @change="chooseOrigin"
                >
                  <option value="saved">
                    Origen habitual guardado
                  </option>

                  <option value="unit">
                    Una unidad asignada
                  </option>

                  <option value="custom">
                    Otra ubicación / Google Places
                  </option>
                </select>
              </label>

              <label
                v-if="
                  originMode ===
                  'unit'
                "
              >
                <span>
                  Unidad
                </span>

                <select
                  v-model="unitId"
                  @change="chooseUnit"
                >
                  <option value="">
                    Selecciona una unidad
                  </option>

                  <option
                    v-for="u in territory.units.filter(
                      validPoint
                    )"
                    :key="u.id"
                    :value="String(u.id)"
                  >
                    {{ u.name }} · {{ u.clues }}
                  </option>
                </select>
              </label>
            </div>

            <div
              v-show="
                originMode ===
                'custom'
              "
              ref="placesEl"
              class="places"
            >
              <span>
                Buscar dirección con Google Places
              </span>
            </div>

            <div class="fields">
              <label>
                <span>
                  Nombre
                </span>

                <input
                  v-model="origin.name"
                  required
                  maxlength="200"
                >
              </label>

              <label>
                <span>
                  Dirección
                </span>

                <input
                  v-model="origin.address"
                  maxlength="2000"
                >
              </label>

              <label>
                <span>
                  Latitud
                </span>

                <input
                  v-model="origin.lat"
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  required
                  @input="
                    origin.google_place_id =
                      null
                  "
                >
              </label>

              <label>
                <span>
                  Longitud
                </span>

                <input
                  v-model="origin.lng"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  required
                  @input="
                    origin.google_place_id =
                      null
                  "
                >
              </label>
            </div>

            <label class="check">
              <input
                v-model="returnToOrigin"
                type="checkbox"
              >

              <span>
                Regresar al punto de inicio
              </span>
            </label>

            <div class="form-actions">
              <button
                type="submit"
                class="button secondary"
              >
                Guardar origen habitual
              </button>

              <button
                type="button"
                class="button primary"
                @click="calculateSelected"
              >
                Calcular con este origen
              </button>
            </div>
          </fieldset>
        </form>

        <div class="territory-data-summary">
          <div>
            <span>
              Unidades asignadas
            </span>

            <strong>
              {{
                territory.units.length
              }}
            </strong>
          </div>

          <div
            :class="{
              warning:
                territory.units.filter(
                  u => !validPoint(u)
                ).length >
                0
            }"
          >
            <span>
              Sin coordenadas válidas
            </span>

            <strong>
              {{
                territory.units.filter(
                  u => !validPoint(u)
                ).length
              }}
            </strong>
          </div>
        </div>

        <div
          v-if="
            territory.units.some(
              u => !validPoint(u)
            )
          "
          class="missing-coordinates"
        >
          <strong>
            Unidades excluidas por coordenadas
          </strong>

          <ul>
            <li
              v-for="u in territory.units.filter(
                u => !validPoint(u)
              )"
              :key="u.id"
            >
              {{ u.clues }} ·
              {{ u.name }} —
              sin coordenadas válidas
            </li>
          </ul>
        </div>
      </section>

      <!-- =====================================================
           RECORRIDO
      ====================================================== -->

      <section
        v-if="selectedResult"
        class="panel result-panel"
      >
        <header class="panel-header">
          <div>
            <span>
              Resultado territorial
            </span>

            <h2>
              {{
                selectedResult
                  .supervisor
                  .nombre
              }}
            </h2>
          </div>

          <span class="panel-status success">
            Recorrido calculado
          </span>
        </header>

        <div class="result-metrics">
          <article>
            <span>
              Distancia
            </span>

            <strong>
              {{
                km(
                  selectedResult.distanceMeters
                )
              }}
              km
            </strong>
          </article>

          <article>
            <span>
              Conducción
            </span>

            <strong>
              {{
                time(
                  selectedResult.drivingSeconds
                )
              }}
            </strong>
          </article>

          <article>
            <span>
              Unidades consideradas
            </span>

            <strong>
              {{
                selectedResult.consideredUnits
              }}
              /
              {{
                selectedResult.totalUnits
              }}
            </strong>
          </article>

          <article>
            <span>
              Regreso al origen
            </span>

            <strong>
              {{
                selectedResult.returnToOrigin
                  ? 'Sí'
                  : 'No'
              }}
            </strong>
          </article>
        </div>

        <div class="origin-summary">
          <div>
            <span>
              Origen
            </span>

            <strong>
              {{
                selectedResult.origin.name
              }}
            </strong>

            <small>
              {{
                selectedResult.origin.address
              }}
            </small>
          </div>

          <div>
            <span>
              Calculado
            </span>

            <strong>
              {{
                selectedResult.calculatedAt
              }}
            </strong>
          </div>
        </div>

        <div
          v-if="
            selectedResult.warnings
              ?.length
          "
          class="warnings-box"
        >
          <strong>
            Observaciones del cálculo
          </strong>

          <ul>
            <li
              v-for="warning in selectedResult.warnings"
              :key="warning"
            >
              {{ warning }}
            </li>
          </ul>
        </div>

        <p
          v-if="mapError"
          class="message error-message"
          role="alert"
        >
          {{ mapError }}
        </p>

        <div
          ref="mapEl"
          class="route-map"
          aria-label="Mapa de la ruta calculada por backend"
        ></div>

        <div class="sequence-section">
          <header>
            <div>
              <span>
                Secuencia
              </span>

              <strong>
                Recorrido calculado
              </strong>
            </div>

            <small>
              {{
                selectedResult.sequence.length
              }}
              paradas
            </small>
          </header>

          <div class="sequence-origin">
            <span class="sequence-marker origin">
              O
            </span>

            <div>
              <strong>
                Inicio
              </strong>

              <span>
                {{
                  selectedResult.origin.name
                }}
              </span>
            </div>
          </div>

          <ol class="sequence-list">
            <li
              v-for="u in selectedResult.sequence"
              :key="u.id"
            >
              <div>
                <strong>
                  {{ u.name }}
                </strong>

                <span>
                  {{ u.clues }} ·
                  {{ u.estado }} /
                  {{ u.proyecto }}
                </span>
              </div>
            </li>
          </ol>

          <div
            v-if="
              selectedResult.returnToOrigin
            "
            class="sequence-origin return"
          >
            <span class="sequence-marker origin">
              O
            </span>

            <div>
              <strong>
                Regreso
              </strong>

              <span>
                {{
                  selectedResult.origin.name
                }}
              </span>
            </div>
          </div>
        </div>

        <div
          v-if="
            selectedResult
              .missingCoordinates
              ?.length
          "
          class="missing-coordinates"
        >
          <strong>
            Excluidas del cálculo
          </strong>

          <ul>
            <li
              v-for="u in selectedResult.missingCoordinates"
              :key="u.id"
            >
              {{ u.name }} ·
              {{ u.clues }}
            </li>
          </ul>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import {
  ref,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from 'vue'

import {
  territorialApi,
} from '../../services/api.js'

import {
  exportTerritorialReport,
  territorialKm as km,
  territorialTime as time,
} from '../../utils/territorialReport.js'

const supervisors =
  ref([])

const results =
  ref({})

const batch =
  ref(null)

const territory =
  ref(null)

const selectedResult =
  ref(null)

const busy =
  ref(false)

const error =
  ref('')

const notice =
  ref('')

const progress =
  ref('')

const mapError =
  ref('')

const origin =
  ref({
    name: '',
    address: '',
    lat: '',
    lng: '',
    google_place_id: null,
  })

const originMode =
  ref('saved')

const unitId =
  ref('')

const returnToOrigin =
  ref(true)

const mapEl =
  ref(null)

const placesEl =
  ref(null)

let overlays = []
let map = null
let autocomplete = null
let disposed = false

const validPoint =
  p =>
    p &&
    [p.lat, p.lng]
      .every(
        v =>
          v !== null &&
          v !== undefined &&
          String(v).trim() !== '' &&
          Number.isFinite(Number(v))
      ) &&
    Math.abs(Number(p.lat)) <= 90 &&
    Math.abs(Number(p.lng)) <= 180

async function run(
  message,
  action
) {
  if (
    busy.value
  ) {
    return
  }

  busy.value =
    true

  progress.value =
    message

  error.value =
    ''

  notice.value =
    ''

  try {
    await action()
  } catch (e) {
    error.value =
      e.message ||
      'No fue posible completar la operación'
  } finally {
    busy.value =
      false
  }
}

async function load() {
  await run(
    'Consultando supervisores autorizados…',

    async () => {
      supervisors.value =
        (
          await territorialApi()
        ).supervisors

      results.value =
        {}

      batch.value =
        null

      territory.value =
        null

      selectedResult.value =
        null

      clearMap()
    }
  )
}

function chooseOrigin() {
  unitId.value =
    ''

  origin.value =
    originMode.value ===
      'saved' &&
    territory.value.origin
      ? {
          ...territory.value.origin,
        }
      : {
          name: '',
          address: '',
          lat: '',
          lng: '',
          google_place_id:
            null,
        }
}

function chooseUnit() {
  const unit =
    territory.value.units.find(
      u =>
        String(u.id) ===
        unitId.value
    )

  if (unit) {
    origin.value = {
      name:
        unit.name ||
        unit.clues,

      address:
        unit.address ||
        '',

      lat:
        Number(unit.lat),

      lng:
        Number(unit.lng),

      google_place_id:
        null,
    }
  }
}

async function selectSupervisor(
  s
) {
  await run(
    'Cargando territorio…',

    async () => {
      territory.value =
        await territorialApi(
          `/${s.id}`
        )

      originMode.value =
        territory.value.origin
          ? 'saved'
          : 'custom'

      returnToOrigin.value =
        true

      chooseOrigin()

      await nextTick()

      await setupPlaces()
    }
  )
}

async function setupPlaces() {
  try {
    const {
      PlaceAutocompleteElement,
    } =
      await window.google.maps.importLibrary(
        'places'
      )

    if (
      disposed ||
      !placesEl.value
    ) {
      return
    }

    autocomplete?.remove()

    autocomplete =
      new PlaceAutocompleteElement({
        requestedLanguage:
          'es',
      })

    autocomplete.addEventListener(
      'gmp-select',

      async event => {
        const supervisorId =
          territory.value
            ?.supervisor.id

        if (
          busy.value
        ) {
          return
        }

        await run(
          'Obteniendo coordenadas de Google Places…',

          async () => {
            const place =
              event
                .placePrediction
                .toPlace()

            await place.fetchFields({
              fields: [
                'displayName',
                'formattedAddress',
                'location',
              ],
            })

            if (
              disposed ||
              territory.value
                ?.supervisor.id !==
                supervisorId
            ) {
              return
            }

            if (
              !place.location
            ) {
              throw new Error(
                'El lugar no contiene coordenadas'
              )
            }

            origin.value = {
              name:
                place.displayName ||
                place.formattedAddress,

              address:
                place.formattedAddress ||
                '',

              lat:
                place.location.lat(),

              lng:
                place.location.lng(),

              google_place_id:
                place.id,
            }
          }
        )
      }
    )

    autocomplete.addEventListener(
      'gmp-error',

      () => {
        error.value =
          'Google Places no está disponible. Puedes introducir coordenadas manualmente.'
      }
    )

    placesEl.value.appendChild(
      autocomplete
    )
  } catch {
    notice.value =
      'Google Places no está disponible. Selecciona una unidad o introduce dirección y coordenadas.'
  }
}

async function saveOrigin() {
  await run(
    'Guardando origen habitual…',

    async () => {
      const id =
        territory.value
          .supervisor.id

      const data =
        await territorialApi(
          `/${id}/origin`,
          {
            method:
              'PUT',

            body:
              origin.value,
          }
        )

      territory.value.origin =
        data.origin

      supervisors.value =
        supervisors.value.map(
          s =>
            s.id === id
              ? {
                  ...s,
                  origin:
                    data.origin,
                }
              : s
        )

      delete results.value[
        id
      ]

      batch.value =
        null

      selectedResult.value =
        null

      clearMap()

      notice.value =
        'Origen guardado. Calcula de nuevo para actualizar los resultados.'
    }
  )
}

async function calculateOne(
  s,
  options = {}
) {
  await run(
    `Calculando territorio de ${s.nombre}…`,

    async () => {
      batch.value =
        null

      delete results.value[
        s.id
      ]

      selectedResult.value =
        null

      clearMap()

      try {
        const result =
          await territorialApi(
            `/${s.id}/calculate`,
            {
              method:
                'POST',

              body:
                options,
            }
          )

        results.value[
          s.id
        ] =
          result

        await showResult(
          result
        )
      } catch (e) {
        results.value[
          s.id
        ] = {
          supervisor:
            s,

          supervisor_id:
            s.id,

          totalUnits:
            s.units_count,

          origin:
            options.origin ||
            s.origin,

          returnToOrigin:
            options.returnToOrigin ??
            true,

          status:
            'ERROR',

          calculatedAt:
            new Date()
              .toISOString(),

          error: {
            code:
              e.code ||
              'CALCULATION_FAILED',

            message:
              e.message,
          },
        }

        throw e
      }
    }
  )
}

async function calculateSelected() {
  await calculateOne(
    territory.value.supervisor,
    {
      origin:
        origin.value,

      returnToOrigin:
        returnToOrigin.value,
    }
  )
}

async function calculateAll() {
  await run(
    'Calculando rutas independientes. Los errores individuales no detienen el proceso…',

    async () => {
      batch.value =
        null

      results.value =
        {}

      selectedResult.value =
        null

      clearMap()

      batch.value =
        await territorialApi(
          '/calculate-all',
          {
            method:
              'POST',

            body:
              {},
          }
        )

      results.value =
        Object.fromEntries(
          batch.value.results.map(
            r => [
              r.supervisor_id,
              r,
            ]
          )
        )
    }
  )
}

function clearMap() {
  for (
    const overlay
    of overlays
  ) {
    overlay.setMap(
      null
    )
  }

  overlays =
    []

  map =
    null
}

async function showResult(
  result
) {
  selectedResult.value =
    result

  mapError.value =
    ''

  await nextTick()

  clearMap()

  try {
    const {
      Map,
    } =
      await window.google.maps.importLibrary(
        'maps'
      )

    const {
      encoding,
    } =
      await window.google.maps.importLibrary(
        'geometry'
      )

    if (
      disposed ||
      selectedResult.value
        ?.supervisor_id !==
        result.supervisor_id ||
      selectedResult.value
        ?.calculatedAt !==
        result.calculatedAt ||
      !mapEl.value
    ) {
      return
    }

    map =
      new Map(
        mapEl.value,
        {
          center:
            result.origin,

          zoom:
            8,
        }
      )

    const bounds =
      new window.google.maps
        .LatLngBounds()

    for (
      const [
        index,
        point,
      ]
      of [
        result.origin,
        ...result.sequence,
      ].entries()
    ) {
      const position = {
        lat:
          point.lat,

        lng:
          point.lng,
      }

      bounds.extend(
        position
      )

      overlays.push(
        new window.google.maps.Marker({
          map,

          position,

          label:
            index
              ? String(index)
              : 'O',

          title:
            index
              ? `${index}. ${point.name}`
              : `Origen${result.returnToOrigin ? ' y regreso' : ''}: ${point.name}`,
        })
      )
    }

    for (
      const encoded
      of result.polylines
    ) {
      const path =
        encoding.decodePath(
          encoded
        )

      path.forEach(
        p =>
          bounds.extend(p)
      )

      overlays.push(
        new window.google.maps.Polyline({
          map,

          path,

          strokeColor:
            '#0f64ad',

          strokeWeight:
            5,
        })
      )
    }

    if (
      result.sequence.length
    ) {
      map.fitBounds(
        bounds
      )
    }
  } catch {
    mapError.value =
      'No fue posible mostrar Google Maps. El recorrido y las métricas calculadas siguen disponibles.'
  }
}

async function report(
  data
) {
  await run(
    'Generando PDF…',

    () =>
      exportTerritorialReport(
        data
      )
  )
}

onMounted(
  load
)

onBeforeUnmount(
  () => {
    disposed =
      true

    autocomplete?.remove()

    clearMap()
  }
)
</script>

<style scoped>
.territorial-view {
  width: 100%;
  min-height: 100%;
  padding:
    28px
    28px
    52px;
  background:
    var(--color-background);
  color:
    var(--color-text);
}

.territorial-container {
  width:
    min(
      var(--content-max-width),
      100%
    );
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

.page-header-copy {
  min-width: 0;
}

.page-kicker {
  color:
    var(--color-primary-dark);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.page-header h1 {
  margin: 5px 0;
  color:
    var(--color-text);
  font-size:
    var(--font-size-page-title);
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -.02em;
}

.page-header p {
  max-width: 760px;
  margin: 0;
  color:
    var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.page-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

/* ============================================================
   BOTONES
   ============================================================ */

.button,
.table-action {
  border-radius:
    var(--radius-md);
  cursor: pointer;
  font-weight: 650;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.button {
  min-height: 40px;
  padding:
    0
    13px;
  font-size: 13px;
}

.button.primary {
  border:
    1px solid
    var(--color-primary);
  background:
    var(--color-primary);
  color: #fff;
}

.button.primary:hover:not(:disabled) {
  background:
    var(--color-primary-dark);
}

.button.secondary {
  border:
    1px solid
    var(--color-border);
  background:
    var(--color-surface);
  color:
    #475569;
}

.button.secondary:hover:not(:disabled) {
  border-color:
    #bfdbfe;
  background:
    var(--color-primary-soft);
  color:
    var(--color-primary-dark);
}

button:disabled {
  cursor: wait;
  opacity: .5;
}

/* ============================================================
   MENSAJES
   ============================================================ */

.message,
.progress-card,
.empty-card {
  margin-top: 14px;
  border-radius:
    var(--radius-lg);
}

.message {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px;
  font-size: 13px;
}

.error-message {
  border: 1px solid #fecaca;
  background:
    var(--color-error-soft);
  color:
    var(--color-error);
}

.notice-message {
  border: 1px solid #bfdbfe;
  background:
    var(--color-primary-soft);
  color:
    var(--color-primary-dark);
}

.progress-card {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px;
  border:
    1px solid
    var(--color-border);
  background:
    var(--color-surface);
  box-shadow:
    var(--shadow-sm);
}

.progress-card > div:last-child {
  display: flex;
  flex-direction: column;
}

.progress-card strong {
  font-size: 13px;
}

.progress-card span {
  margin-top: 2px;
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

.spinner {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border: 3px solid #dbeafe;
  border-top-color:
    var(--color-primary);
  border-radius: 999px;
  animation:
    territorial-spin
    .7s
    linear
    infinite;
}

.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 38px 20px;
  border:
    1px solid
    var(--color-border);
  background:
    var(--color-surface);
  text-align: center;
}

.empty-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius:
    var(--radius-lg);
  background:
    var(--color-surface-muted);
  color:
    var(--color-text-secondary);
  font-weight: 750;
}

.empty-card strong {
  margin-top: 9px;
  font-size: 14px;
}

.empty-card span {
  margin-top: 4px;
  color:
    var(--color-text-secondary);
  font-size: 13px;
}

/* ============================================================
   PANELES
   ============================================================ */

.panel {
  overflow: hidden;
  margin-top: 16px;
  border:
    1px solid
    var(--color-border);
  border-radius:
    var(--radius-lg);
  background:
    var(--color-surface);
  box-shadow:
    var(--shadow-sm);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 15px 17px;
  border-bottom:
    1px solid
    var(--color-border);
  background: #fcfdff;
}

.panel-header > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.panel-header span {
  color:
    var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.panel-header h2 {
  margin: 2px 0 0;
  color:
    var(--color-text);
  font-size: 16px;
  font-weight: 700;
}

.panel-status {
  display: inline-flex;
  min-height: 28px;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  background:
    var(--color-primary-soft);
  color:
    var(--color-primary-dark) !important;
  font-size: 12px !important;
}

.panel-status.success {
  background:
    var(--color-success-soft);
  color:
    var(--color-success) !important;
}

.panel-status.neutral {
  background:
    var(--color-surface-muted);
  color:
    #475569 !important;
}

/* ============================================================
   RESUMEN
   ============================================================ */

.summary-grid {
  display: grid;
  grid-template-columns:
    repeat(
      6,
      minmax(0, 1fr)
    );
  gap: 10px;
  padding: 14px 16px;
}

.metric-card {
  display: flex;
  min-width: 0;
  min-height: 96px;
  flex-direction: column;
  justify-content: center;
  padding: 12px;
  border:
    1px solid
    var(--color-border);
  border-radius:
    var(--radius-md);
  background:
    var(--color-surface-muted);
}

.metric-card.success {
  border-color: #bbf7d0;
  background:
    var(--color-success-soft);
}

.metric-card.danger {
  border-color: #fecaca;
  background:
    var(--color-error-soft);
}

.metric-card span {
  color:
    var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.metric-card strong {
  margin-top: 5px;
  overflow: hidden;
  color:
    var(--color-text);
  font-size: 22px;
  font-weight: 750;
  text-overflow: ellipsis;
}

.metric-card small {
  margin-top: 4px;
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

.metric-time {
  font-size: 17px !important;
}

.batch-insights {
  display: grid;
  grid-template-columns:
    repeat(
      3,
      minmax(0, 1fr)
    );
  gap: 10px;
  padding:
    0
    16px
    14px;
}

.batch-insights > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 11px;
  border:
    1px solid
    var(--color-border);
  border-radius:
    var(--radius-md);
}

.batch-insights span {
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

.batch-insights strong {
  margin-top: 3px;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
}

.panel-note {
  margin: 0;
  padding:
    12px
    16px;
  border-top:
    1px solid
    var(--color-border);
  background:
    var(--color-surface-muted);
  color:
    var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

/* ============================================================
   TABLA
   ============================================================ */

.table-wrap {
  max-height: 580px;
  overflow: auto;
}

table {
  width: 100%;
  min-width: 1220px;
  border-collapse: separate;
  border-spacing: 0;
  text-align: left;
}

thead th {
  position: sticky;
  z-index: 3;
  top: 0;
  padding: 10px 12px;
  border-bottom:
    1px solid
    var(--color-border);
  background:
    #f8fafc;
  color:
    #475569;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

tbody td {
  padding: 11px 12px;
  border-bottom:
    1px solid
    #eef2f7;
  vertical-align: middle;
  font-size: 13px;
}

tbody tr:last-child td {
  border-bottom: 0;
}

tbody tr:hover {
  background:
    #f8fbff;
}

.supervisor-cell {
  display: flex;
  min-width: 220px;
  align-items: center;
  gap: 9px;
}

.supervisor-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius:
    var(--radius-md);
  background:
    var(--color-primary-soft);
  color:
    var(--color-primary-dark);
  font-size: 12px;
  font-weight: 800;
}

.supervisor-cell strong {
  font-size: 13px;
}

.numeric-value {
  font-size: 13px;
  font-weight: 700;
}

.origin-name,
.table-secondary {
  color:
    var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.status-cell {
  display: flex;
  min-width: 120px;
  flex-direction: column;
  align-items: flex-start;
}

.result-status {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.result-status.pending {
  background:
    var(--color-surface-muted);
  color: #64748b;
}

.result-status.success {
  background:
    var(--color-success-soft);
  color:
    var(--color-success);
}

.result-status.error {
  background:
    var(--color-error-soft);
  color:
    var(--color-error);
}

.status-cell small {
  max-width: 220px;
  margin-top: 4px;
  color:
    var(--color-error);
  font-size: 12px;
  line-height: 1.35;
}

.actions-column {
  min-width: 330px;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.table-action {
  min-height: 32px;
  padding: 0 9px;
  border:
    1px solid
    var(--color-border);
  background:
    var(--color-surface);
  color:
    #475569;
  font-size: 12px;
}

.table-action:hover:not(:disabled) {
  border-color: #bfdbfe;
  background:
    var(--color-primary-soft);
  color:
    var(--color-primary-dark);
}

.table-action.primary {
  border-color: #bfdbfe;
  background:
    var(--color-primary-soft);
  color:
    var(--color-primary-dark);
}

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */

.configuration-intro {
  display: flex;
  flex-direction: column;
  padding: 15px 17px 0;
}

.configuration-intro strong {
  font-size: 14px;
}

.configuration-intro span {
  margin-top: 3px;
  color:
    var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.origin-form {
  padding: 15px 17px;
}

fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.origin-choice-grid,
.fields {
  display: grid;
  gap: 10px;
}

.origin-choice-grid {
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
}

.fields {
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  margin-top: 11px;
}

label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

label > span {
  color:
    #475569;
  font-size: 12px;
  font-weight: 650;
}

input,
select {
  width: 100%;
  min-width: 0;
  min-height: 41px;
  padding: 0 11px;
  outline: 0;
  border:
    1px solid
    #cbd5e1;
  border-radius:
    var(--radius-md);
  background:
    var(--color-surface);
  color:
    var(--color-text);
  font-size: 13px;
}

input:focus,
select:focus {
  border-color:
    var(--color-primary);
  box-shadow:
    0 0 0 3px
    rgba(37, 99, 235, .10);
}

.places {
  display: grid;
  gap: 6px;
  margin-top: 11px;
  padding: 11px;
  border:
    1px solid
    #bfdbfe;
  border-radius:
    var(--radius-md);
  background:
    var(--color-primary-soft);
}

.places > span {
  color:
    var(--color-primary-dark);
  font-size: 12px;
  font-weight: 650;
}

.check {
  display: flex;
  align-items: center;
  flex-direction: row;
  gap: 8px;
  margin-top: 13px;
}

.check input {
  width: 17px;
  min-height: auto;
  height: 17px;
}

.check span {
  font-size: 13px;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 15px;
}

.territory-data-summary {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 10px;
  padding:
    0
    17px
    16px;
}

.territory-data-summary > div {
  display: flex;
  flex-direction: column;
  padding: 11px;
  border:
    1px solid
    var(--color-border);
  border-radius:
    var(--radius-md);
  background:
    var(--color-surface-muted);
}

.territory-data-summary > div.warning {
  border-color: #fed7aa;
  background:
    var(--color-warning-soft);
}

.territory-data-summary span {
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

.territory-data-summary strong {
  margin-top: 3px;
  font-size: 18px;
}

.missing-coordinates {
  margin:
    0
    17px
    17px;
  padding: 12px;
  border:
    1px solid
    #fed7aa;
  border-radius:
    var(--radius-md);
  background:
    var(--color-warning-soft);
}

.missing-coordinates > strong {
  color: #92400e;
  font-size: 13px;
}

.missing-coordinates ul {
  margin:
    8px
    0
    0;
  padding-left: 20px;
}

.missing-coordinates li {
  margin-top: 4px;
  color: #92400e;
  font-size: 12px;
  line-height: 1.4;
}

/* ============================================================
   RESULTADO
   ============================================================ */

.result-metrics {
  display: grid;
  grid-template-columns:
    repeat(
      4,
      minmax(0, 1fr)
    );
  gap: 10px;
  padding: 15px 17px;
}

.result-metrics article {
  display: flex;
  min-height: 78px;
  flex-direction: column;
  justify-content: center;
  padding: 11px;
  border:
    1px solid
    var(--color-border);
  border-radius:
    var(--radius-md);
  background:
    var(--color-surface-muted);
}

.result-metrics span {
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

.result-metrics strong {
  margin-top: 4px;
  font-size: 17px;
}

.origin-summary {
  display: grid;
  grid-template-columns:
    minmax(0, 2fr)
    minmax(0, 1fr);
  gap: 10px;
  padding:
    0
    17px
    15px;
}

.origin-summary > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 11px;
  border:
    1px solid
    var(--color-border);
  border-radius:
    var(--radius-md);
}

.origin-summary span {
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

.origin-summary strong {
  margin-top: 3px;
  font-size: 13px;
}

.origin-summary small {
  margin-top: 3px;
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

.warnings-box {
  margin:
    0
    17px
    15px;
  padding: 12px;
  border:
    1px solid
    #fde68a;
  border-radius:
    var(--radius-md);
  background:
    var(--color-warning-soft);
}

.warnings-box strong {
  color: #92400e;
  font-size: 13px;
}

.warnings-box ul {
  margin:
    7px
    0
    0;
  padding-left: 20px;
}

.warnings-box li {
  margin-top: 4px;
  color: #92400e;
  font-size: 12px;
}

.route-map {
  height: 480px;
  margin:
    0
    17px
    17px;
  overflow: hidden;
  border:
    1px solid
    var(--color-border);
  border-radius:
    var(--radius-lg);
  background: #e2e8f0;
}

.sequence-section {
  margin:
    0
    17px
    17px;
  overflow: hidden;
  border:
    1px solid
    var(--color-border);
  border-radius:
    var(--radius-lg);
}

.sequence-section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom:
    1px solid
    var(--color-border);
  background:
    var(--color-surface-muted);
}

.sequence-section > header > div {
  display: flex;
  flex-direction: column;
}

.sequence-section header span,
.sequence-section header small {
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

.sequence-section header strong {
  margin-top: 2px;
  font-size: 14px;
}

.sequence-origin {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom:
    1px solid
    #eef2f7;
}

.sequence-origin.return {
  border-top:
    1px solid
    #eef2f7;
  border-bottom: 0;
}

.sequence-marker {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 750;
}

.sequence-marker.origin {
  background:
    var(--color-primary-soft);
  color:
    var(--color-primary-dark);
}

.sequence-origin > div {
  display: flex;
  flex-direction: column;
}

.sequence-origin strong {
  font-size: 13px;
}

.sequence-origin span:not(.sequence-marker) {
  margin-top: 2px;
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

.sequence-list {
  margin: 0;
  padding:
    0
    0
    0
    46px;
}

.sequence-list li {
  padding:
    10px
    14px
    10px
    5px;
  border-bottom:
    1px solid
    #eef2f7;
}

.sequence-list li:last-child {
  border-bottom: 0;
}

.sequence-list li::marker {
  color:
    var(--color-primary-dark);
  font-weight: 700;
}

.sequence-list li > div {
  display: flex;
  flex-direction: column;
}

.sequence-list strong {
  font-size: 13px;
}

.sequence-list span {
  margin-top: 2px;
  color:
    var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   ANIMACIÓN
   ============================================================ */

@keyframes territorial-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

@media (
  max-width: 1200px
) {
  .summary-grid {
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
  .territorial-view {
    padding:
      22px
      18px
      40px;
  }

  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .page-actions {
    justify-content: flex-start;
  }

  .result-metrics {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .origin-summary {
    grid-template-columns: 1fr;
  }
}

@media (
  max-width: 650px
) {
  .territorial-view {
    padding:
      18px
      14px
      32px;
  }

  .page-header h1 {
    font-size: 24px;
  }

  .page-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .button {
    width: 100%;
  }

  .summary-grid {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .batch-insights,
  .origin-choice-grid,
  .fields,
  .territory-data-summary,
  .result-metrics {
    grid-template-columns: 1fr;
  }

  .route-map {
    height: 350px;
    margin:
      0
      12px
      12px;
  }

  .origin-form,
  .configuration-intro {
    padding-right: 12px;
    padding-left: 12px;
  }

  .territory-data-summary {
    padding:
      0
      12px
      12px;
  }

  .missing-coordinates,
  .warnings-box,
  .sequence-section {
    margin-right: 12px;
    margin-left: 12px;
  }
}
</style>