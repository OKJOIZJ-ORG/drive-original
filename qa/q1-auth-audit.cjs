'use strict';
// Actual app/SW and public generated TS; all credentials/Google data synthetic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),allowed=new Set(require('../scripts/public-files.cjs'));
const tsBytes=fs.readFileSync(path.join(__dirname,'v2-07b-ts-q1/synthetic-bframes-audiolead.ts'));
const hash=value=>createHash('sha256').update(value).digest('hex');
assert.equal(hash(tsBytes),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const mp4Bytes=fs.readFileSync(path.join(__dirname,'faststart-h264-aac.mp4'));
assert.equal(hash(mp4Bytes),'178d8b884e2668a2da18ffba63960ec192f810b91c151cdab6e3080687328079');
const padding=Buffer.alloc((188-mp4Bytes.length%188)%188+188);padding.writeUInt32BE(padding.length);padding.write('free',4);
const alignedMp4=Buffer.concat([mp4Bytes,padding]);
const baseline=process.argv.includes('--baseline'),baselineSource=baseline?'bc6a9aa':null;
const retirementRun=process.argv.includes('--retirement');
const selected=process.argv.slice(2).find(value=>!value.startsWith('--'));
const publicBytes=file=>baseline?execFileSync('git',['show',`${baselineSource}:${file}`],{cwd:root,maxBuffer:5e6}):fs.readFileSync(path.join(root,file));
const sourceHashes=()=>Object.fromEntries(['qa/q1-auth-audit.cjs',...allowed].map(file=>
  [file,hash(allowed.has(file)?publicBytes(file):fs.readFileSync(path.join(root,file)))]));
const sources=sourceHashes(),mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css',
  '.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!allowed.has(file))return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store'}).end(publicBytes(file));});
const modes=retirementRun?['control','sniff-native','close-lateheaders','close-range-refresh']:['control','range-401','metadata-401','same-token-401','repeat-401','range-403','refresh-unavailable','refresh-mismatch',
  'close-metadata-refresh','seek-metadata-refresh','close-range-refresh','seek-range-refresh','account-refresh',
  'foreground-pageshow','foreground-focus','foreground-visible','foreground-offline'];
