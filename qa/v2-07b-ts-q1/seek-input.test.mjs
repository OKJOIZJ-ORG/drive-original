import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareTsSeekInput } from './seek-input.mjs';
import { probeTsSeek } from './ts-seek.mjs';
import { analyzeGopBoundaries,readPes } from './gop-boundaries.mjs';
import { scanTsWindow } from './ts-window.mjs';
import { crc32Mpeg2 } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const fixture=readFileSync(new URL('./synthetic-bframes-audiolead.ts',import.meta.url));
assert.equal(createHash('sha256').update(fixture).digest('hex'),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const baseline=analyzeGopBoundaries(fixture),head=fixture.subarray(0,Math.floor(65536/188)*188);
const plans=await Promise.all([.1,.5,.9].map(fraction=>probeTsSeek({read:async({start,end})=>fixture.subarray(start,end+1),sourceSize:fixture.length,fraction})));
const pidOf=packet=>((packet[1]&31)<<8)|packet[2];
const payloadOf=packet=>packet.subarray(4+(packet[3]&32?packet[4]+1:0));
function input(plan=plans[1]){return {headBytes:head,bytes:fixture.subarray(plan.local.windowStart,plan.local.windowEndExclusive),offset:plan.local.windowStart,plan};}
const prepare=(plan=plans[1])=>prepareTsSeekInput(input(plan));
function pesRecords(bytes,base=0){
  const result=[],active=new Map();
  for(let i=0;i<bytes.length;i+=188){
    const packet=bytes.subarray(i,i+188),pid=pidOf(packet);
    if(![baseline.videoPid,baseline.audioPid].includes(pid)||!(packet[3]&16))continue;
    if(packet[1]&64){const row={offset:base+i,end:base+i+188,pid,parts:[]};result.push(row);active.set(pid,row);}
    if(!active.has(pid))continue;
    const row=active.get(pid);row.parts.push(payloadOf(packet));row.end=base+i+188;
  }
  return result.map(row=>({...row,bytes:Buffer.concat(row.parts)}));
}
const originalRecords=new Map(pesRecords(fixture).map(row=>[row.offset,row]));

test('head and interior candidates contain a strict one-GOP slice with complete AAC preroll and coverage',()=>{
  for(const plan of plans.slice(0,2)){
    const result=prepare(plan),strict=analyzeGopBoundaries(result.bytes);
    assert.equal(result.video.frames,60);assert.equal(strict.videoFrames,60);
    assert.equal(strict.aacFrames,result.audio.frames);assert.equal(result.video.startPts,plan.rap.pts);
    assert.equal(result.video.endPts-result.video.startPts,180000);assert.equal(result.video.step,3000);
    assert.ok(result.audio.prerollFrames>=2);assert.ok(result.audio.endPts>=result.video.endPts);
    assert.ok(result.audio.startPts<result.video.startPts);assert.equal(result.configuration.videoTrackId,baseline.videoPid);
    assert.equal(result.bytes.length%188,0);assert.ok(result.bytes.length<=Math.floor(1024*1024/188)*188);
    assert.equal(result.source.rapOffset,plan.rap.offset);assert.equal(result.source.targetTicks,plan.targetTicks);
    assert.equal(result.source.ranges.length,result.source.selectedPesCount);
  }
});

test('every selected PES header/payload/timestamp is byte-identical in original source order',()=>{
  const result=prepare(),repacked=pesRecords(result.bytes);
  assert.equal(repacked.length,result.source.ranges.length);
  for(let i=0;i<repacked.length;i++){
    const range=result.source.ranges[i],original=originalRecords.get(range.offset);
    assert.ok(original);assert.equal(range.end,original.end);assert.equal(range.bytes,original.bytes.length);
    assert.equal(repacked[i].pid,original.pid);assert.ok(repacked[i].bytes.equals(original.bytes));
    if(i)assert.ok(range.offset>result.source.ranges[i-1].offset);
    const parsed=readPes(repacked[i],range.kind),source=readPes(original,range.kind);
    assert.equal(parsed.pts,source.pts);assert.equal(parsed.dts,source.dts);
  }
});

test('PAT/PMT payloads are copied, counters are fresh and no PCR is manufactured or media clock shifted',()=>{
  const result=prepare(),counters=new Map(),sourcePsi=[];
  for(let i=0;i<head.length;i+=188){const packet=head.subarray(i,i+188);
    if([0,plans[1].topology.pmtPid].includes(pidOf(packet))&&(packet[3]&16))sourcePsi.push(packet);
    if(sourcePsi.length===result.source.bootstrapPackets)break;
  }
  for(let i=0;i<result.bytes.length;i+=188){
    const packet=result.bytes.subarray(i,i+188),pid=pidOf(packet),cc=packet[3]&15;
    assert.equal(cc,counters.get(pid)||0);counters.set(pid,(cc+1)%16);
    if(packet[3]&32)if(packet[4])assert.equal(packet[5],0);
    if(i/188<result.source.bootstrapPackets)assert.deepEqual(payloadOf(packet),Uint8Array.from(payloadOf(sourcePsi[i/188])));
  }
  const parsed=scanTsWindow(result.bytes,{...plans[1].topology,atEof:true});
  assert.equal(parsed.video[0].pts,plans[1].rap.pts);assert.equal(parsed.video[0].dts,plans[1].rap.dts);
  assert.equal(parsed.audio[0].pts,result.audio.startPts);
});

test('mutated RAP, target bracket, topology, origin and GOP endpoint plans are rejected',()=>{
  const changes=[
    p=>p.rap.offset+=188,p=>p.rap.end+=188,p=>p.rap.pts++,p=>p.rap.dts++,p=>p.rap.sps[3]++,p=>p.rap.pps[1]^=1,
    p=>p.topology.videoPid++,p=>p.timeline.originTicks++,p=>p.local.before.pts++,p=>p.local.after.offset+=188,
    p=>p.local.followingRap=null,p=>p.local.videoFrames--,p=>p.timeline.videoStepTicks++,p=>p.targetTicks=p.rap.pts-1,
  ];
  for(const change of changes){const plan=structuredClone(plans[1]);change(plan);
    assert.throws(()=>prepare(plan),/^Error: SEEK_INPUT_(RAP|TOPOLOGY|ORIGIN|TARGET|GOP_END|VIDEO_CLOCK)$/);
  }
});

test('partial ends, missing audio coverage and bounded-input arithmetic cannot be promoted',()=>{
  assert.throws(()=>prepare(plans[2]),/^Error: SEEK_INPUT_AUDIO_COVERAGE$/);
  for(const patch of [{headBytes:new Uint8Array(0)},{headBytes:new Uint8Array(65537)},
    {bytes:new Uint8Array(187)},{bytes:new Uint8Array(1024*1024+188)},{offset:-188},{offset:2**53}])
    assert.throws(()=>prepareTsSeekInput({...input(),...patch}),/^Error: SEEK_INPUT_(BYTES|WINDOW)$/);
  const shortened=structuredClone(plans[1]);shortened.local.windowEndExclusive=shortened.local.followingRap.offset;
  assert.throws(()=>prepare(shortened),/^Error: SEEK_INPUT_GOP_END$/);
  const invalid=structuredClone(plans[1]);invalid.sourceSize=Number.MAX_SAFE_INTEGER+1;
  assert.throws(()=>prepare(invalid),/^Error: SEEK_INPUT_WINDOW$/);
});

test('missing complete preroll PES cannot be filled with partial or later AAC',()=>{
  const reference=prepare(),audio=reference.source.ranges.filter(row=>row.kind==='audio');
  const plan=structuredClone(plans[1]);plan.local.windowStart=plan.rap.offset;
  const bytes=Buffer.from(fixture.subarray(plan.local.windowStart,plan.local.windowEndExclusive));
  for(let i=0;i<bytes.length;i+=188){
    const packet=bytes.subarray(i,i+188);
    if(pidOf(packet)!==baseline.audioPid||i+plan.local.windowStart>=audio[1].offset)continue;
    packet.fill(255);packet.set([0x47,0x1f,0xff,0x10]);
  }
  assert.throws(()=>prepareTsSeekInput({headBytes:head,bytes,offset:plan.local.windowStart,plan}),/^Error: SEEK_INPUT_AUDIO_PREROLL$/);
});

test('virtual large source offsets retain exact exclusive ranges without 32-bit coercion',()=>{
  const shift=Math.ceil(2**40/188)*188,plan=structuredClone(plans[1]),original=input();
  plan.sourceSize+=shift;plan.rap.offset+=shift;plan.rap.end+=shift;
  plan.local.windowStart+=shift;plan.local.windowEndExclusive+=shift;
  for(const anchor of [plan.local.before,plan.local.after,plan.local.followingRap])anchor.offset+=shift;
  const result=prepareTsSeekInput({...original,offset:plan.local.windowStart,plan});
  const expected=prepare();assert.deepEqual(result.bytes,expected.bytes);
  for(let i=0;i<result.source.ranges.length;i++){
    assert.equal(result.source.ranges[i].offset,expected.source.ranges[i].offset+shift);
    assert.equal(result.source.ranges[i].end,expected.source.ranges[i].end+shift);
  }
});

test('selected source PES changes after planning cannot silently change anchors or codec identity',()=>{
  for(const field of [9,14]){
    const options=input(),bytes=Buffer.from(options.bytes),local=plans[1].rap.offset-options.offset;
    const packet=bytes.subarray(local,local+188),payload=payloadOf(packet);payload[field]&=254;
    assert.throws(()=>prepareTsSeekInput({...options,bytes}),/^Error: SEEK_INPUT_SCAN$/);
  }
  const options=input(),bytes=Buffer.from(options.bytes),local=plans[1].rap.offset-options.offset;
  const packet=bytes.subarray(local,local+188),payload=payloadOf(packet);
  // Source SPS in this public IDR is in the first PES packet, following AUD.
  const spsIndex=payload.indexOf(plans[1].rap.sps);
  assert.ok(spsIndex>=0);payload[spsIndex+3]++;
  assert.throws(()=>prepareTsSeekInput({...options,bytes}),/^Error: SEEK_INPUT_PARAMETERS$/);
});

test('extra elementary PID and changed or damaged PSI cannot be stripped into a clean package',()=>{
  const options=input(),bytes=Buffer.from(options.bytes);
  const nullPacket=Buffer.alloc(188,255);nullPacket.set([0x47,0x41,0x2c,0x10,0,0,1,0xe0]);
  // Replace the first SDT metadata packet, not any selected PES/continuity.
  assert.equal(pidOf(bytes.subarray(0,188)),17);bytes.set(nullPacket,0);
  assert.throws(()=>prepareTsSeekInput({...options,bytes}),/^Error: SEEK_INPUT_EXTRA_TRACK$/);
  for(const validCrc of [false,true]){
    const changed=Buffer.from(head);let mutated=false;
    for(let i=0;i<changed.length;i+=188){const packet=changed.subarray(i,i+188);
      if(pidOf(packet)!==0)continue;
      const payload=payloadOf(packet),start=1+payload[0],length=3+((payload[start+1]&15)<<8)+payload[start+2];
      const section=payload.subarray(start,start+length);section[3]^=1;
      if(validCrc)section.writeUInt32BE(crc32Mpeg2(section.subarray(0,-4)),length-4);
      mutated=true;
    }
    assert.equal(mutated,true);
    assert.throws(()=>prepareTsSeekInput({...options,headBytes:changed}),/^Error: SEEK_INPUT_(PSI|TOPOLOGY)$/);
  }
});

test('source and returned arrays never alias; arbitrary accessor exceptions are fixed-code failures',()=>{
  const source=Buffer.from(fixture),plan=structuredClone(plans[1]),options={...input(plan),headBytes:source.subarray(0,head.length),
    bytes:source.subarray(plan.local.windowStart,plan.local.windowEndExclusive)};
  const result=prepareTsSeekInput(options),saved=Uint8Array.from(result.bytes);
  result.configuration.sps.fill(0);result.configuration.pps.fill(0);
  assert.ok(source.equals(fixture));assert.notEqual(plan.rap.sps[0],0);assert.deepEqual(result.bytes,saved);
  source.fill(0);assert.deepEqual(result.bytes,saved);
  assert.throws(()=>prepareTsSeekInput({...input(),plan:{get sourceSize(){throw new Error('private callback data');}}}),/^Error: SEEK_INPUT_INVALID$/);
});
