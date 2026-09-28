import {webcrypto,createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {openDriveQ1Source} from '../../media/drive-source.mjs';
const expression=readFileSync(new URL('./facade.expression.js',import.meta.url),'utf8')
  .replace("import('./media/drive-source.mjs')",'Promise.resolve({openDriveQ1Source:globalThis.openDriveQ1Source})');
function fixture(){
  const calls=[],controller={state:'activated'},abort=new AbortController();
  const selected={id:'fixture-file',size:'6803156',mimeType:'video/x-matroska',modifiedTime:'fixture-time',capabilities:{canDownload:true}};
  const metadata={...selected,version:'1',headRevisionId:'fixture-revision',trashed:false};
  const state={authCapabilities:{version:1,driveRead:true,driveWrite:true,appData:true},files:[selected],accountId:'subject',authAccountKey:'opaque',authGeneration:1,driveSessionGeneration:2,
    tokenRevision:3,token:'fixture-token',expiresAt:Date.now()+3600000,accountStateAbortController:abort,
    accountStateWriterId:'fixture-writer',accountStateRevision:1,accountMediaState:{viewed:{fixture:1}},
    mediaSession:4,playbackSession:5,authStatus:'online',demo:false,accountIdentityPending:false,accountStateLoaded:true,
    accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,
    selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
  const context={crypto:webcrypto,TextEncoder,state,openDriveQ1Source,Uint8Array,TextDecoder,URL,AbortController,JSON,Promise,setTimeout,clearTimeout,
    APP_VERSION:'1.22.0-rc.13',DRIVE_MUTATIONS_ENABLED:false,ACCOUNT_STATE_WRITES_ENABLED:true,
    top:1,self:1,navigator:{onLine:true,serviceWorker:{controller}},document:{visibilityState:'visible'},
    location:{origin:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',href:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/'},
    mediaSourceGeneration:6,q1RetirementResult:{settled:true},q1Playback:null,playerMediaPriorityActive:false,
    hasUsableToken:()=>true,accountMediaStatesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    window:{addEventListener(){},removeEventListener(){}},
    fetch:async(address,options)=>{
      const url=new URL(address);calls.push({url,options});
      if(url.hostname==='www.googleapis.com')return Response.json(metadata);
      assert.equal(url.searchParams.has('mediaOwner'),false);
      assert.equal(options.headers.Authorization,undefined);
      const [,a,b]=options.headers.Range.match(/^bytes=(\d+)-(\d+)$/);const start=Number(a),end=Number(b);
      return new Response(new Uint8Array(end-start+1),{status:206,headers:{'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${metadata.size}`}});
    }};
  vm.createContext(context);
  const create=vm.runInContext(expression,context),proof={get:()=>({controller,version:'1.22.0-rc.13'})};
  const clock=async({read,sourceSize,isCurrent})=>{assert.equal(isCurrent(),true);await read({start:0,end:524143});await read({start:sourceSize-524144,end:sourceSize-1});return {diagnostic:true};};
  return {context,state,selected,calls,metadata,create,proof,clock};
}
async function finish(job){for(let i=0;i<100;i++){const result=job.poll();if(result.done)return result.summary;await new Promise(r=>setTimeout(r,2));}throw new Error('job did not finish');}

function provider(f,opts={}){
 const A='0123456789ABCDEF',B='fedcba9876543210';let content=A,revision=1,marker=null,name=null,trashed=false;const writes=[];
 const operationName=opts.operationName??'operations/private-operation';
 const operationResult=()=>({done:true,name:operationName,response:{'@type':'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse',partialDownloadAllowed:true,downloadUri:'https://www.googleapis.com/drive/v3/files/new-fixture?alt=media&revisionId=rev1'}});
 const meta=()=>({id:'new-fixture',name,appProperties:{driveOriginalQaRevision:marker},size:'16',mimeType:'application/octet-stream',trashed,headRevisionId:'rev'+revision,sha256Checksum:createHash('sha256').update(content).digest('hex'),capabilities:{canDownload:true}});
 f.context.fetch=async(address,o)=>{
  const u=new URL(address);f.calls.push({url:u,options:o});assert.equal(u.origin,'https://www.googleapis.com');assert.equal(o.redirect,'error');assert.equal(o.credentials,'omit');
  if(o.method==='POST'&&u.pathname==='/upload/drive/v3/files'){
   writes.push('create');const text=new TextDecoder().decode(o.body);const m=JSON.parse(text.slice(text.indexOf('{'),text.indexOf('}\r\n')+1));marker=m.appProperties.driveOriginalQaRevision;name=m.name;assert.deepEqual(m.parents,['root']);assert.ok(text.includes(A));return Response.json({id:opts.createOld?'fixture-file':'new-fixture'});
  }
  assert.ok(u.pathname.includes('new-fixture')||u.pathname.includes('/operations/'));
  if(o.method==='PATCH'){
   if(u.pathname.startsWith('/upload/')){const value=new TextDecoder().decode(o.body);assert.ok([A,B].includes(value));writes.push(value===B?'B':'restore');if(opts.updateHttp&&value===B)return new Response('private',{status:500});content=value;if(!opts.noRevision)revision++;if(opts.drift&&value===B)f.state.authAccountKey='other';}
   else{assert.deepEqual(JSON.parse(o.body),{trashed:true});trashed=true;writes.push('trash');}
   return Response.json({id:'new-fixture'});
  }
  if(u.pathname.endsWith('/download')){assert.equal(o.body,undefined);assert.equal(u.searchParams.get('revisionId'),'rev1');return Response.json(opts.pendingOperation?{done:false,name:operationName}:operationResult());}
  if(u.pathname.startsWith('/drive/v3/operations/')){assert.equal(u.pathname,'/drive/v3/operations/'+encodeURIComponent(operationName));assert.equal(u.search,'');return Response.json(operationResult());}
  if(u.searchParams.get('alt')==='media'){
   assert.equal(o.headers.Range,'bytes=0-15');let value=u.searchParams.has('revisionId')?(opts.oldReturnsB&&content===B?B:A):(opts.newReturnsA&&content===B?A:content);
   if(opts.oldDenied&&content===B&&u.searchParams.has('revisionId'))return new Response('PRIVATE_PROVIDER_MESSAGE',{status:403});
   if(opts.overMedia&&!writes.includes('restore'))value+='PRIVATE';
   return new Response(new TextEncoder().encode(value),{status:206,headers:{'Content-Length':'16','Content-Range':'bytes 0-15/16'}});
  }
  const m=meta();if(opts.badMarker)m.appProperties.driveOriginalQaRevision='wrong';if(opts.badSize)m.size=16;if(opts.badMime)m.mimeType='video/mp4';if(opts.wrongId)m.id='original-private';
  if(opts.oversize)return new Response(new Uint8Array(32769));return Response.json(m);
 };
 return {writes};
}
test('disposable A pinned URI remains A after latest becomes B; restore and trash independently verified',async()=>{
 const f=fixture(),p=provider(f);const job=f.create(f.proof),r=await finish(job);assert.equal(r.complete,true);assert.equal(r.beforeA,true);assert.equal(r.oldUriStillA,true);assert.equal(r.latestB,true);assert.equal(r.restoredVerified,true);assert.equal(r.trashVerified,true);assert.equal(r.mediaBytes,64);assert.deepEqual(p.writes,['create','B','restore','trash']);assert.equal(r.writeRequests,4);assert.equal(r.localReferencesReleased,true);assert.equal(job.recovery(),null);assert.ok(!JSON.stringify(r).includes('new-fixture'));assert.ok(!JSON.stringify(r).includes('rev1'));assert.equal(r.uriProfile.sameFilePath,true);assert.equal(r.uriProfile.revisionEmbeddedMatched,true);
});
test('old URI B/latest A/no revision change fail discriminator but still restore and trash',async()=>{
 for(const opts of [{oldReturnsB:true},{newReturnsA:true},{noRevision:true}]){const f=fixture(),p=provider(f,opts),r=await finish(f.create(f.proof));assert.equal(r.complete,false);assert.equal(r.restoredVerified,true);assert.equal(r.trashVerified,true);assert.equal(p.writes.length,4);}
});
test('wrong marker/id/size type/MIME and creation returning an existing file never permit PATCH',async()=>{
 for(const opts of [{badMarker:true},{wrongId:true},{badSize:true},{badMime:true},{createOld:true}]){const f=fixture(),p=provider(f,opts),job=f.create(f.proof),r=await finish(job);assert.equal(r.complete,false);assert.deepEqual(p.writes,['create']);assert.equal(r.recoveryRequired,true);assert.equal(r.localReferencesReleased,false);assert.ok(job.recovery());assert.equal(job.release().released,true);assert.equal(job.recovery(),null);}
});
test('account drift refuses all restore/trash writes and retains private recovery target',async()=>{
 const f=fixture(),p=provider(f,{drift:true}),job=f.create(f.proof),r=await finish(job);assert.deepEqual(p.writes,['create','B']);assert.equal(r.complete,false);assert.equal(r.recoveryRequired,true);assert.equal(job.recovery().id,'new-fixture');assert.ok(!JSON.stringify(r).includes('new-fixture'));job.release();
});
test('media oversize and update HTTP failure cannot pass; cleanup remains bounded',async()=>{
 for(const opts of [{overMedia:true},{updateHttp:true}]){const f=fixture(),p=provider(f,opts),r=await finish(f.create(f.proof));assert.equal(r.complete,false);assert.equal(r.trashVerified,true);assert.ok(p.writes.length<=4);assert.ok(r.mediaBytes<=96);}
});
test('oversized JSON and immediate abort never broaden write scope',async()=>{
 const f=fixture(),p=provider(f,{oversize:true}),job=f.create(f.proof),r=await finish(job);assert.equal(r.complete,false);assert.deepEqual(p.writes,['create']);job.release();
 const g=fixture(),q=provider(g),j=g.create(g.proof);j.cancel();const s=await finish(j);assert.equal(s.complete,false);assert.equal(q.writes.length,0);j.release();
});

test('rejected body cleanup prevents all further writes and keeps recovery private',async()=>{
 const f=fixture(),p=provider(f),normal=f.context.fetch;f.context.fetch=async(url,o)=>String(url).includes('alt=media')?new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(17));},cancel(){throw Error('PRIVATE_CLEANUP');}}),{status:206,headers:{'Content-Length':'16'}}):normal(url,o);
 const j=f.create(f.proof),r=await finish(j);assert.equal(r.localCleanupSettled,false);assert.deepEqual(p.writes,['create']);assert.equal(r.recoveryRequired,true);assert.equal(r.trashVerified,false);assert.equal(j.recovery().id,'new-fixture');assert.ok(!JSON.stringify(r).includes('PRIVATE_CLEANUP'));j.release();
});

