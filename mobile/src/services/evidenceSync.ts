import {
  db,
} from '../../storage/db'

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

export async function syncPendingEvidence(
  accessToken: string,
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
      ORDER BY created_at ASC
      `,
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
    try {
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
        const fileResponse =
          await fetch(
            row.local_uri,
          )

        if (!fileResponse.ok) {
          throw new Error(
            'No fue posible leer la fotografía local.',
          )
        }

        const fileBody =
          await fileResponse.arrayBuffer()

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

      await completeEvidenceUpload(
        row.evidence_id,
        accessToken,
      )

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
      const permanent =
        error instanceof
          ApiError &&
        error.status >=
          400 &&
        error.status <
          500 &&
        ![
          408,
          409,
          429,
        ].includes(
          error.status,
        )

      const nextStatus =
        permanent
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
          ),
          Date.now(),
          row.evidence_id,
        ],
      )

      if (permanent) {
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
