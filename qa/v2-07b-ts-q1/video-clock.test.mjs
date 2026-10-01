import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVideoClock,videoGopTiming,videoSeekGroups} from './video-clock.mjs';
const rows=Array.from({length:6},(_,i)=>({dts:126000+Math.floor(i*90000/21),pts:126000+Math.floor(i*90000/21)}));
test('rational frame clocks and independently phased windows preserve actual intervals',()=>{
 validateVideoClock(rows,{referenceStep:4285});
 validateVideoClock(rows.map(r=>({dts:r.dts+5,pts:r.pts+5})),{referenceStep:4285});
 const timing=videoGopTiming(rows,{referenceStep:4285,following:{dts:151714,pts:151714}});
 assert.equal(timing.endPts,151714);assert.equal(timing.endInferred,false);
});
test('short true EOF requires observed adjacent interval and preserves strict clocks',()=>{
 const singleton=[{dts:15000,pts:18000,idr:true}];
 const timing=videoGopTiming(singleton,{referenceStep:3000,previousDts:12000,atEof:true});
 assert.equal(timing.endPts,21000);assert.equal(timing.lastDtsInterval,3000);assert.equal(timing.endInferred,true);
 assert.deepEqual(timing.presentation,singleton);
 for(const options of [{},{atEof:true},{previousDts:12000},{atEof:true,previousDts:15000},
  {atEof:true,previousDts:12000,following:{dts:18000,pts:21000}}])
  assert.throws(()=>videoGopTiming(singleton,{referenceStep:3000,...options}));
 for(const following of [null,{dts:21000,pts:24000}])assert.throws(()=>videoGopTiming([...singleton,{dts:18000,pts:21000}],{referenceStep:3000,following}));
 for(const second of [{dts:15000,pts:21000},{dts:18000,pts:18000},{dts:18000,pts:17000},{dts:18000,pts:100000}])
  assert.throws(()=>videoGopTiming([...singleton,second],{referenceStep:3000,previousDts:12000,atEof:true}));
});
test('short EOF seeks retain bounded preceding RAP without invented presentation anchors',()=>{
 const frames=[0,1,2,3].map(i=>({dts:12000+3000*i,pts:18000+3000*i,idr:i===0||i===3}));
 const groups=videoSeekGroups(frames,{referenceStep:3000,atEof:true});
 assert.equal(groups.length,1);assert.equal(groups[0].rows.length,4);assert.equal(groups[0].following,null);
 assert.deepEqual(groups[0].presentation,frames);assert.equal(groups[0].endPts,30000);
 assert.equal(videoSeekGroups(frames,{referenceStep:3000,atEof:false})[0].rows.length,3);
 assert.equal(videoSeekGroups(frames.slice(1),{referenceStep:3000,atEof:true}).length,0);
 assert.throws(()=>videoSeekGroups([{dts:12000,pts:18000,idr:true},{dts:15000,pts:21000,idr:true}],{referenceStep:3000,atEof:true}));
});
test('duplicate, backwards, large gaps, excessive reordering and overlapping GOPs fail closed',()=>{
 for(const change of [r=>r[2].dts=r[1].dts,r=>r[2].dts-=100000,r=>r[2].dts+=100000,
  r=>r[2].pts=r[1].pts,r=>r[2].pts+=90000]){
  const copy=structuredClone(rows);change(copy);assert.throws(()=>validateVideoClock(copy,{referenceStep:4285}));
 }
 assert.throws(()=>videoGopTiming(rows,{referenceStep:4285,previousMaxPts:rows[0].pts}));
 assert.throws(()=>videoGopTiming(rows,{referenceStep:4285,following:{dts:151714,pts:rows.at(-1).pts}}));
});
