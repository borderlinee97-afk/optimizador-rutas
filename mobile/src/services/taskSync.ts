import * as Crypto from 'expo-crypto'

import { db, initDB, isDatabaseActive } from '../../storage/db'
import {
  ApiError,
  addOperationalTaskComment,
  listOperationalTasks,
  updateOperationalTaskStatus,
} from '../lib/api'
import type {
  OperationalTaskListResponse,
  OperationalTaskStatus,
} from '../types/task'

type TaskMode = 'agenda' | 'assigned'
type OutboxRow = {
  idempotency_key: string
  task_id: string
  action_type: 'STATUS' | 'COMMENT'
  payload_json: string
}

export type TaskOutboxSummary = {
  pending: number
  failed: number
}

export function isRetryableTaskMutationError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return true
  }

  return (
    error.status === 0 ||
    error.status === 401 ||
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429 ||
    error.status >= 500
  )
}

function cacheKey(mode: TaskMode, status: string, priority: string) {
  return `${mode}:${status}:${priority}`
}

export function readCachedAgenda(mode: TaskMode, status = 'ALL', priority = 'ALL') {
  initDB()
  const row = db.getFirstSync(
    `SELECT payload_json, synced_at FROM operational_task_cache
     WHERE cache_key IN (?, ?) ORDER BY CASE WHEN cache_key = ? THEN 0 ELSE 1 END LIMIT 1`,
    [cacheKey(mode, status, priority), `${mode}:latest`, cacheKey(mode, status, priority)],
  ) as { payload_json: string; synced_at: number } | null
  if (!row) return null
  const response = JSON.parse(row.payload_json) as OperationalTaskListResponse
  response.tasks = response.tasks.filter(task =>
    (status === 'ALL' || task.status === status) &&
    (priority === 'ALL' || task.priority === priority),
  )
  return { response, syncedAt: row.synced_at }
}

export async function syncAgenda(
  accessToken: string,
  mode: TaskMode,
  status = 'ALL',
  priority = 'ALL',
  userId?: string,
) {
  if (userId && !isDatabaseActive(userId)) throw new Error('La cuenta cambió durante la sincronización.')
  initDB()
  const database = db
  const outbox = await flushTaskOutbox(accessToken, database)
  const response = await listOperationalTasks(accessToken, mode, { status, priority })
  const syncedAt = Date.now()
  database.runSync(
    `INSERT INTO operational_task_cache (cache_key, payload_json, synced_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, synced_at = excluded.synced_at`,
    [cacheKey(mode, status, priority), JSON.stringify(response), syncedAt],
  )
  if (status === 'ALL' && priority === 'ALL') {
    database.runSync(
      `INSERT INTO operational_task_cache (cache_key, payload_json, synced_at) VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, synced_at = excluded.synced_at`,
      [`${mode}:latest`, JSON.stringify(response), syncedAt],
    )
  }
  return { response, syncedAt, outbox }
}

export function createTaskMutationKey() {
  return Crypto.randomUUID()
}

export function getTaskOutboxSummary(database = db): TaskOutboxSummary {

  const rows = database.getAllSync(
    `SELECT status, COUNT(*) AS total
     FROM operational_task_outbox
     GROUP BY status`,
  ) as { status: string; total: number }[]

  return rows.reduce<TaskOutboxSummary>(
    (summary, row) => {
      if (row.status === 'PENDING') summary.pending = Number(row.total)
      if (row.status === 'FAILED') summary.failed = Number(row.total)
      return summary
    },
    { pending: 0, failed: 0 },
  )
}

export function retryFailedTaskMutations() {
  initDB()
  db.runSync(
    `UPDATE operational_task_outbox
     SET status = 'PENDING', last_error = NULL, updated_at = ?
     WHERE status = 'FAILED'`,
    [Date.now()],
  )
}

export function discardFailedTaskMutations() {
  initDB()
  db.runSync(
    `DELETE FROM operational_task_outbox WHERE status = 'FAILED'`,
  )
}

function enqueue(
  taskId: string,
  actionType: 'STATUS' | 'COMMENT',
  payload: object,
  idempotencyKey = createTaskMutationKey(),
  database = db,
) {
  const now = Date.now()
  database.runSync(
    `INSERT INTO operational_task_outbox
      (idempotency_key, task_id, action_type, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [idempotencyKey, taskId, actionType, JSON.stringify(payload), now, now],
  )
  return idempotencyKey
}

export function enqueueTaskStatus(
  taskId: string,
  status: OperationalTaskStatus,
  idempotencyKey?: string,
  database = db,
) {
  return enqueue(taskId, 'STATUS', { status }, idempotencyKey, database)
}

export function enqueueTaskComment(
  taskId: string,
  body: string,
  idempotencyKey?: string,
  database = db,
) {
  return enqueue(taskId, 'COMMENT', { body }, idempotencyKey, database)
}

const activeTaskSyncs = new WeakMap<typeof db, Promise<TaskOutboxSummary>>()
export function flushTaskOutbox(accessToken: string, database = db) {
  const previous = activeTaskSyncs.get(database)
  if (previous) return previous
  const active = processTaskOutbox(accessToken, database).finally(() => activeTaskSyncs.delete(database))
  activeTaskSyncs.set(database, active)
  return active
}

async function processTaskOutbox(accessToken: string, database = db) {
  const rows = database.getAllSync(
    `SELECT idempotency_key, task_id, action_type, payload_json
     FROM operational_task_outbox WHERE status = 'PENDING' ORDER BY created_at`,
  ) as OutboxRow[]
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json) as { status?: OperationalTaskStatus; body?: string }
      if (row.action_type === 'STATUS' && payload.status) {
        await updateOperationalTaskStatus(row.task_id, payload.status, accessToken, row.idempotency_key)
      } else if (row.action_type === 'COMMENT' && payload.body) {
        await addOperationalTaskComment(row.task_id, payload.body, accessToken, row.idempotency_key)
      }
      database.runSync('DELETE FROM operational_task_outbox WHERE idempotency_key = ?', [row.idempotency_key])
    } catch (error) {
      const permanent = !isRetryableTaskMutationError(error)
      database.runSync(
        `UPDATE operational_task_outbox SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ?
         WHERE idempotency_key = ?`,
        [permanent ? 'FAILED' : 'PENDING', error instanceof Error ? error.message : 'Error de sincronización', Date.now(), row.idempotency_key],
      )
      if (!permanent) break
    }
  }

  return getTaskOutboxSummary(database)
}
