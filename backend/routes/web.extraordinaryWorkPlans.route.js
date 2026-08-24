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
 * GET
 * /api/web/work-plans/extraordinary
 *
 * Query:
 * state=Jalisco
 * periodStart=2026-07-01
 * periodEnd=2026-07-31
 *
 * Devuelve planes EXTRAORDINARY que
 * intersecten el periodo consultado.
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

    if (
      differenceInDays(
        periodStart,
        periodEnd,
      ) >
      366
    ) {
      return res
        .status(400)
        .json({
          error:
            'El periodo consultado no puede superar un año',

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
            wp.id
              AS plan_id,

            wp.supervisor_id,

            supervisor.supervisor_name,

            supervisor.coordinator_id,
            supervisor.coordinator_name,

            supervisor.state_name,

            wp.status,
            wp.plan_type,

            wp.period_start,
            wp.period_end,

            wp.revision_number,

            wp.created_at,
            wp.updated_at,

            wp.submitted_at,
            wp.approved_at,
            wp.rejected_at,

            wp.rejection_comment,

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

          FROM authorized_supervisors
            supervisor

          INNER JOIN public.work_plan
            wp

            ON wp.supervisor_id =
              supervisor.supervisor_id

            AND wp.plan_type =
              'EXTRAORDINARY'

            AND wp.archived_at
              IS NULL

            AND wp.period_start <=
              $5::date

            AND wp.period_end >=
              $4::date

          LEFT JOIN public.work_plan_item
            wpi

            ON wpi.plan_id =
              wp.id

          GROUP BY
            wp.id,

            supervisor.supervisor_name,

            supervisor.coordinator_id,
            supervisor.coordinator_name,

            supervisor.state_name

          ORDER BY
            wp.period_start DESC,

            wp.created_at DESC,

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
          mapPlan,
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
          buildTotals(
            plans,
          ),

        plans,
      })
    } catch (
      error
    ) {
      console.error(
        '[web.extraordinary-work-plans]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener los planes extraordinarios',

          code:
            'WEB_EXTRAORDINARY_PLANS_FETCH_FAILED',
        })
    }
  },
)

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
      '[web.extraordinary-work-plans][profile]',
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

function mapPlan(
  row,
) {
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

    hasPlan:
      true,

    planId:
      row.plan_id,

    status:
      row.status,

    planType:
      'EXTRAORDINARY',

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

function buildTotals(
  plans,
) {
  const totals = {
    plansCount:
      plans.length,

    draftCount:
      0,

    pendingApprovalCount:
      0,

    approvedCount:
      0,

    rejectedCount:
      0,

    totalItems:
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

    switch (
      plan.status
    ) {
      case 'DRAFT':
        totals.draftCount +=
          1
        break

      case 'PENDING_APPROVAL':
        totals.pendingApprovalCount +=
          1
        break

      case 'APPROVED':
        totals.approvedCount +=
          1
        break

      case 'REJECTED':
        totals.rejectedCount +=
          1
        break
    }
  }

  return totals
}

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

export default router