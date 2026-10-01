'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {summarize}=require('./summarize.cjs');
const source=fs.readFileSync(__dirname+'/observer.function.js','utf8');
const bound=JSON.parse(fs.readFileSync(__dirname+'/binding.json')),continuation=bound.continuation,binding={sourceCommit:bound.sourceCommit,version:bound.version,sourceSHA256:bound.sourceSHA256};
let checks=0;
function fixture(){
 let now=0,frameCallback=null,intervalCallback=null;const timers=new Map(),listeners=new Map(),controller={state:'activated'};let seq=0;
 const eventTarget=()=>({addEventListener(t,f){const key=[this,t];listeners.set(key,f);},removeEventListener(t,f){for(const [k,v] of listeners)if(k[0]===this&&k[1]===t&&v===f)listeners.delete(k);}});
 const document=Object.assign(eventTarget(),{visibilityState:'visible',querySelectorAll:()=>[]}),window=eventTarget();
 const video=Object.assign(eventTarget(),{paused:false,seeking:false,readyState:4,buffered:{length:0},getAttribute:()=>null,
   requestVideoFrameCallback:f=>{frameCallback=f;return ++seq;},cancelVideoFrameCallback:()=>{frameCallback=null;}});
 const files=Array.from({length:10},(_,i)=>({id:'PRIVATE-ID-'+i,name:'PRIVATE-NAME-'+i+'.'+['mp4','webm','ts','mkv'][i%4],mimeType:'video/mp4',size:(i+1)*1024**2}));
 document.querySelectorAll=()=>files.map(f=>({dataset:{fileId:f.id},getBoundingClientRect:()=>({x:0,y:0,top:0,bottom:100,width:100,height:100})}));
 const state={files,selected:null,accountId:'PRIVATE-ACCOUNT',authAccountKey:'PRIVATE-KEY',driveSessionGeneration:1,authStatus:'online',mediaSession:1,mediaAttempt:'idle'};
 const track={contains:x=>x===track,getBoundingClientRect:()=>({left:0,width:1000})},loading={hidden:true},error={hidden:true};
 const env={window,document,navigator:{onLine:true,connection:{effectiveType:'4g',rtt:50,downlink:20}},location:{origin:'https://example.test'},innerHeight:800,
   APP_VERSION:binding.version,state,el:{videoPlayer:video,seekBarContainer:track,mediaLoading:loading,mediaError:error,closePlayerButton:{contains:()=>false}},
   q0Playback:null,q1Playback:null,q1RetirementResult:{settled:true},mediaSourceGeneration:1,mediaSeekWatchdog:null,
   mediaDiagnosticDirectRequestOwners:new Map(),mediaDiagnosticRetiredTraces:new Map(),hasUsableToken:()=>true,isCurrentMediaEvent:()=>state.selected!==null,
   playerTimeline:()=>({duration:100,currentTime:0}),performance:{now:()=>now},
   setInterval:f=>{intervalCallback=f;return 1;},clearInterval:()=>{intervalCallback=null;},setTimeout:(f,ms)=>{const id=++seq;timers.set(id,{f,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
   PerformanceObserver:class{constructor(f){this.cb=f;}observe(){}disconnect(){this.disconnected=true;}}};
 const proof={get:()=>({...binding,controller})};
 const arm=()=>vm.runInNewContext('('+source+')',env)(binding,proof,continuation);
 const dispatch=(type,target,extra={})=>{const e={type,target,isTrusted:true,...extra};for(const [k,f] of [...listeners])if(k[0]===document&&k[1]===type)f(e);};
 const click=(i,trusted=true)=>dispatch('click',{closest:s=>s==='.file-card-open'?{closest:()=>({dataset:{fileId:files[i].id}})}:null},{isTrusted:trusted});
 const tick=(delta=0)=>{now+=delta;intervalCallback?.();};
 const decoded=(time=0)=>{const f=frameCallback;frameCallback=null;f?.(now,{mediaTime:time,presentedFrames:1});};
 const open=i=>{state.selected=files[i];state.mediaSession++;env.q0Playback={};tick(10);};
 const close=()=>{dispatch('keydown',{}, {key:'Escape'});state.selected=null;env.q0Playback=null;env.q1Playback=null;state.mediaAttempt='idle';error.hidden=true;tick(2000);};
 const clean=()=>{assert.equal(listeners.size,0);assert.equal(frameCallback,null);assert.equal(intervalCallback,null);assert.equal(timers.size,0);};
 return {expireRun:()=>[...timers.values()].find(x=>x.at===900000).f(),env,arm,click,open,tick,decoded,close,dispatch,track,video,state,files,clean,proof,read:()=>window.__rc25PerformanceQA.read(),api:()=>window.__rc25PerformanceQA};
}
const cases=[];const check=(name,fn)=>{fn();cases.push({name,passed:true,actualRequests:0});};
function warm(f){for(let j=0;j<2;j++){f.click(0);f.open(0);f.decoded(0);f.tick(100);if(j===0)f.close();}f.video.paused=true;}
function finishPlan(f,censor=false){for(let i=0;i<2;i++){for(let j=0;j<2;j++){f.video.paused=false;f.click(i);f.open(i);if(censor&&i===0){f.video.readyState=0;f.video.duration=NaN;f.state.mediaAttempt='failed';f.env.el.mediaError.hidden=false;f.tick();}else{f.video.readyState=4;f.decoded(0);f.tick(100);}if(j===0)f.close();}f.video.paused=true;if(censor&&i===0)f.api().censorFailedStartupSeek();else{const target=i===0?90:10;f.dispatch('pointerdown',f.track,{clientX:target*10,pointerId:7,pointerType:'mouse',button:0,isPrimary:true});f.tick(10);f.decoded(target);f.tick(100);}f.close();}}
check('six-actions-independent-additional-samples-and-cleanup',()=>{const f=fixture();f.env.fetch=()=>assert.fail('NO_NETWORK');f.arm();assert.equal(f.api().next().sample,9);finishPlan(f);assert.equal(f.api().next(),null);const r=f.api().clear();f.clean();assert.equal(r.schema,'drive-original.rc30-performance-continuation/1');assert.deepEqual([...r.rows.map(x=>x.sample)],[9,9,9,10,10,10]);assert.deepEqual([...r.rows.map(x=>x.kind)],['first-startup','warm-startup','seek90','first-startup','warm-startup','seek10']);assert.equal(r.actualAttemptCount,6);assert.equal(r.complete,true);assert.equal(r.originalPlanRemainsIncomplete,true);assert.equal(r.originalIdentityKnown,false);assert.equal(r.sampleNumbersAreBookkeeping,true);assert(!JSON.stringify(r).includes('PRIVATE'));assert.equal(r.closes.length,4);assert(r.closes.every(x=>x.released));const s=summarize(r);assert.equal(s.requiredOutcomes,6);assert.equal(s.originalPlanRemainsIncomplete,true);assert.equal(s.requestedStartupCount,4);assert.equal(s.requestedSeekCount,2);fs.writeFileSync(__dirname+'/synthetic-six-outcomes.json',JSON.stringify(r,null,2)+'\n');fs.writeFileSync(__dirname+'/synthetic-six-summary.json',JSON.stringify(s,null,2)+'\n');});
check('two-current-rendered-videos-suffice-no-original10-reconstruction',()=>{const f=fixture();f.state.files=f.files.slice(0,2);f.arm();assert.equal(f.api().next().sample,9);finishPlan(f);assert.equal(f.api().clear().complete,true);f.clean();});
check('changed-rendered-metadata-selects-additional-candidates-identity-unknown',()=>{const f=fixture();f.state.files=f.files.slice(6,8);f.arm();f.click(0);assert.equal(f.api().next().active,false);f.click(6);assert.equal(f.api().next().active,true);f.api().clear();f.clean();});
check('wrong-card-and-untrusted-card-cannot-start',()=>{const f=fixture();f.arm();f.click(2);f.click(0,false);assert.equal(f.read().actualAttemptCount,0);assert.equal(f.api().next().active,false);f.api().clear();f.clean();});
check('wrong-seek-ratio-cannot-start',()=>{const f=fixture();f.arm();warm(f);f.dispatch('pointerdown',f.track,{clientX:100});assert.equal(f.api().next().active,false);f.api().clear();f.clean();});
check('wrong-decoded-target-times-out-at15s',()=>{const f=fixture();f.arm();warm(f);f.dispatch('pointerdown',f.track,{clientX:900});f.tick();f.decoded(10);f.tick(15001);assert.equal(f.read().rows[2].code,'TARGET_FRAME_15S_TIMEOUT');assert.equal(f.read().rows[2].decodedTarget,false);f.api().clear();f.clean();});
check('startup-times-out-at30s-retains-failure',()=>{const f=fixture();f.arm();f.click(0);f.open(0);f.tick(30001);assert.equal(f.read().rows[0].code,'INITIAL_30S_TIMEOUT');f.api().clear();f.clean();});
check('source-account-change-stops-and-releases',()=>{const f=fixture();f.arm();f.click(0);f.open(0);f.state.accountId='changed';f.tick();assert.equal(f.read().rows[0].code,'SOURCE_OR_ACCOUNT_CHANGED');assert.equal(f.read().originalPlanRemainsIncomplete,true);f.clean();});
check('controller-proof-change-stops-and-releases',()=>{const f=fixture();f.arm();f.click(0);f.open(0);f.proof.get=()=>({...binding,controller:{}});f.tick();assert.equal(f.read().rows[0].code,'SOURCE_OR_ACCOUNT_CHANGED');f.clean();});
check('run15min-deadline-stays-bounded',()=>{const f=fixture();f.arm();f.expireRun();assert.equal(f.read().done,true);assert.equal(f.read().complete,false);f.clean();});
check('unattempted-seek-cannot-complete-six-actual-actions',()=>{const f=fixture();f.arm();finishPlan(f,true);const r=f.api().clear();assert.equal(r.planComplete,true);assert.equal(r.complete,false);assert.equal(r.actualAttemptCount,5);assert.equal(r.actualSeekAttemptCount,1);assert.equal(r.unattemptedCensoredCount,1);assert(summarize(r).groups.some(x=>x.p95Censored));f.clean();});
check('close-failure-retained',()=>{const f=fixture();f.arm();f.click(0);f.open(0);f.dispatch('keydown',{}, {key:'Escape'});f.tick(2000);assert.equal(f.read().closes[0].released,false);f.api().clear();f.clean();});
for(const mode of ['old-app','wrong-source-hash','wrong-plan','only-one-video'])check(mode+'-admission-rejected',()=>{const f=fixture();if(mode==='old-app')f.env.APP_VERSION='1.22.0-rc.29';if(mode==='wrong-source-hash')f.proof.get=()=>({...binding,sourceSHA256:{...binding.sourceSHA256,'app.js':'0'.repeat(64)},controller:{}});if(mode==='only-one-video')f.state.files=f.files.slice(0,1);assert.throws(()=>vm.runInNewContext('('+source+')',f.env)(binding,f.proof,mode==='wrong-plan'?{...continuation,plan:[]} : continuation),/QA_/);f.clean();});
fs.writeFileSync(__dirname+'/local-verification.json',JSON.stringify({schema:'drive-original.rc30-continuation-local/1',binding,continuation,cases,passed:cases.length,actualRequests:0,actualExecution:false,actualPerformance:false,originalPlanRemainsIncomplete:true,originalIdentityKnown:false},null,2)+'\n');console.log(JSON.stringify({passed:cases.length,actualRequests:0,actualExecution:false}));
