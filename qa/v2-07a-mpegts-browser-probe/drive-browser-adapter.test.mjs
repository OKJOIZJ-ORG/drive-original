import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createMpegTsBrowserProbe } from './drive-browser-adapter.mjs';
import { buildBrowserBundleText } from './build-browser-bundle.mjs';

const ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const OUTPUT_KEYS = [
  'aggregateAvailable',
  'audioProfileEvidenceCounts', 'audioSignallingCounts', 'complete', 'decodePerformed',
  'failureCount', 'failureCounts', 'magicRouteCounts', 'mpegTsOutcomeCounts',
  'mediaRelayUsed', 'mutationPerformed', 'nativeFetchUsed', 'persistencePerformed',
  'playbackPerformed', 'priority', 'processedCount', 'schema', 'selectedCount',
  'stableCount', 'successCount', 'totals', 'videoFormatEvidenceCounts',
  'videoProfileEvidenceCounts', 'videoSignallingCounts'
].sort();

function manifest(mutate) {
  const selected = Array.from({ length: 38 }, (_, index) => ({
    fileId: `private_file_${String(index).padStart(2, '0')}`,
    version: '1',
    size: '70000',
    modifiedTime: '2026-09-20T00:00:00.000Z',
    mimeType: 'video/mp4',
    extension: '.mp4',
    visibleReferences: [{
      fileId: `private_file_${String(index).padStart(2, '0')}`,
      resourceKey: null
    }],
    mandatoryReasons: index === 0 ? ['priority-sample'] : [],
    coveredCategories: [`fixture:${index}`]
  }));
  const value = {
    schema: 'drive-original.v2-07a-risk-selection-private/1',
    prioritySample: { fileId: selected[0].fileId, version: selected[0].version },
    selected
  };
  return mutate ? (mutate(value) ?? value) : value;
}

function metadataResponse(row, overrides = {}) {
  const resourceKey = row.visibleReferences.find((item) => item.resourceKey)?.resourceKey;
  return {
    ok: true,
    async json() {
      return {
        id: row.fileId,
        version: row.version,
        size: row.size,
        modifiedTime: row.modifiedTime,
        mimeType: row.mimeType,
        capabilities: { canDownload: true },
        trashed: false,
        ...(resourceKey ? { resourceKey } : {}),
        ...overrides
      };
    }
  };
}

