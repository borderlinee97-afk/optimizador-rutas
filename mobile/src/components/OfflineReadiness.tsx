import { Text, View } from 'react-native'
import { usePlan } from '../context/PlanContext'
import { mexicoPlanDate } from '../services/planSync'

export function OfflineReadiness() {
  const { downloadWindow, lastSyncedAt, plan, syncing, error } = usePlan()
  const today = mexicoPlanDate()
  const current = Boolean(downloadWindow && downloadWindow.startDate <= today && downloadWindow.endDate >= today)
  const ready = current && Boolean(lastSyncedAt) && plan?.status === 'APPROVED'
  return <View accessibilityLiveRegion="polite" className={`mt-4 rounded-2xl border p-3 ${ready ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
    <Text className={`text-sm font-semibold ${ready ? 'text-emerald-800' : 'text-slate-800'}`}>
      {syncing ? 'Actualizando información guardada…' : ready ? 'Semana lista para trabajar sin conexión' : 'Sin semana aprobada descargada para hoy'}
    </Text>
    <Text className="mt-1 text-xs text-slate-600">
      {ready ? `${downloadWindow!.startDate} al ${downloadWindow!.endDate} · Visitas y actividades guardadas en este celular.` : 'Conéctate y pulsa Actualizar después de que autoricen tu plan.'}
    </Text>
    {ready && error ? <Text className="mt-1 text-xs text-amber-800">Hay una actualización pendiente. Consulta el aviso de sincronización.</Text> : null}
  </View>
}
