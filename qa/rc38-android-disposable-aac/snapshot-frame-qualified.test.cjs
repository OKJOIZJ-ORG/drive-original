'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{mock,nativeDefaultInventory,tuple}=require('./snapshot-frame-qualified.mock.cjs');
async function pendingPausedFrame({pc=false,frame=.416666,snapshot=.426076}={}){
 const m=mock({pc});await m.install();const h=pc?m.ctx.window.__rc38PcActualAAC:m.ctx.window.__rc38AndroidActualAAC;
 await h.locate();h.open();m.frame();h.captureNative();nativeDefaultInventory(m);m.ctx.el.playerTracksDialog.open=true;m.ctx.el.videoPlayer.currentTime=snapshot;
 h.selectionReady();m.ctx.el.playerAudioTrack.value='3';m.change(!pc);const worker=m.successor();m.ctx.el.playerTracksDialog.open=false;
 const stats={generation:1,mapping:{sourceOrigin:0,sourceEnd:6,targetSource:snapshot,targetElement:snapshot,commonShift:0},outputColorObservation:{basis:'observed-native-frame',colorSpace:tuple}};
 m.ctx.q1Playback.player={stats:()=>stats};m.ctx.state.mediaDecodeVerified=false;m.ctx.state.lastPresentedMediaTime=null;m.advance(12566);m.frame(frame);
 const firstRead=h.read();assert.equal(firstRead.phases[1].first,null);assert.equal(firstRead.phases[1].frames.length,1);assert.equal(firstRead.phases[1].frames[0].good,false);
 return {m,h,worker,stats,owner:m.ctx.q1Playback,settle(){m.ctx.state.mediaDecodeVerified=true;m.ctx.state.lastPresentedMediaTime=frame;},close(){worker.terminate();m.close();assert.equal(Object.values(h.stop()).every(v=>v===true),true);}};
}
for(const pc of [false,true])test((pc?'PC':'Android')+' same paused preceding frame qualifies after app publication within original15s',async()=>{
 const x=await pendingPausedFrame({pc});try{x.m.advance(38);x.settle();const r=x.h.read(),first=r.phases[1].first;
  assert.equal(first.good,true);assert.equal(first.frameCapturedElapsedMs,12566);assert.equal(first.qualificationElapsedMs,12604);assert.equal(first.initialPosition.mappedSourceFrame,.416666);
  assert.equal(first.initialPosition.actualTarget,.426076);assert.equal(r.phases[1].frames.length,1);assert.equal(r.phases[1].frames[0].good,false,'raw first callback is preserved');
  const v=await x.h.verify();assert.equal(v.originalMetadataUnchanged,true);assert.equal(v.tuplePass,true);
 }finally{x.close();}
});
for(const failure of ['future-frame','prior-frame-too-old','stale-source','stale-generation','stale-owner','stale-session','after15s','verified-never-settles','mapped-frame-differs'])test('pending frame refuses '+failure,async()=>{
 const x=await pendingPausedFrame({frame:failure==='future-frame'?.45:failure==='prior-frame-too-old'?.375:.416666});
 try{x.m.advance(failure==='after15s'?2435:38);if(failure!=='verified-never-settles')x.settle();
  if(failure==='stale-source')x.m.ctx.mediaSourceGeneration++;
  if(failure==='stale-generation')x.stats.generation=2;
  if(failure==='stale-owner')x.m.ctx.q1Playback={...x.m.ctx.q1Playback};
  if(failure==='stale-session')x.m.ctx.state.mediaSession++;
  if(failure==='mapped-frame-differs')x.m.ctx.state.lastPresentedMediaTime=.375;
  assert.equal(x.h.read().phases[1].first,null);await assert.rejects(x.h.verify(),/AAC_VERIFY_/);
  if(['stale-source','stale-generation','stale-owner','stale-session'].includes(failure)){
   // Returning to the old labels cannot revive a frame discarded after drift.
   if(failure==='stale-source')x.m.ctx.mediaSourceGeneration--;
   if(failure==='stale-generation')x.stats.generation=1;
   if(failure==='stale-owner')x.m.ctx.q1Playback=x.owner;
   if(failure==='stale-session')x.m.ctx.state.mediaSession--;
   assert.equal(x.h.read().phases[1].first,null);
  }
 }finally{x.close();}
});
// Expected targets are independent fixed examples, rather than calling the
// implementation's target resolver. The frozen input is the mock's Q0 clock.
const cases=[
 {name:'origin0 positive paused snapshot',snapshot:.5,origin:0,end:6,target:.5,frame:.5,pass:true},
 {name:'nonzero origin retains normalized snapshot',snapshot:.75,origin:10,end:16,target:10.75,frame:.75,pass:true},
 {name:'clamped endpoint keeps positive input',snapshot:7,origin:10,end:16,target:15.999999,frame:5.999999,pass:true},
 {name:'bootstrap zero is rejected despite valid tuple',snapshot:.5,origin:0,end:6,target:0,frame:0,pass:false},
 {name:'second generation cannot qualify matching target',snapshot:.5,origin:0,end:6,target:.5,frame:.5,generation:2,pass:false},
 {name:'extra bound worker cannot qualify',snapshot:.5,origin:0,end:6,target:.5,frame:.5,extra:true,pass:false},
 {name:'frame beyond one original24fps interval cannot qualify',snapshot:.5,origin:0,end:6,target:.5,frame:.6,pass:false}
];
for(const c of cases)test(c.name,async()=>{const m=mock();await m.install();const h=m.ctx.window.__rc38AndroidActualAAC;await h.locate();h.open();m.frame();h.captureNative();nativeDefaultInventory(m);m.ctx.el.playerTracksDialog.open=true;m.ctx.el.videoPlayer.currentTime=c.snapshot;
 const armed=h.selectionReady();assert.equal(armed.snapshotTime,c.snapshot);m.ctx.el.playerAudioTrack.value='3';m.change(true);const worker=m.successor();m.ctx.el.playerTracksDialog.open=false;m.ctx.el.playerAudioTrack.value='3';m.ctx.state.lastPresentedMediaTime=c.frame;
 m.ctx.q1Playback.player={stats:()=>({generation:c.generation??1,mapping:{sourceOrigin:c.origin,sourceEnd:c.end,targetSource:c.target,targetElement:c.target-c.origin,commonShift:c.origin},outputColorObservation:{basis:'observed-native-frame',colorSpace:tuple}})};
 let extra;if(c.extra){extra=new m.ctx.window.Worker('/media/general-worker.mjs');extra.postMessage({kind:'start',generation:1,identity:{...m.metadata}});}
 m.frame(c.frame);const r=h.read();assert.equal(r.initialPosition.expectedTarget,c.name.startsWith('clamped')?15.999999:c.origin+c.snapshot);assert.equal(r.initialPosition.snapshotTime,c.snapshot);assert.equal(r.initialPosition.passed,c.pass);assert.equal(r.phases[1].frames.at(-1).good,c.pass);
 if(c.pass){const v=await h.verify();assert.equal(v.initialPosition.passed,true);assert.equal(v.originalMetadataUnchanged,true);assert.equal(v.tuplePass,true);}else await assert.rejects(h.verify(),/AAC_VERIFY_/);
 worker.terminate();extra?.terminate();m.close();assert.equal(Object.values(h.stop()).every(v=>v===true),true);});
