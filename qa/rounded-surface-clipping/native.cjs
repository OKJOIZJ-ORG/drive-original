'use strict';
// Local native paint/scroll audit. Synthetic dialog content, no Drive/account writes.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, '../maintenance/tools/rounded-surface-clipping');
fs.mkdirSync(out, { recursive: true });
const baseline = cp.execFileSync('git', ['show', 'f3463f1:styles.css'], { cwd:root, encoding:'utf8' });
const hashes = Object.fromEntries(['app.js','styles.css','index.html'].map(name => [name,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req,res) => {
  const name = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  const target = path.resolve(root,name);
  if (!target.startsWith(root+path.sep) || /^(qa|memory|worker|node_modules)\//.test(name)
    || !types[path.extname(target)] || !fs.existsSync(target)) return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':types[path.extname(target)],'Cache-Control':'no-store'});
  res.end(fs.readFileSync(target));
});
const dialogIds = ['fileNameDialog','settingsDialog','playerTracksDialog','deleteDialog','moveDialog','permissionDialog'];
const rows = [];
const settle = page => page.waitForTimeout(400);
const calibrate = page => page.addStyleTag({content:
  'body{background:linear-gradient(125deg,#9f745b,#5e8c76 50%,#627797)!important;background-attachment:fixed!important}' });
const measure = async (page,id) => page.evaluate(id => {
  const host=document.getElementById(id),box=host.querySelector('.dialog-box'),body=host.querySelector('.dialog-content');
  const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
  return {host:rect(host),box:rect(box),body:rect(body),hostOverflow:getComputedStyle(host).overflow,
    boxOverflow:getComputedStyle(box).overflow,hostRadius:getComputedStyle(host).borderRadius,
    boxRadius:getComputedStyle(box).borderRadius,bodyClient:body.clientHeight,bodyScroll:body.scrollHeight,
    horizontal:document.documentElement.scrollWidth>innerWidth,focusInside:host.contains(document.activeElement)};
},id);
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const [width,height,mobile,isBaseline] of [[1440,900,false,true],[1440,900,false,false],
      [390,844,true,false],[320,568,true,false],[844,390,true,false]]) {
      const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      if(isBaseline)await context.route('**/styles.css*',route=>route.fulfill({contentType:'text/css',body:baseline}));
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`${base}/?demo=1`);
      await page.waitForFunction(()=>typeof state!=='undefined'&&state.demo&&!el.libraryView.hidden);
      const nameButton=page.locator('.file-card-name-button').first();
      await nameButton.click();await settle(page);
      assert.equal(await page.locator('#fileNameDialog').evaluate(node=>node.open),true);
      await page.screenshot({path:path.join(out,`${isBaseline?'before':'after'}-${width}-filename-app.png`)});
      await calibrate(page);
      // Same actual dialog with a high-contrast background exposes the clipped shadow.
      await page.screenshot({path:path.join(out,`${isBaseline?'before':'after'}-${width}-filename-calibration.png`)});
      const filename=await measure(page,'fileNameDialog');
      assert.equal(filename.hostOverflow,isBaseline?'auto':'visible');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#fileNameDialog').evaluate(node=>node.open),false);
      if(isBaseline){rows.push({width,height,mobile,baseline:true,filename,errors});await context.close();continue;}
      const dialogs=[];
      for(const id of dialogIds){
        await page.evaluate(id=>{
          if(id==='fileNameDialog')el.fileNameText.textContent='20260711_2075994586854678528.mp4';
          document.getElementById(id).showModal();
        },id);await settle(page);
        const short=await measure(page,id);
        assert.equal(short.boxOverflow,'hidden',id);
        assert.equal(short.focusInside,true,id);
        assert.equal(short.horizontal,false,id);
        assert(short.box.y>=-1&&short.box.bottom<=height+1,id+' fits viewport');
        await page.screenshot({path:path.join(out,`${width}-${height}-${id}.png`)});
        // Force genuine body scrolling without changing the rounded shell or its header.
        await page.evaluate(id=>{
          const body=document.getElementById(id).querySelector('.dialog-content');
          const long=document.createElement('div');long.className='qa-long';
          long.style.cssText='height:1500px;flex:0 0 1500px';long.textContent='긴 내용 스크롤 검증';body.prepend(long);
          const end=document.createElement('button');end.className='secondary-button qa-end';end.type='button';
          end.textContent='검증 마지막 항목';end.style.flexShrink='0';body.append(end);
          end.focus();
        },id);
        const scroll=await page.evaluate(id=>{
          const host=document.getElementById(id),body=host.querySelector('.dialog-content'),end=host.querySelector('.qa-end');
          const b=body.getBoundingClientRect(),e=end.getBoundingClientRect();
          return {top:body.scrollTop,overflow:body.scrollHeight>body.clientHeight,
            endReachable:e.bottom<=b.bottom+1&&e.top>=b.top-1,headerVisible:host.querySelector('.dialog-top').getBoundingClientRect().top>=-1};
        },id);
        assert(scroll.top>0&&scroll.overflow&&scroll.endReachable&&scroll.headerVisible,id+' keeps body scroll and header');
        await page.locator(`#${id} .qa-end`).click();
        assert.equal(await page.locator(`#${id}`).evaluate(node=>node.open),true,'fixture end is not submit');
        await page.evaluate(id=>document.getElementById(id).querySelectorAll('.qa-long,.qa-end').forEach(node=>node.remove()),id);
        const close=page.locator(`#${id} .dialog-top button, #${id} #deleteCancelButton`).first();
        await close.click();assert.equal(await page.locator(`#${id}`).evaluate(node=>node.open),false,id+' close');
        dialogs.push({id,short,scroll,close:true});
      }
      await page.locator('#libraryOptions summary').click();await settle(page);
      const menu=await page.locator('.library-options-panel').boundingBox();
      assert(menu.x>=-1&&menu.x+menu.width<=width+1,'options menu fits');
      await page.screenshot({path:path.join(out,`${width}-${height}-library-menu.png`)});
      await page.keyboard.press('Escape');assert.equal(await page.locator('#libraryOptions').evaluate(node=>node.open),false);
      // Paint fixtures for the remaining inset menus, using their actual DOM/CSS.
      // Reparenting avoids the responsive control parents; no playback claim is made.
      const menuPaint=[];
      for(const selector of ['.speed-dropdown','.player-more-popover','.shorts-expand-row']){
        await page.evaluate(selector=>{
          const node=document.querySelector(selector);window.qaMenuParent=node.parentElement;window.qaMenuNext=node.nextSibling;
          document.body.append(node);node.hidden=false;
          node.style.cssText='display:grid;position:fixed;z-index:100;left:24px;right:auto;top:24px;bottom:auto;max-height:calc(100dvh - 48px)';
          node.querySelectorAll('button').forEach(button=>button.hidden=false);
        },selector);await settle(page);
        const r=await page.locator(selector).boundingBox();assert(r&&r.x+r.width<=width+1&&r.y+r.height<=height+1,selector);
        const button=page.locator(selector+' button').first();await button.focus();
        await page.screenshot({path:path.join(out,`${width}-${height}-${selector.slice(1)}.png`)});
        menuPaint.push({selector,rect:r});
        await page.evaluate(selector=>{
          const node=document.querySelector(selector);qaMenuParent.insertBefore(node,qaMenuNext);node.removeAttribute('style');
          if(selector==='.speed-dropdown')node.hidden=true;
        },selector);
      }
      assert.deepEqual(errors,[]);rows.push({width,height,mobile,filename,dialogs,menu,menuPaint,errors});await context.close();
    }
    fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({completed:true,hashes,rows,
      proof:'Isolated local Chrome paint + native dialog focus/close/scroll. Contrast calibration and menu reparenting are explicit paint fixtures. Mobile is emulation; no account/device/production claim.'},null,2));
    console.log(`Rounded surface audit passed: ${rows.length-1} candidate viewports, six dialogs and four menu surfaces each. Output: ${out}`);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{fs.writeFileSync(path.join(__dirname,'failure.json'),JSON.stringify({hashes,rows,error:error.stack},null,2));console.error(error);process.exitCode=1;});
