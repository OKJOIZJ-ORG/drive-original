async function installNormalizedPositionCase(input) {
 'use strict';
 const demand=(value,code)=>{if(!value)throw Error('NORMALIZED_'+code);};
 const until=async(test,ms=15000)=>{const end=performance.now()+ms;while(!test()){demand(performance.now()<end,'DEADLINE');await new Promise(r=>setTimeout(r,20));}};
 const video=el.videoPlayer,originalWorker=window.Worker,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 const workers=[],urls=new Set(),frames=[];let rvfc,overflow=false,armedAt=0,owner;
 // Explicit passive public-API observers. Product functions and worker messages
 // are neither replaced nor altered; generated identities are the only inputs.
 window.Worker=class extends originalWorker {
  constructor(url,options){super(url,options);const row={type:new URL(url,location.href).pathname.split('/').pop(),starts:[],windows:[],terminated:false};workers.push(row);if(workers.length>8)overflow=true;
   const post=this.postMessage.bind(this),terminate=this.terminate.bind(this);
   this.postMessage=(value,...rest)=>{if(value?.kind==='start'){row.starts.push({generation:value.generation,targetTime:value.targetTime,initialPresentationTime:value.initialPresentationTime});if(row.starts.length>4)overflow=true;}return post(value,...rest);};
   this.terminate=()=>{row.terminated=true;return terminate();};
   this.addEventListener('message',e=>{const m=e.data;if(m?.kind==='window'){const w=m.value;row.windows.push({generation:m.generation,initialSourceTime:w.initialSourceTime,videoStart:w.videoStartTimestamp,sourceEnd:w.sourceEndTimestamp,level:w.status?.level,videoCodec:w.videoCodec,audioCodec:w.audioCodec??null,selectedAudioTrackId:w.selectedAudioTrackId??null});if(row.windows.length>4)overflow=true;}});
  }
 };
 URL.createObjectURL=function(value){const url=create.call(URL,value);urls.add(url);return url;};
 URL.revokeObjectURL=function(url){urls.delete(url);return revoke.call(URL,url);};
 const callback=(_,meta)=>{if(!owner&&q1Playback?.player&&state.selected?.id==='fixture')owner=q1Playback;const stats=q1Playback?.player?.stats?.();if(frames.length<64)frames.push({generation:stats?.generation,sourceTime:meta.mediaTime+(stats?.mapping?.commonShift??0),width:video.videoWidth,height:video.videoHeight,current:q1Playback===owner&&isCurrentMediaEvent(video)});else overflow=true;rvfc=video.requestVideoFrameCallback(callback);};
 state.token='synthetic';state.expiresAt=Date.now()+3600000;state.tokenRevision=1;state.authAccountKey='normalized-account';state.driveSessionGeneration=1;state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:false};state.demo=false;
 state.selected={id:'fixture',name:input.name+'.mp4',mimeType:'video/mp4',size:String(input.size),capabilities:{canDownload:true}};state.mediaSession++;state.pendingPlay=false;el.playerSheet.hidden=false;
 const snapshot={time:input.position,paused:true,muted:false,volume:1,playbackRate:1};
 const selectedWorkers=()=>workers.slice(armedAt),valid=()=>!overflow&&state.selected?.id==='fixture'&&state.authAccountKey==='normalized-account'&&state.driveSessionGeneration===1&&q1Playback===owner&&isCurrentMediaEvent(video);
 const sample=()=>{const s=q1Playback?.player?.stats?.();return {valid:valid(),paused:video.paused,mode:state.mediaPlaybackMode,attempt:state.mediaAttempt,sourceTime:q1Playback?.player?.sourceTime?.(),stats:s,workers:selectedWorkers().map(w=>({...w})),frames:frames.filter(f=>f.generation===s?.generation),labelVisible:!el.codecNote.hidden,labelLossy:/무손실이 아/.test(el.codecNote.textContent),overflow};};
 window.__normalizedCase={
  diagnose:sample,
  async prepare(){
   await tryOriginalTsPlayback(state.selected,state.mediaSession,{general:true,audioCompatibility:true,nativeVideoRejected:input.name==='q3',snapshotOverride:snapshot});
   if(input.name==='q3'){await until(()=>q3Choice?.current()&&!el.videoCompatButton.hidden);return {choiceReady:true,labelLossy:/무손실이 아/.test(el.mediaErrorMessage.textContent),snapshotTime:q3Choice.snapshot.time,paused:q3Choice.snapshot.paused};}
   return {choiceReady:false};
  },
  arm(){armedAt=input.name==='q3'?workers.length:0;frames.length=0;rvfc=video.requestVideoFrameCallback(callback);},
  async initial(){await until(()=>q1Playback?.player&&state.mediaAttempt==='q1');owner=q1Playback;await owner.player.ready;await until(()=>frames.some(f=>f.current&&f.generation===owner.player.stats().generation));await owner.player.completion();await new Promise(r=>setTimeout(r,150));return sample();},
  async audio(){
   demand(input.name==='q2'&&valid()&&!video.muted&&video.volume>0,'AUDIO_OWNER');demand(typeof video.captureStream==='function','AUDIO_CAPTURE_UNAVAILABLE');
   let stream,context,source,split,analysers=[];const startTime=video.currentTime;let windows=0,nonzero=0,peak=0,rmsPeak=0;
   try{stream=video.captureStream();const tracks=stream.getAudioTracks();demand(tracks.length===1,'AUDIO_TRACK');context=new AudioContext();await context.resume();source=context.createMediaStreamSource(stream);split=context.createChannelSplitter(2);source.connect(split);
    for(let channel=0;channel<2;channel++){const a=context.createAnalyser();a.fftSize=2048;split.connect(a,channel);analysers.push(a);}await video.play();const end=performance.now()+1000;
    while(performance.now()<end&&windows<20){demand(valid()&&tracks.every(t=>t.readyState==='live'&&t.enabled&&!t.muted),'AUDIO_TRACK_DRIFT');let energy=0,p=0;for(const a of analysers){const samples=new Float32Array(2048);a.getFloatTimeDomainData(samples);for(const v of samples){demand(Number.isFinite(v),'AUDIO_SAMPLE');energy+=v*v;p=Math.max(p,Math.abs(v));}}const rms=Math.sqrt(energy/4096);windows++;if(p>0.00001&&rms>0.000001)nonzero++;peak=Math.max(peak,p);rmsPeak=Math.max(rmsPeak,rms);await new Promise(r=>setTimeout(r,50));}
    video.pause();return {scope:'native element captured PCM, physical audibility UNKNOWN',windows,nonzero,peak,rmsPeak,timeAdvanced:video.currentTime>startTime,decodedPcmBytes:owner.player.stats()?.pipeline?.audioMetrics?.transferredPcmBytes??null};
   }finally{video.pause();source?.disconnect();split?.disconnect();for(const a of analysers)a.disconnect();for(const t of stream?.getTracks()||[])t.stop();if(context)await context.close();}
  },
  async seek(){video.pause();const target=owner.player.stats().mapping.sourceOrigin+input.seek;const before=workers.length;await owner.player.seek(target,{autoplay:false});await until(()=>frames.some(f=>f.current&&f.generation===owner.player.stats().generation));await owner.player.completion();return {...sample(),requestedAbsolute:target,workersAfterSeek:workers.length-before};},
  async close(){if(rvfc!==undefined)video.cancelVideoFrameCallback(rvfc);clearDirectMediaSources();await q1Retirement;const cleanup={retirement:q1RetirementResult,allWorkersTerminated:workers.every(w=>w.terminated),urlsRemaining:urls.size,srcRemoved:!video.hasAttribute('src'),q0Absent:!q0Playback,q1Absent:!q1Playback,overflow};window.Worker=originalWorker;URL.createObjectURL=create;URL.revokeObjectURL=revoke;delete window.__normalizedCase;return cleanup;}
 };
}
