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

const cases=[];
const pointer={pointerId:7,pointerType:'mouse',button:0,isPrimary:true,clientX:100,detail:1};
function readyForSeek(old=false){const f=fixture();f.env.fetch=()=>assert.fail('NO_REQUESTS');if(old){const prior=fs.readFileSync(path.join(base,'../rc29-performance-preparation/observer.function.js'),'utf8');vm.runInNewContext('('+prior+')',f.env)(binding,f.proof);}else f.arm();for(let i=0;i<2;i++){f.click(0);f.open(0);f.decoded(0);f.tick(100);if(i===0)f.close();}f.video.paused=true;return f;}
function down(f,extra={}){f.dispatch('pointerdown',f.track,{...pointer,...extra});f.tick(1);}
function up(f,extra={}){f.dispatch('pointerup',f.track,{...pointer,detail:0,...extra});f.tick(1);}
function click(f,extra={}){f.dispatch('click',f.track,{...pointer,...extra});}
function cleanup(f){f.api().clear();f.clean();assert(!JSON.stringify(f.read()).includes('PRIVATE'));}
{const f=readyForSeek(true);down(f);up(f);f.tick(12.6);click(f);assert.equal(f.read().rows[2].code,'EXTRA_INPUT');cleanup(f);cases.push({name:'frozen-observer-native-order-counterexample',passed:true});}
for(const type of ['mouse','touch','pen']){const f=readyForSeek();down(f,{pointerType:type});up(f,{pointerType:type});f.dispatch('blur',{syntheticElement:true},{},f.env.window);click(f,{pointerType:type,isPrimary:false});assert.equal(f.read().attemptCount,2);f.decoded(10);f.tick(100);assert.equal(f.read().rows[2].code,'TARGET_FRAME');cleanup(f);cases.push({name:type+'-one-matching-down-up-click',passed:true});}
const invalid={
 'missing-up':f=>click(f),
 'window-blur':f=>{up(f);f.dispatch('blur',f.env.window,{},f.env.window);click(f);},
 'separate-down':f=>{down(f);click(f);},
 'duplicate-click':f=>{up(f);click(f);click(f);},
 'double-click-detail':f=>{up(f);click(f,{detail:2});},
 'wrong-click-pointer':f=>{up(f);click(f,{pointerId:8});},
 'wrong-up-pointer':f=>{up(f,{pointerId:8});click(f);},
 'wrong-pointer-type':f=>{up(f);click(f,{pointerType:'pen'});},
 'wrong-click-button':f=>{up(f);click(f,{button:2});},
 'wrong-up-button':f=>{up(f,{button:2});click(f);},
 'wrong-up-ratio':f=>{up(f,{clientX:150});click(f);},
 'wrong-click-ratio':f=>{up(f);click(f,{clientX:150});},
 'wrong-slider':f=>{up(f);const other={contains:x=>x===other,getBoundingClientRect:()=>({left:0,width:1000})};f.env.el.mobileShortsProgressTrack=other;f.dispatch('click',other,pointer);},
 'late-click':f=>{up(f);f.tick(1001);click(f);},
 'cancelled-pointer':f=>{f.dispatch('pointercancel',f.track,pointer);up(f);click(f);},
 'duplicate-up':f=>{up(f);up(f);click(f);},
 'untrusted-up':f=>{up(f,{isTrusted:false});click(f);},
 'untrusted-click-in-between':f=>{up(f);click(f,{isTrusted:false});click(f);},
 'hidden-up':f=>{f.env.document.visibilityState='hidden';up(f);f.env.document.visibilityState='visible';click(f);},
 'hidden-interval':f=>{up(f);f.env.document.visibilityState='hidden';f.dispatch('visibilitychange',{});f.env.document.visibilityState='visible';click(f);},
 'wrong-target-move':f=>{f.dispatch('pointermove',f.track,{...pointer,clientX:150});up(f);click(f);},
 'stale-source':f=>{up(f);f.env.mediaSourceGeneration++;click(f);},
 'changed-player':f=>{up(f);f.env.q1Playback={player:{stats:()=>({})}};click(f);},
 'source-proof-change':f=>{up(f);f.proof.get=()=>({...binding,controller:{}});click(f);},
 'session-change':f=>{up(f);f.state.mediaSession++;click(f);}
};
for(const [name,mutate] of Object.entries(invalid)){const f=readyForSeek();down(f);mutate(f);assert.equal(f.read().attemptCount,3,name);assert.notEqual(f.read().rows[2].code,'TARGET_FRAME',name);assert.match(f.read().rows[2].code,/EXTRA_INPUT|SOURCE_OR_ACCOUNT_CHANGED/,name);cleanup(f);cases.push({name,passed:true});}
{const f=fixture();f.env.fetch=()=>assert.fail('NO_REQUESTS');f.arm();for(let i=0;i<10;i++){for(let j=0;j<2;j++){f.click(i);f.open(i);if(i===1&&j===0)f.tick(30001);else{f.decoded(0);f.tick(100);}if(j===0)f.close();}f.video.paused=true;const x=[10,50,90][i%3]*10;down(f,{clientX:x});up(f,{clientX:x});click(f,{clientX:x});f.decoded(x/10);f.tick(100);f.close();}assert.equal(f.read().attemptCount,30);assert.equal(f.read().rows.filter(r=>r.kind.endsWith('startup')).length,20);assert.equal(f.read().rows.filter(r=>r.kind.startsWith('seek')).length,10);assert.equal(f.read().rows.filter(r=>r.code!=='TARGET_FRAME').length,1);assert.equal(f.read().rows[3].code,'INITIAL_30S_TIMEOUT');cleanup(f);assert(f.read().complete);cases.push({name:'full-30-native-order-attempts-retain-one-failed-start',passed:true});}
const result={schema:'drive-original.rc29-performance-gesture-verification/1',binding,cases,passed:cases.length,actualRequests:0,actualExecution:false,nativeInput:false,scope:'generated trusted event protocol integration; not actual decoded/browser/account evidence'};fs.writeFileSync(path.join(base,'gesture-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:cases.length,actualRequests:0,actualExecution:false}));
