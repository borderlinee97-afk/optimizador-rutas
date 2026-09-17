import {
  pool,
} from '../db/pool.js'

export async function requireOperationalProfile(
  req,
  res,
  next,
) {
  if (
    req.identityProfile
  ) {
    return next()
  }

  try {
    const result =
      await pool.query(
        `
        SELECT
          id,
          nombre,
          area::text AS area,
          rol::text AS rol,
          activo,
          superior_id,
          pharmacy_scope_mode,
          system_role,
          allowed_areas
        FROM public.personas
        WHERE auth_user_id = $1::uuid
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

          requestId:
            req.requestId,
        })
    }

    const profile =
      result.rows[0]

    if (
      !profile.activo
    ) {
      return res
        .status(403)
        .json({
          error:
            'El perfil operativo se encuentra inactivo',

          code:
            'PROFILE_INACTIVE',

          requestId:
            req.requestId,
        })
    }

    req.identityProfile = {
      ...profile,

      area:
        normalizeUpper(
          profile.area,
        ),

      rol:
        normalizeUpper(
          profile.rol,
        ),

      system_role:
        normalizeUpper(
          profile.system_role,
        ),

      allowed_areas:
        Array.isArray(
          profile.allowed_areas,
        )
          ? profile.allowed_areas.map(
              normalizeUpper,
            )
          : [],
    }

    return next()
  } catch (
    error
  ) {
    return next(
      error,
    )
  }
}

export function requireRoles(
  ...roles
) {
  const allowedRoles =
    new Set(
      roles.map(
        normalizeUpper,
      ),
    )

  return function roleGuard(
    req,
    res,
    next,
  ) {
    const profile =
      req.identityProfile

    if (
      profile?.system_role ===
      'ADMIN'
    ) {
      return next()
    }

    if (
      profile &&
      allowedRoles.has(
        profile.rol,
      )
    ) {
      return next()
    }

    return res
      .status(403)
      .json({
        error:
          'El perfil no tiene autorización para esta operación',

        code:
          'ROLE_NOT_ALLOWED',

        requestId:
          req.requestId,
      })
  }
}

export function requireAreas(
  ...areas
) {
  const allowedAreas =
    new Set(
      areas.map(
        normalizeUpper,
      ),
    )

  return function areaGuard(
    req,
    res,
    next,
  ) {
    const profile =
      req.identityProfile

    if (
      profile?.system_role ===
      'ADMIN'
    ) {
      return next()
    }

    if (
      profile &&
      (
        allowedAreas.has(
          profile.area,
        ) ||
        profile.allowed_areas.some(
          area =>
            allowedAreas.has(
              area,
            ),
        )
      )
    ) {
      return next()
    }

    return res
      .status(403)
      .json({
        error:
          'El perfil no tiene autorización para esta área',

        code:
          'AREA_NOT_ALLOWED',

        requestId:
          req.requestId,
      })
  }
}

function normalizeUpper(
  value,
) {
  return String(
    value ??
    '',
  )
    .trim()
    .toUpperCase()
}
