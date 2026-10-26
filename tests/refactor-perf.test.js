'use strict';
// D103 performance changes: each fast path is compared with the algorithm it
// replaced, or pinned to the behavior the slower code had.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { appSource, loadApp } = require('./app-loader.cjs');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function miniDom() {
  class Node {
    constructor(tagName) {
      this.tagName = tagName; this.children = []; this.className = ''; this.dataset = {}; this.style = {};
      this.classList = {
        add: (...names) => { names.forEach((name) => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); }); },
        remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
        toggle: (name, force) => { const on = force ?? !this.classList.contains(name); if (on) this.classList.add(name); else this.classList.remove(name); return on; },
        contains: (name) => this.className.split(/\s+/).includes(name)
      };
    }
    addEventListener() {}
    setAttribute() {}
    appendChild(node) { if (node.tagName === '#fragment') this.children.push(...node.children); else this.children.push(node); return node; }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    replaceChildren(...nodes) { this.replaced = (this.replaced || 0) + 1; this.children = []; nodes.forEach((node) => this.appendChild(node)); }
    querySelector() { return this.children[0] || null; }
  }
  return { createElement: (tag) => new Node(tag), createDocumentFragment: () => new Node('#fragment') };
}

function appContext(storage = new Map()) {
  const dom = miniDom();
  const c = {
    URL, URLSearchParams, Map, Set, WeakMap, Math, Promise, console, setTimeout, clearTimeout, setInterval() {}, clearInterval() {},
    __DRIVE_ORIGINAL_RUNTIME__: {},
    location: { href: 'https://example.test/', origin: 'https://example.test', pathname: '/', search: '', hash: '', protocol: 'https:' },
    navigator: { onLine: true },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
    document: { ...dom, addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, documentElement: { dataset: {} } },
    window: { addEventListener() {}, innerWidth: 1200, matchMedia() { return { matches: false, addEventListener() {} }; } },
    requestAnimationFrame() {}
  };
  c.window.location = c.location;
  c.matchMedia = c.window.matchMedia;
  vm.createContext(c);
  loadApp(c);
  c.run = (code) => vm.runInContext(code, c);
  c.storage = storage;
  return c;
}

test('favorite and viewed id sets match the normalize-first results for messy states', () => {
  const c = appContext();
  const states = [
    null, 'text', {},
    { viewed: { a: 5, b: 0, c: -1, d: '7', e: 1.5, '': 3, f: Number.MAX_SAFE_INTEGER + 2 },
      favorites: { a: { liked: true, updatedAt: 1 }, b: { liked: false }, c: true, d: 0, e: 'yes', '': true, f: null, g: { liked: 1 } } },
    { viewed: [], favorites: 'x' }
  ];
  for (const value of states) {
    c.value = value;
    const result = JSON.parse(c.run(`JSON.stringify({
      favorites: [...accountFavoriteIds(value)].sort(),
      favoritesRef: Object.entries(normalizeAccountMediaState(value).favorites).filter(([, e]) => e.liked).map(([id]) => id).sort(),
      viewed: [...accountViewedIds(value)].sort(),
      viewedRef: Object.keys(normalizeAccountMediaState(value).viewed).sort()
    })`));
    assert.deepEqual(result.favorites, result.favoritesRef);
    assert.deepEqual(result.viewed, result.viewedRef);
  }
});

