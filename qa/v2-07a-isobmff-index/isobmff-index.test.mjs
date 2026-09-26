import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';
import test from 'node:test';
import { scanIsoBmffTopLevel, DEFAULT_LIMITS } from './isobmff-index.mjs';
import { runBoundedProbe } from '../v2-07a-bounded-probe/bounded-probe.mjs';

function integer(value, bytes) {
  const output = new Uint8Array(bytes);
  let remaining = BigInt(value);
  for (let i = bytes - 1; i >= 0; i -= 1) {
    output[i] = Number(remaining & 255n);
    remaining >>= 8n;
  }
  return output;
}

function header(type, size, { extended = false } = {}) {
  const bytes = new Uint8Array((extended ? 16 : 8) + (type === 'uuid' ? 16 : 0));
  bytes.set(integer(extended ? 1n : size, 4));
  bytes.set(Array.from(type, char => char.charCodeAt(0)), 4);
  if (extended) bytes.set(integer(size, 8), 8);
  return bytes;
}

// Reads are allowed ONLY where synthetic headers exist; a payload request fails.
function sparse(size, placements) {
  const ranges = [];
  const bytes = new Map();
  for (const [offset, value] of placements) {
    value.forEach((byte, i) => bytes.set(BigInt(offset) + BigInt(i), byte));
  }
  const read = async ({ start, end }) => {
    assert.equal(typeof start, 'bigint');
    assert.equal(typeof end, 'bigint');
    assert.ok(end >= start && end < BigInt(size));
    assert.ok(end - start + 1n <= 16n);
    ranges.push({ start, end });
    const result = [];
    for (let at = start; at <= end; at += 1n) {
      assert.ok(bytes.has(at), `unexpected payload read at ${at}`);
      result.push(bytes.get(at));
    }
    return Uint8Array.from(result);
  };
  return { read, ranges, size: String(size) };
}

async function walk(size, placements, options = {}) {
  const source = sparse(size, placements);
  return { result: await scanIsoBmffTopLevel({ ...source, ...options }), ranges: source.ranges };
}

function noClaims(result) {
  assert.deepEqual(result.claims, { containerValid: false, indexParsed: false, codecsParsed: false, decode: false, playback: false });
  assert.doesNotThrow(() => JSON.stringify(result));
}

for (const largeSize of [2n ** 32n + 19n, 2n ** 53n + 19n]) {
  for (const order of ['before', 'after']) {
    test(`moov ${order} sparse mdat of ${largeSize} bytes; header-only exact BigInt offsets`, async () => {
      const mdatAt = order === 'before' ? 40n : 24n;
      const moovAt = order === 'before' ? 24n : mdatAt + largeSize;
      const size = 24n + 16n + largeSize;
      const { result, ranges } = await walk(size, [
        [0n, header('ftyp', 24n)], [mdatAt, header('mdat', largeSize, { extended: true })],
        [moovAt, header('moov', 16n)]
      ]);
      assert.equal(result.status, 'complete');
      assert.equal(result.evidenceLevel, 'top-level-headers-complete');
      assert.equal(result.observations.ftypHeaderObserved, true);
      assert.equal(result.observations.moov[0].offset, String(moovAt));
      assert.equal(result.observations.moov[0].relativeToFirstObservedMdat, order);
      assert.equal(result.nextOffset, String(size));
      assert.equal(result.metrics.receivedHeaderBytes, 32);
      assert.equal(ranges.length, 4);
      noClaims(result);
    });
  }
}

test('styp/moof signal is header observation only, with unknown boxes and multiple mdat/moov', async () => {
  const { result } = await walk(64n, [
    [0n, header('styp', 8n)], [8n, header('moof', 8n)], [16n, header('zzzz', 16n)],
    [32n, header('moov', 8n)], [40n, header('mdat', 8n)],
    [48n, header('moov', 8n)], [56n, header('mdat', 8n)]
  ]);
  assert.equal(result.status, 'complete');
  assert.equal(result.observations.ftypHeaderObserved, false);
  assert.equal(result.observations.stypHeaderObserved, true);
  assert.equal(result.observations.moofHeaderObserved, true);
  assert.equal(result.boxes[2].type, 'unknown');
  assert.deepEqual(result.observations.moov.map(box => box.relativeToFirstObservedMdat), ['before', 'after']);
  noClaims(result);
});

