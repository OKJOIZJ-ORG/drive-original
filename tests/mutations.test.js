'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function client(storage = new Map(), locks = new Map()) {
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    console, performance, fetch, setTimeout, clearTimeout, setInterval, clearInterval,
    __DRIVE_ORIGINAL_RUNTIME__: { driveMutationsEnabled: true },
    location: { href: 'https://fixture.test/', origin: 'https://fixture.test', pathname: '/', search: '' },
    navigator: { onLine: true, locks: { async request(key, fn) {
      const prior = locks.get(key) || Promise.resolve();
      const next = prior.catch(() => {}).then(() => fn({ name: key }));
      locks.set(key, next); return next;
    } } },
    localStorage: { get length() { return storage.size; }, key(i) { return [...storage.keys()][i] ?? null; },
      getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); }, removeItem(key) { storage.delete(key); } },
    document: { addEventListener() {}, querySelectorAll() { return []; }, visibilityState: 'visible' },
    requestAnimationFrame() {} };
  c.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 390, matchMedia: () => ({ matches: false }), location: c.location };
  c.matchMedia = c.window.matchMedia;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), c);
  c.run = code => vm.runInContext(code, c);
  c.run(`state.accountId='drive-account-A';state.authAccountKey='server-account-A';state.accountIdentityPending=false;
    state.token='synthetic-token';state.expiresAt=Date.now()+3600000;
    state.moveFolderRows=[];state.rootFolderId='root';
    const item={id:'synthetic-file',parents:['old'],version:'1',mimeType:'video/mp4'};
    const target={id:'destination',mimeType:'application/vnd.google-apps.folder'};`);
  c.storage = storage;
  c.entries = () => [...storage.entries()].filter(([key]) => key.startsWith('drive-original.mutation.')).map(([, value]) => JSON.parse(value));
  c.run('showToast=()=>{};');
  // Synthetic credentials in these fixtures represent verified full grants.
  c.run('state.authCapabilities={version:1,driveRead:true,driveWrite:true,appData:true}');
  return c;
}

function remote(c, { patch = 'apply', readback = 'ok' } = {}) {
  const item = { id: 'synthetic-file', parents: ['old'], version: '1', mimeType: 'video/mp4', trashed: false,
    capabilities: { canTrash: true, canMoveItemWithinDrive: true, canMoveItemOutOfDrive: true } };
  const calls = [];
  c.fetch = async (url, options = {}) => {
    const u = new URL(url); const method = options.method || 'GET';
    calls.push({ method, id: u.pathname.split('/').pop(), params: u.searchParams, body: options.body });
    if (method === 'PATCH') {
      if (patch === 'deny') return new Response('{"error":{"message":"Forbidden"}}', { status: 403 });
      if (patch === 'rate') return new Response('{}', { status: 429 });
      if (patch === 'lost-before') throw new TypeError('synthetic response lost');
      if (JSON.parse(options.body || '{}').trashed) item.trashed = true;
      if (u.searchParams.has('addParents')) item.parents = [u.searchParams.get('addParents')];
      item.version = '2';
      if (patch === 'switch') c.run(`state.accountId='drive-account-B';state.authAccountKey='server-account-B';state.driveSessionGeneration++;`);
      if (patch === 'lost') throw new TypeError('synthetic response lost');
      return new Response(patch === 'malformed' ? 'not-json' : '{}', { status: 200 });
    }
    if (calls.some(call => call.method === 'PATCH')) {
      if (readback === '404') return new Response('{}', { status: 404 });
      if (readback === 'conflict') { item.parents = ['external-folder']; item.version = '3'; }
    }
    if (u.pathname.endsWith('/destination')) return Response.json({ id: 'destination', mimeType: 'application/vnd.google-apps.folder', trashed: false,
      parents: ['root'], capabilities: { canAddChildren: true } });
    return Response.json(item);
  };
  return { item, calls, patches: () => calls.filter(call => call.method === 'PATCH') };
}

test('trash response parse failure never substitutes for an independent GET', async () => {
  const c = client(); const r = remote(c, { patch: 'malformed', readback: '404' });
  await assert.rejects(c.run('trashDriveFile(item)'), error => error.mutationState === 'uncertain');
  assert.equal(r.patches().length, 1);
  assert.equal(r.calls.at(-1).method, 'GET');
});

