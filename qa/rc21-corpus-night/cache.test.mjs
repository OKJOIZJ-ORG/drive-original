import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createMetadataReadCache} from './metadata-read-cache.mjs';
import {readSparseMoov} from './sparse-moov.mjs';
import {readSparseMoov as baseline} from '../v2-07a-iso-tracks-rc11/sparse-moov.mjs';
import {parseMoov} from '../v2-07a-iso-tracks-rc11/parser.mjs';
import {moovFixture,box} from '../v2-07a-iso-tracks-rc11/fixtures.mjs';
import {build} from './build.mjs';
const root=b=>({offset:'0',size:String(b.length),endExclusive:String(b.length),headerBytes:8});
const run=(b,extra={})=>readSparseMoov({box:root(b),fileSize:String(b.length),read:({start,end})=>b.subarray(Number(start),Number(end)+1),...extra});

test('fake serial latency: fewer roundtrips, identical derived metadata and byte content',async()=>{
  const b=moovFixture({audio:true});let oldMs=0,newMs=0,oldCalls=0,newCalls=0;
  const reader=t=>async({start,end})=>{await Promise.resolve();if(t==='old'){oldMs+=1100;oldCalls++;}else{newMs+=1100;newCalls++;}return b.subarray(Number(start),Number(end)+1);};
  const a=await baseline({box:root(b),fileSize:String(b.length),read:reader('old')}),z=await run(b,{read:reader('new')});
  assert.equal(a.status,'complete');assert.equal(z.status,'complete');assert.deepEqual(z.bytes,a.bytes);assert.deepEqual(parseMoov(z.bytes),parseMoov(a.bytes));
  assert.ok(newCalls<=oldCalls-8);assert.equal(newMs,newCalls*1100);assert.ok(newMs<oldMs);assert.equal(z.metrics.requests,newCalls);assert.ok(z.metrics.cacheHits>=8);
  console.log(JSON.stringify({fixture:'two-track-late-moov',oldCalls,newCalls,oldFakeMs:oldMs,newFakeMs:newMs,oldBytes:a.metrics.receivedBytes,newBytes:z.metrics.receivedBytes}));
});

test('confirmed parent clipping and copies prevent media extension or caller cache corruption',async()=>{
  const b=Uint8Array.from({length:128},(_,i)=>i),before=b.slice(),calls=[];
  const c=createMetadataReadCache({read:async({start,end})=>{calls.push([start,end]);return b.subarray(Number(start),Number(end)+1);},start:16,endExclusive:96});
  const first=await c.read({start:32,length:4,parentStart:32,parentEndExclusive:40,prefetchEndExclusive:80});first.fill(255);b.fill(77,32,40);
  assert.deepEqual(await c.read({start:36,length:4,parentStart:32,parentEndExclusive:40}),before.slice(36,40));
  assert.deepEqual(calls,[[32n,39n]]);assert.equal(c.metrics().cacheHits,1);
  await assert.rejects(c.read({start:31,length:4,parentStart:32,parentEndExclusive:40}),/SPARSE_INVALID_BOUNDS/);
  await assert.rejects(c.read({start:95,length:2}),/SPARSE_INVALID_BOUNDS/);c.release();assert.equal(c.metrics().released,true);
  await assert.rejects(c.read({start:32,length:1}),/SPARSE_CACHE_RELEASED/);assert.equal(first[0],255);
});

test('physical request, byte, body-length and 1MiB request bounds fail before surplus I/O',async()=>{
  let calls=0;const options={start:0,endExclusive:2*1024*1024,read:async({start,end})=>{calls++;return new Uint8Array(Number(end-start+1n));}};
  const c=createMetadataReadCache({...options,maxBytes:8,maxRequests:1});await c.read({start:0,length:4,prefetchEndExclusive:8});
  await assert.rejects(c.read({start:8,length:1}),/SPARSE_REQUEST_LIMIT/);assert.equal(calls,1);c.release();
  const d=createMetadataReadCache({...options,maxBytes:8});await assert.rejects(d.read({start:0,length:4,prefetchEndExclusive:9}),/SPARSE_BYTE_LIMIT/);assert.equal(calls,1);d.release();
  const e=createMetadataReadCache(options);await assert.rejects(e.read({start:0,length:1,prefetchEndExclusive:1048577}),/SPARSE_BYTE_LIMIT/);assert.equal(calls,1);e.release();
  const f=createMetadataReadCache({...options,read:async()=>new Uint8Array(3)});await assert.rejects(f.read({start:0,length:4}),/SPARSE_READ_LENGTH/);f.release();
});

test('abort and owner checks apply to cached reads and late pending I/O',async()=>{
  const controller=new AbortController();let current=true,calls=0;
  const c=createMetadataReadCache({start:0,endExclusive:100,signal:controller.signal,checkCurrent:()=>{if(!current)throw Error('OWNER_CHANGED');},read:async()=>{calls++;return new Uint8Array(8);}});
  await c.read({start:0,length:4,prefetchEndExclusive:8});current=false;
  await assert.rejects(c.read({start:4,length:4}),/OWNER_CHANGED/);current=true;controller.abort();await assert.rejects(c.read({start:4,length:4}),/SPARSE_ABORTED/);assert.equal(calls,1);c.release();
  const lateAbort=new AbortController();let resolve,start;const ready=new Promise(r=>start=r);
  const d=createMetadataReadCache({start:0,endExclusive:100,signal:lateAbort.signal,read:()=>{start();return new Promise(r=>resolve=r);}}),pending=d.read({start:0,length:8});
  await ready;lateAbort.abort();await assert.rejects(pending,/SPARSE_ABORTED/);d.release();const late=new Uint8Array(8).fill(123);resolve(late);await Promise.resolve();assert.equal(late[0],123);assert.equal(d.metrics().receivedBytes,0);
});

