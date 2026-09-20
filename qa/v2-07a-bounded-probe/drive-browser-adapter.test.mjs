import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createDriveBrowserAdapter } from './drive-browser-adapter.mjs';
import { buildBrowserBundleText } from './build-browser-bundle.mjs';

const ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const EXPECTED_OUTPUT_KEYS = [
  'complete', 'decodeClaimed', 'expectedCount', 'failureCount', 'failureCounts',
  'magicCounts', 'playbackClaimed', 'postflightPassedCount', 'preflightPassedCount',
  'processedCount', 'schema', 'successCount', 'totals'
].sort();

test('tracked live evidence is aggregate-only and internally consistent', async () => {
  const raw = await readFile(new URL('./results.redacted.json', import.meta.url), 'utf8');
  const evidence = JSON.parse(raw);
  const aggregate = evidence.aggregate;
  const forbiddenKeys = new Set([
    'accessToken', 'accountKey', 'authorization', 'cookie', 'email', 'fileId',
    'fileName', 'name', 'path', 'refreshToken', 'resourceKey', 'token', 'url'
  ]);

  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbiddenKeys.has(key), false, `private evidence key: ${key}`);
      visit(child);
    }
  };
  visit(evidence);

  assert.equal(evidence.schema, 'drive-original.v2-07a-front-sniff-evidence-redacted/1');
  assert.equal(aggregate.schema, 'drive-original.v2-07a-front-sniff-aggregate/1');
  assert.equal(aggregate.complete, true);
  assert.equal(aggregate.processedCount, aggregate.expectedCount);
  assert.equal(aggregate.successCount + aggregate.failureCount, aggregate.expectedCount);
  assert.equal(Object.values(aggregate.magicCounts).reduce((sum, count) => sum + count, 0), aggregate.successCount);
  assert.equal(Object.values(aggregate.failureCounts).reduce((sum, count) => sum + count, 0), aggregate.failureCount);
  assert.deepEqual(aggregate.failureCounts, { IDENTITY_MISMATCH: 1 });
  assert.equal(aggregate.totals.requests, aggregate.successCount);
  assert.equal(aggregate.totals.receivedBytes, aggregate.totals.uniqueBytes);
  assert.ok(aggregate.totals.receivedBytes <= evidence.limits.frontBytesPerEligibleFile * aggregate.successCount);
  assert.equal(aggregate.decodeClaimed, false);
  assert.equal(aggregate.playbackClaimed, false);
  assert.equal(evidence.execution.driveMutations, 0);
  assert.equal(evidence.execution.decodeAttempts, 0);
  assert.equal(evidence.execution.playbackAttempts, 0);
  assert.equal(evidence.limitations.identityMismatchBodyRead, false);
  assert.equal(evidence.limitations.identityMismatchCauseResolved, false);
});

function manifest(overrides = {}) {
  const selected = Array.from({ length: 38 }, (_, index) => ({
    fileId: `private_file_${String(index).padStart(2, '0')}`,
    version: '1',
    size: '70000',
    modifiedTime: '2026-09-20T00:00:00.000Z',
    mimeType: 'video/mp4',
    extension: '.mp4',
    visibleReferences: [{ fileId: `private_file_${String(index).padStart(2, '0')}`, resourceKey: null }],
    mandatoryReasons: index === 0 ? ['priority-sample'] : [],
    coveredCategories: [`fixture:${index}`]
  }));
  const value = {
    schema: 'drive-original.v2-07a-risk-selection-private/1',
    prioritySample: { fileId: selected[0].fileId, version: selected[0].version },
    selected
  };
  if (!overrides.mutate) return value;
  const mutated = structuredClone(value);
  return overrides.mutate(mutated) ?? mutated;
}

function metadataResponse(body, ok = true) {
  return {
    ok,
    async json() { return structuredClone(body); }
  };
}

function mediaResponse(url, options, kind = 'iso-bmff') {
  const parsed = new URL(url);
  const total = BigInt(parsed.searchParams.get('size'));
  const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
  assert.ok(match);
  const start = BigInt(match[1]);
  const end = BigInt(match[2]);
  const length = Number(end - start + 1n);
  const bytes = new Uint8Array(length);
  if (kind === 'iso-bmff' && length >= 8) bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  if (kind === 'png' && length >= 8) bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    status: 206,
    headers: new Headers({
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    }),
    bytes
  };
}

