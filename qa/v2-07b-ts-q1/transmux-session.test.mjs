import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createTransmuxSession } from './transmux-session.mjs';
import { analyzeGopBoundaries } from './gop-boundaries.mjs';
const require = createRequire(import.meta.url);
const { Transmuxer } = require('mux.js/dist/mux-mp4.min.js');
const { transmuxAtCuts } = require('./incremental-probe.cjs');
const fixture = readFileSync(new URL('./synthetic-bframes-audiolead.ts', import.meta.url));
const baseline = transmuxAtCuts(fixture, analyzeGopBoundaries(fixture).cuts).bytes;
const report = JSON.parse(readFileSync(new URL('./incremental-results.redacted.json', import.meta.url)));
const strict = report.observations.find(item => item.name === 'before-verified-idr');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const arrayBuffer = bytes => Uint8Array.from(bytes).buffer;

function setup({ send: extra, Mux = Transmuxer, transfer = false, syncAck = false } = {}) {
  const messages = [], detached = [];
  let session;
  session = createTransmuxSession({ generation: 7, sourceSize: fixture.length, Transmuxer: Mux,
    send(message, transfers) {
      if (message.type === 'fragment') {
        assert.deepEqual(transfers, [message.bytes]);
        assert.ok(message.bytes.byteLength > 0);
      } else assert.deepEqual(transfers, []);
      const copy = transfer ? structuredClone(message, { transfer: transfers }) : structuredClone(message);
      messages.push(copy);
      if (message.type === 'fragment' && transfer) { assert.equal(message.bytes.byteLength, 0); detached.push(message.bytes); }
      extra?.(message, session);
      if (message.type === 'fragment' && syncAck) session.receive({ type: 'ack', generation: 7, fragmentSequence: message.fragmentSequence });
    } });
  return { session, messages, detached };
}
function inputMessage(offset, sequence, length = 65536, bytes = fixture) {
  return { type: 'input', generation: 7, sequence, offset, bytes: arrayBuffer(bytes.subarray(offset, offset + length)) };
}
function ack(session) {
  session.receive({ type: 'ack', generation: 7, fragmentSequence: session.stats().awaitingFragment });
}
function feed(harness, chunkSize = 65536, bytes = fixture) {
  let sequence = 0;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    harness.session.receive(inputMessage(offset, ++sequence, chunkSize, bytes));
    while (harness.session.stats().awaitingFragment) ack(harness.session);
    if (harness.session.stats().state !== 'open') break;
    assert.equal(harness.messages.filter(row => row.type === 'input-done').at(-1).offset, Math.min(offset + chunkSize, bytes.length));
  }
}
function finish(harness) {
  harness.session.receive({ type: 'eof', generation: 7 });
  while (harness.session.stats().awaitingFragment) ack(harness.session);
}
function cleared(session) {
  const state = session.stats();
  for (const key of ['retainedInputBytes', 'retainedOutputBytes', 'outstandingOutputBytes', 'configBytes', 'initBytes', 'muxCachedGops', 'muxCachedBufferBytes']) assert.equal(state[key], 0, key);
  assert.equal(state.muxReleased, true);
  assert.equal(state.owner?.retainedBytes || 0, 0);
}

