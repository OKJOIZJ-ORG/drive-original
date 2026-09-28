(()=>{const factory=(()=>{
'use strict';
const bounded=(()=>{
const MIB = 1024 * 1024;
const TOOL_VERSION = 'v2-07a-bounded-probe.2';
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const DEFAULT_LIMITS = Object.freeze({
  requestBytes: 1 * MIB,
  fileBytes: 16 * MIB,
  fileRequests: 64,
  batchBytes: 512 * MIB,
  headersMs: 10_000,
  bodyNoProgressMs: 15_000,
  fileMs: 60_000
});

const FAILURE_CODES = Object.freeze([
  'ABORTED',
  'ACCEPT_RANGES_INVALID',
  'BATCH_BYTE_LIMIT',
  'BODY_LENGTH_MISMATCH',
  'BODY_TIMEOUT',
  'BODY_UNAVAILABLE',
  'CACHE_CONTROL_INVALID',
  'CLEANUP_FAILED',
  'CLEANUP_TIMEOUT',
  'CONTENT_LENGTH_INVALID',
  'CONTENT_RANGE_INVALID',
  'DOWNLOAD_FORBIDDEN',
  'FILE_BYTE_LIMIT',
  'FILE_REQUEST_LIMIT',
  'FILE_TIMEOUT',
  'GENERATION_STALE',
  'HEADER_TIMEOUT',
  'IDENTITY_MISMATCH',
  'INVALID_IDENTITY',
  'INVALID_RANGE',
  'INVALID_READER_RESULT',
  'POSTFLIGHT_DRIFT',
  'POSTFLIGHT_FAILED',
  'PREFLIGHT_FAILED',
  'PROBE_FAILED',
  'READER_FAILURE',
  'REQUEST_BYTE_LIMIT',
  'STATUS_NOT_206'
]);

const FAILURE_CODE_SET = new Set(FAILURE_CODES);
const IDENTITY_FIELDS = Object.freeze([
  'accountKey', 'fileId', 'version', 'size', 'modifiedTime', 'mimeType', 'canDownload'
]);

class BoundedProbeError extends Error {
  constructor(code) {
    super(FAILURE_CODE_SET.has(code) ? code : 'PROBE_FAILED');
    this.name = 'BoundedProbeError';
    this.code = FAILURE_CODE_SET.has(code) ? code : 'PROBE_FAILED';
  }
}

function fail(code) {
  throw new BoundedProbeError(code);
}

function fixedCode(error, fallback) {
  return error instanceof BoundedProbeError ? error.code : fallback;
}

function requiredString(value) {
  const text = String(value ?? '');
  if (!text) fail('INVALID_IDENTITY');
  return text;
}

function exactIntegerText(value) {
  if (typeof value === 'bigint') {
    if (value < 0n) fail('INVALID_IDENTITY');
    return String(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_IDENTITY');
    return String(value);
  }
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) fail('INVALID_IDENTITY');
  return String(BigInt(text));
}

function normalizeProbeIdentity(value) {
  const identity = Object.freeze({
    accountKey: requiredString(value?.accountKey),
    fileId: requiredString(value?.fileId),
    version: exactIntegerText(value?.version),
    size: exactIntegerText(value?.size),
    modifiedTime: requiredString(value?.modifiedTime),
    mimeType: requiredString(value?.mimeType),
    canDownload: value?.canDownload
  });
  if (BigInt(identity.size) <= 0n || typeof identity.canDownload !== 'boolean') {
    fail('INVALID_IDENTITY');
  }
  return identity;
}

function sameIdentity(left, right) {
  return IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

function normalizeObservedIdentity(value) {
  try {
    return normalizeProbeIdentity(value);
  } catch {
    fail('IDENTITY_MISMATCH');
  }
}

function assertExpectedIdentity(expected, observed) {
  if (!sameIdentity(expected, normalizeObservedIdentity(observed))) {
    fail('IDENTITY_MISMATCH');
  }
}

function normalizeLimits(value = {}) {
  const limits = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_LIMITS)) {
    const candidate = value[key] ?? defaultValue;
    if (!Number.isSafeInteger(candidate) || candidate <= 0 || candidate > defaultValue) {
      fail('PROBE_FAILED');
    }
    limits[key] = candidate;
  }
  return Object.freeze(limits);
}

function abortReason(signal) {
  if (signal?.reason instanceof BoundedProbeError) return signal.reason;
  return new BoundedProbeError('ABORTED');
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

function linkAbort(source, target) {
  if (!source) return () => {};
  const onAbort = () => target.abort(abortReason(source));
  source.addEventListener('abort', onAbort, { once: true });
  if (source.aborted) onAbort();
  return () => source.removeEventListener('abort', onAbort);
}

function awaitWithSignal(value, signal) {
  throwIfAborted(signal);
  if (!signal) return Promise.resolve(value);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, result) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(result);
    };
    const onAbort = () => finish(reject, abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    Promise.resolve(value).then(
      (result) => finish(resolve, result),
      (error) => finish(reject, error)
    );
  });
}

async function cancelBody(result, reason) {
  const body = result?.body;
  try {
    await body?.cancel?.(reason);
  } catch {
    fail('CLEANUP_FAILED');
  }
}

function headerValue(headers, name) {
  if (headers?.get) return headers.get(name);
  if (!headers || typeof headers !== 'object') return null;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value == null ? null : String(value);
  }
  return null;
}

function parseDecimalBigInt(value) {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) ? BigInt(text) : null;
}

function normalizeEndpoint(value) {
  let parsed;
  if (typeof value === 'bigint') parsed = value;
  else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('INVALID_RANGE');
    parsed = BigInt(value);
  } else {
    const text = String(value ?? '').trim();
    if (!/^-?\d+$/.test(text)) fail('INVALID_RANGE');
    parsed = BigInt(text);
  }
  if (parsed < 0n || parsed > MAX_SAFE) fail('INVALID_RANGE');
  return parsed;
}

function planExactRange(startValue, endValue, sizeValue, requestLimit = DEFAULT_LIMITS.requestBytes) {
  const start = normalizeEndpoint(startValue);
  const end = normalizeEndpoint(endValue);
  let size;
  try {
    size = BigInt(exactIntegerText(sizeValue));
  } catch {
    fail('INVALID_RANGE');
  }
  if (size <= 0n || start > end || end >= size) fail('INVALID_RANGE');
  const length = end - start + 1n;
  if (length > BigInt(requestLimit)) fail('REQUEST_BYTE_LIMIT');
  return Object.freeze({
    start,
    end,
    length: Number(length),
    header: `bytes=${start}-${end}`
  });
}

function planInitialMagicRange(sizeValue, byteCount = 4096) {
  if (!Number.isSafeInteger(byteCount) || byteCount <= 0) fail('INVALID_RANGE');
  let size;
  try {
    size = BigInt(exactIntegerText(sizeValue));
  } catch {
    fail('INVALID_RANGE');
  }
  if (size <= 0n) fail('INVALID_RANGE');
  return planExactRange(0n, (size < BigInt(byteCount) ? size : BigInt(byteCount)) - 1n, size);
}

function parseExactContentRange(value) {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  return { start: BigInt(match[1]), end: BigInt(match[2]), total: BigInt(match[3]) };
}

function validateHeaders(result, range, expectedSize) {
  if (!result || !Number.isInteger(result.status)) fail('INVALID_READER_RESULT');
  if (result.status !== 206) fail('STATUS_NOT_206');
  const contentRange = parseExactContentRange(headerValue(result.headers, 'Content-Range'));
  if (!contentRange
    || contentRange.start !== range.start
    || contentRange.end !== range.end
    || contentRange.total !== BigInt(expectedSize)) {
    fail('CONTENT_RANGE_INVALID');
  }
  const contentLength = parseDecimalBigInt(headerValue(result.headers, 'Content-Length'));
  if (contentLength == null || contentLength > MAX_SAFE || contentLength !== BigInt(range.length)) {
    fail('CONTENT_LENGTH_INVALID');
  }
  if (String(headerValue(result.headers, 'Accept-Ranges') ?? '').trim().toLowerCase() !== 'bytes') {
    fail('ACCEPT_RANGES_INVALID');
  }
  const cacheControl = String(headerValue(result.headers, 'Cache-Control') ?? '');
  if (!cacheControl.split(',').some((directive) => directive.trim().toLowerCase() === 'no-store')) {
    fail('CACHE_CONTROL_INVALID');
  }
}

