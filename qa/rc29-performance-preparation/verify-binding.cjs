'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync,spawnSync}=require('node:child_process');
const base=__dirname,old=path.resolve(base,'../rc28-performance-preparation'),root=path.resolve(base,'../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const binding=JSON.parse(fs.readFileSync(path.join(base,'binding.json'))),source=fs.readFileSync(path.join(base,'observer.function.js'),'utf8'),expression=fs.readFileSync(path.join(base,'observer.expression.js'),'utf8');
const fixed='10f1dd2ee9550866933e693dbf41c62e1fb2daad',version='1.22.0-rc.29';assert.equal(binding.sourceCommit,fixed);assert.equal(binding.version,version);
for(const p of ['app.js','sw.js','version.json'])assert.equal(hash(execFileSync('git',['show',fixed+':'+p],{cwd:root})),binding.sourceSHA256[p]);
const unchanged={};for(const p of ['observer.function.js','summarize.cjs','verify.cjs']){const b=fs.readFileSync(path.join(base,p));assert.equal(hash(b),hash(fs.readFileSync(path.join(old,p))));unchanged[p]=hash(b);}
const priorRecordBytes=fs.readFileSync(path.join(old,'local-verification.json')),priorRecord=JSON.parse(priorRecordBytes);assert.equal(priorRecord.prior11.reusedPassed,11);assert.equal(priorRecord.runtimeLogicUnchanged,true);assert.equal(priorRecord.prior11.testSHA256,unchanged['verify.cjs']);
assert.equal(expression,'('+source+')('+JSON.stringify(binding)+',window.__driveNightCorpus.proof)\n');
const cases=[];
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
for(const mode of ['correct','old-app','old-proof','wrong-commit','wrong-hash','existing-observer']){const f=fixture();f.env.fetch=()=>assert.fail('NO_NETWORK');if(mode==='old-app')f.env.APP_VERSION='1.22.0-rc.28';if(mode==='old-proof'){const prior=JSON.parse(fs.readFileSync(path.join(old,'binding.json')));f.proof.get=()=>({...prior,controller:{}});}if(mode==='wrong-commit')f.proof.get=()=>({...binding,sourceCommit:'a'.repeat(40),controller:{}});if(mode==='wrong-hash')f.proof.get=()=>({...binding,sourceSHA256:{...binding.sourceSHA256,'app.js':'0'.repeat(64)},controller:{}});if(mode==='existing-observer')f.env.window.__rc25PerformanceQA={};f.env.window.__driveNightCorpus={proof:f.proof};if(mode==='correct'){const armed=vm.runInNewContext(expression,f.env);assert.equal(armed.selectedSamples,10);assert.equal(armed.requiredAttempts,30);assert.equal(f.read().binding.version,version);assert(!JSON.stringify(f.read()).includes('PRIVATE'));f.api().clear();f.clean();}else{assert.throws(()=>vm.runInNewContext(expression,f.env),/QA_PREFLIGHT/);f.clean();}cases.push({name:mode,passed:true,actualRequests:0});}
{const f=fixture();f.arm();f.click(0);f.open(0);f.proof.get=()=>({...binding,controller:{}});f.tick();assert.equal(f.read().rows[0].code,'SOURCE_OR_ACCOUNT_CHANGED');assert.equal(f.read().observerReleased,true);f.clean();cases.push({name:'live-controller-proof-change-stops-owner',passed:true,actualRequests:0});}
for(const args of [[fixed,'1.22.0-rc.28'],['a'.repeat(40),version]]){const before=hash(fs.readFileSync(path.join(base,'observer.expression.js'))),result=spawnSync(process.execPath,[path.join(base,'bind.cjs'),...args],{cwd:root,encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(hash(fs.readFileSync(path.join(base,'observer.expression.js'))),before);cases.push({name:args[0]===fixed?'wrong-version-binding-rejected':'wrong-commit-binding-rejected',passed:true,actualRequests:0});}
const producerPaths=['bind.cjs','observer.function.js','summarize.cjs','verify.cjs','verify-binding.cjs'],producerSHA256=Object.fromEntries(producerPaths.map(p=>[p,hash(fs.readFileSync(path.join(base,p)))]));
const provenance={schema:'drive-original.rc29-performance-preparation-build/1',binding,producerSHA256,observerSHA256:hash(Buffer.from(expression)),forkedSource:'qa/rc28-performance-preparation',unchangedLogicSHA256:unchanged,legacyRuntimeAPI:'window.__rc25PerformanceQA',legacyResultSchema:'drive-original.rc25-performance-passive/1',actualExecution:false};fs.writeFileSync(path.join(base,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
const owned=['bind.cjs','binding.json','observer.expression.js','observer.function.js','README.md','summarize.cjs','verify.cjs','verify-binding.cjs','provenance.json'];const files=Object.fromEntries(owned.map(p=>[p,hash(fs.readFileSync(path.join(base,p)))]));
const record={schema:'drive-original.rc29-performance-binding-verification/1',binding,observerSHA256:provenance.observerSHA256,files,changedBindingCases:cases,prior11:{reusedPassed:11,executedThisUnit:false,source:'qa/rc28-performance-preparation/verify.cjs',testSHA256:unchanged['verify.cjs'],previousRecordSHA256:hash(priorRecordBytes)},runtimeLogicUnchanged:true,limits:{selectedFiles:10,requiredAttempts:30,startupAttempts:20,pausedSeekAttempts:10},actualExecution:false,actualRequests:0,productChanges:false};fs.writeFileSync(path.join(base,'local-verification.json'),JSON.stringify(record,null,2)+'\n');
fs.writeFileSync(path.join(base,'curated-savepoint.json'),JSON.stringify({schema:'drive-original.rc29-performance-savepoint/1',exactOwnedFiles:[...owned,'local-verification.json','curated-savepoint.json'].map(p=>'qa/rc29-performance-preparation/'+p),commitOwner:'root',excluded:['original rc25/rc28 preparation/results','all actual browser/account/device/performance outputs','product/shared docs/private credentials/media']},null,2)+'\n');console.log(JSON.stringify({verified:true,changedBindingCases:cases.length,reused11:true,actualRequests:0,sourceCommit:fixed,observerSHA256:record.observerSHA256}));
