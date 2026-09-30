function (privateContextText,swProof,privatePriorText,mode) {
  'use strict';
  if(privatePriorText===undefined)privatePriorText=null;
  if(mode===undefined)mode='probe';
  const rejected=()=>Object.freeze({poll:()=>({started:false,done:true,phase:'rejected',summary:{schema:'drive-original.rc16-corpus-tracks-summary/1',complete:false,failure:'FACADE_PREFLIGHT_REJECTED',mediaRequests:0,writeRequests:0}}),cancel:()=>({cancelled:true})});
  let context,prior,projection,owner,job,settled=false;
  try {
    if(!['probe','metadata-only'].includes(mode)||typeof privateContextText!=='string'||privateContextText.length>4096)return rejected();
    context=JSON.parse(privateContextText);
    if(!context||Array.isArray(context)||Object.keys(context).sort().join(',')!=='accountKey,generation,priorityFileId,rootId'
      ||!['accountKey','priorityFileId','rootId'].every(k=>typeof context[k]==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(context[k]))||!Number.isSafeInteger(context.generation)||context.generation<0)return rejected();
    if(privatePriorText!==null){if(typeof privatePriorText!=='string'||privatePriorText.length>65536)return rejected();prior=JSON.parse(privatePriorText);}
    privateContextText=null;privatePriorText=null;
    projection=JSON.parse(JSON.stringify(state.accountMediaState));
    owner={account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,token:state.token,tokenRevision:state.tokenRevision,expiry:state.expiresAt,
      abort:state.accountStateAbortController,controller:navigator.serviceWorker.controller,writer:state.accountStateWriterId,revision:state.accountStateRevision,
      media:state.mediaSession,playback:state.playbackSession,source:mediaSourceGeneration,retirement:q1RetirementResult};
  }catch{return rejected();}
  const current=()=>Boolean(owner)&&APP_VERSION==='1.22.0-rc.16'&&DRIVE_MUTATIONS_ENABLED===false&&ACCOUNT_STATE_WRITES_ENABLED===true
    &&top===self&&navigator.onLine===true&&document.visibilityState==='visible'
    &&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    &&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth&&state.driveSessionGeneration===owner.drive
    &&state.token===owner.token&&state.tokenRevision===owner.tokenRevision&&state.expiresAt===owner.expiry&&state.accountStateAbortController===owner.abort&&Boolean(owner.abort?.signal)&&!owner.abort.signal.aborted
    &&state.authStatus==='online'&&state.demo===false&&!state.accountIdentityPending&&hasUsableToken()
    &&navigator.serviceWorker.controller===owner.controller&&owner.controller?.state==='activated'&&swProof?.get?.()?.controller===owner.controller&&swProof?.get?.()?.version==='1.22.0-rc.16'
    &&state.accountStateLoaded===true&&state.accountStateWriterId===owner.writer&&typeof owner.writer==='string'&&owner.writer.length>0
    &&Number.isSafeInteger(owner.revision)&&owner.revision>=0&&state.accountStateRevision===owner.revision
    &&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null
    &&accountMediaStatesEqual(state.accountMediaState,projection)
    &&state.mediaSession===owner.media&&state.playbackSession===owner.playback&&mediaSourceGeneration===owner.source&&q1RetirementResult===owner.retirement&&owner.retirement?.settled===true
    &&state.selected===null&&state.mediaAttempt==='idle'&&state.mediaAbortController===null&&state.pendingOriginalBuffer===null&&state.pendingPlay===false&&state.mediaTransportStarted===false
    &&q1Playback===null&&!playerMediaPriorityActive;
  try {
    if(!current()||context.accountKey!==owner.account||context.generation!==owner.drive)return rejected();
    const read=()=>{if(!current())throw Object.assign(new Error('OWNER_CHANGED'),{code:'OWNER_CHANGED'});return state;};
    job=this({appVersion:APP_VERSION,readState:read,getSWIdentity:()=>swProof?.get?.(),getMutationsEnabled:()=>DRIVE_MUTATIONS_ENABLED,
      hasUsableToken,getQ1Playback:()=>q1Playback,getQ1RetirementResult:()=>q1RetirementResult,getMediaSourceGeneration:()=>mediaSourceGeneration,
      getPlayerMediaPriorityActive:()=>playerMediaPriorityActive,navigator,location,document,top,self,privateContext:context,priorEvidence:prior,mode,
      nativeFetch:(...args)=>{read();return fetch(...args);},addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)});
    job.run().then(()=>{settled=true;context=null;prior=null;projection=null;owner=null;swProof=null;},()=>{settled=true;context=null;prior=null;projection=null;owner=null;swProof=null;});
  }catch{return rejected();}
  return Object.freeze({poll:()=>({...job.poll(),done:settled&&job.poll().done}),cancel:()=>job.cancel()});
}
