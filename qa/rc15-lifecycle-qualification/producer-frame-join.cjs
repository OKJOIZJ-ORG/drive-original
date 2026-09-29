'use strict';
// Maintained native-retirement provider/server and q1-product-audit lifecycle
// patterns; product HTTP bodies are never transformed. No real Google traffic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('../node_modules/playwright');
const root=path.resolve(__dirname,'../..'),publicFiles=require('../../scripts/public-files.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const hashes=()=>Object.fromEntries(publicFiles.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
const mode=process.argv[2]||'discriminator';assert.ok(['discriminator','q0-discriminator','cycles','long'].includes(mode));
const runId=new Date().toISOString().replace(/[:.]/g,'-'),reportPath=path.join(__dirname,`${mode}-${runId}.json`);
const report={runId,mode,scope:'Current byte-for-byte local app/SW, installed isolated Chrome, synthetic provider; no actual account, device, audible output, production or all-format proof.',producerStart:hashes(),
 harness:Object.fromEntries(['qualify.cjs','resource-snapshot.py','fixtures.py', '../q1-q2-app-integration/native-retirement-smoke.cjs','../q1-product-audit.cjs'].map(f=>[f,hash(fs.readFileSync(path.resolve(__dirname,f)))])),results:[],resources:[],passed:false};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const resource=(processes=[])=>JSON.parse(execFileSync('python',[path.join(__dirname,'resource-snapshot.py'),JSON.stringify(processes)],{encoding:'utf8',timeout:15000}));
const guard=r=>{assert.ok(r.host.commitAvailableGiB>=1.5,'HOST_COMMIT_HEADROOM_STOP');assert.ok(r.host.physicalAvailableGiB>=1,'HOST_PHYSICAL_HEADROOM_STOP');};
report.resources.push({phase:'before-launch',...resource()});guard(report.resources.at(-1));save();
const fixturePaths={aac:'qa/faststart-h264-aac.mp4',ac3:'qa/q2-audio-compatibility/synthetic-avc-ac3.mp4',longaac:'qa/rc15-lifecycle-qualification/synthetic-72s-aac.mp4',longac3:'qa/rc15-lifecycle-qualification/synthetic-72s-ac3.mp4'};
const fixtures=Object.fromEntries(Object.entries(fixturePaths).map(([name,f])=>{const bytes=fs.readFileSync(path.join(root,f));return [name,{bytes,sha:hash(bytes),path:f}];}));
report.fixtures=Object.fromEntries(Object.entries(fixtures).map(([name,f])=>[name,{path:f.path,sha256:f.sha,bytes:f.bytes.length}]));
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!publicFiles.includes(name))return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'}).end(fs.readFileSync(path.join(root,name)));});
let browser,browserCdp,origin;
async function sample(phase){const processInfo=await browserCdp.send('SystemInfo.getProcessInfo');const r={phase,...resource(processInfo.processInfo)};report.resources.push(r);save();guard(r);return r;}
async function fresh(){
 const context=await browser.newContext();let current=null;const network={media:0,metadata:0,downloads:0,bytes:0,swMedia:0,externalBlocked:0};
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();if(u.origin!=='https://www.googleapis.com'){network.externalBlocked++;return route.fulfill({status:403,body:'{}'});}assert.ok(current,'PROVIDER_WITHOUT_FIXTURE');assert.ok(['GET','POST','OPTIONS'].includes(req.method()),'PROVIDER_METHOD');
  const headers={'access-control-allow-origin':'*','access-control-expose-headers':'content-range,content-length,content-type'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'*'}});
  if(u.pathname.endsWith('/download')){network.downloads++;assert.equal(req.method(),'POST');return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({name:'synthetic/op',done:true,response:{'@type':'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse',partialDownloadAllowed:true,downloadUri:`https://www.googleapis.com/drive/v3/files/${current.id}/revisions/A?alt=media`}})});}
  assert.equal(req.method(),'GET','ONLY_SYNTHETIC_DOWNLOAD_POST');
  if(!u.searchParams.has('alt')){network.metadata++;return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({id:current.id,headRevisionId:'A',size:String(current.bytes.length),mimeType:'video/mp4',modifiedTime:'A',sha256Checksum:current.sha,trashed:false,capabilities:{canDownload:true,canReadRevisions:true}})});}
  network.media++;if(req.serviceWorker())network.swMedia++;assert.ok(req.serviceWorker(),'MEDIA_MUST_USE_ACTUAL_SW');const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers().range||''),a=m?+m[1]:0,b=m&&m[2]?Math.min(+m[2],current.bytes.length-1):current.bytes.length-1;assert.ok(a<=b&&b<current.bytes.length);network.bytes+=b-a+1;
  return route.fulfill({status:m?206:200,headers:{...headers,'content-length':String(b-a+1),...(m?{'content-range':`bytes ${a}-${b}/${current.bytes.length}`}:{})},contentType:'video/mp4',body:current.bytes.subarray(a,b+1)});
 });
 await context.addInitScript(()=>{
  const workers=new Set(),urls=new Set(),counts={workersCreated:0,workersTerminated:0,urlsCreated:0,urlsRevoked:0},NativeWorker=Worker;
  window.Worker=class extends NativeWorker{constructor(...args){super(...args);workers.add(this);counts.workersCreated++;}terminate(){if(workers.delete(this))counts.workersTerminated++;return super.terminate();}};
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=function(value){const u=create.call(this,value);urls.add(u);counts.urlsCreated++;return u;};URL.revokeObjectURL=function(u){if(urls.delete(u))counts.urlsRevoked++;return revoke.call(this,u);};
  window.qaResources=()=>({...counts,activeWorkers:workers.size,activeUrls:urls.size});
 });
 const page=await context.newPage(),errors=[],engineErrors=[];page.on('pageerror',e=>errors.push(e.name));page.on('crash',()=>{report.runtimeCrash=true;save();});page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(/out of memory/i.test(t))engineErrors.push('OUT_OF_MEMORY');else if(/memory access out of bounds/i.test(t))engineErrors.push('WASM_MEMORY_TRAP');}});
 await page.goto(origin);await page.waitForFunction(()=>navigator.serviceWorker.controller&&typeof startInitialOriginalPlayback==='function');
 await page.evaluate(()=>{state.token='synthetic';state.expiresAt=Date.now()+3600000;state.tokenRevision=1;state.authAccountKey='account';state.accountId='account';state.driveSessionGeneration=1;state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:false};state.demo=false;state.files=[];state.mediaFiles=[];state.populationComplete=true;el.videoPlayer.muted=true;sendTokenToWorker();});
 const sw=context.serviceWorkers()[0];assert.equal(context.serviceWorkers().length,1);assert.equal(new URL(sw.url()).pathname,'/sw.js');const cdp=await context.newCDPSession(page);
 const read=()=>page.evaluate(()=>({attempt:state.mediaAttempt,mode:state.mediaPlaybackMode,frames:el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames,time:playerTimeline().currentTime,duration:playerTimeline().duration,paused:el.videoPlayer.paused,ended:el.videoPlayer.ended,width:el.videoPlayer.videoWidth,buffered:Array.from({length:el.videoPlayer.buffered.length},(_,i)=>[el.videoPlayer.buffered.start(i),el.videoPlayer.buffered.end(i)]),stats:q1Playback?.player?.stats?.(),resources:qaResources()}));
 const open=async(route,index,long=false)=>{current={...fixtures[long?(route==='q2'?'longac3':'longaac'):route==='q2'?'ac3':'aac'],id:`synthetic-${index}`};
  await page.evaluate(({id,size})=>openPlayer({id,name:'synthetic.mp4',mimeType:'video/mp4',size:String(size),capabilities:{canDownload:true}}),{id:current.id,size:current.bytes.length});
  if(route==='q1'){
   await page.waitForFunction(()=>q0Playback?.audioProbeStarted&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0||state.mediaAttempt==='failed',null,{timeout:30000});await page.evaluate(()=>q0Playback?.setupDone);await page.evaluate(()=>tryOriginalTsPlayback(state.selected,state.mediaSession,{general:true}));
  }
  await page.waitForFunction(route=>state.mediaAttempt==='failed'||(route==='q0'?state.mediaPlaybackMode===PLAYBACK_MODE.RANGE&&q0Playback?.audioProbeStarted:state.mediaAttempt==='q1'&&q1Playback?.player?.stats()?.mapping&&state.mediaPlaybackMode===(route==='q2'?PLAYBACK_MODE.AUDIO_COMPATIBILITY:PLAYBACK_MODE.REPACKAGED))&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0,route,{timeout:30000});
  const value=await read();assert.notEqual(value.attempt,'failed','APP_ROUTE_FAILED');assert.equal(value.width,320);assert.equal(value.stats?.failure??null,null);return value;
 };
 const seek=async fraction=>page.evaluate(async fraction=>{
  const v=el.videoPlayer;v.pause();const target=playerTimeline().duration*fraction,prior=q1Playback?.player?.stats()?.generation??0;
  let callback,timer,candidate;window.qaSeekFrames=[];window.qaFailedSeek=null;
  const presented=new Promise((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);v.cancelVideoFrameCallback(callback);v.removeEventListener('seeked',settled);};
   // Chrome may present the target while `seeking` remains true. A paused
   // element then emits no second frame. Join the independently observed
   // target presentation and native seek settlement; never demand one order.
   const settled=()=>{if(candidate&&!v.seeking&&Math.abs(v.currentTime-target)<1/24+.004&&(!q1Playback||q1Playback.player.stats().generation>prior)){cleanup();resolve({...candidate,target,time:playerTimeline().currentTime,generation:q1Playback?.player?.stats()?.generation??null});return true;}return false;};
   const frame=(_,m)=>{const row={mediaTime:m.mediaTime,presentedFrames:m.presentedFrames,elementTime:v.currentTime,seekingAtFrame:v.seeking};qaSeekFrames.push(row);if(qaSeekFrames.length>8)qaSeekFrames.shift();if(Math.abs(m.mediaTime-target)<=1/24+.004)candidate=row;if(!settled())callback=v.requestVideoFrameCallback(frame);};
   v.addEventListener('seeked',settled);callback=v.requestVideoFrameCallback(frame);
   timer=setTimeout(()=>{cleanup();window.qaFailedSeek={target,prior,frames:qaSeekFrames,time:v.currentTime,seeking:v.seeking,paused:v.paused,readyState:v.readyState,error:v.error?.code,totalFrames:v.getVideoPlaybackQuality().totalVideoFrames};reject(Error('QA_SEEK_FRAME_TIMEOUT'));},20000);
  });setPlayerCurrentTime(v,target,'qa-lifecycle');return presented;
 },fraction);
 const close=async()=>{const closed=await page.evaluate(async()=>{const player=q1Playback?.player;closePlayer();const retirement=await q1Retirement;return {retirement,player:player?.stats?.(),resources:qaResources(),closed:{q1:q1Playback===null,q0:q0Playback===null,hidden:el.playerSheet.hidden,src:el.videoPlayer.getAttribute('src'),controller:state.mediaAbortController===null,temp:state.mediaTempStorage===null,blob:state.mediaBlobUrl===null,seekWatchdog:mediaSeekWatchdog===null,frameWatchdog:mediaFrameWatchdog===null,seekCleanup:activeSeekCleanup===null,frameCallback:state.frameCallbackId===null}};});
  closed.sw=await sw.evaluate(async()=>({activeOwners:q1TransportOwners.size,cleanupFences:q1CleanupFences.size,retiredThrough:q1RetiredThrough.size,q0Pins:q0Pins.size,q0Acquisitions:q0Acquisitions.size,controlledWindows:(await self.clients.matchAll({type:'window',includeUncontrolled:false})).length}));
  assert.equal(closed.retirement.settled,true);assert.equal(closed.resources.activeWorkers,0);assert.equal(closed.resources.activeUrls,0);assert.equal(closed.sw.activeOwners,0);assert.equal(closed.sw.cleanupFences,0);assert.equal(closed.sw.q0Pins,0);assert.equal(closed.sw.q0Acquisitions,0);assert.equal(closed.sw.retiredThrough,1);assert.equal(closed.sw.controlledWindows,1);
  assert.deepEqual(closed.closed,{q1:true,q0:true,hidden:true,src:null,controller:true,temp:true,blob:true,seekWatchdog:true,frameWatchdog:true,seekCleanup:true,frameCallback:true});
  if(closed.player){assert.equal(closed.player.disposed,true);assert.equal(closed.player.failure,null);assert.equal(closed.player.cleanup.settled,true);assert.equal(closed.player.cleanup.source.settled,true);assert.equal(closed.player.cleanup.worker.settled,true);assert.equal(closed.player.cleanup.worker.activeReads,0);assert.equal(closed.player.cleanup.worker.pendingChunks,0);assert.equal(closed.player.cleanup.worker.pendingWindows,0);assert.equal(closed.player.cleanup.worker.workerTerminated,true);}
  await cdp.send('HeapProfiler.collectGarbage');closed.dom=await cdp.send('Memory.getDOMCounters');closed.heap=await cdp.send('Runtime.getHeapUsage');
  const inventory=await cdp.send('Runtime.evaluate',{includeCommandLineAPI:true,returnByValue:true,expression:`(()=>{let total=0,targets=0;const counts={};for(const t of [window,document,...document.querySelectorAll('*')]){const listeners=getEventListeners(t);if(Object.keys(listeners).length)targets++;for(const [name,rows] of Object.entries(listeners)){counts[name]=(counts[name]||0)+rows.length;total+=rows.length;}}return {total,targets,counts};})()`});assert.equal(inventory.exceptionDetails,undefined);closed.listeners=inventory.result.value;assert.equal(context.serviceWorkers()[0],sw);assert.equal(context.serviceWorkers().length,1);assert.deepEqual(errors,[]);assert.deepEqual(engineErrors,[]);return closed;
 };
 return {context,page,read,open,seek,close,network,errors,engineErrors};
}
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();browserCdp=await browser.newBrowserCDPSession();await sample('launched');
 if(mode==='discriminator')for(let i=1;i<=3;i++){const t=await fresh(),r={case:'fresh-cold-q2',cycle:i,passed:false};report.results.push(r);save();try{r.start=await t.open('q2',i);r.seeks=[];for(const f of [.1,.5,.9])r.seeks.push(await t.seek(f));r.after=await t.close();r.network=t.network;await sample(`cold-${i}-closed`);r.passed=true;save();console.log('cold',i,'PASS');}finally{await t.context.close();}}
 if(mode==='cycles'||mode==='q0-discriminator'){
  const t=await fresh();let baseline=null;try{for(let i=1;i<=(mode==='q0-discriminator'?12:50);i++){const route=mode==='q0-discriminator'?'q0':['q1','q2','q0'][(i-1)%3],r={cycle:i,route,passed:false};report.results.push(r);save();r.start=await t.open(route,i);r.seeks=[];for(const f of [.1,.5,.9])r.seeks.push(await t.seek(f));r.after=await t.close();if(i>=3){baseline??={dom:r.after.dom,listeners:r.after.listeners};assert.deepEqual(r.after.listeners,baseline.listeners,'CLOSED_CONNECTED_LISTENERS_STABLE');assert.ok(r.after.dom.nodes<=baseline.dom.nodes+8,'CLOSED_DOM_NODES_BOUNDED');assert.ok(r.after.dom.jsEventListeners<=baseline.dom.jsEventListeners+8,'CLOSED_DOM_LISTENERS_BOUNDED');}if(i%5===0)await sample(`cycle-${i}-closed`);r.passed=true;save();console.log('cycle',i,route,'PASS');}report.network=t.network;}catch(e){report.failureObservation=await t.read();report.failedSeek=await t.page.evaluate(()=>window.qaFailedSeek);report.failureNetwork=t.network;report.failureEngineErrors=t.engineErrors;await sample('failure-live');throw e;}finally{await t.context.close();}
 }
 if(mode==='long'){
  const t=await fresh();try{for(const route of ['q1','q2','q0']){const r={route,passed:false,samples:[]};report.results.push(r);save();r.start=await t.open(route,route,true);await t.page.evaluate(()=>{el.videoPlayer.playbackRate=1;return el.videoPlayer.play();});const started=Date.now();
   for(let i=0;i<24;i++){await t.page.waitForTimeout(4000);const view=await t.read();r.samples.push({elapsedMs:Date.now()-started,...view});assert.notEqual(view.attempt,'failed','LONG_ROUTE_FAILED');assert.equal(view.stats?.failure??null,null);if(i%5===0)await sample(`long-${route}-${i}`);save();if(view.paused&&view.time>=view.duration)break;}
   r.end=await t.read();r.elapsedMs=Date.now()-started;assert.equal(r.end.time,r.end.duration,'SOURCE_CLOCK_END');assert.equal(r.end.paused,true);assert.ok(r.end.frames>=1650,'LONG_DECODED_FRAME_COUNT');assert.ok(r.elapsedMs>=65000&&r.elapsedMs<96000,'CONTIGUOUS_REALTIME_DURATION');
   if(route!=='q0'){assert.ok(r.end.stats.removals>0,'LONG_BUFFER_REMOVAL_REQUIRED');assert.ok(r.end.stats.waits>0,'LONG_BACKPRESSURE_REQUIRED');assert.ok(r.end.stats.peakAhead<=38,'LONG_AHEAD_BOUNDED');assert.ok(r.end.stats.peakRetainedAppendBytes<=24*1024*1024,'LONG_APPEND_BYTES_BOUNDED');assert.equal(r.end.stats.worker.terminated,true);assert.equal(r.end.stats.worker.activeReads,0);assert.equal(r.end.stats.worker.pendingChunks,0);}
   r.after=await t.close();await sample(`long-${route}-closed`);r.passed=true;save();console.log('long',route,'PASS',r.elapsedMs);}
   report.network=t.network;
  }finally{await t.context.close();}
 }
 report.producerEnd=hashes();assert.deepEqual(report.producerStart,report.producerEnd,'PRODUCT_BYTES_CHANGED');report.passed=true;
}catch(e){report.failure={name:e.name,code:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:/QA_SEEK_FRAME_TIMEOUT/.test(e.message)?'QA_SEEK_FRAME_TIMEOUT':e.name==='TimeoutError'?'HARNESS_TIMEOUT':'ASSERTION_OR_HARNESS_FAILURE'};console.error(e);process.exitCode=1;
 try{report.failureObservation??=await browser?.contexts()?.[0]?.pages()?.[0]?.evaluate(()=>({attempt:state.mediaAttempt,mode:state.mediaPlaybackMode,stats:q1Playback?.player?.stats?.(),resources:qaResources()}));await sample('failure');}catch{}
}finally{await browser?.close();report.browserClosed=true;report.resources.push({phase:'after-owned-browser-close',...resource()});report.producerEnd=hashes();save();await new Promise(r=>server.close(r));console.log(reportPath);}})();
