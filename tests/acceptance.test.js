'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function client() {
  const timers = new Map(); const storage = new Map(); let sequence = 0;
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    console, fetch, performance, clearInterval, setInterval,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    location: { href: 'https://app.test/drive-original/', origin: 'https://app.test', pathname: '/drive-original/', search: '', protocol: 'https:' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    navigator: { onLine: true },
    document: { visibilityState: 'visible', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } },
    requestAnimationFrame() {} };
  c.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), location: c.location, isSecureContext: true };
  c.matchMedia = c.window.matchMedia;
  vm.createContext(c); vm.runInContext(source, c);
  c.run = s => vm.runInContext(s, c); c.timers = timers;
  c.run(`state.token='fixture-token';state.expiresAt=Date.now()+3600000;
    state.accountId='same-account';state.accountIdentityPending=false;
    resolveDriveAccountId=async()=> 'same-account';`);
  return c;
}

function driveFixture() {
  const files = new Map(); let revision = 0;
  const request = async (address, options = {}) => {
    const url = new URL(address); const id = url.pathname.split('/').pop();
    if (options.method === 'POST') {
      const parts = options.body.split('\r\n\r\n').slice(1).map(p => p.split('\r\n--')[0]);
      const meta = JSON.parse(parts[0]); const data = JSON.parse(parts[1]); const created = `writer-${++revision}`;
      files.set(created, { ...meta, id: created, data, modifiedTime: String(revision) });
      return new Response(JSON.stringify({ id: created }));
    }
    if (options.method === 'PATCH') {
      assert.ok(files.has(id)); Object.assign(files.get(id), { data: JSON.parse(options.body), modifiedTime: String(++revision) });
      return new Response(JSON.stringify({ id }));
    }
    if (url.searchParams.get('alt') === 'media') return new Response(JSON.stringify(files.get(id).data));
    return new Response(JSON.stringify({ files: [...files.values()].map(({ data, ...meta }) => meta) }));
  };
  return { request, files };
}

test('two continuously visible clients receive independent concurrent edits without refocus or reload', async () => {
  const fixture = driveFixture(); const a = client(); const b = client();
  for (const [i, c] of [a, b].entries()) {
    c.mockDrive = fixture.request;
    c.run(`driveFetch=mockDrive;state.accountStateWriterId='device-${i}';`);
    await c.run('initializeAccountMediaState()');
  }
  a.run(`setFavoriteFile('photo-A',true);markFileViewed('photo-A');`);
  b.run(`setFavoriteFile('photo-B',true);markFileViewed('photo-B');`);
  await Promise.all([a, b].map(c => c.run('flushAccountMediaState()')));
  // Deliver only the app's scheduled foreground refresh, never invoke a
  // manual refresh in place of the behavior under test.
  for (const c of [a, b]) {
    const pending = [...c.timers.values()].find(t => t.delay >= 1000 && t.delay <= 30000);
    assert.ok(pending, 'active authenticated clients must schedule a remote refresh');
    await pending.fn();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(c.run(`isFavoriteFileId('photo-A') && isFavoriteFileId('photo-B')`), true);
    assert.equal(c.run(`Boolean(state.accountMediaState.viewed['photo-A'] && state.accountMediaState.viewed['photo-B'])`), true);
  }
  assert.equal(fixture.files.size, 2, 'each device writes its own document');
});

test('edge completion already queued before cancellation cannot navigate afterward', async () => {
  const c = client(); let finish;
  c.finished = new Promise(resolve => { finish = resolve; });
  c.run(`let backs=0;completeLibraryBackNavigation=()=>backs++;
    el.playerSheet={hidden:true};el.libraryView={style:{},animate:()=>({finished,cancel(){}})};
    settleLibraryEdgeBack(true,{width:390,distance:210,velocity:1});`);
  finish(); // A fulfilled WAAPI promise cannot be unfulfilled by cancel().
  c.run('cancelLibraryEdgeBack()');
  await Promise.resolve();
  assert.equal(c.run('backs'), 0);
});

test('edge animation promise and deadline can commit at most once', async () => {
  const c = client(); let finish;
  c.finished = new Promise(resolve => { finish = resolve; });
  c.run(`let backs=0;completeLibraryBackNavigation=()=>backs++;
    el.playerSheet={hidden:true};el.libraryView={style:{},animate:()=>({finished,cancel(){}})};
    settleLibraryEdgeBack(true,{width:390,distance:210,velocity:1});`);
  const deadline = [...c.timers.values()][0].fn;
  finish(); deadline(); await Promise.resolve();
  assert.equal(c.run('backs'), 1);
});

test('foreground polling stops for hidden, offline, expired, demo and unverified sessions', () => {
  for (const change of [
    `document.visibilityState='hidden'`, `navigator.onLine=false`, `state.expiresAt=0`,
    `state.demo=true`, `state.accountIdentityPending=true`, `state.accountId=null`
  ]) {
    const c = client();
    c.run('scheduleAccountStateRefresh()');
    assert.equal(c.timers.size, 1);
    c.run(`${change};scheduleAccountStateRefresh(0);`);
    assert.equal(c.timers.size, 0, change);
  }
});

test('rearming and token clearing invalidate queued refresh callbacks without a request', async () => {
  const c = client();
  c.run(`let reads=0;initializeAccountMediaState=async()=>reads++;scheduleAccountStateRefresh();`);
  const old = [...c.timers.values()][0].fn;
  c.run('scheduleAccountStateRefresh(0)');
  assert.equal(c.timers.size, 1);
  await old(); assert.equal(c.run('reads'), 0);
  const next = [...c.timers.values()][0].fn;
  c.run('clearToken(false)');
  await next(); assert.equal(c.run('reads'), 0);
  assert.equal(c.timers.size, 0);
});

