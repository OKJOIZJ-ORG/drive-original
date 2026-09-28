'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const NAME = 'drive-original-account-state-v2-';
const empty = () => ({ schemaVersion: 1, updatedAt: 0, viewed: {}, favorites: {} });
const local = () => ({ schemaVersion: 1, updatedAt: 20, viewed: { watched: 20 }, favorites: { removed: { liked: false, updatedAt: 20 }, liked: { liked: true, updatedAt: 20 } } });
const clone = value => JSON.parse(JSON.stringify(value));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

// Only fetch is substituted: driveFetch, catalog pagination, strict validation,
// reservation, canonical multipart, confirmation, locks and merge are actual app code.
function client(provider, { storage = new Map(), writer = 'device-a', config = { driveMutationsEnabled: false, accountStateWritesEnabled: true } } = {}) {
  const timers = new Map(); let sequence = 0; let held = false;
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    __DRIVE_ORIGINAL_RUNTIME__: config, fetch: (url, opts) => provider(url, opts, held),
    console: { warn() {}, error() {}, log() {} }, performance,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    setInterval() {}, clearInterval() {}, requestAnimationFrame() {},
    location: { href: 'https://candidate.test/', origin: 'https://candidate.test', pathname: '/', search: '', protocol: 'https:' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    navigator: { onLine: true, locks: { async request(name, options, fn) { assert.equal(name, `drive-original:account:account-a:${writer}`); held = true; try { return await fn(); } finally { held = false; } } } },
    document: { visibilityState: 'visible', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } }
  };
  c.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), location: c.location, isSecureContext: true };
  c.matchMedia = c.window.matchMedia;
  vm.createContext(c); vm.runInContext(source, c);
  c.run = text => vm.runInContext(text, c);
  c.storage = storage; c.timers = timers;
  c.run(`state.token='synthetic';state.expiresAt=Date.now()+3600000;state.accountId='account-a';
    state.accountStateWriterId=${JSON.stringify(writer)};state.accountStateLoaded=true;state.accountIdentityPending=false;
    state.accountMediaState=normalizeAccountMediaState(${JSON.stringify(local())});`);
  // Synthetic credentials in these fixtures represent verified full grants.
  c.run('state.authCapabilities={version:1,driveRead:true,driveWrite:true,appData:true}');
  return c;
}

function drive(seed = []) {
  const files = new Map(seed.map(file => [file.id, clone(file)])); const calls = []; let sequence = 0;
  const fixture = { files, calls, hook: null, hideCatalog: false };
  fixture.request = async (address, options = {}, held = false) => {
    const url = new URL(address); const method = options.method || 'GET'; const id = url.pathname.split('/').pop();
    const call = { url, method, id, options, held }; calls.push(call);
    const override = await fixture.hook?.(call); if (override !== undefined) return override;
    if (id === 'generateIds') return json({ ids: [`reserved-${++sequence}`], space: 'appDataFolder' });
    if (id === 'about') return json({ user: { permissionId: 'account-a' } });
    if (method === 'POST') {
      const parts = options.body.split('\r\n\r\n').slice(1).map(part => part.split('\r\n--')[0]);
      const metadata = JSON.parse(parts[0]); const data = JSON.parse(parts[1]);
      assert.deepEqual(metadata.parents, ['appDataFolder']); assert.equal(metadata.mimeType, 'application/json');
      if (files.has(metadata.id)) return json({ error: { message: 'exists' } }, 409);
      files.set(metadata.id, { ...metadata, data, modifiedTime: String(++sequence) });
      if (fixture.loseResponse) { fixture.loseResponse = false; throw new TypeError('lost response'); }
      return json({ id: metadata.id });
    }
    if (method === 'PATCH') {
      if (!files.has(id)) return json({ error: { message: 'gone' } }, 404);
      Object.assign(files.get(id), { data: JSON.parse(options.body), modifiedTime: String(++sequence) }); return json({ id });
    }
    if (url.pathname === '/drive/v3/files') return json({ files: fixture.hideCatalog ? [] : [...files.values()].map(({ data, ...meta }) => meta) });
    if (!files.has(id)) return json({ error: { message: 'missing' } }, 404);
    if (url.searchParams.get('alt') === 'media') return json(files.get(id).data);
    return json({ ...files.get(id), data: undefined, trashed: false, spaces: ['appDataFolder'] });
  };
  fixture.writes = () => calls.filter(call => ['POST', 'PATCH', 'DELETE'].includes(call.method));
  return fixture;
}
const writerFile = (id = 'own', writer = 'device-a', data = empty()) => ({ id, name: `${NAME}${writer}.json`, modifiedTime: 'original', data });
const status = c => clone(c.run('({failed:Boolean(state.accountStateSyncError),error:state.accountStateSyncError?.code,status:state.accountStateSyncError?.status,lastSync:state.accountStateLastSyncAt,projection:state.accountMediaState,fileId:state.accountStateFileId})'));

