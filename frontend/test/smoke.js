const { open } = require('./harness');
(async () => {
  const { browser, page, logs } = await open();
  await page.screenshot({ path: '/tmp/claude-0/-home-claude/561df5ae-f3f5-5210-a9b5-4b86392341c8/scratchpad/s1.png' });
  console.log('title:', await page.title());
  console.log('errors:', await page.evaluate(() => window.__errors));
  console.log('logs:', logs);
  console.log(await page.evaluate(() => document.querySelector('#main').innerText.slice(0, 400)));
  await browser.close();
})();
