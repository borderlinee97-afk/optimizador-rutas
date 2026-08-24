<template>
  <main class="people-page">
    <section class="people-container">
      <!-- ===================================================
           CABECERA
      ==================================================== -->
      <header class="people-hero">
        <div>
          <div class="people-kicker">
            Estructura organizacional
          </div>

          <h1>
            Personas
          </h1>

          <p>
            Consulta la estructura operativa,
            jerarquías, unidades asignadas,
            coberturas y estado de las cuentas.
          </p>
        </div>

        <button
          type="button"
          class="refresh-button"
          :disabled="loading"
          @click="loadDirectory"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"
            />

            <path
              d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"
            />
          </svg>

          <span>
            {{
              loading
                ? 'Actualizando...'
                : 'Actualizar'
            }}
          </span>
        </button>
      </header>

      <!-- ===================================================
           RESUMEN
      ==================================================== -->
      <section
        v-if="directory"
        class="summary-grid"
      >
        <SummaryCard
          label="Personas"
          :value="directory.summary.total"
          detail="Dentro de tu estructura"
        />

        <SummaryCard
          label="Activas"
          :value="directory.summary.active"
          :detail="`${directory.summary.inactive} inactivas`"
        />

        <SummaryCard
          label="Supervisores"
          :value="directory.summary.supervisors"
          :detail="`${directory.summary.coordinators} coordinadores`"
        />

        <SummaryCard
          label="Cuentas vinculadas"
          :value="directory.summary.linkedAccounts"
          :detail="`${directory.summary.unlinkedAccounts} sin acceso`"
        />

        <SummaryCard
          label="Coberturas activas"
          :value="directory.summary.activeCoverages"
          :detail="`${directory.summary.scheduledCoverages} programadas`"
        />
      </section>

      <!-- ===================================================
           PANEL PRINCIPAL
      ==================================================== -->
      <section class="people-panel">
        <div class="panel-header">
          <div class="view-tabs">
            <button
              type="button"
              :class="{
                active:
                  activeView ===
                  'DIRECTORY',
              }"
              @click="
                activeView =
                  'DIRECTORY'
              "
            >
              Directorio
            </button>

            <button
              type="button"
              :class="{
                active:
                  activeView ===
                  'HIERARCHY',
              }"
              @click="
                activeView =
                  'HIERARCHY'
              "
            >
              Jerarquía
            </button>
          </div>

          <span
            v-if="directory"
            class="result-count"
          >
            {{ visiblePeople.length }}
            resultados
          </span>
        </div>

        <!-- =================================================
             FILTROS
        ================================================== -->
        <div class="filters">
          <label class="search-field">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                cx="11"
                cy="11"
                r="7"
              />

              <path
                d="m20 20-3.8-3.8"
              />
            </svg>

            <input
              v-model="filters.search"
              type="search"
              placeholder="Buscar persona o superior..."
            />
          </label>

          <select
            v-model="filters.role"
          >
            <option value="ALL">
              Todos los roles
            </option>

            <option value="GERENTE">
              Gerente
            </option>

            <option value="COORDINADOR">
              Coordinador
            </option>

            <option value="SUPERVISOR">
              Supervisor
            </option>
          </select>

          <select
            v-model="filters.status"
          >
            <option value="ALL">
              Todos los estados
            </option>

            <option value="ACTIVE">
              Activos
            </option>

            <option value="INACTIVE">
              Inactivos
            </option>
          </select>

          <select
            v-model="filters.state"
          >
            <option value="ALL">
              Todos los territorios
            </option>

            <option
              v-for="state in availableStates"
              :key="state"
              :value="state"
            >
              {{ state }}
            </option>
          </select>

          <button
            type="button"
            class="clear-filters"
            @click="clearFilters"
          >
            Limpiar
          </button>
        </div>

        <!-- =================================================
             CARGANDO
        ================================================== -->
        <div
          v-if="loading"
          class="state-panel"
        >
          <div class="spinner"></div>

          <strong>
            Cargando directorio
          </strong>

          <span>
            Consultando estructura y asignaciones...
          </span>
        </div>

        <!-- =================================================
             ERROR
        ================================================== -->
        <div
          v-else-if="error"
          class="state-panel error-state"
        >
          <div class="state-icon">
            !
          </div>

          <strong>
            No se pudo cargar el directorio
          </strong>

          <span>
            {{ error }}
          </span>

          <button
            type="button"
            @click="loadDirectory"
          >
            Intentar nuevamente
          </button>
        </div>

        <!-- =================================================
             DIRECTORIO
        ================================================== -->
        <div
          v-else-if="
            activeView ===
            'DIRECTORY'
          "
          class="directory-grid"
        >
          <PersonCard
            v-for="person in visiblePeople"
            :key="person.id"
            :person="person"
            @open="
              selectedPerson =
                person
            "
          />

          <EmptyState
            v-if="
              visiblePeople.length ===
              0
            "
            title="Sin resultados"
            description="No existen personas que coincidan con los filtros seleccionados."
          />
        </div>

        <!-- =================================================
             JERARQUÍA
        ================================================== -->
        <div
          v-else
          class="hierarchy-view"
        >
          <article
            v-for="group in hierarchyGroups"
            :key="group.id"
            class="hierarchy-group"
          >
            <button
              type="button"
              class="hierarchy-head"
              @click="
                selectedPerson =
                  group.person
              "
            >
              <PersonAvatar
                :name="group.person.name"
                :role="group.person.role"
              />

              <div>
                <span>
                  {{
                    roleLabel(
                      group.person.role,
                    )
                  }}
                </span>

                <strong>
                  {{ group.person.name }}
                </strong>

                <small>
                  {{
                    group.children.length
                  }}
                  supervisores directos
                </small>
              </div>

              <div class="hierarchy-units">
                <strong>
                  {{
                    group.person.territoryUnits
                  }}
                </strong>

                <span>
                  unidades
                </span>
              </div>
            </button>

            <div
              v-if="
                group.children.length >
                0
              "
              class="hierarchy-children"
            >
              <button
                v-for="child in group.children"
                :key="child.id"
                type="button"
                class="hierarchy-child"
                @click="
                  selectedPerson =
                    child
                "
              >
                <PersonAvatar
                  :name="child.name"
                  :role="child.role"
                  compact
                />

                <div>
                  <strong>
                    {{ child.name }}
                  </strong>

                  <span>
                    {{
                      child.assignedUnits
                    }}
                    unidades
                  </span>
                </div>

                <AccountStatus
                  :linked="child.accountLinked"
                  compact
                />
              </button>
            </div>

            <div
              v-else
              class="hierarchy-empty"
            >
              Sin supervisores directos.
            </div>
          </article>

          <article
            v-if="
              hierarchyOrphans.length >
              0
            "
            class="hierarchy-group"
          >
            <div class="hierarchy-head orphan-head">
              <div class="orphan-icon">
                ?
              </div>

              <div>
                <span>
                  Estructura pendiente
                </span>

                <strong>
                  Sin coordinador identificado
                </strong>

                <small>
                  {{
                    hierarchyOrphans.length
                  }}
                  personas
                </small>
              </div>
            </div>

            <div class="hierarchy-children">
              <button
                v-for="person in hierarchyOrphans"
                :key="person.id"
                type="button"
                class="hierarchy-child"
                @click="
                  selectedPerson =
                    person
                "
              >
                <PersonAvatar
                  :name="person.name"
                  :role="person.role"
                  compact
                />

                <div>
                  <strong>
                    {{ person.name }}
                  </strong>

                  <span>
                    {{
                      roleLabel(
                        person.role,
                      )
                    }}
                  </span>
                </div>
              </button>
            </div>
          </article>

          <EmptyState
            v-if="
              hierarchyGroups.length ===
                0 &&
              hierarchyOrphans.length ===
                0
            "
            title="Sin estructura"
            description="No hay jerarquía disponible con los filtros seleccionados."
          />
        </div>
      </section>
    </section>

    <!-- =====================================================
         DETALLE
    ====================================================== -->
    <Teleport to="body">
      <div
        v-if="selectedPerson"
        class="drawer-overlay"
        @click.self="
          selectedPerson =
            null
        "
      >
        <aside class="person-drawer">
          <header class="drawer-header">
            <div class="drawer-person">
              <PersonAvatar
                :name="selectedPerson.name"
                :role="selectedPerson.role"
              />

              <div>
                <span>
                  {{
                    roleLabel(
                      selectedPerson.role,
                    )
                  }}
                </span>

                <h2>
                  {{ selectedPerson.name }}
                </h2>
              </div>
            </div>

            <button
              type="button"
              class="drawer-close"
              @click="
                selectedPerson =
                  null
              "
            >
              ×
            </button>
          </header>

          <div class="drawer-content">
            <section class="detail-status">
              <StatusBadge
                :active="selectedPerson.active"
              />

              <AccountStatus
                :linked="selectedPerson.accountLinked"
              />
            </section>

            <DetailSection
              title="Estructura"
            >
              <DetailRow
                label="Área"
                :value="
                  formatLabel(
                    selectedPerson.area,
                  )
                "
              />

              <DetailRow
                label="Rol"
                :value="
                  roleLabel(
                    selectedPerson.role,
                  )
                "
              />

              <DetailRow
                label="Superior inmediato"
                :value="
                  selectedPerson.superiorName ||
                  'Sin superior registrado'
                "
              />

              <DetailRow
                label="Ámbito"
                :value="
                  scopeLabel(
                    selectedPerson.pharmacyScopeMode,
                  )
                "
              />
            </DetailSection>

            <DetailSection
              title="Territorio"
            >
              <DetailRow
                label="Estados autorizados"
                :value="
                  selectedPerson.states.length
                    ? selectedPerson.states.join(
                        ', ',
                      )
                    : 'Sin alcance estatal'
                "
              />

              <DetailRow
                label="Unidades asignadas"
                :value="
                  String(
                    selectedPerson.assignedUnits,
                  )
                "
              />

              <DetailRow
                label="Unidades de territorio"
                :value="
                  String(
                    selectedPerson.territoryUnits,
                  )
                "
              />

              <DetailRow
                label="Personas directas"
                :value="
                  String(
                    selectedPerson.directReports,
                  )
                "
              />
            </DetailSection>

            <DetailSection
              title="Coberturas"
            >
              <DetailRow
                label="Activas"
                :value="
                  String(
                    selectedPerson.activeCoverages,
                  )
                "
              />

              <DetailRow
                label="Programadas"
                :value="
                  String(
                    selectedPerson.scheduledCoverages,
                  )
                "
              />
            </DetailSection>

            <DetailSection
              title="Cuenta"
            >
              <DetailRow
                label="Estado"
                :value="
                  selectedPerson.accountLinked
                    ? 'Vinculada con Supabase'
                    : 'Sin usuario de autenticación'
                "
              />

              <DetailRow
                label="UUID local"
                :value="
                  selectedPerson.id
                "
                mono
              />

              <DetailRow
                label="UUID de autenticación"
                :value="
                  selectedPerson.authUserId ||
                  'Sin vínculo'
                "
                mono
              />
            </DetailSection>

            <div class="read-only-note">
              Esta etapa es únicamente de consulta.
              No se realizarán modificaciones de
              usuarios o jerarquías desde esta vista.
            </div>
          </div>
        </aside>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import {
  computed,
  defineComponent,
  h,
  onMounted,
  ref,
} from 'vue'

