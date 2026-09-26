import {probeTsSeek} from './ts-seek.mjs';
import {prepareTsSeekInput} from './seek-input.mjs';
import {runBoundedProbe} from '../v2-07a-bounded-probe/bounded-probe.mjs';
import {createWorkerClient} from './worker-client.mjs';
import {createSeekBootstrap} from './seek-bootstrap.mjs';
import {createBufferWindow} from './buffer-window.mjs';

// Isolated public QA only. A fresh MSE is owned by each seek generation. This
// proves generated local seek intervals/suffixes, not product/Drive playback.
let latest=null,generation=0,attachedGeneration=0;
const requireThat=(value,code)=>{if(!value)throw new Error(code);};
export function startSeek({sourceUrl,metadataUrl,identity,fraction,continuous=false,sourceEtag=null,playbackRate=4}={}){
  requireThat([sourceUrl,metadataUrl].every(url=>new URL(url,location.href).origin===location.origin),'SEEKQA_LOCAL_SOURCE');
  requireThat(typeof continuous==='boolean'&&[1,2,4,8].includes(playbackRate),'SEEKQA_OPTIONS');
  if(continuous)requireThat(typeof sourceEtag==='string'&&/^"[a-f0-9]{64}"$/.test(sourceEtag),'SEEKQA_ETAG');
  const id=++generation,video=document.querySelector('video'),controller=new AbortController(),pending=new Set();
  let previous=latest;
  let active=true,source=null,buffer=null,url=null,worker=null,disposal=null,frameId=null,input=null,bootstrap=null,reader=null;
  const windowPolicy=createBufferWindow();
  const state={generation:id,phase:'probing',failure:null,probe:null,target:null,presented:null,frames:[],
    appends:0,appendUpdates:0,appendErrors:0,sourceSize:Number(identity.size),packagedBytes:0,
    disposed:false,urlRevoked:false,bufferRemoved:false,worker:null,retainedInputBytes:0,
    continuous,rangeRequests:0,rangeBytes:0,rangePending:false,continuousFrames:0,lastMediaTime:null,
    window:{waits:0,removals:0,peakAhead:0,peakSpan:0,waiting:false},bootstrap:null};
  const current=()=>active&&generation===id;
  const check=()=>requireThat(current(),'SEEKQA_STALE');
  function event(target,name,action,timeout=10000){
    return new Promise((resolve,reject)=>{
      const timer=timeout===null?null:setTimeout(()=>finish(false,'SEEKQA_EVENT_TIMEOUT'),timeout);
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
      if(reader){try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}reader=null;}
      if(bootstrap){bootstrap.abort();state.bootstrap=bootstrap.stats();bootstrap=null;}
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
  const ranges=()=>Array.from({length:buffer.buffered.length},(_,i)=>[buffer.buffered.start(i),buffer.buffered.end(i)]);
  function observeWindow(){
    const measured=windowPolicy.plan(ranges(),state.presented?video.currentTime:state.target.seconds);
    state.window.peakAhead=Math.max(state.window.peakAhead,measured.ahead);
    state.window.peakSpan=Math.max(state.window.peakSpan,measured.span);return measured;
  }
  function waitForPosition(){return new Promise((resolve,reject)=>{
    const events=['timeupdate','playing','seeking'],cleanup=()=>{events.forEach(name=>video.removeEventListener(name,wake));pending.delete(cancel);};
    const wake=()=>{cleanup();resolve();},cancel=()=>{cleanup();reject(new Error('SEEKQA_CANCELLED'));};
    pending.add(cancel);events.forEach(name=>video.addEventListener(name,wake,{once:true}));if(!current())cancel();
  });}
  async function admit(){
    if(!continuous)return;
    for(;;){check();const plan=observeWindow();
      if(plan.removeEnd!==null){let updated=false;const mark=()=>{updated=true;};buffer.addEventListener('update',mark,{once:true});
        try{await event(buffer,'updateend',()=>buffer.remove(0,plan.removeEnd));}finally{buffer?.removeEventListener('update',mark);}
        check();requireThat(updated&&!video.error,'SEEKQA_REMOVE_FAILED');state.window.removals++;
        const after=observeWindow();requireThat(after.start===null||after.start>plan.start,'SEEKQA_REMOVE_NO_PROGRESS');
        requireThat(ranges().some(([start,end])=>start<=video.currentTime&&end>=video.currentTime),'SEEKQA_REMOVE_CURRENT_RANGE');continue;
      }
      if(!plan.wait){state.window.waiting=false;return;}
      if(!state.window.waiting)state.window.waits++;state.window.waiting=true;await waitForPosition();
    }
  }
  function continuingFrame(){frameId=video.requestVideoFrameCallback((_,metadata)=>{
    frameId=null;if(!current())return;state.continuousFrames++;state.lastMediaTime=metadata.mediaTime;continuingFrame();
  });}
  async function presentTarget(){
    const {seconds:target,tolerance}=state.target;
    const buffered=Array.from({length:video.buffered.length},(_,i)=>[video.buffered.start(i),video.buffered.end(i)]);
    if(!buffered.some(([start,end])=>start<=target&&end>target))return false;
    state.phase='seeking';const frame=targetFrame(target,tolerance),seek=event(video,'seeked',()=>{video.currentTime=target;});
    const [,presented]=await Promise.all([seek,frame]);check();state.presented=presented;state.actualTime=video.currentTime;state.buffered=buffered;state.firstBuffered=buffered;
    state.rangeBytesAtFirstFrame=state.rangeBytes;state.rangeRequestsAtFirstFrame=state.rangeRequests;
    if(continuous){video.defaultPlaybackRate=playbackRate;video.playbackRate=playbackRate;
      state.playbackRate=video.playbackRate;continuingFrame();await video.play();check();state.phase='playing';}
    else state.phase='presented';return true;
  }
  async function exactRange(start,end){
    check();const requestController=new AbortController(),abort=()=>requestController.abort();
    const timer=setTimeout(()=>requestController.abort(),15000);controller.signal.addEventListener('abort',abort,{once:true});
    state.rangeRequests++;state.rangePending=true;let response=null,ownedReader=null;
    try{
      response=await fetch(sourceUrl,{headers:{Range:`bytes=${start}-${end}`,'If-Match':sourceEtag},signal:requestController.signal});check();
      requireThat(response.status===206&&response.headers.get('Content-Range')===`bytes ${start}-${end}/${identity.size}`
        &&response.headers.get('Content-Length')===String(end-start+1)&&response.headers.get('ETag')===sourceEtag
        &&!response.headers.get('Content-Encoding'),'SEEKQA_RANGE_IDENTITY');
      const bytes=new Uint8Array(end-start+1);let consumed=0;ownedReader=response.body.getReader();reader=ownedReader;
      for(;;){const part=await ownedReader.read();check();if(part.done)break;
        requireThat(part.value instanceof Uint8Array&&consumed+part.value.length<=bytes.length,'SEEKQA_RANGE_LENGTH');
        bytes.set(part.value,consumed);consumed+=part.value.length;state.rangeBytes+=part.value.length;
      }
      requireThat(consumed===bytes.length,'SEEKQA_RANGE_LENGTH');return bytes;
    }catch(error){
      try{if(ownedReader)await ownedReader.cancel();else await response?.body?.cancel();}catch{}
      if(!current())throw new Error('SEEKQA_CANCELLED');
      if(requestController.signal.aborted)throw new Error('SEEKQA_RANGE_TIMEOUT');
      throw error;
    }finally{
      try{ownedReader?.releaseLock();}catch{}if(reader===ownedReader)reader=null;
      clearTimeout(timer);controller.signal.removeEventListener('abort',abort);state.rangePending=false;
    }
  }
  const run={state,dispose,promise:null,inspectWorker:()=>worker?.inspect()};latest=run;
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
          return continuous?{plan,headBytes,bytes}:{plan,prepared:prepareTsSeekInput({headBytes,bytes,offset:plan.local.windowStart,plan})};
        }});
      check();state.probe={ok:result.ok,metrics:result.metrics,identity:result.identity};
      if(!result.ok){state.failure=result.failure.code;state.phase='failed';await dispose();return state;}
      const {plan,prepared}=result.evidence;let outputSize,configuration;
      if(continuous){bootstrap=createSeekBootstrap({generation:id,headBytes:result.evidence.headBytes,bytes:result.evidence.bytes,
          offset:plan.local.windowStart,plan,isCurrent:()=>current()});
        outputSize=bootstrap.outputSize;configuration={sps:plan.rap.sps};state.readStart=bootstrap.readStart;state.outputSize=outputSize;
        result.evidence.headBytes=null;result.evidence.bytes=null;
      }else{input=prepared.bytes;outputSize=input.length;configuration=prepared.configuration;
        state.packagedBytes=input.length;state.retainedInputBytes=input.length;}
      const target=(plan.targetTicks-plan.timeline.originTicks)/90000,tolerance=plan.timeline.videoStepTicks/90000+.0001;
      state.target={seconds:target,ticks:plan.targetTicks,originTicks:plan.timeline.originTicks,tolerance,
        rapOffset:plan.rap.offset,rapPts:plan.rap.pts,timelineKind:plan.timeline.kind};
      source=new MediaSource();source.addEventListener('sourceclose',sourceClosed);video.addEventListener('error',mediaError);
      url=URL.createObjectURL(source);attachedGeneration=id;state.phase='appending';
      await event(source,'sourceopen',()=>{video.src=url;video.load();});check();
      const sps=configuration.sps,codec=[sps[1],sps[2],sps[3]].map(value=>value.toString(16).padStart(2,'0')).join('');
      buffer=source.addSourceBuffer(`video/mp4; codecs="avc1.${codec},mp4a.40.2"`);
      buffer.timestampOffset=-plan.timeline.originTicks/90000;
      source.duration=plan.timeline.durationSeconds;
      worker=createWorkerClient({generation:id,sourceSize:outputSize,onFragment:async message=>{
        check();try{await admit();}catch(error){state.failure||=error.message;throw error;}
        let updated=false;const mark=()=>{updated=true;state.appendUpdates++;};buffer.addEventListener('update',mark,{once:true});
        try{await event(buffer,'updateend',()=>buffer.appendBuffer(new Uint8Array(message.bytes)));}
        catch(error){state.appendErrors++;state.failure||=error.message;throw error;}
        finally{buffer?.removeEventListener('update',mark);}
        check();requireThat(updated&&!video.error,'SEEKQA_APPEND_FAILED');state.appends++;
        if(continuous){observeWindow();if(!state.presented)await presentTarget();}
      }});
      await worker.ready;check();
      if(continuous){
        for(let position=bootstrap.readStart;position<state.sourceSize;){
          const end=Math.min(position+65535,state.sourceSize-1),raw=await exactRange(position,end);check();
          input=bootstrap.push(raw,{offset:position,generation:id});state.retainedInputBytes=input.length;
          for(let offset=0;offset<input.length;offset+=65536){await worker.push(input.subarray(offset,offset+65536));check();}
          input=null;state.retainedInputBytes=0;position=end+1;
        }
        bootstrap.finish({sourceSize:state.sourceSize,generation:id});state.bootstrap=bootstrap.stats();
      }else for(let offset=0;offset<input.length;offset+=65536){await worker.push(input.subarray(offset,offset+65536));check();}
      input=null;state.retainedInputBytes=0;await worker.finish();check();state.worker=worker.stats();
      requireThat(state.appends>0&&state.appendUpdates===state.appends&&!buffer.updating,'SEEKQA_FRAGMENT_COUNT');
      if(!continuous)requireThat(state.appends===1,'SEEKQA_FRAGMENT_COUNT');
      source.endOfStream();
      state.buffered=Array.from({length:video.buffered.length},(_,i)=>[video.buffered.start(i),video.buffered.end(i)]);
      if(!continuous)requireThat(state.buffered.some(([start,end])=>start<=target&&end>target),'SEEKQA_TARGET_NOT_BUFFERED');
      if(continuous){requireThat(state.presented,'SEEKQA_NO_TARGET_FRAME');
        // A user pause after EOF has no wall-clock deadline. Terminal media
        // events and owner cancellation still reject this wait immediately.
        if(!video.ended)await event(video,'ended',null,null);check();state.phase='ended';state.ended=true;state.finalTime=video.currentTime;
      }else requireThat(await presentTarget(),'SEEKQA_TARGET_NOT_BUFFERED');
    }catch(error){
      if(state.phase!=='failed'){state.failure=state.failure||(current()&&/^(SEEKQA|WORKER)_[A-Z_]+$/.test(error.message)?error.message:current()?'SEEKQA_FAILED':'SEEKQA_CANCELLED');
        state.phase=current()?'failed':'cancelled';}
      await dispose();
    }
    return state;
  })();
  return run;
}
