import {probeTsSeek} from './ts-seek.mjs';
import {prepareTsSeekInput} from './seek-input.mjs';
import {runBoundedProbe} from '../v2-07a-bounded-probe/bounded-probe.mjs';
import {createWorkerClient} from './worker-client.mjs';

// Isolated public QA only. A fresh MSE is owned by each seek generation. This
// proves one local decode interval, not continuous post-seek product playback.
let latest=null,generation=0,attachedGeneration=0;
const requireThat=(value,code)=>{if(!value)throw new Error(code);};
export function startSeek({sourceUrl,metadataUrl,identity,fraction}={}){
  requireThat([sourceUrl,metadataUrl].every(url=>new URL(url,location.href).origin===location.origin),'SEEKQA_LOCAL_SOURCE');
  const id=++generation,video=document.querySelector('video'),controller=new AbortController(),pending=new Set();
  let previous=latest;
  let active=true,source=null,buffer=null,url=null,worker=null,disposal=null,frameId=null,input=null;
  const state={generation:id,phase:'probing',failure:null,probe:null,target:null,presented:null,frames:[],
    appends:0,appendUpdates:0,appendErrors:0,sourceSize:Number(identity.size),packagedBytes:0,
    disposed:false,urlRevoked:false,bufferRemoved:false,worker:null,retainedInputBytes:0};
  const current=()=>active&&generation===id;
  const check=()=>requireThat(current(),'SEEKQA_STALE');
  function event(target,name,action){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(false,'SEEKQA_EVENT_TIMEOUT'),10000);
      const success=()=>finish(true),failure=()=>finish(false,'SEEKQA_MEDIA_ERROR'),cancel=()=>finish(false,'SEEKQA_CANCELLED');
      const cleanup=()=>{clearTimeout(timer);target.removeEventListener(name,success);
        target.removeEventListener('error',failure);target.removeEventListener('abort',failure);pending.delete(cancel);};
      const finish=(ok,code)=>{cleanup();ok?resolve():reject(new Error(code));};
      target.addEventListener(name,success,{once:true});target.addEventListener('error',failure,{once:true});target.addEventListener('abort',failure,{once:true});
      pending.add(cancel);if(!current()){cancel();return;}
      try{action?.();}catch{finish(false,'SEEKQA_ACTION_REJECTED');}
    });
  }
  async function dispose(){
    if(disposal)return disposal;
    active=false;controller.abort();for(const cancel of [...pending])cancel();
    if(frameId!==null){video.cancelVideoFrameCallback(frameId);frameId=null;}
    input=null;state.retainedInputBytes=0;
    disposal=(async()=>{
      if(worker){await worker.abort();state.worker=worker.stats();worker=null;}
      if(buffer&&source?.readyState!=='closed'){
        try{if(buffer.updating)buffer.abort();source.removeSourceBuffer(buffer);state.bufferRemoved=true;}
        catch{state.cleanupFailure='SEEKQA_BUFFER_RELEASE_FAILED';}
      }
      buffer=null;
      if(attachedGeneration===id){video.pause();video.removeAttribute('src');video.load();attachedGeneration=0;}
      if(url){URL.revokeObjectURL(url);url=null;state.urlRevoked=true;}
      video.removeEventListener('error',mediaError);source?.removeEventListener('sourceclose',sourceClosed);
      source=null;state.disposed=true;
    })();
    return disposal;
  }
  function mediaError(){if(current()){state.failure='SEEKQA_MEDIA_ERROR';state.phase='failed';void dispose();}}
  function sourceClosed(){if(current()){state.failure='SEEKQA_SOURCE_CLOSED';state.phase='failed';void dispose();}}
  function targetFrame(target,tolerance){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(false,'SEEKQA_FRAME_TIMEOUT'),10000);
      const cancel=()=>finish(false,'SEEKQA_CANCELLED');
      const finish=(ok,value)=>{clearTimeout(timer);pending.delete(cancel);
        if(frameId!==null){video.cancelVideoFrameCallback(frameId);frameId=null;}
        ok?resolve(value):reject(new Error(value));};
      const next=()=>{frameId=video.requestVideoFrameCallback((_,metadata)=>{
        frameId=null;if(!current()){cancel();return;}
        const frame={mediaTime:metadata.mediaTime,width:video.videoWidth,height:video.videoHeight,generation:id};
        if(state.frames.length<12)state.frames.push(frame);
        if(frame.width>0&&frame.height>0&&Math.abs(frame.mediaTime-target)<=tolerance){finish(true,frame);return;}next();
      });};
      pending.add(cancel);if(!current()){cancel();return;}next();
    });
  }
  const run={state,dispose,promise:null};latest=run;
  run.promise=(async()=>{
    try{
      if(previous){const cleanup=previous.dispose();previous=null;await cleanup;}check();
      const result=await runBoundedProbe({expectedIdentity:identity,generation:id,isGenerationCurrent:()=>current(),signal:controller.signal,
        getIdentity:async({signal})=>{const response=await fetch(metadataUrl,{signal});requireThat(response.ok,'SEEKQA_METADATA');return response.json();},
        readRange:request=>fetch(sourceUrl,{headers:{Range:request.range},signal:request.signal}),
        probe:async({read})=>{
          const plan=await probeTsSeek({read,sourceSize:Number(identity.size),fraction});
          const headBytes=await read({start:0,end:Math.min(Number(identity.size),Math.floor(65536/188)*188)-1});
          const bytes=await read({start:plan.local.windowStart,end:plan.local.windowEndExclusive-1});
          return {plan,prepared:prepareTsSeekInput({headBytes,bytes,offset:plan.local.windowStart,plan})};
        }});
      check();state.probe={ok:result.ok,metrics:result.metrics,identity:result.identity};
      if(!result.ok){state.failure=result.failure.code;state.phase='failed';await dispose();return state;}
      const {plan,prepared}=result.evidence;input=prepared.bytes;state.packagedBytes=input.length;state.retainedInputBytes=input.length;
      const target=(plan.targetTicks-plan.timeline.originTicks)/90000,tolerance=plan.timeline.videoStepTicks/90000+.0001;
      state.target={seconds:target,ticks:plan.targetTicks,originTicks:plan.timeline.originTicks,tolerance,
        rapOffset:plan.rap.offset,rapPts:plan.rap.pts,timelineKind:plan.timeline.kind};
      source=new MediaSource();source.addEventListener('sourceclose',sourceClosed);video.addEventListener('error',mediaError);
      url=URL.createObjectURL(source);attachedGeneration=id;state.phase='appending';
      await event(source,'sourceopen',()=>{video.src=url;video.load();});check();
      const sps=prepared.configuration.sps,codec=[sps[1],sps[2],sps[3]].map(value=>value.toString(16).padStart(2,'0')).join('');
      buffer=source.addSourceBuffer(`video/mp4; codecs="avc1.${codec},mp4a.40.2"`);
      buffer.timestampOffset=-plan.timeline.originTicks/90000;
      source.duration=plan.timeline.durationSeconds;
      worker=createWorkerClient({generation:id,sourceSize:input.length,onFragment:async message=>{
        check();let updated=false;const mark=()=>{updated=true;state.appendUpdates++;};buffer.addEventListener('update',mark,{once:true});
        try{await event(buffer,'updateend',()=>buffer.appendBuffer(new Uint8Array(message.bytes)));}
        catch(error){state.appendErrors++;throw error;}
        finally{buffer?.removeEventListener('update',mark);}
        check();requireThat(updated&&!video.error,'SEEKQA_APPEND_FAILED');state.appends++;
      }});
      await worker.ready;check();
      for(let offset=0;offset<input.length;offset+=65536){await worker.push(input.subarray(offset,offset+65536));check();}
      input=null;state.retainedInputBytes=0;await worker.finish();check();state.worker=worker.stats();
      requireThat(state.appends===1&&state.appendUpdates===1&&!buffer.updating,'SEEKQA_FRAGMENT_COUNT');
      source.endOfStream();
      state.buffered=Array.from({length:video.buffered.length},(_,i)=>[video.buffered.start(i),video.buffered.end(i)]);
      requireThat(state.buffered.some(([start,end])=>start<=target&&end>target),'SEEKQA_TARGET_NOT_BUFFERED');
      state.phase='seeking';
      const frame=targetFrame(target,tolerance);
      const seek=event(video,'seeked',()=>{video.currentTime=target;});
      const [,presented]=await Promise.all([seek,frame]);check();
      state.presented=presented;state.actualTime=video.currentTime;state.phase='presented';
    }catch(error){
      if(state.phase!=='failed'){state.failure=current()&&/^(SEEKQA|WORKER)_[A-Z_]+$/.test(error.message)?error.message:'SEEKQA_CANCELLED';
        state.phase=current()?'failed':'cancelled';}
      await dispose();
    }
    return state;
  })();
  return run;
}
