const { open } = require('./harness');
(async () => {
  const s = await open({ viewport: { width: 390, height: 800 } });
  await s.page.click('button[data-act="demo-load"]'); await s.page.waitForSelector('.tabs');
  await s.page.click('button[data-act="client-tab"][data-tab="plans"]'); await s.page.click('button[data-act="plan-open"]');
  await s.page.click('button[data-act="plan-tab"][data-tab="out"]');
  const r = await s.page.evaluate(() => Array.from(document.querySelectorAll("#main *")).filter((e) => e.getBoundingClientRect().right > 392).slice(0, 8).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right) + ' ' + (e.innerText || '').slice(0, 30).replace(/\n/g, ' ')));
  console.log(r.join('\n'));
  console.log(await s.page.evaluate(() => { const o=[]; let e=document.querySelector('.handout'); while(e&&e!==document.body){o.push(e.tagName+'.'+e.className+' w='+Math.round(e.getBoundingClientRect().width)); e=e.parentElement;} return o.join('\n'); }));
  await s.browser.close();
})();
