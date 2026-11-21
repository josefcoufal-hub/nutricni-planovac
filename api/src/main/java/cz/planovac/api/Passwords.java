package cz.planovac.api;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Set;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * Hashování hesel: PBKDF2-HMAC-SHA256 (součást JDK), náhodná sůl 16 B, formát
 * "pbkdf2-sha256$iterace$sůl$hash" (base64url). Počet iterací je v hashi, takže jej lze později zvýšit
 * a hesla se při dalším přihlášení přehashují.
 */
public final class Passwords {
    private static final SecureRandom RNG = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    public static final int MIN_LEN = 12, MAX_LEN = 200;
    private static final Set<String> COMMON = Set.of("password1234", "123456789012", "qwertyuiop12", "heslo1234567", "nutricni1234",
            "administrator", "letmein123456", "welcome12345", "changeme1234", "iloveyou12345");

    private Passwords() {}

    public static String hash(String password, int iterations) {
        byte[] salt = new byte[16];
        RNG.nextBytes(salt);
        byte[] h = pbkdf2(password, salt, iterations);
        return "pbkdf2-sha256$" + iterations + "$" + B64.encodeToString(salt) + "$" + B64.encodeToString(h);
    }

    /** Porovnání v konstantním čase. Neplatný formát hashe = false. */
    public static boolean verify(String password, String stored) {
        try {
            String[] p = stored.split("\\$");
            if (p.length != 4 || !p[0].equals("pbkdf2-sha256")) return false;
            int it = Integer.parseInt(p[1]);
            if (it < 1000 || it > 5_000_000) return false;
            byte[] salt = B64D.decode(p[2]);
            byte[] want = B64D.decode(p[3]);
            byte[] got = pbkdf2(password, salt, it);
            return MessageDigest.isEqual(want, got);
        } catch (RuntimeException e) {
            return false;
        }
    }

    public static boolean needsRehash(String stored, int iterations) {
        try {
            String[] p = stored.split("\\$");
            return p.length != 4 || Integer.parseInt(p[1]) < iterations;
        } catch (RuntimeException e) {
            return true;
        }
    }

    private static byte[] pbkdf2(String password, byte[] salt, int iterations) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, 256);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        } finally {
            spec.clearPassword();
        }
    }

    /** Vrací text chyby nebo null, pokud je heslo v pořádku. */
    public static String policyError(String password, String username) {
        if (password == null || password.length() < MIN_LEN) return "Heslo musí mít alespoň " + MIN_LEN + " znaků.";
        if (password.length() > MAX_LEN) return "Heslo je příliš dlouhé.";
        if (username != null && password.equalsIgnoreCase(username)) return "Heslo nesmí být stejné jako uživatelské jméno.";
        if (COMMON.contains(password.toLowerCase())) return "Heslo je příliš běžné.";
        boolean allSame = password.chars().distinct().count() < 4;
        if (allSame) return "Heslo je příliš jednoduché.";
        return null;
    }

    public static String randomId() {
        byte[] b = new byte[16];
        RNG.nextBytes(b);
        return java.util.HexFormat.of().formatHex(b);
    }

    static byte[] utf8(String s) { return s.getBytes(StandardCharsets.UTF_8); }
}
