import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createCorpusTracksProbe,VERSION,ORIGIN,CAPS} from './probe-v4-denominators.mjs';
import {build} from './build-v4-denominators.mjs';
import {summarizeInventoryDenominators,summarizeProbeDenominators} from './inventory-denominators.mjs';
import {summarizeRepeatedInventory,FOLDER_MIME} from '../v2-07a-root-inventory/root-inventory.mjs';
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


function genuineReport(f){
 const root={id:f.context.rootId,mimeType:FOLDER_MIME,version:'1',modifiedTime:'PRIVATE_DATE',trashed:false,capabilities:{canListChildren:true}};
 const pass={accountBefore:f.context.accountKey,accountAfter:f.context.accountKey,rootBefore:root,rootAfter:root,items:f.files.map(x=>({id:x.id,name:'PRIVATE_NAME.'+x.ext,mimeType:x.mime,fullFileExtension:x.ext,size:String(x.data.length),version:'123456789',modifiedTime:'PRIVATE_DATE',parents:[f.context.rootId],trashed:false,capabilities:{canDownload:true,canReadRevisions:true}})),shortcutTargets:[],pageCount:1,traversedFolderCount:1,duplicateReferenceCount:0,unresolvedShortcutTargetCount:0,staleShortcutTargetMimeCount:0};
 return summarizeRepeatedInventory({firstPass:pass,secondPass:pass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:f.context.priorityFileId});
}
function prepared(){const f=fixture();f.runtime.mode='metadata-only';const original=f.dependencies.inventoryRunner;f.dependencies.inventoryRunner=async args=>{const r=await original(args);r.report=genuineReport(f);return r;};return f;}

test('maintained report copies exact counts/category/pages/bytes without names,IDs or unknown raw keys',()=>{
 const f=fixture(),report=genuineReport(f),s=summarizeInventoryDenominators(report);assert.deepEqual(s.counts,report.counts);assert.deepEqual(s.extensions,report.extensions);assert.deepEqual(s.mimeTypes,report.mimeTypes);assert.deepEqual(s.sizes,report.sizes);assert.deepEqual(s.completeness.pageCountPerPass,[1,1]);assert.equal(s.candidateDenominators.videoMimeObjects,8);assert.equal(s.candidateDenominators.videoMimeOrExtensionUnion,null);assert.ok(!JSON.stringify(s).includes('PRIVATE_'));report.counts.videoObjects=0;assert.equal(s.counts.videoObjects,8);
});
test('unsafe unknown counters, malformed count sums, unsupported schema and incomplete pass fail closed',()=>{
 for(const mutate of [r=>r.extensions.PRIVATE_RAW=1,r=>r.mimeTypes.PRIVATE_RAW=1,r=>r.counts.videoObjects++,r=>r.sizes.totalKnownSizeBytes='PRIVATE_VALUE',r=>r.completeness.repeatedPassCount=1,r=>r.schema='PRIVATE_SCHEMA']){const r=genuineReport(fixture());mutate(r);assert.throws(()=>summarizeInventoryDenominators(r),/INVENTORY_FAILED/);}
});
test('metadata-only producer emits two exact maintained denominators, explicit unprobed counts and zero media',async()=>{
 const f=prepared(),r=await f.make().run();assert.equal(r.complete,true);assert.equal(r.completeMeaning,'metadata-before-after-envelopes-only');assert.equal(r.wholeCorpusComplete,false);assert.equal(r.inventoryDenominators.length,2);assert.equal(r.inventoryRuns,2);assert.equal(r.inventoryDenominators[0].counts.classifiedUniqueObjects,9);assert.equal(r.inventoryDenominators[1].counts.videoObjects,8);assert.equal(r.probeDenominators.metadataRepresentatives,9);assert.equal(r.probeDenominators.diagnosticTrackCandidates,7);assert.equal(r.probeDenominators.scheduledPrefixReads,0);assert.equal(r.probeDenominators.probedVideoObjects,0);assert.equal(r.probeDenominators.unprobedVideoObjects,8);assert.equal(r.probeDenominators.unprobedRepresentatives,9);assert.equal(r.mediaRequests,0);assert.equal(r.released,true);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});
