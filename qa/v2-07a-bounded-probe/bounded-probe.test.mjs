import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BoundedProbeError,
  DEFAULT_LIMITS,
  FAILURE_CODES,
  normalizeProbeIdentity,
  planExactRange,
  planInitialMagicRange,
  runBoundedProbe,
  runBoundedProbeBatch,
  sniffMagic
} from './bounded-probe.mjs';

const encoder = new TextEncoder();
const identity = Object.freeze({
  accountKey: 'private-account-sentinel',
  fileId: 'private-file-sentinel',
  version: '17',
  size: '4096',
  modifiedTime: '2026-09-20T00:00:00.000Z',
  mimeType: 'application/private-metadata-sentinel',
  canDownload: true
});

function scheduler() {
  let nextId = 0;
  const tasks = new Map();
  const cleared = [];
  return {
    setTimeoutFn(callback, delay) {
      const id = ++nextId;
      tasks.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) {
      const task = tasks.get(id);
      if (task) cleared.push(task);
      tasks.delete(id);
    },
    fire(delay) {
      const matches = [...tasks.entries()].filter(([, task]) => task.delay === delay);
      for (const [id, task] of matches) {
        tasks.delete(id);
        task.callback();
      }
      return matches.length;
    },
    fireCleared() {
      const snapshot = cleared.splice(0);
      snapshot.forEach((task) => task.callback());
      return snapshot.length;
    }
  };
}

function exactResponse(request, bytes, overrides = {}) {
  const headers = new Headers({
    'Content-Range': `bytes ${request.start}-${request.end}/${request.identity.size}`,
    'Content-Length': String(bytes.byteLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store, no-transform'
  });
  for (const [name, value] of Object.entries(overrides.headers || {})) {
    if (value == null) headers.delete(name);
    else headers.set(name, value);
  }
  return {
    status: overrides.status ?? 206,
    headers,
    body: overrides.body ?? bytes,
    ...(overrides.bytes ? { bytes: overrides.bytes } : {})
  };
}

function fixtureBytes(start, end) {
  return Uint8Array.from(
    { length: end - start + 1 },
    (_, index) => (start + index) % 251
  );
}

function baseRun(overrides = {}) {
  return runBoundedProbe({
    expectedIdentity: identity,
    getIdentity: async () => identity,
    readRange: async (request) => exactResponse(
      request,
      fixtureBytes(request.start, request.end)
    ),
    probe: async ({ read }) => ({ length: (await read({ start: 0n, end: 7n })).byteLength }),
    generation: 3,
    isGenerationCurrent: (generation) => generation === 3,
    ...overrides
  });
}

function assertFailure(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, code);
  assert.equal(result.evidence, null);
  assert.equal(FAILURE_CODES.includes(code), true);
}

test('normalizes every exact identity fence without converting large sizes to Number', () => {
  const normalized = normalizeProbeIdentity({ ...identity, size: '9007199254740993' });
  assert.equal(normalized.size, '9007199254740993');
  assert.deepEqual(Object.keys(normalized), [
    'accountKey', 'fileId', 'version', 'size', 'modifiedTime', 'mimeType', 'canDownload'
  ]);
  assert.throws(
    () => normalizeProbeIdentity({ ...identity, modifiedTime: '', canDownload: undefined }),
    (error) => error instanceof BoundedProbeError && error.code === 'INVALID_IDENTITY'
  );
});

test('plans exact inclusive BigInt ranges and never emits open or suffix syntax', () => {
  assert.deepEqual(DEFAULT_LIMITS, {
    requestBytes: 1 * 1024 * 1024,
    fileBytes: 16 * 1024 * 1024,
    fileRequests: 64,
    batchBytes: 512 * 1024 * 1024,
    headersMs: 10_000,
    bodyNoProgressMs: 15_000,
    fileMs: 60_000
  });
  const range = planExactRange(4_294_967_296n, 4_294_967_303n, '9007199254740993');
  assert.deepEqual(range, {
    start: 4_294_967_296n,
    end: 4_294_967_303n,
    length: 8,
    header: 'bytes=4294967296-4294967303'
  });
  assert.doesNotMatch(range.header, /bytes=-|bytes=\d+-$/);
  assert.deepEqual(planInitialMagicRange('3', 4096), {
    start: 0n, end: 2n, length: 3, header: 'bytes=0-2'
  });
});