test('account cache persistence writes the same bytes as the parse-every-time algorithm', () => {
  const fast = appContext();
  const reference = appContext();
  const setup = `state.accountId='account-a';state.accountIdentityPending=false;
    state.accountMediaState=normalizeAccountMediaState({schemaVersion:1,updatedAt:5,viewed:{x:5},favorites:{y:{liked:true,updatedAt:5}}});`;
  fast.run(setup); reference.run(setup);
  // The algorithm before D103, run against the reference context.
  reference.run(`persistAccountMediaState = function () {
    const key = accountStateCacheKey();
    applyMergedAccountMediaState(mergeAccountMediaStates(
      normalizeAccountMediaState(localStorage.getItem(key) === null ? createEmptyAccountMediaState()
        : validateRawAccountMediaState(JSON.parse(localStorage.getItem(key)), true)), state.accountMediaState));
    localStorage.setItem(key, JSON.stringify(normalizeAccountMediaState(state.accountMediaState)));
  };`);
  let parses = 0;
  fast.run('const realParse = JSON.parse;');
  fast.countParse = () => { parses += 1; };
  fast.run('JSON.parse = (...args) => { countParse(); return realParse(...args); };');
  const steps = [
    'persistAccountMediaState()',
    "state.accountMediaState.viewed.v1 = 10; state.accountStateRevision += 1; persistAccountMediaState()",
    "state.accountMediaState.favorites['7'] = {liked:true,updatedAt:11}; persistAccountMediaState()",
    // Another tab writes the shared cache entry between our writes.
    `localStorage.setItem(accountStateCacheKey(), JSON.stringify({schemaVersion:1,updatedAt:30,
      viewed:{other:30,x:2},favorites:{y:{liked:false,updatedAt:30},z:true}})); persistAccountMediaState()`,
    "state.accountMediaState.viewed.v2 = 40; persistAccountMediaState()"
  ];
  for (const step of steps) {
    const before = parses;
    fast.run(step); reference.run(step);
    const key = fast.run('accountStateCacheKey()');
    assert.equal(fast.storage.get(key), reference.storage.get(key), step);
    assert.equal(fast.run('JSON.stringify(state.accountMediaState)'), reference.run('JSON.stringify(state.accountMediaState)'), step);
    if (!step.includes('localStorage.setItem') && step !== steps[0]) assert.equal(parses, before, `unchanged cache text is not reparsed: ${step}`);
  }
  assert.ok(parses >= 1, 'a foreign cache write is parsed and merged');
  assert.equal(fast.run("state.accountMediaState.favorites.y.liked"), false);
  // Callers mutate what readCachedAccountMediaState returns; the snapshot must stay private.
  fast.run("const owned = readCachedAccountMediaState(state.accountId); owned.viewed.mutated = 1;");
  assert.equal(fast.run("readCachedAccountMediaState(state.accountId).viewed.mutated"), undefined);
});

test('date sort parses each timestamp once and keeps undated files last in listing order', () => {
  const c = appContext();
  const files = Array.from({ length: 60 }, (_, index) => ({
    id: String(index), name: `f${index}`, mimeType: 'image/jpeg',
    modifiedTime: index % 7 === 0 ? undefined : index % 11 === 0 ? 'not a date' : new Date(Date.UTC(2026, 0, (index * 37) % 28 + 1, index % 24)).toISOString()
  }));
  c.files = files;
  const sorted = JSON.parse(c.run(`state.filter='all';state.query='';state.sort='modified';state.files=files;
    JSON.stringify(sortedPopulationFiles().map(f => f.id))`));
  const time = (file) => new Date(file.modifiedTime).getTime();
  const dated = files.filter((file) => Number.isFinite(time(file)));
  const undated = files.filter((file) => !Number.isFinite(time(file)));
  const expected = [...dated.sort((a, b) => time(b) - time(a)), ...undated].map((f) => f.id);
  assert.deepEqual(sorted, expected);
});

