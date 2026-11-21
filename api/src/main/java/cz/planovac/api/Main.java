package cz.planovac.api;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;

public final class Main {
    private Main() {}

    /** Prodleva mezi pokusy o inicializaci databáze (testy ji zkracují). */
    static volatile long initRetryMs = 5000;
    /** Jak dlouho se čeká na databázi, než se proces ukončí a platforma ho spustí znovu. */
    static volatile long initGiveUpMs = 180_000;

    /** Sestaví a spustí server a počká, až je databáze připravená (využívají to testy). */
    public static HttpServer start(Config cfg, Storage st) throws Exception {
        Started s = startAsync(cfg, st);
        s.init.join();
        if (s.failure != null) { s.server.stop(0); throw s.failure; }
        return s.server;
    }

    static final class Started {
        HttpServer server; Thread init; volatile Exception failure;
    }

    /**
     * Server začne naslouchat okamžitě (kontroly stavu fungují hned), inicializace schématu databáze běží na pozadí.
     * Při probouzení Azure SQL tak proces nespadne ani nevypadá jako nefunkční.
     */
    static Started startAsync(Config cfg, Storage st) throws Exception {
        AuthService auth = new AuthService(st, cfg, System::currentTimeMillis);
        Api api = new Api(cfg, st, auth);
        Started s = new Started();
        s.server = HttpServer.create(new InetSocketAddress(cfg.port), 128);
        s.server.createContext("/", api);
        s.server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        s.server.start();
        s.init = Thread.ofPlatform().name("db-init").start(() -> {
            long t0 = System.currentTimeMillis();
            try {
                while (true) {
                    try { st.init(); auth.bootstrap(); break; }
                    catch (Storage.StorageException e) {
                        if (!e.transientError || System.currentTimeMillis() - t0 > initGiveUpMs) throw e;
                        Log.warn("init_retry", "msg", String.valueOf(e.getMessage()));
                        Thread.sleep(initRetryMs);
                    }
                }
                api.setReady(true);
                Log.info("ready", "initMs", System.currentTimeMillis() - t0);
            } catch (Exception e) {
                s.failure = e;
                Log.error("init_failed", "msg", String.valueOf(e.getMessage()));
            }
        });
        return s;
    }

    public static void main(String[] args) throws Exception {
        Config cfg = new Config(System::getenv);
        Storage st = cfg.storage.equals("sql") ? new SqlStorage(cfg) : new MemoryStorage();
        Started s = startAsync(cfg, st);
        Log.info("started", "port", s.server.getAddress().getPort(), "env", cfg.env, "storage", cfg.storage);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { s.server.stop(2); st.close(); Log.info("stopped"); }));
        // pokud se databáze nepodaří inicializovat, ukončit proces (platforma ho restartuje a vyhodnotí chybu)
        s.init.join();
        if (s.failure != null) { Log.error("fatal", "msg", "Inicializace databáze selhala, ukončuji."); System.exit(1); }
        Thread.currentThread().join();
    }
}
