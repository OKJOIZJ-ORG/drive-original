'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');const {createReducer,attach}=require('./network-reducer.cjs');const {summarize,unionMs}=require('./partition-summary.cjs');
const origin='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const secret='private-exact-id',headers={Authorization:'Bearer SECRET',Range:'bytes=123-456',Cookie:'PRIVATE_COOKIE'},url=origin+'/__drive_media/'+secret+'?resourceKey=PRIVATE_RESOURCE&mediaSession=PRIVATE_SESSION';
const request=(id,url,stamp=2)=>({requestId:id,timestamp:stamp,wallTime:100+stamp,request:{url,method:'GET',headers}});
test('exact target immediate reduction excludes raw URL/header/request IDs and unrelated targets',()=>{
 const r=createReducer(secret);r.mark('startup',102000);r.event('request',request('PRIVATE_REQUEST',url));r.event('request',request('UNRELATED',origin+'/__drive_media/other'));r.event('response',{requestId:'PRIVATE_REQUEST',timestamp:3,response:{status:206,fromServiceWorker:true,headers,url}});r.event('data',{requestId:'PRIVATE_REQUEST',dataLength:100,encodedDataLength:75});r.event('finished',{requestId:'PRIVATE_REQUEST',timestamp:4,encodedDataLength:88});
 const out=r.read(),a=out.records[0];assert.equal(a.class,'OUTER_SW_MEDIA');assert.equal(a.responseWaitMs,1000);assert.equal(a.bodyDeliveryMs,1000);assert.equal(a.status,206);assert.equal(a.fromServiceWorker,true);assert.equal(a.rangeHeaderPresent,true);assert.equal(a.phaseStartOffsetMs,0);assert.equal(a.dataBytes,100);assert.equal(out.ignoredCount,1);
 for(const s of ['PRIVATE_REQUEST',secret,'SECRET','PRIVATE_COOKIE','PRIVATE_RESOURCE','PRIVATE_SESSION','bytes=123','https://'])assert.ok(!JSON.stringify(out).includes(s));
});
test('canonical metadata and direct Drive media discriminate privately, not host lookalikes or POST writes',()=>{
 const r=createReducer(secret),u='https://www.googleapis.com/drive/v3/files/'+secret;
 assert.equal(r.classify({method:'GET',url:u+'?fields=id,name'}),'DRIVE_METADATA');assert.equal(r.classify({method:'GET',url:u+'?alt=media'}),'PAGE_DRIVE_MEDIA');
 assert.equal(r.classify({method:'POST',url:u}),null);assert.equal(r.classify({method:'GET',url:u.replace('googleapis.com','googleapis.com.evil')}),null);assert.equal(r.classify({method:'GET',url:u+'/extra'}),null);
});
test('failures/caps/redirects release ephemeral correlation; unknown errors never export messages',()=>{
 const r=createReducer(secret,{limit:2,liveLimit:1});r.event('request',request('a',url));r.event('request',request('b',url));r.event('failed',{requestId:'a',timestamp:4,errorText:'RAW_ID '+secret,canceled:true});r.event('request',request('c',url));r.event('request',request('c','https://example.com/'+secret));
 const o=r.stop();assert.equal(o.records[0].errorCode,'OTHER');assert.equal(o.records[0].canceled,true);assert.equal(o.records[1].redirected,true);assert.equal(o.overflowCount,1);assert.equal(o.redirectCount,1);assert.equal(o.privateCorrelationCleared,true);assert.equal(o.inflight.length,0);assert.ok(!JSON.stringify(o).includes(secret));r.event('request',request('ignored',url));assert.equal(r.read().inflight.length,0);
});
test('attach only enables observation, fixed owned frame and bounded listener teardown; no fetch/body/throttle APIs',async()=>{
 class Session extends EventEmitter{constructor(){super();this.calls=[];}async send(name){this.calls.push(name);return name==='Page.getFrameTree'?{frameTree:{frame:{id:'PRIVATE_FRAME'}}}:{};}}
 const s=new Session(),p=await attach(s,secret);assert.deepEqual(s.calls,['Page.getFrameTree','Page.enable','Network.enable']);assert.equal(s.eventNames().length,6);s.emit('Page.frameNavigated',{frame:{id:'UNRELATED',url:secret}});assert.equal(p.read().mainFrameChanged,false);s.emit('Page.frameNavigated',{frame:{id:'PRIVATE_FRAME',url:secret}});assert.equal(p.read().mainFrameChanged,true);const o=await p.stop();assert.equal(o.listenersRemoved,6);assert.equal(s.eventNames().length,0);assert.ok(!JSON.stringify(o).includes('PRIVATE_FRAME'));
});
test('attach failure cleans partially installed listeners',async()=>{
 class Session extends EventEmitter{async send(n){if(n==='Page.getFrameTree')return{frameTree:{frame:{id:'private'}}};throw Error('PRIVATE_RAW_URL');}}
 const s=new Session();await assert.rejects(attach(s,secret),/PASSIVE_NETWORK_ATTACH_FAILED/);assert.equal(s.eventNames().length,0);
});
test('overlapping network union partitions wall time without adding overlaps or claiming CPU',()=>{
 assert.equal(unionMs([[0,8],[2,10],[15,20]]),15);
 const runtime={phases:[{label:'startup',armedAt:100000,firstTargetFrame:{elapsedMs:10000},beforeInput:{generation:null,sourceGeneration:0,session:0},samples:[{at:100000,pipeline:null},{at:106000,sourceSame:true,accountSame:true,targetSame:true,visible:true,sourceGeneration:1,session:1,pipeline:{phase:'buffering',generation:1,appends:0}},{at:108000,sourceSame:true,accountSame:true,targetSame:true,visible:true,sourceGeneration:1,session:1,pipeline:{phase:'ready',generation:1,appends:1}}]}]};
 const n={overflowCount:0,inflight:[],records:[{startedEpochMs:101000,respondedEpochMs:104000,completedEpochMs:107000},{startedEpochMs:103000,respondedEpochMs:105000,completedEpochMs:109000}]};
 const a=summarize(runtime,n)[0];assert.equal(a.observedRequestWallUnionMs,8000);assert.equal(a.residualWallTimeMs,2000);assert.deepEqual(a.firstBuffering,{lowerMs:0,upperMs:6000});assert.equal(a.probeParserCPU,'UNKNOWN');assert.equal(a.workerInnerCPUAndAck,'UNKNOWN');
});
test('new driver is import-only, phase budgets and strict immutable binding/dependencies',()=>{
 const d=require('./android-latency-partition.cjs');assert.equal(typeof d.execute,'function');assert.equal(typeof d.validatePrivate,'function');
 const source=fs.readFileSync(path.join(__dirname,'android-latency-partition.cjs'),'utf8');assert.ok(source.includes("waitFrame('startup',30000)"));assert.ok(source.includes("waitFrame(label,35000)"));assert.ok(!source.includes("await seek('nearEOF'"));assert.ok(!source.includes("await tap('card');await waitFrame('reopen'"));assert.ok(source.includes('NATIVE_ASCII_SEARCH_UNSUPPORTED'));assert.ok(source.includes('partition.mark(label,arm.armedAt)'));
 const binding=require('./binding.json');assert.equal(binding.sourceCommit,'4a484e6f839d2e6c3eb83503acb08147362cb011');assert.equal(binding.version,'1.22.0-rc.31');
 for(const row of require('./dependency-freeze.json').files){const bytes=fs.readFileSync(path.resolve(__dirname,row.path));assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'),row.sha256);}
});
function observerFixture({general=false}={}){
 const binding=require('./binding.json'),callbacks=new Map();let id=0,now=100000,owner={generation:1,phase:'opening',duration:100,appends:0},mediaOwner={kind:general?'general':'ts',controller:{signal:{aborted:false}},player:{stats:()=>owner}};
 const v={currentTime:0,duration:100,paused:false,ended:false,seeking:false,readyState:4,videoWidth:100,videoHeight:100,buffered:{length:0},requestVideoFrameCallback:f=>{callbacks.set(++id,f);return id;},cancelVideoFrameCallback:i=>callbacks.delete(i),addEventListener(){},removeEventListener(){}};
 const controller={state:'activated'},target={id:'private',name:'private-name',size:100};
 const context={window:{__resumeReplayTarget30:{target,account:{accountId:'private-account',authAccountKey:'private-key'}},__resumeSwProof:{get:()=>({controller,version:binding.version,sourceCommit:binding.sourceCommit,sourceSHA256:binding.sourceSHA256})}},APP_VERSION:binding.version,navigator:{serviceWorker:{controller}},state:{accountId:'private-account',authAccountKey:'private-key',authStatus:'online',selected:target,mediaSession:1},document:{visibilityState:'visible'},el:{playerSheet:{hidden:false}},q1Playback:mediaOwner,q0Playback:null,getActiveMediaElement:()=>v,isCurrentMediaEvent:()=>true,mediaSourceGeneration:1,mediaSeekGeneration:0,mediaSeekSettledGeneration:0,mediaSeekWatchdog:null,Date:{now:()=>now},setInterval:()=>1,clearInterval(){},getComputedStyle(){return{}},setTimeout,clearTimeout,AbortController};
 vm.createContext(context);const source=fs.readFileSync(path.join(__dirname,'observer.expression.js'),'utf8');vm.runInContext(source,context);
 const api=context.window.__rc31LatencyPartitionV2;
 return{api,context,v,owner,setOwner:o=>owner=o,setNow:n=>now=n,frame:time=>{const[i,fn]=callbacks.entries().next().value;callbacks.delete(i);fn(0,{mediaTime:time,presentedFrames:1,width:100,height:100});}};
}
test('actual RVFC first target requires post-seek generation; stale/preinput frames cannot pass',()=>{
 const f=observerFixture();f.api.arm('seek50',{targetSeconds:50,toleranceSeconds:1});f.frame(50);assert.equal(f.api.read().phases[0].firstTargetFrame,null);f.setOwner({...f.owner,generation:2,phase:'buffering'});f.setNow(101000);f.frame(50);assert.equal(f.api.read().phases[0].firstTargetFrame.elapsedMs,1000);assert.equal(f.api.read().phases[0].firstTargetFrame.generation,2);f.api.stop();
});
test('general Q1 phase level and shifted presented clock discriminate Q2 and translated target',()=>{
 const f=observerFixture({general:true});f.setOwner({generation:1,phase:'buffering',status:{level:'Q1'},mapping:{sourceOrigin:50,sourceEnd:150,commonShift:45,targetSource:100,targetElement:55},appends:1});f.api.arm('startup',{targetSeconds:50});f.frame(55);const r=f.api.read();assert.equal(r.latest.route,'Q1_GENERAL');assert.equal(r.phases[0].firstTargetFrame.sourceTime,50);assert.equal(r.latest.pipeline.mapping.sourceEnd-r.latest.pipeline.mapping.sourceOrigin,100);f.setOwner({generation:2,phase:'buffering',status:{level:'Q2'},mapping:null});assert.equal(f.api.read().latest.route,'Q2_GENERAL');f.api.stop();
});
test('current native source/account/owner rejection and stop remove passive callbacks',()=>{
 const f=observerFixture();f.api.arm('startup',{targetSeconds:0});f.context.isCurrentMediaEvent=()=>false;f.frame(0);assert.equal(f.api.read().phases[0].firstTargetFrame,null);f.context.isCurrentMediaEvent=()=>true;f.context.state.authAccountKey='changed';f.frame(0);const r=f.api.read();assert.equal(r.phases[0].firstTargetFrame,null);assert.equal(r.phases[0].fenceFailure,true);const s=f.api.stop();assert.equal(s.frameCallbackRemoved,true);assert.equal(s.mediaListenersRemoved,true);assert.ok(!JSON.stringify(r).includes('private-name'));
});