function fixture(inputManifest = manifest(), overrides = {}) {
  const calls = { metadata: [], media: [], inventory: [], selector: [], order: [] };
  const surface = {};
  const state = overrides.state || {
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
  const rows = new Map(inputManifest.selected.map((row) => [row.fileId, row]));
  const listeners = new Map();
  const privateContext = {
    accountKey: state.accountId,
    rootId: 'private_root_fixture',
    priorityFileId: inputManifest.prioritySample.fileId,
    priorityVersion: inputManifest.prioritySample.version,
    generation: state.driveSessionGeneration,
    ...overrides.privateContext
  };
  const driveFetch = overrides.driveFetch || (async (url, options) => {
    calls.metadata.push({ url, options });
    const fileId = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    const row = rows.get(fileId);
    const resourceKey = row?.visibleReferences.find((reference) => reference.resourceKey)?.resourceKey;
    return metadataResponse({
      id: row.fileId,
      version: row.version,
      size: row.size,
      modifiedTime: row.modifiedTime,
      mimeType: row.mimeType,
      capabilities: { canDownload: true },
      trashed: false,
      ...(resourceKey ? { resourceKey } : {})
    });
  });
  const nativeFetch = overrides.nativeFetch || (async (url, options) => {
    calls.media.push({ url, options });
    return mediaResponse(url, options, overrides.magicKind);
  });
  const runtime = {
    appVersion: '1.22.0-rc.4',
    driveFetch,
    driveMutationsEnabled: false,
    state,
    privateContext,
    nativeFetch,
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
    runAuthenticatedRootInventory: overrides.runAuthenticatedRootInventory || (async (options) => {
      calls.order.push('inventory');
      calls.inventory.push(options);
      return { report: {}, privatePasses: { firstPass, secondPass } };
    }),
    selectRiskRepresentatives: overrides.selectRiskRepresentatives || ((options) => {
      calls.order.push('selector');
      calls.selector.push(options);
      return { privateManifest: inputManifest, report: {} };
    })
  };
  return {
    adapter: createDriveBrowserAdapter(runtime, dependencies),
    calls,
    dependencies,
    firstPass,
    listeners,
    runtime,
    secondPass,
    state
  };
}

function assertRejectedBeforeNetwork(inputManifest, runtimeMutation, code = 'RUNTIME_REJECTED') {
  return async () => {
    const context = fixture(inputManifest);
    runtimeMutation(context.runtime);
    context.adapter = createDriveBrowserAdapter(context.runtime, context.dependencies);
    const result = await context.adapter.runPrivateFrontSniff();
    assert.equal(result.complete, false);
    assert.deepEqual(result.failureCounts, { [code]: 1 });
    assert.equal(context.calls.metadata.length, 0);
    assert.equal(context.calls.media.length, 0);
  };
}

test('rejects protocol, pinned-origin, top-level and active same-origin /sw.js violations before network', async (t) => {
  const input = manifest();
  await t.test('protocol', assertRejectedBeforeNetwork(input, (runtime) => {
    runtime.location = { href: 'http://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/' };
  }));
  await t.test('origin', assertRejectedBeforeNetwork(input, (runtime) => {
    runtime.location = { href: 'https://example.invalid/' };
  }));
  await t.test('top-level', assertRejectedBeforeNetwork(input, (runtime) => {
    runtime.top = {};
  }));
  await t.test('controller missing', assertRejectedBeforeNetwork(input, (runtime) => {
    runtime.navigator.serviceWorker.controller = null;
  }));
  await t.test('controller inactive', assertRejectedBeforeNetwork(input, (runtime) => {
    runtime.navigator.serviceWorker.controller.state = 'installing';
  }));
  await t.test('controller path', assertRejectedBeforeNetwork(input, (runtime) => {
    runtime.navigator.serviceWorker.controller.scriptURL = `${ORIGIN}/nested/sw.js`;
  }));
});

test('requires the exact rc.4 read-only lexical runtime before network', async (t) => {
  const input = manifest();
  await t.test('version', assertRejectedBeforeNetwork(input, (runtime) => {
    runtime.appVersion = '1.22.0-rc.3';
  }));
  await t.test('mutation gate', assertRejectedBeforeNetwork(input, (runtime) => {
    runtime.driveMutationsEnabled = true;
  }));
  await t.test('probe session collision', assertRejectedBeforeNetwork(input, (runtime) => {
    runtime.state.mediaSession = Number.MAX_SAFE_INTEGER;
  }));
});

test('each non-idle app media-owner field rejects before inventory or body reads', async (t) => {
  const cases = [
    ['selected', {}],
    ['mediaAttempt', 'range'],
    ['mediaAbortController', {}],
    ['pendingOriginalBuffer', {}],
    ['pendingPlay', true],
    ['mediaTransportStarted', true]
  ];
  for (const [field, value] of cases) {
    await t.test(field, async () => {
      const context = fixture(manifest());
      context.state[field] = value;
      const result = await context.adapter.runPrivateFrontSniff();
      assert.deepEqual(result.failureCounts, { RUNTIME_REJECTED: 1 });
      assert.equal(context.calls.inventory.length, 0);
      assert.equal(context.calls.metadata.length, 0);
      assert.equal(context.calls.media.length, 0);
    });
  }
});

test('takes zero arguments and forwards only captured private provenance through fresh inventory then selector', async () => {
  const input = manifest();
  const context = fixture(input);
  assert.equal(context.adapter.runPrivateFrontSniff.length, 0);
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.successCount, 38);
  assert.deepEqual(context.calls.order, ['inventory', 'selector']);
  assert.equal(context.calls.inventory.length, 1);
  assert.deepEqual(
    Object.keys(context.calls.inventory[0]).sort(),
    ['driveFetch', 'expectedAccountKey', 'priorityFileId', 'rootId']
  );
  assert.equal(context.calls.inventory[0].expectedAccountKey, context.state.accountId);
  assert.equal(context.calls.inventory[0].rootId, context.runtime.privateContext.rootId);
  assert.equal(context.calls.inventory[0].priorityFileId, context.runtime.privateContext.priorityFileId);
  assert.equal(context.calls.selector[0].pass, context.secondPass);
  assert.equal(context.calls.selector[0].priorityFileId, context.runtime.privateContext.priorityFileId);
  assert.equal(context.calls.selector[0].expectedPriorityVersion, context.runtime.privateContext.priorityVersion);
});

