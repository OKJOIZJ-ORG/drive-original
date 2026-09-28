import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {COMPARATOR_CODES,diagnoseComparisonFailure,sanitizeComparisonDiagnostic} from './comparison-diagnostics.mjs';
import {createMetadataCatalogComparison} from './metadata-catalog-driver.mjs';
import {buildMetadataBrowserBundleText} from './build-metadata-browser-bundle.mjs';
import {ORIGIN,VERSION} from './probe.mjs';
const coreSource=await readFile(new URL('../v2-07a-root-inventory/root-inventory.mjs',import.meta.url),'utf8');
const canonical=vm.runInNewContext(`(()=>{${coreSource.replace(/^export\s+/gm,'')}\nreturn {rootFence,stableItemRow,summarizeRepeatedInventory};})()`);
const root={id:'PRIVATE_ROOT',mimeType:'application/vnd.google-apps.folder',version:'1',modifiedTime:'2026-09-28T00:00:00.000Z',trashed:false,capabilities:{canListChildren:true}};
const file=(id,parents=['PRIVATE_ROOT'])=>({id,name:'PRIVATE_NAME',mimeType:'image/bmp',fullFileExtension:'bmp',version:'77',size:'10000',parents,modifiedTime:'2026-09-28T00:00:00.000Z',trashed:false,capabilities:{canDownload:true,canReadRevisions:true},imageMediaMetadata:{width:40,height:30}});
const pass=()=>({rootBefore:{...root},rootAfter:{...root},accountBefore:'PRIVATE_ACCOUNT',accountAfter:'PRIVATE_ACCOUNT',items:[file('PRIVATE_PRIORITY'),file('PRIVATE_OTHER')],shortcutTargets:[['PRIVATE_TARGET',file('PRIVATE_TARGET')]],traversedFolderCount:1,duplicateReferenceCount:0,unresolvedShortcutTargetCount:0,staleShortcutTargetMimeCount:0,pageCount:1});
const failure=code=>Object.assign(new Error('PRIVATE_ERROR_TEXT'),{code});
const diagnostic=(a,b,code='REPEAT_MISMATCH')=>diagnoseComparisonFailure(failure(code),a,b,canonical);
function assertPrivateOmitted(value){const serialized=JSON.stringify(value);for(const text of ['PRIVATE_ACCOUNT','PRIVATE_PRIORITY','PRIVATE_OTHER','PRIVATE_TARGET','PRIVATE_ROOT','PRIVATE_NAME','PRIVATE_TOKEN','PRIVATE_ERROR_TEXT'])assert.equal(serialized.includes(text),false,text);}

