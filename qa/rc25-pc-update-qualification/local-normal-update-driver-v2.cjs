'use strict';
// Distinct normal banner24→25 mechanism; native local Chrome, no routes/provider/account.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{start}=require('./normal-update-server.cjs');
const here=__dirname,root=path.resolve(here,'../..'),out=path.join(here,'local-normal-update-v2-results.json');
assert(!fs.existsSync(out),'Preserve prior driver result; choose a new named producer before another run');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),read=n=>fs.readFileSync(path.join(here,n));
const report={schema:'drive-original.local-normal-update-native/1',passed:false,producerSha256:hash(fs.readFileSync(__filename)),
 sources:['8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7','7ba8e654fa38def8c8e00efcbf1600a4c8730c53'],
 scope:'Fresh native Windows Chrome anonymous local normal settings/check/banner24→25 only; no actual signed-in failure resolution/account/media/device/production proof',
 governed:Object.fromEntries(['normal-update-server.cjs','normal-update-journal-init.js','normal-update-ready-24.function.js','normal-update-ready-25.function.js','normal-update-switch.function.js'].map(n=>[n,hash(read(n))])),
 originalNormalPCFailureSHA256:hash(read('normal-update-v1-result.json')),routesInstalled:false,externalProvider:false,syntheticAccount:false,pageErrors:[],consoleCounts:{csp:0,otherErrors:0},stages:[]};
