import { Router } from 'express'
import { readAndroidRelease } from '../services/androidRelease.service.js'

export function createAndroidReleaseRouter(readRelease = readAndroidRelease) {
  const router = Router()
  router.use('/api/app/android', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  const safeRead = async res => {
    try { return { release: await readRelease() } }
    catch { res.status(503).json({ error: 'El canal de actualización no está disponible. Intenta más tarde.' }); return null }
  }
  router.get('/api/app/android/release', async (_req, res) => {
    const result = await safeRead(res)
    if (result) res.json({ available: Boolean(result.release), release: result.release && {
      packageName: result.release.packageName, version: result.release.version,
      versionCode: result.release.versionCode, notes: result.release.notes,
      publishedAt: result.release.publishedAt, sha256: result.release.sha256, byteSize: result.release.byteSize,
    } })
  })
  router.get('/api/app/android/download', async (req, res) => {
    const result = await safeRead(res)
    if (!result) return
    if (!result.release) return res.status(404).send('Todavía no hay una APK publicada.')
    if (req.query.versionCode !== String(result.release.versionCode)) {
      return res.status(409).send('La versión cambió. Busca de nuevo la actualización desde la app.')
    }
    return res.redirect(302, result.release.artifactUrl)
  })
  return router
}
export default createAndroidReleaseRouter()
