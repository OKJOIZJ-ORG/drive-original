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
  const state={authCapabilities:{version:1,driveRead:true,appData:true},files:[selected],accountId:'subject',authAccountKey:'opaque',authGeneration:1,driveSessionGeneration:2,
    tokenRevision:3,token:'fixture-token',expiresAt:Date.now()+3600000,accountStateAbortController:abort,
    accountStateWriterId:'fixture-writer',accountStateRevision:1,accountMediaState:{viewed:{fixture:1}},
    mediaSession:4,playbackSession:5,authStatus:'online',demo:false,accountIdentityPending:false,accountStateLoaded:true,
    accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,
    selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
  const context={state,openDriveQ1Source,Uint8Array,TextDecoder,URL,AbortController,JSON,Promise,setTimeout,clearTimeout,
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
 let polls=0;
 const done=()=>({name:'operations/private-operation',done:true,response:{'@type':'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse',downloadUri:opts.uri||'https://www.googleapis.com/private-download?revisionId=fixture-revision&id=fixture-file',partialDownloadAllowed:!opts.partialFalse}});
 f.context.fetch=async(address,options)=>{
  const url=new URL(address);f.calls.push({url,options});assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
  if(url.pathname.endsWith('/download')){
   assert.equal(options.method,'POST');assert.equal(options.body,undefined);assert.equal(url.searchParams.get('revisionId'),'fixture-revision');
   if(opts.unsupported)return new Response(null,{status:400});
   if(opts.oversize)return new Response(new Uint8Array(32769));
   if(opts.pending)return Response.json({name:'operations/private-operation',done:false});
   if(opts.redirect){const r=Response.json(done());Object.defineProperty(r,'redirected',{value:true});return r;}
   if(opts.drift)f.state.authAccountKey='changed';
   return Response.json(done());
  }
  if(url.pathname.includes('/operations/')){polls++;return Response.json(opts.pending==='forever'?{name:'operations/private-operation',done:false}:done());}
  if(url.pathname==='/private-download'){
   if(opts.cors)throw new TypeError('private-provider');
   if(opts.error)throw new Error('PRIVATE_TOKEN');
   const [a,b]=options.headers.Range.slice(6).split('-');
   if(opts.overMedia)return new Response(new Uint8Array(3),{status:206,headers:{'Content-Length':'2'}});
   return new Response(new Uint8Array(2),{status:206,headers:{'Content-Length':'2','Content-Range':`bytes ${a}-${b}/${f.selected.size}`}});
  }
  return Response.json(f.metadata);
 };
 if(opts.pending)f.context.setTimeout=(fn,ms)=>setTimeout(fn,ms===10000?1:ms);
 return ()=>polls;
}
test('initial done revision operation uses one empty POST no poll and exact two bounded ranges',async()=>{
 const f=fixture();provider(f);const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,true);assert.equal(r.postRequests,1);assert.equal(r.operationRequests,0);assert.equal(r.mediaRequests,2);assert.equal(r.mediaBytes,4);assert.equal(r.metadataRequests,4);assert.equal(r.identitySafe,true);assert.equal(r.sourceCleanup.settled,true);assert.equal(r.genericUpstreamCleanup,'unknown');assert.ok(!JSON.stringify(r).includes('fixture'));assert.ok(!JSON.stringify(r).includes('private-operation'));
});
test('pending operation polls boundedly and handles completed response',async()=>{
 for(const pending of [true,'forever']){const f=fixture();provider(f,{pending});const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,pending===true);assert.equal(r.operationRequests,pending===true?1:3);if(pending==='forever')assert.equal(r.failure,'OPERATION_PENDING_LIMIT');}
});
test('returned explicit nonmatching revision, origin, redirects and partial denial never fetch media',async()=>{
 for(const opts of [{uri:'https://www.googleapis.com/private-download?revisionId=other'},{uri:'https://private.invalid/token'},{redirect:true},{partialFalse:true}]){const f=fixture();provider(f,opts);const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,false);assert.equal(r.mediaRequests,0);assert.equal(r.sourceCleanup.settled,true);}
});
test('unsupported and oversized operation terminate without whole-media fallback',async()=>{
 for(const opts of [{unsupported:true},{oversize:true}]){const f=fixture();provider(f,opts);const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,false);assert.equal(r.mediaRequests,0);assert.equal(r.operationRequests,0);}
});
test('account drift, abort, CORS/network and arbitrary upstream errors stay private',async()=>{
 for(const opts of [{drift:true},{cors:true},{error:true},{overMedia:true}]){const f=fixture();provider(f,opts);const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,false);assert.ok(!JSON.stringify(r).includes('PRIVATE_TOKEN'));assert.ok(r.mediaRequests<=1);}
 const f=fixture();provider(f);const job=f.create(f.selected,f.proof);job.cancel();const r=await finish(job);assert.equal(r.complete,false);assert.equal(r.postRequests,0);
});

test('operation response cleanup rejection is terminal; source drift stops before media',async()=>{
 const f=fixture();provider(f);const original=f.context.fetch;f.context.fetch=async(url,opts)=>String(url).includes('/download?')?new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(32769));},cancel(){throw Error('private-cleanup');}})):original(url,opts);
 const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,false);assert.equal(r.failure,'CLEANUP_FAILED');assert.equal(r.sourceCleanup.settled,false);assert.equal(r.mediaRequests,0);
 const g=fixture();provider(g);const normal=g.context.fetch;g.context.fetch=async(url,opts)=>{const response=await normal(url,opts);if(String(url).includes('/download?'))g.metadata.headRevisionId='changed';return response;};
 const s=await finish(g.create(g.selected,g.proof));assert.equal(s.failure,'METADATA_IDENTITY_CHANGED');assert.equal(s.mediaRequests,0);
});

test('blocked URI exposes only exact generic host or fixed family, never private prefix/path/query',async()=>{
 for(const uri of ['https://drive.usercontent.google.com/private-path?token=PRIVATE_TOKEN','https://private-account.googleusercontent.com/private-path?token=PRIVATE_TOKEN']){
  const f=fixture();provider(f,{uri});const r=await finish(f.create(f.selected,f.proof));assert.equal(r.mediaRequests,0);assert.equal(r.failure,'URI_ORIGIN_UNQUALIFIED');assert.equal(r.observedUriOrigin.knownHost,uri.includes('drive.usercontent')?'drive.usercontent.google.com':null);assert.ok(!JSON.stringify(r).includes('PRIVATE_TOKEN'));assert.ok(!JSON.stringify(r).includes('private-account'));assert.ok(!JSON.stringify(r).includes('private-path'));
 }
});
