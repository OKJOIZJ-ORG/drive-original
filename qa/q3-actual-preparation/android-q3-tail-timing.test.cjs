'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),path=require('node:path'),{pathToFileURL}=require('node:url');
const actor=require('./android-q3-tail-timing.cjs');
const helper=fs.readFileSync(path.join(__dirname,'android-q3-tail-timing.function.js'),'utf8');
const PIN='5174485b3c17d047259701bbdd889f9b0740f555',ROOT=path.resolve(__dirname,'../..');
test('local plan pins exact Git bytes and reused unique anchors without reading protected target or starting device tools',()=>{
 const originalRead=fs.readFileSync;fs.readFileSync=function(file,...args){if(String(file).includes('q3-target-cua1-1-private'))throw Error('PRIVATE_READ_FORBIDDEN');return originalRead.call(this,file,...args);};
 try{const p=actor.plan('local-tail-guards');assert.equal(p.actualOperationPerformed,false);assert.equal(p.actionMs,100000);assert.equal(p.cleanupMs,30000);assert.equal(p.preference,'prefer-software');assert.equal(p.frames,300);assert.match(p.preflightCommand,/--preflight local-tail-guards$/);assert.match(p.preflightScope,/zero native Workers/);}finally{fs.readFileSync=originalRead;}
 assert.throws(()=>actor.names('../bad'),/NEW_SAFE_LABEL_REQUIRED/);
});
test('instrumentation rejects missing/duplicate anchors, keeps prefer-software and absolute same-origin module imports',()=>{
 const original=cp.execFileSync('git',['show',`${PIN}:media/video-q3-pipeline.mjs`],{cwd:ROOT,encoding:'utf8'}),worker=cp.execFileSync('git',['show',`${PIN}:media/video-q3-worker.mjs`],{cwd:ROOT,encoding:'utf8'});
 const text=actor.instrumentPipeline(original),workerText=actor.instrumentWorker(worker);
 assert.throws(()=>actor.instrumentPipeline(original.replace(actor.ANCHORS[0][0],'')),/TAIL_UNIQUE_ANCHOR/);
 assert.throws(()=>actor.instrumentPipeline(original+actor.ANCHORS[0][0]),/TAIL_UNIQUE_ANCHOR/);
 assert.match(text,/hardwareAcceleration:'prefer-software'/);assert.doesNotMatch(text,/hardwareAcceleration:'no-preference'/);assert.doesNotMatch(text,/["']\.\//);assert.equal(workerText.split('__Q3_PIPELINE_BLOB__').length,2);
 assert.match(workerText,/stopImmediatePropagation/);assert.match(workerText,/phaseTimes:\{\.\.\.metrics.phaseTimes\}/);
 cp.execFileSync(process.execPath,['--check','--input-type=module'],{input:text});cp.execFileSync(process.execPath,['--check','--input-type=module'],{input:workerText});
});
async function fixture({hiddenRange=false,drift=false}={}){
 const p=actor.prepare('local-tail-fixture'),sourceModule=await import(pathToFileURL(path.join(ROOT,'media/drive-source.mjs')).href);
 // Only the test substitutes dynamic module loading; production helper bytes remain unchanged.
 const expression=actor.replaceOnce(helper,"await import('/media/drive-source.mjs')",'await __fakeSourceModule()');
 const controller={state:'activated'},account={accountId:'fake-account',authAccountKey:'fake-account-key',authGeneration:1,driveSessionGeneration:2,mediaSession:3,playbackSession:4,tokenRevision:5};
 const metadata={id:'fake-target',name:'fake-video',size:'18075476',mimeType:'video/mp4',modifiedTime:'fake-time',parents:['fake-folder'],version:'1',headRevisionId:'fake-revision',md5Checksum:'fake-md5',sha256Checksum:p.binding.fixture.sha256,trashed:false,capabilities:{canDownload:true}};
 const holder={metadata:{...metadata},account:{accountId:account.accountId,authAccountKey:account.authAccountKey}},owned={refs:{__q3TailTarget33:holder},cleaning:false};
 let clock=0,metadataCalls=0,workerCalls=0,blobCalls=0;const calls=[];
 const proof={get:()=>({controller,sourceCommit:PIN,sourceSHA256:p.binding.sourceSHA256})};
 const context={window:{__q3TailOwned33:owned,__q3TailTarget33:holder,__resumeSwProof:proof},state:{...account,authStatus:'online',accountStateLoaded:true,selected:null,accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null},navigator:{serviceWorker:{controller}},APP_VERSION:'1.22.0-rc.33',mediaSourceGeneration:6,document:{visibilityState:'visible'},el:{playerSheet:{hidden:true}},q0Playback:null,q1Playback:null,q3Choice:null,q1RetirementResult:{settled:true},hasUsableToken:()=>true,DRIVE_API:'https://www.googleapis.com/drive/v3',AbortController,TextEncoder,TextDecoder,Uint8Array,Response,performance:{now:()=>++clock},setTimeout,clearTimeout,__fakeSourceModule:async()=>sourceModule,
  Worker:function(){workerCalls++;throw Error('WORKER_PREFLIGHT_FORBIDDEN');},Blob:function(){blobCalls++;throw Error('BLOB_PREFLIGHT_FORBIDDEN');},URL:{createObjectURL:()=>{blobCalls++;throw Error('BLOB_PREFLIGHT_FORBIDDEN');},revokeObjectURL:()=>{}},
  driveFetch:async(url,options,retried,rate,auth,data)=>{calls.push({range:options.headers.Range??null,method:options.method,noRetry:options.driveNoRetry,retried,rate,auth,data});assert.equal(options.method,'GET');assert.equal(retried,true);assert.equal(options.driveNoRetry,true);if(options.headers.Range){return new Response(new Uint8Array(940),{status:206,headers:hiddenRange?{}:{'Content-Range':'bytes 0-939/18075476','Content-Length':'940'}});}metadataCalls++;return new Response(JSON.stringify({...metadata,...(drift&&metadataCalls>=3?{version:'2'}:{})}),{status:200});}
 };
 const install=vm.runInNewContext(expression,context),admission=install({...p,remainingMs:10000});const api=context.window.__q3TailTiming33;
 return{api,context,calls,admission,counts:()=>({workerCalls,blobCalls})};
}
async function waitDone(api){for(let i=0;i<200;i++){const r=api.read();if(r.done)return r;await new Promise(resolve=>setImmediate(resolve));}throw Error('LOCAL_WORK_NOT_DONE');}
test('preflight uses real openDriveQ1Source full revision metadata pre/post940B Range, zero Workers/Blobs and owned cleanup',async()=>{
 const f=await fixture();try{
  f.api.start({preflightOnly:true});const r=await waitDone(f.api);assert.equal(r.qualified,true);assert.equal(r.preflightOnly,true);assert.equal(r.workerStarted,false);assert.deepEqual(f.counts(),{workerCalls:0,blobCalls:0});assert.equal(r.sourceIO.metadataGets,4);assert.equal(r.sourceIO.rangeGets,1);assert.equal(r.sourceIO.rangeRequestedBytes,940);assert.equal(r.sourceIO.rangeHeadersExact,1);assert.equal(r.sourceCounts.readsCompleted,1);assert.equal(r.sourceCounts.metadataRequests,3);assert.ok(r.sourceIO.metadataGetMs>0);assert.ok(r.sourceIO.rangeGetMs>0);
  assert.doesNotMatch(JSON.stringify(r),/fake-account|fake-target|fake-revision|fake-md5|fake-folder/);
  await assert.rejects(Promise.resolve().then(()=>f.api.start({preflightOnly:true})),/TAIL_START_ONCE/);
 }finally{const clean=await f.api.stop();assert.equal(clean.settled,true);assert.equal(clean.blobsRevoked,true);assert.equal(clean.portsClosed,true);assert.equal(clean.privateClosureCleared,true);}
});
test('hidden directRange headers or revision drift fail before native Worker without header synthesis; source still aborts',async()=>{
 for(const options of [{hiddenRange:true},{drift:true}]){const f=await fixture(options);try{f.api.start({preflightOnly:true});const r=await waitDone(f.api);assert.equal(r.qualified,false);assert.ok(r.failure);assert.deepEqual(f.counts(),{workerCalls:0,blobCalls:0});if(options.hiddenRange){assert.equal(r.sourceIO.rangeStatus206,1);assert.equal(r.sourceIO.rangeHeadersExact,0);}assert.equal(r.nullSink.outputBytes,0);}finally{const clean=await f.api.stop();assert.equal(clean.sourceSettled,true);assert.equal(clean.settled,true);}}
});
test('current account/controller/selected/generation drift blocks work and idle diagnostic exports no private identity',async()=>{
 for(const change of [c=>{c.state.accountId='other';},c=>{c.state.authGeneration++;},c=>{c.navigator.serviceWorker.controller={state:'activated'};},c=>{c.state.selected={id:'other'};},c=>{c.mediaSourceGeneration++;}]){const f=await fixture();try{change(f.context);assert.equal(f.api.read().currentIdleAccountSourceGeneration,false);assert.throws(()=>f.api.start({preflightOnly:true}),/TAIL_IDLE_FENCE/);assert.equal(f.calls.length,0);}finally{await f.api.stop();}}
});
test('failed idle admission cannot read protected target or create product/native work',async()=>{
 let privateRead=false,nativeInput=false;const c={report:{model:'SM-X800',android:'16'},unmaskNativeVisibility:async()=>{},releaseMcpForNativeLifecycle:async()=>{},evaluateNative:async()=>({identity:false}),adb:()=>{nativeInput=true;},step:()=>{}};
 await assert.rejects(actor.run(c,{output:{},binding:{}},{progress:()=>{},readPrivate:()=>{privateRead=true;throw Error('PRIVATE_FORBIDDEN');},preflightOnly:true}),/TAIL_IDLE_ADMISSION/);assert.equal(privateRead,false);assert.equal(nativeInput,false);
});
