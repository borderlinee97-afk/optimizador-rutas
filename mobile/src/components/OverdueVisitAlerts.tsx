import { useCallback, useRef, useState } from 'react'
import { useFocusEffect, router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { apiRequest, ApiError } from '../lib/api'

type Visit = {id:string;planId:string;personName:string;name:string;scheduledDate:string;reason:string}
type Alerts = {total:number;visits:Visit[]}
export function OverdueVisitAlerts() {
  const {session,profile,accessState} = useAuth()
  const user = session?.user.id, token = session?.access_token
  const owner = useRef(user); owner.current = user
  const requestVersion = useRef(0)
  const [snapshot,setSnapshot] = useState<{owner:string;data:Alerts}|null>(null)
  const [error,setError] = useState(false)
  const allowed = profile?.area === 'FARMACIAS' && ['COORDINADOR','GERENTE'].includes(profile.rol)
  const load = useCallback(async () => {
    if (!allowed || !token || !user || accessState !== 'online') return
    const version = ++requestVersion.current
    setError(false)
    try {
      const data = await apiRequest<Alerts>('/api/mobile/work-plans/approvals/execution-alerts',{method:'GET'},token)
      if (owner.current === user && requestVersion.current === version) setSnapshot({owner:user,data})
    } catch (error) {
      if (owner.current === user && requestVersion.current === version) {
        if (error instanceof ApiError && [401,403].includes(error.status)) setSnapshot(null)
        setError(true)
      }
    }
  },[allowed,token,user,accessState])
  useFocusEffect(useCallback(() => { void load(); return () => {requestVersion.current++} },[load]))
  if (!allowed) return null
  const data = snapshot && snapshot.owner === user ? snapshot.data : null
  return <View className="my-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <Text accessibilityRole="header" className="text-lg font-semibold text-slate-900">Visitas que requieren revisión</Text>
    {accessState !== 'online' ? <Text className="mt-2 text-sm text-slate-700">Conéctate para actualizar este seguimiento.</Text> : null}
    {error ? <Text accessibilityRole="alert" className="mt-2 text-sm text-red-700">No se pudo actualizar el seguimiento. Reintenta para consultar los pendientes.</Text> : null}
    {data ? <>
      <Text accessibilityLiveRegion="polite" className="text-base mt-2 font-semibold text-amber-900">{data.total} visitas de días anteriores requieren revisión o aclaración.</Text>
      <Text className="mt-2 text-sm text-slate-700">El personal puede continuar las visitas de hoy. Las anteriores conservan sus entradas, actividades y evidencias.</Text>
      {data.visits.map(visit => <View key={visit.id} className="mt-3 rounded-xl bg-white p-3">
        <Text className="text-base font-semibold text-slate-900">{visit.personName}</Text>
        <Text className="text-base mt-1 text-slate-700">{visit.name} · {visit.scheduledDate.split('-').reverse().join('/')}</Text>
        <Text className="text-base mt-1 font-semibold text-amber-900">{visit.reason} · Requiere revisión o aclaración</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Revisar plan de ${visit.personName}`}
          onPress={() => router.push({pathname:'/work-plans/[id]',params:{id:visit.planId}})} className="mt-2 min-h-[48px] justify-center" android_ripple={{ color: "#096e9124" }}>
          <Text className="text-base font-semibold text-primary-600">Revisar plan</Text>
        </Pressable>
      </View>)}
      {data.total > data.visits.length ? <Text className="mt-3 text-sm text-slate-700">Se muestran las primeras {data.visits.length} visitas. Consulta los reportes web para revisar por periodo y responsable.</Text> : null}
    </> : null}
    <Pressable accessibilityRole="button" onPress={() => {void load()}} className="mt-2 min-h-[48px] justify-center" android_ripple={{ color: "#096e9124" }}>
      <Text className="text-base font-semibold text-primary-600">Actualizar seguimiento</Text>
    </Pressable>
  </View>
}