test('move uses actual remote parents instead of synthesizing a missing response field', async () => {
  const c = client(); const r = remote(c, { readback: 'conflict' });
  await assert.rejects(c.run('moveDriveFile(item,target)'), error => error.mutationState === 'conflict');
  assert.deepEqual(Array.from(c.run('item.parents')), ['old']);
  assert.equal(r.patches().length, 1);
});

for (const action of ['trash', 'move']) test(`${action}: applied before lost response confirms by GET without replay`, async () => {
  const c = client(); const r = remote(c, { patch: 'lost' });
  const result = await c.run(action === 'trash' ? 'trashDriveFile(item)' : 'moveDriveFile(item,target)');
  assert.equal(r.patches().length, 1);
  assert.equal(r.calls.at(-1).method, 'GET');
  assert.equal(c.entries()[0].state, 'confirmed');
  assert.equal(result.metadata.id, 'synthetic-file');
  if (action === 'move') assert.deepEqual(Array.from(c.run('item.parents')), ['destination']);
});

test('lost before apply stays uncertain through repeat/reload; recovery only reads', async () => {
  const storage = new Map(); const c = client(storage); const r = remote(c, { patch: 'lost-before' });
  await assert.rejects(c.run('trashDriveFile(item)'), error => error.mutationState === 'uncertain');
  await assert.rejects(c.run('trashDriveFile(item)'), error => error.mutationState === 'uncertain');
  assert.equal(r.patches().length, 1);
  const next = client(storage); const reads = remote(next);
  await next.run('recoverDriveMutations()');
  assert.equal(reads.patches().length, 0);
  assert.equal(next.entries()[0].state, 'uncertain');
  reads.item.trashed = true; reads.item.version = '2';
  await next.run('recoverDriveMutations()');
  assert.equal(next.entries()[0].state, 'confirmed');
  assert.equal(reads.patches().length, 0);
});

for (const patch of ['deny', 'rate']) test(`${patch}: rejection plus unchanged GET is failed, never transparent PATCH retry`, async () => {
  const c = client(); const r = remote(c, { patch });
  await assert.rejects(c.run('trashDriveFile(item)'), error => error.mutationState === 'failed');
  assert.equal(r.patches().length, 1);
  assert.equal(r.calls.at(-1).method, 'GET');
  assert.equal(c.entries()[0].state, 'failed');
});

test('operation ID is payload-bound; repeated confirmed operation never replays even after external restore', async () => {
  const c = client(); const r = remote(c);
  await c.run("trashDriveFile(item,{operationId:'fixed'})");
  await c.run("trashDriveFile(item,{operationId:'fixed'})");
  await assert.rejects(c.run("moveDriveFile(item,target,{operationId:'fixed'})"), error => error.mutationState === 'conflict');
  r.item.trashed = false; r.item.version = '3';
  await assert.rejects(c.run("trashDriveFile(item,{operationId:'fixed'})"), error => error.mutationState === 'conflict');
  assert.equal(r.patches().length, 1);
  assert.equal(c.entries()[0].confirmedAfter.trashed, true);
  assert.equal(c.entries()[0].confirmedAfter.version, '2');
  assert.equal(c.entries()[0].after.version, '3');
  assert.ok(c.entries()[0].confirmedAt);
});

test('account switch after submission preserves origin uncertainty and never reads it with new account', async () => {
  const c = client(); const r = remote(c, { patch: 'switch' });
  await assert.rejects(c.run('trashDriveFile(item)'), error => error.mutationState === 'uncertain');
  assert.equal(c.entries()[0].accountKey, 'server-account-A');
  assert.equal(c.entries()[0].state, 'uncertain');
  const count = r.calls.length;
  await c.run('recoverDriveMutations()');
  assert.equal(r.calls.length, count);
  c.run("state.accountId='drive-account-A';state.authAccountKey='server-account-A';");
  await c.run('recoverDriveMutations()');
  assert.equal(c.entries()[0].state, 'confirmed');
  assert.equal(r.patches().length, 1);
});

