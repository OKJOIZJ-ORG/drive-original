function (selected, swProof) {
  'use strict';
  const rejected=()=>Object.freeze({poll:()=>({done:true,summary:{failure:'FACADE_PREFLIGHT_REJECTED'}}),cancel:()=>({cancelled:true}),selectedFile:()=>null,release:()=>({released:true})});
  let projection,owner;
  try {
    if(!selected||!Array.isArray(state.files)||!state.files.includes(selected))return rejected();
    projection=JSON.parse(JSON.stringify(state.accountMediaState));
    owner={account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,
      tokenRevision:state.tokenRevision,token:state.token,expiry:state.expiresAt,abort:state.accountStateAbortController,
      controller:navigator.serviceWorker.controller,writer:state.accountStateWriterId,revision:state.accountStateRevision,
      session:state.mediaSession,playback:state.playbackSession,source:mediaSourceGeneration,retirement:q1RetirementResult};
  }catch{return rejected();}
  const current=()=>Boolean(owner)&&APP_VERSION==='1.22.0-rc.11'&&DRIVE_MUTATIONS_ENABLED===false
    &&ACCOUNT_STATE_WRITES_ENABLED===true&&top===self&&navigator.onLine===true&&document.visibilityState==='visible'
    &&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    &&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth
    &&state.driveSessionGeneration===owner.drive&&state.tokenRevision===owner.tokenRevision&&state.token===owner.token&&state.expiresAt===owner.expiry
    &&state.authStatus==='online'&&state.demo===false&&!state.accountIdentityPending&&hasUsableToken()
    &&state.accountStateAbortController===owner.abort&&Boolean(owner.abort?.signal)&&!owner.abort.signal.aborted
    &&navigator.serviceWorker.controller===owner.controller&&owner.controller?.state==='activated'
    &&swProof?.get?.()?.controller===owner.controller&&swProof?.get?.()?.version==='1.22.0-rc.11'
    &&state.accountStateLoaded===true&&state.accountStateWriterId===owner.writer&&typeof owner.writer==='string'&&owner.writer.length>0
    &&Number.isSafeInteger(owner.revision)&&owner.revision>=0&&state.accountStateRevision===owner.revision
    &&state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null
    &&accountMediaStatesEqual(state.accountMediaState,projection)
    &&state.mediaSession===owner.session&&state.playbackSession===owner.playback&&mediaSourceGeneration===owner.source
    &&q1RetirementResult===owner.retirement&&q1RetirementResult?.settled===true
    &&state.selected===null&&state.mediaAttempt==='idle'&&state.mediaAbortController===null&&state.pendingOriginalBuffer===null
    &&state.pendingPlay===false&&state.mediaTransportStarted===false&&q1Playback===null&&!playerMediaPriorityActive;
  let handle;
  try {
    if(!current())return rejected();
    handle=this({appVersion:APP_VERSION,readState:()=>{if(!current())throw new Error('OWNER_CHANGED');return state;},
      hasUsableToken,getMutationsEnabled:()=>DRIVE_MUTATIONS_ENABLED,getQ1Playback:()=>q1Playback,
      getQ1RetirementResult:()=>q1RetirementResult,getMediaSourceGeneration:()=>mediaSourceGeneration,
      getPlayerMediaPriorityActive:()=>playerMediaPriorityActive,getSWIdentity:()=>swProof?.get?.(),
      navigator,location,nativeFetch:(...args)=>{if(!current())throw new Error('OWNER_CHANGED');return fetch(...args);},
      addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)},selected);
  }catch{return rejected();}
  handle.run().finally(()=>{projection=null;owner=null;selected=null;swProof=null;});
  return Object.freeze({poll:()=>handle.poll(),cancel:()=>handle.cancel(),selectedFile:()=>handle.selectedFile(),release:()=>handle.release()});
}
