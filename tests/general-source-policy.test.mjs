import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGeneralSource} from '../media/general-source.mjs';
import {openDriveQ1Source} from '../media/drive-source.mjs';
import {probePinnedQ3Video,streamGeneralQ3} from '../media/video-q3-pipeline.mjs';
import {probePinnedGeneralAudio} from '../media/audio-general-pipeline.mjs';
import {streamGeneralQ1} from '../media/general-pipeline.mjs';
const KiB=1024,policy={blockSize:512*KiB,maxCacheSize:512*KiB};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function source(bytes){const ranges=[];let active=0,peak=0,aborts=0;return {identity:{size:bytes.length},ranges,
 async read({start,end}){ranges.push([start,end]);active++;peak=Math.max(peak,active);try{await Promise.resolve();return bytes.slice(start,end+1);}finally{active--; }},
 async abort(){aborts++;return {settled:active===0};},stats:()=>({peak,aborts})};}
test('reader defaults and strict finite aligned cache policies fail before reads',async()=>{
 const s=source(new Uint8Array(2*512*KiB));
 for(const field of ['blockSize','maxCacheSize'])for(const value of [null,'65536',NaN,Infinity,0,-65536,32768,65537,196608,1048576,Number.MAX_SAFE_INTEGER]){
  assert.throws(()=>createGeneralSource(s,{[field]:value}),/GENERAL_CACHE_POLICY/);
 }
 assert.throws(()=>createGeneralSource(s,{blockSize:512*KiB,maxCacheSize:256*KiB}),/GENERAL_CACHE_POLICY/);assert.equal(s.ranges.length,0);
 const rpc=createGeneralSource(s);assert.equal(rpc.custom._options.maxCacheSize,256*KiB);
 await rpc.request(0,1);assert.deepEqual(s.ranges,[[0,64*KiB-1]]);assert.equal((await rpc.cleanup()).settled,true);
 for(const blockSize of [64,128,256,512].map(n=>n*KiB)){const next=createGeneralSource(source(new Uint8Array(1024)),{blockSize,maxCacheSize:512*KiB});assert.equal(next.custom._options.maxCacheSize,512*KiB);await next.cleanup();}
});
test('512KiB crossing, short EOF, eviction and concurrent reads preserve exact bytes and single in-flight ownership',async()=>{
 const bytes=Uint8Array.from({length:2*512*KiB+37},(_,i)=>(i*17)%251),s=source(bytes),rpc=createGeneralSource(s,policy);
 assert.equal(rpc.custom._options.maxCacheSize,512*KiB);
 assert.deepEqual(await rpc.exact(512*KiB-13,41),bytes.slice(512*KiB-13,512*KiB+28));
 const hits=rpc.metrics.cacheHits;assert.deepEqual(await rpc.exact(512*KiB+1,5),bytes.slice(512*KiB+1,512*KiB+6));assert.equal(rpc.metrics.cacheHits,hits+1);
 assert.deepEqual(await rpc.exact(bytes.length-11,11),bytes.slice(-11));
 await Promise.all([rpc.request(0,7),rpc.request(512*KiB,512*KiB+9),rpc.request(0,10)]);
 assert.deepEqual(s.ranges,[[0,512*KiB-1],[512*KiB,1024*KiB-1],[1024*KiB,bytes.length-1],[0,512*KiB-1],[512*KiB,1024*KiB-1],[0,512*KiB-1]]);
 assert.equal(rpc.metrics.peakCache,512*KiB);assert.equal(rpc.metrics.peakInFlight,1);assert.equal(s.stats().peak,1);assert.equal((await rpc.cleanup()).settled,true);assert.equal(s.stats().aborts,1);
});
test('512KiB reads keep discovery byte/request budgets unchanged',async()=>{
 for(const options of [{discoveryBytes:512*KiB-1},{discoveryRequests:0}]){const s=source(new Uint8Array(1024*KiB)),rpc=createGeneralSource(s,{...policy,...options});await assert.rejects(rpc.request(0,1),/GENERAL_DISCOVERY_LIMIT/);assert.equal(s.ranges.length,0);assert.equal((await rpc.cleanup()).settled,true);}
});
test('large read abort, timeout and current drift cannot populate cache and cleanup settles queued reads',async()=>{
 for(const mode of ['abort','timeout','current']){
  const entered=deferred(),body=deferred(),controller=new AbortController();let current=true,aborts=0;
  const s={identity:{size:1024*KiB},read:({start,end})=>{assert.equal(end-start+1,512*KiB);entered.resolve();return body.promise;},abort:async()=>{aborts++;body.resolve(new Uint8Array(512*KiB));return {settled:true};}};
  const rpc=createGeneralSource(s,{...policy,signal:controller.signal,isCurrent:()=>current,readTimeoutMs:mode==='timeout'?10:1000});
  const first=rpc.request(0,1),queued=rpc.request(512*KiB,512*KiB+1);const failures=Promise.all([assert.rejects(first,mode==='timeout'?/GENERAL_READ_TIMEOUT/:/GENERAL_CANCELLED/),assert.rejects(queued,/GENERAL_CANCELLED/)]);
  await entered.promise;if(mode==='abort')controller.abort();if(mode==='current'){current=false;body.resolve(new Uint8Array(512*KiB));}
  await failures;assert.equal(rpc.metrics.peakCache,0);assert.equal(rpc.metrics.requests,1);assert.equal((await rpc.cleanup()).settled,true);assert.equal(aborts,1);
 }
});
test('real Drive source pre/post revision and checksum fences reject 512KiB bodies without byte admission',async()=>{
 for(const phase of ['preflight','postflight'])for(const patch of [{headRevisionId:'revision-2'},{sha256Checksum:'b'.repeat(64)}]){
  const metadata={id:'fixture',headRevisionId:'revision-1',size:String(1024*KiB),mimeType:'video/mp4',modifiedTime:'2026-10-02T00:00:00.000Z',capabilities:{canDownload:true},trashed:false,version:'1',sha256Checksum:'a'.repeat(64)};const phases=[];let ranges=0;
  const drive=await openDriveQ1Source({fileId:'fixture',accountKey:'synthetic',accountGeneration:1,isCurrent:()=>true,readMetadata:async r=>{phases.push(r.phase);return {...metadata,...(r.phase===phase?patch:{})};},readRange:async({start,end})=>{ranges++;assert.equal(end-start+1,512*KiB);return {status:206,headers:new Headers({'Content-Range':`bytes ${start}-${end}/${metadata.size}`,'Content-Length':String(end-start+1)}),body:new ReadableStream({start(c){c.enqueue(new Uint8Array(end-start+1));c.close();}})};}});
  const rpc=createGeneralSource(drive,policy);await assert.rejects(rpc.request(0,1),/Q1_SOURCE_CONTENT_DRIFT/);assert.equal(ranges,phase==='preflight'?0:1);assert.deepEqual(phases,phase==='preflight'?['open','preflight']:['open','preflight','postflight']);assert.equal(drive.stats().releasedBytes,0);assert.equal(rpc.metrics.peakCache,0);assert.equal((await rpc.cleanup()).settled,true);
 }
});
test('only Q3 stream selects 512KiB while Q3 probe, Q2 probe and Q1 remain at 64KiB',async()=>{
 const fixture=fs.readFileSync(new URL('../qa/q3-browser-execution/synthetic-mpeg4.mp4',import.meta.url)),bytes=Buffer.alloc(1024*KiB);fixture.copy(bytes);const mdat=bytes.indexOf('mdat');assert.ok(mdat>0);bytes.writeUInt32BE(0,mdat-4);
 const scope={VideoDecoder:{isConfigSupported:async()=>({supported:false})},VideoEncoder:{isConfigSupported:async()=>({supported:true})},MediaSource:{isTypeSupported:()=>true}};
 const q3=source(bytes);await assert.rejects(streamGeneralQ3({source:q3,scope,onChunk(){},limits:{blockSize:64*KiB,maxCacheSize:256*KiB},loadModule:async()=>{throw Error('Q3_TEST_STOP');}}),/Q3_TEST_STOP/);assert.equal(q3.ranges[0][1]+1,512*KiB);assert.equal(q3.stats().aborts,1);
 const probe=source(bytes);assert.equal((await probePinnedQ3Video(probe,{scope,nativeRejected:true})).route,'q3');assert.equal(probe.ranges[0][1]+1,64*KiB);
 const q2=source(bytes);assert.equal((await probePinnedGeneralAudio(q2)).route,'native');assert.equal(q2.ranges[0][1]+1,64*KiB);
 const q1=source(bytes);await assert.rejects(streamGeneralQ1({source:q1,onChunk(){}}),/^Error: GENERAL_/);assert.equal(q1.ranges[0][1]+1,64*KiB);
});
