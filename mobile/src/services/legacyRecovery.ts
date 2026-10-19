import * as Crypto from 'expo-crypto'
import { ApiError, apiRequest, getCurrentProfile, listVisitEvidence } from '../lib/api'
import { archiveVerifiedRecoveryVisit } from './planSync'
import type { MobilePlanItem } from '../types/mobilePlan'
import { db, getDatabaseUserId, getLegacyRecoveryJournal, isDatabaseActive, legacyTables,
  readLegacyRows, type LegacyRow, type LegacyTable } from '../../storage/db'
import { setLegacyRecoveryActive } from '../../storage/db'

type PlanProof = { plan: { id: string; supervisorId: string }; items: MobilePlanItem[] }
type TaskProof = { task: { id: string }; evidence: Array<{
  id: string; task_id: string; supervisor_id: string; status: string
}>; comments: Array<{ id: string; task_id: string; author_id: string; body: string }> }
type Claim = { source_hash: string; auth_user_id: string; profile_id: string; state: string }
type Candidate = { table: LegacyTable; row: LegacyRow; confirmed?: boolean; detachedEvidence?: boolean; readyOnServer?: boolean }
export type LegacyRecoveryResult = {
  copied: number; alreadyRecovered: number; confirmed: number; retained: number
  reasons: Record<string, number>
}
type RecoveryAccount = { userId: string; profileId: string; accessToken: string; isCurrent: () => boolean }
const keys: Record<LegacyTable, string> = {
  plan_items: 'id', plan_item_activities: 'id', plan_cache: 'cache_key', evidence_queue: 'evidence_id',
  execution_outbox: 'id', operational_task_cache: 'cache_key', operational_task_outbox: 'idempotency_key',
}
const identityFields: Partial<Record<LegacyTable, string[]>> = {
  plan_items: ['plan_id'], plan_item_activities: ['plan_item_id'],
  evidence_queue: ['idempotency_key', 'plan_item_id', 'activity_id', 'task_id', 'local_uri', 'captured_at', 'mime_type'],
  execution_outbox: ['plan_item_id', 'activity_id', 'action_type', 'payload_json', 'depends_on_evidence_id'],
  operational_task_outbox: ['task_id', 'action_type', 'payload_json'],
}
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`
const serialize = (row: LegacyRow) => JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]]))
let recovering = false

export async function recoverLegacyData(account: RecoveryAccount): Promise<LegacyRecoveryResult> {
  if (recovering) throw new Error('Ya hay una recuperación en curso. Intenta nuevamente al terminar.')
  const database = db
  if (!database || !account.isCurrent() || !isDatabaseActive(account.userId)) throw new Error('Conéctate con una cuenta autorizada para recuperar datos.')
  recovering = true
  setLegacyRecoveryActive(database, true)
  try { return await recover(account) } finally { recovering = false; setLegacyRecoveryActive(database, false) }
}

async function recover(account: RecoveryAccount): Promise<LegacyRecoveryResult> {
  const database = db
  const checkAccount = () => {
    if (!account.isCurrent() || !isDatabaseActive(account.userId) || getDatabaseUserId(database) !== account.userId || database !== db) {
      throw new Error('La cuenta cambió. No se transfirieron más registros; la base original sigue conservada.')
    }
  }
  checkAccount()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    // Do not infer ownership from the last login, a local display name, hierarchy
    // access, or the current assignee of a mutable task.
    const authorization = await getCurrentProfile(account.accessToken, controller.signal)
    checkAccount()
    if (authorization.user.id !== account.userId || authorization.profile.id !== account.profileId ||
      !authorization.profile.activo || authorization.profile.area !== 'FARMACIAS' ||
      !['SUPERVISOR', 'COORDINADOR'].includes(authorization.profile.rol)) {
      throw new ApiError('El backend no autorizó esta cuenta para recuperar los datos.', 403)
    }
    const source = Object.fromEntries(legacyTables.map(table => [table, readLegacyRows(table)])) as Record<LegacyTable, LegacyRow[]>
    const result: LegacyRecoveryResult = { copied: 0, alreadyRecovered: 0, confirmed: 0, retained: 0, reasons: {} }
    const retain = (reason: string) => { result.retained++; result.reasons[reason] = (result.reasons[reason] ?? 0) + 1 }
    const candidates: Candidate[] = []
    const plans = new Map<string, PlanProof | null>()
    const tasks = new Map<string, TaskProof | null>()
    async function read<T>(path: string): Promise<T | null> {
      try {
        const response = await apiRequest<T>(path, { method: 'GET', signal: controller.signal }, account.accessToken)
        checkAccount()
        return response
      } catch (error) {
        checkAccount()
        // Not found/invalid target is not proof that the current account owns it.
        if (error instanceof ApiError && [400, 404].includes(error.status)) return null
        throw error
      }
    }
    async function ownPlan(id: string) {
      if (!plans.has(id)) {
        const proof = await read<PlanProof>(`/api/mobile/work-plans/${encodeURIComponent(id)}`)
        plans.set(id, proof?.plan?.id === id && proof.plan.supervisorId === account.profileId && Array.isArray(proof.items) ? proof : null)
      }
      return plans.get(id) ?? null
    }
    async function task(id: string) {
      if (!tasks.has(id)) tasks.set(id, await read<TaskProof>(`/api/mobile/tasks/${encodeURIComponent(id)}`))
      const proof = tasks.get(id)
      return proof?.task?.id === id ? proof : null
    }
    const verifiedItems = new Map<string, NonNullable<PlanProof['items'][number]>>()
    const verifiedActivities = new Map<string, string>()
    const remember = (item: MobilePlanItem) => {
      verifiedItems.set(item.id, item)
      for (const activity of item.activities ?? []) {
        if (activity.planItemId === item.id) verifiedActivities.set(activity.id, item.id)
      }
    }
    for (const row of source.plan_items) {
      const proof = typeof row.plan_id === 'string' ? await ownPlan(row.plan_id) : null
      const item = proof?.items.find(item => item.id === row.id && item.planId === row.plan_id)
      if (!item) { retain('ownership_unverified'); continue }
      remember(item)
      candidates.push({ table: 'plan_items', row })
    }
    // Previous versions could replace the plan but leave old photos queued.
    // Recover missing parent visits from owned plans, including past plans.
    const orphanIds = new Set([...source.evidence_queue, ...source.execution_outbox]
      .filter(row => row.plan_item_id && !verifiedItems.has(String(row.plan_item_id))).map(row => String(row.plan_item_id)))
    if (orphanIds.size) {
      const mine = await read<{ plans: Array<{ id: string }> }>('/api/mobile/work-plans/mine?includeArchived=true')
      for (const entry of mine?.plans ?? []) {
        const proof = await ownPlan(entry.id)
        for (const item of proof?.items ?? []) {
          if (orphanIds.has(item.id) && item.planId === entry.id) { remember(item); orphanIds.delete(item.id) }
        }
        if (!orphanIds.size) break
      }
    }
    for (const row of source.plan_item_activities) {
      if (verifiedItems.has(String(row.plan_item_id)) && verifiedActivities.get(String(row.id)) === row.plan_item_id) {
        candidates.push({ table: 'plan_item_activities', row })
      } else retain('ownership_unverified')
    }
    const verifiedEvidence = new Set<string>()
    for (const row of source.evidence_queue) {
      if (typeof row.local_uri !== 'string' || !row.local_uri.startsWith('file://')) { retain('invalid_file_reference'); continue }
      const visitOwned = !row.task_id && verifiedItems.has(String(row.plan_item_id)) &&
        (!row.activity_id || verifiedActivities.get(String(row.activity_id)) === row.plan_item_id)
      // A task can be reassigned. Only the immutable owner of this exact server
      // evidence ID proves attribution; merely seeing/being assigned the task does not.
      const taskProof = row.task_id && !row.plan_item_id && !row.activity_id ? await task(String(row.task_id)) : null
      const taskEvidence = taskProof?.evidence?.find(evidence => evidence.id === row.evidence_id &&
        evidence.task_id === row.task_id && evidence.supervisor_id === account.profileId)
      if (visitOwned || taskEvidence) {
        verifiedEvidence.add(String(row.evidence_id))
        candidates.push({ table: 'evidence_queue', row, readyOnServer: taskEvidence?.status === 'READY' })
      } else if (row.plan_item_id && !row.task_id) {
        let evidence = null
        try {
          const response = await listVisitEvidence(String(row.plan_item_id), account.accessToken)
          checkAccount()
          evidence = response.evidence.find(evidence => evidence.id === row.evidence_id &&
            evidence.supervisorId === account.profileId && evidence.planItemId === row.plan_item_id &&
            (evidence.activityId ?? null) === (row.activity_id ?? null) && evidence.status === 'READY')
        } catch (error) {
          checkAccount()
          if (!(error instanceof ApiError) || ![400, 404].includes(error.status)) throw error
        }
        if (evidence) candidates.push({ table: 'evidence_queue', row, detachedEvidence: true, readyOnServer: true })
        else retain('ownership_unverified')
      } else retain('ownership_unverified')
    }
    for (const row of source.execution_outbox) {
      if (verifiedItems.has(String(row.plan_item_id)) &&
        (!row.activity_id || verifiedActivities.get(String(row.activity_id)) === row.plan_item_id) &&
        (!row.depends_on_evidence_id || verifiedEvidence.has(String(row.depends_on_evidence_id)))) {
        candidates.push({ table: 'execution_outbox', row })
      } else retain('dependency_or_owner_unverified')
    }
    for (const row of source.operational_task_outbox) {
      const proof = await task(String(row.task_id))
      let payload: { body?: string } = {}
      try {
        const parsed = JSON.parse(String(row.payload_json))
        if (parsed && typeof parsed === 'object') payload = parsed
      } catch { /* Unattributable remains preserved. */ }
      if (row.action_type === 'COMMENT' && typeof payload.body === 'string' && proof?.comments?.some(comment =>
        comment.id === row.idempotency_key && comment.task_id === row.task_id &&
        comment.author_id === account.profileId && comment.body === payload.body)) {
        // It was already delivered. Record a receipt; never enqueue/replay it.
        candidates.push({ table: 'operational_task_outbox', row, confirmed: true })
      } else retain('task_actor_unverified')
    }
    for (const row of source.plan_cache) {
      const proof = row.plan_id ? await ownPlan(String(row.plan_id)) : null
      if (row.cache_key === 'today' && proof && source.plan_items.length > 0 &&
        source.plan_items.every(item => candidates.some(candidate => candidate.table === 'plan_items' && candidate.row.id === item.id))) candidates.push({ table: 'plan_cache', row })
      else retain('snapshot_unverified')
    }
    // Mixed-user task JSON is never copied. The normal online endpoint rebuilds it.
    for (const _row of source.operational_task_cache) retain('refresh_task_cache_online')
    checkAccount()
    const journal = getLegacyRecoveryJournal()
    const copiedItems = new Set<string>()
    const copiedActivities = new Map<string, string>()
    const copiedEvidence = new Set<string>()
    const restoreSnapshot = !database.getFirstSync("SELECT 1 FROM plan_cache WHERE cache_key = 'today'") &&
      candidates.some(candidate => candidate.table === 'plan_cache')
    for (const candidate of candidates) {
      checkAccount()
      const { table, row } = candidate
      const sourceId = row[keys[table]]
      if (typeof sourceId !== 'string' || !sourceId) { retain('invalid_record'); continue }
      const encoded = serialize(row)
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, encoded)
      checkAccount()
      const currentSource = readLegacyRows(table).find(current => current[keys[table]] === sourceId)
      if (!currentSource || serialize(currentSource) !== encoded) { retain('legacy_changed'); continue }
      const previous = journal.getFirstSync<Claim>('SELECT * FROM recovery_claims WHERE source_table = ? AND source_id = ?', [table, sourceId])
      if (previous && (previous.auth_user_id !== account.userId || previous.profile_id !== account.profileId || previous.source_hash !== hash)) {
        retain('claim_conflict'); continue
      }
      const receipt = database.getFirstSync<Claim>('SELECT * FROM legacy_recovery_receipts WHERE source_table = ? AND source_id = ?', [table, sourceId])
      if (receipt && (receipt.source_hash !== hash || receipt.auth_user_id !== account.userId || receipt.profile_id !== account.profileId)) {
        retain('receipt_conflict'); continue
      }
      if (previous?.state === 'COPIED' && !receipt) { retain('receipt_missing'); continue }
      const parentId = String(row.plan_item_id ?? '')
      if (['plan_item_activities', 'evidence_queue', 'execution_outbox'].includes(table) &&
        !copiedItems.has(parentId) && verifiedItems.has(parentId) &&
        !candidates.some(candidate => candidate.table === 'plan_items' && candidate.row.id === parentId)) {
        try {
          archiveVerifiedRecoveryVisit(verifiedItems.get(parentId)!, account.userId, account.profileId)
          copiedItems.add(parentId)
          for (const activity of verifiedItems.get(parentId)?.activities ?? []) copiedActivities.set(activity.id, parentId)
        } catch { retain('parent_conflict'); continue }
      }
      // Older installations may retain a photo but no local activity row.
      // Fill only that missing dependency from the verified owner's server data;
      // an existing legacy activity must go through its own transfer/receipt.
      if (row.activity_id && copiedItems.has(parentId) && !copiedActivities.has(String(row.activity_id)) &&
        verifiedActivities.get(String(row.activity_id)) === parentId &&
        !source.plan_item_activities.some(activity => activity.id === row.activity_id)) {
        try {
          const item = verifiedItems.get(parentId)!
          archiveVerifiedRecoveryVisit({ ...item, activities: item.activities?.filter(activity => activity.id === row.activity_id) }, account.userId, account.profileId)
          copiedActivities.set(String(row.activity_id), parentId)
        } catch { retain('parent_conflict'); continue }
      }
      const parentReady = table === 'plan_item_activities' ? copiedItems.has(String(row.plan_item_id)) :
        table === 'evidence_queue' ? candidate.detachedEvidence || (!row.plan_item_id || copiedItems.has(String(row.plan_item_id))) &&
          (!row.activity_id || copiedActivities.get(String(row.activity_id)) === row.plan_item_id) :
        table === 'execution_outbox' ? copiedItems.has(String(row.plan_item_id)) &&
          (!row.activity_id || copiedActivities.get(String(row.activity_id)) === row.plan_item_id) &&
          (!row.depends_on_evidence_id || copiedEvidence.has(String(row.depends_on_evidence_id))) :
        table === 'plan_cache' ? source.plan_items.every(item => copiedItems.has(String(item.id))) : true
      if (!parentReady) { retain('dependency_unavailable'); continue }
      if (!previous) journal.runSync(`INSERT INTO recovery_claims
        (source_table, source_id, source_hash, auth_user_id, profile_id, state, verified_at)
        VALUES (?, ?, ?, ?, ?, 'RESERVED', ?)`, [table, sourceId, hash, account.userId, account.profileId, Date.now()])
      let outcome = receipt ? 'ALREADY_RECOVERED' : candidate.confirmed ? 'CONFIRMED' : 'INSERTED'
      try {
        database.withTransactionSync(() => {
          if (receipt) return
          const existing = database.getFirstSync<LegacyRow>(`SELECT * FROM ${quote(table)} WHERE ${quote(keys[table])} = ?`, [sourceId])
          if (existing) {
            if ((identityFields[table] ?? []).some(field => field in row && row[field] !== existing[field])) throw new Error('identity_conflict')
            if (candidate.confirmed) {
              database.runSync("UPDATE operational_task_outbox SET status = 'SYNCED', last_error = NULL WHERE idempotency_key = ?", [sourceId])
            } else {
              if (candidate.readyOnServer) database.runSync("UPDATE evidence_queue SET status = 'READY', last_error = NULL WHERE evidence_id = ?", [sourceId])
              outcome = 'EXISTING'
            }
          } else {
            const columns = database.getAllSync<{ name: string }>(`PRAGMA table_info(${quote(table)})`).map(column => column.name)
            if (Object.keys(row).some(column => !columns.includes(column))) throw new Error('schema_mismatch')
            const destinationRow = candidate.confirmed ? { ...row, status: 'SYNCED', last_error: null } :
              candidate.readyOnServer ? { ...row, status: 'READY', last_error: null } : row
            const fields = Object.keys(destinationRow)
            database.runSync(`INSERT INTO ${quote(table)} (${fields.map(quote).join(',')}) VALUES (${fields.map(() => '?').join(',')})`, fields.map(field => destinationRow[field]))
          }
          database.runSync(`INSERT INTO legacy_recovery_receipts
            (source_table, source_id, source_hash, auth_user_id, profile_id, outcome, hidden_from_today, recovered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [table, sourceId, hash, account.userId, account.profileId, outcome,
            table === 'plan_items' && !existing && !restoreSnapshot ? 1 : 0, Date.now()])
        })
      } catch {
        retain('destination_conflict'); continue
      }
      // A crash here leaves a reservation plus an atomic destination receipt.
      // The next run completes this journal entry without replaying consumed queues.
      journal.runSync("UPDATE recovery_claims SET state = 'COPIED' WHERE source_table = ? AND source_id = ?", [table, sourceId])
      if (table === 'plan_items') copiedItems.add(sourceId)
      if (table === 'plan_item_activities') copiedActivities.set(sourceId, String(row.plan_item_id))
      if (table === 'evidence_queue') copiedEvidence.add(sourceId)
      if (outcome === 'CONFIRMED') result.confirmed++
      else if (outcome === 'ALREADY_RECOVERED') result.alreadyRecovered++
      else result.copied++
    }
    return result
  } finally { clearTimeout(timeout) }
}

export function readRecoveredVisits(userId: string) {
  if (!isDatabaseActive(userId)) return []
  return db.getAllSync<{ id: string; name: string; scheduled_date: string | null; synced_at: number | null; pending: number }>(`
    SELECT p.id, p.name, p.scheduled_date, p.synced_at,
      (SELECT COUNT(*) FROM evidence_queue e WHERE e.plan_item_id = p.id AND e.status <> 'READY') AS pending
    FROM plan_items p JOIN legacy_recovery_receipts r ON r.source_table = 'plan_items' AND r.source_id = p.id
    WHERE r.auth_user_id = ? ORDER BY p.scheduled_date DESC, p.ord ASC`, [userId])
}

export function readRecoveredEvidenceTargets(userId: string) {
  if (!isDatabaseActive(userId)) return []
  return db.getAllSync<{ plan_item_id: string | null; task_id: string | null }>(`
    SELECT DISTINCT e.plan_item_id, e.task_id FROM evidence_queue e
    JOIN legacy_recovery_receipts r ON r.source_table = 'evidence_queue' AND r.source_id = e.evidence_id
    WHERE r.auth_user_id = ?`, [userId])
}
