import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { getEventListeners } from 'node:events';
import { buildFreshCacheFactory } from './fresh-cache-build.mjs';

const built = await buildFreshCacheFactory();
const facadeText = await fs.readFile(new URL('./fresh-cache-facade.function.js', import.meta.url), 'utf8');
const fixture = Array.from({ length: 7 }, (_, i) => ({ id: `public-state-${i}`,
  name: i === 0 ? 'drive-original-account-state.json' : `drive-original-account-state-v2-public-writer-${i}.json`,
  modifiedTime: String(i), raw: { schemaVersion: 1, updatedAt: 20 + i,
    viewed: { [`view-${i}`]: 20 + i }, favorites: { shared: { liked: i !== 6, updatedAt: 50 }, [`favorite-${i}`]: { liked: i % 2 === 0, updatedAt: 20 + i } } } }));
const plain = value => JSON.parse(JSON.stringify(value));
function context() {
  const storage = new Map(), events = new Map(), calls = [], storageWrites = [];
  const c = { AbortController, Blob, DOMException, Headers, Response, URL, URLSearchParams, TextDecoder, performance,
    __DRIVE_ORIGINAL_RUNTIME__: { driveMutationsEnabled: false, accountStateWritesEnabled: true },
    setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame() {},
    console: { log() {}, warn() {}, error() {} },
    location: { href: 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/', origin: 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev', pathname: '/', search: '', hash: '', protocol: 'https:' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem(key, text) { storageWrites.push(key); storage.set(key, String(text)); }, removeItem(key) { storageWrites.push(key); storage.delete(key); } },
    navigator: { onLine: true, serviceWorker: { controller: { state: 'activated' } } },
    document: { visibilityState: 'visible', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } },
  };
  c.window = { isSecureContext: true, location: c.location, matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
    removeEventListener(name, fn) { events.get(name)?.delete(fn); } };
  c.self = c.window; c.top = c.window; c.matchMedia = c.window.matchMedia;
  c.fetch = async (address, options) => {
    calls.push({ url: new URL(address), options });
    const url = new URL(address);
    if (url.pathname.endsWith('/about')) return new Response(JSON.stringify({ user: { permissionId: 'public-account' } }));
    if (url.pathname === '/drive/v3/files') return new Response(JSON.stringify({ files: fixture.map(({ raw, ...meta }) => meta) }));
    const row = fixture.find(row => row.id === url.pathname.split('/').pop());
    return row ? new Response(JSON.stringify(row.raw)) : new Response('{}', { status: 404 });
  };
  vm.createContext(c); vm.runInContext(built.appText, c);
  const run = text => vm.runInContext(text, c);
  c.rows = structuredClone(fixture);
  run(`state.token='public-test-credential';state.expiresAt=Date.now()+3600000;state.tokenRevision=3;
    state.accountId='public-account';state.authAccountKey='public-auth';state.authStatus='online';
    state.accountStateWriterId='public-current-writer';state.accountStateLoaded=true;state.accountIdentityPending=false;
    state.accountStateAbortController=new AbortController();q1RetirementResult={settled:true};
    state.accountMediaState=rows.reduce((merged,row)=>mergeAccountMediaStates(merged,row.raw),createEmptyAccountMediaState());`);
  const expected = plain(run('state.accountMediaState'));
  storage.set(run('accountStateCacheKey(state.accountId)'), JSON.stringify(expected));
  storage.set(run('ACCOUNT_WRITER_STORAGE_KEY'), 'public-current-writer');
  storageWrites.length = 0;
  const actualFactory = vm.runInContext(`(${built.source})`, c);
  const facade = vm.runInContext(`(${facadeText})`, c);
  return { c, run, expected, storage, storageWrites, events, calls, actualFactory,
    start: (factory = actualFactory, ids = fixture.map(row => row.id), budget = 30000) => facade.call(factory, expected, ids, budget),
    assertClean() { for (const name of ['pagehide', 'beforeunload']) assert.equal(events.get(name)?.size || 0, 0); assert.equal(getEventListeners(run('state.accountStateAbortController.signal'), 'abort').length, 0); },
  };
}

test('actual complete factory + facade reconstruct seven recognized documents in nine native GETs without real storage/UI mutation', async () => {
  const f = context(); const beforeStorage = [...f.storage], beforeProjection = plain(f.run('state.accountMediaState'));
  const beforeKeys = Object.keys(f.c); const job = f.start(); const result = plain(await job.run()); const summary = plain(job.summary());
  assert.equal(result.passed, true); assert.equal(result.reads, 9); assert.equal(result.writes, 0); assert.equal(result.documents, 7);
  assert.equal(result.liked, 4); assert.equal(result.unliked, 4); assert.equal(result.viewed, 7);
  assert.equal(summary.nativeGets, 9); assert.equal(summary.ownerCurrent, true); assert.equal(summary.timersCleared, true);
  assert.equal(summary.actualCacheUnchanged, true); assert.equal(summary.actualWriterUnchanged, true); assert.equal(summary.sourceHash, built.appHash);
  assert.deepEqual([...f.storage], beforeStorage); assert.deepEqual(plain(f.run('state.accountMediaState')), beforeProjection); assert.deepEqual(f.storageWrites, []);
  assert.deepEqual(Object.keys(f.c), beforeKeys); assert.equal(f.run('state.accountStateLoaded'), true);
  assert.equal(f.run('state.selected'), null); assert.equal(f.run('state.accountStateSyncTimer'), null);
  for (const call of f.calls) {
    assert.equal(call.options.method, 'GET'); assert.equal(call.options.headers.Authorization, 'Bearer public-test-credential');
    assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.redirect, 'error'); assert.equal(call.options.cache, 'no-store');
  }
  assert.ok(!JSON.stringify(summary).includes('public-account')); assert.ok(!JSON.stringify(summary).includes('public-state-')); assert.ok(!JSON.stringify(summary).includes('public-test-credential'));
  f.assertClean(); job.clear(); f.assertClean();
});

