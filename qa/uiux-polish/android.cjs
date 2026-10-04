'use strict';
// Physical Android: disposable local helper, or existing normal tab with --production.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require('../node_modules/playwright');
const root=path.resolve(__dirname,'../..'),owner=path.dirname(root),production=process.argv.includes('--production');
const out=path.join(owner,'maintenance/tools/uiux-polish'),origin='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const adb=path.join(owner,'maintenance/tools/scrcpy-v4.1/scrcpy-win64-v4.1/adb.exe');
fs.mkdirSync(out,{recursive:true});
const report={at:new Date().toISOString(),mode:production?'production':'local scoped overrides',scope:'trusted CDP touch on physical Android; not human finger acceptance',steps:[],cleanup:{}};
let serial,port,client,browser,page,cdp,rotation,originalUrl,originalPage,prior=[],touchActive=false;
const resultPath=path.join(out,production?'android-production-result.json':'android-local-result.json');
if(fs.existsSync(resultPath))fs.copyFileSync(resultPath,path.join(out,`${production?'production':'local'}-prior-${new Date().toISOString().replace(/[:.]/g,'-')}.json`));
const save=()=>fs.writeFileSync(resultPath,JSON.stringify(report,null,2));
const step=(name,data={})=>{report.steps.push({name,...data});save();console.log(JSON.stringify({step:name,...data}));};
const requireThat=(condition,code)=>{if(!condition)throw Error(code);};
function cmd(args){const r=spawnSync(adb,args,{encoding:'utf8',windowsHide:true,timeout:15000});if(r.status!==0||r.error)throw Error('ADB_OPERATION_FAILED');return r.stdout.trim();}
function pkg(name){const base=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx');const p=fs.readdirSync(base).map(d=>path.join(base,d,'node_modules',name)).find(p=>fs.existsSync(path.join(p,'package.json')));if(!p)throw Error('CACHED_DEPENDENCY_MISSING');return p;}
async function claimExistingWorker(){
  requireThat(!production,'PRODUCTION_MUST_NOT_CLAIM_WORKER');
  const info=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json(),ws=new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let id=0,attached;const waiting=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data),resolve=waiting.get(m.id);if(resolve){waiting.delete(m.id);resolve(m);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>{waiting.delete(requestId);reject(Error('WORKER_COMMAND_TIMEOUT'));},10000);
    waiting.set(requestId,m=>{clearTimeout(timer);m.error?reject(Error('WORKER_COMMAND_FAILED')):resolve(m.result);});ws.send(JSON.stringify({id:requestId,method,params,...(sessionId?{sessionId}:{})}));});
  try{const targets=await send('Target.getTargets'),matches=targets.targetInfos.filter(t=>t.type==='service_worker'&&t.url===origin+'/sw.js');requireThat(matches.length===1,'EXACT_ACTIVE_WORKER_TARGET_AMBIGUOUS');
    attached=await send('Target.attachToTarget',{targetId:matches[0].targetId,flatten:true});
    const active=await send('Runtime.evaluate',{expression:'({active:self.registration.active?.scriptURL===self.location.href,scope:self.registration.scope})',returnByValue:true},attached.sessionId);
    requireThat(active.result?.value?.active&&active.result.value.scope===origin+'/','EXACT_ACTIVE_WORKER_OWNER_UNCONFIRMED');
    const result=await send('Runtime.evaluate',{expression:'self.clients.claim()',awaitPromise:true,returnByValue:true},attached.sessionId);requireThat(!result.exceptionDetails,'LOCAL_WORKER_CLAIM_FAILED');
  }finally{if(attached)await send('Target.detachFromTarget',{sessionId:attached.sessionId}).catch(()=>{});ws.close();}
}
async function observe(){return page.evaluate(()=>({paused:el.videoPlayer.paused,time:playerTimeline().currentTime,duration:playerTimeline().duration,
  ready:el.videoPlayer.classList.contains('is-ready'),loading:!el.mediaLoading.hidden,error:!el.mediaError.hidden,
  controls:!el.playerModal.classList.contains('controls-idle'),width:innerWidth,height:innerHeight,
  frames:el.videoPlayer.getVideoPlaybackQuality?.().totalVideoFrames||0,sample:window.__uiuxFiles?.findIndex(f=>f.id===state.selected?.id),
  trackPhase:el.playerTracksStatus?.dataset.phase||null,checking:Boolean(playerTracksOwner?.checking),trackDialog:Boolean(el.playerTracksDialog?.open),
  reads:playerTracksOwner?.inventory?.reads?Object.fromEntries(Object.entries(playerTracksOwner.inventory.reads).filter(([,v])=>typeof v==='number')):null,
  trackCleanup:playerTracksRetirementResult?.settled??null,stage:el.mediaStage.getBoundingClientRect().toJSON()}));}
