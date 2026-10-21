import * as Crypto from 'expo-crypto'
import { db, getDatabaseUserId, isDatabaseActive, isLegacyRecoveryActive } from '../../storage/db'
import { apiRequest, ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { AuthProfile } from '../types/auth'
import type { MobilePlanItem, MobileVisitActivity } from '../types/mobilePlan'
import { evaluateOfflineLocation } from './offlineVisitLocation'
import { syncPendingEvidence } from './evidenceSync'

export type OfflineAction = 'CHECK_IN' | 'CHECK_OUT' | 'ACTIVITY_DONE' | 'ACTIVITY_SKIPPED' | 'ACTIVITY_ADDED'
export type OfflineEvent = { id:string; itemId:string; action:OfflineAction; occurredAt:string; activityId?:string; activityType?:string; note?:string;
  lat?:number; lng?:number; accuracyM?:number|null; mocked?:boolean; executionNote?:string; skipReason?:string }
type ExecutionRow = {id:string;action_type:string;plan_item_id:string;activity_id:string|null;payload_json:string;status:string;last_error:string|null}
type ItemRow = { id:string;plan_id:string;status:string;scheduled_date:string;lat:number|null;lng:number|null;check_in_at:number|null;item_type:string;source:string;cancellation_request_status:string|null }
function assertOwner(userId:string,profile:AuthProfile,database= db) {
  if (!isDatabaseActive(userId) || getDatabaseUserId(database)!==userId || !profile.activo || profile.area!=='FARMACIAS' || !['SUPERVISOR','COORDINADOR'].includes(profile.rol)) throw new Error('No hay una cuenta local autorizada para esta visita.')
  if (isLegacyRecoveryActive(database)) throw new Error('Espera a que termine la recuperación de datos anteriores.')
}
function day(value:number) {
  const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value))
  return `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}-${parts.find(p=>p.type==='day')!.value}`
}
export function hasPendingVisitExecution(itemId?:string,database=db) {
  return Boolean(database.getFirstSync(`SELECT 1 FROM execution_outbox WHERE status<>'SYNCED' ${itemId?'AND plan_item_id=?':''} LIMIT 1`,itemId?[itemId]:[]))
}
export function executionSummary(database=db) {
  return database.getAllSync<ExecutionRow>("SELECT id,action_type,plan_item_id,activity_id,payload_json,status,last_error FROM execution_outbox WHERE status<>'SYNCED' ORDER BY created_at,rowid")
}
export function hasUsableLocalEvidence(itemId:string,activityId:string|null,database=db) {
  return Boolean(database.getFirstSync(`SELECT 1 FROM evidence_queue WHERE plan_item_id=? AND activity_id IS ? AND status IN ('PENDING','UPLOADING','READY') LIMIT 1`,[itemId,activityId]))
}
export function queueVisitExecution(userId:string,profile:AuthProfile,input:Omit<OfflineEvent,'id'|'occurredAt'>,now=Date.now(),database=db) {
  assertOwner(userId,profile,database)
  const event:OfflineEvent={...input,id:Crypto.randomUUID(),occurredAt:new Date(now).toISOString()}
  if (input.action==='ACTIVITY_ADDED') event.activityId=Crypto.randomUUID()
  database.withTransactionSync(()=>{
    const item=database.getFirstSync<ItemRow>('SELECT * FROM plan_items WHERE id=?',[input.itemId])
    if (!item) throw new Error('La visita no está descargada para esta cuenta.')
    const plan=database.getFirstSync<{status:string}>('SELECT status FROM plan_cache WHERE plan_id=?',[item.plan_id])
    // A weekly cache may have multiple plans; persist the server approval on each item.
    const window=database.getFirstSync<{plans_json:string}>("SELECT plans_json FROM plan_download_window WHERE cache_key='today'")
    const approvedPlans: {id:string;status:string}[]=window?JSON.parse(window.plans_json):[]
    const approval=approvedPlans.find(p=>p.id===item.plan_id)
    if ((approval?.status ?? plan?.status)!=='APPROVED') throw new Error('La visita necesita un plan aprobado descargado.')
    if (item.cancellation_request_status==='PENDING') throw new Error('La visita tiene una cancelación pendiente.')
    if (input.action==='CHECK_IN') {
      if (item.status!=='PENDING' || String(item.scheduled_date).slice(0,10)!==day(now)) throw new Error('La visita debe estar pendiente y programada para hoy.')
      if (database.getFirstSync("SELECT 1 FROM plan_items WHERE status='IN_PROGRESS' AND id<>? LIMIT 1",[item.id])) throw new Error('Finaliza la visita activa antes de iniciar otra.')
    } else if (item.status!=='IN_PROGRESS' || !item.check_in_at || now<item.check_in_at) throw new Error('La visita no tiene un check-in activo válido.')
    if (input.action.startsWith('CHECK_')) evaluateOfflineLocation(item,input)
    if (input.action==='ACTIVITY_ADDED') {
      if (item.item_type!=='PHARMACY' || item.source!=='PLAN') throw new Error('Esta visita no admite actividades adicionales.')
      const title=input.activityType?.trim()??'',note=input.note?.trim()??''
      if (!title || title.length>160 || note.length>1000) throw new Error('Indica una actividad de hasta 160 caracteres y una nota de hasta 1000.')
      const count=database.getFirstSync<{total:number}>("SELECT count(*) AS total FROM plan_item_activities WHERE plan_item_id=?",[item.id])
      if (Number(count?.total??0)>=50) throw new Error('Una visita no puede contener más de 50 actividades.')
      event.activityType=title;event.note=note
    } else if (input.action.startsWith('ACTIVITY_')) {
      if (item.item_type!=='PHARMACY' || item.source!=='PLAN' || !input.activityId) throw new Error('Esta visita no admite la actividad indicada.')
      const activity=database.getFirstSync<{status:string}>('SELECT status FROM plan_item_activities WHERE id=? AND plan_item_id=?',[input.activityId,item.id])
      if (activity?.status!=='PENDING') throw new Error('La actividad ya fue resuelta o no pertenece a esta visita.')
      if (!hasUsableLocalEvidence(item.id,input.activityId,database)) throw new Error('Toma y guarda una fotografía de esta actividad antes de resolverla.')
      if ((input.executionNote?.trim().length??0)>2000 || (input.skipReason?.trim().length??0)>1000 || (input.action==='ACTIVITY_SKIPPED'&&!input.skipReason?.trim())) throw new Error('Revisa la nota y el motivo de la actividad.')
    }
    if (input.action==='CHECK_OUT') {
      if (database.getFirstSync("SELECT 1 FROM plan_item_activities WHERE plan_item_id=? AND status='PENDING' LIMIT 1",[item.id])) throw new Error('Resuelve todas las actividades antes del check-out.')
      const anyActivity=database.getFirstSync('SELECT 1 FROM plan_item_activities WHERE plan_item_id=? LIMIT 1',[item.id])
      if (!anyActivity && !hasUsableLocalEvidence(item.id,null,database)) throw new Error('Toma y guarda una fotografía de la visita antes del check-out.')
    }
    database.runSync(`INSERT INTO execution_outbox(id,action_type,plan_item_id,activity_id,payload_json,status,created_at,updated_at)
      VALUES(?,?,?,?,?,'PENDING',?,?)`,[event.id,input.action,item.id,event.activityId??null,JSON.stringify(event),now,now])
    if (input.action==='CHECK_IN') database.runSync("UPDATE plan_items SET status='IN_PROGRESS',check_in_at=?,check_in_lat=?,check_in_lng=?,check_out_at=NULL,dwell_seconds=NULL WHERE id=?",[now,input.lat!,input.lng!,item.id])
    else if (input.action==='CHECK_OUT') database.runSync("UPDATE plan_items SET status='DONE',check_out_at=?,check_out_lat=?,check_out_lng=?,dwell_seconds=? WHERE id=?",[now,input.lat!,input.lng!,Math.floor((now-item.check_in_at!)/1000),item.id])
    else if (input.action==='ACTIVITY_ADDED') {
      database.runSync(`INSERT INTO plan_item_activities(id,plan_item_id,activity_type,note,ord,status,created_by,created_at,updated_by,updated_at)
        SELECT ?,?,?,?,COALESCE(MAX(ord),0)+1,'PENDING',?,?,?,? FROM plan_item_activities WHERE plan_item_id=?`,
        [event.activityId!,item.id,event.activityType!,event.note||null,profile.id,now,profile.id,now,item.id])
    } else {
      const done=input.action==='ACTIVITY_DONE'
      database.runSync(`UPDATE plan_item_activities SET status=?,execution_note=?,completed_by=?,completed_at=?,skipped_by=?,skipped_at=?,skip_reason=?,updated_by=?,updated_at=? WHERE id=? AND plan_item_id=?`,
      [done?'DONE':'SKIPPED',input.executionNote?.trim()||null,done?profile.id:null,done?now:null,done?null:profile.id,done?null:now,done?null:input.skipReason!.trim(),profile.id,now,input.activityId!,item.id])
    }
  })
  return event
}

