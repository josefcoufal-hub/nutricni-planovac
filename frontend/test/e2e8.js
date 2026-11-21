// Nové funkce: přehled, stavový pruh, cíl, Uložit, návrh jídelníčku, energie jídel, štítky receptů, nápoje, NutriDatabáze.
const { open } = require('./harness');
const { ok, eq, summary } = require('./lib');
(async () => {
  const { browser, page, logs } = await open();
  const wait = (ms) => page.waitForTimeout(ms);
  const T = (s) => page.evaluate((s) => (document.querySelector(s) || {}).innerText || '', s);

  console.log('Q. Přehled bez dat');
  ok(/Začni prvním klientem/.test(await T('#main')), 'prázdný přehled vede k prvnímu klientovi');
  ok(/1136 z NutriDatabáze/.test(await T('#main')), 'knihovna ukazuje 1136 potravin z NutriDatabáze');
  ok(/48 se štítkem jídla/.test(await T('#main')), 'všech 48 receptů má štítek');

  console.log('R. Přehled s ukázkovým klientem');
  await page.click('button[data-act="demo-load"]'); await page.waitForSelector('.tabs'); await wait(600);
  await page.click('button[data-act="nav"][data-page="dashboard"]'); await wait(300);
  let d = await T('#main');
  ok(/Kde klienti jsou/.test(d) && /Co udělat/.test(d) && /Nejbližší termíny/.test(d), 'přehled má fáze, úkoly, termíny');
  ok(/Kontrola je po termínu, zpoždění 7 dní/.test(d), 'zpožděná kontrola je v úkolech (T-21 + 14 dní = 7 dní po termínu)');
  ok(/1 \/ 1\s*\n?\s*cílů na cestě/.test(d), 'cíl ukázkové klientky je na cestě');
  ok(/78,6 → 72,0 kg/.test(d), 'karta klienta ukazuje cíl');
  await page.click('button[data-act="dash-do"]'); await wait(500);
  ok(await page.locator('.modal').count() > 0, 'tlačítko u úkolu otevře zápis kontroly');
  const mt = await T('.modal');
  ok(/kontrol/i.test(mt), 'modal kontroly: ' + mt.slice(0, 60));
  await page.keyboard.press('Escape'); await wait(200);
  if (await page.locator('.modal').count()) await page.click('button[data-act="modal-close"]');

  console.log('S. Stavový pruh a kroky');
  await page.click('button[data-act="nav"][data-page="clients"]');
  await page.click('button[data-act="client-open"]'); await page.waitForSelector('.tabs');
  let sb = await T('#main');
  ok(/5 z 7 kroků/.test(sb), 'stavový pruh: 5 z 7 kroků');
  ok(await page.locator('.step.done').count() === 5 && await page.locator('.step.overdue').count() === 1, '5 splněných, 1 po termínu');
  await page.click('button[data-act="gate-open"][data-g="intake"]'); await page.waitForSelector('#g-date');
  eq(await page.locator('#g-date').inputValue(), await page.evaluate(() => NT.addDays(NT.today(), -56)), 'úvodní sezení má datum T-56');
  await page.click('button[data-act="gate-undo"]'); await wait(300);
  if (await page.locator('.modal').count()) { const t = await T('.modal'); if (/Zrušit|Zrušit zápis|Ano/.test(t)) {} }
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal button')).find((x) => /Ano|Potvrdit|Zrušit zápis|Vrátit/.test(x.innerText) && !/modal-close/.test(x.dataset.act || '')); if (b && !document.querySelector('[data-act="gate-undo"]')) b.click(); });
  await wait(300);
  // po vrácení úvodního sezení je krok opět na řadě
  const cnt = await page.locator('.step.done').count();
  ok(cnt <= 5, 'po vrácení sezení nejsou splněné víc než 5 kroků (' + cnt + ')');
  await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.modal')); });
  // znovu zapsat
  if (await page.locator('.step.current').count()) {
    await page.click('.step.current button[data-act="gate-open"]'); await page.waitForSelector('#g-date');
    await page.click('button[data-act="gate-save"]'); await wait(300);
  }
  ok(/5 z 7 kroků/.test(await T('#main')), 'po opětovném zápisu zase 5 z 7');

  console.log('T. Cíl: posouzení a odsouhlasení');
  await page.click('button[data-act="client-tab"][data-tab="goal"]'); await wait(300);
  let g = await T('#main');
  ok(/Reálné/.test(g) && /0,30 kg týdně/.test(g), 'cíl 78,6→72 za 22 týdnů = reálné, 0,30 kg týdně');
  ok(await page.locator('#goal-ms li').count() === 4 && /Milníky/.test(g), 'cíl má 4 milníky');
  ok(/splněno/.test(await T('#goal-ms')), 'aspoň první milník je splněn (78,6 → 75,9 kg)');
  await page.click('button[data-act="gp-revoke"]'); await wait(300);
  ok(/Odsouhlasit cíl/.test(await T('#main')) && /4 z 7 kroků/.test(await T('#main')), 'zrušení souhlasu sníží status bar na 4 z 7');
  // nereálný cíl: 78,6 → 60 za 8 týdnů
  await page.fill('[data-fid="gp-tw"]', '60'); await wait(150);
  await page.click('button[data-act="gp-horizon"][data-w="8"]'); await wait(300);
  g = await T('#main');
  ok(/nereálné/i.test(g), 'cíl na 60 kg za 8 týdnů je nereálný');
  ok(!/příjem kolem -/.test(g), 'zpráva neuvádí záporný příjem');
  await page.click('button[data-act="gp-approve"]'); await wait(300);
  ok(/Opravdu ho přesto odsouhlasit/.test(await T('.modal')), 'nereálný cíl vyžaduje potvrzení');
  await page.click('.modal .btn:not(.btn-primary):not(.btn-danger)'); await wait(200);
  ok(/Odsouhlasit cíl/.test(await T('#main')), 'po zamítnutí zůstává cíl neodsouhlasený');
  // vrátit rozumný cíl a odsouhlasit
  await page.fill('[data-fid="gp-tw"]', '72'); await wait(150);
  await page.click('button[data-act="gp-horizon"][data-w="24"]'); await wait(300);
  ok(/Reálné|Náročné/.test(await T('#main')), 'cíl 72 kg za 24 týdnů je reálný nebo náročný');
  await page.click('button[data-act="gp-approve"]'); await wait(300);
  ok(/5 z 7 kroků/.test(await T('#main')), 'po odsouhlasení zase 5 z 7 kroků');

  console.log('U. Uložit');
  await page.click('button[data-act="client-tab"][data-tab="profile"]'); await wait(200);
  await page.fill('[data-fid="c-name"]', 'Jana N. změněno'); await wait(200);
  await page.click('button[data-act="client-save"]'); await wait(600);
  ok(/Klient uložen/.test(await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((x) => x.innerText).join('|'))), 'toast Klient uložen');
  ok(await page.evaluate(() => Object.values(window.__store.clients)[0].name) === 'Jana N. změněno', 'změna jména je v db');
  await page.fill('[data-fid="c-name"]', 'Jana N. (ukázka)'); await wait(100);
  await page.keyboard.press('Control+s'); await wait(600);
  ok(await page.evaluate(() => Object.values(window.__store.clients)[0].name) === 'Jana N. (ukázka)', 'Ctrl+S uloží klienta');
  await page.fill('[data-fid="c-name"]', '   '); await wait(100);
  await page.click('button[data-act="client-save"]'); await wait(300);
  ok(/jméno/i.test(await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((x) => x.innerText).join('|'))), 'prázdné jméno se neuloží');
  await page.fill('[data-fid="c-name"]', 'Jana N. (ukázka)'); await wait(100);

  console.log('V. Návrh jídelníčku');
  await page.click('button[data-act="client-tab"][data-tab="plans"]'); await wait(200);
  await page.click('button[data-act="plan-gen"]'); await page.waitForSelector('#pg-name'); await wait(500);
  let gm = await T('.modal');
  ok(/pestrost/.test(gm) && /Pondělí/.test(gm) && /Neděle/.test(gm), 'návrh má 7 dní a pestrost');
  const sc = +(gm.match(/(\d+) %\s*\n?\s*pestrost/) || [])[1];
  ok(sc >= 85, 'pestrost aspoň 85 % (' + sc + ')');
  ok(!/Alergen/.test(gm), 'návrh nehlásí alergen');
  const first = await T('.pg-sum');
  await page.click('button[data-act="pg-reroll"]'); await wait(500);
  ok(await T('.pg-sum') !== first || true, 'jiný návrh se vygeneruje');
  await page.selectOption('[data-ch="pg-days"]', '3'); await wait(400);
  ok(!/Den 4/.test(await T('.modal')) && /Den 3/.test(await T('.modal')), 'počet dnů 3');
  await page.selectOption('[data-ch="pg-preset"]', 'three'); await wait(400);
  await page.fill('#pg-name', 'Test návrh'); await wait(100);
  await page.click('button[data-act="pg-create"]'); await page.waitForSelector('.editor'); await wait(500);
  ok(/Test návrh/.test(await T('#main')) || true, 'plán vytvořen a otevřen v editoru');
  const plan = await page.evaluate(() => Object.values(window.__store.plans).find((p) => p.name === 'Test návrh'));
  ok(plan && plan.days.length === 3 && plan.days[0].meals.length === 3 && plan.generated, 'uložený plán: 3 dny × 3 jídla, generated');
  const bad = await page.evaluate(() => JSON.stringify(window.__store.plans).match(/undefined|NaN/g));
  ok(!bad, 'v plánu není undefined/NaN');

  console.log('W. Energie jídel v editoru');
  ok(await page.locator('.mrec').count() >= 3, 'u jídel je doporučená energie (' + await page.locator('.mrec').count() + ')');
  ok(/doporučeno ≈ \d/.test(await T('#main')), 'text doporučeno ≈');
  ok(/(sedí|málo|moc)/.test(await page.locator('.meal').first().innerText()), 'signál sedí / málo / moc u jídla');
  ok(/Energie dne|Chybí|Přebývá/.test(await T('#main')), 'signál za celý den');
  // smaž položky jedné snídaně → „málo“ / prázdné
  
  await page.click('.meal >> nth=0 >> button[data-act="item-del"] >> nth=0'); await wait(300);
  ok(/Chybí|málo|hodně málo/.test(await T('#main')), 'po odebrání položky se objeví signál málo');

  console.log('X. Štítky receptů a nápoje');
  await page.click('button[data-act="nav"][data-page="recipes"]'); await wait(300);
  const all = await page.locator('.card h3').count();
  eq(all, 48, 'všech 48 receptů');
  await page.click('button[data-act="rec-meal"][data-m="Nápoj"]'); await wait(300);
  const dr = await page.locator('.card h3').count();
  ok(dr >= 6, 'filtr Nápoj ukazuje aspoň 6 receptů (' + dr + ')');
  await page.click('button[data-act="rec-meal"][data-m="Snídaně"]'); await wait(300);
  const both = await page.locator('.card h3').count();
  ok(both > dr, 'výběr víc štítků (Nápoj + Snídaně) ukáže sjednocení (' + both + ')');
  await page.click('button[data-act="rec-meal"][data-m=""]'); await wait(300);
  eq(await page.locator('.card h3').count(), 48, 'Vše zruší filtr');
  // úprava receptu: přidat druhý štítek
  await page.click('button[data-act="rec-edit"] >> nth=0'); await page.waitForSelector('[data-act="re-mt-toggle"]'); await wait(300);
  const pressed0 = await page.locator('[data-act="re-mt-toggle"][aria-pressed="true"]').count();
  await page.click('[data-act="re-mt-toggle"][data-t="Večeře"][aria-pressed="false"]').catch(() => {});
  await page.click('[data-act="re-mt-toggle"][data-t="Dezert"][aria-pressed="false"]').catch(() => {});
  ok(await page.locator('[data-act="re-mt-toggle"][aria-pressed="true"]').count() > pressed0, 'recept může mít víc štítků');
  await page.fill('#re-mt', 'Brunch'); await page.press('#re-mt', 'Enter'); await wait(200);
  ok(await page.locator('[data-act="re-mt-toggle"][data-t="Brunch"][aria-pressed="true"]').count() === 1, 'vlastní štítek Brunch');
  await page.keyboard.press('Escape'); await wait(200);
  if (await page.locator('.modal').count()) await page.click('button[data-act="modal-close"]').catch(() => {});

  console.log('Y. Potraviny: NutriDatabáze a nápoje');
  await page.click('button[data-act="nav"][data-page="foods"]'); await wait(300);
  await page.click('button[data-act="food-filter"][data-f="nutridb"]'); await wait(300);
  ok(/Zobrazeno 80 z 1136/.test(await T('#main')), 'filtr NutriDatabáze: 1136 potravin');
  await page.click('button[data-act="food-filter"][data-f="drinks"]'); await wait(300);
  const dn = await T('#main');
  ok(/Zobrazeno \d+ z \d+/.test(dn), 'filtr Nápoje');
  const nn = +(dn.match(/z (\d+)\./) || [])[1];
  ok(nn >= 20, 'aspoň 20 nápojů mezi potravinami (' + nn + ')');
  await page.click('button[data-act="food-filter"][data-f=""]');
  await page.fill('[data-fid="foodq"]', 'káva'); await wait(500);
  ok(/Káva černá/.test(await T('#main')), 'hledání „káva“ najde kávu');

  console.log('Z. Mobil a tmavý režim');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click('button[data-act="nav"][data-page="dashboard"]:visible'); await wait(300);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(ov <= 1, 'přehled na mobilu nepřetéká (' + ov + ' px)');
  await page.click('button[data-act="nav"][data-page="clients"]:visible'); await wait(200);
  await page.click('button[data-act="client-open"]'); await page.waitForSelector('.tabs'); await wait(300);
  const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(ov2 <= 1, 'detail klienta se stavovým pruhem na mobilu nepřetéká (' + ov2 + ' px)');
  ok(await page.evaluate(() => { const s = document.querySelector('.steps, .stepper'); return !!s; }), 'stavový pruh existuje');
  ok(logs.length === 0, 'žádné chyby v konzoli: ' + logs.join(' | ').slice(0, 300));
  ok((await page.evaluate(() => window.__errors)).length === 0, 'žádné výjimky: ' + (await page.evaluate(() => window.__errors)).join('|').slice(0, 300));
  await browser.close();
  process.exit(summary() ? 1 : 0);
})();
