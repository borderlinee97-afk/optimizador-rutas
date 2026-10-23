import { useEffect, useState } from 'react'
import { AppState, Pressable, Text, View } from 'react-native'
import { db, isDatabaseActive } from '../../storage/db'
import { useAuth } from '../context/AuthContext'
import { usePlan } from '../context/PlanContext'
import { executionSummary, retryPendingVisitSync } from '../services/executionSync'

export function VisitSyncStatus({ itemId }: { itemId?: string }) {
  const { session, profile, accessState } = useAuth()
  const { refresh, syncing } = usePlan()
  const [summary, setSummary] = useState({ pending: 0, failed: 0, error: '' })
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState('')
  useEffect(() => {
    const read = () => {
      if (!session || !isDatabaseActive(session.user.id) || AppState.currentState !== 'active') return
      const rows = executionSummary().filter(r => !itemId || r.plan_item_id === itemId)
      const where = `status<>'READY' ${itemId ? 'AND plan_item_id=?' : ''}`
      const params = itemId ? [itemId] : []
      const photos = db.getFirstSync<{ total: number; failed: number }>(
        `SELECT count(*) AS total, COALESCE(sum(CASE WHEN status='FAILED' THEN 1 ELSE 0 END),0) AS failed FROM evidence_queue WHERE ${where}`, params)
      const photoError = db.getFirstSync<{ last_error: string }>(
        `SELECT last_error FROM evidence_queue WHERE ${where} AND last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 1`, params)
      setSummary({
        pending: rows.length + Number(photos?.total ?? 0),
        failed: rows.filter(r => r.status === 'FAILED').length + Number(photos?.failed ?? 0),
        error: rows.find(r => r.last_error)?.last_error ?? photoError?.last_error ?? '',
      })
    }
    read()
    const timer = setInterval(read, 2_000)
    const state = AppState.addEventListener('change', read)
    return () => { clearInterval(timer); state.remove() }
  }, [session?.user.id, itemId, syncing, retrying])
  async function retry() {
    if (!session || retrying || syncing || accessState !== 'online') return
    setRetrying(true); setRetryError('')
    try { await retryPendingVisitSync(session.user.id, refresh, itemId) }
    catch (error) { setRetryError(error instanceof Error ? error.message : 'No se pudo sincronizar. Los registros siguen guardados en este celular.') }
    finally { setRetrying(false) }
  }
  if (profile?.area !== 'FARMACIAS' || (!summary.pending && !retryError)) return null
  return <View accessibilityLiveRegion="polite" className="mb-4 rounded-2xl border border-slate-300 bg-slate-50 p-4">
    <Text className="font-bold text-slate-900">Guardado en este celular · Pendiente de sincronización</Text>
    <Text className="mt-1 text-sm text-slate-700">{summary.pending} registros o fotos pendientes{summary.failed ? ` · ${summary.failed} con error` : ''}. El servidor confirmará su aceptación al sincronizar.</Text>
    {retryError || summary.error ? <Text className="mt-2 text-sm text-red-800">{retryError || summary.error}</Text> : null}
    {accessState === 'online' ? <Pressable disabled={syncing || retrying} onPress={() => { void retry() }}>
      <Text className="mt-2 font-bold text-primary-700">{syncing || retrying ? 'Sincronizando…' : 'Reintentar sincronización'}</Text>
    </Pressable> : null}
  </View>
}