test('rejects negative, reversed, unsafe, out-of-file and over-1MiB plans', () => {
  const invalid = [
    () => planExactRange(-1, 1, 10),
    () => planExactRange(2, 1, 10),
    () => planExactRange(0, Number.MAX_SAFE_INTEGER + 1, '9007199254740993'),
    () => planExactRange(0, 10, 10)
  ];
  for (const attempt of invalid) {
    assert.throws(attempt, (error) => error.code === 'INVALID_RANGE');
  }
  assert.throws(
    () => planExactRange(0, DEFAULT_LIMITS.requestBytes, '9007199254740993'),
    (error) => error.code === 'REQUEST_BYTE_LIMIT'
  );
});

test('invalid or unsafe endpoints fail before the injected reader is called', async () => {
  let reads = 0;
  const result = await baseRun({
    readRange: async () => { reads += 1; throw new Error('must not read'); },
    probe: async ({ read }) => read({ start: 0n, end: BigInt(Number.MAX_SAFE_INTEGER) + 1n })
  });
  assertFailure(result, 'INVALID_RANGE');
  assert.equal(reads, 0);
});

test('preflight account or file metadata mismatch prevents every body read', async () => {
  for (const changed of [
    { accountKey: 'other' }, { fileId: 'other' }, { version: '18' }, { size: '4095' },
    { modifiedTime: 'later' }, { mimeType: 'video/mp4' }, { canDownload: false }
  ]) {
    let reads = 0;
    const result = await baseRun({
      getIdentity: async () => ({ ...identity, ...changed }),
      readRange: async () => { reads += 1; throw new Error('must not read'); }
    });
    assertFailure(result, 'IDENTITY_MISMATCH');
    assert.equal(reads, 0);
  }
});

test('a stable but non-downloadable identity fails before reader invocation', async () => {
  const blocked = { ...identity, canDownload: false };
  let reads = 0;
  const result = await baseRun({
    expectedIdentity: blocked,
    getIdentity: async () => blocked,
    readRange: async () => { reads += 1; }
  });
  assertFailure(result, 'DOWNLOAD_FORBIDDEN');
  assert.equal(reads, 0);
});

