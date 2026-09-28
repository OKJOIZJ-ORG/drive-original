import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('pcm-output-after-reload.expression.js', import.meta.url), 'utf8');

function fixture() {
  const click = new Map(), timers = new Map(), audioEvents = new Map();
  const trace = { srcAssigned: 0, revoked: 0, loads: 0, pauses: 0 };
  const button = {
    addEventListener: (type, fn) => click.set(type, fn),
    removeEventListener: (type, fn) => { if (click.get(type) === fn) click.delete(type); }
  };
  let audio, payload, time = 0, nextTimer = 0;
  class Audio {
    constructor() { audio = this; this.currentTime = 0; this.error = null; }
    set src(value) { this.source = value; trace.srcAssigned++; }
    get src() { return this.source; }
    addEventListener(type, fn) { audioEvents.set(type, fn); }
    removeEventListener(type, fn) { if (audioEvents.get(type) === fn) audioEvents.delete(type); }
    play() { return Promise.resolve(); }
    pause() { trace.pauses++; }
    removeAttribute(name) { if (name === 'src') this.source = null; }
    load() { trace.loads++; }
  }
  const handle = runInNewContext(source, {
    document: { getElementById: id => id === 'brandButton' ? button : null },
    URL: { createObjectURL: blob => { payload = blob; return 'blob:qa-fixture'; }, revokeObjectURL: () => { trace.revoked++; } },
    Blob, Audio, performance: { now: () => time },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id)
  });
  const dispatch = type => { time += 10; audioEvents.get(type)?.({ type }); };
  return { handle, trace, timers, click, audioEvents, dispatch, get audio() { return audio; }, get payload() { return payload; } };
}

test('generated PCM header, exact half-second length and zero samples are valid', async () => {
  const f = fixture(), bytes = Buffer.from(await f.payload.arrayBuffer());
  assert.equal(bytes.length, 96044);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt16LE(20), 1);
  assert.equal(bytes.readUInt16LE(22), 2);
  assert.equal(bytes.readUInt32LE(24), 48000);
  assert.equal(bytes.readUInt32LE(28), 192000);
  assert.equal(bytes.readUInt16LE(32), 4);
  assert.equal(bytes.readUInt16LE(34), 16);
  assert.equal(bytes.readUInt32LE(40), 96000);
  assert(bytes.subarray(44).every(value => value === 0));
  assert.equal(f.trace.srcAssigned, 0);
  f.handle.clear();
});

test('source and play start only after the existing UI click, then an error releases all owned resources', () => {
  const f = fixture();
  assert.equal(f.audio.preload, 'none');
  assert.equal(f.handle.poll().started, false);
  f.click.get('click')();
  assert.equal(f.handle.poll().started, true);
  assert.equal(f.trace.srcAssigned, 1);
  f.audio.error = { code: 3, message: 'PipelineStatus::AUDIO_RENDERER_ERROR: audio render error' };
  f.dispatch('error');
  assert.equal(f.handle.poll().passed, false);
  assert.equal(f.handle.poll().done, true);
  assert.equal(f.handle.poll().events[0].errorCode, 3);
  assert.equal(f.trace.revoked, 1);
  assert.equal(f.audioEvents.size + f.click.size + f.timers.size, 0);
  assert.equal(f.audio.src, null);
  f.handle.clear();
  assert.equal(f.trace.revoked, 1);
});

test('actual completed time is required for pass, not canplay or a play call', () => {
  const f = fixture();
  f.click.get('click')();
  f.dispatch('canplay'); f.dispatch('playing');
  assert.equal(f.handle.poll().passed, false);
  f.audio.currentTime = 0.5; f.dispatch('ended');
  assert.equal(f.handle.poll().passed, true);
  assert.equal(f.handle.poll().revoked, true);
});

test('deadline and cancellation remove the pending click, source, timer and blob', () => {
  const f = fixture();
  f.click.get('click')();
  [...f.timers.values()][0]();
  assert.equal(f.handle.poll().failure, 'PCM_TIMEOUT');
  assert.equal(f.handle.poll().passed, false);
  assert.equal(f.audioEvents.size + f.click.size + f.timers.size, 0);
  const cancelled = fixture();
  cancelled.handle.clear();
  assert.equal(cancelled.trace.srcAssigned, 0);
  assert.equal(cancelled.click.size, 0);
  assert.equal(cancelled.trace.revoked, 1);
});

test('native error text containing URLs or credential labels is never exported', () => {
  const f = fixture();
  f.click.get('click')();
  f.audio.error = { code: 3, message: 'https://private.invalid/token-secret' };
  f.dispatch('error');
  assert.equal('errorMessage' in f.handle.poll().events[0], false);
});

test('retained live observations discriminate output failure from a performed background test', async () => {
  const native = JSON.parse(await readFile(new URL('retry-2-native-error-results.json', import.meta.url), 'utf8'));
  const error = native.observed.events.find(row => row.event === 'error');
  assert.equal(error.errorCode, 3); assert.equal(error.frames, 4);
  assert.equal(error.errorMessage, 'PipelineStatus::AUDIO_RENDERER_ERROR: audio render error');
  assert.equal(native.backgroundPerformed, false);
  const pcm = JSON.parse(await readFile(new URL('pcm-output-after-reload-results.json', import.meta.url), 'utf8'));
  assert.equal(pcm.result.started, true); assert.equal(pcm.result.passed, false);
  assert(pcm.result.events.some(row => row.event === 'playing'));
  assert(pcm.result.events.some(row => row.event === 'error' && row.errorMessage === error.errorMessage));
  assert.equal(pcm.result.revoked, true);
});
