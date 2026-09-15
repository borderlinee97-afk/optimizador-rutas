import {
  pool,
} from '../db/pool.js'

import {
  appendWorkPlanEvent,
} from './workPlanAudit.service.js'

import {
  findPlanItemWithoutActivities,
} from './pharmacyActivity.service.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class WorkPlanApprovalError
  extends Error {
  constructor(
    message,
    {
      status = 500,
      code =
        'WORK_PLAN_APPROVAL_FAILED',
    } = {},
  ) {
    super(
      message,
    )

    this.name =
      'WorkPlanApprovalError'

    this.status =
      status

    this.code =
      code
  }
}

/**
 * ============================================================
 * APROBAR PLAN
 * ============================================================
 */

export async function approveWorkPlan({
  planId,
  actor,
}) {
  validatePlanId(
    planId,
  )

  validateManagerActor(
    actor,
  )

  const client =
    await pool.connect()

  try {
    await client.query(
      'BEGIN',
    )

    const plan =
      await lockManagerPlan(
        client,
        planId,
        actor.id,
      )

    validatePendingPlan(
      plan,
    )

    const itemsResult =
      await client.query(
        `
        SELECT
          COUNT(*)::integer
            AS total

        FROM public.work_plan_item

        WHERE plan_id =
            $1

          AND removed_at
            IS NULL
        `,
        [
          planId,
        ],
      )

    const totalItems =
      Number(
        itemsResult
          .rows[0]
          ?.total ??
        0,
      )

    if (
      totalItems ===
      0
    ) {
      throw new WorkPlanApprovalError(
        'No puede aprobarse un plan sin visitas',
        {
          status:
            409,

          code:
            'WORK_PLAN_WITHOUT_ITEMS',
        },
      )
    }

    const revisionResult =
      await client.query(
        `
        SELECT
          snapshot

        FROM public.work_plan_revision

        WHERE plan_id =
            $1::uuid

          AND revision_number =
            $2::integer

        LIMIT 1
        `,
        [
          planId,
          Number(
            plan.revision_number ??
            0,
          ),
        ],
      )

    const activityPlanningVersion =
      Number(
        revisionResult
          .rows[0]
          ?.snapshot
          ?.activityPlanningVersion ??
        0,
      )

    if (
      activityPlanningVersion >=
      1
    ) {
      const itemWithoutActivities =
        await findPlanItemWithoutActivities(
          client,
          planId,
        )

      if (
        itemWithoutActivities
      ) {
        throw new WorkPlanApprovalError(
          `No puede aprobarse el plan porque la visita "${itemWithoutActivities.name}" no tiene actividades programadas.`,
          {
            status:
              409,

            code:
              'WORK_PLAN_ITEM_WITHOUT_ACTIVITIES',
          },
        )
      }
    }

    const updateResult =
      await client.query(
        `
        UPDATE public.work_plan

        SET
          status =
            'APPROVED',

          approved_by =
            $2,

          approved_at =
            NOW(),

          rejected_by =
            NULL,

          rejected_at =
            NULL,

          rejection_comment =
            NULL,

          updated_by =
            $2

        WHERE id =
          $1

        RETURNING *
        `,
        [
          planId,
          actor.id,
        ],
      )

    const approvedPlan =
      updateResult.rows[0]

    await client.query(
      `
      UPDATE public.work_plan_revision

      SET
        status =
          'APPROVED',

        reviewed_by =
          $3,

        reviewed_at =
          NOW(),

        review_comment =
          NULL,

        updated_at =
          NOW()

      WHERE plan_id =
          $1

        AND revision_number =
          $2
      `,
      [
        planId,

        approvedPlan
          .revision_number,

        actor.id,
      ],
    )

    await appendWorkPlanEvent(
      client,
      {
        planId,

        entityType:
          'REVISION',

        entityId:
          planId,

        revisionNumber:
          Number(
            approvedPlan
              .revision_number ??
            0,
          ),

        eventType:
          'PLAN_APPROVED',

        actor,

        previousStatus:
          'PENDING_APPROVAL',

        newStatus:
          'APPROVED',

        beforeData:
          plan,

        afterData:
          approvedPlan,

        metadata: {
          totalItems,

          channel:
            actor.channel ??
            null,
        },
      },
    )

    await client.query(
      'COMMIT',
    )

    return {
      ok:
        true,

      plan:
        mapPlan(
          approvedPlan,
        ),
    }
  } catch (
    error
  ) {
    await rollbackSafely(
      client,
    )

    if (
      error instanceof
      WorkPlanApprovalError
    ) {
      throw error
    }

    console.error(
      '[workPlanApproval.service][approve]',
      error,
    )

    throw new WorkPlanApprovalError(
      'No fue posible aprobar el plan',
      {
        status:
          500,

        code:
          'WORK_PLAN_APPROVE_FAILED',
      },
    )
  } finally {
    client.release()
  }
}