function makeBytes(length, kind) {
  const bytes = new Uint8Array(length);
  if (kind === 'mpeg-ts' && length >= 377) {
    bytes[0] = 0x47;
    bytes[188] = 0x47;
    bytes[376] = 0x47;
  } else if (kind === 'iso-bmff' && length >= 8) {
    bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  } else if (kind === 'png' && length >= 8) {
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  return bytes;
}

function mediaResponse(url, options, kind = 'mpeg-ts') {
  const fileId = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
  const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
  assert.ok(match, `missing exact Range for ${fileId}`);
  const start = BigInt(match[1]);
  const end = BigInt(match[2]);
  const total = BigInt(options.expectedSize);
  const length = Number(end - start + 1n);
  return {
    status: 206,
    headers: new Headers({
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    }),
    bytes: makeBytes(length, kind)
  };
}

function targetParserResult() {
  return {
    outcome: { code: 'MPEG_TS_STRUCTURE_COMPLETE' },
    programs: [{
      streams: [
        {
          kind: 'video',
          codec: 'h264',
          codecFamily: 'h264',
          codecDetails: {
            status: 'parsed', profileIdc: 100, levelIdc: 30, width: 360, height: 640,
            color: {
              fullRange: false, primaries: 'BT.709', transfer: 'BT.709', matrix: 'BT.709'
            }
          }
        },
        {
          kind: 'audio',
          codec: 'aac',
          codecFamily: 'aac',
          codecDetails: { status: 'parsed', objectType: 2, sampleRate: 48_000, channels: 2 }
        }
      ]
    }]
  };
}

function fixture(input = manifest(), overrides = {}) {
  const calls = { inventory: [], selector: [], metadata: [], media: [], order: [] };
  const surface = {};
  const state = overrides.state ?? {
    accountId: 'PRIVATE_ACCOUNT_SENTINEL',
    driveSessionGeneration: 7,
    mediaSession: 12,
    selected: null,
    mediaAttempt: 'idle',
    mediaAbortController: null,
    pendingOriginalBuffer: null,
    pendingPlay: false,
    mediaTransportStarted: false
  };
  const rows = new Map(input.selected.map((row) => [row.fileId, row]));
  const listeners = new Map();
  const privateContext = {
    accountKey: state.accountId,
    rootId: 'private_root_fixture',
    priorityFileId: input.prioritySample.fileId,
    priorityVersion: input.prioritySample.version,
    generation: state.driveSessionGeneration,
    ...overrides.privateContext
  };
  let activeMedia = 0;
  let maxActiveMedia = 0;
  const driveFetch = overrides.driveFetch ?? (async (url, options = {}, retried, rateAttempt) => {
    const parsed = new URL(url);
    const fileId = decodeURIComponent(parsed.pathname.split('/').at(-1));
    const row = rows.get(fileId);
    if (parsed.pathname.startsWith('/__drive_media/')) {
      activeMedia += 1;
      maxActiveMedia = Math.max(maxActiveMedia, activeMedia);
      calls.order.push(`media:${fileId}`);
      calls.media.push({ url, options, retried, rateAttempt });
      await Promise.resolve();
      activeMedia -= 1;
      return mediaResponse(url, { ...options, expectedSize: row.size }, overrides.magicKind);
    }
    calls.order.push(`metadata:${fileId}`);
    calls.metadata.push({ url, options });
    return metadataResponse(row);
  });
  const runtime = {
    appVersion: '1.22.0-rc.4',
    driveFetch,
    nativeFetch: overrides.nativeFetch ?? driveFetch,
    driveMutationsEnabled: false,
    state,
    privateContext,
    location: { href: `${ORIGIN}/` },
    navigator: {
      serviceWorker: {
        controller: { scriptURL: `${ORIGIN}/sw.js`, state: 'activated' }
      }
    },
    top: surface,
    self: surface,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    ...overrides.runtime
  };
  const firstPass = { pass: 'first' };
  const secondPass = { pass: 'second' };
  const dependencies = {
    runAuthenticatedRootInventory: overrides.runAuthenticatedRootInventory ?? (async (options) => {
      calls.order.push('inventory');
      calls.inventory.push(options);
      return { report: {}, privatePasses: { firstPass, secondPass } };
    }),
    selectRiskRepresentatives: overrides.selectRiskRepresentatives ?? ((options) => {
      calls.order.push('selector');
      calls.selector.push(options);
      return { privateManifest: input, report: {} };
    }),
    probeMpegTs: overrides.probeMpegTs ?? targetParserResult
  };
  return {
    calls,
    dependencies,
    firstPass,
    get maxActiveMedia() { return maxActiveMedia; },
    input,
    listeners,
    runtime,
    secondPass,
    state,
    adapter: createMpegTsBrowserProbe(runtime, dependencies)
  };
}

function assertRuntimeRejected(mutate) {
  return async () => {
    const context = fixture();
    mutate(context.runtime);
    const adapter = createMpegTsBrowserProbe(context.runtime, context.dependencies);
    const result = await adapter.runPrivateMpegTsProbe();
    assert.equal(result.complete, false);
    assert.equal(result.failureCounts.RUNTIME_REJECTED, 1);
    assert.equal(context.calls.inventory.length, 0);
    assert.equal(context.calls.metadata.length, 0);
    assert.equal(context.calls.media.length, 0);
  };
}

test('recomputes fresh inventory and exact 38-row selection without a caller manifest', async () => {
  const context = fixture();
  const result = await context.adapter.runPrivateMpegTsProbe({
    fileId: 'CALLER_ID_MUST_BE_IGNORED',
    manifest: { selected: [] }
  });
  assert.deepEqual(context.calls.order.slice(0, 3), [
    'inventory', 'selector', 'metadata:private_file_00'
  ]);
  assert.equal(context.calls.inventory.length, 1);
  assert.equal(context.calls.selector.length, 1);
  assert.equal(context.calls.selector[0].pass, context.secondPass);
  assert.equal(result.selectedCount, 38);
  assert.equal(result.processedCount, 38);
  assert.equal(result.stableCount, 38);
});

test('pins rc.4, HTTPS origin, top-level, mutation-off, account and activated exact /sw.js', async (t) => {
  const cases = [
    ['version', (runtime) => { runtime.appVersion = '1.22.0-rc.5'; }],
    ['protocol', (runtime) => { runtime.location = { href: ORIGIN.replace('https:', 'http:') }; }],
    ['origin', (runtime) => { runtime.location = { href: 'https://example.invalid/' }; }],
    ['top', (runtime) => { runtime.top = {}; }],
    ['mutations', (runtime) => { runtime.driveMutationsEnabled = true; }],
    ['native fetch', (runtime) => { runtime.nativeFetch = null; }],
    ['reserved media session', (runtime) => { runtime.state.mediaSession = Number.MAX_SAFE_INTEGER; }],
    ['account', (runtime) => { runtime.state.accountId = ''; }],
    ['generation', (runtime) => { runtime.state.driveSessionGeneration = -1; }],
    ['controller', (runtime) => { runtime.navigator.serviceWorker.controller = null; }],
    ['controller state', (runtime) => { runtime.navigator.serviceWorker.controller.state = 'redundant'; }],
    ['controller path', (runtime) => { runtime.navigator.serviceWorker.controller.scriptURL = `${ORIGIN}/other.js`; }]
  ];
  for (const [name, mutate] of cases) await t.test(name, assertRuntimeRejected(mutate));
});

test('pins every media-idle field before any inventory or byte request', async (t) => {
  const cases = [
    ['selected', {}], ['mediaAttempt', 'range'], ['mediaAbortController', {}],
    ['pendingOriginalBuffer', {}], ['pendingPlay', true], ['mediaTransportStarted', true]
  ];
  for (const [field, value] of cases) {
    await t.test(field, assertRuntimeRejected((runtime) => { runtime.state[field] = value; }));
  }
});

test('uses one serial exact 0-65535 same-origin SW read per row and caps the full batch', async () => {
  const context = fixture();
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(context.calls.media.length, 38);
  assert.equal(context.maxActiveMedia, 1);
  assert.equal(result.totals.requests, 38);
  assert.equal(result.totals.receivedBytes, 2_490_368);
  assert.equal(result.totals.uniqueBytes, 2_490_368);
  for (const call of context.calls.media) {
    const url = new URL(call.url);
    assert.equal(url.origin, ORIGIN);
    assert.ok(url.pathname.startsWith('/__drive_media/'));
    assert.equal(url.searchParams.get('accountGeneration'), '7');
    assert.equal(url.searchParams.get('mediaSession'), String(Number.MAX_SAFE_INTEGER));
    assert.equal(url.searchParams.get('sourceGeneration'), String(Number.MAX_SAFE_INTEGER));
    assert.equal(url.searchParams.get('size'), '70000');
    assert.equal(call.options.headers.Range, 'bytes=0-65535');
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.mode, 'same-origin');
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.retried, undefined);
    assert.equal(call.rateAttempt, undefined);
    assert.equal(call.options.signal instanceof AbortSignal, true);
    assert.equal(url.searchParams.has('alt'), false);
  }
});

