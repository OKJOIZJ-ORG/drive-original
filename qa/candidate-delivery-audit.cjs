'use strict';
// Read-only candidate delivery. Uses only a fresh browser context; no sign-in,
// account writes, production access, cache purge of an existing profile or deploy.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),source=process.argv[2];
assert(/^[a-f0-9]{40}$/.test(source||''),'Full committed source SHA required');
const base='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/';
const git=file=>execFileSync('git',['show',`${source}:${file}`],{cwd:root,maxBuffer:5e6});
const files=require('../scripts/public-files.cjs'),version=JSON.parse(git('version.json')).version;
const out=path.join(__dirname,'candidate-delivery'),result={source,version,base,passed:false,assets:[],privateRoutes:[],
  scope:'Public delivery and fresh unauthenticated Chrome shell only; no actual Drive/media/device acceptance'};
let browser;
(async()=>{
  for(const file of [...files,'.nojekyll']){
    result.currentStep=`public:${file}`;
    const response=await fetch(`${base}${file}?verify=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,200,file);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert(bytes.equals(file==='.nojekyll'?Buffer.alloc(0):git(file)),`Git byte mismatch: ${file}`);
    result.assets.push({file,bytes:bytes.length,gitEqual:true});
  }
  for(const file of ['memory/CHECKPOINT.md','qa/package.json','media/build.json','worker/index.mjs']){
    result.currentStep=`private-route:${file}`;
    const response=await fetch(base+file,{signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,404,file);result.privateRoutes.push({file,status:404});
  }
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  try{
    page.on('pageerror',()=>errors.push('PAGE_ERROR'));
    result.currentStep='cold-shell';
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(expected=>typeof APP_VERSION!=='undefined'&&APP_VERSION===expected&&navigator.serviceWorker.controller,version,{timeout:45000});
    result.cold=await page.evaluate(async()=>({version:APP_VERSION,controlled:Boolean(navigator.serviceWorker.controller),
      accountPresent:Boolean(state.authAccountKey),candidate:globalThis.__DRIVE_ORIGINAL_RUNTIME__?.candidate,
      writes:DRIVE_MUTATIONS_ENABLED,shells:(await caches.keys()).filter(key=>key.startsWith('drive-original-shell-'))}));
    assert.equal(result.cold.candidate,true);assert.equal(result.cold.writes,false);assert.equal(result.cold.accountPresent,false);
    assert.deepEqual(result.cold.shells,[`drive-original-shell-${version}`]);
    result.cached=[];
    // The browser owns the SW script/update cache; it is not a shell entry.
    for(const file of files.filter(file=>file!=='sw.js')){
      result.currentStep=`cache:${file}`;
      const bytes=await page.evaluate(async({file,version})=>{
        const cache=await caches.open(`drive-original-shell-${version}`),response=await cache.match(new URL(file,location.href));
        return response?Array.from(new Uint8Array(await response.arrayBuffer())):null;
      },{file,version});
      assert(bytes&&Buffer.from(bytes).equals(git(file)),`Cached Git mismatch: ${file}`);
      result.cached.push({file,gitEqual:true});
    }
    result.currentStep='offline-shell';
    await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(expected=>typeof APP_VERSION!=='undefined'&&APP_VERSION===expected&&navigator.serviceWorker.controller,version);
    result.offline={version:await page.evaluate(()=>APP_VERSION),controlled:true};
    assert.deepEqual(errors,[]);result.pageErrors=0;result.passed=true;delete result.currentStep;
  }finally{await context.close();}
})().catch(error=>{result.error=String(error.message).replaceAll(root,'[workspace]');process.exitCode=1;})
  .finally(async()=>{await browser?.close();result.recordedAt=new Date().toISOString();
    fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({passed:result.passed,version,assets:result.assets.length,cached:result.cached?.length,currentStep:result.currentStep,error:result.error}));});
