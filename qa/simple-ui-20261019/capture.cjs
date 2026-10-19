'use strict';
// D097 "simple is best" UI pass: local app (demo mode) + maintained local MP4; no account/Drive requests.
// Usage: node qa/simple-ui-20261019/capture.cjs <label>
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const label = process.argv[2] || 'before';
const out = path.resolve(root, '../maintenance/tools/simple-ui-20261019', label);
fs.mkdirSync(out, { recursive: true });
const VIDEO = 'qa/seek-range-h264-aac.mp4';
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json',
  '.wasm':'application/wasm', '.mp4':'video/mp4' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1)) || 'index.html';
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || /^(memory|worker|node_modules)\//.test(name)
    || (name.startsWith('qa/') && name !== VIDEO) || !types[path.extname(name)] || !fs.existsSync(file)) return res.writeHead(404).end();
  const bytes = fs.readFileSync(file), match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  if (name.endsWith('.mp4') && match) {
    const start = Number(match[1]), end = Math.min(bytes.length - 1, match[2] ? Number(match[2]) : bytes.length - 1);
    res.writeHead(206, { 'Content-Type':'video/mp4', 'Accept-Ranges':'bytes', 'Content-Range':`bytes ${start}-${end}/${bytes.length}` });
    return res.end(bytes.subarray(start, end + 1));
  }
  res.writeHead(200, { 'Content-Type':types[path.extname(name)], 'Cache-Control':'no-store' });
  res.end(bytes);
});

const library = async page => {
  await page.goto(`${base}/?demo=1`);
  await page.waitForFunction(() => typeof state !== 'undefined' && state.demo && !el.libraryView.hidden, null, { timeout: 30000 });
  await page.waitForTimeout(600);
};
// Opens the real player shell on the local MP4 the same way qa/mobile-hold-speed does.
const player = async page => {
  await library(page);
  await page.evaluate(src => {
    el.playerSheet.hidden = false; el.mediaError.hidden = true; el.mediaLoading.hidden = true;
    state.selected = { id:'local-video', name:'공연비 50만원이면서 출연료 30만원 부른 비호감 게스트 정상수 - [AK! CAST-EP.8 PART I] [1W9vjn6eeUQ].mp4', mimeType:'video/mp4' };
    state.mediaAttempt = 'range'; state.pendingPlay = false; state.isSeeking = false;
    el.playerTitle.textContent = state.selected.name;
    el.playerQuality.textContent = '원본 · 1080p'; el.playerQuality.hidden = false;
    el.videoPlayer.dataset.mediaSession = String(state.mediaSession); el.videoPlayer.hidden = false;
    el.imageViewer.hidden = true; el.videoPlayer.muted = false; el.videoPlayer.loop = true;
    el.videoPlayer.src = '/' + src; el.videoPlayer.classList.add('is-ready');
    el.customVideoControls.hidden = false; setNativeVideoActionsAvailable(true);
    document.body.classList.add('player-open');
  }, VIDEO);
  await page.waitForFunction(() => el.videoPlayer.readyState >= 2);
  await page.evaluate(async () => { el.videoPlayer.volume = 0.6; updateVolumeUI(); el.videoPlayer.muted = true; await el.videoPlayer.play(); el.videoPlayer.muted = false; el.videoPlayer.pause(); updatePlayPauseUI(); });
};

const states = {
  library,
  async cardHover(page) { await library(page); await page.locator('.file-card').first().hover(); await page.waitForTimeout(300); },
  async fileName(page) { await library(page); await page.evaluate(() => { el.fileNameText.textContent = '20261010_2109042647793115136_공연비 50만원이면서 출연료 30만원 부른 비호감 게스트.mp4'; el.fileNameDialog.showModal(); }); await page.waitForTimeout(400); },
  async mediaError(page) { await library(page); await page.locator('.file-card .file-card-open').first().click(); await page.waitForTimeout(1500); },
  async controls(page) { await player(page); await page.evaluate(() => { playerChromePointer = true; revealPlayerChrome(); }); await page.waitForTimeout(300); },
  async loading(page) { await player(page); await page.evaluate(() => { setPlayerChromeVisible(false); showMediaLoading(); }); await page.waitForTimeout(300); await page.evaluate(() => { el.mediaLoading.hidden = false; }); await page.waitForTimeout(500); },
  async loadingProgress(page) { await player(page); await page.evaluate(() => { setPlayerChromeVisible(false); showMediaLoading(); }); await page.waitForTimeout(300); await page.evaluate(() => { el.mediaLoading.hidden = false; setMediaLoadingProgress(42); }); await page.waitForTimeout(500); },
  async seekForward(page) { await player(page); await page.evaluate(async () => { await el.videoPlayer.play(); setPlayerChromeVisible(false); seekRelative(10); }); await page.waitForTimeout(120); },
  async seekBackTwice(page) { await player(page); await page.evaluate(async () => { el.videoPlayer.currentTime = 40; await el.videoPlayer.play(); setPlayerChromeVisible(false); seekRelative(-10); seekRelative(-10); }); await page.waitForTimeout(120); },
  async hold2x(page) { await player(page); await page.evaluate(async () => { await el.videoPlayer.play(); setPlayerChromeVisible(false); showPlayerFeedback(MOBILE_HOLD_SPEED_FEEDBACK, { persistent:true }); }); await page.waitForTimeout(300); },
};

let base;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  const report = [];
  try {
    for (const [vp, width, height, mobile] of [['desktop', 1440, 900, false], ['phone', 390, 844, true]]) {
      for (const [name, run] of Object.entries(states)) {
        if (mobile && name === 'cardHover') continue;
        const context = await browser.newContext({ viewport:{ width, height }, isMobile:mobile, hasTouch:mobile, serviceWorkers:'block', colorScheme:'dark', locale:'ko-KR' });
        await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
        let failure = null;
        try { await run(page); } catch (e) { failure = String(e.message).split('\n')[0]; }
        await page.screenshot({ path: path.join(out, `${vp}-${name}.png`) });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        report.push({ viewport: vp, state: name, failure, errors, overflow });
        await context.close();
      }
    }
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  for (const r of report) console.log(`${r.viewport.padEnd(8)} ${r.state.padEnd(16)} ${[r.failure && `FAIL ${r.failure}`, r.errors.length && `errors ${r.errors.join(' / ')}`, r.overflow && 'overflow'].filter(Boolean).join(' | ') || 'ok'}`);
})().catch(e => { console.error(e); process.exitCode = 1; });
