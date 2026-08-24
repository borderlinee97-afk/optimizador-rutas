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
  assignPharmacySupervisor,
  revokePharmacySupervisor,
} from '../services/pharmacyAssignmentManagement.service.js'

const router =
  Router()

router.use(
  requireAuth,
)

router.use(
  loadManagerProfile,
)

/**
 * POST
 * /api/web/assignments/:pharmacyId/supervisor/assign
 */
router.post(
  '/:pharmacyId/supervisor/assign',
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await assignPharmacySupervisor({
          pharmacyId:
            req.params.pharmacyId,

          supervisorId:
            req.body?.supervisorId,

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
        'PHARMACY_SUPERVISOR_ASSIGN_FAILED',
      )
    }
  },
)

/**
 * POST
 * /api/web/assignments/:pharmacyId/supervisor/revoke
 */
router.post(
  '/:pharmacyId/supervisor/revoke',
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await revokePharmacySupervisor({
          pharmacyId:
            req.params.pharmacyId,

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
        'PHARMACY_SUPERVISOR_REVOKE_FAILED',
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

    const area =
      String(
        profile.area ??
        '',
      )
        .trim()
        .toUpperCase()

    const role =
      String(
        profile.rol ??
        '',
      )
        .trim()
        .toUpperCase()

    if (
      area !==
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
      role !==
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

      area,

      rol:
        role,
    }

    return next()
  } catch (
    error
  ) {
    console.error(
      '[web.assignment-actions][profile]',
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
    '[web.assignment-actions]',
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
        'No fue posible procesar la asignación',

      code:
        error?.code ||
        fallbackCode,

      details:
        error?.details ||
        null,
    })
}

export default router