test('canonical reorder and excluded page-count changes report zero differences',()=>{
  const a=pass(),b=structuredClone(a);b.items.reverse();b.shortcutTargets.reverse();b.pageCount=999;
  canonical.summarizeRepeatedInventory({firstPass:a,secondPass:b,canonicalRootResolvedFromPriorityParent:true,priorityFileId:'PRIVATE_PRIORITY'});
  const result=diagnostic(a,b);assert.equal(result.diagnosticAvailable,true);
  for(const [key,value] of Object.entries(result))if(key.endsWith('Changed'))assert.equal(value,typeof value==='boolean'?false:0,key);
  assert.equal(result.itemsAdded+result.itemsRemoved+result.shortcutTargetsAdded+result.shortcutTargetsRemoved,0);assertPrivateOmitted(result);
});
test('single canonical item and shortcut add/remove/change counts preserve normalized equality',()=>{
  const a=pass(),b=structuredClone(a);b.items[0].name='PRIVATE_CHANGED';b.items.splice(1,1,file('PRIVATE_ADDED'));
  b.shortcutTargets[0][1].version='78';b.shortcutTargets.push(['PRIVATE_ADDED_TARGET',file('PRIVATE_ADDED_TARGET')]);
  const result=diagnostic(a,b);assert.deepEqual([result.itemsAdded,result.itemsRemoved,result.itemsChanged],[1,1,1]);
  assert.deepEqual([result.shortcutTargetsAdded,result.shortcutTargetsRemoved,result.shortcutTargetsChanged],[1,0,1]);assertPrivateOmitted(result);
  const c=structuredClone(a);c.items[0].version=77;c.items[0].size=10000;assert.equal(diagnostic(a,c).itemsChanged,0);
  const d=structuredClone(a);d.shortcutTargets=[];assert.equal(diagnostic(a,d).shortcutTargetsRemoved,1);
});
test('root/account/counter dimensions distinguish original comparator fences',()=>{
  for(const [field,expectedCode] of [['root','REPEAT_MISMATCH'],['account','ACCOUNT_CHANGED'],['counter','REPEAT_MISMATCH']]){
    const a=pass(),b=structuredClone(a);
    if(field==='root'){b.rootBefore.version='2';b.rootAfter.version='2';}
    if(field==='account'){b.accountBefore='PRIVATE_ACCOUNT_CHANGED';b.accountAfter='PRIVATE_ACCOUNT_CHANGED';}
    if(field==='counter')b.traversedFolderCount++;
    let cause;try{canonical.summarizeRepeatedInventory({firstPass:a,secondPass:b,canonicalRootResolvedFromPriorityParent:true,priorityFileId:'PRIVATE_PRIORITY'});}catch(error){cause=error;}
    assert.equal(cause.code,expectedCode);const result=diagnoseComparisonFailure(cause,a,b,canonical);
    assert.equal(result[`${field==='counter'?'traversedFolderCount':field+'Before'}Changed`],true);assert.equal(result.comparatorCode,expectedCode);assertPrivateOmitted(result);
  }
});
test('all8 codes are whitelisted; unknown and diagnostics failure expose no raw data',()=>{
  for(const code of COMPARATOR_CODES)assert.equal(diagnostic(pass(),pass(),code).comparatorCode,code);
  const unknown=diagnostic(pass(),pass(),'PRIVATE_UNRECOGNIZED');assert.equal(unknown.comparatorCode,'COMPARATOR_UNKNOWN');assert.equal(unknown.diagnosticAvailable,false);assertPrivateOmitted(unknown);
  const failed=diagnoseComparisonFailure(failure('REPEAT_MISMATCH'),pass(),pass(),{rootFence(){throw failure('PRIVATE');},stableItemRow:canonical.stableItemRow});
  assert.equal(failed.comparatorCode,'REPEAT_MISMATCH');assert.equal(failed.diagnosticAvailable,false);
  const extra={...diagnostic(pass(),pass()),rawId:'PRIVATE_PRIORITY',message:'PRIVATE_ERROR_TEXT'};
  assertPrivateOmitted(sanitizeComparisonDiagnostic(extra,failure('REPEAT_MISMATCH')));
  extra.itemsAdded='PRIVATE_NAME';assert.equal(sanitizeComparisonDiagnostic(extra,failure('REPEAT_MISMATCH')).diagnosticAvailable,false);
});
function browserFixture({drift=false}={}) {
  const state={accountId:'PRIVATE_ACCOUNT',authAccountKey:'PRIVATE_SUB',authStatus:'online',demo:false,accountIdentityPending:false,
    token:'PRIVATE_TOKEN',expiresAt:Date.now()+3600000,authGeneration:2,driveSessionGeneration:3,tokenRevision:4,accountStateAbortController:new AbortController()};
  const controller={state:'activated',scriptURL:ORIGIN+'/sw.js'},calls=[],listeners=new Set();let abouts=0;
  const nested={...root,id:'PRIVATE_NESTED',parents:['PRIVATE_ROOT']};
  const runtime={appVersion:VERSION,readState:()=>state,hasUsableToken:()=>true,getMutationsEnabled:()=>false,
    top:1,self:1,navigator:{onLine:true,serviceWorker:{controller}},location:{href:ORIGIN+'/'},
    // Deliberately no getSWIdentity; public script version is no executing SW proof.
    privateContext:{accountKey:state.accountId,generation:3,rootId:root.id,priorityFileId:'PRIVATE_PRIORITY'},
    addEventListener:type=>listeners.add(type),removeEventListener:type=>listeners.delete(type),
    nativeFetch:async(value,options)=>{
      const url=new URL(value);calls.push({url,options});assert.equal(options.method,'GET');assert.equal(url.searchParams.has('alt'),false);assert.equal(url.origin,'https://www.googleapis.com');
      if(url.pathname.endsWith('/about')){abouts++;return Response.json({user:{permissionId:state.accountId}});}
      const currentFile=file('PRIVATE_PRIORITY');if(drift&&abouts>5)currentFile.version='78';
      if(url.pathname.endsWith('/PRIVATE_ROOT'))return Response.json(root);
      if(url.pathname.endsWith('/PRIVATE_NESTED'))return Response.json(nested);
      if(url.pathname.endsWith('/PRIVATE_PRIORITY'))return Response.json(currentFile);
      if(url.searchParams.get('q')?.includes('PRIVATE_NESTED'))return Response.json({incompleteSearch:false,files:[file('PRIVATE_DEEP',['PRIVATE_NESTED'])]});
      if(url.searchParams.get('pageToken')==='PRIVATE_NEXT')return Response.json({incompleteSearch:false,files:[file('PRIVATE_OTHER')]});
      if(url.pathname.endsWith('/files'))return Response.json({incompleteSearch:false,nextPageToken:'PRIVATE_NEXT',files:[currentFile,nested]});
      throw failure('PRIVATE_BAD_URL');
    }};
  const dependencies={canonicalNormalizers:canonical};
  return {runtime,state,controller,calls,listeners,dependencies};
}
test('metadata-only canonical full pagination/nested traversal performs zero media/zero writes and releases once',async()=>{
  const f=browserFixture(),driver=createMetadataCatalogComparison(f.runtime,f.dependencies),pending=driver.run(),result=await pending;
  assert.equal(result.failure,null);assert.equal(result.inventoryRunsCompleted,2);assert.equal(result.catalogStable,true);assert.equal(result.comparisonAttempted,true);
  assert.equal(result.complete,true);assert.equal(result.mediaRequests,0);assert.equal(result.writeRequests,0);assert.equal(result.freshSWRuntimeVersionVerified,false);
  assert.equal(result.released,true);assert.equal(f.listeners.size,0);
  assert.equal(f.calls.filter(call=>call.url.searchParams.get('pageToken')==='PRIVATE_NEXT').length,4);
  assert.equal(f.calls.filter(call=>call.url.searchParams.get('q')?.includes('PRIVATE_NESTED')).length,4);
  assert.equal(driver.run(),pending);driver.cancel();assert.equal(driver.run(),pending);assertPrivateOmitted(result);
});
test('metadata-only cross-inventory drift retains canonical changed-row evidence without replaying bodies',async()=>{
  const f=browserFixture({drift:true}),result=await createMetadataCatalogComparison(f.runtime,f.dependencies).run();
  assert.equal(result.failure,'CATALOG_DRIFT');assert.equal(result.complete,false);assert.equal(result.catalogStable,false);assert.equal(result.catalogComparison.comparatorCode,'REPEAT_MISMATCH');
  assert.equal(result.catalogComparison.itemsChanged,1);assert.equal(result.catalogComparison.diagnosticAvailable,true);assert.equal(result.mediaRequests,0);assertPrivateOmitted(result);
});
test('unknown comparator and throwing diagnostics preserve fail-closed catalog state',async()=>{
  for(const unknown of [true,false]){
    const f=browserFixture();f.dependencies.compareInventory=()=>{throw failure(unknown?'PRIVATE_CODE':'REPEAT_MISMATCH');};
    f.dependencies.comparisonDiagnostics=()=>{throw failure('PRIVATE_DIAGNOSTIC_FAILURE');};
    const result=await createMetadataCatalogComparison(f.runtime,f.dependencies).run();
    assert.equal(result.failure,'CATALOG_DRIFT');assert.equal(result.complete,false);assert.equal(result.catalogStable,false);
    assert.equal(result.catalogComparison.comparatorCode,unknown?'COMPARATOR_UNKNOWN':'REPEAT_MISMATCH');assert.equal(result.catalogComparison.diagnosticAvailable,false);assertPrivateOmitted(result);
  }
});
test('metadata driver owner drift and account abort cannot dispatch a later inventory',async()=>{
  for(const mutate of [f=>f.state.tokenRevision++,f=>f.state.accountStateAbortController.abort(),f=>f.runtime.navigator.serviceWorker.controller={...f.controller}]){
    const f=browserFixture(),native=f.runtime.nativeFetch;f.runtime.nativeFetch=async(value,options)=>{const response=await native(value,options);mutate(f);return response;};
    const result=await createMetadataCatalogComparison(f.runtime,f.dependencies).run();assert.equal(result.failure,'OWNER_CHANGED');assert.equal(result.dispatches,1);assert.equal(result.released,true);
  }
});
test('metadata driver facade blocks alt=media and mutation methods before dispatch',async()=>{
  for(const options of [{url:'https://www.googleapis.com/drive/v3/files/PRIVATE_PRIORITY?alt=media'},
    {url:'https://www.googleapis.com/drive/v3/files/PRIVATE_PRIORITY',method:'PATCH'}]){
    const f=browserFixture();f.dependencies.inventoryRunner=async({driveFetch})=>driveFetch(options.url,{method:options.method});
    const result=await createMetadataCatalogComparison(f.runtime,f.dependencies).run();assert.equal(result.failure,'METADATA_FAILED');
    assert.equal(result.dispatches,0);assert.equal(f.calls.length,0);assert.equal(result.mediaRequests,0);assert.equal(result.writeRequests,0);
  }
});
test('metadata driver reader acquisition/held read failures are bounded and private',async()=>{
  for(const held of [false,true]){
    const f=browserFixture();let cancelled=0;f.dependencies.metadataTimeoutMs=15;
    f.runtime.nativeFetch=async()=>held?new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;return new Promise(()=>{});}})):
      {status:200,ok:true,body:{getReader(){throw failure('PRIVATE_READER');},cancel(){cancelled++;return Promise.resolve();}}};
    const start=Date.now(),result=await createMetadataCatalogComparison(f.runtime,f.dependencies).run();
    assert.equal(result.failure,held?'METADATA_FAILED':'INVENTORY_FAILED');assert.equal(result.released,true);assert.equal(cancelled,1);assert.ok(Date.now()-start<1000);assertPrivateOmitted(result);
  }
});
test('metadata factory bundle is deterministic, global-free and exercises real bundled comparator',async()=>{
  const source=await buildMetadataBrowserBundleText();assert.equal(source,await buildMetadataBrowserBundleText());
  const sandbox={URL,Headers,Response,Request,ReadableStream,AbortController,DOMException,Uint8Array,TextDecoder,setTimeout,clearTimeout,performance};
  const keys=Object.keys(sandbox),factory=vm.runInNewContext(source,sandbox);assert.equal(typeof factory,'function');assert.deepEqual(Object.keys(sandbox),keys);
  const f=browserFixture({drift:true}),result=await factory(f.runtime).run();assert.equal(result.failure,'CATALOG_DRIFT');assert.equal(result.catalogComparison.itemsChanged,1);
  assert.equal(result.mediaRequests,0);assert.equal(result.freshSWRuntimeVersionVerified,false);assertPrivateOmitted(result);
});
