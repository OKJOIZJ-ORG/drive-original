'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const actor = require('./android-q3-eof-actor.cjs');
const base = require('./android-q3-actor.cjs');
const source = fs.readFileSync(require('node:path').join(__dirname,'eof-observer.function.js'),'utf8');
const binding={version:'1.22.0-rc.33',sourceCommit:'5174485b3c17d047259701bbdd889f9b0740f555',fixture:{duration:180,fps:30}};
function fixture() {
  let wall=0,next=0;const callbacks=new Map(),listeners=new Map(),timers=new Map();
  const metrics={decoded:5400,encoded:5400,closed:true,outputBytes:1000000,peakHeapBytes:16777216},worker={terminated:true,activeReads:0,pendingChunks:0,pendingWindows:0,invalidMessages:0,chunks:180,acks:180};
  const stats={generation:1,phase:'ready',appends:12,removals:1,waits:2,peakAhead:30,disposed:false,mapping:{sourceOrigin:0,sourceEnd:180,commonShift:0,targetSource:0,targetElement:0},status:{level:'Q3',video:'lossy-transformed',bitPerfectVideo:false,audio:'absent'}};
  const rail={dataset:{mode:'range'},hidden:false,getBoundingClientRect:()=>({width:200,height:20})},text={...rail,parentElement:rail,textContent:'호환 변환 · 영상 손실 압축'};
  const video={loop:false,paused:false,ended:false,currentTime:0,duration:180,playbackRate:1,readyState:4,videoWidth:640,videoHeight:360,
    requestVideoFrameCallback:fn=>{callbacks.set(++next,fn);return next;},cancelVideoFrameCallback:id=>callbacks.delete(id),
    addEventListener:(name,fn)=>{listeners.set(name,fn);},removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);},
    getVideoPlaybackQuality:()=>({totalVideoFrames:Math.min(5400,Math.floor(video.currentTime*30)+1),droppedVideoFrames:2,corruptedVideoFrames:0})};
  class FakeDate extends Date { constructor(...args){super(...(args.length?args:[1700000000000+wall]));}static now(){return 1700000000000+wall;} }
  const ownership={mayClose:true,sourceSame:true,accountSame:true,targetSame:true,visible:true};
  const context={window:{},performance:{now:()=>wall},Date:FakeDate,getActiveMediaElement:()=>video,isCurrentMediaEvent:v=>v===video,q1Playback:{kind:'general',player:{stats:()=>stats},controller:{signal:{aborted:false}}},mediaSourceGeneration:7,state:{mediaSession:1,mediaPlaybackMode:'q3',mediaTransportVerified:true},PLAYBACK_MODE:{VIDEO_COMPATIBILITY:'q3'},el:{streamModeLabel:rail,streamModeText:text},getComputedStyle:()=>({display:'block',visibility:'visible'}),setInterval:fn=>{timers.set(++next,fn);return next;},clearInterval:id=>timers.delete(id)};
  const install=vm.runInNewContext(source,context),admission=install(binding,()=>({...ownership})),api=context.window.__q3ActualEof33;
  const frame=(time,at)=>{wall=at;video.currentTime=time;const [id,fn]=callbacks.entries().next().value;callbacks.delete(id);fn(at,{mediaTime:time,width:640,height:360,presentedFrames:Math.round(time*30)+1});};
  const tick=()=>{for(const fn of timers.values())fn();};
  const full=(rate=1,start=0)=>{for(let i=start;i<5400;i++){frame(i/30,13000+i*1000/30/rate);if(i%30===0)tick();}stats.phase='buffered-to-end';stats.worker=worker;stats.pipeline={generation:1,targetTime:0,duration:180,sourceCodec:'mp4v.20.1',status:stats.status,metrics,cleanup:{settled:true},reads:{requests:280,bytes:19000000,inFlight:0}};wall=13000+180000/rate;video.currentTime=180;video.ended=true;video.paused=true;};
  const ended=(trusted=true)=>listeners.get('ended')?.({type:'ended',isTrusted:trusted,target:video});
  return{context,ownership,stats,metrics,worker,video,rail,api,admission,frame,tick,full,ended,listeners,callbacks,timers,setWall:at=>{wall=at;}};
}
test('real terminal contract plus trusted current-owner native EOF and180s1x observed frames qualifies with bounded retention',()=>{
  const f=fixture();const live=f.api.read();assert.equal(live.progress.appends,12);assert.equal(live.progress.pipelineTerminalAvailable,false);assert.equal(live.progress.decodedDuringProcessing,'UNKNOWN');f.full();assert.equal(f.api.read().qualified,false);f.ended();const r=f.api.read();
  assert.equal(r.qualified,true);assert.equal(r.firstFrame.sourceTime,0);assert.equal(r.lastFrame.sourceTime,179.96666666666667);assert.equal(r.frameCount,5400);assert.equal(r.realTime1x,true);assert.equal(r.finalWindowFrames,150);
  assert.equal(r.sourceCompletion.admittedSourceProgramComplete,true);assert.equal(r.sourceCompletion.workerComplete,true);assert.equal(r.sourceCompletion.literalSourceByteOffsetAtFileSize,'UNKNOWN');
  assert.equal(r.progress.phase,'buffered-to-end');assert.equal(r.progress.pipelineTerminalAvailable,true);assert.equal(r.progress.workerTerminalAvailable,true);
  assert.ok(r.firstFrames.length<=8);assert.ok(r.checkpoints.length<=64);assert.equal(r.tailFrames.length,128);assert.ok(r.samples.length<=300);assert.ok(r.events.length<=64);
  assert.equal(r.nativeQuality.last.totalVideoFrames,5400);assert.equal(r.nativeQuality.last.droppedVideoFrames,2);assert.equal(r.nativeQuality.last.corruptedVideoFrames,0);assert.equal(r.fullOutputQuality,'NOT_QUALIFIED');
  const cleanup=f.api.stop();assert.equal(cleanup.removed,true);assert.equal(f.listeners.size,0);assert.equal(f.callbacks.size,0);assert.equal(f.timers.size,0);
});
test('plausible source/worker finished flags, partial packets, failed cleanup and untrusted EOF never replace actual terminal fields',()=>{
  for(const mutate of [f=>{f.metrics.decoded=5399;},f=>{f.metrics.encoded=5399;},f=>{f.stats.pipeline.cleanup.settled=false;},f=>{f.worker.terminated=false;f.worker.status='finished';},f=>{f.worker.pendingChunks=1;},f=>{f.stats.pipeline.targetTime=90;},f=>{f.stats.phase='ready';f.stats.bootstrap={sourceOffset:18075476,sourceSize:18075476,finished:true};}]){
    const f=fixture();f.full();mutate(f);f.ended();assert.equal(f.api.read().qualified,false);f.api.stop();
  }
  const f=fixture();f.full();f.ended(false);assert.equal(f.api.read().qualified,false);f.api.stop();
});
test('acceleration, source-clock jump, rate mutation, hidden/account drift and current-owner replacement are retained failures',()=>{
  const fast=fixture();fast.full(2);fast.ended();assert.equal(fast.api.read().qualified,false);assert.equal(fast.api.read().realTime1x,false);fast.api.stop();
  for(const [mutate,flag] of [[f=>{f.video.playbackRate=2;},'rateFailure'],[f=>{f.ownership.visible=false;},'fenceFailure'],[f=>{f.ownership.accountSame=false;},'fenceFailure'],[f=>{f.context.mediaSourceGeneration++;},'ownerChanged'],[f=>{f.video.loop=true;},'loopFailure']]){const f=fixture();f.frame(0,13000);mutate(f);f.frame(1/30,13034);f.full(1,2);f.ended();assert.equal(f.api.read().qualified,false);assert.equal(f.api.read().failures[flag],true);f.api.stop();}
});
test('unavailable native quality counters stay unavailable and no quality threshold is fabricated',()=>{
  const f=fixture();delete f.video.getVideoPlaybackQuality;f.full();f.ended();const r=f.api.read();assert.equal(r.qualified,true);assert.equal(r.nativeQuality.current.available,false);assert.equal(r.nativeQuality.deltaTotalVideoFrames,null);assert.equal(r.nativeRetainedHeap,'UNKNOWN');f.api.stop();
});
test('EOF self-registration uses a separate admission and retains cleanup ownership',async()=>{
  const context={window:{__q3ActorOwned33:{refs:{},cleanupStarted:false}}};
  const expression=actor.eofAdmission("(function(){window.__q3ActualEof33={read:()=>({realApi:true}),stop:()=>({removed:true})};return{installed:true};})",binding);
  const fn=vm.runInNewContext(`(${expression})`,context);await fn();assert.equal(context.window.__q3ActualEof33.read().realApi,true);assert.equal(context.window.__q3ActorEofAdmission33.installed,true);assert.equal(context.window.__q3ActorOwned33.refs.__q3ActualEof33,context.window.__q3ActualEof33);await assert.rejects(fn(),/EOF_HELPER_OWNERSHIP/);
});
test('plan and pinned local preparation perform no private read/device/browser/provider command and contain no seek/cancel unit',()=>{
  const p=actor.plan('local-eof-tests');assert.equal(p.actualOperationPerformed,false);assert.equal(p.actionDeadlineMs,300000);assert.equal(p.cleanupDeadlineMs,345000);assert.equal(p.screenshotsPlanned,0);assert.match(p.resourceCommand,/resource-watch\.cjs --execute android .* 350$/);
  const text=fs.readFileSync(__dirname+'/android-q3-eof-actor.cjs','utf8');assert.doesNotMatch(text,/arm\('seek|arm\('cancel|tap\('pause|currentTime\s*=(?!=)|playbackRate\s*=(?!=)|dispatchEvent|\.play\(/);
  assert.throws(()=>actor.names('../escape'),/NEW_SAFE_LABEL_REQUIRED/);
});
test('resource readiness is mandatory before native admission and an absent sampler leaves product untouched',async()=>{
  let nativeTouched=false;const c={report:{},step:()=>{},unmaskNativeVisibility:async()=>{nativeTouched=true;},adb:()=>{nativeTouched=true;}};
  await assert.rejects(actor.run(c,{output:{resource:'unused'},binding:{}},{progress:()=>{},resourceReady:()=>{throw Error('FRESH_RESOURCE_WATCHER_READY_REQUIRED');}}),/FRESH_RESOURCE_WATCHER_READY_REQUIRED/);assert.equal(nativeTouched,false);
});
test('native close waits for asynchronously revealed fresh geometry and uses only that exact hit',async()=>{
  let clock=0,revealedAt=null;const reads=[],inputs=[];
  const geometry=(kind)=>{reads.push([kind,clock]);return{width:824,height:1191,dpr:2.125,screenWidth:1752,screenHeight:2800,ownershipCurrent:true,available:kind==='entry'||revealedAt!==null&&clock-revealedAt>=600,exactHit:true,quantizedHit:true,x:kind==='entry'?412:780,y:kind==='entry'?1161.35:1100};};
  const io={geometry:async kind=>geometry(kind),tap:async(kind,g)=>{base.physicalPoint(g);inputs.push({kind,clock,x:g.x});if(kind==='entry')revealedAt=clock;},wait:async ms=>{clock+=ms;}};
  await base.closeOwnedNative(io,{now:()=>clock,deadline:2000});
  assert.deepEqual(inputs,[{kind:'entry',clock:0,x:412},{kind:'close',clock:600,x:780}]);assert.ok(reads.filter(([kind])=>kind==='close').length>=4);
  const text=fs.readFileSync(__dirname+'/android-q3-eof-actor.cjs','utf8');assert.match(text,/const close = \(\) => base\.closeOwnedNative/);
});
test('occluded close stays bounded and account switch after entry causes no close input',async()=>{
  for(const switched of [false,true]) {
    let clock=0;const inputs=[],g={width:824,height:1191,dpr:2.125,screenWidth:1752,screenHeight:2800,exactHit:true,quantizedHit:true,x:412,y:1161.35};
    const io={geometry:async kind=>({...g,ownershipCurrent:!(switched&&clock>=200),available:kind==='entry'}),tap:async kind=>inputs.push(kind),wait:async ms=>{clock+=ms;}};
    await assert.rejects(base.closeOwnedNative(io,{now:()=>clock,deadline:1000}),switched?/ACTOR_CLOSE_OWNERSHIP_CHANGED/:/ACTOR_CLOSE_GEOMETRY_BOUND/);
    assert.deepEqual(inputs,['entry']);assert.ok(clock<=1000);
  }
  let tapped=false;
  await assert.rejects(base.closeOwnedNative({geometry:async()=>({width:824,height:1191,dpr:2.125,screenWidth:1752,screenHeight:2800,exactHit:true,quantizedHit:true,x:412,y:1161.35,ownershipCurrent:true,available:true}),tap:async()=>{tapped=true;},wait:async()=>{}},{now:()=>0,deadline:1000,inputBudgetMs:20000}),/ACTOR_CLOSE_INPUT_BUDGET/);
  assert.equal(tapped,false);
});
