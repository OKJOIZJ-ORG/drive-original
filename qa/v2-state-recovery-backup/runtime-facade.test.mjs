import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildRecoveryBackupFactory } from './build-browser-factory.mjs';

const facadeSource = fs.readFileSync(new URL('./runtime-facade.function.js', import.meta.url), 'utf8');
const product = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const slice = (start, end) => {
  const a = product.indexOf(start), b = product.indexOf(end, a);
  assert.ok(a >= 0 && b > a); return product.slice(a, b);
};
const productFunctions = slice('function createEmptyAccountMediaState()', 'function accountFavoriteIds(')
  + slice('function accountMediaStatesEqual(', 'function applyMergedAccountMediaState(')
  + slice('function accountStateCacheKey(', 'function readCachedAccountMediaState(');
const publicFactorySource = await buildRecoveryBackupFactory();
const version = '1.22.0-rc.10';
const account = 'synthetic-private-account';
const cacheKey = 'drive-original.account-state.' + account;
const writerKey = 'drive-original.account-writer';
const origin = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const raw = (favorites = {}, viewed = {}, updatedAt = 30) => ({ schemaVersion: 1, updatedAt, favorites, viewed });
const docs = [
  { id: 'private-legacy-doc', name: 'drive-original-account-state.json', modifiedTime: '2026-09-28T00:00:01Z', version: '1',
    raw: { updatedAt: 20, favorites: { privateTie: { liked: true, updatedAt: 20 } }, viewed: { privateViewed: 10 } } },
  { id: 'private-writer-doc', name: 'drive-original-account-state-v2-private-legacy-writer.json', modifiedTime: '2026-09-28T00:00:02Z', version: '2',
    raw: raw({ privateTie: { liked: false, updatedAt: 20 } }, { privateViewed: 30 }) }
];
class TrackedTarget extends EventTarget {
  listeners = new Map();
  addEventListener(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback); super.addEventListener(type, callback, options);
  }
  removeEventListener(type, callback, options) {
    this.listeners.get(type)?.delete(callback); super.removeEventListener(type, callback, options);
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, values) => sum + values.size, 0); }
}
function trackSignal(signal) {
  const callbacks = new Set();
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (type, callback, options) => { if (type === 'abort') callbacks.add(callback); add(type, callback, options); };
  signal.removeEventListener = (type, callback, options) => { if (type === 'abort') callbacks.delete(callback); remove(type, callback, options); };
  return callbacks;
}
function fixture(hook = () => {}) {
  const entries = new Map(), reads = [], dispatches = [], windows = new TrackedTarget();
  const accountAbort = new AbortController(), accountListeners = trackSignal(accountAbort.signal);
  const providerDocs = structuredClone(docs);
  const context = vm.createContext({ AbortController, Uint8Array, TextEncoder, TextDecoder, URL, URLSearchParams,
    setTimeout, clearTimeout, navigator: { onLine: true, serviceWorker: { controller: { state: 'activated' } } },
    document: { visibilityState: 'visible' }, location: { origin }, window: windows,
    APP_VERSION: version, DRIVE_MUTATIONS_ENABLED: false, ACCOUNT_STATE_SCHEMA_VERSION: 1,
    ACCOUNT_STATE_CACHE_PREFIX: 'drive-original.account-state.', ACCOUNT_WRITER_STORAGE_KEY: writerKey,
    q1RetirementResult: { settled: true }, q1Playback: null, playerMediaPriorityActive: false, mediaSourceGeneration: 9,
    localStorage: { getItem: key => { reads.push(key); return entries.get(key) ?? null; } },
    driveFetch() { assert.fail('NO_DRIVE_FETCH'); }, requestDriveCredential() { assert.fail('NO_REFRESH'); },
    refreshAccessToken() { assert.fail('NO_REFRESH'); }
  });
  context.top = context.self = {};
  vm.runInContext(productFunctions, context);
  const normalize = value => JSON.parse(JSON.stringify(context.normalizeAccountMediaState(value)));
  const merge = (a, b) => JSON.parse(JSON.stringify(context.mergeAccountMediaStates(a, b)));
  const remote = merge(normalize(docs[0].raw), normalize(docs[1].raw));
  const projection = merge(remote, raw({}, { privatePending: 40 }, 40));
  entries.set(cacheKey, ' ' + JSON.stringify(projection) + '\n'); entries.set(writerKey, 'private-candidate-writer');
  context.state = { accountMediaState: projection, accountId: account, authAccountKey: 'private-auth-key',
    authGeneration: 2, driveSessionGeneration: 3, tokenRevision: 4, token: 'SYNTHETIC_CREDENTIAL_NEVER_BACKED_UP',
    expiresAt: Date.now() + 600_000, accountStateAbortController: accountAbort, authStatus: 'online', demo: false,
    accountStateLoaded: true, accountIdentityPending: false, accountStateSyncPromise: null, accountStateLoadingPromise: null,
    accountStateReadCache: new Map([['private-legacy-doc', { data: normalize(docs[0].raw) }], ['private-writer-doc', { data: normalize(docs[1].raw) }]]),
    accountStateWriterId: 'private-candidate-writer', mediaSession: 10, selected: null, mediaAttempt: 'idle',
    mediaAbortController: null, pendingOriginalBuffer: null, pendingPlay: false, mediaTransportStarted: false };
  context.usable = true;
  context.hasUsableToken = () => context.usable;
  context.fetch = async (address, options) => {
    const url = new URL(address); dispatches.push({ url, options });
    assert.equal(options.method, 'GET'); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error'); assert.equal(options.priority, 'low');
    assert.deepEqual(Object.keys(options.headers), ['Authorization']);
    assert.equal(options.headers.Authorization, 'Bearer SYNTHETIC_CREDENTIAL_NEVER_BACKED_UP');
    assert.ok(options.signal instanceof AbortSignal);
    const route = url.pathname.endsWith('/about') ? 'account' : url.searchParams.get('alt') === 'media' ? 'body' : 'catalog';
    const replacement = await hook({ route, context, entries, windows, accountAbort, providerDocs, dispatches, options, url });
    if (replacement) return replacement;
    if (route === 'account') return new Response(JSON.stringify({ user: { permissionId: account } }));
    if (route === 'catalog') return new Response(JSON.stringify({ files: providerDocs.map(({ raw, ...metadata }) => metadata) }));
    const found = providerDocs.find(file => file.id === decodeURIComponent(url.pathname.split('/').pop()));
    assert.ok(found, 'reviewed collector body URL must originate in validated appData catalog');
    return new Response(JSON.stringify(found.raw));
  };
  const legacyLocal = { privateTransport: true, origin: 'https://okjoizj-org.github.io', pathname: '/drive-original/version.json',
    accountId: account, rawText: JSON.stringify(raw({ privateTie: { liked: false, updatedAt: 20 } }, { privateViewed: 10 }, 20)),
    writerId: 'private-legacy-writer', writerRead: true, repeatedReadsEqual: true };
  let proofVersion = version;
  const swProof = { get: () => ({ version: proofVersion }) };
  const facade = vm.runInContext(`(${facadeSource})`, context);
  const factory = vm.runInContext(publicFactorySource, context);
  return { context, entries, reads, dispatches, windows, accountAbort, accountListeners, legacyLocal, swProof,
    setProofVersion: value => { proofVersion = value; }, start: (selectedFactory = factory) => facade.call(selectedFactory, legacyLocal, swProof) };
}
function cleaned(f) { assert.equal(f.windows.listenerCount, 0); assert.equal(f.accountListeners.size, 0); }

