import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const WEB_AREAS = [
  'FARMACIAS',
  'OPERACIONES',
]

router.use(requireAuth)
router.use(loadOperationalProfile)

/**
 * ============================================================
 * GET /api/web/context
 * ============================================================
 */
router.get(
  '/context',
  async (
    req,
    res,
  ) => {
    try {
      const profile =
        req.profile

      const statesResult =
        await pool.query(
          `
          SELECT
            pss.estado,

            COUNT(
              DISTINCT f.id
            ) AS units_count,

            EXISTS (
              SELECT 1

              FROM public.personas supervisor

              INNER JOIN public.person_state_scope supervisor_scope
                ON supervisor_scope.persona_id =
                   supervisor.id

               AND supervisor_scope.revoked_at
                   IS NULL

               AND UPPER(
                 BTRIM(
                   supervisor_scope.estado
                 )
               ) =
               UPPER(
                 BTRIM(
                   pss.estado
                 )
               )

              WHERE supervisor.area =
                    'FARMACIAS'

                AND supervisor.rol =
                    'SUPERVISOR'

                AND supervisor.activo =
                    TRUE
            ) AS has_supervisor_structure

          FROM public.person_state_scope pss

          LEFT JOIN public.farmacia f
            ON UPPER(
              BTRIM(
                COALESCE(
                  f.estado,
                  ''
                )
              )
            ) =
            UPPER(
              BTRIM(
                pss.estado
              )
            )

          WHERE pss.persona_id =
                $1

            AND pss.revoked_at
                IS NULL

          GROUP BY
            pss.estado

          ORDER BY
            pss.estado ASC
          `,
          [
            profile.id,
          ],
        )

      const states =
        statesResult.rows.map(
          (
            row,
          ) => {
            let navigationMode =
              'UNITS'

            if (
              profile.area ===
              'OPERACIONES'
            ) {
              navigationMode =
                'JURISDICTIONS'
            } else if (
              profile.area ===
                'FARMACIAS' &&
              row.has_supervisor_structure
            ) {
              navigationMode =
                'HIERARCHY'
            }

            return {
              name:
                normalizeStateName(
                  row.estado,
                ),

              unitsCount:
                Number(
                  row.units_count ??
                  0,
                ),

              navigationMode,
            }
          },
        )

      return res.json({
        profile: {
          id:
            profile.id,

          name:
            profile.nombre,

          area:
            profile.area,

          currentArea:
            profile.current_area,

          role:
            profile.rol,

          systemRole:
            profile.system_role,

          allowedAreas:
            profile.allowed_areas,

          legacyArea:
            profile.legacy_area,

          legacyRole:
            profile.legacy_rol,

          superiorId:
            profile.superior_id,

          pharmacyScopeMode:
            profile.pharmacy_scope_mode,

          active:
            profile.activo,
        },

        states,

        capabilities:
          buildCapabilities(
            profile,
          ),
      })
    } catch (
      error
    ) {
      console.error(
        '[web][context]',
        error,
      )

      return res
        .status(
          500,
        )
        .json({
          error:
            'No fue posible obtener el contexto web',

          code:
            'WEB_CONTEXT_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * GET
 * /api/web/structure/coordinators/:coordinatorId/supervisors
 * ?state=Jalisco
 *
 * Devuelve:
 * - supervisores directos
 * - total territorial
 * - con supervisor
 * - sin supervisor
 * ============================================================
 */
router.get(
  '/structure/coordinators/:coordinatorId/supervisors',
  async (
    req,
    res,
  ) => {
    const coordinatorId =
      normalizeOptionalText(
        req.params.coordinatorId,
      )

    const requestedState =
      normalizeOptionalText(
        req.query.state,
      )

    if (
      !coordinatorId ||
      !UUID_PATTERN.test(
        coordinatorId,
      )
    ) {
      return res
        .status(
          400,
        )
        .json({
          error:
            'El identificador del coordinador no es válido',

          code:
            'INVALID_COORDINATOR_ID',
        })
    }

    if (
      !requestedState
    ) {
      return res
        .status(
          400,
        )
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
          requestedState,
        )

      if (
        !authorizedState
      ) {
        return res
          .status(
            403,
          )
          .json({
            error:
              'No tienes acceso a este estado',

            code:
              'STATE_NOT_ALLOWED',
          })
      }

      if (
        req.profile.area !==
        'FARMACIAS'
      ) {
        return res
          .status(
            403,
          )
          .json({
            error:
              'Esta estructura solo está disponible para Farmacias',

            code:
              'WEB_AREA_NOT_SUPPORTED',
          })
      }

      const isAdmin =
        req.profile.system_role ===
        'ADMIN'

      if (
        !isAdmin &&
        req.profile.rol ===
          'GERENTE'
      ) {
        const allowed =
          await managerCanAccessCoordinator(
            req.profile.id,
            coordinatorId,
          )

        if (
          !allowed
        ) {
          return res
            .status(
              403,
            )
            .json({
              error:
                'El coordinador no pertenece a la estructura del gerente',

              code:
                'COORDINATOR_NOT_ALLOWED',
            })
        }
      } else if (
        !isAdmin &&
        req.profile.rol ===
          'COORDINADOR'
      ) {
        if (
          coordinatorId !==
          req.profile.id
        ) {
          return res
            .status(
              403,
            )
            .json({
              error:
                'No puedes consultar otro coordinador',

              code:
                'COORDINATOR_NOT_ALLOWED',
            })
        }
      } else if (
        !isAdmin &&
        ![
          'GERENTE',
          'COORDINADOR',
        ].includes(
          req.profile.rol,
        )
      ) {
        return res
          .status(
            403,
          )
          .json({
            error:
              'Tu rol no puede consultar esta estructura',

            code:
              'WEB_ROLE_NOT_SUPPORTED',
          })
      }

      const supervisors =
        await getDirectSupervisors(
          coordinatorId,
          authorizedState,
        )

      const territoryResult =
        await pool.query(
          `
          SELECT
            COUNT(
              DISTINCT farmacia.id
            ) AS units_count,

            COUNT(
              DISTINCT farmacia.id
            ) FILTER (
              WHERE supervisor_assignment.id
                    IS NOT NULL
            ) AS assigned_units_count,

            COUNT(
              DISTINCT farmacia.id
            ) FILTER (
              WHERE supervisor_assignment.id
                    IS NULL
            ) AS unassigned_units_count

          FROM public.pharmacy_coordinator_assignment territory

          INNER JOIN public.farmacia farmacia
            ON farmacia.id =
               territory.pharmacy_id

          LEFT JOIN public.pharmacy_supervisor_assignment supervisor_assignment
            ON supervisor_assignment.pharmacy_id =
               farmacia.id

           AND supervisor_assignment.revoked_at
               IS NULL

          WHERE territory.coordinator_id =
                $1

            AND territory.revoked_at
                IS NULL

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
                $2
              )
            )
          `,
          [
            coordinatorId,
            authorizedState,
          ],
        )

      const territory =
        territoryResult.rows[0]

      return res.json({
        state:
          normalizeStateName(
            authorizedState,
          ),

        coordinatorId,

        supervisorsCount:
          supervisors.length,

        unitsCount:
          Number(
            territory?.units_count ??
            0,
          ),

        assignedUnitsCount:
          Number(
            territory?.assigned_units_count ??
            0,
          ),

        unassignedUnitsCount:
          Number(
            territory?.unassigned_units_count ??
            0,
          ),

        supervisors,
      })
    } catch (
      error
    ) {
      console.error(
        '[web][coordinator-supervisors]',
        error,
      )

      return res
        .status(
          500,
        )
        .json({
          error:
            'No fue posible obtener los supervisores del coordinador',

          code:
            'COORDINATOR_SUPERVISORS_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * GET /api/web/structure?state=Jalisco
 * ============================================================
 */
router.get(
  '/structure',
  async (
    req,
    res,
  ) => {
    const requestedState =
      normalizeOptionalText(
        req.query.state,
      )

    if (
      !requestedState
    ) {
      return res
        .status(
          400,
        )
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
          requestedState,
        )

      if (
        !authorizedState
      ) {
        return res
          .status(
            403,
          )
          .json({
            error:
              'No tienes acceso a este estado',

            code:
              'STATE_NOT_ALLOWED',
          })
      }

      if (
        req.profile.area ===
        'OPERACIONES'
      ) {
        return await sendOperationsStructure(
          req,
          res,
          authorizedState,
        )
      }

      if (
        req.profile.area !==
        'FARMACIAS'
      ) {
        return res
          .status(
            403,
          )
          .json({
            error:
              'El área del usuario no tiene una estructura web disponible',

            code:
              'WEB_AREA_NOT_SUPPORTED',
          })
      }

      if (
        req.profile.rol ===
        'GERENTE'
      ) {
        return await sendManagerStructure(
          req,
          res,
          authorizedState,
        )
      }

      if (
        req.profile.rol ===
        'COORDINADOR'
      ) {
        return await sendCoordinatorStructure(
          req,
          res,
          authorizedState,
        )
      }

      if (
        req.profile.rol ===
        'SUPERVISOR'
      ) {
        return await sendSupervisorStructure(
          req,
          res,
          authorizedState,
        )
      }

      return res
        .status(
          403,
        )
        .json({
          error:
            'El rol no tiene acceso a esta estructura',

          code:
            'WEB_ROLE_NOT_SUPPORTED',
        })
    } catch (
      error
    ) {
      console.error(
        '[web][structure]',
        error,
      )

      return res
        .status(
          500,
        )
        .json({
          error:
            'No fue posible obtener la estructura operativa',

          code:
            'WEB_STRUCTURE_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * GET /api/web/units
 *
 * FARMACIAS:
 *
 * /api/web/units?state=Jalisco
 *
 * /api/web/units
 * ?state=Jalisco
 * &coordinatorId=UUID
 *
 * /api/web/units
 * ?state=Jalisco
 * &coordinatorId=UUID
 * &assignmentStatus=ALL
 *
 * /api/web/units
 * ?state=Jalisco
 * &coordinatorId=UUID
 * &assignmentStatus=ASSIGNED
 *
 * /api/web/units
 * ?state=Jalisco
 * &coordinatorId=UUID
 * &assignmentStatus=UNASSIGNED
 *
 * /api/web/units
 * ?state=Jalisco
 * &supervisorId=UUID
 *
 * OPERACIONES:
 *
 * /api/web/units
 * ?state=Jalisco
 * &region=01 - COLOTLÁN
 * ============================================================
 */
router.get(
  '/units',
  async (
    req,
    res,
  ) => {
    const requestedState =
      normalizeOptionalText(
        req.query.state,
      )

    if (
      !requestedState
    ) {
      return res
        .status(
          400,
        )
        .json({
          error:
            'Debes indicar el estado',

          code:
            'STATE_REQUIRED',
        })
    }

    const coordinatorId =
      normalizeOptionalText(
        req.query.coordinatorId,
      )

    const supervisorId =
      normalizeOptionalText(
        req.query.supervisorId,
      )

    const region =
      normalizeOptionalText(
        req.query.region,
      )

    const assignmentStatus =
      normalizeOptionalText(
        req.query.assignmentStatus,
      )
        ?.toUpperCase() ??
      null

    if (
      assignmentStatus &&
      ![
        'ALL',
        'ASSIGNED',
        'UNASSIGNED',
      ].includes(
        assignmentStatus,
      )
    ) {
      return res
        .status(
          400,
        )
        .json({
          error:
            'El estado de asignación no es válido',

          code:
            'INVALID_ASSIGNMENT_STATUS',
        })
    }

    if (
      coordinatorId &&
      !UUID_PATTERN.test(
        coordinatorId,
      )
    ) {
      return res
        .status(
          400,
        )
        .json({
          error:
            'El identificador del coordinador no es válido',

          code:
            'INVALID_COORDINATOR_ID',
        })
    }

    if (
      supervisorId &&
      !UUID_PATTERN.test(
        supervisorId,
      )
    ) {
      return res
        .status(
          400,
        )
        .json({
          error:
            'El identificador del supervisor no es válido',

          code:
            'INVALID_SUPERVISOR_ID',
        })
    }

    if (
      coordinatorId &&
      supervisorId
    ) {
      return res
        .status(
          400,
        )
        .json({
          error:
            'No puedes filtrar simultáneamente por coordinador y supervisor',

          code:
            'INVALID_STRUCTURE_FILTER',
        })
    }

    try {
      const authorizedState =
        await getAuthorizedState(
          req.profile.id,
          requestedState,
        )

      if (
        !authorizedState
      ) {
        return res
          .status(
            403,
          )
          .json({
            error:
              'No tienes acceso a este estado',

            code:
              'STATE_NOT_ALLOWED',
          })
      }

      const result =
        await getAuthorizedUnits({
          profile:
            req.profile,

          state:
            authorizedState,

          coordinatorId,

          supervisorId,

          region,

          assignmentStatus,
        })

      return res.json(
        result,
      )
    } catch (
      error
    ) {
      if (
        error?.status &&
        error?.code
      ) {
        return res
          .status(
            error.status,
          )
          .json({
            error:
              error.message,

            code:
              error.code,
          })
      }

      console.error(
        '[web][units]',
        error,
      )

      return res
        .status(
          500,
        )
        .json({
          error:
            'No fue posible obtener las unidades',

          code:
            'WEB_UNITS_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * ESTRUCTURA OPERACIONES
 * ============================================================
 */
async function sendOperationsStructure(
  req,
  res,
  state,
) {
  const result =
    await pool.query(
      `
      SELECT
        region_sanitaria,

        COUNT(*) AS units_count

      FROM public.farmacia

      WHERE UPPER(
        BTRIM(
          COALESCE(
            estado,
            ''
          )
        )
      ) =
      UPPER(
        BTRIM(
          $1
        )
      )

      GROUP BY
        region_sanitaria

      ORDER BY
        region_sanitaria ASC
        NULLS LAST
      `,
      [
        state,
      ],
    )

  return res.json({
    state:
      normalizeStateName(
        state,
      ),

    mode:
      'JURISDICTIONS',

    jurisdictions:
      result.rows.map(
        (
          row,
        ) => ({
          name:
            row.region_sanitaria ??
            'Sin jurisdicción',

          unitsCount:
            Number(
              row.units_count ??
              0,
            ),
        }),
      ),
  })
}

/**
 * ============================================================
 * ESTRUCTURA GERENTE
 * ============================================================
 */
async function sendManagerStructure(
  req,
  res,
  state,
) {
  const managerId =
    req.profile.id

  const isAdmin =
    req.profile.system_role ===
    'ADMIN'

  const coordinatorsResult =
    await pool.query(
      `
      WITH scoped_supervisors AS (
        SELECT
          supervisor.id,
          supervisor.nombre,
          supervisor.superior_id

        FROM public.personas supervisor

        INNER JOIN public.person_state_scope supervisor_scope
          ON supervisor_scope.persona_id =
             supervisor.id

         AND supervisor_scope.revoked_at
             IS NULL

         AND UPPER(
           BTRIM(
             supervisor_scope.estado
           )
         ) =
         UPPER(
           BTRIM(
             $2
           )
         )

        WHERE supervisor.area =
              'FARMACIAS'

          AND supervisor.rol =
              'SUPERVISOR'

          AND supervisor.activo =
              TRUE
      ),

      supervisor_counts AS (
        SELECT
          supervisor.superior_id
            AS coordinator_id,

          COUNT(
            DISTINCT supervisor.id
          ) AS supervisors_count

        FROM scoped_supervisors supervisor

        WHERE supervisor.superior_id
              IS NOT NULL

        GROUP BY
          supervisor.superior_id
      ),

      territory_counts AS (
        SELECT
          territory.coordinator_id,

          COUNT(
            DISTINCT farmacia.id
          ) AS units_count,

          COUNT(
            DISTINCT farmacia.id
          ) FILTER (
            WHERE supervisor_assignment.id
                  IS NOT NULL
          ) AS assigned_units_count,

          COUNT(
            DISTINCT farmacia.id
          ) FILTER (
            WHERE supervisor_assignment.id
                  IS NULL
          ) AS unassigned_units_count

        FROM public.pharmacy_coordinator_assignment territory

        INNER JOIN public.farmacia farmacia
          ON farmacia.id =
             territory.pharmacy_id

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
             $2
           )
         )

        LEFT JOIN public.pharmacy_supervisor_assignment supervisor_assignment
          ON supervisor_assignment.pharmacy_id =
             farmacia.id

         AND supervisor_assignment.revoked_at
             IS NULL

        WHERE territory.revoked_at
              IS NULL

        GROUP BY
          territory.coordinator_id
      )

      SELECT
        coordinator.id,
        coordinator.nombre,

        COALESCE(
          supervisor_counts.supervisors_count,
          0
        ) AS supervisors_count,

        COALESCE(
          territory_counts.units_count,
          0
        ) AS units_count,

        COALESCE(
          territory_counts.assigned_units_count,
          0
        ) AS assigned_units_count,

        COALESCE(
          territory_counts.unassigned_units_count,
          0
        ) AS unassigned_units_count

      FROM public.personas coordinator

      LEFT JOIN supervisor_counts
        ON supervisor_counts.coordinator_id =
           coordinator.id

      LEFT JOIN territory_counts
        ON territory_counts.coordinator_id =
           coordinator.id

      WHERE coordinator.area =
            'FARMACIAS'

        AND coordinator.rol =
            'COORDINADOR'

        AND coordinator.activo =
            TRUE

        AND (
          $3::boolean = TRUE
          OR coordinator.superior_id =
             $1
        )

        AND (
          EXISTS (
            SELECT 1

            FROM public.person_state_scope coordinator_scope

            WHERE coordinator_scope.persona_id =
                  coordinator.id

              AND coordinator_scope.revoked_at
                  IS NULL

              AND UPPER(
                BTRIM(
                  coordinator_scope.estado
                )
              ) =
              UPPER(
                BTRIM(
                  $2
                )
              )
          )

          OR EXISTS (
            SELECT 1

            FROM public.pharmacy_coordinator_assignment territory_check

            INNER JOIN public.farmacia farmacia_check
              ON farmacia_check.id =
                 territory_check.pharmacy_id

            WHERE territory_check.coordinator_id =
                  coordinator.id

              AND territory_check.revoked_at
                  IS NULL

              AND UPPER(
                BTRIM(
                  COALESCE(
                    farmacia_check.estado,
                    ''
                  )
                )
              ) =
              UPPER(
                BTRIM(
                  $2
                )
              )
          )

          OR EXISTS (
            SELECT 1

            FROM scoped_supervisors supervisor_check

            WHERE supervisor_check.superior_id =
                  coordinator.id
          )
        )

      ORDER BY
        coordinator.nombre ASC
      `,
      [
        managerId,
        state,
        isAdmin,
      ],
    )

  const directSupervisorsResult =
    isAdmin
      ? await getGlobalDirectSupervisors(
          state,
        )
      : await getDirectSupervisors(
          managerId,
          state,
        )

  const totalsResult =
    await pool.query(
      `
      SELECT
        COUNT(
          DISTINCT farmacia.id
        ) AS registered_units_count,

        COUNT(
          DISTINCT farmacia.id
        ) FILTER (
          WHERE EXISTS (
            SELECT 1

            FROM public.pharmacy_coordinator_assignment territory

            WHERE territory.pharmacy_id =
                  farmacia.id

              AND territory.revoked_at
                  IS NULL
          )
        ) AS operational_units_count,

        COUNT(
          DISTINCT farmacia.id
        ) FILTER (
          WHERE EXISTS (
            SELECT 1

            FROM public.pharmacy_supervisor_assignment supervisor_assignment

            WHERE supervisor_assignment.pharmacy_id =
                  farmacia.id

              AND supervisor_assignment.revoked_at
                  IS NULL
          )
        ) AS assigned_units_count,

        COUNT(
          DISTINCT farmacia.id
        ) FILTER (
          WHERE EXISTS (
            SELECT 1

            FROM public.pharmacy_coordinator_assignment territory

            WHERE territory.pharmacy_id =
                  farmacia.id

              AND territory.revoked_at
                  IS NULL
          )

          AND NOT EXISTS (
            SELECT 1

            FROM public.pharmacy_supervisor_assignment supervisor_assignment

            WHERE supervisor_assignment.pharmacy_id =
                  farmacia.id

              AND supervisor_assignment.revoked_at
                  IS NULL
          )
        ) AS unassigned_units_count,

        COUNT(
          DISTINCT farmacia.id
        ) FILTER (
          WHERE farmacia.estatus::text =
                'INACTIVA'
        ) AS inactive_units_count,

        COUNT(
          DISTINCT farmacia.id
        ) FILTER (
          WHERE NOT EXISTS (
            SELECT 1

            FROM public.pharmacy_coordinator_assignment territory

            WHERE territory.pharmacy_id =
                  farmacia.id

              AND territory.revoked_at
                  IS NULL
          )

          AND COALESCE(
            farmacia.estatus::text,
            ''
          ) <>
          'INACTIVA'
        ) AS unclassified_units_count

      FROM public.farmacia farmacia

      WHERE UPPER(
        BTRIM(
          COALESCE(
            farmacia.estado,
            ''
          )
        )
      ) =
      UPPER(
        BTRIM(
          $1
        )
      )
      `,
      [
        state,
      ],
    )

  const totals =
    totalsResult.rows[0]

  return res.json({
    state:
      normalizeStateName(
        state,
      ),

    mode:
      'MANAGER',

    accessMode:
      isAdmin
        ? 'ADMIN'
        : 'MANAGER',

    totals: {
      unitsCount:
        Number(
          totals
            ?.registered_units_count ??
          0,
        ),

      registeredUnitsCount:
        Number(
          totals
            ?.registered_units_count ??
          0,
        ),

      operationalUnitsCount:
        Number(
          totals
            ?.operational_units_count ??
          0,
        ),

      assignedUnitsCount:
        Number(
          totals
            ?.assigned_units_count ??
          0,
        ),

      unassignedUnitsCount:
        Number(
          totals
            ?.unassigned_units_count ??
          0,
        ),

      inactiveUnitsCount:
        Number(
          totals
            ?.inactive_units_count ??
          0,
        ),

      unclassifiedUnitsCount:
        Number(
          totals
            ?.unclassified_units_count ??
          0,
        ),
    },

    coordinators:
      coordinatorsResult.rows.map(
        (
          row,
        ) => ({
          id:
            row.id,

          name:
            row.nombre,

          supervisorsCount:
            Number(
              row.supervisors_count ??
              0,
            ),

          unitsCount:
            Number(
              row.units_count ??
              0,
            ),

          assignedUnitsCount:
            Number(
              row.assigned_units_count ??
              0,
            ),

          unassignedUnitsCount:
            Number(
              row.unassigned_units_count ??
              0,
            ),
        }),
      ),

    directSupervisors:
      directSupervisorsResult,
  })
}

/**
 * ============================================================
 * ESTRUCTURA COORDINADOR
 * ============================================================
 */
async function sendCoordinatorStructure(
  req,
  res,
  state,
) {
  const coordinatorId =
    req.profile.id

  const supervisors =
    await getDirectSupervisors(
      coordinatorId,
      state,
    )

  const territoryResult =
    await pool.query(
      `
      SELECT
        COUNT(
          DISTINCT farmacia.id
        ) AS units_count,

        COUNT(
          DISTINCT farmacia.id
        ) FILTER (
          WHERE supervisor_assignment.id
                IS NOT NULL
        ) AS assigned_units_count,

        COUNT(
          DISTINCT farmacia.id
        ) FILTER (
          WHERE supervisor_assignment.id
                IS NULL
        ) AS unassigned_units_count

      FROM public.pharmacy_coordinator_assignment territory

      INNER JOIN public.farmacia farmacia
        ON farmacia.id =
           territory.pharmacy_id

      LEFT JOIN public.pharmacy_supervisor_assignment supervisor_assignment
        ON supervisor_assignment.pharmacy_id =
           farmacia.id

       AND supervisor_assignment.revoked_at
           IS NULL

      WHERE territory.coordinator_id =
            $1

        AND territory.revoked_at
            IS NULL

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
            $2
          )
        )
      `,
      [
        coordinatorId,
        state,
      ],
    )

  const territory =
    territoryResult.rows[0]

  return res.json({
    state:
      normalizeStateName(
        state,
      ),

    mode:
      'COORDINATOR',

    totals: {
      supervisorsCount:
        supervisors.length,

      unitsCount:
        Number(
          territory?.units_count ??
          0,
        ),

      assignedUnitsCount:
        Number(
          territory?.assigned_units_count ??
          0,
        ),

      unassignedUnitsCount:
        Number(
          territory?.unassigned_units_count ??
          0,
        ),
    },

    supervisors,
  })
}

/**
 * ============================================================
 * ESTRUCTURA SUPERVISOR
 * ============================================================
 */
async function sendSupervisorStructure(
  req,
  res,
  state,
) {
  const result =
    await pool.query(
      `
      SELECT
        supervisor.id,
        supervisor.nombre,
        supervisor.pharmacy_scope_mode,

        COUNT(
          DISTINCT farmacia.id
        ) AS assigned_units_count

      FROM public.personas supervisor

      LEFT JOIN public.pharmacy_supervisor_assignment assignment
        ON assignment.supervisor_id =
           supervisor.id

       AND assignment.revoked_at
           IS NULL

      LEFT JOIN public.farmacia farmacia
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
           $2
         )
       )

      WHERE supervisor.id =
            $1

      GROUP BY
        supervisor.id,
        supervisor.nombre,
        supervisor.pharmacy_scope_mode
      `,
      [
        req.profile.id,
        state,
      ],
    )

  const supervisor =
    result.rows[0]

  return res.json({
    state:
      normalizeStateName(
        state,
      ),

    mode:
      'SUPERVISOR',

    supervisor: {
      id:
        supervisor?.id ??
        req.profile.id,

      name:
        supervisor?.nombre ??
        req.profile.nombre,

      pharmacyScopeMode:
        supervisor
          ?.pharmacy_scope_mode ??
        req.profile
          .pharmacy_scope_mode,

      assignedUnitsCount:
        Number(
          supervisor
            ?.assigned_units_count ??
          0,
        ),
    },
  })
}

/**
 * ============================================================
 * SUPERVISORES DIRECTOS
 * ============================================================
 */
async function getDirectSupervisors(
  superiorId,
  state,
) {
  const result =
    await pool.query(
      `
      SELECT
        supervisor.id,
        supervisor.nombre,
        supervisor.pharmacy_scope_mode,

        COUNT(
          DISTINCT farmacia.id
        ) AS units_count

      FROM public.personas supervisor

      INNER JOIN public.person_state_scope supervisor_scope
        ON supervisor_scope.persona_id =
           supervisor.id

       AND supervisor_scope.revoked_at
           IS NULL

       AND UPPER(
         BTRIM(
           supervisor_scope.estado
         )
       ) =
       UPPER(
         BTRIM(
           $2
         )
       )

      LEFT JOIN public.pharmacy_supervisor_assignment assignment
        ON assignment.supervisor_id =
           supervisor.id

       AND assignment.revoked_at
           IS NULL

      LEFT JOIN public.farmacia farmacia
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
           $2
         )
       )

      WHERE supervisor.area =
            'FARMACIAS'

        AND supervisor.rol =
            'SUPERVISOR'

        AND supervisor.activo =
            TRUE

        AND supervisor.superior_id =
            $1

      GROUP BY
        supervisor.id,
        supervisor.nombre,
        supervisor.pharmacy_scope_mode

      ORDER BY
        supervisor.nombre ASC
      `,
      [
        superiorId,
        state,
      ],
    )

  return result.rows.map(
    (
      row,
    ) => ({
      id:
        row.id,

      name:
        row.nombre,

      pharmacyScopeMode:
        row.pharmacy_scope_mode,

      unitsCount:
        Number(
          row.units_count ??
          0,
        ),
    }),
  )
}

/**
 * ============================================================
 * SUPERVISORES DIRECTOS GLOBALES PARA ADMIN
 * ============================================================
 */
async function getGlobalDirectSupervisors(
  state,
) {
  const result =
    await pool.query(
      `
      SELECT
        supervisor.id,
        supervisor.nombre,
        supervisor.pharmacy_scope_mode,

        COUNT(
          DISTINCT farmacia.id
        ) AS units_count

      FROM public.personas supervisor

      INNER JOIN public.person_state_scope supervisor_scope
        ON supervisor_scope.persona_id =
           supervisor.id

       AND supervisor_scope.revoked_at
           IS NULL

       AND UPPER(
         BTRIM(
           supervisor_scope.estado
         )
       ) =
       UPPER(
         BTRIM(
           $1
         )
       )

      LEFT JOIN public.pharmacy_supervisor_assignment assignment
        ON assignment.supervisor_id =
           supervisor.id

       AND assignment.revoked_at
           IS NULL

      LEFT JOIN public.farmacia farmacia
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
           $1
         )
       )

      LEFT JOIN public.personas superior
        ON superior.id =
           supervisor.superior_id

      WHERE supervisor.area =
            'FARMACIAS'

        AND supervisor.rol =
            'SUPERVISOR'

        AND supervisor.activo =
            TRUE

        AND (
          supervisor.superior_id
            IS NULL

          OR superior.id
            IS NULL

          OR superior.area <>
             'FARMACIAS'

          OR superior.rol <>
             'COORDINADOR'
        )

      GROUP BY
        supervisor.id,
        supervisor.nombre,
        supervisor.pharmacy_scope_mode

      ORDER BY
        supervisor.nombre ASC
      `,
      [
        state,
      ],
    )

  return result.rows.map(
    (
      row,
    ) => ({
      id:
        row.id,

      name:
        row.nombre,

      pharmacyScopeMode:
        row.pharmacy_scope_mode,

      unitsCount:
        Number(
          row.units_count ??
          0,
        ),
    }),
  )
}

/**
 * ============================================================
 * AUTORIZACIÓN Y FILTRADO DE UNIDADES
 * ============================================================
 */
async function getAuthorizedUnits({
  profile,
  state,
  coordinatorId,
  supervisorId,
  region,
  assignmentStatus,
}) {
  const conditions = [
    `
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
        $1
      )
    )
    `,
  ]

  const params = [
    state,
  ]

  /**
   * ----------------------------------------------------------
   * OPERACIONES
   * ----------------------------------------------------------
   */
  if (
    profile.area ===
    'OPERACIONES'
  ) {
    if (
      region
    ) {
      params.push(
        region,
      )

      conditions.push(
        `
        farmacia.region_sanitaria =
          $${params.length}
        `,
      )
    }

    return executeUnitsQuery({
      conditions,
      params,
      state,

      scope: {
        type:
          region
            ? 'JURISDICTION'
            : 'STATE',

        region:
          region ??
          null,
      },
    })
  }

  if (
    profile.area !==
    'FARMACIAS'
  ) {
    throw createHttpError(
      403,
      'El área del usuario no puede consultar unidades',
      'WEB_UNITS_AREA_NOT_ALLOWED',
    )
  }

    /**
   * ----------------------------------------------------------
   * ADMIN TRANSVERSAL EN FARMACIAS
   * ----------------------------------------------------------
   */
  if (
    profile.system_role ===
    'ADMIN'
  ) {
    if (
      supervisorId
    ) {
      params.push(
        supervisorId,
      )

      conditions.push(
        `
        EXISTS (
          SELECT 1

          FROM public.pharmacy_supervisor_assignment assignment_filter

          WHERE assignment_filter.pharmacy_id =
                farmacia.id

            AND assignment_filter.supervisor_id =
                $${params.length}

            AND assignment_filter.revoked_at
                IS NULL
        )
        `,
      )

      return executeUnitsQuery({
        conditions,
        params,
        state,

        scope: {
          type:
            'SUPERVISOR',

          supervisorId,
        },
      })
    }

    if (
      coordinatorId
    ) {
      params.push(
        coordinatorId,
      )

      conditions.push(
        `
        EXISTS (
          SELECT 1

          FROM public.pharmacy_coordinator_assignment territory_filter

          WHERE territory_filter.pharmacy_id =
                farmacia.id

            AND territory_filter.coordinator_id =
                $${params.length}

            AND territory_filter.revoked_at
                IS NULL
        )
        `,
      )

      addAssignmentStatusCondition({
        conditions,
        assignmentStatus,
      })

      return executeUnitsQuery({
        conditions,
        params,
        state,

        scope: {
          type:
            'COORDINATOR',

          coordinatorId,

          assignmentStatus:
            assignmentStatus ??
            'ALL',
        },
      })
    }

    return executeUnitsQuery({
      conditions,
      params,
      state,

      scope: {
        type:
          'STATE',
      },
    })
  }

  /**
   * ----------------------------------------------------------
   * GERENTE
   * ----------------------------------------------------------
   */
  if (
    profile.rol ===
    'GERENTE'
  ) {
    /**
     * Supervisor específico.
     */
    if (
      supervisorId
    ) {
      const allowed =
        await managerCanAccessSupervisor(
          profile.id,
          supervisorId,
          state,
        )

      if (
        !allowed
      ) {
        throw createHttpError(
          403,
          'El supervisor no pertenece a la estructura del gerente',
          'SUPERVISOR_NOT_ALLOWED',
        )
      }

      params.push(
        supervisorId,
      )

      conditions.push(
        `
        EXISTS (
          SELECT 1

          FROM public.pharmacy_supervisor_assignment assignment_filter

          WHERE assignment_filter.pharmacy_id =
                farmacia.id

            AND assignment_filter.supervisor_id =
                $${params.length}

            AND assignment_filter.revoked_at
                IS NULL
        )
        `,
      )

      return executeUnitsQuery({
        conditions,
        params,
        state,

        scope: {
          type:
            'SUPERVISOR',

          supervisorId,
        },
      })
    }

    /**
     * Coordinador específico.
     *
     * IMPORTANTE:
     * Se consulta pharmacy_coordinator_assignment,
     * no la jerarquía de supervisor.
     *
     * Esto permite incluir las unidades VACANTE.
     */
    if (
      coordinatorId
    ) {
      const allowed =
        await managerCanAccessCoordinator(
          profile.id,
          coordinatorId,
        )

      if (
        !allowed
      ) {
        throw createHttpError(
          403,
          'El coordinador no pertenece a la estructura del gerente',
          'COORDINATOR_NOT_ALLOWED',
        )
      }

      params.push(
        coordinatorId,
      )

      conditions.push(
        `
        EXISTS (
          SELECT 1

          FROM public.pharmacy_coordinator_assignment territory_filter

          WHERE territory_filter.pharmacy_id =
                farmacia.id

            AND territory_filter.coordinator_id =
                $${params.length}

            AND territory_filter.revoked_at
                IS NULL
        )
        `,
      )

      addAssignmentStatusCondition({
        conditions,
        assignmentStatus,
      })

      return executeUnitsQuery({
        conditions,
        params,
        state,

        scope: {
          type:
            'COORDINATOR',

          coordinatorId,

          assignmentStatus:
            assignmentStatus ??
            'ALL',
        },
      })
    }

    /**
     * Gerente sin filtro:
     * estado completo autorizado.
     */
    return executeUnitsQuery({
      conditions,
      params,
      state,

      scope: {
        type:
          'STATE',
      },
    })
  }

  /**
   * ----------------------------------------------------------
   * COORDINADOR
   * ----------------------------------------------------------
   */
  if (
    profile.rol ===
    'COORDINADOR'
  ) {
    /**
     * Un coordinador no puede enviar coordinatorId
     * para intentar consultar otro coordinador.
     */
    if (
      coordinatorId
    ) {
      throw createHttpError(
        400,
        'Un coordinador no puede consultar otro coordinador mediante este filtro',
        'COORDINATOR_FILTER_NOT_ALLOWED',
      )
    }

    /**
     * Supervisor específico perteneciente
     * al coordinador.
     */
    if (
      supervisorId
    ) {
      const allowed =
        await coordinatorCanAccessSupervisor(
          profile.id,
          supervisorId,
          state,
        )

      if (
        !allowed
      ) {
        throw createHttpError(
          403,
          'El supervisor no pertenece a la estructura del coordinador',
          'SUPERVISOR_NOT_ALLOWED',
        )
      }

      params.push(
        supervisorId,
      )

      conditions.push(
        `
        EXISTS (
          SELECT 1

          FROM public.pharmacy_supervisor_assignment assignment_filter

          WHERE assignment_filter.pharmacy_id =
                farmacia.id

            AND assignment_filter.supervisor_id =
                $${params.length}

            AND assignment_filter.revoked_at
                IS NULL
        )
        `,
      )

      return executeUnitsQuery({
        conditions,
        params,
        state,

        scope: {
          type:
            'SUPERVISOR',

          supervisorId,
        },
      })
    }

    /**
     * Coordinador sin supervisor seleccionado:
     * TODO SU TERRITORIO FORMAL.
     *
     * Esto incluye unidades sin supervisor.
     */
    params.push(
      profile.id,
    )

    conditions.push(
      `
      EXISTS (
        SELECT 1

        FROM public.pharmacy_coordinator_assignment territory_filter

        WHERE territory_filter.pharmacy_id =
              farmacia.id

          AND territory_filter.coordinator_id =
              $${params.length}

          AND territory_filter.revoked_at
              IS NULL
      )
      `,
    )

    addAssignmentStatusCondition({
      conditions,
      assignmentStatus,
    })

    return executeUnitsQuery({
      conditions,
      params,
      state,

      scope: {
        type:
          'COORDINATOR',

        coordinatorId:
          profile.id,

        assignmentStatus:
          assignmentStatus ??
          'ALL',
      },
    })
  }

  /**
   * ----------------------------------------------------------
   * SUPERVISOR
   * ----------------------------------------------------------
   */
  if (
    profile.rol ===
    'SUPERVISOR'
  ) {
    if (
      coordinatorId ||
      supervisorId
    ) {
      throw createHttpError(
        403,
        'El supervisor no puede consultar la estructura de otros usuarios',
        'STRUCTURE_FILTER_NOT_ALLOWED',
      )
    }

    if (
      profile.pharmacy_scope_mode ===
      'ASSIGNED_ONLY'
    ) {
      params.push(
        profile.id,
      )

      conditions.push(
        `
        EXISTS (
          SELECT 1

          FROM public.pharmacy_supervisor_assignment assignment_filter

          WHERE assignment_filter.pharmacy_id =
                farmacia.id

            AND assignment_filter.supervisor_id =
                $${params.length}

            AND assignment_filter.revoked_at
                IS NULL
        )
        `,
      )
    }

    return executeUnitsQuery({
      conditions,
      params,
      state,

      scope: {
        type:
          'SUPERVISOR',

        supervisorId:
          profile.id,

        pharmacyScopeMode:
          profile.pharmacy_scope_mode,
      },
    })
  }

  throw createHttpError(
    403,
    'El rol no puede consultar unidades desde esta vista',
    'WEB_UNITS_ROLE_NOT_ALLOWED',
  )
}

/**
 * ============================================================
 * CONSULTA FINAL DE UNIDADES
 *
 * Devuelve:
 * - farmacia
 * - supervisor activo
 * - coordinador/territorio activo
 * ============================================================
 */
async function executeUnitsQuery({
  conditions,
  params,
  state,
  scope,
}) {
  const result =
    await pool.query(
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

        farmacia.latitud::double precision
          AS latitud,

        farmacia.longitud::double precision
          AS longitud,

        farmacia.estado,
        farmacia.proyecto,

        assignment.id
          AS assignment_id,

        assignment.supervisor_id
          AS assigned_supervisor_id,

        supervisor.nombre
          AS assigned_supervisor_name,

        coordinator_assignment.id
          AS coordinator_assignment_id,

        coordinator_assignment.coordinator_id
          AS assigned_coordinator_id,

        coordinator.nombre
          AS assigned_coordinator_name

      FROM public.farmacia farmacia

      LEFT JOIN public.pharmacy_supervisor_assignment assignment
        ON assignment.pharmacy_id =
           farmacia.id

       AND assignment.revoked_at
           IS NULL

      LEFT JOIN public.personas supervisor
        ON supervisor.id =
           assignment.supervisor_id

      LEFT JOIN public.pharmacy_coordinator_assignment coordinator_assignment
        ON coordinator_assignment.pharmacy_id =
           farmacia.id

       AND coordinator_assignment.revoked_at
           IS NULL

      LEFT JOIN public.personas coordinator
        ON coordinator.id =
           coordinator_assignment.coordinator_id

      WHERE
        ${conditions.join(
          '\nAND ',
        )}

      ORDER BY
        farmacia.region_sanitaria
          NULLS LAST,

        farmacia.clues ASC
      `,
      params,
    )

  return {
    state:
      normalizeStateName(
        state,
      ),

    scope,

    count:
      result.rowCount,

    units:
      result.rows.map(
        mapWebUnit,
      ),
  }
}

/**
 * ============================================================
 * SEGURIDAD:
 * GERENTE → SUPERVISOR
 * ============================================================
 */
async function managerCanAccessSupervisor(
  managerId,
  supervisorId,
  state,
) {
  const result =
    await pool.query(
      `
      SELECT
        supervisor.id

      FROM public.personas supervisor

      LEFT JOIN public.personas coordinator
        ON coordinator.id =
           supervisor.superior_id

       AND coordinator.area =
           'FARMACIAS'

       AND coordinator.rol =
           'COORDINADOR'

      INNER JOIN public.person_state_scope supervisor_scope
        ON supervisor_scope.persona_id =
           supervisor.id

       AND supervisor_scope.revoked_at
           IS NULL

       AND UPPER(
         BTRIM(
           supervisor_scope.estado
         )
       ) =
       UPPER(
         BTRIM(
           $3
         )
       )

      WHERE supervisor.id =
            $2

        AND supervisor.area =
            'FARMACIAS'

        AND supervisor.rol =
            'SUPERVISOR'

        AND supervisor.activo =
            TRUE

        AND (
          supervisor.superior_id =
            $1

          OR coordinator.superior_id =
             $1
        )

      LIMIT 1
      `,
      [
        managerId,
        supervisorId,
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
 * SEGURIDAD:
 * COORDINADOR → SUPERVISOR
 * ============================================================
 */
async function coordinatorCanAccessSupervisor(
  coordinatorId,
  supervisorId,
  state,
) {
  const result =
    await pool.query(
      `
      SELECT
        supervisor.id

      FROM public.personas supervisor

      INNER JOIN public.person_state_scope supervisor_scope
        ON supervisor_scope.persona_id =
           supervisor.id

       AND supervisor_scope.revoked_at
           IS NULL

       AND UPPER(
         BTRIM(
           supervisor_scope.estado
         )
       ) =
       UPPER(
         BTRIM(
           $3
         )
       )

      WHERE supervisor.id =
            $2

        AND supervisor.superior_id =
            $1

        AND supervisor.area =
            'FARMACIAS'

        AND supervisor.rol =
            'SUPERVISOR'

        AND supervisor.activo =
            TRUE

      LIMIT 1
      `,
      [
        coordinatorId,
        supervisorId,
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
 * SEGURIDAD:
 * GERENTE → COORDINADOR
 * ============================================================
 */
async function managerCanAccessCoordinator(
  managerId,
  coordinatorId,
) {
  const result =
    await pool.query(
      `
      SELECT
        id

      FROM public.personas

      WHERE id =
            $2

        AND superior_id =
            $1

        AND area =
            'FARMACIAS'

        AND rol =
            'COORDINADOR'

        AND activo =
            TRUE

      LIMIT 1
      `,
      [
        managerId,
        coordinatorId,
      ],
    )

  return (
    result.rowCount >
    0
  )
}

/**
 * ============================================================
 * ESTADO AUTORIZADO
 * ============================================================
 */
async function getAuthorizedState(
  personaId,
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
            $2
          )
        )

      LIMIT 1
      `,
      [
        personaId,
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
 * PERFIL OPERATIVO
 * ============================================================
 */
async function loadOperationalProfile(
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
          auth_user_id,
          nombre,
          area,
          rol,
          superior_id,
          activo,
          pharmacy_scope_mode,
          system_role,
          allowed_areas,
          created_at,
          updated_at

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
        .status(
          403,
        )
        .json({
          error:
            'La cuenta no tiene un perfil operativo asignado',

          code:
            'PROFILE_NOT_FOUND',
        })
    }

    const profile =
      result.rows[0]

    if (
      !profile.activo
    ) {
      return res
        .status(
          403,
        )
        .json({
          error:
            'El perfil operativo se encuentra inactivo',

          code:
            'PROFILE_INACTIVE',
        })
    }

    const legacyArea =
      normalizeArea(
        profile.area,
      )

    const systemRole =
      normalizeSystemRole(
        profile.system_role,
      )

    const allowedAreas =
      normalizeAllowedAreas(
        profile.allowed_areas,
        legacyArea,
      )

    const requestedAreaRaw =
      req.get(
        'X-App-Area',
      ) ??
      req.query?.area ??
      null

    const requestedAreaText =
      normalizeOptionalText(
        requestedAreaRaw,
      )

    const requestedArea =
      normalizeArea(
        requestedAreaRaw,
      )

    if (
      requestedAreaText &&
      !requestedArea
    ) {
      return res
        .status(
          400,
        )
        .json({
          error:
            'El área solicitada no es válida',

          code:
            'INVALID_APP_AREA',

          allowedAreas,
        })
    }

    if (
      requestedArea &&
      !allowedAreas.includes(
        requestedArea,
      )
    ) {
      return res
        .status(
          403,
        )
        .json({
          error:
            'El área solicitada no está autorizada para este usuario',

          code:
            'AREA_NOT_ALLOWED',

          requestedArea,

          allowedAreas,
        })
    }

    const currentArea =
      requestedArea ??
      (
        legacyArea &&
        allowedAreas.includes(
          legacyArea,
        )
          ? legacyArea
          : allowedAreas[0] ??
            null
      )

    if (
      !currentArea
    ) {
      return res
        .status(
          403,
        )
        .json({
          error:
            'El perfil no tiene áreas web autorizadas',

          code:
            'PROFILE_AREA_NOT_CONFIGURED',
        })
    }

    const effectiveRole =
      resolveEffectiveRole({
        systemRole,
        currentArea,
        legacyRole:
          profile.rol,
      })

    req.profile = {
      ...profile,

      legacy_area:
        legacyArea,

      legacy_rol:
        profile.rol,

      system_role:
        systemRole,

      allowed_areas:
        allowedAreas,

      current_area:
        currentArea,

      area:
        currentArea,

      rol:
        effectiveRole,
    }

    return next()
  } catch (
    error
  ) {
    console.error(
      '[web][profile]',
      error,
    )

    return res
      .status(
        500,
      )
      .json({
        error:
          'No fue posible validar el perfil operativo',

        code:
          'PROFILE_VALIDATION_FAILED',
      })
  }
}

/**
 * ============================================================
 * MAPEO DE UNIDAD PARA WEB
 * ============================================================
 */
function mapWebUnit(
  row,
) {
  return {
    id:
      Number(
        row.id,
      ),

    clues:
      row.clues,

    unidad:
      row.unidad,

    region_sanitaria:
      row.region_sanitaria,

    estatus:
      row.estatus,

    lugar_farmacia:
      row.lugar_farmacia,

    direccion:
      row.direccion,

    latitud:
      toNullableNumber(
        row.latitud,
      ),

    longitud:
      toNullableNumber(
        row.longitud,
      ),

    estado:
      row.estado,

    proyecto:
      row.proyecto,

    /**
     * Supervisor
     */
    assignmentId:
      row.assignment_id,

    assignedSupervisorId:
      row.assigned_supervisor_id,

    assignedSupervisorName:
      row.assigned_supervisor_name,

    /**
     * Coordinador / territorio
     */
    coordinatorAssignmentId:
      row.coordinator_assignment_id,

    assignedCoordinatorId:
      row.assigned_coordinator_id,

    assignedCoordinatorName:
      row.assigned_coordinator_name,
  }
}

/**
 * ============================================================
 * CAPACIDADES
 * ============================================================
 */
function buildCapabilities(
  profile,
) {
  const isFarmacias =
    profile.area ===
    'FARMACIAS'

  const isOperaciones =
    profile.area ===
    'OPERACIONES'

  const isAdmin =
    profile.system_role ===
    'ADMIN'

  const allowedAreas =
    Array.isArray(
      profile.allowed_areas,
    )
      ? profile.allowed_areas
      : []

  return {
    canViewMap:
      true,

    canViewStates:
      true,

    canSwitchAreas:
      allowedAreas.length >
      1,

    canAdminister:
      isAdmin,

    canViewCoordinators:
      isFarmacias &&
      (
        isAdmin ||
        profile.rol ===
          'GERENTE'
      ),

    canViewSupervisors:
      isFarmacias &&
      (
        isAdmin ||
        profile.rol ===
          'GERENTE' ||
        profile.rol ===
          'COORDINADOR'
      ),

    canViewAssignedUnits:
      isFarmacias,

    canViewJurisdictions:
      isOperaciones,

    canManageAssignments:
      isFarmacias &&
      (
        isAdmin ||
        profile.rol ===
          'GERENTE' ||
        profile.rol ===
          'COORDINADOR'
      ),

    canViewWorkPlans:
      isFarmacias,

    canApproveWorkPlans:
      isFarmacias &&
      (
        isAdmin ||
        profile.rol ===
          'GERENTE'
      ),

    canCalculateRoutes:
      true,
  }
}

function normalizeArea(
  value,
) {
  const normalized =
    String(
      value ??
      '',
    )
      .trim()
      .toUpperCase()

  return WEB_AREAS.includes(
    normalized,
  )
    ? normalized
    : null
}

function normalizeSystemRole(
  value,
) {
  const normalized =
    String(
      value ??
      'USER',
    )
      .trim()
      .toUpperCase()

  return normalized ===
    'ADMIN'
    ? 'ADMIN'
    : 'USER'
}

function normalizeAllowedAreas(
  values,
  fallbackArea,
) {
  const input =
    Array.isArray(
      values,
    )
      ? values
      : []

  const normalized =
    [
      ...new Set(
        input
          .map(
            normalizeArea,
          )
          .filter(
            Boolean,
          ),
      ),
    ]

  if (
    normalized.length >
    0
  ) {
    return normalized
  }

  return fallbackArea
    ? [
        fallbackArea,
      ]
    : []
}

function resolveEffectiveRole({
  systemRole,
  currentArea,
  legacyRole,
}) {
  if (
    systemRole !==
    'ADMIN'
  ) {
    return legacyRole
  }

  if (
    currentArea ===
    'FARMACIAS'
  ) {
    return 'GERENTE'
  }

  if (
    currentArea ===
    'OPERACIONES'
  ) {
    return 'JEFE_TRAFICO'
  }

  return legacyRole
}

/**
 * ============================================================
 * UTILIDADES
 * ============================================================
 */
function normalizeStateName(
  value,
) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  if (
    !normalized
  ) {
    return ''
  }

  return (
    normalized
      .charAt(
        0,
      )
      .toUpperCase() +
    normalized
      .slice(
        1,
      )
      .toLowerCase()
  )
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

/**
 * ============================================================
 * FILTRO:
 *
 * ALL
 * ASSIGNED
 * UNASSIGNED
 * ============================================================
 */
function addAssignmentStatusCondition({
  conditions,
  assignmentStatus,
}) {
  if (
    !assignmentStatus ||
    assignmentStatus ===
      'ALL'
  ) {
    return
  }

  if (
    assignmentStatus ===
    'ASSIGNED'
  ) {
    conditions.push(
      `
      EXISTS (
        SELECT 1

        FROM public.pharmacy_supervisor_assignment assignment_status_filter

        WHERE assignment_status_filter.pharmacy_id =
              farmacia.id

          AND assignment_status_filter.revoked_at
              IS NULL
      )
      `,
    )

    return
  }

  if (
    assignmentStatus ===
    'UNASSIGNED'
  ) {
    conditions.push(
      `
      NOT EXISTS (
        SELECT 1

        FROM public.pharmacy_supervisor_assignment assignment_status_filter

        WHERE assignment_status_filter.pharmacy_id =
              farmacia.id

          AND assignment_status_filter.revoked_at
              IS NULL
      )
      `,
    )
  }
}

/**
 * ============================================================
 * ERROR HTTP
 * ============================================================
 */
function createHttpError(
  status,
  message,
  code,
) {
  const error =
    new Error(
      message,
    )

  error.status =
    status

  error.code =
    code

  return error
}

export default router