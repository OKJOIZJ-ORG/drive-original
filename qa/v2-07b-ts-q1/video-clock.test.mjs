import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVideoClock,videoGopTiming} from './video-clock.mjs';
const rows=Array.from({length:6},(_,i)=>({dts:126000+Math.floor(i*90000/21),pts:126000+Math.floor(i*90000/21)}));
test('rational frame clocks and independently phased windows preserve actual intervals',()=>{
 validateVideoClock(rows,{referenceStep:4285});
 validateVideoClock(rows.map(r=>({dts:r.dts+5,pts:r.pts+5})),{referenceStep:4285});
 const timing=videoGopTiming(rows,{referenceStep:4285,following:{dts:151714,pts:151714}});
 assert.equal(timing.endPts,151714);assert.equal(timing.endInferred,false);
});
test('duplicate, backwards, large gaps, excessive reordering and overlapping GOPs fail closed',()=>{
 for(const change of [r=>r[2].dts=r[1].dts,r=>r[2].dts-=100000,r=>r[2].dts+=100000,
  r=>r[2].pts=r[1].pts,r=>r[2].pts+=90000]){
  const copy=structuredClone(rows);change(copy);assert.throws(()=>validateVideoClock(copy,{referenceStep:4285}));
 }
 assert.throws(()=>videoGopTiming(rows,{referenceStep:4285,previousMaxPts:rows[0].pts}));
 assert.throws(()=>videoGopTiming(rows,{referenceStep:4285,following:{dts:151714,pts:rows.at(-1).pts}}));
});