import {
  getPeopleDirectory,
} from '../../services/peopleApi.js'

const directory =
  ref(null)

const loading =
  ref(true)

const error =
  ref(null)

const selectedPerson =
  ref(null)

const activeView =
  ref('DIRECTORY')

const filters =
  ref({
    search:
      '',

    role:
      'ALL',

    status:
      'ALL',

    state:
      'ALL',
  })

const availableStates =
  computed(
    () => {
      const states =
        new Set()

      for (
        const person
        of directory.value
          ?.people ??
        []
      ) {
        for (
          const state
          of person.states ??
          []
        ) {
          states.add(
            state,
          )
        }
      }

      return Array.from(
        states,
      ).sort(
        (
          first,
          second,
        ) =>
          first.localeCompare(
            second,
            'es',
          ),
      )
    },
  )

const visiblePeople =
  computed(
    () => {
      const search =
        normalizeSearch(
          filters.value.search,
        )

      return (
        directory.value
          ?.people ??
        []
      ).filter(
        person => {
          if (
            filters.value.role !==
              'ALL' &&
            person.role !==
              filters.value.role
          ) {
            return false
          }

          if (
            filters.value.status ===
              'ACTIVE' &&
            !person.active
          ) {
            return false
          }

          if (
            filters.value.status ===
              'INACTIVE' &&
            person.active
          ) {
            return false
          }

          if (
            filters.value.state !==
              'ALL' &&
            !person.states.includes(
              filters.value.state,
            )
          ) {
            return false
          }

          if (!search) {
            return true
          }

          const searchable =
            normalizeSearch(
              [
                person.name,
                person.role,
                person.superiorName,
                ...person.states,
              ].join(
                ' ',
              ),
            )

          return searchable.includes(
            search,
          )
        },
      )
    },
  )

