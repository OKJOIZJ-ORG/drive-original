'use strict';
// Authorized private local bytes through the real app/SW; synthetic Google
// metadata/HTTP only. No real Drive identity, credentials, derivatives or frames.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),allowed=new Set(require('../scripts/public-files.cjs'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const producerFiles=['qa/q1-priority-app-audit.cjs',...allowed];
const hashes=()=>Object.fromEntries(producerFiles.map(file=>[file,digest(fs.readFileSync(path.join(root,file)))]));
const stateOf=value=>({size:value.size,mtimeMs:value.mtimeMs,dev:value.dev,ino:value.ino});
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const demand=(value,code)=>{if(!value)throw new Error(code);};
const fixed=error=>/^(?:PRIORITY|Q1|SEEK|WORKER|BOOTSTRAP)_[A-Z_]+$/.test(error?.message)?error.message:'PRIORITY_APP_FAILED';
async function fingerprint(file){const hash=createHash('sha256');for await(const bytes of fs.createReadStream(file))hash.update(bytes);return hash.digest('hex');}
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const report={recordedAt:new Date().toISOString(),sourceLabel:'priority-sample-1',currentDriveIdentityVerified:false,
  originalWrites:0,derivativesCreated:0,scope:'private local original through actual product app, SW, worker and isolated muted Chrome; synthetic Google GET metadata/bytes, not live Drive, physical device, audibility or native preservation proof'};
