import { ORIGIN, VERSION, CAPS } from './probe.mjs';
import { runAuthenticatedRootInventory } from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import { summarizeRepeatedInventory } from '../v2-07a-root-inventory/root-inventory.mjs';
import { diagnoseComparisonFailure, emptyComparisonDiagnostic, sanitizeComparisonDiagnostic } from './comparison-diagnostics.mjs';

const OWNER_FIELDS=['accountId','authAccountKey','authGeneration','driveSessionGeneration','tokenRevision','token','expiresAt','accountStateAbortController'];
const CODES=new Set(['RUNTIME_REJECTED','OWNER_CHANGED','ABORTED','REQUEST_LIMIT','METADATA_FAILED','INVENTORY_FAILED','CATALOG_DRIFT','RUN_TIMEOUT']);
const fault=code=>Object.assign(new Error(code),{code});
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(value);

// This constructor has no media fetch, selection, mutation or SW runtime-version
// dependency. Its narrower claim is two current complete metadata inventories.
export function createMetadataCatalogComparison(runtime,dependencies={}) {
  const inventory=dependencies.inventoryRunner??runAuthenticatedRootInventory;
  const compare=dependencies.compareInventory??summarizeRepeatedInventory;
  const diagnose=dependencies.comparisonDiagnostics??((cause,a,b)=>diagnoseComparisonFailure(cause,a,b,dependencies.canonicalNormalizers));
  const requestMs=Math.min(25000,Math.max(1,dependencies.metadataTimeoutMs??25000));
  let live=runtime,context=runtime?.privateContext?{...runtime.privateContext}:null,owner=null;
  let claimed=false,promise=null,finished=false,timer=null;
  const lifetime=new AbortController();
  const result={schema:'drive-original.v2-07a-metadata-catalog-comparison/1',mode:'metadata-only-catalog-comparison',
    version:VERSION,complete:false,comparisonAttempted:false,catalogStable:false,catalogComparison:null,
    inventoryRunsCompleted:0,dispatches:0,metadataReceivedBytes:0,mediaRequests:0,writeRequests:0,released:false,
    activeControllerIdentityFenced:false,freshSWRuntimeVersionVerified:false,failure:null};
  const snapshot=()=>JSON.parse(JSON.stringify(result));
  const stop=code=>{if(!lifetime.signal.aborted)lifetime.abort(fault(code));};
  const onHide=()=>stop('ABORTED'),onAccount=()=>stop('OWNER_CHANGED');
  function current() {
    const state=live?.readState?.(),controller=live?.navigator?.serviceWorker?.controller;
    const location=new URL(live?.location?.href),script=new URL(controller?.scriptURL);
    if(live.appVersion!==VERSION||live.top!==live.self||location.origin!==ORIGIN||live.navigator.onLine!==true
      ||live.getMutationsEnabled()!==false||!controller||controller.state!=='activated'||script.origin!==ORIGIN
      ||script.pathname!=='/sw.js'||script.search||script.hash||!state||!safeId(state.accountId)||!state.authAccountKey
      ||state.authStatus!=='online'||state.demo!==false||state.accountIdentityPending===true||live.hasUsableToken()!==true
      ||!state.token||!state.accountStateAbortController?.signal||state.accountStateAbortController.signal.aborted
      ||['authGeneration','driveSessionGeneration','tokenRevision'].some(key=>!Number.isSafeInteger(state[key])||state[key]<0)
      ||typeof live.nativeFetch!=='function')throw fault('RUNTIME_REJECTED');
    return {state,controller,href:location.href,script:script.href};
  }
  function assertOwner() {
    if(lifetime.signal.aborted)throw lifetime.signal.reason;
    let now;try{now=current();}catch{stop('OWNER_CHANGED');throw fault('OWNER_CHANGED');}
    if(!owner||now.state!==owner.state||now.controller!==owner.controller||now.href!==owner.href||now.script!==owner.script
      ||OWNER_FIELDS.some(key=>now.state[key]!==owner.values[key])){stop('OWNER_CHANGED');throw fault('OWNER_CHANGED');}
  }
  async function race(value,signal) {
    if(signal.aborted)throw signal.reason;
    let listener;const aborted=new Promise((_,reject)=>{listener=()=>reject(signal.reason);signal.addEventListener('abort',listener,{once:true});});
    try{return await Promise.race([value,aborted]);}finally{signal.removeEventListener('abort',listener);}
  }
  async function metadataFetch(value,options={}) {
    assertOwner();
    const url=new URL(value),headers=new Headers(options.headers??{});
    if(url.origin!=='https://www.googleapis.com'||!/^\/drive\/v3\/(about|files(?:\/[A-Za-z0-9_-]+)?)$/.test(url.pathname)
      ||url.searchParams.has('alt')||options.body!==undefined||(options.method&&options.method!=='GET')
      ||[...headers.keys()].some(key=>key!=='x-goog-drive-resource-keys'))throw fault('METADATA_FAILED');
    if(result.dispatches>=CAPS.dispatches){stop('REQUEST_LIMIT');throw fault('REQUEST_LIMIT');}
    result.dispatches++;headers.set('Authorization',`Bearer ${owner.values.token}`);
    const controller=new AbortController(),signals=[lifetime.signal,owner.values.accountStateAbortController.signal,...(options.signal?[options.signal]:[])];
    const links=signals.map(signal=>{const callback=()=>controller.abort(signal.reason);if(signal.aborted)callback();else signal.addEventListener('abort',callback,{once:true});return {signal,callback};});
    const deadline=setTimeout(()=>controller.abort(fault('METADATA_FAILED')),requestMs),signal=controller.signal;
    let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;clearTimeout(deadline);for(const {signal,callback} of links)signal.removeEventListener('abort',callback);};
    let response;
    try {
      const pending=Promise.resolve(live.nativeFetch(url.href,{method:'GET',headers,signal,credentials:'omit',redirect:'error',cache:'no-store',priority:'low'}));
      pending.then(late=>{if(signal.aborted)void Promise.resolve(late?.body?.cancel?.()).catch(()=>{});},()=>{});
      response=await race(pending,signal);assertOwner();
      if(response?.status!==200||response?.ok!==true){void Promise.resolve(response?.body?.cancel?.()).catch(()=>{});throw fault('METADATA_FAILED');}
    }catch(cause){controller.abort(cause);cleanup();throw cause;}
    let consumed=false;
    return {ok:true,json:async()=>{
      if(consumed)throw fault('METADATA_FAILED');consumed=true;
      let reader=null,complete=false,bytes=0;const chunks=[];
      try {
        assertOwner();reader=response.body?.getReader?.();if(!reader)throw fault('METADATA_FAILED');
        while(true){assertOwner();const chunk=await race(reader.read(),signal);assertOwner();if(chunk.done){complete=true;break;}
          if(!(chunk.value instanceof Uint8Array))throw fault('METADATA_FAILED');
          bytes+=chunk.value.byteLength;result.metadataReceivedBytes+=chunk.value.byteLength;
          if(bytes>CAPS.metadataResponseBytes||result.metadataReceivedBytes>CAPS.metadataBytes)throw fault('METADATA_FAILED');chunks.push(chunk.value);}
        const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
        const json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));assertOwner();return json;
      }catch(cause){controller.abort(cause);throw cause;}
      finally {
        if(!complete){const cancelled=Promise.resolve().then(()=>reader?reader.cancel():response.body?.cancel?.());cancelled.catch(()=>{});await race(cancelled,signal).catch(()=>{});}
        try{reader?.releaseLock();}catch{}chunks.length=0;controller.abort(fault('ABORTED'));cleanup();
      }
    }};
  }
  async function readInventory() {
    assertOwner();
    try {
      const value=await race(inventory({driveFetch:metadataFetch,rootId:context.rootId,priorityFileId:context.priorityFileId,expectedAccountKey:context.accountKey}),lifetime.signal);
      assertOwner();
      if(value?.report?.completeness?.repeatedPrivateInventoryMatched!==true||value.report.completeness.shortcutClassificationComplete!==true||!value.privatePasses?.secondPass)throw fault('INVENTORY_FAILED');
      result.inventoryRunsCompleted++;return value;
    }catch(cause){if(lifetime.signal.aborted)throw lifetime.signal.reason;throw fault(CODES.has(cause?.code)?cause.code:'INVENTORY_FAILED');}
  }
  async function execute() {
    let first=null,second=null;
    try {
      let initial;try{initial=current();}catch{throw fault('RUNTIME_REJECTED');}
      owner={...initial,values:Object.fromEntries(OWNER_FIELDS.map(key=>[key,initial.state[key]]))};
      if(!context||!safeId(context.rootId)||!safeId(context.priorityFileId)||context.accountKey!==owner.values.accountId||context.generation!==owner.values.driveSessionGeneration)throw fault('RUNTIME_REJECTED');
      assertOwner();result.activeControllerIdentityFenced=true;timer=setTimeout(()=>stop('RUN_TIMEOUT'),CAPS.runMs);
      live.addEventListener?.('pagehide',onHide,{once:true});live.addEventListener?.('beforeunload',onHide,{once:true});owner.values.accountStateAbortController.signal.addEventListener('abort',onAccount,{once:true});
      first=await readInventory();second=await readInventory();assertOwner();result.comparisonAttempted=true;
      try{compare({firstPass:first.privatePasses.secondPass,secondPass:second.privatePasses.secondPass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId});}
      catch(cause){try{result.catalogComparison=sanitizeComparisonDiagnostic(diagnose(cause,first.privatePasses.secondPass,second.privatePasses.secondPass),cause);}catch{result.catalogComparison=emptyComparisonDiagnostic(cause);}throw fault('CATALOG_DRIFT');}
      assertOwner();result.catalogStable=true;result.complete=true;
    }catch(cause){const actual=lifetime.signal.aborted?lifetime.signal.reason:cause;result.failure=CODES.has(actual?.code)?actual.code:'INVENTORY_FAILED';}
    finally {
      stop(result.failure??'ABORTED');clearTimeout(timer);live?.removeEventListener?.('pagehide',onHide);live?.removeEventListener?.('beforeunload',onHide);
      owner?.values.accountStateAbortController?.signal.removeEventListener('abort',onAccount);first=null;second=null;owner=null;context=null;live=null;result.released=true;finished=true;
    }
    return snapshot();
  }
  return Object.freeze({run(){if(!claimed){claimed=true;promise=execute();}return promise;},cancel(){stop('ABORTED');if(!claimed){claimed=true;promise=execute();}return {cancelled:true};},
    progress(){return {claimed,done:finished,inventoryRunsCompleted:result.inventoryRunsCompleted,dispatches:result.dispatches,metadataReceivedBytes:result.metadataReceivedBytes,mediaRequests:0,writeRequests:0};},done(){return {done:finished,summary:finished?snapshot():null};}});
}
