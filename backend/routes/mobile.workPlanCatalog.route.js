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
  normalizePharmacyScopeMode,
} from '../services/pharmacyAccess.service.js'

const router =
  Router()

const DEFAULT_LIMIT =
  30

const MAX_LIMIT =
  100

router.use(
  requireAuth,
)

router.use(
  loadFarmaciasProfile,
)

router.use(
  requireSupervisor,
)

/**
 * ============================================================
 * GET
 * /api/mobile/work-plans/catalog/pharmacies/filters
 * ============================================================
 *
 * Los filtros respetan el ámbito del supervisor.
 *
 * Para ASSIGNED_ONLY se incluyen:
 *
 * 1. Unidades con asignación permanente activa.
 * 2. Unidades con cobertura temporal aprobada,
 *    vigente o futura.
 *
 * La fecha exacta de una visita vuelve a validarse
 * cuando se agrega al plan y cuando el plan se envía.
 * ============================================================
 */

router.get(
  '/pharmacies/filters',
  async (
    req,
    res,
  ) => {
    const scopeMode =
      normalizePharmacyScopeMode(
        req.profile
          .pharmacy_scope_mode,
      )

    try {
      const result =
        await pool.query(
          `
          WITH accessible_pharmacies AS (
            SELECT
              farmacia.*

            FROM public.farmacia
              farmacia

            WHERE
              $2::text =
                'ALL'

              OR EXISTS (
                SELECT 1

                FROM public.pharmacy_supervisor_assignment
                  assignment

                WHERE assignment.pharmacy_id =
                    farmacia.id

                  AND assignment.supervisor_id =
                    $1::uuid

                  AND assignment.revoked_at
                    IS NULL
              )

              OR EXISTS (
                SELECT 1

                FROM public.pharmacy_supervisor_coverage
                  coverage

                WHERE coverage.pharmacy_id =
                    farmacia.id

                  AND coverage.covering_supervisor_id =
                    $1::uuid

                  AND coverage.status =
                    'APPROVED'

                  AND coverage.cancelled_at
                    IS NULL

                  /*
                   * Incluye cobertura activa o futura.
                   *
                   * Una cobertura terminada deja de
                   * mostrar la unidad automáticamente.
                   */
                  AND coverage.end_date >=
                    CURRENT_DATE
              )
          )

          SELECT
            ARRAY(
              SELECT DISTINCT
                BTRIM(
                  region_sanitaria
                )

              FROM accessible_pharmacies

              WHERE region_sanitaria
                IS NOT NULL

                AND BTRIM(
                  region_sanitaria
                ) <> ''

              ORDER BY
                BTRIM(
                  region_sanitaria
                )
            ) AS regions,

            ARRAY(
              SELECT DISTINCT
                BTRIM(
                  proyecto
                )

              FROM accessible_pharmacies

              WHERE proyecto
                IS NOT NULL

                AND BTRIM(
                  proyecto
                ) <> ''

              ORDER BY
                BTRIM(
                  proyecto
                )
            ) AS projects,

            ARRAY(
              SELECT DISTINCT
                BTRIM(
                  estado
                )

              FROM accessible_pharmacies

              WHERE estado
                IS NOT NULL

                AND BTRIM(
                  estado
                ) <> ''

              ORDER BY
                BTRIM(
                  estado
                )
            ) AS states,

            ARRAY(
              SELECT DISTINCT
                estatus::text

              FROM accessible_pharmacies

              WHERE estatus
                IS NOT NULL

              ORDER BY
                estatus::text
            ) AS statuses
          `,
          [
            req.profile.id,
            scopeMode,
          ],
        )

      const row =
        result.rows[0] ??
        {}

      return res.json({
        regions:
          row.regions ??
          [],

        projects:
          row.projects ??
          [],

        states:
          row.states ??
          [],

        statuses:
          row.statuses ??
          [],

        scopeMode,
      })
    } catch (
      error
    ) {
      console.error(
        '[mobile.work-plan-catalog][filters]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener los filtros del catálogo',

          code:
            'PHARMACY_FILTERS_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * GET
 * /api/mobile/work-plans/catalog/pharmacies
 * ============================================================
 *
 * Catálogo de unidades visibles para el supervisor.
 *
 * Query:
 * - search
 * - region
 * - project
 * - state
 * - status
 * - limit
 * - offset
 *
 * El resultado identifica si el acceso proviene de:
 *
 * - PERMANENT_ASSIGNMENT
 * - TEMPORARY_COVERAGE
 * - ALL
 * ============================================================
 */

router.get(
  '/pharmacies',
  async (
    req,
    res,
  ) => {
    const search =
      normalizeOptionalText(
        req.query.search,
      )

    const region =
      normalizeOptionalText(
        req.query.region,
      )

    const project =
      normalizeOptionalText(
        req.query.project,
      )

    const state =
      normalizeOptionalText(
        req.query.state,
      )

    const status =
      normalizeOptionalText(
        req.query.status,
      )

    const limit =
      parseBoundedInteger(
        req.query.limit,
        DEFAULT_LIMIT,
        1,
        MAX_LIMIT,
      )

    const offset =
      parseBoundedInteger(
        req.query.offset,
        0,
        0,
        1000000,
      )

    const scopeMode =
      normalizePharmacyScopeMode(
        req.profile
          .pharmacy_scope_mode,
      )

    if (
      search &&
      search.length >
        150
    ) {
      return res
        .status(400)
        .json({
          error:
            'La búsqueda no puede superar 150 caracteres',

          code:
            'PHARMACY_SEARCH_TOO_LONG',
        })
    }

    try {
      const result =
        await pool.query(
          `
          WITH accessible_pharmacies AS (
            SELECT
              farmacia.*,

              active_assignment.id
                AS active_assignment_id,

              active_assignment.supervisor_id
                AS assigned_supervisor_id,

              assigned_supervisor.nombre
                AS assigned_supervisor_name,

              (
                active_assignment.supervisor_id =
                  $8::uuid
              ) AS assigned_to_current_supervisor,

              temporary_coverage.id
                AS temporary_coverage_id,

              temporary_coverage.start_date
                AS temporary_coverage_start_date,

              temporary_coverage.end_date
                AS temporary_coverage_end_date,

              temporary_coverage.coordinator_id
                AS temporary_coverage_coordinator_id,

              temporary_coverage.titular_supervisor_id
                AS coverage_titular_supervisor_id,

              coverage_titular.nombre
                AS coverage_titular_supervisor_name,

              (
                temporary_coverage.id
                  IS NOT NULL
              ) AS accessible_by_coverage,

              CASE
                WHEN temporary_coverage.id
                  IS NULL
                THEN NULL

                WHEN CURRENT_DATE <
                  temporary_coverage.start_date
                THEN 'SCHEDULED'

                WHEN CURRENT_DATE BETWEEN
                  temporary_coverage.start_date
                  AND temporary_coverage.end_date
                THEN 'ACTIVE'

                ELSE 'EXPIRED'
              END AS temporary_coverage_status

            FROM public.farmacia
              farmacia

            /*
             * Asignación permanente activa de la unidad.
             *
             * Puede pertenecer al supervisor actual o
             * a otro supervisor titular.
             */
            LEFT JOIN LATERAL (
              SELECT
                assignment.id,

                assignment.supervisor_id

              FROM public.pharmacy_supervisor_assignment
                assignment

              WHERE assignment.pharmacy_id =
                  farmacia.id

                AND assignment.revoked_at
                  IS NULL

              ORDER BY
                assignment.assigned_at DESC,

                assignment.created_at DESC

              LIMIT 1
            ) active_assignment
              ON TRUE

            LEFT JOIN public.personas
              assigned_supervisor

              ON assigned_supervisor.id =
                active_assignment.supervisor_id

            /*
             * Cobertura aprobada del supervisor actual.
             *
             * Se incluye si está activa o programada
             * para una fecha futura.
             *
             * Si existieran varias coberturas futuras
             * no traslapadas, se selecciona primero:
             *
             * 1. La activa hoy.
             * 2. La próxima cobertura.
             */
            LEFT JOIN LATERAL (
              SELECT
                coverage.id,

                coverage.coordinator_id,

                coverage.titular_supervisor_id,

                coverage.start_date,

                coverage.end_date

              FROM public.pharmacy_supervisor_coverage
                coverage

              WHERE coverage.pharmacy_id =
                  farmacia.id

                AND coverage.covering_supervisor_id =
                  $8::uuid

                AND coverage.status =
                  'APPROVED'

                AND coverage.cancelled_at
                  IS NULL

                AND coverage.end_date >=
                  CURRENT_DATE

              ORDER BY
                CASE
                  WHEN CURRENT_DATE BETWEEN
                    coverage.start_date
                    AND coverage.end_date
                  THEN 0

                  ELSE 1
                END ASC,

                coverage.start_date ASC,

                coverage.created_at ASC

              LIMIT 1
            ) temporary_coverage
              ON TRUE

            LEFT JOIN public.personas
              coverage_titular

              ON coverage_titular.id =
                temporary_coverage
                  .titular_supervisor_id

            WHERE
              $9::text =
                'ALL'

              OR active_assignment.supervisor_id =
                $8::uuid

              OR temporary_coverage.id
                IS NOT NULL
          )

          SELECT
            farmacia.id,

            farmacia.clues,

            farmacia.unidad,

            farmacia.region_sanitaria,

            farmacia.estatus::text
              AS estatus,

            farmacia.supervisor,

            farmacia.lugar_farmacia,

            farmacia.direccion,

            farmacia.latitud,

            farmacia.longitud,

            farmacia.estado,

            farmacia.proyecto,

            farmacia.active_assignment_id,

            farmacia.assigned_supervisor_id,

            farmacia.assigned_supervisor_name,

            farmacia.assigned_to_current_supervisor,

            farmacia.temporary_coverage_id,

            farmacia.temporary_coverage_start_date,

            farmacia.temporary_coverage_end_date,

            farmacia.temporary_coverage_coordinator_id,

            farmacia.coverage_titular_supervisor_id,

            farmacia.coverage_titular_supervisor_name,

            farmacia.accessible_by_coverage,

            farmacia.temporary_coverage_status,

            COUNT(*) OVER()
              AS total_count

          FROM accessible_pharmacies
            farmacia

          WHERE (
            $1::text IS NULL

            OR farmacia.clues ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              farmacia.unidad,
              ''
            ) ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              farmacia.direccion,
              ''
            ) ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              farmacia.lugar_farmacia,
              ''
            ) ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              farmacia.region_sanitaria,
              ''
            ) ILIKE
              '%' || $1 || '%'

            OR COALESCE(
              farmacia.proyecto,
              ''
            ) ILIKE
              '%' || $1 || '%'
          )

          AND (
            $2::text IS NULL

            OR farmacia.region_sanitaria =
              $2::text
          )

          AND (
            $3::text IS NULL

            OR farmacia.proyecto =
              $3::text
          )

          AND (
            $4::text IS NULL

            OR farmacia.estado =
              $4::text
          )

          AND (
            $5::text IS NULL

            OR farmacia.estatus::text =
              $5::text
          )

          ORDER BY
            /*
             * Coberturas activas primero.
             */
            CASE
              WHEN farmacia.temporary_coverage_status =
                'ACTIVE'
              THEN 0

              WHEN farmacia.assigned_to_current_supervisor
              THEN 1

              WHEN farmacia.temporary_coverage_status =
                'SCHEDULED'
              THEN 2

              ELSE 3
            END ASC,

            COALESCE(
              NULLIF(
                BTRIM(
                  farmacia.unidad
                ),
                ''
              ),

              farmacia.clues
            ) ASC,

            farmacia.id ASC

          LIMIT $6
          OFFSET $7
          `,
          [
            search,
            region,
            project,
            state,
            status,
            limit,
            offset,
            req.profile.id,
            scopeMode,
          ],
        )

      const total =
        result.rowCount >
        0
          ? Number(
              result
                .rows[0]
                .total_count,
            )
          : 0

      return res.json({
        pharmacies:
          result.rows.map(
            row =>
              mapPharmacy(
                row,
                scopeMode,
              ),
          ),

        pagination: {
          total,

          limit,

          offset,

          hasMore:
            offset +
              result.rowCount <
            total,
        },

        filters: {
          search,

          region,

          project,

          state,

          status,
        },

        scopeMode,
      })
    } catch (
      error
    ) {
      console.error(
        '[mobile.work-plan-catalog][pharmacies]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible consultar el catálogo de farmacias',

          code:
            'PHARMACY_CATALOG_FETCH_FAILED',
        })
    }
  },
)

/**
 * ============================================================
 * PERFIL OPERATIVO
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
            'Esta función está disponible únicamente para el área de Farmacias',

          code:
            'AREA_NOT_ALLOWED',
        })
    }

    req.profile = {
      ...profile,

      area,

      rol:
        role,

      pharmacy_scope_mode:
        normalizePharmacyScopeMode(
          profile
            .pharmacy_scope_mode,
        ),
    }

    return next()
  } catch (
    error
  ) {
    console.error(
      '[mobile.work-plan-catalog][profile]',
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

/**
 * ============================================================
 * ROL
 * ============================================================
 */

function requireSupervisor(
  req,
  res,
  next,
) {
  if (
    req.profile?.rol !==
    'SUPERVISOR'
  ) {
    return res
      .status(403)
      .json({
        error:
          'Esta operación está disponible únicamente para supervisores',

        code:
          'SUPERVISOR_ROLE_REQUIRED',
      })
  }

  return next()
}

/**
 * ============================================================
 * MAPEO
 * ============================================================
 */

function mapPharmacy(
  row,
  scopeMode,
) {
  const assignedToCurrentSupervisor =
    Boolean(
      row
        .assigned_to_current_supervisor,
    )

  const accessibleByCoverage =
    Boolean(
      row
        .accessible_by_coverage,
    )

  let accessType =
    'NONE'

  if (
    assignedToCurrentSupervisor
  ) {
    accessType =
      'PERMANENT_ASSIGNMENT'
  } else if (
    accessibleByCoverage
  ) {
    accessType =
      'TEMPORARY_COVERAGE'
  } else if (
    scopeMode ===
    'ALL'
  ) {
    accessType =
      'ALL'
  }

  const temporaryCoverage =
    row.temporary_coverage_id
      ? {
          id:
            row
              .temporary_coverage_id,

          status:
            row
              .temporary_coverage_status,

          startDate:
            normalizeDateValue(
              row
                .temporary_coverage_start_date,
            ),

          endDate:
            normalizeDateValue(
              row
                .temporary_coverage_end_date,
            ),

          coordinatorId:
            row
              .temporary_coverage_coordinator_id,

          titularSupervisorId:
            row
              .coverage_titular_supervisor_id,

          titularSupervisorName:
            row
              .coverage_titular_supervisor_name ??
            row
              .assigned_supervisor_name ??
            null,

          activeToday:
            row
              .temporary_coverage_status ===
            'ACTIVE',

          scheduled:
            row
              .temporary_coverage_status ===
            'SCHEDULED',
        }
      : null

  return {
    id:
      String(
        row.id,
      ),

    clues:
      row.clues,

    name:
      row.unidad ??
      row.clues ??
      'Unidad sin nombre',

    region:
      row.region_sanitaria,

    status:
      row.estatus,

    /**
     * Supervisor titular permanente actual.
     *
     * En una cobertura, este campo sigue
     * mostrando al titular, no al suplente.
     */
    assignedSupervisor:
      row.assigned_supervisor_name ??
      row.supervisor ??
      null,

    assignedSupervisorId:
      row.assigned_supervisor_id ??
      null,

    activeAssignmentId:
      row.active_assignment_id ??
      null,

    assignedToCurrentSupervisor,

    /**
     * Tipo por el cual el supervisor actual
     * puede consultar esta unidad.
     */
    accessType,

    accessibleByCoverage,

    temporaryCoverage,

    locationName:
      row.lugar_farmacia,

    address:
      row.direccion,

    lat:
      toNullableNumber(
        row.latitud,
      ),

    lng:
      toNullableNumber(
        row.longitud,
      ),

    state:
      row.estado,

    project:
      row.proyecto,
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

function parseBoundedInteger(
  value,
  fallback,
  minimum,
  maximum,
) {
  const parsed =
    Number(
      value,
    )

  if (
    !Number.isInteger(
      parsed,
    )
  ) {
    return fallback
  }

  return Math.min(
    maximum,

    Math.max(
      minimum,
      parsed,
    ),
  )
}

function toNullableNumber(
  value,
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null
  }

  const parsed =
    Number(
      value,
    )

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null
}

function normalizeDateValue(
  value,
) {
  if (!value) {
    return null
  }

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
    value,
  ).slice(
    0,
    10,
  )
}

export default router