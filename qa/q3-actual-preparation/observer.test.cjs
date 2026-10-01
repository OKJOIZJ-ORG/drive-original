'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const {makeBinding,VERSION}=require('./bind-observer.cjs');
const binding=JSON.parse(fs.readFileSync(path.join(__dirname,'binding-observer.json'))),fn=fs.readFileSync(path.join(__dirname,'observer.function.js'),'utf8');
function fixture(override={}){
 let now=100000,frame,interval;const listeners=new Map(),buttonListeners=new Map(),sentinel='PRIVATE_SYNTHETIC_REFERENCE';
 const target={id:sentinel,name:sentinel,size:String(binding.fixture.bytes),mimeType:'video/mp4',modifiedTime:'2026-10-02',parents:[sentinel],version:'9',headRevisionId:sentinel,sha256Checksum:binding.fixture.sha256,...override};
 const video={buffered:{length:1,start:()=>0,end:()=>180},currentTime:0,duration:180,paused:false,ended:false,seeking:false,readyState:4,videoWidth:640,videoHeight:360,error:null,
  requestVideoFrameCallback:cb=>(frame=cb,1),cancelVideoFrameCallback(){frame=null;},addEventListener:(n,cb,capture)=>listeners.set(n+(capture?'capture':''),cb),removeEventListener:(n,cb,capture)=>listeners.delete(n+(capture?'capture':'')),getVideoPlaybackQuality:()=>({totalVideoFrames:60,droppedVideoFrames:0}),getAttribute:()=>null};
 const button={hidden:true,addEventListener:(n,cb)=>buttonListeners.set(n,cb),removeEventListener:n=>buttonListeners.delete(n)};
 const rail={hidden:false,dataset:{mode:'range'},getBoundingClientRect:()=>({width:320,height:20})},railText={hidden:false,textContent:'호환 변환 · 영상 손실 압축',parentElement:rail,getBoundingClientRect:()=>({width:240,height:20})};
 const controller={state:'activated'},stats={generation:1,phase:'ready',mapping:{commonShift:0,sourceOrigin:0,sourceEnd:180},status:{level:'Q3',video:'lossy-transformed',bitPerfectVideo:false},appends:3};
 const context={window:{__q3ActualTarget33:{metadata:target,account:{accountId:sentinel,authAccountKey:sentinel}},__resumeSwProof:{get:()=>({controller,sourceCommit:binding.sourceCommit,version:binding.version,sourceSHA256:binding.sourceSHA256})}},navigator:{serviceWorker:{controller}},APP_VERSION:VERSION,
  state:{selected:null,accountId:sentinel,authAccountKey:sentinel,authStatus:'online',mediaSession:1,authGeneration:7,driveSessionGeneration:9,mediaPlaybackMode:'video-compatible-lossy',mediaTransportVerified:true},document:{visibilityState:'visible'},el:{videoPlayer:video,videoCompatButton:button,streamModeLabel:rail,streamModeText:railText,qualityBadge:{hidden:false,textContent:'영상 손실 압축',getBoundingClientRect:()=>({width:0,height:0})},playerSheet:{hidden:true},mediaLoadingText:{hidden:true,getBoundingClientRect:()=>({height:0})}},q0Playback:null,q1Playback:null,q3Choice:null,q1RetirementResult:{settled:true},PLAYBACK_MODE:{REPACKAGED:'repackaged',VIDEO_COMPATIBILITY:'video-compatible-lossy'},mediaSourceGeneration:1,mediaSeekGeneration:0,mediaSeekSettledGeneration:0,mediaSeekWatchdog:null,
  getActiveMediaElement:()=>video,isCurrentMediaEvent:v=>v===video,getComputedStyle:e=>e===video?({display:'none',visibility:'hidden'}):({display:'block',visibility:'visible'}),Date:{now:()=>now},setInterval:cb=>(interval=cb,1),clearInterval:()=>{interval=null;},setTimeout:()=>1,clearTimeout(){},AbortController,TextDecoder,Uint8Array,DRIVE_API:'https://private.invalid',driveFetch:async()=>{let sent=false;return{ok:true,status:200,headers:{get:()=>null},body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:Buffer.from(JSON.stringify({...target,trashed:false,capabilities:{canDownload:true}}))}),releaseLock(){},cancel:async()=>{}})}};}};
 vm.createContext(context);vm.runInContext('('+fn+')('+JSON.stringify(binding)+')',context);const api=context.window.__q3ActualReplay33;
 context.q0PinnedSource={descriptor:{...target,fileId:target.id,accountKey:sentinel,accountGeneration:9}};
 return {context,api,target,stats,video,button,listeners,buttonListeners,select(){context.state.selected=target;context.el.playerSheet.hidden=false;},q3(){context.q0Playback=null;context.q1Playback={kind:'general',fileId:target.id,controller:{signal:{aborted:false}},player:{stats:()=>stats}};},present(time,width=640,height=360){now+=33;const cb=frame;frame=null;cb(now,{mediaTime:time,presentedFrames:2,width,height});},advance(){now+=400;interval?.();},elapse(ms){now+=ms;interval?.();},sentinel};
}
test('binding rejects missing/partial/wrong version and derives complete46 cache public Git fixtures',()=>{
 const sw=fs.readFileSync(path.join(__dirname,'../../sw.js'));const lookup=file=>file==='sw.js'?sw:file==='version.json'?Buffer.from(JSON.stringify({version:VERSION})):Buffer.from('PUBLIC-'+file);
 for(const commit of [undefined,'HEAD','5174485'])assert.throws(()=>makeBinding(commit,VERSION,lookup),/EXPLICIT33/);
 assert.throws(()=>makeBinding('a'.repeat(40),'1.22.0-rc.32',lookup),/EXPLICIT33/);const b=makeBinding('a'.repeat(40),VERSION,lookup);assert.equal(b.cache.length,46);assert.equal(b.cache.filter(x=>x.file.startsWith('media/video-q3-')).length,6);
});
test('strong fixture reference and metadata-before are required without any activation',async()=>{
 assert.throws(()=>fixture({version:undefined}),/STRONG_FIXTURE/);assert.throws(()=>fixture({sha256Checksum:'0'.repeat(64)}),/STRONG_FIXTURE/);const f=fixture();assert.throws(()=>f.api.arm('native'),/METADATA_BEFORE_REQUIRED/);await f.api.metadata('before');assert.equal(f.api.arm('native').armed,true);f.api.stop();
});
test('trusted actual native rejection and explicit choice are separate readonly observations',async()=>{
 const f=fixture();await f.api.metadata('before');f.api.arm('native');f.select();f.context.q0Playback={};f.context.state.mediaTransportVerified=true;f.video.error={code:4};f.listeners.get('errorcapture')({isTrusted:false,target:f.video});assert.equal(f.api.read().nativeRejectionObserved,false);f.listeners.get('errorcapture')({isTrusted:true,target:f.video});assert.equal(f.api.read().nativeRejectionObserved,true);
 f.button.hidden=false;f.context.q3Choice={current:()=>true};f.buttonListeners.get('click')({isTrusted:false});assert.equal(f.api.read().explicitChoiceObserved,false);f.buttonListeners.get('click')({isTrusted:true});assert.equal(f.api.read().explicitChoiceObserved,true);assert.equal(JSON.stringify(f.api.read()).includes(f.sentinel),false);f.api.stop();assert.equal(f.listeners.size,0);assert.equal(f.buttonListeners.size,0);
});
test('Q3 frame proof requires original geometry, source clock and advanced seek generation',async()=>{
 const f=fixture();await f.api.metadata('before');f.select();f.q3();f.api.arm('startup');f.present(0,320,180);assert.equal(f.api.read().phases[0].firstTargetFrame,null);f.present(1/30);assert.equal(f.api.read().phases[0].firstTargetFrame.route,'Q3');f.api.arm('seek50',{targetSeconds:10});f.present(90);assert.equal(f.api.read().phases[1].firstTargetFrame,null);f.stats.generation=2;f.context.mediaSourceGeneration=2;f.present(90);assert.equal(f.api.read().phases[1].firstTargetFrame.sourceTime,90);f.api.arm('seek90');f.stats.generation=3;f.context.mediaSourceGeneration=3;f.present(162);assert.equal(f.api.read().phases[2].firstTargetFrame.sourceTime,162);f.api.stop();
});
test('account/controller drift cannot qualify frames and closed ownership is explicit',async()=>{
 for(const key of ['authGeneration','driveSessionGeneration']){const f=fixture();await f.api.metadata('before');f.select();f.q3();f.api.arm('startup');f.context.state[key]++;f.present(0);assert.equal(f.api.read().phases[0].firstTargetFrame,null);f.api.stop();}
 const f=fixture();await f.api.metadata('before');f.select();f.q3();f.api.arm('cancel');f.context.q1Playback=null;f.context.state.selected=null;f.context.el.playerSheet.hidden=true;assert.equal(f.api.read().closedOwnership,true);f.context.q1RetirementResult.settled=false;assert.equal(f.api.read().closedOwnership,false);f.api.stop();
});
test('source CFR grid and exact exposed main-rail lossy text discriminate presentation',async()=>{
 const f=fixture();await f.api.metadata('before');f.select();f.q3();f.api.arm('startup');f.present(.01);assert.equal(f.api.read().phases[0].firstTargetFrame,null);f.context.el.streamModeText.textContent='원본 화질';f.present(1/30);assert.equal(f.api.read().phases[0].firstTargetFrame,null);f.context.el.streamModeText.textContent='호환 변환 · 영상 손실 압축';f.present(2/30);assert.equal(f.api.read().phases[0].firstTargetFrame.width,640);f.api.stop();
});
test('collapsed detail badge does not hide visible current lossy main rail',async()=>{
 const f=fixture();await f.api.metadata('before');f.select();f.q3();f.api.arm('startup');assert.equal(f.context.el.qualityBadge.getBoundingClientRect().height,0);f.present(0);assert.equal(f.api.read().latest.lossyLabelVisible,true);assert.equal(f.api.read().phases[0].firstTargetFrame.route,'Q3');f.api.stop();
});
test('hidden/wrong/retired main rail cannot be rescued by lossy text in detail or elsewhere',async()=>{
 for(const kind of ['hidden-rail','hidden-text','zero-rail','zero-text','wrong-text','wrong-dataset','wrong-mode','unverified','wrong-parent','retired-owner']){
  const f=fixture();await f.api.metadata('before');f.select();f.q3();f.api.arm('startup');
  if(kind==='hidden-rail')f.context.el.streamModeLabel.hidden=true;
  if(kind==='hidden-text')f.context.el.streamModeText.hidden=true;
  if(kind==='zero-rail')f.context.el.streamModeLabel.getBoundingClientRect=()=>({width:0,height:20});
  if(kind==='zero-text')f.context.el.streamModeText.getBoundingClientRect=()=>({width:240,height:0});
  if(kind==='wrong-text')f.context.el.streamModeText.textContent='호환 변환 확인 중';
  if(kind==='wrong-dataset')f.context.el.streamModeLabel.dataset.mode='drive';
  if(kind==='wrong-mode')f.context.state.mediaPlaybackMode='repackaged';
  if(kind==='unverified')f.context.state.mediaTransportVerified=false;
  if(kind==='wrong-parent')f.context.el.streamModeText.parentElement={};
  if(kind==='retired-owner')f.stats.disposed=true;
  f.present(0);assert.equal(f.api.read().phases[0].firstTargetFrame,null,kind);f.api.stop();
 }
});
test('safe save retains closed generation evidence, marks incomplete failure and removes callbacks',async()=>{
 const f=fixture();await f.api.metadata('before');f.select();f.q3();f.api.arm('startup');f.present(0);f.api.arm('cancel');f.stats.source={receivedBytes:100,releasedBytes:100,cacheBytes:0};f.stats.disposed=true;f.context.q1Playback=null;f.context.state.selected=null;f.context.el.playerSheet.hidden=true;await f.api.metadata('after');const saved=f.api.save();assert.equal(saved.saved,true);assert.equal(saved.complete,false);assert.equal(f.context.window.__q3ActualReceipt33.closedOwnership,true);assert.equal(f.context.window.__q3ActualReceipt33.closedMetrics.owners[0].disposed,true);assert.equal(JSON.stringify(f.context.window.__q3ActualReceipt33).includes(f.sentinel),false);assert.equal(f.listeners.size,0);assert.equal(f.buttonListeners.size,0);assert.throws(()=>f.api.save(),/OBSERVER_ALREADY_STOPPED/);
});
test('inherited Android controls are inert, bounded native input and QA path/hash fenced',()=>{
 const {nativeInput,inputFile}=require('./android-observer-session.cjs');assert.deepEqual(nativeInput({op:'tap',x:1,y:2},100,100),['shell','input','tap','1','2']);assert.throws(()=>nativeInput({op:'tap',x:100,y:2},100,100),/BOUNDED_NATIVE/);assert.throws(()=>inputFile({path:path.join(__dirname,'../../app.js'),dest:'__a',mode:'script',sha:'0'.repeat(64)}),/OWNED_QA_INPUT/);assert.match(fs.readFileSync(path.join(__dirname,'android-observer-session.cjs'),'utf8'),/operations>=80/);
});
test('late18s frame retains missed15s diagnostic while bounded function completion remains separate',async()=>{
 const f=fixture();await f.api.metadata('before');f.api.arm('native');f.select();f.context.q0Playback={};f.context.state.mediaTransportVerified=true;f.video.error={code:4};f.listeners.get('errorcapture')({isTrusted:true,target:f.video});f.button.hidden=false;f.context.q3Choice={current:()=>true};f.api.arm('startup');f.buttonListeners.get('click')({isTrusted:true});f.q3();f.context.q3Choice=null;f.elapse(15000);f.elapse(3300);f.present(0);assert.equal(f.api.read().phases[1].diagnosticAt15.frameBy15,false);assert.equal(f.api.read().phases[1].firstTargetFrame.elapsedMs,18333);f.api.arm('seek50');f.stats.generation++;f.context.mediaSourceGeneration++;f.present(90);f.api.arm('seek90');f.stats.generation++;f.context.mediaSourceGeneration++;f.present(162);f.api.arm('cancel');f.stats.disposed=true;f.context.q1Playback=null;f.context.state.selected=null;f.context.el.playerSheet.hidden=true;await f.api.metadata('after');assert.equal(f.api.save().complete,true);assert.equal(f.context.window.__q3ActualReceipt33.performanceAcceptance,'NOT_QUALIFIED');assert.equal(JSON.stringify(f.context.window.__q3ActualReceipt33).includes(f.sentinel),false);
});
test('reused source proof qualifies46 cache blobs/root alias and rejects changed controller account',async()=>{
 const {webcrypto}=require('node:crypto'),sourceProof=fs.readFileSync(path.join(__dirname,'../rc32-ts-device-replay/source-proof.function.js'),'utf8');
 const lookup=file=>file==='sw.js'?fs.readFileSync(path.join(__dirname,'../../sw.js')):Buffer.from(file==='version.json'?JSON.stringify({version:VERSION}):'PUBLIC-'+file),b=makeBinding('a'.repeat(40),VERSION,lookup);
 async function run(drift){const controller={state:'activated',scriptURL:'https://test.invalid/sw.js'},c={APP_VERSION:VERSION,state:{selected:null,authStatus:'online',accountStateLoaded:true,accountId:'PRIVATE',authAccountKey:'PRIVATE',authGeneration:1,driveSessionGeneration:2},q0Playback:null,q1Playback:null,q1RetirementResult:{settled:true},hasUsableToken:()=>true,navigator:{serviceWorker:{controller,getRegistration:async()=>({active:controller})}},document:{visibilityState:'visible'},window:{},crypto:webcrypto,URL,AbortController,setTimeout,clearTimeout,Date,__binding:b,fetch:async u=>{if(drift)c.state.authGeneration++;return{ok:true,arrayBuffer:async()=>lookup(u.slice(1))};},caches:{keys:async()=>['drive-original-shell-'+VERSION],open:async()=>({match:async u=>({arrayBuffer:async()=>lookup(u==='/'?'index.html':u.slice(1))})})}};vm.createContext(c);return vm.runInContext('('+sourceProof+')(__binding,__binding.cache)',c);}
 const r=await run(false);assert.equal(r.matchedCache,46);assert.equal(r.matchedCacheAliases,47);assert.equal(r.executingWorkerScriptHashKnown,false);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);await assert.rejects(run(true),/QA_OWNER/);
});