test('opaque base64 operation names are accepted without exporting or interpreting them',async()=>{
 const f=fixture(),p=provider(f,{operationName:'Opaque+/value==.suffix:percent%'}),r=await finish(f.create(f.proof));
 assert.equal(r.complete,true);assert.equal(r.initialDone,true);assert.equal(r.operationNameAccepted,true);
 assert.equal(r.operationRequests,0);assert.deepEqual(p.writes,['create','B','restore','trash']);
 assert.equal(JSON.stringify(r).includes('Opaque'),false);
});

test('polling encodes the entire opaque operation name as one fixed-origin path parameter',async()=>{
 const f=fixture();f.context.setTimeout=(fn,ms)=>setTimeout(fn,ms===10000?1:ms);
 provider(f,{operationName:'operations/Opaque+/value==',pendingOperation:true});
 const r=await finish(f.create(f.proof));assert.equal(r.complete,true);assert.equal(r.initialDone,false);assert.equal(r.operationRequests,1);
});

test('control or oversized operation names fail before B while restoring the verified fixture',async()=>{
 for(const operationName of ['bad name','bad\u0000name','x'.repeat(1025)]){
  const f=fixture(),p=provider(f,{operationName}),r=await finish(f.create(f.proof));
  assert.equal(r.complete,false);assert.equal(r.failure,'OPERATION_NAME');assert.deepEqual(p.writes,['create','restore','trash']);
 }
});

