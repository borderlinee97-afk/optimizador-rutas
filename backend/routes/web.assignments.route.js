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
  requireSupportedRole,
)

/**
 * ============================================================
 * GET /api/web/assignments?state=Jalisco
 * ============================================================
 *
 * GERENTE
 * - consulta todo su ámbito estatal autorizado;
 * - ve coordinadores;
 * - ve asignaciones activas;
 * - ve vacantes;
 * - ve inactivas;
 * - ve no clasificadas.
 *
 * COORDINADOR
 * - consulta únicamente su territorio formal;
 * - incluye unidades con y sin supervisor.
 *
 * Las fuentes autoritativas son:
 *
 * pharmacy_coordinator_assignment
 * pharmacy_supervisor_assignment
 *
 * Nunca farmacia.supervisor.
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

    try {
      const authorizedState =
        await getAuthorizedState(
          req.profile.id,
          state,
        )

      if (!authorizedState) {
        return res
          .status(403)
          .json({
            error:
              'No tienes acceso a este estado',

            code:
              'STATE_NOT_ALLOWED',
          })
      }

      const [
        unitsResult,
        coordinatorsResult,
        supervisorsResult,
      ] =
        await Promise.all([
          getUnits({
            profile:
              req.profile,

            state:
              authorizedState,
          }),

          getCoordinators({
            profile:
              req.profile,

            state:
              authorizedState,
          }),

          getSupervisors({
            profile:
              req.profile,

            state:
              authorizedState,
          }),
        ])

      const units =
        unitsResult.rows.map(
          mapUnit,
        )

      const supervisors =
        supervisorsResult.rows.map(
          mapSupervisor,
        )

      const coordinators =
        coordinatorsResult.rows.map(
          row =>
            mapCoordinator(
              row,
              units,
              supervisors,
            ),
        )

      const totals =
        buildTotals(
          units,
        )

      return res.json({
        context: {
          area:
            'FARMACIAS',

          role:
            req.profile.rol,

          state:
            normalizeStateName(
              authorizedState,
            ),

          canManageDirectly:
            req.profile.rol ===
            'GERENTE',

          canRequestChanges:
            req.profile.rol ===
            'COORDINADOR',
        },

        totals,

        coordinators,

        supervisors,

        units,
      })
    } catch (
      error
    ) {
      console.error(
        '[web.assignments][GET]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener las asignaciones',

          code:
            'WEB_ASSIGNMENTS_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * UNIDADES
 * ============================================================
 */

async function getUnits({
  profile,
  state,
}) {
  const params = [
    state,
  ]

  let authorizationCondition

  if (
    profile.rol ===
    'GERENTE'
  ) {
    params.push(
      profile.id,
    )

    authorizationCondition =
      `
      (
        coordinator.id
          IS NULL

        OR coordinator.superior_id =
          $2::uuid

        OR farmacia.estatus::text =
          'INACTIVA'
      )
      `
  } else {
    params.push(
      profile.id,
    )

    authorizationCondition =
      `
      territory.coordinator_id =
        $2::uuid
      `
  }

  return pool.query(
    `
    SELECT
      farmacia.id,

      farmacia.clues,

      farmacia.unidad,

      farmacia.region_sanitaria,

      farmacia.estatus::text
        AS estatus,

      farmacia.lugar_farmacia,

      farmacia.direccion,

      farmacia.estado,

      farmacia.proyecto,

      farmacia.latitud::double precision
        AS latitud,

      farmacia.longitud::double precision
        AS longitud,

      territory.id
        AS territory_assignment_id,

      territory.coordinator_id,

      coordinator.nombre
        AS coordinator_name,

      supervisor_assignment.id
        AS supervisor_assignment_id,

      supervisor_assignment.supervisor_id,

      supervisor.nombre
        AS supervisor_name,

      supervisor.pharmacy_scope_mode
        AS supervisor_scope_mode

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

      AND coordinator.area::text =
        'FARMACIAS'

      AND coordinator.rol::text =
        'COORDINADOR'

      AND coordinator.activo =
        TRUE

    LEFT JOIN public.pharmacy_supervisor_assignment
      supervisor_assignment

      ON supervisor_assignment.pharmacy_id =
        farmacia.id

      AND supervisor_assignment.revoked_at
        IS NULL

    LEFT JOIN public.personas
      supervisor

      ON supervisor.id =
        supervisor_assignment.supervisor_id

      AND supervisor.area::text =
        'FARMACIAS'

      AND supervisor.rol::text =
        'SUPERVISOR'

      AND supervisor.activo =
        TRUE

    WHERE
      UPPER(
        BTRIM(
          COALESCE(
            farmacia.estado,
            ''
          )
        )
      ) =
      UPPER(
        BTRIM(
          $1::text
        )
      )

      AND
      ${authorizationCondition}

    ORDER BY
      CASE
        WHEN farmacia.estatus::text =
          'INACTIVA'
          THEN 4

        WHEN territory.id
          IS NULL
          THEN 3

        WHEN supervisor_assignment.id
          IS NULL
          THEN 2

        ELSE 1
      END ASC,

      coordinator.nombre ASC
        NULLS LAST,

      supervisor.nombre ASC
        NULLS LAST,

      farmacia.region_sanitaria ASC
        NULLS LAST,

      farmacia.clues ASC
    `,
    params,
  )
}

