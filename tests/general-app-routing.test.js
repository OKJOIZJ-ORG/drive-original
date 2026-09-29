'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
// Reuse the app VM fixture without executing its existing tests.
const fixtureModule={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'app.test.js'),'utf8').split('\ntest(')[0]+'\nmodule.exports=loadAppContext;', {require,__dirname,module:fixtureModule,AbortController,Blob,DOMException,Headers,Map,Math,Promise,Response,Set,URL,URLSearchParams,clearInterval,clearTimeout,console,fetch,performance,setInterval,setTimeout});
const run=(c,s)=>vm.runInContext(s,c);
function gate(){const c=fixtureModule.exports(),events=new Set(),requests=[],ports=[],deadlines=[];
 c.MessageChannel=class{constructor(){const p={onmessage:null,closed:false,close(){this.closed=true;}};this.port1=p;this.port2={reply:data=>p.onmessage?.({data}),close(){}};ports.push(p);}};
 const worker=()=>({postMessage(data,[port]){requests.push({data,port,worker:this});}});
 c.navigator.serviceWorker={controller:worker(),addEventListener:(n,f)=>events.add(f),removeEventListener:(n,f)=>events.delete(f)};
 c.setTimeout=f=>(deadlines.push(f),deadlines.length);c.clearTimeout=()=>{};
 run(c,"state.selected={id:'f'};state.mediaSession=3;state.authAccountKey='a';state.driveSessionGeneration=2;globalThis.ready=0;globalThis.errors=0;showMediaLoading=()=>{};showMediaError=()=>errors++;startOriginalRangePlayback=()=>ready++;");
 const begin=()=>run(c,"waitForQ0Control(state.selected,'video',3,'prepare')");
 const reply=(r,patch={})=>r.port.reply({...r.data,type:'Q0_CAPABILITY_RESPONSE',capable:true,...patch});
 return {c,events,requests,ports,deadlines,worker,begin,reply};
}
test('old controller cannot authorize native bytes; replacement needs exact correlated capability',()=>{const f=gate();f.begin();f.begin();assert.equal(f.requests.length,1);assert.equal(f.deadlines.length,1);f.reply(f.requests[0],{requestId:'wrong'});assert.equal(f.c.ready,0);f.c.navigator.serviceWorker.controller=f.worker();for(const fn of [...f.events])fn();assert.equal(f.requests.length,2);assert.equal(f.ports[0].closed,true);f.reply(f.requests[0]);assert.equal(f.c.ready,0);f.reply(f.requests[1]);assert.equal(f.c.ready,1);assert.equal(f.events.size,0);assert.equal(f.ports[1].closed,true);});
for(const change of ["state.authAccountKey='b'","state.driveSessionGeneration++","state.mediaSession++","mediaSourceGeneration++","q0ControlWait.controller.abort()"])
test('capability cannot resume stale owner: '+change,()=>{const f=gate();f.begin();run(f.c,change);f.reply(f.requests[0]);assert.equal(f.c.ready,0);assert.equal(f.events.size,0);});
test('capability timeout stays client-update failure without native or retry',()=>{const f=gate();f.begin();f.deadlines[0]();f.reply(f.requests[0]);assert.equal(f.c.ready,0);assert.equal(f.c.errors,1);assert.equal(run(f.c,'state.mediaAttempt'),'failed');assert.equal(f.events.size,0);});
test('general source clock drives movie time, seek, and original endpoint independent of MSE tail',()=>{const c=fixtureModule.exports();run(c,`globalThis.targets=[];el.videoPlayer={hidden:false,currentTime:8.4,duration:20,paused:true,dataset:{mediaSession:'0'}};state.mediaAttempt='q1';q1Playback={kind:'general',player:{stats:()=>({mapping:{sourceOrigin:5,sourceEnd:11,commonShift:2}}),sourceTime:()=>10.4,seek:(t)=>{targets.push(t);return Promise.resolve();}}};isCurrentMediaEvent=()=>true;`);const t=run(c,'playerTimeline()');assert.equal(t.duration,6);assert.ok(Math.abs(t.currentTime-5.4)<1e-9);run(c,'setPlayerCurrentTime(el.videoPlayer,2)');assert.equal(c.targets[0],7);run(c,'setPlayerCurrentTime(el.videoPlayer,100)');assert.ok(c.targets[1]<11&&c.targets[1]>10.999);assert.equal(run(c,"getPlaybackQualityLabel(PLAYBACK_MODE.AUDIO_COMPATIBILITY,true)"),'영상 원본 · 음성 호환 변환');});
for(const [name,change,expected] of [
 ['observed code4 with verified original and retained pin','',1],
 ['offline', 'navigator.onLine=false',0],
 ['classified provider error','state.lastProxyError={status:403}',0],
 ['network media code','el.videoPlayer.error.code=2',0],
 ['unverified transport','state.mediaTransportVerified=false',0],
 ['missing retained pin','q0PinnedSource=null',0],
 ['waiting for SW capability',"state.mediaAttempt='range-preparing'",0]
])test('general route admission: '+name,async()=>{const c=fixtureModule.exports();c.window.setTimeout=fn=>setTimeout(fn,0);run(c,`globalThis.routes=0;state.selected={id:'f',mimeType:'video/mp4'};state.mediaAttempt='range-retry';state.mediaRetryCount=1;state.mediaTransportVerified=true;state.mediaPlaybackMode=PLAYBACK_MODE.RANGE;q0PinnedSource={};el.videoPlayer={getAttribute:()=>'/native',error:{code:4}};clearMediaSeekWatchdog=clearMediaFrameWatchdog=emitMediaDiagnosticStage=showMediaError=()=>{};hasUsableToken=()=>true;classifyMediaProxyFailure=()=> 'permission';tryOriginalTsPlayback=async(f,s,o)=>{if(o.general)routes++;return true;};showDrivePreview=()=>{};offerOriginalBufferFallback=async()=>{};describeVideoPlaybackFailure=()=>'';${change}`);await run(c,"handleMediaElementError('video')");assert.equal(c.routes,expected);});

