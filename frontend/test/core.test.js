const assert = require('assert');
require('../src/core.js');
require('../src/nutridb.js');
require('../src/data.js');
require('../src/planner.js');
require('../src/tools.js');
const NT = globalThis.NT;
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' očekáváno ' + b + ' ± ' + tol + ', je ' + a);

console.log('Výpočty potřeb');
t('Mifflin-St Jeor muž 80 kg, 180 cm, 30 let = 1780', () => near(NT.bmr('mifflin', { sex: 'm', weight: 80, height: 180, age: 30 }), 1780, 0.01));
t('Mifflin-St Jeor žena 65 kg, 165 cm, 30 let = 1370,25', () => near(NT.bmr('mifflin', { sex: 'f', weight: 65, height: 165, age: 30 }), 1370.25, 0.01));
t('Harris-Benedict muž', () => near(NT.bmr('harris', { sex: 'm', weight: 80, height: 180, age: 30 }), 88.362 + 13.397 * 80 + 4.799 * 180 - 5.677 * 30, 0.001));
t('Katch-McArdle: 80 kg, 20 % tuku = 370 + 21,6 × 64', () => near(NT.bmr('katch', { weight: 80, bf: 20 }), 370 + 21.6 * 64, 0.001));
t('Cunningham: 500 + 22 × FFM', () => near(NT.bmr('cunningham', { weight: 80, bf: 20 }), 500 + 22 * 64, 0.001));
t('Katch bez % tuku vrací null', () => assert.strictEqual(NT.bmr('katch', { weight: 80 }), null));

const man = { name: 'Test', sex: 'm', birth: '1990-01-01', heightCm: 180, goal: 'loss' };
t('computeNeeds: chybějící údaje se hlásí', () => {
  const r = NT.computeNeeds({ goal: 'loss' }, { weight: 80 });
  assert.strictEqual(r.ok, false);
  assert.ok(r.missing.includes('výška') && r.missing.includes('datum narození') && r.missing.includes('pohlaví'));
});
t('computeNeeds: redukce, cíl = TDEE × 0,85, makra sedí na kcal', () => {
  const c = Object.assign({}, man, { needs: { pal: 1.4, goalPct: -15, trainingKcal: 0, proteinPerKg: 1.8, fatPct: 30 } });
  const r = NT.computeNeeds(c, { weight: 80 });
  assert.ok(r.ok);
  near(r.rest.tdee, r.bmr * 1.4, 0.01);
  near(r.rest.kcal, r.rest.tdee * 0.85, 0.01);
  near(r.rest.protein, 144, 0.01);
  near(r.rest.protein * 4 + r.rest.fat * 9 + r.rest.carbs * 4, r.rest.kcal, 0.5, 'makra');
  near(r.rest.fat * 9 / r.rest.kcal, 0.3, 0.001);
});
t('computeNeeds: tréninkový den přičítá výdej a týdenní bilance je správná', () => {
  const c = Object.assign({}, man, { goal: 'performance', needs: { pal: 1.4, goalPct: 0, trainingKcal: 500, trainingDays: 4 } });
  const r = NT.computeNeeds(c, { weight: 80 });
  near(r.training.tdee - r.rest.tdee, 500, 0.001);
  near(r.avgTdee, (r.training.tdee * 4 + r.rest.tdee * 3) / 7, 0.001);
  near(r.weeklyKg, 0, 0.001);
});
t('computeNeeds: týdenní úbytek při -15 % sedí s 7700 kcal/kg', () => {
  const c = Object.assign({}, man, { needs: { pal: 1.4, goalPct: -15, trainingKcal: 0 } });
  const r = NT.computeNeeds(c, { weight: 80 });
  near(r.weeklyKg, (r.rest.kcal - r.rest.tdee) * 7 / 7700, 0.0001);
  assert.ok(r.weeklyKg < 0);
});
t('computeNeeds: ruční přepsání kcal přepočítá sacharidy', () => {
  const c = Object.assign({}, man, { needs: { pal: 1.4, goalPct: -15, proteinPerKg: 2, fatPct: 30, override: { rest: { kcal: 2000 }, training: {} } } });
  const r = NT.computeNeeds(c, { weight: 80 });
  near(r.rest.kcal, 2000, 0.001);
  near(r.rest.protein * 4 + r.rest.fat * 9 + r.rest.carbs * 4, 2000, 0.5);
  assert.deepStrictEqual(r.rest.manual, ['kcal']);
});
t('computeNeeds: Katch bez % tuku spadne na Mifflin s varováním', () => {
  const c = Object.assign({}, man, { needs: { formula: 'katch' } });
  const r = NT.computeNeeds(c, { weight: 80 });
  assert.strictEqual(r.formula, 'mifflin');
  assert.ok(r.warnings.some((w) => /tělesného tuku/.test(w.text)));
});
t('computeNeeds: manuální BMR', () => {
  const c = { goal: 'maintain', needs: { formula: 'manual', manualBmr: 1700, pal: 1.5 } };
  const r = NT.computeNeeds(c, { weight: 70 });
  assert.ok(r.ok);
  near(r.rest.tdee, 2550, 0.01);
});
t('varování: velmi nízká energie', () => {
  const c = Object.assign({}, man, { sex: 'f', heightCm: 160, needs: { pal: 1.2, goalPct: -45 } });
  const r = NT.computeNeeds(c, { weight: 55 });
  assert.ok(r.warnings.some((w) => /pod 1200|pod 800|bazální/.test(w.text)));
  assert.ok(r.warnings.some((w) => /Deficit/.test(w.text)));
});
t('varování: energetická dostupnost RED-S', () => {
  const c = Object.assign({}, man, { goal: 'performance', needs: { pal: 1.3, goalPct: -25, trainingKcal: 800, trainingDays: 5 } });
  const r = NT.computeNeeds(c, { weight: 65, bf: 12 });
  assert.ok(r.ea && r.ea.ffm > 0);
  assert.ok(r.warnings.some((w) => /RED-S|Energetická dostupnost/.test(w.text)), JSON.stringify(r.warnings));
});
t('varování: rychlý týdenní úbytek > 1 %', () => {
  const c = Object.assign({}, man, { needs: { pal: 1.7, goalPct: -35 } });
  const r = NT.computeNeeds(c, { weight: 70 });
  assert.ok(r.warnings.some((w) => /týdně je přes 1 %/.test(w.text)), JSON.stringify(r.warnings.map((w) => w.text)));
});
t('věk z data narození', () => {
  assert.strictEqual(NT.ageOn('1990-06-15', '2026-06-14'), 35);
  assert.strictEqual(NT.ageOn('1990-06-15', '2026-06-15'), 36);
});

