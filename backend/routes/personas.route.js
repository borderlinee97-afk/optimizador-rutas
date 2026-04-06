import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

// GET /api/personas
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT *
      FROM personas
      ORDER BY id
    `)

    res.json(rows)
  } catch (err) {
    console.error('[personas][GET]', err)
    res.status(500).json({ error: 'Error obteniendo personas' })
  }
})

export default router