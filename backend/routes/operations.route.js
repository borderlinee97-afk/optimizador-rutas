import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

function normalizeOptionalText(value) {
  const normalized =
    String(
      value ??
      '',
    ).trim()

  return normalized ||
    null
}

function parseBoolean(
  value,
  defaultValue = false,
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return defaultValue
  }

  const normalized =
    String(
      value,
    )
      .trim()
      .toLowerCase()

  if (
    [
      '1',
      'true',
      'yes',
      'si',
      'sí',
    ].includes(
      normalized,
    )
  ) {
    return true
  }

  if (
    [
      '0',
      'false',
      'no',
    ].includes(
      normalized,
    )
  ) {
    return false
  }

  return defaultValue
}

function parsePositiveInteger(
  value,
  defaultValue,
  maxValue = 2000,
) {
  const parsed =
    Number.parseInt(
      String(
        value ??
        '',
      ),
      10,
    )

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed < 1
  ) {
    return defaultValue
  }

  return Math.min(
    parsed,
    maxValue,
  )
}

function parseOffset(value) {
  const parsed =
    Number.parseInt(
      String(
        value ??
        '',
      ),
      10,
    )

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed < 0
  ) {
    return 0
  }

  return parsed
}

function normalizeStatusFilter(value) {
  const normalized =
    String(
      value ??
      '',
    )
      .trim()
      .toUpperCase()

  if (
    !normalized ||
    normalized ===
      'ALL'
  ) {
    return 'ALL'
  }

  if (
    normalized ===
      'OPERATIONAL' ||
    normalized ===
      'OPERATIVAS'
  ) {
    return 'OPERATIONAL'
  }

  if (
    normalized ===
      'INACTIVE' ||
    normalized ===
      'INACTIVAS'
  ) {
    return 'INACTIVE'
  }

  return normalized
}

function mapCedis(row) {
  if (
    !row?.cedis_id
  ) {
    return null
  }

  return {
    id:
      Number(
        row.cedis_id,
      ),

    name:
      row.cedis_name,

    clues:
      row.cedis_clues,

    lat:
      row.cedis_latitude ==
      null
        ? null
        : Number(
            row.cedis_latitude,
          ),

    lng:
      row.cedis_longitude ==
      null
        ? null
        : Number(
            row.cedis_longitude,
          ),

    timezone:
      row.cedis_timezone ??
      null,

    shiftHours:
      row.cedis_shift_hours ==
      null
        ? null
        : Number(
            row.cedis_shift_hours,
          ),

    lastUnitArrivalLimit:
      row.cedis_last_unit_arrival_limit ??
      null,

    serviceMinutesPerUnit:
      row.cedis_service_minutes_per_unit ==
      null
        ? null
        : Number(
            row.cedis_service_minutes_per_unit,
          ),

    primary:
      Boolean(
        row.cedis_primary,
      ),

    active:
      true,
  }
}

// ============================================================
// GET /api/operations/context
// ============================================================
//
// Catálogo formal:
// ESTADO
//   -> PROYECTO
//      -> REGIONES
//      -> CEDIS
//
// Compatibilidad histórica:
// - estatus NULL se considera operativo.
// - estatus INACTIVA se considera inactivo.
// ============================================================

