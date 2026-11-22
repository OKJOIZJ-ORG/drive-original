'use strict';
// D-153: view counts per device, fewer-views-first random shorts and random sort.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadApp } = require('./app-loader.cjs');

function client() {
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    console, performance, setTimeout, clearTimeout, setInterval, clearInterval, crypto: globalThis.crypto,
    location: { href: 'https://fixture.test/', origin: 'https://fixture.test', pathname: '/', search: '' },
    navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelectorAll() { return []; }, visibilityState: 'visible' },
    requestAnimationFrame() {} };
  c.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 390, matchMedia: () => ({ matches: false }), location: c.location };
  c.matchMedia = c.window.matchMedia;
  c.fetch = () => new Promise(() => {});
  vm.createContext(c);
  loadApp(c);
  c.run = (code) => vm.runInContext(code, c);
  c.json = (code) => JSON.parse(c.run(`JSON.stringify(${code})`));
  return c;
}

test('view counts merge per writer by maximum and sum across writers; legacy views count once', () => {
  const c = client();
  const merged = c.json(`mergeAccountMediaStates(
    { viewed: { a: 10, b: 11, legacy: 3 }, viewCounts: { a: { phone: 3, pc: 1 }, b: { phone: 1 } }, favorites: {} },
    { viewed: { a: 12 }, viewCounts: { a: { phone: 2, pc: 4 } }, favorites: {} })`);
  assert.deepEqual(merged.viewCounts, { a: { phone: 3, pc: 4 }, b: { phone: 1 } });
  const counts = c.json(`Object.fromEntries(accountViewCounts(${JSON.stringify(merged)}))`);
  assert.deepEqual(counts, { a: 7, b: 1, legacy: 1 });
  // Merging the same copy again changes nothing (idempotent).
  assert.deepEqual(c.json(`mergeAccountMediaStates(${JSON.stringify(merged)}, ${JSON.stringify(merged)}).viewCounts`), merged.viewCounts);
});

test('raw account state accepts missing or valid view counts and refuses malformed ones', () => {
  const c = client();
  const ok = (value) => c.run(`(()=>{try{validateRawAccountMediaState(${JSON.stringify(value)});return true;}catch(e){return e.code||e.message;}})()`);
  const base = { schemaVersion: 1, updatedAt: 1, viewed: { a: 1 }, favorites: {} };
  assert.equal(ok(base), true);
  assert.equal(ok({ ...base, viewCounts: { a: { w: 2 } } }), true);
  for (const viewCounts of [[], { a: 3 }, { a: { w: 0 } }, { a: { w: 1.5 } }, { a: { '': 1 } }, { '': { w: 1 } }]) {
    assert.notEqual(ok({ ...base, viewCounts }), true, JSON.stringify(viewCounts));
  }
  assert.equal(c.run(`accountMediaStatesEqual(${JSON.stringify({ ...base, viewCounts: { a: { w: 1 } } })}, ${JSON.stringify({ ...base, viewCounts: { a: { w: 2 } } })})`), false);
  assert.equal(c.run(`accountMediaStatesEqual(${JSON.stringify({ ...base, viewCounts: { a: { w: 2 } } })}, ${JSON.stringify({ ...base, viewCounts: { a: { w: 2 } } })})`), true);
});

test('each observed view raises only this writer\'s slot', () => {
  const c = client();
  c.run(`state.accountIdentityPending=false;state.accountStateWriterId='this-writer';queueAccountStateSync=()=>{};
    state.accountMediaState=normalizeAccountMediaState({viewed:{a:1},viewCounts:{a:{other:5}},favorites:{}});
    let clock=1000;Date.now=()=>clock++;markFileViewed('a');markFileViewed('a');markFileViewed('b');`);
  assert.deepEqual(c.json('state.accountMediaState.viewCounts'), { a: { other: 5, 'this-writer': 2 }, b: { 'this-writer': 1 } });
  assert.deepEqual(c.json('Object.fromEntries(getViewCounts())'), { a: 7, b: 1 });
});

test('random shorts deck: fewer views first, uniform within a count, shown this session last', () => {
  const c = client();
  const files = JSON.stringify(['cur', 'u1', 'u2', 'once1', 'once2', 'twice', 'shown'].map((id) => ({ id })));
  const views = `new Map([['once1',1],['once2',1],['twice',2],['shown',0]])`;
  const firstSeen = { u1: 0, u2: 0 };
  for (let i = 0; i < 2000; i += 1) {
    const order = c.json(`rankedDeckIds(${files},'cur',undefined,${views},new Set(['shown']))`);
    assert.deepEqual(order.slice(0, 2).sort(), ['u1', 'u2']);
    assert.deepEqual(order.slice(2, 4).sort(), ['once1', 'once2']);
    assert.deepEqual(order.slice(4), ['twice', 'shown']);
    firstSeen[order[0]] += 1;
  }
  // Uniform inside the unseen group: each comes first about half the time.
  assert.ok(Math.abs(firstSeen.u1 - 1000) < 120, JSON.stringify(firstSeen));
  // The forward swipe takes the best candidate.
  const deck = c.json(`buildVerticalPlaybackDeck(${files},'cur',undefined,2,${views},new Set(['shown']))`);
  assert.ok(['u1', 'u2'].includes(deck.below[0]));
});

test('random sort lists never-watched media first, then fewer views, each group uniformly shuffled', () => {
  const c = client();
  c.run(`state.accountMediaState=normalizeAccountMediaState({viewed:{w1:1,w2:1,w3:1},viewCounts:{w3:{x:4}},favorites:{}});
    currentPopulationFiles=()=>['w1','u1','w3','u2','w2','u3'].map(id=>({id}));`);
  const positions = { u1: [0, 0, 0] };
  for (let i = 0; i < 3000; i += 1) {
    c.run('shuffleCurrentFiles()');
    const order = c.json('[...shuffledOrderMap.keys()]');
    assert.deepEqual(order.slice(0, 3).sort(), ['u1', 'u2', 'u3']);
    assert.deepEqual(order.slice(3, 5).sort(), ['w1', 'w2']);
    assert.equal(order[5], 'w3');
    positions.u1[order.indexOf('u1')] += 1;
  }
  for (const count of positions.u1) assert.ok(Math.abs(count - 1000) < 120, JSON.stringify(positions));
});

test('a new file joins the random order among the files of its rank or lower; nothing else moves', () => {
  const c = client();
  c.run(`state.accountMediaState=normalizeAccountMediaState({viewed:{w1:1,w2:1},favorites:{}});
    shuffledOrderMap=new Map([['u1',0],['u2',1],['w1',2],['w2',3]]);`);
  for (let i = 0; i < 300; i += 1) {
    c.run(`shuffledOrderMap=new Map([['u1',0],['u2',1],['w1',2],['w2',3]]);
      syncShuffledOrder(['u1','u2','w1','w2','new'].map(id=>({id})));`);
    const order = c.json('[...shuffledOrderMap.keys()]');
    assert.ok(order.indexOf('new') <= 2, order.join());
    assert.deepEqual(order.filter((id) => id !== 'new'), ['u1', 'u2', 'w1', 'w2']);
  }
  // Removing a file keeps the rest in place.
  c.run(`syncShuffledOrder(['u1','w1','w2','new'].map(id=>({id})));`);
  assert.deepEqual(c.json('[...shuffledOrderMap.keys()]').filter((id) => id !== 'new'), ['u1', 'w1', 'w2']);
});
