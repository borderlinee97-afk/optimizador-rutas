import { Router } from 'express'
import {
  listAssignments, createAssignment, updateAssignment
} from '../controllers/assignments.controller.js'

const r = Router()

// Ping
r.get('/__ping', (req,res)=>res.json({ok:true}))

// Diagnóstico
console.log('[assignments.route] handlers:',
  typeof listAssignments, typeof createAssignment, typeof updateAssignment
)

// Rutas
r.get('/',  listAssignments)
r.post('/', createAssignment)
r.patch('/:id', updateAssignment)

export default r