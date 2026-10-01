function (createCollector,analyzer,binding) {
  'use strict';
  return function startRc29TsGopDiagnostic(){
    let owner=null,file=null,proof=null,projection=null;
    const rejected=()=>Object.freeze({poll:()=>({started:false,done:true,summary:{complete:false,failure:'SOURCE_BINDING_REJECTED',mediaRequests:0,metadataRequests:0,writeRequests:0}}),cancel:()=>({cancelled:true})});
    const proofOK=p=>p?.version===binding.version&&p.sourceCommit===binding.sourceCommit&&['app.js','sw.js','version.json'].every(k=>p.sourceSHA256?.[k]===binding.sourceSHA256[k]);
    const uiMatches=()=>{
      const rows=Array.isArray(state.files)?state.files.filter(x=>x.id===file?.id):[];
      if(rows.length!==1)return false;const row=rows[0];
      return row.name===file.name&&String(row.size)===String(file.size)&&row.mimeType===file.mimeType&&row.modifiedTime===file.modifiedTime&&
        Array.isArray(row.parents)&&JSON.stringify([...row.parents].sort())===JSON.stringify([...file.parents].sort())&&
        (row.driveId||null)===(file.driveId||null)&&(row.resourceKey||null)===(file.resourceKey||null)&&
        (row.version==null||file.version==null||String(row.version)===String(file.version));
    };
    const idle=()=>navigator.onLine===true&&document.visibilityState==='visible'&&state.authStatus==='online'&&hasUsableToken()&&state.demo===false&&!state.accountIdentityPending&&state.loadingFiles!==true&&state.loadingFavorites!==true&&state.loadingTree!==true&&Boolean(state.accountStateAbortController?.signal)&&!state.accountStateAbortController.signal.aborted&&state.accountStateLoaded===true&&state.selected===null&&state.mediaAttempt==='idle'&&state.mediaAbortController===null&&state.pendingOriginalBuffer===null&&state.pendingPlay===false&&state.mediaTransportStarted===false&&q1Playback===null&&playerMediaPriorityActive===false&&q1RetirementResult?.settled===true&&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null;
    try{
      const target=window.__resumeFailedNormalTarget;proof=window.__resumeSwProof;
      if(!target||target.version!==binding.version||target.sourceCommit!==binding.sourceCommit||target.accountId!==state.accountId||target.authAccountKey!==state.authAccountKey||target.controller!==navigator.serviceWorker.controller||!proofOK(proof?.get?.())||!idle())return rejected();
      file=JSON.parse(JSON.stringify(target.file));
      if(typeof file.id!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(file.id)||typeof file.name!=='string'||typeof file.mimeType!=='string'||typeof file.modifiedTime!=='string'||!Array.isArray(file.parents))return rejected();
      if(file.resourceKey!=null&&(typeof file.resourceKey!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(file.resourceKey)))return rejected();
      if(!uiMatches())return rejected();
      projection=JSON.parse(JSON.stringify(state.accountMediaState));
      owner={controller:navigator.serviceWorker.controller,account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,token:state.token,tokenRevision:state.tokenRevision,expiry:state.expiresAt,abort:state.accountStateAbortController,writer:state.accountStateWriterId,revision:state.accountStateRevision,source:mediaSourceGeneration,media:state.mediaSession,playback:state.playbackSession,retirement:q1RetirementResult,href:location.href,target};
      if(typeof owner.writer!=='string'||!owner.writer||!Number.isSafeInteger(owner.revision)||owner.revision<0)return rejected();
    }catch{return rejected();}
    const current=()=>Boolean(owner)&&APP_VERSION===binding.version&&DRIVE_MUTATIONS_ENABLED===false&&ACCOUNT_STATE_WRITES_ENABLED===true&&top===self&&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'&&location.href===owner.href&&navigator.serviceWorker.controller===owner.controller&&owner.controller?.state==='activated'&&proofOK(proof?.get?.())&&proof.get().controller===owner.controller&&idle()&&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth&&state.driveSessionGeneration===owner.drive&&state.token===owner.token&&state.tokenRevision===owner.tokenRevision&&state.expiresAt===owner.expiry&&state.accountStateAbortController===owner.abort&&!owner.abort.signal.aborted&&state.accountStateWriterId===owner.writer&&state.accountStateRevision===owner.revision&&mediaSourceGeneration===owner.source&&state.mediaSession===owner.media&&state.playbackSession===owner.playback&&q1RetirementResult===owner.retirement&&accountMediaStatesEqual(state.accountMediaState,projection)&&window.__resumeFailedNormalTarget===owner.target;
    try{
      const ownerCurrent=current;
      if(!ownerCurrent()||!uiMatches())return rejected();
      const runtime={file,token:owner.token,accountSignal:owner.abort.signal,events:window,serviceWorkerEvents:navigator.serviceWorker,current:()=>ownerCurrent()&&uiMatches(),
        fetch:(...args)=>{if(!ownerCurrent()||!uiMatches())throw Error('OWNER_CHANGED');return fetch(...args);},
        release:()=>{owner=null;file=null;proof=null;projection=null;runtime.file=null;runtime.token=null;}};
      const job=createCollector(runtime,analyzer,binding);job.run();return Object.freeze({poll:job.poll,cancel:job.cancel});
    }catch{owner=null;file=null;proof=null;projection=null;return rejected();}
  };
}
