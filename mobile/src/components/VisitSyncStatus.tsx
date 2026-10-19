import { useEffect, useState } from 'react'
import { AppState, Pressable, Text, View } from 'react-native'
import { db, isDatabaseActive } from '../../storage/db'
import { useAuth } from '../context/AuthContext'
import { usePlan } from '../context/PlanContext'
import { executionSummary, retryFailedVisitExecution } from '../services/executionSync'

export function VisitSyncStatus({ itemId }: { itemId?: string }) {
  const { session, profile, accessState }=useAuth()
  const { refresh, syncing }=usePlan()
  const [summary,setSummary]=useState({pending:0,failed:0,error:''})
  useEffect(()=>{
    const read=()=>{
      if(!session||!isDatabaseActive(session.user.id)||AppState.currentState!=='active')return
      const rows=executionSummary().filter(r=>!itemId||r.plan_item_id===itemId)
      const photos=db.getFirstSync<{total:number}>(`SELECT count(*) AS total FROM evidence_queue WHERE status<>'READY' ${itemId?'AND plan_item_id=?':''}`,itemId?[itemId]:[])
      setSummary({pending:rows.filter(r=>r.status!=='FAILED').length+Number(photos?.total??0),failed:rows.filter(r=>r.status==='FAILED').length,error:rows.find(r=>r.last_error)?.last_error??''})
    }
    read();const timer=setInterval(read,2_000);const state=AppState.addEventListener('change',read)
    return()=>{clearInterval(timer);state.remove()}
  },[session?.user.id,itemId,syncing])
  if(profile?.area!=='FARMACIAS'||(!summary.pending&&!summary.failed))return null
  return <View accessibilityLiveRegion="polite" className="mb-4 rounded-2xl border border-slate-300 bg-slate-50 p-4">
    <Text className="font-bold text-slate-900">Guardado en este celular · Pendiente de sincronización</Text>
    <Text className="mt-1 text-sm text-slate-700">{summary.pending} registros o fotos pendientes{summary.failed?` · ${summary.failed} con error`:''}. El servidor confirmará su aceptación al sincronizar.</Text>
    {summary.error?<Text className="mt-2 text-sm text-red-800">{summary.error}</Text>:null}
    {accessState==='online'?<Pressable disabled={syncing} onPress={()=>{if(session){retryFailedVisitExecution(session.user.id,itemId);void refresh()}}}>
      <Text className="mt-2 font-bold text-primary-700">{syncing?'Sincronizando…':'Reintentar sincronización'}</Text>
    </Pressable>:null}
  </View>
}
