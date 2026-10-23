package mx.appderutas.updates;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.Set;

// Device-independent validation; the Android adapter also reads real APK metadata/signatures.
public final class ApkPolicy {
  public static final long MAX_BYTES = 536870912L;
  public static long version(double value) {
    if (!Double.isFinite(value) || value < 1 || value > 2100000000L || value != Math.floor(value))
      throw new IllegalArgumentException("Número de versión inválido.");
    return (long) value;
  }
  public static File apkFile(File cacheRoot, long version) throws IOException {
    if (version < 1 || version > 2100000000L) throw new IOException("Versión inválida.");
    File expectedRoot = new File(cacheRoot.getCanonicalFile(), "app-updates");
    File root = expectedRoot.getCanonicalFile();
    // Reject redirection even to a sibling folder within our cache.
    if (!root.equals(expectedRoot)) throw new IOException("Directorio inválido.");
    File apk = new File(root, "update-" + version + ".apk");
    if (!apk.getCanonicalFile().getParentFile().equals(root)) throw new IOException("Archivo inválido.");
    return apk;
  }
  public static void verifyFile(File apk, double expectedBytes, String expectedHash) throws Exception {
    if (!Double.isFinite(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_BYTES || expectedBytes != Math.floor(expectedBytes)
        || expectedHash == null || !expectedHash.matches("[a-f0-9]{64}")) throw new IOException("Datos de integridad inválidos.");
    if (!apk.isFile() || apk.length() != (long) expectedBytes) throw new IOException("La descarga está incompleta. Intenta actualizar de nuevo.");
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (FileInputStream input = new FileInputStream(apk)) {
      byte[] buffer = new byte[65536]; int count;
      while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
    }
    StringBuilder hex = new StringBuilder();
    for (byte b : digest.digest()) hex.append(String.format("%02x", b & 0xff));
    if (!MessageDigest.isEqual(hex.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII),
        expectedHash.getBytes(java.nio.charset.StandardCharsets.US_ASCII))) throw new IOException("La APK no coincide con la versión aprobada. Intenta de nuevo.");
  }
  public static void verifyIdentity(String installedPackage, long installedVersion, Set<String> installedSigners,
      String candidatePackage, long candidateVersion, Set<String> candidateSigners, long expectedVersion) {
    if (!"mx.appderutas.supervision".equals(installedPackage) || !installedPackage.equals(candidatePackage)
        || candidateVersion != expectedVersion || candidateVersion <= installedVersion)
      throw new IllegalArgumentException("La APK no corresponde a una actualización de esta app.");
    if (installedSigners == null || installedSigners.isEmpty() || !installedSigners.equals(candidateSigners))
      throw new IllegalArgumentException("La firma de la APK no coincide. No desinstales la app; solicita apoyo.");
  }
  private ApkPolicy() {}
}
