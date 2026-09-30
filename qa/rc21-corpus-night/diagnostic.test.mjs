import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createCorpusTracksProbe,VERSION,ORIGIN,CAPS} from './probe-v3-diagnostic.mjs';
import {build} from './build-v3-diagnostic.mjs';
import {box,cat,moovFixture} from '../v2-07a-iso-tracks-rc11/fixtures.mjs';
const eb=(id,payload)=>{let n=1;while(payload.length>=(2**(7*n)-1))n++;const size=Buffer.alloc(n);let value=BigInt(payload.length)|(1n<<BigInt(7*n));for(let i=n-1;i>=0;i--){size[i]=Number(value&255n);value>>=8n;}let hex=id.toString(16);if(hex.length%2)hex='0'+hex;return Buffer.concat([Buffer.from(hex,'hex'),size,payload]);};
const u=n=>Buffer.from([n]);
const f=n=>{const b=Buffer.alloc(8);b.writeDoubleBE(n);return b;};
const tracks=()=>eb(0xae,cat(eb(0x83,u(1)),eb(0x86,Buffer.from('V_VP9')),eb(0xe0,cat(eb(0xb0,u(160)),eb(0xba,u(90))))));
const webm=()=>cat(eb(0x1a45dfa3,eb(0x4282,Buffer.from('webm'))),eb(0x18538067,cat(eb(0x1654ae6b,tracks()),eb(0x1f43b675,Buffer.alloc(3000)))));
function fixture(){
  const state={accountId:'PRIVATE_ACCOUNT',authAccountKey:'PRIVATE_AUTHKEY',token:'PRIVATE_TOKEN',expiresAt:Date.now()+3600000,authGeneration:1,driveSessionGeneration:2,tokenRevision:3,mediaSession:4,
    accountStateAbortController:new AbortController(),authStatus:'online',demo:false,accountIdentityPending:false,selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
  const iso=(extra=0)=>cat(box('ftyp',Buffer.from('isom'),Buffer.alloc(4)),moovFixture({audio:true}),box('mdat',Buffer.alloc(4000+extra)));
  const files=[{id:'PRIVATE_PRIORITY',ext:'mp4',mime:'video/mp4',data:iso()},...Array.from({length:6},(_,i)=>({id:`PRIVATE_ISO_${i}`,ext:'mp4',mime:'video/mp4',data:iso(i+1)})),{id:'PRIVATE_WEBM',ext:'webm',mime:'video/webm',data:webm()},{id:'PRIVATE_BMP',ext:'bmp',mime:'application/octet-stream',data:cat([66,77],Buffer.alloc(2000))}];
  const rows=files.map(f=>({fileId:f.id,version:'123456789',size:String(f.data.length),modifiedTime:'PRIVATE_DATE',mimeType:f.mime,extension:f.ext,visibleReferences:[{fileId:f.id,resourceKey:null}]}));
  const context={accountKey:state.accountId,authAccountKey:state.authAccountKey,generation:2,rootId:'PRIVATE_ROOT',priorityFileId:files[0].id,priorityVersion:'123456789'};
  const selection={privateManifest:{schema:'drive-original.v2-07a-risk-selection-private/1',prioritySample:{fileId:context.priorityFileId,version:context.priorityVersion},selected:rows},report:{coverage:{requiredCategoryCount:1,coveredCategoryCount:1,uncoveredCategoryCount:0},selection:{prioritySampleSelected:true,allRareMkvAviBmpSelected:true,allGe4GiBSelected:true}}};
  const controller={state:'activated',scriptURL:ORIGIN+'/sw.js'},retirement={settled:true},calls=[],listeners=new Set();let fileReads=0;
  const runtime={appVersion:VERSION,readState:()=>state,privateContext:context,navigator:{onLine:true,serviceWorker:{controller}},location:{origin:ORIGIN,href:ORIGIN+'/'},document:{visibilityState:'visible'},top:1,self:1,
    getSWIdentity:()=>({controller,version:VERSION}),getMutationsEnabled:()=>false,getQ1Playback:()=>null,getQ1RetirementResult:()=>retirement,getMediaSourceGeneration:()=>5,getPlayerMediaPriorityActive:()=>false,hasUsableToken:()=>true,
    addEventListener:t=>listeners.add(t),removeEventListener:t=>listeners.delete(t),nativeFetch:async(v,init)=>{
      const url=new URL(v);calls.push({url,init});if(url.origin!==ORIGIN){if(url.pathname.endsWith('/about'))return Response.json({user:{permissionId:state.accountId}});const file=files.find(f=>url.pathname.endsWith('/'+f.id));fileReads++;return Response.json({id:file.id,version:'123456789',size:String(file.data.length),modifiedTime:'PRIVATE_DATE',mimeType:file.mime,trashed:false,headRevisionId:'PRIVATE_REV',sha256Checksum:'PRIVATE_CHECKSUM',capabilities:{canDownload:true}});}
      const file=files.find(f=>url.pathname.endsWith('/'+f.id));const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(init.headers.Range),start=+a,end=+b;return new Response(file.data.subarray(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${file.data.length}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store'}});
    }};
  const dependencies={selector:()=>selection,inventoryRunner:async({driveFetch})=>{await(await driveFetch('https://www.googleapis.com/drive/v3/about')).json();return {report:{completeness:{repeatedPrivateInventoryMatched:true,shortcutClassificationComplete:true,containmentComplete:true}},privatePasses:{secondPass:{items:[{id:context.priorityFileId,version:context.priorityVersion}]}}};},compareInventory:()=>{}};
  return {state,files,rows,context,selection,runtime,dependencies,calls,listeners,make:()=>createCorpusTracksProbe(runtime,dependencies)};
}

test('metadata-only136-request full before/after envelope does not stop at100 and performs zero media',async()=>{
  const f=fixture();f.runtime.mode='metadata-only';const inventory=f.dependencies.inventoryRunner;f.dependencies.inventoryRunner=async(args)=>{for(let i=0;i<67;i++)await(await args.driveFetch('https://www.googleapis.com/drive/v3/about')).json();return inventory(args);};
  const r=await f.make().run();assert.equal(r.complete,true);assert.equal(r.catalogStable,true);assert.equal(r.inventoryRuns,2);assert.equal(r.metadataRequests,136);assert.equal(r.metadataDiagnostic.completed,136);assert.equal(r.mediaRequests,0);assert.equal(r.metadataDiagnostic.lastFailure,null);assert.equal(r.genericUpstreamCleanup,'unknown');assert.equal(r.released,true);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});
test('body AbortError plus cancellation AbortError retains original trigger and terminal cleanup failure',async()=>{
  const f=fixture();f.runtime.mode='metadata-only';f.runtime.nativeFetch=async()=>({status:200,body:{getReader:()=>({read:()=>Promise.reject(new DOMException('PRIVATE_READ_SECRET','AbortError')),cancel:()=>Promise.reject(new DOMException('PRIVATE_CANCEL_SECRET','AbortError')),releaseLock(){}})}});
  const r=await f.make().run();assert.equal(r.failure,'CLEANUP_FAILED');assert.equal(r.metadataDiagnostic.lastFailure.stage,'body');assert.equal(r.metadataDiagnostic.lastFailure.errorKind,'AbortError');assert.equal(r.metadataDiagnostic.lastFailure.status,200);assert.equal(r.metadataDiagnostic.lastFailure.ordinal,1);assert.equal(r.metadataDiagnostic.lastCleanupFailure.nativeErrorKind,'AbortError');assert.equal(r.metadataDiagnostic.lastCleanupFailure.originalTrigger,'PROBE_FAILED');assert.equal(r.released,true);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});
test('per-response2MiB cap is preserved and identified separately from cleanup',async()=>{
  const f=fixture();f.runtime.mode='metadata-only';f.runtime.nativeFetch=async()=>new Response('x'.repeat(CAPS.metadataResponseBytes+1));
  const r=await f.make().run();assert.equal(r.failure,'METADATA_LIMIT');assert.equal(r.metadataDiagnostic.lastFailure.code,'METADATA_LIMIT');assert.equal(r.metadataDiagnostic.lastFailure.responseLimitBytes,2097152);assert.equal(r.metadataDiagnostic.lastFailure.receivedBytes,2097153);assert.equal(r.metadataDiagnostic.lastCleanupFailure,null);assert.equal(r.metadataRequests,1);assert.equal(r.mediaRequests,0);
});
test('request deadline and late cleanup rejection remain separately identifiable without more budget',async()=>{
  const f=fixture();f.runtime.mode='metadata-only';f.dependencies.inventoryRunner=async({driveFetch})=>driveFetch('https://www.googleapis.com/drive/v3/about',{requestMs:1});f.runtime.nativeFetch=()=>new Promise(resolve=>setTimeout(()=>resolve({status:200,body:{cancel:()=>Promise.reject(new DOMException('PRIVATE_SECRET','AbortError'))}}),5));
  const r=await f.make().run();assert.equal(r.failure,'CLEANUP_FAILED');assert.equal(r.metadataDiagnostic.lastFailure.abortSource,'request-deadline');assert.equal(r.metadataDiagnostic.lastFailure.stage,'headers');assert.equal(r.metadataDiagnostic.lastFailure.code,'METADATA_FAILED');assert.equal(r.metadataDiagnostic.lastCleanupFailure.cleanupStage,'late-response-cancel');assert.equal(r.metadataDiagnostic.lastCleanupFailure.nativeErrorKind,'AbortError');assert.equal(r.metadataRequests,1);assert.equal(r.mediaRequests,0);
});
test('JSON parse failure is identified after finished body and does not become false cleanup success',async()=>{
  const f=fixture();f.runtime.mode='metadata-only';f.runtime.nativeFetch=async()=>new Response('PRIVATE_INVALID_JSON');const r=await f.make().run();assert.equal(r.complete,false);assert.equal(r.metadataDiagnostic.lastFailure.stage,'decode-json');assert.equal(r.metadataDiagnostic.lastFailure.errorKind,'SyntaxError');assert.equal(r.metadataDiagnostic.lastFailure.bodyFinished,true);assert.equal(r.metadataDiagnostic.lastCleanupFailure,null);assert.equal(r.mediaRequests,0);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});
test('run-wide timeout hidden by failed cancellation remains explicitly RUN_TIMEOUT/run',async()=>{
  const realSetTimeout=globalThis.setTimeout;let abortRun,started;const ready=new Promise(r=>started=r);
  globalThis.setTimeout=(fn,ms,...args)=>{if(ms===CAPS.runMs){abortRun=fn;return 0;}return realSetTimeout(fn,ms,...args);};
  try{
    const f=fixture();f.runtime.mode='metadata-only';f.runtime.nativeFetch=async()=>({status:200,body:{getReader:()=>({read:()=>{started();return new Promise(()=>{});},cancel:()=>Promise.reject(new DOMException('PRIVATE_CANCEL','AbortError')),releaseLock(){}})}});
    const pending=f.make().run();await ready;abortRun();const r=await pending;
    assert.equal(r.failure,'CLEANUP_FAILED');assert.equal(r.metadataDiagnostic.lastFailure.code,'RUN_TIMEOUT');assert.equal(r.metadataDiagnostic.lastFailure.abortSource,'run');assert.equal(r.metadataDiagnostic.lastCleanupFailure.originalTrigger,'RUN_TIMEOUT');assert.equal(r.mediaRequests,0);assert.equal(r.released,true);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
  }finally{globalThis.setTimeout=realSetTimeout;}
});
test('changed account owner remains rejected by metadata-only diagnostics before more requests',async()=>{
  const f=fixture();f.runtime.mode='metadata-only';const fetch=f.runtime.nativeFetch;f.runtime.nativeFetch=async(v,o)=>{const response=await fetch(v,o);f.state.tokenRevision++;return response;};
  const r=await f.make().run();assert.equal(r.complete,false);assert.equal(r.failure,'OWNER_CHANGED');assert.equal(r.metadataRequests,1);assert.equal(r.metadataDiagnostic.lastFailure.code,'OWNER_CHANGED');assert.equal(r.mediaRequests,0);assert.equal(r.released,true);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});
test('diagnostic expression is deterministic and retains current21 owner facade and mode validation',async()=>{
  const a=await build(),b=await build();assert.equal(a.expression,b.expression);const sandbox={},fn=vm.runInNewContext(a.expression,sandbox);assert.deepEqual(Object.keys(sandbox),[]);assert.equal(fn(null,null,null,'metadata-only').poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');assert.equal(a.expression.includes('1.22.0-rc.16'),false);assert.equal(a.expression.includes('metadataRequests:512'),true);
});
