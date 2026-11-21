'use strict';
/* Konfigurace výhradně z proměnných prostředí. V produkci se chybějící tajemství nepřipustí. */

function int(env, name, def, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} musí být celé číslo ${min}–${max}`);
  return n;
}
function bool(env, name, def) {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  if (/^(1|true|yes|ano)$/i.test(raw)) return true;
  if (/^(0|false|no|ne)$/i.test(raw)) return false;
  throw new Error(`${name} musí být true/false`);
}

function loadConfig(env = process.env) {
  const production = (env.APP_ENV || 'development').toLowerCase() === 'production';
  const cfg = {
    production,
    port: int(env, 'PORT', 8080, 0, 65535),
    apiUrl: (env.API_URL || 'http://127.0.0.1:8081').replace(/\/+$/, ''),
    internalKey: env.INTERNAL_API_KEY || '',
    staticDir: env.STATIC_DIR || require('node:path').join(__dirname, '..', 'public'),
    // Za Azure Container Apps (Envoy) je spojení k nám vždy přes proxy, TLS končí na ní.
    trustProxy: bool(env, 'TRUST_PROXY', production),
    cookieSecure: bool(env, 'COOKIE_SECURE', production),
    hsts: bool(env, 'HSTS', production),
    // Azure SQL serverless se probouzí až ~1 minutu; časový limit musí být delší.
    apiTimeoutMs: int(env, 'UPSTREAM_TIMEOUT_MS', 110000, 1000, 600000),
    maxBodyBytes: int(env, 'MAX_BODY_BYTES', 1_100_000, 1024, 20_000_000),
    loginLimit: int(env, 'LOGIN_RATE_LIMIT', 20, 1, 100000),          // pokusů na IP
    loginWindowSec: int(env, 'LOGIN_RATE_WINDOW_SEC', 900, 1, 86400),
    apiLimit: int(env, 'API_RATE_LIMIT', 600, 1, 1000000),            // požadavků na IP za minutu
    publicOrigin: env.PUBLIC_ORIGIN || '',                             // volitelně přesná povolená Origin, např. https://app.example.cz
    logRequests: bool(env, 'LOG_REQUESTS', true)
  };
  if (production) {
    if (cfg.internalKey.length < 24) throw new Error('V produkci je nutné INTERNAL_API_KEY (min. 24 znaků), shodné s API.');
    if (!cfg.cookieSecure) throw new Error('V produkci musí být COOKIE_SECURE=true.');
    if (!/^https?:\/\//.test(cfg.apiUrl)) throw new Error('API_URL musí začínat http:// nebo https://');
  }
  return cfg;
}

module.exports = { loadConfig };
