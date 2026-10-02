'use strict';
// Inert module: root owns the existing PC transport, normal reload/input, metadata,
// target binding and actual execution. No browser discovery/launch or disk eviction.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const cp=require('node:child_process');
const frozenHashes={'qa/rc32-q0-byte-acceptance/observer.function.js':'f3e319dd17f51c34810c6faf0b5c07971d4952a635f7eb7058d65a59d0deeaf5','qa/rc32-q0-byte-acceptance/worker-network.cjs':'eef6797137d90db460ec1f746fa2d17489e0262b2d0b893894903be0b9fcffc1'};
for(const [f,hash] of Object.entries(frozenHashes))if(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../..',f))).digest('hex')!==hash)throw Error('COLD_FROZEN_HELPER_CHANGED');
const network=require('../rc32-q0-byte-acceptance/worker-network.cjs');
const SOURCE='2c2b1244bee0f1a5e500318c83c6e126c5124e34',VERSION='1.22.0-rc.35';
function idleSnapshot(){
 const v=el.videoPlayer;
 return {timeOrigin:performance.timeOrigin,closed:el.playerSheet.hidden===true,
  ownersEmpty:!q0Playback&&!q1Playback&&!q0PinnedSource&&!q0ControlWait&&!playerTracksOwner,
  retirementSettled:q1RetirementResult?.settled===true&&playerTracksRetirementResult?.settled===true,
  appBuffersEmpty:!state.mediaBlobUrl&&!state.mediaTempStorage&&!state.pendingOriginalBuffer&&!state.mediaAbortController&&!state.pendingPlay&&!state.mediaTransportStarted&&!pendingPlaybackRestore,
  nativeEmpty:!!v&&!v.getAttribute('src')&&!v.currentSrc&&!v.srcObject&&v.querySelectorAll('source').length===0&&v.readyState===0&&v.networkState===0&&v.buffered.length===0,
  selectedEmpty:!state.selected,foreground:document.visibilityState==='visible',online:navigator.onLine===true};
}
function qualifyIdle(s){return !!s&&Number.isFinite(s.timeOrigin)&&['closed','ownersEmpty','retirementSettled','appBuffersEmpty','nativeEmpty','selectedEmpty','foreground','online'].every(k=>s[k]===true);}
const expression=f=>'('+f.toString()+')()';
async function evaluate(session,source){const r=await session.send('Runtime.evaluate',{expression:source,returnByValue:true});if(r.exceptionDetails)throw Error('COLD_PAGE_EXCEPTION');return r.result?.value;}
const bounded=async p=>{let t;try{return await Promise.race([p,new Promise((_,rej)=>{t=setTimeout(()=>rej(Error('COLD_CDP_DEADLINE')),5000);})]);}finally{clearTimeout(t);}};
async function prepareOwnedPage(pageSession,{execute=false,freshExclusiveSession=false}={}){
 if(!execute||!freshExclusiveSession)throw Error('COLD_ROOT_EXECUTION_REQUIRED');
 const before=await bounded(evaluate(pageSession,expression(idleSnapshot)));
 if(!qualifyIdle(before))throw Error('COLD_PRIOR_OWNER_NOT_EMPTY');
 // CDP has no readback of the prior flag. This requires root's fresh exclusively
 // owned session with default false, not an unknown pre-existing session.
 await bounded(pageSession.send('Network.enable',{}));
 await bounded(pageSession.send('Network.setCacheDisabled',{cacheDisabled:true}));
 let disposed=false;
 return {beforeTimeOrigin:before.timeOrigin,cacheDisabledCommandAcknowledged:true,
  installExpression(inputExpression,bindingExpression){
   if(disposed)throw Error('COLD_DISPOSED');
   return '('+installColdAdmission.toString()+')('+inputExpression+','+bindingExpression+','+before.timeOrigin+')';
  },async stop(){if(disposed)return {disposed:true};disposed=true;let restored=false,disabled=false;
   try{await bounded(pageSession.send('Network.setCacheDisabled',{cacheDisabled:false}));restored=true;}catch{}
   try{await bounded(pageSession.send('Network.disable',{}));disabled=true;}catch{}
   return {disposed:true,cacheRestoredToOwnedSessionDefault:restored,ownedPageNetworkDisabled:disabled};}}
}
function installColdAdmission(input,binding,beforeTimeOrigin){
 'use strict';
 const idle=(()=>{const v=el.videoPlayer;return el.playerSheet.hidden===true&&!state.selected&&!q0Playback&&!q1Playback&&!q0PinnedSource&&!q0ControlWait&&!playerTracksOwner&&q1RetirementResult?.settled===true&&playerTracksRetirementResult?.settled===true&&!state.mediaBlobUrl&&!state.mediaTempStorage&&!state.pendingOriginalBuffer&&!state.mediaAbortController&&!state.pendingPlay&&!state.mediaTransportStarted&&!pendingPlaybackRestore&&!v.getAttribute('src')&&!v.currentSrc&&!v.srcObject&&v.querySelectorAll('source').length===0&&v.readyState===0&&v.networkState===0&&v.buffered.length===0;})();
 const nav=performance.getEntriesByType('navigation')[0];
 if(window.__pcColdAdmission||!idle||performance.timeOrigin<=beforeTimeOrigin||nav?.type!=='reload')throw Error('COLD_FRESH_DOCUMENT_REQUIRED');
 const target=input?.target,controller=navigator.serviceWorker.controller,account=state.accountId,key=state.authAccountKey,auth=state.authGeneration,drive=state.driveSessionGeneration;
 const proof=()=>window.__resumeSwProof?.get?.();
 const source=()=>binding.sourceCommit==='2c2b1244bee0f1a5e500318c83c6e126c5124e34'&&binding.version==='1.22.0-rc.35'&&APP_VERSION===binding.version&&controller===navigator.serviceWorker.controller&&proof()?.controller===controller&&proof()?.sourceCommit===binding.sourceCommit&&Object.keys(binding.sourceSHA256||{}).length>=3&&Object.keys(binding.sourceSHA256).every(k=>proof()?.sourceSHA256[k]===binding.sourceSHA256[k]);
 if(!source()||!target?.id||!Number.isSafeInteger(Number(target.size))||Number(target.size)<1024**3||target.mimeType!=='video/mp4'||!target.headRevisionId||!target.sha256Checksum||!target.version||!hasUsableToken())throw Error('COLD_SOURCE_TARGET_REQUIRED');
 let failure=null,disposed=false,polls=0,owner=null,routeObserved=false;
 const current=()=>source()&&state.accountId===account&&state.authAccountKey===key&&state.authGeneration===auth&&state.driveSessionGeneration===drive&&hasUsableToken()&&document.visibilityState==='visible'&&navigator.onLine;
 function sample(){polls++;if(!current())failure||='COLD_SOURCE_ACCOUNT_DRIFT';
  if(state.mediaBlobUrl||state.mediaTempStorage||state.pendingOriginalBuffer||q1Playback||['original-opfs','original-memory'].includes(state.mediaPlaybackMode))failure||='COLD_NON_Q0_BUFFER_PATH';
  // Q0 creates an owner before asynchronous source admission assigns native src.
  // Defer URL qualification while it is absent; absence cannot yield a pass.
  if(q0Playback&&(el.videoPlayer.currentSrc||el.videoPlayer.getAttribute('src'))){const v=el.videoPlayer;let u;try{u=new URL(v.currentSrc||v.getAttribute('src'),location.href);}catch{}
   if(state.selected?.id!==target.id||!isCurrentQ0Playback(q0Playback,target.id,mediaSourceGeneration)||!isCurrentMediaEvent(v)||!u||u.origin!==location.origin||u.pathname.split('/').at(-1)!==encodeURIComponent(target.id)||u.searchParams.get('mediaOwner')!=='q0'||u.searchParams.get('sourceGeneration')!==String(mediaSourceGeneration))failure||='COLD_NATIVE_Q0_ROUTE_REQUIRED';
   else {if(owner&&owner!==q0Playback)failure||='COLD_OWNER_REPLACED';owner=q0Playback;routeObserved=true;}}
  return read();}
 const read=()=>({freshDocument:true,nativeEmptyAtAdmission:true,appOwnedBufferEmptyAtAdmission:true,routeObserved,current:current(),polls,failure,disposed,sourceCommit:binding.sourceCommit,version:binding.version,rawIdentifiersExported:false,opfsDiskEmpty:'NOT_CLAIMED',scope:'operational selected-media no-local-byte-reuse; requires complete source-worker network qualification'});
 let timer=setInterval(sample,100),deadline=setTimeout(()=>{failure||='COLD_ADMISSION_DEADLINE';stop();},70000);
 function stop(){if(!disposed){disposed=true;clearInterval(timer);clearTimeout(deadline);owner=null;}return {disposed:true,timerRemoved:true,deadlineRemoved:true,privateOwnerReleased:true};}
 window.__pcColdAdmission={read,sample,stop};return read();
}
async function attachOwnedSourceWorker(browserSession,{execute=false,id,size,revision}={}){
 if(!execute)throw Error('COLD_ROOT_EXECUTION_REQUIRED');
 const r=network.reducer(id,size,revision),pending=new Map();let target,worker,next=0,disposed=false;
 const handler=e=>{if(e.sessionId!==worker)return;let m;try{m=JSON.parse(e.message);}catch{return;}
  const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('COLD_WORKER_COMMAND')):p.resolve(m.result);}else if(m.method)r.event(m.method,m.params||{});};
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('COLD_WORKER_DEADLINE'));},5000);pending.set(id,{resolve,reject,timer});browserSession.send('Target.sendMessageToTarget',{sessionId:worker,message:JSON.stringify({id,method,params})}).catch(()=>{const p=pending.get(id);if(p){pending.delete(id);clearTimeout(timer);reject(Error('COLD_WORKER_SEND'));}});});
 async function stop(){if(disposed)return {disposed:true};disposed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('COLD_WORKER_STOP'));}pending.clear();browserSession.off('Target.receivedMessageFromTarget',handler);let detached=!worker;try{if(worker){await bounded(browserSession.send('Target.detachFromTarget',{sessionId:worker}));detached=true;}}catch{}return{disposed:true,pendingCleared:true,listenerRemoved:true,ownedWorkerSessionDetached:detached};}
 try{target=network.selectWorker((await bounded(browserSession.send('Target.getTargets'))).targetInfos);worker=(await bounded(browserSession.send('Target.attachToTarget',{targetId:target,flatten:false}))).sessionId;browserSession.on('Target.receivedMessageFromTarget',handler);await command('Network.enable');return{arm:r.arm,read:r.read,stop,verify:async()=>({sameWorkerTarget:!disposed&&network.selectWorker((await bounded(browserSession.send('Target.getTargets'))).targetInfos)===target})};}catch(e){await stop();throw e;}
}
function qualifyCold({admission,cacheDisabledCommandAcknowledged,workerUnchanged,metadataQualified,byteObserverQualified,normalCloseQualified,networkEvidence}){
 const n=network.assessSafeNetwork(networkEvidence);const a=admission;
 return {qualified:!!a&&a.sourceCommit===SOURCE&&a.version===VERSION&&a.freshDocument===true&&a.nativeEmptyAtAdmission===true&&a.appOwnedBufferEmptyAtAdmission===true&&a.routeObserved===true&&a.current===true&&!a.failure&&cacheDisabledCommandAcknowledged===true&&workerUnchanged===true&&metadataQualified===true&&byteObserverQualified===true&&normalCloseQualified===true&&n.qualified===true,
  network:n,scope:'operational selected-media cold original-Q0 path; complete conservative post-close transfer envelope; no diskempty/exact-byte-at-frame/physicalaudio claim'};
}
function pins(){const root=path.resolve(__dirname,'../..'),files=['app.js','sw.js','media/drive-source.mjs'];return{sourceCommit:SOURCE,product:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(cp.execFileSync('git',['show',SOURCE+':'+f],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024})).digest('hex')])),frozenHelpers:{...frozenHashes}};}
module.exports={SOURCE,VERSION,idleSnapshot,qualifyIdle,prepareOwnedPage,installColdAdmission,attachOwnedSourceWorker,qualifyCold,pins,
 procedure:['Root verifies current35 source and normal closes/retirement before fresh exclusively owned pageCDP session. prepareOwnedPage(execute:true,freshExclusiveSession:true) captures idle baseline then enables cache bypass.','Root ordinary reloads SAME document, rebinds exact35 sourceproof and protected SAME selected-largeMP4 tuple; no playback before admission. Metadata and normalfolder/card preparation precede70s observer clocks.','Root installs original installQ0ByteObserver(input,binding), new admission helper, and own sourceworker adapter. Arm reducer before byte observer arm and ordinary cardclick. Existing fresh metadata/header proof must establish normalISO-MP4 exact tuple; MIME/name alone is insufficient.','At first/progress frame save admission.sample() and originalbyteobserver.read(); normalclose drains complete sourceworker records and fresh metadataafter. Existing originalQ0-byte qualification supplies SW count/byte/firstframe/progress gates; qualifyCold is extra admission, not their replacement.','Finally stop both pagehelpers, remove only their owned global APIs, stop sourceworker adapter, restore owned page cache flag/defaultfalse and Network domain, detach only owned sessions. Any source/controller/account drift or SW replacement fails. Never evict storage/caches or close userbrowser.']};
