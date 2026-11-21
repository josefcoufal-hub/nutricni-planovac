/* Jídelníček – aplikace, část 4: sledování, výstup pro klienta, nastavení, ukázková data. */
(function (root) {
  'use strict';
  const NT = root.NT, App = NT.App, Store = NT.Store, S = App.S;
  const esc = NT.esc, fmt = NT.fmt, ic = App.ic, $ = App.$, $$ = App.$$;
  const top = () => S.modals[S.modals.length - 1];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const shortD = (iso) => (iso ? +iso.slice(8, 10) + '. ' + +iso.slice(5, 7) + '.' : '');
  const numTxt = (v) => (v == null ? '' : String(v).replace('.', ','));
  const PDF_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.11/pdfmake.min.js';
  const PDF_FONTS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.11/vfs_fonts.js';

  // ------------------------------------------------------------ motiv
  const THEME_KEY = 'nutri-theme';
  App.getTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } };
  App.applyTheme = function (t) {
    const el = document.documentElement;
    if (t === 'light' || t === 'dark') el.setAttribute('data-theme', t); else el.removeAttribute('data-theme');
  };
  App.applyTheme(App.getTheme());

  // ------------------------------------------------------------ sledování
  const mf = () => S.ui.mf || (S.ui.mf = {});
  const df = () => S.ui.df || (S.ui.df = {});
  const range = () => S.ui.trackRange || 'all';

  const scoreTxt = (v) => (v == null ? '–' : fmt(v, 1) + ' / 5');
  App.trackHtml = function (c) {
    const tr = App.track(c.id);
    const sum = NT.trackSummary(c, tr, NT.today());
    const m = mf(), d = df();
    let h = '';
    // souhrn
    const last = sum.last, first = sum.first;
    h += '<div class="grid g4" style="margin-bottom:16px">' +
      '<div class="stat"><span class="v">' + (last ? fmt(last.weight, 1) + ' kg' : '–') + '</span><span class="l">aktuální hmotnost' + (last ? ' (' + NT.fmtDate(last.date) + ')' : '') + '</span></div>' +
      '<div class="stat"><span class="v">' + (sum.change != null && first !== last ? (sum.change > 0 ? '+' : sum.change < 0 ? '−' : '') + fmt(Math.abs(sum.change), 1) + ' kg' : '–') + '</span><span class="l">změna od prvního měření' + (first && first !== last ? ' (' + NT.fmtDate(first.date) + ')' : '') + '</span></div>' +
      '<div class="stat"><span class="v">' + (sum.rate != null ? (sum.rate > 0 ? '+' : sum.rate < 0 ? '−' : '') + fmt(Math.abs(sum.rate), 2) + ' kg' : '–') + '</span><span class="l">tempo za týden (posledních 28 dní' + (sum.rate != null && last ? ', ' + (sum.rate < 0 ? '−' : '+') + fmt(Math.abs(sum.rate / last.weight * 100), 1) + ' % hm.' : '') + ')</span></div>' +
      '<div class="stat"><span class="v">' + (sum.adherence != null ? fmt(sum.adherence) + ' %' : '–') + '</span><span class="l">plnění jídelníčku (14 dní' + (sum.recentCount ? ', ' + sum.recentCount + ' ' + NT.plural(sum.recentCount, 'záznam', 'záznamy', 'záznamů') : '') + ')</span></div></div>';
    if (sum.recentCount) h += '<p class="sm muted" style="margin:-6px 0 14px">Průměr za 14 dní: energie ' + scoreTxt(sum.energy) + ' · hlad ' + scoreTxt(sum.hunger) + ' · spánek ' + scoreTxt(sum.sleep) + '</p>';
    if (sum.concerns.length) h += '<div class="stack-sm" style="margin-bottom:16px">' + sum.concerns.map((x) => App.callout(x.level === 'warn' ? 'warn' : 'info', esc(x.text))).join('') + '</div>';
    // graf
    h += '<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>Vývoj hmotnosti</h2><div class="seg" role="group" aria-label="Období">' +
      [['all', 'Vše'], ['90', '90 dní'], ['30', '30 dní']].map(([k, l]) => '<button type="button" data-act="track-range" data-r="' + k + '" aria-pressed="' + (range() === k) + '">' + l + '</button>').join('') + '</div></div>' + chartHtml(sum) + '</div>';
    // formuláře
    h += '<div class="grid g2" style="align-items:start;margin-bottom:16px"><div class="card" id="mf-card"><div class="card-h"><h2>Zapsat měření</h2>' + (m.id ? '<span class="badge info">Úprava záznamu</span>' : '') + '</div><div class="form-grid">' +
      '<label class="f">Datum<input type="date" id="mf-date" value="' + esc(m.date || NT.today()) + '" max="' + NT.today() + '"></label>' +
      '<label class="f">Hmotnost (kg)<input type="text" inputmode="decimal" id="mf-w" value="' + numTxt(m.weightKg) + '" placeholder="např. 72,4"></label>' +
      '<label class="f">Tělesný tuk (%)<input type="text" inputmode="decimal" id="mf-bf" value="' + numTxt(m.bf) + '" placeholder="volitelné"></label>' +
      '<label class="f">Obvod pasu (cm)<input type="text" inputmode="decimal" id="mf-waist" value="' + numTxt(m.waistCm) + '" placeholder="volitelné"></label>' +
      '<label class="f span-all">Poznámka<input type="text" id="mf-note" value="' + esc(m.note || '') + '" placeholder="např. ráno nalačno, po dovolené"></label></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn btn-primary" type="button" data-act="mf-save">' + ic('save', 'ico-sm') + 'Uložit měření</button>' + (m.id ? '<button class="btn" type="button" data-act="mf-cancel">Zrušit úpravu</button>' : '') + '</div><p class="xs muted" style="margin-top:8px">Při zápisu do dne, který už záznam má, se doplní nové hodnoty. Nejnovější hmotnost se použije pro výpočet potřeb.</p></div>' +
      '<div class="card" id="df-card"><div class="card-h"><h2>Zapsat deník</h2>' + (d.id ? '<span class="badge info">Úprava záznamu</span>' : '') + '</div><div class="form-grid">' +
      '<label class="f">Datum<input type="date" id="df-date" value="' + esc(d.date || NT.today()) + '" max="' + NT.today() + '"></label>' +
      '<label class="f">Plnění jídelníčku (%)<input type="number" id="df-adh" min="0" max="100" step="5" inputmode="numeric" value="' + (d.adherence == null ? '' : d.adherence) + '" placeholder="0–100"></label>' +
      ['energy:Energie (1 nízká – 5 vysoká)', 'hunger:Hlad (1 žádný – 5 silný)', 'sleep:Spánek (1 špatný – 5 výborný)'].map((s) => { const [k, l] = s.split(':'); return '<label class="f">' + l + '<select id="df-' + k + '"><option value="">–</option>' + [1, 2, 3, 4, 5].map((n) => '<option value="' + n + '"' + (d[k] === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>'; }).join('') +
      '<label class="f span-all">Poznámka<input type="text" id="df-note" value="' + esc(d.note || '') + '" placeholder="co se dařilo, co ne"></label></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn btn-primary" type="button" data-act="df-save">' + ic('save', 'ico-sm') + 'Uložit deník</button>' + (d.id ? '<button class="btn" type="button" data-act="df-cancel">Zrušit úpravu</button>' : '') + '</div></div></div>';
    // AI shrnutí
    if (App.aiAvailable()) h += '<div class="card" style="margin-bottom:16px"><div class="row"><div class="grow"><h3>Shrnutí před konzultací</h3><p class="sm muted">AI z měření a deníku připraví podklad k nadcházející schůzce. Je to jen podnět, hodnocení je na tobě.</p></div><button class="btn btn-ai" type="button" data-act="track-ai">' + ic('sparkle') + 'Připravit shrnutí</button></div></div>';
    // záznamy
    const ms = NT.sortedMeasures(tr.measures).slice().reverse();
    const dy = (tr.diary || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const lim = S.ui.trackAll ? 9999 : 8;
    const prev = (i) => { const arr = ms.slice(i + 1).find((x) => x.weightKg > 0); return arr ? arr.weightKg : null; };
    h += '<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h2>Měření</h2></div>' + (ms.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Datum</th><th class="r">Hmotnost</th><th class="r">Změna</th><th class="r">Tuk</th><th class="r">Pas</th><th></th></tr></thead><tbody>' +
      ms.slice(0, lim).map((x, i) => { const p = x.weightKg > 0 ? prev(i) : null; const dlt = x.weightKg > 0 && p != null ? x.weightKg - p : null;
        return '<tr><td style="white-space:nowrap">' + NT.fmtDate(x.date) + (x.note ? '<br><span class="xs muted">' + esc(x.note) + '</span>' : '') + '</td><td class="r">' + (x.weightKg ? fmt(x.weightKg, 1) + ' kg' : '–') + '</td><td class="r muted">' + (dlt != null ? (dlt > 0 ? '+' : dlt < 0 ? '−' : '') + fmt(Math.abs(dlt), 1) : '') + '</td><td class="r">' + (x.bf ? fmt(x.bf, 1) + ' %' : '–') + '</td><td class="r">' + (x.waistCm ? fmt(x.waistCm, 1) + ' cm' : '–') + '</td><td class="r"><span class="row nw" style="gap:0;justify-content:flex-end"><button class="btn btn-ghost btn-icon btn-sm" type="button" data-act="mf-edit" data-id="' + x.id + '" aria-label="Upravit měření">' + ic('edit', 'ico-sm') + '</button><button class="btn btn-ghost btn-icon btn-sm btn-danger" type="button" data-act="mf-del" data-id="' + x.id + '" aria-label="Smazat měření">' + ic('trash', 'ico-sm') + '</button></span></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">Zatím žádné měření.</p>') + '</div>' +
      '<div class="card"><div class="card-h"><h2>Deník</h2></div>' + (dy.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Datum</th><th class="r">Plnění</th><th class="r">Energie</th><th class="r">Hlad</th><th class="r">Spánek</th><th></th></tr></thead><tbody>' +
      dy.slice(0, lim).map((x) => '<tr><td style="white-space:nowrap">' + NT.fmtDate(x.date) + (x.note ? '<br><span class="xs muted">' + esc(x.note) + '</span>' : '') + '</td><td class="r">' + (x.adherence != null ? x.adherence + ' %' : '–') + '</td><td class="r">' + (x.energy || '–') + '</td><td class="r">' + (x.hunger || '–') + '</td><td class="r">' + (x.sleep || '–') + '</td><td class="r"><span class="row nw" style="gap:0;justify-content:flex-end"><button class="btn btn-ghost btn-icon btn-sm" type="button" data-act="df-edit" data-id="' + x.id + '" aria-label="Upravit záznam deníku">' + ic('edit', 'ico-sm') + '</button><button class="btn btn-ghost btn-icon btn-sm btn-danger" type="button" data-act="df-del" data-id="' + x.id + '" aria-label="Smazat záznam deníku">' + ic('trash', 'ico-sm') + '</button></span></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">Zatím žádné záznamy.</p>') + '</div></div>';
    if (ms.length > 8 || dy.length > 8) h += '<div class="row" style="margin-top:10px"><button class="btn btn-sm" type="button" data-act="track-all">' + (S.ui.trackAll ? 'Zobrazit méně' : 'Zobrazit vše') + '</button></div>';
    return h;
  };
  App.A['track-range'] = (t) => { S.ui.trackRange = t.dataset.r; App.rerender(); };
  App.A['track-all'] = () => { S.ui.trackAll = !S.ui.trackAll; App.rerender(); };

  // ---- graf (SVG)
  const CW = 720, CH = 280, PL = 46, PR = 14, PT = 14, PB = 30;
  function chartData(sum) {
    let ser = sum.series;
    const r = range();
    if (r !== 'all' && ser.length) { const lim = +r; const lastD = ser[ser.length - 1].date; ser = ser.filter((p) => NT.daysBetween(p.date, lastD) <= lim); }
    return ser;
  }
  function chartHtml(sum) {
    const ser = chartData(sum);
    S.ui.chartSeries = ser;
    if (!ser.length) return '<div class="empty" style="padding:28px"><p>Graf se zobrazí po prvním měření hmotnosti.</p></div>';
    const vals = ser.flatMap((p) => [p.weight, p.trend]);
    let lo = Math.floor((Math.min.apply(null, vals) - 0.4) * 2) / 2, hi = Math.ceil((Math.max.apply(null, vals) + 0.4) * 2) / 2;
    if (hi - lo < 2) { const mid = (hi + lo) / 2; lo = mid - 1; hi = mid + 1; }
    const t0 = ser[0].date, span = Math.max(1, NT.daysBetween(t0, ser[ser.length - 1].date));
    const X = (p) => PL + (ser.length === 1 ? (CW - PL - PR) / 2 : NT.daysBetween(t0, p.date) / span * (CW - PL - PR));
    const Y = (v) => PT + (hi - v) / (hi - lo) * (CH - PT - PB);
    S.ui.chartGeom = { X: ser.map(X), Y: ser.map((p) => Y(p.weight)), YT: ser.map((p) => Y(p.trend)) };
    let svg = '<svg class="chart" viewBox="0 0 ' + CW + ' ' + CH + '" role="img" aria-label="Graf hmotnosti: ' + ser.length + ' měření, od ' + fmt(ser[0].weight, 1) + ' kg do ' + fmt(ser[ser.length - 1].weight, 1) + ' kg">';
    const nT = 4;
    for (let i = 0; i <= nT; i++) { const v = lo + (hi - lo) * i / nT; svg += '<line class="' + (i === 0 ? 'axis-l' : 'grid-l') + '" x1="' + PL + '" x2="' + (CW - PR) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (PL - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + fmt(v, 1) + '</text>'; }
    const nx = Math.min(5, ser.length);
    for (let i = 0; i < nx; i++) { const idx = nx === 1 ? 0 : Math.round(i * (ser.length - 1) / (nx - 1)); svg += '<text x="' + X(ser[idx]).toFixed(1) + '" y="' + (CH - 8) + '" text-anchor="' + (i === 0 && nx > 1 ? 'start' : i === nx - 1 && nx > 1 ? 'end' : 'middle') + '">' + shortD(ser[idx].date) + '</text>'; }
    if (ser.length > 1) svg += '<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + ser.map((p) => X(p).toFixed(1) + ',' + Y(p.trend).toFixed(1)).join(' ') + '"/>';
    ser.forEach((p) => { svg += '<circle cx="' + X(p).toFixed(1) + '" cy="' + Y(p.weight).toFixed(1) + '" r="4" fill="var(--ink-3)" stroke="var(--surface)" stroke-width="2"/>'; });
    svg += '<line id="ch-cross" class="axis-l" y1="' + PT + '" y2="' + (CH - PB) + '" x1="0" x2="0" style="display:none"/><rect id="ch-hit" x="' + PL + '" y="' + PT + '" width="' + (CW - PL - PR) + '" height="' + (CH - PT - PB) + '" fill="transparent" style="cursor:crosshair;touch-action:pan-y"/></svg>';
    return '<div class="legend" style="margin-bottom:8px"><span><i class="sw" style="background:var(--ink-3);border-radius:50%"></i>měření</span><span><i class="sw" style="background:var(--accent);width:18px;height:3px"></i>trend (vyhlazený)</span><span class="muted">Trend filtruje denní výkyvy vody v těle, sleduj hlavně jeho směr.</span></div>' +
      '<div class="chart-wrap" id="chart-wrap" style="position:relative">' + svg + '<div class="chart-tip" id="ch-tip" style="display:none"></div></div>';
  }
  App.hooks.push(function () {
    const hit = $('#ch-hit'); if (!hit || !S.ui.chartGeom) return;
    const ser = S.ui.chartSeries, g = S.ui.chartGeom, svg = hit.ownerSVGElement, tip = $('#ch-tip'), cross = $('#ch-cross'), wrap = $('#chart-wrap');
    const show = (e) => {
      const r = svg.getBoundingClientRect(); const sc = CW / r.width;
      const x = (e.clientX - r.left) * sc;
      let bi = 0, bd = 1e9; g.X.forEach((gx, i) => { const dd = Math.abs(gx - x); if (dd < bd) { bd = dd; bi = i; } });
      const p = ser[bi];
      cross.setAttribute('x1', g.X[bi]); cross.setAttribute('x2', g.X[bi]); cross.style.display = '';
      tip.innerHTML = '<b>' + NT.fmtDate(p.date) + '</b><br>' + fmt(p.weight, 1) + ' kg<br><span class="muted">trend ' + fmt(p.trend, 1) + ' kg</span>';
      tip.style.display = '';
      const wr = wrap.getBoundingClientRect();
      let left = g.X[bi] / sc + 10; if (left + tip.offsetWidth > wr.width) left = g.X[bi] / sc - tip.offsetWidth - 10;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = Math.max(0, g.Y[bi] / sc - 20) + 'px';
    };
    const hide = () => { tip.style.display = 'none'; cross.style.display = 'none'; };
    hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show); hit.addEventListener('pointerleave', hide);
  });

  // vybraná záložka musí být vidět i na úzkém displeji
  App.hooks.push(function () {
    $$('.tabs').forEach((c) => { const t = c.querySelector('[aria-selected="true"]'); if (t && t.offsetLeft + t.offsetWidth > c.clientWidth) c.scrollLeft = t.offsetLeft - 12; });
  });

  // ---- formuláře
  const val = (id) => (($('#' + id) || {}).value || '').trim();
  App.A['mf-save'] = () => {
    const c = Store.get('clients', S.route.id);
    const date = val('mf-date') || NT.today();
    if (date > NT.today()) { App.toast('Datum nemůže být v budoucnosti', { kind: 'bad' }); return; }
    const num = (id, lo, hi, label) => { const s = val(id); if (!s) return null; const v = NT.toNum(s); if (v == null || v < lo || v > hi) { throw new Error(label + ' musí být mezi ' + lo + ' a ' + hi); } return v; };
    let w, bf, waist;
    try { w = num('mf-w', 30, 300, 'Hmotnost'); bf = num('mf-bf', 3, 60, 'Tělesný tuk'); waist = num('mf-waist', 40, 200, 'Obvod pasu'); } catch (e) { App.toast(e.message, { kind: 'bad' }); return; }
    if (w == null && bf == null && waist == null) { App.toast('Vyplň aspoň jednu hodnotu', { kind: 'bad' }); return; }
    const old = mf();
    if (old.id && old.date && old.date !== date) { const t = App.track(c.id); t.measures = t.measures.filter((x) => x.id !== old.id); App.saveTrack(t); }
    const patch = { date, weightKg: w, bf, waistCm: waist, note: val('mf-note') };
    if (!old.id) Object.keys(patch).forEach((k) => { if (patch[k] == null || patch[k] === '') delete patch[k]; });
    App.upsertMeasure(c.id, patch);
    S.ui.mf = {}; App.rerender(); App.toast('Měření uloženo');
  };
  App.A['mf-cancel'] = () => { S.ui.mf = {}; App.rerender(); };
  App.A['mf-edit'] = (t) => { const c = Store.get('clients', S.route.id); const x = App.track(c.id).measures.find((m) => m.id === t.dataset.id); S.ui.mf = Object.assign({}, x); App.rerender(); const el = $('#mf-card'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  App.A['mf-del'] = async (t) => {
    const c = Store.get('clients', S.route.id);
    const ok = await App.confirm({ title: 'Smazat měření?', text: 'Záznam se odstraní z grafu i z výpočtů.', ok: 'Smazat', danger: true });
    if (!ok) return;
    const tr = App.track(c.id); tr.measures = tr.measures.filter((m) => m.id !== t.dataset.id); App.saveTrack(tr); App.rerender();
  };
  App.A['df-save'] = () => {
    const c = Store.get('clients', S.route.id);
    const date = val('df-date') || NT.today();
    if (date > NT.today()) { App.toast('Datum nemůže být v budoucnosti', { kind: 'bad' }); return; }
    const adhS = val('df-adh'); let adh = null;
    if (adhS) { adh = NT.toNum(adhS); if (adh == null || adh < 0 || adh > 100) { App.toast('Plnění musí být mezi 0 a 100 %', { kind: 'bad' }); return; } }
    const pick = (k) => { const s = val('df-' + k); return s ? +s : null; };
    const rec = { date, adherence: adh, energy: pick('energy'), hunger: pick('hunger'), sleep: pick('sleep'), note: val('df-note') };
    if (rec.adherence == null && !rec.energy && !rec.hunger && !rec.sleep && !rec.note) { App.toast('Vyplň aspoň jednu hodnotu', { kind: 'bad' }); return; }
    const tr = App.track(c.id); tr.diary = tr.diary || [];
    const old = df();
    let ex = old.id ? tr.diary.find((x) => x.id === old.id) : null;
    const same = tr.diary.find((x) => x.date === date && (!ex || x.id !== ex.id));
    if (same) tr.diary = tr.diary.filter((x) => x.id !== same.id);
    if (ex) Object.assign(ex, rec); else tr.diary.push(Object.assign({ id: NT.uid('d') }, rec));
    App.saveTrack(tr); S.ui.df = {}; App.rerender(); App.toast('Záznam deníku uložen');
  };
  App.A['df-cancel'] = () => { S.ui.df = {}; App.rerender(); };
  App.A['df-edit'] = (t) => { const c = Store.get('clients', S.route.id); S.ui.df = Object.assign({}, App.track(c.id).diary.find((x) => x.id === t.dataset.id)); App.rerender(); const el = $('#df-card'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  App.A['df-del'] = async (t) => {
    const c = Store.get('clients', S.route.id);
    const ok = await App.confirm({ title: 'Smazat záznam deníku?', text: '', ok: 'Smazat', danger: true }); if (!ok) return;
    const tr = App.track(c.id); tr.diary = tr.diary.filter((x) => x.id !== t.dataset.id); App.saveTrack(tr); App.rerender();
  };

  // ---- AI shrnutí
  App.modals.trackAi = (m) => ({
    title: 'Shrnutí před konzultací', size: 'mid',
    body: (m.busy ? '<div class="row"><span class="spin"></span><span class="muted">AI připravuje shrnutí…</span><button class="btn btn-sm" type="button" data-act="ai-stop">' + ic('stop', 'ico-sm') + 'Zastavit</button></div>' : '') +
      (m.err ? '<div class="callout bad">' + ic('alert') + '<div class="sm">' + esc(m.err) + '</div></div>' : '') +
      (m.text ? '<div class="callout info" style="margin-bottom:10px">' + ic('info') + '<div class="xs">Text vygenerovala AI z dat v aplikaci. Je to podklad, ne hodnocení. Ověř ho podle sebe.</div></div><div class="card flat pre" style="white-space:pre-wrap;padding:14px">' + esc(m.text) + '</div>' : ''),
    footer: '<button class="btn" type="button" data-act="modal-close">Zavřít</button>' + (m.text ? '<button class="btn btn-primary" type="button" data-act="track-ai-copy">' + ic('copy', 'ico-sm') + 'Kopírovat</button>' : '')
  });
  App.A['track-ai-copy'] = () => App.copy(top().text);
  App.A['track-ai'] = async () => {
    const c = Store.get('clients', S.route.id); const tr = App.track(c.id); const m = App.openModal({ type: 'trackAi', busy: true, text: '', err: '' });
    const sum = NT.trackSummary(c, tr, NT.today());
    const L = [];
    const ms = NT.sortedMeasures(tr.measures).filter((x) => x.weightKg).slice(-12);
    L.push('Měření hmotnosti (poslední): ' + (ms.map((x) => NT.fmtDate(x.date) + ' ' + fmt(x.weightKg, 1) + ' kg').join('; ') || 'žádná'));
    if (sum.rate != null) L.push('Tempo změny hmotnosti: ' + fmt(sum.rate, 2) + ' kg/týden (regrese za 28 dní)');
    if (sum.change != null) L.push('Celková změna od prvního měření: ' + fmt(sum.change, 1) + ' kg');
    const wb = NT.sortedMeasures(tr.measures).filter((x) => x.waistCm).slice(-3); if (wb.length) L.push('Obvod pasu: ' + wb.map((x) => NT.fmtDate(x.date) + ' ' + fmt(x.waistCm, 1) + ' cm').join('; '));
    const dy = (tr.diary || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-14);
    if (dy.length) L.push('Deník (posledních ' + dy.length + ' záznamů): ' + dy.map((x) => NT.fmtDate(x.date) + ' plnění ' + (x.adherence != null ? x.adherence + ' %' : '?') + ', energie ' + (x.energy || '?') + ', hlad ' + (x.hunger || '?') + ', spánek ' + (x.sleep || '?') + (x.note ? ' (' + x.note + ')' : '')).join('; '));
    const needs = App.needsOf(c);
    if (needs.ok) L.push('Cílový příjem: asi ' + fmt(needs.avgKcal) + ' kcal denně, bílkoviny ' + fmt(needs.rest.protein) + ' g.');
    const pl = App.plansOf(c.id)[0]; if (pl) { const a = NT.planAverage(pl, App.ctx()); if (a.count) L.push('Aktuální jídelníček „' + pl.name + '“: průměr ' + fmt(a.avg.kcal) + ' kcal, bílkoviny ' + fmt(a.avg.protein) + ' g.'); }
    sum.concerns.forEach((x) => L.push('Upozornění aplikace: ' + x.text));
    const ctl = new AbortController(); App.aiBusy = { ctl };
    try { m.text = String(await App.aiCall('text', NT.promptSummary({ brief: NT.clientBrief(c, App.current(c.id)), data: L.join('\n') }), { signal: ctl.signal })).trim(); }
    catch (e) { if (e.code !== 'cancelled') m.err = e.message; }
    m.busy = false; App.aiBusy = null; if (S.modals.indexOf(m) >= 0) App.renderModal();
  };

  // ------------------------------------------------------------ výstup pro klienta
  App.practice = () => (Store.get('settings', 'main') || {}).practice || {};
  const ho = () => S.ui.ho || (S.ui.ho = { opts: { targets: true, nutrients: true, comment: true, tips: true, shopping: true, equivalents: true, recipes: true, itemKcal: false } });
  const buildHo = (plan, client) => NT.buildHandout({ plan, client, needs: App.needsOf(client), ctx: App.ctx(), practice: App.practice(), opts: ho().opts });

  function handoutHtml(m) {
    const p = m.practice || {};
    const contact = [p.title, p.email, p.phone, p.web].filter(Boolean).map(esc).join(' · ');
    let h = (p.name ? '<div class="hb">' + esc(p.name) + '</div>' : '') + (contact ? '<div class="hs">' + contact + '</div>' : '') +
      '<h1>Jídelníček</h1><div>' + esc(m.clientName) + ' · ' + esc(m.planName) + '</div><div class="hs">Vytvořeno ' + esc(m.date) + (m.goal ? ' · Cíl: ' + esc(m.goal) : '') + '</div>';
    if (m.targets && m.targets.length) h += '<h2>Denní cíle</h2><table><thead><tr><th></th><th class="r">Energie</th><th class="r">Bílkoviny</th><th class="r">Tuky</th><th class="r">Sacharidy</th><th class="r">Vláknina</th></tr></thead><tbody>' + m.targets.map((t) => '<tr><td>' + esc(t.label) + '</td><td class="r">' + fmt(t.kcal) + ' kcal</td><td class="r">' + t.protein + ' g</td><td class="r">' + t.fat + ' g</td><td class="r">' + t.carbs + ' g</td><td class="r">min. ' + t.fiber + ' g</td></tr>').join('') + '</tbody></table>';
    if (m.comment) h += '<h2>Komentář</h2><div class="cmt">' + esc(m.comment) + '</div>';
    m.days.forEach((d) => {
      h += '<div class="day"><h2>' + esc(d.name) + (d.typeLabel ? ' <span class="hs" style="font-weight:400">· ' + esc(d.typeLabel) + '</span>' : '') + '</h2><table><tbody>';
      d.meals.forEach((meal) => {
        h += '<tr class="mh"><td colspan="' + (m.options.itemKcal ? 3 : 2) + '">' + (meal.time ? esc(meal.time) + '&nbsp;&nbsp;' : '') + esc(meal.name) + '</td></tr>';
        meal.items.forEach((it) => { h += '<tr><td' + (it.recipe ? ' style="font-weight:600"' : '') + '>' + esc(it.name) + '</td><td class="r">' + esc(it.amount) + '</td>' + (m.options.itemKcal ? '<td class="r hs">' + it.kcal + ' kcal</td>' : '') + '</tr>'; });
      });
      if (d.totals) h += '<tr class="tot"><td colspan="' + (m.options.itemKcal ? 3 : 2) + '">Celkem za den: ' + fmt(d.totals.kcal) + ' kcal · bílkoviny ' + d.totals.protein + ' g · tuky ' + d.totals.fat + ' g · sacharidy ' + d.totals.carbs + ' g · vláknina ' + d.totals.fiber + ' g</td></tr>';
      h += '</tbody></table></div>';
    });
    if (m.tips) h += '<h2>Doporučení</h2><div class="pre">' + esc(m.tips) + '</div>';
    if (m.shopping && m.shopping.length) {
      h += '<h2>Nákupní seznam</h2>';
      m.shopping.forEach((g) => { h += '<h3>' + esc(g.label) + '</h3><table><tbody>' + g.rows.map((r) => '<tr><td>' + esc(r.name) + '</td><td class="r">' + esc(r.amount) + '</td></tr>').join('') + '</tbody></table>'; });
    }
    if (m.equivalents && m.equivalents.length) {
      h += '<h2>Výměnný seznam</h2><div class="hs">Množství potravin, které jsou ve své skupině zhruba rovnocenné. Potravinu můžeš vyměnit za jinou ze stejné tabulky.</div>';
      m.equivalents.forEach((g) => { h += '<h3>' + esc(g.title) + ' · ' + esc(g.basis) + '</h3><table><tbody>' + g.rows.map((r) => '<tr><td>' + esc(r.name) + '</td><td class="r">' + esc(r.amount) + '</td></tr>').join('') + '</tbody></table>'; });
    }
    if (m.recipes && m.recipes.length) {
      h += '<h2>Recepty</h2>';
      m.recipes.forEach((r) => { h += '<div class="day"><h3>' + esc(r.name) + '</h3><div class="hs">Počet porcí: ' + r.servings + (r.timeMin ? ' · Čas: ' + r.timeMin + ' min' : '') + '</div><ul>' + r.ingredients.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' + (r.steps.length ? '<ol>' + r.steps.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>' : '') + (r.notes ? '<div class="hs">' + esc(r.notes) + '</div>' : '') + '</div>'; });
    }
    return h;
  }
  const HANDOUT_CSS = 'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1b1d22;max-width:820px;margin:24px auto;padding:0 20px;line-height:1.45;font-size:14px}h1{font-size:28px;margin:14px 0 2px}h2{font-size:17px;color:#0B6B66;margin:22px 0 6px;border-bottom:2px solid #D8EDEB;padding-bottom:3px}h3{font-size:14px;margin:12px 0 3px}.hb{font-weight:700;color:#0B6B66;font-size:16px}.hs{color:#6a7078;font-size:12px}table{width:100%;border-collapse:collapse;margin:4px 0}td,th{padding:4px 6px;border-bottom:1px solid #e3e6ea;text-align:left;vertical-align:top}th{font-size:11px;color:#6a7078;text-transform:uppercase}td.r,th.r{text-align:right;white-space:nowrap}tr.mh td{background:#EEF6F5;font-weight:700;border-bottom:0}tr.tot td{font-weight:600;background:#f6f7f8;border-bottom:0}.day{break-inside:avoid;margin-top:16px}.cmt{background:#f6faf9;border-left:3px solid #0B7A75;padding:8px 12px;white-space:pre-wrap}.pre{white-space:pre-wrap}@media print{body{margin:0;max-width:none}}';

  function hoChecks(plan, client) {
    const out = [];
    const ctx = App.ctx();
    const has = plan.days.some((d) => d.meals.some((m) => m.items.length));
    if (!has) out.push(['bad', 'Jídelníček je prázdný.']);
    const al = NT.planAlerts(plan, client, ctx).filter((a) => a.hard);
    if (al.length) out.push(['bad', '<b>Alergen klienta v jídelníčku:</b> ' + al.slice(0, 4).map((a) => esc(a.day + ' › ' + a.item)).join('; ') + (al.length > 4 ? '…' : '')]);
    let gone = 0, unv = new Set();
    plan.days.forEach((d) => d.meals.forEach((m) => m.items.forEach((it) => { if (!NT.itemCalc(it, ctx).ok) gone++; NT.itemFoods(it, ctx).forEach((f) => { if (f.source === 'ai' && !f.verified) unv.add(f.name); }); })));
    if (gone) out.push(['bad', gone + ' položek odkazuje na smazanou potravinu nebo recept.']);
    if (unv.size) out.push(['warn', 'Jídelníček obsahuje neověřené hodnoty od AI: ' + [...unv].slice(0, 5).map(esc).join(', ') + (unv.size > 5 ? '…' : '') + '.']);
    const needs = App.needsOf(client);
    if (needs.ok) {
      plan.days.forEach((d) => {
        if (!d.meals.some((m) => m.items.length)) return;
        const E = App.dayEval(plan, client, d);
        if (E.ev && E.ev.kcal.status !== 'ok') out.push(['warn', esc(d.name) + ': energie ' + fmt(E.tot.total.kcal) + ' kcal při cíli ' + fmt(E.target.kcal) + ' kcal.']);
      });
    } else out.push(['info', 'Chybí údaje pro výpočet potřeb, jídelníček není porovnaný s cílem.']);
    if (!App.practice().name) out.push(['info', 'V Nastavení si doplň název praxe a kontakt, objeví se v hlavičce dokumentu.']);
    return out;
  }
  const slugName = (plan, client) => NT.slug(client.name) + '-' + NT.slug(plan.name);

  App.outHtml = function (plan, client) {
    const o = ho().opts;
    const m = buildHo(plan, client);
    const checks = hoChecks(plan, client);
    const opt = (k, l) => '<label class="chk"><input type="checkbox" data-ch="ho-opt" data-k="' + k + '"' + (o[k] ? ' checked' : '') + '>' + l + '</label>';
    let h = '<div class="grid split-57" id="out-grid"><div class="stack">';
    h += '<div class="card"><h3 style="margin-bottom:10px">Co bude v dokumentu</h3><div class="stack-sm">' + opt('targets', 'Denní cíle (energie a živiny)') + opt('nutrients', 'Součty živin za každý den') + opt('itemKcal', 'Energie u každé potraviny') + opt('comment', 'Úvodní komentář') + opt('tips', 'Doporučení') + opt('shopping', 'Nákupní seznam') + opt('equivalents', 'Výměnný seznam') + opt('recipes', 'Recepty použité v jídelníčku') + '</div></div>';
    h += '<div class="card"><h3 style="margin-bottom:8px">Texty pro klienta</h3><label class="f">Úvodní komentář<textarea rows="5" data-in="plan-comment" data-fid="plan-comment" placeholder="Pár vět na úvod: na čem je jídelníček postavený, jak s ním pracovat…">' + esc(plan.comment || '') + '</textarea></label>' +
      (App.aiAvailable() ? '<div class="row" style="margin:8px 0"><button class="btn btn-sm btn-ai" type="button" data-act="ho-ai-comment"' + (ho().busy ? ' disabled' : '') + '>' + ic('sparkle', 'ico-sm') + 'Navrhnout komentář pomocí AI</button>' + (ho().busy ? '<span class="spin"></span>' : '') + '</div>' : '') +
      '<label class="f" style="margin-top:10px">Doporučení<textarea rows="6" data-in="plan-tips" data-fid="plan-tips" placeholder="Pitný režim, příprava jídel předem, co dělat při chuti na sladké, jak postupovat o víkendu…">' + esc(plan.tips || '') + '</textarea></label>' +
      '<div class="row" style="margin-top:6px"><button class="btn btn-sm" type="button" data-act="ho-tips-fill">Vložit ukázku doporučení</button></div></div>';
    h += '</div><div class="stack">';
    if (checks.length) h += '<div class="card"><h3 style="margin-bottom:8px">Před odesláním zkontroluj</h3><div class="stack-sm">' + checks.map(([k, t]) => '<div class="callout ' + k + '">' + ic(k === 'info' ? 'info' : 'alert') + '<div class="sm">' + (k === 'bad' && t.indexOf('<b>') === 0 ? t : (t.indexOf('&') >= 0 || t.indexOf('<') >= 0 ? t : esc(t))) + '</div></div>').join('') + '</div></div>';
    else h += App.callout('ok', '<b>Kontrola prošla.</b> V jídelníčku nejsou alergeny ani neověřené hodnoty a dny sedí na cíl.');
    h += '<div class="card"><div class="row"><button class="btn btn-primary" type="button" data-act="ho-pdf"' + (ho().pdfBusy ? ' disabled' : '') + '>' + ic('file') + (ho().pdfBusy ? 'Připravuji PDF…' : 'Stáhnout PDF') + '</button><button class="btn" type="button" data-act="ho-email">' + ic('mail') + 'Text pro e-mail</button><button class="btn" type="button" data-act="ho-copy">' + ic('copy') + 'Kopírovat text</button><button class="btn" type="button" data-act="ho-html">' + ic('download') + 'Stáhnout HTML</button></div>' +
      '<p class="xs muted" style="margin-top:8px">PDF se vytváří přímo ve tvém prohlížeči. Při prvním použití se stáhne knihovna pro tvorbu PDF (je potřeba internet).</p></div>';
    h += '<div class="muted sm" style="font-weight:600">Náhled dokumentu</div><div class="handout" id="ho-preview">' + handoutHtml(m) + '</div></div></div>';
    return h;
  };
  App.CH['ho-opt'] = (t) => { ho().opts[t.dataset.k] = t.checked; App.rerender(); };
  const refreshPreview = () => { const p = Store.get('plans', S.route.id); if (!p) return; const el = $('#ho-preview'); if (el) el.innerHTML = handoutHtml(buildHo(p, Store.get('clients', p.clientId))); };
  App.IN['plan-comment'] = (t) => { const p = Store.get('plans', S.route.id); p.comment = t.value; App.touchPlan(p); refreshPreview(); };
  App.IN['plan-tips'] = (t) => { const p = Store.get('plans', S.route.id); p.tips = t.value; App.touchPlan(p); refreshPreview(); };
  App.A['ho-tips-fill'] = async () => {
    const p = Store.get('plans', S.route.id);
    if ((p.tips || '').trim()) { const ok = await App.confirm({ title: 'Přepsat doporučení?', text: 'Stávající text se nahradí ukázkou.', ok: 'Přepsat' }); if (!ok) return; }
    p.tips = '• Pij průběžně během dne, orientačně 2 až 2,5 litru tekutin (voda, neslazený čaj).\n• Jídla si připrav předem, ideálně na 2 až 3 dny.\n• Potraviny v jídelníčku můžeš měnit podle výměnného seznamu, drž se uvedených gramáží.\n• Když se jídlo nepovede dodržet, nic se neděje. U dalšího jídla se vrať k plánu, nesnaž se „dohánět“ ani vynechávat.\n• Potraviny vážíme v syrovém stavu, pokud není uvedeno „vařené“.\n• Dej vědět, pokud se objeví hlad, únava nebo trávicí potíže.';
    App.touchPlan(p); App.rerender();
  };
  App.A['ho-ai-comment'] = async () => {
    const p = Store.get('plans', S.route.id); const c = Store.get('clients', p.clientId);
    if ((p.comment || '').trim()) { const ok = await App.confirm({ title: 'Přepsat komentář?', text: 'Stávající text se nahradí návrhem od AI.', ok: 'Přepsat' }); if (!ok) return; }
    const a = NT.planAverage(p, App.ctx()); const needs = App.needsOf(c);
    const summary = a.count ? 'Průměrně ' + fmt(a.avg.kcal) + ' kcal denně, bílkoviny ' + fmt(a.avg.protein) + ' g, tuky ' + fmt(a.avg.fat) + ' g, sacharidy ' + fmt(a.avg.carbs) + ' g, vláknina ' + fmt(a.avg.fiber) + ' g. Počet dnů: ' + p.days.length + (needs.ok ? '. Cíl: ' + fmt(needs.avgKcal) + ' kcal.' : '.') : 'Jídelníček je zatím prázdný.';
    ho().busy = true; App.rerender();
    try {
      const txt = await App.aiCall('text', NT.promptComment({ brief: NT.clientBrief(c, App.current(c.id)), planName: p.name, summary }));
      const pl = Store.get('plans', p.id); pl.comment = String(txt).trim().replace(/^["„“]|["“”]$/g, ''); App.touchPlan(pl);
      App.toast('Komentář navržen. Přečti si ho a uprav.');
    } catch (e) { App.toast(e.message, { kind: 'bad' }); }
    ho().busy = false; if (S.route.page === 'plan') App.rerender();
  };
  App.A['ho-copy'] = () => { const p = Store.get('plans', S.route.id); App.copy(NT.handoutToText(buildHo(p, Store.get('clients', p.clientId))), 'Text jídelníčku zkopírován'); };
  App.A['ho-html'] = async () => {
    const p = Store.get('plans', S.route.id); const c = Store.get('clients', p.clientId); const m = buildHo(p, c);
    const html = '<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jídelníček – ' + esc(c.name) + '</title><style>' + HANDOUT_CSS + '</style></head><body>' + handoutHtml(m) + '</body></html>';
    await App.saveFile(slugName(p, c) + '.html', html);
  };
  App.A['ho-pdf'] = async () => {
    const p = Store.get('plans', S.route.id); const c = Store.get('clients', p.clientId);
    const bad = hoChecks(p, c).filter((x) => x[0] === 'bad');
    if (bad.length) {
      const ok = await App.confirm({ title: 'V jídelníčku jsou závažné problémy', text: 'Kontrola nahoře hlásí chyby (např. alergen klienta). Opravdu chceš PDF vytvořit?', ok: 'Přesto vytvořit', danger: true });
      if (!ok) return;
    }
    const h = ho(); h.pdfBusy = true; App.rerender();
    try {
      const m = buildHo(p, c);
      if (!m.days.length) throw new Error('Jídelníček je prázdný.');
      await App.loadScript(PDF_JS); await App.loadScript(PDF_FONTS);
      if (!root.pdfMake) throw new Error('Knihovna pro PDF se nenačetla.');
      const doc = NT.handoutToPdf(m);
      const blob = await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('Vytvoření PDF trvá příliš dlouho.')), 40000); try { root.pdfMake.createPdf(doc).getBlob((b) => { clearTimeout(to); res(b); }); } catch (e) { clearTimeout(to); rej(e); } });
      h.pdfBusy = false; if (S.route.page === 'plan') App.rerender();
      await App.saveFile(slugName(p, c) + '.pdf', blob);
    } catch (e) {
      h.pdfBusy = false; if (S.route.page === 'plan') App.rerender();
      console.error(e);
      App.openModal({ type: 'info', title: 'PDF se nepodařilo vytvořit', html: '<p>' + esc(e.message || 'Neznámá chyba') + '</p><p class="sm muted" style="margin-top:8px">Nejčastější příčina je nedostupný internet nebo blokovaná knihovna pro tvorbu PDF. Můžeš použít tlačítko <b>Stáhnout HTML</b> a soubor si otevřít v prohlížeči a uložit do PDF přes tisk (Ctrl+P), nebo <b>Kopírovat text</b>.</p>' });
    }
  };
  // ---- e-mail
  App.modals.email = (m) => ({
    title: 'Text pro e-mail', size: 'mid',
    body: '<div class="callout info" style="margin-bottom:12px">' + ic('info') + '<div class="sm">Aplikace e-maily sama neposílá. Zkopíruj předmět a text do svého e-mailu a <b>PDF přilož</b> (stáhneš ho tlačítkem Stáhnout PDF). Odkaz „Otevřít v e-mailu“ nemusí v tomto zobrazení fungovat.</div></div>' +
      '<div class="form-grid"><label class="f span-all">Adresa příjemce (jen pro odkaz, neukládá se)<input type="email" id="em-to" data-in="em-to" data-fid="em-to" value="' + esc(m.to) + '" placeholder="klient@example.cz"></label>' +
      '<label class="f span-all">Předmět<input type="text" id="em-subj" data-in="em-subj" data-fid="em-subj" value="' + esc(m.subject) + '"></label>' +
      '<label class="f span-all">Text<textarea rows="12" id="em-body" data-in="em-body" data-fid="em-body">' + esc(m.body) + '</textarea></label></div>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zavřít</button><button class="btn" type="button" data-act="em-copy-subj">Kopírovat předmět</button><button class="btn" type="button" data-act="em-copy-body">Kopírovat text</button><a class="btn btn-primary" id="em-link" href="' + mailto(m) + '" target="_blank" rel="noopener noreferrer">' + ic('mail', 'ico-sm') + 'Otevřít v e-mailu</a>'
  });
  const mailto = (m) => 'mailto:' + encodeURIComponent(m.to || '') + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body.slice(0, 1800));
  const emUpd = () => { const a = $('#em-link'); if (a) a.href = mailto(top()); };
  App.IN['em-to'] = (t) => { top().to = t.value.trim(); emUpd(); };
  App.IN['em-subj'] = (t) => { top().subject = t.value; emUpd(); };
  App.IN['em-body'] = (t) => { top().body = t.value; emUpd(); };
  App.A['em-copy-subj'] = () => App.copy(top().subject, 'Předmět zkopírován');
  App.A['em-copy-body'] = () => App.copy(top().body, 'Text zkopírován');
  App.A['ho-email'] = () => {
    const p = Store.get('plans', S.route.id); const c = Store.get('clients', p.clientId); const pr = App.practice();
    const first = (c.name || '').trim().split(/\s+/)[0];
    const body = 'Dobrý den' + (first ? ', ' + first : '') + ',\n\nv příloze posílám Váš jídelníček „' + p.name + '“. Najdete v něm dny, jídla a množství potravin, nákupní seznam i výměnný seznam.\n\nPokud bude cokoli nejasné nebo se Vám nějaké jídlo nebude dařit dodržet, dejte mi vědět a upravíme to.\n\nS pozdravem\n' + (pr.name || '') + (pr.phone ? '\n' + pr.phone : '') + (pr.email ? '\n' + pr.email : '');
    App.openModal({ type: 'email', to: '', subject: 'Jídelníček – ' + p.name, body });
  };

  // ------------------------------------------------------------ nastavení
  App.views.settings = function () {
    const pr = App.practice();
    const hidden = Store.list('foods').filter((f) => f.hidden).length + Store.list('recipes').filter((r) => r.hidden).length + Store.list('templates').filter((t) => t.hidden).length;
    const th = App.getTheme();
    const where = Store.mode === 'api' ? 'Data se ukládají <b>na serveru do databáze aplikace</b>. Vidíš je jen ty po přihlášení a jsou dostupná z každého zařízení.' : Store.mode === 'db' ? 'Data se ukládají do <b>databáze tohoto artefaktu</b> (vidí je jen vlastník).' : Store.mode === 'local' ? 'Data se ukládají <b>jen v tomto prohlížeči</b> (localStorage). Jiné zařízení je neuvidí a vymazání dat prohlížeče je smaže.' : 'Data jsou <b>jen v paměti</b> a po zavření stránky zmizí.';
    const demo = Store.list('clients').some((c) => c.demo);
    let h = App.pageHead('Nastavení', '', '');
    h += '<div class="grid g2" style="align-items:start"><div class="stack">';
    h += '<div class="card"><div class="card-h"><h2>Tvoje praxe</h2></div><p class="sm muted" style="margin-bottom:10px">Tyto údaje se objeví v hlavičce dokumentu pro klienta.</p><div class="form-grid">' +
      [['name', 'Název praxe nebo jméno', 'span-all'], ['title', 'Titul / profese', ''], ['phone', 'Telefon', ''], ['email', 'E-mail', ''], ['web', 'Web', '']].map(([k, l, cls]) => '<label class="f ' + cls + '">' + l + '<input type="text" data-in="set-prac" data-k="' + k + '" data-fid="sp-' + k + '" value="' + esc(pr[k] || '') + '"></label>').join('') + '</div></div>';
    h += App.Auth ? App.Auth.cardsHtml() : '';
    h += '<div class="card"><div class="card-h"><h2>Vzhled</h2></div><div class="seg" role="group" aria-label="Motiv">' + [['auto', 'Podle systému'], ['light', 'Světlý'], ['dark', 'Tmavý']].map(([k, l]) => '<button type="button" data-act="set-theme" data-t="' + k + '" aria-pressed="' + (th === k) + '">' + l + '</button>').join('') + '</div></div>';
    h += '<div class="card"><div class="card-h"><h2>Ukázková data</h2></div><p class="sm muted" style="margin-bottom:10px">Vymyšlená klientka s měřeními, deníkem a jídelníčkem. Slouží k vyzkoušení aplikace.</p><div class="row">' + (demo ? '<button class="btn btn-danger" type="button" data-act="demo-remove">' + ic('trash', 'ico-sm') + 'Smazat ukázková data</button>' : '<button class="btn" type="button" data-act="demo-load">' + ic('wand', 'ico-sm') + 'Načíst ukázkového klienta</button>') + '</div></div>';
    h += '</div><div class="stack">';
    h += '<div class="card"><div class="card-h"><h2>Ukládání a záloha</h2></div><div class="callout ' + (Store.mode === 'db' || Store.mode === 'api' ? 'ok' : 'warn') + '" style="margin-bottom:12px">' + ic(Store.mode === 'db' || Store.mode === 'api' ? 'check' : 'alert') + '<div class="sm">' + where + (Store.modeReason ? '<br><span class="muted">' + esc(Store.modeReason) + '</span>' : '') + '</div></div>' +
      '<div class="row"><button class="btn btn-primary" type="button" data-act="backup-export">' + ic('download', 'ico-sm') + 'Stáhnout zálohu (JSON)</button><label class="btn" style="cursor:pointer">' + ic('upload', 'ico-sm') + 'Obnovit ze zálohy<input type="file" accept=".json,application/json" data-ch="backup-file" style="display:none"></label></div>' +
      '<p class="xs muted" style="margin-top:8px">Záloha obsahuje klienty, měření, deník, jídelníčky, vlastní potraviny, recepty a šablony. Obnovení přidá záznamy ze zálohy a přepíše ty se stejným identifikátorem.</p></div>';
    h += '<div class="card"><div class="card-h"><h2>Ochrana osobních údajů</h2></div><div class="stack-sm sm"><p>Aplikace pracuje se zdravotními údaji, které patří mezi zvláštní kategorii osobních údajů (GDPR). Dokud nemáš vyřešený právní základ, zpracovatelské smlouvy a bezpečnost, doporučuji klienty <b>zapisovat zkráceně</b> (např. „Jana N.“ nebo číslo) a nezapisovat rodná čísla, adresy ani kontakty.</p>' + (App.aiAvailable() ? '<p>Při použití AI se do služby odesílá <b>profil klienta bez jména</b> (cíl, věk, alergie, nechutě, zdravotní poznámky) a obsah jídelníčku. Do polí poznámek proto nepiš identifikující údaje.</p>' : '') + '</div></div>';
    h += '<div class="card"><div class="card-h"><h2>Skryté položky</h2></div><p class="sm muted" style="margin-bottom:10px">Smazané základní potraviny, ukázkové recepty a šablony se jen skryjí. Můžeš je obnovit.</p><button class="btn" type="button" data-act="restore-hidden"' + (hidden ? '' : ' disabled') + '>Obnovit skryté položky (' + hidden + ')</button></div>';
    h += '<div class="card"><div class="card-h"><h2>Smazat všechna data</h2></div><p class="sm muted" style="margin-bottom:10px">Odstraní všechny klienty, jídelníčky, vlastní potraviny a recepty. Nejde vrátit zpět, nejdřív si stáhni zálohu.</p><button class="btn btn-danger" type="button" data-act="wipe-open">' + ic('trash', 'ico-sm') + 'Smazat všechna data…</button></div>';
    h += '<div class="card"><div class="card-h"><h2>O aplikaci</h2></div><p class="sm muted">Nutriční plánovač je pomůcka pro odborníka. Výpočty potřeb (rovnice BMR, odhad změny hmotnosti 7700 kcal/kg) jsou <b>orientační</b> a nenahrazují klinický úsudek. Základní databáze potravin je orientační. Za obsah jídelníčků odpovídá terapeut.</p></div>';
    h += '</div></div>';
    return h;
  };
  App.IN['set-prac'] = (t) => {
    const s = Store.get('settings', 'main') || { id: 'main', practice: {} };
    s.practice = s.practice || {}; s.practice[t.dataset.k] = t.value; Store.put('settings', s);
  };
  App.A['set-theme'] = (t) => { try { localStorage.setItem(THEME_KEY, t.dataset.t); } catch (e) { /* ignore */ } App.applyTheme(t.dataset.t); App.rerender(); };
  App.A['backup-export'] = async () => {
    await Store.flush();
    const ok = await App.saveFile('zaloha-jidelnicky-' + NT.today() + '.json', JSON.stringify(Store.exportAll(), null, 1));
    if (ok) App.toast('Záloha uložena');
  };
  App.CH['backup-file'] = async (t) => {
    const file = t.files && t.files[0]; if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      if (!obj || obj.app !== 'nutricni-planovac') throw new Error('Soubor není záloha této aplikace.');
      const n = (k) => (Array.isArray(obj.data && obj.data[k]) ? obj.data[k].length : 0);
      const ok = await App.confirm({ title: 'Obnovit ze zálohy?', text: 'Záloha z ' + (obj.exportedAt || '').slice(0, 10) + ' obsahuje: ' + n('clients') + ' klientů, ' + n('plans') + ' jídelníčků, ' + n('foods') + ' potravin, ' + n('recipes') + ' receptů, ' + n('templates') + ' šablon. Záznamy se stejným identifikátorem se přepíšou.', ok: 'Obnovit' });
      if (!ok) { t.value = ''; return; }
      const counts = Store.importAll(obj);
      App.rebuildCatalog(); App.rerender();
      App.toast('Obnoveno: ' + Object.keys(counts).map((k) => counts[k]).reduce((a, b) => a + b, 0) + ' záznamů');
    } catch (e) { App.toast('Obnovení se nezdařilo: ' + e.message, { kind: 'bad' }); }
    t.value = '';
  };
  App.A['restore-hidden'] = () => {
    ['foods', 'recipes', 'templates'].forEach((c) => Store.list(c).filter((x) => x.hidden).forEach((x) => Store.remove(c, x.id)));
    App.rebuildCatalog(); App.rerender(); App.toast('Skryté položky obnoveny');
  };
  App.modals.wipe = () => ({
    title: 'Smazat všechna data', size: '',
    body: '<div class="callout bad" style="margin-bottom:12px">' + ic('alert') + '<div class="sm">Tato akce smaže <b>všechny klienty, jídelníčky, měření, deník, vlastní potraviny, recepty a šablony</b>. Nejde vrátit.</div></div><label class="f">Pro potvrzení napiš slovo SMAZAT<input type="text" id="wipe-in" data-in="wipe-in" data-fid="wipe-in" autocomplete="off"></label>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-solid-danger" type="button" data-act="wipe-go" id="wipe-go" disabled>Smazat vše</button>', focus: '#wipe-in'
  });
  App.A['wipe-open'] = () => App.openModal({ type: 'wipe' });
  App.IN['wipe-in'] = (t) => { const b = $('#wipe-go'); if (b) b.disabled = t.value.trim().toUpperCase() !== 'SMAZAT'; };
  App.A['wipe-go'] = async () => {
    if (($('#wipe-in').value || '').trim().toUpperCase() !== 'SMAZAT') return;
    App.closeAll(); await Store.wipe(); App.rebuildCatalog(); S.ui.mf = {}; S.ui.df = {}; App.go('dashboard'); App.toast('Všechna data smazána');
  };

  // ------------------------------------------------------------ ukázková data
  App.A['demo-load'] = () => {
    if (Store.list('clients').some((c) => c.demo)) { App.toast('Ukázkový klient už existuje'); return; }
    const T = NT.today();
    const cid = NT.uid('c');
    const client = { id: cid, name: 'Jana N. (ukázka)', demo: true, sex: 'f', birth: String(+T.slice(0, 4) - 36) + '-05-14', heightCm: 168, goal: 'loss', diet: 'all', allergens: ['peanuts'], dislikes: 'brokolice, houby', health: 'Bez diagnóz. Občas nižší energie odpoledne.', training: 'Chůze 8 000 kroků denně, 2× týdně posilování v posilovně.', notes: 'Ukázková klientka. Všechna data jsou vymyšlená.', needs: Object.assign(NT.defaultNeeds('loss'), { pal: 1.4, trainingKcal: 250, trainingDays: 2 }), createdAt: new Date().toISOString() };
    client.journey = { gates: { intake: { date: NT.addDays(T, -56), note: 'Úvodní sezení: anamnéza, cíle, měření.' }, session: { date: NT.addDays(T, -49), note: 'Předán první jídelníček a vysvětlen.' } }, checkups: [{ date: NT.addDays(T, -35), note: '' }, { date: NT.addDays(T, -21), note: 'Hmotnost klesá, energie odpoledne lepší.' }], checkInterval: 14 };
    client.goalPlan = { kind: 'weight', status: 'approved', startWeight: 78.6, startDate: NT.addDays(T, -56), targetWeight: 72, targetDate: NT.addDays(T, 98), approvedAt: NT.addDays(T, -56), approvedVerdict: 'realistic', note: 'Cíl domluven na úvodním sezení.' };
    Store.put('clients', client);
    const W = [78.6, 78.1, 78.4, 77.5, 77.3, 76.8, 76.5, 76.6, 75.9];
    const measures = W.map((w, i) => { const m = { id: NT.uid('m'), date: NT.addDays(T, -(W.length - 1 - i) * 7), weightKg: w }; if (i === 0) { m.bf = 33; m.waistCm = 88; } if (i === W.length - 1) { m.bf = 31.8; m.waistCm = 85.5; } return m; });
    const ADH = [80, 70, 85, 90, 75, 85, 90, 80], EN = [3, 3, 4, 3, 4, 4, 3, 4], HU = [3, 4, 2, 3, 2, 3, 2, 2], SL = [3, 3, 4, 4, 3, 4, 4, 3];
    const diary = ADH.map((a, i) => ({ id: NT.uid('d'), date: NT.addDays(T, -(ADH.length - 1 - i) * 2), adherence: a, energy: EN[i], hunger: HU[i], sleep: SL[i], note: i === 1 ? 'Víkend na chatě, hůř se dodržovalo' : '' }));
    Store.put('tracks', { id: cid, clientId: cid, measures, diary });
    const fi = (k, g) => NT.newItem('food', NT.baseId(k), g), ri = (id, s) => NT.newItem('recipe', id, s || 1);
    const meal = (name, time, items) => Object.assign(NT.newMeal(name, time), { items });
    const days = [
      Object.assign(NT.newDay('Pondělí', 'rest', 'five'), { meals: [
        meal('Snídaně', '07:30', [ri('rstart01')]), meal('Dopolední svačina', '10:00', [fi('jablko', 150), fi('mandle', 15)]),
        meal('Oběd', '12:30', [fi('kureci_prsa', 150), fi('ryze_bila_varena', 200), fi('paprika_cervena', 150), fi('olej_olivovy', 8)]),
        meal('Odpolední svačina', '15:30', [fi('jogurt_recky', 150), fi('boruvky', 80)]),
        meal('Večeře', '18:30', [fi('chleb_celozrnny', 80), fi('vejce', 120), fi('rajce', 150), fi('okurka', 100)])] }),
      Object.assign(NT.newDay('Úterý (trénink)', 'training', 'five'), { meals: [
        meal('Snídaně', '07:30', [fi('vejce', 180), fi('chleb_zitny', 80), fi('avokado', 70), fi('rajce', 100)]), meal('Dopolední svačina', '10:00', [ri('rstart02')]),
        meal('Oběd', '12:30', [ri('rstart04')]), meal('Odpolední svačina', '15:30', [fi('banan', 120), fi('protein_syrovatka', 30)]), meal('Večeře', '18:30', [ri('rstart05')])] }),
      Object.assign(NT.newDay('Středa', 'rest', 'five'), { meals: [
        meal('Snídaně', '07:30', [fi('ovesne_vlocky', 50), fi('mleko_polotucne', 200), fi('malina', 80), fi('chia', 10)]), meal('Dopolední svačina', '10:00', [fi('tvaroh_odtucneny', 150), fi('jahody', 100)]),
        meal('Oběd', '12:30', [fi('hovezi_mlete', 120), fi('brambory_vareny', 250), fi('zeli_bile', 150)]), meal('Odpolední svačina', '15:30', [fi('mrkev', 150), fi('cottage', 100)]),
        meal('Večeře', '18:30', [fi('tofu', 150), fi('kuskus_suchy', 60), fi('cuketa', 200), fi('olej_olivovy', 8)])] })
    ];
    const plan = { id: NT.uid('p'), clientId: cid, name: 'Redukce – ukázkový týden', demo: true, days, comment: 'Jano, jídelníček je postavený na třech běžných dnech, které můžeš střídat. Bílkoviny jsou rozložené do všech jídel, aby ses lépe zasytila. V úterý máš posilování, proto je tam o něco víc sacharidů.', tips: '• Pij průběžně během dne, orientačně 2 až 2,5 litru tekutin.\n• Jídla si připrav předem na 2 až 3 dny.\n• Potraviny můžeš měnit podle výměnného seznamu.\n• Když se jídlo nepovede dodržet, u dalšího se vrať k plánu.', createdAt: new Date().toISOString() };
    const needs = App.needsOf(client);
    if (needs.ok) plan.days.forEach((d) => { const tg = d.dayType === 'training' ? needs.training : needs.rest; const all = d.meals.flatMap((m) => m.items); const fit = NT.fitItemsToKcal(all, tg.kcal, App.ctx(), 0); const by = new Map(fit.items.map((i) => [i.id, i])); d.meals.forEach((m) => m.items.forEach((it) => { const n = by.get(it.id); if (n) { if (it.type === 'recipe') it.servings = n.servings; else it.grams = n.grams; } })); });
    App.touchPlan(plan);
    S.ui.clientTab = 'profile';
    App.go('client', { id: cid, tab: 'profile' });
    App.toast('Ukázkový klient načten');
  };
  App.A['demo-remove'] = async () => {
    const ok = await App.confirm({ title: 'Smazat ukázková data?', text: 'Smaže se ukázková klientka s měřeními a jídelníčkem.', ok: 'Smazat', danger: true });
    if (!ok) return;
    Store.list('clients').filter((c) => c.demo).forEach((c) => { App.plansOf(c.id).forEach((p) => Store.remove('plans', p.id)); Store.remove('tracks', c.id); Store.remove('clients', c.id); });
    App.go('settings'); App.toast('Ukázková data smazána');
  };
})(typeof window !== 'undefined' ? window : globalThis);