function bytesFrom(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function createTimedRejection(ms, code, setTimeoutFn, clearTimeoutFn) {
  let timer;
  let rejectPromise;
  let epoch = 0;
  let cleared = false;
  const arm = () => {
    const owner = ++epoch;
    timer = setTimeoutFn(() => {
      if (cleared || owner !== epoch) return;
      rejectPromise(new BoundedProbeError(code));
    }, ms);
  };
  const promise = new Promise((_, reject) => {
    rejectPromise = reject;
    arm();
  });
  return {
    promise,
    reset() {
      clearTimeoutFn(timer);
      arm();
    },
    clear() {
      cleared = true;
      epoch += 1;
      clearTimeoutFn(timer);
    }
  };
}

async function awaitHeaders(readRange, request, options) {
  const timeout = createTimedRejection(
    options.limits.headersMs,
    'HEADER_TIMEOUT',
    options.setTimeoutFn,
    options.clearTimeoutFn
  );
  const pending = Promise.resolve().then(() => readRange(request));
  pending.then((late) => {
    if (options.signal.aborted) void cancelBody(late, options.signal.reason).catch(() => {});
  }).catch(() => {});
  try {
    return await Promise.race([awaitWithSignal(pending, options.signal), timeout.promise]);
  } catch (error) {
    if (error instanceof BoundedProbeError && error.code === 'HEADER_TIMEOUT') {
      options.controller.abort(error);
    }
    if (error instanceof BoundedProbeError) throw error;
    fail('READER_FAILURE');
  } finally {
    timeout.clear();
  }
}

async function readExactBody(result, expectedLength, options) {
  const direct = bytesFrom(result.bytes ?? result.body);
  if (direct) {
    if (direct.byteLength > expectedLength) fail('BODY_LENGTH_MISMATCH');
    options.onReceived(direct.byteLength);
    if (direct.byteLength !== expectedLength) fail('BODY_LENGTH_MISMATCH');
    return new Uint8Array(direct);
  }
  if (!result.body?.getReader) fail('BODY_UNAVAILABLE');
  const reader = result.body.getReader();
  options.onReaderOwned();
  const chunks = [];
  let received = 0;
  const timeout = createTimedRejection(
    options.limits.bodyNoProgressMs,
    'BODY_TIMEOUT',
    options.setTimeoutFn,
    options.clearTimeoutFn
  );
  let cancellationPromise = null;
  const cancel = (reason) => {
    if (!cancellationPromise) {
      cancellationPromise = Promise.resolve()
        .then(() => {
          if (typeof reader?.cancel !== 'function') fail('CLEANUP_FAILED');
          return reader.cancel(reason);
        })
        .catch(() => { fail('CLEANUP_FAILED'); });
    }
    return cancellationPromise;
  };
  const onAbort = () => { void cancel(options.signal.reason).catch(() => {}); };
  options.signal.addEventListener('abort', onAbort, { once: true });
  try {
    try {
      while (true) {
        throwIfAborted(options.signal);
        let step;
        try {
          step = await Promise.race([
            awaitWithSignal(reader.read(), options.signal),
            timeout.promise
          ]);
        } catch (error) {
          if (error instanceof BoundedProbeError && error.code === 'BODY_TIMEOUT') {
            options.controller.abort(error);
          }
          if (error instanceof BoundedProbeError) throw error;
          fail('READER_FAILURE');
        }
        throwIfAborted(options.signal);
        if (step.done) break;
        const chunk = bytesFrom(step.value);
        if (!chunk) fail('BODY_UNAVAILABLE');
        if (received + chunk.byteLength > expectedLength) {
          fail('BODY_LENGTH_MISMATCH');
        }
        received += chunk.byteLength;
        options.onReceived(chunk.byteLength);
        if (chunk.byteLength > 0) timeout.reset();
        chunks.push(new Uint8Array(chunk));
      }
    } catch (error) {
      await cancel(error);
      throw error;
    }
  } finally {
    timeout.clear();
    options.signal.removeEventListener('abort', onAbort);
    try { reader.releaseLock?.(); } catch {}
  }
  if (received !== expectedLength) fail('BODY_LENGTH_MISMATCH');
  const output = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function mergeUniqueInterval(intervals, start, end) {
  let added = end - start + 1n;
  let mergedStart = start;
  let mergedEnd = end;
  const kept = [];
  for (const current of intervals) {
    if (current.end + 1n < mergedStart || current.start - 1n > mergedEnd) {
      kept.push(current);
      continue;
    }
    const overlapStart = current.start > mergedStart ? current.start : mergedStart;
    const overlapEnd = current.end < mergedEnd ? current.end : mergedEnd;
    if (overlapStart <= overlapEnd) added -= overlapEnd - overlapStart + 1n;
    if (current.start < mergedStart) mergedStart = current.start;
    if (current.end > mergedEnd) mergedEnd = current.end;
  }
  kept.push({ start: mergedStart, end: mergedEnd });
  kept.sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0);
  intervals.splice(0, intervals.length, ...kept);
  return Number(added);
}

function createBatchBudget(maxBytes = DEFAULT_LIMITS.batchBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > DEFAULT_LIMITS.batchBytes) {
    fail('PROBE_FAILED');
  }
  let receivedBytes = 0;
  return Object.freeze({
    get receivedBytes() { return receivedBytes; },
    get remainingBytes() { return maxBytes - receivedBytes; },
    canStart(byteCount) { return receivedBytes + byteCount <= maxBytes; },
    addReceived(byteCount) { receivedBytes += byteCount; },
    maxBytes
  });
}

function redactedFailureResult(code, metrics, identityState) {
  return Object.freeze({
    schema: 'drive-original.v2-07a-bounded-probe/1',
    producer: `bounded-probe.mjs@${TOOL_VERSION}`,
    ok: false,
    failure: Object.freeze({ code: FAILURE_CODE_SET.has(code) ? code : 'PROBE_FAILED' }),
    identity: Object.freeze({
      preflight: identityState.preflight,
      postflight: identityState.postflight,
      checked: IDENTITY_FIELDS
    }),
    evidence: null,
    metrics: Object.freeze({ ...metrics })
  });
}

function successResult(evidence, metrics) {
  return Object.freeze({
    schema: 'drive-original.v2-07a-bounded-probe/1',
    producer: `bounded-probe.mjs@${TOOL_VERSION}`,
    ok: true,
    failure: null,
    identity: Object.freeze({ preflight: true, postflight: true, checked: IDENTITY_FIELDS }),
    evidence,
    metrics: Object.freeze({ ...metrics })
  });
}

async function verifyBoundedPostflight({
  expected,
  getIdentity,
  generation,
  isGenerationCurrent,
  signal,
  timeoutMs,
  setTimeoutFn,
  clearTimeoutFn
}) {
  throwIfAborted(signal);
  if (!isGenerationCurrent(generation)) fail('GENERATION_STALE');

  const controller = new AbortController();
  const unlinkAbort = linkAbort(signal, controller);
  const timer = setTimeoutFn(
    () => controller.abort(new BoundedProbeError('POSTFLIGHT_FAILED')),
    timeoutMs
  );
  try {
    let after;
    try {
      after = await awaitWithSignal(
        Promise.resolve().then(() => getIdentity({
          phase: 'postflight',
          generation,
          signal: controller.signal
        })),
        controller.signal
      );
    } catch {
      throwIfAborted(signal);
      if (!isGenerationCurrent(generation)) fail('GENERATION_STALE');
      fail('POSTFLIGHT_FAILED');
    }
    throwIfAborted(signal);
    if (!isGenerationCurrent(generation)) fail('GENERATION_STALE');
    try {
      assertExpectedIdentity(expected, after);
    } catch (error) {
      if (error instanceof BoundedProbeError && error.code === 'IDENTITY_MISMATCH') {
        fail('POSTFLIGHT_DRIFT');
      }
      throw error;
    }
  } finally {
    clearTimeoutFn(timer);
    unlinkAbort();
    controller.abort(new BoundedProbeError('ABORTED'));
  }
}

