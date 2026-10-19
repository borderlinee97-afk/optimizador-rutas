import type { AuthError, Session, User } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, getCurrentProfile, unregisterPushSession } from '../lib/api'
import { readPersistedAuthSession, supabase } from '../lib/supabase'
import { activateUserDatabase, deactivateUserDatabase, hasLegacyLocalData } from '../../storage/db'
import { blockProfileSnapshot, isAuthorizationFailure, isNetworkFailure, readProfileSnapshot, saveProfileSnapshot } from '../services/profileCache'
import type { AuthProfile } from '../types/auth'
import { recoverLegacyData, type LegacyRecoveryResult } from '../services/legacyRecovery'
import { isDatabaseActive } from '../../storage/db'

type AuthResult = { error: AuthError | null }
export type AccessState = 'signed_out' | 'validating' | 'online' | 'offline' | 'unauthorized' | 'unavailable'
type Access = { owner: string; profile: AuthProfile | null; state: AccessState; validatedAt: number | null }
type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: AuthProfile | null
  loading: boolean
  profileError: string | null
  accessState: AccessState
  sessionEndReason: 'no_previous_session' | 'explicit_logout' | 'server_invalidated' | null
  profileValidatedAt: number | null
  legacyDataPreserved: boolean
  legacyRecovery: { busy: boolean; result: LegacyRecoveryResult | null; error: string | null }
  recoverLegacy: () => Promise<LegacyRecoveryResult | null>
  signIn: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  sendPasswordReset: (email: string) => Promise<AuthResult>
  refreshProfile: () => Promise<void>
  invalidateProfile: (message: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [access, setAccess] = useState<Access | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [legacyDataPreserved, setLegacyDataPreserved] = useState(false)
  const [sessionEndReason, setSessionEndReason] = useState<AuthContextValue['sessionEndReason']>('no_previous_session')
  const explicitSignOut = useRef(false)
  const recoveryRunning = useRef(false)
  const [recovery, setRecovery] = useState<{ owner: string; busy: boolean; result: LegacyRecoveryResult | null; error: string | null } | null>(null)
  const currentSession = useRef<Session | null>(null)
  const currentAccess = useRef<Access | null>(null)
  const requestSequence = useRef(0)
  const tokenRefreshAttempted = useRef(false)

  const publishAccess = useCallback((value: Access | null) => {
    currentAccess.current = value
    setAccess(value)
  }, [])

  useEffect(() => {
    let mounted = true
    let eventSequence = 0
    function acceptSession(next: Session | null) {
      if (!mounted) return
      if (currentSession.current?.user.id !== next?.user.id) {
        tokenRefreshAttempted.current = false
        ++requestSequence.current
        deactivateUserDatabase()
        publishAccess(null)
        setProfileError(null)
        setRecovery(null)
      }
      currentSession.current = next
      if (next) setSessionEndReason(null)
      setSession(next)
      setSessionReady(true)
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return
      // INITIAL_SESSION can be null when offline renewal fails. The getSession
      // error below distinguishes this from an actual sign-out.
      if (event === 'INITIAL_SESSION' && !next) return
      ++eventSequence
      if (event === 'SIGNED_OUT') {
        const previousUser = currentSession.current?.user.id
        if (previousUser) void blockProfileSnapshot(previousUser).catch(console.error)
      }
      acceptSession(next)
      if (event === 'SIGNED_OUT') {
        setSessionEndReason(explicitSignOut.current ? 'explicit_logout' : 'server_invalidated')
        if (!explicitSignOut.current) setProfileError('La sesión fue invalidada por el servidor. Vuelve a iniciar sesión.')
      }
    })
    async function restoreSession() {
      const revision = eventSequence
      const stored = await readPersistedAuthSession()
      if (!mounted) return
      if (revision === eventSequence) acceptSession(stored)
      const checkRevision = eventSequence
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!mounted || checkRevision !== eventSequence) return
        if (error && isNetworkFailure(error)) return
        if (!data.session && currentSession.current) {
          await blockProfileSnapshot(currentSession.current.user.id)
          if (mounted && checkRevision === eventSequence) setSessionEndReason('server_invalidated')
        }
        if (!mounted || checkRevision !== eventSequence) return
        acceptSession(data.session)
      } catch (error) {
        if (mounted && checkRevision === eventSequence && !isNetworkFailure(error)) acceptSession(null)
      }
    }
    void restoreSession()
    return () => { mounted = false; ++requestSequence.current; subscription.unsubscribe() }
  }, [publishAccess])

  const invalidateProfile = useCallback(async (message: string) => {
    const userId = currentSession.current?.user.id
    if (!userId) return
    ++requestSequence.current
    deactivateUserDatabase()
    publishAccess({ owner: userId, profile: null, state: 'unauthorized', validatedAt: null })
    setProfileError(message)
    await blockProfileSnapshot(userId)
  }, [publishAccess])

  const recoverLegacy = useCallback(async () => {
    const startingSession = currentSession.current
    const startingAccess = currentAccess.current
    if (!startingSession || !startingAccess?.profile || startingAccess.state !== 'online') return null
    const userId = startingSession.user.id
    const profileId = startingAccess.profile.id
    const isCurrent = () => currentSession.current?.user.id === userId &&
      currentAccess.current?.profile?.id === profileId && currentAccess.current.state === 'online' && isDatabaseActive(userId)
    if (recoveryRunning.current) return null
    recoveryRunning.current = true
    setRecovery({ owner: userId, busy: true, result: null, error: null })
    try {
      const sessionResult = await supabase.auth.getSession()
      if (sessionResult.error) throw sessionResult.error
      if (!sessionResult.data.session || sessionResult.data.session.user.id !== userId || !isCurrent()) {
        throw new Error('La cuenta cambió antes de verificar los datos anteriores.')
      }
      const result = await recoverLegacyData({ userId, profileId, accessToken: sessionResult.data.session.access_token, isCurrent })
      if (isCurrent()) setRecovery({ owner: userId, busy: false, result, error: null })
      return isCurrent() ? result : null
    } catch (error) {
      if (currentSession.current?.user.id === userId) {
        const message = error instanceof Error ? error.message : 'No fue posible verificar la recuperación. Los originales se conservaron.'
        setRecovery({ owner: userId, busy: false, result: null, error: message })
        if (isAuthorizationFailure(error)) await invalidateProfile(message).catch(console.error)
      }
      return null
    } finally { recoveryRunning.current = false }
  }, [invalidateProfile])

  const refreshProfile = useCallback(async () => {
    const activeSession = currentSession.current
    if (!activeSession) return
    const userId = activeSession.user.id
    const requestId = ++requestSequence.current
    const isCurrent = () => requestId === requestSequence.current && currentSession.current?.user.id === userId &&
      currentSession.current.access_token === activeSession.access_token
    const previous = currentAccess.current?.owner === userId ? currentAccess.current : null
    if (!previous) publishAccess({ owner: userId, profile: null, state: 'validating', validatedAt: null })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      let response
      try {
        response = await getCurrentProfile(activeSession.access_token, controller.signal)
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || tokenRefreshAttempted.current) throw error
        tokenRefreshAttempted.current = true
        const refreshed = await supabase.auth.refreshSession()
        if (refreshed.error) {
          // An expired access token cannot renew without a network. Keep the
          // previously validated offline profile; an actual refresh rejection
          // still follows the authorization-denial path below.
          if (isNetworkFailure(refreshed.error)) throw refreshed.error
          throw error
        }
        if (!refreshed.data.session) throw error
        if (!isCurrent()) return
        response = await getCurrentProfile(refreshed.data.session.access_token, controller.signal)
      }
      if (!isCurrent()) return
      if (response.user.id !== userId || response.profile.activo !== true) {
        throw new ApiError('El perfil operativo no está autorizado.', 403, 'PROFILE_INACTIVE')
      }
      activateUserDatabase(userId)
      tokenRefreshAttempted.current = false
      setLegacyDataPreserved(hasLegacyLocalData())
      publishAccess({ owner: userId, profile: response.profile, state: 'online', validatedAt: Date.now() })
      setProfileError(null)
      try {
        await saveProfileSnapshot(userId, response.profile)
      } catch {
        if (isCurrent()) setProfileError('Perfil validado en línea. No fue posible guardar el perfil para el próximo inicio sin conexión.')
      }
    } catch (error) {
      if (!isCurrent()) return
      if (isNetworkFailure(error)) {
        tokenRefreshAttempted.current = false
        const cached = await readProfileSnapshot(userId)
        if (!isCurrent()) return
        // Operations keeps its existing online flow; only Farmacias opts into P0.1.
        const fallback = cached ?? (previous?.profile?.activo && previous.state !== 'unauthorized'
          ? { profile: previous.profile, validatedAt: previous.validatedAt } : null)
        if (fallback?.profile.area === 'FARMACIAS') {
          try {
            activateUserDatabase(userId)
            setLegacyDataPreserved(hasLegacyLocalData())
            publishAccess({ owner: userId, profile: fallback.profile, state: 'offline', validatedAt: fallback.validatedAt })
            setProfileError('SIN CONEXIÓN. Mostrando el último perfil validado en este dispositivo.')
          } catch {
            deactivateUserDatabase()
            publishAccess({ owner: userId, profile: null, state: 'unavailable', validatedAt: null })
            setProfileError('No fue posible abrir la información local. Los datos se conservaron; intenta nuevamente.')
          }
        } else {
          publishAccess({ owner: userId, profile: null, state: 'offline', validatedAt: null })
          setProfileError('SIN CONEXIÓN. Este usuario todavía no tiene un perfil validado descargado. Conéctate a internet.')
        }
      } else if (isAuthorizationFailure(error)) {
        await invalidateProfile(error instanceof Error ? error.message : 'El servidor rechazó el acceso.').catch(console.error)
      } else {
        // Server/storage errors never delete local information.
        publishAccess({ owner: userId, profile: previous?.profile ?? null, state: 'unavailable', validatedAt: previous?.validatedAt ?? null })
        setProfileError(error instanceof Error ? error.message : 'No fue posible cargar tu perfil.')
      }
    } finally {
      clearTimeout(timeout)
    }
  }, [invalidateProfile, publishAccess])

  useEffect(() => {
    if (sessionReady && session) void refreshProfile()
  }, [sessionReady, session?.user.id, session?.access_token, refreshProfile])

  useEffect(() => {
    if (!session) return
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshProfile()
    })
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && ['offline', 'unavailable'].includes(currentAccess.current?.state ?? '')) {
        void refreshProfile()
      }
    }, 20_000)
    return () => { subscription.remove(); clearInterval(timer) }
  }, [session?.user.id, refreshProfile])

  async function signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    return { error }
  }
  async function signOut(): Promise<AuthResult> {
    explicitSignOut.current = true
    try {
      if (session?.access_token && currentAccess.current?.profile?.area === 'FARMACIAS') {
        try { await unregisterPushSession(session.access_token) } catch { /* Logout remains available offline. */ }
      }
      const { error } = await supabase.auth.signOut()
      return { error }
    } finally {
      explicitSignOut.current = false
    }
  }
  async function sendPasswordReset(email: string): Promise<AuthResult> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: 'appderutas://reset-password' })
    return { error }
  }

  const ownedAccess = access?.owner === session?.user.id ? access : null
  const loading = !sessionReady || Boolean(session && (!ownedAccess || ownedAccess.state === 'validating'))
  const value = useMemo<AuthContextValue>(() => ({
    session, user: session?.user ?? null, profile: ownedAccess?.profile ?? null,
    loading, profileError, accessState: session ? ownedAccess?.state ?? 'validating' : 'signed_out',
    profileValidatedAt: ownedAccess?.validatedAt ?? null, legacyDataPreserved,
    legacyRecovery: recovery && recovery.owner === session?.user.id ? recovery : { busy: false, result: null, error: null },
    recoverLegacy,
    sessionEndReason,
    signIn, signOut, sendPasswordReset, refreshProfile, invalidateProfile,
  }), [session, ownedAccess, loading, profileError, legacyDataPreserved, sessionEndReason, refreshProfile, invalidateProfile, recoverLegacy, recovery])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider')
  return context
}
