import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

// ==============================
// GET /api/farmacias
// ==============================
router.get('/farmacias', async (req, res) => {
  try {
    const { withCoords } = req.query

    let query = `
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
        estado
      FROM farmacia
    `

    if (withCoords === 'true') {
      query += ' WHERE latitud IS NOT NULL AND longitud IS NOT NULL'
    }

    const { rows } = await pool.query(query)
    res.json(rows)
  } catch (err) {
    console.error('[farmacias][GET]', err)
    res.status(500).json({ error: 'Error obteniendo farmacias' })
  }
})

// ==============================
// POST /api/farmacias/dificil-acceso/bulk
// ==============================
router.post('/farmacias/dificil-acceso/bulk', async (req, res) => {
  try {
    const { ids, dificilAcceso } = req.body

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids debe ser un arreglo no vacío' })
    }

    await pool.query(
      'UPDATE farmacia SET dificult_acceso = $1 WHERE id = ANY($2)',
      [dificilAcceso, ids]
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('[farmacias][BULK]', err)
    res.status(500).json({ error: 'Error actualizando farmacias' })
  }
})

export default router