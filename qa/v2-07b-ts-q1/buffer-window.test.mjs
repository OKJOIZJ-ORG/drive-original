import test from 'node:test';
import assert from 'node:assert/strict';
import { createBufferWindow } from './buffer-window.mjs';

test('forward admission uses high/low hysteresis and includes disconnected future islands',()=>{
  const window=createBufferWindow();
  assert.equal(window.plan([],0).wait,false);
  assert.equal(window.plan([[1,7]],1).wait,true);
  assert.equal(window.plan([[1,7]],2).wait,true);
  assert.equal(window.plan([[1,7]],3).wait,false);
  assert.equal(window.plan([[1,7]],2).wait,false);
  assert.equal(window.plan([[1,2],[10,12]],1).wait,true);
  assert.equal(window.plan([],20).wait,false);
});
test('removal retains the requested behind window and avoids repeated sub-step removals',()=>{
  const window=createBufferWindow();
  assert.equal(window.plan([[1,15]],7).removeEnd,null);
  assert.equal(window.plan([[1,15]],8).removeEnd,2);
  assert.equal(window.plan([[3,15]],9.5).removeEnd,null);
  assert.equal(window.plan([[3,15]],10).removeEnd,4);
  assert.equal(window.plan([[3,15]],30).removeEnd,15);
  assert.deepEqual(window.plan([],10),{wait:false,ahead:0,span:0,start:null,end:null,removeEnd:null});
});
test('malformed bounds, non-finite or overlapping ranges never grant admission',()=>{
  for(const options of [{low:0},{high:4},{behind:-1},{removeStep:7},{high:Infinity}])
    assert.throws(()=>createBufferWindow(options),/^Error: BUFFER_WINDOW_OPTIONS$/);
  const window=createBufferWindow();
  for(const ranges of [[[0,Infinity]],[[1,1]],[[3,4],[1,2]],[[1,4],[3,5]],[[1,2],[2,3]],[[0,1,2]],Array(17).fill([0,1])])
    assert.throws(()=>window.plan(ranges,0),/^Error: BUFFER_WINDOW_(RANGES|SNAPSHOT)$/);
  assert.throws(()=>window.plan([],NaN),/^Error: BUFFER_WINDOW_SNAPSHOT$/);
});
