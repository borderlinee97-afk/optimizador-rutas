import {
  Router,
} from 'express'

import {
  pool,
} from '../db/pool.js'

import {
  requireAuth,
} from '../middleware/requireAuth.js'

import {
  approveCancellationRequest,
  rejectCancellationRequest,
} from '../services/workPlanCancellationApproval.service.js'

const router =
  Router()

const ALLOWED_ROLES =
  new Set([
    'GERENTE',
    'COORDINADOR',
  ])

router.use(
  requireAuth,
)

router.use(
  loadFarmaciasProfile,
)

router.use(
  requireApprovalRole,
)

/**
 * ============================================================
 * GET /api/web/approvals
 *
 * GERENTE:
 * - bandeja de decisión;
 * - planes pendientes;
 * - cancelaciones pendientes;
 * - coberturas pendientes.
 *
 * COORDINADOR:
 * - seguimiento de solicitudes de su equipo;
 * - seguimiento de coberturas de su territorio;
 * - sin capacidad de resolver.
 * ============================================================
 */

router.get(
  '/',
  async (
    req,
    res,
  ) => {
    try {
      const [
        plansResult,
        cancellationsResult,
        coveragesResult,
      ] =
        await Promise.all([
          getPendingPlans(
            req.profile,
          ),

          getPendingCancellations(
            req.profile,
          ),

          getPendingCoverages(
            req.profile,
          ),
        ])

      const plans =
        plansResult.rows.map(
          mapPendingPlan,
        )

      const cancellationRequests =
        cancellationsResult.rows.map(
          mapCancellationRequest,
        )

      const coverageRequests =
        coveragesResult.rows.map(
          mapCoverageRequest,
        )

      const ordinaryPlans =
        plans.filter(
          plan =>
            plan.planType ===
            'ORDINARY',
        )

      const extraordinaryPlans =
        plans.filter(
          plan =>
            plan.planType ===
            'EXTRAORDINARY',
        )

      const counts = {
        ordinaryPlans:
          ordinaryPlans.length,

        extraordinaryPlans:
          extraordinaryPlans.length,

        cancellationRequests:
          cancellationRequests.length,

        coverages:
          coverageRequests.length,

        total:
          plans.length +
          cancellationRequests.length +
          coverageRequests.length,
      }

      return res.json({
        context: {
          area:
            'FARMACIAS',

          role:
            req.profile.rol,

          canDecide:
            req.profile.rol ===
            'GERENTE',
        },

        counts,

        pendingCount:
          counts.total,

        plans,

        ordinaryPlans,

        extraordinaryPlans,

        cancellationRequests,

        coverageRequests,
      })
    } catch (
      error
    ) {
      console.error(
        '[web.approvals][GET]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener el centro de aprobaciones',

          code:
            'WEB_APPROVALS_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * APROBAR CANCELACIÓN
 * Solo GERENTE.
 * ============================================================
 */

router.post(
  '/cancellation-requests/:itemId/approve',
  requireManager,
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await approveCancellationRequest({
          itemId:
            req.params.itemId,

          actor: {
            ...req.profile,

            channel:
              'WEB',
          },
        })

      return res.json(
        result,
      )
    } catch (
      error
    ) {
      return sendActionError(
        res,
        error,
        'CANCELLATION_REQUEST_APPROVE_FAILED',
      )
    }
  },
)

/**
 * ============================================================
 * RECHAZAR CANCELACIÓN
 * Solo GERENTE.
 * ============================================================
 */

router.post(
  '/cancellation-requests/:itemId/reject',
  requireManager,
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await rejectCancellationRequest({
          itemId:
            req.params.itemId,

          comment:
            req.body?.comment,

          actor: {
            ...req.profile,

            channel:
              'WEB',
          },
        })

      return res.json(
        result,
      )
    } catch (
      error
    ) {
      return sendActionError(
        res,
        error,
        'CANCELLATION_REQUEST_REJECT_FAILED',
      )
    }
  },
)

/**
 * ============================================================
 * PLANES PENDIENTES
 * ============================================================
 */

