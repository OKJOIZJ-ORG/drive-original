import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {openDriveQ1Source,createDriveQ1ProbeRetention} from '../media/drive-source.mjs';
import {createTsPlayer} from '../media/ts-player.mjs';
import {probeTsSeek} from '../qa/v2-07b-ts-q1/ts-seek.mjs';
import {createSeekBootstrap} from '../qa/v2-07b-ts-q1/seek-bootstrap.mjs';
import {createTransmuxSession} from '../qa/v2-07b-ts-q1/transmux-session.mjs';
const require=createRequire(new URL('../qa/v2-07b-ts-q1/transmux-session.test.mjs',import.meta.url));
const {Transmuxer}=require('mux.js/dist/mux-mp4.min.js');
const fixture=new Uint8Array(readFileSync(new URL('../qa/v2-07b-ts-q1/synthetic-bframes-audiolead.ts',import.meta.url)));
const width=524144,head={start:0,end:width-1},tail={start:fixture.length-width,end:fixture.length-1};
const base=(patch={})=>({id:'fixture',headRevisionId:'A',size:String(fixture.length),mimeType:'video/mp2t',
 modifiedTime:'A',version:'1',sha256Checksum:'a'.repeat(64),capabilities:{canDownload:true},trashed:false,...patch});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const turn=()=>new Promise(r=>setImmediate(r));
async function source({metadata=()=>base(),bytes=fixture,current=()=>true,signal,timeout=1000,account='synthetic',generation=1}={}){
 const log=[];let metaCount=0;
 const reader=await openDriveQ1Source({fileId:'fixture',accountKey:account,accountGeneration:generation,isCurrent:current,signal,
 requestTimeoutMs:timeout,readMetadata:async({phase})=>{log.push({phase});return metadata(phase,++metaCount);},
 readRange:async({start,end})=>{log.push({start,end});return new Response(bytes.slice(start,end+1),{status:206,
 headers:{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}});}});
 return{reader,log};
}
const retainedRead=(reader,cache,range)=>reader.read({...range,probeRetention:cache});
async function warm(cache){const s=await source();await retainedRead(s.reader,cache,head);await retainedRead(s.reader,cache,tail);await s.reader.abort();return s;}
function output(bootstrap){const chunks=[];for(let start=bootstrap.readStart;start<fixture.length;start+=262144){
 const raw=fixture.subarray(start,start+262144);for(let off=0;off<raw.length;off+=65536)chunks.push(bootstrap.push(raw.subarray(off,off+65536),{offset:start+off,generation:1}));}
 bootstrap.finish({sourceSize:fixture.length,generation:1});return Buffer.concat(chunks.map(x=>Buffer.from(x)));}
function mux(bytes){const messages=[];let session;session=createTransmuxSession({generation:1,sourceSize:bytes.length,Transmuxer,
 send:m=>{if(m.type==='fragment')messages.push(Buffer.from(m.bytes));}});
 let sequence=0;const ack=()=>{while(session.stats().awaitingFragment)session.receive({type:'ack',generation:1,fragmentSequence:session.stats().awaitingFragment});};
 for(let off=0;off<bytes.length;off+=65536){session.receive({type:'input',generation:1,sequence:++sequence,offset:off,bytes:Uint8Array.from(bytes.subarray(off,off+65536)).buffer});ack();}
 session.receive({type:'eof',generation:1});ack();assert.equal(session.stats().state,'finished');return Buffer.concat(messages);}

