'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const media = id => ({ id, name: `${id}.mp4`, mimeType: 'video/mp4', parents: ['root'] });
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {resolve,promise};}

function fixture() {
  const frames = [], context = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    clearInterval, clearTimeout, console, fetch, performance, setInterval, setTimeout,
    history: { replaceState() {} }, navigator: { onLine: true },
    location: { href: 'https://example.test/', origin: 'https://example.test', pathname: '/', protocol: 'https:', hash: '', search: '' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelectorAll() { return []; } } };
  context.window = { addEventListener() {}, removeEventListener() {}, location: context.location, isSecureContext: true,
    innerHeight: 800, scrollTo() {}, matchMedia() { return { matches: false }; }, setTimeout };
  context.matchMedia = context.window.matchMedia;
  context.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  context.IntersectionObserver = class { constructor(callback) { this.callback=callback; context.observer=this; } observe() {} disconnect() {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../media/revision-pin.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  vm.runInContext(`hasUsableToken=()=>true;reportAppFailure=()=>{};showLibrary=()=>{};showToast=()=>{};showReconnectState=()=>{};updateConnectionBadge=()=>{};
    globalThis.actualRenderFiles=renderFiles;renderFiles=()=>updateLibrarySummary();el.libraryStatus={textContent:''};el.librarySummary={textContent:''};el.libraryView={hidden:false,style:{}};
    el.refreshButton={disabled:false};el.infiniteScrollSpinner={hidden:true};el.loadMoreButton={hidden:true,disabled:false,textContent:'다시 불러오기'};`, context);
  const frame = () => { const queued=frames.splice(0); queued.forEach(callback=>callback()); };
  const settle = async () => { for(let i=0;i<12&&(frames.length||run(context,'state.listRequestPromise'));i++) {
    frame(); const pending=run(context,'state.listRequestPromise'); if(pending)await pending; await Promise.resolve();
  } assert.equal(frames.length,0,'auto loading must settle in bounded pages'); };
  return {context,frames,frame,settle};
}
const run = (context, code) => vm.runInContext(code, context);
const value = (context, code) => JSON.parse(run(context, `JSON.stringify(${code})`));
function provider(context, pages) {
  const requests=[];
  context.driveFetch=async(url,options)=>{const parsed=new URL(url),token=parsed.searchParams.get('pageToken')||'';
    requests.push({token,signal:options.signal,fields:parsed.searchParams.get('fields'),priority:options.priority});
    const page=pages[token];assert(page,`unexpected page ${token}`);
    if(page instanceof Error)throw page;
    return {json:async()=>typeof page==='function'?page():page};};
  return requests;
}

test('list collection shows partial progress continuously until complete', async () => {
  const {context:c}=fixture();
  const held=deferred(),release=held.resolve;
  const requests=provider(c,{'':{files:[media('first')],nextPageToken:'B'},B:()=>held.promise});
  await run(c,'loadFiles({append:false})');
  assert.match(run(c,'el.librarySummary.textContent'),/미디어 1개 수집 · 목록 확인 중/);
  assert.equal(run(c,'el.infiniteScrollSpinner.hidden'),false);
  assert.equal(run(c,'el.loadMoreButton.hidden'),true);
  const second=run(c,'loadFiles({append:true})');await Promise.resolve();
  assert.match(run(c,'el.librarySummary.textContent'),/목록 확인 중/);
  assert.equal(run(c,'el.infiniteScrollSpinner.hidden'),false);
  assert.equal(run(c,'el.loadMoreButton.disabled'),true);
  release({files:[media('last')]});await second;
  assert.equal(run(c,'el.infiniteScrollSpinner.hidden'),true);
  assert.equal(run(c,'el.loadMoreButton.hidden'),true);
  assert.equal(run(c,'el.librarySummary.textContent'),'미디어 2개');
  assert.equal(run(c,'state.populationComplete'),true);
  await run(c,'loadFiles({append:true})');
  assert.equal(requests.length,2,'append after completion must not refetch page one');
});

test('sequential collection continues through empty and short pages without a scroll observer', async () => {
  const f=fixture(),c=f.context;
  const held=deferred(),release=held.resolve;
  const requests=provider(c,{'':()=>held.promise,B:{files:[],nextPageToken:'C'},C:{files:[media('last')]}});
  const first=run(c,'loadFiles({append:false})');await Promise.resolve();
  run(c,'scheduleNextFilePage()');f.frame();assert.equal(requests.length,1);
  release({files:[],nextPageToken:'B'});await first;await f.settle();
  assert.deepEqual(requests.map(r=>r.token),['','B','C']);
  assert.deepEqual(value(c,'state.files.map(f=>f.id)'),['last']);
  assert.equal(run(c,'state.populationComplete'),true);
});

test('background pages start without user scroll and coalesce overlapping append requests', async () => {
  const f=fixture(),c=f.context;
  const held=deferred(),release=held.resolve;
  const requests=provider(c,{'':{files:[media('first')],nextPageToken:'B'},B:()=>held.promise,C:{files:[media('last')]}});
  await run(c,'loadFiles({append:false})');f.frame();assert.equal(requests.length,2);
  const one=run(c,'loadFiles({append:true})'),two=run(c,'loadFiles({append:true})');await Promise.resolve();
  assert.equal(requests.length,2);
  release({files:[media('middle')],nextPageToken:'C'});await Promise.all([one,two]);
  await f.settle();
  assert.deepEqual(value(c,'state.files.map(f=>f.id)'),['first','middle','last']);
  assert.deepEqual(requests.map(r=>r.token),['','B','C']);
  assert.deepEqual(requests.map(r=>r.priority),['auto','low','low']);
});

test('failed append stops automatic retries and preserves its cursor and files for explicit retry', async () => {
  const f=fixture(),c=f.context;
  const pages={'':{files:[media('first')],nextPageToken:'B'},B:new Error('temporary failure')};
  const requests=provider(c,pages);await run(c,'loadFiles({append:false})');
  assert.equal(await run(c,'loadFiles({append:true})'),false);await f.settle();
  assert.equal(requests.length,2);assert.equal(run(c,'state.nextPageToken'),'B');
  assert.deepEqual(value(c,'state.files.map(f=>f.id)'),['first']);
  assert.match(run(c,'el.librarySummary.textContent'),/목록 수집 중단/);
  assert.equal(run(c,'el.loadMoreButton.textContent'),'다시 불러오기');
  assert.equal(run(c,'el.loadMoreButton.disabled'),false);
  assert.equal(run(c,'el.infiniteScrollSpinner.hidden'),true);
  run(c,'scheduleNextFilePage()');await f.settle();assert.equal(requests.length,2);
  pages.B={files:[media('last')]};assert.equal(await run(c,'loadFiles({append:true})'),true);
  assert.deepEqual(value(c,'state.files.map(f=>f.id)'),['first','last']);
  assert.equal(run(c,'state.listLoadError'),false);
});

test('navigation aborts in-flight pagination and fences old responses, statuses and queued auto work', async () => {
  const f=fixture(),c=f.context,held=deferred(),release=held.resolve;
  const requests=provider(c,{'':{files:[media('first')],nextPageToken:'B'},B:()=>held.promise});
  await run(c,'loadFiles({append:false})');
  const old=run(c,'loadFiles({append:true})');await Promise.resolve();
  run(c,"state.currentFolderId='new-folder';resetListingSession();el.librarySummary.textContent='new view';state.files=[{id:'new-view'}]");
  release({files:[media('stale')],nextPageToken:'C'});assert.equal(await old,false);f.frame();
  assert.equal(requests[1].signal.aborted,true);
  assert.equal(run(c,'el.librarySummary.textContent'),'new view');
  assert.deepEqual(value(c,'state.files.map(f=>f.id)'),['new-view']);
  assert.equal(run(c,'state.nextPageToken'),null);assert.equal(requests.length,2);
});

test('favorites, hidden library and deep scan do not consume ordinary pagination', async () => {
  for(const change of ["state.filter='favorites'",'state.deepScan=true','el.libraryView.hidden=true']) {
    const f=fixture(),c=f.context;
    const requests=provider(c,{'':{files:[media('first')],nextPageToken:'B'},B:{files:[]}});
    await run(c,'loadFiles({append:false})');run(c,`${change};updateLibrarySummary();scheduleNextFilePage()`);await f.settle();
    assert.equal(requests.length,1);
    if(!change.includes('hidden'))assert.equal(run(c,'el.loadMoreButton.hidden'),true);
  }
});

test('malformed, incomplete and repeated cursors never publish partial page data or claim completion', async () => {
  for(const bad of [{}, {files:[],nextPageToken:8}, {files:[media('bad')],incompleteSearch:true},
    {files:[media('bad')],nextPageToken:'B'}]) {
    const f=fixture(),c=f.context;provider(c,{'':{files:[media('first')],nextPageToken:'B'},B:bad});
    await run(c,'loadFiles({append:false})');assert.equal(await run(c,'loadFiles({append:true})'),false);
    assert.deepEqual(value(c,'state.files.map(f=>f.id)'),['first']);
    assert.equal(run(c,'state.populationComplete'),false);assert.equal(run(c,'state.nextPageToken'),'B');
  }
  const f=fixture(),c=f.context;provider(c,{'':{files:[],nextPageToken:'B'},B:{files:[media('middle')],nextPageToken:'C'},C:{files:[media('bad')],nextPageToken:'B'}});
  await run(c,'loadFiles({append:false})');await run(c,'loadFiles({append:true})');assert.equal(await run(c,'loadFiles({append:true})'),false);
  assert.deepEqual(value(c,'state.files.map(f=>f.id)'),['middle']);
});

test('complete-population collection owns the page chain and keeps filtered media outside the initial page', async () => {
  const f=fixture(),c=f.context;
  const requests=provider(c,{'':{files:[{id:'image',mimeType:'image/jpeg'}],nextPageToken:'B'},B:{files:[],nextPageToken:'C'},C:{files:[media('video')]}});
  await run(c,'loadFiles({append:false})');run(c,"state.filter='video'");
  await run(c,'ensureAllPagesLoaded()');await f.settle();
  assert.deepEqual(requests.map(r=>r.token),['','B','C']);
  assert.deepEqual(value(c,'filteredAndSortedFiles().map(f=>f.id)'),['video']);
  assert.equal(run(c,'state.populationComplete'),true);
  assert(requests.every(r=>r.fields.includes('incompleteSearch')));
});

test('cached back navigation restores retry state and consumed tokens instead of starting a failed cursor again', async () => {
  const f=fixture(),c=f.context;
  run(c, `state.accountId='owner';state.accountIdentityPending=false;el.playerSheet={hidden:true};
    libraryNavigation.entries.set(1,{id:1});libraryNavigation.order=[1];libraryNavigation.cursor=0;
    state.files=[{id:'saved',mimeType:'video/mp4'}];state.nextPageToken='B';state.listLoadError=true;state.listPageTokens.add('A');
    rememberLibraryView();globalThis.restoreTarget={epoch:libraryNavigation.epoch,id:1,owner:'owner'};
    state.currentFolderId='other';resetListingSession();`);
  let requests=0;c.driveFetch=async()=>{requests++;throw Error('failed cursor must await explicit retry');};
  await run(c,'restoreLibraryNavigation(restoreTarget)');await f.settle();
  assert.equal(requests,0);assert.equal(run(c,'state.listLoadError'),true);
  assert.deepEqual(value(c,'[...state.listPageTokens]'),['A']);
  assert.equal(run(c,'el.loadMoreButton.textContent'),'다시 불러오기');
  assert.deepEqual(value(c,'state.files.map(f=>f.id)'),['saved']);
});

test('request start and completion summaries count rendered query/filter matches rather than all loaded files', async () => {
  const f=fixture(),c=f.context,held=deferred();
  run(c, `renderFiles=actualRenderFiles;renderMediaGrid=files=>{globalThis.renderedIds=files.map(f=>f.id)};renderBreadcrumb=()=>{};
    el.emptyState={hidden:true};state.query='absent';state.filter='video';`);
  provider(c, {'':{files:[media('first'),{id:'image',name:'image.jpg',mimeType:'image/jpeg'},
    {id:'folder',name:'folder',mimeType:'application/vnd.google-apps.folder'}],nextPageToken:'B'},B:()=>held.promise});
  await run(c,'loadFiles({append:false})');
  const next=run(c,'loadFiles({append:true})');
  assert.match(run(c,'el.librarySummary.textContent'),/^검색 결과 0개 · 수집한 미디어 2개 · 목록 확인 중/);
  assert.doesNotMatch(run(c,'el.librarySummary.textContent'),/폴더/);
  held.resolve({files:[media('last')]});await next;
  assert.deepEqual(value(c,'renderedIds'),[]);
  assert.equal(run(c,'el.emptyState.hidden'),false);
  assert.equal(run(c,'el.librarySummary.textContent'),'검색 결과 0개 · 전체 미디어 3개');
  run(c, "state.filter='all';updateLibrarySummary()");
  assert.equal(run(c,'el.librarySummary.textContent'),'검색 결과 0개 · 전체 미디어 3개','unmatched folders must also stay out of the default count');
});

test('initial-page failure exposes retry and cannot silently restart or claim an empty folder', async () => {
  const f=fixture(),c=f.context,pages={'':new Error('first page unavailable')};
  const requests=provider(c,pages);
  assert.equal(await run(c,'loadFiles({append:false})'),false);
  await f.settle();
  assert.equal(run(c,'el.loadMoreButton.hidden'),false);
  assert.equal(run(c,'el.infiniteScrollSpinner.hidden'),true);
  assert.equal(run(c,'state.populationComplete'),false);
  assert.match(run(c,'el.librarySummary.textContent'),/목록 수집 중단/);
  assert.equal(requests.length,1);
  pages['']={files:[media('recovered')],nextPageToken:'B'};pages.B={files:[media('last')]};
  assert.equal(await run(c,'loadFiles({append:false})'),true);await f.settle();
  assert.equal(run(c,'state.populationComplete'),true);
  assert.equal(run(c,'el.loadMoreButton.hidden'),true);
  assert.deepEqual(requests.map(r=>r.token),['','','B']);
});

test('2051 media collect to completion while the viewport stays at the top', async () => {
  const f=fixture(),c=f.context,files=Array.from({length:2051},(_,i)=>media(`media-${i}`));
  const requests=provider(c,{'':{files:files.slice(0,458),nextPageToken:'B'},B:{files:files.slice(458,1000),nextPageToken:'C'},
    C:{files:files.slice(1000,2000),nextPageToken:'D'},D:{files:files.slice(2000)}});
  await run(c,'loadFiles({append:false})');await f.settle();
  assert.deepEqual(requests.map(r=>r.token),['','B','C','D']);
  assert.equal(run(c,'state.files.length'),2051);
  assert.equal(run(c,'state.populationComplete'),true);
  assert.equal(run(c,'el.librarySummary.textContent'),'미디어 2,051개');
  assert.equal(run(c,'el.infiniteScrollSpinner.hidden'),true);
});

test('empty-state stays hidden for an unmatched partial search until collection ends', async () => {
  const f=fixture(),c=f.context,held=deferred();
  run(c, `renderFiles=actualRenderFiles;renderMediaGrid=()=>{};renderBreadcrumb=()=>{};
    el.emptyState={hidden:true};state.query='absent';`);
  provider(c,{'':{files:[media('first')],nextPageToken:'B'},B:()=>held.promise});
  await run(c,'loadFiles({append:false})');
  assert.equal(run(c,'el.emptyState.hidden'),true);
  const next=run(c,'loadFiles({append:true})');held.resolve({files:[media('last')]});await next;
  assert.equal(run(c,'el.emptyState.hidden'),false);
});
