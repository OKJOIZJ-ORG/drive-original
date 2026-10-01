'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=__dirname,binding=JSON.parse(fs.readFileSync(path.join(base,'binding.json'))),source=fs.readFileSync(path.join(base,'observer.function.js'),'utf8');
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
 const arm=()=>vm.runInNewContext('('+source+')',env)(binding,proof);
 const dispatch=(type,target,extra={},node=document)=>{const e={type,target,isTrusted:true,...extra};for(const [k,f] of [...listeners])if(k[0]===node&&k[1]===type)f(e);};
 const click=(i,trusted=true)=>dispatch('click',{closest:s=>s==='.file-card-open'?{closest:()=>({dataset:{fileId:files[i].id}})}:null},{isTrusted:trusted});
 const tick=(delta=0)=>{now+=delta;intervalCallback?.();};
 const decoded=(time=0)=>{const f=frameCallback;frameCallback=null;f?.(now,{mediaTime:time,presentedFrames:1});};
 const open=i=>{state.selected=files[i];state.mediaSession++;env.q0Playback={};tick(10);};
 const close=()=>{dispatch('keydown',{}, {key:'Escape'});state.selected=null;env.q0Playback=null;env.q1Playback=null;state.mediaAttempt='idle';error.hidden=true;tick(2000);};
 const clean=()=>{assert.equal(listeners.size,0);assert.equal(frameCallback,null);assert.equal(intervalCallback,null);assert.equal(timers.size,0);};
 return {env,arm,click,open,tick,decoded,close,dispatch,track,video,state,files,clean,proof,read:()=>window.__rc25PerformanceQA.read(),api:()=>window.__rc25PerformanceQA};
}


