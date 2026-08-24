import { Router } from 'express'
import { pool } from '../db/pool.js'

import operationsRouter
  from './operations.route.js'

const router =
  Router()

const DEFAULT_PROJECT =
  'JALISCO'

function normalizeProject(
  value,
) {
  return String(
    value ||
    DEFAULT_PROJECT,
  ).trim()
}

// ============================================================
// OPERACIONES · CONTEXTO / CATÁLOGOS
// ============================================================
//
// index.js ya monta este router general sobre:
//
//   /api
//
// Por ello este subrouter queda disponible como:
//
//   GET /api/operations/context
//   GET /api/operations/units
//   GET /api/operations/cedis
//
// La autorización específica del módulo Operaciones se
// incorporará en el siguiente bloque ADMIN / permisos.
// ============================================================

router.use(
  '/operations',
  operationsRouter,
)

// ============================================================
// GET /api/farmacias
// ============================================================

router.get(
  '/farmacias',
  async (
    req,
    res,
  ) => {
    try {
      const proyecto =
        req.query.proyecto
          ? normalizeProject(
              req.query.proyecto,
            )
          : null

      const conditions =
        []

      const params =
        []

      if (
        proyecto
      ) {
        params.push(
          proyecto,
        )

        conditions.push(
          `
          UPPER(
            BTRIM(
              proyecto
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

      const query = `
        SELECT
          id,
          clues,
          unidad,
          region_sanitaria,
          estatus,
          supervisor,
          lugar_farmacia,
          direccion,
          latitud,
          longitud,
          estado,
          proyecto

        FROM
          public.farmacia

        ${
          conditions.length
            ? `WHERE ${conditions.join(
                ' AND ',
              )}`
            : ''
        }

        ORDER BY
          estado
            NULLS LAST,

          proyecto
            NULLS LAST,

          region_sanitaria
            NULLS LAST,

          clues
            ASC
      `

      const {
        rows,
      } =
        await pool.query(
          query,
          params,
        )

      return res.json(
        rows,
      )
    } catch (
      err
    ) {
      console.error(
        '[farmacias][GET]',
        err,
      )

      return res
        .status(500)
        .json({
          error:
            'Error obteniendo farmacias',

          details:
            err.message,
        })
    }
  },
)

// ============================================================
// GET /api/proyecto-cedis
// ============================================================
//
// Ejemplo:
//
// /api/proyecto-cedis?proyecto=Aguascalientes
//
// La búsqueda ya no depende de mayúsculas/minúsculas.
// ============================================================

router.get(
  '/proyecto-cedis',
  async (
    req,
    res,
  ) => {
    try {
      const proyecto =
        normalizeProject(
          req.query.proyecto,
        )

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

            AND

            activo =
              TRUE

          ORDER BY
            es_principal
              DESC,

            nombre
              ASC,

            id
              ASC
          `,
          [
            proyecto,
          ],
        )

      return res.json(
        rows,
      )
    } catch (
      err
    ) {
      console.error(
        '[proyecto-cedis][GET]',
        err,
      )

      return res
        .status(500)
        .json({
          error:
            'Error obteniendo CEDIS del proyecto',

          details:
            err.message,
        })
    }
  },
)

// ============================================================
// POST /api/farmacias/dificil-acceso/bulk
// ============================================================

router.post(
  '/farmacias/dificil-acceso/bulk',
  async (
    req,
    res,
  ) => {
    try {
      const {
        ids,
        dificilAcceso,
      } =
        req.body

      if (
        !Array.isArray(
          ids,
        ) ||
        ids.length ===
          0
      ) {
        return res
          .status(400)
          .json({
            error:
              'ids debe ser un arreglo no vacío',
          })
      }

      /*
       * Endpoint legacy.
       *
       * Se conserva funcionalmente como estaba.
       *
       * La administración formal de difícil acceso
       * se reforzará posteriormente dentro del
       * módulo Operaciones.
       */

      await pool.query(
        `
        UPDATE
          public.farmacia

        SET
          dificil_acceso =
            $1

        WHERE
          id =
          ANY(
            $2
          )
        `,
        [
          dificilAcceso,
          ids,
        ],
      )

      return res.json({
        ok:
          true,
      })
    } catch (
      err
    ) {
      console.error(
        '[farmacias][BULK]',
        err,
      )

      return res
        .status(500)
        .json({
          error:
            'Error actualizando farmacias',

          details:
            err.message,
        })
    }
  },
)

export default router