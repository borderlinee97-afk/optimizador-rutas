import { Router } from 'express'

import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

router.get('/me', requireAuth, async (req, res) => {
  const authUser = req.auth.user

  try {
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.auth_user_id,
        p.nombre,
        p.area,
        p.rol,
        p.superior_id,
        p.activo,
        p.created_at,
        p.updated_at
      FROM public.personas p
      WHERE p.auth_user_id = $1
      LIMIT 1
      `,
      [authUser.id]
    )

    if (result.rowCount === 0) {
      return res.status(403).json({
        error: 'La cuenta no tiene un perfil operativo asignado',
        code: 'PROFILE_NOT_FOUND'
      })
    }

    const profile = result.rows[0]

    if (!profile.activo) {
      return res.status(403).json({
        error: 'La cuenta se encuentra inactiva',
        code: 'PROFILE_INACTIVE'
      })
    }

    return res.json({
      user: {
        id: authUser.id,
        email: authUser.email
      },
      profile: {
        id: profile.id,
        nombre: profile.nombre,
        area: profile.area,
        rol: profile.rol,
        superiorId: profile.superior_id,
        activo: profile.activo
      }
    })
  } catch (error) {
    console.error('Error obteniendo perfil autenticado:', error)

    return res.status(500).json({
      error: 'No fue posible obtener el perfil del usuario'
    })
  }
})

export default router