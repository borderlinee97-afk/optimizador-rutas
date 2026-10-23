import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { useNetInfo } from '@react-native-community/netinfo'
import { canCheckUpdates, checkAppUpdate, type AndroidRelease, type UpdateResult } from '../services/appUpdates'
import { canInstallApk, clearInstalledApks, hasApkInstaller, installApprovedApk } from '../services/apkInstallation'

type InstallState = { stage: 'idle' | 'downloading' | 'verifying' | 'permission-required' | 'installer-opened' | 'error'; percent: number | null }
const Context = createContext<{
  result: UpdateResult | null; checking: boolean; error: string; check: () => Promise<void>
  dismiss: () => void; dismissed: boolean; installation: InstallState; update: (release?: AndroidRelease) => Promise<void>
} | null>(null)
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const network = useNetInfo()
  const [result, setResult] = useState<UpdateResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [installation, setInstallation] = useState<InstallState>({ stage: 'idle', percent: null })
  const startupReady = useRef(false)
  const cleaned = useRef(false)
  const busy = useRef(false)
  const installing = useRef(false)
  const waitingPermission = useRef<AndroidRelease | null>(null)
  const lastAttempt = useRef(0)
  const lastSuccess = useRef(0)
  const current = useRef(network)
  const currentResult = useRef(result)
  current.current = network; currentResult.current = result
  const online = () => current.current.isConnected === true && current.current.isInternetReachable !== false
  const check = useCallback(async () => {
    if (busy.current || installing.current) return
    if (current.current.isConnected !== true || current.current.isInternetReachable === false) {
      setError('Conéctate a internet para buscar actualizaciones. Puedes seguir trabajando sin conexión.')
      return
    }
    busy.current = true; lastAttempt.current = Date.now(); setChecking(true); setError('')
    try {
      const next = await checkAppUpdate()
      setResult(next); lastSuccess.current = Date.now(); setDismissed(false)
    } catch { setError('No se pudo consultar la actualización. Intenta de nuevo cuando tengas conexión.') }
    finally { busy.current = false; setChecking(false) }
  }, [])
  const update = useCallback(async (chosen?: AndroidRelease) => {
    if (installing.current || busy.current) return
    if (current.current.isConnected !== true || current.current.isInternetReachable === false) {
      setError('Conéctate a internet para actualizar. Puedes seguir trabajando sin conexión.'); return
    }
    const release = chosen ?? (currentResult.current?.status === 'available' ? currentResult.current.release : null)
    if (!release) return
    installing.current = true; waitingPermission.current = null; setError('')
    setInstallation({ stage: 'verifying', percent: null })
    try {
      const stage = await installApprovedApk(release, setInstallation)
      if (stage === 'permission-required') waitingPermission.current = release
      setInstallation({ stage, percent: null })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo actualizar. Intenta de nuevo; no desinstales la app.')
      setInstallation({ stage: 'error', percent: null })
    } finally { installing.current = false }
  }, [])
  useEffect(() => {
    let active = true
    const attempt = () => {
      if (!active || AppState.currentState !== 'active') return
      const waiting = waitingPermission.current
      if (waiting && online() && !installing.current) {
        // Continue only after the user explicitly requested an update and granted Android's permission.
        void canInstallApk().then(allowed => {
          if (active && allowed && waitingPermission.current === waiting && AppState.currentState === 'active') void update(waiting)
        }).catch(() => {})
        return
      }
      if (startupReady.current && canCheckUpdates && online() && Date.now() - lastAttempt.current > 5 * 60_000
          && Date.now() - lastSuccess.current > 12 * 60 * 60_000) void check()
    }
    const timer = setTimeout(() => {
      startupReady.current = true
      if (hasApkInstaller && !cleaned.current) { cleaned.current = true; void clearInstalledApks().catch(() => {}) }
      attempt()
    }, 10_000)
    const subscription = AppState.addEventListener('change', attempt)
    return () => { active = false; clearTimeout(timer); subscription.remove() }
  }, [check, update, network.isConnected, network.isInternetReachable])
  return <Context.Provider value={{ result, checking, error, check, dismiss: () => setDismissed(true), dismissed, installation, update }}>{children}</Context.Provider>
}
export function useAppUpdate() {
  const context = useContext(Context)
  if (!context) throw new Error('Falta AppUpdateProvider')
  return context
}
