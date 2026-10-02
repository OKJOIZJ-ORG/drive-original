import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {createGeneralPlayer} from '../media/general-player.mjs';
import {streamGeneralQ1} from '../media/general-pipeline.mjs';
import {streamGeneralQ2} from '../media/audio-general-pipeline.mjs';
import {streamGeneralQ3} from '../media/video-q3-pipeline.mjs';
import {startGeneralWorker} from '../media/general-owner.mjs';
import {Input,EncodedPacketSink} from '../media/mediabunny-q1.mjs';
import {resolveInitialPresentationTime} from '../media/general-timeline.mjs';
import createQ3Module from '../media/video-q3-codec.mjs';

const bytes=new Uint8Array(readFileSync(new URL('../qa/player-track-selection/combined.mp4',import.meta.url)));
function source(data=bytes){let closed=false,aborts=0;const reads=[];return {identity:{size:data.length,headRevisionId:'A'},reads,
  async read({start,end}){assert.equal(closed,false);reads.push([start,end]);return data.slice(start,end+1);},
  async abort(){closed=true;aborts++;return {settled:true};},stats:()=>({closed,aborts})};}

test('paused selected AAC3 normalized initial position reaches one worker generation at the requested movie clock',async()=>{
  const chunks=[];await streamGeneralQ1({source:source(),selectedAudioTrackId:3,onChunk:c=>chunks.push(c)});
  const saved={MS:globalThis.MediaSource,create:URL.createObjectURL,revoke:URL.revokeObjectURL};let media,workers=0,opens=0,plays=0;const starts=[],events=[];
  class SB extends EventTarget{constructor(){super();this.updating=false;this.buffered={length:1,start:()=>0,end:()=>8};}appendBuffer(){queueMicrotask(()=>this.dispatchEvent(new Event('updateend')));}abort(){}}
  class MS extends EventTarget{static isTypeSupported(){return true;}constructor(){super();this.readyState='open';}addSourceBuffer(){return new SB();}removeSourceBuffer(){}endOfStream(){}}
  class W extends EventTarget{postMessage(m){if(m.kind==='cancel'){queueMicrotask(()=>this.emit({kind:'terminal',error:{message:'GENERAL_CANCELLED'}}));return;}
    if(m.kind==='start'){starts.push(m);this.generation=m.generation;this.id=0;const t=m.initialPresentationTime===undefined?m.targetTime:2+m.initialPresentationTime;this.queue=[{kind:'window',value:{initialSourceTime:t,sourcePacketOrigin:2,policy:{presentationOrigin:2},windowOrigin:1.978667,sourceEndTimestamp:8,videoStartTimestamp:2,selectedAudioTrackId:3,videoConfig:{codec:'avc1.42c00a'}}},...chunks.map(c=>({kind:'chunk',buffer:c.bytes.slice().buffer,batchSize:c.batchSize,batchEnd:c.batchEnd}))];}
    if(m.kind==='start'||m.kind==='reply')queueMicrotask(()=>{const row=this.queue.shift();this.emit(row?{...row,id:++this.id}:{kind:'terminal',result:{videoCodec:'avc',encodersCreated:0}});});}
    emit(m){this.dispatchEvent(Object.assign(new Event('message'),{data:{generation:this.generation,...m}}));}terminate(){this.terminated=true;}}
  let now=0;const video=new EventTarget();Object.assign(video,{paused:true,disableRemotePlayback:false,getAttribute:()=>video.src,removeAttribute:()=>{video.src='';},pause(){this.paused=true;},play(){plays++;this.paused=false;return Promise.resolve();},load(){queueMicrotask(()=>media.dispatchEvent(new Event('sourceopen')));}});
  Object.defineProperty(video,'currentTime',{get:()=>now,set:v=>{now=v;queueMicrotask(()=>video.dispatchEvent(new Event('seeked')));}});
  globalThis.MediaSource=MS;URL.createObjectURL=m=>{media=m;return 'blob:initial-position-test';};URL.revokeObjectURL=()=>{};let player;
  try{player=createGeneralPlayer({video,selectedAudioTrackId:3,initialPresentationTime:0.75,autoplay:false,isCurrent:()=>true,openSource:async()=>{opens++;return source(Uint8Array.of(0));},workerFactory:()=>{workers++;return new W();},onEvent:e=>events.push(e)});
    const mapping=await player.ready;await player.completion();assert.equal(player.stats().failure,null);assert.equal(mapping.targetSource,2.75);assert.ok(Math.abs(mapping.targetElement-0.771333)<1e-8);assert.equal(starts[0].initialPresentationTime,0.75);assert.equal(starts[0].selectedAudioTrackId,3);assert.equal(workers,1);assert.equal(opens,1);assert.equal(player.stats().generation,1);assert.equal(plays,0);assert.equal(video.paused,true);assert.equal(events.filter(e=>e.type==='starting').length,1);
    await player.seek(3.5,{autoplay:true});await player.completion();assert.equal(starts[1].targetTime,3.5);assert.equal(starts[1].initialPresentationTime,undefined);assert.equal(player.stats().mapping.targetSource,3.5);assert.equal(player.stats().generation,2);assert.equal(plays,1);assert.equal(player.stats().failure,null);assert.equal((await player.dispose()).settled,true);
  }finally{await player?.dispose();globalThis.MediaSource=saved.MS;URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke;}
});

