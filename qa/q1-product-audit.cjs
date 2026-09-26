'use strict';
// Actual app + its service worker + generated public media. All Google routes
// are synthetic; no real credentials, media, account writes or device claims.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),allowed=new Set(require('../scripts/public-files.cjs'));
const bytes=fs.readFileSync(path.join(__dirname,'v2-07b-ts-q1/synthetic-bframes-audiolead.ts'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const producerFiles=['qa/q1-product-audit.cjs',...allowed];
const sourceHashes=()=>Object.fromEntries(producerFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const sources=sourceHashes();
assert.equal(hash(bytes),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
  const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!allowed.has(file)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store'}).end(fs.readFileSync(path.join(root,file)));
});
const results=[];let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const mode of ['native-to-q1','resume-to-q1','postflight-content-change','close-pending','seek-watchdog']){
    if(process.argv[2]&&mode!==process.argv[2])continue;
    const context=await browser.newContext(),page=await context.newPage(),errors=[],calls=[];
    let metadataReads=0,previews=0,held=null;
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
        if(mode==='close-pending'&&metadataReads===5){held=route;return;}
        return reply({...file,version:String(metadataReads),headRevisionId:mode==='postflight-content-change'&&metadataReads>=6?'source-revision-2':file.headRevisionId});
      }
      assert.equal(Boolean(req.serviceWorker()),true,'MEDIA_MUST_USE_PRODUCT_SW');
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
      await page.evaluate(file=>{
        state.demo=false;state.token='synthetic-test-token';state.expiresAt=Date.now()+3600000;
        state.authAccountKey='synthetic-account';state.accountId='synthetic-account';state.tokenRevision=1;
        state.selected=file;state.mediaSession++;state.pendingPlay=true;state.mediaRetryCount=0;
        window.q1Trace=[];window.__driveOriginalMediaTraceSink=row=>window.q1Trace.push(row);
        beginMediaDiagnosticTrace(file,state.mediaSession);
        window.q1MseSources=0;const createObjectURL=URL.createObjectURL;
        URL.createObjectURL=function(value){if(value instanceof MediaSource)window.q1MseSources++;return createObjectURL.call(this,value);};
        el.playerSheet.hidden=false;el.videoPlayer.hidden=false;el.videoPlayer.muted=true;
        state.playbackOrderIds=[file.id];sendTokenToWorker();startInitialOriginalPlayback(file,'video',state.mediaSession);
      },file);
      if(mode==='resume-to-q1')await page.evaluate(()=>{
        state.resumePosition={fileId:state.selected.id,time:6.1,snapshot:{time:6.1,paused:false,muted:true,volume:1,playbackRate:1,decoded:false}};
      });
      if(mode==='close-pending'){
        const end=Date.now()+15000;while(!held&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,25));assert.ok(held);
        await page.evaluate(()=>closePlayer({preserveHistory:true}));
        await held.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(file)}).catch(()=>{});
        const cleanup=await page.evaluate(()=>q1Retirement);assert.equal(cleanup.settled,true);
        assert.equal(await page.evaluate(()=>q1Playback===null&&el.playerSheet.hidden&&el.videoPlayer.getAttribute('src')===null),true);
        results.push({mode,passed:true,metadataReads});
      }else if(mode==='postflight-content-change'){
        await page.waitForFunction(()=>state.mediaAttempt==='failed'&&!el.mediaError.hidden);
        assert.equal(await page.evaluate(()=>el.videoPlayer.videoWidth),0);
        assert.equal(await page.evaluate(()=>state.mediaDecodeVerified),false);
        const failure=await page.evaluate(()=>({sources:window.q1MseSources,trace:window.q1Trace.filter(row=>row.stage==='q1-failed')}));
        assert.equal(failure.sources,0,'POSTFLIGHT_DRIFT_MUST_PRECEDE_MSE_CREATION');
        assert.equal(failure.trace.at(-1)?.reason,'Q1_SOURCE_CONTENT_DRIFT');
        results.push({mode,passed:true,metadataReads,failure});
      }else{
        await page.waitForFunction(()=>state.mediaAttempt==='q1'&&state.mediaTransportVerified,{},{timeout:20000});
        await page.evaluate(()=>{window.lastQ1=q1Playback.player;});
        // The original user's play intent must survive native code4/retry.
        await page.waitForFunction(()=>state.mediaDecodeVerified&&el.videoPlayer.currentTime>.5);
        assert.equal(await page.evaluate(()=>getPlaybackQualityLabel(state.mediaPlaybackMode,state.mediaTransportVerified)),'원본 스트림 · 재포장');
        assert.equal(await page.evaluate(()=>el.videoPlayer.videoWidth),360);
        assert.equal(calls.filter(row=>row.kind==='media'&&row.range==='bytes=0-').length,2,'NATIVE_FIRST_AND_ONE_RETRY');
        assert.equal(await page.evaluate(()=>q1Trace.filter(row=>row.stage==='media-error'&&row.mediaErrorCode===4).length),2);
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
        if(mode==='resume-to-q1')assert.ok(await page.evaluate(()=>el.videoPlayer.currentTime>=6.1&&q1Playback.player.stats().generation===1));
        const seeks=[];
        for(const seconds of [1.2,6.1,0,1000,11.95]){
          await page.evaluate(seconds=>{
            el.videoPlayer.pause();window.previousQ1Generation=q1Playback.player.stats().generation;
            setPlayerCurrentTime(el.videoPlayer,seconds,'qa-product-controls');
          },seconds);
          await page.waitForFunction(()=>q1Playback?.player?.stats().generation>window.previousQ1Generation
            &&q1Playback.player.stats().frames>0&&state.mediaTransportVerified&&['ready','ended'].includes(q1Playback.player.stats().phase),{},{timeout:15000});
          const frame=await page.evaluate(()=>({mediaTime:q1Playback.player.stats().lastMediaTime,width:el.videoPlayer.videoWidth,
            target:q1Playback.player.stats().target,requestedTime:el.videoPlayer.currentTime,paused:el.videoPlayer.paused}));
          assert.ok(Math.abs(frame.mediaTime-frame.target)<1/30+.0001);assert.equal(frame.width,360);seeks.push(frame);
          assert.equal(frame.paused,true);if(seconds===11.95)await page.evaluate(()=>el.videoPlayer.play());
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
        assert.equal(assetCache.length,6,'ALL_Q1_PUBLIC_ASSETS_PRECACHED');
        results.push({mode,passed:true,metadataReads,seeks,playback,cleanup,assetCache,nativeMediaCalls:calls.filter(row=>row.kind==='media').length});
      }
      assert.equal(previews,0);assert.deepEqual(errors,[]);
    }catch(error){results.push({mode,passed:false,error:error.message,errors,calls,
      app:await page.evaluate(()=>({attempt:state.mediaAttempt,q1:(q1Playback?.player||window.lastQ1)?.stats(),error:el.mediaErrorMessage.textContent})).catch(()=>null)});throw error;}
    finally{await context.close();}
  }
  assert.deepEqual(sourceHashes(),sources,'PRODUCT_CHANGED_DURING_VERIFICATION');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  const out=path.join(__dirname,'q1-product');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({syntheticOnly:true,passed:!process.exitCode,recordedAt:new Date().toISOString(),sources,results},null,2)+'\n');
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
});
