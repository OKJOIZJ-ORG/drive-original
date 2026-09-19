'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function client() {
  const timers = new Map(); let next = 0;
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    console, performance, fetch, clearInterval, setInterval,
    setTimeout(fn, delay) { const id = ++next; timers.set(id, {fn, delay}); return id; },
    clearTimeout(id) { timers.delete(id); }, requestAnimationFrame() {},
    location: {href:'https://app.test/drive-original/', origin:'https://app.test', pathname:'/drive-original/', search:''},
    navigator: {onLine:true}, localStorage: {getItem(){return null;},setItem(){},removeItem(){}},
    document: {addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},visibilityState:'visible'} };
  c.window = {addEventListener(){},removeEventListener(){},innerWidth:390,innerHeight:844,
    matchMedia:()=>({matches:false}),location:c.location};
  c.matchMedia=c.window.matchMedia;
  vm.createContext(c); vm.runInContext(source,c);
  c.run=s=>vm.runInContext(s,c); c.timers=timers;
  c.run(`function classes(){const s=new Set();return {add:(...n)=>n.forEach(x=>s.add(x)),remove:(...n)=>n.forEach(x=>s.delete(x)),contains:n=>s.has(n),toggle:(n,v)=>{if(v)s.add(n);else s.delete(n);}};}`);
  return c;
}

test('iOS standalone reserves native history, with no second custom page animation', () => {
  const c=client();
  assert.equal(c.run(`navigator.userAgent='iPhone';navigator.standalone=true;hasOwnedLibraryBackEntry=()=>true;prefersNativeLibraryBack()`),true);
});

test('paused video never forces the central play overlay into view', () => {
  const c=client();
  c.run(`el.videoPlayer={hidden:false,paused:true};el.stageCenterPlayBtn={hidden:true};updateFrameStepVisibility=()=>{};updatePlayPauseUI();`);
  assert.equal(c.run('el.stageCenterPlayBtn.hidden'),true);
});

test('passive timer resets cannot reveal hidden chrome or pause the immersive state', () => {
  const c=client();
  c.run(`el.playerModal={classList:classes()};el.playerSheet={hidden:false};
    el.playerModal.classList.add('controls-idle');resetControlsTimer();`);
  assert.equal(c.run(`el.playerModal.classList.contains('controls-idle')`),true);
});

test('a file permission failure does not erase account credentials', async () => {
  const c=client();
  c.run(`let cleared=0;clearToken=()=>cleared++;state.selected={id:'denied',mimeType:'image/png'};
    decideMediaRecovery=()=> 'fail-permission';showMediaError=()=>{};updateConnectionBadge=()=>{};`);
  await c.run(`recoverFromMediaProxyError({status:403,driveReason:'insufficientFilePermissions'})`);
  assert.equal(c.run('cleared'),0);
});

test('same-account interactive renewal preserves listing and session generations', async () => {
  const c=client();
  c.run(`state.accountId='account-A';state.accountStateLoaded=true;state.accountIdentityPending=false;
    let invalidations=0;invalidateDriveSessionData=()=>invalidations++;
    refreshedTokenMatchesAccount=async()=>true;saveToken=()=>{};clearClientIdError=()=>{};
    sendTokenToWorker=()=>{};updateConnectionBadge=()=>{};`);
  assert.equal(await c.run(`applyTokenResponse({access_token:'new',expires_in:3600},
    {background:false,invalidateSession:true,generation:state.authGeneration})`),true);
  assert.equal(c.run('invalidations'),0);
});

test('card long press supports pointer mouse and cancels a second contact', () => {
  const c=client();const handlers=new Map();
  c.handlers=handlers;
  c.run(`const button={isConnected:true,classList:classes(),closest(){return this;},
    addEventListener:(n,fn)=>handlers.set(n,fn)};
    installCardSelectionGestures(button,{id:'fixture'});`);
  handlers.get('pointerdown')({pointerType:'mouse',button:0,pointerId:1,clientX:80,clientY:200,isPrimary:true});
  assert.ok([...c.timers.values()].some(t=>t.delay===520));
  handlers.get('pointerdown')({pointerType:'touch',button:0,pointerId:2,clientX:90,clientY:200,isPrimary:false});
  assert.equal(c.timers.size,0);
});

