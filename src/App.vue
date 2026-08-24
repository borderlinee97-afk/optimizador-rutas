<template>
  <div class="app-root">
    <!-- =====================================================
         CARGANDO AUTENTICACIÓN
    ====================================================== -->
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

    <!-- =====================================================
         LOGIN
    ====================================================== -->
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
              y estructura operativa según tu
              perfil.
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

    <!-- =====================================================
         APLICACIÓN
    ====================================================== -->
    <div
      v-else
      class="application-shell"
      :class="{
        'farmacias-shell':
          isFarmacias,

        'operations-shell':
          isOperations,
      }"
    >
      <!-- ===================================================
           CABECERA FARMACIAS
      ==================================================== -->
      <header
        v-if="isFarmacias"
        class="farmacias-topbar"
      >
        <div class="topbar-identity">
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

        <!-- =================================================
             SELECTOR DE ÁREA PARA ADMIN
        ================================================== -->
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

        <!-- =================================================
             NAVEGACIÓN FARMACIAS
        ================================================== -->
        <nav
          class="farmacias-navigation"
          aria-label="Navegación Farmacias"
        >
          <RouterLink
            v-for="item in farmaciasMenu"
            :key="item.to"
            :to="item.to"
            class="farmacias-nav-item"
          >
            <span class="nav-icon">
              <svg
                v-if="
                  item.key ===
                  'map'
                "
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

              <svg
                v-else-if="
                  item.key ===
                  'plans'
                "
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

              <svg
                v-else-if="
                  item.key ===
                  'approvals'
                "
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

              <svg
                v-else-if="
                  item.key ===
                  'assignments'
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

            <span>
              {{ item.label }}
            </span>
          </RouterLink>
        </nav>

        <button
          class="topbar-logout"
          type="button"
          title="Cerrar sesión"
          @click="handleLogout"
        >
          Salir
        </button>
      </header>

      <!-- ===================================================
           CONTENIDO ENRUTADO
      ==================================================== -->
      <RouterView />

      <!-- ===================================================
           SESIÓN OPERACIONES
      ==================================================== -->
      <div
        v-if="isOperations"
        class="session-card"
      >
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

        <!-- =================================================
             SELECTOR DE ÁREA ADMIN
        ================================================== -->
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
          .charAt(
            0,
          )
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
    key:
      'map',

    label:
      'Mapa',

    to:
      '/farmacias/mapa',

    roles: [
      'GERENTE',
      'COORDINADOR',
      'SUPERVISOR',
    ],
  },

  {
    key:
      'plans',

    label:
      'Planes',

    to:
      '/farmacias/planes',

    roles: [
      'GERENTE',
      'COORDINADOR',
      'SUPERVISOR',
    ],
  },

  {
    key:
      'approvals',

    label:
      'Aprobaciones',

    to:
      '/farmacias/aprobaciones',

    roles: [
      'GERENTE',
      'COORDINADOR',
    ],
  },

  {
    key:
      'assignments',

    label:
      'Asignaciones',

    to:
      '/farmacias/asignaciones',

    roles: [
      'GERENTE',
      'COORDINADOR',
    ],
  },

  {
    key:
      'people',

    label:
      'Personas',

    to:
      '/farmacias/personas',

    roles: [
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

    /*
     * Si acabamos de entrar y estamos en "/",
     * enviamos al módulo inicial adecuado.
     */
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
  height: 100%;
}

* {
  box-sizing: border-box;
}

button,
input {
  font: inherit;
}

.application-shell {
  position: relative;

  width: 100%;
  height: 100%;
}

/*
 * ============================================================
 * FARMACIAS: CABECERA GLOBAL
 * ============================================================
 */

.farmacias-topbar {
  position: fixed;

  top: 12px;
  left: 50%;

  z-index: 11000;

  display: flex;

  width: min(
    1040px,
    calc(100vw - 32px)
  );

  min-height: 62px;

  align-items: center;

  gap: 18px;

  transform:
    translateX(-50%);

  padding:
    7px
    8px
    7px
    9px;

  border:
    1px solid
    rgba(
      203,
      213,
      225,
      .92
    );

  border-radius: 19px;

  background:
    rgba(
      255,
      255,
      255,
      .96
    );

  box-shadow:
    0 10px 34px
      rgba(
        15,
        23,
        42,
        .14
      );

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

.topbar-identity {
  display: flex;

  min-width: 210px;

  align-items: center;

  gap: 9px;
}

.farmacias-navigation {
  display: flex;

  min-width: 0;

  flex: 1;

  align-items: center;
  justify-content: center;

  gap: 3px;
}

.farmacias-nav-item {
  display: flex;

  min-height: 40px;

  align-items: center;

  gap: 6px;

  padding:
    0
    10px;

  border:
    1px solid transparent;

  border-radius: 11px;

  color: #64748b;

  text-decoration: none !important;

  font-size: 10px;
  font-weight: 800;

  transition:
    background .15s ease,
    border-color .15s ease,
    color .15s ease;
}

.farmacias-nav-item:hover {
  border-color: #e2e8f0;

  background: #f8fafc;

  color: #0f64ad;
}

.farmacias-nav-item.router-link-active {
  border-color: #bfdbfe;

  background: #eff8ff;

  color: #0f64ad;
}

.nav-icon {
  display: grid;

  width: 17px;
  height: 17px;

  place-items: center;
}

.nav-icon svg {
  width: 17px;
  height: 17px;

  fill: none;

  stroke: currentColor;

  stroke-width: 1.8;

  stroke-linecap: round;
  stroke-linejoin: round;
}

.topbar-logout {
  min-height: 38px;

  padding:
    0
    13px;

  border:
    1px solid #e2e8f0;

  border-radius: 11px;

  background: #fff;

  color: #475569;

  cursor: pointer;

  font-size: 10px;
  font-weight: 850;
}

.topbar-logout:hover {
  background: #f8fafc;
}

/*
 * Los controles compactos de Farmacias
 * dejan espacio para la navegación global.
 */

.farmacias-shell
.farmacias-map-tools {
  top: 88px;
}

/*
 * ============================================================
 * AUTH / LOGIN
 * ============================================================
 */

.auth-loading,
.login-page {
  min-height: 100%;
}

.auth-loading {
  display: grid;

  place-items: center;

  background:
    linear-gradient(
      145deg,
      #f8fafc,
      #eef6fb
    );
}

.loading-card {
  display: flex;

  width: min(
    360px,
    calc(100vw - 40px)
  );

  flex-direction: column;

  align-items: center;

  gap: 12px;

  padding: 34px;

  border:
    1px solid #e2e8f0;

  border-radius: 28px;

  background:
    rgba(
      255,
      255,
      255,
      .94
    );

  box-shadow:
    0 20px 60px
      rgba(
        15,
        23,
        42,
        .10
      );
}

.loading-logo,
.brand-icon {
  display: grid;

  place-items: center;

  color: #fff;

  background:
    linear-gradient(
      145deg,
      #0f64ad,
      #1886c8
    );

  font-weight: 800;

  box-shadow:
    0 10px 24px
      rgba(
        15,
        100,
        173,
        .25
      );
}

.loading-logo {
  width: 58px;
  height: 58px;

  margin-bottom: 5px;

  border-radius: 18px;

  font-size: 26px;
}

.loading-card strong {
  color: #0f172a;

  font-size: 17px;
}

.loading-card > span {
  color: #64748b;

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
    #0f64ad;
}

.login-page {
  position: relative;

  display: grid;

  place-items: center;

  overflow: hidden;

  padding:
    32px
    20px;

  background: #f7fafc;
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

  opacity: .22;
}

.login-glow-a {
  width: 560px;
  height: 560px;

  top: -250px;
  left: -180px;

  background: #38bdf8;
}

.login-glow-b {
  width: 520px;
  height: 520px;

  right: -210px;
  bottom: -260px;

  background: #0f64ad;
}

.login-card {
  position: relative;

  z-index: 1;

  width: min(
    470px,
    100%
  );

  overflow: hidden;

  border:
    1px solid #e2e8f0;

  border-radius: 30px;

  background:
    rgba(
      255,
      255,
      255,
      .97
    );

  box-shadow:
    0 30px 90px
      rgba(
        15,
        23,
        42,
        .13
      );
}

.login-brand {
  display: flex;

  gap: 18px;

  padding:
    30px
    30px
    26px;

  border-bottom:
    1px solid #eef2f7;
}

.brand-icon {
  width: 58px;
  height: 58px;

  flex:
    0
    0
    58px;

  border-radius: 18px;

  font-size: 25px;
}

.brand-kicker {
  margin-top: 1px;

  color: #0f64ad;

  font-size: 12px;
  font-weight: 800;

  letter-spacing: .08em;

  text-transform: uppercase;
}

.login-brand h1 {
  margin:
    6px
    0
    7px;

  color: #0f172a;

  font-size: 26px;

  line-height: 1.15;
}

.login-brand p {
  margin: 0;

  color: #64748b;

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

  font-size: 13px;
  font-weight: 700;
}

.login-form input {
  width: 100%;

  min-height: 50px;

  padding:
    0
    14px;

  outline: 0;

  border:
    1px solid #cbd5e1;

  border-radius: 14px;

  background: #fff;

  color: #0f172a;

  transition:
    border-color .16s ease,
    box-shadow .16s ease;
}

.login-form input:focus {
  border-color: #0f64ad;

  box-shadow:
    0 0 0 3px
      rgba(
        15,
        100,
        173,
        .12
      );
}

.login-form input:disabled {
  cursor: not-allowed;

  background: #f8fafc;
}

.login-error {
  display: flex;

  align-items: flex-start;

  gap: 9px;

  padding:
    12px
    14px;

  border:
    1px solid #fecdd3;

  border-radius: 14px;

  background: #fff1f2;

  color: #be123c;

  font-size: 13px;

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

  background: #be123c;

  color: #fff;

  font-size: 12px;
  font-weight: 800;
}

.login-button {
  position: relative;

  display: flex;

  width: 100%;

  min-height: 56px;

  overflow: hidden;

  align-items: center;
  justify-content: center;

  gap: 10px;

  border:
    1px solid
    rgba(
      15,
      100,
      173,
      .25
    );

  border-radius: 16px;

  background:
    linear-gradient(
      135deg,
      #0f64ad 0%,
      #1978c7 48%,
      #2596d1 100%
    );

  color: #fff;

  cursor: pointer;

  font-size: 16px;
  font-weight: 800;

  letter-spacing: .01em;

  box-shadow:
    0 10px 20px
      rgba(
        15,
        100,
        173,
        .18
      ),

    0 4px 8px
      rgba(
        15,
        23,
        42,
        .08
      ),

    inset 0 1px 0
      rgba(
        255,
        255,
        255,
        .28
      );

  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    filter 160ms ease;
}

.login-button span {
  position: relative;

  z-index: 2;

  color: #fff;
}

.login-button::before {
  content: '';

  position: absolute;

  inset: 0;

  background:
    linear-gradient(
      115deg,
      transparent 20%,

      rgba(
        255,
        255,
        255,
        .18
      ) 45%,

      transparent 70%
    );

  transform:
    translateX(-120%);

  transition:
    transform 420ms ease;
}

.login-button:hover:not(:disabled) {
  transform:
    translateY(-2px);

  box-shadow:
    0 14px 28px
      rgba(
        15,
        100,
        173,
        .25
      ),

    0 6px 12px
      rgba(
        15,
        23,
        42,
        .10
      ),

    inset 0 1px 0
      rgba(
        255,
        255,
        255,
        .35
      );
}

.login-button:hover:not(:disabled)::before {
  transform:
    translateX(120%);
}

.login-button:active:not(:disabled) {
  transform:
    translateY(0);

  box-shadow:
    0 7px 14px
      rgba(
        15,
        100,
        173,
        .20
      ),

    inset 0 2px 4px
      rgba(
        0,
        0,
        0,
        .08
      );
}

.login-button:focus-visible {
  outline: none;

  box-shadow:
    0 0 0 4px
      rgba(
        37,
        150,
        209,
        .18
      ),

    0 12px 24px
      rgba(
        15,
        100,
        173,
        .24
      );
}

.login-button:disabled {
  cursor: wait;

  transform: none;

  background:
    linear-gradient(
      135deg,
      #7ba9cf,
      #91bad8
    );

  box-shadow:
    0 6px 14px
      rgba(
        15,
        23,
        42,
        .08
      );

  opacity: .78;
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
    #fff;
}

/*
 * ============================================================
 * COMPONENTES DE SESIÓN
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

  border-radius: 18px;

  background:
    rgba(
      255,
      255,
      255,
      .94
    );

  box-shadow:
    0 8px 28px
      rgba(
        15,
        23,
        42,
        .15
      );

  backdrop-filter:
    blur(10px);
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

  border-radius: 12px;

  background: #eaf4fc;

  color: #0f64ad;

  font-size: 14px;
  font-weight: 900;
}

.session-info {
  display: flex;

  min-width: 0;

  flex: 1;

  flex-direction: column;
}

.session-info strong {
  overflow: hidden;

  color: #0f172a;

  font-size: 11px;

  text-overflow: ellipsis;

  white-space: nowrap;
}

.session-info span {
  margin-top: 2px;

  color: #64748b;

  font-size: 9px;
}

.logout-button {
  min-height: 34px;

  padding:
    0
    12px;

  border:
    1px solid #e2e8f0;

  border-radius: 11px;

  background: #fff;

  color: #475569;

  cursor: pointer;

  font-size: 11px;
  font-weight: 800;
}

.logout-button:hover {
  background: #f8fafc;
}

/*
 * ============================================================
 * ADMIN · SELECTOR DE ÁREA
 * ============================================================
 */

.area-switcher {
  display: flex;

  flex:
    0
    0
    auto;

  align-items: stretch;

  gap: 4px;

  padding: 4px;

  border:
    1px solid #dbe4ee;

  border-radius: 13px;

  background: #f8fafc;
}

.area-switch-button {
  display: flex;

  min-width: 94px;
  min-height: 40px;

  flex-direction: column;

  align-items: flex-start;
  justify-content: center;

  gap: 1px;

  padding:
    6px
    10px;

  border:
    1px solid transparent;

  border-radius: 9px;

  background: transparent;

  color: #64748b;

  cursor: pointer;

  line-height: 1.1;

  transition:
    background .15s ease,
    border-color .15s ease,
    color .15s ease,
    box-shadow .15s ease;
}

.area-switch-button strong {
  color: inherit;

  font-size: 10px;
  font-weight: 850;

  text-transform: uppercase;

  letter-spacing: .025em;
}

.area-switch-button span {
  color: inherit;

  font-size: 8px;
  font-weight: 650;

  opacity: .78;
}

.area-switch-button:hover:not(:disabled) {
  border-color: #cbd5e1;

  background: #ffffff;

  color: #0f64ad;
}

.area-switch-button.active {
  border-color: #bfdbfe;

  background: #ffffff;

  color: #0f64ad;

  box-shadow:
    0 2px 8px
      rgba(
        15,
        100,
        173,
        .12
      );
}

.area-switch-button:disabled {
  cursor: wait;

  opacity: .58;
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
  max-width: 900px
) {
  .area-switcher:not(
    .area-switcher-compact
  ) {
    position: fixed;

    top: 82px;
    left: 50%;

    z-index: 10999;

    transform:
      translateX(-50%);

    box-shadow:
      0 8px 20px
        rgba(
          15,
          23,
          42,
          .12
        );
  }

  .area-switcher
  .area-switch-button
  span {
    display: none;
  }

  .farmacias-topbar {
    gap: 8px;
  }

  .topbar-identity {
    min-width: 150px;
  }

  .farmacias-nav-item {
    padding:
      0
      7px;
  }

  .farmacias-nav-item > span:last-child {
    display: none;
  }

  .nav-icon,
  .nav-icon svg {
    width: 19px;
    height: 19px;
  }
}

@media (
  max-width: 560px
) {
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

    border-radius: 15px;
  }

  .login-brand h1 {
    font-size: 22px;
  }

  .session-card {
    top: 10px;

    max-width:
      calc(100vw - 20px);
  }

  .farmacias-topbar {
    top: 8px;

    width:
      calc(100vw - 16px);

    min-height: 58px;
  }

  .topbar-identity {
    min-width: 0;

    flex: 1;
  }

  .topbar-identity
  .session-info {
    display: none;
  }

  .farmacias-navigation {
    justify-content: flex-end;
  }

  .topbar-logout {
    padding:
      0
      9px;
  }

  .farmacias-shell
  .farmacias-map-tools {
    top: 78px;
  }
}
</style>