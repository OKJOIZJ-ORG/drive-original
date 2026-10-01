function installQ0ByteObserver(input,binding){
 'use strict';
 if(window.__q0Byte||(window.__resumeReplayTarget30&&window.__resumeReplayTarget30!==input)||typeof window.__driveOriginalMediaTraceSink==='function'||el.playerSheet.hidden!==true||q0Playback||q1Playback||q1RetirementResult?.settled!==true||state.mediaBlobUrl||state.pendingOriginalBuffer||state.pendingPlay||state.mediaTransportStarted)throw Error('Q0_OBSERVER_BUSY');
 const controller=navigator.serviceWorker.controller,account=state.accountId,key=state.authAccountKey,auth=state.authGeneration,drive=state.driveSessionGeneration,token=state.token,revision=state.tokenRevision;
 const target=input.target,proof=()=>window.__resumeSwProof?.get?.();
 const source=()=>APP_VERSION===binding.version&&controller===navigator.serviceWorker.controller&&proof()?.controller===controller&&proof()?.sourceCommit===binding.sourceCommit&&Object.keys(binding.sourceSHA256).every(k=>proof()?.sourceSHA256[k]===binding.sourceSHA256[k]);
 const current=()=>source()&&state.accountId===account&&state.authAccountKey===key&&state.authGeneration===auth&&state.driveSessionGeneration===drive&&state.token===token&&state.tokenRevision===revision&&hasUsableToken()&&document.visibilityState==='visible';
 if(!current()||account!==input.account.accountId||key!==input.account.authAccountKey)throw Error('Q0_OWNER');
 let disposed=false,armedAt=null,frameId=null,video=el.videoPlayer,owner=null,session=null,generation=null,first=null,progress=null,failure=null,polls=0;
 const meta=[],traceRows=new Map();let timer,playbackId=null,starts=0,traceOverflow=false;
 const trace=()=>({starts,requestCount:traceRows.size,terminalCount:[...traceRows.values()].filter(r=>r.terminal).length,finalReaderBytes:[...traceRows.values()].reduce((n,r)=>n+r.bytes,0),overflow:traceOverflow,rawIdentifiersExported:false});
 const sink=e=>{if(e.stage==='intent'&&playbackId===null&&armedAt!==null)playbackId=e.playbackId;if(e.playbackId!==playbackId||e.route!=='range'||!e.requestId)return;
  if(!traceRows.has(e.requestId)){if(traceRows.size>=64){traceOverflow=true;return;}traceRows.set(e.requestId,{bytes:0,terminal:false});}
  const r=traceRows.get(e.requestId);if(e.stage==='request-start')starts++;if(Number.isSafeInteger(e.bytes)&&e.bytes>=0)r.bytes=Math.max(r.bytes,e.bytes);
  if(['body-complete','request-cancelled'].includes(e.stage))r.terminal=true;
 };
 window.__driveOriginalMediaTraceSink=sink;
 const read=()=>({sourceCommit:binding.sourceCommit,version:binding.version,disposed,current:current(),firstFrame:first,progressFrame:progress,failure,polls,metadata:meta.slice(),swReaderTrace:trace(),actualPlaybackCount:first?1:0,rawIdentifiersExported:false,route:owner?'Q0':'NOT_YET_Q0'});
 function frame(_now,m){frameId=null;if(disposed||armedAt===null)return;
  if(!current()||q1Playback||state.selected?.id!==target.id||!q0Playback||!isCurrentQ0Playback(q0Playback,target.id,mediaSourceGeneration)||!isCurrentMediaEvent(video)||video!==el.videoPlayer||q0Playback.controller.signal.aborted){failure='Q0_FRAME_OWNER_REJECTED';return;}
  if(!owner){owner=q0Playback;session=state.mediaSession;generation=mediaSourceGeneration;}
  if(owner!==q0Playback||session!==state.mediaSession||generation!==mediaSourceGeneration){failure='Q0_OWNER_CHANGED';return;}
  const time=Number(m.mediaTime);if(!Number.isFinite(time)||!m.width||!m.height){failure='Q0_FRAME_INVALID';return;}
  const value={at:Date.now(),elapsedMs:Date.now()-armedAt,mediaTime:time,width:m.width,height:m.height,currentOwner:true};
  if(!first)first=value;else if(time>first.mediaTime+.25){progress=value;clearTimeout(timer);timer=setTimeout(()=>{failure='Q0_UNIT_DEADLINE';stop();},110000);}
  if(!progress)frameId=video.requestVideoFrameCallback(frame);
 }
 function stop(){if(disposed)return{disposed:true,frameCallbackRemoved:true,timerRemoved:true};disposed=true;clearTimeout(timer);if(frameId!==null)video.cancelVideoFrameCallback(frameId);frameId=null;if(window.__driveOriginalMediaTraceSink===sink)delete window.__driveOriginalMediaTraceSink;traceRows.clear();playbackId=null;return{disposed:true,frameCallbackRemoved:true,timerRemoved:true,traceSinkRemoved:window.__driveOriginalMediaTraceSink!==sink,privateTraceKeysCleared:true};}
 async function metadata(label){
  if(!['before','after'].includes(label)||meta.some(x=>x.label===label)||!current())throw Error('Q0_METADATA_OWNER');
  const fields=['id','name','size','mimeType','modifiedTime','parents','version','headRevisionId','sha256Checksum','md5Checksum','resourceKey'];
  const u=new URL('https://www.googleapis.com/drive/v3/files/'+target.id);u.searchParams.set('fields',fields.join(',')+',trashed,capabilities(canDownload)');u.searchParams.set('supportsAllDrives','true');
  const abort=new AbortController(),deadline=setTimeout(()=>abort.abort(),10000);let bytes=0,reader;
  try{
   const headers={Authorization:'Bearer '+token};if(target.resourceKey)headers['X-Goog-Drive-Resource-Keys']=target.id+'/'+target.resourceKey;
   const r=await fetch(u,{headers,cache:'no-store',redirect:'error',signal:abort.signal});if(r.status!==200)throw Error('Q0_METADATA_HTTP');
   reader=r.body.getReader();const chunks=[];while(true){const x=await reader.read();if(x.done)break;bytes+=x.value.byteLength;if(bytes>32768)throw Error('Q0_METADATA_BOUND');chunks.push(x.value);}
   const data=new Uint8Array(bytes);let offset=0;for(const x of chunks){data.set(x,offset);offset+=x.length;x.fill(0);}let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}finally{data.fill(0);}
   const same=fields.every(k=>k==='parents'?JSON.stringify([...(value[k]||[])].sort())===JSON.stringify([...target.parents].sort()):String(value[k]??'')===String(target[k]??''));
   const qualified=current()&&same&&value.trashed===false&&value.capabilities?.canDownload===true;
   const receipt={label,at:Date.now(),status:200,qualified,bytes};meta.push(receipt);if(!qualified)throw Error('Q0_METADATA_MISMATCH');return receipt;
  }finally{clearTimeout(deadline);try{await reader?.cancel();}catch{}try{reader?.releaseLock();}catch{}}
 }
 window.__resumeReplayTarget30=input;
 window.__q0Byte={read,metadata,stop,arm(){if(armedAt!==null||disposed||!current()||typeof video.requestVideoFrameCallback!=='function')throw Error('Q0_ARM');armedAt=Date.now();frameId=video.requestVideoFrameCallback(frame);timer=setTimeout(()=>{failure='Q0_FRAME_DEADLINE';stop();},70000);return{armed:true,maxMs:70000};}};
 return{installed:true,observerOnly:true};
}
