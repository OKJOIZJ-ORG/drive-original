'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadApp } = require('./app-loader.cjs');

function client(storage = new Map(), runtime = { driveMutationsEnabled: true }) {
  const locks = new Map();
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    TextEncoder, crypto: globalThis.crypto,
    console, performance, fetch, setTimeout, clearTimeout, setInterval, clearInterval,
    __DRIVE_ORIGINAL_RUNTIME__: runtime,
    location: { href: 'https://fixture.test/', origin: 'https://fixture.test', pathname: '/', search: '' },
    navigator: { onLine: true, locks: { async request(key, fn) {
      const prior = locks.get(key) || Promise.resolve();
      const next = prior.catch(() => {}).then(() => fn({ name: key }));
      locks.set(key, next); return next;
    } } },
    localStorage: { get length() { return storage.size; }, key(i) { return [...storage.keys()][i] ?? null; },
      getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); }, removeItem(key) { storage.delete(key); } },
    document: { addEventListener() {}, querySelectorAll() { return []; }, visibilityState: 'visible' },
    requestAnimationFrame() {} };
  c.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 390, matchMedia: () => ({ matches: false }), location: c.location };
  c.matchMedia = c.window.matchMedia;
  vm.createContext(c);
  loadApp(c);
  c.run = code => vm.runInContext(code, c);
  c.toasts = [];
  c.captureToast = message => c.toasts.push(message);
  c.run(`state.accountId='drive-account-A';state.authAccountKey='server-account-A';state.accountIdentityPending=false;
    state.token='synthetic-token';state.expiresAt=Date.now()+3600000;
    state.authCapabilities={version:1,driveRead:true,driveWrite:true,appData:true};
    state.moveFolderRows=[];state.rootFolderId='root';
    showToast=(m)=>globalThis.captureToast(m);renderFiles=()=>{};collapseShortsExpand=()=>{};reportAppFailure=()=>{};
    const item={id:'synthetic-file',name:'holiday.mp4',parents:['old'],version:'1',mimeType:'video/mp4'};
    state.files=[item];state.populationComplete=true;`);
  c.entries = () => [...storage.entries()].filter(([key]) => key.startsWith('drive-original.mutation.')).map(([, value]) => JSON.parse(value));
  c.ledgerText = () => [...storage.entries()].filter(([key]) => key.startsWith('drive-original.mutation.')).map(([, value]) => value).join('\n');
  return c;
}

function remote(c, { patch = 'apply', canRename = true } = {}) {
  const item = { id: 'synthetic-file', name: 'holiday.mp4', parents: ['old'], version: '1', mimeType: 'video/mp4', trashed: false,
    capabilities: { canTrash: true, canRename, canMoveItemWithinDrive: true, canMoveItemOutOfDrive: true } };
  const calls = [];
  c.fetch = async (url, options = {}) => {
    const u = new URL(url); const method = options.method || 'GET';
    calls.push({ method, params: u.searchParams, body: options.body });
    if (method === 'PATCH') {
      if (patch === 'deny') return new Response('{"error":{"message":"Forbidden"}}', { status: 403 });
      if (patch === 'lost-before') throw new TypeError('synthetic response lost');
      item.name = JSON.parse(options.body).name;
      item.version = '2';
      if (patch === 'lost') throw new TypeError('synthetic response lost');
      return new Response('{}', { status: 200 });
    }
    return Response.json(item);
  };
  return { item, calls, patches: () => calls.filter(call => call.method === 'PATCH') };
}

test('rename sends one PATCH with only the name and confirms it by an independent GET', async () => {
  const c = client(); const r = remote(c);
  const result = await c.run("renameDriveFile(item,'여름 휴가.mp4')");
  assert.equal(r.patches().length, 1);
  assert.deepEqual(JSON.parse(r.patches()[0].body), { name: '여름 휴가.mp4' });
  assert.equal(r.patches()[0].params.has('addParents'), false);
  assert.match(r.calls[0].params.get('fields'), /\bname\b.*canRename/);
  assert.equal(r.calls.at(-1).method, 'GET');
  assert.equal(c.entries()[0].action, 'rename');
  assert.equal(c.entries()[0].state, 'confirmed');
  assert.equal(result.metadata.version, '2');
  assert.equal(c.run('item.version'), '2');
});