test('rejects malformed or stale private context before inventory or network', async (t) => {
  const cases = [
    ['extra field', { extra: true }],
    ['wrong account', { accountKey: 'other_account' }],
    ['wrong generation', { generation: 8 }],
    ['invalid root', { rootId: 'bad/root' }]
  ];
  for (const [name, privateContext] of cases) {
    await t.test(name, async () => {
      const input = manifest();
      const context = fixture(input, { privateContext });
      const result = await context.adapter.runPrivateFrontSniff();
      assert.deepEqual(result.failureCounts, { PRIVATE_CONTEXT_INVALID: 1 });
      assert.equal(context.calls.inventory.length, 0);
      assert.equal(context.calls.metadata.length, 0);
      assert.equal(context.calls.media.length, 0);
    });
  }
});

test('arbitrary public arguments are ignored and cannot select body IDs', async () => {
  const input = manifest();
  const context = fixture(input);
  const arbitrary = {
    schema: 'attacker',
    selected: [{ fileId: 'ARBITRARY_ID_SENTINEL' }],
    fetch() { throw new Error('must not be called'); }
  };
  const result = await context.adapter.runPrivateFrontSniff(arbitrary);
  assert.equal(result.successCount, 38);
  assert.equal(context.calls.media.length, 38);
  assert.equal(context.calls.media.some(({ url }) => url.includes('ARBITRARY_ID_SENTINEL')), false);
});

