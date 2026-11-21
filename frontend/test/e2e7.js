const { open } = require('./harness');
const { ok, eq, summary } = require('./lib');
(async () => {
  const { browser, page } = await open();
  const wait = (ms) => page.waitForTimeout(ms);
  await page.evaluate(() => { window.__failWrites = true; });
  await page.click('button[data-act="demo-load"]'); await page.waitForSelector('.tabs');
  await wait(1500);
  const t = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((x) => x.innerText).join('|'));
  ok(/nepodařilo uložit/.test(t), 'toast o chybě ukládání: ' + t);
  ok(/Uložení se nezdařilo/.test(await page.locator('#savestate').innerText()), 'stav: Uložení se nezdařilo');
  await page.evaluate(() => { window.__failWrites = false; });
  await page.click('button[data-act="retry-save"]'); await wait(1500);
  ok(/Vše uloženo/.test(await page.locator('#savestate').innerText()), 'po opakování uloženo');
  const n = await page.evaluate(() => Object.keys(window.__store.clients || {}).length + Object.keys(window.__store.plans || {}).length);
  eq(n, 2, 'data skutečně v db po opakování');
  await browser.close();
  process.exit(summary() ? 1 : 0);
})();