test('the persisted ledger never holds the old or new file name, only its hash', async () => {
  const c = client(); remote(c);
  await c.run("renameDriveFile(item,'여름 휴가.mp4')");
  const text = c.ledgerText();
  assert.doesNotMatch(text, /holiday|여름|휴가/);
  assert.match(c.entries()[0].nameHash, /^[0-9a-f]{64}$/);
  assert.match(c.entries()[0].confirmedAfter.nameHash, /^[0-9a-f]{64}$/);
});

test('a lost PATCH response is confirmed by GET without replaying the PATCH', async () => {
  const c = client(); const r = remote(c, { patch: 'lost' });
  await c.run("renameDriveFile(item,'renamed.mp4')");
  assert.equal(r.patches().length, 1);
  assert.equal(c.entries()[0].state, 'confirmed');
});

test('a rename that never landed stays uncertain, and reload recovery only reads', async () => {
  const storage = new Map(); const c = client(storage); const r = remote(c, { patch: 'lost-before' });
  await assert.rejects(c.run("renameDriveFile(item,'renamed.mp4')"), error => error.mutationState === 'uncertain');
  assert.equal(r.patches().length, 1);
  const next = client(storage); const reads = remote(next);
  await next.run('recoverDriveMutations()');
  assert.equal(next.entries()[0].state, 'uncertain');
  reads.item.name = 'renamed.mp4'; reads.item.version = '2';
  await next.run('recoverDriveMutations()');
  assert.equal(next.entries()[0].state, 'confirmed');
  assert.equal(reads.patches().length, 0);
});

test('no rename permission or a candidate build sends no PATCH', async () => {
  const c = client(); const r = remote(c, { canRename: false });
  await assert.rejects(c.run("renameDriveFile(item,'renamed.mp4')"), error => error.status === 403);
  assert.equal(r.patches().length, 0);
  const candidate = client(new Map(), { candidate: true, driveMutationsEnabled: false, accountStateWritesEnabled: true });
  const locked = remote(candidate);
  await assert.rejects(candidate.run("renameDriveFile(item,'renamed.mp4')"));
  assert.equal(locked.patches().length, 0);
});

test('a file that already has the name is confirmed without a PATCH', async () => {
  const c = client(); const r = remote(c);
  const result = await c.run("renameDriveFile(item,'holiday.mp4')");
  assert.equal(result.skipped, true);
  assert.equal(r.patches().length, 0);
});

test('the background job renames the listed file only after Drive confirms it', async () => {
  const c = client(); const r = remote(c);
  c.run(`el.driveActionStatus={hidden:true};el.driveActionStatusText={textContent:''};
    state.selected=item;el.playerTitle={textContent:'holiday.mp4'};`);
  const job = c.run("performRenameFile(item,'  새 이름.mp4\\n')");
  assert.equal(c.run('el.driveActionStatus.hidden'), false);
  assert.equal(c.run('el.driveActionStatusText.textContent'), '이름 바꾸는 중 0/1');
  assert.equal(c.run('state.files[0].name'), 'holiday.mp4', 'the list keeps the old name until confirmation');
  assert.equal(c.run('filteredAndSortedFiles().length'), 1, 'a rename never hides the file');
  await job;
  assert.deepEqual(JSON.parse(r.patches()[0].body), { name: '새 이름.mp4' });
  assert.equal(c.run('state.files[0].name'), '새 이름.mp4');
  assert.equal(c.run('el.playerTitle.textContent'), '새 이름.mp4');
  assert.equal(c.run('el.driveActionStatus.hidden'), true);
  assert.match(c.toasts.at(-1), /^이름을 '새 이름\.mp4'\(으\)로 바꿨습니다\./);
});

test('a refused rename keeps the old name and says why', async () => {
  const c = client(); remote(c, { patch: 'deny' });
  c.run(`el.driveActionStatus={hidden:true};el.driveActionStatusText={textContent:''};`);
  await c.run("performRenameFile(item,'renamed.mp4')");
  assert.equal(c.run('state.files[0].name'), 'holiday.mp4');
  assert.match(c.toasts.at(-1), /^이름을 바꾸지 못했습니다/);
});

test('blank or unchanged names do not queue a Drive job', () => {
  const c = client(); const r = remote(c);
  assert.equal(c.run("performRenameFile(item,'   ')"), null);
  assert.equal(c.run("performRenameFile(item,'holiday.mp4')"), null);
  assert.equal(c.run('hasPendingDriveActions()'), false);
  assert.equal(r.calls.length, 0);
});