test('latest B stays accessible while the pinned prior revision safely denies further bytes',async()=>{
 const f=fixture(),p=provider(f,{oldDenied:true}),r=await finish(f.create(f.proof));
 assert.equal(r.complete,true);assert.equal(r.oldUriStillA,false);assert.equal(r.oldUriDenied,true);assert.equal(r.latestB,true);
 assert.equal(r.mediaBytes,48);assert.equal(r.restoredVerified,true);assert.equal(r.trashVerified,true);assert.equal(r.localCleanupSettled,true);
 assert.deepEqual(p.writes,['create','B','restore','trash']);assert.equal(JSON.stringify(r).includes('PRIVATE_PROVIDER_MESSAGE'),false);
});

test('HTTP denial begins body cancellation before aborting the fetch controller',async()=>{
 const f=fixture(),p=provider(f),normal=f.context.fetch;let started=false,observed=false;
 f.context.fetch=async(url,o)=>{
  if(String(url).includes('alt=media')&&String(url).includes('revisionId=')){
   let streamController;
   const body=new ReadableStream({start(c){streamController=c;},cancel(){started=true;}});
   o.signal.addEventListener('abort',()=>{observed=true;if(!started)streamController.error(new DOMException('Abort','AbortError'));},{once:true});
   return new Response(body,{status:403});
  }
  return normal(url,o);
 };
 const r=await finish(f.create(f.proof));assert.equal(r.complete,false);assert.equal(r.failure,'HTTP_RESPONSE');
 assert.equal(started,true);assert.equal(observed,true);assert.equal(r.localCleanupSettled,true);assert.equal(r.trashVerified,true);
 assert.deepEqual(p.writes,['create','restore','trash']);
});
