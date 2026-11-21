/* Jídelníček – přihlášení a správa účtu. Aktivní jen v režimu „server“ (meta nt-mode=server);
   v samostatné verzi (artefakt) se nic z toho nezobrazí. */
(function (root) {
  'use strict';
  const NT = root.NT, App = NT.App, Store = NT.Store, S = App.S;
  const esc = NT.esc, ic = App.ic, $ = App.$;

  const Auth = (App.Auth = { user: null, layer: null, users: null, usersErr: '', usersLoading: false, lastCheck: 0 });
  Auth.isServer = () => { const m = document.querySelector('meta[name="nt-mode"]'); return !!(m && m.content === 'server'); };
  Auth.isAdmin = () => !!(Auth.user && Auth.user.role === 'admin');
  const nameOf = (u) => (u && (u.displayName || u.username)) || '';

  // ------------------------------------------------------------ přihlašovací vrstva
  function loginForm(o) {
    const fixed = o.fixedUser || '';
    return '<form class="login-card card" id="login-form" novalidate autocomplete="on">' +
      '<div class="login-brand"><span class="brand-mark">' + ic('food') + '</span><b class="head-font">Nutriční plánovač</b></div>' +
      '<div><h1>' + (fixed ? 'Přihlaste se znovu' : 'Přihlášení') + '</h1>' +
      '<p class="muted sm" style="margin-top:4px">' + esc(o.message || 'Zadejte uživatelské jméno a heslo.') + '</p></div>' +
      '<div id="lg-msg" role="alert" aria-live="assertive"></div>' +
      '<label class="f">Uživatelské jméno<input type="text" id="lg-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="100" value="' + esc(fixed) + '"' + (fixed ? ' readonly' : '') + ' required></label>' +
      '<label class="f">Heslo<input type="password" id="lg-pass" name="password" autocomplete="current-password" maxlength="200" required></label>' +
      '<button class="btn btn-primary" type="submit" id="lg-btn">Přihlásit se</button>' +
      '<p class="xs muted" id="lg-hint" aria-live="polite" style="min-height:1.4em"></p>' +
      (fixed ? '<button class="btn btn-ghost btn-sm" type="button" data-act="auth-switch">Přihlásit se jiným účtem (neuložené změny se zahodí)</button>' : '') +
      '</form>';
  }
  const setMsg = (t) => { const el = $('#lg-msg'); if (el) el.innerHTML = t ? '<div class="callout bad">' + ic('alert') + '<div>' + esc(t) + '</div></div>' : ''; };
  const setHint = (t) => { const el = $('#lg-hint'); if (el) el.textContent = t || ''; };
  const setBusy = (b) => { const el = $('#lg-btn'); if (el) { el.disabled = !!b; el.textContent = b ? 'Přihlašuji…' : 'Přihlásit se'; } };

  function loginError(e) {
    if (!e) return 'Přihlášení se nezdařilo.';
    if (e.status === 401) return 'Nesprávné uživatelské jméno nebo heslo.';
    if (e.status === 429) return e.message || 'Příliš mnoho pokusů. Zkuste to později.';
    if (e.status === 503 || e.code === 'db_unavailable') return 'Databáze se právě spouští. Zkuste to za chvíli znovu (může to trvat až minutu).';
    if (e.status === 502 || e.status === 504) return 'Server je dočasně nedostupný. Zkuste to za chvíli znovu.';
    if (e.status === 403) return 'Požadavek byl odmítnut. Obnovte stránku a zkuste to znovu.';
    return e.message || 'Přihlášení se nezdařilo.';
  }

  function closeLayer() {
    const el = $('#authlayer'); if (el) el.remove();
    ['app', 'modal'].forEach((id) => { const n = document.getElementById(id); if (n) n.inert = false; });
    document.body.style.overflow = S.modals && S.modals.length ? 'hidden' : '';
    Auth.layer = null;
  }

  /** Zobrazí přihlášení přes celou obrazovku. Vrací Promise s uživatelem po úspěšném přihlášení. */
  Auth.requireLogin = function (opts) {
    opts = opts || {};
    if (Auth.layer) return Auth.layer.promise;
    const L = { fixed: opts.fixedUser || '', busy: false, resolve: null };
    L.promise = new Promise((res) => { L.resolve = res; });
    Auth.layer = L;
    const el = document.createElement('div');
    el.className = 'auth-layer'; el.id = 'authlayer';
    el.innerHTML = loginForm(opts);
    document.body.appendChild(el);
    ['app', 'modal'].forEach((id) => { const n = document.getElementById(id); if (n) n.inert = true; });
    document.body.style.overflow = 'hidden';
    const f = $(L.fixed ? '#lg-pass' : '#lg-user'); if (f) f.focus();
    return L.promise;
  };

  Auth.submit = async function () {
    const L = Auth.layer;
    if (!L || L.busy) return;
    const u = L.fixed || (($('#lg-user') || {}).value || '').trim();
    const p = ($('#lg-pass') || {}).value || '';
    if (!u || !p) { setMsg('Zadejte uživatelské jméno i heslo.'); return; }
    L.busy = true; setBusy(true); setMsg('');
    const t = setTimeout(() => setHint('Databáze se po nečinnosti spouští, přihlášení může trvat až minutu…'), 4000);
    try {
      const r = await NT.apiCall('POST', '/api/auth/login', { username: u, password: p }, 130000);
      Auth.user = r.user; Auth.lastCheck = Date.now();
      closeLayer(); L.resolve(r.user);
    } catch (e) {
      setMsg(loginError(e));
      const pw = $('#lg-pass'); if (pw) { pw.value = ''; pw.focus(); }
    } finally { clearTimeout(t); L.busy = false; setBusy(false); setHint(''); }
  };
  document.addEventListener('submit', (e) => { if (e.target && e.target.id === 'login-form') { e.preventDefault(); Auth.submit(); } });

  /** Relace vypršela, zatímco jsou otevřená data: změny zůstanou ve frontě a uloží se po novém přihlášení. */
  Auth.onAuthLost = function () {
    if (Auth.layer || !Auth.isServer() || !Auth.user) return;
    const had = Store.pending && Store.pending.size;
    Auth.requireLogin({ fixedUser: Auth.user.username, message: 'Přihlášení vypršelo. ' + (had ? 'Neuložené změny zůstaly zachovány a po přihlášení se uloží.' : 'Přihlaste se prosím znovu.') })
      .then(async () => { if (Store.pending.size) { const ok = await Store.flush(); App.toast(ok ? 'Změny byly uloženy' : 'Uložení se nepodařilo', ok ? {} : { kind: 'bad' }); } });
  };
  Store.onStatus((st) => { if (st === 'auth') Auth.onAuthLost(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !Auth.isServer() || !S.ready || Auth.layer || Date.now() - Auth.lastCheck < 60000) return;
    Auth.lastCheck = Date.now();
    NT.apiCall('GET', '/api/auth/me').catch((e) => { if (e && e.status === 401) Auth.onAuthLost(); });
  });

  /** Zahájení práce v režimu server: ověří relaci, případně vyžádá přihlášení, a načte data. */
  Auth.boot = async function () {
    try { const r = await NT.apiCall('GET', '/api/auth/me'); Auth.user = r.user; Auth.lastCheck = Date.now(); }
    catch (e) {
      if (e && e.status === 401) await Auth.requireLogin({});
      else throw e;
    }
    await Store.initApi();
  };

  // ------------------------------------------------------------ odhlášení
  async function leave(path) {
    try { await NT.apiCall('POST', path); } catch (e) { /* cookie stejně smažeme přes /api/auth/logout níže */ }
    try { await NT.apiCall('POST', '/api/auth/logout'); } catch (e) { /* ignore */ }
    location.reload();
  }
  Object.assign(App.A, {
    reload: () => location.reload(),
    'auth-switch': () => leave('/api/auth/logout'),
    logout: async () => {
      if (Store.pending.size) {
        const ok = await Store.flush();
        if (!ok && !(await App.confirm({ title: 'Odhlásit se?', text: 'Některé změny se nepodařilo uložit a po odhlášení se ztratí.', ok: 'Odhlásit se i tak', danger: true }))) return;
      }
      leave('/api/auth/logout');
    },
    'logout-all': async () => {
      if (!(await App.confirm({ title: 'Odhlásit ze všech zařízení?', text: 'Všechna přihlášení k tomuto účtu skončí, včetně tohoto. Pak se přihlásíš znovu.', ok: 'Odhlásit všude' }))) return;
      if (Store.pending.size) await Store.flush();
      leave('/api/auth/logout-all');
    }
  });

  // ------------------------------------------------------------ postranní panel + nastavení
  Auth.sideHtml = function () {
    if (!Auth.isServer() || !Auth.user) return '';
    return '<div class="side-user"><span class="xs muted">Přihlášeno jako</span><b class="sm" title="' + esc(Auth.user.username) + '">' + esc(nameOf(Auth.user)) + '</b>' +
      '<button class="btn btn-sm" type="button" data-act="logout">Odhlásit se</button></div>';
  };

  Auth.cardsHtml = function () {
    if (!Auth.isServer() || !Auth.user) return '';
    let h = '<div class="card"><div class="card-h"><h2>Účet a zabezpečení</h2></div>' +
      '<p class="sm" style="margin-bottom:10px">Přihlášen: <b>' + esc(nameOf(Auth.user)) + '</b> <span class="muted">(' + esc(Auth.user.username) + (Auth.isAdmin() ? ', správce' : '') + ')</span></p>' +
      '<div class="row"><button class="btn" type="button" data-act="pw-open">' + ic('lock', 'ico-sm') + 'Změnit heslo</button>' +
      '<button class="btn" type="button" data-act="logout-all">Odhlásit ze všech zařízení</button></div>' +
      '<p class="xs muted" style="margin-top:8px">Po 8 hodinách se přihlášení samo ukončí. Při změně hesla se odhlásí všechna ostatní zařízení.</p></div>';
    if (Auth.isAdmin()) {
      h += '<div class="card"><div class="card-h"><h2>Uživatelé</h2><button class="btn btn-sm btn-primary" type="button" data-act="user-new">' + ic('plus', 'ico-sm') + 'Nový uživatel</button></div>' +
        '<p class="sm muted" style="margin-bottom:10px">Každý uživatel vidí jen svá vlastní data (klienty, jídelníčky, potraviny).</p><div id="admin-users">' + usersHtml() + '</div></div>';
    }
    return h;
  };

  function usersHtml() {
    if (Auth.usersErr) return '<div class="callout bad">' + ic('alert') + '<div>' + esc(Auth.usersErr) + '</div></div>';
    if (!Auth.users) return '<div class="muted sm"><span class="spin"></span> Načítám…</div>';
    return '<div class="stack-sm">' + Auth.users.map((u) => {
      const me = Auth.user && u.id === Auth.user.id;
      return '<div class="row user-row" style="gap:8px;flex-wrap:wrap;align-items:center"><div class="grow" style="min-width:0"><b>' + esc(u.displayName || u.username) + '</b> <span class="muted sm">' + esc(u.username) + '</span> ' +
        (u.role === 'admin' ? '<span class="badge accent">Správce</span> ' : '') + (u.disabled ? '<span class="badge">Zakázaný</span> ' : '') + (me ? '<span class="badge">Vy</span>' : '') +
        '<div class="xs muted">' + (u.lastLoginAt ? 'Poslední přihlášení: ' + esc(new Date(u.lastLoginAt).toLocaleString('cs-CZ')) : 'Zatím se nepřihlásil(a)') + '</div></div>' +
        '<button class="btn btn-sm" type="button" data-act="user-pw" data-id="' + esc(u.id) + '">Nové heslo</button>' +
        (me ? '' : '<button class="btn btn-sm" type="button" data-act="user-toggle" data-id="' + esc(u.id) + '">' + (u.disabled ? 'Povolit' : 'Zakázat') + '</button>') + '</div>';
    }).join('') + '</div>';
  }
  function paintUsers() { const el = $('#admin-users'); if (el) el.innerHTML = usersHtml(); }
  Auth.loadUsers = async function (force) {
    if (!Auth.isAdmin() || Auth.usersLoading || (Auth.users && !force)) return;
    Auth.usersLoading = true; Auth.usersErr = '';
    try { Auth.users = (await NT.apiCall('GET', '/api/admin/users')).users || []; }
    catch (e) { Auth.usersErr = 'Seznam uživatelů se nepodařilo načíst: ' + e.message; }
    finally { Auth.usersLoading = false; paintUsers(); }
  };
  App.hooks.push(() => { if (S.route.page === 'settings' && Auth.isAdmin()) Auth.loadUsers(); });

  // ------------------------------------------------------------ pomocné: hesla a modální okna
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';   // bez zaměnitelných znaků
  Auth.genPassword = function (n) {
    n = n || 16;
    let out = '';
    while (out.length < n) {
      const b = new Uint8Array(32); root.crypto.getRandomValues(b);
      for (const x of b) { if (x < 224 && out.length < n) out += ALPHA[x % ALPHA.length]; }   // 224 = 4×56, bez zkreslení
    }
    return out;
  };
  const mmsg = (t) => { const el = $('#m-msg'); if (el) el.innerHTML = t ? '<div class="callout bad">' + ic('alert') + '<div>' + esc(t) + '</div></div>' : ''; };
  const mbusy = (b) => { const el = $('#m-save'); if (el) el.disabled = !!b; };

  App.modals.pwChange = () => ({
    title: 'Změna hesla',
    body: '<div class="stack-sm"><div id="m-msg" role="alert"></div>' +
      '<label class="f">Současné heslo<input type="password" id="pw-cur" autocomplete="current-password" maxlength="200"></label>' +
      '<label class="f">Nové heslo<input type="password" id="pw-new" autocomplete="new-password" maxlength="200"><span class="hint">Alespoň 12 znaků. Nejlépe několik slov nebo vygenerované heslo z password manageru.</span></label>' +
      '<label class="f">Nové heslo znovu<input type="password" id="pw-rep" autocomplete="new-password" maxlength="200" data-enter="pw-save"></label></div>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" id="m-save" data-act="pw-save">Změnit heslo</button>',
    focus: '#pw-cur'
  });
  App.A['pw-open'] = () => App.openModal({ type: 'pwChange' });
  App.A['pw-save'] = async () => {
    const cur = $('#pw-cur').value, nw = $('#pw-new').value, rep = $('#pw-rep').value;
    if (!cur || !nw) return mmsg('Vyplňte současné i nové heslo.');
    if (nw !== rep) return mmsg('Nová hesla se neshodují.');
    if (nw.length < 12) return mmsg('Nové heslo musí mít alespoň 12 znaků.');
    mbusy(true); mmsg('');
    try {
      await NT.apiCall('POST', '/api/auth/password', { current: cur, next: nw }, 130000);
      App.closeModal(); App.toast('Heslo bylo změněno, ostatní zařízení jsou odhlášena');
    } catch (e) { mmsg(e.status === 401 ? 'Přihlášení vypršelo, přihlaste se znovu.' : e.message); if (e.status === 401) { App.closeModal(); Auth.onAuthLost(); } }
    finally { mbusy(false); }
  };

  const roleSel = '<label class="f">Role<select id="un-role"><option value="user">Uživatel (vidí jen svá data)</option><option value="admin">Správce (spravuje uživatele)</option></select></label>';
  const passField = (id) => '<label class="f">Heslo<span class="row" style="gap:6px;flex-wrap:nowrap"><input type="text" id="' + id + '" autocomplete="off" spellcheck="false" maxlength="200" class="grow" style="min-width:0"><button class="btn btn-sm" type="button" data-act="gen-pass" data-target="' + id + '">Vygenerovat</button></span><span class="hint">Alespoň 12 znaků. Heslo předejte uživateli bezpečným způsobem; ten si ho může hned změnit.</span></label>';
  App.modals.userNew = () => ({
    title: 'Nový uživatel',
    body: '<div class="stack-sm"><div id="m-msg" role="alert"></div>' +
      '<label class="f">Uživatelské jméno<input type="text" id="un-name" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="100"><span class="hint">3–100 znaků: malá písmena, číslice a . _ - @ +</span></label>' +
      '<label class="f">Zobrazované jméno<input type="text" id="un-disp" autocomplete="off" maxlength="100"></label>' + roleSel + passField('un-pass') + '</div>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" id="m-save" data-act="user-create">Vytvořit</button>',
    focus: '#un-name'
  });
  App.A['gen-pass'] = (t) => { const el = $('#' + t.dataset.target); if (el) { el.value = Auth.genPassword(16); el.focus(); el.select(); } };
  App.A['user-new'] = () => App.openModal({ type: 'userNew' });
  App.A['user-create'] = async () => {
    const username = $('#un-name').value.trim(), displayName = $('#un-disp').value.trim(), password = $('#un-pass').value, role = $('#un-role').value;
    if (!username || !password) return mmsg('Vyplňte uživatelské jméno a heslo.');
    mbusy(true); mmsg('');
    try {
      await NT.apiCall('POST', '/api/admin/users', { username, displayName: displayName || username, password, role }, 130000);
      App.closeModal(); App.toast('Uživatel byl vytvořen'); Auth.users = null; Auth.loadUsers(true);
    } catch (e) { mmsg(e.message); } finally { mbusy(false); }
  };

  App.modals.userPw = (m) => ({
    title: 'Nové heslo pro ' + m.name,
    body: '<div class="stack-sm"><div id="m-msg" role="alert"></div>' + passField('up-pass') + '<p class="xs muted">Uživatel bude ze všech zařízení odhlášen.</p></div>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" id="m-save" data-act="user-pw-save" data-id="' + esc(m.id) + '">Nastavit heslo</button>',
    focus: '#up-pass'
  });
  App.A['user-pw'] = (t) => { const u = (Auth.users || []).find((x) => x.id === t.dataset.id); if (u) App.openModal({ type: 'userPw', id: u.id, name: u.displayName || u.username }); };
  App.A['user-pw-save'] = async (t) => {
    const password = $('#up-pass').value;
    if (password.length < 12) return mmsg('Heslo musí mít alespoň 12 znaků.');
    mbusy(true); mmsg('');
    try { await NT.apiCall('POST', '/api/admin/users/' + encodeURIComponent(t.dataset.id) + '/password', { password }, 130000); App.closeModal(); App.toast('Heslo bylo nastaveno'); }
    catch (e) { mmsg(e.message); } finally { mbusy(false); }
  };
  App.A['user-toggle'] = async (t) => {
    const u = (Auth.users || []).find((x) => x.id === t.dataset.id); if (!u) return;
    const dis = !u.disabled;
    if (!(await App.confirm({ title: dis ? 'Zakázat uživatele?' : 'Povolit uživatele?', text: dis ? (u.username + ' se nebude moci přihlásit a stávající přihlášení skončí. Data zůstanou zachována.') : (u.username + ' se bude moci znovu přihlásit.'), ok: dis ? 'Zakázat' : 'Povolit', danger: dis }))) return;
    try { await NT.apiCall('POST', '/api/admin/users/' + encodeURIComponent(u.id) + '/' + (dis ? 'disable' : 'enable')); Auth.loadUsers(true); }
    catch (e) { App.toast(e.message, { kind: 'bad' }); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
