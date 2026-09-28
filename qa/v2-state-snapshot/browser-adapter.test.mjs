import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createBrowserStateAudit } from './browser-adapter.mjs';
import { buildBrowserFunction } from './build-browser-adapter.mjs';

const product = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const start = product.indexOf('function createEmptyAccountMediaState()');
const end = product.indexOf('function accountFavoriteIds(', start);
const rules = vm.createContext({});
vm.runInContext(`const ACCOUNT_STATE_SCHEMA_VERSION=1;${product.slice(start, end)}`, rules);
const normalize = value => JSON.parse(JSON.stringify(rules.normalizeAccountMediaState(value)));
const merge = (a, b) => JSON.parse(JSON.stringify(rules.mergeAccountMediaStates(a, b)));
const raw = { schemaVersion: 1, updatedAt: 20, favorites: { old: { liked: false, updatedAt: 20 } }, viewed: { seen: 10 } };

function fixture(hook = () => {}) {
  const calls = [], handlers = new Map();
  const state = { accountId: 'private-account', authAccountKey: 'private-auth-key', authGeneration: 1,
    driveSessionGeneration: 1, accountStateLoaded: true, accountMediaState: normalize(raw), token: 'private-token' };
  let localReplica = null;
  const context = { state, appVersion: 'test-version', expectedVersion: 'test-version', mutationsEnabled: false,
    location: { origin: 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev' },
    navigator: { serviceWorker: { controller: {} }, onLine: true }, document: { visibilityState: 'visible' },
    normalize, merge, mediaIdle: () => true, readLocalReplica: () => localReplica,
    addEventListener: (key, callback) => handlers.set(key, callback),
    removeEventListener: key => handlers.delete(key),
    credentialUsable: () => true,
    readDriveResponse: async (address, options) => {
      const url = new URL(address); calls.push({ url, options });
      hook({ context, calls, handlers });
      if (url.pathname.endsWith('/about')) return new Response(JSON.stringify({ user: { permissionId: state.accountId } }));
      if (url.searchParams.get('spaces') === 'appDataFolder') return new Response(JSON.stringify({ files: [{
        id: 'private-file', name: 'drive-original-account-state-v2-private-writer.json', modifiedTime: '2026-09-28T00:00:00Z', version: '1' }] }));
      return new Response(JSON.stringify(raw));
    } };
  return { context, calls, handlers, setLocal: value => { localReplica = value; } };
}

test('repeated complete remote reads and runtime reconstruction pass without private output or writes', async () => {
  const f = fixture(), audit = createBrowserStateAudit(f.context);
  const result = await audit.run();
  assert.equal(result.passed, true); assert.equal(result.capture.requests, 10);
  assert.equal(result.comparison.candidate.unliked, 1); assert.equal(result.runtimeReconstructionMatches, true);
  assert.equal(result.writeAuthorization, false); assert.equal(result.legacyLocalReplicaVerified, false);
  const text = JSON.stringify(result);
  for (const secret of ['private-account', 'private-auth-key', 'private-token', 'private-file', 'private-writer', 'seen']) {
    assert.equal(text.includes(secret), false);
  }
  assert.ok(f.calls.every(call => call.options.method === 'GET' && !call.options.body));
  assert.equal(f.handlers.size, 0);
  assert.equal((await audit.run()).failure, 'run_already_claimed');
});

test('pending candidate local state is separate from unchanged remote evidence', async () => {
  const f = fixture();
  const replica = { schemaVersion: 1, updatedAt: 40, favorites: { pending: { liked: true, updatedAt: 40 } }, viewed: {} };
  f.setLocal(replica); f.context.state.accountMediaState = merge(raw, replica);
  const result = await createBrowserStateAudit(f.context).run();
  assert.equal(result.passed, true); assert.equal(result.comparison.localPending, true);
  assert.equal(result.comparison.candidate.liked, 0); assert.equal(result.legacyLocalReplicaVerified, false);
});

test('foreground remote read in flight is permitted only while owner/projection/cache remain equivalent', async () => {
  for (const when of ['before', 'during']) {
    const loading = new Promise(() => {});
    const f = fixture(({ context, calls }) => {
      if (calls.length === 1) {
        context.state.accountStateLoadingPromise = loading;
        // Poll application may replace objects and persist the same replica.
        context.state.accountMediaState = normalize(raw);
        f.setLocal(structuredClone(raw));
      }
    });
    f.setLocal(structuredClone(raw));
    if (when === 'before') f.context.state.accountStateLoadingPromise = loading;
    const result = await createBrowserStateAudit(f.context).run();
    assert.equal(result.passed, true);
    assert.equal(result.capture.requests, 10);
    assert.equal(result.comparison.remoteEquivalent, true);
    assert.equal(result.runtimeReconstructionMatches, true);
    assert.equal(f.context.state.accountStateLoadingPromise, loading, 'audit neither waits for nor clears the product read');
    assert.equal(result.writeAuthorization, false); assert.equal(result.legacyLocalReplicaVerified, false);
    assert.equal(result.deviceVerified, false);
    assert.ok(f.calls.every(call => call.options.method === 'GET' && !call.options.body));
  }
});

test('write-sync ownership stays excluded before and during an audit even alongside benign read polling', async () => {
  const writing = new Promise(() => {});
  for (const when of ['before', 'during']) {
    const f = fixture(({ context }) => { context.state.accountStateSyncPromise = writing; });
    f.context.state.accountStateLoadingPromise = new Promise(() => {});
    if (when === 'before') f.context.state.accountStateSyncPromise = writing;
    const result = await createBrowserStateAudit(f.context).run();
    assert.equal(result.passed, false);
    assert.equal(result.failure, when === 'before' ? 'media_busy' : 'stale_owner');
    assert.equal(f.calls.length, when === 'before' ? 0 : 1);
    assert.equal(f.context.state.accountStateSyncPromise, writing);
  }
});

test('concurrent read polling cannot mask applied identity, projection, controller, readiness or lifecycle changes', async () => {
  const changes = [
    ({ context }) => { context.state.accountId = 'changed-account'; },
    ({ context }) => { context.state.authAccountKey = 'changed-auth'; },
    ({ context }) => { context.state.authGeneration++; },
    ({ context }) => { context.state.driveSessionGeneration++; },
    ({ context }) => { context.state.accountIdentityPending = true; },
    ({ context }) => { context.state.accountStateLoaded = false; },
    ({ context }) => { context.state.accountMediaState = normalize({}); },
    ({ context }) => { context.navigator.serviceWorker.controller = {}; },
    ({ context }) => { context.document.visibilityState = 'hidden'; },
    ({ setMediaActive }) => { setMediaActive(); },
    ({ handlers }) => { handlers.get('pagehide')(); }
  ];
  for (const change of changes) {
    let idle = true;
    const f = fixture(data => {
      data.context.state.accountStateLoadingPromise = new Promise(() => {});
      change({ ...data, setMediaActive: () => { idle = false; } });
    });
    f.context.mediaIdle = () => idle;
    const result = await createBrowserStateAudit(f.context).run();
    assert.equal(result.passed, false);
    assert.ok(['stale_owner', 'cancelled'].includes(result.failure));
    assert.equal(f.calls.length, 1); assert.equal(f.handlers.size, 0);
  }
});

test('concurrent poll changing the local replica alone fails final equality without exposing its contents', async () => {
  const f = fixture(({ context, calls }) => {
    context.state.accountStateLoadingPromise = new Promise(() => {});
    if (calls.length === 1) f.setLocal({ ...raw, viewed: { privateChangedCache: 30 } });
  });
  f.setLocal(structuredClone(raw));
  const result = await createBrowserStateAudit(f.context).run();
  assert.equal(result.passed, false); assert.equal(result.failure, 'stale_owner');
  assert.equal(f.calls.length, 10, 'cache fence remains a final equality check');
  assert.equal(JSON.stringify(result).includes('privateChangedCache'), false);
});

test('stale or incorrect runtime projection cannot pass a remote-only comparison', async () => {
  const f = fixture(); f.context.state.accountMediaState = normalize({});
  const result = await createBrowserStateAudit(f.context).run();
  assert.equal(result.comparison.remoteEquivalent, true); assert.equal(result.runtimeReconstructionMatches, false);
  assert.equal(result.passed, false);
});

test('anonymous, writes-enabled, wrong version and media-active contexts issue no reads', async () => {
  for (const mutate of [f => { f.context.state.accountId = ''; }, f => { f.context.mutationsEnabled = true; },
    f => { f.context.appVersion = 'stale'; }, f => { f.context.mediaIdle = () => false; }]) {
    const f = fixture(); mutate(f);
    assert.equal((await createBrowserStateAudit(f.context).run()).passed, false); assert.equal(f.calls.length, 0);
  }
});

test('account, SW controller, projection and lifecycle changes cancel without leaking raw errors', async () => {
  for (const change of [c => { c.state.authGeneration++; }, c => { c.navigator.serviceWorker.controller = {}; },
    c => { c.state.accountMediaState = normalize({}); }, (_, handlers) => { handlers.get('pagehide')(); }]) {
    const f = fixture(({ context, handlers }) => change(context, handlers));
    const result = await createBrowserStateAudit(f.context).run();
    assert.equal(result.passed, false); assert.ok(['stale_owner', 'cancelled'].includes(result.failure));
    assert.equal(f.calls.length, 1); assert.equal(f.handlers.size, 0);
  }
  const f = fixture(); f.context.readDriveResponse = async () => { throw new Error('private-provider-message'); };
  assert.equal((await createBrowserStateAudit(f.context).run()).failure, 'read_failed');
});

test('one overall deadline bounds a reader ignoring abort', async () => {
  const f = fixture(); f.context.readDriveResponse = () => new Promise(() => {});
  const result = await createBrowserStateAudit(f.context, { milliseconds: 15 }).run();
  assert.equal(result.failure, 'time_limit'); assert.equal(f.handlers.size, 0);
});

test('generated function is valid and anonymous app lexical context cannot call Drive', async () => {
  const source = await buildBrowserFunction(); let reads = 0;
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout,
    APP_VERSION: JSON.parse(fs.readFileSync(new URL('../../version.json', import.meta.url))).version,
    DRIVE_MUTATIONS_ENABLED: false, state: {}, q1Playback: null, normalizeAccountMediaState: normalize,
    mergeAccountMediaStates: merge, fetch: () => { reads++; }, hasUsableToken: () => false,
    location: { origin: 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev' },
    navigator: { serviceWorker: { controller: {} } }, document: { visibilityState: 'visible' },
    addEventListener() {}, removeEventListener() {}, localStorage: {}, accountStateCacheKey() {} });
  const result = await vm.runInContext(`(${source})()`, context);
  assert.equal(result.failure, 'account_not_ready'); assert.equal(reads, 0);
});

