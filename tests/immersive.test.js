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
    __DRIVE_ORIGINAL_RUNTIME__: {driveMutationsEnabled:true},
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
  // Synthetic credentials in these fixtures represent verified full grants.
  c.run('state.authCapabilities={version:1,driveRead:true,driveWrite:true,appData:true}');
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

test('same-account session credential renewal preserves listing and session generations', () => {
  const c=client();
  c.run(`state.authAccountKey='account-A';state.token='old';state.tokenRevision=2;state.accountId='account-A';state.accountStateLoaded=true;state.accountIdentityPending=false;
    let invalidations=0;invalidateDriveSessionData=()=>invalidations++;
    scheduleTokenRenewal=()=>{};clearAuthError=()=>{};sendTokenToWorker=()=>{};updateConnectionBadge=()=>{};resumeAfterCredential=()=>{};`);
  assert.equal(c.run(`installSessionCredential({capabilities:{version:1,driveRead:true,driveWrite:true,appData:true},accessToken:'new',expiresAt:Date.now()+3600000,account:'account-A',revision:3},
    {generation:state.authGeneration})`),true);
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

test('bottom activation follows the native entry rectangle, independent of media pause', () => {
  const c=client();
  c.run(`el.playerModal={getBoundingClientRect:()=>({left:0,right:390,top:0,bottom:844})};
    el.playerControlsEntry={getBoundingClientRect:()=>({left:0,right:390,top:800,bottom:844})};
    el.videoPlayer={paused:true};`);
  assert.equal(c.run(`isPlayerBottomActivation(190,838)`),true);
  assert.equal(c.run(`isPlayerBottomActivation(190,600)`),false);
  assert.equal(c.run(`isPlayerBottomActivation(-1,838)`),false);
  assert.equal(c.run(`isPlayerBottomActivation(190,799)`),false);
  assert.equal(c.run(`isPlayerBottomActivation(190,800)`),true);
  assert.equal(c.run(`el.videoPlayer.paused=false;isPlayerBottomActivation(190,838)`),true);
  // Safe-area/fullscreen layout changes are owned by the actual entry, not a
  // second independently computed activation strip.
  c.run(`el.playerControlsEntry.getBoundingClientRect=()=>({left:12,right:378,top:776,bottom:844});`);
  assert.equal(c.run(`isPlayerBottomActivation(190,776)`),true);
  assert.equal(c.run(`isPlayerBottomActivation(10,838)`),false);
  assert.equal(c.run(`el.playerControlsEntry=null;isPlayerBottomActivation(190,838)`),false);
});

test('edge-owned touch cannot become a video-swipe even without a back destination', () => {
  const c=client();
  assert.equal(c.run(`isReservedBackStart(5)`),true);
  assert.equal(c.run(`isReservedBackStart(120)`),false);
  assert.equal(c.run(`navigator.userAgent='iPhone';isReservedBackStart(28)`),true);
});

function touchGestureClient() {
  const c=client(), handlers=new Map(); c.gestureHandlers=handlers;
  c.run(`el.playerModal={addEventListener:(name,handler)=>gestureHandlers.set(name,handler)};
    el.playerControlsEntry={getBoundingClientRect:()=>({left:0,right:390,top:800,bottom:844})};
    el.mediaStage={clientWidth:390,clientHeight:844,classList:classes()};
    state.mediaAttempt='range';clearMediaTransition=()=>{};getActiveMediaElement=()=>null;
    resolveSwipeTarget=()=>({id:'next-fixture'});snapBackSpring=()=>{};setupTouchGestures();`);
  const event=(x=190,y=400,{interactive=false,tagName='',count=1,cancelable=true}={})=>{
    const point={clientX:x,clientY:y};
    return {touches:Array.from({length:count},()=>point),changedTouches:[point],cancelable,
      target:{closest:selector=>interactive||selector.split(',').some(s=>s.trim()===tagName)?{}:null},prevented:false,preventDefault(){this.prevented=true;}};
  };
  return {c,handlers,event};
}

test('eligible media contact reserves before a subthreshold first move can surrender cancellation', () => {
  const {c,handlers,event}=touchGestureClient();const start=event();
  handlers.get('touchstart')(start);assert.equal(start.prevented,true);
  const first=event(198,400);handlers.get('touchmove')(first);
  assert.equal(c.run('lockedAxis'),null);assert.equal(c.run('isTouchActive'),true);
  // Model the observed native Chrome choice: only an already reserved contact
  // keeps the next move cancellable after an unclaimed sub-12px first move.
  const second=event(218,400,{cancelable:start.prevented||first.prevented});
  handlers.get('touchmove')(second);assert.equal(second.prevented,true);
  assert.equal(c.run('lockedAxis'),'x');assert.equal(c.run('isTouchActive'),true);
});

test('gesture reservation leaves native controls and reserved OS edges untouched', () => {
  const {c,handlers,event}=touchGestureClient();
  for(const e of [event(190,400,{interactive:true}),event(5,400)]){
    handlers.get('touchstart')(e);assert.equal(e.prevented,false);assert.equal(c.run('isTouchActive'),false);
  }
  c.run(`let reveals=0;revealPlayerChrome=()=>reveals++;`);const entry=event(190,820,{tagName:'button'});
  handlers.get('touchstart')(entry);assert.equal(entry.prevented,false);
  assert.equal(c.run('reveals'),0);assert.equal(c.run('isTouchActive'),false);
});

test('a media swipe can start near the bottom without an invisible activation strip', () => {
  const {c,handlers,event}=touchGestureClient();const start=event(190,820);
  handlers.get('touchstart')(start);assert.equal(start.prevented,true);
  handlers.get('touchmove')(event(190,730));
  assert.equal(c.run('lockedAxis'),'y');assert.equal(c.run('isTouchActive'),true);
  handlers.get('touchcancel')();
});

test('native More summary stays outside stage tap and swipe ownership', () => {
  const {c,handlers,event}=touchGestureClient();c.run(`let taps=0;handleStageTap=()=>taps++;`);
  for(const tagName of ['summary','button','input','select']) {
    const start=event(190,400,{tagName}),end=event(190,400,{tagName});
    handlers.get('touchstart')(start);handlers.get('touchmove')(event(220,400,{tagName}));handlers.get('touchend')(end);
    assert.equal(start.prevented,false,tagName);assert.equal(end.prevented,false,tagName);
    assert.equal(c.run('isTouchActive'),false,tagName);assert.equal(c.run('taps'),0,tagName);
  }
});

test('multi-contact and uncancelable starts cannot acquire the media gesture', () => {
  const {c,handlers,event}=touchGestureClient();
  for(const e of [event(190,400,{count:2}),event(190,400,{cancelable:false})]){
    handlers.get('touchstart')(e);assert.equal(e.prevented,false);assert.equal(c.run('isTouchActive'),false);
  }
  handlers.get('touchstart')(event());assert.equal(c.run('isTouchActive'),true);
  handlers.get('touchmove')(event(230,400,{count:2}));
  assert.equal(c.run('isTouchActive'),false);assert.equal(c.run('lockedAxis'),null);
});

test('reserved media tap still uses one touchend action without relying on compatibility click', () => {
  const {c,handlers,event}=touchGestureClient();c.run(`let taps=0;handleStageTap=()=>taps++;`);
  const start=event(),end=event();handlers.get('touchstart')(start);handlers.get('touchend')(end);
  assert.equal(start.prevented,true);assert.equal(end.prevented,true);assert.equal(c.run('taps'),1);
  assert.equal(c.run('isTouchActive'),false);assert.equal(c.run('lockedAxis'),null);
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

test('account-mismatched session credential preserves the current account instead of replacing it', () => {
  const c=client();
  c.run(`state.authAccountKey='account-A';state.token='valid-A';state.tokenRevision=4;
    scheduleTokenRenewal=()=>{};clearAuthError=()=>{};sendTokenToWorker=()=>{};updateConnectionBadge=()=>{};resumeAfterCredential=()=>{};`);
  assert.equal(c.run(`installSessionCredential({capabilities:{version:1,driveRead:true,driveWrite:true,appData:true},accessToken:'unverified',expiresAt:Date.now()+3600000,account:'account-B',revision:5},
    {generation:state.authGeneration})`),false);
  assert.equal(c.run('state.authAccountKey'),'account-A');assert.equal(c.run('state.token'),'valid-A');
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
    let refreshes=0;requestSessionCredential=async()=>{refreshes++;return false;};`);
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
