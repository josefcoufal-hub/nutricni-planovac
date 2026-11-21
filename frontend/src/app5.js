/* Jídelníček – aplikace, část 5: přehled, cesta klienta (status bar), cíl a průběh, uložení klienta, návrh jídelníčku. */
(function (root) {
  'use strict';
  const NT = root.NT, App = NT.App, Store = NT.Store, S = App.S;
  const esc = NT.esc, fmt = NT.fmt, ic = App.ic, $ = App.$, $$ = App.$$;
  const plural = NT.plural;
  const shortD = (s) => (s ? NT.fmtDate(s).replace(/\s?(\d{4})$/, '').replace(/\s+/g, '') : '');
  const num = (v) => (v == null || v === '' ? null : NT.toNum(v));
  const LV = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'info', muted: '' };

  // ------------------------------------------------------------ kontext klienta
  App.clientCtx = function (c) {
    const cur = App.current(c.id);
    const plans = App.plansOf(c.id);
    const tr = App.track(c.id);
    const today = NT.today();
    const summary = NT.trackSummary(c, tr, today);
    const needs = App.needsOf(c);
    const ctx = {
      today, weight: cur.weight, cur, plans, track: tr, summary, needs, catCtx: App.ctx(),
      hasPlan: plans.some((p) => (p.days || []).some((d) => (d.meals || []).some((m) => (m.items || []).length)))
    };
    ctx.assessment = c.goalPlan && c.goalPlan.kind === 'weight' ? NT.assessGoal(c, c.goalPlan, { needs, summary, today }) : null;
    ctx.js = NT.journeyStatus(c, ctx);
    ctx.agenda = NT.clientAgenda(c, ctx);
    return ctx;
  };
  const STAGE = { intake: 'Úvodní sezení', data: 'Vstupní data', goal: 'Cíl', plan: 'Jídelníček', session: 'Sezení k jídelníčku' };
  const STAGE_ORDER = ['intake', 'data', 'goal', 'plan', 'session', 'checkup', 'done'];
  App.STAGE_LABEL = Object.assign({ checkup: 'Pravidelné kontroly', done: 'Ukončeno' }, STAGE);
  App.stageOf = function (js) {
    const g = (k) => js.gates.find((x) => x.key === k);
    if (g('eval').state === 'done') return 'done';
    if (g('session').state === 'done') return 'checkup';
    for (const k of ['intake', 'data', 'goal', 'plan', 'session']) if (g(k).state !== 'done') return k;
    return 'checkup';
  };

  // ------------------------------------------------------------ malé grafické prvky
  const spark = (vals, w, h) => {
    vals = vals.filter((v) => v != null);
    if (vals.length < 2) return '<span class="muted xs">málo měření</span>';
    w = w || 96; h = h || 28;
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const sp = hi - lo || 1;
    const pts = vals.map((v, i) => (i / (vals.length - 1) * (w - 4) + 2).toFixed(1) + ',' + (h - 3 - (v - lo) / sp * (h - 6)).toFixed(1));
    const last = pts[pts.length - 1].split(',');
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Vývoj hmotnosti od ' + fmt(vals[0], 1) + ' do ' + fmt(vals[vals.length - 1], 1) + ' kg"><polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(' ') + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.8" fill="var(--accent)"/></svg>';
  };
  const bar = (pct, cls, label) => '<div class="pbar ' + (cls || '') + '" role="img" aria-label="' + esc(label || '') + '"><i style="width:' + NT.clamp(pct, 0, 100).toFixed(1) + '%"></i></div>';
  const segBar = (js) => '<div class="segbar" role="img" aria-label="Splněno ' + js.done + ' z ' + js.total + ' kroků">' + js.gates.map((g) => '<i class="' + g.state + '" title="' + esc(g.label) + '"></i>').join('') + '</div>';

  // ------------------------------------------------------------ stavový pruh (gates)
  App.journeyHtml = function (c, ctx) {
    const js = ctx.js;
    const STX = { done: 'splněno', current: 'právě na řadě', overdue: 'po termínu', todo: 'čeká' };
    let h = '<section class="journey card" id="journey-host" aria-label="Průběh spolupráce"><div class="journey-top"><b class="head-font">Průběh spolupráce</b><span class="muted sm">' + js.done + ' z ' + js.total + ' kroků</span><span class="sp"></span>' +
      (js.next ? '<span class="journey-next ' + js.next.level + '">' + ic(js.next.level === 'bad' ? 'alert' : 'right', 'ico-sm') + '<span><b>Další krok:</b> ' + esc(js.next.text) + '</span></span>' : '<span class="journey-next ok">' + ic('check', 'ico-sm') + '<span>Vše podle plánu</span></span>') + '</div>' +
      '<ol class="steps">' + js.gates.map((g, i) => {
        const icon = g.state === 'done' ? ic('check', 'ico-sm') : g.state === 'overdue' ? ic('alert', 'ico-sm') : '<span class="n">' + (i + 1) + '</span>';
        return '<li class="step ' + g.state + '"><button type="button" data-act="gate-open" data-g="' + g.key + '" aria-label="' + esc(g.label + ': ' + STX[g.state] + (g.detail ? ', ' + g.detail : '')) + '"><span class="bub">' + icon + '</span><span class="lab">' + esc(g.label) + '</span><span class="det">' + esc(g.detail || STX[g.state]) + '</span></button></li>';
      }).join('') + '</ol></section>';
    return h;
  };
  App.refreshJourney = function () {
    const c = Store.get('clients', S.route.id); const host = $('#journey-host');
    if (!c || !host) return;
    host.outerHTML = App.journeyHtml(c, App.clientCtx(c));
  };

  App.modals.gate = (m) => {
    const g = NT.JOURNEY_GATES.find((x) => x.key === m.key);
    const HELP = {
      intake: 'Zapiš, kdy proběhlo úvodní sezení (anamnéza, očekávání, domluva postupu).',
      session: 'Zapiš, kdy proběhlo sezení, na kterém se klientovi předal a vysvětlil hotový jídelník.',
      eval: 'Zapiš, kdy proběhlo vyhodnocenía cíl a rozhodla o dalším postupu (udržování, nový cíl, ukončení).'
    };
    return {
      title: g.label, size: '',
      body: '<p class="muted sm" style="margin-bottom:12px">' + esc(HELP[m.key] || '') + '</p><div class="form-grid"><label class="f">Datum<input type="date" id="g-date" value="' + esc(m.date) + '" max="' + NT.addDays(NT.today(), 365) + '"></label>' +
        '<label class="f span-all">Poznámka<textarea id="g-note" rows="3" placeholder="Volitelné, vidíš jen ty">' + esc(m.note || '') + '</textarea></label></div>',
      footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button>' + (m.done ? '<button class="btn btn-danger" type="button" data-act="gate-undo" style="margin-right:auto">Zrušit splnění</button>' : '') + '<button class="btn btn-primary" type="button" data-act="gate-save">' + (m.done ? 'Uložit změny' : 'Označit jako hotové') + '</button>',
      focus: '#g-date'
    };
  };
  App.modals.checkup = (m) => ({
    title: 'Zapsat kontrolu', size: '',
    body: '<p class="muted sm" style="margin-bottom:12px">Kontrola je pravidelná schůzka nebo konzultace po předání jídelníčku. Další termín se spočítá z nastaveného intervalu (' + m.interval + ' ' + plural(m.interval, 'den', 'dny', 'dní') + ').</p><div class="form-grid">' +
      '<label class="f">Datum kontroly<input type="date" id="k-date" value="' + esc(m.date) + '" max="' + NT.today() + '"></label>' +
      '<label class="f">Hmotnost na kontrole (kg)<span class="hint">Volitelné, zapíše se jako měření</span><input type="number" id="k-w" min="30" max="300" step="0.1" inputmode="decimal" value="' + esc(m.weight == null ? '' : m.weight) + '"></label>' +
      '<label class="f span-all">Poznámka<textarea id="k-note" rows="3" placeholder="Co jste probrali, co upravit"></textarea></label></div>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="chk-save">Zapsat kontrolu</button>', focus: '#k-date'
  });
  App.A['gate-open'] = (t) => {
    const c = Store.get('clients', S.route.id); if (!c) return;
    const key = t.dataset.g; const j = NT.journeyOf(c);
    if (key === 'data') { S.ui.clientTab = 'profile'; App.rerender(); return; }
    if (key === 'goal') { S.ui.clientTab = 'goal'; App.rerender(); return; }
    if (key === 'plan') { S.ui.clientTab = 'plans'; App.rerender(); return; }
    if (key === 'checkup') { App.openCheckup(c.id); return; }
    const cur = j.gates[key];
    App.openModal({ type: 'gate', cid: c.id, key, done: !!(cur && cur.date), date: (cur && cur.date) || NT.today(), note: (cur && cur.note) || '' });
  };
  App.A['gate-save'] = () => {
    const m = S.modals[S.modals.length - 1]; const c = Store.get('clients', m.cid);
    const date = ($('#g-date') || {}).value;
    if (!date) { App.toast('Zadej datum', { kind: 'bad' }); return; }
    const j = NT.journeyOf(c); j.gates[m.key] = { date, note: (($('#g-note') || {}).value || '').trim() };
    c.journey = j; Store.put('clients', c); App.closeAll(); App.rerender(); App.toast('Stavový pruh aktualizován');
  };
  App.A['gate-undo'] = () => {
    const m = S.modals[S.modals.length - 1]; const c = Store.get('clients', m.cid);
    const j = NT.journeyOf(c); delete j.gates[m.key]; c.journey = j; Store.put('clients', c); App.closeAll(); App.rerender(); App.toast('Splnění zrušeno');
  };
  App.openCheckup = function (cid) {
    const c = Store.get('clients', cid); const j = NT.journeyOf(c);
    if (!(j.gates.session && j.gates.session.date)) App.toast('Kontroly se zapisují až po sezení k jídelníčku. Kliknutím na krok „Sezení k jídelníčku“ ho označ jako hotové.', { kind: 'bad', ms: 6000 });
    App.openModal({ type: 'checkup', cid, date: NT.today(), interval: j.checkInterval, weight: App.current(cid).weight });
  };
  App.A['chk-save'] = () => {
    const m = S.modals[S.modals.length - 1]; const c = Store.get('clients', m.cid);
    const date = $('#k-date').value; if (!date) { App.toast('Zadej datum kontroly', { kind: 'bad' }); return; }
    const w = num($('#k-w').value);
    if (w != null && (w < 30 || w > 300)) { App.toast('Hmotnost musí být mezi 30 a 300 kg', { kind: 'bad' }); return; }
    const j = NT.journeyOf(c); j.checkups.push({ date, note: ($('#k-note').value || '').trim() });
    c.journey = j; Store.put('clients', c);
    if (w != null) App.upsertMeasure(c.id, { date, weightKg: w });
    App.closeAll(); App.rerender(); App.toast('Kontrola zapsána');
  };
  App.A['chk-del'] = async (t) => {
    const c = Store.get('clients', S.route.id); const j = NT.journeyOf(c);
    const x = j.checkups[+t.dataset.i]; if (!x) return;
    const ok = await App.confirm({ title: 'Smazat záznam kontroly z ' + NT.fmtDate(x.date) + '?', text: 'Záznam zmizí ze stavového pruhu.', ok: 'Smazat', danger: true }); if (!ok) return;
    j.checkups.splice(+t.dataset.i, 1); c.journey = j; Store.put('clients', c); App.rerender();
  };
  App.CH['j.interval'] = (t) => {
    const c = Store.get('clients', S.route.id); const j = NT.journeyOf(c); const v = Math.round(num(t.value));
    if (!(v >= 3 && v <= 120)) { App.toast('Interval kontrol musí být 3 až 120 dní', { kind: 'bad' }); t.value = j.checkInterval; return; }
    j.checkInterval = v; c.journey = j; Store.put('clients', c); App.rerender();
  };

  // ------------------------------------------------------------ cíl klienta
  const ensureGp = (c) => {
    if (!c.goalPlan) {
      const cur = App.current(c.id);
      c.goalPlan = { kind: 'weight', status: 'draft', startWeight: cur.weight || null, startDate: NT.today(), targetWeight: null, targetDate: '', title: '', note: '' };
    }
    return c.goalPlan;
  };
  const gpSet = (fn, quiet) => {
    const c = Store.get('clients', S.route.id); const gp = ensureGp(c);
    const was = gp.status;
    fn(gp);
    if (was === 'approved' || was === 'achieved') { gp.status = 'draft'; gp.approvedAt = null; App.toast('Cíl byl změněn, je potřeba ho znovu odsouhlasit', { ms: 4200 }); }
    Store.put('clients', c);
    if (!quiet) App.refreshGoal(was !== gp.status);
  };
  const goalChart = (c, gp, ctx) => {
    const W = 560, H = 230, PL = 44, PR = 14, PT = 12, PB = 28;
    const a = gp.startDate, b = gp.targetDate;
    const pts = ctx.track.measures ? NT.weightSeries(ctx.track.measures).filter((p) => p.date >= NT.addDays(a, -14)) : [];
    const lastD = pts.length ? pts[pts.length - 1].date : a;
    const end = [b, lastD, ctx.today].sort().pop();
    const d0 = NT.addDays(a, -3), span = Math.max(1, NT.daysBetween(d0, end) + 3);
    const ws = pts.map((p) => p.weight).concat([gp.startWeight, gp.targetWeight]);
    let lo = Math.floor(Math.min.apply(null, ws) - 1), hi = Math.ceil(Math.max.apply(null, ws) + 1);
    if (hi - lo < 3) { hi += 1; lo -= 1; }
    const X = (d) => PL + NT.daysBetween(d0, d) / span * (W - PL - PR);
    const Y = (v) => PT + (hi - v) / (hi - lo) * (H - PT - PB);
    let svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Graf cíle: plán z ' + fmt(gp.startWeight, 1) + ' kg na ' + fmt(gp.targetWeight, 1) + ' kg do ' + NT.fmtDate(b) + ', ' + pts.length + ' ' + plural(pts.length, 'měření', 'měření', 'měření') + '">';
    const nT = 4;
    for (let i = 0; i <= nT; i++) { const v = lo + (hi - lo) * i / nT; svg += '<line class="' + (i === 0 ? 'axis-l' : 'grid-l') + '" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (PL - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + fmt(v, 0) + '</text>'; }
    [[a, 'start'], [b, 'end']].forEach(([d, anc]) => { svg += '<text x="' + X(d).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + anc + '">' + shortD(d) + '</text>'; });
    if (ctx.today > a && ctx.today < b) svg += '<line x1="' + X(ctx.today).toFixed(1) + '" x2="' + X(ctx.today).toFixed(1) + '" y1="' + PT + '" y2="' + (H - PB) + '" stroke="var(--ink-3)" stroke-dasharray="3 4" stroke-width="1"/><text x="' + X(ctx.today).toFixed(1) + '" y="' + (PT + 10) + '" text-anchor="middle">dnes</text>';
    svg += '<line x1="' + X(a).toFixed(1) + '" y1="' + Y(gp.startWeight).toFixed(1) + '" x2="' + X(b).toFixed(1) + '" y2="' + Y(gp.targetWeight).toFixed(1) + '" stroke="var(--c-fiber, var(--ink-3))" stroke-width="2" stroke-dasharray="6 5"/>';
    svg += '<circle cx="' + X(b).toFixed(1) + '" cy="' + Y(gp.targetWeight).toFixed(1) + '" r="5" fill="var(--surface)" stroke="var(--c-fiber, var(--ink-3))" stroke-width="2.5"/>';
    if (pts.length > 1) svg += '<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map((p) => X(p.date).toFixed(1) + ',' + Y(p.trend).toFixed(1)).join(' ') + '"/>';
    pts.forEach((p) => { svg += '<circle cx="' + X(p.date).toFixed(1) + '" cy="' + Y(p.weight).toFixed(1) + '" r="3.8" fill="var(--ink-3)" stroke="var(--surface)" stroke-width="2"/>'; });
    svg += '</svg>';
    return svg + '<div class="legend" style="margin-top:6px"><span><i class="lg-line plan"></i>plán (rovnoměrně)</span><span><i class="lg-line act"></i>trend hmotnosti</span><span><i class="lg-dot"></i>měření</span></div>';
  };
  App.goalAssessHtml = function (c, ctx) {
    const gp = c.goalPlan;
    if (!gp) return '';
    let h = '';
    if (gp.kind !== 'weight') {
      h += App.callout('info', '<b>Vlastní cíl se automaticky neposuzuje.</b><br><span class="sm">Vyhodnocení reálnosti umím u cíle s hmotností. U ostatních cílů (např. více energie, pravidelná snídaně) rozhoduješ ty.</span>');
    } else {
      const a = ctx.assessment || NT.assessGoal(c, gp, { needs: ctx.needs, summary: ctx.summary, today: ctx.today });
      if (a.verdict === 'incomplete') h += App.callout(a.level === 'bad' ? 'bad' : 'info', '<b>' + esc(a.title) + '</b><br><span class="sm">' + a.messages.map((m) => esc(m.text)).join(' ') + '</span>');
      else {
        h += '<div class="verdict ' + a.level + '"><span class="vb">' + ic(a.level === 'ok' ? 'check' : 'alert') + '</span><div><div class="vt">' + esc(a.title) + '</div><div class="sm">' + (a.dir === 'hold' ? 'Udržení hmotnosti' : (a.rateKg < 0 ? '−' : '+') + fmt(Math.abs(a.rateKg), 2) + ' kg týdně · ' + fmt(a.pct, 2) + ' % hmotnosti za týden') + '</div></div></div>';
        h += '<ul class="msgs">' + a.messages.map((m) => '<li class="' + m.level + '">' + ic(m.level === 'ok' ? 'check' : m.level === 'info' ? 'info' : 'alert', 'ico-sm') + '<span>' + esc(m.text) + '</span></li>').join('') + '</ul>';
        if (a.progress && a.progress.state !== 'notstarted') {
          const p = a.progress;
          h += '<div class="hr"></div><div class="sm" style="margin-bottom:6px"><b>Průběh:</b> teď ' + fmt(p.current, 1) + ' kg, do cíle zbývá ' + fmt(Math.abs(p.left), 1) + ' kg. ' + (p.state === 'behind' ? '<span class="badge warn">pozadu za plánem</span>' : p.state === 'ahead' ? '<span class="badge ok">před plánem</span>' : '<span class="badge ok">v plánu</span>') + '</div>' +
            '<div class="sm muted" style="margin-bottom:4px">Splněno ' + fmt(NT.clamp(p.done, 0, 1) * 100) + ' % cesty, uplynulo ' + fmt(NT.clamp(p.elapsed, 0, 1) * 100) + ' % času</div>' + bar(p.done * 100, p.state === 'behind' ? 'warn' : '', 'Splněno ' + fmt(p.done * 100) + ' % cíle') + '<div style="height:6px"></div>' + bar(p.elapsed * 100, 'time', 'Uplynulo ' + fmt(p.elapsed * 100) + ' % času');
        }
        h += '<div class="hr"></div>' + goalChart(c, gp, ctx);
        const ms = NT.goalMilestones(gp, ctx.summary && ctx.summary.last ? ctx.summary.last.weight : null);
        if (ms.length) h += '<div class="hr"></div><div class="sm" style="margin-bottom:6px"><b>Milníky</b> <span class="muted">(rovnoměrné tempo)</span></div><ul class="msgs" id="goal-ms">' + ms.map((m) => '<li class="' + (m.reached ? 'ok' : 'info') + '">' + ic(m.reached ? 'check' : 'info', 'ico-sm') + '<span><b>' + fmt(m.weight, 1) + ' kg</b> do ' + esc(NT.fmtDate(m.date)) + ' <span class="muted">(' + m.pct + ' % cesty)</span>' + (m.reached ? ' <span class="badge ok">splněno</span>' : '') + '</span></li>').join('') + '</ul>';
      }
    }
    return h;
  };
  App.refreshGoal = function (full) {
    const c = Store.get('clients', S.route.id); if (!c) return;
    if (full) { App.rerender(); return; }
    const ctx = App.clientCtx(c);
    const host = $('#goal-assess'); if (host) host.innerHTML = App.goalAssessHtml(c, ctx);
    const jh = $('#journey-host'); if (jh) jh.outerHTML = App.journeyHtml(c, ctx);
    const b = $('#gp-actions'); if (b) b.innerHTML = goalActions(c, ctx);
  };
  const goalActions = (c, ctx) => {
    const gp = c.goalPlan; if (!gp) return '';
    const a = ctx.assessment;
    const ready = gp.kind === 'weight' ? a && a.verdict !== 'incomplete' && a.verdict !== 'na' : !!(gp.title || '').trim();
    let h = '';
    if (gp.status === 'approved') {
      h += '<div class="callout ok" style="flex:1 1 100%">' + ic('check') + '<div><b>Cíl je odsouhlasen' + (gp.approvedAt ? ' ' + NT.fmtDate(gp.approvedAt) : '') + '.</b> <span class="sm">Promítá se do stavového pruhu nahoře.</span></div></div>' +
        '<button class="btn" type="button" data-act="gp-revoke">Vrátit k úpravám</button><button class="btn" type="button" data-act="gp-achieved">' + ic('flag', 'ico-sm') + 'Označit jako splněný</button>';
    } else if (gp.status === 'achieved') {
      h += '<div class="callout ok" style="flex:1 1 100%">' + ic('flag') + '<div><b>Cíl byl splněn.</b> <span class="sm">Zapiš vyhodnocení v kroku „Vyhodnocení“ nahoře a nastav nový cíl.</span></div></div><button class="btn" type="button" data-act="gp-revoke">Znovu otevřít</button>';
    } else {
      h += '<button class="btn btn-primary" type="button" data-act="gp-approve"' + (ready ? '' : ' disabled') + '>' + ic('check', 'ico-sm') + 'Odsouhlasit cíl</button>' +
        (a && a.earliestComfort && a.verdict !== 'realistic' && a.verdict !== 'incomplete' ? '<button class="btn" type="button" data-act="gp-use-date">Použít pohodlný termín (' + NT.fmtDate(a.earliestComfort) + ')</button>' : '');
      if (!ready) h += '<span class="xs muted">Odsouhlasit jde, jakmile je cíl vyplněný.</span>';
    }
    if (gp.kind === 'weight' && ctx.needs.ok && a && a.kcalPerDay && a.verdict !== 'incomplete') h += '<button class="btn" type="button" data-act="gp-needs">' + ic('target', 'ico-sm') + 'Nastavit energii podle cíle</button>';
    h += '<button class="btn btn-ghost btn-danger" type="button" data-act="gp-drop">' + ic('trash', 'ico-sm') + 'Zrušit cíl</button>';
    return h;
  };
  App.goalTabHtml = function (c, ctx) {
    const gp = c.goalPlan;
    const j = NT.journeyOf(c);
    let h = '';
    if (!gp) {
      h += '<div class="empty">' + ic('target', 'ico-lg') + '<h3>Klient zatím nemá cíl</h3><p>Nastav cíl a termín. Aplikace posoudí, jestli je reálný, a po odsouhlasení ho promítne do stavového pruhu. U cíle s hmotností se hlídá tempo, deficit a BMI.</p>' +
        '<div class="row" style="justify-content:center"><button class="btn btn-primary" type="button" data-act="gp-create" data-k="weight">' + ic('scale', 'ico-sm') + 'Cíl s hmotností</button><button class="btn" type="button" data-act="gp-create" data-k="custom">' + ic('flag', 'ico-sm') + 'Jiný cíl (vlastní text)</button></div></div>';
    } else {
      const f = (label, inner, cls) => '<label class="f ' + (cls || '') + '">' + label + inner + '</label>';
      h += '<div class="grid split-56"><div class="stack"><div class="card"><div class="card-h"><h2>Cíl klienta</h2><div class="seg" role="group" aria-label="Druh cíle"><button type="button" data-act="gp-kind" data-k="weight" aria-pressed="' + (gp.kind === 'weight') + '">Hmotnost</button><button type="button" data-act="gp-kind" data-k="custom" aria-pressed="' + (gp.kind !== 'weight') + '">Jiný cíl</button></div></div>';
      if (gp.kind === 'weight') {
        h += '<div class="form-grid">' +
          f('Počáteční hmotnost (kg)', '<input type="number" data-in="gp.startWeight" data-fid="gp-sw" min="30" max="300" step="0.1" inputmode="decimal" value="' + esc(gp.startWeight == null ? '' : gp.startWeight) + '">') +
          f('Počáteční datum', '<input type="date" data-ch="gp.startDate" value="' + esc(gp.startDate || '') + '">') +
          f('Cílová hmotnost (kg)', '<input type="number" data-in="gp.targetWeight" data-fid="gp-tw" min="30" max="300" step="0.1" inputmode="decimal" value="' + esc(gp.targetWeight == null ? '' : gp.targetWeight) + '">') +
          f('Cílové datum (horizont)', '<input type="date" data-ch="gp.targetDate" value="' + esc(gp.targetDate || '') + '">') + '</div>' +
          '<div class="row" style="margin-top:10px;gap:6px"><span class="muted sm">Horizont od začátku:</span>' + [8, 12, 16, 24, 36].map((w) => '<button class="chip" type="button" data-act="gp-horizon" data-w="' + w + '">' + w + ' týdnů</button>').join('') + '</div>';
      } else {
        h += '<div class="form-grid">' + f('Cíl (vlastními slovy)', '<input type="text" data-in="gp.title" data-fid="gp-title" maxlength="140" placeholder="např. pravidelná snídaně, méně sladkého, víc energie" value="' + esc(gp.title || '') + '">', 'span-all') +
          f('Termín (volitelný)', '<input type="date" data-ch="gp.targetDate" value="' + esc(gp.targetDate || '') + '">') + '</div>';
      }
      h += '<div class="form-grid" style="margin-top:12px">' + f('Poznámka k cíli<span class="hint">Např. proč je pro klienta důležitý, co s ním bylo domluveno</span>', '<textarea data-in="gp.note" data-fid="gp-note" rows="2">' + esc(gp.note || '') + '</textarea>', 'span-all') + '</div>' +
        '<div class="row" style="margin-top:14px" id="gp-actions">' + goalActions(c, ctx) + '</div></div>' +
        '<p class="xs muted">Posouzení je orientační pomůcka podle obvyklých pravidel (tempo v % hmotnosti za týden, deficit vůči výdeji, BMI). Nenahrazuje tvůj odborný úsudek ani lékařské posouzení.</p></div>' +
        '<div class="card" id="goal-assess">' + App.goalAssessHtml(c, ctx) + '</div></div>';
    }
    // kontroly
    const chk = ctx.js.checkup;
    h += '<div class="card" style="margin-top:16px"><div class="card-h"><h2>Pravidelné kontroly</h2><label class="f inline-in" style="flex-direction:row;align-items:center;gap:8px">Interval<input type="number" data-ch="j.interval" min="3" max="120" step="1" value="' + j.checkInterval + '" style="width:84px" aria-label="Interval kontrol ve dnech"> dní</label><button class="btn btn-primary btn-sm" type="button" data-act="chk-new">' + ic('plus', 'ico-sm') + 'Zapsat kontrolu</button></div>';
    if (chk.due) h += '<p class="sm" style="margin-bottom:10px">Další kontrola do <b>' + NT.fmtDate(chk.due) + '</b>' + (chk.overdue ? ' <span class="badge bad">po termínu o ' + chk.overdue + ' ' + plural(chk.overdue, 'den', 'dny', 'dní') + '</span>' : '') + '.</p>';
    else h += '<p class="sm muted" style="margin-bottom:10px">Kontroly se plánují od sezení k jídelníčku. Označ ho nahoře ve stavovém pruhu.</p>';
    if (j.checkups.length) {
      h += '<div class="stack-sm">' + j.checkups.slice().reverse().map((x, ri) => { const i = j.checkups.length - 1 - ri; return '<div class="list-row" style="cursor:default;padding:8px 4px"><span class="badge info">' + esc(NT.fmtDate(x.date)) + '</span><span class="grow sm">' + (x.note ? esc(x.note) : '<span class="muted">bez poznámky</span>') + '</span><button class="btn btn-ghost btn-icon btn-sm btn-danger" type="button" data-act="chk-del" data-i="' + i + '" aria-label="Smazat kontrolu z ' + esc(NT.fmtDate(x.date)) + '">' + ic('trash', 'ico-sm') + '</button></div>'; }).join('') + '</div>';
    } else h += '<p class="sm muted">Zatím nebyla zapsána žádná kontrola.</p>';
    h += '</div>';
    return h;
  };
  App.A['chk-new'] = () => App.openCheckup(S.route.id);
  App.A['gp-create'] = (t) => { const c = Store.get('clients', S.route.id); const gp = ensureGp(c); gp.kind = t.dataset.k; Store.put('clients', c); App.rerender(); };
  App.A['gp-kind'] = (t) => gpSet((gp) => { gp.kind = t.dataset.k; }, false);
  App.A['gp-horizon'] = (t) => { const c = Store.get('clients', S.route.id); const gp = ensureGp(c); gpSet((g) => { g.targetDate = NT.addDays(gp.startDate || NT.today(), +t.dataset.w * 7); }, true); App.rerender(); };
  App.A['gp-use-date'] = () => { const c = Store.get('clients', S.route.id); const a = App.clientCtx(c).assessment; if (a && a.earliestComfort) { gpSet((g) => { g.targetDate = a.earliestComfort; }, true); App.rerender(); } };
  App.IN['gp.startWeight'] = (t) => gpSet((g) => { g.startWeight = num(t.value); });
  App.IN['gp.targetWeight'] = (t) => gpSet((g) => { g.targetWeight = num(t.value); });
  App.IN['gp.title'] = (t) => gpSet((g) => { g.title = t.value; });
  App.IN['gp.note'] = (t) => gpSet((g) => { g.note = t.value; }, true);
  App.CH['gp.startDate'] = (t) => { gpSet((g) => { g.startDate = t.value; }, true); App.rerender(); };
  App.CH['gp.targetDate'] = (t) => { gpSet((g) => { g.targetDate = t.value; }, true); App.rerender(); };
  App.A['gp-approve'] = async () => {
    const c = Store.get('clients', S.route.id); const gp = c.goalPlan; const ctx = App.clientCtx(c);
    if (gp.kind === 'weight') {
      const a = ctx.assessment;
      if (!a || a.verdict === 'incomplete') { App.toast('Nejdřív vyplň hmotnosti a data', { kind: 'bad' }); return; }
      if (a.verdict === 'unrealistic') {
        const ok = await App.confirm({ title: 'Cíl vychází jako nereálný', text: a.messages.filter((m) => m.level === 'bad').map((m) => m.text).join('\n') + '\n\nOpravdu ho přesto odsouhlasit? Zvaž pohodlnější termín nebo mírnější cíl.', ok: 'Odsouhlasit přesto', danger: true });
        if (!ok) return;
      }
      gp.approvedVerdict = a.verdict;
    } else if (!(gp.title || '').trim()) { App.toast('Napiš cíl vlastními slovy', { kind: 'bad' }); return; }
    gp.status = 'approved'; gp.approvedAt = NT.today();
    Store.put('clients', c); App.rerender(); App.toast('Cíl odsouhlasen a promítnut do stavového pruhu');
  };
  App.A['gp-revoke'] = () => { const c = Store.get('clients', S.route.id); c.goalPlan.status = 'draft'; c.goalPlan.approvedAt = null; Store.put('clients', c); App.rerender(); };
  App.A['gp-achieved'] = async () => {
    const ok = await App.confirm({ title: 'Označit cíl jako splněný?', text: 'Cíl zůstane uložený. Potom můžeš zapsat vyhodnocení a nastavit nový cíl.', ok: 'Splněno' }); if (!ok) return;
    const c = Store.get('clients', S.route.id); c.goalPlan.status = 'achieved'; c.goalPlan.achievedAt = NT.today(); Store.put('clients', c); App.rerender(); App.toast('Cíl splněn');
  };
  App.A['gp-drop'] = async () => {
    const ok = await App.confirm({ title: 'Zrušit cíl?', text: 'Cíl s posouzením se smaže. Stavový pruh se vrátí na krok „Cíl odsouhlasen“.', ok: 'Zrušit cíl', danger: true }); if (!ok) return;
    const c = Store.get('clients', S.route.id); delete c.goalPlan; Store.put('clients', c); App.rerender();
  };
  App.A['gp-needs'] = async () => {
    const c = Store.get('clients', S.route.id); const ctx = App.clientCtx(c); const a = ctx.assessment;
    const tdee = ctx.needs.avgTdee; const want = NT.clamp(Math.round((a.kcalPerDay / tdee) * 100), -35, 25);
    const old = ctx.needs.needs.goalPct;
    const ok = await App.confirm({ title: 'Přenést cíl do výpočtu potřeb?', text: 'Cíl vychází na ' + (a.kcalPerDay < 0 ? 'deficit ' : 'přebytek ') + fmt(Math.abs(a.kcalPerDay)) + ' kcal denně, tedy ' + (want > 0 ? '+' : '') + want + ' % oproti výdeji. V potřebách je teď nastaveno ' + (old > 0 ? '+' : '') + String(old).replace('.', ',') + ' %. Nastavit ' + (want > 0 ? '+' : '') + want + ' %?', ok: 'Nastavit' }); if (!ok) return;
    c.needs = Object.assign(NT.defaultNeeds(c.goal), c.needs || {}); c.needs.goalPct = want; Store.put('clients', c); App.rerender(); App.toast('Změna energie v potřebách nastavena na ' + (want > 0 ? '+' : '') + want + ' %');
  };

  // ------------------------------------------------------------ detail klienta: uložit + záložky
  App.A['client-save'] = async () => {
    const c = Store.get('clients', S.route.id); if (!c) return;
    if (!(c.name || '').trim()) { App.toast('Klient potřebuje jméno nebo označení', { kind: 'bad' }); const el = $('[data-fid="c-name"]'); if (el) { S.ui.clientTab = 'profile'; App.rerender(); const e2 = $('[data-fid="c-name"]'); if (e2) e2.focus(); } return; }
    c.updatedAt = new Date().toISOString();
    Store.put('clients', c);
    const ok = await Store.flush();
    const miss = [];
    const nd = App.needsOf(c); if (!nd.ok) miss.push(nd.missing.join(', '));
    App.toast(ok ? 'Klient uložen ' + new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) + (miss.length ? '. Pro výpočet potřeb ještě chybí: ' + miss.join(', ') + '.' : '.') : 'Uložení se nepodařilo, zkus to znovu', ok ? { ms: miss.length ? 5200 : 3200 } : { kind: 'bad' });
    App.refreshStatus();
  };
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      if (!S.ready) return;
      e.preventDefault();
      if (S.route.page === 'client') App.A['client-save']();
      else Store.flush().then((ok) => App.toast(ok ? 'Uloženo' : 'Uložení se nepodařilo', ok ? {} : { kind: 'bad' }));
    }
  });
  const _refresh = App.refreshStatus;
  App.refreshStatus = function () {
    _refresh();
    const el = $('#client-savestate');
    if (el) el.innerHTML = '<span class="dot ' + Store.status + '" style="margin:0"></span> ' + App.saveLabel(Store.status);
  };

  App.views.client = function () {
    const c = Store.get('clients', S.route.id);
    if (!c) return App.emptyBox('Klient nenalezen', 'Možná byl smazán.', '<button class="btn" type="button" data-act="nav" data-page="clients">Zpět na klienty</button>');
    let tab = S.ui.clientTab;
    if (['profile', 'goal', 'plans', 'track'].indexOf(tab) < 0) tab = S.ui.clientTab = 'profile';
    const ctx = App.clientCtx(c);
    const cur = ctx.cur;
    const age = NT.ageOn(c.birth);
    const sub = [NT.GOAL_LABEL[c.goal], age != null ? age + ' let' : '', cur.weight ? fmt(cur.weight, 1) + ' kg' : '', c.heightCm ? c.heightCm + ' cm' : ''].filter(Boolean).join(' · ');
    let h = App.pageHead(esc(c.name) + (c.demo ? ' <span class="badge info" style="vertical-align:middle">Ukázka</span>' : '') + (c.archived ? ' <span class="badge">Archivován</span>' : ''), esc(sub),
      '<span class="muted sm row nw" id="client-savestate" aria-live="polite"><span class="dot ' + Store.status + '" style="margin:0"></span> ' + App.saveLabel(Store.status) + '</span>' +
      '<button class="btn btn-primary" type="button" data-act="client-save" title="Uložit klienta (Ctrl+S)">' + ic('save', 'ico-sm') + 'Uložit</button>' +
      '<button class="btn btn-sm" type="button" data-act="client-archive" data-id="' + c.id + '">' + (c.archived ? 'Obnovit z archivu' : 'Archivovat') + '</button><button class="btn btn-sm btn-danger" type="button" data-act="client-delete" data-id="' + c.id + '">' + ic('trash', 'ico-sm') + 'Smazat</button>',
      App.crumb('Klienti', 'nav', 'data-page="clients"'));
    h += App.journeyHtml(c, ctx);
    h += '<div class="tabs" role="tablist">' + [['profile', 'Profil a potřeby', 'target'], ['goal', 'Cíl a průběh', 'flag'], ['plans', 'Jídelníčky', 'list'], ['track', 'Sledování', 'chart']].map(([k, l, i]) =>
      '<button class="tab" role="tab" type="button" data-act="client-tab" data-tab="' + k + '" aria-selected="' + (tab === k) + '">' + ic(i, 'ico-sm') + l + '</button>').join('') + '</div>';
    if (tab === 'profile') h += App.profileHtml(c);
    else if (tab === 'goal') h += App.goalTabHtml(c, ctx);
    else if (tab === 'plans') h += App.plansTabHtml(c);
    else h += App.trackHtml(c);
    return h;
  };
  // změny údajů klienta mají hned přepočítat stavový pruh (krok „Vstupní data“)
  ['c.sex', 'c.birth', 'c.weight', 'c.bf'].forEach((k) => {
    const f = App.CH[k]; if (!f) return;
    App.CH[k] = (t, e) => { f(t, e); App.refreshJourney(); };
  });
  const _hIn = App.IN['c.heightCm'];
  if (_hIn) App.IN['c.heightCm'] = (t, e) => { _hIn(t, e); App.refreshJourney(); };

  // ------------------------------------------------------------ PŘEHLED
  const agendaBtn = (kind) => ({
    checkup: ['Zapsat kontrolu', 'checkup'], plan: ['Navrhnout jídelníček', 'plan'], data: ['Doplnit údaje', 'tab-profile'], goal: ['Nastavit cíl', 'tab-goal'],
    weight: ['Zapsat měření', 'tab-track'], track: ['Otevřít sledování', 'tab-track'], needs: ['Upravit potřeby', 'tab-profile'], intake: ['Zapsat sezení', 'gate'], session: ['Zapsat sezení', 'gate'], eval: ['Vyhodnotit', 'gate']
  }[kind] || ['Otevřít', 'open']);
  App.A['dash-do'] = (t) => {
    const cid = t.dataset.id, act = t.dataset.k;
    S.ui.clientTab = 'profile';
    if (act === 'plan') { App.openPlanGen(cid); return; }
    if (act === 'checkup') { App.go('client', { id: cid, tab: 'goal' }); App.openCheckup(cid); return; }
    if (act === 'tab-goal') { App.go('client', { id: cid, tab: 'goal' }); return; }
    if (act === 'tab-track') { App.go('client', { id: cid, tab: 'track' }); return; }
    if (act === 'gate') { App.go('client', { id: cid, tab: 'goal' }); const c = Store.get('clients', cid); const key = t.dataset.g; const j = NT.journeyOf(c); const cu = j.gates[key]; App.openModal({ type: 'gate', cid, key, done: !!(cu && cu.date), date: (cu && cu.date) || NT.today(), note: (cu && cu.note) || '' }); return; }
    App.go('client', { id: cid, tab: 'profile' });
  };
  App.A['dash-stage'] = (t) => { S.ui.dashStage = S.ui.dashStage === t.dataset.s ? '' : t.dataset.s; App.rerender(); };
  App.A['dash-more'] = () => { S.ui.dashAll = !S.ui.dashAll; App.rerender(); };

  App.views.dashboard = function () {
    const clients = App.clients(false);
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Dobrou noc' : hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Dobrý den' : 'Dobrý večer';
    const today = NT.today();
    let h = App.pageHead(greet, 'Dnes je ' + new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.',
      '<button class="btn btn-primary" type="button" data-act="client-new">' + ic('plus') + 'Nový klient</button>');
    if (Store.mode !== 'db' && Store.mode !== 'api') {
      h += '<div style="margin-bottom:16px">' + App.callout('warn', Store.mode === 'local'
        ? '<b>Data se ukládají jen v tomto prohlížeči.</b> Databáze artefaktu není k dispozici. Pravidelně si stahuj zálohu v Nastavení.'
        : '<b>Data se neukládají trvale.</b> Po zavření stránky zmizí. Stáhni si zálohu v Nastavení.') + '</div>';
    }
    if (!clients.length) {
      h += '<div class="empty">' + ic('users', 'ico-lg') + '<h3>Začni prvním klientem</h3><p>Zadej základní údaje, aplikace spočítá potřeby energie a živin. Potom nastavíš cíl, necháš si navrhnout jídelníček a pošleš ho klientovi jako PDF. Přehled se pak sám zaplní úkoly a termíny.</p>' +
        '<div class="row" style="justify-content:center"><button class="btn btn-primary" type="button" data-act="client-new">' + ic('plus') + 'Nový klient</button><button class="btn" type="button" data-act="demo-load">' + ic('wand') + 'Načíst ukázkového klienta</button></div>' +
        '<p class="xs">Ukázkový klient má vymyšlená data a slouží k vyzkoušení. Kdykoli ho smažeš.</p></div>';
      return h + libraryCard();
    }
    // data klientů
    const rows = clients.map((c) => { const ctx = App.clientCtx(c); return { c, ctx, stage: App.stageOf(ctx.js) }; });
    const todo = [];
    rows.forEach((r) => r.ctx.agenda.forEach((it) => todo.push({ r, it })));
    const rank = { bad: 0, warn: 1, info: 2 };
    todo.sort((a, b) => rank[a.it.level] - rank[b.it.level] || NT.norm(a.r.c.name).localeCompare(NT.norm(b.r.c.name), 'cs'));
    const urgent = todo.filter((x) => x.it.level !== 'info');
    const overdueChecks = rows.filter((r) => r.ctx.js.checkup.overdue > 0);
    const dueSoon = rows.filter((r) => r.ctx.js.checkup.due && !r.ctx.js.checkup.overdue && NT.daysBetween(today, r.ctx.js.checkup.due) <= 7);
    const goals = rows.filter((r) => r.c.goalPlan && r.c.goalPlan.status === 'approved' && r.ctx.assessment && r.ctx.assessment.progress);
    const behind = goals.filter((r) => r.ctx.assessment.progress.state === 'behind');
    const noPlan = rows.filter((r) => !r.ctx.hasPlan);
    // KPI
    const kpi = (v, l, sub, cls, ico) => '<div class="stat kpi ' + (cls || '') + '"><span class="kpi-i">' + ic(ico, 'ico-sm') + '</span><span class="v">' + v + '</span><span class="l">' + l + '</span>' + (sub ? '<span class="kpi-s">' + sub + '</span>' : '') + '</div>';
    h += '<div class="grid g4" style="margin-bottom:18px">' +
      kpi(clients.length, plural(clients.length, 'aktivní klient', 'aktivní klienti', 'aktivních klientů'), noPlan.length ? noPlan.length + ' ' + plural(noPlan.length, 'zatím bez jídelníčku', 'zatím bez jídelníčku', 'zatím bez jídelníčku') : 'všichni mají jídelníček', '', 'users') +
      kpi(urgent.length, 'k řešení teď', urgent.length ? urgent.filter((x) => x.it.level === 'bad').length + ' naléhavých' : 'nic nehoří', urgent.length ? (urgent.some((x) => x.it.level === 'bad') ? 'bad' : 'warn') : 'ok', 'alert') +
      kpi(overdueChecks.length, 'kontrol po termínu', dueSoon.length ? dueSoon.length + ' ' + plural(dueSoon.length, 'další do týdne', 'další do týdne', 'dalších do týdne') : 'v nejbližším týdnu žádná další', overdueChecks.length ? 'bad' : 'ok', 'calendar') +
      kpi(goals.length ? goals.length - behind.length + ' / ' + goals.length : '–', 'cílů na cestě', goals.length ? (behind.length ? behind.length + ' ' + plural(behind.length, 'pozadu', 'pozadu', 'pozadu') : 'žádný není pozadu') : 'zatím žádný odsouhlasený cíl', behind.length ? 'warn' : '', 'target') + '</div>';

    // pipeline
    const counts = {}; rows.forEach((r) => { counts[r.stage] = (counts[r.stage] || 0) + 1; });
    h += '<div class="card" style="margin-bottom:18px;padding:14px 16px"><div class="card-h" style="margin-bottom:10px"><h2>Kde klienti jsou</h2><span class="muted sm">Klikni na fázi a seznam klientů se zúží</span></div><div class="pipeline" role="group" aria-label="Fáze spolupráce">' +
      STAGE_ORDER.map((k) => '<button type="button" class="pipe ' + (counts[k] ? 'has' : '') + '" data-act="dash-stage" data-s="' + k + '" aria-pressed="' + (S.ui.dashStage === k) + '"><span class="pn">' + (counts[k] || 0) + '</span><span class="pl">' + esc(App.STAGE_LABEL[k]) + '</span></button>').join('') + '</div></div>';

    // úkoly + termíny
    const shown = S.ui.dashAll ? todo : todo.slice(0, 8);
    const dl = [];
    rows.forEach((r) => {
      const ck = r.ctx.js.checkup;
      if (ck.due && NT.daysBetween(today, ck.due) <= 21) dl.push({ date: ck.due, text: 'Kontrola', r, over: ck.overdue > 0 });
      const gp = r.c.goalPlan;
      if (gp && gp.status === 'approved' && gp.targetDate && NT.daysBetween(today, gp.targetDate) <= 30) dl.push({ date: gp.targetDate, text: 'Termín cíle', r, over: gp.targetDate < today });
    });
    dl.sort((a, b) => (a.date < b.date ? -1 : 1));
    h += '<div class="grid split-57" style="margin-bottom:18px"><div class="card"><div class="card-h"><h2>Co udělat</h2><span class="badge ' + (urgent.length ? (urgent.some((x) => x.it.level === 'bad') ? 'bad' : 'warn') : 'ok') + '">' + todo.length + '</span></div>';
    if (!todo.length) h += '<p class="muted">Nic nehoří. U klientů nejsou žádná upozornění ani otevřené kroky.</p>';
    else {
      h += '<div class="agenda">' + shown.map((x) => {
        const [lab, key] = agendaBtn(x.it.kind);
        return '<div class="ag ' + x.it.level + '"><span class="ag-i">' + ic(x.it.level === 'info' ? 'right' : 'alert', 'ico-sm') + '</span><span class="grow"><b>' + esc(x.r.c.name) + '</b><br><span class="sm muted">' + esc(x.it.text) + '</span></span><button class="btn btn-sm" type="button" data-act="dash-do" data-id="' + x.r.c.id + '" data-k="' + key + '" data-g="' + esc(x.it.kind) + '">' + esc(lab) + '</button></div>';
      }).join('') + '</div>';
      if (todo.length > 8) h += '<div style="margin-top:8px"><button class="btn btn-sm btn-ghost" type="button" data-act="dash-more">' + (S.ui.dashAll ? 'Zobrazit méně' : 'Zobrazit všech ' + todo.length) + '</button></div>';
    }
    h += '</div><div class="card"><div class="card-h"><h2>Nejbližší termíny</h2></div>';
    if (!dl.length) h += '<p class="muted sm">V příštích třech týdnech není naplánováno nic. Termíny kontrol se objeví po sezení k jídelníčku, termíny cílů po jejich odsouhlasení.</p>';
    else h += '<div class="stack-sm">' + dl.slice(0, 8).map((d) => {
      const left = NT.daysBetween(today, d.date);
      return '<button class="list-row" type="button" data-act="client-open" data-id="' + d.r.c.id + '" style="padding:9px 4px;border-radius:6px"><span class="dt"><b>' + esc(shortD(d.date)) + '</b></span><span class="grow"><b>' + esc(d.text) + '</b>, ' + esc(d.r.c.name) + '</span><span class="badge ' + (d.over ? 'bad' : left <= 3 ? 'warn' : '') + '">' + (left < 0 ? 'před ' + (-left) + ' ' + plural(-left, 'dnem', 'dny', 'dny') : left === 0 ? 'dnes' : 'za ' + left + ' ' + plural(left, 'den', 'dny', 'dní')) + '</span></button>';
    }).join('') + '</div>';
    h += '</div></div>';

    // karty klientů
    let list = rows;
    if (S.ui.dashStage) list = rows.filter((r) => r.stage === S.ui.dashStage);
    const urg = (r) => (r.ctx.agenda.length ? rank[r.ctx.agenda[0].level] : 3);
    list = list.slice().sort((a, b) => urg(a) - urg(b));
    h += '<div class="card-h" style="margin-bottom:10px"><h2>Klienti' + (S.ui.dashStage ? ': ' + esc(App.STAGE_LABEL[S.ui.dashStage]) : '') + '</h2><button class="btn btn-sm" type="button" data-act="nav" data-page="clients">Všichni klienti</button></div>';
    if (!list.length) h += App.emptyBox('V této fázi nikdo není', 'Zruš výběr fáze nahoře.', '');
    else h += '<div class="grid g-auto" style="margin-bottom:18px">' + list.map((r) => clientCard(r)).join('') + '</div>';
    h += libraryCard(rows);
    return h;
  };
  const clientCard = (r) => {
    const c = r.c, ctx = r.ctx, js = ctx.js, gp = c.goalPlan;
    const ser = NT.weightSeries(ctx.track.measures).slice(-12).map((p) => p.weight);
    const first = ctx.agenda[0];
    let goal = '';
    if (gp && gp.status === 'approved' && gp.kind === 'weight') {
      const a = ctx.assessment; const p = a && a.progress;
      goal = '<div class="cc-goal"><div class="row nw sm" style="justify-content:space-between"><span>' + ic('target', 'ico-sm') + ' ' + fmt(gp.startWeight, 1) + ' → <b>' + fmt(gp.targetWeight, 1) + ' kg</b> do ' + esc(shortD(gp.targetDate)) + '</span>' + (p ? '<span class="badge ' + (p.state === 'behind' ? 'warn' : 'ok') + '">' + (p.state === 'behind' ? 'pozadu' : p.state === 'ahead' ? 'před plánem' : 'v plánu') + '</span>' : '') + '</div>' + (p ? bar(p.done * 100, p.state === 'behind' ? 'warn' : '', 'Splněno ' + fmt(p.done * 100) + ' % cíle') : '') + '</div>';
    } else if (gp && gp.status === 'approved') goal = '<div class="cc-goal sm">' + ic('flag', 'ico-sm') + ' ' + esc(gp.title || 'Cíl') + '</div>';
    else goal = '<div class="cc-goal sm muted">Cíl zatím není odsouhlasen</div>';
    return '<div class="card cc"><button class="cc-main" type="button" data-act="client-open" data-id="' + c.id + '" aria-label="Otevřít klienta ' + esc(c.name) + '"><div class="row nw" style="gap:10px"><span class="avatar">' + esc(App.initials(c.name)) + '</span><span class="grow" style="min-width:0"><b class="cc-name">' + esc(c.name) + '</b>' + (c.demo ? ' <span class="badge info">Ukázka</span>' : '') + '<br><span class="sm muted">' + esc(App.STAGE_LABEL[r.stage]) + (ctx.weight ? ' · ' + fmt(ctx.weight, 1) + ' kg' : '') + '</span></span>' + spark(ser, 84, 28) + '</div>' +
      segBar(js) + goal + '</button><div class="cc-next ' + (first ? first.level : 'ok') + '">' + ic(first ? (first.level === 'info' ? 'right' : 'alert') : 'check', 'ico-sm') + '<span>' + esc(first ? first.text : 'Vše v pořádku') + '</span></div></div>';
  };
  const libraryCard = (rows) => {
    const foods = S.cat.foods; const own = foods.filter((f) => f.origin !== 'nutridb' && f.origin !== 'curated' && !App.isBaseFood(f)).length;
    const nd = foods.filter((f) => f.origin === 'nutridb').length;
    const unver = foods.filter((f) => !App.isBaseFood(f) && !f.verified).length;
    const recipes = S.cat.recipes; const labeled = recipes.filter((r) => (r.mealTypes || []).length).length;
    const drinks = recipes.filter((r) => (r.mealTypes || []).indexOf('Nápoj') >= 0).length;
    let h = '<div class="card"><div class="card-h"><h2>Knihovna</h2></div><div class="grid g4">' +
      '<button class="stat lib" type="button" data-act="nav" data-page="foods"><span class="v">' + foods.length + '</span><span class="l">potravin (' + nd + ' z NutriDatabáze, ' + own + ' vlastních' + (unver ? ', ' + unver + ' neověřených' : '') + ')</span></button>' +
      '<button class="stat lib" type="button" data-act="nav" data-page="recipes"><span class="v">' + recipes.length + '</span><span class="l">receptů (' + labeled + ' se štítkem jídla' + (drinks ? ', ' + drinks + ' nápojů' : '') + ')</span></button>' +
      '<button class="stat lib" type="button" data-act="nav" data-page="templates"><span class="v">' + S.cat.templates.length + '</span><span class="l">šablon dnů a jídel</span></button>' +
      '<button class="stat lib" type="button" data-act="nav" data-page="settings"><span class="v">' + Store.list('plans').length + '</span><span class="l">jídelníčků celkem, zálohu stáhneš v Nastavení</span></button></div></div>';
    void rows;
    return h;
  };

  // ------------------------------------------------------------ NÁVRH JÍDELNÍČKU
  const spreadTrain = (n, train) => {
    const idx = new Set();
    for (let i = 0; i < train; i++) idx.add(Math.min(n - 1, Math.floor((i + 0.5) * n / train)));
    return Array.from({ length: n }, (_, i) => (idx.has(i) ? 'training' : 'rest'));
  };
  const genNow = (m) => {
    const c = Store.get('clients', m.cid);
    const needs = App.needsOf(c);
    m.needs = needs;
    m.res = NT.generatePlan({ client: c, needs, foods: S.cat.foods, recipes: S.cat.recipes, ctx: App.ctx(), days: m.days, preset: m.preset, seed: m.seed, dayTypes: spreadTrain(m.days, Math.min(m.train, m.days)) });
  };
  App.openPlanGen = function (cid) {
    const c = Store.get('clients', cid);
    const needs = App.needsOf(c);
    const m = { type: 'planGen', cid, name: 'Navržený jídelníček ' + NT.fmtDate(NT.today()), days: 7, preset: 'five', train: needs.ok && needs.needs.trainingKcal > 0 ? NT.clamp(needs.needs.trainingDays || 0, 0, 7) : 0, seed: 1, res: null };
    genNow(m);
    App.openModal(m);
  };
  App.A['plan-gen'] = (t) => { const m = S.modals[S.modals.length - 1]; if (m && m.type === 'planNew') App.closeModal(m); App.openPlanGen(t.dataset.cid || (m && m.cid)); };
  App.modals.planGen = (m) => {
    const c = Store.get('clients', m.cid);
    const res = m.res; const ctx = App.ctx();
    const st = res.stats;
    const vscore = st.score >= 85 ? 'ok' : st.score >= 60 ? 'warn' : 'bad';
    let h = '<div class="form-grid" style="margin-bottom:14px">' +
      '<label class="f span-all">Název<input type="text" id="pg-name" data-in="pg-name" data-fid="pgn" value="' + esc(m.name) + '"></label>' +
      '<label class="f">Počet dnů<select data-ch="pg-days">' + [1, 2, 3, 4, 5, 6, 7, 10, 14].map((n) => '<option value="' + n + '"' + (n === m.days ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
      '<label class="f">Jídel za den<select data-ch="pg-preset"><option value="five"' + (m.preset === 'five' ? ' selected' : '') + '>5</option><option value="four"' + (m.preset === 'four' ? ' selected' : '') + '>4</option><option value="three"' + (m.preset === 'three' ? ' selected' : '') + '>3</option></select></label>' +
      '<label class="f">Tréninkových dnů v týdnu<select data-ch="pg-train">' + [0, 1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (n === m.train ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label></div>';
    h += '<div class="pg-sum"><div class="pg-score ' + vscore + '"><span class="v">' + st.score + ' %</span><span class="l">pestrost</span></div><div class="sm grow">' +
      '<b>' + st.distinct + ' různých jídel z ' + st.slots + '</b>, ' + st.proteinSources + ' ' + plural(st.proteinSources, 'různý zdroj bílkovin', 'různé zdroje bílkovin', 'různých zdrojů bílkovin') + ' v receptech.<br>' +
      '<span class="muted">Návrh bere jen recepty a potraviny, které vyhovují alergiím, stravovacímu stylu a nechutím klienta. Opakování stejného jídla nebo bílkoviny v po sobě jdoucích dnech se penalizuje. Potraviny z NutriDatabáze se do návrhu nepoužívají, jen ověřené běžné.</span></div></div>';
    if (!m.needs.ok) h += '<div style="margin:10px 0">' + App.callout('warn', '<b>Cíle klienta zatím nejdou spočítat</b> (chybí: ' + esc(m.needs.missing.join(', ')) + '). Návrh počítá s orientačními 2 000 kcal.') + '</div>';
    res.notes.forEach((n) => { h += '<div style="margin:8px 0">' + App.callout('warn', esc(n)) + '</div>'; });
    if (st.repeats.length) h += '<p class="sm muted" style="margin:8px 0">Opakuje se: ' + st.repeats.slice(0, 4).map((r) => esc(r.name) + ' (' + r.count + '×)').join(', ') + '.</p>';
    h += '<div class="stack-sm" style="margin-top:10px">' + res.days.map((d, i) => {
      const pd = st.perDay[i]; const tg = pd.target;
      const recs = NT.mealRecommendations(d.meals, { kcal: tg });
      return '<details class="adv"' + (m.days <= 2 ? ' open' : '') + '><summary><b>' + esc(d.name) + '</b>' + (d.dayType === 'training' ? ' ' + ic('flag', 'ico-sm') : '') + ' <span class="num">' + fmt(pd.kcal) + ' / ' + fmt(tg) + ' kcal</span> <span class="badge ' + LV[pd.verdict.level] + '">' + esc(pd.verdict.text) + '</span> <span class="muted sm num">B ' + fmt(pd.protein) + ' g</span></summary><div class="in">' +
        d.meals.map((meal, mi) => {
          const kc = NT.mealTotals(meal, ctx).total.kcal; const ms = NT.mealEnergyStatus(kc, recs[mi].kcal);
          return '<div class="pg-meal"><div class="row nw" style="justify-content:space-between;gap:8px"><b>' + esc(meal.name) + '</b><span class="sm num">' + fmt(kc) + ' kcal <span class="muted">(doporučeno ≈ ' + fmt(recs[mi].kcal) + ')</span> <span class="badge ' + LV[ms.level] + '">' + esc(ms.text) + '</span></span></div><div class="sm muted">' +
            (meal.items.length ? meal.items.map((it) => { const ic2 = NT.itemCalc(it, ctx); return esc(ic2.name) + (it.type === 'recipe' ? ' ×' + String(it.servings).replace('.', ',') : ' ' + it.grams + ' g'); }).join(' + ') : 'nic se nepodařilo navrhnout') + '</div></div>';
        }).join('') + '</div></details>';
    }).join('') + '</div>';
    void c;
    return {
      title: 'Navrhnout jídelníček', size: 'wide', body: h,
      footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn" type="button" data-act="pg-reroll" style="margin-right:auto">' + ic('refresh', 'ico-sm') + 'Jiný návrh</button><button class="btn btn-primary" type="button" data-act="pg-create">Vytvořit jídelníček</button>', focus: '#pg-name'
    };
  };
  const pgm = () => { const m = S.modals[S.modals.length - 1]; return m && m.type === 'planGen' ? m : null; };
  App.IN['pg-name'] = (t) => { const m = pgm(); if (m) m.name = t.value; };
  App.CH['pg-days'] = (t) => { const m = pgm(); if (!m) return; m.days = +t.value; genNow(m); App.renderModal(); };
  App.CH['pg-preset'] = (t) => { const m = pgm(); if (!m) return; m.preset = t.value; genNow(m); App.renderModal(); };
  App.CH['pg-train'] = (t) => { const m = pgm(); if (!m) return; m.train = +t.value; genNow(m); App.renderModal(); };
  App.A['pg-reroll'] = () => { const m = pgm(); if (!m) return; m.seed += 1; genNow(m); App.renderModal(); App.toast('Nový návrh'); };
  App.A['pg-create'] = () => {
    const m = pgm(); if (!m) return;
    const plan = { id: NT.uid('p'), clientId: m.cid, name: (m.name || '').trim() || 'Navržený jídelníček', days: JSON.parse(JSON.stringify(m.res.days)), comment: '', tips: '', generated: true, createdAt: new Date().toISOString() };
    App.touchPlan(plan);
    App.closeAll(); S.ui.dayIdx = 0;
    App.go('plan', { id: plan.id, tab: 'editor' });
    App.toast('Jídelníček vytvořen. Zkontroluj ho a uprav podle klienta.', { ms: 5000 });
  };
})(typeof window !== 'undefined' ? window : globalThis);
