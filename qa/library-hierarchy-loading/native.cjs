'use strict';
// Real app in isolated Chrome; synthetic metadata only, never a Drive write.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, '../maintenance/tools/library-hierarchy-loading');
fs.mkdirSync(out, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  const target = path.resolve(root, name);
  if (!target.startsWith(root + path.sep) || /^(qa|memory|worker|node_modules)\//.test(name)
    || !types[path.extname(target)] || !fs.existsSync(target)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type':types[path.extname(target)], 'Cache-Control':'no-store' });
  res.end(fs.readFileSync(target));
});
const install = async (page, failure = false) => page.evaluate(fail => {
  const poster = state.files[0].thumbnailLink;
  window.fixtureFiles = Array.from({ length:2051 }, (_, i) => ({ id:`fixture-${i}`,
    name:`${i < 1451 ? '영상' : '사진'} ${String(i + 1).padStart(4, '0')}.${i < 1451 ? 'mp4' : 'jpg'}`,
    mimeType:i < 1451 ? 'video/mp4' : 'image/jpeg', thumbnailLink:poster,
    size:'12345678', modifiedTime:'2026-10-08T00:00:00Z' }));
  window.fixtureRequests = []; window.fixtureFail = fail;
  window.releaseFixturePage = null;
  const folders = ['Samsung_Photos', 'Samsung_Videos'].map((name, i) => ({ id:`folder-${i}`, name, mimeType:FOLDER_MIME }));
  window.fixturePages = {
    '':{ files:[...folders, ...fixtureFiles.slice(0,458)], nextPageToken:'B' },
    B:{ files:fixtureFiles.slice(458,1000), nextPageToken:'C' },
    C:{ files:fixtureFiles.slice(1000,2000), nextPageToken:'D' },
    D:{ files:fixtureFiles.slice(2000) }
  };
  driveFetch = async (url, options) => {
    const token = new URL(url).searchParams.get('pageToken') || '';
    fixtureRequests.push({ token, priority:options.priority });
    if (token === 'B') {
      if (window.fixtureFail) throw new Error('Synthetic page failure');
      if (!window.fixtureReleased) await new Promise(resolve => { window.releaseFixturePage = resolve; });
    }
    return { json:async () => fixturePages[token] };
  };
  hasUsableToken = () => true;
  reportAppFailure = () => {};
  state.demo = false; state.currentFolderName = 'ㅇㅎㅎ'; state.currentFolderId = 'fixture-folder';
  state.filter = 'all'; state.query = ''; state.sort = 'name';
  window.fixtureReleased = false;
  return loadFiles({ append:false });
}, failure);

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  const rows = [];
  try {
    for (const [width,height,mobile] of [[1440,900,false],[390,844,true],[320,740,true]]) {
      const context = await browser.newContext({ viewport:{width,height}, isMobile:mobile, hasTouch:mobile, serviceWorkers:'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/?demo=1`);
      await page.waitForFunction(() => typeof state !== 'undefined' && state.demo && !el.libraryView.hidden);
      await install(page);
      await page.waitForFunction(() => typeof releaseFixturePage === 'function');
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.match(await page.locator('#librarySummary').innerText(), /458개 수집.*목록 확인 중/);
      assert.equal(await page.locator('#infiniteScrollSpinner').isVisible(), true);
      assert.equal(await page.locator('#loadMoreButton').isVisible(), false);
      await page.screenshot({ path:path.join(out,`${width}-collecting.png`) });
      await page.locator('#searchInput').fill('없는검색어');
      assert.equal(await page.locator('#emptyState').isVisible(), false, 'partial search is not a final empty result');
      await page.evaluate(() => { window.fixtureReleased = true; releaseFixturePage(); });
      await page.waitForFunction(() => state.populationComplete && !state.loadingFiles && !state.listRequestPromise);
      assert.equal(await page.locator('#emptyState').isVisible(), true);
      await page.locator('#searchInput').fill('');
      const result = await page.evaluate(() => ({ media:state.files.length, folders:state.folders.length,
        complete:state.populationComplete, requests:fixtureRequests, scrollY,
        cards:el.fileGrid.childElementCount, overflow:document.documentElement.scrollWidth > innerWidth,
        summary:el.librarySummary.textContent }));
      assert.equal(result.media,2051); assert.equal(result.folders,2); assert.equal(result.complete,true);
      assert.deepEqual(result.requests.map(r=>r.token),['','B','C','D']);
      assert.equal(result.scrollY,0); assert.ok(result.cards <= 240); assert.equal(result.overflow,false);
      assert.equal(result.summary,'폴더 2개 · 미디어 2,051개');
      await page.screenshot({ path:path.join(out,`${width}-complete.png`) });
      await page.locator('#searchInput').press('Tab'); await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#searchInput').evaluate(n => n === document.activeElement && getComputedStyle(n).outlineStyle === 'solid'),true);
      await page.locator('#libraryOptions > summary').click();
      await page.screenshot({ path:path.join(out,`${width}-options.png`) });
      await page.keyboard.press('Escape');
      await page.locator('#selectionModeButton').click();
      assert.equal(await page.locator('#selectionModeButton').getAttribute('aria-pressed'),'true');
      await page.locator('#selectionCancelBtn').click();
      await page.locator('#settingsButton').click();
      await page.locator('#settingsDialog').evaluate(async n => {
        await Promise.all(n.getAnimations({ subtree:true }).map(a => a.finished));
      });
      for (const id of ['logoutButton','disconnectButton']) {
        assert.equal(await page.locator(`#${id}`).evaluate(n => n.scrollWidth <= n.clientWidth),true, `${id} label fits`);
      }
      await page.screenshot({ path:path.join(out,`${width}-settings.png`) });
      await page.keyboard.press('Escape');
      await install(page,true);
      await page.waitForFunction(() => state.listLoadError && !state.listRequestPromise);
      assert.equal(await page.locator('#loadMoreButton').isVisible(),true);
      assert.equal(await page.locator('#fileGrid').getAttribute('aria-busy'),'false');
      const retryBounds = await page.locator('#loadMoreButton').boundingBox();
      assert.ok(retryBounds.y + retryBounds.height < height, 'retry visible without reaching end of grid');
      await page.screenshot({ path:path.join(out,`${width}-retry.png`) });
      const failedRequests = await page.evaluate(() => fixtureRequests.length);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => fixtureRequests.length), failedRequests, 'no automatic failure loop');
      await page.evaluate(() => { window.fixtureFail = false; window.fixtureReleased = true; });
      await page.locator('#loadMoreButton').click();
      await page.waitForFunction(() => state.populationComplete && !state.listLoadError && !state.loadingFiles);
      assert.equal(await page.evaluate(() => state.files.length),2051);
      assert.equal(await page.locator('#loadMoreButton').isVisible(),false);
      await page.goto(`${base}/?demo=1`);
      await page.waitForFunction(() => state.demo && !el.libraryView.hidden);
      await page.evaluate(() => { state.currentFolderId='root'; state.currentFolderName='내 드라이브'; state.filter='all'; state.query=''; startDemoMode(); });
      await page.locator('[data-file-id="demo-image-1"] .file-card-open').click({ timeout:10000 });
      await page.waitForFunction(() => !el.playerSheet.hidden && el.imageViewer.complete && el.imageViewer.naturalWidth > 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#closePlayerButton').isVisible(),true);
      await page.screenshot({ path:path.join(out,`${width}-image-player.png`) });
      await page.locator('#closePlayerButton').click({ timeout:10000 });
      await page.locator('#playerSheet').waitFor({ state:'hidden', timeout:10000 });
      assert.deepEqual(errors,[]);
      rows.push({ viewport:{width,height,mobile}, ...result, retry:true, focus:true, settingsLabels:true, imagePlayer:true, errors });
      await context.close();
    }
    fs.writeFileSync(path.join(out,'results.json'), JSON.stringify({ completed:true, evidence:'isolated Chrome; synthetic metadata', rows },null,2));
    console.log(JSON.stringify({completed:true, viewports:rows.length, collected:2051, retry:true, output:out}));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode=1; });
