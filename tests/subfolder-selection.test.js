'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { loadApp } = require('./app-loader.cjs');

const folderMime = 'application/vnd.google-apps.folder';
const folder = (id, parents = []) => ({ id, name: id, mimeType: folderMime, parents });
const media = (id, parent) => ({ id, name: `${id}.mp4`, mimeType: 'video/mp4', parents: [parent] });

function fixture() {
  const context = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    clearInterval, clearTimeout, console, fetch, performance, setInterval, setTimeout,
    history: { replaceState() {} }, navigator: { onLine: true },
    location: { href: 'https://example.test/', origin: 'https://example.test', pathname: '/', protocol: 'https:', hash: '', search: '' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelectorAll() { return []; } } };
  context.window = { addEventListener() {}, removeEventListener() {}, location: context.location, isSecureContext: true,
    matchMedia() { return { matches: false }; }, setTimeout };
  context.matchMedia = context.window.matchMedia;
  context.requestAnimationFrame = callback => setTimeout(callback, 0);
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../media/revision-pin.js'), 'utf8'), context);
  loadApp(context);
  vm.runInContext(`hasUsableToken=()=>true; reportAppFailure=()=>{}; renderFiles=()=>{};
    showToast=()=>{}; showReconnectState=()=>{}; state.currentFolderId='A'; state.currentFolderName='A';
    el.libraryStatus={textContent:''}; el.librarySummary={textContent:''}; el.deepScanToggle={setAttribute(){},classList:{toggle(){}}};
    el.deepScanStopBtn={hidden:true,setAttribute(name,value){this[name]=value}};`, context);
  return context;
}
const run = (context, code) => vm.runInContext(code, context);
const value = (context, code) => JSON.parse(run(context, `JSON.stringify(${code})`));

// A ─┬─ B ── C
//    ├─ D
//    └─ a (media)
function provider(context, listed = []) {
  const pages = {
    'A:': { files: [folder('B', ['A']), folder('D', ['A']), media('a', 'A')] },
    'B:': { files: [folder('C', ['B']), media('b', 'B')] },
    'C:': { files: [media('c', 'C')] },
    'D:': { files: [media('d', 'D')] }
  };
  context.driveFetch = async (url) => {
    const parsed = new URL(url);
    const id = parsed.pathname.split('/').at(-1);
    if (id !== 'files') return { json: async () => folder(id, ['root']) };
    const parent = parsed.searchParams.get('q').match(/'([^']+)' in parents/)[1];
    listed.push(parent);
    return { json: async () => pages[`${parent}:`] };
  };
  return listed;
}

function choose(context, all, marks) {
  context.marks = marks;
  run(context, `state.deepScan = true; state.subfolderSelection = { rootId: 'A', all: ${all},
    marks: new Map(marks.map(([id, on, path]) => [id, { on, path }])) }; state.listGeneration++;`);
}

test('only the chosen subfolders are listed and shown', async () => {
  const c = fixture();
  const listed = provider(c);
  choose(c, false, [['B', true, []]]);
  await run(c, 'applyFolderView()');
  assert.deepEqual(listed, ['A', 'B', 'C'], 'D is never listed');
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['a', 'b', 'c']);
  assert.equal(run(c, 'state.subfolderSummary'), '하위 폴더 2개 포함');
});

test('a deeper choice can exclude part of a chosen subtree or reach past an unchosen parent', async () => {
  const c = fixture();
  provider(c);
  choose(c, true, [['C', false, ['B']]]);
  await run(c, 'applyFolderView()');
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['a', 'b', 'd'], 'all subfolders except C');

  const d = fixture();
  const listed = provider(d);
  choose(d, false, [['C', true, ['B']]]);
  await run(d, 'applyFolderView()');
  assert.deepEqual(listed, ['A', 'B', 'C'], 'B is listed only to reach C');
  assert.deepEqual(value(d, 'state.files.map(f=>f.id)'), ['a', 'c'], 'B itself stays out');
});

test('a wider choice reuses folders listed earlier and the whole choice matches the old full scan', async () => {
  const c = fixture();
  const listed = provider(c);
  choose(c, false, [['B', true, []]]);
  await run(c, 'applyFolderView()');
  choose(c, true, []);
  await run(c, 'applyFolderView()');
  assert.deepEqual(listed, ['A', 'B', 'C', 'D'], 'only the new folder D is listed; the root is not read again');
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)').sort(), ['a', 'b', 'c', 'd']);
  assert.equal(run(c, 'state.subfolderSummary'), '하위 폴더 전체 포함');
});

