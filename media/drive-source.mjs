// Browser-owned Drive bytes, not an immutable server snapshot. Each bounded
// read is withheld until fresh metadata before/after it matches one initial
// content revision. A checksum is metadata evidence, NOT a hash of this range.
// Authentication, URLs and exact app/account/session ownership stay in callers.
// readMetadata({signal,phase}) returns Drive JSON; readRange({start,end,range,
// signal}) returns a same-origin SW Response. abort() returns one shared cleanup
// Promise: {settled,pendingCallbacks,cleanupPending,cleanupFailed}. Its separate
// cleanup wall is min(requestTimeoutMs,2000); a false result MUST block starting
// another transport owner. A failed open carries the same result in error.cleanup.
// An injected callback that ignores cancellation cannot be forcibly terminated.
const MAX_READ=1024*1024,MAX_TIMEOUT=70000;
class SourceError extends Error {}
const requireThat=(value,code)=>{if(!value)throw new SourceError(`Q1_SOURCE_${code}`);};
const safe=value=>Number.isSafeInteger(value)&&value>=0;
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const signalLike=value=>value==null||(typeof value.aborted==='boolean'
  &&typeof value.addEventListener==='function'&&typeof value.removeEventListener==='function');

export async function openDriveQ1Source(options={}) {
  try{return await open(options);}
  catch(error){const result=new Error(error instanceof SourceError?error.message:'Q1_SOURCE_OPTIONS');
    if(error instanceof SourceError&&error.cleanup)result.cleanup=error.cleanup;throw result;}
}

