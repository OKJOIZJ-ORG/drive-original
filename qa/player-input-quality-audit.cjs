'use strict';
// Real isolated DOM/input evidence with synthetic playback counters, never Drive.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const phase = process.argv[2] === 'before' ? 'before' : 'after';
const output = path.join(__dirname, 'player-input-quality', phase);
fs.mkdirSync(output, { recursive: true });
const sourceRef = phase === 'before' ? '3fa5914' : null;
const readSource = name => sourceRef
  ? execFileSync('git',['show',`${sourceRef}:${name}`],{cwd:root,maxBuffer:8*1024*1024})
  : fs.readFileSync(path.join(root,name));
const hashes = Object.fromEntries(['app.js', 'styles.css', 'index.html'].map(name =>
  [name, crypto.createHash('sha256').update(readSource(name)).digest('hex')]));
const producerSHA256=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  const target = path.resolve(root, name);
  if (!target.startsWith(root + path.sep) || /(?:qa|memory|worker|node_modules)\//.test(name)
    || !types[path.extname(target)] || !fs.existsSync(target)) return res.writeHead(404).end();
  res.writeHead(200, {'Content-Type':types[path.extname(target)], 'Cache-Control':'no-store'});
  try{res.end(readSource(name));}catch{res.end();}
});
async function reset(page, chrome = false) {
  await page.evaluate(visible => {
    clearTimeout(singleTapTimer); singleTapTimer = null; lastTapTime = 0;
    playerChromePointer = false; playerInputModality = 'pointer';
    el.mediaStage.focus(); setPlayerChromeVisible(visible);
    window.fixture.play = 0; window.fixture.pause = 0; window.fixture.paused = false;
    updatePlayPauseUI();
  }, chrome);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  const rows = [];
  try {
    for (const [width,height,mobile] of [[1280,800,false],[390,844,true],[844,390,true],[320,568,true]]) {
      const context = await browser.newContext({viewport:{width,height}, isMobile:mobile, hasTouch:mobile, serviceWorkers:'block'});
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/?demo=1`);
      await page.waitForFunction(() => typeof playerChrome !== 'undefined' && playerChrome);
      await page.evaluate(() => {
        el.playerSheet.hidden = false; el.mediaError.hidden = true; el.mediaLoading.hidden = true;
        state.selected = { id:'public-synthetic-video', name:'City study — original video', mimeType:'video/mp4' };
        el.videoPlayer.hidden = false;
        const canvas = document.createElement('canvas'); canvas.width=160;canvas.height=90;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#1f4054';ctx.fillRect(0,0,160,90);
        ctx.fillStyle='#547d85';ctx.fillRect(20,18,45,72);ctx.fillStyle='#d5bd82';ctx.fillRect(80,30,60,60);
        el.videoPlayer.poster=canvas.toDataURL();el.videoPlayer.classList.add('has-poster');
        window.fixture={paused:false,play:0,pause:0,events:[]};
        Object.defineProperty(el.videoPlayer,'paused',{configurable:true,get:()=>fixture.paused});
        el.videoPlayer.play=()=>{fixture.play++;fixture.paused=false;return Promise.resolve();};
        el.videoPlayer.pause=()=>{fixture.pause++;fixture.paused=true;};
        el.playerTitle.textContent=state.selected.name;el.mobileShortsTitle.textContent=state.selected.name;
        setNativeVideoActionsAvailable(true);updatePlayPauseUI();setPlayerChromeVisible(false);el.mediaStage.focus();
        for(const type of ['pointerdown','pointerup','click','focusin']) document.addEventListener(type,event=>{
          if(el.playerModal.contains(event.target))fixture.events.push({type,target:event.target.id||event.target.tagName});
        },true);
      });
      const entryBefore = await page.locator('#playerControlsEntry').boundingBox();
      const hit = await page.evaluate(r=>document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id,entryBefore);
      await page.mouse.click(entryBefore.x+entryBefore.width/2,entryBefore.y+entryBefore.height/2);
      await page.waitForTimeout(380);
      const initial = await page.evaluate(()=>({play:fixture.play,pause:fixture.pause,hidden:el.playerModal.classList.contains('controls-idle'),events:fixture.events,video:el.videoPlayer.getBoundingClientRect().toJSON(),cursor:getComputedStyle(el.mediaStage).cursor}));
      await page.locator('#playerControlsEntry').focus();
      const entryFocused = await page.locator('#playerControlsEntry').boundingBox();
      const row={width,height,mobile,entryBefore,entryFocused,hit,initial};
      if (phase === 'before') {
        if(!mobile){assert.equal(entryBefore.width,1);assert.notEqual(hit,'playerControlsEntry');assert.equal(initial.pause,1);assert.equal(initial.hidden,true);assert.equal(initial.cursor,'none');assert.ok(initial.video.width<=160);}
        await reset(page,true);
        if(mobile)await page.touchscreen.tap(width/2,height/2);else await page.mouse.click(width/2,height/2);
        await page.waitForTimeout(380);
        row.outsideBefore=await page.evaluate(()=>({pause:fixture.pause,hidden:el.playerModal.classList.contains('controls-idle')}));
      } else {
        assert.ok(entryBefore.width>=44&&entryBefore.height>=44);
        assert.deepEqual(entryBefore,entryFocused,'focus does not move the native entry');
        assert.equal(initial.pause,0);assert.equal(initial.play,0);assert.equal(initial.hidden,false);
        assert.equal(initial.video.width,width);assert.equal(initial.video.height,height);
        assert.notEqual(initial.cursor,'none');
        await reset(page);
        if(mobile)await page.touchscreen.tap(width/2,height-30);else await page.mouse.move(width/2,height-30);
        await page.waitForTimeout(30);
        assert.equal(await page.evaluate(()=>el.playerModal.classList.contains('controls-idle')),false);
        assert.equal(await page.evaluate(()=>fixture.pause+fixture.play),0);
        await page.screenshot({path:path.join(output,`${width}x${height}-controls.png`)});
        await page.mouse.move(width/2,height/2);
        if(mobile)await page.touchscreen.tap(width/2,height/2);else await page.mouse.click(width/2,height/2);
        await page.waitForTimeout(380);
        assert.equal(await page.evaluate(()=>fixture.pause+fixture.play),0,'outside dismiss preserves playback');
        assert.equal(await page.evaluate(()=>el.playerModal.classList.contains('controls-idle')),true);
        await page.waitForTimeout(360);
        if(mobile)await page.touchscreen.tap(width/2,height/2);else await page.mouse.click(width/2,height/2);
        await page.waitForTimeout(380);
        assert.equal(await page.evaluate(()=>fixture.pause),1,'hidden center pauses once');
        assert.equal(await page.evaluate(()=>el.playerModal.classList.contains('controls-idle')),true);
        await reset(page);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(()=>playerChrome.contains(document.activeElement)&&!playerChrome.inert),true);
        if(width>600){
          await page.locator('#ctrlPlayPause').focus();await page.keyboard.press('Space');
          assert.equal(await page.evaluate(()=>fixture.pause),1,'native button Space runs once');
        }else{
          await page.locator('#shortsRotateBtn').focus();await page.keyboard.press('Space');
          assert.equal(await page.evaluate(()=>state.videoRotated),true,'native rotate button Space runs once');
          assert.equal(await page.evaluate(()=>fixture.pause+fixture.play),0);
          await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>state.videoRotated),false);
        }
        await reset(page);
        await page.mouse.move(width/2,height-20);
        if(width>600){
          await page.locator('#ctrlPlayPause').click();await page.keyboard.press('Space');
          assert.equal(await page.evaluate(()=>fixture.pause),1);assert.equal(await page.evaluate(()=>fixture.play),1);
        }else{
          await page.locator('#shortsRotateBtn').click();await page.keyboard.press('Space');
          assert.equal(await page.evaluate(()=>state.videoRotated),true,'pointer focus hands Space to playback');
          assert.equal(await page.evaluate(()=>fixture.pause),1);
          await page.evaluate(()=>resetVideoRotation());
        }
        await reset(page);
        await page.mouse.move(width/2,height-20);await page.mouse.down();await page.mouse.move(width/2,height/2);await page.mouse.up();
        await page.waitForTimeout(380);
        assert.equal(await page.evaluate(()=>fixture.pause+fixture.play),0,'reveal-start release outside never toggles playback');
        if(mobile){
          const cdp=await context.newCDPSession(page);
          const touch=(x,y,id=1)=>({x,y,id});
          for(const cancel of [false,true]){
            await reset(page);
            await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(width/2,height-22)]});
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(width/2,height/2)]});
            await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
            await page.waitForTimeout(380);
            assert.equal(await page.evaluate(()=>fixture.pause+fixture.play),0,'touch reveal owner survives release/cancel outside');
          }
          await reset(page);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(width/2,height-22)]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(width/2,height-22),touch(width/2+40,height/2,2)]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
          await page.waitForTimeout(380);
          assert.equal(await page.evaluate(()=>fixture.pause+fixture.play),0,'second touch cannot claim playback');
          await cdp.detach();
        }
        await reset(page);
        await page.screenshot({path:path.join(output,`${width}x${height}-poster.png`)});
        await page.evaluate(()=>toggleVideoRotation());
        const rotated=await page.locator('#videoPlayer').boundingBox();
        assert.ok(Math.abs(rotated.width-width)<1&&Math.abs(rotated.height-height)<1,`rotated contain stage remains in view: ${width}x${height} ${JSON.stringify(rotated)}`);
        await page.screenshot({path:path.join(output,`${width}x${height}-rotated.png`)});
        await page.evaluate(()=>resetVideoRotation());
        await page.evaluate(()=>showMediaLoading('private diagnostic loading detail'));
        await page.screenshot({path:path.join(output,`${width}x${height}-loading.png`)});
        assert.equal(await page.locator('#mediaLoadingText').isVisible(),false);
        assert.equal(await page.evaluate(()=>el.playerModal.classList.contains('controls-idle')),true);
        await page.evaluate(()=>{el.mediaLoading.hidden=true;showMediaError('다시 시도하거나 닫을 수 있습니다.',{title:'이 파일을 불러오지 못했습니다'});});
        await page.screenshot({path:path.join(output,`${width}x${height}-error.png`)});
        const errorBounds=await page.locator('#mediaError').boundingBox();
        assert.ok(errorBounds.x>=0&&errorBounds.y>=0&&errorBounds.x+errorBounds.width<=width+1&&errorBounds.y+errorBounds.height<=height+1);
        await page.evaluate(()=>{el.mediaError.hidden=true;el.playerModal.classList.remove('media-recovery-mode');});
        await page.locator('#playerControlsEntry').focus();await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(()=>playerChrome.contains(document.activeElement)),true,'explicit assistive entry transfers focus to visible controls');
        await reset(page);
        await page.evaluate(()=>el.mediaStage.requestFullscreen());
        assert.equal(await page.evaluate(()=>document.fullscreenElement===el.mediaStage),true);
        const fullscreenEntry=await page.locator('#playerControlsEntry').boundingBox();
        assert.ok(fullscreenEntry.height>=44);
        await page.evaluate(()=>document.exitFullscreen());
        await page.setViewportSize({width:width+20,height:height+30});
        const resized=await page.locator('#videoPlayer').boundingBox();
        assert.ok(Math.abs(resized.width-width-20)<1&&Math.abs(resized.height-height-30)<1);
        await page.setViewportSize({width,height});
        await page.evaluate(()=>el.playerModal.style.setProperty('--safe-bottom','24px'));
        const insetEntry=await page.locator('#playerControlsEntry').boundingBox();
        assert.equal(insetEntry.height,68,'44px usable target remains above simulated safe bottom');
        await page.evaluate(()=>el.playerModal.style.removeProperty('--safe-bottom'));
        await page.emulateMedia({reducedMotion:'reduce'});
        assert.ok(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.loading-spinner')).animationDuration)<0.05));
        const safeButtons=await page.evaluate(()=>{setPlayerChromeVisible(true);return [...playerChrome.querySelectorAll('button')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]')).map(n=>({id:n.id,...n.getBoundingClientRect().toJSON()}));});
        assert.ok(safeButtons.every(r=>r.left>=-1&&r.right<=width+1&&r.bottom<=height+1));
        await reset(page);
        const lifecycle=await page.evaluate(()=>{
          el.videoPlayer.dataset.mediaSession=String(state.mediaSession);
          const poster=el.videoPlayer.poster;const callbacks=[];
          el.videoPlayer.requestVideoFrameCallback=callback=>{callbacks.push(callback);return callbacks.length;};
          el.videoPlayer.cancelVideoFrameCallback=()=>{};
          showMediaLoading('diagnostic only');onMediaReady();
          callbacks[0](performance.now(),{mediaTime:0});
          const handoff=!el.videoPlayer.hasAttribute('poster')&&el.videoPlayer.classList.contains('is-ready')&&el.mediaLoading.hidden;
          for(const type of ['pause','play','loadedmetadata','canplay','seeked'])el.videoPlayer.dispatchEvent(new Event(type));
          return{handoff,hidden:el.playerModal.classList.contains('controls-idle'),posterWasPresent:Boolean(poster)};
        });
        assert.equal(lifecycle.handoff,true,'synthetic decoded presentation preserves existing poster handoff');
        assert.equal(lifecycle.hidden,true,'normal playback lifecycle never reveals chrome');
        assert.equal(lifecycle.posterWasPresent,true);
        row.lifecycleEvidence='synthetic DOM events and decoded callback; not real media playback';
        row.inputAssertions='passed';
      }
      row.library = await page.evaluate(async()=>{
        el.playerSheet.hidden=true;state.demo=false;state.deepScan=false;state.populationComplete=false;
        state.listRequestPromise=null;state.populationLoadPromise=null;state.nextPageToken='final-page';
        const load=loadFiles;const token=beginLibraryStatus('collecting');
        loadFiles=async()=>{state.nextPageToken='';state.files=[{id:'one'}];return true;};
        try{await ensureAllPagesLoaded({statusToken:token});return{complete:state.populationComplete,status:el.libraryStatus.textContent};}
        finally{loadFiles=load;}
      });
      if(phase==='after')assert.equal(row.library.status,'');else assert.match(row.library.status,/수집 중/);
      if(phase==='after'){
        const protectedStatus=await page.evaluate(async()=>{
          state.populationComplete=false;state.nextPageToken='new-final-page';
          const load=loadFiles;const token=beginLibraryStatus('old collecting');
          loadFiles=async()=>{state.nextPageToken='';beginLibraryStatus('new owner status');return true;};
          try{await ensureAllPagesLoaded({statusToken:token});return el.libraryStatus.textContent;}finally{loadFiles=load;}
        });
        assert.equal(protectedStatus,'new owner status','completion cannot erase a newer status owner');
      }
      assert.deepEqual(errors,[]);rows.push(row);await context.close();
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({phase,sourceRef,producerSHA256,hashes,physicalDevice:false,playbackEvidence:'synthetic method counters; actual trusted browser input and DOM layout',rows},null,2));
    console.log(JSON.stringify({phase,passed:rows.length,hashes}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
