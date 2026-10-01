import {planDeepCohorts,safeReferences} from './selection.mjs';
import {summarizeInventoryDenominators,summarizeProbeDenominators} from '../rc21-corpus-night/inventory-denominators.mjs';
import {runAuthenticatedRootInventory} from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import {summarizeRepeatedInventory} from '../v2-07a-root-inventory/root-inventory.mjs';
import {selectRiskRepresentatives} from '../v2-07a-representative-selection/representative-selector.mjs';
import {runBoundedProbe,createBatchBudget,normalizeProbeIdentity,FAILURE_CODES} from '../v2-07a-bounded-probe/bounded-probe.mjs';
import {scanIsoBmffTopLevel} from '../v2-07a-isobmff-index/isobmff-index.mjs';
import {parseMoov} from '../v2-07a-iso-tracks-rc11/parser.mjs';
import {readSparseMoov} from '../rc21-corpus-night/sparse-moov.mjs';
import {readEbmlTracks} from '../rc16-corpus-tracks/ebml-tracks.mjs';
import {diagnoseComparisonFailure,sanitizeComparisonDiagnostic,emptyComparisonDiagnostic} from '../v2-07a-current-corpus-probe/comparison-diagnostics.mjs';
import {sanitizeFailureDiagnostic} from './diagnostics.mjs';

export const BINDING=Object.freeze({"schema":"drive-original.corpus-header-source-binding/1","version":"1.22.0-rc.28","sourceCommit":"944f00607cf05e586b1c88e2876dd796ce114e82","sourceSHA256":{"app.js":"2dbba4ed225a867cc9024c2400242975317855bcf03acebc73df4c0dc1c84377","sw.js":"22e01aebb62f35033560fe9edc5696b8b797e9c8b3f26bdda4606c2e19761518","version.json":"1de99c21f5d32cb36f0396ea823a2885f981fc60b11720fb52f240c268745f1b"}});
export const VERSION='1.22.0-rc.28';
export const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
export const CAPS=Object.freeze({isoFiles:5,webmFiles:1,unknownFiles:2,files:8,mediaRequests:64,mediaBytes:2*1024*1024+8192,fileMs:50000,runMs:600000,metadataRequests:512,metadataResponseBytes:2*1024*1024,metadataBytes:64*1024*1024});
const fail=code=>Object.assign(new Error(code),{code});
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(x);
const fixed=e=>[...FAILURE_CODES,'RUNTIME_REJECTED','OWNER_CHANGED','CANCELLED','METADATA_LIMIT','METADATA_FAILED','INVENTORY_FAILED','SELECTION_FAILED','CATALOG_DRIFT','RUN_TIMEOUT','CLEANUP_FAILED','CLEANUP_TIMEOUT'].includes(e?.code)?e.code:'PROBE_FAILED';
const keys=['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'];
const same=(a,b)=>keys.every(k=>a[k]===b[k]);
const fieldNames='id,version,headRevisionId,sha256Checksum,size,modifiedTime,mimeType,trashed,resourceKey,parents,capabilities(canDownload)';
const imageMimes=new Set(['image/jpeg','image/png','image/gif','image/webp','image/bmp']);
const extension=x=>String(x.extension??'').toLowerCase().replace(/^\./,'');
const imageExts=new Set(['jpg','jpeg','png','gif','webp','bmp']);
const privateIdentity=(row,accountKey)=>normalizeProbeIdentity({accountKey,fileId:row.fileId,version:row.version,size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});

