(() => {
  if (window.__rc17SeekQA) throw new Error('QA_ALREADY_INSTALLED');
  const video = el.videoPlayer;
  const owner = {account: state.authAccountKey, file: state.selected?.id,
    session: state.playbackSession, media: state.mediaSession};
  let frameId = null, timer = null, proof = null;
  const current = () => owner.account === state.authAccountKey
    && owner.file === state.selected?.id && owner.session === state.playbackSession
    && owner.media === state.mediaSession;
  const stop = () => {clearTimeout(timer);timer=null;
    if(frameId!==null)video.cancelVideoFrameCallback(frameId);frameId=null;};
  window.__rc17SeekQA = {
    watch: target => {
      stop();
      if(!current()||!Number.isFinite(target))throw new Error('QA_OWNER_OR_TARGET');
      const start=performance.now();
      proof={target,frame:null,timeout:false};
      const onFrame=(_now,meta)=>{
        if(!current()){proof.ownerChanged=true;stop();return;}
        if(Math.abs(meta.mediaTime-target)<=0.25){
          proof.frame={mediaTime:meta.mediaTime,presentedFrames:meta.presentedFrames,
            elapsedMs:Math.round(performance.now()-start),seekingAtFrame:video.seeking,
            sourceGeneration:mediaSourceGeneration};stop();return;
        }
        frameId=video.requestVideoFrameCallback(onFrame);
      };
      frameId=video.requestVideoFrameCallback(onFrame);
      timer=setTimeout(()=>{proof.timeout=true;stop();},30000);
      return {watching:true,target};
    },
    read:()=>({proof,current:{version:APP_VERSION,ownerCurrent:current(),
      attempt:state.mediaAttempt,kind:q1Playback?.kind||null,paused:video.paused,
      seeking:video.seeking,isSeeking:state.isSeeking,watchdog:Boolean(mediaSeekWatchdog),
      time:video.currentTime,duration:video.duration,ready:video.readyState,
      errorCode:video.error?.code||null,loading:!el.mediaLoading.hidden,
      visibility:document.visibilityState,frames:video.getVideoPlaybackQuality().totalVideoFrames}}),
    clear:stop
  };
  return {installed:true,version:APP_VERSION,ownerCurrent:current()};
})()
