import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createDriveIdentityReconciliation } from './drive-identity-reconciliation.mjs';
import { buildBrowserBundleText } from './build-browser-bundle.mjs';

const ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';

function manifest(mutate) {
  const selected = Array.from({ length: 38 }, (_, index) => ({
    fileId: `private_identity_${String(index).padStart(2, '0')}`,
    version: '1',
    size: '70000',
    modifiedTime: '2026-09-20T00:00:00.000Z',
    mimeType: 'video/mp4',
    extension: '.mp4',
    visibleReferences: [{ fileId: `private_identity_${String(index).padStart(2, '0')}`, resourceKey: null }],
    mandatoryReasons: index === 0 ? ['priority-sample'] : [],
    coveredCategories: [`fixture:${index}`]
  }));
  const value = {
    schema: 'drive-original.v2-07a-risk-selection-private/1',
    prioritySample: { fileId: selected[0].fileId, version: selected[0].version },
    selected
  };
  if (!mutate) return value;
  return mutate(value) ?? value;
}

function response(body, ok = true) {
  return { ok, async json() { return structuredClone(body); } };
}

function fixture(privateManifest = manifest(), overrides = {}) {
  const calls = { drive: [], inventory: [], selector: [], order: [] };
  const surface = {};
  const state = overrides.state || {
    accountId: 'PRIVATE_ACCOUNT_SENTINEL',
    driveSessionGeneration: 9,
    mediaSession: 14,
    selected: null,
    mediaAttempt: 'idle',
    mediaAbortController: null,
    pendingOriginalBuffer: null,
    pendingPlay: false,
    mediaTransportStarted: false
  };
  const rows = new Map(privateManifest.selected.map((row, index) => [row.fileId, { row, index }]));
  const counts = new Map();
  const listeners = new Map();
  const driveFetch = overrides.driveFetch || (async (url, options) => {
    calls.drive.push({ url, options });
    const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    const item = rows.get(id);
    const count = (counts.get(id) || 0) + 1;
    counts.set(id, count);
    const body = {
      id,
      version: item.row.version ?? '1',
      size: item.row.size ?? '70000',
      modifiedTime: item.row.modifiedTime ?? '2026-09-20T00:00:00.000Z',
      mimeType: item.row.mimeType ?? 'video/mp4',
      capabilities: { canDownload: true },
      trashed: false,
      ...(item.row.visibleReferences.some((reference) => reference.resourceKey)
        ? { resourceKey: item.row.visibleReferences.find((reference) => reference.resourceKey).resourceKey }
        : {})
    };
    return response(overrides.observe ? overrides.observe({ ...body }, item.index, count) : body);
  });
  const runtime = {
    appVersion: '1.22.0-rc.4',
    driveFetch,
    driveMutationsEnabled: false,
    state,
    privateContext: {
      accountKey: state.accountId,
      rootId: 'private_root_fixture',
      priorityFileId: privateManifest.prioritySample.fileId,
      priorityVersion: privateManifest.prioritySample.version,
      generation: state.driveSessionGeneration,
      ...overrides.privateContext
    },
    location: { href: `${ORIGIN}/` },
    navigator: { serviceWorker: { controller: { scriptURL: `${ORIGIN}/sw.js`, state: 'activated' } } },
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
      return { privateManifest, report: {} };
    }),
    ...(overrides.dependencies || {})
  };
  return {
    adapter: createDriveIdentityReconciliation(runtime, dependencies),
    calls,
    dependencies,
    firstPass,
    listeners,
    runtime,
    secondPass,
    state
  };
}

