'use strict';
// Read-only production verification: public Git bytes and isolated demo profiles.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const AxeBuilder=require('@axe-core/playwright').default;
const root=path.resolve(__dirname,'..');
const source=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(source||''))throw new Error('Pass the complete committed source SHA.');
const gitFile=f=>execFileSync('git',['show',`${source}:${f}`],{cwd:root,maxBuffer:2000000});
const version=JSON.parse(gitFile('version.json')).version;
const base='https://okjoizj-org.github.io/drive-original/';
const out=path.join(__dirname,`release-${version}-production`);fs.mkdirSync(out,{recursive:true});
const files=['index.html','app.js','styles.css','sw.js','version.json','manifest.webmanifest',
  'icons/app-icon.svg','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'];
const result={source,version,base,verifiedAt:null,assets:[],privateRoutes:[],browser:[],physicalDevice:false};
let browser;
(async()=>{
  let available=false;
  for(let attempt=0;attempt<12;attempt++){
    const r=await fetch(base+'version.json?verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(r.ok&&(await r.json()).version===version){available=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10000));
  }
  assert(available,'the expected version did not become available');
  for(const f of files){
    const r=await fetch(base+f+'?verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    assert.equal(r.status,200,f);
    const bytes=Buffer.from(await r.arrayBuffer());assert(bytes.equals(gitFile(f)),`public byte mismatch: ${f}`);
    result.assets.push({file:f,status:r.status,bytes:bytes.length,gitEqual:true});
  }
  for(const f of ['memory/DECISIONS.md','tests/app.test.js','qa/package.json']){
    const r=await fetch(base+f+'?verify='+Date.now(),{signal:AbortSignal.timeout(15000)});
    assert.equal(r.status,404,`internal route exposed: ${f}`);result.privateRoutes.push({file:f,status:r.status});
  }
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
    const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600});
    try{
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(base+'?demo=1',{waitUntil:'networkidle'});
      await page.waitForFunction(v=>APP_VERSION===v&&state.demo&&!state.loadingFiles&&navigator.serviceWorker.controller,version);
      const folder=await page.evaluate(()=>state.currentFolderId);
      await page.evaluate(()=>openPlayer(state.files.find(f=>f.mimeType?.startsWith('image/'))));
      await page.waitForFunction(()=>!el.playerSheet.hidden&&el.imageViewer.complete&&el.imageViewer.naturalWidth>0);
      assert.equal(await page.evaluate(()=>playerChrome.inert),true);
      if(viewport.width<600)await page.touchscreen.tap(viewport.width/2,viewport.height-3);
      else await page.mouse.move(viewport.width/2,viewport.height-3);
      assert.equal(await page.evaluate(()=>playerChrome.inert),false);
      await page.waitForTimeout(250);
      const violations=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations;
      assert.deepEqual(violations.map(v=>v.id),[]);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(out,`${viewport.width}-controls.png`)});
      await page.goBack();await page.waitForFunction(()=>el.playerSheet.hidden);
      assert.equal(await page.evaluate(()=>state.currentFolderId),folder);
      assert.deepEqual(errors,[]);
      result.browser.push({viewport,mode:'isolated demo, no actual Google account',bottomControls:true,playerOnlyBack:true,axe:0,errors});
    }finally{await context.close();}
  }
  result.verifiedAt=new Date().toISOString();
  console.log(JSON.stringify(result));
})().catch(error=>{result.error=error.message;console.error(error);process.exitCode=1;})
  .finally(async()=>{await browser?.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));});
