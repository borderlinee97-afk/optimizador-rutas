import {
  Router,
} from 'express'

import {
  pool,
} from '../db/pool.js'

import {
  requireAuth,
} from '../middleware/requireAuth.js'

const router =
  Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/

const ALLOWED_ROLES =
  new Set([
    'GERENTE',
    'COORDINADOR',
    'SUPERVISOR',
  ])

router.use(
  requireAuth,
)

router.use(
  loadFarmaciasProfile,
)

router.use(
  requireSupportedRole,
)

/**
 * ============================================================
 * GET /api/web/work-plans
 *
 * Vista semanal de planes.
 *
 * Query:
 * state=Jalisco
 * periodStart=2026-07-27
 * periodEnd=2026-08-02
 *
 * GERENTE:
 * - supervisores directos;
 * - supervisores bajo coordinadores.
 *
 * COORDINADOR:
 * - únicamente supervisores directos.
 *
 * SUPERVISOR:
 * - únicamente él mismo.
 *
 * IMPORTANTE:
 * La consulta parte de los supervisores autorizados
 * y hace LEFT JOIN al plan.
 *
 * Esto permite detectar NO_PLAN.
 * ============================================================
 */
router.get(
  '/',
  async (
    req,
    res,
  ) => {
    const state =
      normalizeOptionalText(
        req.query.state,
      )

    const periodStart =
      normalizeDateValue(
        req.query.periodStart,
      )

    const periodEnd =
      normalizeDateValue(
        req.query.periodEnd,
      )

    if (!state) {
      return res
        .status(400)
        .json({
          error:
            'Debes indicar el estado',

          code:
            'STATE_REQUIRED',
        })
    }

    if (
      state.length >
      100
    ) {
      return res
        .status(400)
        .json({
          error:
            'El estado indicado no es válido',

          code:
            'INVALID_STATE',
        })
    }

    if (
      !isValidIsoDate(
        periodStart,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'La fecha inicial no es válida',

          code:
            'INVALID_PERIOD_START',
        })
    }

    if (
      !isValidIsoDate(
        periodEnd,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'La fecha final no es válida',

          code:
            'INVALID_PERIOD_END',
        })
    }

    if (
      periodEnd <
      periodStart
    ) {
      return res
        .status(400)
        .json({
          error:
            'La fecha final no puede ser anterior a la fecha inicial',

          code:
            'INVALID_PLAN_PERIOD',
        })
    }

    const days =
      differenceInDays(
        periodStart,
        periodEnd,
      )

    if (
      days >
      31
    ) {
      return res
        .status(400)
        .json({
          error:
            'El periodo consultado es demasiado amplio',

          code:
            'PLAN_PERIOD_TOO_LARGE',
        })
    }

    try {
      const hasScope =
        await profileHasStateScope(
          req.profile.id,
          state,
        )

      if (!hasScope) {
        return res
          .status(403)
          .json({
            error:
              'El estado solicitado no pertenece a tu ámbito autorizado',

            code:
              'STATE_SCOPE_NOT_ALLOWED',
          })
      }

      const result =
        await pool.query(
          `
          WITH authorized_supervisors AS (
            SELECT
              supervisor.id
                AS supervisor_id,

              supervisor.nombre
                AS supervisor_name,

              coordinator.id
                AS coordinator_id,

              coordinator.nombre
                AS coordinator_name,

              state_scope.estado
                AS state_name

            FROM public.personas
              supervisor

            INNER JOIN public.person_state_scope
              state_scope

              ON state_scope.persona_id =
                supervisor.id

              AND state_scope.revoked_at
                IS NULL

              AND UPPER(
                TRIM(
                  state_scope.estado
                )
              ) =
              UPPER(
                TRIM(
                  $2::text
                )
              )

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

            WHERE
              supervisor.area::text =
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
                      $3::uuid

                    OR coordinator.superior_id =
                      $3::uuid
                  )
                )

                OR (
                  $1::text =
                    'COORDINADOR'

                  AND supervisor.superior_id =
                    $3::uuid
                )

                OR (
                  $1::text =
                    'SUPERVISOR'

                  AND supervisor.id =
                    $3::uuid
                )
              )
          )

          SELECT
            supervisor.supervisor_id,
            supervisor.supervisor_name,

            supervisor.coordinator_id,
            supervisor.coordinator_name,

            supervisor.state_name,

            plan.id
              AS plan_id,

            plan.status
              AS plan_status,

            plan.plan_type,

            plan.period_start,
            plan.period_end,

            plan.revision_number,

            plan.created_at,
            plan.updated_at,

            plan.submitted_at,
            plan.approved_at,
            plan.rejected_at,

            plan.rejection_comment,

            COALESCE(
              item_stats.total_items,
              0
            ) AS total_items,

            COALESCE(
              item_stats.pending_items,
              0
            ) AS pending_items,

            COALESCE(
              item_stats.in_progress_items,
              0
            ) AS in_progress_items,

            COALESCE(
              item_stats.done_items,
              0
            ) AS done_items,

            COALESCE(
              item_stats.skipped_items,
              0
            ) AS skipped_items,

            COALESCE(
              item_stats.cancelled_items,
              0
            ) AS cancelled_items,

            COALESCE(
              extraordinary.extraordinary_plans_count,
              0
            ) AS extraordinary_plans_count

          FROM authorized_supervisors
            supervisor

          LEFT JOIN LATERAL (
            SELECT
              wp.*

            FROM public.work_plan wp

            WHERE wp.supervisor_id =
                supervisor.supervisor_id

              AND wp.plan_type =
                'ORDINARY'

              AND wp.archived_at
                IS NULL

              AND wp.period_start =
                $4::date

              AND wp.period_end =
                $5::date

            ORDER BY
              wp.updated_at DESC,
              wp.created_at DESC

            LIMIT 1
          ) plan
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              COUNT(wpi.id)
                FILTER (
                  WHERE wpi.removed_at
                    IS NULL
                ) AS total_items,

              COUNT(wpi.id)
                FILTER (
                  WHERE wpi.removed_at
                    IS NULL

                  AND wpi.status =
                    'PENDING'
                ) AS pending_items,

              COUNT(wpi.id)
                FILTER (
                  WHERE wpi.removed_at
                    IS NULL

                  AND wpi.status =
                    'IN_PROGRESS'
                ) AS in_progress_items,

              COUNT(wpi.id)
                FILTER (
                  WHERE wpi.removed_at
                    IS NULL

                  AND wpi.status =
                    'DONE'
                ) AS done_items,

              COUNT(wpi.id)
                FILTER (
                  WHERE wpi.removed_at
                    IS NULL

                  AND wpi.status =
                    'SKIPPED'
                ) AS skipped_items,

              COUNT(wpi.id)
                FILTER (
                  WHERE wpi.removed_at
                    IS NULL

                  AND wpi.status =
                    'CANCELLED'
                ) AS cancelled_items

            FROM public.work_plan_item wpi

            WHERE wpi.plan_id =
              plan.id
          ) item_stats
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              COUNT(*)::integer
                AS extraordinary_plans_count

            FROM public.work_plan
              extraordinary_plan

            WHERE extraordinary_plan.supervisor_id =
                supervisor.supervisor_id

              AND extraordinary_plan.plan_type =
                'EXTRAORDINARY'

              AND extraordinary_plan.archived_at
                IS NULL

              AND extraordinary_plan.period_start <=
                $5::date

              AND extraordinary_plan.period_end >=
                $4::date
          ) extraordinary
            ON TRUE

          ORDER BY
            supervisor.coordinator_name ASC
              NULLS FIRST,

            supervisor.supervisor_name ASC
          `,
          [
            req.profile.rol,
            state,
            req.profile.id,
            periodStart,
            periodEnd,
          ],
        )

      const plans =
        result.rows.map(
          mapWeeklyPlanRow,
        )

      return res.json({
        context: {
          area:
            'FARMACIAS',

          role:
            req.profile.rol,

          state,

          periodStart,
          periodEnd,
        },

        totals:
          buildWeeklyTotals(
            plans,
          ),

        plans,
      })
    } catch (error) {
      console.error(
        '[web.work-plans][GET]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener los planes de trabajo',

          code:
            'WEB_WORK_PLANS_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * GET /api/web/work-plans/:planId
 *
 * Detalle completo de un plan autorizado.
 *
 * Actualmente es solo lectura.
 * ============================================================
 */
router.get(
  '/:planId',
  async (
    req,
    res,
  ) => {
    const planId =
      String(
        req.params.planId ??
        '',
      ).trim()

    if (
      !UUID_PATTERN.test(
        planId,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'El identificador del plan no es válido',

          code:
            'INVALID_WORK_PLAN_ID',
        })
    }

    try {
      const planResult =
        await pool.query(
          `
          SELECT
            wp.*,

            supervisor.nombre
              AS supervisor_name,

            coordinator.id
              AS coordinator_id,

            coordinator.nombre
              AS coordinator_name

          FROM public.work_plan wp

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

          WHERE wp.id =
              $1

            AND supervisor.area::text =
              'FARMACIAS'

            AND supervisor.rol::text =
              'SUPERVISOR'

            AND (
              (
                $2::text =
                  'GERENTE'

                AND (
                  supervisor.superior_id =
                    $3::uuid

                  OR coordinator.superior_id =
                    $3::uuid
                )
              )

              OR (
                $2::text =
                  'COORDINADOR'

                AND supervisor.superior_id =
                  $3::uuid
              )

              OR (
                $2::text =
                  'SUPERVISOR'

                AND supervisor.id =
                  $3::uuid
              )
            )

          LIMIT 1
          `,
          [
            planId,
            req.profile.rol,
            req.profile.id,
          ],
        )

      if (
        planResult.rowCount ===
        0
      ) {
        return res
          .status(404)
          .json({
            error:
              'El plan no existe o no pertenece a tu ámbito autorizado',

            code:
              'WEB_WORK_PLAN_NOT_FOUND',
          })
      }

      const row =
        planResult.rows[0]

      const [
        itemsResult,
        revisionsResult,
        eventsResult,
      ] =
        await Promise.all([
          pool.query(
            `
            SELECT
              wpi.id,
              wpi.plan_id,
              wpi.pharmacy_id,

              wpi.item_type,
              wpi.source,

              COALESCE(
                NULLIF(
                  TRIM(
                    wpi.custom_name
                  ),
                  ''
                ),

                NULLIF(
                  TRIM(
                    f.unidad
                  ),
                  ''
                ),

                f.clues,
                'Actividad sin nombre'
              ) AS name,

              COALESCE(
                NULLIF(
                  TRIM(
                    wpi.custom_address
                  ),
                  ''
                ),

                f.direccion
              ) AS address,

              f.clues,
              f.region_sanitaria,
              f.proyecto,
              f.estado,

              f.estatus::text
                AS pharmacy_status,

              COALESCE(
                wpi.custom_lat,
                f.latitud::double precision
              ) AS lat,

              COALESCE(
                wpi.custom_lng,
                f.longitud::double precision
              ) AS lng,

              wpi.google_place_id,
              wpi.activity_category,
              wpi.addition_reason,
              wpi.estimated_minutes,

              wpi.scheduled_date,
              wpi.scheduled_time::text,

              wpi.ord,
              wpi.required,
              wpi.status,

              wpi.cancellation_request_status,
              wpi.cancellation_request_reason,
              wpi.cancellation_request_notes,
              wpi.cancellation_requested_at,
              wpi.cancellation_requested_by,

              wpi.cancellation_reviewed_at,
              wpi.cancellation_reviewed_by,
              wpi.cancellation_review_comment,

              wpi.added_by,
              wpi.added_at,

              wpi.updated_by,
              wpi.updated_at,

              wpi.removed_by,
              wpi.removed_at,
              wpi.removal_reason

            FROM public.work_plan_item
              wpi

            LEFT JOIN public.farmacia
              f

              ON f.id =
                wpi.pharmacy_id

            WHERE wpi.plan_id =
                $1

              AND wpi.removed_at
                IS NULL

            ORDER BY
              wpi.scheduled_date ASC,

              wpi.ord ASC,

              wpi.scheduled_time ASC
                NULLS LAST
            `,
            [
              planId,
            ],
          ),

          pool.query(
            `
            SELECT
              id,
              plan_id,
              revision_number,
              status,

              submitted_by,
              submitted_at,

              reviewed_by,
              reviewed_at,

              review_comment,

              created_at,
              updated_at

            FROM public.work_plan_revision

            WHERE plan_id =
              $1

            ORDER BY
              revision_number DESC
            `,
            [
              planId,
            ],
          ),

          pool.query(
            `
            SELECT
              id,
              plan_id,

              entity_type,
              entity_id,

              revision_number,

              event_type,

              actor_id,
              actor_area,
              actor_role,

              previous_status,
              new_status,

              comment,

              before_data,
              after_data,
              metadata,

              created_at

            FROM public.work_plan_event

            WHERE plan_id =
              $1

            ORDER BY
              created_at DESC

            LIMIT 200
            `,
            [
              planId,
            ],
          ),
        ])

      return res.json({
        plan:
          mapPlan(
            row,
          ),

        supervisor: {
          id:
            row.supervisor_id,

          name:
            row.supervisor_name,

          coordinatorId:
            row.coordinator_id,

          coordinatorName:
            row.coordinator_name,
        },

        permissions: {
          canView:
            true,

          canEdit:
            req.profile.rol ===
              'SUPERVISOR' &&
            req.profile.id ===
              row.supervisor_id &&
            [
              'DRAFT',
              'REJECTED',
            ].includes(
              row.status,
            ),

          canApprove:
            req.profile.rol ===
              'GERENTE' &&
            row.status ===
              'PENDING_APPROVAL',

          canReject:
            req.profile.rol ===
              'GERENTE' &&
            row.status ===
              'PENDING_APPROVAL',
        },

        items:
          itemsResult.rows.map(
            mapPlanItem,
          ),

        revisions:
          revisionsResult.rows.map(
            mapRevision,
          ),

        events:
          eventsResult.rows.map(
            mapEvent,
          ),
      })
    } catch (error) {
      console.error(
        '[web.work-plans][detail]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener el detalle del plan',

          code:
            'WEB_WORK_PLAN_DETAIL_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * PERFIL Y AUTORIZACIÓN
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
          superior_id,
          pharmacy_scope_mode

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
      ).toUpperCase() !==
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
  } catch (error) {
    console.error(
      '[web.work-plans][profile]',
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

function requireSupportedRole(
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
          'El perfil no tiene acceso a los planes de Farmacias',

        code:
          'WORK_PLANS_ROLE_NOT_ALLOWED',
      })
  }

  return next()
}

async function profileHasStateScope(
  personId,
  state,
) {
  const result =
    await pool.query(
      `
      SELECT 1

      FROM public.person_state_scope

      WHERE persona_id =
          $1

        AND revoked_at
          IS NULL

        AND UPPER(
          TRIM(
            estado
          )
        ) =
        UPPER(
          TRIM(
            $2::text
          )
        )

      LIMIT 1
      `,
      [
        personId,
        state,
      ],
    )

  return (
    result.rowCount >
    0
  )
}

/**
 * ============================================================
 * MAPEOS
 * ============================================================
 */

function mapWeeklyPlanRow(
  row,
) {
  const hasPlan =
    Boolean(
      row.plan_id,
    )

  return {
    supervisorId:
      row.supervisor_id,

    supervisorName:
      row.supervisor_name,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

    state:
      row.state_name,

    hasPlan,

    planId:
      row.plan_id,

    status:
      hasPlan
        ? row.plan_status
        : 'NO_PLAN',

    planType:
      hasPlan
        ? row.plan_type
        : null,

    periodStart:
      hasPlan
        ? normalizeDateValue(
            row.period_start,
          )
        : null,

    periodEnd:
      hasPlan
        ? normalizeDateValue(
            row.period_end,
          )
        : null,

    revisionNumber:
      hasPlan
        ? Number(
            row.revision_number ??
            0,
          )
        : 0,

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

    skippedItems:
      Number(
        row.skipped_items ??
        0,
      ),

    cancelledItems:
      Number(
        row.cancelled_items ??
        0,
      ),

    extraordinaryPlansCount:
      Number(
        row.extraordinary_plans_count ??
        0,
      ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    submittedAt:
      row.submitted_at,

    approvedAt:
      row.approved_at,

    rejectedAt:
      row.rejected_at,

    rejectionComment:
      row.rejection_comment,
  }
}

function buildWeeklyTotals(
  plans,
) {
  const totals = {
    supervisorsCount:
      plans.length,

    plansCount:
      0,

    noPlanCount:
      0,

    draftCount:
      0,

    pendingApprovalCount:
      0,

    approvedCount:
      0,

    rejectedCount:
      0,

    otherCount:
      0,

    totalItems:
      0,

    extraordinaryPlansCount:
      0,
  }

  for (
    const plan
    of plans
  ) {
    totals.totalItems +=
      Number(
        plan.totalItems ??
        0,
      )

    totals.extraordinaryPlansCount +=
      Number(
        plan.extraordinaryPlansCount ??
        0,
      )

    if (
      plan.status ===
      'NO_PLAN'
    ) {
      totals.noPlanCount +=
        1

      continue
    }

    totals.plansCount +=
      1

    if (
      plan.status ===
      'DRAFT'
    ) {
      totals.draftCount +=
        1

      continue
    }

    if (
      plan.status ===
      'PENDING_APPROVAL'
    ) {
      totals.pendingApprovalCount +=
        1

      continue
    }

    if (
      plan.status ===
      'APPROVED'
    ) {
      totals.approvedCount +=
        1

      continue
    }

    if (
      plan.status ===
      'REJECTED'
    ) {
      totals.rejectedCount +=
        1

      continue
    }

    totals.otherCount +=
      1
  }

  return totals
}

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

function mapPlanItem(
  row,
) {
  return {
    id:
      row.id,

    planId:
      row.plan_id,

    pharmacyId:
      row.pharmacy_id ===
        null
        ? null
        : String(
            row.pharmacy_id,
          ),

    itemType:
      row.item_type,

    source:
      row.source,

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

    pharmacyStatus:
      row.pharmacy_status,

    lat:
      toNullableNumber(
        row.lat,
      ),

    lng:
      toNullableNumber(
        row.lng,
      ),

    googlePlaceId:
      row.google_place_id,

    activityCategory:
      row.activity_category,

    additionReason:
      row.addition_reason,

    estimatedMinutes:
      toNullableNumber(
        row.estimated_minutes,
      ),

    scheduledDate:
      normalizeDateValue(
        row.scheduled_date,
      ),

    scheduledTime:
      row.scheduled_time,

    order:
      Number(
        row.ord,
      ),

    required:
      Boolean(
        row.required,
      ),

    status:
      row.status,

    cancellationRequestStatus:
      row.cancellation_request_status,

    cancellationRequestReason:
      row.cancellation_request_reason,

    cancellationRequestNotes:
      row.cancellation_request_notes,

    cancellationRequestedAt:
      row.cancellation_requested_at,

    cancellationRequestedBy:
      row.cancellation_requested_by,

    cancellationReviewedAt:
      row.cancellation_reviewed_at,

    cancellationReviewedBy:
      row.cancellation_reviewed_by,

    cancellationReviewComment:
      row.cancellation_review_comment,

    addedBy:
      row.added_by,

    addedAt:
      row.added_at,

    updatedBy:
      row.updated_by,

    updatedAt:
      row.updated_at,

    removedBy:
      row.removed_by,

    removedAt:
      row.removed_at,

    removalReason:
      row.removal_reason,
  }
}

function mapRevision(
  row,
) {
  return {
    id:
      row.id,

    planId:
      row.plan_id,

    revisionNumber:
      Number(
        row.revision_number,
      ),

    status:
      row.status,

    submittedBy:
      row.submitted_by,

    submittedAt:
      row.submitted_at,

    reviewedBy:
      row.reviewed_by,

    reviewedAt:
      row.reviewed_at,

    reviewComment:
      row.review_comment,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

function mapEvent(
  row,
) {
  return {
    id:
      row.id,

    planId:
      row.plan_id,

    entityType:
      row.entity_type,

    entityId:
      row.entity_id,

    revisionNumber:
      row.revision_number ===
        null
        ? null
        : Number(
            row.revision_number,
          ),

    eventType:
      row.event_type,

    actorId:
      row.actor_id,

    actorArea:
      row.actor_area,

    actorRole:
      row.actor_role,

    previousStatus:
      row.previous_status,

    newStatus:
      row.new_status,

    comment:
      row.comment,

    beforeData:
      row.before_data,

    afterData:
      row.after_data,

    metadata:
      row.metadata,

    createdAt:
      row.created_at,
  }
}

/**
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function normalizeOptionalText(
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
  )
    .trim()
    .slice(
      0,
      10,
    )
}

function isValidIsoDate(
  value,
) {
  if (
    !ISO_DATE_PATTERN.test(
      value,
    )
  ) {
    return false
  }

  const date =
    new Date(
      `${value}T00:00:00.000Z`,
    )

  return (
    !Number.isNaN(
      date.getTime(),
    ) &&
    date
      .toISOString()
      .slice(
        0,
        10,
      ) ===
      value
  )
}

function differenceInDays(
  start,
  end,
) {
  const startDate =
    new Date(
      `${start}T00:00:00.000Z`,
    )

  const endDate =
    new Date(
      `${end}T00:00:00.000Z`,
    )

  return Math.floor(
    (
      endDate.getTime() -
      startDate.getTime()
    ) /
    86400000,
  )
}

function toNullableNumber(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  const numberValue =
    Number(
      value,
    )

  return Number.isFinite(
    numberValue,
  )
    ? numberValue
    : null
}

export default router