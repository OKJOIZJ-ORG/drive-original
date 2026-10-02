'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fn=fs.readFileSync(path.join(__dirname,'android-observer-lifecycle-v3.function.js'),'utf8');
function fixture(){let time=0,interval=null,callback=null,listeners=0;const id='android-tracks-SYNTHETIC',owner={};
 const v={currentTime:2,readyState:4,paused:true,videoWidth:640,videoHeight:360,error:null,hasAttribute:()=>false,requestVideoFrameCallback:f=>(callback=f,1),cancelVideoFrameCallback:()=>{callback=null;},addEventListener:()=>listeners++,removeEventListener:()=>listeners--,getVideoPlaybackQuality:()=>({totalVideoFrames:12})};
 const stats={generation:1,mapping:{commonShift:.2,sourceOrigin:.2},pipeline:{selectedAudioTrackId:3}};
 const cue={startTime:0,endTime:4.8,text:'SYNTHETIC SUBTITLE'};
 const swListeners=new Set();const serviceWorker={controller:{state:'activated'},addEventListener(_,fn){swListeners.add(fn);},removeEventListener(_,fn){swListeners.delete(fn);}};
 const context={navigator:{serviceWorker},window:{__androidTracksMockOwned:true},location:{origin:'http://127.0.0.1:9999'},APP_VERSION:'1.22.0-rc.35',document:{visibilityState:'visible'},innerWidth:824,innerHeight:1191,devicePixelRatio:2.125,
 state:{authAccountKey:'android-tracks-synthetic-account',driveSessionGeneration:1,selected:{id},mediaSession:1,mediaBlobUrl:null},mediaSourceGeneration:1,q0Playback:null,q1RetirementResult:{settled:true},playerTracksRetirementResult:{settled:true},
 q1Playback:{kind:'general',controller:{signal:{aborted:false}},selectedAudioTrackId:3,player:{stats:()=>stats,sourceTime:()=>v.currentTime+.2}},
 playerTracksOwner:{current:()=>true,selectedAudioTrackId:3,inventory:{audioTracks:[{trackId:2,codec:'aac',route:'q1'},{trackId:3,codec:'aac',route:'q1'}]},subtitles:{selectedTrackId:4,tracks:[{trackId:4,supported:true}]}},
 playerSubtitleTextTrack:{mode:'showing',cues:[cue],activeCues:[cue]},el:{videoPlayer:v,playerTracksDialog:{open:true},playerAudioTrack:{value:'3'},playerSubtitleTrack:{value:'4'},playerSheet:{hidden:false}},
 getActiveMediaElement:()=>v,isCurrentMediaEvent:x=>x===v,playerTimeline:()=>({currentTime:v.currentTime,duration:6}),Date:{now:()=>time},setInterval:f=>(interval=f,1),clearInterval:()=>{interval=null;}};
 vm.createContext(context);vm.runInContext('('+fn+')('+JSON.stringify({origin:context.location.origin,version:context.APP_VERSION,fixtureId:id})+')',context);const api=context.window.__androidTracksObserver;
 return{api,context,v,stats,cue,present:t=>{const f=callback;callback=null;f?.(0,{mediaTime:t,width:640,height:360});},advance:ms=>{time+=ms;interval?.();},listeners:()=>listeners,swListenerCount:()=>swListeners.size,controllerChanged:()=>{for(const fn of swListeners)fn();}};
}
test('presented clock uses original absolute mapping, and pre-input generation is rejected',()=>{
 const f=fixture();f.api.arm('seek2',{target:2,requireAdvance:true,requireAudio3:true});f.present(2);assert.equal(f.api.read().phases[0].first,null);
 f.stats.generation=2;f.present(2);const r=f.api.read();assert.equal(r.phases[0].first.clock,2);assert.equal(r.latest.absoluteSourceTime,2.2);assert.ok(Math.abs(r.latest.clockShift+.2)<.000001);assert.equal(r.latest.pipelineSelectedAudio,3);f.api.stop();
});
test('file/account/aborted current native owner drift rejects target frames',()=>{
 for(const kind of ['file','account','abort']){const f=fixture();f.api.arm('audio3',{target:2,requireAudio3:true});if(kind==='file')f.context.state.selected={id:'OTHER'};if(kind==='account')f.context.state.driveSessionGeneration=2;if(kind==='abort')f.context.q1Playback.controller.signal.aborted=true;f.present(2);assert.equal(f.api.read().phases[0].first,null);f.api.stop();}
});
test('numeric/null/cue booleans export no fixture identifier/text and bound frames/samples',()=>{
 const f=fixture();f.api.arm('startup',{target:2});for(let i=0;i<100;i++){f.present(2);f.api.read();}const r=f.api.read();assert.equal(r.phases[0].frames.length,32);assert.equal(r.phases[0].samples.length,64);const text=JSON.stringify(r);assert.equal(text.includes('android-tracks-SYNTHETIC'),false);assert.equal(text.includes('SYNTHETIC SUBTITLE'),false);assert.equal(r.latest.activeCues[0].syntheticText,true);f.api.stop();
});
test('180s observer expiry removes RVFC/listeners/timer and admits no further phase',()=>{
 const f=fixture();f.api.arm('startup');f.advance(180001);assert.equal(f.api.read().disposed,true);assert.equal(f.listeners(),0);assert.throws(()=>f.api.arm('seek2'),/PHASE_ADMISSION/);assert.equal(f.api.stop().stopped,true);
});

test('sanctioned diagnostic sink exports fixed reasons/status only and restores itself',()=>{const f=fixture();const sink=f.context.window.__driveOriginalMediaTraceSink;sink({stage:'q1-failed',reason:'Q1_SOURCE_READ_FAILED',status:502,terminal:true,url:'PRIVATE URL',fileId:'PRIVATE ID'});sink({stage:'q1-failed',reason:'GENERAL_UNEXPECTED_PRIVATE',status:Infinity});sink({stage:'PRIVATE_STAGE',reason:'PRIVATE'});const r=f.api.read();assert.equal(r.diagnostics.length,2);assert.equal(r.diagnostics[0].reason,'Q1_SOURCE_READ_FAILED');assert.equal(r.diagnostics[0].status,502);assert.equal(r.diagnostics[1].reason,'UNKNOWN');assert.equal(r.diagnostics[1].status,null);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);f.api.stop();assert.equal(f.context.window.__driveOriginalMediaTraceSink,undefined);});

test('replacement controller and worker-update-required are explicit fixed receipts',()=>{const f=fixture();f.context.state.mediaAttempt='worker-update-required';f.context.navigator.serviceWorker.controller={state:'activated'};const r=f.api.read();assert.equal(r.latest.controllerSameInitial,false);assert.equal(r.latest.attempt,'worker-update-required');for(let i=0;i<20;i++)f.controllerChanged();assert.equal(f.api.read().controllerEvents.length,16);f.api.stop();assert.equal(f.swListenerCount(),0);});
