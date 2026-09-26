import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { probeTsSeek } from './ts-seek.mjs';
import { scanTsWindow } from './ts-window.mjs';
import { analyzeGopBoundaries,readAnnexBNals } from './gop-boundaries.mjs';
import { variant,vfr,shiftTimestamp } from './synthetic-variants.mjs';
import { BoundedProbeError } from '../v2-07a-bounded-probe/bounded-probe.mjs';
import { crc32Mpeg2 } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const fixture=readFileSync(new URL('./synthetic-bframes-audiolead.ts',import.meta.url));
assert.equal(createHash('sha256').update(fixture).digest('hex'),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const baseline=analyzeGopBoundaries(fixture),whole=scanTsWindow(fixture,{...baseline,atEof:true});
function reader(bytes=fixture){
  const calls=[];let active=false;
  return {calls,read:async({start,end})=>{
    assert.equal(active,false);active=true;await Promise.resolve();active=false;
    assert.ok(Number.isSafeInteger(start)&&Number.isSafeInteger(end));
    assert.equal(start%188,0);assert.equal((end+1)%188,0);assert.ok(end-start+1<=1024*1024);
    calls.push({start,end});return bytes.subarray(start,end+1);
  }};
}
const probe=(options={})=>probeTsSeek({read:reader().read,sourceSize:fixture.length,fraction:.5,...options});

test('10/50/90 percent candidates retain common AAC-leading origin and match fixture RAP anchors',async()=>{
  for(const fraction of [.1,.5,.9]){
    const input=reader(),result=await probe({read:input.read,fraction});
    const expected=whole.video.filter(row=>row.idr&&row.pts<=result.targetTicks).at(-1);
    const {idr,...expectedRap}=expected;assert.deepEqual(result.rap,expectedRap);
    assert.equal(result.timeline.originTicks,Math.min(whole.video[0].pts,whole.audio[0].pts));
    assert.ok(result.timeline.originTicks<whole.video[0].pts,'AAC lead is not normalized to video zero');
    assert.equal(result.timeline.globalContinuityVerified,false);assert.equal(result.timeline.kind,'sampled-candidate');
    assert.equal(result.timeline.videoStepTicks,3000);
    assert.ok(result.local.before.pts<=result.targetTicks&&result.local.after.pts>=result.targetTicks);
    assert.equal(result.local.sourceClockPreserved,true);assert.equal(result.local.decodeStartSliceVerified,false);
    assert.equal(input.calls.length,result.windows.length);assert.equal(result.windows.length,2);
    assert.equal(result.readBytes,result.windows.reduce((sum,row)=>sum+row.bytes,0));
    assert.ok(!JSON.stringify(result).includes('payload'));
  }
});

test('last-frame duration before the next IDR brackets using the actual following IDR',async()=>{
  const timeline=(await probe()).timeline,next=whole.video[60];
  const target=next.pts-1500;
  const result=await probe({fraction:(target-timeline.originTicks)/(timeline.endTicks-timeline.originTicks)});
  assert.equal(result.rap.offset,whole.video[0].offset);
  assert.equal(result.local.after.offset,next.offset);assert.equal(result.local.followingRap.offset,next.offset);
  assert.ok(result.local.before.pts<target&&result.local.after.pts>target);
});

test('near EOF final-frame span has no invented following anchor and fails without additional reads',async()=>{
  const input=reader();
  await assert.rejects(probe({read:input.read,fraction:.99999}),/^Error: SEEK_TARGET_AFTER_LAST_ANCHOR$/);
  assert.equal(input.calls.length,2);
});

test('product absolute time requests clamp only to actual first/last frame anchors',async()=>{
  for(const seconds of [0,.001,5,1000]){
    const result=await probe({fraction:undefined,positionSeconds:seconds});
    const expected=Math.max(whole.video[0].pts,Math.min(Math.max(...whole.video.map(row=>row.pts)),result.timeline.originTicks+seconds*90000));
    assert.equal(result.targetTicks,expected);
    assert.ok(result.local.before.pts<=expected&&result.local.after.pts>=expected);
  }
  for(const positionSeconds of [-1,NaN,Infinity])
    await assert.rejects(probe({fraction:undefined,positionSeconds}),/SEEK_OPTIONS/);
  await assert.rejects(probe({positionSeconds:0}),/SEEK_OPTIONS/);
});

test('single full bounded window is deduplicated and legal with one read credit',async()=>{
  const input=reader(),result=await probe({read:input.read,windowBytes:fixture.length,maxWindows:1});
  assert.equal(input.calls.length,1);assert.equal(result.windows.length,1);
});

test('sparse padded read map uses target-local expansion, not a sequential prefix scan',async()=>{
  const factor=3,sourceSize=fixture.length*factor,calls=[];
  const empty=new Uint8Array(188).fill(255);empty.set([0x47,0x1f,0xff,0x10]);
  const read=async({start,end})=>{
    calls.push({start,end});const bytes=new Uint8Array(end-start+1);
    for(let i=0;i<bytes.length;i+=188){
      const packet=(start+i)/188;
      bytes.set(packet%factor===0?fixture.subarray(packet/factor*188,packet/factor*188+188):empty,i);
    }
    return bytes;
  };
  const result=await probe({read,sourceSize,fraction:.5});
  assert.ok(result.windows.some(row=>row.bytes>524144),'B-picture straddling window expands within 1 MiB');
  assert.ok(result.windows.every(row=>row.bytes<=1024*1024));
  assert.equal(new Set(calls.map(row=>`${row.start}:${row.end}`)).size,calls.length);
  assert.ok(calls.length<=12);assert.ok(result.readBytes<sourceSize);
  const expected=whole.video.filter(row=>row.idr&&row.pts<=result.targetTicks).at(-1);
  assert.equal(result.rap.offset,expected.offset*factor);
  assert.equal(result.rap.pts,expected.pts);
});

test('virtual source arithmetic above 4 GiB has exact tail RAP offsets without allocating that source',async()=>{
  const sourceSize=Math.floor(2**40/188)*188,windowBytes=282000,calls=[];
  const read=async({start,end})=>{
    calls.push({start,end});
    if(start===0)return fixture.subarray(0,windowBytes);
    assert.equal(end+1,sourceSize);return fixture.subarray(fixture.length-windowBytes);
  };
  const result=await probe({read,sourceSize,windowBytes,fraction:.9});
  const expected=whole.video.filter(row=>row.idr&&row.pts<=result.targetTicks).at(-1);
  assert.equal(result.rap.offset,sourceSize-fixture.length+expected.offset);
  assert.ok(result.rap.offset>2**32);assert.equal(calls.length,2);
});

test('caps, exact source arithmetic, fractions and short windows fail closed',async()=>{
  for(const options of [{sourceSize:0},{sourceSize:189},{sourceSize:Number.MAX_SAFE_INTEGER+1},{fraction:0},{fraction:1},
    {fraction:NaN},{windowBytes:189},{windowBytes:1048664},{maxWindows:0},{maxWindows:17},{read:null}]){
    await assert.rejects(probe(options),/^Error: SEEK_OPTIONS$/);
  }
  const input=reader();await assert.rejects(probe({read:input.read,maxWindows:1}),/^Error: SEEK_WINDOW_BUDGET$/);
  assert.equal(input.calls.length,1);
  await assert.rejects(probe({windowBytes:188}),/^Error: SEEK_HEAD_UNPROVEN$/);
  await assert.rejects(probe({fraction:.001}),/^Error: SEEK_TARGET_BEFORE_VIDEO$/);
});

test('read rejection exposes only validated transport codes, never arbitrary callback content',async()=>{
  await assert.rejects(probe({read:async()=>{throw new Error('private source path');}}),/^Error: SEEK_READ_FAILED$/);
  await assert.rejects(probe({read:()=>{throw {code:'GENERATION_STALE',message:'private spoof'};}}),/^Error: SEEK_READ_FAILED$/);
  for(const code of ['GENERATION_STALE','FILE_REQUEST_LIMIT','CONTENT_RANGE_INVALID','ABORTED']){
    const original=new BoundedProbeError(code);original.message='private changed message';
    await assert.rejects(probe({read:async()=>{throw original;}}),error=>error instanceof BoundedProbeError&&error.code===code&&error.message===code);
  }
  await assert.rejects(probe({read:async()=>new Uint8Array(188)}),/^Error: SEEK_READ_LENGTH$/);
});

test('sampled VFR, timestamp reversal and AAC drift do not become seek candidates',async()=>{
  const backwards=variant(records=>{const record=records.find(row=>row.videoIndex===200);shiftTimestamp(record.data,9,-300000);shiftTimestamp(record.data,14,-300000);});
  const drift=variant((records,base)=>{const audio=records.filter(row=>row.pid===base.audioPid);shiftTimestamp(audio[2].data,9,10);});
  for(const bytes of [vfr().bytes,backwards.bytes,drift.bytes]){
    await assert.rejects(probe({read:reader(bytes).read,sourceSize:bytes.length}),/^Error: SEEK_(VIDEO_CLOCK_UNPROVEN|AUDIO_CLOCK_UNPROVEN|SAMPLED_CLOCK_ORDER)$/);
  }
});

test('sampled PSI identity/CRC changes and video presentation phase changes fail closed',async()=>{
  const changed=Buffer.from(fixture),broken=Buffer.from(fixture);let first=true;
  for(let position=0;position<changed.length;position+=188){
    const packet=changed.subarray(position,position+188);
    if((((packet[1]&31)<<8)|packet[2])!==0||!(packet[1]&64))continue;
    const payload=4+(packet[3]&32?packet[4]+1:0),start=payload+1+packet[payload];
    const length=3+((packet[start+1]&15)<<8)+packet[start+2];
    if(first){broken[position+start+length-1]^=1;first=false;}
    if(position<fixture.length-282000)continue;
    const section=packet.subarray(start,start+length);section[5]=(section[5]&0xc1)|2;
    section.writeUInt32BE(crc32Mpeg2(section.subarray(0,-4)),section.length-4);
  }
  await assert.rejects(probe({read:reader(broken).read}),/^Error: SEEK_PSI_INVALID$/);
  await assert.rejects(probe({read:reader(changed).read,windowBytes:282000}),/^Error: SEEK_TOPOLOGY_CHANGED$/);
  const phase=variant(records=>{for(const record of records)if(record.videoIndex>=180)shiftTimestamp(record.data,9,1500);});
  await assert.rejects(probe({read:reader(phase.bytes).read,sourceSize:phase.bytes.length}),/^Error: SEEK_VIDEO_CLOCK_UNPROVEN$/);
});

test('sampled source parameter and AAC configuration changes are not silently joined',async()=>{
  const changed=variant(records=>{
    const record=records.find(row=>row.videoIndex===60);
    const sps=readAnnexBNals(record.data.subarray(9+record.data[8])).find(nal=>(nal[0]&31)===7);sps[3]++;
  });
  await assert.rejects(probe({read:reader(changed.bytes).read,sourceSize:changed.bytes.length}),/^Error: SEEK_PARAMETERS_CHANGED$/);
  const audioChanged=variant((records,base)=>{
    const record=records.filter(row=>row.pid===base.audioPid)[2];
    for(let i=9+record.data[8];i<record.data.length;){
      record.data[i+2]=(record.data[i+2]&0xc3)|(4<<2);
      i+=((record.data[i+3]&3)<<11)|(record.data[i+4]<<3)|(record.data[i+5]>>5);
    }
  });
  await assert.rejects(probe({read:reader(audioChanged.bytes).read,sourceSize:audioChanged.bytes.length}),/^Error: SEEK_AUDIO_CONFIG_CHANGED$/);
});

test('returned parameters and summaries own their copies without mutating source bytes',async()=>{
  const before=Buffer.from(fixture),result=await probe();
  result.rap.sps.fill(0);result.rap.pps.fill(0);result.windows[0].start=999;
  assert.ok(fixture.equals(before));
  const again=await probe();assert.notEqual(again.rap.sps[0],0);assert.equal(again.windows[0].start,0);
});
