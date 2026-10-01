'use strict';
// Root-only adapter. Import performs no private reads and no device/network work.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {SOURCE,VERSION}=require('./gate.cjs');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function frozen(file,expected){const b=fs.readFileSync(path.join(root,file));if(sha(b)!==expected)throw Error('FROZEN_HELPER_DRIFT');return b.toString('utf8');}
function prepare(privateInput) {
 const helper=path.join(root,'qa/rc30-ts-device-replay/android-same-file-replay-v3.cjs');
 frozen('qa/rc30-ts-device-replay/android-same-file-replay-v3.cjs','ab097c543270833ebc4f98a03f4d7978287174757f9b1e78e4fff73e1305aa85');
 // Validation only; the v3 execute/common-bootstrap function is never called here.
 const nativeV3=require(helper),input=nativeV3.validatePrivate(privateInput);
 const folder=frozen('qa/rc30-ts-device-replay/native-folder-target.function.js','81e82da0e87d32a847da90ffb927c715d537ffc9e79e31606314161f8b2a775a');
 const ui=frozen('qa/rc30-ts-device-replay/native-ui-target-v3.function.js','0e2af51d9c2234a4f81b447474838ef61954addf2b9618426c6442faa023d73e');
 const observer=frozen('qa/rc30-ts-device-replay/single-file-observer-v2.function.js','bf07d3e1443c19edfb34fe060d5184addb0c481dd97f04eac0188f0c9908e7f9')
  .replaceAll('installRc30SingleFileReplay','installRc31CookieReplay').replaceAll('__rc30SingleFileReplay','__rc31CookieReplay').replaceAll('drive-original.rc30-single-file-replay','drive-original.rc31-cookie-replay');
 const binding=JSON.parse(fs.readFileSync(path.join(root,'qa/rc31-resume-20261001/sourcebinding.json'),'utf8'));
 if(binding.sourceCommit!==SOURCE||binding.version!==VERSION)throw Error('SOURCE_BINDING_DRIFT');
 return async c=>{
  const deadline=c.end-12000,wait=c.wait||((ms)=>new Promise(r=>setTimeout(r,ms)));
  const within=()=>{if(Date.now()>=deadline)throw Error('BOUNDED_DEADLINE');};
  const ev=fn=>{within();return c.evaluate(`(${fn})()`,deadline-Date.now());};
  const read=()=>ev('()=>window.__rc31CookieReplay.read()');
  const poll=async(fn,ms=25000)=>{const until=Math.min(Date.now()+ms,deadline);let r;do{within();r=await fn();if(r.ok)return r;await wait(250);}while(Date.now()<until);throw Error('NORMAL_UI_WAIT_UNCONFIRMED');};
  const physicalHeight=Number(c.physicalScreen.match(/(\d+)x(\d+)/)?.[2]);if(!physicalHeight)throw Error('PHYSICAL_SCREEN_UNKNOWN');
  const geometry=key=>ev(`()=>(${ui})(${JSON.stringify(key)})`);
  const tapGeometry=async g=>{within();if(!g.available)throw Error('NATIVE_TARGET_UNAVAILABLE');c.adb(['shell','input','tap',String(Math.round(g.x*g.dpr)),String(Math.round(physicalHeight-g.viewportHeight*g.dpr+g.y*g.dpr))]);await wait(650);};
  const tap=async key=>tapGeometry(await geometry(key));
  const close=async()=>{
   const open=await c.evaluate('state.selected!==null||!el.playerSheet.hidden',10000);if(open)c.adb(['shell','input','keyevent','KEYCODE_BACK']);
   const until=Date.now()+10000;do{const s=await c.evaluate('({closed:state.selected===null&&el.playerSheet.hidden,retired:q1RetirementResult?.settled===true,q0:!!q0Playback,q1:!!q1Playback,blob:!!state.mediaBlobUrl,frame:state.frameCallbackId!==null})',Math.max(1,until-Date.now()));if(s.closed&&s.retired&&!s.q0&&!s.q1&&!s.blob&&!s.frame)return true;await wait(250);}while(Date.now()<until);return false;
  };
  let installed=false,privateInstalled=false,ownedPlayer=false,receipt,cleanup=true;
  try {
   if(!await ev('()=>innerHeight>innerWidth'))throw Error('NATIVE_PORTRAIT_REQUIRED');
   const ready=await ev(`()=>{if(window.__resumeReplayTarget30||window.__rc31CookieReplay)throw Error('PRIVATE_HELPER_ALREADY_OWNED');const input=${JSON.stringify(input)};
    if(state.accountId!==input.account.accountId||state.authAccountKey!==input.account.authAccountKey||state.selected!==null||!el.playerSheet.hidden)return{ok:false};
    window.__resumeReplayTarget30=input;return{ok:true,queryEmpty:state.query===''&&el.searchInput.value===''};}`);
   if(!ready.ok)throw Error('PRIVATE_ACCOUNT_MISMATCH');privateInstalled=true;
   // New owned document should start with an empty search. Do not inject search/state.
   if(!ready.queryEmpty)throw Error('NORMAL_SEARCH_RESET_REQUIRED');
   for(const expected of input.folderPath){within();
    if(await ev('()=>state.files.some(f=>f.id===window.__resumeReplayTarget30.target.id)'))break;
    let g=await ev(`()=>(${folder})(${JSON.stringify(expected)})`);
    for(let n=0;!g.currentFolderSame&&!g.available&&g.metadataUnique&&g.moreVisible&&n<3;n++){await tap('folderMoreButton');g=await ev(`()=>(${folder})(${JSON.stringify(expected)})`);}
    if(!g.currentFolderSame)await tapGeometry(g);
    await poll(async()=>{const r=await ev(`()=>({same:state.currentFolderId===${JSON.stringify(expected.id)},loading:!!state.loadingFiles||!!state.loadingTree,present:state.files.length>0||state.folders.length>0})`);return{ok:r.same&&!r.loading&&r.present};});
   }
   const nativeSearch=nativeV3.inputCommand(input.target.name);
   if(!nativeSearch)throw Error('NATIVE_ASCII_SEARCH_UNSUPPORTED');
   await tap('searchInput');c.adb(nativeSearch);c.adb(['shell','input','keyevent','KEYCODE_BACK']);await wait(650);
   await poll(async()=>{const r=await ev('()=>({found:state.files.filter(f=>f.id===window.__resumeReplayTarget30.target.id).length===1,querySame:el.searchInput.value===window.__resumeReplayTarget30.target.name,loading:!!state.loadingFiles||!!state.loadingTree})');return{ok:r.found&&r.querySame&&!r.loading};},40000);
   const present=await ev('()=>state.files.filter(f=>f.id===window.__resumeReplayTarget30.target.id).length===1');
   if(!present)throw Error('TARGET_NOT_IN_NORMAL_POPULATION');
   // Normal DOM scroll in the frozen helper can expose an already-rendered card.
   // Native restricted ASCII search is ordinary UI. No synthetic-name fallback,
   // files injection or direct player/navigation calls.
   const card=await geometry('card');if(!card.available)throw Error('TARGET_NOT_IN_NORMAL_RENDER_WINDOW');
   await ev(`()=>(${observer})(${JSON.stringify({sourceCommit:SOURCE,version:VERSION,sourceSHA256:binding.sourceSHA256})})`);installed=true;
   const metadata=await ev('()=>window.__rc31CookieReplay.metadata("before")');
   if(!metadata.sameExactTarget||!metadata.stableMetadataSame||!metadata.freshRevisionChecksumSame||!metadata.notTrashed||!metadata.canDownload)throw Error('FRESH_METADATA_MISMATCH');
   await ev('()=>window.__rc31CookieReplay.arm("startup",{targetSeconds:0,toleranceSeconds:3})');ownedPlayer=true;await tapGeometry(card);
   const startup=await poll(async()=>{const r=await read(),p=r.phases.find(p=>p.label==='startup');if(p?.fenceFailure||r.latest.native?.error||r.latest.pipeline?.failure)throw Error('PLAYBACK_OWNER_FAILED');return{ok:!!p?.firstTargetFrame&&p.presentedCount>=2,r};},45000);
   if(startup.r.latest.route!=='Q1_TS')throw Error('Q1_TS_NOT_SELECTED');
   const before=await read();await wait(2200);const progressed=await read();
   const phase=progressed.phases.find(p=>p.label==='startup');
   const progression=phase.frames.length>=2&&phase.frames.at(-1).sourceTime>phase.frames[0].sourceTime+.25&&progressed.latest.native.time>before.latest.native.time;
   if(!progression)throw Error('PRESENTATION_PROGRESS_UNCONFIRMED');
   // Frozen v3 UI geometry and normal stage/transport behavior; no pause()/seek() call.
   let r=await read();if(!r.latest.native.paused){const transport=await geometry('ctrlPlayPause');if(transport.available){await tapGeometry(transport);r=await read();}}
   for(let n=0;!r.latest.native.paused&&n<2;n++){await tap('mediaStage');r=await read();}
   if(!r.latest.native.paused)throw Error('NATIVE_PAUSE_UNCONFIRMED');
   let slider=await geometry('seekBarContainer');
   if(!slider.available){let entry=await geometry('playerControlsEntry');if(!entry.available&&!entry.controlsIdle){await tap('mediaStage');entry=await geometry('playerControlsEntry');}await tapGeometry(entry);const revealEnd=Math.min(Date.now()+2000,deadline);do{slider=await geometry('seekBarContainer');if(slider.available)break;await wait(250);}while(Date.now()<revealEnd);}
   if(!slider.available)throw Error('NATIVE_SEEK_TARGET_UNAVAILABLE');
   const duration=r.latest.pipeline?.duration||r.latest.native?.duration;if(!Number.isFinite(duration)||duration<=0)throw Error('DURATION_UNKNOWN');
   const seek=await ev(`()=>(${ui})('seekBarContainer',{xFraction:.5})`);if(!seek.available)throw Error('NATIVE_SEEK_POINT_UNAVAILABLE');
   const x=Math.round(seek.x*seek.dpr),y=Math.round(physicalHeight-seek.viewportHeight*seek.dpr+seek.y*seek.dpr),targetSeconds=(x/seek.dpr-seek.left)/seek.width*duration,toleranceSeconds=Math.max(1.5,duration/(seek.width*seek.dpr)*.75);
   await ev(`()=>window.__rc31CookieReplay.arm('seek50',${JSON.stringify({targetSeconds,toleranceSeconds})})`);
   c.adb(['shell','input','swipe',String(x),String(y),String(x),String(y),'120']);
   const sought=await poll(async()=>{const r=await read(),p=r.phases.find(p=>p.label==='seek50');if(p?.fenceFailure||r.latest.native?.error||r.latest.pipeline?.failure)throw Error('SEEK_OWNER_FAILED');return{ok:!!p?.firstTargetFrame&&!r.latest.seekWatchdog&&r.latest.seekGeneration===r.latest.seekSettledGeneration,r};},35000);
   const src=sought.r.latest.pipeline?.source;
   const originalBytes=!!src&&src.readsCompleted>0&&src.rangeRequests>0&&src.receivedBytes>0&&sought.r.latest.sourceSame&&sought.r.latest.accountSame&&sought.r.latest.targetSame;
   // Independent SW/transmux targets exist. Cross-origin media/metadata fetches have
   // no credentials override in fixed31; this runtime confirms the ordinary default.
   const cookieScope=await ev(`()=>({apiCrossOrigin:new URL(DRIVE_API,location.href).origin!==location.origin,defaultSameOriginCredentials:new Request(DRIVE_API).credentials==='same-origin',workerScriptSameOrigin:new URL('./media/transmux-worker.mjs',location.href).origin===location.origin,noGoogleIframe:![...document.querySelectorAll('iframe')].some(f=>{try{return /(^|\\.)(google\\.com|googleapis\\.com|googleusercontent\\.com)$/.test(new URL(f.src,location.href).hostname)}catch{return false}}),token:hasUsableToken()})`);
   const metadataAfter=await ev('()=>window.__rc31CookieReplay.metadata("after")');
   if(!metadataAfter.sameExactTarget||!metadataAfter.stableMetadataSame||!metadataAfter.freshRevisionChecksumSame)throw Error('FRESH_METADATA_MISMATCH');
   const owner=await c.ownerReceipt(),sameAccount=await c.originalAccountMatches();
   const closedSettled=await close();if(!closedSettled)throw Error('PLAYER_RETIREMENT_UNCONFIRMED');ownedPlayer=false;
   receipt={normalNativeInput:true,noGoogleIframe:cookieScope.noGoogleIframe,existingValidToken:cookieScope.token,sameAccount,exactSource31:sought.r.sourceCommit===SOURCE&&sought.r.version===VERSION&&sought.r.latest.sourceSame,originalBytePathQualified:originalBytes,
    routes:[{route:'q1',presentedFrames:phase.presentedCount,progressed:progression,seekTargetFrame:!!sought.r.phases.find(p=>p.label==='seek50')?.firstTargetFrame,closedSettled,exactPageMainFrame:owner.mainFrame&&owner.exactTarget,
     noIndependentCookieDependentMediaTarget:cookieScope.apiCrossOrigin&&cookieScope.defaultSameOriginCredentials&&cookieScope.workerScriptSameOrigin&&cookieScope.noGoogleIframe}]};
  }finally{
   if(ownedPlayer)try{cleanup=await close()&&cleanup;}catch{cleanup=false;}
   if(installed)try{const r=await c.evaluate('window.__rc31CookieReplay.stop()',10000);cleanup=cleanup&&r.disposed&&r.frameCallbackRemoved&&r.mediaListenersRemoved;}catch{cleanup=false;}
   if(privateInstalled)try{await c.evaluate('delete window.__rc31CookieReplay; delete window.__resumeReplayTarget30; true',10000);}catch{cleanup=false;}
   if(!cleanup)throw Error('REPLAY_OWNED_CLEANUP_UNCONFIRMED');
  }
  return receipt;
 };
}
module.exports={prepare};
