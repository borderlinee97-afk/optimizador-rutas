import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { getRandomBytesAsync } from 'expo-crypto'
import { pbkdf2Async } from '@noble/hashes/pbkdf2'
import { sha256 } from '@noble/hashes/sha256'
import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'

const credentialKey = 'offline-login.v1'
const lockKey = 'auth:local-lock:v1'
const maxAge = 8 * 24 * 60 * 60 * 1000
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
export const supportsOfflineLogin = Platform.OS !== 'web'
// Same PBKDF2 parameters and record format; older APKs/Expo Go retain the JS path.
const nativeVerifier = Platform.OS === 'android'
  ? requireOptionalNativeModule<{ deriveAsync(password: string, salt: string): Promise<string | null> }>('OfflinePasswordVerifier')
  : null
type Credential = { version: 1; userId: string; email: string; salt: string; verifier: string; validatedAt: number; failures: number; lockedUntil: number }
let writes: Promise<unknown> = Promise.resolve()
function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = writes.catch(() => undefined).then(run)
  writes = next
  return next
}
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
// Explicit UTF-8 also works on Hermes versions without TextEncoder.
function utf8(value: string) {
  const encoded = encodeURIComponent(value), bytes: number[] = []
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') { bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16)); i += 2 }
    else bytes.push(encoded.charCodeAt(i))
  }
  return Uint8Array.from(bytes)
}
async function derive(password: string, salt: string) {
  // Reject malformed UTF-16 exactly as the original encoder does.
  const input = utf8(password)
  try {
    if (nativeVerifier) {
      try {
        const result = await nativeVerifier.deriveAsync(password, salt)
        if (result && /^[a-f0-9]{64}$/.test(result)) return result
      } catch { /* Native crypto unavailable: retain the established verifier. */ }
    }
    return hex(await pbkdf2Async(sha256, input, Uint8Array.from(salt.match(/../g)!, b => parseInt(b, 16)), {
      c: 600_000, dkLen: 32, asyncTick: 10,
    }))
  } finally { input.fill(0) }
}
async function readCredential(): Promise<Credential | null> {
  const raw = await SecureStore.getItemAsync(credentialKey, options)
  let c
  try { c = raw ? JSON.parse(raw) : null } catch { return null }
  return c?.version === 1 && typeof c.userId === 'string' && typeof c.email === 'string' &&
    /^[a-f0-9]{64}$/.test(c.salt) && /^[a-f0-9]{64}$/.test(c.verifier) &&
    Number.isFinite(c.validatedAt) && Number.isInteger(c.failures) && c.failures >= 0 && Number.isFinite(c.lockedUntil) ? c : null
}
async function save(c: Credential) { await SecureStore.setItemAsync(credentialKey, JSON.stringify(c), options) }

export async function isLocalLoginLocked() {
  if (!supportsOfflineLogin) return false
  try { return await AsyncStorage.getItem(lockKey) === '1' } catch { return true }
}
export async function setLocalLoginLocked(locked: boolean) {
  if (supportsOfflineLogin) await AsyncStorage.setItem(lockKey, locked ? '1' : '0')
}
// Called only after password authentication AND backend profile validation.
// Keep one account on the device; no password or duplicate session/token is saved.
export function saveOfflineLogin(userId: string, email: string, password: string) {
  return serial(async () => {
    if (!supportsOfflineLogin) return
    const salt = hex(await getRandomBytesAsync(32))
    const verifier = await derive(password, salt)
    await save({ version: 1, userId, email: email.trim().toLowerCase(), salt, verifier,
      validatedAt: Date.now(), failures: 0, lockedUntil: 0 })
  })
}
export function forgetOfflineLogin(userId?: string) {
  return serial(async () => {
    if (!supportsOfflineLogin) return
    if (!userId || (await readCredential())?.userId === userId) await SecureStore.deleteItemAsync(credentialKey, options)
  })
}
export function renewOfflineLogin(userId: string) {
  return serial(async () => {
    if (!supportsOfflineLogin) return
    const c = await readCredential()
    if (c?.userId === userId) await save({ ...c, validatedAt: Date.now() })
  })
}
export function verifyOfflineLogin(userId: string, email: string, password: string) {
  return serial(async () => {
    if (!supportsOfflineLogin) throw new Error('El primer acceso requiere internet.')
    const c = await readCredential(), now = Date.now()
    if (!c || c.userId !== userId || now < c.validatedAt - 300_000 || now - c.validatedAt > maxAge) {
      throw new Error('Inicia sesión con internet una vez para habilitar o renovar el acceso sin conexión en este dispositivo.')
    }
    if (c.lockedUntil > now) throw new Error('Demasiados intentos. Espera cinco minutos para volver a intentar el acceso sin conexión.')
    const actual = await derive(password, c.salt)
    let difference = 0
    for (let i = 0; i < c.verifier.length; i++) difference |= c.verifier.charCodeAt(i) ^ actual.charCodeAt(i)
    if (difference || c.email !== email.trim().toLowerCase()) {
      const failures = (c.lockedUntil ? 0 : c.failures) + 1
      await save({ ...c, failures, lockedUntil: failures >= 5 ? now + 300_000 : 0 })
      throw new Error('El correo o la contraseña son incorrectos para la cuenta guardada en este dispositivo.')
    }
    await save({ ...c, failures: 0, lockedUntil: 0 })
  })
}