test('new readers reuse exact head/tail but keep open/pre/post barriers and isolated copies/transport stats',async()=>{
 const cache=createDriveQ1ProbeRetention(),cold=await warm(cache);assert.equal(cold.reader.stats().rangeRequests,2);
 const s=await source();const a=await retainedRead(s.reader,cache,head);assert.deepEqual(a,fixture.slice(0,width));a.fill(0);
 assert.deepEqual(await retainedRead(s.reader,cache,tail),fixture.slice(tail.start));assert.deepEqual(await retainedRead(s.reader,cache,head),fixture.slice(0,width));
 assert.equal(s.reader.stats().metadataRequests,7);assert.equal(s.reader.stats().readsCompleted,3);assert.equal(s.reader.stats().rangeRequests,0);
 assert.equal(s.reader.stats().receivedBytes,0);assert.equal(s.reader.stats().releasedBytes,0);assert.equal(s.reader.stats().cacheHits,3);
 assert.equal(s.reader.stats().cacheBytes,3*width);assert.equal(s.reader.stats().logicalReturnedBytes,3*width);
 assert.deepEqual(Object.keys(cache).sort(),['clear','stats']);assert.ok(cache.stats().retainedBytes<=2*1024**2);
 await s.reader.abort();cache.clear();assert.equal(cache.stats().retainedBytes,0);
});

test('cached canonical probe plans/bootstrap bytes and actual synchronous mux output equal fresh source at0/5/11.95s',async()=>{
 const cache=createDriveQ1ProbeRetention();await warm(cache);
 for(const seconds of [0,5,11.95]){let cached,fresh;const s=await source();
  const p=await probeTsSeek({sourceSize:fixture.length,positionSeconds:seconds,read:r=>retainedRead(s.reader,cache,r),onInput:i=>{cached=createSeekBootstrap({...i,generation:1});}});
  const q=await probeTsSeek({sourceSize:fixture.length,positionSeconds:seconds,read:async({start,end})=>fixture.slice(start,end+1),onInput:i=>{fresh=createSeekBootstrap({...i,generation:1});}});
  assert.deepEqual(p,q);assert.equal(s.reader.stats().cacheHits,2);assert.equal(s.reader.stats().rangeRequests,0);
  assert.equal(cached.readStart,fresh.readStart);assert.equal(cached.readStart%188,0);
  const a=output(cached),b=output(fresh);assert.deepEqual(a,b);assert.deepEqual(mux(a),mux(b));await s.reader.abort();
 }cache.clear();
});

test('partial/subrange and unsupported continuous reads use fresh bodies; widest slots stay within2MiB',async()=>{
 const cache=createDriveQ1ProbeRetention();await warm(cache);const s=await source();
 await retainedRead(s.reader,cache,{start:188,end:375});await retainedRead(s.reader,cache,{start:0,end:187});await s.reader.read(head);
 assert.equal(s.reader.stats().cacheHits,0);assert.equal(s.reader.stats().rangeRequests,3);assert.equal(cache.stats().retainedBytes,2*width);
 await s.reader.abort();cache.clear();
 const length=Math.floor(4*1024**2/188)*188,bytes=new Uint8Array(length),n=Math.floor(1024**2/188)*188;
 const big=await source({bytes,metadata:()=>base({size:String(length)})});
 await retainedRead(big.reader,cache,{start:0,end:n-1});await retainedRead(big.reader,cache,{start:length-n,end:length-1});
 assert.equal(cache.stats().retainedBytes,2*n);assert.ok(cache.stats().peakRetainedBytes<=2*1024**2);
 await big.reader.abort();cache.clear();assert.equal(cache.stats().retainedBytes,0);
});

test('version and opening checksum/account tuple mismatches miss before body, never silently retag cached bytes',async()=>{
 for(const patch of [{version:'2'},{sha256Checksum:null},{sha256Checksum:'b'.repeat(64)},{}]){
  const cache=createDriveQ1ProbeRetention();await warm(cache);const account=Object.keys(patch).length?'synthetic':'other';
  const s=await source({account,metadata:(phase,n)=>base({...patch,...(patch.sha256Checksum===null&&n>1?{sha256Checksum:'a'.repeat(64)}:{})})});
  await retainedRead(s.reader,cache,head);assert.equal(s.reader.stats().cacheHits,0);assert.equal(s.reader.stats().rangeRequests,1);await s.reader.abort();cache.clear();
 }
 const cache=createDriveQ1ProbeRetention();await warm(cache);const bytes=fixture.slice();bytes.fill(99,0,width);
 const s=await source({bytes,metadata:(phase,n)=>base({version:n<3?'1':'2'})});const result=await retainedRead(s.reader,cache,head);
 assert.equal(result[0],99);assert.equal(s.reader.stats().cacheHits,0);assert.equal(s.reader.stats().rangeRequests,1);
 assert.deepEqual(s.log.filter(x=>x.phase).map(x=>x.phase),['open','preflight','postflight','preflight','postflight']);await s.reader.abort();cache.clear();
});

