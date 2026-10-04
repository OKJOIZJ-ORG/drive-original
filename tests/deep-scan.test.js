'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const folderMime = 'application/vnd.google-apps.folder';
const folder = (id, parents = [], extra = {}) => ({ id, name: id, mimeType: folderMime, parents, ...extra });
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  vm.runInContext(`hasUsableToken=()=>true; reportAppFailure=()=>{}; renderFiles=()=>{}; updateLibrarySummary=()=>{};
    showToast=()=>{}; showReconnectState=()=>{}; state.deepScan=true; state.currentFolderId='A'; state.currentFolderName='A';
    el.libraryStatus={textContent:''}; el.deepScanToggle={setAttribute(){},classList:{toggle(){}}};
    el.deepScanStopBtn={hidden:true,setAttribute(name,value){this[name]=value}};`, context);
  return context;
}
const run = (context, code) => vm.runInContext(code, context);
const value = (context, code) => JSON.parse(run(context, `JSON.stringify(${code})`));

function provider(context, roots, pages, requests = []) {
  context.driveFetch = async (url, options) => {
    const parsed = new URL(url);
    const id = parsed.pathname.split('/').at(-1);
    requests.push({ id, query: parsed.searchParams.get('q'), token: parsed.searchParams.get('pageToken'),
      corpus: parsed.searchParams.get('corpora'), drive: parsed.searchParams.get('driveId'), headers: options.headers });
    if (id !== 'files') return { json: async () => roots[id] };
    const parent = parsed.searchParams.get('q').match(/'([^']+)' in parents/)[1];
    const page = pages[`${parent}:${parsed.searchParams.get('pageToken') || ''}`];
    assert(page, `unexpected folder/page ${parent}:${parsed.searchParams.get('pageToken') || ''}`);
    return { json: async () => page };
  };
  return requests;
}

test('deep scan reads only selected descendants, including empty token pages and nested pagination', async () => {
  const c = fixture();
  const requests = provider(c, { A: folder('A', ['actual-root']) }, {
    'A:': { files: [], nextPageToken: 'a2' },
    'A:a2': { files: [folder('B', ['A']), media('direct', 'A')], nextPageToken: 'a3' },
    'A:a3': { files: [media('last-root-page', 'A')] },
    'B:': { files: [folder('C', ['B']), media('nested', 'B')], nextPageToken: 'b2' },
    'B:b2': { files: [media('last-child-page', 'B')] },
    'C:': { files: [media('deepest', 'C')] }
  });
  await run(c, 'applyFolderView()');
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['direct', 'last-root-page', 'nested', 'last-child-page', 'deepest']);
  assert.deepEqual(value(c, '[...state.treeCache.scannedFolderIds]'), ['A', 'B', 'C']);
  assert.equal(requests.length, 7);
  assert(requests.slice(1).every(request => /'(A|B|C)' in parents/.test(request.query)));
  assert.equal(run(c, 'state.populationComplete'), true);
  assert.equal(run(c, 'el.deepScanStopBtn.hidden'), true);
  assert.equal(run(c, "el.deepScanStopBtn['aria-label']"), 'A 하위 폴더 탐색 중지');
  await run(c, 'ensureTreeCache()');
  assert.equal(requests.length, 7, 'covered folder must reuse completed cache');
});

test('deep scan distinguishes sibling coverage while retaining known favorites and descendant cache', async () => {
  const c = fixture();
  const requests = provider(c, { A: folder('A', ['root']), D: folder('D', ['root']) }, {
    'A:': { files: [folder('B', ['A']), media('liked-A', 'A')] }, 'B:': { files: [] },
    'D:': { files: [media('liked-D', 'D')] }
  });
  await run(c, 'ensureTreeCache()');
  run(c, "state.currentFolderId='B'");
  await run(c, 'ensureTreeCache()');
  assert.equal(requests.length, 3);
  run(c, "state.currentFolderId='D';state.currentFolderName='D';state.listGeneration++");
  await run(c, 'applyFolderView()');
  assert.equal(requests.length, 5);
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['liked-D']);
  assert.deepEqual(value(c, "collectKnownFavoriteMedia([state.treeCache.items],new Set(['liked-A','liked-D','external']),state.treeCache).missingIds"), ['external']);
  run(c, 'state.treeCache=buildTreeIndexes(state.treeCache.items,state.treeCache.scannedFolderIds)');
  assert.equal(run(c, "treeCacheCoversFolder(state.treeCache,'root')"), false);
});