// Pure plan. A metadata match cannot establish the old actual magic mapping.
export function planTrackSamples(selection,context,prior=null){
  const m=selection?.privateManifest,r=selection?.report;
  if(m?.schema!=='drive-original.v2-07a-risk-selection-private/1'||!Array.isArray(m.selected)||m.selected.length<1||m.selected.length>38
    ||m.prioritySample?.fileId!==context.priorityFileId||m.prioritySample?.version!==context.priorityVersion
    ||r?.coverage?.uncoveredCategoryCount!==0||r.coverage.coveredCategoryCount!==r.coverage.requiredCategoryCount
    ||r.selection?.prioritySampleSelected!==true||r.selection.allRareMkvAviBmpSelected!==true||r.selection.allGe4GiBSelected!==true)throw fail('SELECTION_FAILED');
  const seen=new Set(),rows=m.selected.map(row=>{if(!validId(row.fileId)||seen.has(row.fileId)||!Array.isArray(row.visibleReferences)||!row.visibleReferences.length)throw fail('SELECTION_FAILED');seen.add(row.fileId);
    const refs=row.visibleReferences,resourceKeys=new Set();for(const ref of refs){if(!validId(ref.fileId)||(ref.resourceKey!==null&&!validId(ref.resourceKey)))throw fail('SELECTION_FAILED');if(ref.resourceKey)resourceKeys.add(ref.resourceKey);}if(resourceKeys.size>1)throw fail('SELECTION_FAILED');
    const expected=privateIdentity(row,context.authAccountKey);if(BigInt(expected.size)>BigInt(Number.MAX_SAFE_INTEGER))throw fail('SELECTION_FAILED');return {row,expected,resourceKey:[...resourceKeys][0]??null};});
  const usablePrior=prior?.schema==='drive-original.corpus-tracks-private-continuity/1'&&prior.accountKey===context.authAccountKey&&prior.rootId===context.rootId&&Array.isArray(prior.rows);
  if(prior!==null&&(!usablePrior||prior.rows.length>38))throw fail('SELECTION_FAILED');
  const old=usablePrior?prior.rows:[];
  for(const p of old){if(!validId(p?.identity?.fileId)||!['iso-bmff','mpeg-ts','webm','matroska','ebml','unknown','jpeg','png','gif','webp','bmp'].includes(p.kind)||typeof p.tracksProven!=='boolean')throw fail('SELECTION_FAILED');privateIdentity({...p.identity,fileId:p.identity.fileId},context.authAccountKey);if(p.identity.accountKey!==context.authAccountKey)throw fail('SELECTION_FAILED');}
  const match=x=>old.find(p=>same(p.identity,x.expected));
  const candidates=rows.filter(x=>x.expected.fileId!==context.priorityFileId&&match(x)?.kind!=='mpeg-ts');
  const iso=candidates.filter(x=>match(x)?.kind==='iso-bmff'||(!match(x)&&['video/mp4','video/quicktime'].includes(x.expected.mimeType)&&!['mkv','avi'].includes(extension(x.row))));
  iso.sort((a,b)=>BigInt(a.expected.size)>BigInt(b.expected.size)?-1:BigInt(a.expected.size)<BigInt(b.expected.size)?1:a.expected.fileId.localeCompare(b.expected.fileId));
  const proven=iso.filter(x=>match(x)?.tracksProven===true),continuity=proven.length>0;
  const deferred=continuity?null:iso[0]??null; // Avoid presumed old largest-ISO replay when exact private version was released.
  const selectedIso=iso.filter(x=>!proven.includes(x)&&x!==deferred).slice(0,5);
  const selectedWebm=candidates.filter(x=>!selectedIso.includes(x)&&x!==deferred&&match(x)?.tracksProven!==true&&(match(x)?.kind==='webm'||(!match(x)&&x.expected.mimeType==='video/webm'&&extension(x.row)==='webm'))).sort((a,b)=>a.expected.fileId.localeCompare(b.expected.fileId)).slice(0,1);
  const selectedUnknown=candidates.filter(x=>!selectedIso.includes(x)&&!selectedWebm.includes(x)&&x!==deferred&&!proven.includes(x)&&(
    match(x)?.kind==='unknown'||(!match(x)&&(extension(x.row)==='bmp'||(imageExts.has(extension(x.row))&&!imageMimes.has(x.expected.mimeType))
      ||(x.expected.mimeType.startsWith('image/')&&!imageExts.has(extension(x.row))))))).sort((a,b)=>a.expected.fileId.localeCompare(b.expected.fileId)).slice(0,2);
  const plan=[...selectedIso.map(x=>({...x,group:'iso'})),...selectedWebm.map(x=>({...x,group:'webm'})),...selectedUnknown.map(x=>({...x,group:'unknown'}))];
  return {plan,summary:{representatives:m.selected.length,coverageComplete:true,priorPrivateMappingAvailable:usablePrior,continuity:continuity?'exact-version-proven-exclusion':'unknown',
    exactProvenIsoExcluded:proven.length,deferredLargestIsoIdentityUnproven:Boolean(deferred),isoPlanned:selectedIso.length,webmPlanned:selectedWebm.length,unknownPlanned:selectedUnknown.length,
    unknownSampleContinuity:usablePrior&&selectedUnknown.every(x=>match(x)?.kind==='unknown')?'exact-version-mapped':'unknown',all36PrefixesReplayed:false,knownTsContinuationReads:0}};
}

