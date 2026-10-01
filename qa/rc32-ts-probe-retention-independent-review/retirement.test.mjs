import test from 'node:test';
import assert from 'node:assert/strict';
import {openDriveQ1Source,createDriveQ1ProbeRetention} from '../../media/drive-source.mjs';
import {createTsPlayer} from '../../media/ts-player.mjs';

const head={start:0,end:187},tail={start:564,end:751};
const meta=()=>({id:'review-fixture',headRevisionId:'A',size:'752',mimeType:'video/mp2t',
  modifiedTime:'A',version:'1',sha256Checksum:'a'.repeat(64),capabilities:{canDownload:true},trashed:false});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const opts=patch=>({fileId:'review-fixture',accountKey:'review-account',accountGeneration:1,
  readMetadata:async()=>meta(),isCurrent:()=>true,requestTimeoutMs:1000,...patch});
const response=(start,end,onCancel=()=>{})=>({status:206,
  headers:new Headers({'Content-Range':`bytes ${start}-${end}/752`,'Content-Length':String(end-start+1)}),
  body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(end-start+1).fill(7));controller.close();},cancel:onCancel})});
const fresh=patch=>openDriveQ1Source(opts({readRange:async({start,end})=>response(start,end),...patch}));
async function warm(cache){const source=await fresh();for(const range of [head,tail])await source.read({...range,probeRetention:cache});await source.abort();}

test('aborted cold probe callback cannot retain late bytes and cleanup cancels its late response',async()=>{
  const cache=createDriveQ1ProbeRetention(),gate=deferred(),entered=deferred();let cancelled=0;
  const source=await fresh({readRange:async()=>{entered.resolve();await gate.promise;return response(0,187,()=>cancelled++);}});
  const reading=source.read({...head,probeRetention:cache}),rejected=assert.rejects(reading,/Q1_SOURCE_ABORTED/);
  await entered.promise;const cleanup=source.abort();await rejected;cache.clear();gate.resolve();
  assert.equal((await cleanup).settled,true);assert.equal(cancelled,1);
  assert.equal(cache.stats().retainedBytes,0);assert.equal(source.stats().logicalReturnedBytes,0);
  assert.equal(source.stats().retainedBytes,0);
});

test('account generation mismatch retires both old slots before fresh body admission',async()=>{
  const cache=createDriveQ1ProbeRetention();await warm(cache);let sawRetired=false;
  const source=await fresh({accountGeneration:2,readRange:async({start,end})=>{sawRetired=cache.stats().retainedBytes===0;return response(start,end);}});
  await source.read({...head,probeRetention:cache});assert.equal(sawRetired,true);
  assert.equal(source.stats().cacheHits,0);assert.equal(source.stats().rangeRequests,1);
  assert.equal(cache.stats().retainedBytes,188);await source.abort();cache.clear();
});

test('permission denial on a later unretained playback read clears source-associated raw probes',async()=>{
  const cache=createDriveQ1ProbeRetention();await warm(cache);let denied=false;
  const source=await fresh({readMetadata:async()=>({...meta(),capabilities:{canDownload:!denied}})});
  await source.read({...head,probeRetention:cache});denied=true;
  await assert.rejects(source.read({start:188,end:375}),/Q1_SOURCE_PERMISSION/);
  assert.equal(cache.stats().retainedBytes,0);assert.equal(source.stats().rangeRequests,0);
  assert.equal((await source.abort()).settled,true);
});

test('clear during fresh preflight invalidates in-flight retention but allows later fresh reads',async()=>{
  const cache=createDriveQ1ProbeRetention();let cleared=false;
  const source=await fresh({readMetadata:async({phase})=>{
    if(phase==='preflight'&&!cleared){cleared=true;cache.clear();}return meta();
  }});
  assert.equal((await source.read({...head,probeRetention:cache})).length,188);
  assert.equal(cache.stats().retainedBytes,0);
  await source.read({...head,probeRetention:cache});assert.equal(cache.stats().retainedBytes,188);
  await source.read({...head,probeRetention:cache});assert.equal(source.stats().cacheHits,1);
  assert.equal(source.stats().rangeRequests,2);await source.abort();cache.clear();
});

test('final player disposal during cold probe suppresses late source bytes and MSE creation',async()=>{
  const prior={MediaSource:globalThis.MediaSource,Worker:globalThis.Worker};let created=0,retention,source;
  const entered=deferred(),gate=deferred();
  globalThis.MediaSource=class {constructor(){created++;}};globalThis.Worker=class {};
  const video=new EventTarget();Object.assign(video,{playbackRate:1,paused:true,currentTime:0,disableRemotePlayback:false});
  let player;
  try{
    player=createTsPlayer({video,isCurrent:()=>true,openSource:async({signal})=>{
      source=await fresh({signal,isCurrent:()=>!signal.aborted,readRange:async()=>{entered.resolve();await gate.promise;return response(0,187);}});
      return {get identity(){return source.identity;},read:request=>{retention=request.probeRetention;return source.read(request);},abort:()=>source.abort(),stats:()=>source.stats()};
    }});
    await entered.promise;const disposal=player.dispose();gate.resolve();
    assert.equal((await disposal).settled,true);await player.completion();await turn();
    assert.equal(created,0);assert.equal(retention.stats().retainedBytes,0);
    assert.equal(source.stats().logicalReturnedBytes,0);assert.equal(source.stats().retainedBytes,0);
    assert.equal(player.stats().disposed,true);
  }finally{await player?.dispose();globalThis.MediaSource=prior.MediaSource;globalThis.Worker=prior.Worker;}
});
