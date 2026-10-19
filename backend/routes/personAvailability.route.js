import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { listAvailability, createAvailability, reviewAvailability } from '../services/personAvailability.service.js'
const router = Router()
router.use(requireAuth)
router.use(async (req,res,next) => {
  try {
    const {rows} = await pool.query(`SELECT id,nombre,area::text,rol::text,activo FROM public.personas WHERE auth_user_id = $1::uuid AND activo = TRUE LIMIT 1`,[req.auth.user.id])
    if (!rows[0]) return res.status(403).json({error:'No tienes un perfil activo.'})
    req.profile=rows[0];next()
  } catch(error) {next(error)}
})
const action = handler => async (req,res) => {
  try {res.json(await handler(req))} catch(error) {res.status([400,403,404,409].includes(error.status)?error.status:500).json({error:error.status?error.message:'No fue posible procesar las vacaciones.',code:'AVAILABILITY_REQUEST_FAILED'})}
}
router.get('/',action(req=>listAvailability(req.profile)))
router.post('/',action(req=>createAvailability(req.profile,req.body)))
router.post('/:id/review',action(req=>reviewAvailability(req.profile,req.params.id,req.body.decision,req.body.comment)))
export default router
