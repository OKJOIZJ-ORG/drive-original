'use strict';
// D126 before/after: request count and simulated time of subfolder scans.
// Usage: node qa/subfolder-load-20261029/bench.cjs [appDir]
// appDir defaults to ./app; pass a checkout of the previous commit's app/ to
// measure the old code. Each Drive request waits LATENCY_MS (D100 measured
// ~0.85 s TTFB per Drive request on actual Chrome).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const LATENCY_MS = Number(process.env.LATENCY_MS || 850);
const appDir = path.resolve(process.argv[2] || path.join(__dirname, '../../app'));
const root = path.join(__dirname, '../..');
const order = require(path.join(root, 'scripts/app-scripts.cjs'));
const scripts = (order.APP_SCRIPTS || order).map((name) => path.join(appDir, path.basename(name)));
const FOLDER = 'application/vnd.google-apps.folder';

// R (2052 media, 3 pages) ─┬─ Y (400 media) ── X (50 media)
//                          ├─ Z (30 media) ── Z1 (20) ── Z2 (10)
//                          └─ W (5 media)
const tree = { R: ['Y', 'Z', 'W'], Y: ['X'], Z: ['Z1'], Z1: ['Z2'] };
const mediaCount = { R: 2052, Y: 400, X: 50, Z: 30, Z1: 20, Z2: 10, W: 5 };
const parentOf = Object.fromEntries(Object.entries(tree).flatMap(([p, cs]) => cs.map((c) => [c, p])));
function folderItems(id, withParents) {
  const items = (tree[id] || []).map((c) => ({ id: c, name: c, mimeType: FOLDER, ...(withParents ? { parents: [id] } : {}) }));
  for (let i = 0; i < mediaCount[id]; i++) items.push({ id: `${id}-${i}`, name: `${id}-${i}.mp4`, mimeType: 'video/mp4',
    modifiedTime: new Date(1e12 - i * 1000).toISOString(), ...(withParents ? { parents: [id] } : {}) });
  return items;
}
function pages(id, withParents, firstSize) {
  const items = folderItems(id, withParents);
  const out = []; let at = 0, size = firstSize;
  while (at < items.length || !out.length) { out.push(items.slice(at, at + size)); at += size; size = 1000; }
  return out;
}

function makeContext() {
  const context = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    clearInterval, clearTimeout, console, fetch, performance, setInterval, setTimeout,
    history: { replaceState() {} }, navigator: { onLine: true },
    location: { href: 'https://example.test/', origin: 'https://example.test', pathname: '/', protocol: 'https:', hash: '', search: '' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; } } };
  context.window = { addEventListener() {}, removeEventListener() {}, location: context.location, isSecureContext: true,
    matchMedia() { return { matches: false }; }, setTimeout };
  context.matchMedia = context.window.matchMedia;
  context.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'media/revision-pin.js'), 'utf8'), context);
  for (const file of scripts) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  vm.runInContext(`hasUsableToken=()=>true; reportAppFailure=()=>{}; renderFiles=()=>{}; showLibrary=()=>{};
    showToast=()=>{}; showReconnectState=()=>{}; updateListLoadingUI=()=>{}; updateLibrarySummary=()=>{}; scheduleNextFilePage=()=>{};
    updateConnectionBadge=()=>{}; scrollToLibraryTop=()=>{}; animateFolderTransition=()=>{};
    state.currentFolderId='R'; state.currentFolderName='R'; state.filter='all';
    el.libraryStatus={textContent:''}; el.librarySummary={textContent:''}; el.refreshButton={disabled:false};
    el.deepScanToggle={setAttribute(){},classList:{toggle(){}}};
    el.deepScanStopBtn={hidden:true,setAttribute(name,value){this[name]=value}};`, context);
  const log = [];
  const tokens = new Map();
  context.driveFetch = async (url) => {
    const u = new URL(url);
    const id = decodeURIComponent(u.pathname.split('/').at(-1));
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    if (id !== 'files') { log.push(`GET ${id}`); return { json: async () => ({ id, name: id, mimeType: FOLDER, parents: parentOf[id] ? [parentOf[id]] : [] }) }; }
    const q = u.searchParams.get('q');
    const parent = q.match(/'([^']+)' in parents/)[1];
    if (q.includes(`mimeType = '${FOLDER}'`) && !q.includes('video/')) {
      log.push(`folders ${parent}`);
      return { json: async () => ({ files: (tree[parent] || []).map((c) => ({ id: c, name: c, mimeType: FOLDER, parents: [parent] })) }) };
    }
    const withParents = /,parents,/.test(u.searchParams.get('fields'));
    const token = u.searchParams.get('pageToken');
    const index = token ? tokens.get(token) : 0;
    const all = pages(parent, withParents, token ? 1000 : Number(u.searchParams.get('pageSize')));
    log.push(`list ${parent}#${index}`);
    const next = index + 1 < all.length ? `${parent}-p${index + 1}` : null;
    if (next) tokens.set(next, index + 1);
    return { json: async () => ({ files: all[index], nextPageToken: next }) };
  };
  return { context, log };
}

async function step(context, log, label, code) {
  const before = log.length; const t0 = performance.now();
  await vm.runInContext(code, context);
  // Selection changes start their scan or listing without returning it.
  do await new Promise((resolve) => setTimeout(resolve, 1));
  while (vm.runInContext('state.loadingTree || state.treeCachePromise || state.listRequestPromise', context));
  const ms = performance.now() - t0;
  return { label, requests: log.length - before, seconds: +(ms / 1000).toFixed(2), log: log.slice(before) };
}

(async () => {
  const { context, log } = makeContext();
  const sel = (all, marks) => `({ rootId: 'R', all: ${all}, marks: new Map(${JSON.stringify(marks)}.map(([id,on,p]) => [id, { on, path: p }])) })`;
  const results = [];
  // The folder is opened; only its first page (100) has loaded.
  results.push(await step(context, log, 'open R (first page)', `resetListingSession(); loadFiles({ append: false })`));
  // Picker: expand Y to reach X (the picker reads Y's subfolders).
  vm.runInContext(`subfolderPicker.rootId='R'; subfolderPicker.children=new Map();`, context);
  results.push(await step(context, log, 'picker: root subfolders', `loadSubfolderChildren('R')`));
  results.push(await step(context, log, 'picker: expand Y', `loadSubfolderChildren('Y')`));
  results.push(await step(context, log, 'apply: X (inside Y)', `applySubfolderSelection(${sel(false, [['X', true, ['Y']]])})`));
  results.push(await step(context, log, 'apply: X + Z subtree', `applySubfolderSelection(${sel(false, [['X', true, ['Y']], ['Z', true, []]])})`));
  results.push(await step(context, log, 'apply: all subfolders', `applySubfolderSelection(${sel(true, [])})`));
  results.push(await step(context, log, 'subfolders off', `applySubfolderSelection(null)`));
  results.push(await step(context, log, 'open Z, then back to R', `(async () => { state.currentFolderId='Z'; resetListingSession(); await applyFolderView();
    state.currentFolderId='R'; resetListingSession(); await applyFolderView(); })()`));
  const total = results.reduce((sum, r) => ({ requests: sum.requests + r.requests, seconds: +(sum.seconds + r.seconds).toFixed(2) }), { requests: 0, seconds: 0 });
  console.log(JSON.stringify({ appDir: path.relative(root, appDir) || '.', latencyMs: LATENCY_MS, results, total }, null, 1));
})();
