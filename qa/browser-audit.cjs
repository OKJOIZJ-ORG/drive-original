'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const root = path.resolve(__dirname, '..');
const phase = process.argv[2] || 'baseline';
const out = path.join(__dirname, phase);
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webm': 'video/webm' };
function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname).replace(/^\/drive-original\//, '') || 'index.html';
    const target = path.resolve(root, name);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(target).pipe(res);
  });
}
async function snapshot(page, name, errors) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: !name.endsWith('-player') });
  const layout = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
    version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
    cards: document.querySelectorAll('.file-card').length,
    videoCount: document.querySelectorAll('video').length,
    active: document.activeElement?.id,
    overflowing: [...document.querySelectorAll('button,input,select,dialog,[role="slider"]')].filter(e => {
      const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
      return r.width && r.height && s.visibility !== 'hidden' && !e.closest('[hidden]') && (r.left < -1 || r.right > innerWidth + 1);
    }).map(e => ({ id: e.id, text: e.textContent.trim().slice(0, 70), rect: e.getBoundingClientRect().toJSON() }))
  }));
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const result = { name, layout, violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), errors: [...errors] };
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ name, width: layout.width, overflow: layout.overflowing.map(e => e.id), axe: result.violations.map(v => v.id), errors: errors.length }));
  return result;
}
(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/drive-original/`;
  const engine = process.argv[3] || 'chrome';
  const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'chrome', headless: true });
  const all = [];
  try {
    for (const [width, height, mobile] of [[390,844,true], [320,568,true], [844,390,true], [820,1180,true], [1280,800,false]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
      await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => typeof startDemoMode === 'function');
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 20000 });
      all.push(await snapshot(page, `${width}x${height}-setup`, errors));
      await page.goto(base + '?demo=1', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !el.libraryView.hidden && state.files.length > 0);
      all.push(await snapshot(page, `${width}x${height}-library`, errors));
      await page.evaluate(() => openMediaSource); // fail early if the runtime is unavailable
      await page.evaluate(() => { const f = state.files.find(f => f.mimeType.startsWith('image/')); openPlayer(f); });
      all.push(await snapshot(page, `${width}x${height}-player`, errors));
      await page.evaluate(() => closePlayer());
      await page.locator('#settingsButton').click();
      all.push(await snapshot(page, `${width}x${height}-settings`, errors));
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(all, null, 2));
    if (all.some(r => r.violations.length || r.errors.length || r.layout.overflowing.length)) process.exitCode = 1;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