test('final synchronous comparison cannot return success beyond its deadline', async () => {
  const f = fixture(), now = Date.now; let time = 0, merges = 0;
  Date.now = () => time;
  f.context.merge = (a, b) => { if (++merges === 3) time = 2000; return merge(a, b); };
  try {
    const result = await createBrowserStateAudit(f.context, { milliseconds: 1000 }).run();
    assert.equal(result.failure, 'time_limit');
  } finally { Date.now = now; }
});

test('both captures share request and response-byte budgets', async () => {
  const requests = fixture();
  const originalRead = requests.context.readDriveResponse;
  requests.context.readDriveResponse = (url, options) => new URL(url).searchParams.has('spaces')
    ? Promise.resolve(new Response(JSON.stringify({ files: Array.from({ length: 47 }, (_, index) => ({
      id: 'file' + index, name: 'drive-original-account-state-v2-writer' + index + '.json',
      modifiedTime: '2026-09-28T00:00:00Z', version: '1' })) }))) : originalRead(url, options);
  assert.equal((await createBrowserStateAudit(requests.context).run()).failure, 'request_limit');
  const bytes = fixture(), read = bytes.context.readDriveResponse;
  bytes.context.readDriveResponse = (url, options) => new URL(url).searchParams.get('alt') === 'media'
    ? Promise.resolve(new Response(JSON.stringify({ ...raw, unused: 'x'.repeat(4_300_000) }))) : read(url, options);
  assert.equal((await createBrowserStateAudit(bytes.context).run()).failure, 'byte_limit');
});

