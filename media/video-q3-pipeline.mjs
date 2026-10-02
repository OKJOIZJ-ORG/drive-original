import {createGeneralSource} from './general-source.mjs';
import {validateInitialPresentationTime,resolveInitialPresentationTime} from './general-timeline.mjs';
import {readQ3Input,inspectQ3Packet,Q3_LIMITS} from './video-q3-input.mjs';
import {Output,Mp4OutputFormat,StreamTarget,EncodedVideoPacketSource,EncodedPacket} from './mediabunny-q1.mjs';
const demand=(condition,code)=>{if(!condition)throw new Error(`Q3_${code}`);};
export const Q3_STATUS=Object.freeze({level:'Q3',video:'lossy-transformed',audio:'absent',codec:'vp9',bitPerfectVideo:false});
async function cancellable(value,signal){let abort;try{return await Promise.race([value,new Promise((_,reject)=>{abort=()=>reject(new Error('Q3_CANCELLED'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();})]);}finally{signal?.removeEventListener('abort',abort);}}
export async function observeQ3Capability(input,{scope=globalThis,signal,nativeRejected=false}={}){
 demand(!signal?.aborted,'CANCELLED');
 // A generic native error, or absent/query-failing WebCodecs, cannot prove this
 // codec is unsupported. Require exact input rejection independently of Q1/Q2.
 let inputSupported=null;try{const result=await cancellable(scope.VideoDecoder?.isConfigSupported?.({codec:input.codec,codedWidth:input.width,codedHeight:input.height,description:input.extradata}),signal);inputSupported=typeof result?.supported==='boolean'?result.supported:null;}catch(error){if(signal?.aborted)throw error;}
 const bitrate=Math.max(4000000,Math.ceil(input.width*input.height*input.fps*0.75));
 const outputConfig={codec:bitrate>30000000?'vp09.00.51.08':'vp09.00.41.08',width:input.width,height:input.height,framerate:input.fps,
  bitrate,latencyMode:'realtime',hardwareAcceleration:'prefer-software'};
 let encoderSupported=null;try{const result=await cancellable(scope.VideoEncoder?.isConfigSupported?.(outputConfig),signal);encoderSupported=typeof result?.supported==='boolean'?result.supported:null;}catch(error){if(signal?.aborted)throw error;}
 let mseSupported=false;try{mseSupported=scope.MediaSource?.isTypeSupported?.(`video/mp4; codecs="${outputConfig.codec}"`)===true;}catch{}
 demand(!signal?.aborted,'CANCELLED');return {eligible:nativeRejected===true&&inputSupported===false&&encoderSupported===true&&mseSupported,inputSupported,encoderSupported,mseSupported,outputConfig,status:Q3_STATUS};
}
export async function probePinnedQ3Video(source,{signal,isCurrent=()=>true,scope=globalThis,nativeRejected=false}={}){
 const rpc=createGeneralSource(source,{signal,isCurrent});let result,failure;try{const input=await readQ3Input(rpc);rpc.check();const capability=await observeQ3Capability(input,{scope,signal,nativeRejected});rpc.check();result={route:capability.eligible?'q3':'unsupported',codec:input.codec,width:input.width,height:input.height,capability};}catch(error){failure=error;}finally{let cleanup;try{cleanup=await rpc.cleanup();}catch{cleanup={settled:false,transportFailed:true};}if(!cleanup.settled)failure=Object.assign(new Error('Q3_SOURCE_CLEANUP_UNSETTLED'),{cleanup});else if(failure)failure.cleanup=cleanup;}if(failure)throw failure;return result;
}
// Worker-only packet decoder -> native encoder -> bounded fragmented MP4.
// Original source clocks live in JS, never in the prototype bridge's int PTS.
export async function streamGeneralQ3({source,generation=1,signal,isCurrent=()=>true,targetTime=0,initialPresentationTime,endTime=Infinity,onChunk,onWindow=()=>{},limits={},
 loadModule=async()=> (await import('./video-q3-codec.mjs')).default(),scope=globalThis}){
 demand(typeof onChunk==='function'&&Number.isFinite(targetTime)&&targetTime>=0&&endTime===Infinity,'OPTIONS');
 const rpc=createGeneralSource(source,{signal,isCurrent,...limits,blockSize:524288,maxCacheSize:524288});let m,decoder=0,extra=0,packet=0,raw=0,encoder,output,failure,result,encodeError,pendingEncoded,expectedTimestamp;
 const metrics={decoded:0,encoded:0,peakHeapBytes:0,peakEncoderQueue:0,peakMuxBytes:0,peakMuxSamples:0,outputBytes:0,peakPendingAcks:0,closed:false};
 try{
  validateInitialPresentationTime(initialPresentationTime,targetTime);
  const input=await readQ3Input(rpc);rpc.check();
  targetTime=resolveInitialPresentationTime(initialPresentationTime,{sourceOrigin:0,sourceEnd:input.duration},targetTime);demand(targetTime<input.duration,'TARGET_OUTSIDE');
  const capability=await observeQ3Capability(input,{scope,signal,nativeRejected:true});rpc.check();demand(capability.eligible,'CAPABILITY_UNAVAILABLE');
  m=await loadModule();rpc.check();demand(m.HEAPU8.buffer.byteLength<=67108864,'HEAP_LIMIT');
  extra=m._malloc(input.extradata.length);demand(extra,'ALLOC');m.HEAPU8.set(input.extradata,extra);decoder=m._q3_open(extra,input.extradata.length);demand(decoder,'DECODER_INIT');
  const frameBytes=input.width*input.height*3/2;raw=m._malloc(frameBytes);packet=m._malloc(Q3_LIMITS.packetBytes);demand(raw&&packet,'ALLOC');
  const video=new EncodedVideoPacketSource('vp9');let position=0,windowSent=false,first=true,bufferedPackets=0;
  const bufferedHeaders=[];let headerBytes=0,finalConfig;
  const dispatch=async(data,offset)=>{for(let p=0;p<data.length;p+=262144){rpc.check();const bytes=data.slice(p,p+262144);metrics.peakPendingAcks=1;await cancellable(Promise.resolve(onChunk({generation,bytes,position:offset+p,batchSize:data.length,batchEnd:p+bytes.length===data.length})),signal);rpc.check();}bufferedPackets=0;};
  const target=new StreamTarget(new WritableStream({async write({data,position:offset}){
   rpc.check();demand(offset===position&&data.length<=8388608&&Number.isSafeInteger(position+data.length),'OUTPUT_LIMIT');position+=data.length;metrics.outputBytes=position;
   if(!finalConfig){demand(headerBytes+data.length<=65536,'ENCODER_CONFIG_REQUIRED');bufferedHeaders.push({data:data.slice(),offset});headerBytes+=data.length;return;}
   if(!windowSent){await onWindow({generation,...(initialPresentationTime!==undefined?{initialSourceTime:targetTime}:{}),sourcePacketOrigin:0,windowOrigin:0,videoStartTimestamp:input.packets[start].timestamp,sourceEndTimestamp:input.duration,videoConfig:finalConfig,videoCodec:'vp9',audioCodec:null,status:Q3_STATUS,capability});rpc.check();windowSent=true;}
   for(const header of bufferedHeaders)await dispatch(header.data,header.offset);bufferedHeaders.length=0;headerBytes=0;await dispatch(data,offset);
  }},{highWaterMark:1}));
  output=new Output({format:new Mp4OutputFormat({fastStart:'fragmented',minimumFragmentDuration:1}),target});
  output.addVideoTrack(video,{q1Timescale:1000000,q1Streaming:true});
  encoder=new scope.VideoEncoder({error:error=>{encodeError=error;},output(chunk,metadata){
   try{demand(!pendingEncoded&&chunk.timestamp===expectedTimestamp&&chunk.byteLength<=Q3_LIMITS.packetBytes,'ENCODER_OUTPUT_UNQUALIFIED');
    const config=metadata?.decoderConfig;if(config){demand(config.codec.startsWith('vp09.00.')&&config.codedWidth===input.width&&config.codedHeight===input.height,'ENCODER_CONFIG_CHANGED');for(const key of ['primaries','transfer','matrix','fullRange'])demand(config.colorSpace?.[key]===input.colorSpace[key],'ENCODER_COLOR_CHANGED');finalConfig={...config,description:config.description&&new Uint8Array(config.description).slice()};}
    pendingEncoded={packet:EncodedPacket.fromEncodedChunk(chunk).clone({sideData:{q1Dts:chunk.timestamp/1e6,q1DecodeDuration:chunk.duration/1e6}}),metadata};metrics.encoded++;
   }catch(error){encodeError=error;}
  }});encoder.configure(capability.outputConfig);
  let start=0;for(let i=0;i<input.packets.length;i++)if(input.packets[i].key&&input.packets[i].timestamp<=targetTime)start=i;
  await output.start();rpc.check();rpc.beginStreaming();
  for(let i=start;i<input.packets.length;i++){
   rpc.check();const p=input.packets[i],bytes=await rpc.exact(p.start,p.size);rpc.check();inspectQ3Packet(bytes,p.key);m.HEAPU8.set(bytes,packet);
   demand(m._q3_send(decoder,packet,p.size,0)>=0&&m._q3_receive(decoder)>=0,'DECODE_FAILED');
   demand(m._q3_width(decoder)===input.width&&m._q3_height(decoder)===input.height&&m._q3_format(decoder)===0&&m._q3_picture_metadata(decoder)===1&&m._q3_copy(decoder,raw,frameBytes)===frameBytes,'FRAME_FORMAT_CHANGED');
   // A second output would violate the admitted one-VOP/non-reordered mapping.
   demand(m._q3_packet_drained(decoder)===1,'DECODE_BUFFER_UNQUALIFIED');
   expectedTimestamp=Math.round(p.timestamp*1e6);const duration=Math.round((p.timestamp+p.duration)*1e6)-expectedTimestamp;
   demand(Number.isSafeInteger(expectedTimestamp)&&duration>0,'CLOCK_UNQUALIFIED');
   const frame=new scope.VideoFrame(m.HEAPU8.slice(raw,raw+frameBytes),{format:'I420',codedWidth:input.width,codedHeight:input.height,timestamp:expectedTimestamp,duration,colorSpace:input.colorSpace});
   try{encoder.encode(frame,{keyFrame:i===start||p.key});metrics.peakEncoderQueue=Math.max(metrics.peakEncoderQueue,encoder.encodeQueueSize);}finally{frame.close();}
   await cancellable(encoder.flush(),signal);rpc.check();if(encodeError)throw encodeError;demand(pendingEncoded&&finalConfig,'ENCODER_OUTPUT_REQUIRED');
   const encoded=pendingEncoded;pendingEncoded=null;bufferedPackets+=encoded.packet.data.length;demand(bufferedPackets<=4194304,'MUX_PACKET_LIMIT');
   await video.add(encoded.packet,first?{decoderConfig:finalConfig}:undefined);first=false;rpc.check();metrics.decoded++;
   metrics.peakHeapBytes=Math.max(metrics.peakHeapBytes,m.HEAPU8.buffer.byteLength);demand(metrics.peakHeapBytes<=67108864,'HEAP_LIMIT');
   metrics.peakMuxBytes=Math.max(metrics.peakMuxBytes,output._muxer.q1Retention.bytes);metrics.peakMuxSamples=Math.max(metrics.peakMuxSamples,output._muxer.q1Retention.samples);
   demand(metrics.peakMuxBytes<=4194304&&metrics.peakMuxSamples<=4096,'MUX_RETENTION_LIMIT');
  }
  demand(m._q3_finish(decoder)===1,'DECODE_DRAIN_UNQUALIFIED');
  await output.finalize();rpc.check();demand(windowSent&&headerBytes===0,'OUTPUT_UNSETTLED');result={generation,targetTime,duration:input.duration,status:Q3_STATUS,metrics,capability,sourceCodec:input.codec};
 }catch(error){failure=error;}
 finally{
  if(encoder&&encoder.state!=='closed')encoder.close();if(output&&output.state!=='finalized')await output.cancel().catch(()=>{});pendingEncoded=null;
  if(m){if(decoder)m._q3_close(decoder);for(const p of [extra,packet,raw])if(p)m._free(p);}metrics.closed=true;
  const cleanup=await rpc.cleanup();if(!cleanup.settled&&!failure)failure=new Error('Q3_SOURCE_CLEANUP_UNSETTLED');if(failure){failure.cleanup=cleanup;failure.reads=rpc.metrics;}if(result){result.cleanup=cleanup;result.reads=rpc.metrics;}
 }
 if(failure){if(!/^(?:GENERAL|Q3|TIMING)_[A-Z0-9_]+$/.test(failure.message))failure=Object.assign(new Error('Q3_PIPELINE_FAILED'),{cleanup:failure.cleanup,reads:failure.reads});throw failure;}return result;
}