test('separate state gate permits canonical own PATCH and CREATE while generic, fake marker and foreign PATCH never transmit a mutation', async () => {
  for (const existing of [false, true]) {
    const d = drive(existing ? [writerFile()] : []); const c = client(d.request);
    await c.run('flushAccountMediaState()');
    assert.equal(status(c).error, undefined); assert.ok(status(c).lastSync > 0);
    assert.equal(d.writes().length, 1); assert.equal(d.writes()[0].method, existing ? 'PATCH' : 'POST');
    assert.ok(d.calls.every(call => call.held), 'capture, write and independent reads stay inside writer lock');
    assert.deepEqual([...d.files.values()][0].data, local());
    const before = d.calls.length;
    for (const script of [
      `driveFetch('https://www.googleapis.com/drive/v3/files/original',{method:'PATCH',body:'{}'})`,
      `driveFetch('https://www.googleapis.com/upload/drive/v3/files/own?uploadType=media&fields=id,modifiedTime',{method:'PATCH',accountStateWrite:{kind:'update'},body:'{}'})`,
      `updateAccountStateFile('foreign',state.accountMediaState)`
    ]) await assert.rejects(c.run(script), { status: 423 });
    // Foreign update may attempt read-only confirmation; the forbidden mutation is never dispatched.
    assert.equal(d.writes().length, 1); assert.equal(d.calls.slice(before).filter(call => call.method !== 'GET').length, 0);
  }
  const d = drive(); const c = client(d.request, { config: { driveMutationsEnabled: false, accountStateWritesEnabled: false } });
  await assert.rejects(c.run('createAccountStateFile(state.accountMediaState)'), { status: 423 });
  await assert.rejects(c.run("updateAccountStateFile('own',state.accountMediaState)"), { status: 423 });
  assert.equal(d.calls.length, 0);
});

test('lost CREATE response, delayed catalog and reload reuse one durable ID; 409 confirms rather than duplicates', async () => {
  const d = drive(); d.hideCatalog = true; d.loseResponse = true;
  const storage = new Map(); const first = client(d.request, { storage });
  await first.run('flushAccountMediaState()');
  assert.equal(status(first).error, undefined); assert.equal(d.files.size, 1);
  const reserved = JSON.parse(storage.get('drive-original.account-state-file.account-a.device-a')).fileId;
  const second = client(d.request, { storage }); await second.run('flushAccountMediaState()');
  assert.equal(status(second).error, undefined); assert.equal(d.files.size, 1);
  assert.equal(d.calls.filter(call => call.id === 'generateIds').length, 1);
  assert.equal(d.writes().length, 2);
  assert.ok(d.writes().every(call => call.options.body.includes(`"id":"${reserved}"`)));
  assert.ok(d.calls.filter(call => call.url.searchParams.get('alt') === 'media').length >= 2);
});

test('invalid cache, quota persistence failure, unsafe raw schema/catalog and missing writer body block writes and preserve local data', async () => {
  for (const kind of ['cache', 'quota', 'schema', 'duplicate', 'incomplete', 'body404']) {
    const original = writerFile(); const d = drive(['schema', 'body404'].includes(kind) ? [original] : []); const c = client(d.request);
    const before = clone(status(c).projection);
    if (kind === 'cache') c.storage.set('drive-original.account-state.account-a', '{invalid');
    if (kind === 'quota') c.localStorage.setItem = () => { throw new Error('quota'); };
    if (kind === 'schema') d.files.get('own').data.schemaVersion = 2;
    if (kind === 'duplicate') d.hook = ({ url }) => url.pathname === '/drive/v3/files' ? json({ files: [original, { ...original, id: 'other' }] }) : undefined;
    if (kind === 'incomplete') d.hook = ({ url }) => url.pathname === '/drive/v3/files' ? json({ files: [], incompleteSearch: true }) : undefined;
    if (kind === 'body404') d.hook = ({ url }) => url.searchParams.get('alt') === 'media' ? json({ error: {} }, 404) : undefined;
    await c.run('flushAccountMediaState()');
    assert.equal(status(c).failed, true, kind); assert.equal(d.writes().length, 0, kind); assert.deepEqual(status(c).projection, before, kind);
  }
});

