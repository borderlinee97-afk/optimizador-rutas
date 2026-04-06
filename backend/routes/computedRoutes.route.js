import { Router } from 'express'
import { createComputedRoute, getComputedRoute } from '../controllers/computedRoutes.controller.js'

const r = Router()

// Ping
r.get('/__ping', (req,res)=>res.json({ok:true}))

// Diagnóstico
console.log('[computedRoutes.route] handlers:',
  typeof createComputedRoute, typeof getComputedRoute
)

// Rutas
r.post('/', createComputedRoute)
r.get('/:id', getComputedRoute)

export default r