for (const [label, size, placements, expectedBoxes] of [
  ['empty', 0n, [], 0],
  ['no ftyp', 8n, [[0n, header('free', 8n)]], 1],
  ['moov without mdat', 8n, [[0n, header('moov', 8n)]], 1]
]) {
  test(`${label}: EOF never claims valid container or index`, async () => {
    const { result } = await walk(size, placements);
    assert.equal(result.status, 'complete');
    assert.equal(result.boxes.length, expectedBoxes);
    assert.equal(result.observations.ftypHeaderObserved, false);
    if (label === 'moov without mdat') assert.equal(result.observations.moov[0].relativeToFirstObservedMdat, 'no-mdat-observed');
    noClaims(result);
  });
}

test('size zero skips to EOF without searching payload for a fake moov', async () => {
  const { result, ranges } = await walk(1000n, [[0n, header('mdat', 0n)], [500n, header('moov', 8n)]]);
  assert.equal(result.status, 'complete');
  assert.equal(result.boxes[0].sizeEncoding, 'to-eof');
  assert.equal(result.boxes[0].size, '1000');
  assert.deepEqual(result.observations.moov, []);
  assert.equal(ranges.length, 1);
});

for (const extended of [false, true]) {
  test(`uuid ${extended ? 'extended' : 'ordinary'} size reads only its full header`, async () => {
    const firstSize = extended ? 64n : 48n;
    const { result, ranges } = await walk(firstSize + 8n, [
      [0n, header('uuid', firstSize, { extended })], [firstSize, header('moov', 8n)]
    ]);
    assert.equal(result.status, 'complete');
    assert.equal(result.boxes[0].headerBytes, extended ? 32 : 24);
    assert.deepEqual(ranges.slice(0, extended ? 3 : 2), extended
      ? [{ start: 0n, end: 7n }, { start: 8n, end: 15n }, { start: 16n, end: 31n }]
      : [{ start: 0n, end: 7n }, { start: 8n, end: 23n }]);
  });
}

test('zero-size UUID requires its user-type header and then consumes EOF', async () => {
  const { result } = await walk(40n, [[0n, header('uuid', 0n)]]);
  assert.equal(result.status, 'complete');
  assert.equal(result.metrics.receivedHeaderBytes, 24);
});

for (const [label, size, placements, code] of [
  ['short first header', 7n, [], 'TRUNCATED_BASE_HEADER'],
  ['trailing bytes', 10n, [[0n, header('free', 8n)]], 'TRUNCATED_BASE_HEADER'],
  ['short extended header', 12n, [[0n, header('mdat', 16n, { extended: true }).subarray(0, 8)]], 'TRUNCATED_EXTENDED_HEADER'],
  ['small uint32', 8n, [[0n, header('mdat', 7n)]], 'BOX_SMALLER_THAN_HEADER'],
  ['small uint64', 16n, [[0n, header('mdat', 15n, { extended: true })]], 'BOX_SMALLER_THAN_HEADER'],
  ['zero largesize', 16n, [[0n, header('mdat', 0n, { extended: true })]], 'BOX_SMALLER_THAN_HEADER'],
  ['uuid too small', 24n, [[0n, header('uuid', 23n)]], 'BOX_SMALLER_THAN_HEADER'],
  ['uuid extended too small', 32n, [[0n, header('uuid', 31n, { extended: true })]], 'BOX_SMALLER_THAN_HEADER'],
  ['zero uuid short EOF', 23n, [[0n, header('uuid', 0n)]], 'BOX_SMALLER_THAN_HEADER'],
  ['uint32 past EOF', 8n, [[0n, header('mdat', 9n)]], 'BOX_BEYOND_EOF'],
  ['uint64 past EOF', 16n, [[0n, header('mdat', 2n ** 53n, { extended: true })]], 'BOX_BEYOND_EOF'],
  ['uuid past EOF', 16n, [[0n, header('uuid', 24n)]], 'BOX_BEYOND_EOF'],
  ['uint64 end overflow', (1n << 64n) - 1n, [[0n, header('free', 8n)], [8n, header('mdat', (1n << 64n) - 1n, { extended: true })]], 'BOX_END_OVERFLOW']
]) {
  test(`malformed bounds: ${label}`, async () => {
    const { result } = await walk(size, placements);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.code, code);
    assert.equal(result.category, 'malformed-header');
    noClaims(result);
  });
}

test('uint64 maximum valid EOF boundary is exact', async () => {
  const size = (1n << 64n) - 1n;
  const { result } = await walk(size, [[0n, header('mdat', size, { extended: true })]]);
  assert.equal(result.status, 'complete');
  assert.equal(result.nextOffset, String(size));
});

