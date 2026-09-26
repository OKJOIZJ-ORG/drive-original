'use strict';
// Actual product app/SW, generated public TS and synthetic Google only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{chromium}=require('playwright');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),allowed=new Set(require('../scripts/public-files.cjs'));
const bytes=fs.readFileSync(path.join(__dirname,'v2-07b-ts-q1/synthetic-bframes-audiolead.ts'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(bytes),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const baseline=process.argv.includes('--baseline'),baselineSource=baseline?'22f7271846dada90d4c19a29d6f56826b105d200':null;
// Reproduce the old failure without reverting the checkout. Only its public
// Git bytes are served, and the current maintained test driver is unchanged.
const publicBytes=file=>baseline?execFileSync('git',['show',`${baselineSource}:${file}`],{cwd:root,maxBuffer:5e6}):fs.readFileSync(path.join(root,file));
const producerFiles=['qa/q1-resilience-audit.cjs',...allowed],sourceHashes=()=>Object.fromEntries(producerFiles.map(file=>
  [file,hash(allowed.has(file)?publicBytes(file):fs.readFileSync(path.join(root,file)))]));
const sources=sourceHashes();
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!allowed.has(file))return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store'}).end(publicBytes(file));
});
const results=[];let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const modes=baseline?['once-503']:['control','once-503','repeat-503','revision-drift','late-checksum-drift','permission-loss','retry-after-long','malformed-206','close-backoff','seek-backoff','account-backoff','budget-after-seek'];
  for(const mode of modes){
    if(process.argv[2]&&!baseline&&mode!=='control'&&mode!==process.argv[2])continue;
    const context=await browser.newContext(),page=await context.newPage(),calls=[],errors=[];
    await page.addInitScript(()=>{
      window.qaInputs=[];window.qaFragments=[];
      const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
      const Native=globalThis.Worker;
      globalThis.Worker=class extends Native{
        constructor(...args){super(...args);this.addEventListener('message',({data})=>{
          if(data?.type==='fragment'&&data.bytes instanceof ArrayBuffer){
            const bytes=data.bytes.slice(0),meta={generation:data.generation,sequence:data.fragmentSequence,bytes:bytes.byteLength};
            window.qaFragments.push(digest(bytes).then(sha256=>({...meta,sha256})));
          }
        });}
        postMessage(data,...rest){
          if(data?.type==='input'&&data.bytes instanceof ArrayBuffer){
            const bytes=data.bytes.slice(0),meta={generation:data.generation,sequence:data.sequence,offset:data.offset,bytes:bytes.byteLength};
            window.qaInputs.push(digest(bytes).then(sha256=>({...meta,sha256})));
          }
          return super.postMessage(data,...rest);
        }
      };
    });
    let armed=false,faults=0,previews=0,metadata=0,allowSecond=false;
    const file={id:'synthetic-resilience-ts',name:'public-fixture.mp4',mimeType:'video/mp4',size:String(bytes.length),
      headRevisionId:'revision-1',version:'1',modifiedTime:'2026-09-27T00:00:00Z',sha256Checksum:hash(bytes),
      trashed:false,capabilities:{canDownload:true}};
    page.on('pageerror',()=>errors.push('PAGE_ERROR'));
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();
      if(url.hostname==='drive.google.com'){previews++;return route.abort();}
      if(url.hostname!=='www.googleapis.com')return route.abort();
      const headers=await request.allHeaders(),cors={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'*'}});
      assert.equal(request.method(),'GET');assert.equal(url.pathname,`/drive/v3/files/${file.id}`);
      if(url.searchParams.get('alt')!=='media'){
        metadata++;calls.push({kind:'metadata',sequence:metadata});
        return route.fulfill({contentType:'application/json',headers:cors,body:JSON.stringify({...file,version:String(metadata),
          headRevisionId:mode==='revision-drift'&&faults?'revision-2':file.headRevisionId,
          sha256Checksum:mode==='late-checksum-drift'?(faults?'a'.repeat(64):armed?file.sha256Checksum:undefined):file.sha256Checksum,
          capabilities:{canDownload:!(mode==='permission-loss'&&faults)}})});
      }
      assert.equal(Boolean(request.serviceWorker()),true);assert.equal(headers.authorization,'Bearer synthetic-token');
      const match=/^bytes=(\d+)-(\d+)$/.exec(headers.range||'');assert.ok(match,'BOUNDED_RANGE_REQUIRED');
      const start=Number(match[1]),end=Number(match[2]);assert.ok(start<=end&&end<bytes.length&&end-start<1048576);
      const shouldFail=armed&&(faults===0||mode==='repeat-503'||(mode==='budget-after-seek'&&allowSecond&&faults===1));if(shouldFail)faults++;
      calls.push({kind:'range',range:headers.range,start,end,status:shouldFail&&mode!=='malformed-206'?503:206});
      if(shouldFail&&mode!=='malformed-206')return route.fulfill({status:503,headers:{...cors,'Content-Type':'application/json',
        'Access-Control-Expose-Headers':'Retry-After','Retry-After':mode==='retry-after-long'?'120':mode.endsWith('-backoff')?'2':'0'},body:'{"error":{"errors":[{"reason":"backendError"}]}}'});
      return route.fulfill({status:206,headers:{...cors,'Content-Type':'video/mp4','Content-Length':String(end-start+1),
        ...(shouldFail&&mode==='malformed-206'?{'Access-Control-Expose-Headers':'Content-Range'}:{}),
        'Content-Range':`bytes ${start}-${end}/${shouldFail&&mode==='malformed-206'?bytes.length+1:bytes.length}`},body:bytes.subarray(start,end+1)});
    });
    try{
      await page.goto(origin+'/?demo=1');await page.waitForFunction(()=>typeof startInitialOriginalPlayback==='function'&&navigator.serviceWorker.controller);
      await page.evaluate(file=>{
        state.demo=false;state.token='synthetic-token';state.expiresAt=Date.now()+3600000;
        state.authAccountKey='synthetic-account';state.accountId='synthetic-account';state.tokenRevision=1;
        state.selected=file;state.mediaSession++;state.pendingPlay=true;state.playbackOrderIds=[file.id];
        el.playerSheet.hidden=false;el.videoPlayer.hidden=false;el.videoPlayer.muted=true;
        el.videoPlayer.defaultPlaybackRate=4;el.videoPlayer.playbackRate=4;
        sendTokenToWorker();startInitialOriginalPlayback(file,'video',state.mediaSession);
      },file);
      await page.waitForFunction(()=>state.mediaDecodeVerified&&el.videoPlayer.currentTime>.1);
      const initial=await page.evaluate(()=>{window.testPlayer=q1Playback.player;return {time:el.videoPlayer.currentTime,frames:q1Playback.player.stats().frames};});
      assert.ok(initial.frames>0);armed=mode!=='control';
      if(baseline){
        await page.waitForFunction(()=>state.mediaAttempt==='failed');
        const stats=await page.evaluate(()=>window.testPlayer.stats());assert.equal(stats.failure,'Q1_SOURCE_HEADERS');
        assert.equal(faults,1);assert.equal((await page.evaluate(()=>q1Retirement)).settled,true);
        const i=calls.findIndex(row=>row.status===503);assert.equal(calls.slice(i+1).filter(row=>row.kind==='range').length,0);
        results.push({mode,passed:true,baselineFailureReproduced:true,initial,stats,calls});
      }else if(mode==='budget-after-seek'){
        await page.waitForFunction(()=>window.testPlayer.stats().recovery?.completed===true);
        armed=false;
        await page.evaluate(()=>{el.videoPlayer.pause();setPlayerCurrentTime(el.videoPlayer,0,'qa-budget');});
        await page.waitForFunction(()=>window.testPlayer.stats().generation===2&&window.testPlayer.stats().frames>0);
        armed=true;allowSecond=true;await page.evaluate(()=>el.videoPlayer.play());
        await page.waitForFunction(()=>state.mediaAttempt==='failed');
        const cleanup=await page.evaluate(()=>q1Retirement),stats=await page.evaluate(()=>window.testPlayer.stats());
        assert.equal(cleanup.settled,true);assert.equal(stats.failure,'Q1_SOURCE_HTTP_UNAVAILABLE');
        assert.equal(stats.generation,2);assert.equal(stats.recovery,undefined);assert.equal(faults,2);
        const i=calls.findLastIndex(row=>row.status===503);assert.equal(calls.slice(i+1).filter(row=>row.kind==='range').length,0);
        results.push({mode,passed:true,initial,stats,cleanup,calls});
      }else if(mode.endsWith('-backoff')){
        await page.waitForFunction(()=>window.testPlayer.stats().recovery?.cleanup?.settled===true);
        const faultIndex=calls.findIndex(row=>row.status===503),faultRange=calls[faultIndex].range;
        assert.equal(faults,1);
        const old=await page.evaluate(()=>window.testPlayer.stats());
        if(mode==='seek-backoff'){
          armed=false;
          await page.evaluate(()=>{el.videoPlayer.pause();setPlayerCurrentTime(el.videoPlayer,6.1,'qa-recovery-replacement');});
          await page.waitForFunction(()=>window.testPlayer.stats().generation===2&&window.testPlayer.stats().frames>0);
          assert.notEqual(calls.slice(faultIndex+1).find(row=>row.kind==='range')?.range,faultRange,'OLD_RANGE_RETRIED_AFTER_SEEK');
        }else if(mode==='account-backoff'){
          await page.evaluate(()=>{state.driveSessionGeneration++;state.authAccountKey='other-synthetic-account';});
          await page.evaluate(()=>window.testPlayer.completion());
          assert.equal(calls.slice(faultIndex+1).filter(row=>row.kind==='range').length,0,'OLD_ACCOUNT_RETRIED');
        }
        await page.evaluate(()=>closePlayer({preserveHistory:true}));
        const cleanup=await page.evaluate(()=>q1Retirement);assert.equal(cleanup.settled,true);
        if(mode==='close-backoff'){
          // Longer than the scheduled retry proves timer cancellation, not just
          // the absence of an immediate request.
          await page.waitForTimeout(2150);
          assert.equal(calls.slice(faultIndex+1).filter(row=>row.kind==='range').length,0,'CLOSED_RANGE_RETRIED');
        }
        results.push({mode,passed:true,initial,old,cleanup,calls});
      }else if(mode!=='once-503'&&mode!=='control'){
        await page.waitForFunction(()=>state.mediaAttempt==='failed');
        const cleanup=await page.evaluate(()=>q1Retirement),stats=await page.evaluate(()=>window.testPlayer.stats());
        assert.equal(cleanup.settled,true);
        const expected={'repeat-503':'Q1_SOURCE_HTTP_UNAVAILABLE','revision-drift':'Q1_SOURCE_CONTENT_DRIFT',
          'late-checksum-drift':'Q1_CONTENT_DRIFT','permission-loss':'Q1_SOURCE_PERMISSION','retry-after-long':'Q1_SOURCE_HTTP_UNAVAILABLE',
          'malformed-206':'Q1_SOURCE_HEADERS'};
        assert.equal(stats.failure,expected[mode]);
        const faultIndex=calls.findIndex(row=>row.status===503);
        if(mode==='repeat-503')assert.equal(faults,2);
        else{assert.equal(faults,1);if(faultIndex>=0)assert.equal(calls.slice(faultIndex+1).filter(row=>row.kind==='range').length,0);}
        results.push({mode,passed:true,initial,stats,cleanup,calls});
      }else{
        await page.waitForFunction(()=>el.videoPlayer.ended,{},{timeout:20000});
        const stats=await page.evaluate(()=>window.testPlayer.stats());assert.equal(stats.failure,null);assert.equal(stats.phase,'ended');
        const workerBytes=await page.evaluate(async()=>({inputs:await Promise.all(window.qaInputs),fragments:await Promise.all(window.qaFragments)}));
        assert.ok(workerBytes.inputs.length&&workerBytes.fragments.length);
        if(mode==='once-503'){
          assert.equal(faults,1);assert.equal(stats.recovery.completed,true);assert.equal(stats.recovery.attempt,1);
          assert.equal(stats.recovery.source.releasedBytes,stats.recovery.source.receivedBytes,'FAILED_RANGE_BODY_MUST_NOT_BE_RELEASED');
          assert.equal(stats.recovery.source.readsStarted,stats.recovery.source.readsCompleted+1);
          const i=calls.findIndex(row=>row.status===503),retry=calls.slice(i+1).find(row=>row.kind==='range');
          assert.equal(retry.range,calls[i].range);assert.equal(retry.status,206);
          assert.deepEqual(workerBytes,results.find(row=>row.mode==='control').workerBytes,'RETRY_CHANGED_OR_DUPLICATED_WORKER_INPUT_OR_OUTPUT');
        }else assert.equal(faults,0);
        await page.evaluate(()=>closePlayer({preserveHistory:true}));const cleanup=await page.evaluate(()=>q1Retirement);assert.equal(cleanup.settled,true);
        results.push({mode,passed:true,initial,stats,cleanup,calls,workerBytes});
      }
      assert.equal(previews,0);assert.deepEqual(errors,[]);
    }catch(error){results.push({mode,passed:false,error:error.message,calls,stats:await page.evaluate(()=>window.testPlayer?.stats()).catch(()=>null)});throw error;}
    finally{await context.close();}
  }
  assert.deepEqual(sourceHashes(),sources,'PRODUCERS_CHANGED_DURING_RUN');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  const out=path.join(__dirname,'q1-resilience');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,baseline?'before.json':'results.json'),JSON.stringify({passed:!process.exitCode,syntheticOnly:true,baseline,baselineSource,sources,
    fixtureSha256:hash(bytes),recordedAt:new Date().toISOString(),results},null,2)+'\n');
  console.log(JSON.stringify({baseline,passed:!process.exitCode,cases:results.length}));
});
