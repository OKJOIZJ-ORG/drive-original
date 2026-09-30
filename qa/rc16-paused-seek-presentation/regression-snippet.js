function installPausedPresentationFixture(context) {
  run(context, `(() => {
    globalThis.seekPresentationFrames = [];
    const classes = new Set(['has-poster']);
    state.selected = { id:'paused-target', mimeType:'video/mp4' };
    state.mediaSession=81;state.playbackSession=4;state.accountId='account';
    state.authAccountKey='account-key';state.driveSessionGeneration=3;
    state.mediaAttempt='q1';state.mediaPlaybackMode=PLAYBACK_MODE.REPACKAGED;
    state.mediaTransportVerified=true;state.mediaTransportStarted=true;
    mediaSourceGeneration=10;mediaSeekGeneration=0;
    el.videoPlayer={hidden:false,paused:true,ended:false,seeking:true,currentTime:50,duration:100,
      dataset:{mediaSession:'81'},hasPoster:true,
      classList:{add(name){classes.add(name)},remove(name){classes.delete(name)},contains(name){return classes.has(name)}},
      removeAttribute(name){if(name==='poster')this.hasPoster=false},
      requestVideoFrameCallback(fn){seekPresentationFrames.push(fn);return seekPresentationFrames.length},cancelVideoFrameCallback(){}};
    el.playerSheet={hidden:false};el.mediaLoading={hidden:true};el.mediaLoadingText={};el.mediaError={hidden:true};
    updateQualityDisplay=()=>{};tryCaptureAmbientFrame=()=>{};hideSwipeNeighbor=()=>{};
    beginMediaSeekIntent(el.videoPlayer,50,'paused-ordering');
    showMediaLoading('owned seek loading');
  })()`);
}

test('paused decoded target before late presentation registration clears loading only after seeked and reuses proof', () => {
  const context=loadAppContext();installFakeClock(context);installPausedPresentationFixture(context);
  run(context,'seekPresentationFrames[0](0,{mediaTime:50});');
  assert.equal(run(context,'mediaSeekWatchdog.frameSeen'),true);
  assert.equal(run(context,'el.mediaLoading.hidden'),false,'target while seeking cannot complete presentation early');
  run(context,'el.videoPlayer.seeking=false;handleVideoSeeked({currentTarget:el.videoPlayer});');
  assert.equal(run(context,'mediaSeekWatchdog'),null);
  assert.equal(run(context,'el.mediaLoading.hidden'),true,'settled owned decoded seek does not need another paused frame');
  assert.equal(run(context,'el.videoPlayer.hasPoster'),false);
  const count=run(context,'seekPresentationFrames.length');
  run(context,"showMediaLoading('late ready ordering');onMediaReady();");
  assert.equal(run(context,'el.mediaLoading.hidden'),true,'late ready path reuses the completed target proof');
  assert.equal(run(context,'seekPresentationFrames.length'),count,'late registration must not wait on a nonexistent paused frame');
  assert.equal(run(context,'el.videoPlayer.dataset.presentationSession'),undefined);
});

test('paused presentation rejects paint-only and stale-source target proof', () => {
  for(const stale of [false,true]){
    const context=loadAppContext();installFakeClock(context);installPausedPresentationFixture(context);
    if(stale)run(context,'mediaSourceGeneration+=1;');
    run(context,`noteMediaFrameProgress(el.videoPlayer,50,'${stale?'decoded-frame':'paint-only'}',10,mediaSeekGeneration,'q1');el.videoPlayer.seeking=false;handleVideoSeeked({currentTarget:el.videoPlayer});`);
    assert.equal(run(context,'el.mediaLoading.hidden'),false,'unqualified progress cannot dismiss loading');
  }
});

test('completed paused presentation is fenced by account/source/attempt and cleared with seek retirement', () => {
  for(const change of ["state.authAccountKey='replacement';","mediaSourceGeneration+=1;","state.mediaAttempt='range';","clearMediaSeekWatchdog('source-cleared');"]){
    const context=loadAppContext();installFakeClock(context);installPausedPresentationFixture(context);
    run(context,'seekPresentationFrames[0](0,{mediaTime:50});el.videoPlayer.seeking=false;handleVideoSeeked({currentTarget:el.videoPlayer});');
    run(context,change+"showMediaLoading('replacement loading');onMediaReady();");
    assert.equal(run(context,'el.mediaLoading.hidden'),false,'retired owner cannot hide replacement loading');
    assert.equal(run(context,'completedMediaSeekPresentation'),null,'stale or retired proof is released');
  }
});
