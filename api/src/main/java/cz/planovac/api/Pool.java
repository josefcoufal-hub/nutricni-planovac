package cz.planovac.api;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Jednoduchý pool JDBC spojení (bez knihoven).
 * - Při probouzení Azure SQL (pauza po nečinnosti) opakuje připojení s prodlevou až do časového limitu.
 * - Nečinná spojení zavírá po 90 s, aby se databáze mohla po 15 min nečinnosti sama pozastavit (a neplatilo se za ni).
 */
public final class Pool implements AutoCloseable {
    private record Idle(Connection c, long since) {}

    private final String url, user, password;
    private final Dialect dialect;
    private final Semaphore permits;
    private final int connectTimeoutSec;
    private final ConcurrentLinkedDeque<Idle> idle = new ConcurrentLinkedDeque<>();
    private final Thread reaper;
    private volatile boolean closed;
    private static final long IDLE_MAX_MS = 90_000;

    public Pool(String url, String user, String password, Dialect d, int max, int connectTimeoutSec) {
        this.url = url; this.user = user; this.password = password; this.dialect = d;
        this.permits = new Semaphore(max, true);
        this.connectTimeoutSec = connectTimeoutSec;
        this.reaper = new Thread(this::reap, "pool-reaper");
        this.reaper.setDaemon(true);
        this.reaper.start();
    }

    /** Vypůjčí spojení; volající musí zavolat release. */
    public Connection borrow() throws SQLException {
        try {
            if (!permits.tryAcquire(connectTimeoutSec, TimeUnit.SECONDS)) throw new SQLException("Vyčerpaný pool spojení", "08000");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SQLException("Přerušeno", "08000");
        }
        try {
            Idle i;
            while ((i = idle.pollFirst()) != null) {
                if (System.currentTimeMillis() - i.since() > IDLE_MAX_MS) { quiet(i.c()); continue; }
                try { if (i.c().isValid(3)) return i.c(); } catch (SQLException ignore) { /* zahodit */ }
                quiet(i.c());
            }
            return connect();
        } catch (SQLException | RuntimeException e) {
            permits.release();
            throw e;
        }
    }

    public void release(Connection c, boolean broken) {
        try {
            if (broken || closed || c.isClosed()) quiet(c);
            else {
                if (!c.getAutoCommit()) c.rollback();
                idle.addFirst(new Idle(c, System.currentTimeMillis()));
            }
        } catch (SQLException e) {
            quiet(c);
        } finally {
            permits.release();
        }
    }

    private Connection connect() throws SQLException {
        long deadline = System.currentTimeMillis() + connectTimeoutSec * 1000L;
        long wait = 1500;
        while (true) {
            try {
                Connection c = DriverManager.getConnection(url, user, password);
                c.setAutoCommit(true);
                return c;
            } catch (SQLException e) {
                if (!dialect.isTransient(e) || System.currentTimeMillis() + wait > deadline) throw e;
                Log.warn("db_connect_retry", "sqlstate", String.valueOf(e.getSQLState()), "code", e.getErrorCode(), "waitMs", wait);
                try { Thread.sleep(wait); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw e; }
                wait = Math.min(wait * 2, 8000);
            }
        }
    }

    private void reap() {
        while (!closed) {
            try { Thread.sleep(30_000); } catch (InterruptedException e) { return; }
            long now = System.currentTimeMillis();
            Idle i;
            java.util.List<Idle> keep = new java.util.ArrayList<>();
            while ((i = idle.pollFirst()) != null) { if (now - i.since() > IDLE_MAX_MS) quiet(i.c()); else keep.add(i); }
            keep.forEach(idle::addLast);
        }
    }

    private static void quiet(Connection c) { try { c.close(); } catch (SQLException ignore) { /* nic */ } }

    @Override
    public void close() {
        closed = true;
        reaper.interrupt();
        Idle i;
        while ((i = idle.pollFirst()) != null) quiet(i.c());
    }
}