test('facade rejects original/arbitrary body, POST/PATCH, wrong origin/query and caller headers before native dispatch', async () => {
  const about = 'https://www.googleapis.com/drive/v3/about?fields=user(permissionId)';
  for (const [url, extra] of [
    ['https://www.googleapis.com/drive/v3/files/original-media?alt=media', {}],
    ['https://www.googleapis.com/drive/v3/files/unapproved?alt=media', {}],
    [about, { method: 'POST' }], [about, { method: 'PATCH' }],
    ['https://other.test/drive/v3/about?fields=user(permissionId)', {}],
    ['https://www.googleapis.com/drive/v3/files?spaces=drive&q=anything', {}],
    [about, { headers: { Authorization: 'untrusted' } }],
  ]) {
    const f = context(); let supplied;
    const stub = args => { supplied = args; return { run: async () => { await args.read(url, { method: 'GET', signal: args.signal, ...extra }); }, safeSummary: () => ({}), clear() {} }; };
    const job = f.start(stub); assert.equal(supplied.expectedAccountId, 'public-account');
    await assert.rejects(job.run(), { code: 'invalid_transport' }); assert.equal(f.calls.length, 0); assert.deepEqual(f.storageWrites, []);
    f.assertClean(); job.clear();
  }
});

test('preflight rejects pending loading/sync/errors, wrong projection, unfinished media and invalid private ID list without reads or listeners', () => {
  for (const change of [
    'state.accountStateLoadingPromise=Promise.resolve()', 'state.accountStateSyncPromise=Promise.resolve()',
    'state.accountStateSyncTimer=1', 'state.accountStateSyncRetryTimer=1', "state.accountStateSyncError=new Error('fixture')",
    'q1RetirementResult={settled:false}', "state.selected={id:'media'}", "state.accountIdentityPending=true",
    "navigator.serviceWorker.controller.state='redundant'", "state.accountMediaState.viewed.changed=500",
  ]) {
    const f = context(); f.run(change); assert.throws(() => f.start(), /FRESH_CACHE_PREFLIGHT/); assert.equal(f.calls.length, 0); f.assertClean();
  }
  for (const ids of [[], ['duplicate', 'duplicate'], ['bad/id']]) { const f = context(); assert.throws(() => f.start(undefined, ids), /FRESH_CACHE_PREFLIGHT/); assert.equal(f.calls.length, 0); f.assertClean(); }
});

test('every real owner/cache/controller/media fence stops the actual factory after first provider await and cleans listeners', async () => {
  for (const change of [
    "state.accountId='other'", 'state.authGeneration++', 'state.driveSessionGeneration++', "state.token='changed'", 'state.tokenRevision++',
    'state.accountStateRevision++', "state.accountStateWriterId='changed-writer'", 'state.accountStateAbortController=new AbortController()',
    "navigator.serviceWorker.controller={state:'activated'}", 'state.mediaSession++', 'mediaSourceGeneration++',
    "localStorage.setItem(accountStateCacheKey(state.accountId),'changed')", "localStorage.setItem(ACCOUNT_WRITER_STORAGE_KEY,'changed')",
    'state.accountMediaState.viewed.changed=500', 'q1RetirementResult={settled:true}', "document.visibilityState='hidden'",
  ]) {
    const f = context(); const priorAbort = f.run('state.accountStateAbortController'); const native = f.c.fetch;
    f.c.fetch = async (...args) => { const response = await native(...args); f.run(change); return response; };
    const job = f.start(); const result = plain(await job.run());
    assert.equal(result.passed, false, change); assert.equal(result.code, 'stale_owner', change); assert.equal(f.calls.length, 1, change);
    assert.equal(f.calls.filter(call => call.options.method !== 'GET').length, 0); assert.equal(result.timersCleared, true);
    assert.equal(getEventListeners(priorAbort.signal, 'abort').length, 0); f.assertClean(); job.clear();
  }
});

test('unapproved catalog body ID is denied despite recognized name; pagehide/account-abort and constructor failure clean listeners', async () => {
  const denied = context(); const job = denied.start(undefined, fixture.slice(0, 6).map(row => row.id)); const result = plain(await job.run());
  assert.equal(result.passed, false); assert.equal(result.code, 'invalid_transport');
  assert.ok(denied.calls.every(call => !call.url.pathname.endsWith('/public-state-6'))); denied.assertClean(); job.clear();
  for (const kind of ['pagehide', 'account-abort']) {
    const f = context(); const native = f.c.fetch;
    f.c.fetch = async (...args) => { const response = await native(...args); if (kind === 'pagehide') for (const fn of [...f.events.get('pagehide')]) fn(); else f.run('state.accountStateAbortController.abort()'); return response; };
    const running = f.start(); assert.equal((await running.run()).passed, false); assert.equal(f.calls.length, 1); f.assertClean(); running.clear();
  }
  const failed = context(); assert.throws(() => failed.start(() => { throw new Error('fixed construction failure'); }), /fixed construction failure/); failed.assertClean(); assert.equal(failed.calls.length, 0);
});
