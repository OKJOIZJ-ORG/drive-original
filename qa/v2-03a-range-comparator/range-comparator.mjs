const TOOL_VERSION = 'v2-03a.4';
const ROUTES = Object.freeze([
  ['currentSw', 'current-sw'],
  ['independentApi', 'independent-api']
]);

export class RangeComparatorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RangeComparatorError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RangeComparatorError(code, message);
}

function abortError() {
  return new DOMException('The comparison was cancelled.', 'AbortError');
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason?.name === 'AbortError' ? signal.reason : abortError();
}

function awaitWithAbort(value, signal) {
  throwIfAborted(signal);
  const pending = Promise.resolve(value);
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, result) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(result);
    };
    const onAbort = () => finish(
      reject,
      signal.reason?.name === 'AbortError' ? signal.reason : abortError()
    );
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    pending.then(
      (result) => finish(resolve, result),
      (error) => finish(reject, error)
    );
  });
}

function invokeWithAbort(callback, signal) {
  throwIfAborted(signal);
  return awaitWithAbort(Promise.resolve().then(callback), signal);
}

function cancelResponseBody(response, reason) {
  try {
    const cancellation = response?.body?.cancel?.(reason);
    void Promise.resolve(cancellation).catch(() => {});
  } catch (_) {
    // Cancellation is best-effort; the original abort or identity error wins.
  }
}

function requiredIdentityPart(value, field) {
  const normalized = String(value ?? '');
  if (!normalized) fail('INVALID_IDENTITY', `A non-empty ${field} is required.`);
  return normalized;
}

function optionalIdentityPart(value) {
  return value == null || value === '' ? null : String(value);
}

export function normalizePrivateIdentity(value) {
  const size = Number(value?.size);
  if (!Number.isSafeInteger(size) || size <= 0) {
    fail('INVALID_IDENTITY', 'A positive safe-integer size is required.');
  }
  return Object.freeze({
    accountKey: requiredIdentityPart(value?.accountKey, 'accountKey'),
    fileId: requiredIdentityPart(value?.fileId, 'fileId'),
    fileVersion: requiredIdentityPart(value?.fileVersion, 'fileVersion'),
    size,
    contentRevision: optionalIdentityPart(value?.contentRevision),
    checksum: optionalIdentityPart(value?.checksum),
    modifiedTime: optionalIdentityPart(value?.modifiedTime)
  });
}

function sameIdentity(left, right) {
  const requiredMatches = left.accountKey === right.accountKey
    && left.fileId === right.fileId
    && left.fileVersion === right.fileVersion
    && left.size === right.size;
  const optionalMatches = ['contentRevision', 'checksum', 'modifiedTime']
    .every((field) => left[field] == null || left[field] === right[field]);
  return requiredMatches && optionalMatches;
}

function assertSameIdentity(expected, actual, routeLabel) {
  const normalized = normalizePrivateIdentity(actual);
  if (!sameIdentity(expected, normalized)) {
    fail('IDENTITY_MISMATCH', `${routeLabel} did not prove the requested private content identity.`);
  }
  return normalized;
}

export function createFrontMidTailRanges(sizeValue, sampleBytesValue = 64 * 1024) {
  const size = Number(sizeValue);
  const sampleBytes = Number(sampleBytesValue);
  if (!Number.isSafeInteger(size) || size <= 0) fail('INVALID_SIZE', 'size must be a positive safe integer.');
  if (!Number.isSafeInteger(sampleBytes) || sampleBytes <= 0 || sampleBytes > 1024 * 1024) {
    fail('INVALID_SAMPLE_SIZE', 'sampleBytes must be a positive safe integer no larger than 1 MiB.');
  }
  const length = Math.min(size, sampleBytes);
  const tailStart = size - length;
  const midStart = Math.floor((size - length) / 2);
  return Object.freeze([
    Object.freeze({ label: 'front', start: 0, end: length - 1, length, header: `bytes=0-${length - 1}` }),
    Object.freeze({ label: 'mid', start: midStart, end: midStart + length - 1, length, header: `bytes=${midStart}-${midStart + length - 1}` }),
    Object.freeze({ label: 'tail', start: tailStart, end: size - 1, length, header: `bytes=${tailStart}-${size - 1}` })
  ]);
}

