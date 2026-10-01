'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const expression = fs.readFileSync(path.join(__dirname, 'audio-seek-remaining.expression.js'), 'utf8');
const binding = JSON.parse(fs.readFileSync(path.join(__dirname, 'binding.json'), 'utf8'));
function fixture(options = {}) {
  let now = 100000, id = 0, frame = null, stopped = 0, disconnected = 0, closed = 0, cancelled = 0;
  const timers = new Map(), intervals = new Map();
  const target = { id: 'PRIVATE_ID', name: 'PRIVATE_NAME', size: '100', version: '9', md5Checksum: 'a'.repeat(32) };
  const track = { enabled: true, muted: false, readyState: 'live', stop() { stopped++; if (options.stopThrows) throw Error('STOP'); this.readyState = 'ended'; } };
  const video = { currentTime: 0, duration: 100, paused: false, ended: false, seeking: false, muted: false, volume: .5, playbackRate: 1, readyState: 4,
    captureStream: () => ({ getTracks: () => [track], getAudioTracks: () => [track] }),
    requestVideoFrameCallback: fn => { frame = fn; return ++id; }, cancelVideoFrameCallback() { frame = null; cancelled++; } };
  let audioContext;
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.channel = 0; audioContext = this; }
    createMediaStreamSource() { return { connect() {}, disconnect() { disconnected++; if (options.disconnectThrows) throw Error('DISCONNECT'); } }; }
    createChannelSplitter(n) { assert.equal(n, 8); return { connect() {}, disconnect() { disconnected++; } }; }
    createAnalyser() { const channel = this.channel++; return { disconnect() { disconnected++; }, getFloatTimeDomainData(values) {
      values.fill(options.silent ? 0 : channel === 0 ? .1 : channel === 1 ? -.1 : 0);
    } }; }
    resume() { if (options.resumePending) return new Promise(() => {}); this.state = 'running'; return Promise.resolve(); }
    close() { closed++; if (options.closePending) return new Promise(() => {}); this.state = 'closed'; return Promise.resolve(); }
  }
  const controller = { state: 'activated' }, stats = { generation: 1, phase: 'ready', duration: 100, mapping: { commonShift: 5, sourceOrigin: 2 } };
  const meta = ['before', 'after'].map(label => ({ label, at: label === 'before' ? now - 1 : now, status: 200, sameExactTarget: true, stableMetadataSame: true,
    freshRevisionChecksumSame: true, accountSame: true, sourceSame: true, notTrashed: true, canDownload: true }));
  const listeners = new Map();
  const slider = { addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); },
    getBoundingClientRect: () => ({ left: 0, width: 100 }) };
  const context = { el: { seekBarContainer: slider }, window: { AudioContext, __resumeReplayTarget30: target,
    __resumeSwProof: { get: () => ({ ...binding, controller }) }, __rc32TsReplay: { read: () => ({ metadataResults: meta }), metadata() {} } },
    APP_VERSION: binding.version, navigator: { serviceWorker: { controller }, userActivation: { isActive: true } }, document: { visibilityState: 'visible' },
    state: { selected: target, accountId: 'PRIVATE_ACCOUNT', authAccountKey: 'PRIVATE_KEY', authStatus: 'online',
      authGeneration: 1, driveSessionGeneration: 1, mediaSession: 2 },
    q1Playback: { kind: 'ts', swGeneration: 4, player: { stats: () => stats }, controller: { signal: { aborted: false } } }, q0Playback: null,
    getActiveMediaElement: () => video, isCurrentMediaEvent: v => v === video,
    mediaSourceGeneration: 4, mediaSeekGeneration: 1, mediaSeekSettledGeneration: 1, mediaSeekWatchdog: null,
    Date: { now: () => now }, Float32Array,
    setTimeout(fn, ms) { const key = ++id; timers.set(key, { fn, ms }); return key; }, clearTimeout: key => timers.delete(key),
    setInterval(fn) { const key = ++id; intervals.set(key, fn); return key; }, clearInterval: key => intervals.delete(key) };
  options.prepare?.({ context, meta, target });
  vm.createContext(context); vm.runInContext(expression, context);
  return { context, video, track, stats, meta, api: context.window.__rc32AudioSeekRemaining,
    async tick({ present = true, nativeAdvance = .1, audioAdvance = .1 } = {}) { now += 100; meta[1].at = now; if (!video.paused) video.currentTime += nativeAdvance; if (audioContext) audioContext.currentTime += audioAdvance;
      if (present && frame && audioContext) { const fn = frame; frame = null; fn(0, { mediaTime: video.currentTime, width: 640, height: 360 }); }
      [...intervals.values()].forEach(fn => fn()); await Promise.resolve(); await Promise.resolve(); },
    pointer(fraction, trusted = true) { listeners.get('pointerdown')?.({ isTrusted: trusted, button: 0, clientX: fraction * 100 }); },
    advance(ms) { now += ms; },
    present(mediaTime) { video.currentTime = mediaTime; const fn = frame; frame = null; fn?.(0, { mediaTime, width: 640, height: 360 }); },
    deadline(ms) { [...timers.values()].find(x => x.ms === ms)?.fn(); },
    counts: () => ({ stopped, disconnected, closed, cancelled, timers: timers.size, intervals: intervals.size, listeners: listeners.size }) };
}
async function seekTo(f, fraction, { pointer = true } = {}) {
  f.video.paused = true;
  fraction === .5 ? f.api.armSeek50() : f.api.armSeek90();
  if (pointer) f.pointer(fraction);
  f.context.mediaSeekGeneration++; f.context.mediaSeekSettledGeneration++;
  f.context.mediaSourceGeneration++; f.context.q1Playback.swGeneration++; f.stats.generation++;
  const mapping = f.stats.mapping;
  const shift = Number.isFinite(mapping?.commonShift) && Number.isFinite(mapping?.sourceOrigin)
    ? mapping.commonShift - mapping.sourceOrigin : 0;
  f.present(fraction * f.video.duration - shift);
  return f.api.read();
}
async function output(f, { ticks = 3, present = true } = {}) {
  f.video.paused = false;
  await f.api.startAudio();
  for (let i = 0; i < ticks; i++) await f.tick({ present });
}
test('only exact numeric 50/90 fractions, one phase per installation; PCM needs a completed seek', async () => {
  const f = fixture();
  for (const fraction of [.1, .50001, 50, '0.5', NaN, null]) assert.throws(() => f.api.armSeek(fraction), /SEEK_FRACTION/);
  await assert.rejects(f.api.startAudio(), /AUDIO_ADMISSION/);
  await seekTo(f, .5);
  assert.throws(() => f.api.armSeek90(), /SEEK_ADMISSION/);
  await f.api.stop(); assert.equal(f.counts().listeners, 0);
});
test('each remaining fraction has its own advanced mapped frame, trusted input and post-seek PCM/AV evidence', async () => {
  for (const fraction of [.5, .9]) {
    const f = fixture(); const seek = (await seekTo(f, fraction)).seek;
    assert.equal(seek.passed, true); assert.equal(seek.fraction, fraction);
    assert.equal(seek.firstTargetFrame.sourceTime, fraction * 100);
    assert.equal(seek.nativeInputObserved, true);
    await output(f); await f.api.stop();
    const r = f.api.read();
    assert.equal(r.qualified, true); assert.equal(r.audio.passed, true);
    assert.equal(r.audio.videoTimeAdvanced, true); assert.equal(r.audio.videoFrames, 3);
    assert.equal(r.audio.sampleTimeAdvanced, true); assert.equal(r.audio.nativeTimeAdvanced, true);
    assert.equal(r.audio.nonzeroWindows, 3);
    assert(Object.values(r.cleanup).every(x => x === true));
    assert.deepEqual(f.counts(), { stopped: 1, disconnected: 10, closed: 1, cancelled: 1, timers: 0, intervals: 0, listeners: 0 });
    assert(!JSON.stringify(r).includes('PRIVATE'));
  }
});
test('programmatic or wrong-fraction slider events cannot qualify generation and target coincidence', async () => {
  for (const kind of ['absent', 'synthetic', 'wrong-fraction']) {
    const f = fixture(); await seekTo(f, .5, { pointer: false });
    if (kind === 'synthetic') f.pointer(.5, false);
    if (kind === 'wrong-fraction') f.pointer(.9);
    f.present(47); assert.equal(f.api.read().seek.passed, false, kind);
    f.deadline(45000); await f.api.stop(); assert.equal(f.api.read().seek.result, 'SEEK_DEADLINE');
    assert.equal(f.counts().listeners, 0);
  }
});
test('native activation, stale phase, replacement owner and mapping/generation drift reject PCM admission', async () => {
  for (const kind of ['activation', 'stale-time', 'owner', 'generation', 'mapping', 'seek', 'source', 'settlement']) {
    const f = fixture(); await seekTo(f, .9); f.video.paused = false;
    if (kind === 'activation') f.context.navigator.userActivation.isActive = false;
    if (kind === 'stale-time') f.advance(10001);
    if (kind === 'owner') f.context.q1Playback = { ...f.context.q1Playback };
    if (kind === 'generation') f.stats.generation++;
    if (kind === 'mapping') { f.stats.mapping.commonShift++; f.stats.mapping.sourceOrigin++; }
    if (kind === 'seek') f.context.mediaSeekGeneration++;
    if (kind === 'source') f.context.mediaSourceGeneration++;
    if (kind === 'settlement') f.context.mediaSeekWatchdog = 1;
    await assert.rejects(f.api.startAudio(), kind === 'activation' ? /NATIVE_USER_ACTIVATION_REQUIRED/ : /POST_SEEK_OWNER_FENCE/, kind);
    await f.api.stop(); assert.equal(f.counts().stopped, 0);
  }
});
test('old metadata, duplicate labels, replaced metadata owner and weak revision/checksum cannot qualify', async () => {
  for (const kind of ['stale-before', 'duplicate-before', 'weak-checksum', 'weak-revision', 'weak-checksum-format']) {
    assert.throws(() => fixture({ prepare({ meta, target }) {
      if (kind === 'stale-before') meta[0].at -= 60000;
      if (kind === 'duplicate-before') meta.push({ ...meta[0] });
      if (kind === 'weak-checksum') delete target.md5Checksum;
      if (kind === 'weak-checksum-format') target.md5Checksum = 'invalid';
      if (kind === 'weak-revision') delete target.version;
    } }), kind.startsWith('weak') ? /STRONG_TARGET_REQUIRED/ : /FRESH_BEFORE_REQUIRED/, kind);
  }
  const f = fixture(); await seekTo(f, .5); await output(f); await f.api.stop();
  assert.equal(f.api.read().qualified, true);
  f.meta[1].at = 100000; assert.equal(f.api.read().qualified, false, 'after predates output');
  f.meta[1].at = 100300; f.meta[1].freshRevisionChecksumSame = false;
  assert.equal(f.api.read().qualified, false);
  f.meta[1].freshRevisionChecksumSame = true; f.context.window.__rc32TsReplay = { read: () => ({ metadataResults: f.meta }) };
  assert.equal(f.api.read().qualified, false, 'metadata owner replaced');
});
test('PCM with no progressing video or divergent audio/native clocks fails and releases the pending RVFC', async () => {
  const f = fixture(); await seekTo(f, .5); await output(f, { present: false });
  assert.equal(f.api.read().audio.nonzeroWindows, 3);
  assert.equal(f.api.read().audio.passed, false); f.deadline(8000); await f.api.stop();
  assert.equal(f.api.read().audio.result, 'AUDIO_DEADLINE'); assert.equal(f.counts().timers, 0);
  const g = fixture(); await seekTo(g, .9); g.video.paused = false; await g.api.startAudio();
  await g.tick({ audioAdvance: 1.1 }); await g.api.stop();
  assert.equal(g.api.read().audio.result, 'AUDIO_CLOCK_FENCE'); assert.equal(g.api.read().audio.passed, false);
});
test('a later seek, changed mapping or source after audio start fails under the same object references', async () => {
  for (const kind of ['seek', 'mapping', 'source', 'owner']) {
    const f = fixture(); await seekTo(f, .5); f.video.paused = false; await f.api.startAudio();
    if (kind === 'seek') f.context.mediaSeekGeneration++;
    if (kind === 'mapping') { f.stats.mapping.commonShift++; f.stats.mapping.sourceOrigin++; }
    if (kind === 'source') f.context.mediaSourceGeneration++;
    if (kind === 'owner') f.context.q1Playback = { ...f.context.q1Playback };
    await f.tick(); await f.api.stop();
    assert.equal(f.api.read().audio.result, 'AV_OWNER_FENCE', kind);
    assert.equal(f.api.read().audio.passed, false); assert.equal(f.counts().listeners, 0);
  }
});
test('pending WebAudio resume remains deadline/cancel bounded and the old producer is byte-identical', async () => {
  for (const mode of ['deadline', 'cancel']) {
    const f = fixture({ resumePending: true }); await seekTo(f, .9); f.video.paused = false;
    const pending = f.api.startAudio();
    if (mode === 'deadline') f.deadline(8000); else await f.api.stop();
    await pending; await f.api.stop();
    assert.equal(f.counts().closed, 1); assert.equal(f.counts().timers, 0); assert.equal(f.counts().listeners, 0);
    assert.equal(f.api.read().audio.passed, false);
  }
  const crypto = require('node:crypto');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'audio-seek-supplement.expression.js'))).digest('hex'),
    '41305a9e20b7329cb9f46055e3b0d256848373f19211655c7fd0f15a1bd42967');
  assert(!/\.play\(|\.pause\(|getUserMedia|createMediaElementSource|\.destination|\.currentTime\s*=|dispatchEvent|\.click\(/.test(expression));
});
test('cleanup failures stay false across repeated stop and concurrent stop awaits the one bounded close', async () => {
  const f = fixture({ stopThrows: true, disconnectThrows: true }); await seekTo(f, .5); await output(f); await f.api.stop(); await f.api.stop();
  assert.equal(f.api.read().cleanup.tracksStopped, false); assert.equal(f.api.read().cleanup.nodesDisconnected, false);
  assert.equal(f.api.read().qualified, false); assert.equal(f.counts().stopped, 1);
  const g = fixture({ closePending: true }); await seekTo(g, .9); await output(g);
  let finished = false; const pending = g.api.stop().then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false, 'stop must not return while the existing context close is unresolved');
  g.deadline(1000); await pending;
  assert.equal(g.api.read().cleanup.contextClosed, false); assert.equal(g.api.read().qualified, false);
  assert.equal(g.counts().closed, 1); assert.equal(g.counts().timers, 0);
});
test('absent TS mapping stays the same through seek/resume/PCM; newly introduced mapping still fails', async () => {
  const nativeTs = () => fixture({ prepare({ context }) { delete context.q1Playback.player.stats().mapping; } });
  const f = nativeTs(); await seekTo(f, .5); await output(f); await f.api.stop();
  assert.equal(f.api.read().qualified, true);
  assert.equal(f.api.read().seek.firstTargetFrame.sourceClockShift, 0);
  const diagnostic = f.api.read().postSeekAdmission;
  assert(Object.values(diagnostic).every(value => typeof value === 'boolean' && value === true));
  for (const point of ['before-output', 'during-output']) {
    const g = nativeTs(); await seekTo(g, .9); g.video.paused = false;
    if (point === 'during-output') await g.api.startAudio();
    g.stats.mapping = { commonShift: 0, sourceOrigin: 0 };
    if (point === 'before-output') {
      await assert.rejects(g.api.startAudio(), /POST_SEEK_OWNER_FENCE/);
      assert.equal(g.api.read().postSeekAdmission.commonShiftSame, false);
      assert.equal(g.api.read().postSeekAdmission.sourceOriginSame, false);
    } else {
      await g.tick(); assert.equal(g.api.read().audio.result, 'AV_OWNER_FENCE');
    }
    await g.api.stop(); assert.equal(g.api.read().qualified, false);
    assert(!JSON.stringify(g.api.read()).includes('PRIVATE'));
  }
});
