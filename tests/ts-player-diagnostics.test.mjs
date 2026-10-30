import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Keep the product lifecycle/error handlers intact; only the parser/worker and
// browser primitives are replaced so error ordering and cleanup are controlled.
const source=(await fs.readFile(new URL('../media/ts-player.mjs',import.meta.url),'utf8'))
  .replace(/^import .*\r?\n/gm,'');
const stubs=`
import {sanitizeBrowserMediaError} from '${new URL('../media/q1-core.mjs',import.meta.url).href}';
const probeTsSeek=async({read})=>{await read({start:0,end:15});return {targetTicks:0,timeline:{originTicks:0,durationSeconds:8,kind:'test'},rap:{sps:[0,100,0,31]},local:{windowStart:0,windowEndExclusive:16}};};
const createSeekBootstrap=()=>({readStart:0,outputSize:16,push:x=>x,abort(){},stats(){return{};}});
const createBufferWindow=()=>({plan:()=>({wait:false,ahead:0,span:0,start:null,end:null,removeEnd:null})});
const createDriveQ1ProbeRetention=()=>({clear(){},stats(){return{};}});
const createWorkerClient=({onFragment})=>({ready:Promise.resolve(),push:()=>onFragment({bytes:new ArrayBuffer(16)}),abort:async()=>{},stats:()=>({terminated:true})});
`;
const {createTsPlayer}=await import('data:text/javascript;base64,'+Buffer.from(stubs+source).toString('base64'));

async function scenario({message='PIPELINE_ERROR_DECODE: private https://secret.invalid/file?id=PRIVATE',code=3,readFailure=null,loseOwnership=false}={}){
  const saved={MediaSource:globalThis.MediaSource,Worker:globalThis.Worker,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
  let media,revoked=false;
  class Buffer extends EventTarget{
    buffered={length:0};updating=false;
    appendBuffer(){this.updating=true;queueMicrotask(()=>{video.error={code,message};this.dispatchEvent(new Event('error'));video.error={code:4,message:'MEDIA_ERR_SRC_NOT_SUPPORTED later private error'};video.dispatchEvent(new Event('error'));});}
    abort(){this.updating=false;}
  }
  class Media extends EventTarget{
    static isTypeSupported(){return true;}readyState='open';
    constructor(){super();media=this;}
    addSourceBuffer(){return new Buffer();}removeSourceBuffer(){}
  }
  class Video extends EventTarget{
    currentTime=12.5;readyState=3;playbackRate=1;error=null;buffered={length:0};paused=true;
    getAttribute(name){return name==='src'?this.src:null;}removeAttribute(){this.src=null;}
    pause(){this.paused=true;}
    load(){this.error=null;if(this.src)queueMicrotask(()=>media.dispatchEvent(new Event('sourceopen')));}
  }
  const video=new Video();globalThis.MediaSource=Media;globalThis.Worker=class{};
  URL.createObjectURL=()=> 'blob:synthetic';URL.revokeObjectURL=()=>{revoked=true;};
  let player,owned=true;
  try{
    player=createTsPlayer({video,isCurrent:()=>owned,openSource:async()=>({identity:{size:16},read:async()=>{if(loseOwnership)owned=false;if(readFailure)throw new Error(readFailure);return new Uint8Array(16);},abort:async()=>({settled:true}),stats:()=>({})})});
    await assert.rejects(player.ready,new RegExp(loseOwnership?'Q1_CANCELLED':readFailure||'Q1_MEDIA_ERROR'));
    await player.completion();const cleanup=await player.dispose();
    return {stats:structuredClone(player.stats()),videoError:video.error,cleanup,revoked};
  }finally{globalThis.MediaSource=saved.MediaSource;globalThis.Worker=saved.Worker;URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke;}
}

test('first buffer error retains sanitized browser context through video error and load cleanup',async()=>{
  const result=await scenario();
  assert.equal(result.stats.failure,'Q1_MEDIA_ERROR');assert.equal(result.videoError,null);
  assert.deepEqual(result.stats.mediaError,{event:'error',target:'buffer',code:3,token:'PIPELINE_ERROR_DECODE',operation:'append',time:12.5,readyState:3});
  assert.equal(result.cleanup.settled,true);assert.equal(result.revoked,true);assert.equal(result.stats.disposed,true);
  assert.doesNotMatch(JSON.stringify(result.stats.mediaError),/secret|https|PRIVATE/);
});

test('unknown browser strings and invalid numeric codes are not retained',async()=>{
  const result=await scenario({message:'DECODER_ERROR_PRIVATE_TOKEN https://secret.invalid/PRIVATE',code:99});
  assert.equal(result.stats.mediaError.token,null);assert.equal(result.stats.mediaError.code,null);
  assert.doesNotMatch(JSON.stringify(result.stats.mediaError),/PRIVATE|secret|https/);
});

for(const failure of ['Q1_SOURCE_PERMISSION','Q1_SOURCE_CONTENT_DRIFT'])test(`${failure} keeps its failure identity without inventing a browser error`,async()=>{
  const result=await scenario({readFailure:failure});
  assert.equal(result.stats.failure,failure);assert.equal(result.stats.mediaError,undefined);
  assert.equal(result.cleanup.settled,true);
});

test('lost ownership still cancels and settles without inventing a browser failure',async()=>{
  const result=await scenario({loseOwnership:true});
  assert.equal(result.stats.phase,'cancelled');assert.equal(result.stats.failure,null);
  assert.equal(result.stats.mediaError,undefined);assert.equal(result.cleanup.settled,true);
});