const hierarchyGroups =
  computed(
    () => {
      const allPeople =
        directory.value
          ?.people ??
        []

      const visibleIds =
        new Set(
          visiblePeople.value.map(
            person =>
              person.id,
          ),
        )

      return allPeople
        .filter(
          person =>
            person.role ===
              'COORDINADOR' &&
            (
              visibleIds.has(
                person.id,
              ) ||
              allPeople.some(
                child =>
                  child.superiorId ===
                    person.id &&
                  visibleIds.has(
                    child.id,
                  ),
              )
            ),
        )
        .map(
          coordinator => ({
            id:
              coordinator.id,

            person:
              coordinator,

            children:
              allPeople
                .filter(
                  person =>
                    person.superiorId ===
                      coordinator.id &&
                    person.role ===
                      'SUPERVISOR' &&
                    visibleIds.has(
                      person.id,
                    ),
                )
                .sort(
                  comparePeople,
                ),
          }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            comparePeople(
              first.person,
              second.person,
            ),
        )
    },
  )

const hierarchyOrphans =
  computed(
    () => {
      const allPeople =
        directory.value
          ?.people ??
        []

      const coordinatorIds =
        new Set(
          allPeople
            .filter(
              person =>
                person.role ===
                'COORDINADOR',
            )
            .map(
              person =>
                person.id,
            ),
        )

      return visiblePeople.value
        .filter(
          person =>
            person.role ===
              'SUPERVISOR' &&
            !coordinatorIds.has(
              person.superiorId,
            ),
        )
        .sort(
          comparePeople,
        )
    },
  )

async function loadDirectory() {
  loading.value =
    true

  error.value =
    null

  try {
    directory.value =
      await getPeopleDirectory()

    if (
      selectedPerson.value
    ) {
      selectedPerson.value =
        directory.value.people.find(
          person =>
            person.id ===
            selectedPerson.value.id,
        ) ??
        null
    }
  } catch (
    requestError
  ) {
    error.value =
      requestError?.message ||
      'No fue posible consultar el directorio.'
  } finally {
    loading.value =
      false
  }
}

function clearFilters() {
  filters.value = {
    search:
      '',

    role:
      'ALL',

    status:
      'ALL',

    state:
      'ALL',
  }
}

function comparePeople(
  first,
  second,
) {
  return String(
    first.name ??
    '',
  ).localeCompare(
    String(
      second.name ??
      '',
    ),
    'es',
  )
}

function normalizeSearch(
  value,
) {
  return String(
    value ??
    '',
  )
    .trim()
    .toLowerCase()
    .normalize(
      'NFD',
    )
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
}

function roleLabel(
  role,
) {
  const labels = {
    GERENTE:
      'Gerente',

    COORDINADOR:
      'Coordinador',

    SUPERVISOR:
      'Supervisor',
  }

  return (
    labels[role] ||
    formatLabel(
      role,
    )
  )
}

function formatLabel(
  value,
) {
  return String(
    value ??
    '',
  )
    .trim()
    .replace(
      /_/g,
      ' ',
    )
    .toLowerCase()
    .replace(
      /(^|\s)\S/g,
      letter =>
        letter.toUpperCase(),
    )
}

function scopeLabel(
  value,
) {
  if (
    value ===
    'ALL'
  ) {
    return 'Acceso general'
  }

  if (
    value ===
    'ASSIGNED_ONLY'
  ) {
    return 'Solo unidades asignadas'
  }

  return 'Sin ámbito definido'
}

function getInitials(
  name,
) {
  return String(
    name ??
    '',
  )
    .trim()
    .split(
      /\s+/,
    )
    .slice(
      0,
      2,
    )
    .map(
      part =>
        part
          .charAt(
            0,
          )
          .toUpperCase(),
    )
    .join(
      '',
    ) ||
    '?'
}

const SummaryCard =
  defineComponent({
    props: {
      label:
        String,

      value:
        [
          String,
          Number,
        ],

      detail:
        String,
    },

    setup(
      props,
    ) {
      return () =>
        h(
          'article',
          {
            class:
              'summary-card',
          },
          [
            h(
              'span',
              props.label,
            ),

            h(
              'strong',
              String(
                props.value ??
                0,
              ),
            ),

            h(
              'small',
              props.detail,
            ),
          ],
        )
    },
  })

const PersonAvatar =
  defineComponent({
    props: {
      name:
        String,

      role:
        String,

      compact:
        Boolean,
    },

    setup(
      props,
    ) {
      return () =>
        h(
          'div',
          {
            class: [
              'person-avatar',

              `role-${String(
                props.role ??
                '',
              ).toLowerCase()}`,

              {
                compact:
                  props.compact,
              },
            ],
          },
          getInitials(
            props.name,
          ),
        )
    },
  })

const StatusBadge =
  defineComponent({
    props: {
      active:
        Boolean,
    },

    setup(
      props,
    ) {
      return () =>
        h(
          'span',
          {
            class: [
              'status-badge',

              props.active
                ? 'active'
                : 'inactive',
            ],
          },
          props.active
            ? 'Activo'
            : 'Inactivo',
        )
    },
  })

const AccountStatus =
  defineComponent({
    props: {
      linked:
        Boolean,

      compact:
        Boolean,
    },

    setup(
      props,
    ) {
      return () =>
        h(
          'span',
          {
            class: [
              'account-status',

              props.linked
                ? 'linked'
                : 'unlinked',

              {
                compact:
                  props.compact,
              },
            ],
          },
          props.linked
            ? 'Cuenta vinculada'
            : 'Sin cuenta',
        )
    },
  })

const PersonCard =
  defineComponent({
    props: {
      person: {
        type:
          Object,

        required:
          true,
      },
    },

    emits: [
      'open',
    ],

    setup(
      props,
      {
        emit,
      },
    ) {
      return () =>
        h(
          'button',
          {
            type:
              'button',

            class:
              'person-card',

            onClick:
              () =>
                emit(
                  'open',
                ),
          },
          [
            h(
              'div',
              {
                class:
                  'person-card-head',
              },
              [
                h(
                  PersonAvatar,
                  {
                    name:
                      props.person.name,

                    role:
                      props.person.role,
                  },
                ),

                h(
                  'div',
                  {
                    class:
                      'person-card-title',
                  },
                  [
                    h(
                      'span',
                      roleLabel(
                        props.person.role,
                      ),
                    ),

                    h(
                      'strong',
                      props.person.name,
                    ),
                  ],
                ),

                h(
                  StatusBadge,
                  {
                    active:
                      props.person.active,
                  },
                ),
              ],
            ),

            h(
              'div',
              {
                class:
                  'person-card-body',
              },
              [
                h(
                  'div',
                  [
                    h(
                      'span',
                      'Superior',
                    ),

                    h(
                      'strong',
                      props.person.superiorName ||
                      'Sin superior',
                    ),
                  ],
                ),

                h(
                  'div',
                  [
                    h(
                      'span',
                      'Territorio',
                    ),

                    h(
                      'strong',
                      props.person.states.length
                        ? props.person.states.join(
                            ', ',
                          )
                        : 'Sin alcance',
                    ),
                  ],
                ),
              ],
            ),

            h(
              'div',
              {
                class:
                  'person-card-metrics',
              },
              [
                h(
                  'div',
                  [
                    h(
                      'strong',
                      String(
                        props.person.assignedUnits,
                      ),
                    ),

                    h(
                      'span',
                      'Asignadas',
                    ),
                  ],
                ),

                h(
                  'div',
                  [
                    h(
                      'strong',
                      String(
                        props.person.territoryUnits,
                      ),
                    ),

                    h(
                      'span',
                      'Territorio',
                    ),
                  ],
                ),

                h(
                  'div',
                  [
                    h(
                      'strong',
                      String(
                        props.person.activeCoverages,
                      ),
                    ),

                    h(
                      'span',
                      'Coberturas',
                    ),
                  ],
                ),
              ],
            ),

            h(
              'div',
              {
                class:
                  'person-card-footer',
              },
              [
                h(
                  AccountStatus,
                  {
                    linked:
                      props.person.accountLinked,
                  },
                ),

                h(
                  'span',
                  {
                    class:
                      'open-detail',
                  },
                  'Ver detalle →',
                ),
              ],
            ),
          ],
        )
    },
  })

const EmptyState =
  defineComponent({
    props: {
      title:
        String,

      description:
        String,
    },

    setup(
      props,
    ) {
      return () =>
        h(
          'div',
          {
            class:
              'empty-state',
          },
          [
            h(
              'div',
              {
                class:
                  'empty-icon',
              },
              '○',
            ),

            h(
              'strong',
              props.title,
            ),

            h(
              'span',
              props.description,
            ),
          ],
        )
    },
  })

const DetailSection =
  defineComponent({
    props: {
      title:
        String,
    },

    setup(
      props,
      {
        slots,
      },
    ) {
      return () =>
        h(
          'section',
          {
            class:
              'detail-section',
          },
          [
            h(
              'h3',
              props.title,
            ),

            h(
              'div',
              {
                class:
                  'detail-rows',
              },
              slots.default?.(),
            ),
          ],
        )
    },
  })

const DetailRow =
  defineComponent({
    props: {
      label:
        String,

      value:
        String,

      mono:
        Boolean,
    },

    setup(
      props,
    ) {
      return () =>
        h(
          'div',
          {
            class:
              'detail-row',
          },
          [
            h(
              'span',
              props.label,
            ),

            h(
              'strong',
              {
                class: {
                  mono:
                    props.mono,
                },
              },
              props.value,
            ),
          ],
        )
    },
  })

onMounted(
  () => {
    void loadDirectory()
  },
)
</script>

<style scoped>
.people-page {
  min-height: 100%;
  overflow-y: auto;
  background:
    linear-gradient(
      180deg,
      #f6f9fc 0%,
      #eef4f8 100%
    );
  color: #0f172a;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.people-container {
  width:
    min(
      1240px,
      calc(100% - 32px)
    );
  margin: 0 auto;
  padding:
    102px
    0
    48px;
}

.people-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.people-kicker {
  color: #0f64ad;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .09em;
  text-transform: uppercase;
}

.people-hero h1 {
  margin:
    7px
    0
    8px;
  font-size: 32px;
  line-height: 1.1;
}

.people-hero p {
  max-width: 680px;
  margin: 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.refresh-button {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding:
    0
    16px;
  border: 1px solid #cbd5e1;
  border-radius: 13px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.refresh-button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.refresh-button:disabled {
  cursor: wait;
  opacity: .6;
}

.summary-grid {
  display: grid;
  grid-template-columns:
    repeat(
      5,
      minmax(
        0,
        1fr
      )
    );
  gap: 12px;
  margin-top: 25px;
}

:deep(.summary-card) {
  display: flex;
  min-height: 116px;
  flex-direction: column;
  padding: 18px;
  border: 1px solid #dfe7ef;
  border-radius: 20px;
  background: #fff;
  box-shadow:
    0 7px 24px
    rgba(15, 23, 42, .05);
}

:deep(.summary-card > span) {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

:deep(.summary-card > strong) {
  margin-top: 9px;
  font-size: 27px;
}

:deep(.summary-card > small) {
  margin-top: auto;
  color: #94a3b8;
  font-size: 10px;
}

.people-panel {
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid #dfe7ef;
  border-radius: 24px;
  background: #fff;
  box-shadow:
    0 12px 36px
    rgba(15, 23, 42, .06);
}

.panel-header {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding:
    10px
    16px;
  border-bottom: 1px solid #edf2f7;
}

.view-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 13px;
  background: #f1f5f9;
}

.view-tabs button {
  min-height: 38px;
  padding:
    0
    16px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 11px;
  font-weight: 850;
}

.view-tabs button.active {
  background: #fff;
  color: #0f64ad;
  box-shadow:
    0 2px 8px
    rgba(15, 23, 42, .08);
}

.result-count {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.filters {
  display: grid;
  grid-template-columns:
    minmax(
      260px,
      1.5fr
    )
    repeat(
      3,
      minmax(
        150px,
        .55fr
      )
    )
    auto;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid #edf2f7;
  background: #fbfdff;
}

.search-field {
  display: flex;
  min-height: 44px;
  align-items: center;
  padding:
    0
    13px;
  border: 1px solid #cbd5e1;
  border-radius: 13px;
  background: #fff;
}

.search-field svg {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  fill: none;
  stroke: #64748b;
  stroke-width: 1.8;
}

.search-field input {
  min-width: 0;
  flex: 1;
  margin-left: 9px;
  outline: 0;
  border: 0;
  background: transparent;
  color: #0f172a;
  font-size: 12px;
}

.filters select,
.clear-filters {
  min-height: 44px;
  padding:
    0
    12px;
  border: 1px solid #cbd5e1;
  border-radius: 13px;
  background: #fff;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
}

.clear-filters {
  cursor: pointer;
}

.directory-grid {
  display: grid;
  grid-template-columns:
    repeat(
      3,
      minmax(
        0,
        1fr
      )
    );
  gap: 14px;
  padding: 18px;
}

:deep(.person-card) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 17px;
  border: 1px solid #dfe7ef;
  border-radius: 20px;
  background: #fff;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    transform .15s ease,
    border-color .15s ease,
    box-shadow .15s ease;
}

:deep(.person-card:hover) {
  transform: translateY(-2px);
  border-color: #93c5fd;
  box-shadow:
    0 12px 26px
    rgba(15, 100, 173, .10);
}

:deep(.person-card-head) {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

:deep(.person-card-title) {
  min-width: 0;
  flex: 1;
}

:deep(.person-card-title span) {
  display: block;
  color: #0f64ad;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .06em;
  text-transform: uppercase;
}

:deep(.person-card-title strong) {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
}

:deep(.person-avatar) {
  display: grid;
  width: 43px;
  height: 43px;
  flex: 0 0 43px;
  place-items: center;
  border-radius: 14px;
  background: #eaf4fc;
  color: #0f64ad;
  font-size: 12px;
  font-weight: 900;
}

:deep(.person-avatar.role-gerente) {
  background: #ede9fe;
  color: #6d28d9;
}

:deep(.person-avatar.role-coordinador) {
  background: #e0f2fe;
  color: #0369a1;
}

:deep(.person-avatar.role-supervisor) {
  background: #dcfce7;
  color: #047857;
}

:deep(.person-avatar.compact) {
  width: 35px;
  height: 35px;
  flex-basis: 35px;
  border-radius: 11px;
  font-size: 10px;
}

:deep(.status-badge),
:deep(.account-status) {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}

:deep(.status-badge) {
  padding:
    5px
    8px;
}

:deep(.status-badge.active) {
  background: #dcfce7;
  color: #047857;
}

:deep(.status-badge.inactive) {
  background: #fee2e2;
  color: #b91c1c;
}

:deep(.account-status) {
  padding:
    6px
    9px;
}

:deep(.account-status.linked) {
  background: #dbeafe;
  color: #1d4ed8;
}

:deep(.account-status.unlinked) {
  background: #f1f5f9;
  color: #64748b;
}

:deep(.account-status.compact) {
  padding:
    4px
    7px;
  font-size: 8px;
}

:deep(.person-card-body) {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

:deep(.person-card-body > div) {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

:deep(.person-card-body span) {
  color: #94a3b8;
  font-size: 9px;
  font-weight: 700;
}

:deep(.person-card-body strong) {
  overflow: hidden;
  color: #475569;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.person-card-metrics) {
  display: grid;
  grid-template-columns:
    repeat(
      3,
      minmax(
        0,
        1fr
      )
    );
  gap: 7px;
  margin-top: 15px;
}

:deep(.person-card-metrics > div) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding:
    9px
    8px;
  border-radius: 12px;
  background: #f8fafc;
}

:deep(.person-card-metrics strong) {
  font-size: 14px;
}

:deep(.person-card-metrics span) {
  margin-top: 2px;
  overflow: hidden;
  color: #94a3b8;
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.person-card-footer) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 15px;
  padding-top: 13px;
  border-top: 1px solid #edf2f7;
}

:deep(.open-detail) {
  color: #0f64ad;
  font-size: 9px;
  font-weight: 850;
}

.hierarchy-view {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.hierarchy-group {
  overflow: hidden;
  border: 1px solid #dfe7ef;
  border-radius: 19px;
}

.hierarchy-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 15px;
  border: 0;
  background: #f8fbfe;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.hierarchy-head > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.hierarchy-head span {
  display: block;
  color: #0f64ad;
  font-size: 9px;
  font-weight: 850;
  text-transform: uppercase;
}

.hierarchy-head strong {
  display: block;
  margin-top: 4px;
  font-size: 12px;
}

.hierarchy-head small {
  display: block;
  margin-top: 3px;
  color: #64748b;
  font-size: 9px;
}

.hierarchy-units {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.hierarchy-units strong {
  font-size: 18px;
}

.hierarchy-units span {
  margin-top: 2px;
  color: #64748b;
  font-size: 8px;
}

.hierarchy-children {
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
  padding: 12px;
  border-top: 1px solid #edf2f7;
}

.hierarchy-child {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 11px;
  border: 1px solid #e8eef4;
  border-radius: 14px;
  background: #fff;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.hierarchy-child > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.hierarchy-child strong {
  display: block;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hierarchy-child span {
  display: block;
  margin-top: 3px;
  color: #64748b;
  font-size: 8px;
}

.hierarchy-empty {
  padding: 18px;
  border-top: 1px solid #edf2f7;
  color: #94a3b8;
  font-size: 10px;
  text-align: center;
}

.orphan-head {
  cursor: default;
}

.orphan-icon {
  display: grid;
  width: 43px;
  height: 43px;
  place-items: center;
  border-radius: 14px;
  background: #fef3c7;
  color: #b45309;
  font-weight: 900;
}

:deep(.empty-state),
.state-panel {
  display: flex;
  min-height: 260px;
  grid-column: 1 / -1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  text-align: center;
}

:deep(.empty-state strong),
.state-panel strong {
  margin-top: 12px;
  font-size: 15px;
}

:deep(.empty-state span),
.state-panel span {
  max-width: 430px;
  margin-top: 7px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.5;
}

:deep(.empty-icon),
.state-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 15px;
  background: #f1f5f9;
  color: #64748b;
  font-weight: 900;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #dbeafe;
  border-top-color: #0f64ad;
  border-radius: 999px;
  animation:
    people-spin
    .7s
    linear
    infinite;
}

.error-state button {
  min-height: 40px;
  margin-top: 17px;
  padding:
    0
    15px;
  border: 0;
  border-radius: 12px;
  background: #0f64ad;
  color: #fff;
  cursor: pointer;
  font-size: 10px;
  font-weight: 800;
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  justify-content: flex-end;
  background: rgba(15, 23, 42, .34);
  backdrop-filter: blur(3px);
}

.person-drawer {
  width:
    min(
      440px,
      100%
    );
  height: 100%;
  overflow-y: auto;
  background: #f8fafc;
  box-shadow:
    -18px 0 45px
    rgba(15, 23, 42, .16);
}

.drawer-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid #dfe7ef;
  background: rgba(255, 255, 255, .97);
}

.drawer-person {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.drawer-person > div:last-child {
  min-width: 0;
}

.drawer-person span {
  color: #0f64ad;
  font-size: 9px;
  font-weight: 850;
  text-transform: uppercase;
}

.drawer-person h2 {
  margin:
    4px
    0
    0;
  font-size: 15px;
  line-height: 1.35;
}

.drawer-close {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 11px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-size: 22px;
}

.drawer-content {
  display: grid;
  gap: 13px;
  padding: 16px;
}

.detail-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

:deep(.detail-section) {
  padding: 16px;
  border: 1px solid #dfe7ef;
  border-radius: 18px;
  background: #fff;
}

:deep(.detail-section h3) {
  margin:
    0
    0
    13px;
  color: #0f172a;
  font-size: 12px;
}

:deep(.detail-rows) {
  display: grid;
  gap: 12px;
}

:deep(.detail-row) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

:deep(.detail-row span) {
  color: #64748b;
  font-size: 10px;
}

:deep(.detail-row strong) {
  max-width: 62%;
  overflow-wrap: anywhere;
  color: #334155;
  font-size: 10px;
  text-align: right;
}

:deep(.detail-row strong.mono) {
  font-family:
    "SFMono-Regular",
    Consolas,
    monospace;
  font-size: 8px;
}

.read-only-note {
  padding: 14px;
  border: 1px solid #bfdbfe;
  border-radius: 15px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 10px;
  line-height: 1.55;
}

@keyframes people-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (
  max-width: 1050px
) {
  .summary-grid {
    grid-template-columns:
      repeat(
        3,
        minmax(
          0,
          1fr
        )
      );
  }

  .directory-grid {
    grid-template-columns:
      repeat(
        2,
        minmax(
          0,
          1fr
        )
      );
  }

  .filters {
    grid-template-columns:
      repeat(
        2,
        minmax(
          0,
          1fr
        )
      );
  }

  .search-field {
    grid-column: 1 / -1;
  }
}

@media (
  max-width: 680px
) {
  .people-container {
    width:
      calc(100% - 20px);
    padding-top: 84px;
  }

  .people-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .refresh-button {
    width: 100%;
    justify-content: center;
  }

  .summary-grid {
    grid-template-columns:
      repeat(
        2,
        minmax(
          0,
          1fr
        )
      );
  }

  .directory-grid,
  .filters,
  .hierarchy-children {
    grid-template-columns: 1fr;
  }

  .search-field {
    grid-column: auto;
  }

  .panel-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .view-tabs {
    width: 100%;
  }

  .view-tabs button {
    flex: 1;
  }

  .person-drawer {
    width: 100%;
  }
}
</style>