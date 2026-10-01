'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('../node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const baseline = process.argv.includes('--baseline');
const out = path.join(__dirname, baseline ? 'before' : 'after');
fs.mkdirSync(out, { recursive: true });
const memory = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json'], { encoding: 'utf8' }));
assert(memory.FreePhysicalMemory > 1048576 && memory.FreeVirtualMemory > 1572864, 'unchanged Chrome launch memory floor');
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name.includes('..')) return res.writeHead(404).end();
  if (name === 'fixture.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); res.end(fs.readFileSync(path.join(root, 'qa/faststart-h264-aac.mp4'))); return; }
  if (!['index.html', 'styles.css', 'app.js', 'runtime-config.js', 'manifest.webmanifest', 'media/revision-pin.js', 'version.json'].includes(name)) return res.writeHead(404).end();
  const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }[path.extname(name)];
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(baseline && ['styles.css', 'index.html', 'app.js'].includes(name) ? execFileSync('git', ['show', `8bb047c:${name}`], { cwd: root }) : fs.readFileSync(path.join(root, name)));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const rows = [];
  try {
    for (const viewport of [{ width: 1911, height: 795 }, { width: 1280, height: 800 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, isMobile: viewport.width <= 600, hasTouch: viewport.width <= 600, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/?demo=1');
      await page.waitForFunction(() => state.demo && !!playerChrome);
      await page.evaluate(() => {
        el.playerSheet.hidden = false;
        state.selected = { id: 'safe-layout-fixture', name: 'Synthetic layout fixture', mimeType: 'video/mp4' };
        el.playerTitle.textContent = state.selected.name;
        el.mobileShortsTitle.textContent = state.selected.name;
        el.mediaLoading.hidden = true; el.mediaError.hidden = true;
        el.imageViewer.hidden = true; el.videoPlayer.hidden = false; el.videoPlayer.muted = true;
        el.videoPlayer.src = '/fixture.mp4'; el.videoPlayer.classList.add('is-ready'); el.videoPlayer.load();
      });
      await page.waitForFunction(() => el.videoPlayer.readyState >= 2);
      await page.evaluate(() => { updatePlayPauseUI(); playerChromePointer = true; revealPlayerChrome(); clearTimeout(controlsHideTimer); });
      await page.waitForFunction(() => [...playerChrome.querySelectorAll('.favorite-toggle')].some(n => n.getClientRects().length && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden'));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const measure = () => page.evaluate(() => {
        const rect = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
        const visible = n => !n.hidden && n.getClientRects().length && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden';
        return { viewport: { width: innerWidth, height: innerHeight }, modal: rect(el.playerModal), stage: rect(el.mediaStage), video: rect(el.videoPlayer), chrome: rect(playerChrome), scroll: { top: el.mediaStage.scrollTop, left: el.mediaStage.scrollLeft, height: el.mediaStage.scrollHeight, clientHeight: el.mediaStage.clientHeight, overflow: getComputedStyle(el.mediaStage).overflow }, children: [...el.playerModal.children].map(n => ({ tag: n.tagName, id: n.id, ...rect(n) })), favorites: [...playerChrome.querySelectorAll('.favorite-toggle')].filter(visible).map(n => n.id), semantics: ['topbarPrevBtn', 'topbarNextBtn', 'ctrlFramePrev', 'ctrlFrameNext'].map(id => ({ id, label: document.getElementById(id).getAttribute('aria-label'), visible: Boolean(visible(document.getElementById(id))) })), fit: getComputedStyle(el.videoPlayer).objectFit, videoWidth: el.videoPlayer.videoWidth, videoHeight: el.videoPlayer.videoHeight };
      });
      const normal = await measure();
      await page.screenshot({ path: path.join(out, `${viewport.width}x${viewport.height}-controls.png`) });
      await page.evaluate(() => { el.ambientBackdrop.scrollIntoView({ block: 'end', inline: 'nearest' }); });
      const scrollIntoView = await measure();
      await page.evaluate(() => { el.mediaStage.scrollTop = 0; el.mediaStage.scrollLeft = 0; });
      await page.evaluate(() => { el.mediaStage.scrollTop = el.mediaStage.scrollHeight; });
      const scrolled = await measure();
      fs.writeFileSync(path.join(out, `${viewport.width}x${viewport.height}-geometry.json`), JSON.stringify({ normal, scrollIntoView, scrolled }, null, 2));
      await page.screenshot({ path: path.join(out, `${viewport.width}x${viewport.height}-scroll-discriminator.png`) });
      if (!baseline) {
        assert.equal(scrollIntoView.scroll.top, 0, 'native scrollIntoView cannot move clipped stage');
        assert.equal(scrolled.scroll.top, 0, 'clipped stage is not a hidden programmatic scroll container');
        assert.equal(scrolled.video.y, scrolled.stage.y, 'video stays aligned to stage');
        assert.equal(scrolled.chrome.bottom, scrolled.stage.bottom, 'controls have no phantom footer');
        assert.equal(normal.favorites.length, 1, `exactly one responsive favorite action at ${viewport.width}x${viewport.height}`);
        assert.equal(normal.fit, 'contain', 'original aspect fit is preserved');
        if (viewport.width > 768) assert(normal.semantics.every(n => n.visible), 'video navigation and frame steps remain separately visible');
        assert.deepEqual(errors, []);
      }
      await page.evaluate(() => { el.mediaStage.scrollTop = 0; });
      await page.keyboard.press('Tab');
      const keyboard = await page.evaluate(() => ({ idle: el.playerModal.classList.contains('controls-idle'), inert: playerChrome.inert, active: document.activeElement.id, scrollTop: el.mediaStage.scrollTop }));
      assert(!keyboard.idle && !keyboard.inert, 'Tab preserves explicit control access');
      await page.evaluate(() => { playerChromePointer = false; setPlayerChromeVisible(false); el.videoPlayer.play(); });
      await page.waitForFunction(() => !el.videoPlayer.paused);
      await page.evaluate(() => el.videoPlayer.pause());
      const pauseQuiet = await page.evaluate(() => el.playerModal.classList.contains('controls-idle') && playerChrome.inert);
      assert(pauseQuiet, 'pause does not reveal controls');
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      assert(await page.evaluate(() => el.playerModal.classList.contains('controls-idle')), 'ordinary movement does not reveal controls');
      if (viewport.width <= 600) await page.touchscreen.tap(viewport.width / 2, viewport.height - 3);
      else await page.mouse.move(viewport.width / 2, viewport.height - 3);
      await page.waitForFunction(() => !el.playerModal.classList.contains('controls-idle') && !playerChrome.inert);
      const bottomReveal = await page.evaluate(() => ({ scrollTop: el.mediaStage.scrollTop, paused: el.videoPlayer.paused }));
      assert.equal(bottomReveal.scrollTop, 0); assert(bottomReveal.paused, 'bottom entry reveals controls without toggling pause');
      await page.evaluate(() => {
        el.videoPlayer.hidden = true; el.imageViewer.hidden = false;
        el.imageViewer.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#126"/></svg>');
        el.imageViewer.classList.add('is-ready'); updatePlayPauseUI(); playerChromePointer = true; revealPlayerChrome(); clearTimeout(controlsHideTimer);
      });
      await page.waitForFunction(() => el.imageViewer.complete && el.imageViewer.naturalWidth > 0);
      const imageFavorite = await page.evaluate(() => [...playerChrome.querySelectorAll('.favorite-toggle')].filter(n => n.getClientRects().length && !n.closest('[hidden]') && getComputedStyle(n).display !== 'none').map(n => n.id));
      assert.equal(imageFavorite.length, 1, 'images preserve their single responsive favorite action');
      if (baseline && viewport.width === 1911) assert.equal(scrolled.scroll.top, 171, 'baseline reproduces reported171px phantom footer');
      rows.push({ requestedViewport: viewport, normal, scrollIntoView, scrolled, keyboard, pauseQuiet, bottomReveal, imageFavorite, errors });
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ observedAt: new Date().toISOString(), source: baseline ? '8bb047c' : 'working tree', memory, realDrive: false, physicalDevice: false, rows }, null, 2));
    console.log(JSON.stringify({ source: baseline ? '8bb047c' : 'working tree', passed: rows.length, rows: rows.map(r => ({ viewport: r.requestedViewport, nativeScrollTop: r.scrollIntoView.scroll.top, forcedScrollTop: r.scrolled.scroll.top, videoY: r.scrolled.video.y, controlsBottom: r.scrolled.chrome.bottom, favorites: r.normal.favorites, pauseQuiet: r.pauseQuiet, bottomReveal: r.bottomReveal, imageFavorite: r.imageFavorite, errors: r.errors })) }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
