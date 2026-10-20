package mx.appderutas.offlineauth

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OfflinePasswordVerifierModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OfflinePasswordVerifier")
    // Expo AsyncFunction runs on its native worker queue, never the JS/UI thread.
    AsyncFunction("deriveAsync") { password: String, salt: String ->
      if (Build.VERSION.SDK_INT < 26) null else PasswordVerifier.derive(password, salt)
    }
  }
}