test('cache postflight drift/permission/checksum/current-owner denials expose no bytes or cache completion',async()=>{
 for(const fault of ['revision','permission','checksum','owner']){const cache=createDriveQ1ProbeRetention();await warm(cache);let active=true;
  const s=await source({current:()=>active,metadata:(phase,n)=>{if(n===3){if(fault==='owner')active=false;
   return base(fault==='revision'?{headRevisionId:'B'}:fault==='permission'?{capabilities:{canDownload:false}}:fault==='checksum'?{sha256Checksum:'b'.repeat(64)}:{});}return base();}});
  await assert.rejects(retainedRead(s.reader,cache,head),/Q1_SOURCE_(CONTENT_DRIFT|PERMISSION|STALE)/);
  assert.equal(s.reader.stats().rangeRequests,0);assert.equal(s.reader.stats().cacheHits,0);assert.equal(s.reader.stats().logicalReturnedBytes,0);
  assert.equal(s.reader.stats().retainedBytes,0);assert.equal(cache.stats().retainedBytes,0);assert.equal((await s.reader.abort()).settled,true);
 }
});

test('cancel/late postflight and timeout/concurrent hit release transient copies and cannot repopulate cleared retention',async()=>{
 for(const fault of ['abort','timeout','concurrent']){const cache=createDriveQ1ProbeRetention();await warm(cache);const gate=deferred(),entered=deferred();
  const s=await source({timeout:fault==='timeout'?15:1000,metadata:async(phase,n)=>{if(n===3){entered.resolve();await gate.promise;}return base();}});
  const pending=retainedRead(s.reader,cache,head);const rejection=assert.rejects(pending,/Q1_SOURCE_(ABORTED|TIMEOUT|CONCURRENT)/);await entered.promise;
  if(fault==='abort'){void s.reader.abort();cache.clear();}else if(fault==='concurrent')await assert.rejects(retainedRead(s.reader,cache,tail),/Q1_SOURCE_CONCURRENT/);
  await rejection;cache.clear();gate.resolve();await turn();await s.reader.abort();
  assert.equal(s.reader.stats().cacheHits,0);assert.equal(s.reader.stats().logicalReturnedBytes,0);assert.equal(s.reader.stats().retainedBytes,0);assert.equal(cache.stats().retainedBytes,0);
 }
});

test('retention clear during postflight forces fresh body rather than releasing stale retained handle',async()=>{
 const cache=createDriveQ1ProbeRetention();await warm(cache);const s=await source({metadata:(phase,n)=>{if(n===3)cache.clear();return base();}});
 assert.deepEqual(await retainedRead(s.reader,cache,head),fixture.slice(0,width));assert.equal(s.reader.stats().cacheHits,0);assert.equal(s.reader.stats().rangeRequests,1);await s.reader.abort();cache.clear();
});

test('a late checksum upgrade never relabels old nullable-checksum bytes; fresh strongly fenced body precedes a hit',async()=>{
 const cache=createDriveQ1ProbeRetention(),s=await source({metadata:(phase,n)=>base({sha256Checksum:n<3?null:'a'.repeat(64)})});
 await retainedRead(s.reader,cache,head);assert.equal(cache.stats().retainedBytes,0);
 await retainedRead(s.reader,cache,head);assert.equal(s.reader.stats().rangeRequests,2);
 await retainedRead(s.reader,cache,head);assert.equal(s.reader.stats().cacheHits,1);assert.equal(s.reader.stats().rangeRequests,2);
 await s.reader.abort();cache.clear();
});

