import test from 'node:test';
import assert from 'node:assert/strict';
import * as canonical from './owner.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const {openNativeFence,resolveRange}=process.env.Q0_CLASSIC_TEST==='1'
 ?vm.runInNewContext(readFileSync(new URL('./classic.expression.js',import.meta.url),'utf8'),{AbortController,Response,ReadableStream,Uint8Array,setTimeout,clearTimeout})
 :canonical;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture({size=24,chunkBytes=8,timeout=100}={}){
 const state={revision:'A',current:true,meta:0,ranges:0,active:0,peak:0,post:null,rangeWait:null};
 const options={fileId:'fixture',accountKey:'account',accountGeneration:1,chunkBytes,requestTimeoutMs:timeout,isCurrent:()=>state.current,
 async readMetadata({phase}){state.meta++;if(phase==='postflight'&&state.post)await state.post.promise;return {id:'fixture',size:String(size),mimeType:'video/mp4',modifiedTime:'fixed',headRevisionId:state.revision,version:'1',capabilities:{canDownload:true},trashed:false};},
 async readRange({start,end}){state.ranges++;state.active++;state.peak=Math.max(state.peak,state.active);if(state.rangeWait)await state.rangeWait.promise;state.active--;const data=Uint8Array.from({length:end-start+1},(_,i)=>(start+i)%251);return new Response(data,{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(data.length)}});}};
 return {state,options};
}
test('finite/open/suffix/noRange bytes and response headers are exact',async()=>{
 for(const [range,start,end,status] of [[null,0,23,200],['bytes=3-12',3,12,206],['bytes=20-',20,23,206],['bytes=-5',19,23,206],['bytes=20-90',20,23,206]]){
  const f=fixture(),owner=await openNativeFence(f.options),r=owner.response({range});assert.equal(r.status,status);assert.equal(r.headers.get('Content-Length'),String(end-start+1));assert.deepEqual(new Uint8Array(await r.arrayBuffer()),Uint8Array.from({length:end-start+1},(_,i)=>start+i));assert.equal(f.state.peak,1);assert.equal((await owner.close()).settled,true);
 }
 for(const range of ['bytes=0-1,3-4','bytes=-0','bytes=24-','bytes=9-2','bytes=9007199254740992-'])assert.throws(()=>resolveRange(range,24));
});
test('huge virtual original emits first bounded chunk before later reads; backpressure holds',async()=>{
 const f=fixture({size:4_607_107_537,chunkBytes:1048576}),owner=await openNativeFence(f.options),r=owner.response(),reader=r.body.getReader();
 await new Promise(r=>setTimeout(r,5));assert.equal(f.state.ranges,0);
 const first=await reader.read();assert.equal(first.value.length,1048576);assert.equal(f.state.meta,3);assert.equal(f.state.ranges,1);
 await new Promise(r=>setTimeout(r,5));assert.equal(f.state.ranges,1);assert.equal(owner.stats().source.peakRetainedBytes,1048576);await reader.cancel();assert.equal((await owner.close()).settled,true);
});
test('between-chunk same-size drift delivers no changed chunk and errors sibling',async()=>{
 const f=fixture(),o=await openNativeFence(f.options),a=o.response().body.getReader(),b=o.response({range:'bytes=16-'}).body.getReader();
 assert.equal((await a.read()).value.length,8);f.state.revision='B';
 await assert.rejects(a.read());await assert.rejects(b.read());assert.equal(o.stats().deliveredBytes,8);assert.equal(f.state.ranges,1);assert.throws(()=>o.response());assert.equal((await o.close()).settled,true);
});
test('during-chunk drift is withheld through postflight, including sibling queue',async()=>{
 const f=fixture();f.state.post=deferred();const o=await openNativeFence(f.options),a=o.response().body.getReader(),b=o.response().body.getReader();
 const first=a.read(),second=b.read();first.catch(()=>{});second.catch(()=>{});
 await new Promise(r=>setTimeout(r,5));assert.equal(f.state.ranges,1);assert.equal(o.stats().deliveredBytes,0);f.state.revision='B';f.state.post.resolve();
 await assert.rejects(first);await assert.rejects(second);assert.equal(o.stats().deliveredBytes,0);assert.equal(f.state.ranges,1);await o.close();
});
test('held callback cancellation stays unsettled and never authorizes a new response',async()=>{
 const f=fixture({timeout:20});f.state.rangeWait=deferred();const o=await openNativeFence(f.options),reader=o.response().body.getReader();const read=reader.read();read.catch(()=>{});
 await new Promise(r=>setTimeout(r,3));const cleanup=await o.close();assert.equal(cleanup.settled,false);assert.ok(cleanup.pendingCallbacks>0);await assert.rejects(read);assert.throws(()=>o.response());f.state.rangeWait.resolve();await new Promise(r=>setTimeout(r,5));assert.equal((await o.close()).settled,false);assert.equal(o.stats().deliveredBytes,0);
});
test('idle request cancellation preserves siblings; account/session drift retires lease',async()=>{
 const f=fixture(),o=await openNativeFence(f.options),c=new AbortController(),a=o.response({signal:c.signal}).body.getReader(),b=o.response().body.getReader();c.abort();await assert.rejects(a.read());assert.equal((await b.read()).value.length,8);assert.equal(f.state.ranges,1);await o.close();
 const g=fixture(),p=await openNativeFence(g.options),r=p.response().body.getReader();g.state.current=false;await assert.rejects(r.read());assert.equal(p.stats().deliveredBytes,0);await p.close();
});

