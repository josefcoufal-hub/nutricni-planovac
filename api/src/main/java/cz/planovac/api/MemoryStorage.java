package cz.planovac.api;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** Úložiště v paměti pro vývoj a testy. Po restartu jsou data pryč. */
public class MemoryStorage implements Storage {
    private final Map<String, User> users = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Map<String, String>>> docs = new ConcurrentHashMap<>();
    public final List<String> auditLog = new CopyOnWriteArrayList<>();

    @Override public void init() throws StorageException {}

    @Override public synchronized Optional<User> findUserByName(String n) {
        return users.values().stream().filter(u -> u.username.equals(n)).findFirst().map(User::copy);
    }
    @Override public Optional<User> findUserById(String id) { return Optional.ofNullable(users.get(id)).map(User::copy); }
    @Override public List<User> listUsers() {
        List<User> l = new ArrayList<>();
        users.values().forEach(u -> l.add(u.copy()));
        l.sort((a, b) -> a.username.compareTo(b.username));
        return l;
    }
    @Override public int countUsers() { return users.size(); }
    @Override public synchronized void insertUser(User u) throws StorageException {
        if (users.values().stream().anyMatch(x -> x.username.equals(u.username))) throw new DuplicateException("uživatel existuje");
        users.put(u.id, u.copy());
    }
    @Override public synchronized void updateUser(User u) throws StorageException {
        if (!users.containsKey(u.id)) throw new StorageException("uživatel neexistuje");
        users.put(u.id, u.copy());
    }

    @Override public Map<String, Map<String, String>> loadAll(String owner) {
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        Map<String, Map<String, String>> mine = docs.get(owner);
        if (mine != null) mine.forEach((c, m) -> out.put(c, new LinkedHashMap<>(m)));
        return out;
    }
    @Override public synchronized long upsertDoc(String owner, String coll, String id, String json) {
        docs.computeIfAbsent(owner, k -> new ConcurrentHashMap<>()).computeIfAbsent(coll, k -> new ConcurrentHashMap<>()).put(id, json);
        return System.currentTimeMillis();
    }
    @Override public synchronized void deleteDoc(String owner, String coll, String id) {
        Map<String, Map<String, String>> mine = docs.get(owner);
        if (mine != null && mine.get(coll) != null) mine.get(coll).remove(id);
    }

    @Override public void audit(String userId, String event, String ip, String detail) {
        auditLog.add(event + "|" + userId + "|" + ip + "|" + detail);
    }
    @Override public boolean ping() { return true; }
    @Override public void close() {}
}
