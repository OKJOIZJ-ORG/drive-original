'use strict';
// Read-only candidate delivery. Uses only a fresh browser context; no sign-in,
// account writes, production access, cache purge of an existing profile or deploy.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const guard=require('./delivery-guard.cjs'),{verifiedDownload}=require('./verified-download.cjs');
guard.assertSource();guard.requireDeployment();
const root=path.resolve(__dirname,'../..'),source=process.argv[2];
assert.equal(source,guard.SOURCE);
assert(/^[a-f0-9]{40}$/.test(source||''),'Full committed source SHA required');
const base='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/';
const git=file=>execFileSync('git',['show',`${source}:${file}`],{cwd:root,maxBuffer:12*1024*1024});
const publicModule={exports:null};
vm.runInNewContext(git('scripts/public-files.cjs').toString(),{module:publicModule},{timeout:1000});
const files=publicModule.exports,version=JSON.parse(git('version.json')).version;
assert(Array.isArray(files)&&files.length===new Set(files).size);
const shellLiteral=git('sw.js').toString().match(/const SHELL_FILES = (\[[\s\S]*?\]);/);
assert(shellLiteral,'Committed worker cache list required');
const cachedFiles=[...vm.runInNewContext(shellLiteral[1],{}, {timeout:1000})].filter(file=>file!=='./').map(file=>file.replace(/^\.\//,''));
assert(cachedFiles.every(file=>files.includes(file))&&new Set(cachedFiles).size===cachedFiles.length);
const outputName=process.argv[3]||'candidate-delivery';
assert(/^[a-z0-9][a-z0-9-]*$/.test(outputName),'Output must be a QA folder name');
const out=__dirname,priorBytes=fs.readFileSync(path.join(out,'results-first-partial.json')),prior=JSON.parse(priorBytes);
assert.equal(guard.sha(priorBytes),'9148bff5627c150c908f112aa80baf98a6ba88012e99dd00d68cfaf3e83a9394');
assert.equal(prior.source,source);assert.equal(prior.version,version);assert.equal(prior.base,base);
assert.equal(prior.passed,false);assert.equal(prior.assets.length,48);assert.equal(prior.privateRoutes.length,0);
prior.assets.forEach((row,i)=>{assert.equal(row.file,files[i]);assert.equal(row.gitEqual,true);assert.equal(row.bytes,git(row.file).length);});
const result={source,version,base,passed:false,assets:prior.assets.map(row=>({...row,reused:true})),privateRoutes:[],
  producerSha256:guard.sha(fs.readFileSync(__filename)),downloadProducerSha256:guard.sha(fs.readFileSync(path.join(out,'verified-download.cjs'))),
  reusedPublicPrefix:{path:'qa/candidate-rc35-delivery/results-first-partial.json',sha256:guard.sha(priorBytes),count:48,originalProducerSha256:guard.sha(git('qa/candidate-delivery-audit.cjs'))},
  scope:'Public delivery and fresh unauthenticated Chrome shell only; no actual Drive/media/device acceptance'};
let browser;
(async()=>{
  for(const file of [...files,'.nojekyll'].slice(prior.assets.length)){
    result.currentStep=`public:${file}`;
    const expected=file==='.nojekyll'?Buffer.alloc(0):git(file);
    let metrics;try{metrics=await verifiedDownload(base+file+'?verify='+Date.now(),expected);}
    catch(error){result.downloadFailure=error.delivery;throw error;}
    result.assets.push({file,...metrics,gitEqual:true});
    console.log(JSON.stringify({step:'verified-public',file,bytes:metrics.bytes,elapsedMs:metrics.elapsedMs}));
  }
  for(const file of ['memory/CHECKPOINT.md','qa/package.json','media/build.json','worker/index.mjs',
    'media/audio-codec-build.json','media/mediabunny-q1-build.json']){
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
    for(const file of cachedFiles){
      result.currentStep=`cache:${file}`;
      const bytes=await page.evaluate(async({file,version})=>{
        const cache=await caches.open(`drive-original-shell-${version}`),response=await cache.match(new URL(file,location.href));
        return response?Array.from(new Uint8Array(await response.arrayBuffer())):null;
      },{file,version});
      assert(bytes&&Buffer.from(bytes).equals(git(file)),`Cached Git mismatch: ${file}`);
      result.cached.push({file,gitEqual:true});
    }
    result.uncachedSourceDownloads=[];
    for(const file of files.filter(file=>/\.tgz$|\.tar\.gz\.part\d+$/.test(file))){
      const present=await page.evaluate(async({file,version})=>{
        const cache=await caches.open(`drive-original-shell-${version}`);
        return Boolean(await cache.match(new URL(file,location.href)));
      },{file,version});
      assert.equal(present,false,`Source archive must not inflate offline cache: ${file}`);
      result.uncachedSourceDownloads.push({file,cached:false});
    }
    result.currentStep='offline-shell';
    await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(expected=>typeof APP_VERSION!=='undefined'&&APP_VERSION===expected&&navigator.serviceWorker.controller,version);
    result.offline={version:await page.evaluate(()=>APP_VERSION),controlled:true};
    assert.deepEqual(errors,[]);guard.assertSource();result.pageErrors=0;result.passed=true;delete result.currentStep;
  }finally{await context.close();}
})().catch(error=>{result.error=String(error.message).replaceAll(root,'[workspace]');process.exitCode=1;})
  .finally(async()=>{await browser?.close();result.recordedAt=new Date().toISOString();
    fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({passed:result.passed,version,assets:result.assets.length,cached:result.cached?.length,currentStep:result.currentStep,error:result.error}));});
