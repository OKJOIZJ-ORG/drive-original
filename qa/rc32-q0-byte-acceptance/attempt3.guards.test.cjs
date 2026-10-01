'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{EventEmitter}=require('node:events');
const {reducer,selectWorker,attach}=require('./worker-network.cjs'),{qualify,queryEraseCommand}=require('./android.cjs');
const O='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',url='https://www.googleapis.com/drive/v3/files/FILE/revisions/REV?alt=media';
function request(r,id='r',range='bytes=0-99',u=url){r.event('Network.requestWillBeSent',{requestId:id,request:{url:u,method:'GET',headers:{Range:range}}});}
function response(r,id='r',extra={}){r.event('Network.responseReceived',{requestId:id,response:{status:206,headers:{'Content-Range':'bytes 0-99/1000','Content-Length':'100'},...extra}});}
test('only exact source revision; cumulative paired range lengths are upper bounds, not received values',()=>{
 const r=reducer('FILE',1000,'REV');r.arm();request(r);response(r);r.event('Network.dataReceived',{requestId:'r',dataLength:20,encodedDataLength:20});r.event('Network.loadingFinished',{requestId:'r',encodedDataLength:180});
 const n=r.read(),s={firstFrame:{},progressFrame:{},current:true},t={starts:1,requestCount:1,terminalCount:1,finalReaderBytes:20};assert.equal(n.actualBodyBytes,20);assert.equal(n.all206RangeUpperBound,100);assert.equal(n.live,0);assert(qualify(s,n,1000,t));assert(!qualify(s,n,1000));assert(!qualify(s,n,1000,{...t,starts:2}));assert(qualify(s,n,1000,{...t,terminalCount:0}));assert(!JSON.stringify(n).includes('REV'));assert(!JSON.stringify(n).includes('FILE'));
 const wrong=reducer('FILE',1000,'REV');wrong.arm();request(wrong,'r','bytes=0-99',url.replace('REV','OTHER'));assert(wrong.read().unqualified);
});
test('native query replacement has a finite erase bound and no shell interpolation',()=>{
 assert.deepEqual(queryEraseCommand(2),['shell','input','keyevent','KEYCODE_MOVE_END','KEYCODE_DEL','KEYCODE_DEL']);assert.equal(queryEraseCommand(0).length,4);assert.equal(queryEraseCommand(240).length,244);
 for(const bad of [-1,241,Infinity,'2',.5])assert.throws(()=>queryEraseCommand(bad),/QUERY_BOUND/);
});
test('open/full ranges, incomplete/drifted headers, cached or unarmed requests never pass',()=>{
 for(const mutate of [r=>request(r,'r','bytes=0-'),r=>{request(r);response(r,'r',{headers:{'Content-Range':'bytes 0-100/1000','Content-Length':'100'}});},r=>{request(r);response(r,'r',{fromDiskCache:true});},r=>{request(r);response(r);},r=>request(r,'r','bytes=0-99',url.replace('/revisions/REV',''))]){
  const r=reducer('FILE',1000,'REV');r.arm();mutate(r);assert(!qualify({firstFrame:{},progressFrame:{},current:true},r.read(),1000));
 }
 const r=reducer('FILE',1000,'REV');request(r);assert(r.read().unqualified);
});
test('open-ended original can qualify only with complete noncompressed post-close chunks and independent CDP terminal/SW start agreement',()=>{
 const r=reducer('FILE',1000,'REV');r.arm();request(r,'r','bytes=0-');response(r);r.event('Network.dataReceived',{requestId:'r',dataLength:80,encodedDataLength:90});r.event('Network.loadingFailed',{requestId:'r',canceled:true});
 const s={firstFrame:{},progressFrame:{},current:true},t={starts:1,requestCount:1,terminalCount:1,finalReaderBytes:80,overflow:false},n=r.read();
 assert(n.completeChunkObservation);assert.equal(n.postCloseTrafficEnvelope,90);assert(qualify(s,n,1000,{...t,terminalCount:0}));assert.equal(n.all206RangeUpperBound,null);assert(qualify(s,n,1000,t));
 for(const bad of [{...t,starts:2},{...t,terminalCount:2},{...t,finalReaderBytes:81},{...t,overflow:true}])assert(!qualify(s,n,1000,bad));
 for(const bad of [{...n,completeChunkObservation:false},{...n,postCloseTrafficEnvelope:1000},{...n,unqualified:true}])assert(!qualify(s,bad,1000,t));
 const missing=reducer('FILE',1000,'REV');missing.arm();request(missing,'r','bytes=0-');response(missing);missing.event('Network.loadingFailed',{requestId:'r',canceled:true});assert(!missing.read().completeChunkObservation);
 const compressed=reducer('FILE',1000,'REV');compressed.arm();request(compressed,'r','bytes=0-');response(compressed,'r',{headers:{'Content-Encoding':'gzip'}});compressed.event('Network.dataReceived',{requestId:'r',dataLength:80,encodedDataLength:50});compressed.event('Network.loadingFailed',{requestId:'r',canceled:true});assert(!compressed.read().completeChunkObservation);
});
test('overflow, redirects, source failure and missing progression do not silently qualify',()=>{
 const r=reducer('FILE',1000,'REV');r.arm();for(let i=0;i<65;i++)request(r,'r'+i);assert(r.read().overflow);assert.equal(r.read().requestCount,64);
 const q=reducer('FILE',1000,'REV');q.arm();request(q);request(q);assert(q.read().unqualified);
 assert(!qualify({firstFrame:{},current:true},{sourceWorker:true,requestCount:1,live:0,all206RangeUpperBound:100},1000));
});
test('per-request preflight admits only genuine completed zero-payload browser OPTIONS',()=>{
 function option(r,id,changes={},status=204,payload=0,finish=true){r.event('Network.requestWillBeSent',{requestId:id,type:'Preflight',request:{url,method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET'},...changes}});r.event('Network.responseReceived',{requestId:id,response:{url,status}});r.event('Network.dataReceived',{requestId:id,dataLength:payload,encodedDataLength:0});if(finish)r.event('Network.loadingFinished',{requestId:id,encodedDataLength:100});}
 function ready(){const r=reducer('FILE',1000,'REV');r.arm();request(r,'r','bytes=0-');response(r);r.event('Network.dataReceived',{requestId:'r',dataLength:80,encodedDataLength:90});r.event('Network.loadingFailed',{requestId:'r',canceled:true});return r;}
 const state={firstFrame:{},progressFrame:{},current:true},trace={starts:1,requestCount:1,terminalCount:0,finalReaderBytes:80,overflow:false};
 const good=ready();option(good,'p1');option(good,'p2');assert(qualify(state,good.read(),1000,trace));assert.equal(good.read().preflight.rows.length,2);assert(good.read().preflight.rows.every(p=>p.qualified));assert.deepEqual(good.read().methodCounts,{get:1,options:2,other:0});assert(!JSON.stringify(good.read()).includes('FILE'));
 for(const bad of ['method','body','status','payload','unfinished','duplicate','invalidcounter','failed','wrongrevision','unarmed','missingtype','post']){
  const r=ready();option(r,'p1');
  if(bad==='missingtype')r.event('Network.requestWillBeSent',{requestId:'p2',request:{url,method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET'}}});
  else if(bad==='post')r.event('Network.requestWillBeSent',{requestId:'p2',request:{url,method:'POST',headers:{}}});
  else option(r,bad==='duplicate'?'p1':'p2',bad==='method'?{headers:{'Access-Control-Request-Method':'POST'}}:bad==='body'?{hasPostData:true}:bad==='wrongrevision'?{url:url.replace('REV','OTHER')}:{},bad==='status'?200:204,bad==='payload'?1:0,bad!=='unfinished');
  if(bad==='invalidcounter'){r.event('Network.requestWillBeSent',{requestId:'p3',type:'Preflight',request:{url,method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET'}}});r.event('Network.dataReceived',{requestId:'p3',dataLength:0,encodedDataLength:-1});}
  if(bad==='failed'){r.event('Network.requestWillBeSent',{requestId:'p3',type:'Preflight',request:{url,method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET'}}});r.event('Network.loadingFailed',{requestId:'p3',canceled:true});}
  if(bad==='unarmed'){const u=reducer('FILE',1000,'REV');option(u,'p');assert(u.read().unqualified);continue;}
  assert(!qualify(state,r.read(),1000,trace),bad);
 }
});
test('safe branch diagnostics reject incomplete/invalid GET traffic',()=>{
 const s={firstFrame:{},progressFrame:{},current:true},t={starts:1,requestCount:1,terminalCount:0,finalReaderBytes:1,overflow:false};
 for(const kind of ['missingTerminal','belowBody','zero','invalid','error','orphan']){
  const r=reducer('FILE',1000,'REV');r.arm();request(r,'r','bytes=0-');response(r);
  r.event('Network.dataReceived',{requestId:'r',dataLength:kind==='zero'?0:80,encodedDataLength:kind==='invalid'?-1:kind==='belowBody'?50:kind==='zero'?0:90});
  if(kind!=='missingTerminal')r.event('Network.loadingFailed',{requestId:'r',canceled:kind!=='error'});
  if(kind==='orphan')r.event('Network.responseReceived',{requestId:'unknown',response:{url,status:206}});
  assert(!qualify(s,r.read(),1000,t),kind);if(kind==='invalid')assert(r.read().rejectionReasons.invalidChunkCounter);if(kind==='orphan')assert(r.read().rejectionReasons.orphanSourceResponse);
 }
});
test('worker selection requires sole candidate page and sole exact same-context worker',()=>{
 const targets=[{type:'page',url:O,browserContextId:'A'},{type:'service_worker',url:O+'/sw.js',browserContextId:'A',targetId:'W'}];assert.equal(selectWorker(targets),'W');
 assert.throws(()=>selectWorker([...targets,targets[1]]),/WORKER_TARGET_COUNT/);assert.throws(()=>selectWorker([targets[0],{...targets[1],browserContextId:'B'}]),/WORKER_TARGET_COUNT/);
 assert.throws(()=>selectWorker([...targets,targets[0]]),/PAGE_TARGET_COUNT/);
});
test('composed observer uses only owned forward and reduced worker events; stop detaches all owned transport',async()=>{
 const events=new EventEmitter(),calls=[],adb=[];let changed=false,detached=false,closed=false;
 const session={on:events.on.bind(events),off:events.off.bind(events),detach:async()=>{detached=true;},send:async(method,p)=>{
  calls.push(method);if(method==='Target.getTargets')return{targetInfos:[{type:'page',url:O,browserContextId:'A'},{type:'service_worker',url:O+'/sw.js',browserContextId:'A',targetId:changed?'OTHER':'W'}]};
  if(method==='Target.attachToTarget')return{sessionId:'S'};if(method==='Target.sendMessageToTarget'){const m=JSON.parse(p.message);queueMicrotask(()=>events.emit('Target.receivedMessageFromTarget',{sessionId:'S',message:JSON.stringify({id:m.id,result:{}})}));}return{};
 }};
 const c={adb:a=>{adb.push(a);return a[0]==='forward'&&a[1]==='tcp:0'?'12345':'';}};
 const n=await attach(c,'FILE',1000,'REV',{connect:async()=>({newBrowserCDPSession:async()=>session,close:async()=>{closed=true;}})});n.arm();await n.verify();changed=true;await assert.rejects(n.verify(),/WORKER_CHANGED/);
 const cleanup=await n.stop();assert(cleanup.ownedWorkerDetached&&cleanup.ownedForwardRemoved&&cleanup.privateCorrelationCleared);assert(detached&&closed);assert.equal(events.listenerCount('Target.receivedMessageFromTarget'),0);assert.deepEqual(adb.at(-1),['forward','--remove','tcp:12345']);assert(!calls.some(x=>/setCache|clear|AutoAttach|getResponseBody/.test(x)));
});
test('Q0 RVFC requires exact live owner, actual progression and bounded callback/timer cleanup',()=>{
 const source=fs.readFileSync(require.resolve('./observer.function.js'),'utf8'),callbacks=new Map(),timers=new Map();let n=0;
 const video={requestVideoFrameCallback:f=>{callbacks.set(++n,f);return n;},cancelVideoFrameCallback:id=>callbacks.delete(id)},controller={},target={id:'FILE',parents:['F']},binding={version:'1.22.0-rc.32',sourceCommit:'COMMIT',sourceSHA256:{'app.js':'HASH'}};
 const s={window:{__resumeSwProof:{get:()=>({...binding,controller})}},el:{playerSheet:{hidden:true},videoPlayer:video},q0Playback:null,q1Playback:null,q1RetirementResult:{settled:true},state:{accountId:'ACCOUNT',authAccountKey:'KEY',authGeneration:1,driveSessionGeneration:1,token:'TOKEN',tokenRevision:1,selected:null,mediaSession:1},navigator:{serviceWorker:{controller}},APP_VERSION:binding.version,document:{visibilityState:'visible'},hasUsableToken:()=>true,isCurrentQ0Playback:()=>true,isCurrentMediaEvent:v=>v===video,mediaSourceGeneration:1,setTimeout:f=>{timers.set(++n,f);return n;},clearTimeout:id=>timers.delete(id),Date};
 vm.runInNewContext(source+'; installQ0ByteObserver',s)({target,account:{accountId:'ACCOUNT',authAccountKey:'KEY'}},binding);s.window.__q0Byte.arm();s.state.selected=target;s.q0Playback={controller:{signal:{aborted:false}}};
 const fire=time=>{const [id,f]=callbacks.entries().next().value;callbacks.delete(id);f(0,{mediaTime:time,width:1920,height:1080});};fire(0);
 const sink=s.window.__driveOriginalMediaTraceSink;sink({stage:'intent',playbackId:'P'});sink({stage:'request-start',playbackId:'P',route:'range',requestId:'PRIVATE_REQUEST'});sink({stage:'request-cancelled',playbackId:'P',route:'range',requestId:'PRIVATE_REQUEST',bytes:80});
 assert.equal(s.window.__q0Byte.read().swReaderTrace.finalReaderBytes,80);assert(!JSON.stringify(s.window.__q0Byte.read()).includes('PRIVATE_REQUEST'));
 fire(.5);assert(s.window.__q0Byte.read().progressFrame);s.window.__q0Byte.stop();assert.equal(callbacks.size,0);assert.equal(timers.size,0);assert.equal(s.window.__driveOriginalMediaTraceSink,undefined);
 delete s.window.__q0Byte;delete s.window.__resumeReplayTarget30;s.q0Playback=null;s.state.selected=null;
 vm.runInNewContext(source+'; installQ0ByteObserver',s)({target,account:{accountId:'ACCOUNT',authAccountKey:'KEY'}},binding);s.window.__q0Byte.arm();s.state.selected=target;s.q0Playback={controller:{signal:{aborted:false}}};fire(0);s.mediaSourceGeneration++;fire(.5);
 assert.equal(s.window.__q0Byte.read().failure,'Q0_OWNER_CHANGED');assert.equal(s.window.__q0Byte.read().progressFrame,null);s.window.__q0Byte.stop();assert.equal(callbacks.size,0);assert.equal(timers.size,0);
});
