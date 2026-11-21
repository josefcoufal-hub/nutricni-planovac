package cz.planovac.api;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** HTTP rozhraní (REST, JSON). Všechny cesty začínají /api. */
public final class Api implements HttpHandler {
    public static final List<String> COLLECTIONS = List.of("clients", "tracks", "plans", "foods", "recipes", "templates", "settings");
    private static final Pattern DOC_ID = Pattern.compile("^[A-Za-z0-9_.~:@+-]{1,200}$");
    private static final Pattern USER_ID = Pattern.compile("^[0-9a-f]{32}$");

    private final Config cfg;
    private final Storage st;
    private final AuthService auth;
    /** Hashování hesel je náročné na CPU, souběžně jich pustíme jen pár. */
    private final Semaphore cpuGate = new Semaphore(4);

    /** Dokud neproběhla inicializace databáze (při probouzení Azure SQL může trvat minutu), API přijímá jen kontroly stavu. */
    private volatile boolean ready = false;

    public Api(Config cfg, Storage st, AuthService auth) { this.cfg = cfg; this.st = st; this.auth = auth; }

    public void setReady(boolean r) { this.ready = r; }

    @Override
    public void handle(HttpExchange ex) throws IOException {
        long t0 = System.nanoTime();
        int status = 500;
        String path = ex.getRequestURI().getRawPath();
        try {
            status = route(ex, path);
        } catch (AuthService.ApiException e) {
            status = e.status;
            send(ex, e.status, Json.write(Json.obj("error", e.code, "message", e.getMessage())));
        } catch (Storage.StorageException e) {
            status = e.transientError ? 503 : 500;
            Log.error("storage_error", "path", path, "transient", e.transientError, "msg", String.valueOf(e.getMessage()));
            send(ex, status, Json.write(Json.obj("error", e.transientError ? "db_unavailable" : "internal", "message",
                    e.transientError ? "Databáze se právě probouzí nebo není dostupná. Zkuste to za chvíli." : "Interní chyba.")));
        } catch (Throwable e) {
            status = 500;
            Log.error("unhandled", "path", path, "type", e.getClass().getName(), "msg", String.valueOf(e.getMessage()));
            try { send(ex, 500, Json.write(Json.obj("error", "internal", "message", "Interní chyba."))); } catch (IOException ignore) { /* spojení padlo */ }
        } finally {
            ex.close();
            if (!path.equals("/api/health") && !path.equals("/api/ready")) Log.info("req", "m", ex.getRequestMethod(), "path", safePath(path), "status", status, "ms", (System.nanoTime() - t0) / 1_000_000);
        }
    }

    private static String safePath(String p) { return p.length() > 120 ? p.substring(0, 120) : p; }

    private int route(HttpExchange ex, String path) throws IOException, Storage.StorageException {
        String m = ex.getRequestMethod();
        String[] seg = path.startsWith("/api/") || path.equals("/api") ? path.substring(1).split("/") : new String[0];
        if (seg.length < 2 || !seg[0].equals("api")) return err(ex, 404, "not_found", "Nenalezeno.");

        // liveness: proces žije (nikdy nesahá do databáze, aby ji sonda neprobouzela)
        if (seg.length == 2 && seg[1].equals("health") && m.equals("GET")) return ok(ex, 200, Json.obj("status", "ok", "ready", ready));
        // readiness: schéma databáze je připraveno
        if (seg.length == 2 && seg[1].equals("ready") && m.equals("GET")) return ready ? ok(ex, 200, Json.obj("status", "ok")) : err(ex, 503, "starting", "Služba se spouští.");

        // od této chvíle jen volání z webové vrstvy (je-li nastaven sdílený klíč)
        boolean trusted = true;
        if (!cfg.internalKey.isEmpty()) {
            String k = header(ex, "x-internal-key");
            trusted = k != null && MessageDigest.isEqual(k.getBytes(StandardCharsets.UTF_8), cfg.internalKey.getBytes(StandardCharsets.UTF_8));
            if (!trusted) return err(ex, 403, "forbidden", "Přístup odepřen.");
        }
        if (!ready) {
            ex.getResponseHeaders().set("Retry-After", "5");
            return err(ex, 503, "starting", "Služba se spouští (probouzí se databáze). Zkuste to za chvíli.");
        }
        String ip = trusted && header(ex, "x-client-ip") != null ? clip(header(ex, "x-client-ip"), 64) : ex.getRemoteAddress().getAddress().getHostAddress();

        if (seg.length == 3 && seg[1].equals("health") && seg[2].equals("db") && m.equals("GET")) {
            boolean up = st.ping();
            return ok(ex, up ? 200 : 503, Json.obj("status", up ? "ok" : "down"));
        }

        if (seg[1].equals("auth")) return authRoutes(ex, seg, m, ip);

        User me = requireUser(ex);
        if (seg[1].equals("docs")) return docRoutes(ex, seg, m, me);
        if (seg[1].equals("admin")) {
            if (!"admin".equals(me.role)) return err(ex, 403, "forbidden", "Nemáte oprávnění.");
            return adminRoutes(ex, seg, m, me, ip);
        }
        return err(ex, 404, "not_found", "Nenalezeno.");
    }