test('PATCH404 requires fresh catalog absence before CREATE and refuses a still-visible or replaced own writer', async () => {
  for (const remains of [false, true]) {
    const d = drive([writerFile()]); let catalogs = 0;
    d.hook = call => {
      if (call.url.pathname === '/drive/v3/files') catalogs++;
      if (call.method === 'PATCH') { if (!remains) d.files.delete('own'); return json({ error: {} }, 404); }
    };
    const c = client(d.request); await c.run('flushAccountMediaState()');
    assert.equal(catalogs, 2); assert.equal(d.writes().filter(call => call.method === 'POST').length, remains ? 0 : 1);
    assert.equal(status(c).failed, remains);
    assert.deepEqual(status(c).projection, local());
  }
});

test('readback checks fixed submitted payload while a concurrent local edit remains pending for follow-up', async () => {
  const d = drive([writerFile()]); const c = client(d.request); let edited = false;
  c.run("el.accountSyncStatus={hidden:true,dataset:{},textContent:''};state.mediaAttempt='range';state.selected={id:'playing-video'}");
  d.hook = call => { if (call.method === 'PATCH' && !edited) { edited = true; c.run("state.accountMediaState.viewed.later=99;state.accountMediaState.updatedAt=99;state.accountStateRevision++;"); } };
  await c.run('flushAccountMediaState()');
  assert.equal(status(c).error, undefined);
  assert.equal(c.timers.get(c.run('state.accountStateSyncTimer')).delay, 650);
  assert.equal(c.run('el.accountSyncStatus.dataset.state'), 'syncing');
  assert.equal(d.files.get('own').data.viewed.later, undefined);
  assert.equal(status(c).projection.viewed.later, 99);
  c.run('clearTimeout(state.accountStateSyncTimer);state.accountStateSyncTimer=null');
  await c.run('flushAccountMediaState()'); assert.equal(d.files.get('own').data.viewed.later, 99);
  assert.equal(c.run('el.accountSyncStatus.dataset.state'), 'synced');
});

test('reservation must be valid, account-owned and durably reread before any POST', async () => {
  const key = 'drive-original.account-state-file.account-a.device-a';
  for (const kind of ['invalid', 'wrong-account', 'quota', 'lost-reread', 'bad-space', 'multiple-ids']) {
    const d = drive(); const c = client(d.request);
    if (kind === 'invalid') c.storage.set(key, '{broken');
    if (kind === 'wrong-account') c.storage.set(key, JSON.stringify({ schemaVersion: 1, accountId: 'account-b', writerId: 'device-a', fileId: 'reserved-old' }));
    const set = c.localStorage.setItem;
    if (kind === 'quota' || kind === 'lost-reread') c.localStorage.setItem = (k, v) => {
      if (k === key) { if (kind === 'quota') throw new Error('quota'); return; } set(k, v);
    };
    if (kind === 'bad-space' || kind === 'multiple-ids') d.hook = call => call.id === 'generateIds'
      ? json({ ids: kind === 'multiple-ids' ? ['one', 'two'] : ['one'], space: kind === 'bad-space' ? 'drive' : 'appDataFolder' }) : undefined;
    await c.run('flushAccountMediaState()');
    assert.equal(status(c).failed, true, kind); assert.equal(d.writes().length, 0, kind);
    assert.deepEqual(status(c).projection, local(), kind);
  }
});