const active=new WeakMap<typeof db,Promise<void>>()
export function syncVisitExecution(userId:string) {
  const database=db
  if (!isDatabaseActive(userId) || isLegacyRecoveryActive(database)) return Promise.resolve()
  const previous=active.get(database);if(previous)return previous
  const promise=process(userId,database).finally(()=>active.delete(database));active.set(database,promise);return promise
}
async function process(userId:string,database:typeof db) {
  const current=()=>isDatabaseActive(userId)&&db===database&&getDatabaseUserId(database)===userId&&!isLegacyRecoveryActive(database)
  const rows=executionSummary(database)
  for (const row of rows) {
    if (!current()) return
    // Legacy payloads were not authored by this verified flow; retain them for explicit review.
    let event:OfflineEvent
    try {event=JSON.parse(row.payload_json)}catch{return}
    if (event.id!==row.id || event.itemId!==row.plan_item_id || !['CHECK_IN','CHECK_OUT','ACTIVITY_DONE','ACTIVITY_SKIPPED','ACTIVITY_ADDED'].includes(event.action) || !event.occurredAt || row.status==='FAILED') return
    try {
      if (event.action!=='CHECK_IN' && event.action!=='ACTIVITY_ADDED') {
        await syncPendingEvidence('',false,{planItemId:event.itemId})
        if (!current()) return
      }
      const {data,error}=await supabase.auth.getSession()
      if(error)throw error
      if(!data.session||data.session.user.id!==userId||!current())return
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000)
      try {
        const response=await apiRequest<{ok:boolean;operationId:string;item:MobilePlanItem;activities:MobileVisitActivity[]}>(
          '/api/mobile/farmacias/offline-execution',{method:'POST',body:JSON.stringify(event),signal:controller.signal},data.session.access_token)
        if(!response.ok||response.operationId!==row.id||response.item?.id!==row.plan_item_id)throw new Error('El servidor no confirmó esta operación de visita.')
        if(event.action==='ACTIVITY_ADDED' && !response.activities?.some(activity=>activity.id===event.activityId)) throw new Error('El servidor no confirmó la actividad adicional.')
      }finally{clearTimeout(timer)}
      // Never replace newer local progress with a server response to an earlier queued event.
      database.runSync("UPDATE execution_outbox SET status='SYNCED',last_error=NULL,updated_at=? WHERE id=?",[Date.now(),row.id])
    }catch(error){
      const evidenceWaiting=error instanceof ApiError && ['ACTIVITY_EVIDENCE_REQUIRED','VISIT_EVIDENCE_REQUIRED'].includes(error.code??'')
      const retry=!(error instanceof ApiError)||[0,401,408,425,429].includes(error.status)||error.status>=500||evidenceWaiting
      database.runSync('UPDATE execution_outbox SET status=?,attempts=attempts+1,last_error=?,updated_at=? WHERE id=?',
        [retry?'PENDING':'FAILED',error instanceof Error?error.message:'No se pudo sincronizar la visita.',Date.now(),row.id])
      return
    }
  }
  if (current()) await syncPendingEvidence('')
}

export function retryFailedVisitExecution(userId:string,itemId?:string) {
  if(!isDatabaseActive(userId))return
  for(const row of executionSummary()) {
    if(row.status!=='FAILED'||(itemId&&row.plan_item_id!==itemId))continue
    try{const event:OfflineEvent=JSON.parse(row.payload_json)
      if(event.id===row.id&&event.itemId===row.plan_item_id&&event.occurredAt)db.runSync("UPDATE execution_outbox SET status='PENDING',last_error=NULL,updated_at=? WHERE id=?",[Date.now(),row.id])
    }catch{/* Preserve legacy/malformed records for explicit review. */}
  }
}
