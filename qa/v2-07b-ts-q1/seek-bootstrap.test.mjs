import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSeekBootstrap} from './seek-bootstrap.mjs';
import {prepareTsSeekInput} from './seek-input.mjs';
import {probeTsSeek} from './ts-seek.mjs';
import {createGopStream} from './gop-stream.mjs';
import {analyzeGopBoundaries} from './gop-boundaries.mjs';
import {crc32Mpeg2} from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const fixture=readFileSync(new URL('./synthetic-bframes-audiolead.ts',import.meta.url));
assert.equal(createHash('sha256').update(fixture).digest('hex'),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const head=fixture.subarray(0,Math.floor(65536/188)*188);
const plans=await Promise.all([.1,.5].map(fraction=>probeTsSeek({read:async({start,end})=>fixture.subarray(start,end+1),sourceSize:fixture.length,fraction})));
const pidOf=packet=>((packet[1]&31)<<8)|packet[2];
const payloadOf=packet=>packet.subarray(4+(packet[3]&32?packet[4]+1:0));
function options(plan=plans[1]){return {headBytes:head,bytes:fixture.subarray(plan.local.windowStart,plan.local.windowEndExclusive),offset:plan.local.windowStart,plan};}
function run(plan=plans[1],chunkSize=4093){
  const owner=createSeekBootstrap(options(plan)),parts=[];
  for(let offset=owner.readStart;offset<fixture.length;offset+=chunkSize)
    parts.push(owner.push(fixture.subarray(offset,offset+chunkSize),{offset,generation:1}));
  owner.finish({sourceSize:fixture.length,generation:1});
  return {owner,bytes:Buffer.concat(parts),parts};
}
function pes(bytes,selected){
  const records=[],current=new Map();
  for(let offset=0;offset<bytes.length;offset+=188){
    const packet=bytes.subarray(offset,offset+188),pid=pidOf(packet);
    if(!selected.includes(pid)||!(packet[3]&16))continue;
    if(packet[1]&64){const row={pid,offset,parts:[]};records.push(row);current.set(pid,row);}
    const row=current.get(pid);if(row)row.parts.push(payloadOf(packet));
  }
  return records.map(row=>({...row,bytes:Buffer.concat(row.parts)}));
}
const originalPes=pes(fixture,[plans[0].topology.videoPid,plans[0].topology.audioPid]);

test('continuous suffix has exact selected source PES bytes/timestamps, no duplicated or dropped PES',()=>{
  for(const plan of plans){
    const prepared=prepareTsSeekInput(options(plan)),{owner,bytes}=run(plan);
    const starts=new Map(['video','audio'].map(kind=>{const row=prepared.source.ranges.find(item=>item.kind===kind);return [row.pid,row.offset];}));
    const expected=originalPes.filter(row=>row.offset>=starts.get(row.pid));
    const actual=pes(bytes,[plan.topology.videoPid,plan.topology.audioPid]);
    assert.equal(actual.length,expected.length);
    for(let i=0;i<actual.length;i++){assert.equal(actual[i].pid,expected[i].pid);assert.ok(actual[i].bytes.equals(expected[i].bytes));}
    const intervals=[],stream=createGopStream({onInterval:item=>intervals.push(item)});
    for(let i=0;i<bytes.length;i+=65536)stream.push(bytes.subarray(i,i+65536));
    stream.finish({sourceSize:bytes.length});
    const strict=analyzeGopBoundaries(bytes);
    assert.equal(strict.videoFrames,expected.filter(row=>row.pid===plan.topology.videoPid).length);
    assert.equal(intervals.reduce((n,row)=>n+row.proof.videoFrames,0),strict.videoFrames);
    assert.equal(intervals.reduce((n,row)=>n+row.proof.aacFrames,0),strict.aacFrames);
    assert.equal(Buffer.concat(intervals.map(row=>Buffer.from(row.bytes))).equals(bytes),true);
    assert.equal(owner.stats().state,'finished');assert.equal(owner.stats().retainedBytes,0);
    assert.equal(owner.stats().outputBytes,owner.outputSize);assert.equal(owner.stats().sourceOffset,fixture.length);
    assert.ok(owner.stats().peakRetainedBytes<150000);assert.ok(intervals.length>=3);
  }
});

test('arbitrary one-byte and larger chunks produce identical owned output with bounded packet carry',()=>{
  const expected=run().bytes;
  for(const size of [1,187,188,4093,65536]){
    const owner=createSeekBootstrap(options()),parts=[];
    for(let offset=owner.readStart;offset<fixture.length;offset+=size){
      const input=Uint8Array.from(fixture.subarray(offset,offset+size));
      const output=owner.push(input,{offset,generation:1});input.fill(0);parts.push(output);
      assert.ok(owner.stats().carryBytes<188);assert.ok(output.length<=65536+187+16384);
    }
    owner.finish({sourceSize:fixture.length,generation:1});assert.ok(Buffer.concat(parts).equals(expected));
  }
});

test('only continuity nibbles and pre-start null packets change; raw PCR/adaptation/payload are preserved',()=>{
  const {owner,bytes}=run(),prefixLength=owner.outputSize-(fixture.length-owner.readStart);
  const prepared=prepareTsSeekInput(options()),starts=new Map(prepared.source.ranges.map(row=>[row.pid,prepared.source.ranges.find(item=>item.pid===row.pid).offset]));
  const begun=new Set(),cc=new Map();let nulled=0;
  for(let i=0;i<bytes.length;i+=188){
    const output=bytes.subarray(i,i+188),pid=pidOf(output),previous=cc.get(pid);
    assert.equal(output[3]&15,previous===undefined?0:(previous+(output[3]&16?1:0))%16);cc.set(pid,output[3]&15);
    if(i<prefixLength)continue;
    const offset=owner.readStart+i-prefixLength,original=fixture.subarray(offset,offset+188),originalPid=pidOf(original);
    let replace=starts.has(originalPid)&&offset<starts.get(originalPid);
    if([0,plans[1].topology.pmtPid].includes(originalPid)){
      if((original[3]&16)&&(original[1]&64))begun.add(originalPid);replace=!begun.has(originalPid);
    }
    const normalized=Buffer.from(output);normalized[3]=(normalized[3]&240)|(original[3]&15);
    if(replace){assert.equal(pid,8191);assert.ok(output.subarray(4).every(value=>value===255));nulled++;}
    else assert.ok(normalized.equals(original));
  }
  assert.equal(owner.stats().nulledPackets,nulled);
});

test('raw continuity duplicates and gaps fail before normalization, even on packets that would be nulled',()=>{
  for(const change of [0,2]){
    const owner=createSeekBootstrap(options()),bytes=Buffer.from(fixture.subarray(owner.readStart,owner.readStart+65536));
    const counters=new Map();let changed=false;
    for(let i=0;i+188<=bytes.length;i+=188){const packet=bytes.subarray(i,i+188),pid=pidOf(packet);
      if(counters.has(pid)&&(packet[3]&16)){packet[3]=(packet[3]&240)|((counters.get(pid)+change)%16);changed=true;break;}
      counters.set(pid,packet[3]&15);
    }
    assert.equal(changed,true);assert.throws(()=>owner.push(bytes,{offset:owner.readStart,generation:1}),/BOOTSTRAP_CONTINUITY/);
    assert.equal(owner.stats().retainedBytes,0);assert.equal(owner.stats().state,'failed');
  }
});

test('modified first PES payload/start/header is source-bound, with no caller plan/input aliases',()=>{
  const original=options(),plan=structuredClone(plans[1]),window=Uint8Array.from(original.bytes),headCopy=Uint8Array.from(head);
  const owner=createSeekBootstrap({...original,plan,bytes:window,headBytes:headCopy});
  window.fill(0);headCopy.fill(0);plan.rap.sps.fill(0);plan.topology.videoPid=42;
  const bytes=Buffer.from(fixture.subarray(owner.readStart,owner.readStart+65536));
  const packet=bytes.subarray(0,188);payloadOf(packet)[10]^=2;
  assert.throws(()=>owner.push(bytes,{offset:owner.readStart,generation:1}),/BOOTSTRAP_BINDING/);
  for(const mutation of [packet=>packet[1]&=191,packet=>payloadOf(packet)[0]=1]){
    const next=createSeekBootstrap(options()),input=Buffer.from(fixture.subarray(next.readStart,next.readStart+188));mutation(input);
    assert.throws(()=>next.push(input,{offset:next.readStart,generation:1}),/BOOTSTRAP_(START|BINDING)/);
  }
});

test('transport, adaptation, discontinuity, undeclared PID and misplaced PCR cannot be normalized away',()=>{
  const mutations=[packet=>packet[0]=0,packet=>packet[1]|=128,packet=>packet[3]|=128,
    packet=>packet[3]&=207,packet=>{packet[3]|=32;packet[4]=184;},
    packet=>{packet[3]|=32;packet[4]=1;packet[5]=128;},packet=>{packet[1]=(packet[1]&224)|4;packet[2]=44;},
  ];
  for(const mutation of mutations){const owner=createSeekBootstrap(options()),input=Buffer.from(fixture.subarray(owner.readStart,owner.readStart+188));mutation(input);
    assert.throws(()=>owner.push(input,{offset:owner.readStart,generation:1}),/^Error: BOOTSTRAP_/);assert.equal(owner.stats().retainedBytes,0);
  }
  const owner=createSeekBootstrap(options()),packet=Buffer.alloc(188,255);packet.set([71,0,17,0x30,7,16]);
  assert.throws(()=>owner.push(packet,{offset:owner.readStart,generation:1}),/BOOTSTRAP_PCR_PID/);
});

test('future CRC-valid PSI topology changes fail despite prepended original PSI',()=>{
  const owner=createSeekBootstrap(options()),input=Buffer.from(fixture.subarray(owner.readStart,owner.readStart+65536));let changed=false;
  for(let i=0;i+188<=input.length;i+=188){const packet=input.subarray(i,i+188);if(pidOf(packet)!==0)continue;
    const payload=payloadOf(packet),start=1+payload[0],length=3+((payload[start+1]&15)<<8)+payload[start+2];
    const section=payload.subarray(start,start+length);section[3]^=1;
    section.writeUInt32BE(crc32Mpeg2(section.subarray(0,-4)),length-4);changed=true;break;
  }
  assert.equal(changed,true);assert.throws(()=>owner.push(input,{offset:owner.readStart,generation:1}),/BOOTSTRAP_PSI/);
  assert.equal(owner.stats().retainedBytes,0);
});

test('initial partial PAT/PMT are nulled until their own first PUSI without poisoning seeded PSI',()=>{
  const owner=createSeekBootstrap(options()),source=Buffer.from(fixture),changed=new Set();
  for(let i=owner.readStart;i<source.length;i+=188){const packet=source.subarray(i,i+188),pid=pidOf(packet);
    if(![0,plans[1].topology.pmtPid].includes(pid)||changed.has(pid))continue;
    packet[1]&=191;changed.add(pid);if(changed.size===2)break;
  }
  assert.equal(changed.size,2);const parts=[];
  for(let offset=owner.readStart;offset<source.length;offset+=65536)
    parts.push(owner.push(source.subarray(offset,offset+65536),{offset,generation:1}));
  owner.finish({sourceSize:source.length,generation:1});const bytes=Buffer.concat(parts);
  assert.equal(analyzeGopBoundaries(bytes).videoFrames,analyzeGopBoundaries(run().bytes).videoFrames);
  assert.equal(owner.stats().nulledPackets,run().owner.stats().nulledPackets+2);
});

test('adaptation-only raw counters must remain unchanged and output counters do not increment',()=>{
  const prepared=prepareTsSeekInput(options()),audioEnd=prepared.source.ranges.find(row=>row.kind==='audio').end;
  for(const delta of [0,1]){
    const owner=createSeekBootstrap(options()),source=Buffer.from(fixture);let cc=null,target=null;
    for(let offset=owner.readStart;offset<source.length;offset+=188){const packet=source.subarray(offset,offset+188),pid=pidOf(packet);
      if(pid===plans[1].topology.videoPid)cc=packet[3]&15;
      if(pid!==17||offset<audioEnd||cc===null)continue;
      packet.fill(255);packet.set([71,1,0,32|((cc+delta)%16),183,0]);target=offset;break;
    }
    assert.ok(target!==null);const parts=[];
    const feed=()=>{for(let offset=owner.readStart;offset<target+188;offset+=65536)
      parts.push(owner.push(source.subarray(offset,Math.min(offset+65536,target+188)),{offset,generation:1}));};
    if(delta){assert.throws(feed,/BOOTSTRAP_CONTINUITY/);assert.equal(owner.stats().retainedBytes,0);}
    else{
      feed();const bytes=Buffer.concat(parts),last=bytes.subarray(-188);let previous=null;
      for(let i=0;i<bytes.length-188;i+=188)if(pidOf(bytes.subarray(i,i+188))===256)previous=bytes[i+3]&15;
      assert.equal(last[3]&15,previous);assert.equal(last[3]&48,32);owner.abort();
    }
  }
});

test('strict serial source offsets, generation, chunks and exact EOF are terminal guards',()=>{
  for(const mode of ['offset','generation','empty','large','eof','partial']){
    const owner=createSeekBootstrap(options());
    const operation=()=>{
      if(mode==='eof')return owner.finish({sourceSize:fixture.length,generation:1});
      if(mode==='partial'){owner.push(fixture.subarray(owner.readStart,owner.readStart+1),{offset:owner.readStart,generation:1});return owner.finish({sourceSize:fixture.length,generation:1});}
      return owner.push(mode==='empty'?new Uint8Array():mode==='large'?new Uint8Array(65537):fixture.subarray(owner.readStart,owner.readStart+188),
        {offset:owner.readStart+(mode==='offset'?1:0),generation:mode==='generation'?2:1});
    };
    assert.throws(operation,/BOOTSTRAP_(OFFSET|STALE|CHUNK|EOF)/);assert.equal(owner.stats().retainedBytes,0);
    assert.throws(()=>owner.push(new Uint8Array(1),{offset:owner.readStart,generation:1}),/BOOTSTRAP_CLOSED/);
  }
});

test('callback failures, asynchronous predicates, reentrancy and abort never release output or retain arrays',async()=>{
  for(const action of ['false','throw','promise','abort','reenter']){
    let owner;
    owner=createSeekBootstrap({...options(),isCurrent:()=>{
      if(action==='false')return false;if(action==='throw')throw new Error('private string');
      if(action==='promise')return Promise.reject(new Error('private promise'));
      if(action==='abort'){owner.abort();return true;}
      owner.push(new Uint8Array(1),{offset:owner.readStart,generation:1});return true;
    }});
    assert.throws(()=>owner.push(fixture.subarray(owner.readStart,owner.readStart+188),{offset:owner.readStart,generation:1}),/^Error: BOOTSTRAP_/);
    assert.equal(owner.stats().retainedBytes,0);assert.equal(owner.stats().outputBytes,0);
  }
  const owner=createSeekBootstrap(options());owner.abort();owner.abort();assert.equal(owner.stats().state,'aborted');assert.equal(owner.stats().retainedBytes,0);
  await new Promise(resolve=>setImmediate(resolve));
});

test('post-processing generation change/abort suppresses the constructed output and clears retention',()=>{
  for(const mode of ['stale','abort','reenter']){
    let checks=0,owner;
    owner=createSeekBootstrap({...options(),isCurrent:()=>{
      if(++checks===1)return true;
      if(mode==='stale')return false;
      if(mode==='abort'){owner.abort();return true;}
      owner.finish({sourceSize:fixture.length,generation:1});return true;
    }});
    assert.throws(()=>owner.push(fixture.subarray(owner.readStart,owner.readStart+188),{offset:owner.readStart,generation:1}),/^Error: BOOTSTRAP_/);
    assert.equal(checks,2);assert.equal(owner.stats().outputBytes,0);assert.equal(owner.stats().retainedBytes,0);
  }
});

test('options/accessor failures are fixed-code and safe large source arithmetic never wraps',()=>{
  for(const generation of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>createSeekBootstrap({...options(),generation}),/BOOTSTRAP_OPTIONS/);
  assert.throws(()=>createSeekBootstrap({...options(),isCurrent:3}),/BOOTSTRAP_OPTIONS/);
  assert.throws(()=>createSeekBootstrap({get generation(){throw new Error('private data');}}),/^Error: BOOTSTRAP_OPTIONS$/);
  const shift=Math.ceil(2**40/188)*188,plan=structuredClone(plans[1]),original=options();
  plan.sourceSize+=shift;plan.rap.offset+=shift;plan.rap.end+=shift;plan.local.windowStart+=shift;plan.local.windowEndExclusive+=shift;
  for(const anchor of [plan.local.before,plan.local.after,plan.local.followingRap])anchor.offset+=shift;
  const owner=createSeekBootstrap({...original,offset:original.offset+shift,plan}),reference=createSeekBootstrap(options());
  assert.equal(owner.readStart,reference.readStart+shift);assert.equal(owner.outputSize,reference.outputSize);
  owner.abort();reference.abort();
});