test('actual browser factory + root facade + product merge preserve pending state with GET-only catalog-derived reads and no credential backup', async () => {
  const f = fixture(); const before = [...f.entries];
  const handle = f.start(); assert.equal(f.windows.listenerCount, 2); assert.equal(f.accountListeners.size, 1);
  await handle.settled(); const result = handle.poll();
  assert.equal(result.done, true); assert.equal(result.summary.passed, true); assert.equal(result.ownerCurrent, true);
  assert.equal(result.summary.candidatePending, true); assert.equal(result.summary.candidateIncludesLegacy, true);
  assert.equal(result.summary.projectClientBindingVerified, false); assert.equal(result.nativeDispatches, 6);
  assert.deepEqual([...f.entries], before); assert.ok(f.reads.every(key => [cacheKey, writerKey].includes(key)));
  const text = handle.privateText(); const parsed = JSON.parse(text);
  for (const secret of ['SYNTHETIC_CREDENTIAL_NEVER_BACKED_UP', 'private-auth-key', 'Authorization', 'expiresAt']) assert.equal(text.includes(secret), false);
  assert.equal(parsed.remote.files.length, 2); assert.equal(parsed.remote.remote.favorites.privateTie.liked, false);
  assert.equal(parsed.remote.remote.viewed.privateViewed, 30); assert.equal(parsed.candidate.runtimeProjection.viewed.privatePending, 40);
  assert.equal(Object.hasOwn(parsed.remote.remote.viewed, 'privatePending'), false);
  assert.equal(parsed.candidate.cacheText, f.entries.get(cacheKey)); assert.equal(handle.verifyReread(text).rereadEquivalent, true);
  assert.equal(JSON.stringify(result).includes('private-'), false); cleaned(f); handle.clear(); cleaned(f);
});