let browser,context,page,server;
const stage=name=>{report.stages.push({name,at:new Date().toISOString()});report.currentStage=name;};
const bounded=(promise,ms,code)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(code)),ms))]).finally(()=>clearTimeout(timer));};
const evaluateFunction=async(name,timeout=45000)=>bounded(page.evaluate("("+read(name).toString()+")()"),timeout,'READINESS_45S_TIMEOUT');
(async()=>{
 stage('local-server-start');const existing=path.join(here,'normal-update-server-result.json'),backup=path.join(here,'normal-update-server-prior-mcp-result.json');
 if(fs.existsSync(existing)&&!fs.existsSync(backup))fs.copyFileSync(existing,backup);
 server=await start();report.serverBefore=server.status();
 // Exact unchanged floors, sampled immediately before native Chrome launch; no device probe.
 stage('immediate-memory-guard');const p=spawnSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(p.status,0);const m=JSON.parse(p.stdout);report.memory={freePhysicalKiB:m.FreePhysicalMemory,freeVirtualKiB:m.FreeVirtualMemory,physicalFloorKiBExclusive:1048576,virtualFloorKiBExclusive:1572864,
   passed:m.FreePhysicalMemory>1048576&&m.FreeVirtualMemory>1572864};
 if(!report.memory.passed)throw Error('NEW_CHROME_MEMORY_FLOOR');
 stage('native-Chrome-launch');const {chromium}=require('../node_modules/playwright');browser=await chromium.launch({channel:'chrome',headless:true});report.browserVersion=browser.version();
 context=await browser.newContext();await context.addInitScript({path:path.join(here,'normal-update-journal-init.js')});page=await context.newPage();
 page.on('pageerror',e=>report.pageErrors.push(['TypeError','ReferenceError','SyntaxError','RangeError'].includes(e.name)?e.name:'PAGE_ERROR'));
 page.on('console',message=>{if(message.type()!=='error')return;if(/Content Security Policy|content security policy|violates.*directive|Refused to load/i.test(message.text()))report.consoleCounts.csp++;else report.consoleCounts.otherErrors++;});
 stage('initial24-native-source-cache-qualification');await page.goto(server.origin,{waitUntil:'domcontentloaded',timeout:45000});report.initial24=await evaluateFunction('normal-update-ready-24.function.js');assert(report.initial24.passed,'INITIAL24_READINESS_REQUIRED');
 await page.waitForFunction(()=>updateCheckGeneration>0&&el.updateBanner.hidden,null,{timeout:15000});
 stage('single-fixed-server-switch25');report.switch=await evaluateFunction('normal-update-switch.function.js',5000);assert(report.switch.switched);
 stage('trusted-normal-settings-check');await page.locator('#settingsButton').click();await page.locator('#checkUpdateButton').click();
 await page.waitForFunction(()=>APP_VERSION==='1.22.0-rc.24'&&el.updateBanner.hidden===false&&navigator.serviceWorker.controller?.state==='activated'
  &&state.serviceWorkerRegistration?.active===navigator.serviceWorker.controller&&!state.serviceWorkerRegistration.installing&&!state.serviceWorkerRegistration.waiting,null,{timeout:45000});
 report.beforeBanner=await page.evaluate(async()=>({version:APP_VERSION,anonymous:!state.authAccountKey,playerClosed:!state.selected&&!q0Playback&&!q1Playback,
   controlled:Boolean(navigator.serviceWorker.controller),activeMatchesController:state.serviceWorkerRegistration.active===navigator.serviceWorker.controller,
   shells:(await caches.keys()).filter(k=>k.startsWith('drive-original-shell-')),journal:window.__normalUpdateJournal.read()}));
 assert.deepEqual(report.beforeBanner.shells,['drive-original-shell-1.22.0-rc.25'],'NEW25_ACTIVATED_BEFORE_BANNER');
 await page.locator('#settingsDialog button[aria-label="설정 닫기"]').click();
 stage('one-trusted-banner-update');const started=Date.now();await bounded(Promise.all([page.waitForURL(url=>url.searchParams.has('_update'),{waitUntil:'domcontentloaded',timeout:45000}),page.locator('#bannerUpdateButton').click()]),45000,'BANNER_NAVIGATION_45S_TIMEOUT');
 stage('post-normal-update25-readiness');const remaining=45000-(Date.now()-started);if(remaining<=0)throw Error('POST_UPDATE_45S_TIMEOUT');
 report.final25=await evaluateFunction('normal-update-ready-25.function.js',remaining);report.bannerToFinalMs=Date.now()-started;
 assert(report.final25.passed,'NORMAL_UPDATE_FINAL_READINESS_FAILED');assert(report.final25.journal.ordinal>=2,'PERSISTENT_INIT_REQUIRED');
 assert(report.final25.journal.rows.filter(r=>r.stage==='trusted-banner-update-click').length===1,'ONE_TRUSTED_BANNER_CLICK');
 assert(report.final25.journal.rows.some(r=>r.stage==='trusted-normal-version-check-click'),'NORMAL_UI_CHECK_REQUIRED');
 assert.deepEqual(report.pageErrors,[],'NATIVE_PAGE_ERRORS');report.passed=true;delete report.currentStage;
})().catch(async error=>{
 report.failure={code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'LOCAL_DRIVER_FAILED',name:error.name};
 if(page)report.failureSnapshot=await page.evaluate(async()=>({version:typeof APP_VERSION==='undefined'?null:APP_VERSION,
   controller:Boolean(navigator.serviceWorker.controller),registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({active:r.active?.state??null,installing:Boolean(r.installing),waiting:Boolean(r.waiting)})),
   shells:(await caches.keys()).filter(k=>k.startsWith('drive-original-shell-')),anonymous:typeof state!=='undefined'&&!state.authAccountKey,
   journal:window.__normalUpdateJournal?.read?.()})).catch(()=>({snapshotUnavailable:true}));
}).finally(async()=>{
 if(page)report.journalCleanup=await page.evaluate(()=>window.__normalUpdateJournal?.clear?.()).catch(()=>({unavailable:true}));
 await context?.close().catch(()=>{});await browser?.close().catch(()=>{});report.ownedBrowserClosed=Boolean(browser);
 if(server){report.serverAfter=server.status();server.stop();report.serverStopped=true;}report.completedAt=new Date().toISOString();
 assert.equal(hash(read('normal-update-v1-result.json')),report.originalNormalPCFailureSHA256);
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failure:report.failure??null,stage:report.currentStage??null,memory:report.memory,browserClosed:report.ownedBrowserClosed,serverStopped:report.serverStopped,scope:report.scope}));
 if(!report.passed)process.exitCode=1;
});

