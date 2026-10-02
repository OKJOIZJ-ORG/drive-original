const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dir = __dirname;
const observerPath = path.join(dir, 'observer-native-seek.function.js');
const observerSource = fs.readFileSync(observerPath, 'utf8');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ORIGINAL_SHA256 = '52c19a294e599c836a537580f6b6d9b77b0bbbf89d2f17da91f982eed171c494';

function rig({ route = 'Q0', seekGeneration = 3, pipelineGeneration = 10 } = {}) {
  const account = { accountId: 'private-account', authAccountKey: 'private-auth-key' };
  const target = { id: 'private-file', name: 'private.mov', size: 75000000, mimeType: 'video/quicktime', modifiedTime: 't' };
  const controller = { state: 'activated' };
  const owner = { kind: route };
  let ownerNow = owner;
  const callbacks = [];
  const listeners = new Map();
  let callbackSerial = 0;
  const video = {
    currentTime: 5, duration: 100, paused: true, ended: false, seeking: false, readyState: 4,
    videoWidth: 1920, videoHeight: 1080, hidden: false, muted: false, playbackRate: 1,
    buffered: { length: 0 },
    getVideoPlaybackQuality: () => ({ totalVideoFrames: 1, droppedVideoFrames: 0 }),
    requestVideoFrameCallback(fn) { callbacks.push({ id: ++callbackSerial, fn }); return callbackSerial; },
    cancelVideoFrameCallback(id) { const i = callbacks.findIndex(x => x.id === id); if (i >= 0) callbacks.splice(i, 1); },
    addEventListener(type, fn) { const set = listeners.get(type) || new Set(); set.add(fn); listeners.set(type, set); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, isTrusted = true) { for (const fn of listeners.get(type) || []) fn({ type, isTrusted, target: video }); },
    fireFrame(mediaTime) { const next = callbacks.shift(); assert.ok(next, 'a frame callback is pending');
      next.fn(0, { mediaTime, presentedFrames: 1, width: 1920, height: 1080 }); }
  };
  let statsValue = route === 'Q1' ? { generation: pipelineGeneration, phase: 'ready', status: { level: 'Q1' }, mapping: null } : null;
  const binding = { version: '1.22.0-rc.35', sourceCommit: '2c2b1244bee0f1a5e500318c83c6e126c5124e34', sourceSHA256: { 'app.js': 'source-hash' } };
  const context = {
    window: {
      __resumeReplayTarget30: { target, account },
      __resumeSwProof: { get: () => ({ controller, version: binding.version, sourceCommit: binding.sourceCommit, sourceSHA256: binding.sourceSHA256 }) }
    },
    navigator: { serviceWorker: { controller }, onLine: true },
    document: { visibilityState: 'visible' },
    state: { ...account, authStatus: 'online', selected: target, mediaSession: 7, playbackSession: 8,
      driveSessionGeneration: 9, mediaAttempt: 'native', accountId: account.accountId, authAccountKey: account.authAccountKey },
    el: { playerSheet: { hidden: false }, mediaLoadingText: null },
    APP_VERSION: binding.version,
    q1Playback: route === 'Q1' ? { kind: 'general', player: { stats: () => statsValue } } : null,
    q0Playback: route === 'Q0' ? owner : null,
    mediaSourceGeneration: 11,
    mediaSeekGeneration: seekGeneration,
    mediaSeekSettledGeneration: seekGeneration,
    mediaSeekWatchdog: null,
    getActiveMediaElement: () => video,
    isCurrentMediaEvent: v => v === video,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    setInterval: () => 1,
    clearInterval: () => {},
    clearTimeout: () => {},
    DRIVE_API: 'unused'
  };
  vm.createContext(context);
  vm.runInContext(`${observerSource}\nglobalThis.__install = installRc35NativeSeekObserver;`, context);
  context.__install(binding);
  return {
    context, video, binding,
    arm() { context.window.__rc35NativeSeekObserver.arm('seek90', { targetSeconds: 90, toleranceSeconds: 1.5 }); },
    seek({ trustedSeeking = true, trustedSeeked = true, epoch = true, targetTime = 90 } = {}) {
      if (epoch) context.mediaSeekGeneration += 1;
      video.currentTime = targetTime;
      video.seeking = false;
      video.dispatch('seeking', trustedSeeking);
      video.dispatch('seeked', trustedSeeked);
    },
    frame(time = 90) { video.fireFrame(time); },
    result() { return context.window.__rc35NativeSeekObserver.read().phases.at(-1); },
    replaceOwner() { context.q0Playback = { kind: 'Q0-new-owner' }; },
    setPipelineGeneration(value) { statsValue = { ...statsValue, generation: value }; }
  };
}

