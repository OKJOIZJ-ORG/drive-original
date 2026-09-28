'use strict';
// Read-only app-wide audit: anonymous local DOM and synthetic library only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {AxeBuilder}=require('@axe-core/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,process.env.AUDIT_PHASE||'audit');
const producerHash=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
fs.mkdirSync(out,{recursive:true});
const files=['app.js','styles.css','index.html'];
const hashes=Object.fromEntries(files.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex')]));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',p=path.resolve(root,name);
 if(!p.startsWith(root+path.sep)||/(?:qa|memory|worker|node_modules)\//.test(name)||!mime[path.extname(p)]||!fs.existsSync(p))return res.writeHead(404).end();
 res.writeHead(200,{'Content-Type':mime[path.extname(p)],'Cache-Control':'no-store'});res.end(fs.readFileSync(p));
});
async function snapshot(page,name){
 await page.waitForTimeout(100);
 const geometry=await page.evaluate(()=>({
  viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,focus:document.activeElement?.id,
  overflow:[...document.querySelectorAll('button,input,select,dialog,[role="slider"]')].filter(n=>{
   const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width&&r.height&&s.visibility!=='hidden'&&!n.closest('[hidden]')&&!n.closest('[inert]')&&(r.left<-1||r.right>innerWidth+1);
  }).map(n=>({id:n.id,label:n.getAttribute('aria-label')||n.textContent.trim().slice(0,60),rect:n.getBoundingClientRect().toJSON()}))
 }));
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
 await page.screenshot({path:path.join(out,name+'.png'),fullPage:false});
 return{name,geometry,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:axe.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))};
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'chrome',headless:true});const rows=[];
 try{
  if(process.argv.includes('--probe')){
   const probes=[];
   for(const [width,height] of [[390,844],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const page=await context.newPage();await page.goto(base+'/?demo=1');await page.waitForFunction(()=>!el.libraryView.hidden&&state.files.length>0);
    await page.locator('#selectionModeButton').click();await page.locator('.file-card-open').first().click();
    await page.locator('#selectionMoveBtn').click();await page.waitForFunction(()=>el.moveDialog.open&&el.moveFolderList.querySelectorAll('.move-folder-row').length>1);
    const geometry=await page.evaluate(()=>Object.fromEntries(['moveFileName','moveFolderList'].map(id=>{const n=document.getElementById(id);return[id,{rect:n.getBoundingClientRect().toJSON(),clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,flexShrink:getComputedStyle(n).flexShrink,text:n.textContent}];})));
    await page.keyboard.press('Escape');await page.locator('#selectionCancelBtn').click();await page.waitForTimeout(150);
    const focus=await page.evaluate(()=>({id:document.activeElement?.id,hidden:document.activeElement?.closest('[hidden]')?.id||null}));
    await page.keyboard.press('Tab');const nextFocus=await page.evaluate(()=>document.activeElement?.id);
    probes.push({width,height,geometry,focusAfter150ms:focus,nextFocus});await context.close();
   }
   fs.writeFileSync(path.join(out,'probe.json'),JSON.stringify({hashes,probes},null,2));console.log(JSON.stringify(probes));return;
  }
  for(const [width,height,mobile] of [[1280,800,false],[390,844,true],[320,568,true],[844,390,true]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/?demo=1');await page.waitForFunction(()=>!el.libraryView.hidden&&state.files.length>0);
   const row={width,height,mobile,scenes:[],errors};
   row.scenes.push(await snapshot(page,`${width}x${height}-library`));
   await page.locator('#searchInput').fill('absent-public-fixture-999');await page.waitForTimeout(350);
   row.scenes.push(await snapshot(page,`${width}x${height}-empty`));
   await page.locator('#searchInput').fill('');await page.waitForTimeout(350);
   await page.locator('#selectionModeButton').click();await page.locator('.file-card-open').first().click();
   row.selection=await page.evaluate(()=>({mode:state.selectionMode,selected:state.selectedFileIds.size,focus:document.activeElement?.id,cardPressed:el.fileGrid.querySelector('.file-card-open').getAttribute('aria-pressed')}));
   row.scenes.push(await snapshot(page,`${width}x${height}-selection`));
   await page.locator('#selectionDeleteBtn').click();await page.locator('#deleteDialog').waitFor({state:'visible'});
   row.scenes.push(await snapshot(page,`${width}x${height}-delete`));
   await page.keyboard.press('Escape');row.deleteReturnFocus=await page.evaluate(()=>document.activeElement?.id);
   await page.locator('#selectionMoveBtn').click();await page.waitForFunction(()=>el.moveDialog.open&&el.moveFolderList.querySelectorAll('.move-folder-row').length>1);
   row.scenes.push(await snapshot(page,`${width}x${height}-move`));
   const option=page.locator('.move-folder-row:not([disabled])').first();await option.focus();
   const before=await page.evaluate(()=>document.activeElement.textContent);await page.keyboard.press('ArrowDown');
   row.moveKeyboard={before,after:await page.evaluate(()=>document.activeElement.textContent)};
   await page.keyboard.press('Space');
   row.moveSelection=await page.evaluate(()=>({target:state.moveTargetFolderId,selected:[...el.moveFolderList.querySelectorAll('.selected')].map(n=>({text:n.textContent,ariaSelected:n.getAttribute('aria-selected'),ariaPressed:n.getAttribute('aria-pressed')}))}));
   if(process.env.AUDIT_PHASE==='after'){
    assert.equal(row.moveSelection.selected[0].ariaPressed,'true');
    await page.keyboard.press('Tab');await page.keyboard.press('Enter');
    assert.equal(await page.locator('#moveFolderList [aria-pressed="true"]').count(),1);
    await page.locator('#moveSearchInput').fill('여행');await page.waitForTimeout(100);
    assert.equal(await page.locator('#moveFolderList [aria-pressed="true"]').count(),1);
   }
   await page.locator('#moveSearchInput').fill('absent-folder-999');row.scenes.push(await snapshot(page,`${width}x${height}-move-empty`));
   await page.keyboard.press('Escape');
   if(await page.evaluate(()=>el.moveDialog.open))await page.keyboard.press('Escape');
   row.moveReturnFocus=await page.evaluate(()=>document.activeElement?.id);
   await page.locator('#selectionCancelBtn').click();row.selectionExitFocus=await page.evaluate(()=>({id:document.activeElement?.id,hidden:document.activeElement?.closest('[hidden]')?.id||null}));
   if(process.env.AUDIT_PHASE==='after'){
    assert.equal(row.selectionExitFocus.id,'selectionModeButton');
    await page.evaluate(()=>{enterSelectionMode();el.searchInput.focus();exitSelectionMode();});
    assert.equal(await page.evaluate(()=>document.activeElement.id),'searchInput');
   }
   await page.locator('#settingsButton').click();row.scenes.push(await snapshot(page,`${width}x${height}-settings`));
   const focus=[];for(let i=0;i<8;i++){await page.keyboard.press('Tab');focus.push(await page.evaluate(()=>({id:document.activeElement?.id,inside:el.settingsDialog.contains(document.activeElement)})));}
   row.settingsTab=focus;await page.keyboard.press('Escape');row.settingsReturnFocus=await page.evaluate(()=>document.activeElement?.id);
   await page.evaluate(()=>{el.permissionDialog.showModal();});row.scenes.push(await snapshot(page,`${width}x${height}-permission`));
   await page.keyboard.press('Escape');
   // Stress long authored labels without changing data ownership or making API calls.
   await page.evaluate(()=>{state.files=state.files.map((f,i)=>({...f,name:i===0?'PublicVeryLongUnbrokenName'.repeat(8):f.name}));renderFiles({resetWindow:true});});
   row.scenes.push(await snapshot(page,`${width}x${height}-long-name`));
   if(process.env.AUDIT_PHASE==='after'){
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#selectionModeButton').click();await page.locator('.file-card-open').first().click();
    await page.locator('#selectionDeleteBtn').click();row.scenes.push(await snapshot(page,`${width}x${height}-long-delete-reduced`));
    await page.locator('#deleteCancelButton').focus();
    assert.ok(await page.locator('#deleteCancelButton').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
    await page.keyboard.press('Escape');await page.locator('#selectionMoveBtn').click();
    row.scenes.push(await snapshot(page,`${width}x${height}-long-move-reduced`));
    await page.locator('#moveCancelButton').focus();
    assert.ok(await page.locator('#moveCancelButton').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
   }
   rows.push(row);await context.close();
   console.log(JSON.stringify({width,height,violations:row.scenes.flatMap(s=>s.violations.map(v=>s.name+':'+v.id)),overflow:row.scenes.filter(s=>s.geometry.overflow.length).map(s=>s.name),errors}));
  }
  const endHashes=Object.fromEntries(files.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex')]));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({producerHash,hashes,endHashes,accountUsed:false,physicalDevice:false,rows},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
