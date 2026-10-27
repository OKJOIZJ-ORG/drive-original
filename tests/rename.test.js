'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadApp } = require('./app-loader.cjs');

function client(storage = new Map(), runtime = { driveMutationsEnabled: true }) {
  const locks = new Map();
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    TextEncoder, crypto: globalThis.crypto,
    console, performance, fetch, setTimeout, clearTimeout, setInterval, clearInterval,
    __DRIVE_ORIGINAL_RUNTIME__: runtime,
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
  loadApp(c);
  c.run = code => vm.runInContext(code, c);
  c.toasts = [];
  c.captureToast = message => c.toasts.push(message);
  c.run(`state.accountId='drive-account-A';state.authAccountKey='server-account-A';state.accountIdentityPending=false;
    state.token='synthetic-token';state.expiresAt=Date.now()+3600000;
    state.authCapabilities={version:1,driveRead:true,driveWrite:true,appData:true};
    state.moveFolderRows=[];state.rootFolderId='root';
    showToast=(m)=>globalThis.captureToast(m);renderFiles=()=>{};collapseShortsExpand=()=>{};reportAppFailure=()=>{};
    const item={id:'synthetic-file',name:'holiday.mp4',parents:['old'],version:'1',mimeType:'video/mp4'};
    state.files=[item];state.populationComplete=true;`);
  c.entries = () => [...storage.entries()].filter(([key]) => key.startsWith('drive-original.mutation.')).map(([, value]) => JSON.parse(value));
  c.ledgerText = () => [...storage.entries()].filter(([key]) => key.startsWith('drive-original.mutation.')).map(([, value]) => value).join('\n');
  return c;
}

function remote(c, { patch = 'apply', canRename = true } = {}) {
  const item = { id: 'synthetic-file', name: 'holiday.mp4', parents: ['old'], version: '1', mimeType: 'video/mp4', trashed: false,
    capabilities: { canTrash: true, canRename, canMoveItemWithinDrive: true, canMoveItemOutOfDrive: true } };
  const calls = [];
  c.fetch = async (url, options = {}) => {
    const u = new URL(url); const method = options.method || 'GET';
    calls.push({ method, params: u.searchParams, body: options.body });
    if (method === 'PATCH') {
      if (patch === 'deny') return new Response('{"error":{"message":"Forbidden"}}', { status: 403 });
      if (patch === 'lost-before') throw new TypeError('synthetic response lost');
      item.name = JSON.parse(options.body).name;
      item.version = '2';
      if (patch === 'lost') throw new TypeError('synthetic response lost');
      return new Response('{}', { status: 200 });
    }
    return Response.json(item);
  };
  return { item, calls, patches: () => calls.filter(call => call.method === 'PATCH') };
}

test('rename sends one PATCH with only the name and confirms it by an independent GET', async () => {
  const c = client(); const r = remote(c);
  const result = await c.run("renameDriveFile(item,'여름 휴가.mp4')");
  assert.equal(r.patches().length, 1);
  assert.deepEqual(JSON.parse(r.patches()[0].body), { name: '여름 휴가.mp4' });
  assert.equal(r.patches()[0].params.has('addParents'), false);
  assert.match(r.calls[0].params.get('fields'), /\bname\b.*canRename/);
  assert.equal(r.calls.at(-1).method, 'GET');
  assert.equal(c.entries()[0].action, 'rename');
  assert.equal(c.entries()[0].state, 'confirmed');
  assert.equal(result.metadata.version, '2');
  assert.equal(c.run('item.version'), '2');
});

test('the persisted ledger never holds the old or new file name, only its hash', async () => {
  const c = client(); remote(c);
  await c.run("renameDriveFile(item,'여름 휴가.mp4')");
  const text = c.ledgerText();
  assert.doesNotMatch(text, /holiday|여름|휴가/);
  assert.match(c.entries()[0].nameHash, /^[0-9a-f]{64}$/);
  assert.match(c.entries()[0].confirmedAfter.nameHash, /^[0-9a-f]{64}$/);
});

