import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import {
  pool,
} from './db/pool.js'

import {
  computeRoutes,
  getStaticRouteMap,
} from './routes.controller.js'

// ============================================================
// AUTH
// ============================================================

import authRouter
  from './routes/auth.route.js'

// ============================================================
// WEB · GENERAL
// ============================================================

import webRouter
  from './routes/web.route.js'

// ============================================================
// WEB · PLANES
// ============================================================

import webWorkPlanActionsRouter
  from './routes/web.workPlanActions.route.js'

import webExtraordinaryWorkPlansRouter
  from './routes/web.extraordinaryWorkPlans.route.js'

import webWorkPlansRouter
  from './routes/web.workPlans.route.js'

// ============================================================
// WEB · APROBACIONES
// ============================================================

import webApprovalsRouter
  from './routes/web.approvals.route.js'

// ============================================================
// WEB · ASIGNACIONES
// ============================================================

import webAssignmentActionsRouter
  from './routes/web.assignmentActions.route.js'

import webAssignmentHistoryRouter
  from './routes/web.assignmentHistory.route.js'

import webAssignmentsRouter
  from './routes/web.assignments.route.js'

// ============================================================
// WEB · COBERTURAS
// ============================================================

import webCoveragesRouter
  from './routes/web.coverages.route.js'

// ============================================================
// MOBILE
// ============================================================

import mobileRouter
  from './routes/mobile.route.js'

// ============================================================
// GENERALES / LEGACY
// ============================================================

import workPlansRouter
  from './routes/workPlans.route.js'

import routeTemplatesRouter
  from './routes/routeTemplates.route.js'

import assignmentsRouter
  from './routes/assignments.route.js'

import computedRoutesRouter
  from './routes/computedRoutes.route.js'

import farmaciasRouter
  from './routes/farmacias.route.js'

import personasRouter
  from './routes/personas.route.js'

// ============================================================
// APP
// ============================================================

const app =
  express()

app.disable(
  'x-powered-by',
)

// ============================================================
// CORS
// ============================================================

function parseOrigins(
  value,
) {
  if (!value) {
    return []
  }

  return String(
    value,
  )
    .split(',')
    .map(
      origin =>
        origin.trim(),
    )
    .filter(
      Boolean,
    )
}

const allowedOrigins =
  Array.from(
    new Set([
      'http://localhost:5173',
      'http://localhost:5174',
      'https://optimizador-rutas-theta.vercel.app',

      ...parseOrigins(
        process.env.FRONTEND_URL,
      ),

      ...parseOrigins(
        process.env.CORS_ORIGIN,
      ),
    ]),
  )

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(
  helmet({
    crossOriginResourcePolicy:
      false,
  }),
)

app.use(
  cors({
    origin(
      origin,
      callback,
    ) {
      /*
       * Permite herramientas sin cabecera Origin,
       * como Postman, curl o la aplicación móvil.
       */
      if (!origin) {
        return callback(
          null,
          true,
        )
      }

      if (
        allowedOrigins.includes(
          origin,
        )
      ) {
        return callback(
          null,
          true,
        )
      }

      const error =
        new Error(
          `CORS blocked for origin: ${origin}`,
        )

      error.status =
        403

      error.code =
        'CORS_ORIGIN_NOT_ALLOWED'

      return callback(
        error,
      )
    },

    credentials:
      true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
    ],

    optionsSuccessStatus:
      204,
  }),
)

app.use(
  express.json({
    limit:
      '10mb',
  }),
)

// ============================================================
// HEALTH
// ============================================================

app.get(
  '/api/__ping',
  (
    req,
    res,
  ) => {
    return res.json({
      ok:
        true,

      service:
        'optimizador-rutas-api',

      env:
        process.env.NODE_ENV ||
        'development',
    })
  },
)