async function runBoundedProbe({
  expectedIdentity: expectedValue,
  getIdentity,
  readRange,
  probe,
  generation,
  isGenerationCurrent = () => true,
  batchBudget = createBatchBudget(),
  signal,
  limits: limitOverrides,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
}) {
  const metrics = { requests: 0, receivedBytes: 0, uniqueBytes: 0, cacheHits: 0, dedupedReads: 0 };
  const identityState = { preflight: false, postflight: false };
  let expected;
  let limits;
  try {
    expected = normalizeProbeIdentity(expectedValue);
    limits = normalizeLimits(limitOverrides);
    if (typeof getIdentity !== 'function' || typeof readRange !== 'function' || typeof probe !== 'function'
      || typeof isGenerationCurrent !== 'function'
      || typeof setTimeoutFn !== 'function' || typeof clearTimeoutFn !== 'function') {
      fail('PROBE_FAILED');
    }
  } catch (error) {
    return redactedFailureResult(fixedCode(error, 'PROBE_FAILED'), metrics, identityState);
  }

  const lifetimeController = new AbortController();
  const unlinkAbort = linkAbort(signal, lifetimeController);
  const fileController = new AbortController();
  const unlinkLifetime = linkAbort(lifetimeController.signal, fileController);
  const postflightBudgetMs = Math.min(
    limits.headersMs,
    Math.max(1, Math.floor(limits.fileMs / 2))
  );
  const readPhaseMs = Math.max(1, limits.fileMs - postflightBudgetMs);
  const lifetimeTimer = setTimeoutFn(
    () => lifetimeController.abort(new BoundedProbeError('FILE_TIMEOUT')),
    limits.fileMs
  );
  const readPhaseTimer = setTimeoutFn(
    () => fileController.abort(new BoundedProbeError('FILE_TIMEOUT')),
    readPhaseMs
  );
  const cache = new Map();
  const inflight = new Map();
  const intervals = [];
  let activeReads = 0;
  let serialTail = Promise.resolve();
  let readFailure = null;

  const generationCheck = () => {
    if (!isGenerationCurrent(generation)) fail('GENERATION_STALE');
  };

  const addReceived = (byteCount) => {
    if (!Number.isSafeInteger(byteCount) || byteCount < 0) fail('BODY_LENGTH_MISMATCH');
    if (metrics.receivedBytes + byteCount > limits.fileBytes) fail('FILE_BYTE_LIMIT');
    if (batchBudget.receivedBytes + byteCount > batchBudget.maxBytes) fail('BATCH_BYTE_LIMIT');
    metrics.receivedBytes += byteCount;
    batchBudget.addReceived(byteCount);
  };

  const read = async ({ start, end }) => {
    throwIfAborted(fileController.signal);
    generationCheck();
    const range = planExactRange(start, end, expected.size, limits.requestBytes);
    const key = `${range.start}-${range.end}`;
    if (cache.has(key)) {
      metrics.cacheHits += 1;
      return new Uint8Array(cache.get(key));
    }
    if (inflight.has(key)) {
      metrics.dedupedReads += 1;
      return new Uint8Array(await inflight.get(key));
    }
    const execute = async () => {
      throwIfAborted(fileController.signal);
      generationCheck();
      if (activeReads !== 0) fail('PROBE_FAILED');
      if (metrics.requests >= limits.fileRequests) fail('FILE_REQUEST_LIMIT');
      if (metrics.receivedBytes + range.length > limits.fileBytes) fail('FILE_BYTE_LIMIT');
      if (!batchBudget.canStart(range.length)) fail('BATCH_BYTE_LIMIT');
      activeReads += 1;
      metrics.requests += 1;
      let result = null;
      let bodyHandlingStarted = false;
      try {
        result = await awaitHeaders(readRange, Object.freeze({
          identity: expected,
          generation,
          start: Number(range.start),
          end: Number(range.end),
          range: range.header,
          signal: fileController.signal
        }), {
          controller: fileController,
          signal: fileController.signal,
          limits,
          setTimeoutFn,
          clearTimeoutFn
        });
        throwIfAborted(fileController.signal);
        generationCheck();
        validateHeaders(result, range, expected.size);
        const bytes = await readExactBody(result, range.length, {
          controller: fileController,
          signal: fileController.signal,
          limits,
          setTimeoutFn,
          clearTimeoutFn,
          onReceived: addReceived,
          onReaderOwned: () => { bodyHandlingStarted = true; }
        });
        throwIfAborted(fileController.signal);
        generationCheck();
        if (metrics.receivedBytes > limits.fileBytes) fail('FILE_BYTE_LIMIT');
        if (batchBudget.receivedBytes > batchBudget.maxBytes) fail('BATCH_BYTE_LIMIT');
        metrics.uniqueBytes += mergeUniqueInterval(intervals, range.start, range.end);
        cache.set(key, new Uint8Array(bytes));
        return bytes;
      } catch (error) {
        if (!bodyHandlingStarted) await cancelBody(result, error);
        throw error;
      } finally {
        activeReads -= 1;
      }
    };
    const operation = serialTail.then(execute);
    serialTail = operation.then(
      () => undefined,
      (error) => { if (!readFailure) readFailure = error; }
    );
    inflight.set(key, operation);
    try {
      return new Uint8Array(await operation);
    } finally {
      inflight.delete(key);
    }
  };

  try {
    generationCheck();
    throwIfAborted(fileController.signal);
    let before;
    try {
      before = await awaitWithSignal(
        getIdentity({ phase: 'preflight', generation, signal: fileController.signal }),
        fileController.signal
      );
    } catch (error) {
      if (fileController.signal.aborted) throw abortReason(fileController.signal);
      if (error instanceof BoundedProbeError) throw error;
      fail('PREFLIGHT_FAILED');
    }
    assertExpectedIdentity(expected, before);
    if (!expected.canDownload) fail('DOWNLOAD_FORBIDDEN');
    identityState.preflight = true;
    generationCheck();

    let evidence;
    try {
      evidence = await awaitWithSignal(probe(Object.freeze({
        read,
        sniffMagic,
        planInitialMagicRange: (byteCount) => planInitialMagicRange(expected.size, byteCount),
        signal: fileController.signal,
        generation
      })), fileController.signal);
    } catch (error) {
      if (fileController.signal.aborted) throw abortReason(fileController.signal);
      if (error instanceof BoundedProbeError) throw error;
      fail('PROBE_FAILED');
    }
    throwIfAborted(fileController.signal);
    generationCheck();

    await awaitWithSignal(serialTail, fileController.signal);
    if (readFailure) throw readFailure;
    fileController.abort(new BoundedProbeError('ABORTED'));
    clearTimeoutFn(readPhaseTimer);
    await verifyBoundedPostflight({
      expected,
      getIdentity,
      generation,
      isGenerationCurrent,
      signal: lifetimeController.signal,
      timeoutMs: postflightBudgetMs,
      setTimeoutFn,
      clearTimeoutFn
    });
    identityState.postflight = true;
    generationCheck();
    return successResult(evidence, metrics);
  } catch (error) {
    cache.clear();
    const fallback = identityState.preflight ? 'PROBE_FAILED' : 'PREFLIGHT_FAILED';
    let code = fixedCode(error, fallback);
    const needsFailurePostflight = identityState.preflight
      && metrics.requests > 0
      && code !== 'ABORTED'
      && code !== 'GENERATION_STALE'
      && code !== 'POSTFLIGHT_DRIFT'
      && code !== 'POSTFLIGHT_FAILED';
    if (needsFailurePostflight) {
      let cleanupSettled = false;
      try {
        fileController.abort(new BoundedProbeError(code));
        await awaitWithSignal(serialTail, lifetimeController.signal);
        cleanupSettled = true;
        if (readFailure instanceof BoundedProbeError && readFailure.code === 'CLEANUP_FAILED') {
          throw readFailure;
        }
        clearTimeoutFn(readPhaseTimer);
        await verifyBoundedPostflight({
          expected,
          getIdentity,
          generation,
          isGenerationCurrent,
          signal: lifetimeController.signal,
          timeoutMs: postflightBudgetMs,
          setTimeoutFn,
          clearTimeoutFn
        });
        identityState.postflight = true;
      } catch (postflightError) {
        code = fixedCode(postflightError, 'POSTFLIGHT_FAILED');
        if (!cleanupSettled && code === 'FILE_TIMEOUT') code = 'CLEANUP_TIMEOUT';
      }
    }
    if (metrics.requests > 0 && !identityState.postflight) {
      metrics.uniqueBytes = 0;
    }
    return redactedFailureResult(code, metrics, identityState);
  } finally {
    lifetimeController.abort(new BoundedProbeError('ABORTED'));
    fileController.abort(new BoundedProbeError('ABORTED'));
    clearTimeoutFn(readPhaseTimer);
    clearTimeoutFn(lifetimeTimer);
    unlinkLifetime();
    unlinkAbort();
    cache.clear();
    inflight.clear();
  }
}

async function runBoundedProbeBatch({
  representatives,
  getIdentity,
  readRange,
  probe,
  generation,
  isGenerationCurrent,
  signal,
  limits,
  setTimeoutFn,
  clearTimeoutFn
}) {
  if (!Array.isArray(representatives)) fail('PROBE_FAILED');
  const resolvedLimits = normalizeLimits(limits);
  const batchBudget = createBatchBudget(resolvedLimits.batchBytes);
  const results = [];
  let terminated = false;
  const terminalCodes = new Set([
    'ABORTED', 'BODY_TIMEOUT', 'CLEANUP_FAILED', 'CLEANUP_TIMEOUT', 'FILE_TIMEOUT',
    'GENERATION_STALE', 'HEADER_TIMEOUT', 'POSTFLIGHT_DRIFT', 'POSTFLIGHT_FAILED'
  ]);
  for (let index = 0; index < representatives.length; index += 1) {
    throwIfAborted(signal);
    const expectedIdentity = representatives[index];
    const result = await runBoundedProbe({
      expectedIdentity,
      getIdentity: (context) => getIdentity({ ...context, expectedIdentity, index }),
      readRange: (context) => readRange({ ...context, index }),
      probe: (context) => probe({ ...context, index }),
      generation,
      isGenerationCurrent,
      batchBudget,
      signal,
      limits: resolvedLimits,
      setTimeoutFn,
      clearTimeoutFn
    });
    results.push(result);
    if (!result.ok && (terminalCodes.has(result.failure.code)
      || (result.identity.preflight && result.metrics.requests > 0
        && !result.identity.postflight))) {
      terminated = true;
      break;
    }
  }
  return Object.freeze({
    schema: 'drive-original.v2-07a-bounded-probe-batch/1',
    concurrency: 1,
    complete: !terminated && results.length === representatives.length,
    processed: results.length,
    receivedBytes: batchBudget.receivedBytes,
    results: Object.freeze(results)
  });
}

