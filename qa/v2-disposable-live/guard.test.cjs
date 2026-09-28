'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {source,canonical}=require('./build.cjs');
function fixture({hold=false,storageFailure=false,drift=false,createLoss=false,create404=false,versionDrift=false,rootWritable=true}={}) {
  const data=new Map(), calls=[], files=new Map(),hooks={};
  const owner={accountId:'fixture-account',authAccountKey:'fixture-auth',token:'fixture-token',authGeneration:1,driveSessionGeneration:1,tokenRevision:1,sw:{},productWrites:false,connected:true,usable:true,idle:true};
  const cap={canTrash:true,canUntrash:true,canMoveItemWithinDrive:true,canAddChildren:true};
  const root={id:'fixture-root',version:'1',mimeType:'application/vnd.google-apps.folder',trashed:false,ownedByMe:true,capabilities:{...cap,canAddChildren:rootWritable}};
  const env={read:()=>({...owner}),storage:{get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,
    setItem(k,v){if(storageFailure)throw new Error('quota');data.set(k,v);}},navigator:{locks:{request:async(k,fn)=>fn()}},
    fetch:async(url,opt)=>{
      if(hooks.fetch)return hooks.fetch(url,opt);
      const u=new URL(url),id=u.pathname.split('/').at(-1);calls.push({url,method:opt.method,body:opt.body});
      if(id==='root')return Response.json(root);
      if(id==='generateIds')return Response.json({space:'drive',kind:'drive#generatedIds',ids:['fixture-folder-a','fixture-folder-b','fixture-test-file']});
      if(opt.method==='POST'){
        const meta={...JSON.parse(opt.body),version:'1',trashed:false,ownedByMe:true,capabilities:cap};files.set(meta.id,meta);
        if(createLoss)throw new Error('lost');return Response.json(meta);
      }
      if(!files.has(id)||create404)return Response.json({}, {status:404});
      const meta=files.get(id);
      if(opt.method==='PATCH') {
        if(u.searchParams.has('addParents'))meta.parents=[u.searchParams.get('addParents')];
        if('trashed' in JSON.parse(opt.body))meta.trashed=JSON.parse(opt.body).trashed;
        meta.version=String(Number(meta.version)+1);return Response.json(meta);
      }
      const read=structuredClone(meta);if(drift)read.appProperties.qaRun='foreign-run';
      if(versionDrift && id==='fixture-test-file' && calls.filter(x=>x.url.includes('/files/fixture-test-file')&&x.method==='GET').length===3)read.version='99';
      return Response.json(read);
    }};
  // Probe-only VM instrumentation exposes closure guards and suppresses the job.
  // Shipped browser expression contains neither testProbe nor hold.
  let code=source.replace('return Object.freeze({recoveryRun:','return Object.freeze({testProbe:{transport,get,ledger,admitted,validateMetadata,current},recoveryRun:');
  if(hold)code=code.replace('const done=(async()=>{','const done=(async()=>{ if(true){finished=true;clearTimeout(deadline);return;}');
  const ctx={AbortController,AbortSignal,DOMException,Response,URL,URLSearchParams,TextDecoder,crypto:webcrypto,setTimeout,clearTimeout,console};
  const create=vm.runInNewContext(code,ctx);
  const job=create(env);
  return {job,env,owner,data,calls,files,probe:job.testProbe,create,hooks};
}
test('controller functions are copied exactly; only prefix is scoped',()=>{
  const copy=source.slice(source.indexOf('const DRIVE_MUTATION_PREFIX'),source.indexOf('\n  const get ='));
  assert.equal(copy.trim(),canonical.replace("'drive-original.mutation.v1.'",'env.prefix + "controller."').trim());
  assert.ok(!source.includes('state.token ='));
});
test('successful complete roundtrip uses actual controller, independent reads and lost PATCH response',async()=>{
  const f=fixture();const result=await f.job.done;
  assert.equal(result.ok,true);assert.equal(result.roundTrip,true);assert.equal(result.responseLossVerified,true);assert.equal(result.writes,8);
  assert.equal(f.calls.filter(x=>x.method==='POST').length,3);
  assert.equal(f.calls.filter(x=>x.method==='PATCH').length,5);
  for(let i=0;i<f.calls.length;i++)if(f.calls[i].method==='PATCH')assert.equal(f.calls[i+1].method,'GET');
  assert.equal(f.files.get('fixture-test-file').trashed,true);
  assert.equal(f.files.get('fixture-folder-a').trashed,false);assert.equal(f.files.get('fixture-folder-b').trashed,false);
  assert.ok(f.calls.filter(x=>x.method==='PATCH').every(x=>x.url.includes('/files/fixture-test-file?')));
  const output=JSON.stringify(f.job.poll());
  for(const privateValue of ['fixture-account','fixture-auth','fixture-token','fixture-folder','fixture-test-file','appProperties'])assert.ok(!output.includes(privateValue));
  assert.ok([...f.data.keys()].every(k=>k.startsWith('drive-original.qa.disposable.')));
});
test('POST loss uses known preallocated ID and independent GET; no replay',async()=>{
  const f=fixture({createLoss:true});const result=await f.job.done;
  assert.equal(result.ok,true);assert.equal(f.calls.filter(c=>c.method==='POST').length,3);
  for(let i=0;i<f.calls.length;i++)if(f.calls[i].method==='POST')assert.equal(f.calls[i+1].method,'GET');
});
test('storage failure before writes sends nothing',async()=>{
  const f=fixture({storageFailure:true});const result=await f.job.done;
  assert.equal(result.ok,false);assert.equal(f.calls.length,0);
});
test('tag drift refuses admission and sends no PATCH',async()=>{
  const f=fixture({drift:true});const result=await f.job.done;
  assert.equal(result.ok,false);assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);
});
test('unknown POST outcome preserves planned IDs and never replays or patches',async()=>{
  const f=fixture({createLoss:true,create404:true});const result=await f.job.done;
  assert.equal(result.ok,false);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);
  const ledger=JSON.parse([...f.data.entries()].find(([k])=>k.endsWith('.recovery'))[1]);
  assert.equal(ledger.planned.length,3);assert.equal(ledger.planned[0].sent,true);
});
test('version drift between caller snapshot and canonical pre-read prevents PATCH',async()=>{
  const f=fixture({versionDrift:true});const result=await f.job.done;
  assert.equal(result.ok,false);assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);
});
test('read-only recovery verifies exact known IDs without any writes or broad list',async()=>{
  const f=fixture();await f.job.done;
  const ledger=JSON.parse([...f.data.entries()].find(([k])=>k.endsWith('.recovery'))[1]);
  const start=f.calls.length;const job=f.create(f.env,{recoveryRun:ledger.run});const result=await job.done;
  assert.equal(result.ok,true);assert.equal(result.verified,3);assert.equal(result.writes,0);
  assert.ok(f.calls.slice(start).every(c=>c.method==='GET'));assert.equal(f.calls.length-start,4);
  f.owner.accountId='different';assert.throws(()=>f.create(f.env,{recoveryRun:ledger.run}),/QA_RECOVERY_LEDGER_INVALID/);
});
test('strict guard rejects URL/method/query/body/ID attacks without network',async()=>{
  const f=fixture({hold:true});await f.job.done;
  const p=f.probe,fields='id,version,parents,trashed,mimeType,capabilities(canTrash,canUntrash,canMoveItemWithinDrive,canMoveItemOutOfDrive,canAddChildren),appProperties,ownedByMe,driveId';
  const q=new URLSearchParams({supportsAllDrives:'true',fields});
  const base=`https://www.googleapis.com/drive/v3/files/foreign-id?${q}`;
  const attacks=[['https://evil.test/drive/v3/files/root',{}],['https://www.googleapis.com.evil.test/drive/v3/files/root',{}],
    [base,{method:'DELETE'}],[base,{method:'PUT'}],[base,{method:'PATCH',body:'{"trashed":true}'}],
    [`https://www.googleapis.com/drive/v3/files?${q}`,{method:'POST',body:'{}'}],
    [`https://www.googleapis.com/drive/v3/files/root?${q}&alt=media`,{}],
    [`https://www.googleapis.com/drive/v3/files/root?${q}&fields=id`,{}],
    [`https://www.googleapis.com/drive/v3/files/root?${q}`,{body:'{}'}],
    ['https://www.googleapis.com/drive/v3/files/generateIds?count=100&space=drive&type=files',{}]];
  for(const [url,options]of attacks)await assert.rejects(p.transport(url,options));
  p.ledger.planned=[{id:'fixture-owned',role:'test-file'},{id:'fixture-dest',role:'folder-b'}];
  p.admitted.set('fixture-owned',{parents:['fixture-origin'],trashed:false});p.admitted.set('fixture-dest',{mimeType:'application/vnd.google-apps.folder',trashed:false});
  const owned=`https://www.googleapis.com/drive/v3/files/fixture-owned?${q}`;
  for(const body of ['{"name":"overwrite"}','{"trashed":true,"name":"x"}','{"trashed":false}','{"permissions":[]}','{"appProperties":{}}'])await assert.rejects(p.transport(owned,{method:'PATCH',body}));
  await assert.rejects(p.transport(owned+'&addParents=foreign-id&removeParents=fixture-origin',{method:'PATCH',body:'{}'}));
  await assert.rejects(p.transport(owned+'&addParents=fixture-dest&removeParents=foreign-id',{method:'PATCH',body:'{}'}));
  for(const patch of [{ownedByMe:false},{driveId:'shared'},{appProperties:{}},{mimeType:'video/mp4'},{parents:['foreign-id']}]){
    assert.throws(()=>p.validateMetadata({id:'fixture-owned',ownedByMe:true,version:'1',trashed:false,parents:['fixture-dest'],mimeType:'text/plain',appProperties:{qaRun:p.ledger.run,qaRole:'test-file'},...patch},'fixture-owned','test-file'));
  }
  assert.equal(f.calls.length,0);
});
test('stale account/auth/data/token/SW/lifecycle owner refuses side effects',async()=>{
  for(const key of ['accountId','authAccountKey','authGeneration','driveSessionGeneration','token','tokenRevision','sw','productWrites','connected','usable','idle']){
    const f=fixture({hold:true});await f.job.done;f.owner[key]='changed';
    await assert.rejects(f.probe.transport('https://www.googleapis.com/drive/v3/files/generateIds?count=3&space=drive&type=files'));
    assert.equal(f.calls.length,0);
  }
  const f=fixture({hold:true});await f.job.done;f.job.cancel();assert.equal(f.probe.current(),false);
});
test('bounded streaming rejects actual excess bytes and owner changes during body read',async()=>{
  for(const mode of ['oversized','owner-body']) {
    const f=fixture({hold:true});await f.job.done;
    let cancelled=false,pulls=0;
    f.hooks.fetch=async()=>new Response(new ReadableStream({pull(controller){
      if(mode==='oversized')controller.enqueue(new Uint8Array(131073));
      else if(pulls++===0)controller.enqueue(new TextEncoder().encode('{'));
      else {f.owner.accountId='changed';controller.enqueue(new TextEncoder().encode('}'));}
    },cancel(){cancelled=true;}}));
    await assert.rejects(f.probe.transport('https://www.googleapis.com/drive/v3/files/generateIds?count=3&space=drive&type=files'));
    assert.equal(cancelled,true);
  }
});
test('canonical abort signal is composed and folder mutations are forbidden',async()=>{
  const f=fixture({hold:true});await f.job.done;const abort=new AbortController();abort.abort();
  await assert.rejects(f.probe.transport('https://www.googleapis.com/drive/v3/files/generateIds?count=3&space=drive&type=files',{signal:abort.signal}));
  assert.equal(f.calls.length,0);
  const q=new URLSearchParams({supportsAllDrives:'true',fields:'id,version,parents,trashed,mimeType,capabilities(canTrash,canUntrash,canMoveItemWithinDrive,canMoveItemOutOfDrive,canAddChildren),appProperties,ownedByMe,driveId'});
  f.probe.ledger.planned=[{id:'fixture-folder',role:'folder-a'}];f.probe.admitted.set('fixture-folder',{trashed:false});
  await assert.rejects(f.probe.transport(`https://www.googleapis.com/drive/v3/files/fixture-folder?${q}`,{method:'PATCH',body:'{"trashed":true}'}),/QA_FOLDER_WRITE_BLOCKED/);
  assert.equal(f.calls.length,0);
});
test('root capability and generated ID response space fail closed before create',async()=>{
  const root=fixture({rootWritable:false});assert.equal((await root.job.done).ok,false);assert.equal(root.calls.length,1);
  const generated=fixture();generated.hooks.fetch=async()=>Response.json({space:'appDataFolder',ids:['fixture-folder-a','fixture-folder-b','fixture-test-file']});
  assert.equal((await generated.job.done).ok,false);assert.equal(generated.calls.filter(c=>c.method==='POST').length,0);
});
