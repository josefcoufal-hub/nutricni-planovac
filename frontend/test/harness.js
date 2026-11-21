// Společná část e2e testů: spuštění stránky s falešným window.claude.
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');

const FAKE = (opts) => `(() => {
  const o = ${JSON.stringify(opts || {})};
  window.__errors = []; window.__saved = []; window.__sampleCalls = [];
  window.addEventListener('error', e => window.__errors.push('error: ' + e.message));
  window.addEventListener('unhandledrejection', e => window.__errors.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
  if (o.noClaude) return;
  const store = o.initStore || {};
  const mkdb = () => ({
    collection(c) { store[c] = store[c] || {}; return {
      async get() { return { docs: Object.keys(store[c]).map(id => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(store[c][id])) })) }; },
      doc(id) { return { async set(v) { if (window.__failWrites) throw new Error('disk full'); if (!/^[A-Za-z0-9_.~:@+-]+$/.test(id)) throw new Error('bad id ' + id); store[c][id] = JSON.parse(JSON.stringify(v)); }, async delete() { delete store[c][id]; } }; }
    }; }
  });
  window.__store = store;
  const sample = async (p) => { window.__sampleCalls.push(p); return { text: (window.__sampleText || 'Mock text'), truncated: false }; };
  sample.json = async (p) => { window.__sampleCalls.push(p); if (window.__sampleError) throw window.__sampleError; return window.__sampleJson; };
  window.claude = { use: async (n) => {
    if (n === 'db') return o.noDb ? null : mkdb();
    if (n === 'sample') return o.noSample ? null : sample;
    if (n === 'downloads') return o.noDownloads ? null : { save: async (r) => { window.__saved.push({ filename: r.filename, size: r.data.size || r.data.length, type: typeof r.data === 'string' ? 'string' : 'blob' }); if (typeof r.data === 'string') window.__lastSavedText = r.data; return { status: 'saved' }; } };
    return null;
  } };
})();`;

const PDF_STUB = `window.pdfMake = { vfs: {}, createPdf(doc) { window.__lastPdfDoc = doc; return { getBlob(cb) { cb(new Blob(['%PDF-stub'], { type: 'application/pdf' })); } }; } };`;

async function open(opts) {
  opts = opts || {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1360, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('file://')) return r.continue();
    if (/pdfmake\.min\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: PDF_STUB });
    if (/vfs_fonts\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: '/* vfs */' });
    if (/fonts\.googleapis|fonts\.gstatic/.test(u)) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort();
  });
  await page.addInitScript(FAKE(opts));
  await page.goto(URL);
  await page.waitForSelector('.app', { timeout: 8000 });
  return { browser, page, logs };
}
module.exports = { open };
