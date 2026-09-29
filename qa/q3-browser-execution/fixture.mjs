const video=document.querySelector('video');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate,timeout=5000){const start=performance.now();while(!predicate()){if(performance.now()-start>timeout)throw Error('Q3_PLAYBACK_TIMEOUT');await delay(20)}}
window.nativeFailure=async()=>{video.src='/fixture.mp4';video.load();await until(()=>video.error||video.readyState>=2);const r={error:video.error?.code||null,readyState:video.readyState,width:video.videoWidth};video.removeAttribute('src');video.load();return r};
window.runQ3=async(startTime=0,cancelAfter=0)=>{
 const manifest=await(await fetch('/fixture.json')).json(),worker=new Worker('./worker.mjs',{type:'module'}),chunks=[];let closed=false,terminal,failed,workerCount=1,outputSize=0,writeBytes=0;
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.terminate();workerCount--;reject(Error('Q3_WORKER_TIMEOUT'))},30000);
 worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message))};
 worker.onmessage=({data})=>{if(data.type==='chunk'){const end=data.position+data.bytes.byteLength;if(!(data.bytes instanceof Uint8Array)||!Number.isSafeInteger(data.position)||data.position<0||!Number.isSafeInteger(end)||end>8*1024*1024||writeBytes+data.bytes.byteLength>16*1024*1024){clearTimeout(timer);reject(Error('Q3_CONSUMER_OUTPUT_BUDGET'));return}outputSize=Math.max(outputSize,end);writeBytes+=data.bytes.byteLength;chunks.push({bytes:data.bytes,position:data.position});return}if(data.type==='done')terminal=data.result;if(data.type==='error'){failed=data.error;terminal=data.metrics}if(data.type==='closed'){closed=true;clearTimeout(timer);worker.terminate();workerCount--;resolve({failure:failed||null,metrics:terminal,closed,workerCount})}};
 worker.postMessage({type:'run',manifest,startTime,cancelAfter});
 }).finally(()=>{if(workerCount){worker.terminate();workerCount=0}});
 const bytes=new Uint8Array(outputSize);for(const chunk of chunks)bytes.set(chunk.bytes,chunk.position);chunks.length=0;
 const blob=new Blob([bytes],{type:'video/webm'});result.outputBytes=blob.size;
 if(!result.failure){await window.saveQ3Output(startTime,[...new Uint8Array(await blob.arrayBuffer())]);const url=URL.createObjectURL(blob);let frames=0,token;
  const frame=()=>{frames++;token=video.requestVideoFrameCallback(frame)};
  try{video.src=url;await video.play();token=video.requestVideoFrameCallback(frame);await until(()=>frames>=3);video.pause();const seeks=[];
   for(const target of (startTime?[2.4]:[0.4,1.5,2.5])){const before=frames;video.currentTime=target;await video.play();await until(()=>frames>before&&Math.abs(video.currentTime-target)<0.3);video.pause();seeks.push({target,actual:video.currentTime,frames})}
   result.playback={frames,width:video.videoWidth,height:video.videoHeight,duration:video.duration,seeks,error:video.error?.code||null};
  }finally{if(token)video.cancelVideoFrameCallback(token);video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);result.urlRevoked=true}
 }
 return result;
};