router.get(
  '/context',
  async (
    req,
    res,
  ) => {
    try {
      const requestedState =
        normalizeOptionalText(
          req.query.state,
        )

      const params = []

      const conditions = [
        `
        NULLIF(
          BTRIM(
            COALESCE(
              f.estado,
              ''
            )
          ),
          ''
        ) IS NOT NULL
        `,

        `
        NULLIF(
          BTRIM(
            COALESCE(
              f.proyecto,
              ''
            )
          ),
          ''
        ) IS NOT NULL
        `,
      ]

      if (
        requestedState
      ) {
        params.push(
          requestedState,
        )

        conditions.push(
          `
          UPPER(
            BTRIM(
              f.estado
            )
          )
          =
          UPPER(
            BTRIM(
              $${params.length}
            )
          )
          `,
        )
      }

      const {
        rows,
      } =
        await pool.query(
          `
          WITH project_summary AS (
            SELECT
              BTRIM(
                f.estado
              ) AS estado,

              BTRIM(
                f.proyecto
              ) AS proyecto,

              COUNT(*)::integer
                AS registered_units,

              COUNT(*) FILTER (
                WHERE
                  COALESCE(
                    UPPER(
                      f.estatus::text
                    ),
                    ''
                  )
                  <>
                  'INACTIVA'
              )::integer
                AS operational_units,

              COUNT(*) FILTER (
                WHERE
                  UPPER(
                    COALESCE(
                      f.estatus::text,
                      ''
                    )
                  )
                  =
                  'INACTIVA'
              )::integer
                AS inactive_units,

              COUNT(*) FILTER (
                WHERE
                  f.latitud
                    IS NOT NULL

                  AND

                  f.longitud
                    IS NOT NULL
              )::integer
                AS geocoded_units,

              COUNT(
                DISTINCT
                NULLIF(
                  BTRIM(
                    f.region_sanitaria
                  ),
                  ''
                )
              )::integer
                AS region_count

            FROM
              public.farmacia
                f

            WHERE
              ${conditions.join(
                ' AND ',
              )}

            GROUP BY
              BTRIM(
                f.estado
              ),

              BTRIM(
                f.proyecto
              )
          ),

          region_summary AS (
            SELECT
              BTRIM(
                f.estado
              ) AS estado,

              BTRIM(
                f.proyecto
              ) AS proyecto,

              COALESCE(
                NULLIF(
                  BTRIM(
                    f.region_sanitaria
                  ),
                  ''
                ),
                'Sin región'
              ) AS region,

              COUNT(*)::integer
                AS registered_units,

              COUNT(*) FILTER (
                WHERE
                  COALESCE(
                    UPPER(
                      f.estatus::text
                    ),
                    ''
                  )
                  <>
                  'INACTIVA'
              )::integer
                AS operational_units,

              COUNT(*) FILTER (
                WHERE
                  UPPER(
                    COALESCE(
                      f.estatus::text,
                      ''
                    )
                  )
                  =
                  'INACTIVA'
              )::integer
                AS inactive_units

            FROM
              public.farmacia
                f

            WHERE
              ${conditions.join(
                ' AND ',
              )}

            GROUP BY
              BTRIM(
                f.estado
              ),

              BTRIM(
                f.proyecto
              ),

              COALESCE(
                NULLIF(
                  BTRIM(
                    f.region_sanitaria
                  ),
                  ''
                ),
                'Sin región'
              )
          ),

          regions_json AS (
            SELECT
              rs.estado,
              rs.proyecto,

              JSONB_AGG(
                JSONB_BUILD_OBJECT(
                  'region',
                    rs.region,

                  'registeredUnits',
                    rs.registered_units,

                  'operationalUnits',
                    rs.operational_units,

                  'inactiveUnits',
                    rs.inactive_units
                )

                ORDER BY
                  rs.region
              ) AS regions

            FROM
              region_summary
                rs

            GROUP BY
              rs.estado,
              rs.proyecto
          ),

          cedis_summary AS (
            SELECT
              BTRIM(
                pc.proyecto
              ) AS proyecto,

              COUNT(*) FILTER (
                WHERE
                  pc.activo =
                  TRUE
              )::integer
                AS active_cedis_count,

              COUNT(*)::integer
                AS total_cedis_count

            FROM
              public.proyecto_cedis
                pc

            GROUP BY
              BTRIM(
                pc.proyecto
              )
          )

          SELECT
            ps.estado,
            ps.proyecto,

            ps.registered_units,
            ps.operational_units,
            ps.inactive_units,
            ps.geocoded_units,
            ps.region_count,

            COALESCE(
              rj.regions,
              '[]'::jsonb
            ) AS regions,

            COALESCE(
              cs.active_cedis_count,
              0
            )::integer
              AS active_cedis_count,

            COALESCE(
              cs.total_cedis_count,
              0
            )::integer
              AS total_cedis_count,

            principal.id
              AS cedis_id,

            principal.nombre
              AS cedis_name,

            principal.clues
              AS cedis_clues,

            principal.latitud
              AS cedis_latitude,

            principal.longitud
              AS cedis_longitude,

            principal.timezone
              AS cedis_timezone,

            principal.horas_turno
              AS cedis_shift_hours,

            principal.hora_limite_llegada_ultima_unidad
              AS cedis_last_unit_arrival_limit,

            principal.minutos_servicio_por_unidad
              AS cedis_service_minutes_per_unit,

            principal.es_principal
              AS cedis_primary

          FROM
            project_summary
              ps

          LEFT JOIN
            regions_json
              rj

            ON
              UPPER(
                BTRIM(
                  rj.estado
                )
              )
              =
              UPPER(
                BTRIM(
                  ps.estado
                )
              )

            AND

              UPPER(
                BTRIM(
                  rj.proyecto
                )
              )
              =
              UPPER(
                BTRIM(
                  ps.proyecto
                )
              )

          LEFT JOIN
            cedis_summary
              cs

            ON
              UPPER(
                BTRIM(
                  cs.proyecto
                )
              )
              =
              UPPER(
                BTRIM(
                  ps.proyecto
                )
              )

          LEFT JOIN LATERAL (
            SELECT
              pc.id,
              pc.nombre,
              pc.clues,
              pc.latitud,
              pc.longitud,
              pc.timezone,
              pc.horas_turno,
              pc.hora_limite_llegada_ultima_unidad,
              pc.minutos_servicio_por_unidad,
              pc.es_principal

            FROM
              public.proyecto_cedis
                pc

            WHERE
              UPPER(
                BTRIM(
                  pc.proyecto
                )
              )
              =
              UPPER(
                BTRIM(
                  ps.proyecto
                )
              )

              AND

              pc.activo =
                TRUE

            ORDER BY
              pc.es_principal
                DESC,

              pc.nombre
                ASC,

              pc.id
                ASC

            LIMIT 1
          ) principal
            ON TRUE

          ORDER BY
            ps.estado
              ASC,

            ps.proyecto
              ASC
          `,
          params,
        )

      const stateMap =
        new Map()

      for (
        const row
        of rows
      ) {
        const stateName =
          row.estado

        if (
          !stateMap.has(
            stateName,
          )
        ) {
          stateMap.set(
            stateName,
            {
              state:
                stateName,

              registeredUnits:
                0,

              operationalUnits:
                0,

              inactiveUnits:
                0,

              geocodedUnits:
                0,

              projects:
                [],
            },
          )
        }

        const state =
          stateMap.get(
            stateName,
          )

        const project = {
          project:
            row.proyecto,

          registeredUnits:
            Number(
              row.registered_units ??
              0,
            ),

          operationalUnits:
            Number(
              row.operational_units ??
              0,
            ),

          inactiveUnits:
            Number(
              row.inactive_units ??
              0,
            ),

          geocodedUnits:
            Number(
              row.geocoded_units ??
              0,
            ),

          regionCount:
            Number(
              row.region_count ??
              0,
            ),

          regions:
            Array.isArray(
              row.regions,
            )
              ? row.regions
              : [],

          cedisConfigured:
            Number(
              row.active_cedis_count ??
              0,
            ) > 0,

          activeCedisCount:
            Number(
              row.active_cedis_count ??
              0,
            ),

          totalCedisCount:
            Number(
              row.total_cedis_count ??
              0,
            ),

          principalCedis:
            mapCedis(
              row,
            ),
        }

        state.registeredUnits +=
          project.registeredUnits

        state.operationalUnits +=
          project.operationalUnits

        state.inactiveUnits +=
          project.inactiveUnits

        state.geocodedUnits +=
          project.geocodedUnits

        state.projects.push(
          project,
        )
      }

      const states =
        Array.from(
          stateMap.values(),
        )

      return res.json({
        summary: {
          states:
            states.length,

          projects:
            states.reduce(
              (
                total,
                state,
              ) =>
                total +
                state.projects.length,
              0,
            ),

          registeredUnits:
            states.reduce(
              (
                total,
                state,
              ) =>
                total +
                state.registeredUnits,
              0,
            ),

          operationalUnits:
            states.reduce(
              (
                total,
                state,
              ) =>
                total +
                state.operationalUnits,
              0,
            ),

          inactiveUnits:
            states.reduce(
              (
                total,
                state,
              ) =>
                total +
                state.inactiveUnits,
              0,
            ),

          geocodedUnits:
            states.reduce(
              (
                total,
                state,
              ) =>
                total +
                state.geocodedUnits,
              0,
            ),
        },

        states,

        generatedAt:
          new Date()
            .toISOString(),
      })
    } catch (
      error
    ) {
      console.error(
        '[operations][context]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener el contexto de Operaciones',

          code:
            'OPERATIONS_CONTEXT_FETCH_FAILED',

          details:
            error?.message ||
            String(
              error,
            ),
        })
    }
  },
)

