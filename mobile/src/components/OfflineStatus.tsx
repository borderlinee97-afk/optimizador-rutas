import { useNetInfo } from '@react-native-community/netinfo'
import { Pressable, Text, View } from 'react-native'
import { type Href, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { usePlan } from '../context/PlanContext'

export function OfflineStatus() {
  const { profile, profileValidatedAt, legacyDataPreserved } = useAuth()
  const { lastSyncedAt, downloadWindow } = usePlan()
  const network = useNetInfo()
  if (profile?.area !== 'FARMACIAS') return null
  const disconnected = network.isConnected === false || network.isInternetReachable === false
  if (!disconnected) return null
  const format = (timestamp: number) => new Date(timestamp).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
  return (
    <SafeAreaView edges={['top']} className="bg-amber-50">
      <View accessibilityLiveRegion="polite" className="px-5 py-3">
        {disconnected ? <Text className="font-bold text-amber-900">SIN CONEXIÓN</Text> : null}
        <Text className="text-sm text-amber-900">
          {lastSyncedAt
            ? downloadWindow ? `Semana descargada: ${downloadWindow.startDate} al ${downloadWindow.endDate}. Se muestran las visitas del día. Tu ejecución se guarda en el celular y queda pendiente de sincronizar.` : 'Plan descargado disponible. Los check-in, actividades, fotos y check-out se guardan en este celular y quedan pendientes de sincronizar al recuperar conexión.'
            : 'Este usuario todavía no tiene un plan descargado en este dispositivo. Conéctate y sincroniza.'}
        </Text>
        {lastSyncedAt ? <Text className="mt-1 text-xs text-amber-900">Última sincronización del plan: {format(lastSyncedAt)}</Text> : null}
        {disconnected && profileValidatedAt ? <Text className="mt-1 text-xs text-amber-900">Perfil validado: {format(profileValidatedAt)}</Text> : null}
        {legacyDataPreserved ? <View>
          <Text className="mt-1 text-xs text-amber-900">Los datos originales de la versión anterior siguen conservados. La recuperación verifica qué registros pertenecen a tu cuenta.</Text>
          {['SUPERVISOR', 'COORDINADOR'].includes(profile.rol) ? <Pressable onPress={() => router.push('/legacy-recovery' as Href)}>
            <Text className="mt-2 text-sm font-bold text-primary-700">Revisar recuperación de mis datos</Text>
          </Pressable> : null}
        </View> : null}
      </View>
    </SafeAreaView>
  )
}
