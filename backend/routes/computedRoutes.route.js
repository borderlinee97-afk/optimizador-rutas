import { Router } from 'express'
import { createComputedRoute, getComputedRoute } from '../controllers/computedRoutes.controller.js'
import {
  requireAreas,
} from '../middleware/operationalAccess.js'

const r = Router()

r.use(
  requireAreas(
    'OPERACIONES',
  ),
)

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
