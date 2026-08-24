import {
  computed,
  ref,
} from 'vue'

import {
  supabase,
} from '../lib/supabase.js'

import {
  getCurrentProfile,
  getWebContext,
  setActiveWebArea,
} from '../services/api.js'

/*
 * ============================================================
 * ESTADO GLOBAL DE AUTENTICACIÓN
 * ============================================================
 */

const session =
  ref(null)

const user =
  ref(null)

const profile =
  ref(null)

const loading =
  ref(true)

const initialized =
  ref(false)

const error =
  ref(null)

const switchingArea =
  ref(false)

let authSubscription =
  null

let initializationPromise =
  null

/*
 * ============================================================
 * ESTADO DERIVADO
 * ============================================================
 */

const authenticated =
  computed(
    () =>
      Boolean(
        session.value &&
        profile.value
      )
  )

const role =
  computed(
    () =>
      profile.value?.rol ??
      profile.value?.role ??
      null
  )

const area =
  computed(
    () =>
      profile.value?.area ??
      profile.value?.currentArea ??
      null
  )

const systemRole =
  computed(
    () =>
      String(
        profile.value?.system_role ??
        profile.value?.systemRole ??
        'USER'
      )
        .trim()
        .toUpperCase()
  )

const allowedAreas =
  computed(
    () => {
      const raw =
        profile.value?.allowed_areas ??
        profile.value?.allowedAreas ??
        []

      if (
        !Array.isArray(
          raw
        )
      ) {
        return []
      }

      return [
        ...new Set(
          raw
            .map(
              value =>
                String(
                  value ??
                  ''
                )
                  .trim()
                  .toUpperCase()
            )
            .filter(
              value =>
                [
                  'FARMACIAS',
                  'OPERACIONES',
                ].includes(
                  value
                )
            )
        ),
      ]
    }
  )

const canSwitchAreas =
  computed(
    () =>
      allowedAreas.value.length >
      1
  )

const displayName =
  computed(
    () =>
      profile.value?.nombre ||
      profile.value?.name ||
      user.value?.email ||
      ''
  )

/*
 * ============================================================
 * NORMALIZACIÓN DE PERFIL
 * ============================================================
 */

function normalizeProfile(
  baseProfile,
  webProfile
) {
  const base =
    baseProfile &&
    typeof baseProfile ===
      'object'
      ? baseProfile
      : {}

  const web =
    webProfile &&
    typeof webProfile ===
      'object'
      ? webProfile
      : {}

  const resolvedArea =
    String(
      web.currentArea ??
      web.area ??
      base.currentArea ??
      base.area ??
      ''
    )
      .trim()
      .toUpperCase()

  const resolvedRole =
    String(
      web.role ??
      web.rol ??
      base.role ??
      base.rol ??
      ''
    )
      .trim()
      .toUpperCase()

  const resolvedSystemRole =
    String(
      web.systemRole ??
      web.system_role ??
      base.systemRole ??
      base.system_role ??
      'USER'
    )
      .trim()
      .toUpperCase()

  const rawAllowedAreas =
    web.allowedAreas ??
    web.allowed_areas ??
    base.allowedAreas ??
    base.allowed_areas ??
    []

  const resolvedAllowedAreas =
    Array.isArray(
      rawAllowedAreas
    )
      ? [
          ...new Set(
            rawAllowedAreas
              .map(
                value =>
                  String(
                    value ??
                    ''
                  )
                    .trim()
                    .toUpperCase()
              )
              .filter(
                value =>
                  [
                    'FARMACIAS',
                    'OPERACIONES',
                  ].includes(
                    value
                  )
              )
          ),
        ]
      : []

  if (
    resolvedArea &&
    !resolvedAllowedAreas.includes(
      resolvedArea
    )
  ) {
    resolvedAllowedAreas.push(
      resolvedArea
    )
  }

  const resolvedName =
    web.name ??
    web.nombre ??
    base.name ??
    base.nombre ??
    ''

  const resolvedActive =
    web.active ??
    web.activo ??
    base.active ??
    base.activo ??
    true

  const resolvedSuperiorId =
    web.superiorId ??
    web.superior_id ??
    base.superiorId ??
    base.superior_id ??
    null

  const resolvedPharmacyScopeMode =
    web.pharmacyScopeMode ??
    web.pharmacy_scope_mode ??
    base.pharmacyScopeMode ??
    base.pharmacy_scope_mode ??
    'ALL'

  return {
    ...base,
    ...web,

    id:
      web.id ??
      base.id ??
      null,

    nombre:
      resolvedName,

    name:
      resolvedName,

    area:
      resolvedArea,

    currentArea:
      resolvedArea,

    rol:
      resolvedRole,

    role:
      resolvedRole,

    system_role:
      resolvedSystemRole,

    systemRole:
      resolvedSystemRole,

    allowed_areas:
      resolvedAllowedAreas,

    allowedAreas:
      resolvedAllowedAreas,

    activo:
      resolvedActive,

    active:
      resolvedActive,

    superior_id:
      resolvedSuperiorId,

    superiorId:
      resolvedSuperiorId,

    pharmacy_scope_mode:
      resolvedPharmacyScopeMode,

    pharmacyScopeMode:
      resolvedPharmacyScopeMode,

    legacyArea:
      web.legacyArea ??
      base.legacyArea ??
      base.area ??
      null,

    legacyRole:
      web.legacyRole ??
      base.legacyRole ??
      base.rol ??
      null,
  }
}