console.log('Databáze a potraviny');
t('základní databáze: unikátní id a platná data', () => {
  const ids = new Set();
  NT.BASE_FOODS.forEach((f) => {
    assert.ok(!ids.has(f.id), 'duplicitní id ' + f.id); ids.add(f.id);
    assert.ok(NT.CAT_LABEL[f.cat], 'kategorie ' + f.cat + ' u ' + f.name);
    f.allergens.forEach((a) => assert.ok(NT.ALLERGEN_LABEL[a], 'alergen ' + a));
  });
  assert.ok(NT.BASE_FOODS.length >= 90);
});
t('základní databáze: žádná ručně vybraná potravina nemá chybu validace (součty, kcal)', () => {
  const bad = [];
  NT.BASE_FOODS.filter((f) => f.origin === 'curated').forEach((f) => {
    const sev = NT.validateFood(f).filter((i) => i.level === 'bad' || i.level === 'warn');
    if (sev.length) bad.push(f.name + ': ' + sev.map((s) => s.text).join('; '));
  });
  assert.deepStrictEqual(bad, []);
});
t('NutriDatabáze: 1136 položek, žádná s chybou, nejvýš 2 s varováním o energii (alkohol se nehlásí)', () => {
  const nd = NT.BASE_FOODS.filter((f) => f.origin === 'nutridb');
  assert.strictEqual(nd.length, 1136);
  const bad = nd.filter((f) => NT.validateFood(f).some((i) => i.level === 'bad'));
  assert.deepStrictEqual(bad.map((f) => f.name), []);
  const warn = nd.filter((f) => NT.validateFood(f).some((i) => i.level === 'warn'));
  assert.ok(warn.length <= 2, 'varování: ' + warn.map((f) => f.name).join(' | '));
  const wine = nd.find((f) => f.name === 'Víno bílé');
  assert.ok(NT.validateFood(wine).every((i) => i.level !== 'warn'));
});
t('NutriDatabáze: kategorie platné, alergeny z názvu (mléko → mléko, pšeničná mouka → lepek, bezvaječné ≠ vejce)', () => {
  const nd = NT.BASE_FOODS.filter((f) => f.origin === 'nutridb');
  nd.forEach((f) => { assert.ok(NT.CAT_LABEL[f.cat], f.name + ' ' + f.cat); f.allergens.forEach((a) => assert.ok(NT.ALLERGEN_LABEL[a], a)); assert.ok(f.id.indexOf('b_nd') === 0); });
  assert.ok(nd.some((f) => /mléko/i.test(f.name) && f.allergens.indexOf('milk') >= 0));
  assert.ok(nd.filter((f) => /nevaječ|bezvaječ/i.test(f.name)).every((f) => f.allergens.indexOf('eggs') < 0));
  assert.ok(nd.filter((f) => /bezlepk/i.test(f.name)).every((f) => f.allergens.indexOf('gluten') < 0));
});
t('nápoje: základní nápoje jsou v databázi (voda, čaj, káva, džus, mléčné i rostlinné nápoje)', () => {
  ['voda', 'mineralka', 'caj_cerny', 'caj_zeleny', 'kava_cerna', 'dzus_jablecny', 'napoj_sojovy', 'napoj_ovesny', 'mandlovy_napoj', 'kefir'].forEach((k) => assert.ok(NT.BASE_FOODS.find((f) => f.id === NT.baseId(k)), k));
  assert.ok(NT.BASE_FOODS.filter((f) => f.origin === 'curated' && f.cat === 'napoje').length >= 15);
  assert.strictEqual(NT.BASE_FOODS.find((f) => f.id === NT.baseId('voda')).kcal, 0);
});
t('isCommonFood: NutriDatabáze se do návrhů nepouští, ručně vybrané ano', () => {
  const common = NT.BASE_FOODS.filter(NT.isCommonFood);
  assert.ok(common.length > 100 && common.length < 160, 'počet ' + common.length);
  assert.ok(common.every((f) => f.origin !== 'nutridb'));
});
t('nutr: přepočet na gramy', () => {
  const f = NT.BASE_FOODS.find((x) => x.name.startsWith('Kuřecí prsa'));
  const c = NT.nutr(f, 200);
  near(c.n.protein, 46, 0.001); near(c.n.kcal, 220, 0.001);
});
t('nutr: chybějící volitelný údaj se hlásí, počítá se jako 0', () => {
  const c = NT.nutr({ kcal: 100, protein: 10, fat: 1, carbs: 5, fiber: null, salt: 0.1 }, 100);
  assert.ok(c.missing.includes('fiber') && c.missing.includes('sugar') && c.missing.includes('satFat'));
  assert.strictEqual(c.n.fiber, 0);
});
t('validateFood: chyba součtu a záporné hodnoty', () => {
  assert.strictEqual(NT.foodSeverity(NT.validateFood({ name: 'x', kcal: 100, protein: 60, fat: 30, carbs: 30 })), 'bad');
  assert.strictEqual(NT.foodSeverity(NT.validateFood({ name: 'x', kcal: 100, protein: 5, fat: -1, carbs: 10 })), 'bad');
  assert.strictEqual(NT.foodSeverity(NT.validateFood({ name: 'x', kcal: 800, protein: 5, fat: 1, carbs: 10 })), 'warn');
  assert.strictEqual(NT.foodSeverity(NT.validateFood({ name: 'x', kcal: 100, protein: 5, fat: 1, carbs: 10, satFat: 2 })), 'bad');
  assert.strictEqual(NT.foodSeverity(NT.validateFood({ name: '', kcal: 100, protein: 5, fat: 1, carbs: 10 })), 'bad');
});
t('householdText: odpovídající počet kusů', () => {
  const egg = NT.BASE_FOODS.find((f) => f.name === 'Vejce slepičí (celé)');
  assert.strictEqual(NT.householdText(egg, 100), '≈ 2× vejce');
  assert.strictEqual(NT.householdText(egg, 120), '≈ 2,5× vejce');
  assert.strictEqual(NT.householdText(egg, 62), '');
  const bread = NT.BASE_FOODS.find((f) => f.name.startsWith('Chléb žitný'));
  assert.strictEqual(NT.householdText(bread, 80), '≈ 2× krajíc');
  const av = NT.BASE_FOODS.find((f) => f.name === 'Avokádo');
  assert.strictEqual(NT.householdText(av, 140), '≈ 1× avokádo');
});

