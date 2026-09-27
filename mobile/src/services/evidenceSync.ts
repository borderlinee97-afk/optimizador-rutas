import {
  db,
} from '../../storage/db'
import { File } from 'expo-file-system'
import { Platform } from 'react-native'

import {
  ApiError,
  completeEvidenceUpload,
  createTaskEvidenceTicket,
  createVisitEvidenceTicket,
} from '../lib/api'

import {
  supabase,
} from '../lib/supabase'

import type {
  LocalEvidence,
} from '../types/evidence'

type EvidenceQueueRow = {
  evidence_id: string
  idempotency_key: string
  plan_item_id: string | null
  activity_id: string | null
  task_id: string | null
  local_uri: string
  mime_type: string
  byte_size: number
  captured_at: string
  latitude: number
  longitude: number
  accuracy_m: number
  mocked: number
  status: LocalEvidence['status']
  remote_path: string | null
  attempts: number
  last_error: string | null
}

export function queueEvidence(
  evidence: Omit<
    LocalEvidence,
    | 'status'
    | 'remotePath'
    | 'attempts'
    | 'lastError'
  >,
) {
  const now =
    Date.now()

  db.runSync(
    `
    INSERT INTO evidence_queue (
      evidence_id,
      idempotency_key,
      plan_item_id,
      activity_id,
      task_id,
      local_uri,
      mime_type,
      byte_size,
      captured_at,
      latitude,
      longitude,
      accuracy_m,
      mocked,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    ON CONFLICT(evidence_id)
    DO NOTHING
    `,
    [
      evidence.id,
      evidence.idempotencyKey,
      evidence.planItemId,
      evidence.activityId,
      evidence.taskId,
      evidence.localUri,
      evidence.mimeType,
      evidence.byteSize,
      evidence.capturedAt,
      evidence.latitude,
      evidence.longitude,
      evidence.accuracyM,
      evidence.mocked
        ? 1
        : 0,
      now,
      now,
    ],
  )
}

export function listLocalEvidence({
  planItemId,
  activityId,
  taskId,
}: {
  planItemId?: string
  activityId?: string | null
  taskId?: string
}): LocalEvidence[] {
  const conditions: string[] =
    []

  const values: Array<
    string | null
  > = []

  if (planItemId) {
    conditions.push(
      'plan_item_id = ?',
    )
    values.push(
      planItemId,
    )
  }

  if (
    activityId !==
    undefined
  ) {
    if (
      activityId ===
      null
    ) {
      conditions.push(
        'activity_id IS NULL',
      )
    } else {
      conditions.push(
        'activity_id = ?',
      )
      values.push(
        activityId,
      )
    }
  }

  if (taskId) {
    conditions.push(
      'task_id = ?',
    )
    values.push(
      taskId,
    )
  }

  if (
    conditions.length ===
    0
  ) {
    return []
  }

  const rows =
    db.getAllSync(
      `
      SELECT *
      FROM evidence_queue
      WHERE ${conditions.join(
        ' AND ',
      )}
      ORDER BY created_at ASC
      `,
      values,
    ) as EvidenceQueueRow[]

  return rows.map(
    mapEvidenceRow,
  )
}

let activeSync: Promise<{ synced: number; pending: number; failed: number }> | null = null

export function syncPendingEvidence(
  accessToken: string,
  retryFailed = false,
) {
  if (activeSync) return activeSync
  activeSync = processPendingEvidence(accessToken, retryFailed).finally(() => {
    activeSync = null
  })
  return activeSync
}