function safeIso(value){
  const n=x=>Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER?x:null;
  const tags=new Set(['avc1','avc3','hvc1','hev1','av01','vp09','mp4v','mp4a','ac-3','ec-3','Opus','fLaC','lpcm','raw ','twos','sowt','unknown']);
  return {status:value?.status==='parsed'?'parsed':'incomplete',code:value?.status==='parsed'?'ISO_STRUCTURAL_METADATA':'ISO_PARSER_INCOMPLETE',
    fragmented:value?.fragmented===true,tracks:(value?.tracks??[]).slice(0,32).map(t=>({type:['vide','soun','subt','text'].includes(t.type)?t.type:'other',width:n(t.width),height:n(t.height),identityMatrix:t.identityMatrix===true,
      descriptions:(t.descriptions??[]).slice(0,16).map(d=>({codec:tags.has(d.codec)?d.codec:'unknown',width:n(d.width),height:n(d.height),channels:n(d.channels),sampleRate:n(d.sampleRate),sampleSize:n(d.sampleSize),encrypted:d.encrypted===true,
        avcProfile:n(d.config?.avcC?.profile),avcLevel:n(d.config?.avcC?.level),hevcProfile:n(d.config?.hvcC?.profileIdc),hevcLevel:n(d.config?.hvcC?.levelIdc),bitDepthLuma:n(d.config?.hvcC?.bitDepthLuma),bitDepthChroma:n(d.config?.hvcC?.bitDepthChroma),
        aacObjectType:n(d.config?.esds?.audioSpecificConfig?.objectType),aacFrequencyIndex:n(d.config?.esds?.audioSpecificConfig?.freqIndex),aacChannelConfig:n(d.config?.esds?.audioSpecificConfig?.channelConfig),
        colorMetadataPresent:d.config?.colr?.present===true,sampleAspectRatioPresent:d.config?.pasp?.present===true,configPresent:Boolean(d.config&&Object.keys(d.config).length)}))})),
    limitations:['structural-metadata-only','sample-tables-packets-unread','parameter-sets-color-hdr-vfr-subtitles-unqualified','edit-lists-data-references-unparsed','decoder-capability-unproven']};
}

