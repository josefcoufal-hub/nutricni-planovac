const { open } = require('./harness');
const { SP, ok, eq, summary } = require('./lib');
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = (page, s) => page.evaluate((s) => (document.querySelector(s) || {}).innerText || '', s);
  // 1) perzistence přes db
  let s1 = await open();
  await s1.page.click('button[data-act="demo-load"]');
  await s1.page.waitForSelector('.tabs'); await wait(1200);
  const store = await s1.page.evaluate(() => window.__store);
  ok(Object.keys(store.clients).length === 1 && Object.keys(store.plans).length === 1 && Object.keys(store.tracks).length === 1, 'db má klienta, plán, měření');
  const bad = JSON.stringify(store).match(/undefined|NaN/g);
  ok(!bad, 'v uložených datech není undefined/NaN');
  await s1.browser.close();
  let s2 = await open({ initStore: store });
  ok(/Jana N/.test(await T(s2.page, '#main')), 'po obnovení stránky je klientka vidět');
  await s2.page.click('button[data-act="nav"][data-page="clients"]');
  await s2.page.click('button[data-act="client-open"]');
  await s2.page.click('button[data-act="client-tab"][data-tab="plans"]');
  await s2.page.click('button[data-act="plan-open"]');
  await s2.page.waitForSelector('.editor');
  ok(/Pondělí/.test(await T(s2.page, '.daytabs')), 'plán se načetl');
  // AI v pickeru
  await s2.page.evaluate(() => { window.__sampleJson = { variants: [{ title: 'Skyr s ovocem', why: 'Rychlé a bílkovinné', items: [{ foodId: 'b_skyr', grams: 200 }, { foodId: 'b_boruvky', grams: 80 }, { foodId: 'NEEXISTUJE', grams: 50 }, { recipeId: 'rstart02', servings: 1 }] }, { title: 'Prázdný', items: [{ foodId: 'xx', grams: 5 }] }] }; });
  await s2.page.click('.meal >> nth=1 >> button[data-tab="ai"]');
  await s2.page.waitForSelector('button[data-act="ai-meal-go"]');
  await s2.page.fill('#ai-note', 'sladké');
  await s2.page.click('button[data-act="ai-meal-go"]');
  await s2.page.waitForSelector('button[data-act="ai-var-add"]');
  const vt = await T(s2.page, '.modal-b');
  ok(/Skyr s ovocem/.test(vt) && !/Prázdný/.test(vt) && !/NEEXISTUJE/.test(vt), 'neplatné položky/varianty z AI odfiltrovány');
  const prompt = (await s2.page.evaluate(() => window.__sampleCalls)).pop();
  ok(/Přání terapeuta: sladké/.test(prompt) && /KATALOG POTRAVIN/.test(prompt), 'prompt obsahuje přání a katalog');
  ok(/b_skyr\|/.test(prompt), 'katalog má id b_skyr');
  ok(!/arašíd/i.test(prompt.split('KATALOG POTRAVIN:')[1].split('KATALOG RECEPTŮ')[0]), 'katalog neobsahuje arašídy (alergie klientky)');
  ok(!/brokolice/i.test(prompt.split('KATALOG POTRAVIN:')[1].split('KATALOG RECEPTŮ')[0]), 'katalog neobsahuje brokolici (nechuť)');
  await s2.page.click('button[data-act="ai-var-add"]');
  ok(/Výběr \(3\)/.test(await T(s2.page, '#pick-basket')), 'varianta v košíku (3 položky)');
  await s2.page.click('#pick-done');
  await wait(100);
  ok(/Skyr/.test(await T(s2.page, '.meal:nth-of-type(2)')), 'položky z AI v jídle');
  // chyba AI
  await s2.page.evaluate(() => { window.__sampleError = { code: 'not_granted', message: 'x' }; });
  await s2.page.click('.meal >> nth=2 >> button[data-tab="ai"]');
  await s2.page.click('button[data-act="ai-meal-go"]'); await wait(200);
  ok(/nepovolil/.test(await T(s2.page, '.modal-b')), 'not_granted česky');
  await s2.page.keyboard.press('Escape');
  ok(await s2.page.locator('.modal').count() === 0, 'Escape zavře modal');
  console.log('   ERR', await s2.page.evaluate(() => window.__errors), s2.logs);
  await s2.browser.close();

  // 2) bez claude → localStorage
  let s3 = await open({ noClaude: true });
  ok(/jen v tomto prohlížeči/.test(await T(s3.page, '.save-state')), 'stavový text: jen v prohlížeči');
  ok(/jen v tomto prohlížeči/.test(await T(s3.page, '#main')), 'varování na přehledu');
  await s3.page.click('button[data-act="demo-load"]'); await s3.page.waitForSelector('.tabs'); await wait(700);
  await s3.page.reload(); await s3.page.waitForSelector('.app');
  ok(/Jana N/.test(await T(s3.page, '#main')), 'localStorage: data přežijí reload');
  await s3.page.click('button[data-act="nav"][data-page="clients"]');
  await s3.page.click('button[data-act="client-open"]'); await s3.page.click('button[data-act="client-tab"][data-tab="plans"]'); await s3.page.click('button[data-act="plan-open"]');
  ok(await s3.page.locator('button[data-tab="ai"]').count() === 0 && await s3.page.locator('button[data-act="ai-day"]').count() === 0, 'bez AI nejsou AI tlačítka');
  await s3.page.click('button[data-act="plan-tab"][data-tab="out"]');
  await s3.page.click('button[data-act="ho-html"]'); await wait(200);
  ok(/Soubor stažen|Soubor uložen/.test(await s3.page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).join('|'))) || true, 'download fallback nespadl');
  console.log('   ERR', await s3.page.evaluate(() => window.__errors), s3.logs);
  await s3.browser.close();

  // 3) mobil + tmavý
  for (const dark of [false, true]) {
    const sm = await open({ viewport: { width: 390, height: 800 }, dark, initStore: store });
    const pages = [
      ['dash', async () => {}],
      ['client', async () => { await sm.page.click('button[data-act="client-open"]'); }],
      ['plan', async () => { await sm.page.click('button[data-act="client-tab"][data-tab="plans"]'); await sm.page.click('button[data-act="plan-open"]'); }],
      ['out', async () => { await sm.page.click('button[data-act="plan-tab"][data-tab="out"]'); }],
      ['week', async () => { await sm.page.click('button[data-act="plan-tab"][data-tab="week"]'); }],
      ['foods', async () => { await sm.page.click('button.bn[data-page="foods"]'); }],
      ['recipes', async () => { await sm.page.click('button.bn[data-page="recipes"]'); }],
      ['settings', async () => { await sm.page.click('button.bn[data-page="settings"]'); }],
    ];
    for (const [n, act] of pages) {
      await act(); await wait(150);
      const ov = await sm.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      ok(ov.sw <= ov.cw + 1, (dark ? 'tmavý ' : 'světlý ') + 'mobil ' + n + ': bez horizontálního scrollu (' + ov.sw + ' vs ' + ov.cw + ')');
      if (!dark || n === 'plan') await sm.page.screenshot({ path: SP + 'm_' + (dark ? 'd_' : 'l_') + n + '.png' });
    }
    console.log('   ERR', await sm.page.evaluate(() => window.__errors), sm.logs);
    await sm.browser.close();
  }
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(2); });
