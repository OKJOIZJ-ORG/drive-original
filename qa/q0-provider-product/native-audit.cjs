'use strict';
// Synthetic provider; actual unmodified application, service worker, native video and installed isolated Chrome.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('../node_modules/playwright');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fixtureFile='qa/faststart-h264-aac.mp4',bytes=fs.readFileSync(path.join(root,fixtureFile));
const assets=require(path.join(root,'scripts/public-files.cjs'));
const snapshot=new Map(assets.map(name=>[name,fs.readFileSync(path.join(root,name))]));
const mime=name=>name.endsWith('.js')||name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':name.endsWith('.png')?'image/png':name.endsWith('.svg')?'image/svg+xml':'application/json';
const producer=Object.fromEntries(['qa/q0-provider-product/native-audit.cjs','app.js','sw.js','index.html','media/revision-pin.js','scripts/public-files.cjs',fixtureFile].map(name=>[name,sha(fs.readFileSync(path.join(root,name)))]));
let browser;const requests=[],pageErrors=[],consoleErrors=[],blocked=[];
const result={scope:'Isolated installed Chrome; actual app/SW/native MP4; synthetic Drive only; no real account/provider acceptance',producer,fixtureBytes:bytes.length};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  if(!snapshot.has(name))return res.writeHead(404,{'content-type':'application/json'}).end('{}');
  res.writeHead(200,{'content-type':mime(name),'cache-control':'no-store','content-length':snapshot.get(name).length}).end(snapshot.get(name));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});result.chrome=browser.version();
    const context=await browser.newContext();const origin=`http://127.0.0.1:${server.address().port}`;
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin)return route.continue();
      if(url.origin!=='https://www.googleapis.com'){
        blocked.push({origin:url.origin,path:url.pathname});
        return route.fulfill({status:403,contentType:'application/json',body:'{}'});
      }
      const kind=url.pathname.endsWith('/download')?'download':url.pathname.includes('/revisions/A')?'revision':url.pathname.includes('/operations/')?'operation':'metadata';
      const row={kind,method:request.method(),range:request.headers().range||null,fromWorker:Boolean(request.serviceWorker())};requests.push(row);
      const headers={'access-control-allow-origin':'*','access-control-expose-headers':'content-range,content-length,content-type','cache-control':'no-store'};
      if(kind==='metadata')return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({id:'fixture',headRevisionId:'A',size:String(bytes.length),mimeType:'video/mp4',modifiedTime:'2026-09-29T00:00:00Z',sha256Checksum:sha(bytes),trashed:false,capabilities:{canDownload:true,canReadRevisions:true}})});
      if(kind==='download')return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({name:'synthetic/opaque+operation',done:true,response:{'@type':'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse',partialDownloadAllowed:true,downloadUri:'https://www.googleapis.com/drive/v3/files/fixture/revisions/A?alt=media&opaqueGrant=synthetic'}})});
      assert.equal(kind,'revision','unexpected provider path must not reach unchecked latest media');
      const match=/^bytes=(\d*)-(\d*)$/.exec(row.range||'');assert.ok(match,'native route must send a Range');
      const start=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2]));
      const requestedEnd=match[1]?(match[2]?Math.min(bytes.length-1,Number(match[2])):bytes.length-1):bytes.length-1;
      // Legal short 206 forces multiple genuine browser requests on the small retained fixture.
      const end=Math.min(requestedEnd,start+65535);row.start=start;row.end=end;row.length=end-start+1;
      assert.ok(start>=0&&start<=end&&end<bytes.length);
      return route.fulfill({status:206,headers:{...headers,'content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':String(row.length)},contentType:'application/octet-stream',body:bytes.subarray(start,end+1)});
    });
    const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    await page.goto(origin);await page.waitForFunction(()=>navigator.serviceWorker.controller&&typeof startOriginalRangePlayback==='function',{timeout:15000});
    await page.waitForFunction(()=>!state.bootstrapAuthPending,null,{timeout:15000}).catch(()=>{});
    await page.evaluate(()=>{
      state.token='synthetic';state.expiresAt=Date.now()+3600000;state.tokenRevision=1;state.authAccountKey='synthetic-account';state.driveSessionGeneration=1;
      state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:false};state.demo=false;
      state.selected={id:'fixture',name:'synthetic.mp4',mimeType:'video/wrong',size:'999999999'};state.mediaSession+=1;
      el.playerSheet.hidden=false;el.videoPlayer.muted=true;state.pendingPlay=true;
      window.__nativeEvents=[];for(const type of ['loadedmetadata','canplay','playing','seeking','seeked','ended','error'])el.videoPlayer.addEventListener(type,()=>__nativeEvents.push({type,time:el.videoPlayer.currentTime,ready:el.videoPlayer.readyState,error:el.videoPlayer.error?.code||null}));
      startOriginalRangePlayback(state.selected,'video',state.mediaSession);
    });
    await page.waitForFunction(()=>el.videoPlayer.currentTime>0.5&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>5,null,{timeout:20000});
    result.play=await page.evaluate(()=>({time:el.videoPlayer.currentTime,duration:el.videoPlayer.duration,frames:el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames,pinSize:q0PinnedSource?.descriptor.size,pinMime:q0PinnedSource?.descriptor.mimeType,src:el.videoPlayer.getAttribute('src'),attempt:state.mediaAttempt}));
    assert.equal(result.play.attempt,'range');assert.equal(result.play.pinSize,String(bytes.length));assert.equal(result.play.pinMime,'video/mp4');
    const sourceUrl=new URL(result.play.src,origin);assert.deepEqual([...sourceUrl.searchParams.keys()].sort(),['mediaOwner','sourceGeneration']);
    await page.evaluate(()=>{el.videoPlayer.pause();setPlayerCurrentTime(el.videoPlayer,el.videoPlayer.duration*0.9,'qa-native-seek');});
    await page.waitForFunction(()=>!el.videoPlayer.seeking&&el.videoPlayer.readyState>=2&&el.videoPlayer.currentTime>=el.videoPlayer.duration*0.88,null,{timeout:15000});
    await page.evaluate(()=>el.videoPlayer.play());
    await page.waitForFunction(()=>el.videoPlayer.currentTime>=el.videoPlayer.duration*0.93,null,{timeout:10000});
    result.seek=await page.evaluate(()=>({time:el.videoPlayer.currentTime,duration:el.videoPlayer.duration,frames:el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames,error:el.videoPlayer.error?.code||null}));
    await page.evaluate(()=>closePlayer({preserveHistory:true}));
    await page.waitForFunction(()=>q1RetirementResult?.settled===true&&!q0Playback&&!el.videoPlayer.hasAttribute('src'),null,{timeout:5000});
    result.close=await page.evaluate(()=>({settled:q1RetirementResult.settled,owner:!!q0Playback,pin:!!q0PinnedSource,src:el.videoPlayer.hasAttribute('src'),hidden:el.playerSheet.hidden}));
    result.events=await page.evaluate(()=>__nativeEvents);assert.equal(result.events.some(e=>e.error),false);
    assert.equal(requests.filter(r=>r.kind==='metadata').length,2);assert.equal(requests.filter(r=>r.kind==='download').length,1);assert.ok(requests.filter(r=>r.kind==='revision').length>=2);
    assert.ok(requests.every(r=>r.fromWorker));assert.equal(pageErrors.length,0);
    result.passed=true;
  }catch(error){result.passed=false;result.error={message:error.message,stack:error.stack};process.exitCode=1;}
  finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve));
    result.requests=requests;result.pageErrors=pageErrors;result.consoleErrors=consoleErrors;result.blockedExternal=blocked;
    result.sourceSnapshotUnchanged=Object.entries(producer).filter(([name])=>name!=='qa/q0-provider-product/native-audit.cjs').every(([name,hash])=>sha(fs.readFileSync(path.join(root,name)))===hash);
    fs.writeFileSync(path.join(__dirname,'native-results.json'),JSON.stringify(result,null,2)+'\n');
    process.stdout.write(JSON.stringify({passed:result.passed,error:result.error?.message,requests:requests.length,play:result.play,seek:result.seek,close:result.close})+'\n');
  }
})();