let browser,context,page,server,sourceFile,sourceBefore,sourceDigest,sources;
let metadataReads=0,preflights=0,previews=0,mediaBytes=0,peakReadBytes=0,openDescriptors=0;
const ranges=[],errors=[],transportErrors=[],inflight=new Set();
let stage='setup';
function fence(){demand(same(stateOf(fs.statSync(sourceFile)),sourceBefore),'PRIORITY_SOURCE_CHANGED');}
async function readFinite(start,end){
  let handle;
  try{
    fence();handle=await fs.promises.open(sourceFile,'r');openDescriptors++;
    demand(same(stateOf(await handle.stat()),sourceBefore),'PRIORITY_SOURCE_CHANGED');fence();
    const bytes=Buffer.alloc(end-start+1);peakReadBytes=Math.max(peakReadBytes,bytes.length);
    let filled=0;
    while(filled<bytes.length){const result=await handle.read(bytes,filled,bytes.length-filled,start+filled);
      demand(result.bytesRead>0,'PRIORITY_SOURCE_SHORT_READ');filled+=result.bytesRead;}
    demand(same(stateOf(await handle.stat()),sourceBefore),'PRIORITY_SOURCE_CHANGED');fence();return bytes;
  }finally{if(handle){try{await handle.close();}finally{openDescriptors--;}}}
}
async function run(){
  const expectedPath=path.join(__dirname,'player-stage-v2-01c','private-sample.json');
  demand(process.argv[2]&&path.resolve(process.argv[2])===expectedPath,'PRIORITY_EXPECTATION_REQUIRED');
  const expected=JSON.parse(fs.readFileSync(expectedPath,'utf8'));
  sourceFile=expected.localPath;sourceBefore=stateOf(fs.statSync(sourceFile));
  demand(sourceBefore.size===Number(expected.drive.size),'PRIORITY_SIZE_MISMATCH');
  sourceDigest=await fingerprint(sourceFile);fence();
  demand(sourceDigest===expected.localBytes.sha256.toLowerCase(),'PRIORITY_FINGERPRINT_MISMATCH');
  report.initialFingerprintMatched=true;report.sourceBytes=sourceBefore.size;sources=hashes();report.sources=sources;
  server=http.createServer((req,res)=>{
    try{
      if(req.method!=='GET')return res.writeHead(405).end();
      if(req.headers.host!==`127.0.0.1:${server.address().port}`)return res.writeHead(400).end();
      const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
      if(!allowed.has(file))return res.writeHead(404).end();
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'})
        .end(fs.readFileSync(path.join(root,file)));
    }catch{res.writeHead(500).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});report.browserVersion=browser.version();
  context=await browser.newContext();page=await context.newPage();page.on('pageerror',()=>errors.push('PAGE_ERROR'));
  const file={id:'priority-fixture',name:'local-original.mp4',mimeType:'video/mp4',size:String(sourceBefore.size),
    headRevisionId:'synthetic-local-revision',version:'1',modifiedTime:'2026-09-27T00:00:00.000Z',
    trashed:false,parents:['root'],capabilities:{canDownload:true}};
  await context.route('**/*',route=>{
    const task=(async()=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin===base)return route.continue();
      if(url.hostname==='drive.google.com'){previews++;return route.abort();}
      if(url.origin!=='https://www.googleapis.com'||url.pathname!==`/drive/v3/files/${file.id}`)return route.abort();
      // Protocol-only synthetic preflight. No metadata/source access or writes.
      if(req.method()==='OPTIONS'){preflights++;return route.fulfill({status:204,headers:{
        'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'*'}});}
      demand(req.method()==='GET','PRIORITY_GET_ONLY');fence();
      const headers=await req.allHeaders();demand(headers.authorization==='Bearer synthetic-test-token','PRIORITY_SYNTHETIC_AUTH');
      if(url.searchParams.get('alt')!=='media'){
        metadataReads++;return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'},
          body:JSON.stringify({...file,version:String(metadataReads)})});
      }
      demand(Boolean(req.serviceWorker()),'PRIORITY_PRODUCT_SW_REQUIRED');
      const match=/^bytes=(\d+)-(\d+)$/.exec(headers.range||'');demand(match,'PRIORITY_FINITE_RANGE_REQUIRED');
      const start=Number(match[1]),end=Number(match[2]),length=end-start+1;
      demand(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>=start&&end<sourceBefore.size
        &&length<=1048576,'PRIORITY_RANGE_BOUND');
      const bytes=await readFinite(start,end);ranges.push({start,end});mediaBytes+=length;
      // Deliberately CORS-hidden Content-Range exercises the existing SW's
      // known-size plus exposed Content-Length exact-range reconstruction.
      return route.fulfill({status:206,headers:{'Content-Type':'video/mp4','Access-Control-Allow-Origin':'*',
        'Content-Length':String(length),'Content-Range':`bytes ${start}-${end}/${sourceBefore.size}`,
        'Accept-Ranges':'bytes','Cache-Control':'no-store'},body:bytes});
    })().catch(async error=>{
      // A closing browser can cancel an already-owned finite response. Keep
      // evidence redacted, and do not throw outside final cleanup ownership.
      transportErrors.push(fixed(error));try{await route.abort();}catch{}
    }).finally(()=>inflight.delete(task));
    inflight.add(task);return task;
  });
  stage='load-app';await page.goto(`${base}/?demo=1`);await page.waitForFunction(()=>typeof startInitialOriginalPlayback==='function');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  if(!await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)))await page.reload();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  stage='initial';await page.evaluate(file=>{
    state.demo=false;state.token='synthetic-test-token';state.expiresAt=Date.now()+3600000;
    state.authAccountKey='synthetic-account';state.accountId='synthetic-account';state.tokenRevision=1;
    state.selected=file;state.mediaSession++;state.pendingPlay=true;state.mediaRetryCount=0;
    window.nativeCode4=0;window.__driveOriginalMediaTraceSink=row=>{if(row.stage==='media-error'&&row.mediaErrorCode===4)nativeCode4++;};
    beginMediaDiagnosticTrace(file,state.mediaSession);el.playerSheet.hidden=false;el.videoPlayer.hidden=false;el.videoPlayer.muted=true;
    state.playbackOrderIds=[file.id];sendTokenToWorker();startInitialOriginalPlayback(file,'video',state.mediaSession);
  },file);
  await page.waitForFunction(()=>state.mediaAttempt==='failed'||(state.mediaAttempt==='q1'&&state.mediaDecodeVerified&&el.videoPlayer.currentTime>.5),{},{timeout:30000});
  demand(await page.evaluate(()=>state.mediaAttempt==='q1'&&q1Playback.player.stats().frames>0),'PRIORITY_INITIAL_FRAME');
  const initial=await page.evaluate(()=>({width:el.videoPlayer.videoWidth,height:el.videoPlayer.videoHeight,
    duration:q1Playback.player.stats().duration,frameCount:q1Playback.player.stats().frames,time:q1Playback.player.stats().lastMediaTime,nativeCode4}));
  demand(initial.width===360&&initial.height===640&&initial.frameCount>0&&initial.time>.1,'PRIORITY_INITIAL_PROGRESS');
  demand(initial.nativeCode4===0,'PRIORITY_NO_NATIVE_RETRY');demand(ranges[0]?.start===0&&ranges[0]?.end===939,'PRIORITY_FIRST_SNIFF');
  demand(mediaBytes<sourceBefore.size,'PRIORITY_STREAMING_FIRST_FRAME');report.initial={...initial,rangeBytes:mediaBytes,rangeRequests:ranges.length};
  report.seeks=[];
  for(const fraction of [.1,.5,.9]){
    stage=`seek-${fraction}`;const target=initial.duration*fraction;
    await page.evaluate(target=>{el.videoPlayer.pause();window.priorGeneration=q1Playback.player.stats().generation;
      setPlayerCurrentTime(el.videoPlayer,target,'qa-priority-controls');},target);
    await page.waitForFunction(()=>state.mediaAttempt==='failed'||(q1Playback?.player?.stats().generation>priorGeneration
      &&q1Playback.player.stats().frames>0&&state.mediaTransportVerified&&['ready','ended'].includes(q1Playback.player.stats().phase)),{},{timeout:30000});
    demand(await page.evaluate(()=>state.mediaAttempt==='q1'),'PRIORITY_SEEK_FAILED');
    const sample=await page.evaluate(()=>({target:q1Playback.player.stats().target,time:q1Playback.player.stats().lastMediaTime,
      width:el.videoPlayer.videoWidth,height:el.videoPlayer.videoHeight,paused:el.videoPlayer.paused,frameCount:q1Playback.player.stats().frames}));
    demand(Math.abs(sample.target-target)<.001&&Math.abs(sample.time-target)<1/30+.0001,'PRIORITY_SEEK_FRAME');
    demand(sample.paused&&sample.width===360&&sample.height===640,'PRIORITY_SEEK_STATE');
    await page.evaluate(()=>el.videoPlayer.play());
    await page.waitForFunction(()=>q1Playback?.player?.stats().frames>=5,{},{timeout:10000});report.seeks.push(sample);
  }
  stage='near-end';await page.evaluate(target=>{el.videoPlayer.pause();window.priorGeneration=q1Playback.player.stats().generation;
    setPlayerCurrentTime(el.videoPlayer,target,'qa-priority-controls');},initial.duration-2);
  await page.waitForFunction(()=>q1Playback?.player?.stats().generation>priorGeneration&&q1Playback.player.stats().frames>0,{},{timeout:30000});
  await page.evaluate(()=>el.videoPlayer.play());await page.waitForFunction(()=>el.videoPlayer.ended,{},{timeout:15000});
  report.nearEnd={ended:true};stage='close';await page.evaluate(()=>{window.lastQ1=q1Playback.player;closePlayer({preserveHistory:true});});
  report.cleanup=await page.evaluate(()=>q1Retirement);demand(report.cleanup.settled,'PRIORITY_CLEANUP');
  demand(await page.evaluate(()=>q1Playback===null&&el.videoPlayer.getAttribute('src')===null&&el.playerSheet.hidden),'PRIORITY_CLOSED_UI');
  demand(previews===0,'PRIORITY_NO_IFRAME');demand(errors.length===0&&transportErrors.length===0,'PRIORITY_BROWSER_ERRORS');
  report.passed=true;
}
run().catch(error=>{report.passed=false;report.failure={stage,code:fixed(error)};process.exitCode=1;}).finally(async()=>{
  if(page)try{
    report.terminal=await page.evaluate(()=>{const value=(q1Playback?.player||window.lastQ1)?.stats();return {
      attempt:state.mediaAttempt,phase:value?.phase,failure:value?.failure,sourceCleanup:value?.sourceCleanup,
      nativeCode4:window.nativeCode4,frameCount:value?.frames};});
    await page.evaluate(()=>{if(state.selected)closePlayer({preserveHistory:true});});
    report.finalRetirement=await page.evaluate(()=>q1Retirement);
  }catch{report.browserCleanupDiagnostic='PRIORITY_BROWSER_CLEANUP_UNAVAILABLE';}
  try{if(browser)await browser.close();}catch{report.passed=false;report.browserCloseFailed=true;}
  await Promise.allSettled([...inflight]);
  if(errors.length||transportErrors.length){report.passed=false;report.lateBrowserErrors=true;}
  if(server)try{await new Promise(resolve=>server.close(resolve));}catch{report.passed=false;report.serverCloseFailed=true;}
  report.cleanupDescriptors=openDescriptors;report.cleanupRequests=inflight.size;
  if(openDescriptors||inflight.size){report.passed=false;report.cleanupFailed=true;}
  if(sourceFile&&sourceBefore)try{
    fence();const after=await fingerprint(sourceFile);fence();
    demand(sourceDigest&&after===sourceDigest,'PRIORITY_FINAL_FINGERPRINT');
    report.finalFingerprintMatched=true;report.localStateUnchanged=true;
  }catch{report.passed=false;report.finalFenceFailed=true;}
  if(sources)try{demand(same(hashes(),sources),'PRIORITY_PRODUCER_CHANGED');report.producerUnchanged=true;}
  catch{report.passed=false;report.producerChanged=true;}
  report.metadataReads=metadataReads;report.rangeRequests=ranges.length;report.rangeBytes=mediaBytes;
  report.peakReadBufferBytes=peakReadBytes;report.preflights=preflights;report.previewRequests=previews;
  report.errors=errors;report.transportErrors=transportErrors;
  if(!report.passed)process.exitCode=1;
  const output=path.join(__dirname,'q1-priority');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'app.redacted.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failure:report.failure,initial:!!report.initial,seeks:report.seeks?.length||0,
    ended:report.nearEnd?.ended||false,cleanup:report.cleanup?.settled,finalFingerprintMatched:report.finalFingerprintMatched}));
});