    // ------------------------------------------------------------------ auth

    private int authRoutes(HttpExchange ex, String[] seg, String m, String ip) throws IOException, Storage.StorageException {
        if (seg.length == 3 && seg[2].equals("login") && m.equals("POST")) {
            Map<String, Object> b = readObject(ex, 4096);
            String u = str(b.get("username")), p = str(b.get("password"));
            if (!cpuGate.tryAcquire()) return err(ex, 429, "busy", "Server je vytížený, zkuste to za chvíli.");
            AuthService.LoginResult r;
            try { r = auth.login(u, p, ip); } finally { cpuGate.release(); }
            switch (r.outcome()) {
                case OK: return ok(ex, 200, Json.obj("token", r.token(), "expiresAt", r.expiresAtSec(), "user", r.user().publicView()));
                case LOCKED:
                    ex.getResponseHeaders().set("Retry-After", String.valueOf(r.retryAfterSec()));
                    return ok(ex, 429, Json.obj("error", "locked", "message", "Příliš mnoho pokusů. Zkuste to znovu za " + Math.max(1, (r.retryAfterSec() + 59) / 60) + " min.", "retryAfterSec", r.retryAfterSec()));
                default: return err(ex, 401, "invalid_credentials", "Nesprávné jméno nebo heslo.");
            }
        }
        User me = requireUser(ex);
        if (seg.length == 3 && seg[2].equals("me") && m.equals("GET")) return ok(ex, 200, Json.obj("user", me.publicView()));
        if (seg.length == 3 && seg[2].equals("password") && m.equals("POST")) {
            Map<String, Object> b = readObject(ex, 4096);
            if (!cpuGate.tryAcquire()) return err(ex, 429, "busy", "Server je vytížený, zkuste to za chvíli.");
            AuthService.LoginResult r;
            try { r = auth.changePassword(me, str(b.get("current")), str(b.get("next")), ip); } finally { cpuGate.release(); }
            return ok(ex, 200, Json.obj("token", r.token(), "expiresAt", r.expiresAtSec(), "user", r.user().publicView()));
        }
        if (seg.length == 3 && seg[2].equals("logout-all") && m.equals("POST")) {
            auth.revokeAll(me, ip);
            return ok(ex, 200, Json.obj("ok", true));
        }
        return err(ex, 404, "not_found", "Nenalezeno.");
    }

    private User requireUser(HttpExchange ex) {
        String h = header(ex, "authorization");
        if (h == null || !h.regionMatches(true, 0, "Bearer ", 0, 7)) throw new AuthService.ApiException(401, "unauthorized", "Přihlaste se.");
        User u = auth.authenticate(h.substring(7).trim());
        if (u == null) throw new AuthService.ApiException(401, "unauthorized", "Přihlášení vypršelo nebo není platné.");
        return u;
    }

    // ------------------------------------------------------------------ dokumenty

    private int docRoutes(HttpExchange ex, String[] seg, String m, User me) throws IOException, Storage.StorageException {
        if (seg.length == 2 && m.equals("GET")) {
            Map<String, Map<String, String>> all = st.loadAll(me.id);
            StringBuilder b = new StringBuilder(4096);
            b.append('{');
            boolean firstC = true;
            for (String c : COLLECTIONS) {
                if (!firstC) b.append(',');
                firstC = false;
                Json.quote(b, c);
                b.append(":{");
                Map<String, String> docs = all.getOrDefault(c, Map.of());
                boolean first = true;
                for (Map.Entry<String, String> e : docs.entrySet()) {
                    if (!first) b.append(',');
                    first = false;
                    Json.quote(b, e.getKey());
                    b.append(':').append(e.getValue());
                }
                b.append('}');
            }
            b.append('}');
            sendRaw(ex, 200, b.toString());
            return 200;
        }
        if (seg.length == 4) {
            String coll = seg[2], id;
            try { id = URLDecoder.decode(seg[3], StandardCharsets.UTF_8); } catch (IllegalArgumentException e) { return err(ex, 400, "bad_id", "Neplatné id."); }
            if (!COLLECTIONS.contains(coll)) return err(ex, 404, "bad_collection", "Neznámá kolekce.");
            if (!DOC_ID.matcher(id).matches()) return err(ex, 400, "bad_id", "Neplatné id dokumentu.");
            if (m.equals("PUT")) {
                String body = readBody(ex, cfg.maxDocBytes);
                if (!Json.isObject(body)) return err(ex, 400, "bad_json", "Dokument musí být platný JSON objekt.");
                long ts = st.upsertDoc(me.id, coll, id, body);
                return ok(ex, 200, Json.obj("id", id, "updatedAt", ts));
            }
            if (m.equals("DELETE")) {
                st.deleteDoc(me.id, coll, id);
                ex.sendResponseHeaders(204, -1);
                return 204;
            }
        }
        return err(ex, 404, "not_found", "Nenalezeno.");
    }