test('library sort options order by date, name, size and duration in both directions', () => {
  const c = appContext();
  c.files = [
    { id: 'a', name: 'b2', size: '30', modifiedTime: '2026-01-03T00:00:00Z', createdTime: '2025-01-01T00:00:00Z', mimeType: 'video/mp4', videoMediaMetadata: { durationMillis: '5000' } },
    { id: 'b', name: 'a10', size: '10', modifiedTime: '2026-01-01T00:00:00Z', createdTime: '2025-03-01T00:00:00Z', mimeType: 'image/jpeg' },
    { id: 'c', name: 'a9', size: '20', modifiedTime: '2026-01-02T00:00:00Z', createdTime: '2025-02-01T00:00:00Z', mimeType: 'video/mp4', videoMediaMetadata: { durationMillis: '9000' } },
    { id: 'd', name: 'c', modifiedTime: '2026-01-04T00:00:00Z', mimeType: 'image/png' }
  ];
  const order = (sort) => c.run(`state.filter='all';state.query='';state.sort='${sort}';state.files=files.slice();
    sortedPopulationFiles().map(f => f.id).join('')`);
  assert.equal(order('modifiedTime'), 'dacb');
  assert.equal(order('modifiedTimeAsc'), 'bcad');
  assert.equal(order('createdTime'), 'bcad');
  assert.equal(order('createdTimeAsc'), 'acbd');
  assert.equal(order('name'), 'cbad');
  assert.equal(order('nameDesc'), 'dabc');
  assert.equal(order('size'), 'acbd');
  assert.equal(order('sizeAsc'), 'bcad');
  assert.equal(order('duration'), 'cabd');
});

test('library search lowers a name once and follows renamed items', () => {
  const c = appContext();
  c.run(`state.query='abc'; window.__item = { name: 'xxABCxx' };`);
  assert.equal(c.run('matchesLibraryQuery(window.__item)'), true);
  c.run(`window.__item.name = 'nothing'`);
  assert.equal(c.run('matchesLibraryQuery(window.__item)'), false);
  c.run(`state.query=''`);
  assert.equal(c.run('matchesLibraryQuery(window.__item)'), true);
});

test('grid renders reuse unchanged cards, skip identical mounts and rebuild changed inputs', () => {
  const c = appContext();
  c.run(`(() => {
    el.fileGrid = document.createElement('div');
    el.fileGrid.clientWidth = 1030;
    window.__created = 0;
    const real = createFileCard;
    createFileCard = (file, index, absolute) => { window.__created += 1; const card = document.createElement('article'); card.file = file; if (index >= 24) card.classList.add('defer-render'); return card; };
    state.files = Array.from({length: 300}, (_, i) => ({ id: 'id' + i, name: 'n' + i, mimeType: 'image/jpeg' }));
    state.filter = 'all'; state.query = ''; state.sort = 'name'; state.renderWindowStart = 0;
  })()`);
  c.run('renderMediaGrid(filteredAndSortedFiles())');
  const first = JSON.parse(c.run('JSON.stringify({ created: window.__created, mounted: el.fileGrid.children.length, replaced: el.fileGrid.replaced })'));
  assert.equal(first.created, first.mounted);
  c.run('renderMediaGrid(filteredAndSortedFiles())');
  assert.equal(c.run('window.__created'), first.created, 'an unchanged range creates no card');
  assert.equal(c.run('el.fileGrid.replaced'), first.replaced, 'an identical mount is not replaced');
  // Moving the window keeps the overlapping cards and their defer hint follows the new index.
  c.run('state.renderWindowStart = 60; window.__created = 0; renderMediaGrid(filteredAndSortedFiles())');
  const moved = JSON.parse(c.run(`JSON.stringify({ created: window.__created, mounted: el.fileGrid.children.length,
    firstDeferred: el.fileGrid.children[0].classList.contains('defer-render'),
    lateDeferred: el.fileGrid.children[30].classList.contains('defer-render') })`));
  assert.equal(moved.created, 60);
  assert.equal(moved.firstDeferred, false);
  assert.equal(moved.lateDeferred, true);
  // A per-card input change (favorite, selection mode, renamed file) rebuilds that card.
  c.run(`window.__created = 0; state.accountMediaState.favorites[filteredAndSortedFiles()[70].id] = { liked: true, updatedAt: 1 };
    renderMediaGrid(filteredAndSortedFiles())`);
  assert.equal(c.run('window.__created'), 1);
  c.run('window.__created = 0; state.selectionMode = true; renderMediaGrid(filteredAndSortedFiles())');
  assert.equal(c.run('window.__created'), c.run('el.fileGrid.children.length'));
});

