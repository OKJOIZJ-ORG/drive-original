(function (selected, clock, swProof) {
  'use strict';
  const rejected=()=>Object.freeze({poll:()=>({done:true,summary:{failure:'FACADE_PREFLIGHT_REJECTED'}}),cancel:()=>({cancelled:true}),selectedFile:()=>null,release:()=>({released:true})});
  let projection,owner,fileSnapshot;
  try {
    if(typeof clock!=='function'||!selected||!Array.isArray(state.files)||!state.files.includes(selected))return rejected();
    fileSnapshot={id:selected.id,size:String(selected.size),mimeType:selected.mimeType,modifiedTime:selected.modifiedTime,canDownload:selected.capabilities?.canDownload,resourceKey:selected.resourceKey??null};
    if(!/^[A-Za-z0-9_-]{1,512}$/.test(fileSnapshot.id)||fileSnapshot.canDownload!==true||!Number.isSafeInteger(Number(fileSnapshot.size))||Number(fileSnapshot.size)<=524144||Number(fileSnapshot.size)%188!==0)return rejected();
    projection=JSON.parse(JSON.stringify(state.accountMediaState));
    owner={account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,
      tokenRevision:state.tokenRevision,token:state.token,expiry:state.expiresAt,abort:state.accountStateAbortController,
      controller:navigator.serviceWorker.controller,writer:state.accountStateWriterId,revision:state.accountStateRevision,
      session:state.mediaSession,playback:state.playbackSession,source:mediaSourceGeneration,retirement:q1RetirementResult};
  }catch{return rejected();}
  const current=()=>Boolean(owner)&&APP_VERSION==='1.22.0-rc.11'&&DRIVE_MUTATIONS_ENABLED===false
    &&ACCOUNT_STATE_WRITES_ENABLED===true&&top===self&&navigator.onLine===true&&document.visibilityState==='visible'
    &&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    &&state.files.includes(selected)&&selected.id===fileSnapshot.id&&String(selected.size)===fileSnapshot.size
    &&selected.mimeType===fileSnapshot.mimeType&&selected.modifiedTime===fileSnapshot.modifiedTime
    &&selected.capabilities?.canDownload===fileSnapshot.canDownload&&(selected.resourceKey??null)===fileSnapshot.resourceKey
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
  if(!current())return rejected();
  const abort=new AbortController(),work=new Set();let done=false,source=null,timeout=null,cleanupFailed=null;
  const summary={schema:'drive-original.clock-live-rc11/1',complete:false,failure:null,metadataRequests:0,metadataBytes:0,
    mediaRequests:0,mediaBytes:0,clock:null,sourceCleanup:null,metadataCleanup:'not-started',
    genericUpstreamCleanup:'unknown',localReferencesReleased:false};
  const fail=code=>Object.assign(new Error(code),{code});
  const check=()=>{if(abort.signal.aborted)throw fail(abort.signal.reason?.code||'CANCELLED');if(!current())throw fail('OWNER_CHANGED');};
  const race=(promise,signal)=>new Promise((resolve,reject)=>{
    const onAbort=()=>finish(reject,signal.reason||fail('CANCELLED'));
    const finish=(fn,value)=>{signal.removeEventListener('abort',onAbort);fn(value);};
    signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();
    Promise.resolve(promise).then(v=>finish(resolve,v),e=>finish(reject,e));
  });
  const bounded=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(fail('CLEANUP_TIMEOUT')),ms);
  })]).finally(()=>clearTimeout(timer));};
  let pinned=null;
  async function metadataBody({signal}){
    check();if(++summary.metadataRequests>5)throw fail('METADATA_REQUEST_LIMIT');
    const child=new AbortController(),onAbort=()=>child.abort(signal.reason||fail('CANCELLED'));
    signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();
    const timer=setTimeout(()=>child.abort(fail('METADATA_TIMEOUT')),10000);
    let pending=null,response=null,reader=null,eof=false;
    try{
      const url=new URL('https://www.googleapis.com/drive/v3/files/'+fileSnapshot.id);
      url.searchParams.set('supportsAllDrives','true');
      url.searchParams.set('fields','id,version,headRevisionId,sha256Checksum,size,mimeType,modifiedTime,trashed,resourceKey,capabilities(canDownload)');
      const headers={Authorization:'Bearer '+owner.token};
      if(fileSnapshot.resourceKey)headers['X-Goog-Drive-Resource-Keys']=fileSnapshot.id+'/'+fileSnapshot.resourceKey;
      pending=Promise.resolve(fetch(url.href,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',headers,signal:child.signal}));
      response=await race(pending,child.signal);check();
      if(response.status!==200||!response.body)throw fail('METADATA_RESPONSE');
      reader=response.body.getReader();const chunks=[];let length=0;
      for(;;){const item=await race(reader.read(),child.signal);check();if(item.done){eof=true;break;}
        if(!(item.value instanceof Uint8Array))throw fail('METADATA_RESPONSE');
        summary.metadataBytes+=item.value.length;length+=item.value.length;
        if(summary.metadataBytes>32768)throw fail('METADATA_BYTE_LIMIT');chunks.push(item.value);
      }
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));bytes.fill(0);
      if(data.id!==fileSnapshot.id||String(data.size)!==fileSnapshot.size||data.mimeType!==fileSnapshot.mimeType
        ||data.modifiedTime!==fileSnapshot.modifiedTime||data.capabilities?.canDownload!==true||data.trashed!==false
        ||(data.resourceKey??null)!==fileSnapshot.resourceKey)throw fail('LIST_IDENTITY_MISMATCH');
      if(typeof data.version!=='string'||!/^\d+$/.test(data.version))throw fail('METADATA_IDENTITY');
      const identity={version:data.version,headRevisionId:data.headRevisionId??null,sha256Checksum:data.sha256Checksum??null};
      if(pinned&&Object.keys(identity).some(k=>identity[k]!==pinned[k]))throw fail('METADATA_IDENTITY_CHANGED');
      if(!pinned){for(const k of Object.keys(identity))if(selected[k]!=null&&selected[k]!==identity[k])throw fail('LIST_IDENTITY_MISMATCH');pinned=identity;}
      return data;
    }finally{
      clearTimeout(timer);signal.removeEventListener('abort',onAbort);child.abort(fail('CANCELLED'));
      if(!eof){
        const cleanup=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();
        try{await bounded(cleanup,2000);summary.metadataCleanup='cancel-settled';}
        catch(error){cleanupFailed=error?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';summary.metadataCleanup=cleanupFailed;throw fail(cleanupFailed);}
      }else summary.metadataCleanup='body-consumed';
      try{reader?.releaseLock();}catch{cleanupFailed='CLEANUP_FAILED';}
    }
  }
  const metadata=args=>{const p=metadataBody(args);work.add(p);p.then(()=>work.delete(p),()=>work.delete(p));return p;};
  const cancel=()=>{if(!abort.signal.aborted)abort.abort(fail('CANCELLED'));return {cancelled:true};};
  window.addEventListener('pagehide',cancel,{once:true});
  timeout=setTimeout(()=>abort.abort(fail('RUN_TIMEOUT')),60000);
  const execute=async()=>{
    try{
      check();const {openDriveQ1Source}=await race(import('./media/drive-source.mjs'),abort.signal);check();
      source=await openDriveQ1Source({fileId:fileSnapshot.id,accountKey:owner.key,accountGeneration:owner.drive,
        signal:abort.signal,isCurrent:()=>!abort.signal.aborted&&current(),requestTimeoutMs:15000,readMetadata:metadata,
        readRange:({range,signal})=>{
          check();if(++summary.mediaRequests>2)throw fail('MEDIA_REQUEST_LIMIT');
          const expected=summary.mediaRequests===1?[0,524143]:[Number(fileSnapshot.size)-524144,Number(fileSnapshot.size)-1];
          if(range!=='bytes='+expected[0]+'-'+expected[1])throw fail('MEDIA_RANGE_REJECTED');
          const url=new URL('/__drive_media/'+fileSnapshot.id,location.href);
          url.searchParams.set('accountGeneration',String(owner.drive));url.searchParams.set('mediaSession',String(owner.session));
          url.searchParams.set('size',fileSnapshot.size);if(fileSnapshot.resourceKey)url.searchParams.set('resourceKey',fileSnapshot.resourceKey);
          return fetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal});
        }});
      check();summary.clock=await clock({sourceSize:Number(source.identity.size),isCurrent:()=>!abort.signal.aborted&&current(),
        read:async request=>{check();const bytes=await source.read({...request,signal:abort.signal});check();summary.mediaBytes+=bytes.length;
          if(summary.mediaBytes>1048288)throw fail('MEDIA_BYTE_LIMIT');return bytes;}});
      check();summary.complete=true;
    }catch(error){
      summary.failure=/^(?:CLOCK|Q1_SOURCE|METADATA|LIST_IDENTITY|MEDIA|CLEANUP|OWNER|RUN|CANCELLED)[A-Z_]*$/.test(error?.code||error?.message||'')
        ?error.code||error.message:'CLOCK_DIAGNOSTIC_FAILED';
      if(error?.cleanup)summary.sourceCleanup=error.cleanup;
    }finally{
      clearTimeout(timeout);window.removeEventListener('pagehide',cancel);cancel();
      if(source){try{summary.sourceCleanup=await source.abort();const stats=source.stats();summary.mediaBytes=stats.receivedBytes;}catch{cleanupFailed='SOURCE_CLEANUP_FAILED';}}
      if(work.size)try{await bounded(Promise.allSettled([...work]),3000);}catch{cleanupFailed='CLEANUP_TIMEOUT';}
      if(cleanupFailed||summary.sourceCleanup?.settled!==true){summary.failure=cleanupFailed||'SOURCE_CLEANUP_UNCONFIRMED';summary.complete=false;}
      source=null;projection=null;owner=null;fileSnapshot=null;pinned=null;selected=null;clock=null;swProof=null;
      summary.localReferencesReleased=true;done=true;
    }
  };
  void execute();
  return Object.freeze({poll:()=>({done,summary:done?JSON.parse(JSON.stringify(summary)):null}),cancel});
})