async function input(type,touchPoints){if(type==='touchStart')touchActive=true;await cdp.send('Input.dispatchTouchEvent',{type,touchPoints});if(type==='touchEnd'||type==='touchCancel')touchActive=false;}
async function touch(x,y,delay=350){await input('touchStart',[{x,y,id:1}]);await page.waitForTimeout(70);await input('touchEnd',[]);await page.waitForTimeout(delay);}
async function tap(selector,delay=350){const loc=page.locator(selector).first();await loc.scrollIntoViewIfNeeded();const r=await loc.boundingBox();requireThat(r?.width&&r?.height,'TOUCH_TARGET_MISSING');await touch(r.x+r.width/2,r.y+r.height/2,delay);}
async function screenshot(label){await page.screenshot({path:path.join(out,`${production?'production':'local'}-${label}.png`)});}
async function discover(){return page.evaluate(async()=>{
  const query=async(q,fields)=>{const result=await collectAllPages(async token=>{const p=new URLSearchParams({q,fields:`nextPageToken,incompleteSearch,${fields}`,pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});if(token)p.set('pageToken',token);const data=await(await driveFetch(`${DRIVE_API}/files?${p}`)).json();if(data.incompleteSearch)throw Error('TARGET_SEARCH_INCOMPLETE');return data;});return result.items;};
  const folders=await query("trashed=false and mimeType='application/vnd.google-apps.folder' and name='뷰너'",'files(id,name)');
  if(folders.length!==1)throw Error('TARGET_FOLDER_AMBIGUOUS');
  const files=await query(`trashed=false and '${folders[0].id}' in parents and mimeType contains 'video/'`,'files(id,name,mimeType,size,resourceKey,thumbnailLink,parents,capabilities(canDownload),videoMediaMetadata(width,height,durationMillis))');
  // Read-only 2026-10-04 corpus qualification: exact bytes distinguish nearby
  // long videos whose durations alone also match the user's 41:53 sample.
  const select=(seconds,bytes)=>files.filter(f=>f.capabilities?.canDownload!==false&&Number(f.size)===bytes&&Math.abs(Number(f.videoMediaMetadata?.durationMillis)/1000-seconds)<2);
  const short=select(47.8,20891042),long=select(2513,574835662);
  if(short.length!==1||long.length!==1)throw Error(`TARGET_DURATION_SIZE_AMBIGUOUS short=${short.length} long=${long.length} videos=${files.length}`);
  window.__uiuxFiles=[short[0],long[0]];window.__uiuxFolder=folders[0];
  state.files=window.__uiuxFiles;state.folders=[];state.currentFolderId=folders[0].id;state.currentFolderName=folders[0].name;
  state.filter='all';state.query='';state.deepScan=false;state.nextPageToken=null;state.populationComplete=true;state.sort='name';renderFiles({resetWindow:true});
  return {folderFound:true,availableVideos:files.length,samples:window.__uiuxFiles.map((f,i)=>({sample:i,bytes:Number(f.size),metadataSeconds:Number(f.videoMediaMetadata.durationMillis)/1000}))};
});}
async function play(index,label){const started=Date.now();await page.evaluate(i=>openPlayer(window.__uiuxFiles[i]),index);
  await page.waitForFunction(()=>!el.videoPlayer.paused&&el.videoPlayer.classList.contains('is-ready')&&el.mediaLoading.hidden,null,{timeout:45000});
  const a=await observe();await page.waitForTimeout(2000);const b=await observe();
  requireThat(b.frames>a.frames&&b.time>a.time&&!b.error,'PLAYBACK_DID_NOT_ADVANCE');requireThat(Math.abs(b.duration-(index===0?47.8:2513))<(index===0?2:12),'ACTUAL_DURATION_MISMATCH');
  step(label,{sample:index,startupMs:Date.now()-started-2000,actualDuration:b.duration,secondsAdvanced:b.time-a.time,framesAdvanced:b.frames-a.frames});}
