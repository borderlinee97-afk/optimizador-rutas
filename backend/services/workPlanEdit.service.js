import { planDownloadWindow } from './planDownloadWindow.js'
import { appendWorkPlanEvent } from './workPlanAudit.service.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const editToday = (now = new Date()) => planDownloadWindow('day', now).startDate
const date = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value ?? '').slice(0,10)
function fail(code, message, status = 409) { throw Object.assign(new Error(message), {code,status}) }
function validateActor(actor) {
  if (!actor?.activo || actor.area !== 'FARMACIAS' || !['SUPERVISOR','COORDINADOR','GERENTE'].includes(actor.rol)) fail('EDIT_ROLE_REQUIRED','Tu perfil no puede gestionar solicitudes de edición.',403)
}
export function assertEditDates(plan, ...dates) {
  const today = editToday()
  const minimum = [today,date(plan.period_start),plan.editAuthorization?.from_date ? date(plan.editAuthorization.from_date) : today].sort().at(-1)
  for (const value of dates) {
    const day = date(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < minimum || day > date(plan.period_end)) {
      fail('PLAN_EDIT_DATE_LOCKED','Sólo puedes modificar el día vigente y los posteriores dentro del periodo del plan. Los días anteriores están bloqueados.')
    }
  }
}
export function assertUnstartedItem(item) {
  if (!item || item.status !== 'PENDING' || item.check_in_at || item.check_out_at || item.removed_at || item.cancellation_request_status === 'PENDING') fail('PLAN_EDIT_ITEM_LOCKED','La visita ya fue iniciada, resuelta, retirada o tiene una cancelación pendiente.')
}
export async function attachEditAuthorization(client, plan) {
  if (plan?.status !== 'APPROVED') return plan
  const result = await client.query(`SELECT * FROM public.work_plan_edit_request
    WHERE plan_id=$1 AND owner_id=$2 AND revision_number=$3 AND status='APPROVED'
    ORDER BY requested_at DESC LIMIT 1`,[plan.id,plan.supervisor_id,plan.revision_number])
  plan.editAuthorization = result.rows[0] ?? null
  return plan
}
async function accessiblePlan(client, planId, actor, lock = false) {
  validateActor(actor)
  if (!UUID.test(String(planId))) fail('INVALID_WORK_PLAN_ID','Identificador de plan inválido.',400)
  const result = await client.query(`SELECT p.*, public.can_review_farmacias_plan($2::uuid,p.supervisor_id) AS can_review
    FROM public.work_plan p JOIN public.personas owner ON owner.id=p.supervisor_id
    WHERE p.id=$1 AND owner.activo AND owner.area::text='FARMACIAS'
      AND (p.supervisor_id=$2 OR public.can_review_farmacias_plan($2::uuid,p.supervisor_id))
    ${lock ? 'FOR UPDATE OF p' : ''}`,[planId,actor.id])
  if (!result.rows[0]) fail('WORK_PLAN_NOT_FOUND','El plan no existe o no pertenece a tu estructura.',404)
  return result.rows[0]
}
function eligible(plan) { return plan.status === 'APPROVED' && !plan.archived_at && date(plan.period_end) >= editToday() }
export async function getEditAccess(client, planId, actor) {
  const plan = await accessiblePlan(client,planId,actor)
  const result = await client.query('SELECT * FROM public.work_plan_edit_request WHERE plan_id=$1 ORDER BY requested_at DESC LIMIT 1',[planId])
  const request = result.rows[0] ?? null
  const owner = plan.supervisor_id === actor.id
  const valid = eligible(plan)
  const current = request?.revision_number === plan.revision_number
  const open = current && ['PENDING','APPROVED'].includes(request?.status)
  return {today:editToday(),request,canRequest:owner && valid && !open,
    canEdit:owner && valid && current && request?.status==='APPROVED',
    canReview:!owner && valid && plan.can_review && current && request?.status==='PENDING',
    canFinish:owner && current && request?.status==='APPROVED',
    minDate:[editToday(),date(plan.period_start),date(request?.from_date)].sort().at(-1)}
}
export async function listEditRequests(client, actor) {
  validateActor(actor)
  const result = await client.query(`SELECT r.*,o.nombre AS owner_name,p.plan_type,p.period_start,p.period_end
    FROM public.work_plan_edit_request r JOIN public.work_plan p ON p.id=r.plan_id JOIN public.personas o ON o.id=p.supervisor_id
    WHERE r.status='PENDING' AND p.status::text='APPROVED' AND p.archived_at IS NULL
      AND r.revision_number=p.revision_number AND o.activo
      AND p.period_end >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date
      AND public.can_review_farmacias_plan($1::uuid,p.supervisor_id)
    ORDER BY r.requested_at ASC LIMIT 200`,[actor.id])
  return {requests:result.rows}
}
export async function changeEditRequest(client, {planId,actor,action,reason}) {
  const plan = await accessiblePlan(client,planId,actor,true)
  const owner = actor.id === plan.supervisor_id
  const found = await client.query('SELECT * FROM public.work_plan_edit_request WHERE plan_id=$1 ORDER BY requested_at DESC LIMIT 1 FOR UPDATE',[planId])
  const previous = found.rows[0]
  let request
  if (action === 'request') {
    if (!owner) fail('EDIT_OWNER_REQUIRED','Sólo el responsable del plan puede solicitar su edición.',403)
    if (!eligible(plan)) fail('PLAN_NOT_CURRENT_APPROVED','Sólo puedes solicitar edición de un plan aprobado que no haya terminado.')
    if (previous?.revision_number === plan.revision_number && ['PENDING','APPROVED'].includes(previous.status)) fail('EDIT_REQUEST_ALREADY_OPEN','Ya existe una solicitud o autorización de edición abierta.')
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length>2000) fail('EDIT_REASON_REQUIRED','Indica el motivo de la edición (máximo 2,000 caracteres).',400)
    // Retire an obsolete open grant if another revision was submitted elsewhere.
    await client.query("UPDATE public.work_plan_edit_request SET status='COMPLETED',completed_at=now() WHERE plan_id=$1 AND status IN ('PENDING','APPROVED')",[planId])
    request = (await client.query(`INSERT INTO public.work_plan_edit_request(plan_id,owner_id,revision_number,reason,from_date)
      VALUES($1,$2,$3,$4,$5::date) RETURNING *`,[planId,actor.id,plan.revision_number,reason.trim(),[editToday(),date(plan.period_start)].sort().at(-1)])).rows[0]
  } else {
    if (!previous || previous.revision_number !== plan.revision_number) fail('EDIT_REQUEST_NOT_CURRENT','No existe una solicitud vigente para esta revisión.')
    if (action === 'finish') {
      if (!owner) fail('EDIT_OWNER_REQUIRED','Sólo el responsable puede finalizar la edición.',403)
      if (previous.status !== 'APPROVED') fail('EDIT_REQUEST_NOT_APPROVED','La edición no está autorizada.')
    } else {
      if (owner || !plan.can_review) fail('EDIT_REVIEW_FORBIDDEN','No puedes autorizar esta solicitud.',403)
      if (!['approve','reject'].includes(action) || previous.status !== 'PENDING' || !eligible(plan)) fail('EDIT_REQUEST_NOT_PENDING','La solicitud ya fue resuelta o el plan terminó.')
    }
    const status = {approve:'APPROVED',reject:'REJECTED',finish:'COMPLETED'}[action]
    request = (await client.query(`UPDATE public.work_plan_edit_request SET status=$2,
      reviewed_by=CASE WHEN $2='COMPLETED' THEN reviewed_by ELSE $3::uuid END,
      reviewed_at=CASE WHEN $2='COMPLETED' THEN reviewed_at ELSE now() END,
      completed_at=CASE WHEN $2='COMPLETED' THEN now() ELSE NULL END WHERE id=$1 RETURNING *`,[previous.id,status,actor.id])).rows[0]
  }
  await appendWorkPlanEvent(client,{planId,entityType:'PLAN',entityId:request.id,revisionNumber:plan.revision_number,
    eventType:`EDIT_${action.toUpperCase()}`,actor,beforeData:previous ?? null,afterData:request,
    metadata:{channel:actor.channel,timezone:'America/Mexico_City',editableFrom:date(request.from_date)}})
  return {ok:true,request}
}
