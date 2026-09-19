'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, process.argv[2] || 'functional');
fs.mkdirSync(out, { recursive: true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/sibling/sw.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('self.addEventListener("install",()=>self.skipWaiting());'); return; }
  let relative = decodeURIComponent(url.pathname).replace(/^\/drive-original\//, '') || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
const results = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let base, browser, video;
const poster = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#182c43"/><circle cx="320" cy="170" r="90" fill="#4c94d2"/><text x="320" y="190" text-anchor="middle" fill="white" font-size="32">Original fixture</text></svg>');
function record(name, details = {}) { const r = { name, status:'passed', ...details }; results.push(r); console.log(JSON.stringify(r)); }
async function check(name, callback) {
  try { await callback(); }
  catch (error) { results.push({ name, status:'failed', error:error.stack }); fs.writeFileSync(path.join(out,'results.json'), JSON.stringify(results,null,2)); throw error; }
}
async function generateVideo() {
  const page = await browser.newPage();
  await page.goto(base);
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width=640; canvas.height=360;
    const ctx = canvas.getContext('2d'); const stream = canvas.captureStream(24);
    const media = new MediaRecorder(stream, { mimeType:'video/webm;codecs=vp8', videoBitsPerSecond:300000 });
    const chunks=[]; media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    const done = new Promise(resolve=>{ media.onstop=async()=>resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())]); });
    let frame=0;
    const draw = () => { ctx.fillStyle='#172b43';ctx.fillRect(0,0,640,360);ctx.fillStyle='#56a3ed';ctx.fillRect((frame*3)%540,70,100,160);ctx.fillStyle='white';ctx.font='26px sans-serif';ctx.fillText('Exact-original test '+frame,24,320);frame++; };
    draw(); media.start(); const timer=setInterval(draw,1000/24);
    await new Promise(resolve=>setTimeout(resolve,7000)); clearInterval(timer);media.stop();stream.getTracks().forEach(t=>t.stop());return done;
  });
  await page.close(); video=Buffer.from(bytes);fs.writeFileSync(path.join(out,'fixture.webm'),video);
}
async function environment({ mobile=false, disableOpfs=false, rangeFault=null, bulkFault=null }={}) {
  const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  if(disableOpfs) await context.addInitScript(()=>{Object.defineProperty(navigator.storage,'getDirectory',{value:undefined,configurable:true});});
  const store = new Map(); const calls=[]; let mediaCalls=0,tokenCounter=0;
  for (const [i,id] of ['video-A','video-B','video-C','video-outside'].entries()) store.set(id,{id,name:`원본 테스트 ${i+1} — 긴 제목과 공백을 포함한 영상.webm`,mimeType:'video/webm',size:String(video.length),modifiedTime:`2026-09-${10+i}T12:00:00Z`,parents:[id==='video-outside'?'folder-Q':'root'],resourceKey:'fixture-key',thumbnailLink:poster,capabilities:{canDownload:true,canTrash:true,canMoveItemWithinDrive:true},videoMediaMetadata:{width:640,height:360,durationMillis:'2500'}});
  store.set('photo-A',{id:'photo-A',name:'이미지 모음.svg',mimeType:'image/svg+xml',size:'128',parents:['root'],thumbnailLink:poster,capabilities:{canDownload:true,canTrash:true}});
  store.set('folder-Q',{id:'folder-Q',name:'다른 폴더',mimeType:'application/vnd.google-apps.folder',parents:['root']});
  const account = new Map([['state-legacy',{id:'state-legacy',name:'drive-original-account-state.json',modifiedTime:'2026-09-01T00:00:00Z',data:{schemaVersion:1,updatedAt:20,viewed:{},favorites:{'video-outside':{liked:true,updatedAt:20}}}}]]);
  await context.route('https://accounts.google.com/gsi/client', route=>route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{initTokenClient(options){return{requestAccessToken(){setTimeout(()=>options.callback({access_token:'fixture-'+(++window.fixtureTokenCounter),expires_in:3600,scope:'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata'}),0);}}},revoke(token,done){done?.();}}}};window.fixtureTokenCounter=0;`}));
  await context.route('https://www.googleapis.com/**',async route=>{
    const req=route.request(); const url=new URL(req.url()); const id=url.pathname.split('/').pop(); const method=req.method(); const headers=await req.allHeaders();
    const entry={method,path:url.pathname,query:Object.fromEntries(url.searchParams),range:headers.range||null,sw:Boolean(req.serviceWorker()),authorization:headers.authorization,resourceKey:headers['x-goog-drive-resource-keys']};calls.push(entry);
    const reply=(data,status=200,extra={})=>route.fulfill({status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-store',...extra},body:JSON.stringify(data)});
    if (method==='OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'*'}});
    if (id==='about') return reply({user:{permissionId:'fixture-account'}});
    if (url.searchParams.get('alt')==='media' && account.has(id)) return reply(account.get(id).data);
    if (url.pathname.includes('/upload/')) {
      if(method==='PATCH'){account.get(id).data=JSON.parse(req.postData());account.get(id).modifiedTime=new Date().toISOString();return reply({id});}
      const parts=req.postData().split('\r\n\r\n').slice(1).map(p=>p.split('\r\n--')[0]);const meta=JSON.parse(parts[0]);const data=JSON.parse(parts[1]);const created='state-'+account.size;account.set(created,{...meta,id:created,data,modifiedTime:new Date().toISOString()});return reply({id:created});
    }
    if (url.searchParams.get('spaces')==='appDataFolder') return reply({files:[...account.values()].map(({data,...rest})=>rest)});
    if(method==='PATCH') {
      if(id===bulkFault) return reply({error:{errors:[{reason:'insufficientFilePermissions'}],message:'Fixture permission denied'}},403);
      const file=store.get(id);Object.assign(file,JSON.parse(req.postData()||'{}'));
      if(url.searchParams.has('addParents'))file.parents=[url.searchParams.get('addParents')];return reply(file);
    }
    if(url.searchParams.get('alt')==='media') {
      mediaCalls++;
      if(headers.range){
        if(rangeFault==='401-once' && mediaCalls===1)return reply({error:{errors:[{reason:'authError'}]}},401);
        const match=/bytes=(\d+)-(\d*)/.exec(headers.range);const start=Number(match?.[1]||0);const end=Math.min(video.length-1,match?.[2]?Number(match[2]):video.length-1);
        if(start>=video.length)return reply({error:{message:'range'}},416,{'Content-Range':`bytes */${video.length}`});
        const bytes=video.subarray(start,end+1);const length=rangeFault==='invalid'?'1':String(bytes.length);
        return route.fulfill({status:206,headers:{'Content-Type':'video/webm','Content-Range':`bytes ${start}-${end}/${video.length}`,'Content-Length':length,'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Range,Content-Length','Cache-Control':'no-store'},body:bytes});
      }
      return route.fulfill({status:200,headers:{'Content-Type':'video/webm','Content-Length':String(video.length),'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'},body:video});
    }
    if(store.has(id))return reply(store.get(id));
    if(id==='root')return reply({id:'root',name:'내 드라이브',mimeType:'application/vnd.google-apps.folder'});
    if(id==='files') {
      const query=url.searchParams.get('q')||'';const parent=/'([^']+)' in parents/.exec(query)?.[1];
      return reply({files:[...store.values()].filter(f=>!f.trashed&&(!parent||f.parents?.includes(parent)))});
    }
    return reply({error:{message:'Unexpected test API call'}},404);
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#connectButton').click();
  await page.waitForFunction(()=>state.accountStateLoaded && state.files.length===4 && !state.loading,{timeout:20000});
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  return {context,page,calls,account,store,errors};
}
async function openVideo(page,id='video-A') {
  await page.evaluate(id=>openPlayer(state.files.find(f=>f.id===id)||state.favoriteFiles.find(f=>f.id===id)),id);
  await page.waitForFunction(()=>el.videoPlayer.readyState>=2 && el.mediaLoading.hidden && state.mediaTransportVerified,{timeout:20000});
  await page.evaluate(()=>{el.videoPlayer.pause();el.videoPlayer.currentTime=.4;resetControlsTimer();});
}
async function exactBufferedBytes(page) {
  return hash(Buffer.from(await page.evaluate(async()=>[...new Uint8Array(await (await fetch(el.videoPlayer.src)).arrayBuffer())])));
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/drive-original/`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  await generateVideo();
  try {
    await check('immersive bottom-only chrome, pointer focus, keyboard access and fullscreen',async()=>{
      const {page,context,errors}=await environment();
      try {
        await openVideo(page);
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(()=>el.playerModal.classList.contains('controls-idle')),true);
        assert.equal(await page.locator('#stageCenterPlayBtn').isVisible(),false);
        await page.mouse.move(620,390);await page.waitForTimeout(400);
        assert.equal(await page.evaluate(()=>playerChrome.inert),true,'central mouse movement must not reveal');
        await page.mouse.move(620,797);await page.waitForTimeout(200);
        assert.equal(await page.evaluate(()=>playerChrome.inert),false);
        const bounds=await page.locator('.custom-video-controls').evaluate(e=>({width:e.getBoundingClientRect().width,bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderTopWidth}));
        assert(bounds.width>1150);assert.equal(bounds.bg,'rgba(0, 0, 0, 0)');assert.equal(bounds.border,'0px');
        await page.locator('#ctrlMute').click();
        assert.equal(await page.evaluate(()=>document.activeElement.id),'mediaStage');
        const muted=await page.evaluate(()=>el.videoPlayer.muted);
        await page.mouse.move(630,380);await page.waitForTimeout(550);
        assert.equal(await page.evaluate(()=>playerChrome.inert),true);
        await page.keyboard.press('Space');await page.waitForTimeout(80);
        assert.equal(await page.evaluate(()=>el.videoPlayer.paused),false);
        assert.equal(await page.evaluate(()=>el.videoPlayer.muted),muted,'Space must not reactivate mute');
        await page.keyboard.press('Space');
        assert.equal(await page.evaluate(()=>el.videoPlayer.paused),true);
        assert.equal(await page.evaluate(()=>playerChrome.inert),true,'pause does not reveal chrome');
        await page.screenshot({path:path.join(out,'desktop-paused-immersive.png')});
        await page.keyboard.press('Tab');await page.locator('#ctrlMute').focus();
        assert.equal(await page.evaluate(()=>document.activeElement.id),'ctrlMute','Tab must synchronously expose keyboard focus');
        await page.keyboard.press('Space');
        assert.equal(await page.evaluate(()=>el.videoPlayer.muted),!muted,'intentional keyboard button activation stays native');
        assert.equal(await page.evaluate(()=>el.videoPlayer.paused),true);
        const clipped=await page.locator('.player-chrome button:visible').evaluateAll(nodes=>nodes.filter(n=>{
          const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight;
        }).map(n=>n.id));assert.deepEqual(clipped,[],'controls must not slide outside the viewport when revealed');
        await page.screenshot({path:path.join(out,'desktop-bottom-chrome.png')});
        await page.locator('#ctrlMute').click();await page.mouse.move(640,300);await page.waitForTimeout(550);
        assert.equal(await page.evaluate(()=>playerChrome.inert),true,'pointer takeover after keyboard use still hides on exit');
        await page.keyboard.press('f');await page.waitForFunction(()=>Boolean(document.fullscreenElement));
        assert.equal(await page.evaluate(()=>document.fullscreenElement.contains(playerChrome)),true);
        await page.keyboard.press('f');await page.waitForFunction(()=>!document.fullscreenElement);
        assert.deepEqual(errors,[]);record('immersive bottom-only chrome, pointer focus, keyboard access and fullscreen',{bounds});
      }finally{await context.close();}
    });
    await check('player edge closes exactly one history entry; interior swipe keeps player open',async()=>{
      const {page,context,errors}=await environment({mobile:true});
      try {
        await openVideo(page);
        const folder=await page.evaluate(()=>state.currentFolderId);
        const cdp=await context.newCDPSession(page);
        const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=0])=>({x,y,id,radiusX:1,radiusY:1,force:1}))});
        const drag=async xs=>{await send('touchStart',[[xs[0],350]]);for(const x of xs.slice(1)){await page.waitForTimeout(45);await send('touchMove',[[x,350]]);}await send('touchEnd',[]);};
        const before=await page.evaluate(()=>state.selected.id);
        await drag([4,65,210,85]);await page.waitForTimeout(400);
        assert.equal(await page.evaluate(()=>el.playerSheet.hidden),false);
        assert.equal(await page.evaluate(()=>state.selected.id),before,'reverse edge must not change video');
        await drag([4,65,160,245]);
        await page.waitForFunction(()=>el.playerSheet.hidden&&!playerHistoryPending);
        assert.equal(await page.evaluate(()=>state.currentFolderId),folder);
        assert.equal(await page.evaluate(()=>el.playerSheet.style.transform),'');
        assert.equal(await page.locator('.library-edge-transition').count(),0);
        await openVideo(page,'video-B');
        await drag([100,155,230,290]);
        await page.waitForFunction(()=>state.selected?.id!=='video-B'&&!swipeCommitPending);
        assert.equal(await page.evaluate(()=>el.playerSheet.hidden),false);
        await page.goBack();await page.waitForFunction(()=>el.playerSheet.hidden);
        assert.equal(await page.evaluate(()=>state.currentFolderId),folder);
        assert.deepEqual(errors,[]);record('player edge closes exactly one history entry; interior swipe keeps player open',{physicalDevice:false});
      }finally{await context.close();}
    });
    await check('real pointer long press cancels native selection and consumes release click',async()=>{
      const {page,context,errors}=await environment();
      try {
        const button=page.locator('.file-card-open').first();const r=await button.boundingBox();
        await page.mouse.move(r.x+r.width/2,r.y+40);await page.mouse.down();await page.waitForTimeout(620);
        assert.equal(await page.evaluate(()=>state.selectionMode),true);
        await page.mouse.up();await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>el.playerSheet.hidden),true);
        assert.equal(await page.evaluate(()=>String(window.getSelection())), '');
        assert.equal(await button.evaluate(n=>getComputedStyle(n).userSelect),'none');
        await page.locator('#selectionCancelBtn').click();
        await page.mouse.move(r.x+r.width/2,r.y+40);await page.mouse.down();
        await page.mouse.move(r.x+r.width/2+50,r.y+80);await page.waitForTimeout(620);await page.mouse.up();
        assert.equal(await page.evaluate(()=>state.selectionMode),false,'movement cancels pending selection');
        if(!await page.evaluate(()=>el.playerSheet.hidden)) await page.keyboard.press('Escape');
        await page.locator('#searchInput').fill('selection remains available');
        await page.locator('#searchInput').focus();await page.keyboard.press('Control+a');
        assert.equal(await page.locator('#searchInput').evaluate(n=>n.selectionEnd-n.selectionStart),27);
        assert.deepEqual(errors,[]);record('real pointer long press cancels native selection and consumes release click');
      }finally{await context.close();}
    });
    await check('same-account fixture renewal preserves playback and the expired library',async()=>{
      const {page,context,errors}=await environment();
      try {
        await openVideo(page);
        const proof=await page.evaluate(async()=>{
          const files=state.files, selected=state.selected, session=state.mediaSession;
          const generation=state.driveSessionGeneration, revision=state.tokenRevision;
          const ok=await requestGoogleToken({background:false,force:true,invalidateSession:true});
          clearRejectedToken({status:401,rejectedTokenRevision:revision,rejectedAccountGeneration:generation});
          return {ok,sameFiles:state.files===files,sameSelected:state.selected===selected,
            sameMedia:state.mediaSession===session,sameAccountGeneration:state.driveSessionGeneration===generation,
            renewed:state.tokenRevision>revision,usable:hasUsableToken(),paused:el.videoPlayer.paused,time:el.videoPlayer.currentTime};
        });
        assert(proof.ok&&proof.sameFiles&&proof.sameSelected&&proof.sameMedia&&proof.sameAccountGeneration&&proof.renewed&&proof.usable&&proof.paused);
        assert(Math.abs(proof.time-.4)<.15);
        await page.keyboard.press('Escape');await page.waitForFunction(()=>el.playerSheet.hidden&&!playerHistoryPending);
        await page.setViewportSize({width:320,height:568});
        const preserved=await page.evaluate(async()=>{
          const files=state.files;state.expiresAt=Date.now()-1;await loadFiles({append:false});
          return state.files===files&&!el.libraryView.hidden;
        });assert.equal(preserved,true);
        assert.equal(await page.locator('#reconnectButton').isVisible(),true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:path.join(out,'320-reconnect-preserves-library.png')});
        await page.locator('#reconnectButton').click();
        await page.waitForFunction(()=>hasUsableToken()&&!document.getElementById('reconnectButton').disabled);
        assert.equal(await page.locator('#reconnectButton').isVisible(),false);
        assert.deepEqual(errors,[]);record('same-account fixture renewal preserves playback and the expired library',{proof});
      }finally{await context.close();}
    });
    await check('original OPFS, playback, keyboard, active-tab lease and scoped cleanup',async()=>{
      const {page,context,calls,errors}=await environment();
      try {
        await openVideo(page);
        const mode=await page.evaluate(()=>state.mediaPlaybackMode);assert.equal(mode,'original-opfs');
        assert.equal(await exactBufferedBytes(page),hash(video));
        assert.equal(await page.locator('video').count(),1);
        // Controls are deliberately inert while hidden. Enter them through
        // the real keyboard reveal path rather than focusing invisible DOM.
        await page.keyboard.press('Tab');
        await page.locator('#seekBarContainer').focus();
        assert.equal(await page.evaluate(()=>document.activeElement.id),'seekBarContainer','explicit keyboard reveal must make the seekbar focusable');
        await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
        const seek=await page.evaluate(()=>({time:el.videoPlayer.currentTime,duration:el.videoPlayer.duration,
          active:document.activeElement.id,idle:el.playerModal.classList.contains('controls-idle'),inert:playerChrome.inert,paused:el.videoPlayer.paused}));
        assert(Math.abs(seek.time-Math.min(5,seek.duration))<.15,JSON.stringify(seek));
        await page.evaluate(()=>{el.videoPlayer.currentTime=.5;});
        await page.locator('#ctrlPlayPause').focus();const paused=await page.evaluate(()=>el.videoPlayer.paused);await page.keyboard.press('Space');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>el.videoPlayer.paused),!paused);await page.evaluate(()=>el.videoPlayer.pause());
        await page.keyboard.press('Control+f');assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),false);
        await page.screenshot({path:path.join(out,'opfs-player.png')});
        await page.evaluate(()=>{window.fixtureTemp=state.mediaTempStorage;});
        const second=await context.newPage();await second.goto(base);await second.waitForFunction(()=>typeof cleanupStaleOriginalBuffers==='function');await second.evaluate(()=>cleanupStaleOriginalBuffers());
        assert.equal(await page.evaluate(async()=>Boolean(await fixtureTemp.directory.getFileHandle(fixtureTemp.name))),true);
        await second.close();await page.evaluate(()=>closePlayer());await page.waitForTimeout(200);
        assert.equal(await page.evaluate(async()=>{try{await fixtureTemp.directory.getFileHandle(fixtureTemp.name);return false;}catch(e){return e.name==='NotFoundError';}}),true);
        assert.deepEqual(errors,[]);record('original OPFS, playback, keyboard, active-tab lease and scoped cleanup',{mode,sha256:hash(video),requests:calls.filter(c=>c.query.alt==='media'&&!c.path.includes('state')).length});
      } finally{await context.close();}
    });
    for(const fault of [null,'401-once','invalid']) await check(`Range transport ${fault||'valid'}`,async()=>{
      const {page,context,calls,errors}=await environment({disableOpfs:true,rangeFault:fault});
      try{
        await openVideo(page);const mode=await page.evaluate(()=>state.mediaPlaybackMode);
        if(fault==='invalid'){assert.equal(mode,'original-memory');assert.equal(await exactBufferedBytes(page),hash(video));}
        else assert.equal(mode,'original-range');
        const media=calls.filter(c=>c.query.alt==='media'&&!c.path.includes('state'));
        assert(media.some(c=>c.sw&&c.range));
        if(fault==='401-once'){assert.equal(media[0].range,media[1].range);assert.equal(media[0].resourceKey,media[1].resourceKey);assert.notEqual(media[0].authorization,media[1].authorization);}
        assert.equal(await page.evaluate(()=>el.drivePreview.hidden),true);assert.deepEqual(errors,[]);
        await page.screenshot({path:path.join(out,`range-${fault||'valid'}.png`)});record(`Range transport ${fault||'valid'}`,{mode,mediaRequests:media.length});
      }finally{await context.close();}
    });
    await check('favorite cross-folder selection and partial bulk failure',async()=>{
      const {page,context,calls,errors}=await environment({bulkFault:'video-B'});
      try{
        await page.locator('[data-filter="favorites"]').click();await page.waitForFunction(()=>!state.loadingFavorites&&state.favoriteFiles.length===1);
        await page.locator('#selectionModeButton').click();await page.locator('#selectionSelectAllBtn').click();
        assert.deepEqual(await page.evaluate(()=>getActionFiles().map(f=>f.id)),['video-outside']);
        await page.locator('#selectionCancelBtn').click();await page.locator('[data-filter="all"]').click();
        await page.evaluate(()=>{enterSelectionMode();['video-A','video-B','video-C'].forEach(id=>state.selectedFileIds.add(id));updateSelectionUI();});
        await page.locator('#selectionDeleteBtn').click();await page.locator('#deleteConfirmButton').click();await page.waitForFunction(()=>!state.bulkAction);
        assert.deepEqual(await page.evaluate(()=>[...state.selectedFileIds]),['video-B']);
        assert.deepEqual(calls.filter(c=>c.method==='PATCH'&&!c.path.includes('/upload/')).map(c=>c.path.split('/').pop()).sort(),['video-A','video-B','video-C']);
        assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'bulk-partial.png')});record('favorite cross-folder selection and partial bulk failure');
      }finally{await context.close();}
    });
    await check('mobile video, overflow actions, seek and double-tap',async()=>{
      const {page,context,errors}=await environment({mobile:true});
      try{
        await openVideo(page);await page.touchscreen.tap(195,838);
        await page.locator('#shortsMoreBtn').click();await page.waitForTimeout(250);
        await page.screenshot({path:path.join(out,'mobile-video-menu.png')});
        const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        fs.writeFileSync(path.join(out,'mobile-video-axe.json'),JSON.stringify(axe.violations,null,2));assert.equal(axe.violations.length,0);
        const rects=await page.locator('#shortsExpandRow button:visible').evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height})));assert(rects.every(r=>r.height>=44&&r.top>=0&&r.bottom<=844));
        await page.locator('#shortsMoreBtn').click();
        await page.locator('#mobileShortsProgressTrack').focus();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>el.videoPlayer.currentTime),0);
        await page.evaluate(()=>{el.mobileShortsProgressTrack.blur();});
        const before=await page.evaluate(()=>isFavoriteFileId(state.selected.id));
        await page.touchscreen.tap(195,360);await page.waitForTimeout(90);await page.touchscreen.tap(195,360);await page.waitForTimeout(360);
        assert.equal(await page.evaluate(()=>isFavoriteFileId(state.selected.id)),!before);
        assert.deepEqual(errors,[]);record('mobile video, overflow actions, seek and double-tap',{axeViolations:0,menuActions:rects.length});
      }finally{await context.close();}
    });
    await check('7384-item desktop/mobile virtualization and stable sort reuse',async()=>{
      const {page,context,errors}=await environment();
      try{
        await page.evaluate(poster=>{
          state.files=Array.from({length:7384},(_,i)=>({id:`scale-${String(i).padStart(5,'0')}`,name:`사진 ${String(i).padStart(5,'0')}.png`,mimeType:'image/png',size:'1234',thumbnailLink:poster}));
          state.folders=[];state.filter='all';state.query='';state.sort='name';state.populationComplete=true;state.nextPageToken=null;
          renderFiles({resetWindow:true});
        },poster);
        const measurements=[];
        for(const [width,height] of [[1280,800],[390,844],[320,568],[844,390]]){
          await page.setViewportSize({width,height});
          await page.evaluate(()=>{state.renderWindowStart=0;renderFiles();window.scrollTo(0,0);});
          await page.waitForTimeout(350);
          for(let i=0;i<4;i++){await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(200);}
          const geometry=await page.evaluate(()=>({count:document.querySelectorAll('.file-card').length,columns:getGridColumnCount(),height:state.renderRowHeight,last:document.querySelector('.file-card:last-child')?.dataset.fileId,overflow:document.documentElement.scrollWidth>innerWidth}));
          assert(geometry.count<=240);assert.equal(geometry.last,'scale-07383');assert.equal(geometry.overflow,false);
          const cached=await page.evaluate(()=>{const data=filteredAndSortedFiles();const start=performance.now();for(let i=0;i<1000;i++){if(filteredAndSortedFiles()!==data)throw new Error('cache not reused');}return performance.now()-start;});
          measurements.push({width,...geometry,cached1000ReadsMs:cached});
          await page.screenshot({path:path.join(out,`scale-${width}.png`)});
        }
        assert.deepEqual(errors,[]);record('7384-item desktop/mobile virtualization and stable sort reuse',{measurements});
      }finally{await context.close();}
    });
    await check('offline first reload uses versioned shell; cache reset preserves sibling app',async()=>{
      const {page,context,errors}=await environment();
      try{
        await page.evaluate(async()=>{await navigator.serviceWorker.register('/sibling/sw.js',{scope:'/sibling/'});await caches.open('sibling-private-cache');});
        await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof APP_VERSION==='string' && typeof closePlayer==='function');
        assert.equal(await page.locator('#brandButton').count(),1);
        await context.setOffline(false);await page.evaluate(()=>clearAppShellStorage());
        const rest=await page.evaluate(async()=>({caches:await caches.keys(),workers:(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.scope).pathname)}));
        assert(rest.caches.includes('sibling-private-cache'));assert(rest.workers.includes('/sibling/'));assert(!rest.workers.includes('/drive-original/'));
        assert.deepEqual(errors,[]);record('offline first reload uses versioned shell; cache reset preserves sibling app');
      }finally{await context.close();}
    });
  }finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();browser?.close();});
