// Local-only top-level header walk. The caller owns exact bytes and identity.
const UINT64_MAX = (1n << 64n) - 1n;
const KNOWN_TYPES = new Set(['ftyp', 'styp', 'moov', 'mdat', 'moof', 'uuid', 'free', 'skip', 'wide']);

export const DEFAULT_LIMITS = Object.freeze({ maxBoxes: 128, maxHeaderBytes: 4096, maxRequests: 64 });

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
export async function scanIsoBmffTopLevel({ size: sizeValue, read, signal, limits: overrides } = {}) {
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
