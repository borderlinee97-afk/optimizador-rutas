import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import { pool } from './db/pool.js'
import { computeRoutes, getStaticRouteMap } from './routes.controller.js'

// ================== Routers ==================
import mobileRouter from './routes/mobile.route.js'
import workPlansRouter from './routes/workPlans.route.js'
import routeTemplatesRouter from './routes/routeTemplates.route.js'
import assignmentsRouter from './routes/assignments.route.js'
import computedRoutesRouter from './routes/computedRoutes.route.js'
import farmaciasRouter from './routes/farmacias.route.js'
import personasRouter from './routes/personas.route.js'

const app = express()

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://optimizador-rutas-theta.vercel.app',
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN
].filter(Boolean)

// ================== Middlewares globales ==================
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}))

app.use(express.json({ limit: '10mb' }))

app.use(helmet({
  crossOriginResourcePolicy: false
}))

// ================== Endpoints de utilidad ==================
app.get('/api/__ping', (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'development'
  })
})

app.get('/api/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT 1 AS ok')

    res.json({
      ok: true,
      db: r.rows[0].ok === 1
    })
  } catch (error) {
    console.error('Healthcheck error:', error)

    res.status(500).json({
      ok: false,
      db: false,
      error: error.message
    })
  }
})

// ================== Routers ==================
app.use('/api/mobile', mobileRouter)
app.use('/api/work-plans', workPlansRouter)
app.use('/api/route-templates', routeTemplatesRouter)
app.use('/api/assignments', assignmentsRouter)
app.use('/api/computed-routes', computedRoutesRouter)
app.use('/api/personas', personasRouter)
app.use('/api', farmaciasRouter)

// ================== Cálculo de rutas ==================
app.post('/api/routes/compute', computeRoutes)
app.post('/api/routes/static-map', getStaticRouteMap)

// ================== 404 ==================
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  })
})

// ================== Error handler global ==================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  console.error(err?.stack)

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  })
})

// ================== Start server ==================
const port = Number(process.env.PORT || 4000)

app.listen(port, async () => {
  console.log(`✅ API listening on port ${port}`)
  console.log('✅ Allowed origins:', allowedOrigins)

  try {
    const result = await pool.query('SELECT NOW() AS now')
    console.log(`✅ DB connected at ${result.rows[0].now}`)
  } catch (error) {
    console.error('❌ DB connection failed:', error.message)
  }
})