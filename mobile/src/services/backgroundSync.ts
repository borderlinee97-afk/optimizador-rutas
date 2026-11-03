import NetInfo from '@react-native-community/netinfo'
import { AppState, Platform } from 'react-native'
import { activateUserDatabase, db, getDatabaseUserId, isDatabaseActive, isLegacyRecoveryActive } from '../../storage/db'
import { ApiError, getCurrentProfile } from '../lib/api'
import { readPersistedAuthSession, supabase } from '../lib/supabase'
import { isLocalLoginLocked } from './offlineLogin'
import { readProfileSnapshot } from './profileCache'
import { syncVisitExecution } from './executionSync'
import { syncPendingEvidence } from './evidenceSync'
import { flushTaskOutbox } from './taskSync'
import { syncTodayPlan } from './planSync'
import { downloadWorkPlanScreens } from './workPlanCache'

export type BackgroundSyncResult = 'synced' | 'skipped' | 'retry'
let running: Promise<BackgroundSyncResult> | null = null

/** No password login, account switching, local queue deletion or background GPS. */
export function runBackgroundSync(): Promise<BackgroundSyncResult> {
  if (!running) running = performSync().finally(() => { running = null })
  return running
}

async function performSync(): Promise<BackgroundSyncResult> {
  if (Platform.OS !== 'android' || AppState.currentState === 'active') return 'skipped'
  try {
    if (await isLocalLoginLocked()) return 'skipped'
    const saved = await readPersistedAuthSession()
    if (!saved) return 'skipped'
    const owner = saved.user.id
    const snapshot = await readProfileSnapshot(owner)
    if (!snapshot || snapshot.profile.area !== 'FARMACIAS' || !['SUPERVISOR', 'COORDINADOR'].includes(snapshot.profile.rol)) return 'skipped'
    const currentLogin = async () => !await isLocalLoginLocked() && (await readPersistedAuthSession())?.user.id === owner
    const connection = await NetInfo.fetch()
    if (connection.isConnected !== true || connection.isInternetReachable === false) return 'retry'
    if (!await currentLogin()) return 'skipped'

    const result = await supabase.auth.getSession()
    if (result.error) throw result.error
    if (result.data.session?.user.id !== owner || !await currentLogin()) return 'skipped'
    let session = result.data.session
    let authorized
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      try { authorized = await getCurrentProfile(session.access_token, controller.signal) }
      catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || !await currentLogin()) throw error
        const refreshed = await supabase.auth.refreshSession()
        if (refreshed.error) throw refreshed.error
        if (refreshed.data.session?.user.id !== owner || !await currentLogin()) return 'skipped'
        session = refreshed.data.session
        authorized = await getCurrentProfile(session.access_token, controller.signal)
      }
    } finally { clearTimeout(timeout) }
    if (authorized.user.id !== owner || !authorized.profile.activo || authorized.profile.id !== snapshot.profile.id ||
      authorized.profile.area !== 'FARMACIAS' || !['SUPERVISOR', 'COORDINADOR'].includes(authorized.profile.rol)) return 'skipped'
    if (!await currentLogin()) return 'skipped'
    // Never activate A over a different account already mounted by the UI.
    const activeOwner = getDatabaseUserId()
    if (activeOwner && activeOwner !== owner && isDatabaseActive(activeOwner)) return 'skipped'
    activateUserDatabase(owner)
    const database = db
    const ownsDatabase = () => db === database && isDatabaseActive(owner) && !isLegacyRecoveryActive(database)
    const current = async () => ownsDatabase() && await currentLogin()
    if (!await current()) return 'skipped'
    await flushTaskOutbox(session.access_token, database, ownsDatabase)
    if (!await current()) return 'skipped'
    await syncVisitExecution(owner)
    if (!await current()) return 'skipped'
    await syncPendingEvidence(session.access_token)
    if (!await current()) return 'skipped'
    // Activities/check-out can wait for their evidence confirmation in the first pass.
    await syncVisitExecution(owner)
    if (!await current()) return 'skipped'
    const fresh = await supabase.auth.getSession()
    if (fresh.error) throw fresh.error
    if (fresh.data.session?.user.id !== owner || !await current()) return 'skipped'
    const downloaded = await syncTodayPlan(fresh.data.session.access_token)
    if (!await current()) return 'skipped'
    await downloadWorkPlanScreens(fresh.data.session.access_token, owner,
      (downloaded.plans ?? (downloaded.plan ? [downloaded.plan] : [])).map(plan => plan.id))
    return await current() ? 'synced' : 'skipped'
  } catch {
    // Transport/authorization/conflict failures retain queues and downloaded data.
    // Foreground authorization remains responsible for the interactive access state.
    return 'retry'
  }
}
