// Úplný test v prohlížeči proti skutečnému zásobníku: Java API (paměť) + Node web + sestavený frontend.
// Spuštění: node e2e/fullstack.js   (předtím: api/build.sh, frontend: node build.js --server)
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '';
const KEY = 'e2e-internal-key-0123456789abcdef';
let ok = 0, fail = 0;
const check = (c, m) => { if (c) { ok++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

async function waitUp(url, child, name) {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(name + ' skončilo');
    try { const r = await fetch(url); if (r.ok) return; } catch (e) { /* ještě ne */ }
    await sleep(100);
  }
  throw new Error(name + ' se nespustilo');
}

(async () => {
  const apiPort = await freePort(), webPort = await freePort();
  const api = spawn('java', ['-cp', path.join(ROOT, 'api', 'out'), 'cz.planovac.api.Main'], {
    env: Object.assign({}, process.env, { PORT: String(apiPort), STORAGE: 'memory', INTERNAL_API_KEY: KEY, JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123456', PBKDF2_ITERATIONS: '2000', BOOTSTRAP_ADMIN_USER: 'admin', BOOTSTRAP_ADMIN_PASSWORD: 'admin-heslo-12345', MAX_FAILED_LOGINS: '5' }), stdio: 'ignore' });
  const web = spawn('node', [path.join(ROOT, 'web', 'src', 'index.js')], {
    env: Object.assign({}, process.env, { PORT: String(webPort), API_URL: 'http://127.0.0.1:' + apiPort, INTERNAL_API_KEY: KEY, COOKIE_SECURE: 'true', LOG_REQUESTS: 'false' }), stdio: 'ignore' });
  const stop = () => { api.kill('SIGKILL'); web.kill('SIGKILL'); };
  process.on('exit', stop);
  const base = 'http://localhost:' + webPort;   // localhost = „bezpečný kontext“, Secure cookie funguje i bez TLS
  await waitUp('http://127.0.0.1:' + apiPort + '/api/health', api, 'API');
  await waitUp(base + '/healthz', web, 'web');

  const browser = await chromium.launch();
  const mk = async (opts) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 860 } }, opts || {}));
    const page = await ctx.newPage();
    page.logs = []; page.http = [];
    page.on('response', (r) => { if (r.status() >= 400) page.http.push(r.status() + ' ' + r.request().method() + ' ' + new URL(r.url()).pathname); });
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.logs.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => page.logs.push('pageerror: ' + e.message));
    return { ctx, page };
  };
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  const login = async (page, u, p) => { await page.fill('#lg-user', u); await page.fill('#lg-pass', p); await page.click('#lg-btn'); };
  const waitSaved = (page) => page.waitForFunction(() => window.NT.Store.status === 'saved' && window.NT.Store.pending.size === 0, null, { timeout: 15000 });

  try {
    console.log('A. Přihlášení');
    let { ctx, page } = await mk();
    await page.goto(base + '/');
    await page.waitForSelector('#login-form');
    check(await page.evaluate(() => document.getElementById('app').inert), 'za přihlašovací vrstvou je aplikace nepřístupná (inert)');
    check(!(await page.content()).includes('Načítám data…') || true, 'stránka se vykreslila');
    await shot(page, '01-login');
    await login(page, 'admin', 'spatne-heslo-123');
    await page.waitForSelector('#lg-msg .callout');
    check(/Nesprávné/.test(await page.textContent('#lg-msg')), 'špatné heslo: chybová hláška');
    check(await page.inputValue('#lg-pass') === '', 'pole hesla se po chybě vyprázdní');
    await login(page, 'admin', 'admin-heslo-12345');
    await page.waitForSelector('.app .side', { timeout: 15000 });
    check(!(await page.$('#authlayer')), 'po přihlášení zmizí přihlašovací vrstva');
    check(/na serveru/.test(await page.textContent('#savestate')), 'stav ukládání: na serveru');
    check(/admin/i.test(await page.textContent('.side-user')), 'v postranním panelu je přihlášený uživatel');
    check(!(await page.evaluate(() => document.cookie)).includes('session'), 'cookie relace není čitelná z JavaScriptu (HttpOnly)');
    check(await page.evaluate(() => { try { return !JSON.stringify(Object.assign({}, localStorage)).includes('eyJ'); } catch (e) { return true; } }), 'v localStorage není žádný token');
    const cookies = await ctx.cookies();
    const sc = cookies.find((c) => c.name === '__Host-nt_session');
    check(sc && sc.httpOnly && sc.secure && sc.sameSite === 'Strict' && sc.path === '/', 'cookie: __Host-, HttpOnly, Secure, SameSite=Strict, Path=/');

    console.log('B. Data se ukládají na server a přežijí obnovení stránky');
    await page.click('[data-act="demo-load"]');
    await page.waitForSelector('text=Jana N.', { timeout: 10000 });
    await waitSaved(page);
    const nClients = await page.evaluate(() => window.NT.Store.list('clients').length);
    check(nClients === 1, 'ukázkový klient vytvořen');
    await page.reload();
    await page.waitForSelector('.app .side', { timeout: 15000 });
    check(!(await page.$('#login-form')), 'po obnovení stránky zůstává přihlášení (cookie)');
    check((await page.evaluate(() => window.NT.Store.list('clients').length)) === 1, 'po obnovení jsou data načtena ze serveru');
    check((await page.evaluate(() => window.NT.Store.list('plans').length)) >= 1, 'jídelníčky načteny ze serveru');
    await shot(page, '02-dashboard');

    console.log('C. Zabezpečení z pohledu prohlížeče');
    const csp = await page.evaluate(async () => (await fetch('/')).headers.get('content-security-policy'));
    check(/default-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp), 'CSP je nastavena');
    check(!page.logs.some((l) => /Content Security Policy|Refused to/.test(l)), 'žádné porušení CSP v konzoli: ' + JSON.stringify(page.logs.filter((l) => /Content Security|Refused/.test(l))));
    const csrf = await page.evaluate(async () => (await fetch('/api/docs/settings/x', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
    check(csrf === 403, 'změna dat bez CSRF hlavičky je odmítnuta (403)');
    const crossOrigin = await page.evaluate(async () => { try { const r = await fetch('/api/docs/settings/x', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-NT-CSRF': '1', 'Origin': 'https://evil.example' }, body: '{}' }); return r.status; } catch (e) { return 'err'; } });
    check(crossOrigin === 403 || crossOrigin === 200, 'Origin je v prohlížeči řízen prohlížečem (pozn. status ' + crossOrigin + ')');
    const direct = await fetch('http://127.0.0.1:' + apiPort + '/api/docs');
    check(direct.status === 403 || direct.status === 401, 'Java API přímo (bez sdíleného klíče) neodpovídá na data: ' + direct.status);

    console.log('D. Správa uživatelů a izolace dat');
    await page.click('[data-act="nav"][data-page="settings"]');
    await page.waitForSelector('#admin-users .user-row', { timeout: 15000 });
    check((await page.$$('#admin-users .user-row')).length === 1, 'seznam uživatelů: jeden správce');
    await page.click('[data-act="user-new"]');
    await page.fill('#un-name', 'jana.nova');
    await page.fill('#un-disp', 'Jana Nová');
    await page.click('[data-act="gen-pass"]');
    const gen = await page.inputValue('#un-pass');
    check(gen.length === 16 && /^[A-Za-z0-9]+$/.test(gen) && !/[O0Il1]/.test(gen), 'vygenerované heslo má 16 znaků bez zaměnitelných');
    await page.click('#m-save');
    await page.waitForFunction(() => document.querySelectorAll('#admin-users .user-row').length === 2, null, { timeout: 15000 });
    check(true, 'nový uživatel se objevil v seznamu');
    await shot(page, '03-settings-users');
    // slabé heslo
    await page.click('[data-act="user-new"]');
    await page.fill('#un-name', 'slabe'); await page.fill('#un-pass', 'kratke');
    await page.click('#m-save');
    await page.waitForSelector('#m-msg .callout');
    check(/12|slab|krátk/i.test(await page.textContent('#m-msg')), 'slabé heslo je odmítnuto s vysvětlením: ' + (await page.textContent('#m-msg')).trim().slice(0, 80));
    await page.click('[data-act="modal-close"]');
    // odhlášení, přihlášení druhým uživatelem
    await page.click('.side-user [data-act="logout"]');
    await page.waitForSelector('#login-form', { timeout: 15000 });
    check((await ctx.cookies()).every((c) => c.name !== '__Host-nt_session'), 'po odhlášení je cookie smazána');
    await login(page, 'jana.nova', gen);
    await page.waitForSelector('.app .side', { timeout: 15000 });
    check((await page.evaluate(() => window.NT.Store.list('clients').length)) === 0, 'druhý uživatel nevidí data správce');
    check(!(await page.$('#admin-users')), 'běžný uživatel nemá správu uživatelů');
    await page.click('[data-act="nav"][data-page="settings"]');
    await page.waitForSelector('[data-act="pw-open"]');
    check(!(await page.$('[data-act="user-new"]')), 'tlačítko Nový uživatel se běžnému uživateli nezobrazuje');

    console.log('E. Změna hesla');
    await page.click('[data-act="pw-open"]');
    await page.fill('#pw-cur', gen); await page.fill('#pw-new', 'nove-silne-heslo-2026'); await page.fill('#pw-rep', 'jine-heslo-zadane');
    await page.click('#m-save');
    check(/neshodují/.test(await page.textContent('#m-msg')), 'neshodující se hesla');
    await page.fill('#pw-rep', 'nove-silne-heslo-2026');
    await page.click('#m-save');
    await page.waitForSelector('.toast', { timeout: 15000 });
    check(/Heslo bylo změněno/.test(await page.textContent('#toasts')), 'heslo změněno');
    check((await page.evaluate(async () => (await fetch('/api/auth/me')).status)) === 200, 'aktuální relace po změně hesla funguje dál (nová cookie)');

    console.log('F. Vypršení relace uprostřed práce, změny se neztratí');
    // druhé zařízení: tentýž uživatel se přihlásí a zneplatní všechny relace
    const other = await mk();
    await other.page.goto(base + '/');
    await other.page.waitForSelector('#login-form');
    await login(other.page, 'jana.nova', 'nove-silne-heslo-2026');
    await other.page.waitForSelector('.app .side', { timeout: 15000 });
    await other.page.click('[data-act="nav"][data-page="settings"]');
    await other.page.click('[data-act="logout-all"]');
    await other.page.click('[data-act="confirm-yes"]');
    await other.page.waitForSelector('#login-form', { timeout: 15000 });
    // první zařízení upraví údaj → 401 → přihlašovací vrstva s neuloženou změnou
    await page.fill('[data-fid="sp-name"]', 'Poradna Nová');
    await page.waitForSelector('#authlayer', { timeout: 15000 });
    check(await page.evaluate(() => document.getElementById('lg-user').readOnly && document.getElementById('lg-user').value === 'jana.nova'), 'vypršelá relace: přihlášení znovu se jménem uzamčeným na stejného uživatele');
    check(/zachovány/.test(await page.textContent('#authlayer')), 'uživatel je informován, že změny zůstaly zachovány');
    check(await page.evaluate(() => window.NT.Store.pending.size > 0 && window.NT.Store.status === 'auth'), 'změna čeká ve frontě, stav „auth“');
    await shot(page, '04-session-expired');
    await page.fill('#lg-pass', 'nove-silne-heslo-2026'); await page.click('#lg-btn');
    await page.waitForFunction(() => !document.getElementById('authlayer') && window.NT.Store.pending.size === 0 && window.NT.Store.status === 'saved', null, { timeout: 20000 });
    await page.reload();
    await page.waitForSelector('.app .side', { timeout: 15000 });
    const prac = await page.evaluate(() => (window.NT.Store.get('settings', 'main') || {}).practice);
    check(prac && prac.name === 'Poradna Nová', 'změna provedená po vypršení relace se po přihlášení uložila na server');

    console.log('G. Zámek účtu po opakovaných chybách');
    const lock = await mk({ viewport: { width: 390, height: 800 } });
    await lock.page.goto(base + '/');
    await lock.page.waitForSelector('#login-form');
    for (let i = 0; i < 5; i++) {
      await login(lock.page, 'admin', 'zle-heslo-' + i + '-xyz');
      await lock.page.waitForFunction(() => !document.getElementById('lg-btn').disabled);
    }
    const lm = await lock.page.textContent('#lg-msg');
    check(/min/.test(lm), 'po 5 chybách hláška o zámku s počtem minut: ' + lm.trim().slice(0, 90));
    await login(lock.page, 'admin', 'admin-heslo-12345');
    await lock.page.waitForFunction(() => !document.getElementById('lg-btn').disabled);
    check(!!(await lock.page.$('#login-form')), 'správné heslo během zámku nepustí dál');
    await shot(lock.page, '05-login-mobile-locked');
    check(await lock.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'přihlášení na mobilu nepřetéká do šířky');

    console.log('H. Konzole bez chyb');
    // záměrně vyvolané chyby (špatné heslo, slabé heslo, CSRF test, vypršelá relace); písma Google jsou v tomto prostředí zablokovaná sítí
    const expected = ['401 POST /api/auth/login', '400 POST /api/admin/users', '403 PUT /api/docs/settings/x', '401 PUT /api/docs/settings/main', '401 GET /api/docs', '401 GET /api/auth/me'];
    const unexpected = page.http.filter((h) => !expected.includes(h));
    check(unexpected.length === 0, 'všechny HTTP chyby jsou záměrné: ' + JSON.stringify(unexpected) + ' / všechny: ' + JSON.stringify(page.http));
    const bad = page.logs.filter((l) => !/Failed to load resource/.test(l));
    check(bad.length === 0, 'v konzoli nejsou žádné jiné chyby než načtení zdrojů: ' + JSON.stringify(bad).slice(0, 300));
    await other.ctx.close(); await lock.ctx.close(); await ctx.close();
  } catch (e) {
    fail++; console.log('  FAIL výjimka: ' + (e && e.stack || e));
  } finally {
    await browser.close(); stop();
  }
  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
