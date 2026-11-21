'use strict';
const { spawn } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

const API_OUT = path.join(__dirname, '..', '..', 'api', 'out');
const KEY = 'test-internal-key-0123456789abcdef';

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Spustí skutečné Java API s úložištěm v paměti. */
async function startJavaApi(extraEnv = {}) {
  if (!fs.existsSync(path.join(API_OUT, 'cz', 'planovac', 'api', 'Main.class'))) throw new Error('Nejdřív sestavte API: api/build.sh');
  const port = await freePort();
  const env = Object.assign({}, process.env, {
    PORT: String(port), APP_ENV: 'development', STORAGE: 'memory', INTERNAL_API_KEY: KEY,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123456', PBKDF2_ITERATIONS: '2000',
    BOOTSTRAP_ADMIN_USER: 'root', BOOTSTRAP_ADMIN_PASSWORD: 'root-heslo-12345'
  }, extraEnv);
  const child = spawn('java', ['-cp', API_OUT, 'cz.planovac.api.Main'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.on('data', (d) => { stderr += d; });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Java API skončilo: ' + stderr);
    try { const r = await fetch(url + '/api/health'); if (r.ok) return { url, port, stop: () => new Promise((res) => { child.once('exit', res); child.kill('SIGTERM'); }) }; } catch (e) { /* ještě neběží */ }
    await sleep(100);
  }
  child.kill('SIGKILL'); throw new Error('Java API se nespustilo včas');
}

function makeStaticDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-static-'));
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c);
  return dir;
}

/** Spustí webovou vrstvu na volném portu. */
async function startWeb(apiUrl, envExtra = {}, files) {
  const staticDir = makeStaticDir(files || { 'index.html': '<!doctype html><title>t</title>' + 'x'.repeat(3000), 'app.js': 'console.log(1);' });
  const cfg = loadConfig(Object.assign({ PORT: '0', API_URL: apiUrl, INTERNAL_API_KEY: KEY, STATIC_DIR: staticDir, LOG_REQUESTS: 'false' }, envExtra));
  const app = createApp(cfg);
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const port = app.server.address().port;
  return { cfg, port, url: `http://127.0.0.1:${port}`, host: `127.0.0.1:${port}`, cookieName: app.cookieName, stop: () => new Promise((r) => { app.server.close(r); app.server.closeAllConnections(); }) };
}

/** Jednoduchý klient s cookie jar. */
class Client {
  constructor(web) { this.web = web; this.cookie = null; }
  async req(method, p, { body, headers = {}, csrf = true, raw = false } = {}) {
    const h = Object.assign({}, headers);
    if (csrf && method !== 'GET' && method !== 'HEAD') h['X-NT-CSRF'] = '1';
    if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
    if (this.cookie) h['Cookie'] = this.cookie;
    const r = await fetch(this.web.url + p, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), redirect: 'manual' });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of sc) {
      const pair = c.split(';')[0];
      if (/Max-Age=0/i.test(c)) this.cookie = null; else this.cookie = pair;
    }
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) { /* ne JSON */ }
    return { status: r.status, headers: r.headers, setCookie: sc, text, json };
  }
  async login(u, p) { return this.req('POST', '/api/auth/login', { body: { username: u, password: p } }); }
}

module.exports = { startJavaApi, startWeb, Client, freePort, sleep, KEY, http };