/*
 * ============================================================
 * CARGA DEL PERFIL
 * ============================================================
 */

async function loadProfile() {
  if (
    !session.value
  ) {
    profile.value =
      null

    setActiveWebArea(
      null
    )

    return null
  }

  try {
    /*
     * Primero consultamos el perfil operativo base.
     */
    const response =
      await getCurrentProfile()

    const baseProfile =
      response?.profile ??
      null

    if (
      !baseProfile
    ) {
      const profileError =
        new Error(
          'La cuenta no tiene un perfil operativo asignado.'
        )

      profileError.code =
        'PROFILE_NOT_FOUND'

      profileError.status =
        403

      throw profileError
    }

    /*
     * Al iniciar una sesión nueva no conservamos
     * el área que pudiera haber usado otro usuario.
     */
    setActiveWebArea(
      null
    )

    /*
     * /web/context determina el área inicial.
     *
     * Para el ADMIN actual:
     *
     * OPERACIONES
     *   -> rol efectivo JEFE_TRAFICO
     *
     * FARMACIAS
     *   -> rol efectivo GERENTE
     */
    const webContext =
      await getWebContext()

    const mergedProfile =
      normalizeProfile(
        baseProfile,
        webContext?.profile
      )

    profile.value =
      mergedProfile

    /*
     * Desde aquí todas las llamadas autenticadas
     * enviarán X-App-Area.
     */
    setActiveWebArea(
      mergedProfile.area
    )

    return profile.value
  } catch (
    requestError
  ) {
    console.error(
      '[auth] Error obteniendo perfil:',
      requestError
    )

    profile.value =
      null

    setActiveWebArea(
      null
    )

    throw requestError
  }
}

/*
 * ============================================================
 * CAMBIO DE ÁREA
 * ADMIN TRANSVERSAL
 * ============================================================
 */