test('zero-argument closed orchestration runs fresh inventory, selection, then 38 serial pre/post metadata reads', async () => {
  const context = fixture();
  assert.equal(context.adapter.runPrivateIdentityReconciliation.length, 0);
  const result = await context.adapter.runPrivateIdentityReconciliation({
    fileId: 'ARBITRARY_ID_SENTINEL', manifest: 'ARBITRARY_MANIFEST_SENTINEL'
  });
  assert.equal(result.complete, true);
  assert.equal(result.selectedCount, 38);
  assert.equal(result.preflightReadCount, 38);
  assert.equal(result.postflightReadCount, 38);
  assert.equal(result.processedCount, 38);
  assert.equal(result.stableIdentityCount, 38);
  assert.equal(result.mismatchedIdentityCount, 0);
  assert.equal(result.unresolvedIdentityCount, 0);
  assert.equal(result.totals.reconciliationMetadataRequests, 76);
  assert.deepEqual(context.calls.order, ['inventory', 'selector']);
  assert.equal(context.calls.inventory[0].rootId, context.runtime.privateContext.rootId);
  assert.equal(context.calls.inventory[0].priorityFileId, context.runtime.privateContext.priorityFileId);
  assert.equal(context.calls.inventory[0].expectedAccountKey, context.state.accountId);
  assert.equal(context.calls.selector[0].pass, context.secondPass);
  assert.equal(context.calls.selector[0].expectedPriorityVersion, context.runtime.privateContext.priorityVersion);
  assert.equal(context.calls.drive.some(({ url }) => url.includes('ARBITRARY_ID_SENTINEL')), false);
});

test('reports each identity mismatch dimension and resource-key presence without private values', async () => {
  const privateManifest = manifest((value) => {
    value.selected[7].visibleReferences[0].resourceKey = 'PRIVATE_RESOURCE_KEY_SENTINEL';
  });
  const context = fixture(privateManifest, {
    observe(body, index) {
      if (index === 0) body.id = 'other_safe_id';
      if (index === 1) body.version = '2';
      if (index === 2) body.size = '70001';
      if (index === 3) body.modifiedTime = '2026-09-20T00:00:01.000Z';
      if (index === 4) body.mimeType = 'video/webm';
      if (index === 5) body.capabilities.canDownload = false;
      if (index === 6) body.trashed = true;
      if (index === 7) delete body.resourceKey;
      return body;
    }
  });
  const result = await context.adapter.runPrivateIdentityReconciliation();
  assert.equal(result.complete, true);
  assert.equal(result.stableIdentityCount, 30);
  assert.equal(result.mismatchedIdentityCount, 8);
  assert.deepEqual(result.expectedMismatchCounts, {
    fileId: 1,
    version: 1,
    size: 1,
    modifiedTime: 1,
    mimeType: 1,
    canDownload: 1,
    trashed: 1,
    resourceKeyPresence: 1
  });
  assert.deepEqual(result.prePostDriftCounts, {
    fileId: 0, version: 0, size: 0, modifiedTime: 0,
    mimeType: 0, canDownload: 0, trashed: 0, resourceKeyPresence: 0
  });
  const serialized = JSON.stringify(result);
  for (const sentinel of [
    'PRIVATE_RESOURCE_KEY_SENTINEL', 'PRIVATE_ACCOUNT_SENTINEL', 'private_identity_',
    'video/mp4', ORIGIN, 'other_safe_id'
  ]) assert.equal(serialized.includes(sentinel), false, sentinel);
});

test('distinguishes pre/post drift by exact dimension', async () => {
  const context = fixture(manifest(), {
    observe(body, index, count) {
      if (index === 0 && count === 2) body.version = '2';
      return body;
    }
  });
  const result = await context.adapter.runPrivateIdentityReconciliation();
  assert.equal(result.expectedMismatchCounts.version, 1);
  assert.equal(result.prePostDriftCounts.version, 1);
  assert.equal(result.mismatchedIdentityCount, 1);
  assert.equal(result.stableIdentityCount, 37);
});

