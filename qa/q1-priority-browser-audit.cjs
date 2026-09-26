'use strict';
// Private original bytes, one capability-scoped loopback server, no derivatives.
// Actual product Q1 component, NOT authenticated Drive/SW or physical-device QA.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=['qa/q1-priority-browser-audit.cjs','qa/v2-03b-container-remux/browser-probe-server.mjs','media/ts-player.mjs','media/drive-source.mjs','media/q1-core.mjs','media/transmux-worker.mjs','media/mux-mp4.min.js'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const sources=hashes(),report={sourceLabel:'priority-sample-1',recordedAt:new Date().toISOString(),sources,
  currentDriveIdentityVerified:false,originalWrites:0,scope:'actual private local original, product Q1 and Chrome; local metadata/HTTP only, muted; not Drive/SW/iPhone/audibility/color/total-memory acceptance'};
let server,browser,fd,sourceFile,sourceBefore,sourceDigest;const streams=new Set();
const transportErrors=[];report.transportErrors=transportErrors;
const stateOf=stat=>({size:stat.size,mtimeMs:stat.mtimeMs,dev:stat.dev,ino:stat.ino});
async function fingerprint(file){const hash=createHash('sha256');for await(const part of fs.createReadStream(file))hash.update(part);return hash.digest('hex');}
(async()=>{
  assert.ok(process.argv[2],'EXPLICIT_PRIVATE_EXPECTATION_REQUIRED');
  const expected=JSON.parse(fs.readFileSync(process.argv[2])),file=expected.localPath,before=stateOf(fs.statSync(file));
  sourceFile=file;sourceBefore=before;
  assert.equal(before.size,Number(expected.drive.size));const digest=await fingerprint(file);
  assert.equal(digest,expected.localBytes.sha256.toLowerCase());report.historicalFingerprintMatched=true;report.sourceBytes=before.size;
  sourceDigest=digest;
  fd=fs.openSync(file,'r');
  const {isExpectedLoopbackHost,isSameOrigin,isProbePageReferer,parseSingleRange}=await import('./v2-03b-container-remux/browser-probe-server.mjs');
  const capability=randomBytes(32).toString('base64url'),pagePath=`/${capability}/`,ranges=[];
  const metadata={id:'priority-local',headRevisionId:'local-initial-stat',size:String(before.size),mimeType:'video/mp4',
    modifiedTime:new Date(before.mtimeMs).toISOString(),version:'1',trashed:false,capabilities:{canDownload:true}};
  let metadataReads=0,blocked=0;
  const mediaAssets=new Set(require('../scripts/public-files.cjs').filter(file=>file.startsWith('media/')));
  server=http.createServer((req,res)=>{
    let requestFd;
    try {
    const host=req.headers.host,url=new URL(req.url,'http://localhost');
    const reject=status=>{blocked++;if(status===409)transportErrors.push({kind:'source-stat-fence'});res.writeHead(status,{'Cache-Control':'no-store'}).end();};
    if(!isExpectedLoopbackHost(host,server.address().port))return reject(400);
    if(req.headers.origin&&!isSameOrigin(req.headers.origin,host))return reject(403);
    if(req.method!=='GET')return reject(405);
    if(url.pathname===pagePath)return res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Referrer-Policy':'same-origin'})
      .end('<!doctype html><title>Private local Q1 probe</title><video muted playsinline></video>');
    if(mediaAssets.has(url.pathname.slice(1)))return res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'})
      .end(fs.readFileSync(path.join(root,url.pathname.slice(1))));
    if(!isProbePageReferer(req.headers.referer,host,capability))return reject(403);
    if(url.pathname!==`${pagePath}identity`&&url.pathname!==`${pagePath}media`)return reject(404);
    if(JSON.stringify(stateOf(fs.fstatSync(fd)))!==JSON.stringify(before)
      ||JSON.stringify(stateOf(fs.statSync(file)))!==JSON.stringify(before))return reject(409);
    if(url.pathname.endsWith('identity')){
      metadataReads++;return res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
        .end(JSON.stringify({...metadata,version:String(metadataReads)}));
    }
    const range=parseSingleRange(req.headers.range,before.size);
    if(range.kind!=='partial'||range.end-range.start+1>1048576)return reject(416);
    // Each stream owns a separate verified descriptor. A canceled stream must
    // never close the baseline descriptor or another concurrent request's fd.
    requestFd=fs.openSync(file,'r');
    if(JSON.stringify(stateOf(fs.fstatSync(requestFd)))!==JSON.stringify(before)
      ||JSON.stringify(stateOf(fs.statSync(file)))!==JSON.stringify(before)){
      fs.closeSync(requestFd);requestFd=undefined;return reject(409);
    }
    const stream=fs.createReadStream(file,{fd:requestFd,autoClose:true,start:range.start,end:range.end});requestFd=undefined;streams.add(stream);
    const count=range.end-range.start+1;ranges.push({start:range.start,end:range.end});
    res.writeHead(206,{'Content-Type':'video/mp2t','Content-Length':String(count),'Content-Range':`bytes ${range.start}-${range.end}/${before.size}`,'Cache-Control':'no-store'});
    res.once('close',()=>stream.destroy());stream.once('close',()=>streams.delete(stream));
    stream.once('error',error=>{transportErrors.push({kind:'stream',code:/^E[A-Z]+$/.test(error.code)?error.code:'IO_ERROR'});res.destroy();});stream.pipe(res);
    } catch(error) {
      transportErrors.push({kind:'handler',code:/^E[A-Z]+$/.test(error.code)?error.code:'IO_ERROR'});
      if(requestFd!==undefined)fs.closeSync(requestFd);
      // Never let a disappearing source escape the HTTP handler and bypass
      // browser/server cleanup or expose a private filesystem error.
      if(res.headersSent)res.destroy();else res.writeHead(409,{'Cache-Control':'no-store'}).end();
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  // Read-only security negatives before private bytes are served.
  assert.equal((await fetch(`${base}${pagePath}media`,{headers:{Range:'bytes=0-9'}})).status,403);
  assert.equal((await fetch(`${base}${pagePath}media`,{headers:{Range:'bytes=0-9',Referer:`${base}${pagePath}`,Origin:'https://foreign.invalid'}})).status,403);
  assert.equal((await fetch(`${base}${pagePath}media`,{method:'POST',headers:{Referer:`${base}${pagePath}`}})).status,405);
  // Exercise stream cancellation before Chrome: the baseline fd and subsequent
  // requests must survive, including Windows ReadStream descriptor ownership.
  for(let index=0;index<3;index++){
    const response=await fetch(`${base}${pagePath}media`,{headers:{Range:'bytes=0-1048575',Referer:`${base}${pagePath}`}});
    assert.equal(response.status,206);await response.body.cancel();
    const identity=await fetch(`${base}${pagePath}identity`,{headers:{Referer:`${base}${pagePath}`}});
    assert.equal(identity.status,200);await identity.json();
    assert.deepEqual(stateOf(fs.fstatSync(fd)),before);
  }
  report.cancellationIsolationChecks=3;
  ranges.length=0;metadataReads=0;
  browser=await chromium.launch({channel:'chrome',headless:true});report.browserVersion=browser.version();const page=await browser.newPage(),errors=[];
  page.on('pageerror',()=>errors.push('PAGE_ERROR'));
  page.on('requestfailed',request=>{
    const kind=request.url().endsWith('/identity')?'metadata':request.url().endsWith('/media')?'range':'other';
    const code=request.failure()?.errorText;transportErrors.push({kind,code:/^net::ERR_[A-Z_]+$/.test(code)?code:'FETCH_FAILED'});
  });
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(`${base}${pagePath}`);
  await page.evaluate(async()=>{
    const {openDriveQ1Source}=await import('/media/drive-source.mjs'),{createTsPlayer}=await import('/media/ts-player.mjs');
    const video=document.querySelector('video');video.muted=true;window.events=[];
    const openSource=({signal})=>openDriveQ1Source({fileId:'priority-local',accountKey:'local-read-only',accountGeneration:1,
      signal,isCurrent:()=>true,readMetadata:async({signal})=>(await fetch(new URL('identity',location.href),{signal,cache:'no-store'})).json(),
      readRange:({range,signal})=>fetch(new URL('media',location.href),{signal,headers:{Range:range},cache:'no-store'})});
    window.player=createTsPlayer({video,openSource,isCurrent:()=>true,onEvent:event=>window.events.push(event),autoplay:false});
    await player.ready;
  });
  await page.waitForFunction(()=>player.stats().frames>0,{},{timeout:15000});
  const first=await page.evaluate(()=>({stats:player.stats(),width:document.querySelector('video').videoWidth,height:document.querySelector('video').videoHeight}));
  assert.equal(first.width,360);assert.equal(first.height,640);assert.ok(first.stats.lastMediaTime<.1);
  report.initial={...first,rangeRequests:ranges.length,rangeBytes:ranges.reduce((n,row)=>n+row.end-row.start+1,0)};
  report.samples=[];
  for(const fraction of [.1,.5,.9]){
    const target=first.stats.duration*fraction;
    await page.evaluate(async target=>{const video=document.querySelector('video');video.pause();await player.seek(target,{autoplay:false});},target);
    await page.waitForFunction(()=>player.stats().frames>0,{},{timeout:15000});
    const frame=await page.evaluate(()=>({time:player.stats().lastMediaTime,target:player.stats().target,width:document.querySelector('video').videoWidth,stats:player.stats()}));
    assert.equal(frame.width,360);assert.ok(Math.abs(frame.time-frame.target)<1/30+.0001);
    await page.evaluate(()=>document.querySelector('video').play());
    await page.waitForFunction(()=>player.stats().frames>=5,{},{timeout:10000});
    report.samples.push({...frame,progress:await page.evaluate(()=>({frames:player.stats().frames,time:player.stats().lastMediaTime}))});
  }
  await page.evaluate(async()=>{const video=document.querySelector('video');video.pause();await player.seek(player.stats().duration-2,{autoplay:true});});
  await page.waitForFunction(()=>player.stats().phase==='ended'||player.stats().phase==='failed',{},{timeout:15000});
  report.nearEnd=await page.evaluate(()=>player.stats());assert.equal(report.nearEnd.phase,'ended');
  if(process.argv.includes('--continuous')){
    const started=Date.now(),requestsBefore=ranges.length;
    await page.evaluate(async()=>{const video=document.querySelector('video');video.playbackRate=16;await player.seek(0,{autoplay:true});});
    assert.equal(await page.evaluate(()=>document.querySelector('video').playbackRate),16);
    await page.waitForFunction(()=>document.querySelector('video').currentTime>64||player.stats().phase==='failed',{},{timeout:20000});
    assert.notEqual(await page.evaluate(()=>player.stats().phase),'failed');
    await page.evaluate(()=>document.querySelector('video').pause());
    await page.waitForFunction(()=>player.stats().window.waits>0,{},{timeout:10000});
    // One in-flight bounded epoch may settle before the paused counter snapshot.
    await page.waitForTimeout(500);const paused={ranges:ranges.length,metadataReads};
    console.log('Priority full playback: paused at bounded window; checking 16.1-second request freeze');
    await page.waitForTimeout(16100);
    assert.equal(ranges.length,paused.ranges);assert.equal(metadataReads,paused.metadataReads);
    await page.evaluate(()=>document.querySelector('video').play());
    console.log('Priority full playback: resumed at 16x; awaiting original EOF');
    await page.waitForFunction(()=>['ended','failed'].includes(player.stats().phase),{},{timeout:220000});
    const final=await page.evaluate(()=>player.stats());assert.equal(final.phase,'ended');
    report.continuous={elapsedMs:Date.now()-started,playbackRate:16,pauseMs:16100,pausedCounters:paused,
      rangeRequests:ranges.length-requestsBefore,rangeBytes:ranges.slice(requestsBefore).reduce((n,row)=>n+row.end-row.start+1,0),final};
    assert.ok(final.frames>100&&final.appends>100&&final.window.removals>100);
    assert.equal(final.source.releasedBytes,report.continuous.rangeBytes);
  }
  report.cleanup=await page.evaluate(()=>player.dispose());assert.equal(report.cleanup.settled,true);
  assert.deepEqual(errors,[]);report.errors=errors;report.metadataReads=metadataReads;report.ranges=ranges;report.blockedSecurityRequests=blocked;
  await browser.close();browser=null;await new Promise(resolve=>server.close(resolve));server=null;
  assert.equal(streams.size,0);fs.closeSync(fd);fd=undefined;
  assert.deepEqual(stateOf(fs.statSync(file)),before);
  report.fingerprintMatchedAfter=(await fingerprint(file))===digest;assert.equal(report.fingerprintMatchedAfter,true);
  assert.deepEqual(stateOf(fs.statSync(file)),before);report.localStateUnchanged=true;
  assert.deepEqual(hashes(),sources);report.passed=true;
})().catch(error=>{report.passed=false;report.error=/^(?:Q1|SEEK|BOOTSTRAP|WORKER)_[A-Z_]+$/.test(error.message)?error.message:'PRIORITY_BROWSER_FAILED';
  process.exitCode=1;console.error(report.error);}).finally(async()=>{
  if(browser){try{const pages=browser.contexts().flatMap(context=>context.pages());report.failureState=await pages[0]?.evaluate(()=>({stats:window.player?.stats(),events:window.events}));}catch{}await browser.close();}
  for(const stream of streams)stream.destroy();if(server)await new Promise(resolve=>server.close(resolve));if(fd!==undefined)fs.closeSync(fd);
  if(sourceDigest&&!report.fingerprintMatchedAfter)try{
    assert.deepEqual(stateOf(fs.statSync(sourceFile)),sourceBefore);
    assert.equal(await fingerprint(sourceFile),sourceDigest);
    assert.deepEqual(stateOf(fs.statSync(sourceFile)),sourceBefore);
    report.fingerprintMatchedAfter=true;report.localStateUnchanged=true;
  }catch{report.passed=false;report.finalFenceFailed=true;process.exitCode=1;}
  const out=path.join(__dirname,'q1-priority');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'browser.redacted.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,initialFrame:report.initial?.stats.lastMediaTime,samples:report.samples?.map(row=>({target:row.target,time:row.time})),nearEnd:report.nearEnd?.phase,cleanup:report.cleanup?.settled}));
});
