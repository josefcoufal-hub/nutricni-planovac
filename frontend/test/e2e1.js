const { open } = require('./harness');
const SP = '/tmp/claude-0/-home-claude/561df5ae-f3f5-5210-a9b5-4b86392341c8/scratchpad/';
(async () => {
  const { browser, page, logs } = await open();
  const shot = (n) => page.screenshot({ path: SP + n + '.png' });
  const txt = (s) => page.evaluate((s) => (document.querySelector(s) || {}).innerText || '', s);
  // demo
  await page.click('button[data-act="demo-load"]');
  await page.waitForSelector('.tabs');
  console.log('CLIENT:', (await txt('.page-head')).replace(/\n/g, ' | '));
  await shot('c1');
  console.log('NEEDS:', (await txt('#needs-card')).slice(0, 900).replace(/\n/g, ' | '));
  // plans tab
  await page.click('button[data-act="client-tab"][data-tab="plans"]');
  console.log('PLANS:', (await txt('#main')).slice(0, 300).replace(/\n/g, ' | '));
  await page.click('button[data-act="plan-open"]');
  await page.waitForSelector('.editor');
  await shot('p1');
  console.log('PANEL:', (await txt('#panel')).replace(/\n/g, ' | ').slice(0, 900));
  console.log('ERR', await page.evaluate(() => window.__errors), logs);
  await browser.close();
})();
