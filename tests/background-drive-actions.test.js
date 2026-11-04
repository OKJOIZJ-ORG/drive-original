'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadApp } = require('./app-loader.cjs');

function client({ local = true } = {}) {
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
  c.toasts = [];
  c.calls = [];
  c.pending = new Map();
  c.dialog = { open: true, close() { this.open = false; } };
  Object.assign(c.run('el'), { deleteDialog: c.dialog, moveDialog: c.dialog });
  // Each Drive call stays open until the test settles it by file id.
  c.settle = (id, error) => { const entry = c.pending.get(id); c.pending.delete(id); if (error) entry.reject(error); else entry.resolve(); };
  c.driveHook = (kind, file) => new Promise((resolve, reject) => { c.calls.push(`${kind}:${file.id}`); c.pending.set(file.id, { resolve, reject }); });
  c.run(`state.accountId='drive-account-A';state.authAccountKey='server-A';state.accountIdentityPending=false;
    state.files=[{id:'a',name:'a.mp4',mimeType:'video/mp4',parents:['inbox']},{id:'b',name:'b.mp4',mimeType:'video/mp4',parents:['inbox']},
      {id:'c',name:'c.mp4',mimeType:'video/mp4',parents:['inbox']}];
    state.populationComplete=true;
    renderFiles=()=>{};collapseShortsExpand=()=>{};reportAppFailure=()=>{};`);
  if (local) c.run('serverDriveJobsEnabled=()=>false');
  c.captureToast = (message) => c.toasts.push(message);
  c.run(`showToast=(m)=>globalThis.captureToast(m);
    trashDriveFile=(file)=>globalThis.driveHook('trash',file);
    moveDriveFile=(file,row)=>globalThis.driveHook('move:'+row.id,file).then(()=>{file.parents=[row.id];return {skipped:false};});`);
  return c;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const visibleIds = (c) => JSON.parse(c.run('JSON.stringify(filteredAndSortedFiles().map(f=>f.id))'));
const playbackIds = (c) => JSON.parse(c.run('JSON.stringify(getPlaybackFileList().map(f=>f.id))'));

test('confirming a trash closes the dialog at once and hides the files while Drive works in the background', async () => {
  const c = client();
  c.run(`state.pendingActionFiles=[state.files[0],state.files[1]]`);
  const job = c.run('performDeleteFile()');
  assert.equal(c.dialog.open, false, 'the dialog does not wait for Drive');
  assert.deepEqual(visibleIds(c), ['c']);
  assert.deepEqual(playbackIds(c), ['c'], 'swipe order skips files being trashed');
  assert.equal(c.run('driveActionJobs[0].done'), 0);
  assert.equal(c.run('state.pendingActionFiles.length'), 0, 'the next action starts from a clean selection');

  await tick();
  c.settle('a');
  await tick();
  assert.equal(c.run('driveActionJobs[0].done'), 1);
  c.settle('b', Object.assign(new Error('denied'), { status: 403 }));
  await job;
  assert.equal(c.run('driveActionJobs.length'), 0);
  assert.deepEqual(visibleIds(c), ['b', 'c'], 'only the confirmed file leaves the list; the failed one comes back');
  assert.equal(c.run('hasPendingDriveActions()'), false);
  assert.match(c.toasts.at(-1), /^1개 휴지통 이동, 1개 실패/);
});

test('a second action queues behind the first instead of being refused', async () => {
  const c = client();
  c.run(`state.pendingActionFiles=[state.files[0]]`);
  const first = c.run('performDeleteFile()');
  c.run(`state.pendingActionFiles=[state.files[2]];state.moveTargetFolderId='memories';
    state.moveSearch={filter:'추억',status:'done',rows:[{id:'memories',name:'추억',depth:0,capabilities:{canAddChildren:true}}]};`);
  c.dialog.open = true;
  const second = c.run('performMoveFile()');
  assert.equal(c.dialog.open, false);
  assert.deepEqual(visibleIds(c), ['b']);
  assert.equal(c.run('driveActionJobs.length'), 2);

  await tick();
  assert.deepEqual(c.calls, ['trash:a'], 'jobs run one after another');
  c.settle('a');
  await first;
  await tick();
  assert.deepEqual(c.calls, ['trash:a', 'move:memories:c']);
  assert.equal(c.run('driveActionJobs[0].action'), 'move');
  c.settle('c');
  await second;
  assert.equal(c.run('driveActionJobs.length'), 0);
  assert.deepEqual(visibleIds(c), ['b']);
  assert.equal(c.toasts.at(-1), '1개 파일을 이동했습니다.');
});

test('files already queued are not submitted twice', async () => {
  const c = client();
  c.run(`state.pendingActionFiles=[state.files[0]]`);
  const first = c.run('performDeleteFile()');
  c.run(`state.pendingActionFiles=[state.files[0]]`);
  c.dialog.open = true;
  c.run('performDeleteFile()');
  assert.equal(c.dialog.open, false);
  assert.equal(c.run('driveActionJobs.length'), 1);
  await tick();
  c.settle('a');
  await first;
  assert.deepEqual(c.calls, ['trash:a']);
});

// The server queue: a fake /api/drive-jobs that records what the page sends.
function serverClient() {
  const c = client({ local: false });
  c.crypto = { randomUUID: () => '11111111-1111-4111-8111-111111111111' };
  const stored = new Map();
  c.localStorage.getItem = (key) => stored.get(key) ?? null;
  c.localStorage.setItem = (key, value) => stored.set(key, String(value));
  c.localStorage.removeItem = (key) => stored.delete(key);
  c.run('el').playerSheet = { hidden: true };
  c.requests = [];
  c.statusReply = { jobs: [], results: [] };
  c.enqueueError = 0;
  c.fetch = async (url, options) => {
    const op = String(url).split('/').pop();
    const body = JSON.parse(options.body);
    c.requests.push({ op, body, headers: options.headers });
    if (op === 'enqueue' && c.enqueueError) return new Response('{}', { status: c.enqueueError });
    return Response.json(op === 'status' ? c.statusReply : { accepted: body.files?.length ?? 0, cancelled: 2 });
  };
  // Polling runs by hand here; a real timer would keep the test process alive.
  c.run('scheduleDriveJobPoll=()=>{}');
  c.showAfter = () => JSON.parse(c.run('JSON.stringify([...driveActionJobs].map(j=>j.id))'));
  return c;
}
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const summary = (extra = {}) => ({ id: JOB_ID, action: 'trash', total: 2, confirmed: 0, skipped: 0, failed: 0, pending: 2, updatedAt: 1, ...extra });
const trashTwo = async (c) => {
  c.run('state.pendingActionFiles=[state.files[0],state.files[1]]');
  await c.run('performDeleteFile()');
};

test('trash goes to the server queue and Drive is not called from the page', async () => {
  const c = serverClient();
  await trashTwo(c);
  const [request] = c.requests.filter((row) => row.op === 'enqueue');
  assert.equal(request.body.jobId, JOB_ID);
  assert.equal(request.body.action, 'trash');
  assert.equal(request.body.expectedAccount, 'server-A');
  assert.deepEqual(request.body.files.map((file) => file.id), ['a', 'b']);
  assert.deepEqual(request.body.files[0].parents, ['inbox']);
  assert.equal(request.headers['X-Drive-Original-CSRF'], '1');
  assert.deepEqual(c.calls, []);
  assert.deepEqual(visibleIds(c), ['c']);
  assert.equal(c.run('hasPendingDriveActions()'), false, 'closing the page no longer asks: the server has it');
});

test('a server job settles when its results arrive: confirmed files leave, failed ones come back', async () => {
  const c = serverClient();
  await trashTwo(c);
  c.statusReply = { jobs: [summary({ confirmed: 1, failed: 1, pending: 0 })], results: [
    { seq: 7, jobId: JOB_ID, fileId: 'a', state: 'confirmed', status: 0, parents: null },
    { seq: 8, jobId: JOB_ID, fileId: 'b', state: 'conflict', status: 0, parents: null }] };
  await c.run('pollDriveJobs()');
  assert.deepEqual(visibleIds(c), ['b', 'c']);
  assert.deepEqual(c.showAfter(), []);
  assert.match(c.toasts.at(-1), /^1개 휴지통 이동, 1개 다시 확인/);
});

test('a job started before a reload is adopted: its files stay hidden until it ends, and success stays quiet', async () => {
  const c = serverClient();
  c.statusReply = { jobs: [summary()], results: [], pendingFiles: [{ jobId: JOB_ID, fileId: 'a' }, { jobId: JOB_ID, fileId: 'b' }] };
  await c.run('pollDriveJobs({includePending:true})');
  assert.deepEqual(visibleIds(c), ['c']);
  assert.equal(c.run('hasPendingDriveActions()'), false);
  c.statusReply = { jobs: [summary({ confirmed: 2, pending: 0 })], results: [
    { seq: 9, jobId: JOB_ID, fileId: 'a', state: 'confirmed', status: 0, parents: null },
    { seq: 10, jobId: JOB_ID, fileId: 'b', state: 'confirmed', status: 0, parents: null }] };
  await c.run('pollDriveJobs()');
  assert.deepEqual(visibleIds(c), ['c']);
  assert.equal(c.toasts.length, 0);
});

test('the next poll asks only for results it has not seen', async () => {
  const c = serverClient();
  await trashTwo(c);
  c.statusReply = { jobs: [summary({ confirmed: 1, pending: 1 })], results: [{ seq: 4, jobId: JOB_ID, fileId: 'a', state: 'confirmed', status: 0, parents: null }] };
  await c.run('pollDriveJobs()');
  c.statusReply = { jobs: [summary({ confirmed: 1, pending: 1 })], results: [] };
  await c.run('pollDriveJobs()');
  const statuses = c.requests.filter((row) => row.op === 'status');
  assert.equal(statuses.at(-1).body.after, 4);
});

test('a refused job puts the files back and says so', async () => {
  const c = serverClient();
  c.enqueueError = 403;
  await trashTwo(c);
  assert.deepEqual(visibleIds(c), ['a', 'b', 'c']);
  assert.deepEqual(c.showAfter(), []);
  assert.match(c.toasts.at(-1), /2개 실패/);
});

test('large selections go in ordered chunks under one job', async () => {
  const c = serverClient();
  c.run(`state.files=Array.from({length:901},(_,i)=>({id:'file-'+i,name:i+'.mp4',mimeType:'video/mp4',parents:['inbox']}));
    state.pendingActionFiles=[...state.files]`);
  await c.run('performDeleteFile()');
  const chunks = c.requests.filter((row) => row.op === 'enqueue').map((row) => [row.body.chunk, row.body.files.length]);
  assert.deepEqual(chunks, [[0, 400], [1, 400], [2, 101]]);
});

test('quick move sends the file to the default folder without opening the picker', async () => {
  const c = serverClient();
  c.run(`el.moveDialog={open:false,showModal(){throw new Error('picker opened')},close(){}};
    state.selected=state.files[0];saveQuickMoveTarget({id:'memories',name:'추억'});`);
  await c.run('performQuickMove()');
  const request = c.requests.find((row) => row.op === 'enqueue');
  assert.equal(request.body.action, 'move');
  assert.deepEqual(request.body.target, { id: 'memories', name: '추억', resourceKey: null });
  assert.deepEqual(request.body.files.map((file) => file.id), ['a']);
  assert.deepEqual(visibleIds(c), ['b', 'c']);
});

test('quick move finds the folder named 추억 once and remembers it', async () => {
  const c = serverClient();
  let lookups = 0;
  c.run(`state.selected=state.files[0];driveFetch=()=>globalThis.folderLookup();`);
  c.folderLookup = async () => { lookups += 1; return Response.json({ files: [{ id: 'memories', name: '추억', parents: ['root-id'] }] }); };
  await c.run('performQuickMove()');
  c.run('state.selected=state.files[1]');
  await c.run('performQuickMove()');
  assert.equal(lookups, 1);
});

test('several folders named 추억 are not guessed unless exactly one is at the top level', async () => {
  const c = serverClient();
  c.run(`state.rootFolderId='root-id';state.selected=state.files[0];driveFetch=()=>globalThis.folderLookup();`);
  c.folderLookup = async () => Response.json({ files: [{ id: 'x', name: '추억', parents: ['deep'] }, { id: 'y', name: '추억', parents: ['deeper'] }] });
  await c.run('performQuickMove()');
  assert.equal(c.requests.some((row) => row.op === 'enqueue'), false);
  assert.match(c.toasts.at(-1), /설정의 빠른 이동/);
  c.folderLookup = async () => Response.json({ files: [{ id: 'x', name: '추억', parents: ['deep'] }, { id: 'y', name: '추억', parents: ['root-id'] }] });
  await c.run('performQuickMove()');
  assert.equal(c.requests.find((row) => row.op === 'enqueue').body.target.id, 'y');
});

test('quick move off opens the folder picker instead', async () => {
  const c = serverClient();
  let opened = 0;
  c.run(`state.selected=state.files[0];requestMoveFile=()=>globalThis.pickerOpened();setQuickMoveEnabled(false);`);
  c.pickerOpened = () => { opened += 1; };
  await c.run('performQuickMove()');
  assert.equal(opened, 1);
  assert.equal(c.requests.length, 0);
});

test('quick move does nothing for a file already in the folder', async () => {
  const c = serverClient();
  c.run(`state.selected=state.files[0];state.selected.parents=['memories'];saveQuickMoveTarget({id:'memories',name:'추억'});`);
  await c.run('performQuickMove()');
  assert.equal(c.requests.length, 0);
  assert.match(c.toasts.at(-1), /이미 '추억' 폴더/);
});

test('shuffling is uniform over positions with the browser CSPRNG', () => {
  const c = client();
  c.crypto = globalThis.crypto;
  const counts = Array.from({ length: 6 }, () => Array(6).fill(0));
  const rounds = 60_000;
  for (let i = 0; i < rounds; i += 1) {
    c.run('shuffleInPlace([0,1,2,3,4,5])').forEach((value, position) => { counts[value][position] += 1; });
  }
  const expected = rounds / 6;
  for (const row of counts) for (const count of row) assert.ok(Math.abs(count - expected) < expected * 0.05, `${count} vs ${expected}`);
});

test('the shorts deck keeps unseen files ahead, and treats files shown this session as seen', () => {
  const c = client();
  const deck = (viewed, shown) => JSON.parse(c.run(`JSON.stringify(buildVerticalPlaybackDeck(
    ['a','b','c','d','e','f'].map(id=>({id})),'a',undefined,2,${JSON.stringify(viewed)},${JSON.stringify(shown)}))`));
  for (let i = 0; i < 200; i += 1) {
    const { above, below } = deck(['b', 'c'], ['d']);
    assert.deepEqual([below[0], above[0]].sort(), ['e', 'f'], 'the two nearest slots are the two unseen files');
    assert.ok(![above[1], below[1]].includes('d') , 'a file shown this session comes after the watched ones');
  }
});

test('swiping forward through a deck never repeats a shown file while unseen ones remain', () => {
  const c = client();
  c.run(`state.playbackShownIds=new Set(['a']);globalThis.population=Array.from({length:30},(_,i)=>({id:i?'f'+i:'a'}));
    globalThis.deck=buildAccountPlaybackDeck(population,'a');`);
  const seen = new Set(['a']);
  for (let i = 0; i < 29; i += 1) {
    const next = c.run('deck.below[0]');
    assert.equal(seen.has(next), false, `repeat at step ${i}`);
    seen.add(next);
    c.run(`state.playbackShownIds.add(${JSON.stringify(next)});deck=advanceAccountPlaybackDeck(deck,'up',${JSON.stringify(next)},population)`);
  }
});