/**
 * ============================================================
 * RECHAZAR PLAN
 * ============================================================
 */

export async function rejectWorkPlan({
  planId,
  actor,
  comment,
}) {
  validatePlanId(
    planId,
  )

  validateManagerActor(
    actor,
  )

  const normalizedComment =
    normalizeRequiredComment(
      comment,
    )

  const client =
    await pool.connect()

  try {
    await client.query(
      'BEGIN',
    )

    const plan =
      await lockManagerPlan(
        client,
        planId,
        actor.id,
      )

    validatePendingPlan(
      plan,
    )

    const updateResult =
      await client.query(
        `
        UPDATE public.work_plan

        SET
          status =
            'REJECTED',

          rejected_by =
            $2,

          rejected_at =
            NOW(),

          rejection_comment =
            $3,

          approved_by =
            NULL,

          approved_at =
            NULL,

          updated_by =
            $2

        WHERE id =
          $1

        RETURNING *
        `,
        [
          planId,
          actor.id,
          normalizedComment,
        ],
      )

    const rejectedPlan =
      updateResult.rows[0]

    await client.query(
      `
      UPDATE public.work_plan_revision

      SET
        status =
          'REJECTED',

        reviewed_by =
          $3,

        reviewed_at =
          NOW(),

        review_comment =
          $4,

        updated_at =
          NOW()

      WHERE plan_id =
          $1

        AND revision_number =
          $2
      `,
      [
        planId,

        rejectedPlan
          .revision_number,

        actor.id,

        normalizedComment,
      ],
    )

    await appendWorkPlanEvent(
      client,
      {
        planId,

        entityType:
          'REVISION',

        entityId:
          planId,

        revisionNumber:
          Number(
            rejectedPlan
              .revision_number ??
            0,
          ),

        eventType:
          'PLAN_REJECTED',

        actor,

        previousStatus:
          'PENDING_APPROVAL',

        newStatus:
          'REJECTED',

        comment:
          normalizedComment,

        beforeData:
          plan,

        afterData:
          rejectedPlan,

        metadata: {
          channel:
            actor.channel ??
            null,
        },
      },
    )

    await client.query(
      'COMMIT',
    )

    return {
      ok:
        true,

      plan:
        mapPlan(
          rejectedPlan,
        ),
    }
  } catch (
    error
  ) {
    await rollbackSafely(
      client,
    )

    if (
      error instanceof
      WorkPlanApprovalError
    ) {
      throw error
    }

    console.error(
      '[workPlanApproval.service][reject]',
      error,
    )

    throw new WorkPlanApprovalError(
      'No fue posible rechazar el plan',
      {
        status:
          500,

        code:
          'WORK_PLAN_REJECT_FAILED',
      },
    )
  } finally {
    client.release()
  }
}

/**
 * ============================================================
 * AUTORIZACIÓN
 * ============================================================
 */