test('confirmed rename publishes fresh source metadata to every listed copy and restarts only its original media session', async () => {
  const c = client(); const r = remote(c);
  Object.assign(r.item, {size:'9000', modifiedTime:'2026-10-30T00:00:00Z', headRevisionId:'revision-1', sha256Checksum:'a'.repeat(64)});
  r.item.capabilities.canDownload = true;
  c.run(`el.driveActionStatus={hidden:true};el.driveActionStatusText={textContent:''};
    state.selected={...item};state.treeCache={items:[{...item}]};state.mediaSession=7;
    globalThis.preparedController=new AbortController();q0Prewarm={fileId:item.id,controller:preparedController};
    globalThis.restarts=[];restartPlaybackAfterConfirmedRename=(file,owner)=>restarts.push({file:{...file},owner});`);
  await c.run("performRenameFile(item,'renamed.mp4')");
  for (const path of ['state.files[0]', 'state.treeCache.items[0]', 'state.selected']) {
    assert.equal(c.run(`${path}.modifiedTime`),r.item.modifiedTime);
    assert.equal(c.run(`${path}.headRevisionId`),'revision-1');
    assert.equal(c.run(`${path}.size`),'9000');
    assert.equal(c.run(`${path}.sha256Checksum`),'a'.repeat(64));
    assert.equal(c.run(`${path}.capabilities.canDownload`),true);
  }
  assert.equal(c.run('restarts.length'),1);
  assert.equal(c.run('restarts[0].owner.session'),7);
  assert.equal(c.run('restarts[0].file.name'),'renamed.mp4');
  assert.equal(c.run('restarts[0].file.modifiedTime'),r.item.modifiedTime);
  assert.equal(c.run('preparedController.signal.aborted'),true);
  assert.equal(c.run('q0Prewarm'),null);
});

test('rename source restart retains playback state without reopening the library or reusing its old pin', async () => {
  const c=client();
  c.run(`state.selected=item;state.mediaSession=7;state.driveSessionGeneration=3;
    el.playerSheet={hidden:false};el.videoPlayer={hidden:false};
    state.playbackOrderIds=['before',item.id,'after'];state.playbackDeck={anchorId:item.id,above:['a'],below:['b']};
    globalThis.steps=[];globalThis.snap={time:19.5,paused:true,volume:.4,muted:true,playbackRate:1.5,decoded:true,selectedAudioTrackId:2,audioIdentity:{modifiedTime:'old'}};
    capturePlaybackSnapshot=()=>snap;retirePlayerTracks=()=>steps.push('tracks');
    clearDirectMediaSources=()=>steps.push('clear');beginMediaViewObservation=()=>{};
    updateMediaDiagnosticSession=()=>{};clearMediaFrameWatchdog=()=>{};clearMediaSeekWatchdog=()=>{};
    cancelVideoFrameSampling=()=>{};showMediaLoading=()=>{};
    q0PinnedSource={old:true};verifiedOriginalImage=null;
    startInitialOriginalPlayback=(file,kind,session)=>steps.push({file:file.id,kind,session,snapshot:state.resumePosition.snapshot,pendingPlay:state.pendingPlay});
    globalThis.owner={fileId:item.id,session:7,accountGeneration:3};`);
  assert.equal(await c.run('restartPlaybackAfterConfirmedRename(item,owner)'),true);
  assert.equal(c.run('state.mediaSession'),8);
  assert.equal(c.run('q0PinnedSource'),null);
  assert.equal(c.run('state.resumePosition.snapshot.time'),19.5);
  assert.equal(c.run('state.resumePosition.snapshot.paused'),true);
  assert.equal(c.run('state.resumePosition.snapshot.audioIdentity'),null);
  assert.deepEqual(JSON.parse(c.run('JSON.stringify(steps)')).slice(0,2),['tracks','clear']);
  assert.equal(c.run('steps[2].kind'),'video');
  assert.equal(c.run('steps[2].pendingPlay'),false);
  assert.equal(c.run('state.playbackOrderIds.join()'),'before,synthetic-file,after');
  assert.equal(c.run('state.playbackDeck.above.join()'),'a');
  assert.equal(await c.run('restartPlaybackAfterConfirmedRename(item,owner)'),false,'old session cannot publish again');
});

