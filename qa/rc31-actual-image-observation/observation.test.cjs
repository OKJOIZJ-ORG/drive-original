'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), zlib = require('node:zlib');
const { samplePainted, pixelHash } = require('./painted-sampler.cjs');
function png(rgb) {
  const chunk = (type, data) => { const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8); return b; };
  const h = Buffer.alloc(13); h.writeUInt32BE(1); h.writeUInt32BE(1, 4); h[8] = 8; h[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', h), chunk('IDAT', zlib.deflateSync(Buffer.from([0, ...rgb]))), chunk('IEND', Buffer.alloc(0))]);
}
const fence = () => ({ admitted: true, clip: { x: 10, y: 20, width: 1, height: 1, scale: 1 } });
function realm() {
  const node = () => ({ hidden: true, complete: true, naturalWidth: 100, naturalHeight: 80, getAttribute: () => null,
    getBoundingClientRect: () => ({ left: 5, top: 5, width: 100, height: 80 }), contains: () => false });
  const target = { id: 'PRIVATE_ID', name: 'PRIVATE_NAME', size: '123', mimeType: 'image/gif' }, account = { accountId: 'PRIVATE_ACCOUNT', authAccountKey: 'PRIVATE_AUTH' };
  const c = { window: {}, APP_VERSION: '1.22.0-rc.31', navigator: { serviceWorker: { controller: { state: 'activated' } } },
    document: { visibilityState: 'visible', hasFocus: () => true, elementFromPoint: () => c.el.imageViewer },
    state: { ...account, authStatus: 'online', mediaSession: 2, playbackSession: 3, driveSessionGeneration: 4,
      selected: target, mediaPlaybackMode: 'original-sequential', mediaTransportVerified: true, mediaBlobUrl: null },
    mediaSourceGeneration: 5, q0PinnedSource: {}, q0Playback: null, q1Playback: null, q1RetirementResult: { settled: true },
    el: { imageViewer: node(), playerSheet: node(), drivePreview: node(), mediaError: node(), videoPlayer: node(), customVideoControls: node(), mediaStage: node() },
    currentVerifiedOriginalImage: () => null, getViewedIdSet: () => new Set(['PRIVATE_ID']), innerWidth: 300, innerHeight: 500, devicePixelRatio: 1,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }), privateInput: { target, account } };
  c.el.playerSheet.hidden = false; c.el.imageViewer.hidden = false;
  c.window.__resumeSwProof = { get: () => ({ sourceCommit: '4a484e6f839d2e6c3eb83503acb08147362cb011', version: c.APP_VERSION,
    controller: c.navigator.serviceWorker.controller, sourceSHA256: {
      'app.js': 'f92f9440b25781c8c6f144688d96d58612747f148bb6ded0bf31d4a35bb6193e',
      'sw.js': 'e65e51527fad4df7633e2a10d36f2d90966e47fb8c73e23d5ebb78b7059a747a',
      'version.json': 'd8903d703880dbb1ef1068575974d70e5666a127cb2970cfb951cfd3ff5bff06' } }) };
  vm.createContext(c); vm.runInContext(fs.readFileSync(require.resolve('./image-observer.function.js'), 'utf8') + '\ninstallRc31ImageObservation(privateInput)', c);
  return c;
}
test('ordinary sequential image is admitted without wrong-MIME marker; no private output', () => {
  const c = realm(), a = c.window.__rc31ImageObservation.arm();
  assert.equal(a.originalMode, true); assert.equal(a.verifiedWrongMimeImage, false); assert.equal(a.sameOwner, true);
  assert.doesNotMatch(JSON.stringify(a), /PRIVATE_|https:|token/); assert.equal(c.window.__rc31ImageObservation.fence('viewer').admitted, true);
});
test('stale source, account, controller, owner, metadata and hidden state fence capture', () => {
  for (const mutate of [c => c.APP_VERSION = '1.22.0-rc.32', c => c.state.authAccountKey = 'OTHER',
    c => c.navigator.serviceWorker.controller = {}, c => c.mediaSourceGeneration++,
    c => c.state.selected = { ...c.state.selected, size: '999' }, c => c.document.visibilityState = 'hidden']) {
    const c = realm(); c.window.__rc31ImageObservation.arm(); mutate(c);
    assert.equal(c.window.__rc31ImageObservation.fence('viewer').admitted, false);
  }
});
test('retirement snapshot and disposal remove only owned observation handle', () => {
  const c = realm(), api = c.window.__rc31ImageObservation; api.arm();
  c.state.selected = null; c.el.playerSheet.hidden = true;
  assert.equal(api.snapshot().selectionCleared, true); assert.equal(api.snapshot().retired, true);
  c.q1Playback = {}; assert.equal(api.snapshot().retired, false);
  const done = api.dispose(); assert.equal(done.observerRemoved, true); assert.equal(done.listenersOwned, 0);
  assert.equal(c.window.__resumeSwProof !== undefined, true); assert.equal(api.fence('viewer').admitted, false);
});
test('painted sample exports hashes only, change differs from exact-delay/loop/alpha/bytes proof', async () => {
  let n = 0; const r = await samplePainted({ phase: 'viewer', durationMs: 80, maxSamples: 3, readFence: fence, capture: async () => png([++n, 0, 0]) });
  assert.equal(r.observedChangingPixel, true); assert.equal(r.preciseDelayProven, false); assert.equal(r.fullLoopProven, false);
  assert.equal(r.alphaPreservationProven, false); assert.equal(r.originalByteIdentityProven, false);
  assert.equal(r.samples.length, 3); assert.equal(r.samples.every(s => /^[a-f0-9]{64}$/.test(s.paintedPixelSha256)), true);
  assert.doesNotMatch(JSON.stringify(r), /data:|base64|PRIVATE_|rgba|"pixel":/);
});
test('stationary painted pixel is bounded observation, not full animation denial', async () => {
  const r = await samplePainted({ phase: 'card', durationMs: 40, maxSamples: 2, readFence: fence, capture: async () => png([1, 2, 3]) });
  assert.equal(r.observedStablePixel, true); assert.equal(r.observedChangingPixel, false);
});
test('post-capture foreground fence and geometry changes fail closed', async () => {
  for (const bad of [() => ({ admitted: false }), () => ({ ...fence(), clip: { ...fence().clip, x: 11 } })]) {
    let n = 0; await assert.rejects(samplePainted({ phase: 'viewer', durationMs: 100, maxSamples: 2,
      readFence: () => ++n === 1 ? fence() : bad(), capture: async () => png([1, 2, 3]) }), /PAINT_FENCE|PAINT_GEOMETRY_CHANGED/);
  }
});
test('sample, deadline, byte and PNG shape bounds; hung capture signal aborted', async () => {
  await assert.rejects(samplePainted({ phase: 'viewer', maxSamples: 13, readFence: fence, capture: async () => png([1, 2, 3]) }), /SAMPLER_ARGUMENTS/);
  await assert.rejects(samplePainted({ phase: 'viewer', durationMs: 100, readFence: fence, capture: async () => Buffer.alloc(8 * 1024 * 1024 + 1) }), /CAPTURE_BYTE_BUDGET/);
  let signal; await assert.rejects(samplePainted({ phase: 'viewer', durationMs: 20, readFence: fence,
    capture: async request => { signal = request.signal; return new Promise(() => {}); } }), /CAPTURE_DEADLINE/);
  assert.equal(signal.aborted, true); assert.throws(() => pixelHash(Buffer.from('not png')), /CAPTURE_PNG_REQUIRED/);
});
test('shared representative budget prevents phase/reopen resetting sample cap', async () => {
  const budget = { sampleCount: 10, encodedBytes: 0 };
  await samplePainted({ phase: 'card', durationMs: 40, maxSamples: 2, budget, readFence: fence, capture: async () => png([1, 2, 3]) });
  assert.equal(budget.sampleCount, 12);
  await assert.rejects(samplePainted({ phase: 'viewer', durationMs: 40, maxSamples: 2, budget, readFence: fence, capture: async () => png([1, 2, 3]) }), /CAPTURE_SAMPLE_BUDGET/);
});
test('capture errors never export raw messages including uppercase private values', async () => {
  await assert.rejects(samplePainted({ phase: 'viewer', durationMs: 40, maxSamples: 2, readFence: fence,
    capture: async () => { throw Error('PRIVATE_AUTH'); } }), e => e.message === 'SAMPLER_OPERATION_FAILED');
});