test('closes the sole range at EOF and never issues a second read', async () => {
  const input = manifest((value) => { value.selected[0].size = '100'; });
  const context = fixture(input, { magicKind: 'iso-bmff' });
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(context.calls.media[0].options.headers.Range, 'bytes=0-99');
  assert.equal(context.calls.media.slice(1).every((call) => call.options.headers.Range === 'bytes=0-65535'), true);
  assert.equal(context.calls.media.length, 38);
  assert.equal(result.totals.requests, 38);
  assert.equal(result.totals.receivedBytes, 37 * 65_536 + 100);
});

test('routes by magic and calls the MPEG-TS parser only for the MPEG-TS route', async () => {
  let parseCalls = 0;
  const iso = fixture(manifest(), {
    magicKind: 'iso-bmff',
    probeMpegTs() { parseCalls += 1; return targetParserResult(); }
  });
  const result = await iso.adapter.runPrivateMpegTsProbe();
  assert.equal(parseCalls, 0);
  assert.equal(result.magicRouteCounts['iso-bmff'], 38);
  assert.equal(Object.values(result.mpegTsOutcomeCounts).reduce((sum, value) => sum + value, 0), 0);
});

test('requires three aligned 188-byte sync bytes before entering the MPEG-TS parser', async () => {
  let parseCalls = 0;
  const input = manifest();
  let context;
  context = fixture(input, {
    driveFetch: async (url, options = {}) => {
      const parsed = new URL(url);
      const id = decodeURIComponent(parsed.pathname.split('/').at(-1));
      const row = input.selected.find((entry) => entry.fileId === id);
      if (!parsed.pathname.startsWith('/__drive_media/')) return metadataResponse(row);
      context.calls.media.push({ url, options });
      const response = mediaResponse(url, { ...options, expectedSize: row.size }, 'mpeg-ts');
      response.bytes[376] = 0;
      return response;
    },
    probeMpegTs() { parseCalls += 1; return targetParserResult(); }
  });
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(parseCalls, 0);
  assert.equal(result.magicRouteCounts.unknown, 38);
  assert.equal(result.magicRouteCounts['mpeg-ts'], 0);
});