test('selected AAC3 initial snapshot preserves the absolute-seek packet window and zero snapshot retains AAC preroll',async()=>{
  const packets=[];let window;const s=source(),result=await streamGeneralQ1({source:s,selectedAudioTrackId:3,initialPresentationTime:0.75,onWindow:w=>window=w,onPacket:p=>packets.push([p.track,p.packet.timestamp,Buffer.from(p.packet.data)]),onChunk(){}});
  const absolute=[];await streamGeneralQ1({source:source(),selectedAudioTrackId:3,targetTime:0.75,onPacket:p=>absolute.push([p.track,p.packet.timestamp,Buffer.from(p.packet.data)]),onChunk(){}});
  assert.deepEqual(packets,absolute);assert.equal(window.initialSourceTime,0.75);assert.equal(window.selectedAudioTrackId,3);assert.equal(result.targetTime,0.75);assert.equal(result.encodersCreated,0);assert.equal(result.cleanup.settled,true);assert.equal(s.stats().aborts,1);
  await streamGeneralQ1({source:source(),selectedAudioTrackId:3,initialPresentationTime:0,onWindow:w=>window=w,onChunk(){}});assert.ok(window.windowOrigin<0,'full-start AAC preroll is preserved');assert.equal(window.policy.presentationOrigin,0);assert.equal(window.initialSourceTime,0);
});

test('selected source origin is resolved before Q1/Q2 RAP selection, with end clamp and unchanged absolute seek',async()=>{
  const first=Input.prototype.getFirstTimestamp,key=EncodedPacketSink.prototype.getKeyPacket;let selected,targets=[];
  Input.prototype.getFirstTimestamp=async function(tracks){selected=tracks.map(t=>t.id);return 2;};
  EncodedPacketSink.prototype.getKeyPacket=function(t,...args){targets.push(t);return key.call(this,t,...args);};
  try{
    for(const initialPresentationTime of [0.75,100]){let window;await streamGeneralQ1({source:source(),selectedAudioTrackId:3,timelinePolicy:false,initialPresentationTime,onWindow:w=>window=w,onChunk(){}});assert.deepEqual(selected,[1,3]);assert.equal(targets.at(-1),initialPresentationTime===100?5.999999:2.75);assert.equal(window.initialSourceTime,targets.at(-1));assert.equal(window.sourcePacketOrigin,2);}
    await streamGeneralQ1({source:source(),selectedAudioTrackId:3,timelinePolicy:false,targetTime:0.75,onChunk(){}});assert.equal(targets.at(-1),0.75);
    const ac3=new Uint8Array(readFileSync(new URL('../qa/q2-audio-compatibility/synthetic-avc-ac3.mp4',import.meta.url))),s=source(ac3);
    await assert.rejects(streamGeneralQ2({source:s,selectedAudioTrackId:2,timelinePolicy:false,initialPresentationTime:0.75,onChunk(){assert.fail('native gate still fails before output');}}),e=>e.message==='AUDIO_NATIVE_GATE_UNAVAILABLE'&&e.cleanup.settled===true);
    assert.deepEqual(selected,[1,2]);assert.equal(targets.at(-1),2.75);assert.equal(s.stats().aborts,1);
  }finally{Input.prototype.getFirstTimestamp=first;EncodedPacketSink.prototype.getKeyPacket=key;}
  assert.equal(resolveInitialPresentationTime(.75,{sourceOrigin:2,sourceEnd:8}),2.75);assert.equal(resolveInitialPresentationTime(100,{sourceOrigin:2,sourceEnd:8}),7.999999);assert.equal(resolveInitialPresentationTime(undefined,{sourceOrigin:2,sourceEnd:8},.75),.75);
});

