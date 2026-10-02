'use strict';

// Default mode is preparation only. --run is intentionally explicit and uses
// isolated local Playwright contexts with a synthetic Drive provider.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const candidateArg = process.argv.indexOf('--candidate');
const candidateRef = candidateArg >= 0 ? process.argv[candidateArg + 1] : '051dc3456f5000b958a18593848769b3687991e5';
if (candidateArg >= 0 && (!candidateRef || candidateRef.startsWith('--'))) throw new Error('--candidate requires a git commit or ref');
const candidateCommit = cp.execFileSync('git', ['-C', root, 'rev-parse', `${candidateRef}^{commit}`], { encoding: 'utf8' }).trim();
const candidateVersion = JSON.parse(cp.execFileSync('git', ['-C', root, 'show', `${candidateCommit}:version.json`], { encoding: 'utf8' })).version;
const fixturePath = 'qa/fm05-controlled-diagnostic/subtitle.mp4';
const fixtureSha = 'd9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037';
const releases = [
  { label: 'rc35-baseline', commit: '2c2b1244bee0f1a5e500318c83c6e126c5124e34', version: '1.22.0-rc.35' },
  { label: 'candidate', commit: candidateCommit, version: candidateVersion },
];
const limits = { fixtureBytesMax: 1024 * 1024, apiBytesMaxPerRelease: 24 * 1024 * 1024,
  apiRequestsMaxPerRelease: 512, phaseTimeoutMs: 15000, totalPairTimeoutMs: 60000,
  nodeRssMaxBytes: 768 * 1024 * 1024, nodeHeapUsedMaxBytes: 256 * 1024 * 1024 };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const syntheticMetadata = { id: 'fixture', headRevisionId: 'A', size: '659966', mimeType: 'video/mp4',
  modifiedTime: 'A', sha256Checksum: fixtureSha, trashed: false,
  capabilities: { canDownload: true, canReadRevisions: true } };
const syntheticMetadataBody = JSON.stringify(syntheticMetadata);
const syntheticMetadataSha256 = hash(Buffer.from(syntheticMetadataBody));
const prepPath = path.join(__dirname, 'preparation-result.json');

