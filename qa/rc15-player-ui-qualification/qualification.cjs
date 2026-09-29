'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('../node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const producerPaths=['app.js','sw.js','styles.css','index.html',...fs.readdirSync(path.join(root,'media')).filter(n=>/^(general-|mediabunny-q1|audio-)/.test(n)).map(n=>'media/'+n)];
const hashes=()=>Object.fromEntries(producerPaths.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex')]));
const report={scope:'Current rc15 actual app/SW/players and unmodified product bytes; synthetic AC3/EAC3 provider selects Q2 and AAC selects Q0. Serial fresh installed Chrome contexts with trusted mouse/keyboard and CDP touch emulation. Not physical-device, real-account, audibility or production evidence. Explicit recovery presentation is injected through existing UI functions; no transport failure claimed.',producerStart:hashes(),results:[],passed:false};
const selectedName=process.argv[2];
if(selectedName)report.selectedCase=selectedName;
const save=()=>{report.producerEnd=hashes();fs.writeFileSync(path.join(__dirname,selectedName?selectedName+'-results.json':'results.json'),JSON.stringify(report,null,2));};
const fixtures={ac3:'qa/q2-audio-compatibility/synthetic-avc-ac3.mp4',eac3:'qa/q2-audio-compatibility/eac3-source-build/synthetic-avc-eac3-stereo.mp4',aac:'qa/faststart-h264-aac.mp4',webm:'qa/q1-retirement-final/fixture.webm'};
const cases=['ac3','eac3','aac'].flatMap(fixture=>[false,true].map(mobile=>({name:fixture+'-'+(mobile?'touch-emulated':'desktop'),fixture,q2:fixture!=='aac',mobile})));
report.harness={base:'qa/q1-q2-app-integration/native-retirement-smoke.cjs',baseSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'qa/q1-q2-app-integration/native-retirement-smoke.cjs'))).digest('hex'),driverSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')};
if(selectedName&&!cases.some(trial=>trial.name===selectedName))throw new Error('Unknown smoke case');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+u.pathname+(u.pathname==='/'?'index.html':''));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return res.writeHead(404).end();
 res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(f).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try {for(const trial of cases.filter(trial=>!selectedName||trial.name===selectedName)){let browser;const result={name:trial.name,passed:false};report.results.push(result);save();
  try {
   const bytes=fs.readFileSync(path.join(root,fixtures[trial.fixture])),sha=crypto.createHash('sha256').update(bytes).digest('hex'),mime=trial.fixture==='webm'?'video/webm':'video/mp4';result.fixture={path:fixtures[trial.fixture],sha256:sha,bytes:bytes.length};
   browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();const context=await browser.newContext({viewport:trial.mobile?{width:390,height:844}:{width:1280,height:800},isMobile:trial.mobile,hasTouch:trial.mobile});
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
    window.qaFixtureFile={...state.selected,thumbnailLink:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#234"/></svg>')};openMediaSource(qaFixtureFile);window.qaLoading={poster:el.videoPlayer.hasAttribute('poster'),loading:!el.mediaLoading.hidden,rect:el.videoPlayer.getBoundingClientRect().toJSON()};setPlayerChromeVisible(false);el.mediaStage.focus();window.qaInput=[];for(const type of ['pointerdown','pointerup','click','keydown'])document.addEventListener(type,e=>{if(el.playerModal.contains(e.target))qaInput.push({type,trusted:e.isTrusted,target:e.target.id||e.target.tagName});},true);
   },{size:bytes.length,mime,trial});
   if(trial.manual){await page.waitForFunction(()=>q0PinnedSource&&q0Playback?.audioProbeStarted&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0);await page.evaluate(()=>tryOriginalTsPlayback(state.selected,state.mediaSession,{general:true}));}
   await page.waitForFunction(({q2,drift})=>drift?state.mediaAttempt==='failed':q2?(state.mediaPlaybackMode===PLAYBACK_MODE.AUDIO_COMPATIBILITY&&q1Playback?.player?.stats()?.mapping&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0):(q0Playback?.audioProbeStarted&&state.mediaAttempt==='range'&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0),trial,{timeout:30000});
   if(!trial.q2&&!trial.drift)await page.evaluate(()=>q0Playback.setupDone);
   result.before=await page.evaluate(()=>({attempt:state.mediaAttempt,mode:state.mediaPlaybackMode,probeStarted:!!q0Playback?.audioProbeStarted,pin:!!q0PinnedSource,routes:qaRoutes,frames:el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames,stats:q1Playback?.player?.stats?.(),hasSource:el.videoPlayer.hasAttribute('src')}));save();
   result.initialLoading=await page.evaluate(()=>qaLoading);assert.equal(result.initialLoading.poster,true);assert.equal(result.initialLoading.loading,true);result.initialLoading.geometryScope='Routing entry before source assignment; hidden video has zero bounds. Presented geometry checked separately.';
   assert.equal(result.before.mode,trial.q2?'original-video-audio-compatible':'original-range');
   await page.evaluate(async()=>{await el.videoPlayer.play();setPlayerChromeVisible(false);el.mediaStage.focus();});
   const snap=()=>page.evaluate(()=>({paused:el.videoPlayer.paused,hidden:el.playerModal.classList.contains('controls-idle'),cursor:getComputedStyle(el.mediaStage).cursor,time:playerTimeline().currentTime,duration:playerTimeline().duration,frames:el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames,poster:el.videoPlayer.hasAttribute('poster'),loading:!el.mediaLoading.hidden}));
   await page.waitForFunction(()=>!el.videoPlayer.hasAttribute('poster')&&el.mediaLoading.hidden,null,{timeout:12000});result.presentation=await snap();result.presentation.rect=await page.locator('#videoPlayer').boundingBox();assert.ok(result.presentation.rect.width>160);assert.equal(result.presentation.poster,false);assert.equal(result.presentation.loading,false);assert.notEqual(result.presentation.cursor,'none');
   const entry=await page.locator('#playerControlsEntry').boundingBox();assert.ok(entry.width>=44&&entry.height>=44);result.entry=entry;
   if(trial.mobile)await page.touchscreen.tap(entry.x+entry.width/2,entry.y+entry.height/2);else await page.mouse.click(entry.x+entry.width/2,entry.y+entry.height/2);
   await page.waitForTimeout(100);result.reveal=await snap();assert.equal(result.reveal.paused,false);assert.equal(result.reveal.hidden,false);
   const stage=await page.locator('#mediaStage').boundingBox();const x=stage.x+stage.width/2,y=stage.y+stage.height/2;
   if(trial.mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
   await page.waitForTimeout(380);result.dismiss=await snap();assert.equal(result.dismiss.hidden,true);assert.equal(result.dismiss.paused,false);
   await page.waitForTimeout(360);
   if(trial.mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
   await page.waitForTimeout(380);result.independentPause=await snap();assert.equal(result.independentPause.paused,true);assert.equal(result.independentPause.hidden,true);
   await page.keyboard.press('Space');await page.waitForTimeout(150);result.keyboardResume=await snap();assert.equal(result.keyboardResume.paused,false);assert.equal(result.keyboardResume.hidden,true);
   await page.keyboard.press('Tab');result.keyboardReveal=await page.evaluate(()=>({owned:playerChrome.contains(document.activeElement),inert:playerChrome.inert,hidden:el.playerModal.classList.contains('controls-idle')}));assert.equal(result.keyboardReveal.owned,true);assert.equal(result.keyboardReveal.inert,false);assert.equal(result.keyboardReveal.hidden,false);
   const track=page.locator(trial.mobile?'#mobileShortsProgressTrack':'#seekBarContainer');
   result.seeks=[];
   for(const ratio of [.5,.9]){await page.evaluate(r=>{setPlayerChromeVisible(true);window.qaSeekFrame=null;const target=playerTimeline().duration*r;function frame(_now,m){const sourceTime=m.mediaTime+(q1Playback?.player?.stats()?.mapping?.commonShift||0);if(Math.abs(sourceTime-target)<.25)window.qaSeekFrame={mediaTime:m.mediaTime,sourceTime,target,sourceGeneration:mediaSourceGeneration,seekGeneration:mediaSeekGeneration};else el.videoPlayer.requestVideoFrameCallback(frame);}el.videoPlayer.requestVideoFrameCallback(frame);},ratio);const box=await track.boundingBox();assert.ok(box?.width>44);if(trial.mobile)await page.touchscreen.tap(box.x+box.width*ratio,box.y+box.height/2);else await page.mouse.click(box.x+box.width*ratio,box.y+box.height/2);await page.waitForFunction(r=>qaSeekFrame&&el.mediaLoading.hidden&&!el.videoPlayer.seeking&&!state.isSeeking&&mediaSeekWatchdog===null&&Math.abs(playerTimeline().currentTime-playerTimeline().duration*r)<1.2,ratio,{timeout:12000}).catch(async e=>{result.seekFailure=await page.evaluate(()=>({time:playerTimeline().currentTime,frame:qaSeekFrame,paused:el.videoPlayer.paused,seeking:el.videoPlayer.seeking,isSeeking:state.isSeeking,watchdog:mediaSeekWatchdog&&{seeked:mediaSeekWatchdog.seekedSeen,frame:mediaSeekWatchdog.frameSeen,target:mediaSeekWatchdog.targetTime},loading:!el.mediaLoading.hidden,readyState:el.videoPlayer.readyState,frames:el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames,presentationSession:el.videoPlayer.dataset.presentationSession,session:state.mediaSession,sourceGeneration:mediaSourceGeneration,isReady:el.videoPlayer.classList.contains('is-ready'),q1:q1Playback?.player?.stats()}));save();throw e;});const seek=await snap();seek.presentedFrame=await page.evaluate(()=>qaSeekFrame);result.seeks.push(seek);await page.evaluate(()=>el.videoPlayer.pause());}
   result.input=await page.evaluate(()=>qaInput);assert.ok(result.input.some(e=>e.trusted&&e.type==='pointerdown'));assert.ok(result.input.some(e=>e.trusted&&e.type==='keydown'));
   await page.screenshot({path:path.join(__dirname,trial.name+'-seek.png')});
   await page.evaluate(()=>{setPlayerChromeVisible(false);showDrivePreview(state.selected,'Synthetic exhausted original path');});
   result.recovery=await page.evaluate(()=>({visible:!el.mediaError.hidden,hiddenChrome:el.playerModal.classList.contains('controls-idle'),focus:document.activeElement.id,attempt:state.mediaAttempt,preview:el.drivePreview.getAttribute('src'),source:el.videoPlayer.hasAttribute('src')}));assert.equal(result.recovery.visible,true);assert.equal(result.recovery.attempt,'failed');assert.equal(result.recovery.source,false);assert.ok(!result.recovery.preview||result.recovery.preview==='about:blank');assert.equal(result.recovery.hiddenChrome,true);
   await page.locator('#closeMediaErrorButton').click();await page.waitForFunction(()=>el.playerSheet.hidden);await page.evaluate(()=>q1Retirement);
   result.errorDismiss=await page.evaluate(()=>({closed:el.playerSheet.hidden,selected:state.selected,source:el.videoPlayer.hasAttribute('src'),cleanup:q1RetirementResult}));assert.equal(result.errorDismiss.source,false);assert.equal(result.errorDismiss.selected,null);assert.equal(result.errorDismiss.cleanup.settled,true);
   await page.evaluate(()=>{el.playerSheet.hidden=false;state.pendingPlay=true;openMediaSource(qaFixtureFile);setPlayerChromeVisible(false);});
   await page.waitForFunction(q2=>q2?state.mediaPlaybackMode===PLAYBACK_MODE.AUDIO_COMPATIBILITY&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0:state.mediaAttempt==='range'&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0,trial.q2,{timeout:30000});
   await page.waitForFunction(()=>!el.videoPlayer.hasAttribute('poster')&&el.mediaLoading.hidden,null,{timeout:12000});result.reopen=await snap();assert.equal(result.reopen.poster,false);assert.equal(result.reopen.loading,false);assert.equal(result.reopen.hidden,true);


   result.after=await page.evaluate(async()=>{state.authAccountKey='other-account';state.driveSessionGeneration++;clearDirectMediaSources();await q1Retirement;return {cleanup:q1RetirementResult,hasSource:el.videoPlayer.hasAttribute('src')};});
   assert.equal(result.after.cleanup.settled,true);assert.equal(result.after.hasSource,false);assert.deepEqual(result.errors,[]);result.passed=true;save();console.log(trial.name,'PASS');
  }catch(error){result.failure={name:error.name,classification:result.pageCrashed?'page-crashed':'assertion-or-harness-failure'};save();throw error;}
  finally{await browser?.close();result.browserClosed=true;save();}
 }
 assert.deepEqual(report.producerStart,hashes(),'producer changed during native run');report.passed=true;save();
 }finally{await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
