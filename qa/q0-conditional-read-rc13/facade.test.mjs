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

function provider(f,{etag='"fixture-strong"',ignore=false,cors=false,drift=false}={}){
 let media=0;f.context.fetch=async(address,options)=>{
  const url=new URL(address);f.calls.push({url,options});
  assert.equal(url.origin,'https://www.googleapis.com');assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');
  if(url.searchParams.get('alt')!=='media')return Response.json({...f.metadata,...(drift&&media?{version:'2'}:{})});
  media++;assert.equal(options.headers.Range,'bytes=0-1');
  if(cors&&media===2)throw new TypeError('private provider failure');
  if(media===3&&!ignore)return new Response('private error body',{status:412});
  return new Response(new Uint8Array([0,1]),{status:206,headers:{'Content-Length':'2',...(etag!==null?{ETag:etag}:{})}});
 };
}
test('strong exposed ETag verifies exact2-byte matching and rejection without exporting validator',async()=>{
 const f=fixture();provider(f);const result=await finish(f.create(f.selected,f.proof));
 assert.equal(result.complete,true);assert.equal(result.conditionalSupported,true);assert.equal(result.metadataRequests,6);assert.equal(result.mediaRequests,3);assert.equal(result.mediaBytes,4);
 assert.equal(result.sourceCleanup.settled,true);assert.equal(result.genericUpstreamCleanup,'unknown');assert.ok(!JSON.stringify(result).includes('fixture'));
});
test('hidden or weak ETag stops after one2-byte response without assuming conditional support',async()=>{
 for(const etag of [null,'W/"weak"']){const f=fixture();provider(f,{etag});const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,true);assert.equal(r.strongEtag,false);assert.equal(r.conditionalSupported,null);assert.equal(r.mediaRequests,1);}
});
test('ignored nonmatching header is recorded as unsupported, not a passed condition',async()=>{
 const f=fixture();provider(f,{ignore:true});const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,true);assert.equal(r.conditionalSupported,false);assert.equal(r.mediaBytes,6);
});
test('CORS/network rejection is terminal and never forces a header or retries',async()=>{
 const f=fixture();provider(f,{cors:true});const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,false);assert.equal(r.failure,'MEDIA_CORS_OR_NETWORK');assert.equal(r.mediaRequests,2);assert.equal(r.sourceCleanup.settled,true);
});
test('metadata drift and missing capability stop the conditional sequence',async()=>{
 const f=fixture();provider(f,{drift:true});const r=await finish(f.create(f.selected,f.proof));assert.equal(r.complete,false);assert.equal(r.mediaRequests,1);
 const g=fixture();g.state.authCapabilities.driveRead=false;provider(g);assert.equal(g.create(g.selected,g.proof).poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');assert.equal(g.calls.length,0);
});
test('cancellation and rejected cleanup cannot report safe completion or continue requests',async()=>{
 const f=fixture();provider(f);const job=f.create(f.selected,f.proof);job.cancel();const r=await finish(job);assert.equal(r.complete,false);assert.equal(r.mediaRequests,0);assert.ok(f.calls.length<=1);
 const g=fixture();g.context.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(32769));},cancel(){throw new Error('private cleanup error');}}));
 const bad=await finish(g.create(g.selected,g.proof));assert.equal(bad.failure,'CLEANUP_FAILED');assert.equal(bad.sourceCleanup.settled,false);assert.equal(bad.mediaRequests,0);
});