async function switchArea(
  nextArea
) {
  if (
    !session.value ||
    !profile.value
  ) {
    throw new Error(
      'No existe una sesión activa.'
    )
  }

  const normalized =
    String(
      nextArea ??
      ''
    )
      .trim()
      .toUpperCase()

  if (
    ![
      'FARMACIAS',
      'OPERACIONES',
    ].includes(
      normalized
    )
  ) {
    const areaError =
      new Error(
        'El área seleccionada no es válida.'
      )

    areaError.code =
      'INVALID_APP_AREA'

    throw areaError
  }

  if (
    !allowedAreas.value.includes(
      normalized
    )
  ) {
    const areaError =
      new Error(
        'No tienes autorización para acceder a esta área.'
      )

    areaError.code =
      'AREA_NOT_ALLOWED'

    areaError.status =
      403

    throw areaError
  }

  if (
    normalized ===
    area.value
  ) {
    return {
      profile:
        profile.value,

      context:
        null,
    }
  }

  switchingArea.value =
    true

  error.value =
    null

  try {
    /*
     * Pedimos primero al backend que valide
     * explícitamente el área solicitada.
     */
    const context =
      await getWebContext({
        area:
          normalized,
      })

    const mergedProfile =
      normalizeProfile(
        profile.value,
        context?.profile
      )

    /*
     * Solo después de una respuesta válida
     * cambiamos el área global.
     */
    profile.value =
      mergedProfile

    setActiveWebArea(
      mergedProfile.area
    )

    return {
      profile:
        mergedProfile,

      context,
    }
  } catch (
    requestError
  ) {
    console.error(
      '[auth] Error cambiando área:',
      requestError
    )

    error.value =
      getAuthErrorMessage(
        requestError
      )

    throw requestError
  } finally {
    switchingArea.value =
      false
  }
}

/*
 * ============================================================
 * APLICAR SESIÓN
 * ============================================================
 */

async function applySession(
  nextSession
) {
  session.value =
    nextSession ??
    null

  user.value =
    nextSession?.user ??
    null

  if (
    !nextSession
  ) {
    profile.value =
      null

    setActiveWebArea(
      null
    )

    return
  }

  await loadProfile()
}

/*
 * ============================================================
 * INICIALIZACIÓN
 * ============================================================
 */

async function initializeAuth() {
  if (
    initialized.value
  ) {
    return
  }

  if (
    initializationPromise
  ) {
    return initializationPromise
  }

  initializationPromise =
    (async () => {
      loading.value =
        true

      error.value =
        null

      try {
        const {
          data,
          error:
            sessionError,
        } =
          await supabase
            .auth
            .getSession()

        if (
          sessionError
        ) {
          throw sessionError
        }

        await applySession(
          data?.session ??
          null
        )

        if (
          !authSubscription
        ) {
          const {
            data:
              listenerData,
          } =
            supabase
              .auth
              .onAuthStateChange(
                (
                  event,
                  nextSession
                ) => {
                  void handleAuthStateChange(
                    event,
                    nextSession
                  )
                }
              )

          authSubscription =
            listenerData
              .subscription
        }

        initialized.value =
          true
      } catch (
        initializationError
      ) {
        console.error(
          '[auth] Error inicializando sesión:',
          initializationError
        )

        session.value =
          null

        user.value =
          null

        profile.value =
          null

        setActiveWebArea(
          null
        )

        error.value =
          getAuthErrorMessage(
            initializationError
          )
      } finally {
        loading.value =
          false

        initializationPromise =
          null
      }
    })()

  return initializationPromise
}

/*
 * ============================================================
 * EVENTOS SUPABASE AUTH
 * ============================================================
 */

async function handleAuthStateChange(
  event,
  nextSession
) {
  if (
    event ===
    'TOKEN_REFRESHED'
  ) {
    session.value =
      nextSession ??
      null

    user.value =
      nextSession?.user ??
      null

    return
  }

  if (
    event ===
    'SIGNED_OUT'
  ) {
    session.value =
      null

    user.value =
      null

    profile.value =
      null

    error.value =
      null

    setActiveWebArea(
      null
    )

    return
  }

  if (
    event ===
      'SIGNED_IN' ||
    event ===
      'USER_UPDATED' ||
    event ===
      'INITIAL_SESSION'
  ) {
    try {
      await applySession(
        nextSession
      )

      error.value =
        null
    } catch (
      profileError
    ) {
      error.value =
        getAuthErrorMessage(
          profileError
        )
    }
  }
}

/*
 * ============================================================
 * LOGIN
 * ============================================================
 */

