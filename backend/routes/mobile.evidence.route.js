import {
  Router,
} from 'express'

import {
  pool,
} from '../db/pool.js'

import {
  getSupabaseAdmin,
} from '../lib/supabaseAdmin.js'

import {
  canAccessPersona,
} from '../services/hierarchyAccess.service.js'

import {
  getEvidencePolicy,
} from '../services/evidencePolicy.service.js'

const router =
  Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ALLOWED_MIME_TYPES =
  new Map([
    [
      'image/jpeg',
      'jpg',
    ],
    [
      'image/png',
      'png',
    ],
    [
      'image/webp',
      'webp',
    ],
  ])

const EVIDENCE_BUCKET =
  'visit-evidence'

router.get(
  '/policy',
  (
    req,
    res,
  ) => {
    return res.json({
      policy:
        getEvidencePolicy(),
    })
  },
)

router.post(
  '/items/:itemId',
  async (
    req,
    res,
    next,
  ) => {
    try {
      const target =
        await loadOwnedVisitTarget(
          req.params.itemId,
          req.identityProfile,
          req.body?.activityId,
        )

      if (!target.ok) {
        return res
          .status(target.status)
          .json(target.body)
      }

      return await createUploadTicket(
        req,
        res,
        {
          planItemId:
            target.item.id,

          activityId:
            target.activityId,

          taskId:
            null,

          ownerId:
            target.item.supervisor_id,
        },
      )
    } catch (
      error
    ) {
      return next(
        error,
      )
    }
  },
)