test('preflight owner/credential/controller/media/visibility/write gates reject with zero native dispatches', () => {
  const scenarios = [
    f => f.context.DRIVE_MUTATIONS_ENABLED = true, f => f.context.APP_VERSION = 'wrong',
    f => f.context.location.origin = 'https://wrong.test', f => f.context.top = {},
    f => f.context.navigator.onLine = false, f => f.context.document.visibilityState = 'hidden',
    f => f.context.navigator.serviceWorker.controller.state = 'installing', f => f.setProofVersion('wrong'),
    f => f.context.usable = false, f => f.context.state.authStatus = 'offline', f => f.context.state.demo = true,
    f => f.context.state.accountStateLoaded = false, f => f.context.state.accountIdentityPending = true,
    f => f.context.state.accountStateSyncPromise = Promise.resolve(), f => f.accountAbort.abort(),
    f => f.context.q1RetirementResult = null, f => f.context.q1RetirementResult = { settled: false },
    f => f.context.q1Playback = {}, f => f.context.playerMediaPriorityActive = true,
    f => f.context.state.selected = {}, f => f.context.state.pendingPlay = true,
    f => f.context.state.mediaAttempt = 'loading', f => f.context.state.pendingOriginalBuffer = {},
    f => f.context.state.mediaTransportStarted = true, f => f.context.state.mediaAbortController = new AbortController(),
    f => f.context.state.accountStateWriterId = null, f => f.entries.set(cacheKey, null)
  ];
  for (const mutate of scenarios) {
    const f = fixture(); mutate(f); assert.throws(() => f.start(), /BACKUP_PREFLIGHT_REJECTED/);
    assert.equal(f.dispatches.length, 0); cleaned(f);
  }
});

test('post-await identity/token revision/abort/controller/projection/exact cache/writer/lifecycle changes fail closed and release listeners', async () => {
  const scenarios = [
    f => f.context.state.accountId = 'other', f => f.context.state.authAccountKey = 'other',
    f => f.context.state.authGeneration++, f => f.context.state.driveSessionGeneration++,
    f => f.context.state.tokenRevision++, f => f.context.state.token += 'changed', f => f.context.state.expiresAt++,
    f => f.context.state.accountStateAbortController = new AbortController(),
    f => f.context.navigator.serviceWorker.controller = { state: 'activated' },
    f => f.setProofVersion('wrong'), f => f.context.navigator.onLine = false,
    f => f.context.state.accountMediaState.viewed.privateViewed++, f => f.entries.set(cacheKey, f.entries.get(cacheKey) + ' '),
    f => f.entries.set(writerKey, 'different-writer'), f => f.context.state.accountStateWriterId = 'different-writer',
    f => f.context.state.mediaSession++, f => f.context.mediaSourceGeneration++,
    f => f.context.q1RetirementResult = { settled: true }, f => f.context.document.visibilityState = 'hidden',
    f => f.context.state.accountStateSyncPromise = Promise.resolve()
  ];
  for (const mutate of scenarios) {
    let f; f = fixture(() => { mutate(f); }); const handle = f.start(); await handle.settled();
    assert.equal(handle.poll().summary.passed, false); assert.equal(handle.poll().summary.failure, 'stale_owner');
    assert.equal(f.dispatches.length, 1); assert.throws(() => handle.privateText(), /backup_unavailable/); cleaned(f);
  }
});

test('benign LoadingPromise is allowed, but cached-remote pending hint is independently checked against fresh remote snapshot', async () => {
  const f = fixture(({ context }) => { context.state.accountStateLoadingPromise = Promise.resolve(); });
  const successful = f.start(); await successful.settled(); assert.equal(successful.poll().summary.passed, true); cleaned(f);
  const staleHint = fixture();
  staleHint.context.state.accountStateReadCache = new Map([['stale-hint', { data: staleHint.context.state.accountMediaState }]]);
  const failed = staleHint.start(); await failed.settled();
  assert.equal(failed.poll().summary.failure, 'pending_mismatch'); assert.equal(failed.poll().nativeDispatches, 6); cleaned(staleHint);
});

