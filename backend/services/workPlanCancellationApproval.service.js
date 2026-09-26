import { pool } from '../db/pool.js'
import { appendWorkPlanEvent } from './workPlanAudit.service.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APPROVAL_ROLES = new Set([
  'DIRECTOR',
  'GERENTE',
  'COORDINADOR',
])

export class WorkPlanCancellationApprovalError extends Error {
  constructor(
    message,
    {
      status = 500,
      code = 'CANCELLATION_REQUEST_FAILED',
    } = {},
  ) {
    super(message)

    this.name = 'WorkPlanCancellationApprovalError'
    this.status = status
    this.code = code
  }
}

export async function approveCancellationRequest({
  itemId,
  actor,
}) {
  validateItemId(itemId)

  const actorRole =
    validateApprovalActor(actor)

  const client =
    await pool.connect()

  try {
    await client.query('BEGIN')

    const item =
      await lockCancellationRequestForActor(
        client,
        itemId,
        actorRole,
        actor.id,
      )

    validatePendingCancellationRequest(
      item,
      actor.id,
    )

    const updateResult =
      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          status = 'CANCELLED',

          cancellation_request_status = 'APPROVED',

          cancellation_reviewed_at = NOW(),
          cancellation_reviewed_by = $2,
          cancellation_review_comment = NULL,

          cancelled_at = NOW(),
          cancelled_by = $2,

          updated_by = $2,
          updated_at = NOW()

        WHERE id = $1

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

          requesterRole:
            item.requester_role ??
            null,

          channel:
            actor.channel ??
            null,
        },
      },
    )

    await client.query('COMMIT')

    return {
      ok: true,

      itemId,

      planId:
        item.plan_id,

      status:
        'CANCELLED',

      cancellationRequestStatus:
        'APPROVED',
    }
  } catch (error) {
    await rollbackSafely(client)

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
        status: 500,

        code:
          'CANCELLATION_REQUEST_APPROVE_FAILED',
      },
    )
  } finally {
    client.release()
  }
}