async function seekGesture(label,drag){await page.evaluate(()=>revealPlayerChrome({touch:true}));
  const loc=page.locator('#mobileShortsProgressTrack');const r=await loc.boundingBox();requireThat(r&&r.width>80&&r.height>=20,'SEEK_TRACK_TARGET_MISSING');
  const before=await observe(),ratio=drag?.67:.27,y=r.y+r.height/2,target=before.duration*ratio,started=Date.now();
  if(drag){const x=r.x+r.width*.35;await input('touchStart',[{x,y,id:1}]);
    for(let i=1;i<=9;i++){await input('touchMove',[{x:r.x+r.width*(.35+(ratio-.35)*i/9),y,id:1}]);await page.waitForTimeout(35);}
    await input('touchEnd',[]);
  }else await touch(r.x+r.width*ratio,y,0);
  await page.waitForFunction(t=>!state.isSeeking&&Math.abs(playerTimeline().currentTime-t)<Math.max(3,playerTimeline().duration*.005)&&el.mediaLoading.hidden,target,{timeout:45000});
  const after=await observe();requireThat(!after.error&&Math.abs(after.time-before.time)>before.duration*.05,'TRUSTED_SEEK_DID_NOT_MOVE');
  step(label,{gesture:drag?'touch drag with nine moves':'touch tap',targetSeconds:target,time:after.time,settledMs:Date.now()-started,trackHeight:r.height});}
async function gestures(label){await page.evaluate(()=>setPlayerChromeVisible(false));let a=await observe();const r=a.stage;
  await touch(r.x+r.width/2,r.y+r.height/2);a=await observe();requireThat(a.paused&&!a.controls,'CENTER_PAUSE_CONTRACT');
  const x=r.x+r.width*.2,y=r.y+r.height*.35;
  for(let i=0;i<4;i++){await touch(x,y);const b=await observe();requireThat(b.paused&&b.controls===(i%2===0),'OUTSIDE_TOGGLE_CONTRACT');}
  await touch(r.x+r.width/2,r.y+r.height/2);await page.waitForFunction(()=>!el.videoPlayer.paused&&el.mediaLoading.hidden,null,{timeout:20000});
  const b=await observe();requireThat(!b.controls,'CENTER_RESUME_CHANGED_CHROME');step(label+' center/outside',{pauseResume:true,outsideToggleCycles:2});
  await page.evaluate(()=>revealPlayerChrome({touch:true}));await screenshot(label+'-controls');
  const geometry=await page.evaluate(()=>{const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
    const nodes=[...document.querySelectorAll('#mobileShortsOverlay button,#mobileShortsOverlay summary,#mobileShortsProgressTrack')].filter(visible);
    const controls=nodes.map(n=>({id:n.id||'summary',rect:n.getBoundingClientRect().toJSON()}));const overlaps=[];
    for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];if(a.rect.left<b.rect.right-.5&&a.rect.right>b.rect.left+.5&&a.rect.top<b.rect.bottom-.5&&a.rect.bottom>b.rect.top+.5)overlaps.push([a.id,b.id]);}
    return {viewport:{width:innerWidth,height:innerHeight},controls,overlaps};});
  step(label+' layout',geometry);requireThat(!geometry.overlaps.length,'PLAYER_CONTROLS_OVERLAP');}
async function tracks(label){await page.evaluate(()=>revealPlayerChrome({touch:true}));await tap('#shortsMoreBtn',100);await tap('#shortsTracksBtn',0);const start=Date.now();
  await page.waitForFunction(()=>el.playerTracksDialog.open&&el.playerTracksStatus.dataset.phase==='checking',null,{timeout:5000}).catch(()=>{});
  step(label+' checking',{visible:await page.locator('#playerTracksDialog').evaluate(n=>n.open)});
  await page.waitForFunction(()=>!playerTracksOwner?.checking,null,{timeout:35000});const result=await observe();
  step(label+' outcome',{elapsedMs:Date.now()-start,phase:result.trackPhase,reads:result.reads,duration:result.duration});await screenshot(label+'-tracks');
  requireThat(['ready','unsupported'].includes(result.trackPhase),'TRACK_DISCOVERY_FAILED');await tap('#playerTracksClose');
  requireThat(!(await observe()).trackDialog,'TRACK_BUTTON_CHANGED_CHROME_INSTEAD_OF_DIALOG');}
