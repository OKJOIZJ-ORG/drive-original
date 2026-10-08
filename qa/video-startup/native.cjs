'use strict';
// Native Chrome decoding with synthetic catalog/transport setup, never Q0/account proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, '../maintenance/tools/video-startup');
fs.mkdirSync(out, { recursive: true });
const hashes = Object.fromEntries(['app.js','styles.css','index.html'].map(name => [name,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
const media = fs.readFileSync(path.join(root,'qa/faststart-h264-aac.mp4'));
const held = new Set();
let releaseMedia = false;
const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res) => {
  const name = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if(name === 'fixture.mp4') {
    const send = () => {
      held.delete(send);if(res.destroyed)return;
      const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start=range?Number(range[1]):0,end=range?Math.min(Number(range[2]||media.length-1),media.length-1):media.length-1;
      if(start> end)return res.writeHead(416).end();
      res.writeHead(range?206:200,{'Content-Type':'video/mp4','Content-Length':end-start+1,
        'Accept-Ranges':'bytes','Cache-Control':'no-store',...(range?{'Content-Range':`bytes ${start}-${end}/${media.length}`}:{})});
      res.end(media.subarray(start,end+1));
    };
    if(releaseMedia)send();else {held.add(send);res.on('close',()=>held.delete(send));}
    return;
  }
  if(name==='neighbor.svg')return res.writeHead(200,{'Content-Type':'image/svg+xml'}).end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#466278"/></svg>');
  const target=path.resolve(root,name),type=types[path.extname(target)];
  if(!target.startsWith(root+path.sep)||/^(qa|memory|worker|node_modules|\.git)\//.test(name)
    ||!type||!fs.existsSync(target))return res.writeHead(404).end();
  const bytes=fs.readFileSync(target);res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length,'Cache-Control':'no-store'});res.end(bytes);
});

