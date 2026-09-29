import {openDriveQ1Source} from '/media/drive-source.mjs';
const wait=(t,n,action,ms=15000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WAIT_'+n)),ms);t.addEventListener(n,()=>{clearTimeout(timer);resolve();},{once:true});t.addEventListener('error',()=>{clearTimeout(timer);reject(Error('MEDIA_ERROR'));},{once:true});action();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
window.captureEnd=async({control,seek})=>{
 const {createGeneralPlayer}=await import(control?'/qa/q2-player-end-window/control-player.mjs':'/media/general-player.mjs');
 const video=document.createElement('video');document.body.replaceChildren(video);
 const ac=new AudioContext({sampleRate:48000}),chunks=[],events=[];let alive=true,player,cleanup;
 await ac.audioWorklet.addModule('/qa/q2-original-end-integrity/capture-worklet.mjs');
 const source=ac.createMediaElementSource(video),capture=new AudioWorkletNode(ac,'capture'),sink=ac.createMediaStreamDestination();source.connect(capture);capture.connect(sink);
 capture.port.onmessage=e=>chunks.push(e.data);
 try{
  player=createGeneralPlayer({video,isCurrent:()=>alive,onEvent:e=>events.push(e),workerFactory:()=>new Worker('/media/audio-general-worker.mjs',{type:'module'}),openSource:({signal})=>openDriveQ1Source({fileId:'eac3',accountKey:'synthetic',accountGeneration:1,isCurrent:()=>alive,signal,readMetadata:async()=> (await fetch('/fixture/metadata')).json(),readRange:({start,end,signal})=>fetch('/fixture/range',{signal,headers:{Range:`bytes=${start}-${end}`}})})});
  const initial=await player.ready;await ac.resume();
  let mapping=initial,preSeekFrames=0;
  if(seek){await video.play();await sleep(450);video.pause();preSeekFrames=video.getVideoPlaybackQuality().totalVideoFrames;await ac.suspend();mapping=await player.seek(2.35,{autoplay:false});await ac.resume();}
  chunks.length=0;
  await wait(video,'ended',()=>void video.play());await sleep(100);await ac.suspend();
  const frames=chunks.reduce((n,c)=>n+c.planes[0].length,0),pcm=new Float32Array(frames*2);let at=0;
  for(const c of chunks)for(let i=0;i<c.planes[0].length;i++){pcm[at++]=c.planes[0][i];pcm[at++]=c.planes[1]?.[i]??c.planes[0][i];}
  const name=(seek?'seek':'full')+'-'+(control?'control':'product');await fetch('/save/'+name,{method:'POST',body:pcm});
  const report={name,frames,contextRate:ac.sampleRate,initial,mapping,preSeekFrames,elementTime:video.currentTime,elementDuration:video.duration,sourceTime:player.sourceTime(),ended:video.ended,stats:structuredClone(player.stats()),events,decodedFrames:video.getVideoPlaybackQuality().totalVideoFrames};
  cleanup=await player.dispose();report.cleanup=cleanup;return report;
 }finally{await player?.dispose();alive=false;source.disconnect();capture.disconnect();sink.disconnect();await ac.close();}
};
