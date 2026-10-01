import {runAuthenticatedRootInventory} from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import {summarizeRepeatedInventory} from '../v2-07a-root-inventory/root-inventory.mjs';
import {selectRiskRepresentatives} from '../v2-07a-representative-selection/representative-selector.mjs';
import {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES} from '../v2-07a-bounded-probe/bounded-probe.mjs';
import {summarizeInventoryDenominators} from '../rc21-corpus-night/inventory-denominators.mjs';
import {collectHeaderCandidates,planHeaderCohort} from './selection.mjs';
import {classifyBounded,configurationKey} from './classify.mjs';
import {readHeaderState,createHeaderContinuity,identitySame,contentSame,evidenceEpoch,CONTINUITY_LIMIT,RETRYABLE,EPOCH} from './continuity.mjs';
export const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
export const CAPS=Object.freeze({files:64,batchFiles:8,mediaRequests:64,mediaBytes:2*1024*1024+8192,fileMs:50000,runMs:600000,metadataRequests:512,metadataResponseBytes:2*1024*1024,metadataBytes:64*1024*1024});
const fail=code=>Object.assign(new Error(code),{code});
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(x);
const fixed=e=>[...FAILURE_CODES,'RUNTIME_REJECTED','OWNER_CHANGED','CANCELLED','METADATA_LIMIT','METADATA_FAILED','INVENTORY_FAILED','SELECTION_FAILED','CATALOG_DRIFT','RUN_TIMEOUT','CLEANUP_FAILED','CLEANUP_TIMEOUT','CONTINUITY_REJECTED','CONTINUITY_LIMIT','SOURCE_BINDING_REJECTED','RECOVERY_UNSAFE','CONTINUITY_CONTENT_CHANGED'].includes(e?.code)?e.code:'PROBE_FAILED';
const same=identitySame;
const fieldNames='id,version,headRevisionId,sha256Checksum,size,modifiedTime,mimeType,trashed,resourceKey,capabilities(canDownload)';
export function bindingPinned(x){return x?.schema==='drive-original.corpus-header-source-binding/1'&&x.version==='1.22.0-rc.32'&&x.sourceCommit==='1d79897fd32c569137cab079bfd93107be2ee33f'&&['app.js','sw.js','version.json'].every(k=>/^[a-f0-9]{64}$/.test(x.sourceSHA256?.[k]??''));}
export const immutableContent=x=>(validId(x?.headRevisionId)||/^[a-fA-F0-9]{64}$/.test(x?.sha256Checksum??''))&&(x?.headRevisionId===null||validId(x?.headRevisionId))&&(x?.sha256Checksum===null||/^[a-fA-F0-9]{64}$/.test(x?.sha256Checksum??''));
export function createCorpusOwnerJob(runtime,dependencies={}){
  const binding=dependencies.binding,VERSION=binding?.version;const options=Object.freeze({...runtime?.options});let priorCapsule=runtime?.priorCapsule??null,priorRecords=null;
  const inventory=dependencies.inventoryRunner??runAuthenticatedRootInventory,select=dependencies.selector??selectRiskRepresentatives,compare=dependencies.compareInventory??summarizeRepeatedInventory;
  let live=runtime,context=runtime?.privateContext?{...runtime.privateContext}:null,prior=null,owner=null,promise=null,started=false,done=false,timer=null,activeFile=null;
  runtime=null;let candidates=null,cohort=null,accepted=[],history=new Map(),attempts=new Map(),epoch=null,capsule=null,runStarted=0,reserve=null;const failedIds=new Set(),now=dependencies.now??(()=>performance.now());
  const abort=new AbortController(),tasks=new Set();let cleanupFailure=null,currentFileProgress=null;
  const result={schema:'drive-original.bounded-corpus-header-summary/1',version:VERSION,epoch:EPOCH,scope:'video-mime-or-extension-image-union-bounded-structural-metadata',mode:options.phase==='revalidate-videos'?'recovery-qualification':'corpus-metadata',completeMeaning:'cohort-finished-with-reconciled-dispositions-only',wholeCorpusComplete:false,inventoryDenominators:[],batches:[],coverage:null,ownerDiagnostic:null,recoveryQualified:false,reserve:null,complete:false,phase:'not-started',failure:null,
    inventoryRuns:0,catalogStable:false,catalogComparison:null,metadataRequests:0,metadataBytes:0,mediaRequests:0,mediaBytes:0,plan:null,files:[],decoded:0,playback:0,physicalDevice:0,writeRequests:0,genericUpstreamCleanup:'unknown',released:false,metadataDiagnostic:{completed:0,failed:0,maxResponseBytes:0,routeCounts:{about:0,list:0,file:0},lastFailure:null,lastCleanupFailure:null}};
  const safe=()=>JSON.parse(JSON.stringify(result));
  const stop=code=>{if(!abort.signal.aborted)abort.abort(fail(code));};
  const onHide=()=>stop('CANCELLED');
  const onAccountAbort=()=>{result.ownerDiagnostic=live?.getOwnerDiagnostics?.()??{abortChanged:true};stop('OWNER_CHANGED');};
  const inspect=()=>{const s=live?.readState?.(),sw=live?.getSWIdentity?.(),controller=live?.navigator?.serviceWorker?.controller;
    if(!s||live.appVersion!==VERSION||live.getMutationsEnabled()!==false||live.top!==live.self||live.location?.origin!==ORIGIN||live.navigator?.onLine!==true
      ||live.document?.visibilityState!=='visible'||sw?.controller!==controller||sw?.version!==VERSION||!bindingPinned(binding)||sw?.sourceCommit!==binding.sourceCommit||['app.js','sw.js','version.json'].some(k=>sw?.sourceSHA256?.[k]!==binding.sourceSHA256[k])||controller?.state!=='activated'||new URL(controller.scriptURL).origin!==ORIGIN||new URL(controller.scriptURL).pathname!=='/sw.js'
      ||!validId(s.accountId)||!s.authAccountKey||s.authStatus!=='online'||s.demo!==false||s.accountIdentityPending||!live.hasUsableToken()||!s.token
      ||!s.accountStateAbortController?.signal||s.accountStateAbortController.signal.aborted||live.getQ1RetirementResult()?.settled!==true||live.getQ1Playback()!==null||live.getPlayerMediaPriorityActive()!==false
      ||s.selected!==null||s.mediaAttempt!=='idle'||s.mediaAbortController!==null||s.pendingOriginalBuffer!==null||s.pendingPlay!==false||s.mediaTransportStarted!==false
      ||['driveSessionGeneration','authGeneration','tokenRevision','mediaSession'].some(k=>!Number.isSafeInteger(s[k])||s[k]<0)||!Number.isSafeInteger(live.getMediaSourceGeneration())
      ||new URL(controller.scriptURL).search||new URL(controller.scriptURL).hash)throw fail('RUNTIME_REJECTED');
    return {state:s,controller,retirement:live.getQ1RetirementResult(),source:live.getMediaSourceGeneration(),href:live.location.href};};
  function current(){if(abort.signal.aborted)throw abort.signal.reason;let now;try{now=inspect();}catch{result.ownerDiagnostic=live?.getOwnerDiagnostics?.()??{runtimeChanged:true};throw fail('OWNER_CHANGED');}
    if(!owner||now.state!==owner.state||now.controller!==owner.controller||now.retirement!==owner.retirement||now.source!==owner.source||now.href!==owner.href
      ||Object.entries(owner.values).some(([k,v])=>now.state[k]!==v)){result.ownerDiagnostic=live?.getOwnerDiagnostics?.()??{runtimeChanged:true};throw fail('OWNER_CHANGED');}return now.state;}
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
  function canStart(extra=2){return reserve&&result.metadataRequests+extra+reserve.requests<=CAPS.metadataRequests&&result.metadataBytes+65536+reserve.bytes<=CAPS.metadataBytes&&now()-runStarted+CAPS.fileMs+reserve.ms<CAPS.runMs;}
  async function fresh(item,baseline=null,signal){
    current();const url=new URL('https://www.googleapis.com/drive/v3/files/'+item.id);url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields',fieldNames);
    const value=await(await metadataFetch(url.href,{signal,responseLimitBytes:32768,requestMs:10000,headers:item.resourceKey?{'X-Goog-Drive-Resource-Keys':item.id+'/'+item.resourceKey}:{}})).json();current();
    const identity=normalizeProbeIdentity({accountKey:owner.values.authAccountKey,fileId:value.id,version:value.version,size:value.size,modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload}),content={headRevisionId:value.headRevisionId??null,sha256Checksum:value.sha256Checksum??null};
    if(!same(identity,item.expected)||!immutableContent(content)||value.trashed!==false||(value.resourceKey!=null&&!validId(value.resourceKey))||(item.resourceKey&&value.resourceKey!==item.resourceKey)||(baseline&&(!same(identity,baseline.identity)||!contentSame(content,baseline.content))))throw fail('IDENTITY_MISMATCH');
    return {identity,content,key:value.resourceKey??null};
  }
  async function probeFile(item,index){
    current();if(attempts.has(item.id)||attempts.size>=CONTINUITY_LIMIT)throw fail('CONTINUITY_LIMIT');
    // Consume BEFORE asynchronous preflight/Range. Fatal owner changes cannot erase this entry.
    const attempt={identity:{...item.expected},content:null,count:1,failure:'UNSETTLED_ATTEMPT',ownerQualified:false};attempts.set(item.id,attempt);
    let baseline=null,resourceKey=item.resourceKey;const budget=createBatchBudget(CAPS.mediaBytes);currentFileProgress={requests:0,budget};
    const output={sample:'sample-'+(index+1),kind:'unknown',classification:'unknown',reason:'UNSETTLED_ATTEMPT',complete:false,failure:null,identityPreflight:false,identityPostflight:false,mediaRequests:0,mediaBytes:0,tracks:null,image:null};
    const job=runBoundedProbe({expectedIdentity:item.expected,generation:owner.values.driveSessionGeneration,signal:abort.signal,batchBudget:budget,
      isGenerationCurrent:()=>{try{current();return true;}catch{return false;}},limits:{requestBytes:1024*1024,fileBytes:CAPS.mediaBytes,fileRequests:64,batchBytes:CAPS.mediaBytes,headersMs:10000,bodyNoProgressMs:10000,fileMs:50000},
      getIdentity:async({phase,signal})=>{const value=await fresh(item,baseline,signal);if(phase==='preflight'){baseline=value;resourceKey=value.key;attempt.content={...value.content};}else if(value.key!==resourceKey)throw fail('IDENTITY_MISMATCH');return value.identity;},
      readRange:({range,start,end,signal})=>{current();if(start===0&&end===Number(item.expected.size)-1)throw fail('INVALID_RANGE');const url=new URL('/__drive_media/'+item.id,live.location.href);url.searchParams.set('accountGeneration',String(owner.values.driveSessionGeneration));url.searchParams.set('mediaSession',String(owner.values.mediaSession));url.searchParams.set('size',item.expected.size);if(resourceKey)url.searchParams.set('resourceKey',resourceKey);currentFileProgress.requests++;return live.nativeFetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});},
      probe:async(args)=>{const value=await classifyBounded({...args,size:Number(item.expected.size),current});Object.assign(output,value);return {code:value.reason==='ERROR_PAYLOAD'?'ERROR_PAYLOAD':'METADATA_OBSERVATION'};}});
    activeFile=job;let checked;
    try{checked=await job;}finally{activeFile=null;currentFileProgress=null;attempt.failure='UNSETTLED_ATTEMPT';}
    Object.assign(output,{identityPreflight:checked.identity.preflight,identityPostflight:checked.identity.postflight,mediaRequests:checked.metrics.requests,mediaBytes:budget.receivedBytes});result.mediaRequests+=output.mediaRequests;result.mediaBytes+=output.mediaBytes;
    output.failure=checked.ok?(checked.evidence.code==='ERROR_PAYLOAD'?'ERROR_PAYLOAD':null):checked.failure.code;output.complete=checked.ok&&output.failure===null;attempt.failure=output.failure;
    // Retained outcome is provisional until the complete post-catalog fence passes.
    const parserDeferred=['FILE_BYTE_LIMIT','FILE_REQUEST_LIMIT','BATCH_BYTE_LIMIT','REQUEST_BYTE_LIMIT','FILE_TIMEOUT','HEADER_TIMEOUT','BODY_TIMEOUT'].includes(output.failure)&&output.identityPreflight&&output.identityPostflight;
    if(parserDeferred){output.classification='unknown';output.reason='PARSER_BUDGET_OR_DEADLINE_DEFERRED';output.deferred=true;}
    if(output.complete||parserDeferred)history.set(item.id,{identity:{...item.expected},content:{...baseline.content},kind:output.kind,classification:output.classification,reason:output.reason,tracks:output.tracks,image:output.image,deferred:parserDeferred,evidenceEpoch:epoch,catalogValidated:false});
    result.files.push(output);
    current();if(cleanupFailure)throw fail(cleanupFailure);
    const terminal=new Set(['GENERATION_STALE','IDENTITY_MISMATCH','POSTFLIGHT_DRIFT','CLEANUP_FAILED','CLEANUP_TIMEOUT','METADATA_LIMIT','OWNER_CHANGED']);
    if(terminal.has(output.failure))throw fail(output.failure);return output;
  }
  function coverage(){
    const pool=cohort?.pool??candidates?.filter(x=>x.videoCandidate||x.imageCandidate)??[],ids=new Set(history.keys());
    const records=pool.map(x=>history.get(x.id)).filter(Boolean),validated=records.filter(x=>x.catalogValidated);
    const classified=validated.filter(x=>x.classification!=='unknown').length,unknown=validated.filter(x=>x.classification==='unknown').length;
    const failed=pool.filter(x=>!x.ineligible&&attempts.has(x.id)&&!ids.has(x.id)).length,quarantined=records.filter(x=>!x.catalogValidated).length;
    const ineligible=pool.filter(x=>x.ineligible).length,unattempted=pool.filter(x=>!x.ineligible&&!ids.has(x.id)&&!attempts.has(x.id)).length;
    const config=new Map();for(const row of validated){const key=configurationKey(row);if(key&&!config.has(key))config.set(key,{sample:'configuration-'+(config.size+1),kind:row.kind,classification:row.classification,tracks:row.tracks,image:row.image});}
    return {denominator:pool.length,denominatorQualified:candidates!==null,videoMimeOrExtensionUnion:pool.filter(x=>x.videoCandidate).length,imageMimeOrExtensionUnion:pool.filter(x=>x.imageCandidate).length,classified,unknown,failed,quarantined,quarantinedConsumedAttempts:[...attempts.values()].filter(a=>!a.ownerQualified).length,ineligible,unattempted,deferred:validated.filter(x=>x.deferred).length,queuedFresh:unattempted,queuedRetries:0,maxFreshAttemptsPerFile:1,ledgerEntries:attempts.size,ledgerLimit:CONTINUITY_LIMIT,historicalCrossEpochAttempts:'UNKNOWN',historicalResultsImported:false,deeperMetadataProbed:validated.filter(x=>x.classification==='video-structural').length,imageHeadersProbed:validated.filter(x=>x.classification==='image-header').length,configurationRepresentatives:[...config.values()],dispositionsComplete:unattempted===0,wholeCorpusComplete:false,structuralClassificationComplete:unattempted===0&&failed===0&&unknown===0&&quarantined===0&&ineligible===0};
  }
  async function execute(){let first=null,last=null;try{
    if(!bindingPinned(binding))throw fail('SOURCE_BINDING_REJECTED');
    if(!['videos','revalidate-videos'].includes(options.phase)||!Number.isSafeInteger(options.maxFiles)||options.maxFiles<1||options.maxFiles>64)throw fail('RUNTIME_REJECTED');
    const before=inspect();owner={...before,values:Object.fromEntries(['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(k=>[k,before.state[k]]))};
    if(!context||!validId(context.rootId)||!validId(context.priorityFileId)||context.accountKey!==owner.values.accountId||context.generation!==owner.values.driveSessionGeneration)throw fail('RUNTIME_REJECTED');
    context.authAccountKey=owner.values.authAccountKey;epoch=EPOCH;current();const saved=readHeaderState(priorCapsule,context,binding);attempts=new Map(saved.attempts.map(a=>[a.identity.fileId,a]));history=new Map(saved.records.map(r=>[r.identity.fileId,r]));priorCapsule=null;
    runStarted=now();timer=setTimeout(()=>stop('RUN_TIMEOUT'),CAPS.runMs);live.addEventListener?.('pagehide',onHide,{once:true});live.addEventListener?.('beforeunload',onHide,{once:true});owner.values.accountStateAbortController.signal.addEventListener('abort',onAccountAbort,{once:true});
    result.phase='inventory-before';first=await readInventory();const priority=first.privatePasses.secondPass.items.find(x=>x.id===context.priorityFileId);if(!priority?.version)throw fail('SELECTION_FAILED');context.priorityVersion=String(priority.version);
    reserve={requests:Math.min(CAPS.metadataRequests,Math.ceil(result.metadataRequests*1.25)+4),bytes:Math.min(CAPS.metadataBytes,Math.ceil(result.metadataBytes*1.25)+65536),ms:Math.max(30000,Math.ceil((now()-runStarted)*1.25))};result.reserve={...reserve,guaranteed:false};
    result.phase='selection';const selected=select({pass:first.privatePasses.secondPass,priorityFileId:context.priorityFileId,expectedPriorityVersion:context.priorityVersion});candidates=collectHeaderCandidates(first.privatePasses.secondPass,selected,context.authAccountKey);const byId=new Map(candidates.map(x=>[x.id,x]));
    for(const a of attempts.values()){const item=byId.get(a.identity.fileId);if(!item||item.ineligible||!same(a.identity,item.expected))throw fail('CONTINUITY_CONTENT_CHANGED');}
    const recovery=options.phase==='revalidate-videos';cohort=planHeaderCohort(candidates,{phase:'videos',maxFiles:options.maxFiles,covered:new Set(history.keys()),attempts});result.plan=cohort.summary;
    if(recovery){
      // A recovery requalifies EVERY consumed attempt, including failed ones. A missing immutable baseline is unsafe.
      if(!Number.isSafeInteger(options.recoveryCycle)||options.recoveryCycle<1||[...attempts.values()].some(a=>!immutableContent(a.content)))throw fail('RECOVERY_UNSAFE');
      for(const row of history.values())row.catalogValidated=false;
      const checkRows=[...attempts.values()].filter(a=>a.recoveryStamp!==options.recoveryCycle).slice(0,options.maxFiles);
      result.phase='recovery-strong-metadata';for(const a of checkRows){if(!canStart(1))throw fail('RECOVERY_UNSAFE');await fresh(byId.get(a.identity.fileId),a);a.recoveryStamp=options.recoveryCycle;}
    }else{
      if([...history.values()].some(r=>!r.catalogValidated))throw fail('RECOVERY_UNSAFE');
      result.phase='structural-and-image-headers';let slot=0;
      for(let offset=0;offset<cohort.plan.length;offset+=8){const batch={ordinal:result.batches.length+1,planned:Math.min(8,cohort.plan.length-offset),attempted:0};result.batches.push(batch);for(const item of cohort.plan.slice(offset,offset+8)){if(!canStart())break;await probeFile(item,slot++);batch.attempted++;}if(batch.attempted<batch.planned)break;}
    }
    result.phase='inventory-after';last=await readInventory();try{compare({firstPass:first.privatePasses.secondPass,secondPass:last.privatePasses.secondPass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId});}catch{throw fail('CATALOG_DRIFT');}
    current();result.catalogStable=true;for(const a of attempts.values())a.ownerQualified=!recovery||a.recoveryStamp===options.recoveryCycle;for(const row of history.values())row.catalogValidated=!recovery||attempts.get(row.identity.fileId)?.recoveryStamp===options.recoveryCycle;result.recoveryQualified=recovery&&[...attempts.values()].every(a=>a.recoveryStamp===options.recoveryCycle);result.recoveryRemaining=recovery?[...attempts.values()].filter(a=>a.recoveryStamp!==options.recoveryCycle).length:0;result.complete=true;result.phase='done';
  }catch(e){result.failure=fixed(abort.signal.aborted?abort.signal.reason:e);result.complete=false;result.phase='failed';}
  finally{
    stop(result.failure??'CANCELLED');clearTimeout(timer);live?.removeEventListener?.('pagehide',onHide);live?.removeEventListener?.('beforeunload',onHide);owner?.values.accountStateAbortController.signal.removeEventListener('abort',onAccountAbort);
    if(tasks.size)try{await drain(Promise.allSettled([...tasks]));}catch{}if(cleanupFailure){result.failure=cleanupFailure;result.complete=false;}
    if(!result.complete){for(const row of history.values())row.catalogValidated=false;for(const a of attempts.values())a.ownerQualified=false;}
    result.coverage=coverage();
    // Fatal summaries retain the SAME opaque state, never a safe JSON reconstruction.
    if(context?.authAccountKey)try{capsule=createHeaderContinuity(context,binding,[...history.values()],[...attempts.values()]);}catch{result.failure='CONTINUITY_LIMIT';result.complete=false;}
    first=null;last=null;candidates=null;cohort=null;accepted=[];history.clear();attempts.clear();context=null;owner=null;live=null;activeFile=null;result.released=true;done=true;
  }return safe();}
  return Object.freeze({run(){if(!started){started=true;promise=execute();}return promise;},cancel(){
    // Runner cancellation can win before current() inspects the drift. Capture the owned Boolean witness first.
    try{result.ownerDiagnostic=live?.getOwnerDiagnostics?.()??result.ownerDiagnostic;}catch{}
    stop('CANCELLED');return {cancelled:true};
  },continuity(){return done?capsule:null;},poll(){return {started,done,phase:result.phase,metadataRequests:result.metadataRequests,metadataBytes:result.metadataBytes,mediaRequests:result.mediaRequests+(currentFileProgress?.requests??0),mediaBytes:result.mediaBytes+(currentFileProgress?.budget.receivedBytes??0),processed:result.files.length,summary:done?safe():null};}});
}
