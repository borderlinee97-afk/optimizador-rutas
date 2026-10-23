// Verifies the exact APK approved by the owner against the completed EAS build.
// Only writes the local manifest; never builds, deploys or publishes remotely.
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { releaseFromBuild, readAndroidRelease, fingerprintApk } from '../services/androidRelease.service.js'
const args = process.argv.slice(2)
const value = flag => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1] }
try {
  const file = value('--build-json'), apk = value('--apk')
  if (!file || !apk || !/\.apk$/i.test(apk)) throw new Error('Uso: node backend/scripts/prepare-android-release.mjs --build-json <salida de eas build:view --json> --apk <APK probada y aprobada> [--notes-file <texto>]')
  const notesFile = value('--notes-file')
  const notes = notesFile ? readFileSync(notesFile, 'utf8').trim() : ''
  const build = JSON.parse(readFileSync(file, 'utf8')), previous = readAndroidRelease()
  const approved = await fingerprintApk(createReadStream(apk))
  const candidate = releaseFromBuild(build, previous, notes, approved)
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180_000)
  let remote
  try {
    const response = await fetch(candidate.artifactUrl, { signal: controller.signal })
    if (!response.ok || !response.body) throw new Error('No se pudo obtener la APK de esa compilación de Expo')
    remote = await fingerprintApk(response.body)
  } finally { clearTimeout(timer); controller.abort() }
  if (remote.sha256 !== approved.sha256 || remote.byteSize !== approved.byteSize) throw new Error('La APK aprobada no coincide con el artefacto de Expo. No se modificó la versión publicada.')
  writeFileSync(new URL('../config/android-release.json', import.meta.url), JSON.stringify({ release: candidate }, null, 2) + '\n')
  console.log(`APK aprobada ${candidate.version} (${candidate.versionCode}) verificada y preparada localmente. Requiere revisión y publicación autorizada del backend.`)
} catch (error) { console.error(error.message); process.exitCode = 1 }
