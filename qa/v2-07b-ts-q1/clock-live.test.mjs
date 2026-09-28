import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {openDriveQ1Source} from '../../media/drive-source.mjs';
const expression=readFileSync(new URL('./clock-live.expression.js',import.meta.url),'utf8')
  .replace("import('./media/drive-source.mjs')",'Promise.resolve({openDriveQ1Source:globalThis.openDriveQ1Source})');
function fixture(){
  const calls=[],controller={state:'activated'},abort=new AbortController();
  const selected={id:'fixture-file',size:'6803156',mimeType:'video/x-matroska',modifiedTime:'fixture-time',capabilities:{canDownload:true}};
  const metadata={...selected,version:'1',headRevisionId:'fixture-revision',trashed:false};
  const state={files:[selected],accountId:'subject',authAccountKey:'opaque',authGeneration:1,driveSessionGeneration:2,
    tokenRevision:3,token:'fixture-token',expiresAt:Date.now()+3600000,accountStateAbortController:abort,
    accountStateWriterId:'fixture-writer',accountStateRevision:1,accountMediaState:{viewed:{fixture:1}},
    mediaSession:4,playbackSession:5,authStatus:'online',demo:false,accountIdentityPending:false,accountStateLoaded:true,
    accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,
    selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
  const context={state,openDriveQ1Source,Uint8Array,TextDecoder,URL,AbortController,JSON,Promise,setTimeout,clearTimeout,
    APP_VERSION:'1.22.0-rc.11',DRIVE_MUTATIONS_ENABLED:false,ACCOUNT_STATE_WRITES_ENABLED:true,
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
  const create=vm.runInContext(expression,context),proof={get:()=>({controller,version:'1.22.0-rc.11'})};
  const clock=async({read,sourceSize,isCurrent})=>{assert.equal(isCurrent(),true);await read({start:0,end:524143});await read({start:sourceSize-524144,end:sourceSize-1});return {diagnostic:true};};
  return {context,state,selected,calls,metadata,create,proof,clock};
}
async function finish(job){for(let i=0;i<100;i++){const result=job.poll();if(result.done)return result.summary;await new Promise(r=>setTimeout(r,2));}throw new Error('job did not finish');}
test('live facade uses five metadata GETs and two exact bounded generic ranges with settled local cleanup',async()=>{
  const f=fixture(),job=f.create(f.selected,f.clock,f.proof);
  assert.equal(job.poll().done,false);
  const result=await finish(job);assert.equal(result.complete,true);assert.equal(result.failure,null);
  assert.equal(result.metadataRequests,5);assert.equal(result.mediaRequests,2);assert.equal(result.mediaBytes,1048288);
  assert.equal(result.sourceCleanup.settled,true);assert.equal(result.metadataCleanup,'body-consumed');
  assert.equal(result.genericUpstreamCleanup,'unknown');assert.equal(result.localReferencesReleased,true);
  assert.equal(f.calls.length,7);assert.ok(!JSON.stringify(result).includes('fixture'));
});
test('token drift, list metadata drift and cancellation stop before media reads',async()=>{
  const a=fixture();a.state.token='changed';const job=a.create(a.selected,async options=>{a.state.token='newer';return a.clock(options);},a.proof);
  const first=await finish(job);assert.equal(first.complete,false);assert.equal(first.mediaRequests,0);
  const b=fixture();b.metadata.modifiedTime='changed';const second=await finish(b.create(b.selected,b.clock,b.proof));
  assert.equal(second.complete,false);assert.equal(second.mediaRequests,0);
  const c=fixture(),cancelled=c.create(c.selected,c.clock,c.proof);cancelled.cancel();
  assert.equal((await finish(cancelled)).complete,false);assert.equal(c.calls.length,0);
});
test('non-current selected object and non-quiescent writer reject without network',()=>{
  const f=fixture();assert.equal(f.create({...f.selected},f.clock,f.proof).poll().done,true);
  f.state.accountStateSyncTimer=1;assert.equal(f.create(f.selected,f.clock,f.proof).poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');
  assert.equal(f.calls.length,0);
});
test('metadata cap with rejected cancellation is terminal and never permits a media request',async()=>{
  const f=fixture();let calls=0;
  f.context.fetch=async()=>{calls++;return new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(32769));},
    cancel(){throw new Error('fixture cleanup rejected');}
  }));};
  const result=await finish(f.create(f.selected,f.clock,f.proof));
  assert.equal(result.complete,false);assert.equal(result.failure,'CLEANUP_FAILED');
  assert.equal(result.metadataCleanup,'CLEANUP_FAILED');assert.equal(result.mediaRequests,0);assert.equal(calls,1);
});
