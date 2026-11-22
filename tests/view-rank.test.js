'use strict';
// D-154/D-156: per-device view and pass counts, and the random shorts and random sort order.
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

test('view and pass counts merge per writer by maximum and sum across writers; legacy views count once', () => {
  const c = client();
  const merged = c.json(`mergeAccountMediaStates(
    { viewed: { a: 10, b: 11, legacy: 3 }, viewCounts: { a: { phone: 3, pc: 1 }, b: { phone: 1 } }, passCounts: { p: { phone: 2 } }, favorites: {} },
    { viewed: { a: 12 }, viewCounts: { a: { phone: 2, pc: 4 } }, passCounts: { p: { pc: 1, phone: 1 } }, favorites: {} })`);
  assert.deepEqual(merged.viewCounts, { a: { phone: 3, pc: 4 }, b: { phone: 1 } });
  assert.deepEqual(merged.passCounts, { p: { phone: 2, pc: 1 } });
  const history = c.json(`(h=>({views:Object.fromEntries(h.views),passes:Object.fromEntries(h.passes)}))(accountViewHistory(${JSON.stringify(merged)}))`);
  assert.deepEqual(history, { views: { a: 7, b: 1, legacy: 1 }, passes: { p: 3 } });
  // Merging the same copy again changes nothing (idempotent).
  const again = c.json(`mergeAccountMediaStates(${JSON.stringify(merged)}, ${JSON.stringify(merged)})`);
  assert.deepEqual([again.viewCounts, again.passCounts], [merged.viewCounts, merged.passCounts]);
});

test('raw account state accepts missing or valid view counts and refuses malformed ones', () => {
  const c = client();
  const ok = (value) => c.run(`(()=>{try{validateRawAccountMediaState(${JSON.stringify(value)});return true;}catch(e){return e.code||e.message;}})()`);
  const base = { schemaVersion: 1, updatedAt: 1, viewed: { a: 1 }, favorites: {} };
  assert.equal(ok(base), true);
  assert.equal(ok({ ...base, viewCounts: { a: { w: 2 } } }), true);
  assert.equal(ok({ ...base, passCounts: { a: { w: 1 } } }), true);
  for (const counter of [[], { a: 3 }, { a: { w: 0 } }, { a: { w: 1.5 } }, { a: { '': 1 } }, { '': { w: 1 } }]) {
    assert.notEqual(ok({ ...base, viewCounts: counter }), true, JSON.stringify(counter));
    assert.notEqual(ok({ ...base, passCounts: counter }), true, JSON.stringify(counter));
  }
  assert.equal(c.run(`accountMediaStatesEqual(${JSON.stringify({ ...base, passCounts: { a: { w: 1 } } })}, ${JSON.stringify(base)})`), false);
  assert.equal(c.run(`accountMediaStatesEqual(${JSON.stringify({ ...base, viewCounts: { a: { w: 1 } } })}, ${JSON.stringify({ ...base, viewCounts: { a: { w: 2 } } })})`), false);
  assert.equal(c.run(`accountMediaStatesEqual(${JSON.stringify({ ...base, viewCounts: { a: { w: 2 } } })}, ${JSON.stringify({ ...base, viewCounts: { a: { w: 2 } } })})`), true);
});

test('each view or pass raises only this writer\'s slot', () => {
  const c = client();
  c.run(`state.accountIdentityPending=false;state.accountStateWriterId='this-writer';queueAccountStateSync=()=>{};
    state.accountMediaState=normalizeAccountMediaState({viewed:{a:1},viewCounts:{a:{other:5}},passCounts:{p:{other:1}},favorites:{}});
    let clock=1000;Date.now=()=>clock++;markFileViewed('a');markFileViewed('a');markFileViewed('b');markFilePassed('p');markFilePassed('q');`);
  assert.deepEqual(c.json('state.accountMediaState.viewCounts'), { a: { other: 5, 'this-writer': 2 }, b: { 'this-writer': 1 } });
  assert.deepEqual(c.json('state.accountMediaState.passCounts'), { p: { other: 1, 'this-writer': 1 }, q: { 'this-writer': 1 } });
  assert.deepEqual(c.json('Object.fromEntries(getViewHistory().views)'), { a: 7, b: 1 });
  assert.deepEqual(c.json('Object.fromEntries(getViewHistory().passes)'), { p: 2, q: 1 });
});

test('rank order: never shown, then passed (fewer first), then viewed (fewer first), then shown this session', () => {
  const c = client();
  const rank = (id) => c.run(`createDeckRank({views:new Map([['v1',1],['v3',3],['both',1]]),passes:new Map([['p1',1],['p2',2],['both',5]])},new Set(['s']))(${JSON.stringify(id)})`);
  const order = ['new', 'p1', 'p2', 'v1', 'v3', 's'].map(rank);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal(new Set(order).size, order.length);
  assert.equal(rank('both'), rank('v1'), 'a viewed file ranks by views, whatever its passes');
});

test('the 30 s / 70 % threshold', () => {
  const c = client();
  assert.deepEqual([10, 23, 40, 3600, NaN, 0].map((d) => c.run(`viewThresholdSeconds(${d})`)), [7, 16.099999999999998, 28, 30, 30, 30]);
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

test('random sort lists never-shown media first, then passed, then fewer views, each group uniformly shuffled', () => {
  const c = client();
  c.run(`state.accountMediaState=normalizeAccountMediaState({viewed:{w1:1,w2:1,w3:1},viewCounts:{w3:{x:4}},passCounts:{p1:{x:1}},favorites:{}});
    currentPopulationFiles=()=>['w1','u1','w3','u2','p1','w2','u3'].map(id=>({id}));`);
  const positions = { u1: [0, 0, 0] };
  for (let i = 0; i < 3000; i += 1) {
    c.run('shuffleCurrentFiles()');
    const order = c.json('[...shuffledOrderMap.keys()]');
    assert.deepEqual(order.slice(0, 3).sort(), ['u1', 'u2', 'u3']);
    assert.equal(order[3], 'p1');
    assert.deepEqual(order.slice(4, 6).sort(), ['w1', 'w2']);
    assert.equal(order[6], 'w3');
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