/**
 * ============================================================
 * COORDINADORES
 * ============================================================
 */

async function getCoordinators({
  profile,
  state,
}) {
  const params = [
    profile.id,
    state,
  ]

  let roleCondition

  if (
    profile.rol ===
    'GERENTE'
  ) {
    roleCondition =
      `
      coordinator.superior_id =
        $1::uuid
      `
  } else {
    roleCondition =
      `
      coordinator.id =
        $1::uuid
      `
  }

  return pool.query(
    `
    SELECT
      coordinator.id,

      coordinator.nombre

    FROM public.personas
      coordinator

    WHERE coordinator.area::text =
        'FARMACIAS'

      AND coordinator.rol::text =
        'COORDINADOR'

      AND coordinator.activo =
        TRUE

      AND
        ${roleCondition}

      AND EXISTS (
        SELECT 1

        FROM public.person_state_scope
          state_scope

        WHERE state_scope.persona_id =
            coordinator.id

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
      )

    ORDER BY
      coordinator.nombre ASC
    `,
    params,
  )
}

/**
 * ============================================================
 * SUPERVISORES
 * ============================================================
 */

async function getSupervisors({
  profile,
  state,
}) {
  const params = [
    profile.id,
    state,
  ]

  let hierarchyCondition

  if (
    profile.rol ===
    'GERENTE'
  ) {
    hierarchyCondition =
      `
      (
        supervisor.superior_id =
          $1::uuid

        OR coordinator.superior_id =
          $1::uuid
      )
      `
  } else {
    hierarchyCondition =
      `
      supervisor.superior_id =
        $1::uuid
      `
  }

  return pool.query(
    `
    SELECT
      supervisor.id,

      supervisor.nombre,

      supervisor.superior_id,

      supervisor.pharmacy_scope_mode,

      coordinator.id
        AS coordinator_id,

      coordinator.nombre
        AS coordinator_name,

      COUNT(
        DISTINCT assignment.pharmacy_id
      ) AS assigned_units_count

    FROM public.personas
      supervisor

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

    INNER JOIN public.person_state_scope
      state_scope

      ON state_scope.persona_id =
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

    LEFT JOIN public.pharmacy_supervisor_assignment
      assignment

      ON assignment.supervisor_id =
        supervisor.id

      AND assignment.revoked_at
        IS NULL

    LEFT JOIN public.farmacia
      farmacia

      ON farmacia.id =
        assignment.pharmacy_id

      AND UPPER(
        BTRIM(
          COALESCE(
            farmacia.estado,
            ''
          )
        )
      ) =
      UPPER(
        BTRIM(
          $2::text
        )
      )

    WHERE supervisor.area::text =
        'FARMACIAS'

      AND supervisor.rol::text =
        'SUPERVISOR'

      AND supervisor.activo =
        TRUE

      AND
        ${hierarchyCondition}

    GROUP BY
      supervisor.id,

      supervisor.nombre,

      supervisor.superior_id,

      supervisor.pharmacy_scope_mode,

      coordinator.id,

      coordinator.nombre

    ORDER BY
      coordinator.nombre ASC
        NULLS LAST,

      supervisor.nombre ASC
    `,
    params,
  )
}

/**
 * ============================================================
 * STATE SCOPE
 * ============================================================
 */