test('snapshot must be positive and position stable before native input',async()=>{const m=mock();await m.install();const h=m.ctx.window.__rc38AndroidActualAAC;await h.locate();h.open();m.frame();h.captureNative();nativeDefaultInventory(m);m.ctx.el.playerTracksDialog.open=true;m.ctx.el.videoPlayer.currentTime=0;assert.throws(()=>h.selectionReady(),/POSITIVE_PAUSED_SNAPSHOT_REQUIRED/);
 m.ctx.el.videoPlayer.currentTime=.5;h.selectionReady();assert.equal(h.preInputCheck().snapshotPositionStable,true);m.ctx.el.videoPlayer.currentTime=.6;assert.throws(()=>h.preInputCheck(),/SNAPSHOT_PREINPUT_DRIFT/);m.close();h.stop();});
for(const drift of [false,true])test('PC controlled untrusted change3 '+(drift?'rejects captured-position drift':'qualifies exact positive paused snapshot'),async()=>{const m=mock({pc:true});await m.install();const h=m.ctx.window.__rc38PcActualAAC;assert.equal(m.ctx.window.__rc38AndroidActualAAC,undefined);await h.locate();h.open();m.frame();h.captureNative();nativeDefaultInventory(m);m.ctx.el.playerTracksDialog.open=true;m.ctx.el.videoPlayer.currentTime=.5;
 assert.equal(h.selectionReady().snapshotTime,.5);h.preInputCheck();if(drift)m.ctx.el.videoPlayer.currentTime=.6;m.ctx.el.playerAudioTrack.value='3';m.change(false);const worker=m.successor();m.ctx.el.playerTracksDialog.open=false;m.ctx.el.playerAudioTrack.value='3';m.ctx.state.lastPresentedMediaTime=.5;
 m.ctx.q1Playback.player={stats:()=>({generation:1,mapping:{sourceOrigin:0,sourceEnd:6,targetSource:.5,targetElement:.5,commonShift:0},outputColorObservation:{basis:'observed-native-frame',colorSpace:tuple}})};m.frame(.5);const r=h.read();assert.equal(r.physicalNativeInput,false);assert.equal(r.trustedAAC3Change,false);assert.equal(r.controlledPCSelection,!drift);assert.equal(r.phases[1].frames.at(-1).good,!drift);
 if(drift)await assert.rejects(h.verify(),/AAC_VERIFY_/);else{const result=await h.verify();assert.equal(result.controlledPCSelection,true);assert.equal(result.trustedAAC3Change,false);assert.equal(result.physicalNativeInput,false);assert.equal(result.initialPosition.passed,true);assert.equal(result.tuplePass,true);}worker.terminate();m.close();assert.equal(Object.values(h.stop()).every(v=>v===true),true);});