async function lockManagerPlan(
  client,
  planId,
  managerId,
) {
  const result =
    await client.query(
      `
      SELECT
        wp.*,

        supervisor.nombre
          AS supervisor_name,

        coordinator.id
          AS coordinator_id,

        coordinator.nombre
          AS coordinator_name

      FROM public.work_plan
        wp

      INNER JOIN public.personas
        supervisor

        ON supervisor.id =
          wp.supervisor_id

      LEFT JOIN public.personas
        coordinator

        ON coordinator.id =
          supervisor.superior_id

        AND coordinator.area::text =
          'FARMACIAS'

        AND coordinator.rol::text =
          'COORDINADOR'

        AND coordinator.activo =
          TRUE

      WHERE wp.id =
          $1

        AND supervisor.area::text =
          'FARMACIAS'

        AND supervisor.rol::text =
          'SUPERVISOR'

        AND supervisor.activo =
          TRUE

        AND (
          supervisor.superior_id =
            $2

          OR coordinator.superior_id =
            $2
        )

      FOR UPDATE OF wp
      `,
      [
        planId,
        managerId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

function validatePendingPlan(
  plan,
) {
  if (!plan) {
    throw new WorkPlanApprovalError(
      'El plan no existe o no pertenece a la estructura del gerente',
      {
        status:
          404,

        code:
          'WORK_PLAN_APPROVAL_NOT_FOUND',
      },
    )
  }

  if (
    plan.archived_at ||
    plan.status ===
      'ARCHIVED'
  ) {
    throw new WorkPlanApprovalError(
      'El plan se encuentra archivado',
      {
        status:
          409,

        code:
          'WORK_PLAN_ARCHIVED',
      },
    )
  }

  if (
    plan.status !==
    'PENDING_APPROVAL'
  ) {
    throw new WorkPlanApprovalError(
      'El plan ya no se encuentra pendiente de aprobación',
      {
        status:
          409,

        code:
          'WORK_PLAN_NOT_PENDING_APPROVAL',
      },
    )
  }
}

function validatePlanId(
  planId,
) {
  if (
    !UUID_PATTERN.test(
      String(
        planId ??
        '',
      ),
    )
  ) {
    throw new WorkPlanApprovalError(
      'El identificador del plan no es válido',
      {
        status:
          400,

        code:
          'INVALID_WORK_PLAN_ID',
      },
    )
  }
}

function validateManagerActor(
  actor,
) {
  if (!actor?.id) {
    throw new WorkPlanApprovalError(
      'No existe un perfil operativo válido',
      {
        status:
          403,

        code:
          'PROFILE_REQUIRED',
      },
    )
  }

  if (
    String(
      actor.area ??
      '',
    )
      .trim()
      .toUpperCase() !==
      'FARMACIAS'
  ) {
    throw new WorkPlanApprovalError(
      'Esta operación está disponible únicamente para Farmacias',
      {
        status:
          403,

        code:
          'AREA_NOT_ALLOWED',
      },
    )
  }

  if (
    String(
      actor.rol ??
      '',
    )
      .trim()
      .toUpperCase() !==
      'GERENTE'
  ) {
    throw new WorkPlanApprovalError(
      'Esta operación está disponible únicamente para gerentes',
      {
        status:
          403,

        code:
          'MANAGER_ROLE_REQUIRED',
      },
    )
  }
}

function normalizeRequiredComment(
  value,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  if (!normalized) {
    throw new WorkPlanApprovalError(
      'Debes indicar el motivo del rechazo',
      {
        status:
          400,

        code:
          'REJECTION_COMMENT_REQUIRED',
      },
    )
  }

  if (
    normalized.length >
    2000
  ) {
    throw new WorkPlanApprovalError(
      'El motivo del rechazo no puede superar 2000 caracteres',
      {
        status:
          400,

        code:
          'REJECTION_COMMENT_TOO_LONG',
      },
    )
  }

  return normalized
}

/**
 * ============================================================
 * RESPUESTA
 * ============================================================
 */

function mapPlan(
  row,
) {
  return {
    id:
      row.id,

    supervisorId:
      row.supervisor_id,

    status:
      row.status,

    planType:
      row.plan_type,

    periodStart:
      normalizeDateValue(
        row.period_start,
      ),

    periodEnd:
      normalizeDateValue(
        row.period_end,
      ),

    revisionNumber:
      Number(
        row.revision_number ??
        0,
      ),

    createdBy:
      row.created_by,

    createdAt:
      row.created_at,

    updatedBy:
      row.updated_by,

    updatedAt:
      row.updated_at,

    submittedBy:
      row.submitted_by,

    submittedAt:
      row.submitted_at,

    approvedBy:
      row.approved_by,

    approvedAt:
      row.approved_at,

    rejectedBy:
      row.rejected_by,

    rejectedAt:
      row.rejected_at,

    rejectionComment:
      row.rejection_comment,

    archivedBy:
      row.archived_by,

    archivedAt:
      row.archived_at,
  }
}

function normalizeDateValue(
  value,
) {
  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      )
  }

  return String(
    value ??
    '',
  ).slice(
    0,
    10,
  )
}

async function rollbackSafely(
  client,
) {
  try {
    await client.query(
      'ROLLBACK',
    )
  } catch (
    rollbackError
  ) {
    console.error(
      '[workPlanApproval.service][rollback]',
      rollbackError,
    )
  }
}