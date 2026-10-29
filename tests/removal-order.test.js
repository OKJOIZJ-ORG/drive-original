'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadApp } = require('./app-loader.cjs');

// Trash/move must not reshuffle the random order, and the player continues in its own order.
const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function client({ deepScan = false } = {}) {
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    console, performance, setTimeout, clearTimeout, setInterval, clearInterval,
    __DRIVE_ORIGINAL_RUNTIME__: { driveMutationsEnabled: true },
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
  c.value = (code) => JSON.parse(c.run(`JSON.stringify(${code})`));
  c.pending = new Map();
  c.settle = (id) => { const entry = c.pending.get(id); c.pending.delete(id); entry.resolve(); };
  c.driveHook = (file) => new Promise((resolve, reject) => c.pending.set(file.id, { resolve, reject }));
  const dialog = { open: true, close() { this.open = false; } };
  Object.assign(c.run('el'), { deleteDialog: dialog, moveDialog: dialog, driveActionStatus: { hidden: true }, playerSheet: { hidden: true } });
  c.run(`state.accountId='drive-account-A';state.authAccountKey='server-A';state.accountIdentityPending=false;
    state.files=${JSON.stringify(ids)}.map((id)=>({id,name:id+'.mp4',mimeType:'video/mp4',parents:['inbox']}));
    state.populationComplete=true;state.sort='random';
    renderFiles=()=>{};collapseShortsExpand=()=>{};reportAppFailure=()=>{};showToast=()=>{};
    updateLibrarySummary=()=>{};clearLibraryStatus=()=>{};
    trashDriveFile=(file)=>globalThis.driveHook(file);
    globalThis.opened=[];openMediaSource=(file)=>{state.selected=file;globalThis.opened.push(file.id);};
    animateMediaTransition=(direction,commit)=>commit();closePlayer=()=>{globalThis.opened.push('closed');};`);
  if (deepScan) {
    c.run(`state.deepScan=true;state.currentFolderId='inbox';state.rootFolderId='inbox';
      state.treeCache=buildTreeIndexes(state.files,new Set(['inbox']));computeAndRenderSubtree();`);
  }
  return c;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const order = (c) => c.value('filteredAndSortedFiles().map(f=>f.id)');

async function trash(c, id) {
  c.run(`state.pendingActionFiles=state.files.filter(f=>f.id===${JSON.stringify(id)})`);
  const job = c.run('performDeleteFile()');
  await tick();
  c.settle(id);
  await job;
}

for (const deepScan of [false, true]) {
  test(`trashing a file keeps the random order of the rest${deepScan ? ' with subfolders on' : ''}`, async () => {
    const c = client({ deepScan });
    const before = order(c);
    assert.equal(before.length, ids.length);
    await trash(c, before[3]);
    assert.deepEqual(order(c), before.filter((id) => id !== before[3]));
    await trash(c, before[0]);
    assert.deepEqual(order(c), before.filter((id) => id !== before[3] && id !== before[0]));
  });
}

test('a new file takes a random place without moving the others; an explicit shuffle starts over', () => {
  const c = client();
  const before = order(c);
  c.run(`state.files=[...state.files,{id:'new',name:'new.mp4',mimeType:'video/mp4',parents:['inbox']}]`);
  const after = order(c);
  assert.equal(after.length, ids.length + 1);
  assert.deepEqual(after.filter((id) => id !== 'new'), before);
  c.run('shuffledOrderMap.clear()');
  assert.equal(order(c).length, ids.length + 1);
});

test('trashing the file being viewed moves to the next file of the player order and keeps the shorts deck', async () => {
  const c = client();
  // The player was opened on c with its own order; the library order changed since.
  c.run(`el.playerSheet.hidden=false;state.selected=state.files.find(f=>f.id==='c');
    state.playbackOrderIds=['a','b','c','d','e','f','g','h'];
    state.playbackDeck={anchorId:'c',above:['g','a'],below:['e','h']};
    shuffledOrderMap=new Map(['h','g','f','e','d','c','b','a'].map((id,i)=>[id,i]));`);
  await trash(c, 'c');
  assert.deepEqual(c.value('globalThis.opened'), ['d'], 'next in the player order, not the library order (b)');
  const deck = c.value('state.playbackDeck');
  assert.equal(deck.anchorId, 'd');
  assert.deepEqual(deck.above, ['g', 'a'], 'swiping back still returns to the earlier items');
  assert.deepEqual(deck.below.slice(0, 2), ['e', 'h']);
});

test('trashing the last file of the player order wraps to the first remaining one', async () => {
  const c = client();
  c.run(`el.playerSheet.hidden=false;state.selected=state.files.find(f=>f.id==='h');
    state.playbackOrderIds=['a','b','c','d','e','f','g','h'];state.playbackDeck={anchorId:'h',above:[],below:[]};`);
  await trash(c, 'h');
  assert.deepEqual(c.value('globalThis.opened'), ['a']);
});

test('trashing the only file closes the player', async () => {
  const c = client();
  c.run(`state.files=state.files.slice(0,1);el.playerSheet.hidden=false;state.selected=state.files[0];
    state.playbackOrderIds=['a'];state.playbackDeck={anchorId:'a',above:[],below:[]};`);
  await trash(c, 'a');
  assert.deepEqual(c.value('globalThis.opened'), ['closed']);
});
