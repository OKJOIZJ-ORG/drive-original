'use strict';
// Physical Android: disposable local helper, or existing normal tab with --production.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require('../node_modules/playwright');
const root=path.resolve(__dirname,'../..'),owner=path.dirname(root),production=process.argv.includes('--production');
const out=path.join(owner,'maintenance/tools/uiux-followup'),origin='https://drive-original.jyw-drive.workers.dev';
const adb=path.join(owner,'maintenance/tools/scrcpy-v4.1/scrcpy-win64-v4.1/adb.exe');
fs.mkdirSync(out,{recursive:true});
const report={oracleCorrection:'Seek settlement requires both native video.seeking and actual isSeekingPointer false; prior raw observations preserved.',at:new Date().toISOString(),mode:production?'production':'local scoped overrides',scope:'trusted CDP touch on physical Android; not human finger acceptance',steps:[],cleanup:{}};
let serial,port,client,browser,page,cdp,rotation,originalUrl,originalPage,prior=[],touchActive=false,priorStayAwake;
const libraryOnly=process.argv.includes('--library-only');
const landscapeCorners=process.argv.includes('--landscape-corners-only');
const cornersOnly=process.argv.includes('--corners-only')||landscapeCorners;
const controls=process.argv.includes('--controls')||libraryOnly||cornersOnly;
const expectedVersion=process.argv.find(arg=>arg.startsWith('--version='))?.slice(10)||(cornersOnly?'1.23.3':controls?'1.23.2':'1.23.1');
const resultPath=path.join(out,`${production?'production':'local'}-${landscapeCorners?'landscape-corners':cornersOnly?'corners':libraryOnly?'library':controls?'controls':'baseline'}-result.json`);
if(fs.existsSync(resultPath))fs.copyFileSync(resultPath,path.join(out,`${production?'production':'local'}-prior-${new Date().toISOString().replace(/[:.]/g,'-')}.json`));
const save=()=>fs.writeFileSync(resultPath,JSON.stringify(report,null,2));
const step=(name,data={})=>{report.steps.push({name,...data});save();console.log(JSON.stringify({step:name,...data}));};
const requireThat=(condition,code)=>{if(!condition)throw Error(code);};
function cmd(args){const r=spawnSync(adb,args,{encoding:'utf8',windowsHide:true,timeout:15000});if(r.status!==0||r.error)throw Error('ADB_OPERATION_FAILED');return r.stdout.trim();}
function pkg(name){const base=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx');const p=fs.readdirSync(base).map(d=>path.join(base,d,'node_modules',name)).find(p=>fs.existsSync(path.join(p,'package.json')));if(!p)throw Error('CACHED_DEPENDENCY_MISSING');return p;}
async function inspectExistingWorker({claim=false}={}){
  if(claim)requireThat(!production,'PRODUCTION_MUST_NOT_CLAIM_WORKER');
  const info=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json(),ws=new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let id=0,attached;const waiting=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data),resolve=waiting.get(m.id);if(resolve){waiting.delete(m.id);resolve(m);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>{waiting.delete(requestId);reject(Error('WORKER_COMMAND_TIMEOUT'));},10000);
    waiting.set(requestId,m=>{clearTimeout(timer);m.error?reject(Error('WORKER_COMMAND_FAILED')):resolve(m.result);});ws.send(JSON.stringify({id:requestId,method,params,...(sessionId?{sessionId}:{})}));});
  try{const targets=await send('Target.getTargets'),matches=targets.targetInfos.filter(t=>t.type==='service_worker'&&t.url===origin+'/sw.js');requireThat(matches.length===1,'EXACT_ACTIVE_WORKER_TARGET_AMBIGUOUS');
    attached=await send('Target.attachToTarget',{targetId:matches[0].targetId,flatten:true});
    const active=await send('Runtime.evaluate',{expression:"({active:self.registration.active?.scriptURL===self.location.href,scope:self.registration.scope,version:typeof VERSION==='string'?VERSION:null,installing:Boolean(self.registration.installing),waiting:Boolean(self.registration.waiting),state:self.registration.active?.state})",returnByValue:true},attached.sessionId);
    requireThat(active.result?.value?.active&&active.result.value.scope===origin+'/','EXACT_ACTIVE_WORKER_OWNER_UNCONFIRMED');
    if(claim){const result=await send('Runtime.evaluate',{expression:'self.clients.claim()',awaitPromise:true,returnByValue:true},attached.sessionId);requireThat(!result.exceptionDetails,'LOCAL_WORKER_CLAIM_FAILED');}
    const {version,installing,waiting,state}=active.result.value;return {version,installing,waiting,state,exactActiveOwner:true};
  }finally{if(attached)await send('Target.detachFromTarget',{sessionId:attached.sessionId}).catch(()=>{});ws.close();}
}
async function observe(){return page.evaluate(()=>({paused:el.videoPlayer.paused,time:playerTimeline().currentTime,duration:playerTimeline().duration,
  nativeSeeking:el.videoPlayer.seeking,pointerSeeking:isSeekingPointer,ready:el.videoPlayer.classList.contains('is-ready'),loading:!el.mediaLoading.hidden,error:!el.mediaError.hidden,
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
async function play(index,label){report.activeOperation=label;save();const started=Date.now();await page.evaluate(i=>openPlayer(window.__uiuxFiles[i]),index);
  await page.waitForFunction(()=>!el.videoPlayer.paused&&el.videoPlayer.classList.contains('is-ready')&&el.mediaLoading.hidden,null,{timeout:45000});
  const a=await observe();await page.waitForTimeout(2000);const b=await observe();
  requireThat(b.frames>a.frames&&b.time>a.time&&!b.error,'PLAYBACK_DID_NOT_ADVANCE');requireThat(Math.abs(b.duration-(index===0?47.8:2513))<(index===0?2:12),'ACTUAL_DURATION_MISMATCH');
  step(label,{sample:index,startupMs:Date.now()-started-2000,actualDuration:b.duration,secondsAdvanced:b.time-a.time,framesAdvanced:b.frames-a.frames});}
async function seekGesture(label,drag,position={}){await page.evaluate(()=>revealPlayerChrome({touch:true}));
  const loc=page.locator(position.selector||'#mobileShortsProgressTrack');const r=await loc.boundingBox();requireThat(r&&r.width>80&&r.height>=20,'SEEK_TRACK_TARGET_MISSING');
  if(controls)requireThat(r.height>=43.5,'MOBILE_SEEK44PX_MISSING');
  const before=await observe(),ratio=position.ratio??(drag?.67:.27),y=position.edge==='top'?r.y+2:position.edge==='bottom'?r.y+r.height-2:r.y+r.height/2,target=before.duration*ratio,started=Date.now();
  if(drag){const x=r.x+r.width*.35;await input('touchStart',[{x,y,id:1}]);
    for(let i=1;i<=9;i++){await input('touchMove',[{x:r.x+r.width*(.35+(ratio-.35)*i/9),y,id:1}]);await page.waitForTimeout(35);}
    await input('touchEnd',[]);
  }else await touch(r.x+r.width*ratio,y,0);
  await page.waitForFunction(t=>!el.videoPlayer.seeking&&!isSeekingPointer&&Math.abs(playerTimeline().currentTime-t)<Math.max(3,playerTimeline().duration*.005)&&el.mediaLoading.hidden,target,{timeout:45000});
  const after=await observe();requireThat(!after.error&&Math.abs(after.time-before.time)>before.duration*.05,'TRUSTED_SEEK_DID_NOT_MOVE');
  step(label,{gesture:drag?'touch drag with nine moves':'touch tap',targetSeconds:target,time:after.time,settledMs:Date.now()-started,nativeSeeking:after.nativeSeeking,pointerSeeking:after.pointerSeeking,trackHeight:r.height,hitY:position.edge||'middle',railPosition:{x:ratio,y:y-r.y}});}
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
  const tracks=await page.evaluate(()=>({audioTrackCount:playerTracksOwner?.inventory?.audioTracks?.length??null,
    subtitleTrackCount:playerTracksOwner?.subtitles?.tracks?.length??playerTracksOwner?.inventory?.subtitleTracks?.length??0,
    inventoryReason:playerTracksOwner?.inventory?.reason||null,
    selectedAudioOptionText:el.playerAudioTrack.selectedOptions?.[0]?.textContent||'',selectedSubtitleOptionText:el.playerSubtitleTrack.selectedOptions?.[0]?.textContent||''}));
  step(label+' outcome',{elapsedMs:Date.now()-start,phase:result.trackPhase,reads:result.reads,duration:result.duration,...tracks});await screenshot(label+'-tracks');
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

async function details(){return page.evaluate(()=>{
  const v=el.videoPlayer,quality=v.getVideoPlaybackQuality?.();
  return {wall:Date.now(),sample:window.__uiuxFiles?.findIndex(f=>f.id===state.selected?.id),time:playerTimeline().currentTime,
    duration:playerTimeline().duration,rate:v.playbackRate,frames:quality?.totalVideoFrames||0,dropped:quality?.droppedVideoFrames||0,
    paused:v.paused,ended:v.ended,seeking:v.seeking,pointerSeeking:isSeekingPointer,readyState:v.readyState,networkState:v.networkState,
    ready:v.classList.contains('is-ready'),loading:!el.mediaLoading.hidden,error:!el.mediaError.hidden,nativeErrorCode:v.error?.code??null,
    controls:!el.playerModal.classList.contains('controls-idle'),visibility:document.visibilityState,hasFocus:document.hasFocus(),
    width:v.videoWidth,height:v.videoHeight,attempt:state.mediaAttempt,mode:state.mediaPlaybackMode,
    transportVerified:state.mediaTransportVerified,transportStarted:state.mediaTransportStarted,decodeVerified:state.mediaDecodeVerified,
    currentSrcKind:!v.currentSrc?'empty':v.currentSrc.startsWith('blob:')?'blob':v.currentSrc.startsWith(location.origin)?'same-origin':'other-origin',
    buffered:Array.from({length:Math.min(v.buffered.length,4)},(_,i)=>[v.buffered.start(i),v.buffered.end(i)]),
    q1:Boolean(q1Playback),q1Retired:q1RetirementResult?.settled??null,tracksRetired:playerTracksRetirementResult?.settled??null,
    eventCounts:{...window.__followEventCounts},eventTail:window.__followEvents?.slice(-8)||[]};
});}

async function prepareObservers(){await page.evaluate(()=>{
  window.__followEvents=[];window.__followEventCounts={};
  window.__followListeners=['loadstart','loadedmetadata','loadeddata','canplay','playing','pause','waiting','stalled','error','ended','seeking','seeked','abort','emptied','ratechange'].map(type=>{
    const fn=()=>{window.__followEventCounts[type]=(window.__followEventCounts[type]||0)+1;
      if(window.__followEvents.length<4096)window.__followEvents.push({type,wall:Date.now(),time:el.videoPlayer.currentTime,
        readyState:el.videoPlayer.readyState,networkState:el.videoPlayer.networkState,nativeErrorCode:el.videoPlayer.error?.code??null});};
    el.videoPlayer.addEventListener(type,fn);return{type,fn};
  });
});}

async function closeSample(){if(await page.evaluate(()=>!el.playerSheet.hidden)){
  await page.evaluate(()=>revealPlayerChrome({touch:true}));await tap('#closePlayerButton',0);
  await page.waitForFunction(()=>el.playerSheet.hidden,null,{timeout:10000});
  await page.evaluate(()=>Promise.all([q1Retirement,playerTracksRetirement]).then(()=>true));
}}

async function openSample(index,label){
  await closeSample();const selected=await page.evaluate(i=>state.files.findIndex(f=>f.id===window.__uiuxFiles[i].id),index);
  requireThat(selected>=0,'SCOPED_SAMPLE_NOT_RENDERED');
  const locator=page.locator('.file-card-open').nth(selected);await locator.scrollIntoViewIfNeeded();
  const box=await locator.boundingBox();requireThat(box?.width&&box?.height,'SCOPED_CARD_NOT_VISIBLE');
  report.activeOperation=label;save();const started=Date.now();await touch(box.x+box.width/2,box.y+box.height/2,0);
  const snapshots=[];let firstProgress=null,readyAt=null,initial=null,last=null;
  while(Date.now()-started<55000){const current=await details();snapshots.push({...current,elapsedMs:Date.now()-started});
    if(!initial||current.time<initial.time)initial=current;
    if(current.ready&&!current.loading&&!current.paused&&readyAt===null)readyAt=Date.now()-started;
    if(last&&current.frames>last.frames&&current.time>last.time&&!current.paused){firstProgress=Date.now()-started;break;}
    if(current.error||current.nativeErrorCode)break;last=current;await page.waitForTimeout(1000);
  }
  const actual=snapshots.at(-1),passed=firstProgress!==null&&!actual.error&&!actual.nativeErrorCode;
  report.startups??=[];report.startups.push({label,sample:index,passed,firstProgressMs:firstProgress,oldOracleSatisfiedMs:readyAt,
    oracleDifference:firstProgress!==null&&readyAt===null,observations:snapshots});save();
  step(label,{sample:index,passed,firstProgressMs:firstProgress,oldOracleSatisfiedMs:readyAt,
    actualTime:actual.time,frames:actual.frames,ready:actual.ready,loading:actual.loading,paused:actual.paused,
    readyState:actual.readyState,nativeErrorCode:actual.nativeErrorCode,attempt:actual.attempt,mode:actual.mode});
  requireThat(passed,'ACTUAL_STARTUP_FAILED');requireThat(Math.abs(actual.duration-(index===0?47.8:2513))<(index===0?2:12),'ACTUAL_DURATION_MISMATCH');
  return actual;
}

async function sustain(){
  await openSample(1,'15-minute long MP4 entry');await page.evaluate(()=>{el.videoPlayer.playbackRate=1;});
  const initial=await details();requireThat(initial.time<12&&initial.rate===1,'SUSTAINED_START_POSITION_OR_RATE');
  report.sustained={requestedSeconds:900,input:'trusted card touch; 1x, no seeks during interval',initial,samples:[]};save();
  const started=Date.now();let previous=initial;
  while(Date.now()-started<900000){await page.waitForTimeout(Math.min(10000,900000-(Date.now()-started)));
    const sample=await details();sample.wallElapsedMs=Date.now()-started;sample.mediaAdvance=sample.time-initial.time;
    sample.frameAdvance=sample.frames-initial.frames;sample.intervalMediaAdvance=sample.time-previous.time;
    sample.intervalFrameAdvance=sample.frames-previous.frames;
    sample.noAdvance=sample.intervalMediaAdvance<.5||sample.intervalFrameAdvance===0;
    report.sustained.samples.push(sample);previous=sample;save();
    console.log(JSON.stringify({sustainedSeconds:Math.round(sample.wallElapsedMs/1000),mediaAdvance:sample.mediaAdvance,
      frameAdvance:sample.frameAdvance,loading:sample.loading,paused:sample.paused,error:sample.error,nativeErrorCode:sample.nativeErrorCode,
      noAdvance:sample.noAdvance,visibility:sample.visibility,controls:sample.controls}));
    if(sample.error||sample.nativeErrorCode||sample.paused||sample.visibility!=='visible')throw Error('SUSTAINED_PLAYBACK_INTERRUPTED');
  }
  const last=report.sustained.samples.at(-1);report.sustained.finished=last;report.sustained.realWallSeconds=(Date.now()-started)/1000;
  report.sustained.observedNoAdvanceIntervals=report.sustained.samples.filter(s=>s.noAdvance).length;
  report.sustained.passed=report.sustained.realWallSeconds>=900&&last.mediaAdvance>=885&&last.frameAdvance>20000
    &&last.rate===1&&!last.ended&&last.eventCounts.seeking===initial.eventCounts.seeking;
  step('bounded15-minute playback',{passed:report.sustained.passed,wallSeconds:report.sustained.realWallSeconds,
    mediaAdvance:last.mediaAdvance,frameAdvance:last.frameAdvance,noAdvanceIntervals:report.sustained.observedNoAdvanceIntervals,
    events:last.eventCounts});requireThat(report.sustained.passed,'SUSTAINED_PROGRESS_INSUFFICIENT');
}

async function controlledTrackFault(){
  await openSample(1,'optional tracks fault source');let failed=0,intercepted=0;
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'https://www.googleapis.com/drive/v3/files/*?alt=media*',requestStage:'Request'}]});
  const handler=async event=>{intercepted++;const headers=event.request.headers;
    if(!failed&&Object.keys(headers).some(key=>key.toLowerCase()==='range')){failed++;await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'ConnectionFailed'});}
    else await cdp.send('Fetch.continueRequest',{requestId:event.requestId});};
  cdp.on('Fetch.requestPaused',handler);
  try{
    const before=await details();await page.evaluate(()=>revealPlayerChrome({touch:true}));await tap('#shortsMoreBtn',80);await tap('#shortsTracksBtn',0);
    await page.waitForFunction(()=>playerTracksOwner&&!playerTracksOwner.checking,null,{timeout:35000});
    const fault=await page.evaluate(()=>({phase:playerTracksOwner.phase,reason:playerTracksOwner.reason,
      retry:!el.playerTracksRetry.hidden&&!el.playerTracksRetry.disabled,cleanup:playerTracksOwner.cleanupOk}));
    const after=await details();step('controlled optional track Range failure',{fault,intercepted,failed,nativeFrameAdvance:after.frames-before.frames,
      nativeTimeAdvance:after.time-before.time,nativeErrorCode:after.nativeErrorCode,label:'one page-owned direct-Drive Range; controlled fault, not observed outage'});
    requireThat(failed===1&&fault.phase==='failed'&&fault.retry&&after.frames>before.frames&&!after.nativeErrorCode&&!after.error,'OPTIONAL_FAULT_ISOLATION_FAILED');
  }finally{await cdp.send('Fetch.disable');cdp.off('Fetch.requestPaused',handler);}
  await tap('#playerTracksRetry',0);await page.waitForFunction(()=>playerTracksOwner&&!playerTracksOwner.checking,null,{timeout:35000});
  const retry=await observe();step('controlled optional track retry',{phase:retry.trackPhase,reads:retry.reads,nativeError:retry.error});
  requireThat(['ready','unsupported'].includes(retry.trackPhase)&&!retry.error,'OPTIONAL_FAULT_RETRY_FAILED');await tap('#playerTracksClose');
  await pendingFence();
}