test('inventory wrapper propagates lifecycle signal and fixed provenance', async () => {
  const input = manifest();
  const inventoryUrl = 'https://www.googleapis.com/drive/v3/about?fields=user(permissionId)';
  let context;
  const driveFetch = async (url, options) => {
    if (url === inventoryUrl) {
      context.calls.metadata.push({ url, options, inventory: true });
      return metadataResponse({ user: { permissionId: context.state.accountId } });
    }
    context.calls.metadata.push({ url, options });
    const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    const row = input.selected.find((item) => item.fileId === id);
    return metadataResponse({
      id, version: row.version, size: row.size, modifiedTime: row.modifiedTime,
      mimeType: row.mimeType, capabilities: { canDownload: true }, trashed: false
    });
  };
  context = fixture(input, {
    driveFetch,
    runAuthenticatedRootInventory: async (options) => {
      context.calls.order.push('inventory');
      context.calls.inventory.push(options);
      await options.driveFetch(inventoryUrl, { method: 'GET' });
      return { report: {}, privatePasses: { firstPass: context.firstPass, secondPass: context.secondPass } };
    }
  });
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.successCount, 38);
  const inventoryCall = context.calls.metadata.find((call) => call.inventory);
  assert.equal(inventoryCall.options.method, 'GET');
  assert.equal(inventoryCall.options.signal instanceof AbortSignal, true);
});

test('inventory, selector, generation and lifecycle failures make zero body requests', async (t) => {
  await t.test('inventory', async () => {
    const context = fixture(manifest(), {
      runAuthenticatedRootInventory: async () => { throw new Error('PRIVATE_INVENTORY_SENTINEL'); }
    });
    const result = await context.adapter.runPrivateFrontSniff();
    assert.deepEqual(result.failureCounts, { INVENTORY_FAILED: 1 });
    assert.equal(context.calls.media.length, 0);
  });
  await t.test('selector', async () => {
    const context = fixture(manifest(), {
      selectRiskRepresentatives: () => { throw new Error('PRIVATE_SELECTOR_SENTINEL'); }
    });
    const result = await context.adapter.runPrivateFrontSniff();
    assert.deepEqual(result.failureCounts, { SELECTION_FAILED: 1 });
    assert.equal(context.calls.media.length, 0);
  });
  await t.test('generation', async () => {
    let context;
    context = fixture(manifest(), {
      runAuthenticatedRootInventory: async () => {
        context.state.driveSessionGeneration += 1;
        return { report: {}, privatePasses: { firstPass: {}, secondPass: {} } };
      }
    });
    const result = await context.adapter.runPrivateFrontSniff();
    assert.deepEqual(result.failureCounts, { GENERATION_STALE: 1 });
    assert.equal(context.calls.media.length, 0);
  });
  await t.test('lifecycle', async () => {
    let started;
    const inventoryStarted = new Promise((resolve) => { started = resolve; });
    const context = fixture(manifest(), {
      driveFetch: async (_url, { signal }) => new Promise((resolve, reject) => {
        started();
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        void resolve;
      }),
      runAuthenticatedRootInventory: async ({ driveFetch }) => {
        await driveFetch('https://www.googleapis.com/drive/v3/about');
        return { report: {}, privatePasses: { firstPass: {}, secondPass: {} } };
      }
    });
    const pending = context.adapter.runPrivateFrontSniff();
    await inventoryStarted;
    context.listeners.get('pagehide')();
    const result = await pending;
    assert.deepEqual(result.failureCounts, { ABORTED: 1 });
    assert.equal(context.calls.media.length, 0);
  });
});

test('rejects malformed count, duplicate IDs, field shape and resource keys before all network', async (t) => {
  const cases = [
    ['count', (value) => { value.selected.pop(); }],
    ['duplicate', (value) => { value.selected[1].fileId = value.selected[0].fileId; }],
    ['missing field', (value) => { delete value.selected[0].mimeType; }],
    ['unknown field', (value) => { value.selected[0].url = 'PRIVATE_URL_SENTINEL'; }],
    ['resource key', (value) => { value.selected[0].visibleReferences[0].resourceKey = 'bad/key'; }],
    ['conflicting resource keys', (value) => {
      value.selected[0].visibleReferences.push({ fileId: 'shortcut_fixture', resourceKey: 'other_key' });
      value.selected[0].visibleReferences[0].resourceKey = 'first_key';
    }]
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const input = manifest({ mutate });
      const context = fixture(input);
      const result = await context.adapter.runPrivateFrontSniff();
      assert.deepEqual(result.failureCounts, { MANIFEST_INVALID: 1 });
      assert.equal(context.calls.metadata.length, 0);
      assert.equal(context.calls.media.length, 0);
    });
  }
});

