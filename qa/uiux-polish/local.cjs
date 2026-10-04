'use strict';
// Isolated real Chrome DOM/input; synthetic catalog and local MP4 readiness only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, '../maintenance/tools/uiux-polish');
fs.mkdirSync(out, { recursive: true });
if (fs.existsSync(path.join(out, 'local-results.json'))) fs.copyFileSync(path.join(out, 'local-results.json'), path.join(out, `local-results-prior-${Date.now()}.json`));
const names = ['app.js', 'index.html', 'styles.css'];
const snapshot = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(root, name))]));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashes = Object.fromEntries(names.map(name => [name, sha256(snapshot[name])]));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  const target = path.resolve(root, name === 'fixture.mp4' ? 'qa/faststart-h264-aac.mp4' : name);
  if (!target.startsWith(root + path.sep) || !types[path.extname(target)] || !fs.existsSync(target)) return res.writeHead(404).end();
  const bytes = snapshot[name] || fs.readFileSync(target);
  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : bytes.length - 1, bytes.length - 1);
    res.writeHead(206, { 'Content-Type': types[path.extname(target)], 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return res.end(bytes.subarray(start, end + 1));
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(target)], 'Cache-Control': 'no-store', 'Content-Length': bytes.length }); res.end(bytes);
});
const rect = async (page, selector) => page.locator(selector).evaluate(node => node.getBoundingClientRect().toJSON());
const inside = (r, w, h, label) => assert.ok(r.x >= -1 && r.y >= -1 && r.right <= w + 1 && r.bottom <= h + 1, `${label} in viewport`);
const visibleChrome = page => page.evaluate(() => !el.playerModal.classList.contains('controls-idle'));
async function reveal(page) { await page.keyboard.press('Tab'); assert.equal(await visibleChrome(page), true); }
async function activate(page, selector, touch) { if (touch) await page.locator(selector).tap(); else await page.locator(selector).click(); }
async function readyVideo(page) {
  await page.evaluate(() => {
    // The demo deliberately refuses video. Only fixture readiness is supplied.
    el.videoPlayer.hidden = false; el.videoPlayer.dataset.mediaSession = String(state.mediaSession);
    el.videoPlayer.src = '/fixture.mp4'; el.videoPlayer.muted = true; el.videoPlayer.load();
    el.mediaError.hidden = true; el.mediaLoading.hidden = true; el.playerModal.classList.remove('media-recovery-mode');
    state.pendingPlay = false; state.mediaAttempt = 'range'; state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    setNativeVideoActionsAvailable(true); updatePlayPauseUI(); updateQualityDisplay();
  });
  await page.waitForFunction(() => el.videoPlayer.readyState >= 4);
  await page.waitForTimeout(50);
  await page.evaluate(() => { el.videoPlayer.pause(); updatePlayPauseUI(); updateVideoProgress(); });
  await reveal(page);
}
async function checkLibrary(page, row, width, height, touch) {
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
    const c = canvas.getContext('2d'); c.fillStyle = '#203344'; c.fillRect(0, 0, 192, 108);
    c.fillStyle = '#42627b'; c.fillRect(20, 20, 58, 88); c.fillStyle = '#8aabb6'; c.fillRect(107, 40, 65, 68);
    const thumbnailLink = canvas.toDataURL();
    state.files = Array.from({ length: 12 }, (_, i) => ({ id: `polish-fixture-${i}`, name: i === 2 ? '사진 — 하늘과 바다.jpg' : `같은 접두사의 긴 파일 이름 — 서로 구별되는 제목 ${i + 1}과 마지막 설명 [EP.${i + 1}] [PARTII].mp4`, mimeType: i === 2 ? 'image/jpeg' : 'video/mp4', size: '12345678', modifiedTime: '2026-10-04T00:00:00Z', thumbnailLink, videoMediaMetadata: { width: 1920, height: 1080, durationMillis: 95000 } }));
    state.filter = 'all'; state.query = ''; state.currentFolderId = 'fixture-folder'; state.currentFolderName = '뷰너'; state.folderStack = [];
    renderBreadcrumb(); renderFiles({ resetWindow: true });
    el.libraryStatus.textContent = ''; el.librarySummary.textContent = '미디어 12개 · 격리된 로컬 확인';
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no library horizontal overflow');
  const tabs = await page.locator('.segmented button').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().width));
  assert.ok(Math.max(...tabs) - Math.min(...tabs) < 1, 'four equal-width filters');
  const lines = await page.locator('.file-card-title').first().evaluate(n => ({ height: n.getBoundingClientRect().height, line: parseFloat(getComputedStyle(n).lineHeight), clamp: getComputedStyle(n).webkitLineClamp }));
  assert.equal(lines.clamp, '2'); assert.ok(Math.abs(lines.height - lines.line * 2) < 1, 'two filename lines reserved');
  await page.screenshot({ path: path.join(out, `${width}x${height}-library.png`) });
  const title = page.locator('.file-card-name-button').first(); await title.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#fileNameDialog').evaluate(n => n.open), true);
  assert.equal(await page.locator('#fileNameText').textContent(), '같은 접두사의 긴 파일 이름 — 서로 구별되는 제목 1과 마지막 설명 [EP.1] [PARTII].mp4');
  assert.equal(await page.locator('.file-card-status').first().textContent(), 'EP.1 · PARTII');
  await page.keyboard.press('Escape'); assert.equal(await title.evaluate(n => n === document.activeElement), true, 'filename focus restored');
  if (touch) await title.tap(); else await title.click(); assert.equal(await page.locator('#fileNameDialog').evaluate(n => n.open), true); await page.locator('#fileNameDialog button').click();
  await page.locator('#settingsButton').click(); assert.equal(await page.locator('#settingsAdvanced').evaluate(n => n.open), false);
  await page.locator('#settingsAdvanced > summary').click(); await page.locator('#settingsDialog .dialog-content').evaluate(n => n.scrollTop = n.scrollHeight);
  await page.keyboard.press('Escape'); await page.locator('#settingsButton').click();
  assert.equal(await page.locator('#settingsDialog .dialog-content').evaluate(n => n.scrollTop), 0, 'gear resets after Escape');
  await page.locator('#settingsDialog .dialog-content').evaluate(n => n.scrollTop = n.scrollHeight);
  await page.locator('#settingsDialog button[type=submit]').click(); await page.locator('#settingsButton').click();
  assert.equal(await page.locator('#settingsDialog .dialog-content').evaluate(n => n.scrollTop), 0, 'gear resets after close button');
  await page.locator('#settingsDialog button[type=submit]').click();
  // Use the real bound help entry, normally visible on the disconnected screen.
  await page.evaluate(() => { el.libraryView.hidden = true; el.setupView.hidden = false; });
  await page.locator('#openSetupHelp').click(); assert.equal(await page.locator('#settingsAdvanced').evaluate(n => n.open), true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const { help, body } = await page.evaluate(() => ({ help: el.setupHelpSection.getBoundingClientRect().toJSON(), body: el.settingsDialog.querySelector('.dialog-content').getBoundingClientRect().toJSON() }));
  assert.ok(help.top >= body.top - 2 && help.top < body.bottom, 'help anchor is visible after disclosure');
  await page.screenshot({ path: path.join(out, `${width}x${height}-settings-help.png`) });
  await page.keyboard.press('Escape'); await page.evaluate(() => { el.setupView.hidden = true; el.libraryView.hidden = false; });
  row.librarySettings = true;
}
async function checkPlayer(page, row, width, height, touch) {
  const opener = page.locator('.file-card-open').first(); await opener.focus(); await page.keyboard.press('Enter'); await readyVideo(page);
  // Actual reverse traversal must never land inside a closed native details.
  await page.locator('#closePlayerButton').focus();
  row.reverseTab = [];
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Shift+Tab');
    const active = await page.evaluate(() => { const n = document.activeElement, closed = n.closest('details:not([open])'); return { id: n.id || n.tagName, valid: isOperablePlayerControl(n), closedControl: !!closed && n !== closed.querySelector(':scope > summary') }; });
    row.reverseTab.push(active.id); assert.equal(active.closedControl, false); assert.equal(active.valid, true);
  }
  // Fixture transport flags exercise quality presentation without claiming Drive proof.
  for (const verified of [false, true]) {
    await page.evaluate(flag => { state.demo = false; state.mediaTransportVerified = flag; updateQualityDisplay(); }, verified);
    assert.match(await page.locator('#playerQuality').textContent(), verified ? /^원본/ : /^미확인/);
    const q = await rect(page, '#playerQuality'), title = await rect(page, '#playerTitle'), close = await rect(page, '#closePlayerButton');
    assert.ok(q.right <= close.left + 1, 'quality clears close button');
    assert.ok(q.left >= title.right - 1 || q.top >= title.bottom - 1, 'quality clears title');
  }
  await page.screenshot({ path: path.join(out, `${width}x${height}-player.png`) });
  await page.evaluate(() => { state.demo = true; });
  const touchLayout = await page.locator('#shortsMoreBtn').isVisible();
  const more = page.locator(touchLayout ? '#shortsMoreBtn' : '#playerMoreMenu > summary');
  await activate(page, touchLayout ? '#shortsMoreBtn' : '#playerMoreMenu > summary', touch); assert.equal(await visibleChrome(page), true, 'menu button does not hide chrome');
  await reveal(page);
  const panel = await rect(page, touchLayout ? '#shortsExpandRow' : '.player-more-popover'); inside(panel, width, height, 'more menu');
  if (touchLayout) assert.ok(panel.width <= 191, 'compact mobile menu');
  await page.screenshot({ path: path.join(out, `${width}x${height}-menu.png`) });
  await activate(page, touchLayout ? '#shortsMoreBtn' : '#playerMoreMenu > summary', touch);
  const favorite = page.locator(touchLayout ? '#shortsFavoriteBtn' : '#ctrlFavorite');
  await activate(page, touchLayout ? '#shortsFavoriteBtn' : '#ctrlFavorite', touch); assert.equal(await visibleChrome(page), true, 'favorite button does not dismiss chrome');
  for (let i = 0; i < 3; i++) {
    await reveal(page); await activate(page, '#playerTitle', touch); assert.equal(await visibleChrome(page), false, 'blank title area dismisses chrome');
    if (touch) { await page.locator('#playerControlsEntry').tap(); assert.equal(await visibleChrome(page), true, 'touch blank entry reveals chrome'); }
    else { const entry = await rect(page, '#playerControlsEntry'); await page.mouse.move(entry.left + 4, entry.bottom - 4); assert.equal(await visibleChrome(page), true, 'desktop bottom hover reveals chrome'); }
  }
  // Speed UI uses actual media rate and radio state, then native load reset.
  await reveal(page);
  if (!touchLayout) { await page.locator('#ctrlSpeedButton').click(); await page.locator('#speedDropdown [data-speed="1.5"]').click(); }
  else await page.evaluate(() => { el.videoPlayer.playbackRate = 1.5; });
  await page.waitForFunction(() => el.ctrlSpeedText.textContent === '1.5×');
  assert.equal(await page.locator('#speedDropdown [data-speed="1.5"]').getAttribute('aria-checked'), 'true');
  await page.evaluate(() => { el.videoPlayer.load(); });
  await page.waitForFunction(() => el.videoPlayer.playbackRate === 1 && el.ctrlSpeedText.textContent === '1×');
  assert.equal(await page.locator('#speedDropdown [data-speed="1"]').getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('#speedDropdown .active').count(), 1);
  await reveal(page); await page.locator('#closePlayerButton').click();
  await page.waitForFunction(() => el.playerSheet.hidden);
  await page.waitForFunction(() => document.activeElement?.classList.contains('file-card-open'));
  row.playerCloseFocus = true;
  const image = page.locator('.file-card-open').nth(2); await image.focus(); await page.keyboard.press('Enter'); await reveal(page);
  assert.equal(await page.locator('#topbarPrevBtn').getAttribute('aria-label'), '이전 이미지');
  assert.equal(await page.locator('#ctrlNextVideo').getAttribute('aria-label'), '다음 이미지');
  assert.equal(await page.locator('#playerQuality').isVisible(), false);
  await page.locator('#closePlayerButton').click();
  await page.waitForFunction(() => document.activeElement?.closest('.file-card')?.dataset.fileId === 'polish-fixture-2');
  await opener.focus(); await page.keyboard.press('Enter'); await readyVideo(page);
  assert.equal(await page.locator('#topbarPrevBtn').getAttribute('aria-label'), '이전 영상');
  row.playerScenarios = true;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const rows = [];
  try {
    for (const [width, height, touch] of [[1188, 900, false], [1440, 900, false], [320, 568, true], [360, 740, true], [667, 375, true], [844, 390, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage(); page.setDefaultTimeout(6000); const errors = [];
      page.on('pageerror', error => errors.push(error.message)); const row = { width, height, touch, passed: false };
      try {
        await page.goto(`${base}/?demo=1`); await page.waitForFunction(() => typeof playerChrome !== 'undefined' && playerChrome && !el.libraryView.hidden, null, { timeout: 15000 });
        await checkLibrary(page, row, width, height, touch); await checkPlayer(page, row, width, height, touch); assert.deepEqual(errors, []); row.passed = true;
      } catch (error) { row.failure = error.message; row.errors = errors; row.stack = error.stack?.split('\n').slice(1, 3).map(line => line.trim()); await page.screenshot({ path: path.join(out, `${width}x${height}-failure.png`) }); }
      rows.push(row); console.log(`${width}x${height}: ${row.passed ? 'PASS' : row.failure}`); await context.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  const results = { proof: 'Isolated real Chrome layout and keyboard/pointer scenarios. Synthetic catalog, local MP4 fixture and supplied quality flags. No account, original-media, physical-device, or production acceptance.', hashes, producerSHA256: sha256(fs.readFileSync(__filename)), rows };
  fs.writeFileSync(path.join(out, 'local-results.json'), JSON.stringify(results, null, 2));
  if (rows.some(row => !row.passed)) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; server.close(); });
