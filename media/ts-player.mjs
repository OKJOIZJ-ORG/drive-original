import {probeTsSeek,createSeekBootstrap,createBufferWindow,createWorkerClient} from './q1-core.mjs';
import {createDriveQ1ProbeRetention} from './drive-source.mjs';

const demand=(condition,code)=>{if(!condition)throw new Error(`Q1_${code}`);};
const fixed=error=>/^(?:Q1|SEEK|BOOTSTRAP|WORKER|BUFFER_WINDOW)_[A-Z_]+$/.test(error?.message)?error.message:'Q1_PLAYBACK_FAILED';
const SAME_CONTENT=['accountKey','accountGeneration','fileId','headRevisionId','size','mimeType','modifiedTime'];

// The page owns metadata/authenticated bytes. This adapter sends only bounded
// byte buffers to the worker and never receives a credential or a remote URL.
// Each source replacement waits for previous parser/MSE cleanup. Full-format
// support is not inferred from this strictly admitted H264/AAC TS path.
export function createTsPlayer({video,openSource,isCurrent,onEvent=()=>{},initialTime=0,autoplay=false}={}){
  demand(video&&typeof openSource==='function'&&typeof isCurrent==='function'&&typeof onEvent==='function','OPTIONS');
  const Constructor=globalThis.MediaSource||globalThis.ManagedMediaSource;
  demand(Constructor&&typeof Worker==='function','UNAVAILABLE');
  let generation=0,latest=null,closed=false,baseline=null,checksum=null,cleanupBlocked=false,recoveries=0;
  const probeRetention=createDriveQ1ProbeRetention();
  const originalRemote=video.disableRemotePlayback;
  const owned=()=>!closed&&isCurrent()===true;
  function launch(seconds,play){
    demand(Number.isFinite(seconds)&&seconds>=0&&owned(),'CLOSED');
    const id=++generation,priorCleanup=latest?.dispose(),controller=new AbortController(),pending=new Set();
    let active=true,source=null,buffer=null,url=null,worker=null,reader=null,opening=null,openCleanup=null,bootstrap=null,disposal=null,frameId=null;
    let positioned=false,positionTask=null,internalSeek=false,firstAppend=true,remoteOwned=false,readyResolve,readyReject;
    const rate=video.playbackRate||1;
    const ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no;});ready.catch(()=>{});
    const state={generation:id,phase:'opening',failure:null,target:null,appends:0,frames:0,lastMediaTime:null,
      window:{waits:0,removals:0,peakAhead:0,peakSpan:0},disposed:false,bufferRemoved:false,urlRevoked:false};
    const policy=createBufferWindow(),current=()=>active&&id===generation&&owned();
    const check=()=>demand(current(),'CANCELLED');
    const emit=(type,detail={})=>{check();onEvent({type,generation:id,...detail});check();};
    function wait(target,name,action=null,timeout=10000){return new Promise((resolve,reject)=>{
      let settled=false;
      const cleanup=()=>{clearTimeout(timer);target.removeEventListener(name,success);
        target.removeEventListener('error',failure);target.removeEventListener('abort',failure);pending.delete(cancel);};
      const finish=(ok,code)=>{if(settled)return;settled=true;cleanup();ok?resolve():reject(new Error(code));};
      const success=()=>finish(true),failure=()=>finish(false,'Q1_MEDIA_ERROR'),cancel=()=>finish(false,'Q1_CANCELLED');
      const timer=timeout===null?null:setTimeout(()=>{
        state.timeout={event:name,time:video.currentTime,seeking:video.seeking,readyState:video.readyState,
          mediaRanges:Array.from({length:video.buffered.length},(_,i)=>[video.buffered.start(i),video.buffered.end(i)]),
          sourceRanges:buffer?ranges():[]};finish(false,'Q1_MEDIA_TIMEOUT');
      },timeout);
      pending.add(cancel);target.addEventListener(name,success,{once:true});
      target.addEventListener('error',failure,{once:true});target.addEventListener('abort',failure,{once:true});
      if(!current()){cancel();return;}try{action?.();}catch{finish(false,'Q1_MEDIA_ACTION');}
    });}
    function movement(){return new Promise((resolve,reject)=>{
      const events=['timeupdate','playing','seeking','pause'];
      const clean=()=>{events.forEach(name=>video.removeEventListener(name,wake));pending.delete(cancel);};
      const wake=()=>{clean();resolve();},cancel=()=>{clean();reject(new Error('Q1_CANCELLED'));};
      pending.add(cancel);events.forEach(name=>video.addEventListener(name,wake,{once:true}));if(!current())cancel();
    });}
    function backoff(milliseconds){return new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);pending.delete(cancel);error?reject(error):resolve();};
      const cancel=()=>finish(new Error('Q1_CANCELLED'));
      const timer=setTimeout(()=>finish(),milliseconds);pending.add(cancel);if(!current())cancel();
    });}
    const ranges=()=>Array.from({length:buffer.buffered.length},(_,i)=>[buffer.buffered.start(i),buffer.buffered.end(i)]);
    function windowPlan(){
      const value=policy.plan(ranges(),positioned?video.currentTime:state.target);
      state.window.peakAhead=Math.max(state.window.peakAhead,value.ahead);state.window.peakSpan=Math.max(state.window.peakSpan,value.span);return value;
    }
    async function admit(){
      for(;;){check();
        if('streaming' in source&&source.streaming===false){await wait(source,'startstreaming',null,null);continue;}
        const plan=windowPlan();
        if(plan.removeEnd!==null){let updated=false;const mark=()=>{updated=true;};buffer.addEventListener('update',mark,{once:true});
          try{await wait(buffer,'updateend',()=>buffer.remove(0,plan.removeEnd));}finally{buffer?.removeEventListener('update',mark);}
          check();demand(updated&&!video.error,'REMOVE_FAILED');const after=windowPlan();
          demand(after.start===null||after.start>plan.start,'REMOVE_NO_PROGRESS');
          demand(ranges().some(([a,b])=>a<=video.currentTime&&b>=video.currentTime),'REMOVE_CURRENT_RANGE');
          state.window.removals++;continue;
        }
        if(!plan.wait)return;state.window.waits++;await movement();
      }
    }
    function frame(){
      if(typeof video.requestVideoFrameCallback!=='function')return;
      frameId=video.requestVideoFrameCallback((_,metadata)=>{frameId=null;if(!current())return;
        state.frames++;state.lastMediaTime=metadata.mediaTime;frame();});
    }
    async function dispose(){
      if(disposal)return disposal;
      active=false;controller.abort();const sourceCleanup=reader?.abort();for(const cancel of [...pending])cancel();
      if(remoteOwned){video.disableRemotePlayback=originalRemote;remoteOwned=false;}
      readyReject(new Error('Q1_CANCELLED'));
      if(frameId!==null){video.cancelVideoFrameCallback(frameId);frameId=null;}
      disposal=(async()=>{
        bootstrap?.abort();state.bootstrap=bootstrap?.stats()||state.bootstrap;bootstrap=null;
        if(worker){await worker.abort();state.worker=worker.stats();worker=null;}
        await priorCleanup;
        if(opening)try{await opening;}catch{}
        state.sourceCleanup=await (sourceCleanup||reader?.abort())||openCleanup||{settled:true};
        if(!state.sourceCleanup.settled)cleanupBlocked=true;
        state.source=reader?.stats()||state.source;reader=null;
        state.probeRetention=probeRetention.stats();
        if(buffer&&source?.readyState!=='closed')try{
          if(buffer.updating)buffer.abort();source.removeSourceBuffer(buffer);state.bufferRemoved=true;
        }catch{state.cleanupFailure='Q1_BUFFER_RELEASE';}
        buffer=null;
        if(url&&video.getAttribute('src')===url){video.pause();video.removeAttribute('src');video.load();}
        if(url){URL.revokeObjectURL(url);url=null;state.urlRevoked=true;}
        video.removeEventListener('error',mediaError);video.removeEventListener('seeking',nativeSeek);
        source?.removeEventListener('sourceclose',sourceClosed);source=null;state.disposed=true;
        return {settled:!cleanupBlocked&&!state.cleanupFailure,source:state.sourceCleanup};
      })();return disposal;
    }
    function fail(code){
      if(!current())return;state.phase='failed';state.failure||=code;readyReject(new Error(state.failure));
      probeRetention.clear();
      try{onEvent({type:'error',generation:id,code:state.failure});}catch{}finally{void dispose();}
    }
    const mediaError=()=>fail('Q1_MEDIA_ERROR'),sourceClosed=()=>fail('Q1_SOURCE_CLOSED');
    function nativeSeek(){
      if(!current()||internalSeek||!positioned||!buffer)return;
      if(!ranges().some(([a,b])=>a<=video.currentTime&&b>video.currentTime))
        player.seek(video.currentTime,{autoplay:!video.paused}).catch(()=>{});
    }
    const run={state,ready,dispose,completion:null};latest=run;
    run.completion=(async()=>{
      try{
        const prior=await priorCleanup;check();state.previousCleanup=prior||null;
        demand(!cleanupBlocked&&prior?.settled!==false,'CLEANUP_UNCONFIRMED');emit('starting',{time:seconds});
        async function openReader(){
          openCleanup=null;
          opening=Promise.resolve().then(()=>{check();return openSource({signal:controller.signal});}).then(value=>{reader=value;return value;},error=>{
            openCleanup=error?.cleanup||{settled:true};throw error;
          });
          await opening;opening=null;check();
        }
        await openReader();
        function bindIdentity(identity){
          if(baseline){demand(SAME_CONTENT.every(key=>baseline[key]===identity[key]),'CONTENT_DRIFT');
            if(checksum!==null)demand(identity.sha256Checksum===checksum,'CONTENT_DRIFT');
          }else baseline=identity;
          if(checksum===null&&identity.sha256Checksum)checksum=identity.sha256Checksum;
        }
        const identity=reader.identity;bindIdentity(identity);
        const read=async request=>{
          try{
            let bytes,retried=false;
            try{bytes=await reader.read({...request,signal:controller.signal});}
            catch(error){
              check();
              const recovery=error?.recovery;
              // Only a classified HTTP503, before any range bytes are exposed,
              // may retry. One budget belongs to the complete player lifetime,
              // including seeks; auto-generations cannot replenish it.
              if(error?.message!=='Q1_SOURCE_HTTP_UNAVAILABLE'||recovery?.phase!=='range-headers'
                ||recovery.status!==503||!Number.isFinite(recovery.retryAfterMs)
                ||recovery.retryAfterMs<250||recovery.retryAfterMs>2000||recoveries>=1)throw error;
              recoveries++;
              probeRetention.clear();
              // A failed read's preflight may have learned the first checksum.
              // Preserve that stronger fence before retiring the failed owner.
              bindIdentity(reader.identity);
              const failedSource=reader.stats(),cleanup=await reader.abort();
              state.recovery={attempt:recoveries,code:error.message,phase:recovery.phase,status:503,
                delayMs:recovery.retryAfterMs,source:failedSource,cleanup};
              if(cleanup?.settled!==true){cleanupBlocked=true;throw new Error('Q1_CLEANUP_UNCONFIRMED');}
              check();reader=null;openCleanup=cleanup;
              await backoff(recovery.retryAfterMs);check();
              await openReader();bindIdentity(reader.identity);
              // Neither parser nor worker has seen this failed range. Reuse the
              // exact interval once, with fresh pre/post identity checks.
              bytes=await reader.read({...request,signal:controller.signal});
              retried=true;
            }
            check();
            // Metadata may first expose a checksum during a successful read.
            // Carry that stronger binding across later seek generations too.
            bindIdentity(reader.identity);if(retried)state.recovery.completed=true;return bytes;
          }
          catch(error){if(current())state.failure||=fixed(error);throw error;}
        },size=Number(identity.size);
        const probeReader=reader;
        const plan=await probeTsSeek({read:request=>read({...request,probeRetention}),sourceSize:size,positionSeconds:seconds,onInput:input=>{
          check();
          // A503 recovery may replace the optimistic source during discovery.
          // Reuse only bytes admitted by this same reader/generation; otherwise
          // perform the original fresh pre/post-fenced bootstrap reads below.
          if(reader!==probeReader)return;
          bootstrap=createSeekBootstrap({generation:id,...input,isCurrent:current});check();
          state.probeInputReused=true;
        }});check();
        if(!bootstrap){
          let headBytes=await read({start:0,end:Math.min(size,Math.floor(65536/188)*188)-1});
          let bytes=await read({start:plan.local.windowStart,end:plan.local.windowEndExclusive-1});check();
          bootstrap=createSeekBootstrap({generation:id,headBytes,bytes,offset:plan.local.windowStart,plan,isCurrent:current});headBytes=null;bytes=null;
          state.probeInputReused=false;
        }
        const target=(plan.targetTicks-plan.timeline.originTicks)/90000;
        state.target=target;state.duration=plan.timeline.durationSeconds;state.timelineKind=plan.timeline.kind;
        state.phase='buffering';source=new Constructor();source.addEventListener('sourceclose',sourceClosed);
        video.addEventListener('error',mediaError);video.addEventListener('seeking',nativeSeek);
        if(Constructor===globalThis.ManagedMediaSource){video.disableRemotePlayback=true;remoteOwned=true;}
        url=URL.createObjectURL(source);await wait(source,'sourceopen',()=>{video.src=url;video.load();});check();
        video.defaultPlaybackRate=rate;video.playbackRate=rate;
        const sps=plan.rap.sps,codec=[sps[1],sps[2],sps[3]].map(value=>value.toString(16).padStart(2,'0')).join('');
        const mime=`video/mp4; codecs="avc1.${codec},mp4a.40.2"`;demand(Constructor.isTypeSupported(mime),'CODEC_UNAVAILABLE');
        buffer=source.addSourceBuffer(mime);buffer.timestampOffset=-plan.timeline.originTicks/90000;source.duration=plan.timeline.durationSeconds;
        function positionTarget(){
          if(positionTask||!ranges().some(([a,b])=>a<=target&&b>target))return;
          // Do not hold the worker ACK while waiting for seeked: near a GOP
          // boundary the decoder needs the following fragment to finish seek.
          positionTask=(async()=>{
            if(seconds>0){internalSeek=true;try{await wait(video,'seeked',()=>{video.currentTime=target;});}finally{internalSeek=false;}}
            check();positioned=true;state.phase='ready';emit('buffered',{time:target,duration:state.duration});readyResolve({time:target,duration:state.duration});
            if(play)try{await video.play();}catch(error){
              check();if(error?.name==='NotAllowedError')emit('gesture-required');else if(error?.name!=='AbortError')throw new Error('Q1_PLAY_REJECTED');
            }
          })();
          positionTask.catch(error=>{if(current())fail(fixed(error));});
        }
        frame();worker=createWorkerClient({generation:id,sourceSize:bootstrap.outputSize,onFragment:async message=>{
          try {
          await admit();check();let updated=false;const mark=()=>{updated=true;};buffer.addEventListener('update',mark,{once:true});
          try{await wait(buffer,'updateend',()=>buffer.appendBuffer(new Uint8Array(message.bytes)));}finally{buffer?.removeEventListener('update',mark);}
          check();demand(updated&&!video.error,'APPEND_FAILED');state.appends++;windowPlan();
          positionTarget();
          firstAppend=false;
          } catch(error) { if(current())state.failure||=fixed(error);throw error; }
        }});
        await worker.ready;check();
        for(let position=bootstrap.readStart;position<size;){
          check();if(!firstAppend)await admit();
          const end=Math.min(position+262143,size-1),raw=await read({start:position,end});check();
          for(let offset=0;offset<raw.length;offset+=65536){
            const transformed=bootstrap.push(raw.subarray(offset,offset+65536),{offset:position+offset,generation:id});
            for(let cursor=0;cursor<transformed.length;cursor+=65536){await worker.push(transformed.subarray(cursor,cursor+65536));check();}
          }position=end+1;
        }
        bootstrap.finish({sourceSize:size,generation:id});state.bootstrap=bootstrap.stats();
        await worker.finish();check();state.worker=worker.stats();state.source=reader.stats();
        demand(state.appends>0&&!buffer.updating,'NO_PRESENTABLE_TARGET');source.endOfStream();
        positionTarget();demand(positionTask,'NO_PRESENTABLE_TARGET');await positionTask;check();
        if(!video.ended)await wait(video,'ended',null,null);check();state.phase='ended';emit('ended');
      }catch(error){
        // A normal new seek preserves raw head/tail bytes only after its prior
        // owner has retired. Failure/drift and abandoned generations do not.
        if(current()||id===generation)probeRetention.clear();
        if(current()){state.failure||=fixed(error);state.phase='failed';readyReject(new Error(state.failure));
          try{onEvent({type:'error',generation:id,code:state.failure});}catch{}}
        else if(state.phase!=='failed')state.phase='cancelled';
        await dispose();
      }
      return state;
    })();return run;
  }
  const player={
    ready:null,seek(seconds,{autoplay=!video.paused}={}){return launch(seconds,autoplay).ready;},
    async dispose(){if(closed)return latest?.dispose();closed=true;generation++;probeRetention.clear();return latest?.dispose();},
    stats(){return latest?.state??null;},completion(){return latest?.completion;}
  };
  player.ready=launch(initialTime,autoplay).ready;return Object.freeze(player);
}
