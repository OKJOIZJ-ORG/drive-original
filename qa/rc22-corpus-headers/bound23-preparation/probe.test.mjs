import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createHeaderCohort,bindingPinned,CAPS,ORIGIN} from './probe.mjs';
import {collectHeaderCandidates,planHeaderCohort} from './selection.mjs';
import {clearHeaderContinuity,readHeaderContinuity} from './continuity.mjs';
import {summarizeRepeatedInventory,FOLDER_MIME,SHORTCUT_MIME} from '../v2-07a-root-inventory/root-inventory.mjs';
import {box,cat,moovFixture} from '../v2-07a-iso-tracks-rc11/fixtures.mjs';
import {build} from './build.mjs';
const binding={schema:'drive-original.corpus-header-source-binding/1',version:'1.22.0-rc.23',sourceCommit:'a'.repeat(40),sourceSHA256:{'app.js':'b'.repeat(64),'sw.js':'c'.repeat(64),'version.json':'d'.repeat(64)}};
function fixture(count=20){
 const state={accountId:'PRIVATE_ACCOUNT',authAccountKey:'PRIVATE_AUTHKEY',token:'PRIVATE_TOKEN',expiresAt:Date.now()+3600000,authGeneration:1,driveSessionGeneration:2,tokenRevision:3,mediaSession:4,accountStateAbortController:new AbortController(),authStatus:'online',demo:false,accountIdentityPending:false,selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
 const data=cat(box('ftyp',Buffer.from('isom'),Buffer.alloc(4)),moovFixture({audio:true}),box('mdat',Buffer.alloc(4000)));
 const files=Array.from({length:count},(_,i)=>({id:'PRIVATE_VIDEO_'+String(i).padStart(3,'0'),name:'PRIVATE_NAME_'+i+'.mp4',mimeType:'video/mp4',fullFileExtension:'mp4',size:String(data.length),version:'123456789',modifiedTime:'PRIVATE_DATE',parents:['PRIVATE_ROOT'],trashed:false,capabilities:{canDownload:true,canReadRevisions:true},data,headRevisionId:'PRIVATE_REV',sha256Checksum:'e'.repeat(64)}));
 const context={accountKey:state.accountId,authAccountKey:state.authAccountKey,generation:2,rootId:'PRIVATE_ROOT',priorityFileId:files[0].id};
 const root={id:context.rootId,mimeType:FOLDER_MIME,version:'1',modifiedTime:'PRIVATE_DATE',trashed:false,capabilities:{canListChildren:true}};
 const pass={accountBefore:state.accountId,accountAfter:state.accountId,rootBefore:root,rootAfter:root,items:files,shortcutTargets:[],pageCount:1,traversedFolderCount:1,duplicateReferenceCount:0,unresolvedShortcutTargetCount:0,staleShortcutTargetMimeCount:0};
 const selected=files.slice(0,Math.min(36,count)).map((row,i)=>({fileId:row.id,mandatoryReasons:i===0?['priority']:i===1?['largest:.mp4']:[]}));
 const selection={privateManifest:{selected}},controller={state:'activated',scriptURL:ORIGIN+'/sw.js'},retirement={settled:true},calls=[],listeners=new Set();let clock=0;
 const runtime={appVersion:binding.version,privateContext:context,options:{phase:'representatives',maxFiles:8},readState:()=>state,navigator:{onLine:true,serviceWorker:{controller}},location:{origin:ORIGIN,href:ORIGIN+'/'},document:{visibilityState:'visible'},top:1,self:1,getSWIdentity:()=>({controller,version:binding.version,sourceCommit:binding.sourceCommit,sourceSHA256:{...binding.sourceSHA256}}),getMutationsEnabled:()=>false,getQ1Playback:()=>null,getQ1RetirementResult:()=>retirement,getMediaSourceGeneration:()=>5,getPlayerMediaPriorityActive:()=>false,hasUsableToken:()=>true,addEventListener:t=>listeners.add(t),removeEventListener:t=>listeners.delete(t),nativeFetch:async(v,init)=>{
   const url=new URL(v);calls.push({url,init});if(url.origin!==ORIGIN){if(url.pathname.endsWith('/about'))return Response.json({user:{permissionId:state.accountId}});const row=files.find(x=>url.pathname.endsWith('/'+x.id));return Response.json({...row,data:undefined});}
   const row=files.find(x=>url.pathname.endsWith('/'+x.id));assert.equal(init.headers.Range,'bytes=0-939');return new Response(row.data.subarray(0,940),{status:206,headers:{'Content-Range':'bytes 0-939/'+row.size,'Content-Length':'940','Accept-Ranges':'bytes','Cache-Control':'no-store'}});
 }};
 const dependencies={binding,now:()=>clock,selector:()=>selection,inventoryRunner:async({driveFetch})=>{for(let i=0;i<8;i++)await(await driveFetch('https://www.googleapis.com/drive/v3/about')).json();return {report:summarizeRepeatedInventory({firstPass:pass,secondPass:pass,canonicalRootResolvedFromPriorityParent:true,priorityFileId:context.priorityFileId}),privatePasses:{firstPass:pass,secondPass:pass}};},compareInventory:()=>{}};
 return {state,files,context,pass,selection,runtime,dependencies,calls,listeners,setClock:n=>clock=n,make:()=>createHeaderCohort(runtime,dependencies)};
}

test('representative first cohort includes priority/largest,8 exact serial prefix GETs and honest20-row coverage',async()=>{
 const f=fixture(),job=f.make(),r=await job.run();assert.equal(r.complete,true);assert.equal(r.catalogStable,true);assert.equal(r.inventoryRuns,2);assert.equal(r.mediaRequests,8);assert.equal(r.mediaBytes,7520);assert.equal(r.metadataRequests,32);assert.equal(r.batches.length,1);assert.equal(r.batches[0].attempted,8);assert.deepEqual([r.coverage.classified,r.coverage.failed,r.coverage.ineligible,r.coverage.unattempted],[8,0,0,12]);assert.equal(r.wholeCorpusComplete,false);assert.equal(r.coverage.deeperMetadataProbed,0);assert.ok(f.calls.filter(x=>x.url.origin===ORIGIN).some(x=>x.url.pathname.endsWith(f.context.priorityFileId)));assert.ok(f.calls.filter(x=>x.url.origin===ORIGIN).some(x=>x.url.pathname.endsWith(f.files[1].id)));assert.equal(f.listeners.size,0);assert.equal(r.released,true);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));assert.deepEqual(Object.keys(job.continuity()),['schema']);assert.ok(!JSON.stringify(job.continuity()).includes('PRIVATE_'));
});
test('64-file cohort uses8 serial sub-batches, shared ledger, no deeper payload or64/file waiver',async()=>{
 const f=fixture(80);f.runtime.options={phase:'videos',maxFiles:64};const r=await f.make().run();assert.equal(r.mediaRequests,64);assert.equal(r.mediaBytes,64*940);assert.equal(r.metadataRequests,16+128);assert.equal(r.batches.length,8);assert.ok(r.batches.every(x=>x.attempted===8));assert.deepEqual([r.coverage.denominator,r.coverage.classified,r.coverage.unattempted],[80,64,16]);assert.ok(r.files.every(x=>x.identityPreflight&&x.identityPostflight&&x.mediaRequests===1));assert.ok(f.calls.filter(x=>x.url.origin===ORIGIN).every(x=>x.init.priority==='low'&&x.init.headers.Range==='bytes=0-939'));
});
test('true video MIME OR extension union dedupes shortcut target and retains blocked/small/missing rows as ineligible',()=>{
 const f=fixture(6);f.files[1].mimeType='application/octet-stream';f.files[2].fullFileExtension='unknown';f.files[3].size='940';f.files[4].capabilities.canDownload=false;f.files[5].version=null;
 f.pass.items.push({id:'PRIVATE_SHORTCUT',mimeType:SHORTCUT_MIME,shortcutDetails:{targetId:f.files[1].id,targetMimeType:f.files[1].mimeType,targetResourceKey:null}});f.pass.shortcutTargets=[[f.files[1].id,f.files[1]]];
 const c=collectHeaderCandidates(f.pass,f.selection,f.context.authAccountKey),p=planHeaderCohort(c,{phase:'videos',maxFiles:64});assert.equal(c.length,6);assert.equal(p.summary.denominator,6);assert.equal(p.summary.ineligible,3);assert.equal(p.plan.length,3);assert.ok(p.plan.some(x=>x.id===f.files[1].id));assert.throws(()=>planHeaderCohort(c,{maxFiles:65}),/SELECTION_FAILED/);
});
test('fresh owner preserves historical proof without counting it current; bounded revalidation admits it without prefix replay',async()=>{
 const f=fixture(12),first=f.make();await first.run();const capsule=first.continuity();f.state.tokenRevision++;f.state.token='PRIVATE_NEW_TOKEN';f.runtime.priorCapsule=capsule;f.runtime.options={phase:'videos',maxFiles:8};f.calls.length=0;
 const next=f.make(),r=await next.run();assert.equal(r.complete,true);assert.equal(r.mediaRequests,4);assert.equal(r.coverage.classified,4);assert.equal(r.coverage.historicalPendingRevalidation,8);assert.equal(r.coverage.unattempted,8);assert.equal(r.metadataRequests,24);assert.ok(f.calls.filter(x=>x.url.origin!==ORIGIN).every(x=>x.init.headers.get('Authorization')==='Bearer PRIVATE_NEW_TOKEN'));
 f.runtime.priorCapsule=next.continuity();f.runtime.options={phase:'revalidate-videos',maxFiles:8};const renewed=f.make(),s=await renewed.run();assert.equal(s.mediaRequests,0);assert.equal(s.metadataRequests,24);assert.equal(s.coverage.classified,12);assert.equal(s.coverage.unattempted,0);assert.equal(s.coverage.historicalPendingRevalidation,0);assert.ok(s.files.every(x=>x.immutableRevalidated));assert.ok(!JSON.stringify(s).includes('PRIVATE_'));assert.equal(clearHeaderContinuity(capsule),true);assert.throws(()=>readHeaderContinuity(capsule,f.context,binding),/CONTINUITY_REJECTED/);
});
test('fresh-owner checksum/version/root/source drift cannot silently reuse prior classification',async()=>{
 const f=fixture(10),job=f.make();await job.run();const capsule=job.continuity();f.state.tokenRevision++;f.runtime.priorCapsule=capsule;f.files[1].sha256Checksum='f'.repeat(64);f.files[2].version='123456790';const next=f.make(),r=await next.run();assert.equal(r.mediaRequests,3);assert.equal(r.coverage.classified,3);assert.equal(r.coverage.historicalPendingRevalidation,7);
 f.runtime.priorCapsule=next.continuity();f.runtime.options={phase:'revalidate-videos',maxFiles:8};const revalidation=f.make(),s=await revalidation.run();assert.equal(s.mediaRequests,0);assert.equal(s.coverage.classified,9);assert.equal(s.coverage.failed,1);assert.equal(s.files.filter(x=>x.failure==='CONTINUITY_CONTENT_CHANGED').length,1);
 f.runtime.priorCapsule=revalidation.continuity();f.runtime.options={phase:'videos',maxFiles:8};const t=await f.make().run();assert.equal(t.mediaRequests,1);assert.equal(t.coverage.classified,10);
 const g=fixture(10);g.runtime.priorCapsule=capsule;g.context.rootId='PRIVATE_CHANGED';const rejected=await g.make().run();assert.equal(rejected.complete,false);assert.equal(rejected.failure,'CONTINUITY_REJECTED');assert.equal(rejected.mediaRequests,0);
});
test('failed second protocol read maps exact failed denominator and does not corrupt successful first coverage',async()=>{
 const f=fixture(3),fetch=f.runtime.nativeFetch;let reads=0;f.runtime.nativeFetch=async(v,o)=>{const r=await fetch(v,o);if(new URL(v).origin===ORIGIN&&++reads===2)return new Response('PRIVATE_BAD',{status:200});return r;};const r=await f.make().run();assert.equal(r.complete,true);assert.deepEqual([r.coverage.classified,r.coverage.failed,r.coverage.unattempted],[2,1,0]);assert.equal(r.files[1].complete,false);assert.equal(r.files[0].complete,true);assert.equal(r.wholeCorpusComplete,false);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
});
test('missing immutable validator prevents every prefix; postflight drift prevents coverage admission',async()=>{
 const f=fixture(2);f.files[0].headRevisionId=null;f.files[0].sha256Checksum=null;const r=await f.make().run();assert.equal(r.coverage.failed,1);assert.equal(r.mediaRequests,1);
 const g=fixture(2),fetch=g.runtime.nativeFetch;g.runtime.nativeFetch=async(v,o)=>{const r=await fetch(v,o);if(new URL(v).origin===ORIGIN)g.files[0].sha256Checksum='f'.repeat(64);return r;};const s=await g.make().run();assert.equal(s.files[0].complete,false);assert.equal(s.coverage.failed,1);
});
test('natural token/source/controller owner change cancels active cohort and never publishes a continuity capsule',async()=>{
 for(const mutate of [f=>f.state.tokenRevision++,f=>f.runtime.getMediaSourceGeneration=()=>6,f=>f.runtime.navigator.serviceWorker.controller={}]){const f=fixture(),fetch=f.runtime.nativeFetch;f.runtime.nativeFetch=async(v,o)=>{const r=await fetch(v,o);if(new URL(v).origin===ORIGIN)mutate(f);return r;};const job=f.make(),r=await job.run();assert.equal(r.complete,false);assert.equal(r.mediaRequests,1);assert.equal(job.continuity(),null);assert.equal(r.released,true);assert.equal(f.listeners.size,0);assert.equal(f.calls.filter(x=>x.url.origin===ORIGIN).length,1);}
});
test('final reserve stops new header work when deadline budget is spent; final inventory still attempted',async()=>{
 const f=fixture(),fetch=f.runtime.nativeFetch;f.runtime.nativeFetch=async(v,o)=>{const r=await fetch(v,o);if(new URL(v).origin===ORIGIN)f.setClock(550000);return r;};const r=await f.make().run();assert.equal(r.mediaRequests,1);assert.equal(r.inventoryRuns,2);assert.equal(r.coverage.unattempted,19);assert.equal(r.complete,true);assert.equal(r.reserve.guaranteed,false);
});
test('unbound/wrong source proof rejects before any metadata/media and cannot create a capsule',async()=>{
 const f=fixture();f.dependencies.binding={...binding,sourceCommit:null};const r=await f.make().run();assert.equal(r.failure,'SOURCE_BINDING_REJECTED');assert.equal(f.calls.length,0);
 const g=fixture();g.runtime.getSWIdentity=()=>({controller:g.runtime.navigator.serviceWorker.controller,version:binding.version,sourceCommit:binding.sourceCommit,sourceSHA256:{...binding.sourceSHA256,'app.js':'0'.repeat(64)}});const s=await g.make().run();assert.equal(s.complete,false);assert.equal(g.calls.length,0);assert.equal(bindingPinned(binding),true);
});
test('final catalog drift keeps bodies unadmitted and continuity absent',async()=>{
 const f=fixture();f.dependencies.compareInventory=()=>{throw Error('PRIVATE_DRIFT');};const job=f.make(),r=await job.run();assert.equal(r.failure,'CATALOG_DRIFT');assert.equal(r.catalogStable,false);assert.equal(r.coverage,null);assert.equal(job.continuity(),null);assert.equal(r.released,true);
});
test('generator is deterministic and preserves exact declared23 source binding without current-code fallback',async()=>{
 const a=await build(),b=await build();assert.equal(a.expression,b.expression);assert.equal(a.provenance.bound,bindingPinned(a.provenance.binding));const sandbox={},fn=vm.runInNewContext(a.expression,sandbox);assert.deepEqual(Object.keys(sandbox),[]);assert.equal(fn(null,null).poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');assert.equal(typeof fn.clearContinuity,'function');assert.equal(a.expression.includes('1.22.0-rc.21'),false);
});
test('shared512 metadata cap also binds final inventory; no prefix is started without its reserve',async()=>{
 const f=fixture(),original=f.dependencies.inventoryRunner;f.dependencies.inventoryRunner=async args=>{for(let i=0;i<292;i++)await args.driveFetch('https://www.googleapis.com/drive/v3/about');return original(args);};
 const r=await f.make().run();assert.equal(r.failure,'METADATA_LIMIT');assert.equal(r.metadataRequests,512);assert.equal(r.mediaRequests,0);assert.equal(r.complete,false);assert.equal(r.catalogStable,false);assert.equal(r.released,true);
});
test('metadata response cap and failed cancellation are terminal, release lock and do not run later files',async()=>{
 const f=fixture();f.runtime.nativeFetch=async()=>new Response('x'.repeat(CAPS.metadataResponseBytes+1));const r=await f.make().run();assert.equal(r.failure,'METADATA_LIMIT');assert.equal(r.metadataRequests,1);assert.equal(r.mediaRequests,0);
 const g=fixture();let releases=0;g.runtime.nativeFetch=async()=>({status:200,body:{getReader:()=>({read:()=>Promise.reject(new DOMException('PRIVATE_READ','AbortError')),cancel:()=>Promise.reject(new DOMException('PRIVATE_CANCEL','AbortError')),releaseLock(){releases++;}})}});
 const job=g.make(),s=await job.run();assert.equal(s.failure,'CLEANUP_FAILED');assert.equal(s.metadataRequests,1);assert.equal(s.mediaRequests,0);assert.equal(releases,1);assert.equal(job.continuity(),null);assert.equal(s.released,true);assert.equal(g.listeners.size,0);assert.ok(!JSON.stringify(s).includes('PRIVATE_'));
});
test('cancelled pending media headers drain late body and retain no current continuity or further requests',async()=>{
 const f=fixture(),fetch=f.runtime.nativeFetch;let started,cancelled=0;const ready=new Promise(r=>started=r);
 f.runtime.nativeFetch=(v,o)=>{if(new URL(v).origin!==ORIGIN)return fetch(v,o);f.calls.push({url:new URL(v),init:o});started();return new Promise(resolve=>{o.signal.addEventListener('abort',()=>resolve({status:206,headers:new Headers({'Content-Range':'bytes 0-939/'+f.files[0].size,'Content-Length':'940','Accept-Ranges':'bytes','Cache-Control':'no-store'}),body:{cancel:async()=>{cancelled++;}}}),{once:true});});};
 const job=f.make(),pending=job.run();await ready;job.cancel();const r=await pending;assert.equal(r.complete,false);assert.equal(r.failure,'CANCELLED');assert.equal(r.mediaRequests,1);assert.ok(cancelled>=1);assert.equal(job.continuity(),null);assert.equal(r.released,true);assert.equal(f.calls.filter(x=>x.url.origin===ORIGIN).length,1);assert.equal(f.listeners.size,0);
});
test('capsule carries no bytes/credential/owner; caller buffers stay unchanged and forged handles fail closed',async()=>{
 const f=fixture(2),before=f.files[0].data.slice(),job=f.make();await job.run();const records=readHeaderContinuity(job.continuity(),f.context,binding);
 assert.ok(f.files[0].data.equals(before));assert.deepEqual(Object.keys(records[0]).sort(),['content','deeperMetadata','identity','kind','validationEpoch']);assert.equal(records[0].deeperMetadata,'not-probed');assert.ok(!JSON.stringify(records).includes('PRIVATE_TOKEN'));assert.throws(()=>readHeaderContinuity({schema:'drive-original.private-header-continuity-handle/1'},f.context,binding),/CONTINUITY_REJECTED/);assert.throws(()=>readHeaderContinuity(job.continuity(),f.context,{...binding,sourceCommit:'b'.repeat(40)}),/CONTINUITY_REJECTED/);
});
test('strict lexical facade validates options and guards projection/writer/token/controller even with equal refresh',async()=>{
 const source=await readFile(new URL('facade.function.js',import.meta.url),'utf8');
 for(const mutate of [v=>v.s.accountMediaState={liked:['changed']},v=>v.s.accountStateWriterId='changed',v=>v.s.tokenRevision++,v=>v.ctx.navigator.serviceWorker.controller={}]){
 const f=fixture(),s=f.state,c=f.runtime.navigator.serviceWorker.controller,self={};Object.assign(s,{accountMediaState:{liked:[]},accountStateWriterId:'writer',accountStateRevision:1,accountStateLoaded:true,accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,playbackSession:3});
 const ctx={__BINDING__:binding,state:s,APP_VERSION:binding.version,DRIVE_MUTATIONS_ENABLED:false,ACCOUNT_STATE_WRITES_ENABLED:true,navigator:f.runtime.navigator,location:f.runtime.location,document:f.runtime.document,top:self,self,q1RetirementResult:f.runtime.getQ1RetirementResult(),q1Playback:null,mediaSourceGeneration:5,playerMediaPriorityActive:false,hasUsableToken:()=>true,accountMediaStatesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),window:{addEventListener(){},removeEventListener(){}},fetch(){throw Error('unexpected');}};
 const facade=vm.runInNewContext('('+source+')',ctx),proof={get:()=>({controller:c,version:binding.version})};let owned;
 const job=facade.call(runtime=>{owned=runtime;return {run:()=>new Promise(()=>{}),poll:()=>({done:false}),cancel:()=>({cancelled:true}),continuity:()=>null};},JSON.stringify({accountKey:s.accountId,generation:2,rootId:'PRIVATE_ROOT',priorityFileId:f.context.priorityFileId}),proof,null,{phase:'representatives',maxFiles:8});
 assert.equal(job.poll().done,false);assert.equal(owned.readState(),s);s.accountMediaState={liked:[]};assert.equal(owned.readState(),s);mutate({s,ctx});assert.throws(()=>owned.readState(),/OWNER_CHANGED/);
 const rejected=facade.call(()=>assert.fail('must not dispatch'),JSON.stringify({accountKey:s.accountId,generation:2,rootId:'PRIVATE_ROOT',priorityFileId:f.context.priorityFileId}),proof,null,{phase:'videos',maxFiles:65});assert.equal(rejected.poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');
 }
});
test('unbound SW proof rejects before staticGET and never starts media or metadata transport',async()=>{
 const source=await readFile(new URL('sw-proof.function.js',import.meta.url),'utf8'),ctx={navigator:{serviceWorker:{controller:{state:'activated'}}},location:{origin:ORIGIN,href:ORIGIN+'/'},APP_VERSION:binding.version};ctx.navigator.serviceWorker.controller.scriptURL=ORIGIN+'/sw.js';
 const proof=vm.runInNewContext('('+source+')',ctx)({...binding,sourceCommit:null});await Promise.resolve();await Promise.resolve();assert.equal(proof.get(),null);assert.equal(proof.poll().accepted,false);assert.equal(proof.poll().staticAssetGET,0);assert.equal(proof.poll().mediaGET,0);assert.equal(proof.poll().metadataGET,0);
});
test('500-object progression preserves all private prior proofs and never stalls by revalidating the full growing corpus',async()=>{
 const f=fixture(500);f.runtime.options={phase:'videos',maxFiles:64};let capsule=null,reads=0,last;
 for(let cohort=0;cohort<8;cohort++){f.runtime.priorCapsule=capsule;const job=f.make(),r=await job.run();assert.equal(r.complete,true);assert.ok(r.mediaRequests<=64);assert.ok(r.metadataRequests<=144);reads+=r.mediaRequests;capsule=job.continuity();last=r;}
 assert.equal(reads,500);assert.equal(last.coverage.denominator,500);assert.equal(last.coverage.classified,500);assert.equal(last.coverage.unattempted,0);assert.equal(last.wholeCorpusComplete,false);
 f.state.tokenRevision++;f.runtime.priorCapsule=capsule;f.runtime.options={phase:'revalidate-videos',maxFiles:64};const fresh=f.make(),r=await fresh.run();assert.equal(r.mediaRequests,0);assert.equal(r.coverage.classified,64);assert.equal(r.coverage.historicalPendingRevalidation,436);assert.equal(readHeaderContinuity(fresh.continuity(),f.context,binding).length,500);
});
test('fixed source SW proof checks all three exact hashes and controller/cache identity before accepting',async()=>{
 const source=await readFile(new URL('sw-proof.function.js',import.meta.url),'utf8'),bodies={'app.js':'PUBLIC_APP','sw.js':'PUBLIC_SW','version.json':'{"version":"1.22.0-rc.23"}'},pin={...binding,sourceSHA256:Object.fromEntries(Object.entries(bodies).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]))};
 async function run(corrupt){const controller={state:'activated'},ctx={APP_VERSION:pin.version,navigator:{serviceWorker:{controller}},location:{origin:ORIGIN,href:ORIGIN+'/'},URL,crypto:webcrypto};let runtimeURL;
 ctx.caches={keys:async()=>['drive-original-shell-'+pin.version],open:async()=>({match:async()=>({url:runtimeURL})})};ctx.fetch=async value=>{const url=new URL(value),path=url.pathname.slice(1);if(path==='runtime-config.js')runtimeURL=value;const bytes=new TextEncoder().encode(path==='runtime-config.js'?'RUNTIME':path===corrupt?'DIFFERENT':bodies[path]);return {status:200,url:value,arrayBuffer:async()=>bytes.buffer};};
 const proof=vm.runInNewContext('('+source+')',ctx)(pin);for(let i=0;i<100&&!proof.poll().done;i++)await new Promise(r=>setTimeout(r,1));return proof;}
 const ok=await run(null);assert.equal(ok.poll().accepted,true);assert.equal(ok.poll().staticAssetGET,4);assert.equal(ok.get().sourceCommit,pin.sourceCommit);assert.deepEqual({...ok.get().sourceSHA256},pin.sourceSHA256);ok.clear();assert.equal(ok.get(),null);
 const bad=await run('app.js');assert.equal(bad.poll().accepted,false);assert.equal(bad.poll().failure,'SW_SOURCE_HASH_MISMATCH');assert.equal(bad.get(),null);assert.equal(bad.poll().mediaGET,0);assert.equal(bad.poll().metadataGET,0);
});
test('direct invalid options reject before inventory and caller option mutation cannot broaden an active cohort',async()=>{
 const f=fixture();f.runtime.options={phase:'videos',maxFiles:65};const r=await f.make().run();assert.equal(r.failure,'RUNTIME_REJECTED');assert.equal(f.calls.length,0);
 const g=fixture(),options={phase:'videos',maxFiles:1};g.runtime.options=options;const job=g.make();options.maxFiles=64;const s=await job.run();assert.equal(s.mediaRequests,1);assert.equal(s.plan.maxFiles,1);
});
