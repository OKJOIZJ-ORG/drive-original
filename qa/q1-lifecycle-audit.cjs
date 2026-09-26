'use strict';
// Product source/player/worker lifecycle in isolated Chrome, with injected local
// metadata/range callbacks. The MMS-shaped subclass is NOT Safari/iPhone proof.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),allowed=new Set(require('../scripts/public-files.cjs'));
const fixture=fs.readFileSync(path.join(__dirname,'v2-07b-ts-q1/synthetic-bframes-audiolead.ts'));
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(hash(fixture),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const sourceFiles=['qa/q1-lifecycle-audit.cjs','media/ts-player.mjs','media/drive-source.mjs','media/q1-core.mjs','media/transmux-worker.mjs'];
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const sources=sourceHashes();
const heldResponses=new Set();let heldOpened=0,heldClosed=0;
const server=http.createServer((req,res)=>{
  const file=new URL(req.url,'http://localhost').pathname.slice(1);
  if(file==='__lifecycle')return res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'})
    .end('<!doctype html><title>Q1 isolated lifecycle QA</title><video muted playsinline></video>');
  if(file==='__public-fixture.ts')return res.writeHead(200,{'Content-Type':'video/mp2t','Cache-Control':'no-store'}).end(fixture);
  if(file==='__held-range'){
    heldResponses.add(res);heldOpened++;
    res.writeHead(206,{'Content-Type':'video/mp2t','Content-Length':'65536',
      'Content-Range':`bytes 0-65535/${fixture.length}`,'Cache-Control':'no-store'});
    res.write(fixture.subarray(0,188));
    const timer=setTimeout(()=>res.end(fixture.subarray(188,65536)),10000);
    res.on('close',()=>{clearTimeout(timer);heldResponses.delete(res);heldClosed++;});return;
  }
  if(!allowed.has(file))return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':/\.(?:m?js)$/.test(file)?'text/javascript':'application/octet-stream','Cache-Control':'no-store'})
    .end(fs.readFileSync(path.join(root,file)));
});
const results=[];let browser;
const modes=process.argv.includes('--fetch-cancel-only')?['real-fetch-abort']:
  ['replace-opening','replace-preflight','cleanup-timeout','cleanup-cancel-failed','mms-shaped-restore','real-fetch-abort','late-checksum-drift'];
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const mode of modes){
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    try{
      await page.goto(`${base}/__lifecycle`);
      const result=await page.evaluate(async({mode,digest})=>{
        const {openDriveQ1Source}=await import('/media/drive-source.mjs');
        const {createTsPlayer}=await import('/media/ts-player.mjs');
        const bytes=new Uint8Array(await (await fetch('/__public-fixture.ts')).arrayBuffer());
        const video=document.querySelector('video');video.muted=true;
        const demand=(value,code)=>{if(!value)throw new Error(code);};
        const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const until=async predicate=>{const end=Date.now()+10000;while(!predicate()){
          demand(Date.now()<end,'LIFECYCLE_CONDITION_TIMEOUT');await delay(10);
        }};
        const metadata={id:'public-ts',headRevisionId:'revision-1',size:String(bytes.length),mimeType:'video/mp4',
          modifiedTime:'2026-09-26T00:00:00Z',version:'1',sha256Checksum:digest,trashed:false,capabilities:{canDownload:true}};
        if(mode==='real-fetch-abort'){
          const diagnostics=[];
          const outcome=promise=>Promise.resolve(promise).then(()=>({status:'fulfilled'}),error=>({status:'rejected',name:error.name}));
          for(const order of ['abort-then-cancel','cancel-then-abort'])for(let trial=0;trial<3;trial++){
            const controller=new AbortController(),response=await fetch('/__held-range',{signal:controller.signal});
            const reader=response.body.getReader();await reader.read();
            const pending=outcome(reader.read()),closed=outcome(reader.closed);
            let cancelled;
            if(order==='abort-then-cancel'){controller.abort();cancelled=outcome(reader.cancel());}
            else{cancelled=outcome(reader.cancel());controller.abort();}
            const result={order,trial,cancel:await cancelled,read:await pending,closed:await closed};
            reader.releaseLock();result.released=!response.body.locked;diagnostics.push(result);
          }
          demand(diagnostics.filter(row=>row.order==='abort-then-cancel').every(row=>row.cancel.status==='rejected'
            &&row.cancel.name==='AbortError'&&row.read.name==='AbortError'&&row.closed.name==='AbortError'&&row.released),'ABORT_FIRST_DISCRIMINATOR_CHANGED');
          demand(diagnostics.filter(row=>row.order==='cancel-then-abort').every(row=>row.cancel.status==='fulfilled'
            &&row.read.status==='fulfilled'&&row.closed.status==='fulfilled'&&row.released),'CANCEL_FIRST_DISCRIMINATOR_CHANGED');
          const owner=await openDriveQ1Source({fileId:metadata.id,accountKey:'synthetic',accountGeneration:1,
            isCurrent:()=>true,readMetadata:()=>metadata,readRange:({signal})=>fetch('/__held-range',{signal}),requestTimeoutMs:5000});
          const pending=owner.read({start:0,end:65535}).then(()=>null,error=>error.message);
          await until(()=>owner.stats().receivedBytes===188);
          const cleanup=await owner.abort(),readError=await pending,stats=owner.stats();
          demand(readError==='Q1_SOURCE_ABORTED'&&stats.retainedBytes===0&&stats.pendingCallbacks===0,'REAL_FETCH_NOT_TERMINAL');
          window.lifecycleOwners=[stats];
          return {mode,passed:cleanup.settled,diagnostics,cleanup,stats,readError,
            observedRegression:!cleanup.settled&&cleanup.cleanupFailed&&cleanup.pendingCallbacks===0&&cleanup.cleanupPending===0};
        }
        let opens=0,metadataCalls=0,held=false,release=null,bodyPull=false,cancelCalls=0;
        const events=[],owners=[],mediaSources=[];
        const openSource=({signal})=>{
          const number=++opens;
          return openDriveQ1Source({fileId:metadata.id,accountKey:'synthetic',accountGeneration:1,signal,isCurrent:()=>true,
            requestTimeoutMs:mode==='cleanup-timeout'?200:5000,
            readMetadata:async({phase})=>{
              metadataCalls++;
              if(number===1&&!held&&((phase==='open'&&['replace-opening','cleanup-timeout'].includes(mode))
                ||(phase==='preflight'&&mode==='replace-preflight'))){
                held=true;await new Promise(resolve=>{release=resolve;}); // deliberately ignores signal
              }
              return {...metadata,version:String(metadataCalls),sha256Checksum:mode==='late-checksum-drift'
                ?(number===1?(phase==='open'?undefined:digest):'a'.repeat(64)):digest};
            },
            readRange:({start,end})=>new Response(number===1&&mode==='cleanup-cancel-failed'
              ?new ReadableStream({pull(){bodyPull=true;return new Promise(()=>{});},cancel(){cancelCalls++;return Promise.reject(new Error('synthetic cancel failure'));}})
              :bytes.slice(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}})
          }).then(owner=>{owners.push(owner);return owner;});
        };
        if(mode==='mms-shaped-restore'){
          const NativeMediaSource=globalThis.MediaSource;
          globalThis.MediaSource=undefined;
          globalThis.ManagedMediaSource=class ChromeMmsShape extends NativeMediaSource {
            constructor(){super();mediaSources.push(this);}
            get streaming(){return true;}
          };
          video.disableRemotePlayback=false;
        }
        const player=createTsPlayer({video,openSource,isCurrent:()=>true,onEvent:event=>events.push(event),autoplay:false});
        window.lifecyclePlayer=player;
        try{
          if(mode==='late-checksum-drift'){
            await player.ready;
            demand(owners[0].identity.sha256Checksum===digest,'READ_CHECKSUM_NOT_EXPOSED');
            const error=await player.seek(6.1,{autoplay:false}).then(()=>null,error=>error.message);
            demand(error==='Q1_CONTENT_DRIFT','LATE_CHECKSUM_NOT_BOUND_ACROSS_SEEK');
            demand(opens===2&&owners[1].stats().rangeRequests===0,'DRIFT_READ_BYTES_BEFORE_REJECTION');
            const cleanup=await player.dispose(),stats=player.stats();
            demand(cleanup.settled&&stats.appends===0,'DRIFT_APPENDED_OR_LEAKED');
            return {mode,passed:true,opens,error,cleanup,stats};
          }
          if(mode==='mms-shaped-restore'){
            await player.ready;demand(video.disableRemotePlayback===true,'MMS_DID_NOT_OWN_REMOTE_SETTING');
            const snapshots=[];
            for(const target of [2.5,6.1]){
              await player.seek(target,{autoplay:false});
              demand(video.disableRemotePlayback===true,'MMS_LOST_REMOTE_SETTING_WHILE_ACTIVE');
              demand(player.stats().target>=target-0.001,'MMS_SEEK_NOT_POSITIONED');
              snapshots.push({target:player.stats().target,appends:player.stats().appends});
            }
            const cleanupPromise=player.dispose();
            // Match the app's immediate visual cleanup before asynchronous release.
            video.pause();video.removeAttribute('src');video.load();
            const cleanup=await cleanupPromise;
            demand(cleanup.settled,'MMS_CLEANUP_UNCONFIRMED');
            demand(video.disableRemotePlayback===false,'MMS_REMOTE_SETTING_LEAKED');
            const stats=player.stats();
            const nativeCleanup=mediaSources.map(source=>({state:source.readyState,sourceBuffers:source.sourceBuffers.length}));
            demand(stats.disposed&&stats.urlRevoked&&nativeCleanup.every(source=>source.sourceBuffers===0),'MMS_NATIVE_RESOURCES_NOT_RELEASED');
            demand(stats.worker?.terminated&&stats.worker.worker?.muxReleased&&stats.source.retainedBytes===0,'MMS_OWNER_NOT_RELEASED');
            return {mode,passed:true,opens,snapshots,cleanup,stats,nativeCleanup,mmsEvidence:'Chrome NativeMediaSource subclass only; not real ManagedMediaSource/iPhone'};
          }
          await until(()=>mode==='cleanup-cancel-failed'?bodyPull:held);
          const oldStats=player.stats(),replacement=player.seek(2.5,{autoplay:false});
          let replacementSettled=false;replacement.then(()=>{replacementSettled=true;},()=>{replacementSettled=true;});
          await delay(50);
          demand(opens===1,'REPLACEMENT_OVERLAPPED_PENDING_OWNER');
          if(mode!=='cleanup-cancel-failed')demand(!replacementSettled,'REPLACEMENT_DID_NOT_WAIT_FOR_CALLBACK');
          if(mode.startsWith('replace-')){
            release();await replacement;
            demand(opens===2,'REPLACEMENT_DID_NOT_OPEN_AFTER_CLEANUP');
            demand(oldStats.sourceCleanup?.settled===true,'PRIOR_CLEANUP_NOT_CONFIRMED');
            const cleanup=await player.dispose();
            demand(cleanup.settled,'REPLACEMENT_CLEANUP_FAILED');
            return {mode,passed:true,opens,metadataCalls,oldStats,cleanup,stats:player.stats()};
          }
          const error=await replacement.then(()=>null,error=>error.message);
          demand(error==='Q1_CLEANUP_UNCONFIRMED','FAILED_CLEANUP_DID_NOT_BLOCK_REPLACEMENT');
          demand(opens===1,'FAILED_CLEANUP_OPENED_REPLACEMENT');
          demand(oldStats.sourceCleanup?.settled===false,'FAILED_CLEANUP_FALSLY_SETTLED');
          if(mode==='cleanup-timeout')demand(oldStats.sourceCleanup.pendingCallbacks>0,'IGNORED_CALLBACK_NOT_RECORDED');
          else demand(oldStats.sourceCleanup.cleanupFailed&&cancelCalls===1,'FAILED_CANCEL_NOT_RECORDED');
          const cleanup=await player.dispose();demand(!cleanup.settled,'TERMINAL_CLEANUP_FAILURE_FORGOTTEN');
          release?.();await delay(25);
          return {mode,passed:true,opens,metadataCalls,cancelCalls,error,oldStats,cleanup,stats:player.stats()};
        }finally{
          release?.();await player.dispose();
          window.lifecycleOwners=owners.map(owner=>owner.stats());
        }
      },{mode,digest:hash(fixture)});
      result.ownersAfterCleanup=await page.evaluate(()=>window.lifecycleOwners);
      assert.ok(result.ownersAfterCleanup.every(owner=>owner.retainedBytes===0));
      assert.deepEqual(errors,[]);result.errors=errors;results.push(result);
      assert.equal(result.passed,true,'REAL_FETCH_CLEANUP_FALSE_FAILURE');
      console.log(`${mode}: passed`);
    }catch(error){results.push({mode,passed:false,error:error.message,errors,
      stats:await page.evaluate(()=>window.lifecyclePlayer?.stats()).catch(()=>null)});throw error;}
    finally{await context.close();}
  }
  assert.deepEqual(sourceHashes(),sources,'PRODUCT_OR_DRIVER_CHANGED_DURING_RUN');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  const out=path.join(__dirname,'q1-lifecycle');fs.mkdirSync(out,{recursive:true});
  const sourcesUnchanged=JSON.stringify(sourceHashes())===JSON.stringify(sources);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:process.exitCode!==1&&sourcesUnchanged&&results.length===modes.length&&results.every(result=>result.passed),
    syntheticOnly:true,recordedAt:new Date().toISOString(),fixtureSha256:hash(fixture),sources,sourcesUnchanged,
    heldFetchTransport:{opened:heldOpened,closed:heldClosed,pending:heldResponses.size},
    scope:'Actual Chrome product player/source/worker; injected metadata/range callbacks; no app/SW/Drive/device claim. MMS-shaped Chrome adapter is not iPhone evidence.',results},null,2)+'\n');
});
