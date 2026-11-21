package cz.planovac.api;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Malý JSON parser a zapisovač bez závislostí.
 * Parser je přísný (RFC 8259), omezuje hloubku a odmítá cokoli za koncem dokumentu.
 * Objekty = LinkedHashMap, pole = ArrayList, čísla = Double, řetězce = String, true/false = Boolean, null = null.
 */
public final class Json {
    public static final class ParseException extends RuntimeException {
        public ParseException(String m) { super(m); }
    }

    private static final int MAX_DEPTH = 64;
    private final String s;
    private int i;

    private Json(String s) { this.s = s; }

    public static Object parse(String text) {
        if (text == null) throw new ParseException("prázdný vstup");
        Json p = new Json(text);
        p.ws();
        Object v = p.value(0);
        p.ws();
        if (p.i != p.s.length()) throw new ParseException("data za koncem JSON na pozici " + p.i);
        return v;
    }

    /** Vrátí true, pokud je text platný JSON objekt. */
    public static boolean isObject(String text) {
        try { return parse(text) instanceof Map; } catch (ParseException | StackOverflowError e) { return false; }
    }

    private void ws() {
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++; else break;
        }
    }

    private Object value(int depth) {
        if (depth > MAX_DEPTH) throw new ParseException("příliš hluboké vnoření");
        if (i >= s.length()) throw new ParseException("neočekávaný konec");
        char c = s.charAt(i);
        switch (c) {
            case '{': return object(depth);
            case '[': return array(depth);
            case '"': return string();
            case 't': lit("true"); return Boolean.TRUE;
            case 'f': lit("false"); return Boolean.FALSE;
            case 'n': lit("null"); return null;
            default:
                if (c == '-' || (c >= '0' && c <= '9')) return number();
                throw new ParseException("neočekávaný znak '" + c + "' na pozici " + i);
        }
    }

    private void lit(String w) {
        if (!s.startsWith(w, i)) throw new ParseException("neplatný literál na pozici " + i);
        i += w.length();
    }

    private Map<String, Object> object(int depth) {
        Map<String, Object> m = new LinkedHashMap<>();
        i++; ws();
        if (i < s.length() && s.charAt(i) == '}') { i++; return m; }
        while (true) {
            ws();
            if (i >= s.length() || s.charAt(i) != '"') throw new ParseException("očekáván název vlastnosti na pozici " + i);
            String k = string();
            ws();
            if (i >= s.length() || s.charAt(i) != ':') throw new ParseException("očekávána ':' na pozici " + i);
            i++; ws();
            m.put(k, value(depth + 1));
            ws();
            if (i >= s.length()) throw new ParseException("neukončený objekt");
            char c = s.charAt(i++);
            if (c == ',') continue;
            if (c == '}') return m;
            throw new ParseException("očekávána ',' nebo '}' na pozici " + (i - 1));
        }
    }

    private List<Object> array(int depth) {
        List<Object> a = new ArrayList<>();
        i++; ws();
        if (i < s.length() && s.charAt(i) == ']') { i++; return a; }
        while (true) {
            ws();
            a.add(value(depth + 1));
            ws();
            if (i >= s.length()) throw new ParseException("neukončené pole");
            char c = s.charAt(i++);
            if (c == ',') continue;
            if (c == ']') return a;
            throw new ParseException("očekávána ',' nebo ']' na pozici " + (i - 1));
        }
    }

    private String string() {
        StringBuilder b = new StringBuilder();
        i++;
        while (true) {
            if (i >= s.length()) throw new ParseException("neukončený řetězec");
            char c = s.charAt(i++);
            if (c == '"') return b.toString();
            if (c < 0x20) throw new ParseException("řídicí znak v řetězci na pozici " + (i - 1));
            if (c != '\\') { b.append(c); continue; }
            if (i >= s.length()) throw new ParseException("neukončená escape sekvence");
            char e = s.charAt(i++);
            switch (e) {
                case '"': b.append('"'); break;
                case '\\': b.append('\\'); break;
                case '/': b.append('/'); break;
                case 'b': b.append('\b'); break;
                case 'f': b.append('\f'); break;
                case 'n': b.append('\n'); break;
                case 'r': b.append('\r'); break;
                case 't': b.append('\t'); break;
                case 'u':
                    if (i + 4 > s.length()) throw new ParseException("neplatná \\u sekvence");
                    int cp = 0;
                    for (int k = 0; k < 4; k++) {
                        int d = Character.digit(s.charAt(i + k), 16);
                        if (d < 0) throw new ParseException("neplatná \\u sekvence");
                        cp = cp * 16 + d;
                    }
                    i += 4;
                    b.append((char) cp);
                    break;
                default: throw new ParseException("neplatná escape sekvence \\" + e);
            }
        }
    }

    private Double number() {
        int st = i;
        if (s.charAt(i) == '-') i++;
        if (i >= s.length()) throw new ParseException("neplatné číslo");
        if (s.charAt(i) == '0') i++;
        else if (s.charAt(i) >= '1' && s.charAt(i) <= '9') { while (i < s.length() && Character.isDigit(s.charAt(i)) && s.charAt(i) < 128) i++; }
        else throw new ParseException("neplatné číslo na pozici " + st);
        if (i < s.length() && s.charAt(i) == '.') {
            i++;
            int d = i;
            while (i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
            if (d == i) throw new ParseException("neplatné číslo na pozici " + st);
        }
        if (i < s.length() && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
            i++;
            if (i < s.length() && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
            int d = i;
            while (i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
            if (d == i) throw new ParseException("neplatné číslo na pozici " + st);
        }
        try { return Double.valueOf(s.substring(st, i)); } catch (NumberFormatException e) { throw new ParseException("neplatné číslo"); }
    }

    // ------------------------------------------------------------------ zápis

    public static String write(Object v) {
        StringBuilder b = new StringBuilder();
        write(b, v);
        return b.toString();
    }

    @SuppressWarnings("unchecked")
    public static void write(StringBuilder b, Object v) {
        if (v == null) b.append("null");
        else if (v instanceof String str) quote(b, str);
        else if (v instanceof Boolean || v instanceof Integer || v instanceof Long) b.append(v);
        else if (v instanceof Number n) {
            double d = n.doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) b.append("null");
            else if (d == Math.rint(d) && Math.abs(d) < 1e15) b.append((long) d);
            else b.append(d);
        } else if (v instanceof Map<?, ?> m) {
            b.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) b.append(',');
                first = false;
                quote(b, String.valueOf(e.getKey()));
                b.append(':');
                write(b, e.getValue());
            }
            b.append('}');
        } else if (v instanceof Iterable<?> it) {
            b.append('[');
            boolean first = true;
            for (Object o : it) {
                if (!first) b.append(',');
                first = false;
                write(b, o);
            }
            b.append(']');
        } else throw new IllegalArgumentException("nelze serializovat " + v.getClass());
    }

    public static void quote(StringBuilder b, String s) {
        b.append('"');
        for (int k = 0; k < s.length(); k++) {
            char c = s.charAt(k);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case '\b': b.append("\\b"); break;
                case '\f': b.append("\\f"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        b.append('"');
    }

    /** Pomocník na sestavení objektu: Json.obj("a", 1, "b", "x"). */
    public static Map<String, Object> obj(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int k = 0; k + 1 < kv.length; k += 2) m.put(String.valueOf(kv[k]), kv[k + 1]);
        return m;
    }
}
