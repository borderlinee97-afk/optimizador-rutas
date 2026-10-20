import { pool } from '../db/pool.js'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail=(m,status=400)=>{throw Object.assign(new Error(m),{status})}
const validActor=a=>a?.activo&&a.area==='FARMACIAS'&&['SUPERVISOR','COORDINADOR','GERENTE'].includes(a.rol)
function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)fail('La fecha no es válida.');return v}
const map=r=>({...r,start_date:r.start_date instanceof Date?r.start_date.toISOString().slice(0,10):r.start_date,end_date:r.end_date instanceof Date?r.end_date.toISOString().slice(0,10):r.end_date})
export async function listAvailability(actor,db=pool){
 if(!validActor(actor))return {enabled:false,canRequest:false,requests:[]}
 const reviewers=await db.query(`SELECT id FROM public.personas WHERE public.can_review_farmacias_plan(id,$1::uuid)`,[actor.id])
 const {rows}=await db.query(`SELECT r.*,r.start_date::text,r.end_date::text,p.nombre AS supervisor_name,reviewer.nombre AS reviewed_by_name,
  (r.status='APPROVED' AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date BETWEEN r.start_date AND r.end_date) AS active,
  public.can_review_farmacias_plan($1::uuid,r.supervisor_id) AS can_review
  FROM public.person_availability_request r JOIN public.personas p ON p.id=r.supervisor_id
  LEFT JOIN public.personas reviewer ON reviewer.id=r.reviewed_by
  WHERE r.supervisor_id=$1::uuid OR public.can_review_farmacias_plan($1::uuid,r.supervisor_id)
  ORDER BY r.requested_at DESC LIMIT 200`,[actor.id])
 return {enabled:true,canRequest:actor.rol==='SUPERVISOR'&&reviewers.rowCount>0,requests:rows.map(map)}
}
export async function createAvailability(actor,input,db=pool){
 if(!validActor(actor)||actor.rol!=='SUPERVISOR')fail('Sólo un supervisor activo puede solicitar sus vacaciones.',403)
 const start=date(input?.startDate),end=date(input?.endDate),comment=String(input?.comment??'').trim()
 if(end<start)fail('La fecha final debe ser igual o posterior a la inicial.')
 if(!UUID.test(input?.id??''))fail('La solicitud necesita un identificador válido.')
 if(comment.length<5||comment.length>2000)fail('El comentario debe tener entre 5 y 2000 caracteres.')
 const c=await db.connect()
 try{
  await c.query('BEGIN');await c.query(`SELECT pg_advisory_xact_lock(hashtext('availability:' || $1::text))`,[actor.id])
  const scope=await c.query(`SELECT 1 FROM public.personas WHERE public.can_review_farmacias_plan(id,$1::uuid) LIMIT 1`,[actor.id])
  if(!scope.rowCount)fail('No hay un superior activo autorizado para revisar la solicitud.',409)
  const previous=await c.query('SELECT * FROM public.person_availability_request WHERE id=$1::uuid',[input.id])
  if(previous.rowCount){const r=map(previous.rows[0]);if(r.supervisor_id!==actor.id||r.start_date!==start||r.end_date!==end||r.comment!==comment)fail('El identificador pertenece a otra solicitud.',409);await c.query('COMMIT');return r}
  const overlap=await c.query(`SELECT 1 FROM public.person_availability_request WHERE supervisor_id=$1::uuid AND status IN ('PENDING_APPROVAL','APPROVED') AND start_date<=$3::date AND end_date>=$2::date`,[actor.id,start,end])
  if(overlap.rowCount)fail('Ya existe una solicitud pendiente o aprobada que coincide con esas fechas.',409)
  const r=await c.query(`INSERT INTO public.person_availability_request(id,supervisor_id,start_date,end_date,comment) VALUES($1,$2,$3,$4,$5) RETURNING *`,[input.id,actor.id,start,end,comment])
  await c.query('COMMIT');return map(r.rows[0])
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function reviewAvailability(actor,id,decision,comment,db=pool){
 if(!validActor(actor)||!['COORDINADOR','GERENTE'].includes(actor.rol))fail('Sólo un superior autorizado puede revisar vacaciones.',403)
 if(!UUID.test(id??'')||!['APPROVED','REJECTED'].includes(decision))fail('La decisión no es válida.')
 const note=String(comment??'').trim()
 if(note.length>2000||(decision==='REJECTED'&&note.length<5))fail('Indica un motivo de rechazo de al menos 5 caracteres.')
 const c=await db.connect()
 try{await c.query('BEGIN')
  const locked=await c.query(`SELECT r.* FROM public.person_availability_request r WHERE r.id=$1::uuid AND public.can_review_farmacias_plan($2::uuid,r.supervisor_id) FOR UPDATE OF r`,[id,actor.id])
  if(!locked.rowCount)fail('No tienes acceso a esta solicitud.',404)
  if(locked.rows[0].status!=='PENDING_APPROVAL')fail('La solicitud ya fue revisada.',409)
  const r=await c.query(`UPDATE public.person_availability_request SET status=$2,reviewed_by=$3,reviewed_at=now(),review_comment=$4 WHERE id=$1 RETURNING *`,[id,decision,actor.id,note||null])
  await c.query('COMMIT');return map(r.rows[0])
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
