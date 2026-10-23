import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { useAuth } from '../context/AuthContext'
import { apiRequest } from '../lib/api'

type Request = {id:string;supervisor_name:string;start_date:string;end_date:string;status:string;comment:string;active:boolean;reviewed_by_name?:string;review_comment?:string;can_review?:boolean}
type Response = {enabled:boolean;canRequest:boolean;requests:Request[]}

// Keep the API's date-only format; no UTC conversion is needed for display.
const displayDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/')
const dateInput = (value: string) => value.replace(/\D/g, '').slice(0, 8)
  .replace(/^(\d{4})(\d)/, '$1-$2').replace(/^(\d{4}-\d{2})(\d)/, '$1-$2')

export function AvailabilityPanel() {
  const {session,profile,accessState}=useAuth(),token=session?.access_token
  const [dataOwner,setDataOwner]=useState<string | undefined>()
  const [data,setData]=useState<Response>({enabled:false,canRequest:false,requests:[]})
  const [expanded,setExpanded]=useState(false)
  const [start,setStart]=useState(''),[end,setEnd]=useState(''),[comment,setComment]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [reviewing,setReviewing]=useState<Request|null>(null),[reason,setReason]=useState('')
  const key=useRef(Crypto.randomUUID()),owner=useRef(session?.user.id);owner.current=session?.user.id
  const load=useCallback(async()=>{if(!token||accessState!=='online'||!['SUPERVISOR','COORDINADOR','GERENTE'].includes(profile?.rol??''))return;const user=owner.current;try{const response=await apiRequest<Response>('/api/mobile/availability',{method:'GET'},token);if(owner.current===user){setData(response);setDataOwner(user)}}catch{/* Other states keep the existing interface. */}},[token,accessState,profile?.rol])
  useEffect(()=>{setData({enabled:false,canRequest:false,requests:[]});setDataOwner(undefined);setExpanded(false);setStart('');setEnd('');setComment('');setError('');setReviewing(null);setReason('');key.current=Crypto.randomUUID()},[session?.user.id])
  useFocusEffect(useCallback(()=>{void load()},[load]))
  if(!data.enabled||dataOwner!==session?.user.id||profile?.area!=='FARMACIAS')return null

  const label=(status:string)=>({PENDING_APPROVAL:'Pendiente de aprobación',APPROVED:'Aprobada',REJECTED:'Rechazada'}[status]??status)
  const pending=data.requests.filter(item=>item.status==='PENDING_APPROVAL').length
  async function send(path:string,body:unknown){if(!token||busy)return false;if(accessState!=='online'){setError('Conéctate para enviar o revisar vacaciones.');return false}setBusy(true);setError('');try{await apiRequest(path,{method:'POST',body:JSON.stringify(body)},token);await load();return true}catch(e){setError(e instanceof Error?e.message:'No fue posible guardar la solicitud.');return false}finally{setBusy(false)}}
  async function submit(){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)){
      setError('Completa ambas fechas en formato AAAA-MM-DD, por ejemplo 2026-11-02.');return
    }
    if(end<start){setError('La fecha de término no puede ser anterior a la fecha de inicio.');return}
    if(comment.trim().length<5){setError('Escribe un motivo o comentario de al menos 5 caracteres.');return}
    if(await send('/api/mobile/availability',{id:key.current,startDate:start,endDate:end,comment})){
      key.current=Crypto.randomUUID();setStart('');setEnd('');setComment('')
      Alert.alert('Solicitud enviada','Tu solicitud se envió a revisión. Puedes consultar aquí su estado.')
    }
  }
  const button=(text:string,onPress:()=>void,secondary=false)=>(
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress}
      className={`mt-3 min-h-[48px] items-center justify-center rounded-xl px-4 py-3 ${secondary?'border border-slate-300 bg-white':'bg-primary-600'} ${busy?'opacity-50':''}`}>
      <Text className={`font-bold ${secondary?'text-slate-700':'text-white'}`}>{text}</Text>
    </Pressable>
  )
  return (
    <View className="my-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <Pressable accessibilityRole="button" accessibilityLabel={expanded?'Ocultar vacaciones':'Mostrar vacaciones'}
        accessibilityHint="Despliega el formulario y el seguimiento de solicitudes"
        accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)}
        className="min-h-[76px] flex-row items-center gap-3 p-4">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
          <Ionicons name="calendar-outline" size={23} color="#0f64ad" />
        </View>
        <View className="flex-1">
          <Text className="text-lg font-bold text-slate-900">Vacaciones</Text>
          <Text className="mt-1 text-sm text-slate-600">
            {pending?`${pending} ${pending===1?'solicitud pendiente':'solicitudes pendientes'}`:data.canRequest?'Solicita un periodo y consulta su estado':'Revisa las solicitudes de tu equipo'}
          </Text>
        </View>
        <Ionicons name={expanded?'chevron-up':'chevron-down'} size={20} color="#475569" />
      </Pressable>
      {expanded?<View className="border-t border-slate-100 px-4 pb-4 pt-3">
        {data.canRequest?<>
          <Text className="text-sm leading-5 text-slate-600">Indica tu primer y último día de vacaciones, escribe un motivo o comentario y envía la solicitud a revisión. Aquí podrás consultar si está pendiente, aprobada o rechazada.</Text>
          <View className="mt-4 rounded-xl bg-slate-50 p-3">
            <Text className="font-semibold text-slate-900">Fecha de inicio</Text>
            <Text className="mb-2 mt-1 text-xs text-slate-600">Año-mes-día · Ejemplo: 2026-11-02</Text>
            <TextInput accessibilityLabel="Fecha de inicio de vacaciones, año mes día" placeholder="AAAA-MM-DD"
              placeholderTextColor="#64748b" value={start} onChangeText={value=>setStart(dateInput(value))}
              keyboardType="number-pad" maxLength={10} editable={!busy}
              style={{color:'#0f172a',backgroundColor:'#ffffff'}}
              className="min-h-[48px] rounded-xl border border-slate-300 px-3 py-3" />
            <Text className="mt-4 font-semibold text-slate-900">Fecha de término</Text>
            <Text className="mb-2 mt-1 text-xs text-slate-600">Último día de vacaciones · Ejemplo: 2026-11-06</Text>
            <TextInput accessibilityLabel="Fecha de término de vacaciones, año mes día" placeholder="AAAA-MM-DD"
              placeholderTextColor="#64748b" value={end} onChangeText={value=>setEnd(dateInput(value))}
              keyboardType="number-pad" maxLength={10} editable={!busy}
              style={{color:'#0f172a',backgroundColor:'#ffffff'}}
              className="min-h-[48px] rounded-xl border border-slate-300 px-3 py-3" />
            <Text className="mb-2 mt-4 font-semibold text-slate-900">Motivo o comentario</Text>
            <TextInput accessibilityLabel="Motivo o comentario de la solicitud de vacaciones"
              placeholder="Ejemplo: Solicito vacaciones del 2 al 6 de noviembre."
              placeholderTextColor="#64748b" value={comment} onChangeText={setComment} editable={!busy}
              maxLength={2000} multiline textAlignVertical="top" style={{color:'#0f172a',backgroundColor:'#ffffff'}}
              className="min-h-[96px] rounded-xl border border-slate-300 px-3 py-3" />
            <Text className="mt-2 text-xs text-slate-600">Obligatorio · Mínimo 5 caracteres.</Text>
            {button(busy?'Enviando…':'Enviar solicitud',()=>{void submit()})}
          </View>
        </>:null}
        {error?<Text accessibilityRole="alert" className="mt-3 text-sm text-red-700">{error}</Text>:null}
        <View className="mb-1 mt-5 flex-row items-center justify-between gap-3">
          <Text accessibilityRole="header" className="flex-1 font-bold text-slate-900">{data.canRequest?'Mis solicitudes':'Solicitudes del equipo'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Actualizar solicitudes de vacaciones" disabled={busy}
            onPress={()=>{void load()}} className="min-h-[44px] flex-row items-center gap-2 rounded-lg px-2">
            {busy?<ActivityIndicator size="small" color="#0f64ad" />:<Ionicons name="refresh-outline" size={17} color="#0f64ad" />}
            <Text className="font-semibold text-primary-600">Actualizar</Text>
          </Pressable>
        </View>
        {!data.requests.length?<Text className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{data.canRequest?'Aún no has enviado solicitudes de vacaciones.':'No hay solicitudes de vacaciones para revisar.'}</Text>:null}
        {data.requests.map(item=><View key={item.id} className="mt-3 rounded-xl border border-slate-200 p-3">
          <Text className="font-bold text-slate-900">{item.supervisor_name}</Text>
          <Text className="mt-1 text-slate-700">Del {displayDate(item.start_date)} al {displayDate(item.end_date)}</Text>
          <Text className="mt-2 font-semibold text-primary-700">{label(item.status)}{item.active?' · De vacaciones':''}</Text>
          <Text className="mt-2 text-slate-700">{item.comment}</Text>
          {item.reviewed_by_name?<Text className="mt-2 text-sm text-slate-600">Revisó: {item.reviewed_by_name}{item.review_comment?` · ${item.review_comment}`:''}</Text>:null}
          {item.can_review&&item.status==='PENDING_APPROVAL'?<View>
            {button('Aprobar solicitud',()=>Alert.alert('Vacaciones','¿Aprobar estas vacaciones?',[{text:'Cancelar',style:'cancel'},{text:'Aprobar',onPress:()=>{void send(`/api/mobile/availability/${item.id}/review`,{decision:'APPROVED'})}}]))}
            {button('Rechazar solicitud',()=>{setReviewing(item);setReason('')},true)}
          </View>:null}
        </View>)}
        {reviewing?<View className="mt-4 rounded-xl bg-slate-50 p-3">
          <Text className="font-semibold text-slate-900">Motivo del rechazo</Text>
          <Text className="mb-2 mt-1 text-sm text-slate-600">Explica el motivo con al menos 5 caracteres.</Text>
          <TextInput accessibilityLabel="Motivo del rechazo de vacaciones" placeholder="Escribe el motivo del rechazo"
            placeholderTextColor="#64748b" value={reason} onChangeText={setReason} maxLength={2000} multiline
            editable={!busy} textAlignVertical="top" style={{color:'#0f172a',backgroundColor:'#ffffff'}}
            className="min-h-[80px] rounded-xl border border-slate-300 px-3 py-3" />
          {button('Confirmar rechazo',()=>{if(reason.trim().length<5){setError('Indica al menos 5 caracteres.');return}void send(`/api/mobile/availability/${reviewing.id}/review`,{decision:'REJECTED',comment:reason}).then(ok=>{if(ok)setReviewing(null)})})}
          {button('Cancelar',()=>setReviewing(null),true)}
        </View>:null}
      </View>:null}
    </View>
  )
}