test('thumbnail extraction fills every free slot when the queue resumes', () => {
  const c = appContext();
  c.run(`window.__started = 0;
    startNextThumbnailExtraction = () => { thumbnailExtractionQueue.shift(); activeThumbnailExtractions += 1; window.__started += 1; };
    playerMediaPriorityActive = true;
    for (let i = 0; i < 5; i += 1) thumbnailExtractionQueue.push({ file: { id: 'v' + i }, generation: thumbnailGeneration });
    processThumbnailQueue();`);
  assert.equal(c.run('window.__started'), 0, 'player priority pauses extraction');
  c.run('playerMediaPriorityActive = false; processThumbnailQueue();');
  assert.equal(c.run('window.__started'), c.run('MAX_CONCURRENT_EXTRACTIONS'));
});

function serviceWorker(fetchImpl, cache) {
  const listeners = new Map();
  const c = { URL, Headers, Request, Response, setTimeout, clearTimeout, console,
    self: { location: { origin: 'https://app.test', href: 'https://app.test/drive-original/sw.js' }, registration: { scope: 'https://app.test/drive-original/' }, addEventListener: (type, fn) => listeners.set(type, fn) },
    fetch: fetchImpl, caches: { open: async () => cache } };
  c.importScripts = () => vm.runInContext(fs.readFileSync(path.join(root, 'media/revision-pin.js'), 'utf8'), c);
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), c);
  return { c, listeners, version: vm.runInContext('VERSION', c) };
}

async function dispatch(sw, url) {
  let responded;
  const pending = [];
  sw.listeners.get('fetch')({ request: new Request(url), clientId: 'c', respondWith(value) { responded = value; }, waitUntil(value) { pending.push(value); } });
  return { response: await responded, pending };
}

test('this release\'s ?v= shell assets come from its install batch without a network round trip', async () => {
  let fetches = 0;
  const stored = [];
  const cache = { match: async (key) => (key.endsWith('/app/core.js') ? new Response('installed bytes') : undefined), put: async (key) => { stored.push(key); } };
  const sw = serviceWorker(async () => { fetches += 1; return new Response('network bytes'); }, cache);
  const current = await dispatch(sw, `https://app.test/drive-original/app/core.js?v=${sw.version}`);
  assert.equal(await current.response.text(), 'installed bytes');
  assert.equal(fetches, 0);
  // Missing from the batch: fall back to the network and keep a copy.
  const missing = await dispatch(sw, `https://app.test/drive-original/styles.css?v=${sw.version}`);
  assert.equal(await missing.response.text(), 'network bytes');
  await Promise.all(missing.pending);
  assert.deepEqual(stored, ['https://app.test/drive-original/styles.css']);
});

test('another release\'s ?v= bytes stay network-first and never enter this release cache', async () => {
  const stored = [];
  const cache = { match: async () => new Response('installed bytes'), put: async (key) => { stored.push(key); } };
  const sw = serviceWorker(async () => new Response('next release'), cache);
  const next = await dispatch(sw, 'https://app.test/drive-original/app/core.js?v=99.0.0');
  assert.equal(await next.response.text(), 'next release');
  await Promise.all(next.pending);
  assert.deepEqual(stored, []);
});

test('a network shell response is not held back until the cache write finishes', async () => {
  let releasePut;
  const cache = { match: async () => undefined, put: () => new Promise((resolve) => { releasePut = resolve; }) };
  const sw = serviceWorker(async () => new Response('fresh shell'), cache);
  const result = await dispatch(sw, 'https://app.test/drive-original/index.html');
  assert.equal(await result.response.text(), 'fresh shell');
  assert.equal(result.pending.length, 1, 'the background cache write extends the event lifetime');
  releasePut();
  await Promise.all(result.pending);
});
