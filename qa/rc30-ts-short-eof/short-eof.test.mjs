import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {shortEof} from './fixture.mjs';
import {probeTsSeek} from '../v2-07b-ts-q1/ts-seek.mjs';
import {createSeekBootstrap} from '../v2-07b-ts-q1/seek-bootstrap.mjs';
import {createTransmuxSession} from '../v2-07b-ts-q1/transmux-session.mjs';
const {Transmuxer}=createRequire(import.meta.url)('../v2-07b-ts-q1/node_modules/mux.js/dist/mux-mp4.min.js');
export function transmux(bytes){
  let session;const chunks=[];session=createTransmuxSession({generation:1,sourceSize:bytes.length,Transmuxer,send(message){
    if(message.type==='fragment'){chunks.push(Buffer.from(message.bytes));session.receive({type:'ack',generation:1,fragmentSequence:message.fragmentSequence});}
  }});
  for(let offset=0,sequence=1;offset<bytes.length;offset+=65536,sequence++)session.receive({type:'input',generation:1,sequence,offset,bytes:Uint8Array.from(bytes.subarray(offset,offset+65536)).buffer});
  session.receive({type:'eof',generation:1});assert.equal(session.stats().state,'finished',JSON.stringify(session.stats()));
  return {bytes:Buffer.concat(chunks),stats:session.stats()};
}
for(const count of [1,2])test(`${count}-frame true EOF admits startup/end seek and continuous suffix with original last picture`,async()=>{
  const source=shortEof(count);
  const read=async({start,end})=>source.subarray(start,end+1);
  for(const positionSeconds of [0,1e6]){
    const plan=await probeTsSeek({sourceSize:source.length,positionSeconds,read});
    assert.equal(plan.timeline.globalContinuityVerified,false);assert.equal(plan.timeline.finalVideoDurationInferred,true);
    assert.ok(plan.local.before.pts<=plan.targetTicks&&plan.local.after.pts>=plan.targetTicks);
    if(positionSeconds){assert.equal(plan.local.videoFrames,60+count);assert.equal(plan.local.followingRap,null);}
    const bootstrap=createSeekBootstrap({headBytes:source.subarray(0,Math.floor(65536/188)*188),
      bytes:source.subarray(plan.local.windowStart,plan.local.windowEndExclusive),offset:plan.local.windowStart,plan});
    const chunks=[];for(let offset=bootstrap.readStart;offset<source.length;offset+=65536)chunks.push(bootstrap.push(source.subarray(offset,offset+65536),{offset,generation:1}));
    bootstrap.finish({sourceSize:source.length,generation:1});const suffix=Buffer.concat(chunks),result=transmux(suffix);
    assert.equal(result.stats.owner.elementary.videoFrames,positionSeconds?60+count:300+count);
    assert.equal(result.stats.muxReleased,true);assert.equal(result.stats.owner.retainedBytes,0);
  }
});
