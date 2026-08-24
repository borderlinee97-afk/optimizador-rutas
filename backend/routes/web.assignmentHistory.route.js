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

const BIGINT_PATTERN =
  /^\d+$/

const ALLOWED_ROLES =
  new Set([
    'GERENTE',
    'COORDINADOR',
  ])

router.use(
  requireAuth,
)

router.use(
  loadProfile,
)

router.get(
  '/:pharmacyId/history',
  async (
    req,
    res,
  ) => {
    const pharmacyId =
      String(
        req.params.pharmacyId ??
        '',
      )

    if (
      !BIGINT_PATTERN.test(
        pharmacyId,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'El identificador de la unidad no es válido',

          code:
            'INVALID_PHARMACY_ID',
        })
    }

    try {
      const unit =
        await loadAuthorizedUnit({
          pharmacyId,
          profile:
            req.profile,
        })

      if (!unit) {
        return res
          .status(404)
          .json({
            error:
              'La unidad no existe o no pertenece a tu ámbito',

            code:
              'ASSIGNMENT_HISTORY_NOT_FOUND',
          })
      }

      const [
        assignmentsResult,
        eventsResult,
      ] =
        await Promise.all([
          pool.query(
            `
            SELECT
              assignment.id,

              assignment.pharmacy_id,

              assignment.supervisor_id,

              supervisor.nombre
                AS supervisor_name,

              assignment.assigned_by,

              assigned_actor.nombre
                AS assigned_by_name,

              assignment.assigned_at,

              assignment.assignment_comment,

              assignment.revoked_by,

              revoked_actor.nombre
                AS revoked_by_name,

              assignment.revoked_at,

              assignment.revocation_reason,

              assignment.created_at,
              assignment.updated_at

            FROM public.pharmacy_supervisor_assignment
              assignment

            INNER JOIN public.personas
              supervisor

              ON supervisor.id =
                assignment.supervisor_id

            LEFT JOIN public.personas
              assigned_actor

              ON assigned_actor.id =
                assignment.assigned_by

            LEFT JOIN public.personas
              revoked_actor

              ON revoked_actor.id =
                assignment.revoked_by

            WHERE assignment.pharmacy_id =
                $1

            ORDER BY
              assignment.assigned_at DESC,
              assignment.created_at DESC
            `,
            [
              pharmacyId,
            ],
          ),

          pool.query(
            `
            SELECT
              event.id,

              event.assignment_id,

              event.pharmacy_id,

              event.supervisor_id,

              supervisor.nombre
                AS supervisor_name,

              event.coordinator_id,

              coordinator.nombre
                AS coordinator_name,

              event.event_type,

              event.actor_id,

              actor.nombre
                AS actor_name,

              event.comment,

              event.before_data,

              event.after_data,

              event.metadata,

              event.created_at

            FROM public.pharmacy_assignment_event
              event

            LEFT JOIN public.personas
              supervisor

              ON supervisor.id =
                event.supervisor_id

            LEFT JOIN public.personas
              coordinator

              ON coordinator.id =
                event.coordinator_id

            LEFT JOIN public.personas
              actor

              ON actor.id =
                event.actor_id

            WHERE event.pharmacy_id =
                $1

              AND event.event_type IN (
                'PHARMACY_ASSIGNED',
                'PHARMACY_REASSIGNED',
                'PHARMACY_ASSIGNMENT_REVOKED'
              )

            ORDER BY
              event.created_at DESC
            `,
            [
              pharmacyId,
            ],
          ),
        ])

      return res.json({
        unit: {
          id:
            String(
              unit.id,
            ),

          clues:
            unit.clues,

          name:
            unit.name,

          state:
            unit.estado,

          coordinatorId:
            unit.coordinator_id,

          coordinatorName:
            unit.coordinator_name,
        },

        assignments:
          assignmentsResult.rows.map(
            mapAssignment,
          ),

        events:
          eventsResult.rows.map(
            mapEvent,
          ),
      })
    } catch (
      error
    ) {
      console.error(
        '[web.assignment-history]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener el historial de asignaciones',

          code:
            'ASSIGNMENT_HISTORY_FETCH_FAILED',
        })
    }
  },
)

async function loadAuthorizedUnit({
  pharmacyId,
  profile,
}) {
  const result =
    await pool.query(
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

        territory.coordinator_id,

        coordinator.nombre
          AS coordinator_name,

        coordinator.superior_id
          AS coordinator_manager_id,

        EXISTS (
          SELECT 1

          FROM public.person_state_scope
            scope

          WHERE scope.persona_id =
              $2::uuid

            AND scope.revoked_at
              IS NULL

            AND UPPER(
              BTRIM(
                scope.estado
              )
            ) =
            UPPER(
              BTRIM(
                farmacia.estado
              )
            )
        ) AS has_state_scope

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

      LIMIT 1
      `,
      [
        pharmacyId,
        profile.id,
      ],
    )

  const unit =
    result.rows[0]

  if (
    !unit ||
    !unit.has_state_scope
  ) {
    return null
  }

  if (
    profile.rol ===
      'GERENTE'
  ) {
    if (
      unit.coordinator_id &&
      unit.coordinator_manager_id !==
        profile.id
    ) {
      return null
    }

    return unit
  }

  if (
    profile.rol ===
      'COORDINADOR' &&
    unit.coordinator_id ===
      profile.id
  ) {
    return unit
  }

  return null
}

async function loadProfile(
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
      !profile.activo ||
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
            'El perfil no tiene acceso al historial de asignaciones',

          code:
            'ASSIGNMENT_HISTORY_ROLE_NOT_ALLOWED',
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
      '[web.assignment-history][profile]',
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

    supervisorName:
      row.supervisor_name,

    assignedBy:
      row.assigned_by,

    assignedByName:
      row.assigned_by_name,

    assignedAt:
      row.assigned_at,

    assignmentComment:
      row.assignment_comment,

    revokedBy:
      row.revoked_by,

    revokedByName:
      row.revoked_by_name,

    revokedAt:
      row.revoked_at,

    revocationReason:
      row.revocation_reason,

    active:
      !row.revoked_at,
  }
}

function mapEvent(
  row,
) {
  return {
    id:
      row.id,

    assignmentId:
      row.assignment_id,

    pharmacyId:
      row.pharmacy_id ===
        null
        ? null
        : String(
            row.pharmacy_id,
          ),

    supervisorId:
      row.supervisor_id,

    supervisorName:
      row.supervisor_name,

    coordinatorId:
      row.coordinator_id,

    coordinatorName:
      row.coordinator_name,

    eventType:
      row.event_type,

    actorId:
      row.actor_id,

    actorName:
      row.actor_name,

    comment:
      row.comment,

    beforeData:
      row.before_data,

    afterData:
      row.after_data,

    metadata:
      row.metadata ??
      {},

    createdAt:
      row.created_at,
  }
}

export default router