package mx.appderutas.offlineauth;

import java.util.Arrays;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;

/** Identical to offline-login.v1: PBKDF2-HMAC-SHA256, 600000 iterations, 32 bytes. */
public final class PasswordVerifier {
  private PasswordVerifier() {}

  public static String derive(String password, String saltHex) throws GeneralSecurityException {
    if (saltHex == null || !saltHex.matches("[a-f0-9]{64}")) {
      throw new IllegalArgumentException("Invalid verifier salt");
    }
    byte[] salt = new byte[32];
    for (int i = 0; i < salt.length; i++) {
      salt[i] = (byte) Integer.parseInt(saltHex.substring(i * 2, i * 2 + 2), 16);
    }
    char[] chars = password.toCharArray();
    PBEKeySpec spec = new PBEKeySpec(chars, salt, 600000, 256);
    byte[] derived = null;
    try {
      derived = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
      char[] result = new char[derived.length * 2];
      char[] digits = "0123456789abcdef".toCharArray();
      for (int i = 0; i < derived.length; i++) {
        result[i * 2] = digits[(derived[i] & 255) >>> 4];
        result[i * 2 + 1] = digits[derived[i] & 15];
      }
      return new String(result);
    } finally {
      spec.clearPassword();
      Arrays.fill(chars, '\0');
      Arrays.fill(salt, (byte) 0);
      if (derived != null) Arrays.fill(derived, (byte) 0);
    }
  }
}
