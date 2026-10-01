import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createCorpusTracksProbe,BINDING,VERSION,ORIGIN,CAPS} from './probe.mjs';
import {summarizeRepeatedInventory} from '../v2-07a-root-inventory/root-inventory.mjs';
import {box,cat,moovFixture} from '../v2-07a-iso-tracks-rc11/fixtures.mjs';
import {build,buildProof} from './build.mjs';
import {selectRiskRepresentatives,RepresentativeSelectionError} from '../v2-07a-representative-selection/representative-selector.mjs';
import {planDeepCohorts,safeReferences} from './selection.mjs';
import {sanitizeFailureDiagnostic} from './diagnostics.mjs';
import {createMoovWindowCache} from './moov-window-cache.mjs';
import {normalizeProbeIdentity} from '../v2-07a-bounded-probe/bounded-probe.mjs';
import {execFileSync} from 'node:child_process';
const base=new URL('./',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex'),cases=[];
const canaryPaths=(v,path='')=>typeof v==='string'?(v.includes('PRIVATE_')?[path]:[]):v&&typeof v==='object'?Object.entries(v).flatMap(([k,x])=>canaryPaths(x,path+'.'+k)):[];
const old=await readFile(new URL('../rc16-corpus-tracks/probe.test.mjs',base),'utf8');
const factory=vm.runInNewContext(old.slice(old.indexOf('const hash='),old.indexOf("\ntest('"))+'\nfixture;',{Buffer,AbortController,Response,URL,Date,createHash,cat,box,moovFixture,createCorpusTracksProbe,VERSION,ORIGIN});
function fixture(){
 const f=factory(),controller=f.runtime.navigator.serviceWorker.controller;
 f.runtime.getSWIdentity=()=>({...BINDING,controller});
 f.rows.forEach((r,i)=>Object.assign(r,{mandatoryReasons:[i===0?'priority':'metadata-stratum'],coveredCategories:['extension:.'+r.extension]}));
 const root={id:f.context.rootId,version:'1',modifiedTime:'PRIVATE_DATE',mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canListChildren:true}};
 f.pass={accountBefore:f.state.accountId,accountAfter:f.state.accountId,rootBefore:root,rootAfter:root,items:f.files.map((x,i)=>({id:x.id,name:'PRIVATE_NAME_'+i,version:f.rows[i].version,size:f.rows[i].size,modifiedTime:f.rows[i].modifiedTime,mimeType:x.mime,fileExtension:x.ext,parents:[root.id],trashed:false,capabilities:{canDownload:true,canReadRevisions:true}})),shortcutTargets:[],pageCount:1,traversedFolderCount:1,duplicateReferenceCount:0,unresolvedShortcutTargetCount:0,staleShortcutTargetMimeCount:0,incompleteSearchCount:0,paginationCycleCount:0};
 const report=summarizeRepeatedInventory({firstPass:f.pass,secondPass:f.pass,priorityFileId:f.context.priorityFileId,canonicalRootResolvedFromPriorityParent:true});
 f.dependencies.inventoryRunner=async({driveFetch})=>{await(await driveFetch('https://www.googleapis.com/drive/v3/about')).json();return {report,privatePasses:{secondPass:f.pass}};};
 return f;
}
async function check(name,fn){await fn();cases.push({name,passed:true});}
const entrySource=await readFile(new URL('entry.function.js',base),'utf8');
function targetFixture(){
 const f=fixture(),s=f.state,c=f.runtime.navigator.serviceWorker.controller,self={};Object.assign(s,{accountStateLoaded:true,accountStateWriterId:'PRIVATE_WRITER',accountStateRevision:1,accountMediaState:{favorites:{}},accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,playbackSession:1,currentFolderId:'root',rootFolderId:f.context.rootId,folderStack:[],query:'',filter:'all',folderRenderLimit:8,folders:[],files:[structuredClone(f.pass.items[0])]});delete s.files[0].version;
 const button={closest:()=>({dataset:{fileId:f.rows[0].fileId}}),isConnected:true,contains:()=>false,getBoundingClientRect:()=>({x:10,y:10,width:100,height:40,left:10,right:110,top:10,bottom:50})},listeners=new Map();
 const env={APP_VERSION:VERSION,DRIVE_MUTATIONS_ENABLED:false,ACCOUNT_STATE_WRITES_ENABLED:true,state:s,navigator:f.runtime.navigator,location:f.runtime.location,top:self,self,document:{visibilityState:'visible',querySelectorAll:()=>[button],elementFromPoint:()=>button},mediaSourceGeneration:5,q1Playback:null,q1RetirementResult:f.runtime.getQ1RetirementResult(),playerMediaPriorityActive:false,hasUsableToken:()=>true,accountMediaStatesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),innerWidth:1000,innerHeight:800,devicePixelRatio:1,URL,AbortController,Uint8Array,TextDecoder,setTimeout,clearTimeout,window:{addEventListener:(t,fn)=>listeners.set(t,fn),removeEventListener:(t)=>listeners.delete(t)},fetch:async(u,o)=>{f.calls.push({url:new URL(u),init:o});if(env.onRead)await env.onRead();return Response.json(env.freshOverride??f.pass.items[0]);},buildBreadcrumbItems:(stack,id,name)=>[{id:'root',name:'내 드라이브'},...stack,{id,name}]};
 const create=(_runtime,witness)=>{witness(f.selection,f.pass);return {poll:()=>({done:true,summary:{catalogStable:true,released:true}}),cancel:()=>({cancelled:true})};},facade=function(){return this({});},proof={get:()=>({...BINDING,controller:c})};
 const entry=vm.runInNewContext('('+entrySource+')',env)(create,facade,BINDING);entry('{}',proof,{cohort:1,mode:'probe'});return {...f,env,entry,proof,button,listeners};
}
const built=await build(),proofExpression=await buildProof();
new vm.Script(built.expression);new vm.Script(proofExpression);
const contextExpression=await readFile(new URL('derive-context.expression.js',base),'utf8');new vm.Script(contextExpression);
await check('fixed31-git-source-three-byte-pins-and-frozen-runtime-logic',async()=>{
 assert.equal(BINDING.sourceCommit,'4a484e6f839d2e6c3eb83503acb08147362cb011');assert.equal(VERSION,'1.22.0-rc.31');
 for(const p of ['app.js','sw.js','version.json'])assert.equal(hash(execFileSync('git',['show',BINDING.sourceCommit+':'+p])),BINDING.sourceSHA256[p]);
 assert.deepEqual(CAPS,{isoFiles:5,webmFiles:1,unknownFiles:2,files:8,mediaRequests:64,mediaBytes:2*1024*1024+8192,fileMs:50000,runMs:600000,metadataRequests:512,metadataResponseBytes:2*1024*1024,metadataBytes:64*1024*1024});
 assert.equal(built.provenance.facadeVersionPinReplacements,2);
 assert.match(built.expression,/const \{normalizeProbeIdentity\}=bounded;/);
});
await check('builder-rejects-arbitrary-binding-and-owned-runtime-module-drift',async()=>{
 const pinURL=new URL('binding.json',base),cacheURL=new URL('moov-window-cache.mjs',base),originalPin=await readFile(pinURL),originalCache=await readFile(cacheURL);
 try{await writeFile(pinURL,JSON.stringify({...BINDING,sourceCommit:'0'.repeat(40)}));await assert.rejects(build(),/FIXED31_REQUIRED/);}finally{await writeFile(pinURL,originalPin);}
 try{await writeFile(cacheURL,Buffer.concat([originalCache,Buffer.from('\n// synthetic drift counterexample\n')]));await assert.rejects(build(),/FROZEN29_MODULE_HASH_REQUIRED/);}finally{await writeFile(cacheURL,originalCache);}
});
await check('generated31-rejects-old29-app-proof-wrong-hash-and-source-before-requests',async()=>{
 const prior=JSON.parse(await readFile(new URL('../rc29-deeper-coalesced-probe/binding.json',base)));
 for(const change of [f=>f.env.APP_VERSION=prior.version,f=>f.proof={get:()=>({...prior,controller:f.env.navigator.serviceWorker.controller})},f=>f.proof={get:()=>({...BINDING,sourceCommit:'0'.repeat(40),controller:f.env.navigator.serviceWorker.controller})},f=>f.proof={get:()=>({...BINDING,sourceSHA256:{...BINDING.sourceSHA256,'app.js':'0'.repeat(64)},controller:f.env.navigator.serviceWorker.controller})}]){
  const f=targetFixture();change(f);const entry=vm.runInNewContext(built.expression,f.env),job=entry('{}',f.proof,{cohort:2,mode:'probe'});
  for(let i=0;i<100&&!job.poll().done;i++)await new Promise(r=>setTimeout(r,1));assert.equal(job.poll().summary.complete,false);assert.equal(f.calls.length,0);entry.cleanup();
 }
});
await check('pure-current-reselection-cohort2-not-old-private-import-or-rotation-claim',async()=>{
 const oldSafe=JSON.parse(await readFile(new URL('../rc29-resume-20261001/actual-deeper-cohort1-safe.json',base))).summary.stratumCoverage;
 const rows=oldSafe.references.map((r,i)=>({fileId:'PRIVATE_SYNTHETIC_'+i,version:'1',size:'100000',modifiedTime:'PRIVATE_TIME',extension:r.extension,mimeType:r.mimeType,visibleReferences:[{resourceKey:null}],mandatoryReasons:r.mandatoryReasons,coveredCategories:r.metadataRiskCategories}));
 const selected={privateManifest:{schema:'drive-original.v2-07a-risk-selection-private/1',selected:rows,prioritySample:{fileId:rows[0].fileId,version:'1'}},report:{coverage:{uncoveredCategoryCount:0}}},context={authAccountKey:'PRIVATE_ACCOUNT',priorityFileId:rows[0].fileId,priorityVersion:'1'};
 const p=planDeepCohorts(selected,context,2);assert.equal(p.summary.cohorts,11);assert.deepEqual(p.plan.map(x=>x.reference),['representative-5','representative-6','representative-7']);assert.equal(p.summary.planned,3);assert.equal(p.summary.priorPrivateMappingAvailable,false);assert.equal(p.stratumCoverage.actualWholeCodecCombinationCoverage,false);assert.equal(p.stratumCoverage.hdrPresence,'unknown');assert.equal(p.stratumCoverage.vfrPresence,'unknown');
 assert.deepEqual(canaryPaths(p.stratumCoverage),[]);assert(p.stratumCoverage.references.some(x=>x.metadataRiskCategories.some(y=>y.startsWith('imageRotation:'))&&!x.planned));
 // Catalog reordering gives new safe references; old private identity is never admitted.
 [rows[5],rows[18]]=[rows[18],rows[5]];const changed=planDeepCohorts(selected,context,2);assert(changed.plan.some(x=>x.row.coveredCategories.includes('imageRotation:2')));assert.equal(changed.summary.bodyCoverageComplete,false);
});
async function generatedRun({changeOwner=false,cohort=1}={}){
 const f=targetFixture();f.env.Headers=Headers;f.env.performance=performance;let media=0;
 if(cohort===2){const source=f.files.find(x=>x.ext==='webm'),item=f.pass.items.find(x=>x.id===source.id),id='PRIVATE_SYNTHETIC_SECOND_EBML';f.files.push({...source,id,ext:'mkv',mime:'video/x-matroska'});f.pass.items.push({...item,id,name:'PRIVATE_SECOND_EBML',mimeType:'video/x-matroska',fileExtension:'mkv'});}
 f.env.fetch=async(url,options)=>{const u=new URL(url);if(u.origin===ORIGIN){media++;const r=await f.runtime.nativeFetch(url,options);if(changeOwner)f.state.tokenRevision++;return r;}
  f.calls.push({url:u,init:options});if(u.pathname.endsWith('/about'))return Response.json({user:{permissionId:f.state.accountId}});if(u.pathname==='/drive/v3/files')return Response.json({incompleteSearch:false,files:f.pass.items});if(u.pathname.endsWith('/'+f.context.rootId))return Response.json(f.pass.rootBefore);const item=f.pass.items.find(x=>u.pathname.endsWith('/'+x.id));assert(item);return Response.json(item);};
 const entry=vm.runInNewContext(built.expression,f.env),job=entry(JSON.stringify({accountKey:f.state.accountId,generation:f.state.driveSessionGeneration,rootId:f.context.rootId,priorityFileId:f.context.priorityFileId}),f.proof,{cohort,mode:'probe'});
 for(let i=0;i<1500&&!job.poll().done;i++)await new Promise(resolve=>setTimeout(resolve,1));assert(job.poll().done);return {f,entry,r:job.poll().summary,media};
}
await check('generated31-real-inventory-selector-serializer-iso-ebml-tracks-postflight-final-reserve',async()=>{
 const {f,entry,r}=await generatedRun();assert.equal(r.complete,true,JSON.stringify(r.failureDiagnostic));assert.equal(r.catalogStable,true);assert.equal(r.inventoryRuns,2);assert.equal(r.released,true);assert(r.files.some(x=>x.kind==='iso-bmff'&&x.tracks.status==='parsed'));assert(r.files.some(x=>x.kind==='webm'&&x.tracks.status==='parsed'));assert(r.files.length<=8);assert(r.files.every(x=>x.mediaRequests<=64&&x.mediaBytes<=CAPS.mediaBytes&&x.identityPreflight&&x.identityPostflight&&x.ownedReadCleanupSettled));assert(r.reserve.requests>0&&r.reserve.bytes>0&&r.reserve.ms>=30000);assert(r.metadataRequests<=512&&r.metadataBytes<=CAPS.metadataBytes);assert(f.calls.every(x=>x.init.method==='GET'));assert.deepEqual(canaryPaths(r),[]);entry.cleanup();assert.equal((await entry.target('representative-1')).ready,false);
});
await check('generated31-cohort2-fresh-inventory-plan-is-not-cohort1-retry',async()=>{
 const {f,entry,r}=await generatedRun({cohort:2});assert.equal(r.complete,true,JSON.stringify(r.failureDiagnostic));assert.equal(r.plan.cohort,2);assert.equal(r.plan.priorPrivateMappingAvailable,false);assert(r.files.length>0);assert.equal(r.catalogStable,true);assert.equal(r.inventoryRuns,2);assert.equal(r.released,true);assert(r.files.every(x=>x.mediaRequests<=64&&x.mediaBytes<=CAPS.mediaBytes));assert(f.calls.every(x=>x.init.method==='GET'));entry.cleanup();
});
await check('generated31-renewal-cancels-current-owner-no-token-rebind-or-second-media',async()=>{
 const {entry,r,media}=await generatedRun({changeOwner:true});assert.equal(r.complete,false);assert.equal(r.catalogStable,false);assert.equal(media,1);assert.equal(r.released,true);assert.equal((await entry.target('representative-1')).reason,'FINAL_CATALOG_UNQUALIFIED');assert.deepEqual(canaryPaths(r),[]);entry.cleanup();
});
function contextFixture({wrongProof=false,changeOwner=false}={}){
 const c={state:'activated'},calls=[],env={APP_VERSION:VERSION,state:{accountId:'PRIVATE_ACCOUNT',driveSessionGeneration:7,token:'PRIVATE_TOKEN',tokenRevision:3,authStatus:'online',selected:null},q0Playback:null,q1Playback:null,q1RetirementResult:{settled:true},document:{visibilityState:'visible'},navigator:{serviceWorker:{controller:c}},hasUsableToken:()=>true,URL,AbortController,setTimeout,clearTimeout,window:{__rc31DeeperPriorityName:'PRIVATE_NAME',__rc31DeeperSwProof:{get:()=>({...BINDING,sourceCommit:wrongProof?'0'.repeat(40):BINDING.sourceCommit,controller:c})}},fetch:async url=>{calls.push(url);if(changeOwner)env.state.tokenRevision++;return Response.json(calls.length===1?{files:[{id:'PRIVATE_PRIORITY',parents:['PRIVATE_ROOT']}],incompleteSearch:false}:{id:'PRIVATE_ROOT',mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canListChildren:true}});}};return {env,calls};
}
await check('context31-exact-four-key-serializer-two-unique-priority-parent-gets-no-export',async()=>{
 const f=contextFixture(),r=await vm.runInNewContext(contextExpression,f.env);assert.equal(r.metadataGETs,2);assert.equal(r.privateContextExported,false);assert.deepEqual(Object.keys(JSON.parse(f.env.window.__rc31DeeperContext)).sort(),['accountKey','generation','priorityFileId','rootId']);assert.equal(f.env.window.__rc31DeeperPriorityName,undefined);assert(!JSON.stringify(r).includes('PRIVATE_'));
});
await check('context31-rejects-unqualified-proof-and-inflight-credential-owner-change',async()=>{
 const wrong=contextFixture({wrongProof:true});await assert.rejects(vm.runInNewContext(contextExpression,wrong.env));assert.equal(wrong.calls.length,0);
 const changed=contextFixture({changeOwner:true});await assert.rejects(vm.runInNewContext(contextExpression,changed.env));assert.equal(changed.calls.length,1);assert.equal(changed.env.window.__rc31DeeperContext,undefined);
});
await check('source-proof31-runtime-cache-coupling-exact-source-pins-and-live-controller-fence',async()=>{
 const controller={state:'activated'},shell='drive-original-shell-'+VERSION;let runtimeRecord=null;const calls=[];
 const env={APP_VERSION:VERSION,URL,Uint8Array,crypto:globalThis.crypto,location:{origin:ORIGIN,href:ORIGIN+'/'},navigator:{serviceWorker:{controller}},caches:{keys:async()=>[shell],open:async()=>({match:async()=>runtimeRecord})},fetch:async url=>{calls.push(url);const u=new URL(url),p=u.pathname.slice(1);const bytes=p==='runtime-config.js'?new Uint8Array([1,2,3]):execFileSync('git',['show',BINDING.sourceCommit+':'+p]);const response=new Response(bytes);Object.defineProperty(response,'url',{value:url});if(p==='runtime-config.js')runtimeRecord=response;return response;}};
 const proof=vm.runInNewContext(proofExpression,env);for(let i=0;i<500&&!proof.poll().done;i++)await new Promise(r=>setTimeout(r,1));assert.equal(proof.poll().accepted,true,JSON.stringify(proof.poll()));assert.equal(calls.length,4);assert.equal(proof.poll().metadataGET,0);assert.equal(proof.poll().mediaGET,0);assert.equal(proof.get().sourceCommit,BINDING.sourceCommit);assert.equal(proof.get().controller,controller);
 env.navigator.serviceWorker.controller={state:'activated'};assert.equal(proof.get(),null);env.navigator.serviceWorker.controller=controller;proof.clear();assert.equal(proof.get(),null);
});
await check('source-proof31-rejects-old-app-and-tampered-static-body',async()=>{
 const controller={state:'activated'},env={APP_VERSION:'1.22.0-rc.29',URL,Uint8Array,crypto:globalThis.crypto,location:{origin:ORIGIN,href:ORIGIN+'/'},navigator:{serviceWorker:{controller}},fetch:async()=>{throw Error('REQUEST_MUST_NOT_HAPPEN');}};
 const denied=vm.runInNewContext(proofExpression,env);for(let i=0;i<20&&!denied.poll().done;i++)await new Promise(r=>setTimeout(r,1));assert.equal(denied.poll().accepted,false);assert.equal(denied.poll().staticAssetGET,0);
 env.APP_VERSION=VERSION;let record=null;env.caches={keys:async()=>['drive-original-shell-'+VERSION],open:async()=>({match:async()=>record})};env.fetch=async url=>{const response=new Response('tampered');Object.defineProperty(response,'url',{value:url});if(new URL(url).pathname==='/runtime-config.js')record=response;return response;};const bad=vm.runInNewContext(proofExpression,env);for(let i=0;i<500&&!bad.poll().done;i++)await new Promise(r=>setTimeout(r,1));assert.equal(bad.poll().accepted,false);assert.equal(bad.poll().failure,'SW_SOURCE_HASH_MISMATCH');assert.equal(bad.get(),null);
});
await check('ts-label-no-synthetic-track-continuation-and-frozen29-case-reuse',async()=>{
 const parent=JSON.parse(await readFile(new URL('../rc29-deeper-coalesced-probe/local-verification.json',base)));assert.equal(parent.passed,28);
 for(const p of ['entry.function.js','selection.mjs','facade.function.js','diagnostics.mjs','moov-window-cache.mjs'])assert.equal(hash(await readFile(new URL(p,base))),parent.fileSHA256[p]);
 const probe=await readFile(new URL('probe.mjs',base),'utf8');assert.match(probe,/kind==='mpeg-ts'\?'TS_DEFERRED_NO_CONTINUATION'/);assert.match(probe,/output\.tracks=null|tracks:null/);assert.equal(built.provenance.expressionSHA256,hash(built.expression));
});
await writeFile(new URL('factory.expression.js',base),built.expression);await writeFile(new URL('sw-proof.expression.js',base),proofExpression);
const inherited=JSON.parse(await readFile(new URL('../rc29-deeper-coalesced-probe/local-verification.json',base)));
const files=['entry.function.js','probe.mjs','selection.mjs','facade.function.js','binding.json','build.mjs','verify.mjs','factory.expression.js','sw-proof.function.js','sw-proof.expression.js','derive-context.expression.js','diagnostics.mjs','moov-window-cache.mjs','README.md'];
const fileSHA256=Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await readFile(new URL(p,base)))])));
const provenance={...built.provenance,sourceProofExpressionSHA256:hash(proofExpression),contextExpressionSHA256:hash(contextExpression),contextSerializerKeys:['accountKey','generation','priorityFileId','rootId'],contextMaximumGETs:2,sourceProofMaximumStaticGETs:4,freshCatalogRequired:true,oldPrivateRegistryImported:false,cohort2NotWholeCorpus:true,actualExecution:false};
await writeFile(new URL('provenance.json',base),JSON.stringify(provenance,null,2)+'\n');
await writeFile(new URL('local-verification.json',base),JSON.stringify({schema:'drive-original.rc31-deeper-coalesced-probe-local/1',sourceCommit:BINDING.sourceCommit,version:VERSION,cases,passed:cases.length,frozenCasesReusedWithoutRerun:inherited.passed,frozenVerificationSHA256:hash(await readFile(new URL('../rc29-deeper-coalesced-probe/local-verification.json',base))),fileSHA256,actualRequests:0,actualExecution:false,productEdits:false,noLimitsChanged:true,cohort2HistoricalSafeShape:{cohorts:11,planned:3,references:['representative-5','representative-6','representative-7'],currentReselectionRequired:true}},null,2)+'\n');
await writeFile(new URL('curated-savepoint.json',base),JSON.stringify({exactOwnedFiles:[...files,'provenance.json','local-verification.json','curated-savepoint.json'].map(p=>'qa/rc31-deeper-coalesced-probe/'+p),commitOwner:'root',actualResultsExcluded:true,privateDataExcluded:true},null,2)+'\n');
console.log(JSON.stringify({passed:cases.length,frozenCasesReused:inherited.passed,expressionSHA256:hash(built.expression),expressionBytes:Buffer.byteLength(built.expression),sourceProofSHA256:hash(proofExpression),contextSHA256:hash(contextExpression),actualRequests:0}));