test('deep scan uses shared-drive corpus and folder resource keys for every descendant page', async () => {
  const c = fixture();
  run(c, "libraryNavigation.entries.set(1,{data:{folders:[{id:'A',resourceKey:'key-A'}]}})");
  const requests = provider(c, { A: folder('A', [], { driveId: 'shared', resourceKey: 'key-A' }) }, {
    'A:': { files: [folder('B', ['A'], { driveId: 'shared', resourceKey: 'key-B' })] },
    'B:': { files: [media('shared-video', 'B')], nextPageToken: 'b2' }, 'B:b2': { files: [] }
  });
  await run(c, 'applyFolderView()');
  assert.equal(requests[0].headers['X-Goog-Drive-Resource-Keys'], 'A/key-A');
  assert(requests.slice(1).every(request => request.corpus === 'drive' && request.drive === 'shared'));
  assert(requests.slice(2).every(request => request.headers['X-Goog-Drive-Resource-Keys'] === 'B/key-B'));
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['shared-video']);
});

test('deep scan resolves My Drive root alias without showing its metadata as a child folder', async () => {
  const c = fixture();
  run(c, "state.currentFolderId='root'");
  provider(c, { root: folder('actual-root') }, { 'actual-root:': { files: [media('root-video', 'actual-root')] } });
  await run(c, 'applyFolderView()');
  assert.equal(run(c, 'state.rootFolderId'), 'actual-root');
  assert.deepEqual(value(c, 'state.folders'), []);
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['root-video']);
  assert.equal(run(c, "treeCacheCoversFolder(state.treeCache,'root')"), true);
});

test('deep scan rejects incomplete, malformed and repeated-token results without caching partial data', async () => {
  for (const failure of [{ files: [media('partial', 'A')], incompleteSearch: true }, {},
    { files: [], nextPageToken: 3 }, { files: [], nextPageToken: 'same' },
    { files: [media('wrong-parent', 'unrelated')] }, { files: [{ id: 'missing-parents' }] }]) {
    const c = fixture();
    provider(c, { A: folder('A') }, { 'A:': failure, 'A:same': failure });
    await run(c, 'ensureTreeCache()');
    assert.equal(run(c, 'state.treeCache'), null);
    assert.equal(run(c, 'state.deepScan'), false);
    assert.equal(run(c, 'state.loadingTree'), false);
    assert.match(run(c, 'el.libraryStatus.textContent'), /불러오지 못했습니다/);
  }
});

test('deep scan rejects unexpected folder metadata and preserves another completed cache on failure', async () => {
  const c = fixture();
  run(c, "state.treeCache=buildTreeIndexes([{id:'liked-D',mimeType:'video/mp4',parents:['D']}],new Set(['D']));globalThis.savedCache=state.treeCache");
  provider(c, { A: folder('unexpected') }, {});
  await run(c, 'ensureTreeCache()');
  assert.equal(run(c, 'state.treeCache===savedCache'), true);
  assert.equal(run(c, "treeCacheCoversFolder(state.treeCache,'A')"), false);
  assert.equal(run(c, 'state.deepScan'), false);
});

test('deep scan invalidation releases its own obsolete controls without running an old listing', async () => {
  const c = fixture();
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  c.driveFetch = async () => ({ json: () => new Promise(resolve => { release = resolve; entered(); }) });
  run(c, 'globalThis.normalLoads=0;loadFiles=async()=>{normalLoads++;return true}');
  const scan = run(c, 'ensureTreeCache()');
  await waiting;
  run(c, 'state.treeAbort.abort();state.driveSessionGeneration++');
  release(folder('A'));
  await scan;
  assert.equal(run(c, 'state.treeCache'), null);
  assert.equal(run(c, 'state.loadingTree'), false);
  assert.equal(run(c, 'state.treeAbort'), null);
  assert.equal(run(c, 'el.deepScanToggle.disabled'), false);
  assert.equal(run(c, 'normalLoads'), 0);
});

