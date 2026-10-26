'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadApp } = require('./app-loader.cjs');

function client() {
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
  c.statusNode = { hidden: true, textContent: '' };
  c.statusText = { textContent: '' };
  c.dialog = { open: true, close() { this.open = false; } };
  Object.assign(c.run('el'), { deleteDialog: c.dialog, moveDialog: c.dialog, driveActionStatus: c.statusNode, driveActionStatusText: c.statusText });
  // Each Drive call stays open until the test settles it by file id.
  c.settle = (id, error) => { const entry = c.pending.get(id); c.pending.delete(id); if (error) entry.reject(error); else entry.resolve(); };
  c.driveHook = (kind, file) => new Promise((resolve, reject) => { c.calls.push(`${kind}:${file.id}`); c.pending.set(file.id, { resolve, reject }); });
  c.run(`state.accountId='drive-account-A';state.authAccountKey='server-A';state.accountIdentityPending=false;
    state.files=[{id:'a',name:'a.mp4',mimeType:'video/mp4',parents:['inbox']},{id:'b',name:'b.mp4',mimeType:'video/mp4',parents:['inbox']},
      {id:'c',name:'c.mp4',mimeType:'video/mp4',parents:['inbox']}];
    state.populationComplete=true;
    renderFiles=()=>{};collapseShortsExpand=()=>{};reportAppFailure=()=>{};`);
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
  assert.equal(c.statusNode.hidden, false);
  assert.equal(c.statusText.textContent, '휴지통으로 이동 중 0/2');
  assert.equal(c.run('state.pendingActionFiles.length'), 0, 'the next action starts from a clean selection');

  await tick();
  c.settle('a');
  await tick();
  assert.equal(c.statusText.textContent, '휴지통으로 이동 중 1/2');
  c.settle('b', Object.assign(new Error('denied'), { status: 403 }));
  await job;
  assert.equal(c.statusNode.hidden, true);
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
  assert.equal(c.statusText.textContent, '휴지통으로 이동 중 0/1 · 대기 1건');

  await tick();
  assert.deepEqual(c.calls, ['trash:a'], 'jobs run one after another');
  c.settle('a');
  await first;
  await tick();
  assert.deepEqual(c.calls, ['trash:a', 'move:memories:c']);
  assert.equal(c.statusText.textContent, "'추억'(으)로 이동 중 0/1");
  c.settle('c');
  await second;
  assert.equal(c.statusNode.hidden, true);
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
