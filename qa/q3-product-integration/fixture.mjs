import {createGeneralPlayer} from '../../media/general-player.mjs';
import {startGeneralWorker} from '../../media/general-owner.mjs';
import {probePinnedQ3Video} from '../../media/video-q3-pipeline.mjs';
const video=document.querySelector('video'),delay=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(test)=>{const end=performance.now()+12000;while(!test()){if(performance.now()>end)throw Error('Q3_LOCAL_TIMEOUT');await delay(20);}};
const info=await(await fetch('/fixture-info.json')).json();
const identity=Object.freeze({accountKey:'synthetic',accountGeneration:1,fileId:'synthetic-q3',headRevisionId:info.sha256,size:info.size,mimeType:'video/mp4',modifiedTime:'fixed-fixture'});
function source(){let closed=false;return {identity,async read({start,end}){if(closed)throw Error('Q1_SOURCE_CANCELLED');const response=await fetch('/fixture.mp4',{headers:{Range:`bytes=${start}-${end}`}});if(response.status!==206||response.headers.get('Content-Range')!==`bytes ${start}-${end}/${identity.size}`)throw Error('Q1_SOURCE_RANGE');return new Uint8Array(await response.arrayBuffer());},async abort(){closed=true;return {settled:true};}};}
window.nativeFailure=async()=>{video.src='/fixture.mp4';video.load();await until(()=>video.error||video.readyState>=2);const result={error:video.error?.code??null};video.removeAttribute('src');video.load();return result;};
window.qualify=async()=>{
 const controller=new AbortController(),chunks=[],windows=[];let bytes=0;
 const admission=await probePinnedQ3Video(source(),{nativeRejected:true});
 const job=startGeneralWorker({source:source(),generation:1,signal:controller.signal,workerFactory:()=>new Worker('/media/video-q3-worker.mjs',{type:'module'}),onWindow:w=>windows.push(w),onChunk:c=>{if(bytes+c.bytes.length>16777216)throw Error('Q3_FIXTURE_OUTPUT_LIMIT');chunks.push(c.bytes);bytes+=c.bytes.length;}});
 const result=await job.done;if(result.error)throw Error(result.error.message);const output=new Uint8Array(bytes);let p=0;for(const c of chunks){output.set(c,p);p+=c.length;}chunks.length=0;await window.saveOutput([...output]);
 return {admission,window:windows[0],result};
};
window.playback=async(start)=>{
 let frames=0,token,created=0,terminated=0;const events=[];const callback=()=>{frames++;token=video.requestVideoFrameCallback(callback);};token=video.requestVideoFrameCallback(callback);
 const player=createGeneralPlayer({video,openSource:async()=>source(),isCurrent:()=>true,initialTime:start,autoplay:true,
  workerFactory:()=>{created++;const worker=new Worker('/media/video-q3-worker.mjs',{type:'module'}),terminate=worker.terminate.bind(worker);worker.terminate=()=>{terminated++;return terminate();};return worker;},onEvent:e=>events.push(e.type)});
 let result;try{await player.ready;await until(()=>frames>=3);video.pause();await player.seek(1.5,{autoplay:true});const before=frames;await until(()=>frames>before&&video.currentTime>=1.5);video.pause();result={width:video.videoWidth,height:video.videoHeight,frames,currentTime:video.currentTime,stats:player.stats(),events};}
 finally{video.cancelVideoFrameCallback(token);const cleanup=await player.dispose();result={...result,cleanup,created,terminated,srcRemoved:!video.getAttribute('src')};}return result;
};
window.cancel=async()=>{const controller=new AbortController();let chunks=0;const job=startGeneralWorker({source:source(),generation:1,signal:controller.signal,workerFactory:()=>new Worker('/media/video-q3-worker.mjs',{type:'module'}),onWindow:()=>{},onChunk:()=>{chunks++;controller.abort();}});const result=await job.done;return {chunks,result};};