function getPendingPlans(
  profile,
) {
  return pool.query(
    `
    SELECT
      wp.id,

      wp.supervisor_id,
      wp.status,
      wp.plan_type,

      wp.period_start,
      wp.period_end,

      wp.revision_number,

      wp.created_at,
      wp.updated_at,

      wp.submitted_at,

      supervisor.nombre
        AS supervisor_name,

      coordinator.id
        AS coordinator_id,

      coordinator.nombre
        AS coordinator_name,

      COUNT(wpi.id)
        FILTER (
          WHERE wpi.removed_at
            IS NULL
        ) AS total_items,

      COUNT(wpi.id)
        FILTER (
          WHERE wpi.removed_at
            IS NULL

          AND wpi.status::text =
            'PENDING'
        ) AS pending_items,

      COUNT(wpi.id)
        FILTER (
          WHERE wpi.removed_at
            IS NULL

          AND wpi.status::text =
            'IN_PROGRESS'
        ) AS in_progress_items,

      COUNT(wpi.id)
        FILTER (
          WHERE wpi.removed_at
            IS NULL

          AND wpi.status::text =
            'DONE'
        ) AS done_items

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

    LEFT JOIN public.work_plan_item
      wpi

      ON wpi.plan_id =
        wp.id

    WHERE wp.status::text =
        'PENDING_APPROVAL'

      AND wp.archived_at
        IS NULL

      AND supervisor.area::text =
        'FARMACIAS'

      AND supervisor.rol::text =
        'SUPERVISOR'

      AND supervisor.activo =
        TRUE

      AND (
        (
          $1::text =
            'GERENTE'

          AND (
            supervisor.superior_id =
              $2::uuid

            OR coordinator.superior_id =
              $2::uuid
          )
        )

        OR (
          $1::text =
            'COORDINADOR'

          AND supervisor.superior_id =
            $2::uuid
        )
      )

    GROUP BY
      wp.id,
      supervisor.nombre,
      coordinator.id,
      coordinator.nombre

    ORDER BY
      wp.submitted_at ASC
        NULLS LAST,

      supervisor.nombre ASC
    `,
    [
      profile.rol,
      profile.id,
    ],
  )
}

/**
 * ============================================================
 * CANCELACIONES PENDIENTES
 * ============================================================
 */

function getPendingCancellations(
  profile,
) {
  return pool.query(
    `
    SELECT
      wpi.id
        AS item_id,

      wpi.plan_id,
      wpi.pharmacy_id,

      wpi.scheduled_date,
      wpi.scheduled_time::text,

      wpi.required,
      wpi.status,

      wpi.cancellation_request_status,
      wpi.cancellation_request_reason,
      wpi.cancellation_request_notes,

      wpi.cancellation_requested_at,
      wpi.cancellation_requested_by,

      wp.plan_type,
      wp.period_start,
      wp.period_end,

      wp.revision_number,

      supervisor.id
        AS supervisor_id,

      supervisor.nombre
        AS supervisor_name,

      coordinator.id
        AS coordinator_id,

      coordinator.nombre
        AS coordinator_name,

      f.clues,

      COALESCE(
        NULLIF(
          TRIM(
            f.unidad
          ),
          ''
        ),

        f.clues,

        'Farmacia sin nombre'
      ) AS name,

      f.direccion
        AS address,

      f.region_sanitaria,
      f.proyecto,
      f.estado

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

    LEFT JOIN public.farmacia
      f

      ON f.id =
        wpi.pharmacy_id

    WHERE
      wpi.cancellation_request_status::text =
        'PENDING'

      AND wpi.status::text =
        'PENDING'

      AND wpi.item_type::text =
        'PHARMACY'

      AND wpi.source::text =
        'PLAN'

      AND wpi.removed_at
        IS NULL

      AND wp.status::text =
        'APPROVED'

      AND wp.archived_at
        IS NULL

      AND supervisor.area::text =
        'FARMACIAS'

      AND supervisor.rol::text =
        'SUPERVISOR'

      AND supervisor.activo =
        TRUE

      AND (
        (
          $1::text =
            'GERENTE'

          AND (
            supervisor.superior_id =
              $2::uuid

            OR coordinator.superior_id =
              $2::uuid
          )
        )

        OR (
          $1::text =
            'COORDINADOR'

          AND supervisor.superior_id =
            $2::uuid
        )
      )

    ORDER BY
      wpi.cancellation_requested_at ASC,

      supervisor.nombre ASC,

      wpi.scheduled_date ASC,

      wpi.scheduled_time ASC
        NULLS LAST
    `,
    [
      profile.rol,
      profile.id,
    ],
  )
}