// ============================================================
// GET /api/operations/units
// ============================================================

router.get(
  '/units',
  async (
    req,
    res,
  ) => {
    try {
      const state =
        normalizeOptionalText(
          req.query.state,
        )

      const project =
        normalizeOptionalText(
          req.query.project,
        )

      const region =
        normalizeOptionalText(
          req.query.region,
        )

      const search =
        normalizeOptionalText(
          req.query.search,
        )

      const status =
        normalizeStatusFilter(
          req.query.status,
        )

      const withCoords =
        parseBoolean(
          req.query.withCoords,
          false,
        )

      const limit =
        parsePositiveInteger(
          req.query.limit,
          500,
          2000,
        )

      const offset =
        parseOffset(
          req.query.offset,
        )

      if (
        !state
      ) {
        return res
          .status(400)
          .json({
            error:
              'state es requerido',

            code:
              'OPERATIONS_STATE_REQUIRED',
          })
      }

      if (
        !project
      ) {
        return res
          .status(400)
          .json({
            error:
              'project es requerido',

            code:
              'OPERATIONS_PROJECT_REQUIRED',
          })
      }

      const params = [
        state,
        project,
      ]

      const conditions = [
        `
        UPPER(
          BTRIM(
            f.estado
          )
        )
        =
        UPPER(
          BTRIM(
            $1
          )
        )
        `,

        `
        UPPER(
          BTRIM(
            f.proyecto
          )
        )
        =
        UPPER(
          BTRIM(
            $2
          )
        )
        `,
      ]

      if (
        region
      ) {
        params.push(
          region,
        )

        conditions.push(
          `
          UPPER(
            BTRIM(
              COALESCE(
                f.region_sanitaria,
                ''
              )
            )
          )
          =
          UPPER(
            BTRIM(
              $${params.length}
            )
          )
          `,
        )
      }

      if (
        status ===
        'OPERATIONAL'
      ) {
        /*
         * Compatibilidad histórica:
         *
         * Las unidades antiguas de Jalisco no tienen
         * un estatus operativo explícito.
         *
         * NULL se considera operativo.
         */
        conditions.push(
          `
          COALESCE(
            UPPER(
              f.estatus::text
            ),
            ''
          )
          <>
          'INACTIVA'
          `,
        )
      } else if (
        status ===
        'INACTIVE'
      ) {
        conditions.push(
          `
          UPPER(
            COALESCE(
              f.estatus::text,
              ''
            )
          )
          =
          'INACTIVA'
          `,
        )
      } else if (
        status !==
        'ALL'
      ) {
        params.push(
          status,
        )

        conditions.push(
          `
          UPPER(
            COALESCE(
              f.estatus::text,
              ''
            )
          )
          =
          UPPER(
            BTRIM(
              $${params.length}
            )
          )
          `,
        )
      }

      if (
        withCoords
      ) {
        conditions.push(
          'f.latitud IS NOT NULL',
        )

        conditions.push(
          'f.longitud IS NOT NULL',
        )
      }

      if (
        search
      ) {
        params.push(
          search,
        )

        const index =
          params.length

        conditions.push(
          `
          (
            f.clues
              ILIKE
              '%' || $${index} || '%'

            OR

            f.unidad
              ILIKE
              '%' || $${index} || '%'

            OR

            COALESCE(
              f.direccion,
              ''
            )
              ILIKE
              '%' || $${index} || '%'

            OR

            COALESCE(
              f.region_sanitaria,
              ''
            )
              ILIKE
              '%' || $${index} || '%'
          )
          `,
        )
      }

      const countParams = [
        ...params,
      ]

      params.push(
        limit,
      )

      const limitIndex =
        params.length

      params.push(
        offset,
      )

      const offsetIndex =
        params.length

      const whereSql =
        conditions.join(
          ' AND ',
        )

      const [
        dataResult,
        countResult,
      ] =
        await Promise.all([
          pool.query(
            `
            SELECT
              f.id,
              f.clues,
              f.unidad,
              f.region_sanitaria,

              f.estatus::text
                AS estatus,

              f.supervisor,
              f.lugar_farmacia,
              f.direccion,
              f.latitud,
              f.longitud,
              f.estado,
              f.proyecto,

              (
                fda.clues
                  IS NOT NULL
              ) AS dificil_acceso

            FROM
              public.farmacia
                f

            LEFT JOIN
              public.farmacia_dificil_acceso
                fda

              ON
                fda.clues =
                f.clues

            WHERE
              ${whereSql}

            ORDER BY
              f.region_sanitaria
                NULLS LAST,

              f.unidad
                ASC,

              f.clues
                ASC

            LIMIT
              $${limitIndex}

            OFFSET
              $${offsetIndex}
            `,
            params,
          ),

          pool.query(
            `
            SELECT
              COUNT(*)::integer
                AS total

            FROM
              public.farmacia
                f

            WHERE
              ${whereSql}
            `,
            countParams,
          ),
        ])

      const total =
        Number(
          countResult
            .rows[0]
            ?.total ??
          0,
        )

      return res.json({
        state,
        project,

        filters: {
          region,
          status,
          search,
          withCoords,
        },

        pagination: {
          total,
          limit,
          offset,

          hasMore:
            offset +
              dataResult.rows.length <
            total,
        },

        units:
          dataResult.rows.map(
            row => ({
              id:
                Number(
                  row.id,
                ),

              clues:
                row.clues,

              name:
                row.unidad,

              region:
                row.region_sanitaria,

              /*
               * El estatus se conserva tal como está
               * almacenado.
               *
               * Una unidad histórica puede devolver
               * status: null y aun así ser operativa.
               */
              status:
                row.estatus,

              operational:
                String(
                  row.estatus ??
                  '',
                )
                  .trim()
                  .toUpperCase() !==
                'INACTIVA',

              supervisor:
                row.supervisor,

              locationName:
                row.lugar_farmacia,

              address:
                row.direccion,

              lat:
                row.latitud ==
                null
                  ? null
                  : Number(
                      row.latitud,
                    ),

              lng:
                row.longitud ==
                null
                  ? null
                  : Number(
                      row.longitud,
                    ),

              state:
                row.estado,

              project:
                row.proyecto,

              hardAccess:
                Boolean(
                  row.dificil_acceso,
                ),
            }),
          ),
      })
    } catch (
      error
    ) {
      console.error(
        '[operations][units]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener las unidades de Operaciones',

          code:
            'OPERATIONS_UNITS_FETCH_FAILED',

          details:
            error?.message ||
            String(
              error,
            ),
        })
    }
  },
)

