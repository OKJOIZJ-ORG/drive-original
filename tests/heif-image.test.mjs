import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHeifImage, HEIF_LIMITS, isHeifHeader } from '../media/heif-image.mjs';

function header(brand = 'heic', compatible = []) {
  const bytes = new Uint8Array(16 + compatible.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  bytes.set([...'ftyp'].map(char => char.charCodeAt(0)), 4);
  bytes.set([...brand].map(char => char.charCodeAt(0)), 8);
  compatible.forEach((value, index) => bytes.set([...value].map(char => char.charCodeAt(0)), 16 + index * 4));
  return bytes;
}

function imageBlob(bytes = header()) {
  return new Blob([bytes]);
}

class OversizedPng extends Blob {
  get size() { return HEIF_LIMITS.pixels * 4 + 1048577; }
  constructor() { super([], { type: 'image/png' }); }
}

async function withWorker(run) {
  const original = globalThis.Worker;
  const workers = [];
  class FakeWorker {
    terminated = false;
    messages = [];
    constructor(url) { this.url = String(url); workers.push(this); }
    postMessage(message, transfer) { this.messages.push({ message, transfer }); }
    terminate() { this.terminated = true; }
    send(data) { this.onmessage?.({ data }); }
  }
  globalThis.Worker = FakeWorker;
  try { return await run(workers); }
  finally { globalThis.Worker = original; }
}

async function waitForWorker(workers) {
  for (let i = 0; i < 20 && !workers.length; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(workers.length, 1, 'adapter should create exactly one worker');
  return workers[0];
}

test('HEIF header accepts HEIC brands and rejects AVIF or malformed boxes', () => {
  assert.equal(isHeifHeader(header('mif1', ['heic'])), true);
  assert.equal(isHeifHeader(header('heix')), true);
  assert.equal(isHeifHeader(header('hevc')), true);
  assert.equal(isHeifHeader(header('hevx')), true);
  assert.equal(isHeifHeader(header('avif', ['heic'])), false);
  assert.equal(isHeifHeader(header('avis', ['heic'])), false);
  assert.equal(isHeifHeader(new Uint8Array(15)), false);
  const malformed = header();
  new DataView(malformed.buffer).setUint32(0, malformed.length + 1);
  assert.equal(isHeifHeader(malformed), false);
});

test('adapter rejects AVIF before creating a worker', async () => withWorker(async workers => {
  await assert.rejects(decodeHeifImage(imageBlob(header('avif'))), { message: 'HEIF_FORMAT_UNSUPPORTED' });
  assert.equal(workers.length, 0);
}));

test('adapter transfers input bytes and accepts a bounded PNG result once', async () => withWorker(async workers => {
  const pending = decodeHeifImage(imageBlob());
  const worker = await waitForWorker(workers);
  assert.equal(worker.url.endsWith('/media/heif-worker.js'), true);
  assert.equal(worker.messages.length, 1);
  assert.equal(worker.messages[0].message.bytes instanceof ArrayBuffer, true);
  assert.deepEqual(worker.messages[0].transfer, [worker.messages[0].message.bytes]);

  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  worker.send({ blob, width: 3, height: 2, sourceFrames: 2 });
  worker.send({ blob, width: 3, height: 2, sourceFrames: 2 });
  assert.deepEqual(await pending, { blob, width: 3, height: 2, sourceFrames: 2, frames: 1, bitDepth: 8, format: 'png' });
  assert.equal(worker.terminated, true);
}));

test('adapter rejects invalid output dimensions, mime, bytes, and frame metadata and terminates', async t => withWorker(async workers => {
  const cases = [
    ['wrong mime', { blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), width: 1, height: 1, sourceFrames: 1 }],
    ['empty PNG', { blob: new Blob([], { type: 'image/png' }), width: 1, height: 1, sourceFrames: 1 }],
    ['oversized PNG bytes', { blob: new OversizedPng(), width: 1, height: 1, sourceFrames: 1 }],
    ['oversized dimensions', { blob: new Blob([new Uint8Array([1])], { type: 'image/png' }), width: 4001, height: 4000, sourceFrames: 1 }],
    ['zero frames', { blob: new Blob([new Uint8Array([1])], { type: 'image/png' }), width: 1, height: 1, sourceFrames: 0 }],
  ];
  for (const [label, result] of cases) await t.test(label, async () => {
    const pending = decodeHeifImage(imageBlob());
    const worker = await waitForWorker(workers);
    worker.send(result);
    await assert.rejects(pending, { message: 'HEIF_OUTPUT_INVALID' });
    assert.equal(worker.terminated, true);
    workers.length = 0;
  });
}));

test('pre-aborted signal rejects without reading or creating a worker', async () => withWorker(async workers => {
  const controller = new AbortController();
  controller.abort();
  let reads = 0;
  const blob = imageBlob();
  const originalArrayBuffer = blob.arrayBuffer.bind(blob);
  blob.arrayBuffer = (...args) => { reads++; return originalArrayBuffer(...args); };
  await assert.rejects(decodeHeifImage(blob, { signal: controller.signal }), { message: 'HEIF_CANCELLED' });
  assert.equal(reads, 0);
  assert.equal(workers.length, 0);
}));

test('cancellation after full input read settles before worker creation', async () => withWorker(async workers => {
  const controller = new AbortController();
  let resolveRead;
  let readStarted;
  const started = new Promise(resolve => { readStarted = resolve; });
  const blob = imageBlob();
  blob.arrayBuffer = () => { readStarted(); return new Promise(resolve => { resolveRead = resolve; }); };
  const pending = decodeHeifImage(blob, { signal: controller.signal });
  await started;
  controller.abort();
  resolveRead(new Uint8Array(header()).buffer);
  await assert.rejects(pending, { message: 'HEIF_CANCELLED' });
  assert.equal(workers.length, 0);
}));

test('worker errors are sanitized, settled once, and terminate the worker', async () => withWorker(async workers => {
  const pending = decodeHeifImage(imageBlob());
  const worker = await waitForWorker(workers);
  worker.send({ error: 'https://secret.invalid/HEIF_DECODE_FAILED' });
  await assert.rejects(pending, { message: 'HEIF_DECODE_FAILED' });
  assert.equal(worker.terminated, true);
}));

test('wall timeout rejects and terminates the worker', async () => withWorker(async workers => {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  let fireTimeout;
  let timeoutDelay;
  globalThis.setTimeout = (callback, delay) => { fireTimeout = callback; timeoutDelay = delay; return 1; };
  globalThis.clearTimeout = () => {};
  try {
    const pending = decodeHeifImage(imageBlob());
    const worker = await waitForWorker(workers);
    assert.equal(timeoutDelay, HEIF_LIMITS.timeoutMs);
    fireTimeout();
    await assert.rejects(pending, { message: 'HEIF_TIMEOUT' });
    assert.equal(worker.terminated, true);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
  }
}));

test('input byte limit is enforced before reading', async () => withWorker(async workers => {
  class LargeBlob extends Blob { get size() { return HEIF_LIMITS.inputBytes + 1; } }
  const blob = new LargeBlob([]);
  let reads = 0;
  blob.slice = () => { reads++; return new Blob([]); };
  await assert.rejects(decodeHeifImage(blob), { message: 'HEIF_INPUT_LIMIT' });
  assert.equal(reads, 0);
  assert.equal(workers.length, 0);
}));
