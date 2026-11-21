const { open } = require('./harness');
const { SP } = require('./lib');
(async () => {
  const s = await open({ viewport: { width: 390, height: 800 } });
  await s.page.click('button[data-act="demo-load"]'); await s.page.waitForSelector('.tabs');
  await s.page.click('button[data-act="client-tab"][data-tab="plans"]'); await s.page.click('button[data-act="plan-open"]');
  await s.page.waitForSelector('.editor');
  await s.page.screenshot({ path: SP + 'mp.png', fullPage: true, clip: { x: 0, y: 0, width: 390, height: 2400 } });
  await s.page.click('button[data-act="plan-tab"][data-tab="out"]');
  await s.page.screenshot({ path: SP + 'mo.png' });
  await s.browser.close();
})();
