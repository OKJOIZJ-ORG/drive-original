'use strict';
// Isolated profile and localhost only: upgrade the actual v1.20.0 Git shell
// to the current source, using the app's real update action and offline cache.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const out=path.join(__dirname,'release-'+JSON.parse(fs.readFileSync(path.join(root,'version.json'))).version+'-upgrade');
fs.mkdirSync(out,{recursive:true});
const files=['index.html','app.js','styles.css','sw.js','version.json','manifest.webmanifest',
  'icons/app-icon.svg','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'];
const old=new Map(files.map(f=>[f,execFileSync('git',['show','70ff332:'+f],{cwd:root,maxBuffer:2000000})]));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
let current=false,browser;
const server=http.createServer((req,res)=>{
  const f=new URL(req.url,'http://localhost').pathname.replace(/^\/drive-original\//,'')||'index.html';
  if(!old.has(f)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(f)],'Cache-Control':'no-store'});
  res.end(current?fs.readFileSync(path.join(root,f)):old.get(f));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext();
    await context.route('**/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:'/* no Google authentication in upgrade fixture */'}));
    const page=await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/drive-original/`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>APP_VERSION==='1.20.0'&&navigator.serviceWorker.controller);
    await page.evaluate(async()=>{
      localStorage.setItem('qa-preserved-setting','yes');
      await caches.open('unrelated-fixture-cache');
    });
    assert((await page.evaluate(()=>caches.keys())).includes('drive-original-shell-1.20.0'));
    current=true;
    await page.evaluate(()=>{void applyAppUpdate();});
    const expected=JSON.parse(fs.readFileSync(path.join(root,'version.json'))).version;
    await page.waitForFunction(v=>APP_VERSION===v&&navigator.serviceWorker.controller,expected,{timeout:25000});
    const upgraded=await page.evaluate(async()=>({version:APP_VERSION,cache:await caches.keys(),setting:localStorage.getItem('qa-preserved-setting')}));
    assert.equal(upgraded.setting,'yes');
    assert(upgraded.cache.includes('unrelated-fixture-cache'));
    assert(upgraded.cache.includes('drive-original-shell-'+expected));
    assert(!upgraded.cache.includes('drive-original-shell-1.20.0'));
    await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(v=>APP_VERSION===v,expected);
    const result={status:'passed',from:'1.20.0',to:expected,upgraded,offlineReload:true,realPwaInstallation:false};
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
    await context.close();
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
