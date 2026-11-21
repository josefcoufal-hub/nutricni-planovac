package cz.planovac.api;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Minimální JWT HS256. Přijímá pouze alg=HS256, kontroluje podpis v konstantním čase a platnost. */
public final class Jwt {
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    private static final String HEADER = B64.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
    private final byte[] secret;

    public Jwt(byte[] secret) { this.secret = secret.clone(); }

    public String sign(Map<String, Object> claims) {
        String payload = B64.encodeToString(Json.write(claims).getBytes(StandardCharsets.UTF_8));
        String data = HEADER + "." + payload;
        return data + "." + B64.encodeToString(mac(data));
    }

    /** Vrátí claims, nebo null při jakékoli chybě (podpis, formát, vypršení). */
    @SuppressWarnings("unchecked")
    public Map<String, Object> verify(String token, long nowSec) {
        try {
            if (token == null || token.length() > 4096) return null;
            String[] p = token.split("\\.", -1);
            if (p.length != 3) return null;
            if (!MessageDigest.isEqual(B64.encodeToString(mac(p[0] + "." + p[1])).getBytes(StandardCharsets.UTF_8), p[2].getBytes(StandardCharsets.UTF_8))) return null;
            Object h = Json.parse(new String(B64D.decode(p[0]), StandardCharsets.UTF_8));
            if (!(h instanceof Map<?, ?> hm) || !"HS256".equals(hm.get("alg"))) return null;
            Object c = Json.parse(new String(B64D.decode(p[1]), StandardCharsets.UTF_8));
            if (!(c instanceof Map<?, ?> cm)) return null;
            Object exp = cm.get("exp");
            if (!(exp instanceof Number n) || n.longValue() <= nowSec) return null;
            return (Map<String, Object>) cm;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private byte[] mac(String data) {
        try {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(secret, "HmacSHA256"));
            return m.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