function pinnedProbeFixture({iso=false, probeFailure=false,probeCode=null,bytes=null}={}) {
 const c=fixtureModule.exports();c.queueMicrotask=queueMicrotask;
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/\r\n/g,'\n');
 // Keep the real planner/owner/barrier logic; replace only dynamic module loading
 // because this VM fixture intentionally has no module-loader callback.
 const planner=app.slice(app.indexOf('async function planPinnedOriginalAudio('),app.indexOf('\nasync function tryOriginalTsPlayback('))
  .replace("await Promise.all([\n      import('./media/drive-source.mjs'), import('./media/audio-general-pipeline.mjs')])",'await Promise.all([fakeSourceModule, fakeProbeModule])');
 let readStarted,releaseRead,abortStarted,releaseAbort,rejectAbort;
 const reading=new Promise(r=>{readStarted=r;}),aborting=new Promise(r=>{abortStarted=r;});
 const read=new Promise(r=>{releaseRead=r;}),cleanup=new Promise((r,j)=>{releaseAbort=r;rejectAbort=j;});
 const size=String(bytes?.length||100);
 c.fakeSourceModule={openDriveQ1Source:async()=>({identity:{headRevisionId:'A',size,mimeType:'video/mp4',modifiedTime:'A',sha256Checksum:null},
  read:async({start,end})=>{if(bytes&&(start!==0||end!==11))return new Uint8Array(bytes.subarray(start,end+1));readStarted();return read;},abort:async()=>{abortStarted();return cleanup;}})};
 c.fakeProbeModule={probePinnedGeneralAudio:async()=>{if(probeFailure)throw Object.assign(new Error('GENERAL_PROBE_CLEANUP_UNSETTLED'),{cleanup:{settled:false}});if(probeCode)throw new Error(probeCode);return {route:'native'};}};
 run(c,planner);
 run(c,`state.selected={id:'f',mimeType:'video/mp4'};state.mediaSession=3;state.authAccountKey='a';state.driveSessionGeneration=2;
  el.videoPlayer={hidden:false};navigator.serviceWorker={controller:{}};confirmQ1WorkerRetirement=async()=>true;
  globalThis.probeFailures=0;globalThis.probeClears=0;state.mediaAttempt='range';
  showMediaError=()=>probeFailures++;clearDirectMediaSources=()=>probeClears++;emitMediaDiagnosticStage=()=>{};
  globalThis.probeOwner=beginQ0Playback(state.selected,state.mediaSession);
  handleQ0PinMessage({source:navigator.serviceWorker.controller,ports:[{postMessage(){},close(){}}]},
   {type:'Q0_PIN_REQUEST',mode:'bind',protocol:DriveRevisionPin.PROTOCOL,requestId:'fixture',clientId:'client',
    fileId:'f',sourceGeneration:mediaSourceGeneration,context:q0OwnerContext(probeOwner,'client'),
    pin:{protocol:DriveRevisionPin.PROTOCOL,partialDownloadAllowed:true,uri:'https://www.googleapis.com/drive/v3/files/f/revisions/A?alt=media',
     descriptor:{fileId:'f',accountKey:'a',accountGeneration:2,headRevisionId:'A',size:'${size}',mimeType:'video/mp4',modifiedTime:'A',sha256Checksum:null,
      canDownload:true,trashed:false,canReadRevisions:null,resourceKey:null}}});`);
 return {c,reading,aborting,releaseAbort,rejectAbort,releaseRead:()=>releaseRead(bytes?new Uint8Array(bytes.subarray(0,12)):iso?new Uint8Array([0,0,0,12,102,116,121,112,0,0,0,0]):new Uint8Array(12))};
}