test('a hand-picked choice stays with its folder while the whole choice follows navigation', () => {
  const c = fixture();
  choose(c, false, [['B', true, []]]);
  assert.ok(run(c, "subfolderSelectionFor('A')"));
  assert.equal(run(c, "subfolderSelectionFor('B')"), null);
  choose(c, true, []);
  assert.equal(run(c, "subfolderSelectionFor('B').all"), true);
  run(c, 'state.subfolderSelection = null');
  assert.equal(run(c, "subfolderSelectionFor('B').all"), true, 'an older history entry without a choice means everything');
});

test('work in progress speaks in the summary line, results and errors below', () => {
  const c = fixture();
  run(c, 'state.loadingFiles = false; state.files = []; state.folders = [];');
  const token = run(c, "beginLibraryStatus('탐색 중…', { progress: true })");
  assert.equal(run(c, 'el.libraryStatus.textContent'), '');
  assert.equal(run(c, 'el.librarySummary.textContent'), '탐색 중…');
  run(c, `updateLibraryStatus(${token}, '불러오지 못했습니다')`);
  assert.equal(run(c, 'el.libraryStatus.textContent'), '불러오지 못했습니다');
  assert.notEqual(run(c, 'el.librarySummary.textContent'), '탐색 중…');
  run(c, "beginLibraryStatus('')");
  assert.equal(run(c, 'el.libraryStatus.textContent'), '');
});

test('a folder the choice only passes through is not listed when the picker already knows its subfolders', async () => {
  const c = fixture();
  const listed = provider(c);
  run(c, `subfolderPicker.rootId = 'A'; subfolderPicker.children.set('B', [{ id: 'C', name: 'C', mimeType: '${folderMime}', parents: ['B'] }]);`);
  choose(c, false, [['C', true, ['B']]]);
  await run(c, 'applyFolderView()');
  assert.deepEqual(listed, ['A', 'C'], 'B is never listed');
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['a', 'c']);
  // Including B later lists B itself, once.
  choose(c, false, [['B', true, []]]);
  await run(c, 'applyFolderView()');
  assert.deepEqual(listed, ['A', 'C', 'B']);
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)').sort(), ['a', 'b', 'c']);
});

test('a complete ordinary listing is reused by the scan and by returning to the folder', async () => {
  const c = fixture();
  const listed = provider(c);
  run(c, `showLibrary = () => {}; updateLibrarySummary = () => {};
    state.folders = [{ id: 'B', name: 'B', mimeType: '${folderMime}', parents: ['A'] }, { id: 'D', name: 'D', mimeType: '${folderMime}', parents: ['A'] }];
    state.files = [{ id: 'a', name: 'a.mp4', mimeType: 'video/mp4', parents: ['A'] }];
    state.populationComplete = true; rememberCompleteFolderListing('A');`);
  choose(c, false, [['D', true, []]]);
  await run(c, 'applyFolderView()');
  assert.deepEqual(listed, ['D'], 'the root listing is not read again');
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['a', 'd']);
  run(c, 'state.deepScan = false; state.subfolderSelection = null; state.listGeneration++;');
  await run(c, 'applyFolderView()');
  assert.deepEqual(listed, ['D'], 'turning the subfolders off needs no request');
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['a']);
  assert.deepEqual(value(c, 'state.folders.map(f=>f.id)'), ['B', 'D']);
  assert.equal(run(c, 'state.populationComplete'), true);
});

test('a scan continues an unfinished ordinary listing from its next page', async () => {
  const c = fixture();
  const requests = [];
  c.driveFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.split('/').at(-1) !== 'files') return { json: async () => folder('A', ['root']) };
    const parent = parsed.searchParams.get('q').match(/'([^']+)' in parents/)[1];
    requests.push({ parent, token: parsed.searchParams.get('pageToken'), corpora: parsed.searchParams.get('corpora'),
      fields: parsed.searchParams.get('fields') });
    if (parent === 'A') return { json: async () => ({ files: [{ id: 'a2', name: 'a2.mp4', mimeType: 'video/mp4' }] }) };
    return { json: async () => ({ files: [media('b', 'B')] }) };
  };
  choose(c, false, [['B', true, []]]);
  run(c, `deepScanListingSeed = { folderId: 'A', generation: state.listGeneration, nextPageToken: 'a-page-2', listedParent: true,
    items: [{ id: 'B', name: 'B', mimeType: '${folderMime}', parents: ['A'] }, { id: 'a1', name: 'a1.mp4', mimeType: 'video/mp4', parents: ['A'] }] };`);
  await run(c, 'applyFolderView()');
  // The seed already holds media, so B starts alongside A's next page.
  assert.deepEqual(requests.map(r => `${r.parent}:${r.token || ''}`).sort(), ['A:a-page-2', 'B:']);
  const continuation = requests.find(r => r.parent === 'A');
  assert.equal(continuation.corpora, null, 'the continuation repeats the ordinary listing query');
  assert.doesNotMatch(continuation.fields, /,parents,/);
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['a1', 'a2', 'b']);
  assert.equal(run(c, 'deepScanListingSeed'), null);
});