for (const [limits, code, requests] of [
  [{ maxBoxes: 1 }, 'BOX_LIMIT', 1],
  [{ maxHeaderBytes: 7 }, 'HEADER_BYTE_LIMIT', 0],
  [{ maxHeaderBytes: 15 }, 'HEADER_BYTE_LIMIT', 1],
  [{ maxRequests: 1 }, 'REQUEST_LIMIT', 1]
]) {
  test(`limits ${JSON.stringify(limits)} stop before excess request`, async () => {
    const { result, ranges } = await walk(24n, [[0n, header('free', 8n)], [8n, header('mdat', 16n, { extended: true })]], { limits });
    assert.equal(result.code, code);
    assert.equal(result.category, 'limit');
    assert.equal(ranges.length, requests);
  });
}

test('limit mid UUID does not report an accepted box', async () => {
  const { result } = await walk(32n, [[0n, header('uuid', 32n, { extended: true })]], { limits: { maxRequests: 2 } });
  assert.equal(result.code, 'REQUEST_LIMIT');
  assert.equal(result.boxes.length, 0);
  assert.equal(result.nextOffset, '0');
});

test('exact box/byte/request limit at EOF still completes', async () => {
  const { result } = await walk(8n, [[0n, header('free', 8n)]], { limits: { maxBoxes: 1, maxRequests: 1, maxHeaderBytes: 8 } });
  assert.equal(result.status, 'complete');
});

test('default cap stops a many-box file at 64 calls with explicit incomplete status', async () => {
  const placements = Array.from({ length: 65 }, (_, i) => [BigInt(i * 8), header('moof', 8n)]);
  const { result, ranges } = await walk(520n, placements);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.code, 'REQUEST_LIMIT');
  assert.equal(result.metrics.boxes, 64);
  assert.equal(result.metrics.requests, 64);
  assert.equal(result.metrics.receivedHeaderBytes, 512);
  assert.equal(result.nextOffset, '512');
  assert.equal(ranges.length, 64);
  noClaims(result);
});

test('hard defaults cannot be raised or disabled', async () => {
  for (const [key, maximum] of Object.entries(DEFAULT_LIMITS)) {
    for (const value of [0, -1, 1.5, Infinity, maximum + 1]) {
      const { result, ranges } = await walk(8n, [], { limits: { [key]: value } });
      assert.equal(result.code, 'INVALID_LIMITS');
      assert.equal(ranges.length, 0);
    }
  }
});

test('invalid sizes and arguments perform no reads', async () => {
  for (const size of [8, Number.MAX_SAFE_INTEGER + 1, -1n, '1.2', '-1', ' 8', '', '1e2', (1n << 64n), '0'.repeat(21), null]) {
    const result = await scanIsoBmffTopLevel({ size, read: () => assert.fail('must not read') });
    assert.equal(result.code, 'INVALID_SIZE');
  }
  assert.equal((await scanIsoBmffTopLevel({ size: '8' })).code, 'INVALID_ARGUMENT');
  assert.equal((await scanIsoBmffTopLevel({ size: '8', read() {}, signal: {} })).code, 'INVALID_ARGUMENT');
});

for (const [label, read, code] of [
  ['throw', () => { throw new Error('private URL/token must not leak'); }, 'READER_FAILURE'],
  ['reject', async () => { throw new Error('private URL/token must not leak'); }, 'READER_FAILURE'],
  ['short', () => new Uint8Array(7), 'READ_LENGTH_MISMATCH'],
  ['long', () => new Uint8Array(9), 'READ_LENGTH_MISMATCH'],
  ['wrong type', () => new ArrayBuffer(8), 'INVALID_READER_RESULT']
]) {
  test(`reader ${label} fails without echoing exception or bytes`, async () => {
    const result = await scanIsoBmffTopLevel({ size: 8n, read });
    assert.equal(result.code, code);
    assert.equal(result.category, 'reader');
    assert.equal(result.metrics.requests, 1);
    assert.equal(JSON.stringify(result).includes('private'), false);
  });
}

test('pre-aborted signal never dispatches read', async () => {
  const controller = new AbortController();
  controller.abort(new Error('private cancellation reason'));
  const result = await scanIsoBmffTopLevel({ size: 8n, signal: controller.signal, read: () => assert.fail('must not read') });
  assert.equal(result.code, 'ABORTED');
  assert.equal(result.metrics.requests, 0);
});

