'use strict';
// Actual app + its service worker + generated public media. All Google routes
// are synthetic; no real credentials, media, account writes or device claims.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),allowed=new Set(require('../scripts/public-files.cjs'));
const tsBytes=fs.readFileSync(path.join(__dirname,'v2-07b-ts-q1/synthetic-bframes-audiolead.ts'));
const mp4Bytes=fs.readFileSync(path.join(__dirname,'faststart-h264-aac.mp4'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const producerFiles=['qa/q1-product-audit.cjs',...allowed];
const sourceHashes=()=>Object.fromEntries(producerFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const sources=sourceHashes();
const reportTag=process.env.Q1_AUDIT_REPORT_TAG||'';
assert.ok(!reportTag||/^[a-z0-9-]{1,48}$/.test(reportTag),'SCOPED_REPORT_TAG');
assert.equal(hash(tsBytes),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
assert.equal(hash(mp4Bytes),'178d8b884e2668a2da18ffba63960ec192f810b91c151cdab6e3080687328079');
// One inert ISO-BMFF free box produces a valid packet-aligned non-TS control.
const padding=Buffer.alloc((188-mp4Bytes.length%188)%188+188);padding.writeUInt32BE(padding.length);padding.write('free',4);
const alignedMp4=Buffer.concat([mp4Bytes,padding]);assert.equal(alignedMp4.length%188,0);
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
  const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!allowed.has(file)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store'}).end(fs.readFileSync(path.join(root,file)));
});
const results=[];let browser,browserCdp;
const {execFileSync}=require('node:child_process');const observations=[];
const resource=(processes=[])=>JSON.parse(execFileSync('python',[path.join(root,'qa/rc15-lifecycle-qualification/resource-snapshot.py'),JSON.stringify(processes)],{encoding:'utf8',timeout:15000}));
const guard=r=>{assert.ok(r.host.commitAvailableGiB>=1.5,'HOST_COMMIT_HEADROOM_STOP');assert.ok(r.host.physicalAvailableGiB>=1,'HOST_PHYSICAL_HEADROOM_STOP');};
const nativeSample=async phase=>{const p=await browserCdp.send('SystemInfo.getProcessInfo'),r={phase,...resource(p.processInfo)};observations.push(r);guard(r);};
const before=resource();observations.push({phase:'before-launch',...before});guard(before);
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});browserCdp=await browser.newBrowserCDPSession();await nativeSample('launched');
  for(const mode of ['native-to-q1','resume-to-q1','postflight-content-change','close-pending','seek-watchdog',
    'early-to-q1','early-resume','early-revision-drift','early-permission-denied','early-close-pending',
    'early-mp4','early-mp4-no-revision','early-mp4-unaligned','native-capability','early-double-pending','early-checksum-drift',
    ...(process.argv[2]==='cycles-50'?['cycles-50']:[])]){
    if(process.argv[2]&&mode!==process.argv[2])continue;
    const context=await browser.newContext(),page=await context.newPage(),errors=[],calls=[];
    if(mode==='cycles-50')await context.addInitScript(()=>{
      const metrics={workersCreated:0,workersTerminated:0,urlsCreated:0,urlsRevoked:0};
      const workers=new WeakSet(),urls=new Set(),NativeWorker=Worker;
      window.Worker=class extends NativeWorker{
        constructor(...args){super(...args);workers.add(this);metrics.workersCreated++;}
        terminate(){if(workers.delete(this))metrics.workersTerminated++;return super.terminate();}
      };
      const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
      URL.createObjectURL=function(value){const url=create.call(this,value);urls.add(url);metrics.urlsCreated++;return url;};
      URL.revokeObjectURL=function(url){if(urls.delete(url))metrics.urlsRevoked++;return revoke.call(this,url);};
      window.q1CycleResources=()=>({...metrics,activeWorkers:metrics.workersCreated-metrics.workersTerminated,activeUrls:urls.size});
    });
    const early=mode.startsWith('early-'),nativeControl=mode.startsWith('early-mp4');
    const bytes=nativeControl?(mode==='early-mp4-unaligned'?mp4Bytes:alignedMp4):tsBytes;
    let metadataReads=0,previews=0,held=null,actualWorker=null;
    const file={id:'synthetic-ts',name:'public-fixture.mp4',mimeType:'video/mp4',size:String(bytes.length),
      headRevisionId:'source-revision-1',version:'1',modifiedTime:'2026-09-26T00:00:00.000Z',sha256Checksum:hash(bytes),
      trashed:false,parents:['root'],capabilities:{canDownload:true},videoMediaMetadata:{width:360,height:640,durationMillis:'12254'}};
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin===base)return route.continue();
      if(url.hostname==='drive.google.com'){previews++;return route.abort();}
      if(url.hostname!=='www.googleapis.com')return route.abort();
      const headers=await req.allHeaders();
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'*'}});
      assert.equal(req.method(),'GET','NO_DRIVE_MUTATIONS');
      const reply=data=>route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'},body:JSON.stringify(data)});
      if(url.searchParams.get('alt')!=='media'){
        metadataReads++;calls.push({kind:'metadata',sequence:metadataReads});
        if((mode==='close-pending'&&metadataReads===5)||(mode==='early-close-pending'&&metadataReads===2)){held=route;return;}
        return reply({...file,id:mode==='cycles-50'?decodeURIComponent(url.pathname.split('/').at(-1)):file.id,version:String(metadataReads),
          sha256Checksum:mode==='early-checksum-drift'?(metadataReads===1?undefined:metadataReads<=3?hash(bytes):'a'.repeat(64)):file.sha256Checksum,
          headRevisionId:mode==='early-mp4-no-revision'?undefined
            :((mode==='postflight-content-change'&&metadataReads>=6)||(mode==='early-revision-drift'&&metadataReads>=4))?'source-revision-2':file.headRevisionId,
          capabilities:{canDownload:mode!=='early-permission-denied'}});
      }
      assert.equal(Boolean(req.serviceWorker()),true,'MEDIA_MUST_USE_PRODUCT_SW');
      if(mode==='cycles-50')assert.equal(req.serviceWorker(),actualWorker,'MEDIA_MUST_USE_CONTROLLED_ACTUAL_SW');
      assert.equal(headers.authorization,'Bearer synthetic-test-token');
      const match=/^bytes=(\d+)-(\d*)$/.exec(headers.range||'');
      const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
      assert.ok(start>=0&&start<=end&&end<bytes.length);
      calls.push({kind:'media',range:headers.range||null,start,end});
      // Content-Range intentionally lacks Access-Control-Expose-Headers,
      // reproducing the existing SW's CORS-hidden exact-length reconstruction.
      return route.fulfill({status:match?206:200,headers:{'Content-Type':'video/mp4','Access-Control-Allow-Origin':'*',
        'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Accept-Ranges':'bytes','Cache-Control':'no-store'},
        body:bytes.subarray(start,end+1)});
    });
    try{
      await page.goto(`${base}/?demo=1`);await page.waitForFunction(()=>typeof startInitialOriginalPlayback==='function');
      await page.evaluate(()=>navigator.serviceWorker.ready);
      if(!await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)))await page.reload();
      await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
      if(mode==='cycles-50'){
        assert.equal(context.serviceWorkers().length,1,'ONE_ACTUAL_SW_PER_FRESH_CONTEXT');
        actualWorker=context.serviceWorkers()[0];
        assert.equal(new URL(actualWorker.url()).pathname,'/sw.js','ACTUAL_PRODUCT_SW');
        assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL),actualWorker.url(),'ACTUAL_SW_CONTROLS_PAGE');
        await page.evaluate(file=>{
          state.demo=false;state.token='synthetic-test-token';state.expiresAt=Date.now()+3600000;
          state.authAccountKey='synthetic-account';state.accountId='synthetic-account';state.tokenRevision=1;
        state.driveSessionGeneration=1;state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:false};
          state.files=[];state.populationComplete=true;state.mediaFiles=[];el.videoPlayer.muted=true;sendTokenToWorker();
        },file);
        const cdp=await context.newCDPSession(page),cycles=[];let baselineListeners=null,baselineRetainedDom=null;
        for(let cycle=1;cycle<=50;cycle++){
          const cycleFile={...file,id:cycle%2?'synthetic-ts-a':'synthetic-ts-b'};
          await page.evaluate(file=>openPlayer(file),cycleFile);
          await page.waitForFunction(()=>state.mediaAttempt==='q1'&&state.mediaTransportVerified&&state.mediaDecodeVerified
            &&q1Playback?.player?.stats().frames>0&&el.videoPlayer.videoWidth===360,{},{timeout:20000});
          const firstFrame=await page.evaluate(()=>({time:q1Playback.player.stats().lastMediaTime,
            width:el.videoPlayer.videoWidth,height:el.videoPlayer.videoHeight,duration:q1Playback.player.stats().duration}));
          assert.equal(await page.evaluate(()=>q1Playback.player.stats().probeInputReused),true);
        const seeks=[];
          for(const fraction of [.1,.5,.9]){
            await page.evaluate(fraction=>{
              el.videoPlayer.pause();window.q1PreviousGeneration=q1Playback.player.stats().generation;
              setPlayerCurrentTime(el.videoPlayer,q1Playback.player.stats().duration*fraction,'qa-cycle-controls');
            },fraction);
            await page.waitForFunction(()=>q1Playback?.player?.stats().generation>window.q1PreviousGeneration
              &&q1Playback.player.stats().frames>0&&state.mediaTransportVerified
              &&Math.abs(q1Playback.player.stats().lastMediaTime-q1Playback.player.stats().target)<1/30+.0001,{},{timeout:15000});
            const presented=await page.evaluate(()=>({target:q1Playback.player.stats().target,
              mediaTime:q1Playback.player.stats().lastMediaTime,frames:q1Playback.player.stats().frames,
              generation:q1Playback.player.stats().generation,width:el.videoPlayer.videoWidth,paused:el.videoPlayer.paused}));
            assert.equal(presented.width,360);assert.equal(presented.paused,true);seeks.push({fraction,...presented});
          }
          // Retain only this cycle's owner until its real retirement settles; return JSON scalars, then release it.
          const cleanup=await page.evaluate(async()=>{
            const owner=q1Playback;closePlayer();const retirement=await q1Retirement;
            return {retirement,player:owner.player.stats(),resources:q1CycleResources(),closed:{
              q1:q1Playback===null,hidden:el.playerSheet.hidden,src:el.videoPlayer.getAttribute('src'),
              controller:state.mediaAbortController===null,temp:state.mediaTempStorage===null,blob:state.mediaBlobUrl===null,
              seekWatchdog:mediaSeekWatchdog===null,frameWatchdog:mediaFrameWatchdog===null,seekCleanup:activeSeekCleanup===null,
              frameCallback:state.frameCallbackId===null}};
          });
          assert.equal(cleanup.retirement.settled,true,'ACTUAL_RETIREMENT_SETTLED');
          assert.equal(context.serviceWorkers().length,1,'ONE_SW_THROUGHOUT_CYCLES');
          assert.equal(context.serviceWorkers()[0],actualWorker,'SAME_ACTUAL_SW_THROUGHOUT_CYCLES');
          assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL),actualWorker.url(),'ACTUAL_SW_STILL_CONTROLS_PAGE');
          // Direct actual-SW ownership sample after the application's retirement barrier.
          // Return aggregates only: client/request IDs and generation cutoffs never leave the SW.
          cleanup.sw=await actualWorker.evaluate(async()=>{
            const controlled=await self.clients.matchAll({type:'window',includeUncontrolled:false});
            const liveIds=new Set(controlled.map(client=>client.id));
            return {activeOwners:q1TransportOwners.size,cleanupFenceClients:q1CleanupFences.size,
              retiredThroughClients:q1RetiredThrough.size,controlledWindowClients:controlled.length,
              retiredThroughAllLive:[...q1RetiredThrough.keys()].every(id=>liveIds.has(id))};
          });
          assert.deepEqual(cleanup.sw,{activeOwners:0,cleanupFenceClients:0,retiredThroughClients:1,
            controlledWindowClients:1,retiredThroughAllLive:true},'ACTUAL_SW_RETIREMENT_OWNERS_ZERO_AND_CUTOFF_MAP_BOUNDED');
          assert.equal(cleanup.player.disposed,true);assert.equal(cleanup.player.urlRevoked,true);
          assert.equal(cleanup.player.failure,null);assert.equal(cleanup.player.cleanupFailure,undefined);
          assert.equal(cleanup.player.sourceCleanup.settled,true);
          for(const key of ['pendingCallbacks','cleanupPending'])assert.equal(cleanup.player.sourceCleanup[key],0);
          assert.equal(cleanup.player.source.state,'aborted');assert.equal(cleanup.player.source.busy,false);assert.equal(cleanup.player.source.cleanupSettled,true);
          for(const key of ['retainedBytes','pendingCallbacks','cleanupPending'])assert.equal(cleanup.player.source[key],0);
          assert.equal(cleanup.player.source.cleanupFailed,false);assert.equal(cleanup.player.bootstrap.retainedBytes,0);
          const worker=cleanup.player.worker;assert.equal(worker.terminated,true);assert.equal(worker.fragmentBusy,false);
          assert.equal(worker.failure,null);assert.ok(['aborted','finished'].includes(worker.status));
          assert.equal(worker.worker.muxReleased,true);assert.equal(worker.worker.awaitingFragment,null);
          for(const key of ['retainedInputBytes','retainedOutputBytes','outstandingOutputBytes','configBytes','initBytes',
            'muxCachedGops','muxCachedNalBytes','muxCachedBufferBytes'])assert.equal(worker.worker[key],0);
          assert.equal(worker.worker.owner.retainedBytes,0);
          assert.deepEqual(cleanup.closed,{q1:true,hidden:true,src:null,controller:true,temp:true,blob:true,
            seekWatchdog:true,frameWatchdog:true,seekCleanup:true,frameCallback:true});
          assert.equal(cleanup.resources.activeWorkers,0);assert.equal(cleanup.resources.activeUrls,0);
          assert.equal(cleanup.resources.workersCreated,cleanup.resources.workersTerminated);
          assert.equal(cleanup.resources.urlsCreated,cleanup.resources.urlsRevoked);
          // Global DOM counters also count unreachable/transient targets until GC. Assert the
          // connected app inventory through supported CDP command-line getEventListeners instead.
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          await cdp.send('HeapProfiler.collectGarbage');
          const dom=await cdp.send('Memory.getDOMCounters');
          if(baselineRetainedDom===null)baselineRetainedDom=dom;
          assert.deepEqual(dom,baselineRetainedDom,'CLOSED_AFTER_GC_DOM_COUNTERS_STABLE');
          const inventory=await cdp.send('Runtime.evaluate',{includeCommandLineAPI:true,returnByValue:true,
            expression:`(()=>{const counts={};let total=0,targets=0;for(const target of [window,document,...document.querySelectorAll('*')]){
              const listeners=getEventListeners(target);if(Object.keys(listeners).length)targets++;
              for(const [type,rows] of Object.entries(listeners)){counts[type]=(counts[type]||0)+rows.length;total+=rows.length;}}
              return {total,targets,counts};})()`});
          assert.equal(inventory.exceptionDetails,undefined,'CDP_LISTENER_INVENTORY_SUPPORTED');
          const listeners=inventory.result.value;
          if(baselineListeners===null)baselineListeners=listeners;
          assert.deepEqual(listeners,baselineListeners,'CLOSED_CONNECTED_DOM_LISTENERS_STABLE');
          cycles.push({cycle,fileId:cycleFile.id,firstFrame,seeks,cleanup,dom,listeners});
        }
        assert.equal(previews,0);assert.deepEqual(errors,[]);
        assert.ok(calls.filter(row=>row.kind==='media').every(row=>row.end-row.start+1<=1048576));
        results.push({mode,passed:true,completedCycles:cycles.length,seekCount:cycles.reduce((n,row)=>n+row.seeks.length,0),
          metadataReads,mediaReads:calls.filter(row=>row.kind==='media').length,previews,errors,baselineListeners,baselineRetainedDom,
          gc:'Supported CDP HeapProfiler.collectGarbage before every closed-state counter sample; no heap size measurement.',cycles});
        await cdp.detach();continue;
      }
      await page.evaluate(({file,mode,early})=>{
        state.demo=false;state.token='synthetic-test-token';state.expiresAt=Date.now()+3600000;
        state.authAccountKey='synthetic-account';state.accountId='synthetic-account';state.tokenRevision=1;
        state.selected=file;state.mediaSession++;state.pendingPlay=true;state.mediaRetryCount=0;
        window.q1Trace=[];window.__driveOriginalMediaTraceSink=row=>window.q1Trace.push(row);
        beginMediaDiagnosticTrace(file,state.mediaSession);
        window.q1MseSources=0;const createObjectURL=URL.createObjectURL;
        URL.createObjectURL=function(value){if(value instanceof MediaSource)window.q1MseSources++;return createObjectURL.call(this,value);};
        el.playerSheet.hidden=false;el.videoPlayer.hidden=false;el.videoPlayer.muted=true;
        if(mode==='early-resume')state.resumePosition={fileId:file.id,time:6.1,
          snapshot:{time:6.1,paused:false,muted:true,volume:.25,playbackRate:1.25,decoded:false}};
        if(mode==='native-capability'){
          const native=el.videoPlayer.canPlayType.bind(el.videoPlayer);
          el.videoPlayer.canPlayType=type=>type==='video/mp2t'?'maybe':native(type);
        }
        if(mode==='early-double-pending'){
          window.q1HeldOpening=0;
          driveFetch=()=>{window.q1HeldOpening++;return new Promise(()=>{});};
        }
        state.playbackOrderIds=[file.id];sendTokenToWorker();
        // The first five preserve the post-native-failure fallback acceptance.
        if(early||mode==='native-capability')startInitialOriginalPlayback(file,'video',state.mediaSession);
        else startOriginalRangePlayback(file,'video',state.mediaSession);
      },{file,mode,early});
      if(mode==='resume-to-q1')await page.evaluate(()=>{
        state.resumePosition={fileId:state.selected.id,time:6.1,snapshot:{time:6.1,paused:false,muted:true,volume:1,playbackRate:1,decoded:false}};
      });
      if(mode==='early-double-pending'){
        await page.waitForFunction(()=>window.q1HeldOpening===1);
        await page.evaluate(()=>startInitialOriginalPlayback(state.selected,'video',state.mediaSession));
        assert.equal(await page.evaluate(()=>window.q1HeldOpening),1,'DUPLICATE_MUST_NOT_OPEN_AROUND_OLD_CALLBACK');
        assert.equal(await page.evaluate(()=>state.mediaAttempt),'failed');
        assert.equal((await page.evaluate(()=>q1Retirement)).settled,false);
        assert.equal(calls.length,0);assert.equal(await page.evaluate(()=>window.q1MseSources),0);
        results.push({mode,passed:true,blockedUnsettledOpening:true});
      }else if(mode==='close-pending'||mode==='early-close-pending'){
        const end=Date.now()+15000;while(!held&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,25));assert.ok(held);
        await page.evaluate(()=>closePlayer({preserveHistory:true}));
        await held.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(file)}).catch(()=>{});
        const cleanup=await page.evaluate(()=>q1Retirement);assert.equal(cleanup.settled,true);
        assert.equal(await page.evaluate(()=>q1Playback===null&&el.playerSheet.hidden&&el.videoPlayer.getAttribute('src')===null),true);
        if(early)assert.equal(calls.filter(row=>row.kind==='media').length,0,'CLOSED_PROBE_MUST_NOT_READ');
        results.push({mode,passed:true,metadataReads});
      }else if(mode==='postflight-content-change'||mode==='early-revision-drift'||mode==='early-permission-denied'||mode==='early-checksum-drift'){
        await page.waitForFunction(()=>state.mediaAttempt==='failed'&&!el.mediaError.hidden);
        assert.equal(await page.evaluate(()=>el.videoPlayer.videoWidth),0);
        assert.equal(await page.evaluate(()=>state.mediaDecodeVerified),false);
        const failure=await page.evaluate(()=>({sources:window.q1MseSources,trace:window.q1Trace.filter(row=>row.stage==='q1-failed')}));
        assert.equal(failure.sources,0,'POSTFLIGHT_DRIFT_MUST_PRECEDE_MSE_CREATION');
        assert.equal(failure.trace.at(-1)?.reason,mode==='early-permission-denied'?'Q1_SOURCE_PERMISSION':'Q1_SOURCE_CONTENT_DRIFT');
        if(early)assert.equal(calls.filter(row=>row.kind==='media').length,mode==='early-permission-denied'?0:1);
        results.push({mode,passed:true,metadataReads,failure});
      }else if(nativeControl){
        await page.waitForFunction(()=>state.mediaDecodeVerified&&el.videoPlayer.currentTime>.1);
        assert.equal(await page.evaluate(()=>state.mediaAttempt),'range');
        assert.equal(await page.evaluate(()=>q1Playback),null);
        const probes=calls.filter(row=>row.kind==='media'&&row.range==='bytes=0-939');
        assert.equal(probes.length,mode==='early-mp4'?1:0);
        assert.equal(metadataReads,mode==='early-mp4'?3:mode==='early-mp4-no-revision'?1:0);
        const frame=await page.evaluate(()=>({width:el.videoPlayer.videoWidth,height:el.videoPlayer.videoHeight,time:state.lastPresentedMediaTime}));
        assert.ok(frame.width>0&&frame.height>0);
        await page.evaluate(()=>closePlayer({preserveHistory:true}));assert.equal((await page.evaluate(()=>q1Retirement)).settled,true);
        results.push({mode,passed:true,metadataReads,frame,probeBytes:probes.length*940});
      }else{
        await page.waitForFunction(()=>state.mediaAttempt==='q1'&&state.mediaTransportVerified,{},{timeout:20000});
        await page.evaluate(()=>{window.lastQ1=q1Playback.player;});
        // The original user's play intent must survive native code4/retry.
        await page.waitForFunction(()=>state.mediaDecodeVerified&&el.videoPlayer.currentTime>.5);
        assert.equal(await page.evaluate(()=>getPlaybackQualityLabel(state.mediaPlaybackMode,state.mediaTransportVerified)),'원본 스트림 · 재포장');
        assert.equal(await page.evaluate(()=>el.videoPlayer.videoWidth),360);
        assert.equal(calls.filter(row=>row.kind==='media'&&row.range==='bytes=0-').length,early?0:2,'ONLY_LATE_FALLBACK_TRIES_NATIVE');
        assert.equal(await page.evaluate(()=>q1Trace.filter(row=>row.stage==='media-error'&&row.mediaErrorCode===4).length),early?0:2);
        if(early){assert.equal(calls.find(row=>row.kind==='media').range,'bytes=0-939');
          assert.ok(calls.filter(row=>row.kind==='media').every(row=>row.end-row.start+1<=1048576));}
        if(mode==='seek-watchdog'){
          await page.evaluate(()=>{
            beginMediaSeekIntent(el.videoPlayer,6.1,'qa-no-frame');
            if(!mediaSeekWatchdog)throw new Error('Q1_SEEK_WATCHDOG_NOT_OWNED');
            failMediaSeekWatchdog(mediaSeekWatchdog);
          });
          assert.equal(await page.evaluate(()=>state.mediaAttempt==='failed'&&q1Playback===null),true);
          assert.equal((await page.evaluate(()=>q1Retirement)).settled,true);
          assert.equal(calls.filter(row=>row.kind==='media'&&row.range==='bytes=0-').length,2,'NO_Q0_RETRY_AFTER_Q1_WATCHDOG');
          assert.equal(previews,0);assert.deepEqual(errors,[]);
          results.push({mode,passed:true,metadataReads});continue;
        }
        if(mode==='resume-to-q1'||mode==='early-resume')assert.ok(await page.evaluate(()=>el.videoPlayer.currentTime>=6.1&&q1Playback.player.stats().generation===1));
        if(mode==='early-resume')assert.deepEqual(await page.evaluate(()=>[el.videoPlayer.volume,el.videoPlayer.playbackRate,el.videoPlayer.muted]),[.25,1.25,true]);
        const seeks=[];
        for(const seconds of [1.2,6.1,0,1000,11.95]){
          await nativeSample('before-seek-'+seconds);
          await page.evaluate(seconds=>{
            el.videoPlayer.pause();window.previousQ1Generation=q1Playback.player.stats().generation;
            setPlayerCurrentTime(el.videoPlayer,seconds,'qa-product-controls');
          },seconds);
          await page.waitForFunction(()=>q1Playback?.player?.stats().generation>window.previousQ1Generation
            &&q1Playback.player.stats().frames>0&&state.mediaTransportVerified&&['ready','ended'].includes(q1Playback.player.stats().phase),{},{timeout:15000});
          const frame=await page.evaluate(()=>({reused:q1Playback.player.stats().probeInputReused,mediaTime:q1Playback.player.stats().lastMediaTime,width:el.videoPlayer.videoWidth,
            target:q1Playback.player.stats().target,requestedTime:el.videoPlayer.currentTime,paused:el.videoPlayer.paused}));
          assert.ok(Math.abs(frame.mediaTime-frame.target)<1/30+.0001);assert.equal(frame.width,360);seeks.push(frame);
          assert.equal(frame.reused,true);assert.equal(frame.paused,true);if(seconds===11.95)await page.evaluate(()=>el.videoPlayer.play());
        }
        await page.waitForFunction(()=>el.videoPlayer.ended,{},{timeout:10000});
        const playback=await page.evaluate(()=>q1Playback.player.stats());assert.ok(playback.frames>0);
        await page.evaluate(()=>closePlayer({preserveHistory:true}));
        const cleanup=await page.evaluate(()=>q1Retirement);assert.equal(cleanup.settled,true);
        assert.equal(await page.evaluate(()=>q1Playback===null&&el.videoPlayer.getAttribute('src')===null),true);
        const assetCache=await page.evaluate(async()=>{
          const names=await caches.keys(),keys=(await Promise.all(names.map(async name=>(await (await caches.open(name)).keys()).map(request=>new URL(request.url).pathname)))).flat();
          return keys.filter(name=>name.startsWith('/media/')).sort();
        });
        assert(assetCache.every(name=>allowed.has(name.slice(1))),'CACHE_ONLY_PUBLIC_ASSETS');
        for(const file of ['media/ts-player.mjs','media/drive-source.mjs','media/q1-core.mjs','media/transmux-worker.mjs','media/mux-mp4.min.js'])assert(assetCache.includes('/'+file),'REQUIRED_Q1_ASSET_PRECACHED');
        await nativeSample('closed-app');
        results.push({mode,passed:true,metadataReads,seeks,playback,cleanup,assetCache,nativeMediaCalls:calls.filter(row=>row.kind==='media').length});
      }
      assert.equal(previews,0);assert.deepEqual(errors,[]);
    }catch(error){results.push({mode,passed:false,error:error.message,errors,calls,
      app:await page.evaluate(()=>({attempt:state.mediaAttempt,q1:(q1Playback?.player||window.lastQ1)?.stats(),error:el.mediaErrorMessage.textContent})).catch(()=>null)});throw error;}
    finally{await context.close();}
  }
  assert.deepEqual(sourceHashes(),sources,'PRODUCT_CHANGED_DURING_VERIFICATION');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  const cycleReport=process.argv[2]==='cycles-50',separateNormal=process.env.Q1_AUDIT_REPORT==='cycles-normal16';
  const out=path.join(root,'qa/rc19-ts-probe-reuse');fs.mkdirSync(out,{recursive:true});
  const reportName='native-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'; const unusedReportName=reportTag&& (cycleReport||separateNormal)
    ?`${cycleReport?'cycles-50':'normal16'}-${reportTag}-results.json`
    :cycleReport?'cycles-50-results.json':separateNormal?'normal16-results.json':'results.json';
  fs.writeFileSync(path.join(out,reportName),JSON.stringify({syntheticOnly:true,passed:!process.exitCode,recordedAt:new Date().toISOString(),
    sourceBase:'f6749c1a1b1a8345f8f76606786e0c1ccb48b21c',browserVersion:browser?.version(),observations,adapterSHA256:'c7d213d47a1e5f19869d0a003494917557d7c38c3ad00aae2e2f49ed4f2b613c',sources,reportTag:reportTag||null,fixtures:{ts:hash(tsBytes),mp4:hash(mp4Bytes)},limits:'Local synthetic Chrome app/SW lifecycle only; owned counters and CDP DOM listeners, not total JS heap/device memory or real Drive/device acceptance.',results},null,2)+'\n');
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  const name=path.join(out,reportName),record=JSON.parse(fs.readFileSync(name,'utf8'));record.browserClosed=true;record.serverClosed=true;record.sourcesAfter=sourceHashes();assert.deepEqual(record.sourcesAfter,sources);fs.writeFileSync(name,JSON.stringify(record,null,2)+'\n');
});
