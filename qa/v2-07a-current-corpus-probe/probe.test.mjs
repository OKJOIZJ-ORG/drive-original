import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createCurrentCorpusProbe,ORIGIN,VERSION,CAPS} from './probe.mjs';
import {buildBrowserBundleText} from './build-browser-bundle.mjs';
import {summarizeMpegTs} from './ts-summary.mjs';

function fixture({tsCount=2,size='100000',beforeFetch=()=>{},parser,inventoryRunner,compareInventory=()=>{}}={}) {
  const state={accountId:'PRIVATE_ACCOUNT',authAccountKey:'PRIVATE_SUB',token:'PRIVATE_TOKEN',expiresAt:Date.now()+3600000,
    driveSessionGeneration:4,authGeneration:3,tokenRevision:7,mediaSession:8,accountIdentityPending:false,authStatus:'online',demo:false,accountStateAbortController:new AbortController(),
    selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
  const rows=Array.from({length:38},(_,i)=>({fileId:`PRIVATE_FILE_${i}`,version:'123456789',size,modifiedTime:'2026-09-28T00:00:00.000Z',mimeType:'video/mp4',
    visibleReferences:[{fileId:`PRIVATE_FILE_${i}`,resourceKey:null}]}));
  const controller={state:'activated',scriptURL:ORIGIN+'/sw.js'},retirement={settled:true},listeners=new Set(),fetches=[],parsed=[];
  const runtime={appVersion:VERSION,readState:()=>state,getSWIdentity:()=>({controller,version:VERSION}),getMutationsEnabled:()=>false,
    top:1,self:1,location:{href:ORIGIN+'/'},navigator:{onLine:true,serviceWorker:{controller}},hasUsableToken:()=>true,
    getQ1Playback:()=>null,getQ1RetirementResult:()=>retirement,getMediaSourceGeneration:()=>9,getPlayerMediaPriorityActive:()=>false,
    privateContext:{accountKey:state.accountId,generation:4,rootId:'PRIVATE_ROOT',priorityFileId:rows[0].fileId,priorityVersion:rows[0].version},
    addEventListener:type=>listeners.add(type),removeEventListener:type=>listeners.delete(type),
    nativeFetch:async(value,options)=>{
      const url=new URL(value);fetches.push({url,options});beforeFetch({url,options,state,runtime,fetches});
      if(url.origin!==ORIGIN) {
        if(url.pathname.endsWith('/about'))return Response.json({user:{permissionId:state.accountId}});
        const row=rows.find(row=>url.pathname.endsWith('/'+row.fileId));
        return Response.json({id:row.fileId,version:row.version,size:row.size,modifiedTime:row.modifiedTime,mimeType:row.mimeType,trashed:false,capabilities:{canDownload:true}});
      }
      const index=Number(url.pathname.match(/_(\d+)$/)[1]),match=options.headers.Range.match(/^bytes=(\d+)-(\d+)$/),start=Number(match[1]),end=Number(match[2]);
      const bytes=new Uint8Array(end-start+1);
      if(index<tsCount)for(let absolute=Math.ceil(start/188)*188;absolute<=end;absolute+=188)bytes[absolute-start]=0x47;
      else if(start===0)bytes.set([0,0,0,20,102,116,121,112]);
      return new Response(bytes,{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${rows[index].size}`,'Content-Length':String(bytes.length),'Accept-Ranges':'bytes','Cache-Control':'no-store'}});
    }};
  const dependencies={selector:()=>({privateManifest:{schema:'drive-original.v2-07a-risk-selection-private/1',prioritySample:{fileId:rows[0].fileId,version:rows[0].version},selected:rows},
    report:{coverage:{requiredCategoryCount:1,coveredCategoryCount:1,uncoveredCategoryCount:0},selection:{prioritySampleSelected:true,allRareMkvAviBmpSelected:true,allGe4GiBSelected:true}}}),
    inventoryRunner:inventoryRunner??(async({driveFetch})=>{await(await driveFetch('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)')).json();return {privatePasses:{secondPass:{}},report:{completeness:{repeatedPrivateInventoryMatched:true,shortcutClassificationComplete:true}}};}),
    compareInventory};
  if(parser)dependencies.parser=bytes=>{parsed.push(new Uint8Array(bytes));return parser(bytes);};
  return {runtime,state,rows,controller,retirement,fetches,parsed,listeners,dependencies,make:()=>createCurrentCorpusProbe(runtime,dependencies)};
}
const parsedTS=()=>({outcome:{code:'MPEG_TS_STRUCTURE_COMPLETE'},programs:[{streams:[{kind:'video',codec:'h264'},{kind:'audio',codec:'aac'}]}]});
const media=f=>f.fetches.filter(row=>row.url.origin===ORIGIN);

test('current mixed corpus retains 940-byte prefix and adds only nonoverlapping TS continuation',async()=>{
  const f=fixture({parser:parsedTS}),p=f.make(),result=await p.run();
  assert.equal(result.complete,true);assert.equal(result.catalogStable,true);assert.equal(result.processed,38);
  assert.equal(result.routes['mpeg-ts'],2);assert.equal(result.routes['iso-bmff'],36);
  assert.equal(result.mediaRequests,40);assert.equal(result.receivedBytes,2*65536+36*940);
  assert.equal(result.tsPrograms,2);assert.equal(result.tsStreams,4);assert.equal(result.videoSignalling.h264,2);
  assert.deepEqual(media(f).slice(0,2).map(x=>x.options.headers.Range),['bytes=0-939','bytes=940-65535']);
  assert.equal(f.parsed[0].length,65536);for(const offset of [0,188,376,564,752,940,1128])assert.equal(f.parsed[0][offset],0x47);
  for(const request of f.fetches)assert.equal(request.options.priority,'low');
  for(const request of media(f)){assert.equal(request.url.searchParams.has('mediaOwner'),false);assert.equal(request.url.searchParams.has('sourceGeneration'),false);assert.equal(request.url.searchParams.get('mediaSession'),'8');}
  assert.equal(f.listeners.size,0);assert.equal(result.released,true);assert.equal(result.nativeQ1RetirementProven,false);
  assert.equal(await p.run() instanceof Object,true);assert.equal(f.fetches.length,118);
  const output=JSON.stringify({result,progress:p.progress(),done:p.done(),cancel:p.cancel()});
  for(const secret of ['PRIVATE_ACCOUNT','PRIVATE_SUB','PRIVATE_TOKEN','PRIVATE_ROOT','PRIVATE_FILE','123456789'])assert.equal(output.includes(secret),false);
});
test('all TS consumes at most 76 media dispatches and 2490368 downstream bytes',async()=>{
  const f=fixture({tsCount:38,parser:parsedTS}),result=await f.make().run();
  assert.equal(result.complete,true);assert.equal(result.mediaRequests,CAPS.mediaRequests);assert.equal(result.receivedBytes,CAPS.mediaBytes);
});
test('small TS never consumes EOF or complete object; smallest objects skip body',async()=>{
  for(const size of ['940','941','65536','65537']) {
    const f=fixture({tsCount:38,size,parser:parsedTS}),r=await f.make().run();
    assert.equal(r.complete,true);
    assert.equal(r.skippedSmall,size==='940'?38:0);assert.equal(r.tsPrefixOnly,['941','65536'].includes(size)?38:0);
    for(const request of media(f)){const end=Number(request.options.headers.Range.split('-')[1]);assert.ok(end<Number(size)-1);}
    assert.equal(r.mediaRequests,size==='940'?0:size==='65537'?76:38);
  }
});
test('actual maintained TS parser classifies bounded null packet prefix without claiming playback',async()=>{
  const f=fixture({tsCount:1}),r=await f.make().run();assert.equal(r.complete,true);assert.equal(r.routes['mpeg-ts'],1);
  assert.equal(Object.values(r.tsOutcomes).reduce((a,b)=>a+b,0),1);assert.equal(r.decoded,0);
});
test('runtime rejects stale version, unsettled Q1, false SW proof, active playback, offline, writes, expired token',async()=>{
  for(const mutate of [f=>f.runtime.appVersion='1.22.0-rc.4',f=>f.runtime.getQ1Playback=()=>({}),f=>f.retirement.settled=false,
    f=>f.runtime.getSWIdentity=()=>({controller:f.controller,version:'1.22.0-rc.9'}),f=>f.state.selected={},
    f=>f.runtime.navigator.onLine=false,f=>f.runtime.getMutationsEnabled=()=>true,f=>f.runtime.hasUsableToken=()=>false,
    f=>f.state.authStatus='reconnecting',f=>f.state.demo=true,f=>f.runtime.getPlayerMediaPriorityActive=()=>true,
    f=>f.state.accountStateAbortController.abort()]) {
    const f=fixture();mutate(f);const r=await f.make().run();assert.equal(r.failure,'RUNTIME_REJECTED');assert.equal(f.fetches.length,0);assert.equal(r.released,true);
  }
});
test('same account/auth/data/token/controller/retirement owner drift stops before later body',async()=>{
  for(const mutate of [({state})=>state.accountId='OTHER',({state})=>state.authGeneration++,({state})=>state.driveSessionGeneration++,
    ({state})=>state.tokenRevision++,({state})=>state.token='OTHER',({runtime})=>runtime.navigator.serviceWorker.controller={state:'activated',scriptURL:ORIGIN+'/sw.js'},
    ({runtime})=>runtime.getQ1RetirementResult=()=>({settled:true}),({state})=>state.accountStateAbortController=new AbortController(),
    ({state})=>state.accountStateAbortController.abort()]) {
    const f=fixture({beforeFetch:args=>{if(args.url.origin===ORIGIN)mutate(args);}}),r=await f.make().run();
    assert.equal(r.complete,false);assert.equal(media(f).length,1);assert.ok(['OWNER_CHANGED','GENERATION_STALE'].includes(r.failure));
  }
});
test('strict status/content headers/body length failure stops all later media even after postflight',async()=>{
  for(const mutation of [response=>new Response(new Uint8Array(940),{status:200}),
    response=>{response.headers.set('Content-Range','bytes 0-939/999999');return response;},
    response=>{response.headers.delete('Content-Length');return response;},
    response=>new Response(new Uint8Array(939),{status:206,headers:response.headers}),
    response=>new Response(new Uint8Array(941),{status:206,headers:response.headers})]) {
    const f=fixture(),native=f.runtime.nativeFetch;f.runtime.nativeFetch=async(value,options)=>{const response=await native(value,options);return new URL(value).origin===ORIGIN?mutation(response):response;};
    const r=await f.make().run();assert.equal(r.complete,false);assert.equal(media(f).length,1);assert.equal(r.processed,0);assert.ok(r.failure);assert.equal(r.released,true);
  }
});
test('identity and catalog drift invalidate completion',async()=>{
  const f=fixture(),native=f.runtime.nativeFetch;let metadataCount=0;
  f.runtime.nativeFetch=async(value,options)=>{const r=await native(value,options);if(new URL(value).origin!==ORIGIN && new URL(value).pathname.endsWith('/PRIVATE_FILE_0') && ++metadataCount===2){const v=await r.json();v.version='2';return Response.json(v);}return r;};
  const r=await f.make().run();assert.equal(r.complete,false);assert.equal(media(f).length,2);assert.equal(r.failure,'POSTFLIGHT_FAILED');
  const g=fixture({compareInventory:()=>{throw new Error('private catalog drift');}}),s=await g.make().run();assert.equal(s.failure,'CATALOG_DRIFT');assert.equal(s.catalogStable,false);
});
test('catalog comparator code survives diagnostic failure and injected results remain redacted',async()=>{
  for(const diagnosticThrows of [true,false]) {
    const f=fixture({compareInventory:()=>{throw Object.assign(new Error('PRIVATE_ERROR'),{code:'REPEAT_MISMATCH'});}});
    f.dependencies.comparisonDiagnostics=()=>{
      if(diagnosticThrows)throw new Error('PRIVATE_DIAGNOSTIC');
      return {diagnosticAvailable:true,rootBeforeChanged:false,rootAfterChanged:false,accountBeforeChanged:false,accountAfterChanged:false,
        traversedFolderCountChanged:false,duplicateReferenceCountChanged:false,unresolvedShortcutTargetCountChanged:false,staleShortcutTargetMimeCountChanged:false,
        itemsAdded:0,itemsRemoved:0,itemsChanged:1,shortcutTargetsAdded:0,shortcutTargetsRemoved:0,shortcutTargetsChanged:0,rawId:'PRIVATE_FILE',message:'PRIVATE_ERROR'};
    };
    const result=await f.make().run();assert.equal(result.failure,'CATALOG_DRIFT');assert.equal(result.complete,false);assert.equal(result.catalogStable,false);
    assert.equal(result.catalogComparison.comparatorCode,'REPEAT_MISMATCH');assert.equal(result.catalogComparison.diagnosticAvailable,!diagnosticThrows);
    assert.equal(JSON.stringify(result).includes('PRIVATE_ERROR'),false);assert.equal(JSON.stringify(result).includes('PRIVATE_FILE'),false);
  }
});
test('total metadata request ceiling fails closed at 512 dispatches',async()=>{
  const f=fixture({inventoryRunner:async({driveFetch})=>{for(let i=0;i<513;i++)await(await driveFetch('https://www.googleapis.com/drive/v3/about')).json();}}),r=await f.make().run();
  assert.equal(r.failure,'REQUEST_LIMIT');assert.equal(r.dispatches,512);assert.equal(r.mediaRequests,0);
});
test('cancel before run and while metadata waits releases once; one-shot promise never redispatches',async()=>{
  const f=fixture(),p=f.make();p.cancel();const r=await p.run();assert.equal(r.failure,'CANCELLED');assert.equal(f.fetches.length,0);assert.equal(r.released,true);
  const g=fixture();g.runtime.nativeFetch=()=>new Promise(()=>{});const q=g.make(),pending=q.run();assert.equal(q.progress().done,false);q.cancel();
  const result=await pending;assert.equal(result.failure,'CANCELLED');assert.equal(result.released,true);assert.equal(q.done().done,true);assert.equal(q.run(),pending);
});
test('public bundle is deterministic standalone lexical factory with no page global writes',async()=>{
  const a=await buildBrowserBundleText(),b=await buildBrowserBundleText();assert.equal(a,b);
  const sandbox={};const factory=vm.runInNewContext(a,sandbox);assert.equal(typeof factory,'function');assert.deepEqual(Object.keys(sandbox),[]);
  assert.equal(a.includes('Object.defineProperty(globalThis'),false);assert.equal(a.includes('Number.MAX_SAFE_INTEGER;'),false);
});
test('actual current app lexical TOKEN_REQUEST allows idle generic route but rejects fake Q1',async()=>{
  const source=await readFile(new URL('../../app.js',import.meta.url),'utf8');
  const start=source.indexOf('async function handleWorkerMessage(event) {'),end=source.indexOf("  if (data.type === 'MEDIA_TRACE_EVENT')",start);
  const tokenOnly=source.slice(start,end)+'}';
  const context={state:{token:'PRIVATE',expiresAt:Date.now()+3600000,authAccountKey:'sub',tokenRevision:5,driveSessionGeneration:4,mediaSession:8,selected:null,mediaAttempt:'idle'},
    q1Playback:null,mediaSourceGeneration:9,hasUsableToken:()=>true,AUTH_PROTOCOL:'auth',Q1_RETIRE_PROTOCOL:'q1'};
  vm.runInNewContext(tokenOnly+';this.handle=handleWorkerMessage;',context);
  const responses=[];
  for(const requireCurrentMedia of [false,true])await context.handle({data:{type:'TOKEN_REQUEST',accountGeneration:4,requireCurrentMedia,fileId:'private',mediaSession:'8',sourceGeneration:9},ports:[{postMessage:value=>responses.push(value),close(){}}]});
  assert.equal(responses[0].token,'PRIVATE');assert.equal(responses[1].token,null);
  const sw=await readFile(new URL('../../sw.js',import.meta.url),'utf8');assert.match(sw,/const VERSION = '1\.22\.0-rc\.10'/);
  assert.match(sw,/const owner = context\.requireCurrentMedia \? registerQ1TransportOwner/);
});
test('actual rc.10 SW validates hidden upstream range headers, retains zero Q1 cutoff, and fails unproved206',async()=>{
  const source=await readFile(new URL('../../sw.js',import.meta.url),'utf8');
  for(const valid of [true,false]) {
    const f=fixture({tsCount:0}),native=f.runtime.nativeFetch;
    const context={URL,Headers,Request,Response,ReadableStream,AbortController,DOMException,setTimeout,clearTimeout,Date,
      self:{location:{origin:ORIGIN},addEventListener(){},clients:{async get(){return {postMessage(){}};}}},
      fetch:async(value,options)=>{
        const headers=new Headers(options.headers),match=headers.get('Range').match(/bytes=(\d+)-(\d+)/),length=Number(match[2])-Number(match[1])+1;
        const bytes=new Uint8Array(length);bytes.set([0,0,0,20,102,116,121,112]);
        return new Response(bytes,{status:206,headers:valid?{'Content-Length':String(length)}:{}});
      }};
    vm.createContext(context);vm.runInContext(source,context);
    vm.runInContext(`clientCredentials.set('A',{token:'PRIVATE',expiresAt:Date.now()+3600000,account:'sub',revision:7,accountGeneration:4});this.proxy=proxyDriveMedia;`,context);
    f.runtime.nativeFetch=async(value,options)=>{
      if(new URL(value).origin!==ORIGIN)return native(value,options);
      // Keep downstream dispatch accounting from fixture, but exercise actual SW response path.
      f.fetches.push({url:new URL(value),options});
      return context.proxy(new Request(value,options),new URL(value),'A');
    };
    const result=await f.make().run();assert.equal(result.complete,valid);
    assert.equal(result.mediaRequests,valid?38:1);if(!valid)assert.equal(result.failure,'STATUS_NOT_206');
    assert.equal(vm.runInContext('q1TransportOwners.size + q1CleanupFences.size + q1RetiredThrough.size',context),0);
  }
});
test('oversized metadata response fails on streamed byte limit without JSON parse or media',async()=>{
  const f=fixture();let cancelled=0;
  f.runtime.nativeFetch=async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(CAPS.metadataResponseBytes+1));},cancel(){cancelled++;}}));
  const result=await f.make().run();assert.equal(result.failure,'METADATA_FAILED');assert.equal(result.mediaRequests,0);assert.equal(cancelled,1);assert.equal(result.released,true);
});
test('metadata owner changes during a streamed read and account abort both stop downstream continuation',async()=>{
  for(const abort of [false,true]) {
    const f=fixture();let reads=0,cancelled=0;
    f.runtime.nativeFetch=async()=>new Response(new ReadableStream({pull(controller){
      if(++reads===1){controller.enqueue(new TextEncoder().encode('{"user":'));return;}
      if(abort)f.state.accountStateAbortController.abort();else f.state.tokenRevision++;
      controller.enqueue(new TextEncoder().encode('{}}'));},cancel(){cancelled++;}}));
    const r=await f.make().run();assert.equal(r.failure,'OWNER_CHANGED');assert.equal(r.mediaRequests,0);assert.equal(r.dispatches,1);assert.equal(cancelled,1);
  }
});
test('held metadata read times out per request even when cancellation never resolves',async()=>{
  const f=fixture();f.dependencies.metadataTimeoutMs=15;let cancelled=0;
  f.runtime.nativeFetch=async()=>new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;return new Promise(()=>{});}}));
  const started=Date.now(),result=await f.make().run();assert.equal(result.failure,'METADATA_FAILED');assert.equal(result.mediaRequests,0);
  assert.equal(cancelled,1);assert.ok(Date.now()-started<1000);assert.equal(result.released,true);
});
test('metadata reader acquisition throw cancels unlocked body and releases deadline/account links',async()=>{
  for(const missingReader of [false,true]) {
    const f=fixture(),timers=new Set(),listeners=new Set();let cancelled=0;
    const signal=f.state.accountStateAbortController.signal;
    const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
    signal.addEventListener=(type,listener,options)=>{if(type==='abort')listeners.add(listener);add(type,listener,options);};
    signal.removeEventListener=(type,listener,options)=>{if(type==='abort')listeners.delete(listener);remove(type,listener,options);};
    f.dependencies.setMetadataTimeoutFn=(callback,ms)=>{const timer=setTimeout(callback,ms);timers.add(timer);return timer;};
    f.dependencies.clearMetadataTimeoutFn=timer=>{timers.delete(timer);clearTimeout(timer);};
    f.runtime.nativeFetch=async()=>({ok:true,body:{
      getReader:missingReader?undefined:()=>{throw new Error('private reader failure');},
      cancel(){cancelled++;return Promise.resolve();}
    }});
    const result=await f.make().run();assert.equal(result.failure,missingReader?'METADATA_FAILED':'INVENTORY_FAILED');assert.equal(result.mediaRequests,0);
    assert.equal(cancelled,1);assert.equal(timers.size,0);assert.equal(listeners.size,0);assert.equal(result.released,true);
    assert.equal(JSON.stringify(result).includes('private reader failure'),false);
  }
});
test('TS semantic evidence promotes target details only for complete structure and aggregates priority role safely',async()=>{
  const streams=[{kind:'video',codec:'h264',codecDetails:{status:'parsed',profileIdc:100,levelIdc:30,width:360,height:640,
    color:{fullRange:false,primaries:'BT.709',transfer:'BT.709',matrix:'BT.709'}}},
    {kind:'audio',codec:'aac',codecDetails:{status:'parsed',objectType:2,sampleRate:48000,channels:2}}];
  const full={outcome:{code:'MPEG_TS_STRUCTURE_COMPLETE'},programs:[{streams}]};
  const good=summarizeMpegTs(full);for(const key of ['videoProfileEvidence','videoFormatEvidence','audioProfileEvidence'])assert.equal(good[key],'target-confirmed');
  const partial=summarizeMpegTs({...full,outcome:{code:'PSI_NOT_COMPLETE'}});for(const key of ['videoProfileEvidence','videoFormatEvidence','audioProfileEvidence'])assert.equal(partial[key],'inconclusive');
  const f=fixture({tsCount:1,parser:()=>full}),r=await f.make().run();
  assert.equal(r.tsEvidence.videoProfileEvidence['target-confirmed'],1);assert.equal(r.priorityTsEvidence.audioProfileEvidence['target-confirmed'],1);
  assert.equal(JSON.stringify(r).includes('profileIdc'),false);
});
function canonicalIntegrationFixture(objectCount) {
  const f=fixture({tsCount:0});
  const items=Array.from({length:objectCount},(_,i)=>({id:`PRIVATE_FILE_${i}`,name:`PRIVATE_NAME_${i}.bmp`,
    mimeType:'image/bmp',fullFileExtension:'bmp',size:'100000',version:'123456789',modifiedTime:'2026-09-28T00:00:00.000Z',
    parents:['PRIVATE_ROOT'],trashed:false,capabilities:{canDownload:true,canReadRevisions:true},imageMediaMetadata:{width:40,height:30}}));
  const root={id:'PRIVATE_ROOT',mimeType:'application/vnd.google-apps.folder',version:'1',modifiedTime:'2026-09-28T00:00:00.000Z',trashed:false,capabilities:{canListChildren:true}};
  const native=f.runtime.nativeFetch;
  f.runtime.nativeFetch=async(value,options)=>{
    const url=new URL(value);
    if(url.origin===ORIGIN)return native(value,options);
    f.fetches.push({url,options});
    if(url.pathname.endsWith('/about'))return Response.json({user:{permissionId:f.state.accountId}});
    if(url.pathname.endsWith('/files')&&url.searchParams.has('q'))return Response.json({incompleteSearch:false,files:items});
    if(url.pathname.endsWith('/PRIVATE_ROOT'))return Response.json(root);
    const item=items.find(item=>url.pathname.endsWith('/'+item.id));assert.ok(item);return Response.json(item);
  };
  // Exercise actual canonical inventory traversal and actual risk selector interface.
  delete f.dependencies.inventoryRunner;delete f.dependencies.selector;delete f.dependencies.compareInventory;
  return f;
}
test('actual canonical inventory and maintained selector distinguish 1/36/38/39 without media in metadata-only mode',async()=>{
  for(const objectCount of [1,36,38,39]) {
    const f=canonicalIntegrationFixture(objectCount),p=f.make(),result=await p.runMetadataOnlySelection();
    assert.equal(result.failure,null);assert.equal(result.mode,'metadata-only-selection');assert.equal(result.complete,false);
    assert.equal(result.released,true);assert.equal(result.selectionPreflightComplete,true);assert.equal(result.selected,objectCount);
    const diagnostic=result.selectionPreflight;
    for(const key of ['selectorSucceeded','schemaMatch','priorityMatch','duplicateFree','resourceKeyReferencesValid','identityComplete','coverageComplete'])assert.equal(diagnostic[key],true,key);
    assert.equal(diagnostic.historicalCountMatch,objectCount===38);assert.equal(diagnostic.selectedCountWithinLimit,objectCount<=38);assert.equal(diagnostic.bodyEligible,objectCount<=38);
    assert.equal(result.mediaRequests,0);assert.equal(media(f).length,0);assert.ok(result.dispatches>2);
    const before=f.fetches.length;assert.equal(await p.runMetadataOnlySelection() instanceof Object,true);await p.run();assert.equal(f.fetches.length,before);
    for(const secret of ['PRIVATE_ACCOUNT','PRIVATE_SUB','PRIVATE_ROOT','PRIVATE_FILE','PRIVATE_NAME','123456789'])assert.equal(JSON.stringify(result).includes(secret),false);
  }
});
test('normal actual-selector corpus refuses count above38 while preserving complete risk coverage diagnostics',async()=>{
  for(const objectCount of [39]) {
    const f=canonicalIntegrationFixture(objectCount),result=await f.make().run();
    assert.equal(result.failure,'SELECTION_FAILED');assert.equal(result.selectionPreflight.selectedCount,objectCount);
    assert.equal(result.selectionPreflight.coverageComplete,true);assert.equal(result.selectionPreflight.historicalCountMatch,false);
    assert.equal(result.selectionPreflight.selectedCountWithinLimit,false);
    assert.equal(result.processed,0);assert.equal(result.mediaRequests,0);assert.equal(media(f).length,0);
  }
});
test('normal actual-selector 1/36/38-object integration completes current selection with fresh identity/catalog and byte-only routing',async()=>{
  for(const objectCount of [1,36,38]) {
  const f=canonicalIntegrationFixture(objectCount),result=await f.make().run();
  assert.equal(result.complete,true);assert.equal(result.catalogStable,true);assert.equal(result.selectionPreflight.bodyEligible,true);
  assert.equal(result.routes['iso-bmff'],objectCount);assert.equal(result.mediaRequests,objectCount);assert.equal(result.receivedBytes,objectCount*940);
  assert.equal(result.failure,null);assert.equal(result.processed,objectCount);assert.equal(result.selected,objectCount);
  assert.equal(result.selectionPreflight.historicalCountMatch,objectCount===38);
  }
});
test('zero selected objects reject before any media and do not become an empty success',async()=>{
  const f=fixture(),select=f.dependencies.selector;
  f.dependencies.selector=()=>{const selected=select();selected.privateManifest.selected=[];return selected;};
  const result=await f.make().run();assert.equal(result.failure,'SELECTION_FAILED');assert.equal(result.complete,false);
  assert.equal(result.selectionPreflight.selectedCount,0);assert.equal(result.selectionPreflight.selectedCountWithinLimit,false);
  assert.equal(result.selectionPreflight.bodyEligible,false);assert.equal(result.mediaRequests,0);assert.equal(result.processed,0);
});
test('fixed selection diagnostics separate schema/priority/duplicate/reference/coverage interface failures before any body',async()=>{
  for(const [dimension,mutate] of [
    ['schemaMatch',selection=>selection.privateManifest.schema='wrong'],
    ['priorityMatch',selection=>selection.privateManifest.prioritySample.version='wrong'],
    ['duplicateFree',selection=>selection.privateManifest.selected[1]=selection.privateManifest.selected[0]],
    ['resourceKeyReferencesValid',selection=>selection.privateManifest.selected[1].visibleReferences=[{fileId:'PRIVATE_REF',resourceKey:'bad/secret'}]],
    ['identityComplete',selection=>selection.privateManifest.selected[1].size=null],
    ['coverageComplete',selection=>selection.report.coverage.uncoveredCategoryCount=1]
  ]) {
    const f=fixture(),select=f.dependencies.selector;f.dependencies.selector=()=>{const selection=select();mutate(selection);return selection;};
    const result=await f.make().run();assert.equal(result.failure,'SELECTION_FAILED');assert.equal(result.selectionPreflight[dimension],false);
    assert.equal(result.selectionPreflightComplete,true);assert.equal(result.mediaRequests,0);assert.equal(JSON.stringify(result).includes('bad/secret'),false);
  }
});