test('storage failure before submit and unsupported locking prevent all PATCHes', async () => {
  for (const failure of ['storage', 'locks']) {
    const c = client(); const r = remote(c);
    if (failure === 'storage') c.localStorage.setItem = () => { throw new Error('quota'); };
    else c.navigator.locks = null;
    await assert.rejects(c.run('trashDriveFile(item)'));
    assert.equal(r.patches().length, 0);
  }
});

test('persistence failure after remote confirmation retains recoverable submitted evidence', async () => {
  const c = client(); const r = remote(c); const set = c.localStorage.setItem;
  c.localStorage.setItem = (key, value) => {
    if (JSON.parse(value).state === 'confirmed') throw new Error('quota');
    set(key, value);
  };
  await assert.rejects(c.run('trashDriveFile(item)'), error => error.mutationState === 'uncertain');
  assert.equal(c.entries()[0].state, 'uncertain');
  assert.equal(r.patches().length, 1);
  c.localStorage.setItem = set;
  await c.run('recoverDriveMutations()');
  assert.equal(c.entries()[0].state, 'confirmed');
  assert.equal(r.patches().length, 1);
});

test('stale snapshot, denied capabilities and unverified metadata stop before PATCH', async () => {
  for (const fault of ['version', 'parents', 'capability', 'id', 'missing-parents']) {
    const c = client(); const r = remote(c);
    if (fault === 'version') r.item.version = '2';
    if (fault === 'parents') r.item.parents = ['elsewhere'];
    if (fault === 'capability') r.item.capabilities.canTrash = false;
    if (fault === 'id') r.item.id = 'different-file';
    if (fault === 'missing-parents') delete r.item.parents;
    await assert.rejects(c.run('trashDriveFile(item)'));
    assert.equal(r.patches().length, 0, fault);
  }
});

test('cross-tab account lock prevents two stale intents from submitting the same file', async () => {
  const storage = new Map(); const locks = new Map(); const a = client(storage, locks); const b = client(storage, locks);
  const r = remote(a); b.fetch = a.fetch;
  const results = await Promise.allSettled([a.run('trashDriveFile(item)'), b.run('trashDriveFile(item)')]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.mutationState, 'conflict');
  assert.equal(r.patches().length, 1);
});

test('shortcut mutation stays on selected ID, and move removes verified parents only', async () => {
  const c = client(); const r = remote(c);
  r.item.mimeType = 'application/vnd.google-apps.shortcut'; r.item.shortcutDetails = { targetId: 'never-mutate' };
  await c.run('moveDriveFile(item,target)');
  assert.ok(r.calls.every(call => call.id !== 'never-mutate'));
  assert.equal(r.patches()[0].params.get('removeParents'), 'old');
  assert.equal(r.patches()[0].params.get('addParents'), 'destination');
});

test('root destination alias accepts omitted parents but uses the returned canonical ID', async () => {
  const c = client(); const r = remote(c); const fetch = c.fetch;
  c.fetch = async (url, options) => new URL(url).pathname.endsWith('/root')
    ? Response.json({ id: 'canonical-root', trashed: false, mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } })
    : fetch(url, options);
  c.run("target.id='root';");
  await c.run('moveDriveFile(item,target)');
  assert.equal(r.patches()[0].params.get('addParents'), 'canonical-root');
  assert.deepEqual(Array.from(c.run('item.parents')), ['canonical-root']);
});

test('mixed bulk failure summary counts uncertainty separately from rejection and conflict', () => {
  const c = client();
  assert.equal(c.run("summarizeDriveMutationFailures([{reason:{mutationState:'uncertain'}},{reason:{mutationState:'failed'}},{reason:{mutationState:'conflict'}},{reason:{mutationState:'cancelled-before-submit'}}])"),
    '1개 실패, 1개 확인 중, 1개 다시 확인, 1개 취소');
});

