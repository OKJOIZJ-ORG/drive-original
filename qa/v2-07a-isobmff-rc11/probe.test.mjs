import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildFirstIsoBundle} from './build.mjs';
const origin='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const built=await buildFirstIsoBundle(),hash=value=>createHash('sha256').update(value).digest('hex');
const protectedPaths=['../v2-07a-current-corpus-probe/current-corpus-browser-bundle.js',
  '../v2-07a-current-corpus-probe/metadata-catalog-rc11.generated.js','../v2-07a-isobmff-index/isobmff-index.mjs'];
const protectedHashes=await Promise.all(protectedPaths.map(path=>readFile(new URL(path,import.meta.url)).then(hash)));
function putHeader(bytes,at,type,size) {
  new DataView(bytes.buffer).setUint32(at,size);bytes.set(new TextEncoder().encode(type),at+4);
}
function fixture(options={}) {
  const controller={state:'activated',scriptURL:origin+'/sw.js'};
  const state={accountId:'PRIVATE_ACCOUNT',authAccountKey:'PRIVATE_SUB',authGeneration:2,driveSessionGeneration:3,
    tokenRevision:4,token:'PRIVATE_TOKEN',expiresAt:Date.now()+3600000,authStatus:'online',demo:false,accountIdentityPending:false,
    accountStateAbortController:new AbortController(),accountStateLoaded:true,accountStateWriterId:'PRIVATE_WRITER',accountStateRevision:0,
    accountStateSyncPromise:null,accountStateSyncTimer:null,accountStateSyncRetryTimer:null,accountStateSyncError:null,
    accountMediaState:{favorites:[]},mediaSession:2,selected:null,mediaAttempt:'idle',mediaAbortController:null,
    pendingOriginalBuffer:null,pendingPlay:false,mediaTransportStarted:false};
  const root={id:'PRIVATE_ROOT',mimeType:'application/vnd.google-apps.folder',version:'1',modifiedTime:'2026-09-29T00:00:00.000Z',trashed:false,capabilities:{canListChildren:true}};
  const file=(id,name,mimeType,size)=>({id,name,mimeType,size:String(size),version:'1',modifiedTime:root.modifiedTime,
    parents:[root.id],trashed:false,capabilities:{canDownload:true,canReadRevisions:true},videoMediaMetadata:{durationMillis:'1000',width:640,height:360}});
  const ts=file('A_PRIVATE_PRIORITY','PRIVATE_TS.mp4','video/mp4',18800);
  const iso=file(options.late?'Z_PRIVATE_ISO':'B_PRIVATE_ISO',options.late?'PRIVATE_ISO.3gp':'PRIVATE_ISO.mov','video/quicktime',options.small?940:10000);
  const extra=Array.from({length:options.count?options.count-2:0},(_,i)=>file(`C_PRIVATE_BMP_${String(i).padStart(2,'0')}`,`PRIVATE_IMAGE_${i}.bmp`,'image/bmp',10000));
  const isoBytes=new Uint8Array(Number(iso.size));
  putHeader(isoBytes,0,'ftyp',24);
  if(!options.small){putHeader(isoBytes,24,'mdat',options.eof?9968:8976);putHeader(isoBytes,options.eof?9992:9000,'moov',options.eof?8:1000);}
  if(options.limit){putHeader(isoBytes,0,'ftyp',8);for(let i=1;i<45;i++)putHeader(isoBytes,i*8,'free',8);putHeader(isoBytes,360,'mdat',9640);}
  if(options.straddle){putHeader(isoBytes,0,'ftyp',24);putHeader(isoBytes,24,'free',912);putHeader(isoBytes,936,'mdat',9064);}
  if(options.sparseLimit){putHeader(isoBytes,0,'ftyp',24);putHeader(isoBytes,24,'mdat',976);for(let i=0;i<45;i++)putHeader(isoBytes,1000+i*8,'free',8);putHeader(isoBytes,1360,'mdat',8640);}
  const tsBytes=new Uint8Array(Number(ts.size));for(let i=0;i<tsBytes.length;i+=188)tsBytes[i]=0x47;
  const calls=[],listeners=new Set();let final=false;
  const sandbox={URL,Headers,Response,Request,ReadableStream,AbortController,DOMException,Uint8Array,TextDecoder,
    setTimeout,clearTimeout,performance,APP_VERSION:'1.22.0-rc.11',DRIVE_MUTATIONS_ENABLED:false,ACCOUNT_STATE_WRITES_ENABLED:true,
    state,mediaSourceGeneration:7,q1Playback:null,q1RetirementResult:{settled:true},playerMediaPriorityActive:false,
    hasUsableToken:()=>true,accountMediaStatesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    navigator:{onLine:true,serviceWorker:{controller}},location:{href:origin+'/',origin},document:{visibilityState:'visible'},top:1,self:1,
    window:{addEventListener:type=>listeners.add(type),removeEventListener:type=>listeners.delete(type)},
    fetch:async(value,init)=>{
      const url=new URL(value);calls.push({url,init});assert.equal(init.method,'GET');assert.equal(init.body,undefined);assert.equal(init.priority,'low');
      const isMedia=url.pathname.startsWith('/__drive_media/');
      await Promise.resolve();
      if(isMedia){
        assert.equal(url.searchParams.has('mediaOwner'),false);assert.equal(url.searchParams.has('sourceGeneration'),false);
        const bmp=new Uint8Array(10000);bmp[0]=0x42;bmp[1]=0x4d;
        const buffer=url.pathname.endsWith(ts.id)?tsBytes:url.pathname.endsWith(iso.id)?isoBytes:bmp,range=new Headers(init.headers).get('Range');
        const match=/^bytes=(\d+)-(\d+)$/.exec(range);assert.ok(match);const start=Number(match[1]),end=Number(match[2]);
        assert.ok(end<buffer.length-1);let body=buffer.slice(start,end+1);
        if(options.lengthMismatch)body=new Uint8Array(body.length+1);
        if(options.oversized)body=new Uint8Array(65536);
        const headers={'Content-Range':`bytes ${start}-${end}/${buffer.length}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store'};
        if(options.badRange)headers['Content-Range']=`bytes ${start+1}-${end+1}/${buffer.length}`;
        options.afterMedia?.(sandbox);
        if(options.held)return new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){return Promise.resolve();}}),{status:206,headers});
        return new Response(body,{status:options.status200?200:206,headers});
      }
      assert.equal(url.origin,'https://www.googleapis.com');assert.equal(url.searchParams.has('alt'),false);
      if(url.pathname.endsWith('/about')){if(calls.some(call=>call.url.origin===origin))final=true;return Response.json({user:{permissionId:state.accountId}});}
      const observedIso={...iso,version:options.drift&&final?'2':'1'};
      if(url.pathname.endsWith('/'+root.id))return Response.json(root);
      if(url.pathname.endsWith('/'+ts.id))return Response.json(ts);
      if(url.pathname.endsWith('/'+iso.id))return Response.json(observedIso);
      const extraFile=extra.find(item=>url.pathname.endsWith('/'+item.id));if(extraFile)return Response.json(extraFile);
      if(url.pathname.endsWith('/files'))return Response.json(url.searchParams.has('pageToken')
        ?{incompleteSearch:false,files:[observedIso,...extra]}:{incompleteSearch:false,nextPageToken:'PRIVATE_NEXT',files:[ts]});
      throw new Error('PRIVATE_BAD_URL');
    }};
  const keys=Object.keys(sandbox),start=vm.runInNewContext(built.bundle,sandbox);assert.deepEqual(Object.keys(sandbox),keys);
  const proof={get:()=>options.noProof?null:({controller,version:'1.22.0-rc.11'})};
  const context=JSON.stringify({accountKey:state.accountId,generation:3,rootId:root.id,priorityFileId:ts.id});
  return {sandbox,calls,listeners,start,proof,context,media:()=>calls.filter(call=>call.url.origin===origin)};
}
async function finish(job) {
  for(let i=0;i<500;i++){const result=job.poll();if(result.done)return result.summary;await new Promise(resolve=>setTimeout(resolve,1));}
  throw new Error('LOCAL_TIMEOUT');
}
function privateOmitted(value){const text=JSON.stringify(value);for(const key of ['PRIVATE_ACCOUNT','PRIVATE_SUB','PRIVATE_TOKEN','PRIVATE_WRITER','PRIVATE_ROOT','PRIVATE_PRIORITY','PRIVATE_ISO','PRIVATE_TS','PRIVATE_NEXT','9000','10000'])assert.equal(text.includes(key),false,key);}
test('deterministic new bundle pins rc11 explicitly and leaves historical inputs unchanged',async()=>{
  assert.equal((await buildFirstIsoBundle()).bundle,built.bundle);assert.equal(hash(built.bundle),built.provenance.bundleSHA256);
  assert.deepEqual(await Promise.all(protectedPaths.map(path=>readFile(new URL(path,import.meta.url)).then(hash))),protectedHashes);
  assert.equal(built.bundle.includes('\r'),false);
});
test('real canonical selector/pagination routes TS prefix only and first ISO sparse headers with no payload/EOF',async()=>{
  const f=fixture(),job=f.start(f.context,f.proof);assert.equal(job.then,undefined);const result=await finish(job);
  assert.equal(result.complete,true);assert.equal(result.catalogStable,true);assert.equal(result.preflightAccepted,true);
  assert.equal(result.freshSWRuntimeVersionVerified,true);assert.equal(result.isoHeadersComplete,true);
  assert.equal(result.iso.moovCount,1);assert.equal(result.iso.moovAfterMdat,true);assert.equal(result.iso.boxes,3);
  assert.deepEqual(f.media().map(call=>new Headers(call.init.headers).get('Range')),['bytes=0-939','bytes=0-939','bytes=9000-9007']);
  assert.equal(result.receivedBytes,1888);assert.equal(result.mediaRequests,3);
  assert.equal(f.calls.filter(call=>call.url.searchParams.has('pageToken')).length,4);
  assert.equal(f.listeners.size,0);const count=f.calls.length;job.cancel();job.poll();assert.equal(f.calls.length,count);privateOmitted(result);
});
test('prefix-straddling ISO header consumes only its uncached nonoverlapping tail',async()=>{
  const f=fixture({straddle:true}),result=await finish(f.start(f.context,f.proof));assert.equal(result.complete,true);
  assert.deepEqual(f.media().map(call=>new Headers(call.init.headers).get('Range')),['bytes=0-939','bytes=0-939','bytes=940-943']);
  assert.equal(result.receivedBytes,1884);privateOmitted(result);
});
test('missing SW runtime proof rejects all metadata and body requests',async()=>{
  const f=fixture({noProof:true}),result=await finish(f.start(f.context,f.proof));assert.equal(result.preflightAccepted,false);
  assert.equal(result.complete,false);assert.equal(result.freshSWRuntimeVersionVerified,false);assert.equal(f.calls.length,0);privateOmitted(result);
});
test('strict206/content-range/exact streamed length failures stop every later body',async()=>{
  for(const [options,code] of [[{status200:true},'STATUS_NOT_206'],[{badRange:true},'CONTENT_RANGE_INVALID'],[{lengthMismatch:true},'BODY_LENGTH_MISMATCH'],[{oversized:true},'BODY_LENGTH_MISMATCH']]){
    const f=fixture(options),result=await finish(f.start(f.context,f.proof));assert.equal(result.complete,false);assert.ok(result.failure);
    assert.equal(result.failure,code);assert.ok(result.receivedBytes<=39816);
    assert.equal(f.media().length,1);assert.equal(result.released,true);privateOmitted(result);
  }
});
test('actual selector38 routes through late ISO within whole-run caps;39 rejects before every media request',async()=>{
  const f=fixture({count:38,late:true,sparseLimit:true}),result=await finish(f.start(f.context,f.proof));
  assert.equal(result.selected,38);assert.equal(result.routed,38);assert.equal(result.isoFound,true);assert.equal(result.iso.code,'REQUEST_LIMIT');
  assert.equal(result.mediaRequests,74);assert.ok(result.mediaRequests<=76);assert.ok(result.receivedBytes<=39816);assert.ok(result.dispatches<=512);privateOmitted(result);
  const over=fixture({count:39}),failed=await finish(over.start(over.context,over.proof));
  assert.equal(failed.failure,'SELECTION_FAILED');assert.equal(over.media().length,0);assert.equal(failed.complete,false);privateOmitted(failed);
});
test('header request limit and final-byte guard retain incomplete structure without reading EOF',async()=>{
  for(const options of [{limit:true},{eof:true}]){
    const f=fixture(options),result=await finish(f.start(f.context,f.proof));assert.equal(result.complete,false);assert.equal(result.catalogStable,true);
    assert.equal(result.failure,null);assert.equal(result.isoHeadersComplete,false);assert.ok(result.iso.headerRequests<=38);
    if(options.eof){assert.equal(result.iso.eofHeaderSkipped,true);assert.equal(f.media().length,2);}
    else assert.equal(result.iso.code,'REQUEST_LIMIT');privateOmitted(result);
  }
});
test('small ISO is skipped without full-object read and no-ISO outcome cannot claim complete',async()=>{
  const f=fixture({small:true}),result=await finish(f.start(f.context,f.proof));assert.equal(result.complete,false);assert.equal(result.catalogStable,true);
  assert.equal(result.isoFound,false);assert.equal(result.skippedSmall,1);assert.equal(f.media().length,1);privateOmitted(result);
});
test('final catalog drift preserves redacted original comparison dimensions',async()=>{
  const f=fixture({drift:true}),result=await finish(f.start(f.context,f.proof));assert.equal(result.complete,false);assert.equal(result.failure,'CATALOG_DRIFT');
  assert.equal(result.catalogComparison.comparatorCode,'REPEAT_MISMATCH');assert.equal(result.catalogComparison.itemsChanged,1);privateOmitted(result);
});
test('owner or queued-write change during body stops and never starts ISO continuation',async()=>{
  for(const mutate of [s=>s.state.tokenRevision++,s=>s.state.accountStateSyncTimer=1,s=>s.state.accountMediaState.favorites.push('PRIVATE_ID'),
    s=>s.mediaSourceGeneration++,s=>s.navigator.serviceWorker.controller={...s.navigator.serviceWorker.controller}]){
    const f=fixture({afterMedia:mutate}),result=await finish(f.start(f.context,f.proof));assert.equal(result.complete,false);assert.ok(result.failure);
    assert.equal(f.media().length,1);privateOmitted(result);
  }
});
test('cancelled held body releases bounded owner and cannot resume',async()=>{
  const f=fixture({held:true}),job=f.start(f.context,f.proof);
  for(let i=0;i<100&&!f.media().length;i++)await new Promise(resolve=>setTimeout(resolve,1));
  job.cancel();job.cancel();const result=await finish(job);assert.equal(result.complete,false);assert.ok(result.failure);
  assert.equal(f.media().length,1);assert.equal(result.released,true);assert.equal(f.listeners.size,0);privateOmitted(result);
});
