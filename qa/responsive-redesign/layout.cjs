'use strict';
// Actual app DOM in isolated Chrome, synthetic catalog/poster; never Drive.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const phase = process.argv[2] === 'before' ? 'before' : 'after';
const baselineRef = '776c28c';
const out = path.join(__dirname, phase);
fs.mkdirSync(out, { recursive: true });
const snapshots = Object.fromEntries(['app.js', 'styles.css', 'index.html'].map(name=>[name,
  phase === 'before' ? execFileSync('git', ['show', `${baselineRef}:${name}`], { cwd: root, maxBuffer: 8 * 1024 * 1024 })
  : fs.readFileSync(path.join(root,name))]));
const read = name => snapshots[name] || fs.readFileSync(path.join(root, name));
const hashes = Object.fromEntries(['app.js', 'styles.css', 'index.html'].map(name =>
  [name, crypto.createHash('sha256').update(read(name)).digest('hex')]));
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  const target = path.resolve(root, name);
  if (!target.startsWith(root + path.sep) || /(?:qa|memory|worker|node_modules)\//.test(name)
    || !types[path.extname(target)] || !fs.existsSync(target)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type':types[path.extname(target)], 'Cache-Control':'no-store' });
  res.end(read(name));
});
const bounds = async page => page.evaluate(() => {
  const rect = node => node.getBoundingClientRect().toJSON();
  const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
  return {
    viewport: { width:innerWidth, height:innerHeight }, documentWidth:document.documentElement.scrollWidth,
    toolbar:rect(document.querySelector('.toolbar')), selection:rect(el.selectionToolbar),
    controls:[...document.querySelectorAll('#selectionToolbar button,.toolbar button,.toolbar input,.toolbar select')].filter(visible).map(node => ({id:node.id || node.dataset.filter, rect:rect(node)})),
    cards:[...document.querySelectorAll('.file-card-favorite')].slice(0, 3).map(node => rect(node))
  };
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  const rows = [];
  try {
    for (const [width,height,mobile] of [[1920,1080,false],[1440,900,false],[440,796,true],[390,844,true],[360,640,true],[320,568,true],[667,375,true],[844,390,true]]) {
      const context = await browser.newContext({ viewport:{width,height}, isMobile:mobile, hasTouch:mobile, serviceWorkers:'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/?demo=1`);
      await page.waitForFunction(() => typeof playerChrome !== 'undefined' && playerChrome && !el.libraryView.hidden);
      await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width=180; canvas.height=180;
        const c = canvas.getContext('2d'); c.fillStyle='#19324b';c.fillRect(0,0,180,180);
        c.fillStyle='#5687a3';c.fillRect(18,56,54,124);c.fillStyle='#97b4bd';c.fillRect(93,26,70,154);
        window.uiPoster = canvas.toDataURL();
        state.files=Array.from({length:18},(_,i)=>({id:`ui-fixture-${i}`,name:`도시 산책 ${i+1} — 원본 보관 영상.mp4`,mimeType:'video/mp4',thumbnailLink:uiPoster,size:'24682496',modifiedTime:'2026-10-03T00:00:00Z',videoMediaMetadata:{width:1920,height:1080,durationMillis:95000}}));
        state.filter='all';state.query='';state.renderLimit=60;renderFiles({resetWindow:true});
        el.librarySummary.textContent='영상 18개 · 원본 보관함';el.libraryStatus.textContent='';
      });
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({ path:path.join(out,`${width}x${height}-cards.png`) });
      if (mobile) {
        const card = page.locator('.file-card-open').first();await card.scrollIntoViewIfNeeded();
        const point=await card.boundingBox();const cdp=await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x+point.width/2,y:point.y+point.height/2,id:1}]});
        await page.waitForTimeout(580);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
      } else {
        await page.locator('#selectionModeButton').click();await page.locator('.file-card-open').first().click();
      }
      await page.evaluate(()=>window.scrollTo(0,0));
      const row = { width,height,mobile,library:await bounds(page) };
      await page.screenshot({ path:path.join(out,`${width}x${height}-library.png`) });
      if (phase === 'after') {
        assert.equal(await page.locator('#selectionCountText').textContent(),'1개','long press selects one card');
        assert.ok(row.library.documentWidth <= width + 1, 'library does not overflow');
        const close = row.library.controls.find(item => item.id === 'selectionCancelBtn').rect;
        assert.ok(Math.abs(close.width-close.height)<1, 'selection cancel is square');
        if (width<=768) for (const item of row.library.controls) assert.ok(item.rect.height>=44, `${item.id} mobile target`);
        const selected=row.library.controls.filter(item=>item.id.startsWith('selection')&&item.id!=='selectionModeButton');
        for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
          const a=selected[i].rect,b=selected[j].rect;
          assert.ok(a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5,'selection controls do not overlap');
        }
      }
      await page.evaluate(() => {
        exitSelectionMode();setPlayerBackgroundInert(true);el.playerSheet.hidden=false;el.mediaError.hidden=true;el.mediaLoading.hidden=true;
        state.selected=state.files[0];el.videoPlayer.hidden=false;el.videoPlayer.poster=uiPoster;el.videoPlayer.classList.add('has-poster');
        Object.defineProperty(el.videoPlayer,'paused',{configurable:true,get:()=>true});
        el.playerTitle.textContent=state.selected.name;el.mobileShortsTitle.textContent=state.selected.name;
        setNativeVideoActionsAvailable(true);updatePlayPauseUI();playerInputModality='keyboard';setPlayerChromeVisible(true);el.closePlayerButton.focus();
      });
      await page.screenshot({ path:path.join(out,`${width}x${height}-player.png`) });
      row.player = await page.evaluate(() => {
        const rect = node => node.getBoundingClientRect().toJSON();
        const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
        return { chrome:rect(playerChrome), title:rect(el.playerTitle), progress:rect(el.mobileShortsProgressTrack),
          controls:[...playerChrome.querySelectorAll('button,summary,[role="slider"]')].filter(visible).map(node=>({id:node.id,rect:rect(node)})) };
      });
      if (phase==='after' && await page.locator('#ctrlSpeedButton').isVisible()) {
        await page.evaluate(() => {
          Object.defineProperty(el.videoPlayer,'paused',{configurable:true,get:()=>false});
          updatePlayPauseUI();
        });
        assert.ok(await page.locator('#ctrlIconPause').isVisible(), 'playing video displays pause icon');
        assert.equal(await page.locator('#ctrlIconPlay').isVisible(), false, 'playing video hides play icon');
        await page.evaluate(() => {
          Object.defineProperty(el.videoPlayer,'paused',{configurable:true,get:()=>true});
          updatePlayPauseUI();
        });
        assert.ok(await page.locator('#ctrlIconPlay').isVisible(), 'paused video displays play icon');
        await page.evaluate(()=>el.ctrlSpeedText.textContent='0.25×');
        assert.ok(await page.locator('#ctrlSpeedButton').evaluate(node=>node.scrollWidth<=node.clientWidth),'fractional speed label fits its button');
        await page.evaluate(()=>el.ctrlSpeedText.textContent='1.0×');
      }
      const shorts = await page.locator('#shortsMoreBtn').isVisible();
      if (shorts) await page.locator('#shortsMoreBtn').click();
      else await page.locator('#playerMoreMenu > summary').click();
      await page.evaluate(()=>{playerInputModality='keyboard';el.closePlayerButton.focus();});
      await page.waitForTimeout(250);
      const menuSelector=shorts?'#shortsExpandRow':'.player-more-popover';
      row.menu = await page.locator(menuSelector).boundingBox();
      await page.screenshot({ path:path.join(out,`${width}x${height}-menu.png`) });
      if (phase === 'after') {
        assert.ok(row.player.chrome.x>=0 && row.player.chrome.y>=0 && row.player.chrome.x+row.player.chrome.width<=width+1 && row.player.chrome.y+row.player.chrome.height<=height+1,'chrome in viewport');
        assert.ok(row.menu.x>=0 && row.menu.y>=0 && row.menu.x+row.menu.width<=width+1 && row.menu.y+row.menu.height<=height+1,'menu in viewport');
        if (shorts) {
          assert.ok(row.player.title.width>=width-92,'title owns a readable row');
          for (const item of row.player.controls) {
            const minimum = item.id === 'mobileShortsProgressTrack' ? 24 : 44;
            assert.ok(item.rect.width>=minimum&&item.rect.height>=minimum, `${item.id} touch target`);
          }
          const primary=row.player.controls.filter(item=>['shortsFavoriteBtn','shortsRotateBtn','shortsFullscreenBtn','shortsMoreBtn'].includes(item.id));
          assert.ok(primary.every(item=>Math.abs(item.rect.width-item.rect.height)<1),'shorts icon controls square');
        }
      }
      // Re-check bottom safe-area padding with real browser layout.
      await page.evaluate(()=>el.playerModal.style.setProperty('--safe-bottom','34px'));
      row.safeArea = await page.evaluate(()=>({chrome:playerChrome.getBoundingClientRect().toJSON(),progress:el.mobileShortsProgressTrack.getBoundingClientRect().toJSON()}));
      if(phase==='after'&&shorts) assert.ok(row.safeArea.progress.bottom<=height-34,'seek clears safe area');
      if (phase === 'after' && !mobile) {
        await page.evaluate(() => {
          el.playerMoreMenu.open = false;
          state.selected = { ...state.selected, mimeType:'image/jpeg', name:'사진.jpg' };
          el.videoPlayer.hidden = true;
          updatePlayPauseUI();
        });
        for (const id of ['topbarPrevBtn','topbarNextBtn','topbarRandomBtn']) {
          assert.ok(await page.locator(`#${id}`).isVisible(), `${id} remains available for desktop images`);
        }
        row.desktopImageNavigation = true;
      }
      row.errors=errors;assert.deepEqual(errors,[]);rows.push(row);await context.close();
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({phase,baselineRef,hashes,producerSHA256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),proof:'Local actual-app DOM with synthetic catalog/poster. No account, media fetch, physical-device, or production proof.',rows},null,2));
    console.log(`${phase}: ${rows.length} viewport layouts and menus passed`);
  } finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
