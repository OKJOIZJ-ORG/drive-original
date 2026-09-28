import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnoseTsClock} from './clock-diagnostic.mjs';
import {variant,shiftTimestamp} from './synthetic-variants.mjs';
const fixture=readFileSync(new URL('./synthetic-bframes-audiolead.ts',import.meta.url));
const run=(bytes,overrides={})=>diagnoseTsClock({sourceSize:bytes.length,read:async({start,end})=>bytes.subarray(start,end+1),isCurrent:()=>true,...overrides});
test('clock diagnostic is two bounded samples and reports no false violations for known CFR',async()=>{
 const result=await run(fixture);assert.ok(result.reads<=2);assert.ok(result.bytesRead<=1048288);
 assert.equal(result.head.headStep,3000);assert.deepEqual(result.head.violations,[]);assert.deepEqual(result.tail.violations,[]);
 assert.equal(result.tail.dtsDeltas.distinct,1);assert.ok(!JSON.stringify(result).includes('sps'));
});
test('diagnostic distinguishes tail presentation phase drift from decode cadence change',async()=>{
 const bytes=variant(records=>{for(const row of records)if(row.videoIndex>=180)shiftTimestamp(row.data,9,1500);}).bytes;
 const result=await run(bytes);assert.equal(result.tail.dtsDeltas.distinct,1);
 assert.ok(result.tail.violations.some(row=>row.reasons.includes('pts-phase')));
});
test('stale ownership or short ranges fail before further reads',async()=>{
 let current=true,calls=0;
 await assert.rejects(run(fixture,{isCurrent:()=>current,read:async({start,end})=>{calls++;current=false;return fixture.subarray(start,end+1);}}),/CLOCK_STALE/);
 assert.equal(calls,1);await assert.rejects(run(fixture,{read:async()=>new Uint8Array(188)}),/CLOCK_READ_LENGTH/);
});
