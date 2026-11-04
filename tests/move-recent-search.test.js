'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadApp } = require('./app-loader.cjs');

class Node {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.dataset = {};
    this.attributes = {};
    this.disabled = false;
    this.listeners = {};
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
    const classes = () => this.className.split(/\s+/).filter(Boolean);
    this.classList = {
      add: (name) => { if (!classes().includes(name)) this.className = [...classes(), name].join(' '); },
      remove: (name) => { this.className = classes().filter((item) => item !== name).join(' '); },
      toggle: (name, on) => { if (on) this.classList.add(name); else this.classList.remove(name); },
      contains: (name) => classes().includes(name)
    };
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  click() { this.listeners.click?.(); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(node) {
    if (node.tagName === '#fragment') this.children.push(...node.children);
    else this.children.push(node);
    return node;
  }
  replaceChildren() { this.children = []; }
  all() { return this.children.flatMap((child) => [child, ...child.all()]); }
  querySelectorAll(selector) { return this.all().filter((node) => node.classList.contains(selector.slice(1))); }
  querySelector(selector) {
    if (selector === '[data-move-loading]') return this.all().find((node) => 'moveLoading' in node.dataset) || null;
    return this.querySelectorAll(selector)[0] || null;
  }
}

function client({ storage = new Map(), fetchImpl, subfolders = false } = {}) {
  if (subfolders) storage.set('drive-original.move-include-subfolders', '1');
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    console, performance, setTimeout, clearTimeout, setInterval, clearInterval,
    __DRIVE_ORIGINAL_RUNTIME__: { driveMutationsEnabled: true },
    location: { href: 'https://fixture.test/', origin: 'https://fixture.test', pathname: '/', search: '' },
    navigator: { onLine: true },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
    document: { addEventListener() {}, querySelectorAll() { return []; }, visibilityState: 'visible',
      createElement: (tag) => new Node(tag), createDocumentFragment: () => new Node('#fragment') },
    requestAnimationFrame() {} };
  c.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 390, matchMedia: () => ({ matches: false }), location: c.location };
  c.matchMedia = c.window.matchMedia;
  c.fetchCalls = [];
  c.fetch = async (url, options = {}) => {
    c.fetchCalls.push(new URL(url));
    return fetchImpl ? fetchImpl(new URL(url), options) : new Promise(() => {});
  };
  vm.createContext(c);
  loadApp(c);
  c.run = (code) => vm.runInContext(code, c);
  c.list = new Node('div');
  c.input = { value: '' };
  c.confirm = { disabled: true };
  c.el = c.run('el');
  Object.assign(c.el, { moveFolderList: c.list, moveSearchInput: c.input, moveConfirmButton: c.confirm, moveDialog: { open: true, close() { this.open = false; } } });
  c.run(`state.accountId='drive-account-A';state.authAccountKey='server-A';state.accountIdentityPending=false;
    state.token='synthetic-token';state.expiresAt=Date.now()+3600000;state.rootFolderId='root-id';
    state.authCapabilities={version:1,driveRead:true,driveWrite:true,appData:true};
    state.pendingActionFiles=[{id:'file-1',parents:['inbox'],mimeType:'video/mp4',capabilities:{canMoveItemWithinDrive:true}}];`);
  c.storage = storage;
  c.rows = () => c.list.querySelectorAll('.move-folder-row').map((row) => ({
    id: row.dataset.folderId, name: row.children[0].textContent, disabled: row.disabled }));
  c.text = () => c.list.all().filter((node) => !node.tagName.startsWith('#')).map((node) => node.textContent).filter(Boolean);
  return c;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('remembered folders are per account, most recent first, bounded, and malformed storage is ignored', () => {
  const c = client();
  for (let index = 0; index < 8; index++) c.run(`rememberRecentMoveFolder({id:'folder-${index}',name:'폴더 ${index}',capabilities:{canAddChildren:true}})`);
  c.run(`rememberRecentMoveFolder({id:'folder-3',name:'폴더 3'})`);
  const recent = JSON.parse(c.run('JSON.stringify(readRecentMoveFolders())'));
  assert.deepEqual(recent.map((item) => item.id), ['folder-3', 'folder-7', 'folder-6', 'folder-5', 'folder-4', 'folder-2']);
  assert.ok(recent.every((item) => !('capabilities' in item)), 'stored entries never carry permissions');

  c.run(`state.accountId='drive-account-B'`);
  assert.equal(c.run('readRecentMoveFolders().length'), 0, 'another account sees none of them');
  c.run(`state.accountIdentityPending=true;rememberRecentMoveFolder({id:'x',name:'x'})`);
  assert.equal([...c.storage.keys()].filter((key) => key.includes('drive-account-B')).length, 0);

  c.storage.set('drive-original.move-recent.drive-account-C', '{"not":"a list"}');
  c.run(`state.accountId='drive-account-C';state.accountIdentityPending=false`);
  assert.equal(c.run('readRecentMoveFolders().length'), 0);
  c.storage.set('drive-original.move-recent.drive-account-C', JSON.stringify([{ id: 'bad id/../', name: 'x' }, { id: 'ok_1', name: '추억' }]));
  assert.deepEqual(JSON.parse(c.run('JSON.stringify(readRecentMoveFolders().map(i=>i.id))')), ['ok_1']);
});

