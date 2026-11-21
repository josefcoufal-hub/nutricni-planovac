package cz.planovac.api;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Úložiště: uživatelé, dokumenty (JSON po kolekcích, vždy v rámci jednoho vlastníka) a audit. */
public interface Storage extends AutoCloseable {
    /** Vytvoří schéma (idempotentní). */
    void init() throws StorageException;

    Optional<User> findUserByName(String lowerName) throws StorageException;
    Optional<User> findUserById(String id) throws StorageException;
    List<User> listUsers() throws StorageException;
    int countUsers() throws StorageException;
    /** Vyhodí DuplicateException při existujícím jménu. */
    void insertUser(User u) throws StorageException;
    void updateUser(User u) throws StorageException;

    /** kolekce → (id → JSON text). Pouze dokumenty daného vlastníka. */
    Map<String, Map<String, String>> loadAll(String ownerId) throws StorageException;
    /** Vrací čas uložení (ms). */
    long upsertDoc(String ownerId, String coll, String id, String json) throws StorageException;
    void deleteDoc(String ownerId, String coll, String id) throws StorageException;

    void audit(String userId, String event, String ip, String detail);
    boolean ping();

    @Override
    void close();

    class StorageException extends Exception {
        public final boolean transientError;
        public StorageException(String m, Throwable c, boolean transientError) { super(m, c); this.transientError = transientError; }
        public StorageException(String m) { this(m, null, false); }
    }

    class DuplicateException extends StorageException {
        public DuplicateException(String m) { super(m); }
    }
}