test('only an explicit new UI retry may resend after fresh unchanged-version readback', async () => {
  const c = client(); const first = remote(c, { patch: 'lost-before' });
  await assert.rejects(c.run('trashDriveFile(item)'), error => error.mutationState === 'uncertain');
  const operationId = c.entries()[0].operationId;
  const retry = remote(c);
  await c.run('trashDriveFile(item,{retryUnchanged:true})');
  assert.equal(first.patches().length, 1);
  assert.equal(retry.patches().length, 1);
  assert.deepEqual(retry.calls.map(call => call.method), ['GET', 'GET', 'PATCH', 'GET']);
  assert.equal(c.entries().length, 1);
  assert.equal(c.entries()[0].operationId, operationId);
  assert.equal(c.entries()[0].attempts, 2);
});

test('explicit retry cannot overwrite an external edit or retry an unknown version', async () => {
  for (const fault of ['version', 'missing-version']) {
    const c = client(); const first = remote(c, { patch: 'lost-before' });
    if (fault === 'missing-version') { delete first.item.version; c.run('delete item.version;'); }
    await assert.rejects(c.run('trashDriveFile(item)'));
    if (fault === 'version') first.item.version = '5';
    await assert.rejects(c.run('trashDriveFile(item,{retryUnchanged:true})'));
    assert.equal(first.patches().length, 1);
  }
});

test('no arbitrary 2000-operation cap; completed records retain their identity and proof', async () => {
  const c = client(); const r = remote(c);
  await c.run("trashDriveFile(item,{operationId:'seed'})");
  const seed = c.entries()[0]; const key = [...c.storage.keys()][0];
  for (let i = 0; i < 2000; i++) {
    const id = `old-${i}`;
    c.storage.set(key.replace(/seed$/, id), JSON.stringify({ ...seed, operationId: id, fileId: `old-file-${i}` }));
  }
  r.item.trashed = false; r.item.version = '3'; c.run("item.version='3';");
  await c.run('trashDriveFile(item)');
  assert.equal(r.patches().length, 2);
  assert.equal(c.entries().length, 2002);
});

test('repeated 404 or unreadable readback stays uncertain without null/stale observation retry', async () => {
  for (const priorReadback of ['404', 'ok']) {
    const c = client(); const r = remote(c, { patch: 'lost-before', readback: priorReadback });
    await assert.rejects(c.run('trashDriveFile(item)'), error => error.mutationState === 'uncertain');
    c.fetch = async () => new Response('{}', { status: 404 });
    await assert.rejects(c.run('trashDriveFile(item,{retryUnchanged:true})'), error => error.mutationState === 'uncertain');
    assert.equal(c.entries()[0].after, null);
    assert.equal(r.patches().length, 1);
  }
});

test('batch preserves earlier confirmed origin items when a later submission changes account', async () => {
  const c = client(); const records = new Map(); let patches = 0;
  for (const id of ['first','second','third']) records.set(id,{id,parents:['old'],trashed:false,version:'1',capabilities:{canTrash:true}});
  c.fetch = async (url, options = {}) => {
    const id = new URL(url).pathname.split('/').pop(); const file = records.get(id);
    if (options.method === 'PATCH') {
      patches++; file.trashed = true; file.version = '2';
      if (id === 'second') c.run("state.driveSessionGeneration++;state.accountId='drive-account-B';state.authAccountKey='server-account-B';");
    }
    return Response.json(file);
  };
  const results = await c.run(`(async()=>{
    const owner=captureAccountStateRequest();
    return runTaskPool(['first','second','third'],async id=>{owner.assert();return trashDriveFile({id,parents:['old'],version:'1'});},1);
  })()`);
  assert.deepEqual(Array.from(results, result => result.status), ['fulfilled','rejected','rejected']);
  assert.equal(patches, 2);
  assert.deepEqual(c.entries().map(row=>[row.fileId,row.state,row.accountKey]),
    [['first','confirmed','server-account-A'],['second','uncertain','server-account-A']]);
});

test('an async UI refresh cannot change the already captured mutation intent', async () => {
  const c = client(); const r = remote(c); const fetch = c.fetch;
  r.item.parents = ['external-folder'];
  c.fetch = async (url, options) => {
    c.run("item.parents=['external-folder'];");
    return fetch(url, options);
  };
  await assert.rejects(c.run('moveDriveFile(item,target)'), error => error.mutationState === 'conflict');
  assert.equal(r.patches().length, 0);
});