test('never issues media, Range, alt=media, body, decode, playback, mutation or persistence paths', async () => {
  let active = 0;
  let maximum = 0;
  let context;
  const privateManifest = manifest();
  context = fixture(privateManifest, {
    driveFetch: async (url, options) => {
      context.calls.drive.push({ url, options });
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      const row = privateManifest.selected.find((item) => item.fileId === id);
      return response({
        id, version: row.version, size: row.size, modifiedTime: row.modifiedTime,
        mimeType: row.mimeType, capabilities: { canDownload: true }, trashed: false
      });
    },
    runtime: {
      nativeFetch() { throw new Error('native media fetch must not be captured'); },
      persist() { throw new Error('persistence must not run'); },
      mutate() { throw new Error('mutation must not run'); },
      decode() { throw new Error('decode must not run'); },
      play() { throw new Error('playback must not run'); }
    }
  });
  const result = await context.adapter.runPrivateIdentityReconciliation();
  assert.equal(result.complete, true);
  assert.equal(result.mediaBodiesRead, 0);
  assert.equal(result.decodeClaimed, false);
  assert.equal(result.playbackClaimed, false);
  assert.equal(maximum, 1);
  for (const call of context.calls.drive) {
    const url = new URL(call.url);
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(url.pathname.startsWith('/drive/v3/files/'), true);
    assert.equal(url.searchParams.get('fields'), 'id,version,size,modifiedTime,mimeType,capabilities(canDownload),trashed,resourceKey');
    assert.equal(url.searchParams.has('alt'), false);
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.body, undefined);
    const headers = Object.entries(call.options.headers || {});
    assert.equal(headers.some(([name]) => name.toLowerCase() === 'range'), false);
  }
  assert.doesNotMatch(JSON.stringify(context.calls.drive), /__drive_media|alt=media|bytes=/i);
});

test('serial request ownership remains held until each JSON body settles', async () => {
  const privateManifest = manifest();
  let releaseFirstBody;
  let firstBodyStarted;
  const firstBodyGate = new Promise((resolve) => { releaseFirstBody = resolve; });
  const firstBodyStartedGate = new Promise((resolve) => { firstBodyStarted = resolve; });
  let underlyingCalls = 0;
  let context;
  context = fixture(privateManifest, {
    driveFetch: async (url, options) => {
      context.calls.drive.push({ url, options });
      underlyingCalls += 1;
      if (underlyingCalls === 1) {
        return {
          ok: true,
          json() {
            firstBodyStarted();
            return firstBodyGate;
          }
        };
      }
      const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      const row = privateManifest.selected.find((item) => item.fileId === id);
      return response({
        id, version: row.version, size: row.size, modifiedTime: row.modifiedTime,
        mimeType: row.mimeType, capabilities: { canDownload: true }, trashed: false
      });
    },
    runAuthenticatedRootInventory: async ({ driveFetch }) => {
      const first = await driveFetch('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)');
      const firstBody = first.json();
      await firstBodyStartedGate;
      await assert.rejects(
        () => driveFetch('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)'),
        (error) => error?.code === 'REQUEST_POLICY_REJECTED'
      );
      assert.equal(underlyingCalls, 1);
      releaseFirstBody({ user: { permissionId: context.state.accountId } });
      await firstBody;
      return { report: {}, privatePasses: { firstPass: context.firstPass, secondPass: context.secondPass } };
    }
  });
  const result = await context.adapter.runPrivateIdentityReconciliation();
  assert.equal(result.complete, true);
  assert.equal(result.unresolvedIdentityCount, 0);
});

test('runtime, context and media-idle fences reject before inventory and metadata', async (t) => {
  const mutations = [
    ['origin', (context) => { context.runtime.location = { href: 'https://example.invalid/' }; }],
    ['controller', (context) => { context.runtime.navigator.serviceWorker.controller = null; }],
    ['account context', (context) => { context.runtime.privateContext.accountKey = 'other'; }],
    ['selected', (context) => { context.state.selected = {}; }],
    ['media attempt', (context) => { context.state.mediaAttempt = 'range'; }],
    ['abort owner', (context) => { context.state.mediaAbortController = {}; }],
    ['buffer owner', (context) => { context.state.pendingOriginalBuffer = {}; }],
    ['pending play', (context) => { context.state.pendingPlay = true; }],
    ['transport', (context) => { context.state.mediaTransportStarted = true; }]
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const context = fixture();
      mutate(context);
      context.adapter = createDriveIdentityReconciliation(context.runtime, context.dependencies);
      const result = await context.adapter.runPrivateIdentityReconciliation();
      assert.equal(result.complete, false);
      assert.equal(context.calls.inventory.length, 0);
      assert.equal(context.calls.drive.length, 0);
    });
  }
});

