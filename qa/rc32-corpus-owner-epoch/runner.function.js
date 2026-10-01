function (createJob, facade, binding) {
 'use strict';
 let allocated=false;
 return function installCorpusOwnerEpoch(privateContextText, proof, epochName) {
  const expectedEpoch='rc32-bounded-container-config-image-owner-epoch-20261001-2';
  if(allocated)throw Error('EPOCH_ALREADY_ALLOCATED_NO_RESET');
  if(epochName!==expectedEpoch||binding.sourceCommit!=='1d79897fd32c569137cab079bfd93107be2ee33f'||binding.version!=='1.22.0-rc.32'||typeof privateContextText!=='string')throw Error('EXPLICIT_NEW_EPOCH_REQUIRED');
  const parsed=JSON.parse(privateContextText);if(Object.keys(parsed).sort().join(',')!=='accountKey,generation,priorityFileId,rootId')throw Error('EPOCH_CONTEXT');
  const capture=()=>({controller:navigator.serviceWorker.controller,account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,token:state.token,tokenRevision:state.tokenRevision,expiry:state.expiresAt,abort:state.accountStateAbortController,writer:state.accountStateWriterId,revision:state.accountStateRevision,source:mediaSourceGeneration,media:state.mediaSession,playback:state.playbackSession,retirement:q1RetirementResult,href:location.href,projection:JSON.parse(JSON.stringify(state.accountMediaState))});
  const fields=['controller','account','key','auth','drive','token','tokenRevision','expiry','abort','writer','revision','source','media','playback','retirement','href'];
  const stableFields=['controller','account','key','drive','writer','source','href'];
  const credentialStableFields=fields.filter(k=>!['token','tokenRevision','expiry'].includes(k));
  const same=(a,b,keys=fields)=>a&&b&&keys.every(k=>a[k]===b[k]);
  const idleOwner=()=>DRIVE_MUTATIONS_ENABLED===false&&ACCOUNT_STATE_WRITES_ENABLED===true&&top===self&&navigator.onLine===true&&document.visibilityState==='visible'&&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
   &&state.authStatus==='online'&&state.demo===false&&!state.accountIdentityPending&&hasUsableToken()&&typeof state.token==='string'&&state.token.length>0&&Number.isSafeInteger(state.tokenRevision)&&state.tokenRevision>=0&&Number.isFinite(state.expiresAt)&&state.expiresAt>Date.now()
   &&state.accountStateLoaded===true&&typeof state.accountStateWriterId==='string'&&state.accountStateWriterId.length>0&&Number.isSafeInteger(state.accountStateRevision)&&state.accountStateRevision>=0
   &&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null&&Boolean(state.accountStateAbortController?.signal)&&!state.accountStateAbortController.signal.aborted
   &&q1RetirementResult?.settled===true&&q1Playback===null&&!playerMediaPriorityActive&&state.selected===null&&state.mediaAttempt==='idle'&&state.mediaAbortController===null&&state.pendingOriginalBuffer===null&&state.pendingPlay===false&&state.mediaTransportStarted===false;
  const fullSame=(a,b)=>same(a,b)&&accountMediaStatesEqual(a.projection,b.projection)&&idleOwner();
  const sourceOK=()=>{try{const p=proof?.get?.(),u=new URL(p?.controller?.scriptURL);return APP_VERSION===binding.version&&p?.version===binding.version&&p.sourceCommit===binding.sourceCommit&&p.controller===navigator.serviceWorker.controller&&p.controller?.state==='activated'&&u.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'&&u.pathname==='/sw.js'&&!u.search&&!u.hash&&['app.js','sw.js','version.json'].every(k=>p.sourceSHA256?.[k]===binding.sourceSHA256[k]);}catch{return false;}};
  let anchor=capture(),capsule=null,active=null,timer=null,burst=null,stopped=null,disposed=false,needsRecovery=false,recoveryCycle=0,credentialRebinds=0;
  if(!sourceOK()||!idleOwner()||parsed.accountKey!==anchor.account||parsed.generation!==anchor.drive)throw Error('EPOCH_SOURCE_OWNER_REJECTED');
  allocated=true;
  const jobs=[];
  const progress=()=>{
   if(!active)return null;const p=active.poll();
   const phases=new Set(['not-started','rejected','inventory-before','selection','recovery-strong-metadata','structural-and-image-headers','inventory-after','done','failed']);
   return {started:p.started===true,done:p.done===true,phase:phases.has(p.phase)?p.phase:'unknown',...Object.fromEntries(['metadataRequests','metadataBytes','mediaRequests','mediaBytes','processed'].map(k=>[k,Number.isSafeInteger(p[k])&&p[k]>=0?p[k]:null]))};
  };
  const read=()=>JSON.parse(JSON.stringify({schema:'drive-original.rc32-corpus-owner-epoch/1',epoch:expectedEpoch,sourceCommit:binding.sourceCommit,version:binding.version,active:Boolean(active),progress:progress(),disposed,stopped,needsRecovery,credentialRebinds,maxFreshAttemptsPerFile:1,historicalCrossEpochAttempts:'UNKNOWN',historicalResultsImported:false,privateRegistryExported:false,actualPlaybackCount:0,wholeCorpusComplete:false,burst,jobs}));
  function stop(code){if(!stopped)stopped=code;active?.cancel();if(burst)burst.done=!active;}
  function wake(){if(timer!==null)clearTimeout(timer);timer=setTimeout(tick,100);}
  function launch(){
   if(!burst||burst.done||active||stopped)return;
   if(Date.now()>=burst.deadline){stop('BURST_DEADLINE');return;}
   if(!sourceOK()){stop('SOURCE_CHANGED_TERMINAL');return;}
   if(!fullSame(anchor,capture())){needsRecovery=true;stop('OWNER_CHANGED');return;}
   if(burst.started>=burst.maxJobs){burst.done=true;return;}
   const options={phase:burst.recovery?'revalidate-videos':'videos',maxFiles:64,...(burst.recovery?{recoveryCycle}:{})};
   try{active=facade.call(runtime=>createJob(runtime),privateContextText,proof,capsule,options);}catch{stop('FACTORY_THROW_TERMINAL');return;}
   burst.started++;wake();
  }
  function tick(){
   timer=null;if(!active)return;
   if(!sourceOK())stop('SOURCE_CHANGED_TERMINAL');else if(!fullSame(anchor,capture())){needsRecovery=true;stop('OWNER_CHANGED');}
   if(Date.now()>=burst.deadline)stop('BURST_DEADLINE');
   let p;try{p=active.poll();}catch{stop('POLL_FAILED_TERMINAL');wake();return;}
   if(!p.done){wake();return;}
   const s=p.summary;jobs.push({ordinal:jobs.length+1,recovery:burst.recovery,summary:s});
   const next=active.continuity?.();if(next){if(capsule)createJob.clearContinuity(capsule);capsule=next;}active=null;
   const valid=s?.released===true&&s.writeRequests===0&&s.metadataRequests<=512&&s.metadataBytes<=67108864&&s.mediaRequests<=4096&&s.mediaBytes<=64*(2*1024*1024+8192)&&s.files?.length<=64&&s.coverage?.maxFreshAttemptsPerFile===1&&s.coverage?.ledgerEntries<=16384;
   if(!valid||!next){stop('JOB_CONTRACT_TERMINAL');return;}
   if(!s.complete||!s.catalogStable||s.failure){needsRecovery=true;if(['OWNER_CHANGED','GENERATION_STALE'].includes(s.failure))stop('OWNER_CHANGED');else stop('JOB_FAILURE_TERMINAL');return;}
   if(burst.recovery){needsRecovery=!s.recoveryQualified;if(s.recoveryQualified){stopped=null;burst.done=true;return;}}
   else if(s.coverage.queuedFresh===0){burst.done=true;return;}
   if(stopped||burst.started>=burst.maxJobs){burst.done=true;return;}launch();
  }
  function options(value,recovery){
   if(disposed||active||burst&&!burst.done)throw Error('EPOCH_ACTIVE_OR_DISPOSED');
   if(!value||Object.keys(value).some(k=>!['maxJobs','deadlineMs','stopBeforeAt'].includes(k))||!Number.isSafeInteger(value.maxJobs)||value.maxJobs<1||value.maxJobs>8||!Number.isSafeInteger(value.deadlineMs)||value.deadlineMs<1||value.deadlineMs>4800000||!Number.isSafeInteger(value.stopBeforeAt)||value.stopBeforeAt<=Date.now())throw Error('BURST_OPTIONS');
   burst={started:0,maxJobs:value.maxJobs,deadline:Math.min(Date.now()+value.deadlineMs,value.stopBeforeAt),done:false,recovery};
  }
  return Object.freeze({
   start(value){if(stopped||needsRecovery)throw Error('EXPLICIT_RECOVERY_REQUIRED');options(value,false);launch();return read();},
   recover(value){
    if(!needsRecovery||!capsule||stopped&&!['OWNER_CHANGED'].includes(stopped))throw Error('RECOVERY_UNSAFE_TERMINAL');
    const fresh=capture();if(!sourceOK()||!same(anchor,fresh,stableFields)||fresh.abort?.signal.aborted)throw Error('RECOVERY_STABLE_IDENTITY_REJECTED');
    // Each new failed owner transition starts fresh strong qualification. An unfinished stable recovery burst continues its stamp.
    if(stopped){recoveryCycle++;anchor=fresh;}else if(!fullSame(anchor,fresh))throw Error('RECOVERY_OWNER_CHANGED');
    stopped=null;options(value,true);launch();return read();
   },
   rebindCredentials(){
    const previous=jobs.at(-1)?.summary;
    if(disposed||active||burst&&!burst.done||stopped||needsRecovery||!capsule||previous?.released!==true||previous.complete!==true||previous.catalogStable!==true||previous.failure)throw Error('CREDENTIAL_REBIND_INACTIVE_STABLE_REQUIRED');
    const fresh=capture();
    if(!sourceOK()||!idleOwner()||!same(anchor,fresh,credentialStableFields)||!accountMediaStatesEqual(anchor.projection,fresh.projection))throw Error('CREDENTIAL_REBIND_OWNER_REJECTED');
    anchor=fresh;credentialRebinds++;return read();
   },
   read,
   pause(){stop('ROOT_PAUSE_CANCEL');return read();},
   cancel(){stop('ROOT_PAUSE_CANCEL');return read();},
   cleanup(){if(active){stop('ROOT_CLEANUP');return read();}if(timer!==null)clearTimeout(timer);if(capsule)createJob.clearContinuity(capsule);capsule=null;privateContextText=null;proof=null;anchor=null;disposed=true;return read();}
  });
 };
}
