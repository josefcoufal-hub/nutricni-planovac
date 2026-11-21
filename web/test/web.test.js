'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { startJavaApi, startWeb, Client, freePort } = require('./helpers');
const { loadConfig } = require('../src/config');
const { RateLimiter, parseCookies, clientIp } = require('../src/util');

let api, web, secureWeb;

/** Syrový požadavek bez normalizace adresy a bez automatické dekomprese. */
function rawGet(w, rawPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: w.port, method: 'GET', path: rawPath, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}

test.before(async () => {
  api = await startJavaApi();
  web = await startWeb(api.url);
  // varianta „jako v produkci“ (Secure cookie, HSTS)
  secureWeb = await startWeb(api.url, { COOKIE_SECURE: 'true', HSTS: 'true' });
});
test.after(async () => { await web.stop(); await secureWeb.stop(); await api.stop(); });

test('konfigurace: v produkci vyžaduje klíč a Secure cookie', () => {
  assert.throws(() => loadConfig({ APP_ENV: 'production' }), /INTERNAL_API_KEY/);
  assert.throws(() => loadConfig({ APP_ENV: 'production', INTERNAL_API_KEY: 'x'.repeat(30), COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  const c = loadConfig({ APP_ENV: 'production', INTERNAL_API_KEY: 'x'.repeat(30), API_URL: 'http://api:8081/' });
  assert.equal(c.cookieSecure, true); assert.equal(c.trustProxy, true); assert.equal(c.apiUrl, 'http://api:8081');
});

test('util: parseCookies, RateLimiter, clientIp', () => {
  assert.deepEqual({ ...parseCookies('a=1; b=2; a=3') }, { a: '1', b: '2' });
  assert.deepEqual({ ...parseCookies(undefined) }, {});
  let now = 0; const rl = new RateLimiter(2, 1000, 10, () => now);
  assert.ok(rl.hit('k').ok); assert.ok(rl.hit('k').ok);
  const d = rl.hit('k'); assert.equal(d.ok, false); assert.equal(d.retryAfterSec, 1);
  assert.ok(rl.hit('jiný').ok);
  now = 1001; assert.ok(rl.hit('k').ok);
  const mk = (xff, ra = '10.0.0.9') => ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: ra } });
  assert.equal(clientIp(mk('1.1.1.1, 2.2.2.2'), true), '2.2.2.2');          // platí poslední (přidala ho naše proxy)
  assert.equal(clientIp(mk('1.1.1.1, 2.2.2.2'), false), '10.0.0.9');        // bez důvěry v proxy se hlavička ignoruje
  assert.equal(clientIp(mk('nesmysl'), true), '10.0.0.9');
  assert.equal(clientIp(mk(null, '::ffff:192.0.2.1'), false), '192.0.2.1');
});

