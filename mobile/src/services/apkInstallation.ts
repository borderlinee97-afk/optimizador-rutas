import { requireOptionalNativeModule } from 'expo'
import * as FileSystem from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { checkAppUpdate, updateDownloadUrl, type AndroidRelease } from './appUpdates'

type Installer = {
  canInstallAsync(): Promise<boolean>
  downloadPathAsync(code: number): Promise<string>
  installAsync(code: number, sha256: string, bytes: number): Promise<'permission-required' | 'installer-opened'>
  clearInstalledAsync(): Promise<boolean>
}
const installer = Platform.OS === 'android' ? requireOptionalNativeModule<Installer>('InternalApkUpdater') : null
export type InstallationProgress = { stage: 'downloading' | 'verifying'; percent: number | null }
export const hasApkInstaller = Boolean(installer)
export async function canInstallApk() { return Boolean(installer && await installer.canInstallAsync()) }
export async function clearInstalledApks() { if (installer) await installer.clearInstalledAsync() }

async function assertPublished(release: AndroidRelease) {
  const current = await checkAppUpdate()
  if (current.status !== 'available' || current.release.versionCode !== release.versionCode
      || current.release.sha256 !== release.sha256 || current.release.byteSize !== release.byteSize) {
    throw new Error('La versión disponible cambió. Busca de nuevo la actualización antes de continuar.')
  }
}

let pending: Promise<'permission-required' | 'installer-opened'> | null = null
export function installApprovedApk(release: AndroidRelease, progress: (value: InstallationProgress) => void) {
  if (pending) return pending
  pending = (async () => {
    if (!installer) throw new Error('Esta APK aún no incluye el instalador interno. Se requiere la primera actualización manual.')
    await assertPublished(release)
    const path = await installer.downloadPathAsync(release.versionCode)
    let task: FileSystem.DownloadResumable | null = null
    let watchdog: ReturnType<typeof setTimeout> | null = null
    let rejectInterrupted: (error: Error) => void = () => {}
    try {
      const cached = await FileSystem.getInfoAsync(path)
      if (!cached.exists || cached.size !== release.byteSize) {
        if (cached.exists) await FileSystem.deleteAsync(path, { idempotent: true })
        progress({ stage: 'downloading', percent: 0 })
        let lastPercent = -1, stopped = false
        const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject })
        const interrupt = async (message: string) => {
          if (stopped) return
          stopped = true
          try { await task?.pauseAsync() } catch { /* A failed transfer may already have stopped. */ }
          rejectInterrupted(new Error(message))
        }
        const armWatchdog = () => {
          if (watchdog) clearTimeout(watchdog)
          watchdog = setTimeout(() => { void interrupt('La descarga se interrumpió. Comprueba tu conexión y vuelve a pulsar Actualizar.') }, 120_000)
        }
        task = FileSystem.createDownloadResumable(updateDownloadUrl(release.versionCode), path, {}, data => {
          if (stopped) return
          if (data.totalBytesWritten > release.byteSize) { void interrupt('El archivo descargado excede el tamaño de la APK aprobada.'); return }
          armWatchdog()
          const percent = Math.min(99, Math.floor(data.totalBytesWritten * 100 / release.byteSize))
          if (percent !== lastPercent) { lastPercent = percent; progress({ stage: 'downloading', percent }) }
        })
        armWatchdog()
        const downloaded = await Promise.race([task.downloadAsync(), interrupted])
        if (watchdog) { clearTimeout(watchdog); watchdog = null }
        if (!downloaded || downloaded.status !== 200) throw new Error('No se pudo descargar la APK aprobada. Vuelve a buscar actualizaciones.')
      }
      progress({ stage: 'verifying', percent: null })
      // Recheck after the transfer; a withdrawn/replaced release must not open the installer.
      await assertPublished(release)
      return await installer.installAsync(release.versionCode, release.sha256, release.byteSize)
    } catch (error) {
      try { await task?.pauseAsync() } catch { /* Best effort after a failed transfer. */ }
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {})
      throw error
    } finally { if (watchdog) clearTimeout(watchdog) }
  })().finally(() => { pending = null })
  return pending
}