test('invalid normalized initial options refuse all Q1/Q2/Q3 reads and player prelaunch work',async()=>{
  for(const value of [null,'1',NaN,Infinity,-1]){
    let opens=0;assert.throws(()=>createGeneralPlayer({initialPresentationTime:value,openSource:()=>opens++}),/TIMING_INITIAL_POSITION_INVALID/);assert.equal(opens,0);
    for(const stream of [streamGeneralQ1,streamGeneralQ2,streamGeneralQ3]){const s=source();await assert.rejects(stream({source:s,initialPresentationTime:value,onChunk(){assert.fail('output');}}),e=>e.message==='TIMING_INITIAL_POSITION_INVALID'&&e.cleanup.settled===true);assert.equal(s.reads.length,0);assert.equal(s.stats().aborts,1);}
  }
  assert.throws(()=>createGeneralPlayer({initialTime:2,initialPresentationTime:1}),/TIMING_INITIAL_POSITION_INVALID/);
  for(const stream of [streamGeneralQ1,streamGeneralQ2,streamGeneralQ3]){const s=source();await assert.rejects(stream({source:s,targetTime:2,initialPresentationTime:1,onChunk(){}}),/TIMING_INITIAL_POSITION_INVALID/);assert.equal(s.reads.length,0);assert.equal(s.stats().aborts,1);}
  assert.throws(()=>resolveInitialPresentationTime(1,{sourceOrigin:2,sourceEnd:2}),/TIMING_INITIAL_POSITION_OUTSIDE/);
});

test('real Q1 worker transports initial snapshot once and cancellation suppresses later window/output',async()=>{
  const s=source();let window,workers=0;const job=startGeneralWorker({source:s,generation:1,selectedAudioTrackId:3,initialPresentationTime:2.75,workerFactory:u=>{workers++;return new Worker(u);},onWindow:w=>window=w,onChunk(){}});
  const result=await job.done;assert.equal(result.error,undefined);assert.equal(window.initialSourceTime,2.75);assert.equal(window.selectedAudioTrackId,3);assert.equal(result.result.targetTime,2.75);assert.equal(workers,1);assert.equal(result.transportCleanup.settled,true);assert.equal(s.stats().aborts,1);
  let entered,release;const reading=new Promise(r=>entered=r),body=new Promise(r=>release=r);const pendingSource=source();pendingSource.read=()=>{entered();return body;};pendingSource.abort=async()=>{release(bytes.slice(0,65536));return {settled:true};};
  const controller=new AbortController(),cancelled=startGeneralWorker({source:pendingSource,generation:2,signal:controller.signal,initialPresentationTime:2.75,workerFactory:u=>new Worker(u),onWindow(){assert.fail('cancelled window');},onChunk(){assert.fail('cancelled output');}});await reading;controller.abort();const closed=await cancelled.done;assert.equal(closed.transportCleanup.settled,true);assert.equal(closed.metrics.activeReads,0);assert.equal(closed.metrics.terminated,true);
});

test('Q3 initial snapshot clamps once before RAP decoding and cleans every owned resource',async()=>{
  const data=new Uint8Array(readFileSync(new URL('../qa/q3-browser-execution/synthetic-mpeg4.mp4',import.meta.url))),s=source(data);let window,closed=0,frames=0,firstTimestamp;
  const originalChunk=globalThis.EncodedVideoChunk;class Chunk{constructor(options){Object.assign(this,options);this.byteLength=1;}copyTo(to){to.set(Uint8Array.of(0));}}globalThis.EncodedVideoChunk=Chunk;
  class Frame{constructor(bytes,options){Object.assign(this,options);frames++;}close(){closed++;}}
  class Encoder{static async isConfigSupported(){return {supported:true};}constructor(callbacks){this.callbacks=callbacks;this.state='configured';this.encodeQueueSize=0;}configure(c){this.config=c;}encode(f,{keyFrame}){firstTimestamp??=f.timestamp;this.callbacks.output(new Chunk({type:keyFrame?'key':'delta',timestamp:f.timestamp,duration:f.duration}),{decoderConfig:{codec:this.config.codec,codedWidth:320,codedHeight:180,colorSpace:f.colorSpace}});}async flush(){}close(){this.state='closed';}}
  const scope={VideoDecoder:{isConfigSupported:async()=>({supported:false})},VideoEncoder:Encoder,VideoFrame:Frame,MediaSource:{isTypeSupported:()=>true}};
  let result;try{result=await streamGeneralQ3({source:s,initialPresentationTime:100,scope,loadModule:()=>createQ3Module({wasmBinary:readFileSync(new URL('../media/video-q3-codec.wasm',import.meta.url))}),onWindow:w=>window=w,onChunk(){}});}finally{if(originalChunk===undefined)delete globalThis.EncodedVideoChunk;else globalThis.EncodedVideoChunk=originalChunk;}
  assert.equal(window.initialSourceTime,2.999999);assert.equal(result.targetTime,2.999999);assert.equal(firstTimestamp,2000000);assert.equal(window.videoStartTimestamp,2);assert.equal(frames,24);assert.equal(closed,frames);assert.equal(result.metrics.closed,true);assert.equal(result.cleanup.settled,true);assert.equal(s.stats().aborts,1);
});
