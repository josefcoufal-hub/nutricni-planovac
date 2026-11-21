package cz.planovac.api;

/** Nastavení z proměnných prostředí. V produkci (APP_ENV=production) se odmítne slabé nebo chybějící nastavení. */
public final class Config {
    public final int port;
    public final String env;
    public final String storage;          // memory | sql
    public final String dbUrl, dbUser, dbPassword;
    public final int dbPoolMax, dbConnectTimeoutSec;
    public final byte[] jwtSecret;
    public final int jwtTtlMin;
    public final String internalKey;      // volitelný sdílený klíč mezi webem a API
    public final int pbkdf2Iterations;
    public final int maxFailed, lockMinutes;
    public final long maxDocBytes;
    public final String bootstrapUser, bootstrapPassword;

    public Config(java.util.function.Function<String, String> env) {
        this.env = def(env, "APP_ENV", "development");
        boolean prod = "production".equalsIgnoreCase(this.env);
        this.port = Integer.parseInt(def(env, "PORT", "8081"));
        this.storage = def(env, "STORAGE", prod ? "sql" : "memory").toLowerCase();
        this.dbUrl = def(env, "DB_URL", "");
        this.dbUser = def(env, "DB_USER", "");
        this.dbPassword = def(env, "DB_PASSWORD", "");
        this.dbPoolMax = Integer.parseInt(def(env, "DB_POOL_MAX", "5"));
        this.dbConnectTimeoutSec = Integer.parseInt(def(env, "DB_CONNECT_TIMEOUT_SEC", "90"));
        String sec = def(env, "JWT_SECRET", "");
        if (sec.isEmpty()) {
            if (prod) throw new IllegalStateException("JWT_SECRET musí být nastaven (min. 32 znaků)");
            byte[] r = new byte[48];
            new java.security.SecureRandom().nextBytes(r);
            this.jwtSecret = r;
            Log.warn("jwt_secret_random", "note", "JWT_SECRET není nastaven, po restartu se všichni odhlásí");
        } else {
            if (sec.getBytes(java.nio.charset.StandardCharsets.UTF_8).length < 32) throw new IllegalStateException("JWT_SECRET musí mít alespoň 32 bajtů");
            this.jwtSecret = sec.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        }
        this.jwtTtlMin = Integer.parseInt(def(env, "JWT_TTL_MIN", "480"));
        this.internalKey = def(env, "INTERNAL_API_KEY", "");
        if (prod && internalKey.length() < 24) throw new IllegalStateException("INTERNAL_API_KEY musí být nastaven (min. 24 znaků)");
        this.pbkdf2Iterations = Integer.parseInt(def(env, "PBKDF2_ITERATIONS", "600000"));
        if (prod && pbkdf2Iterations < 310000) throw new IllegalStateException("PBKDF2_ITERATIONS je příliš nízké");
        this.maxFailed = Integer.parseInt(def(env, "MAX_FAILED_LOGINS", "5"));
        this.lockMinutes = Integer.parseInt(def(env, "LOCK_MINUTES", "15"));
        this.maxDocBytes = Long.parseLong(def(env, "MAX_DOC_BYTES", String.valueOf(1024 * 1024)));
        this.bootstrapUser = def(env, "BOOTSTRAP_ADMIN_USER", "");
        this.bootstrapPassword = def(env, "BOOTSTRAP_ADMIN_PASSWORD", "");
        if ("sql".equals(storage) && dbUrl.isEmpty()) throw new IllegalStateException("STORAGE=sql vyžaduje DB_URL");
        if (!storage.equals("memory") && !storage.equals("sql")) throw new IllegalStateException("STORAGE musí být memory nebo sql");
    }

    private static String def(java.util.function.Function<String, String> env, String k, String d) {
        String v = env.apply(k);
        return v == null || v.isBlank() ? d : v.trim();
    }
}
