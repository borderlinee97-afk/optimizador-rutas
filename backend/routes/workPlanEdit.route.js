import { isActiveAdmin } from '../services/adminReadAccess.service.js'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getEditAccess,listEditRequests,changeEditRequest } from '../services/workPlanEdit.service.js'

const router = Router()
router.use((req,res,next)=> /^\/(?:edit-requests$|[^/]+\/edit-request(?:\/|$))/.test(req.path) ? next() : next('router'))
router.use(requireAuth)
router.use(async (req,res,next) => {
  try {
    const result=await pool.query(`SELECT id,area::text,rol::text,activo,system_role FROM public.personas WHERE auth_user_id=$1 AND activo LIMIT 1`,[req.auth.user.id])
    const profile=result.rows[0]
    const adminRead = req.method==='GET' && req.originalUrl.startsWith('/api/web/') && isActiveAdmin(profile)
    if (!profile || (!adminRead && (profile.area!=='FARMACIAS' || !['SUPERVISOR','COORDINADOR','GERENTE'].includes(profile.rol)))) return res.status(403).json({error:'Tu perfil no puede gestionar solicitudes de edición.',code:'EDIT_ROLE_REQUIRED'})
    req.editActor={...profile,area:adminRead?'FARMACIAS':profile.area,system_role:adminRead?profile.system_role:undefined,channel:req.originalUrl.startsWith('/api/web/')?'WEB':'MOBILE'}
    next()
  } catch(error) { next(error) }
})
function sendError(res,error) {
  if (!error.status) console.error('[work-plan-edit]',error.code ?? error.name)
  return res.status(error.status ?? 500).json({error:error.status?error.message:'No fue posible gestionar la edición del plan.',code:error.status?error.code:'PLAN_EDIT_FAILED'})
}
router.get('/edit-requests',async (req,res)=>{
  try { res.json(await listEditRequests(pool,req.editActor)) } catch(error) {sendError(res,error)}
})
router.get('/:planId/edit-request',async (req,res)=>{
  try { res.json(await getEditAccess(pool,req.params.planId,req.editActor)) } catch(error) {sendError(res,error)}
})
for (const action of ['request','approve','reject','finish']) {
  router.post(`/:planId/edit-request/${action}`,async (req,res)=>{
    const client=await pool.connect()
    try {
      await client.query('BEGIN')
      const result=await changeEditRequest(client,{planId:req.params.planId,actor:req.editActor,action,reason:req.body?.reason})
      await client.query('COMMIT')
      res.json(result)
    } catch(error) {await client.query('ROLLBACK');sendError(res,error)} finally {client.release()}
  })
}
export default router
