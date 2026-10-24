import {useCallback,useState} from 'react'
import {useFocusEffect} from 'expo-router'
import {View,Text,TextInput,Pressable,Alert} from 'react-native'
import {useAuth} from '../context/AuthContext'
import {apiRequest} from '../lib/api'

export type EditAccess={today:string;minDate:string;canRequest:boolean;canEdit:boolean;canFinish:boolean;canReview:boolean;request:null|{status:string;reason:string}}
type EditRequest={id:string;plan_id:string;owner_name:string;reason:string}
export function WorkPlanEditAccess({planId='',onAccess,onUpdated,refreshKey=0}:{planId?:string;onAccess?:(value:EditAccess|null)=>void;onUpdated?:()=>void;refreshKey?:number}){
  const {session}=useAuth(),token=session?.access_token
  const [access,setAccess]=useState<EditAccess|null>(null),[requests,setRequests]=useState<EditRequest[]>([]),[reason,setReason]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const load=useCallback(async()=>{if(!token)return;try{setError('');if(planId){const result=await apiRequest<EditAccess>(`/api/mobile/work-plans/${planId}/edit-request`,{},token);setAccess(result);onAccess?.(result)}else{const result=await apiRequest<{requests:EditRequest[]}>('/api/mobile/work-plans/edit-requests',{},token);setRequests(result.requests)}}catch(e){setError(e instanceof Error?e.message:'No fue posible consultar la autorización.');setAccess(null);onAccess?.(null)}},[token,planId,onAccess,refreshKey])
  useFocusEffect(useCallback(()=>{void load()},[load]))
  async function act(id:string,action:string){if(!token||busy)return;setBusy(true);try{setError('');await apiRequest(`/api/mobile/work-plans/${id}/edit-request/${action}`,{method:'POST',body:JSON.stringify({reason:reason.trim()})},token);setReason('');setOpen(false);await load();onUpdated?.()}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.')}finally{setBusy(false)}}
  function confirm(id:string,action:string){Alert.alert('Edición del plan',action==='approve'?'¿Autorizar cambios del día vigente en adelante?':action==='finish'?'¿Finalizar el permiso de edición?':'¿Rechazar la solicitud?',[{text:'Volver',style:'cancel'},{text:'Confirmar',onPress:()=>void act(id,action)}])}
  const button=(title:string,fn:()=>void)=><Pressable disabled={busy} onPress={fn} accessibilityRole="button" className="mt-3 rounded-xl bg-blue-700 px-4 py-3"><Text className="font-bold text-white">{title}</Text></Pressable>
  if(!planId&&!requests.length&&!error)return null
  return <View className="my-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><Text className="text-lg font-bold text-slate-900">{planId?'Edición del plan':'Solicitudes de edición'}</Text><Text className="mt-2 text-sm text-slate-700">Sólo el día vigente y los posteriores. Los días anteriores y las visitas iniciadas están bloqueados. La autorización requiere internet.</Text>
    {error?<Text accessibilityRole="alert" className="mt-2 text-red-700">{error}</Text>:null}
    {planId&&access?.request?<Text className="mt-3 text-slate-900">{{PENDING:'Autorización pendiente',APPROVED:'Edición autorizada',REJECTED:'Solicitud rechazada',COMPLETED:'Edición finalizada'}[access.request.status]} · {access.request.reason}</Text>:null}
    {access?.canRequest?button('Solicitar edición',()=>setOpen(!open)):null}
    {open&&access?.canRequest?<View><Text className="mt-3 font-bold text-slate-900">Motivo de la edición</Text><TextInput accessibilityLabel="Motivo de la edición" value={reason} onChangeText={setReason} multiline maxLength={2000} placeholder="Describe qué necesitas modificar y por qué" placeholderTextColor="#64748b" textAlignVertical="top" className="mt-2 rounded-xl border border-slate-300 p-3 text-slate-900" style={{minHeight:96}}/>{reason.trim()?button('Enviar solicitud',()=>void act(planId,'request')):null}</View>:null}
    {access?.canEdit?<Text className="mt-3 text-slate-900">Puedes editar las visitas pendientes desde {access.minDate}. Al terminar, finaliza el permiso.</Text>:null}
    {access?.canFinish?button('Finalizar edición',()=>confirm(planId,'finish')):null}
    {access?.canReview?<View>{button('Autorizar edición',()=>confirm(planId,'approve'))}{button('Rechazar solicitud',()=>confirm(planId,'reject'))}</View>:null}
    {requests.map(r=><View key={r.id} className="mt-4 border-t border-slate-200 pt-3"><Text className="font-bold text-slate-900">{r.owner_name}</Text><Text className="mt-2 text-slate-700">{r.reason}</Text>{button('Autorizar edición',()=>confirm(r.plan_id,'approve'))}{button('Rechazar',()=>confirm(r.plan_id,'reject'))}</View>)}
    {button('Actualizar autorización',()=>void load())}
  </View>
}
