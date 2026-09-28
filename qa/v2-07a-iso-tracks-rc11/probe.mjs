import { runBoundedProbe, createBatchBudget, normalizeProbeIdentity, FAILURE_CODES } from '../v2-07a-bounded-probe/bounded-probe.mjs';
import { scanIsoBmffTopLevel } from '../v2-07a-isobmff-index/isobmff-index.mjs';
import { parseMoov, MAX_MOOV_BYTES } from './parser.mjs';
import { readSparseMoov } from './sparse-moov.mjs';

export const VERSION='1.22.0-rc.11';
export const CAPS=Object.freeze({mediaBytes:MAX_MOOV_BYTES+8192,mediaRequests:64,metadataBytes:32768,runMs:60000});
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(v);
const stop=code=>Object.assign(new Error(code),{code});
const known=new Set([...FAILURE_CODES,'RUNTIME_REJECTED','OWNER_CHANGED','CANCELLED','RUN_TIMEOUT','METADATA_FAILED','METADATA_LIMIT','NOT_ISO','SMALL_FILE_SKIPPED','MOOV_SIZE_LIMIT','MOOV_COUNT','HEADER_SCAN_INCOMPLETE','PARSER_INCOMPLETE']);
const waitSignal=(operation,signal)=>new Promise((resolve,reject)=>{
  const abort=()=>finish(reject,signal.reason??stop('CANCELLED'));
  const finish=(fn,value)=>{signal.removeEventListener('abort',abort);fn(value);};
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  Promise.resolve(operation).then(v=>finish(resolve,v),e=>finish(reject,e));
});

