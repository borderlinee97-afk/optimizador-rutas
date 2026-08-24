import {
  pool,
} from '../db/pool.js'

import {
  appendWorkPlanEvent,
} from './workPlanAudit.service.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class WorkPlanCancellationApprovalError
  extends Error {
  constructor(
    message,
    {
      status = 500,
      code =
        'CANCELLATION_REQUEST_FAILED',
    } = {},
  ) {
    super(
      message,
    )

    this.name =
      'WorkPlanCancellationApprovalError'

    this.status =
      status

    this.code =
      code
  }
}

/**
 * ============================================================
 * APROBAR CANCELACIÓN
 * ============================================================
 */

export async function approveCancellationRequest({
  itemId,
  actor,
}) {
  validateItemId(
    itemId,
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

    const item =
      await lockManagerCancellationRequest(
        client,
        itemId,
        actor.id,
      )

    validatePendingCancellationRequest(
      item,
    )

    const updateResult =
      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          status =
            'CANCELLED',

          cancellation_request_status =
            'APPROVED',

          cancellation_reviewed_at =
            NOW(),

          cancellation_reviewed_by =
            $2,

          cancellation_review_comment =
            NULL,

          cancelled_at =
            NOW(),

          cancelled_by =
            $2,

          updated_by =
            $2,

          updated_at =
            NOW()

        WHERE id =
          $1

        RETURNING *
        `,
        [
          itemId,
          actor.id,
        ],
      )

    const updatedItem =
      updateResult.rows[0]

    await appendWorkPlanEvent(
      client,
      {
        planId:
          item.plan_id,

        entityType:
          'PLAN_ITEM',

        entityId:
          itemId,

        revisionNumber:
          Number(
            item.revision_number ??
            0,
          ),

        eventType:
          'VISIT_CANCELLATION_APPROVED',

        actor,

        previousStatus:
          'PENDING',

        newStatus:
          'CANCELLED',

        beforeData:
          item,

        afterData:
          updatedItem,

        metadata: {
          cancellationRequestReason:
            item.cancellation_request_reason,

          requestedBy:
            item.cancellation_requested_by,

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

      itemId,

      planId:
        item.plan_id,

      status:
        'CANCELLED',

      cancellationRequestStatus:
        'APPROVED',
    }
  } catch (
    error
  ) {
    await rollbackSafely(
      client,
    )

    if (
      error instanceof
      WorkPlanCancellationApprovalError
    ) {
      throw error
    }

    console.error(
      '[workPlanCancellationApproval.service][approve]',
      error,
    )

    throw new WorkPlanCancellationApprovalError(
      'No fue posible aprobar la cancelación',
      {
        status:
          500,

        code:
          'CANCELLATION_REQUEST_APPROVE_FAILED',
      },
    )
  } finally {
    client.release()
  }
}

/**
 * ============================================================
 * RECHAZAR CANCELACIÓN
 * ============================================================
 */

export async function rejectCancellationRequest({
  itemId,
  actor,
  comment,
}) {
  validateItemId(
    itemId,
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

    const item =
      await lockManagerCancellationRequest(
        client,
        itemId,
        actor.id,
      )

    validatePendingCancellationRequest(
      item,
    )

    const updateResult =
      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          cancellation_request_status =
            'REJECTED',

          cancellation_reviewed_at =
            NOW(),

          cancellation_reviewed_by =
            $2,

          cancellation_review_comment =
            $3,

          updated_by =
            $2,

          updated_at =
            NOW()

        WHERE id =
          $1

        RETURNING *
        `,
        [
          itemId,
          actor.id,
          normalizedComment,
        ],
      )

    const updatedItem =
      updateResult.rows[0]

    await appendWorkPlanEvent(
      client,
      {
        planId:
          item.plan_id,

        entityType:
          'PLAN_ITEM',

        entityId:
          itemId,

        revisionNumber:
          Number(
            item.revision_number ??
            0,
          ),

        eventType:
          'VISIT_CANCELLATION_REJECTED',

        actor,

        previousStatus:
          'PENDING',

        newStatus:
          'PENDING',

        comment:
          normalizedComment,

        beforeData:
          item,

        afterData:
          updatedItem,

        metadata: {
          cancellationRequestReason:
            item.cancellation_request_reason,

          requestedBy:
            item.cancellation_requested_by,

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

      itemId,

      planId:
        item.plan_id,

      status:
        'PENDING',

      cancellationRequestStatus:
        'REJECTED',
    }
  } catch (
    error
  ) {
    await rollbackSafely(
      client,
    )

    if (
      error instanceof
      WorkPlanCancellationApprovalError
    ) {
      throw error
    }

    console.error(
      '[workPlanCancellationApproval.service][reject]',
      error,
    )

    throw new WorkPlanCancellationApprovalError(
      'No fue posible rechazar la solicitud de cancelación',
      {
        status:
          500,

        code:
          'CANCELLATION_REQUEST_REJECT_FAILED',
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

async function lockManagerCancellationRequest(
  client,
  itemId,
  managerId,
) {
  const result =
    await client.query(
      `
      SELECT
        wpi.*,

        wp.status
          AS plan_status,

        wp.archived_at
          AS plan_archived_at,

        wp.revision_number,

        wp.supervisor_id,

        supervisor.nombre
          AS supervisor_name,

        coordinator.id
          AS coordinator_id,

        coordinator.nombre
          AS coordinator_name

      FROM public.work_plan_item
        wpi

      INNER JOIN public.work_plan
        wp

        ON wp.id =
          wpi.plan_id

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

      WHERE wpi.id =
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

      FOR UPDATE OF wpi
      `,
      [
        itemId,
        managerId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

function validatePendingCancellationRequest(
  item,
) {
  if (!item) {
    throw new WorkPlanCancellationApprovalError(
      'La solicitud no existe o no pertenece a la estructura del gerente',
      {
        status:
          404,

        code:
          'CANCELLATION_REQUEST_NOT_FOUND',
      },
    )
  }

  if (
    item.plan_archived_at ||
    item.plan_status !==
      'APPROVED'
  ) {
    throw new WorkPlanCancellationApprovalError(
      'El plan ya no se encuentra autorizado para ejecución',
      {
        status:
          409,

        code:
          'CANCELLATION_REQUEST_PLAN_NOT_APPROVED',
      },
    )
  }

  if (
    item.item_type !==
      'PHARMACY' ||
    item.source !==
      'PLAN'
  ) {
    throw new WorkPlanCancellationApprovalError(
      'La solicitud no corresponde a una visita programada',
      {
        status:
          409,

        code:
          'INVALID_CANCELLATION_REQUEST_ITEM',
      },
    )
  }

  if (
    item.status !==
      'PENDING'
  ) {
    throw new WorkPlanCancellationApprovalError(
      'La visita ya no se encuentra pendiente',
      {
        status:
          409,

        code:
          'CANCELLATION_REQUEST_ITEM_NOT_PENDING',
      },
    )
  }

  if (
    item.cancellation_request_status !==
      'PENDING'
  ) {
    throw new WorkPlanCancellationApprovalError(
      'La solicitud ya fue resuelta',
      {
        status:
          409,

        code:
          'CANCELLATION_REQUEST_ALREADY_REVIEWED',
      },
    )
  }
}

function validateItemId(
  itemId,
) {
  if (
    !UUID_PATTERN.test(
      String(
        itemId ??
        '',
      ),
    )
  ) {
    throw new WorkPlanCancellationApprovalError(
      'El identificador de la visita no es válido',
      {
        status:
          400,

        code:
          'INVALID_PLAN_ITEM_ID',
      },
    )
  }
}

function validateManagerActor(
  actor,
) {
  if (!actor?.id) {
    throw new WorkPlanCancellationApprovalError(
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
    throw new WorkPlanCancellationApprovalError(
      'Esta función está disponible únicamente para Farmacias',
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
    throw new WorkPlanCancellationApprovalError(
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
    throw new WorkPlanCancellationApprovalError(
      'Debes indicar el motivo del rechazo',
      {
        status:
          400,

        code:
          'CANCELLATION_REJECTION_COMMENT_REQUIRED',
      },
    )
  }

  if (
    normalized.length >
    2000
  ) {
    throw new WorkPlanCancellationApprovalError(
      'El comentario no puede superar 2000 caracteres',
      {
        status:
          400,

        code:
          'CANCELLATION_REJECTION_COMMENT_TOO_LONG',
      },
    )
  }

  return normalized
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
      '[workPlanCancellationApproval.service][rollback]',
      rollbackError,
    )
  }
}