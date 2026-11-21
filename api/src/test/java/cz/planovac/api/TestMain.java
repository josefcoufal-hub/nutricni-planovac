package cz.planovac.api;

import com.sun.net.httpserver.HttpServer;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/** Testy bez knihoven: spuštění = java -cp out cz.planovac.api.TestMain */
public final class TestMain {
    static int pass, fail;

    interface T { void run() throws Exception; }

    static void test(String name, T t) {
        try { t.run(); pass++; System.out.println("  ok   " + name); }
        catch (Throwable e) { fail++; System.out.println("  FAIL " + name + " -> " + e); if (!(e instanceof AssertionError)) e.printStackTrace(System.out); }
    }
    static void eq(Object want, Object got, String msg) { if (!java.util.Objects.equals(want, got)) throw new AssertionError(msg + ": čekáno <" + want + "> je <" + got + ">"); }
    static void yes(boolean c, String msg) { if (!c) throw new AssertionError(msg); }
    static void no(boolean c, String msg) { if (c) throw new AssertionError(msg); }
    static void throwsParse(String s) { try { Json.parse(s); } catch (Json.ParseException e) { return; } throw new AssertionError("měl selhat: " + s); }

    static Config cfg(Map<String, String> extra) {
        Map<String, String> m = new HashMap<>();
        m.put("PBKDF2_ITERATIONS", "2000");
        m.put("JWT_SECRET", "test-secret-test-secret-test-secret-123456");
        m.putAll(extra);
        return new Config(m::get);
    }

