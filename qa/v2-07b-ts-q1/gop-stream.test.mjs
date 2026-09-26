import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createGopStream } from './gop-stream.mjs';
import { analyzeGopBoundaries,readAnnexBNals } from './gop-boundaries.mjs';
import { variant,crossAdts,vfr,delayedAudio,shiftTimestamp } from './synthetic-variants.mjs';
const require=createRequire(import.meta.url);
const {transmuxAtCuts,initTracks}=require('./incremental-probe.cjs');
const {Transmuxer}=require('mux.js/dist/mux-mp4.min.js');
const input=readFileSync(new URL('./synthetic-bframes-audiolead.ts',import.meta.url));
const baseline=analyzeGopBoundaries(input);
const budgets={maxWindowBytes:188*900,maxLookaheadBytes:188*128,maxPesBytes:32768};

function deliver(owner,bytes,chunkSize=65536){
  for(let offset=0;offset<bytes.length;offset+=chunkSize)owner.push(bytes.subarray(offset,offset+chunkSize));
}

test('incremental owner emits before EOF with exact original bytes and the verified six intervals',()=>{
  for(const chunkSize of [1,187,188,189,4093,65536]){
    const intervals=[];
    const owner=createGopStream({...budgets,onInterval:item=>intervals.push(item)});
    deliver(owner,input,chunkSize);
    assert.equal(intervals.length,5,'five closed GOPs precede EOF');
    assert.ok(owner.stats().firstEmissionOffset<input.length/3);
    owner.finish({sourceSize:input.length});
    assert.equal(owner.stats().state,'finished');assert.equal(owner.stats().retainedBytes,0);
    assert.equal(intervals.length,6);
    assert.deepEqual(intervals.slice(0,-1).map(item=>item.end),baseline.cuts);
    assert.ok(Buffer.concat(intervals.map(item=>Buffer.from(item.bytes))).equals(input));
    assert.equal(intervals.filter(item=>item.final).length,1);
    assert.equal(intervals.reduce((n,item)=>n+item.proof.videoFrames,0),360);
    assert.equal(intervals.reduce((n,item)=>n+item.proof.aacFrames,0),564);
    const stats=owner.stats();
    assert.ok(stats.peakRetainedBytes<=stats.storageCapacity+188);
    // This is byte-storage accounting, not a JavaScript heap/mux memory claim.
    assert.ok(stats.peakOwnedByteStorage<500000);
    assert.ok(stats.storageCapacity<input.length/4);
  }
});

test('persistent mux output is byte-identical to the independently verified IDR-boundary output',()=>{
  const mux=new Transmuxer({remux:true,keepOriginalTimestamps:true});
  const chunks=[];let initial=null;
  mux.on('data',segment=>{
    const init=Buffer.from(segment.initSegment);initTracks(init);
    if(initial)assert.ok(initial.equals(init));else{initial=init;chunks.push(init);}
    chunks.push(Buffer.from(segment.data));
  });
  const owner=createGopStream({...budgets,onInterval:({bytes})=>{mux.push(bytes);mux.flush();}});
  deliver(owner,input,4093);owner.finish({sourceSize:input.length});
  assert.ok(Buffer.concat(chunks).equals(transmuxAtCuts(input,baseline.cuts).bytes));
});

test('first interval carries copied source parameter sets without exposing internal identity',()=>{
  let configuration=null,calls=0;
  const owner=createGopStream({...budgets,onInterval:item=>{
    calls++;
    if(calls===1){
      configuration=item.configuration;
      assert.equal(configuration.videoTrackId,baseline.videoPid);
      assert.equal(configuration.sps[0]&31,7);assert.equal(configuration.pps[0]&31,8);
      assert.ok(configuration.sps.length>5&&configuration.pps.length>1);
      // Later IDR comparisons must still compare the source's retained bytes.
      configuration.sps.fill(0);configuration.pps.fill(0);
    }else assert.equal(item.configuration,null);
  }});
  deliver(owner,input,4093);owner.finish({sourceSize:input.length});
  assert.equal(calls,6);assert.equal(owner.stats().state,'finished');
  assert.equal(owner.stats().elementary.parameterBytes,0);
  assert.ok(configuration.sps.every(value=>value===0));
});