test('statika: hlavičky, komprese, ETag/304, 404, 405', async () => {
  const c = new Client(web);
  const rawRes = await rawGet(web, '/', { 'Accept-Encoding': 'gzip' });
  assert.equal(rawRes.status, 200);
  assert.equal(rawRes.headers['content-encoding'], 'gzip');
  assert.match(zlib.gunzipSync(rawRes.body).toString(), /<title>t<\/title>/);
  assert.equal((await rawGet(web, '/', { 'Accept-Encoding': 'br' })).headers['content-encoding'], 'br');
  assert.equal((await rawGet(web, '/', {})).headers['content-encoding'], undefined);
  const r = await fetch(web.url + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'( https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/[a-z]+\/[0-9.]+\/)+;/); assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
  assert.doesNotMatch(csp, /script-src[^;]*cdnjs\.cloudflare\.com[ ;]/);                  // ne celý host, jen konkrétní cesty
  assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /object-src 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(r.headers.get('strict-transport-security'), null);           // vývojová varianta bez HSTS
  const sr = await fetch(secureWeb.url + '/');
  assert.match(sr.headers.get('strict-transport-security'), /max-age=31536000/);
  const etag = r.headers.get('etag');
  const r304 = await fetch(web.url + '/', { headers: { 'If-None-Match': etag } });
  assert.equal(r304.status, 304);
  assert.equal((await c.req('GET', '/app.js')).status, 200);
  assert.equal((await c.req('GET', '/nic.js')).status, 404);
  assert.equal((await c.req('GET', '/../../etc/passwd')).status, 404);
  assert.equal((await c.req('GET', '/%2e%2e/%2e%2e/etc/passwd')).status, 404);
  assert.equal((await c.req('POST', '/')).status, 405);
  assert.equal((await c.req('GET', '/healthz')).json.status, 'ok');
});

test('přihlášení: špatné heslo 401, úspěch nastaví HttpOnly cookie a token není v těle', async () => {
  const c = new Client(web);
  const bad = await c.login('root', 'spatne-heslo-1');
  assert.equal(bad.status, 401); assert.equal(bad.setCookie.length, 0);
  const ok = await c.login('root', 'root-heslo-12345');
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.username, 'root'); assert.ok(ok.json.expiresAt > Date.now() / 1000);
  assert.equal(ok.json.token, undefined); assert.doesNotMatch(ok.text, /eyJ/);          // žádný JWT v odpovědi
  const sc = ok.setCookie[0];
  assert.match(sc, /^nt_session=eyJ/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Path=\//);
  assert.doesNotMatch(sc, /Secure/);                                                     // vývojová varianta po http
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal((await c.req('GET', '/api/auth/me')).json.user.username, 'root');
});

test('přihlášení v „produkční“ variantě: __Host- cookie se Secure', async () => {
  const c = new Client(secureWeb);
  const ok = await c.login('root', 'root-heslo-12345');
  assert.equal(ok.status, 200);
  const sc = ok.setCookie[0];
  assert.match(sc, /^__Host-nt_session=/); assert.match(sc, /; Secure/); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  assert.doesNotMatch(sc, /Domain=/);
});

test('CSRF: chybějící hlavička, cizí Origin, cross-site Sec-Fetch-Site → 403; shodný Origin projde', async () => {
  const c = new Client(web);
  const body = { username: 'root', password: 'root-heslo-12345' };
  assert.equal((await c.req('POST', '/api/auth/login', { body, csrf: false })).status, 403);
  assert.equal((await c.req('POST', '/api/auth/login', { body, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await c.req('POST', '/api/auth/login', { body, headers: { Origin: 'null' } })).status, 403);
  assert.equal((await c.req('POST', '/api/auth/login', { body, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await c.req('POST', '/api/auth/login', { body, headers: { Origin: 'http://' + web.host, 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
  // změny stavu bez hlavičky nesmí projít ani s platnou cookie
  assert.equal((await c.req('PUT', '/api/docs/clients/c_x', { body: {}, csrf: false })).status, 403);
  assert.equal((await c.req('DELETE', '/api/docs/clients/c_x', { csrf: false })).status, 403);
});

test('CSRF s PUBLIC_ORIGIN: povolen jen přesně tento původ', async () => {
  const w = await startWeb(api.url, { PUBLIC_ORIGIN: 'https://app.example.cz' });
  try {
    const c = new Client(w); const body = { username: 'root', password: 'root-heslo-12345' };
    assert.equal((await c.req('POST', '/api/auth/login', { body, headers: { Origin: 'http://' + w.host } })).status, 403);
    assert.equal((await c.req('POST', '/api/auth/login', { body, headers: { Origin: 'https://app.example.cz' } })).status, 200);
  } finally { await w.stop(); }
});

test('bez cookie 401 hned ve webové vrstvě; falešná nebo poškozená cookie 401 a smaže se', async () => {
  const c = new Client(web);
  const r = await c.req('GET', '/api/docs');
  assert.equal(r.status, 401); assert.equal(r.json.error, 'unauthenticated');
  const f = new Client(web); f.cookie = 'nt_session=eyJhbGciOiJIUzI1NiJ9.e30.podvrh';
  const r2 = await f.req('GET', '/api/docs');
  assert.equal(r2.status, 401); assert.match(r2.setCookie[0], /Max-Age=0/);
});

test('CRUD dokumentů přes web, české znaky, izolace mezi uživateli', async () => {
  const admin = new Client(web); await admin.login('root', 'root-heslo-12345');
  assert.equal((await admin.req('POST', '/api/admin/users', { body: { username: 'bara', password: 'bara-heslo-1234', displayName: 'Bára' } })).status, 201);
  const bara = new Client(web); assert.equal((await bara.login('bara', 'bara-heslo-1234')).status, 200);

  assert.equal((await admin.req('PUT', '/api/docs/clients/c_1', { body: { name: 'Jana Nováková', poznámka: 'žluťoučký kůň' } })).status, 200);
  const all = (await admin.req('GET', '/api/docs')).json;
  assert.equal(all.clients.c_1.name, 'Jana Nováková'); assert.equal(all.clients.c_1['poznámka'], 'žluťoučký kůň');
  assert.equal(Object.keys((await bara.req('GET', '/api/docs')).json.clients).length, 0);     // Bára nevidí cizí data
  assert.equal((await admin.req('DELETE', '/api/docs/clients/c_1')).status, 204);
  assert.equal(Object.keys((await admin.req('GET', '/api/docs')).json.clients).length, 0);
  // běžný uživatel nesmí do administrace
  assert.equal((await bara.req('GET', '/api/admin/users')).status, 403);
});

test('neplatné cesty, metody, parametry, typ a velikost', async () => {
  const c = new Client(web); await c.login('root', 'root-heslo-12345');
  assert.equal((await c.req('GET', '/api/neco')).status, 404);
  assert.equal((await rawGet(web, '/api/docs/clients/x/../../auth/me', { Cookie: c.cookie })).status, 404);
  assert.equal((await rawGet(web, '/../../etc/passwd')).status, 404);
  assert.equal((await rawGet(web, '/api/docs/clients/%2e%2e', { Cookie: c.cookie })).status, 404);
  assert.equal((await c.req('PUT', '/api/docs/clients/..%2F..%2Fx', { body: {} })).status, 404);
  assert.equal((await c.req('PUT', '/api/docs/clients/a%2eb', { body: {} })).status, 404);
  assert.equal((await c.req('GET', '/api/docs?x=1')).status, 400);
  assert.equal((await c.req('PATCH', '/api/docs/clients/x', { body: {} })).status, 405);
  assert.equal((await c.req('POST', '/api/docs')).status, 405);
  assert.equal((await c.req('PUT', '/api/docs/clients/c_2', { body: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await c.req('PUT', '/api/docs/nekolekce/c_2', { body: {} })).status, 404);     // odmítne už Java
  const big = await c.req('PUT', '/api/docs/clients/c_big', { body: JSON.stringify({ a: 'x'.repeat(1_200_000) }) });
  assert.equal(big.status, 413);
  const big2 = await c.req('POST', '/api/auth/login', { body: JSON.stringify({ username: 'a', password: 'x'.repeat(20000) }) });
  assert.equal(big2.status, 413);
});

test('odhlášení smaže cookie; logout-all zneplatní všechny relace', async () => {
  const a = new Client(web), b = new Client(web);
  await a.login('root', 'root-heslo-12345'); await b.login('root', 'root-heslo-12345');
  const lo = await a.req('POST', '/api/auth/logout');
  assert.equal(lo.status, 200); assert.match(lo.setCookie[0], /Max-Age=0/);
  assert.equal((await a.req('GET', '/api/auth/me')).status, 401);
  const c = new Client(web); await c.login('root', 'root-heslo-12345');
  assert.equal((await c.req('POST', '/api/auth/logout-all', { body: {} })).status, 200);
  assert.equal((await b.req('GET', '/api/auth/me')).status, 401);                            // jiné zařízení je odhlášené
  assert.equal((await c.req('GET', '/api/auth/me')).status, 401);
});

test('změna hesla vydá novou cookie, stará relace přestane platit', async () => {
  const admin = new Client(web); await admin.login('root', 'root-heslo-12345');
  await admin.req('POST', '/api/admin/users', { body: { username: 'cyril', password: 'cyril-heslo-1234' } });
  const a = new Client(web), old = new Client(web);
  await a.login('cyril', 'cyril-heslo-1234'); await old.login('cyril', 'cyril-heslo-1234');
  assert.equal((await a.req('POST', '/api/auth/password', { body: { current: 'spatne-heslo-1', next: 'nove-heslo-98765' } })).status, 400);
  const ch = await a.req('POST', '/api/auth/password', { body: { current: 'cyril-heslo-1234', next: 'nove-heslo-98765' } });
  assert.equal(ch.status, 200); assert.equal(ch.json.token, undefined); assert.match(ch.setCookie[0], /^nt_session=eyJ/);
  assert.equal((await a.req('GET', '/api/auth/me')).status, 200);
  assert.equal((await old.req('GET', '/api/auth/me')).status, 401);
});

test('limit pokusů o přihlášení na IP → 429 s Retry-After', async () => {
  const w = await startWeb(api.url, { LOGIN_RATE_LIMIT: '3' });
  try {
    const c = new Client(w); const st = [];
    for (let i = 0; i < 4; i++) st.push((await c.login('nikdo' + i, 'spatne-heslo-1')).status);
    assert.deepEqual(st, [401, 401, 401, 429]);
    const r = await c.login('root', 'root-heslo-12345');
    assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0);
  } finally { await w.stop(); }
});

test('obecný limit požadavků na IP', async () => {
  const w = await startWeb(api.url, { API_RATE_LIMIT: '5' });
  try {
    const c = new Client(w); const st = [];
    for (let i = 0; i < 7; i++) st.push((await c.req('GET', '/api/health')).status);
    assert.deepEqual(st, [200, 200, 200, 200, 200, 429, 429]);
  } finally { await w.stop(); }
});

test('zámek účtu v API se projeví jako 429 s Retry-After', async () => {
  const w = await startWeb(api.url, { LOGIN_RATE_LIMIT: '1000' });
  try {
    const admin = new Client(w); await admin.login('root', 'root-heslo-12345');
    await admin.req('POST', '/api/admin/users', { body: { username: 'zamek', password: 'zamek-heslo-1234' } });
    const c = new Client(w); let last;
    for (let i = 0; i < 5; i++) last = await c.login('zamek', 'zle-heslo-12345');
    assert.equal(last.status, 429); assert.ok(Number(last.headers.get('retry-after')) > 0);
    assert.equal((await c.login('zamek', 'zamek-heslo-1234')).status, 429);
  } finally { await w.stop(); }
});

test('API bez správného sdíleného klíče odmítne web (a obráceně přímý přístup obejde web jen s klíčem)', async () => {
  const bad = await startWeb(api.url, { INTERNAL_API_KEY: 'jiny-klic-jiny-klic-jiny-klic-123' });
  try {
    const c = new Client(bad);
    assert.equal((await c.login('root', 'root-heslo-12345')).status, 403);
  } finally { await bad.stop(); }
});

test('API nedostupné → 502; API pomalé → 504', async () => {
  const dead = await startWeb(`http://127.0.0.1:${await freePort()}`);
  try {
    const c = new Client(dead);
    const r = await c.login('root', 'x'); assert.equal(r.status, 502); assert.equal(r.json.error, 'api_unavailable');
    assert.equal((await c.req('GET', '/api/health')).status, 502);
    assert.equal((await c.req('GET', '/healthz')).status, 200);                              // sonda živosti nesmí záviset na API
  } finally { await dead.stop(); }
  const slow = http.createServer(() => { /* nikdy neodpoví */ });
  await new Promise((r) => slow.listen(0, '127.0.0.1', r));
  const w = await startWeb(`http://127.0.0.1:${slow.address().port}`, { UPSTREAM_TIMEOUT_MS: '1000' });
  try {
    const t0 = Date.now(); const r = await new Client(w).login('root', 'x');
    assert.equal(r.status, 504); assert.ok(Date.now() - t0 < 5000);
  } finally { await w.stop(); slow.closeAllConnections(); slow.close(); }
});

test('odpověď API bez tokenu při přihlášení se nepovažuje za úspěch', async () => {
  const fake = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"user":{}}'); });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const w = await startWeb(`http://127.0.0.1:${fake.address().port}`);
  try {
    const r = await new Client(w).login('root', 'x'); assert.equal(r.status, 502); assert.equal(r.setCookie.length, 0);
  } finally { await w.stop(); fake.closeAllConnections(); fake.close(); }
});

test('web předává API klientskou IP a sdílený klíč (za proxy poslední prvek X-Forwarded-For)', async () => {
  let seen = null;
  const fake = http.createServer((req, res) => { seen = { ip: req.headers['x-client-ip'], key: req.headers['x-internal-key'], auth: req.headers['authorization'], cookie: req.headers['cookie'], csrf: req.headers['x-nt-csrf'] }; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"user":{"username":"u"}}'); });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const w = await startWeb(`http://127.0.0.1:${fake.address().port}`, { TRUST_PROXY: 'true' });
  try {
    const c = new Client(w); c.cookie = 'nt_session=abc.def.ghi';
    const r = await c.req('GET', '/api/auth/me', { headers: { 'X-Forwarded-For': '6.6.6.6, 203.0.113.5' } });
    assert.equal(r.status, 200);
    assert.equal(seen.ip, '203.0.113.5'); assert.equal(seen.key, 'test-internal-key-0123456789abcdef');
    assert.equal(seen.auth, 'Bearer abc.def.ghi');
    assert.equal(seen.cookie, undefined);                                                    // cookie se na API nepřeposílá
  } finally { await w.stop(); fake.closeAllConnections(); fake.close(); }
});
