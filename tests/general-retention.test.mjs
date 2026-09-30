import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeneralRapIndex,createGeneralPlayer} from '../media/general-player.mjs';
import {streamGeneralQ1} from '../media/general-pipeline.mjs';
import {fixture} from './general-q1-fixture.mjs';
const cat=(...a)=>new Uint8Array(Buffer.concat(a.map(x=>Buffer.from(x))));
const word=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n);return b;};
const box=(type,...data)=>{const b=cat(...data);return cat(word(b.length+8),Buffer.from(type),b);};
const init=()=>box('moov',box('trak',box('tkhd',word(0),word(0),word(0),word(1)),box('mdia',box('mdhd',word(0),word(0),word(0),word(12000)),box('hdlr',word(0),word(0),Buffer.from('vide')))),box('mvex',box('trex',word(0),word(1),word(1),word(1000),word(1),word(0x02000000))));
const fragment=(time,{cto=0,flags=0x02000000}={})=>cat(box('moof',box('traf',box('tfhd',word(0),word(1)),box('tfdt',word(0),word(Math.round(time*12000)-cto)),box('trun',word(0x01000c00),word(1),word(flags),word(cto)))),box('mdat',new Uint8Array(19)));
test('long GOP removal waits for an appended RAP behind playback, preserving the current decode range',()=>{
 const i=createGeneralRapIndex();i.push(init());for(const t of [0,18.333333333333,39.166666666667])i.push(fragment(t));
 // Native95 removed through18.333333 for the old arbitrary endpoint0.593685.
 const round=end=>[0,18.333333333333,39.166666666667].find(t=>t>=end);
 assert.equal(round(8.593685-8),18.333333333333);assert.equal(i.safeEnd(8.593685),null);
 const a=i.safeEnd(26.4);assert.equal(a.boundary,18.333333333333332);assert.ok(round(a.end)<26.4);assert.ok(a.end<a.boundary);
 i.retire(a.boundary);assert.equal(i.stats().raps,2);assert.equal(i.safeEnd(26.4).boundary,a.boundary);
 assert.equal(i.canRetireBefore(39.09,0),true);assert.equal(i.canRetireBefore(20,0),false);assert.equal(i.canRetireBefore(39.09,a.boundary-.500001),false);assert.equal(i.canRetireBefore(39.09,0,0,18.34),false);
});
test('fragment RAP is unavailable until all mdat bytes have been acknowledged; chunk splits retain bounded metadata only',()=>{
 const i=createGeneralRapIndex(),a=init(),b=fragment(18.333333333333);for(const n of a)i.push(Uint8Array.of(n));
 for(const n of b.subarray(0,b.length-1))i.push(Uint8Array.of(n));assert.equal(i.safeEnd(30),null);assert.equal(i.stats().metadataBytes,0);
 i.push(b.subarray(-1));assert.ok(i.safeEnd(30));assert.equal(i.safeEnd(40,10).boundary,28.333333333333332);
 const fresh=createGeneralRapIndex();fresh.push(init());assert.equal(fresh.safeEnd(40),null);
});
test('sample presentation offset supplies the RAP clock; non-sync output and oversized metadata fail closed',()=>{
 const i=createGeneralRapIndex();i.push(init());i.push(fragment(2,{cto:6000}));assert.equal(i.safeEnd(11).boundary,2);
 const bad=createGeneralRapIndex();bad.push(init());assert.throws(()=>bad.push(fragment(0,{flags:0x01010000})),/GENERAL_OUTPUT_RAP/);
 const wrong=fragment(0),trun=Buffer.from(wrong).indexOf('trun');new DataView(wrong.buffer).setUint32(trun+8,2);const count=createGeneralRapIndex();count.push(init());assert.throws(()=>count.push(wrong),/GENERAL_OUTPUT_FRAGMENT/);
 assert.throws(()=>createGeneralRapIndex().push(cat(word(262145),Buffer.from('moov'))),/GENERAL_OUTPUT_METADATA_LIMIT/);
});
test('actual reordered AVC pipeline output supplies qualified acknowledged RAP clocks without an encoder',async()=>{
 const i=createGeneralRapIndex(),source={identity:{size:fixture.length},read:async({start,end})=>fixture.slice(start,end+1),abort:async()=>({settled:true})};let bytes=0;const keys=[];
 const result=await streamGeneralQ1({source,onPacket:p=>{if(p.packet.type==='key')keys.push(p.outputTimestamp);},onChunk:c=>{i.push(c.bytes);bytes+=c.bytes.length;}});
 assert.ok(bytes>0);assert.ok(i.stats().raps>0);assert.equal(i.safeEnd(20).boundary,keys.at(-1));assert.equal(result.encodersCreated,0);assert.equal(result.cleanup.settled,true);
});
async function pageOwnerScenario(mode='resume'){
 const previous={MS:globalThis.MediaSource,create:URL.createObjectURL,revoke:URL.revokeObjectURL};let sb,worker;
 class SB extends EventTarget{constructor(){super();this.updating=false;this.start=0;this.end=0;this.removes=[];}get buffered(){return {length:this.end?1:0,start:()=>this.start,end:()=>this.end};}appendBuffer(bytes){this.updating=true;const p=Buffer.from(bytes).indexOf('mdat');if(p>=0)this.end=mode==='budget'?(this.count??0)+1:[18.333333333333,39.094666,60][this.count??0],this.count=(this.count??0)+1;queueMicrotask(()=>{this.updating=false;this.dispatchEvent(new Event('updateend'));});}remove(a,b){this.removes.push([a,b]);this.start=[0,18.333333333333,39.166666666667].find(t=>t>=b);queueMicrotask(()=>this.dispatchEvent(new Event('updateend')));}abort(){} }
 class MS extends EventTarget{static isTypeSupported(){return true;}constructor(){super();this.readyState='open';}addSourceBuffer(){return sb=new SB();}removeSourceBuffer(){}endOfStream(){} }
 class W extends EventTarget{postMessage(m){if(m.kind==='cancel'){queueMicrotask(()=>this.send({kind:'terminal'}));return;}if(m.kind==='reply'&&m.error){queueMicrotask(()=>this.send({kind:'terminal',error:{message:m.error}}));return;}if(m.kind==='start'){this.generation=m.generation;this.id=0;this.queue=[{kind:'window',value:{sourcePacketOrigin:0,windowOrigin:0,sourceEndTimestamp:60,videoStartTimestamp:0,videoConfig:{codec:'avc1.42c00a'}}},...(mode==='budget'?[init(),...[0,1,2,3].map(t=>{const tiny=fragment(t);const split=Buffer.from(tiny).indexOf('mdat')-4;return cat(tiny.subarray(0,split),box('mdat',new Uint8Array(7*1024*1024-split-8)));})]:[init(),fragment(0),fragment(18.333333333333),fragment(39.166666666667)]).flatMap(bytes=>{const chunks=[];for(let p=0;p<bytes.length;p+=262144){const c=bytes.slice(p,p+262144);chunks.push({kind:'chunk',buffer:c.buffer,batchSize:bytes.length,batchEnd:p+c.length===bytes.length});}return chunks;})];}if(m.kind==='start'||m.kind==='reply')queueMicrotask(()=>{const n=this.queue.shift();this.send(n?{...n,id:++this.id}:{kind:'terminal'});});}send(m){this.dispatchEvent(Object.assign(new Event('message'),{data:{generation:this.generation,...m}}));}terminate(){this.terminated=true;} }
 const video=new EventTarget();Object.assign(video,{currentTime:mode==='budget'?0:8.593685,paused:true,playbackRate:1,disableRemotePlayback:false,getAttribute:()=>video.src,removeAttribute:()=>{video.src='';},pause(){this.paused=true;},load(){queueMicrotask(()=>media.dispatchEvent(new Event('sourceopen')));}});let media;globalThis.MediaSource=MS;URL.createObjectURL=m=>{media=m;return 'blob:owned-test';};URL.revokeObjectURL=()=>{};
 let player;
 try{player=createGeneralPlayer({video,initialTime:mode==='budget'?0:8.593685,openSource:async()=>({identity:{size:1},read:async()=>Uint8Array.of(0),abort:async()=>({settled:true})}),isCurrent:()=>true,workerFactory:()=>worker=new W()});await player.ready;await new Promise(r=>setImmediate(r));if(mode==='budget'){await player.completion();assert.equal(player.stats().failure,'GENERAL_RETENTION_LIMIT');assert.ok(player.stats().peakRetainedAppendBytes<=24*1024*1024);assert.deepEqual(sb.removes,[]);await player.dispose();return;}if(mode==='cancel'){assert.equal(player.stats().waits,1);const appends=player.stats().appends;assert.equal((await player.dispose()).settled,true);video.currentTime=27.2;video.dispatchEvent(new Event('timeupdate'));await player.completion();assert.equal(player.stats().appends,appends);assert.deepEqual(sb.removes,[]);assert.equal(worker.terminated,true);return;}assert.deepEqual(sb.removes,[]);assert.equal(player.stats().waits,1);
  video.currentTime=27.2;video.dispatchEvent(new Event('timeupdate'));await player.completion();assert.equal(player.stats().failure,null);assert.equal(sb.removes.length,1);assert.ok(sb.removes[0][1]<18.333333333333);assert.ok(sb.start<video.currentTime&&sb.end>video.currentTime);assert.ok(player.stats().peakRetainedAppendBytes<=24*1024*1024);assert.equal((await player.dispose()).settled,true);assert.equal(worker.terminated,true);
 }finally{await player?.dispose();globalThis.MediaSource=previous.MS;URL.createObjectURL=previous.create;URL.revokeObjectURL=previous.revoke;}
}
test('page owner keeps long-GOP current frames, resumes bounded ahead pressure, and clears its generation',()=>pageOwnerScenario());
test('24MiB retention pressure fails closed if no RAP can become safe before buffered end',()=>pageOwnerScenario('budget'));
test('cancellation during ahead backpressure settles the worker without a stale append or removal',()=>pageOwnerScenario('cancel'));