test('metadata-risk null or malformed identities fail only their rows and do not block valid representatives', async () => {
  const input = manifest({ mutate(value) {
    value.selected[0].size = null;
    value.selected[1].modifiedTime = 'not-a-time';
    value.selected[2].mimeType = 'not-a-mime';
    return value;
  } });
  const context = fixture(input);
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.complete, true);
  assert.equal(result.processedCount, 38);
  assert.equal(result.successCount, 35);
  assert.equal(result.failureCounts.INVALID_IDENTITY, 3);
  assert.equal(context.calls.media.length, 35);
});

test('preflight identity mismatch makes zero body requests', async () => {
  const input = manifest();
  const context = fixture(input, {
    driveFetch: async (url, options) => {
      context.calls.metadata.push({ url, options });
      const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      const row = input.selected.find((item) => item.fileId === id);
      return metadataResponse({
        id, version: '999', size: row.size, modifiedTime: row.modifiedTime,
        mimeType: row.mimeType, capabilities: { canDownload: true }, trashed: false
      });
    }
  });
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.processedCount, 38);
  assert.equal(result.successCount, 0);
  assert.equal(result.failureCounts.IDENTITY_MISMATCH, 38);
  assert.equal(context.calls.media.length, 0);
});

test('runs exactly 38 one-request probes with body concurrency one', async () => {
  const input = manifest();
  let active = 0;
  let maximum = 0;
  const context = fixture(input, {
    nativeFetch: async (url, options) => {
      context.calls.media.push({ url, options });
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return mediaResponse(url, options);
    }
  });
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.complete, true);
  assert.equal(result.processedCount, 38);
  assert.equal(result.successCount, 38);
  assert.equal(result.preflightPassedCount, 38);
  assert.equal(result.postflightPassedCount, 38);
  assert.equal(result.totals.requests, 38);
  assert.equal(result.totals.receivedBytes, 38 * 65_536);
  assert.equal(context.calls.metadata.length, 76);
  assert.equal(context.calls.media.length, 38);
  assert.equal(maximum, 1);
});

test('requests exact bytes=0-65535 or EOF once per file', async () => {
  const input = manifest({ mutate(value) {
    value.selected[0].size = '12';
    return value;
  } });
  const context = fixture(input);
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.totals.requests, 38);
  assert.equal(context.calls.media[0].options.headers.Range, 'bytes=0-11');
  assert.equal(context.calls.media.slice(1).every(({ options }) => (
    options.headers.Range === 'bytes=0-65535'
  )), true);
  assert.equal(new Set(context.calls.media.map(({ url }) => new URL(url).pathname)).size, 38);
});

test('uses only native same-origin GET with fixed options and probe-only ownership numbers', async () => {
  const input = manifest({ mutate(value) {
    value.selected[0].visibleReferences[0].resourceKey = 'PRIVATE_RESOURCE_KEY_SENTINEL';
    return value;
  } });
  const context = fixture(input);
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.successCount, 38);
  const first = context.calls.media[0];
  const url = new URL(first.url);
  assert.equal(url.origin, ORIGIN);
  assert.equal(url.pathname, `/__drive_media/${input.selected[0].fileId}`);
  assert.deepEqual([...url.searchParams.keys()].sort(), [
    'accountGeneration', 'mediaSession', 'resourceKey', 'size', 'sourceGeneration'
  ]);
  assert.equal(url.searchParams.get('mediaSession'), String(Number.MAX_SAFE_INTEGER));
  assert.equal(url.searchParams.get('sourceGeneration'), String(Number.MAX_SAFE_INTEGER));
  assert.equal(url.searchParams.get('resourceKey'), 'PRIVATE_RESOURCE_KEY_SENTINEL');
  assert.deepEqual(Object.keys(first.options).sort(), [
    'cache', 'credentials', 'headers', 'method', 'mode', 'redirect', 'signal'
  ]);
  assert.equal(first.options.method, 'GET');
  assert.equal(first.options.mode, 'same-origin');
  assert.equal(first.options.credentials, 'same-origin');
  assert.equal(first.options.cache, 'no-store');
  assert.equal(first.options.redirect, 'error');
  assert.deepEqual(first.options.headers, { Range: 'bytes=0-65535' });
  assert.equal(first.options.signal instanceof AbortSignal, true);
  assert.doesNotMatch(first.url, /alt=media|acknowledgeAbuse|_trace|mime=|token/i);

  const metadata = context.calls.metadata[0];
  const metadataUrl = new URL(metadata.url);
  assert.equal(metadataUrl.origin, 'https://www.googleapis.com');
  assert.equal(metadataUrl.pathname, `/drive/v3/files/${input.selected[0].fileId}`);
  assert.equal(metadataUrl.searchParams.get('fields'), 'id,version,size,modifiedTime,mimeType,capabilities(canDownload),trashed,resourceKey');
  assert.equal(metadataUrl.searchParams.get('supportsAllDrives'), 'true');
  assert.equal(metadata.options.method, 'GET');
  assert.equal(metadata.options.headers['X-Goog-Drive-Resource-Keys'], `${input.selected[0].fileId}/PRIVATE_RESOURCE_KEY_SENTINEL`);
});