function ascii(bytes, start, length) {
  if (bytes.byteLength < start + length) return '';
  let output = '';
  for (let index = start; index < start + length; index += 1) {
    output += String.fromCharCode(bytes[index]);
  }
  return output;
}

function startsWith(bytes, signature) {
  return bytes.byteLength >= signature.length
    && signature.every((value, index) => bytes[index] === value);
}

function containsAscii(bytes, needle, maximum = 1024) {
  const end = Math.min(bytes.byteLength, maximum);
  const text = ascii(bytes, 0, end).toLowerCase();
  return text.includes(needle);
}

function sniffResult(kind, family) {
  return Object.freeze({
    kind,
    family,
    source: 'magic-bytes',
    decodeClaimed: false,
    playbackClaimed: false
  });
}

function sniffMagic(value) {
  const bytes = bytesFrom(value);
  if (!bytes || bytes.byteLength === 0) return sniffResult('unknown', 'unknown');
  if (bytes.byteLength >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    return sniffResult('iso-bmff', 'video-container');
  }
  if (bytes.byteLength >= 188 && bytes[0] === 0x47
    && (bytes.byteLength === 188 || bytes[188] === 0x47)) {
    return sniffResult('mpeg-ts', 'video-container');
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    if (containsAscii(bytes, 'webm')) return sniffResult('webm', 'ebml-container');
    if (containsAscii(bytes, 'matroska')) return sniffResult('matroska', 'ebml-container');
    return sniffResult('ebml', 'ebml-container');
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF') {
    if (ascii(bytes, 8, 4) === 'AVI ') return sniffResult('avi', 'riff-container');
    if (ascii(bytes, 8, 4) === 'WEBP') return sniffResult('webp', 'image');
  }
  if (startsWith(bytes, [0x42, 0x4d])) return sniffResult('bmp', 'image');
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return sniffResult('jpeg', 'image');
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return sniffResult('png', 'image');
  }
  const gif = ascii(bytes, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return sniffResult('gif', 'image');

  const sample = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 512)))
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  if (sample.startsWith('{') || sample.startsWith('[')
    || sample.startsWith('<!doctype html') || sample.startsWith('<html')
    || sample.startsWith('<?xml')) {
    return sniffResult('error-payload', 'non-media');
  }
  return sniffResult('unknown', 'unknown');
}

