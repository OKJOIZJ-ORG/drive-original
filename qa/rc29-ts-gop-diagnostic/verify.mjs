import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {variant,shiftTimestamp} from '../v2-07b-ts-q1/synthetic-variants.mjs';
const factory=readFileSync(new URL('./factory.expression.js',import.meta.url),'utf8');
const api=(0,eval)(factory);
const run=(bytes,extra={})=>api.analyze({headBytes:new Uint8Array(bytes.subarray(0,524144)),
  tailBytes:new Uint8Array(bytes.subarray(Math.max(0,bytes.length-524144))),sourceSize:bytes.length,
  tailOffset:Math.max(0,bytes.length-524144),headAtEof:bytes.length<=524144,tailAtEof:true,
  version:api.binding.version,sourceCommit:api.binding.sourceCommit,...extra});
const fixture=readFileSync(new URL('../v2-07b-ts-q1/synthetic-bframes-audiolead.ts',import.meta.url));

test('fully serialized clean fixture reaches canonical startup success without I/O',async()=>{
  const r=await run(fixture);assert.equal(r.code,'CANONICAL_STARTUP_PLAN_PASS');
  assert.equal(r.tail.failedGopCount,0);assert.equal(r.head.canonicalClockPass,true);
  assert.equal(r.referenceStepTicks,3000);
  const json=JSON.stringify(r);
  for(const s of ['payload','sps','pps','offset','126000','http','Bearer'])assert.equal(json.includes(s),false,s);
  assert.ok(!/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|console)\b/.test(factory));
});

for(const count of [1,2])test(`short EOF ${count} frame GOP isolated from clock faults`,async()=>{
  const bytes=variant(records=>records.filter(r=>r.videoIndex===undefined||r.videoIndex<180+count)).bytes;
  const r=await run(bytes),g=r.tail.lastGop;
  assert.equal(r.code,'SEEK_GOP_PRESENTATION_UNPROVEN');assert.equal(g.frameCount,count);
  assert.equal(g.atEof,true);assert.equal(g.canonicalClockPass,true);
  assert.equal(g.idrIsMinimumPts,true);assert.equal(g.canonicalTimingPass,false);
  assert.equal(r.tail.uniquePts,true);assert.equal(r.tail.failedGopCount,1);
});

test('IDR not minimum PTS is separately identifiable with otherwise valid clock',async()=>{
  const bytes=variant(records=>{const r=records.find(r=>r.videoIndex===301);shiftTimestamp(r.data,9,-10500);}).bytes;
  const r=await run(bytes);assert.equal(r.code,'SEEK_GOP_PRESENTATION_UNPROVEN');
  assert.equal(r.tail.lastGop.idrIsMinimumPts,false);assert.equal(r.tail.canonicalClockPass,true);
});

test('following GOP overlap distinct from duplicate clocks',async()=>{
  const bytes=variant(records=>{const r=records.find(r=>r.videoIndex===299);shiftTimestamp(r.data,9,10500);}).bytes;
  const r=await run(bytes);assert.equal(r.code,'SEEK_GOP_PRESENTATION_UNPROVEN');
  assert.ok(r.tail.failedGops.some(g=>!g.followingPtsAfterMaximum));assert.equal(r.tail.uniquePts,true);
});

test('duplicate PTS remains an earlier canonical clock rejection',async()=>{
  const bytes=variant(records=>{const r=records.find(r=>r.videoIndex===181);shiftTimestamp(r.data,9,-9000);}).bytes;
  const r=await run(bytes);assert.equal(r.code,'SEEK_VIDEO_CLOCK_UNPROVEN');assert.equal(r.tail.uniquePts,false);
});

test('syntax failure stops before timing diagnosis',async()=>{
  const bytes=variant(records=>{records.find(r=>r.videoIndex===359).data[0]=1;}).bytes;
  const r=await run(bytes);assert.equal(r.code,'WINDOW_SYNTAX_REJECTED');assert.equal(r.stage,'tail-syntax');
  assert.equal(r.tail,undefined);
});

test('bad binding, budgets, exact EOF and same-window conflicts rejected',async()=>{
  assert.equal((await run(fixture,{version:'wrong'})).code,'FIXED29_BINDING_REQUIRED');
  for(const extra of [{tailAtEof:false},{headAtEof:true},{tailOffset:0},{sourceSize:fixture.length+1},
    {headBytes:new Uint8Array(1024*1024)}])assert.equal((await run(fixture,extra)).code,'TWO_BOUNDED_EDGE_WINDOWS_REQUIRED');
  const small=variant(records=>records.filter(r=>r.videoIndex===undefined||r.videoIndex<2)).bytes;
  if(small.length<=524144){const tail=new Uint8Array(small);tail[0]^=1;
    assert.equal((await run(small,{tailBytes:tail})).code,'SAME_WINDOW_CONFLICT');}
});