/**
 * ============================================================
 * COBERTURAS PENDIENTES
 * ============================================================
 */

function getPendingCoverages(
  profile,
) {
  return pool.query(
    `
    SELECT
      coverage.id,

      coverage.pharmacy_id,
      coverage.coordinator_id,

      coverage.titular_supervisor_id,
      coverage.covering_supervisor_id,

      coverage.start_date,
      coverage.end_date,

      coverage.status,
      coverage.request_source,

      coverage.requested_by,
      coverage.requested_at,
      coverage.request_comment,

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
      ) AS pharmacy_name,

      farmacia.direccion
        AS address,

      farmacia.region_sanitaria,
      farmacia.proyecto,
      farmacia.estado,

      coordinator.nombre
        AS coordinator_name,

      coordinator.superior_id
        AS coordinator_manager_id,

      titular.nombre
        AS titular_supervisor_name,

      covering.nombre
        AS covering_supervisor_name,

      requester.nombre
        AS requested_by_name

    FROM public.pharmacy_supervisor_coverage
      coverage

    INNER JOIN public.farmacia
      farmacia

      ON farmacia.id =
        coverage.pharmacy_id

    INNER JOIN public.personas
      coordinator

      ON coordinator.id =
        coverage.coordinator_id

      AND coordinator.area::text =
        'FARMACIAS'

      AND coordinator.rol::text =
        'COORDINADOR'

      AND coordinator.activo =
        TRUE

    LEFT JOIN public.personas
      titular

      ON titular.id =
        coverage.titular_supervisor_id

    INNER JOIN public.personas
      covering

      ON covering.id =
        coverage.covering_supervisor_id

      AND covering.area::text =
        'FARMACIAS'

      AND covering.rol::text =
        'SUPERVISOR'

      AND covering.activo =
        TRUE

    INNER JOIN public.personas
      requester

      ON requester.id =
        coverage.requested_by

    WHERE coverage.status =
        'PENDING_APPROVAL'

      AND coverage.cancelled_at
        IS NULL

      AND EXISTS (
        SELECT 1

        FROM public.person_state_scope
          actor_scope

        WHERE actor_scope.persona_id =
            $2::uuid

          AND actor_scope.revoked_at
            IS NULL

          AND UPPER(
            BTRIM(
              actor_scope.estado
            )
          ) =
          UPPER(
            BTRIM(
              farmacia.estado
            )
          )
      )

      AND (
        (
          $1::text =
            'GERENTE'

          AND coordinator.superior_id =
            $2::uuid
        )

        OR (
          $1::text =
            'COORDINADOR'

          AND coverage.coordinator_id =
            $2::uuid
        )
      )

    ORDER BY
      coverage.requested_at ASC,

      farmacia.unidad ASC,

      covering.nombre ASC
    `,
    [
      profile.rol,
      profile.id,
    ],
  )
}

/**
 * ============================================================
 * PERFIL
 * ============================================================
 */

async function loadFarmaciasProfile(
  req,
  res,
  next,
) {
  try {
    const result =
      await pool.query(
        `
        SELECT
          id,
          nombre,
          area,
          rol,
          activo,
          superior_id

        FROM public.personas

        WHERE auth_user_id =
          $1

        LIMIT 1
        `,
        [
          req.auth.user.id,
        ],
      )

    if (
      result.rowCount ===
      0
    ) {
      return res
        .status(403)
        .json({
          error:
            'La cuenta no tiene un perfil operativo vinculado',

          code:
            'PROFILE_NOT_FOUND',
        })
    }

    const profile =
      result.rows[0]

    if (!profile.activo) {
      return res
        .status(403)
        .json({
          error:
            'El perfil operativo se encuentra inactivo',

          code:
            'PROFILE_INACTIVE',
        })
    }

    if (
      String(
        profile.area,
      )
        .trim()
        .toUpperCase() !==
      'FARMACIAS'
    ) {
      return res
        .status(403)
        .json({
          error:
            'Esta función está disponible únicamente para Farmacias',

          code:
            'AREA_NOT_ALLOWED',
        })
    }

    req.profile = {
      ...profile,

      area:
        String(
          profile.area,
        )
          .trim()
          .toUpperCase(),

      rol:
        String(
          profile.rol,
        )
          .trim()
          .toUpperCase(),
    }

    return next()
  } catch (
    error
  ) {
    console.error(
      '[web.approvals][profile]',
      error,
    )

    return res
      .status(500)
      .json({
        error:
          'No fue posible validar el perfil operativo',

        code:
          'PROFILE_VALIDATION_FAILED',
      })
  }
}

