import {openDriveQ1Source} from '/media/drive-source.mjs';
import {remuxQ1} from './q1-pipeline.mjs';
const assert=(x,m)=>{if(!x)throw new Error(m);};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const once=(t,n,ms=6000)=>new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{t.removeEventListener(n,done);reject(new Error('TIMEOUT:'+n));},ms);t.addEventListener(n,done,{once:true});});
async function snapshot(v,target){v.pause();let callback;const presented=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{v.cancelVideoFrameCallback(callback);reject(new Error('SNAPSHOT_FRAME_TIMEOUT'));},5000);callback=v.requestVideoFrameCallback((_,frame)=>{clearTimeout(timer);const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0);const vf=new VideoFrame(v,{timestamp:0}),nativeColor=vf.colorSpace.toJSON();vf.close();resolve({frame,nativeColor,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data});});});const seek=once(v,'seeked');v.currentTime=target;await seek;const {frame,pixels,nativeColor}=await presented;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(x=>x.toString(16).padStart(2,'0')).join('');return {target,nativeColor,mediaTime:frame.mediaTime,width:v.videoWidth,height:v.videoHeight,hash,_pixels:pixels};}

export async function nativeCase(name,{targetTime=0,abortAppend=false}={}) {
 const controller=new AbortController(), v=document.querySelector('video');
 const events=[],errors=[],source=await openDriveQ1Source({fileId:name,accountKey:'q1-clock-fixture',accountGeneration:1,isCurrent:()=>!controller.signal.aborted,signal:controller.signal,readMetadata:async()=> (await fetch('/fixture/'+name+'/metadata')).json(),readRange:({start,end,signal})=>fetch('/fixture/'+name+'/range',{signal,headers:{Range:`bytes=${start}-${end}`}})});
 const ms=new MediaSource(),url=URL.createObjectURL(ms);let sb,window,result,failure,appends=0,acks=0,pending=0,drain=Promise.resolve();
 const mediaError=()=>errors.push(v.error?.code);v.addEventListener('error',mediaError);
 try {
  const opened=once(ms,'sourceopen');v.src=url;await opened;
  result=await remuxQ1({source,signal:controller.signal,targetTime,onWindow:w=>{
   const origin=w.policy?.presentationOrigin??w.sourcePacketOrigin;
   // A common shift keeps decode preroll in MSE while movie time remains explicit.
   // No independent audio/video shift and no original timestamp is overwritten.
   const commonShift=Math.min(origin,w.windowOrigin);
   window={...w,videoConfig:undefined,audioConfig:undefined,commonShift,elementStart:(w.policy?.validPresentationStart??origin)-commonShift,elementEnd:w.sourceEndTimestamp-commonShift,timestampOffset:w.windowOrigin-commonShift};
   const mime=`video/mp4; codecs="${[w.videoConfig.codec,w.audioConfig?.codec].filter(Boolean).join(',')}"`;
   if(!MediaSource.isTypeSupported(mime))throw new Error('NATIVE_CODEC_UNSUPPORTED:'+mime);
   sb=ms.addSourceBuffer(mime);sb.timestampOffset=window.timestampOffset;ms.duration=window.elementEnd;
  },onChunk:({bytes})=>new Promise((resolve,reject)=>{
   assert(!pending&&!sb.updating,'APPEND_OWNER');pending++;appends++;let settled;
   drain=new Promise(r=>settled=r);let err;
   const failed=()=>{err=new Error('NATIVE_APPEND_ERROR');};
   const aborted=()=>{err=new Error('NATIVE_APPEND_ABORT');};
   const done=()=>{sb.removeEventListener('error',failed);sb.removeEventListener('abort',aborted);pending--;events.push({event:'updateend',updating:sb.updating});settled();if(err||controller.signal.aborted)reject(err??new Error('CANCELLED'));else{acks++;resolve();}};
   sb.addEventListener('error',failed);sb.addEventListener('abort',aborted);sb.addEventListener('updateend',done,{once:true});
   try{sb.appendBuffer(bytes);if(abortAppend&&appends===2){controller.abort();sb.abort();}}catch(e){sb.removeEventListener('updateend',done);pending--;settled();reject(e);}
  })});
  await drain;assert(result.cleanup.settled,'SOURCE_UNSETTLED');assert(!pending&&!sb.updating,'APPEND_UNSETTLED');ms.endOfStream();
  const points=[Math.max(window.elementStart,targetTime-window.commonShift)+0.1,window.elementStart+(window.elementEnd-window.elementStart)*.5,window.elementEnd-.5];const decoded=[];
  for(const target of name==='one-picture-color'?[]:points){
   const presented=[];let callback;const collect=(now,meta)=>{presented.push({mediaTime:meta.mediaTime,presentedFrames:meta.presentedFrames});callback=v.requestVideoFrameCallback(collect);};callback=v.requestVideoFrameCallback(collect);
   const before=v.getVideoPlaybackQuality().totalVideoFrames;const seek=once(v,'seeked');v.currentTime=target;await seek;await v.play();
   for(let n=0;n<140&&(presented.length<3||v.currentTime<target+.12);n++){if(v.error)throw new Error('MEDIA_ERROR:'+v.error.code);await delay(25);}
   v.pause();v.cancelVideoFrameCallback(callback);assert(presented.length>=3&&v.currentTime>=target+.12,'PRESENTED_FRAME_PROGRESS');const frames=v.getVideoPlaybackQuality().totalVideoFrames-before;assert(frames>=4,'NO_FRAMES_AT:'+target);assert(v.currentTime>=target&&v.currentTime<target+1,'CLOCK_POSITION');decoded.push({target,elementTime:v.currentTime,movieTime:v.currentTime+window.commonShift,frames,presented});
  }
  let nativeOriginalComparison;
  if(['b-trim-negative','b-negative-cto','b-vfr-rotate','b-rotate90','one-picture-color'].includes(name)){
   const direct=document.createElement('video');direct.muted=true;direct.preload='auto';document.body.append(direct);const loaded=once(direct,'loadedmetadata');direct.src='/original/'+name;await loaded;
   try{nativeOriginalComparison=[];for(const movieTime of [.81,3.11,5.11]){const original=await snapshot(direct,movieTime),remuxed=await snapshot(v,movieTime-window.commonShift);let total=0,different=0;for(let k=0;k<original._pixels.length;k++){const d=Math.abs(original._pixels[k]-remuxed._pixels[k]);total+=d;if(d)different++;}const pixelError={meanAbsolute:total/original._pixels.length,differingFraction:different/original._pixels.length};delete original._pixels;delete remuxed._pixels;nativeOriginalComparison.push({movieTime,pixelError,original,remuxed,samePixels:original.hash===remuxed.hash,sourcePtsDifference:remuxed.mediaTime+window.commonShift-original.mediaTime});}const control=document.createElement('video');control.muted=true;document.body.append(control);const ready=once(control,'loadedmetadata');control.src='/original/'+name;await ready;try{const first=await snapshot(direct,3.11),second=await snapshot(control,3.11);nativeOriginalComparison.push({control:'direct-versus-direct',samePixels:first.hash===second.hash,sourcePtsDifference:second.mediaTime-first.mediaTime});}finally{control.removeAttribute('src');control.load();control.remove();}}finally{direct.removeAttribute('src');direct.load();direct.remove();}
  }
  const presentationComparisonPassed=nativeOriginalComparison?nativeOriginalComparison.every(x=>x.samePixels&&Math.abs(x.sourcePtsDifference)<.000002):null;
  return {name,passed:presentationComparisonPassed!==false,playbackPassed:true,presentationComparisonPassed,window,result,decoded,appends,acks,errors,nativeOriginalComparison};
 } catch(e){failure={message:e.message,cleanup:e.cleanup,reads:e.reads};return {name,passed:abortAppend&&failure.cleanup?.settled===true,failure,window,appends,acks,errors};}
 finally{controller.abort();if(sb?.updating&&ms.readyState==='open')sb.abort();await drain;await source.abort();v.pause();v.removeAttribute('src');v.load();URL.revokeObjectURL(url);v.removeEventListener('error',mediaError);assert(pending===0,'TERMINAL_APPEND_PENDING');}
}
window.runIntegrity=nativeCase;