// Single caller-selected actual app file: no enumeration, persistence or mutation.
export function createIsoTracksProbe(runtime, selected) {
  let live=runtime,file=selected,privateSelected=null,promise=null,timer=null,done=false;
  const abort=new AbortController(),budget=createBatchBudget(CAPS.mediaBytes);
  const result={schema:'drive-original.iso-tracks-rc11/1',version:VERSION,scope:'single-file-structural-moov',
    complete:false,failure:null,metadataRequests:0,metadataBytes:0,mediaRequests:0,mediaBytes:0,
    identityPreflight:false,identityPostflight:false,actualIsoMagic:false,headersComplete:false,
    moovBytes:0,sparseMoov:null,tracks:null,fragmentHeaderObserved:false,decoded:false,playback:false,
    freshSWRuntimeVersionVerified:false,released:false,localReferencesReleased:false,
    genericUpstreamCleanup:'unknown',metadataCleanup:'not-started',privateSelectionRetained:false};
  const safe=()=>JSON.parse(JSON.stringify(result));
  let owner=null,controller=null,proof=null,key=null,expected=null,contentIdentity=null;
  let cleanupFailure=null;const metadataWork=new Set();
  const cancel=()=>{if(!abort.signal.aborted)abort.abort(stop('CANCELLED'));};
  function current(){
    if(abort.signal.aborted)throw abort.signal.reason;
    const now=live.readState(),sw=live.getSWIdentity();
    if(now!==owner.state||Object.entries(owner.values).some(([k,v])=>now[k]!==v)
      ||sw?.controller!==controller||sw?.version!==VERSION||live.navigator.serviceWorker.controller!==controller||controller?.state!=='activated'
      ||live.appVersion!==VERSION||live.getMutationsEnabled()!==false||live.getQ1Playback()!==null||live.getPlayerMediaPriorityActive()!==false
      ||live.getQ1RetirementResult()!==owner.retirement||owner.retirement?.settled!==true||live.getMediaSourceGeneration()!==owner.source
      ||now.selected!==null||now.mediaAttempt!=='idle'||now.mediaAbortController!==null||now.pendingOriginalBuffer!==null
      ||now.pendingPlay!==false||now.mediaTransportStarted!==false||!live.hasUsableToken())throw stop('OWNER_CHANGED');
  }
  function metadata(signal){
    const task=readMetadata(signal);metadataWork.add(task);
    task.then(()=>metadataWork.delete(task),()=>metadataWork.delete(task));return task;
  }
  async function readMetadata(signal){
    current();if(result.metadataRequests>=2)throw stop('METADATA_LIMIT');result.metadataRequests++;
    const child=new AbortController(),onAbort=()=>child.abort(signal.reason);signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();
    const timeout=setTimeout(()=>child.abort(stop('METADATA_FAILED')),10000);
    let reader=null,response=null,pending=null,finished=false;
    try{
      const url=new URL(`https://www.googleapis.com/drive/v3/files/${file.id}`);
      url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields','id,version,headRevisionId,sha256Checksum,size,modifiedTime,mimeType,trashed,resourceKey,capabilities(canDownload)');
      const headers={Authorization:`Bearer ${owner.values.token}`};if(key)headers['X-Goog-Drive-Resource-Keys']=`${file.id}/${key}`;
      pending=Promise.resolve(live.nativeFetch(url.href,{method:'GET',headers,credentials:'omit',cache:'no-store',redirect:'error',signal:child.signal,priority:'low'}));
      response=await waitSignal(pending,child.signal);current();
      if(response.status!==200||!response.body)throw stop('METADATA_FAILED');
      reader=response.body.getReader();const chunks=[];let n=0;
      while(true){const item=await waitSignal(reader.read(),child.signal);current();if(item.done){finished=true;break;}if(!(item.value instanceof Uint8Array))throw stop('METADATA_FAILED');n+=item.value.length;result.metadataBytes+=item.value.length;if(n>CAPS.metadataBytes)throw stop('METADATA_LIMIT');chunks.push(item.value);}
      const all=new Uint8Array(n);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
      const observedKey=data.resourceKey??null;
      if(data.id!==file.id||data.trashed!==false||(observedKey!==null&&!validId(observedKey))||(key&&key!==observedKey))throw stop('IDENTITY_MISMATCH');
      if(expected&&observedKey!==key)throw stop('IDENTITY_MISMATCH');key=observedKey;
      const content={headRevisionId:data.headRevisionId??null,sha256Checksum:data.sha256Checksum??null};
      if(contentIdentity&&Object.keys(content).some(k=>content[k]!==contentIdentity[k]))throw stop('IDENTITY_MISMATCH');
      if(!contentIdentity){for(const k of Object.keys(content))if(file[k]!=null&&file[k]!==content[k])throw stop('IDENTITY_MISMATCH');contentIdentity=content;}
      return normalizeProbeIdentity({accountKey:owner.values.authAccountKey,fileId:data.id,version:data.version,size:data.size,modifiedTime:data.modifiedTime,mimeType:data.mimeType,canDownload:data.capabilities?.canDownload});
    } finally {
      clearTimeout(timeout);signal.removeEventListener('abort',onAbort);child.abort(stop('CANCELLED'));
      if(!finished){
        let cleanupTimer;
        // If headers lost the abort race, wait for that fetch and cancel any late
        // response too. A missing local Response is not evidence of cleanup.
        const cleanup=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();
        try{await Promise.race([cleanup,new Promise((_,reject)=>{cleanupTimer=setTimeout(()=>reject(stop('CLEANUP_TIMEOUT')),2000);})]);result.metadataCleanup='cancel-settled';}
        catch(e){cleanupFailure=e?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';result.metadataCleanup=cleanupFailure==='CLEANUP_TIMEOUT'?'timeout':'failed';throw stop(cleanupFailure);}
        finally{clearTimeout(cleanupTimer);}
      }else result.metadataCleanup='body-consumed';
      try{reader?.releaseLock();}catch{}
    }
  }
  async function execute(){
    try{
      if(!live||live.appVersion!==VERSION||!file||!validId(file.id)||(file.resourceKey!=null&&!validId(file.resourceKey)))throw stop('RUNTIME_REJECTED');
      key=file.resourceKey??null;const state=live.readState();controller=live.navigator.serviceWorker.controller;proof=live.getSWIdentity();
      owner={state,values:Object.fromEntries(['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(k=>[k,state[k]])),retirement:live.getQ1RetirementResult(),source:live.getMediaSourceGeneration()};
      current();result.freshSWRuntimeVersionVerified=proof.controller===controller&&proof.version===VERSION;
      timer=setTimeout(()=>abort.abort(stop('RUN_TIMEOUT')),CAPS.runMs);live.addEventListener?.('pagehide',cancel,{once:true});
      expected=await metadata(abort.signal);current();
      for(const k of ['size','modifiedTime','mimeType','version'])if(file[k]!=null&&String(file[k])!==String(expected[k]))throw stop('IDENTITY_MISMATCH');
      if(typeof file.capabilities?.canDownload==='boolean'&&file.capabilities.canDownload!==expected.canDownload)throw stop('IDENTITY_MISMATCH');
      if(BigInt(expected.size)>BigInt(Number.MAX_SAFE_INTEGER))throw stop('INVALID_IDENTITY');
      let initial=true;
      const checked=await runBoundedProbe({expectedIdentity:expected,generation:owner.values.driveSessionGeneration,batchBudget:budget,signal:abort.signal,
        isGenerationCurrent:()=>{try{current();return true;}catch{return false;}},
        limits:{requestBytes:1024*1024,fileBytes:CAPS.mediaBytes,fileRequests:CAPS.mediaRequests,batchBytes:CAPS.mediaBytes,headersMs:10000,bodyNoProgressMs:10000,fileMs:50000},
        getIdentity:async({phase,signal})=>{current();if(phase==='preflight'&&initial){initial=false;return expected;}return metadata(signal);},
        readRange:({range,start,end,signal})=>{
          current();if(start===0&&end===Number(expected.size)-1)throw stop('INVALID_RANGE');
          const url=new URL(`/__drive_media/${file.id}`,live.location.href);url.searchParams.set('accountGeneration',String(owner.values.driveSessionGeneration));url.searchParams.set('mediaSession',String(owner.values.mediaSession));url.searchParams.set('size',expected.size);if(key)url.searchParams.set('resourceKey',key);
          return live.nativeFetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});
        },
        probe:async({read,sniffMagic,signal})=>{
          const size=BigInt(expected.size);if(size<=940n)return {code:'SMALL_FILE_SKIPPED'};
          const prefix=await read({start:0,end:939});current();if(sniffMagic(prefix).kind!=='iso-bmff')return {code:'NOT_ISO'};result.actualIsoMagic=true;
          const readPart=async({start,end})=>{const a=Number(start),b=Number(end);if(b<940)return prefix.slice(a,b+1);if(a<940){const rest=await read({start:940,end:b}),out=new Uint8Array(b-a+1);out.set(prefix.subarray(a));out.set(rest,940-a);return out;}return read({start:a,end:b});};
          const scan=await scanIsoBmffTopLevel({size:expected.size,signal,read:readPart,limits:{maxRequests:56,maxHeaderBytes:4096,maxBoxes:56}});current();
          result.headersComplete=scan.status==='complete';result.fragmentHeaderObserved=scan.observations.moofHeaderObserved;
          if(!result.headersComplete)return {code:'HEADER_SCAN_INCOMPLETE'};
          if(scan.observations.moov.length!==1)return {code:'MOOV_COUNT'};
          const box=scan.observations.moov[0];result.moovBytes=Number(box.size);
          const sparse=await readSparseMoov({box,fileSize:expected.size,read:readPart,signal});current();
          result.sparseMoov={status:sparse.status,code:sparse.code,metrics:sparse.metrics,derivedStructuralMetadata:true,originalSampleTablesRead:false};
          if(sparse.status!=='complete')return {code:sparse.code};
          const parsed=parseMoov(sparse.bytes);sparse.bytes.fill(0);parsed.limitations.push('derived-metadata-tree-original-sample-tables-unread','data-reference-boxes-unparsed');result.tracks=parsed;
          return {code:parsed.status==='parsed'?'STRUCTURAL_METADATA_ONLY':'PARSER_INCOMPLETE'};
        }});
      result.mediaRequests=checked.metrics.requests;result.mediaBytes=checked.metrics.receivedBytes;
      result.identityPreflight=checked.identity.preflight;result.identityPostflight=checked.identity.postflight;
      if(!checked.ok)throw stop(checked.failure.code);
      current();result.failure=checked.evidence.code==='STRUCTURAL_METADATA_ONLY'?null:checked.evidence.code;result.complete=result.failure===null;
      if(result.complete){privateSelected=file;result.privateSelectionRetained=true;}
    }catch(e){result.failure=known.has(e?.code)?e.code:'RUNTIME_REJECTED';}
    finally{
      clearTimeout(timer);live?.removeEventListener?.('pagehide',cancel);cancel();
      // The shared reader may finish its abort race before getIdentity's finally.
      // Let metadata's bounded cleanup settle before publishing done/released.
      if(metadataWork.size){let drainTimer;try{await Promise.race([Promise.allSettled([...metadataWork]),new Promise((_,reject)=>{drainTimer=setTimeout(()=>reject(stop('CLEANUP_TIMEOUT')),3000);})]);}catch{cleanupFailure='CLEANUP_TIMEOUT';result.metadataCleanup='timeout';}finally{clearTimeout(drainTimer);}}
      if(cleanupFailure){result.failure=cleanupFailure;result.complete=false;privateSelected=null;result.privateSelectionRetained=false;}
      result.mediaBytes=budget.receivedBytes;done=true;result.released=true;result.localReferencesReleased=true;live=null;file=null;owner=null;controller=null;proof=null;key=null;expected=null;contentIdentity=null;
    }
    return safe();
  }
  return Object.freeze({run(){return promise??=execute();},cancel(){cancel();return {cancelled:true};},
    poll(){return {done,summary:done?safe():null};},
    selectedFile(){return privateSelected;},release(){privateSelected=null;result.privateSelectionRetained=false;return {released:true};}});
}