test('ownership loss and lifecycle abort are terminal and publish no partial identity counts', async (t) => {
  await t.test('ownership', async () => {
    let context;
    const privateManifest = manifest();
    context = fixture(privateManifest, {
      driveFetch: async (url, options) => {
        context.calls.drive.push({ url, options });
        context.state.mediaAttempt = 'range';
        const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
        const row = privateManifest.selected.find((item) => item.fileId === id);
        return response({
          id, version: row.version, size: row.size, modifiedTime: row.modifiedTime,
          mimeType: row.mimeType, capabilities: { canDownload: true }, trashed: false
        });
      }
    });
    const result = await context.adapter.runPrivateIdentityReconciliation();
    assert.deepEqual(result.failureCounts, { OWNERSHIP_LOST: 1 });
    assert.equal(result.processedCount, 0);
    assert.equal(context.calls.drive.length, 1);
  });
  await t.test('lifecycle', async () => {
    let started;
    const pendingRequest = new Promise((resolve) => { started = resolve; });
    let context;
    context = fixture(manifest(), {
      driveFetch: async (_url, { signal }) => new Promise((resolve, reject) => {
        started();
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        void resolve;
      })
    });
    const pending = context.adapter.runPrivateIdentityReconciliation();
    await pendingRequest;
    context.listeners.get('pagehide')();
    const result = await pending;
    assert.deepEqual(result.failureCounts, { LIFECYCLE_ABORTED: 1 });
    assert.equal(result.processedCount, 0);
  });
});

test('hard request and time ceilings fail closed', async (t) => {
  await t.test('request limit', async () => {
    let context;
    let requests = 0;
    context = fixture(manifest(), {
      driveFetch: async () => {
        requests += 1;
        return response({});
      },
      runAuthenticatedRootInventory: async ({ driveFetch }) => {
        for (let index = 0; index <= 512; index += 1) {
          const response = await driveFetch('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)');
          await response.json();
        }
        return { report: {}, privatePasses: { firstPass: {}, secondPass: {} } };
      }
    });
    const result = await context.adapter.runPrivateIdentityReconciliation();
    assert.deepEqual(result.failureCounts, { REQUEST_LIMIT: 1 });
    assert.equal(result.processedCount, 0);
    assert.equal(requests, 512);
  });
  await t.test('time limit', async () => {
    const context = fixture(manifest(), {
      dependencies: {
        setTimeoutFn(callback) { callback(); return 1; },
        clearTimeoutFn() {}
      }
    });
    const result = await context.adapter.runPrivateIdentityReconciliation();
    assert.deepEqual(result.failureCounts, { TIME_LIMIT: 1 });
    assert.equal(context.calls.drive.length, 0);
  });
});

