package cz.planovac.api;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Kontrola SQL vrstvy proti SKUTEČNÉ databázi (Azure SQL Database nebo PostgreSQL). V repozitáři se spouští ručně, protože potřebuje databázi i JDBC ovladač.
 *
 *   DB_URL=... DB_USER=... DB_PASSWORD=... SELFTEST_CONFIRM=yes \
 *   java -cp "target/planovac-api.jar:target/lib/*:out-test" cz.planovac.api.SqlSelfTest
 *
 * Používejte TESTOVACÍ databázi: test zakládá a na konci maže řádky s příponou „selftest“, ale tabulky users/docs/audit vytváří, pokud neexistují.
 */
public final class SqlSelfTest {
    static int pass, fail;
    interface T { void run() throws Exception; }
    static void test(String name, T t) {
        try { t.run(); pass++; System.out.println("  ok   " + name); }
        catch (Throwable e) { fail++; System.out.println("  FAIL " + name + " -> " + e); e.printStackTrace(System.out); }
    }
    static void yes(boolean c, String m) { if (!c) throw new AssertionError(m); }
    static void eq(Object a, Object b, String m) { if (!java.util.Objects.equals(a, b)) throw new AssertionError(m + ": čekáno <" + a + "> je <" + b + ">"); }

    public static void main(String[] args) throws Exception {
        if (!"yes".equals(System.getenv("SELFTEST_CONFIRM"))) {
            System.out.println("Test zapisuje do databáze z DB_URL. Použijte testovací databázi a nastavte SELFTEST_CONFIRM=yes.");
            System.exit(2);
        }
        Config cfg = new Config(System::getenv);
        if (cfg.dbUrl == null || cfg.dbUrl.isEmpty()) { System.out.println("Chybí DB_URL."); System.exit(2); }
        Dialect d = Dialect.forUrl(cfg.dbUrl);
        System.out.println("Dialekt: " + d.name());
        SqlStorage st = new SqlStorage(cfg);
        String tag = Passwords.randomId().substring(0, 8);
        String uname = "selftest-" + tag;
        User u = new User();
        u.id = Passwords.randomId(); u.username = uname; u.displayName = "Žluťoučký kůň 😀"; u.pwHash = "pbkdf2-sha256$1000$aa$bb"; u.role = "user";
        u.createdAt = System.currentTimeMillis();
        String owner = u.id;

        try {
            test("init je opakovatelný (schéma se vytvoří, podruhé nic nedělá)", () -> { st.init(); st.init(); });
            test("ping", () -> yes(st.ping(), "ping"));
            test("vložení a načtení uživatele (podle jména i id), české znaky a emoji se zachovají", () -> {
                st.insertUser(u);
                User a = st.findUserByName(uname).orElseThrow(); User b = st.findUserById(u.id).orElseThrow();
                eq(u.displayName, a.displayName, "displayName"); eq(u.id, b.id, "id"); eq("user", a.role, "role"); eq(false, a.disabled, "disabled");
                yes(st.findUserByName("neexistuje-" + tag).isEmpty(), "neexistující");
            });
            test("duplicitní uživatelské jméno vyhodí DuplicateException", () -> {
                User x = u.copy(); x.id = Passwords.randomId();
                try { st.insertUser(x); throw new AssertionError("měl selhat"); } catch (Storage.DuplicateException e) { /* ok */ }
            });
            test("aktualizace uživatele", () -> {
                User a = st.findUserById(u.id).orElseThrow();
                a.failedAttempts = 3; a.lockedUntil = 123456789012L; a.tokenVersion = 7; a.disabled = true; a.lastLoginAt = 42; a.displayName = "Změněno ěščřžýáíé";
                st.updateUser(a);
                User b = st.findUserById(u.id).orElseThrow();
                eq(3, b.failedAttempts, "failed"); eq(123456789012L, b.lockedUntil, "locked"); eq(7, b.tokenVersion, "ver"); eq(true, b.disabled, "disabled"); eq("Změněno ěščřžýáíé", b.displayName, "jméno");
                yes(st.listUsers().stream().anyMatch(x -> x.username.equals(uname)), "listUsers"); yes(st.countUsers() >= 1, "count");
            });
            test("dokumenty: vložení, přepsání, načtení, smazání; izolace vlastníků; velikost písmen v id", () -> {
                st.upsertDoc(owner, "clients", "c_1", "{\"name\":\"Jana Nováková 😀\"}");
                st.upsertDoc(owner, "clients", "c_1", "{\"name\":\"Přepsáno\"}");
                st.upsertDoc(owner, "clients", "C_1", "{\"name\":\"Velké písmeno\"}");
                st.upsertDoc(owner, "plans", "p_1", "{}");
                st.upsertDoc("jiny-vlastnik-" + tag, "clients", "c_1", "{\"name\":\"cizí\"}");
                Map<String, Map<String, String>> all = st.loadAll(owner);
                eq("{\"name\":\"Přepsáno\"}", all.get("clients").get("c_1"), "přepsáno");
                eq("{\"name\":\"Velké písmeno\"}", all.get("clients").get("C_1"), "c_1 a C_1 jsou různá id");
                eq(2, all.get("clients").size(), "dva klienti"); eq(1, all.get("plans").size(), "jeden plán");
                yes(!st.loadAll(owner).toString().contains("cizí"), "cizí data nejsou vidět");
                st.deleteDoc(owner, "clients", "c_1"); st.deleteDoc(owner, "clients", "c_1");
                eq(1, st.loadAll(owner).get("clients").size(), "po smazání");
            });
            test("velký dokument (~900 kB) se uloží a vrátí beze změny", () -> {
                String big = "{\"x\":\"" + "ěščřž".repeat(180_000) + "\"}";
                st.upsertDoc(owner, "templates", "big", big);
                eq(big, st.loadAll(owner).get("templates").get("big"), "velký dokument");
            });
            test("souběžné zápisy stejného dokumentu (20 vláken) nespadnou na duplicitě", () -> {
                ExecutorService ex = Executors.newFixedThreadPool(20);
                List<Future<?>> fs = new ArrayList<>();
                for (int i = 0; i < 20; i++) { final int n = i; fs.add(ex.submit(() -> { st.upsertDoc(owner, "foods", "race", "{\"n\":" + n + "}"); return null; })); }
                for (Future<?> f : fs) f.get();
                ex.shutdown();
                yes(st.loadAll(owner).get("foods").get("race").matches("\\{\"n\":\\d+\\}"), "dokument existuje");
            });
            test("audit se zapíše a nevyhodí chybu ani u dlouhých hodnot", () -> {
                st.audit(u.id, "selftest", "203.0.113.9", "x".repeat(1000));
                st.audit(null, "selftest", null, null);
            });
        } finally {
            // úklid: smazání testovacích řádků přímo přes JDBC
            try (Connection c = DriverManager.getConnection(cfg.dbUrl, cfg.dbUser, cfg.dbPassword)) {
                for (String o : new String[]{owner, "jiny-vlastnik-" + tag}) {
                    try (var ps = c.prepareStatement("DELETE FROM " + d.table("docs") + " WHERE owner_id = ?")) { ps.setString(1, o); ps.executeUpdate(); }
                }
                try (var ps = c.prepareStatement("DELETE FROM " + d.table("users") + " WHERE username = ?")) { ps.setString(1, uname); ps.executeUpdate(); }
                try (var ps = c.prepareStatement("DELETE FROM " + d.table("audit") + " WHERE event = ?")) { ps.setString(1, "selftest"); ps.executeUpdate(); }
            } catch (Exception e) { System.out.println("Úklid se nepodařil: " + e); }
            st.close();
        }
        System.out.println("\n" + pass + " prošlo, " + fail + " selhalo");
        System.exit(fail == 0 ? 0 : 1);
    }
}
