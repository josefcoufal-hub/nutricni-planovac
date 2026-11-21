package cz.planovac.api;

/** Uživatel. Změnitelná kopie, ukládá se přes Storage.updateUser. */
public final class User {
    public String id, username, displayName, pwHash, role;
    public boolean disabled;
    public int failedAttempts, tokenVersion = 1;
    public long lockedUntil, createdAt, lastLoginAt;

    public User copy() {
        User u = new User();
        u.id = id; u.username = username; u.displayName = displayName; u.pwHash = pwHash; u.role = role;
        u.disabled = disabled; u.failedAttempts = failedAttempts; u.tokenVersion = tokenVersion;
        u.lockedUntil = lockedUntil; u.createdAt = createdAt; u.lastLoginAt = lastLoginAt;
        return u;
    }

    public java.util.Map<String, Object> publicView() {
        return Json.obj("id", id, "username", username, "displayName", displayName, "role", role, "disabled", disabled, "lastLoginAt", lastLoginAt);
    }
}
