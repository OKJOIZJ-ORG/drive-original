import {startGeneralWorker} from './general-owner.mjs';
const demand=(x,c)=>{if(!x)throw new Error(`GENERAL_${c}`);};
const safe=e=>/^(?:GENERAL|WORKER|TIMING|Q1_EXACT|Q1_SOURCE|AUDIO|Q3)_[A-Z0-9_]+$/.test(e?.message)?e.message:'GENERAL_PLAYBACK_FAILED';
const safeDiagnostic=value=>['tracks','packets','configuration','native-capability','timeline','decoder-open','audio-decode','output-open','video-mux','audio-encode','finalize'].includes(value?.phase)
 && ['Error','TypeError','RangeError','AbortError','NotSupportedError','EncodingError','DataError','InvalidStateError','QuotaExceededError','OperationError','RuntimeError','CompileError','LinkError','OtherError'].includes(value?.errorKind)
 ? {phase:value.phase,errorKind:value.errorKind,...(['allocated','unavailable'].includes(value.wasmMemory)?{wasmMemory:value.wasmMemory}:{})}:null;
const SAME=['accountKey','accountGeneration','fileId','headRevisionId','size','mimeType','modifiedTime'];
// Observe only bounded MP4 metadata. A requested MSE removal endpoint is rounded
// forward to the next RAP, so wall-clock subtraction is not a safe endpoint.
// Keep the requested end below that RAP across track ticks, native microsecond
// quantization, and floating-point rounding; the eight-second policy is unchanged.
export function createGeneralRapIndex(){
 let header=new Uint8Array(8),headerUsed=0,left=0,body=null,used=0,kind='',videoId=null,audioId=null,scale=null,editShift=0,defaults=0,pending=null,awaitingMdat=false;
 const raps=[];
 const cut=(r,offset)=>r.time+offset-Math.max(r.tick,0.000002,Math.abs(r.time+offset)*Number.EPSILON*2);
 const boxes=(b,start=0,end=b.length)=>{const out=[],v=new DataView(b.buffer,b.byteOffset,b.byteLength);for(let p=start;p<end;){demand(p+8<=end,'OUTPUT_BOX');const n=v.getUint32(p);demand(n>=8&&p+n<=end&&out.length<512,'OUTPUT_BOX');out.push({p,end:p+n,type:String.fromCharCode(...b.subarray(p+4,p+8))});p+=n;}return out;};
 const one=(list,type)=>{const a=list.filter(b=>b.type===type);demand(a.length===1,'OUTPUT_BOX');return a[0];};
 function metadata(b,type){const v=new DataView(b.buffer,b.byteOffset,b.byteLength),children=x=>boxes(b,x.p+8,x.end),u=(p,end)=>{demand(Number.isInteger(end)&&p>=0&&p+4<=end,'OUTPUT_BOX');return v.getUint32(p);},signed=(p,end)=>{u(p,end);return v.getInt32(p);};
  if(type==='moov'){
   demand(videoId===null&&audioId===null,'OUTPUT_INIT');const root=boxes(b),moov=one(root,'moov'),ids=new Set();
   for(const trak of children(moov).filter(x=>x.type==='trak')){const tc=children(trak),mdia=one(tc,'mdia'),mc=children(mdia),hdlr=one(mc,'hdlr');demand(hdlr.p+20<=hdlr.end,'OUTPUT_BOX');const handler=String.fromCharCode(...b.subarray(hdlr.p+16,hdlr.p+20));demand(handler==='vide'||handler==='soun','OUTPUT_INIT');
    const tkhd=one(tc,'tkhd'),mdhd=one(mc,'mdhd');demand((u(tkhd.p+8,tkhd.end)>>>24)<=1&&(u(mdhd.p+8,mdhd.end)>>>24)<=1,'OUTPUT_INIT');const id=u(tkhd.p+(b[tkhd.p+8]?28:20),tkhd.end),timescale=u(mdhd.p+(b[mdhd.p+8]?28:20),mdhd.end);demand(id>0&&timescale>0&&!ids.has(id)&&ids.size<2,'OUTPUT_INIT');ids.add(id);if(handler==='soun'){demand(audioId===null,'OUTPUT_INIT');audioId=id;continue;}
    demand(videoId===null,'OUTPUT_INIT');videoId=id;scale=timescale;const edts=tc.filter(x=>x.type==='edts');demand(edts.length<=1,'OUTPUT_EDIT');if(edts.length){const elst=one(children(edts[0]),'elst');demand((u(elst.p+8,elst.end)>>>24)<=1&&u(elst.p+12,elst.end)===1,'OUTPUT_EDIT');const version=b[elst.p+8],q=elst.p+16+(version?8:4);demand(q+(version?8:4)+4===elst.end,'OUTPUT_EDIT');let mediaTime=signed(q,elst.end);if(version)mediaTime=mediaTime*2**32+u(q+4,elst.end);demand(Number.isSafeInteger(mediaTime)&&mediaTime>=0&&u(q+(version?8:4),elst.end)===0x10000,'OUTPUT_EDIT');editShift=mediaTime/scale;}
   }
   demand(videoId!==null,'OUTPUT_INIT');for(const mvex of children(moov).filter(x=>x.type==='mvex'))for(const trex of children(mvex).filter(x=>x.type==='trex'))if(u(trex.p+12,trex.end)===videoId)defaults=u(trex.p+28,trex.end);
  }else{
   demand(videoId!==null&&!awaitingMdat&&pending===null,'OUTPUT_FRAGMENT');const moof=one(boxes(b),'moof'),ids=new Set();
   for(const traf of children(moof).filter(x=>x.type==='traf')){const tc=children(traf),tfhd=one(tc,'tfhd'),id=u(tfhd.p+12,tfhd.end);demand((id===videoId||id===audioId)&&!ids.has(id)&&ids.size<2,'OUTPUT_FRAGMENT');ids.add(id);const flags=u(tfhd.p+8,tfhd.end)&0xffffff;let p=tfhd.p+16;if(flags&1)p+=8;if(flags&2)p+=4;if(flags&8)p+=4;if(flags&16)p+=4;demand((flags&~0x2003b)===0&&p+(flags&32?4:0)===tfhd.end&&b[tfhd.p+8]===0,'OUTPUT_FRAGMENT');const sampleFlags=flags&32?u(p,tfhd.end):defaults;
    const tfdt=one(tc,'tfdt');demand((u(tfdt.p+8,tfdt.end)>>>24)<=1&&tfdt.p+(b[tfdt.p+8]?20:16)===tfdt.end,'OUTPUT_FRAGMENT');let dts=u(tfdt.p+12,tfdt.end);if(b[tfdt.p+8])dts=dts*2**32+u(tfdt.p+16,tfdt.end);demand(Number.isSafeInteger(dts),'OUTPUT_FRAGMENT');
    const trun=one(tc,'trun');demand(trun&&u(trun.p+12,trun.end)>0&&b[trun.p+8]<=1,'OUTPUT_FRAGMENT');const f=u(trun.p+8,trun.end)&0xffffff;demand(!(f&4&&f&1024)&&(f&~0xf05)===0,'OUTPUT_FRAGMENT');let q=trun.p+16;if(f&1)q+=4;let first=sampleFlags;if(f&4){first=u(q,trun.end);q+=4;}const count=u(trun.p+12,trun.end),stride=[256,512,1024,2048].filter(flag=>f&flag).length*4;demand(count<=4096&&q+count*stride===trun.end,'OUTPUT_FRAGMENT');if(id!==videoId)continue;if(f&256)q+=4;if(f&512)q+=4;if(f&1024){first=u(q,trun.end);q+=4;}let cto=0;if(f&2048){cto=b[trun.p+8]?signed(q,trun.end):u(q,trun.end);q+=4;}demand(q<=trun.end&&(first&0x10000)===0&&((first>>>24)&3)===2,'OUTPUT_RAP');pending={time:(dts+cto)/scale-editShift,tick:1/scale};demand(Number.isFinite(pending.time)&&pending.time>=0,'OUTPUT_RAP');
   }demand(ids.size>0,'OUTPUT_FRAGMENT');awaitingMdat=true;
  }
 }
 return {push(bytes){for(let p=0;p<bytes.length;){if(!left){const n=Math.min(8-headerUsed,bytes.length-p);header.set(bytes.subarray(p,p+n),headerUsed);headerUsed+=n;p+=n;if(headerUsed<8)continue;const size=new DataView(header.buffer).getUint32(0);demand(size>=8,'OUTPUT_BOX');kind=String.fromCharCode(...header.subarray(4));demand(!awaitingMdat||kind==='mdat','OUTPUT_FRAGMENT');if(kind==='mdat')demand(awaitingMdat&&size>8,'OUTPUT_FRAGMENT');left=size-8;used=8;if(kind==='moov'||kind==='moof')demand(size<=262144,'OUTPUT_METADATA_LIMIT');body=kind==='moov'||kind==='moof'?new Uint8Array(size):null;if(body)body.set(header);headerUsed=0;}
   const n=Math.min(left,bytes.length-p);if(body)body.set(bytes.subarray(p,p+n),used);used+=n;p+=n;left-=n;if(!left){if(body)metadata(body,kind);if(kind==='mdat'){if(pending){demand(raps.length<512&&!raps.some(r=>r.time>=pending.time),'OUTPUT_RAP_ORDER');raps.push(pending);pending=null;}awaitingMdat=false;}body=null;}
  }},safeEnd(now,offset=0){const r=raps.findLast(r=>r.time+offset>0&&r.time+offset<=now-8);return r?{boundary:r.time+offset,end:cut(r,offset)}:null;},canRetireBefore(end,start,offset=0,releaseEnd=0){return raps.some(r=>cut(r,offset)>start+.5&&r.time+offset>=releaseEnd&&r.time+offset+8<end);},retire(boundary,offset=0){while(raps.length&&raps[0].time+offset<boundary)raps.shift();},finish(){demand(left===0&&headerUsed===0&&pending===null&&!awaitingMdat,'OUTPUT_INCOMPLETE');},clear(){body=null;pending=null;awaitingMdat=false;raps.length=0;},stats(){return {raps:raps.length,metadataBytes:body?.length??0};}};
}
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
// An ended native buffer can round its final endpoint below the exact source
// clock. Display the original last frame only when that specific frame is
// retained and the requested time is no later than that frame's original end.
// This never invents a valid clock in an interior gap or chooses an earlier RAP.
export function resolveGeneralEndpointTarget(mapping,lastVideoFrame,buffered){
 const {targetSource,commonShift,sourceEnd}=mapping,frame=lastVideoFrame;
 if(!frame||![targetSource,commonShift,sourceEnd,frame.timestamp,frame.duration,frame.endTimestamp].every(Number.isFinite)
  ||frame.duration<=0||frame.endTimestamp!==frame.timestamp+frame.duration||frame.timestamp>=sourceEnd||frame.timestamp<mapping.sourceOrigin
  ||targetSource<frame.timestamp||targetSource>sourceEnd
  ||targetSource>frame.endTimestamp)return null;
 const element=frame.timestamp-commonShift,range=buffered.find(([a,b])=>a<=element&&element<b);
 if(!range||buffered.some(([a,b])=>a<=mapping.targetElement&&mapping.targetElement<b))return null;
 return {requestedSource:targetSource,targetSource:frame.timestamp,targetElement:element,
  frame:{...frame},bufferedRange:[...range],reason:'terminal-original-frame'};
}
// All public seek values are original source-clock seconds. `mapping` provides
// the common element/source/movie translation for the app's existing controls.
export function createGeneralPlayer({video,openSource,isCurrent,onEvent=()=>{},initialTime=0,autoplay=false,workerFactory,selectedAudioTrackId,nativeColorObservation}={}){
 demand(video&&typeof openSource==='function'&&typeof isCurrent==='function','OPTIONS');const MS=globalThis.MediaSource;demand(MS,'MSE_UNAVAILABLE');
 let serial=0,latest,closed=false,blocked=false,baseline,checksum;const originalRemote=video.disableRemotePlayback;
 const bind=identity=>{if(baseline){demand(SAME.every(k=>baseline[k]===identity[k]),'CONTENT_CHANGED');if(checksum)demand(checksum===identity.sha256Checksum,'CONTENT_CHANGED');}else baseline={...identity};checksum||=identity.sha256Checksum;};
 function launch(target,play){demand(Number.isFinite(target)&&target>=0&&!closed&&isCurrent(),'CLOSED');const id=++serial,previous=latest?.dispose(),controller=new AbortController();let active=true,reader,opening,openCleanup,media,sb,url,job,retiring,positionTask,positioned=false,internalSeek=false,mapping,resolveReady,rejectReady,appendDrain=Promise.resolve(),held=0,throttled=false,batchBytes=0,endTimer=null,sourceEnded=false;const cancels=new Set(),credits=[],rapIndex=createGeneralRapIndex();
  const state={generation:id,phase:'opening',failure:null,mapping:null,appends:0,removals:0,waits:0,peakAhead:0,peakRetainedAppendBytes:0,disposed:false};
  const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});ready.catch(()=>{});const current=()=>active&&serial===id&&!closed&&isCurrent();const check=()=>demand(current(),'CANCELLED');
  const emit=(type,data={})=>{check();onEvent({type,generation:id,...data});check();};
  function wait(t,event,action,timeout=10000){return new Promise((resolve,reject)=>{let done=false;const clean=()=>{clearTimeout(timer);t.removeEventListener(event,ok);t.removeEventListener('error',bad);t.removeEventListener('abort',bad);cancels.delete(cancel);};const finish=e=>{if(done)return;done=true;clean();e?reject(e):resolve();};const ok=()=>finish(),bad=()=>finish(new Error('GENERAL_MEDIA_ERROR')),cancel=()=>finish(new Error('GENERAL_CANCELLED'));const timer=timeout===null?null:setTimeout(()=>finish(new Error('GENERAL_MEDIA_TIMEOUT')),timeout);cancels.add(cancel);t.addEventListener(event,ok,{once:true});t.addEventListener('error',bad,{once:true});t.addEventListener('abort',bad,{once:true});if(!current())return cancel();try{action?.();}catch(e){finish(e);}});}
  function movement(){return new Promise((resolve,reject)=>{const names=['timeupdate','playing','seeking','pause'];const clean=()=>{for(const n of names)video.removeEventListener(n,wake);cancels.delete(cancel);};const wake=()=>{clean();resolve();},cancel=()=>{clean();reject(new Error('GENERAL_CANCELLED'));};cancels.add(cancel);for(const n of names)video.addEventListener(n,wake,{once:true});if(!current())cancel();});}
  const ranges=()=>sb?Array.from({length:sb.buffered.length},(_,i)=>[sb.buffered.start(i),sb.buffered.end(i)]):[];
  async function admit(bytes){for(;;){check();const rs=ranges(),now=positioned?video.currentTime:mapping.targetElement,end=rs.at(-1)?.[1]??now,ahead=Math.max(0,end-now);state.peakAhead=Math.max(state.peakAhead,ahead);const removal=rapIndex.safeEnd(now,mapping.timestampOffset),removeEnd=removal?.end??0;
    if(rs.length&&rs[0][0]<removeEnd-.5){await wait(sb,'updateend',()=>sb.remove(0,removeEnd));check();const after=ranges();demand(!after.length||after[0][0]>rs[0][0],'REMOVE_NO_PROGRESS');demand(after.some(([a,b])=>a<=now+.000002&&b>now),'REMOVE_CURRENT_RANGE');while(credits.length&&credits[0].end<=removal.boundary)held-=credits.shift().bytes;rapIndex.retire(removal.boundary,mapping.timestampOffset);state.removals++;continue;}
    if(ahead>=30)throttled=true;if(throttled&&ahead<=12)throttled=false;
    if(!throttled&&held+bytes<=24*1024*1024)return;if(held+bytes>24*1024*1024){let needed=held+bytes-24*1024*1024,releaseEnd=Infinity;for(const c of credits){needed-=c.bytes;if(needed<=0){releaseEnd=c.end;break;}}demand(rapIndex.canRetireBefore(end,rs[0]?.[0]??0,mapping.timestampOffset,releaseEnd),'RETENTION_LIMIT');}state.waits++;await movement();
  }}
  function position(){if(positionTask||!ranges().some(([a,b])=>a<=mapping.targetElement+.000002&&b>mapping.targetElement))return;
   positionTask=(async()=>{internalSeek=true;try{if(Math.abs(video.currentTime-mapping.targetElement)>.002)await wait(video,'seeked',()=>{video.currentTime=mapping.targetElement;});}finally{internalSeek=false;}check();positioned=true;state.phase='ready';resolveReady({...mapping});emit('buffered',{time:mapping.targetSource,duration:mapping.sourceEnd-mapping.sourceOrigin,mapping});if(play)try{await video.play();}catch(e){if(e.name==='NotAllowedError')emit('gesture-required');else if(e.name!=='AbortError')throw e;}})();positionTask.catch(fail);
  }
  async function dispose(){if(retiring)return retiring;active=false;clearTimeout(endTimer);for(const n of endEvents)video.removeEventListener(n,enforceSourceEnd);controller.abort();for(const cancel of [...cancels])cancel();rejectReady(new Error('GENERAL_CANCELLED'));if(sb?.updating&&media?.readyState==='open')try{sb.abort();}catch{}const stop=job?.cancel();
   retiring=(async()=>{await previous;try{await opening;}catch{}await appendDrain.catch(()=>{});const worker=await stop,source=await reader?.abort()||openCleanup;if(source?.settled===false||worker?.transportCleanup?.settled===false)blocked=true;
    if(sb&&media?.readyState==='open')try{media.removeSourceBuffer(sb);}catch{blocked=true;}sb=null;
    if(url&&video.getAttribute('src')===url){video.pause();video.removeAttribute('src');video.load();}if(url)URL.revokeObjectURL(url);url=null;video.removeEventListener('error',mediaError);video.removeEventListener('seeking',nativeSeek);media?.removeEventListener('sourceclose',sourceClosed);video.disableRemotePlayback=originalRemote;credits.length=0;held=0;rapIndex.clear();state.disposed=true;state.cleanup={settled:!blocked,source,worker:worker?.transportCleanup};return state.cleanup;})();return retiring;
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
   job=startGeneralWorker({source,generation:id,isCurrent:current,signal:controller.signal,workerFactory,targetTime:target,selectedAudioTrackId,nativeColorObservation,
    onWindow(w){check();const sourceOrigin=w.policy?.presentationOrigin??w.sourcePacketOrigin,commonShift=Math.min(sourceOrigin,w.windowOrigin),targetSource=Math.max(target,w.policy?.validPresentationStart??sourceOrigin,w.videoStartTimestamp);mapping={sourceOrigin,sourceEnd:w.sourceEndTimestamp,commonShift,targetSource,targetElement:targetSource-commonShift,timestampOffset:w.windowOrigin-commonShift};const copiedQ1=!w.status&&w.videoCodec==='avc'&&(!w.audioCodec||w.audioCodec==='aac');demand(Number.isFinite(mapping.sourceEnd)&&(targetSource<mapping.sourceEnd||(copiedQ1&&targetSource===mapping.sourceEnd)),'TARGET_OUTSIDE');
     const mime=`video/mp4; codecs="${[w.videoConfig.codec,w.audioConfig?.codec].filter(Boolean).join(',')}"`;demand(MS.isTypeSupported(mime),'CODEC_UNAVAILABLE');mapping.audioEnd=resolveGeneralAudioEnd(w,mapping);sb=media.addSourceBuffer(mime);sb.timestampOffset=mapping.timestampOffset;if(mapping.audioEnd)sb.appendWindowEnd=mapping.audioEnd.appendWindowEnd;media.duration=mapping.audioEnd?.appendWindowEnd??mapping.sourceEnd-commonShift;state.mapping=mapping;state.status=w.status??null;state.capability=w.capability??null;state.outputColorObservation=w.outputColorObservation??null;state.phase='buffering';emit('mapping',{...mapping,status:state.status,capability:state.capability});
    },async onChunk({bytes,batchEnd,batchSize,signal}){check();if(!batchBytes)await admit(batchSize??bytes.length);check();demand(!signal.aborted&&!sb.updating,'APPEND_OWNER');batchBytes+=bytes.length;demand(batchBytes<=8*1024*1024,'OUTPUT_BATCH_LIMIT');let finished;appendDrain=new Promise(r=>finished=r);try{await wait(sb,'updateend',()=>sb.appendBuffer(bytes));}finally{finished();}check();rapIndex.push(bytes);state.appends++;if(batchEnd){const end=ranges().at(-1)?.[1]??mapping.targetElement;credits.push({end,bytes:batchBytes});held+=batchBytes;batchBytes=0;demand(credits.length<=512,'APPEND_INDEX_LIMIT');state.peakRetainedAppendBytes=Math.max(state.peakRetainedAppendBytes,held);}position();}
   });const terminal=await job.done;check();state.worker=terminal.metrics;state.pipeline=terminal.result;state.failureDiagnostic=safeDiagnostic(terminal.error?.diagnostic);demand(terminal.transportCleanup?.settled===true,'CLEANUP_UNCONFIRMED');if(terminal.error)throw new Error(terminal.error.message);demand(!sb.updating&&batchBytes===0,'APPEND_UNSETTLED');rapIndex.finish();media.endOfStream();
   if(!positionTask&&terminal.result?.videoCodec==='avc'&&terminal.result?.encodersCreated===0){const endpoint=resolveGeneralEndpointTarget(mapping,terminal.result.lastVideoFrame,ranges());if(endpoint){mapping.endpoint=endpoint;mapping.targetSource=endpoint.targetSource;mapping.targetElement=endpoint.targetElement;}}
   position();demand(positionTask,'NO_PRESENTABLE_TARGET');await positionTask;check();state.phase='buffered-to-end';emit('buffered-to-end');
  }catch(e){if(e.cleanup)openCleanup=e.cleanup;if(current())fail(e);else if(state.phase!=='failed')state.phase='cancelled';}return state;})();return run;
 }
 const player={ready:null,seek(seconds,{autoplay=!video.paused}={}){return launch(seconds,autoplay).ready;},dispose(){closed=true;serial++;return latest?.dispose();},stats(){return latest?.state??null;},completion(){return latest?.completion;},sourceTime(){const m=latest?.state.mapping;return Math.min(m?.sourceEnd??Infinity,video.currentTime+(m?.commonShift??0));}};
 player.ready=launch(initialTime,autoplay).ready;return Object.freeze(player);
}
