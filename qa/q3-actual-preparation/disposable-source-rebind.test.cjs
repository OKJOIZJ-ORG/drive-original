'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {prepareSourceRebind}=require('./disposable-source-rebind.cjs');
const oldBinding=JSON.parse(fs.readFileSync(__dirname+'/disposable-binding.json'));
const binding=JSON.parse(fs.readFileSync(__dirname+'/disposable-cleanup-rc34-binding.json'));
const canonical=x=>JSON.stringify((function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;})(x));
const factory=vm.runInNewContext(fs.readFileSync(__dirname+'/disposable-cleanup-rc34-factory.expression.js','utf8'),{AbortController,AbortSignal,Blob,URL,URLSearchParams,Uint8Array,TextDecoder,setTimeout,clearTimeout});
function input(){
 const run='11111111-1111-4111-8111-111111111111',account={accountId:'QA_FAKE_ACCOUNT',accountKey:'QA_FAKE_KEY'};
 const fixture={bytes:18075476,sha256:'cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a',md5:'6df04298bf9b43cd60e3af70cd1e309f'};
 const root={id:'QA_FAKE_ROOT',mimeType:'application/vnd.google-apps.folder',version:'1',ownedByMe:true,trashed:false,capabilities:{canAddChildren:true}};
 const planned=['folder-a','test-video-1'].map((role,i)=>({id:i?'QA_FAKE_VIDEO':'QA_FAKE_FOLDER',role,sent:true,intent:{method:'POST',route:i?'multipart-create':'metadata-create',metadata:{id:i?'QA_FAKE_VIDEO':'QA_FAKE_FOLDER',name:`DriveOriginal-QA-${run}-${role}`,mimeType:i?'video/mp4':'application/vnd.google-apps.folder',parents:[i?'QA_FAKE_FOLDER':root.id],appProperties:{qaRun:run,qaRole:role,qaFixtureSHA256:fixture.sha256}},fixtureSHA256:i?fixture.sha256:null,fixtureBytes:i?fixture.bytes:0}}));
 const created=planned.map((p,i)=>({id:p.id,role:p.role,metadata:{...structuredClone(p.intent.metadata),version:'1',modifiedTime:'fake-date',ownedByMe:true,trashed:false,capabilities:{canTrash:true,canDownload:true},...(i?{size:String(fixture.bytes),md5Checksum:fixture.md5,sha256Checksum:fixture.sha256}:{})}}));
 const ledger={schema:1,purpose:'q3-exact-fixture',run,...account,binding:oldBinding,fixture,root,planned,created,events:[],status:'recovery-verified'};
 const pointer={run,...account,source:oldBinding.source};
 return {ledger,pointer,oldBinding,binding,account,expectedLedger:structuredClone(ledger),expectedPointer:structuredClone(pointer)};
}
function fake(plan,{foreignChild=false,ownerDrift=false,losePatch=false}={}){
 const stored=new Map([[plan.ledgerKey,JSON.stringify(plan.ledger)],[plan.pointerKey,JSON.stringify(plan.pointer)]]);
 const files=new Map(plan.ledger.created.map(x=>[x.id,structuredClone(x.metadata)]));
 const owner={accountId:plan.ledger.accountId,accountKey:plan.ledger.accountKey,token:'FAKE_TOKEN',signal:new AbortController().signal,controller:{state:'activated'},version:binding.version,source:binding.source,hashes:canonical(binding.sourceSHA256),driveWrite:true,safe:true};
 const calls=[];
 const env={read:()=>({...owner}),storage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},lifecycle:new EventTarget(),fetch:async(address,options)=>{
  const u=new URL(address),id=u.pathname.split('/').at(-1);calls.push({method:options.method,id});
  assert.equal(options.redirect,'error'); assert.equal(options.credentials,'omit');
  if(id==='root')return Response.json(plan.ledger.root);
  if(u.pathname==='/drive/v3/files')return Response.json({incompleteSearch:false,files:foreignChild?[{id:'FOREIGN_ORIGINAL'}]:[...files.values()].filter(x=>x.parents[0]==='QA_FAKE_FOLDER'&&!x.trashed)});
  assert(files.has(id)); const row=files.get(id);
  if(options.method==='PATCH'){
   assert.equal(options.body,'{"trashed":true}'); assert(!u.searchParams.has('addParents')); assert(!u.searchParams.has('removeParents'));
   row.trashed=true; row.version=String(Number(row.version)+1);
   if(id==='QA_FAKE_VIDEO')files.get('QA_FAKE_FOLDER').version='2';
   if(losePatch)throw Error('fake-response-loss');
  }
  if(ownerDrift)owner.safe=false;
  return Response.json(row);
 }};
 return {env,calls,files,stored,start:()=>factory(env,binding,{recoveryRun:plan.ledger.run})};
}
test('pure source rebind preserves exact fixture/IDs/intents/metadata and has no input mutation',()=>{
 const i=input(),before=canonical(i),p=prepareSourceRebind(i);assert.equal(canonical(i),before);
 for(const k of ['planned','created','fixture','root','accountId','accountKey','run'])assert.equal(canonical(p.ledger[k]),canonical(i.ledger[k]));
 assert.equal(p.ledger.events.at(-1).providerWrite,false);assert.equal(p.pointer.source,binding.source);
});
test('account/source/fixture/ID/live-ledger drift reject before adaptation',()=>{
 for(const mutate of [i=>i.account.accountId='OTHER',i=>i.binding={...binding,source:'a'.repeat(40)},i=>i.ledger.fixture.bytes=1,i=>i.ledger.planned[1].id='FOREIGN',i=>i.ledger.events.push({unreviewed:true}),i=>i.pointer.source=binding.source]){
  const i=input();mutate(i);assert.throws(()=>prepareSourceRebind(i),/Q3_RECOVERY_REBIND_REJECTED/);
 }
});
test('current factory derivative changes only exact source/version pins',()=>{
 const old=fs.readFileSync(__dirname+'/disposable-factory.expression.js','utf8');
 assert.equal(fs.readFileSync(__dirname+'/disposable-cleanup-rc34-factory.expression.js','utf8'),old.replaceAll(oldBinding.version,binding.version).replaceAll(oldBinding.source,binding.source));
});
test('cleanup fresh double-pass reads exact scope, PATCHes twice and confirms trash without upload/delete',async()=>{
 const f=fake(prepareSourceRebind(input())),j=f.start();try{const r=await j.cleanup();assert.equal(r.passed,true,r.code);assert.equal(r.writes,2);assert.equal(r.ownedCleanupSettled,true);assert([...f.files.values()].every(x=>x.trashed));assert.equal(f.calls.filter(x=>x.method==='PATCH').length,2);assert(f.calls.every(x=>['GET','PATCH'].includes(x.method)));assert.equal(JSON.parse(j.privateText()).ledger.status,'cleanup-confirmed');}finally{await j.clear();}
});
test('unknown child and changing owner reject before any PATCH',async()=>{
 for(const options of [{foreignChild:true},{ownerDrift:true}]){const f=fake(prepareSourceRebind(input()),options),j=f.start();try{const r=await j.cleanup();assert.equal(r.passed,false);assert.equal(f.calls.filter(x=>x.method==='PATCH').length,0);}finally{await j.clear();}}
});
test('lost PATCH response is uncertain and not retried',async()=>{
 const f=fake(prepareSourceRebind(input()),{losePatch:true}),j=f.start();try{const r=await j.cleanup();assert.equal(r.passed,false);assert.equal(f.calls.filter(x=>x.method==='PATCH').length,1);assert.equal(JSON.parse(j.privateText()).ledger.status,'uncertain');}finally{await j.clear();}
});
function executor({concurrent=false,storageFailure=false}={}){
 const plan=prepareSourceRebind(input()),expected={ledgerText:'old-ledger',pointerText:'old-pointer'};
 const values=new Map([[plan.ledgerKey,expected.ledgerText],[plan.pointerKey,expected.pointerText]]),calls={cleared:0,cleanup:0,persist:0,constructed:0};
 const localStorage={getItem:k=>values.get(k),setItem(k,v){calls.persist++;if(storageFailure&&k===plan.pointerKey&&v!==expected.pointerText)throw Error('quota');values.set(k,v);}};
 const context={localStorage,__resumeSwProof:{get:()=>({})}};
 const start=vm.runInNewContext('('+fs.readFileSync(__dirname+'/disposable-cleanup-rc34-start.function.js','utf8')+')',context);
 const facade=()=>{const n=++calls.constructed;return {summary:()=>({sourceBound:true,requests:0,writes:0}),clear:async()=>{calls.cleared++;if(concurrent&&n===1)values.set(plan.ledgerKey,'new-writer');},cleanup:async()=>{calls.cleanup++;return {passed:true};},privateText:()=>JSON.stringify({ledger:plan.ledger})};};
 return {start:()=>start(null,facade,binding,plan,expected),plan,expected,values,calls,context};
}
test('executor detects reserved-key drift after asynchronous preflight clear without overwriting it',async()=>{
 const e=executor({concurrent:true});await assert.rejects(e.start(),/Q3_CLEANUP_ADMISSION/);assert.equal(e.values.get(e.plan.ledgerKey),'new-writer');assert.equal(e.calls.persist,0);assert.equal(e.calls.cleanup,0);assert.equal(e.calls.cleared,1);
});
test('executor storage failure restores own exact old ledger and releases job before any provider action',async()=>{
 const e=executor({storageFailure:true});await assert.rejects(e.start(),/Q3_CLEANUP_ADMISSION/);assert.equal(e.values.get(e.plan.ledgerKey),e.expected.ledgerText);assert.equal(e.values.get(e.plan.pointerKey),e.expected.pointerText);assert.equal(e.calls.cleanup,0);assert.equal(e.calls.cleared,2);
});
test('executor starts one cleanup and retains receipt only after releasing both constructor lifetimes',async()=>{
 const e=executor();const r=await e.start();assert.equal(r.started,true);await e.context.__q3Cleanup34.operation;assert.equal(e.calls.cleanup,1);assert.equal(e.calls.cleared,2);assert.equal(e.context.__q3Cleanup34.done,true);assert.equal(e.context.__q3Cleanup34.jobCleared,true);
});
