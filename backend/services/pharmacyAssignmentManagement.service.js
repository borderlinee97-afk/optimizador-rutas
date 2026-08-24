import {
  pool,
} from '../db/pool.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BIGINT_PATTERN =
  /^\d+$/

export class PharmacyAssignmentManagementError
  extends Error {
  constructor(
    message,
    {
      status = 500,
      code = 'PHARMACY_ASSIGNMENT_MANAGEMENT_FAILED',
      details = null,
    } = {},
  ) {
    super(message)

    this.name =
      'PharmacyAssignmentManagementError'

    this.status =
      status

    this.code =
      code

    this.details =
      details
  }
}

// ============================================================
// ASIGNAR / REASIGNAR
// ============================================================

export async function assignPharmacySupervisor({
  pharmacyId,
  supervisorId,
  comment,
  actor,
}) {
  validatePharmacyId(
    pharmacyId,
  )

  validateSupervisorId(
    supervisorId,
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

    await lockAssignmentKey(
      client,
      pharmacyId,
    )

    const unit =
      await loadUnitForUpdate(
        client,
        pharmacyId,
      )

    await validateAssignableUnit({
      client,
      unit,
      actor,
    })

    const targetSupervisor =
      await loadTargetSupervisor(
        client,
        supervisorId,
        unit.state,
      )

    validateTargetSupervisor({
      supervisor:
        targetSupervisor,

      unit,
    })

    const activeAssignments =
      await loadActiveAssignments(
        client,
        pharmacyId,
      )

    if (
      activeAssignments.length >
      1
    ) {
      throw new PharmacyAssignmentManagementError(
        'La unidad tiene más de una asignación activa y requiere revisión técnica',
        {
          status:
            409,

          code:
            'MULTIPLE_ACTIVE_SUPERVISOR_ASSIGNMENTS',
        },
      )
    }

    const currentAssignment =
      activeAssignments[0] ??
      null

    if (
      currentAssignment
        ?.supervisor_id ===
      supervisorId
    ) {
      throw new PharmacyAssignmentManagementError(
        'El supervisor seleccionado ya es el titular de esta unidad',
        {
          status:
            409,

          code:
            'SUPERVISOR_ALREADY_ASSIGNED',
        },
      )
    }

    const blockingPlan =
      await findBlockingPlanItem(
        client,
        pharmacyId,
      )

    if (blockingPlan) {
      throwBlockingPlanError(
        blockingPlan,
        'La unidad tiene una actividad vigente y no puede reasignarse todavía',
      )
    }

    if (currentAssignment) {
      await client.query(
        `
        UPDATE public.pharmacy_supervisor_assignment

        SET
          revoked_by =
            $2,

          revoked_at =
            NOW(),

          revocation_reason =
            $3,

          updated_at =
            NOW()

        WHERE id =
          $1
        `,
        [
          currentAssignment.id,
          actor.id,
          normalizedComment,
        ],
      )
    }

    const insertResult =
      await client.query(
        `
        INSERT INTO public.pharmacy_supervisor_assignment (
          pharmacy_id,
          supervisor_id,
          assigned_by,
          assignment_comment
        )
        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        RETURNING *
        `,
        [
          pharmacyId,
          supervisorId,
          actor.id,
          normalizedComment,
        ],
      )

    const newAssignment =
      insertResult.rows[0]

    const eventType =
      currentAssignment
        ? 'PHARMACY_REASSIGNED'
        : 'PHARMACY_ASSIGNED'

    await appendAssignmentEvent(
      client,
      {
        assignmentId:
          newAssignment.id,

        coordinatorAssignmentId:
          unit.coordinator_assignment_id,

        pharmacyId:
          unit.id,

        supervisorId:
          targetSupervisor.id,

        coordinatorId:
          unit.coordinator_id,

        eventType,

        actorId:
          actor.id,

        comment:
          normalizedComment,

        beforeData:
          currentAssignment
            ? mapAssignment(
                currentAssignment,
              )
            : null,

        afterData:
          mapAssignment(
            newAssignment,
          ),

        metadata: {
          channel:
            actor.channel ??
            'WEB',

          action:
            currentAssignment
              ? 'REASSIGN'
              : 'ASSIGN',

          pharmacyName:
            unit.name,

          clues:
            unit.clues,

          previousSupervisorId:
            currentAssignment
              ?.supervisor_id ??
            null,

          previousSupervisorName:
            currentAssignment
              ?.supervisor_name ??
            null,

          newSupervisorId:
            targetSupervisor.id,

          newSupervisorName:
            targetSupervisor.name,

          coordinatorId:
            unit.coordinator_id,

          coordinatorName:
            unit.coordinator_name,
        },
      },
    )

    await client.query(
      'COMMIT',
    )

    return {
      ok:
        true,

      action:
        currentAssignment
          ? 'REASSIGNED'
          : 'ASSIGNED',

      pharmacy: {
        id:
          String(
            unit.id,
          ),

        clues:
          unit.clues,

        name:
          unit.name,
      },

      coordinator: {
        id:
          unit.coordinator_id,

        name:
          unit.coordinator_name,
      },

      previousSupervisor:
        currentAssignment
          ? {
              id:
                currentAssignment
                  .supervisor_id,

              name:
                currentAssignment
                  .supervisor_name,
            }
          : null,

      supervisor: {
        id:
          targetSupervisor.id,

        name:
          targetSupervisor.name,
      },

      assignment:
        mapAssignment(
          newAssignment,
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
      PharmacyAssignmentManagementError
    ) {
      throw error
    }

    console.error(
      '[pharmacyAssignmentManagement.service][assign]',
      error,
    )

    throw new PharmacyAssignmentManagementError(
      'No fue posible actualizar la asignación de la unidad',
      {
        status:
          500,

        code:
          'PHARMACY_SUPERVISOR_ASSIGN_FAILED',
      },
    )
  } finally {
    client.release()
  }
}

// ============================================================
// DEJAR SIN SUPERVISOR
// ============================================================

export async function revokePharmacySupervisor({
  pharmacyId,
  comment,
  actor,
}) {
  validatePharmacyId(
    pharmacyId,
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

    await lockAssignmentKey(
      client,
      pharmacyId,
    )

    const unit =
      await loadUnitForUpdate(
        client,
        pharmacyId,
      )

    await validateAssignableUnit({
      client,
      unit,
      actor,
    })

    const activeAssignments =
      await loadActiveAssignments(
        client,
        pharmacyId,
      )

    if (
      activeAssignments.length >
      1
    ) {
      throw new PharmacyAssignmentManagementError(
        'La unidad tiene más de una asignación activa y requiere revisión técnica',
        {
          status:
            409,

          code:
            'MULTIPLE_ACTIVE_SUPERVISOR_ASSIGNMENTS',
        },
      )
    }

    const currentAssignment =
      activeAssignments[0] ??
      null

    if (!currentAssignment) {
      throw new PharmacyAssignmentManagementError(
        'La unidad ya se encuentra sin supervisor',
        {
          status:
            409,

          code:
            'PHARMACY_ALREADY_UNASSIGNED',
        },
      )
    }

    const blockingPlan =
      await findBlockingPlanItem(
        client,
        pharmacyId,
      )

    if (blockingPlan) {
      throwBlockingPlanError(
        blockingPlan,
        'La unidad tiene una actividad vigente y no puede dejarse vacante todavía',
      )
    }

    const updateResult =
      await client.query(
        `
        UPDATE public.pharmacy_supervisor_assignment

        SET
          revoked_by =
            $2,

          revoked_at =
            NOW(),

          revocation_reason =
            $3,

          updated_at =
            NOW()

        WHERE id =
          $1

        RETURNING *
        `,
        [
          currentAssignment.id,
          actor.id,
          normalizedComment,
        ],
      )

    const revokedAssignment =
      updateResult.rows[0]

    await appendAssignmentEvent(
      client,
      {
        assignmentId:
          currentAssignment.id,

        coordinatorAssignmentId:
          unit.coordinator_assignment_id,

        pharmacyId:
          unit.id,

        supervisorId:
          currentAssignment.supervisor_id,

        coordinatorId:
          unit.coordinator_id,

        eventType:
          'PHARMACY_ASSIGNMENT_REVOKED',

        actorId:
          actor.id,

        comment:
          normalizedComment,

        beforeData:
          mapAssignment(
            currentAssignment,
          ),

        afterData:
          mapAssignment(
            revokedAssignment,
          ),

        metadata: {
          channel:
            actor.channel ??
            'WEB',

          action:
            'REVOKE',

          pharmacyName:
            unit.name,

          clues:
            unit.clues,

          previousSupervisorId:
            currentAssignment
              .supervisor_id,

          previousSupervisorName:
            currentAssignment
              .supervisor_name,

          coordinatorId:
            unit.coordinator_id,

          coordinatorName:
            unit.coordinator_name,
        },
      },
    )

    await client.query(
      'COMMIT',
    )

    return {
      ok:
        true,

      action:
        'REVOKED',

      pharmacy: {
        id:
          String(
            unit.id,
          ),

        clues:
          unit.clues,

        name:
          unit.name,
      },

      coordinator: {
        id:
          unit.coordinator_id,

        name:
          unit.coordinator_name,
      },

      previousSupervisor: {
        id:
          currentAssignment
            .supervisor_id,

        name:
          currentAssignment
            .supervisor_name,
      },

      supervisor:
        null,

      assignment:
        mapAssignment(
          revokedAssignment,
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
      PharmacyAssignmentManagementError
    ) {
      throw error
    }

    console.error(
      '[pharmacyAssignmentManagement.service][revoke]',
      error,
    )

    throw new PharmacyAssignmentManagementError(
      'No fue posible dejar la unidad sin supervisor',
      {
        status:
          500,

        code:
          'PHARMACY_SUPERVISOR_REVOKE_FAILED',
      },
    )
  } finally {
    client.release()
  }
}

// ============================================================
// CARGA Y BLOQUEOS
// ============================================================

async function lockAssignmentKey(
  client,
  pharmacyId,
) {
  await client.query(
    `
    SELECT pg_advisory_xact_lock(
      hashtextextended(
        $1::text,
        0
      )
    )
    `,
    [
      `pharmacy-supervisor:${pharmacyId}`,
    ],
  )
}

async function loadUnitForUpdate(
  client,
  pharmacyId,
) {
  const result =
    await client.query(
      `
      SELECT
        farmacia.id,

        farmacia.clues,

        COALESCE(
          NULLIF(
            BTRIM(
              farmacia.unidad
            ),
            ''
          ),

          farmacia.clues,

          'Unidad sin nombre'
        ) AS name,

        farmacia.estado,

        farmacia.estatus::text
          AS status,

        territory.id
          AS coordinator_assignment_id,

        territory.coordinator_id,

        coordinator.nombre
          AS coordinator_name,

        coordinator.area::text
          AS coordinator_area,

        coordinator.rol::text
          AS coordinator_role,

        coordinator.activo
          AS coordinator_active,

        coordinator.superior_id
          AS coordinator_manager_id

      FROM public.farmacia
        farmacia

      LEFT JOIN public.pharmacy_coordinator_assignment
        territory

        ON territory.pharmacy_id =
          farmacia.id

        AND territory.revoked_at
          IS NULL

      LEFT JOIN public.personas
        coordinator

        ON coordinator.id =
          territory.coordinator_id

      WHERE farmacia.id =
          $1

      FOR UPDATE OF farmacia
      `,
      [
        pharmacyId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

async function loadTargetSupervisor(
  client,
  supervisorId,
  state,
) {
  const result =
    await client.query(
      `
      SELECT
        supervisor.id,

        supervisor.nombre
          AS name,

        supervisor.area::text
          AS area,

        supervisor.rol::text
          AS role,

        supervisor.activo
          AS active,

        supervisor.superior_id,

        supervisor.pharmacy_scope_mode,

        EXISTS (
          SELECT 1

          FROM public.person_state_scope
            state_scope

          WHERE state_scope.persona_id =
              supervisor.id

            AND state_scope.revoked_at
              IS NULL

            AND UPPER(
              BTRIM(
                state_scope.estado
              )
            ) =
            UPPER(
              BTRIM(
                $2::text
              )
            )
        ) AS has_state_scope

      FROM public.personas
        supervisor

      WHERE supervisor.id =
          $1

      LIMIT 1
      `,
      [
        supervisorId,
        state,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

async function loadActiveAssignments(
  client,
  pharmacyId,
) {
  const result =
    await client.query(
      `
      SELECT
        assignment.*,

        supervisor.nombre
          AS supervisor_name

      FROM public.pharmacy_supervisor_assignment
        assignment

      INNER JOIN public.personas
        supervisor

        ON supervisor.id =
          assignment.supervisor_id

      WHERE assignment.pharmacy_id =
          $1

        AND assignment.revoked_at
          IS NULL

      ORDER BY
        assignment.assigned_at DESC

      FOR UPDATE OF assignment
      `,
      [
        pharmacyId,
      ],
    )

  return result.rows
}

async function findBlockingPlanItem(
  client,
  pharmacyId,
) {
  const result =
    await client.query(
      `
      SELECT
        item.id
          AS item_id,

        item.status
          AS item_status,

        item.scheduled_date,

        plan.id
          AS plan_id,

        plan.status
          AS plan_status,

        plan.plan_type,

        plan.period_start,

        plan.period_end,

        plan.supervisor_id
          AS plan_supervisor_id,

        supervisor.nombre
          AS plan_supervisor_name

      FROM public.work_plan_item
        item

      INNER JOIN public.work_plan
        plan

        ON plan.id =
          item.plan_id

      INNER JOIN public.personas
        supervisor

        ON supervisor.id =
          plan.supervisor_id

      WHERE item.pharmacy_id =
          $1

        AND item.removed_at
          IS NULL

        AND plan.archived_at
          IS NULL

        AND (
          (
            plan.status IN (
              'DRAFT',
              'PENDING_APPROVAL',
              'REJECTED'
            )

            AND plan.period_end >=
              CURRENT_DATE
          )

          OR (
            plan.status =
              'APPROVED'

            AND item.status IN (
              'PENDING',
              'IN_PROGRESS'
            )

            AND item.scheduled_date >=
              CURRENT_DATE
          )
        )

      ORDER BY
        item.scheduled_date ASC
          NULLS LAST,

        plan.updated_at DESC

      LIMIT 1
      `,
      [
        pharmacyId,
      ],
    )

  return (
    result.rows[0] ??
    null
  )
}

// ============================================================
// EVENTO
// ============================================================

async function appendAssignmentEvent(
  client,
  {
    assignmentId,
    coordinatorAssignmentId,
    pharmacyId,
    supervisorId,
    coordinatorId,
    eventType,
    actorId,
    comment,
    beforeData,
    afterData,
    metadata,
  },
) {
  await client.query(
    `
    INSERT INTO public.pharmacy_assignment_event (
      assignment_id,
      coordinator_assignment_id,
      pharmacy_id,
      supervisor_id,
      coordinator_id,
      event_type,
      actor_id,
      comment,
      before_data,
      after_data,
      metadata
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9::jsonb,
      $10::jsonb,
      $11::jsonb
    )
    `,
    [
      assignmentId,
      coordinatorAssignmentId,
      pharmacyId,
      supervisorId,
      coordinatorId,
      eventType,
      actorId,
      comment,

      beforeData
        ? JSON.stringify(
            beforeData,
          )
        : null,

      afterData
        ? JSON.stringify(
            afterData,
          )
        : null,

      JSON.stringify(
        metadata ??
        {},
      ),
    ],
  )
}

// ============================================================
// VALIDACIONES
// ============================================================

async function validateAssignableUnit({
  client,
  unit,
  actor,
}) {
  if (!unit) {
    throw new PharmacyAssignmentManagementError(
      'La unidad no existe',
      {
        status:
          404,

        code:
          'PHARMACY_NOT_FOUND',
      },
    )
  }

  if (
    String(
      unit.status ??
      '',
    )
      .trim()
      .toUpperCase() ===
    'INACTIVA'
  ) {
    throw new PharmacyAssignmentManagementError(
      'No puede modificarse el supervisor de una unidad inactiva',
      {
        status:
          409,

        code:
          'PHARMACY_INACTIVE',
      },
    )
  }

  if (
    !unit.coordinator_assignment_id ||
    !unit.coordinator_id
  ) {
    throw new PharmacyAssignmentManagementError(
      'La unidad no tiene un territorio de coordinación activo',
      {
        status:
          409,

        code:
          'PHARMACY_WITHOUT_COORDINATOR_TERRITORY',
      },
    )
  }

  if (
    unit.coordinator_area !==
      'FARMACIAS' ||
    unit.coordinator_role !==
      'COORDINADOR' ||
    !unit.coordinator_active
  ) {
    throw new PharmacyAssignmentManagementError(
      'El territorio de la unidad no tiene un coordinador activo válido',
      {
        status:
          409,

        code:
          'INVALID_COORDINATOR_TERRITORY',
      },
    )
  }

  if (
    unit.coordinator_manager_id !==
    actor.id
  ) {
    throw new PharmacyAssignmentManagementError(
      'La unidad no pertenece a la estructura del gerente',
      {
        status:
          403,

        code:
          'PHARMACY_OUTSIDE_MANAGER_STRUCTURE',
      },
    )
  }

  if (!unit.estado) {
    throw new PharmacyAssignmentManagementError(
      'La unidad no tiene un estado válido',
      {
        status:
          409,

        code:
          'PHARMACY_WITHOUT_STATE',
      },
    )
  }

  const scopeResult =
    await client.query(
      `
      SELECT 1

      FROM public.person_state_scope

      WHERE persona_id =
          $1

        AND revoked_at
          IS NULL

        AND UPPER(
          BTRIM(
            estado
          )
        ) =
        UPPER(
          BTRIM(
            $2::text
          )
        )

      LIMIT 1
      `,
      [
        actor.id,
        unit.estado,
      ],
    )

  if (
    scopeResult.rowCount ===
    0
  ) {
    throw new PharmacyAssignmentManagementError(
      'El gerente no tiene ámbito activo en el estado de la unidad',
      {
        status:
          403,

        code:
          'MANAGER_STATE_SCOPE_NOT_ALLOWED',
      },
    )
  }

  unit.state =
    unit.estado
}

function validateTargetSupervisor({
  supervisor,
  unit,
}) {
  if (!supervisor) {
    throw new PharmacyAssignmentManagementError(
      'El supervisor seleccionado no existe',
      {
        status:
          404,

        code:
          'SUPERVISOR_NOT_FOUND',
      },
    )
  }

  if (!supervisor.active) {
    throw new PharmacyAssignmentManagementError(
      'El supervisor seleccionado se encuentra inactivo',
      {
        status:
          409,

        code:
          'SUPERVISOR_INACTIVE',
      },
    )
  }

  if (
    String(
      supervisor.area,
    ).toUpperCase() !==
      'FARMACIAS' ||
    String(
      supervisor.role,
    ).toUpperCase() !==
      'SUPERVISOR'
  ) {
    throw new PharmacyAssignmentManagementError(
      'La persona seleccionada no es un supervisor de Farmacias',
      {
        status:
          409,

        code:
          'INVALID_SUPERVISOR_PROFILE',
      },
    )
  }

  if (
    supervisor.superior_id !==
    unit.coordinator_id
  ) {
    throw new PharmacyAssignmentManagementError(
      'El supervisor seleccionado no pertenece al coordinador territorial de la unidad',
      {
        status:
          409,

        code:
          'SUPERVISOR_OUTSIDE_COORDINATOR_TERRITORY',
      },
    )
  }

  if (
    !supervisor.has_state_scope
  ) {
    throw new PharmacyAssignmentManagementError(
      'El supervisor seleccionado no tiene ámbito activo en el estado de la unidad',
      {
        status:
          409,

        code:
          'SUPERVISOR_STATE_SCOPE_NOT_ALLOWED',
      },
    )
  }

  if (
    String(
      supervisor.pharmacy_scope_mode ??
      '',
    ).toUpperCase() !==
    'ASSIGNED_ONLY'
  ) {
    throw new PharmacyAssignmentManagementError(
      'El supervisor debe utilizar un ámbito restringido a unidades asignadas',
      {
        status:
          409,

        code:
          'SUPERVISOR_SCOPE_MODE_NOT_RESTRICTED',
      },
    )
  }
}

function throwBlockingPlanError(
  blockingPlan,
  message,
) {
  throw new PharmacyAssignmentManagementError(
    message,
    {
      status:
        409,

      code:
        'PHARMACY_HAS_ACTIVE_PLAN_ITEM',

      details: {
        planId:
          blockingPlan.plan_id,

        planType:
          blockingPlan.plan_type,

        planStatus:
          blockingPlan.plan_status,

        periodStart:
          normalizeDateValue(
            blockingPlan.period_start,
          ),

        periodEnd:
          normalizeDateValue(
            blockingPlan.period_end,
          ),

        itemId:
          blockingPlan.item_id,

        itemStatus:
          blockingPlan.item_status,

        scheduledDate:
          normalizeDateValue(
            blockingPlan.scheduled_date,
          ),

        supervisorId:
          blockingPlan.plan_supervisor_id,

        supervisorName:
          blockingPlan.plan_supervisor_name,
      },
    },
  )
}

function validatePharmacyId(
  value,
) {
  if (
    !BIGINT_PATTERN.test(
      String(
        value ??
        '',
      ),
    )
  ) {
    throw new PharmacyAssignmentManagementError(
      'El identificador de la unidad no es válido',
      {
        status:
          400,

        code:
          'INVALID_PHARMACY_ID',
      },
    )
  }
}

function validateSupervisorId(
  value,
) {
  if (
    !UUID_PATTERN.test(
      String(
        value ??
        '',
      ),
    )
  ) {
    throw new PharmacyAssignmentManagementError(
      'El identificador del supervisor no es válido',
      {
        status:
          400,

        code:
          'INVALID_SUPERVISOR_ID',
      },
    )
  }
}

function validateManagerActor(
  actor,
) {
  if (!actor?.id) {
    throw new PharmacyAssignmentManagementError(
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
    throw new PharmacyAssignmentManagementError(
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
    throw new PharmacyAssignmentManagementError(
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

  if (
    normalized.length <
    5
  ) {
    throw new PharmacyAssignmentManagementError(
      'Debes indicar un motivo de al menos 5 caracteres',
      {
        status:
          400,

        code:
          'ASSIGNMENT_COMMENT_REQUIRED',
      },
    )
  }

  if (
    normalized.length >
    1000
  ) {
    throw new PharmacyAssignmentManagementError(
      'El motivo no puede superar 1000 caracteres',
      {
        status:
          400,

        code:
          'ASSIGNMENT_COMMENT_TOO_LONG',
      },
    )
  }

  return normalized
}

// ============================================================
// MAPEO
// ============================================================

function mapAssignment(
  row,
) {
  return {
    id:
      row.id,

    pharmacyId:
      String(
        row.pharmacy_id,
      ),

    supervisorId:
      row.supervisor_id,

    assignedBy:
      row.assigned_by,

    assignedAt:
      row.assigned_at,

    assignmentComment:
      row.assignment_comment,

    revokedBy:
      row.revoked_by,

    revokedAt:
      row.revoked_at,

    revocationReason:
      row.revocation_reason,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

function normalizeDateValue(
  value,
) {
  if (!value) {
    return null
  }

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
    value,
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
      '[pharmacyAssignmentManagement.service][rollback]',
      rollbackError,
    )
  }
}