test('refresh waits behind a pending write and cannot cross an account generation', async () => {
  const c = client();
  c.run(`let reads=0;initializeAccountMediaState=async()=>reads++;
    state.accountStateSyncPromise=new Promise(()=>{});scheduleAccountStateRefresh();`);
  let id = c.run('state.accountStateRefreshTimer');
  const first = c.timers.get(id); c.timers.delete(id); await first.fn();
  assert.equal(c.run('reads'), 0); assert.equal(c.timers.size, 1);
  c.run(`state.accountStateSyncPromise=null;state.driveSessionGeneration++;state.accountId='other';`);
  id = c.run('state.accountStateRefreshTimer');
  const second = c.timers.get(id); c.timers.delete(id); await second.fn();
  assert.equal(c.run('reads'), 0);
});

test('server Retry-After survives immediate resume and permanent permission errors stop polling', async () => {
  const c = client();
  c.run(`findAccountStateFile=async()=>{throw Object.assign(new Error('cooldown'),{status:429,retryAfterMs:120000})};`);
  await assert.rejects(c.run('initializeAccountMediaState({refresh:true})'), /cooldown/);
  c.run('scheduleAccountStateRefresh(0)');
  assert.ok(c.timers.get(c.run('state.accountStateRefreshTimer')).delay >= 119900);
  c.run(`findAccountStateFile=async()=>{throw Object.assign(new Error('permission'),{status:403})};`);
  await assert.rejects(c.run('initializeAccountMediaState({refresh:true})'), /permission/);
  assert.equal(c.timers.size, 0);
  c.run(`findAccountStateFile=async()=>({files:[]});`);
  await c.run('initializeAccountMediaState({refresh:true})');
  assert.equal(c.run('state.accountStateRefreshBlocked'), false);
  assert.equal(c.timers.size, 1);
});

test('Drive 403 rate-limit errors back off rather than blocking future refresh', async () => {
  const c = client();
  c.run(`findAccountStateFile=async()=>{throw Object.assign(new Error('quota'),{status:403,driveReason:'userRateLimitExceeded',retryAfterMs:60000})};`);
  await assert.rejects(c.run('initializeAccountMediaState({refresh:true})'), /quota/);
  assert.equal(c.run('state.accountStateRefreshBlocked'), false);
  assert.ok(c.timers.get(c.run('state.accountStateRefreshTimer')).delay >= 59900);
});

test('verified token renewal restarts polling for an already-loaded account', async () => {
  const c = client();
  c.run(`state.accountStateLoaded=true;state.files=[{id:'existing'}];
    refreshedTokenMatchesAccount=async()=>true;clearClientIdError=()=>{};
    sendTokenToWorker=()=>{};updateConnectionBadge=()=>{};
    saveToken=(token,expires)=>{state.token=token;state.expiresAt=expires};clearToken(false);`);
  assert.equal(await c.run(`applyTokenResponse({access_token:'renewed',expires_in:3600},
    {background:true,invalidateSession:false,generation:state.authGeneration})`), true);
  const [id, callback] = [...c.timers.entries()][0]; c.timers.delete(id);
  await callback.fn();
  assert.notEqual(c.run('state.accountStateRefreshTimer'), null);
  assert.equal(c.timers.size, 1);
});

test('remote favorite membership invalidates back snapshots and refreshes the visible projection without reset', async () => {
  const c = client(); const calls = [];
  c.project = options => { calls.push(options); };
  c.run(`state.filter='favorites';state.favoriteFiles=[{id:'old'}];
    state.accountMediaState=normalizeAccountMediaState({favorites:{old:{liked:true,updatedAt:1}}});
    libraryNavigation.entries.set(1,{data:{},visual:{}});
    applyMergedAccountMediaState(normalizeAccountMediaState({favorites:{old:{liked:false,updatedAt:2},new:{liked:true,updatedAt:2}}}));
    loadFavoriteFiles=project;`);
  await c.run('refreshSyncedFavoriteFiles()');
  assert.equal(c.run('libraryNavigation.entries.get(1).data'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ refreshState: false, preserveWindow: true }]);
  c.run(`state.favoriteFiles=[{id:'new'}];refreshSyncedFavoriteFiles();`);
  assert.equal(calls.length, 1, 'unchanged membership does not reload metadata or the grid');
});

test('an old fulfilled edge animation cannot clear or complete a replacement transition', async () => {
  const c = client(); let finish;
  c.finished = new Promise(resolve => { finish = resolve; });
  c.run(`let backs=0;completeLibraryBackNavigation=()=>backs++;
    el.playerSheet={hidden:true};el.libraryView={style:{},animate:()=>({finished,cancel(){}})};
    settleLibraryEdgeBack(true,{width:390,distance:210,velocity:1});`);
  finish();
  c.run(`cancelLibraryEdgeBack();finished=new Promise(()=>{});
    settleLibraryEdgeBack(true,{width:390,distance:210,velocity:1});`);
  await Promise.resolve();
  assert.equal(c.run('backs'), 0);
  assert.equal(c.run('libraryNavigation.animations.length'), 1);
  const currentDeadline = [...c.timers.values()][0].fn;
  currentDeadline(); assert.equal(c.run('backs'), 1);
});
