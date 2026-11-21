package cz.planovac.api;

import java.sql.SQLException;
import java.sql.SQLRecoverableException;
import java.sql.SQLTransientException;
import java.util.List;
import java.util.Set;

/** Rozdíly mezi databázemi: DDL a rozpoznání přechodných chyb a duplicit. Ostatní SQL je společné. */
public interface Dialect {
    String name();
    String table(String n);
    List<String> schema();
    boolean isTransient(SQLException e);
    boolean isDuplicate(SQLException e);

    static Dialect forUrl(String url) {
        if (url.startsWith("jdbc:sqlserver:")) return new SqlServer();
        if (url.startsWith("jdbc:postgresql:")) return new Postgres();
        throw new IllegalArgumentException("Nepodporovaná DB_URL (očekáván jdbc:sqlserver: nebo jdbc:postgresql:)");
    }

    static boolean genericTransient(SQLException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof SQLTransientException || t instanceof SQLRecoverableException || t instanceof java.net.SocketException || t instanceof java.net.SocketTimeoutException) return true;
        }
        return false;
    }

    /** Azure SQL Database (a SQL Server). */
    final class SqlServer implements Dialect {
        // Klíčové sloupce jsou NVARCHAR s binárním řazením: ovladač posílá řetězce jako NVARCHAR, takže se index použije
        // (bez implicitního převodu sloupce) a identifikátory se porovnávají s rozlišením velikosti písmen jako u PostgreSQL.
        // 40613 databáze není dostupná (pauza/probouzení), 40197/40501/49918-20 přechodné, 4060 nelze otevřít DB, 10928/10929 limity
        private static final Set<Integer> TRANSIENT = Set.of(40613, 40197, 40501, 49918, 49919, 49920, 4060, 10928, 10929, 40540, 40143, 233, 64, 20, 10053, 10054, 10060, 1205);
        @Override public String name() { return "mssql"; }
        @Override public String table(String n) { return "dbo." + n; }
        @Override public List<String> schema() {
            return List.of(
                "IF OBJECT_ID(N'dbo.users', N'U') IS NULL CREATE TABLE dbo.users ("
                    + "id NVARCHAR(36) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY, username NVARCHAR(100) NOT NULL, display_name NVARCHAR(200) NOT NULL, "
                    + "pw_hash VARCHAR(300) NOT NULL, user_role VARCHAR(20) NOT NULL, disabled INT NOT NULL DEFAULT 0, "
                    + "failed_attempts INT NOT NULL DEFAULT 0, locked_until BIGINT NOT NULL DEFAULT 0, token_version INT NOT NULL DEFAULT 1, "
                    + "created_at BIGINT NOT NULL, last_login_at BIGINT NOT NULL DEFAULT 0)",
                "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_users_username' AND object_id = OBJECT_ID(N'dbo.users')) "
                    + "CREATE UNIQUE INDEX ux_users_username ON dbo.users(username)",
                "IF OBJECT_ID(N'dbo.docs', N'U') IS NULL CREATE TABLE dbo.docs ("
                    + "owner_id NVARCHAR(36) COLLATE Latin1_General_100_BIN2 NOT NULL, coll NVARCHAR(30) COLLATE Latin1_General_100_BIN2 NOT NULL, "
                    + "doc_id NVARCHAR(200) COLLATE Latin1_General_100_BIN2 NOT NULL, body NVARCHAR(MAX) NOT NULL, "
                    + "updated_at BIGINT NOT NULL, CONSTRAINT pk_docs PRIMARY KEY (owner_id, coll, doc_id))",
                "IF OBJECT_ID(N'dbo.audit', N'U') IS NULL CREATE TABLE dbo.audit ("
                    + "id BIGINT IDENTITY(1,1) PRIMARY KEY, ts BIGINT NOT NULL, user_id VARCHAR(36) NULL, event VARCHAR(40) NOT NULL, "
                    + "ip VARCHAR(64) NULL, detail NVARCHAR(400) NULL)"
            );
        }
        @Override public boolean isTransient(SQLException e) {
            for (SQLException x = e; x != null; x = x.getNextException()) if (TRANSIENT.contains(x.getErrorCode())) return true;
            return Dialect.genericTransient(e) || "08S01".equals(e.getSQLState()) || "08001".equals(e.getSQLState());
        }
        @Override public boolean isDuplicate(SQLException e) { return e.getErrorCode() == 2627 || e.getErrorCode() == 2601; }
    }

    /** PostgreSQL (Azure Database for PostgreSQL – Flexible Server). */
    final class Postgres implements Dialect {
        @Override public String name() { return "postgres"; }
        @Override public String table(String n) { return n; }
        @Override public List<String> schema() {
            return List.of(
                "CREATE TABLE IF NOT EXISTS users (id VARCHAR(36) NOT NULL PRIMARY KEY, username VARCHAR(100) NOT NULL, display_name VARCHAR(200) NOT NULL, "
                    + "pw_hash VARCHAR(300) NOT NULL, user_role VARCHAR(20) NOT NULL, disabled INT NOT NULL DEFAULT 0, failed_attempts INT NOT NULL DEFAULT 0, "
                    + "locked_until BIGINT NOT NULL DEFAULT 0, token_version INT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, last_login_at BIGINT NOT NULL DEFAULT 0)",
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users(username)",
                "CREATE TABLE IF NOT EXISTS docs (owner_id VARCHAR(36) NOT NULL, coll VARCHAR(30) NOT NULL, doc_id VARCHAR(200) NOT NULL, body TEXT NOT NULL, "
                    + "updated_at BIGINT NOT NULL, PRIMARY KEY (owner_id, coll, doc_id))",
                "CREATE TABLE IF NOT EXISTS audit (id BIGSERIAL PRIMARY KEY, ts BIGINT NOT NULL, user_id VARCHAR(36) NULL, event VARCHAR(40) NOT NULL, "
                    + "ip VARCHAR(64) NULL, detail VARCHAR(400) NULL)"
            );
        }
        @Override public boolean isTransient(SQLException e) {
            String s = e.getSQLState();
            if (s != null && (s.startsWith("08") || s.startsWith("57P0") || s.equals("53300") || s.equals("40001") || s.equals("40P01"))) return true;
            return Dialect.genericTransient(e);
        }
        @Override public boolean isDuplicate(SQLException e) { return "23505".equals(e.getSQLState()); }
    }
}