app.get(
  '/api/health',
  async (
    req,
    res,
  ) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            1 AS ok,
            NOW() AS now
          `,
        )

      return res.json({
        ok:
          true,

        db:
          result.rows[0]?.ok ===
          1,

        now:
          result.rows[0]?.now ??
          null,
      })
    } catch (
      error
    ) {
      console.error(
        '[healthcheck]',
        error,
      )

      return res
        .status(500)
        .json({
          ok:
            false,

          db:
            false,

          error:
            'Database connection failed',

          code:
            'DATABASE_CONNECTION_FAILED',
        })
    }
  },
)

// ============================================================
// AUTH
// ============================================================

app.use(
  '/api/auth',
  authRouter,
)

// ============================================================
// MOBILE
// ============================================================

app.use(
  '/api/mobile',
  mobileRouter,
)

// ============================================================
// WEB · PLANES
// ============================================================

/*
 * IMPORTANTE:
 *
 * Las consultas deben montarse antes que el router de
 * acciones gerenciales.
 *
 * De lo contrario, el middleware requireManager del router
 * de acciones intercepta también los GET realizados por un
 * COORDINADOR y responde 403 antes de llegar a las consultas.
 */

/*
 * Ruta específica antes de /:planId.
 */
app.use(
  '/api/web/work-plans/extraordinary',
  webExtraordinaryWorkPlansRouter,
)

/*
 * Consultas:
 *
 * GET /api/web/work-plans
 * GET /api/web/work-plans/:planId
 *
 * Permitidas según las reglas del router para:
 * GERENTE, COORDINADOR y SUPERVISOR.
 */
app.use(
  '/api/web/work-plans',
  webWorkPlansRouter,
)

/*
 * Acciones:
 *
 * POST /api/web/work-plans/:planId/approve
 * POST /api/web/work-plans/:planId/reject
 *
 * Exclusivas de GERENTE.
 */
app.use(
  '/api/web/work-plans',
  webWorkPlanActionsRouter,
)

// ============================================================
// WEB · APROBACIONES
// ============================================================

app.use(
  '/api/web/approvals',
  webApprovalsRouter,
)

// ============================================================
// WEB · ASIGNACIONES
// ============================================================

/*
 * Consulta principal:
 *
 * GET /api/web/assignments
 *
 * GERENTE:
 * - ve toda su estructura.
 *
 * COORDINADOR:
 * - ve solamente su territorio.
 */
app.use(
  '/api/web/assignments',
  webAssignmentsRouter,
)

/*
 * Historial:
 *
 * GET /api/web/assignments/:pharmacyId/history
 *
 * Disponible para GERENTE y COORDINADOR conforme
 * a su ámbito territorial.
 */
app.use(
  '/api/web/assignments',
  webAssignmentHistoryRouter,
)

/*
 * Acciones permanentes:
 *
 * POST /api/web/assignments/:pharmacyId/supervisor/assign
 * POST /api/web/assignments/:pharmacyId/supervisor/revoke
 *
 * Exclusivas de GERENTE.
 *
 * Se montan al final para no interceptar las consultas
 * realizadas por coordinadores.
 */
app.use(
  '/api/web/assignments',
  webAssignmentActionsRouter,
)

// ============================================================
// WEB · COBERTURAS TEMPORALES
// ============================================================

/*
 * GERENTE:
 * - consulta;
 * - crea directamente;
 * - aprueba;
 * - rechaza;
 * - cancela.
 *
 * COORDINADOR:
 * - consulta su territorio;
 * - crea solicitudes PENDING_APPROVAL.
 */
app.use(
  '/api/web/coverages',
  webCoveragesRouter,
)

// ============================================================
// WEB · GENERAL
// ============================================================

/*
 * Debe permanecer después de los routers web específicos.
 */
app.use(
  '/api/web',
  webRouter,
)

// ============================================================
// CÁLCULO DE RUTAS
// ============================================================

app.post(
  '/api/routes/compute',
  computeRoutes,
)

app.post(
  '/api/routes/static-map',
  getStaticRouteMap,
)

// ============================================================
// ROUTERS GENERALES
// ============================================================

app.use(
  '/api/route-templates',
  routeTemplatesRouter,
)

app.use(
  '/api/assignments',
  assignmentsRouter,
)

app.use(
  '/api/computed-routes',
  computedRoutesRouter,
)

app.use(
  '/api/personas',
  personasRouter,
)

// ============================================================
// LEGACY · WORK PLANS
// ============================================================

app.use(
  '/api/work-plans',
  workPlansRouter,
)

// ============================================================
// FARMACIAS · ROUTER GENERAL
// ============================================================

app.use(
  '/api',
  farmaciasRouter,
)

// ============================================================
// 404
// ============================================================

app.use(
  (
    req,
    res,
  ) => {
    return res
      .status(404)
      .json({
        error:
          'Route not found',

        code:
          'ROUTE_NOT_FOUND',

        method:
          req.method,

        path:
          req.originalUrl,
      })
  },
)

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (
    err,
    req,
    res,
    next,
  ) => {
    console.error(
      '[unhandled-error]',
      {
        method:
          req.method,

        path:
          req.originalUrl,

        message:
          err?.message,

        code:
          err?.code,

        stack:
          err?.stack,
      },
    )

    if (
      res.headersSent
    ) {
      return next(
        err,
      )
    }

    const statusCandidate =
      Number(
        err?.status ||
        err?.statusCode ||
        500,
      )

    const status =
      Number.isInteger(
        statusCandidate,
      ) &&
      statusCandidate >=
        400 &&
      statusCandidate <=
        599
        ? statusCandidate
        : 500

    return res
      .status(status)
      .json({
        error:
          err?.message ||
          'Internal Server Error',

        code:
          err?.code ||
          'INTERNAL_SERVER_ERROR',
      })
  },
)

// ============================================================
// SERVER
// ============================================================

const port =
  Number(
    process.env.PORT ||
    4000,
  )

const server =
  app.listen(
    port,
    async () => {
      console.log(
        `✅ API listening on port ${port}`,
      )

      console.log(
        '✅ Allowed origins:',
        allowedOrigins,
      )

      try {
        const result =
          await pool.query(
            `
            SELECT
              NOW() AS now
            `,
          )

        console.log(
          `✅ DB connected at ${result.rows[0].now}`,
        )
      } catch (
        error
      ) {
        console.error(
          '❌ DB connection failed:',
          error?.message ||
          error,
        )
      }
    },
  )

// ============================================================
// SHUTDOWN
// ============================================================

let isShuttingDown =
  false

async function shutdown(
  signal,
) {
  if (
    isShuttingDown
  ) {
    return
  }

  isShuttingDown =
    true

  console.log(
    `🛑 ${signal} received. Closing API...`,
  )

  server.close(
    async error => {
      if (error) {
        console.error(
          '❌ Error closing HTTP server:',
          error,
        )

        process.exitCode =
          1

        return
      }

      try {
        await pool.end()

        console.log(
          '✅ Database pool closed',
        )
      } catch (
        poolError
      ) {
        console.error(
          '❌ Error closing database pool:',
          poolError,
        )

        process.exitCode =
          1
      }
    },
  )
}

process.once(
  'SIGINT',
  () => {
    shutdown(
      'SIGINT',
    )
  },
)

process.once(
  'SIGTERM',
  () => {
    shutdown(
      'SIGTERM',
    )
  },
)

export {
  app,
}