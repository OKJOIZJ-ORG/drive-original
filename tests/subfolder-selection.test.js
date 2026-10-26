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
  assert.deepEqual(listed, ['A', 'B', 'C', 'A', 'D'], 'only the root and the new folder D are listed again');
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
