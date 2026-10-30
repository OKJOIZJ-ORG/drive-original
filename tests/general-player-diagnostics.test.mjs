import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeneralPlayer} from '../media/general-player.mjs';
import {sanitizeBrowserMediaError} from '../media/q1-core.mjs';
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const box=(type,...body)=>{const bytes=Buffer.concat(body);return Buffer.concat([word(bytes.length+8),Buffer.from(type),bytes]);};
const init=()=>box('moov',box('trak',box('tkhd',word(0),word(0),word(0),word(1)),box('mdia',box('mdhd',word(0),word(0),word(0),word(12000)),box('hdlr',word(0),word(0),Buffer.from('vide')))),box('mvex',box('trex',word(0),word(1),word(1),word(1000),word(1),word(0x02000000))));
const fragment=time=>Buffer.concat([box('moof',box('traf',box('tfhd',word(0),word(1)),box('tfdt',word(0),word(time*12000)),box('trun',word(0x01000c00),word(1),word(0x02000000),word(0)))),box('mdat',Buffer.alloc(19))]);
async function scenario({target='buffer',operation='append',message='PipelineStatus::PIPELINE_ERROR_DECODE: https://PRIVATE.invalid/FILE_ID',code=3,stale=false,openFailure=null}={}){
 const saved={MediaSource:globalThis.MediaSource,create:URL.createObjectURL,revoke:URL.revokeObjectURL};let media,buffer,player,owned=true,revoked=false,aborts=0,sourceAborted=false;
 const browserError=()=>{
  if(stale)owned=false;video.error={code,message};
  (target==='video'?video:target==='source'?media:buffer).dispatchEvent(new Event(target==='source'?'sourceclose':'error'));
  video.error={code:4,message:'MEDIA_ERR_SRC_NOT_SUPPORTED https://LATER.invalid/SECRET'};video.dispatchEvent(new Event('error'));
 };
 class SB extends EventTarget{
  updating=false;end=0;get buffered(){return {length:this.end?1:0,start:()=>0,end:()=>this.end};}
  appendBuffer(){this.updating=true;queueMicrotask(()=>{if(operation==='append')browserError();else{this.updating=false;this.end=24;this.dispatchEvent(new Event('updateend'));}});}
  remove(){this.updating=true;queueMicrotask(browserError);}abort(){this.updating=false;}
 }
 class MS extends EventTarget{static isTypeSupported(){return true;}readyState='open';constructor(){super();media=this;}addSourceBuffer(){return buffer=new SB();}removeSourceBuffer(){}endOfStream(){} }
 class W extends EventTarget{
  postMessage(m){
   if(m.kind==='cancel'||m.error){queueMicrotask(()=>this.send({kind:'terminal'}));return;}
   if(m.kind==='start'){this.generation=m.generation;this.id=0;this.queue=[{kind:'window',value:{sourcePacketOrigin:0,windowOrigin:0,sourceEndTimestamp:30,videoStartTimestamp:0,videoConfig:{codec:'avc1.42c00a'}}},...[init(),fragment(0),fragment(1),fragment(2)].map(b=>{const bytes=Uint8Array.from(b);return {kind:'chunk',buffer:bytes.buffer,batchSize:bytes.length,batchEnd:true};})];}
   if(m.kind==='start'||m.kind==='reply')queueMicrotask(()=>this.send({...this.queue.shift(),id:++this.id}));
  }
  send(m){this.dispatchEvent(Object.assign(new Event('message'),{data:{generation:this.generation,...m}}));}terminate(){}
 }
 class Video extends EventTarget{
  currentTime=10;readyState=3;error=null;paused=true;playbackRate=1;
  getAttribute(){return this.src;}removeAttribute(){this.src=null;}pause(){this.paused=true;}
  load(){this.error=null;if(this.src)queueMicrotask(()=>media.dispatchEvent(new Event('sourceopen')));}
 }
 const video=new Video();globalThis.MediaSource=MS;URL.createObjectURL=()=> 'blob:PRIVATE';URL.revokeObjectURL=()=>{revoked=true;};
 try{
  player=createGeneralPlayer({video,initialTime:10,isCurrent:()=>owned,workerFactory:()=>new W(),openSource:async()=>{if(openFailure)throw Error(openFailure);return {identity:{size:1},read:async()=>Uint8Array.of(0),abort:async()=>{if(!sourceAborted){sourceAborted=true;aborts++;}return {settled:true};}};}});
  await player.completion();await player.dispose();await player.ready.catch(()=>{});
  const before=structuredClone(player.stats().mediaError);
  video.error={code:1,message:'PIPELINE_ERROR_NETWORK private later'};video.dispatchEvent(new Event('error'));buffer?.dispatchEvent(new Event('error'));
  return {stats:structuredClone(player.stats()),before,videoError:video.error,revoked,aborts};
 }finally{await player?.dispose();globalThis.MediaSource=saved.MediaSource;URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke;}
}
for(const target of ['buffer','video','source'])test(`general ${target} error survives cleanup with only sanitized first-active context`,async()=>{
 const result=await scenario({target});assert.equal(result.stats.failure,target==='source'?'GENERAL_SOURCE_CLOSED':'GENERAL_MEDIA_ERROR');
 assert.deepEqual(result.stats.mediaError,{event:target==='source'?'sourceclose':'error',target,code:3,token:'PIPELINE_ERROR_DECODE',operation:'append',time:10,readyState:3});
 assert.deepEqual(result.stats.mediaError,result.before);assert.equal(result.stats.cleanup.settled,true);assert.equal(result.revoked,true);assert.equal(result.stats.disposed,true);assert.equal(result.aborts,1);
 assert.doesNotMatch(JSON.stringify(result.stats.mediaError),/PRIVATE|FILE_ID|SECRET|https|LATER/);
});
test('general MSE removal errors retain the remove operation',async()=>{
 const result=await scenario({operation:'remove'});assert.equal(result.stats.failure,'GENERAL_MEDIA_ERROR');assert.equal(result.stats.mediaError.operation,'remove');
});
test('general stale owner and transport failures cannot invent browser diagnostics',async()=>{
 const stale=await scenario({stale:true});assert.equal(stale.stats.mediaError,undefined);assert.equal(stale.stats.phase,'cancelled');
 const failed=await scenario({openFailure:'Q1_SOURCE_PERMISSION'});assert.equal(failed.stats.mediaError,undefined);assert.equal(failed.stats.failure,'Q1_SOURCE_PERMISSION');
});
test('shared sanitizer bounds message inspection and rejects unknown tokens, operations and numeric states',()=>{
 const value=sanitizeBrowserMediaError({event:{type:'PRIVATE_EVENT',target:{url:'https://private.invalid'}},video:{error:{code:99,message:'X'.repeat(1024)+' PIPELINE_ERROR_DECODE SECRET'},currentTime:Infinity,readyState:9},operation:'https://PRIVATE.invalid/FILE_ID'});
 assert.deepEqual(value,{event:'error',target:'unknown',code:null,token:null,operation:'idle',time:null,readyState:null});
});
