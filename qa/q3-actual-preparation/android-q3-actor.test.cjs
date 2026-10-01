'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const actor = require('./android-q3-actor.cjs');
test('separate admission preserves self-registering API and rejects an API destination', async () => {
  for (const api of ['__q3ActualReplay33', '__q3PcSeekTargets33', '__resumeSwProof']) {
    const context = { window: { __q3ActorOwned33: { refs: {}, cleanupStarted: false } } };
    const expression = `(()=>{window.${api}={read:()=>({actualAPI:true}),stop:()=>({removed:true})};return{installed:true};})()`;
    const fn = vm.runInNewContext(`(${actor.scriptAdmission(expression, '__q3ActorTestAdmission33', api)})`, context);
    await fn();
    assert.equal(context.window[api].read().actualAPI, true);
    assert.equal(context.window.__q3ActorTestAdmission33.installed, true);
    assert.equal(context.window.__q3ActorOwned33.refs[api], context.window[api]);
    assert.throws(() => actor.scriptAdmission(expression, api, api), /SEPARATE_HELPER_ADMISSION_REQUIRED/);
    await assert.rejects(fn(), /ACTOR_HELPER_OWNERSHIP/);
  }
});
test('failed and late helper admission retains cleanup ownership and deletes late references', async () => {
  const context = { window: { __q3ActorOwned33: { refs: {}, cleanupStarted: false } } };
  const bad = vm.runInNewContext(`(${actor.scriptAdmission("(()=>{window.__q3ActualReplay33={stop:()=>({removed:true})};throw Error('CONSTRUCTION_FAILED');})()", '__q3ActorTestAdmission33', '__q3ActualReplay33')})`, context);
  await assert.rejects(bad(), /CONSTRUCTION_FAILED/);
  assert.equal(context.window.__q3ActorOwned33.refs.__q3ActualReplay33, context.window.__q3ActualReplay33);
  delete context.window.__q3ActualReplay33;
  const late = vm.runInNewContext(`(${actor.scriptAdmission("(()=>{window.__q3ActorOwned33.cleanupStarted=true;window.__q3PcSeekTargets33={stop:()=>{window.stopped=true;}};return{installed:true};})()", '__q3ActorTestAdmission33', '__q3PcSeekTargets33')})`, context);
  await late(); assert.equal(context.window.stopped, true);
  assert.equal(context.window.__q3PcSeekTargets33, undefined); assert.equal(context.window.__q3ActorTestAdmission33, undefined);
});
test('physical mapping pins orientation, DPR, viewport and both DOM hit checks', () => {
  const g = { width:824,height:1191,dpr:2.125,screenWidth:1752,screenHeight:2800,available:true,exactHit:true,quantizedHit:true,x:412,y:1161.35 };
  assert.deepEqual(actor.physicalPoint(g), { x:876, y:2737 });
  for (const change of [{width:825},{height:1190},{dpr:2},{screenWidth:1753},{screenHeight:2801},{exactHit:false},{quantizedHit:false},{available:false},{x:-1},{y:1192}]) assert.throws(() => actor.physicalPoint({...g,...change}));
});
test('geometry uses exact private IDs or exact folder names and quantized native-hit verification', () => {
  const card = actor.geometryExpression('card'), folder = actor.geometryExpression('folder');
  assert.match(card, /n\.dataset\.fileId===t\?\.id/);
  assert.match(folder, /state\.folders\.find\(f=>f\.id===t\?\.parents\?\.\[0\]\)/);
  assert.match(folder, /textContent===folder\.name/); assert.doesNotMatch(folder, /\/Q3\//);
  assert.match(card, /elementFromPoint\(qx,qy\)/);
  for (const kind of ['card','folder','entry','pause','close','choice','marker']) assert.doesNotMatch(actor.geometryExpression(kind,.5), /\.click\(|dispatchEvent|\.play\(|currentTime\s*=|scrollIntoView/);
});
test('fresh fake DOM rejects a card when native pixel rounding lands on an occluder', () => {
  const card={dataset:{fileId:'local-fake-target'},isConnected:true,disabled:false,parentElement:null,contains:hit=>hit===card,getBoundingClientRect:()=>({left:100.13,top:600.17,width:20,height:20})};
  const context={window:{__q3ActualTarget33:{id:'local-fake-target'}},innerWidth:824,innerHeight:1191,devicePixelRatio:2.125,getComputedStyle:()=>({display:'block',visibility:'visible',pointerEvents:'auto',opacity:'1'}),document:{querySelectorAll:()=>[card],elementFromPoint:()=>card}};
  const evaluate=()=>vm.runInNewContext(`(${actor.geometryExpression('card')})()`,context);
  const good=evaluate();assert.equal(good.available,true);assert.equal(good.exactHit,true);assert.equal(good.quantizedHit,true);
  context.document.elementFromPoint=(x,y)=>Math.abs(x-110.13)<1e-8&&Math.abs(y-610.17)<1e-8?card:{};
  const blocked=evaluate();assert.equal(blocked.exactHit,true);assert.equal(blocked.quantizedHit,false);assert.equal(blocked.available,false);
  assert.throws(()=>actor.physicalPoint(blocked),/FRESH_EXACT_GEOMETRY_REQUIRED/);
});
test('seek90 arms cancel inside the first qualified-frame read', () => {
  const events = [], replay = { read:()=>({phases:[{label:'seek90',firstTargetFrame:{elapsedMs:30100}}],latest:{}}), arm:label=>events.push(label) };
  const result = vm.runInNewContext(`(${actor.summaryExpression('seek90', true)})()`, {window:{__q3ActualReplay33:replay}});
  assert.equal(result.frame, true); assert.deepEqual(events, ['cancel']);
  replay.read = ()=>({phases:[{label:'seek90',firstTargetFrame:null}],latest:{}});
  vm.runInNewContext(`(${actor.summaryExpression('seek90', true)})()`, {window:{__q3ActualReplay33:replay}});
  assert.deepEqual(events, ['cancel']);
});
test('failure cleanup exports incomplete receipt before stop, closes via native owner, settles then clears', async () => {
  const events = [];
  const io = {
    evaluate: async fn => {
      if(fn.includes('?.read()||null')) { events.push('read'); return {schema:'drive-original.q3-actual-observation/1',complete:true}; }
      if(fn.includes('cleanupStarted=true')) {events.push('mark');return{marked:true};}
      if(fn.includes('const m=marker?.stop()')) {events.push('stop');return{markersStopped:true,observerStopped:true};}
      if(fn.includes('ACTOR_POSTCLOSE_METADATA_OWNER')) {events.push('metadataAfter');return{freshRead:true,metadata:{label:'after',sameExactTarget:true,stableMetadataSame:true,freshRevisionChecksumSame:true,accountSame:true,sourceSame:true,notTrashed:true,canDownload:true}};}
      if(fn.includes('closed:el.playerSheet.hidden')) return {closed:false,mayClose:true};
      if(fn.includes('delete window.__q3ActorOwned33')) {events.push('clear');return{cleared:true};}
      throw Error('UNEXPECTED_FAKE_COMMAND');
    },
    close:async()=>events.push('nativeClose'),pollSettled:async()=>{events.push('settle');return{settled:true};}
  };
  const result = await actor.cleanupActor(io,{guardOwned:true,observerOwned:true,failed:true,failure:'PHASE_BOUND',exportFailure:async r=>{events.push('export');assert.equal(r.complete,false);assert.equal(r.performanceAcceptance,'NOT_QUALIFIED');return{saved:true};}});
  assert.deepEqual(events,['read','export','mark','stop','nativeClose','settle','metadataAfter','clear']); assert.equal(result.confirmed,true);
  assert.equal(result.postCloseMetadata.freshRead,true);
});
test('failure export rejection still runs native cleanup and remains unconfirmed', async () => {
  let closed=false,cleared=false;
  const result=await actor.cleanupActor({evaluate:async fn=>fn.includes('?.read()||null')?{}:fn.includes('const m=marker?.stop()')?{markersStopped:true,observerStopped:true}:fn.includes('ACTOR_POSTCLOSE_METADATA_OWNER')?{freshRead:true,metadata:{sameExactTarget:true,stableMetadataSame:true,freshRevisionChecksumSame:true,accountSame:true,sourceSame:true,notTrashed:true,canDownload:true}}:fn.includes('closed:')?{closed:false,mayClose:true}:fn.includes('delete window.__q3ActorOwned33')?(cleared=true,{cleared:true}):{},close:async()=>{closed=true;},pollSettled:async()=>({settled:true})},{guardOwned:true,observerOwned:true,failed:true,failure:'FAILED',exportFailure:async()=>{throw Error('DISK_FULL');}});
  assert.equal(closed,true);assert.equal(cleared,true);assert.equal(result.confirmed,false);assert.deepEqual(result.failures,['failureReceipt']);
});
test('import/preparation is inert, exact pins validate locally and safe labels prevent path traversal', () => {
  assert.throws(()=>actor.names('../unsafe'),/NEW_SAFE_LABEL_REQUIRED/);
  const input=actor.prepare('local-unit-test-only');
  assert.equal(input.binding.version,'1.22.0-rc.33');
  assert.equal(input.binding.sourceCommit,'5174485b3c17d047259701bbdd889f9b0740f555');
  assert.equal(fs.existsSync(require('node:path').join(__dirname,input.output.report)),false);
});
test('failed native admission never reads private target, plays, or issues ADB input', async () => {
  const steps=[],operations=[];let privateRead=false;
  const c={report:{model:'SM-X800',android:'16',physicalScreen:'Physical size: 1752x2800'},step:(s,d)=>steps.push({s,d}),unmaskNativeVisibility:async()=>operations.push('unmask'),releaseMcpForNativeLifecycle:async()=>operations.push('detach'),evaluateNative:async()=>({identity:false}),adb:()=>{throw Error('FORBIDDEN_REAL_INPUT');},wait:async()=>{}};
  await assert.rejects(actor.runActor(c,{output:{},binding:{}},{progress:()=>{},readPrivate:()=>{privateRead=true;throw Error('FORBIDDEN_PRIVATE_READ');}}),/ACTOR_IDLE_ADMISSION_REQUIRED/);
  assert.equal(privateRead,false);assert.deepEqual(operations,['unmask','detach']);
  assert.equal(c.report.actorFunctionalComplete,false);assert.equal(c.report.performanceAcceptance,'NOT_QUALIFIED');
  assert.equal(steps.at(-1).s,'actor-cleanup');
});
test('account/file/controller/hash switches block all native controls and cleanup leaves foreign playback unchanged', async () => {
  function fixture() {
    const target={id:'local-fixture',name:'local-fixture.mp4',size:'18075476',mimeType:'video/mp4',modifiedTime:'local-time',parents:['local-folder'],version:'1'};
    const account={accountId:'local-account',authAccountKey:'local-key',authGeneration:1,driveSessionGeneration:2};
    const sourceSHA256={a:'1',b:'2',c:'3',d:'4',e:'5'},controller={state:'activated'};
    const holder={metadata:target,account:{accountId:account.accountId,authAccountKey:account.authAccountKey}};
    const proof={get:()=>({version:'1.22.0-rc.33',sourceCommit:'5174485b3c17d047259701bbdd889f9b0740f555',controller,sourceSHA256})};
    const observer={read:()=>({schema:'drive-original.q3-actual-observation/1'}),stop:()=>({disposed:true,removed:true})};
    const node={isConnected:true,disabled:false,parentElement:null,contains:hit=>hit===node,getBoundingClientRect:()=>({left:100,top:700,width:40,height:40})};
    return {window:{__q3ActualTarget33:holder,__resumeSwProof:proof,__q3ActualReplay33:observer,__q3ActorOwned33:{identity:account,sourceSHA256:{...sourceSHA256},refs:{__q3ActualTarget33:holder,__resumeSwProof:proof,__q3ActualReplay33:observer},cleanupStarted:false}},APP_VERSION:'1.22.0-rc.33',state:{...account,authStatus:'online',selected:{...target}},navigator:{serviceWorker:{controller}},q0Playback:null,q0PinnedSource:null,q1Playback:{fileId:target.id},el:{playerSheet:{hidden:false},playerControlsEntry:node,ctrlPlayPause:node,closePlayerButton:node,videoCompatButton:node},document:{visibilityState:'visible',elementFromPoint:()=>node},innerWidth:824,innerHeight:1191,devicePixelRatio:2.125,getComputedStyle:()=>({display:'block',visibility:'visible',pointerEvents:'auto',opacity:'1'})};
  }
  const switches=[c=>{c.state.selected={...c.state.selected,id:'local-foreign-file'};c.q1Playback.fileId='local-foreign-file';},c=>{c.state.accountId='local-foreign-account';},c=>{c.navigator.serviceWorker.controller={state:'activated'};},c=>{const prior=c.window.__resumeSwProof.get;c.window.__resumeSwProof.get=()=>({...prior(),sourceSHA256:{...prior().sourceSHA256,a:'changed'}});}];
  for(const change of switches) {
    const context=fixture(),evaluate=fn=>vm.runInNewContext(`(${fn})()`,context);
    for(const kind of ['entry','pause','close','choice']) assert.equal(evaluate(actor.geometryExpression(kind)).available,true);
    change(context);const foreignBefore=JSON.stringify({state:context.state,playback:context.q1Playback,sheet:context.el.playerSheet});
    let nativeCloseCalls=0,settlementCalls=0,exportCalls=0;
    for(const kind of ['entry','pause','close','choice']) { const geometry=evaluate(actor.geometryExpression(kind));assert.equal(geometry.available,false);assert.throws(()=>actor.physicalPoint(geometry)); }
    const result=await actor.cleanupActor({evaluate:async fn=>evaluate(fn),close:async()=>{nativeCloseCalls++;},pollSettled:async()=>{settlementCalls++;return{settled:true};}},{guardOwned:true,observerOwned:true,failed:true,failure:'ACTOR_OBSERVER_FENCE',exportFailure:async r=>{exportCalls++;assert.equal(r.complete,false);return{saved:true};}});
    assert.equal(nativeCloseCalls,0);assert.equal(settlementCalls,0);assert.equal(exportCalls,1);
    assert.equal(result.foreignPlaybackLeftUntouched,true);assert.equal(result.confirmed,false);assert.equal(result.settled,false);assert.deepEqual(result.failures,['nativeClose']);
    assert.equal(JSON.stringify({state:context.state,playback:context.q1Playback,sheet:context.el.playerSheet}),foreignBefore);
  }
});
test('route-independent native upkeep preserves the sole paused target frame through Q2 to Q3 and skips occlusion', async () => {
  async function run(useNewUpkeep) {
    let clock=0,controlsUntil=3000,frameCount=0,qualifiedFrame=false,route='Q2_GENERAL';const taps=[],skips=[];
    const geometry=kind=>({width:824,height:1191,dpr:2.125,screenWidth:1752,screenHeight:2800,ownershipCurrent:true,available:kind==='pause'?clock<controlsUntil:clock>=5000,exactHit:true,quantizedHit:true,x:412,y:1161.35});
    const io={geometry:async kind=>geometry(kind),tap:async(kind,g)=>{assert.equal(kind,'entry');actor.physicalPoint(g);assert.ok(clock>=5000);taps.push(clock);controlsUntil=clock+3000;}};
    for(clock=0;clock<=14000;clock+=200) {
      // A paused decoder emits exactly one frame at the observed transition boundary.
      if(clock===11400){route='Q3';frameCount++;qualifiedFrame=clock<controlsUntil;}
      if(useNewUpkeep||route==='Q3') { const upkeep=await actor.maintainOwnedControls(io);if(upkeep.skipped)skips.push(clock); }
    }
    return{taps,skips,frameCount,qualifiedFrame,paused:true};
  }
  const old=await run(false),fixed=await run(true);
  assert.equal(old.frameCount,1);assert.equal(old.qualifiedFrame,false);
  assert.equal(fixed.frameCount,1);assert.equal(fixed.qualifiedFrame,true);assert.equal(fixed.paused,true);
  assert.ok(fixed.taps.some(t=>t<11400));assert.ok(fixed.skips.length>0);assert.ok(fixed.skips.every(t=>t<5000));assert.ok(fixed.taps.every(t=>t>=5000));
  let touched=false;
  await assert.rejects(actor.maintainOwnedControls({geometry:async()=>({ownershipCurrent:false,available:true}),tap:async()=>{touched=true;}}),/ACTOR_CONTROL_OWNERSHIP_CHANGED/);
  assert.equal(touched,false);
});
test('native close or settlement failure preserves admitted identity/private/source refs for recovery after pre-stop export',async()=>{
  for(const failure of ['nativeClose','settlement']) {
    const events=[],identity={authAccountKey:'local-account'},target={id:'local-target'},proof={get:()=>({})};
    const observer={read:()=>({complete:false}),stop:()=>{events.push('stop');return{disposed:true,removed:true};}};
    const refs={__q3ActualTarget33:target,__resumeSwProof:proof,__q3ActualReplay33:observer};
    const context={window:{__q3ActorOwned33:{identity,refs,cleanupStarted:false},...refs}};
    const io={evaluate:async fn=>fn.includes('closed:el.playerSheet.hidden')?{closed:false,mayClose:true}:vm.runInNewContext(`(${fn})()`,context),close:async()=>{events.push('close');if(failure==='nativeClose')throw Error('ACTOR_CLOSE_GEOMETRY_BOUND');},pollSettled:async()=>{events.push('settle');return{settled:false};}};
    const result=await actor.cleanupActor(io,{guardOwned:true,observerOwned:true,failed:true,failure:'EOF_BOUND',exportFailure:async()=>{events.push('export');return{saved:true};}});
    assert.deepEqual(result.failures,[failure]);assert.equal(result.confirmed,false);assert.equal(result.globalsCleared,false);assert.equal(result.globalsClearSkipped,true);assert.equal(result.recoveryRefsRetained,true);
    assert.equal(context.window.__q3ActorOwned33.identity,identity);assert.equal(context.window.__q3ActorOwned33.refs,refs);assert.equal(context.window.__q3ActualTarget33,target);assert.equal(context.window.__resumeSwProof,proof);assert.equal(context.window.__q3ActualReplay33,observer);assert.equal(context.window.__q3ActorOwned33.cleanupStarted,true);
    assert.ok(events.indexOf('export')<events.indexOf('stop'));assert.ok(events.indexOf('stop')<events.indexOf('close'));
  }
});
