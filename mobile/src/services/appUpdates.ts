import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

const PACKAGE = 'mx.appderutas.supervision'
const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? ''
export const installedVersion = Application.nativeApplicationVersion ?? 'Desarrollo'
export const installedBuild = Number(Application.nativeBuildVersion) || 0
export type AndroidRelease = { packageName: string; version: string; versionCode: number; notes: string; publishedAt: string; sha256: string; byteSize: number }
export type UpdateResult = { status: 'available'; release: AndroidRelease } | { status: 'current' | 'unpublished' | 'unsupported' }
export const canCheckUpdates = Platform.OS === 'android' && Constants.executionEnvironment !== 'storeClient'
  && Application.applicationId === PACKAGE && installedBuild > 0

export function parseRelease(payload: unknown, currentBuild: number): UpdateResult {
  const data = payload as { available?: unknown; release?: AndroidRelease | null } | null
  if (data?.available === false && data.release === null) return { status: 'unpublished' }
  const release = data?.release
  if (data?.available !== true || !release || release.packageName !== PACKAGE || !Number.isSafeInteger(release.versionCode)
      || release.versionCode < 1 || release.versionCode > 2100000000 || typeof release.version !== 'string' || !/^[\w.+-]{1,50}$/.test(release.version)
      || typeof release.notes !== 'string' || release.notes.length > 4000 || !Number.isFinite(Date.parse(release.publishedAt))
      || !/^[a-f0-9]{64}$/.test(release.sha256 ?? '') || !Number.isSafeInteger(release.byteSize) || release.byteSize < 1 || release.byteSize > 536870912) {
    throw new Error('No se pudo comprobar la versión disponible.')
  }
  return release.versionCode > currentBuild ? { status: 'available', release } : { status: 'current' }
}

export function updateDownloadUrl(code: number) {
  const url = new URL(baseUrl)
  if (url.protocol !== 'https:' || url.username || url.password || !Number.isSafeInteger(code) || code < 1) {
    throw new Error('La actualización requiere el servidor seguro de la app.')
  }
  // Fixed backend path. A remote manifest cannot send us to an arbitrary executable URL.
  return `${baseUrl}/api/app/android/download?versionCode=${code}`
}

// Independent request: never refreshes a session, opens SQLite or waits in the login/sync path.
let pending: Promise<UpdateResult> | null = null
export function checkAppUpdate(): Promise<UpdateResult> {
  if (!canCheckUpdates) return Promise.resolve({ status: 'unsupported' })
  if (pending) return pending
  pending = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(`${baseUrl}/api/app/android/release`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('El servicio de actualizaciones no está disponible. Intenta más tarde.')
      return parseRelease(await response.json(), installedBuild)
    } finally { clearTimeout(timer) }
  })().finally(() => { pending = null })
  return pending
}
