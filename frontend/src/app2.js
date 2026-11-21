/* Jídelníček – aplikace, část 2: jídelníčky, editor, výběr položek, výměny, doplnění, AI návrhy jídel. */
(function (root) {
  'use strict';
  const NT = root.NT, App = NT.App, Store = NT.Store, S = App.S;
  const esc = NT.esc, fmt = NT.fmt, ic = App.ic, $ = App.$, $$ = App.$$;
  const MK = [['protein', 'B', 'Bílkoviny'], ['fat', 'T', 'Tuky'], ['carbs', 'S', 'Sacharidy']];

  const getPlan = () => Store.get('plans', S.route.id);
  const getClientOf = (plan) => Store.get('clients', plan.clientId);
  const curDay = (plan) => plan.days[Math.min(S.ui.dayIdx, plan.days.length - 1)] || plan.days[0];
  const findMeal = (day, id) => day.meals.find((m) => m.id === id);
  const kcalTxt = (n) => fmt(n.kcal) + ' kcal';
  const macrosHtml = (n) => '<span class="macros">' + MK.map(([k, a]) => '<span>' + App.macroSw(k) + a + ' ' + fmt(n[k]) + '</span>').join('') + '</span>';

  // ------------------------------------------------------------ jídelníčky klienta
  App.plansTabHtml = function (c) {
    const plans = App.plansOf(c.id);
    let h = '<div class="row" style="margin-bottom:14px"><button class="btn btn-primary" type="button" data-act="plan-gen" data-cid="' + c.id + '">' + ic('wand') + 'Navrhnout jídelníček</button><button class="btn" type="button" data-act="plan-new" data-cid="' + c.id + '">' + ic('plus') + 'Nový prázdný jídelník</button></div>';
    const needs = App.needsOf(c);
    if (!needs.ok) h += '<div style="margin-bottom:14px">' + App.callout('info', 'Cíle klienta zatím nejdou spočítat (chybí: ' + needs.missing.join(', ') + '). Jídelník můžeš sestavit i bez nich, ale nebude se porovnávat s cílem.') + '</div>';
    if (!plans.length) return h + App.emptyBox('Zatím žádný jídelníček', 'Vytvoř první jídelníček. Aplikace připraví dny a jídla, ty vybereš potraviny a recepty.', '');
    h += '<div class="grid g-auto">' + plans.map((p) => {
      const avg = NT.planAverage(p, App.ctx());
      return '<div class="card" style="display:flex;flex-direction:column;gap:10px"><div><h3>' + esc(p.name) + '</h3><div class="muted sm">' + p.days.length + ' ' + NT.plural(p.days.length, 'den', 'dny', 'dnů') + ' · upraveno ' + esc(NT.fmtDate((p.updatedAt || '').slice(0, 10))) + '</div></div>' +
        (avg.count ? '<div class="sm">Průměr: <b class="num">' + fmt(avg.avg.kcal) + ' kcal</b><br>' + macrosHtml(avg.avg) + '</div>' : '<div class="sm muted">Zatím prázdný</div>') +
        '<div class="row" style="margin-top:auto"><button class="btn btn-primary btn-sm" type="button" data-act="plan-open" data-id="' + p.id + '">Otevřít</button><button class="btn btn-sm" type="button" data-act="plan-dup" data-id="' + p.id + '">' + ic('copy', 'ico-sm') + 'Kopie</button><button class="btn btn-sm btn-ghost btn-danger" type="button" data-act="plan-del" data-id="' + p.id + '" aria-label="Smazat jídelník">' + ic('trash', 'ico-sm') + '</button></div></div>';
    }).join('') + '</div>';
    return h;
  };

  App.modals.planNew = (m) => {
    const others = Store.list('plans').filter((p) => p.clientId === m.cid);
    return {
      title: 'Nový jídelník', size: '',
      body: '<div class="form-grid"><label class="f span-all">Název<input type="text" id="np-name" data-fid="npn" value="' + esc(m.name) + '"></label>' +
        '<label class="f">Počet dnů<select id="np-days">' + [1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (n === m.days ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
        '<label class="f">Jídel za den<select id="np-meals"><option value="five">5 (snídaně, 2 svačiny, oběd, večeře)</option><option value="four">4 (snídaně, oběd, svačina, večeře)</option><option value="three">3 (snídaně, oběd, večeře)</option></select></label>' +
        '<label class="f">Z toho tréninkových dnů<select id="np-train">' + [0, 1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (n === m.train ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
        (others.length ? '<label class="f">Vycházet z<select id="np-from"><option value="">Prázdný jídelník</option>' + others.map((p) => '<option value="' + p.id + '">Kopie: ' + esc(p.name) + '</option>').join('') + '</select></label>' : '') + '</div>' +
        '<p class="muted sm" style="margin-top:12px">Počet dnů a jídel se dá kdykoli změnit v editoru. Tréninkové dny se rozmístí rovnoměrně.</p><div class="hr"></div><button class="btn" type="button" data-act="plan-gen" data-cid="' + m.cid + '">' + ic('wand', 'ico-sm') + 'Raději nech jídelníček navrhnout automaticky</button>',
      footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="plan-create">Vytvořit a otevřít</button>', focus: '#np-name'
    };
  };
  App.A['plan-new'] = (t) => {
    const c = Store.get('clients', t.dataset.cid);
    const needs = App.needsOf(c);
    App.openModal({ type: 'planNew', cid: c.id, name: 'Jídelníček ' + NT.fmtDate(NT.today()), days: 7, train: needs.ok && needs.needs.trainingKcal > 0 ? NT.clamp(needs.needs.trainingDays || 0, 0, 7) : 0 });
  };
  App.A['plan-create'] = () => {
    const m = S.modals[S.modals.length - 1];
    const name = ($('#np-name').value || '').trim() || 'Jídelníček';
    const n = +$('#np-days').value, train = Math.min(+$('#np-train').value, n), preset = $('#np-meals').value;
    const from = $('#np-from') ? $('#np-from').value : '';
    let plan;
    if (from) {
      const src = Store.get('plans', from);
      plan = JSON.parse(JSON.stringify(src));
      plan.id = NT.uid('p'); plan.name = name; plan.createdAt = new Date().toISOString();
      plan.days = plan.days.map((d) => NT.cloneDay(d));
      delete plan.demo;
    } else {
      const trainIdx = new Set();
      for (let i = 0; i < train; i++) trainIdx.add(Math.min(n - 1, Math.floor((i + 0.5) * n / train)));
      const days = [];
      for (let i = 0; i < n; i++) days.push(NT.newDay(n === 7 ? NT.WEEKDAYS[i] : 'Den ' + (i + 1), trainIdx.has(i) ? 'training' : 'rest', preset));
      plan = { id: NT.uid('p'), clientId: m.cid, name, days, comment: '', tips: '', createdAt: new Date().toISOString() };
    }
    plan.clientId = m.cid;
    App.touchPlan(plan);
    App.closeAll();
    S.ui.dayIdx = 0;
    App.go('plan', { id: plan.id, tab: 'editor' });
  };
  App.A['plan-open'] = (t) => { S.ui.dayIdx = 0; App.go('plan', { id: t.dataset.id, tab: 'editor' }); };
  App.A['plan-dup'] = (t) => {
    const src = Store.get('plans', t.dataset.id);
    const p = JSON.parse(JSON.stringify(src));
    p.id = NT.uid('p'); p.name = src.name + ' (kopie)'; p.createdAt = new Date().toISOString(); p.days = p.days.map((d) => NT.cloneDay(d)); delete p.demo;
    App.touchPlan(p); App.rerender(); App.toast('Jídelník zkopírován');
  };
  App.A['plan-del'] = async (t) => {
    const p = Store.get('plans', t.dataset.id);
    const ok = await App.confirm({ title: 'Smazat jídelník „' + p.name + '“?', text: 'Jídelník se nenávratně smaže.', ok: 'Smazat', danger: true });
    if (!ok) return;
    Store.remove('plans', p.id);
    if (S.route.page === 'plan') App.go('client', { id: p.clientId }); else App.rerender();
    App.toast('Jídelník smazán');
  };

  // ------------------------------------------------------------ vyhodnocení dne a panel cílů
  App.dayEval = function (plan, client, day) {
    const needs = App.needsOf(client);
    const tot = NT.dayTotals(day, App.ctx());
    let target = null, ev = null, rem = null;
    if (needs.ok) {
      target = day.dayType === 'training' ? needs.training : needs.rest;
      ev = NT.evaluate(tot.total, target);
      rem = { kcal: target.kcal - tot.total.kcal, protein: target.protein - tot.total.protein, fat: target.fat - tot.total.fat, carbs: target.carbs - tot.total.carbs };
    }
    return { needs, tot, target, ev, rem, split: NT.energySplit(tot.total) };
  };

  const meter = (label, color, d, unit, dec, limit, tip) => {
    const pct = d.target > 0 ? d.value / d.target * 100 : 0;
    const w = Math.min(125, pct) / 125 * 100;
    return '<div class="meter"><div class="meter-top"><span class="l">' + (color ? App.macroSw(color) : '') + esc(label) + '</span><span class="v">' + fmt(d.value, dec) + ' / ' + (limit ? (limit === 'min' ? 'min. ' : 'max. ') : '') + fmt(d.target, dec) + ' ' + unit + '</span><span class="st ' + d.status + '">' + App.stIcon(d.status) + App.stText(d.status, d.dir, limit === 'max') + '</span></div>' +
      '<div class="track" role="img" aria-label="' + esc(label) + ': ' + fmt(pct) + ' % cíle"><div class="fill' + (pct > 100 && !limit ? ' over' : '') + '" style="width:' + w.toFixed(1) + '%;' + (color ? '--c-x:var(--c-' + color + ')' : (limit && d.status !== 'ok' ? '--c-x:var(--bad)' : '--c-x:var(--accent)')) + '"></div><div class="tick" style="left:80%"></div></div></div>';
  };

  App.panelHtml = function (plan, client, day) {
    const E = App.dayEval(plan, client, day);
    const tot = E.tot.total;
    let h = '<div class="card" style="padding:16px"><div class="row" style="margin-bottom:10px"><h3 class="grow">Cíle dne</h3><span class="badge ' + (day.dayType === 'training' ? 'info' : '') + '">' + NT.DAY_TYPES[day.dayType] + '</span></div>';
    if (E.ev) {
      const e = E.ev.kcal;
      h += '<div class="row nw" style="align-items:baseline;gap:8px;margin-bottom:6px"><span class="kcal-big">' + fmt(tot.kcal) + '</span><span class="muted">/ ' + fmt(E.target.kcal) + ' kcal</span><span class="sp"></span><span class="st ' + e.status + '">' + App.stIcon(e.status) + App.stText(e.status, e.dir) + '</span></div>' +
        '<div class="sm" style="margin:-2px 0 8px;font-weight:600" data-k="dv">' + esc(NT.dayEnergyVerdict(tot.kcal, E.target.kcal).text) + '</div><div class="track" style="margin-bottom:14px" role="img" aria-label="Energie: ' + fmt(e.pct) + ' % cíle"><div class="fill' + (e.pct > 100 ? ' over' : '') + '" style="width:' + (Math.min(125, e.pct) / 125 * 100).toFixed(1) + '%;--c-x:var(--accent)"></div><div class="tick" style="left:80%"></div></div>';
      h += '<div class="stack" style="gap:11px">' + meter('Bílkoviny', 'protein', E.ev.protein, 'g', 0) + meter('Tuky', 'fat', E.ev.fat, 'g', 0) + meter('Sacharidy', 'carbs', E.ev.carbs, 'g', 0) +
        meter('Vláknina', 'fiber', E.ev.fiber, 'g', 0, 'min') + meter('Sůl', null, E.ev.salt, 'g', 1, 'max') + meter('Nasycené tuky', null, E.ev.satFat, 'g', 0, 'max') + '</div>';
      const rem = E.rem;
      h += '<div class="hr"></div><div class="sm">' + (rem.kcal >= 0 ? '<b>Zbývá doplnit:</b> <span class="num">' + fmt(rem.kcal) + ' kcal · B ' + fmt(Math.max(0, rem.protein)) + ' g · T ' + fmt(Math.max(0, rem.fat)) + ' g · S ' + fmt(Math.max(0, rem.carbs)) + ' g</span>' : '<b>Nad cílem o ' + fmt(-rem.kcal) + ' kcal.</b>') + '</div>';
    } else {
      h += '<div class="kcal-big" style="margin-bottom:8px">' + fmt(tot.kcal) + ' <span class="muted" style="font-size:15px;font-weight:400">kcal</span></div>' +
        '<div class="sm num" style="margin-bottom:10px">B ' + fmt(tot.protein) + ' g · T ' + fmt(tot.fat) + ' g · S ' + fmt(tot.carbs) + ' g · vláknina ' + fmt(tot.fiber) + ' g · sůl ' + fmt(tot.salt, 1) + ' g</div>' +
        App.callout('info', 'Bez cílů klienta se jídelníček neporovnává. <button class="btn btn-sm" type="button" data-act="plan-to-needs" style="margin-top:6px">Nastavit potřeby klienta</button>');
    }
    const sp = E.split;
    if (tot.kcal > 0) {
      h += '<div class="hr"></div><div class="split" role="img" aria-label="Podíl energie: bílkoviny ' + fmt(sp.protein) + ' %, tuky ' + fmt(sp.fat) + ' %, sacharidy ' + fmt(sp.carbs + sp.fiber) + ' %"><i style="width:' + sp.protein.toFixed(1) + '%;background:var(--c-protein)"></i><i style="width:' + sp.fat.toFixed(1) + '%;background:var(--c-fat)"></i><i style="width:' + (sp.carbs + sp.fiber).toFixed(1) + '%;background:var(--c-carbs)"></i></div>' +
        '<div class="legend" style="margin-top:6px"><span>' + App.macroSw('protein') + 'B <b>' + fmt(sp.protein) + ' %</b></span><span>' + App.macroSw('fat') + 'T <b>' + fmt(sp.fat) + ' %</b></span><span>' + App.macroSw('carbs') + 'S <b>' + fmt(sp.carbs + sp.fiber) + ' %</b></span><span class="muted">podíl energie</span></div>';
    }
    h += '</div>';

    // upozornění
    const notes = [];
    if (E.tot.missing.length) notes.push(['info', 'U některých potravin chybí údaj: ' + E.tot.missing.map((k) => NT.NLABEL[k].replace('z toho ', '').toLowerCase()).join(', ') + '. Součet těchto živin může být nižší, než je skutečnost.']);
    const unv = new Set();
    day.meals.forEach((m) => m.items.forEach((it) => NT.itemFoods(it, App.ctx()).forEach((f) => { if (f.source === 'ai' && !f.verified) unv.add(f.name); })));
    if (unv.size) notes.push(['warn', 'Ve dni jsou potraviny s hodnotami odhadnutými AI a dosud neověřené (' + unv.size + '). Zkontroluj je v databázi potravin.']);
    let gone = 0; day.meals.forEach((m) => m.items.forEach((it) => { if (!NT.itemCalc(it, App.ctx()).ok) gone++; }));
    if (gone) notes.push(['bad', gone + ' ' + NT.plural(gone, 'položka odkazuje', 'položky odkazují', 'položek odkazuje') + ' na smazanou potravinu nebo recept.']);
    const hard = [], soft = [];
    day.meals.forEach((m) => m.items.forEach((it) => { const fl = NT.itemFlags(it, client, App.ctx()); const nm = NT.itemCalc(it, App.ctx()).name; if (fl.allergens.length) hard.push(nm + ' (' + fl.allergens.map((a) => NT.ALLERGEN_LABEL[a]).join(', ') + ')'); else if (NT.hasFlags(fl)) soft.push(nm); }));
    if (hard.length) notes.push(['bad', '<b>Alergen:</b> ' + hard.map(esc).join('; ')]);
    if (soft.length) notes.push(['warn', 'Nechuť nebo nevhodné pro dietu: ' + soft.map(esc).join('; ')]);
    if (notes.length) h += '<div class="stack-sm">' + notes.map(([k, t]) => '<div class="callout ' + k + '">' + ic(k === 'info' ? 'info' : 'alert') + '<div class="sm">' + (k === 'bad' && t.indexOf('<b>') === 0 ? t : esc(t).replace(/&lt;b&gt;/g, '<b>')) + '</div></div>').join('') + '</div>';
    // nástroje
    h += '<div class="card" style="padding:12px"><div class="stack-sm"><h4>Asistent</h4>' +
      '<button class="btn btn-sm" type="button" data-act="assist-fill"' + (E.rem ? '' : ' disabled') + '>' + ic('wand', 'ico-sm') + 'Co doplnit do cíle</button>' +
      '<button class="btn btn-sm" type="button" data-act="assist-fit"' + (E.rem && tot.kcal > 0 ? '' : ' disabled') + '>' + ic('target', 'ico-sm') + 'Doladit množství na cíl</button>' +
      (App.aiAvailable() ? '<button class="btn btn-sm btn-ai" type="button" data-act="ai-day">' + ic('sparkle', 'ico-sm') + 'AI: doplnit zbytek dne</button>' : '') +
      (E.rem ? '' : '<p class="xs muted">Asistent potřebuje spočítané cíle klienta.</p>') + '</div></div>';
    return h;
  };

  // ------------------------------------------------------------ editor
  const itemRow = function (plan, client, day, meal, it) {
    const ctx = App.ctx();
    const c = NT.itemCalc(it, ctx);
    const fl = NT.itemFlags(it, client, ctx);
    const cls = fl.allergens.length || !c.ok ? ' bad-item' : NT.hasFlags(fl) ? ' warn-item' : '';
    const subs = [];
    if (!c.ok) subs.push('<span class="badge bad">Smazáno</span>');
    if (c.kind === 'recipe') subs.push('<span class="badge accent">Recept</span>');
    if (c.food && c.food.source === 'ai' && !c.food.verified) subs.push('<span class="badge ai">Odhad AI</span>');
    NT.flagTexts(fl).forEach((x) => subs.push('<span class="badge ' + (fl.allergens.length ? 'bad' : 'warn') + '">' + esc(x) + '</span>'));
    if (c.missing && c.missing.length) subs.push('<span class="sub" title="Chybí: ' + esc(c.missing.map((k) => NT.NLABEL[k]).join(', ')) + '">neúplné údaje</span>');
    const hh = it.type === 'food' && c.food ? NT.householdText(c.food, it.grams) : '';
    if (hh) subs.push('<span class="sub" data-k="ih-' + it.id + '">' + esc(hh) + '</span>');
    const amt = it.type === 'recipe'
      ? '<span class="amt"><input type="number" aria-label="Počet porcí" data-in="it-amt" data-m="' + meal.id + '" data-i="' + it.id + '" min="0.5" max="10" step="0.5" value="' + (it.servings || 1) + '"> porcí</span>'
      : '<span class="amt"><input type="number" aria-label="Gramy" data-in="it-amt" data-m="' + meal.id + '" data-i="' + it.id + '" min="1" max="2000" step="5" inputmode="decimal" value="' + (it.grams || 0) + '"> g</span>';
    return '<div class="item' + cls + '" data-item="' + it.id + '"><div><div class="nm">' + esc(c.name) + '</div><div class="row" style="gap:5px;margin-top:2px">' + subs.join('') + '</div></div>' + amt +
      '<span class="kc num right" data-k="ik-' + it.id + '"><b>' + fmt(c.n.kcal) + '</b> <span class="muted xs">kcal</span></span><span data-k="im-' + it.id + '">' + macrosHtml(c.n) + '</span>' +
      '<span class="row nw" style="gap:0;justify-content:flex-end">' + (it.type === 'food' && c.ok ? '<button class="btn btn-ghost btn-icon btn-sm" type="button" title="Navrhnout náhradu" aria-label="Navrhnout náhradu" data-act="item-swap" data-m="' + meal.id + '" data-i="' + it.id + '">' + ic('swap', 'ico-sm') + '</button>' : '') +
      '<button class="btn btn-ghost btn-icon btn-sm" type="button" title="Posunout nahoru" aria-label="Posunout nahoru" data-act="item-up" data-m="' + meal.id + '" data-i="' + it.id + '">' + ic('up', 'ico-sm') + '</button>' +
      '<button class="btn btn-ghost btn-icon btn-sm" type="button" title="Posunout dolů" aria-label="Posunout dolů" data-act="item-down" data-m="' + meal.id + '" data-i="' + it.id + '">' + ic('down', 'ico-sm') + '</button>' +
      '<button class="btn btn-ghost btn-icon btn-sm btn-danger" type="button" title="Odebrat" aria-label="Odebrat" data-act="item-del" data-m="' + meal.id + '" data-i="' + it.id + '">' + ic('trash', 'ico-sm') + '</button></span></div>';
  };

  const mealRecHtml = function (kcal, rec) {
    if (!rec || !(rec.kcal > 0)) return '';
    const st = NT.mealEnergyStatus(kcal, rec.kcal);
    const lv = st.level === 'muted' ? '' : st.level;
    return '<span class="mrec" title="Doporučená energie jídla je podíl z cíle dne: ' + fmt(rec.lo) + ' až ' + fmt(rec.hi) + ' kcal je v pořádku">doporučeno ≈ ' + fmt(rec.kcal) + ' kcal</span>' + (st.text ? '<span class="badge ' + lv + '">' + esc(st.text) + '</span>' : '');
  };
  const recsOf = function (plan, client, day) {
    const E = App.dayEval(plan, client, day);
    return new Map(NT.mealRecommendations(day.meals, E.target ? { kcal: E.target.kcal } : null).map((r) => [r.id, r]));
  };
  const mealHtml = function (plan, client, day, meal, rec) {
    const mt = NT.mealTotals(meal, App.ctx()).total;
    return '<section class="meal" data-meal="' + meal.id + '"><div class="meal-h"><input class="mname" type="text" aria-label="Název jídla" data-in="meal-name" data-m="' + meal.id + '" data-fid="mn-' + meal.id + '" value="' + esc(meal.name) + '">' +
      '<input class="mtime" type="time" aria-label="Čas jídla" data-ch="meal-time" data-m="' + meal.id + '" value="' + esc(meal.time || '') + '"><span class="meal-sum" data-k="ms-' + meal.id + '">' + (meal.items.length ? fmt(mt.kcal) + ' kcal · B ' + fmt(mt.protein) + ' · T ' + fmt(mt.fat) + ' · S ' + fmt(mt.carbs) : 'prázdné') + '</span><span class="mrec-w" data-k="mr-' + meal.id + '">' + mealRecHtml(mt.kcal, rec) + '</span><span class="sp"></span>' +
      '<button class="btn btn-ghost btn-icon btn-sm" type="button" title="Uložit jídlo jako šablonu" aria-label="Uložit jídlo jako šablonu" data-act="meal-tpl" data-m="' + meal.id + '">' + ic('layers', 'ico-sm') + '</button>' +
      '<button class="btn btn-ghost btn-icon btn-sm" type="button" title="Duplikovat jídlo" aria-label="Duplikovat jídlo" data-act="meal-dup" data-m="' + meal.id + '">' + ic('copy', 'ico-sm') + '</button>' +
      '<button class="btn btn-ghost btn-icon btn-sm btn-danger" type="button" title="Smazat jídlo" aria-label="Smazat jídlo" data-act="meal-del" data-m="' + meal.id + '">' + ic('trash', 'ico-sm') + '</button></div>' +
      meal.items.map((it) => itemRow(plan, client, day, meal, it)).join('') +
      '<div class="meal-f"><button class="btn btn-sm btn-primary" type="button" data-act="pick-open" data-m="' + meal.id + '">' + ic('plus', 'ico-sm') + 'Přidat potravinu nebo recept</button>' +
      (App.aiAvailable() ? '<button class="btn btn-sm btn-ai" type="button" data-act="pick-open" data-m="' + meal.id + '" data-tab="ai">' + ic('sparkle', 'ico-sm') + 'Navrhnout AI</button>' : '') + '</div></section>';
  };

  App.planHeader = function (plan, client) {
    const tabs = [['editor', 'Editor', 'edit'], ['week', 'Přehled týdne', 'chart'], ['shop', 'Nákupní seznam', 'cart'], ['out', 'Výstup pro klienta', 'file']];
    let h = App.pageHead('<input type="text" data-in="plan-name" data-fid="plan-name" class="head-font" value="' + esc(plan.name) + '" aria-label="Název jídelníčku" style="font-size:22px;font-weight:600;border-color:transparent;background:transparent;padding:2px 6px;margin-left:-6px;min-height:40px">',
      'Klient: <b>' + esc(client.name) + '</b> · ' + esc(NT.GOAL_LABEL[client.goal] || ''),
      '<button class="btn btn-sm" type="button" data-act="plan-dup" data-id="' + plan.id + '">' + ic('copy', 'ico-sm') + 'Kopie</button><button class="btn btn-sm btn-danger" type="button" data-act="plan-del" data-id="' + plan.id + '">' + ic('trash', 'ico-sm') + 'Smazat</button>',
      App.crumb(client.name, 'plan-back'));
    h += '<div class="tabs" role="tablist">' + tabs.map(([k, l, i]) => '<button class="tab" role="tab" type="button" data-act="plan-tab" data-tab="' + k + '" aria-selected="' + (S.ui.planTab === k) + '">' + ic(i, 'ico-sm') + l + '</button>').join('') + '</div>';
    return h;
  };

  App.views.plan = function () {
    const plan = getPlan();
    if (!plan) return App.emptyBox('Jídelníček nenalezen', '', '<button class="btn" type="button" data-act="nav" data-page="clients">Zpět na klienty</button>');
    const client = getClientOf(plan);
    if (!client) return App.emptyBox('Klient tohoto jídelníčku už neexistuje', '', '<button class="btn" type="button" data-act="nav" data-page="clients">Zpět na klienty</button>');
    if (S.ui.dayIdx >= plan.days.length) S.ui.dayIdx = Math.max(0, plan.days.length - 1);
    let h = App.planHeader(plan, client);
    const tab = S.ui.planTab;
    if (tab === 'week') h += App.weekHtml(plan, client);
    else if (tab === 'shop') h += App.shopHtml(plan, client);
    else if (tab === 'out') h += App.outHtml(plan, client);
    else h += App.editorHtml(plan, client);
    return h;
  };
  App.A['plan-back'] = () => { const p = getPlan(); S.ui.clientTab = 'plans'; App.go('client', { id: p.clientId }); };
  App.A['plan-tab'] = (t) => { S.ui.planTab = t.dataset.tab; App.rerender(); };
  App.A['plan-to-needs'] = () => { const p = getPlan(); S.ui.clientTab = 'profile'; App.go('client', { id: p.clientId }); };
  App.IN['plan-name'] = (t) => { const p = getPlan(); p.name = t.value; App.touchPlan(p); };

  App.editorHtml = function (plan, client) {
    const day = curDay(plan);
    const E = App.dayEval(plan, client, day);
    let h = '';
    const alerts = NT.planAlerts(plan, client, App.ctx()).filter((a) => a.hard);
    if (alerts.length) h += '<div style="margin-bottom:12px">' + App.callout('bad', '<b>V jídelníčku je ' + alerts.length + ' ' + NT.plural(alerts.length, 'položka', 'položky', 'položek') + ' s alergenem klienta.</b> ' + alerts.slice(0, 3).map((a) => esc(a.day + ' › ' + a.item)).join('; ') + (alerts.length > 3 ? '…' : '')) + '</div>';
    h += '<div class="stick-sum" id="stick-sum">' + App.stickHtml(E) + '</div><div class="editor"><div class="stack gap-lg" id="ed-main"><div>' + App.dayTabsHtml(plan, client) + '</div>' + App.dayBodyHtml(plan, client, day) + '</div><aside class="panel" id="panel" aria-label="Cíle dne">' + App.panelHtml(plan, client, day) + '</aside></div>';
    return h;
  };
  App.stickHtml = (E) => {
    const t = E.tot.total;
    return '<b>' + fmt(t.kcal) + '</b>' + (E.target ? ' / ' + fmt(E.target.kcal) : '') + ' kcal<span>B ' + fmt(t.protein) + '</span><span>T ' + fmt(t.fat) + '</span><span>S ' + fmt(t.carbs) + '</span>' + (E.ev ? '<span class="st ' + E.ev.kcal.status + '">' + App.stIcon(E.ev.kcal.status) + App.stText(E.ev.kcal.status, E.ev.kcal.dir) + '</span>' : '') + '<button class="btn btn-sm btn-ghost" type="button" data-act="goto-panel" style="margin-left:auto">Detail ' + ic('down', 'ico-sm') + '</button>';
  };
  App.dayTabsHtml = function (plan, client) {
    return '<div class="daytabs" role="tablist" aria-label="Dny">' + plan.days.map((d, i) => {
      const dt = NT.dayTotals(d, App.ctx()).total;
      return '<button class="daytab" role="tab" type="button" data-act="day-sel" data-i="' + i + '" aria-selected="' + (i === S.ui.dayIdx) + '"><span class="n">' + esc(d.name) + (d.dayType === 'training' ? ' ' + ic('flag', 'ico-sm') : '') + '</span><span class="k" data-k="dt-' + d.id + '">' + (dt.kcal ? fmt(dt.kcal) + ' kcal' : 'prázdný') + '</span></button>';
    }).join('') + '<button class="btn btn-sm" type="button" data-act="day-add">' + ic('plus', 'ico-sm') + 'Den</button></div>';
  };
  App.dayBodyHtml = function (plan, client, day) {
    let h = '<div class="card flat" style="padding:12px"><div class="row"><input type="text" data-in="day-name" data-fid="dn-' + day.id + '" value="' + esc(day.name) + '" aria-label="Název dne" class="head-font" style="max-width:220px;font-weight:600">' +
      '<div class="seg" role="group" aria-label="Typ dne"><button type="button" data-act="day-type" data-t="rest" aria-pressed="' + (day.dayType !== 'training') + '">Odpočinkový</button><button type="button" data-act="day-type" data-t="training" aria-pressed="' + (day.dayType === 'training') + '">Tréninkový</button></div><span class="sp"></span>' +
      '<button class="btn btn-sm" type="button" data-act="day-dup">' + ic('copy', 'ico-sm') + 'Duplikovat den</button><button class="btn btn-sm" type="button" data-act="day-tpl">' + ic('layers', 'ico-sm') + 'Uložit jako šablonu</button>' +
      '<button class="btn btn-sm btn-danger" type="button" data-act="day-del"' + (plan.days.length < 2 ? ' disabled' : '') + '>' + ic('trash', 'ico-sm') + 'Smazat den</button></div></div>';
    const recs = recsOf(plan, client, day);
    h += day.meals.map((m) => mealHtml(plan, client, day, m, recs.get(m.id))).join('');
    h += '<div class="row"><button class="btn" type="button" data-act="meal-add">' + ic('plus') + 'Přidat jídlo</button></div>';
    return h;
  };
  // jemná aktualizace čísel bez překreslení (kvůli zachování fokusu při psaní)
  App.patchPlan = function () {
    const plan = getPlan(); if (!plan || S.route.page !== 'plan' || S.ui.planTab !== 'editor') return;
    const client = getClientOf(plan), day = curDay(plan), ctx = App.ctx();
    const recs = recsOf(plan, client, day);
    const setH = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
    day.meals.forEach((m) => {
      m.items.forEach((it) => {
        const c = NT.itemCalc(it, ctx);
        setH('[data-k="ik-' + it.id + '"]', '<b>' + fmt(c.n.kcal) + '</b> <span class="muted xs">kcal</span>');
        setH('[data-k="im-' + it.id + '"]', macrosHtml(c.n));
        if (it.type === 'food' && c.food) { const hh = NT.householdText(c.food, it.grams); const el = $('[data-k="ih-' + it.id + '"]'); if (el) el.textContent = hh; }
      });
      const mt = NT.mealTotals(m, ctx).total;
      const rr = $('[data-k="mr-' + m.id + '"]'); if (rr) rr.innerHTML = mealRecHtml(mt.kcal, recs.get(m.id));
      const el = $('[data-k="ms-' + m.id + '"]'); if (el) el.textContent = m.items.length ? fmt(mt.kcal) + ' kcal · B ' + fmt(mt.protein) + ' · T ' + fmt(mt.fat) + ' · S ' + fmt(mt.carbs) : 'prázdné';
    });
    plan.days.forEach((d) => { const el = $('[data-k="dt-' + d.id + '"]'); if (el) { const k = NT.dayTotals(d, ctx).total.kcal; el.textContent = k ? fmt(k) + ' kcal' : 'prázdný'; } });
    setH('#panel', App.panelHtml(plan, client, day));
    setH('#stick-sum', App.stickHtml(App.dayEval(plan, client, day)));
  };

  // ---- handlery editoru
  const mealIn = (id) => { const plan = getPlan(); const day = curDay(plan); return { plan, day, meal: findMeal(day, id) }; };
  App.A['day-sel'] = (t) => { S.ui.dayIdx = +t.dataset.i; App.rerender(); };
  App.IN['day-name'] = (t) => { const p = getPlan(); curDay(p).name = t.value; App.touchPlan(p); const tab = $$('.daytab')[S.ui.dayIdx]; if (tab) tab.querySelector('.n').firstChild.textContent = t.value; };
  App.A['day-type'] = (t) => { const p = getPlan(); curDay(p).dayType = t.dataset.t; App.touchPlan(p); App.rerender(); };
  App.A['day-dup'] = () => { const p = getPlan(); const d = curDay(p); const c = NT.cloneDay(d, d.name + ' (kopie)'); p.days.splice(S.ui.dayIdx + 1, 0, c); S.ui.dayIdx++; App.touchPlan(p); App.rerender(); App.toast('Den zkopírován'); };
  App.A['day-del'] = async () => {
    const p = getPlan(); const d = curDay(p);
    const has = d.meals.some((m) => m.items.length);
    const ok = !has || await App.confirm({ title: 'Smazat den „' + d.name + '“?', text: 'Smaže se i s obsahem všech jídel.', ok: 'Smazat', danger: true });
    if (!ok) return;
    p.days.splice(S.ui.dayIdx, 1); S.ui.dayIdx = Math.max(0, S.ui.dayIdx - 1); App.touchPlan(p); App.rerender();
  };
  App.modals.dayAdd = (m) => {
    const tpls = S.cat.templates.filter((t) => t.kind === 'day');
    return {
      title: 'Přidat den', size: '',
      body: '<div class="form-grid"><label class="f span-all">Název<input type="text" id="da-name" data-fid="dan" value="' + esc(m.name) + '"></label>' +
        '<label class="f">Typ dne<select id="da-type"><option value="rest">Odpočinkový</option><option value="training">Tréninkový</option></select></label>' +
        '<label class="f">Jídel<select id="da-preset"><option value="five">5</option><option value="four">4</option><option value="three">3</option></select></label>' +
        '<label class="f span-all">Obsah<select id="da-src"><option value="blank">Prázdný den</option>' + (m.hasMeals ? '<option value="copy">Kopie aktuálního dne</option>' : '') + tpls.map((t) => '<option value="t:' + t.id + '">Šablona: ' + esc(t.name) + '</option>').join('') + '</select></label></div>',
      footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="day-create">Přidat den</button>', focus: '#da-name'
    };
  };
  App.A['day-add'] = () => { const p = getPlan(); App.openModal({ type: 'dayAdd', name: 'Den ' + (p.days.length + 1), hasMeals: curDay(p).meals.some((m) => m.items.length) }); };
  App.applyTemplateToDay = function (tpl, name, type, preset) {
    const d = NT.newDay(name, type || tpl.dayType || 'rest', preset);
    d.meals = (tpl.data.meals || []).map((m) => ({ id: NT.uid('m'), name: m.name, time: m.time || '', items: (m.items || []).map((i) => Object.assign({}, i, { id: NT.uid('i') })) }));
    return d;
  };
  App.A['day-create'] = () => {
    const p = getPlan();
    const name = ($('#da-name').value || '').trim() || 'Nový den', type = $('#da-type').value, preset = $('#da-preset').value, src = $('#da-src').value;
    let d;
    if (src === 'copy') { d = NT.cloneDay(curDay(p), name); d.dayType = type; }
    else if (src.indexOf('t:') === 0) { const tpl = S.cat.templates.find((x) => x.id === src.slice(2)); d = App.applyTemplateToDay(tpl, name, type, preset); }
    else d = NT.newDay(name, type, preset);
    p.days.push(d); S.ui.dayIdx = p.days.length - 1; App.touchPlan(p); App.closeAll(); App.rerender();
  };
  App.A['meal-add'] = () => { const p = getPlan(); const d = curDay(p); d.meals.push(NT.newMeal('Jídlo ' + (d.meals.length + 1), '')); App.touchPlan(p); App.rerender(); };
  App.IN['meal-name'] = (t) => { const { plan, meal } = mealIn(t.dataset.m); meal.name = t.value; App.touchPlan(plan); };
  App.CH['meal-time'] = (t) => { const { plan, meal } = mealIn(t.dataset.m); meal.time = t.value; App.touchPlan(plan); };
  App.A['meal-dup'] = (t) => { const { plan, day } = mealIn(t.dataset.m); const i = day.meals.findIndex((m) => m.id === t.dataset.m); const c = NT.cloneMeal(day.meals[i]); c.name += ' (kopie)'; day.meals.splice(i + 1, 0, c); App.touchPlan(plan); App.rerender(); };
  App.A['meal-del'] = async (t) => {
    const { plan, day, meal } = mealIn(t.dataset.m);
    const ok = !meal.items.length || await App.confirm({ title: 'Smazat jídlo „' + meal.name + '“?', text: 'Odeberou se i všechny jeho položky.', ok: 'Smazat', danger: true });
    if (!ok) return;
    day.meals = day.meals.filter((m) => m.id !== meal.id); App.touchPlan(plan); App.rerender();
  };
  App.IN['it-amt'] = (t) => {
    const { plan, meal } = mealIn(t.dataset.m);
    const it = meal.items.find((i) => i.id === t.dataset.i); if (!it) return;
    const v = NT.toNum(t.value);
    const val = v == null || v < 0 ? 0 : v;
    if (it.type === 'recipe') it.servings = val; else it.grams = val;
    App.touchPlan(plan); App.patchPlan();
  };
  const moveItem = (t, dir) => {
    const { plan, meal } = mealIn(t.dataset.m);
    const i = meal.items.findIndex((x) => x.id === t.dataset.i), j = i + dir;
    if (i < 0 || j < 0 || j >= meal.items.length) return;
    const tmp = meal.items[i]; meal.items[i] = meal.items[j]; meal.items[j] = tmp; App.touchPlan(plan); App.rerender();
  };
  App.A['item-up'] = (t) => moveItem(t, -1);
  App.A['item-down'] = (t) => moveItem(t, 1);
  App.A['item-del'] = (t) => {
    const { plan, meal } = mealIn(t.dataset.m);
    const it = meal.items.find((x) => x.id === t.dataset.i); const nm = NT.itemCalc(it, App.ctx()).name;
    const at = meal.items.findIndex((x) => x.id === t.dataset.i);
    meal.items = meal.items.filter((x) => x.id !== t.dataset.i); App.touchPlan(plan); App.rerender();
    App.toast('Odebráno: ' + nm, { action: { label: 'Vrátit', fn: () => { const p = getPlan(); const m = p && findMeal(curDay(p), meal.id); if (m) { m.items.splice(Math.min(at, m.items.length), 0, it); App.touchPlan(p); App.rerender(); } } } });
  };

  // ------------------------------------------------------------ šablony: uložení / použití
  App.modals.tplSave = (m) => ({
    title: m.kind === 'day' ? 'Uložit den jako šablonu' : 'Uložit jídlo jako šablonu', size: '',
    body: '<div class="form-grid"><label class="f span-all">Název šablony<input type="text" id="ts-name" data-fid="tsn" value="' + esc(m.name) + '"></label><label class="f span-all">Poznámka<textarea id="ts-note" rows="2" placeholder="Např. vhodné pro tréninkový den, vegetariánské…"></textarea></label></div>' +
      '<p class="muted sm" style="margin-top:10px">Šablona si pamatuje potraviny, recepty a množství. Klientovy cíle ani alergie se neukládají, takže ji použiješ u kohokoli.</p>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="tpl-save">Uložit šablonu</button>', focus: '#ts-name'
  });
  const stripItems = (items) => items.map((i) => (i.type === 'recipe' ? { type: 'recipe', refId: i.refId, servings: i.servings } : { type: 'food', refId: i.refId, grams: i.grams }));
  App.A['meal-tpl'] = (t) => { const { meal } = mealIn(t.dataset.m); App.openModal({ type: 'tplSave', kind: 'meal', name: meal.name, mealId: meal.id }); };
  App.A['day-tpl'] = () => { const p = getPlan(); const d = curDay(p); App.openModal({ type: 'tplSave', kind: 'day', name: d.name }); };
  App.A['tpl-save'] = () => {
    const m = S.modals[S.modals.length - 1];
    const p = getPlan(); const d = curDay(p);
    const name = ($('#ts-name').value || '').trim(); if (!name) { App.toast('Zadej název šablony', { kind: 'bad' }); return; }
    const src = m.kind === 'day' ? d.meals : [findMeal(d, m.mealId)];
    const tpl = { id: NT.uid('t'), kind: m.kind, name, note: ($('#ts-note').value || '').trim(), dayType: m.kind === 'day' ? d.dayType : undefined, createdAt: new Date().toISOString(), data: { meals: src.map((mm) => ({ name: mm.name, time: mm.time || '', items: stripItems(mm.items) })) } };
    if (!tpl.dayType) delete tpl.dayType;
    Store.put('templates', tpl); App.rebuildCatalog(); App.closeAll(); App.toast('Šablona uložena');
  };

  // ------------------------------------------------------------ výběr potravin / receptů
  const foodMatch = (list, q, cat) => {
    const toks = NT.norm(q).split(/\s+/).filter(Boolean);
    let out = list;
    if (cat) out = out.filter((f) => f.cat === cat);
    if (toks.length) {
      out = out.filter((f) => { const n = NT.norm(f.name); return toks.every((t) => n.indexOf(t) >= 0); });
      const first = toks[0];
      out = out.map((f) => ({ f, s: (NT.norm(f.name).indexOf(first) === 0 ? 0 : 1) + f.name.length / 1000 })).sort((a, b) => a.s - b.s).map((x) => x.f);
    } else out = out.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    return out;
  };
  App.foodMatch = foodMatch;

  App.openPicker = function (opts) {
    const m = Object.assign({ type: 'picker', tab: 'food', q: '', cat: '', basket: [], limit: 60, ai: { busy: false, variants: null, err: '', note: '', count: 3 }, sticky: false }, opts);
    App.openModal(m);
  };
  const pickCtx = (m) => {
    if (m.ctxless) return null;
    const plan = getPlan(); const day = plan.days.find((d) => d.id === m.dayId) || curDay(plan);
    return { plan, day, client: getClientOf(plan), meal: findMeal(day, m.mealId) };
  };
  const basketTotals = (m) => {
    const tot = NT.zero();
    m.basket.forEach((b) => NT.addTo(tot, NT.itemCalc(b, App.ctx()).n));
    return tot;
  };

  App.pickerResults = function (m) {
    const c = pickCtx(m);
    const client = c ? c.client : m.client;
    if (m.tab === 'food') {
      const list = foodMatch(S.cat.foods, m.q, m.cat);
      const shown = list.slice(0, m.limit);
      const ca = new Set((client && client.allergens) || []);
      const block = NT.DIET_BLOCK[(client && client.diet) || 'all'] || [];
      if (!list.length) return '<div class="empty" style="padding:24px"><p>Nic nenalezeno. Zkus jiný výraz nebo <button class="btn btn-sm" type="button" data-act="food-new-from-pick">vytvoř novou potravinu</button>.</p></div>';
      return '<div class="pick-list">' + shown.map((f) => {
        const al = (f.allergens || []).filter((a) => ca.has(a));
        const dis = block.indexOf(f.cat) >= 0;
        const inB = m.basket.some((b) => b.type === 'food' && b.refId === f.id);
        const sev = S.foodIssues.get(f.id);
        return '<button class="pick' + (al.length ? ' warnrow' : '') + (inB ? ' sel' : '') + '" type="button" data-act="pick-food" data-id="' + f.id + '"><span class="grow"><b>' + esc(f.name) + '</b> ' +
          (f.source === 'ai' && !f.verified ? '<span class="badge ai">Odhad AI</span> ' : '') + (sev === 'bad' ? '<span class="badge bad">Chyba v datech</span> ' : '') + (al.length ? '<span class="badge bad">Alergen: ' + al.map((a) => esc(NT.ALLERGEN_LABEL[a])).join(', ') + '</span> ' : '') + (dis ? '<span class="badge warn">Nevhodné pro dietu</span>' : '') +
          '<br><span class="xs muted num">na 100 g: ' + (f.kcal != null ? fmt(f.kcal) : '–') + ' kcal · B ' + fmt(f.protein, 1) + ' · T ' + fmt(f.fat, 1) + ' · S ' + fmt(f.carbs, 1) + '</span></span>' + (inB ? ic('check', 'ico-sm') : ic('plus', 'ico-sm')) + '</button>';
      }).join('') + '</div>' + (list.length > shown.length ? '<div style="padding-top:8px" class="row"><span class="muted sm">Zobrazeno ' + shown.length + ' z ' + list.length + '.</span><button class="btn btn-sm" type="button" data-act="pick-more">Zobrazit další</button></div>' : '');
    }
    if (m.tab === 'recipe') {
      const toks = NT.norm(m.q).split(/\s+/).filter(Boolean);
      const sel = m.mealF || [];
      const list = S.cat.recipes.filter((r) => { const n = NT.norm(r.name + ' ' + (r.tags || []).join(' ') + ' ' + (r.mealTypes || []).join(' ')); return toks.every((t) => n.indexOf(t) >= 0) && (!sel.length || sel.some((x) => (r.mealTypes || []).indexOf(x) >= 0)); });
      if (!list.length) return '<div class="empty" style="padding:24px"><p>Žádný recept' + (sel.length ? ' s označením „' + sel.map(esc).join(', ') + '“. Zruš filtr druhu jídla nahoře' : '. V sekci Recepty můžeš přidat vlastní, nebo je vytvořit pomocí AI') + '.</p></div>';
      const ca = new Set((client && client.allergens) || []);
      return '<div class="pick-list">' + list.map((r) => {
        const rc = NT.recipeCalc(r, App.ctx());
        const al = rc.allergens.filter((a) => ca.has(a));
        return '<button class="pick' + (al.length ? ' warnrow' : '') + (m.basket.some((b) => b.refId === r.id) ? ' sel' : '') + '" type="button" data-act="pick-recipe" data-id="' + r.id + '"><span class="grow"><b>' + esc(r.name) + '</b> ' + (r.aiGenerated ? '<span class="badge ai">AI</span> ' : '') + (al.length ? '<span class="badge bad">Alergen: ' + al.map((a) => esc(NT.ALLERGEN_LABEL[a])).join(', ') + '</span>' : '') +
          '<br><span class="xs muted num">na porci: ' + fmt(rc.per.kcal) + ' kcal · B ' + fmt(rc.per.protein) + ' · T ' + fmt(rc.per.fat) + ' · S ' + fmt(rc.per.carbs) + (r.timeMin ? ' · ' + r.timeMin + ' min' : '') + '</span></span>' + ic('plus', 'ico-sm') + '</button>';
      }).join('') + '</div>';
    }
    if (m.tab === 'tpl') {
      const items = [];
      const tq = NT.norm(m.q).split(/\s+/).filter(Boolean);
      S.cat.templates.forEach((t) => (t.data.meals || []).forEach((mm, i) => { if ((mm.items || []).length && tq.every((w) => NT.norm(t.name + ' ' + mm.name).indexOf(w) >= 0)) items.push({ t, mm, key: t.id + ':' + i, label: t.kind === 'day' ? t.name + ' › ' + mm.name : t.name }); }));
      if (!items.length) return '<div class="empty" style="padding:24px"><p>Zatím žádné šablony. Jídlo nebo den uložíš jako šablonu v editoru.</p></div>';
      return '<div class="pick-list">' + items.map((x) => {
        const tot = NT.zero(); x.mm.items.forEach((i) => NT.addTo(tot, NT.itemCalc(i, App.ctx()).n));
        return '<button class="pick" type="button" data-act="pick-tpl" data-key="' + x.key + '"><span class="grow"><b>' + esc(x.label) + '</b><br><span class="xs muted num">' + x.mm.items.length + ' ' + NT.plural(x.mm.items.length, 'položka', 'položky', 'položek') + ' · ' + fmt(tot.kcal) + ' kcal · B ' + fmt(tot.protein) + ' · T ' + fmt(tot.fat) + ' · S ' + fmt(tot.carbs) + '</span></span>' + ic('plus', 'ico-sm') + '</button>';
      }).join('') + '</div>';
    }
    return '';
  };

  const aiPane = (m) => {
    const a = m.ai;
    let h = '<div class="callout info" style="margin-bottom:12px">' + ic('sparkle') + '<div class="sm">AI vybírá jen z potravin a receptů v tvé databázi a bere ohled na alergie, dietu a nechutě klienta. Gramáže a živiny pak počítá aplikace, ne AI. Návrhy si vždy zkontroluj.</div></div>';
    h += '<div class="form-grid"><label class="f span-all">Přání nebo upřesnění (volitelné)<input type="text" id="ai-note" data-in="ai-note" data-fid="ainote" value="' + esc(a.note) + '" placeholder="např. rychlé, bez vaření, hodně bílkovin, sladké" data-enter="ai-meal-go"></label>' +
      '<label class="f">Počet variant<select data-ch="ai-count"><option value="2"' + (a.count === 2 ? ' selected' : '') + '>2</option><option value="3"' + (a.count === 3 ? ' selected' : '') + '>3</option><option value="4"' + (a.count === 4 ? ' selected' : '') + '>4</option></select></label></div>' +
      '<div class="row" style="margin:12px 0">' + (a.busy ? '<span class="spin"></span><span class="muted">AI navrhuje… (může to trvat až půl minuty)</span><button class="btn btn-sm" type="button" data-act="ai-stop">' + ic('stop', 'ico-sm') + 'Zastavit</button>' : '<button class="btn btn-primary" type="button" data-act="ai-meal-go">' + ic('sparkle') + (a.variants ? 'Navrhnout znovu' : 'Navrhnout jídlo') + '</button>') + '</div>';
    if (a.err) h += '<div class="callout bad" style="margin-bottom:10px">' + ic('alert') + '<div>' + esc(a.err) + '</div></div>';
    if (a.variants) {
      if (!a.variants.length) h += '<p class="muted">AI nevrátila použitelný návrh. Zkus to znovu.</p>';
      h += '<div class="stack">' + a.variants.map((v, vi) => {
        const tot = NT.zero(); v.items.forEach((i) => NT.addTo(tot, NT.itemCalc(i, App.ctx()).n));
        return '<div class="var-card"><div class="row"><b class="grow">' + esc(v.title) + '</b><button class="btn btn-sm btn-primary" type="button" data-act="ai-var-add" data-i="' + vi + '">' + ic('plus', 'ico-sm') + 'Do výběru</button></div>' +
          (v.why ? '<div class="sm muted">' + esc(v.why) + '</div>' : '') +
          '<ul style="margin:0;padding-left:18px" class="sm">' + v.items.map((i) => { const c = NT.itemCalc(i, App.ctx()); return '<li>' + esc(c.name) + ' – ' + (i.type === 'recipe' ? NT.porcePl(i.servings) : fmt(i.grams) + ' g') + '</li>'; }).join('') + '</ul>' +
          '<div class="sm num"><b>' + fmt(tot.kcal) + ' kcal</b> · B ' + fmt(tot.protein) + ' · T ' + fmt(tot.fat) + ' · S ' + fmt(tot.carbs) + '</div></div>';
      }).join('') + '</div>';
    }
    return h;
  };

  const basketHtml = function (m) {
    if (!m.basket.length) return '<div class="muted sm" style="padding:10px 0">Výběr je prázdný. Klikni na potravinu nebo recept.</div>';
    const tot = basketTotals(m);
    const c = pickCtx(m);
    let rem = '';
    if (c) {
      const E = App.dayEval(c.plan, c.client, c.day);
      if (E.rem) {
        const mt = NT.mealTotals(c.meal, App.ctx()).total;
        const rk = E.rem.kcal - tot.kcal;
        rem = '<div class="xs muted" style="margin-top:6px">Po přidání ' + (rk >= 0 ? 'zbývá ve dni ještě ' + fmt(rk) + ' kcal' : 'bude den nad cílem o ' + fmt(-rk) + ' kcal') + '.</div>';
      }
    }
    return '<div class="basket"><div class="basket-row" style="background:var(--accent-soft)"><b class="grow">Výběr (' + m.basket.length + ')</b><span class="num sm"><b>' + fmt(tot.kcal) + ' kcal</b> · B ' + fmt(tot.protein) + ' · T ' + fmt(tot.fat) + ' · S ' + fmt(tot.carbs) + '</span></div>' +
      m.basket.map((b, i) => { const cc = NT.itemCalc(b, App.ctx()); return '<div class="basket-row"><span class="grow sm">' + esc(cc.name) + '</span><span class="amt"><input type="number" aria-label="Množství" data-in="basket-amt" data-i="' + i + '" min="' + (b.type === 'recipe' ? '0.5' : '1') + '" step="' + (b.type === 'recipe' ? '0.5' : '5') + '" value="' + (b.type === 'recipe' ? b.servings : b.grams) + '" style="width:76px;min-height:30px;padding:3px 7px"> ' + (b.type === 'recipe' ? 'porcí' : 'g') + '</span><button class="btn btn-ghost btn-icon btn-sm btn-danger" type="button" data-act="basket-del" data-i="' + i + '" aria-label="Odebrat z výběru">' + ic('x', 'ico-sm') + '</button></div>'; }).join('') + '</div>' + rem;
  };

  App.modals.picker = (m) => {
    const c = pickCtx(m);
    const tabs = m.single ? [['food', 'Potraviny']] : [['food', 'Potraviny'], ['recipe', 'Recepty'], ['tpl', 'Šablony']].concat(App.aiAvailable() ? [['ai', 'AI návrh']] : []);
    const cats = '<div class="row" style="gap:5px;margin:10px 0"><button class="chip" type="button" data-act="pick-cat" data-c="" aria-pressed="' + (!m.cat) + '">Vše</button>' + NT.CATS.map(([k, l]) => '<button class="chip" type="button" data-act="pick-cat" data-c="' + k + '" aria-pressed="' + (m.cat === k) + '">' + l + '</button>').join('') + '</div>';
    let body = '';
    if (tabs.length > 1) body += '<div class="seg" role="tablist" style="margin-bottom:12px">' + tabs.map(([k, l]) => '<button type="button" role="tab" data-act="pick-tab" data-t="' + k + '" aria-pressed="' + (m.tab === k) + '">' + (k === 'ai' ? ic('sparkle', 'ico-sm') + ' ' : '') + l + '</button>').join('') + '</div>';
    if (m.tab === 'ai') body += aiPane(m);
    else {
      body += '<div class="row nw"><div class="grow"><input type="search" id="pick-q" data-in="pick-q" data-fid="pq" value="' + esc(m.q) + '" placeholder="' + (m.tab === 'food' ? 'Hledat potravinu…' : m.tab === 'recipe' ? 'Hledat recept…' : 'Hledat šablonu…') + '" aria-label="Hledat"></div>' + (m.tab === 'food' ? '<button class="btn" type="button" data-act="food-new-from-pick">' + ic('plus', 'ico-sm') + 'Nová</button>' : '') + '</div>';
      if (m.tab === 'food') body += cats;
      if (m.tab === 'recipe') body += '<div class="row" style="gap:5px;margin:10px 0 0" role="group" aria-label="Druh jídla"><button class="chip" type="button" data-act="pick-meal" data-m="" aria-pressed="' + (!(m.mealF || []).length) + '">Všechny druhy</button>' + NT.MEAL_TYPES.map((t) => '<button class="chip" type="button" data-act="pick-meal" data-m="' + esc(t) + '" aria-pressed="' + ((m.mealF || []).indexOf(t) >= 0) + '">' + esc(t) + '</button>').join('') + '</div>';
      body += '<div id="pick-results" style="margin-top:' + (m.tab === 'food' ? 0 : 12) + 'px">' + App.pickerResults(m) + '</div>';
    }
    if (!m.single) body += '<div id="pick-basket" style="margin-top:14px">' + basketHtml(m) + '</div>';
    return {
      title: m.single ? 'Vybrat potravinu' : 'Přidat do jídla: ' + (c && c.meal ? c.meal.name : ''), size: 'mid', body,
      footer: m.single ? '<button class="btn" type="button" data-act="modal-close">Zrušit</button>' : '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="pick-done"' + (m.basket.length ? '' : ' disabled') + ' id="pick-done">Přidat do jídla' + (m.basket.length ? ' (' + m.basket.length + ')' : '') + '</button>',
      focus: m.tab === 'ai' ? '#ai-note' : '#pick-q'
    };
  };
  const topPicker = () => { const m = S.modals[S.modals.length - 1]; return m && m.type === 'picker' ? m : null; };
  const refreshPick = () => {
    const m = topPicker(); if (!m) return;
    const r = $('#pick-results'); if (r) r.innerHTML = App.pickerResults(m);
    const b = $('#pick-basket'); if (b) b.innerHTML = basketHtml(m);
    const d = $('#pick-done'); if (d) { d.disabled = !m.basket.length; d.textContent = 'Přidat do jídla' + (m.basket.length ? ' (' + m.basket.length + ')' : ''); }
  };
  App.A['pick-open'] = (t) => {
    const plan = getPlan(); const day = curDay(plan);
    const meal = findMeal(day, t.dataset.m);
    App.openPicker({ planId: plan.id, dayId: day.id, mealId: t.dataset.m, tab: t.dataset.tab === 'ai' && App.aiAvailable() ? 'ai' : 'food', mealF: meal ? NT.mealKindLabels(meal.name).slice(0, 1) : [] });
  };
  App.A['pick-tab'] = (t) => { const m = topPicker(); m.tab = t.dataset.t; m.q = ''; m.cat = ''; m.limit = 60; App.renderModal(); };
  App.A['pick-meal'] = (t) => {
    const m = topPicker(); const k = t.dataset.m; const cur = m.mealF || [];
    m.mealF = !k ? [] : cur.indexOf(k) >= 0 ? cur.filter((x) => x !== k) : cur.concat([k]);
    App.renderModal();
  };
  App.A['pick-cat'] = (t) => { const m = topPicker(); m.cat = t.dataset.c; m.limit = 60; App.renderModal(); };
  App.A['pick-more'] = () => { const m = topPicker(); m.limit += 60; refreshPick(); };
  App.IN['pick-q'] = (t) => { const m = topPicker(); m.q = t.value; m.limit = 60;
    refreshPick(); };
  App.A['pick-food'] = (t) => {
    const m = topPicker(); const f = S.cat.ctx.foods.get(t.dataset.id);
    if (m.single) { const cb = m.onPick; App.closeModal(m); if (cb) cb(f); return; }
    const i = m.basket.findIndex((b) => b.type === 'food' && b.refId === f.id);
    if (i >= 0) m.basket.splice(i, 1); else m.basket.push(NT.newItem('food', f.id, NT.defaultGrams(f)));
    refreshPick();
  };
  App.A['pick-recipe'] = (t) => {
    const m = topPicker(); const i = m.basket.findIndex((b) => b.type === 'recipe' && b.refId === t.dataset.id);
    if (i >= 0) m.basket.splice(i, 1); else m.basket.push(NT.newItem('recipe', t.dataset.id, 1));
    refreshPick();
  };
  App.A['pick-tpl'] = (t) => {
    const m = topPicker(); const [tid, idx] = t.dataset.key.split(':');
    const tpl = S.cat.templates.find((x) => x.id === tid); const mm = tpl.data.meals[+idx];
    mm.items.forEach((i) => m.basket.push(Object.assign({}, i, { id: NT.uid('i') })));
    refreshPick(); App.toast('Položky ze šablony přidány do výběru');
  };
  App.IN['basket-amt'] = (t) => {
    const m = topPicker(); const b = m.basket[+t.dataset.i]; const v = NT.toNum(t.value) || 0;
    if (b.type === 'recipe') b.servings = v; else b.grams = v;
    const bk = $('#pick-basket'); if (bk) { const keep = document.activeElement; bk.innerHTML = basketHtml(m); const el = bk.querySelector('[data-i="' + t.dataset.i + '"][data-in="basket-amt"]'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* ignore */ } } }
  };
  App.A['basket-del'] = (t) => { const m = topPicker(); m.basket.splice(+t.dataset.i, 1); refreshPick(); };
  App.A['pick-done'] = () => {
    const m = topPicker();
    const bad = m.basket.filter((b) => !((b.type === 'recipe' ? b.servings : b.grams) > 0));
    if (bad.length) { App.toast('U některé položky je množství nula. Oprav ho nebo ji odeber.', { kind: 'bad' }); return; }
    const c = pickCtx(m); c.meal.items.push(...m.basket.map((b) => Object.assign({}, b, { id: NT.uid('i') })));
    App.touchPlan(c.plan); App.closeModal(m); App.rerender();
    App.toast('Přidáno do jídla: ' + c.meal.name);
  };
  App.A['food-new-from-pick'] = () => {
    const pm = topPicker();
    App.openFoodEditor(null, { name: pm && pm.q ? pm.q : '', afterSave: (f) => { const m = topPicker(); if (m) { if (m.single) { const cb = m.onPick; App.closeModal(m); if (cb) cb(f); return; } m.basket.push(NT.newItem('food', f.id, NT.defaultGrams(f))); App.renderModal(); } } });
  };

  // ---- AI návrh jídla
  App.CH['ai-count'] = (t) => { const m = topPicker(); if (m) m.ai.count = +t.value; };
  App.IN['ai-note'] = (t) => { const m = topPicker(); if (m) m.ai.note = t.value; };
  App.aiCatalog = function (client, extraIds) {
    const ca = new Set((client && client.allergens) || []);
    const block = NT.DIET_BLOCK[(client && client.diet) || 'all'] || [];
    const dis = NT.parseList(client && client.dislikes);
    const extra = new Set(extraIds || []);
    const ok = (f) => !f.hidden && f.kcal != null && f.protein != null && f.fat != null && f.carbs != null && S.foodIssues.get(f.id) !== 'bad' && !(f.allergens || []).some((a) => ca.has(a)) && block.indexOf(f.cat) < 0 && !dis.some((t) => NT.norm(f.name).indexOf(t) >= 0);
    const list = S.cat.foods.filter((f) => (NT.isCommonFood(f) || extra.has(f.id)) && ok(f));
    list.sort((a, b) => (extra.has(b.id) ? 1 : 0) - (extra.has(a.id) ? 1 : 0));
    return list.slice(0, 260);
  };
  App.aiRecipeCatalog = function (client) {
    const ca = new Set((client && client.allergens) || []);
    const dis = NT.parseList(client && client.dislikes);
    const block = NT.DIET_BLOCK[(client && client.diet) || 'all'] || [];
    return S.cat.recipes.filter((r) => {
      const rc = NT.recipeCalc(r, App.ctx());
      if (rc.allergens.some((a) => ca.has(a)) || rc.unknown.length) return false;
      const names = r.ingredients.map((i) => (S.cat.ctx.foods.get(i.foodId) || {})).filter((f) => f.id);
      if (names.some((f) => block.indexOf(f.cat) >= 0)) return false;
      return !dis.some((t) => NT.norm(r.name).indexOf(t) >= 0 || names.some((f) => NT.norm(f.name).indexOf(t) >= 0));
    }).slice(0, 40);
  };
  App.A['ai-stop'] = () => { if (App.aiBusy && App.aiBusy.ctl) App.aiBusy.ctl.abort(); };
  App.A['ai-meal-go'] = async () => {
    const m = topPicker(); if (!m || m.ai.busy) return;
    const c = pickCtx(m); const E = App.dayEval(c.plan, c.client, c.day);
    const st = App.current(c.client.id);
    const brief = NT.clientBrief(c.client, st);
    const dayTarget = E.target || { kcal: 2000, protein: 100, fat: 65, carbs: 250 };
    const mealTot = NT.mealTotals(c.meal, App.ctx()).total;
    const rem = E.rem ? { kcal: E.rem.kcal + mealTot.kcal, protein: E.rem.protein + mealTot.protein, fat: E.rem.fat + mealTot.fat, carbs: E.rem.carbs + mealTot.carbs } : { kcal: 600, protein: 30, fat: 20, carbs: 70 };
    const emptyMeals = c.day.meals.filter((x) => !x.items.length).length || 1;
    const share = c.day.meals.length ? Math.max(1, emptyMeals) : 3;
    const mealTarget = { kcal: Math.max(150, rem.kcal / share), protein: Math.max(5, rem.protein / share) };
    const existing = c.meal.items.map((i) => NT.itemCalc(i, App.ctx()).name).join(', ');
    const prompt = NT.promptMeal({ brief, dayLabel: c.day.name + ' (' + NT.DAY_TYPES[c.day.dayType].toLowerCase() + ')', dayTarget, remaining: { kcal: Math.max(0, rem.kcal), protein: Math.max(0, rem.protein), fat: Math.max(0, rem.fat), carbs: Math.max(0, rem.carbs) }, mealName: c.meal.name, mealTarget, existing, note: m.ai.note, variants: m.ai.count,
      foodCatalog: NT.catalogText(App.aiCatalog(c.client, c.day.meals.flatMap((x) => x.items.map((i) => i.refId)))), recipeCatalog: NT.recipesCatalogText(App.aiRecipeCatalog(c.client), App.ctx(), 30) });
    m.ai.busy = true; m.ai.err = ''; App.renderModal();
    const ctl = new AbortController(); App.aiBusy = { ctl };
    try {
      const json = await App.aiCall('json', prompt, { signal: ctl.signal });
      m.ai.variants = NT.sanitizeVariants(json, App.ctx());
      if (!m.ai.variants.length) m.ai.err = 'AI vrátila návrhy, ale žádný nešel použít (neznámé potraviny). Zkus to znovu.';
    } catch (e) { if (e.code !== 'cancelled') m.ai.err = e.message; }
    m.ai.busy = false; App.aiBusy = null;
    if (S.modals.indexOf(m) >= 0) App.renderModal();
  };
  App.A['ai-var-add'] = (t) => {
    const m = topPicker(); const v = m.ai.variants[+t.dataset.i];
    v.items.forEach((i) => m.basket.push(Object.assign({}, i, { id: NT.uid('i') })));
    m.tab = 'food'; m.q = ''; App.renderModal(); App.toast('Návrh přidán do výběru. Zkontroluj množství a potvrď.');
  };
  // AI: doplnit zbytek dne -> otevře picker u posledního prázdného jídla
  App.A['ai-day'] = () => {
    const plan = getPlan(); const day = curDay(plan);
    const meal = day.meals.slice().reverse().find((m) => !m.items.length) || day.meals[day.meals.length - 1];
    if (!meal) { App.toast('Den nemá žádné jídlo', { kind: 'bad' }); return; }
    App.openPicker({ planId: plan.id, dayId: day.id, mealId: meal.id, tab: 'ai' });
  };

  // ------------------------------------------------------------ výměny (náhrady)
  App.modals.swap = (m) => {
    const plan = getPlan(); const client = getClientOf(plan); const day = curDay(plan);
    const meal = findMeal(day, m.mealId); const it = meal.items.find((x) => x.id === m.itemId);
    const food = S.cat.ctx.foods.get(it.refId);
    const base = NT.nutr(food, it.grams).n;
    const sw = NT.suggestSwaps(food, it.grams, S.cat.common, client, { match: m.match, limit: 14 });
    const lab = { kcal: 'stejnou energii', protein: 'stejné bílkoviny', carbs: 'stejné sacharidy', fat: 'stejné tuky' };
    return {
      title: 'Náhrada za ' + food.name, size: 'mid',
      body: '<p class="muted sm" style="margin-bottom:10px">Původně <b>' + fmt(it.grams) + ' g</b> · ' + fmt(base.kcal) + ' kcal · B ' + fmt(base.protein) + ' · T ' + fmt(base.fat) + ' · S ' + fmt(base.carbs) + '. Návrhy ze stejné skupiny, bez alergenů a nevhodných potravin pro klienta.</p>' +
        '<div class="seg" style="margin-bottom:12px" role="group" aria-label="Zachovat">' + [['kcal', 'Energii'], ['protein', 'Bílkoviny'], ['carbs', 'Sacharidy'], ['fat', 'Tuky']].map(([k, l]) => '<button type="button" data-act="swap-match" data-k="' + k + '" aria-pressed="' + (m.match === k) + '">' + l + '</button>').join('') + '</div>' +
        (sw.length ? '<div class="pick-list">' + sw.map((s, i) => {
          const d = s.delta;
          const sg = (v, dec) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), dec || 0);
          return '<button class="pick" type="button" data-act="swap-apply" data-i="' + i + '"><span class="grow"><b>' + esc(s.food.name) + '</b> – ' + fmt(s.grams) + ' g ' + (NT.householdText(s.food, s.grams) ? '<span class="muted xs">' + esc(NT.householdText(s.food, s.grams)) + '</span>' : '') +
            '<br><span class="xs muted num">' + fmt(s.n.kcal) + ' kcal · B ' + fmt(s.n.protein) + ' · T ' + fmt(s.n.fat) + ' · S ' + fmt(s.n.carbs) + ' &nbsp;(rozdíl: ' + sg(d.kcal) + ' kcal, B ' + sg(d.protein) + ', T ' + sg(d.fat) + ', S ' + sg(d.carbs) + ')</span></span>' + ic('swap', 'ico-sm') + '</button>';
        }).join('') + '</div>' : '<p class="muted">Pro tuto potravinu nejsou vhodné náhrady (zkus jiné kritérium).</p>'),
      footer: '<button class="btn" type="button" data-act="modal-close">Zavřít</button>'
    };
  };
  App.A['item-swap'] = (t) => { App.openModal({ type: 'swap', mealId: t.dataset.m, itemId: t.dataset.i, match: 'kcal' }); };
  App.A['swap-match'] = (t) => { const m = S.modals[S.modals.length - 1]; m.match = t.dataset.k; App.renderModal(); };
  App.A['swap-apply'] = (t) => {
    const m = S.modals[S.modals.length - 1]; const plan = getPlan(); const client = getClientOf(plan); const day = curDay(plan);
    const meal = findMeal(day, m.mealId); const it = meal.items.find((x) => x.id === m.itemId); const food = S.cat.ctx.foods.get(it.refId);
    const s = NT.suggestSwaps(food, it.grams, S.cat.common, client, { match: m.match, limit: 14 })[+t.dataset.i];
    it.refId = s.food.id; it.grams = s.grams; App.touchPlan(plan); App.closeModal(m); App.rerender(); App.toast('Nahrazeno: ' + s.food.name);
  };

  // ------------------------------------------------------------ asistent: doplnění a doladění
  App.modals.fill = (m) => {
    const plan = getPlan(); const client = getClientOf(plan); const day = curDay(plan);
    const E = App.dayEval(plan, client, day);
    if (!E.rem) return { title: 'Co doplnit', body: '<p>Nejdřív spočítej potřeby klienta.</p>', footer: '<button class="btn" type="button" data-act="modal-close">Zavřít</button>' };
    const r = E.rem;
    const sug = NT.suggestFill(r, S.cat.common, client, { focus: m.focus || undefined, limit: 10 });
    const keys = [['protein', 'Bílkoviny'], ['carbs', 'Sacharidy'], ['fat', 'Tuky']];
    const kcalNeed = r.kcal > 40;
    return {
      title: 'Co doplnit do cíle', size: 'mid',
      body: '<div class="callout ' + (kcalNeed ? 'info' : 'ok') + '" style="margin-bottom:12px">' + ic('info') + '<div class="sm">' + (kcalNeed ? 'Zbývá: <b class="num">' + fmt(r.kcal) + ' kcal · B ' + fmt(Math.max(0, r.protein)) + ' g · T ' + fmt(Math.max(0, r.fat)) + ' g · S ' + fmt(Math.max(0, r.carbs)) + ' g</b>.' : 'Energie je v cíli nebo nad ním, doplňovat není co.') + '</div></div>' +
        (kcalNeed ? '<div class="row" style="margin-bottom:12px"><span class="muted sm">Zaměřit na:</span><div class="seg" role="group"><button type="button" data-act="fill-focus" data-k="" aria-pressed="' + (!m.focus) + '">Největší schodek</button>' + keys.map(([k, l]) => '<button type="button" data-act="fill-focus" data-k="' + k + '" aria-pressed="' + (m.focus === k) + '">' + l + '</button>').join('') + '</div></div>' : '') +
        (sug.length ? '<label class="f" style="margin-bottom:10px;max-width:280px">Přidat do jídla<select id="fill-meal">' + day.meals.map((mm) => '<option value="' + mm.id + '"' + (mm.id === (m.mealId || day.meals[day.meals.length - 1].id) ? ' selected' : '') + '>' + esc(mm.name) + '</option>').join('') + '</select></label>' +
          '<div class="pick-list">' + sug.map((s, i) => '<button class="pick" type="button" data-act="fill-add" data-i="' + i + '"><span class="grow"><b>' + esc(s.food.name) + '</b> – ' + fmt(s.grams) + ' g ' + (NT.householdText(s.food, s.grams) ? '<span class="muted xs">' + esc(NT.householdText(s.food, s.grams)) + '</span>' : '') +
            '<br><span class="xs muted num">' + fmt(s.n.kcal) + ' kcal · B ' + fmt(s.n.protein) + ' · T ' + fmt(s.n.fat) + ' · S ' + fmt(s.n.carbs) + '</span></span>' + ic('plus', 'ico-sm') + '</button>').join('') + '</div>' : (kcalNeed ? '<p class="muted">Nenašel se vhodný návrh. Zkus jiné zaměření.</p>' : '')),
      footer: '<button class="btn" type="button" data-act="modal-close">Hotovo</button>'
    };
  };
  App.A['assist-fill'] = () => App.openModal({ type: 'fill', focus: '' });
  App.A['fill-focus'] = (t) => { const m = S.modals[S.modals.length - 1]; m.mealId = ($('#fill-meal') || {}).value; m.focus = t.dataset.k; App.renderModal(); };
  App.A['fill-add'] = (t) => {
    const m = S.modals[S.modals.length - 1]; const plan = getPlan(); const client = getClientOf(plan); const day = curDay(plan);
    const E = App.dayEval(plan, client, day);
    const s = NT.suggestFill(E.rem, S.cat.common, client, { focus: m.focus || undefined, limit: 10 })[+t.dataset.i];
    const meal = findMeal(day, $('#fill-meal').value); m.mealId = meal.id;
    meal.items.push(NT.newItem('food', s.food.id, s.grams));
    App.touchPlan(plan); App.renderModal(); App.rerender(); App.toast(s.food.name + ' přidáno do jídla ' + meal.name);
  };
  App.modals.fit = (m) => {
    const plan = getPlan(); const client = getClientOf(plan); const day = curDay(plan);
    const E = App.dayEval(plan, client, day);
    const all = day.meals.flatMap((mm) => mm.items);
    const fit = NT.fitItemsToKcal(all, E.target.kcal, App.ctx(), 0);
    const tot = NT.zero(); fit.items.forEach((i) => NT.addTo(tot, NT.itemCalc(i, App.ctx()).n));
    m.fit = fit;
    const row = (lab, a, b, unit) => '<tr><td>' + lab + '</td><td class="r">' + fmt(a) + ' ' + unit + '</td><td class="r">' + fmt(b) + ' ' + unit + '</td></tr>';
    const t0 = E.tot.total, tg = E.target;
    const changed = all.map((it, i) => ({ it, n: fit.items[i] })).filter((x) => (x.it.type === 'recipe' ? x.it.servings !== x.n.servings : x.it.grams !== x.n.grams));
    return {
      title: 'Doladit množství na cíl', size: 'mid',
      body: '<p class="muted sm" style="margin-bottom:10px">Všechny množství v dni se úměrně upraví (na hezké hodnoty), aby energie sedla na cíl. Poměry potravin zůstanou stejné, proto se makroživiny mohou od cíle dál lišit.</p>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="r">Teď</th><th class="r">Po úpravě</th><th class="r">Cíl</th></tr></thead><tbody>' +
        [['Energie', 'kcal', 'kcal', 0], ['Bílkoviny', 'protein', 'g', 0], ['Tuky', 'fat', 'g', 0], ['Sacharidy', 'carbs', 'g', 0]].map(([l, k, u]) => '<tr><td>' + l + '</td><td class="r">' + fmt(t0[k]) + ' ' + u + '</td><td class="r"><b>' + fmt(tot[k]) + ' ' + u + '</b></td><td class="r muted">' + fmt(tg[k]) + ' ' + u + '</td></tr>').join('') + '</tbody></table></div>' +
        (fit.changed && t0.kcal > 0 && (tg.kcal / t0.kcal > 1.35 || tg.kcal / t0.kcal < 0.7) ? '<div style="margin-top:10px">' + App.callout('warn', 'Množství se mění výrazně (×' + fmt(tg.kcal / t0.kcal, 1) + '). Je to jen úměrné zvětšení, nové potraviny nepřidá. Zvaž raději doplnění dne pomocí „Co doplnit“.') + '</div>' : '') +
        (fit.changed ? '<p class="sm muted" style="margin-top:10px">Změní se ' + changed.length + ' ' + NT.plural(changed.length, 'položka', 'položky', 'položek') + '.</p>' : '<p class="sm" style="margin-top:10px">Množství už jsou nejblíž cíli, jak to zaokrouhlení dovolí.</p>'),
      footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="fit-apply"' + (fit.changed ? '' : ' disabled') + '>Použít úpravu</button>'
    };
  };
  App.A['assist-fit'] = () => App.openModal({ type: 'fit' });
  App.A['fit-apply'] = () => {
    const m = S.modals[S.modals.length - 1]; const plan = getPlan(); const day = curDay(plan);
    const byId = new Map(m.fit.items.map((i) => [i.id, i]));
    day.meals.forEach((mm) => mm.items.forEach((it) => { const n = byId.get(it.id); if (n) { if (it.type === 'recipe') it.servings = n.servings; else it.grams = n.grams; } }));
    App.touchPlan(plan); App.closeAll(); App.rerender(); App.toast('Množství upravena');
  };

  // ------------------------------------------------------------ přehled týdne
  App.weekHtml = function (plan, client) {
    const needs = App.needsOf(client);
    const rows = plan.days.map((d) => {
      const E = App.dayEval(plan, client, d);
      return { d, E, t: E.tot.total, empty: !d.meals.some((m) => m.items.length) };
    });
    const filled = rows.filter((r) => !r.empty);
    let h = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Den</th><th>Typ</th><th class="r">Energie</th><th class="r">Cíl</th><th class="r">Bílkoviny</th><th class="r">Tuky</th><th class="r">Sacharidy</th><th class="r">Vláknina</th><th class="r">Sůl</th><th>Stav</th></tr></thead><tbody>' +
      rows.map((r, i) => '<tr class="click" data-act="week-open" data-i="' + i + '"><td><b>' + esc(r.d.name) + '</b></td><td>' + (r.d.dayType === 'training' ? '<span class="badge info">Trénink</span>' : '<span class="badge">Klid</span>') + '</td>' +
        (r.empty ? '<td colspan="7" class="muted">prázdný</td><td></td>' : '<td class="r"><b>' + fmt(r.t.kcal) + '</b></td><td class="r muted">' + (r.E.target ? fmt(r.E.target.kcal) : '–') + '</td><td class="r">' + fmt(r.t.protein) + ' g</td><td class="r">' + fmt(r.t.fat) + ' g</td><td class="r">' + fmt(r.t.carbs) + ' g</td><td class="r">' + fmt(r.t.fiber) + ' g</td><td class="r">' + fmt(r.t.salt, 1) + ' g</td><td>' + (r.E.ev ? '<span class="st ' + r.E.ev.kcal.status + '">' + App.stIcon(r.E.ev.kcal.status) + App.stText(r.E.ev.kcal.status, r.E.ev.kcal.dir) + '</span>' : '') + '</td>') + '</tr>').join('') + '</tbody></table></div>';
    if (filled.length) {
      const avg = NT.planAverage(plan, App.ctx()).avg;
      h += '<div class="grid g4" style="margin-top:16px"><div class="stat"><span class="v">' + fmt(avg.kcal) + '</span><span class="l">průměr kcal na den (vyplněné dny)</span></div>' +
        '<div class="stat"><span class="v">' + fmt(avg.protein) + ' g</span><span class="l">průměr bílkovin' + (client && App.current(client.id).weight ? ' (' + fmt(avg.protein / App.current(client.id).weight, 1) + ' g/kg)' : '') + '</span></div>' +
        '<div class="stat"><span class="v">' + fmt(avg.fiber) + ' g</span><span class="l">průměr vlákniny</span></div>' +
        '<div class="stat"><span class="v">' + fmt(avg.salt, 1) + ' g</span><span class="l">průměr soli</span></div></div>';
      if (needs.ok) {
        const exp = needs.avgKcal;
        const diff = avg.kcal - exp;
        h += '<div style="margin-top:14px">' + App.callout(Math.abs(diff) / exp < 0.06 ? 'ok' : 'info', 'Průměrný příjem v plánu je <b>' + fmt(avg.kcal) + ' kcal</b>, cíl pro týden (s ohledem na tréninkové dny) je <b>' + fmt(exp) + ' kcal</b>' + (Math.abs(diff) < 1 ? '.' : ' (rozdíl ' + (diff > 0 ? '+' : '−') + fmt(Math.abs(diff)) + ' kcal).')) + '</div>';
      }
    }
    const al = NT.planAlerts(plan, client, App.ctx());
    if (al.length) h += '<div class="card" style="margin-top:16px"><h3 style="margin-bottom:10px">Upozornění k jídelníčku</h3><div class="stack-sm">' + al.map((a) => '<div class="callout ' + (a.hard ? 'bad' : 'warn') + '">' + ic('alert') + '<div class="sm"><b>' + esc(a.day) + ' › ' + esc(a.meal) + ':</b> ' + esc(a.item) + ' – ' + a.texts.map(esc).join('; ') + '</div></div>').join('') + '</div></div>';
    return h;
  };
  App.A['goto-panel'] = () => { const p = $('#panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  App.A['week-open'] = (t) => { S.ui.dayIdx = +t.dataset.i; S.ui.planTab = 'editor'; App.rerender(); window.scrollTo(0, 0); };

  // ------------------------------------------------------------ nákupní seznam
  App.shopHtml = function (plan, client) {
    const mult = S.ui.shopMult;
    const groups = NT.shoppingList(plan, App.ctx(), mult);
    let h = '<div class="row" style="margin-bottom:14px"><label class="f" style="flex-direction:row;align-items:center;gap:8px">Počet opakování plánu<input type="number" data-in="shop-mult" data-fid="shopm" min="1" max="8" step="1" value="' + mult + '" style="width:72px"></label><span class="sp"></span>' +
      '<button class="btn" type="button" data-act="shop-copy">' + ic('copy') + 'Kopírovat seznam</button><button class="btn" type="button" data-act="shop-reset">Odškrtnout vše</button></div>';
    if (!groups.length) return h + App.emptyBox('Nákupní seznam je prázdný', 'Přidej do jídelníčku potraviny nebo recepty.', '');
    h += '<p class="muted sm" style="margin-bottom:12px">Množství v syrovém stavu podle receptur, zaokrouhleno nahoru. Počítají se všechny dny jídelníčku' + (mult > 1 ? ' × ' + mult : '') + '.</p><div class="grid g-auto">' +
      groups.map((g) => '<div class="card"><h3 style="margin-bottom:8px">' + esc(g.label) + '</h3><div class="stack-sm">' + g.rows.map((r) => {
        const key = g.cat + '|' + r.name; const on = !!S.ui.shopChecked[key];
        return '<label class="chk" style="align-items:flex-start"><input type="checkbox" data-ch="shop-chk" data-k="' + esc(key) + '"' + (on ? ' checked' : '') + '><span style="' + (on ? 'text-decoration:line-through;opacity:.55' : '') + '">' + esc(r.name) + ' <b class="num">' + fmt(r.grams) + ' g</b>' + (r.household ? ' <span class="muted xs">' + esc(r.household) + '</span>' : '') + '</span></label>';
      }).join('') + '</div></div>').join('') + '</div>';
    return h;
  };
  App.IN['shop-mult'] = (t) => { const v = NT.clamp(Math.round(NT.toNum(t.value) || 1), 1, 8); S.ui.shopMult = v; clearTimeout(App._st); App._st = setTimeout(App.rerender, 400); };
  App.CH['shop-chk'] = (t) => { S.ui.shopChecked[t.dataset.k] = t.checked; App.rerender(); };
  App.A['shop-reset'] = () => { S.ui.shopChecked = {}; App.rerender(); };
  App.A['shop-copy'] = () => {
    const plan = getPlan(); const groups = NT.shoppingList(plan, App.ctx(), S.ui.shopMult);
    App.copy(groups.map((g) => g.label.toUpperCase() + '\n' + g.rows.map((r) => '- ' + r.name + ': ' + fmt(r.grams) + ' g' + (r.household ? ' (' + r.household.replace('≈', 'cca') + ')' : '')).join('\n')).join('\n\n'), 'Nákupní seznam zkopírován');
  };
})(typeof window !== 'undefined' ? window : globalThis);
