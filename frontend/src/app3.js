/* Jídelníček – aplikace, část 3: potraviny, import, recepty, šablony. */
(function (root) {
  'use strict';
  const NT = root.NT, App = NT.App, Store = NT.Store, S = App.S;
  const esc = NT.esc, fmt = NT.fmt, ic = App.ic, $ = App.$, $$ = App.$$;
  const top = () => S.modals[S.modals.length - 1];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const numTxt = (v) => (v == null ? '' : String(v).replace('.', ','));
  const SRC_LABEL = { base: 'Základní', own: 'Vlastní', import: 'Import', ai: 'Odhad AI' };

  // ------------------------------------------------------------ použití potraviny
  App.foodUsage = function (id) {
    let items = 0, recipes = 0;
    Store.list('plans').forEach((p) => p.days.forEach((d) => d.meals.forEach((m) => m.items.forEach((i) => { if (i.type === 'food' && i.refId === id) items++; }))));
    S.cat.allRecipes.forEach((r) => { if (!r.hidden && (r.ingredients || []).some((i) => i.foodId === id)) recipes++; });
    return { items, recipes };
  };
  const hasOverride = (id) => !!Store.get('foods', id);

  // ------------------------------------------------------------ stránka Potraviny
  const foodFilterFn = {
    '': () => true,
    mine: (f) => f.source !== 'base',
    nutridb: (f) => f.origin === 'nutridb',
    curated: (f) => f.origin === 'curated',
    drinks: (f) => f.cat === 'napoje',
    review: (f) => (f.source === 'ai' || f.source === 'import') && !f.verified,
    issues: (f) => { const s = S.foodIssues.get(f.id); return s === 'bad' || s === 'warn'; }
  };
  App.views.foods = function () {
    const u = S.ui;
    u.foodSel = u.foodSel || {};
    const all = S.cat.foods;
    const counts = { review: all.filter(foodFilterFn.review).length, issues: all.filter(foodFilterFn.issues).length, mine: all.filter(foodFilterFn.mine).length, nutridb: all.filter(foodFilterFn.nutridb).length, curated: all.filter(foodFilterFn.curated).length, drinks: all.filter(foodFilterFn.drinks).length };
    let list = App.foodMatch(all, u.foodQ, u.foodCat).filter(foodFilterFn[u.foodFilter || '']);
    const shown = list.slice(0, u.foodLimit);
    const selN = Object.keys(u.foodSel).filter((k) => u.foodSel[k]).length;
    let h = App.pageHead('Potraviny', 'Databáze, ze které se skládají jídelníčky a recepty. Hodnoty jsou vždy na 100 g jedlého podílu.',
      '<button class="btn" type="button" data-act="food-export">' + ic('download') + 'Export CSV</button><button class="btn" type="button" data-act="food-import">' + ic('upload') + 'Import</button><button class="btn btn-primary" type="button" data-act="food-new">' + ic('plus') + 'Nová potravina</button>');
    h += '<div class="callout info" style="margin-bottom:14px">' + ic('info') + '<div class="sm"><b>Databáze má ' + all.length + ' potravin.</b> ' + counts.curated + ' je ručně vybraných základních a <b>orientačních</b> (průměrné hodnoty z běžných tabulek, včetně základních nápojů) a ' + counts.nutridb + ' pochází z exportu NutriDatabáze (hodnoty na 100 g jedlého podílu). U položek z NutriDatabáze jsou <b>alergeny odvozené automaticky z názvu</b>, proto je u klientů s alergií vždy zkontroluj. Návrhy náhrad, doplnění a automatický jídelníček používají jen běžné potraviny. NutriDatabázi najdeš ve vyhledávání a ve výběru potraviny do jídla.</div></div>';
    h += '<div class="row" style="margin-bottom:10px"><div class="grow" style="min-width:200px"><input type="search" data-in="food-q" data-fid="foodq" value="' + esc(u.foodQ) + '" placeholder="Hledat potravinu…" aria-label="Hledat potravinu"></div>' +
      '<select data-ch="food-cat" aria-label="Kategorie" style="max-width:220px"><option value="">Všechny kategorie</option>' + NT.CATS.map(([k, l]) => '<option value="' + k + '"' + (u.foodCat === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>';
    h += '<div class="row" style="gap:6px;margin-bottom:12px">' + [['', 'Vše (' + all.length + ')'], ['curated', 'Základní (' + counts.curated + ')'], ['nutridb', 'NutriDatabáze (' + counts.nutridb + ')'], ['drinks', 'Nápoje (' + counts.drinks + ')'], ['mine', 'Vlastní a importované (' + counts.mine + ')'], ['review', 'K ověření (' + counts.review + ')'], ['issues', 'S problémem v datech (' + counts.issues + ')']]
      .map(([k, l]) => '<button class="chip" type="button" data-act="food-filter" data-f="' + k + '" aria-pressed="' + ((u.foodFilter || '') === k) + '">' + l + '</button>').join('') + '</div>';
    if (selN) h += '<div class="callout info" style="margin-bottom:12px;align-items:center"><div class="row grow"><b>Vybráno ' + selN + '</b><span class="sp"></span><button class="btn btn-sm" type="button" data-act="food-bulk-ver">' + ic('check', 'ico-sm') + 'Označit jako ověřené</button><button class="btn btn-sm btn-danger" type="button" data-act="food-bulk-del">' + ic('trash', 'ico-sm') + 'Smazat</button><button class="btn btn-sm btn-ghost" type="button" data-act="food-sel-none">Zrušit výběr</button></div></div>';
    if (!list.length) return h + App.emptyBox('Nic nenalezeno', 'Zkus jiný výraz nebo zrušit filtr.', '');
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:34px"><input type="checkbox" aria-label="Vybrat zobrazené" data-ch="food-sel-all"' + (shown.length && shown.every((f) => u.foodSel[f.id]) ? ' checked' : '') + '></th><th>Název</th><th>Kategorie</th><th class="r">kcal</th><th class="r">Bílk.</th><th class="r">Tuky</th><th class="r">Sach.</th><th class="r">Vlákn.</th><th>Stav</th></tr></thead><tbody>' +
      shown.map((f) => {
        const sev = S.foodIssues.get(f.id);
        const st = sev === 'bad' ? '<span class="badge bad">Chyba</span>' : sev === 'warn' ? '<span class="badge warn">Zkontrolovat</span>' : '';
        const src = f.source === 'ai' ? '<span class="badge ai">Odhad AI</span>' : f.source === 'import' ? '<span class="badge info">Import</span>' : f.source === 'own' ? '<span class="badge accent">Vlastní</span>' : f.origin === 'nutridb' ? '<span class="badge info" title="Z exportu NutriDatabáze, alergeny odvozeny z názvu">NutriDatabáze</span>' : '';
        const ver = (f.source === 'ai' || f.source === 'import') ? (f.verified ? '<span class="badge ok">' + ic('check', 'ico-sm') + 'Ověřeno</span>' : '<span class="badge warn">K ověření</span>') : '';
        return '<tr class="click" data-act="food-edit" data-id="' + f.id + '"><td data-nostop="1"><input type="checkbox" aria-label="Vybrat" data-ch="food-sel" data-id="' + f.id + '"' + (u.foodSel[f.id] ? ' checked' : '') + '></td><td><b>' + esc(f.name) + '</b></td><td class="muted">' + esc(NT.CAT_LABEL[f.cat] || f.cat) + '</td>' +
          '<td class="r">' + (f.kcal != null ? fmt(f.kcal) : '–') + '</td><td class="r">' + (f.protein != null ? fmt(f.protein, 1) : '–') + '</td><td class="r">' + (f.fat != null ? fmt(f.fat, 1) : '–') + '</td><td class="r">' + (f.carbs != null ? fmt(f.carbs, 1) : '–') + '</td><td class="r">' + (f.fiber != null ? fmt(f.fiber, 1) : '–') + '</td><td><span class="row" style="gap:4px">' + src + ver + st + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
    h += '<div class="row" style="margin-top:10px"><span class="muted sm">Zobrazeno ' + shown.length + ' z ' + list.length + '.</span>' + (list.length > shown.length ? '<button class="btn btn-sm" type="button" data-act="food-more">Zobrazit další</button>' : '') + '</div>';
    return h;
  };
  // klik na checkbox v řádku nesmí otevřít editor
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-nostop]')) e.stopPropagation();
  }, true);
  let foodQT = null;
  App.IN['food-q'] = (t) => { S.ui.foodQ = t.value; S.ui.foodLimit = 80; clearTimeout(foodQT); foodQT = setTimeout(App.rerender, 220); };
  App.CH['food-cat'] = (t) => { S.ui.foodCat = t.value; S.ui.foodLimit = 80; App.rerender(); };
  App.A['food-filter'] = (t) => { S.ui.foodFilter = t.dataset.f; S.ui.foodLimit = 80; App.rerender(); };
  App.A['food-more'] = () => { S.ui.foodLimit += 80; App.rerender(); };
  App.CH['food-sel'] = (t) => { S.ui.foodSel[t.dataset.id] = t.checked; App.rerender(); };
  App.CH['food-sel-all'] = (t) => {
    const u = S.ui; const list = App.foodMatch(S.cat.foods, u.foodQ, u.foodCat).filter(foodFilterFn[u.foodFilter || '']).slice(0, u.foodLimit);
    list.forEach((f) => { u.foodSel[f.id] = t.checked; }); App.rerender();
  };
  App.A['food-sel-none'] = () => { S.ui.foodSel = {}; App.rerender(); };
  const selIds = () => Object.keys(S.ui.foodSel).filter((k) => S.ui.foodSel[k]);
  App.A['food-bulk-ver'] = () => {
    const ids = selIds(); let n = 0;
    ids.forEach((id) => { const f = S.cat.ctx.foods.get(id); if (f && !f.verified) { Store.put('foods', Object.assign(clone(f), { verified: true })); n++; } });
    S.ui.foodSel = {}; App.rebuildCatalog(); App.rerender(); App.toast('Označeno jako ověřené: ' + n);
  };
  App.deleteFoods = function (ids) {
    ids.forEach((id) => {
      const f = S.cat.ctx.foods.get(id); if (!f) return;
      if (App.isBaseFood(f)) Store.put('foods', Object.assign(clone(f), { hidden: true }));
      else Store.remove('foods', id);
    });
    App.rebuildCatalog();
  };
  App.A['food-bulk-del'] = async () => {
    const ids = selIds();
    const used = ids.filter((id) => { const u = App.foodUsage(id); return u.items || u.recipes; }).length;
    const ok = await App.confirm({ title: 'Smazat ' + ids.length + ' ' + NT.plural(ids.length, 'potravinu', 'potraviny', 'potravin') + '?', text: (used ? used + ' z nich se používá v jídelnících nebo receptech, tam pak zůstane „smazaná potravina“. ' : '') + 'Základní potraviny se jen skryjí a jdou obnovit v Nastavení.', ok: 'Smazat', danger: true });
    if (!ok) return;
    App.deleteFoods(ids); S.ui.foodSel = {}; App.rerender(); App.toast('Smazáno: ' + ids.length);
  };
  App.A['food-export'] = async () => {
    const csv = NT.foodsToCsv(S.cat.foods);
    await App.saveFile('potraviny.csv', csv);
  };

  // ------------------------------------------------------------ editor potraviny
  const FOOD_NUMS = [['kcal', 'Energie', 'kcal', true], ['protein', 'Bílkoviny', 'g', true], ['fat', 'Tuky', 'g', true], ['satFat', 'z toho nasycené', 'g'], ['carbs', 'Sacharidy', 'g', true], ['sugar', 'z toho cukry', 'g'], ['fiber', 'Vláknina', 'g'], ['salt', 'Sůl', 'g']];
  App.openFoodEditor = function (food, opts) {
    opts = opts || {};
    const f = food ? clone(food) : { id: null, name: opts.name || '', cat: opts.cat || 'ostatni', kcal: null, protein: null, fat: null, satFat: null, carbs: null, sugar: null, fiber: null, salt: null, allergens: [], portions: [], source: 'own', verified: true, note: '' };
    App.openModal({ type: 'foodEdit', f, isNew: !food, orig: food ? clone(food) : null, afterSave: opts.afterSave, ai: { busy: false, err: '' } });
  };
  const issuesHtml = (f) => {
    const iss = NT.validateFood(f);
    if (!iss.length) return '<div class="callout ok">' + ic('check') + '<div class="sm">Údaje vypadají v pořádku.</div></div>';
    return '<div class="stack-sm">' + iss.map((i) => '<div class="callout ' + (i.level === 'bad' ? 'bad' : i.level === 'warn' ? 'warn' : 'info') + '" style="padding:7px 10px">' + ic(i.level === 'info' ? 'info' : 'alert', 'ico-sm') + '<div class="sm">' + esc(i.text) + '</div></div>').join('') + '</div>';
  };
  App.modals.foodEdit = (m) => {
    const f = m.f;
    const used = f.id ? App.foodUsage(f.id) : { items: 0, recipes: 0 };
    return {
      title: m.isNew ? 'Nová potravina' : 'Potravina: ' + (m.orig ? m.orig.name : ''), size: 'mid',
      body: '<div class="form-grid"><label class="f span-all">Název *<input type="text" data-in="fe-txt" data-k="name" data-fid="fe-name" id="fe-name" value="' + esc(f.name) + '" placeholder="např. Kuřecí prsa (syrová)"></label>' +
        '<label class="f">Kategorie<select data-ch="fe-cat">' + NT.CATS.map(([k, l]) => '<option value="' + k + '"' + (f.cat === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
        '<div class="f"><span>Původ údajů</span><div class="row" style="min-height:38px"><span class="badge ' + (f.source === 'ai' ? 'ai' : f.source === 'import' ? 'info' : 'accent') + '">' + esc(SRC_LABEL[f.source] || f.source) + '</span><label class="chk"><input type="checkbox" data-ch="fe-ver"' + (f.verified ? ' checked' : '') + '>Ověřeno</label></div></div></div>' +
        '<h4 style="margin:16px 0 8px">Živiny na 100 g <span class="muted sm" style="font-weight:400">(* povinné; čárka nebo tečka)</span></h4>' +
        '<div class="grid g4" style="gap:10px">' + FOOD_NUMS.map(([k, l, u, req]) => '<label class="f">' + l + (req ? ' *' : '') + '<input type="text" inputmode="decimal" data-in="fe-num" data-k="' + k + '" data-fid="fe-' + k + '" id="fe-' + k + '" value="' + numTxt(f[k]) + '" placeholder="' + u + '"></label>').join('') + '</div>' +
        '<div class="row" style="margin:10px 0"><button class="btn btn-sm" type="button" data-act="fe-calc">' + ic('refresh', 'ico-sm') + 'Dopočítat energii ze živin</button>' +
        (App.aiAvailable() ? '<button class="btn btn-sm btn-ai" type="button" data-act="fe-ai"' + (m.ai.busy ? ' disabled' : '') + '>' + ic('sparkle', 'ico-sm') + 'Odhadnout hodnoty pomocí AI</button>' : '') + (m.ai.busy ? '<span class="spin"></span><span class="muted sm">AI odhaduje…</span>' : '') + '</div>' +
        (m.ai.err ? '<div class="callout bad" style="margin-bottom:10px">' + ic('alert') + '<div class="sm">' + esc(m.ai.err) + '</div></div>' : '') +
        '<div id="fe-issues" style="margin-bottom:14px">' + issuesHtml(f) + '</div>' +
        '<h4 style="margin:6px 0 8px">Alergeny</h4><div class="row" style="gap:6px">' + NT.ALLERGENS.map(([k, l]) => '<button class="chip bad" type="button" data-act="fe-all" data-a="' + k + '" aria-pressed="' + ((f.allergens || []).indexOf(k) >= 0) + '">' + l + '</button>').join('') + '</div>' +
        '<h4 style="margin:16px 0 8px">Běžné porce <span class="muted sm" style="font-weight:400">(pro přepočet na kusy, lžíce apod.)</span></h4><div class="stack-sm">' +
        (f.portions || []).map((p, i) => '<div class="row nw"><input type="text" data-in="fe-pname" data-i="' + i + '" data-fid="fe-pn' + i + '" id="fe-pn' + i + '" value="' + esc(p.name) + '" placeholder="např. 1 vejce (60 g)" aria-label="Název porce" style="flex:2"><input type="text" inputmode="decimal" data-in="fe-pg" data-i="' + i + '" data-fid="fe-pg' + i + '" id="fe-pg' + i + '" value="' + numTxt(p.g) + '" placeholder="gramy" aria-label="Gramy porce" style="flex:1;max-width:100px"><span class="muted">g</span><button class="btn btn-ghost btn-icon btn-sm btn-danger" type="button" data-act="fe-pdel" data-i="' + i + '" aria-label="Odebrat porci">' + ic('x', 'ico-sm') + '</button></div>').join('') +
        '<div><button class="btn btn-sm" type="button" data-act="fe-padd">' + ic('plus', 'ico-sm') + 'Přidat porci</button></div></div>' +
        '<label class="f" style="margin-top:14px">Poznámka<textarea rows="2" data-in="fe-txt" data-k="note" data-fid="fe-note" id="fe-note">' + esc(f.note || '') + '</textarea></label>' +
        (used.items || used.recipes ? '<p class="muted sm" style="margin-top:10px">Používá se v ' + used.items + ' ' + NT.plural(used.items, 'položce jídelníčku', 'položkách jídelníčků', 'položkách jídelníčků') + ' a ' + used.recipes + ' ' + NT.plural(used.recipes, 'receptu', 'receptech', 'receptech') + '. Změna hodnot se promítne všude.</p>' : ''),
      footer: (!m.isNew ? '<button class="btn btn-danger" type="button" data-act="fe-del" style="margin-right:auto">' + ic('trash', 'ico-sm') + 'Smazat</button>' : '') + (m.orig && App.isBaseFood(m.orig) && hasOverride(m.orig.id) ? '<button class="btn" type="button" data-act="fe-reset">Obnovit původní</button>' : '') +
        '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="fe-save">Uložit</button>',
      focus: m.isNew ? '#fe-name' : null
    };
  };
  const feRefresh = () => { const m = top(); const el = $('#fe-issues'); if (el && m) el.innerHTML = issuesHtml(m.f); };
  App.IN['fe-txt'] = (t) => { const m = top(); m.f[t.dataset.k] = t.value; feRefresh(); };
  App.IN['fe-num'] = (t) => { const m = top(); const v = String(t.value).trim(); m.f[t.dataset.k] = v === '' ? null : NT.toNum(v); feRefresh(); };
  App.CH['fe-cat'] = (t) => { top().f.cat = t.value; };
  App.CH['fe-ver'] = (t) => { top().f.verified = t.checked; };
  App.A['fe-all'] = (t) => { const f = top().f; const a = t.dataset.a; const i = (f.allergens || []).indexOf(a); f.allergens = f.allergens || []; if (i >= 0) f.allergens.splice(i, 1); else f.allergens.push(a); t.setAttribute('aria-pressed', i < 0); };
  App.IN['fe-pname'] = (t) => { top().f.portions[+t.dataset.i].name = t.value; };
  App.IN['fe-pg'] = (t) => { top().f.portions[+t.dataset.i].g = NT.toNum(t.value); };
  App.A['fe-padd'] = () => { top().f.portions.push({ name: '', g: null }); App.renderModal(); };
  App.A['fe-pdel'] = (t) => { top().f.portions.splice(+t.dataset.i, 1); App.renderModal(); };
  App.A['fe-calc'] = () => {
    const f = top().f;
    if (f.protein == null || f.fat == null || f.carbs == null) { App.toast('Nejdřív vyplň bílkoviny, tuky a sacharidy', { kind: 'bad' }); return; }
    f.kcal = NT.round(4 * f.protein + 9 * f.fat + 4 * f.carbs + 2 * (f.fiber || 0), 0); App.renderModal();
  };
  App.A['fe-ai'] = async () => {
    const m = top(); const f = m.f;
    if (!f.name.trim()) { App.toast('Nejdřív zadej název potraviny', { kind: 'bad' }); return; }
    m.ai.busy = true; m.ai.err = ''; App.renderModal();
    try {
      const json = await App.aiCall('json', NT.promptFood(f.name.trim()));
      const p = NT.parseAiFood(json);
      if (!p || p.kcal == null || p.protein == null || p.fat == null || p.carbs == null) throw { message: 'AI nevrátila úplné hodnoty. Zkus to znovu nebo je zadej ručně.' };
      NT.NK.forEach((k) => { f[k] = p[k]; });
      if (p.allergens.length) f.allergens = p.allergens;
      if (!(f.portions || []).length) f.portions = p.portions;
      if (p.note) f.note = p.note;
      f.source = 'ai'; f.verified = false;
    } catch (e) { m.ai.err = e.message || 'AI se nepodařilo zavolat.'; }
    m.ai.busy = false; if (S.modals.indexOf(m) >= 0) App.renderModal();
  };
  App.A['fe-save'] = () => {
    const m = top(); const f = m.f;
    const name = String(f.name || '').trim();
    const out = Object.assign({}, f, { name, portions: (f.portions || []).filter((p) => p.name && p.name.trim() && p.g > 0).map((p) => ({ name: p.name.trim(), g: p.g })) });
    const iss = NT.validateFood(out);
    const bad = iss.filter((i) => i.level === 'bad');
    if (bad.length) { App.toast('Oprav chyby v údajích: ' + bad[0].text, { kind: 'bad' }); return; }
    NT.NK.forEach((k) => { if (out[k] != null) out[k] = NT.round(out[k], 2); });
    if (!out.id) out.id = NT.uid('f');
    if (!out.source) out.source = 'own';
    delete out.hidden;
    Store.put('foods', out); App.rebuildCatalog(); App.closeModal(m); App.rerender(); App.toast('Potravina uložena');
    if (m.afterSave) m.afterSave(out);
  };
  App.A['fe-del'] = async () => {
    const m = top(); const f = m.f;
    const u = App.foodUsage(f.id);
    const ok = await App.confirm({ title: 'Smazat potravinu „' + f.name + '“?', text: (u.items || u.recipes ? 'Používá se v ' + u.items + ' položkách jídelníčků a ' + u.recipes + ' receptech, tam zůstane „smazaná potravina“. ' : '') + (m.orig && App.isBaseFood(m.orig) ? 'Základní potravinu jen skryjeme, jde obnovit v Nastavení.' : 'Smazání nejde vrátit.'), ok: 'Smazat', danger: true });
    if (!ok) return;
    App.deleteFoods([f.id]); App.closeAll(); App.rerender(); App.toast('Potravina smazána');
  };
  App.A['fe-reset'] = async () => {
    const m = top();
    const ok = await App.confirm({ title: 'Obnovit původní hodnoty?', text: 'Tvé úpravy této základní potraviny se zahodí.', ok: 'Obnovit' });
    if (!ok) return;
    Store.remove('foods', m.orig.id); App.rebuildCatalog(); App.closeAll(); App.rerender(); App.toast('Obnoveno původní nastavení');
  };
  App.A['food-new'] = () => App.openFoodEditor(null);
  App.A['food-edit'] = (t) => { const f = S.cat.ctx.foods.get(t.dataset.id); if (f) App.openFoodEditor(f); };

  // ------------------------------------------------------------ import
  App.A['food-import'] = () => App.openModal({ type: 'import', step: 1, text: '', fileName: '', parsed: null, map: {}, opts: { cat: 'ostatni', includeBrand: true, sodiumUnit: 'g', skipDup: true }, excl: {}, busy: false, err: '', sticky: false });
  const impRows = (m) => {
    const known = new Set(S.cat.allFoods.filter((f) => !f.hidden).map((f) => NT.norm(f.name)));
    const seen = new Set();
    const out = [];
    for (let i = 0; i < m.parsed.rows.length && out.length < 1000; i++) {
      const r = NT.rowToFood(m.parsed.rows[i], m.map, { cat: m.opts.cat, includeBrand: m.opts.includeBrand, sodiumUnit: m.opts.sodiumUnit, source: 'import' });
      if (!r.food.name) continue;
      const key = NT.norm(r.food.name);
      const dup = known.has(key) || seen.has(key);
      seen.add(key);
      const sev = NT.foodSeverity(r.issues);
      out.push({ idx: i, food: r.food, issues: r.issues, sev, dup });
    }
    return out;
  };
  App.modals.import = (m) => {
    let body = '', footer = '';
    const steps = '<div class="row" style="gap:8px;margin-bottom:14px">' + ['Zdroj', 'Sloupce', 'Kontrola'].map((l, i) => '<span class="badge ' + (m.step === i + 1 ? 'accent' : '') + '">' + (i + 1) + '. ' + l + '</span>').join('') + '</div>';
    if (m.step === 1) {
      body = steps + '<p class="sm" style="margin-bottom:10px">Nahraj tabulku s potravinami (CSV, TSV, Excel) nebo ji vlož z Excelu přes schránku. Aplikace se sama k internetu nepřipojuje, data si stáhneš a nahraješ sem. Každý řádek je jedna potravina, hodnoty na 100 g.</p>' +
        '<div class="grid g2" style="gap:12px"><div class="card flat" style="padding:14px"><h4 style="margin-bottom:8px">Soubor</h4><input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-ch="imp-file" aria-label="Soubor s tabulkou">' + (m.fileName ? '<p class="sm" style="margin-top:8px">Načteno: <b>' + esc(m.fileName) + '</b> (' + (m.parsed ? m.parsed.rows.length : 0) + ' řádků)</p>' : '') + (m.busy ? '<p class="sm"><span class="spin"></span> Načítám…</p>' : '') + '</div>' +
        '<div class="card flat" style="padding:14px"><h4 style="margin-bottom:8px">Nebo vložit z Excelu</h4><textarea rows="5" data-in="imp-text" data-fid="imp-text" id="imp-text" placeholder="Označ buňky v Excelu včetně záhlaví, Ctrl+C a vlož sem (Ctrl+V)">' + esc(m.text) + '</textarea></div></div>' +
        (m.err ? '<div class="callout bad" style="margin-top:12px">' + ic('alert') + '<div class="sm">' + esc(m.err) + '</div></div>' : '') +
        '<div class="callout info" style="margin-top:14px">' + ic('info') + '<div class="sm"><b>Kde data vzít:</b> <a href="https://cz.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a> (balené potraviny, export CSV) a <a href="https://www.nutridatabaze.cz/" target="_blank" rel="noopener noreferrer">NutriDatabáze</a> (české tabulky). U NutriDatabáze se řiď jejími licenčními podmínkami. Záhlaví sloupců se rozpoznají automaticky, nerozpoznané namapuješ v dalším kroku. Naimportované potraviny dostanou štítek „K ověření“, dokud je neprojdeš.</div></div>';
      footer = '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="imp-next1"' + ((m.parsed && m.parsed.rows.length) || m.text.trim() ? '' : ' disabled') + '>Pokračovat</button>';
    } else if (m.step === 2) {
      const hs = m.parsed.headers;
      body = steps + '<p class="sm" style="margin-bottom:10px">Zkontroluj, které sloupce odpovídají kterým údajům. Nalezeno <b>' + m.parsed.rows.length + '</b> řádků.</p><div class="tbl-wrap" style="margin-bottom:14px"><table class="tbl"><thead><tr><th>Údaj</th><th>Sloupec v souboru</th><th>Ukázka</th></tr></thead><tbody>' +
        NT.IMPORT_FIELDS.map(([k, l]) => { const ix = m.map[k]; const sample = ix != null && ix >= 0 ? m.parsed.rows.slice(0, 3).map((r) => r[ix] || '').join(' | ') : '';
          return '<tr><td>' + l + (k === 'name' ? ' *' : '') + '</td><td><select data-ch="imp-map" data-k="' + k + '" aria-label="Sloupec pro ' + esc(l) + '"><option value="-1">– nepoužít –</option>' + hs.map((h, i) => '<option value="' + i + '"' + (ix === i ? ' selected' : '') + '>' + esc(h || '(sloupec ' + (i + 1) + ')') + '</option>').join('') + '</select></td><td class="muted sm" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sample) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="form-grid"><label class="f">Kategorie, když v souboru chybí<select data-ch="imp-opt" data-k="cat">' + NT.CATS.map(([k, l]) => '<option value="' + k + '"' + (m.opts.cat === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
        '<label class="f">Sodík v souboru je v<select data-ch="imp-opt" data-k="sodiumUnit"><option value="g"' + (m.opts.sodiumUnit === 'g' ? ' selected' : '') + '>gramech (Open Food Facts)</option><option value="mg"' + (m.opts.sodiumUnit === 'mg' ? ' selected' : '') + '>miligramech</option></select></label>' +
        '<label class="chk span-all"><input type="checkbox" data-ch="imp-optb" data-k="includeBrand"' + (m.opts.includeBrand ? ' checked' : '') + '>Připojit značku k názvu (např. „Jogurt bílý (Madeta)“)</label>' +
        '<label class="chk span-all"><input type="checkbox" data-ch="imp-optb" data-k="skipDup"' + (m.opts.skipDup ? ' checked' : '') + '>Přeskočit potraviny, které už v databázi jsou (podle názvu)</label></div>';
      footer = '<button class="btn" type="button" data-act="imp-back">Zpět</button><button class="btn btn-primary" type="button" data-act="imp-next2"' + (m.map.name != null && m.map.name >= 0 ? '' : ' disabled') + '>Zkontrolovat data</button>';
    } else {
      const rows = impRows(m);
      const sel = rows.filter((r) => !m.excl[r.idx] && r.sev !== 'bad' && !(m.opts.skipDup && r.dup));
      const nBad = rows.filter((r) => r.sev === 'bad').length, nDup = rows.filter((r) => r.dup).length, nWarn = rows.filter((r) => r.sev === 'warn').length;
      body = steps + '<div class="grid g4" style="margin-bottom:14px"><div class="stat"><span class="v">' + rows.length + '</span><span class="l">řádků s názvem</span></div><div class="stat"><span class="v" style="color:var(--ok)">' + sel.length + '</span><span class="l">se naimportuje</span></div><div class="stat"><span class="v" style="color:var(--bad)">' + nBad + '</span><span class="l">s chybou (nelze)</span></div><div class="stat"><span class="v">' + nDup + '</span><span class="l">duplicit</span></div></div>' +
        (rows.length >= 1000 ? App.callout('warn', 'Importuje se nejvýše prvních 1000 řádků najednou.') + '<div style="height:10px"></div>' : '') +
        (nWarn ? '<p class="sm muted" style="margin-bottom:8px">' + nWarn + ' řádků má varování (např. nesedí energie). Importují se, ale po importu je najdeš ve filtru „S problémem v datech“.</p>' : '') +
        '<div class="tbl-wrap" style="max-height:340px;overflow:auto"><table class="tbl"><thead><tr><th style="width:34px"></th><th>Název</th><th class="r">kcal</th><th class="r">B</th><th class="r">T</th><th class="r">S</th><th>Kontrola</th></tr></thead><tbody>' +
        rows.slice(0, 200).map((r) => { const f = r.food; const off = r.sev === 'bad' || (m.opts.skipDup && r.dup);
          const msg = r.sev === 'bad' ? r.issues.filter((i) => i.level === 'bad')[0].text : r.dup ? 'Už existuje' : r.sev === 'warn' ? r.issues.filter((i) => i.level === 'warn')[0].text : r.sev === 'info' ? 'Neúplné volitelné údaje' : 'V pořádku';
          return '<tr><td><input type="checkbox" aria-label="Importovat řádek" data-ch="imp-row" data-i="' + r.idx + '"' + (off ? ' disabled' : (m.excl[r.idx] ? '' : ' checked')) + '></td><td>' + esc(f.name) + '</td><td class="r">' + (f.kcal != null ? fmt(f.kcal) : '–') + '</td><td class="r">' + (f.protein != null ? fmt(f.protein, 1) : '–') + '</td><td class="r">' + (f.fat != null ? fmt(f.fat, 1) : '–') + '</td><td class="r">' + (f.carbs != null ? fmt(f.carbs, 1) : '–') + '</td><td><span class="badge ' + (r.sev === 'bad' ? 'bad' : r.dup || r.sev === 'warn' ? 'warn' : r.sev === 'info' ? 'info' : 'ok') + '">' + esc(msg) + '</span></td></tr>'; }).join('') + '</tbody></table></div>' + (rows.length > 200 ? '<p class="muted sm" style="margin-top:6px">Náhled ukazuje prvních 200 řádků, importují se všechny vybrané.</p>' : '');
      footer = '<button class="btn" type="button" data-act="imp-back">Zpět</button><button class="btn btn-primary" type="button" data-act="imp-run"' + (sel.length ? '' : ' disabled') + '>' + ic('upload', 'ico-sm') + 'Importovat ' + sel.length + '</button>';
    }
    return { title: 'Import potravin', size: 'wide', body, footer };
  };
  const decodeBuf = (buf) => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { try { return new TextDecoder('windows-1250').decode(buf); } catch (e2) { return new TextDecoder().decode(buf); } }
  };
  App.CH['imp-file'] = async (t) => {
    const m = top(); const file = t.files && t.files[0]; if (!file) return;
    m.busy = true; m.err = ''; m.fileName = file.name; App.renderModal();
    try {
      const buf = await file.arrayBuffer();
      let text;
      if (/\.xlsx?$/i.test(file.name)) {
        await App.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const wb = root.XLSX.read(new Uint8Array(buf), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        text = root.XLSX.utils.sheet_to_csv(ws, { FS: '\t' });
      } else text = decodeBuf(buf);
      m.text = text; m.parsed = NT.parseDelimited(text);
      if (!m.parsed.rows.length) m.err = 'V souboru nejsou žádná data (potřebuji záhlaví a aspoň jeden řádek).';
    } catch (e) { m.err = /Knihovnu/.test(e.message) ? 'Excel (xlsx) se nepodařilo načíst. Ulož tabulku jako CSV, nebo ji vlož přes schránku.' : 'Soubor se nepodařilo přečíst: ' + e.message; m.parsed = null; m.fileName = ''; }
    m.busy = false; if (S.modals.indexOf(m) >= 0) App.renderModal();
  };
  App.IN['imp-text'] = (t) => { const m = top(); m.text = t.value; m.parsed = null; m.fileName = ''; const b = $('[data-act="imp-next1"]'); if (b) b.disabled = !t.value.trim(); };
  App.A['imp-next1'] = () => {
    const m = top();
    if (!m.parsed) m.parsed = NT.parseDelimited(m.text);
    if (!m.parsed.headers.length || !m.parsed.rows.length) { m.err = 'Potřebuji záhlaví sloupců a aspoň jeden řádek dat.'; App.renderModal(); return; }
    m.err = ''; m.map = NT.guessMapping(m.parsed.headers); m.step = 2; App.renderModal();
  };
  App.CH['imp-map'] = (t) => { const m = top(); const v = +t.value; if (v < 0) delete m.map[t.dataset.k]; else m.map[t.dataset.k] = v; App.renderModal(); };
  App.CH['imp-opt'] = (t) => { top().opts[t.dataset.k] = t.value; };
  App.CH['imp-optb'] = (t) => { top().opts[t.dataset.k] = t.checked; };
  App.CH['imp-row'] = (t) => { const m = top(); if (t.checked) delete m.excl[t.dataset.i]; else m.excl[t.dataset.i] = true; App.renderModal(); };
  App.A['imp-back'] = () => { const m = top(); m.step = Math.max(1, m.step - 1); App.renderModal(); };
  App.A['imp-next2'] = () => { const m = top(); m.step = 3; m.excl = {}; App.renderModal(); };
  App.A['imp-run'] = () => {
    const m = top(); const rows = impRows(m);
    const sel = rows.filter((r) => !m.excl[r.idx] && r.sev !== 'bad' && !(m.opts.skipDup && r.dup));
    sel.forEach((r) => Store.put('foods', r.food));
    App.rebuildCatalog(); App.closeAll(); S.ui.foodFilter = 'review'; S.ui.foodQ = ''; S.ui.foodCat = ''; App.go('foods');
    App.toast('Naimportováno ' + sel.length + ' ' + NT.plural(sel.length, 'potravina', 'potraviny', 'potravin') + '. Najdeš je ve filtru „K ověření“.');
  };

  // ------------------------------------------------------------ recepty
  App.views.recipes = function () {
    const u = S.ui;
    const toks = NT.norm(u.recipeQ).split(/\s+/).filter(Boolean);
    const all = S.cat.recipes;
    const tags = [...new Set(all.flatMap((r) => r.tags || []))].sort((a, b) => a.localeCompare(b, 'cs'));
    const mealSel = u.recipeMeal || [];
    const mealLabels = NT.MEAL_TYPES.concat([...new Set(all.flatMap((r) => r.mealTypes || []))].filter((x) => NT.MEAL_TYPES.indexOf(x) < 0).sort((a, b) => a.localeCompare(b, 'cs')));
    let list = all.filter((r) => { const n = NT.norm(r.name + ' ' + (r.tags || []).join(' ') + ' ' + (r.mealTypes || []).join(' ')); return toks.every((t) => n.indexOf(t) >= 0) && (!u.recipeTag || (r.tags || []).indexOf(u.recipeTag) >= 0) && (!mealSel.length || mealSel.some((x) => (r.mealTypes || []).indexOf(x) >= 0)); });
    list = list.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    let h = App.pageHead('Recepty', 'Vlastní recepty s automaticky spočítanými živinami na porci.',
      '<button class="btn" type="button" data-act="rec-inspire">' + ic('ext') + 'Inspirace z webu</button>' + (App.aiAvailable() ? '<button class="btn btn-ai" type="button" data-act="rec-import">' + ic('sparkle') + 'Z textu</button><button class="btn btn-ai" type="button" data-act="rec-ai">' + ic('sparkle') + 'Navrhnout AI</button>' : '') + '<button class="btn btn-primary" type="button" data-act="rec-new">' + ic('plus') + 'Nový recept</button>');
    h += '<div class="row" style="margin-bottom:10px"><div class="grow" style="min-width:200px"><input type="search" data-in="rec-q" data-fid="recq" value="' + esc(u.recipeQ) + '" placeholder="Hledat recept…" aria-label="Hledat recept"></div></div>';
    h += '<div class="row" style="gap:6px;margin-bottom:8px" role="group" aria-label="Druh jídla"><span class="muted sm">Druh jídla:</span><button class="chip" type="button" data-act="rec-meal" data-m="" aria-pressed="' + (!mealSel.length) + '">Vše</button>' + mealLabels.map((t) => '<button class="chip" type="button" data-act="rec-meal" data-m="' + esc(t) + '" aria-pressed="' + (mealSel.indexOf(t) >= 0) + '">' + esc(t) + ' (' + all.filter((r) => (r.mealTypes || []).indexOf(t) >= 0).length + ')</button>').join('') + '</div>';
    if (tags.length) h += '<div class="row" style="gap:6px;margin-bottom:12px"><span class="muted sm">Štítky:</span><button class="chip" type="button" data-act="rec-tag" data-t="" aria-pressed="' + (!u.recipeTag) + '">Vše</button>' + tags.map((t) => '<button class="chip" type="button" data-act="rec-tag" data-t="' + esc(t) + '" aria-pressed="' + (u.recipeTag === t) + '">' + esc(t) + '</button>').join('') + '</div>';
    if (!list.length) return h + App.emptyBox('Žádný recept', 'Vytvoř vlastní recept, nech si ho navrhnout AI, nebo ho převeď z textu zkopírovaného z webu.', '');
    h += '<div class="grid g-auto">' + list.map((r) => {
      const c = NT.recipeCalc(r, App.ctx());
      return '<div class="card" style="display:flex;flex-direction:column;gap:8px"><div><h3>' + esc(r.name) + '</h3><div class="row" style="gap:4px;margin-top:4px">' + (r.mealTypes || []).map((t) => '<span class="badge accent">' + esc(t) + '</span>').join('') + (r.aiGenerated ? '<span class="badge ai">AI</span>' : '') + (r.starter ? '<span class="badge">Ukázkový</span>' : '') + (c.unknown.length ? '<span class="badge bad">Chybí potravina</span>' : '') + (c.unverified.length ? '<span class="badge warn">Neověřené suroviny</span>' : '') + (r.timeMin ? '<span class="badge info">' + ic('clock', 'ico-sm') + r.timeMin + ' min</span>' : '') + '</div></div>' +
        '<div class="sm">Na porci: <b class="num">' + fmt(c.per.kcal) + ' kcal</b><br><span class="macros"><span>' + App.macroSw('protein') + 'B ' + fmt(c.per.protein) + '</span><span>' + App.macroSw('fat') + 'T ' + fmt(c.per.fat) + '</span><span>' + App.macroSw('carbs') + 'S ' + fmt(c.per.carbs) + '</span></span></div>' +
        '<div class="muted xs">' + (r.servings || 1) + ' ' + NT.plural(r.servings || 1, 'porce', 'porce', 'porcí') + ' · ' + (r.ingredients || []).length + ' surovin</div>' +
        '<div class="row" style="margin-top:auto"><button class="btn btn-primary btn-sm" type="button" data-act="rec-edit" data-id="' + r.id + '">Otevřít</button><button class="btn btn-sm" type="button" data-act="rec-dup" data-id="' + r.id + '">' + ic('copy', 'ico-sm') + 'Kopie</button><button class="btn btn-sm btn-ghost btn-danger" type="button" data-act="rec-del" data-id="' + r.id + '" aria-label="Smazat recept">' + ic('trash', 'ico-sm') + '</button></div></div>';
    }).join('') + '</div>';
    return h;
  };
  let recQT = null;
  App.IN['rec-q'] = (t) => { S.ui.recipeQ = t.value; clearTimeout(recQT); recQT = setTimeout(App.rerender, 220); };
  App.A['rec-tag'] = (t) => { S.ui.recipeTag = t.dataset.t; App.rerender(); };
  App.A['rec-meal'] = (t) => {
    const k = t.dataset.m; const cur = S.ui.recipeMeal || [];
    S.ui.recipeMeal = !k ? [] : cur.indexOf(k) >= 0 ? cur.filter((x) => x !== k) : cur.concat([k]);
    App.rerender();
  };

  const blankRecipe = () => ({ id: null, name: '', servings: 2, timeMin: null, mealTypes: [], tags: [], ingredients: [], steps: [], notes: '', source: 'own' });
  App.openRecipeEditor = function (r, opts) {
    opts = opts || {};
    App.openModal({ type: 'recEdit', r: r ? clone(r) : blankRecipe(), isNew: !r || !!opts.asNew, stepsText: ((r && r.steps) || []).join('\n'), mealTypesText: '', tagsText: ((r && r.tags) || []).join(', '), newFoods: opts.newFoods || [] });
  };
  const recNutr = (m) => {
    const ctx = App.ctx();
    const tmp = Object.assign({}, m.r);
    // nové (zatím neuložené) potraviny z AI znají jen v kontextu editoru
    const foods = new Map(ctx.foods); (m.newFoods || []).forEach((f) => foods.set(f.id, f));
    const c = NT.recipeCalc(tmp, { foods, recipes: ctx.recipes });
    return c;
  };
  const recNutrHtml = (m) => {
    const c = recNutr(m);
    const row = (l, n) => '<tr><td>' + l + '</td><td class="r"><b>' + fmt(n.kcal) + '</b> kcal</td><td class="r">' + fmt(n.protein, 1) + ' g</td><td class="r">' + fmt(n.fat, 1) + ' g</td><td class="r">' + fmt(n.carbs, 1) + ' g</td><td class="r">' + fmt(n.fiber, 1) + ' g</td></tr>';
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="r">Energie</th><th class="r">Bílk.</th><th class="r">Tuky</th><th class="r">Sach.</th><th class="r">Vlákn.</th></tr></thead><tbody>' + row('Na porci', c.per) + row('Celý recept', c.total) + '</tbody></table></div>' +
      (c.unknown.length ? '<div class="callout bad" style="margin-top:8px">' + ic('alert') + '<div class="sm">' + c.unknown.length + ' surovin odkazuje na smazanou potravinu. Vyber jinou.</div></div>' : '') +
      (c.unverified.length ? '<div class="callout warn" style="margin-top:8px">' + ic('alert') + '<div class="sm">Neověřené hodnoty AI u: ' + c.unverified.map(esc).join(', ') + '.</div></div>' : '');
  };
  App.modals.recEdit = (m) => {
    const r = m.r; const ctx = App.ctx();
    const foodName = (id) => { const f = ctx.foods.get(id) || (m.newFoods || []).find((x) => x.id === id); return f ? f.name + (f.source === 'ai' && !f.verified ? ' (odhad AI)' : '') : '(smazaná potravina)'; };
    return {
      title: m.isNew ? 'Nový recept' : 'Recept', size: 'wide',
      body: '<div class="form-grid"><label class="f span-all">Název *<input type="text" data-in="re-txt" data-k="name" data-fid="re-name" id="re-name" value="' + esc(r.name) + '"></label>' +
        '<label class="f">Počet porcí *<input type="number" min="1" max="20" step="1" data-in="re-num" data-k="servings" data-fid="re-serv" id="re-serv" value="' + (r.servings || 1) + '"></label>' +
        '<label class="f">Doba přípravy (min)<input type="number" min="0" max="600" step="5" data-in="re-num" data-k="timeMin" data-fid="re-time" id="re-time" value="' + (r.timeMin == null ? '' : r.timeMin) + '"></label>' +
        '<label class="f span-all">Štítky<input type="text" data-in="re-tags" data-fid="re-tags" id="re-tags" value="' + esc(m.tagsText) + '" placeholder="rychlé, bez lepku"></label>' +
        '<div class="span-all"><div class="muted sm" style="font-weight:500;margin-bottom:6px">Druh jídla <span style="font-weight:400">(vyber jeden nebo víc, podle toho se recepty filtrují)</span></div><div class="row" style="gap:6px" role="group" aria-label="Druh jídla">' +
        NT.MEAL_TYPES.concat((r.mealTypes || []).filter((x) => NT.MEAL_TYPES.indexOf(x) < 0)).map((t) => '<button class="chip" type="button" data-act="re-mt-toggle" data-t="' + esc(t) + '" aria-pressed="' + ((r.mealTypes || []).indexOf(t) >= 0) + '">' + esc(t) + '</button>').join('') +
        '<input type="text" data-enter="re-mt-add" data-in="re-mt" data-fid="re-mt" id="re-mt" value="' + esc(m.mealTypesText) + '" placeholder="vlastní + Enter" aria-label="Vlastní druh jídla" style="width:150px;min-height:28px;padding:2px 10px"></div></div></div>' +
        '<h4 style="margin:16px 0 8px">Suroviny <span class="muted sm" style="font-weight:400">(gramy syrové suroviny, pokud není v názvu „vařená“)</span></h4><div class="stack-sm">' +
        r.ingredients.map((ing, i) => '<div class="row nw"><button class="btn grow" type="button" data-act="re-ing-change" data-i="' + i + '" style="justify-content:flex-start;text-align:left" title="Změnit potravinu">' + esc(foodName(ing.foodId)) + '</button><span class="amt"><input type="number" min="1" max="3000" step="5" aria-label="Gramy" data-in="re-g" data-i="' + i + '" data-fid="re-g' + i + '" id="re-g' + i + '" value="' + (ing.grams || '') + '" style="width:84px"> g</span><button class="btn btn-ghost btn-icon btn-sm btn-danger" type="button" data-act="re-ing-del" data-i="' + i + '" aria-label="Odebrat surovinu">' + ic('x', 'ico-sm') + '</button></div>').join('') +
        '<div><button class="btn btn-sm btn-primary" type="button" data-act="re-ing-add">' + ic('plus', 'ico-sm') + 'Přidat surovinu</button></div></div>' +
        '<h4 style="margin:16px 0 8px">Živiny</h4><div id="re-nutr">' + recNutrHtml(m) + '</div>' +
        '<label class="f" style="margin-top:16px">Postup (jeden krok na řádek)<textarea rows="5" data-in="re-steps" data-fid="re-steps" id="re-steps">' + esc(m.stepsText) + '</textarea></label>' +
        '<label class="f" style="margin-top:10px">Poznámka<textarea rows="2" data-in="re-txt" data-k="notes" data-fid="re-notes" id="re-notes">' + esc(r.notes || '') + '</textarea></label>' +
        (r.source && r.source !== 'own' ? '<p class="muted sm" style="margin-top:8px">Zdroj: ' + esc(r.source) + '</p>' : ''),
      footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="re-save">Uložit recept</button>', focus: m.isNew ? '#re-name' : null
    };
  };
  const reRefresh = () => { const el = $('#re-nutr'); const m = top(); if (el && m) el.innerHTML = recNutrHtml(m); };
  App.IN['re-txt'] = (t) => { top().r[t.dataset.k] = t.value; };
  App.IN['re-num'] = (t) => { const v = NT.toNum(t.value); top().r[t.dataset.k] = v; if (t.dataset.k === 'servings') reRefresh(); };
  App.IN['re-mt'] = (t) => { top().mealTypesText = t.value; };
  App.A['re-mt-toggle'] = (t) => {
    const m = top(); const k = t.dataset.t; const cur = m.r.mealTypes || [];
    m.r.mealTypes = cur.indexOf(k) >= 0 ? cur.filter((x) => x !== k) : cur.concat([k]);
    t.setAttribute('aria-pressed', m.r.mealTypes.indexOf(k) >= 0);
  };
  App.A['re-mt-add'] = () => {
    const m = top(); const add = NT.normMealTypes(m.mealTypesText);
    if (!add.length) return;
    m.r.mealTypes = NT.normMealTypes((m.r.mealTypes || []).concat(add)); m.mealTypesText = ''; App.renderModal();
  };
  App.IN['re-tags'] = (t) => { top().tagsText = t.value; };
  App.IN['re-steps'] = (t) => { top().stepsText = t.value; };
  App.IN['re-g'] = (t) => { top().r.ingredients[+t.dataset.i].grams = NT.toNum(t.value) || 0; reRefresh(); };
  App.A['re-ing-del'] = (t) => { top().r.ingredients.splice(+t.dataset.i, 1); App.renderModal(); };
  const pickFoodFor = (cb) => App.openPicker({ single: true, ctxless: true, client: null, tab: 'food', onPick: cb });
  App.A['re-ing-add'] = () => { const m = top(); pickFoodFor((f) => { m.r.ingredients.push({ foodId: f.id, grams: NT.defaultGrams(f) }); App.renderModal(); }); };
  App.A['re-ing-change'] = (t) => { const m = top(); const i = +t.dataset.i; pickFoodFor((f) => { m.r.ingredients[i].foodId = f.id; App.renderModal(); }); };
  App.A['re-save'] = () => {
    const m = top(); const r = m.r;
    const name = String(r.name || '').trim();
    if (!name) { App.toast('Zadej název receptu', { kind: 'bad' }); return; }
    if (!(r.servings >= 1)) { App.toast('Počet porcí musí být alespoň 1', { kind: 'bad' }); return; }
    const ings = r.ingredients.filter((i) => i.grams > 0);
    if (!ings.length) { App.toast('Přidej aspoň jednu surovinu s gramáží', { kind: 'bad' }); return; }
    const split = (s) => String(s).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    const out = Object.assign({}, r, { name, servings: Math.round(r.servings), ingredients: ings, steps: m.stepsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), mealTypes: NT.normMealTypes((r.mealTypes || []).concat(split(m.mealTypesText))), tags: split(m.tagsText), timeMin: r.timeMin > 0 ? r.timeMin : null });
    if (!out.id) out.id = NT.uid('r');
    delete out.hidden;
    (m.newFoods || []).filter((f) => ings.some((i) => i.foodId === f.id)).forEach((f) => Store.put('foods', f));
    Store.put('recipes', out); App.rebuildCatalog(); App.closeModal(m); App.rerender(); App.toast('Recept uložen');
  };
  App.A['rec-new'] = () => App.openRecipeEditor(null);
  App.A['rec-edit'] = (t) => { const r = S.cat.ctx.recipes.get(t.dataset.id); if (r) App.openRecipeEditor(r); };
  App.A['rec-dup'] = (t) => { const r = clone(S.cat.ctx.recipes.get(t.dataset.id)); r.id = null; r.name += ' (kopie)'; delete r.starter; r.source = 'own'; App.openRecipeEditor(r, { asNew: true }); };
  App.A['rec-del'] = async (t) => {
    const r = S.cat.ctx.recipes.get(t.dataset.id);
    let used = 0; Store.list('plans').forEach((p) => p.days.forEach((d) => d.meals.forEach((m) => m.items.forEach((i) => { if (i.type === 'recipe' && i.refId === r.id) used++; }))));
    const ok = await App.confirm({ title: 'Smazat recept „' + r.name + '“?', text: (used ? 'Je použitý v ' + used + ' položkách jídelníčků, tam zůstane „smazaný recept“. ' : '') + (r.starter ? 'Ukázkový recept jen skryjeme, jde obnovit v Nastavení.' : 'Smazání nejde vrátit.'), ok: 'Smazat', danger: true });
    if (!ok) return;
    if (r.starter) Store.put('recipes', Object.assign(clone(r), { hidden: true })); else Store.remove('recipes', r.id);
    App.rebuildCatalog(); App.rerender(); App.toast('Recept smazán');
  };

  // ---- AI: návrh receptů a import z textu (sdílený výsledkový panel)
  const aiRecipeResults = (m) => {
    if (!m.results) return '';
    if (!m.results.length) return '<p class="muted">AI nevrátila použitelný recept. Zkus to znovu.</p>';
    return '<div class="stack" style="margin-top:14px">' + m.results.map((x, i) => {
      const foods = new Map(S.cat.ctx.foods); x.newFoods.forEach((f) => foods.set(f.id, f));
      const c = NT.recipeCalc(x.recipe, { foods, recipes: S.cat.ctx.recipes });
      return '<div class="var-card"><div class="row"><b class="grow">' + esc(x.recipe.name) + '</b><button class="btn btn-sm" type="button" data-act="air-edit" data-i="' + i + '">Upravit a uložit</button><button class="btn btn-sm btn-primary" type="button" data-act="air-save" data-i="' + i + '">' + ic('save', 'ico-sm') + 'Uložit</button></div>' +
        '<div class="sm num"><b>' + fmt(c.per.kcal) + ' kcal</b> na porci · B ' + fmt(c.per.protein) + ' · T ' + fmt(c.per.fat) + ' · S ' + fmt(c.per.carbs) + ' · ' + x.recipe.servings + ' ' + NT.plural(x.recipe.servings, 'porce', 'porce', 'porcí') + (x.recipe.timeMin ? ' · ' + x.recipe.timeMin + ' min' : '') + '</div>' +
        '<div class="sm muted">' + x.recipe.ingredients.map((ing) => { const f = foods.get(ing.foodId); return esc(f ? f.name : '?') + ' ' + ing.grams + ' g'; }).join(', ') + '</div>' +
        (x.newFoods.length ? '<div class="callout warn" style="padding:6px 10px">' + ic('alert', 'ico-sm') + '<div class="xs">Nové suroviny s odhadem AI (označí se „K ověření“): ' + x.newFoods.map((f) => esc(f.name)).join(', ') + '</div></div>' : '') +
        x.problems.map((p) => '<div class="callout bad" style="padding:6px 10px">' + ic('alert', 'ico-sm') + '<div class="xs">' + esc(p) + '</div></div>').join('') + '</div>';
    }).join('') + '</div>';
  };
  const runRecipeAi = async (m, prompt) => {
    m.busy = true; m.err = ''; App.renderModal();
    const ctl = new AbortController(); App.aiBusy = { ctl };
    try {
      const json = await App.aiCall('json', prompt, { signal: ctl.signal, modelTier: 'default' });
      const list = json && Array.isArray(json.recipes) ? json.recipes : Array.isArray(json) ? json : [];
      m.results = list.slice(0, 4).map((r) => NT.aiRecipeToRecipe(r, S.cat.ctx)).filter((x) => x.recipe.ingredients.length);
    } catch (e) { if (e.code !== 'cancelled') m.err = e.message; }
    m.busy = false; App.aiBusy = null; if (S.modals.indexOf(m) >= 0) App.renderModal();
  };
  const aiBusyRow = (m) => m.busy ? '<div class="row" style="margin:12px 0"><span class="spin"></span><span class="muted">AI pracuje… (může to trvat až půl minuty)</span><button class="btn btn-sm" type="button" data-act="ai-stop">' + ic('stop', 'ico-sm') + 'Zastavit</button></div>' : '';
  const clientSelect = (m) => '<label class="f">Pro klienta (kvůli alergiím a dietě)<select data-ch="air-client"><option value="">Bez konkrétního klienta</option>' + App.clients(false).map((c) => '<option value="' + c.id + '"' + (m.clientId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>';
  App.CH['air-client'] = (t) => { top().clientId = t.value; };
  const clientOf = (m) => (m.clientId ? Store.get('clients', m.clientId) : null);

  App.modals.recAi = (m) => ({
    title: 'Navrhnout recepty pomocí AI', size: 'mid',
    body: '<div class="callout info" style="margin-bottom:12px">' + ic('sparkle') + '<div class="sm">AI navrhne recept ze surovin tvé databáze. Živiny pak spočítá aplikace. Suroviny mimo databázi se přidají s odhadem AI a označí „K ověření“.</div></div>' +
      '<div class="form-grid"><label class="f span-all">Co chceš uvařit?<input type="text" data-in="air-req" data-fid="air-req" id="air-req" value="' + esc(m.request) + '" placeholder="např. vysokobílkovinná snídaně do 10 minut, oběd s luštěninami" data-enter="air-go"></label>' +
      clientSelect(m) + '<label class="f">Cílová energie na porci (kcal, volitelné)<input type="number" min="100" max="1500" step="50" data-in="air-kcal" data-fid="air-kcal" id="air-kcal" value="' + esc(m.kcal) + '"></label>' +
      '<label class="f">Počet receptů<select data-ch="air-count">' + [1, 2, 3].map((n) => '<option value="' + n + '"' + (m.count === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label></div>' +
      (m.busy ? aiBusyRow(m) : '<div class="row" style="margin:12px 0"><button class="btn btn-primary" type="button" data-act="air-go">' + ic('sparkle') + (m.results ? 'Navrhnout znovu' : 'Navrhnout') + '</button></div>') +
      (m.err ? '<div class="callout bad">' + ic('alert') + '<div class="sm">' + esc(m.err) + '</div></div>' : '') + aiRecipeResults(m),
    footer: '<button class="btn" type="button" data-act="modal-close">Zavřít</button>', focus: '#air-req'
  });
  App.A['rec-ai'] = () => App.openModal({ type: 'recAi', request: '', kcal: '', count: 2, clientId: '', results: null, busy: false, err: '' });
  App.IN['air-req'] = (t) => { top().request = t.value; };
  App.IN['air-kcal'] = (t) => { top().kcal = t.value; };
  App.CH['air-count'] = (t) => { top().count = +t.value; };
  App.A['air-go'] = () => {
    const m = top(); if (m.busy) return;
    const client = clientOf(m);
    const prompt = NT.promptRecipes({ brief: client ? NT.clientBrief(client, App.current(client.id)) : 'Bez omezení, obecný zdravý dospělý.', request: m.request.trim(), target: m.kcal ? 'zhruba ' + m.kcal + ' kcal' : '', count: m.count, foodCatalog: NT.catalogText(App.aiCatalog(client)) });
    return runRecipeAi(m, prompt);
  };
  App.modals.recImport = (m) => ({
    title: 'Převést recept z textu', size: 'mid',
    body: '<div class="callout info" style="margin-bottom:12px">' + ic('info') + '<div class="sm">Otevři recept na webu (např. toprecepty.cz), označ a zkopíruj jeho text (suroviny i postup) a vlož ho sem. AI ho převede na recept s vypočtenými živinami. Zkontroluj, jestli suroviny a gramáže sedí, AI je odhaduje u lžic, kusů a hrnků.</div></div>' +
      '<label class="f">Text receptu<textarea rows="9" data-in="rimp-text" data-fid="rimp-text" id="rimp-text" placeholder="Vlož sem celý text receptu…">' + esc(m.text) + '</textarea></label>' +
      (m.busy ? aiBusyRow(m) : '<div class="row" style="margin:12px 0"><button class="btn btn-primary" type="button" data-act="rimp-go"' + (m.text.trim().length > 20 ? '' : ' disabled') + '>' + ic('sparkle') + 'Převést na recept</button><button class="btn" type="button" data-act="rimp-manual"' + (m.text.trim() ? '' : ' disabled') + '>Vložit jen jako postup (ručně)</button></div>') +
      (m.err ? '<div class="callout bad">' + ic('alert') + '<div class="sm">' + esc(m.err) + '</div></div>' : '') + aiRecipeResults(m),
    footer: '<button class="btn" type="button" data-act="modal-close">Zavřít</button>', focus: '#rimp-text'
  });
  App.A['rec-import'] = () => App.openModal({ type: 'recImport', text: '', results: null, busy: false, err: '' });
  App.IN['rimp-text'] = (t) => { const m = top(); m.text = t.value; const ok = t.value.trim().length > 20; const b = $('[data-act="rimp-go"]'); if (b) b.disabled = !ok; const b2 = $('[data-act="rimp-manual"]'); if (b2) b2.disabled = !t.value.trim(); };
  App.A['rimp-go'] = () => { const m = top(); if (m.busy) return; return runRecipeAi(m, NT.promptRecipeImport({ foodCatalog: NT.catalogText(App.aiCatalog(null)), text: m.text })); };
  App.A['rimp-manual'] = () => { const m = top(); const r = blankRecipe(); r.steps = m.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean); App.closeAll(); App.openRecipeEditor(r); };
  App.A['air-save'] = (t) => {
    const m = top(); const x = m.results[+t.dataset.i];
    x.newFoods.forEach((f) => Store.put('foods', f)); Store.put('recipes', x.recipe);
    App.rebuildCatalog(); m.results.splice(+t.dataset.i, 1); App.rerender(); App.renderModal(); App.toast('Recept „' + x.recipe.name + '“ uložen');
  };
  App.A['air-edit'] = (t) => {
    const m = top(); const x = m.results[+t.dataset.i];
    const r = clone(x.recipe); r.id = null; const nf = x.newFoods;
    App.closeAll(); App.openRecipeEditor(r, { asNew: true, newFoods: nf });
  };

  // ---- inspirace z webu
  App.modals.inspire = (m) => ({
    title: 'Inspirace z internetu', size: '',
    body: '<p class="sm" style="margin-bottom:12px">Aplikace sama weby nenačítá (prohlížeč jí to z bezpečnostních důvodů nedovolí), proto je postup dvoukrokový:</p>' +
      '<ol class="sm" style="margin:0 0 14px;padding-left:20px;display:grid;gap:6px"><li>Najdi recept na webu (odkazy níže se otevřou v nové záložce).</li><li>Zkopíruj text receptu (suroviny i postup).</li><li>V Receptech zvol <b>Z textu</b>, vlož ho, a AI ho převede na recept s živinami' + (App.aiAvailable() ? '' : ' (AI teď není dostupná, použij „Vložit jen jako postup“ a suroviny doplň ručně)') + '.</li></ol>' +
      '<label class="f" style="margin-bottom:10px">Co hledáš?<input type="text" id="insp-q" data-in="insp-q" data-fid="insp-q" value="' + esc(m.q) + '" placeholder="např. cuketové placky, ovesná kaše, těstoviny s tuňákem" data-enter="insp-go"></label>' +
      '<div class="row"><a class="btn btn-primary" id="insp-link" href="' + inspUrl(m.q) + '" target="_blank" rel="noopener noreferrer">' + ic('ext') + 'Hledat na toprecepty.cz</a><a class="btn" href="https://www.toprecepty.cz/" target="_blank" rel="noopener noreferrer">Otevřít toprecepty.cz</a></div>' +
      '<p class="muted xs" style="margin-top:12px">Vyhledávání probíhá přes Google s omezením na tento web. Dodržuj autorská práva: pro vlastní potřebu recept přepiš do svého receptu, nekopíruj ho do jídelníčku klienta slovo od slova.</p>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zavřít</button>' + (App.aiAvailable() ? '<button class="btn btn-ai" type="button" data-act="insp-to-import">' + ic('sparkle') + 'Mám text, převést</button>' : ''), focus: '#insp-q'
  });
  const inspUrl = (q) => 'https://www.google.com/search?q=' + encodeURIComponent('site:toprecepty.cz ' + (q || 'zdravé recepty'));
  App.A['rec-inspire'] = () => App.openModal({ type: 'inspire', q: '' });
  App.IN['insp-q'] = (t) => { top().q = t.value; const a = $('#insp-link'); if (a) a.href = inspUrl(t.value); };
  App.A['insp-go'] = () => { const a = $('#insp-link'); if (a) window.open(a.href, '_blank', 'noopener'); };
  App.A['insp-to-import'] = () => { App.closeAll(); App.A['rec-import'](); };

  // ------------------------------------------------------------ šablony
  const tplTotals = (t) => { const tot = NT.zero(); (t.data.meals || []).forEach((m) => (m.items || []).forEach((i) => NT.addTo(tot, NT.itemCalc(i, App.ctx()).n))); return tot; };
  App.views.templates = function () {
    const u = S.ui; const all = S.cat.templates;
    const list = all.filter((t) => !u.tplKind || t.kind === u.tplKind).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    let h = App.pageHead('Šablony', 'Hotová jídla a celé dny, které použiješ opakovaně. Šablonu vytvoříš v editoru jídelníčku tlačítkem „Uložit jako šablonu“.', '');
    h += '<div class="row" style="gap:6px;margin-bottom:12px">' + [['', 'Vše'], ['meal', 'Jídla'], ['day', 'Dny']].map(([k, l]) => '<button class="chip" type="button" data-act="tpl-kind" data-k="' + k + '" aria-pressed="' + ((u.tplKind || '') === k) + '">' + l + '</button>').join('') + '</div>';
    if (!list.length) return h + App.emptyBox('Zatím žádné šablony', 'V editoru jídelníčku ulož oblíbené jídlo nebo celý den jako šablonu.', '');
    h += '<div class="grid g-auto">' + list.map((t) => {
      const tot = tplTotals(t);
      const items = (t.data.meals || []).flatMap((m) => m.items || []);
      return '<div class="card" style="display:flex;flex-direction:column;gap:8px"><div><h3>' + esc(t.name) + '</h3><div class="row" style="gap:4px;margin-top:4px"><span class="badge ' + (t.kind === 'day' ? 'info' : 'accent') + '">' + (t.kind === 'day' ? 'Celý den' : 'Jídlo') + '</span>' + (t.dayType ? '<span class="badge">' + (t.dayType === 'training' ? 'Trénink' : 'Klid') + '</span>' : '') + '</div></div>' +
        (t.note ? '<div class="sm muted">' + esc(t.note) + '</div>' : '') +
        '<div class="sm num"><b>' + fmt(tot.kcal) + ' kcal</b> · B ' + fmt(tot.protein) + ' · T ' + fmt(tot.fat) + ' · S ' + fmt(tot.carbs) + '</div>' +
        '<ul class="xs muted" style="margin:0;padding-left:16px">' + (t.data.meals || []).slice(0, t.kind === 'day' ? 6 : 1).map((m) => '<li><b>' + esc(m.name) + ':</b> ' + (m.items || []).map((i) => esc(NT.itemCalc(i, App.ctx()).name)).join(', ') + '</li>').join('') + '</ul>' +
        '<div class="muted xs">' + items.length + ' ' + NT.plural(items.length, 'položka', 'položky', 'položek') + '</div>' +
        '<div class="row" style="margin-top:auto"><button class="btn btn-sm" type="button" data-act="tpl-edit" data-id="' + t.id + '">' + ic('edit', 'ico-sm') + 'Upravit</button><button class="btn btn-sm btn-ghost btn-danger" type="button" data-act="tpl-del" data-id="' + t.id + '" aria-label="Smazat šablonu">' + ic('trash', 'ico-sm') + '</button></div></div>';
    }).join('') + '</div>';
    return h;
  };
  App.A['tpl-kind'] = (t) => { S.ui.tplKind = t.dataset.k; App.rerender(); };
  App.modals.tplEdit = (m) => ({
    title: 'Upravit šablonu', size: '',
    body: '<div class="form-grid"><label class="f span-all">Název<input type="text" id="te-name" data-fid="te-name" value="' + esc(m.name) + '"></label><label class="f span-all">Poznámka<textarea id="te-note" rows="2">' + esc(m.note) + '</textarea></label></div>',
    footer: '<button class="btn" type="button" data-act="modal-close">Zrušit</button><button class="btn btn-primary" type="button" data-act="tpl-edit-save">Uložit</button>', focus: '#te-name'
  });
  App.A['tpl-edit'] = (t) => { const tpl = S.cat.templates.find((x) => x.id === t.dataset.id); App.openModal({ type: 'tplEdit', id: tpl.id, name: tpl.name, note: tpl.note || '' }); };
  App.A['tpl-edit-save'] = () => {
    const m = top(); const tpl = S.cat.templates.find((x) => x.id === m.id);
    const name = ($('#te-name').value || '').trim(); if (!name) { App.toast('Zadej název', { kind: 'bad' }); return; }
    Store.put('templates', Object.assign(clone(tpl), { name, note: ($('#te-note').value || '').trim() }));
    App.rebuildCatalog(); App.closeModal(m); App.rerender();
  };
  App.A['tpl-del'] = async (t) => {
    const tpl = S.cat.templates.find((x) => x.id === t.dataset.id);
    const ok = await App.confirm({ title: 'Smazat šablonu „' + tpl.name + '“?', text: 'Jídelníčky, které už z ní vznikly, se nezmění.', ok: 'Smazat', danger: true });
    if (!ok) return;
    if (/^tstart/.test(tpl.id)) Store.put('templates', Object.assign(clone(tpl), { hidden: true })); else Store.remove('templates', tpl.id);
    App.rebuildCatalog(); App.rerender(); App.toast('Šablona smazána');
  };
})(typeof window !== 'undefined' ? window : globalThis);
