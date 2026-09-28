import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { collectSnapshot } from '../v2-state-snapshot/snapshot.mjs';
import { createRecoveryBackup } from '../v2-state-recovery-backup/backup.mjs';
import { buildOwnWriterFactory } from './build-browser-factory.mjs';

const rootSource = fs.readFileSync(new URL('./runtime-facade.function.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const between = (start, end) => { const a = app.indexOf(start), b = app.indexOf(end, a); assert.ok(a >= 0 && b > a); return app.slice(a, b); };
const functions = between('function createEmptyAccountMediaState()', 'function accountFavoriteIds(')
  + between('function accountMediaStatesEqual(', 'function applyMergedAccountMediaState(')
  + between('function accountStateCacheKey(', 'function readCachedAccountMediaState(');
const factorySource = await buildOwnWriterFactory();
const account = 'private-synthetic-account', writer = 'private-candidate-writer';
const cacheKey = 'drive-original.account-state.' + account, writerKey = 'drive-original.account-writer';
const journalKey = 'drive-original.qa.own-writer.synthetic-claim';
const version = '1.22.0-rc.10', token = 'SYNTHETIC_TOKEN_NEVER_JOURNALED';
const ownName = `drive-original-account-state-v2-${writer}.json`;
const raw = (favorites = {}, viewed = {}, updatedAt = 30) => ({ schemaVersion: 1, updatedAt, favorites, viewed });
const seed = [
  { id: 'private-legacy', name: 'drive-original-account-state.json', modifiedTime: '2026-09-28T00:00:01Z', version: '1',
    raw: raw({ privateTie: { liked: true, updatedAt: 20 } }, { privateSeen: 10 }) },
  { id: 'private-old-writer', name: 'drive-original-account-state-v2-private-old-writer.json', modifiedTime: '2026-09-28T00:00:02Z', version: '2',
    raw: raw({ privateTie: { liked: false, updatedAt: 20 } }, { privateSeen: 30 }) }
];
class Target extends EventTarget {
  callbacks = new Set();
  addEventListener(type, fn, options) { this.callbacks.add(fn); super.addEventListener(type, fn, options); }
  removeEventListener(type, fn, options) { this.callbacks.delete(fn); super.removeEventListener(type, fn, options); }
}
function tracked(signal) {
  const callbacks = new Set(), add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (type, fn, options) => { callbacks.add(fn); add(type, fn, options); };
  signal.removeEventListener = (type, fn, options) => { callbacks.delete(fn); remove(type, fn, options); };
  return callbacks;
}
async function fixture(hook = () => {}, storageHook = () => true) {
  const docs = structuredClone(seed), entries = new Map(), writes = [], network = [], events = new Target();
  const accountAbort = new AbortController(), accountListeners = tracked(accountAbort.signal);
  let held = false, lockCalls = 0, cancellations = 0, nativeProof = version, f;
  const context = vm.createContext({ AbortController, Uint8Array, TextEncoder, TextDecoder, URL, URLSearchParams, setTimeout, clearTimeout,
    window: events, document: { visibilityState: 'visible' }, location: { origin: 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev' },
    navigator: { onLine: true, serviceWorker: { controller: { state: 'activated' } }, locks: { request: async (name, options, task) => {
      assert.equal(name, `drive-original:account:${account}:${writer}`); assert.ok(options.signal instanceof AbortSignal);
      assert.equal(held, false); lockCalls++; held = true;
      try { return await task(); } finally { held = false; }
    } } }, APP_VERSION: version, DRIVE_MUTATIONS_ENABLED: false, ACCOUNT_STATE_SCHEMA_VERSION: 1,
    ACCOUNT_STATE_CACHE_PREFIX: 'drive-original.account-state.', ACCOUNT_WRITER_STORAGE_KEY: writerKey,
    q1RetirementResult: { settled: true }, q1Playback: null, playerMediaPriorityActive: false, mediaSourceGeneration: 8,
    localStorage: { getItem: key => entries.get(key) ?? null, setItem: (key, value) => {
      assert.equal(key, journalKey, 'no real cache/writer modification'); writes.push(value);
      if (storageHook({ key, value, f })) entries.set(key, value);
    } }, driveFetch() { assert.fail('NO_PRODUCT_TRANSPORT'); }, requestDriveCredential() { assert.fail('NO_REFRESH'); },
    hasUsableToken: () => context.usable, usable: true
  });
  context.top = context.self = {};
  vm.runInContext(functions, context);
  const normalize = value => JSON.parse(JSON.stringify(context.normalizeAccountMediaState(value)));
  const merge = (a, b) => JSON.parse(JSON.stringify(context.mergeAccountMediaStates(a, b)));
  const remote = merge(normalize(seed[0].raw), normalize(seed[1].raw));
  const projection = merge(remote, raw({}, { privatePending: 40 }, 40));
  entries.set(cacheKey, ' ' + JSON.stringify(projection) + '\n'); entries.set(writerKey, writer);
  context.state = { accountId: account, authAccountKey: 'private-auth-key', authGeneration: 2, driveSessionGeneration: 3,
    tokenRevision: 4, token, expiresAt: Date.now() + 600_000, authStatus: 'online', demo: false,
    accountStateLoaded: true, accountIdentityPending: false, accountStateSyncPromise: null, accountStateLoadingPromise: null,
    accountStateAbortController: accountAbort, accountMediaState: projection, accountStateWriterId: writer, accountStateRevision: 5,
    accountStateReadCache: new Map(seed.map(file => [file.id, { data: normalize(file.raw) }])), mediaSession: 6,
    selected: null, mediaAttempt: 'idle', mediaAbortController: null, pendingOriginalBuffer: null,
    pendingPlay: false, mediaTransportStarted: false };
  const provider = address => {
    const url = new URL(address);
    if (url.pathname.endsWith('/about')) return new Response(JSON.stringify({ user: { permissionId: account } }));
    if (url.searchParams.get('alt') !== 'media') return new Response(JSON.stringify({ files: docs.map(({ raw, ...file }) => file) }));
    const found = docs.find(file => file.id === decodeURIComponent(url.pathname.split('/').pop())); assert.ok(found, 'catalog-derived body ID only');
    return new Response(JSON.stringify(found.raw));
  };
  const snapshot = await collectSnapshot({ read: async (url, options) => { assert.equal(options.method, 'GET'); return provider(url); }, normalize, merge, expectedAccountId: account });
  const candidate = { accountId: account, cacheText: entries.get(cacheKey), runtimeProjection: projection, pending: true,
    writerId: writer, writerStorageText: writer };
  const legacyLocal = { privateTransport: true, origin: 'https://okjoizj-org.github.io', pathname: '/drive-original/version.json',
    accountId: account, rawText: JSON.stringify(raw({ privateTie: { liked: false, updatedAt: 20 } }, { privateSeen: 10 })),
    writerId: 'private-old-writer', writerRead: true, repeatedReadsEqual: true };
  const backup = createRecoveryBackup({ remoteSnapshot: snapshot, candidate, legacyLocal, normalize, merge, expectedAccountId: account }).privatePayload;
  context.fetch = async (address, options) => {
    const url = new URL(address); network.push({ url, options });
    assert.equal(held, true); assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(options.headers.Authorization, 'Bearer ' + token); assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); assert.ok(options.signal instanceof AbortSignal);
    const changed = await hook({ f, url, options }); if (changed) return changed;
    if (options.method === 'GET') return provider(address);
    assert.equal(options.method, 'POST');
    assert.equal(url.href, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime');
    const claim = JSON.parse(entries.get(journalKey)); assert.equal(claim.stage, 'attempt_claimed');
    assert.equal(claim.writeAttempts, 1); assert.equal(claim.writerId, writer);
    const parts = options.body.split('\r\n'), metadata = JSON.parse(parts[3]), body = JSON.parse(parts[7]);
    assert.deepEqual(metadata, { name: ownName, mimeType: 'application/json', parents: ['appDataFolder'] });
    assert.deepEqual(body, projection);
    docs.push({ id: 'private-new-own-doc', name: ownName, modifiedTime: '2026-09-28T00:00:04Z', version: '1', raw: body });
    return { status: 200, body: { cancel: async () => { cancellations++; } }, json() { assert.fail('NO_UPLOAD_JSON_READ'); } };
  };
  const facade = vm.runInContext(`(${rootSource})`, context), factory = vm.runInContext(factorySource, context);
  f = { context, docs, entries, writes, network, events, accountAbort, accountListeners, backup,
    get held() { return held; }, get lockCalls() { return lockCalls; }, get cancellations() { return cancellations; },
    setProof: value => { nativeProof = value; }, start: (selectedFactory = factory) => facade.call(selectedFactory, backup, { get: () => ({ version: nativeProof }) }, journalKey) };
  return f;
}
const cleanup = f => { assert.equal(f.events.callbacks.size, 0); assert.equal(f.accountListeners.size, 0); };

test('root facade + real bundled factory call native writer lock, durable journal, one status-only POST and independent raw reads', async () => {
  const f = await fixture(); const oldDocs = structuredClone(f.docs), oldCache = f.entries.get(cacheKey);
  const handle = f.start(), result = await handle.run();
  assert.equal(result.passed, true); assert.equal(f.lockCalls, 1); assert.equal(f.held, false);
  assert.equal(f.network.filter(call => call.options.method === 'POST').length, 1); assert.equal(f.cancellations, 1);
  assert.deepEqual(f.docs.slice(0, 2), oldDocs); assert.equal(f.entries.get(cacheKey), oldCache); assert.equal(f.entries.get(writerKey), writer);
  assert.deepEqual(f.writes.map(text => JSON.parse(text).stage), ['attempt_claimed', 'confirmed']);
  for (const text of f.writes) for (const secret of [token, 'private-auth-key', 'Authorization', 'headers', 'expiresAt']) assert.equal(text.includes(secret), false);
  assert.equal(handle.poll().posts, 1); assert.equal(handle.poll().done, true); assert.equal(handle.poll().ownerCurrent, true);
  assert.equal(JSON.stringify(handle.poll()).includes('private-'), false); cleanup(f); handle.clear(); cleanup(f);
});

test('mandatory native lock/token margin/unused journal/globalfalse/controller/account/cache/media preflight rejects before native POST', async () => {
  const mutations = [
    f => delete f.context.navigator.locks, f => f.context.state.expiresAt = Date.now() + 50_000,
    f => f.entries.set(journalKey, '{}'), f => f.context.DRIVE_MUTATIONS_ENABLED = true,
    f => f.context.navigator.serviceWorker.controller.state = 'installing', f => f.setProof('wrong'),
    f => f.context.state.accountStateSyncPromise = Promise.resolve(), f => f.context.state.accountIdentityPending = true,
    f => f.entries.set(cacheKey, null), f => f.entries.set(writerKey, 'other-writer'),
    f => f.context.state.selected = {}, f => f.context.q1RetirementResult = null,
    f => f.context.document.visibilityState = 'hidden', f => f.context.usable = false
  ];
  for (const mutate of mutations) {
    const f = await fixture(); mutate(f); assert.throws(() => f.start(), /OWN_WRITER_PREFLIGHT_REJECTED/);
    assert.equal(f.network.length, 0); assert.equal(f.writes.length, 0); cleanup(f);
  }
  const oldWriter = await fixture(); oldWriter.backup.candidate.writerId = oldWriter.backup.legacyLocal.writerId;
  assert.throws(() => oldWriter.start(), cause => cause.code === 'invalid_contract'); assert.equal(oldWriter.network.length, 0); cleanup(oldWriter);
});

test('post-await owner/token/revision/raw cache/media/controller fences prevent dispatch and remove listeners', async () => {
  const mutations = [
    f => f.context.state.accountId = 'other', f => f.context.state.authAccountKey = 'other',
    f => f.context.state.authGeneration++, f => f.context.state.driveSessionGeneration++,
    f => f.context.state.tokenRevision++, f => f.context.state.token += 'changed', f => f.context.state.expiresAt++,
    f => f.context.state.accountStateRevision++, f => f.context.state.accountMediaState.viewed.privateSeen++,
    f => f.entries.set(cacheKey, f.entries.get(cacheKey) + ' '), f => f.entries.set(writerKey, 'different-writer'),
    f => f.context.navigator.serviceWorker.controller = { state: 'activated' }, f => f.context.mediaSourceGeneration++,
    f => f.context.state.mediaSession++, f => f.context.q1RetirementResult = { settled: true },
    f => f.context.state.accountStateAbortController = new AbortController(), f => f.context.state.accountStateSyncPromise = Promise.resolve()
  ];
  for (const mutate of mutations) {
    const f = await fixture(({ f }) => { mutate(f); }); const handle = f.start(), result = await handle.run();
    assert.equal(result.passed, false); assert.equal(handle.poll().posts, 0); assert.equal(f.writes.length, 0); cleanup(f);
  }
});

test('benign loading remains allowed; journal readback failure denies native POST; confirmation storage failure never falsely passes', async () => {
  const good = await fixture(({ f }) => { f.context.state.accountStateLoadingPromise = Promise.resolve(); });
  assert.equal((await good.start().run()).passed, true); cleanup(good);
  for (const stage of ['attempt_claimed', 'confirmed']) {
    const f = await fixture(undefined, ({ value }) => JSON.parse(value).stage !== stage);
    const handle = f.start(), result = await handle.run(); assert.equal(result.passed, false);
    assert.equal(handle.poll().posts, stage === 'confirmed' ? 1 : 0); assert.equal(result.confirmedByIndependentRawRead, false); cleanup(f);
  }
});

test('page/account cancellation and clear abort pending native read and clean old owner listeners; construction failure cleans too', async () => {
  for (const event of ['pagehide', 'beforeunload', 'account', 'clear']) {
    let entered; const started = new Promise(resolve => { entered = resolve; }); let nativeSignal;
    const f = await fixture(({ options }) => { nativeSignal = options.signal; entered(); return new Promise(() => {}); });
    const handle = f.start(), run = handle.run(); await started;
    if (event === 'account') f.accountAbort.abort(); else if (event === 'clear') handle.clear(); else f.events.dispatchEvent(new Event(event));
    const result = await run; assert.equal(result.passed, false); assert.equal(nativeSignal.aborted, true); assert.equal(handle.poll().posts, 0); cleanup(f);
  }
  const failed = await fixture(); assert.throws(() => failed.start(() => { throw new Error('synthetic construction'); }), /synthetic construction/); cleanup(failed);
});

test('native POST response loss/cancellation never replays CREATE and retains recoverable attempt journal', async () => {
  for (const scenario of ['lost-response', 'account-abort']) {
    const f = await fixture(({ f, options }) => {
      if (options.method !== 'POST') return;
      assert.equal(JSON.parse(f.entries.get(journalKey)).stage, 'attempt_claimed');
      if (scenario === 'account-abort') f.accountAbort.abort();
      throw new Error('synthetic lost POST response');
    });
    const handle = f.start(), result = await handle.run();
    assert.equal(result.passed, false); assert.equal(result.failure, 'submission_uncertain');
    assert.equal(handle.poll().posts, 1); assert.equal(f.network.filter(call => call.options.method === 'POST').length, 1);
    assert.equal(JSON.parse(handle.privateJournal()).stage, 'attempt_claimed');
    assert.equal((await handle.run()).failure, 'already_claimed'); cleanup(f);
  }
});

test('root native GET policy and pre-claim POST policy are narrow; reviewed factory supplies multipart/body-ID authority', async () => {
  const f = await fixture(); let deps;
  const fake = values => { deps = values; return { run: async () => ({}), safeSummary: () => ({}), clear() {} }; };
  const handle = f.start(fake); const options = { method: 'GET', signal: new AbortController().signal };
  for (const url of ['https://other.test/drive/v3/about?fields=user(permissionId)',
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
    'https://www.googleapis.com/drive/v3/files?spaces=drive&pageSize=1000&q=trashed%3Dfalse&fields=id',
    'https://www.googleapis.com/drive/v3/files/original?alt=media&fields=id']) {
    assert.throws(() => deps.read(url, options), cause => cause.code === 'write_policy');
  }
  const about = 'https://www.googleapis.com/drive/v3/about?fields=user(permissionId)';
  for (const extra of [{ method: 'PATCH' }, { headers: { Authorization: 'DO_NOT_INJECT' } }, { body: '{}' }]) {
    assert.throws(() => deps.read(about, { ...options, ...extra }), cause => cause.code === 'write_policy');
  }
  await assert.rejects(deps.dispatch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
    { method: 'POST', signal: options.signal, headers: {}, body: '{}' }), cause => cause.code === 'write_policy');
  assert.equal(f.network.length, 0); assert.equal(f.writes.length, 0); handle.clear(); cleanup(f);
  // These closures are not UI APIs. Exact reviewed factory source supplies
  // appData catalog-derived IDs and validates exact multipart metadata/body;
  // facade alone is not a generic file-ID or multipart authorization engine.
});