export async function rejectCancellationRequest({
  itemId,
  actor,
  comment,
}) {
  validateItemId(itemId)

  const actorRole =
    validateApprovalActor(actor)

  const normalizedComment =
    normalizeRequiredComment(
      comment,
    )

  const client =
    await pool.connect()

  try {
    await client.query('BEGIN')

    const item =
      await lockCancellationRequestForActor(
        client,
        itemId,
        actorRole,
        actor.id,
      )

    validatePendingCancellationRequest(
      item,
      actor.id,
    )

    const updateResult =
      await client.query(
        `
        UPDATE public.work_plan_item

        SET
          cancellation_request_status = 'REJECTED',

          cancellation_reviewed_at = NOW(),
          cancellation_reviewed_by = $2,
          cancellation_review_comment = $3,

          updated_by = $2,
          updated_at = NOW()

        WHERE id = $1

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

          requesterRole:
            item.requester_role ??
            null,

          channel:
            actor.channel ??
            null,
        },
      },
    )

    await client.query('COMMIT')

    return {
      ok: true,

      itemId,

      planId:
        item.plan_id,

      status:
        'PENDING',

      cancellationRequestStatus:
        'REJECTED',
    }
  } catch (error) {
    await rollbackSafely(client)

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
        status: 500,

        code:
          'CANCELLATION_REQUEST_REJECT_FAILED',
      },
    )
  } finally {
    client.release()
  }
}

/**
 * Cadena:
 *
 * SUPERVISOR -> COORDINADOR directo
 * SUPERVISOR sin coordinador -> GERENTE directo
 * COORDINADOR -> GERENTE directo
 *
 * DIRECTOR conserva el alcance jerárquico existente.
 *
 * Nadie puede resolver su propia solicitud.
 */
async function lockCancellationRequestForActor(
  client,
  itemId,
  actorRole,
  actorId,
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

        owner.nombre
          AS supervisor_name,

        owner.rol::text
          AS executor_role,

        owner.superior_id
          AS executor_superior_id,

        coordinator.id
          AS coordinator_id,

        coordinator.nombre
          AS coordinator_name,

        requester.nombre
          AS requester_name,

        requester.rol::text
          AS requester_role,

        requester.superior_id
          AS requester_superior_id

      FROM public.work_plan_item wpi

      INNER JOIN public.work_plan wp
        ON wp.id =
          wpi.plan_id

      INNER JOIN public.personas owner
        ON owner.id =
          wp.supervisor_id

      LEFT JOIN public.personas coordinator
        ON coordinator.id =
          owner.superior_id

        AND coordinator.area::text =
          'FARMACIAS'

        AND coordinator.rol::text =
          'COORDINADOR'

        AND coordinator.activo =
          TRUE

      INNER JOIN public.personas requester
        ON requester.id =
          wpi.cancellation_requested_by

      WHERE wpi.id =
          $1

        AND owner.area::text =
          'FARMACIAS'

        AND owner.rol::text IN (
          'SUPERVISOR',
          'COORDINADOR'
        )

        AND owner.activo =
          TRUE

        AND requester.area::text =
          'FARMACIAS'

        AND requester.activo =
          TRUE

        AND wpi.cancellation_requested_by
          <> $3::uuid

        AND (
          (
            $2::text =
              'COORDINADOR'

            AND requester.rol::text =
              'SUPERVISOR'

            AND requester.superior_id =
              $3::uuid

            AND owner.id =
              requester.id
          )

          OR (
            $2::text =
              'GERENTE'

            AND (
              (
                requester.rol::text =
                  'COORDINADOR'

                AND requester.superior_id =
                  $3::uuid

                AND owner.id =
                  requester.id
              )

              OR (
                requester.rol::text =
                  'SUPERVISOR'

                AND requester.superior_id =
                  $3::uuid

                AND owner.id =
                  requester.id
              )
            )
          )

          OR (
            $2::text =
              'DIRECTOR'

            AND (
              owner.superior_id =
                $3::uuid

              OR coordinator.superior_id =
                $3::uuid
            )
          )
        )

      FOR UPDATE OF wpi
      `,
      [
        itemId,
        actorRole,
        actorId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

function validatePendingCancellationRequest(
  item,
  actorId,
) {
  if (!item) {
    throw new WorkPlanCancellationApprovalError(
      'La solicitud no existe o no pertenece a tu estructura de aprobación',
      {
        status: 404,

        code:
          'CANCELLATION_REQUEST_NOT_FOUND',
      },
    )
  }

  if (
    String(
      item.cancellation_requested_by ??
      '',
    ) ===
    String(
      actorId ??
      '',
    )
  ) {
    throw new WorkPlanCancellationApprovalError(
      'No puedes resolver una solicitud de cancelación creada por ti',
      {
        status: 403,

        code:
          'SELF_CANCELLATION_REVIEW_NOT_ALLOWED',
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
        status: 409,

        code:
          'CANCELLATION_REQUEST_PLAN_NOT_APPROVED',
      },
    )
  }

  const itemType =
    String(
      item.item_type ??
      '',
    )
      .trim()
      .toUpperCase()

  const source =
    String(
      item.source ??
      '',
    )
      .trim()
      .toUpperCase()

  const isPlannedPharmacy =
    source ===
      'PLAN' &&
    itemType ===
      'PHARMACY'

  const isHierarchyAssignment =
    source ===
      'HIERARCHY_ASSIGNED' &&
    [
      'PHARMACY',
      'EXTRA_STOP',
    ].includes(
      itemType,
    )

  if (
    !isPlannedPharmacy &&
    !isHierarchyAssignment
  ) {
    throw new WorkPlanCancellationApprovalError(
      'La solicitud no corresponde a una visita programada',
      {
        status: 409,

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
        status: 409,

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
        status: 409,

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
        status: 400,

        code:
          'INVALID_PLAN_ITEM_ID',
      },
    )
  }
}

function validateApprovalActor(
  actor,
) {
  if (!actor?.id) {
    throw new WorkPlanCancellationApprovalError(
      'No existe un perfil operativo válido',
      {
        status: 403,

        code:
          'PROFILE_REQUIRED',
      },
    )
  }

  const area =
    String(
      actor.area ??
      '',
    )
      .trim()
      .toUpperCase()

  const role =
    String(
      actor.rol ??
      '',
    )
      .trim()
      .toUpperCase()

  if (
    area !==
      'FARMACIAS'
  ) {
    throw new WorkPlanCancellationApprovalError(
      'Esta función está disponible únicamente para Farmacias',
      {
        status: 403,

        code:
          'AREA_NOT_ALLOWED',
      },
    )
  }

  if (
    !APPROVAL_ROLES.has(
      role,
    )
  ) {
    throw new WorkPlanCancellationApprovalError(
      'Esta operación está disponible únicamente para roles de aprobación',
      {
        status: 403,

        code:
          'APPROVAL_ROLE_REQUIRED',
      },
    )
  }

  return role
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
        status: 400,

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
        status: 400,

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
  } catch (rollbackError) {
    console.error(
      '[workPlanCancellationApproval.service][rollback]',
      rollbackError,
    )
  }
}