import { Router } from 'express'
import {
  listTemplates, getTemplateById, getTemplateVersion,
  createTemplate, updateTemplateHeader, createNewVersion, duplicateTemplate
} from '../controllers/routeTemplates.controller.js'

const r = Router()

// Ping de humo (útil para validar despliegue)
r.get('/__ping', (req,res)=>res.json({ok:true}))

// Log de diagnóstico: deben ser 'function'
console.log('[routeTemplates.route] handlers:',
  typeof listTemplates, typeof getTemplateById, typeof getTemplateVersion,
  typeof createTemplate, typeof updateTemplateHeader, typeof createNewVersion, typeof duplicateTemplate
)

// Rutas (Express 5 soporta async/await nativo)
r.get('/', listTemplates)
r.get('/:id', getTemplateById)
r.get('/:id/versions/:version', getTemplateVersion)
r.post('/', createTemplate)
r.patch('/:id', updateTemplateHeader)
r.post('/:id/versions', createNewVersion)
r.post('/:id/duplicate', duplicateTemplate)

export default r