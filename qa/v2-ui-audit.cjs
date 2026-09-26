'use strict';
// Isolated synthetic UI evidence. No account, Drive media or mutations.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const phase = process.argv[2] === 'before' ? 'before' : 'after';
const out = path.join(__dirname, 'v2-ui', phase);
fs.mkdirSync(out, { recursive: true });
const allowed = new Set(['index.html', 'app.js', 'styles.css', 'runtime-config.js', 'manifest.webmanifest']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed.has(name)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(name)], 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(root, name)));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      let previews = 0;
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base) return route.continue();
        if (url.hostname === 'drive.google.com' && url.pathname.endsWith('/preview')) {
          previews++;
          return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><body style="background:#111;color:white">Synthetic external document — not playback</body>' });
        }
        return route.abort();
      });
      await page.goto(`${base}/?demo=1`);
      await page.waitForFunction(() => typeof setupPlayerChrome === 'function' && !!playerChrome);
      await page.evaluate(() => {
        el.playerSheet.hidden = false;
        state.selected = { id: 'synthetic-ui-video', name: 'UI fixture', mimeType: 'video/mp4' };
        el.videoPlayer.hidden = false;
        setNativeVideoActionsAvailable(true);
        updatePlayPauseUI();
        if (el.customVideoControls.hidden) throw new Error('fixture must begin with visible native controls');
        showDrivePreview(state.selected, '테스트 재생 실패');
      });
      await page.waitForTimeout(100);
      const automaticFrame = await page.locator('#drivePreview').getAttribute('src');
      const automaticExternal = Boolean(automaticFrame && automaticFrame !== 'about:blank');
      if (phase === 'before') assert.equal(automaticExternal, true, 'reproduce automatic external fallback');
      else {
        assert.equal(automaticExternal, false);
        assert.equal(previews, 0, 'failure makes no Google preview request');
        assert.equal(await page.evaluate(() => el.customVideoControls.hidden && el.videoPlayer.hidden), true, 'failed video does not leave dead playback controls');
        const recoveryFocus = [];
        for (let step = 0; step < 4; step++) {
          await page.keyboard.press('Tab');
          recoveryFocus.push(await page.evaluate(() => document.activeElement.id));
        }
        assert.deepEqual(recoveryFocus, ['retryMediaButton', 'compatPlayerButton', 'openDriveButton', 'closeMediaErrorButton']);
        await page.locator('#closeMediaErrorButton').click();
        assert.equal(await page.locator('#playerSheet').isVisible(), false);
        await page.evaluate(() => { el.playerSheet.hidden = false; });
      }
      await page.evaluate(() => {
        state.selected = { id: 'synthetic-ui-video', name: 'UI fixture', mimeType: 'video/mp4' };
        showDrivePreview(state.selected, '사용자 선택', { userInitiated: true });
      });
      await page.waitForFunction(() => state.mediaAttempt === 'drive-preview-page');
      const owned = await page.evaluate(() => playerChrome.contains(el.drivePreviewActions));
      assert.equal(owned, phase !== 'before');
      await page.waitForTimeout(220);
      await page.screenshot({ path: path.join(out, `${mobile ? 'mobile' : 'desktop'}-hidden.png`) });
      if (phase === 'after') {
        assert.equal(await page.locator('#drivePreviewActions').isVisible(), false);
        if (mobile) await page.touchscreen.tap(195, 837);
        else await page.mouse.move(640, 797);
        await page.locator('#drivePreviewRetryButton').waitFor({ state: 'visible' });
        await page.waitForFunction(() => getComputedStyle(playerChrome).opacity === '1');
        const buttons = await page.locator('#drivePreviewActions button').evaluateAll(nodes => nodes.map(n => {
          const r = n.getBoundingClientRect(); return { width: r.width, height: r.height, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
        }));
        assert.ok(buttons.every(b => b.inside && b.height >= 44));
        await page.screenshot({ path: path.join(out, `${mobile ? 'mobile' : 'desktop'}-revealed.png`) });
        await page.locator('#hidePlayerControlsButton').click();
        assert.equal(await page.locator('#drivePreviewActions').isVisible(), false);
        await page.locator('#playerControlsEntry').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => playerChrome.contains(document.activeElement) && !playerChrome.inert), true);
        assert.equal(await page.locator('#drivePreviewRetryButton').isVisible(), true);
        await page.evaluate(() => { state.demo = true; });
        await page.locator('#drivePreviewRetryButton').click();
        assert.equal(await page.locator('#drivePreview').isVisible(), false, 'retry returns to original, never repeats iframe');
      }
      assert.deepEqual(errors, []);
      results.push({ mobileViewport: mobile, automaticExternal, actionsOwnedByChrome: owned, syntheticPreviewRequests: previews, physicalDevice: false });
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ phase, observedAt: new Date().toISOString(), results }, null, 2));
    console.log(JSON.stringify({ phase, passed: results.length, results }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
