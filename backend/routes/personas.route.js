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

const ALLOWED_DIRECTORY_ROLES =
  new Set([
    'GERENTE',
    'COORDINADOR',
  ])

const ALLOWED_PERSON_ROLES =
  new Set([
    'GERENTE',
    'COORDINADOR',
    'SUPERVISOR',
  ])

const ALLOWED_STATUS_FILTERS =
  new Set([
    'ALL',
    'ACTIVE',
    'INACTIVE',
  ])

/**
 * ============================================================
 * GET /api/personas/directory
 * ============================================================
 *
 * Directorio seguro del área de Farmacias.
 *
 * GERENTE:
 * - consulta su propio perfil;
 * - coordinadores directos;
 * - supervisores de sus coordinadores;
 * - supervisores directos, si existieran.
 *
 * COORDINADOR:
 * - consulta su propio perfil;
 * - supervisores directos.
 *
 * No realiza modificaciones.
 */

router.get(
  '/directory',
  requireAuth,
  async (
    req,
    res,
  ) => {
    try {
      const actorResult =
        await pool.query(
          `
          SELECT
            persona.id,
            persona.nombre,
            persona.area::text
              AS area,
            persona.rol::text
              AS rol,
            persona.activo,
            persona.superior_id,
            persona.pharmacy_scope_mode,
            persona.auth_user_id,

            COALESCE(
              ARRAY_AGG(
                DISTINCT scope.estado
                ORDER BY scope.estado
              )
              FILTER (
                WHERE scope.estado
                  IS NOT NULL
              ),
              ARRAY[]::text[]
            ) AS states

          FROM public.personas
            persona

          LEFT JOIN public.person_state_scope
            scope

            ON scope.persona_id =
              persona.id

            AND scope.revoked_at
              IS NULL

          WHERE persona.auth_user_id =
            $1::uuid

          GROUP BY
            persona.id

          LIMIT 1
          `,
          [
            req.auth.user.id,
          ],
        )

      if (
        actorResult.rowCount ===
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

      const actor =
        actorResult.rows[0]

      const actorArea =
        normalizeUpper(
          actor.area,
        )

      const actorRole =
        normalizeUpper(
          actor.rol,
        )

      if (
        !actor.activo
      ) {
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
        actorArea !==
        'FARMACIAS'
      ) {
        return res
          .status(403)
          .json({
            error:
              'El directorio está disponible únicamente para el área de Farmacias',

            code:
              'AREA_NOT_ALLOWED',
          })
      }

      if (
        !ALLOWED_DIRECTORY_ROLES.has(
          actorRole,
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              'El directorio está disponible únicamente para gerentes y coordinadores',

            code:
              'DIRECTORY_ROLE_REQUIRED',
          })
      }

      const filters =
        parseDirectoryFilters(
          req.query,
        )

      if (!filters.ok) {
        return res
          .status(400)
          .json(
            filters.response,
          )
      }

      const requestedState =
        filters.value.state

      const actorStates =
        Array.isArray(
          actor.states,
        )
          ? actor.states
          : []

      if (
        requestedState &&
        !actorStates.some(
          state =>
            normalizeUpper(
              state,
            ) ===
            normalizeUpper(
              requestedState,
            ),
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              'El perfil no tiene autorización para consultar el estado solicitado',

            code:
              'STATE_SCOPE_NOT_ALLOWED',
          })
      }

      const directoryResult =
        await pool.query(
          `
          WITH accessible_people AS (
            SELECT
              person.*

            FROM public.personas
              person

            WHERE person.area::text =
                'FARMACIAS'

              AND (
                (
                  $2::text =
                    'GERENTE'

                  AND (
                    person.id =
                      $1::uuid

                    OR person.superior_id =
                      $1::uuid

                    OR EXISTS (
                      SELECT
                        1

                      FROM public.personas
                        coordinator

                      WHERE coordinator.id =
                          person.superior_id

                        AND coordinator.superior_id =
                          $1::uuid

                        AND coordinator.area::text =
                          'FARMACIAS'

                        AND coordinator.rol::text =
                          'COORDINADOR'
                    )
                  )
                )

                OR

                (
                  $2::text =
                    'COORDINADOR'

                  AND (
                    person.id =
                      $1::uuid

                    OR person.superior_id =
                      $1::uuid
                  )
                )
              )
          )

          SELECT
            person.id,
            person.nombre,
            person.area::text
              AS area,
            person.rol::text
              AS rol,
            person.activo,
            person.superior_id,
            person.pharmacy_scope_mode,
            person.auth_user_id,

            superior.nombre
              AS superior_name,

            superior.rol::text
              AS superior_role,

            COALESCE(
              state_scope.states,
              ARRAY[]::text[]
            ) AS states,

            COALESCE(
              assignment_count.total,
              0
            ) AS assigned_units,

            COALESCE(
              territory_count.total,
              0
            ) AS territory_units,

            COALESCE(
              active_coverage_count.total,
              0
            ) AS active_coverages,

            COALESCE(
              scheduled_coverage_count.total,
              0
            ) AS scheduled_coverages,

            COALESCE(
              direct_report_count.total,
              0
            ) AS direct_reports

          FROM accessible_people
            person

          LEFT JOIN public.personas
            superior

            ON superior.id =
              person.superior_id

          LEFT JOIN LATERAL (
            SELECT
              ARRAY_AGG(
                DISTINCT scope.estado
                ORDER BY scope.estado
              ) AS states

            FROM public.person_state_scope
              scope

            WHERE scope.persona_id =
                person.id

              AND scope.revoked_at
                IS NULL
          ) state_scope
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              COUNT(*)::integer
                AS total

            FROM public.pharmacy_supervisor_assignment
              assignment

            WHERE assignment.supervisor_id =
                person.id

              AND assignment.revoked_at
                IS NULL
          ) assignment_count
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              COUNT(*)::integer
                AS total

            FROM public.pharmacy_coordinator_assignment
              territory

            WHERE territory.coordinator_id =
                person.id

              AND territory.revoked_at
                IS NULL
          ) territory_count
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              COUNT(*)::integer
                AS total

            FROM public.pharmacy_supervisor_coverage
              coverage

            WHERE coverage.covering_supervisor_id =
                person.id

              AND coverage.status =
                'APPROVED'

              AND coverage.cancelled_at
                IS NULL

              AND CURRENT_DATE BETWEEN
                coverage.start_date
                AND coverage.end_date
          ) active_coverage_count
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              COUNT(*)::integer
                AS total

            FROM public.pharmacy_supervisor_coverage
              coverage

            WHERE coverage.covering_supervisor_id =
                person.id

              AND coverage.status =
                'APPROVED'

              AND coverage.cancelled_at
                IS NULL

              AND coverage.start_date >
                CURRENT_DATE
          ) scheduled_coverage_count
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              COUNT(*)::integer
                AS total

            FROM public.personas
              report

            WHERE report.superior_id =
                person.id

              AND report.area::text =
                'FARMACIAS'

              AND report.activo =
                TRUE
          ) direct_report_count
            ON TRUE

          WHERE (
              $3::text
                IS NULL

              OR person.nombre
                ILIKE
                '%' || $3::text || '%'

              OR person.rol::text
                ILIKE
                '%' || $3::text || '%'

              OR superior.nombre
                ILIKE
                '%' || $3::text || '%'
            )

            AND (
              $4::text
                IS NULL

              OR person.rol::text =
                $4::text
            )

            AND (
              $5::text =
                'ALL'

              OR (
                $5::text =
                  'ACTIVE'

                AND person.activo =
                  TRUE
              )

              OR (
                $5::text =
                  'INACTIVE'

                AND person.activo =
                  FALSE
              )
            )

            AND (
              $6::text
                IS NULL

              OR EXISTS (
                SELECT
                  1

                FROM public.person_state_scope
                  state_filter

                WHERE state_filter.persona_id =
                    person.id

                  AND state_filter.revoked_at
                    IS NULL

                  AND UPPER(
                    BTRIM(
                      state_filter.estado
                    )
                  ) =
                    UPPER(
                      BTRIM(
                        $6::text
                      )
                    )
              )
            )

          ORDER BY
            CASE
              WHEN person.rol::text =
                'GERENTE'
              THEN 1

              WHEN person.rol::text =
                'COORDINADOR'
              THEN 2

              WHEN person.rol::text =
                'SUPERVISOR'
              THEN 3

              ELSE 4
            END,

            person.nombre ASC
          `,
          [
            actor.id,
            actorRole,
            filters.value.search,
            filters.value.role,
            filters.value.status,
            requestedState,
          ],
        )

      const people =
        directoryResult.rows.map(
          mapDirectoryPerson,
        )

      return res.json({
        actor: {
          id:
            actor.id,

          name:
            actor.nombre,

          area:
            actorArea,

          role:
            actorRole,

          active:
            Boolean(
              actor.activo,
            ),

          states:
            actorStates,

          pharmacyScopeMode:
            actor.pharmacy_scope_mode ??
            null,
        },

        summary:
          buildDirectorySummary(
            people,
          ),

        filters: {
          search:
            filters.value.search,

          role:
            filters.value.role,

          status:
            filters.value.status,

          state:
            requestedState,
        },

        people,

        generatedAt:
          new Date()
            .toISOString(),
      })
    } catch (
      error
    ) {
      console.error(
        '[personas][directory]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener el directorio de personas',

          code:
            'PEOPLE_DIRECTORY_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * GET /api/personas
 * ============================================================
 *
 * Endpoint heredado.
 *
 * Se conserva temporalmente para no romper consumidores
 * existentes del módulo de Operaciones.
 */

router.get(
  '/',
  async (
    req,
    res,
  ) => {
    try {
      const {
        rows,
      } =
        await pool.query(
          `
          SELECT
            *

          FROM public.personas

          ORDER BY
            id
          `,
        )

      return res.json(
        rows,
      )
    } catch (
      error
    ) {
      console.error(
        '[personas][GET]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'Error obteniendo personas',
        })
    }
  },
)

function parseDirectoryFilters(
  query = {},
) {
  const search =
    normalizeOptionalText(
      query.search,
    )

  const state =
    normalizeOptionalText(
      query.state,
    )

  const rawRole =
    normalizeUpper(
      query.role,
    )

  const role =
    rawRole &&
    rawRole !==
      'ALL'
      ? rawRole
      : null

  const status =
    normalizeUpper(
      query.status,
    ) ||
    'ALL'

  if (
    role &&
    !ALLOWED_PERSON_ROLES.has(
      role,
    )
  ) {
    return {
      ok:
        false,

      response: {
        error:
          'El filtro de rol no es válido',

        code:
          'INVALID_PERSON_ROLE_FILTER',
      },
    }
  }

  if (
    !ALLOWED_STATUS_FILTERS.has(
      status,
    )
  ) {
    return {
      ok:
        false,

      response: {
        error:
          'El filtro de estatus no es válido',

        code:
          'INVALID_PERSON_STATUS_FILTER',
      },
    }
  }

  return {
    ok:
      true,

    value: {
      search,
      state,
      role,
      status,
    },
  }
}

function mapDirectoryPerson(
  row,
) {
  return {
    id:
      row.id,

    name:
      row.nombre,

    area:
      normalizeUpper(
        row.area,
      ),

    role:
      normalizeUpper(
        row.rol,
      ),

    active:
      Boolean(
        row.activo,
      ),

    superiorId:
      row.superior_id,

    superiorName:
      row.superior_name,

    superiorRole:
      row.superior_role
        ? normalizeUpper(
            row.superior_role,
          )
        : null,

    pharmacyScopeMode:
      row.pharmacy_scope_mode ??
      null,

    authUserId:
      row.auth_user_id,

    accountLinked:
      Boolean(
        row.auth_user_id,
      ),

    states:
      Array.isArray(
        row.states,
      )
        ? row.states
        : [],

    assignedUnits:
      Number(
        row.assigned_units ??
        0,
      ),

    territoryUnits:
      Number(
        row.territory_units ??
        0,
      ),

    activeCoverages:
      Number(
        row.active_coverages ??
        0,
      ),

    scheduledCoverages:
      Number(
        row.scheduled_coverages ??
        0,
      ),

    directReports:
      Number(
        row.direct_reports ??
        0,
      ),
  }
}

function buildDirectorySummary(
  people,
) {
  return {
    total:
      people.length,

    active:
      people.filter(
        person =>
          person.active,
      ).length,

    inactive:
      people.filter(
        person =>
          !person.active,
      ).length,

    linkedAccounts:
      people.filter(
        person =>
          person.accountLinked,
      ).length,

    unlinkedAccounts:
      people.filter(
        person =>
          !person.accountLinked,
      ).length,

    managers:
      people.filter(
        person =>
          person.role ===
          'GERENTE',
      ).length,

    coordinators:
      people.filter(
        person =>
          person.role ===
          'COORDINADOR',
      ).length,

    supervisors:
      people.filter(
        person =>
          person.role ===
          'SUPERVISOR',
      ).length,

    assignedUnits:
      people.reduce(
        (
          total,
          person,
        ) =>
          total +
          person.assignedUnits,
        0,
      ),

    territoryUnits:
      people.reduce(
        (
          total,
          person,
        ) =>
          total +
          person.territoryUnits,
        0,
      ),

    activeCoverages:
      people.reduce(
        (
          total,
          person,
        ) =>
          total +
          person.activeCoverages,
        0,
      ),

    scheduledCoverages:
      people.reduce(
        (
          total,
          person,
        ) =>
          total +
          person.scheduledCoverages,
        0,
      ),
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

  return normalized ||
    null
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

export default router