test('a lost PATCH response is confirmed by GET without replaying the PATCH', async () => {
  const c = client(); const r = remote(c, { patch: 'lost' });
  await c.run("renameDriveFile(item,'renamed.mp4')");
  assert.equal(r.patches().length, 1);
  assert.equal(c.entries()[0].state, 'confirmed');
});

test('a rename that never landed stays uncertain, and reload recovery only reads', async () => {
  const storage = new Map(); const c = client(storage); const r = remote(c, { patch: 'lost-before' });
  await assert.rejects(c.run("renameDriveFile(item,'renamed.mp4')"), error => error.mutationState === 'uncertain');
  assert.equal(r.patches().length, 1);
  const next = client(storage); const reads = remote(next);
  await next.run('recoverDriveMutations()');
  assert.equal(next.entries()[0].state, 'uncertain');
  reads.item.name = 'renamed.mp4'; reads.item.version = '2';
  await next.run('recoverDriveMutations()');
  assert.equal(next.entries()[0].state, 'confirmed');
  assert.equal(reads.patches().length, 0);
});

test('no rename permission or a candidate build sends no PATCH', async () => {
  const c = client(); const r = remote(c, { canRename: false });
  await assert.rejects(c.run("renameDriveFile(item,'renamed.mp4')"), error => error.status === 403);
  assert.equal(r.patches().length, 0);
  const candidate = client(new Map(), { candidate: true, driveMutationsEnabled: false, accountStateWritesEnabled: true });
  const locked = remote(candidate);
  await assert.rejects(candidate.run("renameDriveFile(item,'renamed.mp4')"));
  assert.equal(locked.patches().length, 0);
});

test('a file that already has the name is confirmed without a PATCH', async () => {
  const c = client(); const r = remote(c);
  const result = await c.run("renameDriveFile(item,'holiday.mp4')");
  assert.equal(result.skipped, true);
  assert.equal(r.patches().length, 0);
});

test('the background job renames the listed file only after Drive confirms it', async () => {
  const c = client(); const r = remote(c);
  c.run(`el.driveActionStatus={hidden:true};el.driveActionStatusText={textContent:''};
    state.selected=item;el.playerTitle={textContent:'holiday.mp4'};`);
  const job = c.run("performRenameFile(item,'  새 이름.mp4\\n')");
  assert.equal(c.run('el.driveActionStatus.hidden'), false);
  assert.equal(c.run('el.driveActionStatusText.textContent'), '이름 바꾸는 중 0/1');
  assert.equal(c.run('state.files[0].name'), 'holiday.mp4', 'the list keeps the old name until confirmation');
  assert.equal(c.run('filteredAndSortedFiles().length'), 1, 'a rename never hides the file');
  await job;
  assert.deepEqual(JSON.parse(r.patches()[0].body), { name: '새 이름.mp4' });
  assert.equal(c.run('state.files[0].name'), '새 이름.mp4');
  assert.equal(c.run('el.playerTitle.textContent'), '새 이름.mp4');
  assert.equal(c.run('el.driveActionStatus.hidden'), true);
  assert.match(c.toasts.at(-1), /^이름을 '새 이름\.mp4'\(으\)로 바꿨습니다\./);
});

test('a refused rename keeps the old name and says why', async () => {
  const c = client(); remote(c, { patch: 'deny' });
  c.run(`el.driveActionStatus={hidden:true};el.driveActionStatusText={textContent:''};`);
  await c.run("performRenameFile(item,'renamed.mp4')");
  assert.equal(c.run('state.files[0].name'), 'holiday.mp4');
  assert.match(c.toasts.at(-1), /^이름을 바꾸지 못했습니다/);
});

test('blank or unchanged names do not queue a Drive job', () => {
  const c = client(); const r = remote(c);
  assert.equal(c.run("performRenameFile(item,'   ')"), null);
  assert.equal(c.run("performRenameFile(item,'holiday.mp4')"), null);
  assert.equal(c.run('hasPendingDriveActions()'), false);
  assert.equal(r.calls.length, 0);
});
