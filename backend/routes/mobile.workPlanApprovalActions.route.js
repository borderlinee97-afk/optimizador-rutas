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
  approveWorkPlan,
  rejectWorkPlan,
} from '../services/workPlanApproval.service.js'

const router =
  Router()

router.use(
  requireAuth,
)

router.use(
  loadManagerProfile,
)

router.post(
  '/:planId/approve',
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await approveWorkPlan({
          planId:
            req.params.planId,

          actor: {
            ...req.profile,

            channel:
              'MOBILE',
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
        'WORK_PLAN_APPROVE_FAILED',
      )
    }
  },
)

router.post(
  '/:planId/reject',
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await rejectWorkPlan({
          planId:
            req.params.planId,

          comment:
            req.body?.comment,

          actor: {
            ...req.profile,

            channel:
              'MOBILE',
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
        'WORK_PLAN_REJECT_FAILED',
      )
    }
  },
)

async function loadManagerProfile(
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

    if (
      String(
        profile.rol,
      ).toUpperCase() !==
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
      '[mobile.work-plan-actions][profile]',
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

function sendActionError(
  res,
  error,
  fallbackCode,
) {
  console.error(
    '[mobile.work-plan-actions]',
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
    })
}

export default router