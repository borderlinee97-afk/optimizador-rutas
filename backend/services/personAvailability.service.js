import { pool } from '../db/pool.js'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }) }
function validateActor(actor) {
  if (!actor?.activo || actor.area !== 'FARMACIAS' || !['SUPERVISOR', 'COORDINADOR'].includes(actor.rol)) fail('Este perfil no puede gestionar solicitudes de vacaciones.', 403)
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T12:00:00Z')) || new Date(value+'T12:00:00Z').toISOString().slice(0,10) !== value) fail('La fecha no es válida.')
  return value
}
export async function listAvailability(actor, db = pool) {
  validateActor(actor)
  const eligible = await db.query(`SELECT EXISTS (SELECT 1 FROM public.personas target WHERE
    public.puebla_shared_supervisor($1::uuid, target.id)
    OR (target.id = $1::uuid AND EXISTS (SELECT 1 FROM public.puebla_supervisor_coordinator l WHERE l.supervisor_id = target.id AND public.puebla_shared_supervisor(l.coordinator_id, target.id)))) AS allowed`, [actor.id])
  if (!eligible.rows[0]?.allowed) return { enabled: false, canRequest: false, requests: [] }
  const rows = await db.query(`SELECT r.*, p.nombre AS supervisor_name, reviewer.nombre AS reviewed_by_name,
      (r.status = 'APPROVED' AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date BETWEEN r.start_date AND r.end_date) AS active
    FROM public.person_availability_request r JOIN public.personas p ON p.id = r.supervisor_id
    LEFT JOIN public.personas reviewer ON reviewer.id = r.reviewed_by
    WHERE r.supervisor_id = $1::uuid OR public.puebla_shared_supervisor($1::uuid, r.supervisor_id)
    ORDER BY r.requested_at DESC LIMIT 200`, [actor.id])
  return { enabled: true, canRequest: actor.rol === 'SUPERVISOR', requests: rows.rows }
}
export async function createAvailability(actor, input, db = pool) {
  validateActor(actor)
  if (actor.rol !== 'SUPERVISOR') fail('Sólo el supervisor puede solicitar sus vacaciones.', 403)
  const start = date(input.startDate), end = date(input.endDate)
  if (end < start) fail('La fecha final debe ser igual o posterior a la inicial.')
  if (!UUID.test(input.id ?? '')) fail('La solicitud necesita un identificador válido.')
  const comment = String(input.comment ?? '').trim()
  if (comment.length < 5 || comment.length > 2000) fail('El comentario debe tener entre 5 y 2000 caracteres.')
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('availability:' || $1::text))`, [actor.id])
    const scope = await client.query(`SELECT 1 FROM public.puebla_supervisor_coordinator l WHERE l.supervisor_id = $1::uuid AND public.puebla_shared_supervisor(l.coordinator_id, l.supervisor_id) LIMIT 1`, [actor.id])
    if (!scope.rowCount) fail('Las solicitudes compartidas de vacaciones sólo están habilitadas para Puebla.', 403)
    const previous = await client.query('SELECT * FROM public.person_availability_request WHERE id = $1::uuid', [input.id])
    if (previous.rowCount) {
      const r = previous.rows[0], iso = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v).slice(0,10)
      if (r.supervisor_id !== actor.id || iso(r.start_date) !== start || iso(r.end_date) !== end || r.comment !== comment) fail('El identificador pertenece a otra solicitud.', 409)
      await client.query('COMMIT'); return r
    }
    const overlap = await client.query(`SELECT 1 FROM public.person_availability_request WHERE supervisor_id = $1::uuid AND status IN ('PENDING_APPROVAL','APPROVED') AND start_date <= $3::date AND end_date >= $2::date`, [actor.id,start,end])
    if (overlap.rowCount) fail('Ya existe una solicitud pendiente o aprobada que coincide con esas fechas.', 409)
    const result = await client.query(`INSERT INTO public.person_availability_request(id, supervisor_id, start_date, end_date, comment) VALUES($1::uuid,$2::uuid,$3::date,$4::date,$5) RETURNING *`, [input.id,actor.id,start,end,comment])
    await client.query('COMMIT'); return result.rows[0]
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}
export async function reviewAvailability(actor, id, decision, comment, db = pool) {
  validateActor(actor)
  if (actor.rol !== 'COORDINADOR') fail('Sólo un coordinador autorizado puede revisar vacaciones.', 403)
  if (!UUID.test(id ?? '') || !['APPROVED','REJECTED'].includes(decision)) fail('La decisión no es válida.')
  const note = String(comment ?? '').trim()
  if (note.length > 2000 || (decision === 'REJECTED' && note.length < 5)) fail('Indica un motivo de rechazo de al menos 5 caracteres.')
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query(`SELECT r.* FROM public.person_availability_request r WHERE r.id = $1::uuid AND r.supervisor_id <> $2::uuid AND public.puebla_shared_supervisor($2::uuid,r.supervisor_id) FOR UPDATE OF r`, [id,actor.id])
    if (!locked.rowCount) fail('No tienes acceso a esta solicitud.', 404)
    if (locked.rows[0].status !== 'PENDING_APPROVAL') fail('La solicitud ya fue revisada.', 409)
    const result = await client.query(`UPDATE public.person_availability_request SET status=$2,reviewed_by=$3::uuid,reviewed_at=now(),review_comment=$4 WHERE id=$1::uuid RETURNING *`, [id,decision,actor.id,note || null])
    await client.query('COMMIT');return result.rows[0]
  } catch(error) { await client.query('ROLLBACK');throw error } finally {client.release()}
}
