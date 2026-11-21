/* ==== plánovač: štítky jídel, energie jídel, posouzení cíle, cesta klienta, návrh jídelníčku ====
   Vše deterministické (bez AI). Návrh jídelníčku používá generátor s pevným semínkem, takže stejné
   vstupy dají stejný výsledek a tlačítko „Jiný návrh“ jen změní semínko. */
(function (root) {
  'use strict';
  const NT = root.NT;

  // ---------------------------------------------------------------- štítky jídel
  NT.MEAL_TYPES = ['Snídaně', 'Svačina', 'Oběd', 'Večeře', 'Nápoj', 'Dezert', 'Před tréninkem', 'Po tréninku'];
  /** sjednotí zápis štítků: známé na výchozí tvar, vlastní zůstanou, bez duplicit */
  NT.normMealTypes = function (list) {
    const known = new Map(NT.MEAL_TYPES.map((t) => [NT.norm(t), t]));
    const alias = { 'dopoledni svacina': 'Svačina', 'odpoledni svacina': 'Svačina', 'svacina': 'Svačina', 'snidane': 'Snídaně', 'obed': 'Oběd', 'vecere': 'Večeře', 'napoj': 'Nápoj', 'drink': 'Nápoj', 'pred trenink': 'Před tréninkem', 'po trenink': 'Po tréninku' };
    const out = [];
    (Array.isArray(list) ? list : String(list || '').split(/[,;\n]+/)).forEach((x) => {
      const raw = String(x || '').trim();
      if (!raw) return;
      const k = NT.norm(raw);
      const t = known.get(k) || alias[k] || (raw.length > 30 ? raw.slice(0, 30) : raw.charAt(0).toUpperCase() + raw.slice(1));
      if (out.indexOf(t) < 0) out.push(t);
    });
    return out.slice(0, 6);
  };

  /** druh jídla podle jeho názvu v jídelníčku */
  NT.mealKind = function (name) {
    const n = NT.norm(name || '');
    if (/pred trenink|pre-?workout/.test(n)) return 'pre';
    if (/po trenink|post-?workout/.test(n)) return 'post';
    if (/snidan/.test(n)) return 'breakfast';
    if (/obed/.test(n)) return 'lunch';
    if (/vecer/.test(n)) return 'dinner';
    if (/druha vecere|noc/.test(n)) return 'dinner';
    return 'snack';
  };
  const KIND_LABELS = {
    breakfast: ['Snídaně'], lunch: ['Oběd'], dinner: ['Večeře'], snack: ['Svačina'],
    pre: ['Před tréninkem', 'Svačina'], post: ['Po tréninku', 'Svačina']
  };
  NT.mealKindLabels = (name) => KIND_LABELS[NT.mealKind(name)] || ['Svačina'];
  const KIND_WEIGHT = { breakfast: 25, lunch: 30, dinner: 25, snack: 10, pre: 8, post: 8 };

  /** doporučený podíl energie dne pro každé jídlo (součet = 1) */
  NT.mealShares = function (meals) {
    const w = (meals || []).map((m) => KIND_WEIGHT[NT.mealKind(m.name)] || 10);
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    return (meals || []).map((m, i) => ({ id: m.id, name: m.name, kind: NT.mealKind(m.name), share: w[i] / sum }));
  };
  /** doporučení po jídlech: kcal a rozmezí ±15 % */
  NT.mealRecommendations = function (meals, dayTarget) {
    const sh = NT.mealShares(meals);
    return sh.map((s) => {
      const kcal = dayTarget && dayTarget.kcal > 0 ? s.share * dayTarget.kcal : null;
      return Object.assign({}, s, { kcal, lo: kcal != null ? kcal * 0.85 : null, hi: kcal != null ? kcal * 1.15 : null });
    });
  };
  /** posouzení energie jednoho jídla vůči doporučení */
  NT.mealEnergyStatus = function (kcal, rec) {
    if (!rec || !(rec > 0)) return { key: 'none', level: 'muted', text: '', pct: 0 };
    const pct = (kcal / rec) * 100;
    if (!(kcal > 0)) return { key: 'empty', level: 'muted', text: 'prázdné', pct: 0 };
    if (pct < 65) return { key: 'low', level: 'bad', text: 'hodně málo', pct };
    if (pct < 85) return { key: 'low', level: 'warn', text: 'málo', pct };
    if (pct <= 115) return { key: 'ok', level: 'ok', text: 'sedí', pct };
    if (pct <= 135) return { key: 'high', level: 'warn', text: 'moc', pct };
    return { key: 'high', level: 'bad', text: 'hodně moc', pct };
  };
  /** slovní verdikt dne: kolik chybí / přebývá */
  NT.dayEnergyVerdict = function (kcal, target) {
    if (!(target > 0)) return { key: 'none', level: 'muted', text: '' };
    if (!(kcal > 0)) return { key: 'empty', level: 'muted', text: 'Den je zatím prázdný' };
    const diff = kcal - target;
    const pct = (diff / target) * 100;
    if (Math.abs(pct) <= 5) return { key: 'ok', level: 'ok', text: 'Energie dne sedí', diff };
    const amt = NT.fmt(Math.abs(diff)) + ' kcal';
    if (diff < 0) return { key: 'low', level: Math.abs(pct) <= 10 ? 'warn' : 'bad', text: 'Chybí ' + amt, diff };
    return { key: 'high', level: pct <= 10 ? 'warn' : 'bad', text: 'Přebývá ' + amt, diff };
  };

  // ---------------------------------------------------------------- běžné potraviny (bez NutriDatabáze)
  NT.isCommonFood = (f) => f.origin !== 'nutridb';

  // ---------------------------------------------------------------- posouzení cíle
  const LIM = { loss: { comfort: 0.5, max: 1.0 }, gain: { comfort: 0.25, max: 0.5 } };
  NT.GOAL_LIMITS = LIM;
  const VERDICT = {
    realistic: { level: 'ok', title: 'Reálné' },
    ambitious: { level: 'warn', title: 'Náročné, ale možné' },
    unrealistic: { level: 'bad', title: 'V tomto termínu nereálné' }
  };
  /**
   * gp = {kind:'weight', startWeight, startDate, targetWeight, targetDate}
   * ctx = {needs (výsledek computeNeeds), summary (trackSummary), today}
   */
  // Milníky cíle: čtvrtiny cesty (hmotnost a datum při rovnoměrném tempu); splněno podle aktuální hmotnosti.
  NT.goalMilestones = function (gp, currentWeight) {
    if (!gp || gp.kind !== 'weight' || !(gp.startWeight > 0) || !(gp.targetWeight > 0) || !gp.startDate || !gp.targetDate || gp.startWeight === gp.targetWeight) return [];
    const days = NT.daysBetween(gp.startDate, gp.targetDate); if (!(days > 0)) return [];
    const span = gp.targetWeight - gp.startWeight;
    return [0.25, 0.5, 0.75, 1].map((f) => {
      const w = Math.round((gp.startWeight + span * f) * 10) / 10;
      const reached = currentWeight != null && (span < 0 ? currentWeight <= w : currentWeight >= w);
      return { pct: f * 100, weight: w, date: NT.addDays(gp.startDate, Math.round(days * f)), reached };
    });
  };
  NT.assessGoal = function (client, gp, ctx) {
    ctx = ctx || {};
    const today = ctx.today || NT.today();
    if (!gp || gp.kind === 'custom' || !gp.kind) return { verdict: 'na', level: 'muted', title: '', messages: [] };
    const start = +gp.startWeight, target = +gp.targetWeight;
    if (!(start > 0) || !(target > 0) || !gp.startDate || !gp.targetDate) {
      return { verdict: 'incomplete', level: 'muted', title: 'Doplň údaje', messages: [{ level: 'info', text: 'Pro posouzení je potřeba počáteční a cílová hmotnost a obě data.' }] };
    }
    const days = NT.daysBetween(gp.startDate, gp.targetDate);
    if (!(days > 0)) return { verdict: 'incomplete', level: 'bad', title: 'Termín je před začátkem', messages: [{ level: 'bad', text: 'Cílové datum musí být později než počáteční.' }] };
    const delta = target - start;
    const dir = Math.abs(delta) < 0.05 ? 'hold' : delta < 0 ? 'loss' : 'gain';
    const weeks = days / 7;
    const rateKg = delta / weeks;
    const pct = (Math.abs(rateKg) / start) * 100;
    const msgs = [];
    const M = (level, text) => msgs.push({ level, text });
    let verdict = 'realistic';
    const worse = (v) => { const o = ['realistic', 'ambitious', 'unrealistic']; if (o.indexOf(v) > o.indexOf(verdict)) verdict = v; };
    const lim = LIM[dir];
    let earliestComfort = null, earliestMax = null;
    if (lim) {
      if (pct > lim.max + 1e-9) worse('unrealistic');
      else if (pct > lim.comfort + 1e-9) worse('ambitious');
      const need = Math.abs(delta);
      earliestComfort = NT.addDays(gp.startDate, Math.ceil((need / (start * lim.comfort / 100)) * 7));
      earliestMax = NT.addDays(gp.startDate, Math.ceil((need / (start * lim.max / 100)) * 7));
      const txt = (dir === 'loss' ? 'Úbytek ' : 'Přírůstek ') + NT.fmt(Math.abs(delta), 1) + ' kg za ' + (Number.isInteger(weeks) ? weeks + ' ' + NT.plural(weeks, 'týden', 'týdny', 'týdnů') : NT.fmt(weeks, 1) + ' týdne') + ' znamená ' + NT.fmt(Math.abs(rateKg), 2) + ' kg týdně (' + NT.fmt(pct, 2) + ' % hmotnosti).';
      M(verdict === 'realistic' ? 'ok' : verdict === 'ambitious' ? 'warn' : 'bad', txt + ' ' + (dir === 'loss'
        ? 'Za pohodlné tempo se bere do 0,5 % týdně, za horní mez asi 1 %.'
        : 'Za pohodlné tempo se bere do 0,25 % týdně, za horní mez asi 0,5 %.'));
      if (dir === 'loss' && Math.abs(rateKg) > 1) { worse('unrealistic'); M('bad', 'Víc než 1 kg týdně je mimo bezpečné samostatné vedení.'); }
      if (verdict !== 'realistic') {
        M('info', 'Pohodlnější termín je ' + NT.fmtDate(earliestComfort) + (verdict === 'unrealistic' ? ', nejdřív rozumně ' + NT.fmtDate(earliestMax) : '') + '.');
      }
    } else {
      M('ok', 'Cíl je udržet hmotnost, nic dalšího se nehodnotí.');
    }
    if (days < 21 && Math.abs(delta) >= 1) M('info', 'Při horizontu pod 3 týdny hodně ovlivní vyšší nebo nižší voda a glykogen. Změna na váze nemusí odpovídat tuku.');
    // BMI cíle
    if (client && client.heightCm > 0) {
      const h = client.heightCm / 100;
      const bmiT = target / (h * h);
      if (bmiT < 18.5) { worse('unrealistic'); M('bad', 'Cílová hmotnost odpovídá BMI ' + NT.fmt(bmiT, 1) + ', tedy podváze. Takový cíl nedoporučuji.'); }
      else if (dir === 'loss' && bmiT < 20) M('warn', 'Cílové BMI ' + NT.fmt(bmiT, 1) + ' je těsně nad podváhou. Zvaž mírnější cíl.');
      else if (dir === 'gain' && bmiT >= 27) M('info', 'Cílové BMI ' + NT.fmt(bmiT, 1) + ' je v nadváze. Má smysl jen při cíleném nabírání svalů.');
    }
    if (client && client.goal === 'loss' && dir === 'gain') M('warn', 'Klient má v profilu cíl redukce, ale cílová hmotnost je vyšší než počáteční.');
    if (client && client.goal === 'gain' && dir === 'loss') M('warn', 'Klient má v profilu cíl nabírání, ale cílová hmotnost je nižší než počáteční.');
    // energie
    const needs = ctx.needs;
    let kcalPerDay = (rateKg * 7700) / 7;
    if (needs && needs.ok && dir !== 'hold') {
      const tdee = needs.avgTdee;
      const planned = tdee + kcalPerDay;
      const minKcal = client && client.sex === 'm' ? 1500 : 1200;
      const defPct = (Math.abs(kcalPerDay) / tdee) * 100;
      if (dir === 'loss') {
        M('info', 'Vychází to na přibližně ' + NT.fmt(Math.abs(kcalPerDay)) + ' kcal deficitu denně z odhadovaného výdeje ' + NT.fmt(tdee) + ' kcal' + (planned > 0 ? ', tedy příjem kolem ' + NT.fmt(planned) + ' kcal.' : ', což je víc, než klient vůbec spotřebuje.'));
        if (defPct > 30) { worse('unrealistic'); M('bad', 'Deficit ' + NT.fmt(defPct) + ' % výdeje je příliš velký.'); }
        else if (defPct > 25) { worse('ambitious'); M('warn', 'Deficit ' + NT.fmt(defPct) + ' % výdeje je vysoký, roste riziko ztráty svalů a nedostatku živin.'); }
        if (planned < needs.bmr) { worse('unrealistic'); M('bad', planned > 0 ? 'Potřebný příjem (' + NT.fmt(planned) + ' kcal) je pod bazálním metabolismem (' + NT.fmt(needs.bmr) + ' kcal).' : 'Cíl by vyžadoval záporný příjem energie, v tomto termínu není splnitelný.'); }
        else if (planned < minKcal) { worse('ambitious'); M('warn', 'Potřebný příjem (' + NT.fmt(planned) + ' kcal) je pod ' + minKcal + ' kcal.'); }
      } else {
        M('info', 'Vychází to na přibližně ' + NT.fmt(kcalPerDay) + ' kcal přebytku denně, tedy příjem kolem ' + NT.fmt(planned) + ' kcal.');
        if (defPct > 25) { worse('ambitious'); M('warn', 'Přebytek ' + NT.fmt(defPct) + ' % výdeje je velký, přibere se hlavně tuk.'); }
      }
    } else if (dir !== 'hold') {
      M('info', 'Energetický odhad zatím nejde spočítat, chybí údaje o klientovi (váha, výška, datum narození, pohlaví).');
    }
    // aktuální průběh
    const sum = ctx.summary;
    let progress = null;
    if (sum && sum.last && dir !== 'hold') {
      const cur = sum.last.weight;
      const done = (start - cur) / (start - target);
      const elapsed = NT.clamp(NT.daysBetween(gp.startDate, today) / days, 0, 1.5);
      const doneC = NT.clamp(done, -1, 1.5);
      let state = 'on';
      if (today >= gp.startDate) {
        if (elapsed > 0.05 && doneC < elapsed - 0.15) state = 'behind';
        else if (doneC > elapsed + 0.15) state = 'ahead';
      } else state = 'notstarted';
      progress = { current: cur, done: doneC, elapsed, state, left: target - cur };
      if (sum.rate != null && Math.abs(sum.rate) > 0.02) {
        const wrong = (dir === 'loss' && sum.rate > 0.05) || (dir === 'gain' && sum.rate < -0.05);
        if (wrong) M('warn', 'Trend posledních týdnů (' + NT.fmt(sum.rate, 2) + ' kg týdně) jde proti cíli.');
        else {
          const wks = Math.abs((target - cur) / sum.rate);
          if (isFinite(wks) && wks < 520) M('info', 'Při současném tempu (' + NT.fmt(sum.rate, 2) + ' kg týdně) by cíl vyšel kolem ' + NT.fmtDate(NT.addDays(today, Math.round(wks * 7))) + '.');
        }
      }
      if (state === 'behind') M('warn', 'Průběh je pozadu za plánem.');
      if (state === 'ahead') M('ok', 'Průběh je před plánem.');
    }
    const V = VERDICT[verdict];
    return {
      verdict, level: V.level, title: V.title, days, weeks, delta, dir, rateKg, pct, kcalPerDay,
      earliestComfort, earliestMax, progress, messages: msgs
    };
  };

  // ---------------------------------------------------------------- cesta klienta (status bar)
  NT.JOURNEY_GATES = [
    { key: 'intake', label: 'Úvodní sezení', manual: true, todo: 'Domluvit a odbýt úvodní sezení' },
    { key: 'data', label: 'Vstupní data', todo: 'Doplnit údaje (váha, výška, datum narození, pohlaví)' },
    { key: 'goal', label: 'Cíl odsouhlasen', todo: 'Nastavit a odsouhlasit cíl' },
    { key: 'plan', label: 'Jídelníček hotov', todo: 'Vytvořit jídelníček' },
    { key: 'session', label: 'Sezení k jídelníčku', manual: true, todo: 'Probrat jídelníček s klientem' },
    { key: 'checkup', label: 'Pravidelná kontrola', recurring: true, todo: 'Provést kontrolu' },
    { key: 'eval', label: 'Vyhodnocení', manual: true, todo: 'Vyhodnotit cíl a rozhodnout o dalším postupu' }
  ];
  NT.defaultJourney = () => ({ gates: {}, checkups: [], checkInterval: 14 });
  NT.journeyOf = function (client) {
    const j = Object.assign(NT.defaultJourney(), client && client.journey ? client.journey : {});
    j.gates = Object.assign({}, j.gates || {});
    j.checkups = (j.checkups || []).filter((x) => x && x.date).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    j.checkInterval = j.checkInterval > 0 ? j.checkInterval : 14;
    return j;
  };
  /**
   * ctx = {today, weight, hasPlan, track}
   * vrací {gates:[{key,label,state,date,detail}], done, total, pct, next:{text,level,gate}, checkup:{...}}
   */
  NT.journeyStatus = function (client, ctx) {
    ctx = ctx || {};
    const today = ctx.today || NT.today();
    const j = NT.journeyOf(client);
    const gp = client && client.goalPlan;
    const out = [];
    const manual = (k) => j.gates[k] && j.gates[k].date ? j.gates[k] : null;
    const sessionDone = !!manual('session');
    const lastCheck = j.checkups.length ? j.checkups[j.checkups.length - 1].date : null;
    let checkup = { count: j.checkups.length, last: lastCheck, due: null, overdue: 0, interval: j.checkInterval };
    NT.JOURNEY_GATES.forEach((g) => {
      const row = { key: g.key, label: g.label, state: 'todo', date: null, detail: '', manual: !!g.manual, recurring: !!g.recurring };
      if (g.key === 'intake' || g.key === 'session' || g.key === 'eval') {
        const m = manual(g.key);
        if (m) { row.state = 'done'; row.date = m.date; row.detail = NT.fmtDate(m.date); }
      } else if (g.key === 'data') {
        const miss = [];
        if (!(ctx.weight > 0)) miss.push('hmotnost');
        if (!(client && client.heightCm > 0)) miss.push('výška');
        if (!(client && client.birth)) miss.push('datum narození');
        if (!(client && client.sex)) miss.push('pohlaví');
        if (!miss.length) { row.state = 'done'; row.detail = 'úplné'; } else row.detail = 'chybí: ' + miss.join(', ');
      } else if (g.key === 'goal') {
        if (gp && gp.status === 'approved') { row.state = 'done'; row.date = gp.approvedAt || null; row.detail = gp.kind === 'weight' ? NT.fmt(gp.startWeight, 1) + ' → ' + NT.fmt(gp.targetWeight, 1) + ' kg' : (gp.title || 'cíl'); }
        else if (gp && gp.status === 'achieved') { row.state = 'done'; row.detail = 'splněn'; }
        else if (gp) row.detail = 'rozpracovaný, čeká na schválení';
        else row.detail = 'není nastaven';
      } else if (g.key === 'plan') {
        if (ctx.hasPlan) { row.state = 'done'; row.detail = 'vytvořen'; } else row.detail = 'zatím žádný';
      } else if (g.key === 'checkup') {
        if (!sessionDone) { row.detail = 'po sezení k jídelníčku'; }
        else {
          const base = lastCheck || manual('session').date;
          const due = NT.addDays(base, j.checkInterval);
          const left = NT.daysBetween(today, due);
          checkup.due = due;
          if (left < 0) { row.state = 'overdue'; checkup.overdue = -left; row.detail = 'zpoždění ' + (-left) + ' ' + NT.plural(-left, 'den', 'dny', 'dní') + ', měla být ' + NT.fmtDate(due); }
          else if (!lastCheck || left <= 3) { row.state = 'current'; row.detail = left === 0 ? 'dnes' : 'do ' + NT.fmtDate(due) + (lastCheck ? '' : ', první'); }
          else { row.state = 'done'; row.date = lastCheck; row.detail = 'další do ' + NT.fmtDate(due); }
        }
      }
      out.push(row);
    });
    // stav „právě na řadě“
    let found = false;
    out.forEach((r) => {
      if (r.key === 'eval' && r.state !== 'done') {
        if (gp && gp.status === 'approved' && gp.targetDate) {
          const left = NT.daysBetween(today, gp.targetDate);
          if (left < 0) { r.state = 'overdue'; r.detail = 'termín cíle uplynul ' + NT.fmtDate(gp.targetDate); }
          else if (left <= 14) { r.state = 'current'; r.detail = 'termín cíle ' + NT.fmtDate(gp.targetDate); }
          else r.detail = 'termín cíle ' + NT.fmtDate(gp.targetDate);
        }
        return;
      }
      if (r.state === 'todo' && !found && r.key !== 'checkup') { r.state = 'current'; found = true; }
      else if (r.state === 'current' || r.state === 'overdue') found = true;
    });
    const done = out.filter((r) => r.state === 'done').length;
    const total = out.length;
    // nejdůležitější další krok
    let next = null;
    const prio = out.filter((r) => r.state === 'overdue')[0] || out.filter((r) => r.state === 'current')[0];
    if (prio) {
      const g = NT.JOURNEY_GATES.find((x) => x.key === prio.key);
      next = { gate: prio.key, level: prio.state === 'overdue' ? 'bad' : 'info', text: prio.key === 'checkup' ? (prio.state === 'overdue' ? 'Kontrola je po termínu, ' + prio.detail : 'Kontrola ' + prio.detail) : prio.key === 'eval' ? 'Vyhodnocení cíle, ' + prio.detail : g.todo };
    }
    return { gates: out, done, total, pct: Math.round((done / total) * 100), next, checkup };
  };

  /** co by měl terapeut u klienta řešit (seřazeno podle důležitosti) */
  NT.clientAgenda = function (client, ctx) {
    ctx = ctx || {};
    const today = ctx.today || NT.today();
    const items = [];
    const A = (level, kind, text) => items.push({ level, kind, text });
    const js = NT.journeyStatus(client, ctx);
    if (js.next) A(js.next.level === 'bad' ? 'bad' : 'info', js.next.gate, js.next.text);
    const sum = ctx.summary;
    if (sum && sum.last && js.gates.find((g) => g.key === 'session').state === 'done') {
      const age = NT.daysBetween(sum.last.date, today);
      if (age > 14) A('warn', 'weight', 'Hmotnost nebyla měřena ' + age + ' ' + NT.plural(age, 'den', 'dny', 'dní') + '.');
    }
    if (sum) sum.concerns.filter((c) => c.level === 'warn').forEach((c) => A('warn', 'track', c.text));
    if (ctx.needs && ctx.needs.ok) ctx.needs.warnings.filter((w) => w.level === 'crit').forEach((w) => A('bad', 'needs', w.text));
    const gp = client && client.goalPlan;
    if (gp && gp.status === 'approved' && ctx.assessment && ctx.assessment.progress && ctx.assessment.progress.state === 'behind') A('warn', 'goal', 'Cíl „' + NT.fmt(gp.startWeight, 1) + ' → ' + NT.fmt(gp.targetWeight, 1) + ' kg“ je pozadu za plánem.');
    if (ctx.plans && ctx.catCtx) {
      let hard = 0;
      ctx.plans.forEach((p) => { hard += NT.planAlerts(p, client, ctx.catCtx).filter((a) => a.hard).length; });
      if (hard) A('bad', 'plan', 'V jídelníčku je ' + hard + ' ' + NT.plural(hard, 'položka s alergenem klienta', 'položky s alergenem klienta', 'položek s alergenem klienta') + '.');
    }
    const rank = { bad: 0, warn: 1, info: 2 };
    items.sort((a, b) => rank[a.level] - rank[b.level]);
    return items;
  };

  // ---------------------------------------------------------------- návrh jídelníčku
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** které dny jsou tréninkové (rovnoměrně rozprostřené v týdnu) */
  NT.defaultDayTypes = function (n, tDays) {
    const out = [];
    const t = NT.clamp(Math.round(tDays || 0), 0, 7);
    for (let i = 0; i < n; i++) {
      const pos = i % 7;
      out.push(t > 0 && Math.floor(((pos + 1) * t) / 7) > Math.floor((pos * t) / 7) ? 'training' : 'rest');
    }
    return out;
  };
  const COMPLEMENT_CATS = {
    breakfast: ['ovoce', 'mlecne', 'orechy', 'pecivo'], snack: ['ovoce', 'mlecne', 'orechy'], pre: ['ovoce', 'pecivo', 'priloha'], post: ['ovoce', 'mlecne'],
    lunch: ['zelenina', 'priloha', 'pecivo', 'ovoce'], dinner: ['zelenina', 'priloha', 'pecivo']
  };

  /**
   * opts = {client, needs, foods, recipes, ctx, days, preset, mealNames, dayTypes, seed, variety}
   * foods = pool běžných potravin (bez NutriDatabáze), recipes = všechny viditelné recepty.
   */
  NT.generatePlan = function (opts) {
    const client = opts.client || {};
    const ctx = opts.ctx;
    const rnd = rng(opts.seed || 1);
    const nDays = NT.clamp(Math.round(opts.days || 7), 1, 14);
    const preset = NT.MEAL_PRESETS[opts.preset] ? opts.preset : 'five';
    const needs = opts.needs && opts.needs.ok ? opts.needs : null;
    const notes = [];
    if (!needs) notes.push('Chybí údaje pro výpočet potřeb, proto návrh počítá s orientačními 2 000 kcal.');
    const dayTypes = opts.dayTypes || NT.defaultDayTypes(nDays, needs ? needs.tDays : 0);
    const targetOf = (dt) => {
      const t = needs ? (dt === 'training' ? needs.training : needs.rest) : { kcal: 2000, protein: 100, fat: 65, carbs: 250, fiber: 25, salt: 5, satFat: 22 };
      return t;
    };
    const ca = new Set(client.allergens || []);
    const block = NT.DIET_BLOCK[client.diet || 'all'] || [];
    const dis = NT.parseList(client.dislikes);
    // suché suroviny (rýže, těstoviny) nechceme jako samostatné položky, filtruje je dry()
    const pool = (opts.foods || []).filter((f) => !f.hidden && f.kcal != null && f.protein != null && f.fat != null && f.carbs != null && NT.isCommonFood(f)
      && !/cibul|česnek|křen|zázvor|chilli|hummus|bílek|smetana|máslo|parmaz/i.test(f.name)
      && !(f.allergens || []).some((a) => ca.has(a)) && block.indexOf(f.cat) < 0 && !dis.some((t) => NT.norm(f.name).indexOf(t) >= 0));
    const dry = (f) => /\((suchá|suché|suchý)\)/.test(f.name);

    // recepty
    const rcCache = new Map();
    const recipes = (opts.recipes || []).filter((r) => {
      if (r.hidden) return false;
      const rc = NT.recipeCalc(r, ctx);
      if (rc.unknown.length || !(rc.per.kcal > 0)) return false;
      if (rc.allergens.some((a) => ca.has(a))) return false;
      const fs = (r.ingredients || []).map((i) => ctx.foods.get(i.foodId)).filter(Boolean);
      if (fs.some((f) => block.indexOf(f.cat) >= 0)) return false;
      if (dis.some((t) => NT.norm(r.name).indexOf(t) >= 0 || fs.some((f) => NT.norm(f.name).indexOf(t) >= 0))) return false;
      // hlavní bílkovinný zdroj a hlavní příloha pro hodnocení pestrosti
      let mainP = null, mainPv = 0, mainC = null, mainCv = 0;
      (r.ingredients || []).forEach((i) => {
        const f = ctx.foods.get(i.foodId); if (!f) return;
        const n = NT.nutr(f, i.grams).n;
        if (n.protein > mainPv && ['maso', 'ryby', 'vejce', 'luskoviny', 'mlecne', 'orechy'].indexOf(f.cat) >= 0) { mainPv = n.protein; mainP = f.id; }
        if (n.carbs > mainCv && ['priloha', 'pecivo', 'ovoce'].indexOf(f.cat) >= 0) { mainCv = n.carbs; mainC = f.id; }
      });
      rcCache.set(r.id, { rc, mainP, mainC, labels: NT.normMealTypes(r.mealTypes || []) });
      return true;
    });

    const used = { recipe: {}, food: {}, mainP: {}, mainC: {}, dishes: [] };
    const recentDays = []; // pro každý den množina {recipe, mainP}
    const days = [];
    let composedCount = 0;
    const emptyMeals = [];
    const dayNames = nDays === 7 ? NT.WEEKDAYS : null;
    const defFoodCats = (kind) => COMPLEMENT_CATS[kind] || ['ovoce'];

    const pickRecipe = (kind, T, dayCtx) => {
      const labels = KIND_LABELS[kind] || ['Svačina'];
      let cands = recipes.filter((r) => rcCache.get(r.id).labels.some((l) => labels.indexOf(l) >= 0));
      if (kind === 'lunch' || kind === 'dinner') cands = cands.filter((r) => rcCache.get(r.id).labels.indexOf('Nápoj') < 0 || rcCache.get(r.id).rc.per.kcal * 3 >= T);
      const scored = [];
      cands.forEach((r) => {
        const info = rcCache.get(r.id);
        const k = info.rc.per.kcal;
        if (!(k * (info.labels.indexOf('Nápoj') >= 0 ? 1 : 3) >= T * 0.6)) return;
        let bestS = 1, bestErr = Infinity;
        const maxS = info.labels.indexOf('Nápoj') >= 0 ? 1 : 3;
        for (let s = 0.5; s <= maxS; s += 0.5) { const e = Math.abs(s * k - T); if (e < bestErr) { bestErr = e; bestS = s; } }
        const fitErr = bestErr / T;
        let score = fitErr * 100;
        const n = used.recipe[r.id] || 0;
        score += n * 40;
        if (dayCtx.recipes.has(r.id)) score += 300;
        if (recentDays.slice(-2).some((d) => d.recipes.has(r.id))) score += 120;
        if (info.mainP) {
          score += (used.mainP[info.mainP] || 0) * 9;
          if (dayCtx.mainP.has(info.mainP)) score += 35;
          if (recentDays.slice(-2).some((d) => d.mainP.has(info.mainP))) score += 18;
        }
        if (info.mainC) score += (used.mainC[info.mainC] || 0) * 4;
        score += rnd() * 6;
        scored.push({ r, info, s: bestS, k, score });
      });
      scored.sort((a, b) => a.score - b.score);
      return scored[0] || null;
    };

    const poolFor = (kind) => {
      const cats = defFoodCats(kind);
      return pool.filter((f) => cats.indexOf(f.cat) >= 0 && !dry(f) && (f.kcal >= 5 || f.cat === 'zelenina') && (f.cat !== 'mlecne' || (f.protein >= 4 && f.kcal <= 200)));
    };

    /** doplnění chybějící energie jídla jednou až dvěma potravinami */
    const complement = (items, kind, T, share, dayT) => {
      for (let round = 0; round < 2; round++) {
        const have = NT.zero();
        items.forEach((it) => NT.addTo(have, NT.itemCalc(it, ctx).n));
        const gap = T - have.kcal;
        if (gap < Math.max(60, T * 0.12)) break;
        const rem = { kcal: gap, protein: Math.max(0, dayT.protein * share - have.protein), fat: Math.max(0, dayT.fat * share - have.fat), carbs: Math.max(0, dayT.carbs * share - have.carbs) };
        const allowed = new Set(poolFor(kind).map((f) => f.id));
        let sug = NT.suggestFill(rem, pool.filter((f) => allowed.has(f.id)), client, { limit: 10, includeAll: false });
        if (!sug.length) sug = NT.suggestFill(rem, pool.filter((f) => allowed.has(f.id)), client, { limit: 10, focus: 'carbs' });
        if (!sug.length) break;
        sug = sug.map((s) => Object.assign({ pen: s.score + (used.food[s.food.id] || 0) * 10 + rnd() * 8 }, s)).sort((a, b) => a.pen - b.pen);
        const c = sug[0];
        // nepřidávat to, co už v jídle je
        if (items.some((it) => it.type === 'food' && it.refId === c.food.id)) break;
        const g = NT.clamp(Math.min(c.grams, (gap / Math.max(c.food.kcal, 1)) * 100 * 1.0), 10, 400);
        items.push(NT.newItem('food', c.food.id, NT.niceGrams(g)));
        used.food[c.food.id] = (used.food[c.food.id] || 0) + 1;
      }
    };

    /**
     * poskládané jídlo z potravin (záloha, když chybí vhodný recept).
     * Role: base = zdroj sacharidů, prot = bílkovina, plus = ovoce/zelenina, fat = ořechy. Množství se dolaďují v rozumných mezích.
     */
    const buildComposed = (kind, T, dayCtx) => {
      const byCat = (cats, extra) => pool.filter((f) => cats.indexOf(f.cat) >= 0 && f.kcal >= 10 && (!extra || extra(f)));
      const choose = (list) => {
        if (!list.length) return null;
        const sc = list.map((f) => ({ f, s: (used.food[f.id] || 0) * 10 + (dayCtx.foods.has(f.id) ? 40 : 0) + rnd() * 12 })).sort((a, b) => a.s - b.s);
        return sc[0].f;
      };
      const parts = [];
      const add = (f, role, grams, minF, maxF) => { if (f) parts.push({ f, role, def: grams, g: grams, minF, maxF }); };
      const cereal = (f) => /ovesn|jáhl|pohank|chléb|rohlík|tortilla|quinoa/i.test(f.name) || f.cat === 'pecivo';
      const lunchLike = kind === 'lunch' || kind === 'dinner';
      if (lunchLike) {
        const prot = choose(byCat(['maso', 'ryby', 'vejce', 'luskoviny'], (f) => f.protein >= (f.cat === 'luskoviny' ? 6 : 8) && !dry(f)));
        add(prot, 'prot', prot && prot.cat === 'vejce' ? 150 : prot && prot.cat === 'luskoviny' && !/tofu/i.test(prot.name) ? 200 : 140, 0.6, 1.8);
        const side = choose(byCat(['priloha', 'pecivo'], (f) => !dry(f) && f.carbs >= 15 && f.protein < 14 && !/ovesn/i.test(f.name) && (kind === 'dinner' || f.cat !== 'pecivo')));
        add(side, 'base', side && side.cat === 'pecivo' ? 70 : 180, 0.4, 2);
        add(choose(byCat(['zelenina'], (f) => !dry(f))), 'plus', 150, 0.8, 2.2);
      } else {
        const breakfastLike = kind === 'breakfast';
        const protPool = byCat(['mlecne'], (f) => f.protein >= 4 && f.kcal <= 200 && !dry(f))
          .concat(breakfastLike ? byCat(['vejce'], (f) => !dry(f)).concat(byCat(['napoje'], (f) => /sójov/i.test(f.name)), byCat(['luskoviny'], (f) => /tofu/i.test(f.name))) : []);
        const prot = choose(protPool);
        const soy = prot && prot.cat === 'napoje';
        add(prot, 'prot', soy ? 250 : prot && prot.cat === 'vejce' ? 120 : prot && prot.cat === 'luskoviny' ? 100 : 150, 0.6, 1.6);
        add(choose(byCat(['ovoce'], (f) => f.kcal <= 120)), 'plus', 120, 0.7, 2);
        if (breakfastLike) {
          const c = choose(byCat(['pecivo', 'priloha'], (f) => cereal(f) && f.carbs >= 15 && f.protein < 16));
          add(c, 'base', c && /ovesn|jáhl|pohank|quinoa/i.test(c.name) ? 50 : 70, 0.5, 2);
        }
        const nut = choose(byCat(['orechy'], (f) => f.kcal > 400));
        add(nut, 'fat', prot ? 20 : 30, 0.5, prot ? 1.5 : 2.5);
      }
      if (!parts.length) return null;
      const kc = () => parts.reduce((a, x) => a + NT.nutr(x.f, x.g).n.kcal, 0);
      const order = ['base', 'prot', 'fat', 'plus'];
      for (let it = 0; it < 14; it++) {
        const err = T - kc();
        if (Math.abs(err) <= T * 0.06) break;
        let moved = false;
        for (const role of order) {
          const x = parts.find((q) => q.role === role);
          if (!x || !(x.f.kcal > 0)) continue;
          const want = x.g + (err / x.f.kcal) * 100 * 0.6;
          const lo = x.def * x.minF, hi = x.def * x.maxF;
          const ng = NT.niceGrams(NT.clamp(want, lo, hi));
          if (ng !== x.g) { x.g = ng; moved = true; break; }
        }
        if (!moved) break;
      }
      return { items: parts.map((x) => NT.newItem('food', x.f.id, x.g)), foods: parts.map((x) => x.f.id) };
    };

    for (let di = 0; di < nDays; di++) {
      const dt = dayTypes[di] === 'training' ? 'training' : 'rest';
      const dayT = targetOf(dt);
      const names = opts.mealNames && opts.mealNames.length ? opts.mealNames.map((n, i) => [n, (NT.MEAL_PRESETS[preset][i] || [])[1] || '']) : NT.MEAL_PRESETS[preset];
      const day = { id: NT.uid('d'), name: dayNames ? dayNames[di] : 'Den ' + (di + 1), dayType: dt, meals: names.map(([n, t]) => NT.newMeal(n, t)) };
      const shares = NT.mealShares(day.meals);
      const dayCtx = { recipes: new Set(), mainP: new Set(), foods: new Set() };
      day.meals.forEach((meal, mi) => {
        const sh = shares[mi];
        const T = dayT.kcal * sh.share;
        let pick = pickRecipe(sh.kind, T, dayCtx);
        // když je pro druh jídla málo čerstvých receptů, zkusíme poskládané jídlo z potravin
        let comp = null;
        const fewFresh = !pick || pick.score > 55;
        if (fewFresh) {
          comp = buildComposed(sh.kind, T, dayCtx);
          if (comp && pick && pick.score <= 45 + 12) comp = null;
        }
        let items;
        if (pick && !comp) {
          items = [NT.newItem('recipe', pick.r.id, pick.s)];
          used.recipe[pick.r.id] = (used.recipe[pick.r.id] || 0) + 1;
          dayCtx.recipes.add(pick.r.id);
          if (pick.info.mainP) { used.mainP[pick.info.mainP] = (used.mainP[pick.info.mainP] || 0) + 1; dayCtx.mainP.add(pick.info.mainP); }
          if (pick.info.mainC) used.mainC[pick.info.mainC] = (used.mainC[pick.info.mainC] || 0) + 1;
          used.dishes.push('r:' + pick.r.id);
          complement(items, sh.kind, T, sh.share, dayT);
        } else if (comp) {
          items = comp.items;
          comp.foods.forEach((id) => { used.food[id] = (used.food[id] || 0) + 1; dayCtx.foods.add(id); });
          used.dishes.push('f:' + comp.foods[0]);
          composedCount++;
        } else {
          items = [];
          emptyMeals.push(day.name + ', ' + sh.name);
        }
        meal.items = items;
      });
      // doladění celého dne na cílovou energii
      const kcalOf = () => NT.dayTotals(day, ctx).total.kcal;
      for (let step = 0; step < 8; step++) {
        const total = kcalOf();
        const err = total - dayT.kcal;
        if (Math.abs(err) <= dayT.kcal * 0.03) break;
        let best = null;
        day.meals.forEach((m) => m.items.forEach((it) => {
          const c = NT.itemCalc(it, ctx);
          if (!c.ok || !(c.n.kcal > 0)) return;
          let cand;
          if (it.type === 'recipe') {
            const dir = err > 0 ? -0.5 : 0.5;
            const s = it.servings + dir;
            if (s < 0.5 || s > 3.5) return;
            cand = { it, patch: { servings: s }, delta: (c.n.kcal / it.servings) * dir };
          } else {
            const g = NT.niceGrams(it.grams * (err > 0 ? 0.85 : 1.15));
            if (g === it.grams || g < 5 || g > 600) return;
            cand = { it, patch: { grams: g }, delta: (c.n.kcal / it.grams) * (g - it.grams) };
          }
          cand.after = Math.abs(err + cand.delta);
          if (!best || cand.after < best.after) best = cand;
        }));
        if (!best || best.after >= Math.abs(err)) break;
        Object.assign(best.it, best.patch);
      }
      recentDays.push({ recipes: dayCtx.recipes, mainP: dayCtx.mainP });
      days.push(day);
    }

    // souhrn pestrosti
    const distinct = new Set(used.dishes).size;
    const slots = used.dishes.length || 1;
    const repeats = [];
    const dishCount = {};
    used.dishes.forEach((k) => { dishCount[k] = (dishCount[k] || 0) + 1; });
    Object.keys(dishCount).forEach((k) => {
      if (dishCount[k] < 2) return;
      const id = k.slice(2);
      const name = k.charAt(0) === 'r' ? (ctx.recipes.get(id) || {}).name : ((ctx.foods.get(id) || {}).name || id) + ' (poskládané jídlo)';
      repeats.push({ name: name || id, count: dishCount[k] });
    });
    repeats.sort((a, b) => b.count - a.count);
    const proteinSources = Object.keys(used.mainP).length;
    const stats = {
      slots, distinct, repeats, proteinSources, recipeCount: recipes.length,
      score: Math.round((distinct / slots) * 100),
      perDay: days.map((d) => { const t = NT.dayTotals(d, ctx).total; const tg = targetOf(d.dayType); return { name: d.name, kcal: t.kcal, target: tg.kcal, protein: t.protein, pTarget: tg.protein, verdict: NT.dayEnergyVerdict(t.kcal, tg.kcal) }; })
    };
    if (composedCount) notes.push(composedCount + ' ' + NT.plural(composedCount, 'jídlo je poskládané', 'jídla jsou poskládaná', 'jídel je poskládaných') + ' z jednotlivých potravin, protože pro ně chybí dost vhodných receptů. Zkontroluj je a případně nahraď vlastním receptem.');
    if (emptyMeals.length) notes.push('Nic se nepodařilo navrhnout pro: ' + emptyMeals.slice(0, 4).join('; ') + (emptyMeals.length > 4 ? ' a další' : '') + '. Po omezeních klienta zbývá málo vhodných potravin.');
    if (stats.score < 60 && recipes.length >= 6) notes.push('Pestrost je omezená počtem vhodných receptů. Přidej další recepty pro tohoto klienta.');
    if (recipes.length < 6) notes.push('Pro tohoto klienta je k dispozici málo receptů (' + recipes.length + '). Přidej další nebo uprav omezení, aby byl jídelníček pestřejší.');
    return { days, stats, notes };
  };
})(typeof window !== 'undefined' ? window : globalThis);
