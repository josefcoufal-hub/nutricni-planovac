'use strict';
/*
 * Webová vrstva (BFF):
 *  - servíruje statické soubory aplikace (+ bezpečnostní hlavičky, CSP),
 *  - přihlášení: JWT z Java API drží jen v HttpOnly cookie (JavaScript v prohlížeči k němu nemá přístup),
 *  - proti CSRF: SameSite=Strict + kontrola Origin + povinná vlastní hlavička,
 *  - omezuje počet požadavků na IP, předává klientskou IP a sdílený klíč na API,
 *  - pouze povolené cesty se předávají dál na Java API.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { log, parseCookies, RateLimiter, clientIp, readBody, send } = require('./util');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};

const CSP = [
  "default-src 'none'",
  // PDF export (pdfmake) a import XLSX (SheetJS) se načítají z cdnjs; povolené jsou jen tyto dvě pevné verze, ne celý host
  "script-src 'self' https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.11/ https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/",
  // aplikace používá vložené style="" atributy; skripty to neovlivní
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

function securityHeaders(cfg) {
  const h = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
  if (cfg.hsts) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return h;
}

/** Povolené cesty směrem na Java API. Vše ostatní = 404, ještě než se cokoli předá dál. */
const ID = '[A-Za-z0-9_.~:@+%-]{1,600}';
const ROUTES = [
  { re: /^\/api\/health$/, methods: ['GET'], kind: 'health', auth: false },
  { re: /^\/api\/auth\/login$/, methods: ['POST'], kind: 'login', auth: false, bodyMax: 8192 },
  { re: /^\/api\/auth\/logout$/, methods: ['POST'], kind: 'logout', auth: false },
  { re: /^\/api\/auth\/me$/, methods: ['GET'], kind: 'proxy', auth: true },
  { re: /^\/api\/auth\/password$/, methods: ['POST'], kind: 'password', auth: true, bodyMax: 8192 },
  { re: /^\/api\/auth\/logout-all$/, methods: ['POST'], kind: 'logoutAll', auth: true, bodyMax: 1024 },
  { re: /^\/api\/docs$/, methods: ['GET'], kind: 'proxy', auth: true },
  { re: new RegExp(`^/api/docs/[a-z]{1,20}/${ID}$`), methods: ['PUT', 'DELETE'], kind: 'proxy', auth: true },
  { re: /^\/api\/admin\/users$/, methods: ['GET', 'POST'], kind: 'proxy', auth: true, bodyMax: 8192 },
  { re: new RegExp(`^/api/admin/users/${ID}/(disable|enable|password)$`), methods: ['POST'], kind: 'proxy', auth: true, bodyMax: 8192 }
];

