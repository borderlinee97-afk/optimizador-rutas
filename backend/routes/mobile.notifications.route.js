import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { registerPushDevice, revokePushDevices } from '../services/planNotifications.service.js'

const router = Router()
router.use(requireAuth)

router.post('/devices', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, auth_user_id, rol::text AS rol, area::text AS area, activo
      FROM public.personas WHERE auth_user_id = $1 LIMIT 1
    `, [req.auth.user.id])
    return res.json(await registerPushDevice(rows[0], req.auth.user.id, req.body))
  } catch (error) {
    return res.status(error.status ?? 500).json({
      error: error.status ? error.message : 'No fue posible registrar las notificaciones.',
      code: 'PUSH_DEVICE_REGISTER_FAILED',
    })
  }
})

router.delete('/devices/current', async (req, res) => {
  try {
    return res.json(await revokePushDevices(req.auth.user.id))
  } catch {
    return res.status(500).json({
      error: 'No fue posible desactivar las notificaciones.',
      code: 'PUSH_DEVICE_REVOKE_FAILED',
    })
  }
})

export default router