    // ------------------------------------------------------------------ správa uživatelů

    private int adminRoutes(HttpExchange ex, String[] seg, String m, User me, String ip) throws IOException, Storage.StorageException {
        if (seg.length == 3 && seg[2].equals("users")) {
            if (m.equals("GET")) {
                List<Object> out = new java.util.ArrayList<>();
                for (User u : st.listUsers()) out.add(u.publicView());
                return ok(ex, 200, Json.obj("users", out));
            }
            if (m.equals("POST")) {
                Map<String, Object> b = readObject(ex, 4096);
                if (!cpuGate.tryAcquire()) return err(ex, 429, "busy", "Server je vytížený.");
                User u;
                try { u = auth.createUser(me, str(b.get("username")), str(b.get("displayName")), str(b.get("password")), b.get("role") == null ? "user" : str(b.get("role")), ip); }
                finally { cpuGate.release(); }
                return ok(ex, 201, Json.obj("user", u.publicView()));
            }
        }
        if (seg.length == 5 && seg[2].equals("users") && m.equals("POST") && USER_ID.matcher(seg[3]).matches()) {
            switch (seg[4]) {
                case "disable": auth.setDisabled(me, seg[3], true, ip); return ok(ex, 200, Json.obj("ok", true));
                case "enable": auth.setDisabled(me, seg[3], false, ip); return ok(ex, 200, Json.obj("ok", true));
                case "password": {
                    Map<String, Object> b = readObject(ex, 4096);
                    if (!cpuGate.tryAcquire()) return err(ex, 429, "busy", "Server je vytížený.");
                    try { auth.resetPassword(me, seg[3], str(b.get("password")), ip); } finally { cpuGate.release(); }
                    return ok(ex, 200, Json.obj("ok", true));
                }
                default: break;
            }
        }
        return err(ex, 404, "not_found", "Nenalezeno.");
    }

    // ------------------------------------------------------------------ pomocné

    private static String str(Object o) { return o instanceof String s ? s : null; }
    private static String clip(String s, int n) { return s.length() > n ? s.substring(0, n) : s; }
    private static String header(HttpExchange ex, String name) { return ex.getRequestHeaders().getFirst(name); }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readObject(HttpExchange ex, long max) throws IOException {
        String body = readBody(ex, max);
        try {
            Object o = Json.parse(body);
            if (o instanceof Map) return (Map<String, Object>) o;
        } catch (Json.ParseException e) { /* níže */ }
        throw new AuthService.ApiException(400, "bad_json", "Neplatný JSON.");
    }

    private String readBody(HttpExchange ex, long max) throws IOException {
        String ct = header(ex, "content-type");
        if (ct == null || !ct.toLowerCase().startsWith("application/json")) throw new AuthService.ApiException(415, "unsupported_media_type", "Očekáván application/json.");
        String cl = header(ex, "content-length");
        if (cl != null) {
            try { if (Long.parseLong(cl.trim()) > max) throw new AuthService.ApiException(413, "too_large", "Dokument je příliš velký."); }
            catch (NumberFormatException e) { throw new AuthService.ApiException(400, "bad_request", "Neplatná hlavička Content-Length."); }
        }
        byte[] b = ex.getRequestBody().readNBytes((int) Math.min(max + 1, Integer.MAX_VALUE - 8));
        if (b.length > max) throw new AuthService.ApiException(413, "too_large", "Dokument je příliš velký.");
        java.nio.charset.CharsetDecoder dec = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT);
        try { return dec.decode(java.nio.ByteBuffer.wrap(b)).toString(); }
        catch (java.nio.charset.CharacterCodingException e) { throw new AuthService.ApiException(400, "bad_encoding", "Tělo musí být UTF-8."); }
    }

    private int ok(HttpExchange ex, int status, Object body) throws IOException { send(ex, status, Json.write(body)); return status; }
    private int err(HttpExchange ex, int status, String code, String msg) throws IOException { send(ex, status, Json.write(Json.obj("error", code, "message", msg))); return status; }
    private void send(HttpExchange ex, int status, String json) throws IOException { sendRaw(ex, status, json); }

    private void sendRaw(HttpExchange ex, int status, String json) throws IOException {
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        var h = ex.getResponseHeaders();
        h.set("Content-Type", "application/json; charset=utf-8");
        h.set("Cache-Control", "no-store");
        h.set("X-Content-Type-Options", "nosniff");
        ex.sendResponseHeaders(status, b.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(b); }
    }
}