const {summarize}=require('./summarize.cjs');const cases=[];
const p={pointerId:3,pointerType:'mouse',button:0,isPrimary:true,detail:1};
function normalStartup(f,i){f.video.readyState=4;f.video.duration=100;f.video.error=null;f.video.paused=false;f.env.el.mediaError.hidden=true;f.state.mediaAttempt='idle';f.click(i);f.open(i);}
function failedWarm(f,i=4){for(let j=0;j<2;j++){normalStartup(f,i);f.video.readyState=0;f.video.duration=NaN;f.video.error={code:3};f.env.el.mediaError.hidden=false;f.state.mediaAttempt='failed';f.tick(1);if(j===0)f.close();}}
function normalPair(f,i){for(let j=0;j<2;j++){normalStartup(f,i);f.decoded(0);f.tick(100);if(j===0)f.close();}}
function seek(f,i){f.video.paused=true;const target=[10,50,90][i%3];f.dispatch('pointerdown',f.track,{...p,clientX:target*10});f.tick(1);f.dispatch('pointerup',f.track,{...p,clientX:target*10});f.dispatch('click',f.track,{...p,isPrimary:false,clientX:target*10});f.decoded(target);f.tick(100);}
function ready(){const f=fixture();f.env.fetch=()=>assert.fail('NO_NETWORK');f.arm();for(let i=0;i<4;i++){normalPair(f,i);seek(f,i);f.close();}failedWarm(f);return f;}
function cleanup(f){f.api().clear();f.clean();assert(!JSON.stringify(f.read()).includes('PRIVATE'));}
{const f=ready();assert.equal(f.read().outcomeCount,14);const before=f.read().actualAttemptCount,r=f.api().censorFailedStartupSeek();assert.equal(r.code,'UNATTEMPTED_FAILED_STARTUP');assert.equal(f.read().outcomeCount,15);assert.equal(f.read().actualAttemptCount,before);const row=f.read().rows[14];assert.equal(row.attempt,null);assert.equal(row.actualAttempt,false);assert.equal(row.decodedTarget,false);assert.equal(row.firstFrameMs,null);assert.equal(row.elapsedMs,null);assert.equal(row.kind,'seek50');assert.throws(()=>f.api().censorFailedStartupSeek(),/QA_CENSOR_PREFLIGHT/);cleanup(f);cases.push({name:'annotate-current-failed-warm-seek-without-attempt-or-frame',passed:true});}
const invalid={
 'error-hidden':f=>{f.env.el.mediaError.hidden=true;},
 'attempt-not-failed':f=>{f.state.mediaAttempt='idle';},
 'native-ready':f=>{f.video.readyState=1;},
 'seekable-duration':f=>{f.video.duration=100;},
 'wrong-selected-file':f=>{f.state.selected=f.files[5];},
 'changed-media-session':f=>{f.state.mediaSession++;},
 'changed-source-generation':f=>{f.env.mediaSourceGeneration++;},
 'changed-source-player':f=>{f.env.q1Playback={player:{stats:()=>({})}};},
 'hidden-document':f=>{f.env.document.visibilityState='hidden';},
 'auth-offline':f=>{f.state.authStatus='offline';},
 'token-unavailable':f=>{f.env.hasUsableToken=()=>false;},
 'changed-account':f=>{f.state.accountId='different';},
 'changed-controller':f=>{f.proof.get=()=>({...binding,controller:{}});},
 'old-version-proof':f=>{const prior=f.proof.get();f.proof.get=()=>({...prior,version:'1.22.0-rc.28'});},
 'wrong-proof-hash':f=>{const prior=f.proof.get();f.proof.get=()=>({...prior,sourceSHA256:{...binding.sourceSHA256,'app.js':'0'.repeat(64)}});},
 'another-trusted-input':f=>{f.dispatch('click',{});},
 'seek-measurement-already-active':f=>{f.video.paused=true;f.dispatch('pointerdown',f.track,{...p,clientX:500});}
};
for(const [name,mutate] of Object.entries(invalid)){const f=ready(),count=f.read().outcomeCount;mutate(f);assert.throws(()=>f.api().censorFailedStartupSeek(),/QA_CENSOR_PREFLIGHT/,name);assert.equal(f.read().outcomeCount,count,name);cleanup(f);cases.push({name,passed:true});}
{const f=fixture();f.arm();assert.throws(()=>f.api().censorFailedStartupSeek(),/QA_CENSOR_PREFLIGHT/);assert.equal(f.read().outcomeCount,0);cleanup(f);cases.push({name:'no-prior-failure-or-planned-seek',passed:true});}
{const f=fixture();f.arm();normalStartup(f,0);f.video.readyState=0;f.video.duration=NaN;f.video.error={code:3};f.env.el.mediaError.hidden=false;f.state.mediaAttempt='failed';f.tick(1);assert.equal(f.read().rows[0].code,'MEDIA_FAILED');assert.throws(()=>f.api().censorFailedStartupSeek(),/QA_CENSOR_PREFLIGHT/);assert.equal(f.read().outcomeCount,1);cleanup(f);cases.push({name:'first-startup-failure-cannot-skip-required-warm-attempt',passed:true});}
{const f=fixture();f.arm();normalStartup(f,0);f.decoded(0);f.tick(100);f.close();normalStartup(f,0);f.decoded(0);f.video.readyState=0;f.video.duration=NaN;f.video.error={code:3};f.env.el.mediaError.hidden=false;f.state.mediaAttempt='failed';f.tick(1);assert.equal(f.read().rows[1].code,'MEDIA_FAILED');assert.equal(f.read().rows[1].decodedTarget,true);assert.throws(()=>f.api().censorFailedStartupSeek(),/QA_CENSOR_PREFLIGHT/);assert.equal(f.read().outcomeCount,2);cleanup(f);cases.push({name:'failed-warm-startup-with-an-observed-frame-cannot-be-censored-as-no-media',passed:true});}
{const f=ready();f.api().clear();assert.throws(()=>f.api().censorFailedStartupSeek(),/QA_CENSOR_PREFLIGHT/);f.clean();cases.push({name:'released-observer-cannot-annotate',passed:true});}
{const f=fixture();f.arm();for(let i=0;i<10;i++){if(i===4){failedWarm(f,i);f.api().censorFailedStartupSeek();}else{normalPair(f,i);seek(f,i);}f.close();}f.api().clear();f.clean();const result=f.read(),s=summarize(result);assert.equal(result.outcomeCount,30);assert.equal(result.actualAttemptCount,29);assert.equal(result.attemptCount,29);assert.equal(result.requestedSeekCount,10);assert.equal(result.actualSeekAttemptCount,9);assert.equal(result.actualStartupAttemptCount,20);assert.equal(result.unattemptedCensoredCount,1);assert(result.planComplete);assert.equal(result.complete,false);assert.equal(s.outcomeCount,30);assert.equal(s.actualAttemptCount,29);assert.equal(s.actualSeekAttemptCount,9);assert.equal(s.groups.reduce((n,g)=>n+g.failures,0),2);assert.equal(s.groups.reduce((n,g)=>n+g.unattemptedCensoredCount,0),1);const g=s.groups.find(g=>g.unattemptedCensoredCount===1);assert(g.p95Censored);assert.equal(g.empiricalP95IncludingFailuresMs,null);assert.equal(g.group,'Q0/seek50/current-owner');assert.equal(g.actualAttemptCount,2);assert.equal(g.outcomeCount,3);assert(!JSON.stringify(result).includes('PRIVATE'));fs.writeFileSync(path.join(base,'synthetic-30-outcomes.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(base,'synthetic-30-summary.json'),JSON.stringify(s,null,2)+'\n');cases.push({name:'30-planned-outcomes-29-real-attempts-9of10-seeks-no-complete-p95-censored',passed:true});}
const record={schema:'drive-original.rc29-performance-censor-verification/1',binding,cases,passed:cases.length,actualAccount:false,actualPerformance:false,actualRequests:0};fs.writeFileSync(path.join(base,'censor-verification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({passed:cases.length,actualRequests:0,actualPerformance:false}));
