import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthProfile } from '../types/auth'

export type ProfileSnapshot = {
  userId: string
  profile: AuthProfile
  validatedAt: number
  blocked: boolean
}

const key = (userId: string) => `authorized-profile:v1:${userId}`
// Serialize writes so a late save can never undo a revocation.
let writes: Promise<unknown> = Promise.resolve()

export function isUsableSnapshot(value: unknown, userId: string): value is ProfileSnapshot {
  const snapshot = value as ProfileSnapshot | null
  const profile = snapshot?.profile
  return Boolean(snapshot && snapshot.userId === userId && !snapshot.blocked &&
    Number.isFinite(snapshot.validatedAt) && profile?.activo === true &&
    typeof profile.id === 'string' && typeof profile.nombre === 'string' &&
    ['FARMACIAS', 'OPERACIONES'].includes(profile.area) &&
    ['JEFE_TRAFICO', 'OPERADOR', 'DIRECTOR', 'GERENTE', 'COORDINADOR', 'SUPERVISOR'].includes(profile.rol))
}

export async function readProfileSnapshot(userId: string): Promise<ProfileSnapshot | null> {
  await writes.catch(() => undefined)
  try {
    const raw = await AsyncStorage.getItem(key(userId))
    const value: unknown = raw ? JSON.parse(raw) : null
    return isUsableSnapshot(value, userId) ? value : null
  } catch {
    return null
  }
}

export function saveProfileSnapshot(userId: string, profile: AuthProfile) {
  const snapshot: ProfileSnapshot = { userId, profile, validatedAt: Date.now(), blocked: false }
  const write = writes.catch(() => undefined).then(() => AsyncStorage.setItem(key(userId), JSON.stringify(snapshot)))
  writes = write
  return write.then(() => snapshot)
}

export function blockProfileSnapshot(userId: string) {
  const write = writes.catch(() => undefined).then(async () => {
    const raw = await AsyncStorage.getItem(key(userId))
    let previous: object = {}
    try { previous = raw ? JSON.parse(raw) : {} } catch { /* Preserve a denial even without a valid snapshot. */ }
    await AsyncStorage.setItem(key(userId), JSON.stringify({ ...previous, userId, blocked: true }))
  })
  writes = write
  return write
}

export function isNetworkFailure(error: unknown) {
  const value = error as { code?: string; name?: string; status?: number } | null
  return value?.code === 'NETWORK_ERROR' || value?.name === 'AuthRetryableFetchError' ||
    (value instanceof TypeError && /network|fetch|connection/i.test(value.message))
}

export function isAuthorizationFailure(error: unknown) {
  const value = error as { status?: number; code?: string } | null
  return value?.status === 401 || value?.status === 403 ||
    ['PROFILE_INACTIVE', 'PROFILE_NOT_FOUND', 'ROLE_NOT_ALLOWED'].includes(value?.code ?? '')
}