async function processPendingEvidence(
  accessToken: string,
  retryFailed: boolean,
): Promise<{
  synced: number
  pending: number
  failed: number
}> {
  const rows =
    db.getAllSync(
      `
      SELECT *
      FROM evidence_queue
      WHERE status IN (
        'PENDING',
        'UPLOADING'
      )
      OR (? = 1 AND status = 'FAILED')
      ORDER BY created_at ASC
      `,
      [retryFailed ? 1 : 0],
    ) as EvidenceQueueRow[]

  let synced =
    0

  let pending =
    0

  let failed =
    0

  for (
    const row of rows
  ) {
    let stage = 'SESSION'
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!data.session) throw new ApiError('Inicia sesión para sincronizar la evidencia.', 401)
      let currentSession = data.session
      if ((currentSession.expires_at ?? 0) * 1000 <= Date.now() + 60_000) {
        const refreshed = await supabase.auth.refreshSession()
        if (refreshed.error) throw refreshed.error
        if (!refreshed.data.session) throw new ApiError('Inicia sesión para sincronizar la evidencia.', 401)
        currentSession = refreshed.data.session
      }
      accessToken = currentSession.access_token
      markUploading(
        row.evidence_id,
      )

      const payload = {
        evidenceId:
          row.evidence_id,
        idempotencyKey:
          row.idempotency_key,
        capturedAt:
          row.captured_at,
        latitude:
          row.latitude,
        longitude:
          row.longitude,
        accuracyM:
          row.accuracy_m,
        mocked:
          row.mocked ===
          1,
        mimeType:
          row.mime_type,
        byteSize:
          row.byte_size,
      }

      stage = 'TICKET'
      const ticket =
        row.task_id
          ? await createTaskEvidenceTicket(
              row.task_id,
              payload,
              accessToken,
            )
          : await createVisitEvidenceTicket(
              row.plan_item_id!,
              {
                ...payload,
                activityId:
                  row.activity_id ??
                  undefined,
              },
              accessToken,
            )

      if (ticket.upload) {
        stage = 'LOCAL_FILE'
        const fileBody = Platform.OS === 'web'
          ? await (await fetch(row.local_uri)).arrayBuffer()
          : await new File(row.local_uri).arrayBuffer()
        if (fileBody.byteLength !== row.byte_size || fileBody.byteLength === 0) {
          throw new ApiError('El archivo local no coincide con la evidencia guardada.', 422, 'LOCAL_FILE_INVALID')
        }

        stage = 'STORAGE'
        const {
          error,
        } =
          await supabase.storage
            .from(
              'visit-evidence',
            )
            .uploadToSignedUrl(
              ticket.upload.path,
              ticket.upload.token,
              fileBody,
              {
                contentType:
                  row.mime_type,
                upsert:
                  true,
              },
            )

        if (error) {
          throw error
        }
      }

      stage = 'CONFIRMATION'
      const confirmation = await completeEvidenceUpload(
        row.evidence_id,
        accessToken,
      )
      if (!confirmation.ok || confirmation.evidence.id !== row.evidence_id || confirmation.evidence.status !== 'READY') {
        throw new Error('El servidor no confirmó la evidencia como READY.')
      }

      db.runSync(
        `
        UPDATE evidence_queue
        SET
          status = 'READY',
          remote_path = ?,
          last_error = NULL,
          updated_at = ?
        WHERE evidence_id = ?
        `,
        [
          ticket.upload?.path ??
            row.remote_path,
          Date.now(),
          row.evidence_id,
        ],
      )

      synced +=
        1
    } catch (
      error
    ) {
      if (error instanceof ApiError && error.status === 401) {
        // One refresh prepares the next explicit/foreground attempt; no retry loop.
        await supabase.auth.refreshSession().catch(() => undefined)
      }
      const permanent =
        error instanceof
          ApiError &&
        error.status >=
          400 &&
        error.status <
          500 &&
        ![
          401,
          408,
          409,
          429,
        ].includes(
          error.status,
        )

      const nextStatus =
        permanent || stage === 'LOCAL_FILE'
          ? 'FAILED'
          : 'PENDING'

      db.runSync(
        `
        UPDATE evidence_queue
        SET
          status = ?,
          attempts = attempts + 1,
          last_error = ?,
          updated_at = ?
        WHERE evidence_id = ?
        `,
        [
          nextStatus,
          getErrorMessage(
            error,
          ).replace(/^/, `${stage}: `),
          Date.now(),
          row.evidence_id,
        ],
      )

      if (permanent || stage === 'LOCAL_FILE') {
        failed +=
          1
      } else {
        pending +=
          1
      }
    }
  }

  return {
    synced,
    pending,
    failed,
  }
}

function markUploading(
  evidenceId: string,
) {
  db.runSync(
    `
    UPDATE evidence_queue
    SET
      status = 'UPLOADING',
      updated_at = ?
    WHERE evidence_id = ?
    `,
    [
      Date.now(),
      evidenceId,
    ],
  )
}

function mapEvidenceRow(
  row: EvidenceQueueRow,
): LocalEvidence {
  return {
    id:
      row.evidence_id,
    idempotencyKey:
      row.idempotency_key,
    planItemId:
      row.plan_item_id,
    activityId:
      row.activity_id,
    taskId:
      row.task_id,
    localUri:
      row.local_uri,
    mimeType:
      row.mime_type,
    byteSize:
      Number(
        row.byte_size,
      ),
    capturedAt:
      row.captured_at,
    latitude:
      Number(
        row.latitude,
      ),
    longitude:
      Number(
        row.longitude,
      ),
    accuracyM:
      Number(
        row.accuracy_m,
      ),
    mocked:
      row.mocked ===
      1,
    status:
      row.status,
    remotePath:
      row.remote_path,
    attempts:
      Number(
        row.attempts,
      ),
    lastError:
      row.last_error,
  }
}

function getErrorMessage(
  error: unknown,
) {
  if (
    error instanceof
    Error
  ) {
    return error.message.slice(
      0,
      1000,
    )
  }

  return 'Error de sincronización de evidencia'
}
