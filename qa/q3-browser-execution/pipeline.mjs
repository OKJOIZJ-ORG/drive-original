// QA-only MPEG4 Part 2 -> VP9 proof. Not imported by the application.
import createCodec from './codec.mjs';
import {Output,WebMOutputFormat,StreamTarget,EncodedVideoPacketSource,EncodedPacket} from '../media-general-routing/vendor/mediabunny.min.mjs';
export async function run({manifest,startTime=0,signal,onChunk,onFrame=()=>{},readPacket}){
 const started=performance.now(),m=manifest,metrics={decoded:0,encoded:0,inputBytes:0,outputBytes:0,outputWriteBytes:0,peakQueue:0,peakWasmBytes:0,closed:false};
 const check=()=>{if(signal?.aborted)throw new DOMException('Q3_CANCELLED','AbortError')};
 if(!m.synthetic||m.codec!=='mpeg4'||m.hasBFrames||m.pixelFormat!=='yuv420p'||m.packets.some(p=>p.pts!==p.dts))throw Error('Q3_PROFILE_UNQUALIFIED');
 if(m.width!==320||m.height!==180||m.fps!==24||m.colorSpace?.primaries!=='bt709'||m.colorSpace.transfer!=='bt709'||m.colorSpace.matrix!=='bt709'||m.colorSpace.fullRange!==false)throw Error('Q3_FIXTURE_PROFILE_UNQUALIFIED');
 // The fixed fixture's MPEG4 visual_object_sequence profile-level byte is1.
 // Probe that exact Simple Profile indication, not the earlier .9 preflight.
 if(m.profile!=='Simple Profile'||m.extradata.slice(0,5).join(',')!=='0,0,1,176,1')throw Error('Q3_SOURCE_CODEC_PROFILE_UNQUALIFIED');
 if((await VideoDecoder.isConfigSupported({codec:'mp4v.20.1',codedWidth:m.width,codedHeight:m.height})).supported)throw Error('Q3_VIDEO_ALREADY_SUPPORTED');
 const config={codec:'vp09.00.10.08',width:m.width,height:m.height,bitrate:4000000,framerate:m.fps,latencyMode:'realtime',hardwareAcceleration:'prefer-software'};
 if(!(await VideoEncoder.isConfigSupported(config)).supported)throw Error('Q3_ENCODER_UNAVAILABLE');
 check();let wasm,decoder=0,extra=0,packet=0,raw=0,encoder,output,failure,write=Promise.resolve(),codecFailure;
 const first=m.packets.reduce((r,p,i)=>p.key&&p.pts<=startTime*1e6?i:r,0);
 const selected=m.packets.slice(first);
 try{
  wasm=await createCodec();check();extra=wasm._malloc(m.extradata.length);wasm.HEAPU8.set(m.extradata,extra);decoder=wasm._q3_open(extra,m.extradata.length);if(!decoder)throw Error('Q3_DECODER_INIT');
  const frameBytes=m.width*m.height*3/2;raw=wasm._malloc(frameBytes);packet=wasm._malloc(1048576);if(!raw||!packet)throw Error('Q3_ALLOC');
  const video=new EncodedVideoPacketSource('vp9');
  // Normal WebM rewrites bounded header/index fields so the finite output seeks.
  // Preserve positions; append-only WebM would weaken duration/seek acceptance.
  output=new Output({format:new WebMOutputFormat(),target:new StreamTarget(new WritableStream({async write({data,position}){check();const end=position+data.length;if(!Number.isSafeInteger(position)||position<0||!Number.isSafeInteger(end)||end>8*1024*1024||metrics.outputWriteBytes+data.length>16*1024*1024)throw Error('Q3_OUTPUT_BUDGET');metrics.outputBytes=Math.max(metrics.outputBytes,end);metrics.outputWriteBytes+=data.length;await onChunk(data,position);check()}},{highWaterMark:1}))});
  output.addVideoTrack(video);await output.start();
  encoder=new VideoEncoder({error:e=>{codecFailure=e},output:(chunk,metadata)=>{metrics.encoded++;write=write.then(()=>video.add(EncodedPacket.fromEncodedChunk(chunk),metadata));write.catch(()=>{});}});encoder.configure(config);
  for(const [i,p] of selected.entries()){
   check();if(p.size<1||p.size>1048576)throw Error('Q3_PACKET_BUDGET');const bytes=await readPacket(p,signal);check();if(bytes.byteLength!==p.size)throw Error('Q3_PACKET_SHORT');metrics.inputBytes+=bytes.byteLength;wasm.HEAPU8.set(bytes,packet);
   if(wasm._q3_send(decoder,packet,p.size,p.pts)<0||wasm._q3_receive(decoder)<0)throw Error('Q3_DECODE');
   if(wasm._q3_width(decoder)!==m.width||wasm._q3_height(decoder)!==m.height||wasm._q3_format(decoder)!==0||wasm._q3_copy(decoder,raw,frameBytes)!==frameBytes)throw Error('Q3_FRAME_FORMAT');
   const frame=new VideoFrame(wasm.HEAPU8.slice(raw,raw+frameBytes),{format:'I420',codedWidth:m.width,codedHeight:m.height,timestamp:p.pts,duration:p.duration,colorSpace:m.colorSpace});
   try{encoder.encode(frame,{keyFrame:i===0||p.key});metrics.peakQueue=Math.max(metrics.peakQueue,encoder.encodeQueueSize)}finally{frame.close()}
   metrics.decoded++;metrics.peakWasmBytes=Math.max(metrics.peakWasmBytes,wasm.HEAPU8.buffer.byteLength);
   await encoder.flush();await write;check();if(codecFailure)throw codecFailure;await onFrame(metrics.decoded);check();
  }
  await output.finalize();check();
 }catch(e){failure=e}
 finally{
  if(encoder&&encoder.state!=='closed')encoder.close();
  if(output&&output.state!=='finalized')await output.cancel().catch(()=>{});
  await write.catch(()=>{});
  if(wasm){if(decoder)wasm._q3_close(decoder);for(const ptr of [extra,packet,raw])if(ptr)wasm._free(ptr)}
  metrics.closed=true;metrics.elapsedMs=performance.now()-started;metrics.sourceSeconds=selected.length/m.fps;metrics.processingRate=metrics.sourceSeconds/(metrics.elapsedMs/1000);
 }
 if(failure){failure.metrics=metrics;throw failure}return{...metrics,firstTimestamp:selected[0].pts,lastTimestamp:selected.at(-1).pts,config,colorSpace:m.colorSpace};
}