// ============================================================
// GET /api/operations/cedis
// ============================================================

router.get(
  '/cedis',
  async (
    req,
    res,
  ) => {
    try {
      const project =
        normalizeOptionalText(
          req.query.project,
        )

      if (
        !project
      ) {
        return res
          .status(400)
          .json({
            error:
              'project es requerido',

            code:
              'OPERATIONS_PROJECT_REQUIRED',
          })
      }

      const {
        rows,
      } =
        await pool.query(
          `
          SELECT
            id,
            proyecto,
            nombre,
            clues,
            latitud,
            longitud,
            timezone,
            horas_turno,
            hora_limite_llegada_ultima_unidad,
            minutos_servicio_por_unidad,
            activo,
            es_principal

          FROM
            public.proyecto_cedis

          WHERE
            UPPER(
              BTRIM(
                proyecto
              )
            )
            =
            UPPER(
              BTRIM(
                $1
              )
            )

          ORDER BY
            activo
              DESC,

            es_principal
              DESC,

            nombre
              ASC,

            id
              ASC
          `,
          [
            project,
          ],
        )

      return res.json({
        project,

        cedis:
          rows.map(
            row => ({
              id:
                Number(
                  row.id,
                ),

              project:
                row.proyecto,

              name:
                row.nombre,

              clues:
                row.clues,

              lat:
                row.latitud ==
                null
                  ? null
                  : Number(
                      row.latitud,
                    ),

              lng:
                row.longitud ==
                null
                  ? null
                  : Number(
                      row.longitud,
                    ),

              timezone:
                row.timezone ??
                null,

              shiftHours:
                row.horas_turno ==
                null
                  ? null
                  : Number(
                      row.horas_turno,
                    ),

              lastUnitArrivalLimit:
                row.hora_limite_llegada_ultima_unidad ??
                null,

              serviceMinutesPerUnit:
                row.minutos_servicio_por_unidad ==
                null
                  ? null
                  : Number(
                      row.minutos_servicio_por_unidad,
                    ),

              active:
                Boolean(
                  row.activo,
                ),

              primary:
                Boolean(
                  row.es_principal,
                ),
            }),
          ),
      })
    } catch (
      error
    ) {
      console.error(
        '[operations][cedis]',
        error,
      )

      return res
        .status(500)
        .json({
          error:
            'No fue posible obtener los CEDIS de Operaciones',

          code:
            'OPERATIONS_CEDIS_FETCH_FAILED',

          details:
            error?.message ||
            String(
              error,
            ),
        })
    }
  },
)

export default router