test('PES length split across TS packets still closes complete audio before the GOP cut',()=>{
  const changed=variant((records,base)=>{for(const record of records)if(record.pid===base.audioPid)record.firstPacketBytes=5;});
  const expected=analyzeGopBoundaries(changed.bytes);
  const intervals=[];const owner=createGopStream({onInterval:item=>intervals.push(item)});
  deliver(owner,changed.bytes,189);owner.finish({sourceSize:changed.bytes.length});
  assert.deepEqual(intervals.slice(0,-1).map(item=>item.end),expected.cuts);
  assert.ok(Buffer.concat(intervals.map(item=>Buffer.from(item.bytes))).equals(changed.bytes));
});

test('malformed future data fails terminally after early emission and releases its storage',()=>{
  const damaged=Buffer.from(input);damaged[baseline.cuts[3]+1]|=128;
  let calls=0;const owner=createGopStream({...budgets,onInterval:()=>calls++});
  assert.throws(()=>deliver(owner,damaged),/TS_TRANSPORT/);
  assert.ok(calls>0);assert.equal(owner.stats().state,'failed');assert.equal(owner.stats().retainedBytes,0);
  assert.throws(()=>owner.push(input.subarray(0,188)),/STREAM_CLOSED/);
  assert.throws(()=>owner.finish({sourceSize:input.length}),/STREAM_CLOSED/);
});

test('VFR, split ADTS, delayed track and cumulatively drifting audio cannot finish successfully',()=>{
  const drift=variant((records,base)=>{let count=0;for(const record of records)if(record.pid===base.audioPid)shiftTimestamp(record.data,9,count++);});
  for(const changed of [vfr(),crossAdts(),delayedAudio(),drift]){
    const owner=createGopStream({...budgets,onInterval:()=>{}});
    assert.throws(()=>{deliver(owner,changed.bytes);owner.finish({sourceSize:changed.bytes.length});});
    assert.equal(owner.stats().state,'failed');assert.equal(owner.stats().retainedBytes,0);
  }
});

test('chunk, PES, GOP and prelude budgets fail closed without full-file allocation',()=>{
  const oversized=createGopStream({onInterval:()=>{}});
  assert.throws(()=>oversized.push(new Uint8Array(65537)),/CHUNK_LIMIT/);assert.equal(oversized.stats().retainedBytes,0);
  for(const options of [{maxPesBytes:100},{maxWindowBytes:188*16,maxLookaheadBytes:188*8}]){
    const owner=createGopStream({...options,onInterval:()=>{}});
    assert.throws(()=>deliver(owner,input),/STORAGE_LIMIT|WINDOW_LIMIT/);
    assert.equal(owner.stats().state,'failed');assert.equal(owner.stats().retainedBytes,0);
  }
  const noPsi=createGopStream({maxWindowBytes:188*16,maxLookaheadBytes:188*8,onInterval:()=>{}});
  const nullPacket=new Uint8Array(188).fill(255);nullPacket.set([0x47,0x1f,0xff,0x10]);
  assert.throws(()=>{for(let i=0;i<25;i++)noPsi.push(nullPacket);},/GOP_STORAGE_LIMIT/);
  assert.equal(noPsi.stats().retainedBytes,0);
});

test('only exact EOF is accepted; truncation and incorrect source size fail',()=>{
  for(const [bytes,size]of[[input.subarray(0,input.length-1),input.length-1],[input,input.length+188]]){
    const owner=createGopStream({...budgets,onInterval:()=>{}});deliver(owner,bytes);
    assert.throws(()=>owner.finish({sourceSize:size}),/EXACT_EOF_REQUIRED/);
    assert.equal(owner.stats().retainedBytes,0);
  }
});

