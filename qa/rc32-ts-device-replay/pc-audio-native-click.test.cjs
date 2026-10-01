'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const expression = fs.readFileSync(path.join(__dirname, 'pc-audio-native-click.expression.js'), 'utf8');
const binding = JSON.parse(fs.readFileSync(path.join(__dirname, 'binding.json'), 'utf8'));
function fixture(options = {}) {
  let now = 100000, calls = 0, id = 0;
  const timers = new Map(), frames = new Map(), microtasks = [], listeners = new Map();
  const target = { id: 'PRIVATE_ID', name: 'PRIVATE_NAME', size: '100', version: '9' }, controller = { state: 'activated' };
  const video = { paused: true, ended: false, seeking: false, readyState: 4, muted: false, volume: .5, playbackRate: 1 };
  const stats = { generation: 2, phase: 'ready', disposed: false }, button = { isConnected: true, disabled: false, parentElement: null,
    contains: () => false, getBoundingClientRect: () => ({ left: 100, top: 200, width: 24, height: 24 }),
    addEventListener(type, fn) { assert.equal(type, 'click'); listeners.set(type, fn); },
    removeEventListener(type) { if (options.removeThrows) throw Error('REMOVE'); listeners.delete(type); } };
  const seek = { fraction: .5, completedAt: now - 100, passed: true, nativeInputObserved: true,
    firstTargetFrame: { generationAdvanced: true, readinessQualified: true, seekSettled: true } };
  const samplerRead = { version: binding.version, sourceCommit: binding.sourceCommit, disposed: false, seek,
    metadata: [{ label: 'before', qualified: true }] };
  const sampler = { read: () => samplerRead, async startAudio() {
    calls++; assert.equal(video.paused, false); assert.equal(context.navigator.userActivation.isActive, true);
    if (options.startFails) throw Error('POST_SEEK_OWNER_FENCE');
    return { audio: options.captureFails ? { completed: true, passed: false, result: 'CAPTURE_FAILURE' } : { completed: false } };
  } };
  const context = { APP_VERSION: binding.version, el: { ctrlPlayPause: button }, innerWidth: 1200, innerHeight: 900,
    state: { selected: target, accountId: 'PRIVATE_ACCOUNT', authAccountKey: 'PRIVATE_KEY', authStatus: 'online',
      authGeneration: 1, driveSessionGeneration: 1, mediaSession: 2, isSeeking: false },
    q1Playback: { kind: 'ts', swGeneration: 4, player: { stats: () => stats }, controller: { signal: { aborted: false } } },
    mediaSourceGeneration: 4, mediaSeekGeneration: 3, mediaSeekSettledGeneration: 3, mediaSeekWatchdog: null,
    getActiveMediaElement: () => video, isCurrentMediaEvent: v => v === video,
    navigator: { serviceWorker: { controller }, userActivation: { isActive: true } },
    window: { __resumeReplayTarget30: target, __resumeSwProof: { get: () => ({ ...binding, controller }) }, __rc32AudioSeekRemaining: sampler },
    document: { visibilityState: 'visible', elementFromPoint: () => button },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto', opacity: '1' }), Date: { now: () => now },
    setTimeout: (fn, ms) => { const key = ++id; timers.set(key, { fn, ms }); return key; }, clearTimeout: key => timers.delete(key),
    requestAnimationFrame: fn => { const key = ++id; frames.set(key, fn); return key; }, cancelAnimationFrame: key => frames.delete(key),
    queueMicrotask: fn => microtasks.push(fn) };
  vm.createContext(context); vm.runInContext(expression, context);
  return { context, video, button, seek, api: context.window.__rc32PcAudioKick, counts: () => ({ calls, timers: timers.size, frames: frames.size, listeners: listeners.size }),
    click(trusted = true) { listeners.get('click')?.({ isTrusted: trusted, currentTarget: button, target: button }); },
    async flush() { while (microtasks.length) microtasks.shift()(); await Promise.resolve(); await Promise.resolve(); },
    async frame(ms = 16) { now += ms; const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); await Promise.resolve(); await Promise.resolve(); },
    deadline(ms) { [...timers.values()].find(value => value.ms === ms)?.fn(); } };
}
test('arming with evaluation-style activation starts nothing; only trusted native play then microtask starts unchanged observer', async () => {
  const f = fixture(); f.api.arm(.5); assert.equal(f.counts().calls, 0);
  await f.flush(); assert.equal(f.counts().calls, 0);
  f.video.paused = false; f.click(); await f.flush();
  assert.equal(f.counts().calls, 1); assert.equal(f.api.read().result, 'STARTED');
  assert.equal(f.api.read().trustedClickReceived, true); assert.equal(f.api.read().activationAtClick, true);
  assert.equal(f.api.read().startReturned, true); assert(Object.values(f.api.read().cleanup).every(value => value === true));
  assert(!JSON.stringify(f.api.read()).includes('PRIVATE')); f.api.stop();
  assert(!/AudioContext|captureStream|dispatchEvent|userGesture|\.play\(|\.pause\(|\.click\(|\.currentTime\s*=/.test(expression));
});
test('untrusted input, expired activation, changed owner/new seek and hidden controls cannot invoke audio', async () => {
  for (const kind of ['untrusted', 'activation', 'owner', 'seek', 'hidden']) {
    const f = fixture(); f.api.arm(.5); f.video.paused = false;
    if (kind === 'activation') f.context.navigator.userActivation.isActive = false;
    if (kind === 'owner') f.context.q1Playback = { ...f.context.q1Playback };
    if (kind === 'seek') f.context.mediaSeekGeneration++;
    if (kind === 'hidden') f.button.hidden = true;
    f.click(kind !== 'untrusted'); await f.flush();
    assert.equal(f.counts().calls, 0, kind); assert.equal(f.api.read().completed, true);
    assert.equal(f.api.read().result, kind === 'untrusted' ? 'UNTRUSTED_INPUT' : kind === 'activation' ? 'NATIVE_ACTIVATION_EXPIRED' : 'NATIVE_CLICK_OWNER_FENCE');
    f.api.stop(); assert.equal(f.counts().timers, 0); assert.equal(f.counts().frames, 0);
  }
  const f = fixture(); f.seek.fraction = .9; assert.throws(() => f.api.arm(.5), /PC_AUDIO_KICK_ADMISSION/); f.api.stop();
});
test('bounded native playing wait and cancellation never launch late audio; observer start failure is preserved', async () => {
  const f = fixture(); f.api.arm(.5); f.click(); await f.flush(); assert.equal(f.counts().frames, 1);
  f.video.paused = false; await f.frame(); assert.equal(f.api.read().result, 'STARTED'); assert.equal(f.counts().calls, 1); f.api.stop();
  for (const point of ['before-click', 'before-microtask', 'waiting-frame']) {
    const g = fixture(); g.api.arm(.5);
    if (point !== 'before-click') g.click(); if (point === 'waiting-frame') await g.flush();
    g.api.stop(); g.video.paused = false; await g.flush(); await g.frame();
    assert.equal(g.counts().calls, 0, point); assert.equal(g.api.read().result, 'CANCELLED');
    assert.deepEqual(g.counts(), { calls: 0, timers: 0, frames: 0, listeners: 0 });
  }
  const g = fixture(); g.api.arm(.5); g.click(); await g.flush(); g.deadline(2000); await g.frame();
  assert.equal(g.api.read().result, 'NATIVE_PLAYING_DEADLINE'); assert.equal(g.counts().calls, 0); g.api.stop();
  for (const kind of ['startFails', 'captureFails']) {
    const h = fixture({ [kind]: true }); h.api.arm(.5); h.video.paused = false; h.click(); await h.flush();
    assert.equal(h.api.read().result, kind === 'startFails' ? 'POST_SEEK_OWNER_FENCE' : 'CAPTURE_FAILURE'); h.api.stop();
  }
});
test('failed listener removal stays failed across automatic completion and repeated stop', async () => {
  const f = fixture({ removeThrows: true }); f.api.arm(.5); f.video.paused = false; f.click(); await f.flush();
  assert.equal(f.api.read().cleanup.listenerRemoved, false); assert.equal(f.api.stop().cleanup.listenerRemoved, false);
  assert.equal(f.api.stop().cleanup.listenerRemoved, false);
});