const results=[];let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const mode of modes){
    if(selected&&selected!==mode&&mode!=='control')continue;
    const bytes=mode==='sniff-native'?alignedMp4:tsBytes;
    const context=await browser.newContext(),page=await context.newPage(),calls=[],errors=[];
    let armed=false,faults=0,authCalls=0,previews=0,held=null;
    const file={id:'synthetic-auth-ts',name:'public-fixture.mp4',mimeType:'video/mp4',size:String(bytes.length),
      headRevisionId:'revision-1',version:'1',modifiedTime:'2026-09-28T00:00:00Z',sha256Checksum:hash(bytes),
      trashed:false,capabilities:{canDownload:true}};
    await page.addInitScript(()=>{
      window.qaInputs=[];window.qaFragments=[];
      const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
      const Native=globalThis.Worker;
      globalThis.Worker=class extends Native{
        constructor(...args){super(...args);this.addEventListener('message',({data})=>{
          if(data?.type==='fragment'&&data.bytes instanceof ArrayBuffer){const bytes=data.bytes.slice(0);
            window.qaFragments.push(digest(bytes).then(sha256=>({generation:data.generation,sequence:data.fragmentSequence,bytes:bytes.byteLength,sha256})));}
        });}
        postMessage(data,...rest){if(data?.type==='input'&&data.bytes instanceof ArrayBuffer){const bytes=data.bytes.slice(0);
          window.qaInputs.push(digest(bytes).then(sha256=>({generation:data.generation,sequence:data.sequence,offset:data.offset,bytes:bytes.byteLength,sha256})));}
          return super.postMessage(data,...rest);}
      };
    });
    page.on('pageerror',()=>errors.push('PAGE_ERROR'));
    const credential=()=>({accessToken:mode==='same-token-401'?'synthetic-old':'synthetic-new',expiresAt:Date.now()+3600000,
      account:mode==='refresh-mismatch'?'synthetic-other':'synthetic-account',revision:2});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin){
        if(url.pathname==='/api/session/credential'){
          authCalls++;assert.equal(request.method(),'POST');
          const body=request.postDataJSON();assert.equal(body.expectedAccount,'synthetic-account');
          calls.push({kind:'credential',rejectedRevision:body.rejectedRevision});
          if(mode.endsWith('-refresh')){held=route;return;}
          if(mode==='refresh-unavailable')return route.fulfill({status:503,contentType:'application/json',body:'{"error":{"code":"auth_unavailable"}}'});
          return route.fulfill({contentType:'application/json',body:JSON.stringify(credential())});
        }
        return route.continue();
      }
      if(url.hostname==='drive.google.com'){previews++;return route.abort();}
      if(url.hostname!=='www.googleapis.com')return route.abort();
      const headers=await request.allHeaders(),cors={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'*'}});
      assert.equal(request.method(),'GET');
      if(url.pathname!==`/drive/v3/files/${file.id}`){
        if(url.pathname==='/drive/v3/files')return route.fulfill({contentType:'application/json',headers:cors,body:'{"files":[]}'});
        return route.abort();
      }
      const media=url.searchParams.get('alt')==='media',old=headers.authorization==='Bearer synthetic-old';
      assert.ok(old||headers.authorization==='Bearer synthetic-new');
      const metadataFault=mode==='metadata-401'||mode.includes('metadata-refresh');
      if(armed&&mode==='close-lateheaders'&&media&&!held){held=route;calls.push({kind:'held-range',range:headers.range});return;}
      const fail=armed&&((metadataFault&&!media&&old&&faults===0)||(!metadataFault&&media
        &&!mode.startsWith('foreground-')&&!['control','sniff-native','close-lateheaders'].includes(mode)&&(faults===0||mode==='repeat-401')));
      if(fail)faults++;
      const status=fail?(mode==='range-403'?403:401):media?206:200;
      calls.push({kind:media?'range':'metadata',range:headers.range||null,status,
        credentialRevision:old&&!(mode==='same-token-401'&&authCalls)?1:2});
      if(fail)return route.fulfill({status,contentType:'application/json',headers:cors,
        body:JSON.stringify({error:{errors:[{reason:status===403?'insufficientFilePermissions':'authError'}]}})});
      if(!media)return route.fulfill({contentType:'application/json',headers:cors,body:JSON.stringify(file)});
      assert.equal(Boolean(request.serviceWorker()),true);
      const match=(mode==='sniff-native'?/^bytes=(\d+)-(\d*)$/:/^bytes=(\d+)-(\d+)$/).exec(headers.range||'');assert.ok(match,'BOUNDED_RANGE_REQUIRED');
      const start=Number(match[1]),end=match[2]?Number(match[2]):bytes.length-1;assert.ok(end<bytes.length&&(mode==='sniff-native'||end-start<1048576));
      return route.fulfill({status:206,headers:{...cors,'Content-Type':'video/mp4','Content-Length':String(end-start+1),
        'Content-Range':`bytes ${start}-${end}/${bytes.length}`},body:bytes.subarray(start,end+1)});
    });
    try{
      await page.goto(origin+'/?demo=1');await page.waitForFunction(()=>typeof startInitialOriginalPlayback==='function'&&navigator.serviceWorker.controller);
      await page.evaluate(file=>{
        state.demo=false;state.token='synthetic-old';state.expiresAt=Date.now()+3600000;state.tokenRevision=1;
        state.authAccountKey='synthetic-account';state.accountId='synthetic-account';state.accountStateLoaded=true;state.accountIdentityPending=false;
        state.files=[file];state.selected=file;state.mediaSession++;state.pendingPlay=true;state.playbackOrderIds=[file.id];
        el.playerSheet.hidden=false;el.videoPlayer.hidden=false;el.videoPlayer.muted=true;
        el.videoPlayer.defaultPlaybackRate=4;el.videoPlayer.playbackRate=4;
        sendTokenToWorker();startInitialOriginalPlayback(file,'video',state.mediaSession);
      },file);
      if(mode==='sniff-native'){
        await page.waitForFunction(()=>q1Playback===null&&q1RetirementResult?.settled===true&&state.mediaAttempt==='range');
        assert.equal(await page.evaluate(()=>Boolean(el.videoPlayer.getAttribute('src'))),true);
        await page.evaluate(()=>closePlayer({preserveHistory:true}));
        assert.equal((await page.evaluate(()=>q1Retirement)).settled,true);
        const worker=context.serviceWorkers()[0];assert.ok(worker);
        const owners=await worker.evaluate(()=>({active:q1TransportOwners.size,uncertain:q1CleanupFences.size,tokens:tokenRequests.size}));
        assert.deepEqual(owners,{active:0,uncertain:0,tokens:0});
        assert.equal(previews,0);assert.deepEqual(errors,[]);
        results.push({mode,passed:true,nativeFallbackAssigned:true,owners,calls});
        continue;
      }
      await page.waitForFunction(()=>state.mediaDecodeVerified&&el.videoPlayer.currentTime>.1);
      const initial=await page.evaluate(()=>{window.testPlayer=q1Playback.player;return {time:el.videoPlayer.currentTime,frames:q1Playback.player.stats().frames,
        session:state.mediaSession,driveGeneration:state.driveSessionGeneration};});
      assert.ok(initial.frames>0);armed=mode!=='control';
      if(mode==='close-lateheaders'){
        const end=Date.now()+15000;while(!held&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,25));assert.ok(held,'HELD_HEADERS_NOT_REACHED');
        const worker=context.serviceWorkers()[0];assert.ok(worker);
        assert.ok(await worker.evaluate(()=>q1TransportOwners.size)>0,'PREHEADER_OWNER_MUST_EXIST');
        await page.evaluate(()=>closePlayer({preserveHistory:true}));
        assert.equal((await page.evaluate(()=>q1Retirement)).settled,true,'NATIVE_ABORT_MUST_ACTUALLY_SETTLE_SW_FETCH');
        await held.fulfill({status:401,contentType:'application/json',body:'{}'}).catch(()=>{});held=null;
        await page.waitForTimeout(100);
        const owners=await worker.evaluate(()=>({active:q1TransportOwners.size,uncertain:q1CleanupFences.size,tokens:tokenRequests.size}));
        assert.deepEqual(owners,{active:0,uncertain:0,tokens:0});assert.equal(authCalls,0);
        results.push({mode,passed:true,initial,owners,calls});
      }else if(mode.startsWith('foreground-')){
        await page.evaluate(mode=>{
          el.videoPlayer.pause();window.qaReturnTime=el.videoPlayer.currentTime;
          clearTimeout(tokenRenewalTimer);tokenRenewalTimer=null;state.expiresAt=Date.now()-1000;
          if(mode==='foreground-offline')Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
          if(mode==='foreground-visible'||mode==='foreground-offline'){
            Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));
          }else window.dispatchEvent(new Event(mode==='foreground-pageshow'?'pageshow':'focus'));
        },mode);
        await page.waitForTimeout(500);
        if(mode==='foreground-offline')assert.equal(authCalls,0);
        else{
          assert.equal(authCalls,1,'FOREGROUND_MUST_RECHECK_WALL_CLOCK_EXPIRY');
          assert.equal(await page.evaluate(()=>state.tokenRevision),2);
        }
        assert.equal(await page.evaluate(()=>el.videoPlayer.paused),true);
        assert.equal(await page.evaluate(()=>el.videoPlayer.currentTime===window.qaReturnTime),true);
        assert.equal(await page.evaluate(()=>state.mediaSession),initial.session);
        assert.equal(await page.evaluate(()=>state.driveSessionGeneration),initial.driveGeneration);
        if(mode!=='foreground-offline'){
          await page.evaluate(()=>{window.qaReturnFrames=window.testPlayer.stats().frames;el.videoPlayer.play();});
          await page.waitForFunction(()=>window.testPlayer.stats().frames>window.qaReturnFrames&&el.videoPlayer.currentTime>window.qaReturnTime);
        }
        await page.evaluate(()=>closePlayer({preserveHistory:true}));
        assert.equal((await page.evaluate(()=>q1Retirement)).settled,true);
        results.push({mode,passed:true,authCalls,initial,calls});
      }else if(mode.endsWith('-refresh')){
        const end=Date.now()+15000;while(!held&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,25));assert.ok(held,'REFRESH_NOT_REACHED');
        assert.equal(authCalls,1);const faultIndex=calls.findIndex(row=>row.status===401);
        if(mode.startsWith('close-'))await page.evaluate(()=>closePlayer({preserveHistory:true}));
        else if(mode.startsWith('seek-'))await page.evaluate(()=>{el.videoPlayer.pause();setPlayerCurrentTime(el.videoPlayer,6.1,'qa-auth-seek');});
        else await page.evaluate(()=>{clearToken(true,{preserveAccount:false});invalidateDriveSessionData();closePlayer({preserveHistory:true});});
        // A shared auth request may outlive a media consumer, but its old Drive
        // callback must release promptly rather than poison the cleanup barrier.
        if(mode!=='account-refresh'){
          if(mode.startsWith('close-'))assert.equal((await page.evaluate(()=>q1Retirement)).settled,true,'CANCELLED_AUTH_WAITER_MUST_RELEASE');
          else await page.waitForFunction(()=>window.testPlayer.stats().previousCleanup?.settled===true,{},{timeout:3000});
        }
        await held.fulfill({contentType:'application/json',body:JSON.stringify(credential())}).catch(()=>{});held=null;
        if(mode.startsWith('seek-')){
          await page.waitForFunction(()=>window.testPlayer.stats().generation===2&&window.testPlayer.stats().frames>0);
          assert.equal(await page.evaluate(()=>window.testPlayer.stats().failure),null);
          assert.equal(await page.evaluate(()=>window.testPlayer.stats().previousCleanup.settled),true);
          await page.evaluate(()=>closePlayer({preserveHistory:true}));
        }else{
          await page.waitForTimeout(300);assert.equal(calls.slice(faultIndex+1).filter(row=>row.kind==='range').length,0);
          assert.equal(await page.evaluate(()=>q1Playback===null&&el.videoPlayer.getAttribute('src')===null),true);
          if(mode==='account-refresh')assert.equal(await page.evaluate(()=>state.token===null&&state.authAccountKey===null),true);
        }
        assert.equal((await page.evaluate(()=>q1Retirement)).settled,true);
        results.push({mode,passed:true,authCalls,initial,calls});
      }else if(['repeat-401','range-403','refresh-unavailable','refresh-mismatch'].includes(mode)){
        await page.waitForFunction(()=>state.mediaAttempt==='failed');
        assert.equal((await page.evaluate(()=>q1Retirement)).settled,true);
        const stats=await page.evaluate(()=>window.testPlayer.stats());assert.ok(stats.failure);
        assert.equal(authCalls,mode==='range-403'?0:1);assert.equal(faults,mode==='repeat-401'?2:1);
        assert.equal(await page.evaluate(()=>state.authAccountKey),'synthetic-account');
        if(mode!=='repeat-401')assert.equal(await page.evaluate(()=>state.token),'synthetic-old');
        results.push({mode,passed:true,authCalls,initial,stats,calls});
      }else{
        await page.waitForFunction(()=>el.videoPlayer.ended,{},{timeout:20000});
        const stats=await page.evaluate(()=>window.testPlayer.stats());assert.equal(stats.failure,null);assert.equal(stats.phase,'ended');
        const workerBytes=await page.evaluate(async()=>({inputs:await Promise.all(window.qaInputs),fragments:await Promise.all(window.qaFragments)}));
        assert.ok(workerBytes.inputs.length&&workerBytes.fragments.length);
        if(mode!=='control'){
          assert.equal(authCalls,1);assert.equal(faults,1);assert.equal(await page.evaluate(()=>state.tokenRevision),2);
          const faultIndex=calls.findIndex(row=>row.status===401),fault=calls[faultIndex],retry=calls.slice(faultIndex+1).find(row=>row.kind===fault.kind);
          assert.equal(retry.range,fault.range);assert.equal(retry.status,fault.kind==='range'?206:200);
          assert.equal(retry.credentialRevision,2);
          assert.deepEqual(workerBytes,results.find(row=>row.mode==='control')?.workerBytes||workerBytes,'AUTH_RETRY_CHANGED_WORKER_BYTES');
        }else assert.equal(authCalls,0);
        await page.evaluate(()=>closePlayer({preserveHistory:true}));assert.equal((await page.evaluate(()=>q1Retirement)).settled,true);
        results.push({mode,passed:true,authCalls,initial,stats,calls,workerBytes});
      }
      assert.equal(previews,0);assert.deepEqual(errors,[]);
      if(retirementRun){
        const worker=context.serviceWorkers()[0];assert.ok(worker);
        const owners=await worker.evaluate(()=>({active:q1TransportOwners.size,uncertain:q1CleanupFences.size,tokens:tokenRequests.size}));
        assert.deepEqual(owners,{active:0,uncertain:0,tokens:0});results.at(-1).owners=owners;
      }
    }catch(error){results.push({mode,passed:false,error:error.message,calls,authCalls,stats:await page.evaluate(()=>window.testPlayer?.stats()).catch(()=>null)});throw error;}
    finally{await held?.abort().catch(()=>{});await context.close();}
  }
  assert.deepEqual(sourceHashes(),sources,'PRODUCERS_CHANGED_DURING_RUN');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  await browser?.close();await new Promise(resolve=>server.close(resolve));const out=path.join(__dirname,retirementRun?'q1-auth-cleanup':'q1-auth');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,retirementRun?'actual-retirement.json':`${baseline?'before':'results'}${selected?'-'+selected:''}.json`),JSON.stringify({passed:!process.exitCode,
    syntheticOnly:true,baseline,baselineSource,sources,fixtureSha256:hash(tsBytes),nativeFixtureSha256:hash(alignedMp4),recordedAt:new Date().toISOString(),results},null,2)+'\n');
  console.log(JSON.stringify({baseline,passed:!process.exitCode,cases:results.length}));
});
