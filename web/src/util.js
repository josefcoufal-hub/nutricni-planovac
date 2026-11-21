'use strict';
const net = require('node:net');
const zlib = require('node:zlib');

/** JSON log na jeden řádek; nikdy se nelogují cookies, těla ani hesla. */
function log(level, event, fields) {
  process.stdout.write(JSON.stringify(Object.assign({ ts: new Date().toISOString(), level, event }, fields)) + '\n');
}

function parseCookies(header) {
  const out = Object.create(null);
  if (!header || typeof header !== 'string' || header.length > 8192) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!(k in out)) out[k] = v;
  }
  return out;
}

/** Fixní okno na klíč (IP). Paměť je omezená – při přetečení se stará okna zahodí. */
class RateLimiter {
  constructor(limit, windowMs, maxKeys = 50000, clock = Date.now) {
    this.limit = limit; this.windowMs = windowMs; this.maxKeys = maxKeys; this.clock = clock;
    this.map = new Map();
  }
  /** vrací {ok, retryAfterSec} */
  hit(key) {
    const now = this.clock();
    let e = this.map.get(key);
    if (!e || e.reset <= now) {
      if (this.map.size >= this.maxKeys) this.sweep(now);
      if (this.map.size >= this.maxKeys) this.map.clear();
      e = { n: 0, reset: now + this.windowMs };
      this.map.set(key, e);
    }
    e.n++;
    if (e.n > this.limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((e.reset - now) / 1000)) };
    return { ok: true, retryAfterSec: 0 };
  }
  sweep(now = this.clock()) { for (const [k, e] of this.map) if (e.reset <= now) this.map.delete(k); }
}

/** IP klienta. Za důvěryhodnou proxy je platný POSLEDNÍ prvek X-Forwarded-For (přidává ho naše proxy, zbytek může podvrhnout klient). */
function clientIp(req, trustProxy) {
  let ip = req.socket.remoteAddress || '';
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) {
      const last = xff.split(',').pop().trim();
      if (net.isIP(last)) ip = last;
    }
  }
  ip = ip.replace(/^::ffff:/, '');
  return net.isIP(ip) ? ip : 'unknown';
}

/** Načte tělo požadavku s limitem velikosti; vyhodí {status, code}. */
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const cl = req.headers['content-length'];
    if (cl !== undefined) {
      const n = Number(cl);
      if (!Number.isInteger(n) || n < 0) return reject(Object.assign(new Error('bad length'), { status: 400, code: 'bad_request' }));
      if (n > max) { req.resume(); return reject(Object.assign(new Error('too large'), { status: 413, code: 'too_large' })); }
    }
    const chunks = []; let size = 0; let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > max) { done = true; req.pause(); reject(Object.assign(new Error('too large'), { status: 413, code: 'too_large' })); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
    req.on('aborted', () => { if (!done) { done = true; reject(Object.assign(new Error('aborted'), { status: 400, code: 'aborted' })); } });
  });
}

/** Odešle (volitelně komprimovanou) odpověď. */
function send(req, res, status, headers, body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body == null ? '' : String(body), 'utf8');
  const h = Object.assign({}, headers);
  const ae = String(req.headers['accept-encoding'] || '');
  const compressible = /^(text\/|application\/(json|javascript))/.test(String(h['Content-Type'] || ''));
  let out = buf;
  if (compressible && buf.length > 1024 && status !== 204 && status !== 304) {
    if (/\bbr\b/.test(ae)) { out = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }); h['Content-Encoding'] = 'br'; }
    else if (/\bgzip\b/.test(ae)) { out = zlib.gzipSync(buf); h['Content-Encoding'] = 'gzip'; }
    if (h['Content-Encoding']) h['Vary'] = 'Accept-Encoding';
  }
  h['Content-Length'] = out.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : out);
}

module.exports = { log, parseCookies, RateLimiter, clientIp, readBody, send };