test('bottom activation is a narrow boundary, independent of media pause', () => {
  const c=client();
  c.run(`el.playerModal={getBoundingClientRect:()=>({left:0,right:390,top:0,bottom:844})};`);
  assert.equal(c.run(`isPlayerBottomActivation(190,838)`),true);
  assert.equal(c.run(`isPlayerBottomActivation(190,600)`),false);
  assert.equal(c.run(`isPlayerBottomActivation(-1,838)`),false);
});

test('edge-owned touch cannot become a video-swipe even without a back destination', () => {
  const c=client();
  assert.equal(c.run(`isReservedBackStart(5)`),true);
  assert.equal(c.run(`isReservedBackStart(120)`),false);
  assert.equal(c.run(`navigator.userAgent='iPhone';isReservedBackStart(28)`),true);
});

test('secondary 401 handlers cannot clear a newer token or a different account', () => {
  const c=client();
  c.run(`state.tokenRevision=4;state.driveSessionGeneration=9;let cleared=0;clearToken=()=>cleared++;`);
  c.run(`clearRejectedToken({status:401,rejectedTokenRevision:3,rejectedAccountGeneration:9});
    clearRejectedToken({status:401,rejectedTokenRevision:4,rejectedAccountGeneration:8});
    clearRejectedToken({status:403,rejectedTokenRevision:4,rejectedAccountGeneration:9});
    clearRejectedToken({status:401});`);
  assert.equal(c.run('cleared'),0);
  c.run(`clearRejectedToken({status:401,rejectedTokenRevision:4,rejectedAccountGeneration:9});`);
  assert.equal(c.run('cleared'),1);
});

test('unknown renewal identity preserves the current account instead of replacing it', async () => {
  const c=client();
  c.run(`state.accountId='account-A';state.token='valid-A';let saved=0;saveToken=()=>saved++;
    refreshedTokenMatchesAccount=async()=>null;`);
  assert.equal(await c.run(`applyTokenResponse({access_token:'unverified',expires_in:3600},
    {background:false,invalidateSession:true,generation:state.authGeneration})`),false);
  assert.equal(c.run('saved'),0);assert.equal(c.run('state.token'),'valid-A');
});

test('Drive API 403 preserves the token and carries no bearer credentials in its error', async () => {
  const c=client();
  c.run(`state.token='valid';state.expiresAt=Date.now()+3600000;state.tokenRevision=2;`);
  c.fetch=async()=>new Response(JSON.stringify({error:{message:'denied',errors:[{reason:'insufficientFilePermissions'}]}}),{status:403});
  await assert.rejects(c.run(`driveFetch('https://fixture.test/file')`),error=>{
    assert.equal(error.status,403);assert.equal(error.rejectedTokenRevision,2);
    assert.equal(JSON.stringify(error).includes('valid'),false);return true;
  });
  assert.equal(c.run('state.token'),'valid');
});

test('an older player-close deadline cannot unlock a newer back operation', () => {
  const c=client();c.history={back(){}};
  c.run(`el.playerSheet={hidden:false};hasOwnedPlayerEntry=()=>true;closePlayer=()=>{};requestClosePlayer();`);
  const old=[...c.timers.values()].find(t=>t.delay===800);
  c.run(`playerHistoryPending=false;requestClosePlayer();`);
  old.fn();assert.equal(c.run('playerHistoryPending'),true);
  [...c.timers.values()].at(-1).fn();assert.equal(c.run('playerHistoryPending'),false);
});

test('a late 401 uses the newer revision even when token text is identical', async () => {
  const c=client();let release;let requests=0;
  c.run(`state.token='same-text';state.expiresAt=Date.now()+3600000;state.tokenRevision=1;
    let refreshes=0;requestGoogleToken=async()=>{refreshes++;return false;};`);
  c.fetch=async()=>{
    if(++requests===1) return new Promise(resolve=>{release=resolve;});
    return new Response('{}',{status:200});
  };
  const pending=c.run(`driveFetch('https://fixture.test/late')`);
  c.run('state.tokenRevision=2');
  release(new Response('{}',{status:401}));
  assert.equal((await pending).status,200);assert.equal(requests,2);
  assert.equal(c.run('refreshes'),0);assert.equal(c.run('state.token'),'same-text');
});
