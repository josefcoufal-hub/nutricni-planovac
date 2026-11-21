/* Jídelníček – ukládání dat. Tři režimy: db (artefakt), local (prohlížeč), mem (jen paměť). */
(function (root) {
  'use strict';
  const NT = root.NT;
  const COLLS = ['clients', 'tracks', 'plans', 'foods', 'recipes', 'templates', 'settings'];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const withTimeout = (p, ms, msg) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(msg || 'Vypršel časový limit')), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });

  function memBackend() {
    const data = {};
    COLLS.forEach((c) => { data[c] = {}; });
    return {
      kind: 'mem',
      async load() { return clone(data); },
      async put(c, id, obj) { data[c][id] = clone(obj); },
      async del(c, id) { delete data[c][id]; }
    };
  }

  function localBackend(key) {
    let ls;
    try { ls = root.localStorage; ls.setItem('__t', '1'); ls.removeItem('__t'); } catch (e) { return null; }
    const read = () => {
      try { const o = JSON.parse(ls.getItem(key) || '{}'); COLLS.forEach((c) => { o[c] = o[c] || {}; }); return o; }
      catch (e) { const o = {}; COLLS.forEach((c) => { o[c] = {}; }); return o; }
    };
    return {
      kind: 'local',
      async load() { return read(); },
      async put(c, id, obj) { const o = read(); o[c][id] = obj; ls.setItem(key, JSON.stringify(o)); },
      async del(c, id) { const o = read(); delete o[c][id]; ls.setItem(key, JSON.stringify(o)); }
    };
  }

  /** HTTP volání vlastního serveru (režim „server“). Cookie se posílá automaticky, JavaScript token nevidí. */
  async function apiCall(method, url, body, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 120000);   // Azure SQL se po pauze probouzí až minutu
    let r;
    try {
      r = await root.fetch(url, {
        method, credentials: 'same-origin', cache: 'no-store', signal: ctl.signal,
        headers: Object.assign({ 'X-NT-CSRF': '1', 'Accept': 'application/json' }, method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        body: method === 'GET' ? undefined : JSON.stringify(body === undefined ? {} : body)
      });
    } catch (e) {
      const err = new Error(e && e.name === 'AbortError' ? 'Server neodpověděl včas.' : 'Server je nedostupný, zkontroluj připojení.');
      err.code = 'network'; throw err;
    } finally { clearTimeout(timer); }
    if (r.status === 204) return null;
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) {
      const err = new Error((data && data.message) || ('Chyba serveru (' + r.status + ')'));
      err.status = r.status; err.code = (data && data.error) || 'http_' + r.status; err.data = data;
      err.retryAfter = Number(r.headers.get('Retry-After')) || (data && data.retryAfterSec) || 0;
      throw err;
    }
    return data;
  }

  function apiBackend() {
    // 401 = vypršelé přihlášení: změny zůstanou ve frontě a uloží se po novém přihlášení
    const wrap = async (f) => { try { return await f(); } catch (e) { if (e && e.status === 401) { e.code = 'auth'; e.message = 'Přihlášení vypršelo.'; } throw e; } };
    return {
      kind: 'api',
      async load() {
        const d = await wrap(() => apiCall('GET', '/api/docs'));
        const out = {};
        COLLS.forEach((c) => { out[c] = (d && d[c]) || {}; });
        return out;
      },
      put(c, id, obj) { return wrap(() => apiCall('PUT', '/api/docs/' + c + '/' + encodeURIComponent(id), obj)); },
      del(c, id) { return wrap(() => apiCall('DELETE', '/api/docs/' + c + '/' + encodeURIComponent(id))); }
    };
  }

  function dbBackend(db) {
    return {
      kind: 'db',
      async load() {
        const out = {};
        for (const c of COLLS) {
          const snap = await withTimeout(db.collection(c).get(), 15000, 'Databáze neodpověděla');
          out[c] = {};
          snap.docs.forEach((d) => { if (d.exists) out[c][d.id] = Object.assign({}, d.data(), { id: d.id }); });
        }
        return out;
      },
      async put(c, id, obj) { await withTimeout(db.collection(c).doc(id).set(obj), 20000, 'Uložení trvá příliš dlouho'); },
      async del(c, id) { await withTimeout(db.collection(c).doc(id).delete(), 20000, 'Smazání trvá příliš dlouho'); }
    };
  }

  const Store = {
    backend: null, mode: 'mem', col: {}, pending: new Map(), status: 'saved', lastError: '', listeners: [], timer: null, running: false, rerun: false,

    /** režim „server“: data jsou v databázi za API, uživatel je přihlášen */
    async initApi() {
      COLLS.forEach((c) => { Store.col[c] = new Map(); });
      return Store.attach(apiBackend(), '');
    },

    async attach(backend, reason) {
      Store.backend = backend;
      Store.mode = backend.kind;
      Store.modeReason = reason || '';
      const data = await backend.load();
      COLLS.forEach((c) => { Object.keys(data[c] || {}).forEach((id) => Store.col[c].set(id, Object.assign({}, data[c][id], { id }))); });
      return Store;
    },

    async init(claude) {
      COLLS.forEach((c) => { Store.col[c] = new Map(); });
      let backend = null, reason = '';
      if (claude && typeof claude.use === 'function') {
        try {
          const db = await claude.use('db');
          if (db) backend = dbBackend(db);
          else reason = 'Databáze artefaktu není k dispozici (nepřihlášený pohled nebo omezená oprávnění).';
        } catch (e) { reason = 'Databázi se nepodařilo spustit.'; }
      }
      if (!backend) { backend = localBackend('nutri-planovac-v1'); }
      if (!backend) backend = memBackend();
      return Store.attach(backend, reason);
    },

    get(c, id) { return Store.col[c].get(id); },
    list(c) { return [...Store.col[c].values()]; },

    put(c, obj) {
      if (!obj.id) obj.id = NT.uid(c[0]);
      Store.col[c].set(obj.id, obj);
      Store.queue(c, obj.id, 'put', obj);
      return obj;
    },
    remove(c, id) {
      Store.col[c].delete(id);
      Store.queue(c, id, 'del', null);
    },
    queue(c, id, op, obj) {
      Store.pending.set(c + '/' + id, { c, id, op, snap: op === 'put' ? clone(obj) : null, ver: ++Store.seq });
      Store.setStatus('saving');
      clearTimeout(Store.timer);
      Store.timer = setTimeout(Store.flush, 450);
    },
    seq: 0,

    setStatus(s, err) {
      Store.status = s; Store.lastError = err || '';
      Store.listeners.forEach((f) => { try { f(s, err); } catch (e) { /* ignore */ } });
    },
    onStatus(f) { Store.listeners.push(f); },

    async flush() {
      clearTimeout(Store.timer);
      if (Store.running) { Store.rerun = true; return; }
      Store.running = true;
      try {
        do {
          Store.rerun = false;
          const batch = [...Store.pending.entries()];
          let failed = null;
          let idx = 0;
          const worker = async () => {
            while (idx < batch.length && !failed) {
              const [key, p] = batch[idx++];
              try {
                const doc = p.snap && Object.assign({}, p.snap); if (doc) delete doc.id;
                if (p.op === 'put') await Store.backend.put(p.c, p.id, doc); else await Store.backend.del(p.c, p.id);
                const cur = Store.pending.get(key);
                if (cur && cur.ver === p.ver) Store.pending.delete(key);
              } catch (e) { failed = e; }
            }
          };
          await Promise.all([worker(), worker(), worker()]);
          if (failed) {
            Store.setStatus(failed.code === 'auth' ? 'auth' : 'error', (failed && failed.message) || 'Uložení se nepodařilo');
            Store.running = false;
            return false;
          }
        } while (Store.rerun || Store.pending.size);
      } finally { Store.running = false; }
      Store.setStatus('saved');
      return true;
    },

    /** vymaže všechna data v aktuálním úložišti */
    async wipe() {
      for (const c of COLLS) {
        for (const id of [...Store.col[c].keys()]) { Store.col[c].delete(id); Store.queue(c, id, 'del', null); }
      }
      return Store.flush();
    },

    exportAll() {
      const out = { app: 'nutricni-planovac', version: 1, exportedAt: new Date().toISOString(), data: {} };
      COLLS.forEach((c) => { out.data[c] = Store.list(c); });
      return out;
    },
    /** vrací {counts} nebo vyhodí chybu; mode: 'merge' */
    importAll(obj) {
      if (!obj || obj.app !== 'nutricni-planovac' || !obj.data) throw new Error('Soubor není záloha této aplikace.');
      const counts = {};
      COLLS.forEach((c) => {
        const arr = Array.isArray(obj.data[c]) ? obj.data[c] : [];
        let n = 0;
        arr.forEach((d) => { if (d && typeof d === 'object' && typeof d.id === 'string' && /^[A-Za-z0-9_.~:@+-]{1,200}$/.test(d.id)) { Store.put(c, d); n++; } });
        counts[c] = n;
      });
      return counts;
    }
  };

  NT.Store = Store;
  NT.COLLS = COLLS;
  NT.apiCall = apiCall;
})(typeof window !== 'undefined' ? window : globalThis);