console.log('Recepty, jídla, dny');
const ctx = NT.makeCtx(NT.BASE_FOODS, NT.STARTER_RECIPES);
t('recept: živiny na porci = součet / porce', () => {
  const r = { servings: 2, ingredients: [{ foodId: NT.baseId('kureci_prsa'), grams: 300 }, { foodId: NT.baseId('ryze_bila_suha'), grams: 100 }] };
  const c = NT.recipeCalc(r, ctx);
  near(c.total.kcal, 330 + 350, 0.01); near(c.per.kcal, 340, 0.01);
  near(c.per.protein, (69 + 7) / 2, 0.01);
});
t('recept: neznámá surovina je ohlášena a nerozbije výpočet', () => {
  const c = NT.recipeCalc({ servings: 1, ingredients: [{ foodId: 'nic', grams: 100 }, { foodId: NT.baseId('jablko'), grams: 100 }] }, ctx);
  assert.strictEqual(c.unknown.length, 1); near(c.total.kcal, 52, 0.01);
});
t('ukázkové recepty mají smysluplné živiny (80–900 kcal / porci) a štítek jídla', () => {
  NT.STARTER_RECIPES.forEach((r) => {
    const c = NT.recipeCalc(r, ctx);
    assert.strictEqual(c.unknown.length, 0, r.name);
    assert.ok(c.per.kcal > 80 && c.per.kcal < 900, r.name + ' ' + c.per.kcal);
    assert.ok((r.mealTypes || []).length >= 1, r.name + ' bez štítku');
    assert.deepStrictEqual(NT.normMealTypes(r.mealTypes), r.mealTypes, r.name + ' neznámý štítek');
  });
  assert.ok(NT.STARTER_RECIPES.length >= 48);
  assert.ok(NT.STARTER_RECIPES.filter((r) => r.mealTypes.indexOf('Nápoj') >= 0).length >= 5);
  ['Snídaně', 'Svačina', 'Oběd', 'Večeře', 'Nápoj'].forEach((l) => assert.ok(NT.STARTER_RECIPES.filter((r) => r.mealTypes.indexOf(l) >= 0).length >= 5, l));
});
t('recepty: více štítků na jeden recept a normalizace', () => {
  assert.deepStrictEqual(NT.normMealTypes('snídaně, Obed; svačina, Snídaně, vlastní'), ['Snídaně', 'Oběd', 'Svačina', 'Vlastní']);
  assert.deepStrictEqual(NT.normMealTypes(['dopolední svačina', 'před tréninkem']), ['Svačina', 'Před tréninkem']);
  assert.strictEqual(NT.STARTER_RECIPES.filter((r) => r.mealTypes.length > 1).length > 10, true);
});
t('itemCalc: položka-recept × porce, položka-potravina × gramy', () => {
  const a = NT.itemCalc({ type: 'recipe', refId: 'rstart03', servings: 2 }, ctx);
  const one = NT.recipeCalc(NT.STARTER_RECIPES[2], ctx).per.kcal;
  near(a.n.kcal, one * 2, 0.01);
  const b = NT.itemCalc({ type: 'food', refId: NT.baseId('banan'), grams: 120 }, ctx);
  near(b.n.kcal, 106.8, 0.01);
  assert.strictEqual(NT.itemCalc({ type: 'food', refId: 'zmizel', grams: 10 }, ctx).ok, false);
});
t('dayTotals a planAverage', () => {
  const d1 = NT.newDay('Den 1', 'rest', 'three');
  d1.meals[0].items.push(NT.newItem('food', NT.baseId('banan'), 100));
  d1.meals[1].items.push(NT.newItem('food', NT.baseId('banan'), 100));
  const d2 = NT.newDay('Den 2', 'rest', 'three');
  d2.meals[0].items.push(NT.newItem('food', NT.baseId('banan'), 100));
  const d3 = NT.newDay('Prázdný', 'rest', 'three');
  const tot = NT.dayTotals(d1, ctx);
  near(tot.total.kcal, 178, 0.01);
  const avg = NT.planAverage({ days: [d1, d2, d3] }, ctx);
  assert.strictEqual(avg.count, 2); near(avg.avg.kcal, (178 + 89) / 2, 0.01);
});
t('evaluate: stavy v toleranci a limity', () => {
  const tg = { kcal: 2000, protein: 120, fat: 70, carbs: 230, fiber: 25, salt: 5, satFat: 22 };
  const ok = NT.evaluate({ kcal: 2050, protein: 118, fat: 72, carbs: 235, fiber: 26, salt: 4, satFat: 20 }, tg);
  ['kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt', 'satFat'].forEach((k) => assert.strictEqual(ok[k].status, 'ok', k));
  const bad = NT.evaluate({ kcal: 1500, protein: 60, fat: 70, carbs: 230, fiber: 10, salt: 9, satFat: 40 }, tg);
  assert.strictEqual(bad.kcal.status, 'bad'); assert.strictEqual(bad.kcal.dir, 'under');
  assert.strictEqual(bad.fiber.status, 'bad'); assert.strictEqual(bad.salt.status, 'bad'); assert.strictEqual(bad.salt.dir, 'over');
  const warn = NT.evaluate({ kcal: 2160, protein: 120, fat: 70, carbs: 230, fiber: 21, salt: 5.5, satFat: 22 }, tg);
  assert.strictEqual(warn.kcal.status, 'warn'); assert.strictEqual(warn.kcal.dir, 'over');
  assert.strictEqual(warn.fiber.status, 'warn'); assert.strictEqual(warn.salt.status, 'warn');
});
t('energySplit: součet 100 %', () => {
  const s = NT.energySplit({ protein: 100, fat: 70, carbs: 250, fiber: 30 });
  near(s.protein + s.fat + s.carbs + s.fiber, 100, 0.0001);
  assert.deepStrictEqual(NT.energySplit(NT.zero()), { protein: 0, fat: 0, carbs: 0, fiber: 0 });
});

console.log('Alergeny, dieta, nechutě');
t('alergen u klienta se označí (potravina i recept)', () => {
  const cl = { allergens: ['milk', 'fish'], diet: 'all', dislikes: '' };
  assert.deepStrictEqual(NT.itemFlags({ type: 'food', refId: NT.baseId('skyr'), grams: 100 }, cl, ctx).allergens, ['milk']);
  assert.deepStrictEqual(NT.itemFlags({ type: 'recipe', refId: 'rstart04', servings: 1 }, cl, ctx).allergens, ['fish']);
  assert.strictEqual(NT.hasFlags(NT.itemFlags({ type: 'food', refId: NT.baseId('banan'), grams: 100 }, cl, ctx)), false);
});
t('dieta: vegetariánská blokuje maso i ryby, vegan i mléčné', () => {
  const v = { diet: 'vegetarian' };
  assert.deepStrictEqual(NT.itemFlags({ type: 'food', refId: NT.baseId('kureci_prsa'), grams: 100 }, v, ctx).diet, ['maso']);
  assert.deepStrictEqual(NT.itemFlags({ type: 'food', refId: NT.baseId('losos'), grams: 100 }, v, ctx).diet, ['ryby']);
  assert.strictEqual(NT.itemFlags({ type: 'food', refId: NT.baseId('vejce'), grams: 100 }, v, ctx).diet.length, 0);
  assert.deepStrictEqual(NT.itemFlags({ type: 'food', refId: NT.baseId('tvaroh_polotucny'), grams: 100 }, { diet: 'vegan' }, ctx).diet, ['mlecne']);
  assert.deepStrictEqual(NT.itemFlags({ type: 'food', refId: NT.baseId('tvaroh_polotucny'), grams: 100 }, { diet: 'pescetarian' }, ctx).diet, []);
});
t('nechutě: shoda bez diakritiky a velikosti písmen', () => {
  const cl = { dislikes: 'Brokolice, losos' , diet: 'all'};
  assert.deepStrictEqual(NT.itemFlags({ type: 'recipe', refId: 'rstart03', servings: 1 }, cl, ctx).dislikes, ['brokolice']);
  assert.strictEqual(NT.itemFlags({ type: 'food', refId: NT.baseId('losos'), grams: 100 }, cl, ctx).dislikes.length, 1);
});
t('planAlerts', () => {
  const d = NT.newDay('Den', 'rest', 'three');
  d.meals[0].items.push(NT.newItem('food', NT.baseId('skyr'), 100));
  d.meals[1].items.push(NT.newItem('food', NT.baseId('banan'), 100));
  const al = NT.planAlerts({ days: [d] }, { allergens: ['milk'] }, ctx);
  assert.strictEqual(al.length, 1); assert.strictEqual(al[0].hard, true);
});

