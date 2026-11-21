package cz.planovac.api;

import java.time.Instant;

/** Jednořádkové strukturované logy na stdout. Nikdy se nelogují hesla, tokeny ani obsah dokumentů. */
public final class Log {
    private Log() {}

    public static void info(String event, Object... kv) { emit("info", event, kv); }
    public static void warn(String event, Object... kv) { emit("warn", event, kv); }
    public static void error(String event, Object... kv) { emit("error", event, kv); }

    private static void emit(String level, String event, Object[] kv) {
        StringBuilder b = new StringBuilder(160);
        b.append("{\"ts\":\"").append(Instant.now()).append("\",\"level\":\"").append(level).append("\",\"event\":");
        Json.quote(b, event);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            b.append(',');
            Json.quote(b, String.valueOf(kv[i]));
            b.append(':');
            Object v = kv[i + 1];
            if (v instanceof Number || v instanceof Boolean) b.append(v); else Json.quote(b, String.valueOf(v));
        }
        b.append('}');
        System.out.println(b);
    }
}
