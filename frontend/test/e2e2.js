const { open } = require('./harness');
const { SP, ok, eq, summary } = require('./lib');
(async () => {
  const { browser, page, logs } = await open();
  const T = (s) => page.evaluate((s) => (document.querySelector(s) || {}).innerText || '', s);
  const wait = (ms) => page.waitForTimeout(ms);
  const toast = () => page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).join(' || '));
  const modalOpen = () => page.evaluate(() => !!document.querySelector('.modal'));

  console.log('A. Nový klient');
  await page.click('.main button[data-act="client-new"]');
  await page.waitForSelector('#nc-name');
  await page.click('button[data-act="client-create"]');
  ok(/Zadej jméno/.test(await toast()), 'prázdné jméno odmítnuto');
  await page.fill('#nc-name', 'Petr S.');
  await page.selectOption('#nc-sex', 'm');
  await page.fill('#nc-birth', '1988-03-02');
  await page.fill('#nc-h', '182');
  await page.fill('#nc-w', '92.5');
  await page.selectOption('#nc-goal', 'loss');
  await page.click('button[data-act="client-create"]');
  await page.waitForSelector('#needs-card');
  ok(!(await modalOpen()), 'modal zavřen');
  let nc = await T('#needs-card');
  // Mifflin male: 10*92.5 + 6.25*182 - 5*38 + 5  (věk 2026-1988 = 38, narozeniny 2.3. → 38)
  const bmr = 10 * 92.5 + 6.25 * 182 - 5 * 38 + 5;
  ok(nc.indexOf(String(Math.round(bmr))) >= 0, 'BMR ' + Math.round(bmr) + ' v kartě potřeb: ' + nc.slice(nc.indexOf('Bazální') - 20, nc.indexOf('Bazální') + 40));
  console.log('   BMR zobrazeno:', /(\d[\d\s ]*)\s*\n?\s*Bazální/.exec(nc.replace(/\t/g,' ')) );

  // změna pohlaví/výšky přepočítá
  await page.fill('input[data-in="c.heightCm"]', '190');
  await wait(100);
  nc = await T('#needs-card');
  const bmr2 = 10 * 92.5 + 6.25 * 190 - 5 * 38 + 5;
  ok(nc.indexOf(String(Math.round(bmr2))) >= 0, 'BMR po změně výšky ' + Math.round(bmr2));
  await page.fill('input[data-in="c.heightCm"]', '182');

  // alergen chip
  await page.click('button[data-act="c-allergen"][data-k="milk"]');
  eq(await page.getAttribute('button[data-act="c-allergen"][data-k="milk"]', 'aria-pressed'), 'true', 'alergen mléko');
  await page.fill('textarea[data-in="c.dislikes"]', 'houby, celer');

  console.log('B. Nový jídelník');
  await page.click('button[data-act="client-tab"][data-tab="plans"]');
  await page.click('button[data-act="plan-new"]');
  await page.waitForSelector('#np-name');
  await page.fill('#np-name', 'Test plán');
  await page.selectOption('#np-days', '3');
  await page.selectOption('#np-meals', 'four');
  await page.selectOption('#np-train', '1');
  await page.click('button[data-act="plan-create"]');
  await page.waitForSelector('.editor');
  eq(await page.locator('.daytab').count(), 3, '3 dny');
  eq(await page.locator('.meal').count(), 4, '4 jídla v dni');
  const types = await page.evaluate(() => Array.from(document.querySelectorAll('.daytab')).map((t) => t.innerText.replace(/\s+/g,' ')));
  console.log('   dny:', types);
  ok(/Odpočinkový den|Cíle dne/.test(await T('#panel')), 'panel');

  console.log('C. Přidání potravin přes výběr');
  await page.click('.meal:nth-of-type(1) button[data-act="pick-open"]:not([data-tab])');
  await page.waitForSelector('#pick-q');
  await page.fill('#pick-q', 'ovesn');
  await wait(100);
  ok((await T('#pick-results')).indexOf('Ovesné vločky') >= 0, 'hledání ovesných vloček');
  await page.click('.pick[data-act="pick-food"]');
  await page.fill('#pick-q', 'mléko');
  await wait(100);
  // mléko je alergen klienta
  const res = await T('#pick-results');
  ok(/Alergen: Mléko/.test(res), 'upozornění na alergen mléko v pickeru');
  await page.fill('#pick-q', 'vejce');
  await page.click('.pick[data-act="pick-food"]');
  const bsk = await T('#pick-basket');
  ok(/Výběr \(2\)/.test(bsk), 'košík má 2 položky: ' + bsk.slice(0, 80));
  await page.click('#pick-done');
  await wait(100);
  eq(await page.locator('.meal').first().locator('.item').count(), 2, '2 položky v 1. jídle');
  const sum1 = await T('.meal .meal-sum');
  console.log('   souhrn jídla:', sum1);
  // gramáže
  const g1 = await page.inputValue('.meal .item input[data-in="it-amt"]');
  eq(g1, '70', 'výchozí gramáž suchých vloček');
  await page.fill('.meal .item input[data-in="it-amt"]', '60');
  await wait(100);
  const k = await T('.meal .item [data-k^="ik-"]');
  // 372*0.6 = 223.2
  ok(/223/.test(k), 'kcal po změně na 60 g = 223: ' + k);
  ok(/\b2\d\d kcal|\d+ kcal/.test(await T('.meal .meal-sum')), 'souhrn jídla se aktualizoval');
  // fokus zůstal
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.in === 'it-amt'), 'fokus zůstal ve vstupu');

  console.log('D. Alergen v plánu');
  await page.click('.meal:nth-of-type(2) button[data-act="pick-open"]:not([data-tab])');
  await page.fill('#pick-q', 'mléko polotučné');
  await page.click('.pick[data-act="pick-food"]');
  await page.click('#pick-done');
  await wait(100);
  ok(/Alergen/.test(await T('#panel')), 'panel upozorňuje na alergen');
  ok(/Alergen/.test(await T('#ed-main')) || (await page.locator('.item.bad-item').count()) > 0, 'řádek označen');
  console.log('   ERR', await page.evaluate(() => window.__errors), logs);

  console.log('E. Náhrada');
  // vezmeme vejce
  const swapBtn = page.locator('button[data-act="item-swap"]').first();
  await swapBtn.click();
  await page.waitForSelector('.pick[data-act="swap-apply"]');
  const sw = await T('.modal-b');
  ok(sw.length > 50, 'náhrady existují');
  console.log('   náhrady:', sw.replace(/\n/g, ' | ').slice(0, 300));
  await page.click('button[data-act="swap-match"][data-k="protein"]');
  await page.click('.pick[data-act="swap-apply"]');
  ok(/Nahrazeno/.test(await toast()), 'náhrada použita');

  console.log('F. Co doplnit / Doladit');
  await page.click('button[data-act="assist-fill"]');
  await page.waitForSelector('.pick[data-act="fill-add"]');
  const fillTxt = await T('.modal-b');
  console.log('   doplnit:', fillTxt.replace(/\n/g, ' | ').slice(0, 260));
  await page.click('.pick[data-act="fill-add"]');
  await page.click('button[data-act="modal-close"]');
  const before = await T('#panel');
  await page.click('button[data-act="assist-fit"]');
  await page.waitForSelector('button[data-act="fit-apply"]');
  console.log('   doladit:', (await T('.modal-b')).replace(/\n/g, ' | ').slice(0, 300));
  await page.click('button[data-act="fit-apply"]');
  await wait(100);
  const afterT = await T('#panel');
  const m = /(\d[\d\s ]*)\s*\n?\/ (\d[\d\s ]*) kcal/.exec(afterT);
  console.log('   panel po doladění:', afterT.replace(/\n/g, ' | ').slice(0, 120));

  console.log('G. Šablony');
  await page.click('button[data-act="meal-tpl"]');
  await page.fill('#ts-name', 'Moje snídaně');
  await page.click('button[data-act="tpl-save"]');
  ok(/Šablona uložena/.test(await toast()), 'šablona uložena');
  await page.click('.meal:nth-of-type(3) button[data-act="pick-open"]:not([data-tab])');
  await page.click('button[data-act="pick-tab"][data-t="tpl"]');
  const tp = await T('#pick-results');
  ok(/Moje snídaně/.test(tp), 'šablona v pickeru');
  ok(/Ukázkov|Šablona|Oběd|Snídaně/.test(tp), 'ukázkové šablony');
  await page.click('.pick[data-act="pick-tpl"]');
  await page.click('#pick-done');
  ok((await page.locator('.meal').nth(2).locator('.item').count()) >= 1, 'položky ze šablony vloženy');

  console.log('H. Dny');
  await page.click('button[data-act="day-add"]');
  await page.click('button[data-act="day-create"]');
  eq(await page.locator('.daytab').count(), 4, '4 dny');
  await page.click('button[data-act="day-del"]');
  await page.click('button[data-act="confirm-yes"]').catch(() => {});
  await wait(100);
  eq(await page.locator('.daytab').count(), 3, 'den smazán');
  await page.click('.daytab >> nth=1');
  await page.click('button[data-act="day-dup"]');
  eq(await page.locator('.daytab').count(), 4, 'den duplikován');

  console.log('I. Přehled, Nákup, Výstup');
  await page.click('button[data-act="plan-tab"][data-tab="week"]');
  console.log('   týden:', (await T('#main')).replace(/\n/g, ' | ').slice(200, 700));
  await page.click('button[data-act="plan-tab"][data-tab="shop"]');
  const shop = await T('#main');
  ok(/Obiloviny|Vejce|Maso/.test(shop), 'nákupní seznam má skupiny');
  await page.fill('input[data-in="shop-mult"]', '2');
  await wait(600);
  console.log('   nákup ×2:', (await T('#main')).replace(/\n/g, ' | ').slice(150, 420));
  await page.click('button[data-act="plan-tab"][data-tab="out"]');
  await page.waitForSelector('#ho-preview');
  console.log('   kontrola:', (await T('#out-grid')).replace(/\n/g, ' | ').slice(0, 900));
  await page.screenshot({ path: SP + 'out1.png', fullPage: true });
  console.log('   ERR', await page.evaluate(() => window.__errors), logs);
  await browser.close();
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(2); });