test('default64 request and2MiB caps cannot be raised; a changed owner rejects pending bytes before caching',async()=>{
  const base={start:0,endExclusive:3*1024*1024,read:async({start,end})=>new Uint8Array(Number(end-start+1n))};
  assert.throws(()=>createMetadataReadCache({...base,maxRequests:65}),/SPARSE_INVALID_ARGUMENT/);assert.throws(()=>createMetadataReadCache({...base,maxBytes:2097153}),/SPARSE_INVALID_ARGUMENT/);
  const c=createMetadataReadCache(base);for(let i=0;i<64;i++)await c.read({start:i,length:1});await assert.rejects(c.read({start:64,length:1}),/SPARSE_REQUEST_LIMIT/);assert.equal(c.metrics().requests,64);c.release();
  let resolve,current=true,started;const ready=new Promise(r=>started=r),d=createMetadataReadCache({...base,checkCurrent:()=>{if(!current)throw Error('OWNER_CHANGED');},read:()=>{started();return new Promise(r=>resolve=r);}}),pending=d.read({start:0,length:8});
  await ready;current=false;const upstream=new Uint8Array(8).fill(231);resolve(upstream);await assert.rejects(pending,/OWNER_CHANGED/);assert.equal(d.metrics().receivedBytes,0);assert.equal(upstream[0],231);d.release();
});

test('50MiB table and unknown payloads remain unread; coalesced spans cannot cross into them',async()=>{
  const original=Buffer.from(moovFixture({audio:true})),gap=50*1024*1024,stbl=original.indexOf('stbl')-4,insert=stbl+original.readUInt32BE(stbl),head=Buffer.from(original.subarray(0,insert)),tail=original.subarray(insert);
  for(const type of ['moov','trak','mdia','minf','stbl']){const p=original.indexOf(type)-4;head.writeUInt32BE(head.readUInt32BE(p)+gap,p);}
  const sh=Buffer.alloc(8);sh.writeUInt32BE(gap);sh.write('stsz',4);const total=original.length+gap;
  const read=({start,end})=>{const a=Number(start),z=Number(end)+1;if(z<=insert)return head.subarray(a,z);if(a>=insert&&z<=insert+8)return sh.subarray(a-insert,z-insert);if(a>=insert+gap)return tail.subarray(a-insert-gap,z-insert-gap);assert.fail('sample table payload read');};
  const s=await readSparseMoov({box:{offset:'0',size:String(total),endExclusive:String(total),headerBytes:8},fileSize:String(total),read});assert.equal(s.status,'complete');assert.equal(s.metrics.sampleTableBoxesSkipped,1);assert.equal(s.originalSampleTablesRead,false);assert.deepEqual(parseMoov(s.bytes).tracks,parseMoov(original).tracks);
  const b=box('moov',original.subarray(8),box('udta',Buffer.alloc(10000))),r=await run(b,{read:({start,end})=>{assert.ok(Number(end)<original.length+8);return b.subarray(Number(start),Number(end)+1);}});assert.equal(r.status,'complete');assert.equal(r.metrics.unknownPayloadsSkipped,1);
});

test('fixed version1 suffix stays parent clipped and malformed child remains incomplete',async()=>{
  const original=moovFixture(),p=original.indexOf('tkhd')-4,body=Buffer.alloc(96);body[0]=1;const oldSize=original.readUInt32BE(p),b=Buffer.concat([original.subarray(0,p),box('tkhd',body),original.subarray(p+oldSize)]);b.writeUInt32BE(b.length,0);b.writeUInt32BE(b.readUInt32BE(8)+12,8);
  const s=await run(b);assert.equal(s.status,'complete');assert.ok(s.metrics.requests<64);
  assert.equal((await run(box('moov',Buffer.alloc(7)))).code,'SPARSE_INVALID_BOUNDS');
  for(const limits of [{requests:1},{bytes:8},{configBytes:1}])assert.match((await run(original,{limits})).code,/LIMIT$/);
});

test('actual seed sparse metadata agrees with full parser without sample-table reads',async()=>{
  const b=await readFile(new URL('../faststart-h264-aac.mp4',import.meta.url));
  const {scanIsoBmffTopLevel}=await import('../v2-07a-isobmff-index/isobmff-index.mjs'),read=({start,end})=>b.subarray(Number(start),Number(end)+1),scan=await scanIsoBmffTopLevel({size:String(b.length),read}),moov=scan.observations.moov[0];
  const s=await readSparseMoov({box:moov,fileSize:String(b.length),read});assert.equal(s.status,'complete');assert.deepEqual(parseMoov(s.bytes).tracks,parseMoov(b.subarray(Number(moov.offset),Number(moov.endExclusive))).tracks);assert.ok(s.metrics.sampleTableBoxesSkipped>=5);
});

test('expression deterministic, lexical, current21 pins only; missing inputs reject without mutation',async()=>{
  const a=await build(),b=await build();assert.equal(a.expression,b.expression);const sandbox={},fn=vm.runInNewContext(a.expression,sandbox);assert.deepEqual(Object.keys(sandbox),[]);assert.equal(fn(null,null).poll().summary.failure,'FACADE_PREFLIGHT_REJECTED');
  assert.equal(a.expression.includes('1.22.0-rc.16'),false);assert.equal(a.provenance.inheritedSHA256['../rc21-actual-corpus/factory.expression.js'],'ed770ee121253885365914c9013c2e279504580f0be49ab376ea7f5d7b165ad1');
});
