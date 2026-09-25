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
  width: 100%;
  min-height: 100%;
  padding: 28px 28px 52px;
  background: var(--color-background);
  color: var(--color-text);
}

.people-container {
  width: min(var(--content-max-width), 100%);
  margin: 0 auto;
}

/* ============================================================
   CABECERA
   ============================================================ */

.people-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.people-hero > div {
  min-width: 0;
}

.people-kicker {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: .055em;
  text-transform: uppercase;
}

.people-hero h1 {
  margin: 5px 0;
  color: var(--color-text);
  font-size: var(--font-size-page-title);
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -.02em;
}

.people-hero p {
  max-width: 760px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.refresh-button {
  display: inline-flex;
  min-height: 40px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: #475569;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  transition:
    border-color 150ms ease,
    background 150ms ease,
    color 150ms ease;
}

.refresh-button:hover:not(:disabled) {
  border-color: #bfdbfe;
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
}

.refresh-button:disabled {
  cursor: wait;
  opacity: .55;
}

.refresh-button svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ============================================================
   RESUMEN
   ============================================================ */

.summary-grid {
  display: grid;
  grid-template-columns:
    repeat(
      5,
      minmax(0, 1fr)
    );
  gap: 10px;
  margin-top: 22px;
}

:deep(.summary-card) {
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

:deep(.summary-card > span) {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

:deep(.summary-card > strong) {
  margin-top: 5px;
  color: var(--color-text);
  font-size: 23px;
  font-weight: 750;
}

:deep(.summary-card > small) {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ============================================================
   PANEL PRINCIPAL
   ============================================================ */

.people-panel {
  overflow: hidden;
  margin-top: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.panel-header {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--color-border);
  background: #fcfdff;
}

.view-tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.view-tabs button {
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
}

.view-tabs button:hover {
  color: var(--color-text);
}

.view-tabs button.active {
  background: var(--color-surface);
  color: var(--color-primary-dark);
  box-shadow: var(--shadow-sm);
}

.result-count {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

/* ============================================================
   FILTROS
   ============================================================ */

.filters {
  display: grid;
  grid-template-columns:
    minmax(260px, 1.5fr)
    repeat(
      3,
      minmax(150px, .55fr)
    )
    auto;
  gap: 9px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--color-border);
  background: #fbfdff;
}

.search-field {
  display: flex;
  min-height: 41px;
  min-width: 0;
  align-items: center;
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

.search-field svg {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  fill: none;
  stroke: #64748b;
  stroke-width: 1.8;
}

.search-field input {
  min-width: 0;
  flex: 1;
  margin-left: 8px;
  outline: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}

.filters select,
.clear-filters {
  min-width: 0;
  min-height: 41px;
  padding: 0 11px;
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.filters select:focus {
  outline: 0;
  border-color: var(--color-primary);
  box-shadow:
    0 0 0 3px
    rgba(37, 99, 235, .09);
}

.clear-filters {
  cursor: pointer;
}

.clear-filters:hover {
  border-color: #bfdbfe;
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
}

/* ============================================================
   DIRECTORIO
   ============================================================ */

.directory-grid {
  display: grid;
  grid-template-columns:
    repeat(
      3,
      minmax(0, 1fr)
    );
  gap: 12px;
  padding: 14px;
}

:deep(.person-card) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 15px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    transform 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

:deep(.person-card:hover) {
  transform: translateY(-1px);
  border-color: #bfdbfe;
  box-shadow: var(--shadow-md);
}

:deep(.person-card-head) {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 10px;
}

:deep(.person-card-title) {
  min-width: 0;
  flex: 1;
}

:deep(.person-card-title span) {
  display: block;
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
}

:deep(.person-card-title strong) {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ============================================================
   AVATARES
   ============================================================ */

:deep(.person-avatar) {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary-dark);
  font-size: 13px;
  font-weight: 800;
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
  width: 34px;
  height: 34px;
  flex-basis: 34px;
  font-size: 11px;
}

/* ============================================================
   ESTADOS
   ============================================================ */

:deep(.status-badge),
:deep(.account-status) {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

:deep(.status-badge.active) {
  background: #dcfce7;
  color: #047857;
}

:deep(.status-badge.inactive) {
  background: #fee2e2;
  color: #b91c1c;
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
  min-height: 23px;
  padding: 0 7px;
  font-size: 12px;
}

/* ============================================================
   DATOS DE TARJETA
   ============================================================ */

:deep(.person-card-body) {
  display: grid;
  gap: 9px;
  margin-top: 14px;
}

:deep(.person-card-body > div) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

:deep(.person-card-body span) {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

:deep(.person-card-body strong) {
  overflow: hidden;
  color: #475569;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.person-card-metrics) {
  display: grid;
  grid-template-columns:
    repeat(
      3,
      minmax(0, 1fr)
    );
  gap: 7px;
  margin-top: 14px;
}

:deep(.person-card-metrics > div) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 9px;
  border: 1px solid #eef2f7;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

:deep(.person-card-metrics strong) {
  color: var(--color-text);
  font-size: 16px;
}

:deep(.person-card-metrics span) {
  margin-top: 2px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.person-card-footer) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #eef2f7;
}

:deep(.open-detail) {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
}

/* ============================================================
   JERARQUÍA
   ============================================================ */

.hierarchy-view {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.hierarchy-group {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.hierarchy-head {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 11px;
  padding: 13px;
  border: 0;
  background: #f8fbff;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.hierarchy-head:hover {
  background: var(--color-primary-soft);
}

.hierarchy-head > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.hierarchy-head span {
  display: block;
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
}

.hierarchy-head strong {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--color-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hierarchy-head small {
  display: block;
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.hierarchy-units {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
}

.hierarchy-units strong {
  color: var(--color-text);
  font-size: 18px;
}

.hierarchy-units span {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.hierarchy-children {
  display: grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );
  gap: 8px;
  padding: 11px;
  border-top: 1px solid #eef2f7;
}

.hierarchy-child {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 1px solid #e8eef4;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.hierarchy-child:hover {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.hierarchy-child > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}

.hierarchy-child strong {
  display: block;
  overflow: hidden;
  color: #334155;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hierarchy-child span {
  display: block;
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.hierarchy-empty {
  padding: 18px;
  border-top: 1px solid #eef2f7;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: center;
}

.orphan-head {
  cursor: default;
}

.orphan-head:hover {
  background: #f8fbff;
}

.orphan-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  border-radius: var(--radius-md);
  background: #fef3c7;
  color: #b45309;
  font-weight: 800;
}

/* ============================================================
   CARGA / VACÍOS / ERROR
   ============================================================ */

:deep(.empty-state),
.state-panel {
  display: flex;
  min-height: 230px;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 28px;
  text-align: center;
}

:deep(.empty-state strong),
.state-panel strong {
  margin-top: 10px;
  color: #334155;
  font-size: 15px;
}

:deep(.empty-state span),
.state-panel span {
  max-width: 430px;
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

:deep(.empty-icon),
.state-icon {
  display: grid;
  width: 43px;
  height: 43px;
  place-items: center;
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
  color: #64748b;
  font-weight: 800;
}

.error-state .state-icon {
  background: var(--color-error-soft);
  color: var(--color-error);
}

.error-state button {
  min-height: 38px;
  margin-top: 14px;
  padding: 0 13px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.spinner {
  width: 26px;
  height: 26px;
  border: 3px solid #dbeafe;
  border-top-color: var(--color-primary);
  border-radius: 999px;
  animation:
    people-spin
    .7s
    linear
    infinite;
}

/* ============================================================
   DRAWER
   ============================================================ */

.drawer-overlay {
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

.person-drawer {
  width: min(480px, 100%);
  height: 100%;
  overflow-y: auto;
  border-left: 1px solid var(--color-border);
  background: var(--color-background);
  box-shadow:
    -20px 0 60px
    rgba(15, 23, 42, .16);
}

.drawer-header {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 15px;
  padding: 18px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(255, 255, 255, .98);
  backdrop-filter: blur(10px);
}

.drawer-person {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
}

.drawer-person > div:last-child {
  min-width: 0;
}

.drawer-person span {
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
}

.drawer-person h2 {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 17px;
  line-height: 1.35;
}

.drawer-close {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: #64748b;
  cursor: pointer;
  font-size: 21px;
}

.drawer-close:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.drawer-content {
  display: grid;
  gap: 11px;
  padding: 14px;
}

.detail-status {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

/* ============================================================
   SECCIONES DEL DRAWER
   ============================================================ */

:deep(.detail-section) {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

:deep(.detail-section h3) {
  margin: 0 0 11px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
}

:deep(.detail-rows) {
  display: grid;
  gap: 10px;
}

:deep(.detail-row) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 9px;
  border-bottom: 1px solid #eef2f7;
}

:deep(.detail-row:last-child) {
  padding-bottom: 0;
  border-bottom: 0;
}

:deep(.detail-row span) {
  color: var(--color-text-secondary);
  font-size: 12px;
}

:deep(.detail-row strong) {
  max-width: 62%;
  overflow-wrap: anywhere;
  color: #334155;
  font-size: 12px;
  font-weight: 650;
  text-align: right;
}

:deep(.detail-row strong.mono) {
  font-family:
    "SFMono-Regular",
    Consolas,
    monospace;
  font-size: 11px;
}

.read-only-note {
  padding: 12px;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: #1e40af;
  font-size: 12px;
  line-height: 1.5;
}

/* ============================================================
   ANIMACIÓN
   ============================================================ */

@keyframes people-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

@media (
  max-width: 1100px
) {
  .summary-grid {
    grid-template-columns:
      repeat(
        3,
        minmax(0, 1fr)
      );
  }

  .directory-grid {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .filters {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }

  .search-field {
    grid-column:
      1 /
      -1;
  }
}

@media (
  max-width: 800px
) {
  .people-page {
    padding:
      22px
      18px
      40px;
  }

  .people-hero {
    align-items: stretch;
    flex-direction: column;
  }

  .refresh-button {
    align-self: flex-start;
  }
}

@media (
  max-width: 640px
) {
  .people-page {
    padding:
      18px
      14px
      32px;
  }

  .people-hero h1 {
    font-size: 24px;
  }

  .refresh-button {
    width: 100%;
  }

  .summary-grid {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
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
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
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

  .drawer-content {
    padding: 11px;
  }

  :deep(.detail-row) {
    flex-direction: column;
    gap: 3px;
  }

  :deep(.detail-row strong) {
    max-width: none;
    text-align: left;
  }
}
</style>