test('generated authenticated function uses raw GET once and returns only safe aggregates', async () => {
  const f = fixture(), headers = [];
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, URL, URLSearchParams, Response,
    TextDecoder, Uint8Array, APP_VERSION: JSON.parse(fs.readFileSync(new URL('../../version.json', import.meta.url))).version,
    DRIVE_MUTATIONS_ENABLED: false, state: { ...f.context.state, mediaAttempt: 'idle',
      accountStateLoadingPromise: new Promise(() => {}) }, q1Playback: null,
    q1RetirementResult: { settled: true },
    normalizeAccountMediaState: normalize, mergeAccountMediaStates: merge, hasUsableToken: () => true,
    fetch: (url, options) => { headers.push(options); return f.context.readDriveResponse(url, options); },
    location: f.context.location, navigator: f.context.navigator, document: f.context.document,
    addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null }, accountStateCacheKey: () => 'key' });
  const result = await vm.runInContext(`(${await buildBrowserFunction()})()`, context);
  assert.equal(result.passed, true); assert.equal(headers.length, 10);
  assert.ok(headers.every(options => options.method === 'GET' && options.redirect === 'error'
    && options.credentials === 'omit' && options.headers.Authorization === 'Bearer private-token'));
  assert.equal(JSON.stringify(result).includes('private-'), false);
});

test('generated function blocks idle-looking media with pending or unconfirmed whole-owner retirement before Drive reads', async () => {
  const source = await buildBrowserFunction();
  for (const retirement of [null, { settled: false }, undefined]) {
    const f = fixture(); let reads = 0;
    const context = vm.createContext({ AbortController, setTimeout, clearTimeout,
      APP_VERSION: JSON.parse(fs.readFileSync(new URL('../../version.json', import.meta.url))).version,
      DRIVE_MUTATIONS_ENABLED: false, state: { ...f.context.state, mediaAttempt: 'idle' }, q1Playback: null,
      q1RetirementResult: retirement, normalizeAccountMediaState: normalize, mergeAccountMediaStates: merge,
      hasUsableToken: () => true, fetch: () => { reads++; throw new Error('must not read Drive'); },
      location: f.context.location, navigator: f.context.navigator, document: f.context.document,
      addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null }, accountStateCacheKey: () => 'key' });
    const result = await vm.runInContext(`(${source})()`, context);
    assert.equal(result.failure, 'media_busy');
    assert.equal(result.passed, false); assert.equal(result.writeAuthorization, false);
    assert.equal(reads, 0);
  }
});

test('non-success raw response is rejected without consuming its unbounded JSON error body', async () => {
  const f = fixture(); let consumed = false;
  f.context.readDriveResponse = async () => ({ ok: false, status: 403,
    json: async () => { consumed = true; return new Promise(() => {}); } });
  assert.equal((await createBrowserStateAudit(f.context).run()).failure, 'read_failed');
  assert.equal(consumed, false);
});
