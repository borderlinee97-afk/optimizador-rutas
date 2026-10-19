import { type Href, router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { EvidenceCapture } from '../src/components/EvidenceCapture'
import { useAuth } from '../src/context/AuthContext'
import { usePlan } from '../src/context/PlanContext'
import { readRecoveredEvidenceTargets, readRecoveredVisits } from '../src/services/legacyRecovery'

export default function LegacyRecoveryScreen() {
  const { session, profile, accessState, recoverLegacy, legacyRecovery, refreshProfile } = useAuth()
  const { reloadFromCache } = usePlan()
  const userId = session?.user.id
  const allowed = profile?.area === 'FARMACIAS' && ['SUPERVISOR', 'COORDINADOR'].includes(profile.rol)
  const [visits, setVisits] = useState<ReturnType<typeof readRecoveredVisits>>([])
  const [photos, setPhotos] = useState<ReturnType<typeof readRecoveredEvidenceTargets>>([])
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => {
    if (!userId || !allowed) return
    setVisits(readRecoveredVisits(userId))
    setPhotos(readRecoveredEvidenceTargets(userId))
    reloadFromCache()
    setRevision(value => value + 1)
  }, [userId, allowed, reloadFromCache])
  useEffect(() => { reload() }, [reload])
  const recover = async () => {
    const result = await recoverLegacy()
    if (result) reload()
  }
  if (!allowed || !session) return <SafeAreaView><Text>Esta recuperación requiere una cuenta de campo de Farmacias.</Text></SafeAreaView>
  const result = legacyRecovery.result
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView contentContainerClassName="px-5 py-5 pb-12">
        <Pressable onPress={() => router.back()}><Text className="text-primary-700">← Volver</Text></Pressable>
        <Text className="mt-4 text-2xl font-bold text-slate-900">Recuperar datos anteriores</Text>
        <Text className="mt-3 text-sm leading-6 text-slate-700">
          Se comprobará en el servidor qué registros pertenecen a tu cuenta. Sólo esos registros se copiarán.
          Los originales y las fotografías se conservan sin moverlos ni borrarlos.
        </Text>
        <Text className="mt-3 text-sm leading-6 text-slate-700">
          Las visitas históricas recuperadas se consultan aquí y no se mezclan con la jornada actual.
          Esta recuperación no ejecuta operaciones pendientes ni inicia nuevas subidas.
        </Text>
        {accessState !== 'online' ? <View className="mt-4 rounded-2xl bg-amber-50 p-4">
          <Text className="text-amber-900">Necesitas conexión y un perfil validado para atribuir nuevos registros. Puedes consultar lo ya recuperado sin conexión.</Text>
          <Pressable onPress={() => { void refreshProfile() }}><Text className="mt-3 font-bold text-primary-700">Validar conexión y perfil</Text></Pressable>
        </View> : null}
        <Pressable className="mt-5 items-center rounded-2xl bg-primary-600 p-4" disabled={legacyRecovery.busy || accessState !== 'online'} onPress={() => { void recover() }}>
          {legacyRecovery.busy ? <ActivityIndicator color="white" /> : <Text className="font-bold text-white">Verificar y recuperar mis datos</Text>}
        </Pressable>
        {legacyRecovery.error ? <Text accessibilityRole="alert" className="mt-4 text-danger">{legacyRecovery.error} Los originales siguen conservados.</Text> : null}
        {result ? <View className="mt-4 rounded-2xl bg-white p-4">
          <Text className="font-bold text-slate-900">Recuperados: {result.copied} · Ya recuperados: {result.alreadyRecovered} · Confirmados en servidor: {result.confirmed}</Text>
          <Text className="mt-2 text-sm text-slate-700">Conservados sin transferir: {result.retained}.</Text>
          {result.reasons.task_actor_unverified || result.reasons.ownership_unverified ? <Text className="mt-3 text-sm text-amber-900">
            Hay registros sin prueba suficiente de propiedad. Poder ver una tarea o estar asignado actualmente no demuestra quién creó su pendiente.
            No se reasignan ni se envían desde esta cuenta. Se necesita un registro del servidor que identifique al propietario o autor exacto.
          </Text> : null}
          {Object.keys(result.reasons).some(reason => ['destination_conflict', 'claim_conflict', 'receipt_conflict', 'receipt_missing', 'legacy_changed', 'parent_conflict'].includes(reason)) ? <Text className="mt-3 text-sm text-amber-900">
            Hay registros en conflicto con una recuperación previa o con datos más recientes. No se sobrescribieron; requieren revisión antes de transferirlos.
          </Text> : null}
        </View> : null}
        <Text className="mt-6 text-lg font-bold text-slate-900">Mis visitas recuperadas</Text>
        {!visits.length ? <Text className="mt-2 text-sm text-slate-600">Todavía no hay visitas recuperadas para esta cuenta.</Text> : visits.map(visit => <Pressable key={visit.id} className="mt-3 rounded-2xl bg-white p-4" onPress={() => router.push(`/unit/${visit.id}` as Href)}>
          <Text className="font-bold text-slate-900">{visit.name}</Text>
          <Text className="mt-1 text-sm text-slate-600">Fecha de visita: {visit.scheduled_date ?? 'Sin fecha'} · Fotos pendientes: {visit.pending}</Text>
          {visit.synced_at ? <Text className="mt-1 text-xs text-slate-500">Datos descargados: {new Date(visit.synced_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</Text> : null}
        </Pressable>)}
        {photos.length ? <Text className="mt-6 text-lg font-bold text-slate-900">Mis fotografías recuperadas</Text> : null}
        {photos.map(target => <View className="mt-3" key={`${target.plan_item_id ?? target.task_id}:${revision}`}>
          <Text className="mb-2 text-sm text-slate-700">{target.task_id ? 'Evidencias de Agenda' : 'Evidencias de visita'} recuperadas. El servidor conserva la decisión final sobre el envío.</Text>
          <EvidenceCapture planItemId={target.plan_item_id ?? undefined} taskId={target.task_id ?? undefined}
            accessToken={session.access_token} disabled compact />
        </View>)}
      </ScrollView>
    </SafeAreaView>
  )
}