test('recent folders are selectable at once while the full folder index is still loading', () => {
  const c = client();
  c.run(`rememberRecentMoveFolder({id:'memories',name:'추억'});rememberRecentMoveFolder({id:'inbox',name:'받은 것'})`);
  c.run(`renderMoveFolderList('')`);
  assert.equal(c.text()[0], '최근 이동한 폴더');
  assert.deepEqual(c.rows().map((row) => [row.id, row.disabled]), [['inbox', true], ['memories', false]],
    'the current parent is marked and the remembered target is enabled');

  c.run(`setMoveFolderLoadingText('폴더 목록을 불러오는 중… 1,000개')`);
  assert.equal(c.rows().length, 2, 'progress updates keep the recent rows');
  assert.ok(c.text().includes('폴더 목록을 불러오는 중… 1,000개'));

  c.list.querySelectorAll('.move-folder-row')[1].click();
  assert.equal(c.run('state.moveTargetFolderId'), 'memories');
  assert.equal(c.confirm.disabled, false);
  assert.equal(c.run(`findMoveTargetRow('memories').name`), '추억', 'performMoveFile can resolve a recent target before the index exists');
});

test('typing searches Drive directly while the index loads, debounced and filtered to real matches', async () => {
  const c = client({ subfolders: true, fetchImpl: async () => Response.json({ files: [
    { id: 'm2', name: '추억 2024', parents: ['root-id'], capabilities: { canAddChildren: true } },
    { id: 'm1', name: '추억', parents: ['root-id'], capabilities: { canAddChildren: true } },
    { id: 'm1', name: '추억', parents: ['root-id'], capabilities: { canAddChildren: true } },
    { id: 'ro', name: '추억 공유본', parents: ['root-id'], capabilities: { canAddChildren: false } },
    { id: 'noise', name: '다른 폴더', parents: ['root-id'] }
  ] }) });
  c.run(`handleMoveSearchInput('추');handleMoveSearchInput("추억'")`);
  c.input.value = "추억'";
  assert.ok(c.text().includes('검색 중…'));
  c.run(`handleMoveSearchInput('추억')`);
  c.input.value = '추억';
  await wait(400);
  assert.equal(c.fetchCalls.length, 1, 'only the settled query reaches Drive');
  const params = c.fetchCalls[0].searchParams;
  assert.match(params.get('q'), /name contains '추억'/);
  assert.match(params.get('q'), /mimeType = 'application\/vnd\.google-apps\.folder'/);
  assert.equal(params.get('corpora'), 'allDrives');
  assert.equal(params.get('includeItemsFromAllDrives'), 'true');
  assert.deepEqual(c.rows().map((row) => [row.id, row.disabled]), [['m1', false], ['m2', false], ['ro', true]]);
  assert.ok(c.text().some((text) => text.startsWith('폴더 목록을 불러오는 중')), 'the full index keeps loading for middle-of-word matches');
  assert.equal(c.run(`findMoveTargetRow('m2').name`), '추억 2024');

  c.run(`handleMoveSearchInput("it's")`);
  await wait(400);
  assert.match(c.fetchCalls[1].searchParams.get('q'), /name contains 'it\\'s'/, 'quotes are escaped in the Drive query');
});

test('a superseded or failed search never paints stale rows', async () => {
  const pending = [];
  const c = client({ subfolders: true, fetchImpl: (url, options) => new Promise((resolve, reject) => {
    pending.push({ url, resolve });
    options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }) });
  c.run(`handleMoveSearchInput('여행')`);
  await wait(300);
  c.run(`handleMoveSearchInput('추억')`);
  c.input.value = '추억';
  pending[0].resolve(Response.json({ files: [{ id: 'trip', name: '여행' }] }));
  await wait(300);
  assert.equal(c.rows().length, 0);
  pending[1].resolve(new Response('{}', { status: 500 }));
  await wait(50);
  assert.ok(c.text().some((text) => text.startsWith('검색하지 못했습니다.')));
  c.run('cancelMoveFolderLoading()');
  assert.equal(c.run('state.moveSearch'), null);
});

test('with the full index, search stays local and recent rows follow the index', () => {
  const c = client({ subfolders: true });
  c.run(`rememberRecentMoveFolder({id:'gone',name:'지운 폴더'});rememberRecentMoveFolder({id:'memories',name:'옛 이름'})`);
  c.run(`state.folderIndex={roots:[{id:'root-id',name:'내 드라이브',capabilities:{canAddChildren:true}}],
    folders:[{id:'memories',name:'추억',parents:['root-id'],capabilities:{canAddChildren:true}},
             {id:'inbox',name:'받은 것',parents:['root-id']},{id:'deep',name:'옛 추억',parents:['memories']}]};
    state.moveFolderRows=buildMoveFolderRows(state.folderIndex);`);
  c.run(`renderMoveFolderList('')`);
  const text = c.text();
  assert.equal(text[0], '최근 이동한 폴더');
  assert.ok(text.includes('모든 폴더'));
  assert.equal(c.rows()[0].name, '추억', 'a remembered folder shows its current name and drops out once deleted');
  assert.ok(!c.rows().some((row) => row.id === 'gone'));

  c.run(`handleMoveSearchInput('억')`);
  assert.equal(c.fetchCalls.length, 0, 'no Drive search once every folder is known');
  assert.deepEqual(c.rows().map((row) => row.id), ['memories', 'deep'], 'local search also matches the middle of a name');
  assert.ok(!c.text().includes('최근 이동한 폴더'));
});

test('a completed move remembers its target folder', async () => {
  const c = client();
  c.run(`state.demo=true;state.files=[];state.moveTargetFolderId='memories';
    state.moveSearch={filter:'추억',status:'done',rows:[{id:'memories',name:'추억',depth:0,capabilities:{canAddChildren:true}}]};
    updateSelectionUI=()=>{};renderFiles=()=>{};collapseShortsExpand=()=>{};settleSelectionAfterBulk=()=>{};
    setButtonLoading=()=>{};showToast=()=>{};getPlaybackFileList=()=>[];`);
  await c.run('performMoveFile()');
  assert.deepEqual(JSON.parse(c.run('JSON.stringify(readRecentMoveFolders().map(i=>i.id))')), ['memories']);
  assert.equal(c.run('state.pendingActionFiles[0].parents[0]'), 'memories');
});

function driveFixture() {
  return async (url) => {
    if (url.pathname.endsWith('/drives')) {
      return Response.json({ drives: [{ id: 'shared-1', name: '팀 드라이브', capabilities: { canAddChildren: true, canListChildren: true } }] });
    }
    if (url.pathname.endsWith('/files/root')) return Response.json({ id: 'root-id', capabilities: { canAddChildren: true } });
    const q = url.searchParams.get('q');
    if (q.startsWith("'root-id' in parents")) {
      return Response.json({ files: [{ id: 'memories', name: '추억', parents: ['root-id'], capabilities: { canAddChildren: true } }] });
    }
    if (q.startsWith("'shared-1' in parents")) {
      return Response.json({ files: [{ id: 'team', name: '팀 자료', parents: ['shared-1'], driveId: 'shared-1', capabilities: { canAddChildren: true } }] });
    }
    return Response.json({ files: [
      { id: 'memories', name: '추억', parents: ['root-id'], capabilities: { canAddChildren: true } },
      { id: 'deep', name: '옛 추억', parents: ['memories'], capabilities: { canAddChildren: true } }
    ] });
  };
}

const folderQueries = (c) => c.fetchCalls.filter((url) => url.searchParams.has('q')).map((url) => url.searchParams.get('q'));

test('by default the index asks Drive only for direct children of My Drive and each shared drive', async () => {
  const c = client({ fetchImpl: driveFixture() });
  await c.run('ensureFolderIndex()');
  const queries = folderQueries(c);
  assert.equal(queries.length, 2);
  assert.ok(queries.every((q) => /^'(root-id|shared-1)' in parents and trashed = false and mimeType = /.test(q)));
  assert.equal(c.fetchCalls.find((url) => url.searchParams.get('q')?.startsWith("'shared-1'")).searchParams.get('driveId'), 'shared-1');
  c.run(`renderMoveFolderList('')`);
  assert.deepEqual(c.rows().map((row) => row.id), ['root-id', 'memories', 'shared-1', 'team']);
});

test('the top-level scope never searches deep folders, and remembered subfolders stay listed', async () => {
  const c = client({ fetchImpl: driveFixture() });
  c.run(`rememberRecentMoveFolder({id:'deep',name:'옛 추억'})`);
  c.run(`handleMoveSearchInput('옛')`);
  await wait(300);
  assert.equal(c.fetchCalls.length, 0, 'typing does not start a Drive search');
  assert.equal(c.rows().length, 0);
  assert.ok(c.text().includes('검색 중…'));

  await c.run('ensureFolderIndex()');
  c.run(`handleMoveSearchInput('')`);
  assert.equal(c.text()[0], '최근 이동한 폴더');
  assert.ok(c.text().includes('최상위 폴더'));
  assert.equal(c.rows()[0].id, 'deep', 'the top-level index cannot prove a remembered subfolder is gone');
  assert.equal(c.run(`findMoveTargetRow('deep').name`), '옛 추억');

  c.run(`handleMoveSearchInput('옛')`);
  assert.equal(c.rows().length, 0);
  assert.ok(c.text().some((text) => text.startsWith('일치하는 최상위 폴더가 없습니다.')));
  c.run(`handleMoveSearchInput('억')`);
  assert.deepEqual(c.rows().map((row) => row.id), ['memories'], 'local search still matches the middle of a name');
});

test('the setting is remembered on this device and changing it discards the cached index', async () => {
  const c = client({ fetchImpl: driveFixture() });
  assert.equal(c.run('moveIncludesSubfolders()'), false);
  await c.run('ensureFolderIndex()');
  assert.ok(c.run('state.folderIndex'));

  c.run('setMoveIncludesSubfolders(true)');
  assert.equal(c.storage.get('drive-original.move-include-subfolders'), '1');
  assert.equal(c.run('state.folderIndex'), null);
  assert.equal(c.run('state.moveFolderRows.length'), 0);

  c.fetchCalls.length = 0;
  await c.run('ensureFolderIndex()');
  assert.ok(folderQueries(c).every((q) => !q.includes(' in parents')), 'the full listing has no parent limit');
  c.run(`renderMoveFolderList('옛')`);
  assert.deepEqual(c.rows().map((row) => row.id), ['deep']);

  c.run('setMoveIncludesSubfolders(false)');
  assert.equal(c.storage.has('drive-original.move-include-subfolders'), false);
  assert.equal(c.run('state.folderIndex'), null);
});
