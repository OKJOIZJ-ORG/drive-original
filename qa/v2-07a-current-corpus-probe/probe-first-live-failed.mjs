import { runAuthenticatedRootInventory } from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import { summarizeRepeatedInventory } from '../v2-07a-root-inventory/root-inventory.mjs';
import { selectRiskRepresentatives } from '../v2-07a-representative-selection/representative-selector.mjs';
import { runBoundedProbe, createBatchBudget, normalizeProbeIdentity, FAILURE_CODES } from '../v2-07a-bounded-probe/bounded-probe.mjs';
import { probeMpegTs } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';
import { summarizeMpegTs, TS_OUTCOMES } from './ts-summary.mjs';

export const ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
export const VERSION = '1.22.0-rc.10';
export const CAPS = Object.freeze({ files: 38, mediaRequests: 76, mediaBytes: 2490368, dispatches: 512, runMs: 600000, metadataResponseBytes:2097152, metadataBytes:67108864 });
const ROUTES = ['iso-bmff','mpeg-ts','webm','matroska','ebml','avi','webp','bmp','jpeg','png','gif','error-payload','unknown'];
const OUTCOMES = TS_OUTCOMES;
const CODES = new Set([...FAILURE_CODES, 'RUNTIME_REJECTED','OWNER_CHANGED','INVENTORY_FAILED','SELECTION_FAILED','METADATA_FAILED','CATALOG_DRIFT','REQUEST_LIMIT','RUN_TIMEOUT','CANCELLED','PARSER_FAILED']);
const TS_LIMITS = Object.freeze({ maxBytes:65536, maxPackets:348, maxResyncBytes:1504, maxSectionBytes:1024, maxSections:128, maxPrograms:64, maxStreamsPerProgram:64, maxTotalStreams:128, maxElementaryBytesPerStream:32768, maxIssues:64 });
const LIMITS = Object.freeze({requestBytes:65536,fileBytes:65536,fileRequests:2,batchBytes:CAPS.mediaBytes,headersMs:10000,bodyNoProgressMs:15000,fileMs:60000});
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value);
const count = keys => Object.fromEntries(keys.map(key => [key,0]));
const error = code => Object.assign(new Error(code), {code});
const fixedCode = value => CODES.has(value?.code) ? value.code : 'METADATA_FAILED';
const identityKeys = ['accountKey','fileId','version','size','modifiedTime','mimeType','canDownload'];
function tsEvidenceCounts() {
  return {videoSignalling:count(['none','target-only','other-only','mixed']),audioSignalling:count(['none','target-only','other-only','mixed']),
    videoProfileEvidence:count(['not-applicable','target-confirmed','other-parsed','inconclusive']),
    videoFormatEvidence:count(['not-applicable','target-confirmed','other-parsed','inconclusive']),
    audioProfileEvidence:count(['not-applicable','target-confirmed','other-parsed','inconclusive'])};
}

// All exported data comes from this fixed aggregate, never parser/metadata rows.
function emptySummary() {
  return {schema:'drive-original.v2-07a-current-corpus-aggregate/1',version:VERSION,complete:false,
    failure:null,selected:0,processed:0,skippedSmall:0,tsPrefixOnly:0,routes:count(ROUTES),
    tsOutcomes:count(OUTCOMES),tsPrograms:0,tsStreams:0,tsEvidence:tsEvidenceCounts(),priorityTsEvidence:tsEvidenceCounts(),videoSignalling:count(['h264','hevc','other']),
    audioSignalling:count(['aac','other']),dispatches:0,mediaRequests:0,receivedBytes:0,metadataReceivedBytes:0,
    catalogStable:false,released:false,nativeQ1RetirementProven:false,
    genericUpstreamCleanup:'unknown',decoded:0,physicalDevicePlayback:0};
}

