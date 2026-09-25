<template>
  <div class="app-root">
    <!-- =========================================================
         CARGANDO AUTENTICACIÓN
    ========================================================== -->
    <div
      v-if="loading"
      class="auth-loading"
    >
      <div class="loading-card">
        <div class="loading-logo">
          <span>R</span>
        </div>

        <div class="loading-spinner"></div>

        <strong>
          Cargando sistema
        </strong>

        <span>
          Validando tu sesión...
        </span>
      </div>
    </div>

    <!-- =========================================================
         LOGIN
    ========================================================== -->
    <div
      v-else-if="!authenticated"
      class="login-page"
    >
      <div class="login-background">
        <div class="login-glow login-glow-a"></div>
        <div class="login-glow login-glow-b"></div>
      </div>

      <main class="login-card">
        <section class="login-brand">
          <div class="brand-icon">
            <span>R</span>
          </div>

          <div>
            <div class="brand-kicker">
              Plataforma operativa
            </div>

            <h1>
              Control de Rutas
            </h1>

            <p>
              Accede al mapa, planes de trabajo
              y estructura operativa según tu perfil.
            </p>
          </div>
        </section>

        <form
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <div>
            <label for="email">
              Correo electrónico
            </label>

            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="usuario@empresa.com"
              :disabled="submitting"
              required
            />
          </div>

          <div>
            <label for="password">
              Contraseña
            </label>

            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              :disabled="submitting"
              required
            />
          </div>

          <div
            v-if="loginError"
            class="login-error"
          >
            <span class="login-error-icon">
              !
            </span>

            <span>
              {{ loginError }}
            </span>
          </div>

          <button
            type="submit"
            class="login-button"
            :disabled="submitting"
          >
            <span
              v-if="submitting"
              class="button-spinner"
            ></span>

            <span>
              {{
                submitting
                  ? 'Ingresando...'
                  : 'Iniciar sesión'
              }}
            </span>
          </button>
        </form>
      </main>
    </div>

    <!-- =========================================================
         APLICACIÓN
    ========================================================== -->
    <div
      v-else
      class="application-shell"
      :class="{
        'farmacias-shell': isFarmacias,
        'operations-shell': isOperations,
      }"
    >
      <!-- =======================================================
           FARMACIAS
      ======================================================== -->
      <div
        v-if="isFarmacias"
        class="farmacias-layout"
        :class="{
          'sidebar-collapsed': sidebarCollapsed,
        }"
      >
        <!-- =====================================================
             SIDEBAR
        ====================================================== -->
        <aside class="app-sidebar">
          <div class="sidebar-header">
            <div class="sidebar-brand">
              <div class="sidebar-brand-mark">
                R
              </div>

              <div class="sidebar-brand-copy">
                <strong>
                  Control de Rutas
                </strong>

                <span>
                  Farmacias
                </span>
              </div>
            </div>

            <button
              type="button"
              class="sidebar-toggle"
              :title="
                sidebarCollapsed
                  ? 'Expandir menú'
                  : 'Contraer menú'
              "
              :aria-label="
                sidebarCollapsed
                  ? 'Expandir menú'
                  : 'Contraer menú'
              "
              @click="
                sidebarCollapsed =
                  !sidebarCollapsed
              "
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  v-if="sidebarCollapsed"
                  d="m9 6 6 6-6 6"
                />

                <path
                  v-else
                  d="m15 6-6 6 6 6"
                />
              </svg>
            </button>
          </div>

          <nav
            class="sidebar-navigation"
            aria-label="Navegación Farmacias"
          >
            <section
              v-if="operationMenu.length"
              class="sidebar-section"
            >
              <div class="sidebar-section-label">
                Operación
              </div>

              <RouterLink
                v-for="item in operationMenu"
                :key="item.to"
                :to="item.to"
                class="sidebar-nav-item"
                :title="
                  sidebarCollapsed
                    ? item.label
                    : undefined
                "
              >
                <span class="sidebar-nav-icon">
                  <!-- Agenda -->
                  <svg
                    v-if="item.key === 'agenda'"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="16"
                      rx="2"
                    />

                    <path
                      d="M8 3v4M16 3v4M3 10h18"
                    />

                    <path
                      d="M8 14h3M8 17h6"
                    />
                  </svg>

                  <!-- Ruta territorial -->
                  <svg
                    v-else-if="
                      item.key === 'territorial'
                    "
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      cx="6"
                      cy="18"
                      r="2"
                    />

                    <circle
                      cx="18"
                      cy="6"
                      r="2"
                    />

                    <path
                      d="M8 18h2a4 4 0 0 0 4-4v-4a4 4 0 0 1 4-4"
                    />
                  </svg>

                  <!-- Mapa -->
                  <svg
                    v-else-if="item.key === 'map'"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"
                    />

                    <path
                      d="M9 3v15M15 6v15"
                    />
                  </svg>

                  <!-- Planes -->
                  <svg
                    v-else-if="item.key === 'plans'"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect
                      x="4"
                      y="5"
                      width="16"
                      height="16"
                      rx="2"
                    />

                    <path
                      d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h5"
                    />
                  </svg>
                </span>

                <span class="sidebar-nav-label">
                  {{ item.label }}
                </span>
              </RouterLink>
            </section>

            <section
              v-if="managementMenu.length"
              class="sidebar-section"
            >
              <div class="sidebar-section-label">
                Gestión
              </div>

              <RouterLink
                v-for="item in managementMenu"
                :key="item.to"
                :to="item.to"
                class="sidebar-nav-item"
                :title="
                  sidebarCollapsed
                    ? item.label
                    : undefined
                "
              >
                <span class="sidebar-nav-icon">
                  <!-- Aprobaciones -->
                  <svg
                    v-if="item.key === 'approvals'"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M9 11l2 2 4-4"
                    />

                    <path
                      d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
                    />
                  </svg>

                  <!-- Asignaciones -->
                  <svg
                    v-else-if="
                      item.key === 'assignments'
                    "
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      cx="7"
                      cy="7"
                      r="3"
                    />

                    <circle
                      cx="17"
                      cy="17"
                      r="3"
                    />

                    <path
                      d="M10 7h4a3 3 0 0 1 3 3v4M14 17h-4a3 3 0 0 1-3-3v-4"
                    />
                  </svg>

                  <!-- Personas -->
                  <svg
                    v-else
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      cx="9"
                      cy="8"
                      r="4"
                    />

                    <path
                      d="M2 21a7 7 0 0 1 14 0M17 11a4 4 0 0 1 0-7M18 14a6 6 0 0 1 4 6"
                    />
                  </svg>
                </span>

                <span class="sidebar-nav-label">
                  {{ item.label }}
                </span>
              </RouterLink>
            </section>
          </nav>

          <div class="sidebar-footer">
            <div class="sidebar-footer-badge">
              <span class="sidebar-footer-dot"></span>

              <span class="sidebar-footer-text">
                Sistema operativo
              </span>
            </div>
          </div>
        </aside>

        <!-- =====================================================
             TOPBAR
        ====================================================== -->
        <header class="app-topbar">
          <div class="topbar-context">
            <div class="breadcrumbs">
              <span>
                Farmacias
              </span>

              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="m9 6 6 6-6 6"
                />
              </svg>

              <strong>
                {{ activePageTitle }}
              </strong>
            </div>

            <div class="topbar-page-title">
              {{ activePageTitle }}
            </div>
          </div>

          <div class="topbar-actions">
            <!-- ===============================================
                 SELECTOR DE ÁREA PARA ADMIN
            ================================================ -->
            <div
              v-if="showAreaSwitcher"
              class="area-switcher"
              aria-label="Cambiar módulo"
            >
              <button
                v-for="availableArea in allowedAreas"
                :key="availableArea"
                type="button"
                class="area-switch-button"
                :class="{
                  active:
                    normalizedArea ===
                    availableArea,
                }"
                :disabled="switchingArea"
                @click="
                  handleAreaSwitch(
                    availableArea
                  )
                "
              >
                <strong>
                  {{
                    availableArea ===
                    'FARMACIAS'
                      ? 'Farmacias'
                      : 'Operaciones'
                  }}
                </strong>

                <span>
                  {{
                    availableArea ===
                    'FARMACIAS'
                      ? 'Supervisión'
                      : 'Rutas'
                  }}
                </span>
              </button>
            </div>

            <div class="topbar-user">
              <div class="session-avatar">
                {{ userInitial }}
              </div>

              <div class="session-info">
                <strong>
                  {{ displayName }}
                </strong>

                <span>
                  {{ profileLabel }}
                </span>
              </div>
            </div>

            <button
              class="topbar-logout"
              type="button"
              title="Cerrar sesión"
              @click="handleLogout"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M10 17l5-5-5-5"
                />

                <path
                  d="M15 12H3"
                />

                <path
                  d="M13 3h5a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-5"
                />
              </svg>

              <span>
                Salir
              </span>
            </button>
          </div>
        </header>

        <!-- =====================================================
             CONTENIDO
        ====================================================== -->
        <main class="farmacias-main">
          <RouterView />
        </main>
      </div>

      <!-- =======================================================
           OPERACIONES
      ======================================================== -->
      <template v-else-if="isOperations">
        <RouterView />

        <div class="session-card">
          <div class="session-avatar">
            {{ userInitial }}
          </div>

          <div class="session-info">
            <strong>
              {{ displayName }}
            </strong>

            <span>
              {{ profileLabel }}
            </span>
          </div>

          <div
            v-if="showAreaSwitcher"
            class="area-switcher area-switcher-compact"
            aria-label="Cambiar módulo"
          >
            <button
              v-for="availableArea in allowedAreas"
              :key="availableArea"
              type="button"
              class="area-switch-button"
              :class="{
                active:
                  normalizedArea ===
                  availableArea,
              }"
              :disabled="switchingArea"
              @click="
                handleAreaSwitch(
                  availableArea
                )
              "
            >
              <strong>
                {{
                  availableArea ===
                  'FARMACIAS'
                    ? 'Farmacias'
                    : 'Operaciones'
                }}
              </strong>
            </button>
          </div>

          <button
            class="logout-button"
            type="button"
            title="Cerrar sesión"
            @click="handleLogout"
          >
            Salir
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import {
  computed,
  onMounted,
  ref,
  watch,
} from 'vue'

