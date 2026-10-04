'use strict';
// Physical Android, authenticated same-origin app; scoped static overrides only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require('../node_modules/playwright');
const root=path.resolve(__dirname,'../..'),owner=path.dirname(root);
const out=path.join(owner,'maintenance/tools/responsive-redesign');fs.mkdirSync(out,{recursive:true});
const adb=path.join(owner,'maintenance/tools/scrcpy-v4.1/scrcpy-win64-v4.1/adb.exe');
const origin='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={at:new Date().toISOString(),scope:'automated trusted input on physical Android; not human finger acceptance',steps:[],cleanup:{}};
let serial,port,client,browser,page,cdp,rotation,originalPage,prior=[];
const save=()=>fs.writeFileSync(path.join(out,'android-result.json'),JSON.stringify(report,null,2));
const step=(name,data)=>{report.steps.push({name,...data});save();console.log(JSON.stringify({step:name,...data}));};
function cmd(args){const r=spawnSync(adb,args,{encoding:'utf8',windowsHide:true,timeout:15000});if(r.status!==0||r.error)throw Error('ADB_OPERATION_FAILED');return r.stdout.trim();}
function pkg(name){const base=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx');const p=fs.readdirSync(base).map(d=>path.join(base,d,'node_modules',name)).find(p=>fs.existsSync(path.join(p,'package.json')));if(!p)throw Error('CACHED_DEPENDENCY_MISSING');return p;}
async function claimExistingWorker(){
  const info=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();const ws=new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let id=0;const waiting=new Map();ws.addEventListener('message',event=>{const message=JSON.parse(event.data);const resolve=waiting.get(message.id);if(resolve){waiting.delete(message.id);resolve(message);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id;const timeout=setTimeout(()=>{waiting.delete(requestId);reject(Error('WORKER_COMMAND_TIMEOUT'));},10000);
    waiting.set(requestId,message=>{clearTimeout(timeout);message.error?reject(Error('WORKER_COMMAND_FAILED')):resolve(message.result);});ws.send(JSON.stringify({id:requestId,method,params,...(sessionId?{sessionId}:{})}));});
  let attached;
  try{const targets=await send('Target.getTargets');const target=targets.targetInfos.find(t=>t.type==='service_worker'&&t.url===origin+'/sw.js');if(!target)throw Error('ACTIVE_WORKER_TARGET_MISSING');
    attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    const result=await send('Runtime.evaluate',{expression:'self.clients.claim()',awaitPromise:true,returnByValue:true},attached.sessionId);if(result.exceptionDetails)throw Error('WORKER_CLAIM_FAILED');
  }finally{if(attached)await send('Target.detachFromTarget',{sessionId:attached.sessionId}).catch(()=>{});ws.close();}
}
async function state(){return page.evaluate(()=>({paused:el.videoPlayer.paused,time:el.videoPlayer.currentTime,
  ready:el.videoPlayer.classList.contains('is-ready'),loading:!el.mediaLoading.hidden,error:!el.mediaError.hidden,
  controls:!el.playerModal.classList.contains('controls-idle'),width:innerWidth,height:innerHeight,
  frames:el.videoPlayer.getVideoPlaybackQuality?.().totalVideoFrames||0,attempt:state.mediaAttempt,
  bufferLabel:el.mediaLoadingPercent?.textContent||'',stage:el.mediaStage.getBoundingClientRect().toJSON()}));}
async function touch(x,y){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await page.waitForTimeout(70);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(430);}
async function discover(){return page.evaluate(async()=>{
  const query=async(q,fields)=>{const p=new URLSearchParams({q,fields,pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});return (await(await driveFetch(`${DRIVE_API}/files?${p}`)).json()).files||[];};
  const folders=await query("trashed=false and mimeType='application/vnd.google-apps.folder' and name='뷰너'",'files(id,name)');
  if(folders.length!==1)throw Error('TARGET_FOLDER_AMBIGUOUS');
  const files=await query(`trashed=false and '${folders[0].id}' in parents and mimeType contains 'video/'`,
    'files(id,name,mimeType,size,resourceKey,thumbnailLink,parents,capabilities(canDownload),videoMediaMetadata(width,height,durationMillis))');
  const samples=files.filter(f=>f.capabilities?.canDownload!==false).sort((a,b)=>Number(a.size)-Number(b.size)).slice(0,3);
  if(samples.length<2)throw Error('TARGET_FOLDER_SAMPLES_MISSING');
  window.__responsiveFiles=samples;window.__responsiveFolder=folders[0];
  return {folderFound:true,availableVideos:files.length,samples:samples.map((f,i)=>({sample:i+1,bytes:Number(f.size),metadata:f.videoMediaMetadata||{}}))};
});}
async function prepareCatalog(){await page.evaluate(()=>{
  state.files=window.__responsiveFiles;state.currentFolderId=window.__responsiveFolder.id;
  state.filter='all';state.query='';state.deepScan=false;state.nextPageToken='';state.sort='name';
  state.treeCache=null;state.folders=[];renderFiles({resetWindow:true});
});}
async function play(index,label){const start=Date.now();await page.evaluate(i=>openPlayer(window.__responsiveFiles[i]),index);
  await page.waitForFunction(()=>!el.videoPlayer.paused&&el.videoPlayer.classList.contains('is-ready')&&el.mediaLoading.hidden,{timeout:45000});
  const first=await state();await page.waitForTimeout(3500);const last=await state();
  step(label,{sample:index+1,startupMs:Date.now()-start-3500,ready:first.ready,attempt:last.attempt,continuousSeconds:last.time-first.time,frames:last.frames-first.frames,swControlled:await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))});
}
async function seek(label){const started=Date.now();const target=await page.evaluate(()=>{const t=playerTimeline();const target=Math.min(t.duration*.5,Math.max(6,t.currentTime+5));setPlayerCurrentTime(el.videoPlayer,target,'responsive-android-qa');return target;});
  await page.waitForFunction(target=>!state.isSeeking&&Math.abs(playerTimeline().currentTime-target)<3&&el.mediaLoading.hidden,target,{timeout:45000});
  const observed=await state();step(label,{seekMs:Date.now()-started,target,time:observed.time,ready:observed.ready,error:observed.error});
}
async function gestures(label){await page.evaluate(()=>setPlayerChromeVisible(false));const start=await state();const r=start.stage;
  await touch(r.x+r.width/2,r.y+r.height/2);let paused=await state();
  step(label+' center pause',{passed:paused.paused&&!paused.controls,paused:paused.paused,controls:paused.controls});
  if(!paused.paused||paused.controls)throw Error('CENTER_PAUSE_CONTRACT');
  for(const [corner,dx,dy]of [['top-left',8,8],['top-right',r.width-8,8],['bottom-left',8,r.height-8],['bottom-right',r.width-8,r.height-8]]){
    await page.evaluate(()=>setPlayerChromeVisible(false));await touch(r.x+dx,r.y+dy);const observed=await state();
    step(label+' '+corner,{passed:observed.paused&&observed.controls,paused:observed.paused,controls:observed.controls});
    if(!observed.paused||!observed.controls)throw Error('CORNER_REVEAL_CONTRACT');
  }
  await page.evaluate(()=>setPlayerChromeVisible(false));await touch(r.x+r.width/2,r.y+r.height/2);
  await page.waitForFunction(()=>!el.videoPlayer.paused&&el.mediaLoading.hidden,{timeout:20000});
  const playing=await state();step(label+' center resume',{passed:!playing.paused&&!playing.controls});
  await page.screenshot({path:path.join(out,label+'-immersive.png')});
  await page.evaluate(()=>revealPlayerChrome({touch:true}));await page.screenshot({path:path.join(out,label+'-controls.png')});
}
(async()=>{try{
  const devices=cmd(['devices','-l']).split(/\r?\n/).filter(l=>/^\S+\s+device(?:\s|$)/.test(l));if(devices.length!==1)throw Error('AUTHORIZED_DEVICE_COUNT');serial=devices[0].split(/\s+/)[0];
  report.device={model:cmd(['-s',serial,'shell','getprop','ro.product.model']),android:cmd(['-s',serial,'shell','getprop','ro.build.version.release'])};if(report.device.model!=='SM-F711N')throw Error('DEVICE_MODEL_CHANGED');
  port=Number(cmd(['-s',serial,'forward','tcp:0','localabstract:chrome_devtools_remote']));
  const sdk=pkg('@modelcontextprotocol/sdk'),mcp=pkg('chrome-devtools-mcp');
  const {Client}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/index.js')).href),{StdioClientTransport}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/stdio.js')).href);
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(mcp,'build/src/bin/chrome-devtools-mcp.js'),`--browserUrl=http://127.0.0.1:${port}`,'--categoryExtensions=false','--no-usage-statistics','--no-performance-crux','--redactNetworkHeaders'],stderr:'pipe',env:{...process.env,CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS:'1'}});transport.stderr.on('data',()=>{});
  client=new Client({name:'responsive-android-qa',version:'1.0'},{capabilities:{}});await client.connect(transport);
  const listed=await client.callTool({name:'list_pages',arguments:{}});if(listed.isError)throw Error('MCP_DEVICE_ACCESS_FAILED');report.actualDeviceMcpPassed=true;
  await client.close();client=null;
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:15000});const context=browser.contexts()[0];prior=context.pages().map(p=>({page:p,url:p.url()}));
  const matching=prior.filter(p=>p.url.startsWith(origin+'/'));if(matching.length!==1)throw Error('ORIGINAL_TAB_AMBIGUOUS');originalPage=matching[0].page;
  await originalPage.evaluate(()=>{window.__responsiveControlChanges=0;window.__responsiveControlListener=()=>window.__responsiveControlChanges++;
    navigator.serviceWorker.addEventListener('controllerchange',window.__responsiveControlListener);});
  page=await context.newPage();cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  await page.goto(origin+'/?responsiveAndroidBaseline=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof state!=='undefined'&&Boolean(state.authAccountKey)&&!el.libraryView.hidden,{timeout:30000});
  step('authenticated folder sample discovery',await discover());await prepareCatalog();
  if(!process.argv.includes('--local-only')){await play(0,'production baseline startup');await seek('production baseline seek');await page.evaluate(()=>closePlayer());}
  const resources=['index.html','app.js','styles.css','media/general-admission.mjs'];const assets=new Map(resources.map(name=>[name,fs.readFileSync(path.join(root,name))]));
  report.sourceHashes=Object.fromEntries([...assets].map(([name,bytes])=>[name,hash(bytes)]));report.overrideRequests={};
  // Playwright owns this page's CDP Fetch session; avoid competing Fetch owners.
  await page.route('**/*',async route=>{const url=new URL(route.request().url());const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(url.origin!==origin||!assets.has(name))return route.continue();report.overrideRequests[name]=(report.overrideRequests[name]||0)+1;
    return route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'text/javascript',headers:{'Cache-Control':'no-store'},body:assets.get(name)});
  });
  await cdp.send('Network.enable');
  await cdp.send('Network.setBypassServiceWorker',{bypass:true});
  await page.goto(origin+'/?responsiveAndroidLocal=1',{waitUntil:'networkidle',timeout:45000});
  await page.evaluate(()=>import('./media/general-admission.mjs?responsiveAndroidParity=1').then(()=>true));
  await cdp.send('Network.setBypassServiceWorker',{bypass:false});
  if(!await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))){
    await claimExistingWorker();
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:10000});
    const originalChanges=await originalPage.evaluate(()=>window.__responsiveControlChanges);report.existingWorkerNativeClaim={testTabControlled:true,originalTabControllerChanges:originalChanges};
    if(originalChanges!==0)throw Error('ORIGINAL_TAB_CONTROLLER_CHANGED');
  }
  await page.waitForFunction(()=>Boolean(state.authAccountKey)&&!el.libraryView.hidden,{timeout:30000});
  const overriddenShell=resources.every(n=>report.overrideRequests[n]>0);
  step('local source admission',{overriddenShell,swControlled:await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight}))});
  if(!overriddenShell)throw Error('LOCAL_SOURCE_OVERRIDE_NOT_ADMITTED');
  await discover();await prepareCatalog();await play(0,'local startup');await seek('local seek');await gestures('portrait');
  rotation={automatic:cmd(['-s',serial,'shell','settings','get','system','accelerometer_rotation']),user:cmd(['-s',serial,'shell','settings','get','system','user_rotation'])};
  cmd(['-s',serial,'shell','settings','put','system','accelerometer_rotation','0']);cmd(['-s',serial,'shell','settings','put','system','user_rotation','1']);
  await page.waitForFunction(()=>innerWidth>innerHeight,{timeout:10000});await page.waitForTimeout(600);await gestures('landscape');
  await page.evaluate(()=>setPlayerChromeVisible(false));const swipeBefore=await page.evaluate(()=>state.selected.id),r=(await state()).stage;
  const x=r.x+r.width*.65,y=r.y+r.height*.5;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-r.width*.5*i/8,y,id:1}]});await page.waitForTimeout(30);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(previous=>state.selected.id!==previous&&el.mediaLoading.hidden,swipeBefore,{timeout:45000});
  step('landscape horizontal swipe',{passed:true,withinScopedSamples:await page.evaluate(()=>__responsiveFiles.some(f=>f.id===state.selected.id))});
  await play(2,'local third sample startup');await seek('local third sample seek');await page.evaluate(()=>closePlayer());
  report.completed=true;report.performanceClaim='one sequential matched clip, warming and transport noise; no speed improvement established';
 }catch(e){report.completed=false;report.failure=/^[A-Z_]+$/.test(e.message)?e.message:'ANDROID_QA_OPERATION_FAILED';report.failureDetail=String(e.message).replace(/https?:\/\/\S+/g,'[url]').slice(0,180);}
 finally{
  if(rotation&&serial){try{cmd(['-s',serial,'shell','settings','put','system','accelerometer_rotation',rotation.automatic]);cmd(['-s',serial,'shell','settings','put','system','user_rotation',rotation.user]);report.cleanup.rotationRestored=true;}catch{report.cleanup.rotationRestored=false;}}
  if(cdp){try{await cdp.send('Network.setBypassServiceWorker',{bypass:false});await page.unrouteAll({behavior:'wait'});report.cleanup.overridesRemoved=true;}catch{report.cleanup.overridesRemoved=false;}}
  if(page){try{await page.evaluate(()=>{if(typeof closePlayer==='function')closePlayer();});await page.close();report.cleanup.testTabClosed=true;}catch{report.cleanup.testTabClosed=false;}}
  if(originalPage){try{await originalPage.evaluate(()=>{navigator.serviceWorker.removeEventListener('controllerchange',window.__responsiveControlListener);delete window.__responsiveControlListener;delete window.__responsiveControlChanges;});
    await originalPage.bringToFront();report.cleanup.originalTabRestored=prior.every(p=>!p.page.isClosed()&&p.page.url()===p.url);}catch{report.cleanup.originalTabRestored=false;}}
  if(cdp)await cdp.detach().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(client)await client.close().catch(()=>{});
  if(port&&serial){try{cmd(['-s',serial,'forward','--remove',`tcp:${port}`]);report.cleanup.forwardRemoved=true;}catch{report.cleanup.forwardRemoved=false;}}
  report.cleanup.complete=Object.values(report.cleanup).every(v=>v===true);save();
 }
 console.log(JSON.stringify({completed:report.completed,failure:report.failure||null,cleanup:report.cleanup}));if(!report.completed||!report.cleanup.complete)process.exitCode=1;
})();
