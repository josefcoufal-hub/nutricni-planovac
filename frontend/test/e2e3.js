const { open } = require('./harness');
const { SP, ok, eq, summary } = require('./lib');
(async () => {
  const { browser, page, logs } = await open();
  const T = (s) => page.evaluate((s) => (document.querySelector(s) || {}).innerText || '', s);
  const wait = (ms) => page.waitForTimeout(ms);
  const toast = () => page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).join(' || '));

  await page.click('button[data-act="demo-load"]');
  await page.waitForSelector('.tabs');

  console.log('J. Výstup a PDF');
  await page.click('button[data-act="client-tab"][data-tab="plans"]');
  await page.click('button[data-act="plan-open"]');
  await page.click('button[data-act="plan-tab"][data-tab="out"]');
  await page.waitForSelector('#ho-preview');
  const chk = await T('#out-grid');
  console.log('   kontrola:', chk.slice(chk.indexOf('Před odesláním'), chk.indexOf('Stáhnout PDF')).replace(/\n/g, ' | '));
  await page.click('button[data-act="ho-pdf"]');
  await wait(600);
  const saved = await page.evaluate(() => window.__saved);
  console.log('   saved:', JSON.stringify(saved));
  ok(saved.length === 1 && /\.pdf$/.test(saved[0].filename), 'PDF uloženo');
  console.log('   filename', saved[0] && saved[0].filename);
  const doc = await page.evaluate(() => JSON.parse(JSON.stringify(window.__lastPdfDoc)));
  ok(doc && doc.content.length > 5, 'PDF docDefinition má obsah');
  // strukturální kontrola docDefinition
  const walk = (n, f) => { if (Array.isArray(n)) n.forEach((x) => walk(x, f)); else if (n && typeof n === 'object') { f(n); Object.values(n).forEach((x) => walk(x, f)); } };
  let tables = 0, bad = 0;
  walk(doc.content, (n) => { if (n.table) { tables++; const w = n.table.widths.length; n.table.body.forEach((r) => { if (r.length !== w) bad++; }); } });
  ok(tables >= 3, 'tabulek v PDF: ' + tables); eq(bad, 0, 'všechny řádky tabulek mají správný počet buněk');
  const alltext = JSON.stringify(doc.content);
  ok(/Jídelníček/.test(alltext) && /Nákupní seznam/.test(alltext) && /Výměnný seznam/.test(alltext), 'sekce PDF');
  ok(/rstart|undefined|NaN|\[object/.test(alltext) === false, 'v PDF není undefined/NaN');
  console.log('   PDF obsah (délka):', alltext.length);

  await page.click('button[data-act="ho-html"]');
  await wait(200);
  const saved2 = await page.evaluate(() => window.__saved);
  ok(saved2.length === 2 && /\.html$/.test(saved2[1].filename), 'HTML uloženo');
  const html = await page.evaluate(() => window.__lastSavedText);
  ok(/<!doctype html>/.test(html) && /Jídelníček/.test(html) && !/undefined|NaN/.test(html), 'HTML dokument OK');

  // e-mail
  await page.click('button[data-act="ho-email"]');
  await page.waitForSelector('#em-body');
  const body = await page.inputValue('#em-body');
  ok(/Dobrý den, Jana/.test(body), 'e-mail osloví jménem: ' + body.slice(0, 40));
  await page.fill('#em-to', 'a@b.cz');
  ok((await page.getAttribute('#em-link', 'href')).startsWith('mailto:a%40b.cz?subject='), 'mailto odkaz');
  await page.click('button[data-act="modal-close"]');

  // text bez AI
  await page.click('button[data-act="ho-copy"]');
  await wait(100);
  console.log('   toast copy:', await toast());

  // options
  await page.uncheck('input[data-k="shopping"]');
  await page.uncheck('input[data-k="equivalents"]');
  const pv = await T('#ho-preview');
  ok(!/Nákupní seznam/.test(pv) && !/Výměnný seznam/.test(pv), 'volby odstraní sekce');
  await page.screenshot({ path: SP + 'out2.png', fullPage: false });

  console.log('K. AI komentář');
  await page.evaluate(() => { window.__sampleText = '"Jano, tohle je test komentáře."'; });
  await page.fill('textarea[data-in="plan-comment"]', '');
  await page.click('button[data-act="ho-ai-comment"]');
  await wait(400);
  const cm = await page.inputValue('textarea[data-in="plan-comment"]');
  eq(cm, 'Jano, tohle je test komentáře.', 'AI komentář vložen bez uvozovek');
  const calls = await page.evaluate(() => window.__sampleCalls);
  ok(calls.length === 1 && /Jana N/.test(calls[0]) === false, 'prompt neobsahuje jméno klientky');
  ok(/Redukce hmotnosti/.test(calls[0]), 'prompt obsahuje cíl');
  console.log('   ERR', await page.evaluate(() => window.__errors), logs);

  console.log('L. Sledování');
  await page.click('button[data-act="plan-back"]');
  await page.click('button[data-act="client-tab"][data-tab="track"]');
  await page.waitForSelector('#chart-wrap');
  console.log('   souhrn:', (await T('#main')).replace(/\n/g, ' | ').slice(130, 700));
  await page.screenshot({ path: SP + 'track1.png', fullPage: true });
  // hover
  const box = await page.locator('#ch-hit').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + 40);
  await wait(100);
  ok(await page.evaluate(() => document.querySelector('#ch-tip').style.display !== 'none'), 'tooltip grafu');
  console.log('   tip:', await T('#ch-tip'));
  // měření
  await page.fill('#mf-w', '75,2');
  await page.fill('#mf-waist', '85');
  await page.click('button[data-act="mf-save"]');
  await wait(100);
  ok(/Měření uloženo/.test(await toast()), 'měření uloženo');
  ok(/75,2 kg/.test(await T('#main')), 'nová hmotnost v souhrnu');
  // neplatná
  await page.fill('#mf-w', '500');
  await page.click('button[data-act="mf-save"]');
  ok(/mezi 30 a 300/.test(await toast()), 'neplatná hmotnost odmítnuta');
  // úprava
  await page.click('button[data-act="mf-edit"] >> nth=0');
  eq(await page.inputValue('#mf-w'), '75,2', 'úprava předvyplní hmotnost');
  await page.fill('#mf-w', '75,0');
  await page.click('button[data-act="mf-save"]');
  ok(/75,0 kg/.test(await T('#main')), 'úprava uložena');
  // deník
  await page.fill('#df-adh', '95');
  await page.selectOption('#df-energy', '5');
  await page.click('button[data-act="df-save"]');
  ok(/Záznam deníku uložen/.test(await toast()), 'deník uložen');
  // profil: hmotnost se propíše do potřeb
  await page.click('button[data-act="client-tab"][data-tab="profile"]');
  eq(await page.inputValue('input[data-ch="c.weight"]'), '75', 'profil ukazuje poslední hmotnost 75');
  // AI shrnutí
  await page.click('button[data-act="client-tab"][data-tab="track"]');
  await page.evaluate(() => { window.__sampleText = 'Shrnutí test'; });
  await page.click('button[data-act="track-ai"]');
  await page.waitForSelector('.modal .card.flat');
  ok(/Shrnutí test/.test(await T('.modal-b')), 'AI shrnutí zobrazeno');
  const pc = (await page.evaluate(() => window.__sampleCalls)).pop();
  ok(/Měření hmotnosti/.test(pc) && /Deník/.test(pc), 'prompt shrnutí má data');
  await page.click('button[data-act="modal-close"]');
  console.log('   ERR', await page.evaluate(() => window.__errors), logs);
  await browser.close();
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(2); });
