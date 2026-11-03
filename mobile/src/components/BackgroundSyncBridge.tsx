import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { configureBackgroundSync } from '../services/backgroundTask'

export function BackgroundSyncBridge() {
  const { session, profile, accessState, loading } = useAuth()
  const enabled = Boolean(session && profile?.area === 'FARMACIAS' &&
    ['SUPERVISOR', 'COORDINADOR'].includes(profile.rol) && ['online', 'offline'].includes(accessState))
  useEffect(() => {
    // A cold auth restore must not unregister an already scheduled Android job.
    if (!loading) void configureBackgroundSync(enabled).catch(() => {})
  }, [loading, enabled, session?.user.id])
  return null
}
