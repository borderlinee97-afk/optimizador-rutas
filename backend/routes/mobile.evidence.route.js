import { Router } from 'express'

import { pool } from '../db/pool.js'

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

const DEFAULT_MAX_BYTES =
  6 *
  1024 *
  1024

const DEFAULT_PENDING_UPLOAD_TTL_MINUTES =
  120

const STALE_PENDING_UPLOAD_REASON =
  'Carga incompleta expirada antes de completarse.'

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
          .status(
            target.status,
          )
          .json(
            target.body,
          )
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
      const taskId =
        String(
          req.params.taskId ??
          '',
        ).trim()

      if (
        !UUID_PATTERN.test(
          taskId,
        )
      ) {
        return res
          .status(
            400,
          )
          .json({
            error:
              'El identificador de tarea no es válido',

            code:
              'INVALID_TASK_ID',
          })
      }

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
            taskId,
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
          .status(
            404,
          )
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
    const evidenceId =
      String(
        req.params.evidenceId ??
        '',
      ).trim()

    if (
      !UUID_PATTERN.test(
        evidenceId,
      )
    ) {
      return res
        .status(
          400,
        )
        .json({
          error:
            'El identificador de evidencia no es válido',

          code:
            'INVALID_EVIDENCE_ID',
        })
    }

    try {
      const initialResult =
        await pool.query(
          `
          SELECT *
          FROM public.visit_evidence
          WHERE id = $1::uuid
            AND supervisor_id = $2::uuid
          LIMIT 1
          `,
          [
            evidenceId,
            req.identityProfile.id,
          ],
        )

      const initialEvidence =
        initialResult.rows[0]

      if (
        !initialEvidence
      ) {
        return res
          .status(
            404,
          )
          .json({
            error:
              'La evidencia no existe o no pertenece al usuario autenticado',

            code:
              'EVIDENCE_NOT_FOUND',
          })
      }

      if (
        initialEvidence.status ===
        'READY'
      ) {
        return res.json({
          ok:
            true,

          evidence:
            mapEvidence(
              initialEvidence,
            ),
        })
      }

      if (
        initialEvidence.status !==
        'PENDING_UPLOAD'
      ) {
        return res
          .status(
            409,
          )
          .json({
            error:
              'La evidencia ya no está disponible para completar la carga',

            code:
              'EVIDENCE_NOT_PENDING_UPLOAD',
          })
      }

      const exists =
        await storageObjectExists(
          initialEvidence.storage_path,
        )

      if (!exists) {
        return res
          .status(
            409,
          )
          .json({
            error:
              'El archivo de evidencia aún no está disponible',

            code:
              'EVIDENCE_UPLOAD_NOT_FOUND',
          })
      }

      const client =
        await pool.connect()

      try {
        await client.query(
          'BEGIN',
        )

        const updateResult =
          await client.query(
            `
            UPDATE public.visit_evidence
            SET
              status = 'READY',
              uploaded_at = COALESCE(
                uploaded_at,
                NOW()
              ),
              rejection_reason = NULL,
              updated_at = NOW()
            WHERE id = $1::uuid
              AND supervisor_id = $2::uuid
              AND status = 'PENDING_UPLOAD'
            RETURNING *
            `,
            [
              initialEvidence.id,
              req.identityProfile.id,
            ],
          )

        let updatedEvidence =
          updateResult.rows[0]

        /*
         * Puede ocurrir que dos solicitudes de confirmación
         * lleguen prácticamente al mismo tiempo.
         *
         * Sólo una debe realizar la transición
         * PENDING_UPLOAD -> READY y registrar el evento.
         */
        if (
          !updatedEvidence
        ) {
          const currentResult =
            await client.query(
              `
              SELECT *
              FROM public.visit_evidence
              WHERE id = $1::uuid
                AND supervisor_id = $2::uuid
              LIMIT 1
              `,
              [
                initialEvidence.id,
                req.identityProfile.id,
              ],
            )

          updatedEvidence =
            currentResult.rows[0]

          if (
            !updatedEvidence
          ) {
            await client.query(
              'ROLLBACK',
            )

            return res
              .status(
                404,
              )
              .json({
                error:
                  'La evidencia no existe o no pertenece al usuario autenticado',

                code:
                  'EVIDENCE_NOT_FOUND',
              })
          }

          if (
            updatedEvidence.status ===
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
                  updatedEvidence,
                ),
            })
          }

          await client.query(
            'ROLLBACK',
          )

          return res
            .status(
              409,
            )
            .json({
              error:
                'La evidencia ya no está disponible para completar la carga',

              code:
                'EVIDENCE_NOT_PENDING_UPLOAD',
            })
        }

        if (
          updatedEvidence.task_id
        ) {
          await client.query(
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
              updatedEvidence.task_id,
              req.identityProfile.id,
              updatedEvidence.id,
            ],
          )
        }

        await client.query(
          'COMMIT',
        )

        return res.json({
          ok:
            true,

          evidence:
            mapEvidence(
              updatedEvidence,
            ),
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
      const itemId =
        String(
          req.params.itemId ??
          '',
        ).trim()

      if (
        !UUID_PATTERN.test(
          itemId,
        )
      ) {
        return res
          .status(
            400,
          )
          .json({
            error:
              'El identificador de visita no es válido',

            code:
              'INVALID_PLAN_ITEM_ID',
          })
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
          LIMIT 1
          `,
          [
            itemId,
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
          .status(
            404,
          )
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
          ORDER BY
            captured_at ASC,
            created_at ASC
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
  const normalizedItemId =
    String(
      itemId ??
      '',
    ).trim()

  if (
    !UUID_PATTERN.test(
      normalizedItemId,
    )
  ) {
    return invalidTarget(
      400,
      'INVALID_PLAN_ITEM_ID',
      'El identificador de visita no es válido',
    )
  }

  const area =
    String(
      profile?.area ??
      '',
    )
      .trim()
      .toUpperCase()

  const role =
    String(
      profile?.rol ??
      '',
    )
      .trim()
      .toUpperCase()

  if (
    area !==
      'FARMACIAS' ||
    ![
      'SUPERVISOR',
      'COORDINADOR',
    ].includes(
      role,
    )
  ) {
    return invalidTarget(
      403,
      'ROLE_NOT_ALLOWED',
      'El perfil no tiene permisos para registrar evidencia de esta visita',
    )
  }

  const itemResult =
    await pool.query(
      `
      SELECT
        wpi.id,
        wpi.item_type::text AS item_type,
        wpi.source::text AS source,
        wp.supervisor_id
      FROM public.work_plan_item wpi
      INNER JOIN public.work_plan wp
        ON wp.id = wpi.plan_id
      WHERE wpi.id = $1::uuid
        AND wp.supervisor_id = $2::uuid
        AND wp.status = 'APPROVED'
        AND wp.archived_at IS NULL
        AND wpi.removed_at IS NULL
        AND (
          $3::text = 'SUPERVISOR'
          OR (
            $3::text = 'COORDINADOR'
            AND wpi.source::text IN (
              'PLAN',
              'HIERARCHY_ASSIGNED'
            )
            AND wpi.item_type::text IN (
              'PHARMACY',
              'EXTRA_STOP'
            )
          )
        )
      LIMIT 1
      `,
      [
        normalizedItemId,
        profile.id,
        role,
      ],
    )

  const item =
    itemResult.rows[0]

  if (
    !item
  ) {
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
        ).trim()

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

  if (
    activityId
  ) {
    const activityResult =
      await pool.query(
        `
        SELECT
          id
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

  if (
    !parsed.ok
  ) {
    return res
      .status(
        400,
      )
      .json(
        parsed.body,
      )
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

  const pendingUploadTtlMinutes =
    positiveInteger(
      process.env.EVIDENCE_PENDING_UPLOAD_TTL_MINUTES,
      DEFAULT_PENDING_UPLOAD_TTL_MINUTES,
    )

  const client =
    await pool.connect()

  try {
    await client.query(
      'BEGIN',
    )

    /*
     * Serializa la creación de evidencias para una misma
     * visita/tarea. Evita que dos requests simultáneos
     * superen el límite antes de que alguno haga COMMIT.
     */
    await lockEvidenceTarget(
      client,
      target,
    )

    /*
     * Las cargas que permanecieron PENDING_UPLOAD por más
     * tiempo que la vida útil configurada dejan de ocupar
     * para siempre un lugar del límite.
     */
    await expireStalePendingUploads(
      client,
      target,
      pendingUploadTtlMinutes,
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

    let created =
      false

    if (
      evidence
    ) {
      if (
        evidence.supervisor_id !==
          target.ownerId ||
        evidence.plan_item_id !==
          target.planItemId ||
        evidence.activity_id !==
          target.activityId ||
        evidence.task_id !==
          target.taskId ||
        evidence.mime_type !==
          parsed.value.mimeType
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(
            409,
          )
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

      /*
       * Una evidencia que fue rechazada exclusivamente porque
       * su PENDING_UPLOAD expiró puede reactivarse si el mismo
       * teléfono conserva la misma idempotency key.
       */
      if (
        evidence.status ===
        'REJECTED'
      ) {
        if (
          evidence.rejection_reason !==
          STALE_PENDING_UPLOAD_REASON
        ) {
          await client.query(
            'ROLLBACK',
          )

          return res
            .status(
              409,
            )
            .json({
              error:
                'La evidencia fue rechazada y no puede reactivarse con la misma clave',

              code:
                'EVIDENCE_REJECTED',
            })
        }

        await enforceEvidenceLimits(
          client,
          target,
          maxPerItem,
          maxPerActivity,
          evidence.id,
        )

        const reactivatedResult =
          await client.query(
            `
            UPDATE public.visit_evidence
            SET
              status = 'PENDING_UPLOAD',
              rejection_reason = NULL,
              uploaded_at = NULL,
              updated_at = NOW()
            WHERE id = $1::uuid
            RETURNING *
            `,
            [
              evidence.id,
            ],
          )

        evidence =
          reactivatedResult.rows[0]
      } else if (
        evidence.status !==
        'PENDING_UPLOAD'
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(
            409,
          )
          .json({
            error:
              'La evidencia se encuentra en un estado que no permite reintentar la carga',

            code:
              'EVIDENCE_STATE_CONFLICT',
          })
      }

      if (
        evidence.byte_size !==
        parsed.value.byteSize
      ) {
        const reconciledResult =
          await client.query(
            `
            UPDATE public.visit_evidence
            SET byte_size = $2,
                updated_at = NOW()
            WHERE id = $1::uuid
              AND status = 'PENDING_UPLOAD'
            RETURNING *
            `,
            [
              evidence.id,
              parsed.value.byteSize,
            ],
          )

        evidence =
          reconciledResult.rows[0]
      }
    } else {
      await enforceEvidenceLimits(
        client,
        target,
        maxPerItem,
        maxPerActivity,
        null,
      )

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

      created =
        true
    }

    /*
     * Se crea el ticket antes del COMMIT.
     *
     * Si Supabase Storage devuelve error, hacemos rollback.
     * Por tanto una creación nueva NO deja otra fila
     * PENDING_UPLOAD huérfana solamente porque falló
     * createSignedUploadUrl().
     */
    const uploadTicket =
      await createSignedUploadTicket(
        evidence.storage_path,
      )

    await client.query(
      'COMMIT',
    )

    return res
      .status(
        created
          ? 201
          : 200,
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

async function lockEvidenceTarget(
  client,
  target,
) {
  if (
    target.planItemId
  ) {
    await client.query(
      `
      SELECT
        id
      FROM public.work_plan_item
      WHERE id = $1::uuid
      FOR UPDATE
      `,
      [
        target.planItemId,
      ],
    )

    return
  }

  if (
    target.taskId
  ) {
    await client.query(
      `
      SELECT
        id
      FROM public.operational_task
      WHERE id = $1::uuid
      FOR UPDATE
      `,
      [
        target.taskId,
      ],
    )
  }
}

async function enforceEvidenceLimits(
  client,
  target,
  maxPerItem,
  maxPerActivity,
  excludeEvidenceId,
) {
  /*
   * Las tareas no utilizaban límite por visita/actividad
   * en la implementación original.
   */
  if (
    !target.planItemId
  ) {
    return
  }

  const countResult =
    await client.query(
      `
      SELECT
        COUNT(*)::integer
          AS item_count,

        COUNT(*) FILTER (
          WHERE activity_id
            IS NOT DISTINCT FROM
            $2::uuid
        )::integer
          AS activity_count

      FROM public.visit_evidence

      WHERE plan_item_id =
          $1::uuid

        AND status IN (
          'PENDING_UPLOAD',
          'READY'
        )

        AND (
          $3::uuid IS NULL
          OR id <> $3::uuid
        )
      `,
      [
        target.planItemId,
        target.activityId,
        excludeEvidenceId,
      ],
    )

  const itemCount =
    Number(
      countResult.rows[0]
        ?.item_count ??
      0,
    )

  const activityCount =
    Number(
      countResult.rows[0]
        ?.activity_count ??
      0,
    )

  if (
    itemCount >=
    maxPerItem
  ) {
    throw new EvidenceLimitError(
      `La visita admite como máximo ${maxPerItem} evidencias`,
      'EVIDENCE_ITEM_LIMIT_REACHED',
    )
  }

  if (
    target.activityId &&
    activityCount >=
      maxPerActivity
  ) {
    throw new EvidenceLimitError(
      `La actividad admite como máximo ${maxPerActivity} evidencias`,
      'EVIDENCE_ACTIVITY_LIMIT_REACHED',
    )
  }
}

async function expireStalePendingUploads(
  client,
  target,
  ttlMinutes,
) {
  const result =
    await client.query(
      `
      UPDATE public.visit_evidence

      SET
        status = 'REJECTED',
        rejection_reason = $4,
        updated_at = NOW()

      WHERE status =
          'PENDING_UPLOAD'

        AND uploaded_at
          IS NULL

        AND updated_at <
          NOW() -
          (
            $1::integer *
            INTERVAL '1 minute'
          )

        AND (
          (
            $2::uuid
              IS NOT NULL
            AND plan_item_id =
              $2::uuid
          )
          OR (
            $3::uuid
              IS NOT NULL
            AND task_id =
              $3::uuid
          )
        )

      RETURNING
        id
      `,
      [
        ttlMinutes,
        target.planItemId,
        target.taskId,
        STALE_PENDING_UPLOAD_REASON,
      ],
    )

  if (
    result.rowCount >
    0
  ) {
    console.warn(
      '[evidence-storage][STALE_PENDING_UPLOADS_EXPIRED]',
      {
        count:
          result.rowCount,

        planItemId:
          target.planItemId,

        taskId:
          target.taskId,

        ttlMinutes,
      },
    )
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
      DEFAULT_MAX_BYTES,
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

  if (
    mocked
  ) {
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
    /*
     * AQUÍ estaba uno de los problemas de diagnóstico.
     *
     * Antes se descartaba por completo el error real de
     * Supabase y solamente se devolvía:
     *
     * EVIDENCE_UPLOAD_TICKET_FAILED / 502
     *
     * Ahora Render conservará el detalle técnico real.
     *
     * NO se imprime:
     * - SUPABASE_SECRET_KEY
     * - access token
     * - upload token
     */
    logStorageError(
      'SIGNED_UPLOAD_TICKET_FAILED',
      error,
      {
        bucket:
          EVIDENCE_BUCKET,

        storagePath,

        hasData:
          Boolean(
            data,
          ),

        hasToken:
          Boolean(
            data?.token,
          ),
      },
    )

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

  console.log(
    '[evidence-storage][SIGNED_UPLOAD_TICKET_OK]',
    {
      bucket:
        EVIDENCE_BUCKET,

      storagePath,
    },
  )

  return data
}

async function storageObjectExists(
  storagePath,
) {
  const normalizedPath =
    String(
      storagePath ??
      '',
    ).trim()

  const separatorIndex =
    normalizedPath.lastIndexOf(
      '/',
    )

  if (
    separatorIndex <=
      0 ||
    separatorIndex ===
      normalizedPath.length -
      1
  ) {
    const storageError =
      new Error(
        'La ruta de almacenamiento de la evidencia no es válida',
      )

    storageError.code =
      'EVIDENCE_STORAGE_PATH_INVALID'

    storageError.status =
      500

    throw storageError
  }

  const directory =
    normalizedPath.slice(
      0,
      separatorIndex,
    )

  const filename =
    normalizedPath.slice(
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
            100,

          search:
            filename,
        },
      )

  if (
    error
  ) {
    logStorageError(
      'STORAGE_OBJECT_CHECK_FAILED',
      error,
      {
        bucket:
          EVIDENCE_BUCKET,

        directory,

        filename,
      },
    )

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

  return (
    Array.isArray(
      data,
    ) &&
    data.some(
      object =>
        object.name ===
        filename,
    )
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

  if (
    error ||
    !data?.signedUrl
  ) {
    logStorageError(
      'SIGNED_READ_URL_FAILED',
      error,
      {
        bucket:
          EVIDENCE_BUCKET,

        storagePath:
          row.storage_path,

        evidenceId:
          row.id,
      },
    )

    const storageError =
      new Error(
        'No fue posible preparar la visualización de la evidencia',
      )

    storageError.code =
      'EVIDENCE_READ_URL_FAILED'

    storageError.status =
      502

    throw storageError
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

function logStorageError(
  event,
  error,
  context =
    {},
) {
  console.error(
    `[evidence-storage][${event}]`,
    {
      ...context,

      supabaseError: {
        name:
          error?.name ??
          null,

        message:
          error?.message ??
          null,

        status:
          error?.status ??
          error?.statusCode ??
          null,

        statusCode:
          error?.statusCode ??
          null,

        code:
          error?.code ??
          null,

        error:
          error?.error ??
          null,
      },
    },
  )
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

  return (
    Number.isInteger(
      parsed,
    ) &&
    parsed >
      0
      ? parsed
      : fallback
  )
}

function positiveNumber(
  value,
  fallback,
) {
  const parsed =
    Number(
      value,
    )

  return (
    Number.isFinite(
      parsed,
    ) &&
    parsed >
      0
      ? parsed
      : fallback
  )
}

class EvidenceLimitError
  extends Error {
  constructor(
    message,
    code,
  ) {
    super(
      message,
    )

    this.name =
      'EvidenceLimitError'

    this.code =
      code

    this.status =
      409
  }
}

export default router
