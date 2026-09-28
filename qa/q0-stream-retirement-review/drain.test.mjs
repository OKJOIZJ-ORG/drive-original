import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const {openNativeFence} = process.env.Q0_CLASSIC_TEST === '1'
  ? vm.runInNewContext(readFileSync(new URL('./classic.expression.js',import.meta.url),'utf8'),
    {AbortController,Response,ReadableStream,Uint8Array,setTimeout,clearTimeout})
  : await import(process.env.Q0_REVIEW_BASELINE === '1'
    ? '../q0-version-fence-stream/owner.mjs' : './owner.mjs');

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return {promise, resolve};
};

function fixture({holdReopen = false} = {}) {
  const rangeStarted = deferred(), reopening = deferred();
  let opens = 0, activeCallbacks = 0, ranges = 0;
  const stopped = signal => new Promise((_, reject) => {
    activeCallbacks++;
    const abort = () => {
      signal.removeEventListener('abort', abort);
      activeCallbacks--;
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, {once: true});
  });
  const options = {
    fileId: 'fixture', accountKey: 'account', accountGeneration: 1,
    chunkBytes: 8, requestTimeoutMs: 100, isCurrent: () => true,
    async readMetadata({phase, signal}) {
      if (phase === 'open') {
        opens++;
        if (holdReopen && opens === 2) {
          reopening.resolve();
          await stopped(signal);
        }
      }
      return {id: 'fixture', size: '24', mimeType: 'video/mp4',
        modifiedTime: 'fixed', headRevisionId: 'A', version: '1',
        capabilities: {canDownload: true}, trashed: false};
    },
    async readRange({signal}) {
      ranges++;
      rangeStarted.resolve();
      await stopped(signal);
    }
  };
  return {options, rangeStarted, reopening,
    callbacks: () => activeCallbacks, ranges: () => ranges};
}

test('settled close means both source callbacks and active/queued native consumers have drained', async () => {
  const f = fixture(), owner = await openNativeFence(f.options);
  const a = owner.response().body.getReader();
  const b = owner.response({range: 'bytes=16-23'}).body.getReader();
  const ar = a.read().catch(() => {});
  await f.rangeStarted.promise;
  const br = b.read().catch(() => {});
  const closed = await owner.close();
  const observed = {cleanup: closed, stats: owner.stats(), callbacks: f.callbacks()};
  console.log(JSON.stringify({scenario: 'active-and-queued-close', observed}));
  await Promise.all([ar, br]);
  assert.equal(closed.settled, true);
  assert.equal(observed.callbacks, 0);
  assert.equal(observed.stats.pendingReads, 0,
    'A replacement must not start while a cancelled native consumer pull remains pending');
  assert.equal(observed.stats.activeResponses, 0);
  if(process.env.Q0_REVIEW_BASELINE !== '1') assert.equal(observed.stats.source.busy, false);
  assert.equal(f.ranges(), 1);
});

test('settled close during a responsive reopening also drains the queued pull owner', async () => {
  const f = fixture({holdReopen: true}), owner = await openNativeFence(f.options);
  const a = owner.response().body.getReader();
  const b = owner.response({range: 'bytes=16-23'}).body.getReader();
  const ar = a.read();
  await f.rangeStarted.promise;
  const br = b.read().catch(() => {});
  await a.cancel();
  await ar;
  await f.reopening.promise;
  const closed = await owner.close();
  const observed = {cleanup: closed, stats: owner.stats(), callbacks: f.callbacks()};
  console.log(JSON.stringify({scenario: 'reopening-close', observed}));
  await br;
  assert.equal(closed.settled, true);
  assert.equal(observed.callbacks, 0);
  assert.equal(observed.stats.pendingReads, 0,
    'Opening callback completion alone must not admit a replacement before consumer drain');
  assert.equal(observed.stats.activeResponses, 0);
});

test('an uncancellable upstream callback stays a sticky failed replacement barrier', async () => {
  const gate = deferred(), started = deferred();
  const f = fixture();
  f.options.requestTimeoutMs = 20;
  f.options.readRange = async () => { started.resolve(); await gate.promise; };
  const owner = await openNativeFence(f.options);
  const reader = owner.response().body.getReader();
  const reading = reader.read().catch(() => {});
  await started.promise;
  const first = owner.close(), second = owner.close();
  const closed = await first;
  assert.equal(await second, closed, 'All replacement callers share the same sticky drain outcome');
  assert.equal(closed.settled, false);
  assert.ok(closed.pendingCallbacks > 0);
  assert.throws(() => owner.response());
  gate.resolve();
  await reading;
  await new Promise(r => setTimeout(r, 5));
  assert.equal((await owner.close()).settled, false,
    'Later callback completion must not retroactively authorize a replacement');
});

test('external lease abort followed by close drains active and queued consumers', async () => {
  const f = fixture(), signal = new AbortController();
  const owner = await openNativeFence({...f.options, signal: signal.signal});
  const ar = owner.response().body.getReader().read().catch(() => {});
  await f.rangeStarted.promise;
  const br = owner.response().body.getReader().read().catch(() => {});
  signal.abort();
  const closed = await owner.close();
  assert.equal(closed.settled, true);
  assert.equal(owner.stats().pendingReads, 0);
  assert.equal(f.callbacks(), 0);
  await Promise.all([ar, br]);
});
