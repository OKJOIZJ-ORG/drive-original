'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const expression = fs.readFileSync(path.join(__dirname, 'audio-seek-supplement.expression.js'), 'utf8');
const binding = JSON.parse(fs.readFileSync(path.join(__dirname, 'binding.json'), 'utf8'));
function fixture(options = {}) {
  let now = 100000, id = 0, frame = null, stopped = 0, disconnected = 0, closed = 0, cancelled = 0;
  const timers = new Map(), intervals = new Map();
  const target = { id: 'PRIVATE_ID', name: 'PRIVATE_NAME', size: '100', version: '9' };
  const track = { enabled: true, muted: false, readyState: 'live', stop() { this.readyState = 'ended'; stopped++; } };
  const video = { currentTime: 0, duration: 100, paused: false, ended: false, seeking: false, muted: false, volume: .5, readyState: 4,
    captureStream: () => ({ getTracks: () => [track], getAudioTracks: () => [track] }),
    requestVideoFrameCallback: fn => { frame = fn; return ++id; }, cancelVideoFrameCallback() { frame = null; cancelled++; } };
  let audioContext;
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.channel = 0; audioContext = this; }
    createMediaStreamSource() { return { connect() {}, disconnect() { disconnected++; } }; }
    createChannelSplitter(n) { assert.equal(n, 8); return { connect() {}, disconnect() { disconnected++; } }; }
    createAnalyser() { const channel = this.channel++; return { disconnect() { disconnected++; }, getFloatTimeDomainData(values) {
      values.fill(options.silent ? 0 : channel === 0 ? .1 : channel === 1 ? -.1 : 0);
    } }; }
    resume() { if (options.resumePending) return new Promise(() => {}); this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; closed++; return Promise.resolve(); }
  }
  const controller = { state: 'activated' }, stats = { generation: 1, phase: 'ready', duration: 100, mapping: { commonShift: 5, sourceOrigin: 2 } };
  const meta = ['before', 'after'].map(label => ({ label, at: label === 'before' ? now - 1 : now, status: 200, sameExactTarget: true, stableMetadataSame: true,
    freshRevisionChecksumSame: true, accountSame: true, sourceSame: true, notTrashed: true, canDownload: true }));
  const context = { window: { AudioContext, __resumeReplayTarget30: target,
    __resumeSwProof: { get: () => ({ ...binding, controller }) }, __rc32TsReplay: { read: () => ({ metadataResults: meta }) } },
    APP_VERSION: binding.version, navigator: { serviceWorker: { controller } }, document: { visibilityState: 'visible' },
    state: { selected: target, accountId: 'PRIVATE_ACCOUNT', authAccountKey: 'PRIVATE_KEY', authStatus: 'online',
      authGeneration: 1, driveSessionGeneration: 1, mediaSession: 2 },
    q1Playback: { swGeneration: 4, player: { stats: () => stats }, controller: { signal: { aborted: false } } }, q0Playback: null,
    getActiveMediaElement: () => video, isCurrentMediaEvent: v => v === video,
    mediaSourceGeneration: 4, mediaSeekGeneration: 1, mediaSeekSettledGeneration: 1, mediaSeekWatchdog: null,
    Date: { now: () => now }, Float32Array,
    setTimeout(fn, ms) { const key = ++id; timers.set(key, { fn, ms }); return key; }, clearTimeout: key => timers.delete(key),
    setInterval(fn) { const key = ++id; intervals.set(key, fn); return key; }, clearInterval: key => intervals.delete(key) };
  vm.createContext(context); vm.runInContext(expression, context);
  return { context, video, track, stats, meta, api: context.window.__rc32AudioSeekSupplement,
    async tick() { now += 100; meta[1].at = now; if (!video.paused) video.currentTime += .1; if (audioContext) audioContext.currentTime += .1;
      [...intervals.values()].forEach(fn => fn()); await Promise.resolve(); await Promise.resolve(); },
    present(mediaTime) { video.currentTime = mediaTime; const fn = frame; frame = null; fn?.(0, { mediaTime, width: 640, height: 360 }); },
    deadline(ms) { [...timers.values()].find(x => x.ms === ms)?.fn(); },
    counts: () => ({ stopped, disconnected, closed, cancelled, timers: timers.size, intervals: intervals.size }) };
}
test('10% requires new seek and pipeline generation, mapped presented target and settlement', async () => {
  const f = fixture(); f.api.armSeek10(); f.present(7); assert.equal(f.api.read().seek10.passed, false);
  f.context.mediaSeekGeneration++; f.context.mediaSourceGeneration++; f.context.q1Playback.swGeneration++;
  f.stats.generation++; f.present(7); assert.equal(f.api.read().seek10.passed, false);
  f.context.mediaSeekSettledGeneration = f.context.mediaSeekGeneration; f.present(7);
  assert.equal(f.api.read().seek10.firstTargetFrame.sourceTime, 10); assert.equal(f.api.read().seek10.passed, true);
  await f.api.stop(); assert.equal(f.counts().timers, 0);
});
test('opposite-phase stereo passes per-channel PCM, bounded cleanup and no private export', async () => {
  const f = fixture(); await f.api.startAudio(); for (let i = 0; i < 3; i++) await f.tick();
  const r = f.api.read(); assert.equal(r.audio.passed, true); assert.equal(r.audio.polls, 3);
  assert(r.audio.maxRmsByChannel[0] > 0 && r.audio.maxRmsByChannel[1] > 0);
  await f.api.stop(); const final = f.api.read();
  assert.equal(final.cleanup.contextClosed, true); assert.equal(final.cleanup.tracksStopped, true);
  assert.equal(final.cleanup.nodesDisconnected, true); assert.equal(f.counts().stopped, 1);
  assert.equal(f.counts().disconnected, 10); assert.equal(f.counts().closed, 1);
  assert.equal(f.counts().timers, 0); assert.equal(f.counts().intervals, 0);
  assert(!JSON.stringify(final).includes('PRIVATE')); assert(expression.includes('createChannelSplitter(8)'));
});
test('silence cannot pass despite capture clock/native progression; deadline releases resources', async () => {
  const f = fixture({ silent: true }); await f.api.startAudio(); await f.tick(); f.deadline(8000);
  await f.api.stop(); assert.equal(f.api.read().audio.passed, false); assert.equal(f.api.read().audio.result, 'AUDIO_DEADLINE');
  assert.equal(f.counts().stopped, 1); assert.equal(f.counts().intervals, 0);
});
test('original mute rejects admission; enabled live unmuted capture track required', async () => {
  const f = fixture(); f.video.muted = true; await assert.rejects(f.api.startAudio(), /AUDIO_ADMISSION/); await f.api.stop();
  for (const field of ['muted', 'enabled', 'readyState']) {
    const g = fixture(); await g.api.startAudio(); g.track[field] = field === 'muted' ? true : field === 'enabled' ? false : 'ended';
    await g.tick(); await g.api.stop(); assert.equal(g.api.read().audio.result, 'CAPTURE_TRACK_FENCE');
  }
});
test('account/source/native/output/seek drift cannot qualify PCM', async () => {
  for (const kind of ['account', 'source', 'paused', 'volume', 'seek', 'generation']) {
    const f = fixture(); await f.api.startAudio();
    if (kind === 'account') f.context.state.authGeneration++;
    if (kind === 'source') f.context.APP_VERSION = 'wrong';
    if (kind === 'paused') f.video.paused = true;
    if (kind === 'volume') f.video.volume = .8;
    if (kind === 'seek') f.context.mediaSeekGeneration++;
    if (kind === 'generation') f.stats.generation++;
    await f.tick(); await f.api.stop(); assert.equal(f.api.read().audio.passed, false); assert.equal(f.counts().stopped, 1);
  }
});
test('pending resume is bounded by deadline and cancellation; full pass still needs fresh metadata', async () => {
  for (const mode of ['deadline', 'cancel']) {
    const f = fixture({ resumePending: true }); const pending = f.api.startAudio();
    if (mode === 'deadline') f.deadline(8000); else await f.api.stop();
    await pending; await f.api.stop(); assert.equal(f.counts().closed, 1); assert.equal(f.counts().timers, 0);
  }
  const f = fixture(); f.api.armSeek10(); f.context.mediaSeekGeneration++; f.context.mediaSeekSettledGeneration++;
  f.context.mediaSourceGeneration++; f.context.q1Playback.swGeneration++;
  f.stats.generation++; f.present(7); await f.api.startAudio(); for (let i = 0; i < 3; i++) await f.tick();
  await f.api.stop();
  assert.equal(f.api.read().qualified, true); f.meta[1].freshRevisionChecksumSame = false;
  assert.equal(f.api.read().qualified, false); await f.api.stop();
  f.meta[1].freshRevisionChecksumSame = true; f.meta[1].at = 100000;
  assert.equal(f.api.read().qualified, false, 'stale after metadata cannot qualify new output');
});
test('unsupported capture and seek-owner drift fail cleanly; observer contains no native mutation', async () => {
  const f = fixture(); delete f.video.captureStream; await assert.rejects(f.api.startAudio(), /CAPTURE_UNSUPPORTED/); await f.api.stop();
  const g = fixture(); g.api.armSeek10(); g.context.state.selected = { id: 'different' }; g.present(7);
  assert.equal(g.api.read().seek10.result, 'OWNER_FENCE'); await g.api.stop();
  assert(!/\.play\(|\.pause\(|getUserMedia|createMediaElementSource|\.destination|\.currentTime\s*=/.test(expression));
});
test('Q1 permits exactly one expected seek/source retirement and rejects unrelated/extra/stale advancement', async () => {
  for (const kind of ['extra-source', 'extra-seek', 'unrelated-source', 'stale-sw-owner', 'replaced-owner']) {
    const f = fixture(); f.api.armSeek10();
    f.context.mediaSeekGeneration++; f.context.mediaSeekSettledGeneration++;
    f.context.mediaSourceGeneration++; f.context.q1Playback.swGeneration++; f.stats.generation++;
    if (kind === 'extra-source') { f.context.mediaSourceGeneration++; f.context.q1Playback.swGeneration++; }
    if (kind === 'extra-seek') { f.context.mediaSeekGeneration++; f.context.mediaSeekSettledGeneration++; }
    if (kind === 'unrelated-source') f.context.mediaSeekGeneration--;
    if (kind === 'stale-sw-owner') f.context.q1Playback.swGeneration--;
    if (kind === 'replaced-owner') f.context.q1Playback = { ...f.context.q1Playback };
    f.present(7); assert.equal(f.api.read().seek10.passed, false, kind);
    assert.equal(f.api.read().seek10.result, 'OWNER_FENCE', kind); await f.api.stop();
  }
  const f = fixture(); f.api.armSeek10(); f.context.mediaSeekGeneration++; f.context.mediaSeekSettledGeneration++;
  f.stats.generation++; f.present(7);
  assert.equal(f.api.read().seek10.passed, false, 'old SW source cannot qualify a Q1 target frame'); await f.api.stop();
});
test('paused target RVFC before late ready/settlement qualifies without another frame only under same owner and clocks', async () => {
  const f = fixture(); f.video.paused = true; f.api.armSeek10();
  f.context.mediaSeekGeneration++; f.context.mediaSourceGeneration++; f.context.q1Playback.swGeneration++;
  f.stats.generation++; f.stats.phase = 'buffering'; f.video.seeking = true; f.context.state.isSeeking = true;
  f.present(7); const before = f.api.read().seek10;
  assert.equal(before.passed, false); assert.equal(before.framesObserved, 1);
  assert.equal(before.lastFrame.targetAligned, true); assert.equal(before.lastRejection, 'SETTLEMENT_PENDING');
  f.stats.phase = 'ready'; f.video.seeking = false; f.context.state.isSeeking = false;
  f.context.mediaSeekSettledGeneration = f.context.mediaSeekGeneration;
  await f.tick(); const after = f.api.read().seek10;
  assert.equal(after.passed, true); assert.equal(after.framesObserved, 1); assert.equal(after.firstTargetFrame.lateReadiness, true);
  await f.api.stop(); assert.equal(f.counts().intervals, 0); assert.equal(f.counts().timers, 0);
});
test('wrong presented target never becomes provisional; late owner/generation/mapping/content drift rejects', async () => {
  for (const kind of ['wrongtarget', 'owner', 'pipeline', 'mapping', 'same-shift-mapping', 'target']) {
    const f = fixture(); f.video.paused = true; f.api.armSeek10();
    f.context.mediaSeekGeneration++; f.context.mediaSourceGeneration++; f.context.q1Playback.swGeneration++;
    f.stats.generation++; f.stats.phase = 'buffering'; f.present(kind === 'wrongtarget' ? 30 : 7);
    f.stats.phase = 'ready'; f.context.mediaSeekSettledGeneration = f.context.mediaSeekGeneration;
    if (kind === 'owner') f.context.q1Playback = { ...f.context.q1Playback };
    if (kind === 'pipeline') f.stats.generation++;
    if (kind === 'mapping') f.stats.mapping.commonShift++;
    if (kind === 'same-shift-mapping') { f.stats.mapping.commonShift++; f.stats.mapping.sourceOrigin++; }
    if (kind === 'target') f.context.state.selected = { id: 'different' };
    f.video.currentTime = 7; await f.tick(); assert.equal(f.api.read().seek10.passed, false, kind);
    if (kind !== 'wrongtarget') assert.equal(f.api.read().seek10.result, 'PROVISIONAL_OWNER_FENCE', kind);
    else { assert.equal(f.api.read().seek10.lastFrame.targetAligned, false); f.deadline(45000); }
    await f.api.stop(); assert.equal(f.counts().intervals, 0); assert.equal(f.counts().timers, 0);
  }
});
