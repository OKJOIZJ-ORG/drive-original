'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function app() {
  const storage = new Map();
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    clearTimeout, setTimeout, clearInterval, setInterval, console, fetch, performance,
    location: { href: 'https://app.test/drive-original/', origin: 'https://app.test', pathname: '/drive-original/', search: '', protocol: 'https:' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    navigator: { onLine: true }, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } },
    requestAnimationFrame: callback => setTimeout(callback, 0) };
  c.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), location: c.location, isSecureContext: true };
  c.matchMedia = c.window.matchMedia;
  vm.createContext(c); vm.runInContext(appSource, c);
  c.run = s => vm.runInContext(s, c);
  return c;
}

test('favorites bulk actions resolve the favorites population, never the underlying folder', () => {
  const c = app();
  const ids = c.run(`state.filter = 'favorites'; state.selectionMode = true;
    state.files = [{id:'folder-video'}]; state.favoriteFiles = [{id:'favorite-elsewhere'}];
    state.selectedFileIds.add('favorite-elsewhere'); JSON.stringify(getActionFiles().map(f => f.id));`);
  assert.deepEqual(JSON.parse(ids), ['favorite-elsewhere']);
});

test('empty selection cannot fall through to a previously opened player file', () => {
  const c = app();
  assert.equal(c.run(`state.selectionMode = true; state.selected = {id:'must-not-trash'}; getActionFiles().length;`), 0);
});

test('completed favorites do not require unrelated folder pagination', () => {
  const c = app();
  assert.equal(c.run(`state.filter = 'favorites'; state.loadingFavorites = false;
    state.populationComplete = false; state.nextPageToken = 'unrelated'; hasCompletePlaybackPopulation();`), true);
});

test('equal-time favorite merges are commutative and cancellation wins a concurrent tie', () => {
  const c = app();
  const result = JSON.parse(c.run(`const a = {favorites:{x:{liked:true,updatedAt:10}}};
    const b = {favorites:{x:{liked:false,updatedAt:10}}};
    JSON.stringify([mergeAccountMediaStates(a,b), mergeAccountMediaStates(b,a)]);`));
  assert.deepEqual(result[0], result[1]);
  assert.equal(result[0].favorites.x.liked, false);
});

test('account state rejects non-finite timestamps and preserves prototype-like IDs as data', () => {
  const c = app();
  const r = JSON.parse(c.run(`JSON.stringify(normalizeAccountMediaState({
    updatedAt: Infinity, viewed: {bad: Infinity, good: 12},
    favorites: JSON.parse('{"__proto__":{"liked":true,"updatedAt":10},"bad":{"liked":true,"updatedAt":-5}}')
  }));`));
  assert.equal(r.updatedAt, 0);
  assert.equal(r.viewed.bad, undefined);
  assert.equal(Object.hasOwn(r.favorites, '__proto__'), true);
});

test('forward shorts neighbor receives the last unseen item before watched media', () => {
  const c = app();
  assert.equal(c.run(`buildVerticalPlaybackDeck(['a','b','c','d','e'].map(id => ({id})),
    'a', () => .999, 2, new Set(['b','c','d'])).below[0];`), 'e');
});

test('Retry-After preserves server cooldown instead of retrying early', () => {
  const c = app();
  assert.equal(c.run(`parseRetryAfterMs('120')`), 120000);
  assert.equal(c.run(`parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('Wed, 21 Oct 2015 07:27:00 GMT'))`), 60000);
});

test('retry waits remove their abort listener after normal completion', async () => {
  const c = app(); let listeners = 0;
  c.signal = { aborted: false, addEventListener() { listeners++; }, removeEventListener() { listeners--; } };
  await c.run('waitForRetry(0, signal)');
  assert.equal(listeners, 0);
});

test('late Drive HTTP responses are rejected after the account generation changes', async () => {
  const c = app(); let resolve;
  c.fetch = () => new Promise(r => { resolve = r; });
  c.run(`state.token = 'fake'; state.expiresAt = Date.now() + 60000;`);
  const response = c.run(`driveFetch('https://www.googleapis.com/drive/v3/files')`);
  c.run('state.authGeneration++;');
  resolve(new Response('{}'));
  await assert.rejects(response, { name: 'AbortError' });
});

test('late Drive JSON bodies cannot commit into a new account generation', async () => {
  const c = app(); let resolve;
  c.fetch = async () => ({ ok: true, json: () => new Promise(r => { resolve = r; }), body: { cancel: async () => {} } });
  c.run(`state.token = 'fake'; state.expiresAt = Date.now() + 60000;`);
  const response = await c.run(`driveFetch('https://www.googleapis.com/drive/v3/files')`);
  const body = response.json();
  c.run('state.authGeneration++;'); resolve({ files: [] });
  await assert.rejects(body, { name: 'AbortError' });
});

