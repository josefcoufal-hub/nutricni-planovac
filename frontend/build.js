// Sestaví aplikaci ze zdrojových souborů.
//   node build.js            -> dist/index.html            (samostatná verze pro artefakt, vše v jednom souboru)
//   node build.js --server   -> ../web/public/{index.html,app.js,app.css,favicon.svg}  (verze pro vlastní server)
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const FILES = ['core.js', 'nutridb.js', 'data.js', 'planner.js', 'tools.js', 'store.js', 'app1.js', 'auth.js', 'app2.js', 'app3.js', 'app4.js', 'app5.js'];
const js = FILES.map((f) => '/* ==== ' + f + ' ==== */\n' + src(f)).join('\n');
if (/<\/script/i.test(js)) throw new Error('Zdroj obsahuje </script');
const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap';

if (process.argv.includes('--server')) {
  const out = path.join(__dirname, '..', 'web', 'public');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) { if (/^(index\.html|app\.js|app\.css|favicon\.svg)$/.test(f)) fs.unlinkSync(path.join(out, f)); }
  const base = 'html{-webkit-text-size-adjust:100%}body{margin:0}[hidden]{display:none!important}img{max-width:100%}\n';
  const html = [
    '<!doctype html>', '<html lang="cs">', '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="nt-mode" content="server">',
    '<meta name="robots" content="noindex, nofollow">',
    '<meta name="referrer" content="no-referrer">',
    '<title>Nutriční plánovač</title>',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="' + FONTS + '">',
    '<link rel="stylesheet" href="/app.css">',
    '</head>', '<body>',
    '<div id="app"></div><div id="modal"></div><div id="toasts" class="toasts" aria-live="polite"></div>',
    '<script src="/app.js"></script>', '</body>', '</html>', ''
  ].join('\n');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0B7A75"/><path d="M18 40c0-12 8-20 28-22-1 18-9 26-22 26-2 0-4-1-6-4z" fill="#fff"/><path d="M20 44c6-10 12-16 22-22" stroke="#0B7A75" stroke-width="3" fill="none" stroke-linecap="round"/></svg>\n';
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'app.js'), js + '\nNT.App.init();\n');
  fs.writeFileSync(path.join(out, 'app.css'), base + src('style.css'));
  fs.writeFileSync(path.join(out, 'favicon.svg'), svg);
  console.log('web/public: index.html, app.js ' + (js.length / 1024).toFixed(0) + ' kB, app.css, favicon.svg');
} else {
  const html = [
    '<title>Nutriční plánovač</title>',
    '<meta name="claude:viewport-fit-sides" content="cover">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="stylesheet" href="' + FONTS + '">',
    '<style>', src('style.css'), '</style>',
    '<div id="app"></div><div id="modal"></div><div id="toasts" class="toasts" aria-live="polite"></div>',
    '<script>', js, '\nNT.App.init();', '</script>', ''
  ].join('\n');
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
  console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' kB');
}