test('never calls mutation, persistence or player sentinels and never mutates player state', async () => {
  const input = manifest();
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
  const sentinelCalls = { mutation: 0, persistence: 0, player: 0 };
  const context = fixture(input, {
    state,
    runtime: {
      mutateDrive() { sentinelCalls.mutation += 1; },
      persist() { sentinelCalls.persistence += 1; },
      openPlayer() { sentinelCalls.player += 1; }
    }
  });
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.successCount, 38);
  assert.deepEqual(sentinelCalls, { mutation: 0, persistence: 0, player: 0 });
  assert.equal(mediaSessionWrites, 0);
  assert.equal(selectedWrites, 0);
});

test('page lifecycle abort is terminal and prevents the second file', async () => {
  const input = manifest();
  let bodyStarted;
  const started = new Promise((resolve) => { bodyStarted = resolve; });
  const context = fixture(input, {
    nativeFetch: async (url, options) => {
      context.calls.media.push({ url, options });
      bodyStarted();
      return new Promise(() => {});
    }
  });
  const pending = context.adapter.runPrivateFrontSniff();
  await started;
  context.listeners.get('pagehide')();
  const result = await pending;
  assert.equal(result.complete, false);
  assert.equal(result.processedCount, 0);
  assert.equal(result.failureCounts.ABORTED, 1);
  assert.equal(context.calls.media.length, 1);
});

test('generation change is terminal and prevents publication or a second file', async () => {
  const input = manifest();
  const context = fixture(input, {
    nativeFetch: async (url, options) => {
      context.calls.media.push({ url, options });
      context.state.driveSessionGeneration += 1;
      return mediaResponse(url, options);
    }
  });
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.complete, false);
  assert.equal(result.processedCount, 0);
  assert.equal(result.failureCounts.GENERATION_STALE, 1);
  assert.equal(result.magicCounts['iso-bmff'], undefined);
  assert.equal(context.calls.media.length, 1);
});

test('media-session and exact controller ownership changes prevent publication and the next body', async (t) => {
  const cases = [
    ['media session', (context) => { context.state.mediaSession += 1; }],
    ['controller replacement', (context) => {
      context.runtime.navigator.serviceWorker.controller = {
        scriptURL: `${ORIGIN}/sw.js`, state: 'activated'
      };
    }],
    ['controller state', (context) => {
      context.runtime.navigator.serviceWorker.controller.state = 'redundant';
    }],
    ['controller URL', (context) => {
      context.runtime.navigator.serviceWorker.controller.scriptURL = `${ORIGIN}/other-sw.js`;
    }]
  ];
  for (const [name, mutateOwner] of cases) {
    await t.test(name, async () => {
      const input = manifest();
      let context;
      context = fixture(input, {
        nativeFetch: async (url, options) => {
          context.calls.media.push({ url, options });
          mutateOwner(context);
          return mediaResponse(url, options);
        }
      });
      const result = await context.adapter.runPrivateFrontSniff();
      assert.equal(result.complete, false);
      assert.equal(result.processedCount, 0);
      assert.deepEqual(result.failureCounts, { GENERATION_STALE: 1 });
      assert.deepEqual(result.magicCounts, {});
      assert.equal(context.calls.media.length, 1);
    });
  }
});

