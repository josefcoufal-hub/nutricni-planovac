const { open } = require('./harness');
const { SP, ok, eq, summary } = require('./lib');
(async () => {
  const { browser, page, logs } = await open();
  const T = (s) => page.evaluate((s) => (document.querySelector(s) || {}).innerText || '', s);
  const wait = (ms) => page.waitForTimeout(ms);
  const toast = () => page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).join(' || '));
  await page.click('button[data-act="nav"][data-page="foods"]');
  await page.waitForSelector('.tbl');

  console.log('M. Potraviny');
  const n0 = await page.locator('tbody tr').count();
  eq(n0, 80, 'strana má 80 řádků (nebo méně)') ;
  await page.fill('input[data-in="food-q"]', 'kuřecí prsa');
  await wait(400);
  ok(/Kuřecí prsa/.test(await T('.tbl')), 'hledání');
  await page.fill('input[data-in="food-q"]', '');
  await wait(400);
  // nová potravina
  await page.click('button[data-act="food-new"]');
  await page.waitForSelector('#fe-name');
  await page.fill('#fe-name', 'Testovací müsli');
  await page.fill('#fe-protein', '10');
  await page.fill('#fe-fat', '8');
  await page.fill('#fe-carbs', '60,5');
  await wait(50);
  ok(/Chybí povinný údaj: Energie/.test(await T('#fe-issues')), 'validace chybějící kcal');
  await page.click('button[data-act="fe-save"]');
  ok(/Oprav chyby/.test(await toast()), 'uložení s chybou zablokováno');
  await page.click('button[data-act="fe-calc"]');
  eq(await page.inputValue('#fe-kcal'), '354', 'dopočet kcal 4*10+9*8+4*60,5');
  await page.fill('#fe-kcal', '354');
  await wait(50);
  await page.fill('#fe-protein', '60');
  await page.fill('#fe-fat', '30');
  await wait(50);
  ok(/Součet živin/.test(await T('#fe-issues')), 'součet >100 g hlášen');
  await page.fill('#fe-protein', '10'); await page.fill('#fe-fat', '8');
  await page.click('button[data-act="fe-padd"]');
  await page.fill('input[data-in="fe-pname"]', '1 miska'); await page.fill('input[data-in="fe-pg"]', '50');
  await page.click('button[data-act="fe-all"][data-a="gluten"]');
  await page.click('button[data-act="fe-save"]');
  await wait(100);
  ok(/Potravina uložena/.test(await toast()), 'potravina uložena');
  await page.fill('input[data-in="food-q"]', 'müsli'); await wait(400);
  ok(/Testovací müsli/.test(await T('.tbl')) && /Vlastní/.test(await T('.tbl')), 've výpisu s odznakem Vlastní');
  // editace základní potraviny → override
  await page.fill('input[data-in="food-q"]', 'ovesné vločky'); await wait(400);
  await page.click('tr[data-act="food-edit"]');
  await page.fill('#fe-kcal', '380');
  await page.click('button[data-act="fe-save"]');
  await wait(1000);
  const stored = await page.evaluate(() => Object.keys(window.__store.foods || {}));
  ok(stored.some((k) => k === 'b_ovesne_vlocky'), 'override základní potraviny uložen pod id b_*: ' + stored.join(','));
  await page.click('tr[data-act="food-edit"]');
  ok(await page.locator('button[data-act="fe-reset"]').count() === 1, 'tlačítko Obnovit původní');
  await page.click('button[data-act="fe-reset"]'); await page.click('button[data-act="confirm-yes"]'); await wait(100);
  await wait(1000);
  eq(await page.evaluate(() => Object.keys(window.__store.foods || {}).filter((k) => k === 'b_ovesne_vlocky').length), 0, 'po obnovení původního je override z db pryč');

  console.log('N. Import');
  await page.fill('input[data-in="food-q"]', ''); await wait(300);
  await page.click('button[data-act="food-import"]');
  const csv = 'product_name;brands;energy-kcal_100g;proteins_100g;fat_100g;saturated-fat_100g;carbohydrates_100g;sugars_100g;fiber_100g;salt_100g;allergens\n' +
    'Skyr natur;Pilos;63;11;0,2;0,1;4;4;0;0,1;en:milk\n' +
    'Chybný produkt;X;100;60;50;1;30;1;0;0;\n' +
    'Kuřecí prsa (syrová);;110;23;1,5;0,4;0;0;0;0,15;\n' +
    'Müsli tyčinka;Sante;;8;10;3;60;20;5;0,3;"en:gluten,en:nuts"\n';
  await page.fill('textarea[data-in="imp-text"]', csv);
  await page.click('button[data-act="imp-next1"]');
  await page.waitForSelector('select[data-ch="imp-map"]');
  const mapTxt = await T('.modal-b');
  ok(/Název/.test(mapTxt), 'mapování');
  const sel = await page.evaluate(() => Array.from(document.querySelectorAll('select[data-ch="imp-map"]')).map((s) => s.dataset.k + '=' + s.value).join(','));
  console.log('   mapa:', sel);
  await page.click('button[data-act="imp-next2"]');
  const prev = await T('.modal-b');
  console.log('   náhled:', prev.replace(/\n/g, ' | ').slice(0, 700));
  ok(/Součet živin/.test(prev), 'chybný řádek označen');
  ok(/Chybný produkt[^\n]*\t?[^\n]*Součet/.test(prev), 'chybný řádek má důvod');
  await page.click('button[data-act="imp-run"]');
  await wait(300);
  ok(/Naimportováno 3/.test(await toast()), 'importovány 3 potraviny: ' + await toast());
  ok(/K ověření/.test(await T('.main')), 'filtr K ověření');
  const rows = await T('.tbl');
  ok(/Skyr natur \(Pilos\)/.test(rows) && /Müsli tyčinka \(Sante\)/.test(rows), 'importované názvy se značkou');
  ok(/Skyr natur[^\n]*\n?[^\n]*Import/.test(rows) || /Import/.test(rows), 'odznak Import');
  // kcal dopočteno z makroživin u Müsli (chyběla energie)
  const kc = await page.evaluate(() => { const r = Array.from(document.querySelectorAll('tbody tr')).find((t) => /Müsli tyčinka/.test(t.innerText)); return r.children[3].innerText; });
  console.log('   müsli kcal:', kc);
  // bulk ověřit
  await page.check('input[data-ch="food-sel-all"]');
  await page.click('button[data-act="food-bulk-ver"]');
  await wait(100);
  await page.click('button[data-act="food-filter"][data-f="mine"]'); ok(/Ověřeno/.test(await T('.tbl')), 'ověřeno hromadně');
  // export
  await page.click('button[data-act="food-export"]');
  await wait(100);
  ok(/potraviny\.csv/.test(JSON.stringify(await page.evaluate(() => window.__saved))), 'export CSV');
  console.log('   ERR', await page.evaluate(() => window.__errors), logs);

  console.log('O. Recepty');
  await page.click('button[data-act="nav"][data-page="recipes"]');
  eq(await page.locator('.card h3').count(), 48, '48 ukázkových receptů');
  await page.click('button[data-act="rec-new"]');
  await page.fill('#re-name', 'Test omeleta');
  await page.fill('#re-serv', '2');
  await page.click('button[data-act="re-ing-add"]');
  await page.waitForSelector('#pick-q');
  ok(await page.locator('button[data-act="pick-tab"]').count() === 0, 'v režimu výběru suroviny nejsou záložky');
  await page.fill('#pick-q', 'vejce');
  await page.click('.pick[data-act="pick-food"]');
  await wait(100);
  ok(await page.locator('#re-nutr').count() === 1, 'zpět v editoru receptu');
  await page.fill('input[data-in="re-g"]', '240');
  await wait(50);
  const nutr = await T('#re-nutr');
  console.log('   živiny:', nutr.replace(/\n/g, ' | ').replace(/\t/g,' '));
  await page.fill('textarea[data-in="re-steps"]', 'Rozšlehat\nOpéct');
  await page.fill('input[data-in="re-tags"]', 'rychlé, test');
  await page.click('button[data-act="re-save"]');
  await wait(100);
  ok(/Test omeleta/.test(await T('.main')), 'recept uložen');
  // prázdný recept
  await page.click('button[data-act="rec-new"]'); await page.fill('#re-name', 'X'); await page.click('button[data-act="re-save"]');
  ok(/aspoň jednu surovinu/.test(await toast()), 'bez surovin nelze uložit');
  await page.click('button[data-act="modal-close"]');
  // AI recepty (mock)
  await page.evaluate(() => { window.__sampleJson = { recipes: [{ name: 'AI Palačinky', servings: 2, timeMin: 15, ingredients: [{ foodId: 'b_vejce', grams: 120 }, { foodId: 'b_mleko_polotucne', grams: 200 }, { name: 'Špaldová mouka', grams: 100, per100: { kcal: 340, protein: 12, fat: 2, satFat: 0.4, carbs: 65, sugar: 1, fiber: 9, salt: 0.01 } }, { name: 'Neznámá věc', grams: 10 }], steps: ['1. Smíchat', '2. Smažit'] }] }; });
  await page.click('button[data-act="rec-ai"]');
  await page.fill('#air-req', 'palačinky');
  await page.click('button[data-act="air-go"]');
  await page.waitForSelector('button[data-act="air-save"]');
  const ai = await T('.modal-b');
  console.log('   AI recept:', ai.replace(/\n/g, ' | ').slice(ai.indexOf('AI Palačinky'), ai.indexOf('AI Palačinky') + 450));
  ok(/Špaldová mouka/.test(ai) && /Neznámá věc/.test(ai), 'nová surovina + problém hlášeny');
  await page.click('button[data-act="air-save"]');
  await wait(100);
  await page.click('button[data-act="modal-close"]');
  ok(/AI Palačinky/.test(await T('.main')), 'AI recept uložen');
  await page.fill('input[data-in="rec-q"]', ''); 
  // nová potravina se uložila jako AI odhad
  await page.click('button[data-act="nav"][data-page="foods"]');
  await page.fill('input[data-in="food-q"]', 'špaldová'); await wait(400);
  ok(/Odhad AI/.test(await T('.tbl')) && /K ověření/.test(await T('.tbl')), 'AI surovina označena');
  // inspirace
  await page.click('button[data-act="nav"][data-page="recipes"]');
  await page.click('button[data-act="rec-inspire"]');
  await page.fill('#insp-q', 'cuketové placky');
  ok((await page.getAttribute('#insp-link', 'href')).includes('site%3Atoprecepty.cz%20cuketov'), 'odkaz Google site:toprecepty.cz');
  await page.click('button[data-act="modal-close"]');
  // import z textu bez AI selže hezky? (AI je) – chyba AI
  await page.evaluate(() => { window.__sampleError = { code: 'rate_limited', message: 'x' }; });
  await page.click('button[data-act="rec-import"]');
  await page.fill('textarea[data-in="rimp-text"]', 'Těstovinový salát. 200 g těstovin, 2 rajčata. Uvař a smíchej, dochuť.');
  await page.click('button[data-act="rimp-go"]');
  await wait(300);
  ok(/Příliš mnoho dotazů/.test(await T('.modal-b')), 'chyba AI česky');
  await page.evaluate(() => { window.__sampleError = null; });
  await page.click('button[data-act="rimp-manual"]');
  await page.waitForSelector('#re-name');
  ok((await page.inputValue('textarea[data-in="re-steps"]')).includes('Těstovinový salát'), 'ruční vložení textu do postupu');
  await page.click('button[data-act="modal-close"]');

  console.log('P. Šablony + Nastavení');
  await page.click('button[data-act="nav"][data-page="templates"]');
  ok(/Celý den|Jídlo/.test(await T('.main')), 'šablony');
  await page.click('button[data-act="nav"][data-page="settings"]');
  await page.fill('input[data-k="name"]', 'Mgr. Test');
  await page.click('button[data-act="backup-export"]');
  await wait(300);
  const sv = await page.evaluate(() => window.__saved.map((s) => s.filename));
  ok(sv.some((f) => /zaloha-jidelnicky-.*\.json/.test(f)), 'záloha JSON');
  const json = JSON.parse(await page.evaluate(() => window.__lastSavedText));
  eq(json.app, 'nutricni-planovac', 'záloha má app');
  ok(json.data.foods.length >= 4 && json.data.settings.length === 1, 'záloha obsahuje foods a settings');
  await page.click('button[data-act="wipe-open"]');
  ok(await page.locator('#wipe-go[disabled]').count() === 1, 'smazání zablokováno');
  await page.fill('#wipe-in', 'smazat');
  await page.click('#wipe-go'); await wait(600);
  const left = await page.evaluate(() => Object.values(window.__store).map((c) => Object.keys(c).length).reduce((a, b) => a + b, 0));
  eq(left, 0, 'po smazání je db prázdná');
  console.log('   ERR', await page.evaluate(() => window.__errors), logs);
  await browser.close();
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(2); });
