import { attachActivitiesToItems } from '../services/pharmacyActivity.service.js'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  validateReportFilters,
  loadReportingData,
  buildReport,
  reportOptions,
  reportCsv,
} from '../services/farmaciasReporting.service.js'

export function createFarmaciasReportsRouter(
  dbPool = pool,
  authenticate = requireAuth
) {
  const router = Router()
  router.use(authenticate)
  router.use(async (req, res, next) => {
    try {
      const { rows } = await dbPool.query(
        `SELECT id,activo,area::text,rol::text,system_role FROM public.personas WHERE auth_user_id=$1 LIMIT 1`,
        [req.auth.user.id]
      )
      const p = rows[0]
      if (
        !p?.activo ||
        p.area !== 'FARMACIAS' ||
        !['DIRECTOR', 'GERENTE', 'COORDINADOR'].includes(p.rol)
      ) {
        return res.status(403).json({
          error:
            'Acceso exclusivo a dirección, gerencia y coordinación de Farmacias.',
        })
      }
      req.reportActor = p
      res.set('Cache-Control', 'private, no-store')
      next()
    } catch {
      res
        .status(500)
        .json({ error: 'No fue posible verificar el acceso a reportes.' })
    }
  })
  async function read(req, res, optionsOnly = false, exportData = false) {
    let client
    try {
      const filters = optionsOnly ? null : validateReportFilters(req.query)
      if (
        exportData &&
        ![
          'pending','planned',
          'people',
          'visits',
          'units',
          'daily',
          'vacations',
          'coverages',
          'weekly',
          'fortnightly',
          'monthly',
        ].includes(req.query.dataset)
      )
        return res.status(400).json({ error: 'La exportación no es válida.' })
      client = await dbPool.connect()
      await client.query(
        'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'
      )
      await client.query("SET LOCAL statement_timeout = '15000ms'")
      let result
      if (optionsOnly) result = await reportOptions(client, req.reportActor)
      else {
        const data = await loadReportingData(client, req.reportActor, filters)
        result = buildReport(data, filters, exportData)
        // Load activity text only for the visible page, using the existing mapper.
        if (!exportData) {
          const items = await attachActivitiesToItems(client, result.visits)
          result.visits = items.map((v) => ({
            ...v,
            activities: v.activities.map((a) => ({
              name: a.activityType,
              status: a.status,
              completedAt: a.completedAt,
              executionNote: a.executionNote,
              skipReason: a.skipReason,
            })),
          }))
        }
        if (
          filters.pharmacyId &&
          !result.units.length &&
          !result.visits.length
        ) {
          throw Object.assign(
            new Error(
              'La unidad no tiene registros en tu ámbito y periodo autorizados.'
            ),
            { status: 404 }
          )
        }
        if (exportData)
          result = {
            filename: `farmacias-${req.query.dataset}-${filters.startDate}-${filters.endDate}.csv`,
            csv: reportCsv(result, req.query.dataset),
          }
      }
      await client.query('COMMIT')
      res.json(result)
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      const status = error.status || 500
      if (status === 500)
        console.error('[FarmaciasReports]', error.code || 'REPORT_FAILED')
      res.status(status).json({
        error:
          status === 500
            ? 'No fue posible cargar el reporte. Intenta nuevamente o reduce el periodo.'
            : error.message,
      })
    } finally {
      client?.release()
    }
  }
  router.get('/options', (req, res) => read(req, res, true))
  router.get('/export', (req, res) => read(req, res, false, true))
  router.get('/', (req, res) => read(req, res))
  return router
}
export default createFarmaciasReportsRouter()