test('metadata failures are fixed aggregate counts and raw errors never escape', async () => {
  const privateManifest = manifest();
  let calls = 0;
  const context = fixture(privateManifest, {
    driveFetch: async (url, options) => {
      context.calls.drive.push({ url, options });
      calls += 1;
      if (calls === 1) throw new Error('PRIVATE_RAW_ERROR_SENTINEL');
      const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      const row = privateManifest.selected.find((item) => item.fileId === id);
      return response({
        id, version: row.version, size: row.size, modifiedTime: row.modifiedTime,
        mimeType: row.mimeType, capabilities: { canDownload: true }, trashed: false
      });
    }
  });
  const result = await context.adapter.runPrivateIdentityReconciliation();
  assert.equal(result.complete, false);
  assert.equal(result.failureCounts.METADATA_READ_FAILED, 1);
  assert.equal(result.processedCount, 37);
  assert.equal(result.unresolvedIdentityCount, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE_RAW_ERROR_SENTINEL'), false);
});

test('a missing postflight read is explicitly incomplete and unresolved', async () => {
  const privateManifest = manifest();
  let calls = 0;
  let context;
  context = fixture(privateManifest, {
    driveFetch: async (url, options) => {
      context.calls.drive.push({ url, options });
      calls += 1;
      if (calls === 39) throw new Error('PRIVATE_POSTFLIGHT_ERROR_SENTINEL');
      const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      const row = privateManifest.selected.find((item) => item.fileId === id);
      return response({
        id, version: row.version, size: row.size, modifiedTime: row.modifiedTime,
        mimeType: row.mimeType, capabilities: { canDownload: true }, trashed: false
      });
    }
  });
  const result = await context.adapter.runPrivateIdentityReconciliation();
  assert.equal(result.complete, false);
  assert.equal(result.preflightReadCount, 38);
  assert.equal(result.postflightReadCount, 37);
  assert.equal(result.processedCount, 37);
  assert.equal(result.unresolvedIdentityCount, 1);
  assert.deepEqual(result.failureCounts, { METADATA_READ_FAILED: 1 });
  assert.equal(JSON.stringify(result).includes('PRIVATE_POSTFLIGHT_ERROR_SENTINEL'), false);
});

test('one-shot latch rejects concurrent and repeated retained references', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let inventoryCalls = 0;
  let context;
  context = fixture(manifest(), {
    runAuthenticatedRootInventory: async () => {
      inventoryCalls += 1;
      await gate;
      return { report: {}, privatePasses: { firstPass: context.firstPass, secondPass: context.secondPass } };
    }
  });
  const first = context.adapter.runPrivateIdentityReconciliation();
  const concurrent = await context.adapter.runPrivateIdentityReconciliation();
  assert.deepEqual(concurrent.failureCounts, { RUN_ALREADY_CLAIMED: 1 });
  release();
  assert.equal((await first).complete, true);
  assert.deepEqual((await context.adapter.runPrivateIdentityReconciliation()).failureCounts, {
    RUN_ALREADY_CLAIMED: 1
  });
  assert.equal(inventoryCalls, 1);
});

test('deterministic bundle exposes one configurable zero-arg global and deletes it synchronously', async () => {
  const first = await buildBrowserBundleText();
  const second = await buildBrowserBundleText();
  assert.equal(first, second);
  assert.equal((first.match(/Object\.defineProperty\(globalThis/g) || []).length, 1);
  assert.match(first, /delete globalThis\.runPrivateIdentityReconciliation;[\s\S]*return liveReconciliation\.runPrivateIdentityReconciliation\(\)/);
  assert.doesNotMatch(first, /globalThis\.(?:createDriveIdentityReconciliation|selectRiskRepresentatives|runAuthenticatedRootInventory)\s*=/);
  assert.doesNotMatch(first, /__drive_media|alt=media|Range:|nativeFetch/);

  const sandbox = {
    URL, AbortController, DOMException, Headers, TextDecoder, performance, structuredClone,
    location: { href: `${ORIGIN}/` },
    navigator: { serviceWorker: { controller: { scriptURL: `${ORIGIN}/sw.js`, state: 'activated' } } },
    addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout
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
    ${first}
  `, sandbox);
  const descriptor = Object.getOwnPropertyDescriptor(sandbox, 'runPrivateIdentityReconciliation');
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.configurable, true);
  assert.equal(descriptor.value.length, 0);
  const owning = descriptor.value({ fileId: 'ARBITRARY_ID_SENTINEL' });
  assert.equal(Object.hasOwn(sandbox, 'runPrivateIdentityReconciliation'), false);
  assert.deepEqual({ ...(await descriptor.value()).failureCounts }, { RUN_ALREADY_CLAIMED: 1 });
  assert.deepEqual({ ...(await owning).failureCounts }, { PRIVATE_CONTEXT_INVALID: 1 });
});
