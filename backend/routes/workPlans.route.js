import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

/**
 * POST /api/work-plans
 * Crear plan de trabajo (status = DRAFT)
 */
router.post('/', async (req, res) => {
  const {
    supervisor_id,
    period_start,
    period_end,
    items
  } = req.body

  if (
    !supervisor_id ||
    !period_start ||
    !period_end ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({ error: 'Payload incompleto' })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const planResult = await client.query(
      `
      INSERT INTO work_plan (
        supervisor_id,
        status,
        period_start,
        period_end
      )
      VALUES ($1, 'DRAFT', $2, $3)
      RETURNING id
      `,
      [supervisor_id, period_start, period_end]
    )

    const planId = planResult.rows[0].id

    for (const item of items) {
      await client.query(
        `
        INSERT INTO work_plan_item (
          plan_id,
          pharmacy_id,
          scheduled_date,
          ord,
          status
        )
        VALUES ($1, $2, $3, $4, 'PENDING')
        `,
        [planId, item.pharmacy_id, period_start, item.ord]
      )
    }

    await client.query('COMMIT')

    return res.status(201).json({
      ok: true,
      plan_id: planId
    })

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Error creando plan:', err)
    return res.status(500).json({ error: 'Error interno' })
  } finally {
    client.release()
  }
})

export default router