import {
  RouterLink,
  RouterView,
  useRoute,
  useRouter,
} from 'vue-router'

import {
  useAuth,
} from './composables/useAuth.js'

const {
  profile,

  loading,
  authenticated,
  displayName,

  systemRole,
  allowedAreas,
  canSwitchAreas,
  switchingArea,

  initializeAuth,
  signIn,
  signOut,
  switchArea,
} =
  useAuth()

const route =
  useRoute()

const router =
  useRouter()

const email =
  ref('')

const password =
  ref('')

const submitting =
  ref(false)

const loginError =
  ref(null)

const sidebarCollapsed =
  ref(false)

/*
 * ============================================================
 * PERFIL
 * ============================================================
 */

const normalizedArea =
  computed(
    () =>
      String(
        profile.value?.area ||
        '',
      )
        .trim()
        .toUpperCase()
  )

const normalizedRole =
  computed(
    () =>
      String(
        profile.value?.rol ||
        '',
      )
        .trim()
        .toUpperCase()
  )

const isFarmacias =
  computed(
    () =>
      normalizedArea.value ===
      'FARMACIAS'
  )

const isOperations =
  computed(
    () =>
      normalizedArea.value ===
      'OPERACIONES'
  )

const userInitial =
  computed(
    () => {
      const value =
        String(
          displayName.value ||
          '?',
        ).trim()

      return (
        value
          .charAt(0)
          .toUpperCase() ||
        '?'
      )
    }
  )

