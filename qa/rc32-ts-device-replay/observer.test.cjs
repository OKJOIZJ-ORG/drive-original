'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{TextDecoder}=require('node:util');
const gate=require('./binding-gate.cjs'),binding={version:gate.VERSION,sourceCommit:gate.COMMIT,sourceSHA256:{'app.js':'a'.repeat(64)}};
const source='('+fs.readFileSync(path.join(__dirname,'observer.function.js'),'utf8')+')('+JSON.stringify(binding)+')';
function jsonBody(value){let sent=false;return{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{value:Buffer.from(JSON.stringify(value)),done:false}),releaseLock(){},cancel:async()=>{}})};}
function fixture(){
 let now=100000,interval,frame=null,cancelled=0,listenerCount=0;
 const privateToken='DO_NOT_EXPORT_PRIVATE_FIXTURE',target={id:privateToken,name:privateToken,size:'100',mimeType:'video/test',modifiedTime:'2026-10-01',parents:[privateToken],version:'9',headRevisionId:privateToken,sha256Checksum:privateToken};
 const video={buffered:{length:1,start:()=>0,end:()=>100},currentTime:0,duration:100,paused:false,ended:false,seeking:false,readyState:4,videoWidth:360,videoHeight:640,
  requestVideoFrameCallback:fn=>(frame=fn,1),cancelVideoFrameCallback:()=>{frame=null;cancelled++;},
  addEventListener:()=>listenerCount++,removeEventListener:()=>listenerCount--,getVideoPlaybackQuality:()=>({totalVideoFrames:50,droppedVideoFrames:0})};
 const controller={state:'activated'},stats={generation:1,phase:'ready',target:0,duration:100,appends:3,frames:2,lastMediaTime:0};
 const context={window:{__resumeReplayTarget30:{metadata:target,savedSubset:{},accountId:privateToken,authAccountKey:privateToken},__resumeSwProof:{get:()=>({controller,sourceCommit:binding.sourceCommit,version:binding.version,sourceSHA256:binding.sourceSHA256})}},
  navigator:{serviceWorker:{controller}},APP_VERSION:binding.version,state:{selected:null,accountId:privateToken,authAccountKey:privateToken,authStatus:'online',mediaSession:1,authGeneration:7,driveSessionGeneration:9},document:{visibilityState:'visible'},
  el:{playerSheet:{hidden:true},mediaLoadingText:{hidden:true,getBoundingClientRect:()=>({height:0})}},q1Playback:{kind:'ts',controller:{signal:{aborted:false}},player:{stats:()=>stats}},q0Playback:null,
  mediaSourceGeneration:1,mediaSeekGeneration:0,mediaSeekSettledGeneration:0,mediaSeekWatchdog:null,getActiveMediaElement:()=>video,isCurrentMediaEvent:v=>v===video,
  getComputedStyle:()=>({display:'none',visibility:'hidden'}),Date:{now:()=>now},setInterval:fn=>(interval=fn,1),clearInterval:()=>{interval=null;},setTimeout:()=>1,clearTimeout:()=>{},AbortController,TextDecoder,Uint8Array,
  DRIVE_API:'https://fixture.invalid',driveFetch:async()=>({ok:true,status:200,headers:{get:()=>null},body:jsonBody({...target,trashed:false,capabilities:{canDownload:true}})})};
 vm.createContext(context);const installed=vm.runInContext(source,context),api=context.window.__rc32TsReplay;
 return {context,target,video,stats,installed,api,advance:ms=>{now+=ms;interval?.();},present:mediaTime=>{const fn=frame;frame=null;fn?.(0,{mediaTime,width:360,height:640,presentedFrames:10});},counts:()=>({cancelled,listenerCount})};
}
test('private target never exported; proof binding and before/after canonical metadata qualify',async()=>{
 const f=fixture();assert.equal(f.installed.sourceSame,true);await f.api.metadata('before');await f.api.metadata('after');
 assert.equal(f.api.read().metadataResults.every(x=>x.sameExactTarget&&x.stableMetadataSame&&x.freshRevisionChecksumSame),true);
 assert.equal(JSON.stringify(f.api.read()).includes(f.target.id),false);await assert.rejects(f.api.metadata('after'),/METADATA_BOUND/);f.api.stop();
});
test('seek wrong presented time fails15; correct35 diagnostic remains separate',()=>{
 const f=fixture();f.context.state.selected=f.target;f.api.arm('seek50',{targetSeconds:50,toleranceSeconds:.5});f.present(0);f.advance(15100);
 assert.equal(f.api.read().phases[0].deadline15.passed,false);f.advance(17000);f.stats.generation=2;f.present(50.1);
 const phase=f.api.read().phases[0];assert.equal(phase.firstTargetFrame.elapsedMs,32100);assert.equal(phase.deadline15.passed,false);f.api.stop();
});
test('exact private ID mismatch cannot qualify even with correct native time',()=>{
 const f=fixture();f.context.state.selected={...f.target,id:'different'};f.api.arm('startup',{targetSeconds:0});f.present(0);
 const p=f.api.read().phases[0];assert.equal(p.firstTargetFrame,null);assert.equal(p.fenceFailure,true);f.api.stop();
});
test('account/controller/visible/source drift each blocks target qualification',()=>{
 for(const kind of ['account','controller','visible','source']){const f=fixture();f.context.state.selected=f.target;f.api.arm('startup',{targetSeconds:0});
  if(kind==='account')f.context.state.accountId='other';if(kind==='controller')f.context.navigator.serviceWorker.controller={state:'activated'};
  if(kind==='visible')f.context.document.visibilityState='hidden';if(kind==='source')f.context.APP_VERSION='changed';
  f.present(0);assert.equal(f.api.read().phases[0].firstTargetFrame,null);f.api.stop();}
});
test('aborted or nonready Q1 generation cannot qualify; expected seek generation replacement can',()=>{
 const f=fixture();f.context.state.selected=f.target;f.api.arm('seek50',{targetSeconds:50});f.stats.phase='opening';f.present(50);assert.equal(f.api.read().phases[0].firstTargetFrame,null);
 f.stats.phase='ready';f.context.q1Playback.controller.signal.aborted=true;f.present(50);assert.equal(f.api.read().phases[0].firstTargetFrame,null);
 f.context.q1Playback.controller.signal.aborted=false;f.stats.generation=2;f.present(50);assert.equal(f.api.read().phases[0].firstTargetFrame.generation,2);f.api.stop();
});
test('end clock and buffer alone never claim actual EOF or exact last frame',()=>{
 const f=fixture();f.context.state.selected=f.target;f.video.currentTime=100;f.api.arm('nearEOF',{targetSeconds:99});f.stats.generation=2;f.present(99);
 const eof=f.api.read().eof;assert.equal(eof.nativeEnded,false);assert.equal(eof.q1Ended,false);assert.equal(eof.exactFinalFrame,'UNKNOWN');assert.equal(eof.finalWindowPresented,1);f.api.stop();
});
test('callbacks/events/phases are bounded and stop removes owned listeners/frame/timer',()=>{
 const f=fixture();f.context.state.selected=f.target;f.api.arm('startup');for(let i=0;i<150;i++)f.present(0);
 assert.equal(f.api.read().phases[0].frames.length,96);assert.equal(f.api.read().phases[0].presentedCount,150);
 f.advance(360000);assert.equal(f.api.read().disposed,true);assert.equal(f.counts().listenerCount,0);assert.ok(f.counts().cancelled>0);
 assert.throws(()=>f.api.arm('reopen'),/REPLAY_ARM/);assert.equal(f.api.stop().disposed,true);
});
test('actual fresh metadata mutation is retained as false and no raw values',async()=>{
 const f=fixture();f.context.driveFetch=async()=>({ok:true,status:200,headers:{get:()=>null},body:jsonBody({...f.target,headRevisionId:'changed',trashed:false,capabilities:{canDownload:true}})});
 assert.equal((await f.api.metadata('before')).freshRevisionChecksumSame,false);assert.equal(JSON.stringify(f.api.read()).includes('changed'),false);f.api.stop();
});
test('preinput seek frame at exact target cannot qualify before owner generation advances',()=>{
 const f=fixture();f.context.state.selected=f.target;f.api.arm('seek50',{targetSeconds:50});f.present(50);
 assert.equal(f.api.read().phases[0].firstTargetFrame,null);assert.equal(f.api.read().phases[0].frames[0].generationAdvanced,false);
 f.stats.generation=2;f.present(50);assert.equal(f.api.read().phases[0].firstTargetFrame.generation,2);f.api.stop();
});
test('public Q1 presented clock mapping is compared in source-relative seconds',()=>{
 const f=fixture();f.context.state.selected=f.target;f.context.q1Playback.kind='ts';f.stats.mapping={commonShift:110,sourceOrigin:100};
 f.api.arm('seek50',{targetSeconds:50,toleranceSeconds:.25});f.stats.generation=2;f.present(40);
 const frame=f.api.read().phases[0].firstTargetFrame;assert.equal(frame.mediaTime,40);assert.equal(frame.sourceTime,50);assert.equal(frame.distanceSeconds,0);f.api.stop();
});
test('nullable live metrics become numeric only on captured generation disposal',()=>{
 const f=fixture();f.context.state.selected=f.target;f.api.arm('startup');f.present(0);
 let r=f.api.captureMetrics('preclose-eof');assert.equal(r.owners.length,1);assert.equal(r.owners[0].values.cacheHits,null);assert.equal(r.owners[0].values.probeRetainedBytes,null);assert.equal(r.owners[0].ownerBeforeClose.nativeOwnerCurrent,true);
 f.stats.source={readsStarted:6,readsCompleted:5,metadataRequests:12,rangeRequests:4,receivedBytes:1234,releasedBytes:1234,cacheHits:2,cacheBytes:1048288,logicalReturnedBytes:1049522};
 f.stats.probeRetention={retainedBytes:0,peakRetainedBytes:1048288,maxRetainedBytes:2097152};f.stats.disposed=true;f.context.q1Playback=null;f.context.state.selected=null;
 r=f.api.captureMetrics('postclose-eof');assert.equal(r.owners[0].currentOwner,false);assert.equal(r.owners[0].disposed,true);assert.equal(r.owners[0].values.cacheHits,2);assert.equal(r.owners[0].values.probeRetainedBytes,0);assert.equal(JSON.stringify(r).includes(f.target.id),false);f.api.stop();assert.equal(f.api.captureMetrics('cleanup').owners.length,0);
});
test('stale state generation has nullable stats and cannot promote new seek frame',()=>{
 const f=fixture();f.context.state.selected=f.target;f.api.arm('startup');f.present(0);f.stats.source={cacheHits:8};f.stats.generation=2;
 const r=f.api.captureMetrics('live');assert.equal(r.owners[0].sameStateGeneration,false);assert.equal(r.owners[0].values.cacheHits,null);f.api.stop();
});
test('account-generation drift blocks frame and metrics admission',()=>{
 for(const key of ['authGeneration','driveSessionGeneration']){const f=fixture();f.context.state.selected=f.target;f.context.state[key]++;f.api.arm('startup');f.present(0);assert.equal(f.api.read().phases[0].firstTargetFrame,null);assert.equal(f.api.captureMetrics().owners.length,0);f.api.stop();}
});
test('metadata consumes at most1MiB and cancels excessive reader without raw output',async()=>{
 const f=fixture();let canceled=false;f.context.driveFetch=async()=>({ok:true,status:200,headers:{get:()=>null},body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(1048577)}),cancel:async()=>{canceled=true;},releaseLock(){}})}});
 await assert.rejects(f.api.metadata('before'),/METADATA_READ/);assert.equal(canceled,true);f.api.stop();
});
test('public stats owners cap at6 and overflow is explicit, without throwing in timer',()=>{
 const f=fixture();f.context.state.selected=f.target;f.api.arm('startup');
 for(let i=0;i<8;i++){const s={generation:i+1,phase:'ready'};f.context.q1Playback={kind:'ts',controller:{signal:{aborted:false}},player:{stats:()=>s}};f.api.read();}
 const r=f.api.captureMetrics();assert.equal(r.owners.length,6);assert.equal(r.ownerOverflow,true);f.api.stop();
});
test('Q0 startup cannot qualify TS frame and EOF with stale account is never qualified',()=>{
 const f=fixture();f.context.state.selected=f.target;f.api.arm('startup');f.context.q1Playback.kind='general';f.present(0);assert.equal(f.api.read().phases[0].firstTargetFrame,null);
 f.context.q1Playback.kind='ts';f.present(0);assert.equal(f.api.read().phases[0].firstTargetFrame.route,'Q1_TS');f.video.ended=true;f.stats.phase='ended';assert.equal(f.api.read().eof.currentOwnerQualified,true);
 f.context.state.authAccountKey='OTHER';assert.equal(f.api.read().eof.currentOwnerQualified,false);f.api.stop();
});