test('probe mode rejected before metadata/media and before owner/normalization side effects',async()=>{
 const f=prepared();f.runtime.mode='probe';const r=await f.make().run();assert.equal(r.failure,'RUNTIME_REJECTED');assert.equal(r.inventoryDenominators.length,0);assert.equal(r.mediaRequests,0);assert.equal(r.metadataRequests,0);assert.equal(r.wholeCorpusComplete,false);
});
test('final catalog failure retains both denominator snapshots without publishing completion',async()=>{
 const f=prepared();f.dependencies.compareInventory=()=>{throw Error('PRIVATE_DRIFT');};const r=await f.make().run();assert.equal(r.failure,'CATALOG_DRIFT');assert.equal(r.complete,false);assert.equal(r.inventoryDenominators.length,2);assert.equal(r.catalogStable,false);assert.equal(r.wholeCorpusComplete,false);assert.equal(r.mediaRequests,0);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});
test('512 metadata cap, owner change and cleanup failure remain unchanged in denominator producer',async()=>{
 const f=prepared();f.dependencies.inventoryRunner=async({driveFetch})=>{for(let i=0;i<513;i++)await driveFetch('https://www.googleapis.com/drive/v3/about');};const r=await f.make().run();assert.equal(r.failure,'METADATA_LIMIT');assert.equal(r.metadataRequests,512);assert.equal(r.mediaRequests,0);
 const g=prepared(),fetch=g.runtime.nativeFetch;g.runtime.nativeFetch=async(v,o)=>{const response=await fetch(v,o);g.state.tokenRevision++;return response;};const changed=await g.make().run();assert.equal(changed.failure,'OWNER_CHANGED');assert.equal(changed.mediaRequests,0);
 const h=prepared();h.runtime.nativeFetch=async()=>({status:200,body:{getReader:()=>({read:()=>Promise.reject(new DOMException('PRIVATE_BODY','AbortError')),cancel:()=>Promise.reject(new DOMException('PRIVATE_CANCEL','AbortError')),releaseLock(){}})}});const cleanup=await h.make().run();assert.equal(cleanup.failure,'CLEANUP_FAILED');assert.equal(cleanup.metadataDiagnostic.lastFailure.errorKind,'AbortError');assert.equal(cleanup.metadataDiagnostic.lastCleanupFailure.nativeErrorKind,'AbortError');assert.equal(cleanup.mediaRequests,0);
});
test('historical maintained report is accepted as schema fixture only with exact large counts and bytes',async()=>{
 const old=JSON.parse(await readFile(new URL('../v2-07a-root-inventory/results.redacted.json',import.meta.url),'utf8')).inventoryOutput,s=summarizeInventoryDenominators(old);assert.deepEqual(s.counts,old.counts);assert.equal(s.sizes.totalKnownSizeBytes,old.sizes.totalKnownSizeBytes);assert.deepEqual(s.completeness.pageCountPerPass,old.completeness.pageCountPerPass);assert.equal(s.limitations.wholeCorpusComplete,false);
});
test('representatives cannot exceed inventory and coverage remains current-run metadata only',()=>{
 const s=summarizeInventoryDenominators(genuineReport(fixture()));assert.throws(()=>summarizeProbeDenominators({inventory:s,representatives:10,candidateTracks:1}),/INVENTORY_FAILED/);assert.throws(()=>summarizeProbeDenominators({inventory:s,representatives:2,candidateTracks:3}),/INVENTORY_FAILED/);assert.equal(summarizeProbeDenominators({inventory:s,representatives:9,candidateTracks:7}).wholeCorpusComplete,false);
});
test('v4 expression deterministic, isolated, current21 fenced and exact same strict lexical facade',async()=>{
 const a=await build(),b=await build();assert.equal(a.expression,b.expression);const sandbox={},fn=vm.runInNewContext(a.expression,sandbox);assert.deepEqual(Object.keys(sandbox),[]);assert.equal(fn(null,null,null,'metadata-only').poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');assert.equal(a.expression.includes('1.22.0-rc.16'),false);assert.equal(a.provenance.facadeVersionPinReplacements,2);
});
