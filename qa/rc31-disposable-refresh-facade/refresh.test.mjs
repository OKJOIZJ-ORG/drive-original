import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const base = new URL('../rc31-disposable-ui-preparation/', import.meta.url);
const original = fs.readFileSync(new URL('facade.function.js', base), 'utf8');
const facade = fs.readFileSync(new URL('./facade.function.js', import.meta.url), 'utf8');
const factoryBytes = fs.readFileSync(new URL('factory.expression.js', base));
const factoryHash = 'de300ac0103fd5928fc3c7550d4b9e8abe7a6718019d46abf9ea30a17b344e9b';
const run='11111111-1111-4111-8111-111111111111',binding={version:'1.22.0-rc.31',source:'a'.repeat(40),appHash:'b'.repeat(64)},fixtures=[1,2].map(i=>{const bytes=fs.readFileSync(new URL(`fixture-${i}.png`,base));return {bytes:[...bytes],md5:crypto.createHash('md5').update(bytes).digest('hex')};});
function backend({failPost=0,unknownChild=false,foreignTag=false,storageFailure=false}={}){const storage=new Map(),files=new Map(),calls=[];let post=0;const root={id:'fixture-root',version:'1',mimeType:'application/vnd.google-apps.folder',trashed:false,ownedByMe:true,capabilities:{canAddChildren:true}},owner={accountId:'fixture-account',accountKey:'fixture-key',auth:1,data:1,token:'fixture-secret',revision:1,controller:{state:'activated'},signal:new AbortController().signal,version:binding.version,source:binding.source,appHash:binding.appHash,safe:true,driveWrite:true};const env={read:()=>({...owner}),uuid:()=>run,storage:{getItem:k=>storage.get(k)??null,setItem(k,v){if(storageFailure)throw Error('storage');storage.set(k,v);}},lifecycle:new EventTarget(),fetch:async(address,options)=>{const u=new URL(address),id=u.pathname.split('/').at(-1);calls.push({method:options.method,url:u.pathname});if(id==='root')return Response.json(root);if(id==='generateIds')return Response.json({space:'drive',ids:['fixture-folder-a','fixture-folder-b','fixture-image-1','fixture-image-2']});if(options.method==='POST'){post++;const saved=JSON.parse(storage.get(`drive-original.qa.disposable.${run}.recovery`));assert.equal(saved.planned[post-1].sent,true);assert.equal(saved.created.length,post-1);let meta;if(options.body instanceof Blob){const raw=Buffer.from(await options.body.arrayBuffer()),text=raw.toString('latin1');meta=JSON.parse(text.match(/\r\n\r\n(\{.*?\})\r\n--/s)[1]);const start=text.indexOf('Content-Type: image/png\r\n\r\n')+27,end=text.lastIndexOf('\r\n--'),png=raw.subarray(start,end);assert.deepEqual(png,Buffer.from(fixtures[Number(meta.appProperties.qaRole.at(-1))-1].bytes));meta.size=String(png.length);meta.md5Checksum=crypto.createHash('md5').update(png).digest('hex');}else meta=JSON.parse(options.body);Object.assign(meta,{version:'1',trashed:false,ownedByMe:true,capabilities:{canAddChildren:true,canTrash:true,canUntrash:true,canMoveItemWithinDrive:true}});files.set(meta.id,meta);if(post===failPost)throw Error('response-loss');return Response.json({id:meta.id});}if(u.pathname==='/drive/v3/files'){const parent=u.searchParams.get('q').match(/^'([^']+)'/)[1];return Response.json({incompleteSearch:false,files:[...files.values()].filter(f=>f.parents[0]===parent&&!f.trashed).map(f=>structuredClone(f)).concat(unknownChild?[{id:'original-unknown',ownedByMe:true,trashed:false,parents:[parent],appProperties:{qaRun:run}}]:[])});}const found=files.get(id);if(!found)return Response.json({}, {status:404});if(options.method==='PATCH'){const body=JSON.parse(options.body);if('trashed'in body)found.trashed=body.trashed;if(u.searchParams.has('addParents'))found.parents=[u.searchParams.get('addParents')];found.version=String(Number(found.version)+1);}const meta=structuredClone(found);if(foreignTag)meta.appProperties.qaRun='foreign';return Response.json(meta);}};return {env,owner,storage,calls,files,start:options=>disposableUiJob(env,binding,fixtures,options)};}
function fixture(config={}) {
  const b=backend(config), owner=b.owner, aborter=new AbortController(); owner.signal=aborter.signal;
  const state={authStatus:'online',accountStateLoaded:true,accountStateLoadingPromise:null,accountStateAbortController:{signal:owner.signal}};
  for(const [key,field] of Object.entries({accountId:'accountId',authAccountKey:'accountKey',authGeneration:'auth',driveSessionGeneration:'data',token:'token',tokenRevision:'revision'}))Object.defineProperty(state,key,{get:()=>owner[field],set:value=>{owner[field]=value;}});
  let hook=()=>{},activated=null;
  const env={APP_VERSION:binding.version,DRIVE_MUTATIONS_ENABLED:false,navigator:{serviceWorker:{controller:owner.controller},onLine:true},state,location:{origin:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'},top:1,self:1,document:{visibilityState:'visible'},window:b.env.lifecycle,crypto:{randomUUID:()=>run},localStorage:b.env.storage,hasAuthCapability:()=>owner.driveWrite,hasUsableToken:()=>true,playerMediaPriorityActive:false,q1Playback:null,q1RetirementResult:{settled:true},activateDisposableDriveMutationLease:options=>{activated=options;return Object.freeze({close(){}});},fetch:async(address,options)=>{hook(address,options);return b.env.fetch(address,options);},URLSearchParams,AbortController,AbortSignal,Blob,TextDecoder,setTimeout,clearTimeout};
  const proof={get:()=>({version:binding.version,sourceCommit:owner.source,sourceSHA256:{'app.js':owner.appHash},controller:env.navigator.serviceWorker.controller})};
  const factory=vm.runInNewContext(factoryBytes.toString(),env);
  const open=(options)=>vm.runInNewContext('('+facade+')',env)(factory,binding,proof,options);
  return {...b,env,state,proof,open,aborter,hook:fn=>{hook=fn;},activated:()=>activated};
}
test('only admission split changes facade; frozen creator and bounds stay byte pinned',()=>{
  assert.equal(crypto.createHash('sha256').update(factoryBytes).digest('hex'),factoryHash);
  assert.equal(facade,original.replace('  const read=()=>',"  if(!state.accountStateLoaded||state.accountStateLoadingPromise)throw Error('QA31_ADMISSION');\n  const read=()=>").replace('&&!state.accountStateLoadingPromise',''));
  const built=JSON.parse(fs.readFileSync(new URL('build.json',base)));
  assert.equal(built.binding.source,'4a484e6f839d2e6c3eb83503acb08147362cb011');
  assert.equal(built.factorySHA256,factoryHash);
  for(const text of ['Date.now()-start<120000','setTimeout(()=>local.abort(),15000)','++requests>80','++writes>16','length>65536||bytes>1048576'])assert.ok(factoryBytes.toString().includes(text));
});
test('initial loading or unloaded account rejects before any request or storage write',()=>{
  for(const mode of ['loading','unloaded']){const f=fixture();if(mode==='loading')f.state.accountStateLoadingPromise=Promise.resolve();else f.state.accountStateLoaded=false;assert.throws(()=>f.open(),/QA31_ADMISSION/);assert.equal(f.calls.length,0);assert.equal(f.storage.size,0);}
});
test('unchanged same-owner refresh permits real frozen creation, GET-only capture and exact cleanup',async()=>{
  const f=fixture(),job=f.open();f.hook(()=>{f.state.accountStateLoadingPromise=Promise.resolve();});
  try {const created=await job.create();assert.equal(created.passed,true);assert.equal(created.created,4);assert.equal(created.writes,4);assert.equal(f.calls.filter(c=>c.method==='POST').length,4);assert.equal(JSON.stringify(created).includes('fixture-account'),false);assert.equal(job.privateText().includes('fixture-secret'),false);
    f.state.accountStateLoadingPromise=null;const lease=job.activateNormalUi();assert.ok(lease.close);const opts=f.activated();assert.deepEqual([...opts.fileIds],['fixture-image-1','fixture-image-2']);assert.deepEqual([...opts.targetIds],['fixture-folder-a','fixture-folder-b']);assert.equal(opts.durationMs,120000);lease.close();
    const recovery=f.open({recoveryRun:run});try {const read=await recovery.capture();assert.equal(read.passed,true);assert.equal(read.verified,4);assert.equal(read.writes,0);assert.equal(read.snapshotStable,true);assert.equal(JSON.parse(recovery.privateText()).snapshot.length,4);}finally{recovery.clear();}
    f.state.accountStateLoadingPromise=null;const cleanup=f.open({recoveryRun:run});try {const cleaned=await cleanup.cleanup({mode:'trash-all-recoverable'});assert.equal(cleaned.passed,true);assert.equal(cleaned.writes,4);assert.ok([...f.files.values()].every(r=>r.trashed));assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);}finally{cleanup.clear();}
  }finally{job.clear();}
});
test('ongoing refresh cannot mask identity, token, generation, controller, source, or abort drift',async()=>{
  for(const mutate of [f=>f.state.accountId='changed',f=>f.state.authAccountKey='changed',f=>f.state.token='changed',f=>f.state.tokenRevision++,f=>f.state.authGeneration++,f=>f.state.driveSessionGeneration++,f=>f.owner.source='c'.repeat(40),f=>f.owner.appHash='c'.repeat(64),f=>f.env.navigator.serviceWorker.controller={state:'activated'},f=>f.aborter.abort()]) {
    const f=fixture(),job=f.open();f.state.accountStateLoadingPromise=Promise.resolve();mutate(f);
    try {const result=await job.capture();assert.equal(result.passed,false);assert.equal(result.code,'owner');assert.equal(f.calls.length,0);}finally{job.clear();}
  }
});
test('refresh cannot mask foreground, loaded, pending, grant, bulk, player, or source-proof fences',async()=>{
  for(const mutate of [f=>f.state.accountStateLoaded=false,f=>f.state.accountIdentityPending=true,f=>f.state.demo=true,f=>f.state.bulkAction={},f=>f.state.selected={},f=>f.state.authStatus='offline',f=>f.env.navigator.onLine=false,f=>f.env.document.visibilityState='hidden',f=>f.env.top=2,f=>f.env.location.origin='https://invalid.example',f=>f.owner.driveWrite=false,f=>f.env.playerMediaPriorityActive=true,f=>f.env.q1Playback={},f=>f.env.q1RetirementResult={settled:false},f=>{const old=f.proof.get;f.proof.get=()=>({...old(),controller:{}});}]) {
    const f=fixture(),job=f.open();f.state.accountStateLoadingPromise=Promise.resolve();mutate(f);try {const result=await job.capture();assert.equal(result.passed,false);assert.equal(result.code,'owner');assert.equal(f.calls.length,0);}finally{job.clear();}
  }
});
test('normal refresh preserves tag, PNG receipt and unknown-child denials',async()=>{
  for(const config of [{foreignTag:true},{unknownChild:true}]){const f=fixture(config),job=f.open();f.hook(()=>{f.state.accountStateLoadingPromise=Promise.resolve();});try {const created=await job.create();if(config.foreignTag){assert.equal(created.passed,false);assert.equal(created.code,'metadata');continue;}assert.equal(created.passed,true);f.state.accountStateLoadingPromise=null;const recovery=f.open({recoveryRun:run});try {const result=await recovery.capture();assert.equal(result.passed,false);assert.equal(result.code,'children');assert.equal(result.writes,0);}finally{recovery.clear();}}finally{job.clear();}}
  const f=fixture(),job=f.open();try {assert.equal((await job.create()).passed,true);f.files.get('fixture-image-1').md5Checksum='forged';const recovery=f.open({recoveryRun:run});f.hook(()=>{f.state.accountStateLoadingPromise=Promise.resolve();});try {const result=await recovery.capture();assert.equal(result.passed,false);assert.equal(result.code,'png_receipt');assert.equal(result.writes,0);}finally{recovery.clear();}}finally{job.clear();}
});
test('lifecycle pagehide still aborts owner during refresh',async()=>{
  const f=fixture(),job=f.open();f.state.accountStateLoadingPromise=Promise.resolve();f.env.window.dispatchEvent(new Event('pagehide'));try {const result=await job.capture();assert.equal(result.passed,false);assert.equal(result.code,'owner');assert.equal(f.calls.length,0);}finally{job.clear();}
});
