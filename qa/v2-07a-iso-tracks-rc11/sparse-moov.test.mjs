import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readSparseMoov} from './sparse-moov.mjs';
import {parseMoov} from './parser.mjs';
import {moovFixture,box,cat} from './fixtures.mjs';
import {scanIsoBmffTopLevel} from '../v2-07a-isobmff-index/isobmff-index.mjs';
const root=b=>({offset:'0',size:String(b.length),endExclusive:String(b.length),headerBytes:8});
const run=(b,extra={})=>readSparseMoov({box:root(b),fileSize:String(b.length),read:({start,end})=>b.subarray(Number(start),Number(end)+1),...extra});
test('sparse metadata agrees with full parser on supported two-track fixture',async()=>{
  const b=moovFixture({audio:true}),s=await run(b);assert.equal(s.status,'complete');assert.deepEqual(parseMoov(s.bytes).tracks,parseMoov(b).tracks);assert.equal(s.originalSampleTablesRead,false);
});
test('50MiB virtual sample table is skipped, not allocated or fetched',async()=>{
  const original=Buffer.from(moovFixture({audio:true})),gap=50*1024*1024;
  const stbl=original.indexOf('stbl')-4,insert=stbl+original.readUInt32BE(stbl),head=Buffer.from(original.subarray(0,insert)),tail=original.subarray(insert);
  for(const type of ['moov','trak','mdia','minf','stbl']){const p=original.indexOf(type)-4;head.writeUInt32BE(head.readUInt32BE(p)+gap,p);}
  const sh=Buffer.alloc(8);sh.writeUInt32BE(gap);sh.write('stsz',4);const total=original.length+gap,requests=[];
  const read=({start,end})=>{const a=Number(start),z=Number(end)+1;requests.push([a,z]);assert.ok(z-a<=256*1024);
    if(z<=insert)return head.subarray(a,z);if(a>=insert&&z<=insert+8)return sh.subarray(a-insert,z-insert);
    if(a>=insert+gap)return tail.subarray(a-insert-gap,z-insert-gap);assert.fail('sample table payload must remain unread');};
  const s=await readSparseMoov({box:{offset:'0',size:String(total),endExclusive:String(total),headerBytes:8},fileSize:String(total),read});
  assert.equal(s.status,'complete');assert.equal(s.metrics.sampleTableBoxesSkipped,1);assert.ok(s.metrics.receivedBytes<2000);assert.ok(s.metrics.requests<64);assert.deepEqual(parseMoov(s.bytes).tracks,parseMoov(original).tracks);
});
test('existing public seed sparse track metadata equals full moov parser',async()=>{
  const b=await readFile(new URL('../faststart-h264-aac.mp4',import.meta.url)),read=({start,end})=>b.subarray(Number(start),Number(end)+1),scan=await scanIsoBmffTopLevel({size:String(b.length),read}),box=scan.observations.moov[0];
  const s=await readSparseMoov({box,fileSize:String(b.length),read});assert.equal(s.status,'complete');
  const full=parseMoov(b.subarray(Number(box.offset),Number(box.endExclusive))),sparse=parseMoov(s.bytes);
  assert.deepEqual(sparse.tracks,full.tracks);assert.ok(s.metrics.sampleTableBoxesSkipped>=5);assert.ok(s.metrics.receivedBytes<Number(box.size));
});
test('byte/request/config limits fail incomplete before over-budget read',async()=>{
  const b=moovFixture();for(const limits of [{bytes:8},{requests:1},{configBytes:1}]){const r=await run(b,{limits});assert.equal(r.status,'incomplete');assert.match(r.code,/LIMIT$/);}
});
test('extended child overflow and truncated header fail bounded',async()=>{
  const extended=Buffer.alloc(16);extended.writeUInt32BE(1);extended.write('trak',4);extended.writeBigUInt64BE((1n<<64n)-1n,8);
  assert.equal((await run(box('moov',extended))).code,'SPARSE_INVALID_BOX');assert.equal((await run(box('moov',Buffer.alloc(7)))).code,'SPARSE_INVALID_BOUNDS');
  const invalid=await readSparseMoov({box:{offset:'9007199254740992',size:'8',endExclusive:'9007199254741000',headerBytes:8},fileSize:'9007199254741000',read:()=>assert.fail('must not dispatch')});assert.equal(invalid.code,'SPARSE_INVALID_BOUNDS');
});
test('abort ends pending sparse read; caller still owns I/O cleanup',async()=>{
  const b=moovFixture(),controller=new AbortController();let started;const start=new Promise(r=>{started=r;});
  const pending=run(b,{signal:controller.signal,read:()=>{started();return new Promise(()=>{});}});await start;controller.abort();assert.equal((await pending).code,'SPARSE_ABORTED');
});
test('unsupported sample layout is incomplete before payload read',async()=>{const b=Buffer.from(moovFixture());b.write('zzzz',b.indexOf('avc1'));assert.equal((await run(b)).code,'SPARSE_UNSUPPORTED_ENTRY');});
test('unknown and sample-table payloads are skipped but bounds checked',async()=>{
  const original=moovFixture(),largeUnknown=box('udta',Buffer.alloc(10000)),b=box('moov',original.subarray(8),largeUnknown);
  const limit=original.length+8,reads=[];const s=await run(b,{read:({start,end})=>{reads.push([Number(start),Number(end)]);assert.ok(Number(end)<limit);return b.subarray(Number(start),Number(end)+1);}});
  assert.equal(s.status,'complete');assert.equal(s.metrics.unknownPayloadsSkipped,1);assert.deepEqual(parseMoov(s.bytes).tracks,parseMoov(original).tracks);
});