async function signIn(
  email,
  password
) {
  loading.value =
    true

  error.value =
    null

  try {
    /*
     * El login siempre comienza sin área heredada
     * de una sesión anterior.
     */
    setActiveWebArea(
      null
    )

    const {
      data,
      error:
        signInError,
    } =
      await supabase
        .auth
        .signInWithPassword({
          email:
            String(
              email ??
              ''
            )
              .trim()
              .toLowerCase(),

          password:
            String(
              password ??
              ''
            ),
        })

    if (
      signInError
    ) {
      throw signInError
    }

    if (
      !data?.session
    ) {
      throw new Error(
        'No fue posible iniciar la sesión.'
      )
    }

    await applySession(
      data.session
    )

    return {
      session:
        data.session,

      profile:
        profile.value,
    }
  } catch (
    signInError
  ) {
    console.error(
      '[auth] Error iniciando sesión:',
      signInError
    )

    const message =
      getAuthErrorMessage(
        signInError
      )

    error.value =
      message

    /*
     * Si Supabase autenticó pero nuestro backend
     * rechazó el perfil operativo, cerramos sesión.
     */
    if (
      session.value &&
      !profile.value
    ) {
      try {
        await supabase
          .auth
          .signOut()
      } catch {}
    }

    setActiveWebArea(
      null
    )

    throw new Error(
      message
    )
  } finally {
    loading.value =
      false
  }
}

/*
 * ============================================================
 * LOGOUT
 * ============================================================
 */

async function signOut() {
  loading.value =
    true

  try {
    const {
      error:
        signOutError,
    } =
      await supabase
        .auth
        .signOut()

    if (
      signOutError
    ) {
      throw signOutError
    }
  } finally {
    session.value =
      null

    user.value =
      null

    profile.value =
      null

    error.value =
      null

    switchingArea.value =
      false

    setActiveWebArea(
      null
    )

    loading.value =
      false
  }
}

/*
 * ============================================================
 * REFRESCAR PERFIL
 * ============================================================
 */

async function refreshProfile() {
  error.value =
    null

  try {
    return await loadProfile()
  } catch (
    requestError
  ) {
    error.value =
      getAuthErrorMessage(
        requestError
      )

    throw requestError
  }
}

/*
 * ============================================================
 * MENSAJES DE ERROR
 * ============================================================
 */

function getAuthErrorMessage(
  authError
) {
  const code =
    authError?.code

  if (
    code ===
    'invalid_credentials'
  ) {
    return 'Correo o contraseña incorrectos.'
  }

  if (
    code ===
    'PROFILE_NOT_FOUND'
  ) {
    return 'La cuenta no tiene un perfil operativo asignado.'
  }

  if (
    code ===
    'PROFILE_INACTIVE'
  ) {
    return 'El perfil operativo se encuentra inactivo.'
  }

  if (
    code ===
    'AREA_NOT_ALLOWED'
  ) {
    return 'No tienes autorización para acceder al área seleccionada.'
  }

  if (
    code ===
    'INVALID_APP_AREA'
  ) {
    return 'El área seleccionada no es válida.'
  }

  if (
    code ===
    'PROFILE_AREA_NOT_CONFIGURED'
  ) {
    return 'El perfil no tiene áreas habilitadas.'
  }

  if (
    authError?.status ===
    403
  ) {
    return (
      authError.message ||
      'La cuenta no tiene autorización para acceder.'
    )
  }

  return (
    authError?.message ||
    'No fue posible iniciar sesión.'
  )
}

/*
 * ============================================================
 * COMPOSABLE
 * ============================================================
 */

export function useAuth() {
  return {
    /*
     * Sesión
     */
    session,
    user,
    profile,

    /*
     * Estado
     */
    loading,
    initialized,
    error,
    switchingArea,

    /*
     * Derivados
     */
    authenticated,
    role,
    area,
    systemRole,
    allowedAreas,
    canSwitchAreas,
    displayName,

    /*
     * Acciones
     */
    initializeAuth,
    signIn,
    signOut,
    refreshProfile,
    switchArea,
  }
}