function createApp(cfg) {
  const cookieName = cfg.cookieSecure ? '__Host-nt_session' : 'nt_session';
  const sec = securityHeaders(cfg);
  const loginLimiter = new RateLimiter(cfg.loginLimit, cfg.loginWindowSec * 1000);
  const apiLimiter = new RateLimiter(cfg.apiLimit, 60_000);
  const statics = loadStatics(cfg.staticDir);

  function json(req, res, status, obj, extra) {
    send(req, res, status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, sec, extra), JSON.stringify(obj));
  }
  const err = (req, res, status, code, message, extra) => json(req, res, status, { error: code, message }, extra);

  function sessionCookie(token, expiresAtSec) {
    const maxAge = Math.max(1, Math.min(expiresAtSec - Math.floor(Date.now() / 1000), 7 * 86400));
    return `${cookieName}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${cfg.cookieSecure ? '; Secure' : ''}`;
  }
  function clearCookie() {
    return `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${cfg.cookieSecure ? '; Secure' : ''}`;
  }

  /** Ochrana proti CSRF u metod, které mění stav. */
  function csrfOk(req) {
    if (req.headers['x-nt-csrf'] !== '1') return false;           // vlastní hlavička = cizí web nemůže bez CORS preflightu
    const origin = req.headers['origin'];
    if (origin !== undefined) {
      let o;
      try { o = new URL(origin); } catch (e) { return false; }
      if (cfg.publicOrigin) return origin === cfg.publicOrigin;
      return o.host === req.headers['host'];
    }
    const sfs = req.headers['sec-fetch-site'];
    if (sfs !== undefined && sfs !== 'same-origin' && sfs !== 'none') return false;
    return true;
  }

  async function callApi(method, apiPath, { token, body, ip }) {
    const headers = { 'Accept': 'application/json', 'X-Internal-Key': cfg.internalKey, 'X-Client-IP': ip };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    const r = await fetch(cfg.apiUrl + apiPath, {
      method, headers, body: body === undefined || body === null ? undefined : body,
      signal: AbortSignal.timeout(cfg.apiTimeoutMs), redirect: 'manual'
    });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, buf, retryAfter: r.headers.get('retry-after') };
  }

  function relay(req, res, r, extra) {
    const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, sec, extra);
    if (r.retryAfter) h['Retry-After'] = r.retryAfter;
    send(req, res, r.status, h, r.status === 204 ? '' : r.buf);
  }

  async function handleApi(req, res, pathname, ip, t0) {
    const rl = apiLimiter.hit(ip);
    if (!rl.ok) return err(req, res, 429, 'rate_limited', 'Příliš mnoho požadavků. Zkuste to za chvíli.', { 'Retry-After': String(rl.retryAfterSec) });

    const route = ROUTES.find((r) => r.re.test(pathname));
    if (!route || /%2e|%2f|%5c|\.\./i.test(pathname)) return err(req, res, 404, 'not_found', 'Neexistující adresa.');
    if (!route.methods.includes(req.method)) return err(req, res, 405, 'method_not_allowed', 'Metoda není povolena.', { 'Allow': route.methods.join(', ') });
    if (req.url.includes('?')) return err(req, res, 400, 'bad_request', 'Parametry v adrese nejsou podporované.');

    const unsafe = req.method !== 'GET';
    if (unsafe && !csrfOk(req)) return err(req, res, 403, 'csrf', 'Požadavek byl odmítnut (ochrana proti CSRF).');

    if (route.kind === 'health') {
      try { const r = await callApi('GET', '/api/health', { ip }); return relay(req, res, r); }
      catch (e) { return err(req, res, 502, 'api_unavailable', 'API neodpovídá.'); }
    }
    if (route.kind === 'logout') return json(req, res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });

    const token = parseCookies(req.headers['cookie'])[cookieName];
    if (route.auth && !token) return err(req, res, 401, 'unauthenticated', 'Nejste přihlášeni.', { 'Set-Cookie': clearCookie() });

    let body;
    if (req.method === 'POST' || req.method === 'PUT') {
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      if (!ct.startsWith('application/json')) return err(req, res, 415, 'unsupported_media_type', 'Očekáván application/json.');
      try { body = (await readBody(req, route.bodyMax || cfg.maxBodyBytes)).toString('utf8'); }
      catch (e) {
        if (e.status) return err(req, res, e.status, e.code, e.status === 413 ? 'Požadavek je příliš velký.' : 'Neplatný požadavek.');
        throw e;
      }
    }

    if (route.kind === 'login') {
      const lim = loginLimiter.hit(ip);
      if (!lim.ok) {
        log('warn', 'login_rate_limited', { ip });
        return err(req, res, 429, 'rate_limited', 'Příliš mnoho pokusů o přihlášení. Zkuste to později.', { 'Retry-After': String(lim.retryAfterSec) });
      }
    }

    let r;
    try {
      r = await callApi(req.method, pathname, { token, body, ip });
    } catch (e) {
      const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      log('error', 'api_call_failed', { path: pathname, kind: timeout ? 'timeout' : (e && e.cause && e.cause.code) || 'error' });
      return err(req, res, timeout ? 504 : 502, timeout ? 'api_timeout' : 'api_unavailable', timeout ? 'API neodpovědělo včas.' : 'API je nedostupné.');
    }

    if (r.status === 401 && route.auth) return relay(req, res, r, { 'Set-Cookie': clearCookie() });

    if ((route.kind === 'login' || route.kind === 'password') && r.status === 200) {
      let data;
      try { data = JSON.parse(r.buf.toString('utf8')); } catch (e) { data = null; }
      if (!data || typeof data.token !== 'string' || !Number.isFinite(data.expiresAt)) {
        log('error', 'bad_api_login_response', {});
        return err(req, res, 502, 'bad_gateway', 'Neočekávaná odpověď API.');
      }
      // token se prohlížeči nikdy nevrací v těle, jen v HttpOnly cookie
      return json(req, res, 200, { user: data.user, expiresAt: data.expiresAt }, { 'Set-Cookie': sessionCookie(data.token, data.expiresAt) });
    }
    if (route.kind === 'logoutAll' && r.status === 200) return relay(req, res, r, { 'Set-Cookie': clearCookie() });
    return relay(req, res, r);
  }

  function handleStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return err(req, res, 405, 'method_not_allowed', 'Metoda není povolena.', { 'Allow': 'GET, HEAD' });
    const key = pathname === '/' ? '/index.html' : pathname;
    const f = statics.get(key);
    if (!f) return send(req, res, 404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, sec), 'Nenalezeno');
    const h = Object.assign({ 'Content-Type': f.type, 'ETag': f.etag, 'Cache-Control': 'no-cache', 'Vary': 'Accept-Encoding' }, sec);
    if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, h); return res.end(); }
    const ae = String(req.headers['accept-encoding'] || '');
    let body = f.raw;
    if (f.br && /\bbr\b/.test(ae)) { body = f.br; h['Content-Encoding'] = 'br'; }
    else if (f.gz && /\bgzip\b/.test(ae)) { body = f.gz; h['Content-Encoding'] = 'gzip'; }
    h['Content-Length'] = body.length;
    res.writeHead(200, h);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function handler(req, res) {
    const t0 = process.hrtime.bigint();
    const ip = clientIp(req, cfg.trustProxy);
    const q = req.url.indexOf('?');
    const pathname = q < 0 ? req.url : req.url.slice(0, q);
    res.on('finish', () => {
      if (cfg.logRequests && pathname !== '/healthz') {
        log('info', 'req', { m: req.method, path: pathname.length > 120 ? pathname.slice(0, 120) : pathname, status: res.statusCode, ms: Number((process.hrtime.bigint() - t0) / 1000000n), ip });
      }
    });
    try {
      if (pathname === '/healthz') return json(req, res, 200, { status: 'ok' });
      if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, ip, t0);
      return handleStatic(req, res, pathname);
    } catch (e) {
      log('error', 'unhandled', { path: pathname, msg: String(e && e.message).slice(0, 200) });
      if (!res.headersSent) return err(req, res, 500, 'internal', 'Interní chyba.');
      res.destroy();
    }
  }

  const server = http.createServer(handler);
  server.keepAliveTimeout = 70_000;       // delší než nečinnost na straně Azure ingressu
  server.headersTimeout = 75_000;
  server.requestTimeout = 150_000;
  server.on('clientError', (e, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  return { server, handler, cookieName };
}

function loadStatics(dir) {
  const map = new Map();
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return map; }
  for (const d of names) {
    if (!d.isFile() || d.name.startsWith('.')) continue;
    const ext = path.extname(d.name).toLowerCase();
    if (!MIME[ext]) continue;
    const raw = fs.readFileSync(path.join(dir, d.name));
    const text = /^(text\/|application\/json|image\/svg)/.test(MIME[ext]);
    map.set('/' + d.name, {
      raw, type: MIME[ext],
      etag: '"' + crypto.createHash('sha256').update(raw).digest('base64url').slice(0, 27) + '"',
      gz: text && raw.length > 1024 ? zlib.gzipSync(raw, { level: 9 }) : null,
      br: text && raw.length > 1024 ? zlib.brotliCompressSync(raw) : null
    });
  }
  return map;
}

module.exports = { createApp, CSP };