function safeVersion(value) {
  const text = String(value ?? 'unknown');
  return text.length <= 80 && /^[A-Za-z0-9._+-]+$/.test(text) ? text : 'redacted';
}

function normalizeVersions(value = {}) {
  return Object.freeze({
    tool: TOOL_VERSION,
    app: safeVersion(value.app),
    build: safeVersion(value.build),
    worker: safeVersion(value.worker)
  });
}

function parseContentRange(value) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(value || '').trim());
  if (!match) return null;
  const parsed = { start: Number(match[1]), end: Number(match[2]), size: Number(match[3]) };
  return Object.values(parsed).every(Number.isSafeInteger) ? parsed : null;
}

function parseContentLength(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function rangeValidation(response, requested, totalSize, receivedLength, bodyOverflow) {
  const contentRangeValue = response.headers.get('Content-Range');
  const contentLengthValue = response.headers.get('Content-Length');
  const contentRange = parseContentRange(contentRangeValue);
  const contentLength = parseContentLength(contentLengthValue);
  const reasons = [];
  let invalid = false;
  if (response.status !== 206) reasons.push(response.status === 200 ? 'range-ignored' : 'unexpected-status');
  if (response.status !== 206) invalid = true;
  if (!contentRange && response.status === 206) {
    if (contentRangeValue == null) reasons.push('content-range-not-exposed');
    else {
      reasons.push('invalid-content-range');
      invalid = true;
    }
  }
  if (contentRange && (
    contentRange.start !== requested.start
    || contentRange.end !== requested.end
    || contentRange.size !== totalSize
  )) {
    reasons.push('content-range-mismatch');
    invalid = true;
  }
  if (contentLength != null && contentLength !== requested.length) {
    reasons.push('content-length-mismatch');
    invalid = true;
  }
  if (contentLengthValue != null && contentLength == null) {
    reasons.push('invalid-content-length');
    invalid = true;
  }
  if (receivedLength !== requested.length) {
    reasons.push('body-length-mismatch');
    invalid = true;
  }
  if (bodyOverflow) {
    reasons.push('body-exceeds-requested-range');
    invalid = true;
  }
  const verdict = invalid ? 'invalid' : contentRange ? 'exact' : 'opaque';
  return Object.freeze({
    valid: verdict === 'exact' ? true : verdict === 'invalid' ? false : null,
    acceptable: verdict !== 'invalid',
    verdict,
    reasons: Object.freeze(reasons)
  });
}

function roundTiming(value) {
  return Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000;
}

async function readBoundedBody(response, maximumBytes, { signal, now }) {
  throwIfAborted(signal);
  if (!response.body?.getReader) {
    fail('BODY_UNAVAILABLE', 'The range response has no readable body.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let receivedLength = 0;
  let firstByteAt = null;
  let overflow = false;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    void reader.cancel(signal?.reason).catch(() => {});
    rejectAbort(signal?.reason?.name === 'AbortError' ? signal.reason : abortError());
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      throwIfAborted(signal);
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      if (chunk.byteLength && firstByteAt == null) firstByteAt = now();
      receivedLength += chunk.byteLength;
      if (receivedLength > maximumBytes) {
        overflow = true;
        await reader.cancel('bounded comparator limit reached').catch(() => {});
        break;
      }
      chunks.push(chunk);
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  const bytes = overflow ? null : new Uint8Array(receivedLength);
  let offset = 0;
  if (bytes) {
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  return { bytes, receivedLength, firstByteAt, overflow };
}

async function sha256(bytes, cryptoProvider) {
  if (!cryptoProvider?.subtle?.digest) fail('CRYPTO_UNAVAILABLE', 'SHA-256 is unavailable in this context.');
  const digest = new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function isResponseLike(value) {
  return value && Number.isInteger(value.status) && value.headers?.get && value.body;
}

async function inspectRoute(routeKey, routeLabel, reader, identity, requested, options) {
  const startedAt = options.now();
  let response = null;
  try {
    throwIfAborted(options.signal);
    const result = await reader(Object.freeze({ identity, range: requested, signal: options.signal }));
    response = result?.response || null;
    throwIfAborted(options.signal);
    if (!result || !isResponseLike(response)) {
      fail('INVALID_READER_RESULT', `${routeLabel} did not return a response and identity proof.`);
    }
    assertSameIdentity(identity, result.identity, routeLabel);
    const headersAt = options.now();
    const contentRange = response.headers.get('Content-Range');
    const contentLength = parseContentLength(response.headers.get('Content-Length'));
    if (response.status !== 206) {
      await response.body.cancel?.('non-partial response is not sampled').catch(() => {});
      const finishedAt = options.now();
      return Object.freeze({
        route: routeKey,
        status: response.status,
        requestedRange: requested.header,
        contentRange,
        declaredLength: contentLength,
        receivedLength: 0,
        timingsMs: Object.freeze({
          headers: roundTiming(headersAt - startedAt), firstByte: null,
          body: 0, total: roundTiming(finishedAt - startedAt)
        }),
        digest: null,
        range: rangeValidation(response, requested, identity.size, 0, false),
        identityValidated: true,
        error: null
      });
    }
    const body = await readBoundedBody(response, requested.length + 1, options);
    const finishedAt = options.now();
    throwIfAborted(options.signal);
    const digest = body.bytes ? await sha256(body.bytes, options.cryptoProvider) : null;
    throwIfAborted(options.signal);
    return Object.freeze({
      route: routeKey,
      status: response.status,
      requestedRange: requested.header,
      contentRange,
      declaredLength: contentLength,
      receivedLength: body.receivedLength,
      timingsMs: Object.freeze({
        headers: roundTiming(headersAt - startedAt),
        firstByte: body.firstByteAt == null ? null : roundTiming(body.firstByteAt - startedAt),
        body: roundTiming(finishedAt - headersAt),
        total: roundTiming(finishedAt - startedAt)
      }),
      digest,
      range: rangeValidation(response, requested, identity.size, body.receivedLength, body.overflow),
      identityValidated: true,
      error: null
    });
  } catch (error) {
    cancelResponseBody(response, error);
    if (error?.name === 'AbortError') throw error;
    if (error instanceof RangeComparatorError && error.code === 'IDENTITY_MISMATCH') throw error;
    const finishedAt = options.now();
    return Object.freeze({
      route: routeKey,
      status: null,
      requestedRange: requested.header,
      contentRange: null,
      declaredLength: null,
      receivedLength: 0,
      timingsMs: Object.freeze({ headers: null, firstByte: null, body: null, total: roundTiming(finishedAt - startedAt) }),
      digest: null,
      range: Object.freeze({
        valid: false, acceptable: false, verdict: 'invalid', reasons: Object.freeze(['reader-failure'])
      }),
      identityValidated: false,
      error: Object.freeze({ code: error instanceof RangeComparatorError ? error.code : 'READER_FAILURE' })
    });
  }
}

export function createIdentityBoundReader({ getIdentity, fetchRange }) {
  if (typeof getIdentity !== 'function' || typeof fetchRange !== 'function') {
    fail('INVALID_READER', 'getIdentity and fetchRange functions are required.');
  }
  return async ({ identity, range, signal }) => {
    throwIfAborted(signal);
    const before = normalizePrivateIdentity(await invokeWithAbort(
      () => getIdentity({ phase: 'before-fetch', signal }), signal
    ));
    assertSameIdentity(identity, before, 'reader-before-fetch');
    const response = await fetchRange({ identity, range: range.header, interval: range, signal });
    try {
      throwIfAborted(signal);
      const after = normalizePrivateIdentity(await invokeWithAbort(
        () => getIdentity({ phase: 'after-fetch', signal }), signal
      ));
      assertSameIdentity(identity, after, 'reader-after-fetch');
      return { response, identity: after };
    } catch (error) {
      cancelResponseBody(response, error);
      throw error;
    }
  };
}

export async function compareFrontMidTail({
  identity: identityValue,
  currentSwReader,
  independentApiReader,
  sampleBytes = 64 * 1024,
  versions = {},
  verifyIdentity,
  signal,
  now = () => performance.now(),
  cryptoProvider = globalThis.crypto
}) {
  if (typeof currentSwReader !== 'function' || typeof independentApiReader !== 'function') {
    fail('INVALID_READER', 'Both currentSwReader and independentApiReader are required.');
  }
  if (typeof now !== 'function') fail('INVALID_CLOCK', 'now must be a function.');
  const identity = normalizePrivateIdentity(identityValue);
  if (verifyIdentity != null && typeof verifyIdentity !== 'function') {
    fail('INVALID_IDENTITY_VERIFIER', 'verifyIdentity must be a function.');
  }
  if (verifyIdentity) {
    const before = await invokeWithAbort(() => verifyIdentity({ phase: 'before', signal }), signal);
    assertSameIdentity(identity, before, 'identity-verifier-before');
  }
  const ranges = createFrontMidTailRanges(identity.size, sampleBytes);
  const compared = [];
  const startedAt = now();
  for (const requested of ranges) {
    throwIfAborted(signal);
    const routes = {};
    for (const [routeKey, routeLabel] of ROUTES) {
      const reader = routeKey === 'currentSw' ? currentSwReader : independentApiReader;
      routes[routeKey] = await inspectRoute(routeKey, routeLabel, reader, identity, requested, {
        signal, now, cryptoProvider
      });
    }
    const left = routes.currentSw;
    const right = routes.independentApi;
    const comparable = left.identityValidated && right.identityValidated
      && left.range.acceptable && right.range.acceptable
      && left.status === 206 && right.status === 206
      && Boolean(left.digest) && Boolean(right.digest);
    compared.push(Object.freeze({
      label: requested.label,
      requestedRange: requested.header,
      currentSw: left,
      independentApi: right,
      equality: Object.freeze({
        comparable,
        bytesEqual: comparable ? left.receivedLength === right.receivedLength && left.digest === right.digest : null
      })
    }));
  }
  const equalCount = compared.filter((entry) => entry.equality.bytesEqual === true).length;
  const mismatchCount = compared.filter((entry) => entry.equality.bytesEqual === false).length;
  const inconclusiveCount = compared.filter((entry) => entry.equality.bytesEqual == null).length;
  const finishedAt = now();
  if (verifyIdentity) {
    const after = await invokeWithAbort(() => verifyIdentity({ phase: 'after', signal }), signal);
    assertSameIdentity(identity, after, 'identity-verifier-after');
  }
  const checkedValidators = ['accountKey', 'fileId', 'fileVersion', 'size', 'contentRevision', 'checksum', 'modifiedTime']
    .filter((field) => identity[field] != null);
  return Object.freeze({
    schema: 'drive-original.v2-03a-range-comparison/1',
    versions: normalizeVersions(versions),
    identity: Object.freeze({
      validated: compared.every((entry) => (
        entry.currentSw.identityValidated && entry.independentApi.identityValidated
      )),
      stable: Boolean(verifyIdentity),
      checked: Object.freeze(checkedValidators)
    }),
    sampleBytes: Number(sampleBytes),
    ranges: Object.freeze(compared),
    summary: Object.freeze({ equalCount, mismatchCount, inconclusiveCount, allEqual: equalCount === 3 }),
    totalMs: roundTiming(finishedAt - startedAt)
  });
}
