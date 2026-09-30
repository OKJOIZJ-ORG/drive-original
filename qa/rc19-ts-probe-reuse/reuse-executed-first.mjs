import test from 'node:test';
import assert from 'node:assert/strict';
import {boundary,fixture} from './boundary-harness.mjs';
import {probeTsSeek} from '../v2-07b-ts-q1/ts-seek.mjs';
import {createSeekBootstrap} from '../v2-07b-ts-q1/seek-bootstrap.mjs';

const options={sourceSize:fixture.length,positionSeconds:5,read:async({start,end})=>fixture.subarray(start,end+1)};
test('same-reader generation consumes admitted probe input with2 fewerRanges/4 fewerMetadata',async()=>{
  const result=await boundary();assert.equal(result.rangeCount,2);assert.equal(result.metaCount,5);
  assert.equal(result.constructions,1);assert.equal(result.state.probeInputReused,true);
  assert(result.sources.every(s=>s.cleanupSettled));assert.equal(result.state.bootstrap.state,'aborted');
});
test('reader replacement during503 discovery falls back to original fresh bootstrap reads',async()=>{
  const result=await boundary({fault:'503'});assert.equal(result.sources.length,2);
  assert.equal(result.rangeCount,5);assert.equal(result.metaCount,11);assert.equal(result.constructions,1);
  assert.equal(result.state.probeInputReused,false);assert.equal(result.state.recovery.completed,true);
  const ranges=result.log.filter(row=>row.stage==='range');
  assert.equal(ranges[3].start,0);assert.equal(ranges[3].source,1);assert.equal(ranges[4].source,1);
  assert(result.sources.every(s=>s.cleanupSettled));
});
test('failed permission/content fence or cancelled owner exposes no input/MSE generation',async()=>{
  for(const fault of ['permission','drift','cancel']){
    const result=await boundary({fault});assert.equal(result.constructions,0,fault);
    assert.notEqual(result.state.probeInputReused,true);assert(result.sources.every(s=>s.cleanupSettled));
    assert.equal(result.state.disposed,true);assert(result.state.failure || result.state.phase==='cancelled');
  }
});
test('admitted input makes byte-identical bootstrap output and metadata-only plan',async()=>{
  const ordinary=await probeTsSeek(options);let reused;
  const plan=await probeTsSeek({...options,onInput:input=>{reused=createSeekBootstrap({...input,generation:1});}});
  assert.deepEqual(plan,ordinary);assert.equal(JSON.stringify(plan),JSON.stringify(ordinary));
  const fresh=createSeekBootstrap({plan,offset:plan.local.windowStart,headBytes:fixture.subarray(0,Math.floor(65536/188)*188),
    bytes:fixture.subarray(plan.local.windowStart,plan.local.windowEndExclusive),generation:1});
  assert.equal(reused.readStart,fresh.readStart);assert.equal(reused.outputSize,fresh.outputSize);
  for(let offset=fresh.readStart;offset<fixture.length;offset+=65536){
    const chunk=fixture.subarray(offset,offset+65536),request={offset,generation:1};
    assert.deepEqual(reused.push(chunk,request),fresh.push(chunk,request));
  }
  reused.finish({sourceSize:fixture.length,generation:1});fresh.finish({sourceSize:fixture.length,generation:1});
  assert.deepEqual(reused.stats(),fresh.stats());
});
test('no input handoff on failed probe; consumer failure/async misuse fails closed',async()=>{
  let calls=0;
  await assert.rejects(probeTsSeek({...options,maxWindows:1,onInput:()=>{calls++;}}),/SEEK_WINDOW_BUDGET/);
  assert.equal(calls,0);
  await assert.rejects(probeTsSeek({...options,onInput:()=>{throw new Error('QA_CONSUMER_STOP');}}),/QA_CONSUMER_STOP/);
  await assert.rejects(probeTsSeek({...options,onInput:()=>Promise.resolve()}),/SEEK_INPUT_CALLBACK/);
  const plan=await probeTsSeek(options);assert.equal(plan.windows.length,2);
});
test('separate probes/seek generations reread and do not retain consumer arrays in returned plan',async()=>{
  const ranges=[],inputs=[];
  const read=async({start,end})=>{ranges.push({start,end});return fixture.subarray(start,end+1);};
  for(let generation=1;generation<=2;generation++){
    await probeTsSeek({...options,read,onInput:input=>{inputs.push({head:input.headBytes,chosen:input.bytes});}});
  }
  assert.equal(ranges.length,4);assert.deepEqual(ranges.slice(0,2),ranges.slice(2));
  assert.notEqual(inputs[0].head.buffer,inputs[1].head.buffer);
  assert.notEqual(inputs[0].chosen.buffer,inputs[1].chosen.buffer);
  const original=fixture[0];inputs[0].head[0]=0;assert.equal(fixture[0],original);assert.equal(inputs[1].head[0],original);
});
