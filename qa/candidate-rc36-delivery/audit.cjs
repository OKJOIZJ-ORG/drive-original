'use strict';
// Prepared read-only shell audit: fresh anonymous headless context, never a shared profile.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const guard=require('./delivery-guard.cjs'),{verifiedDownload}=require('./verified-download.cjs');
const mode=process.argv[2];
const resumeFile=process.argv[3]==='--resume-from'?process.argv[4]:null;
if(require.main===module&&(!['--prepare','--execute'].includes(mode)||!(process.argv.length===3||(mode==='--execute'&&process.argv.length===5&&resumeFile))))throw Error('AUDIT_MODE_REQUIRED');
const destination=name=>path.join(__dirname,name),write=(name,value)=>fs.writeFileSync(destination(name),JSON.stringify(value,null,2)+'\n');
const safeError=error=>/^[A-Z0-9_]+$/.test(error.message)?error.message:error.code||'DELIVERY_AUDIT_FAILED';
const producerFiles=['audit.cjs','delivery-guard.cjs','verified-download.cjs','delivery.cjs','build-release.py'];
function downloadBudget(file,bytes){return /\.tgz$|\.tar\.gz\.part\d+$/.test(file)?600000:bytes>=8388608?240000:120000;}
// The installed official Wrangler implementation hashes base64 bytes plus the extension.
function assetContentKey(bytes,file){return require(path.join(guard.worker,'node_modules/blake3-wasm')).hash(bytes.toString('base64')+path.extname(file).substring(1)).toString('hex').slice(0,32);}
function assertAssetEtag(etag,bytes,file){assert.equal(etag,'"'+assetContentKey(bytes,file)+'"','CURRENT_CONTENT_ADDRESS_MISMATCH');}
function validateResume(prior,expected){
 assert.equal(prior.passed,false,'RESUME_PREVIOUS_FAILURE_REQUIRED');assert(['DELIVERY_TOTAL_DEADLINE','ERR_ASSERTION',20].includes(prior.error),'RESUME_CHANGED_CONDITION_REQUIRED');
 for(const key of ['source','version','base','workerVersion','downloadProducerSha256'])assert.equal(prior[key],expected[key],'RESUME_IDENTITY_CHANGED');
 assert.equal(prior.producerSha256,expected.oldProducerSha256,'RESUME_PRODUCER_CHANGED');assert.deepEqual(prior.inputAssets,expected.assets,'RESUME_ASSET_BINDING_CHANGED');
 for(const key of ['passed','contextClosed','browserClosed','heartbeatCleared','downloadsSettled'])assert.equal(prior.cleanup?.[key],true,'RESUME_CLEANUP_REQUIRED');
 assert(Array.isArray(prior.assets)&&prior.assets.length>0&&prior.assets.length<=expected.assets.length,'RESUME_PUBLIC_PREFIX_REQUIRED');
 for(let i=0;i<prior.assets.length;i++){const row=prior.assets[i],bound=expected.assets[i];assert.equal(row.file,bound.file,'RESUME_PREFIX_REQUIRED');assert.equal(row.gitEqual,true,'RESUME_SUCCESS_REQUIRED');assert.equal(row.bytes,bound.bytes,'RESUME_SIZE_CHANGED');assert.equal(row.sha256,bound.sha256,'RESUME_HASH_CHANGED');}
 const interrupted=expected.assets[prior.assets.length];assert.equal(prior.currentStep,'failed','RESUME_FAILURE_STATE_REQUIRED');if(prior.downloadFailure){assert.equal(prior.downloadFailure.expectedBytes,interrupted.bytes,'RESUME_INTERRUPTED_FILE_CHANGED');assert(prior.downloadFailure.bytesRead<interrupted.bytes,'RESUME_INTERRUPTED_FILE_UNQUALIFIED');}
 for(const key of ['cached','uncachedSourceDownloads'])assert.deepEqual(prior[key],[],'RESUME_ONLY_PUBLIC_PREFIX_SUPPORTED');
 return prior.assets.map(row=>({...row}));
}
function resumeVerifiedPrefix(file,site,deployment){
 const absolute=path.resolve(guard.root,file),folder=path.dirname(absolute);
 assert(['audit-attempt2-archive-deadline','audit-attempt4-weak-text-etag','audit-attempt5-private-abort'].some(name=>folder===destination(name)),'RESUME_APPROVED_FOLDER_REQUIRED');assert.equal(path.basename(absolute),'results.json','RESUME_RESULT_REQUIRED');
 const bytes=fs.readFileSync(absolute),prior=JSON.parse(bytes),preservation=JSON.parse(fs.readFileSync(path.join(folder,'preservation.json'))),oldProducer=fs.readFileSync(path.join(folder,'audit.cjs'));
 for(const [name,data]of [['results.json',bytes],['audit.cjs',oldProducer]])assert(preservation.preserved.some(row=>row.file===name&&row.bytes===data.length&&row.sha256===guard.sha(data)),'RESUME_PRESERVATION_CHANGED');
 const rows=validateResume(prior,{source:guard.SOURCE,version:guard.VERSION,base:guard.BASE,workerVersion:deployment.workerVersion,assets:site,downloadProducerSha256:guard.sha(fs.readFileSync(destination('verified-download.cjs'))),oldProducerSha256:guard.sha(oldProducer)});
 for(const row of prior.preparation.inputs.filter(row=>row.file!=='audit.cjs'))assert.equal(row.sha256,guard.sha(fs.readFileSync(destination(row.file))),'RESUME_DEPENDENCY_CHANGED');
 return{rows,evidence:{path:path.relative(guard.root,absolute).split(path.sep).join('/'),sha256:guard.sha(bytes),oldProducerSha256:prior.producerSha256,count:rows.length,previousPassed:false,previousFailure:prior.error,interruptedFile:site[rows.length]?.file||null,privateCacheOfflineProofReused:false,changedCondition:'QA producer corrected; only verified public prefix reused, previous failure retained; byte equality and cleanup criteria unchanged'}};
}
function validateUnchangedAsset(row,oldRow,oldBinding,oldHash){
 assert(oldRow?.gitEqual===true&&oldRow.file===row.file,'UNCHANGED_PRIOR_BYTE_PROOF_REQUIRED');assert.equal(oldRow.bytes,row.bytes,'UNCHANGED_SIZE_REQUIRED');
 assert(oldBinding?.path===row.file&&oldBinding.sha256===row.sha256,'UNCHANGED_PRIOR_SOURCE_BINDING_REQUIRED');assert.equal(oldHash,row.sha256,'UNCHANGED_GIT_BYTES_REQUIRED');
}
function unchangedDelivery(site,deployment){
 const oldNames=['results.json','source-readiness.json','deployment.json'],receipts={};
 for(const name of oldNames){const file='qa/candidate-rc35-delivery/'+name,bytes=guard.blob(file);assert(fs.readFileSync(path.join(guard.root,file)).equals(bytes),'PRIOR_DELIVERY_RECORD_CHANGED');receipts[name]=JSON.parse(bytes);}
 const prior=receipts['results.json'],ready=receipts['source-readiness.json'];assert(prior.passed&&ready.passed,'PRIOR_DELIVERY_PASS_REQUIRED');assert.equal(prior.source,ready.sourceCommit);assert.equal(prior.base,guard.BASE);assert.equal(ready.sourceCommit,'2c2b1244bee0f1a5e500318c83c6e126c5124e34');assert.equal(ready.version,'1.22.0-rc.35');assert.equal(ready.workerVersion,'5976c3f9-ba4f-47a1-955a-06d9748f6302');
 for(const row of ready.evidence)assert.equal(guard.sha(guard.blob(row.path)),row.sha256,'PRIOR_DELIVERY_EVIDENCE_CHANGED');
 const raw=fs.readFileSync(destination('deployment-private.log'));assert.equal(guard.sha(raw),deployment.rawLogSha256,'CURRENT_UPLOAD_LOG_CHANGED');const text=raw.toString().replace(/\x1b\[[0-9;]*m/g,''),uploaded=[...text.matchAll(/^\s*\+ \/([^\r\n]+)$/gm)].map(m=>m[1].trim());
 assert.equal(uploaded.length,11,'CURRENT_CONTENT_ADDRESSED_UPLOAD_REQUIRED');assert(/Success! Uploaded 11 files \(54 already uploaded\)/.test(text),'CURRENT_CONTENT_ADDRESSED_REUSE_REQUIRED');assert(uploaded.every(file=>site.some(row=>row.file===file)));
 const rows=[];
 for(const row of site){if(uploaded.includes(row.file))continue;const oldRow=prior.assets.find(item=>item.file===row.file),oldBinding=ready.fixedSourceAssetBindings.find(item=>item.path===row.file);if(!oldRow||!oldBinding)continue;const oldBytes=row.file==='.nojekyll'?Buffer.alloc(0):guard.git(['show',ready.sourceCommit+':'+row.file]);validateUnchangedAsset(row,oldRow,oldBinding,guard.sha(oldBytes));rows.push(row);}
 return{rows,evidence:{path:'qa/candidate-rc35-delivery/source-readiness.json',sha256:guard.sha(guard.blob('qa/candidate-rc35-delivery/source-readiness.json')),sourceCommit:ready.sourceCommit,workerVersion:ready.workerVersion,currentWorkerVersion:deployment.workerVersion,currentUploadLogSha256:deployment.rawLogSha256,newContentAddressedUploads:11,alreadyUploaded:54,hashImplementation:{path:'worker/node_modules/wrangler/wrangler-dist/cli.js',sha256:guard.sha(fs.readFileSync(path.join(guard.worker,'node_modules/wrangler/wrangler-dist/cli.js'))),sourceLines:'156889-156893,157314-157317',formula:'blake3(base64(bytes)+extension).hex.slice(0,32)'},scope:'Prior full-byte proof plus unchanged Git bytes and successful current content-addressed upload; current HEAD strong ETag matches exact Git asset content key, not a new full-body download'}};
}
function prepare(){
 const inputs=guard.assertSource();
 for(const file of producerFiles.filter(file=>file.endsWith('.cjs')))cp.execFileSync(process.execPath,['--check',destination(file)],{windowsHide:true,timeout:15000});
 const memory=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true,timeout:15000}));
 assert(memory.FreePhysicalMemory>1048576&&memory.FreeVirtualMemory>1572864,'NEW_CHROME_MEMORY_FLOOR');
 const playwrightPath=require.resolve('playwright/package.json');require('playwright');
 const executablePath=[process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA].filter(Boolean).map(dir=>path.join(dir,'Google/Chrome/Application/chrome.exe')).find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());assert(executablePath,'HEADLESS_CHROME_EXECUTABLE_REQUIRED');
 const preparation={...inputs,passed:true,memory:{freePhysicalKiB:memory.FreePhysicalMemory,freeVirtualKiB:memory.FreeVirtualMemory,physicalFloorKiBExclusive:1048576,virtualFloorKiBExclusive:1572864},browser:{dependencyPath:playwrightPath,executablePath,channel:'chrome',headless:true,freshAnonymousContext:true,persistentProfile:false,launchPerformed:false},inputs:producerFiles.map(file=>({file,sha256:guard.sha(fs.readFileSync(destination(file)))})),downloadBudgets:{sourceArchiveTotalMs:600000,largeCodecTotalMs:240000,ordinaryTotalMs:120000,noProgressMs:15000,readerCleanupMs:5000},scope:'Preparation only; no live fetch/browser/device/account/deployment action',recordedAt:new Date().toISOString()};
 return preparation;
}
async function bounded(promise,ms,code){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(code)),ms);})]);}finally{clearTimeout(timer);}}
async function cancelPrivateResponse(response,controller){try{if(response?.body)await bounded(response.body.cancel(),5000,'PRIVATE_RESPONSE_CLEANUP_UNSETTLED');}finally{controller.abort();}}
async function execute(){
 if(fs.existsSync(destination('results.json'))||fs.existsSync(destination('audit-progress.json'))||fs.existsSync(destination('audit-failure.json')))throw Error('RETAINED_AUDIT_ATTEMPT_NO_AUTOMATIC_RETRY');
 const result={source:guard.SOURCE,version:guard.VERSION,base:guard.BASE,passed:false,assets:[],privateRoutes:[],cached:[],uncachedSourceDownloads:[],producerSha256:guard.sha(fs.readFileSync(__filename)),downloadProducerSha256:guard.sha(fs.readFileSync(destination('verified-download.cjs'))),scope:'Same-candidate public delivery and fresh anonymous shell only; no account/media/device/whole-format/color/HDR acceptance'};
 // Durable failure/result/cleanup state exists before launch or the first remote request.
 guard.save('results.json',result);
 let browser,context,heartbeat,allChecksPassed=false;const started=Date.now();
  const cleanup={contextClosed:true,browserClosed:true,heartbeatCleared:false,downloadsSettled:true,privateResponsesSettled:true,passed:false};
 function checkpoint(step){if(step)result.currentStep=step;result.recordedAt=new Date().toISOString();write('results.json',result);const progress={source:guard.SOURCE,step:result.currentStep,verified:result.assets.length,cached:result.cached.length,elapsedMs:Date.now()-started,recordedAt:result.recordedAt};write('audit-progress.json',progress);console.log(JSON.stringify(progress));}
 try{
  const preparation=prepare(),deployment=guard.requireDeployment(),site=guard.verifySite();
  result.preparation=preparation;result.workerVersion=deployment.workerVersion;result.inputAssets=site;
  if(resumeFile){const prior=resumeVerifiedPrefix(resumeFile,site,deployment);result.assets=prior.rows;result.reusedVerifiedPrefix=prior.evidence;}
  const unchanged=result.assets.length<site.length?unchangedDelivery(site,deployment):{rows:[],evidence:{scope:'All65 public rows reused from exact current-candidate failed attempt; underlying byte/content-address proofs retained in its hashed result'}};result.unchangedDeliveryEvidence=unchanged.evidence;result.reusedUnchangedAssets=[];
  checkpoint('prepared');heartbeat=setInterval(()=>checkpoint(),10000);
  for(const file of [...guard.files,'.nojekyll'].slice(result.assets.length)){
   checkpoint('public:'+file);const expected=file==='.nojekyll'?Buffer.alloc(0):guard.blob(file);
   const reusable=/\.tgz$|\.tar\.gz\.part\d+$/.test(file)&&unchanged.rows.find(row=>row.file===file);
   if(reusable){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(guard.BASE+file+'?verify='+Date.now(),{method:'HEAD',signal:controller.signal,cache:'no-store'});if(response.status!==200)throw Error('UNCHANGED_CURRENT_ROUTE_REQUIRED');assertAssetEtag(response.headers.get('etag'),expected,file);const length=response.headers.get('content-length');if(length!==null&&length!==String(expected.length))throw Error('UNCHANGED_CURRENT_LENGTH_MISMATCH');result.assets.push({...reusable,gitEqual:true,reused:true,byteProof:'prior-full-download/unchanged-Git/current-content-addressed-deployment/exact-strong-ETag',currentRoute:{method:'HEAD',status:response.status,contentLength:length,etag:response.headers.get('etag'),expectedContentAddress:assetContentKey(expected,file)}});result.reusedUnchangedAssets.push(file);checkpoint('reused-unchanged:'+file);continue;}finally{clearTimeout(timer);controller.abort();}}
   let metrics;try{metrics=await verifiedDownload(guard.BASE+file+'?verify='+Date.now(),expected,{totalMs:downloadBudget(file,expected.length),progressMs:15000});}
   catch(error){result.downloadFailure=error.delivery;if(error.delivery?.cleanup)cleanup.downloadsSettled=false;throw error;}
   result.assets.push({file,...metrics,sha256:guard.sha(expected),gitEqual:true});checkpoint('verified:'+file);
  }
  for(const file of ['memory/CHECKPOINT.md','qa/package.json','media/build.json','worker/index.mjs','media/audio-codec-build.json','media/mediabunny-q1-build.json']){
   checkpoint('private-route:'+file);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let response;
   try{response=await fetch(guard.BASE+file,{signal:controller.signal,cache:'no-store'});assert.equal(response.status,404);result.privateRoutes.push({file,status:404});}
   finally{clearTimeout(timer);try{await cancelPrivateResponse(response,controller);}catch(error){cleanup.privateResponsesSettled=false;throw error;}}
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
  cleanup.passed=cleanup.contextClosed&&cleanup.browserClosed&&cleanup.heartbeatCleared&&cleanup.downloadsSettled&&cleanup.privateResponsesSettled;result.cleanup=cleanup;result.passed=allChecksPassed&&cleanup.passed;result.elapsedMs=Date.now()-started;if(!result.passed){process.exitCode=1;guard.save('audit-failure.json',{source:guard.SOURCE,error:result.error||'AUDIT_CLEANUP_FAILED',cleanup,noAutomaticRetry:true,recordedAt:new Date().toISOString()});}checkpoint(result.passed?'complete':'failed');
  console.log(JSON.stringify({passed:result.passed,source:guard.SOURCE,assets:result.assets.length,cache:result.cached.length,cleanup:cleanup.passed,error:result.error}));
 }
}
async function main(){if(mode==='--prepare'){const record=prepare();guard.save('audit-preparation.json',record);console.log(JSON.stringify({...guard.assertSource(),prepared:true,externalActionPerformed:false}));}else await execute();}
module.exports={downloadBudget,validateResume,validateUnchangedAsset,unchangedDelivery,assetContentKey,assertAssetEtag,cancelPrivateResponse};
if(require.main===module)main().catch(error=>{const record={source:guard.SOURCE,passed:false,error:safeError(error),noAutomaticRetry:true,recordedAt:new Date().toISOString()};try{guard.save(mode==='--prepare'?'preparation-failure.json':'audit-failure.json',record);}catch{}console.error(JSON.stringify(record));process.exitCode=1;});
