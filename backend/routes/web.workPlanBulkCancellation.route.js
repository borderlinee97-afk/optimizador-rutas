import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { cancelRemainingVisits } from '../services/workPlanBulkCancellation.service.js'
export function createBulkCancellationRouter(db = pool, auth = requireAuth) {
  const router = Router()
  router.use(auth)
  router.post('/:planId/cancel-remaining', async (req, res) => {
    try {
      const { rows } = await db.query(
        'SELECT id,nombre,area::text,rol::text,activo FROM public.personas WHERE auth_user_id=$1::uuid',
        [req.auth.user.id]
      )
      const result = await cancelRemainingVisits(
        rows[0],
        req.params.planId,
        req.body,
        db
      )
      res.json(result)
    } catch (e) {
      res.status(e.status || 500).json({
        error: e.status
          ? e.message
          : 'No fue posible cancelar las visitas pendientes.',
      })
    }
  })
  return router
}
export default createBulkCancellationRouter()
