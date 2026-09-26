// Local synthetic browser discriminator only, not a product media engine.
import { createGopStream } from './gop-stream.mjs';
import { adaptInitSar } from './init-sar.mjs';
import { createWorkerClient } from './worker-client.mjs';

const demand = (condition, code) => { if (!condition) throw new Error(code); };
const equal = (a,b) => a.length === b.length && a.every((value,index) => value === b[index]);

export function startTrial({sourceUrl,sourceSize,mode='incremental',engine='main',holdFirstAck=false}={}) {
  demand(['incremental','eof-only','invalid-init'].includes(mode),'QA_MODE');
  demand(['main','worker'].includes(engine)&&!(engine==='worker'&&mode==='eof-only'),'QA_ENGINE');
  demand(new URL(sourceUrl,location.href).origin === location.origin,'QA_LOCAL_SOURCE');
  const video = document.querySelector('video');
  const controller = new AbortController();
  const source = new MediaSource();
  const url = URL.createObjectURL(source);
  const pending = new Set();
  let reader=null,buffer=null,owner=null,config=null,init=null,queued=null,active=true,frameHandle=null;
  let appendSuccess=false,playing=false,disposal=null,client=null,releaseHeldAck=null,offered=0;
  const state = {phase:'starting',failure:null,received:0,consumed:0,sourceComplete:false,
    fragments:0,appends:0,appendCompletions:0,appendErrors:0,firstFrame:null,frames:0,lastMediaTime:null,
    peakQueuedBytes:0,peakInputChunkBytes:0,peakPendingReads:0,pendingReads:0,
    disposed:false,urlRevoked:false,cleanup:null,owner:null,worker:null,ackHeld:false,engine,
    mime:'video/mp4; codecs="avc1.64001e,mp4a.40.2"'};
  let mux = engine==='main'?new globalThis.muxjs.Transmuxer({remux:true,keepOriginalTimestamps:true}):null;

  function event(target,name,errors=['error','abort'],action=null) {
    return new Promise((resolve,reject) => {
      const timer=setTimeout(()=>end(false,'QA_EVENT_TIMEOUT'),10000);
      const cleanup=()=>{clearTimeout(timer);target.removeEventListener(name,success);
        errors.forEach(type=>target.removeEventListener(type,failure));pending.delete(cancel);};
      const end=(ok,code)=>{cleanup();ok?resolve():reject(new Error(code));};
      const success=()=>end(true);
      const failure=()=>{if(target===buffer)state.appendErrors++;end(false,'QA_MEDIA_EVENT_ERROR');};
      const cancel=()=>end(false,'QA_CANCELLED');
      pending.add(cancel);target.addEventListener(name,success,{once:true});
      errors.forEach(type=>target.addEventListener(type,failure,{once:true}));
      if(!active){cancel();return;}
      try{action?.();}catch{end(false,'QA_MEDIA_ACTION_ERROR');}
    });
  }
  function nextFrame() {
    if(!active)return;
    frameHandle=video.requestVideoFrameCallback((_,metadata)=>{
      if(!active)return;
      state.frames++;state.lastMediaTime=metadata.mediaTime;
      if(!state.firstFrame)state.firstFrame={received:state.received,consumed:state.consumed,
        sourceComplete:state.sourceComplete,mediaTime:metadata.mediaTime,width:video.videoWidth,height:video.videoHeight,
        appendedFragments:state.fragments};
      nextFrame();
    });
  }
  function dispose() {
    if(disposal)return disposal;
    disposal=(async()=>{
    active=false;state.disposed=true;controller.abort();
    for(const cancel of [...pending])cancel();
    if(frameHandle!==null)video.cancelVideoFrameCallback(frameHandle);
    owner?.abort();state.owner=owner?.stats()||null;
    releaseHeldAck?.();releaseHeldAck=null;state.ackHeld=false;
    if(client){await client.abort();state.worker=client.stats();client=null;}
    try{await reader?.cancel();}catch{}
    try{reader?.releaseLock();}catch{}
    reader=null;queued=null;config=null;init=null;
    // Pinned mux.dispose() clears listeners only, not cached GOP/PES bytes.
    const cachedBefore=mux?(mux.transmuxPipeline_?.videoSegmentStream?.gopCache_?.length||0):null;
    mux?.reset();
    const cachedAfter=mux?(mux.transmuxPipeline_?.videoSegmentStream?.gopCache_?.length||0):null;
    mux?.dispose();mux=null;
    if(buffer?.updating){try{buffer.abort();}catch{}}
    if(buffer&&source.readyState==='open'){try{source.removeSourceBuffer(buffer);}catch{}}
    buffer=null;
    video.pause();video.removeAttribute('src');video.load();
    URL.revokeObjectURL(url);state.urlRevoked=true;
    state.pendingReads=0;
    state.cleanup={muxCachedGopsBefore:cachedBefore,muxCachedGopsAfter:cachedAfter,
      muxReleased:mux===null,readerReleased:reader===null,worker:state.worker,sourceBuffers:source.sourceBuffers.length};
    })();
    return disposal;
  }
  mux?.on('data',segment=>{
    demand(active && !queued && segment.type==='combined','QA_OUTPUT_OWNER');
    let next;
    if(mode==='eof-only')next=Uint8Array.from(segment.initSegment);
    else next=adaptInitSar(segment.initSegment,config).initSegment;
    if(init)demand(equal(init,next),'QA_INIT_CHANGED');
    const parts=init?[segment.data]:[next,segment.data];
    const length=parts.reduce((size,part)=>size+part.byteLength,0);
    demand(length<=2*1024*1024,'QA_OUTPUT_BUDGET');
    queued=new Uint8Array(length);let cursor=0;
    for(const part of parts){queued.set(part,cursor);cursor+=part.byteLength;}
    if(mode==='invalid-init'&&!init)queued.fill(0,0,8);
    init=next;state.peakQueuedBytes=Math.max(state.peakQueuedBytes,length);state.fragments++;
  });
  async function append() {
    if(!queued)return;
    demand(active&&!buffer.updating,'QA_APPEND_OWNER');
    state.appends++;appendSuccess=false;
    const updated=()=>{appendSuccess=true;};buffer.addEventListener('update',updated,{once:true});
    try{await event(buffer,'updateend',['error','abort'],()=>buffer.appendBuffer(queued));}
    finally{buffer.removeEventListener('update',updated);}
    // updateend also follows failures/abort; only update plus active ownership
    // can acknowledge an append and release the next input packet.
    demand(active&&appendSuccess&&!video.error,'QA_APPEND_FAILED');
    queued=null;state.appendCompletions++;
    if(!playing){
      demand(buffer.buffered.length>0,'QA_NO_BUFFERED_RANGE');
      video.currentTime=buffer.buffered.start(0);playing=true;
      video.play().catch(()=>{if(active){state.failure='QA_PLAY_REJECTED';state.phase='failed';void dispose();}});
    }
  }
  const done=(async()=>{
    try{
      demand(MediaSource.isTypeSupported(state.mime)&&typeof video.requestVideoFrameCallback==='function','QA_CAPABILITY');
      const opening=event(source,'sourceopen',['sourceclose'],()=>{video.src=url;});await opening;
      buffer=source.addSourceBuffer(state.mime);nextFrame();state.phase='reading';
      if(engine==='worker'){
        client=createWorkerClient({sourceSize,onFragment:async message=>{
          demand(active&&!queued,'QA_WORKER_OUTPUT_OWNER');
          queued=new Uint8Array(message.bytes);state.fragments++;state.consumed=message.sourceConsumed;
          state.peakQueuedBytes=Math.max(state.peakQueuedBytes,queued.byteLength);
          if(mode==='invalid-init'&&message.initIncluded)queued.fill(0,0,8);
          await append();
          if(holdFirstAck&&state.fragments===1&&active){
            state.ackHeld=true;
            await new Promise(resolve=>{releaseHeldAck=resolve;});
            releaseHeldAck=null;state.ackHeld=false;
          }
        }});
        await client.ready;
      }else{
        owner=createGopStream({maxChunkBytes:188,onInterval:item=>{
          if(item.configuration)config=item.configuration;
          demand(config,'QA_SOURCE_CONFIG');mux.push(item.bytes);mux.flush();
        }});
      }
      const response=await fetch(sourceUrl,{signal:controller.signal,cache:'no-store'});
      demand(response.ok&&Number(response.headers.get('Content-Length'))===sourceSize,'QA_SOURCE_SIZE');
      reader=response.body.getReader();
      for(;;){
        demand(active,'QA_CANCELLED');state.pendingReads++;state.peakPendingReads=Math.max(state.peakPendingReads,state.pendingReads);
        let result;try{result=await reader.read();}finally{state.pendingReads--;}
        demand(active,'QA_CANCELLED');if(result.done)break;
        const bytes=result.value;state.received+=bytes.length;state.peakInputChunkBytes=Math.max(state.peakInputChunkBytes,bytes.length);
        demand(state.received<=sourceSize&&bytes.length<=1024*1024,'QA_INPUT_BUDGET');
        if(engine==='worker'){
          for(let offset=0;offset<bytes.length;offset+=65536){
            const part=bytes.subarray(offset,offset+65536);offered+=part.length;
            await client.push(part);state.consumed=offered;
          }
          continue;
        }
        if(mode==='eof-only'){mux.push(bytes);state.consumed+=bytes.length;continue;}
        // Stop after each 188-byte feed: a synchronous interval can be emitted
        // here, and no further parser input/read is admitted before its ACK.
        for(let offset=0;offset<bytes.length;offset+=188){
          const part=bytes.subarray(offset,offset+188);state.consumed+=part.length;
          owner.push(part);if(queued)await append();
        }
      }
      demand(state.received===sourceSize,'QA_EOF_SIZE');state.sourceComplete=true;
      if(engine==='worker'){await client.finish();state.worker=client.stats();}
      else if(mode==='eof-only')mux.flush();else owner.finish({sourceSize});
      await append();demand(active&&!buffer.updating,'QA_END_OWNER');source.endOfStream();
      state.owner=owner?.stats()||null;state.phase='complete';
    }catch(error){
      state.failure ||= active?(String(error?.message).startsWith('QA_')?error.message:'QA_PIPELINE_FAILED'):'QA_CANCELLED';
      state.phase='failed';await dispose();
    }
    return state;
  })();
  return {state,done,dispose,workerStats:()=>client?.stats()||state.worker,
    inspectWorker:()=>client.inspect(),
    releaseAck:()=>{releaseHeldAck?.();}};
}
