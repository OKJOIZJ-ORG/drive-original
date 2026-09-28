(function (swProof) {
  'use strict';
  const rejected=()=>Object.freeze({poll:()=>({done:true,summary:{failure:'FACADE_PREFLIGHT_REJECTED'}}),cancel:()=>({cancelled:true}),selectedFile:()=>null,release:()=>({released:true})});
  let projection,owner;
  try {
    projection=JSON.parse(JSON.stringify(state.accountMediaState));
    owner={caps:state.authCapabilities,account:state.accountId,key:state.authAccountKey,auth:state.authGeneration,drive:state.driveSessionGeneration,
      tokenRevision:state.tokenRevision,token:state.token,expiry:state.expiresAt,abort:state.accountStateAbortController,
      controller:navigator.serviceWorker.controller,writer:state.accountStateWriterId,revision:state.accountStateRevision,
      session:state.mediaSession,playback:state.playbackSession,source:mediaSourceGeneration,retirement:q1RetirementResult};
  }catch{return rejected();}
  const current=()=>Boolean(owner)&&APP_VERSION==='1.22.0-rc.13'&&DRIVE_MUTATIONS_ENABLED===false
    &&ACCOUNT_STATE_WRITES_ENABLED===true&&top===self&&navigator.onLine===true&&document.visibilityState==='visible'
    &&location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    &&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.authGeneration===owner.auth
    &&state.driveSessionGeneration===owner.drive&&state.tokenRevision===owner.tokenRevision&&state.token===owner.token&&state.expiresAt===owner.expiry
    &&state.authCapabilities===owner.caps&&owner.caps?.version===1&&owner.caps.driveRead===true&&owner.caps.driveWrite===true&&owner.caps.appData===true
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
  const abort=new AbortController(),started=Date.now();let done=false,cleanupFailed=false,released=false;
  let id=null,nonce=crypto.randomUUID(),name='Drive-Original-QA-revision-'+nonce,resourceKey=null,headA=null,uri=null,opName=null,verified=false;
  const A=new TextEncoder().encode('0123456789ABCDEF'),B=new TextEncoder().encode('fedcba9876543210');
  let hashA=null,hashB=null,operationDeadline=null;
  const summary={schema:'drive-original.disposable-revision-pin/1',complete:false,failure:null,cleanupFailure:null,writeRequests:0,operationRequests:0,downloadPosts:0,jsonBytes:0,mediaBytes:0,requests:0,results:[],createdVerified:false,revisionChanged:false,beforeA:false,oldUriStillA:false,latestB:false,restoredVerified:false,trashVerified:false,localCleanupSettled:false,genericUpstreamCleanup:'unknown',localReferencesReleased:false,recoveryRequired:false};
  const fail=code=>Object.assign(new Error(code),{safeCode:code});
  const check=()=>{if(abort.signal.aborted)throw fail('CANCELLED_OR_DEADLINE');if(!current())throw fail('OWNER_CHANGED');if(cleanupFailed)throw fail('CLEANUP_UNSETTLED');};
  const cancel=()=>{abort.abort();return {cancelled:true};};
  const timer=setTimeout(cancel,90000);window.addEventListener('pagehide',cancel,{once:true});
  const bounded=(p,ms)=>{let t;return Promise.race([p,new Promise((_,reject)=>{t=setTimeout(()=>reject(fail('CLEANUP_TIMEOUT')),ms);})]).finally(()=>clearTimeout(t));};
  const race=(p,signal)=>new Promise((resolve,reject)=>{const stop=()=>finish(reject,fail('REQUEST_ABORTED'));function finish(fn,x){signal.removeEventListener('abort',stop);fn(x);}signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();Promise.resolve(p).then(x=>finish(resolve,x),e=>finish(reject,e));});
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  async function request(url,{method='GET',body,contentType,media=false,write=false,stage}={}){
    check();const parsed=new URL(url);if(parsed.origin!=='https://www.googleapis.com'||parsed.username||parsed.password||parsed.hash)throw fail('ORIGIN_REJECTED');
    if(++summary.requests>24)throw fail('REQUEST_LIMIT');if(write&&++summary.writeRequests>4)throw fail('WRITE_LIMIT');
    const child=new AbortController(),stop=()=>child.abort();abort.signal.addEventListener('abort',stop,{once:true});const operationRequest=stage==='revision-download'||stage==='operation-poll';const timeout=setTimeout(stop,operationRequest?Math.max(1,Math.min(10000,operationDeadline-Date.now())):10000);
    let pending=null,response=null,reader=null,eof=false;
    try{
      const headers={Authorization:'Bearer '+owner.token};if(contentType)headers['Content-Type']=contentType;if(media)headers.Range='bytes=0-15';if(resourceKey)headers['X-Goog-Drive-Resource-Keys']=id+'/'+resourceKey;
      pending=Promise.resolve(fetch(url,{method,body,headers,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:child.signal}));response=await race(pending,child.signal);check();
      summary.results.push({stage,status:response.status});
      if(response.redirected||(response.url&&response.url!==url))throw fail('REDIRECT_REJECTED');
      if(response.status!==(media?206:200)||!response.body)throw fail('HTTP_RESPONSE');
      if(media){const cr=response.headers.get('Content-Range'),cl=response.headers.get('Content-Length');if((cr!==null&&cr!=='bytes 0-15/16')||(cr===null&&cl!=='16')||(cl!==null&&cl!=='16')||response.headers.get('Content-Encoding'))throw fail('RANGE_INVALID');}
      reader=response.body.getReader();const chunks=[];let length=0;
      for(;;){const part=await race(reader.read(),child.signal);check();if(part.done){eof=true;break;}if(!(part.value instanceof Uint8Array))throw fail('BODY_INVALID');length+=part.value.length;
        if(media){summary.mediaBytes+=part.value.length;if(length>16||summary.mediaBytes>96)throw fail('MEDIA_LIMIT');}else{summary.jsonBytes+=part.value.length;if(summary.jsonBytes>32768)throw fail('JSON_LIMIT');}chunks.push(part.value);}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      if(media){if(length!==16)throw fail('MEDIA_LENGTH');return bytes;}
      try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw fail('JSON_INVALID');}finally{bytes.fill(0);}
    }catch(e){if(e?.safeCode)throw e;if(e?.name==='TypeError')throw fail('CORS_OR_NETWORK');throw fail('REQUEST_FAILED');}
    finally{
      clearTimeout(timeout);abort.signal.removeEventListener('abort',stop);
      if(!eof){const cleanup=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();child.abort();try{await bounded(cleanup,2000);}catch{cleanupFailed=true;throw fail('CLEANUP_UNSETTLED');}}else child.abort();
      try{reader?.releaseLock();}catch{cleanupFailed=true;throw fail('CLEANUP_UNSETTLED');}
    }
  }
  const fileUrl=()=>{if(!id)throw fail('TARGET_UNAVAILABLE');return 'https://www.googleapis.com/drive/v3/files/'+id;};
  async function metadata(trashed=false){
    const url=new URL(fileUrl());url.searchParams.set('fields','id,name,size,mimeType,trashed,appProperties,headRevisionId,sha256Checksum,resourceKey,capabilities(canDownload)');
    const m=await request(url.href,{stage:'fixture-metadata'});
    if(m.id!==id||m.name!==name||m.appProperties?.driveOriginalQaRevision!==nonce||m.size!=='16'||m.mimeType!=='application/octet-stream'||m.trashed!==trashed||(!trashed&&m.capabilities?.canDownload!==true))throw fail('FIXTURE_IDENTITY');
    if(typeof m.headRevisionId!=='string'||! /^[A-Za-z0-9_-]{1,512}$/.test(m.headRevisionId)||typeof m.sha256Checksum!=='string'||! /^[a-fA-F0-9]{64}$/.test(m.sha256Checksum))throw fail('REVISION_IDENTITY');
    if(m.resourceKey!=null&&(typeof m.resourceKey!=='string'||! /^[A-Za-z0-9_-]{1,512}$/.test(m.resourceKey)))throw fail('RESOURCE_KEY_INVALID');
    if(resourceKey!==null&&(m.resourceKey??null)!==resourceKey)throw fail('RESOURCE_KEY_CHANGED');resourceKey=m.resourceKey??null;verified=true;return m;
  }
  async function upload(bytes,stage){if(!verified)throw fail('TARGET_UNVERIFIED');await metadata();check();return request('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=media&fields=id',{method:'PATCH',body:bytes,contentType:'application/octet-stream',write:true,stage});}
  const latest=()=>fileUrl()+'?alt=media';
  async function expectBytes(url,expected,stage){const bytes=await request(url,{media:true,stage});const equal=bytes.every((b,i)=>b===expected[i]);bytes.fill(0);if(!equal)throw fail(stage==='old-uri-after-B'?'OLD_URI_CHANGED':stage==='latest-after-B'?'LATEST_NOT_B':'CONTENT_MISMATCH');return true;}
  function operation(data){
    if(!data||typeof data!=='object'||Array.isArray(data)||data.error)throw fail('OPERATION_ERROR');
    if(data.done!=null&&typeof data.done!=='boolean')throw fail('OPERATION_INVALID');
    if(data.metadata?.resourceKey!=null&&data.metadata.resourceKey!==resourceKey)throw fail('RESOURCE_KEY_CHANGED');
    if(data.name!=null){if(typeof data.name!=='string'||! /^(?:operations\/)?[A-Za-z0-9_-]{1,1024}$/.test(data.name)||(opName!==null&&opName!==data.name))throw fail('OPERATION_NAME');opName=data.name;}
    if(data.done!==true){if(data.response||!opName)throw fail('OPERATION_INVALID');return false;}
    const r=data.response;if(r?.['@type']!=='type.googleapis.com/google.apps.drive.v3.DownloadFileResponse'||r.partialDownloadAllowed!==true||typeof r.downloadUri!=='string'||r.downloadUri.length>8192)throw fail('PARTIAL_UNSUPPORTED');
    const u=new URL(r.downloadUri);if(u.origin!=='https://www.googleapis.com'||u.username||u.password||u.hash)throw fail('URI_ORIGIN');
    const fixedKeys=['alt','revisionId','revision','fileId','id','acknowledgeAbuse','access_token','resourceKey'];
    const ids=['id','fileId'].filter(k=>u.searchParams.has(k));const revisions=['revisionId','revision'].filter(k=>u.searchParams.has(k));
    const sameFilePath=u.pathname==='/drive/v3/files/'+id||u.pathname.startsWith('/drive/v3/files/'+id+'/');
    summary.uriProfile={sameFilePath,revisionEmbeddedMatched:revisions.length?revisions.every(k=>u.searchParams.get(k)===headA):null,queryKeys:fixedKeys.filter(k=>u.searchParams.has(k)),otherQueryKeysPresent:[...u.searchParams.keys()].some(k=>!fixedKeys.includes(k))};
    if(ids.some(k=>u.searchParams.get(k)!==id)||revisions.some(k=>u.searchParams.get(k)!==headA))throw fail('URI_IDENTITY');uri=u.href;return true;
  }
  const pause=ms=>new Promise((resolve,reject)=>{const t=setTimeout(()=>finish(resolve),ms),stop=()=>finish(reject,fail('CANCELLED_OR_DEADLINE'));function finish(fn,x){clearTimeout(t);abort.signal.removeEventListener('abort',stop);fn(x);}abort.signal.addEventListener('abort',stop,{once:true});if(abort.signal.aborted)stop();});
  function release(){if(!done)return {released:false};id=null;nonce=null;name=null;resourceKey=null;headA=null;uri=null;opName=null;hashA=null;hashB=null;owner=null;projection=null;swProof=null;A.fill(0);B.fill(0);released=true;summary.localReferencesReleased=true;return {released:true};}
  async function execute(){
    try{
      hashA=await hash(A);hashB=await hash(B);check();
      const boundary='qa_'+nonce,meta=JSON.stringify({name,mimeType:'application/octet-stream',parents:['root'],appProperties:{driveOriginalQaRevision:nonce}});
      const uploadBody=new TextEncoder().encode('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+meta+'\r\n--'+boundary+'\r\nContent-Type: application/octet-stream\r\n\r\n0123456789ABCDEF\r\n--'+boundary+'--\r\n');
      const made=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',body:uploadBody,contentType:'multipart/related; boundary='+boundary,write:true,stage:'create-A'});
      if(typeof made.id!=='string'||! /^[A-Za-z0-9_-]{1,512}$/.test(made.id)||state.files?.some(f=>f.id===made.id))throw fail('CREATE_ID_INVALID');id=made.id;
      const first=await metadata();if(first.sha256Checksum.toLowerCase()!==hashA)throw fail('INITIAL_HASH');summary.createdVerified=true;headA=first.headRevisionId;
      const operationStart=Date.now();operationDeadline=operationStart+40000;summary.downloadPosts++;let finished=operation(await request(fileUrl()+'/download?revisionId='+encodeURIComponent(headA),{method:'POST',stage:'revision-download'}));
      for(let i=0;!finished&&i<3;i++){await pause(10000);if(Date.now()-operationStart>=40000)throw fail('OPERATION_DEADLINE');summary.operationRequests++;finished=operation(await request('https://www.googleapis.com/drive/v3/operations/'+encodeURIComponent(opName.replace(/^operations\//,'')),{stage:'operation-poll'}));}
      if(!finished||Date.now()-operationStart>40000)throw fail('OPERATION_DEADLINE');
      summary.beforeA=await expectBytes(uri,A,'old-uri-before-B');
      const before=await metadata();if(before.headRevisionId!==headA||before.sha256Checksum.toLowerCase()!==hashA)throw fail('PREMUTATION_DRIFT');
      await upload(B,'update-B');const changed=await metadata();if(changed.headRevisionId===headA||changed.sha256Checksum.toLowerCase()!==hashB)throw fail('REVISION_NOT_CHANGED');summary.revisionChanged=true;
      summary.oldUriStillA=await expectBytes(uri,A,'old-uri-after-B');summary.latestB=await expectBytes(latest(),B,'latest-after-B');
      summary.complete=true;
    }catch(e){summary.failure=e?.safeCode||'DIAGNOSTIC_FAILED';}
    finally{
      if(id&&verified){try{
        check();await upload(A,'restore-A');const restored=await metadata();if(restored.sha256Checksum.toLowerCase()!==hashA)throw fail('RESTORE_HASH');await expectBytes(latest(),A,'restore-readback');summary.restoredVerified=true;
        await metadata();check();await request(fileUrl()+'?fields=id',{method:'PATCH',body:JSON.stringify({trashed:true}),contentType:'application/json',write:true,stage:'trash'});await metadata(true);summary.trashVerified=true;
      }catch(e){summary.cleanupFailure=e?.safeCode||'CLEANUP_FAILED';}}
      clearTimeout(timer);window.removeEventListener('pagehide',cancel);cancel();summary.localCleanupSettled=!cleanupFailed;summary.recoveryRequired=summary.writeRequests>0&&!summary.trashVerified;
      if(summary.recoveryRequired||cleanupFailed)summary.complete=false;
      summary.elapsedMs=Date.now()-started;done=true;if(summary.trashVerified)release();
    }
  }
  void execute();return Object.freeze({poll:()=>({done,summary:done?JSON.parse(JSON.stringify(summary)):null}),cancel,
    recovery:()=>done&&!released?{id,nonce,name,verified,createdKnown:id!==null}:null,release});
}
)