async function railEdges(label){
  await seekGesture(label+' top+2 tap',false,{ratio:.15,edge:'top'});
  await seekGesture(label+' bottom-2 tap',false,{ratio:.8,edge:'bottom'});
  await seekGesture(label+' top+2 drag',true,{ratio:.55,edge:'top'});
  await seekGesture(label+' bottom-2 drag',true,{ratio:.7,edge:'bottom'});
  const rect=await page.locator('#mobileShortsProgressTrack').boundingBox();
  await seekGesture(label+' left endpoint top+2',false,{ratio:2/rect.width,edge:'top'});
  await seekGesture(label+' right endpoint bottom-2',false,{ratio:1-2/rect.width,edge:'bottom'});
  const geometry=await page.locator('#mobileShortsProgressTrack').evaluate(n=>({hitHeight:n.getBoundingClientRect().height,
    railHeight:getComputedStyle(n,'::before').height,outline:getComputedStyle(n).outlineWidth}));
  step(label+' full-height rail geometry',geometry);await screenshot(label+'-thin-rail');
  requireThat(geometry.hitHeight>=43.5&&Math.abs(parseFloat(geometry.railHeight)-3)<.5,'THIN_RAIL_FULL_HIT_GEOMETRY');
}

async function rectangleCorners(){
  if(landscapeCorners){cmd(['-s',serial,'shell','settings','put','system','user_rotation','1']);await page.waitForFunction(()=>innerWidth>innerHeight,null,{timeout:10000});}
  await openSample(1,'corner spot-check long entry');
  const selector=landscapeCorners?'#seekBarContainer':'#mobileShortsProgressTrack';
  await page.evaluate(()=>revealPlayerChrome({touch:true}));
  const availability=await page.evaluate(selector=>{const n=document.querySelector(selector),parent=n.closest('.custom-video-controls'),mobile=el.mobileShortsProgressTrack;return{viewport:{width:innerWidth,height:innerHeight},coarse:matchMedia('(pointer:coarse)').matches,targetId:n.id,targetRect:n.getBoundingClientRect().toJSON(),parentDisplay:parent?getComputedStyle(parent).display:null,mobileRect:mobile.getBoundingClientRect().toJSON(),visible:n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0};},selector);
  step('normal affected-layer target availability',availability);
  if(!availability.visible){report.cornerAcceptance={tested:false,reason:'normal physical landscape uses mobile track; desktop seek container hidden'};await screenshot('landscape-affected-layer-unavailable');return;}
  for(const [horizontal,vertical]of[['right','top'],['left','top'],['right','bottom'],['left','bottom']]){
    await page.evaluate(()=>revealPlayerChrome({touch:true}));
    const r=await page.locator(selector).boundingBox();
    const x=horizontal==='left'?r.x+2:r.x+r.width-2,y=vertical==='top'?r.y+2:r.y+r.height-2;
    const hit=await page.evaluate(({x,y,selector})=>{const n=document.elementFromPoint(x,y),track=document.querySelector(selector);return{target:n?.id||n?.tagName,inside:track===n||track.contains(n)};},{x,y,selector});
    requireThat(hit.inside,'RECTANGLE_CORNER_NOT_HITTABLE');
    await seekGesture(`rectangle ${horizontal}/${vertical} corner`,false,{ratio:horizontal==='left'?2/r.width:1-2/r.width,edge:vertical,selector});
    const before=await details();await page.waitForTimeout(600);const after=await details();
    requireThat(after.time>before.time&&after.frames>before.frames&&!after.nativeErrorCode&&!after.error,'CORNER_PLAYBACK_DID_NOT_ADVANCE');
    step('actual rectangle corner hit and playback',{horizontal,vertical,hit,intrinsicVideoDimensions:{width:after.width,height:after.height},nativeFrameAdvance:after.frames-before.frames,nativeTimeAdvance:after.time-before.time});
  }
  report.cornerAcceptance={tested:true,passed:true,target:selector};await screenshot(landscapeCorners?'landscape-four-corner-spotcheck':'portrait-four-corner-spotcheck');
}

