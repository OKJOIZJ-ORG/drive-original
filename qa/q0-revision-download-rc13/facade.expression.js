(function (selected, swProof) {
  'use strict';
  const rejected=()=>Object.freeze({poll:()=>({done:true,summary:{failure:'FACADE_PREFLIGHT_REJECTED'}}),cancel:()=>({cancelled:true}),selectedFile:()=>null,release:()=>({released:true})});
  let projection,owner,fileSnapshot;
  try {
    if(!selected||!Array.isArray(state.files)||!state.files.includes(selected))return rejected();
    fileSnapshot={id:selected.id,size:String(selected.size),mimeType:selected.mimeType,modifiedTime:selected.modifiedTime,canDownload:selected.capabilities?.canDownload,resourceKey:selected.resourceKey??null};
    if(!/^[A-Za-z0-9_-]{1,512}$/.test(fileSnapshot.id)||fileSnapshot.canDownload!==true||!Number.isSafeInteger(Number(fileSnapshot.size))||Number(fileSnapshot.size)<=3)return rejected();
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
  const summary={schema:'drive-original.q0-revision-download-rc13/1',complete:false,failure:null,metadataRequests:0,metadataBytes:0,
    mediaRequests:0,mediaBytes:0,results:[],postRequests:0,operationRequests:0,payloadBytes:0,partialAllowed:null,revisionRequested:false,identitySafe:false,pinQualification:'unproven',sourceCleanup:null,metadataCleanup:'not-started',
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
    check();if(++summary.metadataRequests>4)throw fail('METADATA_REQUEST_LIMIT');
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
        if(summary.metadataBytes+summary.payloadBytes>32768)throw fail('METADATA_BYTE_LIMIT');chunks.push(item.value);
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
  timeout=setTimeout(()=>abort.abort(fail('RUN_TIMEOUT')),40000);
  const started=Date.now();
  let operationName=null,downloadUri=null,resourceKey=fileSnapshot.resourceKey,revision=null;
  const safeUrl=(value,observe=false)=>{
    let url;try{url=new URL(value);}catch{throw fail('URI_INVALID');}
    const known=['www.googleapis.com','content.googleapis.com','drive.google.com','drive.usercontent.google.com'];
    const privateValues=[fileSnapshot.id,revision,resourceKey,owner.account,owner.key].filter(v=>typeof v==='string'&&v.length>0);
    if(observe)summary.observedUriOrigin={https:url.protocol==='https:',knownHost:known.includes(url.hostname)&&!privateValues.some(v=>url.hostname.includes(v))?url.hostname:null,
      googleFamily:url.hostname==='googleapis.com'||url.hostname.endsWith('.googleapis.com')?'googleapis':url.hostname==='googleusercontent.com'||url.hostname.endsWith('.googleusercontent.com')?'googleusercontent':url.hostname==='google.com'||url.hostname.endsWith('.google.com')?'google':'other',allowlisted:url.origin==='https://www.googleapis.com'};
    if(url.origin!=='https://www.googleapis.com'||url.username||url.password||url.hash)throw fail('URI_ORIGIN_UNQUALIFIED');
    return url;
  };
  async function request(url,{kind,method='GET',start=0}={}){
    check();safeUrl(url);
    if(kind==='post'&&++summary.postRequests>1||kind==='operation'&&++summary.operationRequests>3||kind==='media'&&++summary.mediaRequests>2)throw fail('REQUEST_LIMIT');
    const child=new AbortController(),stop=()=>child.abort(abort.signal.reason||fail('CANCELLED'));
    abort.signal.addEventListener('abort',stop,{once:true});if(abort.signal.aborted)stop();
    const timer=setTimeout(()=>child.abort(fail('REQUEST_TIMEOUT')),10000);
    let pending=null,response=null,reader=null,eof=false;
    try{
      const headers={Authorization:'Bearer '+owner.token};
      if(resourceKey)headers['X-Goog-Drive-Resource-Keys']=fileSnapshot.id+'/'+resourceKey;
      if(kind==='media')headers.Range=`bytes=${start}-${start+1}`;
      pending=Promise.resolve(fetch(url,{method,headers,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:child.signal}));
      response=await race(pending,child.signal);check();
      const row={kind,status:response.status,bodyBytes:0};summary.results.push(row);
      if(response.redirected||response.type==='opaqueredirect'||(response.url&&response.url!==url))throw fail('RESPONSE_REDIRECT');
      if(response.status!==(kind==='media'?206:200)||!response.body)throw fail('HTTP_RESPONSE');
      if(kind==='media'){
        const cr=response.headers.get('Content-Range'),cl=response.headers.get('Content-Length');
        row.contentRangeExposed=cr!==null;row.rangeConsistent=(cr!==null?cr===`bytes ${start}-${start+1}/${fileSnapshot.size}`:cl==='2')&&(cl===null||cl==='2');
        if(!row.rangeConsistent||response.headers.get('Content-Encoding'))throw fail('MEDIA_RANGE');
      }
      reader=response.body.getReader();const chunks=[];let length=0;
      for(;;){const item=await race(reader.read(),child.signal);check();if(item.done){eof=true;break;}
        if(!(item.value instanceof Uint8Array))throw fail('BODY_INVALID');length+=item.value.length;
        if(kind==='media'){summary.mediaBytes+=item.value.length;if(length>2||summary.mediaBytes>4)throw fail('MEDIA_BYTE_LIMIT');}
        else{summary.payloadBytes+=item.value.length;if(summary.payloadBytes+summary.metadataBytes>32768)throw fail('PAYLOAD_LIMIT');chunks.push(item.value);}
      }
      row.bodyBytes=length;
      if(kind==='media'){if(length!==2)throw fail('MEDIA_LENGTH');return null;}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw fail('PAYLOAD_INVALID');}finally{bytes.fill(0);}
      return data;
    }catch(error){
      if(child.signal.aborted)throw child.signal.reason;
      if(error?.name==='TypeError')throw fail('CORS_OR_NETWORK');
      throw error;
    }finally{
      clearTimeout(timer);abort.signal.removeEventListener('abort',stop);
      if(!eof){const cleanup=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();
        child.abort();try{await bounded(cleanup,2000);}catch(error){cleanupFailed=error?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';throw fail(cleanupFailed);}
      }else child.abort();
      try{reader?.releaseLock();}catch{cleanupFailed='CLEANUP_FAILED';throw fail(cleanupFailed);}
    }
  }
  function operation(data){
    if(!data||typeof data!=='object'||Array.isArray(data))throw fail('OPERATION_INVALID');
    if(data.done!=null&&typeof data.done!=='boolean')throw fail('OPERATION_INVALID');
    if(data.name!=null){
      if(typeof data.name!=='string'||! /^(?:operations\/)?[A-Za-z0-9_-]{1,1024}$/.test(data.name))throw fail('OPERATION_NAME');
      if(operationName!==null&&operationName!==data.name)throw fail('OPERATION_CHANGED');operationName=data.name;
    }
    if(data.metadata?.resourceKey!=null){
      const key=data.metadata.resourceKey;
      if(typeof key!=='string'||! /^[A-Za-z0-9_-]{1,512}$/.test(key)||(resourceKey!==null&&key!==resourceKey))throw fail('RESOURCE_KEY_CHANGED');
      resourceKey=key;
    }
    if(data.error){summary.operationErrorCode=Number.isInteger(data.error.code)&&data.error.code>=0&&data.error.code<=16?data.error.code:null;throw fail('OPERATION_ERROR');}
    if(data.done!==true){if(data.response)throw fail('OPERATION_INVALID');if(!operationName)throw fail('OPERATION_NAME');return false;}
    const result=data.response;
    if(!result||result['@type']!=='type.googleapis.com/google.apps.drive.v3.DownloadFileResponse')throw fail('OPERATION_RESPONSE');
    summary.partialAllowed=result.partialDownloadAllowed===true;
    if(!summary.partialAllowed)throw fail('PARTIAL_UNSUPPORTED');
    if(typeof result.downloadUri!=='string'||result.downloadUri.length>8192)throw fail('URI_INVALID');
    const uri=safeUrl(result.downloadUri,true);
    // Optional explicit IDs in a returned URI may not contradict the request.
    for(const key of ['revisionId','revision'])if(uri.searchParams.has(key)&&uri.searchParams.get(key)!==revision)throw fail('URI_REVISION_MISMATCH');
    for(const key of ['fileId','id'])if(uri.searchParams.has(key)&&uri.searchParams.get(key)!==fileSnapshot.id)throw fail('URI_FILE_MISMATCH');
    downloadUri=uri.href;return true;
  }
  function pause(ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(resolve),ms);const stop=()=>finish(reject,fail('CANCELLED'));function finish(fn,value){clearTimeout(timer);abort.signal.removeEventListener('abort',stop);fn(value);}abort.signal.addEventListener('abort',stop,{once:true});if(abort.signal.aborted)stop();});}
  const execute=async()=>{
    try{
      await metadata({signal:abort.signal});
      revision=pinned.headRevisionId;
      if(typeof revision!=='string'||! /^[A-Za-z0-9_-]{1,512}$/.test(revision)||fileSnapshot.mimeType.startsWith('application/vnd.google-apps.'))throw fail('REVISION_UNAVAILABLE');
      const url=new URL('https://www.googleapis.com/drive/v3/files/'+fileSnapshot.id+'/download');url.searchParams.set('revisionId',revision);
      summary.revisionRequested=true;
      let complete=operation(await request(url.href,{kind:'post',method:'POST'}));
      for(let i=0;!complete&&i<3;i++){
        await pause(10000);check();
        const name=operationName.replace(/^operations\//,'');
        complete=operation(await request('https://www.googleapis.com/drive/v3/operations/'+encodeURIComponent(name),{kind:'operation'}));
      }
      if(!complete)throw fail('OPERATION_PENDING_LIMIT');
      await metadata({signal:abort.signal});
      await request(downloadUri,{kind:'media',start:0});await metadata({signal:abort.signal});
      await request(downloadUri,{kind:'media',start:2});await metadata({signal:abort.signal});check();
      summary.identitySafe=true;summary.pinQualification='revision-request-and-two-bounded-ranges-observed-not-independent-body-revision-proof';summary.complete=true;
    }catch(error){const value=error?.code||error?.message||'';const codes=['URI_INVALID','URI_ORIGIN_UNQUALIFIED','REQUEST_LIMIT','REQUEST_TIMEOUT','RESPONSE_REDIRECT','HTTP_RESPONSE','MEDIA_RANGE','BODY_INVALID','MEDIA_BYTE_LIMIT','PAYLOAD_LIMIT','MEDIA_LENGTH','PAYLOAD_INVALID','CORS_OR_NETWORK','CLEANUP_TIMEOUT','CLEANUP_FAILED','OPERATION_INVALID','OPERATION_NAME','OPERATION_CHANGED','RESOURCE_KEY_CHANGED','OPERATION_ERROR','OPERATION_RESPONSE','PARTIAL_UNSUPPORTED','URI_REVISION_MISMATCH','URI_FILE_MISMATCH','CANCELLED','REVISION_UNAVAILABLE','OPERATION_PENDING_LIMIT','METADATA_REQUEST_LIMIT','METADATA_TIMEOUT','METADATA_RESPONSE','METADATA_BYTE_LIMIT','LIST_IDENTITY_MISMATCH','METADATA_IDENTITY','METADATA_IDENTITY_CHANGED','OWNER_CHANGED','RUN_TIMEOUT'];summary.failure=codes.includes(value)?value:'DIAGNOSTIC_FAILED';}
    finally{
      clearTimeout(timeout);window.removeEventListener('pagehide',cancel);cancel();
      if(work.size)try{await bounded(Promise.allSettled([...work]),3000);}catch{cleanupFailed='CLEANUP_TIMEOUT';}
      if(cleanupFailed){summary.failure=cleanupFailed;summary.complete=false;summary.identitySafe=false;}
      summary.sourceCleanup={settled:!cleanupFailed,scope:'local fetch/body callbacks only'};summary.elapsedMs=Date.now()-started;
      operationName=null;downloadUri=null;resourceKey=null;revision=null;source=null;projection=null;owner=null;fileSnapshot=null;pinned=null;selected=null;swProof=null;
      summary.localReferencesReleased=true;done=true;
    }
  };
  void execute();return Object.freeze({poll:()=>({done,summary:done?JSON.parse(JSON.stringify(summary)):null}),cancel});
}
)