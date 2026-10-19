import { syncVisitExecution } from './executionSync'
import { db, isDatabaseActive } from '../../storage/db'
import { supabase } from '../lib/supabase'
import { syncPendingEvidence } from './evidenceSync'
import { flushTaskOutbox } from './taskSync'

export function countPendingSync(database = db) {
  const row = database.getFirstSync(`SELECT
    (SELECT COUNT(*) FROM evidence_queue WHERE status <> 'READY') +
    (SELECT COUNT(*) FROM operational_task_outbox WHERE status <> 'SYNCED') +
    (SELECT COUNT(*) FROM execution_outbox WHERE status <> 'SYNCED') AS total`) as { total: number }
  return Number(row.total)
}

// One monitor per keyed account mount. Retain awareness of a queue even if
// another screen drains it first, and never announce success with failed rows.
export function createSyncMonitor(userId: string, isCurrent: () => boolean, completed: () => Promise<void>) {
  let sawPending = false
  let running: Promise<void> | null = null
  function observe() {
    if (isCurrent() && isDatabaseActive(userId) && countPendingSync() > 0) sawPending = true
  }
  async function process() {
    if (!isCurrent() || !isDatabaseActive(userId)) return
    const database = db
    observe()
    const { data, error } = await supabase.auth.getSession()
    if (error || data.session?.user.id !== userId || !isCurrent()) return
    if (countPendingSync(database) > 0) {
      await flushTaskOutbox(data.session.access_token, database)
      if (!isCurrent() || !isDatabaseActive(userId) || database !== db) return
      await syncVisitExecution(userId)
      if (!isCurrent() || !isDatabaseActive(userId) || database !== db) return
      await syncPendingEvidence(data.session.access_token)
    }
    if (sawPending && isCurrent() && isDatabaseActive(userId) && database === db && countPendingSync(database) === 0) {
      sawPending = false
      await completed()
    }
  }
  return {
    observe,
    sync() {
      if (!running) running = process().finally(() => { running = null })
      return running
    },
  }
}
