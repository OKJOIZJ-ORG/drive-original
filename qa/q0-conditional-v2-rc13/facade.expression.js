(function (selected, swProof) {
  'use strict';
  const rejected=()=>Object.freeze({poll:()=>({done:true,summary:{failure:'FACADE_PREFLIGHT_REJECTED'}}),cancel:()=>({cancelled:true}),selectedFile:()=>null,release:()=>({released:true})});
  let projection,owner,fileSnapshot;
  try {
    if(!selected||!Array.isArray(state.files)||!state.files.includes(selected))return rejected();
    fileSnapshot={id:selected.id,size:String(selected.size),mimeType:selected.mimeType,modifiedTime:selected.modifiedTime,canDownload:selected.capabilities?.canDownload,resourceKey:selected.resourceKey??null};
    if(!/^[A-Za-z0-9_-]{1,512}$/.test(fileSnapshot.id)||fileSnapshot.canDownload!==true||!Number.isSafeInteger(Number(fileSnapshot.size))||Number(fileSnapshot.size)<=2)return rejected();
    projection=JSON.parse(JSON.stringify(state.accountMediaState));
    owner={caps:state.authCapabilities,account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,
      tokenRevision:state.tokenRevision,token:state.token,expiry:state.expiresAt,abort:state.accountStateAbortController,
      controller:navigator.serviceWorker.controller,writer:state.accountStateWriterId,revision:state.accountStateRevision,
      session:state.mediaSession,playback:state.playbackSession,source:mediaSourceGeneration,retirement:q1RetirementResult};
  }catch{return rejected();}
  const current=()=>Boolean(owner)&&APP_VERSION==='1.22.0-rc.13'&&DRIVE_MUTATIONS_ENABLED===false
    &&ACCOUNT_STATE_WRITES_ENABLED===true&&top===self&&navigator.onLine===true&&document.visibilityState==='visible'
    &&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    &&state.files.includes(selected)&&selected.id===fileSnapshot.id&&String(selected.size)===fileSnapshot.size
    &&selected.mimeType===fileSnapshot.mimeType&&selected.modifiedTime===fileSnapshot.modifiedTime
    &&selected.capabilities?.canDownload===fileSnapshot.canDownload&&(selected.resourceKey??null)===fileSnapshot.resourceKey
    &&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth
    &&state.driveSessionGeneration===owner.drive&&state.tokenRevision===owner.tokenRevision&&state.token===owner.token&&state.expiresAt===owner.expiry
    &&state.authCapabilities===owner.caps&&owner.caps?.version===1&&owner.caps.driveRead===true&&owner.caps.appData===true
    &&state.authStatus==='online'&&state.demo===false&&!state.accountIdentityPending&&hasUsableToken()
    &&state.accountStateAbortController===owner.abort&&Boolean(owner.abort?.signal)&&!owner.abort.signal.aborted
    &&navigator.serviceWorker.controller===owner.controller&&owner.controller?.state==='activated'
    &&swProof?.get?.()?.controller===owner.controller&&swProof?.get?.()?.version==='1.22.0-rc.13'
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
  const summary={schema:'drive-original.q0-conditional-v2-rc13/1',complete:false,failure:null,metadataRequests:0,metadataBytes:0,
    mediaRequests:0,mediaBytes:0,results:[],v2MetadataRequests:0,v2MetadataBytes:0,v2EtagPresent:false,validatorOrigin:"v2-json-unproven",etagExposed:false,strongEtag:false,conditionalSupported:null,sourceCleanup:null,metadataCleanup:'not-started',
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
    check();if(++summary.metadataRequests>6)throw fail('METADATA_REQUEST_LIMIT');
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
      try{reader?.releaseLock();}catch{cleanupFailed='CLEANUP_FAILED';throw fail(cleanupFailed);}
    }
  }
  const metadata=args=>{const p=metadataBody(args);work.add(p);p.then(()=>work.delete(p),()=>work.delete(p));return p;};
  const cancel=()=>{if(!abort.signal.aborted)abort.abort(fail('CANCELLED'));return {cancelled:true};};
  window.addEventListener('pagehide',cancel,{once:true});
  timeout=setTimeout(()=>abort.abort(fail('RUN_TIMEOUT')),60000);
  let etag=null;
  async function v2Metadata({signal}){
    check();if(++summary.v2MetadataRequests>1)throw fail('V2_METADATA_REQUEST_LIMIT');
    const child=new AbortController(),onAbort=()=>child.abort(signal.reason||fail('CANCELLED'));
    signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();
    const timer=setTimeout(()=>child.abort(fail('V2_METADATA_TIMEOUT')),10000);
    let pending=null,response=null,reader=null,eof=false;
    try{
      const url=new URL('https://www.googleapis.com/drive/v2/files/'+fileSnapshot.id);
      url.searchParams.set('supportsAllDrives','true');
      url.searchParams.set('fields','id,etag');
      const headers={Authorization:'Bearer '+owner.token};
      if(fileSnapshot.resourceKey)headers['X-Goog-Drive-Resource-Keys']=fileSnapshot.id+'/'+fileSnapshot.resourceKey;
      pending=Promise.resolve(fetch(url.href,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',headers,signal:child.signal}));
      response=await race(pending,child.signal);check();
      if(response.status!==200||!response.body)throw fail('V2_METADATA_RESPONSE');
      reader=response.body.getReader();const chunks=[];let length=0;
      for(;;){const item=await race(reader.read(),child.signal);check();if(item.done){eof=true;break;}
        if(!(item.value instanceof Uint8Array))throw fail('V2_METADATA_RESPONSE');
        summary.v2MetadataBytes+=item.value.length;length+=item.value.length;
        if(summary.v2MetadataBytes>2048)throw fail('V2_METADATA_BYTE_LIMIT');chunks.push(item.value);
      }
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));bytes.fill(0);
      if(data.id!==fileSnapshot.id)throw fail('LIST_IDENTITY_MISMATCH');
      summary.v2EtagPresent=typeof data.etag==='string';
      summary.strongEtag=typeof data.etag==='string'&&data.etag.length<=512&&/^"[\x21\x23-\x7e]+"$/.test(data.etag);
      if(summary.strongEtag)etag=data.etag;
      return data;
    }catch(error){
      if(child.signal.aborted)throw child.signal.reason;
      if(error?.name==='TypeError')throw fail('V2_METADATA_CORS_OR_NETWORK');
      throw error;
    }finally{
      clearTimeout(timer);signal.removeEventListener('abort',onAbort);child.abort(fail('CANCELLED'));
      if(!eof){
        const cleanup=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();
        try{await bounded(cleanup,2000);summary.metadataCleanup='cancel-settled';}
        catch(error){cleanupFailed=error?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';summary.metadataCleanup=cleanupFailed;throw fail(cleanupFailed);}
      }else summary.metadataCleanup='body-consumed';
      try{reader?.releaseLock();}catch{cleanupFailed='CLEANUP_FAILED';throw fail(cleanupFailed);}
    }
  }

  async function media(stage,condition=null){
    check();if(++summary.mediaRequests>3)throw fail('MEDIA_REQUEST_LIMIT');
    const child=new AbortController(),stop=()=>child.abort(abort.signal.reason||fail('CANCELLED'));
    abort.signal.addEventListener('abort',stop,{once:true});
    const timer=setTimeout(()=>child.abort(fail('MEDIA_TIMEOUT')),15000);
    let pending=null,response=null,reader=null,eof=false;
    try{
      const url=new URL('https://www.googleapis.com/drive/v3/files/'+fileSnapshot.id);
      url.searchParams.set('alt','media');url.searchParams.set('supportsAllDrives','true');
      const headers={Authorization:'Bearer '+owner.token,Range:'bytes=0-1'};
      if(fileSnapshot.resourceKey)headers['X-Goog-Drive-Resource-Keys']=fileSnapshot.id+'/'+fileSnapshot.resourceKey;
      if(condition!==null)headers['If-Match']=condition;
      pending=Promise.resolve(fetch(url.href,{method:'GET',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',headers,signal:child.signal}));
      response=await race(pending,child.signal);check();
      const row={stage,status:response.status,bodyBytes:0};summary.results.push(row);
      if(response.status===412&&stage==='nonmatching'){row.rejected=true;return;}
      if(response.status!==206||!response.body)throw fail('MEDIA_RESPONSE');
      const cr=response.headers.get('Content-Range'),cl=response.headers.get('Content-Length');
      if((cr!==null&&cr!=='bytes 0-1/'+fileSnapshot.size)||(cr===null&&cl!=='2')||(cl!==null&&cl!=='2'))throw fail('MEDIA_RANGE_EVIDENCE');
      const observed=response.headers.get('ETag');
      if(stage==='baseline'){
        summary.etagExposed=observed!==null;
        // Response ETag visibility is evidence only; the candidate stays the v2 JSON value.
      }
      reader=response.body.getReader();let length=0;
      for(;;){const item=await race(reader.read(),child.signal);check();if(item.done){eof=true;break;}
        if(!(item.value instanceof Uint8Array))throw fail('MEDIA_RESPONSE');
        length+=item.value.length;summary.mediaBytes+=item.value.length;
        if(length>2||summary.mediaBytes>6)throw fail('MEDIA_BYTE_LIMIT');
      }
      if(length!==2)throw fail('MEDIA_LENGTH');row.bodyBytes=length;row.rejected=false;
    }catch(error){
      if(child.signal.aborted)throw child.signal.reason;
      if(error?.name==='TypeError')throw fail('MEDIA_CORS_OR_NETWORK');
      throw error;
    }finally{
      clearTimeout(timer);abort.signal.removeEventListener('abort',stop);child.abort(fail('CANCELLED'));
      if(!eof){const cleanup=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();
        try{await bounded(cleanup,2000);}catch(error){cleanupFailed=error?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';throw fail(cleanupFailed);}
      }
      try{reader?.releaseLock();}catch{cleanupFailed='CLEANUP_FAILED';throw fail(cleanupFailed);}
    }
  }
  const execute=async()=>{
    try{
      await metadata({signal:abort.signal});await v2Metadata({signal:abort.signal});await media('baseline');await metadata({signal:abort.signal});check();
      if(summary.strongEtag){
        await metadata({signal:abort.signal});await media('matching',etag);await metadata({signal:abort.signal});check();
        const wrong=etag==='"drive-original-qa-nonmatching-1"'?'"drive-original-qa-nonmatching-2"':'"drive-original-qa-nonmatching-1"';
        await metadata({signal:abort.signal});await media('nonmatching',wrong);await metadata({signal:abort.signal});check();
        summary.conditionalSupported=summary.results.at(-1).status===412;
      }
      summary.complete=true;
    }catch(error){summary.failure=/^(?:V2_METADATA|METADATA|LIST_IDENTITY|MEDIA|CLEANUP|OWNER|RUN|CANCELLED)[A-Z_]*$/.test(error?.code||error?.message||'')?error.code||error.message:'CONDITIONAL_DIAGNOSTIC_FAILED';}
    finally{
      clearTimeout(timeout);window.removeEventListener('pagehide',cancel);cancel();
      if(work.size)try{await bounded(Promise.allSettled([...work]),3000);}catch{cleanupFailed='CLEANUP_TIMEOUT';}
      if(cleanupFailed){summary.failure=cleanupFailed;summary.complete=false;}
      summary.sourceCleanup={settled:!cleanupFailed,scope:'local fetch/body callbacks only'};
      source=null;projection=null;owner=null;fileSnapshot=null;pinned=null;selected=null;swProof=null;etag=null;
      summary.localReferencesReleased=true;done=true;
    }
  };
  void execute();
  return Object.freeze({poll:()=>({done,summary:done?JSON.parse(JSON.stringify(summary)):null}),cancel});
}
)