test('deep scan cancellation fences a late JSON response and returns to normal listing once', async () => {
  const c = fixture();
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  provider(c, { A: folder('A') }, {});
  const metaFetch = c.driveFetch;
  c.driveFetch = async (url, options) => new URL(url).pathname.endsWith('/files')
    ? { json: () => new Promise(resolve => { release = resolve; entered(); }) } : metaFetch(url, options);
  run(c, 'globalThis.normalLoads=0;loadFiles=async()=>{normalLoads++;return true}');
  const scan = run(c, 'ensureTreeCache()');
  await waiting;
  run(c, 'state.treeAbort.abort()');
  release({ files: [media('late-partial', 'A')] });
  await scan;
  assert.equal(run(c, 'state.treeCache'), null);
  assert.equal(run(c, 'state.deepScan'), false);
  assert.equal(run(c, 'normalLoads'), 1);
});

test('deep scan switching folders cancels stale work without disabling or overwriting the new view', async () => {
  const c = fixture();
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const requests = provider(c, { A: folder('A'), D: folder('D') }, { 'D:': { files: [media('new-view', 'D')] } });
  const realFetch = c.driveFetch;
  c.driveFetch = async (url, options) => new URL(url).searchParams.get('q')?.includes("'A' in parents")
    ? { json: () => new Promise(resolve => { release = resolve; entered(); }) } : realFetch(url, options);
  const oldScan = run(c, 'applyFolderView()');
  await waiting;
  run(c, "state.currentFolderId='D';state.currentFolderName='D';state.listGeneration++");
  const newScan = run(c, 'applyFolderView()');
  release({ files: [media('old-view', 'A')] });
  await Promise.all([oldScan, newScan]);
  assert.equal(run(c, 'state.deepScan'), true);
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['new-view']);
  assert.equal(run(c, "state.treeCache.items.some(f=>f.id==='old-view')"), false);
  assert.equal(run(c, 'state.loadingTree'), false);
  assert.equal(requests.length, 3);
});

test('deep scan account invalidation cannot commit or clear a newer owner controller', async () => {
  const c = fixture();
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  c.driveFetch = async () => ({ json: () => new Promise(resolve => { release = resolve; entered(); }) });
  const scan = run(c, 'ensureTreeCache()');
  await waiting;
  run(c, 'state.driveSessionGeneration++;globalThis.nextController=new AbortController();state.treeAbort=nextController;state.loadingTree=true');
  release(folder('A'));
  await scan;
  assert.equal(run(c, 'state.treeCache'), null);
  assert.equal(run(c, 'state.treeAbort===nextController'), true);
  assert.equal(run(c, 'state.loadingTree'), true);
});

test('deep scan returning to a cached folder aborts a different pending scope before reusing coverage', async () => {
  const c = fixture();
  run(c, "state.currentFolderId='D';state.treeCache=buildTreeIndexes([{id:'saved-A',mimeType:'video/mp4',parents:['A']}],new Set(['A']));globalThis.savedCache=state.treeCache");
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  provider(c, { D: folder('D') }, {});
  const metadata = c.driveFetch;
  c.driveFetch = async (url, options) => new URL(url).pathname.endsWith('/files')
    ? { json: () => new Promise(resolve => { release = resolve; entered(); }) } : metadata(url, options);
  const oldScan = run(c, 'applyFolderView()');
  await waiting;
  run(c, "state.currentFolderId='A';state.listGeneration++");
  const cachedView = run(c, 'applyFolderView()');
  assert.equal(run(c, 'state.treeAbort.signal.aborted'), true);
  release({ files: [media('stale-D', 'D')] });
  await Promise.all([oldScan, cachedView]);
  assert.equal(run(c, 'state.treeCache===savedCache'), true);
  assert.deepEqual(value(c, 'state.files.map(f=>f.id)'), ['saved-A']);
  assert.equal(run(c, 'state.loadingTree'), false);
});