test('seekbar keyboard handling is consumed before global shortcuts', () => {
  const c = app();
  const result = JSON.parse(c.run(`el.playerSheet = {hidden:false};
    el.videoPlayer = {hidden:false,duration:100,currentTime:20}; updateVideoProgress = () => {};
    seekRelative = d => {el.videoPlayer.currentTime += d};
    const e = {key:'ArrowRight',target:{tagName:'DIV'},preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}};
    onSeekKeyDown(e); handlePlayerKeyboard(e); JSON.stringify({time:el.videoPlayer.currentTime,stopped:e.stopped});`));
  assert.deepEqual(result, { time: 25, stopped: true });
});

test('browser modifier shortcuts and native button activation are not hijacked by the player', () => {
  const c = app();
  const result = c.run(`el.playerSheet = {hidden:false}; el.videoPlayer = {hidden:false};
    let invoked = 0; toggleFullscreen = () => invoked++; togglePlayPause = () => invoked++;
    handlePlayerKeyboard({key:'f',ctrlKey:true,target:{tagName:'DIV'},preventDefault(){}});
    handlePlayerKeyboard({key:' ',target:{tagName:'BUTTON'},preventDefault(){}}); invoked;`);
  assert.equal(result, 0);
});

test('paginated collectors discard a final page completed after cancellation', async () => {
  const c = app(); c.controller = new AbortController();
  await assert.rejects(c.run(`collectAllPages(async () => { controller.abort(); return {files:[{id:'stale'}]}; }, {signal:controller.signal})`), { name: 'AbortError' });
});

test('old-session temporary file cleanup cannot delete the next session storage', () => {
  const c = app();
  const result = c.run(`let removed = 0; state.mediaTempStorage = {session:12, name:'new',directory:{removeEntry(){removed++;return Promise.resolve()}}};
    cleanupOriginalTempStorage(11); Boolean(state.mediaTempStorage) && removed === 0;`);
  assert.equal(result, true);
});

test('cache reset leaves sibling application caches and workers intact', async () => {
  const c = app(); const deleted = []; const removed = [];
  c.caches = { keys: async () => ['drive-original-shell-old', 'other-app-cache'], delete: async k => deleted.push(k) };
  c.window.caches = c.caches;
  c.navigator.serviceWorker = { getRegistrations: async () => [
    { scope: 'https://app.test/drive-original/', unregister: async () => removed.push('ours') },
    { scope: 'https://app.test/other/', unregister: async () => removed.push('other') }
  ] };
  c.run('showToast = () => {};'); c.window.location.reload = () => {};
  await c.run('forceReloadApp()');
  assert.deepEqual(deleted, ['drive-original-shell-old']);
  assert.deepEqual(removed, ['ours']);
});

test('simultaneous device writes preserve both edits without overwriting the legacy file', async () => {
  const devices = [app(), app()];
  const seed = { schemaVersion: 1, updatedAt: 1, viewed: {}, favorites: { original: { liked: true, updatedAt: 1 } } };
  const files = new Map([['legacy', { id: 'legacy', name: 'drive-original-account-state.json', modifiedTime: '2026-01-01', data: seed }]]);
  let readers = 0; let unblock;
  const barrier = new Promise(resolve => { unblock = resolve; });
  const request = async (address, options = {}) => {
    const url = new URL(address); const id = url.pathname.split('/').pop();
    if (options.method === 'POST') {
      const sections = options.body.split('\r\n\r\n').slice(1).map(part => part.split('\r\n--')[0]);
      const metadata = JSON.parse(sections[0]); const data = JSON.parse(sections[1]);
      const id = 'created-' + files.size;
      files.set(id, { id, name: metadata.name, data, modifiedTime: String(Date.now()) });
      return new Response(JSON.stringify({ id }));
    }
    if (options.method === 'PATCH') {
      files.get(id).data = JSON.parse(options.body);
      return new Response(JSON.stringify({ id }));
    }
    if (url.searchParams.get('alt') === 'media') {
      const snapshot = JSON.stringify(files.get(id).data);
      if (id === 'legacy') { if (++readers === 2) unblock(); await barrier; }
      return new Response(snapshot);
    }
    return new Response(JSON.stringify({ files: [...files.values()].map(({data, ...metadata}) => metadata) }));
  };
  devices.forEach((c, index) => {
    c.mockDrive = request;
    c.run(`driveFetch = mockDrive; state.accountId = 'shared-account'; state.accountStateWriterId = 'device-${index}';
      state.token = 'fixture-token'; state.expiresAt = Date.now() + 60000;
      state.accountMediaState = normalizeAccountMediaState({updatedAt:10, favorites:{'device-edit-${index}':{liked:true,updatedAt:10}}});`);
  });
  await Promise.all(devices.map(c => c.run('flushAccountMediaState()')));
  const merged = [...files.values()].reduce((result, file) => ({ ...result, ...file.data.favorites }), {});
  assert.equal(merged['device-edit-0']?.liked, true);
  assert.equal(merged['device-edit-1']?.liked, true);
  assert.deepEqual(files.get('legacy').data, seed, 'migrate by reading; never overwrite the legacy shared document');
});