test('confirmed rename never reloads an image, hidden viewer or a newer account/session', () => {
  for(const change of ["item.mimeType='image/png'",'el.playerSheet.hidden=true','state.mediaSession++','state.driveSessionGeneration++']){
    const c=client();c.run(`state.selected=item;state.mediaSession=7;state.driveSessionGeneration=3;el.playerSheet={hidden:false};
      el.videoPlayer={hidden:false};globalThis.owner={fileId:item.id,session:7,accountGeneration:3};
      clearDirectMediaSources=()=>{throw Error('must not reopen')};${change};`);
    assert.equal(c.run('restartPlaybackAfterConfirmedRename(item,owner)'),false);
  }
});

test('rename restart uses the pre-PATCH intent if the timestamp change already retired the old decoder', () => {
  const c=client();c.run(`state.selected=item;state.mediaSession=7;state.driveSessionGeneration=3;
    el.playerSheet={hidden:false};el.videoPlayer={hidden:false,readyState:0};state.mediaAttempt='failed';
    globalThis.owner={fileId:item.id,session:7,accountGeneration:3,snapshot:{time:19.5,paused:false,playbackRate:1.5}};
    capturePlaybackSnapshot=()=>({time:0,paused:true});retirePlayerTracks=()=>{};clearDirectMediaSources=()=>{};
    beginMediaViewObservation=()=>{};updateMediaDiagnosticSession=()=>{};startInitialOriginalPlayback=()=>{};`);
  assert.equal(c.run('restartPlaybackAfterConfirmedRename(item,owner)'),true);
  assert.equal(c.run('state.resumePosition.time'),19.5);
  assert.equal(c.run('state.pendingPlay'),true);
});

test('rename restart waits for old transport retirement and cannot assign a source after navigation', async () => {
  for(const navigate of [false,true]){
    const c=client();let release;
    c.retirement=new Promise(r=>release=r);
    c.run(`state.selected=item;state.mediaSession=7;state.driveSessionGeneration=3;
      el.playerSheet={hidden:false};el.videoPlayer={hidden:false};
      globalThis.owner={fileId:item.id,session:7,accountGeneration:3};globalThis.assignments=[];
      capturePlaybackSnapshot=()=>({time:19.5,paused:true});retirePlayerTracks=()=>{};
      clearDirectMediaSources=()=>{q1Retirement=globalThis.retirement;q1RetirementResult=null;};
      beginMediaViewObservation=()=>{};updateMediaDiagnosticSession=()=>{};
      emitMediaDiagnosticStage=()=>{};startOriginalRangePlayback=(file,kind,session)=>assignments.push(session);
      playerTracksRetirementResult={settled:true};
      restartPlaybackAfterConfirmedRename(item,owner);`);
    assert.equal(c.run('assignments.length'),0);
    if(navigate)c.run('state.mediaSession++;state.selected={id:"other"};');
    release({settled:true});await new Promise(r=>setImmediate(r));
    assert.equal(c.run('assignments.length'),navigate?0:1);
    if(!navigate)assert.equal(c.run('assignments[0]'),8);
  }
});

test('rename snapshot retains an active general compatibility route even without an explicit audio selection', async () => {
  const c=client();
  c.run(`state.selected=item;el.videoPlayer={hidden:false,currentTime:19.5,paused:true,volume:.4,muted:true,playbackRate:1.5};
    playerTimeline=()=>({currentTime:19.5});q1Playback={kind:'general',audioCompatibility:true};
    state.mediaPlaybackMode=PLAYBACK_MODE.VIDEO_COMPATIBILITY;
    globalThis.snapshot=capturePlaybackSnapshot();state.resumePosition={fileId:item.id,snapshot};q1Playback=null;
    globalThis.chosen=null;tryOriginalTsPlayback=(file,session,options)=>{chosen=options;return true;};
    retireQ0Playback=()=>{};q1RetirementResult={settled:true};playerTracksRetirementResult={settled:true};`);
  await c.run('startInitialOriginalPlayback(item,"video",state.mediaSession)');
  assert.equal(c.run('chosen.videoCompatibility'),true);
  assert.equal(c.run('chosen.audioCompatibility'),true);
  assert.equal(c.run('chosen.snapshotOverride.time'),19.5);
});