export function createCorpusTracksProbe(runtime,dependencies={}){
  const inventory=dependencies.inventoryRunner??runAuthenticatedRootInventory,select=dependencies.selector??selectRiskRepresentatives,compare=dependencies.compareInventory??summarizeRepeatedInventory;
  let live=runtime,context=runtime?.privateContext?{...runtime.privateContext}:null,prior=runtime?.priorEvidence??null,owner=null,promise=null,started=false,done=false,timer=null,activeFile=null,runStarted=0,reserve=null;
  const metadataOnly=runtime?.mode==='metadata-only',cohortNumber=runtime?.deeperOptions?.cohort??1;runtime=null;
  const abort=new AbortController(),tasks=new Set();let cleanupFailure=null;
  const result={schema:'drive-original.rc16-corpus-tracks-summary/1',version:VERSION,scope:'canonical-risk-selected-bounded-structural-tracks',mode:metadataOnly?'metadata-only':'probe',completeMeaning:metadataOnly?'metadata-before-after-envelopes-only':'bounded-current-cohort-structural-metadata-not-library-playback',wholeCorpusComplete:false,inventoryDenominators:[],probeDenominators:null,complete:false,phase:'not-started',failure:null,failureDiagnostic:null,selectionStage:null,
    inventoryRuns:0,catalogStable:false,catalogComparison:null,metadataRequests:0,metadataBytes:0,mediaRequests:0,mediaBytes:0,plan:null,files:[],decoded:0,playback:0,physicalDevice:0,writeRequests:0,genericUpstreamCleanup:'unknown',released:false,representativeReferences:[],stratumCoverage:null,reserve:null,metadataDiagnostic:{completed:0,failed:0,maxResponseBytes:0,routeCounts:{about:0,list:0,file:0},lastFailure:null,lastCleanupFailure:null}};
  const safe=()=>JSON.parse(JSON.stringify(result));
  const stop=code=>{if(!abort.signal.aborted)abort.abort(fail(code));};
  const onHide=()=>stop('CANCELLED');
  const onAccountAbort=()=>stop('OWNER_CHANGED');
  const inspect=()=>{const s=live?.readState?.(),sw=live?.getSWIdentity?.(),controller=live?.navigator?.serviceWorker?.controller;
    if(!s||live.appVersion!==VERSION||live.getMutationsEnabled()!==false||live.top!==live.self||live.location?.origin!==ORIGIN||live.navigator?.onLine!==true
      ||live.document?.visibilityState!=='visible'||sw?.controller!==controller||sw?.version!==VERSION||sw.sourceCommit!==BINDING.sourceCommit||['app.js','sw.js','version.json'].some(k=>sw.sourceSHA256?.[k]!==BINDING.sourceSHA256[k])||controller?.state!=='activated'||new URL(controller.scriptURL).origin!==ORIGIN||new URL(controller.scriptURL).pathname!=='/sw.js'
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
    const task=metadata(urlValue,options);tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));return task;
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
      const body=new Uint8Array(bytes);let p=0;for(const x of chunks){body.set(x,p);p+=x.length;}stage='decode-json';const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));body.fill(0);current();result.metadataDiagnostic.completed++;result.metadataDiagnostic.maxResponseBytes=Math.max(result.metadataDiagnostic.maxResponseBytes,bytes);return {ok:true,status:200,json:async()=>data};
    }catch(e){result.metadataDiagnostic.failed++;result.metadataDiagnostic.lastFailure={...diag,stage,status,receivedBytes:bytes,runReceivedBytes:result.metadataBytes,code:fixed(e),errorKind:errorKind(e),abortSource,childAborted:child.signal.aborted,bodyFinished:finished};throw e;}finally{
      clearTimeout(deadline);for(const [s,f] of links)s.removeEventListener('abort',f);child.abort(fail('CANCELLED'));
      if(!finished){const cleanupStage=reader?'reader-cancel':response?'response-body-cancel':pending?'late-response-cancel':'no-body';let nativeCleanupError='unknown';try{const cancellation=reader?Promise.resolve().then(()=>reader.cancel()):response?Promise.resolve().then(()=>response.body?.cancel()):pending?pending.then(r=>r.body?.cancel(),()=>undefined):Promise.resolve();await drain(cancellation.catch(e=>{nativeCleanupError=errorKind(e);throw e;}));}catch(e){result.metadataDiagnostic.lastCleanupFailure={...diag,cleanupStage,nativeErrorKind:nativeCleanupError,code:e?.code==='CLEANUP_TIMEOUT'?'CLEANUP_TIMEOUT':'CLEANUP_FAILED',originalTrigger:result.metadataDiagnostic.lastFailure?.ordinal===diag.ordinal?result.metadataDiagnostic.lastFailure.code:null,childAborted:child.signal.aborted};throw e;}}
      try{reader?.releaseLock();}catch{}chunks.length=0;
    }
  }
  async function readInventory(){current();const r=await inventory({driveFetch:metadataFetch,rootId:context.rootId,priorityFileId:context.priorityFileId,expectedAccountKey:context.accountKey});current();
    if(r?.report?.completeness?.repeatedPrivateInventoryMatched!==true||r.report.completeness.shortcutClassificationComplete!==true||r.report.completeness.containmentComplete!==true||!r.privatePasses?.secondPass)throw fail('INVENTORY_FAILED');const denominators=summarizeInventoryDenominators(r.report);result.inventoryRuns++;result.inventoryDenominators.push({inventoryOrdinal:result.inventoryRuns,phase:result.phase,cumulativeMetadataRequests:result.metadataRequests,cumulativeMetadataBytes:result.metadataBytes,...denominators});return r;}
  async function probeFile(item,index){
    current();let resourceKey=item.resourceKey,observedKey,content=null;const budget=createBatchBudget(CAPS.mediaBytes);
    const identity=async({phase,signal})=>{current();const url=new URL(`https://www.googleapis.com/drive/v3/files/${item.expected.fileId}`);url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields',fieldNames);
      const value=await(await metadataFetch(url.href,{signal,responseLimitBytes:32768,requestMs:10000,headers:resourceKey?{'X-Goog-Drive-Resource-Keys':`${item.expected.fileId}/${resourceKey}`}:{}})).json();current();
      const next=normalizeProbeIdentity({accountKey:owner.values.authAccountKey,fileId:value.id,version:value.version,size:value.size,modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload});
      const key=value.resourceKey??null,nextContent={headRevisionId:value.headRevisionId??null,sha256Checksum:value.sha256Checksum??null};
      if(!same(next,item.expected)||value.trashed!==false||(key!==null&&!validId(key))||(resourceKey&&key!==resourceKey)||(phase==='postflight'&&key!==observedKey)
        ||(content&&Object.keys(content).some(k=>content[k]!==nextContent[k])))throw fail('IDENTITY_MISMATCH');
      if(phase==='preflight'){observedKey=key;resourceKey=key;content=nextContent;}return next;};
    const output={sample:`sample-${index+1}`,representative:item.reference,group:item.group,kind:'unknown',complete:false,failure:null,identityPreflight:false,identityPostflight:false,mediaRequests:0,mediaBytes:0,tracks:null};
    const job=runBoundedProbe({expectedIdentity:item.expected,generation:owner.values.driveSessionGeneration,signal:abort.signal,batchBudget:budget,
      isGenerationCurrent:()=>{try{current();return true;}catch{return false;}},limits:{requestBytes:1024*1024,fileBytes:CAPS.mediaBytes,fileRequests:64,batchBytes:CAPS.mediaBytes,headersMs:10000,bodyNoProgressMs:10000,fileMs:50000},getIdentity:identity,
      readRange:({range,start,end,signal})=>{current();if(start===0&&end===Number(item.expected.size)-1)throw fail('INVALID_RANGE');const url=new URL(`/__drive_media/${item.expected.fileId}`,live.location.href);url.searchParams.set('accountGeneration',String(owner.values.driveSessionGeneration));url.searchParams.set('mediaSession',String(owner.values.mediaSession));url.searchParams.set('size',item.expected.size);if(resourceKey)url.searchParams.set('resourceKey',resourceKey);
        return live.nativeFetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});},
      probe:async({read,sniffMagic,signal})=>{
        const size=Number(item.expected.size);if(size<=940)return {code:'SMALL_FILE_SKIPPED'};const prefix=await read({start:0,end:939});current();const kind=sniffMagic(prefix).kind;
        output.kind=['iso-bmff','mpeg-ts','webm','matroska','ebml','avi','bmp','gif','webp','png','jpeg','unknown','error-payload'].includes(kind)?kind:'unknown';
        const part=async({start,end})=>{const a=Number(start),b=Number(end);if(b<940)return prefix.slice(a,b+1);if(a<940){const tail=await read({start:940,end:b}),out=new Uint8Array(b-a+1);out.set(prefix.subarray(a));out.set(tail,940-a);return out;}return read({start:a,end:b});};
        if(kind==='iso-bmff'){
          const scan=await scanIsoBmffTopLevel({size:item.expected.size,signal,read:part,limits:{maxRequests:56,maxHeaderBytes:4096,maxBoxes:56}});current();if(scan.status!=='complete'||scan.observations.moov.length!==1)return {code:'ISO_HEADER_INCOMPLETE'};
          const sparse=await readSparseMoov({box:scan.observations.moov[0],fileSize:item.expected.size,read:part,signal,checkCurrent:current});current();if(sparse.status!=='complete')return {code:/^SPARSE_[A-Z_]+$/.test(sparse.code??'')?sparse.code:'ISO_SPARSE_INCOMPLETE'};
          try{output.tracks=safeIso(parseMoov(sparse.bytes));}finally{sparse.bytes.fill(0);}return {code:output.tracks.status==='parsed'?'STRUCTURAL_METADATA':'ISO_PARSER_INCOMPLETE'};
        }
        if(['webm','matroska','ebml'].includes(kind)){output.tracks=await readEbmlTracks({read:part,size,prefix,signal});current();return {code:output.tracks.status==='parsed'?'STRUCTURAL_METADATA':output.tracks.code};}
        // Metadata-directed unknowns get only one prefix; known TS is never parsed again.
        return {code:kind==='mpeg-ts'?'TS_DEFERRED_NO_CONTINUATION':kind==='unknown'?'UNKNOWN_SIGNATURE':'SIGNATURE_ONLY'};
      }});
    activeFile=job;const checked=await job;activeFile=null;output.identityPreflight=checked.identity.preflight;output.identityPostflight=checked.identity.postflight;output.mediaRequests=checked.metrics.requests;output.mediaBytes=budget.receivedBytes;result.mediaRequests+=output.mediaRequests;result.mediaBytes+=output.mediaBytes;
    output.failure=checked.ok?(checked.evidence.code==='STRUCTURAL_METADATA'||checked.evidence.code==='SIGNATURE_ONLY'?null:checked.evidence.code):checked.failure.code;output.complete=checked.ok&&output.failure===null;
    if(!checked.ok)throw Object.assign(fail(checked.failure.code),{safeFile:output});current();return output;
  }
  async function execute(){let first=null,last=null,plan=null;try{
    // D-050/D-068 admit bounded read-only probe mode after the maintained fences.
    const before=inspect();owner={...before,values:Object.fromEntries(['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(k=>[k,before.state[k]]))};
    if(!context||!validId(context.rootId)||!validId(context.priorityFileId)||context.accountKey!==owner.values.accountId||context.generation!==owner.values.driveSessionGeneration)throw fail('RUNTIME_REJECTED');
    context.authAccountKey=owner.values.authAccountKey;current();runStarted=performance.now();timer=setTimeout(()=>stop('RUN_TIMEOUT'),CAPS.runMs);live.addEventListener?.('pagehide',onHide,{once:true});live.addEventListener?.('beforeunload',onHide,{once:true});owner.values.accountStateAbortController.signal.addEventListener('abort',onAccountAbort,{once:true});
    result.phase='inventory-before';first=await readInventory();const priority=first.privatePasses.secondPass.items.find(x=>x.id===context.priorityFileId);if(!priority?.version)throw fail('SELECTION_FAILED');context.priorityVersion=String(priority.version);
    result.phase='selection';result.selectionStage='selection-select';const selected=select({pass:first.privatePasses.secondPass,priorityFileId:context.priorityFileId,expectedPriorityVersion:context.priorityVersion});if(prior!==null)throw fail('SELECTION_FAILED');
    result.selectionStage='selection-plan';plan=planDeepCohorts(selected,context,cohortNumber);
    result.selectionStage='selection-references';result.representativeReferences=safeReferences(selected);result.stratumCoverage=plan.stratumCoverage;
    result.selectionStage='selection-witness';dependencies.selectionWitness?.(selected,first.privatePasses.secondPass);result.plan=plan.summary;
    result.selectionStage='selection-denominators';result.probeDenominators=summarizeProbeDenominators({inventory:result.inventoryDenominators[0],representatives:plan.summary.representatives,candidateTracks:plan.plan.length});
    result.selectionStage='selection-owner-check';current();result.selectionStage=null;
    reserve={requests:Math.min(CAPS.metadataRequests,Math.ceil(result.metadataRequests*1.25)+4),bytes:Math.min(CAPS.metadataBytes,Math.ceil(result.metadataBytes*1.25)+65536),ms:Math.max(30000,Math.ceil((performance.now()-runStarted)*1.25))};result.reserve={...reserve,basis:'observed-first-two-pass-envelope-times1.25-plus-margins',guaranteed:false};
    result.phase='probe';if(!metadataOnly)for(let i=0;i<plan.plan.length;i++){if(result.metadataRequests+2+reserve.requests>CAPS.metadataRequests||result.metadataBytes+65536+reserve.bytes>CAPS.metadataBytes||performance.now()-runStarted+CAPS.fileMs+reserve.ms>=CAPS.runMs){result.stratumCoverage.budgetDeferred=plan.plan.length-i;break;}try{result.files.push(await probeFile(plan.plan[i],i));}catch(e){if(e.safeFile)result.files.push(e.safeFile);throw e;}}
    result.phase='inventory-after';last=await readInventory();try{compare({firstPass:first.privatePasses.secondPass,secondPass:last.privatePasses.secondPass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId});}catch(cause){
      try{result.catalogComparison=sanitizeComparisonDiagnostic(diagnoseComparisonFailure(cause,first.privatePasses.secondPass,last.privatePasses.secondPass,dependencies.canonicalNormalizers),cause);}catch{result.catalogComparison=emptyComparisonDiagnostic(cause);}throw fail('CATALOG_DRIFT');}
    current();result.catalogStable=true;result.complete=metadataOnly||(result.files.length>0&&result.files.length===plan.plan.length&&result.files.every(f=>f.complete));result.phase='done';
  }catch(e){const cause=abort.signal.aborted?abort.signal.reason:e;result.failureDiagnostic=sanitizeFailureDiagnostic(cause,result.selectionStage||result.phase);result.failure=fixed(cause);result.complete=false;result.phase='failed';}
  finally{
    stop(result.failure??'CANCELLED');clearTimeout(timer);live?.removeEventListener?.('pagehide',onHide);live?.removeEventListener?.('beforeunload',onHide);
    owner?.values.accountStateAbortController.signal.removeEventListener('abort',onAccountAbort);
    if(tasks.size)try{await drain(Promise.allSettled([...tasks]));}catch{}if(cleanupFailure){result.failure=cleanupFailure;result.complete=false;result.phase='failed';}
    if(result.probeDenominators&&plan){const observed=result.files.filter(f=>f.identityPreflight&&f.mediaRequests>0),videos=observed.filter(f=>plan.plan.find(p=>p.reference===f.representative)?.expected.mimeType.startsWith('video/')).length;Object.assign(result.probeDenominators,{scheduledPrefixReads:metadataOnly?0:plan.plan.length,scheduledTrackReads:metadataOnly?0:plan.plan.filter(p=>['iso-metadata','ebml'].includes(p.group)).length,probedClassifiedObjects:observed.length,probedVideoObjects:videos,probedRepresentatives:observed.length,unprobedClassifiedObjects:result.probeDenominators.classifiedObjects-observed.length,unprobedVideoObjects:result.probeDenominators.metadataVideoObjects-videos,unprobedRepresentatives:result.probeDenominators.metadataRepresentatives-observed.length,denominatorScope:metadataOnly?'metadata-only-current-run-no-prior-body-evidence-admitted':'bounded-current-cohort-body-observations-no-prior-body-evidence-admitted'});}
    first=null;last=null;plan=null;context=null;prior=null;owner=null;live=null;activeFile=null;result.released=true;done=true;
  }return safe();}
  return Object.freeze({run(){if(!started){started=true;promise=execute();}return promise;},cancel(){stop('CANCELLED');return {cancelled:true};},poll(){return {started,done,phase:result.phase,metadataRequests:result.metadataRequests,metadataBytes:result.metadataBytes,mediaRequests:result.mediaRequests,mediaBytes:result.mediaBytes,processed:result.files.length,summary:done?safe():null};}});
}
