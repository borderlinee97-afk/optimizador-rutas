import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import {
  pathToFileURL,
} from 'node:url'

import {
  pool,
} from './db/pool.js'

import {
  requireAuth,
} from './middleware/requireAuth.js'

import {
  requireOperationalProfile,
  requireRoles,
} from './middleware/operationalAccess.js'

import {
  createRateLimit,
} from './middleware/rateLimit.js'

import {
  requestContext,
} from './middleware/requestContext.js'

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

app.set(
  'trust proxy',
  Number(
    process.env.TRUST_PROXY_HOPS ||
    1,
  ),
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
      origin => {
        const normalized =
          origin.trim()

        if (!normalized) {
          return null
        }

        let parsed

        try {
          parsed =
            new URL(
              normalized,
            )
        } catch {
          throw new Error(
            `Invalid CORS origin: ${normalized}`,
          )
        }

        if (
          ![
            'http:',
            'https:',
          ].includes(
            parsed.protocol,
          )
        ) {
          throw new Error(
            `Invalid CORS origin protocol: ${normalized}`,
          )
        }

        return parsed.origin
      },
    )
    .filter(
      Boolean,
    )
}

const isProduction =
  process.env.NODE_ENV ===
  'production'

const developmentOrigins =
  isProduction
    ? []
    : [
        'http://localhost:5173',
        'http://localhost:5174',
      ]

const allowedOrigins =
  Array.from(
    new Set([
      ...developmentOrigins,

      ...parseOrigins(
        process.env.FRONTEND_URL,
      ),

      ...parseOrigins(
        process.env.CORS_ORIGIN,
      ),
    ]),
  )

if (
  isProduction &&
  allowedOrigins.length ===
    0
) {
  throw new Error(
    'Missing FRONTEND_URL or CORS_ORIGIN in production',
  )
}

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(
  requestContext,
)

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
      process.env.JSON_BODY_LIMIT ||
      '1mb',
  }),
)

app.use(
  '/api',
  createRateLimit({
    windowMs:
      process.env.RATE_LIMIT_WINDOW_MS,

    max:
      process.env.RATE_LIMIT_MAX,

    maxKeys:
      process.env.RATE_LIMIT_MAX_KEYS,
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
            1 AS ok
          `,
        )

      return res.json({
        ok:
          true,

        db:
          result.rows[0]?.ok ===
          1,
      })
    } catch (
      error
    ) {
      console.error(
        '[healthcheck]',
        error,
      )

      return res
        .status(503)
        .json({
          ok:
            false,

          db:
            false,

          error:
            'Database connection failed',

          code:
            'DATABASE_CONNECTION_FAILED',

          requestId:
            req.requestId,
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

/*
 * Toda ruta de negocio exige una sesión válida y un perfil
 * operativo activo. Los routers más nuevos conservan sus
 * validaciones específicas de jerarquía y territorio.
 */
app.use(
  '/api',
  requireAuth,
  requireOperationalProfile,
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
  requireRoles(
    'DIRECTOR',
    'GERENTE',
    'COORDINADOR',
    'JEFE_TRAFICO',
  ),
  computeRoutes,
)

app.post(
  '/api/routes/static-map',
  requireRoles(
    'DIRECTOR',
    'GERENTE',
    'COORDINADOR',
    'JEFE_TRAFICO',
  ),
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

        requestId:
          req.requestId,
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
          isProduction
            ? undefined
            : err?.stack,

        requestId:
          req.requestId,
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

    const publicMessage =
      status >=
      500
        ? 'Internal Server Error'
        : err?.message ||
          'Request failed'

    return res
      .status(status)
      .json({
        error:
          publicMessage,

        code:
          err?.code ||
          'INTERNAL_SERVER_ERROR',

        requestId:
          req.requestId,
      })
  },
)

// ============================================================
// SERVER
// ============================================================

const defaultPort =
  Number(
    process.env.PORT ||
    4000,
  )

let server =
  null

export function startServer({
  port = defaultPort,
} = {}) {
  if (server) {
    return server
  }

  server =
    app.listen(
      port,
      '0.0.0.0',
      async () => {
        const address =
          server.address()

        const listeningPort =
          typeof address ===
            'object' &&
          address
            ? address.port
            : port

        console.log(
          `API listening on port ${listeningPort}`,
        )

        console.log(
          'Allowed origins:',
          allowedOrigins,
        )

        try {
          await pool.query(
            `
            SELECT
              1 AS ok
            `,
          )

          console.log(
            'Database connection ready',
          )
        } catch (
          error
        ) {
          console.error(
            'Database connection failed:',
            error?.message ||
            error,
          )
        }
      },
    )

  return server
}

const isDirectExecution =
  Boolean(
    process.argv[1],
  ) &&
  pathToFileURL(
    process.argv[1],
  ).href ===
    import.meta.url

if (
  isDirectExecution
) {
  startServer()
}

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
    `${signal} received. Closing API...`,
  )

  if (!server) {
    return
  }

  server.close(
    async error => {
      if (error) {
        console.error(
          'Error closing HTTP server:',
          error,
        )

        process.exitCode =
          1

        return
      }

      try {
        await pool.end()

        console.log(
          'Database pool closed',
        )
      } catch (
        poolError
      ) {
        console.error(
          'Error closing database pool:',
          poolError,
        )

        process.exitCode =
          1
      }
    },
  )
}

if (
  isDirectExecution
) {
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
}

export {
  app,
  allowedOrigins,
  shutdown,
}
