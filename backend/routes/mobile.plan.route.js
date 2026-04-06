import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

/**
 * GET /api/mobile/plan/today
 * Devuelve el plan activo del supervisor
 */
router.get('/plan/today', async (req, res) => {
  const { supervisor_id } = req.query

  if (!supervisor_id) {
    return res.status(400).json({ error: 'supervisor_id requerido' })
  }

  try {
    // 1️⃣ Obtener el plan más reciente (DRAFT o APPROVED)
    const planResult = await pool.query(
      `
      SELECT id, status, period_start
      FROM work_plan
      WHERE supervisor_id = $1
        AND status IN ('DRAFT', 'APPROVED')
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [supervisor_id]
    )

    if (planResult.rowCount === 0) {
      return res.json({ plan: null, items: [] })
    }

    const plan = planResult.rows[0]

    // 2️⃣ Obtener los items del plan
    const itemsResult = await pool.query(
      `
      SELECT
        wpi.id            AS plan_item_id,
        f.id              AS pharmacy_id,
        f.unidad          AS name,
        f.latitud         AS lat,
        f.longitud        AS lng,
        wpi.ord,
        wpi.status
      FROM work_plan_item wpi
      JOIN farmacia f ON f.id = wpi.pharmacy_id
      WHERE wpi.plan_id = $1
      ORDER BY wpi.ord
      `,
      [plan.id]
    )

    return res.json({
      plan: {
        id: plan.id,
        status: plan.status,
        date: plan.period_start,
      },
      items: itemsResult.rows,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Error obteniendo plan' })
  }
})

export default router