async function endedRestart(){await page.evaluate(()=>revealPlayerChrome({touch:true}));const r=await page.locator('#mobileShortsProgressTrack').boundingBox();requireThat(r,'EOF_SEEK_TRACK_MISSING');
  await touch(r.x+r.width*.975,r.y+r.height/2,0);
  await page.waitForFunction(()=>el.videoPlayer.ended,null,{timeout:25000});const ended=await observe();
  const visibleButton=await page.evaluate(()=>['ctrlPlayPause','stageCenterPlayBtn'].find(id=>{const n=document.getElementById(id);return n&&!n.hidden&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0;})||null);
  if(visibleButton)await tap('#'+visibleButton,0);else{const a=ended.stage;await touch(a.x+a.width/2,a.y+a.height/2,0);}
  await page.waitForFunction(()=>!el.videoPlayer.ended&&!el.videoPlayer.paused&&playerTimeline().currentTime<5&&el.mediaLoading.hidden,null,{timeout:25000});
  const restart=await observe();step('actual short EOF/restart',{endedTime:ended.time,duration:ended.duration,restartTime:restart.time,input:visibleButton?'trusted play button touch':'trusted center stage touch'});}
async function pendingFence(){await play(1,'long pending discovery source');await page.evaluate(()=>revealPlayerChrome({touch:true}));await tap('#shortsMoreBtn',80);await tap('#shortsTracksBtn',0);
  const before=await observe();await tap('#playerTracksClose',0);await page.evaluate(()=>openPlayer(window.__uiuxFiles[0]));
  await page.waitForFunction(()=>state.selected?.id===window.__uiuxFiles[0].id&&el.mediaLoading.hidden,null,{timeout:45000});
  await page.waitForTimeout(700);const after=await observe();step('tracks close/switch fence',{wasPending:before.checking,newSample:after.sample,dialogClosed:!after.trackDialog,ownerReleased:await page.evaluate(()=>!playerTracksOwner),cleanupSettled:after.trackCleanup});
  requireThat(!after.trackDialog&&after.sample===0&&!await page.evaluate(()=>Boolean(playerTracksOwner)),'STALE_TRACK_DISCOVERY_PUBLISHED');
  if(!before.checking)step('pending discovery limit',{observed:'completed before trusted close; pending cancellation was not exercised'});}
async function swipe(){await page.evaluate(()=>setPlayerChromeVisible(false));const before=await observe(),r=before.stage,y=r.y+r.height*.5;
  await input('touchStart',[{x:r.x+r.width*.7,y,id:1}]);
  for(let i=1;i<=8;i++){await input('touchMove',[{x:r.x+r.width*(.7-.5*i/8),y,id:1}]);await page.waitForTimeout(30);}
  await input('touchEnd',[]);await page.waitForFunction(old=>window.__uiuxFiles.findIndex(f=>f.id===state.selected?.id)!==old&&el.mediaLoading.hidden,before.sample,{timeout:45000});
  const after=await observe();requireThat(after.sample>=0&&!after.error,'SWIPE_SCOPED_SAMPLE_FAILED');step('horizontal trusted swipe',{fromSample:before.sample,toSample:after.sample});}
