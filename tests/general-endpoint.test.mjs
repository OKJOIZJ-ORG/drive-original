import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './general-q1-fixture.mjs';
import {resolveGeneralEndpointTarget} from '../media/general-player.mjs';
import {streamGeneralQ1} from '../media/general-pipeline.mjs';

const last={timestamp:5.958333333333333,duration:1/24,endTimestamp:6};
const mapping=target=>({sourceOrigin:0,sourceEnd:6,commonShift:0,targetSource:target,targetElement:target});
test('terminal native endpoint requires that exact original last frame in an actual buffered interval',()=>{
 for(const target of [5.999999,6]){
  const result=resolveGeneralEndpointTarget(mapping(target),last,[[4.992,5.999999]]);
  assert.equal(result.requestedSource,target);assert.equal(result.targetSource,last.timestamp);assert.equal(result.targetElement,last.timestamp);
  assert.deepEqual(result.frame,last);assert.deepEqual(result.bufferedRange,[4.992,5.999999]);assert.equal(result.reason,'terminal-original-frame');
 }
 assert.equal(resolveGeneralEndpointTarget(mapping(5.98),last,[[4.992,5.999999]]),null,'already buffered target stays exact');
 assert.equal(resolveGeneralEndpointTarget(mapping(6),last,[]),null);
 assert.equal(resolveGeneralEndpointTarget(mapping(6),last,[[4.992,last.timestamp]]),null,'exclusive endpoint cannot prove retained last frame');
 assert.equal(resolveGeneralEndpointTarget(mapping(6),last,[[5.98,5.999999]]),null,'a later range cannot substitute a different frame');
 assert.equal(resolveGeneralEndpointTarget(mapping(6),null,[[4.992,5.999999]]),null,'no original packet evidence');
});
test('interior gaps, earlier frames, invalid clocks and out-of-source values never become endpoint success',()=>{
 for(const target of [0,4,5.5,6.000001,Infinity,NaN])assert.equal(resolveGeneralEndpointTarget(mapping(target),last,[[4.992,5.999999]]),null);
 const earlier={timestamp:4,duration:.04,endTimestamp:4.04};
 for(const target of [5.999999,6])assert.equal(resolveGeneralEndpointTarget(mapping(target),earlier,[[3,4.04]]),null,'movie/audio end cannot extend the final video frame into a missing tail');
 for(const frame of [{...last,duration:0},{...last,duration:Infinity},{...last,endTimestamp:7},{...last,timestamp:6},{...last,timestamp:NaN}])assert.equal(resolveGeneralEndpointTarget(mapping(6),frame,[[4.992,5.999999]]),null);
 assert.equal(resolveGeneralEndpointTarget({...mapping(6),sourceOrigin:5.99},last,[[4.992,5.999999]]),null,'pre-presentation packet is ineligible');
});
test('common source/element translation is retained rather than inventing a new clock',()=>{
 const translated={sourceOrigin:10,sourceEnd:16,commonShift:10,targetSource:16,targetElement:6},frame={timestamp:15.958333333333334,duration:1/24,endTimestamp:16};
 const result=resolveGeneralEndpointTarget(translated,frame,[[4.992,5.999999]]);
 assert.equal(result.requestedSource,16);assert.equal(result.targetSource,frame.timestamp);assert.equal(result.targetElement,frame.timestamp-10);
});
test('Q1 terminal evidence chooses maximum eligible presentation PTS, independent of B-frame decode order, with no extra reads',async()=>{
 const reads=[];let aborts=0;const source={identity:{size:fixture.length},async read({start,end}){reads.push([start,end]);return fixture.slice(start,end+1);},async abort(){aborts++;return {settled:true};}};
 const presentation=[];const result=await streamGeneralQ1({source,targetTime:1.35,onPacket:({track,sourcePacket})=>{if(track==='video')presentation.push(sourcePacket.timestamp);},onChunk(){}});
 assert.deepEqual(presentation,[1,1.75,1.25,1.5]);assert.deepEqual(result.lastVideoFrame,{timestamp:1.75,duration:.25,endTimestamp:2});
 assert.equal(result.encodersCreated,0);assert.equal(result.cleanup.settled,true);assert.equal(aborts,1);assert.deepEqual(reads,[[0,fixture.length-1]]);
});