function git(args, encoding = null) {
  return cp.execFileSync('git', ['-C', root, ...args], { encoding, maxBuffer: 64 * 1024 * 1024 });
}
function show(commit, file) { return git(['show', `${commit}:${file}`]); }
function bounded(promise, ms, label, onTimeout = () => {}) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => {
    try { onTimeout(); } finally { reject(new Error(`${label}_TIMEOUT`)); }
  }, ms); })]).finally(() => clearTimeout(timer));
}
function publicFiles(commit) {
  const source = show(commit, 'scripts/public-files.cjs').toString('utf8');
  const array = source.match(/Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1];
  assert(array, `${commit}: public asset array missing`);
  const files = [...array.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert(files.includes('index.html') && files.includes('app.js') && files.includes('sw.js'), `${commit}: public runtime list incomplete`);
  assert.equal(new Set(files).size, files.length, `${commit}: duplicate public asset`);
  return files;
}
function releaseInfo(release, includeHashes = false) {
  const files = publicFiles(release.commit);
  const version = JSON.parse(show(release.commit, 'version.json').toString('utf8'));
  assert.equal(version.version, release.version, `${release.label}: version pin mismatch`);
  const assets = files.map(file => {
    const bytes = show(release.commit, file);
    return { file, bytes: bytes.length, sha256: hash(bytes) };
  });
  return { label: release.label, commit: release.commit, version: version.version,
    publicAssetCount: files.length, publicFilesSha256: hash(Buffer.from(files.join('\n'))),
    assets: includeHashes ? assets : undefined, files };
}
function fixtureBytes() {
  const bytes = fs.readFileSync(path.join(root, fixturePath));
  assert.equal(bytes.length, 659966, 'fixture size changed');
  assert.equal(hash(bytes), fixtureSha, 'fixture SHA-256 changed');
  assert(bytes.length <= limits.fixtureBytesMax, 'fixture exceeds bound');
  return bytes;
}
function checkFixtureAtRevisions() {
  for (const release of releases) {
    const bytes = show(release.commit, fixturePath);
    assert.equal(bytes.length, 659966, `${release.label}: fixture byte count changed`);
    assert.equal(hash(bytes), fixtureSha, `${release.label}: fixture SHA-256 changed`);
  }
}
function probeFixture(bytes) {
  const probe = JSON.parse(cp.execFileSync('ffprobe', ['-v', 'error', '-show_entries',
    'stream=index,codec_name,codec_type,width,height:stream_tags=language:format=duration,size',
    '-of', 'json', path.join(root, fixturePath)], { encoding: 'utf8' }));
  const streams = probe.streams.map(({ index, codec_name, codec_type, width, height }) => ({ index, codec: codec_name, type: codec_type, width, height }));
  assert.deepEqual(streams, [
    { index: 0, codec: 'h264', type: 'video', width: 320, height: 180 },
    { index: 1, codec: 'aac', type: 'audio', width: undefined, height: undefined },
    { index: 2, codec: 'mov_text', type: 'subtitle', width: undefined, height: undefined },
  ], 'fixture stream layout changed');
  assert.equal(Number(probe.format.duration), 6, 'fixture duration changed');
  return { bytes: bytes.length, sha256: fixtureSha, streams, durationSeconds: 6,
    colorDeclaration: 'ffprobe reports no color fields; original native SDR interpretation remains the observed Chrome154 evidence' };
}
function prepare() {
  const dependencyPath=require.resolve('playwright/package.json');require('playwright');
  const dependencyBinding={path:dependencyPath,sha256:hash(fs.readFileSync(dependencyPath)),available:true,browserLaunched:false};
  checkFixtureAtRevisions();
  const bytes = fixtureBytes();
  const releaseRecords = releases.map(release => releaseInfo(release, true));
  const receipt = {
    schema: 'drive-original.rc36-matched-regression-preparation/1',
    dependencyBinding, actualExecuted: false, browserLaunched: false, accountOrDeviceUsed: false,
    scope: 'One generated six-second AVC/AAC/subtitle fixture. Same installed Chrome binary, fresh isolated contexts, synthetic read-only Drive provider, exact rc35 baseline and pinned candidate public runtime sources.',
    fixture: probeFixture(bytes), candidateRef, releases: releaseRecords.map(({ assets, files, ...entry }) => {
      const baseline = new Map(releaseRecords[0].assets.map(asset => [asset.file, asset.sha256]));
      return { ...entry, files, changedAssets: assets.filter(asset => baseline.get(asset.file) !== asset.sha256).map(asset => asset.file), assets };
    }),
    driverBinding: (() => { const body = fs.readFileSync(__filename); return { file: path.basename(__filename), bytes: body.length, sha256: hash(body) }; })(),
    procedure: ['rc35 cold context, synthetic Q0 first frame and pause', 'open normal player tracks menu and select AAC track 2',
      'capture mapped Q1 frame and direct native VideoFrame tuple', 'seek to 2s then terminal frame near 6s',
      'close player and confirm owners, readers, workers, sources, routes and server settle',
      'repeat the exact action and conditions in a fresh candidate cold context'],
    controls: { cache: 'fresh browser context for each release; same no-store localhost server policy; no warm result mixed in',
      network: 'same loopback and synthetic Google Drive route; log methods, path, Range, status and transferred bytes; exclude credentials/tokens',
      metadata: 'synthetic file id, revision A, size, MIME, modifiedTime A, checksum and capabilities are identical',
      expectedColor: 'candidate records the derived output tuple against direct native SDR observation; strict RGBA and cross-resource pixel equality are not gates' },
    limits, processMemoryAtPreparation: process.memoryUsage(),
    verification: { pinnedVersionsAndAssets: 'PASS', sameFixtureBytesAndSHAAtBothCommits: 'PASS', fixtureProbe: 'PASS', actualRun: 'NOT_RUN' },
  };
  fs.writeFileSync(prepPath, JSON.stringify(receipt, null, 2));
  console.log(`PREPARED ${prepPath}`);
}

const mime = file => ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.png': 'image/png', '.txt': 'text/plain' })[path.posix.extname(file)] || 'application/octet-stream';
function makeServer(release, info) {
  const allow = new Set(info.files);
  const expected = new Map(info.expectedAssets.map(asset => [asset.file, asset.sha256]));
  const cache = new Map();
  const metrics = { requests: 0, bytes: 0, files: Object.create(null), assetHashesMatched: true, closed: false };
  const server = http.createServer((req, res) => {
    metrics.requests++;
    let file;
    try { file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html'; }
    catch { res.writeHead(400).end(); return; }
    if (!allow.has(file) || file.split('/').includes('..') || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404).end(); return; }
    try {
      const body = cache.get(file) || show(release.commit, file);
      if (hash(body) !== expected.get(file)) throw new Error('PINNED_ASSET_HASH_MISMATCH');
      cache.set(file, body);
      metrics.bytes += body.length;
      metrics.files[file] = (metrics.files[file] || 0) + 1;
      res.writeHead(200, { 'Content-Type': mime(file), 'Content-Length': body.length, 'Cache-Control': 'no-store',
        'X-QA-Release': release.label, 'X-QA-Asset-SHA256': hash(body) });
      if (req.method === 'HEAD') res.end(); else res.end(body);
    } catch { metrics.assetHashesMatched = false; res.writeHead(500).end(); }
  });
  return { server, metrics, async listen() { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; },
    async close() {
      await bounded(new Promise(resolve => server.close(resolve)), 5000, 'SERVER_CLOSE', () => {
        server.closeAllConnections?.(); server.close(() => {});
      });
      metrics.closed = true;
    } };
}
function nativeTuple(frame) {
  const c = frame?.colorSpace || {};
  return { primaries: c.primaries ?? null, transfer: c.transfer ?? null, matrix: c.matrix ?? null, fullRange: c.fullRange ?? null };
}
function sameTuple(a, b) { return JSON.stringify(nativeTuple(a)) === JSON.stringify(nativeTuple(b)); }
async function snapshot(page) {
  return page.evaluate(() => ({ attempt: state.mediaAttempt, mode: state.mediaPlaybackMode,
    timeline: playerTimeline(), video: { time: el.videoPlayer.currentTime, paused: el.videoPlayer.paused,
      frames: el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames, error: el.videoPlayer.error?.code ?? null,
      source: el.videoPlayer.currentSrc || null }, q0Owner: !!q0Playback, q1Owner: !!q1Playback, tracksOwner: !!playerTracksOwner,
    identity: q1Playback?.routeIdentity ? { id: q1Playback.routeIdentity.fileId, revision: q1Playback.routeIdentity.headRevisionId,
      size: q1Playback.routeIdentity.size, mimeType: q1Playback.routeIdentity.mimeType,
      modifiedTime: q1Playback.routeIdentity.modifiedTime, sha256Checksum: q1Playback.routeIdentity.sha256Checksum } : null,
    selectedAudioTrackId: q1Playback?.selectedAudioTrackId ?? null,
    nativeColorObservation: q1Playback?.nativeColorObservation ?? null,
    player: q1Playback?.player?.stats?.() ?? null,
    workerEvents: window.__obsWorkers, errorVisible: !el.mediaError.hidden }));
}
async function waitPresentedFrame(page, { ownerKind, target, minGeneration = 0, minPresentedFrames = 0, binding = null }) {
  return page.evaluate(({ ownerKind, target, minGeneration, minPresentedFrames, binding, timeoutMs }) => new Promise((resolve, reject) => {
    const video = el.videoPlayer, started = performance.now(); let callbackId = null, timer = null, settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer);
      if (callbackId !== null) video.cancelVideoFrameCallback(callbackId); error ? reject(error) : resolve(value); };
    const capture = async (metadata, proof) => {
      if (typeof VideoFrame !== 'function') throw new Error('VIDEOFRAME_UNAVAILABLE');
      const frame = new VideoFrame(video);
      try {
        const rect = frame.visibleRect, bytes = new Uint8Array(frame.allocationSize({ rect }));
        const layout = await frame.copyTo(bytes, { rect }), digest = await crypto.subtle.digest('SHA-256', bytes);
        if (ownerKind === 'q1') {
          const latest = q1Playback, latestStats = latest?.player?.stats?.();
          if (!latest || latest.fileId !== binding.fileId || latest.session !== binding.session
            || latest.account !== binding.account || latest.accountGeneration !== binding.accountGeneration
            || latest.swGeneration !== mediaSourceGeneration || latest.swController !== navigator.serviceWorker.controller
            || latest.selectedAudioTrackId !== 2 || latestStats?.generation !== proof.generation
            || !['ready', 'buffered-to-end'].includes(latestStats?.phase) || !latestStats.pipeline || !latestStats.worker
            || latestStats.pipeline.generation !== latestStats.generation
            || latestStats.pipeline.selectedAudioTrackId !== 2 || latestStats.worker.activeReads !== 0
            || (latestStats.worker.pendingChunks ?? 0) !== 0)
            throw new Error('Q1_FRAME_OWNER_CHANGED_DURING_CAPTURE');
        }
        return { status: 'CAPTURED', mediaTime: video.currentTime, callbackMediaTime: metadata.mediaTime,
          presentedFrames: metadata.presentedFrames, callbackNow: metadata.presentationTime, actionAgeMs: performance.now() - started,
          format: frame.format, codedWidth: frame.codedWidth, codedHeight: frame.codedHeight, visibleRect: rect.toJSON(),
          colorSpace: frame.colorSpace.toJSON(), bytes: bytes.length,
          nativePlaneSha256: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''), layout, proof };
      } finally { frame.close(); }
    };
    const step = async (now, metadata) => {
      callbackId = null;
      try {
        const q1 = q1Playback, q0 = q0Playback, tracks = playerTracksOwner, stats = q1?.player?.stats?.();
        const ownerOk = ownerKind === 'q0'
          ? !!q0 && !q1 && !tracks && state.mediaAttempt === 'range'
          : !!q1 && !!tracks && q1.selectedAudioTrackId === 2 && q1.fileId === binding?.fileId
            && q1.session === binding?.session && q1.account === binding?.account
            && q1.accountGeneration === binding?.accountGeneration && q1.swGeneration === mediaSourceGeneration
            && q1.swController === navigator.serviceWorker.controller
            && stats?.failure == null && ['ready', 'buffered-to-end'].includes(stats?.phase)
            && !!stats.mapping && !!stats.pipeline && !!stats.worker
            && stats.generation > minGeneration && stats.pipeline.generation === stats.generation
            && stats.pipeline.selectedAudioTrackId === 2 && stats.worker.activeReads === 0
            && (stats.worker.pendingChunks ?? 0) === 0;
        const timeline = playerTimeline(), currentFrames = video.getVideoPlaybackQuality().totalVideoFrames;
        const mapping = stats?.mapping, targetMapped = ownerKind === 'q0' || Math.abs((mapping?.targetSource ?? Infinity) - target) <= .25
          || Math.abs((mapping?.endpoint?.requestedSource ?? Infinity) - target) <= .001;
        const currentPresented = metadata.presentedFrames >= Math.max(1, minPresentedFrames)
          && Math.abs(metadata.mediaTime - video.currentTime) <= .2
          && Math.abs(timeline.currentTime - target) <= .2;
        if (ownerOk && targetMapped && currentPresented && currentFrames >= metadata.presentedFrames) {
          const identity = ownerKind === 'q1' ? q1.routeIdentity : q0PinnedSource?.descriptor;
          if (ownerKind === 'q1' && (!identity || identity.fileId !== 'fixture' || identity.headRevisionId !== 'A'
            || identity.size !== '659966' || identity.mimeType !== 'video/mp4' || identity.sha256Checksum !== binding.sha256Checksum))
            throw new Error('Q1_IDENTITY_NOT_PINNED');
          const proof = { ownerKind, target, targetTimeline: timeline.currentTime, mappedTargetSource: mapping?.targetSource ?? null,
            generation: stats?.generation ?? null, phase: stats?.phase ?? null, appends: stats?.appends ?? null,
            selectedAudioTrackId: q1?.selectedAudioTrackId ?? null, presentedFrames: metadata.presentedFrames,
            currentPresentedFrame: true, ownerLifetimeMatched: true, identity: identity ? { fileId: identity.fileId, revision: identity.headRevisionId,
              size: identity.size, mimeType: identity.mimeType, modifiedTime: identity.modifiedTime, sha256Checksum: identity.sha256Checksum } : null,
            worker: stats?.worker ? { reads: stats.worker.reads, bytes: stats.worker.bytes, activeReads: stats.worker.activeReads,
              chunks: stats.worker.chunks, pendingChunks: stats.worker.pendingChunks, pendingWindows: stats.worker.pendingWindows } : null,
            pipeline: stats?.pipeline ? { selectedAudioTrackId: stats.pipeline.selectedAudioTrackId,
              outputBytes: stats.pipeline.outputBytes, packets: stats.pipeline.packets, encodersCreated: stats.pipeline.encodersCreated,
              outputColorObservation: stats.pipeline.outputColorObservation ?? null } : null };
          finish(null, await capture(metadata, proof)); return;
        }
      } catch (error) { finish(error); return; }
      callbackId = video.requestVideoFrameCallback(step);
    };
    timer = setTimeout(() => finish(new Error('CURRENT_PRESENTED_FRAME_TIMEOUT')), timeoutMs);
    callbackId = video.requestVideoFrameCallback(step);
  }), { ownerKind, target, minGeneration, minPresentedFrames, binding, timeoutMs: limits.phaseTimeoutMs });
}
async function runRelease(browser, release, info, expectedBrowser, pairStartedAt, entry, persist) {
  entry.status = 'RUNNING'; entry.version = release.version; entry.browserVersion = expectedBrowser;
  entry.providerMetadataSha256 = syntheticMetadataSha256; persist();
  const host = makeServer(release, info);
  let origin;
  let context, page;
  const phase = async (name, action) => {
    const start = Date.now(); const requestStart = entry.provider.requests.length, byteStart = entry.provider.bytes;
    const result = { name, startedAt: new Date(start).toISOString() };
    try {
      result.appVersionBefore = await page.evaluate(() => APP_VERSION);
      assert.equal(result.appVersionBefore, release.version, 'APP_VERSION_BEFORE_PHASE');
      result.value = await action();
      result.appVersionAfter = await page.evaluate(() => APP_VERSION);
      assert.equal(result.appVersionAfter, release.version, 'APP_VERSION_AFTER_PHASE');
      result.passed = true;
    }
    catch (error) { result.passed = false; result.error = { name: error.name, message: error.message }; throw error; }
    finally { result.elapsedMs = Date.now() - start; result.providerDelta = { requests: entry.provider.requests.length - requestStart,
      bytes: entry.provider.bytes - byteStart }; entry.phases.push(result); persist(); }
    return result.value;
  };
  try {
    origin = await bounded(host.listen(), 5000, 'SERVER_LISTEN');
    context = await bounded(browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' }), 5000, 'CONTEXT_CREATE');
    entry.initialContextCookies = (await context.cookies()).length;
    assert.equal(entry.initialContextCookies, 0, 'FRESH_CONTEXT_HAS_COOKIES');
    await context.addInitScript(() => {
      window.__obsWorkers = []; window.__obsWorkerSeq = 0;
      const Original = window.Worker;
      window.Worker = class extends Original {
        constructor(...args) {
          super(...args); const id = ++window.__obsWorkerSeq; window.__obsWorkers.push({ event: 'created', id, url: String(args[0]) });
          const terminate = this.terminate.bind(this); let terminated = false;
          this.terminate = (...params) => { if (!terminated) { terminated = true; window.__obsWorkers.push({ event: 'terminate-called', id }); }
            return terminate(...params); };
          this.addEventListener('message', ({ data }) => {
            if (data?.kind === 'window') window.__obsWorkers.push({ event: 'window', id, generation: data.generation, selectedAudioTrackId: data.value?.selectedAudioTrackId });
            if (data?.kind === 'terminal') window.__obsWorkers.push({ event: 'terminal-message', id, generation: data.generation, error: data.error?.message ?? null });
          }); }
      };
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== 'https://www.googleapis.com') return route.fulfill({ status: 403, body: '{}' });
      const record = { method: request.method(), path: url.pathname, metadata: !url.searchParams.has('alt'),
        range: request.headers().range ?? null, status: null, bytes: 0 };
      entry.provider.requests.push(record);
      const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range,content-length,content-type' };
      const bounded = () => {
        if (entry.provider.requests.length > limits.apiRequestsMaxPerRelease || entry.provider.bytes > limits.apiBytesMaxPerRelease) {
          entry.budgetExceeded = true;
          return false;
        }
        return true;
      };
      if (url.pathname.endsWith('/download') && request.method() === 'POST') {
        record.status = 200;
        const body = JSON.stringify({ name: 'synthetic/op', done: true,
          response: { '@type': 'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse', partialDownloadAllowed: true,
            downloadUri: 'https://www.googleapis.com/drive/v3/files/fixture/revisions/A?alt=media' } });
        record.bytes = Buffer.byteLength(body); entry.provider.bytes += record.bytes;
        if (!bounded()) return route.fulfill({ status: 413, body: 'SYNTHETIC_PROVIDER_BUDGET_EXCEEDED' });
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body });
      }
      if (request.method() !== 'GET') { record.status = 405; entry.unexpectedMutation = true; return route.fulfill({ status: 405, body: '{}' }); }
      const bytes = fixtureBytes();
      if (!url.searchParams.has('alt')) {
        const body = syntheticMetadataBody;
        record.status = 200; record.bytes = Buffer.byteLength(body); entry.provider.bytes += record.bytes;
        if (!bounded()) return route.fulfill({ status: 413, body: 'SYNTHETIC_PROVIDER_BUDGET_EXCEEDED' });
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body });
      }
      const match = /bytes=(\d+)-(\d*)/.exec(record.range || ''), start = match ? Number(match[1]) : 0,
        end = match && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
      const body = bytes.subarray(start, end + 1), headers = { ...cors, 'content-length': String(body.length) };
      record.status = match ? 206 : 200; record.bytes = body.length; entry.provider.bytes += body.length;
      if (match) headers['content-range'] = `bytes ${start}-${end}/${bytes.length}`;
      if (!bounded()) return route.fulfill({ status: 413, body: 'SYNTHETIC_PROVIDER_BUDGET_EXCEEDED' });
      return route.fulfill({ status: record.status, headers, contentType: 'video/mp4', body });
    });
    page = await context.newPage();
    page.on('pageerror', error => entry.pageErrors.push({ name: error.name, message: error.message }));
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: limits.phaseTimeoutMs });
    await phase('cold app and Q0 first native frame', async () => {
      await page.waitForFunction(() => navigator.serviceWorker.controller && typeof startInitialOriginalPlayback === 'function', null, { timeout: limits.phaseTimeoutMs });
      await page.evaluate(({ size }) => {
        state.token = 'synthetic'; state.expiresAt = Date.now() + 3600000; state.tokenRevision = 1;
        state.authAccountKey = 'synthetic-account'; state.driveSessionGeneration = 1;
        state.authCapabilities = { version: 1, driveRead: true, driveWrite: false, appData: false };
        state.demo = false; state.selected = { id: 'fixture', name: 'subtitle.mp4', mimeType: 'video/mp4', size: String(size), capabilities: { canDownload: true } };
        state.mediaSession++; el.playerSheet.hidden = false; state.pendingPlay = true;
        startInitialOriginalPlayback(state.selected, 'video', state.mediaSession);
      }, { size: fixtureBytes().length });
      const q0Frame = await waitPresentedFrame(page, { ownerKind: 'q0', target: 0, minPresentedFrames: 0 });
      await page.evaluate(() => el.videoPlayer.pause());
      const state = await snapshot(page); assert.equal(state.attempt, 'range'); assert.equal(state.q0Owner, true);
      assert.equal(state.q1Owner, false); assert.equal(state.tracksOwner, false); assert.equal(state.errorVisible, false);
      return { appVersion: release.version, browserVersion: browser.version(), targetTimeline: state.timeline.currentTime,
        nativeFrame: q0Frame, state };
    });
    assert.equal((await page.evaluate(() => APP_VERSION)), release.version, `${release.label}: executing app version mismatch`);
    assert.equal(browser.version(), expectedBrowser, 'Chrome binary changed between pair');
    const q0 = entry.phases.at(-1).value;
    const q1MappedPhase = await phase('normal track menu, AAC 2 selection, and current Q1 frame', async () => {
      await page.locator('#playerControlsEntry').focus(); await page.keyboard.press('Enter');
      await page.locator('#playerMoreMenu summary').click(); await page.locator('#ctrlTracks').click();
      await page.waitForFunction(() => playerTracksOwner?.inventory && !el.playerAudioTrack.disabled, null, { timeout: limits.phaseTimeoutMs });
      const inventory = await page.evaluate(() => ({ kind: playerTracksOwner.inventory.kind,
        audio: playerTracksOwner.inventory.audioTracks.map(track => ({ trackId: track.trackId, codec: track.codec, route: track.route })) }));
      assert(inventory.audio.some(track => track.trackId === 2 && track.codec === 'aac'), 'AAC 2 is absent');
      const binding = await page.evaluate(() => ({ fileId: 'fixture', session: state.mediaSession, account: state.authAccountKey,
        accountGeneration: state.driveSessionGeneration, sha256Checksum: 'd9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037' }));
      const frameGate = waitPresentedFrame(page, { ownerKind: 'q1', target: q0.targetTimeline,
        minPresentedFrames: 0, binding });
      frameGate.catch(() => {}); // Preserve rejection for awaited gate without early unhandled exit.
      await page.locator('#playerAudioTrack').selectOption('2');
      await page.waitForFunction(() => !playerTracksOwner?.switching && q1Playback?.selectedAudioTrackId === 2
        && q1Playback?.player?.stats()?.pipeline, null, { timeout: limits.phaseTimeoutMs });
      await page.evaluate(() => el.videoPlayer.pause());
      const [nativeFrame, state] = await Promise.all([frameGate, snapshot(page)]);
      assert.equal(state.attempt, 'q1'); assert.equal(state.mode, 'original-repackaged');
      assert.equal(state.q0Owner, false); assert.equal(state.q1Owner, true); assert.equal(state.tracksOwner, true);
      assert.equal(state.selectedAudioTrackId, 2); assert.equal(nativeFrame.proof.currentPresentedFrame, true);
      return { inventory, binding, nativeFrame, state };
    });
    const binding = q1MappedPhase.binding;
    let priorGeneration = q1MappedPhase.nativeFrame.proof.generation;
    await phase('Q1 seek to 2 seconds', async () => {
      const before = await page.evaluate(() => q1Playback?.player?.stats?.());
      assert(before?.generation > 0 && ['ready', 'buffered-to-end'].includes(before.phase)
        && before.pipeline && before.worker, 'Q1_TRANSPORT_NOT_READY');
      const frameGate = waitPresentedFrame(page, { ownerKind: 'q1', target: 2, minGeneration: before.generation,
        minPresentedFrames: 0, binding });
      frameGate.catch(() => {}); // Preserve rejection for awaited gate without early unhandled exit.
      await page.evaluate(() => setPlayerCurrentTime(el.videoPlayer, 2));
      await page.waitForFunction(generation => !state.isSeeking && q1Playback?.player?.stats?.()?.generation > generation,
        before.generation, { timeout: limits.phaseTimeoutMs });
      const [nativeFrame, state] = await Promise.all([frameGate, snapshot(page)]);
      assert.equal(nativeFrame.proof.generation > priorGeneration, true, 'Q1_GENERATION_DID_NOT_ADVANCE');
      priorGeneration = nativeFrame.proof.generation;
      return { nativeFrame, state };
    });
    await phase('Q1 seek to terminal frame near 6 seconds', async () => {
      const before = await page.evaluate(() => q1Playback?.player?.stats?.());
      assert(before?.generation === priorGeneration && ['ready', 'buffered-to-end'].includes(before.phase)
        && before.pipeline && before.worker, 'Q1_TRANSPORT_NOT_READY');
      const frameGate = waitPresentedFrame(page, { ownerKind: 'q1', target: 5.999999, minGeneration: before.generation,
        minPresentedFrames: 0, binding });
      frameGate.catch(() => {}); // Preserve rejection for awaited gate without early unhandled exit.
      await page.evaluate(() => setPlayerCurrentTime(el.videoPlayer, 5.999999));
      await page.waitForFunction(generation => !state.isSeeking && q1Playback?.player?.stats?.()?.generation > generation,
        before.generation, { timeout: limits.phaseTimeoutMs });
      const [nativeFrame, state] = await Promise.all([frameGate, snapshot(page)]);
      assert.equal(nativeFrame.proof.generation > priorGeneration, true, 'Q1_GENERATION_DID_NOT_ADVANCE');
      priorGeneration = nativeFrame.proof.generation;
      return { nativeFrame, state };
    });
    const q0Mapped = q0.nativeFrame, q1Mapped = q1MappedPhase.nativeFrame;
    entry.colorComparison = { q0NativeTuple: nativeTuple(q0Mapped), q0MediaTime: q0Mapped.mediaTime,
      q1MappedNativeTuple: nativeTuple(q1Mapped), q1MediaTime: q1Mapped.mediaTime,
      mappedTimeDeltaSeconds: Math.abs(q0Mapped.mediaTime - q1Mapped.mediaTime),
      sameMappedTarget: Math.abs(q0Mapped.mediaTime - q1Mapped.mediaTime) <= .2,
      sameTuple: sameTuple(q0Mapped, q1Mapped), q1OutputColorObservation: q1MappedPhase.state.nativeColorObservation,
      q1ReportedOutputColorObservation: q1MappedPhase.state.player?.outputColorObservation ?? null,
      strictRGBA: 'NOT_CAPTURED; prior strictRGBAFAIL remains unchanged', pixelParityClaim: false };
    entry.elapsedMs = Date.now() - pairStartedAt;
    entry.status = 'AWAITING_ADJUDICATION'; persist();
  } catch (error) {
    entry.failure = { name: error.name, message: error.message };
    entry.status = 'FAILED_OR_UNQUALIFIED'; persist();
  } finally {
    if (page && !page.isClosed()) {
      try {
        entry.cleanup = await bounded(page.evaluate(async () => {
          closePlayer(); await Promise.all([q1Retirement, playerTracksRetirement]);
          const events = window.__obsWorkers || [], created = events.filter(x => x.event === 'created').length,
            terminateCalled = events.filter(x => x.event === 'terminate-called').length;
          return { q0Owner: !!q0Playback, q1Owner: !!q1Playback, tracksOwner: !!playerTracksOwner,
            sourceAttached: el.videoPlayer.hasAttribute('src'), q1Settled: q1RetirementResult?.settled ?? false,
            tracksSettled: playerTracksRetirementResult?.settled ?? true, totalWorkersCreated: created,
            terminateCalls: terminateCalled, activeOwnedWorkers: created - terminateCalled, workerEvents: events };
        }), 5000, 'PAGE_CLEANUP');
      } catch (error) { entry.cleanup = { failure: error.message }; }
    }
    try {
      if (context) await bounded(context.close(), 5000, 'CONTEXT_CLOSE');
      entry.contextClosed = !context || context.pages().length === 0;
    }
    catch (error) { entry.contextClosed = false; entry.contextCloseFailure = error.message; }
    try { await host.close(); }
    catch (error) { entry.serverCloseFailure = error.message; host.server.closeAllConnections?.(); }
    entry.server = host.metrics;
    entry.pageErrors = entry.pageErrors || [];
    entry.noPageErrors = entry.pageErrors.length === 0;
    entry.status = entry.failure ? 'FAILED_OR_UNQUALIFIED' : 'CLOSED';
    persist();
  }
  return entry;
}
async function runPair() {
  const prep = JSON.parse(fs.readFileSync(prepPath, 'utf8'));
  assert.equal(prep.actualExecuted, false);
  assert.equal(prep.candidateRef, candidateRef, 'candidate ref differs from prepared receipt; rerun preparation');
  assert.equal(prep.driverBinding.sha256, hash(fs.readFileSync(__filename)), 'driver changed after preparation');
  const { chromium } = require('playwright');
  const before = process.memoryUsage();
  const infos = prep.releases.map(release => ({ files: release.files, expectedAssets: release.assets }));
  const pairStartedAt = Date.now();
  let browser, browserServer;
  let pairTimer, receiptPath;
  const receipt = { schema: 'drive-original.matched-regression-actual-pair/2',
    scope: prep.scope, fixture: prep.fixture, releases: [], limits, startedAt: new Date().toISOString(),
    candidateRef, actualAccount: false, physicalDevice: false, normalChromeProfile: false, production: false,
    status: 'RESERVED_BEFORE_BROWSER_LAUNCH' };
  const reserveResult = () => {
    const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
    while (!receiptPath) {
      const name = `actual-pair-${stamp}-${process.pid}-${crypto.randomBytes(3).toString('hex')}.json`;
      const candidate = path.join(__dirname, name);
      try { const fd = fs.openSync(candidate, 'wx'); fs.closeSync(fd); receiptPath = candidate; }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    receipt.resultFile = path.basename(receiptPath);
  };
  const persist = () => fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  const closeBrowser = async label => {
    if (!browserServer) return;
    try { await bounded(browserServer.close(), 5000, label); }
    catch (error) { receipt.browserForcedCleanup = true; await bounded(browserServer.kill(),5000,label+'_KILL'); }
    receipt.ownedBrowserProcessExited=browserServer.process().exitCode!==null||browserServer.process().signalCode!==null;
    if(!receipt.ownedBrowserProcessExited)throw Error('OWNED_BROWSER_EXIT_UNCONFIRMED');
  };
  function releaseAdmitted(entry, expectedVersion) {
    const named = ['cold app and Q0 first native frame',
      'normal track menu, AAC 2 selection, and current Q1 frame', 'Q1 seek to 2 seconds',
      'Q1 seek to terminal frame near 6 seconds'];
    if (entry.failure || entry.status !== 'CLOSED' || entry.version !== expectedVersion
      || entry.browserVersion !== receipt.browserVersion || entry.noPageErrors !== true
      || entry.unexpectedMutation || entry.budgetExceeded || !entry.contextClosed || !entry.server?.closed
      || !entry.server?.assetHashesMatched || entry.cleanup?.failure || entry.cleanup?.q0Owner || entry.cleanup?.q1Owner
      || entry.cleanup?.tracksOwner || entry.cleanup?.sourceAttached || entry.cleanup?.q1Settled !== true
      || entry.cleanup?.tracksSettled !== true || entry.cleanup?.activeOwnedWorkers !== 0
      || entry.cleanup?.totalWorkersCreated !== entry.cleanup?.terminateCalls
      || entry.phases.length !== named.length || entry.phases.some((phase, index) => !phase.passed
        || phase.name !== named[index] || phase.appVersionBefore !== expectedVersion || phase.appVersionAfter !== expectedVersion)) return false;
    const [q0, q1, seek2, last] = entry.phases.map(phase => phase.value);
    if (q0?.nativeFrame?.status !== 'CAPTURED' || q0.nativeFrame.proof?.currentPresentedFrame !== true
      || q0.state?.attempt !== 'range' || !q0.state.q0Owner || q0.state.q1Owner || q0.state.tracksOwner) return false;
    for (const phase of [q1, seek2, last]) if (phase?.nativeFrame?.status !== 'CAPTURED'
      || phase.nativeFrame.proof?.currentPresentedFrame !== true || phase.nativeFrame.proof?.ownerLifetimeMatched !== true
      || !['ready', 'buffered-to-end'].includes(phase.nativeFrame.proof?.phase) || !phase.nativeFrame.proof?.generation
      || !phase.nativeFrame.proof?.worker || !phase.nativeFrame.proof?.pipeline
      || phase.state?.attempt !== 'q1' || !phase.state.q1Owner || !phase.state.tracksOwner
      || phase.state.q0Owner || phase.state.selectedAudioTrackId !== 2) return false;
    if (q1.nativeFrame.proof.selectedAudioTrackId !== 2 || q1.nativeFrame.proof.target !== q0.targetTimeline
      || seek2.nativeFrame.proof.target !== 2 || last.nativeFrame.proof.target !== 5.999999) return false;
    return true;
  }
  try {
    reserveResult();
    for (const release of releases) receipt.releases.push({ release: release.label, commit: release.commit, version: release.version,
      fixture: prep.fixture, phases: [], provider: { requests: [], bytes: 0 }, pageErrors: [], cacheMode: 'fresh-context-cold',
      cleanup: null, status: 'NOT_STARTED' });
    persist(); // Exclusive result file and initial receipt exist before Chrome launch.
    browserServer = await bounded(chromium.launchServer({ channel: 'chrome', headless: true, timeout: 5000 }), 7000, 'BROWSER_LAUNCH');
    browser = await bounded(chromium.connect(browserServer.wsEndpoint(),{timeout:5000}),7000,'OWNED_BROWSER_CONNECT');
    pairTimer = setTimeout(() => {
      receipt.totalPairTimeout = true; receipt.status = 'TOTAL_PAIR_TIMEOUT'; persist();
      void closeBrowser('WATCHDOG_BROWSER_CLOSE').catch(() => {});
    }, limits.totalPairTimeoutMs);
    receipt.browserVersion = browser.version();
    for (const entry of receipt.releases) entry.browserVersion = receipt.browserVersion;
    assert(/^154\./.test(receipt.browserVersion), `Expected the prepared Chrome154 installation, got ${receipt.browserVersion}`);
    for (let i = 0; i < releases.length; i++) {
      await runRelease(browser, releases[i], infos[i], receipt.browserVersion, pairStartedAt, receipt.releases[i], persist);
      const memory = process.memoryUsage();
      if (memory.rss > limits.nodeRssMaxBytes || memory.heapUsed > limits.nodeHeapUsedMaxBytes) throw new Error('NODE_MEMORY_BOUND_EXCEEDED');
      if (Date.now() - pairStartedAt > limits.totalPairTimeoutMs) throw new Error('TOTAL_PAIR_TIMEOUT');
    }
    const [base, candidate] = receipt.releases;
    const tuple = color => color ? { primaries: color.primaries ?? null, transfer: color.transfer ?? null,
      matrix: color.matrix ?? null, fullRange: color.fullRange ?? null } : null;
    const baselineQ0 = base.phases[0]?.value?.nativeFrame;
    const candidateQ0 = candidate.phases[0]?.value?.nativeFrame;
    const candidateQ1 = candidate.phases[1]?.value?.nativeFrame;
    const candidateObservation = candidate.phases[1]?.value?.state?.player?.outputColorObservation;
    const candidateTuple = tuple(candidateObservation?.colorSpace);
    const candidateNativeTuple = tuple(candidateQ0?.colorSpace);
    receipt.comparison = { sameFixtureSha: base.fixture.sha256 === candidate.fixture.sha256,
      sameBrowser: base.browserVersion === receipt.browserVersion && candidate.browserVersion === receipt.browserVersion,
      sameSyntheticMetadata: base.providerMetadataSha256 === candidate.providerMetadataSha256,
      sameActionSequence: base.phases.map(p => p.name).join('|') === candidate.phases.map(p => p.name).join('|'),
      bothCacheCold: base.cacheMode === 'fresh-context-cold' && candidate.cacheMode === 'fresh-context-cold',
      sameQ0Target: Math.abs(baselineQ0?.mediaTime - candidateQ0?.mediaTime) <= .2,
      candidateQ0Q1SameMappedTarget: Math.abs(candidateQ0?.mediaTime - candidateQ1?.mediaTime) <= .2,
      baselineQ0Tuple: tuple(baselineQ0?.colorSpace), candidateQ0Tuple: candidateNativeTuple,
      candidateQ1NativeTuple: tuple(candidateQ1?.colorSpace),
      sameQ0NativeTupleAcrossReleases: JSON.stringify(tuple(baselineQ0?.colorSpace)) === JSON.stringify(candidateNativeTuple),
      candidateDerivedColorTuple: candidateTuple, candidateMatchesBaselineQ0Tuple: JSON.stringify(candidateTuple) === JSON.stringify(candidateNativeTuple),
      strictRGBA: 'NOT_CAPTURED; prior strictRGBAFAIL remains unchanged',
      interpretation: 'One controlled generated-fixture pair; no p95, broad color, strict RGBA, or production claim.' };
    receipt.adjudication = { baselineAdmitted: releaseAdmitted(base, releases[0].version), candidateAdmitted: releaseAdmitted(candidate, releases[1].version),
      scopedPair: releaseAdmitted(base, releases[0].version) && releaseAdmitted(candidate, releases[1].version)
        && receipt.comparison.sameFixtureSha && receipt.comparison.sameBrowser && receipt.comparison.sameSyntheticMetadata
        && receipt.comparison.bothCacheCold && receipt.comparison.sameActionSequence && receipt.comparison.sameQ0Target
        && receipt.comparison.candidateQ0Q1SameMappedTarget && receipt.comparison.sameQ0NativeTupleAcrossReleases
        && receipt.comparison.candidateMatchesBaselineQ0Tuple
        ? 'PASS_SCOPED_COLOR_TUPLE_AND_SEEK_ONLY' : 'FAIL_OR_UNQUALIFIED' };
    receipt.status = receipt.adjudication.scopedPair.startsWith('PASS') ? 'COMPLETE_SCOPED' : 'FAILED_OR_UNQUALIFIED';
    receipt.nodeMemory = { before, after: process.memoryUsage(), bound: 'Node RSS/heap only; Chrome aggregate not sampled' };
  } catch (error) { receipt.failure = { name: error.name, message: error.message }; }
  finally {
    clearTimeout(pairTimer);
    try { await closeBrowser('BROWSER_CLOSE'); receipt.browserClosed = !browser || browser.contexts().length === 0; }
    catch (error) { receipt.browserClosed = false; receipt.browserCloseFailure = error.message; }
    receipt.elapsedMs = Date.now() - pairStartedAt; receipt.completedAt = new Date().toISOString();
    if (receipt.failure || !receipt.adjudication) receipt.status = receipt.totalPairTimeout ? 'TOTAL_PAIR_TIMEOUT' : 'FAILED_OR_UNQUALIFIED';
    persist();
  }
  console.log(`${receipt.status} ${receiptPath}`);
  if (receipt.status !== 'COMPLETE_SCOPED' || !receipt.browserClosed) process.exitCode = 1;
}

if (process.argv.includes('--run')) runPair().catch(error => { console.error(error); process.exitCode = 1; });
else prepare();
