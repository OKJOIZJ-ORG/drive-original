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
 let media=0;
 f.context.fetch=async(address,options)=>{
  const url=new URL(address);f.calls.push({url,options});
  assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
  if(url.pathname.includes('/v2/')){
   assert.equal(url.searchParams.get('fields'),'id,etag');assert.equal(options.headers['If-Match'],undefined);
   if(opts.v2error)return new Response('private',{status:403});
   if(opts.overflow)return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(2049));},cancel(){if(opts.cleanupFail)throw Error('private');}}));
   return Response.json({id:opts.badId?'other':f.selected.id,etag:opts.etag===undefined?'"fixture-strong"':opts.etag});
  }
  if(url.searchParams.get('alt')!=='media')return Response.json({...f.metadata,...(opts.drift&&media?{version:'2'}:{})});
  media++;assert.equal(options.headers.Range,'bytes=0-1');
  if(media===1)assert.equal(options.headers['If-Match'],undefined);
  if(media===2){assert.equal(options.headers['If-Match'],'"fixture-strong"');if(opts.cors)throw new TypeError('private');if(opts.matchReject)return new Response(null,{status:412});}
  if(media===3){assert.notEqual(options.headers['If-Match'],'"fixture-strong"');if(!opts.ignore)return new Response('private',{status:412});}
  return new Response(new Uint8Array([0,1]),{status:206,headers:{'Content-Length':'2'}});
 };
}
test('hidden response ETag plus v2 JSON candidate requires matching206 and nonmatching412',async()=>{
 const f=fixture();provider(f);const r=await finish(f.create(f.selected,f.proof));
 assert.equal(r.complete,true);assert.equal(r.conditionalSupported,true);assert.equal(r.etagExposed,false);
 assert.equal(r.v2MetadataRequests,1);assert.equal(r.metadataRequests,6);assert.equal(r.mediaRequests,3);assert.equal(r.mediaBytes,4);
 assert.equal(r.sourceCleanup.settled,true);assert.equal(r.genericUpstreamCleanup,'unknown');assert.ok(!JSON.stringify(r).includes('fixture'));
});
test('missing or weak v2 validator remains unproven after baseline only',async()=>{
 for(const etag of [null,'W/"weak"','""']){const f=fixture();provider(f,{etag});const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,true);assert.equal(r.conditionalSupported,null);assert.equal(r.mediaRequests,1);}
});
test('ignored If-Match is unsupported; rejected matching candidate is not valid media authority',async()=>{
 for(const opts of [{ignore:true},{matchReject:true},{cors:true}]){const f=fixture();provider(f,opts);const r=await finish(f.create(f.selected,f.proof));assert.notEqual(r.conditionalSupported,true);assert.equal(r.mediaRequests,opts.ignore?3:2);assert.equal(r.complete,!!opts.ignore);if(opts.ignore)assert.equal(r.conditionalSupported,false);if(opts.cors)assert.equal(r.failure,'MEDIA_CORS_OR_NETWORK');}
});
test('v2 forbidden, wrong identity and oversized response stop before media',async()=>{
 for(const opts of [{v2error:true},{badId:true},{overflow:true}]){const f=fixture();provider(f,opts);const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,false);assert.equal(r.mediaRequests,0);assert.equal(r.sourceCleanup.settled,true);}
});
test('cleanup rejection is terminal and source drift prevents conditional stage',async()=>{
 const f=fixture();provider(f,{overflow:true,cleanupFail:true});const r=await finish(f.create(f.selected,f.proof));assert.equal(r.failure,'CLEANUP_FAILED');assert.equal(r.sourceCleanup.settled,false);assert.equal(f.calls.length,2);
 const g=fixture();provider(g,{drift:true});const s=await finish(g.create(g.selected,g.proof));assert.equal(s.complete,false);assert.equal(s.mediaRequests,1);assert.equal(s.failure,'METADATA_IDENTITY_CHANGED');
});
test('cancel before metadata finishes forbids v2 and media requests',async()=>{
 const f=fixture();provider(f);const job=f.create(f.selected,f.proof);job.cancel();const r=await finish(job);assert.equal(r.complete,false);assert.equal(r.mediaRequests,0);assert.equal(r.v2MetadataRequests,0);assert.equal(r.localReferencesReleased,true);
});