test('active native cancel drains upstream body then queued sibling reopens exact same pin',async()=>{
 const f=fixture(),cancelGate=deferred(),started=deferred();let first=true,cancelled=0;
 const normal=f.options.readRange;
 f.options.readRange=async args=>{if(!first)return normal(args);first=false;started.resolve();return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([0]));},async cancel(){cancelled++;await cancelGate.promise;} }),{status:206,headers:{'Content-Length':'8','Content-Range':'bytes 0-7/24'}});};
 const o=await openNativeFence(f.options),a=o.response().body.getReader(),b=o.response({range:'bytes=16-23'}).body.getReader();const ar=a.read();await started.promise;await new Promise(r=>setTimeout(r,2));const br=b.read();let delivered=false;br.then(()=>{delivered=true;});const cancellation=a.cancel();await new Promise(r=>setTimeout(r,5));assert.equal(cancelled,1);assert.equal(delivered,false);assert.equal(f.state.meta,2);cancelGate.resolve();await cancellation;assert.equal((await ar).done,true);assert.deepEqual((await br).value,Uint8Array.from({length:8},(_,i)=>16+i));assert.equal(o.stats().reopens,1);assert.equal(o.stats().deliveredBytes,8);assert.equal((await o.close()).settled,true);
});
test('clean EOF allows later seek without new baseline; cancelled active re-open rejects changed descriptor',async()=>{
 const f=fixture(),o=await openNativeFence(f.options);await o.response({range:'bytes=0-7'}).arrayBuffer();await o.response({range:'bytes=16-23'}).arrayBuffer();assert.equal(o.stats().reopens,0);await o.close();
 const g=fixture(),gate=deferred();g.state.post=gate;const p=await openNativeFence(g.options),a=p.response().body.getReader(),b=p.response().body.getReader();const ar=a.read();await new Promise(r=>setTimeout(r,3));const br=b.read();br.catch(()=>{});const cancellation=a.cancel();g.state.revision='B';gate.resolve();await cancellation;await ar;await assert.rejects(br);assert.equal(p.stats().deliveredBytes,0);assert.equal(g.state.ranges,1);assert.throws(()=>p.response());await p.close();
});
test('checksum learned before cancellation remains mandatory on reopened source',async()=>{
 const f=fixture(),base=f.options.readMetadata,gate=deferred();let calls=0;
 f.options.readMetadata=async args=>{calls++;const m=await base(args);if(calls===2)m.sha256Checksum='a'.repeat(64);return m;};f.state.rangeWait=gate;
 const o=await openNativeFence(f.options),a=o.response().body.getReader(),b=o.response().body.getReader();const ar=a.read();await new Promise(r=>setTimeout(r,3));const br=b.read();br.catch(()=>{});const cancelled=a.cancel();gate.resolve();await cancelled;await ar;await assert.rejects(br);assert.equal(f.state.ranges,1);assert.equal(o.stats().deliveredBytes,0);await o.close();
});
test('unsettled active cancellation blocks siblings and never reopens',async()=>{
 const f=fixture({timeout:20});f.state.rangeWait=deferred();const o=await openNativeFence(f.options),a=o.response().body.getReader(),b=o.response().body.getReader();const ar=a.read();await new Promise(r=>setTimeout(r,3));const br=b.read();br.catch(()=>{});await a.cancel();await ar;await assert.rejects(br);assert.equal((await o.close()).settled,false);assert.equal(o.stats().reopens,0);f.state.rangeWait.resolve();
});
test('lease close while reopening waits on opening cleanup and blocks queued bytes',async()=>{
 const f=fixture({timeout:25}),base=f.options.readMetadata,rangeGate=deferred(),openGate=deferred(),opening=deferred();let opens=0;
 f.options.readMetadata=async args=>{if(args.phase==='open'&&++opens===2){opening.resolve();await openGate.promise;}return base(args);};f.state.rangeWait=rangeGate;
 const o=await openNativeFence(f.options),a=o.response().body.getReader(),b=o.response().body.getReader();const ar=a.read();await new Promise(r=>setTimeout(r,3));const br=b.read();br.catch(()=>{});const cancelled=a.cancel();rangeGate.resolve();await cancelled;await ar;await opening.promise;const result=await o.close();assert.equal(result.settled,false);await assert.rejects(br);openGate.resolve();assert.equal(o.stats().deliveredBytes,0);
});
