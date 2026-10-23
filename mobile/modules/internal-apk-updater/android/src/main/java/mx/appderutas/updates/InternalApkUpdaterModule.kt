package mx.appderutas.updates

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

class InternalApkUpdaterModule : Module() {
  private fun context() = appContext.reactContext ?: throw IllegalStateException("La app no está disponible.")
  private fun allowed() = Build.VERSION.SDK_INT < 26 || context().packageManager.canRequestPackageInstalls()
  @Suppress("DEPRECATION")
  private fun version(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
  @Suppress("DEPRECATION")
  private fun signers(info: PackageInfo): Set<String> {
    val certificates = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return certificates?.map { signature ->
      MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }?.toSet() ?: emptySet()
  }
  @Suppress("DEPRECATION")
  private fun checkedFile(expectedVersion: Double, expectedHash: String, expectedBytes: Double): File {
    val code = ApkPolicy.version(expectedVersion)
    val ctx = context()
    val file = ApkPolicy.apkFile(ctx.cacheDir, code)
    ApkPolicy.verifyFile(file, expectedBytes, expectedHash)
    val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
    val installed = ctx.packageManager.getPackageInfo(ctx.packageName, flags)
    val archive = ctx.packageManager.getPackageArchiveInfo(file.absolutePath, flags)
      ?: throw IllegalArgumentException("La descarga no es una APK válida.")
    ApkPolicy.verifyIdentity(ctx.packageName, version(installed), signers(installed), archive.packageName,
      version(archive), signers(archive), code)
    return file
  }
  override fun definition() = ModuleDefinition {
    Name("InternalApkUpdater")
    AsyncFunction("canInstallAsync") { allowed() }
    AsyncFunction("downloadPathAsync") { value: Double ->
      val file = ApkPolicy.apkFile(context().cacheDir, ApkPolicy.version(value))
      if (!file.parentFile!!.isDirectory && !file.parentFile!!.mkdirs()) throw IllegalStateException("No hay espacio para preparar la actualización.")
      Uri.fromFile(file).toString()
    }
    // Hashing and APK parsing execute on Expo's worker queue, before any UI is launched.
    AsyncFunction("installAsync") { code: Double, hash: String, bytes: Double, promise: Promise ->
      try {
        val file = checkedFile(code, hash, bytes)
        val activity = appContext.currentActivity ?: throw IllegalStateException("Regresa a la app para continuar la actualización.")
        activity.runOnUiThread {
          try {
            if (!allowed()) {
              activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context().packageName}")))
              promise.resolve("permission-required")
            } else {
              val uri = FileProvider.getUriForFile(context(), "${context().packageName}.internalupdates", file)
              val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
              intent.clipData = ClipData.newRawUri("APP DE RUTAS", uri)
              activity.startActivity(intent)
              promise.resolve("installer-opened")
            }
          } catch (error: Exception) { promise.reject("APK_INSTALL_FAILED", error.message, error) }
        }
      } catch (error: Exception) { promise.reject("APK_VALIDATION_FAILED", error.message, error) }
    }
    AsyncFunction("clearInstalledAsync") {
      @Suppress("DEPRECATION")
      val current = version(context().packageManager.getPackageInfo(context().packageName, 0))
      val root = ApkPolicy.apkFile(context().cacheDir, current).parentFile!!
      root.listFiles()?.forEach { file ->
        val match = Regex("update-([0-9]+)\\.apk").matchEntire(file.name)
        val code = match?.groupValues?.get(1)?.toLongOrNull()
        if (code != null && code <= current && file.isFile && file.canonicalFile.parentFile == root) file.delete()
      }
      true
    }
  }
}