test('publishes only fixed MPEG-TS signalling, profile, format and audio evidence buckets', async () => {
  let parserLimits;
  const context = fixture(manifest(), {
    probeMpegTs(_bytes, options) {
      parserLimits = options.limits;
      return targetParserResult();
    }
  });
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(result.magicRouteCounts['mpeg-ts'], 38);
  assert.equal(result.mpegTsOutcomeCounts.MPEG_TS_STRUCTURE_COMPLETE, 38);
  assert.equal(result.videoSignallingCounts['target-only'], 38);
  assert.equal(result.audioSignallingCounts['target-only'], 38);
  assert.equal(result.videoProfileEvidenceCounts['target-confirmed'], 38);
  assert.equal(result.videoFormatEvidenceCounts['target-confirmed'], 38);
  assert.equal(result.audioProfileEvidenceCounts['target-confirmed'], 38);
  assert.deepEqual(parserLimits, {
    maxBytes: 65_536,
    maxPackets: 348,
    maxResyncBytes: 1_504,
    maxSectionBytes: 1_024,
    maxSections: 128,
    maxPrograms: 64,
    maxStreamsPerProgram: 64,
    maxTotalStreams: 128,
    maxElementaryBytesPerStream: 32_768,
    maxIssues: 64
  });
});

test('publishes a fixed redacted one-row aggregate for the internally verified priority sample', async () => {
  const input = manifest((value) => {
    value.prioritySample = {
      fileId: value.selected[17].fileId,
      version: value.selected[17].version
    };
  });
  let context;
  context = fixture(input, {
    driveFetch: async (url, options = {}) => {
      const parsed = new URL(url);
      const id = decodeURIComponent(parsed.pathname.split('/').at(-1));
      const row = input.selected.find((entry) => entry.fileId === id);
      if (!parsed.pathname.startsWith('/__drive_media/')) return metadataResponse(row);
      context.calls.media.push({ url, options });
      const kind = id === input.prioritySample.fileId ? 'png' : 'mpeg-ts';
      return mediaResponse(url, { ...options, expectedSize: row.size }, kind);
    }
  });
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(result.magicRouteCounts.png, 1);
  assert.equal(result.magicRouteCounts['mpeg-ts'], 37);
  assert.equal(result.priority.selectedCount, 1);
  assert.equal(result.priority.processedCount, 1);
  assert.equal(result.priority.stableCount, 1);
  assert.equal(result.priority.successCount, 1);
  assert.equal(result.priority.magicRouteCounts.png, 1);
  assert.equal(result.priority.magicRouteCounts['mpeg-ts'], 0);
  assert.equal(Object.values(result.priority.mpegTsOutcomeCounts).reduce((sum, count) => sum + count, 0), 0);
  assert.deepEqual(result.priority.totals, {
    requests: 1, receivedBytes: 65_536, uniqueBytes: 65_536
  });
  assert.equal(JSON.stringify(result.priority).includes(input.prioritySample.fileId), false);
});