function requireApprovalRole(
  req,
  res,
  next,
) {
  if (
    !ALLOWED_ROLES.has(
      req.profile?.rol,
    )
  ) {
    return res
      .status(403)
      .json({
        error:
          'El perfil no tiene acceso al centro de aprobaciones',

        code:
          'APPROVAL_CENTER_ROLE_NOT_ALLOWED',
      })
  }

  return next()
}

function requireManager(
  req,
  res,
  next,
) {
  if (
    req.profile?.rol !==
    'GERENTE'
  ) {
    return res
      .status(403)
      .json({
        error:
          'Esta operación está disponible únicamente para gerentes',

        code:
          'MANAGER_ROLE_REQUIRED',
      })
  }

  return next()
}

/**
 * ============================================================
 * MAPEO
 * ============================================================
 */

function mapPendingPlan(
  row,
) {
  return {
    id:
      row.id,

    planId:
      row.id,

    supervisorId:
      row.supervisor_id,

    supervisorName:
      row.supervisor_name,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

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

    totalItems:
      Number(
        row.total_items ??
        0,
      ),

    pendingItems:
      Number(
        row.pending_items ??
        0,
      ),

    inProgressItems:
      Number(
        row.in_progress_items ??
        0,
      ),

    doneItems:
      Number(
        row.done_items ??
        0,
      ),

    submittedAt:
      row.submitted_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

function mapCancellationRequest(
  row,
) {
  return {
    itemId:
      row.item_id,

    planId:
      row.plan_id,

    supervisorId:
      row.supervisor_id,

    supervisorName:
      row.supervisor_name,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

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

    pharmacyId:
      row.pharmacy_id ===
        null
        ? null
        : String(
            row.pharmacy_id,
          ),

    name:
      row.name,

    address:
      row.address,

    clues:
      row.clues,

    region:
      row.region_sanitaria,

    project:
      row.proyecto,

    state:
      row.estado,

    scheduledDate:
      normalizeDateValue(
        row.scheduled_date,
      ),

    scheduledTime:
      row.scheduled_time,

    required:
      Boolean(
        row.required,
      ),

    requestReason:
      row.cancellation_request_reason,

    requestNotes:
      row.cancellation_request_notes,

    requestedAt:
      row.cancellation_requested_at,
  }
}

function mapCoverageRequest(
  row,
) {
  return {
    id:
      row.id,

    coverageId:
      row.id,

    pharmacyId:
      String(
        row.pharmacy_id,
      ),

    clues:
      row.clues,

    pharmacyName:
      row.pharmacy_name,

    address:
      row.address,

    region:
      row.region_sanitaria,

    project:
      row.proyecto,

    state:
      row.estado,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

    titularSupervisorId:
      row.titular_supervisor_id,

    titularSupervisorName:
      row.titular_supervisor_name,

    coveringSupervisorId:
      row.covering_supervisor_id,

    coveringSupervisorName:
      row.covering_supervisor_name,

    startDate:
      normalizeDateValue(
        row.start_date,
      ),

    endDate:
      normalizeDateValue(
        row.end_date,
      ),

    status:
      row.status,

    requestSource:
      row.request_source,

    requestedBy:
      row.requested_by,

    requestedByName:
      row.requested_by_name,

    requestedAt:
      row.requested_at,

    requestComment:
      row.request_comment,
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

function sendActionError(
  res,
  error,
  fallbackCode,
) {
  console.error(
    '[web.approvals][action]',
    error,
  )

  return res
    .status(
      error?.status ||
      500,
    )
    .json({
      error:
        error?.message ||
        'No fue posible procesar la solicitud',

      code:
        error?.code ||
        fallbackCode,

      details:
        error?.details ||
        null,
    })
}

export default router