router.post(
  '/tasks/:taskId',
  async (
    req,
    res,
    next,
  ) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            id,
            assignee_id
          FROM public.operational_task
          WHERE id = $1::uuid
          LIMIT 1
          `,
          [
            req.params.taskId,
          ],
        )

      const task =
        result.rows[0]

      if (
        !task ||
        task.assignee_id !==
          req.identityProfile.id
      ) {
        return res
          .status(404)
          .json({
            error:
              'La tarea no existe o no pertenece al usuario autenticado',

            code:
              'TASK_NOT_FOUND',
          })
      }

      return await createUploadTicket(
        req,
        res,
        {
          planItemId:
            null,

          activityId:
            null,

          taskId:
            task.id,

          ownerId:
            task.assignee_id,
        },
      )
    } catch (
      error
    ) {
      return next(
        error,
      )
    }
  },
)

router.post(
  '/:evidenceId/complete',
  async (
    req,
    res,
    next,
  ) => {
    try {
      const result =
        await pool.query(
          `
          SELECT *
          FROM public.visit_evidence
          WHERE id = $1::uuid
            AND supervisor_id = $2::uuid
          LIMIT 1
          `,
          [
            req.params.evidenceId,
            req.identityProfile.id,
          ],
        )

      const evidence =
        result.rows[0]

      if (!evidence) {
        return res
          .status(404)
          .json({
            error:
              'La evidencia no existe o no pertenece al usuario autenticado',

            code:
              'EVIDENCE_NOT_FOUND',
          })
      }

      if (
        evidence.status ===
        'READY'
      ) {
        return res.json({
          ok:
            true,

          evidence:
            mapEvidence(
              evidence,
            ),
        })
      }

      const exists =
        await storageObjectExists(
          evidence.storage_path,
        )

      if (!exists) {
        return res
          .status(409)
          .json({
            error:
              'El archivo de evidencia aún no está disponible',

            code:
              'EVIDENCE_UPLOAD_NOT_FOUND',
          })
      }

      const updateResult =
        await pool.query(
          `
          UPDATE public.visit_evidence
          SET
            status = 'READY',
            uploaded_at = COALESCE(uploaded_at, NOW()),
            rejection_reason = NULL,
            updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING *
          `,
          [
            evidence.id,
          ],
        )

      if (
        evidence.task_id
      ) {
        await pool.query(
          `
          INSERT INTO public.operational_task_event (
            task_id,
            actor_id,
            event_type,
            metadata
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            'EVIDENCE_ADDED',
            jsonb_build_object(
              'evidenceId',
              $3::uuid
            )
          )
          `,
          [
            evidence.task_id,
            req.identityProfile.id,
            evidence.id,
          ],
        )
      }

      return res.json({
        ok:
          true,

        evidence:
          mapEvidence(
            updateResult.rows[0],
          ),
      })
    } catch (
      error
    ) {
      return next(
        error,
      )
    }
  },
)

router.get(
  '/items/:itemId',
  async (
    req,
    res,
    next,
  ) => {
    try {
      const itemResult =
        await pool.query(
          `
          SELECT
            wpi.id,
            wp.supervisor_id
          FROM public.work_plan_item wpi
          INNER JOIN public.work_plan wp
            ON wp.id = wpi.plan_id
          WHERE wpi.id = $1::uuid
          LIMIT 1
          `,
          [
            req.params.itemId,
          ],
        )

      const item =
        itemResult.rows[0]

      if (
        !item ||
        !await canAccessPersona(
          req.identityProfile,
          item.supervisor_id,
        )
      ) {
        return res
          .status(404)
          .json({
            error:
              'La visita no existe o no está dentro del ámbito autorizado',

            code:
              'PLAN_ITEM_NOT_FOUND',
          })
      }

      const evidenceResult =
        await pool.query(
          `
          SELECT *
          FROM public.visit_evidence
          WHERE plan_item_id = $1::uuid
            AND status = 'READY'
          ORDER BY captured_at ASC, created_at ASC
          `,
          [
            item.id,
          ],
        )

      const evidence =
        await Promise.all(
          evidenceResult.rows.map(
            addSignedReadUrl,
          ),
        )

      return res.json({
        evidence,
      })
    } catch (
      error
    ) {
      return next(
        error,
      )
    }
  },
)

async function loadOwnedVisitTarget(
  itemId,
  profile,
  rawActivityId,
) {
  if (
    !UUID_PATTERN.test(
      String(
        itemId ??
        '',
      ),
    )
  ) {
    return invalidTarget(
      400,
      'INVALID_PLAN_ITEM_ID',
      'El identificador de visita no es válido',
    )
  }

  if (
    profile.area !==
      'FARMACIAS' ||
    profile.rol !==
      'SUPERVISOR'
  ) {
    return invalidTarget(
      403,
      'ROLE_NOT_ALLOWED',
      'Solo un supervisor puede registrar evidencia de su visita',
    )
  }

  const itemResult =
    await pool.query(
      `
      SELECT
        wpi.id,
        wp.supervisor_id
      FROM public.work_plan_item wpi
      INNER JOIN public.work_plan wp
        ON wp.id = wpi.plan_id
      WHERE wpi.id = $1::uuid
        AND wp.supervisor_id = $2::uuid
        AND wp.status = 'APPROVED'
      LIMIT 1
      `,
      [
        itemId,
        profile.id,
      ],
    )

  const item =
    itemResult.rows[0]

  if (!item) {
    return invalidTarget(
      404,
      'PLAN_ITEM_NOT_FOUND',
      'La visita no existe o no pertenece al usuario autenticado',
    )
  }

  const activityId =
    rawActivityId ==
      null ||
    rawActivityId ===
      ''
      ? null
      : String(
          rawActivityId,
        )

  if (
    activityId &&
    !UUID_PATTERN.test(
      activityId,
    )
  ) {
    return invalidTarget(
      400,
      'INVALID_ACTIVITY_ID',
      'El identificador de actividad no es válido',
    )
  }

  if (activityId) {
    const activityResult =
      await pool.query(
        `
        SELECT id
        FROM public.pharmacy_activity
        WHERE id = $1::uuid
          AND plan_item_id = $2::uuid
        LIMIT 1
        `,
        [
          activityId,
          item.id,
        ],
      )

    if (
      activityResult.rowCount ===
      0
    ) {
      return invalidTarget(
        404,
        'VISIT_ACTIVITY_NOT_FOUND',
        'La actividad no pertenece a esta visita',
      )
    }
  }

  return {
    ok:
      true,

    item,
    activityId,
  }
}

async function createUploadTicket(
  req,
  res,
  target,
) {
  const parsed =
    parseEvidencePayload(
      req.body,
    )

  if (!parsed.ok) {
    return res
      .status(400)
      .json(parsed.body)
  }

  const maxPerItem =
    positiveInteger(
      process.env.EVIDENCE_MAX_PER_ITEM,
      10,
    )

  const maxPerActivity =
    positiveInteger(
      process.env.EVIDENCE_MAX_PER_ACTIVITY,
      3,
    )

  const client =
    await pool.connect()

  try {
    await client.query(
      'BEGIN',
    )

    const existingResult =
      await client.query(
        `
        SELECT *
        FROM public.visit_evidence
        WHERE idempotency_key = $1::uuid
        LIMIT 1
        FOR UPDATE
        `,
        [
          parsed.value.idempotencyKey,
        ],
      )

    let evidence =
      existingResult.rows[0]

    if (evidence) {
      if (
        evidence.supervisor_id !==
          target.ownerId ||
        evidence.plan_item_id !==
          target.planItemId ||
        evidence.activity_id !==
          target.activityId ||
        evidence.task_id !==
          target.taskId
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(409)
          .json({
            error:
              'La clave de idempotencia ya pertenece a otra evidencia',

            code:
              'EVIDENCE_IDEMPOTENCY_CONFLICT',
          })
      }

      if (
        evidence.status ===
        'READY'
      ) {
        await client.query(
          'COMMIT',
        )

        return res.json({
          ok:
            true,

          evidence:
            mapEvidence(
              evidence,
            ),

          upload:
            null,
        })
      }
    } else {
      if (
        target.planItemId
      ) {
        const countResult =
          await client.query(
            `
            SELECT
              COUNT(*)::integer AS item_count,
              COUNT(*) FILTER (
                WHERE activity_id IS NOT DISTINCT FROM $2::uuid
              )::integer AS activity_count
            FROM public.visit_evidence
            WHERE plan_item_id = $1::uuid
              AND status <> 'REJECTED'
            `,
            [
              target.planItemId,
              target.activityId,
            ],
          )

        if (
          Number(
            countResult.rows[0]
              .item_count,
          ) >=
          maxPerItem
        ) {
          await client.query(
            'ROLLBACK',
          )

          return res
            .status(409)
            .json({
              error:
                `La visita admite como máximo ${maxPerItem} evidencias`,

              code:
                'EVIDENCE_ITEM_LIMIT_REACHED',
            })
        }

        if (
          target.activityId &&
          Number(
            countResult.rows[0]
              .activity_count,
          ) >=
          maxPerActivity
        ) {
          await client.query(
            'ROLLBACK',
          )

          return res
            .status(409)
            .json({
              error:
                `La actividad admite como máximo ${maxPerActivity} evidencias`,

              code:
                'EVIDENCE_ACTIVITY_LIMIT_REACHED',
            })
        }
      }

      const extension =
        ALLOWED_MIME_TYPES.get(
          parsed.value.mimeType,
        )

      const contextDirectory =
        target.planItemId
          ? `visits/${target.planItemId}`
          : `tasks/${target.taskId}`

      const storagePath =
        `${target.ownerId}/${contextDirectory}/${parsed.value.evidenceId}.${extension}`

      const insertResult =
        await client.query(
          `
          INSERT INTO public.visit_evidence (
            id,
            idempotency_key,
            plan_item_id,
            activity_id,
            task_id,
            supervisor_id,
            captured_at,
            latitude,
            longitude,
            accuracy_m,
            mocked,
            mime_type,
            byte_size,
            sha256,
            storage_bucket,
            storage_path
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            $5::uuid,
            $6::uuid,
            $7::timestamptz,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16
          )
          RETURNING *
          `,
          [
            parsed.value.evidenceId,
            parsed.value.idempotencyKey,
            target.planItemId,
            target.activityId,
            target.taskId,
            target.ownerId,
            parsed.value.capturedAt,
            parsed.value.latitude,
            parsed.value.longitude,
            parsed.value.accuracyM,
            parsed.value.mocked,
            parsed.value.mimeType,
            parsed.value.byteSize,
            parsed.value.sha256,
            EVIDENCE_BUCKET,
            storagePath,
          ],
        )

      evidence =
        insertResult.rows[0]
    }

    const uploadTicket =
      await createSignedUploadTicket(
        evidence.storage_path,
      )

    await client.query(
      'COMMIT',
    )

    return res
      .status(
        existingResult.rowCount >
          0
          ? 200
          : 201,
      )
      .json({
        ok:
          true,

        evidence:
          mapEvidence(
            evidence,
          ),

        upload: {
          path:
            evidence.storage_path,

          token:
            uploadTicket.token,
        },
      })
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () => {},
    )

    throw error
  } finally {
    client.release()
  }
}

function parseEvidencePayload(
  body,
) {
  const evidenceId =
    String(
      body?.evidenceId ??
      '',
    ).trim()

  const idempotencyKey =
    String(
      body?.idempotencyKey ??
      evidenceId,
    ).trim()

  const mimeType =
    String(
      body?.mimeType ??
      '',
    )
      .trim()
      .toLowerCase()

  const byteSize =
    Number(
      body?.byteSize,
    )

  const latitude =
    Number(
      body?.latitude,
    )

  const longitude =
    Number(
      body?.longitude,
    )

  const accuracyM =
    body?.accuracyM ==
      null
      ? null
      : Number(
          body.accuracyM,
        )

  const capturedAt =
    new Date(
      body?.capturedAt,
    )

  const mocked =
    body?.mocked ===
      true

  const sha256 =
    body?.sha256 ==
      null ||
    body.sha256 ===
      ''
      ? null
      : String(
          body.sha256,
        )
          .trim()
          .toLowerCase()

  const maxBytes =
    positiveInteger(
      process.env.EVIDENCE_MAX_BYTES,
      6 *
        1024 *
        1024,
    )

  const maxAccuracyM =
    positiveNumber(
      process.env.EVIDENCE_MAX_ACCURACY_M,
      100,
    )

  if (
    !UUID_PATTERN.test(
      evidenceId,
    ) ||
    !UUID_PATTERN.test(
      idempotencyKey,
    )
  ) {
    return invalidPayload(
      'EVIDENCE_ID_INVALID',
      'La evidencia requiere identificadores UUID válidos',
    )
  }

  if (
    !ALLOWED_MIME_TYPES.has(
      mimeType,
    )
  ) {
    return invalidPayload(
      'EVIDENCE_MIME_TYPE_NOT_ALLOWED',
      'La evidencia debe ser JPEG, PNG o WebP',
    )
  }

  if (
    !Number.isInteger(
      byteSize,
    ) ||
    byteSize <
      1 ||
    byteSize >
      maxBytes
  ) {
    return invalidPayload(
      'EVIDENCE_SIZE_NOT_ALLOWED',
      `La evidencia no puede superar ${maxBytes} bytes`,
    )
  }

  if (
    !Number.isFinite(
      latitude,
    ) ||
    latitude <
      -90 ||
    latitude >
      90 ||
    !Number.isFinite(
      longitude,
    ) ||
    longitude <
      -180 ||
    longitude >
      180
  ) {
    return invalidPayload(
      'EVIDENCE_COORDINATES_INVALID',
      'La evidencia requiere coordenadas válidas',
    )
  }

  if (
    accuracyM ==
      null ||
    !Number.isFinite(
      accuracyM,
    ) ||
    accuracyM <
      0 ||
    accuracyM >
      maxAccuracyM
  ) {
    return invalidPayload(
      'EVIDENCE_ACCURACY_NOT_ALLOWED',
      `La precisión de la evidencia debe ser de ${maxAccuracyM} metros o mejor`,
    )
  }

  if (mocked) {
    return invalidPayload(
      'EVIDENCE_MOCKED_LOCATION_REJECTED',
      'No se permite registrar evidencia con ubicación simulada',
    )
  }

  if (
    Number.isNaN(
      capturedAt.getTime(),
    ) ||
    capturedAt.getTime() >
      Date.now() +
        5 *
          60 *
          1000
  ) {
    return invalidPayload(
      'EVIDENCE_CAPTURE_TIME_INVALID',
      'La fecha de captura no es válida',
    )
  }

  if (
    sha256 &&
    !/^[a-f0-9]{64}$/.test(
      sha256,
    )
  ) {
    return invalidPayload(
      'EVIDENCE_SHA256_INVALID',
      'La huella SHA-256 no es válida',
    )
  }

  return {
    ok:
      true,

    value: {
      evidenceId,
      idempotencyKey,
      mimeType,
      byteSize,
      latitude,
      longitude,
      accuracyM,
      mocked,
      capturedAt:
        capturedAt.toISOString(),
      sha256,
    },
  }
}

async function createSignedUploadTicket(
  storagePath,
) {
  const admin =
    getSupabaseAdmin()

  const {
    data,
    error,
  } =
    await admin.storage
      .from(
        EVIDENCE_BUCKET,
      )
      .createSignedUploadUrl(
        storagePath,
        {
          upsert:
            true,
        },
      )

  if (
    error ||
    !data?.token
  ) {
    const storageError =
      new Error(
        'No fue posible preparar la carga de evidencia',
      )

    storageError.code =
      'EVIDENCE_UPLOAD_TICKET_FAILED'

    storageError.status =
      502

    throw storageError
  }

  return data
}

async function storageObjectExists(
  storagePath,
) {
  const separatorIndex =
    storagePath.lastIndexOf(
      '/',
    )

  const directory =
    storagePath.slice(
      0,
      separatorIndex,
    )

  const filename =
    storagePath.slice(
      separatorIndex +
        1,
    )

  const admin =
    getSupabaseAdmin()

  const {
    data,
    error,
  } =
    await admin.storage
      .from(
        EVIDENCE_BUCKET,
      )
      .list(
        directory,
        {
          limit:
            10,

          search:
            filename,
        },
      )

  if (error) {
    const storageError =
      new Error(
        'No fue posible verificar la evidencia',
      )

    storageError.code =
      'EVIDENCE_STORAGE_CHECK_FAILED'

    storageError.status =
      502

    throw storageError
  }

  return data.some(
    object =>
      object.name ===
      filename,
  )
}

async function addSignedReadUrl(
  row,
) {
  const admin =
    getSupabaseAdmin()

  const {
    data,
    error,
  } =
    await admin.storage
      .from(
        EVIDENCE_BUCKET,
      )
      .createSignedUrl(
        row.storage_path,
        300,
      )

  if (error) {
    throw error
  }

  return {
    ...mapEvidence(
      row,
    ),

    signedUrl:
      data.signedUrl,

    signedUrlExpiresIn:
      300,
  }
}

function mapEvidence(
  row,
) {
  return {
    id:
      row.id,

    planItemId:
      row.plan_item_id,

    activityId:
      row.activity_id,

    taskId:
      row.task_id,

    supervisorId:
      row.supervisor_id,

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
      row.accuracy_m ==
        null
        ? null
        : Number(
            row.accuracy_m,
          ),

    mimeType:
      row.mime_type,

    byteSize:
      Number(
        row.byte_size,
      ),

    status:
      row.status,

    uploadedAt:
      row.uploaded_at,
  }
}

function invalidTarget(
  status,
  code,
  error,
) {
  return {
    ok:
      false,
    status,
    body: {
      error,
      code,
    },
  }
}

function invalidPayload(
  code,
  error,
) {
  return {
    ok:
      false,
    body: {
      error,
      code,
    },
  }
}

function positiveInteger(
  value,
  fallback,
) {
  const parsed =
    Number.parseInt(
      String(
        value ??
        '',
      ),
      10,
    )

  return Number.isInteger(
    parsed,
  ) &&
    parsed >
      0
    ? parsed
    : fallback
}

function positiveNumber(
  value,
  fallback,
) {
  const parsed =
    Number(
      value,
    )

  return Number.isFinite(
    parsed,
  ) &&
    parsed >
      0
    ? parsed
    : fallback
}

export default router
