import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native'
import { useNetInfo } from '@react-native-community/netinfo'
import { db, getDatabaseUserId, isDatabaseActive } from '../../storage/db'
import { listVisitEvidence } from '../lib/api'
import { isEvidenceRemoved, listLocalEvidence, rememberWithdrawnEvidence, withdrawVisitEvidence } from '../services/evidenceSync'
import type { LocalEvidence, VisitEvidenceListResponse } from '../types/evidence'

type RemotePhoto = VisitEvidenceListResponse['evidence'][number]
type Photo = { id: string; uri: string; capturedAt: string; status: string; canRemove: boolean }
type Props = { planItemId?: string; activityId?: string | null; accessToken: string; localEvidence?: LocalEvidence[]; onRemoved?: () => void }

export function EvidenceGallery({ planItemId, activityId, accessToken, localEvidence: suppliedLocalEvidence, onRemoved }: Props) {
  const network = useNetInfo()
  const database = useRef(db).current
  const owner = getDatabaseUserId(database)
  const [remote, setRemote] = useState<RemotePhoto[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const request = useRef(0)
  const online = network.isConnected !== false && network.isInternetReachable !== false
  const localEvidence = suppliedLocalEvidence ?? (planItemId ? listLocalEvidence({ planItemId, activityId }, database) : [])
  const localKey = localEvidence.map(photo => `${photo.id}:${photo.status}`).join('|')

  const refresh = useCallback(async () => {
    const sequence = ++request.current
    if (!planItemId || !owner || !isDatabaseActive(owner)) return
    if (!online) { setError('Sin conexión. Puedes abrir las fotos guardadas en este teléfono.'); return }
    setLoading(true)
    try {
      const result = await listVisitEvidence(planItemId, accessToken)
      if (sequence !== request.current || !isDatabaseActive(owner)) return
      rememberWithdrawnEvidence(result.removedEvidenceIds ?? [], database)
      setRemote(result.evidence)
      setError('')
      setImageError(false)
    } catch (err) {
      if (sequence === request.current && isDatabaseActive(owner)) setError(err instanceof Error ? err.message : 'No fue posible cargar las fotografías.')
    } finally {
      if (sequence === request.current && isDatabaseActive(owner)) setLoading(false)
    }
  }, [planItemId, accessToken, online, owner])

  useEffect(() => { void refresh(); return () => { ++request.current } }, [refresh, localKey])

  // A fresh server list is authoritative for READY photos (including photos
  // withdrawn on another device). Pending local captures remain visible.
  const remoteIds = new Set(remote?.map(photo => photo.id))
  const photosById = new Map<string, Photo>()
  const matchesActivity = (id: string | null) => activityId === undefined || id === activityId
  for (const photo of remote ?? []) {
    if (matchesActivity(photo.activityId)) photosById.set(photo.id, { id: photo.id, uri: photo.signedUrl, capturedAt: photo.capturedAt, status: 'READY', canRemove: photo.canRemove === true })
  }
  for (const photo of localEvidence) {
    if (online && remoteIds.has(photo.id)) continue
    if (matchesActivity(photo.activityId) && (photo.status !== 'READY' || remote === null || remoteIds.has(photo.id))) {
      photosById.set(photo.id, { id: photo.id, uri: photo.localUri, capturedAt: photo.capturedAt, status: photo.status, canRemove: Boolean(planItemId) })
    }
  }
  const photos = [...photosById.values()].filter(photo => !removedIds.includes(photo.id) && !isEvidenceRemoved(photo.id, database))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id))
  const selectedIndex = photos.findIndex(photo => photo.id === selectedId)
  const selected = photos[selectedIndex]

  function open(id: string) { setSelectedId(id); setImageError(false); void refresh() }
  function navigate(delta: number) { setSelectedId(photos[(selectedIndex + delta + photos.length) % photos.length]?.id ?? null); setImageError(false) }
  function askRemove() {
    if (!selected || !planItemId || removing) return
    if (!online) { Alert.alert('Se necesita conexión', 'Conéctate para confirmar el retiro de la foto. Se conservará hasta que el servidor confirme.'); return }
    const id = selected.id
    Alert.alert('¿Retirar esta fotografía?', 'Dejará de mostrarse como evidencia de la visita. El registro del retiro se conserva para revisión. Si necesitas evidencia para cerrar, agrega otra foto.', [
      { text: 'Conservar', style: 'cancel' },
      { text: 'Retirar foto', style: 'destructive', onPress: () => { void (async () => {
        setRemoving(true)
        try {
          await withdrawVisitEvidence(planItemId, id, accessToken, database)
          if (!owner || !isDatabaseActive(owner)) return
          setRemovedIds(current => [...current, id]); setSelectedId(null)
          onRemoved?.(); await refresh()
        } catch (err) {
          if (owner && isDatabaseActive(owner)) Alert.alert('La foto se conserva', err instanceof Error ? err.message : 'No se pudo confirmar el retiro. Intenta nuevamente.')
        } finally { if (owner && isDatabaseActive(owner)) setRemoving(false) }
      })() } },
    ])
  }

  return <View className="mt-3">
    {loading ? <ActivityIndicator size="small" color="#0369a1" /> : null}
    <View className="flex-row flex-wrap gap-2">
      {photos.map(photo => <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel="Ampliar evidencia fotográfica" onPress={() => open(photo.id)} className="overflow-hidden rounded-xl border border-sky-200 bg-white">
        <Image source={{ uri: photo.uri }} className="h-20 w-20" />
        <Text className={`px-1 py-1 text-center text-[9px] font-semibold ${photo.status === 'READY' ? 'text-emerald-700' : photo.status === 'FAILED' ? 'text-red-700' : 'text-amber-700'}`}>{photo.status === 'READY' ? 'SINCRONIZADA' : photo.status === 'FAILED' ? 'REVISAR' : 'PENDIENTE'}</Text>
      </Pressable>)}
    </View>
    {!loading && !photos.length && !error ? <Text className="text-xs text-slate-500">Sin fotografías en este registro.</Text> : null}
    {error ? <Text accessibilityRole="alert" className="mt-2 text-xs text-amber-800">{error}</Text> : null}
    {planItemId ? <Pressable accessibilityRole="button" onPress={() => { void refresh() }} className="mt-2 min-h-[44px] justify-center"><Text className="text-xs font-semibold text-sky-800">Actualizar fotografías · {photos.length}</Text></Pressable> : null}
    <Modal visible={Boolean(selected)} animationType="fade" onRequestClose={() => setSelectedId(null)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#071b2b' }}>
        <View className="flex-row items-center justify-between px-5 py-4">
          <Text className="font-semibold text-white">Evidencia {selectedIndex + 1} de {photos.length}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar fotografía" onPress={() => setSelectedId(null)} className="min-h-[44px] justify-center px-3"><Text className="font-semibold text-white">Cerrar</Text></Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} maximumZoomScale={4} minimumZoomScale={1}>
          {selected && !imageError ? <Image key={selected.uri} source={{ uri: selected.uri }} resizeMode="contain" style={{ width: '100%', height: 450, flex: 1 }} onError={() => setImageError(true)} accessibilityLabel="Fotografía de evidencia ampliada" /> : null}
          {imageError ? <View className="p-6"><Text className="text-white">No fue posible abrir la imagen. Actualiza su acceso e intenta nuevamente.</Text><Pressable onPress={() => { void refresh() }} className="min-h-[44px] justify-center"><Text className="font-semibold text-sky-200">Volver a cargar</Text></Pressable></View> : null}
        </ScrollView>
        <View className="px-5 py-4">
          <Text className="mb-3 text-center text-xs text-slate-200">{selected?.capturedAt ? new Date(selected.capturedAt).toLocaleString('es-MX') : ''}</Text>
          <View className="flex-row justify-between">
            <Pressable disabled={photos.length < 2 || removing} onPress={() => navigate(-1)} className="min-h-[44px] justify-center px-2"><Text className="text-white">Anterior</Text></Pressable>
            {selected?.canRemove ? <Pressable accessibilityRole="button" disabled={removing} onPress={askRemove} className="min-h-[44px] justify-center rounded-xl bg-red-800 px-4"><Text className="font-semibold text-white">{removing ? 'Retirando…' : 'Retirar foto'}</Text></Pressable> : null}
            <Pressable disabled={photos.length < 2 || removing} onPress={() => navigate(1)} className="min-h-[44px] justify-center px-2"><Text className="text-white">Siguiente</Text></Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  </View>
}
