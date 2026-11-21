package cz.planovac.api;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

/** Přihlašování, tokeny, správa uživatelů. Veškerá bezpečnostní logika je tady. */
public final class AuthService {
    public enum Outcome { OK, INVALID, LOCKED }

    public record LoginResult(Outcome outcome, String token, long expiresAtSec, User user, long retryAfterSec) {}

    public static final class ApiException extends RuntimeException {
        public final int status; public final String code;
        public ApiException(int status, String code, String message) { super(message); this.status = status; this.code = code; }
    }

    private static final Pattern NAME = Pattern.compile("^[a-z0-9][a-z0-9._@+-]{2,99}$");
    private static final long CACHE_MS = 20_000;
    private final Storage st;
    private final Config cfg;
    private final Jwt jwt;
    private final LongSupplier clock;
    /** Falešný hash, aby trvalo stejně dlouho ověření neexistujícího uživatele. */
    private final String dummyHash;
    private final Map<String, long[]> unknownFails = new ConcurrentHashMap<>(); // jméno → {počet, zámek do}
    private final Map<String, Object[]> cache = new ConcurrentHashMap<>();      // id → {User, čas}

    public AuthService(Storage st, Config cfg, LongSupplier clockMs) {
        this.st = st; this.cfg = cfg; this.clock = clockMs;
        this.jwt = new Jwt(cfg.jwtSecret);
        this.dummyHash = Passwords.hash("dummy-" + Passwords.randomId(), cfg.pbkdf2Iterations);
    }

    public static String normalize(String username) {
        if (username == null) return null;
        String n = username.trim().toLowerCase(java.util.Locale.ROOT);
        return NAME.matcher(n).matches() ? n : null;
    }

    // ------------------------------------------------------------------ přihlášení

    public LoginResult login(String username, String password, String ip) throws Storage.StorageException {
        long now = clock.getAsLong();
        String name = normalize(username);
        if (name == null || password == null || password.isEmpty() || password.length() > Passwords.MAX_LEN) {
            Passwords.verify("x", dummyHash);
            st.audit(null, "login_fail", ip, "neplatný vstup");
            return new LoginResult(Outcome.INVALID, null, 0, null, 0);
        }
        Optional<User> found = st.findUserByName(name);
        if (found.isEmpty()) return unknownUser(name, password, ip, now);
        User u = found.get();
        if (u.lockedUntil > now) {
            st.audit(u.id, "login_locked", ip, "");
            return new LoginResult(Outcome.LOCKED, null, 0, null, (u.lockedUntil - now + 999) / 1000);
        }
        boolean ok = Passwords.verify(password, u.pwHash);
        if (!ok || u.disabled) {
            if (!ok) {
                u.failedAttempts++;
                if (u.failedAttempts >= cfg.maxFailed) {
                    u.lockedUntil = now + cfg.lockMinutes * 60_000L;
                    u.failedAttempts = 0;
                    st.updateUser(u);
                    st.audit(u.id, "lockout", ip, cfg.lockMinutes + " min");
                    return new LoginResult(Outcome.LOCKED, null, 0, null, cfg.lockMinutes * 60L);
                }
                st.updateUser(u);
            }
            st.audit(u.id, "login_fail", ip, u.disabled ? "zakázaný účet" : "");
            return new LoginResult(Outcome.INVALID, null, 0, null, 0);
        }
        u.failedAttempts = 0;
        u.lockedUntil = 0;
        u.lastLoginAt = now;
        if (Passwords.needsRehash(u.pwHash, cfg.pbkdf2Iterations)) u.pwHash = Passwords.hash(password, cfg.pbkdf2Iterations);
        st.updateUser(u);
        st.audit(u.id, "login_ok", ip, "");
        cache.remove(u.id);
        long exp = now / 1000 + cfg.jwtTtlMin * 60L;
        return new LoginResult(Outcome.OK, issue(u, now / 1000, exp), exp, u, 0);
    }

    private LoginResult unknownUser(String name, String password, String ip, long now) throws Storage.StorageException {
        long[] f = unknownFails.computeIfAbsent(name, k -> new long[2]);
        if (unknownFails.size() > 10_000) unknownFails.clear(); // ochrana paměti
        synchronized (f) {
            if (f[1] > now) return new LoginResult(Outcome.LOCKED, null, 0, null, (f[1] - now + 999) / 1000);
            Passwords.verify(password, dummyHash);
            f[0]++;
            if (f[0] >= cfg.maxFailed) {
                f[0] = 0; f[1] = now + cfg.lockMinutes * 60_000L;
                st.audit(null, "login_fail", ip, "neznámý uživatel (zámek)");
                // stejné chování jako u existujícího účtu: zámek se projeví hned na pokusu, který ho spustí
                return new LoginResult(Outcome.LOCKED, null, 0, null, cfg.lockMinutes * 60L);
            }
        }
        st.audit(null, "login_fail", ip, "neznámý uživatel");
        return new LoginResult(Outcome.INVALID, null, 0, null, 0);
    }

    private String issue(User u, long iat, long exp) {
        return jwt.sign(Json.obj("sub", u.id, "usr", u.username, "role", u.role, "ver", u.tokenVersion, "iat", iat, "exp", exp, "jti", Passwords.randomId()));
    }

