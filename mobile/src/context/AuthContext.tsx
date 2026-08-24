import type {
  AuthError,
  Session,
  User,
} from '@supabase/supabase-js'
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ApiError,
  getCurrentProfile,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import type { AuthProfile } from '../types/auth'

type AuthResult = {
  error: AuthError | null
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: AuthProfile | null
  loading: boolean
  profileError: string | null
  signIn: (
    email: string,
    password: string,
  ) => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  sendPasswordReset: (
    email: string,
  ) => Promise<AuthResult>
  refreshProfile: () => Promise<void>
}

const AuthContext =
  createContext<AuthContextValue | undefined>(
    undefined,
  )

export function AuthProvider({
  children,
}: PropsWithChildren) {
  const [session, setSession] =
    useState<Session | null>(null)

  const [profile, setProfile] =
    useState<AuthProfile | null>(null)

  const [sessionReady, setSessionReady] =
    useState(false)

  const [profileLoading, setProfileLoading] =
    useState(false)

  const [profileError, setProfileError] =
    useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function restoreSession() {
      const {
        data,
        error,
      } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (error) {
        console.error(
          'Error restaurando sesión:',
          error.message,
        )
      }

      setSession(data.session)
      setSessionReady(true)
    }

    void restoreSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) {
          return
        }

        setSession(nextSession)
        setSessionReady(true)
      },
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const refreshProfile =
    useCallback(async (): Promise<void> => {
      if (!session) {
        setProfile(null)
        setProfileError(null)
        setProfileLoading(false)
        return
      }

      setProfileLoading(true)
      setProfileError(null)

      try {
        const response = await getCurrentProfile(
          session.access_token,
        )

        setProfile(response.profile)
      } catch (error) {
        console.error(
          'Error cargando perfil:',
          error,
        )

        setProfile(null)

        if (error instanceof ApiError) {
          setProfileError(error.message)
        } else {
          setProfileError(
            'No fue posible cargar tu perfil.',
          )
        }
      } finally {
        setProfileLoading(false)
      }
    }, [session])

  useEffect(() => {
    if (!sessionReady) {
      return
    }

    void refreshProfile()
  }, [sessionReady, refreshProfile])

  async function signIn(
    email: string,
    password: string,
  ): Promise<AuthResult> {
    const { error } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

    return { error }
  }

  async function signOut(): Promise<AuthResult> {
    const { error } = await supabase.auth.signOut()

    if (!error) {
      setProfile(null)
      setProfileError(null)
    }

    return { error }
  }

  async function sendPasswordReset(
    email: string,
  ): Promise<AuthResult> {
    const { error } =
      await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: 'mobile://reset-password',
        },
      )

    return { error }
  }

  const loading =
    !sessionReady || profileLoading

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileError,
      signIn,
      signOut,
      sendPasswordReset,
      refreshProfile,
    }),
    [
      session,
      profile,
      loading,
      profileError,
      refreshProfile,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth debe utilizarse dentro de AuthProvider',
    )
  }

  return context
}