import {startGeneralWorker} from './general-owner.mjs';
const demand=(x,c)=>{if(!x)throw new Error(`GENERAL_${c}`);};
const safe=e=>/^(?:GENERAL|WORKER|TIMING|Q1_EXACT|Q1_SOURCE|AUDIO)_[A-Z0-9_]+$/.test(e?.message)?e.message:'GENERAL_PLAYBACK_FAILED';
const safeDiagnostic=value=>['tracks','packets','configuration','native-capability','timeline','decoder-open','audio-decode','output-open','video-mux','audio-encode','finalize'].includes(value?.phase)
 && ['Error','TypeError','RangeError','AbortError','NotSupportedError','EncodingError','DataError','InvalidStateError','QuotaExceededError','OperationError','RuntimeError','CompileError','LinkError','OtherError'].includes(value?.errorKind)
 ? {phase:value.phase,errorKind:value.errorKind,...(['allocated','unavailable'].includes(value.wasmMemory)?{wasmMemory:value.wasmMemory}:{})}:null;
const SAME=['accountKey','accountGeneration','fileId','headRevisionId','size','mimeType','modifiedTime'];
export function resolveGeneralAudioEnd(window,mapping){
 if(window.status?.level!=='Q2'&&window.audioConfig?.codec!=='opus')return null;
 const config=window.audioConfig,description=config?.description;
 const head=ArrayBuffer.isView(description)?new Uint8Array(description.buffer,description.byteOffset,description.byteLength):description instanceof ArrayBuffer?new Uint8Array(description):null;
 const valid=window.status?.level==='Q2'&&window.status.bitPerfectAudio===false
  &&config?.codec==='opus'&&config.sampleRate===48000&&config.numberOfChannels===2
  &&head?.length===19&&[79,112,117,115,72,101,97,100].every((b,i)=>head[i]===b)
  &&head[8]===1&&head[9]===2&&head[18]===0;
 if(!valid)throw new Error('AUDIO_OPUS_END_CONFIG_UNQUALIFIED');
 const view=new DataView(head.buffer,head.byteOffset,head.byteLength);
 if(view.getUint32(12,true)!==config.sampleRate||view.getInt16(16,true)!==0)throw new Error('AUDIO_OPUS_END_CONFIG_UNQUALIFIED');
 const preSkip=view.getUint16(10,true),appendWindowEnd=mapping.sourceEnd-mapping.commonShift+preSkip/config.sampleRate;
 if(!Number.isFinite(appendWindowEnd)||appendWindowEnd<=0)throw new Error('AUDIO_OPUS_END_CLOCK_INVALID');
 return Object.freeze({preSkip,sampleRate:config.sampleRate,appendWindowEnd});
}
// All public seek values are original source-clock seconds. `mapping` provides
// the common element/source/movie translation for the app's existing controls.
export function createGeneralPlayer({video,openSource,isCurrent,onEvent=()=>{},initialTime=0,autoplay=false,workerFactory}={}){
 demand(video&&typeof openSource==='function'&&typeof isCurrent==='function','OPTIONS');const MS=globalThis.MediaSource;demand(MS,'MSE_UNAVAILABLE');
 let serial=0,latest,closed=false,blocked=false,baseline,checksum;const originalRemote=video.disableRemotePlayback;
 const bind=identity=>{if(baseline){demand(SAME.every(k=>baseline[k]===identity[k]),'CONTENT_CHANGED');if(checksum)demand(checksum===identity.sha256Checksum,'CONTENT_CHANGED');}else baseline={...identity};checksum||=identity.sha256Checksum;};
 function launch(target,play){demand(Number.isFinite(target)&&target>=0&&!closed&&isCurrent(),'CLOSED');const id=++serial,previous=latest?.dispose(),controller=new AbortController();let active=true,reader,opening,openCleanup,media,sb,url,job,retiring,positionTask,positioned=false,internalSeek=false,mapping,resolveReady,rejectReady,appendDrain=Promise.resolve(),held=0,throttled=false,batchBytes=0,endTimer=null,sourceEnded=false;const cancels=new Set(),credits=[];
  const state={generation:id,phase:'opening',failure:null,mapping:null,appends:0,removals:0,waits:0,peakAhead:0,peakRetainedAppendBytes:0,disposed:false};
  const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});ready.catch(()=>{});const current=()=>active&&serial===id&&!closed&&isCurrent();const check=()=>demand(current(),'CANCELLED');
  const emit=(type,data={})=>{check();onEvent({type,generation:id,...data});check();};
  function wait(t,event,action,timeout=10000){return new Promise((resolve,reject)=>{let done=false;const clean=()=>{clearTimeout(timer);t.removeEventListener(event,ok);t.removeEventListener('error',bad);t.removeEventListener('abort',bad);cancels.delete(cancel);};const finish=e=>{if(done)return;done=true;clean();e?reject(e):resolve();};const ok=()=>finish(),bad=()=>finish(new Error('GENERAL_MEDIA_ERROR')),cancel=()=>finish(new Error('GENERAL_CANCELLED'));const timer=timeout===null?null:setTimeout(()=>finish(new Error('GENERAL_MEDIA_TIMEOUT')),timeout);cancels.add(cancel);t.addEventListener(event,ok,{once:true});t.addEventListener('error',bad,{once:true});t.addEventListener('abort',bad,{once:true});if(!current())return cancel();try{action?.();}catch(e){finish(e);}});}
  function movement(){return new Promise((resolve,reject)=>{const names=['timeupdate','playing','seeking','pause'];const clean=()=>{for(const n of names)video.removeEventListener(n,wake);cancels.delete(cancel);};const wake=()=>{clean();resolve();},cancel=()=>{clean();reject(new Error('GENERAL_CANCELLED'));};cancels.add(cancel);for(const n of names)video.addEventListener(n,wake,{once:true});if(!current())cancel();});}
  const ranges=()=>sb?Array.from({length:sb.buffered.length},(_,i)=>[sb.buffered.start(i),sb.buffered.end(i)]):[];
  async function admit(bytes){for(;;){check();const rs=ranges(),now=positioned?video.currentTime:mapping.targetElement,end=rs.at(-1)?.[1]??now,ahead=Math.max(0,end-now);state.peakAhead=Math.max(state.peakAhead,ahead);const removeEnd=Math.max(0,now-8);
    if(rs.length&&rs[0][0]<removeEnd-.5){await wait(sb,'updateend',()=>sb.remove(0,removeEnd));check();const after=ranges();demand(!after.length||after[0][0]>rs[0][0],'REMOVE_NO_PROGRESS');demand(after.some(([a,b])=>a<=now+.000002&&b>now),'REMOVE_CURRENT_RANGE');while(credits.length&&credits[0].end<=removeEnd)held-=credits.shift().bytes;state.removals++;continue;}
    if(ahead>=30)throttled=true;if(throttled&&ahead<=12)throttled=false;
    if(!throttled&&held+bytes<=24*1024*1024)return;state.waits++;await movement();
  }}
  function position(){if(positionTask||!ranges().some(([a,b])=>a<=mapping.targetElement+.000002&&b>mapping.targetElement))return;
   positionTask=(async()=>{internalSeek=true;try{if(Math.abs(video.currentTime-mapping.targetElement)>.002)await wait(video,'seeked',()=>{video.currentTime=mapping.targetElement;});}finally{internalSeek=false;}check();positioned=true;state.phase='ready';resolveReady({...mapping});emit('buffered',{time:mapping.targetSource,duration:mapping.sourceEnd-mapping.sourceOrigin,mapping});if(play)try{await video.play();}catch(e){if(e.name==='NotAllowedError')emit('gesture-required');else if(e.name!=='AbortError')throw e;}})();positionTask.catch(fail);
  }
  async function dispose(){if(retiring)return retiring;active=false;clearTimeout(endTimer);for(const n of endEvents)video.removeEventListener(n,enforceSourceEnd);controller.abort();for(const cancel of [...cancels])cancel();rejectReady(new Error('GENERAL_CANCELLED'));if(sb?.updating&&media?.readyState==='open')try{sb.abort();}catch{}const stop=job?.cancel();
   retiring=(async()=>{await previous;try{await opening;}catch{}await appendDrain.catch(()=>{});const worker=await stop,source=await reader?.abort()||openCleanup;if(source?.settled===false||worker?.transportCleanup?.settled===false)blocked=true;
    if(sb&&media?.readyState==='open')try{media.removeSourceBuffer(sb);}catch{blocked=true;}sb=null;
    if(url&&video.getAttribute('src')===url){video.pause();video.removeAttribute('src');video.load();}if(url)URL.revokeObjectURL(url);url=null;video.removeEventListener('error',mediaError);video.removeEventListener('seeking',nativeSeek);media?.removeEventListener('sourceclose',sourceClosed);video.disableRemotePlayback=originalRemote;credits.length=0;held=0;state.disposed=true;state.cleanup={settled:!blocked,source,worker:worker?.transportCleanup};return state.cleanup;})();return retiring;
  }
  function fail(e){if(!current())return;state.failure=safe(e);state.phase='failed';rejectReady(new Error(state.failure));try{onEvent({type:'error',generation:id,code:state.failure});}catch{}finally{void dispose();}}
  // Opus append trimming owns the audible endpoint. Let MSE finish its decoder
  // delay compensation; pausing at the UI clock would cut valid final samples.
  const endEvents=['timeupdate','playing','pause','ratechange','seeked','ended'];
  function enforceSourceEnd(){clearTimeout(endTimer);if(!current()||!mapping||!positioned)return;const end=mapping.sourceEnd-mapping.commonShift,remaining=end-video.currentTime;
   if(state.status?.level==='Q2'){if(video.ended&&!sourceEnded){sourceEnded=true;emit('source-ended',{sourceEnd:mapping.sourceEnd});}return;}
   if(remaining<=0){video.pause();if(!sourceEnded){sourceEnded=true;emit('source-ended',{sourceEnd:mapping.sourceEnd});}return;}
   sourceEnded=false;if(!video.paused&&video.playbackRate>0)endTimer=setTimeout(enforceSourceEnd,Math.max(1,Math.min(1000,remaining/video.playbackRate*1000)));
  }
  const mediaError=()=>fail(new Error('GENERAL_MEDIA_ERROR')),sourceClosed=()=>fail(new Error('GENERAL_SOURCE_CLOSED'));
  const nativeSeek=()=>{if(current()&&positioned&&!internalSeek&&!ranges().some(([a,b])=>a<=video.currentTime&&b>video.currentTime))player.seek(video.currentTime+mapping.commonShift,{autoplay:!video.paused}).catch(()=>{});};
  const run={ready,dispose,state,completion:null};latest=run;
  run.completion=(async()=>{try{const prior=await previous;check();demand(!blocked&&prior?.settled!==false,'CLEANUP_UNCONFIRMED');emit('starting',{time:target});opening=Promise.resolve(openSource({signal:controller.signal})).then(value=>{reader=value;return value;});await opening;opening=null;check();bind(reader.identity);
   media=new MS();media.addEventListener('sourceclose',sourceClosed);video.addEventListener('error',mediaError);video.addEventListener('seeking',nativeSeek);for(const n of endEvents)video.addEventListener(n,enforceSourceEnd);url=URL.createObjectURL(media);await wait(media,'sourceopen',()=>{video.src=url;video.load();});check();
   const source={get identity(){return reader.identity;},async read(range){const bytes=await reader.read(range);check();bind(reader.identity);return bytes;},abort:()=>reader.abort()};
   job=startGeneralWorker({source,generation:id,isCurrent:current,signal:controller.signal,workerFactory,targetTime:target,
    onWindow(w){check();const sourceOrigin=w.policy?.presentationOrigin??w.sourcePacketOrigin,commonShift=Math.min(sourceOrigin,w.windowOrigin),targetSource=Math.max(target,w.policy?.validPresentationStart??sourceOrigin,w.videoStartTimestamp);mapping={sourceOrigin,sourceEnd:w.sourceEndTimestamp,commonShift,targetSource,targetElement:targetSource-commonShift,timestampOffset:w.windowOrigin-commonShift};demand(Number.isFinite(mapping.sourceEnd)&&targetSource<mapping.sourceEnd,'TARGET_OUTSIDE');
     const mime=`video/mp4; codecs="${[w.videoConfig.codec,w.audioConfig?.codec].filter(Boolean).join(',')}"`;demand(MS.isTypeSupported(mime),'CODEC_UNAVAILABLE');mapping.audioEnd=resolveGeneralAudioEnd(w,mapping);sb=media.addSourceBuffer(mime);sb.timestampOffset=mapping.timestampOffset;if(mapping.audioEnd)sb.appendWindowEnd=mapping.audioEnd.appendWindowEnd;media.duration=mapping.audioEnd?.appendWindowEnd??mapping.sourceEnd-commonShift;state.mapping=mapping;state.status=w.status??null;state.capability=w.capability??null;state.phase='buffering';emit('mapping',{...mapping,status:state.status,capability:state.capability});
    },async onChunk({bytes,batchEnd,batchSize,signal}){check();if(!batchBytes)await admit(batchSize??bytes.length);check();demand(!signal.aborted&&!sb.updating,'APPEND_OWNER');batchBytes+=bytes.length;demand(batchBytes<=8*1024*1024,'OUTPUT_BATCH_LIMIT');let finished;appendDrain=new Promise(r=>finished=r);try{await wait(sb,'updateend',()=>sb.appendBuffer(bytes));}finally{finished();}check();state.appends++;if(batchEnd){const end=ranges().at(-1)?.[1]??mapping.targetElement;credits.push({end,bytes:batchBytes});held+=batchBytes;batchBytes=0;demand(credits.length<=512,'APPEND_INDEX_LIMIT');state.peakRetainedAppendBytes=Math.max(state.peakRetainedAppendBytes,held);}position();}
   });const terminal=await job.done;check();state.worker=terminal.metrics;state.pipeline=terminal.result;state.failureDiagnostic=safeDiagnostic(terminal.error?.diagnostic);demand(terminal.transportCleanup?.settled===true,'CLEANUP_UNCONFIRMED');if(terminal.error)throw new Error(terminal.error.message);demand(!sb.updating&&batchBytes===0,'APPEND_UNSETTLED');media.endOfStream();position();demand(positionTask,'NO_PRESENTABLE_TARGET');await positionTask;check();state.phase='buffered-to-end';emit('buffered-to-end');
  }catch(e){if(e.cleanup)openCleanup=e.cleanup;if(current())fail(e);else if(state.phase!=='failed')state.phase='cancelled';}return state;})();return run;
 }
 const player={ready:null,seek(seconds,{autoplay=!video.paused}={}){return launch(seconds,autoplay).ready;},dispose(){closed=true;serial++;return latest?.dispose();},stats(){return latest?.state??null;},completion(){return latest?.completion;},sourceTime(){const m=latest?.state.mapping;return Math.min(m?.sourceEnd??Infinity,video.currentTime+(m?.commonShift??0));}};
 player.ready=launch(initialTime,autoplay).ready;return Object.freeze(player);
}