console.log('Náhrady, nákupní a výměnný seznam');
t('suggestSwaps: stejná energie, bez alergenů a mimo samotnou potravinu', () => {
  const rice = ctx.foods.get(NT.baseId('ryze_bila_suha'));
  const sw = NT.suggestSwaps(rice, 80, NT.BASE_FOODS, { allergens: ['gluten'], diet: 'all' }, { match: 'kcal' });
  assert.ok(sw.length > 0);
  sw.forEach((s) => {
    assert.ok(!s.food.allergens.includes('gluten'), s.food.name);
    assert.notStrictEqual(s.food.id, rice.id);
    near(s.n.kcal, 280, 280 * 0.1 + 6, s.food.name);
  });
});
t('suggestSwaps: stejné bílkoviny, vegetariánská dieta vyřadí maso', () => {
  const ch = ctx.foods.get(NT.baseId('kureci_prsa'));
  const sw = NT.suggestSwaps(ch, 150, NT.BASE_FOODS, { diet: 'vegetarian' }, { match: 'protein', limit: 20 });
  assert.ok(sw.length > 0);
  sw.forEach((s) => assert.ok(!['maso', 'ryby'].includes(s.food.cat), s.food.name));
  sw.forEach((s) => near(s.n.protein, 34.5, 34.5 * 0.1 + 1, s.food.name));
});
t('nákupní seznam: sčítá a rozepisuje recepty podle porcí', () => {
  const d = NT.newDay('Den', 'rest', 'three');
  d.meals[0].items.push(NT.newItem('food', NT.baseId('banan'), 120));
  d.meals[1].items.push(NT.newItem('food', NT.baseId('banan'), 120));
  d.meals[2].items.push(NT.newItem('recipe', 'rstart03', 2));
  const sl = NT.shoppingList({ days: [d] }, ctx);
  const all = {};
  sl.forEach((g) => g.rows.forEach((r) => { all[r.name] = r.grams; }));
  assert.strictEqual(all['Banán'], 240);
  assert.strictEqual(all['Kuřecí prsa (syrová, bez kůže)'], 300);
  assert.strictEqual(all['Brokolice'], 400);
});
t('výměnný seznam: obsahuje potraviny z plánu a bere ohled na alergie', () => {
  const eq = NT.equivalents([NT.baseId('kureci_prsa'), NT.baseId('ryze_bila_suha')], NT.BASE_FOODS, { allergens: ['fish'], diet: 'all' });
  assert.ok(eq.length >= 2);
  const prot = eq.find((g) => g.id === 'protein');
  assert.ok(prot.rows.some((r) => r.inPlan));
  assert.ok(!prot.rows.some((r) => !r.inPlan && r.food.allergens.includes('fish')));
  const starch = eq.find((g) => g.id === 'starch');
  const r = starch.rows.find((x) => x.food.id === NT.baseId('ryze_bila_suha'));
  near(r.grams, 40, 3);
});

console.log('Sledování');
t('trend hmotnosti a tempo změny', () => {
  const m = [];
  for (let i = 0; i < 29; i++) m.push({ date: NT.addDays('2026-01-01', i), weightKg: 80 - i * (0.5 / 7) });
  const s = NT.weightSeries(m);
  assert.strictEqual(s.length, 29);
  near(NT.ratePerWeek(s, 28), -0.5, 0.01);
  assert.ok(s[28].trend > s[28].weight);
});
t('ratePerWeek: málo dat = null', () => {
  assert.strictEqual(NT.ratePerWeek(NT.weightSeries([{ date: '2026-01-01', weightKg: 80 }]), 28), null);
});
t('trackSummary: upozornění na rychlý pokles a nízké plnění', () => {
  const m = [];
  for (let i = 0; i < 22; i++) m.push({ date: NT.addDays('2026-10-01', i), weightKg: 90 - i * (1.2 / 7) });
  const diary = [];
  for (let i = 0; i < 10; i++) diary.push({ date: NT.addDays('2026-10-12', i), adherence: 40, energy: 2, hunger: 4.5 });
  const s = NT.trackSummary({ goal: 'loss' }, { measures: m, diary }, '2026-10-22');
  const txt = s.concerns.map((c) => c.text).join(' | ');
  assert.ok(/rychlejší než bezpečné/.test(txt), txt);
  assert.ok(/plnění/.test(txt)); assert.ok(/nízkou energii/.test(txt)); assert.ok(/hlad/.test(txt));
});
t('datumy: addDays, daysBetween přes změnu času', () => {
  assert.strictEqual(NT.addDays('2026-03-28', 3), '2026-03-31');
  assert.strictEqual(NT.daysBetween('2026-03-20', '2026-04-03'), 14);
  assert.strictEqual(NT.daysBetween('2026-10-20', '2026-11-03'), 14);
});

