import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  RangeComparatorError,
  compareFrontMidTail,
  createFrontMidTailRanges,
  createIdentityBoundReader
} from './range-comparator.mjs';

const identity = Object.freeze({
  accountKey: 'fixture-account', fileId: 'fixture-file', fileVersion: 'fixture-version-7', size: 30
});
const bytes = Uint8Array.from({ length: identity.size }, (_, index) => index + 1);

function clock() {
  let value = 0;
  return () => ++value;
}

function responseFor(rangeHeader, source = bytes, { status = 206, contentRange, contentLength } = {}) {
  const match = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader);
  const start = Number(match[1]);
  const end = Number(match[2]);
  const body = status === 206 ? source.slice(start, end + 1) : new Uint8Array();
  const headers = new Headers();
  if (status === 206) headers.set('Content-Range', contentRange ?? `bytes ${start}-${end}/${identity.size}`);
  if (contentLength !== false) headers.set('Content-Length', String(contentLength ?? body.byteLength));
  return new Response(body, { status, headers });
}

function reader(source = bytes, responseOptions = {}) {
  return async ({ range }) => ({
    identity,
    response: responseFor(range.header, source, responseOptions)
  });
}

function run(overrides = {}) {
  return compareFrontMidTail({
    identity,
    sampleBytes: 4,
    currentSwReader: reader(),
    independentApiReader: reader(),
    cryptoProvider: webcrypto,
    now: clock(),
    versions: { app: '1.21.0', build: 'fixture-build', worker: '1.21.0' },
    ...overrides
  });
}

test('front/mid/tail intervals are deterministic inclusive ranges', () => {
  assert.deepEqual(createFrontMidTailRanges(30, 4).map(({ label, header }) => ({ label, header })), [
    { label: 'front', header: 'bytes=0-3' },
    { label: 'mid', header: 'bytes=13-16' },
    { label: 'tail', header: 'bytes=26-29' }
  ]);
});

test('equal current-SW and independent API bytes record status, range, lengths, timing, digests and versions', async () => {
  const report = await run();
  assert.equal(report.summary.allEqual, true);
  assert.deepEqual(report.summary, { equalCount: 3, mismatchCount: 0, inconclusiveCount: 0, allEqual: true });
  assert.deepEqual(report.versions, { tool: 'v2-03a.4', app: '1.21.0', build: 'fixture-build', worker: '1.21.0' });
  assert.equal(report.identity.validated, true);
  for (const entry of report.ranges) {
    assert.equal(entry.currentSw.status, 206);
    assert.equal(entry.currentSw.range.valid, true);
    assert.equal(entry.currentSw.receivedLength, 4);
    assert.equal(entry.currentSw.digest.length, 64);
    assert.equal(entry.equality.bytesEqual, true);
    assert.equal(typeof entry.currentSw.timingsMs.headers, 'number');
    assert.equal(typeof entry.currentSw.timingsMs.firstByte, 'number');
    assert.equal(typeof entry.currentSw.timingsMs.total, 'number');
  }
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /fixture-account|fixture-file|fixture-version/);
  assert.doesNotMatch(serialized, /googleapis|Bearer|https?:\/\//i);
});

test('one changed middle byte is reported as a byte mismatch', async () => {
  const changed = bytes.slice();
  changed[14] ^= 0xff;
  const report = await run({ independentApiReader: reader(changed) });
  assert.deepEqual(report.ranges.map((entry) => entry.equality.bytesEqual), [true, false, true]);
  assert.deepEqual(report.summary, { equalCount: 2, mismatchCount: 1, inconclusiveCount: 0, allEqual: false });
});

test('non-206 status is recorded without sampling or pretending it is a range response', async () => {
  const report = await run({ independentApiReader: reader(bytes, { status: 416, contentLength: 0 }) });
  for (const entry of report.ranges) {
    assert.equal(entry.independentApi.status, 416);
    assert.equal(entry.independentApi.digest, null);
    assert.equal(entry.independentApi.receivedLength, 0);
    assert.equal(entry.independentApi.range.valid, false);
    assert.equal(entry.equality.bytesEqual, null);
  }
  assert.equal(report.summary.inconclusiveCount, 3);
});

test('wrong Content-Range and declared length fail closed even when body bytes match', async () => {
  const report = await run({
    independentApiReader: reader(bytes, { contentRange: 'bytes 1-4/30', contentLength: 9 })
  });
  for (const entry of report.ranges) {
    assert.equal(entry.independentApi.range.valid, false);
    assert.deepEqual(entry.independentApi.range.reasons, ['content-range-mismatch', 'content-length-mismatch']);
    assert.equal(entry.equality.comparable, false);
    assert.equal(entry.equality.bytesEqual, null);
  }
});

