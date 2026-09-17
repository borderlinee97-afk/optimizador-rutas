import {
  Router,
} from 'express'

import {
  pool,
} from '../db/pool.js'

import {
  canAccessPersona,
} from '../services/hierarchyAccess.service.js'

const router =
  Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PRIORITIES =
  new Set([
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT',
  ])

const STATUSES =
  new Set([
    'TODO',
    'IN_PROGRESS',
    'DONE',
    'CANCELLED',
  ])

const ASSIGNER_ROLES =
  new Set([
    'DIRECTOR',
    'GERENTE',
    'COORDINADOR',
  ])

router.get(
  '/',
  async (
    req,
    res,
    next,
  ) => {
    try {
      const mode =
        String(
          req.query.mode ??
          'agenda',
        )
          .trim()
          .toLowerCase()

      const status =
        normalizeUpper(
          req.query.status,
        )

      if (
        status &&
        status !==
          'ALL' &&
        !STATUSES.has(
          status,
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'El estado solicitado no es válido',

            code:
              'TASK_STATUS_INVALID',
          })
      }

      const useAssignedMode =
        mode ===
          'assigned' &&
        (
          req.identityProfile
            .system_role ===
            'ADMIN' ||
          ASSIGNER_ROLES.has(
            req.identityProfile
              .rol,
          )
        )

      const result =
        await pool.query(
          `
          SELECT
            task.*,
            assignee.nombre AS assignee_name,
            assigner.nombre AS assigned_by_name,
            COUNT(DISTINCT comment.id)::integer AS comment_count,
            COUNT(DISTINCT evidence.id) FILTER (
              WHERE evidence.status = 'READY'
            )::integer AS evidence_count
          FROM public.operational_task task
          INNER JOIN public.personas assignee
            ON assignee.id = task.assignee_id
          INNER JOIN public.personas assigner
            ON assigner.id = task.assigned_by
          LEFT JOIN public.operational_task_comment comment
            ON comment.task_id = task.id
          LEFT JOIN public.visit_evidence evidence
            ON evidence.task_id = task.id
          WHERE (
            (
              $2::boolean = FALSE
              AND task.assignee_id = $1::uuid
            )
            OR
            (
              $2::boolean = TRUE
              AND task.assigned_by = $1::uuid
            )
          )
            AND (
              $3::text IS NULL
              OR $3::text = 'ALL'
              OR task.status = $3::text
            )
          GROUP BY
            task.id,
            assignee.nombre,
            assigner.nombre
          ORDER BY
            CASE task.status
              WHEN 'IN_PROGRESS' THEN 0
              WHEN 'TODO' THEN 1
              WHEN 'DONE' THEN 2
              ELSE 3
            END,
            task.due_at ASC NULLS LAST,
            task.created_at DESC
          `,
          [
            req.identityProfile.id,
            useAssignedMode,
            status ||
              null,
          ],
        )

      return res.json({
        mode:
          useAssignedMode
            ? 'assigned'
            : 'agenda',

        tasks:
          result.rows.map(
            mapTask,
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

router.post(
  '/',
  async (
    req,
    res,
    next,
  ) => {
    try {
      const actor =
        req.identityProfile

      const assigneeId =
        String(
          req.body?.assigneeId ??
          actor.id,
        ).trim()

      const title =
        String(
          req.body?.title ??
          '',
        ).trim()

      const description =
        normalizeText(
          req.body?.description,
        )

      const priority =
        normalizeUpper(
          req.body?.priority,
        ) ||
        'MEDIUM'

      const dueAt =
        parseOptionalDate(
          req.body?.dueAt,
        )

      const requiresEvidence =
        req.body?.requiresEvidence ===
        true

      if (
        !UUID_PATTERN.test(
          assigneeId,
        )
      ) {
        return invalidResponse(
          res,
          'TASK_ASSIGNEE_INVALID',
          'El responsable de la tarea no es válido',
        )
      }

      if (
        title.length <
          3 ||
        title.length >
          200
      ) {
        return invalidResponse(
          res,
          'TASK_TITLE_INVALID',
          'El título debe tener entre 3 y 200 caracteres',
        )
      }

      if (
        description &&
        description.length >
          4000
      ) {
        return invalidResponse(
          res,
          'TASK_DESCRIPTION_TOO_LONG',
          'La descripción no puede superar 4000 caracteres',
        )
      }

      if (
        !PRIORITIES.has(
          priority,
        )
      ) {
        return invalidResponse(
          res,
          'TASK_PRIORITY_INVALID',
          'La prioridad no es válida',
        )
      }

      if (
        req.body?.dueAt &&
        !dueAt
      ) {
        return invalidResponse(
          res,
          'TASK_DUE_AT_INVALID',
          'La fecha de vencimiento no es válida',
        )
      }

      const isSelfAssigned =
        assigneeId ===
        actor.id

      if (
        !isSelfAssigned &&
        actor.system_role !==
          'ADMIN' &&
        !ASSIGNER_ROLES.has(
          actor.rol,
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              'El perfil no puede asignar tareas a otros usuarios',

            code:
              'TASK_ASSIGNMENT_NOT_ALLOWED',
          })
      }

      if (
        !isSelfAssigned &&
        !await canAccessPersona(
          actor,
          assigneeId,
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              'El responsable no pertenece a la jerarquía autorizada',

            code:
              'TASK_ASSIGNEE_OUT_OF_SCOPE',
          })
      }

      const assigneeResult =
        await pool.query(
          `
          SELECT id
          FROM public.personas
          WHERE id = $1::uuid
            AND activo = TRUE
          LIMIT 1
          `,
          [
            assigneeId,
          ],
        )

      if (
        assigneeResult.rowCount ===
        0
      ) {
        return res
          .status(404)
          .json({
            error:
              'El responsable no existe o se encuentra inactivo',

            code:
              'TASK_ASSIGNEE_NOT_FOUND',
          })
      }

      const result =
        await pool.query(
          `
          INSERT INTO public.operational_task (
            assignee_id,
            assigned_by,
            created_by,
            title,
            description,
            priority,
            due_at,
            requires_evidence
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $2::uuid,
            $3,
            $4,
            $5,
            $6::timestamptz,
            $7
          )
          RETURNING *
          `,
          [
            assigneeId,
            actor.id,
            title,
            description,
            priority,
            dueAt,
            requiresEvidence,
          ],
        )

      return res
        .status(201)
        .json({
          ok:
            true,

          task:
            mapTask(
              result.rows[0],
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

router.patch(
  '/:taskId/status',
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect()

    try {
      const status =
        normalizeUpper(
          req.body?.status,
        )

      if (
        !STATUSES.has(
          status,
        )
      ) {
        return invalidResponse(
          res,
          'TASK_STATUS_INVALID',
          'El estado de la tarea no es válido',
        )
      }

      await client.query(
        'BEGIN',
      )

      const taskResult =
        await client.query(
          `
          SELECT *
          FROM public.operational_task
          WHERE id = $1::uuid
          LIMIT 1
          FOR UPDATE
          `,
          [
            req.params.taskId,
          ],
        )

      const task =
        taskResult.rows[0]

      if (!task) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(404)
          .json({
            error:
              'La tarea no existe',

            code:
              'TASK_NOT_FOUND',
          })
      }

      const isAssignee =
        task.assignee_id ===
        req.identityProfile.id

      const canCancelAsAssigner =
        status ===
          'CANCELLED' &&
        task.assigned_by ===
          req.identityProfile.id

      if (
        !isAssignee &&
        !canCancelAsAssigner &&
        req.identityProfile
          .system_role !==
          'ADMIN'
      ) {
        await client.query(
          'ROLLBACK',
        )

        return res
          .status(403)
          .json({
            error:
              'El perfil no puede cambiar el estado de esta tarea',

            code:
              'TASK_STATUS_CHANGE_NOT_ALLOWED',
          })
      }

      if (
        status ===
          'DONE' &&
        task.requires_evidence
      ) {
        const evidenceResult =
          await client.query(
            `
            SELECT 1
            FROM public.visit_evidence
            WHERE task_id = $1::uuid
              AND status = 'READY'
            LIMIT 1
            `,
            [
              task.id,
            ],
          )

        if (
          evidenceResult.rowCount ===
          0
        ) {
          await client.query(
            'ROLLBACK',
          )

          return res
            .status(409)
            .json({
              error:
                'La tarea requiere evidencia antes de completarse',

              code:
                'TASK_EVIDENCE_REQUIRED',
            })
        }
      }

      const result =
        await client.query(
          `
          UPDATE public.operational_task
          SET
            status = $2,
            started_at = CASE
              WHEN $2 = 'IN_PROGRESS'
              THEN COALESCE(started_at, NOW())
              ELSE started_at
            END,
            completed_at = CASE
              WHEN $2 = 'DONE'
              THEN COALESCE(completed_at, NOW())
              ELSE NULL
            END,
            updated_by = $3::uuid,
            updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING *
          `,
          [
            task.id,
            status,
            req.identityProfile.id,
          ],
        )

      await client.query(
        'COMMIT',
      )

      return res.json({
        ok:
          true,

        task:
          mapTask(
            result.rows[0],
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

      return next(
        error,
      )
    } finally {
      client.release()
    }
  },
)

router.post(
  '/:taskId/comments',
  async (
    req,
    res,
    next,
  ) => {
    try {
      const body =
        String(
          req.body?.body ??
          '',
        ).trim()

      if (
        body.length <
          1 ||
        body.length >
          2000
      ) {
        return invalidResponse(
          res,
          'TASK_COMMENT_INVALID',
          'El comentario debe tener entre 1 y 2000 caracteres',
        )
      }

      const taskResult =
        await pool.query(
          `
          SELECT *
          FROM public.operational_task
          WHERE id = $1::uuid
          LIMIT 1
          `,
          [
            req.params.taskId,
          ],
        )

      const task =
        taskResult.rows[0]

      if (
        !task ||
        !await canAccessTask(
          req.identityProfile,
          task,
        )
      ) {
        return res
          .status(404)
          .json({
            error:
              'La tarea no existe o no está dentro del ámbito autorizado',

            code:
              'TASK_NOT_FOUND',
          })
      }

      const client =
        await pool.connect()

      try {
        await client.query(
          'BEGIN',
        )

        const result =
          await client.query(
            `
            INSERT INTO public.operational_task_comment (
              task_id,
              author_id,
              body
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3
            )
            RETURNING *
            `,
            [
              task.id,
              req.identityProfile.id,
              body,
            ],
          )

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
            'COMMENT_ADDED',
            jsonb_build_object(
              'commentId',
              $3::uuid
            )
          )
          `,
          [
            task.id,
            req.identityProfile.id,
            result.rows[0].id,
          ],
        )

        await client.query(
          'COMMIT',
        )

        return res
          .status(201)
          .json({
            ok:
              true,

            comment: {
              id:
                result.rows[0].id,

              taskId:
                result.rows[0].task_id,

              authorId:
                result.rows[0].author_id,

              body:
                result.rows[0].body,

              createdAt:
                result.rows[0].created_at,
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
  '/:taskId',
  async (
    req,
    res,
    next,
  ) => {
    try {
      const taskResult =
        await pool.query(
          `
          SELECT *
          FROM public.operational_task
          WHERE id = $1::uuid
          LIMIT 1
          `,
          [
            req.params.taskId,
          ],
        )

      const task =
        taskResult.rows[0]

      if (
        !task ||
        !await canAccessTask(
          req.identityProfile,
          task,
        )
      ) {
        return res
          .status(404)
          .json({
            error:
              'La tarea no existe o no está dentro del ámbito autorizado',

            code:
              'TASK_NOT_FOUND',
          })
      }

      const [
        commentsResult,
        eventsResult,
      ] =
        await Promise.all([
          pool.query(
            `
            SELECT *
            FROM public.operational_task_comment
            WHERE task_id = $1::uuid
            ORDER BY created_at ASC
            `,
            [
              task.id,
            ],
          ),
          pool.query(
            `
            SELECT *
            FROM public.operational_task_event
            WHERE task_id = $1::uuid
            ORDER BY created_at ASC
            `,
            [
              task.id,
            ],
          ),
        ])

      return res.json({
        task:
          mapTask(
            task,
          ),

        comments:
          commentsResult.rows,

        events:
          eventsResult.rows,
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

async function canAccessTask(
  actor,
  task,
) {
  if (
    actor.system_role ===
      'ADMIN' ||
    task.assignee_id ===
      actor.id ||
    task.assigned_by ===
      actor.id
  ) {
    return true
  }

  return canAccessPersona(
    actor,
    task.assignee_id,
  )
}

function mapTask(
  row,
) {
  return {
    id:
      row.id,
    assigneeId:
      row.assignee_id,
    assigneeName:
      row.assignee_name ??
      null,
    assignedBy:
      row.assigned_by,
    assignedByName:
      row.assigned_by_name ??
      null,
    planItemId:
      row.plan_item_id,
    title:
      row.title,
    description:
      row.description,
    priority:
      row.priority,
    status:
      row.status,
    dueAt:
      row.due_at,
    startedAt:
      row.started_at,
    completedAt:
      row.completed_at,
    requiresEvidence:
      Boolean(
        row.requires_evidence,
      ),
    commentCount:
      Number(
        row.comment_count ??
        0,
      ),
    evidenceCount:
      Number(
        row.evidence_count ??
        0,
      ),
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  }
}

function invalidResponse(
  res,
  code,
  error,
) {
  return res
    .status(400)
    .json({
      error,
      code,
    })
}

function normalizeUpper(
  value,
) {
  return String(
    value ??
    '',
  )
    .trim()
    .toUpperCase()
}

function normalizeText(
  value,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  return normalized ||
    null
}

function parseOptionalDate(
  value,
) {
  if (
    value ==
      null ||
    value ===
      ''
  ) {
    return null
  }

  const date =
    new Date(
      value,
    )

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString()
}

export default router
