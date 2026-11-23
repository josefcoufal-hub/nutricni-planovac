/* Jídelníček – aplikace, část 1: základ, shell, modální okna, AI obal, přehled, klienti, potřeby. */
(function (root) {
  'use strict';
  const NT = root.NT;
  const Store = NT.Store;
  const esc = NT.esc;
  const fmt = NT.fmt;
  const App = (NT.App = {
    S: {
      ready: false, loadError: '', route: { page: 'dashboard' }, modals: [], sample: null, downloads: null,
      ui: { dashStage: '', dashAll: false, clientQ: '', showArchived: false, foodQ: '', foodCat: '', foodFilter: '', foodLimit: 80, recipeQ: '', recipeTag: '', tplKind: '', planTab: 'editor', dayIdx: 0, clientTab: 'profile', shopMult: 1, shopChecked: {}, hoSel: null },
      cat: null
    },
    A: {}, views: {}, modals: {}, hooks: []
  });
  const S = App.S;
  const $ = (sel, r) => (r || document).querySelector(sel);
  const $$ = (sel, r) => Array.from((r || document).querySelectorAll(sel));
  App.$ = $; App.$$ = $$;

  // ------------------------------------------------------------ ikony
  const P = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.4-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8"/><path d="M18.5 14.8c1.7.7 2.8 2.3 3 4.7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>',
    food: '<path d="M12 7c-2-2-6-1.5-7 2s.5 8 3 10 3 1 4 1 1.5 1 4-1 4-6.5 3-10-5-4-7-2z"/><path d="M12 7c0-2 1-4 3-5"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5z"/><path d="M4 21.5V4.5"/><path d="M9 7h7"/>',
    layers: '<path d="M12 2l9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    down: '<path d="M5 9l7 7 7-7"/>',
    up: '<path d="M5 15l7-7 7 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    swap: '<path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/>',
    download: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    upload: '<path d="M12 16V5"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>',
    file: '<path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 15l4-5 3 3 4-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11l2-8H6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    wand: '<path d="M5 19L17 7"/><path d="M15 5l4 4"/><path d="M5 5v3M3.5 6.5h3M19 15v3M17.5 16.5h3"/>',
    scale: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10a5 5 0 018 0"/><path d="M12 10l2-2"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6v.01M4 12v.01M4 18v.01"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
    save: '<path d="M5 3h12l3 3v15H5z"/><path d="M8 3v6h8V3"/><path d="M8 21v-7h8v7"/>',
    refresh: '<path d="M20 11a8 8 0 00-14-4L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0014 4l2-2"/><path d="M20 20v-5h-5"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
    'l-dash': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    'l-users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'l-apple': '<path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/>',
    'l-chef': '<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/>',
    'l-layers': '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    'l-settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    'l-userplus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
    'l-leaf': '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    'l-sunrise': '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
    'l-soup': '<path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M7 21h10"/><path d="M19.5 12 22 6"/><path d="M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62"/><path d="M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62"/><path d="M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62"/>',
    'l-bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'
  };
  const ic = (n, cls) => '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>';
  App.ic = ic;

  const stIcon = (s) => (s === 'ok' ? ic('check', 'ico-sm') : s === 'warn' ? ic('alert', 'ico-sm') : ic('x', 'ico-sm'));
  const stText = (s, dir, limit) => {
    if (s === 'ok') return limit ? 'v limitu' : 'v cíli';
    if (limit) return 'nad limitem';
    return dir === 'under' ? 'málo' : 'moc';
  };
  App.stIcon = stIcon; App.stText = stText;

  // ------------------------------------------------------------ pomocné
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase() || '?';
  App.initials = initials;
  const dateCs = (s) => NT.fmtDate(s);
  App.dateCs = dateCs;
  const plural = NT.plural;

  App.toast = function (msg, opts) {
    opts = opts || {};
    let host = $('#toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (opts.kind === 'bad' ? ' bad' : '');
    el.setAttribute('role', opts.kind === 'bad' ? 'alert' : 'status');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (opts.action ? '<button type="button">' + esc(opts.action.label) + '</button>' : '');
    if (opts.action) el.querySelector('button').onclick = () => { opts.action.fn(); el.remove(); };
    host.appendChild(el);
    setTimeout(() => el.remove(), opts.ms || (opts.kind === 'bad' ? 7000 : 3200));
  };

  App.copy = async function (text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      App.toast(okMsg || 'Zkopírováno do schránky');
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (ok) { App.toast(okMsg || 'Zkopírováno do schránky'); return true; }
      } catch (e2) { /* ignore */ }
      App.openModal({ type: 'text', title: 'Zkopíruj ručně', text });
      return false;
    }
  };

  App.saveFile = async function (filename, data) {
    const dl = S.downloads;
    if (dl) {
      try {
        const r = await dl.save({ filename, data });
        App.toast(r && r.status === 'delivered' ? 'Soubor odeslán' : 'Soubor uložen: ' + filename);
        return true;
      } catch (e) {
        if (e && e.code === 'declined') return false;
        App.toast('Soubor se nepodařilo uložit' + (e && e.message ? ' (' + e.message + ')' : ''), { kind: 'bad' });
        return false;
      }
    }
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      App.toast('Soubor stažen: ' + filename);
      return true;
    } catch (e) { App.toast('Stažení se nepodařilo', { kind: 'bad' }); return false; }
  };

  App.loadScript = function (src) {
    App._scripts = App._scripts || {};
    if (App._scripts[src]) return App._scripts[src];
    App._scripts[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => { delete App._scripts[src]; rej(new Error('Knihovnu se nepodařilo načíst')); };
      document.head.appendChild(s);
    });
    return App._scripts[src];
  };

  // ------------------------------------------------------------ katalog (základ + vlastní)
  App.rebuildCatalog = function () {
    const overlay = (base, coll) => {
      const m = new Map();
      base.forEach((x) => m.set(x.id, x));
      Store.list(coll).forEach((x) => m.set(x.id, x));
      return [...m.values()];
    };
    const allFoods = overlay(NT.BASE_FOODS, 'foods');
    const allRecipes = overlay(NT.STARTER_RECIPES, 'recipes');
    const allTemplates = overlay(S.starterTemplates || (S.starterTemplates = NT.starterTemplates()), 'templates');
    S.cat = {
      allFoods, foods: allFoods.filter((f) => !f.hidden), allRecipes, recipes: allRecipes.filter((r) => !r.hidden),
      templates: allTemplates.filter((t) => !t.hidden), ctx: NT.makeCtx(allFoods, allRecipes)
    };
    // běžné potraviny pro návrhy a náhrady (NutriDatabáze se v nich neobjevuje, hledat v ní jde ve výběru potravin)
    S.cat.common = S.cat.foods.filter(NT.isCommonFood);
    S.foodIssues = new Map();
    S.cat.allFoods.forEach((f) => { if (!f.hidden) S.foodIssues.set(f.id, NT.foodSeverity(NT.validateFood(f))); });
  };
  App.ctx = () => S.cat.ctx;
  const BASE_IDS = new Set(NT.BASE_FOODS.map((b) => b.id));
  App.isBaseFood = (f) => BASE_IDS.has(f.id);

  // ------------------------------------------------------------ data klienta
  App.clients = (archived) => Store.list('clients').filter((c) => !!c.archived === !!archived).sort((a, b) => NT.norm(a.name).localeCompare(NT.norm(b.name), 'cs'));
  App.track = (cid) => Store.get('tracks', cid) || { id: cid, clientId: cid, measures: [], diary: [] };
  App.saveTrack = (t) => { Store.put('tracks', t); };
  App.plansOf = (cid) => Store.list('plans').filter((p) => p.clientId === cid).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  App.current = function (cid) {
    const ms = NT.sortedMeasures(App.track(cid).measures);
    let weight = null, bf = null, wDate = null;
    for (let i = ms.length - 1; i >= 0; i--) {
      if (weight == null && ms[i].weightKg > 0) { weight = ms[i].weightKg; wDate = ms[i].date; }
      if (bf == null && ms[i].bf > 0) bf = ms[i].bf;
      if (weight != null && bf != null) break;
    }
    return { weight, bf, date: wDate, count: ms.length };
  };
  App.needsOf = function (client) {
    const cur = App.current(client.id);
    return NT.computeNeeds(client, { weight: cur.weight, bf: cur.bf });
  };
  App.touchPlan = function (plan) { plan.updatedAt = new Date().toISOString(); Store.put('plans', plan); };

  App.upsertMeasure = function (cid, patch) {
    const t = App.track(cid);
    t.measures = t.measures || [];
    const date = patch.date || NT.today();
    let m = t.measures.find((x) => x.date === date);
    if (!m) { m = { id: NT.uid('m'), date }; t.measures.push(m); }
    Object.keys(patch).forEach((k) => { if (k !== 'date') { if (patch[k] === null || patch[k] === '' || patch[k] === undefined) delete m[k]; else m[k] = patch[k]; } });
    t.measures = NT.sortedMeasures(t.measures);
    App.saveTrack(t);
    return m;
  };

  // ------------------------------------------------------------ AI obal
  const AI_MSG = {
    not_granted: 'Použití Claude jsi nepovolil/a. Povolení můžeš změnit v nabídce oprávnění u této stránky.',
    rate_limited: 'Příliš mnoho dotazů nebo vyčerpaný limit. Zkus to později.',
    session_expired: 'Platnost přihlášení vypršela, přihlas se znovu.',
    invalid_json: 'Odpověď AI nešla zpracovat. Zkus to znovu nebo zadání upřesni.',
    refused: 'AI toto zadání odmítla. Uprav zadání.',
    empty_completion: 'AI nevrátila žádný text. Zkus zadání zjednodušit.',
    upstream_error: 'Služba AI je dočasně nedostupná. Zkus to znovu za chvíli.',
    prompt_too_large: 'Zadání je příliš dlouhé.',
    sampling_disabled: 'AI není pro tento účet dostupná.',
    cancelled: ''
  };
  App.aiAvailable = () => !!S.sample;
  App.aiErr = (e) => {
    const code = (e && (e.name === 'AbortError' || e.code === 'aborted' || e.code === 'abort')) ? 'cancelled' : ((e && e.code) || 'upstream_error');
    return { code, message: AI_MSG[code] != null ? AI_MSG[code] : 'AI se nepodařilo zavolat (' + (e && e.message ? e.message : code) + ').' };
  };
  App.aiCall = async function (kind, prompt, opts) {
    if (!S.sample) throw { code: 'sampling_disabled', message: 'AI není k dispozici' };
    const o = Object.assign({ modelTier: 'default', cache: false }, opts || {});
    try {
      if (kind === 'json') return await S.sample.json(prompt, o);
      const r = await S.sample(prompt, o);
      return r.text;
    } catch (e) { throw App.aiErr(e); }
  };
  App.aiBusy = null; // {ctl, label}

  // ------------------------------------------------------------ modální okna
  App.openModal = function (m) { S.modals.push(m); App.renderModal(); return m; };
  App.closeModal = function (m) {
    if (m) { const i = S.modals.indexOf(m); if (i >= 0) S.modals.splice(i, 1); } else S.modals.pop();
    App.renderModal();
  };
  App.closeAll = function () { S.modals.length = 0; App.renderModal(); };
  App.confirm = function (o) {
    return new Promise((resolve) => {
      App.openModal({ type: 'confirm', title: o.title || 'Opravdu?', text: o.text || '', ok: o.ok || 'Potvrdit', danger: !!o.danger, resolve });
    });
  };
  App.renderModal = function () {
    const host = $('#modal');
    if (!host) return;
    const m = S.modals[S.modals.length - 1];
    const prevFocus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fid : null;
    if (!m) {
      host.innerHTML = '';
      document.body.style.overflow = '';
      if (App._lastFocus && document.contains(App._lastFocus)) { try { App._lastFocus.focus(); } catch (e) { /* ignore */ } }
      App._lastFocus = null;
      return;
    }
    if (!host.firstChild) App._lastFocus = document.activeElement;
    const def = App.modals[m.type];
    if (!def) { host.innerHTML = ''; return; }
    const r = def(m);
    host.innerHTML = '<div class="scrim" data-act="scrim"><div class="modal ' + (r.size || '') + '" role="dialog" aria-modal="true" aria-labelledby="mtitle" data-modal-body>' +
      '<div class="modal-h"><h2 id="mtitle">' + esc(r.title) + '</h2><button class="btn btn-ghost btn-icon" type="button" data-act="modal-close" aria-label="Zavřít">' + ic('x') + '</button></div>' +
      '<div class="modal-b" id="modal-b">' + r.body + '</div>' + (r.footer ? '<div class="modal-f">' + r.footer + '</div>' : '') + '</div></div>';
    document.body.style.overflow = 'hidden';
    if (prevFocus) { const el = host.querySelector('[data-fid="' + prevFocus + '"]'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* ignore */ } } }
    else if (r.focus) { const el = host.querySelector(r.focus); if (el) el.focus(); }
    else { const b = host.querySelector('.modal-b'); if (b) { b.setAttribute('tabindex', '-1'); b.focus({ preventScroll: true }); } }
  };

  App.modals.confirm = (m) => ({
    title: m.title, size: '',
    body: '<p>' + esc(m.text).replace(/\n/g, '<br>') + '</p>',
    footer: '<button class="btn" type="button" data-act="confirm-no">Zrušit</button><button class="btn ' + (m.danger ? 'btn-solid-danger' : 'btn-primary') + '" type="button" data-act="confirm-yes" data-fid="cy">' + esc(m.ok) + '</button>',
    focus: '[data-act="confirm-yes"]'
  });
  App.modals.text = (m) => ({
    title: m.title, body: '<p class="muted sm" style="margin-bottom:8px">Schránka není v tomto zobrazení dostupná. Text označ a zkopíruj ručně (Ctrl+C).</p><textarea readonly rows="14" id="textcopy" style="min-height:240px">' + esc(m.text) + '</textarea>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zavřít</button>', focus: '#textcopy'
  });
  App.modals.info = (m) => ({ title: m.title, body: m.html, footer: '<button class="btn btn-primary" type="button" data-act="modal-close">Rozumím</button>', size: m.size || '' });

  // ------------------------------------------------------------ router / shell
  const NAV = [
    ['dashboard', 'Přehled', 'l-dash', '#3FD0B5'], ['clients', 'Klienti', 'l-users', '#FFB27A'], ['foods', 'Potraviny', 'l-apple', '#6EE7B7'],
    ['recipes', 'Recepty', 'l-chef', '#FF9BC4'], ['templates', 'Šablony', 'l-layers', '#A5B4FC'], ['settings', 'Nastavení', 'l-settings', '#9FB5B3']
  ];
  const HASH = { dashboard: 'prehled', clients: 'klienti', foods: 'potraviny', recipes: 'recepty', templates: 'sablony', settings: 'nastaveni' };
  const HASH_REV = Object.fromEntries(Object.entries(HASH).map(([k, v]) => [v, k]));
  const sectionOf = (page) => (page === 'client' || page === 'plan' ? 'clients' : page);

  App.go = function (page, params, keepScroll) {
    S.route = Object.assign({ page }, params || {});
    if (page === 'plan') S.ui.planTab = S.route.tab || 'editor';
    if (page === 'client' && S.route.tab) S.ui.clientTab = S.route.tab;
    if (HASH[page]) { try { if (location.hash !== '#' + HASH[page]) history.replaceState(null, '', '#' + HASH[page]); } catch (e) { /* ignore */ } }
    App.render(keepScroll);
    if (!keepScroll) window.scrollTo(0, 0);
  };

  App.saveLabel = (st) => st === 'saving' ? 'Ukládám…' : st === 'error' ? 'Uložení se nezdařilo' : st === 'auth' ? 'Vyžaduje přihlášení' : 'Vše uloženo';
  App.statusHtml = function () {
    const st = Store.status;
    const lab = App.saveLabel(st);
    const where = Store.mode === 'api' ? 'na serveru, v databázi aplikace' : Store.mode === 'db' ? 'v databázi artefaktu' : Store.mode === 'local' ? 'jen v tomto prohlížeči' : 'jen v paměti, po zavření zmizí';
    return '<div class="save-state" id="savestate" aria-live="polite"><span class="dot ' + st + '"></span><span><b>' + lab + '</b><br>' + esc(where) +
      (st === 'error' ? '<br><button class="btn btn-sm" style="margin-top:6px" type="button" data-act="retry-save">Zkusit znovu</button>' : '') + '</span></div>';
  };
  App.refreshStatus = function () {
    const el = $('#savestate');
    if (el) el.outerHTML = App.statusHtml();
    const tb = $('#topstatus');
    if (tb) tb.innerHTML = '<span class="dot ' + Store.status + '" style="margin:0"></span>';
  };

  App.alertsOf = function (c, all) {
    let list;
    try { list = App.clientCtx(c).agenda || []; } catch (e) { list = App.clientIssues(c); }
    return all ? list : list.filter((i) => i.level !== 'info');
  };
  App.attentionCount = function () {
    try {
      return App.clients(false).filter((c) => App.alertsOf(c).length).length;
    } catch (e) { return 0; }
  };
  App.shell = function (content) {
    const sec = sectionOf(S.route.page);
    const att = App.attentionCount();
    const nav = NAV.map(([k, l, i, col]) => '<button class="nav-item" type="button" data-act="nav" data-page="' + k + '" style="--sc:' + col + '"' + (sec === k ? ' aria-current="page"' : '') + '><span class="nav-ic">' + ic(i) + '</span><span class="nl">' + l + '</span>' +
      (k === 'clients' && att ? '<span class="nav-badge" title="Klienti s upozorněním">' + att + '</span>' : '') + '</button>').join('');
    const bn = [['dashboard', 'Přehled', 'l-dash'], ['clients', 'Klienti', 'l-users'], ['foods', 'Potraviny', 'l-apple'], ['recipes', 'Recepty', 'l-chef'], ['settings', 'Další', 'l-settings']]
      .map(([k, l, i]) => '<button class="bn" type="button" data-act="nav" data-page="' + k + '"' + ((sec === k || (k === 'settings' && sec === 'templates')) ? ' aria-current="page"' : '') + '>' + ic(i, 'ico-lg') + '<span>' + l + '</span></button>').join('');
    const au = App.Auth && App.Auth.isServer() && App.Auth.user ? App.Auth.user : null;
    const meName = au ? (au.displayName || au.username) : 'Nutriční terapeut';
    const me = '<div class="side-me"><span class="side-av">' + esc(initials(meName)) + '</span><span><b>' + esc(meName) + '</b><small>' + (au ? (au.role === 'admin' ? 'Správce' : 'Nutriční terapeut') : 'Nutriční terapeut') + '</small></span></div>';
    return '<div class="app"><nav class="side" aria-label="Hlavní nabídka"><div class="brand"><span class="brand-mark">' + ic('l-leaf') + '</span><span class="brand-t"><b>Nutriční</b><span>plánovač</span></span></div>' + nav +
      '<div class="nav-sep"></div><button class="nav-item nav-new" type="button" data-act="nav-client-new"><span class="nav-ic">' + ic('l-userplus') + '</span><span class="nl">Nový klient</span></button>' +
      '<div class="side-card">' + me + App.statusHtml() + (App.Auth ? App.Auth.sideHtml() : '') + '</div></nav>' +
      '<div class="main-wrap"><div class="topbar"><span class="brand-mark" style="width:28px;height:28px;border-radius:9px">' + ic('l-leaf', 'ico-sm') + '</span><b class="head-font">Nutriční plánovač</b><span class="sp"></span><button class="btn btn-ghost btn-icon" type="button" data-act="gsearch" aria-label="Hledat">' + ic('search') + '</button><span id="topstatus" title="Stav ukládání"><span class="dot ' + Store.status + '" style="margin:0"></span></span></div>' +
      '<main class="main" id="main">' + content + '</main></div></div><nav class="bottomnav" aria-label="Hlavní nabídka">' + bn + '</nav>';
  };

  App.render = function (keepScroll) {
    const host = $('#app');
    if (!host) return;
    const y = keepScroll ? window.scrollY : 0;
    const ae = document.activeElement;
    const fid = ae && ae.dataset && ae.dataset.fid && host.contains(ae) ? ae.dataset.fid : null;
    let selS = null, selE = null;
    if (fid) { try { selS = ae.selectionStart; selE = ae.selectionEnd; } catch (e) { /* ignore */ } }
    let content;
    if (!S.ready) content = '<div class="empty"><span class="spin"></span><p>Načítám data…</p></div>';
    else {
      const v = App.views[S.route.page] || App.views.dashboard;
      try { content = v(); } catch (e) { console.error(e); content = '<div class="callout bad">' + ic('alert') + '<div><b>Obrazovku se nepodařilo vykreslit.</b><br><span class="sm">' + esc(e && e.message) + '</span></div></div>'; }
    }
    host.innerHTML = S.ready ? App.shell(content) : '<div class="main">' + content + '</div>';
    if (keepScroll) window.scrollTo(0, y);
    if (fid) {
      const el = host.querySelector('[data-fid="' + fid + '"]');
      if (el) { el.focus({ preventScroll: true }); try { if (selS != null) el.setSelectionRange(selS, selE); } catch (e) { /* ignore */ } }
    }
    App.hooks.forEach((f) => f());
  };
  App.rerender = () => App.render(true);

  // ------------------------------------------------------------ události
  App.IN = {};   // data-in handlery (input)
  App.CH = {};   // data-ch handlery (change)
  document.addEventListener('click', function (e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'scrim') { if (e.target === t && S.modals.length && App.modals[S.modals[S.modals.length - 1].type] && !S.modals[S.modals.length - 1].sticky) App.closeModal(); return; }
    const f = App.A[act];
    if (f) { try { const r = f(t, e); if (r && r.catch) r.catch((er) => { console.error(er); App.toast('Chyba: ' + (er && er.message), { kind: 'bad' }); }); } catch (er) { console.error(er); App.toast('Chyba: ' + (er && er.message), { kind: 'bad' }); } }
  });
  document.addEventListener('input', function (e) {
    const t = e.target.closest('[data-in]');
    if (!t) return;
    const f = App.IN[t.dataset.in];
    if (f) { try { f(t, e); } catch (er) { console.error(er); } }
  });
  document.addEventListener('change', function (e) {
    const t = e.target.closest('[data-ch]');
    if (!t) return;
    const f = App.CH[t.dataset.ch];
    if (f) { try { f(t, e); } catch (er) { console.error(er); } }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.modals.length) {
      const m = S.modals[S.modals.length - 1];
      if (m.type === 'confirm') { m.resolve(false); App.closeModal(m); } else if (!m.sticky) App.closeModal();
    }
    if (e.key === 'Enter' && e.target && e.target.matches && e.target.matches('[data-enter]')) {
      e.preventDefault();
      const f = App.A[e.target.dataset.enter];
      if (f) f(e.target, e);
    }
  });
  window.addEventListener('hashchange', function () {
    const p = HASH_REV[(location.hash || '').slice(1)];
    if (p && S.ready && S.route.page !== p) App.go(p);
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && Store.pending && Store.pending.size) Store.flush(); });

  Object.assign(App.A, {
    nav: (t) => App.go(t.dataset.page),
    'nav-client-new': () => App.A['client-new'](),
    'modal-close': () => { const m = S.modals[S.modals.length - 1]; if (m && m.type === 'confirm') m.resolve(false); App.closeModal(); },
    'confirm-yes': () => { const m = S.modals[S.modals.length - 1]; if (m && m.type === 'confirm') { m.resolve(true); App.closeModal(m); } },
    'confirm-no': () => { const m = S.modals[S.modals.length - 1]; if (m && m.type === 'confirm') { m.resolve(false); App.closeModal(m); } },
    'retry-save': async () => { const ok = await Store.flush(); App.toast(ok ? 'Uloženo' : 'Uložení se znovu nepodařilo', ok ? {} : { kind: 'bad' }); }
  });

  // ------------------------------------------------------------ globální hledání a upozornění
  const gsResults = (q) => {
    const n = NT.norm(q || '');
    if (n.length < 2) return '<p class="muted sm" style="padding:6px 2px">Piš aspoň dvě písmena. Hledá se mezi klienty, potravinami a recepty.</p>';
    const cl = App.clients(false).concat(App.clients(true)).filter((c) => NT.norm(c.name).indexOf(n) >= 0).slice(0, 6);
    const fo = S.cat.foods.filter((f) => NT.norm(f.name).indexOf(n) >= 0).slice(0, 6);
    const re = S.cat.recipes.filter((r) => NT.norm(r.name).indexOf(n) >= 0).slice(0, 6);
    const grp = (t, ico, rows) => rows ? '<h4 style="margin:12px 0 6px">' + t + '</h4><div class="pick-list">' + rows + '</div>' : '';
    const row = (act, attrs, ico, name, sub) => '<button class="pick" type="button" data-act="' + act + '" ' + attrs + '>' + ic(ico, 'ico-sm') + '<span class="grow"><b>' + esc(name) + '</b>' + (sub ? '<br><span class="xs muted">' + esc(sub) + '</span>' : '') + '</span>' + ic('right', 'ico-sm') + '</button>';
    const h = grp('Klienti', 'l-users', cl.map((c) => row('gs-client', 'data-id="' + c.id + '"', 'l-users', c.name, NT.GOAL_LABEL[c.goal] || '')).join('')) +
      grp('Potraviny', 'l-apple', fo.map((f) => row('gs-food', 'data-id="' + esc(f.id) + '"', 'l-apple', f.name, '')).join('')) +
      grp('Recepty', 'l-chef', re.map((r) => row('gs-recipe', 'data-id="' + esc(r.id) + '"', 'l-chef', r.name, '')).join(''));
    return h || '<p class="muted sm" style="padding:6px 2px">Nic nenalezeno.</p>';
  };
  App.modals.gsearch = (m) => ({
    title: 'Hledat', size: '',
    body: '<div class="cl-search" style="width:100%">' + ic('search') + '<input type="search" id="gs-q" data-in="gs-q" data-fid="gsq" placeholder="Jméno klienta, potravina nebo recept" autocomplete="off" value="' + esc(m.q || '') + '"></div><div id="gs-res">' + gsResults(m.q) + '</div>',
    focus: '#gs-q'
  });
  App.IN['gs-q'] = (t) => { const m = S.modals[S.modals.length - 1]; if (m) m.q = t.value; const r = $('#gs-res'); if (r) r.innerHTML = gsResults(t.value); };
  const gsOpen = (fn) => { App.closeAll(); fn(); };
  Object.assign(App.A, {
    gsearch: () => { if (!S.ready) return; if (S.modals.length && S.modals[S.modals.length - 1].type === 'gsearch') return; App.openModal({ type: 'gsearch', q: '' }); },
    'gs-client': (t) => gsOpen(() => App.A['client-open'](t)),
    'gs-food': (t) => gsOpen(() => { const f = S.cat.foods.find((x) => String(x.id) === t.dataset.id); S.ui.foodQ = f ? f.name : ''; S.ui.foodCat = ''; S.ui.foodFilter = ''; App.go('foods'); }),
    'gs-recipe': (t) => gsOpen(() => { const r = S.cat.recipes.find((x) => String(x.id) === t.dataset.id); S.ui.recipeQ = r ? r.name : ''; S.ui.recipeTag = ''; App.go('recipes'); }),
    bell: () => { if (S.ready) App.openModal({ type: 'bell' }); }
  });
  App.modals.bell = () => {
    const items = [];
    App.clients(false).forEach((c) => App.alertsOf(c, true).forEach((i) => items.push({ c, i })));
    const rank = { bad: 0, warn: 1, info: 2 };
    items.sort((a, b) => rank[a.i.level] - rank[b.i.level]);
    const body = !items.length ? '<p class="muted">Žádná upozornění. U klientů je vše v pořádku.</p>' :
      '<div class="stack-sm">' + items.slice(0, 30).map((w) => '<button class="ag ' + w.i.level + '" type="button" data-act="gs-client" data-id="' + w.c.id + '" style="width:100%;border:0;text-align:left;cursor:pointer"><span class="ag-i">' + ic(w.i.level === 'info' ? 'info' : 'alert', 'ico-sm') + '</span><span class="grow"><b>' + esc(w.c.name) + '</b><br><span class="sm muted">' + esc(w.i.text) + '</span></span>' + ic('right', 'ico-sm') + '</button>').join('') + '</div>';
    return { title: 'Upozornění', size: '', body, footer: '<button class="btn" type="button" data-act="modal-close">Zavřít</button>' };
  };
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && S.ready) { e.preventDefault(); App.A.gsearch(); }
  });

  Store.onStatus(function (st, err) {
    App.refreshStatus();
    if (st === 'error') App.toast('Data se nepodařilo uložit: ' + (err || 'neznámá chyba') + '. Zkus to znovu v levé nabídce.', { kind: 'bad', ms: 9000 });
  });

  // ------------------------------------------------------------ společné části zobrazení
  App.macroSw = (k) => '<span class="sw" style="--c-x:var(--c-' + k + ')"></span>';
  App.utilsHtml = () => {
    let dot = false;
    try { dot = App.clients(false).some((c) => App.alertsOf(c).length); } catch (e) { /* ignore */ }
    return '<div class="utils"><button class="gsearch" type="button" data-act="gsearch" aria-label="Hledat klienta, potravinu nebo recept">' + ic('search') + '<span>Hledat klienta, potravinu, recept…</span><kbd>Ctrl K</kbd></button>' +
      '<button class="bell" type="button" data-act="bell" aria-label="Upozornění">' + ic('l-bell') + (dot ? '<i></i>' : '') + '</button></div>';
  };
  App.pageHead = (title, sub, actions, crumb) =>
    '<div class="page-head">' + '<div class="grow">' + (crumb || '') + '<h1>' + title + '</h1>' + (sub ? '<p class="muted">' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="row">' + actions + '</div>' : '') + App.utilsHtml() + '</div>';
  App.crumb = (label, act, data) => '<button class="crumb" type="button" data-act="' + act + '" ' + (data || '') + '>' + ic('left', 'ico-sm') + esc(label) + '</button>';
  App.emptyBox = (title, text, btn) => '<div class="empty"><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (btn || '') + '</div>';
  App.callout = (kind, html) => '<div class="callout ' + kind + '">' + ic(kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'alert') + '<div>' + html + '</div></div>';

  App.goalBadge = (g) => '<span class="badge accent">' + esc(NT.GOAL_LABEL[g] || 'Bez cíle') + '</span>';

  // ------------------------------------------------------------ PŘEHLED
  App.clientIssues = function (c) {
    const out = [];
    const needs = App.needsOf(c);
    const cur = App.current(c.id);
    if (!needs.ok) out.push({ level: 'info', text: 'Chybí údaje pro výpočet potřeb: ' + needs.missing.join(', ') + '.' });
    else needs.warnings.filter((w) => w.level === 'crit' || w.level === 'warn').slice(0, 2).forEach((w) => out.push({ level: w.level === 'crit' ? 'bad' : 'warn', text: w.text }));
    const sum = NT.trackSummary(c, App.track(c.id), NT.today());
    sum.concerns.filter((x) => x.level === 'warn').forEach((x) => out.push({ level: 'warn', text: x.text }));
    if (cur.date && NT.daysBetween(cur.date, NT.today()) > 14) out.push({ level: 'info', text: 'Poslední měření hmotnosti je z ' + dateCs(cur.date) + '.' });
    if (!App.plansOf(c.id).length && needs.ok) out.push({ level: 'info', text: 'Zatím nemá žádný jídelníček.' });
    return out;
  };

  App.views.dashboard = function () {
    const clients = App.clients(false);
    const plans = Store.list('plans');
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Dobrou noc' : hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Dobrý den' : 'Dobrý večer';
    const work = [];
    clients.forEach((c) => App.clientIssues(c).forEach((i) => work.push({ c, i })));
    const rank = { bad: 0, warn: 1, info: 2 };
    work.sort((a, b) => rank[a.i.level] - rank[b.i.level]);
    const unver = S.cat.foods.filter((f) => !App.isBaseFood(f) && !f.verified).length;
    const bad = S.cat.foods.filter((f) => S.foodIssues.get(f.id) === 'bad').length;
    let h = App.pageHead(greet + (Store.get('settings', 'main') && Store.get('settings', 'main').name ? '' : ''), 'Dnes je ' + new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.',
      '<button class="btn btn-primary" type="button" data-act="client-new">' + ic('plus') + 'Nový klient</button>');
    if (Store.mode !== 'db' && Store.mode !== 'api') {
      h += '<div style="margin-bottom:16px">' + App.callout('warn', Store.mode === 'local'
        ? '<b>Data se ukládají jen v tomto prohlížeči.</b> Databáze artefaktu není k dispozici. Pravidelně si stahuj zálohu v Nastavení.'
        : '<b>Data se neukládají trvale.</b> Po zavření stránky zmizí. Stáhni si zálohu v Nastavení.') + '</div>';
    }
    if (!clients.length) {
      h += '<div class="empty">' + ic('users', 'ico-lg') + '<h3>Začni prvním klientem</h3><p>Zadej základní údaje, aplikace spočítá potřeby energie a živin. Potom sestavíš jídelníček a pošleš ho klientovi jako PDF.</p>' +
        '<div class="row" style="justify-content:center"><button class="btn btn-primary" type="button" data-act="client-new">' + ic('plus') + 'Nový klient</button><button class="btn" type="button" data-act="demo-load">' + ic('wand') + 'Načíst ukázkového klienta</button></div>' +
        '<p class="xs">Ukázkový klient má vymyšlená data a slouží k vyzkoušení. Kdykoli ho smažeš.</p></div>';
    } else {
      h += '<div class="grid g4" style="margin-bottom:18px">' +
        '<div class="stat"><span class="v">' + clients.length + '</span><span class="l">' + plural(clients.length, 'aktivní klient', 'aktivní klienti', 'aktivních klientů') + '</span></div>' +
        '<div class="stat"><span class="v">' + plans.length + '</span><span class="l">' + plural(plans.length, 'jídelníček', 'jídelníčky', 'jídelníčků') + '</span></div>' +
        '<div class="stat"><span class="v">' + S.cat.recipes.length + '</span><span class="l">receptů v knihovně</span></div>' +
        '<div class="stat"><span class="v">' + S.cat.foods.length + '</span><span class="l">potravin' + (unver ? ', ' + unver + ' neověřených' : '') + (bad ? ', ' + bad + ' s chybou' : '') + '</span></div></div>';
      h += '<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h2>K řešení</h2></div>';
      if (!work.length) h += '<p class="muted">Nic nehoří. U klientů nejsou žádná upozornění.</p>';
      else {
        h += '<div class="stack-sm">' + work.slice(0, 8).map((w) => '<button class="list-row" type="button" data-act="client-open" data-id="' + w.c.id + '" style="padding:10px 4px;border-radius:6px"><span class="badge ' + w.i.level + '">' + (w.i.level === 'bad' ? 'Pozor' : w.i.level === 'warn' ? 'Zvážit' : 'Info') + '</span><span class="grow"><b>' + esc(w.c.name) + '</b><br><span class="sm muted">' + esc(w.i.text) + '</span></span>' + ic('right', 'ico-sm') + '</button>').join('') + '</div>';
      }
      h += '</div><div class="card"><div class="card-h"><h2>Klienti</h2><button class="btn btn-sm" type="button" data-act="nav" data-page="clients">Všichni</button></div><div class="stack-sm">' +
        clients.slice(0, 6).map((c) => {
          const cur = App.current(c.id);
          return '<button class="list-row" type="button" data-act="client-open" data-id="' + c.id + '" style="padding:8px 4px;border-radius:6px"><span class="avatar">' + esc(initials(c.name)) + '</span><span class="grow"><b>' + esc(c.name) + '</b>' + (c.demo ? ' <span class="badge info">Ukázka</span>' : '') + '<br><span class="sm muted">' + esc(NT.GOAL_LABEL[c.goal] || 'Bez cíle') + (cur.weight ? ' · ' + fmt(cur.weight, 1) + ' kg' : '') + '</span></span>' + ic('right', 'ico-sm') + '</button>';
        }).join('') + '</div></div></div>';
    }
    return h;
  };

  // ------------------------------------------------------------ KLIENTI
  const clientFilterFn = (f) => (c) => {
    if (!f) return true;
    if (f === 'issues') return App.alertsOf(c).length > 0;
    return c.goal === f;
  };
  App.clientFiltered = function () {
    const q = NT.norm(S.ui.clientQ);
    let list = App.clients(S.ui.showArchived);
    if (q) list = list.filter((c) => NT.norm(c.name).indexOf(q) >= 0);
    return list.filter(clientFilterFn(S.ui.clientFilter || ''));
  };
  App.views.clients = function () {
    const arch = App.clients(true);
    const all = App.clients(S.ui.showArchived);
    const goals = NT.GOALS.filter(([k]) => all.some((c) => c.goal === k));
    const chip = (k, l) => '<button class="chip" type="button" data-act="client-filter" data-f="' + k + '" aria-pressed="' + ((S.ui.clientFilter || '') === k) + '">' + esc(l) + '</button>';
    let h = App.pageHead('Klienti', S.ui.showArchived ? 'Včetně archivovaných' : all.length + ' ' + plural(all.length, 'klient', 'klienti', 'klientů'), '<button class="btn btn-primary" type="button" data-act="client-new">' + ic('l-userplus') + 'Nový klient</button>');
    h += '<div class="cl-tools"><label class="cl-search">' + ic('search') + '<input type="search" id="client-q" data-in="client-q" data-fid="cq" placeholder="Hledat klienta" value="' + esc(S.ui.clientQ) + '" aria-label="Hledat klienta"></label>' +
      chip('', 'Všichni') + chip('issues', 'K řešení') + goals.map(([k, l]) => chip(k, l)).join('') +
      (arch.length || S.ui.showArchived ? '<label class="chk" style="margin-left:6px"><input type="checkbox" data-ch="client-arch"' + (S.ui.showArchived ? ' checked' : '') + '> Archivovaní (' + arch.length + ')</label>' : '') + '</div>';
    h += '<div id="client-list">' + App.clientListHtml(App.clientFiltered()) + '</div>';
    return h;
  };
  App.clientListHtml = function (list) {
    const filtered = S.ui.clientQ || S.ui.clientFilter;
    if (!list.length) return App.emptyBox(filtered ? 'Nic nenalezeno' : 'Zatím žádní klienti', filtered ? 'Zkus upravit hledání nebo filtr.' : 'Přidej prvního klienta, nebo si načti ukázkového.', filtered ? '' : '<div class="row"><button class="btn btn-primary" type="button" data-act="client-new">' + ic('l-userplus') + 'Nový klient</button><button class="btn" type="button" data-act="demo-load">' + ic('wand') + 'Načíst ukázkového klienta</button></div>');
    return '<div class="cl-grid">' + list.map((c) => {
      const ctx = App.clientCtx(c);
      const ser = NT.weightSeries(ctx.track.measures).slice(-6).map((p) => p.weight);
      const lo = Math.min.apply(null, ser), hi = Math.max.apply(null, ser);
      const bars = ser.length > 1 ? ser.map((v) => '<i style="height:' + (hi === lo ? 60 : Math.round(25 + 75 * (v - lo) / (hi - lo))) + '%"></i>').join('') : '';
      const pct = App.goalPct({ c, ctx });
      const age = NT.ageOn(c.birth);
      const issue = ctx.agenda.filter((i) => i.level !== 'info')[0];
      const kc = ctx.needs.ok ? ctx.needs.rest.kcal : null;
      return '<button class="ccard" type="button" data-act="client-open" data-id="' + c.id + '" style="' + App.avStyle(c.id) + '"><span class="top"><span class="av">' + esc(initials(c.name)) + '</span><span class="nm"><b>' + esc(c.name) + (c.demo ? ' <span class="badge info">Ukázka</span>' : '') + (c.archived ? ' <span class="badge">Archiv</span>' : '') + '</b>' +
        '<small>' + esc(NT.GOAL_LABEL[c.goal] || 'Bez cíle') + (age != null ? ' · ' + age + ' let' : '') + '</small></span></span>' +
        '<span class="mid"><span class="c1"><b>' + (ctx.cur.weight ? fmt(ctx.cur.weight, 1) + ' kg' : '– kg') + '</b><small>' + (kc ? 'cíl ' + fmt(kc) + ' kcal / den' : 'cíl zatím nejde spočítat') + '</small></span>' + (bars ? '<span class="sp5" aria-hidden="true">' + bars + '</span>' : '') + '</span>' +
        '<span class="pr"><span class="ph"><span>Cesta k cílové hmotnosti</span><span>' + (pct == null ? '–' : pct + ' %') + '</span></span><span class="tr"><i style="width:' + (pct || 0) + '%"></i></span></span>' +
        (issue ? '<span class="al ' + issue.level + '">' + ic('alert', 'ico-sm') + '<span>' + esc(issue.text) + '</span></span>' : '') + '</button>';
    }).join('') + '</div>';
  };
  App.A['client-filter'] = (t) => { S.ui.clientFilter = t.dataset.f; App.rerender(); };
  App.IN['client-q'] = (t) => { S.ui.clientQ = t.value; $('#client-list').innerHTML = App.clientListHtml(App.clientFiltered()); };
  App.CH['client-arch'] = (t) => { S.ui.showArchived = t.checked; App.rerender(); };

  App.modals.clientNew = (m) => ({
    title: 'Nový klient', size: '',
    body: '<p class="muted sm" style="margin-bottom:12px">Základní údaje stačí. Zbytek doplníš později v profilu klienta.</p><div class="form-grid">' +
      '<label class="f span-all">Jméno nebo označení<input type="text" id="nc-name" data-fid="ncn" placeholder="např. Jana N. (doporučeno zkrácené jméno)" data-enter="client-create"></label>' +
      '<label class="f">Pohlaví<select id="nc-sex"><option value="">Vyber</option><option value="f">Žena</option><option value="m">Muž</option></select></label>' +
      '<label class="f">Datum narození<input type="date" id="nc-birth"></label>' +
      '<label class="f">Výška (cm)<input type="number" id="nc-h" min="100" max="230" inputmode="decimal"></label>' +
      '<label class="f">Hmotnost (kg)<input type="number" id="nc-w" min="30" max="300" step="0.1" inputmode="decimal"></label>' +
      '<label class="f">Cíl<select id="nc-goal">' + NT.GOALS.map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('') + '</select></label></div>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="client-create">Vytvořit klienta</button>', focus: '#nc-name'
  });
  App.A['client-new'] = () => App.openModal({ type: 'clientNew' });
  App.A['client-create'] = () => {
    const v = (id) => ($('#' + id) || {}).value || '';
    const name = v('nc-name').trim();
    if (!name) { App.toast('Zadej jméno nebo označení klienta', { kind: 'bad' }); $('#nc-name').focus(); return; }
    const goal = v('nc-goal') || 'loss';
    const c = { id: NT.uid('c'), name, sex: v('nc-sex'), birth: v('nc-birth'), heightCm: NT.toNum(v('nc-h')), goal, diet: 'all', allergens: [], dislikes: '', health: '', training: '', notes: '', needs: NT.defaultNeeds(goal), createdAt: new Date().toISOString() };
    if (!(c.heightCm > 0)) c.heightCm = null;
    Store.put('clients', c);
    const w = NT.toNum(v('nc-w'));
    if (w > 0) App.upsertMeasure(c.id, { date: NT.today(), weightKg: w });
    App.closeAll();
    App.go('client', { id: c.id, tab: 'profile' });
    App.toast('Klient vytvořen');
  };
  App.A['client-open'] = (t) => { S.ui.clientTab = 'profile'; App.go('client', { id: t.dataset.id }); };

  // ------------------------------------------------------------ DETAIL KLIENTA
  App.views.client = function () {
    const c = Store.get('clients', S.route.id);
    if (!c) return App.emptyBox('Klient nenalezen', 'Možná byl smazán.', '<button class="btn" type="button" data-act="nav" data-page="clients">Zpět na klienty</button>');
    const tab = S.ui.clientTab;
    const cur = App.current(c.id);
    const age = NT.ageOn(c.birth);
    const sub = [NT.GOAL_LABEL[c.goal], age != null ? age + ' let' : '', cur.weight ? fmt(cur.weight, 1) + ' kg' : '', c.heightCm ? c.heightCm + ' cm' : ''].filter(Boolean).join(' · ');
    let h = App.pageHead(esc(c.name) + (c.demo ? ' <span class="badge info" style="vertical-align:middle">Ukázka</span>' : '') + (c.archived ? ' <span class="badge">Archivován</span>' : ''), esc(sub),
      '<button class="btn btn-sm" type="button" data-act="client-archive" data-id="' + c.id + '">' + (c.archived ? 'Obnovit z archivu' : 'Archivovat') + '</button><button class="btn btn-sm btn-danger" type="button" data-act="client-delete" data-id="' + c.id + '">' + ic('trash', 'ico-sm') + 'Smazat</button>',
      App.crumb('Klienti', 'nav', 'data-page="clients"'));
    h += '<div class="tabs" role="tablist">' + [['profile', 'Profil a potřeby', 'target'], ['plans', 'Jídelníčky', 'utensils'], ['track', 'Sledování', 'chart']].map(([k, l, i]) =>
      '<button class="tab" role="tab" type="button" data-act="client-tab" data-tab="' + k + '" aria-selected="' + (tab === k) + '">' + ic(i === 'utensils' ? 'list' : i, 'ico-sm') + l + '</button>').join('') + '</div>';
    if (tab === 'profile') h += App.profileHtml(c);
    else if (tab === 'plans') h += App.plansTabHtml(c);
    else h += App.trackHtml(c);
    return h;
  };
  App.A['client-tab'] = (t) => { S.ui.clientTab = t.dataset.tab; App.rerender(); };
  App.A['client-archive'] = (t) => { const c = Store.get('clients', t.dataset.id); c.archived = !c.archived; Store.put('clients', c); App.toast(c.archived ? 'Klient archivován' : 'Klient obnoven'); App.rerender(); };
  App.A['client-delete'] = async (t) => {
    const c = Store.get('clients', t.dataset.id);
    const plans = App.plansOf(c.id);
    const ok = await App.confirm({ title: 'Smazat klienta ' + c.name + '?', text: 'Smaže se profil, všechna měření a deník' + (plans.length ? ' i ' + plans.length + ' ' + plural(plans.length, 'jídelníček', 'jídelníčky', 'jídelníčků') : '') + '. Tuto akci nelze vrátit zpět.', ok: 'Smazat natrvalo', danger: true });
    if (!ok) return;
    plans.forEach((p) => Store.remove('plans', p.id));
    Store.remove('tracks', c.id);
    Store.remove('clients', c.id);
    App.go('clients');
    App.toast('Klient smazán');
  };

  // --- profil
  const AL = NT.ALLERGENS;
  App.profileHtml = function (c) {
    const cur = App.current(c.id);
    const f = (label, inner, cls) => '<label class="f ' + (cls || '') + '">' + label + inner + '</label>';
    let h = '<div class="grid split-56" id="profile-grid"><div class="stack">';
    h += '<div class="card"><div class="card-h"><h2>Údaje o klientovi</h2></div><div class="form-grid">' +
      f('Jméno nebo označení', '<input type="text" data-in="c.name" data-fid="c-name" value="' + esc(c.name) + '">', 'span-all') +
      f('Pohlaví', '<select data-ch="c.sex"><option value="">Neuvedeno</option><option value="f"' + (c.sex === 'f' ? ' selected' : '') + '>Žena</option><option value="m"' + (c.sex === 'm' ? ' selected' : '') + '>Muž</option></select>') +
      f('Datum narození', '<input type="date" data-ch="c.birth" value="' + esc(c.birth || '') + '">') +
      f('Výška (cm)', '<input type="number" data-in="c.heightCm" data-fid="c-h" min="100" max="230" step="1" inputmode="decimal" value="' + (c.heightCm || '') + '">') +
      f('Aktuální hmotnost (kg)<span class="hint">Zapíše se jako dnešní měření</span>', '<input type="number" data-ch="c.weight" min="30" max="300" step="0.1" inputmode="decimal" value="' + (cur.weight != null ? cur.weight : '') + '">') +
      f('Tělesný tuk (%)<span class="hint">Volitelné, pro některé vzorce</span>', '<input type="number" data-ch="c.bf" min="3" max="60" step="0.1" inputmode="decimal" value="' + (cur.bf != null ? cur.bf : '') + '">') +
      f('Cíl', '<select data-ch="c.goal">' + NT.GOALS.map(([k, l]) => '<option value="' + k + '"' + (c.goal === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>') +
      f('Stravovací styl', '<select data-ch="c.diet">' + NT.DIETS.map(([k, l]) => '<option value="' + k + '"' + ((c.diet || 'all') === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>') + '</div>' +
      '<div style="margin-top:14px"><div class="muted sm" style="font-weight:500;margin-bottom:6px">Alergie a nesnášenlivosti (tvrdé omezení, aplikace na ně upozorní)</div><div class="row" style="gap:6px">' +
      AL.map(([k, l]) => '<button class="chip bad" type="button" data-act="c-allergen" data-k="' + k + '" aria-pressed="' + ((c.allergens || []).indexOf(k) >= 0) + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="form-grid" style="margin-top:14px">' +
      f('Nechutě a potraviny, které klient nejí<span class="hint">Odděl čárkou, např. „brokolice, ryby“</span>', '<textarea data-in="c.dislikes" data-fid="c-dis" rows="2">' + esc(c.dislikes || '') + '</textarea>', 'span-all') +
      f('Zdravotní poznámky a léky', '<textarea data-in="c.health" data-fid="c-health" rows="2" placeholder="Diagnózy, léky, výsledky krve…">' + esc(c.health || '') + '</textarea>', 'span-all') +
      f('Pohyb, trénink a denní režim', '<textarea data-in="c.training" data-fid="c-train" rows="2" placeholder="Sport, frekvence, časy tréninků, směnnost…">' + esc(c.training || '') + '</textarea>', 'span-all') +
      f('Soukromé poznámky terapeuta', '<textarea data-in="c.notes" data-fid="c-notes" rows="3">' + esc(c.notes || '') + '</textarea>', 'span-all') + '</div></div></div>';
    h += '<div class="stack" id="needs-card">' + App.needsHtml(c) + '</div></div>';
    return h;
  };
  const CSET = {
    'c.name': (c, v) => { c.name = v; },
    'c.heightCm': (c, v) => { c.heightCm = NT.toNum(v); },
    'c.dislikes': (c, v) => { c.dislikes = v; }, 'c.health': (c, v) => { c.health = v; }, 'c.training': (c, v) => { c.training = v; }, 'c.notes': (c, v) => { c.notes = v; }
  };
  Object.keys(CSET).forEach((k) => {
    App.IN[k] = (t) => { const c = Store.get('clients', S.route.id); CSET[k](c, t.value); Store.put('clients', c); if (k === 'c.heightCm') App.refreshNeeds(); };
  });
  App.CH['c.sex'] = (t) => { const c = Store.get('clients', S.route.id); c.sex = t.value; Store.put('clients', c); App.refreshNeeds(); };
  App.CH['c.birth'] = (t) => { const c = Store.get('clients', S.route.id); c.birth = t.value; Store.put('clients', c); App.refreshNeeds(); };
  App.CH['c.diet'] = (t) => { const c = Store.get('clients', S.route.id); c.diet = t.value; Store.put('clients', c); };
  App.CH['c.goal'] = (t) => {
    const c = Store.get('clients', S.route.id);
    const old = c.goal; c.goal = t.value;
    const n = c.needs || (c.needs = NT.defaultNeeds(c.goal));
    const defOld = NT.defaultNeeds(old), defNew = NT.defaultNeeds(c.goal);
    if (n.goalPct === defOld.goalPct) n.goalPct = defNew.goalPct;
    if (n.proteinPerKg === defOld.proteinPerKg) n.proteinPerKg = defNew.proteinPerKg;
    Store.put('clients', c); App.rerender();
  };
  App.CH['c.weight'] = (t) => {
    const c = Store.get('clients', S.route.id);
    const v = NT.toNum(t.value);
    if (v == null || v < 30 || v > 300) { App.toast('Hmotnost musí být mezi 30 a 300 kg', { kind: 'bad' }); return; }
    App.upsertMeasure(c.id, { date: NT.today(), weightKg: v }); App.refreshNeeds(); App.toast('Zapsáno jako dnešní měření');
  };
  App.CH['c.bf'] = (t) => {
    const c = Store.get('clients', S.route.id);
    const v = t.value === '' ? null : NT.toNum(t.value);
    if (v != null && (v < 3 || v > 60)) { App.toast('Tělesný tuk musí být mezi 3 a 60 %', { kind: 'bad' }); return; }
    const cur = App.current(c.id);
    if (!cur.weight && v != null) { App.toast('Nejdřív zadej hmotnost', { kind: 'bad' }); return; }
    App.upsertMeasure(c.id, { date: NT.today(), weightKg: cur.weight, bf: v });
    App.refreshNeeds();
  };
  App.A['c-allergen'] = (t) => {
    const c = Store.get('clients', S.route.id);
    const set = new Set(c.allergens || []);
    if (set.has(t.dataset.k)) set.delete(t.dataset.k); else set.add(t.dataset.k);
    c.allergens = [...set]; Store.put('clients', c);
    t.setAttribute('aria-pressed', set.has(t.dataset.k));
  };

  // --- potřeby
  const nv = (v) => (v === null || v === undefined || v === '' ? '' : v);
  App.refreshNeeds = function () {
    const host = $('#needs-card');
    const c = Store.get('clients', S.route.id);
    if (host && c) {
      const open = $$('details.adv', host).map((d) => d.open);
      host.innerHTML = App.needsHtml(c);
      $$('details.adv', host).forEach((d, i) => { d.open = !!open[i]; });
    }
  };
  App.needsHtml = function (c) {
    const n = Object.assign(NT.defaultNeeds(c.goal), c.needs || {});
    const res = App.needsOf(c);
    const cur = App.current(c.id);
    let h = '<div class="card"><div class="card-h"><h2>Potřeby a cíle</h2></div>';
    if (!res.ok) {
      h += App.callout('info', '<b>Pro výpočet chybí:</b> ' + res.missing.join(', ') + '.<br><span class="sm">Doplň údaje vlevo a cíle se spočítají automaticky.</span>');
    }
    h += '<div class="form-grid" style="margin-top:' + (res.ok ? 0 : 12) + 'px">' +
      '<label class="f span-all">Vzorec pro bazální metabolismus<select data-ch="n.formula">' + NT.FORMULAS.map(([k, l]) => '<option value="' + k + '"' + (n.formula === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      (n.formula === 'manual' ? '<label class="f span-all">Bazální metabolismus (kcal/den)<input type="number" data-in="n.manualBmr" data-fid="n-bmr" min="800" max="4000" value="' + nv(n.manualBmr) + '"></label>' : '') +
      '<label class="f span-all">Každodenní aktivita mimo trénink<select data-ch="n.pal">' + NT.PALS.map(([v, l]) => '<option value="' + v + '"' + (n.pal === v ? ' selected' : '') + '>' + l + ' (×' + String(v).replace('.', ',') + ')</option>').join('') + '</select></label>' +
      '<label class="f">Energie navíc v tréninkový den (kcal)<span class="hint">Spotřeba jednoho tréninku</span><input type="number" data-in="n.trainingKcal" data-fid="n-tk" min="0" max="3000" step="10" inputmode="numeric" value="' + nv(n.trainingKcal) + '"></label>' +
      '<label class="f">Tréninkových dnů týdně<input type="number" data-in="n.trainingDays" data-fid="n-td" min="0" max="7" step="1" inputmode="numeric" value="' + nv(n.trainingDays) + '"></label>' +
      '<div class="span-all"><button class="btn btn-sm" type="button" data-act="train-calc">' + ic('target', 'ico-sm') + 'Spočítat spotřebu tréninku z aktivity</button></div>' +
      '<label class="f span-all">Změna energie oproti výdeji: <b id="goalpct-l">' + (n.goalPct > 0 ? '+' : '') + String(n.goalPct).replace('.', ',') + ' %</b><span class="hint">Záporná hodnota = deficit (redukce), kladná = přebytek (nabírání)</span><input type="range" data-in="n.goalPct" min="-35" max="25" step="1" value="' + n.goalPct + '"></label>' +
      '<label class="f">Bílkoviny (g/kg)<input type="number" data-in="n.proteinPerKg" data-fid="n-pk" min="0.5" max="3.5" step="0.1" inputmode="decimal" value="' + nv(n.proteinPerKg) + '"></label>' +
      '<label class="f">Tuky (% energie)<input type="number" data-in="n.fatPct" data-fid="n-fp" min="10" max="50" step="1" inputmode="numeric" value="' + nv(n.fatPct) + '"></label>' +
      '<label class="f">Vláknina minimum (g)<input type="number" data-in="n.fiberMin" data-fid="n-fm" min="0" max="80" step="1" inputmode="numeric" value="' + nv(n.fiberMin) + '"></label>' +
      '<label class="f">Sůl maximum (g)<input type="number" data-in="n.saltMax" data-fid="n-sm" min="1" max="15" step="0.5" inputmode="decimal" value="' + nv(n.saltMax) + '"></label></div></div>';

    if (res.ok) {
      const hasTrain = n.trainingKcal > 0;
      const rows = [['rest', res.rest]].concat(hasTrain ? [['training', res.training]] : []);
      h += '<div class="card"><div class="card-h"><h2>Denní cíle</h2><span class="muted sm">spočteno pro ' + fmt(res.weight, 1) + ' kg, vzorec ' + esc((NT.FORMULAS.find((x) => x[0] === res.formula) || [])[1] || '') + '</span></div>' +
        '<div class="grid g3" style="margin-bottom:14px"><div class="stat"><span class="v">' + fmt(res.bmr) + '</span><span class="l">Bazální metabolismus (kcal)</span></div>' +
        '<div class="stat"><span class="v">' + fmt(res.rest.tdee) + '</span><span class="l">Celkový výdej, klidový den (kcal)</span></div>' +
        '<div class="stat"><span class="v">' + (res.weeklyKg > 0 ? '+' : res.weeklyKg < 0 ? '−' : '') + fmt(Math.abs(res.weeklyKg), 2) + ' kg</span><span class="l">Očekávaná změna za týden</span></div></div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Den</th><th class="r">Energie</th><th class="r">Bílkoviny</th><th class="r">Tuky</th><th class="r">Sacharidy</th><th class="r">Vláknina</th><th class="r">Sůl max</th></tr></thead><tbody>' +
        rows.map(([k, t]) => '<tr><td><b>' + NT.DAY_TYPES[k] + '</b></td>' + [['kcal', 0, 'kcal'], ['protein', 0, 'g'], ['fat', 0, 'g'], ['carbs', 0, 'g']].map(([kk, d, u]) => '<td class="r">' + fmt(t[kk], d) + ' ' + u + (t.manual.indexOf(kk) >= 0 ? ' <span class="badge info" title="Ručně upraveno">ručně</span>' : '') + '</td>').join('') + '<td class="r">min. ' + fmt(t.fiber) + ' g</td><td class="r">' + fmt(t.salt, 1) + ' g</td></tr>').join('') + '</tbody></table></div>';
      const split = NT.energySplit(res.rest);
      h += '<p class="muted sm" style="margin-top:8px">Rozdělení energie v klidový den: bílkoviny ' + fmt(split.protein) + ' %, tuky ' + fmt(split.fat) + ' %, sacharidy ' + fmt(split.carbs + split.fiber) + ' %.' +
        (res.ea ? ' Energetická dostupnost: ' + fmt(res.ea.rest, 0) + ' kcal/kg beztukové hmoty' + (res.ea.training != null ? ' (tréninkový den ' + fmt(res.ea.training, 0) + ')' : '') + '.' : '') + '</p></div>';
      if (res.warnings.length) {
        h += '<div class="stack-sm">' + res.warnings.map((w) => '<div class="callout ' + (w.level === 'crit' ? 'bad' : w.level === 'warn' ? 'warn' : 'info') + '">' + ic(w.level === 'info' ? 'info' : 'alert') + '<div>' + esc(w.text) + '</div></div>').join('') + '</div>';
      }
      // ruční úprava + výpočet
      const ov = n.override || { rest: {}, training: {} };
      const ovIn = (day, k, lab, unit, auto) => '<label class="f">' + lab + '<input type="number" data-in="ov.' + day + '.' + k + '" data-fid="ov-' + day + k + '" step="1" inputmode="decimal" placeholder="' + fmt(auto) + '" value="' + nv((ov[day] || {})[k]) + '"><span class="hint">Automaticky ' + fmt(auto) + ' ' + unit + '</span></label>';
      const auto = (day) => { const tdee = day === 'rest' ? res.rest.tdee : res.training.tdee; const kc = tdee * (1 + n.goalPct / 100); const pr = n.proteinPerKg * res.weight; const ft = (n.fatPct / 100 * kc) / 9; return { kcal: kc, protein: pr, fat: ft, carbs: Math.max(0, (kc - pr * 4 - ft * 9) / 4) }; };
      h += '<details class="adv" id="adv-ov"' + (Object.keys(ov.rest || {}).length || Object.keys(ov.training || {}).length ? ' open' : '') + '><summary>Ruční úprava cílů</summary><div class="in"><p class="muted sm" style="margin-bottom:10px">Vyplněná hodnota přepíše automatický výpočet. Pokud přepíšeš jen energii, sacharidy se dopočítají. Prázdné pole = automaticky.</p>' +
        ['rest'].concat(hasTrain ? ['training'] : []).map((day) => { const a = auto(day); return '<h4 style="margin:10px 0 6px">' + NT.DAY_TYPES[day] + '</h4><div class="form-grid">' + ovIn(day, 'kcal', 'Energie', 'kcal', a.kcal) + ovIn(day, 'protein', 'Bílkoviny (g)', 'g', a.protein) + ovIn(day, 'fat', 'Tuky (g)', 'g', a.fat) + ovIn(day, 'carbs', 'Sacharidy (g)', 'g', a.carbs) + '</div>'; }).join('') +
        '<div style="margin-top:10px"><button class="btn btn-sm" type="button" data-act="ov-clear">Zrušit všechny ruční úpravy</button></div></div></details>';
      const fl = (NT.FORMULAS.find((x) => x[0] === res.formula) || [])[1];
      const bmrLine = res.formula === 'mifflin' ? 'BMR = 10 × ' + fmt(res.weight, 1) + ' + 6,25 × ' + c.heightCm + ' − 5 × ' + res.age + (c.sex === 'm' ? ' + 5' : ' − 161') : res.formula === 'harris' ? 'BMR podle revidované rovnice Harris-Benedict pro ' + (c.sex === 'm' ? 'muže' : 'ženu') : res.formula === 'katch' ? 'BMR = 370 + 21,6 × beztuková hmotnost (' + fmt(res.weight * (1 - res.bf / 100), 1) + ' kg)' : res.formula === 'cunningham' ? 'BMR = 500 + 22 × beztuková hmotnost (' + fmt(res.weight * (1 - res.bf / 100), 1) + ' kg)' : 'BMR zadán ručně';
      h += '<details class="adv"><summary>Jak se čísla počítají</summary><div class="in"><dl class="kv">' +
        '<dt>Vzorec</dt><dd>' + esc(fl || '') + '</dd><dt>Bazální metabolismus</dt><dd>' + esc(bmrLine) + ' = <b>' + fmt(res.bmr) + ' kcal</b></dd>' +
        '<dt>Celkový výdej</dt><dd>' + fmt(res.bmr) + ' × ' + String(n.pal).replace('.', ',') + ' = <b>' + fmt(res.rest.tdee) + ' kcal</b>' + (hasTrain ? '; tréninkový den + ' + fmt(n.trainingKcal) + ' = ' + fmt(res.training.tdee) + ' kcal' : '') + '</dd>' +
        '<dt>Cílová energie</dt><dd>' + fmt(res.rest.tdee) + ' × (1 ' + (n.goalPct >= 0 ? '+' : '−') + ' ' + fmt(Math.abs(n.goalPct) / 100, 2) + ') = <b>' + fmt(res.rest.tdee * (1 + n.goalPct / 100)) + ' kcal</b></dd>' +
        '<dt>Bílkoviny</dt><dd>' + String(n.proteinPerKg).replace('.', ',') + ' g/kg × ' + fmt(res.weight, 1) + ' kg = ' + fmt(n.proteinPerKg * res.weight) + ' g</dd>' +
        '<dt>Tuky</dt><dd>' + n.fatPct + ' % energie ÷ 9 kcal/g</dd><dt>Sacharidy</dt><dd>zbytek energie ÷ 4 kcal/g</dd>' +
        '<dt>Týdenní změna</dt><dd>(průměrný příjem − průměrný výdej) × 7 ÷ 7 700 kcal/kg. Je to jen orientační odhad, skutečný průběh se liší.</dd></dl></div></details>';
    }
    h += '</div>';
    return h;
  };
  const setNeeds = (fn, rerender) => {
    const c = Store.get('clients', S.route.id);
    c.needs = Object.assign(NT.defaultNeeds(c.goal), c.needs || {});
    c.needs.override = Object.assign({ rest: {}, training: {} }, c.needs.override || {});
    fn(c.needs); Store.put('clients', c);
    if (rerender) App.refreshNeeds();
  };
  let needsTimer = null;
  const needsLater = () => { clearTimeout(needsTimer); needsTimer = setTimeout(App.refreshNeeds, 350); };
  [['n.manualBmr', 'manualBmr'], ['n.trainingKcal', 'trainingKcal'], ['n.trainingDays', 'trainingDays'], ['n.proteinPerKg', 'proteinPerKg'], ['n.fatPct', 'fatPct'], ['n.fiberMin', 'fiberMin'], ['n.saltMax', 'saltMax']].forEach(([k, f]) => {
    App.IN[k] = (t) => { const v = NT.toNum(t.value); setNeeds((n) => { n[f] = v == null ? (f === 'manualBmr' ? null : 0) : v; }); needsLater(); };
  });
  App.IN['n.goalPct'] = (t) => { const v = NT.toNum(t.value); setNeeds((n) => { n.goalPct = v; }); const l = $('#goalpct-l'); if (l) l.textContent = (v > 0 ? '+' : '') + String(v).replace('.', ',') + ' %'; needsLater(); };
  App.CH['n.formula'] = (t) => setNeeds((n) => { n.formula = t.value; }, true);
  App.CH['n.pal'] = (t) => setNeeds((n) => { n.pal = NT.toNum(t.value); }, true);
  ['rest', 'training'].forEach((day) => ['kcal', 'protein', 'fat', 'carbs'].forEach((k) => {
    App.IN['ov.' + day + '.' + k] = (t) => { const v = t.value === '' ? null : NT.toNum(t.value); setNeeds((n) => { if (v == null) delete n.override[day][k]; else n.override[day][k] = v; }); needsLater(); };
  }));
  App.A['ov-clear'] = () => { setNeeds((n) => { n.override = { rest: {}, training: {} }; }, true); App.toast('Ruční úpravy zrušeny'); };

  App.modals.trainCalc = (m) => ({
    title: 'Spotřeba energie při tréninku', size: '',
    body: '<p class="muted sm" style="margin-bottom:12px">Orientační odhad podle hodnoty MET: spotřeba = MET × hmotnost × doba. Skutečná spotřeba se u jednotlivců liší.</p><div class="form-grid">' +
      '<label class="f span-all">Aktivita<select id="tc-sport" data-ch="tc-recalc">' + NT.SPORTS.map(([n, met], i) => '<option value="' + i + '"' + (m.sport === i ? ' selected' : '') + '>' + esc(n) + ' (MET ' + String(met).replace('.', ',') + ')</option>').join('') + '</select></label>' +
      '<label class="f">Délka (minuty)<input type="number" id="tc-min" data-in="tc-recalc" min="5" max="300" step="5" value="' + m.min + '"></label>' +
      '<label class="f">Hmotnost (kg)<input type="number" id="tc-w" data-in="tc-recalc" min="30" max="300" step="0.1" value="' + m.weight + '"></label></div>' +
      '<div class="stat" style="margin-top:14px"><span class="v" id="tc-res">' + fmt(m.kcal) + ' kcal</span><span class="l">odhad spotřeby za jeden trénink</span></div>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="train-apply">Použít jako energii navíc</button>', focus: '#tc-min'
  });
  App.A['train-calc'] = () => {
    const c = Store.get('clients', S.route.id);
    const cur = App.current(c.id);
    const m = { type: 'trainCalc', sport: 1, min: 45, weight: cur.weight || 70, kcal: 0 };
    m.kcal = NT.SPORTS[m.sport][1] * m.weight * (m.min / 60);
    App.openModal(m);
  };
  const tcRecalc = () => {
    const m = S.modals[S.modals.length - 1]; if (!m || m.type !== 'trainCalc') return;
    m.sport = +$('#tc-sport').value; m.min = NT.toNum($('#tc-min').value) || 0; m.weight = NT.toNum($('#tc-w').value) || 0;
    m.kcal = NT.SPORTS[m.sport][1] * m.weight * (m.min / 60);
    $('#tc-res').textContent = fmt(m.kcal) + ' kcal';
  };
  App.IN['tc-recalc'] = tcRecalc; App.CH['tc-recalc'] = tcRecalc;
  App.A['train-apply'] = () => {
    const m = S.modals[S.modals.length - 1];
    const v = Math.round(m.kcal / 10) * 10;
    setNeeds((n) => { n.trainingKcal = v; if (!n.trainingDays) n.trainingDays = 3; }, false);
    App.closeAll(); App.rerender();
    App.toast('Energie navíc nastavena na ' + fmt(v) + ' kcal');
  };

  // ------------------------------------------------------------ start
  App.init = async function () {
    App.render();
    try {
      if (App.Auth && App.Auth.isServer()) {
        await App.Auth.boot();          // přihlášení + načtení dat ze serveru (AI a ukládání souborů přes artefakt zde nejsou)
      } else {
        let claude = root.claude;
        await Store.init(claude);
        if (claude && typeof claude.use === 'function') {
          try { S.sample = await claude.use('sample'); } catch (e) { S.sample = null; }
          try { S.downloads = await claude.use('downloads'); } catch (e) { S.downloads = null; }
        }
      }
      App.rebuildCatalog();
      S.ready = true;
      const p = HASH_REV[(location.hash || '').slice(1)];
      S.route = { page: p || 'dashboard' };
    } catch (e) {
      console.error(e);
      S.loadError = (e && e.message) || 'Neznámá chyba';
    }
    if (S.loadError) {
      $('#app').innerHTML = '<div class="main"><div class="callout bad">' + ic('alert') + '<div><b>Data se nepodařilo načíst.</b><br>' + esc(S.loadError) + '<br><button class="btn" style="margin-top:8px" type="button" data-act="reload">Zkusit znovu</button></div></div></div>';
      return;
    }
    App.render();
  };
})(typeof window !== 'undefined' ? window : globalThis);