test('stale account initialization cannot repopulate an invalidated Drive session', async () => {
  const c = app(); let complete;
  c.lookup = () => new Promise(resolve => { complete = resolve; });
  c.run(`state.token='fixture';state.expiresAt=Date.now()+60000;
    resolveDriveAccountId = lookup;`);
  const loading = c.run('initializeAccountMediaState()');
  c.run('state.driveSessionGeneration++;state.accountId="new-account";');
  complete('old-account');
  await assert.rejects(loading, { name:'AbortError' });
  assert.equal(c.run('state.accountId'), 'new-account');
  assert.equal(c.run('state.accountStateLoaded'), false);
});

test('deleted writer file is recreated without patching another device file', async () => {
  const c = app(); const patched=[];let created=0;
  c.patch = async id=>{patched.push(id);throw Object.assign(new Error('gone'),{status:404});};
  c.create = async()=>{created++;return {id:'replacement'};};
  c.run(`state.token='fixture';state.expiresAt=Date.now()+60000;state.accountId='account';
    findAccountStateFile=async()=>({id:'own-file',files:[]});
    updateAccountStateFile=patch;createAccountStateFile=create;`);
  await c.run('flushAccountMediaState()');
  assert.deepEqual(patched,['own-file']);assert.equal(created,1);
  assert.equal(c.run('state.accountStateFileId'),'replacement');
});

test('sort and filter caches reuse stable populations and invalidate replacement and growth', () => {
  const c=app();
  assert.equal(c.run(`state.sort='name';state.files=[{id:'b',name:'B'},{id:'a',name:'A'}];
    const first=filteredAndSortedFiles();first===filteredAndSortedFiles();`),true);
  assert.equal(c.run(`state.files=[{id:'c',name:'C'},{id:'d',name:'D'}];filteredAndSortedFiles()[0].id;`),'c');
  assert.equal(c.run(`state.files.push({id:'a',name:'A'});filteredAndSortedFiles()[0].id;`),'a');
  assert.equal(c.run(`state.query='d';filteredAndSortedFiles().length;`),1);
});

test('selection cancelled while full pagination is pending remains cancelled', async () => {
  const c=app();let complete;
  c.wait=()=>new Promise(resolve=>{complete=resolve;});
  c.run(`setButtonLoading=()=>{};updateSelectionUI=()=>{};ensureAllPagesLoaded=wait;
    state.selectionMode=true;state.files=[{id:'must-not-select'}];`);
  const selection=c.run('selectAllVisibleFiles()');
  c.run('state.selectionMode=false;state.selectionGeneration++;');complete();await selection;
  assert.equal(c.run('state.selectedFileIds.size'),0);
});

test('a delayed tap cannot control the next media session', async () => {
  const c=app();let callback;
  c.setTimeout=fn=>{callback=fn;return 1;};
  c.run(`el.mediaStage={getBoundingClientRect:()=>({left:0,top:0,width:300,height:500})};
    el.playerSheet={hidden:false};let invoked=0;togglePlayPause=()=>invoked++;
    handleStageTap(150,250);state.mediaSession++;`);
  callback();assert.equal(c.run('invoked'),0);
});

test('unusable seek durations and secondary pointers never start a seek gesture', () => {
  const c=app();
  assert.equal(c.run(`el.videoPlayer={hidden:false,duration:Infinity,currentTime:5};
    beginPointerSeek({button:0},{},false);el.videoPlayer.duration=100;
    beginPointerSeek({button:2},{},false);isSeekingPointer;`),false);
});

test('finite deadlines reject stalled initialization and preserve successful results', async () => {
  const c=app();
  assert.equal(await c.run('withDeadline(Promise.resolve(42),1000)'),42);
  await assert.rejects(c.run('withDeadline(new Promise(()=>{}),1)'),/응답 시간/);
});

