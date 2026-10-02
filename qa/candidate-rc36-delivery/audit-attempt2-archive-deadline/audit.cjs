'use strict';
// Prepared read-only shell audit: fresh anonymous headless context, never a shared profile.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const guard=require('./delivery-guard.cjs'),{verifiedDownload}=require('./verified-download.cjs');
const mode=process.argv[2];
if(!['--prepare','--execute'].includes(mode)||process.argv.length!==3)throw Error('AUDIT_MODE_REQUIRED');
const destination=name=>path.join(__dirname,name),write=(name,value)=>fs.writeFileSync(destination(name),JSON.stringify(value,null,2)+'\n');
const safeError=error=>/^[A-Z0-9_]+$/.test(error.message)?error.message:error.code||'DELIVERY_AUDIT_FAILED';
const producerFiles=['audit.cjs','delivery-guard.cjs','verified-download.cjs','delivery.cjs','build-release.py'];
function prepare(){
 const inputs=guard.assertSource();
 for(const file of producerFiles.filter(file=>file.endsWith('.cjs')))cp.execFileSync(process.execPath,['--check',destination(file)],{windowsHide:true,timeout:15000});
 const memory=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true,timeout:15000}));
 assert(memory.FreePhysicalMemory>1048576&&memory.FreeVirtualMemory>1572864,'NEW_CHROME_MEMORY_FLOOR');
 const playwrightPath=require.resolve('playwright/package.json');require('playwright');
 const executablePath=[process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA].filter(Boolean).map(dir=>path.join(dir,'Google/Chrome/Application/chrome.exe')).find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());assert(executablePath,'HEADLESS_CHROME_EXECUTABLE_REQUIRED');
 const preparation={...inputs,passed:true,memory:{freePhysicalKiB:memory.FreePhysicalMemory,freeVirtualKiB:memory.FreeVirtualMemory,physicalFloorKiBExclusive:1048576,virtualFloorKiBExclusive:1572864},browser:{dependencyPath:playwrightPath,executablePath,channel:'chrome',headless:true,freshAnonymousContext:true,persistentProfile:false,launchPerformed:false},inputs:producerFiles.map(file=>({file,sha256:guard.sha(fs.readFileSync(destination(file)))})),downloadBudgets:{largeArchiveTotalMs:240000,ordinaryTotalMs:120000,noProgressMs:15000,readerCleanupMs:5000},scope:'Preparation only; no live fetch/browser/device/account/deployment action',recordedAt:new Date().toISOString()};
 return preparation;
}
async function bounded(promise,ms,code){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(code)),ms);})]);}finally{clearTimeout(timer);}}
async function execute(){
 if(fs.existsSync(destination('results.json'))||fs.existsSync(destination('audit-progress.json'))||fs.existsSync(destination('audit-failure.json')))throw Error('RETAINED_AUDIT_ATTEMPT_NO_AUTOMATIC_RETRY');
 const result={source:guard.SOURCE,version:guard.VERSION,base:guard.BASE,passed:false,assets:[],privateRoutes:[],cached:[],uncachedSourceDownloads:[],producerSha256:guard.sha(fs.readFileSync(__filename)),downloadProducerSha256:guard.sha(fs.readFileSync(destination('verified-download.cjs'))),scope:'Same-candidate public delivery and fresh anonymous shell only; no account/media/device/whole-format/color/HDR acceptance'};
 // Durable failure/result/cleanup state exists before launch or the first remote request.
 guard.save('results.json',result);
 let browser,context,heartbeat,allChecksPassed=false;const started=Date.now();
 const cleanup={contextClosed:true,browserClosed:true,heartbeatCleared:false,downloadsSettled:true,passed:false};
 function checkpoint(step){if(step)result.currentStep=step;result.recordedAt=new Date().toISOString();write('results.json',result);const progress={source:guard.SOURCE,step:result.currentStep,verified:result.assets.length,cached:result.cached.length,elapsedMs:Date.now()-started,recordedAt:result.recordedAt};write('audit-progress.json',progress);console.log(JSON.stringify(progress));}
 try{
  const preparation=prepare(),deployment=guard.requireDeployment(),site=guard.verifySite();
  result.preparation=preparation;result.workerVersion=deployment.workerVersion;result.inputAssets=site;
  checkpoint('prepared');heartbeat=setInterval(()=>checkpoint(),10000);
  for(const file of [...guard.files,'.nojekyll']){
   checkpoint('public:'+file);const expected=file==='.nojekyll'?Buffer.alloc(0):guard.blob(file);
   let metrics;try{metrics=await verifiedDownload(guard.BASE+file+'?verify='+Date.now(),expected,{totalMs:expected.length>=8388608?240000:120000,progressMs:15000});}
   catch(error){result.downloadFailure=error.delivery;if(error.delivery?.cleanup)cleanup.downloadsSettled=false;throw error;}
   result.assets.push({file,...metrics,sha256:guard.sha(expected),gitEqual:true});checkpoint('verified:'+file);
  }
  for(const file of ['memory/CHECKPOINT.md','qa/package.json','media/build.json','worker/index.mjs','media/audio-codec-build.json','media/mediabunny-q1-build.json']){
   checkpoint('private-route:'+file);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let response;
   try{response=await fetch(guard.BASE+file,{signal:controller.signal,cache:'no-store'});assert.equal(response.status,404);result.privateRoutes.push({file,status:404});}
   finally{controller.abort();clearTimeout(timer);if(response?.body)await bounded(response.body.cancel(),5000,'PRIVATE_RESPONSE_CLEANUP_UNSETTLED');}
  }
  checkpoint('fresh-browser-launch');browser=await require('playwright').chromium.launch({executablePath:preparation.browser.executablePath,headless:true,timeout:45000});cleanup.browserClosed=false;
  context=await browser.newContext();cleanup.contextClosed=false;const page=await context.newPage();page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(45000);let pageErrors=0;page.on('pageerror',()=>pageErrors++);
  checkpoint('cold-shell');await page.goto(guard.BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(expected=>typeof APP_VERSION!=='undefined'&&APP_VERSION===expected&&navigator.serviceWorker.controller,guard.VERSION);
  result.cold=await page.evaluate(async()=>({version:APP_VERSION,controlled:Boolean(navigator.serviceWorker.controller),accountPresent:Boolean(state.authAccountKey),candidate:globalThis.__DRIVE_ORIGINAL_RUNTIME__?.candidate,accountStateWritesEnabled:globalThis.__DRIVE_ORIGINAL_RUNTIME__?.accountStateWritesEnabled,writes:DRIVE_MUTATIONS_ENABLED,shells:(await caches.keys()).filter(key=>key.startsWith('drive-original-shell-'))}));
  assert.equal(result.cold.candidate,true);assert.equal(result.cold.writes,false);assert.equal(result.cold.accountPresent,false);assert.equal(result.cold.accountStateWritesEnabled,true);assert.deepEqual(result.cold.shells,[`drive-original-shell-${guard.VERSION}`]);
  async function cachedBytes(file){return bounded(page.evaluate(async({file,version})=>{const cache=await caches.open(`drive-original-shell-${version}`),response=await cache.match(new URL(file,location.href));return response?Array.from(new Uint8Array(await response.arrayBuffer())):null;},{file,version:guard.VERSION}),45000,'CACHE_READ_DEADLINE');}
  for(const file of guard.shellFiles()){checkpoint('cache:'+file);const bytes=await cachedBytes(file);assert(bytes&&Buffer.from(bytes).equals(guard.blob(file)));result.cached.push({file,sha256:guard.sha(Buffer.from(bytes)),gitEqual:true});}
  const alias=await cachedBytes('./');assert(alias&&Buffer.from(alias).equals(guard.blob('index.html')));result.rootCacheAlias={file:'./',gitEqual:true,sha256:guard.sha(Buffer.from(alias))};
  for(const file of guard.files.filter(file=>/\.tgz$|\.tar\.gz\.part\d+$/.test(file))){assert.equal(await cachedBytes(file),null);result.uncachedSourceDownloads.push({file,cached:false});}
  checkpoint('offline-shell');await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(expected=>typeof APP_VERSION!=='undefined'&&APP_VERSION===expected&&navigator.serviceWorker.controller,guard.VERSION);
  result.offline=await page.evaluate(()=>({version:APP_VERSION,controlled:Boolean(navigator.serviceWorker.controller),accountPresent:Boolean(state.authAccountKey),writes:DRIVE_MUTATIONS_ENABLED}));
  assert.equal(result.offline.accountPresent,false);assert.equal(result.offline.writes,false);assert.equal(pageErrors,0);result.pageErrors=pageErrors;
  guard.assertSource();assert.deepEqual(guard.verifySite(),site);assert.deepEqual(preparation.inputs,producerFiles.map(file=>({file,sha256:guard.sha(fs.readFileSync(destination(file)))})));allChecksPassed=true;
 }catch(error){result.error=safeError(error);if(error.delivery)result.downloadFailure=error.delivery;process.exitCode=1;}
 finally{
  clearInterval(heartbeat);cleanup.heartbeatCleared=true;
  if(context)try{await bounded(context.close(),10000,'CONTEXT_CLOSE_DEADLINE');cleanup.contextClosed=true;}catch{cleanup.contextCloseError=true;}
  if(browser)try{await bounded(browser.close(),10000,'BROWSER_CLOSE_DEADLINE');cleanup.browserClosed=true;}catch{cleanup.browserCloseError=true;}
  cleanup.passed=cleanup.contextClosed&&cleanup.browserClosed&&cleanup.heartbeatCleared&&cleanup.downloadsSettled;result.cleanup=cleanup;result.passed=allChecksPassed&&cleanup.passed;result.elapsedMs=Date.now()-started;if(!result.passed){process.exitCode=1;guard.save('audit-failure.json',{source:guard.SOURCE,error:result.error||'AUDIT_CLEANUP_FAILED',cleanup,noAutomaticRetry:true,recordedAt:new Date().toISOString()});}checkpoint(result.passed?'complete':'failed');
  console.log(JSON.stringify({passed:result.passed,source:guard.SOURCE,assets:result.assets.length,cache:result.cached.length,cleanup:cleanup.passed,error:result.error}));
 }
}
async function main(){if(mode==='--prepare'){const record=prepare();guard.save('audit-preparation.json',record);console.log(JSON.stringify({...guard.assertSource(),prepared:true,externalActionPerformed:false}));}else await execute();}
main().catch(error=>{const record={source:guard.SOURCE,passed:false,error:safeError(error),noAutomaticRetry:true,recordedAt:new Date().toISOString()};try{guard.save(mode==='--prepare'?'preparation-failure.json':'audit-failure.json',record);}catch{}console.error(JSON.stringify(record));process.exitCode=1;});