async function libraryChecks(){
  await closeSample();await tap('#breadcrumbTrail button.crumb',0);
  await page.waitForFunction(()=>state.currentFolderId==='root'&&!state.loadingFiles&&!state.loadingTree&&!state.loadingFavorites&&!el.refreshButton.disabled,null,{timeout:30000});
  const header=await page.evaluate(()=>{const refresh=el.refreshButton,head=refresh.closest('.library-header'),r=refresh.getBoundingClientRect(),h=head.getBoundingClientRect();
    return{viewport:{width:innerWidth,height:innerHeight},refresh:r.toJSON(),header:h.toJSON(),labelDisplay:getComputedStyle(refresh.querySelector('span')).display,
      overflow:document.documentElement.scrollWidth>innerWidth+1,disabled:refresh.disabled,coarse:matchMedia('(pointer:coarse)').matches};});
  step('actual360 refresh layout',header);requireThat(header.viewport.width===360&&header.refresh.width>=43.5&&header.refresh.height>=43.5&&!header.overflow,'ACTUAL_NARROW_REFRESH_LAYOUT');
  await screenshot('portrait-library-refresh');
  let folder=page.locator('.folder-row').filter({has:page.locator('.folder-name',{hasText:/^추억$/})});
  if(!await folder.count()&&await page.locator('#folderMoreButton').isVisible())await tap('#folderMoreButton',0);
  requireThat(await folder.count()===1,'ACTUAL_MEMORY_FOLDER_AMBIGUOUS');
  const original=await folder.evaluate(n=>({background:getComputedStyle(n).backgroundColor,shadow:getComputedStyle(n).boxShadow}));
  const r=await folder.boundingBox();await touch(r.x+r.width/2,r.y+r.height/2,0);
  await page.waitForFunction(()=>state.currentFolderName==='추억'&&!state.loadingFiles&&!state.loadingTree&&!state.loadingFavorites&&!el.refreshButton.disabled,null,{timeout:30000});await screenshot('portrait-folder-navigation');
  await tap('#breadcrumbTrail button.crumb',0);await page.waitForFunction(()=>state.currentFolderId==='root'&&!state.loadingFiles&&!state.loadingTree&&!state.loadingFavorites&&!el.refreshButton.disabled,null,{timeout:30000});
  folder=page.locator('.folder-row').filter({has:page.locator('.folder-name',{hasText:/^추억$/})});await page.waitForTimeout(600);
  const returned=await folder.evaluate(n=>({background:getComputedStyle(n).backgroundColor,shadow:getComputedStyle(n).boxShadow,hover:n.matches(':hover'),focusVisible:n.matches(':focus-visible')}));
  step('actual folder touch/back hover',{original,returned});requireThat(original.background===returned.background&&original.shadow===returned.shadow,'RETAINED_FOLDER_HOVER_BACKGROUND');await screenshot('portrait-folder-back');
  const image=await page.evaluate(async()=>{
    const results=await collectAllPages(async token=>{const p=new URLSearchParams({q:"trashed=false and mimeType='image/png'",fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,size,resourceKey,capabilities(canDownload),imageMediaMetadata(width,height))',pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});if(token)p.set('pageToken',token);return(await driveFetch(`${DRIVE_API}/files?${p}`)).json();});
    const matches=results.items.filter(f=>Number(f.size)===62209&&f.capabilities?.canDownload!==false);if(matches.length!==1)throw Error('ACTUAL_PNG_SIZE_AMBIGUOUS');
    window.__followImage=matches[0];state.files=[window.__followImage];state.folders=[];state.nextPageToken=null;state.populationComplete=true;renderFiles({resetWindow:true});
    return{sampleBytes:Number(matches[0].size),mime:matches[0].mimeType};
  });
  const selectedBefore=await page.evaluate(()=>state.selectedFileIds.size);await tap('.file-card-open',0);
  await page.waitForFunction(()=>!el.playerSheet.hidden&&!el.imageViewer.hidden&&el.imageViewer.naturalWidth>0&&el.mediaLoading.hidden,null,{timeout:30000});
  const decoded=await page.evaluate(()=>({width:el.imageViewer.naturalWidth,height:el.imageViewer.naturalHeight,selectionCount:state.selectedFileIds.size,
    nextLabel:el.ctrlNextVideo.title,qualityHidden:el.playerQuality.hidden}));await screenshot('portrait-actual-png');await closeSample();
  const cardTouch=await page.locator('.file-card-open').evaluate(n=>({pressed:n.getAttribute('aria-pressed'),selected:n.closest('.file-card').classList.contains('selected'),focusVisible:n.matches(':focus-visible'),hover:n.matches(':hover')}));
  requireThat(decoded.selectionCount===selectedBefore&&decoded.qualityHidden&&decoded.nextLabel==='다음 이미지','IMAGE_TOUCH_SELECTION_OR_LABEL');
  await page.locator('.file-card-open').focus();await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
  const keyboard=await page.locator('.file-card-open').evaluate(n=>({focused:n===document.activeElement,focusVisible:n.matches(':focus-visible'),pressed:n.getAttribute('aria-pressed'),selected:n.closest('.file-card').classList.contains('selected')}));
  step('actual PNG/card touch and keyboard distinction',{image,decoded,touch:cardTouch,keyboard,selectedBefore});requireThat(keyboard.focused&&keyboard.focusVisible&&keyboard.pressed===cardTouch.pressed&&keyboard.selected===cardTouch.selected,'KEYBOARD_FOCUS_SELECTION_DISTINCTION');
  await screenshot('portrait-card-keyboard-focus');
}
(async()=>{try{
  const devices=cmd(['devices','-l']).split(/\r?\n/).filter(l=>/^\S+\s+device(?:\s|$)/.test(l));requireThat(devices.length===1,'AUTHORIZED_DEVICE_COUNT');serial=devices[0].split(/\s+/)[0];
  report.device={model:cmd(['-s',serial,'shell','getprop','ro.product.model']),android:cmd(['-s',serial,'shell','getprop','ro.build.version.release'])};requireThat(report.device.model==='SM-F711N','DEVICE_MODEL_CHANGED');
  port=Number(cmd(['-s',serial,'forward','tcp:0','localabstract:chrome_devtools_remote']));
  report.device.browser=(await(await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
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
  const network=new Map();report.network={requestCounts:{},responseStatusCounts:{},failures:[]};
  cdp.on('Network.requestWillBeSent',event=>{const url=new URL(event.request.url),kind=url.origin===origin?(url.pathname.startsWith('/media/')?'pinned media':event.type):url.hostname==='www.googleapis.com'?'direct Drive':event.type;
    network.set(event.requestId,{kind,started:Date.now()});report.network.requestCounts[kind]=(report.network.requestCounts[kind]||0)+1;});
  cdp.on('Network.responseReceived',event=>{const kind=network.get(event.requestId)?.kind||event.type,key=`${kind}:${event.response.status}`;report.network.responseStatusCounts[key]=(report.network.responseStatusCounts[key]||0)+1;});
  cdp.on('Network.loadingFailed',event=>{const request=network.get(event.requestId);if(report.network.failures.length<100)report.network.failures.push({kind:request?.kind||event.type,elapsedMs:request?Date.now()-request.started:null,canceled:event.canceled===true,error:event.errorText.replace(/https?:\/\/\S+/g,'[url]').slice(0,100)});network.delete(event.requestId);});
  cdp.on('Network.loadingFinished',event=>network.delete(event.requestId));
  const assets=new Map(['index.html','app.js','styles.css','media/general-tracks.mjs','media/subtitle-track.mjs'].map(name=>[name,fs.readFileSync(path.join(root,name))]));
  report.localPreparationHashes=Object.fromEntries([...assets].map(([name,b])=>[name,crypto.createHash('sha256').update(b).digest('hex')]));report.overrideRequests={};
  if(!production){await page.route('**/*',async route=>{const u=new URL(route.request().url()),name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(u.origin!==origin||!assets.has(name))return route.continue();report.overrideRequests[name]=(report.overrideRequests[name]||0)+1;return route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'text/javascript',headers:{'Cache-Control':'no-store'},body:assets.get(name)});});await cdp.send('Network.setBypassServiceWorker',{bypass:true});}
  await page.reload({waitUntil:'domcontentloaded',timeout:45000});
  if(!production)await page.evaluate(()=>Promise.all([import('./media/general-tracks.mjs'),import('./media/subtitle-track.mjs')]).then(()=>true));
  await cdp.send('Network.setBypassServiceWorker',{bypass:false});
  if(!production&&!await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))){await inspectExistingWorker({claim:true});
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:10000});
    const originalChanges=await originalPage.evaluate(()=>window.__uiuxControlChanges);requireThat(originalChanges===0,'ORIGINAL_TAB_CONTROLLER_CHANGED');
    step('local controlled helper setup',{exactExistingWorker:true,nativeClientClaim:true,originalTabControllerChanges:originalChanges,productionProof:false});}
  await page.waitForFunction(()=>typeof state!=='undefined'&&Boolean(state.authAccountKey)&&!el.libraryView.hidden,null,{timeout:30000});
  if(production&&controls&&await page.evaluate(()=>APP_VERSION)!==expectedVersion){
    await page.evaluate(()=>checkForAppUpdate({manual:false}));
    await page.waitForFunction(()=>!el.updateBanner.hidden,null,{timeout:20000});
    const before=await page.evaluate(()=>APP_VERSION);await tap('#bannerUpdateButton',0);
    await page.waitForFunction(version=>typeof APP_VERSION!=='undefined'&&APP_VERSION===version&&Boolean(state.authAccountKey)&&!el.libraryView.hidden,expectedVersion,{timeout:45000});
    step('normal trusted update button',{from:before,to:await page.evaluate(()=>APP_VERSION),sourceOverrides:0});
  }
  requireThat(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),'EXISTING_TAB_NOT_WORKER_CONTROLLED');
  if(!production)requireThat(['index.html','app.js','styles.css'].every(n=>report.overrideRequests[n]>0),'LOCAL_SHELL_OVERRIDE_MISSING');
  const version=await page.evaluate(()=>APP_VERSION);if(production)requireThat(version===expectedVersion,'PRODUCTION_VERSION_NOT_ADMITTED');
  if(production){report.activeOperation='normal active worker version gate';save();
    if(controls)await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
    await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return Boolean(r?.active&&!r.installing&&!r.waiting&&navigator.serviceWorker.controller?.state==='activated');},null,{timeout:20000});
    let worker;for(let attempt=0;attempt<10;attempt++){
      try{worker=await inspectExistingWorker();if(worker.version===expectedVersion)break;}catch(error){if(error.message!=='EXACT_ACTIVE_WORKER_TARGET_AMBIGUOUS')throw error;}
      await page.waitForTimeout(1500);
    }
    step('normal active worker admission',worker||{});
    requireThat(worker.version===expectedVersion&&!worker.installing&&!worker.waiting&&worker.state==='activated','PRODUCTION_ACTIVE_WORKER_NOT_ADMITTED');}
  step('source admission',{version,swControlled:true,production});step('authenticated duration samples',await discover());
  rotation={automatic:cmd(['-s',serial,'shell','settings','get','system','accelerometer_rotation']),user:cmd(['-s',serial,'shell','settings','get','system','user_rotation'])};
  priorStayAwake=cmd(['-s',serial,'shell','settings','get','global','stay_on_while_plugged_in']);
  cmd(['-s',serial,'shell','settings','put','global','stay_on_while_plugged_in','3']);
  cmd(['-s',serial,'shell','input','keyevent','224']);
  cmd(['-s',serial,'shell','settings','put','system','accelerometer_rotation','0']);cmd(['-s',serial,'shell','settings','put','system','user_rotation','0']);await page.waitForFunction(()=>innerHeight>innerWidth,null,{timeout:10000});
  await prepareObservers();
  if(cornersOnly){await rectangleCorners();
  }else if(libraryOnly){await libraryChecks();
  }else if(controls){
    await openSample(0,'portrait short entry');await gestures('portrait');await endedRestart();await railEdges('portrait short');
    await openSample(1,'portrait long entry');await railEdges('portrait long');
    cmd(['-s',serial,'shell','settings','put','system','user_rotation','1']);await page.waitForFunction(()=>innerWidth>innerHeight,null,{timeout:10000});
    await railEdges('landscape long');await gestures('landscape');await swipe();
    cmd(['-s',serial,'shell','settings','put','system','user_rotation','0']);await page.waitForFunction(()=>innerHeight>innerWidth,null,{timeout:10000});
    await libraryChecks();
  }else{
    for(let cycle=1;cycle<=3;cycle++)for(const index of[0,1])await openSample(index,`cycle${cycle} ${index?'long':'short'} startup`);
    await sustain();await controlledTrackFault();
  }
  if(!production)requireThat(['media/general-tracks.mjs','media/subtitle-track.mjs'].every(n=>report.overrideRequests[n]>0),'LOCAL_TRACK_MODULE_OVERRIDE_MISSING');
  report.completed=true;
}catch(e){report.completed=false;report.failure=/^[A-Z_]+$/.test(e.message)?e.message:'ANDROID_QA_OPERATION_FAILED';report.failureDetail=String(e.message).replace(/https?:\/\/\S+/g,'[url]').replace(/([?&](?:fileId|id|resourceKey)=)[^&\s]+/g,'$1[redacted]').slice(0,160);
  if(page){try{report.failedState={...await observe(),...await page.evaluate(()=>{
      const v=el.videoPlayer,clean=s=>String(s||'').replace(/https?:\/\/\S+/g,'[url]').replace(/(?:Bearer\s+)?[A-Za-z0-9_-]{30,}/g,'[redacted]').slice(0,300);
      return {readyState:v.readyState,networkState:v.networkState,ended:v.ended,nativeErrorCode:v.error?.code??null,
        visibleErrorText:el.mediaError.hidden?'':clean(el.mediaErrorMessage?.textContent),mediaSession:state.mediaSession,
        mediaSourceGeneration,attempt:state.mediaAttempt,playbackMode:state.mediaPlaybackMode,
        transportVerified:state.mediaTransportVerified,transportStarted:state.mediaTransportStarted,rangeIntegrity:state.mediaRangeIntegrity,
        decodeVerified:state.mediaDecodeVerified,seeking:v.seeking,pointerSeeking:isSeekingPointer,mediaAborted:state.mediaAbortController?.signal.aborted??null,
        currentSrcKind:!v.currentSrc?'empty':v.currentSrc.startsWith('blob:')?'blob':v.currentSrc.startsWith(location.origin)?'same-origin':'other-origin',
        buffered:Array.from({length:Math.min(v.buffered.length,3)},(_,i)=>[v.buffered.start(i),v.buffered.end(i)]),
        q1Owned:Boolean(q1Playback),q1Aborted:q1Playback?.controller?.signal.aborted??null,
        q1Retired:q1RetirementResult?.settled??null,tracksRetired:playerTracksRetirementResult?.settled??null,
        sourcePinned:Boolean(q0PinnedSource),swControlled:Boolean(navigator.serviceWorker.controller)};
    })};}catch{report.failedStateUnavailable=true;}
    try{await screenshot('failure');report.failureScreenshotCaptured=true;}catch{report.failureScreenshotCaptured=false;}
    save();}
}
finally{
  if(priorStayAwake!==undefined&&serial){try{if(priorStayAwake==='null')cmd(['-s',serial,'shell','settings','delete','global','stay_on_while_plugged_in']);else cmd(['-s',serial,'shell','settings','put','global','stay_on_while_plugged_in',priorStayAwake]);report.cleanup.stayAwakeRestored=true;}catch{report.cleanup.stayAwakeRestored=false;}}
  if(rotation&&serial){try{cmd(['-s',serial,'shell','settings','put','system','user_rotation',rotation.user]);cmd(['-s',serial,'shell','settings','put','system','accelerometer_rotation',rotation.automatic]);report.cleanup.rotationRestored=true;}catch{report.cleanup.rotationRestored=false;}}
  if(cdp){if(!touchActive){report.cleanup.touchReleased=true;report.touchCleanup='No helper touch remained active.';}
    else{try{await input('touchEnd',[]);report.cleanup.touchReleased=true;}catch{report.cleanup.touchReleased=false;}}
    try{await cdp.send('Network.setBypassServiceWorker',{bypass:false});report.cleanup.bypassRestored=true;}catch{report.cleanup.bypassRestored=false;}}
  if(page){try{await page.unrouteAll({behavior:'wait'});report.cleanup.overridesRemoved=true;}catch{report.cleanup.overridesRemoved=false;}}
  if(page){try{await page.evaluate(()=>{for(const {type,fn}of window.__followListeners||[])el.videoPlayer.removeEventListener(type,fn);
    delete window.__followListeners;delete window.__followEvents;delete window.__followEventCounts;delete window.__uiuxFiles;delete window.__uiuxFolder;delete window.__followImage;});report.cleanup.observersRemoved=true;}catch{report.cleanup.observersRemoved=false;}}
  if(page&&originalUrl){try{await page.evaluate(()=>{if(typeof closePlayer==='function'&&!el.playerSheet.hidden)closePlayer();});if(page!==originalPage){await page.close();report.cleanup.testTabClosed=true;}else await page.goto(originalUrl,{waitUntil:'domcontentloaded',timeout:30000});}catch{report.cleanup.testTabClosed=false;}}
  if(originalPage){try{if(!production)await originalPage.evaluate(()=>{navigator.serviceWorker.removeEventListener('controllerchange',window.__uiuxControlListener);delete window.__uiuxControlListener;delete window.__uiuxControlChanges;});
    await originalPage.bringToFront();report.cleanup.originalTabsPreserved=prior.every(p=>!p.page.isClosed()&&p.page.url()===p.url);}catch{report.cleanup.originalTabsPreserved=false;}}
  if(cdp)await cdp.detach().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(client)await client.close().catch(()=>{});
  if(port&&serial){try{cmd(['-s',serial,'forward','--remove',`tcp:${port}`]);report.cleanup.forwardRemoved=true;}catch{report.cleanup.forwardRemoved=false;}}
  report.cleanup.complete=Object.values(report.cleanup).every(v=>v===true);save();
}
console.log(JSON.stringify({completed:report.completed,failure:report.failure||null,cleanup:report.cleanup}));if(!report.completed||!report.cleanup.complete)process.exitCode=1;
})();