test('abort during pending read settles, prevents further reads, handles late rejection', async () => {
  const controller = new AbortController();
  let rejectRead;
  let started;
  const dispatched = new Promise(resolve => { started = resolve; });
  const pending = scanIsoBmffTopLevel({
    size: 16n, signal: controller.signal,
    read: () => new Promise((resolve, reject) => { rejectRead = reject; started(); })
  });
  await dispatched;
  controller.abort();
  const result = await pending;
  assert.equal(result.code, 'ABORTED');
  assert.equal(result.metrics.requests, 1);
  assert.equal(result.boxes.length, 0);
  rejectRead(new Error('late private reader failure'));
  await new Promise(resolve => setImmediate(resolve));
});

test('abort on resolved reader boundary discards bytes', async () => {
  const controller = new AbortController();
  const result = await scanIsoBmffTopLevel({ size: 8n, signal: controller.signal, read() {
    controller.abort();
    return header('free', 8n);
  } });
  assert.equal(result.code, 'ABORTED');
  assert.equal(result.boxes.length, 0);
});

for (const [name, expectedMoov, expectedOrder, expectedSize] of [
  ['faststart-h264-aac.mp4', '32', 'before', 202253],
  ['tail-index-h264-aac.mp4', '55314', 'after', 57944]
]) {
  test(`existing public QA seed ${name}: positional header reads only`, async () => {
    const file = await open(new URL(`../${name}`, import.meta.url), 'r');
    const ranges = [];
    try {
      assert.equal((await file.stat()).size, expectedSize);
      const result = await scanIsoBmffTopLevel({ size: String(expectedSize), read: async ({ start, end }) => {
        const bytes = new Uint8Array(Number(end - start + 1n));
        assert.ok(bytes.byteLength <= 16);
        ranges.push({ start, end });
        const { bytesRead } = await file.read(bytes, 0, bytes.length, Number(start));
        return bytes.subarray(0, bytesRead);
      } });
      assert.equal(result.status, 'complete');
      assert.equal(result.observations.moov[0].offset, expectedMoov);
      assert.equal(result.observations.moov[0].relativeToFirstObservedMdat, expectedOrder);
      assert.equal(result.metrics.receivedHeaderBytes, 32);
      const mdat = result.boxes.find(box => box.type === 'mdat');
      const payloadStart = BigInt(mdat.offset) + BigInt(mdat.headerBytes);
      assert.ok(ranges.every(range => range.end < payloadStart || range.start >= BigInt(mdat.endExclusive)));
      noClaims(result);
    } finally { await file.close(); }
  });
}

test('existing bounded core composes identity/HTTP contract with header-only report', async () => {
  const source = sparse(48n, [[0n, header('ftyp', 16n)], [16n, header('mdat', 16n)], [32n, header('moov', 16n)]]);
  const identity = { accountKey: 'synthetic-account', fileId: 'synthetic-file', version: '1', size: '48', modifiedTime: 'synthetic-time', mimeType: 'video/mp4', canDownload: true };
  const phases = [];
  const result = await runBoundedProbe({
    expectedIdentity: identity,
    getIdentity: ({ phase }) => { phases.push(phase); return identity; },
    generation: 1,
    readRange: async ({ start, end, range }) => ({
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/48`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' },
      bytes: await source.read({ start: BigInt(start), end: BigInt(end) })
    }),
    probe: ({ read, signal }) => scanIsoBmffTopLevel({ size: identity.size, read, signal, limits: { maxRequests: 64 } })
  });
  assert.equal(result.ok, true);
  assert.equal(result.evidence.status, 'complete');
  assert.equal(result.evidence.observations.moov[0].relativeToFirstObservedMdat, 'after');
  assert.deepEqual(phases, ['preflight', 'postflight']);
  assert.equal(result.metrics.receivedBytes, 24);
});

test('core postflight drift discards an otherwise complete header report', async () => {
  const identity = { accountKey: 'synthetic-account', fileId: 'synthetic-file', version: '1', size: '8', modifiedTime: 'synthetic-time', mimeType: 'video/mp4', canDownload: true };
  let headerReport;
  const result = await runBoundedProbe({
    expectedIdentity: identity,
    getIdentity: ({ phase }) => phase === 'postflight' ? { ...identity, version: '2' } : identity,
    generation: 1,
    readRange: async () => ({
      status: 206,
      headers: { 'Content-Range': 'bytes 0-7/8', 'Content-Length': '8', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' },
      bytes: header('moov', 8n)
    }),
    probe: async ({ read, signal }) => {
      headerReport = await scanIsoBmffTopLevel({ size: identity.size, read, signal });
      return headerReport;
    }
  });
  assert.equal(headerReport.status, 'complete');
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, 'POSTFLIGHT_DRIFT');
  assert.equal(result.evidence, null);
  assert.equal(result.identity.postflight, false);
});