    /** Ověří token a vrátí aktuálního uživatele, nebo null. */
    public User authenticate(String token) {
        long now = clock.getAsLong();
        Map<String, Object> c = jwt.verify(token, now / 1000);
        if (c == null) return null;
        Object sub = c.get("sub"), ver = c.get("ver");
        if (!(sub instanceof String id) || !(ver instanceof Number vn)) return null;
        try {
            Object[] ce = cache.get(id);
            User u;
            if (ce != null && now - (Long) ce[1] < CACHE_MS) u = (User) ce[0];
            else {
                Optional<User> f = st.findUserById(id);
                if (f.isEmpty()) return null;
                u = f.get();
                cache.put(id, new Object[]{u, now});
            }
            if (u.disabled || u.tokenVersion != vn.intValue()) return null;
            return u;
        } catch (Storage.StorageException e) {
            Log.error("auth_storage_error", "msg", String.valueOf(e.getMessage()));
            throw new ApiException(503, "db_unavailable", "Databáze není dostupná.");
        }
    }

    // ------------------------------------------------------------------ účet

    /** Změna vlastního hesla. Zneplatní všechny ostatní relace a vrátí nový token. */
    public LoginResult changePassword(User actor, String current, String next, String ip) throws Storage.StorageException {
        User u = st.findUserById(actor.id).orElseThrow(() -> new ApiException(401, "unauthorized", "Přihlaste se."));
        if (current == null || !Passwords.verify(current, u.pwHash)) {
            st.audit(u.id, "password_change_fail", ip, "");
            throw new ApiException(400, "wrong_password", "Současné heslo není správné.");
        }
        String err = Passwords.policyError(next, u.username);
        if (err != null) throw new ApiException(400, "weak_password", err);
        if (current.equals(next)) throw new ApiException(400, "weak_password", "Nové heslo musí být jiné než současné.");
        u.pwHash = Passwords.hash(next, cfg.pbkdf2Iterations);
        u.tokenVersion++;
        st.updateUser(u);
        cache.remove(u.id);
        st.audit(u.id, "password_change", ip, "");
        long now = clock.getAsLong();
        long exp = now / 1000 + cfg.jwtTtlMin * 60L;
        return new LoginResult(Outcome.OK, issue(u, now / 1000, exp), exp, u, 0);
    }

    /** Odhlášení ze všech zařízení. */
    public void revokeAll(User actor, String ip) throws Storage.StorageException {
        User u = st.findUserById(actor.id).orElseThrow(() -> new ApiException(401, "unauthorized", "Přihlaste se."));
        u.tokenVersion++;
        st.updateUser(u);
        cache.remove(u.id);
        st.audit(u.id, "revoke_all", ip, "");
    }

    // ------------------------------------------------------------------ správa uživatelů (admin)

    public User createUser(User actor, String username, String displayName, String password, String role, String ip) throws Storage.StorageException {
        String name = normalize(username);
        if (name == null) throw new ApiException(400, "bad_username", "Jméno: 3 až 100 znaků a-z, 0-9, . _ @ + -");
        String err = Passwords.policyError(password, name);
        if (err != null) throw new ApiException(400, "weak_password", err);
        if (!"admin".equals(role) && !"user".equals(role)) throw new ApiException(400, "bad_role", "Role je admin nebo user.");
        User u = new User();
        u.id = Passwords.randomId();
        u.username = name;
        u.displayName = displayName == null || displayName.isBlank() ? name : displayName.trim().substring(0, Math.min(200, displayName.trim().length()));
        u.role = role;
        u.pwHash = Passwords.hash(password, cfg.pbkdf2Iterations);
        u.createdAt = clock.getAsLong();
        try { st.insertUser(u); } catch (Storage.DuplicateException e) { throw new ApiException(409, "exists", "Uživatel s tímto jménem už existuje."); }
        st.audit(actor == null ? null : actor.id, "user_create", ip, name);
        return u;
    }

    public void setDisabled(User actor, String id, boolean disabled, String ip) throws Storage.StorageException {
        User u = st.findUserById(id).orElseThrow(() -> new ApiException(404, "not_found", "Uživatel neexistuje."));
        if (actor.id.equals(id)) throw new ApiException(400, "self", "Vlastní účet nelze zakázat.");
        u.disabled = disabled;
        u.tokenVersion++;
        st.updateUser(u);
        cache.remove(id);
        st.audit(actor.id, disabled ? "user_disable" : "user_enable", ip, u.username);
    }

    public void resetPassword(User actor, String id, String password, String ip) throws Storage.StorageException {
        User u = st.findUserById(id).orElseThrow(() -> new ApiException(404, "not_found", "Uživatel neexistuje."));
        String err = Passwords.policyError(password, u.username);
        if (err != null) throw new ApiException(400, "weak_password", err);
        u.pwHash = Passwords.hash(password, cfg.pbkdf2Iterations);
        u.tokenVersion++;
        u.failedAttempts = 0;
        u.lockedUntil = 0;
        st.updateUser(u);
        cache.remove(id);
        st.audit(actor.id, "password_reset", ip, u.username);
    }

    /** Při prvním startu bez uživatelů vytvoří správce z proměnných prostředí. */
    public void bootstrap() throws Storage.StorageException {
        if (st.countUsers() > 0 || cfg.bootstrapUser.isEmpty() || cfg.bootstrapPassword.isEmpty()) return;
        createUser(null, cfg.bootstrapUser, cfg.bootstrapUser, cfg.bootstrapPassword, "admin", "bootstrap");
        Log.info("bootstrap_admin_created", "username", cfg.bootstrapUser, "note", "odeberte BOOTSTRAP_ADMIN_* z konfigurace");
    }
}
