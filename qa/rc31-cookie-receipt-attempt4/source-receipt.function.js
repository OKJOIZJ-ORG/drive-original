function installRc31CookieSourceReceipt(binding) {
 'use strict';
 if(window.__rc31CookieSourceReceipt)throw Error('SOURCE_RECEIPT_ALREADY_OWNED');
 const input=window.__resumeReplayTarget30,target=input?.target||input?.metadata,account=input?.account;
 const owner=q1Playback,player=owner?.player,initial=player?.stats?.(),native=getActiveMediaElement();
 const controller=navigator.serviceWorker.controller,generation=initial?.generation,driveGeneration=state.driveSessionGeneration;
 const safe=v=>Number.isSafeInteger(v)&&v>=0?v:null;
 const counts=s=>Object.fromEntries(['readsStarted','readsCompleted','metadataRequests','rangeRequests','receivedBytes','releasedBytes'].map(k=>[k,safe(s?.[k])]));
 const proofSame=()=>{const p=window.__resumeSwProof?.get();return!!p&&APP_VERSION===binding.version&&p.version===binding.version&&p.sourceCommit===binding.sourceCommit&&p.controller===controller&&navigator.serviceWorker.controller===controller&&controller?.state==='activated'&&Object.keys(binding.sourceSHA256).every(k=>p.sourceSHA256?.[k]===binding.sourceSHA256[k]);};
 const accountSame=()=>!!account&&state.accountId===account.accountId&&state.authAccountKey===account.authAccountKey&&state.driveSessionGeneration===driveGeneration;
 const match=()=>!!target&&!!state.selected&&['id','name','size','mimeType','modifiedTime'].every(k=>target[k]==null||String(state.selected[k])===String(target[k]))&&(!target.parents||JSON.stringify([...state.selected.parents||[]].sort())===JSON.stringify([...target.parents].sort()));
 const fresh=()=>!!target&&['version','headRevisionId','sha256Checksum','md5Checksum'].every(k=>target[k]==null||state.selected?.[k]==null||String(state.selected[k])===String(target[k]));
 const before={exactSource31:proofSame(),accountSame:accountSame(),targetSame:match(),freshSameWhenKnown:fresh(),
  exactCurrentOwner:!!owner&&q1Playback===owner,exactPlayer:!!player&&owner?.player===player,
  nativeEventCurrent:!!native&&isCurrentMediaEvent(native),nativeErrorAbsent:!!native&&!native.error,
  q1Ts:owner?.kind==='ts',sourceGenerationSame:owner?.swGeneration===mediaSourceGeneration,
  sessionSame:owner?.session===state.mediaSession,ownerAccountSame:owner?.account===state.authAccountKey,
  ownerDriveGenerationSame:owner?.accountGeneration===driveGeneration,ownerControllerSame:owner?.swController===controller,
  controllerNotAborted:!!owner?.controller&&!owner.controller.signal.aborted,
  pipelineGenerationKnown:Number.isSafeInteger(generation)&&generation>0,
  pipelineHealthy:!!initial&&!initial.disposed&&!initial.failure&&!['failed','cancelled'].includes(initial.phase),visible:document.visibilityState==='visible'};
 if(!Object.values(before).every(Boolean))throw Error('SOURCE_RECEIPT_OWNER_ADMISSION');
 const live={sourceStatsPresent:!!initial.source,counters:counts(initial.source),generation:safe(generation)};
 let disposed=false;
 function retired(){if(disposed)throw Error('SOURCE_RECEIPT_DISPOSED');const s=player.stats();
  const fences={exactSource31:proofSame(),accountSame:accountSame(),sameRetainedPlayer:owner.player===player,
   sameRetainedGeneration:s?.generation===generation,playerDisposed:s?.disposed===true,
   exactOwnerRetirement:!!owner.retirement&&owner.retirement===q1Retirement,
   closedSettled:state.selected===null&&el.playerSheet.hidden&&q1Playback===null&&q0Playback===null&&q1RetirementResult?.settled===true,
   noBlob:!state.mediaBlobUrl,noFrameOwner:state.frameCallbackId===null,visible:document.visibilityState==='visible'};
  const counters=counts(s?.source),sourceStatsPresent=!!s?.source;
  const predicates={sourceStatsPresent,readsCompletedPositive:counters.readsCompleted!==null&&counters.readsCompleted>0,
   rangeRequestsPositive:counters.rangeRequests!==null&&counters.rangeRequests>0,receivedBytesPositive:counters.receivedBytes!==null&&counters.receivedBytes>0};
  return{scope:'Q1_ORIGINAL_BYTE_READ_ONLY',q0CookieCoverage:'UNKNOWN',ownerBeforeClose:{...before},
   preClose:{...live,counters:{...live.counters}},postClose:{generation:safe(s?.generation),sourceStatsPresent,counters,fences,predicates},
   originalBytePathQualified:Object.values(before).every(Boolean)&&Object.values(fences).every(Boolean)&&Object.values(predicates).every(Boolean),rawIdentifiersExported:false};
 }
 function stop(){disposed=true;return{retainedHandleReleased:true};}
 window.__rc31CookieSourceReceipt=Object.freeze({retired,stop});
 return{retainedPrivately:true,ownerBeforeClose:{...before},preClose:{...live,counters:{...live.counters}},rawIdentifiersExported:false};
}
