import { Router } from 'express'
import {
  listTemplates, getTemplateById, getTemplateVersion,
  createTemplate, updateTemplateHeader, createNewVersion, duplicateTemplate
} from '../controllers/routeTemplates.controller.js'

const r = Router()

// Ping de humo (útil para validar despliegue)
r.get('/__ping', (req,res)=>res.json({ok:true}))

// Rutas (Express 5 soporta async/await nativo)
r.get('/', listTemplates)
r.get('/:id', getTemplateById)
r.get('/:id/versions/:version', getTemplateVersion)
r.post('/', createTemplate)
r.patch('/:id', updateTemplateHeader)
r.post('/:id/versions', createNewVersion)
r.post('/:id/duplicate', duplicateTemplate)

export default r