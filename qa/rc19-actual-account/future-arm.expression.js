(() => {
  if (APP_VERSION !== '1.22.0-rc.19') throw new Error('QA_VERSION_REQUIRED');
  if (window.__rc19LatencyQA) throw new Error('QA_ALREADY_INSTALLED');
  const video = el.videoPlayer, player = q1Playback?.player;
  if (!video || !player || q1Playback.kind !== 'ts' || !video.paused || !isCurrentMediaEvent(video)
      || !Number.isFinite(video.duration) || video.duration <= 0 || typeof video.requestVideoFrameCallback !== 'function') {
    throw new Error('QA_PAUSED_TS_REQUIRED');
  }
  const file = state.selected?.id, account = state.authAccountKey, accountId = state.accountId, driveGeneration = state.driveSessionGeneration, session = state.mediaSession;
  const target = video.duration / 2, base = performance.now();
  if(Math.abs(video.currentTime-target)<=0.25)throw new Error('QA_TARGET_ALREADY_CURRENT');
  let frameId = null, timer = null, completionTimer = null, interval = null, intentAt = null, done = false, last = '', dropped = 0, frameGeneration = null, frameSourceGeneration = null;
  const rows = [], events = ['seeking','seeked','loadedmetadata','loadeddata','waiting','canplay','pause','error'];
  const current = () => state.selected?.id === file && state.authAccountKey === account
    && state.accountId === accountId && state.driveSessionGeneration === driveGeneration
    && state.mediaSession === session && q1Playback?.player === player && isCurrentMediaEvent(video);
  const numeric = n => Number.isFinite(n) ? Math.round(n*1000)/1000 : null;
  const add = (stage,detail={}) => {if(rows.length<240) rows.push({stage,ms:numeric(performance.now()-base),...detail});else dropped++;};
  const classify = e => {
    try {
      const u = new URL(e.name);
      if (u.origin === location.origin && u.pathname.endsWith('/__drive_media/'+encodeURIComponent(file))
          && u.searchParams.get('mediaOwner') === 'q1' && u.searchParams.get('mediaSession') === String(session)) return 'range';
      if (u.origin === 'https://www.googleapis.com' && u.pathname === '/drive/v3/files/'+encodeURIComponent(file)
          && !u.searchParams.has('alt') && u.searchParams.has('fields')) return 'metadata';
    } catch (_) {}
    return null;
  };
  const resources = list => list.getEntries().forEach(e => {
    const stage = classify(e);if(!stage || e.startTime<base) return;
    add(stage,{startMs:numeric(e.startTime-base),durationMs:numeric(e.duration),timingExposed:e.responseStart>0,
      startedAfterIntent:intentAt!==null && e.startTime>=intentAt,
      currentRangeOwner:stage==='range' && new URL(e.name).searchParams.get('sourceGeneration')===String(mediaSourceGeneration),
      headersMs:e.responseStart>0 ? numeric(e.responseStart-e.startTime) : null,
      bodyMs:e.responseStart>0 ? numeric(e.responseEnd-e.responseStart) : null,
      encodedBytes:numeric(e.encodedBodySize)});
  });
  const onInput = e => {
    if(!e.isTrusted || ![el.seekBarContainer,el.mobileShortsProgressTrack].some(track=>track?.contains(e.target)))return;
    if(intentAt!==null){stop('extra-input');return;}
    intentAt=performance.now();add('seek-intent',{trusted:true,ownerCurrent:current()});
  };
  const observer = new PerformanceObserver(resources);
  const onEvent = e => add(e.type,{ownerCurrent:current(),time:numeric(video.currentTime),ready:video.readyState,seeking:video.seeking});
  const settled = () => current() && frameGeneration !== null && player.stats()?.generation === frameGeneration
    && mediaSourceGeneration === frameSourceGeneration && !video.seeking && !state.isSeeking
    && !mediaSeekWatchdog && video.readyState >= 2 && el.mediaLoading.hidden;
  const finishWhenSettled = () => {
    if(done || frameGeneration === null)return;
    if(!settled()) {clearTimeout(completionTimer);completionTimer=null;return;}
    if(completionTimer!==null)return;
    add('sampled-seek-settled',{intentToSettledMs:numeric(performance.now()-intentAt),ownerCurrent:current(),ready:video.readyState,loading:false});
    completionTimer=setTimeout(()=>{completionTimer=null;if(settled())stop('completed');},300);
  };
  const sample = () => {
    if(!current()) {stop('owner-changed');return;}
    if(frameGeneration !== null && (player.stats()?.generation !== frameGeneration || mediaSourceGeneration !== frameSourceGeneration)) {stop('generation-changed');return;}
    const s=player.stats(),phase=['opening','buffering','ready','ended','failed','cancelled'].includes(s?.phase) ? s.phase : null;
    const next=[s?.generation,phase,s?.appends,video.readyState,video.seeking].join(':');
    if(next!==last){last=next;add('player-state',{phase,appends:numeric(s?.appends),frames:numeric(s?.frames),
      generationChanged:s?.generation!==initialGeneration,ready:video.readyState,seeking:video.seeking});}
    finishWhenSettled();
  };
  const stop = reason => {
    if(done)return;done=true;
    resources({getEntries:()=>observer.takeRecords()});observer.disconnect();
    clearInterval(interval);clearTimeout(timer);clearTimeout(completionTimer);
    if(frameId!==null)video.cancelVideoFrameCallback(frameId);frameId=null;
    events.forEach(name=>video.removeEventListener(name,onEvent));
    document.removeEventListener('pointerdown',onInput,true);
    add(reason,{ownerCurrent:current(),paused:video.paused,time:numeric(video.currentTime),ready:video.readyState,
      appSeeking:Boolean(state.isSeeking),watchdog:Boolean(mediaSeekWatchdog),loading:!el.mediaLoading.hidden});
  };
  const initialGeneration=player.stats()?.generation;
  const onFrame = (_,meta) => {
    frameId=null;
    if(!current()){stop('owner-changed');return;}
    const s=player.stats();
    if(intentAt!==null && s?.generation!==initialGeneration && s?.appends>0
        && Number.isFinite(s?.target) && Math.abs(s.target-target)<=0.25 && Math.abs(meta.mediaTime-target)<=0.25) {
      add('target-frame',{intentToFrameMs:numeric(performance.now()-intentAt),mediaTime:numeric(meta.mediaTime),
        presentedFrames:numeric(meta.presentedFrames),seeking:video.seeking});
      frameGeneration=s.generation;frameSourceGeneration=mediaSourceGeneration;finishWhenSettled();return;
    }
    frameId=video.requestVideoFrameCallback(onFrame);
  };
  window.__rc19LatencyQA={read:()=>({done,dropped,target,ownerCurrent:current(),rows:rows.map(row=>({...row}))}),
    clear:()=>stop('manual-clear')};
  observer.observe({type:'resource'});
  events.forEach(name=>video.addEventListener(name,onEvent));
  document.addEventListener('pointerdown',onInput,true);
  frameId=video.requestVideoFrameCallback(onFrame);interval=setInterval(sample,100);timer=setTimeout(()=>stop('timeout'),40000);sample();
  return {armed:true,target,ownerCurrent:current(),paused:video.paused,timeoutMs:40000};
})()
