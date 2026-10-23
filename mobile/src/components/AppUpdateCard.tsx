import { SafeAreaView } from 'react-native-safe-area-context'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useNetInfo } from '@react-native-community/netinfo'
import { useAppUpdate } from './AppUpdateProvider'
import { canCheckUpdates, installedBuild, installedVersion } from '../services/appUpdates'
import { hasApkInstaller } from '../services/apkInstallation'

export function AppUpdateCard({ compact = false }: { compact?: boolean }) {
  const { result, checking, error, check, dismiss, dismissed, installation, update } = useAppUpdate()
  const network = useNetInfo()
  const online = network.isConnected === true && network.isInternetReachable !== false
  const release = result?.status === 'available' ? result.release : null
  const working = installation.stage === 'downloading' || installation.stage === 'verifying'
  if (compact && (!release || dismissed || !online)) return null
  const actionLabel = installation.stage === 'permission-required' ? 'Dar permiso y continuar'
    : installation.stage === 'installer-opened' ? 'Reabrir instalador' : installation.stage === 'error' ? 'Reintentar actualización' : 'Actualizar'
  return <SafeAreaView edges={compact ? ['top'] : []} accessibilityLiveRegion="polite" className={compact ? 'border-b border-blue-200 bg-blue-50 px-5 py-3' : 'mt-5 rounded-3xl border border-slate-200 bg-white p-5'}>
    <Text className="text-base font-bold text-slate-900">{release ? `Actualización disponible · ${release.version} (${release.versionCode})` : 'Actualizaciones de la app'}</Text>
    {!compact ? <Text className="mt-1 text-sm text-slate-700">Versión instalada: {installedVersion} ({installedBuild || 'desarrollo'})</Text> : null}
    {release && !compact ? <>
      <Text className="mt-2 text-sm text-slate-800">{release.notes || 'Hay una nueva versión disponible.'}</Text>
      <Text className="mt-2 text-sm text-slate-700">La app descargará la actualización y Android pedirá confirmarla. Termina la visita activa y sincroniza tus pendientes antes de actualizar. No desinstales la app.</Text>
    </> : null}
    {!compact && result?.status === 'current' ? <Text className="mt-2 text-sm text-slate-700">No hay una versión más reciente publicada.</Text> : null}
    {!compact && result?.status === 'unpublished' ? <Text className="mt-2 text-sm text-slate-700">Aún no hay una APK habilitada en este canal.</Text> : null}
    {!compact && (!canCheckUpdates || !hasApkInstaller) ? <Text className="mt-2 text-sm text-slate-700">El instalador interno requiere la primera APK con este sistema.</Text> : null}
    {error ? <Text className="mt-2 text-sm text-slate-800">{error}</Text> : null}
    {working ? <View className="mt-3 flex-row items-center gap-3">
      <ActivityIndicator color="#1265a8" />
      <Text className="text-sm font-bold text-slate-800">{installation.stage === 'downloading' ? `Descargando actualización… ${installation.percent ?? 0}%` : 'Verificando APK aprobada…'}</Text>
    </View> : null}
    {installation.stage === 'permission-required' ? <Text className="mt-2 text-sm text-slate-800">Permite que APP DE RUTAS instale actualizaciones en la pantalla de Android. Al regresar, continuará con la instalación.</Text> : null}
    {installation.stage === 'installer-opened' ? <Text className="mt-2 text-sm text-slate-800">Confirma la actualización en Android. Si cancelaste, puedes volver a abrir el instalador.</Text> : null}
    <View className="mt-3 flex-row flex-wrap gap-4">
      {release && hasApkInstaller && !working ? <Pressable accessibilityRole="button" onPress={() => { void update() }} disabled={!online || checking}><Text className="font-bold text-primary-700">{online ? actionLabel : 'Conéctate para actualizar'}</Text></Pressable> : null}
      {!compact && canCheckUpdates ? <Pressable accessibilityRole="button" onPress={() => { void check() }} disabled={checking || working}><Text className="font-bold text-primary-700">{checking ? 'Buscando…' : 'Buscar actualizaciones'}</Text></Pressable> : null}
      {compact ? <Pressable accessibilityRole="button" onPress={dismiss}><Text className="font-bold text-slate-600">{working ? 'Ocultar aviso' : 'Después'}</Text></Pressable> : null}
    </View>
  </SafeAreaView>
}
