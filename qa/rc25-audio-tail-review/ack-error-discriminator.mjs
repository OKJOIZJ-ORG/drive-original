import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createGeneralPlayer} from '../../media/general-player.mjs';

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const productPaths=['media/general-player.mjs','tests/general-retention.test.mjs','media/general-README.md'];
const hashes=()=>Object.fromEntries(productPaths.map(p=>[p,sha(fs.readFileSync(p))]));
const before=hashes();
// Reuse only the maintained tiny byte constructors, not its tests or scenario.
const fixtureText=fs.readFileSync('tests/general-retention.test.mjs','utf8');
const helpers=fixtureText.slice(fixtureText.indexOf('const cat='),fixtureText.indexOf("test('known audio-only"));
const {avInit,fragment,audioTail}=new Function('Buffer',helpers+'\nreturn {avInit,fragment,audioTail};')(Buffer);
const original={MS:globalThis.MediaSource,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
let media,worker,player,sourceAborts=0,revokeCalls=0;
const observation={audioAppendStarted:false,audioUpdateendAcknowledged:false,eosCalls:0,errorEvents:[]};
class SourceBuffer extends EventTarget {
  constructor(){super();this.updating=false;this.rangeEnd=0;this.appendCalls=0;}
  get buffered(){return {length:this.rangeEnd?1:0,start:()=>0,end:()=>this.rangeEnd};}
  appendBuffer(bytes){this.updating=true;this.appendCalls++;
    if(this.appendCalls===3){observation.audioAppendStarted=true;queueMicrotask(()=>{this.updating=false;this.dispatchEvent(new Event('error'));});return;}
    if(this.appendCalls===2)this.rangeEnd=20;
    queueMicrotask(()=>{this.updating=false;this.dispatchEvent(new Event('updateend'));});
  }
  abort(){this.updating=false;}
}
class MediaSource extends EventTarget {
  static isTypeSupported(){return true;}
  constructor(){super();this.readyState='open';}
  addSourceBuffer(){return this.sb=new SourceBuffer();}
  removeSourceBuffer(){this.sb=null;}
  endOfStream(){observation.eosCalls++;}
}
class Worker extends EventTarget {
  postMessage(message){
    if(message.kind==='cancel'){queueMicrotask(()=>this.send({kind:'terminal'}));return;}
    if(message.kind==='reply'&&message.error){queueMicrotask(()=>this.send({kind:'terminal',error:{message:message.error}}));return;}
    if(message.kind==='start'){
      this.generation=message.generation;this.id=0;
      this.queue=[{kind:'window',value:{sourcePacketOrigin:0,windowOrigin:0,sourceEndTimestamp:40,videoStartTimestamp:0,videoConfig:{codec:'avc1.42c00a'}}},...[avInit(),fragment(0),audioTail()].map(bytes=>({kind:'chunk',buffer:bytes.buffer,batchSize:bytes.length,batchEnd:true}))];
    }
    if(message.kind==='start'||message.kind==='reply')queueMicrotask(()=>{const next=this.queue.shift();this.send(next?{...next,id:++this.id}:{kind:'terminal'});});
  }
  send(message){this.dispatchEvent(Object.assign(new Event('message'),{data:{generation:this.generation,...message}}));}
  terminate(){this.terminated=true;}
}
const video=new EventTarget();Object.assign(video,{currentTime:0,paused:true,playbackRate:1,disableRemotePlayback:false,getAttribute:()=>video.src,removeAttribute:()=>{video.src='';},pause(){this.paused=true;},load(){queueMicrotask(()=>media.dispatchEvent(new Event('sourceopen')));}});
let report;
try {
  globalThis.MediaSource=MediaSource;
  URL.createObjectURL=value=>{media=value;return 'blob:independent-local';};
  URL.revokeObjectURL=()=>revokeCalls++;
  player=createGeneralPlayer({video,initialTime:0,isCurrent:()=>true,onEvent:event=>{if(event.type==='error')observation.errorEvents.push(event.code);},openSource:async()=>({identity:{size:1},read:async()=>Uint8Array.of(0),abort:async()=>{sourceAborts++;return {settled:true};}}),workerFactory:()=>worker=new Worker()});
  await player.ready;
  const terminal=await player.completion(),cleanup=await player.dispose();
  assert.equal(observation.audioAppendStarted,true);
  assert.equal(observation.audioUpdateendAcknowledged,false);
  assert.equal(observation.eosCalls,0);
  assert.equal(terminal.phase,'failed');assert.equal(terminal.failure,'GENERAL_MEDIA_ERROR');
  assert.deepEqual(observation.errorEvents,['GENERAL_MEDIA_ERROR']);
  assert.equal(terminal.appends,2);assert.equal(cleanup.settled,true);
  assert.ok(sourceAborts>=1);assert.equal(worker.terminated,true);assert.equal(revokeCalls,1);
  assert.equal(video.src,'');
  assert.deepEqual(hashes(),before);
  report={scope:'Independent local native-append-error discriminator; mocks MSE/worker/provider, no browser/device/network proof',sourceBefore:before,sourceAfter:hashes(),helperSha256:sha(helpers),observation,terminal:{phase:terminal.phase,failure:terminal.failure,acknowledgedAppends:terminal.appends,peakRetainedAppendBytes:terminal.peakRetainedAppendBytes},cleanup:{settled:cleanup.settled,sourceAborts,workerTerminated:worker.terminated,revokeCalls,sourceCleared:video.src===''},passed:true};
} finally {
  await player?.dispose();globalThis.MediaSource=original.MS;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;
}
fs.writeFileSync('qa/rc25-audio-tail-review/ack-error-results.json',JSON.stringify({...report,producerSha256:sha(fs.readFileSync(new URL(import.meta.url)))},null,2)+'\n');
console.log('Independent final audio append error: no EOS, GENERAL_MEDIA_ERROR, settled cleanup PASS');
