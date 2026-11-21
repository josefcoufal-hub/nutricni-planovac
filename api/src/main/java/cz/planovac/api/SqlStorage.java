package cz.planovac.api;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Úložiště v SQL databázi (Azure SQL Database nebo PostgreSQL přes JDBC; ovladač musí být na classpath). */
public final class SqlStorage implements Storage {
    @FunctionalInterface private interface Work<T> { T run(Connection c) throws SQLException; }

    private final Pool pool;
    private final Dialect d;
    private final String users, docs, audit;
    private static final String USER_COLS = "id, username, display_name, pw_hash, user_role, disabled, failed_attempts, locked_until, token_version, created_at, last_login_at";

    public SqlStorage(Config cfg) {
        this.d = Dialect.forUrl(cfg.dbUrl);
        this.pool = new Pool(cfg.dbUrl, cfg.dbUser, cfg.dbPassword, d, cfg.dbPoolMax, cfg.dbConnectTimeoutSec);
        this.users = d.table("users"); this.docs = d.table("docs"); this.audit = d.table("audit");
    }

    /** Provede práci na spojení; při přechodné chybě spojení jednou zkusí znovu na novém spojení (všechny operace jsou idempotentní). */
    private <T> T with(Work<T> w) throws StorageException {
        SQLException last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            Connection c = null;
            boolean broken = false;
            try {
                c = pool.borrow();
                return w.run(c);
            } catch (SQLException e) {
                last = e;
                broken = d.isTransient(e);
                if (!broken || attempt == 1) break;
                Log.warn("db_retry", "sqlstate", String.valueOf(e.getSQLState()), "code", e.getErrorCode());
            } finally {
                if (c != null) pool.release(c, broken);
            }
        }
        throw new StorageException("Chyba databáze (" + (last == null ? "?" : last.getSQLState() + "/" + last.getErrorCode()) + ")", last, last != null && d.isTransient(last));
    }

    @Override
    public void init() throws StorageException {
        with(c -> {
            for (String ddl : d.schema()) try (var s = c.createStatement()) { s.execute(ddl); }
            return null;
        });
        // audit se uchovává 180 dní
        with(c -> {
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM " + audit + " WHERE ts < ?")) {
                ps.setLong(1, System.currentTimeMillis() - 180L * 24 * 3600 * 1000);
                ps.executeUpdate();
            }
            return null;
        });
    }

    private static User readUser(ResultSet r) throws SQLException {
        User u = new User();
        u.id = r.getString(1); u.username = r.getString(2); u.displayName = r.getString(3); u.pwHash = r.getString(4); u.role = r.getString(5);
        u.disabled = r.getInt(6) != 0; u.failedAttempts = r.getInt(7); u.lockedUntil = r.getLong(8); u.tokenVersion = r.getInt(9);
        u.createdAt = r.getLong(10); u.lastLoginAt = r.getLong(11);
        return u;
    }

    @Override public Optional<User> findUserByName(String n) throws StorageException { return findUser("username", n); }
    @Override public Optional<User> findUserById(String id) throws StorageException { return findUser("id", id); }

    private Optional<User> findUser(String col, String val) throws StorageException {
        return with(c -> {
            try (PreparedStatement ps = c.prepareStatement("SELECT " + USER_COLS + " FROM " + users + " WHERE " + col + " = ?")) {
                ps.setString(1, val);
                ps.setQueryTimeout(30);
                try (ResultSet r = ps.executeQuery()) { return r.next() ? Optional.of(readUser(r)) : Optional.<User>empty(); }
            }
        });
    }

    @Override public List<User> listUsers() throws StorageException {
        return with(c -> {
            List<User> out = new ArrayList<>();
            try (PreparedStatement ps = c.prepareStatement("SELECT " + USER_COLS + " FROM " + users + " ORDER BY username"); ResultSet r = ps.executeQuery()) {
                while (r.next()) out.add(readUser(r));
            }
            return out;
        });
    }

    @Override public int countUsers() throws StorageException {
        return with(c -> {
            try (PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM " + users); ResultSet r = ps.executeQuery()) { r.next(); return r.getInt(1); }
        });
    }

    @Override public void insertUser(User u) throws StorageException {
        try {
            with(c -> {
                try (PreparedStatement ps = c.prepareStatement("INSERT INTO " + users + " (" + USER_COLS + ") VALUES (?,?,?,?,?,?,?,?,?,?,?)")) {
                    ps.setString(1, u.id); ps.setString(2, u.username); ps.setString(3, u.displayName); ps.setString(4, u.pwHash); ps.setString(5, u.role);
                    ps.setInt(6, u.disabled ? 1 : 0); ps.setInt(7, u.failedAttempts); ps.setLong(8, u.lockedUntil); ps.setInt(9, u.tokenVersion);
                    ps.setLong(10, u.createdAt); ps.setLong(11, u.lastLoginAt);
                    ps.executeUpdate();
                }
                return null;
            });
        } catch (StorageException e) {
            if (e.getCause() instanceof SQLException se && d.isDuplicate(se)) throw new DuplicateException("uživatel existuje");
            throw e;
        }
    }

    @Override public void updateUser(User u) throws StorageException {
        with(c -> {
            try (PreparedStatement ps = c.prepareStatement("UPDATE " + users + " SET display_name=?, pw_hash=?, user_role=?, disabled=?, failed_attempts=?, locked_until=?, token_version=?, last_login_at=? WHERE id=?")) {
                ps.setString(1, u.displayName); ps.setString(2, u.pwHash); ps.setString(3, u.role); ps.setInt(4, u.disabled ? 1 : 0);
                ps.setInt(5, u.failedAttempts); ps.setLong(6, u.lockedUntil); ps.setInt(7, u.tokenVersion); ps.setLong(8, u.lastLoginAt); ps.setString(9, u.id);
                if (ps.executeUpdate() != 1) throw new SQLException("uživatel nenalezen", "02000");
            }
            return null;
        });
    }

    @Override public Map<String, Map<String, String>> loadAll(String owner) throws StorageException {
        return with(c -> {
            Map<String, Map<String, String>> out = new LinkedHashMap<>();
            try (PreparedStatement ps = c.prepareStatement("SELECT coll, doc_id, body FROM " + docs + " WHERE owner_id = ?")) {
                ps.setString(1, owner);
                ps.setQueryTimeout(60);
                try (ResultSet r = ps.executeQuery()) {
                    while (r.next()) out.computeIfAbsent(r.getString(1), k -> new LinkedHashMap<>()).put(r.getString(2), r.getString(3));
                }
            }
            return out;
        });
    }

    @Override public long upsertDoc(String owner, String coll, String id, String json) throws StorageException {
        long now = System.currentTimeMillis();
        with(c -> {
            if (update(c, owner, coll, id, json, now) == 0) {
                try (PreparedStatement ps = c.prepareStatement("INSERT INTO " + docs + " (owner_id, coll, doc_id, body, updated_at) VALUES (?,?,?,?,?)")) {
                    ps.setString(1, owner); ps.setString(2, coll); ps.setString(3, id); ps.setString(4, json); ps.setLong(5, now);
                    ps.executeUpdate();
                } catch (SQLException e) {
                    if (!d.isDuplicate(e)) throw e;
                    update(c, owner, coll, id, json, now); // souběžné vložení: druhý zápis přepíše první
                }
            }
            return null;
        });
        return now;
    }

    private int update(Connection c, String owner, String coll, String id, String json, long now) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("UPDATE " + docs + " SET body = ?, updated_at = ? WHERE owner_id = ? AND coll = ? AND doc_id = ?")) {
            ps.setString(1, json); ps.setLong(2, now); ps.setString(3, owner); ps.setString(4, coll); ps.setString(5, id);
            ps.setQueryTimeout(30);
            return ps.executeUpdate();
        }
    }

    @Override public void deleteDoc(String owner, String coll, String id) throws StorageException {
        with(c -> {
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM " + docs + " WHERE owner_id = ? AND coll = ? AND doc_id = ?")) {
                ps.setString(1, owner); ps.setString(2, coll); ps.setString(3, id);
                ps.executeUpdate();
            }
            return null;
        });
    }

    @Override public void audit(String userId, String event, String ip, String detail) {
        try {
            with(c -> {
                try (PreparedStatement ps = c.prepareStatement("INSERT INTO " + audit + " (ts, user_id, event, ip, detail) VALUES (?,?,?,?,?)")) {
                    ps.setLong(1, System.currentTimeMillis()); ps.setString(2, userId); ps.setString(3, event);
                    ps.setString(4, ip == null ? null : ip.substring(0, Math.min(64, ip.length())));
                    ps.setString(5, detail == null ? null : detail.substring(0, Math.min(400, detail.length())));
                    ps.executeUpdate();
                }
                return null;
            });
        } catch (StorageException e) {
            Log.warn("audit_failed", "event", event); // audit nesmí shodit přihlášení
        }
    }

    @Override public boolean ping() {
        try {
            return with(c -> { try (var s = c.createStatement(); ResultSet r = s.executeQuery("SELECT 1")) { return r.next(); } });
        } catch (StorageException e) { return false; }
    }

    @Override public void close() { pool.close(); }
}