export function createCurrentCorpusProbe(runtime, dependencies = {}) {
  const inventoryRunner = dependencies.inventoryRunner ?? runAuthenticatedRootInventory;
  const selector = dependencies.selector ?? selectRiskRepresentatives;
  const compare = dependencies.compareInventory ?? summarizeRepeatedInventory;
  const parser = dependencies.parser ?? probeMpegTs;
  const metadataTimeoutMs = Math.min(25000,Math.max(1,dependencies.metadataTimeoutMs ?? 25000));
  const setMetadataTimeout = dependencies.setMetadataTimeoutFn ?? globalThis.setTimeout;
  const clearMetadataTimeout = dependencies.clearMetadataTimeoutFn ?? globalThis.clearTimeout;
  let live = runtime, context = runtime?.privateContext ? {...runtime.privateContext} : null;
  let claimed = false, released = false, promise = null, done = false;
  let timer = null, summary = emptySummary(), baseline = null;
  const lifetime = new AbortController();
  const stop = code => { if (!lifetime.signal.aborted) lifetime.abort(error(code)); };
  const onHide = () => stop('CANCELLED');
  const onAccountAbort = () => stop('OWNER_CHANGED');
  const safeSummary = () => JSON.parse(JSON.stringify(summary));
  function inspect() {
    const state = live?.readState?.(), sw = live?.getSWIdentity?.();
    const controller = live?.navigator?.serviceWorker?.controller;
    const href = new URL(live?.location?.href), script = new URL(controller?.scriptURL);
    if (live.appVersion !== VERSION || live.getMutationsEnabled() !== false || live.top !== live.self
      || href.origin !== ORIGIN || href.protocol !== 'https:' || live.navigator.onLine !== true
      || !controller || controller.state !== 'activated' || script.origin !== ORIGIN
      || script.pathname !== '/sw.js' || script.search || script.hash
      || sw?.controller !== controller || sw?.version !== VERSION
      || !state || !id(state.accountId) || !state.authAccountKey || !state.token
      || live.hasUsableToken() !== true || state.accountIdentityPending === true
      || state.authStatus !== 'online' || state.demo !== false || live.getPlayerMediaPriorityActive() !== false
      || !state.accountStateAbortController?.signal || state.accountStateAbortController.signal.aborted
      || state.selected !== null || state.mediaAttempt !== 'idle' || state.mediaAbortController !== null
      || state.pendingOriginalBuffer !== null || state.pendingPlay !== false || state.mediaTransportStarted !== false
      || live.getQ1Playback() !== null || live.getQ1RetirementResult()?.settled !== true
      || ['driveSessionGeneration','authGeneration','tokenRevision','mediaSession'].some(key => !Number.isSafeInteger(state[key]) || state[key]<0)
      || !Number.isSafeInteger(live.getMediaSourceGeneration()) || typeof live.nativeFetch !== 'function') throw error('RUNTIME_REJECTED');
    return {state,controller,href:href.href,script:script.href,retirement:live.getQ1RetirementResult(),source:live.getMediaSourceGeneration()};
  }
  function assertOwner() {
    if (lifetime.signal.aborted) throw lifetime.signal.reason;
    let now;
    try { now = inspect(); } catch { stop('OWNER_CHANGED'); throw error('OWNER_CHANGED'); }
    if (!baseline || now.state !== baseline.state || now.controller !== baseline.controller || now.href !== baseline.href
      || now.script !== baseline.script || now.retirement !== baseline.retirement || now.source !== baseline.source
      || Object.keys(baseline.values).some(key => now.state[key] !== baseline.values[key])) {
      stop('OWNER_CHANGED'); throw error('OWNER_CHANGED');
    }
  }
  function claim(media = false) {
    assertOwner();
    if (summary.dispatches >= CAPS.dispatches || (media && summary.mediaRequests >= CAPS.mediaRequests)) {
      stop('REQUEST_LIMIT'); throw error('REQUEST_LIMIT');
    }
    summary.dispatches++;
    if (media) summary.mediaRequests++;
  }
  async function raced(value, signal = lifetime.signal) {
    if (signal.aborted) throw signal.reason;
    let listener;
    const aborted = new Promise((_,reject) => { listener = () => reject(signal.reason); signal.addEventListener('abort',listener,{once:true}); });
    try { return await Promise.race([value,aborted]); } finally { signal.removeEventListener('abort',listener); }
  }
  async function metadataFetch(value, options = {}) {
    const url = new URL(value);
    const supplied = new Headers(options.headers || {});
    if (url.origin !== 'https://www.googleapis.com' || !url.pathname.startsWith('/drive/v3/')
      || url.searchParams.has('alt') || (options.method && options.method !== 'GET') || options.body !== undefined
      || [...supplied.keys()].some(key => key !== 'x-goog-drive-resource-keys')) throw error('METADATA_FAILED');
    claim();
    supplied.set('Authorization',`Bearer ${baseline.values.token}`);
    const controller = new AbortController();
    const signals=[lifetime.signal,baseline.values.accountStateAbortController.signal,...(options.signal?[options.signal]:[])];
    const links=signals.map(signal=>{const listener=()=>controller.abort(signal.reason);if(signal.aborted)listener();else signal.addEventListener('abort',listener,{once:true});return {signal,listener};});
    const deadline=setMetadataTimeout(()=>controller.abort(error('METADATA_FAILED')),metadataTimeoutMs);
    let cleaned=false;
    const cleanup=()=>{if(cleaned)return;cleaned=true;clearMetadataTimeout(deadline);for(const {signal,listener} of links)signal.removeEventListener('abort',listener);};
    const signal = controller.signal;
    let pending;
    try { pending = live.nativeFetch(url.href,{method:'GET',headers:supplied,signal,cache:'no-store',redirect:'error',credentials:'omit',priority:'low'}); }
    catch(cause){cleanup();throw cause;}
    Promise.resolve(pending).then(response=>{if(signal.aborted) void Promise.resolve(response?.body?.cancel?.()).catch(()=>{});},()=>{});
    let response;
    try {response = await raced(pending,signal);assertOwner();if (!response?.ok) {await raced(Promise.resolve(response?.body?.cancel?.()),signal);throw error('METADATA_FAILED');}}
    catch(cause){cleanup();controller.abort(cause);throw cause;}
    let jsonClaimed = false;
    return {ok:true, json:async () => {
      if (jsonClaimed) throw error('METADATA_FAILED');
      jsonClaimed = true;
      try{assertOwner();}catch(cause){cleanup();controller.abort(cause);throw cause;}
      let reader;
      try {
        reader=response.body?.getReader?.();
        if(!reader)throw error('METADATA_FAILED');
      } catch(cause) {
        controller.abort(cause);
        try {
          const cancelled=Promise.resolve().then(()=>response.body?.cancel?.());
          cancelled.catch(()=>{});
          await raced(cancelled,signal).catch(()=>{});
        } finally {cleanup();}
        throw cause;
      }
      const chunks=[];let bytes=0,finished=false;
      try {
        while(true) {
          assertOwner();
          const chunk=await raced(reader.read(),signal);assertOwner();
          if(chunk.done){finished=true;break;}
          if(!(chunk.value instanceof Uint8Array))throw error('METADATA_FAILED');
          bytes+=chunk.value.byteLength;summary.metadataReceivedBytes+=chunk.value.byteLength;
          if(bytes>CAPS.metadataResponseBytes || summary.metadataReceivedBytes>CAPS.metadataBytes)throw error('METADATA_FAILED');
          chunks.push(chunk.value);
        }
        const body=new Uint8Array(bytes);let offset=0;
        for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
        const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));assertOwner();return result;
      } finally {
        if(!finished){const cancelled=Promise.resolve(reader.cancel());cancelled.catch(()=>{});await raced(cancelled,signal).catch(()=>{});}
        try{reader.releaseLock();}catch{}
        chunks.length=0;cleanup();controller.abort(error('CANCELLED'));
      }
    }};
  }
  async function readInventory() {
    assertOwner();
    try {
      const result = await raced(inventoryRunner({driveFetch:metadataFetch,rootId:context.rootId,
        priorityFileId:context.priorityFileId,expectedAccountKey:context.accountKey}));
      assertOwner();
      if (!result?.privatePasses?.secondPass || result.report?.completeness?.repeatedPrivateInventoryMatched !== true
        || result.report?.completeness?.shortcutClassificationComplete !== true) throw error('INVENTORY_FAILED');
      return result;
    } catch (cause) { if (lifetime.signal.aborted) throw lifetime.signal.reason; throw error(CODES.has(cause.code) ? cause.code : 'INVENTORY_FAILED'); }
  }
  function selectionRows(manifest) {
    if (manifest?.schema !== 'drive-original.v2-07a-risk-selection-private/1' || manifest.selected?.length !== CAPS.files
      || manifest.prioritySample?.fileId !== context.priorityFileId || manifest.prioritySample?.version !== context.priorityVersion) throw error('SELECTION_FAILED');
    const seen = new Set();
    const rows = manifest.selected.map(row => {
      if (!id(row.fileId) || seen.has(row.fileId) || !Array.isArray(row.visibleReferences) || !row.visibleReferences.length) throw error('SELECTION_FAILED');
      seen.add(row.fileId);
      const keys = new Set();
      for (const ref of row.visibleReferences) {
        if (!id(ref.fileId) || (ref.resourceKey !== null && !id(ref.resourceKey))) throw error('SELECTION_FAILED');
        if (ref.resourceKey) keys.add(ref.resourceKey);
      }
      if (keys.size > 1) throw error('SELECTION_FAILED');
      const expected = normalizeProbeIdentity({accountKey:context.accountKey,fileId:row.fileId,version:row.version,
        size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,canDownload:true});
      if (BigInt(expected.size) > BigInt(Number.MAX_SAFE_INTEGER)) throw error('SELECTION_FAILED');
      return {expected,resourceKey:[...keys][0] ?? null,observedResourceKey:undefined};
    });
    if (!rows.some(row => row.expected.fileId === context.priorityFileId && row.expected.version === context.priorityVersion)) throw error('SELECTION_FAILED');
    return rows;
  }
  async function identity(row, phase, signal) {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(row.expected.fileId)}`);
    url.searchParams.set('supportsAllDrives','true');
    url.searchParams.set('fields','id,version,size,modifiedTime,mimeType,capabilities(canDownload),trashed,resourceKey');
    const key = row.observedResourceKey ?? row.resourceKey;
    const response = await metadataFetch(url.href,{signal,headers:key ? {'X-Goog-Drive-Resource-Keys':`${row.expected.fileId}/${key}`} : {}});
    const value = await response.json();
    assertOwner();
    const observed = normalizeProbeIdentity({accountKey:context.accountKey,fileId:value.id,version:value.version,size:value.size,
      modifiedTime:value.modifiedTime,mimeType:value.mimeType,canDownload:value.capabilities?.canDownload});
    const resourceKey = value.resourceKey ?? null;
    if (value.trashed !== false || (resourceKey!==null && !id(resourceKey))
      || identityKeys.some(field => observed[field] !== row.expected[field])
      || (row.resourceKey && resourceKey !== row.resourceKey)
      || (phase==='postflight' && resourceKey !== row.observedResourceKey)) throw error('IDENTITY_MISMATCH');
    if (phase==='preflight') row.observedResourceKey = resourceKey;
    return observed;
  }
  function mediaUrl(row) {
    const url = new URL(`/__drive_media/${encodeURIComponent(row.expected.fileId)}`,ORIGIN);
    url.searchParams.set('accountGeneration',String(baseline.values.driveSessionGeneration));
    url.searchParams.set('mediaSession',String(baseline.values.mediaSession));
    url.searchParams.set('size',row.expected.size);
    if (row.observedResourceKey) url.searchParams.set('resourceKey',row.observedResourceKey);
    return url.href;
  }
  function aggregate(evidence,priority) {
    if (evidence.kind === 'skipped-small') { summary.skippedSmall++; return; }
    if (!ROUTES.includes(evidence.kind)) throw error('PARSER_FAILED');
    summary.routes[evidence.kind]++;
    if (evidence.kind !== 'mpeg-ts') return;
    if (evidence.prefixOnly) summary.tsPrefixOnly++;
    const parsed = evidence.parsed;
    if (!OUTCOMES.includes(parsed?.outcome?.code) || !Array.isArray(parsed.programs)) throw error('PARSER_FAILED');
    summary.tsOutcomes[parsed.outcome.code]++;
    const semantic=summarizeMpegTs(parsed);
    for(const key of Object.keys(summary.tsEvidence)){summary.tsEvidence[key][semantic[key]]++;if(priority)summary.priorityTsEvidence[key][semantic[key]]++;}
    summary.tsPrograms += parsed.programs.length;
    for (const program of parsed.programs) for (const stream of program.streams ?? []) {
      summary.tsStreams++;
      if (stream.kind==='video') summary.videoSignalling[['h264','hevc'].includes(stream.codec) ? stream.codec : 'other']++;
      if (stream.kind==='audio') summary.audioSignalling[stream.codec==='aac' ? 'aac' : 'other']++;
    }
  }
  async function execute() {
    let initial = null, final = null, rows = null;
    const budget = createBatchBudget(CAPS.mediaBytes);
    try {
      let current;
      try {current=inspect();}catch{throw error('RUNTIME_REJECTED');}
      baseline = {...current,values:Object.fromEntries(['accountId','authAccountKey','driveSessionGeneration','authGeneration','tokenRevision','token','expiresAt','mediaSession','accountStateAbortController'].map(key=>[key,current.state[key]]))};
      if (!context || !id(context.rootId) || !id(context.priorityFileId) || context.accountKey!==current.state.accountId
        || context.generation!==current.state.driveSessionGeneration) throw error('RUNTIME_REJECTED');
      assertOwner();
      timer = setTimeout(()=>stop('RUN_TIMEOUT'),CAPS.runMs);
      live.addEventListener?.('pagehide',onHide,{once:true}); live.addEventListener?.('beforeunload',onHide,{once:true});
      baseline.values.accountStateAbortController.signal.addEventListener('abort',onAccountAbort,{once:true});
      initial = await readInventory();
      const selected = selector({pass:initial.privatePasses.secondPass,priorityFileId:context.priorityFileId,expectedPriorityVersion:context.priorityVersion});
      rows = selectionRows(selected.privateManifest); summary.selected=rows.length;
      for (const row of rows) {
        assertOwner();
        const result = await runBoundedProbe({expectedIdentity:row.expected,generation:context.generation,
          isGenerationCurrent:()=>{try {assertOwner();return true;}catch{return false;}},signal:lifetime.signal,batchBudget:budget,limits:LIMITS,
          getIdentity:({phase,signal})=>identity(row,phase,signal),
          readRange:({range,signal,start,end})=>{
            if (end >= Number(row.expected.size)-1 || !((start===0 && end===939) || (start===940 && end===65535))) throw error('INVALID_RANGE');
            claim(true);
            return live.nativeFetch(mediaUrl(row),{method:'GET',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Range:range},signal,priority:'low'});
          },
          probe:async ({read,sniffMagic})=>{
            const size=BigInt(row.expected.size);
            if (size<=940n) return {kind:'skipped-small'};
            const prefix=await read({start:0,end:939});
            let kind=sniffMagic(prefix).kind;
            if (kind==='mpeg-ts' && ![0,188,376,564,752].every(offset=>prefix[offset]===0x47)) kind='unknown';
            if (kind!=='mpeg-ts') return {kind};
            let bytes=prefix;
            if (size>65536n) {
              const continuation=await read({start:940,end:65535});
              bytes=new Uint8Array(65536);bytes.set(prefix);bytes.set(continuation,940);
            }
            return {kind,prefixOnly:size<=65536n,parsed:parser(bytes,{limits:TS_LIMITS})};
          }});
        summary.receivedBytes=budget.receivedBytes;
        if (!result.ok) { summary.failure=fixedCode(lifetime.signal.aborted ? lifetime.signal.reason : result.failure); stop(summary.failure); break; }
        assertOwner(); aggregate(result.evidence,row.expected.fileId===context.priorityFileId); summary.processed++;
      }
      if (!summary.failure) {
        final=await readInventory();
        try { compare({firstPass:initial.privatePasses.secondPass,secondPass:final.privatePasses.secondPass,
          canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId}); } catch { throw error('CATALOG_DRIFT'); }
        assertOwner();summary.catalogStable=true;summary.complete=summary.processed===CAPS.files;
      }
    } catch (cause) { summary.failure=fixedCode(lifetime.signal.aborted ? lifetime.signal.reason : cause); }
    finally {
      summary.receivedBytes=budget.receivedBytes;
      if (!released) {
        released=true;stop(summary.failure ?? 'CANCELLED');clearTimeout(timer);
        live?.removeEventListener?.('pagehide',onHide);live?.removeEventListener?.('beforeunload',onHide);
        baseline?.values.accountStateAbortController?.signal.removeEventListener('abort',onAccountAbort);
        baseline=null;context=null;live=null;initial=null;final=null;rows=null;summary.released=true;
      }
      done=true;
    }
    return safeSummary();
  }
  return Object.freeze({
    run(){if (!claimed) {claimed=true;promise=execute();}return promise;},
    cancel(){stop('CANCELLED');if(!claimed){claimed=true;promise=execute();}return {cancelled:true};},
    progress(){return {claimed,done,processed:summary.processed,dispatches:summary.dispatches,mediaRequests:summary.mediaRequests,receivedBytes:summary.receivedBytes};},
    done(){return {done,summary:done?safeSummary():null};}
  });
}