test('source parses and frozen observer input remains byte-identical', () => {
  new vm.Script(observerSource, { filename: 'observer-native-seek.function.js' });
  const frozen = fs.readFileSync(path.join(dir, '..', 'rc31-passive-latency-partition-v2', 'observer.function.js'));
  assert.equal(sha(frozen), ORIGINAL_SHA256);
});

test('adaptation binds exact source and test bytes while actual evidence stays unknown', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'observer-native-seek-adaptation.json'), 'utf8'));
  const frozen = fs.readFileSync(path.join(dir, '..', 'rc31-passive-latency-partition-v2', 'observer.function.js'));
  assert.equal(manifest.source.frozenObserverSha256, sha(frozen));
  assert.equal(manifest.adaptation.observerSha256, sha(fs.readFileSync(observerPath)));
  assert.equal(manifest.adaptation.testsSha256, sha(fs.readFileSync(__filename)));
  assert.equal(manifest.adaptation.actualScope, 'UNKNOWN');
  assert.equal(manifest.scope.coldPath, 'UNKNOWN');
  assert.equal(manifest.scope.sourceWorkerExecutingBytes, 'UNKNOWN');
  assert.equal(manifest.scope.historicalFailedTuple, 'UNKNOWN');
  assert.equal(manifest.scope.p95, 'UNKNOWN');
});

test('same-owner native Q0 seek qualifies only with a later epoch and current trusted seek pair', () => {
  const r = rig(); r.arm(); r.seek(); r.frame();
  const phase = r.result();
  assert.equal(phase.firstTargetFrame?.sourceTime, 90);
  assert.equal(phase.frames[0].generationAdvanced, false);
  assert.equal(phase.frames[0].nativeQ0Provenance, true);
  assert.equal(phase.frames[0].targetGood, true);
});

test('a target frame without a later app seek epoch remains unqualified', () => {
  const r = rig(); r.arm(); r.seek({ epoch: false }); r.frame();
  assert.equal(r.result().firstTargetFrame, null);
});

test('stale or untrusted seeked provenance cannot qualify a current-looking frame', () => {
  const stale = rig(); stale.arm(); stale.seek({ trustedSeeking: false }); stale.frame();
  assert.equal(stale.result().firstTargetFrame, null);
  const untrusted = rig(); untrusted.arm(); untrusted.seek({ trustedSeeked: false }); untrusted.frame();
  assert.equal(untrusted.result().firstTargetFrame, null);
});

test('foreign Q0 owner replacement invalidates native seek provenance', () => {
  const r = rig(); r.arm(); r.seek(); r.replaceOwner(); r.frame();
  assert.equal(r.result().firstTargetFrame, null);
});

test('Q1 continues to require its existing pipeline generation advance', () => {
  const noAdvance = rig({ route: 'Q1' }); noAdvance.arm(); noAdvance.seek(); noAdvance.frame();
  assert.equal(noAdvance.result().firstTargetFrame, null);
  const advanced = rig({ route: 'Q1' }); advanced.arm(); advanced.seek(); advanced.setPipelineGeneration(11); advanced.frame();
  assert.equal(advanced.result().firstTargetFrame?.sourceTime, 90);
  assert.equal(advanced.result().frames[0].nativeQ0Provenance, false);
});

test('observer retains first-15-second guard and original fence/tolerance contracts', () => {
  for (const token of ['deadline15', 'sourceSame', 'accountSame', 'targetSame', 'selectedFreshSameWhenKnown', 'toleranceSeconds', 'isCurrentMediaEvent']) {
    assert.ok(observerSource.includes(token), `observer contract present: ${token}`);
  }
  assert.match(observerSource, /maxTotalMs = 360000/);
  assert.match(observerSource, /function nativeQ0SeekProvenance\(\)/);
  assert.match(observerSource, /const q0Seek90 = phasePrivate\.route === 'Q0' && phase\.label === 'seek90'/);
  assert.match(observerSource, /const advanceGood = q0Seek90 \? nativeQ0Provenance : \(!needsAdvance \|\| generationAdvanced\)/);
});