test('real mux, delayed ACK, transferred outputs: exact strict synthetic bytes and terminal cleanup', () => {
  assert.equal(strict.preserved, true);
  assert.equal(sha(fixture), report.fixture.sha256);
  assert.equal(require('mux.js/package.json').version, report.library.version);
  assert.equal(sha(readFileSync(require.resolve('mux.js/dist/mux-mp4.min.js'))), report.library.sha256);
  assert.equal(sha(baseline), strict.outputSha256);
  for (const chunkSize of [4093, 65536]) {
    const h = setup({ transfer: true }); feed(h, chunkSize);
    assert.equal(h.messages.filter(item => item.type === 'fragment').length, 5);
    assert.equal(h.messages.some(item => item.type === 'finished'), false);
    const beforeEof = h.session.stats();
    assert.ok(beforeEof.peakMuxCachedBufferBytes > 0);
    assert.ok(beforeEof.peakMuxCachedBufferBytes > beforeEof.peakMuxCachedNalBytes, 'backing retention is not just NAL view length');
    assert.ok(beforeEof.peakInputBytes <= 65536);
    assert.ok(beforeEof.peakMuxCachedGops <= 6);
    finish(h);
    const fragments = h.messages.filter(item => item.type === 'fragment');
    assert.deepEqual(fragments.map(item => item.fragmentSequence), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(fragments.map(item => item.initIncluded), [true, false, false, false, false, false]);
    assert.ok(fragments[0].sourceConsumed < fixture.length);
    assert.ok(Buffer.concat(fragments.map(item => Buffer.from(item.bytes))).equals(baseline));
    assert.equal(h.detached.length, 6);
    assert.equal(h.messages.at(-1).type, 'finished');
    assert.equal(h.session.stats().acknowledged, 6);
    assert.ok(h.session.stats().cleanup.beforeGops > 0);
    cleared(h.session);
  }
});

test('held fragment stops parser within current input; admission copy survives caller mutation and detachment', () => {
  const h = setup();
  h.session.receive(inputMessage(0, 1)); h.session.receive(inputMessage(65536, 2));
  const third = inputMessage(131072, 3);
  h.session.receive(third);
  const held = h.session.stats();
  assert.equal(held.awaitingFragment, 1);
  assert.ok(held.consumed > 131072 && held.consumed < 196608);
  assert.equal(h.messages.filter(item => item.type === 'input-done').length, 2);
  new Uint8Array(third.bytes).fill(0);
  structuredClone(third.bytes, { transfer: [third.bytes] });
  h.session.receive({ type: 'ack', generation: 6, fragmentSequence: 1 });
  h.session.receive({ type: 'abort', generation: 6 });
  assert.deepEqual(h.session.stats(), held);
  ack(h.session);
  assert.equal(h.session.stats().consumed, 196608);
  for (let offset = 196608, sequence = 4; offset < fixture.length; offset += 65536, sequence++) {
    h.session.receive(inputMessage(offset, sequence));
    while (h.session.stats().awaitingFragment) ack(h.session);
  }
  finish(h);
  assert.ok(Buffer.concat(h.messages.filter(row => row.type === 'fragment').map(row => Buffer.from(row.bytes))).equals(baseline));
});

test('synchronous ACK resumes without reentering parser and synchronous input-done producer is bounded', () => {
  let nextOffset = 65536, nextSequence = 2;
  const h = setup({ syncAck: true, transfer: true, send(message, session) {
    if (message.type !== 'input-done') return;
    if (nextOffset < fixture.length) {
      const request = inputMessage(nextOffset, nextSequence++); nextOffset += request.bytes.byteLength;
      session.receive(request);
    } else session.receive({ type: 'eof', generation: 7 });
  } });
  h.session.receive(inputMessage(0, 1));
  assert.equal(h.messages.at(-1).type, 'finished');
  assert.equal(h.messages.filter(item => item.type === 'fragment').length, 6);
  cleared(h.session);
});

test('abort reentrantly during fragment send emits only terminal cleanup, never input completion or later output', () => {
  const h = setup({ send(message, session) {
    if (message.type === 'fragment') session.receive({ type: 'abort', generation: 7 });
  } });
  feed(h);
  assert.equal(h.messages.at(-1).type, 'aborted');
  assert.equal(h.messages.filter(item => item.type === 'fragment').length, 1);
  assert.equal(h.messages.filter(item => item.type === 'input-done').length, 2);
  const count = h.messages.length;
  h.session.receive({ type: 'eof', generation: 7 }); h.session.receive(inputMessage(0, 1));
  assert.equal(h.messages.length, count); cleared(h.session);
});

test('final EOF fragment requires ACK; early EOF and duplicate EOF fail closed', () => {
  const h = setup(); feed(h);
  h.session.receive({ type: 'eof', generation: 7 });
  assert.equal(h.session.stats().state, 'open'); assert.equal(h.session.stats().awaitingFragment, 6);
  assert.equal(h.messages.at(-1).type, 'fragment');
  ack(h.session); assert.equal(h.messages.at(-1).type, 'finished');
  for (const ready of [false, true]) {
    const x = setup(); if (ready) { feed(x); x.session.receive({ type: 'eof', generation: 7 }); }
    x.session.receive({ type: 'eof', generation: 7 });
    assert.equal(x.messages.at(-1).code, 'SESSION_EOF'); cleared(x.session);
  }
});

test('current-generation overlapping input, wrong and duplicate ACK terminate without additional consumption', () => {
  for (const request of [
    { type: 'ack', generation: 7, fragmentSequence: 2 }, inputMessage(196608, 4),
  ]) {
    const h = setup(); h.session.receive(inputMessage(0, 1)); h.session.receive(inputMessage(65536, 2)); h.session.receive(inputMessage(131072, 3));
    const consumed = h.session.stats().consumed;
    h.session.receive(request);
    assert.equal(h.session.stats().state, 'error'); assert.equal(h.session.stats().consumed, consumed); cleared(h.session);
  }
  const h = setup(); h.session.receive({ type: 'ack', generation: 7, fragmentSequence: 1 });
  assert.equal(h.messages.at(-1).code, 'SESSION_ACK_SEQUENCE');
  const duplicate = setup({ syncAck: true }); feed(duplicate);
  duplicate.session.receive({ type: 'ack', generation: 7, fragmentSequence: 5 });
  assert.equal(duplicate.messages.at(-1).code, 'SESSION_ACK_SEQUENCE');
});

test('options, input sequence/offset/budget and unrecognized messages are fixed-code failures', () => {
  for (const options of [{ generation: 0 }, { sourceSize: 0 }, { sourceSize: Number.MAX_SAFE_INTEGER + 1 }, { send: null }, { Transmuxer: null }]) {
    assert.throws(() => createTransmuxSession({ generation: 7, sourceSize: fixture.length, Transmuxer, send() {}, ...options }), /^Error: SESSION_OPTIONS$/);
  }
  for (const patch of [{ sequence: 2 }, { offset: 1 }, { bytes: new ArrayBuffer(65537) }, { bytes: new ArrayBuffer(0) }, { bytes: new Uint8Array(188) }, { type: 'unknown' }]) {
    const h = setup(); h.session.receive({ ...inputMessage(0, 1), ...patch });
    assert.equal(h.session.stats().state, 'error');
    assert.match(h.messages.at(-1).code, /^SESSION_(INPUT_SEQUENCE|INPUT_LIMIT|MESSAGE)$/); cleared(h.session);
  }
});

test('late malformed source after emitted fragments is an error, not a finished whole-file success', () => {
  const damaged = Buffer.from(fixture); damaged[188 * 3600 + 1] |= 128;
  const h = setup(); feed(h, 65536, damaged);
  assert.ok(h.messages.some(item => item.type === 'fragment'));
  assert.equal(h.messages.at(-1).type, 'error');
  assert.equal(h.messages.at(-1).code, 'SESSION_PIPELINE_FAILED');
  assert.equal(h.messages.some(item => item.type === 'finished'), false); cleared(h.session);
});

test('send exception, rejected async send and hostile then getter are sanitized and terminal', async () => {
  for (const variant of ['throw', 'async', 'getter']) {
    const messages = [];
    const session = createTransmuxSession({ generation: 7, sourceSize: fixture.length, Transmuxer,
      send(message) {
        messages.push(message.type);
        if (message.type !== 'input-done') return;
        if (variant === 'throw') throw new Error('private arbitrary text');
        if (variant === 'async') return Promise.reject(new Error('private rejection'));
        return { get then() { throw new Error('private then'); } };
      } });
    session.receive(inputMessage(0, 1));
    assert.equal(session.stats().state, 'error');
    assert.equal(session.stats().failure, variant === 'async' ? 'SESSION_ASYNC_SEND' : 'SESSION_SEND_FAILED');
    assert.deepEqual(messages, ['input-done', 'error']); cleared(session);
  }
  await new Promise(resolve => setImmediate(resolve));
});

test('ACK then send failure cannot pump more bytes or claim success', () => {
  const messages = []; let session;
  session = createTransmuxSession({ generation: 7, sourceSize: fixture.length, Transmuxer, send(message) {
    messages.push(message);
    if (message.type === 'fragment') {
      session.receive({ type: 'ack', generation: 7, fragmentSequence: message.fragmentSequence });
      throw new Error('broken channel');
    }
  } });
  session.receive(inputMessage(0, 1)); session.receive(inputMessage(65536, 2)); session.receive(inputMessage(131072, 3));
  assert.equal(messages.at(-1).code, 'SESSION_SEND_FAILED');
  assert.equal(session.stats().consumed, messages.find(row => row.type === 'fragment').sourceConsumed); cleared(session);
});

test('a broken terminal channel is not retried recursively and never exposes thrown details', () => {
  let calls = 0;
  const session = createTransmuxSession({ generation: 7, sourceSize: fixture.length, Transmuxer,
    send() { calls++; throw new Error('private broken transport'); } });
  session.receive({ type: 'abort', generation: 7 });
  assert.equal(calls, 1); assert.equal(session.stats().failure, 'SESSION_SEND_FAILED'); cleared(session);
  session.receive({ type: 'abort', generation: 7 }); assert.equal(calls, 1);
});

test('source-size overflow and stale input do not acquire or leak an input credit', () => {
  const events = [];
  const session = createTransmuxSession({ generation: 7, sourceSize: 188, Transmuxer, send: row => events.push(row) });
  session.receive({ type: 'input', generation: 6, sequence: 1, offset: 0, bytes: new ArrayBuffer(65537) });
  assert.equal(session.stats().state, 'open'); assert.equal(session.stats().retainedInputBytes, 0); assert.equal(events.length, 0);
  session.receive(inputMessage(0, 1, 189));
  assert.equal(events.at(-1).code, 'SESSION_INPUT_LIMIT'); assert.equal(session.stats().consumed, 0); cleared(session);
});

// Wrap the real pinned encoder so invalid output cases still exercise source
// ownership, init binding and cleanup rather than bypassing the GOP owner.
function changedMux(change) {
  return class {
    constructor(options) { this.inner = new Transmuxer(options); }
    get transmuxPipeline_() { return this.inner.transmuxPipeline_; }
    on(name, handler) { this.inner.on(name, item => change(item, handler)); }
    push(bytes) { this.inner.push(bytes); }
    flush() { this.inner.flush(); }
    reset() { this.inner.reset(); }
    dispose() { this.inner.dispose(); }
  };
}
test('missing, duplicated, oversized and invalid init mux output fail closed', () => {
  const variants = [
    [() => {}, 'SESSION_MUX_OUTPUT'],
    [(item, emit) => { emit(item); emit(item); }, 'SESSION_MUX_OUTPUT'],
    [(item, emit) => emit({ ...item, data: new Uint8Array(2 * 1024 * 1024 + 1) }), 'SESSION_OUTPUT_LIMIT'],
    [(item, emit) => emit({ ...item, initSegment: new Uint8Array(item.initSegment.length) }), 'SESSION_INIT_INVALID'],
  ];
  for (const [change, code] of variants) {
    const h = setup({ Mux: changedMux(change) }); feed(h);
    assert.equal(h.messages.at(-1).code, code);
    assert.equal(h.messages.some(row => row.type === 'fragment'), false); cleared(h.session);
  }
});

test('cleanup resets actual cached bytes before dispose; reset failure is not reported as success', () => {
  const calls = [];
  class Observed extends Transmuxer {
    constructor(options) {
      super(options);
      const reset = this.reset, dispose = this.dispose;
      this.reset = () => { calls.push('reset'); reset.call(this); };
      this.dispose = () => { calls.push('dispose'); assert.equal(this.transmuxPipeline_?.videoSegmentStream?.gopCache_.length || 0, 0); dispose.call(this); };
    }
  }
  const h = setup({ Mux: Observed }); feed(h); h.session.receive({ type: 'abort', generation: 7 });
  assert.deepEqual(calls, ['reset', 'dispose']); assert.ok(h.session.stats().cleanup.beforeBufferBytes > 0); cleared(h.session);
  class Broken extends Transmuxer { constructor(options) { super(options); this.reset = () => { throw new Error('private cleanup'); }; } }
  const x = setup({ Mux: Broken }); feed(x); x.session.receive({ type: 'abort', generation: 7 });
  assert.equal(x.messages.at(-1).code, 'SESSION_CLEANUP_FAILED'); assert.equal(x.session.stats().muxReleased, true);
});
