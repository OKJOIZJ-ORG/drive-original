'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {summarize}=require('./summarize.cjs');
const source=fs.readFileSync(__dirname+'/observer.function.js','utf8');
const binding={version:'1.22.0-rc.25',sourceCommit:'a'.repeat(40),sourceSHA256:Object.fromEntries(['app.js','sw.js','version.json'].map(k=>[k,'b'.repeat(64)]))};
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
 const arm=()=>vm.runInNewContext('('+source+')',env)(binding,proof);
 const dispatch=(type,target,extra={})=>{const e={type,target,isTrusted:true,...extra};for(const [k,f] of [...listeners])if(k[0]===document&&k[1]===type)f(e);};
 const click=(i,trusted=true)=>dispatch('click',{closest:s=>s==='.file-card-open'?{closest:()=>({dataset:{fileId:files[i].id}})}:null},{isTrusted:trusted});
 const tick=(delta=0)=>{now+=delta;intervalCallback?.();};
 const decoded=(time=0)=>{const f=frameCallback;frameCallback=null;f?.(now,{mediaTime:time,presentedFrames:1});};
 const open=i=>{state.selected=files[i];state.mediaSession++;env.q0Playback={};tick(10);};
 const close=()=>{dispatch('keydown',{}, {key:'Escape'});state.selected=null;env.q0Playback=null;env.q1Playback=null;state.mediaAttempt='idle';error.hidden=true;tick(2000);};
 const clean=()=>{assert.equal(listeners.size,0);assert.equal(frameCallback,null);assert.equal(intervalCallback,null);assert.equal(timers.size,0);};
 return {env,arm,click,open,tick,decoded,close,dispatch,track,video,state,files,clean,proof,read:()=>window.__rc25PerformanceQA.read(),api:()=>window.__rc25PerformanceQA};
}
{
 const f=fixture();f.arm();f.click(0,false);f.tick(31000);assert.equal(f.read().attemptCount,0);f.click(1);assert.equal(f.api().next().active,false);f.api().clear();f.clean();checks++;
}
{
 const f=fixture();f.arm();f.click(0);f.open(0);f.tick(20);f.decoded(0);assert.equal(f.read().attemptCount,0,'frame followed by separate settlement tick');f.tick(100);
 assert.equal(f.read().rows[0].code,'TARGET_FRAME');assert.equal(f.read().rows[0].firstFrameMs,30);f.close();assert.equal(f.read().closes[0].released,true);
 f.api().clear();f.clean();assert(!JSON.stringify(f.read()).includes('PRIVATE'));checks++;
}
{
 const f=fixture();f.arm();f.click(0);f.open(0);f.video.currentTime=50;f.tick(30001);assert.equal(f.read().rows[0].code,'INITIAL_30S_TIMEOUT');assert.equal(f.read().rows[0].decodedTarget,false);f.api().clear();f.clean();checks++;
}
{
 const f=fixture();f.arm();f.click(0);f.open(0);f.video.error={code:3,message:'PRIVATE-URL'};f.tick();assert.equal(f.read().rows[0].code,'MEDIA_FAILED');assert(!JSON.stringify(f.read()).includes('PRIVATE'));f.api().clear();f.clean();checks++;
}
{
 const f=fixture();f.arm();f.click(0);f.open(0);f.env.state.accountId='different';f.tick();assert.equal(f.read().rows[0].code,'SOURCE_OR_ACCOUNT_CHANGED');f.clean();checks++;
}
function readyForSeek(){const f=fixture();f.arm();for(let i=0;i<2;i++){f.click(0);f.open(0);f.decoded(0);f.tick();if(i===0)f.close();}f.video.paused=true;return f;}
{
 const f=readyForSeek();f.dispatch('pointerdown',f.track,{clientX:100});f.tick();f.decoded(50);f.tick(15001);assert.equal(f.read().rows[2].code,'TARGET_FRAME_15S_TIMEOUT');f.api().clear();f.clean();checks++;
}
{
 const f=readyForSeek();let s={generation:1,status:{level:'Q2'},mapping:{commonShift:7,sourceOrigin:2,targetSource:12},appends:1};f.env.q1Playback={kind:'general',player:{stats:()=>s}};
 f.dispatch('pointerdown',f.track,{clientX:100});s={...s,generation:2};f.tick(20);f.decoded(5);f.tick(100);
 assert.equal(f.read().rows[2].code,'TARGET_FRAME');assert.equal(f.read().rows[2].route,'Q2');assert.equal(f.read().rows[2].decodedSourceRelativeTime,10);f.api().clear();f.clean();checks++;
}
{
 const f=readyForSeek();let s={generation:1,target:10};f.env.q1Playback={kind:'ts',player:{stats:()=>s}};f.dispatch('pointerdown',f.track,{clientX:100});f.tick();f.decoded(10);f.tick(15001);
 assert.equal(f.read().rows[2].code,'TARGET_FRAME_15S_TIMEOUT','old same-target generation cannot pass');f.api().clear();f.clean();checks++;
}
{
 const f=fixture();f.arm();f.click(0);f.open(0);f.close();f.env.q0Playback={};f.click(0);f.open(0);f.dispatch('keydown',{}, {key:'Escape'});f.tick(2000);
 assert.equal(f.read().closes.at(-1).released,false);f.api().clear();f.clean();checks++;
}
{
 const rows=Array.from({length:20},(_,i)=>({route:'Q0',kind:'seek10',cache:'current-owner',code:i===19?'TARGET_FRAME_15S_TIMEOUT':'TARGET_FRAME',firstFrameMs:2000}));
 const r={schema:'drive-original.rc25-performance-passive/1',rows,closes:[],binding,complete:true,observerReleased:true,limitations:[]};
 const v=summarize(r);assert.equal(v.groups[0].failures,1);assert.equal(v.groups[0].empiricalP95IncludingFailuresMs,2000);
 rows[18].code='MEDIA_FAILED';const censored=summarize(r);assert.equal(censored.groups[0].p95Censored,true);assert.equal(censored.groups[0].targetAssessment,'EXCEEDS_OR_CENSORED');checks++;
}
{
 const f=fixture();f.arm();for(let i=0;i<10;i++){
   for(let j=0;j<2;j++){f.click(i);f.open(i);if(i===1&&j===0){f.tick(30001);}else{f.decoded(0);f.tick(100);}if(j===0)f.close();}
   f.video.paused=true;const target=[10,50,90][i%3];f.dispatch('pointerdown',f.track,{clientX:target*10});f.tick(10);f.decoded(target);f.tick(100);f.close();
 }
 assert.equal(f.read().attemptCount,30);assert.equal(f.read().rows.filter(x=>x.kind.endsWith('startup')).length,20);
 assert.equal(f.read().rows.filter(x=>x.kind.startsWith('seek')).length,10);f.api().clear();f.clean();assert.equal(f.read().complete,true);
 assert.equal(summarize(f.read()).groups.reduce((n,g)=>n+g.failures,0),1);assert(!JSON.stringify(f.read()).includes('PRIVATE'));checks++;
}
console.log(JSON.stringify({checks,passed:true,scope:'local observer discriminators; no browser/account/device/performance results'}));