console.log('Import a export');
t('CSV: středník, uvozovky, čárka v čísle', () => {
  const p = NT.parseDelimited('Název;Energie (kcal);Bílkoviny\r\n"Jogurt; bílý";62;3,8\r\nChléb;240;7,5\r\n');
  assert.strictEqual(p.delim, ';'); assert.strictEqual(p.rows.length, 2);
  assert.strictEqual(p.rows[0][0], 'Jogurt; bílý'); assert.strictEqual(NT.toNum(p.rows[0][2]), 3.8);
});
t('CSV: Open Food Facts (tabulátor) – mapování a převod', () => {
  const csv = 'code\tproduct_name\tbrands\tenergy-kcal_100g\tfat_100g\tsaturated-fat_100g\tcarbohydrates_100g\tsugars_100g\tfiber_100g\tproteins_100g\tsalt_100g\tallergens\n' +
    '8594000000011\tOvesné vločky jemné\tPenam\t372\t6.5\t1.2\t58\t1\t10\t13\t0.02\ten:gluten\n';
  const p = NT.parseDelimited(csv);
  const map = NT.guessMapping(p.headers);
  ['name', 'kcal', 'protein', 'fat', 'satFat', 'carbs', 'sugar', 'fiber', 'salt', 'brand', 'code', 'allergens'].forEach((k) => assert.ok(map[k] != null, 'mapování ' + k));
  const { food, issues } = NT.rowToFood(p.rows[0], map, {});
  assert.strictEqual(food.name, 'Ovesné vločky jemné (Penam)');
  assert.strictEqual(food.kcal, 372); assert.deepStrictEqual(food.allergens, ['gluten']);
  assert.strictEqual(food.code, '8594000000011');
  assert.strictEqual(NT.foodSeverity(issues), 'ok');
});
t('import: kJ → kcal a sodík → sůl', () => {
  const map = { name: 0, kj: 1, protein: 2, fat: 3, carbs: 4, sodium: 5 };
  const { food } = NT.rowToFood(['Test', '1000', '10', '5', '20', '0,4'], map, {});
  near(food.kcal, 239.01, 0.05); near(food.salt, 1, 0.001);
});
t('import: chybí kcal → dopočet z makroživin', () => {
  const { food } = NT.rowToFood(['Test', '10', '5', '20'], { name: 0, protein: 1, fat: 2, carbs: 3 }, {});
  assert.strictEqual(food.kcal, 4 * 10 + 9 * 5 + 4 * 20);
});
t('alergeny z textu', () => {
  assert.deepStrictEqual(NT.allergensFromText('en:gluten, en:milk, en:soybeans').sort(), ['gluten', 'milk', 'soy']);
  assert.deepStrictEqual(NT.allergensFromText('Obsahuje: mléko, vejce, arašídy').sort(), ['eggs', 'milk', 'peanuts']);
});
t('export CSV potravin se dá načíst zpět', () => {
  const csv = NT.foodsToCsv(NT.BASE_FOODS.slice(0, 3));
  const p = NT.parseDelimited(csv);
  assert.strictEqual(p.rows.length, 3); assert.strictEqual(p.rows[0][0], NT.BASE_FOODS[0].name);
});
t('findFoodByName: přesná i volná shoda', () => {
  assert.strictEqual(NT.findFoodByName('Banán', NT.BASE_FOODS).name, 'Banán');
  assert.ok(NT.findFoodByName('kuřecí prsa', NT.BASE_FOODS).name.startsWith('Kuřecí prsa'));
  assert.strictEqual(NT.findFoodByName('neexistující věc', NT.BASE_FOODS), null);
});

console.log('AI zpracování');
t('sanitizeVariants: vyhodí neznámá id a nesmyslná množství', () => {
  const v = NT.sanitizeVariants({ variants: [{ title: 'A', items: [{ foodId: NT.baseId('banan'), grams: 118 }, { foodId: 'vymyslene', grams: 50 }, { recipeId: 'rstart01', servings: 1 }, { foodId: NT.baseId('jablko'), grams: -5 }] }, { title: 'B', items: [{ foodId: 'x', grams: 1 }] }] }, ctx);
  assert.strictEqual(v.length, 1); assert.strictEqual(v[0].items.length, 2);
  assert.strictEqual(v[0].items[0].grams, 120);
});
t('aiRecipeToRecipe: katalogové i nové suroviny, neznámé bez živin se vynechají', () => {
  const r = NT.aiRecipeToRecipe({
    name: 'Test', servings: 2, steps: ['1. Smíchej', 'Uvař'],
    ingredients: [{ foodId: NT.baseId('vejce'), grams: 100 }, { name: 'Banán', grams: 100 }, { name: 'Xyzzy prášek', grams: 10, per100: { kcal: 230, protein: 20, fat: 11, carbs: 10, fiber: 30 } }, { name: 'Záhada', grams: 30 }]
  }, ctx);
  assert.strictEqual(r.recipe.ingredients.length, 3); assert.strictEqual(r.newFoods.length, 1);
  assert.strictEqual(r.newFoods[0].source, 'ai'); assert.strictEqual(r.problems.length, 1);
  assert.deepStrictEqual(r.recipe.steps, ['Smíchej', 'Uvař']);
});
t('parseAiFood: odfiltruje špatné alergeny a kategorie', () => {
  const f = NT.parseAiFood({ name: 'Něco', cat: 'blbost', kcal: '120', protein: 5, fat: 2, carbs: 20, allergens: ['milk', 'foo'], portions: [{ name: '1 ks', g: 30 }, { name: 'x', g: 'abc' }] });
  assert.strictEqual(f.cat, 'ostatni'); assert.deepStrictEqual(f.allergens, ['milk']); assert.strictEqual(f.portions.length, 1); assert.strictEqual(f.verified, false);
});
t('prompty: obsahují klíčové vstupy', () => {
  const p = NT.promptMeal({ brief: 'Cíl: x', dayLabel: 'Pondělí', dayTarget: { kcal: 2000, protein: 120, fat: 70, carbs: 230 }, remaining: { kcal: 500, protein: 30, fat: 10, carbs: 60 }, mealName: 'Večeře', mealTarget: { kcal: 600, protein: 35 }, existing: '', note: 'bez ryb', variants: 3, foodCatalog: 'b_x|X|Maso|1|2|3|4', recipeCatalog: '' });
  assert.ok(/Večeře/.test(p) && /bez ryb/.test(p) && /b_x\|X/.test(p) && /"variants"/.test(p));
});

console.log('Výstup pro klienta');
t('handout: sestaví dny, nákup, výměny a text; PDF definice je validní struktura', () => {
  const client = { name: 'Jana Nováková', goal: 'loss', sex: 'f', birth: '1990-01-01', heightCm: 168, allergens: [], diet: 'all', needs: { pal: 1.4, goalPct: -15 } };
  const needs = NT.computeNeeds(client, { weight: 70 });
  const d = NT.newDay('Pondělí', 'rest', 'three');
  d.meals[0].items.push(NT.newItem('recipe', 'rstart01', 1));
  d.meals[1].items.push(NT.newItem('recipe', 'rstart03', 1));
  d.meals[2].items.push(NT.newItem('food', NT.baseId('vejce'), 100));
  const plan = { name: 'Redukce, týden 1', days: [d], comment: 'Ahoj', tips: 'Pij vodu.' };
  const m = NT.buildHandout({ plan, client, needs, ctx, practice: { name: 'Nutriční poradna' }, date: '2026-11-19' });
  assert.strictEqual(m.days.length, 1); assert.strictEqual(m.days[0].meals.length, 3);
  assert.ok(m.days[0].meals[2].items[0].amount.includes('2× vejce'), m.days[0].meals[2].items[0].amount);
  assert.ok(m.shopping.length > 0 && m.equivalents.length > 0 && m.recipes.length === 2);
  assert.ok(/Pondělí/i.test(NT.handoutToText(m)));
  const pdf = NT.handoutToPdf(m);
  assert.ok(Array.isArray(pdf.content) && pdf.content.length > 5);
  JSON.stringify(pdf, (k, v) => (typeof v === 'function' ? 'fn' : v));
});
t('handout: vypnuté sekce se nezobrazí', () => {
  const client = { name: 'X', goal: 'loss', allergens: [], diet: 'all' };
  const d = NT.newDay('Den', 'rest', 'three');
  d.meals[0].items.push(NT.newItem('food', NT.baseId('banan'), 100));
  const m = NT.buildHandout({ plan: { name: 'P', days: [d], comment: 'abc' }, client, needs: null, ctx, opts: { shopping: false, equivalents: false, recipes: false, comment: false, nutrients: false } });
  assert.strictEqual(m.shopping, null); assert.strictEqual(m.equivalents, null); assert.strictEqual(m.comment, ''); assert.strictEqual(m.days[0].totals, null);
});