test('maps malformed or throwing parser output to one fixed redacted outcome', async (t) => {
  for (const [name, parser] of [
    ['invalid result', () => ({ privatePid: 256 })],
    ['throw', () => { throw new Error('PRIVATE_RAW_ERROR_SENTINEL'); }]
  ]) {
    await t.test(name, async () => {
      const context = fixture(manifest(), { probeMpegTs: parser });
      const result = await context.adapter.runPrivateMpegTsProbe();
      assert.equal(result.mpegTsOutcomeCounts.PARSER_RESULT_INVALID, 38);
      assert.equal(JSON.stringify(result).includes('PRIVATE_RAW_ERROR_SENTINEL'), false);
      assert.equal(JSON.stringify(result).includes('privatePid'), false);
    });
  }
});

test('incomplete or malformed structure never promotes parsed detail evidence', async (t) => {
  for (const outcome of ['MALFORMED_MPEG_TS', 'TRUNCATED_MPEG_TS', 'PROBE_LIMIT_REACHED',
    'UNSUPPORTED_TS_FEATURE', 'PSI_NOT_COMPLETE']) {
    await t.test(outcome, async () => {
      const context = fixture(manifest(), {
        probeMpegTs: () => ({ ...targetParserResult(), outcome: { code: outcome } })
      });
      const result = await context.adapter.runPrivateMpegTsProbe();
      assert.equal(result.mpegTsOutcomeCounts[outcome], 38);
      assert.equal(result.videoSignallingCounts['target-only'], 38);
      for (const counts of [result.videoProfileEvidenceCounts, result.videoFormatEvidenceCounts,
        result.audioProfileEvidenceCounts]) {
        assert.equal(counts['target-confirmed'], 0);
        assert.equal(counts['other-parsed'], 0);
        assert.equal(counts.inconclusive, 38);
      }
    });
  }
});

test('metadata and body requests use separate transports and resource keys stay private', async () => {
  const input = manifest((value) => {
    value.selected[0].visibleReferences[0].resourceKey = 'PRIVATE_KEY';
  });
  const context = fixture(input);
  const originalMetadataFetch = context.runtime.driveFetch;
  context.runtime.driveFetch = (url, ...args) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://www.googleapis.com');
    assert.equal(parsed.searchParams.has('alt'), false);
    return originalMetadataFetch(url, ...args);
  };
  const adapter = createMpegTsBrowserProbe(context.runtime, context.dependencies);
  const result = await adapter.runPrivateMpegTsProbe();
  assert.equal(result.successCount, 38);
  assert.equal(new URL(context.calls.media[0].url).searchParams.get('resourceKey'), 'PRIVATE_KEY');
  assert.equal(result.nativeFetchUsed, true);
  assert.equal(result.mediaRelayUsed, false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_KEY'), false);
});

test('whole-run request cap stops inventory before request 513', async () => {
  let requests = 0;
  const context = fixture(manifest(), {
    driveFetch: async () => {
      requests += 1;
      return { ok: true, json: async () => ({}) };
    },
    runAuthenticatedRootInventory: async ({ driveFetch }) => {
      for (let index = 0; index < 513; index += 1) {
        const response = await driveFetch('https://www.googleapis.com/drive/v3/about');
        await response.json();
      }
      throw new Error('cap failed');
    }
  });
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(requests, 512);
  assert.equal(result.failureCounts.REQUEST_LIMIT, 1);
  assert.equal(result.nativeFetchUsed, false);
  assert.equal(context.listeners.size, 0);
});

test('inventory response owns the serial request slot until JSON settles', async () => {
  let requests = 0;
  const context = fixture(manifest(), {
    driveFetch: async () => {
      requests += 1;
      return { ok: true, json: async () => ({}) };
    },
    runAuthenticatedRootInventory: async ({ driveFetch }) => {
      await driveFetch('https://www.googleapis.com/drive/v3/about');
      await driveFetch('https://www.googleapis.com/drive/v3/about');
    }
  });
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(requests, 1);
  assert.equal(result.failureCounts.REQUEST_POLICY_REJECTED, 1);
  assert.equal(context.listeners.size, 0);
});