const profileLabel =
  computed(
    () => {
      const currentArea =
        formatLabel(
          profile.value?.area,
        )

      if (
        systemRole.value ===
        'ADMIN'
      ) {
        return currentArea
          ? `Administrador · ${currentArea}`
          : 'Administrador'
      }

      const currentRole =
        formatLabel(
          profile.value?.rol,
        )

      if (
        currentArea &&
        currentRole
      ) {
        return `${currentArea} · ${currentRole}`
      }

      return (
        currentRole ||
        currentArea ||
        'Usuario'
      )
    }
  )

const showAreaSwitcher =
  computed(
    () =>
      systemRole.value ===
        'ADMIN' &&
      canSwitchAreas.value
  )

/*
 * ============================================================
 * NAVEGACIÓN FARMACIAS
 * ============================================================
 */

const farmaciasMenuDefinition = [
  {
    key: 'agenda',
    label: 'Agenda',
    to: '/farmacias/agenda',
    roles: [
      'DIRECTOR',
      'GERENTE',
      'COORDINADOR',
      'SUPERVISOR',
    ],
  },
  {
    key: 'territorial',
    label: 'Ruta territorial',
    to: '/farmacias/ruta-territorial',
    roles: [
      'DIRECTOR',
      'GERENTE',
      'COORDINADOR',
      'SUPERVISOR',
    ],
  },
  {
    key: 'map',
    label: 'Mapa',
    to: '/farmacias/mapa',
    roles: [
      'DIRECTOR',
      'GERENTE',
      'COORDINADOR',
      'SUPERVISOR',
    ],
  },
  {
    key: 'plans',
    label: 'Planes',
    to: '/farmacias/planes',
    roles: [
      'DIRECTOR',
      'GERENTE',
      'COORDINADOR',
      'SUPERVISOR',
    ],
  },
  {
    key: 'approvals',
    label: 'Aprobaciones',
    to: '/farmacias/aprobaciones',
    roles: [
      'DIRECTOR',
      'GERENTE',
      'COORDINADOR',
    ],
  },
  {
    key: 'assignments',
    label: 'Asignaciones',
    to: '/farmacias/asignaciones',
    roles: [
      'DIRECTOR',
      'GERENTE',
      'COORDINADOR',
    ],
  },
  {
    key: 'people',
    label: 'Personas',
    to: '/farmacias/personas',
    roles: [
      'DIRECTOR',
      'GERENTE',
      'COORDINADOR',
    ],
  },
]

const farmaciasMenu =
  computed(
    () =>
      farmaciasMenuDefinition
        .filter(
          item =>
            item.roles.includes(
              normalizedRole.value,
            )
        )
  )

const operationMenu =
  computed(
    () =>
      farmaciasMenu.value.filter(
        item =>
          [
            'agenda',
            'territorial',
            'map',
            'plans',
          ].includes(
            item.key
          )
      )
  )

const managementMenu =
  computed(
    () =>
      farmaciasMenu.value.filter(
        item =>
          [
            'approvals',
            'assignments',
            'people',
          ].includes(
            item.key
          )
      )
  )

