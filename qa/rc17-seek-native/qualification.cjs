'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('../node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const producerPaths=['app.js','sw.js','index.html','styles.css','version.json',...fs.readdirSync(path.join(root,'media')).filter(n=>/^(general-|mediabunny-q1|audio-)/.test(n)).map(n=>'media/'+n)];
const hashes=()=>Object.fromEntries(producerPaths.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex')]));
const report={scope:'Fixed root-pinned rc17 Git bytes, synthetic provider and original AAC/Q0 plus AC3/Q2 fixtures, trusted paused10/50/90% seek input. Native target decoded rVFC joins later seeked/settled/watchdog/loader hidden without requiring another paused frame. Serial owned installed Chrome and hostmemory gates. No Q1/device/account/audibility/full-duration proof.',producerStart:hashes(),results:[],passed:false};
const expectedCommit=process.env.QA_RC17_PIN;
assert.match(expectedCommit||'',/^[a-f0-9]{40}$/,'Root must provide fixed rc17 commit before launch');
const execFileSync=require('node:child_process').execFileSync;
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),expectedCommit);
for(const name of producerPaths)assert.equal(crypto.createHash('sha256').update(execFileSync('git',['show',expectedCommit+':'+name],{cwd:root,maxBuffer:64*1024*1024})).digest('hex'),report.producerStart[name],'current bytes differ from fixed Git '+name);
report.commit=expectedCommit;report.harness={path:'qa/q1-q2-app-integration/native-retirement-smoke.cjs',sha256:'2252c4286874437ede9208209166b1d3bb89eef2e03fa9585bb5c120115a1e8a',driverSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')};
function memory(){const m=JSON.parse(execFileSync('powershell',['-NoProfile','-Command','Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json -Compress'],{encoding:'utf8'}));assert.ok(m.FreePhysicalMemory>1024*1024,'physical below1GiB');assert.ok(m.FreeVirtualMemory>1.5*1024*1024,'available virtual below1.5GiB');return m;}
const selectedName=undefined;
if(selectedName)report.selectedCase=selectedName;
const save=()=>{report.producerEnd=hashes();fs.writeFileSync(path.join(__dirname,selectedName?'native-retirement-budget-smoke-results.json':'results.json'),JSON.stringify(report,null,2));};
const fixtures={ac3:'qa/q2-audio-compatibility/synthetic-avc-ac3.mp4',eac3:'qa/q2-audio-compatibility/eac3-source-build/synthetic-avc-eac3-stereo.mp4',aac:'qa/faststart-h264-aac.mp4',webm:'qa/q1-retirement-final/fixture.webm'};
const cases=[{name:'ac3-q2-paused-seeks',fixture:'ac3',q2:true},{name:'aac-q0-paused-seeks',fixture:'aac'}];
if(selectedName&&!cases.some(trial=>trial.name===selectedName))throw new Error('Unknown smoke case');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+u.pathname+(u.pathname==='/'?'index.html':''));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return res.writeHead(404).end();
 res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(f).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try {for(const trial of cases.filter(trial=>!selectedName||trial.name===selectedName)){let browser;const result={name:trial.name,passed:false,memory:memory()};report.results.push(result);save();
  try {
   const bytes=fs.readFileSync(path.join(root,fixtures[trial.fixture])),sha=crypto.createHash('sha256').update(bytes).digest('hex'),mime=trial.fixture==='webm'?'video/webm':'video/mp4';result.fixture={path:fixtures[trial.fixture],sha256:sha,bytes:bytes.length};
   browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();const context=await browser.newContext();
   result.requests=0;await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();if(u.origin!=='https://www.googleapis.com')return route.fulfill({status:403,body:'{}'});result.requests++;
    const headers={'access-control-allow-origin':'*','access-control-expose-headers':'content-range,content-length,content-type'};
    if(u.pathname.endsWith('/download'))return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({name:'synthetic/op',done:true,response:{'@type':'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse',partialDownloadAllowed:true,downloadUri:'https://www.googleapis.com/drive/v3/files/fixture/revisions/A?alt=media'}})});
    if(!u.searchParams.has('alt'))return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({id:'fixture',headRevisionId:'A',size:String(bytes.length),mimeType:mime,modifiedTime:'A',sha256Checksum:sha,trashed:false,capabilities:{canDownload:true,canReadRevisions:true}})});
    const m=/bytes=(\d+)-(\d*)/.exec(req.headers().range||''),a=m?+m[1]:0,b=m&&m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;
    return route.fulfill({status:m?206:200,headers:{...headers,'content-length':String(b-a+1),...(m?{'content-range':`bytes ${a}-${b}/${bytes.length}`}:{})},contentType:mime,body:bytes.subarray(a,b+1)});
   });
   const page=await context.newPage();result.errors=[];page.on('pageerror',e=>result.errors.push(e.name));page.on('crash',()=>{result.pageCrashed=true;save();});
   await page.goto(origin);await page.waitForFunction(()=>navigator.serviceWorker.controller&&typeof startInitialOriginalPlayback==='function');
   await page.evaluate(({size,mime,trial})=>{state.token='synthetic';state.expiresAt=Date.now()+3600000;state.tokenRevision=1;state.authAccountKey='account';state.driveSessionGeneration=1;state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:false};state.demo=false;state.selected={id:'fixture',name:'synthetic',mimeType:mime,size:String(size),capabilities:{canDownload:true}};state.mediaSession++;el.playerSheet.hidden=false;state.pendingPlay=true;window.qaRoutes=[];
    const route=tryOriginalTsPlayback;tryOriginalTsPlayback=function(f,s,o){qaRoutes.push({general:!!o?.general,audioCompatibility:!!o?.audioCompatibility});return route(f,s,o);};
    if(trial.manual)planPinnedOriginalAudio=async()=>{};
    if(trial.drift){const read=driveFetch;driveFetch=async function(url,options){const response=await read(url,options);if(q0Playback?.audioProbeStarted&&new URL(url).searchParams.has('fields')){const metadata=await response.json();metadata.headRevisionId='B';return Response.json(metadata);}return response;};}
    openMediaSource(state.selected);el.mediaStage.focus();
   },{size:bytes.length,mime,trial});
   if(trial.manual){await page.waitForFunction(()=>q0PinnedSource&&q0Playback?.audioProbeStarted&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0);await page.evaluate(()=>tryOriginalTsPlayback(state.selected,state.mediaSession,{general:true}));}
   await page.waitForFunction(({q2,drift})=>drift?state.mediaAttempt==='failed':q2?(state.mediaPlaybackMode===PLAYBACK_MODE.AUDIO_COMPATIBILITY&&q1Playback?.player?.stats()?.mapping&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0):(q0Playback?.audioProbeStarted&&state.mediaAttempt==='range'&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0),trial,{timeout:30000});
   if(!trial.q2&&!trial.drift)await page.evaluate(()=>q0Playback.setupDone);
   result.before=await page.evaluate(()=>({attempt:state.mediaAttempt,mode:state.mediaPlaybackMode,probeStarted:!!q0Playback?.audioProbeStarted,pin:!!q0PinnedSource,routes:qaRoutes,frames:el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames,stats:q1Playback?.player?.stats?.(),hasSource:el.videoPlayer.hasAttribute('src')}));save();
   await page.waitForFunction(()=>el.mediaLoading.hidden&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0&&!el.videoPlayer.paused);
   await page.keyboard.press('Space');await page.waitForFunction(()=>el.videoPlayer.paused);
   await page.evaluate(()=>{window.qaSeek=null;el.videoPlayer.addEventListener('seeked',()=>{if(qaSeek)qaSeek.events.push({type:'seeked',time:playerTimeline().currentTime,sourceGeneration:mediaSourceGeneration,seekGeneration:mediaSeekGeneration});});});
   result.seeks=[];
   for(const ratio of [.1,.5,.9]){
    const hostMemory=memory();
    await page.evaluate(r=>{setPlayerChromeVisible(true);const target=playerTimeline().duration*r;window.qaSeek={ratio:r,target,frames:[],events:[],inputTrusted:false};function frame(_now,m){const commonShift=q1Playback?.player?.stats()?.mapping?.commonShift||0,sourceTime=m.mediaTime+commonShift;if(Math.abs(sourceTime-target)<.25){qaSeek.frames.push({mediaTime:m.mediaTime,sourceTime,target,nativeSeeking:el.videoPlayer.seeking,appSeeking:state.isSeeking,sourceGeneration:mediaSourceGeneration,seekGeneration:mediaSeekGeneration});}else el.videoPlayer.requestVideoFrameCallback(frame);}el.videoPlayer.requestVideoFrameCallback(frame);el.seekBarContainer.addEventListener('pointerdown',e=>{qaSeek.inputTrusted=e.isTrusted},{once:true});},ratio);
    const box=await page.locator('#seekBarContainer').boundingBox();assert.ok(box?.width>44);await page.mouse.click(box.x+box.width*ratio,box.y+box.height/2);
    await page.waitForFunction(()=>qaSeek.frames.length&&qaSeek.events.length&&qaSeek.inputTrusted&&el.videoPlayer.paused&&!el.videoPlayer.seeking&&!state.isSeeking&&mediaSeekWatchdog===null&&el.mediaLoading.hidden&&Math.abs(playerTimeline().currentTime-qaSeek.target)<.35,null,{timeout:20000}).catch(async e=>{result.failureState=await page.evaluate(()=>({qa:qaSeek,timeline:playerTimeline(),paused:el.videoPlayer.paused,nativeSeeking:el.videoPlayer.seeking,appSeeking:state.isSeeking,watchdog:mediaSeekWatchdog&&{target:mediaSeekWatchdog.targetTime,frame:mediaSeekWatchdog.frameSeen,seeked:mediaSeekWatchdog.seekedSeen},loading:!el.mediaLoading.hidden,readyState:el.videoPlayer.readyState,proof:!!completedMediaSeekPresentation,presentationKey:el.videoPlayer.dataset.presentationSession}));save();throw e;});
    await page.waitForTimeout(200);
    const seek=await page.evaluate(()=>({qa:qaSeek,timeline:playerTimeline(),paused:el.videoPlayer.paused,nativeSeeking:el.videoPlayer.seeking,appSeeking:state.isSeeking,watchdog:mediaSeekWatchdog,loading:!el.mediaLoading.hidden,readyState:el.videoPlayer.readyState,proof:!!completedMediaSeekPresentation,presentationKey:el.videoPlayer.dataset.presentationSession}));seek.memory=hostMemory;assert.equal(seek.paused,true);assert.equal(seek.loading,false);assert.equal(seek.nativeSeeking,false);assert.equal(seek.appSeeking,false);assert.equal(seek.watchdog,null);result.seeks.push(seek);save();
   }

   await page.keyboard.press('Escape');await page.waitForFunction(()=>el.playerSheet.hidden);result.after=await page.evaluate(async()=>{await q1Retirement;return {cleanup:q1RetirementResult,hasSource:el.videoPlayer.hasAttribute('src'),selected:state.selected,frameCallback:state.frameCallbackId,proof:completedMediaSeekPresentation};});assert.equal(result.after.selected,null);assert.equal(result.after.frameCallback,null);assert.equal(result.after.proof,null);
   assert.equal(result.after.cleanup.settled,true);assert.equal(result.after.hasSource,false);assert.deepEqual(result.errors,[]);result.passed=true;save();console.log(trial.name,'PASS');
  }catch(error){result.failure={name:error.name,classification:result.pageCrashed?'page-crashed':'assertion-or-harness-failure'};save();throw error;}
  finally{await browser?.close();result.browserClosed=true;save();}
 }
 assert.deepEqual(report.producerStart,hashes(),'producer changed during native run');report.passed=true;save();
 }finally{await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
