import { createHash } from 'node:crypto'
import { pool } from '../db/pool.js'
import { getPharmacyAccess } from './pharmacyAccess.service.js'
import { evaluateVisitGeofence, getVisitGeofenceConfig } from './visitGeofence.service.js'
import { getEvidencePolicy, hasReadyActivityEvidence, hasReadyItemEvidence } from './evidencePolicy.service.js'
import { getActivitiesForPlanItem } from './pharmacyActivity.service.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIONS = new Set(['CHECK_IN', 'CHECK_OUT', 'ACTIVITY_DONE', 'ACTIVITY_SKIPPED'])
function fail(code, message, status = 409) { throw Object.assign(new Error(message), { code, status }) }
function day(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value))
}
export function parseOfflineEvent(input, now = Date.now()) {
  if (!UUID.test(input?.id ?? '') || !UUID.test(input?.itemId ?? '') || !ACTIONS.has(input?.action)) fail('INVALID_OFFLINE_EVENT', 'El registro offline no es válido.', 400)
  const timestamp = Date.parse(input.occurredAt)
  if (!Number.isFinite(timestamp) || timestamp > now + 300_000 || timestamp < now - 8 * 86_400_000) fail('OFFLINE_TIME_INVALID', 'La fecha de captura no es válida o supera la ventana de ocho días.', 400)
  const event = { id: input.id, itemId: input.itemId, action: input.action, occurredAt: new Date(timestamp).toISOString(),
    activityId: null, lat: null, lng: null, accuracyM: null, mocked: false, executionNote: '', skipReason: '' }
  if (input.action.startsWith('ACTIVITY_')) {
    if (!UUID.test(input.activityId ?? '')) fail('INVALID_VISIT_ACTIVITY_ID', 'La actividad no es válida.', 400)
    event.activityId = input.activityId
    event.executionNote = String(input.executionNote ?? '').trim()
    event.skipReason = String(input.skipReason ?? '').trim()
    if (event.executionNote.length > 2000 || event.skipReason.length > 1000 || (event.action === 'ACTIVITY_SKIPPED' && !event.skipReason)) fail('ACTIVITY_NOTE_INVALID', 'Revisa la nota o el motivo de la actividad.', 400)
  } else {
    if (typeof input.lat !== 'number' || typeof input.lng !== 'number' || !Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat)>90 || Math.abs(input.lng)>180) fail('INVALID_EXECUTION_COORDINATES', 'La ubicación capturada no es válida.', 400)
    event.lat=input.lat; event.lng=input.lng
    event.accuracyM=input.accuracyM ?? null; event.mocked=input.mocked === true
    if (event.accuracyM !== null && (typeof event.accuracyM !== 'number' || !Number.isFinite(event.accuracyM) || event.accuracyM < 0)) fail('INVALID_LOCATION_ACCURACY','La precisión capturada no es válida.',400)
  }
  return event
}

