'use strict';
// Actual local app + native MP4 + Chrome trusted touch input; no account/Drive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json', '.mp4':'video/mp4' };
const hashes = Object.fromEntries(['app.js','styles.css','index.html'].map(name => [name,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
const server = http.createServer((req,res) => {
  const name = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  const file = path.resolve(root,name);
  if (!file.startsWith(root+path.sep) || /(?:memory|worker|node_modules)\//.test(name)
    || (name.startsWith('qa/') && name !== 'qa/seek-range-h264-aac.mp4')
    || !types[path.extname(name)] || !fs.existsSync(file)) return res.writeHead(404).end();
  const bytes = fs.readFileSync(file), match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  if (name.endsWith('.mp4') && match) {
    const start = Number(match[1]), end = Math.min(bytes.length-1,match[2] ? Number(match[2]) : bytes.length-1);
    if (start > end || start >= bytes.length) return res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`}).end();
    res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${bytes.length}`});
    return res.end(bytes.subarray(start,end+1));
  }
  res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store'});res.end(bytes);
});
const rows = [];
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    await context.route('**/*',route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage(), errors=[];
    page.on('pageerror',error => errors.push(error.message));
    await page.goto(`${base}/?demo=1`);await page.waitForFunction(() => Boolean(playerChrome));
    const cdp = await context.newCDPSession(page);
    const prepare = async () => {
      await page.evaluate(() => {
        cancelActiveTouchGesture();
        el.playerSheet.hidden=false;el.mediaError.hidden=true;el.mediaLoading.hidden=true;
        state.selected={id:'local-hold-video',name:'로컬 영상.mp4',mimeType:'video/mp4'};state.mediaAttempt='range';
        state.pendingPlay=false;state.isSeeking=false;
        el.videoPlayer.dataset.mediaSession=String(state.mediaSession);el.videoPlayer.hidden=false;
        el.imageViewer.hidden=true;el.videoPlayer.muted=true;el.videoPlayer.loop=true;
        if(!el.videoPlayer.getAttribute('src'))el.videoPlayer.src='/qa/seek-range-h264-aac.mp4';
        el.videoPlayer.classList.add('is-ready');setNativeVideoActionsAvailable(true);
        setPlayerChromeVisible(false);playerInputModality='pointer';
        window.holdQA ||= {trusted:[],taps:0,seeks:0,reveals:0};
        if(!holdQA.observing){holdQA.observing=true;
          for(const type of ['touchstart','touchend','touchcancel','pointercancel'])
            el.playerModal.addEventListener(type,event=>holdQA.trusted.push({type,trusted:event.isTrusted}),true);
          const tap=handleStageTap;handleStageTap=(...args)=>{holdQA.taps++;return tap(...args);};
          const seek=seekRelative;seekRelative=(...args)=>{holdQA.seeks++;return seek(...args);};
          const reveal=revealPlayerChrome;revealPlayerChrome=(...args)=>{holdQA.reveals++;return reveal(...args);};
          for(const type of ['pause','ended'])el.videoPlayer.addEventListener(type,event=>holdQA.trusted.push({type,trusted:event.isTrusted}));
        }
      });
      await page.waitForFunction(() => el.videoPlayer.readyState >= 2);
      await page.evaluate(async () => {await el.videoPlayer.play();setPlaybackSpeed(1.25);setPlayerChromeVisible(false);});
    };
    const read = () => page.evaluate(() => ({rate:el.videoPlayer.playbackRate,paused:el.videoPlayer.paused,
      owner:Boolean(mobileHoldSpeed),held:Boolean(mobileHoldSpeed?.active),snapshot:capturePlaybackSnapshot()?.playbackRate,
      feedback:{text:el.playerFeedback.textContent,hidden:el.playerFeedback.hidden,active:el.playerFeedback.classList.contains('active')},
      hiddenChrome:el.playerModal.classList.contains('controls-idle'),taps:holdQA.taps,seeks:holdQA.seeks,reveals:holdQA.reveals,
      touchActive:isTouchActive,reservedEdge:Boolean(reservedEdgeTap),axis:lockedAxis}));
    const point = async (nx,ny) => {const rect=await page.locator('#mediaStage').boundingBox();return {x:rect.x+rect.width*nx,y:rect.y+rect.height*ny,id:1};};
    const start = p => cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    const end = () => cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const move = p => cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p]});
    for(const [name,nx,ny] of [['left',.12,.5],['right',.88,.5],['top-left',.12,.08],['bottom-right',.88,.92],['reserved-left',.01,.5]]) {
      await prepare();const before=await read(),p=await point(nx,ny);await start(p);
      await page.waitForTimeout(600);const held=await read();assert.equal(held.rate,2,name);assert.equal(held.snapshot,1.25,name);
      assert.equal(held.feedback.hidden,false,name);assert.equal(held.feedback.active,true,name);
      await page.waitForTimeout(950);const sustained=await read();assert.equal(sustained.feedback.hidden,false,name);
      if(name==='right')await page.screenshot({path:path.join(__dirname,'held-2x.png')});
      await end();await page.waitForTimeout(50);const released=await read();assert.equal(released.rate,1.25,name);
      assert.equal(released.taps,before.taps,name);assert.equal(released.hiddenChrome,before.hiddenChrome,name);
      assert.equal(released.feedback.hidden,true,name);rows.push({name,before,held,sustained,released});
    }
    for(const name of ['move-before','move-held','cancel','multitouch','source-change','close','blur']) {
      await prepare();const p=await point(.88,.5);await start(p);
      if(name==='move-before')await move({...p,y:p.y-20});
      await page.waitForTimeout(570);const held=await read();assert.equal(held.rate,name==='move-before'?1.25:2,name);
      if(name==='move-held')await move({...p,y:p.y-20});
      else if(name==='cancel')await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      else if(name==='multitouch')await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p,{...p,x:p.x-60,id:2}]});
      else if(name==='source-change')await page.evaluate(() => {clearDirectMediaSources();state.mediaSession++;state.selected={id:'replacement'};el.videoPlayer.playbackRate=1.5;});
      else if(name==='close')await page.evaluate(() => closePlayer());
      else if(name==='blur')await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      const canceled=await read();assert.equal(canceled.owner,false,name);
      if(['move-before','move-held','cancel','multitouch','blur'].includes(name))assert.equal(canceled.rate,1.25,name);
      if(name !== 'cancel')await end();await page.waitForTimeout(50);const released=await read();
      if(name==='source-change')assert.equal(released.rate,1.5,'old release must not restore old rate to replacement');
      rows.push({name,held,canceled,released});
    }
    for(const name of ['pause-held','end-held','speed-command-held','transition-held','reserved-pause-held']) {
      await prepare();const p=await point(name==='reserved-pause-held'?.01:.88,.5);await start(p);
      await page.waitForTimeout(570);const held=await read();assert.equal(held.rate,2,name);
      if(name==='end-held') {
        await page.evaluate(()=>{el.videoPlayer.loop=false;el.videoPlayer.currentTime=el.videoPlayer.duration-.2;});
        await page.waitForFunction(()=>el.videoPlayer.ended);
      } else if(name==='speed-command-held')await page.evaluate(()=>setPlaybackSpeed(1.75));
      else if(name==='transition-held')await page.evaluate(()=>animateMediaTransition('left',()=>{}));
      else await page.evaluate(()=>el.videoPlayer.pause());
      await page.waitForFunction(()=>!mobileHoldSpeed);const retired=await read();
      assert.equal(retired.touchActive,false,name);assert.equal(retired.reservedEdge,false,name);
      await move({...p,y:p.y-80});await end();await page.waitForTimeout(80);const released=await read();
      assert.equal(released.rate,name==='speed-command-held'?1.75:1.25,name);
      assert.equal(released.taps,held.taps,name);assert.equal(released.seeks,held.seeks,name);
      assert.equal(released.reveals,held.reveals,name);assert.equal(released.axis,null,name);
      rows.push({name,held,retired,released});
    }
    await prepare();await page.evaluate(()=>setPlayerChromeVisible(true));
    const control=await page.locator('#shortsMoreBtn').boundingBox();
    await start({x:control.x+control.width/2,y:control.y+control.height/2,id:1});await page.waitForTimeout(600);
    const controlHeld=await read();assert.equal(controlHeld.rate,1.25);assert.equal(controlHeld.owner,false);await end();rows.push({name:'control',held:controlHeld});
    await prepare();await page.evaluate(()=>el.videoPlayer.pause());await start(await point(.88,.5));await page.waitForTimeout(600);
    const paused=await read();assert.equal(paused.rate,1.25);assert.equal(paused.owner,false);await end();rows.push({name:'paused',held:paused});
    const trusted=await page.evaluate(()=>holdQA.trusted);assert(trusted.length>0);assert(trusted.every(event=>event.trusted));assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({proof:'Isolated local Chrome native MP4 and trusted CDP mobile touch. Blur is a dispatched lifecycle event. No production/account/physical Android/iOS or human finger acceptance.',hashes,rows,trusted,errors},null,2));
    await context.close();console.log(`Mobile hold-speed native Chrome: ${rows.length} cases passed.`);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{fs.writeFileSync(path.join(__dirname,'failure.json'),JSON.stringify({hashes,rows,error:error.stack},null,2));console.error(error);process.exitCode=1;});
