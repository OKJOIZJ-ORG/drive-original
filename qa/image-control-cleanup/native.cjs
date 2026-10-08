'use strict';
// Actual local UI; demo images + source-acquisition-only local native MP4 fixture.
const fs=require('node:fs'), path=require('node:path'), http=require('node:http'), crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const mode=process.argv.includes('--retirement-only')?'retirement':process.argv.includes('--baseline')?'baseline':'candidate';
const out=path.resolve(root,`../maintenance/tools/image-control-cleanup/${mode}`);
fs.mkdirSync(out,{recursive:true});
const hashes=Object.fromEntries(['app.js','styles.css','index.html'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex')]));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{
  const n=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html', f=path.resolve(root,n);
  if(!f.startsWith(root+path.sep)||/^(memory|worker|node_modules)\//.test(n)||(n.startsWith('qa/')&&n!=='qa/seek-range-h264-aac.mp4')||!types[path.extname(n)]||!fs.existsSync(f))return res.writeHead(404).end();
  const bytes=fs.readFileSync(f),range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  if(range&&n.endsWith('.mp4')){const a=+range[1],b=Math.min(bytes.length-1,range[2]?+range[2]:bytes.length-1);if(a>b||a>=bytes.length)return res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`}).end();res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${a}-${b}/${bytes.length}`});return res.end(bytes.subarray(a,b+1));}
  res.writeHead(200,{'Content-Type':types[path.extname(n)],'Cache-Control':'no-store'});res.end(bytes);
});
const videoIds=['stageCenterPlayBtn','ctrlPlayPause','seekBarContainer','mobileShortsProgressTrack','ctrlCurrentTime','ctrlTotalTime','mobileCurrentTime','mobileTotalTime','ctrlRandomShorts','ctrlRewind','ctrlForward','ctrlMute','ctrlVolumeSlider','ctrlSpeedButton','ctrlPip','pipButton','shortsPipBtn','ctrlFramePrev','ctrlFrameNext','shortsFramePrev','shortsFrameNext','ctrlTracks','shortsTracksBtn','shortsRotateBtn','playerFeedback'];
const rows=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{for(const [width,height,mobile] of (mode==='retirement'?[[390,844,true]]:[[390,844,true],[320,568,true],[844,390,true],[1440,900,false]])){
    const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
    await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const cdp=await context.newCDPSession(page);
    await page.goto(`${base}/?demo=1`);await page.waitForFunction(()=>typeof state!=='undefined'&&state.demo&&!el.libraryView.hidden);
    await page.evaluate(()=>{state.currentFolderId='root';state.filter='all';state.query='';startDemoMode();});
    if(mode==='retirement'){
      await page.evaluate(()=>{openPlayer(state.files.find(f=>f.id==='demo-video-1'));el.mediaError.hidden=true;el.mediaLoading.hidden=true;state.mediaAttempt='range';state.pendingPlay=false;el.videoPlayer.hidden=false;el.imageViewer.hidden=true;el.videoPlayer.dataset.mediaSession=String(state.mediaSession);el.videoPlayer.src='/qa/seek-range-h264-aac.mp4';el.videoPlayer.muted=true;el.videoPlayer.loop=true;});
      await page.waitForFunction(()=>el.videoPlayer.readyState>=2);
      await page.evaluate(async()=>{await el.videoPlayer.play();setPlayerChromeVisible(true);showPlayerFeedback('2×',{persistent:true});isSpeedMenuOpen=true;el.speedDropdown.hidden=false;el.ctrlSpeedButton.setAttribute('aria-expanded','true');});
      const read=()=>page.evaluate(()=>({feedbackHidden:el.playerFeedback.hidden,feedbackActive:el.playerFeedback.classList.contains('active'),speedOpen:isSpeedMenuOpen,dropdownHidden:el.speedDropdown.hidden,expanded:el.ctrlSpeedButton.getAttribute('aria-expanded')}));
      const primed=await read();assert.equal(primed.feedbackHidden,false);assert.equal(primed.speedOpen,true);assert.equal(primed.dropdownHidden,false);
      await page.waitForTimeout(1350);const sustained=await read();assert.equal(sustained.feedbackHidden,false,'persistent feedback survives normal1.2s expiry');
      const immediate=await page.evaluate(()=>{openMediaSource(state.files.find(f=>f.id==='demo-image-1'));return{feedbackHidden:el.playerFeedback.hidden,feedbackActive:el.playerFeedback.classList.contains('active'),speedOpen:isSpeedMenuOpen,dropdownHidden:el.speedDropdown.hidden,expanded:el.ctrlSpeedButton.getAttribute('aria-expanded')};});
      assert.equal(immediate.feedbackHidden,true);assert.equal(immediate.feedbackActive,false);assert.equal(immediate.speedOpen,false);assert.equal(immediate.dropdownHidden,true);assert.equal(immediate.expanded,'false');
      await page.waitForFunction(()=>el.imageViewer.complete&&el.imageViewer.naturalWidth>0&&!el.imageViewer.hidden);const loaded=await read();assert.deepEqual(loaded,immediate);assert.deepEqual(errors,[]);
      rows.push({viewport:{width,height,mobile},name:'persistent-feedback-speed-menu-retirement',primed,sustained,immediate,loaded});await context.close();continue;
    }
    const capture=async name=>{
      await page.waitForTimeout(220);
      const visual=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const n=document.getElementById(id);if(!n)return[id,{missing:true}];const r=n.getBoundingClientRect();let painted=r.width>0&&r.height>0;for(let p=n;p;p=p.parentElement){const s=getComputedStyle(p);painted&&=s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0;}return[id,{painted,hidden:n.hidden,display:getComputedStyle(n).display,tabIndex:n.tabIndex}];})),videoIds);
      const ax=(await cdp.send('Accessibility.getFullAXTree')).nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value,backendDOMNodeId:n.backendDOMNodeId}));
      const tabs=[];await page.locator('#mediaStage').focus();for(let i=0;i<18;i++){await page.keyboard.press('Tab');tabs.push(await page.evaluate(()=>document.activeElement.id||document.activeElement.getAttribute('aria-label')||document.activeElement.tagName));}
      await page.evaluate(()=>setPlayerChromeVisible(true));
      await page.screenshot({path:path.join(out,`${width}x${height}-${name}.png`)});
      const result={name,visual,ax,tabs};rows.push({viewport:{width,height,mobile},...result});
      if(mode==='candidate'){
        for(const id of videoIds){assert.equal(Boolean(visual[id]?.painted),false,`${width} ${name}: ${id} painted`);assert(!tabs.includes(id),`${width} ${name}: ${id} tabbable`);}
        assert(!ax.some(n=>/^(재생 시간|재생 위치|재생 구간 탐색|재생 속도|음량 조절|음성·자막|영상 90도 회전|1프레임|화면 속 화면)/.test(n.name||'')),`${width} ${name}: video controls in AX`);
        assert(await page.locator('#closePlayerButton').isVisible());
        if(mobile){assert(await page.locator('#shortsFavoriteBtn').isVisible());assert(await page.locator('#shortsFullscreenBtn').isVisible());if(name.endsWith('-menu'))for(const id of ['shortsDeleteBtn','shortsMoveBtn','shortsDriveBtn'])assert(await page.locator('#'+id).isVisible(),`${id} preserved`);}
        else for(const id of ['topbarPrevBtn','topbarNextBtn','topbarRandomBtn','topbarFavoriteBtn'])assert(await page.locator('#'+id).isVisible(),`${id} preserved`);
      }
      return result;
    };
    await page.locator('[data-file-id="demo-image-1"] .file-card-open').click();
    await page.waitForFunction(()=>!el.playerSheet.hidden&&el.imageViewer.complete&&el.imageViewer.naturalWidth>0);
    await page.evaluate(()=>setPlayerChromeVisible(true));await capture('direct-photo');
    if(mobile){await page.locator('#shortsMoreBtn').click();await capture('direct-photo-menu');}
    if(mode==='candidate'){
      // Substitute only source acquisition. Keep ordinary openPlayer/openMediaSource/reset/UI lifecycle.
      await page.evaluate(()=>{
        const original=openMediaSource;
        openMediaSource=file=>{original(file);if(file.mimeType.startsWith('video/')){
          el.mediaError.hidden=true;el.mediaLoading.hidden=true;state.mediaAttempt='range';state.pendingPlay=false;
          el.videoPlayer.hidden=false;el.imageViewer.hidden=true;el.videoPlayer.dataset.mediaSession=String(state.mediaSession);
          el.videoPlayer.src='/qa/seek-range-h264-aac.mp4';el.videoPlayer.muted=true;el.videoPlayer.loop=true;el.videoPlayer.classList.add('is-ready');
        }};
        window.qaVideo=state.files.find(f=>f.id==='demo-video-1');window.qaPhoto=state.files.find(f=>f.id==='demo-image-1');openMediaSource(qaVideo);
      });
      await page.waitForFunction(()=>el.videoPlayer.readyState>=2);await page.evaluate(async()=>{await el.videoPlayer.play();setPlaybackSpeed(1.25);});
      await page.waitForTimeout(160);const before=await page.evaluate(()=>el.videoPlayer.currentTime);await page.waitForTimeout(180);assert((await page.evaluate(()=>el.videoPlayer.currentTime))>before,'native video progresses');
      const retired=await page.evaluate(()=>{showPlayerFeedback('2×',{persistent:true});isSpeedMenuOpen=true;el.speedDropdown.hidden=false;el.ctrlSpeedButton.setAttribute('aria-expanded','true');openMediaSource(qaPhoto);return{feedbackHidden:el.playerFeedback.hidden,speedOpen:isSpeedMenuOpen};});assert.equal(retired.feedbackHidden,true);assert.equal(retired.speedOpen,false);await page.waitForFunction(()=>el.imageViewer.complete&&el.imageViewer.naturalWidth>0&&!el.imageViewer.hidden);
      assert.equal(await page.locator('#speedDropdown').getAttribute('hidden')!==null,true,'old speed menu closed');
      await page.evaluate(()=>setPlayerChromeVisible(true));await capture('video-to-photo');
      if(mobile){await page.locator('#shortsMoreBtn').click();await capture('video-to-photo-menu');}
      await page.evaluate(()=>openMediaSource(qaVideo));await page.waitForFunction(()=>el.videoPlayer.readyState>=2);
      await page.evaluate(async()=>{await el.videoPlayer.play();setPlaybackSpeed(1.25);setPlayerChromeVisible(true);});
      await page.waitForTimeout(220);
      const restored={nativeVisible:await page.locator('#videoPlayer').isVisible(),rate:await page.evaluate(()=>el.videoPlayer.playbackRate)};assert(restored.nativeVisible,'native video restored');
      if(mobile){
        assert(await page.locator('#mobileShortsProgressTrack').isVisible(),'video progress restored');
        assert(await page.locator('#mobileTimeDisplay').isVisible(),'video elapsed/duration restored');
        await page.evaluate(()=>setPlayerChromeVisible(false));const r=await page.locator('#mediaStage').boundingBox();
        const touch=async x=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*x,y:r.y+r.height*.5,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
        await touch(.5);await page.waitForFunction(()=>el.videoPlayer.paused);await page.waitForTimeout(320);await touch(.5);await page.waitForFunction(()=>!el.videoPlayer.paused);restored.centerTapPausePlay=true;
        await page.evaluate(()=>setPlayerChromeVisible(false));await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.88,y:r.y+r.height*.5,id:1}]});await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>el.videoPlayer.playbackRate),2);await page.screenshot({path:path.join(out,`${width}x${height}-video-recovered-held.png`)});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.evaluate(()=>el.videoPlayer.playbackRate),1.25);restored.hold2x=true;
      }else{assert(await page.locator('#ctrlPlayPause').isVisible());await page.locator('#ctrlPlayPause').click();assert(await page.evaluate(()=>el.videoPlayer.paused));await page.locator('#ctrlPlayPause').click();await page.waitForFunction(()=>!el.videoPlayer.paused);restored.playPause=true;}
      rows.push({viewport:{width,height,mobile},name:'recovered-native-video',restored});
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({completed:true,mode,hashes,proof:'Local isolated Chrome; mobile emulation; ordinary demo image UI; local native MP4 acquisition substitution. No account, physical device, production, or all-format acceptance.',rows},null,2));console.log(JSON.stringify({completed:true,mode,out}));
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({mode,hashes,rows,error:e.stack},null,2));console.error(e);process.exitCode=1;});
