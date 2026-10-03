'use strict';
// Local actual-app Chrome event routing; native local MP4, no account or Drive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'playback-gestures');
fs.mkdirSync(out, { recursive:true });
const shell = new Map(['app.js','styles.css','index.html'].map(name=>[name,fs.readFileSync(path.join(root,name))]));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  const target=path.resolve(root,name);
  if(!target.startsWith(root+path.sep)||/(?:memory|worker|node_modules)\//.test(name)
    ||(name.startsWith('qa/')&&name!=='qa/seek-range-h264-aac.mp4')||!types[path.extname(name)]||!fs.existsSync(target))return res.writeHead(404).end();
  if(name.endsWith('.mp4')) {
    const bytes=fs.readFileSync(target),match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    if(match) {const start=Number(match[1]),end=Math.min(bytes.length-1,match[2]?Number(match[2]):bytes.length-1);
      if(start>end||start>=bytes.length)return res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`}).end();
      res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1});return res.end(bytes.subarray(start,end+1));}
  }
  res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store'});res.end(shell.get(name)||fs.readFileSync(target));
});
const read=page=>page.evaluate(()=>({paused:el.videoPlayer.paused,likes:qaGesture.likes,pauses:qaGesture.pauses,
  currentTime:el.videoPlayer.currentTime,duration:el.videoPlayer.duration,
  navigation:[...qaGesture.navigation],fullscreen:Boolean(document.fullscreenElement||document.webkitFullscreenElement),
  scale:visualViewport.scale,fit:getComputedStyle(el.videoPlayer).objectFit,
  hiddenChrome:el.playerModal.classList.contains('controls-idle'),trusted:[...qaGesture.trusted]}));
const wait=page=>page.waitForTimeout(380);
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'chrome',headless:true});const rows=[];
  try {
    for(const mobile of [false,true]) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`${base}/?demo=1`);await page.waitForFunction(()=>Boolean(playerChrome));
      await page.evaluate(()=>{
        el.playerSheet.hidden=false;el.mediaError.hidden=true;el.mediaLoading.hidden=true;
        state.selected={id:'local-video',name:'로컬 동작 검사.mp4',mimeType:'video/mp4'};state.mediaAttempt='range';
        el.videoPlayer.dataset.mediaSession=String(state.mediaSession);
        el.videoPlayer.hidden=false;el.imageViewer.hidden=true;el.videoPlayer.muted=true;el.videoPlayer.loop=true;
        el.videoPlayer.src='/qa/seek-range-h264-aac.mp4';el.videoPlayer.classList.add('is-ready');
        setNativeVideoActionsAvailable(true);setPlayerChromeVisible(false);playerInputModality='pointer';
        window.qaGesture={likes:0,pauses:0,navigation:[],trusted:[]};
        const toggle=togglePlayPause;togglePlayPause=(...args)=>{qaGesture.pauses++;return toggle(...args);};
        const like=toggleFavoriteForSelected;toggleFavoriteForSelected=(...args)=>{qaGesture.likes++;return like(...args);};
        // Only the navigation commit callback is replaced: no remote demo source is opened.
        hasCompletePlaybackPopulation=()=>true;resolveSwipeTarget=()=>({id:'local-next'});
        getPlaybackFileById=()=>null;playFrozenSwipeTarget=(id,direction)=>{qaGesture.navigation.push(direction);return Promise.resolve();};
        for(const type of ['click','dblclick','touchstart','touchend'])el.playerModal.addEventListener(type,event=>qaGesture.trusted.push({type,trusted:event.isTrusted}),true);
      });
      await page.waitForFunction(()=>el.videoPlayer.readyState>=2);await page.evaluate(()=>el.videoPlayer.play());
      const rect=await page.locator('#mediaStage').boundingBox();
      const point=(nx,ny)=>({x:rect.x+rect.width*nx,y:rect.y+rect.height*ny});
      const tap=async(nx,ny)=>{const p=point(nx,ny);if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
      const before=await read(page);
      for(const [nx,ny] of [[.15,.5],[.85,.5],[.5,.15],[.5,.8]]){await tap(nx,ny);await wait(page);}
      const outer=await read(page);assert.equal(outer.pauses,0);assert.equal(outer.paused,false);
      await tap(.5,.5);await wait(page);const center=await read(page);assert.equal(center.pauses,1);assert.equal(center.paused,true);assert.equal(center.hiddenChrome,true);
      await tap(.5,.5);await page.waitForTimeout(70);await tap(.5,.5);await wait(page);
      const pair=await read(page);assert.equal(pair.likes,1);assert.equal(pair.pauses,1);assert.equal(pair.fullscreen,false);assert.equal(pair.scale,before.scale);assert.equal(pair.fit,before.fit);
      await tap(.85,.5);await page.waitForTimeout(70);await tap(.85,.5);await wait(page);
      const forward=await read(page);assert.ok(Math.abs(forward.currentTime-Math.min(forward.duration,pair.currentTime+10))<.25,JSON.stringify({pair:pair.currentTime,forward:forward.currentTime,duration:forward.duration}));assert.equal(forward.pauses,1);
      await tap(.15,.5);await page.waitForTimeout(70);await tap(.15,.5);await wait(page);
      const backward=await read(page);assert.ok(Math.abs(backward.currentTime-pair.currentTime)<.25);assert.equal(backward.pauses,1);
      if(mobile) {
        const cdp=await context.newCDPSession(page),p=point(.5,.5);
        await tap(.5,.5);await page.waitForTimeout(60);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y-90,id:1}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(page);
        const swipe=await read(page);assert.deepEqual(swipe.navigation,['up']);assert.equal(swipe.pauses,1);assert.equal(swipe.likes,1);
        const entry=await page.locator('#playerControlsEntry').boundingBox();
        await tap(.5,.5);await page.waitForTimeout(50);
        await page.touchscreen.tap(entry.x+entry.width/2,entry.y+entry.height/2);
        const control=page.locator('#shortsMoreBtn');await control.tap();await wait(page);
        const afterControl=await read(page);assert.equal(afterControl.pauses,1);assert.equal(afterControl.likes,1);assert.deepEqual(afterControl.navigation,['up']);
        const controlRect=await control.boundingBox();
        await page.touchscreen.tap(controlRect.x+controlRect.width/2,controlRect.y+controlRect.height/2);
        await page.waitForTimeout(70);
        await page.touchscreen.tap(controlRect.x+controlRect.width/2,controlRect.y+controlRect.height/2);await wait(page);
        const controlPair=await read(page);assert.equal(controlPair.scale,before.scale);assert.equal(controlPair.fullscreen,false);assert.equal(controlPair.pauses,1);assert.equal(controlPair.likes,1);
      } else {
        const entry=await page.locator('#playerControlsEntry').boundingBox();
        await tap(.5,.5);await page.waitForTimeout(60);
        await page.mouse.click(entry.x+entry.width/2,entry.y+entry.height/2);await wait(page);
        const revealAfterPending=await read(page);assert.equal(revealAfterPending.pauses,1);assert.equal(revealAfterPending.paused,true);assert.equal(revealAfterPending.hiddenChrome,false);
        await page.evaluate(()=>setPlayerChromeVisible(false));
        const p=point(.5,.5);await page.mouse.dblclick(p.x,p.y);await wait(page);
        const doubleclick=await read(page);assert.equal(doubleclick.fullscreen,false);assert.equal(doubleclick.scale,before.scale);assert.equal(doubleclick.fit,before.fit);assert.equal(doubleclick.likes,2);assert.equal(doubleclick.pauses,1);
      }
      await page.evaluate(()=>setPlayerChromeVisible(false));
      await tap(.5,.5);await wait(page);const resumed=await read(page);assert.equal(resumed.pauses,2);assert.equal(resumed.paused,false);assert.equal(resumed.hiddenChrome,true);
      await page.screenshot({path:path.join(out,mobile?'mobile.png':'desktop.png')});
      const final=await read(page);assert.ok(final.trusted.every(event=>event.trusted));assert.deepEqual(errors,[]);
      rows.push({mobile,before,outer,center,pair,forward,backward,resumed,final,errors});await context.close();
    }
    const hashes=Object.fromEntries([...shell].map(([name,bytes])=>[name,crypto.createHash('sha256').update(bytes).digest('hex')]));
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({proof:'Isolated local Chrome actual trusted mouse and emulated touch events. Native local MP4 pause/play. Synthetic favorite and frozen navigation callback. No account, Drive, production, physical Android or iPhone proof.',hashes,rows},null,2));
    console.log('Desktop and mobile local Chrome gesture integration passed');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