console.log('Asistované návrhy');
t('scaleItems: gramy na hezké hodnoty, porce na půlky', () => {
  const r = NT.scaleItems([{ type: 'food', refId: 'a', grams: 100 }, { type: 'recipe', refId: 'b', servings: 1 }], 1.26);
  assert.strictEqual(r[0].grams, 125); assert.strictEqual(r[1].servings, 1.5);
  assert.strictEqual(NT.niceGrams(7.4), 7); assert.strictEqual(NT.niceGrams(47), 45); assert.strictEqual(NT.niceGrams(263), 260);
});
t('fitItemsToKcal: trefí cíl s malou odchylkou a nemění vstup', () => {
  const items = [NT.newItem('food', NT.baseId('ovesne_vlocky'), 60), NT.newItem('food', NT.baseId('mleko_polotucne'), 200), NT.newItem('food', NT.baseId('banan'), 100)];
  const before = JSON.stringify(items);
  const r = NT.fitItemsToKcal(items, 600, ctx, 0);
  assert.strictEqual(JSON.stringify(items), before);
  near(r.kcal, 600, 25); assert.ok(r.changed);
  const same = NT.fitItemsToKcal(r.items, 600, ctx, 0);
  assert.ok(Math.abs(same.kcal - 600) <= Math.abs(r.kcal - 600) + 1);
});
t('fitItemsToKcal: prázdné položky nespadnou', () => {
  const r = NT.fitItemsToKcal([], 500, ctx, 0); assert.strictEqual(r.items.length, 0); assert.strictEqual(r.changed, false);
});
t('suggestFill: schodek bílkovin navrhne bílkovinné potraviny bez alergenů', () => {
  const s = NT.suggestFill({ kcal: 350, protein: 40, fat: 8, carbs: 25 }, NT.BASE_FOODS, { allergens: ['milk'], diet: 'all' });
  assert.ok(s.length >= 3);
  s.forEach((x) => { assert.strictEqual(x.key, 'protein'); assert.ok(!x.food.allergens.includes('milk'), x.food.name); assert.ok(x.n.kcal <= 350 * 0.95, x.food.name + ' ' + x.n.kcal); });
  assert.ok(s.some((x) => x.food.cat === 'maso' || x.food.cat === 'ryby' || x.food.cat === 'vejce'));
});
t('suggestFill: nic nezbývá = prázdný seznam', () => {
  assert.deepStrictEqual(NT.suggestFill({ kcal: 20, protein: 2, fat: 0, carbs: 3 }, NT.BASE_FOODS, {}), []);
  assert.deepStrictEqual(NT.suggestFill({ kcal: -200, protein: -10, fat: -5, carbs: -20 }, NT.BASE_FOODS, {}), []);
});
t('suggestFill: schodek sacharidů dává přílohy/ovoce', () => {
  const s = NT.suggestFill({ kcal: 300, protein: 3, fat: 3, carbs: 60 }, NT.BASE_FOODS, { diet: 'vegan' });
  assert.ok(s.length > 0); s.forEach((x) => { assert.strictEqual(x.key, 'carbs'); assert.ok(!['maso', 'ryby', 'vejce', 'mlecne'].includes(x.food.cat)); });
});