for(const change of ["mediaSourceGeneration++","state.authAccountKey='b'","state.driveSessionGeneration++","navigator.serviceWorker.controller={}"])
test('Q0 retirement joins stale audio probe and keeps unsettled source sticky: '+change,async()=>{
 const f=pinnedProbeFixture();await f.reading;run(f.c,change);
 const retirement=run(f.c,'retireQ0Playback()');let resolved=false;retirement.then(()=>{resolved=true;});
 f.releaseRead();await f.aborting;for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(resolved,false,'retirement cannot resolve while the probe abort is pending');
 f.releaseAbort({settled:false});assert.equal((await retirement).settled,false);
 assert.equal(run(f.c,'probeOwner.cleanupOk'),false);
 const next=run(f.c,"retireQ1Playback({controller:new AbortController(),setupDone:Promise.resolve(),cleanupOk:true})");
 assert.equal((await next).settled,false,'a clean next owner cannot erase uncertain prior probe cleanup');
});

test('Q0 retirement joins a settled skipped non-ISO probe without a false sticky failure',async()=>{
 const f=pinnedProbeFixture();await f.reading;const retirement=run(f.c,'retireQ0Playback()');
 f.releaseRead();await f.aborting;f.releaseAbort({settled:true});assert.equal((await retirement).settled,true);
});

test('current ISO audio probe cleanup failure marks its owner before retirement',async()=>{
 const f=pinnedProbeFixture({iso:true,probeFailure:true});await f.reading;f.releaseRead();await f.aborting;
 f.releaseAbort({settled:true});await run(f.c,'probeOwner.setupDone');
 assert.equal(run(f.c,'probeOwner.cleanupOk'),false);
 assert.equal((await run(f.c,'retireQ0Playback()')).settled,false);
});

test('rejected stale probe abort fails retirement without an unhandled setup rejection',async()=>{
 const f=pinnedProbeFixture();await f.reading;const retirement=run(f.c,'retireQ0Playback()');
 f.releaseRead();await f.aborting;f.rejectAbort(new Error('synthetic abort rejection'));
 await run(f.c,'probeOwner.setupDone');assert.equal((await retirement).settled,false);
});

for(const settled of [true,false])test('current non-ISO probe keeps exact abort outcome: '+settled,async()=>{
 const f=pinnedProbeFixture();await f.reading;f.releaseRead();await f.aborting;f.releaseAbort({settled});
 await run(f.c,'probeOwner.setupDone');assert.equal((await run(f.c,'retireQ0Playback()')).settled,settled);
});

