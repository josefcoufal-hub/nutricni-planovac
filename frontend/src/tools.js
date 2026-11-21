/* Jídelníček – import/export, výstup pro klienta, podklady pro AI (čistá logika). */
(function (root) {
  'use strict';
  const NT = (root.NT = root.NT || {});

  // ---------------------------------------------------------------- import tabulek
  NT.parseDelimited = function (text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const cnt = (ch) => first.split(ch).length - 1;
    const counts = { '\t': cnt('\t'), ';': cnt(';'), ',': cnt(',') };
    let delim = ',';
    let best = -1;
    ['\t', ';', ','].forEach((d) => { if (counts[d] > best) { best = counts[d]; delim = d; } });
    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
        } else cell += c;
      } else if (c === '"' && cell === '') inQ = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row); }
    if (!rows.length) return { headers: [], rows: [], delim };
    return { headers: rows[0].map((h) => h.trim()), rows: rows.slice(1), delim };
  };

  NT.toNum = function (v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).trim().replace(/ /g, '').replace(/\s+/g, '');
    if (!s) return null;
    const m = /-?\d+(?:[.,]\d+)?/.exec(s);
    if (!m) return null;
    const n = parseFloat(m[0].replace(',', '.'));
    return isFinite(n) ? n : null;
  };

  NT.IMPORT_FIELDS = [
    ['name', 'Název'], ['kcal', 'Energie (kcal)'], ['kj', 'Energie (kJ)'], ['protein', 'Bílkoviny'],
    ['fat', 'Tuky'], ['satFat', 'Nasycené tuky'], ['carbs', 'Sacharidy'], ['sugar', 'Cukry'],
    ['fiber', 'Vláknina'], ['salt', 'Sůl'], ['sodium', 'Sodík'], ['brand', 'Značka'],
    ['code', 'EAN / kód'], ['cat', 'Kategorie'], ['allergens', 'Alergeny']
  ];
  const SYN = {
    name: ['productname', 'name', 'nazev', 'potravina', 'produkt', 'food', 'nazevpotraviny', 'genericname'],
    kcal: ['energykcal100g', 'energiekcal', 'kcal', 'energykcal', 'energiekcal100g'],
    kj: ['energy100g', 'energiekj', 'kj', 'energykj'],
    protein: ['proteins100g', 'protein', 'proteins', 'bilkoviny', 'bilkovina'],
    fat: ['fat100g', 'fat', 'tuky', 'tuk'],
    satFat: ['saturatedfat100g', 'saturatedfat', 'nasycene', 'nasycenetuky', 'nasycenemastnekyseliny'],
    carbs: ['carbohydrates100g', 'carbohydrates', 'carbs', 'sacharidy'],
    sugar: ['sugars100g', 'sugars', 'sugar', 'cukry'],
    fiber: ['fiber100g', 'fibre100g', 'fiber', 'fibre', 'vlaknina'],
    salt: ['salt100g', 'salt', 'sul'],
    sodium: ['sodium100g', 'sodium', 'sodik'],
    brand: ['brands', 'brand', 'znacka', 'vyrobce'],
    code: ['code', 'ean', 'barcode', 'carovykod'],
    cat: ['kategorie', 'category', 'skupina'],
    allergens: ['allergens', 'alergeny', 'alergen']
  };
  const normHead = (h) => NT.norm(h).replace(/[^a-z0-9]/g, '');
  NT.guessMapping = function (headers) {
    const nh = headers.map(normHead);
    const map = {};
    const used = new Set();
    NT.IMPORT_FIELDS.forEach(([f]) => {
      for (const syn of SYN[f]) {
        const i = nh.indexOf(syn);
        if (i >= 0 && !used.has(i)) { map[f] = i; used.add(i); return; }
      }
    });
    NT.IMPORT_FIELDS.forEach(([f]) => {
      if (map[f] != null) return;
      for (const syn of SYN[f]) {
        if (syn.length < 4) continue;
        const i = nh.findIndex((h, idx) => !used.has(idx) && h.indexOf(syn) === 0);
        if (i >= 0) { map[f] = i; used.add(i); return; }
      }
    });
    return map;
  };

  NT.allergensFromText = function (s) {
    const out = new Set();
    String(s || '').split(/[,;|]+/).forEach((tok) => {
      const t = NT.norm(tok).replace(/^[a-z]{2}:/, '').trim();
      if (!t) return;
      if (/lepek|gluten|psenic|wheat|rye|zito|barley|jecmen|oat\b|ovs/.test(t)) out.add('gluten');
      if (/mlek|milk|laktoz|lactose|dairy|syrovat/.test(t)) out.add('milk');
      if (/vejc|egg/.test(t)) out.add('eggs');
      if (/\bryb|fish/.test(t)) out.add('fish');
      if (/arasid|peanut/.test(t)) out.add('peanuts');
      if (/\bsoj|soy/.test(t)) out.add('soy');
      if (/orech|\bnuts?\b|almond|mandl|hazelnut|walnut|cashew/.test(t) && !/peanut|arasid/.test(t)) out.add('nuts');
      if (/celer|celery/.test(t)) out.add('celery');
      if (/horcic|mustard/.test(t)) out.add('mustard');
      if (/sezam|sesame/.test(t)) out.add('sesame');
      if (/siricit|sulphite|sulfite|sulphur/.test(t)) out.add('sulphites');
      if (/vlci bob|lupin/.test(t)) out.add('lupin');
      if (/korys|crustacean/.test(t)) out.add('crustaceans');
      if (/mekkys|mollus/.test(t)) out.add('molluscs');
    });
    return [...out];
  };
  NT.catFromText = function (s, fallback) {
    const t = NT.norm(s).trim();
    if (!t) return fallback || 'ostatni';
    const hit = NT.CATS.find(([k, l]) => k === t || NT.norm(l) === t);
    return hit ? hit[0] : fallback || 'ostatni';
  };

  /** jeden řádek tabulky na potravinu; vrací {food, issues} */
  NT.rowToFood = function (row, map, opts) {
    opts = opts || {};
    const get = (f) => (map[f] == null || map[f] < 0 ? null : row[map[f]]);
    const num = (f) => NT.toNum(get(f));
    let name = String(get('name') || '').replace(/\s+/g, ' ').trim();
    const brand = String(get('brand') || '').split(',')[0].trim();
    if (name && brand && opts.includeBrand !== false && NT.norm(name).indexOf(NT.norm(brand)) < 0) name += ' (' + brand + ')';
    let kcal = num('kcal');
    const kj = num('kj');
    if (kcal == null && kj != null) kcal = kj / 4.184;
    let salt = num('salt');
    const sod = num('sodium');
    if (salt == null && sod != null) salt = (opts.sodiumUnit === 'mg' ? sod / 1000 : sod) * 2.5;
    const f = {
      id: NT.uid('f'), name, cat: NT.catFromText(get('cat'), opts.cat || 'ostatni'),
      kcal, protein: num('protein'), fat: num('fat'), satFat: num('satFat'), carbs: num('carbs'),
      sugar: num('sugar'), fiber: num('fiber'), salt,
      allergens: NT.allergensFromText(get('allergens')), portions: [],
      source: opts.source || 'import', verified: false, note: '', code: String(get('code') || '').trim() || undefined
    };
    if (f.kcal == null && f.protein != null && f.fat != null && f.carbs != null) f.kcal = NT.round(4 * f.protein + 9 * f.fat + 4 * f.carbs + 2 * (f.fiber || 0), 0);
    ['kcal', 'protein', 'fat', 'satFat', 'carbs', 'sugar', 'fiber', 'salt'].forEach((k) => { if (f[k] != null) f[k] = NT.round(f[k], 2); });
    if (f.code === undefined) delete f.code;
    return { food: f, issues: NT.validateFood(f) };
  };

  NT.foodsToCsv = function (foods) {
    const q = (v) => {
      const s = v == null ? '' : String(v);
      return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const n = (v) => (v == null ? '' : String(v).replace('.', ','));
    const head = ['Název', 'Kategorie', 'Energie (kcal)', 'Bílkoviny (g)', 'Tuky (g)', 'Nasycené (g)', 'Sacharidy (g)', 'Cukry (g)', 'Vláknina (g)', 'Sůl (g)', 'Alergeny', 'Zdroj', 'Ověřeno', 'Poznámka'];
    const lines = [head.join(';')];
    foods.forEach((f) => {
      lines.push([
        q(f.name), q(NT.CAT_LABEL[f.cat] || f.cat), n(f.kcal), n(f.protein), n(f.fat), n(f.satFat), n(f.carbs), n(f.sugar), n(f.fiber), n(f.salt),
        q((f.allergens || []).map((a) => NT.ALLERGEN_LABEL[a] || a).join(', ')), q(f.source), f.verified ? 'ano' : 'ne', q(f.note || '')
      ].join(';'));
    });
    return '﻿' + lines.join('\r\n');
  };

  NT.findFoodByName = function (name, foods) {
    const q = NT.norm(name).trim();
    if (!q) return null;
    // přednost mají ručně vybrané a vlastní potraviny před položkami z NutriDatabáze
    const ndLast = (a, b) => (a.origin === 'nutridb' ? 1 : 0) - (b.origin === 'nutridb' ? 1 : 0);
    const exact = foods.filter((f) => NT.norm(f.name) === q).sort(ndLast)[0];
    if (exact) return exact;
    const toks = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
    if (!toks.length) return null;
    const cands = foods.filter((f) => {
      const n = NT.norm(f.name);
      return toks.every((t) => n.indexOf(t.slice(0, Math.max(3, t.length - 1))) >= 0);
    });
    cands.sort((a, b) => ndLast(a, b) || a.name.length - b.name.length);
    return cands[0] || null;
  };

  // ---------------------------------------------------------------- výstup pro klienta
  const hhClean = (t) => (t ? t.replace('≈', 'cca') : '');

  NT.buildHandout = function (a) {
    const { plan, client, needs, ctx, practice, opts } = a;
    const o = Object.assign({ targets: true, nutrients: true, comment: true, tips: true, shopping: true, equivalents: true, recipes: true, itemKcal: false }, opts || {});
    const m = {
      practice: practice || {}, clientName: client.name || '', planName: plan.name || 'Jídelníček',
      date: NT.fmtDate(a.date || NT.today()), goal: NT.GOAL_LABEL[client.goal] || '', options: o
    };
    m.targets = null;
    if (o.targets && needs && needs.ok) {
      m.targets = [['rest', needs.rest]];
      if (needs.needs.trainingKcal > 0 || (plan.days || []).some((d) => d.dayType === 'training')) m.targets.push(['training', needs.training]);
      m.targets = m.targets.map(([k, t]) => ({
        label: NT.DAY_TYPES[k], kcal: NT.round(t.kcal, -1), protein: NT.round(t.protein), fat: NT.round(t.fat), carbs: NT.round(t.carbs), fiber: NT.round(t.fiber)
      }));
    }
    m.days = (plan.days || []).map((d) => {
      const dt = NT.dayTotals(d, ctx);
      const meals = (d.meals || []).filter((x) => (x.items || []).length).map((meal, mi) => {
        const mealIdx = (d.meals || []).indexOf(meal);
        const mt = dt.meals[mealIdx] ? dt.meals[mealIdx].total : NT.zero();
        return {
          name: meal.name, time: meal.time || '',
          kcal: Math.round(mt.kcal),
          items: meal.items.map((it) => {
            const c = NT.itemCalc(it, ctx);
            let amount;
            if (it.type === 'recipe') amount = NT.porcePl(it.servings || 0);
            else {
              amount = NT.fmt(it.grams) + ' g';
              const hh = hhClean(NT.householdText(c.food, it.grams));
              if (hh) amount += ' (' + hh + ')';
            }
            return { name: c.name, amount, kcal: Math.round(c.n.kcal), recipe: it.type === 'recipe' };
          })
        };
      });
      return {
        name: d.name, dayType: d.dayType, typeLabel: NT.DAY_TYPES[d.dayType] || '', meals,
        totals: o.nutrients ? { kcal: Math.round(dt.total.kcal), protein: Math.round(dt.total.protein), fat: Math.round(dt.total.fat), carbs: Math.round(dt.total.carbs), fiber: Math.round(dt.total.fiber) } : null
      };
    }).filter((d) => d.meals.length);
    m.comment = o.comment ? (plan.comment || '').trim() : '';
    m.tips = o.tips ? (plan.tips || '').trim() : '';
    m.shopping = o.shopping ? NT.shoppingList(plan, ctx).map((g) => ({
      label: g.label, rows: g.rows.map((r) => ({ name: r.name, amount: NT.fmt(r.grams) + ' g' + (r.household ? ' (' + hhClean(r.household) + ')' : '') }))
    })) : null;
    if (o.equivalents) {
      const ids = new Set();
      (plan.days || []).forEach((d) => (d.meals || []).forEach((mm) => (mm.items || []).forEach((it) => {
        if (it.type === 'food') ids.add(it.refId);
        else {
          const r = ctx.recipes.get(it.refId);
          if (r) (r.ingredients || []).forEach((g) => ids.add(g.foodId));
        }
      })));
      const foods = [...ctx.foods.values()];
      m.equivalents = NT.equivalents([...ids], foods, client, 10).map((g) => ({
        title: g.title, basis: g.basis,
        rows: g.rows.map((r) => ({ name: r.food.name, amount: NT.fmt(r.grams) + ' g' + (r.household ? ' (' + hhClean(r.household) + ')' : '') }))
      }));
    } else m.equivalents = null;
    m.recipes = null;
    if (o.recipes) {
      const seen = new Set();
      const list = [];
      (plan.days || []).forEach((d) => (d.meals || []).forEach((mm) => (mm.items || []).forEach((it) => {
        if (it.type !== 'recipe' || seen.has(it.refId)) return;
        seen.add(it.refId);
        const r = ctx.recipes.get(it.refId);
        if (!r) return;
        list.push({
          name: r.name, servings: r.servings || 1, timeMin: r.timeMin || null,
          ingredients: (r.ingredients || []).map((g) => {
            const f = ctx.foods.get(g.foodId);
            const hh = f ? hhClean(NT.householdText(f, g.grams)) : '';
            return (f ? f.name : '(neznámá surovina)') + ': ' + NT.fmt(g.grams) + ' g' + (hh ? ' (' + hh + ')' : '');
          }),
          steps: (r.steps || []).filter(Boolean), notes: (r.notes || '').trim()
        });
      })));
      m.recipes = list.length ? list : null;
    }
    return m;
  };

  NT.handoutToText = function (m, short) {
    const L = [];
    if (m.practice && m.practice.name) L.push(m.practice.name);
    L.push('Jídelníček: ' + m.planName);
    L.push('Pro: ' + m.clientName + ' (' + m.date + ')');
    if (m.goal) L.push('Cíl: ' + m.goal);
    L.push('');
    if (m.targets) {
      L.push('DENNÍ CÍLE');
      m.targets.forEach((t) => L.push(t.label + ': ' + NT.fmt(t.kcal) + ' kcal, bílkoviny ' + t.protein + ' g, tuky ' + t.fat + ' g, sacharidy ' + t.carbs + ' g, vláknina min. ' + t.fiber + ' g'));
      L.push('');
    }
    m.days.forEach((d) => {
      L.push(d.name.toUpperCase() + (d.typeLabel ? ' (' + d.typeLabel.toLowerCase() + ')' : ''));
      d.meals.forEach((meal) => {
        L.push((meal.time ? meal.time + ' ' : '') + meal.name);
        meal.items.forEach((it) => L.push('  - ' + it.name + ': ' + it.amount));
      });
      if (d.totals) L.push('Celkem: ' + NT.fmt(d.totals.kcal) + ' kcal, B ' + d.totals.protein + ' g, T ' + d.totals.fat + ' g, S ' + d.totals.carbs + ' g');
      L.push('');
    });
    if (!short) {
      if (m.comment) { L.push('KOMENTÁŘ'); L.push(m.comment); L.push(''); }
      if (m.tips) { L.push('DOPORUČENÍ'); L.push(m.tips); L.push(''); }
      if (m.shopping && m.shopping.length) {
        L.push('NÁKUPNÍ SEZNAM');
        m.shopping.forEach((g) => { L.push(g.label + ':'); g.rows.forEach((r) => L.push('  - ' + r.name + ': ' + r.amount)); });
        L.push('');
      }
    }
    return L.join('\n').trim();
  };

  /** definice dokumentu pro pdfmake (Roboto z vfs_fonts umí české znaky) */
  NT.handoutToPdf = function (m) {
    const ACC = '#0B6B66', MUTED = '#6B6F76', LINE = '#DADFE3', BAND = '#E6F2F1';
    const c = [];
    const p = m.practice || {};
    if (p.name) c.push({ text: p.name, style: 'brand' });
    const contact = [p.title, p.email, p.phone, p.web].filter(Boolean).join('  ·  ');
    if (contact) c.push({ text: contact, style: 'small', margin: [0, 2, 0, 0] });
    c.push({ text: 'Jídelníček', style: 'title', margin: [0, 18, 0, 2] });
    c.push({ text: m.clientName + '  ·  ' + m.planName, style: 'subtitle' });
    c.push({ text: ['Vytvořeno ' + m.date, m.goal ? 'Cíl: ' + m.goal : ''].filter(Boolean).join('  ·  '), style: 'small', margin: [0, 2, 0, 12] });

    if (m.targets && m.targets.length) {
      c.push({ text: 'Denní cíle', style: 'h2' });
      c.push({
        table: {
          headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [[
            { text: '', style: 'th' }, { text: 'Energie', style: 'th', alignment: 'right' }, { text: 'Bílkoviny', style: 'th', alignment: 'right' },
            { text: 'Tuky', style: 'th', alignment: 'right' }, { text: 'Sacharidy', style: 'th', alignment: 'right' }, { text: 'Vláknina', style: 'th', alignment: 'right' }
          ]].concat(m.targets.map((t) => [
            { text: t.label }, { text: NT.fmt(t.kcal) + ' kcal', alignment: 'right' }, { text: t.protein + ' g', alignment: 'right' },
            { text: t.fat + ' g', alignment: 'right' }, { text: t.carbs + ' g', alignment: 'right' }, { text: 'min. ' + t.fiber + ' g', alignment: 'right' }
          ]))
        },
        layout: 'lightHorizontalLines', margin: [0, 0, 0, 6]
      });
    }

    if (m.comment) {
      c.push({ text: 'Komentář', style: 'h2' });
      c.push({ text: m.comment, margin: [0, 0, 0, 4], lineHeight: 1.25 });
    }

    m.days.forEach((d, di) => {
      const showKcal = m.options && m.options.itemKcal;
      const w = showKcal ? ['*', 'auto', 42] : ['*', 'auto'];
      const span = w.length;
      const pad = (cell) => { const r = [cell]; for (let i = 1; i < span; i++) r.push({}); return r; };
      const body = [];
      d.meals.forEach((meal) => {
        const head = { text: (meal.time ? meal.time + '  ' : '') + meal.name + (showKcal ? '' : ''), style: 'meal', colSpan: span, fillColor: BAND };
        body.push(pad(head));
        meal.items.forEach((it) => {
          const row = [{ text: it.name, bold: !!it.recipe }, { text: it.amount, alignment: 'right', color: '#222' }];
          if (showKcal) row.push({ text: it.kcal + ' kcal', alignment: 'right', style: 'small' });
          body.push(row);
        });
      });
      if (d.totals) {
        body.push(pad({
          text: 'Celkem za den: ' + NT.fmt(d.totals.kcal) + ' kcal  ·  bílkoviny ' + d.totals.protein + ' g  ·  tuky ' + d.totals.fat + ' g  ·  sacharidy ' + d.totals.carbs + ' g  ·  vláknina ' + d.totals.fiber + ' g',
          style: 'totals', colSpan: span
        }));
      }
      const block = [
        { text: d.name + (d.typeLabel ? '  ·  ' + d.typeLabel : ''), style: 'h2', pageBreak: undefined },
        { table: { widths: w, body, dontBreakRows: true }, layout: { hLineColor: () => LINE, vLineWidth: () => 0, hLineWidth: () => 0.5, paddingTop: () => 3, paddingBottom: () => 3 } }
      ];
      if (di === 0) c.push({ stack: block, unbreakable: false, margin: [0, 6, 0, 0] });
      else c.push({ stack: block, margin: [0, 10, 0, 0] });
    });

    if (m.tips) {
      c.push({ text: 'Doporučení', style: 'h2', pageBreak: 'before' });
      c.push({ text: m.tips, lineHeight: 1.3 });
    }
    if (m.shopping && m.shopping.length) {
      c.push({ text: 'Nákupní seznam', style: 'h2', pageBreak: m.tips ? undefined : 'before' });
      m.shopping.forEach((g) => {
        c.push({ text: g.label, style: 'h3' });
        c.push({
          table: { widths: ['*', 'auto'], body: g.rows.map((r) => [{ text: r.name }, { text: r.amount, alignment: 'right' }]) },
          layout: { hLineColor: () => LINE, vLineWidth: () => 0, hLineWidth: () => 0.5, paddingTop: () => 2, paddingBottom: () => 2 }
        });
      });
    }
    if (m.equivalents && m.equivalents.length) {
      c.push({ text: 'Výměnný seznam', style: 'h2', pageBreak: 'before' });
      c.push({ text: 'Množství potravin, které jsou ve své skupině zhruba rovnocenné. Potravinu můžeš vyměnit za jinou ze stejné tabulky.', style: 'small', margin: [0, 0, 0, 6] });
      m.equivalents.forEach((g) => {
        c.push({ text: g.title + '  ·  ' + g.basis, style: 'h3' });
        c.push({
          table: { widths: ['*', 'auto'], body: g.rows.map((r) => [{ text: r.name }, { text: r.amount, alignment: 'right' }]) },
          layout: { hLineColor: () => LINE, vLineWidth: () => 0, hLineWidth: () => 0.5, paddingTop: () => 2, paddingBottom: () => 2 }
        });
      });
    }
    if (m.recipes && m.recipes.length) {
      c.push({ text: 'Recepty', style: 'h2', pageBreak: 'before' });
      m.recipes.forEach((r, i) => {
        const stack = [
          { text: r.name, style: 'h3', margin: [0, i ? 12 : 4, 0, 2] },
          { text: ['Počet porcí: ' + r.servings, r.timeMin ? 'Čas: ' + r.timeMin + ' min' : ''].filter(Boolean).join('  ·  '), style: 'small', margin: [0, 0, 0, 3] },
          { ul: r.ingredients, margin: [0, 0, 0, 3] }
        ];
        if (r.steps.length) stack.push({ ol: r.steps, margin: [0, 0, 0, 3] });
        if (r.notes) stack.push({ text: r.notes, style: 'small' });
        c.push({ stack, unbreakable: true });
      });
    }

    return {
      pageSize: 'A4', pageMargins: [42, 48, 42, 52],
      info: { title: 'Jídelníček – ' + m.clientName, author: (m.practice && m.practice.name) || 'Jídelníček' },
      defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.12 },
      content: c,
      footer: function (cur, count) {
        return { text: (m.practice && m.practice.name ? m.practice.name + '  ·  ' : '') + cur + ' / ' + count, alignment: 'center', fontSize: 8, color: MUTED, margin: [0, 18, 0, 0] };
      },
      styles: {
        brand: { fontSize: 13, bold: true, color: ACC },
        title: { fontSize: 24, bold: true },
        subtitle: { fontSize: 12, color: '#33333D' },
        small: { fontSize: 8.5, color: MUTED },
        h2: { fontSize: 14, bold: true, color: ACC, margin: [0, 10, 0, 5] },
        h3: { fontSize: 11, bold: true, margin: [0, 8, 0, 3] },
        th: { fontSize: 8.5, bold: true, color: MUTED },
        meal: { bold: true, fontSize: 10 },
        totals: { bold: true, fontSize: 9, color: '#33333D' }
      }
    };
  };

  // ---------------------------------------------------------------- podklady pro AI
  NT.clientBrief = function (client, st) {
    const L = [];
    L.push('Cíl: ' + (NT.GOAL_LABEL[client.goal] || 'neuveden'));
    const age = NT.ageOn(client.birth);
    L.push('Pohlaví: ' + (client.sex === 'm' ? 'muž' : client.sex === 'f' ? 'žena' : 'neuvedeno') + (age != null ? ', věk ' + age + ' let' : ''));
    if (client.heightCm) L.push('Výška: ' + client.heightCm + ' cm');
    if (st && st.weight) L.push('Hmotnost: ' + NT.fmt(st.weight, 1) + ' kg' + (st.bf ? ', tělesný tuk ' + NT.fmt(st.bf, 1) + ' %' : ''));
    L.push('Dieta: ' + (NT.DIET_LABEL[client.diet || 'all']));
    if ((client.allergens || []).length) L.push('Alergie (NESMÍ být použity): ' + client.allergens.map((a) => NT.ALLERGEN_LABEL[a] || a).join(', '));
    if (client.dislikes) L.push('Nechutě (vyhnout se): ' + client.dislikes);
    if (client.health) L.push('Zdravotní poznámky: ' + client.health);
    if (client.training) L.push('Pohyb a trénink: ' + client.training);
    return L.join('\n');
  };
  NT.catalogText = function (foods, limit) {
    const r = (v) => (v == null ? '?' : NT.round(v, 1));
    return foods.slice(0, limit || 250).map((f) => [f.id, f.name, NT.CAT_LABEL[f.cat] || f.cat, r(f.kcal), r(f.protein), r(f.fat), r(f.carbs)].join('|')).join('\n');
  };
  NT.recipesCatalogText = function (recipes, ctx, limit) {
    return recipes.slice(0, limit || 40).map((r) => {
      const c = NT.recipeCalc(r, ctx).per;
      return [r.id, r.name, 'na porci', NT.round(c.kcal), NT.round(c.protein, 1), NT.round(c.fat, 1), NT.round(c.carbs, 1)].join('|');
    }).join('\n');
  };

  const FOOD_FORMAT = 'Katalog potravin je ve formátu id|název|kategorie|kcal|bílkoviny g|tuky g|sacharidy g, vše na 100 g jedlého podílu.';

  NT.promptMeal = function (a) {
    return [
      'Jsi asistent nutričního terapeuta. Navrhuješ složení jídla pro klienta. Odpovídej česky.',
      '', 'KLIENT:', a.brief, '',
      'DEN: ' + a.dayLabel + '. Denní cíl: ' + NT.fmt(a.dayTarget.kcal) + ' kcal, bílkoviny ' + NT.fmt(a.dayTarget.protein) + ' g, tuky ' + NT.fmt(a.dayTarget.fat) + ' g, sacharidy ' + NT.fmt(a.dayTarget.carbs) + ' g.',
      'Zbývá doplnit do cíle: ' + NT.fmt(a.remaining.kcal) + ' kcal, bílkoviny ' + NT.fmt(a.remaining.protein) + ' g, tuky ' + NT.fmt(a.remaining.fat) + ' g, sacharidy ' + NT.fmt(a.remaining.carbs) + ' g.',
      'JÍDLO: ' + a.mealName + '. Cíl pro toto jídlo přibližně: ' + NT.fmt(a.mealTarget.kcal) + ' kcal, bílkoviny ' + NT.fmt(a.mealTarget.protein) + ' g.',
      a.existing ? 'Už je v plánu dne: ' + a.existing : '',
      a.note ? 'Přání terapeuta: ' + a.note : '', '',
      'Navrhni ' + a.variants + ' různé varianty tohoto jídla. Používej POUZE potraviny a recepty z katalogů níže (přesná id). Množství uváděj v gramech jedlého podílu u potravin, u receptů v porcích. Respektuj alergie, dietu a nechutě. Neuváděj vlastní výpočet živin, ten spočítá aplikace.',
      FOOD_FORMAT, 'KATALOG POTRAVIN:', a.foodCatalog,
      a.recipeCatalog ? 'KATALOG RECEPTŮ (živiny na 1 porci):\n' + a.recipeCatalog : '',
      '', 'Odpověz pouze JSON ve tvaru:',
      '{"variants":[{"title":"krátký název jídla","why":"jedna věta proč se hodí","items":[{"foodId":"id potraviny","grams":120},{"recipeId":"id receptu","servings":1}]}]}'
    ].filter((x) => x !== '').join('\n');
  };

  NT.promptRecipes = function (a) {
    return [
      'Jsi asistent nutričního terapeuta. Navrhuješ domácí recepty z běžných surovin dostupných v České republice. Odpovídej česky.',
      '', 'KLIENT:', a.brief, '',
      'ZADÁNÍ: ' + (a.request || 'libovolný vhodný recept') + (a.target ? '\nCílové živiny na porci: ' + a.target : ''),
      'Počet receptů: ' + a.count + '.', 'U každého receptu uveď v mealTypes jeden nebo víc druhů jídla z této nabídky: Snídaně, Svačina, Oběd, Večeře, Nápoj, Dezert, Před tréninkem, Po tréninku.', '',
      'Suroviny vybírej přednostně z katalogu níže a uváděj jejich přesné id. Hmotnosti syrových surovin uváděj tak, jak jsou v katalogu (např. maso a rýže syrové, pokud název neříká „vařená“). Pokud surovina v katalogu chybí, uveď její název a odhad živin na 100 g (per100). Neuváděj vlastní součty živin na porci, ty spočítá aplikace. Respektuj alergie, dietu a nechutě.',
      FOOD_FORMAT, 'KATALOG POTRAVIN:', a.foodCatalog, '',
      'Odpověz pouze JSON ve tvaru:',
      '{"recipes":[{"name":"…","servings":1,"timeMin":30,"mealTypes":["Oběd"],"tags":["rychlé"],"ingredients":[{"foodId":"id z katalogu","grams":150},{"name":"surovina mimo katalog","grams":20,"per100":{"kcal":0,"protein":0,"fat":0,"satFat":0,"carbs":0,"sugar":0,"fiber":0,"salt":0}}],"steps":["krok 1","krok 2"],"notes":"volitelná poznámka"}]}'
    ].filter((x) => x !== '').join('\n');
  };

  NT.promptRecipeImport = function (a) {
    return [
      'Převeď text receptu (zkopírovaný z webu nebo z knihy) na strukturovaný recept. Odpovídej česky.',
      'Suroviny přiřaď přednostně k potravinám z katalogu (přesné id). Pokud ingredience v katalogu není, uveď název a odhad živin na 100 g (per100). Množství převeď na gramy jedlého podílu (lžíce, hrnky a kusy odhadni a převeď). Uveď počet porcí podle textu, jinak 4. Neuváděj vlastní součty živin.',
      FOOD_FORMAT, 'KATALOG POTRAVIN:', a.foodCatalog, '', 'TEXT RECEPTU:', String(a.text || '').slice(0, 8000), '',
      'Odpověz pouze JSON ve tvaru:',
      '{"recipes":[{"name":"…","servings":4,"timeMin":30,"mealTypes":[],"tags":[],"ingredients":[{"foodId":"id z katalogu","grams":150},{"name":"surovina mimo katalog","grams":20,"per100":{"kcal":0,"protein":0,"fat":0,"satFat":0,"carbs":0,"sugar":0,"fiber":0,"salt":0}}],"steps":["…"],"notes":""}]}'
    ].join('\n');
  };

  NT.promptFood = function (name) {
    return [
      'Odhadni typické nutriční hodnoty na 100 g pro potravinu: "' + name + '". Sacharidy uváděj bez vlákniny (jako na českých etiketách), sůl v gramech. Pokud je potravina uvedena v syrovém nebo vařeném stavu, drž se toho. Odpovídej česky.',
      'Odpověz pouze JSON ve tvaru:',
      '{"name":"název","cat":"maso|ryby|vejce|mlecne|pecivo|priloha|luskoviny|zelenina|ovoce|orechy|tuky|napoje|sladkosti|doplnky|ostatni","kcal":0,"protein":0,"fat":0,"satFat":0,"carbs":0,"sugar":0,"fiber":0,"salt":0,"allergens":["gluten|crustaceans|eggs|fish|peanuts|soy|milk|nuts|celery|mustard|sesame|sulphites|lupin|molluscs"],"portions":[{"name":"1 ks","g":50}],"note":"krátká poznámka k odhadu"}'
    ].join('\n');
  };

  NT.promptComment = function (a) {
    return [
      'Jsi nutriční terapeut a píšeš krátký úvodní komentář k jídelníčku pro klienta. Piš česky, v druhé osobě (tykání), jasně a laskavě, bez odborného žargonu a bez strašení. 4 až 6 vět. Vysvětli, na čem je jídelníček postavený a jak s ním pracovat (např. výměny potravin, pitný režim, co dělat při odchylce). Nic neslibuj o výsledcích (žádné konkrétní kilogramy). Nevymýšlej zdravotní tvrzení.',
      '', 'KLIENT:', a.brief, '', 'JÍDELNÍČEK: ' + a.planName, a.summary, '',
      'Odpověz pouze samotným textem komentáře, bez nadpisu a bez uvozovek.'
    ].join('\n');
  };

  NT.promptSummary = function (a) {
    return [
      'Jsi asistent nutričního terapeuta. Připrav stručné shrnutí průběhu klienta před kontrolní konzultací. Piš česky, věcně, v odrážkách (použij pomlčky). Rozděl na: Co se daří, Na co si dát pozor, Návrhy otázek na klienta, Možné úpravy plánu (jen jako podnět k úvaze terapeuta, nic neurčuj). Vycházej výhradně z níže uvedených dat a nic si nedomýšlej.',
      '', 'KLIENT:', a.brief, '', 'DATA:', a.data
    ].join('\n');
  };

  // ---------------------------------------------------------------- zpracování odpovědí AI
  const numOr = (v, d) => { const n = NT.toNum(v); return n == null ? d : n; };

  NT.sanitizeAiItems = function (list, ctx) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((x) => {
      if (!x || typeof x !== 'object') return;
      if (x.recipeId && ctx.recipes.has(x.recipeId)) out.push(NT.newItem('recipe', x.recipeId, NT.clamp(NT.round(numOr(x.servings, 1) * 2, 0) / 2 || 1, 0.5, 6)));
      else if (x.foodId && ctx.foods.has(x.foodId)) {
        const g = numOr(x.grams, 0);
        if (g > 0) out.push(NT.newItem('food', x.foodId, NT.clamp(g < 30 ? Math.round(g) : Math.round(g / 5) * 5, 1, 1500)));
      }
    });
    return out;
  };
  NT.sanitizeVariants = function (json, ctx) {
    const list = json && Array.isArray(json.variants) ? json.variants : Array.isArray(json) ? json : [];
    return list.map((v) => ({
      title: String((v && v.title) || 'Návrh').slice(0, 120), why: String((v && v.why) || '').slice(0, 300),
      items: NT.sanitizeAiItems(v && v.items, ctx)
    })).filter((v) => v.items.length);
  };

  NT.parseAiFood = function (o) {
    if (!o || typeof o !== 'object') return null;
    const n = (k) => { const v = NT.toNum(o[k]); return v == null || v < 0 ? null : NT.round(v, 2); };
    const cat = NT.CAT_LABEL[o.cat] ? o.cat : 'ostatni';
    const f = {
      id: NT.uid('f'), name: String(o.name || '').trim().slice(0, 120), cat, kcal: n('kcal'), protein: n('protein'), fat: n('fat'), satFat: n('satFat'),
      carbs: n('carbs'), sugar: n('sugar'), fiber: n('fiber'), salt: n('salt'),
      allergens: (Array.isArray(o.allergens) ? o.allergens : []).filter((a) => NT.ALLERGEN_LABEL[a]),
      portions: (Array.isArray(o.portions) ? o.portions : []).map((p) => ({ name: String(p.name || '').slice(0, 60), g: NT.toNum(p.g) })).filter((p) => p.name && p.g > 0).slice(0, 4),
      source: 'ai', verified: false, note: String(o.note || '').slice(0, 300)
    };
    if (f.kcal == null && f.protein != null && f.fat != null && f.carbs != null) f.kcal = NT.round(4 * f.protein + 9 * f.fat + 4 * f.carbs + 2 * (f.fiber || 0), 0);
    return f;
  };

  /** AI recept -> recept aplikace + nové potraviny (odhad AI) + seznam problémů */
  NT.aiRecipeToRecipe = function (r, ctx) {
    const foods = [...ctx.foods.values()];
    const problems = [];
    const newFoods = [];
    const ingredients = [];
    (Array.isArray(r.ingredients) ? r.ingredients : []).forEach((ing) => {
      const grams = numOr(ing && ing.grams, 0);
      if (!(grams > 0)) return;
      let f = ing.foodId ? ctx.foods.get(ing.foodId) : null;
      if (!f && ing.name) f = NT.findFoodByName(ing.name, foods.concat(newFoods));
      if (!f && ing.name && ing.per100 && typeof ing.per100 === 'object') {
        const pf = NT.parseAiFood(Object.assign({ name: ing.name, cat: 'ostatni', note: 'Odhad AI při tvorbě receptu, ověř.' }, ing.per100));
        if (pf && pf.kcal != null && pf.protein != null && pf.fat != null && pf.carbs != null) { pf.name = String(ing.name).trim().slice(0, 120); newFoods.push(pf); f = pf; }
      }
      if (!f) { problems.push('Surovina „' + (ing && (ing.name || ing.foodId) || '?') + '“ nemá údaje o živinách a byla vynechána.'); return; }
      ingredients.push({ foodId: f.id, grams: NT.clamp(Math.round(grams), 1, 3000) });
    });
    const recipe = {
      id: NT.uid('r'), name: String(r.name || 'Nový recept').slice(0, 120), servings: NT.clamp(Math.round(numOr(r.servings, 1)), 1, 20),
      timeMin: numOr(r.timeMin, null), mealTypes: NT.normMealTypes((Array.isArray(r.mealTypes) ? r.mealTypes : []).map(String)), tags: (Array.isArray(r.tags) ? r.tags : []).map(String).slice(0, 8),
      ingredients, steps: (Array.isArray(r.steps) ? r.steps : []).map((s) => String(s).replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean),
      notes: String(r.notes || '').slice(0, 600), source: 'AI', aiGenerated: true
    };
    return { recipe, newFoods, problems };
  };
})(typeof window !== 'undefined' ? window : globalThis);
