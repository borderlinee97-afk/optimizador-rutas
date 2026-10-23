import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const ANDROID_PACKAGE = 'mx.appderutas.supervision'
export const MAX_APK_BYTES = 536870912
export const EXPO_PROJECT = '2e1997e4-1a88-4623-afe6-3a3a58a95998'
const manifestPath = new URL('../config/android-release.json', import.meta.url)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Only permanent EAS artifact links; signed CDN links expire and must never be published.
export function validateAndroidRelease(value) {
  if (!value || value.packageName !== ANDROID_PACKAGE || value.projectId !== EXPO_PROJECT
      || !Number.isSafeInteger(value.versionCode) || value.versionCode < 1 || value.versionCode > 2100000000
      || typeof value.version !== 'string' || !/^[\w.+-]{1,50}$/.test(value.version)
      || !uuid.test(value.buildId ?? '') || !Number.isFinite(Date.parse(value.publishedAt))
      || typeof value.notes !== 'string' || value.notes.length > 4000
      || !/^[a-f0-9]{64}$/.test(value.sha256 ?? '')
      || !Number.isSafeInteger(value.byteSize) || value.byteSize < 1 || value.byteSize > MAX_APK_BYTES) {
    throw new Error('Metadatos de versión Android inválidos')
  }
  const url = new URL(value.artifactUrl)
  if (url.protocol !== 'https:' || url.hostname !== 'expo.dev' || url.port || url.username || url.password
      || url.search || url.hash || !/^\/artifacts\/eas\/[a-zA-Z0-9_-]+\.apk$/.test(url.pathname)) {
    throw new Error('Se requiere el enlace APK permanente de Expo; no un enlace temporal ni una AAB')
  }
  return {
    packageName: ANDROID_PACKAGE, projectId: EXPO_PROJECT, version: value.version,
    versionCode: value.versionCode, buildId: value.buildId, artifactUrl: url.href,
    publishedAt: new Date(value.publishedAt).toISOString(), notes: value.notes, sha256: value.sha256, byteSize: value.byteSize,
  }
}

export function readAndroidRelease() {
  const data = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return data.release === null ? null : validateAndroidRelease(data.release)
}

export function releaseFromBuild(build, previous, notes = '', integrity = {}) {
  if (build.status !== 'FINISHED' || build.platform !== 'ANDROID' || build.buildProfile !== 'preview'
      || build.project?.id !== EXPO_PROJECT || build.distribution !== 'INTERNAL') {
    throw new Error('Sólo una compilación Android preview terminada del proyecto app-de-rutas')
  }
  if (build.appIdentifier && build.appIdentifier !== ANDROID_PACKAGE) throw new Error('Paquete Android incorrecto')
  const release = validateAndroidRelease({
    packageName: ANDROID_PACKAGE, projectId: EXPO_PROJECT, buildId: build.id,
    version: build.appVersion, versionCode: Number(build.appBuildVersion),
    artifactUrl: build.artifacts?.applicationArchiveUrl, notes, publishedAt: new Date().toISOString(), sha256: integrity.sha256, byteSize: integrity.byteSize,
  })
  if (previous && release.versionCode <= previous.versionCode) throw new Error('El versionCode debe superar la versión publicada')
  return release
}

// Streamed, bounded hashing: never loads an entire APK into memory.
export async function fingerprintApk(chunks) {
  const hash = createHash('sha256'); let byteSize = 0
  for await (const chunk of chunks) {
    byteSize += chunk.byteLength
    if (byteSize > MAX_APK_BYTES) throw new Error('La APK excede el máximo admitido de 512 MiB')
    hash.update(chunk)
  }
  if (!byteSize) throw new Error('La APK está vacía')
  return { sha256: hash.digest('hex'), byteSize }
}
