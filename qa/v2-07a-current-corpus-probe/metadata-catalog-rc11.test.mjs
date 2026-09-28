import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildRc11MetadataBundle } from './metadata-catalog-rc11-build.mjs';
const origin = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const hash = data => createHash('sha256').update(data).digest('hex');
const protectedPaths = ['current-corpus-browser-bundle.js', 'metadata-catalog-browser-bundle.js',
  'browser-bundle-first-live-failed.js', 'browser-bundle-selection-diagnostic.js', 'live-rc10-results.json'];
const before = await Promise.all(protectedPaths.map(path => readFile(new URL(path, import.meta.url)).then(hash)));
const built = await buildRc11MetadataBundle();
function fixture({ mutate, held = false, drift = false } = {}) {
  const state = { accountId: 'PRIVATE_ACCOUNT', authAccountKey: 'PRIVATE_SUB', authGeneration: 2,
    driveSessionGeneration: 3, tokenRevision: 4, token: 'PRIVATE_TOKEN', expiresAt: Date.now() + 3600000,
    authStatus: 'online', demo: false, accountIdentityPending: false, accountStateAbortController: new AbortController(),
    accountStateLoaded: true, accountStateWriterId: 'PRIVATE_WRITER', accountStateRevision: 0,
    accountStateSyncPromise: null, accountStateSyncTimer: null, accountStateSyncRetryTimer: null, accountStateSyncError: null,
    accountMediaState: { favorites: [] }, mediaSession: 2, selected: null, mediaAttempt: 'idle', mediaAbortController: null,
    pendingOriginalBuffer: null, pendingPlay: false, mediaTransportStarted: false };
  const root = { id: 'PRIVATE_ROOT', mimeType: 'application/vnd.google-apps.folder', version: '1',
    modifiedTime: '2026-09-29T00:00:00.000Z', trashed: false, capabilities: { canListChildren: true } };
  const file = id => ({ id, name: 'PRIVATE_NAME', mimeType: 'image/bmp', fullFileExtension: 'bmp', version: '1',
    size: '10000', parents: ['PRIVATE_ROOT'], modifiedTime: root.modifiedTime, trashed: false,
    capabilities: { canDownload: true, canReadRevisions: true }, imageMediaMetadata: { width: 40, height: 30 } });
  let abouts = 0;
  const calls = [], listeners = new Set(), controller = { state: 'activated', scriptURL: origin + '/sw.js' };
  const sandbox = { URL, Headers, Response, Request, ReadableStream, AbortController, DOMException, Uint8Array,
    TextDecoder, setTimeout, clearTimeout, performance, APP_VERSION: '1.22.0-rc.11', DRIVE_MUTATIONS_ENABLED: false,
    ACCOUNT_STATE_WRITES_ENABLED: true, state, mediaSourceGeneration: 7, q1Playback: null,
    q1RetirementResult: { settled: true }, playerMediaPriorityActive: false,
    hasUsableToken: () => true, accountMediaStatesEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    navigator: { onLine: true, serviceWorker: { controller } }, location: { href: origin + '/', origin },
    document: { visibilityState: 'visible' }, top: 1, self: 1,
    window: { addEventListener: type => listeners.add(type), removeEventListener: type => listeners.delete(type) },
    fetch: async (value, options) => {
      const url = new URL(value); calls.push({ url, options });
      assert.equal(options.method, 'GET'); assert.equal(url.searchParams.has('alt'), false);
      assert.equal(options.body, undefined); assert.equal(options.priority, 'low');
      if (held) return new Promise(() => {});
      let json;
      const priority = file('PRIVATE_PRIORITY'); if (drift && abouts > 5) priority.version = '2';
      if (url.pathname.endsWith('/about')) { abouts++; json = { user: { permissionId: state.accountId } }; }
      else if (url.pathname.endsWith('/PRIVATE_ROOT')) json = root;
      else if (url.pathname.endsWith('/PRIVATE_PRIORITY')) json = priority;
      else if (url.pathname.endsWith('/files')) json = url.searchParams.has('pageToken')
        ? { incompleteSearch: false, files: [file('PRIVATE_OTHER')] }
        : { incompleteSearch: false, nextPageToken: 'PRIVATE_NEXT', files: [priority] };
      else throw new Error('PRIVATE_BAD_ROUTE');
      // Native network completion happens after the dispatch's abort races are linked.
      await Promise.resolve(); mutate?.({ state, sandbox, calls }); return Response.json(json);
    } };
  const keys = Object.keys(sandbox), run = vm.runInNewContext(built.bundle, sandbox);
  assert.deepEqual(Object.keys(sandbox), keys);
  const context = JSON.stringify({ accountKey: state.accountId, generation: 3, rootId: root.id, priorityFileId: 'PRIVATE_PRIORITY' });
  return { state, sandbox, calls, listeners, run, context };
}
async function finish(job) {
  for (let i = 0; i < 200; i++) { const value = job.poll(); if (value.done) return value; await new Promise(resolve => setTimeout(resolve, 1)); }
  throw new Error('LOCAL_JOB_DID_NOT_SETTLE');
}
function privateOmitted(value) {
  const text = JSON.stringify(value);
  for (const secret of ['PRIVATE_ACCOUNT', 'PRIVATE_SUB', 'PRIVATE_TOKEN', 'PRIVATE_WRITER', 'PRIVATE_ROOT', 'PRIVATE_PRIORITY', 'PRIVATE_NAME', 'PRIVATE_NEXT']) assert.equal(text.includes(secret), false);
}
test('distinct rc11 build deterministically changes exactly one driver pin and preserves rc10 evidence', async () => {
  assert.equal((await buildRc11MetadataBundle()).bundle, built.bundle);
  assert.equal(built.provenance.explicitVersionPinReplacements, 1);
  assert.equal(built.provenance.bundleSHA256, hash(built.bundle));
  for (const path of ['metadata-catalog-rc11-build.mjs', 'metadata-catalog-rc11-facade.function.js', 'metadata-catalog-rc11.test.mjs'])
    assert.equal((await readFile(new URL(path, import.meta.url), 'utf8')).includes('\r'), false);
  assert.deepEqual(await Promise.all(protectedPaths.map(path => readFile(new URL(path, import.meta.url)).then(hash))), before);
});
test('immediate rc11 job fully paginates two repeated inventories with zero body or write dispatches', async () => {
  const f = fixture(), job = f.run(f.context); assert.equal(typeof job.then, 'undefined');
  const result = await finish(job); assert.equal(result.summary.complete, true); assert.equal(result.summary.catalogStable, true);
  assert.equal(result.summary.inventoryRunsCompleted, 2); assert.equal(result.summary.version, '1.22.0-rc.11');
  assert.equal(f.calls.filter(call => call.url.searchParams.has('pageToken')).length, 4);
  assert.equal(result.mediaRequests, 0); assert.equal(result.writeRequests, 0); assert.equal(result.freshSWRuntimeVersionVerified, false);
  assert.equal(result.summary.released, true); assert.equal(f.listeners.size, 0);
  const count = f.calls.length; job.cancel(); job.poll(); assert.equal(f.calls.length, count); privateOmitted(result);
});
test('equal normal read refresh may update loading promise/cache/time without aborting metadata inventory', async () => {
  const f = fixture({ mutate: ({ state }) => { state.accountMediaState = { favorites: [] }; state.accountStateLoadingPromise = Promise.resolve(); state.accountStateLastSyncAt = Date.now(); state.cacheText = 'PRIVATE_CHANGED_CACHE'; } });
  assert.equal((await finish(f.run(f.context))).summary.complete, true);
});
test('write sync, projection, owner and media changes stop all later dispatches', async () => {
  const mutations = [({ state }) => { state.accountStateSyncPromise = Promise.resolve(); },
    ({ state }) => { state.accountStateSyncTimer = 1; }, ({ state }) => { state.accountStateSyncRetryTimer = 1; },
    ({ state }) => { state.accountStateSyncError = 'PRIVATE_ERROR'; }, ({ state }) => { state.accountStateRevision++; },
    ({ state }) => { state.accountStateWriterId = 'PRIVATE_OTHER_WRITER'; },
    ({ state }) => { state.accountMediaState.favorites.push('PRIVATE_FILE'); },
    ({ state }) => { state.tokenRevision++; }, ({ state }) => { state.authGeneration++; },
    ({ state }) => { state.accountId = 'PRIVATE_OTHER_ACCOUNT'; }, ({ state }) => { state.token = 'PRIVATE_OTHER_TOKEN'; },
    ({ state }) => { state.expiresAt++; },
    ({ state }) => { state.driveSessionGeneration++; }, ({ state }) => { state.accountStateAbortController.abort(); },
    ({ sandbox }) => { sandbox.navigator.serviceWorker.controller = { state: 'activated', scriptURL: origin + '/sw.js' }; },
    ({ sandbox }) => { sandbox.playerMediaPriorityActive = true; }, ({ sandbox }) => { sandbox.mediaSourceGeneration++; }];
  for (const mutate of mutations) {
    const f = fixture({ mutate }), result = await finish(f.run(f.context));
    assert.equal(result.summary.failure, 'OWNER_CHANGED'); assert.equal(result.summary.complete, false);
    assert.equal(f.calls.length, 1); assert.equal(result.summary.released, true); privateOmitted(result);
  }
});
test('held native fetch returns a handle immediately and cancellation settles without another dispatch', async () => {
  const f = fixture({ held: true }), job = f.run(f.context); assert.equal(typeof job.poll, 'function'); assert.equal(job.poll().done, false);
  job.cancel(); job.cancel(); const result = await finish(job);
  assert.equal(result.summary.failure, 'ABORTED'); assert.equal(result.summary.complete, false); assert.equal(f.calls.length, 1);
  assert.equal(f.listeners.size, 0); privateOmitted(result);
});
test('invalid private context and wrong version/write posture fail before all dispatches', async () => {
  for (const alter of [f => '{PRIVATE_INVALID_JSON', f => JSON.stringify({ ...JSON.parse(f.context), extra: 'PRIVATE_EXTRA' }),
    f => { f.sandbox.APP_VERSION = '1.22.0-rc.10'; return f.context; },
    f => { f.sandbox.ACCOUNT_STATE_WRITES_ENABLED = false; return f.context; },
    f => { f.state.accountStateSyncTimer = 1; return f.context; }]) {
    const f = fixture(), result = f.run(alter(f)).poll(); assert.equal(result.done, true);
    assert.equal(result.failure, 'FACADE_PREFLIGHT_REJECTED'); assert.equal(f.calls.length, 0); privateOmitted(result);
  }
});
test('rc11 canonical final drift preserves safe comparator dimensions and complete false', async () => {
  const f = fixture({ drift: true }), result = await finish(f.run(f.context));
  assert.equal(result.summary.complete, false); assert.equal(result.summary.failure, 'CATALOG_DRIFT');
  assert.equal(result.summary.catalogComparison.comparatorCode, 'REPEAT_MISMATCH'); assert.equal(result.summary.catalogComparison.itemsChanged, 1);
  privateOmitted(result);
});
