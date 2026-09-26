'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const out = path.join(__dirname, 'v2-presentation', baseline ? 'before' : 'after');
fs.mkdirSync(out, { recursive: true });
const allowed = new Set(['index.html','app.js','styles.css','runtime-config.js','manifest.webmanifest']);
const server = http.createServer((req,res) => {
  const name = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (name === 'fixture.mp4') {
    res.writeHead(200, {'Content-Type':'video/mp4'});
    res.end(fs.readFileSync(path.join(__dirname,'faststart-h264-aac.mp4'))); return;
  }
  if (!allowed.has(name)) { res.writeHead(404).end(); return; }
  res.writeHead(200, {'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json'}[path.extname(name)],'Cache-Control':'no-store'});
  res.end(baseline ? execFileSync('git',['show',`8b16fae:${name}`],{cwd:root}) : fs.readFileSync(path.join(root,name)));
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const rows = [];
  try {
    for (const mobile of [false,true]) {
      const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile,serviceWorkers:'block'});
      await context.route('**/*',route => route.request().url().startsWith(base+'/') ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/?demo=1');
      await page.waitForFunction(()=>state.demo && !!playerChrome && !el.libraryView.hidden);
      const failedViewed = await page.evaluate(() => {
        el.playerSheet.hidden=false;
        openMediaSource({id:'failed-open',name:'Invalid video',mimeType:'video/mp4'});
        return Boolean(state.accountMediaState.viewed['failed-open']);
      });
      if (baseline) {
        assert.equal(failedViewed,true,'reproduce viewed write from a failed open in the preceding product commit');
        rows.push({mobileViewport:mobile,failedOpenViewed:failedViewed,source:'8b16fae',physicalDevice:false,realDrive:false});
        await context.close(); continue;
      }
      assert.equal(failedViewed,false,'an actual failed open does not consume unseen priority');
      await page.evaluate(() => {
        Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
        openMediaSource({id:'image-displayed',name:'Displayed image',mimeType:'image/png'});
      });
      await page.waitForFunction(()=>el.imageViewer.complete && el.imageViewer.naturalWidth>0);
      assert.equal(await page.evaluate(()=>Boolean(state.accountMediaState.viewed['image-displayed'])),false);
      await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
      await page.waitForFunction(()=>Boolean(state.accountMediaState.viewed['image-displayed']));
      await page.evaluate(() => {
        openMediaSource({id:'video-displayed',name:'Displayed video',mimeType:'video/mp4'});
        state.mediaAttempt='range';
        el.mediaError.hidden=true;
        el.videoPlayer.hidden=false;
        el.videoPlayer.muted=true;
        el.videoPlayer.dataset.mediaSession=String(state.mediaSession);
        el.videoPlayer.src='/fixture.mp4';
        el.videoPlayer.load();
      });
      await page.waitForFunction(()=>el.videoPlayer.readyState>=2);
      assert.equal(await page.evaluate(()=>Boolean(state.accountMediaState.viewed['video-displayed'])),false,'paused decoded frame is not playback progress');
      await page.evaluate(()=>{
        buildMediaUrl=()=>'/fixture.mp4'; // isolate bytes, retain real retry lifecycle
        if (!retryOriginalStream(state.selected,state.mediaSession,'synthetic retry')) throw new Error('retry rejected');
      });
      await page.waitForFunction(()=>el.videoPlayer.readyState>=2);
      await page.evaluate(()=>el.videoPlayer.play());
      await page.waitForFunction(()=>Boolean(state.accountMediaState.viewed['video-displayed']) && el.videoPlayer.currentTime>0.1);
      const normal = await page.evaluate(() => {
        el.videoPlayer.pause();
        state.demo=false; // UI-only status fixture; no queued sync or Drive request.
        state.accountId='synthetic-account';state.accountStateSyncPromise=null;state.accountStateSyncTimer=null;
        state.accountStateSyncError=false;state.accountLocalStorageError=false;
        updateAccountSyncStatus();
        showMediaLoading('Google 원본 Range 내부 준비 상태');
        return {syncHidden:el.accountSyncStatus.hidden,loadingDetailHidden:el.mediaLoadingText.hidden,viewed:Object.keys(state.accountMediaState.viewed).filter(id=>id==='image-displayed'||id==='video-displayed').length};
      });
      assert.equal(normal.syncHidden,true);assert.equal(normal.loadingDetailHidden,true);assert.equal(normal.viewed,2);
      await page.screenshot({path:path.join(out,`${mobile?'mobile':'desktop'}-quiet.png`)});
      await page.evaluate(()=>{state.accountLocalStorageError=true;updateAccountSyncStatus();});
      assert.equal(await page.locator('#accountSyncStatus').isVisible(),true);
      assert.match(await page.locator('#accountSyncStatus').textContent(),/저장하지 못/);
      assert.deepEqual(errors,[]);
      rows.push({mobileViewport:mobile,failedOpenViewed:failedViewed,imageDisplayedViewed:true,videoProgressViewed:true,normal,physicalDevice:false,realDrive:false});
      await context.close();
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({observedAt:new Date().toISOString(),rows},null,2));
    console.log(JSON.stringify({passed:rows.length,rows}));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