test('a background refresh from a different account cannot replace the current token', async () => {
  const c=app();c.fetch=async()=>new Response(JSON.stringify({user:{permissionId:'other'}}));
  c.run(`state.accountId='original';state.token='original-token';state.expiresAt=Date.now()+60000;`);
  const changed=await c.run(`applyTokenResponse({access_token:'other-token',expires_in:3600},
    {background:true,invalidateSession:false,generation:state.authGeneration})`);
  assert.equal(changed,false);assert.equal(c.run('state.token'),'original-token');
  assert.equal(c.run('state.accountId'),'original');
});

test('edge back uses projected release velocity but respects deliberate reversal', () => {
  const c=app();
  for(const [distance,velocity,expected] of [[150,0,true],[70,0,false],[55,.6,true],[40,2,false],[240,-.5,false],[0,5,false]]){
    assert.equal(c.run(`libraryEdgeReleaseDecision(${distance},${velocity},390)`),expected,`${distance}px at ${velocity}px/ms`);
  }
});

test('owned view history records one synchronous entry per navigation with account isolation', () => {
  const c=app(); const history={state:null,replaceState(s){this.state=s;},pushState(s){this.state=s;this.pushes++;},pushes:0};c.history=history;
  c.run(`state.accountId='account';beginLibraryNavigation();state.currentFolderId='child';commitLibraryNavigation();`);
  assert.equal(history.pushes,1);assert.equal(c.run('hasOwnedLibraryBackEntry()'),true);
  assert.equal(c.run(`libraryNavigation.entries.get(libraryNavigation.order[0]).view.currentFolderId`),'root');
  c.run(`state.accountId='other';`);assert.equal(c.run('hasOwnedLibraryBackEntry()'),false);
});

test('Safari and standalone WebKit reserve the native edge when app history is owned', () => {
  const c=app();
  c.run(`hasOwnedLibraryBackEntry=()=>true;navigator.userAgent='iPhone AppleWebKit Safari';`);
  assert.equal(c.run('prefersNativeLibraryBack()'),true);
  c.navigator.standalone=true;assert.equal(c.run('prefersNativeLibraryBack()'),true);
  c.run('hasOwnedLibraryBackEntry=()=>false');
  assert.equal(c.run('prefersNativeLibraryBack()'),false);
});

test('navigation snapshots are invalidated after mutations instead of reviving removed files', () => {
  const c=app();
  assert.equal(c.run(`libraryNavigation.entries.set(1,{data:{files:[{id:'deleted'}]},visual:{}});
    invalidateLibraryNavigationData();libraryNavigation.entries.get(1).data===null && libraryNavigation.entries.get(1).visual===null;`),true);
});

test('a browser-owned noncancelable or multi-touch edge never commits custom navigation', () => {
  const c=app();const listeners={};c.document.addEventListener=(name,fn)=>{listeners[name]=fn;};
  c.run(`isMobileDevice=()=>true;el.playerSheet={hidden:true};el.libraryView={hidden:false,style:{},clientWidth:390};
    state.currentFolderId='child';let backs=0;navigateToParentFolder=()=>backs++;setupLibraryEdgeBackGesture();`);
  const target={closest:()=>null};
  const start=()=>listeners.touchstart({touches:[{clientX:4,clientY:220,identifier:3}],target});
  const move={touches:[{clientX:220,clientY:220,identifier:3}],cancelable:false,preventDefault(){throw new Error('must not cancel browser gesture');}};
  start();listeners.touchmove(move);listeners.touchend({changedTouches:move.touches,touches:[]});assert.equal(c.run('backs'),0);
  start();listeners.touchstart({touches:[{identifier:3},{identifier:4}],target});assert.equal(c.run('edgeBackGesture'),null);
});

test('unsatisfied error ranges do not mask other structured failure causes', () => {
  const c=app();
  for(const [status,expected] of [[401,'auth'],[403,'permission'],[404,'not-found'],[429,'rate-limit'],[503,'server'],[0,'network']]){
    assert.equal(c.run(`classifyMediaProxyFailure({status:${status},rangeSatisfied:false})`),expected);
  }
});

test('forward deck promotes remaining unseen neighbors without changing reverse history', () => {
  const c=app();
  const result=JSON.parse(c.run(`JSON.stringify(advanceVerticalPlaybackDeck(
    {anchorId:'a',above:['b','c'],below:['d','e']}, 'up','d',
    ['a','b','c','d','e','f'].map(id=>({id})),()=>.999,new Set(['a','b','d','e'])
  ))`));
  assert.equal(result.above[0],'a');assert.ok(['c','f'].includes(result.below[0]));
});