test('a fresh503 on an uncached range clears both raw slots before any replacement reader can adopt them',async()=>{
 const cache=createDriveQ1ProbeRetention();await warm(cache);
 const s=await openDriveQ1Source({fileId:'fixture',accountKey:'synthetic',accountGeneration:1,isCurrent:()=>true,
 readMetadata:async()=>base(),readRange:async()=>new Response(null,{status:503,headers:{'Retry-After':'0'}})});
 await assert.rejects(retainedRead(s,cache,{start:188,end:375}),/Q1_SOURCE_HTTP_UNAVAILABLE/);
 assert.equal(cache.stats().retainedBytes,0);assert.equal((await s.abort()).settled,true);
 const replacement=await source();await retainedRead(replacement.reader,cache,head);
 assert.equal(replacement.reader.stats().cacheHits,0);assert.equal(replacement.reader.stats().rangeRequests,1);
 await replacement.reader.abort();cache.clear();
});

test('clear during fresh body/postflight invalidates outstanding retention but permits a later freshly admitted read',async()=>{
 const cache=createDriveQ1ProbeRetention();let clears=0;
 const s=await source({metadata:(phase,n)=>{if(n===3){cache.clear();clears++;}return base();}});
 assert.deepEqual(await retainedRead(s.reader,cache,head),fixture.slice(0,width));assert.equal(clears,1);assert.equal(cache.stats().retainedBytes,0);
 await retainedRead(s.reader,cache,head);assert.equal(s.reader.stats().rangeRequests,2);assert.equal(cache.stats().retainedBytes,width);
 await retainedRead(s.reader,cache,head);assert.equal(s.reader.stats().cacheHits,1);await s.reader.abort();cache.clear();
});

test('actual TS player serializes rapid seeks after old retirement, reuses only raw probes, and clears on finaldispose',async()=>{
 const previous={MediaSource:globalThis.MediaSource,Worker:globalThis.Worker,create:URL.createObjectURL,revoke:URL.revokeObjectURL},instances=[],readers=[],ranges=[],retentions=[];
 globalThis.MediaSource=class extends EventTarget{constructor(){super();this.readyState='closed';instances.push(this);}};globalThis.Worker=class{};
 URL.createObjectURL=()=> 'blob:local-retention-test';URL.revokeObjectURL=()=>{};
 const video=new EventTarget();Object.assign(video,{playbackRate:1,paused:true,currentTime:0,disableRemotePlayback:false,load(){},getAttribute:()=>null});
 let player;const until=async n=>{const deadline=Date.now()+1500;while(instances.length<n&&Date.now()<deadline)await turn();assert.equal(instances.length,n);};
 try{player=createTsPlayer({video,isCurrent:()=>true,openSource:async({signal})=>{
   const s=await source({signal,current:()=>!signal.aborted});readers.push(s.reader);const read=s.reader.read;
   return{get identity(){return s.reader.identity;},read:r=>{if(r.probeRetention){ranges.push('probe');retentions.push(r.probeRetention);}else ranges.push('continuous');return read(r);},abort:()=>s.reader.abort(),stats:()=>s.reader.stats()};}});
  await until(1);const first=player.stats();const seek=player.seek(5,{autoplay:false});seek.catch(()=>{});await until(2);
  assert.equal(first.disposed,true);assert.equal(first.sourceCleanup.settled,true);assert.equal(readers[0].stats().rangeRequests,2);
  assert.equal(readers[1].stats().rangeRequests,0);assert.equal(readers[1].stats().cacheHits,2);assert.equal(readers[1].stats().metadataRequests,5);
  const skipped=player.seek(3,{autoplay:false});skipped.catch(()=>{});const last=player.seek(11,{autoplay:false});last.catch(()=>{});await until(3);
  assert.equal(player.stats().generation,4);assert.ok(readers.every(r=>r.stats().rangeRequests<=2));
  assert.equal((await player.dispose()).settled,true);await last.catch(()=>{});assert.equal(player.stats().probeRetention.retainedBytes,0);
  assert.ok(retentions.every(c=>c.stats().retainedBytes===0));
  assert.ok(readers.every(r=>r.stats().cleanupSettled));assert.ok(!ranges.includes('continuous'));
 }finally{await player?.dispose();globalThis.MediaSource=previous.MediaSource;globalThis.Worker=previous.Worker;URL.createObjectURL=previous.create;URL.revokeObjectURL=previous.revoke;}
});
