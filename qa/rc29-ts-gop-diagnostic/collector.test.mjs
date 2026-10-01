import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const expression=readFileSync(new URL('./collector.expression.js',import.meta.url),'utf8');
const binding=JSON.parse(readFileSync(new URL('./provenance.json',import.meta.url)));
const fixture=readFileSync(new URL('../v2-07b-ts-q1/synthetic-bframes-audiolead.ts',import.meta.url));
class Events extends EventTarget{listeners=new Map();addEventListener(t,f,o){super.addEventListener(t,f,o);if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(f);}removeEventListener(t,f,o){super.removeEventListener(t,f,o);this.listeners.get(t)?.delete(f);}count(){return [...this.listeners.values()].reduce((s,x)=>s+x.size,0);}}
function setup(change={}){
  const events=new Events(),sw=new Events(),controller={state:'activated'},abort=new AbortController();sw.controller=controller;
  const meta={id:'SYNTHETIC_ONLY_FILE',name:'PRIVATE_CANARY_NAME',size:String(fixture.length),mimeType:'video/mp2t',modifiedTime:'SYNTHETIC_MODIFIED',parents:['SYNTHETIC_PARENT'],version:'1',headRevisionId:'SYNTHETIC_REVISION',md5Checksum:'a'.repeat(32),trashed:false,capabilities:{canDownload:true}};
  const state={accountId:'SYNTHETIC_ACCOUNT',authAccountKey:'SYNTHETIC_KEY',authGeneration:1,driveSessionGeneration:1,token:'PRIVATE_CANARY_TOKEN',tokenRevision:1,expiresAt:123,accountStateAbortController:abort,accountStateWriterId:'SYNTHETIC_WRITER',accountStateRevision:1,accountMediaState:{},authStatus:'online',demo:false,accountIdentityPending:false,accountStateLoaded:true,selected:null,mediaAttempt:'idle',mediaAbortController:null,pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false,accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,mediaSession:1,playbackSession:1};
  events.__resumeSwProof={get:()=>({controller,version:binding.version,sourceCommit:binding.sourceCommit,sourceSHA256:binding.sourceSHA256})};
  events.__resumeFailedNormalTarget={file:{...meta},version:binding.version,sourceCommit:binding.sourceCommit,accountId:state.accountId,authAccountKey:state.authAccountKey,controller};
  state.files=[{...meta}];
  let calls=0,media=0,metadata=0;const observed=[];
  const fetch=async(url,options)=>{
    calls++;const u=new URL(url);assert.equal(u.origin,'https://www.googleapis.com');assert.equal(u.pathname,'/drive/v3/files/SYNTHETIC_ONLY_FILE');
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
    observed.push(options);
    if(u.searchParams.get('alt')==='media'){
      media++;const match=/^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);assert.ok(match);
      const [start,end]=match.slice(1).map(Number),body=Uint8Array.from(fixture.subarray(start,end+1));
      const headers={'content-length':String(body.length),'content-range':`bytes ${start}-${end}/${fixture.length}`};
      return change.response?.({media,metadata,body,headers,state,options})??new Response(body,{status:206,headers});
    }
    metadata++;const value=change.metadata?.({metadata,meta,state})??meta;
    return new Response(typeof value==='string'?value:JSON.stringify(value));
  };
  const context=vm.createContext({window:events,state,navigator:{onLine:true,serviceWorker:sw},document:{visibilityState:'visible'},
    location:{origin:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',href:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/'},
    APP_VERSION:change.version??binding.version,DRIVE_MUTATIONS_ENABLED:false,ACCOUNT_STATE_WRITES_ENABLED:true,top:events,self:events,
    hasUsableToken:()=>true,accountMediaStatesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),mediaSourceGeneration:1,q1RetirementResult:{settled:true},q1Playback:null,playerMediaPriorityActive:false,
    Uint8Array,URL,TextDecoder,AbortController,fetch,setTimeout:(fn,ms)=>setTimeout(fn,change.fastDeadline&&ms===10000?20:ms),clearTimeout,setInterval,clearInterval});
  const start=vm.runInContext(expression,context),job=start();
  return {job,state,events,sw,observed,counts:()=>({calls,media,metadata})};
}
async function finish(s){for(let i=0;i<500&&!s.job.poll().done;i++)await new Promise(r=>setTimeout(r,2));
  assert.equal(s.job.poll().done,true);assert.equal(s.events.count(),0);assert.equal(s.sw.count(),0);
  const result=s.job.poll().summary,text=JSON.stringify(result);
  for(const canary of ['PRIVATE_CANARY','SYNTHETIC_ACCOUNT','SYNTHETIC_REVISION','googleapis','Bearer'])assert.equal(text.includes(canary),false);
  return result;
}
test('serialized actual collector admits exactly 5 metadata and 2 ranges, safe release',async()=>{
  const s=setup(),r=await finish(s);assert.equal(r.complete,true);assert.equal(r.metadataRequests,5);assert.equal(r.mediaRequests,2);
  assert.equal(r.analysis.code,'CANONICAL_STARTUP_PLAN_PASS');assert.equal(r.visibleExactContentRange,2);assert.equal(r.corsHiddenKnownSizeLength,0);
  assert.equal(r.cleanupSettled,true);assert.equal(r.privateBuffersReleased,true);assert.ok(r.totalBytes<2097152);assert.ok(s.observed.every(x=>x.signal.aborted));
});
test('CORS-hidden range gets narrower integrity label only with exact exposed length',async()=>{
  const r=await finish(setup({response:({body,headers})=>{delete headers['content-range'];return new Response(body,{status:206,headers});}}));
  assert.equal(r.complete,true);assert.equal(r.visibleExactContentRange,0);assert.equal(r.corsHiddenKnownSizeLength,2);
});
for(const [name,response,code] of [
  ['200 body',({body,headers})=>new Response(body,{status:200,headers}),'RESPONSE_STATUS'],
  ['missing length hidden',({body})=>new Response(body,{status:206}),'RANGE_LENGTH'],
  ['false content range',({body,headers})=>new Response(body,{status:206,headers:{...headers,'content-range':'bytes 0-1/2'}}),'RANGE_CONTENT_RANGE'],
  ['encoded body',({body,headers})=>new Response(body,{status:206,headers:{...headers,'content-encoding':'gzip'}}),'RANGE_ENCODING'],
  ['oversized body',({body,headers})=>new Response(new Uint8Array(body.length+1),{status:206,headers}),'BODY_LIMIT']
])test(`rejects ${name}`,async()=>{const r=await finish(setup({response}));assert.equal(r.failure,code);assert.equal(r.mediaRequests,1);assert.equal(r.analysis,null);assert.equal(r.cleanupSettled,true);});
test('metadata pre/post drift rejects before reuse or next range',async()=>{
  for(const at of [2,3,4,5]){const r=await finish(setup({metadata:({metadata,meta})=>({...meta,version:metadata===at?'2':'1'})}));
    assert.equal(r.failure,'IDENTITY_CHANGED');assert.equal(r.metadataRequests,at);assert.ok(r.mediaRequests<=2);}
});
test('metadata body cap enforced without raw parse/return',async()=>{
  const r=await finish(setup({metadata:()=> ' '.repeat(65537)}));assert.equal(r.failure,'BODY_LIMIT');assert.equal(r.mediaRequests,0);
});
test('ownership drift stops and erases result',async()=>{
  const r=await finish(setup({response:({state})=>{state.tokenRevision++;return new Response(new Uint8Array(1),{status:206});}}));
  assert.equal(r.failure,'OWNER_CHANGED');assert.equal(r.mediaRequests,1);assert.equal(r.analysis,null);
});
test('current UI metadata drift stops before another request',async()=>{
  const r=await finish(setup({metadata:({metadata,meta,state})=>{if(metadata===2)state.files[0]={...state.files[0],name:'CHANGED'};return meta;}}));
  assert.equal(r.failure,'OWNER_CHANGED');assert.equal(r.mediaRequests,0);
});
test('cancel hanging body settles reader/listeners and produces no timing claim',async()=>{
  let cancelled=0;const s=setup({response:({headers})=>new Response(new ReadableStream({cancel(){cancelled++;}}),{status:206,headers})});
  await new Promise(r=>setTimeout(r,15));s.job.cancel();const result=await finish(s);
  assert.equal(result.failure,'CANCELLED');assert.equal(result.analysis,null);assert.equal(cancelled,1);assert.equal(result.cleanupSettled,true);
});
test('request body deadline aborts and settles',async()=>{
  const r=await finish(setup({fastDeadline:true,response:({headers})=>new Response(new ReadableStream({}),{status:206,headers})}));
  assert.equal(r.failure,'REQUEST_DEADLINE');assert.equal(r.cleanupSettled,true);
});
test('source29 mismatch rejects before GET',async()=>{
  const s=setup({version:'wrong'}),r=await finish(s);assert.equal(r.failure,'SOURCE_BINDING_REJECTED');assert.equal(s.counts().calls,0);
});