async function getAuthorizedState(
  personId,
  requestedState,
) {
  const result =
    await pool.query(
      `
      SELECT
        estado

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
        personId,
        requestedState,
      ],
    )

  return (
    result.rows[0]
      ?.estado ??
    null
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
      '[web.assignments][profile]',
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
          'El perfil no tiene acceso al módulo de asignaciones',

        code:
          'ASSIGNMENTS_ROLE_NOT_ALLOWED',
      })
  }

  return next()
}

/**
 * ============================================================
 * MAPEO
 * ============================================================
 */

function mapUnit(
  row,
) {
  let assignmentStatus

  if (
    row.estatus ===
    'INACTIVA'
  ) {
    assignmentStatus =
      'INACTIVE'
  } else if (
    !row.territory_assignment_id ||
    !row.coordinator_id
  ) {
    assignmentStatus =
      'UNCLASSIFIED'
  } else if (
    !row.supervisor_assignment_id ||
    !row.supervisor_id
  ) {
    assignmentStatus =
      'UNASSIGNED'
  } else {
    assignmentStatus =
      'ASSIGNED'
  }

  return {
    id:
      String(
        row.id,
      ),

    clues:
      row.clues,

    name:
      row.unidad ||
      row.clues ||
      'Unidad sin nombre',

    region:
      row.region_sanitaria,

    status:
      row.estatus,

    place:
      row.lugar_farmacia,

    address:
      row.direccion,

    state:
      normalizeStateName(
        row.estado,
      ),

    project:
      row.proyecto,

    lat:
      row.latitud ===
        null
        ? null
        : Number(
            row.latitud,
          ),

    lng:
      row.longitud ===
        null
        ? null
        : Number(
            row.longitud,
          ),

    territoryAssignmentId:
      row.territory_assignment_id,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

    supervisorAssignmentId:
      row.supervisor_assignment_id,

    supervisorId:
      row.supervisor_id,

    supervisorName:
      row.supervisor_name,

    supervisorScopeMode:
      row.supervisor_scope_mode,

    assignmentStatus,
  }
}

function mapSupervisor(
  row,
) {
  return {
    id:
      row.id,

    name:
      row.nombre,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

    pharmacyScopeMode:
      row.pharmacy_scope_mode,

    assignedUnitsCount:
      Number(
        row.assigned_units_count ??
        0,
      ),
  }
}

function mapCoordinator(
  row,
  units,
  supervisors,
) {
  const ownUnits =
    units.filter(
      unit =>
        unit.coordinatorId ===
        row.id,
    )

  const ownSupervisors =
    supervisors.filter(
      supervisor =>
        supervisor.coordinatorId ===
        row.id,
    )

  return {
    id:
      row.id,

    name:
      row.nombre,

    supervisorsCount:
      ownSupervisors.length,

    unitsCount:
      ownUnits.length,

    assignedUnitsCount:
      ownUnits.filter(
        unit =>
          unit.assignmentStatus ===
          'ASSIGNED',
      ).length,

    unassignedUnitsCount:
      ownUnits.filter(
        unit =>
          unit.assignmentStatus ===
          'UNASSIGNED',
      ).length,
  }
}

function buildTotals(
  units,
) {
  return {
    registeredUnitsCount:
      units.length,

    operationalUnitsCount:
      units.filter(
        unit =>
          unit.assignmentStatus ===
            'ASSIGNED' ||
          unit.assignmentStatus ===
            'UNASSIGNED',
      ).length,

    assignedUnitsCount:
      units.filter(
        unit =>
          unit.assignmentStatus ===
          'ASSIGNED',
      ).length,

    unassignedUnitsCount:
      units.filter(
        unit =>
          unit.assignmentStatus ===
          'UNASSIGNED',
      ).length,

    inactiveUnitsCount:
      units.filter(
        unit =>
          unit.assignmentStatus ===
          'INACTIVE',
      ).length,

    unclassifiedUnitsCount:
      units.filter(
        unit =>
          unit.assignmentStatus ===
          'UNCLASSIFIED',
      ).length,
  }
}

function normalizeOptionalText(
  value,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  return (
    normalized ||
    null
  )
}

function normalizeStateName(
  value,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  if (!normalized) {
    return ''
  }

  return normalized
    .toLocaleLowerCase(
      'es-MX',
    )
    .replace(
      /(^|\s)\S/g,
      letter =>
        letter.toLocaleUpperCase(
          'es-MX',
        ),
    )
}

export default router