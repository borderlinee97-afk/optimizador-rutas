import { Router } from 'express'
import { pool } from '../db/pool.js'
import { canAccessPersona } from '../services/hierarchyAccess.service.js'
import { createOperationalTasksService } from '../services/operationalTasks.service.js'

const router = Router()
const tasks = createOperationalTasksService({ pool, canAccessPersona })
const handle = (action, code = 200) => async (req, res, next) => {
  try {
    const actor = req.identityProfile ?? req.profile
    const result = await action(actor, req)
    return res.status(code).json(result)
  } catch (error) {
    if (error.status && error.code?.startsWith('TASK_')) {
      return res.status(error.status).json({ error: error.message, code: error.code })
    }
    return next(error)
  }
}
router.get('/', handle((actor, req) => tasks.list(actor, req.query)))
router.get('/assignees', handle(actor => tasks.assignees(actor)))
router.post('/', handle((actor, req) => tasks.create(actor, req.body ?? {}), 201))
router.get('/:taskId', handle((actor, req) => tasks.detail(actor, req.params.taskId)))
router.patch('/:taskId', handle((actor, req) => tasks.edit(actor, req.params.taskId, req.body ?? {})))
router.patch('/:taskId/status', handle((actor, req) => tasks.status(actor, req.params.taskId, req.body ?? {})))
router.post('/:taskId/comments', handle((actor, req) => tasks.comment(actor, req.params.taskId, req.body ?? {}), 201))
export default router