async function open({fileId,accountKey,accountGeneration,readMetadata,readRange,isCurrent,signal,requestTimeoutMs=MAX_TIMEOUT}={}) {
  requireThat(text(fileId,512)&&/^[A-Za-z0-9_-]+$/.test(fileId)&&text(accountKey,512)
    &&safe(accountGeneration)&&typeof readMetadata==='function'&&typeof readRange==='function'
    &&typeof isCurrent==='function'&&signalLike(signal)&&Number.isSafeInteger(requestTimeoutMs)
    &&requestTimeoutMs>0&&requestTimeoutMs<=MAX_TIMEOUT,'OPTIONS');
  let state='opening',failure=null,busy=false,checking=false,epoch=null,identity=null,checksum=null,held=null;
  let cleanupPending=0,cleanupFailed=false,pendingCallbacks=0,peakRetainedBytes=0,cleanupPromise=null,wakeCleanup=null;
  const counts={readsStarted:0,readsCompleted:0,metadataRequests:0,rangeRequests:0,receivedBytes:0,releasedBytes:0};
  const active=()=>state==='opening'||state==='open';
  function cancel(target,release=false){
    if(!target)return;cleanupPending++;
    let promise;
    try{promise=target.cancel();}catch{cleanupFailed=true;promise=undefined;}
    Promise.resolve(promise).catch(()=>{cleanupFailed=true;}).finally(()=>{
      if(release)try{target.releaseLock();}catch{cleanupFailed=true;}
      cleanupPending--;wakeCleanup?.();
    });
  }
  function cleanupBody(owner){
    if(owner.reader){const reader=owner.reader;owner.reader=null;owner.response=null;cancel(reader,true);}
    else if(owner.response){const response=owner.response;owner.response=null;cancel(response.body);}
  }
  function terminate(code,aborted=false){
    if(!active())return;
    state=aborted?'aborted':'failed';failure=`Q1_SOURCE_${code}`;held=null;
    // Start cancellation while the fetch body is still readable. Aborting first
    // errors it synchronously, making a subsequent cancel reject AbortError even
    // though transport teardown succeeded. Genuine cancel failures remain errors.
    if(epoch){cleanupBody(epoch);epoch.controller.abort();epoch.reject(new SourceError(failure));}
    signal?.removeEventListener('abort',externalAbort);
  }
  function externalAbort(){terminate('ABORTED',true);}
  const cleanupSnapshot=()=>Object.freeze({settled:pendingCallbacks===0&&cleanupPending===0&&!cleanupFailed,
    pendingCallbacks,cleanupPending,cleanupFailed});
  function settleCleanup(){
    if(cleanupPromise)return cleanupPromise;
    cleanupPromise=new Promise(resolve=>{
      let timer=null,done=false;
      const finish=()=>{if(done)return;done=true;clearTimeout(timer);wakeCleanup=null;resolve(cleanupSnapshot());};
      wakeCleanup=()=>{if(pendingCallbacks===0&&cleanupPending===0)finish();};
      timer=setTimeout(finish,Math.min(requestTimeoutMs,2000));wakeCleanup();
    });
    return cleanupPromise;
  }
  function check(){
    requireThat(active(),'CLOSED');
    let current;checking=true;
    try{current=isCurrent();
      if(current&&typeof current.then==='function'){Promise.resolve(current).catch(()=>{});throw new Error();}
    }catch{throw new SourceError('Q1_SOURCE_OWNER_CHECK');}finally{checking=false;}
    requireThat(active(),'CLOSED');requireThat(current===true,'STALE');
    requireThat(!signal?.aborted,'ABORTED');
  }
  function metadata(value){
    requireThat(value&&typeof value==='object'&&!Array.isArray(value),'METADATA');
    requireThat(value.id===fileId&&text(value.headRevisionId,512)&&/^[A-Za-z0-9_-]+$/.test(value.headRevisionId)
      &&typeof value.size==='string'&&/^[1-9]\d*$/.test(value.size)&&value.size.length<=16
      &&Number.isSafeInteger(Number(value.size))&&Number(value.size)>0
      &&text(value.mimeType,256)&&text(value.modifiedTime,128),'METADATA');
    requireThat(value.capabilities?.canDownload===true&&value.trashed===false,'PERMISSION');
    const hash=value.sha256Checksum??null;
    requireThat(hash===null||(typeof hash==='string'&&/^[a-fA-F0-9]{64}$/.test(hash)),'METADATA');
    const version=value.version??null;
    requireThat(version===null||(typeof version==='string'&&/^\d+$/.test(version)&&version.length<=32),'METADATA');
    return {accountKey,accountGeneration,fileId,headRevisionId:value.headRevisionId,size:value.size,
      mimeType:value.mimeType,modifiedTime:value.modifiedTime,canDownload:true,trashed:false,
      sha256Checksum:hash?.toLowerCase()??null,version};
  }
  function reconcile(value){
    const observed=metadata(value);
    if(identity)for(const key of ['headRevisionId','size','mimeType','modifiedTime'])
      requireThat(observed[key]===identity[key],'CONTENT_DRIFT');
    if(checksum!==null)requireThat(observed.sha256Checksum===checksum,'CONTENT_DRIFT');
    else if(observed.sha256Checksum!==null)checksum=observed.sha256Checksum;
    return observed;
  }
  async function wait(owner,operation,lateCleanup=null,accept=null){
    check();let cleanupCalled=false,settled=false,handled=false,counted=true,abandoned=false,fulfilled=false,resolvedValue;
    const clean=value=>{if(lateCleanup&&!cleanupCalled){cleanupCalled=true;try{lateCleanup(value);}catch{cleanupFailed=true;}}};
    const release=()=>{if(settled&&handled&&counted){counted=false;resolvedValue=undefined;pendingCallbacks--;wakeCleanup?.();}};
    pendingCallbacks++;
    const pending=Promise.resolve().then(()=>{check();return operation();});
    pending.then(value=>{settled=true;fulfilled=true;resolvedValue=value;if(owner.closed||abandoned)clean(value);release();},
      ()=>{settled=true;release();});
    try{const value=await Promise.race([pending,owner.interrupted]);
      try{check();}catch(error){clean(value);throw error;}accept?.(value);return value;
    }catch(error){abandoned=true;if(fulfilled)clean(resolvedValue);throw error;}
    finally{handled=true;release();}
  }
  async function readMeta(owner,phase){
    counts.metadataRequests++;
    const value=await wait(owner,()=>readMetadata({signal:owner.controller.signal,phase}));
    check();return reconcile(value);
  }
  async function own(operation,readSignal=null){
    requireThat(active(),'CLOSED');
    if(busy||checking){terminate('CONCURRENT');throw new SourceError('Q1_SOURCE_CONCURRENT');}
    busy=true;
    const owner={controller:new AbortController(),reader:null,response:null,closed:false};
    owner.interrupted=new Promise((_,reject)=>{owner.reject=reject;});owner.interrupted.catch(()=>{});epoch=owner;
    const cancelRead=()=>terminate('ABORTED',true);
    let timer,linked=false;
    try{
      requireThat(signalLike(readSignal),'OPTIONS');
      readSignal?.addEventListener('abort',cancelRead,{once:true});linked=Boolean(readSignal);
      if(readSignal?.aborted||signal?.aborted)terminate('ABORTED',true);
      timer=setTimeout(()=>terminate('TIMEOUT'),requestTimeoutMs);
      check();const result=await operation(owner);check();return result;
    }catch(error){
      const code=error instanceof SourceError?error.message:'Q1_SOURCE_READ_FAILED';
      if(active())terminate(code.slice('Q1_SOURCE_'.length));
      throw new SourceError(failure||code);
    }finally{
      owner.closed=true;clearTimeout(timer);if(linked)readSignal.removeEventListener('abort',cancelRead);
      cleanupBody(owner);held=null;if(epoch===owner)epoch=null;busy=false;
    }
  }
  const stats=()=>({state,failure,busy,...counts,retainedBytes:held?.byteLength||0,peakRetainedBytes,
    checksumBound:checksum!==null,pendingCallbacks,cleanupPending,cleanupFailed,cleanupSettled:cleanupSnapshot().settled,
    maxReadBytes:MAX_READ,requestTimeoutMs,
    scope:'optimistic observed-content pre/post fence, not immutable revision or range hash verification; owned byte arrays only, excludes callback/browser/output/JS heap'});
  signal?.addEventListener('abort',externalAbort,{once:true});
  try{identity=Object.freeze(await own(owner=>readMeta(owner,'open')));check();state='open';}
  catch(error){if(active())terminate(error instanceof SourceError?error.message.slice('Q1_SOURCE_'.length):'READ_FAILED');
    const result=new SourceError(failure||'Q1_SOURCE_READ_FAILED');result.cleanup=await settleCleanup();throw result;}
  return Object.freeze({identity,
    async read(request={}){
      try{const bytes=await own(async owner=>{
        const {start,end}=request;
        requireThat(safe(start)&&safe(end)&&end>=start&&end<Number(identity.size)
          &&safe(end-start+1)&&end-start+1<=MAX_READ,'RANGE');
        counts.readsStarted++;
        await readMeta(owner,'preflight');check();
        counts.rangeRequests++;
        const response=await wait(owner,()=>readRange({start,end,range:`bytes=${start}-${end}`,signal:owner.controller.signal}),
          value=>cancel(value?.body),value=>{owner.response=value;});
        check();
        requireThat(response?.status===206&&typeof response.headers?.get==='function','HEADERS');
        const header=name=>response.headers.get(name),length=end-start+1;
        requireThat(header('Content-Range')===`bytes ${start}-${end}/${identity.size}`
          &&header('Content-Length')===String(length)&&!header('Content-Encoding'),'HEADERS');
        requireThat(typeof response.body?.getReader==='function','BODY');
        owner.reader=response.body.getReader();owner.response=null;
        held=new Uint8Array(length);peakRetainedBytes=Math.max(peakRetainedBytes,length);let received=0;
        for(;;){
          const part=await wait(owner,()=>owner.reader.read());check();
          requireThat(part&&typeof part.done==='boolean','BODY');if(part.done)break;
          requireThat(part.value instanceof Uint8Array&&part.value.length>0&&received+part.value.length<=length,'BODY_LENGTH');
          held.set(part.value,received);received+=part.value.length;
          requireThat(safe(counts.receivedBytes+part.value.length),'METRICS_LIMIT');counts.receivedBytes+=part.value.length;
        }
        requireThat(received===length,'BODY_LENGTH');
        owner.reader.releaseLock();owner.reader=null;
        await readMeta(owner,'postflight');check();
        const bytes=held;held=null;return bytes;
      },request?.signal);
      check();requireThat(safe(counts.releasedBytes+bytes.length),'METRICS_LIMIT');
      counts.readsCompleted++;counts.releasedBytes+=bytes.length;return bytes;}
      catch(error){const code=error instanceof SourceError?error.message:'Q1_SOURCE_READ_FAILED';
        if(active())terminate(code.slice('Q1_SOURCE_'.length));throw new Error(failure||code);}
    },
    abort(){externalAbort();return settleCleanup();},stats,
  });
}
