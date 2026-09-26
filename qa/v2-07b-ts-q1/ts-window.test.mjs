import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scanTsWindow } from './ts-window.mjs';
import { analyzeGopBoundaries, readAnnexBNals } from './gop-boundaries.mjs';
import { variant, crossAdts, shiftTimestamp } from './synthetic-variants.mjs';

const fixture = readFileSync(new URL('./synthetic-bframes-audiolead.ts',import.meta.url));
assert.equal(createHash('sha256').update(fixture).digest('hex'),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const baseline = analyzeGopBoundaries(fixture);
const pids = { videoPid:baseline.videoPid,audioPid:baseline.audioPid };
const scan = (bytes, options = {}) => scanTsWindow(bytes,{...pids,...options});
const full = scan(fixture,{atEof:true});
const pidOf = bytes => ((bytes[1]&31)<<8)|bytes[2];

// Public structural adversaries only; these minimal PES payloads make no
// decoder-validity claim. Packet adaptation absorbs all unused payload bytes.
function pes(payload,{audio=false,fixed=false}={}) {
  const bytes = Buffer.from([0,0,1,audio?0xc0:0xe0,0,0,0x80,0x80,5,0x21,0,1,0,1,...payload]);
  if (fixed || audio) bytes.writeUInt16BE(bytes.length-6,4);
  return bytes;
}
const tinyVideo = () => pes([0,0,0,1,9,0xf0,0,0,1,0x41,0x80]);
const tinyAudio = () => pes([255,241,0x4c,0x80,1,0x3f,0xfc,1,2],{audio:true});
function packets(bytes,{pid=pids.videoPid,cc=0,firstBytes=184}={}) {
  const result=[];
  for(let offset=0;offset<bytes.length;){
    const count=Math.min(offset===0?firstBytes:184,bytes.length-offset);
    const packet=Buffer.alloc(188,255);
    packet[0]=0x47;packet[1]=(pid>>8)|(offset===0?64:0);packet[2]=pid&255;
    packet[3]=0x10|(cc++%16);let payload=4;
    if(count<184){packet[3]|=0x20;packet[4]=183-count;if(packet[4])packet[5]=0;payload=188-count;}
    bytes.copy(packet,payload,offset,offset+count);offset+=count;result.push(packet);
  }
  return Buffer.concat(result);
}

test('public complete fixture exposes exact packet/timing anchors, six copied IDRs and 564 AAC frames',()=>{
  assert.equal(full.video.length,360);
  assert.equal(full.video.filter(row=>row.idr).length,6);
  assert.deepEqual(full.video.map(({sps,pps,...row})=>row),baseline.frames);
  assert.equal(full.audio.reduce((count,row)=>count+row.frames,0),564);
  assert.ok(full.audio.every(row=>row.pts===row.dts&&row.sampleRate===48000&&row.channels===2));
  assert.deepEqual(full.leadingPartial,{video:false,audio:false});
  assert.deepEqual(full.trailingPartial,{video:false,audio:false});
  assert.ok(full.video.filter(row=>row.idr).every(row=>row.sps?.length&&row.pps?.length));
  assert.ok(full.video.filter(row=>!row.idr).every(row=>row.sps===null&&row.pps===null));
});

test('zero-length trailing video is omitted without EOF, never inferred from a packet-aligned tail',()=>{
  const partial=scan(fixture);
  assert.equal(partial.video.length,359);
  assert.equal(partial.trailingPartial.video,true);
  assert.equal(partial.audio.length,full.audio.length);
  assert.equal(partial.trailingPartial.audio,false);
});

test('leading video continuation is ignored and non-IDR anchors need no inherited SPS/PPS',()=>{
  const start=full.video[0].offset+188,end=full.video[4].offset+188;
  const window=scan(fixture.subarray(start,end),{offset:start});
  assert.equal(window.leadingPartial.video,true);assert.equal(window.trailingPartial.video,true);
  assert.deepEqual(window.video.map(row=>row.offset),full.video.slice(1,4).map(row=>row.offset));
  assert.ok(window.video.every(row=>!row.idr&&row.sps===null&&row.pps===null));
  const one=scan(fixture.subarray(start,start+188),{offset:start});
  assert.equal(one.video.length,0);assert.equal(one.leadingPartial.video,true);assert.equal(one.trailingPartial.video,true);
});

test('complete fixed audio PES is admitted without following PUSI, partial audio is omitted or rejected at exact EOF',()=>{
  const first=full.audio[0];
  const complete=scan(fixture.subarray(first.offset,first.end),{offset:first.offset});
  assert.deepEqual(complete.audio,[first]);assert.equal(complete.trailingPartial.audio,false);
  const cut=first.end-188;
  const partial=scan(fixture.subarray(first.offset,cut),{offset:first.offset});
  assert.equal(partial.audio.length,0);assert.equal(partial.trailingPartial.audio,true);
  assert.throws(()=>scan(fixture.subarray(first.offset,cut),{offset:first.offset,atEof:true}),/^Error: WINDOW_EOF_TRUNCATED$/);
  const leading=scan(fixture.subarray(first.offset+188,first.end),{offset:first.offset+188});
  assert.equal(leading.audio.length,0);assert.equal(leading.leadingPartial.audio,true);
});

test('fragmented six-byte PES headers are bounded and cannot be mistaken for zero-length video',()=>{
  const split=variant(records=>{for(const record of records)record.firstPacketBytes=3;});
  const result=scan(split.bytes,{atEof:true});
  assert.equal(result.video.length,360);assert.equal(result.audio.reduce((n,row)=>n+row.frames,0),564);
  const headerOnly=packets(tinyVideo(),{firstBytes:3}).subarray(0,188);
  assert.equal(scan(headerOnly).trailingPartial.video,true);
  assert.throws(()=>scan(headerOnly,{atEof:true}),/^Error: WINDOW_EOF_TRUNCATED$/);
});

test('source offsets beyond 32 bits stay exact and safe; input views and returned copies do not alias',()=>{
  const offset=Math.ceil(2**40/188)*188;
  const shifted=scan(fixture,{offset,atEof:true});
  assert.equal(shifted.video.at(-1).offset,offset+full.video.at(-1).offset);
  assert.equal(shifted.audio.at(-1).end,offset+full.audio.at(-1).end);
  const padded=Buffer.concat([Buffer.alloc(7),fixture,Buffer.alloc(9)]);
  const view=padded.subarray(7,7+fixture.length),result=scan(view,{atEof:true});
  const original=Buffer.from(fixture);
  result.video[0].sps.fill(0);result.video[0].pps.fill(0);
  assert.ok(view.equals(original));assert.notEqual(result.video[60].sps[0],0);
  const saved=Uint8Array.from(result.video[60].sps);view.fill(0);
  assert.deepEqual(result.video[60].sps,saved);
});

test('33-bit timestamps remain raw positive anchors; the scanner does not invent rollover epochs',()=>{
  const high=tinyVideo();shiftTimestamp(high,9,2**33-3000);
  const low=tinyVideo();shiftTimestamp(low,9,3000);
  const result=scan(Buffer.concat([packets(high),packets(low,{cc:1})]),{atEof:true});
  assert.deepEqual(result.video.map(row=>row.pts),[2**33-3000,3000]);
  assert.deepEqual(result.video.map(row=>row.dts),[2**33-3000,3000]);
});

test('input, safe offset, explicit PID and scratch bounds fail with fixed codes',()=>{
  for(const bytes of [new Uint8Array(0),new Uint8Array(187),new Uint8Array(1024*1024+188),new ArrayBuffer(188)])
    assert.throws(()=>scan(bytes),/^Error: WINDOW_INPUT$/);
  for(const offset of [-188,1,2**53,Math.floor(Number.MAX_SAFE_INTEGER/188)*188])
    assert.throws(()=>scan(fixture,{offset}),/^Error: WINDOW_OFFSET$/);
  for(const options of [{videoPid:0},{audioPid:8191},{videoPid:pids.audioPid},{videoPid:1.5}])
    assert.throws(()=>scan(fixture,options),/^Error: WINDOW_PIDS$/);
  for(const options of [{maxPesBytes:13},{maxPesBytes:65537},{atEof:1}])
    assert.throws(()=>scan(fixture,options),/^Error: WINDOW_OPTIONS$/);
  assert.throws(()=>scan(fixture,{maxPesBytes:32}),/^Error: WINDOW_PES_LIMIT$/);
});

test('transport, scrambling, malformed adaptation and discontinuity are rejected even off selected PIDs',()=>{
  for(const mutate of [packet=>packet[0]=0,packet=>packet[1]|=128,packet=>packet[3]|=128]){
    const bytes=Buffer.from(fixture);mutate(bytes.subarray(0,188));
    assert.throws(()=>scan(bytes),/^Error: WINDOW_TRANSPORT$/);
  }
  for(const mutate of [packet=>packet[3]&=0xcf,packet=>{packet[3]|=0x30;packet[4]=183;},
    packet=>{packet[3]=0x30;packet[4]=1;packet[5]=16;}]){
    const packet=Buffer.from(fixture.subarray(0,188));mutate(packet);
    assert.throws(()=>scan(packet),/^Error: WINDOW_ADAPTATION$/);
  }
  const packet=Buffer.from(fixture.subarray(0,188));packet[3]=0x30;packet[4]=1;packet[5]=128;
  assert.throws(()=>scan(packet),/^Error: WINDOW_DISCONTINUITY$/);
});

test('selected continuity includes leading partial and adaptation-only packets; unrelated continuity is not inferred',()=>{
  const start=full.video[0].offset;
  const broken=Buffer.from(fixture);broken[start+188+3]=(broken[start+188+3]&240)|((broken[start+3]+4)&15);
  assert.throws(()=>scan(broken),/^Error: WINDOW_CONTINUITY$/);
  const packet=packets(tinyVideo());
  const adaptation=Buffer.alloc(188,255);adaptation[0]=0x47;adaptation[1]=pids.videoPid>>8;adaptation[2]=pids.videoPid&255;
  adaptation[3]=0x20;adaptation[4]=183;adaptation[5]=0;
  const next=packets(tinyVideo(),{cc:1});
  assert.equal(scan(Buffer.concat([packet,adaptation,next]),{atEof:true}).video.length,2);
  adaptation[3]=0x21;
  assert.throws(()=>scan(Buffer.concat([packet,adaptation,next])),/^Error: WINDOW_CONTINUITY$/);
  const unrelated=Buffer.from(fixture);const psi=[];
  for(let i=0;i<unrelated.length;i+=188)if(pidOf(unrelated.subarray(i,i+188))===0)psi.push(i);
  unrelated[psi[1]+3]=(unrelated[psi[1]+3]&240)|(unrelated[psi[0]+3]&15);
  assert.equal(scan(unrelated,{atEof:true}).video.length,360);
});

test('timestamp markers and fixed PES lengths cannot create timing anchors',()=>{
  for(const field of [9,11,13,14,16,18]){
    const changed=variant(records=>{const first=records.find(row=>row.videoIndex===0);first.data[field]&=254;});
    assert.throws(()=>scan(changed.bytes,{atEof:true}),/^Error: WINDOW_PES$/);
  }
  const changed=variant(records=>{const first=records.find(row=>row.videoIndex===0);first.data.writeUInt16BE(3,4);});
  assert.throws(()=>scan(changed.bytes,{atEof:true}),/^Error: WINDOW_PES_LENGTH$/);
  const tiny=tinyVideo();tiny.writeUInt16BE(tiny.length-6,4);
  assert.equal(scan(packets(tiny)).video.length,1);
  const extra=packets(tiny);extra[1]&=~64;
  assert.throws(()=>scan(Buffer.concat([packets(tiny),extra.map((v,i)=>i===3?(v&240)|1:v)])),/^Error: WINDOW_PES_CONTINUATION$/);
});

test('one AUD, supported NAL framing, uniform VCL and complete IDR parameter syntax are mandatory',()=>{
  const cases=[
    [record=>{record.data=Buffer.concat([record.data,Buffer.from([0,0,1,9,0xf0])]);},'WINDOW_VIDEO_AU'],
    [record=>{record.data=Buffer.concat([record.data,Buffer.from([0,0,1,0x41,0x80])]);},'WINDOW_VIDEO_PICTURE'],
    [record=>{const units=readAnnexBNals(record.data.subarray(9+record.data[8]));units[0][0]|=128;},'WINDOW_H264_FRAMING'],
    [record=>{const units=readAnnexBNals(record.data.subarray(9+record.data[8]));const sps=units.find(row=>(row[0]&31)===7);sps[sps.length-1]=0;},'WINDOW_SPS'],
    [record=>{const units=readAnnexBNals(record.data.subarray(9+record.data[8]));units.find(row=>(row[0]&31)===8)[0]=6;},'WINDOW_VIDEO_PARAMETERS'],
  ];
  for(const [mutate,code] of cases){
    const changed=variant(records=>mutate(records.find(row=>row.videoIndex===0)));
    assert.throws(()=>scan(changed.bytes,{atEof:true}),new RegExp(`^Error: ${code}$`));
  }
});

test('AAC complete-frame, LC, configuration and PTS=DTS gates; channel configuration 7 means eight channels',()=>{
  assert.throws(()=>scan(crossAdts().bytes,{atEof:true}),/^Error: WINDOW_ADTS_FRAME$/);
  for(const mutate of [bytes=>bytes[14]=0,bytes=>bytes[16]&=0x3f,bytes=>bytes[16]|=0x3c,bytes=>bytes[20]|=1]){
    const bytes=tinyAudio();mutate(bytes);
    assert.throws(()=>scan(packets(bytes,{pid:pids.audioPid})),/^Error: WINDOW_(ADTS_HEADER|AAC_CONFIG|ADTS_FRAME)$/);
  }
  const eight=tinyAudio();eight[16]|=1;eight[17]|=0xc0;
  assert.equal(scan(packets(eight,{pid:pids.audioPid})).audio[0].channels,8);
  const original=tinyAudio();const both=Buffer.concat([original.subarray(0,14),Buffer.from([0x11,0,1,0,3]),original.subarray(14)]);
  both[7]=0xc0;both[8]=10;both[9]=0x31;both.writeUInt16BE(both.length-6,4);
  assert.throws(()=>scan(packets(both,{pid:pids.audioPid})),/^Error: WINDOW_AUDIO_TIMING$/);
});

test('record cap bounds tiny PES outputs without accumulating a whole file',()=>{
  const pieces=[];
  for(let i=0;i<4097;i++)pieces.push(packets(tinyVideo(),{cc:i%16}));
  const bytes=Buffer.concat(pieces);assert.ok(bytes.length<1024*1024);
  assert.throws(()=>scan(bytes,{atEof:true}),/^Error: WINDOW_RECORD_LIMIT$/);
});