const activeMenuItem =
  computed(
    () => {
      const matches =
        farmaciasMenu.value
          .filter(
            item =>
              route.path ===
                item.to ||
              route.path.startsWith(
                `${item.to}/`
              )
          )
          .sort(
            (a, b) =>
              b.to.length -
              a.to.length
          )

      return (
        matches[0] ||
        null
      )
    }
  )

const activePageTitle =
  computed(
    () =>
      activeMenuItem.value
        ?.label ||
      'Farmacias'
  )

/*
 * ============================================================
 * AUTH
 * ============================================================
 */

onMounted(
  async () => {
    await initializeAuth()
  }
)

/*
 * ============================================================
 * CONTROL DE NAVEGACIÓN SEGÚN PERFIL
 *
 * Esto protege la navegación de interfaz.
 * La seguridad real de datos continúa en backend.
 * ============================================================
 */

watch(
  [
    authenticated,
    profile,

    () =>
      route.path,
  ],

  async () => {
    if (
      loading.value ||
      !authenticated.value ||
      !profile.value
    ) {
      return
    }

    const defaultPath =
      getDefaultPath()

    if (
      !routeAllowedForProfile(
        route,
      )
    ) {
      if (
        route.path !==
        defaultPath
      ) {
        await router.replace(
          defaultPath,
        )
      }

      return
    }

    if (
      route.path ===
      '/'
    ) {
      await router.replace(
        defaultPath,
      )
    }
  },

  {
    immediate:
      true,
  },
)

/*
 * ============================================================
 * LOGIN
 * ============================================================
 */

async function handleLogin() {
  if (
    submitting.value
  ) {
    return
  }

  loginError.value =
    null

  const normalizedEmail =
    email.value
      .trim()
      .toLowerCase()

  if (
    !normalizedEmail ||
    !password.value
  ) {
    loginError.value =
      'Captura correo y contraseña.'

    return
  }

  submitting.value =
    true

  try {
    await signIn(
      normalizedEmail,
      password.value,
    )

    password.value =
      ''
  } catch (
    error
  ) {
    loginError.value =
      error?.message ||
      'No fue posible iniciar sesión.'
  } finally {
    submitting.value =
      false
  }
}

/*
 * ============================================================
 * CAMBIO DE ÁREA
 * ============================================================
 */

async function handleAreaSwitch(
  nextArea,
) {
  const normalized =
    String(
      nextArea ??
      ''
    )
      .trim()
      .toUpperCase()

  if (
    !normalized ||
    normalized ===
      normalizedArea.value ||
    switchingArea.value
  ) {
    return
  }

  try {
    await switchArea(
      normalized
    )

    const targetPath =
      normalized ===
      'FARMACIAS'
        ? '/farmacias/mapa'
        : '/operaciones/mapa'

    if (
      route.path !==
      targetPath
    ) {
      await router.replace(
        targetPath
      )
    }
  } catch (
    areaError
  ) {
    console.error(
      '[app] Error cambiando área:',
      areaError
    )

    alert(
      areaError?.message ||
      'No fue posible cambiar de área.'
    )
  }
}

/*
 * ============================================================
 * LOGOUT
 * ============================================================
 */

async function handleLogout() {
  try {
    await signOut()
  } catch (
    error
  ) {
    console.error(
      'Error cerrando sesión:',
      error,
    )
  }
}

/*
 * ============================================================
 * PERMISOS DE RUTA
 * ============================================================
 */

function routeAllowedForProfile(
  currentRoute,
) {
  const area =
    normalizedArea.value

  const role =
    normalizedRole.value

  if (
    area ===
    'OPERACIONES'
  ) {
    return (
      currentRoute.path ===
      '/operaciones/mapa'
    )
  }

  if (
    area ===
    'FARMACIAS'
  ) {
    if (
      !currentRoute.path.startsWith(
        '/farmacias/',
      )
    ) {
      return false
    }

    const requiredRoles =
      currentRoute.meta?.roles

    if (
      Array.isArray(
        requiredRoles,
      ) &&
      requiredRoles.length
    ) {
      return requiredRoles.includes(
        role,
      )
    }

    return true
  }

  return false
}

function getDefaultPath() {
  if (
    normalizedArea.value ===
    'OPERACIONES'
  ) {
    return '/operaciones/mapa'
  }

  return '/farmacias/mapa'
}

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

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
</script>

<style>
html,
body,
#app,
.app-root {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100%;
}

* {
  box-sizing: border-box;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  color: inherit;
}

.application-shell {
  position: relative;
  width: 100%;
  min-height: 100vh;
}

/*
 * ============================================================
 * FARMACIAS · SHELL
 * ============================================================
 */

.farmacias-layout {
  --shell-sidebar-width:
    var(--sidebar-width);

  width: 100%;
  min-height: 100vh;

  background:
    var(--color-background);
}

.farmacias-layout.sidebar-collapsed {
  --shell-sidebar-width:
    var(--sidebar-collapsed-width);
}

/*
 * ============================================================
 * SIDEBAR
 * ============================================================
 */