(async()=>{try{
  const devices=cmd(['devices','-l']).split(/\r?\n/).filter(l=>/^\S+\s+device(?:\s|$)/.test(l));requireThat(devices.length===1,'AUTHORIZED_DEVICE_COUNT');serial=devices[0].split(/\s+/)[0];
  report.device={model:cmd(['-s',serial,'shell','getprop','ro.product.model']),android:cmd(['-s',serial,'shell','getprop','ro.build.version.release'])};requireThat(report.device.model==='SM-F711N','DEVICE_MODEL_CHANGED');
  port=Number(cmd(['-s',serial,'forward','tcp:0','localabstract:chrome_devtools_remote']));
  const sdk=pkg('@modelcontextprotocol/sdk'),mcp=pkg('chrome-devtools-mcp');
  const {Client}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/index.js')).href),{StdioClientTransport}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/stdio.js')).href);
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(mcp,'build/src/bin/chrome-devtools-mcp.js'),`--browserUrl=http://127.0.0.1:${port}`,'--categoryExtensions=false','--no-usage-statistics','--no-performance-crux','--redactNetworkHeaders'],stderr:'pipe',env:{...process.env,CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS:'1'}});transport.stderr.on('data',()=>{});
  client=new Client({name:'uiux-polish-android-qa',version:'1.0'},{capabilities:{}});await client.connect(transport);const listed=await client.callTool({name:'list_pages',arguments:{}});requireThat(!listed.isError,'MCP_DEVICE_ACCESS_FAILED');report.actualDeviceMcpPassed=true;await client.close();client=null;
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:15000});const context=browser.contexts()[0];prior=context.pages().map(p=>({page:p,url:p.url()}));
  const matching=prior.filter(p=>p.url.startsWith(origin+'/'));requireThat(matching.length===1,'ORIGINAL_TAB_AMBIGUOUS');originalPage=matching[0].page;originalUrl=originalPage.url();
  if(production)page=originalPage;
  else{if(!await originalPage.evaluate(()=>Boolean(navigator.serviceWorker.controller)))await originalPage.reload({waitUntil:'domcontentloaded',timeout:30000});
    await originalPage.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:10000});
    await originalPage.evaluate(()=>{window.__uiuxControlChanges=0;window.__uiuxControlListener=()=>window.__uiuxControlChanges++;navigator.serviceWorker.addEventListener('controllerchange',window.__uiuxControlListener);});
    page=await context.newPage();await page.goto(origin+'/?uiuxPolishLocal=1',{waitUntil:'domcontentloaded',timeout:45000});}
  await page.bringToFront();
  cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
  const assets=new Map(['index.html','app.js','styles.css','media/general-tracks.mjs','media/subtitle-track.mjs'].map(name=>[name,fs.readFileSync(path.join(root,name))]));
  report.sourceHashes=Object.fromEntries([...assets].map(([name,b])=>[name,crypto.createHash('sha256').update(b).digest('hex')]));report.overrideRequests={};
  if(!production){await page.route('**/*',async route=>{const u=new URL(route.request().url()),name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(u.origin!==origin||!assets.has(name))return route.continue();report.overrideRequests[name]=(report.overrideRequests[name]||0)+1;return route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'text/javascript',headers:{'Cache-Control':'no-store'},body:assets.get(name)});});await cdp.send('Network.setBypassServiceWorker',{bypass:true});}
  await page.reload({waitUntil:'domcontentloaded',timeout:45000});
  if(!production)await page.evaluate(()=>Promise.all([import('./media/general-tracks.mjs'),import('./media/subtitle-track.mjs')]).then(()=>true));
  await cdp.send('Network.setBypassServiceWorker',{bypass:false});
  if(!production&&!await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))){await claimExistingWorker();
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:10000});
    const originalChanges=await originalPage.evaluate(()=>window.__uiuxControlChanges);requireThat(originalChanges===0,'ORIGINAL_TAB_CONTROLLER_CHANGED');
    step('local controlled helper setup',{exactExistingWorker:true,nativeClientClaim:true,originalTabControllerChanges:originalChanges,productionProof:false});}
  await page.waitForFunction(()=>typeof state!=='undefined'&&Boolean(state.authAccountKey)&&!el.libraryView.hidden,null,{timeout:30000});
  requireThat(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),'EXISTING_TAB_NOT_WORKER_CONTROLLED');
  if(!production)requireThat(['index.html','app.js','styles.css'].every(n=>report.overrideRequests[n]>0),'LOCAL_SHELL_OVERRIDE_MISSING');
  const version=await page.evaluate(()=>APP_VERSION);if(production)requireThat(version==='1.23.1','PRODUCTION_VERSION_NOT_ADMITTED');
  step('source admission',{version,swControlled:true,production});step('authenticated duration samples',await discover());
  await tap('#settingsButton');requireThat(await page.locator('#settingsDialog').evaluate(n=>n.open),'SETTINGS_TOUCH_FAILED');await screenshot('settings');await tap('#settingsDialog button[aria-label="설정 닫기"]');
  await tap('.file-card-name-button');requireThat(await page.locator('#fileNameDialog').evaluate(n=>n.open),'FULL_FILENAME_TOUCH_FAILED');await screenshot('full-filename');await tap('#fileNameDialog button');step('settings/full filename trusted touch',{passed:true});
  rotation={automatic:cmd(['-s',serial,'shell','settings','get','system','accelerometer_rotation']),user:cmd(['-s',serial,'shell','settings','get','system','user_rotation'])};
  cmd(['-s',serial,'shell','settings','put','system','accelerometer_rotation','0']);cmd(['-s',serial,'shell','settings','put','system','user_rotation','0']);await page.waitForFunction(()=>innerHeight>innerWidth,null,{timeout:10000});
  await play(0,'portrait short playback');await seekGesture('portrait seek tap',false);await seekGesture('portrait seek drag',true);await gestures('portrait');await endedRestart();await tracks('short');
  await play(1,'long playback');await seekGesture('long seek tap',false);await seekGesture('long seek drag',true);await tracks('long');await pendingFence();
  cmd(['-s',serial,'shell','settings','put','system','user_rotation','1']);await page.waitForFunction(()=>innerWidth>innerHeight,null,{timeout:10000});await page.waitForTimeout(600);
  await gestures('landscape');await seekGesture('landscape seek tap',false);await seekGesture('landscape seek drag',true);await swipe();
  if(!production)requireThat(['media/general-tracks.mjs','media/subtitle-track.mjs'].every(n=>report.overrideRequests[n]>0),'LOCAL_TRACK_MODULE_OVERRIDE_MISSING');
  report.completed=true;
}catch(e){report.completed=false;report.failure=/^[A-Z_]+$/.test(e.message)?e.message:'ANDROID_QA_OPERATION_FAILED';report.failureDetail=String(e.message).replace(/https?:\/\/\S+/g,'[url]').replace(/([?&](?:fileId|id|resourceKey)=)[^&\s]+/g,'$1[redacted]').slice(0,160);}
finally{
  if(rotation&&serial){try{cmd(['-s',serial,'shell','settings','put','system','user_rotation',rotation.user]);cmd(['-s',serial,'shell','settings','put','system','accelerometer_rotation',rotation.automatic]);report.cleanup.rotationRestored=true;}catch{report.cleanup.rotationRestored=false;}}
  if(cdp){if(!touchActive){report.cleanup.touchReleased=true;report.touchCleanup='No helper touch remained active.';}
    else{try{await input('touchEnd',[]);report.cleanup.touchReleased=true;}catch{report.cleanup.touchReleased=false;}}
    try{await cdp.send('Network.setBypassServiceWorker',{bypass:false});report.cleanup.bypassRestored=true;}catch{report.cleanup.bypassRestored=false;}}
  if(page){try{await page.unrouteAll({behavior:'wait'});report.cleanup.overridesRemoved=true;}catch{report.cleanup.overridesRemoved=false;}}
  if(page&&originalUrl){try{await page.evaluate(()=>{if(typeof closePlayer==='function'&&!el.playerSheet.hidden)closePlayer();});if(page!==originalPage){await page.close();report.cleanup.testTabClosed=true;}else await page.goto(originalUrl,{waitUntil:'domcontentloaded',timeout:30000});}catch{report.cleanup.testTabClosed=false;}}
  if(originalPage){try{if(!production)await originalPage.evaluate(()=>{navigator.serviceWorker.removeEventListener('controllerchange',window.__uiuxControlListener);delete window.__uiuxControlListener;delete window.__uiuxControlChanges;});
    await originalPage.bringToFront();report.cleanup.originalTabsPreserved=prior.every(p=>!p.page.isClosed()&&p.page.url()===p.url);}catch{report.cleanup.originalTabsPreserved=false;}}
  if(cdp)await cdp.detach().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(client)await client.close().catch(()=>{});
  if(port&&serial){try{cmd(['-s',serial,'forward','--remove',`tcp:${port}`]);report.cleanup.forwardRemoved=true;}catch{report.cleanup.forwardRemoved=false;}}
  report.cleanup.complete=Object.values(report.cleanup).every(v=>v===true);save();
}
console.log(JSON.stringify({completed:report.completed,failure:report.failure||null,cleanup:report.cleanup}));if(!report.completed||!report.cleanup.complete)process.exitCode=1;
})();