test('accepts only an exact 206 and returns page-private parser evidence', async () => {
  const result = await baseRun({
    probe: async ({ read, sniffMagic }) => {
      const bytes = await read({ start: 0, end: 11 });
      bytes.set(encoder.encode('ftyp'), 4);
      return { format: sniffMagic(bytes) };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.evidence.format.kind, 'iso-bmff');
  assert.deepEqual(result.metrics, {
    requests: 1, receivedBytes: 12, uniqueBytes: 12, cacheHits: 0, dedupedReads: 0
  });
  assert.equal(result.identity.preflight, true);
  assert.equal(result.identity.postflight, true);
});

test('rejects 200 and cancels the unexpected response body', async () => {
  let cancelled = 0;
  const result = await baseRun({
    readRange: async (request) => exactResponse(request, new Uint8Array(8), {
      status: 200,
      body: { cancel: async () => { cancelled += 1; } }
    })
  });
  assertFailure(result, 'STATUS_NOT_206');
  assert.equal(cancelled, 1);
  assert.equal(result.metrics.receivedBytes, 0);
});

test('rejects mismatched or wildcard Content-Range before consuming the body', async () => {
  for (const contentRange of ['bytes 1-8/4096', 'bytes 0-7/*', 'bytes 0-7/4095']) {
    let cancelled = 0;
    const result = await baseRun({
      readRange: async (request) => exactResponse(request, new Uint8Array(8), {
        headers: { 'Content-Range': contentRange },
        body: { cancel: async () => { cancelled += 1; } }
      })
    });
    assertFailure(result, 'CONTENT_RANGE_INVALID');
    assert.equal(cancelled, 1);
  }
});

test('requires a present safe exact Content-Length', async () => {
  for (const contentLength of [null, '7', '9007199254740992', 'not-a-number']) {
    const result = await baseRun({
      readRange: async (request) => exactResponse(request, new Uint8Array(8), {
        headers: { 'Content-Length': contentLength }
      })
    });
    assertFailure(result, 'CONTENT_LENGTH_INVALID');
  }
});

test('requires byte-range and no-store response ownership headers', async () => {
  for (const [headers, code] of [
    [{ 'Accept-Ranges': null }, 'ACCEPT_RANGES_INVALID'],
    [{ 'Accept-Ranges': 'none' }, 'ACCEPT_RANGES_INVALID'],
    [{ 'Cache-Control': null }, 'CACHE_CONTROL_INVALID'],
    [{ 'Cache-Control': 'private, max-age=60' }, 'CACHE_CONTROL_INVALID']
  ]) {
    const result = await baseRun({
      readRange: async (request) => exactResponse(request, new Uint8Array(8), { headers })
    });
    assertFailure(result, code);
  }
});

test('counts received bytes while rejecting short and oversized bodies', async () => {
  for (const [body, expectedReceived] of [
    [new Uint8Array(7), 7],
    [new Uint8Array(9), 0]
  ]) {
    const result = await baseRun({
      readRange: async (request) => exactResponse(request, body, {
        headers: { 'Content-Length': '8' }
      })
    });
    assertFailure(result, 'BODY_LENGTH_MISMATCH');
    assert.equal(result.metrics.receivedBytes, expectedReceived);
    assert.equal(result.metrics.uniqueBytes, 0);
  }
});

test('supports a streaming body and rejects a stream overrun immediately', async () => {
  let cancelled = 0;
  let released = 0;
  const body = {
    getReader() {
      const chunks = [new Uint8Array(5), new Uint8Array(4)];
      return {
        read: async () => chunks.length ? { done: false, value: chunks.shift() } : { done: true },
        cancel: async () => { cancelled += 1; },
        releaseLock: () => { released += 1; }
      };
    },
    cancel: async () => { cancelled += 1; }
  };
  const result = await baseRun({
    readRange: async (request) => exactResponse(request, new Uint8Array(8), { body })
  });
  assertFailure(result, 'BODY_LENGTH_MISMATCH');
  assert.equal(result.metrics.receivedBytes, 5);
  assert.equal(cancelled >= 1, true);
  assert.equal(released, 1);
});

test('releases a successful stream reader lock exactly once', async () => {
  let released = 0;
  const body = {
    getReader: () => {
      const chunks = [new Uint8Array(3), new Uint8Array(5)];
      return {
        read: async () => chunks.length ? { done: false, value: chunks.shift() } : { done: true },
        cancel: async () => {},
        releaseLock: () => { released += 1; }
      };
    }
  };
  const result = await baseRun({
    readRange: async (request) => exactResponse(request, new Uint8Array(8), { body })
  });
  assert.equal(result.ok, true);
  assert.equal(released, 1);
});

test('postflight identity drift discards parsed and successful-body evidence', async () => {
  let checks = 0;
  const result = await baseRun({
    getIdentity: async () => (++checks === 1 ? identity : { ...identity, modifiedTime: 'later' }),
    probe: async ({ read }) => {
      await read({ start: 0, end: 7 });
      return { parsedSuccess: true, privateBodyEvidence: 'must-disappear' };
    }
  });
  assertFailure(result, 'POSTFLIGHT_DRIFT');
  assert.equal(result.identity.preflight, true);
  assert.equal(result.identity.postflight, false);
  assert.equal(result.metrics.receivedBytes, 8);
  assert.equal(result.metrics.uniqueBytes, 0);
  assert.doesNotMatch(JSON.stringify(result), /must-disappear|parsedSuccess/);
});

test('memory cache and in-flight dedupe issue one exact network read', async () => {
  let release;
  let calls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const resultPromise = baseRun({
    readRange: async (request) => {
      calls += 1;
      await gate;
      return exactResponse(request, new Uint8Array(8));
    },
    probe: async ({ read }) => {
      const first = read({ start: 0, end: 7 });
      const second = read({ start: 0, end: 7 });
      release();
      await Promise.all([first, second]);
      await read({ start: 0, end: 7 });
      return { done: true };
    }
  });
  const result = await resultPromise;
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.deepEqual(result.metrics, {
    requests: 1, receivedBytes: 8, uniqueBytes: 8, cacheHits: 1, dedupedReads: 1
  });
});

test('different requested ranges are queued with concurrency exactly one', async () => {
  let active = 0;
  let maximum = 0;
  const result = await baseRun({
    readRange: async (request) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return exactResponse(request, fixtureBytes(request.start, request.end));
    },
    probe: async ({ read }) => {
      await Promise.all([
        read({ start: 0, end: 7 }),
        read({ start: 8, end: 15 })
      ]);
      return { done: true };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(maximum, 1);
  assert.equal(result.metrics.requests, 2);
});

test('tracks received bytes separately from unioned unique byte coverage', async () => {
  const result = await baseRun({
    probe: async ({ read }) => {
      await read({ start: 0, end: 7 });
      await read({ start: 4, end: 11 });
      return { done: true };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.metrics.receivedBytes, 16);
  assert.equal(result.metrics.uniqueBytes, 12);
});

test('enforces per-file request and received-byte budgets before the next reader call', async () => {
  let calls = 0;
  const requestLimited = await baseRun({
    limits: { fileRequests: 1 },
    readRange: async (request) => {
      calls += 1;
      return exactResponse(request, fixtureBytes(request.start, request.end));
    },
    probe: async ({ read }) => {
      await read({ start: 0, end: 1 });
      await read({ start: 2, end: 3 });
    }
  });
  assertFailure(requestLimited, 'FILE_REQUEST_LIMIT');
  assert.equal(calls, 1);

  calls = 0;
  const byteLimited = await baseRun({
    limits: { fileBytes: 4 },
    readRange: async (request) => {
      calls += 1;
      return exactResponse(request, fixtureBytes(request.start, request.end));
    },
    probe: async ({ read }) => {
      await read({ start: 0, end: 2 });
      await read({ start: 3, end: 5 });
    }
  });
  assertFailure(byteLimited, 'FILE_BYTE_LIMIT');
  assert.equal(calls, 1);
});

test('an oversized body cannot advance request, file, or batch ledgers past their hard ceilings', async () => {
  const result = await baseRun({
    limits: { fileBytes: 8, batchBytes: 8 },
    readRange: async (request) => exactResponse(request, new Uint8Array(100), {
      headers: { 'Content-Length': '8' }
    })
  });
  assertFailure(result, 'BODY_LENGTH_MISMATCH');
  assert.equal(result.metrics.receivedBytes, 0);
});

test('batch runner is serial and stops new reads at its shared byte budget', async () => {
  let active = 0;
  let maximum = 0;
  const representatives = [identity, { ...identity, fileId: 'second-private-file' }];
  const result = await runBoundedProbeBatch({
    representatives,
    getIdentity: async ({ expectedIdentity }) => expectedIdentity,
    readRange: async (request) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return exactResponse(request, new Uint8Array(3));
    },
    probe: async ({ read }) => { await read({ start: 0, end: 2 }); return { done: true }; },
    limits: { batchBytes: 4 }
  });
  assert.equal(result.concurrency, 1);
  assert.equal(maximum, 1);
  assert.equal(result.receivedBytes, 3);
  assert.equal(result.results[0].ok, true);
  assertFailure(result.results[1], 'BATCH_BYTE_LIMIT');
});

test('header timeout aborts the injected reader with a fixed redacted code', async () => {
  const timers = scheduler();
  let observedSignal;
  const pending = baseRun({
    readRange: async ({ signal }) => {
      observedSignal = signal;
      return new Promise(() => {});
    },
    limits: { headersMs: 10 },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.fire(10), 1);
  const result = await pending;
  assertFailure(result, 'HEADER_TIMEOUT');
  assert.equal(observedSignal.aborted, true);
});

test('body no-progress timeout cancels a stalled stream', async () => {
  const timers = scheduler();
  let cancelled = 0;
  const body = {
    getReader: () => ({
      read: async () => new Promise(() => {}),
      cancel: async () => { cancelled += 1; }
    }),
    cancel: async () => { cancelled += 1; }
  };
  const pending = baseRun({
    readRange: async (request) => exactResponse(request, new Uint8Array(8), { body }),
    limits: { bodyNoProgressMs: 15 },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.fire(15), 1);
  const result = await pending;
  assertFailure(result, 'BODY_TIMEOUT');
  assert.equal(cancelled >= 1, true);
});

test('a cleared stale body timer cannot terminate the current read epoch', async () => {
  const timers = scheduler();
  let releaseSecond;
  const second = new Promise((resolve) => { releaseSecond = resolve; });
  let step = 0;
  const body = {
    getReader: () => ({
      read: async () => {
        step += 1;
        if (step === 1) return { done: false, value: new Uint8Array(4) };
        if (step === 2) return second;
        return { done: true };
      },
      cancel: async () => {},
      releaseLock: () => {}
    })
  };
  const pending = baseRun({
    readRange: async (request) => exactResponse(request, new Uint8Array(8), { body }),
    limits: { bodyNoProgressMs: 15 },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn
  });
  for (let index = 0; index < 10 && step < 2; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(step, 2);
  assert.equal(timers.fireCleared() >= 1, true);
  releaseSecond({ done: false, value: new Uint8Array(4) });
  const result = await pending;
  assert.equal(result.ok, true);
});

test('file timeout and caller abort settle even when probe work ignores its signal', async () => {
  const timers = scheduler();
  const timed = baseRun({
    probe: async () => new Promise(() => {}),
    limits: { fileMs: 60 },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn
  });
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  assert.equal(timers.fire(60), 1);
  assertFailure(await timed, 'FILE_TIMEOUT');

  const controller = new AbortController();
  const aborted = baseRun({
    signal: controller.signal,
    probe: async () => new Promise(() => {})
  });
  controller.abort();
  assertFailure(await aborted, 'ABORTED');
});

test('generation ownership is checked before read publication and before postflight', async () => {
  let current = true;
  let checks = 0;
  const result = await baseRun({
    isGenerationCurrent: () => (++checks < 4 ? current : false),
    probe: async ({ read }) => {
      await read({ start: 0, end: 7 });
      current = false;
      return { staleEvidence: true };
    }
  });
  assertFailure(result, 'GENERATION_STALE');
  assert.doesNotMatch(JSON.stringify(result), /staleEvidence/);
});

test('reader exceptions never expose raw private messages', async () => {
  const result = await baseRun({
    readRange: async () => { throw new Error('PRIVATE_TOKEN_AND_URL_SENTINEL'); }
  });
  assertFailure(result, 'READER_FAILURE');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOKEN_AND_URL_SENTINEL/);
});

test('magic router recognizes required signatures without extension or MIME input', () => {
  const cases = [
    ['iso-bmff', Uint8Array.from([0, 0, 0, 16, ...encoder.encode('ftyp'), 0, 0, 0, 0])],
    ['mpeg-ts', Uint8Array.from({ length: 189 }, (_, index) => index === 0 || index === 188 ? 0x47 : 0)],
    ['ebml', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0])],
    ['webm', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, ...encoder.encode('webm')])],
    ['matroska', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, ...encoder.encode('matroska')])],
    ['avi', encoder.encode('RIFF....AVI ')],
    ['webp', encoder.encode('RIFF....WEBP')],
    ['bmp', Uint8Array.from([0x42, 0x4d, 0])],
    ['jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0])],
    ['png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['gif', encoder.encode('GIF89a')]
  ];
  for (const [kind, bytes] of cases) {
    const result = sniffMagic(bytes);
    assert.equal(result.kind, kind);
    assert.equal(result.source, 'magic-bytes');
    assert.equal(result.decodeClaimed, false);
    assert.equal(result.playbackClaimed, false);
  }
});

test('magic router distinguishes textual error payloads from unknown binary', () => {
  assert.equal(sniffMagic(encoder.encode('  <!DOCTYPE html><title>403</title>')).kind, 'error-payload');
  assert.equal(sniffMagic(encoder.encode('{"error":{"code":403}}')).kind, 'error-payload');
  assert.equal(sniffMagic(Uint8Array.from([1, 2, 3, 4, 5])).kind, 'unknown');
  assert.equal(sniffMagic(new Uint8Array()).kind, 'unknown');
});
