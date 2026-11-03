import NetInfo from '@react-native-community/netinfo'
import { apiRequest, ApiError } from '../lib/api'
import { db, getDatabaseUserId, isDatabaseActive } from '../../storage/db'
import { isNetworkFailure } from './profileCache'

export type OfflineCopy = { offline?: boolean; cachedAt?: number }
const prefix = '/api/mobile/work-plans/'

/** Only read-only plan responses, isolated in the authenticated account database. */
export async function getWorkPlanScreen<T extends object>(path: string, accessToken: string): Promise<T & OfflineCopy> {
  if (!/^\/api\/mobile\/work-plans\/(mine(?:\?includeArchived=true)?|[a-f0-9-]{36})$/.test(path)) {
    throw new Error('Consulta de plan no permitida.')
  }
  const owner = getDatabaseUserId()
  if (!owner || !isDatabaseActive(owner)) throw new Error('No hay una cuenta local autorizada.')
  const database = db
  const current = () => db === database && isDatabaseActive(owner)
  database.execSync(`CREATE TABLE IF NOT EXISTS work_plan_screen_cache (
    path TEXT PRIMARY KEY, response_json TEXT NOT NULL, saved_at INTEGER NOT NULL
  )`)
  try {
    const connection = await NetInfo.fetch()
    if (connection.isConnected === false || connection.isInternetReachable === false) {
      throw new ApiError('Sin conexión.', 0, 'NETWORK_ERROR')
    }
    if (!current()) throw new Error('La cuenta cambió durante la consulta.')
    const response = await apiRequest<T>(path, { method: 'GET' }, accessToken)
    if (!current()) throw new Error('La cuenta cambió durante la consulta.')
    database.runSync('INSERT OR REPLACE INTO work_plan_screen_cache (path,response_json,saved_at) VALUES (?,?,?)',
      [path, JSON.stringify(response), Date.now()])
    return response
  } catch (error) {
    // Permission rejections and server errors must never become cached authorizations.
    if (!current() || !isNetworkFailure(error)) throw error
    const row = database.getFirstSync<{ response_json: string; saved_at: number }>(
      'SELECT response_json,saved_at FROM work_plan_screen_cache WHERE path=?', [path])
    if (!row) throw new ApiError('Este plan no está descargado en el celular. Conéctate y actualiza Mi trabajo antes de salir sin conexión.', 0, 'NETWORK_ERROR')
    return { ...JSON.parse(row.response_json), offline: true, cachedAt: row.saved_at }
  }
}

export async function downloadWorkPlanScreens(accessToken: string, owner: string, planIds: string[]) {
  if (!isDatabaseActive(owner)) return
  const list = await getWorkPlanScreen(`${prefix}mine`, accessToken)
  if (list.offline) throw new ApiError('Falta descargar los planes con internet.', 0, 'NETWORK_ERROR')
  for (const planId of new Set(planIds)) {
    if (!isDatabaseActive(owner)) return
    const detail = await getWorkPlanScreen(`${prefix}${encodeURIComponent(planId)}`, accessToken)
    if (detail.offline) throw new ApiError('Falta descargar el detalle del plan con internet.', 0, 'NETWORK_ERROR')
  }
}
