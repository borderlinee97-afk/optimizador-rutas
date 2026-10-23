import {Router} from 'express'
import {pool} from '../db/pool.js'
import {requireAuth} from '../middleware/requireAuth.js'
import {requireOperationalProfile} from '../middleware/operationalAccess.js'
import {assertUpdateAdmin,createAndroidReleaseAdmin} from '../services/androidReleaseAdmin.service.js'

export function createAdminAndroidUpdatesRouter({service=createAndroidReleaseAdmin(pool),auth=requireAuth,profile=requireOperationalProfile}={}){
 const router=Router()
 router.use(auth,profile,(req,res,next)=>{
  res.set('Cache-Control','no-store')
  try{assertUpdateAdmin(req.identityProfile);next()}catch(error){res.status(error.status).json({error:error.message,code:error.code})}
 })
 const run=(operation)=>async(req,res)=>{
  try{res.json(await operation(req.identityProfile,req.body))}
  catch(error){
   const missing=error.code==='42P01'
   res.status(missing?503:error.status??500).json({error:missing?'El panel requiere completar su migración de base de datos.':error.status?error.message:'No fue posible gestionar las actualizaciones. Intenta más tarde.',code:missing?'APP_UPDATES_NOT_READY':error.status?error.code:'APP_UPDATES_FAILED'})
  }
 }
 router.get('/',run(actor=>service.state(actor)))
 router.post('/prepare',run((actor,body)=>service.prepare(actor,body)))
 router.post('/publish',run((actor,body)=>service.publish(actor,body)))
 router.post('/withdraw',run((actor,body)=>service.withdraw(actor,body)))
 return router
}
export default createAdminAndroidUpdatesRouter()