test('original-media catalog injection is rejected by actual collector before any body read', async () => {
  const f = fixture(({ route }) => route === 'catalog' ? new Response(JSON.stringify({ files: [{
    id: 'private-original-media', name: 'private-original.mp4', modifiedTime: '2026-09-28T00:00:01Z', version: '1'
  }] })) : null);
  const handle = f.start(); await handle.settled();
  assert.equal(handle.poll().summary.failure, 'unexpected_file');
  assert.equal(f.dispatches.length, 2);
  assert.ok(f.dispatches.every(({ url }) => url.searchParams.get('alt') !== 'media'));
  cleaned(f);
});

test('pagehide/beforeunload/account abort cancel pending native fetch and clean exact old owner listeners', async () => {
  for (const action of ['pagehide', 'beforeunload', 'accountAbort', 'clear']) {
    let f; let fetchSignal;
    f = fixture(({ options }) => { fetchSignal = options.signal; return new Promise(() => {}); });
    const handle = f.start();
    assert.equal(f.windows.listenerCount, 2); assert.equal(f.accountListeners.size, 1);
    if (action === 'accountAbort') f.accountAbort.abort();
    else if (action === 'clear') handle.clear();
    else f.windows.dispatchEvent(new Event(action));
    await handle.settled(); assert.equal(fetchSignal.aborted, true);
    assert.equal(handle.poll().done, true); assert.equal(handle.poll().summary.passed, false);
    assert.ok(['cancelled', 'backup_cleared'].includes(handle.poll().summary.failure)); cleaned(f);
  }
});

test('provider failure and factory construction error preserve safe output and release listeners', async () => {
  let consumed = false;
  const f = fixture(() => ({ ok: false, status: 403, body: { getReader() { consumed = true; assert.fail('NO_ERROR_BODY_READ'); } } }));
  const handle = f.start(); await handle.settled(); assert.equal(handle.poll().summary.failure, 'read_failed');
  assert.equal(consumed, false); assert.equal(handle.poll().nativeDispatches, 1); cleaned(f);
  const constructorError = fixture(); assert.throws(() => constructorError.start(() => { throw new Error('synthetic factory failure'); }), /synthetic factory failure/);
  cleaned(constructorError); assert.equal(constructorError.dispatches.length, 0);
});

test('facade rejects other origins/methods/catalog queries; body-ID restriction comes from trusted reviewed collector, not generic transport capability', async () => {
  const f = fixture(); let transport;
  // Scope probe only, deliberately replacing the trusted factory to inspect the
  // private read closure. Production wiring must bind the reviewed exact source.
  const fake = dependencies => { transport = dependencies.read; return { capture: async () => {}, safeSummary: () => ({ passed: false }),
    readPrivateText: () => '', verifyReread: () => ({}), clear() {} }; };
  const handle = f.start(fake); await handle.settled();
  const options = { method: 'GET', signal: new AbortController().signal };
  const catalog = new URL('https://www.googleapis.com/drive/v3/files');
  for (const [key, value] of Object.entries({ spaces: 'appDataFolder', pageSize: '1000',
    q: "(name = 'drive-original-account-state.json' or name contains 'drive-original-account-state-v2-') and trashed = false",
    fields: 'nextPageToken,incompleteSearch,files(id,name,modifiedTime,version)' })) catalog.searchParams.set(key, value);
  const wrongQ = new URL(catalog); wrongQ.searchParams.set('q', 'trashed = false');
  const wrongFamily = new URL(catalog); wrongFamily.searchParams.set('spaces', 'drive');
  for (const [address, extra] of [
    ['https://other.test/drive/v3/about?fields=user(permissionId)', {}],
    ['https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {}],
    [catalog.href, { method: 'PATCH' }], [wrongQ.href, {}], [wrongFamily.href, {}],
    [catalog.href, { headers: { Authorization: 'PRIVATE' } }], [catalog.href, { body: '{}' }],
    ['https://www.googleapis.com/drive/v3/files/private-original?alt=media&fields=id', {}]
  ]) assert.throws(() => transport(address, { ...options, ...extra }), cause => cause.code === 'invalid_transport');
  assert.equal(f.dispatches.length, 0); cleaned(f);
  // The regular actual-factory integration test asserts every body read ID came
  // from its appData catalog. An arbitrary syntactically valid body URL is not
  // an API available to UI callers; do not describe this facade as an ID allowlist.
});
