'use strict';
// D095 UI/UX review: real app in isolated Chrome demo mode; no Drive requests.
// Usage: node qa/uiux-review-20261019/capture.cjs <label>
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const label = process.argv[2] || 'before';
const out = path.resolve(root, '../maintenance/tools/uiux-review-20261019', label);
fs.mkdirSync(out, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1)) || 'index.html';
  const target = path.resolve(root, name.endsWith('/') ? name + 'index.html' : name);
  if (!target.startsWith(root + path.sep) || /^(qa|memory|worker|node_modules)\//.test(name)
    || !types[path.extname(target)] || !fs.existsSync(target)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type':types[path.extname(target)], 'Cache-Control':'no-store' });
  res.end(fs.readFileSync(target));
});
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js', { paths:[path.join(root, 'qa')] }), 'utf8');
const settle = page => page.waitForTimeout(700);

const states = {
  async landing(page) { await page.goto(`${base}/`); await page.waitForTimeout(3000); },
  async library(page) { await page.goto(`${base}/?demo=1`); await page.waitForFunction(() => typeof state !== 'undefined' && state.demo && !el.libraryView.hidden, null, { timeout: 30000 }); await settle(page); },
  async folder(page) { await states.library(page); await page.locator('#folderGrid button, .folder-row, .folder-chip').first().click(); await settle(page); },
  async viewOptions(page) { await states.library(page); await page.locator('#libraryOptions > summary').click(); await settle(page); },
  async emptySearch(page) { await states.library(page); await page.fill('#searchInput', '존재하지않는파일'); await settle(page); },
  async settings(page) { await states.library(page); await page.click('#settingsButton'); await settle(page); },
  async video(page) { await states.library(page); await page.locator('.file-card', { hasText: '서울 야간 산책' }).locator('.file-card-open').first().click(); await page.waitForTimeout(1500); },
  async videoControls(page) { await states.video(page); await page.mouse.move(200, 200); await page.mouse.move(260, 260); await page.waitForTimeout(400); },
  async image(page) { await states.library(page); await page.locator('.file-card', { hasText: '한강 원본 사진' }).locator('.file-card-open').first().click(); await page.waitForTimeout(1500); },
  async selection(page) { await states.library(page); const b = page.locator('button[aria-label="파일 선택"], button[title="파일 선택"]').first(); if (await b.count()) await b.click(); await settle(page); },
};

let base;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  const report = [];
  try {
    for (const [name, width, height, mobile] of [['desktop',1440,900,false],['tablet',820,1180,true],['phone',390,844,true],['small',320,640,true]]) {
      for (const [stateName, run] of Object.entries(states)) {
        const context = await browser.newContext({ viewport:{width,height}, isMobile:mobile, hasTouch:mobile, serviceWorkers:'block', colorScheme:'dark', locale:'ko-KR' });
        await context.route(/googleapis|accounts\.google|gstatic/, route => route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
        let failure = null;
        try { await run(page); } catch (e) { failure = String(e.message).split('\n')[0]; }
        await page.screenshot({ path: path.join(out, `${name}-${stateName}.png`) });
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const tiny = [...document.querySelectorAll('button, a, [role=button], input, summary, select')]
            .filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && (r.width < 32 || r.height < 32); })
            .map(e => `${e.id || e.className || e.tagName}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`).slice(0, 12);
          return { horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, tinyTargets: tiny };
        });
        await page.addScriptTag({ content: axeSource });
        const axe = await page.evaluate(async () => (await axe.run(document, { resultTypes:['violations'] })).violations
          .map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })));
        report.push({ viewport: name, state: stateName, failure, errors, ...metrics, axe });
        await context.close();
      }
    }
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  for (const r of report) {
    const issues = [r.failure && `FAIL ${r.failure}`, r.errors.length && `errors ${r.errors.length}`, r.horizontalOverflow && `overflow ${r.scrollWidth}>${r.clientWidth}`,
      r.tinyTargets.length && `tiny ${r.tinyTargets.length}`, r.axe.length && `axe ${r.axe.map(a => `${a.id}(${a.nodes})`).join(',')}`].filter(Boolean);
    console.log(`${r.viewport.padEnd(7)} ${r.state.padEnd(13)} ${issues.join(' | ') || 'ok'}`);
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