test('a subfolder is listed as soon as its parent arrives, without waiting for slower siblings', async () => {
  const c = fixture();
  const events = [];
  const pages = { A: [folder('B', ['A']), folder('D', ['A'])], B: [media('b', 'B')], D: [folder('E', ['D'])], E: [media('e', 'E')] };
  const delay = { A: 0, B: 40, D: 0, E: 0 };
  c.driveFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.split('/').at(-1) !== 'files') return { json: async () => folder('A', ['root']) };
    const parent = parsed.searchParams.get('q').match(/'([^']+)' in parents/)[1];
    events.push(`start ${parent}`);
    await new Promise(resolve => setTimeout(resolve, delay[parent]));
    events.push(`end ${parent}`);
    return { json: async () => ({ files: pages[parent] }) };
  };
  choose(c, true, []);
  await run(c, 'applyFolderView()');
  assert.ok(events.indexOf('start E') < events.indexOf('end B'), events.join(', '));
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['b', 'e']);
});

test('the picker reads the root subfolders from an ordinary listing that has reached its media', () => {
  const c = fixture();
  run(c, `subfolderPicker.rootId = 'A'; subfolderPicker.children = new Map(); state.deepScan = false; state.filter = 'all';
    state.folders = [{ id: 'D', name: 'D', mimeType: '${folderMime}', parents: ['A'] }, { id: 'B', name: 'B', mimeType: '${folderMime}', parents: ['A'] }];
    state.files = []; state.populationComplete = false; state.nextPageToken = 'next';`);
  assert.equal(run(c, "knownChildFolders('A')"), null, 'only folders so far: more may follow');
  run(c, "state.files = [{ id: 'a', mimeType: 'video/mp4', parents: ['A'] }]");
  assert.deepEqual(value(c, "knownChildFolders('A').map(f=>f.id)"), ['B', 'D'], 'folders come first, so all are known');
});

test('a scan of a completely listed folder sends no root listing request', async () => {
  const c = fixture();
  const listed = provider(c);
  choose(c, false, [['D', true, []]]);
  run(c, `deepScanListingSeed = { folderId: 'A', generation: state.listGeneration, nextPageToken: null, listedParent: true,
    items: [{ id: 'B', name: 'B', mimeType: '${folderMime}', parents: ['A'] }, { id: 'D', name: 'D', mimeType: '${folderMime}', parents: ['A'] },
      { id: 'a', name: 'a.mp4', mimeType: 'video/mp4', parents: ['A'] }] };`);
  await run(c, 'applyFolderView()');
  assert.deepEqual(listed, ['D']);
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['a', 'd']);
});

test('subfolders start once a page holds media, and a folder arriving out of order is still listed', async () => {
  const c = fixture();
  const events = [];
  const pages = {
    'A:': { files: [folder('B', ['A']), media('a1', 'A')], nextPageToken: 'p2' },
    'A:p2': { files: [media('a2', 'A'), folder('late', ['A'])] },
    'B:': { files: [media('b', 'B')] }, 'late:': { files: [media('l', 'late')] }
  };
  c.driveFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.split('/').at(-1) !== 'files') return { json: async () => folder('A', ['root']) };
    const key = `${parsed.searchParams.get('q').match(/'([^']+)' in parents/)[1]}:${parsed.searchParams.get('pageToken') || ''}`;
    events.push(`start ${key}`);
    await new Promise(resolve => setTimeout(resolve, key === 'A:p2' ? 30 : 0));
    events.push(`end ${key}`);
    return { json: async () => pages[key] };
  };
  choose(c, true, []);
  await run(c, 'applyFolderView()');
  assert.ok(events.indexOf('start B:') < events.indexOf('end A:p2'), events.join(', '));
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)').sort(), ['a1', 'a2', 'b', 'l']);
  assert.deepEqual(value(c, '[...state.treeCache.scannedFolderIds]'), ['A', 'B', 'late']);
});