test('abort, stale generation, consumer failure, async and reentrant use cannot retain or resume ownership',()=>{
  let active=1;let owner=createGopStream({generation:1,isCurrent:g=>g===active,onInterval:()=>{}});
  deliver(owner,input.subarray(0,188*20),188);active=2;
  assert.throws(()=>owner.push(input.subarray(188*20,188*21)),/GENERATION_STALE/);
  assert.equal(owner.stats().retainedBytes,0);
  for(const behavior of ['abort','throw','promise','reenter']){
    owner=createGopStream({...budgets,onInterval:()=>{
      if(behavior==='abort')owner.abort();
      if(behavior==='throw')throw new Error('SINK_FAILED');
      if(behavior==='promise')return Promise.resolve();
      if(behavior==='reenter')owner.push(input.subarray(0,188));
    }});
    assert.throws(()=>deliver(owner,input));
    assert.ok(['failed','aborted'].includes(owner.stats().state));assert.equal(owner.stats().retainedBytes,0);
    assert.equal(owner.stats().emittedIntervals,1);
    assert.throws(()=>owner.push(input.subarray(0,188)),/STREAM_CLOSED/);
  }
});

test('consumer and generation-check errors cannot disclose arbitrary strings in errors or stats',async()=>{
  const secret='PRIVATE_ERROR_MUST_NOT_ESCAPE';
  for(const options of [{isCurrent:()=>{throw new Error(secret);},onInterval:()=>{}},
    {isCurrent:()=>Promise.reject(new Error(secret)),onInterval:()=>{}},
    {onInterval:()=>{throw new Error(secret);}},
    {onInterval:()=>Promise.reject(new Error(secret))}]){
    const owner=createGopStream({...budgets,...options});
    assert.throws(()=>deliver(owner,input),error=>!error.message.includes(secret));
    assert.equal(JSON.stringify(owner.stats()).includes(secret),false);
    assert.equal(owner.stats().retainedBytes,0);
  }
  await new Promise(resolve=>setImmediate(resolve));
});

test('streaming admission preserves the previous complete SPS syntax gate',()=>{
  const changed=variant(records=>{
    for(const record of records.filter(row=>row.idr)){
      const header=9+record.data[8];
      const units=readAnnexBNals(record.data.subarray(header));
      record.data=Buffer.concat([record.data.subarray(0,header),...units.flatMap(unit=>
        [Buffer.from([0,0,1]),(unit[0]&31)===7?Buffer.from([0x67,0x80]):Buffer.from(unit)])]);
    }
  });
  assert.throws(()=>analyzeGopBoundaries(changed.bytes),/H264_AAC_REQUIRED/);
  let calls=0;const owner=createGopStream({...budgets,onInterval:()=>calls++});
  assert.throws(()=>deliver(owner,changed.bytes),/H264_SPS_INVALID/);
  assert.equal(calls,0);assert.equal(owner.stats().retainedBytes,0);
});

test('generation callbacks cannot abort then emit, or replace the final owner then report success',()=>{
  for(const threshold of [0,baseline.cuts[0]]){
    let calls=0;let owner;
    owner=createGopStream({...budgets,isCurrent:()=>{if(owner.stats().received>=threshold)owner.abort();return true;},onInterval:()=>calls++});
    assert.throws(()=>deliver(owner,input),/STREAM_ABORTED_DURING_CHECK/);
    assert.equal(calls,0);assert.equal(owner.stats().state,'aborted');assert.equal(owner.stats().retainedBytes,0);
  }
  let active=1;
  const owner=createGopStream({...budgets,generation:1,isCurrent:g=>g===active,onInterval:item=>{if(item.final)active=2;}});
  deliver(owner,input);
  assert.throws(()=>owner.finish({sourceSize:input.length}),/GENERATION_STALE/);
  assert.equal(owner.stats().state,'failed');assert.equal(owner.stats().retainedBytes,0);
});