test('CORS-hidden Content-Range remains explicitly opaque but digest-comparable', async () => {
  const corsHiddenReader = async ({ range }) => {
    const response = responseFor(range.header);
    response.headers.delete('Content-Range');
    return { identity, response };
  };
  const report = await run({ independentApiReader: corsHiddenReader });
  for (const entry of report.ranges) {
    assert.equal(entry.currentSw.range.verdict, 'exact');
    assert.equal(entry.independentApi.range.valid, null);
    assert.equal(entry.independentApi.range.acceptable, true);
    assert.equal(entry.independentApi.range.verdict, 'opaque');
    assert.deepEqual(entry.independentApi.range.reasons, ['content-range-not-exposed']);
    assert.equal(entry.equality.bytesEqual, true);
  }
  assert.equal(report.summary.allEqual, true);
});

test('a visible malformed Content-Range is invalid rather than CORS-opaque', async () => {
  const report = await run({ independentApiReader: reader(bytes, { contentRange: 'not-a-byte-range' }) });
  for (const entry of report.ranges) {
    assert.equal(entry.independentApi.range.valid, false);
    assert.equal(entry.independentApi.range.acceptable, false);
    assert.equal(entry.independentApi.range.verdict, 'invalid');
    assert.deepEqual(entry.independentApi.range.reasons, ['invalid-content-range']);
    assert.equal(entry.equality.bytesEqual, null);
  }
});

test('private identity validators are checked before and after without entering output', async () => {
  const fullIdentity = {
    ...identity,
    contentRevision: 'private-revision',
    checksum: 'private-checksum',
    modifiedTime: 'private-modified-time'
  };
  const phases = [];
  const report = await run({
    identity: fullIdentity,
    currentSwReader: async ({ range }) => ({ identity: fullIdentity, response: responseFor(range.header) }),
    independentApiReader: async ({ range }) => ({ identity: fullIdentity, response: responseFor(range.header) }),
    verifyIdentity: ({ phase }) => { phases.push(phase); return fullIdentity; }
  });
  assert.deepEqual(phases, ['before', 'after']);
  assert.equal(report.identity.stable, true);
  assert.deepEqual(report.identity.checked, [
    'accountKey', 'fileId', 'fileVersion', 'size', 'contentRevision', 'checksum', 'modifiedTime'
  ]);
  assert.doesNotMatch(JSON.stringify(report), /private-revision|private-checksum|private-modified-time/);
});

test('abort during the initial overall identity verifier rejects promptly and starts no reader', async () => {
  const controller = new AbortController();
  let readerCalls = 0;
  let verifierStarted;
  let releaseVerifier;
  const started = new Promise((resolve) => { verifierStarted = resolve; });
  const pending = new Promise((resolve) => { releaseVerifier = resolve; });
  const comparison = run({
    currentSwReader: async (request) => { readerCalls += 1; return reader()(request); },
    independentApiReader: async (request) => { readerCalls += 1; return reader()(request); },
    verifyIdentity: ({ phase, signal }) => {
      assert.equal(phase, 'before');
      assert.equal(signal, controller.signal);
      verifierStarted();
      return pending;
    },
    signal: controller.signal
  });
  await started;
  controller.abort();
  await Promise.race([
    assert.rejects(comparison, { name: 'AbortError' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('initial verifier abort did not reject promptly')), 100))
  ]);
  assert.equal(readerCalls, 0);
  releaseVerifier(identity);
});

test('abort during the final overall identity verifier rejects promptly after all readers finish', async () => {
  const controller = new AbortController();
  let readerCalls = 0;
  let finalVerifierStarted;
  let releaseVerifier;
  const finalStarted = new Promise((resolve) => { finalVerifierStarted = resolve; });
  const pending = new Promise((resolve) => { releaseVerifier = resolve; });
  const countedReader = async (request) => { readerCalls += 1; return reader()(request); };
  const comparison = run({
    currentSwReader: countedReader,
    independentApiReader: countedReader,
    verifyIdentity: ({ phase, signal }) => {
      assert.equal(signal, controller.signal);
      if (phase === 'before') return identity;
      finalVerifierStarted();
      return pending;
    },
    signal: controller.signal
  });
  await finalStarted;
  assert.equal(readerCalls, 6);
  controller.abort();
  await Promise.race([
    assert.rejects(comparison, { name: 'AbortError' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('final verifier abort did not reject promptly')), 100))
  ]);
  assert.equal(readerCalls, 6);
  releaseVerifier(identity);
});