.app-sidebar {
  position: fixed;

  z-index: 12000;

  top: 0;
  bottom: 0;
  left: 0;

  display: flex;

  width:
    var(--shell-sidebar-width);

  flex-direction: column;

  border-right:
    1px solid
    var(--color-border);

  background:
    var(--color-surface);

  transition:
    width 180ms ease;
}

.sidebar-header {
  display: flex;

  min-height:
    var(--topbar-height);

  align-items: center;

  justify-content:
    space-between;

  gap: 10px;

  padding:
    0
    14px;

  border-bottom:
    1px solid
    var(--color-border);
}

.sidebar-brand {
  display: flex;

  min-width: 0;

  align-items: center;

  gap: 10px;
}

.sidebar-brand-mark {
  display: grid;

  width: 36px;
  height: 36px;

  flex:
    0
    0
    36px;

  place-items: center;

  border-radius:
    var(--radius-md);

  background:
    var(--color-primary);

  color: #ffffff;

  font-size: 17px;
  font-weight: 800;

  box-shadow:
    var(--shadow-sm);
}

.sidebar-brand-copy {
  display: flex;

  min-width: 0;

  flex-direction: column;
}

.sidebar-brand-copy strong {
  overflow: hidden;

  color:
    var(--color-text);

  font-size: 14px;
  font-weight: 750;

  line-height: 1.2;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-brand-copy span {
  margin-top: 2px;

  color:
    var(--color-text-secondary);

  font-size: 12px;

  line-height: 1.2;
}

.sidebar-toggle {
  display: grid;

  width: 32px;
  height: 32px;

  flex:
    0
    0
    32px;

  place-items: center;

  padding: 0;

  border:
    1px solid
    var(--color-border);

  border-radius:
    var(--radius-md);

  background:
    var(--color-surface);

  color:
    var(--color-text-secondary);

  cursor: pointer;

  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.sidebar-toggle:hover {
  border-color: #cbd5e1;

  background:
    var(--color-surface-muted);

  color:
    var(--color-text);
}

.sidebar-toggle svg {
  width: 17px;
  height: 17px;

  fill: none;

  stroke: currentColor;

  stroke-width: 2;

  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-navigation {
  min-height: 0;

  flex: 1;

  overflow-y: auto;

  padding:
    16px
    10px;
}

.sidebar-section +
.sidebar-section {
  margin-top: 22px;
}

.sidebar-section-label {
  margin:
    0
    10px
    7px;

  color:
    var(--color-text-secondary);

  font-size: 12px;
  font-weight: 700;

  letter-spacing: .04em;

  text-transform: uppercase;
}

.sidebar-nav-item {
  display: flex;

  min-height: 42px;

  align-items: center;

  gap: 11px;

  margin-bottom: 3px;

  padding:
    0
    11px;

  border:
    1px solid transparent;

  border-radius:
    var(--radius-md);

  color:
    #475569;

  text-decoration: none;

  font-size: 14px;
  font-weight: 600;

  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.sidebar-nav-item:hover {
  background:
    var(--color-surface-muted);

  color:
    var(--color-text);
}

.sidebar-nav-item.router-link-active {
  border-color:
    #bfdbfe;

  background:
    var(--color-primary-soft);

  color:
    var(--color-primary-dark);
}

.sidebar-nav-icon {
  display: grid;

  width: 20px;
  height: 20px;

  flex:
    0
    0
    20px;

  place-items: center;
}

.sidebar-nav-icon svg {
  width: 20px;
  height: 20px;

  fill: none;

  stroke: currentColor;

  stroke-width: 1.8;

  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-nav-label {
  overflow: hidden;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-footer {
  padding:
    12px
    14px;

  border-top:
    1px solid
    var(--color-border);
}

.sidebar-footer-badge {
  display: flex;

  align-items: center;

  gap: 8px;

  min-height: 34px;

  color:
    var(--color-text-secondary);

  font-size: 12px;
  font-weight: 600;
}

.sidebar-footer-dot {
  width: 8px;
  height: 8px;

  flex:
    0
    0
    8px;

  border-radius: 999px;

  background:
    var(--color-success);
}

/*
 * SIDEBAR CONTRAÍDO
 */

.sidebar-collapsed
.sidebar-brand-copy,
.sidebar-collapsed
.sidebar-section-label,
.sidebar-collapsed
.sidebar-nav-label,
.sidebar-collapsed
.sidebar-footer-text {
  display: none;
}

.sidebar-collapsed
.sidebar-header {
  flex-direction: column;

  justify-content:
    center;

  gap: 6px;

  min-height: 112px;

  padding:
    10px
    8px;
}

.sidebar-collapsed
.sidebar-brand {
  justify-content: center;
}

.sidebar-collapsed
.sidebar-navigation {
  padding:
    14px
    8px;
}

.sidebar-collapsed
.sidebar-section +
.sidebar-section {
  margin-top: 14px;
}

.sidebar-collapsed
.sidebar-nav-item {
  justify-content: center;

  padding: 0;
}

.sidebar-collapsed
.sidebar-footer {
  display: flex;

  justify-content: center;

  padding:
    12px
    8px;
}

/*
 * ============================================================
 * TOPBAR
 * ============================================================
 */

.app-topbar {
  position: fixed;

  z-index: 11500;

  top: 0;
  right: 0;
  left:
    var(--shell-sidebar-width);

  display: flex;

  min-height:
    var(--topbar-height);

  align-items: center;

  justify-content:
    space-between;

  gap: 20px;

  padding:
    0
    20px;

  border-bottom:
    1px solid
    var(--color-border);

  background:
    rgba(
      255,
      255,
      255,
      .96
    );

  backdrop-filter:
    blur(10px);

  transition:
    left 180ms ease;
}

.topbar-context {
  min-width: 0;
}

.breadcrumbs {
  display: flex;

  align-items: center;

  gap: 5px;

  color:
    var(--color-text-secondary);

  font-size: 12px;

  line-height: 1.2;
}

.breadcrumbs strong {
  overflow: hidden;

  color:
    #475569;

  font-weight: 650;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.breadcrumbs svg {
  width: 13px;
  height: 13px;

  flex:
    0
    0
    13px;

  fill: none;

  stroke: currentColor;

  stroke-width: 2;

  stroke-linecap: round;
  stroke-linejoin: round;
}

.topbar-page-title {
  margin-top: 3px;

  overflow: hidden;

  color:
    var(--color-text);

  font-size: 16px;
  font-weight: 700;

  line-height: 1.2;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-actions {
  display: flex;

  min-width: 0;

  align-items: center;

  justify-content: flex-end;

  gap: 10px;
}

.topbar-user {
  display: flex;

  min-width: 0;

  align-items: center;

  gap: 9px;
}

.session-avatar {
  display: grid;

  width: 36px;
  height: 36px;

  flex:
    0
    0
    36px;

  place-items: center;

  border-radius:
    var(--radius-md);

  background:
    var(--color-primary-soft);

  color:
    var(--color-primary-dark);

  font-size: 15px;
  font-weight: 800;
}

.session-info {
  display: flex;

  min-width: 0;

  flex-direction: column;
}

.session-info strong {
  overflow: hidden;

  max-width: 180px;

  color:
    var(--color-text);

  font-size: 13px;
  font-weight: 700;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-info span {
  margin-top: 1px;

  overflow: hidden;

  max-width: 180px;

  color:
    var(--color-text-secondary);

  font-size: 12px;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-logout {
  display: flex;

  min-height: 36px;

  align-items: center;

  gap: 7px;

  padding:
    0
    11px;

  border:
    1px solid
    var(--color-border);

  border-radius:
    var(--radius-md);

  background:
    var(--color-surface);

  color:
    #475569;

  cursor: pointer;

  font-size: 13px;
  font-weight: 650;

  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.topbar-logout:hover {
  border-color: #cbd5e1;

  background:
    var(--color-surface-muted);

  color:
    var(--color-text);
}

.topbar-logout svg {
  width: 17px;
  height: 17px;

  fill: none;

  stroke: currentColor;

  stroke-width: 1.8;

  stroke-linecap: round;
  stroke-linejoin: round;
}

/*
 * ============================================================
 * ÁREA ADMIN
 * ============================================================
 */

.area-switcher {
  display: flex;

  flex:
    0
    0
    auto;

  gap: 3px;

  padding: 3px;

  border:
    1px solid
    var(--color-border);

  border-radius:
    var(--radius-md);

  background:
    var(--color-surface-muted);
}

.area-switch-button {
  display: flex;

  min-width: 88px;
  min-height: 36px;

  flex-direction: column;

  align-items: flex-start;
  justify-content: center;

  gap: 1px;

  padding:
    4px
    9px;

  border:
    1px solid transparent;

  border-radius:
    var(--radius-sm);

  background: transparent;

  color:
    var(--color-text-secondary);

  cursor: pointer;

  line-height: 1.05;
}

.area-switch-button strong {
  color: inherit;

  font-size: 12px;
  font-weight: 700;
}

.area-switch-button span {
  color: inherit;

  font-size: 12px;

  opacity: .82;
}

.area-switch-button:hover:not(:disabled) {
  background:
    var(--color-surface);

  color:
    var(--color-primary-dark);
}

.area-switch-button.active {
  border-color:
    #bfdbfe;

  background:
    var(--color-surface);

  color:
    var(--color-primary-dark);

  box-shadow:
    var(--shadow-sm);
}

.area-switch-button:disabled {
  cursor: wait;

  opacity: .55;
}

/*
 * ============================================================
 * CONTENIDO FARMACIAS
 * ============================================================
 */

.farmacias-main {
  position: fixed;

  top:
    var(--topbar-height);

  right: 0;
  bottom: 0;

  left:
    var(--shell-sidebar-width);

  overflow: auto;

  background:
    var(--color-background);

  transition:
    left 180ms ease;
}

/*
 * MapPage conserva internamente #map-wrapper como viewport.
 * Dentro del shell de Farmacias debe ocupar solamente el área
 * disponible entre sidebar y topbar.
 */

.farmacias-shell
#map-wrapper {
  width: 100%;
  height: 100%;

  min-width: 0;
  min-height: 100%;
}

.farmacias-shell
.farmacias-map-tools {
  top: 16px;
  right: 68px;
}


/*
 * ============================================================
 * AUTH / LOGIN
 * ============================================================
 */

.auth-loading,
.login-page {
  min-height: 100vh;
}

.auth-loading {
  display: grid;

  place-items: center;

  background:
    var(--color-background);
}

.loading-card {
  display: flex;

  width:
    min(
      360px,
      calc(100vw - 40px)
    );

  flex-direction: column;

  align-items: center;

  gap: 12px;

  padding: 34px;

  border:
    1px solid
    var(--color-border);

  border-radius:
    var(--radius-xl);

  background:
    var(--color-surface);

  box-shadow:
    var(--shadow-lg);
}

.loading-logo,
.brand-icon {
  display: grid;

  place-items: center;

  color: #ffffff;

  background:
    var(--color-primary);

  font-weight: 800;
}

.loading-logo {
  width: 58px;
  height: 58px;

  margin-bottom: 5px;

  border-radius:
    var(--radius-xl);

  font-size: 26px;
}

.loading-card strong {
  color:
    var(--color-text);

  font-size: 17px;
}

.loading-card > span {
  color:
    var(--color-text-secondary);

  font-size: 14px;
}

.loading-spinner,
.button-spinner {
  border-radius: 999px;

  border-style: solid;

  animation:
    auth-spin
    .7s
    linear
    infinite;
}

.loading-spinner {
  width: 27px;
  height: 27px;

  margin-top: 4px;

  border-width: 3px;

  border-color: #dbeafe;

  border-top-color:
    var(--color-primary);
}

.login-page {
  position: relative;

  display: grid;

  place-items: center;

  overflow: hidden;

  padding:
    32px
    20px;

  background:
    var(--color-background);
}

.login-background {
  position: absolute;

  inset: 0;

  overflow: hidden;

  pointer-events: none;
}

.login-glow {
  position: absolute;

  border-radius: 999px;

  filter:
    blur(10px);

  opacity: .18;
}

.login-glow-a {
  width: 560px;
  height: 560px;

  top: -250px;
  left: -180px;

  background: #60a5fa;
}

.login-glow-b {
  width: 520px;
  height: 520px;

  right: -210px;
  bottom: -260px;

  background:
    var(--color-primary);
}

.login-card {
  position: relative;

  z-index: 1;

  width:
    min(
      470px,
      100%
    );

  overflow: hidden;

  border:
    1px solid
    var(--color-border);

  border-radius:
    20px;

  background:
    var(--color-surface);

  box-shadow:
    var(--shadow-lg);
}

.login-brand {
  display: flex;

  gap: 18px;

  padding:
    30px
    30px
    26px;

  border-bottom:
    1px solid
    var(--color-border);
}

.brand-icon {
  width: 58px;
  height: 58px;

  flex:
    0
    0
    58px;

  border-radius:
    var(--radius-xl);

  font-size: 25px;
}

.brand-kicker {
  margin-top: 1px;

  color:
    var(--color-primary-dark);

  font-size: 12px;
  font-weight: 750;

  letter-spacing: .06em;

  text-transform: uppercase;
}

.login-brand h1 {
  margin:
    6px
    0
    7px;

  color:
    var(--color-text);

  font-size: 26px;
  font-weight: 750;

  line-height: 1.15;
}

.login-brand p {
  margin: 0;

  color:
    var(--color-text-secondary);

  font-size: 14px;

  line-height: 1.5;
}

.login-form {
  display: grid;

  gap: 20px;

  padding:
    28px
    30px
    32px;
}

.login-form label {
  display: block;

  margin-bottom: 8px;

  color: #334155;

  font-size: 14px;
  font-weight: 650;
}

.login-form input {
  width: 100%;

  min-height: 48px;

  padding:
    0
    14px;

  outline: 0;

  border:
    1px solid
    #cbd5e1;

  border-radius:
    var(--radius-lg);

  background:
    var(--color-surface);

  color:
    var(--color-text);

  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.login-form input:focus {
  border-color:
    var(--color-primary);

  box-shadow:
    0 0 0 3px
    rgba(
      37,
      99,
      235,
      .12
    );
}

.login-form input:disabled {
  cursor: not-allowed;

  background:
    var(--color-surface-muted);
}

.login-error {
  display: flex;

  align-items: flex-start;

  gap: 9px;

  padding:
    12px
    14px;

  border:
    1px solid
    #fecaca;

  border-radius:
    var(--radius-lg);

  background:
    var(--color-error-soft);

  color:
    var(--color-error);

  font-size: 14px;

  line-height: 1.45;
}

.login-error-icon {
  display: grid;

  width: 20px;
  height: 20px;

  flex:
    0
    0
    20px;

  place-items: center;

  border-radius: 999px;

  background:
    var(--color-error);

  color: #ffffff;

  font-size: 13px;
  font-weight: 800;
}

.login-button {
  display: flex;

  width: 100%;
  min-height: 50px;

  align-items: center;
  justify-content: center;

  gap: 10px;

  border:
    1px solid
    var(--color-primary-dark);

  border-radius:
    var(--radius-lg);

  background:
    var(--color-primary);

  color: #ffffff;

  cursor: pointer;

  font-size: 15px;
  font-weight: 700;

  box-shadow:
    var(--shadow-sm);

  transition:
    background 150ms ease,
    transform 150ms ease,
    box-shadow 150ms ease;
}

.login-button:hover:not(:disabled) {
  background:
    var(--color-primary-dark);

  box-shadow:
    var(--shadow-md);

  transform:
    translateY(-1px);
}

.login-button:active:not(:disabled) {
  transform: none;
}

.login-button:focus-visible {
  outline: none;

  box-shadow:
    0 0 0 4px
    rgba(
      37,
      99,
      235,
      .16
    );
}

.login-button:disabled {
  cursor: wait;

  opacity: .65;

  transform: none;
}

.button-spinner {
  width: 19px;
  height: 19px;

  border-width: 2px;

  border-color:
    rgba(
      255,
      255,
      255,
      .4
    );

  border-top-color:
    #ffffff;
}

/*
 * ============================================================
 * OPERACIONES · SESIÓN EXISTENTE
 * ============================================================
 */

.session-card {
  position: absolute;

  z-index: 10050;

  top: 16px;
  left: 50%;

  display: flex;

  max-width:
    min(
      520px,
      calc(100vw - 40px)
    );

  align-items: center;

  gap: 10px;

  transform:
    translateX(-50%);

  padding:
    7px
    8px
    7px
    7px;

  border:
    1px solid
    rgba(
      203,
      213,
      225,
      .9
    );

  border-radius:
    var(--radius-xl);

  background:
    rgba(
      255,
      255,
      255,
      .96
    );

  box-shadow:
    var(--shadow-md);

  backdrop-filter:
    blur(10px);
}

.logout-button {
  min-height: 34px;

  padding:
    0
    12px;

  border:
    1px solid
    var(--color-border);

  border-radius:
    var(--radius-md);

  background:
    var(--color-surface);

  color:
    #475569;

  cursor: pointer;

  font-size: 13px;
  font-weight: 700;
}

.logout-button:hover {
  background:
    var(--color-surface-muted);
}

.area-switcher-compact {
  padding: 3px;
}

.area-switcher-compact
.area-switch-button {
  min-width: auto;
  min-height: 32px;

  padding:
    5px
    9px;
}

@keyframes auth-spin {
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
  max-width: 1100px
) {
  .session-info {
    display: none;
  }

  .topbar-actions {
    gap: 7px;
  }

  .area-switch-button {
    min-width: 78px;
  }
}

@media (
  max-width: 900px
) {
  .farmacias-layout {
    --shell-sidebar-width:
      var(--sidebar-collapsed-width);
  }

  .app-sidebar {
    width:
      var(--sidebar-collapsed-width);
  }

  .sidebar-brand-copy,
  .sidebar-section-label,
  .sidebar-nav-label,
  .sidebar-footer-text {
    display: none;
  }

  .sidebar-header {
    flex-direction: column;

    justify-content: center;

    gap: 6px;

    min-height: 112px;

    padding:
      10px
      8px;
  }

  .sidebar-brand {
    justify-content: center;
  }

  .sidebar-navigation {
    padding:
      14px
      8px;
  }

  .sidebar-section +
  .sidebar-section {
    margin-top: 14px;
  }

  .sidebar-nav-item {
    justify-content: center;

    padding: 0;
  }

  .sidebar-footer {
    display: flex;

    justify-content: center;

    padding:
      12px
      8px;
  }

  .sidebar-toggle {
    display: none;
  }

  .app-topbar {
    padding:
      0
      14px;
  }

  .topbar-page-title {
    font-size: 15px;
  }

  .area-switcher
  .area-switch-button
  span {
    display: none;
  }
}

@media (
  max-width: 680px
) {
  .breadcrumbs {
    display: none;
  }

  .topbar-page-title {
    margin-top: 0;
  }

  .area-switcher {
    display: none;
  }

  .topbar-logout span {
    display: none;
  }

  .topbar-logout {
    width: 36px;

    justify-content: center;

    padding: 0;
  }

  .login-brand {
    padding:
      24px
      22px
      22px;
  }

  .login-form {
    padding:
      24px
      22px
      26px;
  }

  .brand-icon {
    width: 50px;
    height: 50px;

    flex-basis: 50px;

    border-radius:
      var(--radius-lg);
  }

  .login-brand h1 {
    font-size: 22px;
  }

  .session-card {
    top: 10px;

    max-width:
      calc(100vw - 20px);
  }

  .farmacias-shell
  .farmacias-map-tools {
    top: 12px;
    right: 60px;
  }
}
</style>