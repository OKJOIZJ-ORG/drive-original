import { createMetadataCatalogComparison } from '../v2-07a-current-corpus-probe/metadata-catalog-driver.mjs';
import { runAuthenticatedRootInventory } from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import { selectRiskRepresentatives } from '../v2-07a-representative-selection/representative-selector.mjs';
import { runBoundedProbe, createBatchBudget, normalizeProbeIdentity, FAILURE_CODES } from '../v2-07a-bounded-probe/bounded-probe.mjs';
import { scanIsoBmffTopLevel } from '../v2-07a-isobmff-index/isobmff-index.mjs';

export const VERSION = '1.22.0-rc.11';
export const CAPS = Object.freeze({ files:38, mediaRequests:76, mediaBytes:39816, dispatches:512, runMs:600000 });
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value);
const fail = code => Object.assign(new Error(code), {code});
const codes = new Set([...FAILURE_CODES,'SELECTION_FAILED','OWNER_CHANGED','REQUEST_LIMIT','CANCELLED','RUN_TIMEOUT','RUNTIME_REJECTED']);
const scannerCodes = new Set(['EOF','INVALID_SIZE','INVALID_LIMITS','INVALID_ARGUMENT','ABORTED','REQUEST_LIMIT','HEADER_BYTE_LIMIT','READER_FAILURE','INVALID_READER_RESULT','READ_LENGTH_MISMATCH','BOX_LIMIT','TRUNCATED_BASE_HEADER','TRUNCATED_EXTENDED_HEADER','BOX_SMALLER_THAN_HEADER','BOX_END_OVERFLOW','BOX_BEYOND_EOF']);
const identityKeys = ['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'];
const fileLimits = Object.freeze({requestBytes:940,fileBytes:5036,fileRequests:39,batchBytes:39816,headersMs:10000,bodyNoProgressMs:15000,fileMs:60000});