test('a reader version change rejects the entire comparison without disclosing either identity', async () => {
  let bodyCancelled = false;
  const changedIdentityReader = async () => ({
    identity: { ...identity, fileVersion: 'different-private-version' },
    response: new Response(new ReadableStream({
      cancel() { bodyCancelled = true; }
    }), { status: 206, headers: { 'Content-Range': 'bytes 0-3/30', 'Content-Length': '4' } })
  });
  await assert.rejects(
    run({ independentApiReader: changedIdentityReader }),
    (error) => error instanceof RangeComparatorError
      && error.code === 'IDENTITY_MISMATCH'
      && !/fixture-version|different-private-version/.test(error.message)
  );
  assert.equal(bodyCancelled, true);
});

test('abort after a raw reader returns cancels its open body and starts no later reader', async () => {
  const controller = new AbortController();
  let bodyCancelled = false;
  let independentCalls = 0;
  const rawReader = async () => {
    const response = new Response(new ReadableStream({
      cancel() { bodyCancelled = true; }
    }), { status: 206, headers: { 'Content-Range': 'bytes 0-3/30', 'Content-Length': '4' } });
    controller.abort();
    return { identity, response };
  };
  await assert.rejects(
    run({
      currentSwReader: rawReader,
      independentApiReader: async (request) => { independentCalls += 1; return reader()(request); },
      signal: controller.signal
    }),
    { name: 'AbortError' }
  );
  assert.equal(bodyCancelled, true);
  assert.equal(independentCalls, 0);
});

test('identity-bound readers detect a selected-file change before returning bytes', async () => {
  let current = identity;
  let bodyCancelled = false;
  const bound = createIdentityBoundReader({
    getIdentity: () => current,
    fetchRange: () => {
      current = { ...identity, fileId: 'replacement-private-file' };
      return new Response(new ReadableStream({
        cancel() { bodyCancelled = true; }
      }), { status: 206, headers: { 'Content-Range': 'bytes 0-3/30', 'Content-Length': '4' } });
    }
  });
  await assert.rejects(
    run({ currentSwReader: bound }),
    (error) => error.code === 'IDENTITY_MISMATCH' && !/replacement-private-file/.test(error.message)
  );
  assert.equal(bodyCancelled, true);
});

test('cancellation aborts a pending body and prevents later range reads', async () => {
  const controller = new AbortController();
  let independentCalls = 0;
  const currentSwReader = async () => ({
    identity,
    response: new Response(new ReadableStream({
      start(streamController) {
        streamController.enqueue(Uint8Array.of(1));
        queueMicrotask(() => controller.abort());
      },
      cancel() {}
    }), { status: 206, headers: { 'Content-Range': 'bytes 0-3/30', 'Content-Length': '4' } })
  });
  await assert.rejects(
    run({
      currentSwReader,
      independentApiReader: async (request) => { independentCalls += 1; return reader()(request); },
      signal: controller.signal
    }),
    { name: 'AbortError' }
  );
  assert.equal(independentCalls, 0);
});

test('abort during post-fetch identity verification rejects promptly, cancels the body and skips later readers', async () => {
  const controller = new AbortController();
  let bodyCancelled = false;
  let independentCalls = 0;
  let releasePostIdentity;
  let postIdentityStarted;
  const postStarted = new Promise((resolve) => { postIdentityStarted = resolve; });
  const neverUntilReleased = new Promise((resolve) => { releasePostIdentity = resolve; });
  const bound = createIdentityBoundReader({
    getIdentity: ({ phase, signal }) => {
      assert.equal(signal, controller.signal);
      if (phase === 'before-fetch') return identity;
      postIdentityStarted();
      return neverUntilReleased;
    },
    fetchRange: () => new Response(new ReadableStream({
      cancel() { bodyCancelled = true; }
    }), { status: 206, headers: { 'Content-Range': 'bytes 0-3/30', 'Content-Length': '4' } })
  });
  const comparison = run({
    currentSwReader: bound,
    independentApiReader: async (request) => { independentCalls += 1; return reader()(request); },
    signal: controller.signal
  });
  await postStarted;
  controller.abort();
  await Promise.race([
    assert.rejects(comparison, { name: 'AbortError' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('abort did not reject promptly')), 100))
  ]);
  assert.equal(bodyCancelled, true);
  assert.equal(independentCalls, 0);
  releasePostIdentity(identity);
});

test('reader failures are reduced to a fixed code so URLs, IDs and tokens cannot enter a report', async () => {
  const privateFailure = async () => {
    throw new Error('Bearer private-token failed at https://example.test/files/private-file-id');
  };
  const report = await run({ independentApiReader: privateFailure });
  assert.equal(report.ranges[0].independentApi.error.code, 'READER_FAILURE');
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /private-token|example\.test|private-file-id|Bearer/);
});
