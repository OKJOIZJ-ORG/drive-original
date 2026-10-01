import {runAuthenticatedRootInventory} from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import {summarizeRepeatedInventory} from '../v2-07a-root-inventory/root-inventory.mjs';
import {selectRiskRepresentatives} from '../v2-07a-representative-selection/representative-selector.mjs';
import {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES} from '../v2-07a-bounded-probe/bounded-probe.mjs';
import {summarizeInventoryDenominators} from '../rc21-corpus-night/inventory-denominators.mjs';
import {collectHeaderCandidates,planHeaderCohort} from './selection.mjs';
import {readHeaderState,createHeaderContinuity,identitySame,contentSame,evidenceEpoch,CONTINUITY_LIMIT,RETRYABLE} from './continuity.mjs';
export const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
export const CAPS=Object.freeze({files:64,batchFiles:8,mediaRequests:64,mediaBytes:2*1024*1024+8192,fileMs:50000,runMs:600000,metadataRequests:512,metadataResponseBytes:2*1024*1024,metadataBytes:64*1024*1024});
const fail=code=>Object.assign(new Error(code),{code});
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(x);
const fixed=e=>[...FAILURE_CODES,'RUNTIME_REJECTED','OWNER_CHANGED','CANCELLED','METADATA_LIMIT','METADATA_FAILED','INVENTORY_FAILED','SELECTION_FAILED','CATALOG_DRIFT','RUN_TIMEOUT','CLEANUP_FAILED','CLEANUP_TIMEOUT','CONTINUITY_REJECTED','CONTINUITY_LIMIT','SOURCE_BINDING_REJECTED'].includes(e?.code)?e.code:'PROBE_FAILED';
const same=identitySame;
const fieldNames='id,version,headRevisionId,sha256Checksum,size,modifiedTime,mimeType,trashed,resourceKey,capabilities(canDownload)';
export function bindingPinned(x){return x?.schema==='drive-original.corpus-header-source-binding/1'&&/^1\.22\.0-rc\.\d+$/.test(x.version??'')&&/^[a-f0-9]{40}$/.test(x.sourceCommit??'')&&['app.js','sw.js','version.json'].every(k=>/^[a-f0-9]{64}$/.test(x.sourceSHA256?.[k]??''));}
const immutableContent=x=>(validId(x?.headRevisionId)||/^[a-fA-F0-9]{64}$/.test(x?.sha256Checksum??''))&&(x?.headRevisionId===null||validId(x?.headRevisionId))&&(x?.sha256Checksum===null||/^[a-fA-F0-9]{64}$/.test(x?.sha256Checksum??''));
export function createHeaderCohort(runtime,dependencies={}){
  const binding=dependencies.binding,VERSION=binding?.version;const options=Object.freeze({...runtime?.options});let priorCapsule=runtime?.priorCapsule??null,priorRecords=null;
  const inventory=dependencies.inventoryRunner??runAuthenticatedRootInventory,select=dependencies.selector??selectRiskRepresentatives,compare=dependencies.compareInventory??summarizeRepeatedInventory;
  let live=runtime,context=runtime?.privateContext?{...runtime.privateContext}:null,prior=null,owner=null,promise=null,started=false,done=false,timer=null,activeFile=null;
  runtime=null;let candidates=null,cohort=null,accepted=[],history=new Map(),attempts=new Map(),epoch=null,capsule=null,runStarted=0,reserve=null;const failedIds=new Set(),now=dependencies.now??(()=>performance.now());
  const abort=new AbortController(),tasks=new Set();let cleanupFailure=null;
  const result={schema:'drive-original.bounded-corpus-header-summary/1',version:VERSION,scope:'bounded-prefix-only-current-canonical-corpus',mode:'headers',completeMeaning:'cohort-finished-with-reconciled-dispositions-only',wholeCorpusComplete:false,inventoryDenominators:[],batches:[],coverage:null,reserve:null,complete:false,phase:'not-started',failure:null,
    inventoryRuns:0,catalogStable:false,catalogComparison:null,metadataRequests:0,metadataBytes:0,mediaRequests:0,mediaBytes:0,plan:null,files:[],decoded:0,playback:0,physicalDevice:0,writeRequests:0,genericUpstreamCleanup:'unknown',released:false,metadataDiagnostic:{completed:0,failed:0,maxResponseBytes:0,routeCounts:{about:0,list:0,file:0},lastFailure:null,lastCleanupFailure:null}};
  const safe=()=>JSON.parse(JSON.stringify(result));
  const stop=code=>{if(!abort.signal.aborted)abort.abort(fail(code));};
  const onHide=()=>stop('CANCELLED');
  const onAccountAbort=()=>stop('OWNER_CHANGED');
  const inspect=()=>{const s=live?.readState?.(),sw=live?.getSWIdentity?.(),controller=live?.navigator?.serviceWorker?.controller;
    if(!s||live.appVersion!==VERSION||live.getMutationsEnabled()!==false||live.top!==live.self||live.location?.origin!==ORIGIN||live.navigator?.onLine!==true
      ||live.document?.visibilityState!=='visible'||sw?.controller!==controller||sw?.version!==VERSION||!bindingPinned(binding)||sw?.sourceCommit!==binding.sourceCommit||['app.js','sw.js','version.json'].some(k=>sw?.sourceSHA256?.[k]!==binding.sourceSHA256[k])||controller?.state!=='activated'||new URL(controller.scriptURL).origin!==ORIGIN||new URL(controller.scriptURL).pathname!=='/sw.js'
      ||!validId(s.accountId)||!s.authAccountKey||s.authStatus!=='online'||s.demo!==false||s.accountIdentityPending||!live.hasUsableToken()||!s.token
      ||!s.accountStateAbortController?.signal||s.accountStateAbortController.signal.aborted||live.getQ1RetirementResult()?.settled!==true||live.getQ1Playback()!==null||live.getPlayerMediaPriorityActive()!==false
      ||s.selected!==null||s.mediaAttempt!=='idle'||s.mediaAbortController!==null||s.pendingOriginalBuffer!==null||s.pendingPlay!==false||s.mediaTransportStarted!==false
      ||['driveSessionGeneration','authGeneration','tokenRevision','mediaSession'].some(k=>!Number.isSafeInteger(s[k])||s[k]<0)||!Number.isSafeInteger(live.getMediaSourceGeneration())
      ||new URL(controller.scriptURL).search||new URL(controller.scriptURL).hash)throw fail('RUNTIME_REJECTED');
    return {state:s,controller,retirement:live.getQ1RetirementResult(),source:live.getMediaSourceGeneration(),href:live.location.href};};
  function current(){if(abort.signal.aborted)throw abort.signal.reason;let now;try{now=inspect();}catch{throw fail('OWNER_CHANGED');}
    if(!owner||now.state!==owner.state||now.controller!==owner.controller||now.retirement!==owner.retirement||now.source!==owner.source||now.href!==owner.href
      ||Object.entries(owner.values).some(([k,v])=>now.state[k]!==v))throw fail('OWNER_CHANGED');return now.state;}
  const race=(value,signal)=>new Promise((resolve,reject)=>{let settled=false;const finish=(fn,v)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);fn(v);},cancel=()=>finish(reject,signal.reason??fail('CANCELLED'));
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();Promise.resolve(value).then(v=>finish(resolve,v),e=>finish(reject,e));});
  async function drain(value){let t;try{await Promise.race([Promise.resolve(value),new Promise((_,reject)=>{t=setTimeout(()=>reject(fail('CLEANUP_TIMEOUT')),2000);})]);}catch(e){cleanupFailure=e?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED';throw fail(cleanupFailure);}finally{clearTimeout(t);}}
  function metadataFetch(urlValue,options={}){
    const task=metadata(urlValue,options).catch(e=>{if(['METADATA_LIMIT','CLEANUP_FAILED','CLEANUP_TIMEOUT'].includes(e?.code))stop(e.code);throw e;});tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));return task;
  }
  async function metadata(urlValue,options={}){
    current();const url=new URL(urlValue),headers=new Headers(options.headers??{});
    if(url.origin!=='https://www.googleapis.com'||!/^\/drive\/v3\/(about|files(?:\/[A-Za-z0-9_-]+)?)$/.test(url.pathname)||url.searchParams.has('alt')||(options.method&&options.method!=='GET')||options.body!==undefined||[...headers.keys()].some(x=>x!=='x-goog-drive-resource-keys'))throw fail('METADATA_FAILED');
    if(result.metadataRequests>=CAPS.metadataRequests)throw fail('METADATA_LIMIT');result.metadataRequests++;headers.set('Authorization',`Bearer ${owner.values.token}`);
    const responseLimit=Math.min(CAPS.metadataResponseBytes,options.responseLimitBytes??CAPS.metadataResponseBytes),requestMs=Math.min(25000,options.requestMs??25000);
    if(!Number.isSafeInteger(responseLimit)||responseLimit<1||!Number.isSafeInteger(requestMs)||requestMs<1)throw fail('METADATA_LIMIT');
    let abortSource=null,stage='dispatch',status=null;const diag={ordinal:result.metadataRequests,phase:result.phase,route:url.pathname.endsWith('/about')?'about':url.pathname.endsWith('/files')?'list':'file',responseLimitBytes:responseLimit,requestMs};result.metadataDiagnostic.routeCounts[diag.route]++;
    const errorKind=e=>['AbortError','TimeoutError','TypeError','SyntaxError','Error'].includes(e?.name)?e.name:'unknown';
    const child=new AbortController(),links=[abort.signal,owner.values.accountStateAbortController.signal,...(options.signal?[options.signal]:[])].map((s,index)=>{const f=()=>{if(abortSource===null)abortSource=['run','account','caller'][index];child.abort(s.reason);};s.addEventListener('abort',f,{once:true});if(s.aborted)f();return [s,f];}),deadline=setTimeout(()=>{abortSource='request-deadline';child.abort(fail('METADATA_FAILED'));},requestMs);
    let pending=null,response=null,reader=null,finished=false;const chunks=[];let bytes=0;
    try{
      pending=Promise.resolve(live.nativeFetch(url.href,{method:'GET',headers,signal:child.signal,cache:'no-store',redirect:'error',credentials:'omit',priority:'low'}));stage='headers';response=await race(pending,child.signal);current();status=Number.isInteger(response?.status)?response.status:null;
      if(response?.status!==200||!response.body)throw fail('METADATA_FAILED');reader=response.body.getReader();stage='body';
      while(true){const x=await race(reader.read(),child.signal);current();if(x.done){finished=true;break;}if(!(x.value instanceof Uint8Array))throw fail('METADATA_FAILED');bytes+=x.value.length;result.metadataBytes+=x.value.length;
        if(bytes>responseLimit||result.metadataBytes>CAPS.metadataBytes)throw fail('METADATA_LIMIT');chunks.push(x.value);}
      const body=new Uint8Array(bytes);let p=0;for(const x of chunks){body.set(x,p);p+=x.length;}stage='decode-json';let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}finally{body.fill(0);}current();result.metadataDiagnostic.completed++;result.metadataDiagnostic.maxResponseBytes=Math.max(result.metadataDiagnostic.maxResponseBytes,bytes);return {ok:true,status:200,json:async()=>data};
    }catch(e){result.metadataDiagnostic.failed++;result.metadataDiagnostic.lastFailure={...diag,stage,status,receivedBytes:bytes,runReceivedBytes:result.metadataBytes,code:fixed(e),errorKind:errorKind(e),abortSource,childAborted:child.signal.aborted,bodyFinished:finished};throw e;}finally{
      clearTimeout(deadline);for(const [s,f] of links)s.removeEventListener('abort',f);child.abort(fail('CANCELLED'));
      try{
      if(!finished){const cleanupStage=reader?'reader-cancel':response?'response-body-cancel':pending?'late-response-cancel':'no-body';let nativeCleanupError='unknown';try{const cancellation=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();await drain(cancellation.catch(e=>{nativeCleanupError=errorKind(e);throw e;}));}catch(e){result.metadataDiagnostic.lastCleanupFailure={...diag,cleanupStage,nativeErrorKind:nativeCleanupError,code:e?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED',originalTrigger:result.metadataDiagnostic.lastFailure?.ordinal===diag.ordinal?result.metadataDiagnostic.lastFailure.code:null,childAborted:child.signal.aborted};stop(cleanupFailure??'CLEANUP_FAILED');throw e;}}
      }finally{try{reader?.releaseLock();}catch{}for(const x of chunks)x.fill(0);chunks.length=0;}
    }
  }
  async function readInventory(){current();const r=await inventory({driveFetch:metadataFetch,rootId:context.rootId,priorityFileId:context.priorityFileId,expectedAccountKey:context.accountKey});current();
    if(r?.report?.completeness?.repeatedPrivateInventoryMatched!==true||r.report.completeness.shortcutClassificationComplete!==true||r.report.completeness.containmentComplete!==true||!r.privatePasses?.secondPass)throw fail('INVENTORY_FAILED');result.inventoryRuns++;result.inventoryDenominators.push(summarizeInventoryDenominators(r.report));return r;}
  async function probeFile(item,index){
    current();let resourceKey=item.resourceKey,observedKey,content=null,identityFault=null;const previousAttempt=attempts.get(item.id),budget=createBatchBudget(CAPS.mediaBytes);
    if(previousAttempt?.count>=2||(!previousAttempt&&attempts.size>=CONTINUITY_LIMIT))throw fail('CONTINUITY_LIMIT');
    const identity=async({phase,signal})=>{current();const url=new URL(`https://www.googleapis.com/drive/v3/files/${item.expected.fileId}`);url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields',fieldNames);
      const value=await(await metadataFetch(url.href,{signal,responseLimitBytes:32768,requestMs:10000,headers:resourceKey?{'X-Goog-Drive-Resource-Keys':`${item.expected.fileId}/${resourceKey}`}:{}})).json();current();
      const next=normalizeProbeIdentity({accountKey:owner.values.authAccountKey,fileId:value.id,version:value.version,size:value.size,modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload});
      const key=value.resourceKey??null,nextContent={headRevisionId:value.headRevisionId??null,sha256Checksum:value.sha256Checksum??null};
      if(!immutableContent(nextContent)){if(content||previousAttempt){identityFault='IDENTITY_MISMATCH';throw fail(identityFault);}throw fail('INVALID_IDENTITY');}
      if(!same(next,item.expected)||value.trashed!==false||(key!==null&&!validId(key))||(resourceKey&&key!==resourceKey)||(phase==='postflight'&&key!==observedKey)
        ||(content&&Object.keys(content).some(k=>content[k]!==nextContent[k]))||(previousAttempt&&(!same(previousAttempt.identity,next)||!contentSame(previousAttempt.content,nextContent)))){identityFault='IDENTITY_MISMATCH';throw fail(identityFault);}
      if(phase==='preflight'){observedKey=key;resourceKey=key;content=nextContent;}return next;};
    const output={sample:`sample-${index+1}`,group:item.group,kind:'unknown',complete:false,failure:null,identityPreflight:false,identityPostflight:false,mediaRequests:0,mediaBytes:0,deeperMetadata:'not-probed'};
    const job=runBoundedProbe({expectedIdentity:item.expected,generation:owner.values.driveSessionGeneration,signal:abort.signal,batchBudget:budget,
      isGenerationCurrent:()=>{try{current();return true;}catch{return false;}},limits:{requestBytes:1024*1024,fileBytes:CAPS.mediaBytes,fileRequests:64,batchBytes:CAPS.mediaBytes,headersMs:10000,bodyNoProgressMs:10000,fileMs:50000},getIdentity:identity,
      readRange:({range,start,end,signal})=>{current();if(start===0&&end===Number(item.expected.size)-1)throw fail('INVALID_RANGE');const url=new URL(`/__drive_media/${item.expected.fileId}`,live.location.href);url.searchParams.set('accountGeneration',String(owner.values.driveSessionGeneration));url.searchParams.set('mediaSession',String(owner.values.mediaSession));url.searchParams.set('size',item.expected.size);if(resourceKey)url.searchParams.set('resourceKey',resourceKey);
        return live.nativeFetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});},
      probe:async({read,sniffMagic})=>{
        const prefix=await read({start:0,end:939});try{current();const kind=sniffMagic(prefix).kind;output.kind=['iso-bmff','mpeg-ts','webm','matroska','ebml','avi','bmp','gif','webp','png','jpeg','unknown','error-payload'].includes(kind)?kind:'unknown';return {code:output.kind==='error-payload'?'ERROR_PAYLOAD':'PREFIX_SIGNATURE'};}finally{prefix.fill(0);}
      }});
    activeFile=job;const checked=await job;activeFile=null;output.identityPreflight=checked.identity.preflight;output.identityPostflight=checked.identity.postflight;output.mediaRequests=checked.metrics.requests;output.mediaBytes=budget.receivedBytes;result.mediaRequests+=output.mediaRequests;result.mediaBytes+=output.mediaBytes;
    output.failure=checked.ok?(checked.evidence.code==='PREFIX_SIGNATURE'?null:checked.evidence.code):checked.failure.code;output.complete=checked.ok&&output.failure===null;current();
    if(identityFault)throw fail(identityFault);if(cleanupFailure)throw fail(cleanupFailure);if(['GENERATION_STALE','IDENTITY_MISMATCH','POSTFLIGHT_DRIFT','CLEANUP_FAILED','CLEANUP_TIMEOUT','METADATA_LIMIT'].includes(output.failure))throw fail(output.failure);
    attempts.set(item.id,{identity:{...item.expected},content:content?{...content}:null,count:(previousAttempt?.count??0)+1,failure:output.failure});
    if(output.complete)accepted.push({identity:{...item.expected},content:{...content},kind:output.kind,deeperMetadata:'not-probed',evidenceEpoch:epoch});else failedIds.add(item.id);return output;
  }
  function canStart(){return reserve&&result.metadataRequests+2+reserve.requests<=CAPS.metadataRequests&&result.metadataBytes+65536+reserve.bytes<=CAPS.metadataBytes&&now()-runStarted+CAPS.fileMs+reserve.ms<CAPS.runMs;}
  async function revalidateRecord(item,record){
    current();const url=new URL('https://www.googleapis.com/drive/v3/files/'+item.id);url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields',fieldNames);
    const value=await(await metadataFetch(url.href,{responseLimitBytes:32768,requestMs:10000,headers:item.resourceKey?{'X-Goog-Drive-Resource-Keys':item.id+'/'+item.resourceKey}:{}})).json();current();
    const identity=normalizeProbeIdentity({accountKey:owner.values.authAccountKey,fileId:value.id,version:value.version,size:value.size,modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload}),content={headRevisionId:value.headRevisionId??null,sha256Checksum:value.sha256Checksum??null};
    if(same(identity,item.expected)&&same(identity,record.identity)&&immutableContent(content)&&contentSame(content,record.content)&&value.trashed===false&&(value.resourceKey===undefined||value.resourceKey===null||validId(value.resourceKey))&&(item.resourceKey===null||value.resourceKey===item.resourceKey)){const verified={...record,evidenceEpoch:epoch};accepted.push(verified);history.set(item.id,verified);return true;}
    history.delete(item.id);return false;
  }
  async function execute(){let first=null,last=null,plan=null;try{
    if(!bindingPinned(binding))throw fail('SOURCE_BINDING_REJECTED');
    if(!['representatives','videos','revalidate-representatives','revalidate-videos'].includes(options.phase??'representatives')||!Number.isSafeInteger(options.maxFiles??8)||(options.maxFiles??8)<1||(options.maxFiles??8)>64)throw fail('RUNTIME_REJECTED');
    const before=inspect();owner={...before,values:Object.fromEntries(['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(k=>[k,before.state[k]]))};
    if(!context||!validId(context.rootId)||!validId(context.priorityFileId)||context.accountKey!==owner.values.accountId||context.generation!==owner.values.driveSessionGeneration)throw fail('RUNTIME_REJECTED');
    context.authAccountKey=owner.values.authAccountKey;epoch=evidenceEpoch(owner);current();const priorState=readHeaderState(priorCapsule,context,binding);priorRecords=priorState.records;attempts=new Map(priorState.attempts.map(a=>[a.identity.fileId,a]));priorCapsule=null;runStarted=now();timer=setTimeout(()=>stop('RUN_TIMEOUT'),CAPS.runMs);live.addEventListener?.('pagehide',onHide,{once:true});live.addEventListener?.('beforeunload',onHide,{once:true});owner.values.accountStateAbortController.signal.addEventListener('abort',onAccountAbort,{once:true});
    result.phase='inventory-before';first=await readInventory();const priority=first.privatePasses.secondPass.items.find(x=>x.id===context.priorityFileId);if(!priority?.version)throw fail('SELECTION_FAILED');context.priorityVersion=String(priority.version);
    reserve={requests:Math.min(CAPS.metadataRequests,Math.ceil(result.metadataRequests*1.25)+4),bytes:Math.min(CAPS.metadataBytes,Math.ceil(result.metadataBytes*1.25)+65536),ms:Math.max(30000,Math.ceil((now()-runStarted)*1.25))};result.reserve={...reserve,basis:'observed-first-two-pass-envelope-times1.25-plus-margins',guaranteed:false};
    result.phase='selection';const selected=select({pass:first.privatePasses.secondPass,priorityFileId:context.priorityFileId,expectedPriorityVersion:context.priorityVersion});candidates=collectHeaderCandidates(first.privatePasses.secondPass,selected,context.authAccountKey);
    result.phase='continuity-selection';for(const a of attempts.values()){const item=candidates.find(x=>x.id===a.identity.fileId&&!x.ineligible);if(a.failure!==null&&item&&!same(a.identity,item.expected))throw fail('IDENTITY_MISMATCH');}
    for(const record of priorRecords){const item=candidates.find(x=>x.id===record.identity.fileId&&!x.ineligible&&same(x.expected,record.identity));if(!item||!immutableContent(record.content))continue;history.set(item.id,record);accepted.push(record);}
    const isRevalidation=(options.phase??'representatives').startsWith('revalidate-'),currentIds=new Set(accepted.map(x=>x.identity.fileId)),historicalIds=new Set(history.keys());
    cohort=planHeaderCohort(candidates,{phase:options.phase??'representatives',maxFiles:options.maxFiles??8,covered:isRevalidation?currentIds:historicalIds,attempts});
    if(isRevalidation){const pending=cohort.pool.filter(x=>!x.ineligible&&history.has(x.id)&&!currentIds.has(x.id));cohort.plan=pending.slice(0,options.maxFiles??8);cohort.summary.planned=cohort.plan.length;cohort.summary.unplannedPending=Math.max(0,pending.length-cohort.plan.length);cohort.summary.batchesPlanned=Math.ceil(cohort.plan.length/8);}
    result.plan={...cohort.summary,priorImmutablePrefixes:cohort.pool.filter(x=>history.has(x.id)).length,carriedImmutableByCatalog:cohort.pool.filter(x=>currentIds.has(x.id)).length,carryEvidence:'fresh-complete-catalog-same-nonempty-monotonic-file-version;prior-pre-post-immutable-content-proof',freshHeadChecksForCarry:0};current();
    result.phase='headers';let slot=0;for(let offset=0;offset<cohort.plan.length;offset+=CAPS.batchFiles){const batch={ordinal:result.batches.length+1,planned:Math.min(CAPS.batchFiles,cohort.plan.length-offset),attempted:0,classified:0,failed:0};result.batches.push(batch);
      for(const item of cohort.plan.slice(offset,offset+CAPS.batchFiles)){if(!canStart())break;let output;if(isRevalidation){let ok=false,reason='CONTINUITY_CONTENT_CHANGED';try{ok=await revalidateRecord(item,history.get(item.id));}catch(e){current();if(cleanupFailure)throw e;reason=fixed(e);history.delete(item.id);}output={sample:'sample-'+(++slot),kind:history.get(item.id)?.kind??'unknown',complete:ok,failure:ok?null:reason,mediaRequests:0,mediaBytes:0,deeperMetadata:'not-probed',immutableRevalidated:ok};if(!ok)failedIds.add(item.id);}else output=await probeFile(item,slot++);result.files.push(output);batch.attempted++;batch[output.complete?'classified':'failed']++;current();}
      if(batch.attempted<batch.planned)break;}
    for(const item of cohort.pool)if(!item.ineligible&&!accepted.some(r=>r.identity.fileId===item.id)&&attempts.has(item.id))failedIds.add(item.id);
    result.phase='inventory-after';last=await readInventory();try{compare({firstPass:first.privatePasses.secondPass,secondPass:last.privatePasses.secondPass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId});}catch{throw fail('CATALOG_DRIFT');}
    current();result.catalogStable=true;const acceptedIds=new Set(accepted.map(x=>x.identity.fileId));const pool=cohort.pool;
    result.coverage={denominator:pool.length,classified:pool.filter(x=>acceptedIds.has(x.id)).length,failed:pool.filter(x=>failedIds.has(x.id)).length,ineligible:pool.filter(x=>x.ineligible).length,unattempted:pool.filter(x=>!x.ineligible&&!acceptedIds.has(x.id)&&!failedIds.has(x.id)).length,unknownSignatures:accepted.filter(x=>pool.some(p=>p.id===x.identity.fileId)&&x.kind==='unknown').length,deeperMetadataProbed:0,deeperMetadataIncomplete:0,deeperMetadataUnprobed:pool.filter(x=>acceptedIds.has(x.id)).length,completeEvidenceLevel:'940-byte-prefix-signatures-only',wholeCorpusComplete:false};
    result.coverage.carriedImmutableByCatalog=pool.filter(x=>currentIds.has(x.id)).length;result.coverage.freshPerFileChecked=result.files.filter(x=>x.complete).length;result.coverage.freshHeadChecksForCarry=0;result.coverage.carryEvidence=result.plan.carryEvidence;result.coverage.dispositionsComplete=result.coverage.unattempted===0;result.coverage.allEligiblePrefixesValidated=result.coverage.failed===0&&result.coverage.unattempted===0;result.coverage.knownSignaturesAllEligible=result.coverage.allEligiblePrefixesValidated&&result.coverage.unknownSignatures===0;result.coverage.kindCounts={};for(const record of accepted)if(pool.some(x=>x.id===record.identity.fileId))result.coverage.kindCounts[record.kind]=(result.coverage.kindCounts[record.kind]??0)+1;
    if(result.coverage.denominator!==result.coverage.classified+result.coverage.failed+result.coverage.ineligible+result.coverage.unattempted)throw fail('SELECTION_FAILED');
    result.coverage.retryPending=pool.filter(x=>failedIds.has(x.id)&&attempts.get(x.id)?.count<2&&RETRYABLE.has(attempts.get(x.id)?.failure)&&attempts.get(x.id)?.content!==null&&same(attempts.get(x.id)?.identity,x.expected)).length;
    result.coverage.retryExhausted=result.coverage.failed-result.coverage.retryPending;result.coverage.queuedFresh=result.coverage.unattempted;result.coverage.queuedRetries=result.coverage.retryPending;result.coverage.queuedTotal=result.coverage.queuedFresh+result.coverage.queuedRetries;result.coverage.maxFreshAttemptsPerFile=2;result.coverage.ledgerEntries=attempts.size;result.coverage.ledgerLimit=CONTINUITY_LIMIT;
    for(const record of accepted)history.set(record.identity.fileId,record);result.coverage.historicalPendingRevalidation=pool.filter(x=>history.has(x.id)&&!acceptedIds.has(x.id)&&!failedIds.has(x.id)).length;capsule=createHeaderContinuity(context,binding,[...history.values()],[...attempts.values()]);result.complete=true;result.phase='done';
  }catch(e){result.failure=fixed(abort.signal.aborted?abort.signal.reason:e);result.complete=false;result.phase='failed';}
  finally{
    stop(result.failure??'CANCELLED');clearTimeout(timer);live?.removeEventListener?.('pagehide',onHide);live?.removeEventListener?.('beforeunload',onHide);
    owner?.values.accountStateAbortController.signal.removeEventListener('abort',onAccountAbort);
    if(tasks.size)try{await drain(Promise.allSettled([...tasks]));}catch{}if(cleanupFailure){result.failure=cleanupFailure;result.complete=false;result.phase='failed';}
    first=null;last=null;plan=null;candidates=null;cohort=null;accepted=[];history.clear();attempts.clear();epoch=null;priorRecords=null;priorCapsule=null;failedIds.clear();context=null;prior=null;owner=null;live=null;activeFile=null;result.released=true;done=true;
  }return safe();}
  return Object.freeze({run(){if(!started){started=true;promise=execute();}return promise;},cancel(){stop('CANCELLED');return {cancelled:true};},continuity(){return done&&result.complete&&result.catalogStable?capsule:null;},poll(){return {started,done,phase:result.phase,metadataRequests:result.metadataRequests,metadataBytes:result.metadataBytes,mediaRequests:result.mediaRequests,mediaBytes:result.mediaBytes,processed:result.files.length,summary:done?safe():null};}});
}