console.log('Pomocné');
t('fmt: české formátování', () => {
  assert.strictEqual(NT.fmt(1234.56, 1), '1234,6'); assert.strictEqual(NT.fmt(12345.6, 0), '12 346');
  assert.strictEqual(NT.fmt(null), '–'); assert.strictEqual(NT.fmt(-0.001, 1), '0,0'); assert.strictEqual(NT.fmt(NaN), '–');
});
t('esc a norm', () => {
  assert.strictEqual(NT.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.strictEqual(NT.norm('Žluťoučký Kůň'), 'zlutoucky kun');
});
t('cloneDay přegeneruje všechna id', () => {
  const d = NT.newDay('A', 'rest', 'three'); d.meals[0].items.push(NT.newItem('food', 'x', 1));
  const c = NT.cloneDay(d, 'B');
  assert.notStrictEqual(c.id, d.id); assert.notStrictEqual(c.meals[0].id, d.meals[0].id); assert.notStrictEqual(c.meals[0].items[0].id, d.meals[0].items[0].id); assert.strictEqual(c.name, 'B');
});
t('porcePl', () => { assert.strictEqual(NT.porcePl(1), '1 porce'); assert.strictEqual(NT.porcePl(2), '2 porce'); assert.strictEqual(NT.porcePl(5), '5 porcí'); assert.strictEqual(NT.porcePl(1.5), '1,5 porce'); });

console.log('Energie jídel, cíl, cesta klienta');
t('mealShares: součet 1, pět jídel 25/10/30/10/25 %', () => {
  const d = NT.newDay('x', 'rest', 'five');
  const sh = NT.mealShares(d.meals);
  near(sh.reduce((a, s) => a + s.share, 0), 1, 1e-9);
  [0.25, 0.10, 0.30, 0.10, 0.25].forEach((v, i) => near(sh[i].share, v, 1e-9));
  const three = NT.mealShares(NT.newDay('y', 'rest', 'three').meals);
  near(three[1].share, 0.30 / 0.80, 1e-9);
});
t('mealRecommendations: 2 000 kcal → 500 / 200 / 600 / 200 / 500, rozmezí ±15 %', () => {
  const r = NT.mealRecommendations(NT.newDay('x', 'rest', 'five').meals, { kcal: 2000 });
  assert.deepStrictEqual(r.map((x) => Math.round(x.kcal)), [500, 200, 600, 200, 500]);
  near(r[0].lo, 425, 1e-9); near(r[0].hi, 575, 1e-9);
  assert.strictEqual(NT.mealRecommendations(NT.newDay('x', 'rest', 'five').meals, null)[0].kcal, null);
});
t('mealEnergyStatus: málo / moc / sedí podle pásem 65/85/115/135 %', () => {
  const s = (k) => NT.mealEnergyStatus(k, 400);
  assert.strictEqual(s(0).key, 'empty');
  assert.deepStrictEqual([s(200).text, s(200).level], ['hodně málo', 'bad']);
  assert.deepStrictEqual([s(300).text, s(300).level], ['málo', 'warn']);
  assert.deepStrictEqual([s(400).text, s(400).level], ['sedí', 'ok']);
  assert.deepStrictEqual([s(520).text, s(520).level], ['moc', 'warn']);
  assert.deepStrictEqual([s(700).text, s(700).level], ['hodně moc', 'bad']);
  assert.strictEqual(NT.mealEnergyStatus(300, null).key, 'none');
});
t('dayEnergyVerdict: chybí / přebývá / sedí', () => {
  assert.strictEqual(NT.dayEnergyVerdict(1500, 1700).text, 'Chybí 200 kcal');
  assert.strictEqual(NT.dayEnergyVerdict(1500, 1700).level, 'bad');
  assert.strictEqual(NT.dayEnergyVerdict(1600, 1700).level, 'warn');
  assert.strictEqual(NT.dayEnergyVerdict(1900, 1700).text, 'Přebývá 200 kcal');
  assert.strictEqual(NT.dayEnergyVerdict(1710, 1700).key, 'ok');
  assert.strictEqual(NT.dayEnergyVerdict(0, 1700).key, 'empty');
});
const gcl = { goal: 'loss', sex: 'f', birth: '1990-05-01', heightCm: 168 };
const gneeds = NT.computeNeeds(gcl, { weight: 80 });
const gA = (a, b, d1, d2, cl) => NT.assessGoal(cl || gcl, { kind: 'weight', startWeight: a, targetWeight: b, startDate: d1, targetDate: d2 }, { needs: gneeds, today: '2026-11-20' });
t('assessGoal: 80 → 76 kg za 12 týdnů = 0,33 kg/týd (0,42 %) = reálné', () => {
  const r = gA(80, 76, '2026-11-20', '2027-02-12');
  assert.strictEqual(r.verdict, 'realistic'); near(r.rateKg, -4 / 12, 1e-9); near(r.pct, 0.4167, 0.001);
  assert.strictEqual(r.earliestComfort, '2027-01-29');
});
t('assessGoal: 80 → 72 kg za 16 týdnů = 0,5 kg/týd (0,63 %) = náročné; pohodlný termín 9. 4. 2027', () => {
  const r = gA(80, 72, '2026-11-20', '2027-03-12');
  assert.strictEqual(r.verdict, 'ambitious'); assert.strictEqual(r.earliestComfort, '2027-04-09'); assert.strictEqual(r.earliestMax, '2027-01-29');
});
t('assessGoal: 80 → 70 kg za 8 týdnů = nereálné (1,56 %/týd, pod bazálem)', () => {
  const r = gA(80, 70, '2026-11-20', '2027-01-15');
  assert.strictEqual(r.verdict, 'unrealistic');
  assert.ok(r.messages.some((m) => /bazálním metabolismem/.test(m.text)));
});
t('assessGoal: cílové BMI pod 18,5 = nereálné i při pomalém tempu', () => {
  const r = gA(80, 50, '2026-11-20', '2028-11-20');
  assert.strictEqual(r.verdict, 'unrealistic'); assert.ok(r.messages.some((m) => /podváze/.test(m.text)));
});
t('assessGoal: nabírání 70 → 73 kg za 12 týdnů = 0,36 %/týd = náročné; chybějící údaje = incomplete; špatné datum = bad', () => {
  const r = gA(70, 73, '2026-11-20', '2027-02-12', { goal: 'gain', sex: 'm', heightCm: 180, birth: '1990-01-01' });
  assert.strictEqual(r.verdict, 'ambitious');
  assert.strictEqual(NT.assessGoal(gcl, { kind: 'weight', startWeight: 80 }, {}).verdict, 'incomplete');
  const bad = gA(80, 76, '2026-11-20', '2026-11-01');
  assert.strictEqual(bad.verdict, 'incomplete'); assert.strictEqual(bad.level, 'bad');
  assert.strictEqual(NT.assessGoal(gcl, { kind: 'custom', title: 'x' }, {}).verdict, 'na');
});
t('assessGoal: průběh (pozadu / před plánem) a trend proti cíli', () => {
  const gp = { kind: 'weight', startWeight: 80, targetWeight: 72, startDate: '2026-10-20', targetDate: '2027-02-02' };
  const mk = (w, rate) => NT.assessGoal(gcl, gp, { needs: gneeds, today: '2026-11-20', summary: { last: { weight: w, date: '2026-11-20' }, rate } });
  assert.strictEqual(mk(79.5, -0.1).progress.state, 'behind');
  assert.strictEqual(mk(76, -0.5).progress.state, 'ahead');
  assert.strictEqual(mk(78.5, -0.3).progress.state, 'on');
  assert.ok(mk(80.5, 0.2).messages.some((m) => /proti cíli/.test(m.text)));
});
t('goalMilestones: čtvrtiny cesty 80 → 72 kg za 16 týdnů, splněno podle aktuální hmotnosti', () => {
  const gp = { kind: 'weight', startWeight: 80, targetWeight: 72, startDate: '2026-11-20', targetDate: '2027-03-12' };
  const m = NT.goalMilestones(gp, 77.9);
  assert.deepStrictEqual(m.map((x) => x.weight), [78, 76, 74, 72]);
  assert.deepStrictEqual(m.map((x) => x.date), ['2026-12-18', '2027-01-15', '2027-02-12', '2027-03-12']);
  assert.deepStrictEqual(m.map((x) => x.reached), [true, false, false, false]);
  assert.deepStrictEqual(NT.goalMilestones({ kind: 'custom' }, 70), []);
  assert.deepStrictEqual(NT.goalMilestones(Object.assign({}, gp, { targetDate: '2026-11-01' }), 70), []);
  assert.strictEqual(NT.goalMilestones({ kind: 'weight', startWeight: 70, targetWeight: 73, startDate: '2026-11-20', targetDate: '2027-02-12' }, 71)[0].reached, true);
});
const jc = { heightCm: 168, birth: '1990-01-01', sex: 'f', journey: { gates: { intake: { date: '2026-10-01' }, session: { date: '2026-10-20' } }, checkups: [{ date: '2026-11-01' }], checkInterval: 14 }, goalPlan: { kind: 'weight', status: 'approved', startWeight: 80, targetWeight: 76, startDate: '2026-10-20', targetDate: '2027-01-12', approvedAt: '2026-10-20' } };
t('journeyStatus: stavy kroků, zpožděná kontrola, další krok', () => {
  const j = NT.journeyStatus(jc, { today: '2026-11-20', weight: 79, hasPlan: true });
  assert.deepStrictEqual(j.gates.map((g) => g.state), ['done', 'done', 'done', 'done', 'done', 'overdue', 'todo']);
  assert.strictEqual(j.checkup.due, '2026-11-15'); assert.strictEqual(j.checkup.overdue, 5);
  assert.strictEqual(j.next.gate, 'checkup'); assert.strictEqual(j.next.level, 'bad');
  assert.strictEqual(j.done, 5); assert.strictEqual(j.pct, 71);
});
t('journeyStatus: nový klient = úvodní sezení na řadě; odsouhlasený cíl a jídelník zapnou kroky', () => {
  const n = NT.journeyStatus({}, { today: '2026-11-20' });
  assert.strictEqual(n.gates[0].state, 'current'); assert.strictEqual(n.done, 0); assert.strictEqual(n.next.gate, 'intake');
  const d = NT.journeyStatus({ goalPlan: { kind: 'weight', status: 'draft' } }, { today: '2026-11-20' });
  assert.strictEqual(d.gates.find((g) => g.key === 'goal').state, 'todo');
  const a = NT.journeyStatus({ goalPlan: { kind: 'custom', status: 'approved', title: 'Víc energie' } }, { today: '2026-11-20', hasPlan: true });
  assert.strictEqual(a.gates.find((g) => g.key === 'goal').state, 'done'); assert.strictEqual(a.gates.find((g) => g.key === 'plan').state, 'done');
});
t('journeyStatus: kontrola bez prodlení = splněno s příštím termínem; po termínu cíle = vyhodnocení po termínu', () => {
  const ok = NT.journeyStatus(Object.assign({}, jc, { journey: Object.assign({}, jc.journey, { checkups: [{ date: '2026-11-15' }] }) }), { today: '2026-11-20', weight: 79, hasPlan: true });
  assert.strictEqual(ok.gates[5].state, 'done'); assert.strictEqual(ok.checkup.due, '2026-11-29');
  const late = NT.journeyStatus(jc, { today: '2027-02-01', weight: 76, hasPlan: true });
  assert.strictEqual(late.gates[6].state, 'overdue');
});
t('clientAgenda: po termínu kontrola je nejdřív, zastaralé vážení se hlásí', () => {
  const sum = { last: { date: '2026-10-30', weight: 79 }, concerns: [] };
  const ag = NT.clientAgenda(jc, { today: '2026-11-20', weight: 79, hasPlan: true, summary: sum });
  assert.strictEqual(ag[0].level, 'bad'); assert.ok(/Kontrola/.test(ag[0].text));
  assert.ok(ag.some((x) => x.kind === 'weight'));
});

console.log('Návrh jídelníčku');
const gfoods = NT.BASE_FOODS, grecipes = NT.STARTER_RECIPES;
const gen = (cl, opts) => NT.generatePlan(Object.assign({ client: cl, needs: NT.computeNeeds(cl, { weight: 72 }), foods: gfoods, recipes: grecipes, ctx, days: 7, preset: 'five', seed: 1 }, opts || {}));
t('generatePlan: 7 dní × 5 jídel, energie dne do ±5 % cíle, plně deterministické', () => {
  const a = gen(gcl); const b = gen(gcl);
  assert.strictEqual(a.days.length, 7); a.days.forEach((d) => assert.strictEqual(d.meals.length, 5));
  const target = NT.computeNeeds(gcl, { weight: 72 }).rest.kcal;
  a.days.forEach((d) => near(NT.dayTotals(d, ctx).total.kcal, target, target * 0.05, d.name));
  const sig = (r) => JSON.stringify(r.days.map((d) => d.meals.map((m) => m.items.map((i) => i.refId + (i.servings || i.grams)))));
  assert.strictEqual(sig(a), sig(b));
  assert.notStrictEqual(sig(a), sig(gen(gcl, { seed: 2 })));
});
t('generatePlan: pestrost – žádné jídlo dvakrát v týdnu mezi stejnými recepty víc než 2×, nikdy v sousedních dnech', () => {
  const r = gen(gcl);
  assert.ok(r.stats.score >= 85, 'pestrost ' + r.stats.score);
  const cnt = {};
  r.days.forEach((d, di) => d.meals.forEach((m) => m.items.filter((i) => i.type === 'recipe').forEach((i) => {
    cnt[i.refId] = (cnt[i.refId] || 0) + 1;
    if (di > 0) assert.ok(!r.days[di - 1].meals.some((pm) => pm.items.some((pi) => pi.refId === i.refId)), 'opakování ' + i.refId + ' v dni ' + d.name);
  })));
  assert.ok(Math.max.apply(null, Object.values(cnt)) <= 2);
  r.days.forEach((d) => { const ids = d.meals.flatMap((m) => m.items.filter((i) => i.type === 'recipe').map((i) => i.refId)); assert.strictEqual(new Set(ids).size, ids.length, 'v jednom dni se recept opakuje'); });
});
t('generatePlan: respektuje alergeny, dietu a nechutě (nikdy neporuší tvrdé omezení)', () => {
  [{ allergens: ['gluten', 'milk'] }, { diet: 'vegan' }, { diet: 'vegetarian', dislikes: 'tofu, houby' }, { allergens: ['eggs', 'fish'], dislikes: 'kuřecí' }].forEach((extra) => {
    const cl = Object.assign({}, gcl, extra);
    const r = gen(cl);
    assert.deepStrictEqual(NT.planAlerts({ days: r.days }, cl, ctx), [], JSON.stringify(extra));
    r.days.forEach((d) => d.meals.forEach((m) => m.items.forEach((i) => assert.ok(NT.itemCalc(i, ctx).ok))));
  });
});
t('generatePlan: poskládaná jídla jen z běžných potravin (nikdy z NutriDatabáze), vegan má poznámku o omezeném výběru', () => {
  const r = gen(Object.assign({}, gcl, { diet: 'vegan' }));
  r.days.forEach((d) => d.meals.forEach((m) => m.items.filter((i) => i.type === 'food').forEach((i) => assert.notStrictEqual(ctx.foods.get(i.refId).origin, 'nutridb'))));
  assert.ok(r.notes.length >= 0);
});
t('generatePlan: snídaně a večeře odpovídají štítkům (snídaně jen recepty se štítkem Snídaně)', () => {
  const r = gen(gcl);
  r.days.forEach((d) => d.meals.forEach((m) => {
    const lab = NT.mealKindLabels(m.name);
    m.items.filter((i) => i.type === 'recipe').forEach((i) => assert.ok(ctx.recipes.get(i.refId).mealTypes.some((x) => lab.indexOf(x) >= 0), m.name + ': ' + i.refId));
  }));
});
t('generatePlan: bez dat o klientovi počítá s 2 000 kcal a upozorní; tréninkové dny dostanou víc energie', () => {
  const r = NT.generatePlan({ client: { goal: 'loss' }, needs: { ok: false }, foods: gfoods, recipes: grecipes, ctx, days: 3, seed: 1 });
  assert.ok(r.notes.some((n) => /2 000 kcal/.test(n)));
  const cl = Object.assign({}, gcl, { needs: { trainingKcal: 400, trainingDays: 3 } });
  const g = gen(cl, { needs: NT.computeNeeds(cl, { weight: 72 }) });
  const tr = g.days.filter((d) => d.dayType === 'training'), rs = g.days.filter((d) => d.dayType === 'rest');
  assert.strictEqual(tr.length, 3);
  assert.ok(NT.dayTotals(tr[0], ctx).total.kcal > NT.dayTotals(rs[0], ctx).total.kcal + 250);
  assert.deepStrictEqual(NT.defaultDayTypes(7, 3), ['rest', 'rest', 'training', 'rest', 'training', 'rest', 'training']);
});
t('generatePlan: 1 den a 14 dní, 3 a 4 jídla', () => {
  assert.strictEqual(gen(gcl, { days: 1 }).days.length, 1);
  const r14 = gen(gcl, { days: 14, preset: 'three' });
  assert.strictEqual(r14.days.length, 14); assert.strictEqual(r14.days[0].meals.length, 3);
  assert.strictEqual(gen(gcl, { preset: 'four' }).days[0].meals.length, 4);
});

console.log('\n' + pass + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