test('every app media-owner transition during a probe prevents publication and the next body', async (t) => {
  const cases = [
    ['selected', {}],
    ['mediaAttempt', 'range'],
    ['mediaAbortController', {}],
    ['pendingOriginalBuffer', {}],
    ['pendingPlay', true],
    ['mediaTransportStarted', true]
  ];
  for (const [field, value] of cases) {
    await t.test(field, async () => {
      const input = manifest();
      let context;
      context = fixture(input, {
        nativeFetch: async (url, options) => {
          context.calls.media.push({ url, options });
          context.state[field] = value;
          return mediaResponse(url, options);
        }
      });
      const result = await context.adapter.runPrivateFrontSniff();
      assert.equal(result.complete, false);
      assert.equal(result.processedCount, 0);
      assert.deepEqual(result.failureCounts, { GENERATION_STALE: 1 });
      assert.deepEqual(result.magicCounts, {});
      assert.equal(context.calls.media.length, 1);
    });
  }
});

test('synchronous one-shot latch rejects concurrent and repeated public runs', async () => {
  const input = manifest();
  let releaseInventory;
  const inventoryGate = new Promise((resolve) => { releaseInventory = resolve; });
  let inventoryCalls = 0;
  let context;
  context = fixture(input, {
    runAuthenticatedRootInventory: async () => {
      inventoryCalls += 1;
      await inventoryGate;
      return {
        report: {},
        privatePasses: { firstPass: context.firstPass, secondPass: context.secondPass }
      };
    }
  });
  const first = context.adapter.runPrivateFrontSniff();
  const concurrent = await context.adapter.runPrivateFrontSniff();
  assert.deepEqual(concurrent.failureCounts, { RUN_ALREADY_CLAIMED: 1 });
  assert.equal(concurrent.processedCount, 0);
  assert.equal(inventoryCalls, 1);
  assert.equal(context.calls.media.length, 0);
  releaseInventory();
  const completed = await first;
  assert.equal(completed.successCount, 38);
  const repeated = await context.adapter.runPrivateFrontSniff();
  assert.deepEqual(repeated.failureCounts, { RUN_ALREADY_CLAIMED: 1 });
  assert.equal(inventoryCalls, 1);
  assert.equal(context.calls.media.length, 38);
});

test('postflight drift is terminal for the batch', async () => {
  const input = manifest();
  let metadataCalls = 0;
  const context = fixture(input, {
    driveFetch: async (url, options) => {
      context.calls.metadata.push({ url, options });
      metadataCalls += 1;
      const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      const row = input.selected.find((item) => item.fileId === id);
      return metadataResponse({
        id,
        version: metadataCalls === 2 ? '2' : row.version,
        size: row.size,
        modifiedTime: row.modifiedTime,
        mimeType: row.mimeType,
        capabilities: { canDownload: true },
        trashed: false
      });
    }
  });
  const result = await context.adapter.runPrivateFrontSniff();
  assert.equal(result.complete, false);
  assert.equal(result.processedCount, 1);
  assert.equal(result.failureCounts.POSTFLIGHT_DRIFT, 1);
  assert.equal(result.successCount, 0);
  assert.equal(context.calls.media.length, 1);
});

test('aggregate output has a fixed redacted shape and never serializes private sentinels', async () => {
  const input = manifest({ mutate(value) {
    value.selected[0].fileId = 'PRIVATE_ID_SENTINEL';
    value.prioritySample.fileId = 'PRIVATE_ID_SENTINEL';
    value.selected[0].visibleReferences = [{
      fileId: 'PRIVATE_SHORTCUT_SENTINEL',
      resourceKey: 'PRIVATE_RESOURCE_KEY_SENTINEL'
    }];
    return value;
  } });
  const context = fixture(input, { magicKind: 'png' });
  const result = await context.adapter.runPrivateFrontSniff();
  assert.deepEqual(Object.keys(result).sort(), EXPECTED_OUTPUT_KEYS);
  assert.deepEqual(result.magicCounts, { png: 38 });
  assert.equal(result.decodeClaimed, false);
  assert.equal(result.playbackClaimed, false);
  const serialized = JSON.stringify(result);
  for (const sentinel of [
    'PRIVATE_ID_SENTINEL', 'PRIVATE_SHORTCUT_SENTINEL', 'PRIVATE_RESOURCE_KEY_SENTINEL',
    'PRIVATE_ACCOUNT_SENTINEL', 'video/mp4', ORIGIN, 'Range', 'bytes='
  ]) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
});

