const { open } = require('./harness');
const { SP, ok, eq, summary } = require('./lib');
(async () => {
  const { browser, page, logs } = await open();
  const T = (s) => page.evaluate((s) => (document.querySelector(s) || {}).innerText || '', s);
  const wait = (ms) => page.waitForTimeout(ms);
  const toast = () => page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).join(' || '));
  await page.click('button[data-act="demo-load"]'); await page.waitForSelector('.tabs');
  await page.click('button[data-act="client-tab"][data-tab="plans"]');

  console.log('Q. Kopie plánu a mazání');
  await page.click('button[data-act="plan-new"]');
  await page.fill('#np-name', 'Kopie z ukázky');
  await page.selectOption('#np-from', { index: 1 });
  await page.click('button[data-act="plan-create"]');
  await page.waitForSelector('.editor');
  eq(await page.locator('.daytab').count(), 3, 'kopie má 3 dny');
  const ids = await page.evaluate(() => { const p = Object.values(window.__store.plans || {}); return p.length; });
  // nezávislost kopie
  await page.fill('.meal .item input[data-in="it-amt"]', '10');
  await page.click('button[data-act="plan-back"]');
  const cards = await page.locator('.card h3').allInnerTexts();
  console.log('   plány:', cards);
  eq(cards.length, 2, '2 plány');
  // otevři originál a zkontroluj, že se nezměnil
  const orig = page.locator('.card', { hasText: 'Redukce – ukázkový týden' });
  await orig.locator('button[data-act="plan-open"]').click();
  await page.waitForSelector('.editor');
  const g = await page.inputValue('.meal .item input[data-in="it-amt"]');
  ok(g !== '10', 'originál se po úpravě kopie nezměnil (první položka ' + g + ')');
  await page.click('button[data-act="plan-back"]');
  // duplikace a smazání
  await page.locator('.card', { hasText: 'Kopie z ukázky' }).locator('button[data-act="plan-del"]').click();
  await page.click('button[data-act="confirm-yes"]');
  eq(await page.locator('.card h3').count(), 1, 'kopie smazána');

  console.log('R. Šablona dne');
  await page.click('button[data-act="plan-open"]');
  await page.click('button[data-act="day-tpl"]');
  await page.fill('#ts-name', 'Můj klidový den');
  await page.click('button[data-act="tpl-save"]');
  await page.click('button[data-act="day-add"]');
  const opts = await page.locator('#da-src option').allInnerTexts();
  console.log('   zdroje:', opts);
  ok(opts.some((o) => /Můj klidový den/.test(o)) && opts.some((o) => /Šablona:/.test(o)), 'šablony dne v nabídce');
  await page.selectOption('#da-src', { label: 'Šablona: Můj klidový den' });
  await page.click('button[data-act="day-create"]');
  eq(await page.locator('.daytab').count(), 4, 'den ze šablony přidán');
  const kc = await page.locator('.daytab[aria-selected="true"] .k').innerText();
  const kc0 = await page.locator('.daytab').first().locator('.k').innerText();
  eq(kc, kc0, 'den ze šablony má stejné kcal jako originál');
  // klíčové: položky nové dny mají unikátní id
  const dup = await page.evaluate(() => { const ids = Array.from(document.querySelectorAll('[data-item]')).map((e) => e.dataset.item); return ids.length - new Set(ids).size; });
  eq(dup, 0, 'id položek jsou unikátní');
  // mazání položky + Vrátit
  const before = await page.locator('.item').count();
  await page.click('button[data-act="item-del"] >> nth=0');
  eq(await page.locator('.item').count(), before - 1, 'položka odebrána');
  await page.click('.toast button');
  eq(await page.locator('.item').count(), before, 'Vrátit obnoví položku');
  // posun
  const mi = page.locator('.meal').nth(2); const first = await mi.locator('.item .nm').first().innerText();
  await mi.locator('button[data-act="item-down"]').first().click();
  ok((await page.locator('.meal').nth(2).locator('.item .nm').first().innerText()) !== first, 'posun změnil pořadí');
  // jídlo duplikovat/smazat
  const nm = await page.locator('.meal').count();
  await page.click('button[data-act="meal-dup"] >> nth=0'); eq(await page.locator('.meal').count(), nm + 1, 'jídlo duplikováno');
  await page.click('button[data-act="meal-del"] >> nth=0'); await page.click('button[data-act="confirm-yes"]'); eq(await page.locator('.meal').count(), nm, 'jídlo smazáno');
  await page.click('button[data-act="meal-add"]'); eq(await page.locator('.meal').count(), nm + 1, 'jídlo přidáno');
  // typ dne
  await page.click('button[data-act="day-type"][data-t="training"]');
  ok(/Tréninkový den/.test(await T('#panel')), 'typ dne změněn, panel přepočten');
  // název dne bez ztráty fokusu
  await page.fill('input[data-in="day-name"]', 'Nový název');
  ok(/Nový název/.test(await T('.daytabs')), 'název dne v záložce');

  console.log('S. Prázdné stavy / okraje');
  await page.click('button[data-act="plan-tab"][data-tab="shop"]');
  await page.click('button[data-act="shop-copy"]'); await wait(100);
  await page.click('button[data-act="plan-back"]');
  await page.click('button[data-act="client-tab"][data-tab="profile"]');
  // klient bez dat: nový klient
  await page.click('button[data-act="nav"][data-page="clients"]');
  await page.click('.main button[data-act="client-new"]');
  await page.fill('#nc-name', 'Prázdný'); await page.click('button[data-act="client-create"]');
  await page.waitForSelector('#needs-card');
  ok(/Chybí|chybí/.test(await T('#needs-card')), 'chybějící údaje hlášeny');
  await page.click('button[data-act="client-tab"][data-tab="plans"]');
  await page.click('button[data-act="plan-new"]'); await page.click('button[data-act="plan-create"]');
  await page.waitForSelector('.editor');
  ok(/Bez cílů klienta|Nastavit potřeby/.test(await T('#panel')), 'panel bez cílů nabízí nastavení');
  ok(await page.locator('button[data-act="assist-fill"][disabled]').count() === 1, 'asistent vypnut bez cílů');
  await page.click('button[data-act="plan-tab"][data-tab="out"]');
  ok(/prázdný/.test(await T('#out-grid')), 'kontrola: prázdný jídelníček');
  await page.click('button[data-act="ho-pdf"]'); await page.waitForSelector('.modal');
  ok(/závažné problémy/.test(await T('.modal')), 'PDF prázdného plánu vyžaduje potvrzení');
  await page.click('button[data-act="confirm-yes"]'); await wait(500);
  ok(/Jídelníček je prázdný/.test(await T('.modal')) , 'PDF prázdného plánu hlásí chybu');
  await page.click('button[data-act="modal-close"]');
  // archivace + smazání klienta
  await page.click('button[data-act="plan-back"]');
  await page.click('button[data-act="client-archive"]');
  await page.click('button[data-act="nav"][data-page="clients"]');
  ok(!/Prázdný/.test(await T('#client-list')), 'archivovaný klient skryt');
  await page.check('input[data-ch="client-arch"]');
  ok(/Prázdný/.test(await T('#client-list')), 'archivovaný klient viditelný po zaškrtnutí');
  await page.click('button[data-act="client-open"]:has-text("Prázdný")');
  await page.click('button[data-act="client-delete"]'); await page.click('button[data-act="confirm-yes"]'); await wait(1200);
  const st = await page.evaluate(() => ({ c: Object.keys(window.__store.clients).length, p: Object.keys(window.__store.plans).length, t: Object.keys(window.__store.tracks).length }));
  eq(st.c, 1, 'smazán klient z db'); eq(st.p, 1, 'smazán i jeho plán'); 

  console.log('T. Chyba ukládání');
  await page.evaluate(() => { window.claude.use = window.claude.use; });
  // simulace: db set selže → přepíšeme prototyp přes store reference nelze; použijeme novou stránku s vadnou db
  await browser.close();
  const b2 = await open({ failWrites: true });
  await b2.page.evaluate(() => {});
  await b2.browser.close();
  console.log('   ERR', logs);
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(2); });
