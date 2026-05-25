import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

const DEFAULT_PROJECT = 'JALISCO'

function normalizeProject(value) {
  return String(value || DEFAULT_PROJECT).trim().toUpperCase()
}

// ==============================
// GET /api/farmacias
// ==============================
router.get('/farmacias', async (req, res) => {
  try {
    const { withCoords } = req.query
    const proyecto = req.query.proyecto
      ? normalizeProject(req.query.proyecto)
      : null

    const conditions = []
    const params = []

    if (proyecto) {
      params.push(proyecto)
      conditions.push(`proyecto = $${params.length}`)
    }

    const query = `
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
        estado,
        proyecto
      FROM public.farmacia
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY region_sanitaria NULLS LAST, clues ASC
    `

    const { rows } = await pool.query(query, params)
    return res.json(rows)
  } catch (err) {
    console.error('[farmacias][GET]', err)
    return res.status(500).json({
      error: 'Error obteniendo farmacias',
      details: err.message
    })
  }
})

// ==============================
// GET /api/proyecto-cedis
// Ejemplo:
// /api/proyecto-cedis?proyecto=JALISCO
// ==============================
router.get('/proyecto-cedis', async (req, res) => {
  try {
    const proyecto = normalizeProject(req.query.proyecto)

    const { rows } = await pool.query(
      `
        SELECT
          id,
          proyecto,
          nombre,
          clues,
          latitud,
          longitud,
          timezone,
          horas_turno,
          hora_limite_llegada_ultima_unidad,
          minutos_servicio_por_unidad,
          activo,
          es_principal
        FROM public.proyecto_cedis
        WHERE proyecto = $1
          AND activo = true
        ORDER BY es_principal DESC, nombre ASC
      `,
      [proyecto]
    )

    return res.json(rows)
  } catch (err) {
    console.error('[proyecto-cedis][GET]', err)
    return res.status(500).json({
      error: 'Error obteniendo CEDIS del proyecto',
      details: err.message
    })
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

    // Nota: este endpoint se deja igual de funcionalidad general.
    // Si difícil acceso se maneja con tabla farmacia_dificil_acceso,
    // conviene ajustarlo después.
    await pool.query(
      'UPDATE public.farmacia SET dificil_acceso = $1 WHERE id = ANY($2)',
      [dificilAcceso, ids]
    )

    return res.json({ ok: true })
  } catch (err) {
    console.error('[farmacias][BULK]', err)
    return res.status(500).json({
      error: 'Error actualizando farmacias',
      details: err.message
    })
  }
})

export default router