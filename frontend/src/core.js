/* Jídelníček – výpočetní jádro (čistá logika, bez DOM). Testuje se v Node. */
(function (root) {
  'use strict';
  const NT = (root.NT = root.NT || {});

  // ---------------------------------------------------------------- utils
  NT.uid = function (p) {
    return (p || 'x') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  };
  NT.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  NT.round = function (v, d) {
    const f = Math.pow(10, d || 0);
    return Math.round(v * f) / f;
  };
  NT.fmt = function (n, d) {
    if (n == null || typeof n !== 'number' || !isFinite(n)) return '–';
    d = d || 0;
    let v = NT.round(n, d);
    if (Object.is(v, -0)) v = 0;
    let s = v.toFixed(d).replace('.', ',');
    if (Math.abs(v) >= 10000) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return s;
  };
  NT.norm = function (s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  };
  NT.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
  NT.slug = function (s) {
    return NT.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  };

  // dates are ISO strings YYYY-MM-DD, computed in local time
  NT.isoOf = function (d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  };
  NT.today = () => NT.isoOf(new Date());
  NT.parseISO = function (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  };
  NT.addDays = function (s, n) {
    const d = NT.parseISO(s);
    if (!d) return s;
    d.setDate(d.getDate() + n);
    return NT.isoOf(d);
  };
  NT.daysBetween = function (a, b) {
    const da = NT.parseISO(a), db = NT.parseISO(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  };
  NT.fmtDate = function (s) {
    const d = NT.parseISO(s);
    if (!d) return '';
    return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
  };
  NT.ageOn = function (birth, on) {
    const b = NT.parseISO(birth);
    if (!b) return null;
    const t = NT.parseISO(on || NT.today());
    let age = t.getFullYear() - b.getFullYear();
    const m = t.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
    return age;
  };
  NT.plural = function (n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    if (a > 1 && a < 5) return few;
    return many;
  };

  // ---------------------------------------------------------------- constants
  NT.NK = ['kcal', 'protein', 'fat', 'satFat', 'carbs', 'sugar', 'fiber', 'salt'];
  NT.NLABEL = {
    kcal: 'Energie', protein: 'Bílkoviny', fat: 'Tuky', satFat: 'z toho nasycené',
    carbs: 'Sacharidy', sugar: 'z toho cukry', fiber: 'Vláknina', salt: 'Sůl'
  };
  NT.NUNIT = { kcal: 'kcal', protein: 'g', fat: 'g', satFat: 'g', carbs: 'g', sugar: 'g', fiber: 'g', salt: 'g' };

  NT.ALLERGENS = [
    ['gluten', 'Lepek'], ['crustaceans', 'Korýši'], ['eggs', 'Vejce'], ['fish', 'Ryby'],
    ['peanuts', 'Arašídy'], ['soy', 'Sója'], ['milk', 'Mléko'], ['nuts', 'Ořechy'],
    ['celery', 'Celer'], ['mustard', 'Hořčice'], ['sesame', 'Sezam'], ['sulphites', 'Siřičitany'],
    ['lupin', 'Vlčí bob'], ['molluscs', 'Měkkýši']
  ];
  NT.ALLERGEN_LABEL = Object.fromEntries(NT.ALLERGENS);

  NT.CATS = [
    ['maso', 'Maso'], ['ryby', 'Ryby'], ['vejce', 'Vejce'], ['mlecne', 'Mléčné výrobky'],
    ['pecivo', 'Pečivo'], ['priloha', 'Obiloviny a přílohy'], ['luskoviny', 'Luštěniny'],
    ['zelenina', 'Zelenina'], ['ovoce', 'Ovoce'], ['orechy', 'Ořechy a semena'], ['tuky', 'Tuky a oleje'],
    ['napoje', 'Nápoje'], ['sladkosti', 'Sladkosti a cukr'], ['doplnky', 'Doplňky'], ['ostatni', 'Ostatní']
  ];
  NT.CAT_LABEL = Object.fromEntries(NT.CATS);

  NT.GOALS = [
    ['loss', 'Redukce hmotnosti'], ['maintain', 'Udržení hmotnosti'],
    ['gain', 'Nabírání hmotnosti'], ['performance', 'Sportovní výkon']
  ];
  NT.GOAL_LABEL = Object.fromEntries(NT.GOALS);

  NT.DIETS = [
    ['all', 'Bez omezení'], ['pescetarian', 'Bez masa (ryby ano)'],
    ['vegetarian', 'Vegetariánská'], ['vegan', 'Vegan']
  ];
  NT.DIET_LABEL = Object.fromEntries(NT.DIETS);
  NT.DIET_BLOCK = {
    all: [], pescetarian: ['maso'], vegetarian: ['maso', 'ryby'], vegan: ['maso', 'ryby', 'vejce', 'mlecne']
  };

  NT.PALS = [
    [1.2, 'Sedavé (kancelář, málo chůze)'],
    [1.3, 'Převážně sedavé, běžná chůze'],
    [1.4, 'Stojící nebo pohyblivá práce'],
    [1.5, 'Fyzicky aktivní práce'],
    [1.7, 'Velmi náročná fyzická práce']
  ];
  NT.FORMULAS = [
    ['mifflin', 'Mifflin-St Jeor'],
    ['harris', 'Harris-Benedict (revidovaná)'],
    ['katch', 'Katch-McArdle (potřebuje % tuku)'],
    ['cunningham', 'Cunningham (sportovci, potřebuje % tuku)'],
    ['manual', 'Zadat ručně']
  ];
  NT.SPORTS = [
    ['Chůze (svižná)', 3.8], ['Jogging', 7], ['Běh (rychlejší)', 10], ['Kolo (rekreační)', 6],
    ['Kolo (sportovní)', 8], ['Plavání', 6], ['Silový trénink', 5], ['HIIT / kruhový trénink', 8],
    ['Fotbal, florbal, basket', 7], ['Tenis, squash', 7], ['Lezení', 6.5], ['Jóga, pilates', 3]
  ];
  NT.DAY_TYPES = { rest: 'Odpočinkový den', training: 'Tréninkový den' };
  NT.WEEKDAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
  NT.MEAL_PRESETS = {
    five: [['Snídaně', '07:30'], ['Dopolední svačina', '10:00'], ['Oběd', '12:30'], ['Odpolední svačina', '15:30'], ['Večeře', '18:30']],
    four: [['Snídaně', '07:30'], ['Oběd', '12:30'], ['Svačina', '15:30'], ['Večeře', '18:30']],
    three: [['Snídaně', '07:30'], ['Oběd', '12:30'], ['Večeře', '18:30']]
  };
  NT.MEAL_SHARE = { 'snidane': 0.25, 'obed': 0.3, 'vecere': 0.25 };

  // ---------------------------------------------------------------- client needs
  NT.defaultNeeds = function (goal) {
    const g = goal || 'loss';
    return {
      formula: 'mifflin', manualBmr: null, pal: 1.4,
      trainingKcal: 0, trainingDays: 3,
      goalPct: g === 'loss' ? -15 : g === 'gain' ? 10 : 0,
      proteinPerKg: g === 'performance' || g === 'gain' ? 1.8 : g === 'loss' ? 1.6 : 1.2,
      fatPct: 30, fiberMin: 25, saltMax: 5, satFatMaxPct: 10,
      override: { rest: {}, training: {} }
    };
  };

  NT.bmr = function (formula, p) {
    const w = p.weight, h = p.height, a = p.age;
    const ffm = p.bf != null && p.bf > 0 && p.bf < 70 ? w * (1 - p.bf / 100) : null;
    switch (formula) {
      case 'harris':
        return p.sex === 'm'
          ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * a
          : 447.593 + 9.247 * w + 3.098 * h - 4.33 * a;
      case 'katch': return ffm != null ? 370 + 21.6 * ffm : null;
      case 'cunningham': return ffm != null ? 500 + 22 * ffm : null;
      case 'manual': return p.manual > 0 ? p.manual : null;
      default: return 10 * w + 6.25 * h - 5 * a + (p.sex === 'm' ? 5 : -161);
    }
  };

  function dayTarget(n, tdee, weight, dayKey) {
    const ov = (n.override && n.override[dayKey]) || {};
    const num = (v) => (v === null || v === undefined || v === '' || isNaN(+v) ? null : +v);
    const autoKcal = tdee * (1 + n.goalPct / 100);
    const kcal = num(ov.kcal) != null ? num(ov.kcal) : autoKcal;
    const protein = num(ov.protein) != null ? num(ov.protein) : n.proteinPerKg * weight;
    const fat = num(ov.fat) != null ? num(ov.fat) : (n.fatPct / 100 * kcal) / 9;
    const carbs = num(ov.carbs) != null ? num(ov.carbs) : Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
    return {
      kcal, protein, fat, carbs,
      fiber: Math.max(n.fiberMin, 0),
      salt: n.saltMax,
      satFat: (n.satFatMaxPct / 100 * kcal) / 9,
      tdee, manual: ['kcal', 'protein', 'fat', 'carbs'].filter((k) => num(ov[k]) != null)
    };
  }

  /** st = {weight, bf}; vrací cíle pro odpočinkový a tréninkový den + varování */
  NT.computeNeeds = function (client, st) {
    const n = Object.assign(NT.defaultNeeds(client.goal), client.needs || {});
    n.override = Object.assign({ rest: {}, training: {} }, n.override || {});
    const out = { ok: false, missing: [], warnings: [], needs: n };
    const w = st && st.weight > 0 ? st.weight : null;
    const bf = st && st.bf > 0 ? st.bf : null;
    const age = NT.ageOn(client.birth);
    const h = client.heightCm > 0 ? client.heightCm : null;
    if (!w) out.missing.push('hmotnost');
    if (n.formula !== 'manual') {
      if (!h) out.missing.push('výška');
      if (age == null) out.missing.push('datum narození');
      if (!client.sex) out.missing.push('pohlaví');
    }
    if (out.missing.length) return out;

    let formula = n.formula;
    if ((formula === 'katch' || formula === 'cunningham') && !bf) {
      out.warnings.push({ level: 'warn', text: 'Vzorec ' + formula + ' potřebuje % tělesného tuku. Chybí, proto je použit Mifflin-St Jeor.' });
      formula = 'mifflin';
    }
    const bmr = NT.bmr(formula, { sex: client.sex, weight: w, height: h, age, bf, manual: n.manualBmr });
    if (!(bmr > 0)) { out.missing.push('bazální metabolismus'); return out; }

    const restTdee = bmr * n.pal;
    const trainTdee = restTdee + (n.trainingKcal || 0);
    const rest = dayTarget(n, restTdee, w, 'rest');
    const training = dayTarget(n, trainTdee, w, 'training');

    const tDays = n.trainingKcal > 0 ? NT.clamp(n.trainingDays || 0, 0, 7) : 0;
    const avgTdee = (training.tdee * tDays + rest.tdee * (7 - tDays)) / 7;
    const avgKcal = (training.kcal * tDays + rest.kcal * (7 - tDays)) / 7;
    const weeklyKg = ((avgKcal - avgTdee) * 7) / 7700;

    Object.assign(out, {
      ok: true, weight: w, bf, age, formula, bmr, rest, training, tDays, avgTdee, avgKcal, weeklyKg,
      weeklyPct: (weeklyKg / w) * 100
    });

    const W = (level, text) => out.warnings.push({ level, text });
    if (age != null && age < 18) W('warn', 'Klient je nezletilý. Vzorce pro dospělé nemusí být vhodné a výpočet je třeba posoudit individuálně.');
    const minKcal = client.sex === 'm' ? 1500 : 1200;
    [['rest', rest, 'odpočinkový'], ['training', training, 'tréninkový']].forEach(([k, t, lab]) => {
      if (k === 'training' && !(n.trainingKcal > 0)) return;
      if (t.kcal < 800) W('crit', 'Cílová energie v ' + lab + ' den je pod 800 kcal. To spadá do velmi nízkokalorické diety, která patří pod lékařský dohled.');
      else if (t.kcal < minKcal) W('warn', 'Cílová energie v ' + lab + ' den (' + NT.fmt(t.kcal) + ' kcal) je pod ' + minKcal + ' kcal. U samostatně vedené redukce zvaž pomalejší tempo.');
      if (t.kcal < bmr) W('warn', 'Cílová energie v ' + lab + ' den je nižší než bazální metabolismus (' + NT.fmt(bmr) + ' kcal).');
      const def = (1 - t.kcal / t.tdee) * 100;
      if (def > 25) W('warn', 'Deficit v ' + lab + ' den je ' + NT.fmt(def) + ' % z celkového výdeje. Nad 25 % roste riziko ztráty svalové hmoty a nedostatku živin, zvlášť u sportovců.');
      const fatPctReal = (t.fat * 9 / t.kcal) * 100;
      if (fatPctReal < 20 || t.fat / w < 0.6) W('warn', 'Tuky v ' + lab + ' den jsou nízké (' + NT.fmt(t.fat) + ' g, ' + NT.fmt(fatPctReal) + ' % energie). Zkontroluj příjem esenciálních mastných kyselin a vitaminů rozpustných v tucích.');
      if (t.carbs <= 0) W('warn', 'Po odečtení bílkovin a tuků nezbývá v ' + lab + ' den žádná energie na sacharidy. Uprav bílkoviny, tuky nebo cíl energie.');
      if (client.goal === 'performance' && k === 'training' && t.carbs / w < 3) W('info', 'Sacharidy v tréninkový den jsou pod 3 g/kg (' + NT.fmt(t.carbs / w, 1) + ' g/kg). Pro sportovní výkon se obvykle doporučuje více, orientačně 3–5 g/kg při lehčím až střednějším zatížení.');
    });
    if (n.proteinPerKg > 2.5) W('warn', 'Bílkoviny ' + NT.fmt(n.proteinPerKg, 1) + ' g/kg jsou nad 2,5 g/kg. U zdravého dospělého to zpravidla není třeba, u onemocnění ledvin je to nevhodné.');
    if (n.proteinPerKg < 0.8) W('warn', 'Bílkoviny ' + NT.fmt(n.proteinPerKg, 1) + ' g/kg jsou pod doporučeným minimem pro dospělé (0,8 g/kg).');
    if (client.goal === 'performance' && n.proteinPerKg < 1.4) W('info', 'U sportovců se obvykle volí 1,4–2,0 g/kg bílkovin.');
    if (out.weeklyPct < -1) W('warn', 'Očekávaný úbytek ' + NT.fmt(Math.abs(weeklyKg), 2) + ' kg týdně je přes 1 % hmotnosti. Bezpečnější bývá 0,5–1 % týdně.');
    if (client.goal === 'gain' && out.weeklyPct > 0.5) W('info', 'Očekávaný přírůstek je přes 0,5 % hmotnosti týdně. Rychlejší tempo bývá spojeno s větším podílem tuku.');
    if (client.goal === 'loss' && out.weeklyKg > 0.05) W('info', 'Cíl je redukce, ale nastavená energie vychází na přírůstek. Zkontroluj procento změny energie.');

    if (bf) {
      const ffm = w * (1 - bf / 100);
      const eaTrain = (training.kcal - (n.trainingKcal || 0)) / ffm;
      const eaRest = rest.kcal / ffm;
      out.ea = { ffm, rest: eaRest, training: n.trainingKcal > 0 ? eaTrain : null };
      const worst = n.trainingKcal > 0 ? Math.min(eaTrain, eaRest) : eaRest;
      if (n.trainingKcal > 0 || client.goal === 'performance') {
        if (worst < 30) W('crit', 'Energetická dostupnost vychází pod 30 kcal/kg beztukové hmoty (' + NT.fmt(worst, 1) + '). To je riziková hranice pro RED-S (relativní nedostatek energie ve sportu).');
        else if (worst < 45) W('info', 'Energetická dostupnost je ' + NT.fmt(worst, 1) + ' kcal/kg beztukové hmoty. Pod 45 se doporučuje sledovat, pro dlouhodobý sportovní výkon se uvádí cca 45 a více.');
      }
    } else if (n.trainingKcal > 0 && client.goal !== 'maintain') {
      W('info', 'Bez změřeného % tuku nelze spočítat energetickou dostupnost (kontrola rizika RED-S).');
    }
    return out;
  };

  // ---------------------------------------------------------------- foods
  NT.zero = () => ({ kcal: 0, protein: 0, fat: 0, satFat: 0, carbs: 0, sugar: 0, fiber: 0, salt: 0 });
  NT.addTo = function (acc, n, mult) {
    const m = mult == null ? 1 : mult;
    NT.NK.forEach((k) => { acc[k] += (n[k] || 0) * m; });
    return acc;
  };
  const OPTIONAL = ['satFat', 'sugar', 'fiber', 'salt'];
  NT.nutr = function (food, grams) {
    const f = (grams || 0) / 100;
    const n = {};
    const missing = [];
    NT.NK.forEach((k) => {
      const v = food ? food[k] : null;
      if (v == null || isNaN(v)) {
        n[k] = 0;
        if (OPTIONAL.indexOf(k) >= 0) missing.push(k);
      } else n[k] = v * f;
    });
    return { n, missing };
  };

  /** kontrola záznamu potraviny (na 100 g); vrací pole {level, text} */
  NT.validateFood = function (f) {
    const issues = [];
    const v = (k) => (f[k] == null || isNaN(f[k]) ? null : +f[k]);
    ['kcal', 'protein', 'fat', 'carbs'].forEach((k) => {
      if (v(k) == null) issues.push({ level: 'bad', field: k, text: 'Chybí povinný údaj: ' + NT.NLABEL[k] });
    });
    NT.NK.forEach((k) => { if (v(k) != null && v(k) < 0) issues.push({ level: 'bad', field: k, text: NT.NLABEL[k] + ' je záporné' }); });
    if (v('protein') != null && v('fat') != null && v('carbs') != null) {
      const sum = v('protein') + v('fat') + v('carbs') + (v('fiber') || 0);
      if (sum > 100.5) issues.push({ level: 'bad', field: 'protein', text: 'Součet živin je ' + NT.fmt(sum, 1) + ' g na 100 g, víc než je možné' });
      const exp = 4 * v('protein') + 9 * v('fat') + 4 * v('carbs') + 2 * (v('fiber') || 0);
      const kc = v('kcal');
      const alcohol = f.cat === 'napoje' && kc > exp && /pivo|víno|lihovin|destilát|likér|sekt|whisky|vodka|brandy|vermut|sherry|koňak|slivovic|absint/i.test(f.name || '');
      if (alcohol) issues.push({ level: 'info', field: 'kcal', text: 'Energie zahrnuje alkohol (7 kcal/g), který se mezi živinami neuvádí' });
      else if (kc != null && Math.abs(kc - exp) > 15 && Math.abs(kc - exp) / Math.max(kc, exp, 1) > 0.2) {
        issues.push({ level: 'warn', field: 'kcal', text: 'Energie (' + NT.fmt(kc) + ' kcal) neodpovídá živinám (z nich vychází asi ' + NT.fmt(exp) + ' kcal)' });
      }
    }
    if (v('satFat') != null && v('fat') != null && v('satFat') > v('fat') + 0.05) issues.push({ level: 'bad', field: 'satFat', text: 'Nasycené tuky jsou vyšší než tuky celkem' });
    if (v('sugar') != null && v('carbs') != null && v('sugar') > v('carbs') + 0.5) issues.push({ level: 'warn', field: 'sugar', text: 'Cukry jsou vyšší než sacharidy celkem' });
    if (!f.name || !String(f.name).trim()) issues.push({ level: 'bad', field: 'name', text: 'Chybí název' });
    const miss = OPTIONAL.filter((k) => v(k) == null).map((k) => NT.NLABEL[k].replace('z toho ', ''));
    if (miss.length) issues.push({ level: 'info', field: 'optional', text: 'Chybí údaj: ' + miss.join(', ') });
    return issues;
  };
  NT.foodSeverity = function (issues) {
    if (issues.some((i) => i.level === 'bad')) return 'bad';
    if (issues.some((i) => i.level === 'warn')) return 'warn';
    if (issues.some((i) => i.level === 'info')) return 'info';
    return 'ok';
  };

  NT.makeCtx = function (foods, recipes) {
    const fm = new Map();
    (foods || []).forEach((f) => fm.set(f.id, f));
    const rm = new Map();
    (recipes || []).forEach((r) => rm.set(r.id, r));
    return { foods: fm, recipes: rm };
  };

  NT.householdText = function (food, grams) {
    if (!food || !food.portions || !food.portions.length || !(grams > 0)) return '';
    let best = null;
    food.portions.forEach((p) => {
      if (!(p.g > 0)) return;
      const cnt = grams / p.g;
      const half = Math.round(cnt * 2) / 2;
      if (half <= 0 || half > 12) return;
      const err = Math.abs(cnt - half) / Math.max(half, 0.5);
      if (err <= 0.12 && (!best || err < best.err)) best = { err, half, p };
    });
    if (!best) return '';
    const label = best.p.name.replace(/\s*\(.*?\)\s*$/, '').replace(/^[\d½¼¾.,/\s]+/, '').trim() || best.p.name;
    return '≈ ' + String(best.half).replace('.', ',') + '× ' + label;
  };

  // ---------------------------------------------------------------- recipes
  NT.recipeCalc = function (r, ctx) {
    const total = NT.zero();
    const missing = new Set();
    const allergens = new Set();
    const unknown = [];
    const unverified = [];
    (r.ingredients || []).forEach((ing) => {
      const f = ctx.foods.get(ing.foodId);
      if (!f) { unknown.push(ing); return; }
      const c = NT.nutr(f, ing.grams);
      NT.addTo(total, c.n);
      c.missing.forEach((m) => missing.add(m));
      (f.allergens || []).forEach((a) => allergens.add(a));
      if (f.source === 'ai' && !f.verified) unverified.push(f.name);
    });
    const s = Math.max(1, +r.servings || 1);
    const per = {};
    NT.NK.forEach((k) => { per[k] = total[k] / s; });
    return { total, per, allergens: [...allergens], missing: [...missing], unknown, unverified };
  };

  // ---------------------------------------------------------------- plan items
  NT.itemCalc = function (item, ctx) {
    if (item.type === 'recipe') {
      const r = ctx.recipes.get(item.refId);
      if (!r) return { ok: false, name: '(smazaný recept)', n: NT.zero(), allergens: [], missing: [], kind: 'recipe' };
      const rc = NT.recipeCalc(r, ctx);
      const n = {};
      NT.NK.forEach((k) => { n[k] = rc.per[k] * (item.servings || 0); });
      return { ok: true, name: r.name, n, allergens: rc.allergens, missing: rc.missing, kind: 'recipe', unknown: rc.unknown.length, recipe: r };
    }
    const f = ctx.foods.get(item.refId);
    if (!f) return { ok: false, name: '(smazaná potravina)', n: NT.zero(), allergens: [], missing: [], kind: 'food' };
    const c = NT.nutr(f, item.grams);
    return { ok: true, name: f.name, n: c.n, allergens: f.allergens || [], missing: c.missing, kind: 'food', food: f };
  };

  NT.itemFoods = function (item, ctx) {
    if (item.type === 'recipe') {
      const r = ctx.recipes.get(item.refId);
      if (!r) return [];
      return (r.ingredients || []).map((i) => ctx.foods.get(i.foodId)).filter(Boolean);
    }
    const f = ctx.foods.get(item.refId);
    return f ? [f] : [];
  };

  NT.mealTotals = function (meal, ctx) {
    const total = NT.zero();
    const missing = new Set();
    (meal.items || []).forEach((it) => {
      const c = NT.itemCalc(it, ctx);
      NT.addTo(total, c.n);
      c.missing.forEach((m) => missing.add(m));
    });
    return { total, missing: [...missing] };
  };
  NT.dayTotals = function (day, ctx) {
    const total = NT.zero();
    const missing = new Set();
    const meals = (day.meals || []).map((m) => {
      const t = NT.mealTotals(m, ctx);
      NT.addTo(total, t.total);
      t.missing.forEach((x) => missing.add(x));
      return t;
    });
    return { total, meals, missing: [...missing] };
  };
  NT.planAverage = function (plan, ctx) {
    const days = (plan.days || []).filter((d) => (d.meals || []).some((m) => (m.items || []).length));
    const avg = NT.zero();
    if (!days.length) return { avg, count: 0 };
    days.forEach((d) => NT.addTo(avg, NT.dayTotals(d, ctx).total, 1 / days.length));
    return { avg, count: days.length };
  };

  /** porovnání součtů s cílem; status: ok | warn | bad, dir: in | under | over */
  NT.evaluate = function (total, target) {
    const out = {};
    const rel = (v, t) => (t > 0 ? (v - t) / t : 0);
    [['kcal', 0.05, 0.10], ['protein', 0.10, 0.20], ['fat', 0.10, 0.20], ['carbs', 0.10, 0.20]].forEach(([k, okTol, warnTol]) => {
      const d = rel(total[k], target[k]);
      const a = Math.abs(d);
      out[k] = {
        value: total[k], target: target[k], pct: target[k] > 0 ? (total[k] / target[k]) * 100 : 0,
        status: a <= okTol ? 'ok' : a <= warnTol ? 'warn' : 'bad',
        dir: a <= okTol ? 'in' : d < 0 ? 'under' : 'over'
      };
    });
    const pctOf = (v, t) => (t > 0 ? (v / t) * 100 : 0);
    out.fiber = {
      value: total.fiber, target: target.fiber, pct: pctOf(total.fiber, target.fiber),
      status: total.fiber >= target.fiber ? 'ok' : total.fiber >= target.fiber * 0.8 ? 'warn' : 'bad',
      dir: total.fiber >= target.fiber ? 'in' : 'under'
    };
    ['salt', 'satFat'].forEach((k) => {
      const t = target[k];
      out[k] = {
        value: total[k], target: t, pct: pctOf(total[k], t),
        status: total[k] <= t ? 'ok' : total[k] <= t * 1.2 ? 'warn' : 'bad',
        dir: total[k] <= t ? 'in' : 'over', limit: true
      };
    });
    return out;
  };

  /** podíl energie z makroživin (v %), vláknina se počítá po 2 kcal/g */
  NT.energySplit = function (t) {
    const p = t.protein * 4, f = t.fat * 9, c = t.carbs * 4, fi = (t.fiber || 0) * 2;
    const sum = p + f + c + fi;
    if (sum <= 0) return { protein: 0, fat: 0, carbs: 0, fiber: 0 };
    return { protein: (p / sum) * 100, fat: (f / sum) * 100, carbs: (c / sum) * 100, fiber: (fi / sum) * 100 };
  };

  // ---------------------------------------------------------------- flags (alergeny, nechuti, dieta)
  NT.parseList = (s) => (s || '').split(/[,;\n]+/).map((x) => NT.norm(x.trim())).filter((x) => x.length >= 3);

  NT.itemFlags = function (item, client, ctx) {
    const calc = NT.itemCalc(item, ctx);
    const flags = { allergens: [], dislikes: [], diet: [] };
    if (!calc.ok) return flags;
    const ca = new Set((client && client.allergens) || []);
    calc.allergens.forEach((a) => { if (ca.has(a)) flags.allergens.push(a); });
    const foods = NT.itemFoods(item, ctx);
    const names = [NT.norm(calc.name)].concat(foods.map((f) => NT.norm(f.name)));
    NT.parseList(client && client.dislikes).forEach((tok) => {
      if (names.some((n) => n.indexOf(tok) >= 0)) flags.dislikes.push(tok);
    });
    const block = NT.DIET_BLOCK[(client && client.diet) || 'all'] || [];
    foods.forEach((f) => { if (block.indexOf(f.cat) >= 0 && flags.diet.indexOf(f.cat) < 0) flags.diet.push(f.cat); });
    return flags;
  };
  NT.hasFlags = (fl) => fl.allergens.length + fl.dislikes.length + fl.diet.length > 0;
  NT.flagTexts = function (fl) {
    const t = [];
    fl.allergens.forEach((a) => t.push('Alergen: ' + (NT.ALLERGEN_LABEL[a] || a)));
    fl.dislikes.forEach((d) => t.push('Nechuť: ' + d));
    fl.diet.forEach((c) => t.push('Nevhodné pro zvolenou dietu (' + (NT.CAT_LABEL[c] || c).toLowerCase() + ')'));
    return t;
  };
  NT.planAlerts = function (plan, client, ctx) {
    const out = [];
    (plan.days || []).forEach((d) => (d.meals || []).forEach((m) => (m.items || []).forEach((it) => {
      const fl = NT.itemFlags(it, client, ctx);
      if (NT.hasFlags(fl)) out.push({ day: d.name, meal: m.name, item: NT.itemCalc(it, ctx).name, texts: NT.flagTexts(fl), hard: fl.allergens.length > 0 });
    })));
    return out;
  };

  // ---------------------------------------------------------------- náhrady
  const SWAP_GROUPS = [
    ['pecivo', 'priloha'], ['maso', 'ryby', 'vejce', 'luskoviny'], ['mlecne'], ['zelenina'],
    ['ovoce'], ['tuky', 'orechy'], ['napoje'], ['sladkosti'], ['doplnky'], ['ostatni']
  ];
  NT.swapGroupOf = function (cat) {
    const g = SWAP_GROUPS.find((x) => x.indexOf(cat) >= 0);
    return g || [cat];
  };

  /** náhrady stejné skupiny se stejnou energií (nebo stejným množstvím vybrané živiny) */
  NT.suggestSwaps = function (food, grams, foods, client, opts) {
    opts = opts || {};
    const match = opts.match || 'kcal';
    const limit = opts.limit || 8;
    const grp = NT.swapGroupOf(food.cat);
    const ca = new Set((client && client.allergens) || []);
    const block = NT.DIET_BLOCK[(client && client.diet) || 'all'] || [];
    const dis = NT.parseList(client && client.dislikes);
    const base = NT.nutr(food, grams).n;
    const out = [];
    foods.forEach((c) => {
      if (c.id === food.id || c.hidden || grp.indexOf(c.cat) < 0) return;
      if ((c.allergens || []).some((a) => ca.has(a))) return;
      if (block.indexOf(c.cat) >= 0) return;
      const cn = NT.norm(c.name);
      if (dis.some((t) => cn.indexOf(t) >= 0)) return;
      const cv = c[match];
      if (!(cv >= (match === 'kcal' ? 5 : 1)) || !(food[match] > 0)) return;
      const g = (base[match] / cv) * 100;
      if (!(g >= 3) || g > 1500) return;
      const gr = g < 30 ? Math.round(g) : Math.round(g / 5) * 5;
      const n = NT.nutr(c, gr).n;
      const delta = { kcal: n.kcal - base.kcal, protein: n.protein - base.protein, fat: n.fat - base.fat, carbs: n.carbs - base.carbs };
      const dist = (Math.abs(delta.protein) * 4 + Math.abs(delta.fat) * 9 + Math.abs(delta.carbs) * 4 + Math.abs(delta.kcal)) / Math.max(base.kcal, 20);
      out.push({ food: c, grams: gr, n, delta, score: dist, sameCat: c.cat === food.cat });
    });
    out.sort((a, b) => (a.sameCat === b.sameCat ? a.score - b.score : a.sameCat ? -1 : 1));
    return out.slice(0, limit);
  };

  // ---------------------------------------------------------------- nákupní seznam
  NT.shoppingList = function (plan, ctx, mult) {
    mult = mult > 0 ? mult : 1;
    const map = new Map();
    const add = (f, g) => {
      if (!f || !(g > 0)) return;
      map.set(f.id, (map.get(f.id) || 0) + g * mult);
    };
    (plan.days || []).forEach((d) => (d.meals || []).forEach((m) => (m.items || []).forEach((it) => {
      if (it.type === 'recipe') {
        const r = ctx.recipes.get(it.refId);
        if (!r) return;
        const s = Math.max(1, +r.servings || 1);
        (r.ingredients || []).forEach((ing) => add(ctx.foods.get(ing.foodId), (ing.grams * (it.servings || 0)) / s));
      } else add(ctx.foods.get(it.refId), it.grams);
    })));
    const groups = [];
    NT.CATS.forEach(([cat, label]) => {
      const rows = [];
      map.forEach((g, id) => {
        const f = ctx.foods.get(id);
        if (f.cat !== cat) return;
        const buy = g < 100 ? Math.ceil(g / 5) * 5 : Math.ceil(g / 10) * 10;
        rows.push({ name: f.name, grams: buy, household: NT.householdText(f, buy) });
      });
      rows.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
      if (rows.length) groups.push({ cat, label, rows });
    });
    return groups;
  };

  // ---------------------------------------------------------------- výměnný seznam
  NT.EQ_GROUPS = [
    { id: 'starch', title: 'Pečivo, přílohy a obiloviny', key: 'carbs', amount: 30, basis: '30 g sacharidů', cats: ['pecivo', 'priloha'], min: 20 },
    { id: 'protein', title: 'Maso, ryby a vejce', key: 'protein', amount: 20, basis: '20 g bílkovin', cats: ['maso', 'ryby', 'vejce'], min: 8 },
    { id: 'dairy', title: 'Mléčné výrobky', key: 'protein', amount: 10, basis: '10 g bílkovin', cats: ['mlecne'], min: 3 },
    { id: 'legumes', title: 'Luštěniny a tofu', key: 'protein', amount: 10, basis: '10 g bílkovin', cats: ['luskoviny'], min: 5 },
    { id: 'fruit', title: 'Ovoce', key: 'kcal', amount: 100, basis: '100 kcal', cats: ['ovoce'], min: 20 },
    { id: 'fats', title: 'Tuky, ořechy a semena', key: 'fat', amount: 10, basis: '10 g tuku', cats: ['tuky', 'orechy'], min: 20 }
  ];
  NT.equivalents = function (planFoodIds, foods, client, perGroup) {
    perGroup = perGroup || 10;
    const inPlan = new Set(planFoodIds || []);
    const ca = new Set((client && client.allergens) || []);
    const block = NT.DIET_BLOCK[(client && client.diet) || 'all'] || [];
    const out = [];
    NT.EQ_GROUPS.forEach((g) => {
      const rows = [];
      foods.forEach((f) => {
        if (f.hidden || g.cats.indexOf(f.cat) < 0 || !(f[g.key] >= g.min)) return;
        const mine = inPlan.has(f.id);
        if (!mine) {
          if ((f.allergens || []).some((a) => ca.has(a))) return;
          if (block.indexOf(f.cat) >= 0) return;
        }
        const raw = (g.amount / f[g.key]) * 100;
        const gr = raw < 30 ? Math.round(raw) : Math.round(raw / 5) * 5;
        rows.push({ food: f, grams: gr, household: NT.householdText(f, gr), inPlan: mine });
      });
      rows.sort((a, b) => (a.inPlan === b.inPlan ? a.food.name.localeCompare(b.food.name, 'cs') : a.inPlan ? -1 : 1));
      const planRows = rows.filter((r) => r.inPlan);
      if (planRows.length || rows.length >= 2) out.push({ id: g.id, title: g.title, basis: g.basis, rows: rows.slice(0, Math.max(perGroup, planRows.length)) });
    });
    return out.filter((g) => g.rows.some((r) => r.inPlan));
  };

  // ---------------------------------------------------------------- sledování
  NT.sortedMeasures = (m) => (m || []).filter((x) => x && x.date).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  NT.weightSeries = function (measures) {
    const pts = NT.sortedMeasures(measures).filter((m) => m.weightKg > 0);
    let ema = null, prev = null;
    return pts.map((m) => {
      if (ema == null) ema = m.weightKg;
      else {
        const dt = Math.max(1, NT.daysBetween(prev, m.date));
        const a = 1 - Math.exp(-dt / 7);
        ema = ema + a * (m.weightKg - ema);
      }
      prev = m.date;
      return { date: m.date, weight: m.weightKg, trend: ema };
    });
  };
  NT.ratePerWeek = function (series, windowDays) {
    windowDays = windowDays || 28;
    if (series.length < 3) return null;
    const last = series[series.length - 1].date;
    const pts = series.filter((p) => NT.daysBetween(p.date, last) <= windowDays);
    if (pts.length < 3) return null;
    const t0 = pts[0].date;
    const span = NT.daysBetween(t0, last);
    if (span < 7) return null;
    const xs = pts.map((p) => NT.daysBetween(t0, p.date));
    const ys = pts.map((p) => p.weight);
    const n = pts.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    if (den === 0) return null;
    return (num / den) * 7;
  };
  NT.trackSummary = function (client, track, today) {
    today = today || NT.today();
    const series = NT.weightSeries(track && track.measures);
    const diary = (track && track.diary) || [];
    const out = { series, first: series[0] || null, last: series[series.length - 1] || null, concerns: [] };
    out.change = out.first && out.last ? out.last.weight - out.first.weight : null;
    out.rate = NT.ratePerWeek(series, 28);
    const recent = diary.filter((d) => NT.daysBetween(d.date, today) <= 14 && NT.daysBetween(d.date, today) >= 0);
    const avg = (arr, k) => {
      const v = arr.map((x) => x[k]).filter((x) => typeof x === 'number');
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    out.adherence = avg(recent, 'adherence');
    out.energy = avg(recent, 'energy');
    out.hunger = avg(recent, 'hunger');
    out.sleep = avg(recent, 'sleep');
    out.recentCount = recent.length;
    const C = (level, text) => out.concerns.push({ level, text });
    if (out.last) {
      const age = NT.daysBetween(out.last.date, today);
      if (age > 14) C('info', 'Poslední měření hmotnosti je staré ' + age + ' dní.');
      if (out.rate != null) {
        const pct = (out.rate / out.last.weight) * 100;
        if (pct < -1) C('warn', 'Hmotnost klesá o ' + NT.fmt(Math.abs(out.rate), 2) + ' kg týdně (' + NT.fmt(Math.abs(pct), 1) + ' % hmotnosti). To je rychlejší než bezpečné tempo kolem 1 %.');
        if (client.goal === 'loss' && out.rate > -0.05 && NT.daysBetween(out.first.date, out.last.date) >= 14) C('info', 'Cíl je redukce, ale trend hmotnosti stagnuje nebo roste (' + NT.fmt(out.rate, 2) + ' kg týdně).');
        if (client.goal === 'gain' && pct > 0.5) C('info', 'Hmotnost roste o ' + NT.fmt(pct, 1) + ' % týdně, což je nad obvyklým tempem pro nabírání.');
      }
    } else C('info', 'Zatím není žádné měření hmotnosti.');
    if (out.adherence != null && out.adherence < 60) C('warn', 'Průměrné plnění jídelníčku za 14 dní je ' + NT.fmt(out.adherence) + ' %.');
    if (out.energy != null && out.energy <= 2.2) C('warn', 'Klient hlásí nízkou energii (průměr ' + NT.fmt(out.energy, 1) + ' z 5).');
    if (out.hunger != null && out.hunger >= 4) C('warn', 'Klient hlásí silný hlad (průměr ' + NT.fmt(out.hunger, 1) + ' z 5).');
    if (out.sleep != null && out.sleep <= 2.2) C('info', 'Spánek je hodnocen nízko (průměr ' + NT.fmt(out.sleep, 1) + ' z 5).');
    return out;
  };

  // ---------------------------------------------------------------- plan helpers
  NT.newMeal = (name, time) => ({ id: NT.uid('m'), name, time: time || '', items: [] });
  NT.newDay = function (name, dayType, preset) {
    return { id: NT.uid('d'), name, dayType: dayType || 'rest', meals: (NT.MEAL_PRESETS[preset || 'five'] || NT.MEAL_PRESETS.five).map(([n, t]) => NT.newMeal(n, t)) };
  };
  NT.cloneDay = function (day, newName) {
    const d = JSON.parse(JSON.stringify(day));
    d.id = NT.uid('d');
    if (newName) d.name = newName;
    d.meals.forEach((m) => { m.id = NT.uid('m'); m.items.forEach((i) => { i.id = NT.uid('i'); }); });
    return d;
  };
  NT.cloneMeal = function (meal) {
    const m = JSON.parse(JSON.stringify(meal));
    m.id = NT.uid('m');
    m.items.forEach((i) => { i.id = NT.uid('i'); });
    return m;
  };
  NT.newItem = function (type, refId, amount) {
    return type === 'recipe'
      ? { id: NT.uid('i'), type: 'recipe', refId, servings: amount || 1 }
      : { id: NT.uid('i'), type: 'food', refId, grams: amount || 100 };
  };
  /** rozumné výchozí množství při přidání do jídla */
  NT.defaultGrams = function (food) {
    if (!food) return 100;
    const portions = (food.portions || []).filter((p) => p.g > 0);
    const bulk = ['maso', 'ryby', 'vejce', 'priloha', 'luskoviny', 'zelenina', 'ovoce', 'mlecne'];
    if (bulk.indexOf(food.cat) >= 0) {
      if (/\((suchá|suché|suchý)\)/.test(food.name)) return 70;
      const p = portions.find((x) => x.g >= 50 && x.g <= 300);
      if (p) return p.g;
      if (food.cat === 'mlecne' && portions.length) return portions[0].g;
      return 100;
    }
    if (portions.length) return portions[0].g;
    return food.cat === 'tuky' ? 10 : food.cat === 'orechy' ? 30 : 100;
  };

  NT.porcePl = function (n) {
    const s = String(NT.round(n, 2)).replace('.', ',');
    const a = Math.abs(n);
    if (a === 1) return s + ' porce';
    if (a > 1 && a < 5 && Number.isInteger(a)) return s + ' porce';
    if (!Number.isInteger(a)) return s + ' porce';
    return s + ' porcí';
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- asistované návrhy (deterministické, bez AI) ---- */
(function (root) {
  'use strict';
  const NT = root.NT;

  /** Zaokrouhlí gramáž na „hezkou“ hodnotu. */
  NT.niceGrams = function (g) {
    if (g < 30) return Math.max(1, Math.round(g));
    if (g < 200) return Math.round(g / 5) * 5;
    return Math.round(g / 10) * 10;
  };

  /** Vrátí nové položky vynásobené koeficientem (gramy na hezké hodnoty, porce na půlky). */
  NT.scaleItems = function (items, factor) {
    return items.map((it) => {
      const c = Object.assign({}, it);
      if (it.type === 'recipe') c.servings = NT.clamp(Math.round((it.servings || 1) * factor * 2) / 2, 0.5, 10);
      else c.grams = NT.clamp(NT.niceGrams((it.grams || 0) * factor), 1, 2000);
      return c;
    });
  };

  /**
   * Doladění množství v den/jídle tak, aby energie sedla na cíl.
   * Zachovává poměry; iteruje, protože zaokrouhlování posouvá výsledek.
   */
  NT.fitItemsToKcal = function (items, targetKcal, ctx, fixedKcal) {
    fixedKcal = fixedKcal || 0;
    const kc = (list) => list.reduce((a, it) => a + NT.itemCalc(it, ctx).n.kcal, 0);
    const want = targetKcal - fixedKcal;
    let cur = items.map((i) => Object.assign({}, i));
    const base = kc(cur);
    if (!(base > 0) || !(want > 0)) return { items: cur, kcal: base, changed: false };
    let best = { items: cur, err: Math.abs(base - want) };
    let f = want / base;
    for (let i = 0; i < 6; i++) {
      const trial = NT.scaleItems(items, f);
      const err = Math.abs(kc(trial) - want);
      if (err < best.err) best = { items: trial, err };
      const now = kc(trial);
      if (!(now > 0)) break;
      f = f * (want / now);
    }
    return { items: best.items, kcal: kc(best.items), changed: best.err < Math.abs(base - want) - 0.5 };
  };

  /**
   * Co doplnit: potraviny, které nejlépe zaplní největší schodek živin.
   * remaining = {kcal, protein, fat, carbs}; vrací {food, grams, n, reason}.
   */
  NT.suggestFill = function (remaining, foods, client, opts) {
    opts = opts || {};
    const limit = opts.limit || 8;
    const rem = { kcal: Math.max(0, remaining.kcal), protein: Math.max(0, remaining.protein), fat: Math.max(0, remaining.fat), carbs: Math.max(0, remaining.carbs) };
    const need = [['protein', rem.protein * 4], ['fat', rem.fat * 9], ['carbs', rem.carbs * 4]].sort((a, b) => b[1] - a[1]);
    if (!(rem.kcal > 40) || !(need[0][1] > 40)) return [];
    const key = opts.focus || need[0][0];
    const ca = new Set((client && client.allergens) || []);
    const block = NT.DIET_BLOCK[(client && client.diet) || 'all'] || [];
    const dis = NT.parseList(client && client.dislikes);
    const skipCats = ['doplnky', 'sladkosti', 'napoje'];
    const out = [];
    foods.forEach((f) => {
      if (f.hidden || f.kcal == null || f.protein == null || f.fat == null || f.carbs == null) return;
      if ((f.allergens || []).some((a) => ca.has(a)) || block.indexOf(f.cat) >= 0) return;
      if (skipCats.indexOf(f.cat) >= 0 && !opts.includeAll) return;
      const nm = NT.norm(f.name);
      if (dis.some((t) => nm.indexOf(t) >= 0)) return;
      if (/\((suchá|suché|suchý)\)/.test(f.name) && f.cat === 'priloha' && key !== 'carbs') return;
      if (!(f[key] >= 4)) return;
      // množství, které pokryje cca 70 % schodku vybrané živiny, bez překročení zbývající energie
      const gByNutrient = (rem[key] * 0.7 / f[key]) * 100;
      const gByKcal = f.kcal > 0 ? (rem.kcal * 0.9 / f.kcal) * 100 : gByNutrient;
      let g = Math.min(gByNutrient, gByKcal, 400);
      if (!(g >= 10)) return;
      g = NT.niceGrams(g);
      const n = NT.nutr(f, g).n;
      // pokuta za překročení ostatních makroživin
      const over = ['protein', 'fat', 'carbs'].reduce((a, k) => a + (k === key ? 0 : Math.max(0, n[k] - rem[k]) * (k === 'fat' ? 9 : 4)), 0);
      const fit = n[key] / Math.max(rem[key], 1);
      const score = Math.abs(1 - fit * 1) * 100 + over / Math.max(rem.kcal, 50) * 100 + (opts.favorite && opts.favorite.has(f.id) ? -15 : 0);
      out.push({ food: f, grams: g, n, key, score });
    });
    out.sort((a, b) => a.score - b.score);
    // max 3 z jedné kategorie pro rozmanitost
    const perCat = {};
    const res = [];
    for (const o of out) {
      perCat[o.food.cat] = (perCat[o.food.cat] || 0) + 1;
      if (perCat[o.food.cat] > 3) continue;
      res.push(o);
      if (res.length >= limit) break;
    }
    return res;
  };
})(typeof window !== 'undefined' ? window : globalThis);