// Reuse the existing plan ownership/response helpers and evidence/geofence policies.
// The existing audit-event primary key is the durable idempotency receipt: no new schema.
export async function applyOfflineVisitEvent({ profile, authUserId, input, helpers, db = pool }) {
  if (!profile?.activo || profile.area !== 'FARMACIAS' || !['SUPERVISOR','COORDINADOR'].includes(profile.rol)) fail('ROLE_NOT_ALLOWED','El perfil no puede ejecutar visitas.',403)
  const event = parseOfflineEvent(input)
  const fingerprint = createHash('sha256').update(JSON.stringify(event)).digest('hex')
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('visit-execution:' || $1::text))", [profile.id])
    const actor = await client.query("SELECT id FROM public.personas WHERE id=$1 AND auth_user_id=$2 AND activo AND area::text='FARMACIAS' AND rol::text=$3 FOR SHARE", [profile.id,authUserId,profile.rol])
    if (!actor.rowCount) fail('PROFILE_INACTIVE','La cuenta no tiene un perfil activo autorizado.',403)
    const receipt = await client.query('SELECT actor_id, metadata FROM public.work_plan_event WHERE id=$1', [event.id])
    if (receipt.rowCount) {
      const row = receipt.rows[0]
      if (row.actor_id !== profile.id || row.metadata?.offlineExecution?.authUserId !== authUserId || row.metadata?.offlineExecution?.fingerprint !== fingerprint) fail('OFFLINE_IDEMPOTENCY_CONFLICT','El identificador ya pertenece a otro registro.')
      await client.query('COMMIT')
      return row.metadata.offlineExecution.result
    }
    const item = await helpers.getLockedOwnedItem(client,event.itemId,profile.id,profile.rol)
    if (!item) fail('PLAN_ITEM_NOT_FOUND','La visita no existe o no pertenece a tu cuenta.',404)
    const plan = await client.query('SELECT id,approved_at FROM public.work_plan WHERE id=$1 AND status=\'APPROVED\' AND archived_at IS NULL FOR SHARE',[item.plan_id])
    if (!plan.rowCount || item.plan_status !== 'APPROVED') fail('PLAN_NOT_APPROVED','El plan ya no está autorizado.')
    if (event.action==='CHECK_IN' && plan.rows[0].approved_at && Date.parse(event.occurredAt)<new Date(plan.rows[0].approved_at).getTime()) fail('PLAN_NOT_APPROVED_AT_CAPTURE','El check-in ocurrió antes de la aprobación del plan.')
    if (item.cancellation_request_status === 'PENDING') fail('CANCELLATION_REQUEST_PENDING','La visita tiene una cancelación pendiente.')
    const scheduled = await client.query('SELECT scheduled_date::text AS day FROM public.work_plan_item WHERE id=$1',[event.itemId])
    const scheduledDay = scheduled.rows[0].day
    if (event.action === 'CHECK_IN' && day(event.occurredAt) !== scheduledDay) fail('ITEM_NOT_SCHEDULED_TODAY','El check-in no corresponde a la fecha programada.')
    if (event.action !== 'CHECK_IN' && (!item.check_in_at || Date.parse(event.occurredAt) < new Date(item.check_in_at).getTime())) fail('OFFLINE_EVENT_ORDER_INVALID','La acción debe ocurrir después del check-in.')
    const previous = await client.query(`SELECT max((metadata->'offlineExecution'->>'occurredAt')::timestamptz) AS latest
      FROM public.work_plan_event WHERE entity_id=$1 AND actor_id=$2 AND plan_id=$3 AND metadata->'offlineExecution'->>'version'='1'`,[event.itemId,profile.id,item.plan_id])
    if (previous.rows[0]?.latest && Date.parse(event.occurredAt) < new Date(previous.rows[0].latest).getTime()) fail('OFFLINE_EVENT_ORDER_INVALID','Las acciones deben conservar el orden de captura.')
    if (event.action.startsWith('CHECK_')) {
      const complete = await helpers.getCompletePlanItem(client,event.itemId)
      const evaluation = evaluateVisitGeofence({ ...event, targetLat:complete.lat, targetLng:complete.lng },getVisitGeofenceConfig())
      if (!evaluation.allowed) fail(evaluation.code,evaluation.message,evaluation.httpStatus)
      if (event.action === 'CHECK_IN' && profile.rol === 'SUPERVISOR' && item.item_type === 'PHARMACY' && item.source === 'PLAN') {
        const access = await getPharmacyAccess(client,{pharmacyId:item.pharmacy_id,profile,accessDate:scheduledDay})
        if (!access.exists || !access.allowed) fail('PHARMACY_ACCESS_NOT_ALLOWED','La unidad ya no está dentro de tus asignaciones o coberturas.',403)
      }
      await client.query(`INSERT INTO public.visit_geofence_attempt
        (person_id,plan_item_id,action,lat,lng,accuracy_m,mocked,target_lat,target_lng,distance_m,radius_m,max_accuracy_m,result,allowed)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)`,[profile.id,event.itemId,event.action,event.lat,event.lng,event.accuracyM,event.mocked,complete.lat,complete.lng,evaluation.distanceM,evaluation.radiusM,evaluation.maxAccuracyM,evaluation.result])
    }
    const policy=getEvidencePolicy()
    if (event.action === 'CHECK_IN') {
      if (item.status !== 'PENDING') fail('ITEM_NOT_PENDING','La visita ya no está pendiente.')
      const active = await client.query(`SELECT i.id FROM public.work_plan_item i JOIN public.work_plan p ON p.id=i.plan_id
        WHERE p.supervisor_id=$1 AND i.status='IN_PROGRESS' AND i.id<>$2 LIMIT 1`,[profile.id,event.itemId])
      if (active.rowCount) fail('ACTIVE_VISIT_EXISTS','Finaliza la visita activa antes de iniciar otra.')
      await client.query(`UPDATE public.work_plan_item SET status='IN_PROGRESS',check_in_at=$2,check_in_lat=$3,check_in_lng=$4,
        check_out_at=NULL,check_out_lat=NULL,check_out_lng=NULL,dwell_seconds=NULL,updated_by=$5,updated_at=now() WHERE id=$1`,[event.itemId,event.occurredAt,event.lat,event.lng,profile.id])
    } else {
      if (item.status !== 'IN_PROGRESS') fail('ITEM_NOT_IN_PROGRESS','La visita no tiene una ejecución activa.')
      if (event.action === 'CHECK_OUT') {
        const activities=await getActivitiesForPlanItem(client,event.itemId)
        if (activities.some(a=>a.status==='PENDING')) fail('VISIT_ACTIVITIES_PENDING','Resuelve todas las actividades antes de finalizar.')
        if (!activities.length && policy.requireForCheckoutWithoutActivities && !await hasReadyItemEvidence(client,event.itemId)) fail('VISIT_EVIDENCE_REQUIRED','Falta sincronizar la evidencia de la visita.')
        await client.query(`UPDATE public.work_plan_item SET status='DONE',check_out_at=$2,check_out_lat=$3,check_out_lng=$4,
          dwell_seconds=GREATEST(0,floor(extract(epoch FROM ($2::timestamptz-check_in_at)))::int),updated_by=$5,updated_at=now() WHERE id=$1`,[event.itemId,event.occurredAt,event.lat,event.lng,profile.id])
      } else {
        if (item.item_type !== 'PHARMACY' || item.source !== 'PLAN') fail('VISIT_ACTIVITIES_NOT_ALLOWED_FOR_EXTRA_STOP','La visita no admite actividades planeadas.')
        const activity=await client.query('SELECT * FROM public.pharmacy_activity WHERE id=$1 AND plan_item_id=$2 FOR UPDATE',[event.activityId,event.itemId])
        if (!activity.rowCount) fail('VISIT_ACTIVITY_NOT_FOUND','La actividad no pertenece a esta visita.',404)
        if (activity.rows[0].status !== 'PENDING') fail('VISIT_ACTIVITY_ALREADY_RESOLVED','La actividad ya fue resuelta.')
        if (policy.requireForActivity && !await hasReadyActivityEvidence(client,event.itemId,event.activityId)) fail('ACTIVITY_EVIDENCE_REQUIRED','Falta sincronizar la evidencia de la actividad.')
        const done=event.action==='ACTIVITY_DONE'
        await client.query(`UPDATE public.pharmacy_activity SET status=$3,execution_note=NULLIF($4,''),
          completed_by=CASE WHEN $3='DONE' THEN $5::uuid ELSE NULL END,completed_at=CASE WHEN $3='DONE' THEN $6::timestamptz ELSE NULL END,
          skipped_by=CASE WHEN $3='SKIPPED' THEN $5::uuid ELSE NULL END,skipped_at=CASE WHEN $3='SKIPPED' THEN $6::timestamptz ELSE NULL END,
          skip_reason=CASE WHEN $3='SKIPPED' THEN $7 ELSE NULL END,updated_by=$5,updated_at=now() WHERE id=$1 AND plan_item_id=$2`,
        [event.activityId,event.itemId,done?'DONE':'SKIPPED',event.executionNote,profile.id,event.occurredAt,event.skipReason])
      }
    }
    const result={ok:true,operationId:event.id,item:helpers.mapPlanItem(await helpers.getCompletePlanItem(client,event.itemId)),
      activities:await getActivitiesForPlanItem(client,event.itemId)}
    await client.query(`INSERT INTO public.work_plan_event(id,plan_id,entity_type,entity_id,revision_number,event_type,actor_id,actor_area,actor_role,previous_status,new_status,metadata)
      VALUES($1,$2,'EXECUTION',$3,$4,$5,$6,'FARMACIAS',$7,$8,$9,$10::jsonb)`,
    [event.id,item.plan_id,event.itemId,item.revision_number,`OFFLINE_${event.action}`,profile.id,profile.rol,item.status,result.item.status,
      JSON.stringify({offlineExecution:{version:1,authUserId,fingerprint,occurredAt:event.occurredAt,receivedAt:new Date().toISOString(),event,result}})])
    await client.query('COMMIT')
    return result
  } catch(error) {await client.query('ROLLBACK');throw error} finally {client.release()}
}