    // ------------------------------------------------------------------ HTTP pomocník
    static final HttpClient HTTP = HttpClient.newHttpClient();
    record Res(int status, String body, Map<String, List<String>> headers) {
        @SuppressWarnings("unchecked") Map<String, Object> json() { return (Map<String, Object>) Json.parse(body); }
    }
    static Res call(HttpServer s, String method, String path, String token, String body, String... hdrs) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + s.getAddress().getPort() + path));
        if (body != null) b.header("Content-Type", "application/json");
        if (token != null) b.header("Authorization", "Bearer " + token);
        for (int i = 0; i + 1 < hdrs.length; i += 2) b.setHeader(hdrs[i], hdrs[i + 1]);
        b.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        HttpResponse<String> r = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return new Res(r.statusCode(), r.body(), r.headers().map());
    }
    static String login(HttpServer s, String u, String p, String... h) throws Exception {
        Res r = call(s, "POST", "/api/auth/login", null, Json.write(Json.obj("username", u, "password", p)), h);
        yes(r.status() == 200, "login " + u + " -> " + r.status() + " " + r.body());
        return (String) r.json().get("token");
    }

    public static void main(String[] args) throws Exception {
        System.out.println("Nouzový nástroj");
        test("HashPassword vytvoří hash, který projde ověřením", () -> {
            java.io.InputStream old = System.in; java.io.PrintStream oldOut = System.out;
            try {
                System.setIn(new java.io.ByteArrayInputStream("nouzove-heslo-2026\n".getBytes(StandardCharsets.UTF_8)));
                java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                System.setOut(new java.io.PrintStream(buf, true, StandardCharsets.UTF_8));
                HashPassword.main(new String[0]);
                System.setOut(oldOut);
                String h = buf.toString(StandardCharsets.UTF_8).trim();
                yes(h.startsWith("pbkdf2-sha256$600000$"), "formát: " + h);
                yes(Passwords.verify("nouzove-heslo-2026", h), "ověření");
                no(Passwords.verify("jine-heslo-2026", h), "jiné heslo");
            } finally { System.setIn(old); System.setOut(oldOut); }
        });

        System.out.println("Json");
        test("parsuje objekty, pole, čísla, unicode", () -> {
            Object o = Json.parse("{\"a\":[1,2.5,-3e2,true,false,null],\"b\":\"ěšč\\u00e9\\n\",\"c\":{}}");
            Map<?, ?> m = (Map<?, ?>) o;
            eq(List.of(1.0, 2.5, -300.0, true, false), ((List<?>) m.get("a")).subList(0, 5), "pole");
            eq("ěščé\n", m.get("b"), "řetězec");
        });
        test("odmítá neplatný JSON", () -> {
            for (String s : new String[]{"", "{", "{\"a\":}", "[1,]", "{\"a\":1,}", "01", "1.", "\"\\x\"", "{'a':1}", "{\"a\":1} x", "[1 2]", "nul", "\"a\nb\"", "-", "[\"\\u12\"]"}) throwsParse(s);
        });
        test("omezuje hloubku vnoření", () -> throwsParse("[".repeat(200) + "]".repeat(200)));
        test("zapisuje a escapuje", () -> {
            eq("{\"a\":\"x\\\"y\\n\",\"b\":[1,2.5,null,true]}", Json.write(Json.obj("a", "x\"y\n", "b", java.util.Arrays.asList(1, 2.5, null, true))), "zápis");
            eq("\"\\u2028\"", Json.write("\u2028"), "line separator");
        });
        test("isObject", () -> { yes(Json.isObject("{}"), "obj"); no(Json.isObject("[]"), "pole"); no(Json.isObject("\"x\""), "string"); no(Json.isObject("{"), "rozbitý"); });

        System.out.println("Hesla");
        test("hash a ověření; špatné heslo a rozbitý hash neprojdou", () -> {
            String h = Passwords.hash("správné-heslo-123", 2000);
            yes(h.startsWith("pbkdf2-sha256$2000$"), "formát");
            yes(Passwords.verify("správné-heslo-123", h), "ok");
            no(Passwords.verify("špatné-heslo-123", h), "špatné");
            no(Passwords.verify("x", "nesmysl"), "rozbitý");
            no(Passwords.verify("x", "pbkdf2-sha256$abc$aa$bb"), "rozbité iterace");
            no(Passwords.verify("x", "pbkdf2-sha256$1$aa$bb"), "příliš málo iterací");
            yes(!Passwords.hash("a-b-c-d-e-f-g-h", 2000).equals(Passwords.hash("a-b-c-d-e-f-g-h", 2000)), "sůl je náhodná");
        });
        test("needsRehash a politika hesel", () -> {
            yes(Passwords.needsRehash(Passwords.hash("heslo-heslo-1", 2000), 600000), "nižší iterace");
            no(Passwords.needsRehash(Passwords.hash("heslo-heslo-1", 2000), 2000), "stejné iterace");
            yes(Passwords.policyError("krátké", "jana") != null, "krátké");
            yes(Passwords.policyError("aaaaaaaaaaaaaa", "jana") != null, "samé a");
            yes(Passwords.policyError("password1234", "jana") != null, "běžné");
            yes(Passwords.policyError("JANA.NOVAKOVA@X", "jana.novakova@x") != null, "stejné jako jméno");
            eq(null, Passwords.policyError("kolo-modry-dest-42", "jana"), "dobré heslo");
        });

        System.out.println("JWT");
        Jwt jwt = new Jwt("0123456789abcdef0123456789abcdef".getBytes());
        test("podepíše a ověří, vypršení, cizí klíč, úprava obsahu", () -> {
            String t = jwt.sign(Json.obj("sub", "u1", "exp", 2000));
            eq("u1", jwt.verify(t, 1000).get("sub"), "platný");
            eq(null, jwt.verify(t, 2000), "vypršelý");
            eq(null, new Jwt("ffffffffffffffffffffffffffffffff".getBytes()).verify(t, 1000), "cizí klíč");
            String[] p = t.split("\\.");
            String forged = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString("{\"sub\":\"admin\",\"exp\":9999999999}".getBytes());
            eq(null, jwt.verify(p[0] + "." + forged + "." + p[2], 1000), "upravený obsah");
            eq(null, jwt.verify(p[0] + "." + p[1] + ".", 1000), "bez podpisu");
            eq(null, jwt.verify("a.b", 1000), "dvě části");
            eq(null, jwt.verify(null, 1000), "null");
        });
        test("alg=none se nepřijme", () -> {
            var e = java.util.Base64.getUrlEncoder().withoutPadding();
            String h = e.encodeToString("{\"alg\":\"none\",\"typ\":\"JWT\"}".getBytes());
            String pl = e.encodeToString("{\"sub\":\"u1\",\"exp\":9999999999}".getBytes());
            eq(null, jwt.verify(h + "." + pl + ".", 1000), "none");
        });

        System.out.println("AuthService");
        AtomicLong now = new AtomicLong(1_700_000_000_000L);
        Config c1 = cfg(Map.of("MAX_FAILED_LOGINS", "3", "LOCK_MINUTES", "10"));
        MemoryStorage ms = new MemoryStorage();
        AuthService as = new AuthService(ms, c1, now::get);
        User admin = as.createUser(null, "Admin", "Správce", "dlouhe-heslo-123", "admin", "t");
        eq("admin", admin.username, "jméno malými písmeny");
        test("přihlášení s různou velikostí písmen a mezerami", () -> {
            eq(AuthService.Outcome.OK, as.login("  ADMIN ", "dlouhe-heslo-123", "1.1.1.1").outcome(), "ok");
        });
        test("špatné heslo; neplatná jména; token se ověří", () -> {
            eq(AuthService.Outcome.INVALID, as.login("admin", "spatne-heslo-1", "i").outcome(), "špatné");
            eq(AuthService.Outcome.INVALID, as.login("../etc/passwd", "x", "i").outcome(), "neplatné jméno");
            eq(AuthService.Outcome.INVALID, as.login(null, null, "i").outcome(), "null");
            AuthService.LoginResult r = as.login("admin", "dlouhe-heslo-123", "i");
            eq("admin", as.authenticate(r.token()).username, "token");
            eq(null, as.authenticate(r.token() + "x"), "poškozený token");
        });
        test("zámek po 3 chybách, odemčení po čase, správné heslo během zámku nepomůže", () -> {
            for (int i = 0; i < 2; i++) eq(AuthService.Outcome.INVALID, as.login("admin", "chyba-chyba-12", "i").outcome(), "chyba " + i);
            eq(AuthService.Outcome.LOCKED, as.login("admin", "chyba-chyba-12", "i").outcome(), "zamčeno");
            AuthService.LoginResult l = as.login("admin", "dlouhe-heslo-123", "i");
            eq(AuthService.Outcome.LOCKED, l.outcome(), "správné heslo během zámku");
            yes(l.retryAfterSec() > 0 && l.retryAfterSec() <= 600, "retry " + l.retryAfterSec());
            now.addAndGet(11 * 60_000);
            eq(AuthService.Outcome.OK, as.login("admin", "dlouhe-heslo-123", "i").outcome(), "po odemčení");
        });
        test("neexistující uživatel se zamyká stejně (nelze zjistit, kdo existuje)", () -> {
            eq(AuthService.Outcome.INVALID, as.login("nikdo", "xxxxxxxxxxxx1", "i").outcome(), "1");
            eq(AuthService.Outcome.INVALID, as.login("nikdo", "xxxxxxxxxxxx1", "i").outcome(), "2");
            eq(AuthService.Outcome.LOCKED, as.login("nikdo", "xxxxxxxxxxxx1", "i").outcome(), "3 zamčeno");
        });
        test("změna hesla zneplatní staré tokeny a zkontroluje politiku", () -> {
            String old = as.login("admin", "dlouhe-heslo-123", "i").token();
            User u = as.authenticate(old);
            try { as.changePassword(u, "spatne", "nove-heslo-4567", "i"); throw new AssertionError("měl selhat"); } catch (AuthService.ApiException e) { eq("wrong_password", e.code, "špatné současné"); }
            try { as.changePassword(u, "dlouhe-heslo-123", "krátké", "i"); throw new AssertionError("měl selhat"); } catch (AuthService.ApiException e) { eq("weak_password", e.code, "slabé"); }
            AuthService.LoginResult r = as.changePassword(u, "dlouhe-heslo-123", "nove-heslo-4567", "i");
            eq(null, as.authenticate(old), "starý token");
            eq("admin", as.authenticate(r.token()).username, "nový token");
            eq(AuthService.Outcome.INVALID, as.login("admin", "dlouhe-heslo-123", "i").outcome(), "staré heslo");
            eq(AuthService.Outcome.OK, as.login("admin", "nove-heslo-4567", "i").outcome(), "nové heslo");
        });
        test("zakázaný uživatel se nepřihlásí a token mu přestane platit", () -> {
            User b = as.createUser(null, "bara", "Bára", "bara-heslo-1234", "user", "t");
            String tok = as.login("bara", "bara-heslo-1234", "i").token();
            eq("bara", as.authenticate(tok).username, "před");
            as.setDisabled(as.authenticate(as.login("admin", "nove-heslo-4567", "i").token()), b.id, true, "i");
            eq(null, as.authenticate(tok), "token po zákazu");
            eq(AuthService.Outcome.INVALID, as.login("bara", "bara-heslo-1234", "i").outcome(), "login po zákazu");
        });
        test("duplicitní jméno, špatná role, slabé heslo při vytvoření", () -> {
            try { as.createUser(null, "ADMIN", "x", "dlouhe-heslo-123", "user", "t"); throw new AssertionError("měl selhat"); } catch (AuthService.ApiException e) { eq(409, e.status, "duplicita"); }
            try { as.createUser(null, "cyril", "x", "dlouhe-heslo-123", "root", "t"); throw new AssertionError("měl selhat"); } catch (AuthService.ApiException e) { eq("bad_role", e.code, "role"); }
            try { as.createUser(null, "cyril", "x", "123", "user", "t"); throw new AssertionError("měl selhat"); } catch (AuthService.ApiException e) { eq("weak_password", e.code, "heslo"); }
            try { as.createUser(null, "a b", "x", "dlouhe-heslo-123", "user", "t"); throw new AssertionError("měl selhat"); } catch (AuthService.ApiException e) { eq("bad_username", e.code, "jméno"); }
        });
        test("audit zaznamenává události bez hesel", () -> {
            yes(ms.auditLog.stream().anyMatch(s -> s.startsWith("login_ok")), "login_ok");
            yes(ms.auditLog.stream().anyMatch(s -> s.startsWith("lockout")), "lockout");
            yes(ms.auditLog.stream().noneMatch(s -> s.contains("dlouhe-heslo") || s.contains("nove-heslo")), "žádná hesla v auditu");
        });
        test("rehash při přihlášení po zvýšení počtu iterací", () -> {
            MemoryStorage s2 = new MemoryStorage();
            new AuthService(s2, cfg(Map.of("PBKDF2_ITERATIONS", "2000")), now::get).createUser(null, "stary", "s", "stare-heslo-1234", "user", "t");
            AuthService hi = new AuthService(s2, cfg(Map.of("PBKDF2_ITERATIONS", "4000")), now::get);
            eq(AuthService.Outcome.OK, hi.login("stary", "stare-heslo-1234", "i").outcome(), "login");
            yes(s2.findUserByName("stary").get().pwHash.startsWith("pbkdf2-sha256$4000$"), "přehashováno: " + s2.findUserByName("stary").get().pwHash);
        });

        System.out.println("Config");
        test("v produkci vyžaduje tajemství a klíče", () -> {
            for (Map<String, String> m : List.of(
                    Map.of("APP_ENV", "production"),
                    Map.of("APP_ENV", "production", "JWT_SECRET", "kratke"),
                    Map.of("APP_ENV", "production", "JWT_SECRET", "x".repeat(40)),
                    Map.of("APP_ENV", "production", "JWT_SECRET", "x".repeat(40), "INTERNAL_API_KEY", "y".repeat(30)),
                    Map.of("APP_ENV", "production", "JWT_SECRET", "x".repeat(40), "INTERNAL_API_KEY", "y".repeat(30), "DB_URL", "jdbc:sqlserver://x", "PBKDF2_ITERATIONS", "1000"))) {
                try { new Config(m::get); throw new AssertionError("měl selhat: " + m.keySet()); } catch (IllegalStateException e) { /* ok */ }
            }
            Config ok = new Config(Map.of("APP_ENV", "production", "JWT_SECRET", "x".repeat(40), "INTERNAL_API_KEY", "y".repeat(30), "DB_URL", "jdbc:sqlserver://x")::get);
            eq("sql", ok.storage, "výchozí úložiště v produkci");
        });
        test("dialekt podle JDBC URL", () -> {
            eq("mssql", Dialect.forUrl("jdbc:sqlserver://a.database.windows.net:1433;database=x").name(), "mssql");
            eq("postgres", Dialect.forUrl("jdbc:postgresql://a/b").name(), "pg");
            try { Dialect.forUrl("jdbc:mysql://a"); throw new AssertionError("měl selhat"); } catch (IllegalArgumentException e) { /* ok */ }
        });
        test("rozpoznání přechodných chyb databáze", () -> {
            Dialect ss = new Dialect.SqlServer(), pg = new Dialect.Postgres();
            yes(ss.isTransient(new java.sql.SQLException("paused", "S0001", 40613)), "40613");
            no(ss.isTransient(new java.sql.SQLException("syntax", "42000", 102)), "syntaxe");
            yes(ss.isDuplicate(new java.sql.SQLException("dup", "23000", 2627)), "2627");
            yes(pg.isTransient(new java.sql.SQLException("down", "57P03")), "57P03");
            yes(pg.isTransient(new java.sql.SQLException("conn", "08006")), "08006");
            no(pg.isTransient(new java.sql.SQLException("syntax", "42601")), "syntaxe pg");
            yes(pg.isDuplicate(new java.sql.SQLException("dup", "23505")), "23505");
        });

        System.out.println("HTTP API");
        Config hc = cfg(Map.of("PORT", "0", "MAX_DOC_BYTES", "2000", "BOOTSTRAP_ADMIN_USER", "root", "BOOTSTRAP_ADMIN_PASSWORD", "root-heslo-12345"));
        MemoryStorage hs = new MemoryStorage();
        HttpServer srv = Main.start(hc, hs);
        try {
            test("bootstrap správce a health bez přihlášení", () -> {
                eq(200, call(srv, "GET", "/api/health", null, null).status(), "health");
                eq(1, hs.countUsers(), "jeden uživatel");
                login(srv, "root", "root-heslo-12345");
            });
            String adm = login(srv, "root", "root-heslo-12345");
            test("bez tokenu a se špatným tokenem 401, hlavičky bezpečnosti", () -> {
                Res r = call(srv, "GET", "/api/docs", null, null);
                eq(401, r.status(), "bez tokenu");
                eq(401, call(srv, "GET", "/api/docs", "nesmysl", null).status(), "špatný token");
                eq(401, call(srv, "GET", "/api/auth/me", adm + "x", null).status(), "poškozený token");
                eq("no-store", r.headers().get("cache-control").get(0), "cache-control");
                eq("nosniff", r.headers().get("x-content-type-options").get(0), "nosniff");
            });
            test("špatné přihlášení 401, neplatný vstup 400/415, odpověď neprozrazuje existenci účtu", () -> {
                Res a = call(srv, "POST", "/api/auth/login", null, "{\"username\":\"root\",\"password\":\"spatne-heslo-1\"}");
                Res b = call(srv, "POST", "/api/auth/login", null, "{\"username\":\"nikdo\",\"password\":\"spatne-heslo-1\"}");
                eq(401, a.status(), "špatné heslo"); eq(a.body(), b.body(), "stejná odpověď");
                eq(400, call(srv, "POST", "/api/auth/login", null, "{").status(), "rozbitý JSON");
                eq(400, call(srv, "POST", "/api/auth/login", null, "[]").status(), "pole místo objektu");
                eq(415, call(srv, "POST", "/api/auth/login", null, "x", "Content-Type", "text/plain").status(), "text/plain");
            });
            test("CRUD dokumentů a načtení všeho najednou (české znaky)", () -> {
                eq(200, call(srv, "PUT", "/api/docs/clients/c_1", adm, "{\"name\":\"Jana Nováková\",\"n\":[1,2]}").status(), "put");
                eq(200, call(srv, "PUT", "/api/docs/plans/p_1", adm, "{\"title\":\"Týden\"}").status(), "put2");
                Map<String, Object> all = call(srv, "GET", "/api/docs", adm, null).json();
                eq(List.of("clients", "tracks", "plans", "foods", "recipes", "templates", "settings"), List.copyOf(all.keySet()), "všechny kolekce");
                eq("Jana Nováková", ((Map<?, ?>) ((Map<?, ?>) all.get("clients")).get("c_1")).get("name"), "obsah");
                eq(204, call(srv, "DELETE", "/api/docs/clients/c_1", adm, null).status(), "delete");
                eq(204, call(srv, "DELETE", "/api/docs/clients/c_1", adm, null).status(), "delete znovu");
                eq(0, ((Map<?, ?>) call(srv, "GET", "/api/docs", adm, null).json().get("clients")).size(), "smazáno");
                eq(200, call(srv, "PUT", "/api/docs/plans/p_1", adm, "{\"title\":\"Nový\"}").status(), "přepis");
                eq("Nový", ((Map<?, ?>) ((Map<?, ?>) call(srv, "GET", "/api/docs", adm, null).json().get("plans")).get("p_1")).get("title"), "přepsáno");
            });
            test("validace: neznámá kolekce, id, neobjekt, příliš velké", () -> {
                eq(404, call(srv, "PUT", "/api/docs/users/x", adm, "{}").status(), "kolekce");
                eq(400, call(srv, "PUT", "/api/docs/clients/a%20b", adm, "{}").status(), "mezera v id");
                eq(400, call(srv, "PUT", "/api/docs/clients/..%2F..%2Fetc", adm, "{}").status(), "traversal");
                eq(400, call(srv, "PUT", "/api/docs/clients/x'%3BDROP%20TABLE%20docs--", adm, "{}").status(), "SQL injection v id");
                eq(400, call(srv, "PUT", "/api/docs/clients/c_2", adm, "[1]").status(), "pole");
                eq(400, call(srv, "PUT", "/api/docs/clients/c_2", adm, "{\"a\":").status(), "rozbitý JSON");
                eq(413, call(srv, "PUT", "/api/docs/clients/c_2", adm, "{\"a\":\"" + "x".repeat(3000) + "\"}").status(), "413");
                eq(415, call(srv, "PUT", "/api/docs/clients/c_2", adm, "{}", "Content-Type", "text/html").status(), "415");
            });
            test("data jsou odizolovaná mezi uživateli", () -> {
                eq(201, call(srv, "POST", "/api/admin/users", adm, "{\"username\":\"bara\",\"password\":\"bara-heslo-1234\",\"displayName\":\"Bára\"}").status(), "vytvoření");
                String bt = login(srv, "bara", "bara-heslo-1234");
                eq(200, call(srv, "PUT", "/api/docs/clients/c_secret", adm, "{\"name\":\"tajné\"}").status(), "admin zapíše");
                yes(!call(srv, "GET", "/api/docs", bt, null).body().contains("tajné"), "Bára nevidí data admina");
                eq(200, call(srv, "PUT", "/api/docs/clients/c_secret", bt, "{\"name\":\"Bářino\"}").status(), "Bára zapíše stejné id");
                yes(call(srv, "GET", "/api/docs", adm, null).body().contains("tajné"), "admin má stále své");
                eq(204, call(srv, "DELETE", "/api/docs/clients/c_secret", bt, null).status(), "Bára maže");
                yes(call(srv, "GET", "/api/docs", adm, null).body().contains("tajné"), "smazání Báry se admina netýká");
            });
            test("běžný uživatel nemá přístup k administraci", () -> {
                String bt = login(srv, "bara", "bara-heslo-1234");
                eq(403, call(srv, "GET", "/api/admin/users", bt, null).status(), "list");
                eq(403, call(srv, "POST", "/api/admin/users", bt, "{\"username\":\"hacker\",\"password\":\"hacker-heslo-123\"}").status(), "create");
                eq(200, call(srv, "GET", "/api/admin/users", adm, null).status(), "admin smí");
            });
            test("změna hesla: starý token přestane platit, nový funguje", () -> {
                String bt = login(srv, "bara", "bara-heslo-1234");
                eq(400, call(srv, "POST", "/api/auth/password", bt, "{\"current\":\"spatne-heslo-1\",\"next\":\"nove-heslo-9999\"}").status(), "špatné současné");
                eq(400, call(srv, "POST", "/api/auth/password", bt, "{\"current\":\"bara-heslo-1234\",\"next\":\"kratke\"}").status(), "slabé");
                Res r = call(srv, "POST", "/api/auth/password", bt, "{\"current\":\"bara-heslo-1234\",\"next\":\"nove-heslo-9999\"}");
                eq(200, r.status(), "změna");
                eq(401, call(srv, "GET", "/api/auth/me", bt, null).status(), "starý token");
                eq(200, call(srv, "GET", "/api/auth/me", (String) r.json().get("token"), null).status(), "nový token");
                eq(200, call(srv, "POST", "/api/auth/password", (String) r.json().get("token"), "{\"current\":\"nove-heslo-9999\",\"next\":\"bara-heslo-1234\"}").status(), "zpět");
            });
            test("odhlášení ze všech zařízení", () -> {
                String t1 = login(srv, "bara", "bara-heslo-1234"), t2 = login(srv, "bara", "bara-heslo-1234");
                eq(200, call(srv, "POST", "/api/auth/logout-all", t1, "{}").status(), "logout-all");
                eq(401, call(srv, "GET", "/api/auth/me", t1, null).status(), "t1");
                eq(401, call(srv, "GET", "/api/auth/me", t2, null).status(), "t2");
            });
            test("zámek účtu přes HTTP: 5 chyb → 429 s Retry-After", () -> {
                eq(201, call(srv, "POST", "/api/admin/users", adm, "{\"username\":\"lock\",\"password\":\"lock-heslo-12345\"}").status(), "create");
                Res last = null;
                for (int i = 0; i < 5; i++) last = call(srv, "POST", "/api/auth/login", null, "{\"username\":\"lock\",\"password\":\"zle-heslo-1234\"}");
                eq(429, last.status(), "429");
                yes(last.headers().get("retry-after") != null, "Retry-After");
                eq(429, call(srv, "POST", "/api/auth/login", null, "{\"username\":\"lock\",\"password\":\"lock-heslo-12345\"}").status(), "správné heslo za zámku");
            });
            test("neznámé cesty a metody", () -> {
                eq(404, call(srv, "GET", "/", null, null).status(), "kořen");
                eq(404, call(srv, "GET", "/api/neco", adm, null).status(), "neznámá");
                eq(404, call(srv, "PATCH", "/api/docs/clients/x", adm, "{}").status(), "PATCH");
                yes(!call(srv, "GET", "/api/docs/clients", adm, null).body().contains("Exception"), "bez výjimek v těle");
            });
        } finally { srv.stop(0); }

        System.out.println("HTTP API – sdílený klíč mezi webem a API");
        Config kc = cfg(Map.of("PORT", "0", "INTERNAL_API_KEY", "tajny-interni-klic-1234567890", "BOOTSTRAP_ADMIN_USER", "root", "BOOTSTRAP_ADMIN_PASSWORD", "root-heslo-12345"));
        HttpServer ksrv = Main.start(kc, new MemoryStorage());
        try {
            test("bez klíče 403 (kromě health), se špatným klíčem 403, se správným funguje a bere IP z hlavičky", () -> {
                eq(200, call(ksrv, "GET", "/api/health", null, null).status(), "health");
                eq(403, call(ksrv, "POST", "/api/auth/login", null, "{\"username\":\"root\",\"password\":\"root-heslo-12345\"}").status(), "bez klíče");
                eq(403, call(ksrv, "POST", "/api/auth/login", null, "{\"username\":\"root\",\"password\":\"root-heslo-12345\"}", "X-Internal-Key", "spatny-klic").status(), "špatný klíč");
                String t = login(ksrv, "root", "root-heslo-12345", "X-Internal-Key", "tajny-interni-klic-1234567890", "X-Client-IP", "203.0.113.7");
                eq(403, call(ksrv, "GET", "/api/docs", t, null).status(), "token bez klíče");
                eq(200, call(ksrv, "GET", "/api/docs", t, null, "X-Internal-Key", "tajny-interni-klic-1234567890").status(), "token s klíčem");
            });
        } finally { ksrv.stop(0); }

        System.out.println("Start na pozadí (probouzení databáze)");
        test("API odpovídá hned, ale dokud není databáze připravená, vrací 503 starting; po přípravě funguje", () -> {
            Main.initRetryMs = 30;
            java.util.concurrent.CountDownLatch gate = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.atomic.AtomicInteger tries = new java.util.concurrent.atomic.AtomicInteger();
            MemoryStorage slow = new MemoryStorage() {
                @Override public void init() throws StorageException {
                    if (tries.incrementAndGet() <= 3) throw new StorageException("pauza", new java.sql.SQLException("paused", "S0001", 40613), true);
                    try { gate.await(); } catch (InterruptedException e) { throw new RuntimeException(e); }
                }
            };
            Main.Started st = Main.startAsync(cfg(Map.of("PORT", "0", "BOOTSTRAP_ADMIN_USER", "root", "BOOTSTRAP_ADMIN_PASSWORD", "root-heslo-12345")), slow);
            try {
                Res h = call(st.server, "GET", "/api/health", null, null);
                eq(200, h.status(), "health hned"); eq(false, h.json().get("ready"), "ještě nepřipraveno");
                eq(503, call(st.server, "GET", "/api/ready", null, null).status(), "ready 503");
                Res l = call(st.server, "POST", "/api/auth/login", null, "{\"username\":\"root\",\"password\":\"root-heslo-12345\"}");
                eq(503, l.status(), "login 503"); eq("starting", l.json().get("error"), "kód"); yes(l.headers().get("retry-after") != null, "Retry-After");
                gate.countDown(); st.init.join();
                eq(null, st.failure, "bez chyby"); yes(tries.get() == 4, "po třech přechodných chybách se zkusilo znovu: " + tries.get());
                eq(200, call(st.server, "GET", "/api/ready", null, null).status(), "ready 200");
                eq(true, call(st.server, "GET", "/api/health", null, null).json().get("ready"), "ready true");
                login(st.server, "root", "root-heslo-12345");
            } finally { st.server.stop(0); Main.initRetryMs = 5000; }
        });
        test("neopravitelná chyba inicializace: start selže (proces se ukončí a platforma ho spustí znovu)", () -> {
            MemoryStorage broken = new MemoryStorage() { @Override public void init() throws StorageException { throw new StorageException("špatné heslo", new java.sql.SQLException("login failed", "S0001", 18456), false); } };
            try { Main.start(cfg(Map.of("PORT", "0")), broken); throw new AssertionError("měl selhat"); } catch (Storage.StorageException e) { /* ok */ }
        });

        System.out.println("\n" + pass + " prošlo, " + fail + " selhalo");
        System.exit(fail == 0 ? 0 : 1);
    }
}