async function install(page) {
  await page.evaluate(() => {
    // Supply no token, no transport integrity flags, and no fake decode outcome.
    state.demo=false;hasUsableToken=()=>true;resetListingSession();
    state.files=Array.from({length:458},(_,i)=>({id:`fixture-${i}`,name:`Local clip ${String(i).padStart(4,'0')}.mp4`,
      mimeType:'video/mp4',size:'202253',modifiedTime:'2026-10-08T00:00:00Z',
      thumbnailLink:`/neighbor.svg?id=${i}`,capabilities:{canDownload:true}}));
    state.folders=[];state.currentFolderId='fixture-folder';state.currentFolderName='Local startup fixture';
    state.filter='all';state.query='';state.sort='name';state.nextPageToken='B';state.populationComplete=false;
    state.listLoadError=false;state.listPageTokens=new Set();state.loadingFiles=true;
    window.fixtureRequests=[];window.firstDecodedAt=null;window.lastFrameCallback=null;
    driveFetch=async(url,options)=>{
      const token=new URL(url).searchParams.get('pageToken')||'';
      fixtureRequests.push({token,at:performance.now(),priority:options.priority});
      return {json:async()=>({files:Array.from({length:1593},(_,i)=>({id:`later-${i}`,name:`Later clip ${i}.mp4`,mimeType:'video/mp4',size:'202253'}))})};
    };
    const video=el.videoPlayer,nativeFrame=video.requestVideoFrameCallback.bind(video);
    video.requestVideoFrameCallback=callback=>{
      window.lastFrameCallback=callback;
      return nativeFrame((now,metadata)=>{window.firstDecodedAt??=performance.now();callback(now,metadata);});
    };
    // Only substitute source acquisition; keep player, loader, owner and presentation logic.
    openMediaSource=file=>{
      state.selected=file;resetMediaElements();state.pendingPlay=true;state.mediaAttempt='fixture-local';
      el.videoPlayer.hidden=false;el.videoPlayer.dataset.mediaSession=String(state.mediaSession);
      showMediaLoading('격리된 로컬 영상 응답 대기');el.videoPlayer.muted=true;
      el.videoPlayer.src='/fixture.mp4';el.videoPlayer.load();void el.videoPlayer.play().catch(error=>{window.fixturePlayError=error.name;});
      state.loadingFiles=false;
    };
    renderBreadcrumb();renderFiles({resetWindow:true});
    openPlayer(state.files[0]);scheduleNextFilePage();
  });
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,rows=[];
  let browser;
  try {
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const [width,height,mobile] of [[1440,900,false],[390,844,true]]) {
      const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
      const errors=[],remoteRequests=[];
      await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();remoteRequests.push(new URL(route.request().url()).origin);return route.abort();});
      const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
      const row={width,height,mobile,passed:false};
      try {
        releaseMedia=false;
        row.phase='initial-setup';await page.goto(`${base}/?demo=1`);await page.waitForFunction(()=>state.demo&&!el.libraryView.hidden,null,{timeout:15000});
        await install(page);await page.waitForTimeout(180);
        const pending=await page.evaluate(()=>({requests:fixtureRequests.length,warmed:warmedThumbnails.size,frame:firstDecodedAt,
          loader:!el.mediaLoading.hidden,cards:el.fileGrid.childElementCount}));
        assert.equal(pending.requests,0);assert.equal(pending.warmed,0);assert.equal(pending.frame,null);assert.equal(pending.loader,true);assert.ok(pending.cards<=240);
        await page.screenshot({path:path.join(out,`${width}-pending.png`)});
        row.phase='first-frame';row.pending=pending;releaseMedia=true;for(const send of [...held])send();
        await page.waitForFunction(()=>firstDecodedAt!==null&&el.mediaLoading.hidden&&state.populationComplete&&!state.loadingFiles);
        row.ready=await page.evaluate(()=>({firstDecodedAt,requests:fixtureRequests,warmed:warmedThumbnails.size,
          loaderHidden:el.mediaLoading.hidden,total:state.files.length,cards:el.fileGrid.childElementCount,
          overflow:document.documentElement.scrollWidth>innerWidth,thumbnailPriority:playerMediaPriorityActive,deckComplete:state.playbackDeckComplete}));
        assert.equal(row.ready.total,2051);assert.ok(row.ready.cards<=240);assert.equal(row.ready.overflow,false);
        assert.ok(row.ready.requests.length>0&&row.ready.requests.every(r=>r.at>=row.ready.firstDecodedAt));
        assert.ok(row.ready.warmed>0);assert.equal(row.ready.thumbnailPriority,true);assert.equal(row.ready.deckComplete,true);
        await page.screenshot({path:path.join(out,`${width}-ready.png`)});
        // Separate held-media lifetime tests the actual close path; late callback invocation is synthetic.
        row.phase='close-setup';releaseMedia=false;await page.goto(`${base}/?demo=1`);await page.waitForFunction(()=>state.demo&&!el.libraryView.hidden,null,{timeout:15000});
        await install(page);await page.evaluate(()=>scheduleVideoFramePresentation());await page.waitForTimeout(120);
        assert.equal(await page.evaluate(()=>fixtureRequests.length),0);
        await page.evaluate(()=>closePlayer({preserveHistory:true}));await page.waitForFunction(()=>state.populationComplete&&!state.loadingFiles);
        row.closed=await page.evaluate(()=>{
          const before=warmedThumbnails.size;window.lastFrameCallback(0,{mediaTime:0});
          return {requests:fixtureRequests.length,hidden:el.playerSheet.hidden,before,after:warmedThumbnails.size,frame:firstDecodedAt,total:state.files.length};
        });
        assert.ok(row.closed.requests>0);assert.equal(row.closed.hidden,true);assert.equal(row.closed.before,row.closed.after);
        assert.equal(row.closed.frame,null);assert.equal(row.closed.total,2051);assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);
        row.pending=pending;row.passed=true;
      }catch(error){row.failure=error.message;row.errors=errors;row.debug=await page.evaluate(()=>({frame:window.firstDecodedAt,requests:window.fixtureRequests,
        readyState:el.videoPlayer.readyState,videoError:el.videoPlayer.error?.code,playError:window.fixturePlayError,
        paused:el.videoPlayer.paused,loader:el.mediaLoading.hidden,attempt:state.mediaAttempt,total:state.files.length,
        populationComplete:state.populationComplete,listError:state.listLoadError,selected:state.selected?.id}));
        await page.screenshot({path:path.join(out,`${width}-failure.png`)});}
      finally{await context.close();}
      rows.push(row);console.log(`${width}x${height}: ${row.passed?'PASS':row.failure}`);
    }
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  fs.writeFileSync(path.join(out,'native-results.json'),JSON.stringify({proof:'Isolated native Chrome local MP4 decoding and actual app presentation/catalog flow, with synthetic catalog and substituted source acquisition. Late closed-owner callback is synthetic. No credentials, Q0 transport authorization, real Drive, production, or physical-device acceptance.',hashes,fixtureBytes:media.length,rows},null,2));
  if(rows.some(row=>!row.passed))process.exitCode=1;
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1;});
