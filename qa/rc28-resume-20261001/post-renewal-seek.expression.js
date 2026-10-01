(()=>{
 if(APP_VERSION!=='1.22.0-rc.28'||state.tokenRevision!==67||!q1Playback||state.selected?.id!==window.__resumePcNaturalPrep?.target.id||!window.__resumeSwProof?.get?.()||window.__resumeSwProof.get().controller!==navigator.serviceWorker.controller)throw Error('SEEK_PREFLIGHT');
 const v=el.videoPlayer,owner=q1Playback,account=state.accountId,file=state.selected.id,version=state.selected.version,session=state.mediaSession,controller=navigator.serviceWorker.controller,revision=state.tokenRevision;
 const result={at:Date.now(),version:APP_VERSION,credentialRevision:revision,pausedBefore:v.paused,targetSeconds:v.duration*.5,completed:false,frame:null,failure:null};
 let frame=null,timer=null,started=false;
 const clear=()=>{clearTimeout(timer);if(frame!==null)v.cancelVideoFrameCallback(frame);frame=null;};
 const start=()=>{if(started)throw Error('SEEK_ALREADY_STARTED');started=true;if(!v.paused||!Number.isFinite(result.targetSeconds)||v.duration<1500)throw Error('SEEK_BASELINE');
 timer=setTimeout(()=>{result.failure='TARGET_FRAME_TIMEOUT';clear();},15000);
 const cb=(_,m)=>{const fences={account:state.accountId===account,file:state.selected?.id===file,contentVersion:state.selected?.version===version,session:state.mediaSession===session,q1:q1Playback===owner,controller:navigator.serviceWorker.controller===controller,revision:state.tokenRevision===revision,currentEvent:isCurrentMediaEvent(v)};
 if(!Object.values(fences).every(Boolean)){result.failure='SEEK_OWNER_CHANGED';result.fences=fences;clear();return;}
 if(Math.abs(m.mediaTime-result.targetSeconds)<=2&&v.paused&&v.readyState>=2&&el.mediaLoading.hidden&&el.mediaError.hidden&&owner.player.stats().phase==='ready') {result.completed=true;result.at=Date.now();result.fences=fences;result.frame={time:m.mediaTime,width:m.width,height:m.height,presentedFrames:m.presentedFrames,paused:v.paused,ready:v.readyState,phase:owner.player.stats().phase};clear();return;}
 frame=v.requestVideoFrameCallback(cb);};frame=v.requestVideoFrameCallback(cb);return{armed:true,targetSeconds:result.targetSeconds};};
 return Object.freeze({start,read:()=>structuredClone(result),clear:()=>{clear();return{callbackRemoved:true,timerRemoved:true};}});
})()
