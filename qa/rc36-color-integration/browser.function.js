function installActualColor() {
  'use strict';
  if (window.__rc36ActualColor || APP_VERSION !== '1.22.0-rc.36' || state.selected || q0Playback || q1Playback || playerTracksOwner
      || state.authStatus !== 'online' || !state.accountStateLoaded || !hasUsableToken() || state.accountStateSyncPromise
      || q1RetirementResult?.settled !== true || playerTracksRetirementResult?.settled !== true) throw Error('COLOR_ADMISSION');
  const controller = navigator.serviceWorker.controller, account = state.authAccountKey, generation = state.driveSessionGeneration;
  const origin = location.origin, version = APP_VERSION;
  let target = null, metadata = null, nativeTuple = null, nativeFormat = null, session = null, locatorUsed = false;
  const fence = () => APP_VERSION === version && location.origin === origin && navigator.serviceWorker.controller === controller
    && state.authAccountKey === account && state.driveSessionGeneration === generation && state.authStatus === 'online'
    && hasUsableToken() && document.visibilityState === 'visible';
  const current = () => fence() && target && state.selected?.id === target.id && state.mediaSession === session;
  const tuple = value => ({primaries:value?.primaries ?? null,transfer:value?.transfer ?? null,matrix:value?.matrix ?? null,fullRange:value?.fullRange ?? null});
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  async function boundedJSON(url) {
    if (!fence()) throw Error('COLOR_OWNER');
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 10000);
    try { const response = await driveFetch(url,{signal:ac.signal}); if(!response.ok) throw Error('COLOR_METADATA_HTTP');
      const text = await response.text(); if(text.length > 128*1024) throw Error('COLOR_METADATA_BOUND');
      if(!fence()) throw Error('COLOR_OWNER'); return JSON.parse(text);
    } finally { clearTimeout(timer); }
  }
  const metadataURL = () => {const url = new URL(DRIVE_API+'/files/'+encodeURIComponent(target.id));
    url.searchParams.set('fields','id,headRevisionId,version,size,mimeType,modifiedTime,sha256Checksum,trashed,capabilities(canDownload)');
    url.searchParams.set('supportsAllDrives','true');return url.href;};
  async function locate() {
    if(locatorUsed || target || !fence() || state.selected) throw Error('COLOR_LOCATOR_ONCE'); locatorUsed = true;
    const params = new URLSearchParams({q:"trashed=false and mimeType='video/mp4'",orderBy:'quotaBytesUsed',pageSize:'10',spaces:'drive',corpora:'user',
      fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,resourceKey,capabilities(canDownload),videoMediaMetadata(width,height,durationMillis))'});
    const data = await boundedJSON(DRIVE_API+'/files?'+params);
    if(data.incompleteSearch) throw Error('COLOR_LOCATOR_INCOMPLETE');
    const candidates = (data.files || []).filter(f => Number(f.size)>0 && Number(f.size)<=8*1024*1024 && f.capabilities?.canDownload !== false
      && Number(f.videoMediaMetadata?.durationMillis)>=3000 && Number(f.videoMediaMetadata?.durationMillis)<=45000);
    if(!candidates.length) throw Error('COLOR_NO_SMALL_ACTUAL_SAMPLE');
    target = candidates[0]; metadata = await boundedJSON(metadataURL());
    if(metadata.trashed || metadata.id!==target.id || Number(metadata.size)!==Number(target.size) || metadata.mimeType!=='video/mp4'
      || !metadata.version || !metadata.headRevisionId) throw Error('COLOR_SAMPLE_IDENTITY');
    return {boundedMetadataRows:data.files.length,nextPageFollowed:false,bytes:Number(target.size),durationMs:Number(target.videoMediaMetadata.durationMillis),
      revisionPresent:true,checksumPresent:!!metadata.sha256Checksum,privateIdentityExported:false};
  }
  function read() {
    const stats=q1Playback?.player?.stats(), pipe=stats?.pipeline, owner=playerTracksOwner;
    return {fence:fence(),current:!!current(),version:APP_VERSION,closed:el.playerSheet.hidden,q0:!!q0Playback,q1:!!q1Playback,
      verified:state.mediaDecodeVerified===true,transport:hasVerifiedOriginalTransport(),ready:el.videoPlayer.readyState,
      width:el.videoPlayer.videoWidth,height:el.videoPlayer.videoHeight,paused:el.videoPlayer.paused,error:el.videoPlayer.error?.code ?? null,
      attempt:state.mediaAttempt,tracksCurrent:owner?.current()===true,tracksCleanup:owner?.cleanupOk===true,switching:owner?.switching===true,
      dialog:el.playerTracksDialog.open,audioOptions:owner?.inventory?.audioTracks?.map(t=>({id:t.trackId,codec:t.codec,route:t.route})) ?? [],
      selectedAudio:owner?.selectedAudioTrackId ?? null,pipelineAudio:pipe?.selectedAudioTrackId ?? null,
      phase:stats?.phase ?? null,failure:stats?.failure ?? null,generation:stats?.generation ?? null,
      observed:!!owner?.nativeColorObservation,observedFormat:owner?.nativeColorObservation?.format ?? null,
      observationTuple:owner?.nativeColorObservation ? tuple(owner.nativeColorObservation.colorSpace) : null,
      outputObservation:!!stats?.outputColorObservation,outputTuple:stats?.outputColorObservation ? tuple(stats.outputColorObservation.colorSpace) : null,
      observationIdentityMatches:!!owner?.nativeColorObservation && !!owner.identity && equal(owner.nativeColorObservation.identity,owner.identity),
      sourceColor:pipe ? tuple(pipe.videoConfig?.colorSpace) : null,derivedColor:pipe ? tuple(pipe.outputVideoConfig?.colorSpace) : null,
      encoders:pipe?.encodersCreated ?? null,sourceConfigPreserved:pipe ? equal(pipe.videoConfig?.description,pipe.outputVideoConfig?.description)
        && pipe.videoConfig?.codec===pipe.outputVideoConfig?.codec && pipe.videoConfig?.codedWidth===pipe.outputVideoConfig?.codedWidth
        && pipe.videoConfig?.codedHeight===pipe.outputVideoConfig?.codedHeight : null,
      statsReady:!!pipe,packets:pipe?.packets ?? null,outputBytes:pipe?.outputBytes ?? null,peakPacketBytes:pipe?.peakBufferedPacketBytes ?? null,
      q1Retired:q1RetirementResult?.settled===true,tracksRetired:playerTracksRetirementResult?.settled===true,
      accountIdle:!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.accountIdentityPending};
  }
  function open() {if(!target || !fence() || state.selected)throw Error('COLOR_OPEN_ADMISSION');openPlayer(target);session=state.mediaSession;return read();}
  function captureNative() {
    if(!current() || !q0Playback || !q0PinnedSource || !state.mediaDecodeVerified || !hasVerifiedOriginalTransport())throw Error('COLOR_NATIVE_ADMISSION');
    let frame;try {frame=new VideoFrame(el.videoPlayer);nativeTuple=tuple(frame.colorSpace);nativeFormat=frame.format;
      return {format:nativeFormat,colorSpace:nativeTuple,codedWidth:frame.codedWidth,codedHeight:frame.codedHeight,
        visibleWidth:frame.visibleRect.width,visibleHeight:frame.visibleRect.height,frameClosed:true};}finally{frame?.close();}
  }
  function tracks(){if(!current())throw Error('COLOR_TRACKS_OWNER');return openPlayerTracks();}
  async function verify() {
    if(!current())throw Error('COLOR_VERIFY_OWNER');const value=read();const after=await boundedJSON(metadataURL());
    const fields=['id','headRevisionId','version','size','mimeType','modifiedTime','sha256Checksum','trashed'];
    value.originalMetadataUnchanged=fields.every(k=>metadata[k]===after[k]);
    value.nativeTuple=nativeTuple;value.nativeFormat=nativeFormat;
    value.capturedTupleMatches=value.observed&&equal(value.observationTuple,nativeTuple);
    value.derivedTupleMatches=value.outputObservation&&equal(value.outputTuple,nativeTuple);
    let frame;try{frame=new VideoFrame(el.videoPlayer);value.outputFrameTuple=tuple(frame.colorSpace);value.frameTupleMatches=equal(value.outputFrameTuple,nativeTuple);}finally{frame?.close();}
    return value;
  }
  async function cleanup() {
    if(target && state.selected?.id===target.id)closePlayer();
    await Promise.all([q1Retirement,playerTracksRetirement]);
    target=null;metadata=null;nativeTuple=null;session=null;
    const value={playerClosed:el.playerSheet.hidden&&!state.selected,q0Absent:!q0Playback,q1Absent:!q1Playback,tracksAbsent:!playerTracksOwner,
      q1Retired:q1RetirementResult?.settled===true,tracksRetired:playerTracksRetirementResult?.settled===true,fence:fence(),
      accountIdle:!state.accountStateLoadingPromise&&!state.accountStateSyncPromise&&!state.accountIdentityPending,
      libraryRoot:state.currentFolderId==='root',queryEmpty:!state.query,privateHolderCleared:true};
    delete window.__rc36ActualColor;value.helperAbsent=!window.__rc36ActualColor;return value;
  }
  window.__rc36ActualColor={locate,open,read,captureNative,tracks,verify,cleanup};
  return {prepared:true,readOnlyUntilLocateAndOpen:true,ownedTimerPolicy:'10s metadata abort; finally clear',nativeUIBinding:'ordinary app handlers plus native select',current36:true};
}