for(const code of ['GENERAL_EXPANDED_INDEX_LIMIT','GENERAL_TABLE_ENTRIES_LIMIT','GENERAL_BOX_COUNT',
 'GENERAL_DISCOVERY_LIMIT','GENERAL_PACKET_LIMIT','GENERAL_METADATA_LIMIT','GENERAL_INPUT_SPAN_LIMIT'])
test('settled optional Q2 budget preserves native Q0: '+code,async()=>{
 const f=pinnedProbeFixture({iso:true,probeCode:code});await f.reading;f.releaseRead();await f.aborting;f.releaseAbort({settled:true});
 await run(f.c,'probeOwner.setupDone');assert.equal(run(f.c,'state.mediaAttempt'),'range');
 assert.equal(f.c.probeFailures,0);assert.equal(f.c.probeClears,0);assert.equal((await run(f.c,'retireQ0Playback()')).settled,true);
});

for(const code of ['GENERAL_BOX_BOUNDS','GENERAL_BOX_HEADER','GENERAL_TABLE_BOUNDS','GENERAL_READ_BODY',
 'GENERAL_READ_TIMEOUT','GENERAL_READ_QUEUE_LIMIT','GENERAL_CANCELLED','Q1_SOURCE_CONTENT_DRIFT',
 'Q1_SOURCE_PERMISSION','AUDIO_NATIVE_GATE_UNAVAILABLE'])
test('settled probe transport/content/malformed failures still stop Q0: '+code,async()=>{
 const f=pinnedProbeFixture({iso:true,probeCode:code});await f.reading;f.releaseRead();await f.aborting;f.releaseAbort({settled:true});
 await run(f.c,'probeOwner.setupDone');assert.equal(run(f.c,'state.mediaAttempt'),'failed');
 assert.equal(f.c.probeFailures,1);assert.equal(f.c.probeClears,1);
});

test('Q2 index budget with unsettled source abort remains terminal and sticky',async()=>{
 const f=pinnedProbeFixture({iso:true,probeCode:'GENERAL_EXPANDED_INDEX_LIMIT'});await f.reading;f.releaseRead();await f.aborting;f.releaseAbort({settled:false});
 await run(f.c,'probeOwner.setupDone');assert.equal(run(f.c,'state.mediaAttempt'),'failed');
 assert.equal(f.c.probeFailures,1);assert.equal((await run(f.c,'retireQ0Playback()')).settled,false);
});

for(const pendingApi of ['AudioDecoder','AudioEncoder'])test('actual audio capability cancellation joins app owner drain: '+pendingApi,async()=>{
 const {probePinnedGeneralAudio}=await import('../media/audio-general-pipeline.mjs');
 const bytes=fs.readFileSync(path.join(__dirname,'../qa/q2-audio-compatibility/synthetic-avc-ac3.mp4'));
 const f=pinnedProbeFixture({bytes});let started,outputCalls=0;
 const querying=new Promise(r=>{started=r;});
 const scope={document:{createElement:()=>({canPlayType:()=>''})},
  AudioDecoder:{isConfigSupported:async()=>({supported:false})},
  AudioEncoder:{isConfigSupported:async()=>{outputCalls++;return{supported:true};}},MediaSource:{isTypeSupported:()=>true}};
 scope[pendingApi]={isConfigSupported:()=>{started();return new Promise(()=>{});}};
 f.c.fakeProbeModule={probePinnedGeneralAudio:(source,options)=>probePinnedGeneralAudio(source,{...options,scope})};
 await f.reading;f.releaseRead();await querying;
 const retirement=run(f.c,'retireQ0Playback()');await f.aborting;f.releaseAbort({settled:true});
 assert.equal((await retirement).settled,true);assert.equal(run(f.c,'q1RetirementResult.settled'),true);
 assert.equal(f.c.probeFailures,0);assert.equal(outputCalls,0);
});
