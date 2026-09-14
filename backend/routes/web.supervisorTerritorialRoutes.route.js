import { Router } from 'express'
import { pool } from '../db/pool.js'
import { calculateAllTerritories, calculateTerritorialRoute, getTerritory, listTerritorialSupervisors,
  normalizeOrigin, normalizeReturnToOrigin, territorialError } from '../services/supervisorTerritorialRoute.service.js'

// Montado DENTRO de web.route, después de requireAuth y loadOperationalProfile.
export function createTerritorialRouter(db = pool, calculate = calculateTerritorialRoute) {
  const router = Router()
  const handle = fn => async (req, res, next) => { try { res.json(await fn(req)) } catch (e) { next(e) } }
  router.get('/', handle(async req => ({ supervisors: await listTerritorialSupervisors(db, req.profile) })))
  router.post('/calculate-all', handle(async req => {
    const returnToOrigin = normalizeReturnToOrigin(req.body?.returnToOrigin)
    const supervisors = await listTerritorialSupervisors(db, req.profile)
    return calculateAllTerritories(supervisors, async s => {
      const territory = await getTerritory(db, req.profile, s.id)
      if (!territory.origin) throw territorialError(422, 'ORIGIN_REQUIRED', 'Configura el origen habitual del supervisor')
      return calculate(territory, { returnToOrigin })
    }, returnToOrigin)
  }))
  router.get('/:supervisorId', handle(req => getTerritory(db, req.profile, req.params.supervisorId)))
  router.get('/:supervisorId/origin', handle(async req => ({ origin: (await getTerritory(db, req.profile, req.params.supervisorId)).origin })))
  router.put('/:supervisorId/origin', handle(async req => {
    const territory = await getTerritory(db, req.profile, req.params.supervisorId)
    const origin = normalizeOrigin(req.body)
    const { rows } = await db.query(`INSERT INTO public.supervisor_territorial_origin
      (supervisor_id, name, address, lat, lng, google_place_id, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (supervisor_id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address,
        lat = EXCLUDED.lat, lng = EXCLUDED.lng, google_place_id = EXCLUDED.google_place_id,
        updated_at = now(), updated_by = EXCLUDED.updated_by RETURNING *`,
    [territory.supervisor.id, origin.name, origin.address, origin.lat, origin.lng, origin.google_place_id, req.profile.id])
    return { origin: rows[0] }
  }))
  router.post('/:supervisorId/calculate', handle(async req => {
    const territory = await getTerritory(db, req.profile, req.params.supervisorId)
    if (!req.body?.origin && !territory.origin) throw territorialError(422, 'ORIGIN_REQUIRED', 'Configura o selecciona un origen')
    return calculate(territory, { origin: req.body?.origin, returnToOrigin: req.body?.returnToOrigin })
  }))
  return router
}

export default createTerritorialRouter()
