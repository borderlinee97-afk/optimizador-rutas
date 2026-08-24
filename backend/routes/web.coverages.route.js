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
  approvePharmacyCoverage,
  cancelPharmacyCoverage,
  createPharmacyCoverage,
  listPharmacyCoverages,
  rejectPharmacyCoverage,
} from '../services/pharmacyCoverage.service.js'

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
  loadCoverageProfile,
)

router.get(
  '/',
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await listPharmacyCoverages({
          state:
            req.query.state,

          actor:
            req.profile,
        })

      return res.json(
        result,
      )
    } catch (
      error
    ) {
      return sendCoverageError(
        res,
        error,
        'COVERAGES_FETCH_FAILED',
      )
    }
  },
)

router.post(
  '/',
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await createPharmacyCoverage({
          pharmacyId:
            req.body?.pharmacyId,

          coveringSupervisorId:
            req.body?.coveringSupervisorId,

          startDate:
            req.body?.startDate,

          endDate:
            req.body?.endDate,

          comment:
            req.body?.comment,

          actor: {
            ...req.profile,

            channel:
              'WEB',
          },
        })

      return res
        .status(201)
        .json(
          result,
        )
    } catch (
      error
    ) {
      return sendCoverageError(
        res,
        error,
        'COVERAGE_CREATE_FAILED',
      )
    }
  },
)

router.post(
  '/:coverageId/approve',
  requireManager,
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await approvePharmacyCoverage({
          coverageId:
            req.params.coverageId,

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
      return sendCoverageError(
        res,
        error,
        'COVERAGE_APPROVE_FAILED',
      )
    }
  },
)

router.post(
  '/:coverageId/reject',
  requireManager,
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await rejectPharmacyCoverage({
          coverageId:
            req.params.coverageId,

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
      return sendCoverageError(
        res,
        error,
        'COVERAGE_REJECT_FAILED',
      )
    }
  },
)

router.post(
  '/:coverageId/cancel',
  requireManager,
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await cancelPharmacyCoverage({
          coverageId:
            req.params.coverageId,

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
      return sendCoverageError(
        res,
        error,
        'COVERAGE_CANCEL_FAILED',
      )
    }
  },
)

async function loadCoverageProfile(
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
      area !==
      'FARMACIAS' ||
      !ALLOWED_ROLES.has(
        role,
      )
    ) {
      return res
        .status(403)
        .json({
          error:
            'El perfil no tiene acceso a coberturas temporales',

          code:
            'COVERAGE_ROLE_NOT_ALLOWED',
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
      '[web.coverages][profile]',
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

function sendCoverageError(
  res,
  error,
  fallbackCode,
) {
  console.error(
    '[web.coverages]',
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
        'No fue posible procesar la cobertura',

      code:
        error?.code ||
        fallbackCode,

      details:
        error?.details ||
        null,
    })
}

export default router