return {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES};})();
const scanner=(()=>{
// Local-only top-level header walk. The caller owns exact bytes and identity.
const UINT64_MAX = (1n << 64n) - 1n;
const KNOWN_TYPES = new Set(['ftyp', 'styp', 'moov', 'mdat', 'moof', 'uuid', 'free', 'skip', 'wide']);

const DEFAULT_LIMITS = Object.freeze({ maxBoxes: 128, maxHeaderBytes: 4096, maxRequests: 64 });

class ScanStop extends Error {
  constructor(code, category) {
    super(code);
    this.code = code;
    this.category = category;
  }
}

function stop(code, category) { throw new ScanStop(code, category); }

function fileSize(value) {
  if (typeof value !== 'bigint' && (typeof value !== 'string' || !/^\d{1,20}$/.test(value))) {
    stop('INVALID_SIZE', 'invalid-input');
  }
  const size = BigInt(value);
  if (size < 0n || size > UINT64_MAX) stop('INVALID_SIZE', 'invalid-input');
  return size;
}

function limitsFrom(value) {
  const limits = {};
  for (const [key, ceiling] of Object.entries(DEFAULT_LIMITS)) {
    const candidate = value?.[key] ?? ceiling;
    if (!Number.isSafeInteger(candidate) || candidate <= 0 || candidate > ceiling) {
      stop('INVALID_LIMITS', 'invalid-input');
    }
    limits[key] = candidate;
  }
  return limits;
}

function checkAbort(signal) {
  if (signal?.aborted) stop('ABORTED', 'cancelled');
}

// The reader must cancel its own I/O using the same caller-owned signal.
function readWithSignal(read, range, signal) {
  checkAbort(signal);
  if (!signal) return Promise.resolve().then(() => read(range));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, new ScanStop('ABORTED', 'cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => {
      checkAbort(signal);
      return read(range);
    }).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

function uint(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

/**
 * read({ start: BigInt, end: BigInt }) returns exact Uint8Array bytes (inclusive).
 * Report offsets are decimal strings. Limits may only be lowered. No body reads.
 */
async function scanIsoBmffTopLevel({ size: sizeValue, read, signal, limits: overrides } = {}) {
  let size = null;
  let offset = 0n;
  let limits = null;
  let requestedHeaderBytes = 0;
  let receivedHeaderBytes = 0;
  let requests = 0;
  const boxes = [];

  const report = (status, code, category) => {
    const firstMdat = boxes.find(box => box.type === 'mdat');
    const moov = boxes.filter(box => box.type === 'moov').map(box => Object.freeze({
      offset: box.offset,
      size: box.size,
      headerBytes: box.headerBytes,
      endExclusive: box.endExclusive,
      relativeToFirstObservedMdat: !firstMdat ? 'no-mdat-observed'
        : BigInt(box.offset) < BigInt(firstMdat.offset) ? 'before' : 'after'
    }));
    return Object.freeze({
      schema: 'drive-original.v2-07a-isobmff-index/1',
      status,
      code,
      category,
      evidenceLevel: status === 'complete' ? 'top-level-headers-complete' : 'partial-top-level-headers',
      size: size === null ? null : String(size),
      nextOffset: String(offset),
      boxes: Object.freeze(boxes.slice()),
      observations: Object.freeze({
        ftypHeaderObserved: boxes.some(box => box.type === 'ftyp'),
        stypHeaderObserved: boxes.some(box => box.type === 'styp'),
        moofHeaderObserved: boxes.some(box => box.type === 'moof'),
        moov: Object.freeze(moov)
      }),
      metrics: Object.freeze({ boxes: boxes.length, requests, requestedHeaderBytes, receivedHeaderBytes }),
      claims: Object.freeze({ containerValid: false, indexParsed: false, codecsParsed: false, decode: false, playback: false })
    });
  };

  const readHeader = async (start, length) => {
    checkAbort(signal);
    if (requests >= limits.maxRequests) stop('REQUEST_LIMIT', 'limit');
    if (requestedHeaderBytes + length > limits.maxHeaderBytes) stop('HEADER_BYTE_LIMIT', 'limit');
    requests += 1;
    requestedHeaderBytes += length;
    let bytes;
    try {
      bytes = await readWithSignal(read, Object.freeze({ start, end: start + BigInt(length) - 1n }), signal);
    } catch (error) {
      checkAbort(signal);
      if (error instanceof ScanStop) throw error;
      stop('READER_FAILURE', 'reader');
    }
    checkAbort(signal);
    if (!(bytes instanceof Uint8Array)) stop('INVALID_READER_RESULT', 'reader');
    // Reject an overlong result before copying or interpreting any of it.
    if (bytes.byteLength !== length) stop('READ_LENGTH_MISMATCH', 'reader');
    receivedHeaderBytes += length;
    return bytes;
  };

  try {
    size = fileSize(sizeValue);
    limits = limitsFrom(overrides);
    if (typeof read !== 'function' || (signal != null
      && (typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function'))) stop('INVALID_ARGUMENT', 'invalid-input');
    checkAbort(signal);
    while (offset < size) {
      checkAbort(signal);
      if (boxes.length >= limits.maxBoxes) stop('BOX_LIMIT', 'limit');
      const remaining = size - offset;
      if (remaining < 8n) stop('TRUNCATED_BASE_HEADER', 'malformed-header');
      const base = await readHeader(offset, 8);
      const shortSize = uint(base.subarray(0, 4));
      const rawType = String.fromCharCode(...base.subarray(4, 8));
      const type = KNOWN_TYPES.has(rawType) ? rawType : 'unknown';
      let headerBytes = shortSize === 1n ? 16 : 8;
      if (type === 'uuid') headerBytes += 16;
      let boxSize = shortSize === 0n ? remaining : shortSize;
      if (shortSize === 1n) {
        if (remaining < 16n) stop('TRUNCATED_EXTENDED_HEADER', 'malformed-header');
        boxSize = uint(await readHeader(offset + 8n, 8));
      }
      if (boxSize < BigInt(headerBytes)) stop('BOX_SMALLER_THAN_HEADER', 'malformed-header');
      const next = offset + boxSize;
      if (next > UINT64_MAX) stop('BOX_END_OVERFLOW', 'malformed-header');
      if (next > size) stop('BOX_BEYOND_EOF', 'malformed-header');
      // UUID user type follows largesize when present. Its body remains unread.
      if (type === 'uuid') await readHeader(offset + BigInt(headerBytes - 16), 16);
      boxes.push(Object.freeze({
        type,
        offset: String(offset),
        size: String(boxSize),
        headerBytes,
        endExclusive: String(next),
        sizeEncoding: shortSize === 0n ? 'to-eof' : shortSize === 1n ? 'uint64' : 'uint32'
      }));
      offset = next;
    }
    return report('complete', 'EOF', 'headers-only');
  } catch (error) {
    if (error instanceof ScanStop) return report('incomplete', error.code, error.category);
    return report('incomplete', 'INVALID_ARGUMENT', 'invalid-input');
  }
}

return {scanIsoBmffTopLevel};})();
const parser=(()=>{
// Bounded structural metadata only. No decoder/capability or sample-table verdict.
const MAX_MOOV_BYTES = 2 * 1024 * 1024;
const error = code => { throw Object.assign(new Error(code), { code }); };
const knownCodecs = new Set(['avc1','avc3','hvc1','hev1','av01','vp09','mp4a','Opus','ac-3','ec-3','alac','fLaC','enca','encv','tx3g','wvtt','stpp']);
function parseMoov(input) {
  let count=0, descriptorCount=0, tracks=[];
  const limitations=new Set(['sample-tables-unparsed','sample-payloads-unread','decode-and-capability-unproven','hdr-vfr-subtitles-unqualified']);
  const report=(status,code,fragmented=null)=>({schema:'drive-original.iso-tracks/1',status,code,fragmented,tracks,
    boxesParsed:count,limitations:[...limitations],containerValidityProven:false,decode:false,playback:false});
  try {
    if(!(input instanceof Uint8Array)||input.byteLength<8||input.byteLength>MAX_MOOV_BYTES)error('MOOV_SIZE_LIMIT');
    const view=new DataView(input.buffer,input.byteOffset,input.byteLength);
    const need=(offset,n,end=input.length)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+n>end)error('TRUNCATED_FIELD');};
    const u16=(p,end)=>{need(p,2,end);return view.getUint16(p);};
    const u32=(p,end)=>{need(p,4,end);return view.getUint32(p);};
    const type=p=>String.fromCharCode(...input.subarray(p,p+4));
    const boxes=(start,end)=>{
      const out=[];
      for(let p=start;p<end;){
        if(++count>4096)error('BOX_LIMIT');need(p,8,end);
        let size=u32(p,end),header=8;
        if(size===1){need(p,16,end);const n=view.getBigUint64(p+8);if(n>BigInt(MAX_MOOV_BYTES))error('BOX_SIZE_LIMIT');size=Number(n);header=16;}
        if(size===0)size=end-p;
        if(size<header||p+size>end)error('INVALID_BOX_SIZE');
        out.push({type:type(p+4),start:p,body:p+header,end:p+size});p+=size;
      }
      return out;
    };
    const one=(list,t,required=true)=>{const found=list.filter(b=>b.type===t);if(found.length>1||(!found.length&&required))error('MISSING_OR_DUPLICATE_BOX');return found[0]??null;};
    const full=(box,versions=[0])=>{need(box.body,4,box.end);const v=input[box.body];if(!versions.includes(v))error('UNSUPPORTED_BOX_VERSION');return v;};
    const configs=(entry,start)=>{
      const result={};
      for(const b of boxes(start,entry.end)){
        if(['avcC','hvcC','av1C','vpcC','esds','dOps','dac3','dec3','alac','dfLa','sinf','pasp','colr'].includes(b.type)){
          if(result[b.type])error('DUPLICATE_CODEC_CONFIG');
          result[b.type]={present:true,bytes:b.end-b.body};
          if(b.type==='avcC'){need(b.body,5,b.end);if(input[b.body]!==1)error('INVALID_AVCC');Object.assign(result[b.type],{profile:input[b.body+1],compatibility:input[b.body+2],level:input[b.body+3],lengthSize:(input[b.body+4]&3)+1});limitations.add('avcc-parameter-sets-unparsed');}
          else if(b.type==='hvcC'){need(b.body,23,b.end);if(input[b.body]!==1)error('INVALID_HVCC');Object.assign(result[b.type],{profileIdc:input[b.body+1]&31,levelIdc:input[b.body+12],bitDepthLuma:8+(input[b.body+17]&7),bitDepthChroma:8+(input[b.body+18]&7)});limitations.add('hvcc-arrays-unparsed');}
          else if(b.type==='esds'){
            full(b);const descriptor=(p,end,depth=0)=>{
              if(depth>4)error('DESCRIPTOR_DEPTH');let asc=null;
              while(p<end){if(++descriptorCount>4096)error('DESCRIPTOR_LIMIT');need(p,2,end);const tag=input[p++];let n=0,k=0,more;
                do{need(p,1,end);const v=input[p++];more=v&128;n=n*128+(v&127);if(++k>4)error('INVALID_DESCRIPTOR_LENGTH');}while(more);
                need(p,n,end);const next=p+n;
                if(tag===3){need(p,3,next);const flags=input[p+2];p+=3;if(flags&128){need(p,2,next);p+=2;}if(flags&64){need(p,1,next);const len=input[p++];need(p,len,next);p+=len;}if(flags&32){need(p,2,next);p+=2;}asc=descriptor(p,next,depth+1)??asc;}
                else if(tag===4){need(p,13,next);result.esds.objectTypeIndication=input[p];asc=descriptor(p+13,next,depth+1)??asc;}
                else if(tag===5){need(p,2,next);const a=input[p],c=input[p+1],objectType=a>>3,freqIndex=((a&7)<<1)|(c>>7),channelConfig=(c>>3)&15;
                  asc={objectType,freqIndex,channelConfig};if(objectType===31||freqIndex===15||![1,2,3,4].includes(objectType)||channelConfig===0)limitations.add('complex-audio-specific-config-unparsed');}
                p=next;
              }return asc;
            };result.esds.audioSpecificConfig=descriptor(b.body+4,b.end);limitations.add('audio-specific-config-extension-bits-unparsed');
          } else if(b.type==='sinf')limitations.add('encrypted-sample-entry-unqualified');
          else if(b.type==='colr')limitations.add('color-description-unparsed');
        } else limitations.add('unknown-sample-entry-child');
      }return result;
    };
    const top=boxes(0,input.length);if(top.length!==1||top[0].type!=='moov')error('EXPECTED_EXACT_MOOV');
    const children=boxes(top[0].body,top[0].end),fragmented=children.some(b=>b.type==='mvex');
    if(fragmented)limitations.add('fragment-defaults-and-fragments-unparsed');
    const traks=children.filter(b=>b.type==='trak');if(!traks.length||traks.length>32)error('TRACK_COUNT_LIMIT');
    const ids=new Set();
    for(const trak of traks){
      const tc=boxes(trak.body,trak.end),tk=one(tc,'tkhd'),tv=full(tk,[0,1]);
      const id=u32(tk.body+(tv===1?20:12),tk.end);if(!id||ids.has(id))error('DUPLICATE_TRACK_ID');ids.add(id);
      const dim=tk.body+(tv===1?88:76),width=u32(dim,tk.end)/65536,height=u32(dim+4,tk.end)/65536;
      const matrix=tk.body+(tv===1?52:40);need(matrix,36,tk.end);
      const identityMatrix=[65536,0,0,0,65536,0,0,0,1073741824].every((v,i)=>view.getInt32(matrix+i*4)===v);
      if(!identityMatrix)limitations.add('nonidentity-track-matrix-unqualified');
      if(tc.some(b=>b.type==='edts'))limitations.add('edit-list-unparsed');
      const mdia=one(tc,'mdia'),mc=boxes(mdia.body,mdia.end),hd=one(mc,'hdlr');full(hd);need(hd.body+8,4,hd.end);
      const rawHandler=type(hd.body+8),handler=['vide','soun','subt','text','sbtl','meta','hint'].includes(rawHandler)?rawHandler:'unknown';
      const mh=one(mc,'mdhd'),mv=full(mh,[0,1]),time=mh.body+(mv===1?20:12),timescale=u32(time,mh.end);if(!timescale)error('INVALID_TIMESCALE');
      const minf=one(mc,'minf'),stbl=one(boxes(minf.body,minf.end),'stbl'),stsd=one(boxes(stbl.body,stbl.end),'stsd');full(stsd);
      const entries=boxes(stsd.body+8,stsd.end);if(u32(stsd.body+4,stsd.end)!==entries.length||entries.length<1||entries.length>16)error('SAMPLE_DESCRIPTION_COUNT');
      const descriptions=entries.map(entry=>{
        need(entry.body,8,entry.end);const raw=entry.type,codec=knownCodecs.has(raw)?raw:'unknown',encrypted=['enca','encv'].includes(raw);
        const out={codec,encrypted,dataReferenceIndex:u16(entry.body+6,entry.end)};
        if(out.dataReferenceIndex!==1)limitations.add('nondefault-data-reference-unqualified');
        if(encrypted)limitations.add('encrypted-sample-entry-unqualified');
        if(handler==='vide'&&['avc1','avc3','hvc1','hev1','av01','vp09','encv'].includes(raw)){
          need(entry.body,78,entry.end);out.width=u16(entry.body+24,entry.end);out.height=u16(entry.body+26,entry.end);out.config=configs(entry,entry.body+78);
          const required={avc1:'avcC',avc3:'avcC',hvc1:'hvcC',hev1:'hvcC',av01:'av1C',vp09:'vpcC'}[raw];if(required&&!out.config[required])error('MISSING_CODEC_CONFIG');
        }else if(handler==='soun'&&['mp4a','Opus','ac-3','ec-3','alac','fLaC','enca'].includes(raw)){
          need(entry.body,28,entry.end);const version=u16(entry.body+8,entry.end);out.soundVersion=version;
          out.channels=u16(entry.body+16,entry.end);out.sampleSize=u16(entry.body+18,entry.end);out.sampleRate=u32(entry.body+24,entry.end)/65536;
          if(version!==0){limitations.add('quicktime-audio-version-unimplemented');out.config=null;}else{out.config=configs(entry,entry.body+28);if(raw==='mp4a'&&!out.config.esds)limitations.add('mp4a-esds-missing');}
        }else limitations.add('sample-entry-layout-unimplemented');
        return out;
      });
      tracks.push({type:handler,width,height,identityMatrix,timescale,descriptions});
    }
    return report('parsed','STRUCTURAL_METADATA_ONLY',fragmented);
  }catch(e){return report('incomplete',e?.code??'INVALID_INPUT');}
}

return {parseMoov,MAX_MOOV_BYTES};})();
const sparse=(()=>{
// Build a derived, compact metadata tree. Sample tables/payloads are never read.
const SPARSE_LIMITS=Object.freeze({bytes:2*1024*1024,requests:64,boxes:256,tracks:32,descriptions:16,configBytes:256*1024});
const stop=code=>{throw Object.assign(new Error(code),{code});};
const video=new Set(['avc1','avc3','hvc1','hev1','av01','vp09','encv']);
const audio=new Set(['mp4a','Opus','ac-3','ec-3','alac','fLaC','enca']);
const configs=new Set(['avcC','hvcC','av1C','vpcC','esds','dOps','dac3','dec3','alac','dfLa','pasp']);
const tableTypes=new Set(['stts','ctts','cslg','stsc','stsz','stz2','stco','co64','stss','stsh','padb','stdp','sdtp','sbgp','sgpd','subs','saiz','saio','senc']);
const uint=b=>{let n=0n;for(const v of b)n=(n<<8n)|BigInt(v);return n;};
const concat=parts=>{const size=parts.reduce((n,v)=>n+v.length,0),out=new Uint8Array(size);let p=0;for(const v of parts){out.set(v,p);p+=v.length;}return out;};
const pack=(type,parts=[])=>{const body=concat(parts),out=new Uint8Array(body.length+8),view=new DataView(out.buffer);view.setUint32(0,out.length);for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);out.set(body,8);return out;};

async function readSparseMoov({box,fileSize,read,signal,limits:overrides={}}={}){
  const metrics={requests:0,receivedBytes:0,boxes:0,tracks:0,descriptions:0,sampleTableBoxesSkipped:0,unknownPayloadsSkipped:0,fixedLeafSuffixesSkipped:0,originalBoundsValidated:false,derivedBytes:0};
  let limits=null;
  const check=()=>{if(signal?.aborted)stop('SPARSE_ABORTED');};
  const result=(status,code,bytes=null)=>({status,code,bytes,metrics:{...metrics},derivedStructuralMetadata:true,originalSampleTablesRead:false,containerValidityProven:false});
  try{
    limits=Object.fromEntries(Object.entries(SPARSE_LIMITS).map(([k,v])=>{const n=overrides[k]??v;if(!Number.isSafeInteger(n)||n<1||n>v)stop('SPARSE_INVALID_LIMIT');return [k,n];}));
    if(typeof read!=='function')stop('SPARSE_INVALID_ARGUMENT');
    const size=BigInt(fileSize),start=BigInt(box.offset),end=BigInt(box.endExclusive),declared=BigInt(box.size),head=BigInt(box.headerBytes);
    if(size>BigInt(Number.MAX_SAFE_INTEGER)||start<0n||end>size||declared!==end-start||head<8n||head>16n||declared<head)stop('SPARSE_INVALID_BOUNDS');
    const bytes=async(p,n,bound)=>{
      check();if(!Number.isSafeInteger(n)||n<1||p<start||p+BigInt(n)>bound||bound>end)stop('SPARSE_INVALID_BOUNDS');
      if(metrics.requests>=limits.requests)stop('SPARSE_REQUEST_LIMIT');if(metrics.receivedBytes+n>limits.bytes)stop('SPARSE_BYTE_LIMIT');metrics.requests++;
      const pending=Promise.resolve().then(()=>{check();return read({start:p,end:p+BigInt(n)-1n});});
      let value;
      if(!signal)value=await pending;
      else value=await new Promise((resolve,reject)=>{const onAbort=()=>finish(reject,Object.assign(new Error('SPARSE_ABORTED'),{code:'SPARSE_ABORTED'}));const finish=(fn,v)=>{signal.removeEventListener('abort',onAbort);fn(v);};signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();pending.then(v=>finish(resolve,v),e=>finish(reject,e));});
      check();
      if(!(value instanceof Uint8Array)||value.length!==n)stop('SPARSE_READ_LENGTH');metrics.receivedBytes+=value.length;return value;
    };
    const header=async(p,bound)=>{
      if(++metrics.boxes>limits.boxes)stop('SPARSE_BOX_LIMIT');
      const b=await bytes(p,8,bound),raw=Number(uint(b.subarray(0,4))),type=String.fromCharCode(...b.subarray(4));let h=8n,n=BigInt(raw);
      if(raw===1){n=uint(await bytes(p+8n,8,bound));h=16n;}else if(raw===0)n=bound-p;
      if(type==='uuid')h+=16n;
      if(n<h||p+n>bound||p+n>size)stop('SPARSE_INVALID_BOX');
      return {type,start:p,body:p+h,end:p+n,size:n,head:h};
    };
    const fixed=async(b)=>{
      const prefix=await bytes(b.body,4,b.end),v=prefix[0];let n;
      if(b.type==='tkhd'){if(v>1)stop('SPARSE_UNSUPPORTED_VERSION');n=v===1?96:84;}
      else if(b.type==='mdhd'){if(v>1)stop('SPARSE_UNSUPPORTED_VERSION');n=v===1?36:24;}
      else {if(v!==0)stop('SPARSE_UNSUPPORTED_VERSION');n=12;}
      const rest=await bytes(b.body+4n,n-4,b.end);if(b.body+BigInt(n)<b.end)metrics.fixedLeafSuffixesSkipped++;
      return pack(b.type,[prefix,rest]);
    };
    const stsd=async(b)=>{
      const prefix=await bytes(b.body,8,b.end);if(prefix[0]!==0)stop('SPARSE_UNSUPPORTED_VERSION');const count=Number(uint(prefix.subarray(4)));
      if(count<1||count>limits.descriptions)stop('SPARSE_DESCRIPTION_LIMIT');let p=b.body+8n;const entries=[];
      for(let i=0;i<count;i++){
        const e=await header(p,b.end);metrics.descriptions++;const n=video.has(e.type)?78:audio.has(e.type)?28:0;
        if(!n)stop('SPARSE_UNSUPPORTED_ENTRY');
        const entry=await bytes(e.body,n,e.end);if(audio.has(e.type)&&uint(entry.subarray(8,10))!==0n)stop('SPARSE_UNSUPPORTED_AUDIO_VERSION');
        let c=e.body+BigInt(n);const leaves=[entry];
        while(c<e.end){
          const child=await header(c,e.end),length=child.end-child.body;
          if(configs.has(child.type)){
            if(length>BigInt(limits.configBytes))stop('SPARSE_CONFIG_LIMIT');
            leaves.push(pack(child.type,length?[await bytes(child.body,Number(length),child.end)]:[]));
          }else if(child.type==='sinf'||child.type==='colr'){
            metrics.unknownPayloadsSkipped++;leaves.push(pack(child.type));
          }else{metrics.unknownPayloadsSkipped++;leaves.push(pack('free'));}
          c=child.end;
        }
        entries.push(pack(e.type,leaves));p=e.end;
      }
      if(p!==b.end)stop('SPARSE_DESCRIPTION_COUNT');return pack('stsd',[prefix,...entries]);
    };
    const grammar={moov:new Set(['trak']),trak:new Set(['mdia']),mdia:new Set(['minf']),minf:new Set(['stbl']),stbl:new Set()};
    const allowedLeaves={moov:new Set(),trak:new Set(['tkhd']),mdia:new Set(['mdhd','hdlr']),minf:new Set(),stbl:new Set(['stsd'])};
    const walk=async(type,body,bound,depth)=>{
      check();if(depth>5)stop('SPARSE_DEPTH');let p=body;const output=[];
      while(p<bound){
        const child=await header(p,bound);
        if(grammar[type].has(child.type)){
          if(child.type==='trak'&&++metrics.tracks>limits.tracks)stop('SPARSE_TRACK_LIMIT');
          output.push(await walk(child.type,child.body,child.end,depth+1));
        }else if(allowedLeaves[type].has(child.type))output.push(child.type==='stsd'?await stsd(child):await fixed(child));
        else if((type==='moov'&&child.type==='mvex')||(type==='trak'&&child.type==='edts')){metrics.unknownPayloadsSkipped++;output.push(pack(child.type));}
        else if(type==='stbl'&&tableTypes.has(child.type))metrics.sampleTableBoxesSkipped++;
        else metrics.unknownPayloadsSkipped++;
        p=child.end;
      }
      return pack(type,output);
    };
    // Reuse the root scanner's identity-fenced validated header; do not reread it.
    const derived=await walk('moov',start+head,end,0);check();if(derived.length>limits.bytes)stop('SPARSE_DERIVED_LIMIT');
    metrics.originalBoundsValidated=true;metrics.derivedBytes=derived.length;
    return result('complete','SPARSE_STRUCTURAL_METADATA',derived);
  }catch(e){return result('incomplete',typeof e?.code==='string'&&e.code.startsWith('SPARSE_')?e.code:'SPARSE_READER_FAILURE');}
}

return {readSparseMoov};})();
const probe=(()=>{const {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES}=bounded;const {scanIsoBmffTopLevel}=scanner;const {parseMoov,MAX_MOOV_BYTES}=parser;const {readSparseMoov}=sparse;
const VERSION='1.22.0-rc.11';
const CAPS=Object.freeze({mediaBytes:MAX_MOOV_BYTES+8192,mediaRequests:64,metadataBytes:32768,runMs:60000});
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(v);
const stop=code=>Object.assign(new Error(code),{code});
const known=new Set([...FAILURE_CODES,'RUNTIME_REJECTED','OWNER_CHANGED','CANCELLED','RUN_TIMEOUT','METADATA_FAILED','METADATA_LIMIT','NOT_ISO','SMALL_FILE_SKIPPED','MOOV_SIZE_LIMIT','MOOV_COUNT','HEADER_SCAN_INCOMPLETE','PARSER_INCOMPLETE']);
const waitSignal=(operation,signal)=>new Promise((resolve,reject)=>{
  const abort=()=>finish(reject,signal.reason??stop('CANCELLED'));
  const finish=(fn,value)=>{signal.removeEventListener('abort',abort);fn(value);};
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  Promise.resolve(operation).then(v=>finish(resolve,v),e=>finish(reject,e));
});

// Single caller-selected actual app file: no enumeration, persistence or mutation.
function createIsoTracksProbe(runtime, selected) {
  let live=runtime,file=selected,privateSelected=null,promise=null,timer=null,done=false;
  const abort=new AbortController(),budget=createBatchBudget(CAPS.mediaBytes);
  const result={schema:'drive-original.iso-tracks-rc11/1',version:VERSION,scope:'single-file-structural-moov',
    complete:false,failure:null,metadataRequests:0,metadataBytes:0,mediaRequests:0,mediaBytes:0,
    identityPreflight:false,identityPostflight:false,actualIsoMagic:false,headersComplete:false,
    moovBytes:0,sparseMoov:null,tracks:null,fragmentHeaderObserved:false,decoded:false,playback:false,
    freshSWRuntimeVersionVerified:false,released:false,localReferencesReleased:false,
    genericUpstreamCleanup:'unknown',metadataCleanup:'not-started',privateSelectionRetained:false};
  const safe=()=>JSON.parse(JSON.stringify(result));
  let owner=null,controller=null,proof=null,key=null,expected=null,contentIdentity=null;
  let cleanupFailure=null;const metadataWork=new Set();
  const cancel=()=>{if(!abort.signal.aborted)abort.abort(stop('CANCELLED'));};
  function current(){
    if(abort.signal.aborted)throw abort.signal.reason;
    const now=live.readState(),sw=live.getSWIdentity();
    if(now!==owner.state||Object.entries(owner.values).some(([k,v])=>now[k]!==v)
      ||sw?.controller!==controller||sw?.version!==VERSION||live.navigator.serviceWorker.controller!==controller||controller?.state!=='activated'
      ||live.appVersion!==VERSION||live.getMutationsEnabled()!==false||live.getQ1Playback()!==null||live.getPlayerMediaPriorityActive()!==false
      ||live.getQ1RetirementResult()!==owner.retirement||owner.retirement?.settled!==true||live.getMediaSourceGeneration()!==owner.source
      ||now.selected!==null||now.mediaAttempt!=='idle'||now.mediaAbortController!==null||now.pendingOriginalBuffer!==null
      ||now.pendingPlay!==false||now.mediaTransportStarted!==false||!live.hasUsableToken())throw stop('OWNER_CHANGED');
  }
  function metadata(signal){
    const task=readMetadata(signal);metadataWork.add(task);
    task.then(()=>metadataWork.delete(task),()=>metadataWork.delete(task));return task;
  }
  async function readMetadata(signal){
    current();if(result.metadataRequests>=2)throw stop('METADATA_LIMIT');result.metadataRequests++;
    const child=new AbortController(),onAbort=()=>child.abort(signal.reason);signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();
    const timeout=setTimeout(()=>child.abort(stop('METADATA_FAILED')),10000);
    let reader=null,response=null,pending=null,finished=false;
    try{
      const url=new URL(`https://www.googleapis.com/drive/v3/files/${file.id}`);
      url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields','id,version,headRevisionId,sha256Checksum,size,modifiedTime,mimeType,trashed,resourceKey,capabilities(canDownload)');
      const headers={Authorization:`Bearer ${owner.values.token}`};if(key)headers['X-Goog-Drive-Resource-Keys']=`${file.id}/${key}`;
      pending=Promise.resolve(live.nativeFetch(url.href,{method:'GET',headers,credentials:'omit',cache:'no-store',redirect:'error',signal:child.signal,priority:'low'}));
      response=await waitSignal(pending,child.signal);current();
      if(response.status!==200||!response.body)throw stop('METADATA_FAILED');
      reader=response.body.getReader();const chunks=[];let n=0;
      while(true){const item=await waitSignal(reader.read(),child.signal);current();if(item.done){finished=true;break;}if(!(item.value instanceof Uint8Array))throw stop('METADATA_FAILED');n+=item.value.length;result.metadataBytes+=item.value.length;if(n>CAPS.metadataBytes)throw stop('METADATA_LIMIT');chunks.push(item.value);}
      const all=new Uint8Array(n);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
      const observedKey=data.resourceKey??null;
      if(data.id!==file.id||data.trashed!==false||(observedKey!==null&&!validId(observedKey))||(key&&key!==observedKey))throw stop('IDENTITY_MISMATCH');
      if(expected&&observedKey!==key)throw stop('IDENTITY_MISMATCH');key=observedKey;
      const content={headRevisionId:data.headRevisionId??null,sha256Checksum:data.sha256Checksum??null};
      if(contentIdentity&&Object.keys(content).some(k=>content[k]!==contentIdentity[k]))throw stop('IDENTITY_MISMATCH');
      if(!contentIdentity){for(const k of Object.keys(content))if(file[k]!=null&&file[k]!==content[k])throw stop('IDENTITY_MISMATCH');contentIdentity=content;}
      return normalizeProbeIdentity({accountKey:owner.values.authAccountKey,fileId:data.id,version:data.version,size:data.size,modifiedTime:data.modifiedTime,mimeType:data.mimeType,canDownload:data.capabilities?.canDownload});
    } finally {
      clearTimeout(timeout);signal.removeEventListener('abort',onAbort);child.abort(stop('CANCELLED'));
      if(!finished){
        let cleanupTimer;
        // If headers lost the abort race, wait for that fetch and cancel any late
        // response too. A missing local Response is not evidence of cleanup.
        const cleanup=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();
        try{await Promise.race([cleanup,new Promise((_,reject)=>{cleanupTimer=setTimeout(()=>reject(stop('CLEANUP_TIMEOUT')),2000);})]);result.metadataCleanup='cancel-settled';}
        catch(e){cleanupFailure=e?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';result.metadataCleanup=cleanupFailure==='CLEANUP_TIMEOUT'?'timeout':'failed';throw stop(cleanupFailure);}
        finally{clearTimeout(cleanupTimer);}
      }else result.metadataCleanup='body-consumed';
      try{reader?.releaseLock();}catch{}
    }
  }
  async function execute(){
    try{
      if(!live||live.appVersion!==VERSION||!file||!validId(file.id)||(file.resourceKey!=null&&!validId(file.resourceKey)))throw stop('RUNTIME_REJECTED');
      key=file.resourceKey??null;const state=live.readState();controller=live.navigator.serviceWorker.controller;proof=live.getSWIdentity();
      owner={state,values:Object.fromEntries(['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(k=>[k,state[k]])),retirement:live.getQ1RetirementResult(),source:live.getMediaSourceGeneration()};
      current();result.freshSWRuntimeVersionVerified=proof.controller===controller&&proof.version===VERSION;
      timer=setTimeout(()=>abort.abort(stop('RUN_TIMEOUT')),CAPS.runMs);live.addEventListener?.('pagehide',cancel,{once:true});
      expected=await metadata(abort.signal);current();
      for(const k of ['size','modifiedTime','mimeType','version'])if(file[k]!=null&&String(file[k])!==String(expected[k]))throw stop('IDENTITY_MISMATCH');
      if(typeof file.capabilities?.canDownload==='boolean'&&file.capabilities.canDownload!==expected.canDownload)throw stop('IDENTITY_MISMATCH');
      if(BigInt(expected.size)>BigInt(Number.MAX_SAFE_INTEGER))throw stop('INVALID_IDENTITY');
      let initial=true;
      const checked=await runBoundedProbe({expectedIdentity:expected,generation:owner.values.driveSessionGeneration,batchBudget:budget,signal:abort.signal,
        isGenerationCurrent:()=>{try{current();return true;}catch{return false;}},
        limits:{requestBytes:1024*1024,fileBytes:CAPS.mediaBytes,fileRequests:CAPS.mediaRequests,batchBytes:CAPS.mediaBytes,headersMs:10000,bodyNoProgressMs:10000,fileMs:50000},
        getIdentity:async({phase,signal})=>{current();if(phase==='preflight'&&initial){initial=false;return expected;}return metadata(signal);},
        readRange:({range,start,end,signal})=>{
          current();if(start===0&&end===Number(expected.size)-1)throw stop('INVALID_RANGE');
          const url=new URL(`/__drive_media/${file.id}`,live.location.href);url.searchParams.set('accountGeneration',String(owner.values.driveSessionGeneration));url.searchParams.set('mediaSession',String(owner.values.mediaSession));url.searchParams.set('size',expected.size);if(key)url.searchParams.set('resourceKey',key);
          return live.nativeFetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});
        },
        probe:async({read,sniffMagic,signal})=>{
          const size=BigInt(expected.size);if(size<=940n)return {code:'SMALL_FILE_SKIPPED'};
          const prefix=await read({start:0,end:939});current();if(sniffMagic(prefix).kind!=='iso-bmff')return {code:'NOT_ISO'};result.actualIsoMagic=true;
          const readPart=async({start,end})=>{const a=Number(start),b=Number(end);if(b<940)return prefix.slice(a,b+1);if(a<940){const rest=await read({start:940,end:b}),out=new Uint8Array(b-a+1);out.set(prefix.subarray(a));out.set(rest,940-a);return out;}return read({start:a,end:b});};
          const scan=await scanIsoBmffTopLevel({size:expected.size,signal,read:readPart,limits:{maxRequests:56,maxHeaderBytes:4096,maxBoxes:56}});current();
          result.headersComplete=scan.status==='complete';result.fragmentHeaderObserved=scan.observations.moofHeaderObserved;
          if(!result.headersComplete)return {code:'HEADER_SCAN_INCOMPLETE'};
          if(scan.observations.moov.length!==1)return {code:'MOOV_COUNT'};
          const box=scan.observations.moov[0];result.moovBytes=Number(box.size);
          const sparse=await readSparseMoov({box,fileSize:expected.size,read:readPart,signal});current();
          result.sparseMoov={status:sparse.status,code:sparse.code,metrics:sparse.metrics,derivedStructuralMetadata:true,originalSampleTablesRead:false};
          if(sparse.status!=='complete')return {code:sparse.code};
          const parsed=parseMoov(sparse.bytes);sparse.bytes.fill(0);parsed.limitations.push('derived-metadata-tree-original-sample-tables-unread','data-reference-boxes-unparsed');result.tracks=parsed;
          return {code:parsed.status==='parsed'?'STRUCTURAL_METADATA_ONLY':'PARSER_INCOMPLETE'};
        }});
      result.mediaRequests=checked.metrics.requests;result.mediaBytes=checked.metrics.receivedBytes;
      result.identityPreflight=checked.identity.preflight;result.identityPostflight=checked.identity.postflight;
      if(!checked.ok)throw stop(checked.failure.code);
      current();result.failure=checked.evidence.code==='STRUCTURAL_METADATA_ONLY'?null:checked.evidence.code;result.complete=result.failure===null;
      if(result.complete){privateSelected=file;result.privateSelectionRetained=true;}
    }catch(e){result.failure=known.has(e?.code)?e.code:'RUNTIME_REJECTED';}
    finally{
      clearTimeout(timer);live?.removeEventListener?.('pagehide',cancel);cancel();
      // The shared reader may finish its abort race before getIdentity's finally.
      // Let metadata's bounded cleanup settle before publishing done/released.
      if(metadataWork.size){let drainTimer;try{await Promise.race([Promise.allSettled([...metadataWork]),new Promise((_,reject)=>{drainTimer=setTimeout(()=>reject(stop('CLEANUP_TIMEOUT')),3000);})]);}catch{cleanupFailure='CLEANUP_TIMEOUT';result.metadataCleanup='timeout';}finally{clearTimeout(drainTimer);}}
      if(cleanupFailure){result.failure=cleanupFailure;result.complete=false;privateSelected=null;result.privateSelectionRetained=false;}
      result.mediaBytes=budget.receivedBytes;done=true;result.released=true;result.localReferencesReleased=true;live=null;file=null;owner=null;controller=null;proof=null;key=null;expected=null;contentIdentity=null;
    }
    return safe();
  }
  return Object.freeze({run(){return promise??=execute();},cancel(){cancel();return {cancelled:true};},
    poll(){return {done,summary:done?safe():null};},
    selectedFile(){return privateSelected;},release(){privateSelected=null;result.privateSelectionRetained=false;return {released:true};}});
}

return {createIsoTracksProbe};})();
return probe.createIsoTracksProbe;
})();const facade=(function (selected, swProof) {
  'use strict';
  const rejected=()=>Object.freeze({poll:()=>({done:true,summary:{failure:'FACADE_PREFLIGHT_REJECTED'}}),cancel:()=>({cancelled:true}),selectedFile:()=>null,release:()=>({released:true})});
  let projection,owner;
  try {
    if(!selected||!Array.isArray(state.files)||!state.files.includes(selected))return rejected();
    projection=JSON.parse(JSON.stringify(state.accountMediaState));
    owner={account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,
      tokenRevision:state.tokenRevision,token:state.token,expiry:state.expiresAt,abort:state.accountStateAbortController,
      controller:navigator.serviceWorker.controller,writer:state.accountStateWriterId,revision:state.accountStateRevision,
      session:state.mediaSession,playback:state.playbackSession,source:mediaSourceGeneration,retirement:q1RetirementResult};
  }catch{return rejected();}
  const current=()=>Boolean(owner)&&APP_VERSION==='1.22.0-rc.11'&&DRIVE_MUTATIONS_ENABLED===false
    &&ACCOUNT_STATE_WRITES_ENABLED===true&&top===self&&navigator.onLine===true&&document.visibilityState==='visible'
    &&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    &&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth
    &&state.driveSessionGeneration===owner.drive&&state.tokenRevision===owner.tokenRevision&&state.token===owner.token&&state.expiresAt===owner.expiry
    &&state.authStatus==='online'&&state.demo===false&&!state.accountIdentityPending&&hasUsableToken()
    &&state.accountStateAbortController===owner.abort&&Boolean(owner.abort?.signal)&&!owner.abort.signal.aborted
    &&navigator.serviceWorker.controller===owner.controller&&owner.controller?.state==='activated'
    &&swProof?.get?.()?.controller===owner.controller&&swProof?.get?.()?.version==='1.22.0-rc.11'
    &&state.accountStateLoaded===true&&state.accountStateWriterId===owner.writer&&typeof owner.writer==='string'&&owner.writer.length>0
    &&Number.isSafeInteger(owner.revision)&&owner.revision>=0&&state.accountStateRevision===owner.revision
    &&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null
    &&accountMediaStatesEqual(state.accountMediaState,projection)
    &&state.mediaSession===owner.session&&state.playbackSession===owner.playback&&mediaSourceGeneration===owner.source
    &&q1RetirementResult===owner.retirement&&q1RetirementResult?.settled===true
    &&state.selected===null&&state.mediaAttempt==='idle'&&state.mediaAbortController===null&&state.pendingOriginalBuffer===null
    &&state.pendingPlay===false&&state.mediaTransportStarted===false&&q1Playback===null&&!playerMediaPriorityActive;
  let handle;
  try {
    if(!current())return rejected();
    handle=this({appVersion:APP_VERSION,readState:()=>{if(!current())throw new Error('OWNER_CHANGED');return state;},
      hasUsableToken,getMutationsEnabled:()=>DRIVE_MUTATIONS_ENABLED,getQ1Playback:()=>q1Playback,
      getQ1RetirementResult:()=>q1RetirementResult,getMediaSourceGeneration:()=>mediaSourceGeneration,
      getPlayerMediaPriorityActive:()=>playerMediaPriorityActive,getSWIdentity:()=>swProof?.get?.(),
      navigator,location,nativeFetch:(...args)=>{if(!current())throw new Error('OWNER_CHANGED');return fetch(...args);},
      addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)},selected);
  }catch{return rejected();}
  handle.run().finally(()=>{projection=null;owner=null;selected=null;swProof=null;});
  return Object.freeze({poll:()=>handle.poll(),cancel:()=>handle.cancel(),selectedFile:()=>handle.selectedFile(),release:()=>handle.release()});
});return (selected,swProof)=>facade.call(factory,selected,swProof);})()
