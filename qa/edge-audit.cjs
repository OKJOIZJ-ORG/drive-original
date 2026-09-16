'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');const out=path.join(__dirname,'edge-final');fs.mkdirSync(out,{recursive:true});
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const file=path.resolve(root,url.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');fs.createReadStream(file).pipe(res);});
const evidence=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/?demo=1`;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    await context.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:''}));
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'networkidle'});
    await page.evaluate(()=>{const base=state.files[0];state.files=Array.from({length:60},(_,i)=>({...base,id:'root-'+i,name:'원본 '+i}));renderFiles();window.scrollTo(0,120);});
    await page.waitForTimeout(150);
    await page.locator('.folder-row').first().click();
    await page.waitForFunction(()=>state.currentFolderId==='demo-folder-1'&&state.files.length===2);
    const cdp=await context.newCDPSession(page);
    const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=0])=>({x,y,id,radiusX:1,radiusY:1,force:1}))});
    const drag=async(xs,{end=true,delay=45}={})=>{await send('touchStart',[[xs[0],260]]);for(const x of xs.slice(1)){await page.waitForTimeout(delay);await send('touchMove',[[x,260]]);}if(end)await send('touchEnd',[]);};
    await drag([4,36,95,180],{end:false});
    const tracking=await page.evaluate(()=>({distance:edgeBackGesture?.distance,transform:document.querySelector('.edge-over')?.style.transform,under:document.querySelector('.edge-under')?.style.transform,duplicates:[...document.querySelectorAll('[id]')].length-new Set([...document.querySelectorAll('[id]')].map(e=>e.id)).size}));
    assert.equal(tracking.distance,176);assert.match(tracking.transform,/176px/);assert.equal(tracking.duplicates,0);
    await page.screenshot({path:path.join(out,'390-edge-mid-drag.png')});await send('touchEnd',[]);
    await page.waitForFunction(()=>state.currentFolderId==='root'&&!libraryNavigation.pending&&!libraryNavigation.restoring);
    const restored=await page.evaluate(()=>({folder:state.currentFolderId,scroll:scrollY,count:state.files.length,cursor:libraryNavigation.cursor}));assert.equal(restored.scroll,120);assert.equal(restored.count,60);
    await page.screenshot({path:path.join(out,'390-edge-restored.png')});evidence.push({name:'direct tracking and cached parent scroll restoration',tracking,restored});
    await page.locator('.folder-row').first().click();await page.waitForFunction(()=>state.currentFolderId==='demo-folder-1');
    await drag([4,35,85],{end:false});await page.waitForTimeout(180);await send('touchEnd',[]);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>state.currentFolderId),'demo-folder-1');
    await drag([4,65,220,150,85]);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>state.currentFolderId),'demo-folder-1');evidence.push({name:'short stationary drag and reverse flick cancel'});
    await send('touchStart',[[4,260]]);await send('touchMove',[[7,320]]);await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>edgeBackGesture),null);await send('touchEnd',[]);evidence.push({name:'vertical scroll wins without taking gesture ownership'});
    await drag([4,65,160],{end:false});await send('touchStart',[[160,260],[170,300,1]]);await send('touchEnd',[]);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>state.currentFolderId),'demo-folder-1');evidence.push({name:'second finger cancels cleanly'});
    await drag([4,90,215]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>state.currentFolderId),'demo-folder-1');evidence.push({name:'interrupted completion cannot navigate later'});
    await page.emulateMedia({reducedMotion:'reduce'});await drag([4,65,190]);await page.waitForFunction(()=>state.currentFolderId==='root');assert.equal(await page.locator('.library-edge-transition').count(),0);evidence.push({name:'reduced-motion immediate completion'});
    await page.locator('[data-filter="video"]').click();await page.locator('[data-filter="favorites"]').click();await page.waitForFunction(()=>!state.loadingFavorites);
    await page.goBack();await page.waitForFunction(()=>state.filter==='video');await page.goBack();await page.waitForFunction(()=>state.filter==='all');evidence.push({name:'browser back restores previous filter, not hardcoded all'});
    assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
  const wk=await webkit.launch({headless:true});
  try{
    const context=await wk.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile/15E148 Safari/604.1'});
    await context.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:''}));
    const page=await context.newPage();await page.goto(url,{waitUntil:'networkidle'});await page.locator('.folder-row').first().click();await page.waitForFunction(()=>state.currentFolderId==='demo-folder-1');
    assert.equal(await page.evaluate(()=>prefersNativeLibraryBack()),true);
    const start=await page.evaluate(()=>{const target=document.getElementById('libraryView');const touch={identifier:0,target,clientX:4,clientY:250};const event=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:[touch]});target.dispatchEvent(event);return {prevented:event.defaultPrevented,active:Boolean(edgeBackGesture)};});
    assert.deepEqual(start,{prevented:false,active:false});
    await page.goBack();await page.waitForFunction(()=>state.currentFolderId==='root');await page.screenshot({path:path.join(out,'webkit-native-history-back.png')});
    evidence.push({name:'WebKit iOS policy reserves physical edge for native history',start,physicalDevice:false});await context.close();
  }finally{await wk.close();}
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));server.close();
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({completed:evidence,error:e.stack},null,2));server.close();process.exitCode=1;});