// The maintained metadata driver is bundled privately with an explicit rc11 VERSION
// binding. This leaf adds only the first inventory's read-only body discriminator.
export function createFirstIsoProbe(runtime, dependencies={}) {
  const driverFactory = dependencies.metadataDriverFactory ?? createMetadataCatalogComparison;
  const inventory = dependencies.inventoryRunner ?? runAuthenticatedRootInventory;
  const selector = dependencies.selector ?? selectRiskRepresentatives;
  const scanner = dependencies.scanner ?? scanIsoBmffTopLevel;
  let live=runtime, context=runtime?.privateContext?{...runtime.privateContext}:null;
  const abort=new AbortController(), budget=createBatchBudget(CAPS.mediaBytes);
  let claimed=false, promise=null, driver=null, active=true, timer=null, inventoryCount=0, bodyFailure=null;
  let summary={schema:'drive-original.v2-07a-first-iso-rc11/1',version:VERSION,scope:'first-iso-top-level-only',
    preflightAccepted:false,freshSWRuntimeVersionVerified:false,selected:0,routed:0,skippedSmall:0,
    isoFound:false,isoHeadersComplete:false,iso:null,mediaRequests:0,receivedBytes:0,dispatches:0,
    metadataReceivedBytes:0,catalogStable:false,catalogComparison:null,complete:false,failure:null,released:false,
    tracksParsed:false,codecsParsed:false,containerValidityProven:false,decoded:0,playback:0,physicalDevicePlayback:0,
    nativeQ1RetirementProven:false,genericUpstreamCleanup:'unknown'};
  const safe = () => JSON.parse(JSON.stringify(summary));
  const stop = code => {if(!abort.signal.aborted)abort.abort(fail(code));};
  const hide = () => {stop('CANCELLED');driver?.cancel();};
  let controller=null, state=null, values=null, source=null, retirement=null;
  function current() {
    if(!active||abort.signal.aborted)throw abort.signal.reason??fail('OWNER_CHANGED');
    const now=live.readState(), proof=live.getSWIdentity?.();
    if(live.appVersion!==VERSION||live.getMutationsEnabled()!==false||live.getQ1Playback()!==null
      ||live.getPlayerMediaPriorityActive()!==false||live.getMediaSourceGeneration()!==source
      ||live.getQ1RetirementResult()!==retirement||retirement?.settled!==true
      ||now!==state||live.navigator.serviceWorker.controller!==controller||controller?.state!=='activated'
      ||proof?.controller!==controller||proof?.version!==VERSION
      ||now.selected!==null||now.mediaAttempt!=='idle'||now.mediaAbortController!==null
      ||now.pendingOriginalBuffer!==null||now.pendingPlay!==false||now.mediaTransportStarted!==false
      ||Object.keys(values).some(key=>now[key]!==values[key]))throw fail('OWNER_CHANGED');
  }
  function totalGuard() {
    current();if((driver?.progress().dispatches??0)+summary.mediaRequests>=CAPS.dispatches)throw fail('REQUEST_LIMIT');
  }
  function rowsFrom(selection) {
    const manifest=selection?.privateManifest,c=selection?.report?.coverage,m=selection?.report?.selection;
    if(manifest?.schema!=='drive-original.v2-07a-risk-selection-private/1'||!Array.isArray(manifest.selected)
      ||manifest.selected.length<1||manifest.selected.length>CAPS.files
      ||manifest.prioritySample?.fileId!==context.priorityFileId||manifest.prioritySample?.version!==context.priorityVersion
      ||!Number.isSafeInteger(c?.requiredCategoryCount)||c.coveredCategoryCount!==c.requiredCategoryCount||c.uncoveredCategoryCount!==0
      ||m?.prioritySampleSelected!==true||m.allRareMkvAviBmpSelected!==true||m.allGe4GiBSelected!==true)throw fail('SELECTION_FAILED');
    const seen=new Set();
    const rows=manifest.selected.map(row=>{
      if(!id(row.fileId)||seen.has(row.fileId)||!Array.isArray(row.visibleReferences)||!row.visibleReferences.length)throw fail('SELECTION_FAILED');
      seen.add(row.fileId);const keys=new Set();
      for(const ref of row.visibleReferences){if(!id(ref.fileId)||(ref.resourceKey!==null&&!id(ref.resourceKey)))throw fail('SELECTION_FAILED');if(ref.resourceKey)keys.add(ref.resourceKey);}
      if(keys.size>1)throw fail('SELECTION_FAILED');
      const expected=normalizeProbeIdentity({accountKey:context.accountKey,fileId:row.fileId,version:row.version,size:row.size,
        modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});
      if(BigInt(expected.size)>BigInt(Number.MAX_SAFE_INTEGER))throw fail('SELECTION_FAILED');
      return {expected,resourceKey:[...keys][0]??null,observedKey:undefined,reasons:row.mandatoryReasons??[]};
    });
    if(!rows.some(row=>row.expected.fileId===context.priorityFileId&&row.expected.version===context.priorityVersion))throw fail('SELECTION_FAILED');
    // This is a search-order hint only. Actual bytes alone authorize the ISO walker.
    const rank=row=>row.reasons.some(reason=>reason.startsWith('largest:'))?0:1;
    return rows.sort((a,b)=>rank(a)-rank(b)||a.expected.fileId.localeCompare(b.expected.fileId));
  }
  async function bodies(pass,driveFetch) {
    const priority=pass.items.find(item=>item.id===context.priorityFileId)
      ??pass.shortcutTargets?.find(([key])=>key===context.priorityFileId)?.[1];
    context.priorityVersion=String(priority?.version??'');
    const rows=rowsFrom(selector({pass,priorityFileId:context.priorityFileId,expectedPriorityVersion:context.priorityVersion}));
    summary.selected=rows.length;
    for(const row of rows) {
      current();
      const getIdentity=async({phase,signal})=>{
        totalGuard();const url=new URL(`https://www.googleapis.com/drive/v3/files/${row.expected.fileId}`);
        url.searchParams.set('supportsAllDrives','true');url.searchParams.set('fields','id,version,size,modifiedTime,mimeType,trashed,resourceKey,capabilities(canDownload)');
        const key=row.observedKey??row.resourceKey;
        const value=await (await driveFetch(url.href,{signal,headers:key?{'X-Goog-Drive-Resource-Keys':`${row.expected.fileId}/${key}`}:{}})).json();current();
        const observed=normalizeProbeIdentity({accountKey:context.accountKey,fileId:value.id,version:value.version,size:value.size,
          modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload});
        const resourceKey=value.resourceKey??null;
        if(value.trashed!==false||(resourceKey!==null&&!id(resourceKey))||identityKeys.some(key=>observed[key]!==row.expected[key])
          ||(row.resourceKey&&resourceKey!==row.resourceKey)||(phase==='postflight'&&resourceKey!==row.observedKey))throw fail('IDENTITY_MISMATCH');
        if(phase==='preflight')row.observedKey=resourceKey;return observed;
      };
      const result=await runBoundedProbe({expectedIdentity:row.expected,generation:context.generation,
        isGenerationCurrent:()=>{try{current();return true;}catch{return false;}},signal:abort.signal,batchBudget:budget,limits:fileLimits,getIdentity,
        readRange:({range,start,end,signal})=>{
          totalGuard();const size=Number(row.expected.size);
          if(end>=size-1||!((start===0&&end===939)||(start>=940&&end-start+1<=16)))throw fail('INVALID_RANGE');
          if(summary.mediaRequests>=CAPS.mediaRequests)throw fail('REQUEST_LIMIT');summary.mediaRequests++;
          const url=new URL(`/__drive_media/${row.expected.fileId}`,live.location.href);
          url.searchParams.set('accountGeneration',String(values.driveSessionGeneration));url.searchParams.set('mediaSession',String(values.mediaSession));
          url.searchParams.set('size',row.expected.size);if(row.observedKey)url.searchParams.set('resourceKey',row.observedKey);
          return live.nativeFetch(url.href,{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});
        },
        probe:async({read,sniffMagic})=>{
          if(BigInt(row.expected.size)<=940n)return {small:true};
          const prefix=await read({start:0,end:939});current();
          if(sniffMagic(prefix).kind!=='iso-bmff')return {iso:false};
          let eofHeaderSkipped=false;
          const parsed=await scanner({size:row.expected.size,signal:abort.signal,limits:{maxRequests:38,maxHeaderBytes:4096},
            read:async({start,end})=>{
              current();const a=Number(start),b=Number(end);
              if(end>=BigInt(row.expected.size)-1n){eofHeaderSkipped=true;throw fail('INVALID_RANGE');}
              if(b<940)return prefix.slice(a,b+1);
              if(a<940){const tail=await read({start:940,end:b});const bytes=new Uint8Array(b-a+1);bytes.set(prefix.subarray(a),0);bytes.set(tail,940-a);return bytes;}
              return read({start:a,end:b});
            }});current();
          return {iso:true,parsed,eofHeaderSkipped};
        }});
      summary.receivedBytes=budget.receivedBytes;
      if(!result.ok)throw fail(codes.has(result.failure?.code)?result.failure.code:'PROBE_FAILED');
      current();
      if(result.evidence.small){summary.skippedSmall++;continue;}
      summary.routed++;
      if(result.evidence.iso){
        const p=result.evidence.parsed;
        if(!scannerCodes.has(p?.code)||!['complete','incomplete'].includes(p.status))throw fail('PROBE_FAILED');
        summary.isoFound=true;summary.isoHeadersComplete=p.status==='complete';
        summary.iso={status:p.status,code:p.code,eofHeaderSkipped:result.evidence.eofHeaderSkipped,boxes:p.metrics.boxes,headerRequests:p.metrics.requests,
          headerBytes:p.metrics.receivedHeaderBytes,ftyp:p.observations.ftypHeaderObserved,styp:p.observations.stypHeaderObserved,
          moof:p.observations.moofHeaderObserved,moovCount:p.observations.moov.length,
          moovBeforeMdat:p.observations.moov.some(box=>box.relativeToFirstObservedMdat==='before'),
          moovAfterMdat:p.observations.moov.some(box=>box.relativeToFirstObservedMdat==='after'),
          moovWithoutObservedMdat:p.observations.moov.some(box=>box.relativeToFirstObservedMdat==='no-mdat-observed')};
        break;
      }
    }
  }
  async function execute() {
    let report;
    try {
      if(!live||live.appVersion!==VERSION||!context||!id(context.rootId)||!id(context.priorityFileId))throw fail('RUNTIME_REJECTED');
      state=live.readState();controller=live.navigator.serviceWorker.controller;source=live.getMediaSourceGeneration();retirement=live.getQ1RetirementResult();
      values=Object.fromEntries(['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(key=>[key,state[key]]));
      current();summary.freshSWRuntimeVersionVerified=true;
      timer=setTimeout(()=>{stop('RUN_TIMEOUT');driver?.cancel();},CAPS.runMs);
      live.addEventListener?.('pagehide',hide,{once:true});live.addEventListener?.('beforeunload',hide,{once:true});
      driver=driverFactory(live,{...dependencies,inventoryRunner:async(args)=>{
        summary.preflightAccepted=true;
        const driveFetch=(url,options)=>{totalGuard();return args.driveFetch(url,options);};
        const result=await inventory({...args,driveFetch});current();
        if(inventoryCount++===0){
          if(result?.report?.completeness?.repeatedPrivateInventoryMatched!==true||result.report.completeness.shortcutClassificationComplete!==true)throw fail('SELECTION_FAILED');
          try {await bodies(result.privatePasses.secondPass,driveFetch);}
          catch(cause){bodyFailure=codes.has(cause?.code)?cause.code:'PROBE_FAILED';throw cause;}
        }
        return result;
      }});
      report=await driver.run();
      summary.dispatches=report.dispatches+summary.mediaRequests;summary.metadataReceivedBytes=report.metadataReceivedBytes;
      summary.catalogStable=report.catalogStable;summary.catalogComparison=report.catalogComparison;
      summary.failure=bodyFailure??report.failure;summary.complete=report.complete&&summary.isoFound&&summary.isoHeadersComplete;
    } catch(cause) {
      summary.failure=codes.has(cause?.code)?cause.code:'RUNTIME_REJECTED';
    } finally {
      active=false;stop('CANCELLED');clearTimeout(timer);
      const progress=driver?.progress();if(progress){summary.dispatches=progress.dispatches+summary.mediaRequests;summary.metadataReceivedBytes=progress.metadataReceivedBytes;}
      live?.removeEventListener?.('pagehide',hide);live?.removeEventListener?.('beforeunload',hide);
      summary.receivedBytes=budget.receivedBytes;summary.released=true;
      live=null;context=null;state=null;controller=null;values=null;retirement=null;
    }
    return safe();
  }
  return Object.freeze({run(){if(!claimed){claimed=true;promise=execute();}return promise;},
    cancel(){stop('CANCELLED');driver?.cancel();if(!claimed){claimed=true;promise=execute();}return {cancelled:true};},
    progress(){const p=driver?.progress();return {claimed,done:summary.released,selected:summary.selected,routed:summary.routed,
      mediaRequests:summary.mediaRequests,receivedBytes:budget.receivedBytes,dispatches:(p?.dispatches??0)+summary.mediaRequests};},
    done(){return {done:summary.released,summary:summary.released?safe():null};}});
}