test('the same request ceiling covers inventory, identity checks and media dispatches', async () => {
  const context = fixture();
  const adapter = createMpegTsBrowserProbe(context.runtime, {
    ...context.dependencies,
    runAuthenticatedRootInventory: async ({ driveFetch }) => {
      for (let index = 0; index < 399; index += 1) {
        const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${context.input.selected[0].fileId}`);
        await response.json();
      }
      return { privatePasses: { firstPass: context.firstPass, secondPass: context.secondPass } };
    }
  });
  const result = await adapter.runPrivateMpegTsProbe();
  assert.equal(context.calls.metadata.length + context.calls.media.length, 512);
  assert.equal(context.calls.media.length, 38);
  assert.equal(result.failureCounts.REQUEST_LIMIT, 1);
  assert.equal(result.complete, false);
  assert.equal(result.nativeFetchUsed, true);
  assert.equal(context.listeners.size, 0);
});

test('ten-minute whole-run timeout releases hung inventory JSON and listeners', async () => {
  let triggerTimeout;
  let jsonStarted;
  let timerCleared = false;
  const started = new Promise((resolve) => { jsonStarted = resolve; });
  const context = fixture(manifest(), {
    driveFetch: async () => ({ ok: true, json() { jsonStarted(); return new Promise(() => {}); } }),
    runAuthenticatedRootInventory: async ({ driveFetch }) => {
      const response = await driveFetch('https://www.googleapis.com/drive/v3/about');
      await response.json();
    }
  });
  const adapter = createMpegTsBrowserProbe(context.runtime, {
    ...context.dependencies,
    setTimeoutFn(callback, ms) {
      assert.equal(ms, 600_000);
      triggerTimeout = callback;
      return 123;
    },
    clearTimeoutFn(id) { assert.equal(id, 123); timerCleared = true; }
  });
  const pending = adapter.runPrivateMpegTsProbe();
  await started;
  triggerTimeout();
  const result = await pending;
  assert.equal(result.failureCounts.RUN_TIMEOUT, 1);
  assert.equal(result.aggregateAvailable, false);
  assert.equal(context.listeners.size, 0);
  assert.equal(timerCleared, true);
});

test('suppresses all parsed evidence when postflight identity drifts and stops before row two', async () => {
  const input = manifest();
  let firstMetadataReads = 0;
  let context;
  context = fixture(input, {
    driveFetch: async (url, options = {}) => {
      const parsed = new URL(url);
      const id = decodeURIComponent(parsed.pathname.split('/').at(-1));
      const row = input.selected.find((entry) => entry.fileId === id);
      if (parsed.pathname.startsWith('/__drive_media/')) {
        context.calls.media.push({ url, options });
        return mediaResponse(url, { ...options, expectedSize: row.size });
      }
      context.calls.metadata.push({ url, options });
      if (id === input.selected[0].fileId) firstMetadataReads += 1;
      return metadataResponse(row, firstMetadataReads === 2 ? { version: '2' } : {});
    }
  });
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(result.complete, false);
  assert.equal(result.processedCount, 1);
  assert.equal(result.stableCount, 0);
  assert.equal(result.successCount, 0);
  assert.equal(result.failureCounts.POSTFLIGHT_DRIFT, 1);
  assert.equal(result.magicRouteCounts['mpeg-ts'], 0);
  assert.equal(result.mpegTsOutcomeCounts.MPEG_TS_STRUCTURE_COMPLETE, 0);
  assert.equal(result.totals.uniqueBytes, 0);
  assert.equal(result.priority.processedCount, 1);
  assert.equal(result.priority.stableCount, 0);
  assert.equal(result.priority.failureCounts.POSTFLIGHT_DRIFT, 1);
  assert.equal(result.priority.magicRouteCounts['mpeg-ts'], 0);
  assert.equal(context.calls.media.length, 1);
});

test('generation and controller drift suppress publication and prevent the next body', async (t) => {
  for (const [name, drift] of [
    ['generation', (context) => { context.state.driveSessionGeneration += 1; }],
    ['account', (context) => { context.state.accountId = 'OTHER_ACCOUNT'; }],
    ['controller', (context) => { context.runtime.navigator.serviceWorker.controller = { scriptURL: `${ORIGIN}/sw.js`, state: 'activated' }; }],
    ['media owner', (context) => { context.state.pendingPlay = true; }]
  ]) {
    await t.test(name, async () => {
      const input = manifest();
      let context;
      context = fixture(input, {
        driveFetch: async (url, options = {}) => {
          const parsed = new URL(url);
          const id = decodeURIComponent(parsed.pathname.split('/').at(-1));
          const row = input.selected.find((entry) => entry.fileId === id);
          if (parsed.pathname.startsWith('/__drive_media/')) {
            context.calls.media.push({ url, options });
            drift(context);
            return mediaResponse(url, { ...options, expectedSize: row.size });
          }
          context.calls.metadata.push({ url, options });
          return metadataResponse(row);
        }
      });
      const result = await context.adapter.runPrivateMpegTsProbe();
      assert.equal(result.processedCount, 0);
      assert.equal(result.failureCounts.GENERATION_STALE, 1);
      assert.equal(result.magicRouteCounts['mpeg-ts'], 0);
      assert.equal(context.calls.media.length, 1);
    });
  }
});

test('pagehide is terminal, removes lifecycle listeners and prevents row two', async () => {
  const input = manifest();
  let mediaStarted;
  const started = new Promise((resolve) => { mediaStarted = resolve; });
  let context;
  context = fixture(input, {
    driveFetch: async (url, options = {}) => {
      const parsed = new URL(url);
      const id = decodeURIComponent(parsed.pathname.split('/').at(-1));
      const row = input.selected.find((entry) => entry.fileId === id);
      if (parsed.pathname.startsWith('/__drive_media/')) {
        context.calls.media.push({ url, options });
        mediaStarted();
        return new Promise(() => {});
      }
      context.calls.metadata.push({ url, options });
      return metadataResponse(row);
    }
  });
  const pending = context.adapter.runPrivateMpegTsProbe();
  await started;
  context.listeners.get('pagehide')();
  const result = await pending;
  assert.equal(result.failureCounts.ABORTED, 1);
  assert.equal(result.aggregateAvailable, false);
  assert.equal(result.nativeFetchUsed, true);
  assert.equal(result.processedCount, 0);
  assert.equal(context.calls.media.length, 1);
  assert.equal(context.listeners.size, 0);
});

test('synchronously claims one shot and cleans listeners after a successful run', async () => {
  let releaseInventory;
  const gate = new Promise((resolve) => { releaseInventory = resolve; });
  let context;
  context = fixture(manifest(), {
    runAuthenticatedRootInventory: async () => {
      await gate;
      return { report: {}, privatePasses: { firstPass: context.firstPass, secondPass: context.secondPass } };
    }
  });
  const first = context.adapter.runPrivateMpegTsProbe();
  const concurrent = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(concurrent.failureCounts.RUN_ALREADY_CLAIMED, 1);
  assert.equal(context.calls.media.length, 0);
  releaseInventory();
  const completed = await first;
  assert.equal(completed.complete, true);
  assert.equal(context.listeners.size, 0);
  const repeated = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(repeated.failureCounts.RUN_ALREADY_CLAIMED, 1);
  assert.equal(context.calls.media.length, 38);
});

test('never calls mutation, persistence or player sentinels and never writes media state', async () => {
  let mediaSessionWrites = 0;
  let selectedWrites = 0;
  const state = {
    accountId: 'PRIVATE_ACCOUNT_SENTINEL',
    driveSessionGeneration: 7,
    mediaAttempt: 'idle',
    mediaAbortController: null,
    pendingOriginalBuffer: null,
    pendingPlay: false,
    mediaTransportStarted: false,
    get mediaSession() { return 12; },
    set mediaSession(_) { mediaSessionWrites += 1; },
    get selected() { return null; },
    set selected(_) { selectedWrites += 1; }
  };
  const sentinels = { mutation: 0, persistence: 0, player: 0 };
  const context = fixture(manifest(), {
    state,
    runtime: {
      mutateDrive() { sentinels.mutation += 1; },
      persist() { sentinels.persistence += 1; },
      openPlayer() { sentinels.player += 1; }
    }
  });
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.equal(result.successCount, 38);
  assert.deepEqual(sentinels, { mutation: 0, persistence: 0, player: 0 });
  assert.equal(context.calls.media.length, 38);
  assert.equal(mediaSessionWrites, 0);
  assert.equal(selectedWrites, 0);
});

test('returns a fixed aggregate shape with no IDs, names, paths, keys, PIDs or raw errors', async () => {
  const input = manifest((value) => {
    value.selected[0].fileId = 'PRIVATE_ID_SENTINEL';
    value.prioritySample.fileId = 'PRIVATE_ID_SENTINEL';
    value.selected[0].visibleReferences = [{
      fileId: 'PRIVATE_SHORTCUT_SENTINEL', resourceKey: 'PRIVATE_RESOURCE_KEY_SENTINEL'
    }];
  });
  const context = fixture(input, { probeMpegTs: () => targetParserResult() });
  const result = await context.adapter.runPrivateMpegTsProbe();
  assert.deepEqual(Object.keys(result).sort(), OUTPUT_KEYS);
  assert.equal(result.aggregateAvailable, true);
  assert.equal(result.decodePerformed, false);
  assert.equal(result.playbackPerformed, false);
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.persistencePerformed, false);
  assert.equal(result.nativeFetchUsed, true);
  assert.equal(result.mediaRelayUsed, false);
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'PRIVATE_ID_SENTINEL', 'PRIVATE_SHORTCUT_SENTINEL', 'PRIVATE_RESOURCE_KEY_SENTINEL',
    'PRIVATE_ACCOUNT_SENTINEL', 'video/mp4', ORIGIN, 'bytes=', 'pid', 'path', 'name'
  ]) assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
});

test('bundle build is deterministic, private and binds the proven same-origin SW transport', async () => {
  const first = await buildBrowserBundleText();
  const second = await buildBrowserBundleText();
  assert.equal(first, second);
  assert.match(first, /const mpegTsProbeCore = \(\(\) => \{/);
  assert.match(first, /Object\.defineProperty\(globalThis, 'runPrivateMpegTsProbe'/);
  assert.equal((first.match(/Object\.defineProperty\(globalThis/g) || []).length, 1);
  assert.doesNotMatch(first, /globalThis\.(?:probeMpegTs|runBoundedProbeBatch|createMpegTsBrowserProbe)\s*=/);
  assert.match(first, /nativeFetch: typeof globalThis\.fetch === 'function' \? globalThis\.fetch\.bind\(globalThis\)/);
  assert.match(first, /\/__drive_media\//);
  assert.doesNotMatch(first, /searchParams\.set\('alt', 'media'\)/);
  assert.match(first, /driveFetch: typeof driveFetch === 'function'/);
  assert.match(first, /delete globalThis\.runPrivateMpegTsProbe/);
  assert.match(first, /delete globalThis\.__v207aPrivateContext/);
});

test('browser global has zero arguments and deletes itself and private context synchronously', async () => {
  const bundle = await buildBrowserBundleText();
  const sandbox = {
    URL, AbortController, DOMException, Headers, TextDecoder, performance, structuredClone,
    location: { href: `${ORIGIN}/` },
    navigator: { serviceWorker: { controller: { scriptURL: `${ORIGIN}/sw.js`, state: 'activated' } } },
    addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
    fetch() { throw new Error('network must not run'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(`
    globalThis.top = globalThis;
    globalThis.self = globalThis;
    globalThis.__v207aPrivateContext = null;
    const APP_VERSION = '1.22.0-rc.4';
    const DRIVE_MUTATIONS_ENABLED = false;
    const state = {
      accountId: 'account', driveSessionGeneration: 1, mediaSession: 1,
      selected: null, mediaAttempt: 'idle', mediaAbortController: null,
      pendingOriginalBuffer: null, pendingPlay: false, mediaTransportStarted: false
    };
    async function driveFetch() { throw new Error('network must not run'); }
    ${bundle}
  `, sandbox);
  const descriptor = Object.getOwnPropertyDescriptor(sandbox, 'runPrivateMpegTsProbe');
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.configurable, true);
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.value.length, 0);
  const first = descriptor.value({ fileId: 'CALLER_ID_SENTINEL' });
  assert.equal(Object.hasOwn(sandbox, 'runPrivateMpegTsProbe'), false);
  assert.equal(Object.hasOwn(sandbox, '__v207aPrivateContext'), false);
  const concurrent = await descriptor.value({ manifest: 'CALLER_MANIFEST_SENTINEL' });
  assert.equal(concurrent.failureCounts.RUN_ALREADY_CLAIMED, 1);
  const result = await first;
  assert.equal(result.failureCounts.PRIVATE_CONTEXT_INVALID, 1);
  assert.equal(JSON.stringify(result).includes('CALLER_ID_SENTINEL'), false);
});
