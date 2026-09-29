import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {fixture} from './general-q1-fixture.mjs';
import {inspectGeneralMoov} from '../media/general-admission.mjs';
import {createGeneralSource} from '../media/general-source.mjs';
import {streamGeneralQ1} from '../media/general-pipeline.mjs';
import {startGeneralWorker} from '../media/general-owner.mjs';
import {Input,BufferSource,MP4,EncodedPacketSink,EncodedVideoPacketSource,Output,Mp4OutputFormat,BufferTarget} from '../media/mediabunny-q1.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function source(bytes=fixture){let active=0,closed=false,aborts=0;return{identity:{size:bytes.length},async read({start,end}){assert.equal(closed,false);active++;try{return bytes.slice(start,end+1);}finally{active--; }},async abort(){closed=true;aborts++;return{settled:active===0};},stats:()=>({active,closed,aborts})};}
const moov=data=>{for(let p=0;p<data.length;){const size=new DataView(data.buffer,data.byteOffset+p).getUint32(0);if(Buffer.from(data.subarray(p+4,p+8)).toString()==='moov')return data.slice(p,p+size);p+=size;}throw Error('fixture moov missing');};
const patchCount=(type,value)=>{const b=fixture.slice(),p=Buffer.from(b).indexOf(Buffer.from(type));assert.ok(p>0);new DataView(b.buffer).setUint32(p+12,value);return b;};
test('preflight rejects expanded stts and ctts counts before worker window or packet reads',async()=>{
 assert.deepEqual(inspectGeneralMoov(moov(fixture)).samples,[8]);
 for(const type of ['stts','ctts']){const bytes=patchCount(type,0xffffffff);assert.throws(()=>inspectGeneralMoov(moov(bytes)),/GENERAL_EXPANDED_INDEX_LIMIT/);const s=source(bytes);let window=false;await assert.rejects(streamGeneralQ1({source:s,onWindow(){window=true;},onChunk(){assert.fail('hostile input produced output');}}),/GENERAL_EXPANDED_INDEX_LIMIT/);assert.equal(window,false);assert.equal(s.stats().closed,true);}
});
test('strict admission rejects changed codec and external data reference',()=>{
 const codec=fixture.slice(),c=Buffer.from(codec).lastIndexOf(Buffer.from('avc1'));codec.set(Buffer.from('encv'),c);assert.throws(()=>inspectGeneralMoov(moov(codec)),/GENERAL_CODEC_UNQUALIFIED/);
 const external=fixture.slice(),u=Buffer.from(external).indexOf(Buffer.from('url '));external[u+7]=0;assert.throws(()=>inspectGeneralMoov(moov(external)),/GENERAL_EXTERNAL_REFERENCE_UNQUALIFIED/);
});
test('bounded original bytes seek from RAP and chunk batches preserve source clocks without encoders',async()=>{
 const s=source();let pending=0,peak=0,total=0,batch=0,window;const clocks=[];const result=await streamGeneralQ1({source:s,targetTime:1.35,onWindow:w=>window=w,onChunk:async c=>{pending++;peak=Math.max(peak,pending);assert.equal(c.position,total);assert.ok(c.bytes.length<=262144);total+=c.bytes.length;batch+=c.bytes.length;if(c.batchEnd){assert.equal(batch,c.batchSize);batch=0;}await wait(1);pending--;},onPacket:p=>clocks.push([p.packet.timestamp,p.packet.sideData.q1Dts])});
 assert.deepEqual(clocks,[[1,.5],[1.75,.75],[1.25,1],[1.5,1.25]]);assert.equal(peak,1);assert.equal(batch,0);assert.ok(window.windowOrigin<=1.35);assert.equal(result.encodersCreated,0);assert.equal(result.cleanup.settled,true);assert.equal(result.muxRetention.bytes,0);assert.equal(result.muxRetention.samples,0);assert.ok(result.reads.peakCache<=262144);
});
test('read timeout closes source and drain; consumer cancellation terminates exactly one worker',async()=>{
 let release;const stalled={identity:{size:fixture.length},read:()=>new Promise(r=>release=r),abort:async()=>{release?.(fixture.slice());return{settled:true};}};const rpc=createGeneralSource(stalled,{readTimeoutMs:10});await assert.rejects(rpc.request(0,fixture.length),/GENERAL_READ_TIMEOUT/);assert.equal((await rpc.cleanup()).settled,true);
 const s=source();let resolveEntered;const entered=new Promise(r=>resolveEntered=r);let created=0,consumerClosed=false;
 const job=startGeneralWorker({source:s,generation:1,workerFactory:url=>{created++;return new Worker(url);},onChunk:({signal})=>new Promise(resolve=>{resolveEntered();signal.addEventListener('abort',()=>{consumerClosed=true;resolve();},{once:true});})});await entered;await wait(60);assert.equal(job.metrics.pendingChunks,1);assert.equal(job.metrics.chunks,1);const terminal=await job.cancel();assert.equal(terminal.transportCleanup.settled,true);assert.equal(terminal.transportCleanup.workerTerminated,true);assert.equal(consumerClosed,true);assert.equal(created,1);assert.equal(job.metrics.peakPendingChunks,1);
});
test('original source fault settles worker and does not leak private error text',async()=>{
 const s=source();s.read=async()=>{throw Error('private account material');};const job=startGeneralWorker({source:s,generation:3,workerFactory:url=>new Worker(url),onChunk(){assert.fail('unexpected chunk');}});const result=await job.done;assert.equal(result.transportCleanup.settled,true);assert.equal(JSON.stringify(result).includes('private account material'),false);assert.ok(result.error);
});
test('streaming throughput exceeds former lifetime caps with bounded fragment retention',async()=>{
 const input=new Input({source:new BufferSource(fixture),formats:[MP4]}),track=await input.getPrimaryVideoTrack(),config=await track.getDecoderConfig(),packet=await new EncodedPacketSink(track).getFirstPacket();
 const target=new BufferTarget(),out=new Output({target,format:new Mp4OutputFormat()}),v=new EncodedVideoPacketSource('avc');out.addVideoTrack(v);await out.start();const count=14000;
 for(let i=0;i<count;i++)await v.add(packet.clone({timestamp:i/30,duration:1/30,sideData:{}}),i?undefined:{decoderConfig:config});await out.finalize();input.dispose();
 let total=0;const r=await streamGeneralQ1({source:source(new Uint8Array(target.buffer)),onChunk:c=>{total+=c.bytes.length;}});assert.ok(r.packets>10000);assert.ok(total>8*1024*1024);assert.equal(r.packets,count);assert.equal(r.outputBytes,total);assert.ok(r.muxRetention.peakBytes<=4*1024*1024);assert.ok(r.muxRetention.peakSamples<=4096);assert.equal(r.muxRetention.bytes,0);assert.equal(r.muxRetention.samples,0);assert.equal(r.cleanup.settled,true);
});
import {createAvcPacketGuard} from '../media/general-codec.mjs';
test('in-band AVC configuration change is rejected while original parameter bytes pass',async()=>{
 const input=new Input({source:new BufferSource(fixture),formats:[MP4]}),track=await input.getPrimaryVideoTrack(),config=await track.getDecoderConfig(),guard=createAvcPacketGuard(config,true),d=new Uint8Array(config.description),size=d[6]*256+d[7],unit=d.slice(8,8+size),packet=new Uint8Array(4+size);new DataView(packet.buffer).setUint32(0,size);packet.set(unit,4);guard({data:packet});packet[packet.length-1]^=1;assert.throws(()=>guard({data:packet}),/GENERAL_CONFIG_CHANGED/);input.dispose();
});
test('duplicate allocation-driving tables reject before expansion',()=>{
 const box=(name,...parts)=>{const body=Buffer.concat(parts),b=Buffer.alloc(8+body.length);b.writeUInt32BE(b.length);b.write(name,4);body.copy(b,8);return b;};const row=Buffer.alloc(16);row.writeUInt32BE(1,4);row.writeUInt32BE(1,8);row.writeUInt32BE(1,12);const table=box('stts',row);assert.throws(()=>inspectGeneralMoov(box('moov',box('trak',table,table))),/GENERAL_DUPLICATE_TABLE/);
});