test('browser bundle is deterministic and exposes only the narrow live entrypoint', async () => {
  const first = await buildBrowserBundleText();
  const second = await buildBrowserBundleText();
  assert.equal(first, second);
  assert.match(first, /Object\.defineProperty\(globalThis, 'runPrivateFrontSniff'/);
  assert.equal((first.match(/Object\.defineProperty\(globalThis/g) || []).length, 1);
  assert.doesNotMatch(first, /globalThis\.(?:runBoundedProbe|runBoundedProbeBatch|createDriveBrowserAdapter)\s*=/);
  assert.doesNotMatch(first, /__driveOriginal/);
  assert.match(first, /nativeFetch: globalThis\.fetch\.bind\(globalThis\)/);
  assert.match(first, /driveFetch: typeof driveFetch === 'function'/);
  assert.match(first, /driveMutationsEnabled: typeof DRIVE_MUTATIONS_ENABLED === 'boolean'/);
  assert.match(first, /state: typeof state === 'object'/);
  assert.match(first, /privateContext: typeof __v207aPrivateContext === 'object'/);
  assert.match(first, /const rootInventoryCore = \(\(\) => \{/);
  assert.match(first, /const rootBrowserAdapter = \(\(\) => \{/);
  assert.match(first, /const representativeSelector = \(\(\) => \{/);
  assert.match(first, /const boundedProbeCore = \(\(\) => \{/);
  assert.match(first, /configurable: true/);
  assert.match(first, /delete globalThis\.runPrivateFrontSniff/);
  assert.match(first, /delete globalThis\.runPrivateFrontSniff;[\s\S]*return liveAdapter\.runPrivateFrontSniff\(\);/);
});

test('browser global is configurable, zero-argument and removes itself synchronously on its owning invocation', async () => {
  const bundle = await buildBrowserBundleText();
  const sandbox = {
    URL,
    AbortController,
    DOMException,
    Headers,
    TextDecoder,
    performance,
    structuredClone,
    fetch: async () => { throw new Error('network must not run'); },
    location: { href: `${ORIGIN}/` },
    navigator: {
      serviceWorker: {
        controller: { scriptURL: `${ORIGIN}/sw.js`, state: 'activated' }
      }
    },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(`
    globalThis.top = globalThis;
    globalThis.self = globalThis;
    const APP_VERSION = '1.22.0-rc.4';
    const DRIVE_MUTATIONS_ENABLED = false;
    const state = {
      accountId: 'account', driveSessionGeneration: 1, mediaSession: 1,
      selected: null, mediaAttempt: 'idle', mediaAbortController: null,
      pendingOriginalBuffer: null, pendingPlay: false, mediaTransportStarted: false
    };
    const __v207aPrivateContext = null;
    async function driveFetch() { throw new Error('network must not run'); }
    ${bundle}
  `, sandbox);
  const descriptor = Object.getOwnPropertyDescriptor(sandbox, 'runPrivateFrontSniff');
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.configurable, true);
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.value.length, 0);
  const first = descriptor.value({ fileId: 'ARBITRARY_ID_SENTINEL' });
  assert.equal(Object.hasOwn(sandbox, 'runPrivateFrontSniff'), false);
  const concurrent = descriptor.value({ fileId: 'SECOND_ARBITRARY_ID_SENTINEL' });
  assert.deepEqual({ ...(await concurrent).failureCounts }, { RUN_ALREADY_CLAIMED: 1 });
  const result = await first;
  assert.deepEqual({ ...result.failureCounts }, { PRIVATE_CONTEXT_INVALID: 1 });
});