test('native write failures never retry within driveFetch; wrong owner or incomplete body readback never marks sync success', async () => {
  for (const kind of ['401', 'quota403', '503', 'wrong-owner', 'wrong-space', 'partial-body']) {
    const d = drive(); const c = client(d.request);
    d.hook = call => {
      if (['401', 'quota403', '503'].includes(kind) && call.method === 'POST') return json({ error: { errors: [{ reason: kind === 'quota403' ? 'userRateLimitExceeded' : 'failure' }] } }, kind === 'quota403' ? 403 : Number(kind));
      if (call.id.startsWith('reserved-') && call.method === 'GET' && call.url.searchParams.get('alt') !== 'media') {
        if (kind === 'wrong-owner' || kind === 'wrong-space') return json({ id: call.id, name: kind === 'wrong-owner' ? `${NAME}foreign.json` : `${NAME}device-a.json`, trashed: false, spaces: kind === 'wrong-space' ? ['drive'] : ['appDataFolder'] });
      }
      if (kind === 'partial-body' && call.url.searchParams.get('alt') === 'media') {
        const partial = local(); delete partial.favorites.removed; return json(partial);
      }
    };
    await c.run('flushAccountMediaState()');
    assert.equal(d.writes().length, 1, kind); assert.equal(status(c).failed, true, kind);
    assert.equal(status(c).lastSync, 0, kind); assert.deepEqual(status(c).projection, local(), kind);
    assert.equal(d.calls.filter(call => call.id === 'generateIds').length, 1, kind);
  }
});

test('unconfirmed tombstones cannot report sync success even when upload HTTP succeeds', async () => {
  const d = drive([writerFile()]); const c = client(d.request);
  d.hook = call => call.method === 'PATCH' ? json({ id: 'own' }) : undefined;
  await c.run('flushAccountMediaState()');
  assert.equal(status(c).error, 'account_state_readback_unconfirmed'); assert.equal(status(c).lastSync, 0);
  assert.deepEqual(status(c).projection, local());
});

test('account switch and request abort during catalog cannot dispatch a state write or install old state', async () => {
  for (const change of ["state.authGeneration++;state.driveSessionGeneration++;state.accountId='account-b'", 'state.accountStateAbortController.abort()']) {
    const d = drive(); const c = client(d.request);
    d.hook = call => { if (call.url.pathname === '/drive/v3/files') c.run(change); };
    await c.run('flushAccountMediaState()');
    assert.equal(d.writes().length, 0); assert.equal(status(c).lastSync, 0); assert.deepEqual(status(c).projection, local());
  }
});

test('fresh origin reconstructs complete writer union, unlike tie and maximum viewed; normal two-writer writes converge', async () => {
  const legacy = { id: 'legacy', name: 'drive-original-account-state.json', modifiedTime: 'legacy', data: { viewed: { old: 5 }, favorites: { removed: true } } };
  const d = drive([legacy]); const a = client(d.request); const b = client(d.request, { writer: 'device-b' });
  b.run("state.accountMediaState=normalizeAccountMediaState({schemaVersion:1,updatedAt:20,viewed:{watched:40,second:30},favorites:{removed:{liked:true,updatedAt:20},second:{liked:true,updatedAt:20}}})");
  await Promise.all([a.run('flushAccountMediaState()'), b.run('flushAccountMediaState()')]);
  assert.equal(d.files.size, 3); assert.deepEqual(d.files.get('legacy'), legacy);
  const fresh = client(d.request, { writer: 'fresh-origin' }); fresh.run('state.accountStateLoaded=false;state.accountId=null;state.accountMediaState=createEmptyAccountMediaState()');
  await fresh.run('initializeAccountMediaState()');
  const projection = status(fresh).projection;
  assert.equal(projection.favorites.removed.liked, false); assert.equal(projection.favorites.second.liked, true);
  assert.deepEqual(projection.viewed, { old: 5, watched: 40, second: 30 });
  assert.equal(d.writes().length, 2, 'reconstruction only reads and preserves the legacy document');
  for (const c of [a, b]) { await c.run('initializeAccountMediaState({refresh:true})'); await c.run('flushAccountMediaState()'); }
  for (const file of [...d.files.values()].filter(file => file.id !== 'legacy')) assert.deepEqual(file.data, projection);
});


test('AUTH-05 appData-only token retains scoped state writes under the ordinary Drive write lock', async () => {
  const provider = drive();
  const c = client(provider.request);
  c.run('state.authCapabilities={version:1,driveRead:false,driveWrite:false,appData:true}');
  await c.run('flushAccountMediaState()');
  assert.equal(provider.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(c.run('state.accountStateSyncError'), null);
  assert.ok(c.run('state.accountStateFileId'));
  await assert.rejects(c.run(`driveFetch('https://www.googleapis.com/drive/v3/files/media',{method:'PATCH'})`),
    error => error.code === 'candidate_read_only');
});
