'use strict';

// Original playback routes, TS/general playback and media error recovery.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

function suspendBackgroundThumbnailImages() {
  document.querySelectorAll?.('.file-card-thumb').forEach((image) => {
    if (image.complete) return;
    const source = image.getAttribute('src');
    if (!source) return;
    image.dataset.playerDeferredSrc = source;
    image.removeAttribute('src');
  });
}

function resumeBackgroundThumbnailImages() {
  document.querySelectorAll?.('.file-card-thumb[data-player-deferred-src]').forEach((image) => {
    const source = image.dataset.playerDeferredSrc;
    delete image.dataset.playerDeferredSrc;
    if (source && image.isConnected && !image.getAttribute('src')) image.src = source;
  });
}

function setPlayerMediaPriorityActive(active) {
  playerMediaPriorityActive = Boolean(active);
  if (playerMediaPriorityActive) {
    suspendBackgroundThumbnailImages();
    activeThumbnailJobs.forEach((job) => job.cancel?.(true));
    activeGifThumbnailJobs.forEach((job) => job.cancel?.(true));
    return;
  }
  resumeBackgroundThumbnailImages();
  processThumbnailQueue();
  processGifThumbnailQueue();
}

function capturePlaybackSnapshot() {
  const video = el.videoPlayer;
  if (!video || video.hidden) return null;
  return {
    time: Number.isFinite(playerTimeline(video).currentTime) ? playerTimeline(video).currentTime : 0,
    paused: Boolean(video.paused) && !state.pendingPlay,
    volume: Number.isFinite(video.volume) ? video.volume : 1,
    muted: Boolean(video.muted),
    playbackRate: mobileHoldSpeed?.active && isCurrentMobileHoldSpeed(mobileHoldSpeed)
      ? mobileHoldSpeed.previousRate : (Number.isFinite(video.playbackRate) ? video.playbackRate : 1),
    fullscreen: Boolean(document.fullscreenElement || document.webkitFullscreenElement),
    decoded: state.mediaDecodeVerified === true,
    ...(q1Playback?.selectedAudioTrackId !== undefined ? {
      selectedAudioTrackId: q1Playback.selectedAudioTrackId,
      audioCompatibility: q1Playback.audioCompatibility,
      audioIdentity: q1Playback.routeIdentity
    } : {})
  };
}

// The media load algorithm resets playbackRate to defaultPlaybackRate, so a
// rate set before src/load() is lost. Re-apply it unless the viewer changed it.
function reapplyRestoredPlaybackRate(video, rate) {
  if (!video || !Number.isFinite(rate) || rate <= 0) return;
  if (video.playbackRate === (video.defaultPlaybackRate ?? 1) && video.playbackRate !== rate) video.playbackRate = rate;
}

function restorePlaybackSnapshot(video, snapshot, session) {
  if (!video || !snapshot) return;
  if (snapshot.decoded) state.mediaDecodeVerified = true;
  video.volume = snapshot.volume;
  video.muted = snapshot.muted;
  video.playbackRate = snapshot.playbackRate;
  const sourceGeneration = mediaSourceGeneration;
  const restore = { fileId: state.selected?.id, session, snapshot };
  pendingPlaybackRestore = restore;
  video.addEventListener('loadedmetadata', () => {
    if (state.mediaSession !== session || mediaSourceGeneration !== sourceGeneration || !isCurrentMediaEvent(video)) return;
    if (pendingPlaybackRestore === restore) pendingPlaybackRestore = null;
    reapplyRestoredPlaybackRate(video, snapshot.playbackRate);
    if (snapshot.time > 0) {
      setPlayerCurrentTime(
        video,
        Math.min(video.duration || snapshot.time, snapshot.time),
        'restore-snapshot'
      );
    }
    if (state.resumePosition?.snapshot === snapshot) state.resumePosition = null;
    if (!snapshot.paused) {
      state.pendingPlay = true;
      attemptCurrentPlayback(session);
    } else {
      state.pendingPlay = false;
      updatePlayPauseUI();
    }
  }, { once: true });
}

function openMediaSource(file) {
  if (!file) return;
  cancelActiveTouchGesture();
  const diagnosticIntentAt = mediaDiagnosticTimestamp();
  finishMediaDiagnosticTrace('superseded');
  state.selected = file;
  if (!state.playbackOrderIds.includes(file.id)) state.playbackOrderIds.push(file.id);
  if (state.playbackDeck?.anchorId !== file.id) {
    state.playbackDeck = buildAccountPlaybackDeck(getPlaybackFileList(), file.id);
    state.playbackDeckComplete = hasCompletePlaybackPopulation();
  }
  refreshFavoritePresentation();
  Promise.resolve().then(() => {
    if (state.selected?.id === file.id && !el.playerSheet?.hidden) warmPlaybackNeighborhood(file);
  });
  if (el.playerTitle) el.playerTitle.textContent = file.name || '미디어 파일';
  if (el.mobileShortsTitle) el.mobileShortsTitle.textContent = file.name || '미디어 파일';
  if (el.codecNote) {
    el.codecNote.textContent = state.demo
      ? '데모 화면은 저장 파일 정보를 예시로 보여 주며 실제 원본 바이트를 재생하지 않습니다.'
      : 'Google Drive 원본 파일의 무변환 전송 여부를 확인하는 중입니다.';
  }
  const isVideo = file.mimeType?.startsWith('video/');
  const requestedPlay = Boolean(isVideo && state.pendingPlay);

  resetMediaElements();
  state.pendingPlay = requestedPlay;
  beginMediaViewObservation();
  beginMediaDiagnosticTrace(file, state.mediaSession, diagnosticIntentAt);
  setNativeVideoActionsAvailable(isVideo);
  collapseShortsExpand();
  resetVideoRotation();

  if (el.ambientBackdrop) {
    const thumb = isGifFile(file) ? '' : (file.thumbnailLink || generatedThumbnailCache.get(file.id));
    if (thumb) {
      el.ambientBackdrop.style.backgroundImage = `url("${thumb}")`;
      el.ambientBackdrop.classList.add('active');
    }
  }

  if (isVideo) {
    const poster = file.thumbnailLink || generatedThumbnailCache.get(file.id) || '';
    if (poster) {
      el.videoPlayer.poster = poster;
      el.videoPlayer.classList.add('has-poster');
    }
  }

  const session = state.mediaSession;
  state.mediaAttempt = 'route-selecting';
  state.mediaPlaybackMode = '';
  state.mediaTransportVerified = false;
  state.mediaRangeIntegrity = 'unknown';
  state.lastProxyError = null;
  emitMediaDiagnosticStage('route-selecting', {
    kind: isVideo ? 'video' : 'image'
  }, session);
  updateQualityDisplay();
  showMediaLoading();

  if (state.demo) {
    if (isVideo) {
      showMediaError('데모 화면에서는 실제 Drive 영상을 요청하지 않습니다.', { showDrive: false });
    } else {
      state.mediaAttempt = 'blob';
      state.mediaPlaybackMode = PLAYBACK_MODE.MEMORY;
      state.mediaTransportVerified = true;
      updateQualityDisplay();
      el.imageViewer.hidden = false;
      el.imageViewer.dataset.mediaSession = String(session);
      el.imageViewer.alt = file.name || '데모 이미지';
      el.imageViewer.src = demoImageDataUrl();
    }
    return;
  }

  if (file.capabilities?.canDownload === false) {
    showDrivePreview(file, 'Drive 정책상 원본 다운로드가 제한되어');
    return;
  }

  if (!hasUsableToken()) {
    showMediaError('Google 인증 시간이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    return;
  }
  startInitialOriginalPlayback(file, isVideo ? 'video' : 'image', session);
}

function shouldProbeOriginalTs(file, kind) {
  if (kind !== 'video' || !(globalThis.MediaSource || globalThis.ManagedMediaSource)
    || !globalThis.Worker || typeof el.videoPlayer?.canPlayType !== 'function') return false;
  // This is only a cheap eligibility hint for the current strict 188-byte TS
  // path. Unknown/stale listing data cannot disable the later code4 fallback.
  const size = Number(file?.size);
  if (!Number.isSafeInteger(size) || size < 940 || size % 188 !== 0) return false;
  try { return el.videoPlayer.canPlayType('video/mp2t') === ''; }
  catch { return false; }
}

async function startInitialOriginalPlayback(file, kind, session) {
  if (!file || state.selected?.id !== file.id || state.mediaSession !== session) return;
  const routeGeneration = ++initialMediaRouteGeneration;
  retireQ0Playback();
  if (q1Playback) {
    const previous = q1Playback; q1Playback = null;
    retireQ1Playback(previous);
  }
  const accountGeneration = state.driveSessionGeneration;
  const current = () => state.selected?.id === file.id && state.mediaSession === session
    && state.driveSessionGeneration === accountGeneration && routeGeneration === initialMediaRouteGeneration;
  // A prior probe/player may still own callbacks even when its UI is gone.
  // Q0 replacements must obey the same cleanup barrier as Q1 replacements.
  // Keep the established synchronous native source assignment when cleanup is
  // already known. An unnecessary microtask would cancel an immediate play()
  // made by the caller when the later native load() resets the element.
  const retired = q1RetirementResult || await q1Retirement;
  const tracksRetired = playerTracksRetirementResult || await playerTracksRetirement;
  if (!current()) return;
  if (!retired.settled || !tracksRetired.settled) {
    state.mediaAttempt = 'failed';
    showMediaError(SOURCE_CLEANUP_UNCONFIRMED_MESSAGE);
    return;
  }
  const chosenSnapshot = state.resumePosition?.fileId === file.id ? state.resumePosition.snapshot : null;
  if (kind === 'video' && chosenSnapshot?.selectedAudioTrackId !== undefined) {
    await tryOriginalTsPlayback(file, session, {general: true, initial: true,
      selectedAudioTrackId: chosenSnapshot.selectedAudioTrackId, audioCompatibility: chosenSnapshot.audioCompatibility === true,
      expectedIdentity: chosenSnapshot.audioIdentity, snapshotOverride: chosenSnapshot});
    return;
  }
  if (shouldProbeOriginalTs(file, kind)) {
    emitMediaDiagnosticStage('route-selected', { route: 'probe', reason: 'bounded-ts-admission' }, session);
    showMediaLoading();
    sendTokenToWorker();
    if (await tryOriginalTsPlayback(file, session, { initial: true })) return;
    if (!current()) return;
  }
  emitMediaDiagnosticStage('route-selected', {
    route: 'range',
    reason: 'direct-original-first'
  }, session);
  startOriginalRangePlayback(file, kind, session);
}

function startOriginalRangePlayback(file, kind, session, message = 'Drive 원본 구간 스트림 준비 중') {
  if (!file || state.selected?.id !== file.id || state.mediaSession !== session) return false;
  if (q1Playback) { const prior = q1Playback; q1Playback = null; retireQ1Playback(prior); }
  retireQ0Playback();
  if (!q1RetirementResult || !playerTracksRetirementResult) {
    const accountGeneration = state.driveSessionGeneration;
    void Promise.all([q1Retirement, playerTracksRetirement]).then(() => {
      if (accountGeneration === state.driveSessionGeneration) startOriginalRangePlayback(file, kind, session, message);
    });
    return true;
  }
  if (!q1RetirementResult.settled || !playerTracksRetirementResult.settled) {
    showMediaError(SOURCE_CLEANUP_UNCONFIRMED_MESSAGE);
    return false;
  }
  if (navigator.serviceWorker && !hasQ0CapableController()) {
    return waitForQ0Control(file, kind, session, message);
  }
  state.mediaAbortController?.abort();
  state.mediaAbortController = null;
  clearMediaSeekWatchdog('range-source');
  clearMediaFrameWatchdog('range-source');
  mediaSourceGeneration += 1;
  state.mediaAttempt = 'range';
  state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
  state.mediaTransportVerified = false;
  state.mediaTransportStarted = false;
  state.mediaRangeIntegrity = 'unknown';
  state.lastProxyError = null;
  emitMediaDiagnosticStage('range-source-assigned', { route: 'range', kind }, session);
  updateQualityDisplay();
  showMediaLoading();
  sendTokenToWorker();
  beginQ0Playback(file, session);
  const mediaUrl = buildPinnedMediaUrl(file);

  if (kind === 'video') {
    const poster = file.thumbnailLink || generatedThumbnailCache.get(file.id) || '';
    if (poster) {
      el.videoPlayer.poster = poster;
      el.videoPlayer.classList.add('has-poster');
    }
    el.videoPlayer.hidden = false;
    el.videoPlayer.dataset.mediaSession = String(session);
    el.videoPlayer.src = mediaUrl;
    const resume = state.resumePosition?.fileId === file.id ? state.resumePosition.time : null;
    const resumeSnapshot = state.resumePosition?.fileId === file.id ? state.resumePosition.snapshot : null;
    if (!resumeSnapshot && Number.isFinite(resume) && resume > 0) {
      el.videoPlayer.addEventListener('loadedmetadata', () => {
        if (session !== state.mediaSession) return;
        setPlayerCurrentTime(
          el.videoPlayer,
          Math.min(el.videoPlayer.duration || resume, resume),
          'resume-position'
        );
        state.resumePosition = null;
      }, { once: true });
    }
    if (resumeSnapshot) restorePlaybackSnapshot(el.videoPlayer, resumeSnapshot, session);
    el.videoPlayer.load();
    if (state.pendingPlay) attemptCurrentPlayback(session);
  } else {
    el.imageViewer.hidden = false;
    el.imageViewer.dataset.mediaSession = String(session);
    el.imageViewer.alt = file.name || '원본 이미지';
    el.imageViewer.src = mediaUrl;
  }

  return true;
}

async function attemptCurrentPlayback(session) {
  try {
    await el.videoPlayer.play();
    if (session === state.mediaSession) state.pendingPlay = false;
  } catch (error) {
    if (session !== state.mediaSession) return;
    // Native unsupported-container rejection does not revoke the user's play
    // intent; the Q0 retry and Q1 repackager may still honor it. Gesture denial
    // and unrelated failures must not silently retry autoplay.
    if (error?.name !== 'NotSupportedError') state.pendingPlay = false;
    if (error?.name === 'NotAllowedError') {
      syncMediaSeekWatchdog();
      clearMediaFrameWatchdog('autoplay-blocked');
      showPlayerFeedback('화면을 눌러 재생');
      updatePlayPauseUI();
      return;
    }
    if (error?.name !== 'AbortError') reportAppFailure('immediate-playback', error, 'warn');
  }
}

function buildMediaUrl(file) {
  const base = new URL('.', location.href);
  const url = new URL(`__drive_media/${encodeURIComponent(file.id)}`, base);
  if (file.mimeType) url.searchParams.set('mime', file.mimeType);
  if (file.size) url.searchParams.set('size', file.size);
  if (file.resourceKey) url.searchParams.set('resourceKey', file.resourceKey);
  url.searchParams.set('mediaSession', String(state.mediaSession));
  url.searchParams.set('accountGeneration', String(state.driveSessionGeneration));
  const traceId = getMediaDiagnosticTraceId(state.mediaSession);
  if (traceId) url.searchParams.set('_trace', traceId);
  url.searchParams.set('sourceGeneration', String(mediaSourceGeneration));
  if (state.mediaRetryCount) url.searchParams.set('attempt', String(state.mediaRetryCount));
  if (state.mediaAbuseAcknowledged && state.selected?.id === file.id) {
    url.searchParams.set('acknowledgeAbuse', '1');
  }
  return url.href;
}

function buildPinnedMediaUrl(file) {
  const url = new URL(`__drive_media/${encodeURIComponent(file.id)}`, new URL('.', location.href));
  url.searchParams.set('sourceGeneration', String(mediaSourceGeneration));
  url.searchParams.set('mediaOwner', 'q0');
  return url.href;
}

function onSeekKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const duration = playerTimeline().duration || 0;
  if (!Number.isFinite(duration) || duration <= 0) return;
  let target = null;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') target = playerTimeline().currentTime - 5;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') target = playerTimeline().currentTime + 5;
  if (event.key === 'Home') target = 0;
  if (event.key === 'End') target = duration;
  if (target == null) return;
  event.preventDefault();
  event.stopPropagation();
  setPlayerCurrentTime(
    el.videoPlayer,
    Math.max(0, Math.min(duration, target)),
    'seek-key'
  );
  updateVideoProgress();
}

function buildDriveMediaApiUrl(file) {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('supportsAllDrives', 'true');
  if (state.mediaAbuseAcknowledged && state.selected?.id === file.id) {
    url.searchParams.set('acknowledgeAbuse', 'true');
  }
  return url.href;
}

function describeVideoPlaybackFailure(code) {
  if (code === 2) return '원본 스트림 연결이 끊겨';
  if (code === 3) return '브라우저가 원본 영상 데이터를 해독하지 못해';
  if (code === 4) return '브라우저가 원본 코덱 또는 컨테이너를 지원하지 않아';
  return '원본 영상을 이 브라우저에서 바로 재생하지 못해';
}

function hasVerifiedOriginalTransport() {
  return state.mediaTransportVerified === true
    && [PLAYBACK_MODE.RANGE, PLAYBACK_MODE.SEQUENTIAL].includes(state.mediaPlaybackMode);
}

function decideUnsupportedFormatRecovery({
  retryCount = 0,
  transportVerified = false,
  playbackMode = '',
  decodeVerified = false
} = {}) {
  if (retryCount < 1) return 'retry-range';
  const originalResponseVerified = transportVerified === true
    && [PLAYBACK_MODE.RANGE, PLAYBACK_MODE.SEQUENTIAL].includes(playbackMode);
  if (originalResponseVerified && !decodeVerified) return 'compatibility';
  return 'buffer-original';
}

async function planPinnedOriginalAudio(owner, pin) {
  const current = () => isCurrentQ0Playback(owner, owner.fileId, owner.swGeneration)
    && navigator.serviceWorker?.controller === owner.swController && q0PinnedSource === pin;
  if (!current()) return;
  let source, cleanup;
  const closeSource = async () => {
    const closing = source;
    source = null;
    try {
      const result = await closing.abort();
      if (result?.settled !== true) owner.cleanupOk = false;
      return result || { settled: false };
    } catch (_) {
      owner.cleanupOk = false;
      return { settled: false };
    }
  };
  try {
    const [{openDriveQ1Source}, {probePinnedGeneralAudio}] = await Promise.all([
      import('./media/drive-source.mjs'), import('./media/audio-general-pipeline.mjs')]);
    if (!current()) return;
    const file = state.selected;
    source = await openDriveQ1Source({fileId:file.id, accountKey:owner.account,
      accountGeneration:owner.accountGeneration, signal:owner.controller.signal, isCurrent:current,
      readMetadata:({signal}) => readSourceRevisionMetadata(file, signal),
      readRange:({range,signal}) => {
        return fetch(buildPinnedMediaUrl(file),{signal,cache:'no-store',headers:{Range:range}});
      }});
    if (['headRevisionId','size','mimeType','modifiedTime','sha256Checksum']
      .some(key => source.identity[key] !== pin.descriptor[key])) throw new Error('Q1_SOURCE_CONTENT_DRIFT');
    // Reuse the native-format probe for raster ownership; only an actual ISO
    // ftyp header admits Q2 audio inspection. Other native formats keep Q0.
    const signature=await source.read({start:0,end:11});
    if (!current()) { await closeSource(); return; }
    const imageMime = sniffOriginalImageType(signature);
    // An ISO/non-raster decision need not await optional audio capability work
    // before the native code4 recovery can proceed.
    if (!imageMime) owner.resolveFormatDecision?.();
    if (imageMime) {
      // Only a recognized raster prefix gets this extra bounded header read.
      // Valid video retains the existing 12-byte/ftyp probe and reads.
      const header = await source.read({start:0,end:Math.min(Number(source.identity.size),64)-1});
      const valid = isValidOriginalImageHeader(header, Number(source.identity.size), imageMime);
      cleanup = await closeSource();
      if (!cleanup.settled) throw Object.assign(new Error('GENERAL_PROBE_CLEANUP_UNSETTLED'),{cleanup});
      if (current() && valid) return imageMime;
      if (current()) throw new Error('GENERAL_IMAGE_HEADER_UNQUALIFIED');
      return;
    }
    if (signature.length!==12 || String.fromCharCode(...signature.subarray(4,8))!=='ftyp') {
      cleanup=await closeSource();
      if (!cleanup.settled) throw Object.assign(new Error('GENERAL_PROBE_CLEANUP_UNSETTLED'),{cleanup});
      return;
    }
    const decision=await probePinnedGeneralAudio(source,{signal:owner.controller.signal,isCurrent:current});
    cleanup={settled:true}; source=null;
    if (!current() || decision.route==='native') return;
    if (decision.route==='unsupported') throw new Error('AUDIO_NATIVE_GATE_UNAVAILABLE');
    const snapshot=capturePlaybackSnapshot();
    emitMediaDiagnosticStage('route-selected',{route:'q2',reason:decision.reason},owner.session);
    void tryOriginalTsPlayback(file,owner.session,{general:true,audioCompatibility:true,snapshotOverride:snapshot});
  } catch (error) {
    if (error?.cleanup && error.cleanup.settled !== true) owner.cleanupOk = false;
    cleanup=source ? await closeSource() : error?.cleanup;
    if (!current()) return;
    // A bounded optional Q2 inspection cannot disqualify native Q0 merely
    // because its metadata/index exceeds the stricter general-player budget.
    // Source, malformed-input and uncertain-cleanup errors remain terminal.
    if (cleanup?.settled===true && ['GENERAL_CONTAINER_UNQUALIFIED','GENERAL_CODEC_UNQUALIFIED',
      'GENERAL_ISO_FEATURE_UNQUALIFIED','GENERAL_MOOV_LIMIT','GENERAL_TRACK_LIMIT',
      'GENERAL_FRAGMENTED_INPUT_UNQUALIFIED','GENERAL_EXPANDED_INDEX_LIMIT',
      'GENERAL_TABLE_ENTRIES_LIMIT','GENERAL_BOX_COUNT','GENERAL_DISCOVERY_LIMIT',
      'GENERAL_PACKET_LIMIT','GENERAL_METADATA_LIMIT','GENERAL_INPUT_SPAN_LIMIT'].includes(error?.message)) return;
    emitMediaDiagnosticStage('q1-failed',{reason:/^(?:GENERAL|Q1_SOURCE|AUDIO)_[A-Z0-9_]+$/.test(error?.message)
      ? error.message : 'GENERAL_AUDIO_PROBE_FAILED',terminal:true},owner.session);
    clearDirectMediaSources();
    state.mediaAttempt='failed';
    showMediaError('원본 형식을 안전하게 확인하지 못했습니다. 앱을 새로 연 뒤 다시 시도하세요.',
      {title:'원본 형식 확인 필요',showRetry:false});
  }
}

function sniffOriginalImageType(bytes) {
  if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1) return null;
  const matches = (offset, pattern) => bytes.length >= offset + pattern.length
    && pattern.every((value, index) => bytes[offset + index] === value);
  if (matches(0,[137,80,78,71,13,10,26,10])) return 'image/png';
  if (matches(0,[255,216,255])) return 'image/jpeg';
  if (matches(0,[71,73,70,56,55,97]) || matches(0,[71,73,70,56,57,97])) return 'image/gif';
  if (matches(0,[82,73,70,70]) && matches(8,[87,69,66,80])) return 'image/webp';
  if (matches(0,[66,77])) return 'image/bmp';
  return null; // Never HTML, JSON, SVG or a metadata/filename-only inference.
}

function isValidOriginalImageHeader(bytes, size, mimeType) {
  if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1
    || !Number.isSafeInteger(size) || size < bytes.length || bytes.length > 64
    || sniffOriginalImageType(bytes) !== mimeType) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === 'image/png') {
    if (bytes.length < 33 || view.getUint32(8) !== 13
      || String.fromCharCode(...bytes.subarray(12,16)) !== 'IHDR') return false;
    const width=view.getUint32(16), height=view.getUint32(20), depth=bytes[24], color=bytes[25];
    const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
    return width>0 && width<=0x7fffffff && height>0 && height<=0x7fffffff
      && depths[color]?.includes(depth) === true && bytes[26]===0 && bytes[27]===0 && bytes[28]<=1;
  }
  if (mimeType === 'image/gif') return bytes.length>=13 && size>13
    && view.getUint16(6,true)>0 && view.getUint16(8,true)>0;
  if (mimeType === 'image/webp') return bytes.length>=20 && size>=20
    && view.getUint32(4,true)+8===size
    && ['VP8 ','VP8L','VP8X'].includes(String.fromCharCode(...bytes.subarray(12,16)))
    && view.getUint32(16,true)>0 && view.getUint32(16,true)<=size-20;
  if (mimeType === 'image/bmp') {
    if (bytes.length<26) return false;
    const dib=view.getUint32(14,true), offset=view.getUint32(10,true);
    return [12,40,52,56,64,108,124].includes(dib) && offset>=14+dib && offset<size
      && view.getUint32(2,true)<=size && view.getUint32(2,true)>offset
      && (dib===12 ? view.getUint16(18,true)>0 && view.getUint16(20,true)>0
        : bytes.length>=30 && view.getInt32(18,true)>0 && view.getInt32(22,true)!==0);
  }
  return mimeType === 'image/jpeg' && bytes.length>=4 && size>3
    && bytes[3]!==0 && bytes[3]!==255;
}

function currentVerifiedOriginalImage(file = state.selected) {
  const image = verifiedOriginalImage;
  return image && state.selected?.id === file?.id && image.fileId === file?.id
    && image.session === state.mediaSession && image.playbackSession === state.playbackSession
    && image.accountId === state.accountId && image.account === state.authAccountKey
    && image.accountGeneration === state.driveSessionGeneration && image.pin === q0PinnedSource
    ? image : null;
}

function isVideoPresentation(file = state.selected) {
  return Boolean(file?.mimeType?.startsWith('video/') && !currentVerifiedOriginalImage(file));
}

async function presentPinnedOriginalImage(owner, pin, mimeType) {
  if (!isCurrentQ0Playback(owner, owner.fileId, owner.swGeneration)
    || navigator.serviceWorker?.controller !== owner.swController || q0PinnedSource !== pin) return;
  const file=state.selected, session=state.mediaSession, playbackSession=state.playbackSession,
    accountId=state.accountId, routeGeneration=++initialMediaRouteGeneration;
  clearDirectMediaSources();
  const sourceGeneration=mediaSourceGeneration;
  const current=()=>state.selected?.id===file.id && state.mediaSession===session
    && state.playbackSession===playbackSession && state.accountId===accountId
    && state.authAccountKey===owner.account && state.driveSessionGeneration===owner.accountGeneration
    && mediaSourceGeneration===sourceGeneration && initialMediaRouteGeneration===routeGeneration
    && navigator.serviceWorker?.controller===owner.swController && q0PinnedSource===pin
    && q0Playback===null && q1Playback===null && el.playerSheet?.hidden!==true;
  state.mediaAttempt='image-routing';
  try {
    const cleanup=await q1Retirement;
    if (!current()) return;
    if (!cleanup.settled) throw new Error('GENERAL_IMAGE_CLEANUP_UNSETTLED');
    verifiedOriginalImage=Object.freeze({fileId:file.id,session,playbackSession,accountId,
      account:owner.account,accountGeneration:owner.accountGeneration,pin,mimeType});
    beginMediaViewObservation({previousSession:session});
    setNativeVideoActionsAvailable(false);
    updatePlayPauseUI();
    emitMediaDiagnosticStage('route-selected',{route:'range',kind:'image',reason:'original-image-signature'},session);
    startOriginalRangePlayback(file,'image',session,'Drive 원본 이미지 준비 중');
  } catch (_) {
    if (!current()) return;
    verifiedOriginalImage=null;
    state.mediaAttempt='failed';
    showMediaError('원본 이미지 연결 정리가 확인되지 않았습니다. 앱을 새로 연 뒤 다시 시도하세요.',
      {title:'원본 이미지 확인 필요',showRetry:false});
  }
}

async function tryOriginalTsPlayback(file, session, { initial = false, general = false, audioCompatibility = false, videoCompatibility = false, nativeVideoRejected = false, snapshotOverride = null,
  selectedAudioTrackId = playerTracksOwner?.current() ? playerTracksOwner.selectedAudioTrackId : undefined,
  nativeColorObservation = playerTracksOwner?.current() ? playerTracksOwner.nativeColorObservation : null,
  expectedIdentity = playerTracksOwner?.current() ? playerTracksOwner.identity : null } = {}) {
  if (!(globalThis.MediaSource || globalThis.ManagedMediaSource) || !globalThis.Worker) return false;
  nativeVideoRejected ||= general && !audioCompatibility && !videoCompatibility
    && state.mediaTransportVerified===true && el.videoPlayer.error?.code===4;
  retireQ0Playback();
  const account = state.authAccountKey, accountGeneration = state.driveSessionGeneration;
  const oldAttempt = state.mediaAttempt;
  const controller = new AbortController();
  let setupFinished;
  const previousRetirement = q1Retirement;
  const owner = { player: null, controller, cleanupOk: true, requiresSwReadiness: true,
    selectedAudioTrackId, audioCompatibility, nativeColorObservation,
    fileId: file.id, session, account, accountGeneration,
    swController: navigator.serviceWorker?.controller, swGeneration: mediaSourceGeneration,
    setupDone: new Promise(resolve => { setupFinished = resolve; }) };
  state.mediaAbortController?.abort();
  state.mediaAbortController = controller;
  state.mediaAttempt = 'q1-probing';
  q1Playback = owner;
  const current = () => q1Playback === owner && !controller.signal.aborted
    && state.selected?.id === file.id && state.mediaSession === session
    && state.authAccountKey === account && state.driveSessionGeneration === accountGeneration
    && owner.swController === navigator.serviceWorker?.controller
    && owner.swGeneration === mediaSourceGeneration;
  const resumeNative = async () => {
    const sourceGeneration = mediaSourceGeneration, routeGeneration = initialMediaRouteGeneration;
    q1Playback = null; controller.abort(); state.mediaAbortController = null;
    setupFinished();
    const retired = await retireQ1Playback(owner);
    if (q1Playback || state.selected?.id !== file.id || state.mediaSession !== session
      || state.authAccountKey !== account || state.driveSessionGeneration !== accountGeneration
      || mediaSourceGeneration !== sourceGeneration || initialMediaRouteGeneration !== routeGeneration) return true;
    if (!retired.settled) {
      state.mediaAttempt = 'failed';
      showMediaError(SOURCE_CLEANUP_UNCONFIRMED_MESSAGE);
      return true;
    }
    state.mediaAttempt = oldAttempt;
    return false;
  };
  const stopFailure = code => {
    if (!current()) return;
    emitMediaDiagnosticStage('q1-failed', { reason: code, terminal: true }, session);
    retireQ1Playback(owner);
    state.mediaAttempt = 'failed';
    showMediaError('원본 재생 경로에서 안전하게 재생을 이어가지 못했습니다.',
      { title: '원본 재생 확인 필요', showRetry: false });
  };
  try {
    const retired = await previousRetirement;
    const tracksRetired = await playerTracksRetirement;
    if (!current()) return true;
    if (!retired.settled || !tracksRetired.settled) throw new Error('Q1_CLEANUP_UNCONFIRMED');
    // Retirement makes the previous generation permanently unavailable in SW.
    mediaSourceGeneration += 1;
    owner.swGeneration = mediaSourceGeneration;
    const { openDriveQ1Source } = await import('./media/drive-source.mjs');
    if (!current()) return true;
    let routeIdentity = null;
    const openSource = async ({ signal }) => {
      let sourceMetadata;
      const source = await openDriveQ1Source({
      fileId: file.id, accountKey: account, accountGeneration, signal, isCurrent: current,
      readMetadata: async ({ signal }) => {
        sourceMetadata = await readSourceRevisionMetadata(file, signal);
        return sourceMetadata;
      },
      readRange: ({ range, signal }) => {
        const url = new URL(buildMediaUrl({ ...file, size: sourceMetadata.size, mimeType: sourceMetadata.mimeType }), location.href);
        url.searchParams.set('mediaOwner', 'q1');
        return fetch(url.href, { signal, cache: 'no-store', headers: { Range: range } });
      }
      });
      if (q0PinnedSource && ['headRevisionId','size','mimeType','modifiedTime','sha256Checksum']
        .some(key => source.identity[key] !== q0PinnedSource.descriptor[key])) {
        const cleanup = await source.abort();
        throw Object.assign(new Error('Q1_SOURCE_CONTENT_DRIFT'), { cleanup });
      }
      if (expectedIdentity && (['accountKey','accountGeneration','fileId','headRevisionId','size','mimeType','modifiedTime','canDownload','trashed']
        .some(key => source.identity[key] !== expectedIdentity[key])
        || expectedIdentity.sha256Checksum && source.identity.sha256Checksum !== expectedIdentity.sha256Checksum)) {
        const cleanup = await source.abort();
        throw Object.assign(new Error('Q1_SOURCE_CONTENT_DRIFT'), {cleanup});
      }
      // A new generation may not silently switch revisions after admission.
      // files.version remains a metadata counter, not a content-only fence.
      if (routeIdentity && (['accountKey','accountGeneration','fileId','headRevisionId','size','mimeType','modifiedTime','canDownload','trashed']
        .some(key => source.identity[key] !== routeIdentity[key])
        || (routeIdentity.sha256Checksum && routeIdentity.sha256Checksum !== source.identity.sha256Checksum))) {
        const cleanup = await source.abort();
        throw Object.assign(new Error('Q1_SOURCE_CONTENT_DRIFT'), { cleanup });
      }
      return source;
    };
    // A sniff is bounded and identity-fenced. Extension/MIME is not the route.
    const sniff = await openSource({ signal: controller.signal });
    let head;
    try { head = await sniff.read({ start: 0, end: Math.min(Number(sniff.identity.size), 940) - 1 }); }
    finally {
      const cleanup = await sniff.abort();
      owner.cleanupOk = cleanup.settled;
      if (!cleanup.settled) throw new Error('Q1_CLEANUP_UNCONFIRMED');
    }
    if (!current()) return true;
    const ts = Number(sniff.identity.size) % 188 === 0 && head.length >= 188 * 5
      && [0,188,376,564,752].every(offset => head[offset] === 0x47);
    if (ts && selectedAudioTrackId !== undefined) throw new Error('GENERAL_AUDIO_SELECTION_CONTAINER_UNQUALIFIED');
    if (!ts && !general) return resumeNative();
    routeIdentity = sniff.identity;
    owner.routeIdentity = routeIdentity;
    const createPlayer = ts
      ? (await import('./media/ts-player.mjs')).createTsPlayer
      : (await import('./media/general-player.mjs')).createGeneralPlayer;
    owner.kind = ts ? 'ts' : 'general';
    if (!current()) return true;
    const resume = initial && state.resumePosition?.fileId === file.id ? state.resumePosition : null;
    const snapshot = snapshotOverride || (resume ? (resume.snapshot || { ...capturePlaybackSnapshot(), time: resume.time })
      : pendingPlaybackRestore?.fileId === file.id && pendingPlaybackRestore.session === session
        ? pendingPlaybackRestore.snapshot : capturePlaybackSnapshot());
    if (resume) state.resumePosition = null;
    // Retire native Q0 without disposing this newly selected owner.
    q1Playback = null; clearDirectMediaSources(); q1Playback = owner;
    owner.swGeneration = mediaSourceGeneration;
    state.mediaAttempt = 'q1'; state.mediaPlaybackMode = videoCompatibility ? PLAYBACK_MODE.VIDEO_COMPATIBILITY : PLAYBACK_MODE.REPACKAGED;
    state.mediaTransportVerified = false; state.mediaTransportStarted = false; state.mediaDecodeVerified = false;
    setNativeVideoActionsAvailable(true);
    el.videoPlayer.hidden = false; el.videoPlayer.dataset.mediaSession = String(session);
    const poster = file.thumbnailLink || generatedThumbnailCache.get(file.id);
    if (poster) { el.videoPlayer.poster = poster; el.videoPlayer.classList.add('has-poster'); }
    if (snapshot) {
      if (Number.isFinite(snapshot.playbackRate) && snapshot.playbackRate > 0) {
        el.videoPlayer.playbackRate = snapshot.playbackRate;
        el.videoPlayer.addEventListener('loadedmetadata', () => {
          if (current()) reapplyRestoredPlaybackRate(el.videoPlayer, snapshot.playbackRate);
        }, { once: true });
      }
    }
    owner.player = createPlayer({ video: el.videoPlayer, openSource, isCurrent: current,
      ...(!ts ? {selectedAudioTrackId, nativeColorObservation} : {}),
      ...(audioCompatibility && !ts ? { workerFactory: () => new Worker(new URL('./media/audio-general-worker.mjs', location.href), { type: 'module' }) } : {}),
      ...(videoCompatibility && !ts ? { workerFactory: () => new Worker(new URL('./media/video-q3-worker.mjs', location.href), { type: 'module' }) } : {}),
      initialTime: ts && Number.isFinite(snapshot?.time) ? snapshot.time : 0,
      ...(!ts && snapshot?.time > 0 ? {initialPresentationTime: snapshot.time} : {}),
      autoplay: !ts && snapshot?.time > 0 ? state.pendingPlay || snapshot.paused === false
        : resume?.snapshot ? snapshot.paused === false : state.pendingPlay || snapshot?.paused === false,
      onEvent(event) {
        if (!current()) return;
        if (event.type === 'starting') {
          mediaSourceGeneration += 1;
          owner.swGeneration = mediaSourceGeneration;
          clearMediaSeekWatchdog('q1-source'); clearMediaFrameWatchdog('q1-source'); cancelVideoFrameSampling();
          state.isSeeking = false; state.mediaTransportVerified = false; state.mediaTransportStarted = false;
          state.mediaDecodeVerified = false; state.lastPresentedMediaTime = null;
          showMediaLoading(); updateQualityDisplay();
        } else if (event.type === 'buffered') {
          state.mediaTransportVerified = true; state.mediaTransportStarted = true;
          state.pendingPlay = false;
          if (playerTracksOwner?.current() && selectedAudioTrackId !== undefined) {
            el.playerTracksStatus.textContent = '선택한 음성을 유지해 재생합니다. 자막은 텍스트만 표시합니다.';
          }
          el.codecNote.textContent = videoCompatibility
            ? '원본 크기와 프레임 순서를 유지한 VP9 호환 변환입니다. 영상은 무손실이 아니며 이 기기의 장시간 품질·성능은 별도 확인이 필요합니다.'
            : owner.audioTransformed
            ? '영상 원본 스트림을 유지하고 음성을 Opus로 호환 변환합니다. 음성은 무손실이 아닙니다.'
            : '원본 영상·음성 스트림을 재인코딩 없이 재포장합니다. 실제 표시와 탐색은 별도로 확인합니다.';
          updateQualityDisplay(); beginVideoFrameSampling(); syncMediaFrameWatchdog(); refreshPlayerSubtitles();
        } else if (event.type === 'mapping') {
          owner.audioTransformed = event.status?.bitPerfectAudio === false;
          if (event.status?.level === 'Q3') state.mediaPlaybackMode = PLAYBACK_MODE.VIDEO_COMPATIBILITY;
          if (owner.audioTransformed) state.mediaPlaybackMode = PLAYBACK_MODE.AUDIO_COMPATIBILITY;
          updateQualityDisplay();
          refreshPlayerSubtitles();
        } else if (event.type === 'source-ended') {
          updateVideoProgress();
        } else if (event.type === 'gesture-required') showPlayerFeedback('화면을 눌러 재생');
        else if (event.type === 'error') {
          if (selectedAudioTrackId === undefined && !ts && general && !audioCompatibility && !videoCompatibility && event.code === 'GENERAL_CODEC_UNQUALIFIED') {
            // Only codec admission can probe the independently qualified Q2 worker.
            // No transport, permission, identity, cleanup or decode failure enters it.
            const routeGeneration = initialMediaRouteGeneration;
            const sourceGeneration = mediaSourceGeneration;
            q1Playback = null; setupFinished();
            void retireQ1Playback(owner).then(retired => {
              if (q1Playback || state.selected?.id !== file.id || state.mediaSession !== session
                || state.authAccountKey !== account || state.driveSessionGeneration !== accountGeneration
                || mediaSourceGeneration !== sourceGeneration
                || initialMediaRouteGeneration !== routeGeneration) return;
              if (!retired.settled) {
                state.mediaAttempt = 'failed';
                showMediaError(SOURCE_CLEANUP_UNCONFIRMED_MESSAGE);
                return;
              }
              void tryOriginalTsPlayback(file, session, { general: true, audioCompatibility: true, nativeVideoRejected, snapshotOverride: snapshot });
            });
          } else if (!ts && audioCompatibility && !videoCompatibility && nativeVideoRejected
            && event.code === 'GENERAL_CODEC_UNQUALIFIED' && !owner.q3Probing) {
            owner.q3Probing=true;
            owner.q3ProbeDone=(async()=>{
              let decision, failure;
              try {
                const {probePinnedQ3Video}=await import('./media/video-q3-pipeline.mjs');
                if(!current())return;
                const source=await openSource({signal:controller.signal});
                decision=await probePinnedQ3Video(source,{signal:controller.signal,isCurrent:current,nativeRejected:true});
              } catch(error) { failure=error; if(error.cleanup?.settled===false)owner.cleanupOk=false; }
              return {decision,failure};
            })();
            void owner.q3ProbeDone.then(async({decision,failure}={})=>{
              if(!current())return;
              const sourceGeneration=mediaSourceGeneration, routeGeneration=initialMediaRouteGeneration;
              q1Playback=null; setupFinished(); const retired=await retireQ1Playback(owner);
              const choiceCurrent=()=>!q1Playback&&state.selected?.id===file.id&&state.mediaSession===session
                && state.authAccountKey===account&&state.driveSessionGeneration===accountGeneration
                && mediaSourceGeneration===sourceGeneration&&initialMediaRouteGeneration===routeGeneration
                && navigator.serviceWorker?.controller===owner.swController;
              if(!choiceCurrent())return;
              state.mediaAttempt='failed';
              if(!retired.settled) {showMediaError(SOURCE_CLEANUP_UNCONFIRMED_MESSAGE,{showRetry:false});return;}
              if(failure&&!/^Q3_[A-Z0-9_]*(?:UNQUALIFIED|REQUIRED)$/.test(failure.message)) {
                showMediaError('원본 연결과 입력 정보 확인을 안전하게 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.',{title:'원본 확인 실패',showRetry:true});return;
              }
              if(failure||decision?.route!=='q3') {showMediaError('이 영상의 코덱·트랙·색 정보 조합에 대해 안전한 브라우저 변환 경로를 확보하지 못했습니다.',{title:'영상 호환 범위 확인 필요',showRetry:false});return;}
              showMediaError('이 기기에서 원본 영상 코덱을 지원하지 않습니다. 원본 크기와 프레임 순서를 유지해 VP9로 변환할 수 있지만 영상은 무손실이 아닙니다. 변환에는 기기 자원이 필요하며 장시간 품질·성능은 아직 확인되지 않았습니다.',{title:'영상 호환 변환',showRetry:false});
              q3Choice={file,session,snapshot,current:choiceCurrent};el.videoCompatButton.hidden=false;
            }).catch(()=>{if(current())stopFailure('Q3_PROBE_FAILED');});
          } else stopFailure(event.code);
        }
      }
    });
    owner.player.ready.catch(() => {});
    return true;
  } catch (error) {
    if (error?.cleanup?.settled === false) owner.cleanupOk = false;
    // Only this explicit pre-byte eligibility result can keep native Q0.
    // Permission, malformed metadata, drift, timeout and unknown cleanup remain
    // failures; they are never disguised as unsupported packaging.
    if (initial && current() && error?.message === 'Q1_SOURCE_IDENTITY_UNAVAILABLE'
      && error.cleanup?.settled === true) return resumeNative();
    if (current()) stopFailure(/^Q1_[A-Z_]+$/.test(error?.message) ? error.message : 'Q1_SETUP_FAILED');
    return true;
  } finally { setupFinished(); }
}

async function handleMediaElementError(kind) {
  if (kind === 'video') {
    clearMediaSeekWatchdog('media-error');
    clearMediaFrameWatchdog('media-error');
  }
  const element = kind === 'video' ? el.videoPlayer : el.imageViewer;
  if (!element.getAttribute('src') || !state.selected) return;
  if (!q0Playback && !q1RetirementResult && ['range','range-retry'].includes(state.mediaAttempt)) return;
  if (
    state.mediaAttempt === 'range-preparing' || state.mediaAttempt === 'blob-loading' || state.mediaAttempt === 'buffer-evaluating'
    || state.mediaAttempt === 'auth-refresh' || state.mediaAttempt === 'retry-wait'
    || state.mediaAttempt.startsWith('drive-preview') || state.mediaAttempt.startsWith('q1')
  ) return;

  const file = state.selected;
  const session = state.mediaSession;
  const sourceGeneration = mediaSourceGeneration;
  const attempt = state.mediaAttempt;
  const mediaErrorCode = Number(element.error?.code) || 0;
  emitMediaDiagnosticStage('media-error', {
    kind,
    mediaErrorCode,
    reason: `media-element-code-${mediaErrorCode || 'unknown'}`,
    confidence: 'provisional',
    terminal: false
  }, session);

  // The media element and service worker report the same failure on separate
  // queues. Give the classified HTTP error a brief chance to arrive first so
  // a 401/403/429/5xx response is not mislabeled as an unsupported codec.
  await new Promise((resolve) => window.setTimeout(resolve, MEDIA_ERROR_CLASSIFY_DELAY_MS));
  const formatOwner = kind === 'video' && mediaErrorCode === 4 ? q0Playback : null;
  if (formatOwner?.audioProbeStarted
    && isCurrentQ0Playback(formatOwner, file.id, sourceGeneration)) {
    // Native decode failure may precede the bounded pinned-format probe. Join
    // its decision before a video retry can retire a verified raster handoff.
    await (formatOwner.formatDecision || formatOwner.setupDone);
    if (!isCurrentQ0Playback(formatOwner, file.id, sourceGeneration)
      || navigator.serviceWorker?.controller !== formatOwner.swController) return;
  }
  if (
    state.selected?.id !== file.id || state.mediaSession !== session
    || mediaSourceGeneration !== sourceGeneration
    || state.mediaAttempt !== attempt
  ) return;

  const diagnosticReason = !navigator.onLine
    ? 'network-offline'
    : !hasUsableToken()
      ? 'credential-missing'
      : state.lastProxyError
        ? `proxy-${classifyMediaProxyFailure(state.lastProxyError)}`
        : mediaErrorCode === 4
          ? 'container-or-decoder'
          : `media-element-code-${mediaErrorCode || 'unknown'}`;
  emitMediaDiagnosticStage('media-error-classified', {
    kind,
    mediaErrorCode,
    reason: diagnosticReason,
    confidence: 'classified-after-worker-window',
    terminal: true
  }, session);

  if (!navigator.onLine) {
    state.mediaAttempt = 'failed';
    showMediaError('네트워크가 오프라인입니다. 연결 후 다시 시도하세요.');
    return;
  }
  if (!hasUsableToken()) {
    state.mediaAttempt = 'failed';
    showMediaError('Google 인증 시간이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    return;
  }
  if (state.lastProxyError) {
    // The service worker owns classified HTTP recovery. Avoid starting a
    // competing codec/blob fallback for the same failed request.
    return;
  }

  if (state.mediaAttempt === 'range' || state.mediaAttempt === 'range-retry') {
    if (kind === 'image') {
      state.mediaAttempt = 'buffer-evaluating';
      await startOriginalBlobFallback(file, kind, session, {
        expectedSourceGeneration: sourceGeneration
      });
    } else if (mediaErrorCode === 4) {
      const unsupportedAction = decideUnsupportedFormatRecovery({
        retryCount: state.mediaRetryCount,
        transportVerified: state.mediaTransportVerified,
        playbackMode: state.mediaPlaybackMode,
        decodeVerified: state.mediaDecodeVerified
      });
      if (unsupportedAction === 'retry-range') {
        retryOriginalStream(file, session, '원본 응답을 다시 검증한 뒤 형식 호환성을 확인하는 중');
      } else if (unsupportedAction === 'compatibility' && q0PinnedSource
        && await tryOriginalTsPlayback(file, session, { general: true })) {
        // The Q1 owner controls source identity, append/decode and recovery.
      } else if (unsupportedAction === 'compatibility') {
        showDrivePreview(file, describeVideoPlaybackFailure(mediaErrorCode));
      } else {
        state.mediaAttempt = 'buffer-evaluating';
        await offerOriginalBufferFallback(
          file,
          kind,
          session,
          describeVideoPlaybackFailure(mediaErrorCode),
          sourceGeneration
        );
      }
    } else if (mediaErrorCode === 3 && state.mediaRangeIntegrity === 'valid' && state.mediaRetryCount < 1) {
      retryOriginalStream(file, session, '검증된 원본 스트림을 새로 만들어 다시 연결하는 중');
    } else if ((mediaErrorCode === 1 || mediaErrorCode === 2) && state.mediaRetryCount < 1) {
      retryOriginalStream(file, session, '원본 스트림 연결이 끊겨 자동으로 다시 연결하는 중');
    } else {
      state.mediaAttempt = 'buffer-evaluating';
      await offerOriginalBufferFallback(
        file,
        kind,
        session,
        describeVideoPlaybackFailure(mediaErrorCode),
        sourceGeneration
      );
    }
    return;
  }

  if (state.mediaAttempt === 'blob') {
    showDrivePreview(file, kind === 'video'
      ? '브라우저가 임시 저장한 원본 코덱을 해독하지 못해'
      : '브라우저가 원본 이미지 형식을 표시하지 못해');
  }
}

function scheduleOriginalStreamRetry(file, expectedSession, delayMs, message) {
  if (!file || state.selected?.id !== file.id || state.mediaSession !== expectedSession) return;
  clearMediaSeekWatchdog('retry-wait');
  clearMediaFrameWatchdog('retry-wait');
  clearTimeout(mediaRecoveryTimer);
  retireQ0Playback();
  state.mediaAttempt = 'retry-wait';
  showMediaLoading();
  mediaRecoveryTimer = window.setTimeout(() => {
    mediaRecoveryTimer = null;
    retryOriginalStream(file, expectedSession, '원본 스트림 자동 재연결 중');
  }, delayMs);
}

function retryOriginalStream(file, expectedSession, message, { consumeRetry = true, afterRetirement = false } = {}) {
  if (
    !file || !file.mimeType?.startsWith('video/') || state.selected?.id !== file.id
    || state.mediaSession !== expectedSession || (consumeRetry && state.mediaRetryCount >= 1)
  ) return false;

  if (!afterRetirement) {
    retireQ0Playback();
    if (!q1RetirementResult) {
      const accountGeneration = state.driveSessionGeneration;
      void q1Retirement.then(() => {
        if (accountGeneration === state.driveSessionGeneration) retryOriginalStream(file, expectedSession, message,
          { consumeRetry, afterRetirement: true });
      });
      return true;
    }
  }
  if (!q1RetirementResult?.settled) {
    state.mediaAttempt = 'failed';
    showMediaError(SOURCE_CLEANUP_UNCONFIRMED_MESSAGE);
    return false;
  }

  if (currentVerifiedOriginalImage(file)) {
    if (consumeRetry) state.mediaRetryCount += 1;
    state.lastProxyError = null;
    clearDirectMediaSources();
    beginMediaViewObservation({ previousSession: expectedSession });
    setNativeVideoActionsAvailable(false);
    updatePlayPauseUI();
    return startOriginalRangePlayback(file, 'image', expectedSession, message);
  }

  if (navigator.serviceWorker && !hasQ0CapableController()) {
    return waitForQ0Control(file, 'video', expectedSession, message,
      () => retryOriginalStream(file, expectedSession, message, { consumeRetry, afterRetirement: true }));
  }

  clearMediaSeekWatchdog('range-retry');
  clearMediaFrameWatchdog('range-retry');
  cancelVideoFrameSampling();
  const snapshot = state.resumePosition?.fileId === file.id && state.resumePosition.snapshot
    ? state.resumePosition.snapshot
    : capturePlaybackSnapshot();
  if (state.resumePosition?.fileId === file.id) state.resumePosition = null;
  state.mediaSession += 1;
  beginMediaViewObservation({ previousSession: expectedSession });
  if (consumeRetry) state.mediaRetryCount += 1;
  state.lastProxyError = null;
  state.mediaAttempt = 'range-retry';
  state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
  state.mediaTransportVerified = false;
  state.mediaTransportStarted = false;
  state.mediaRangeIntegrity = 'unknown';
  const retrySession = state.mediaSession;
  updateMediaDiagnosticSession(retrySession, 'range-retry');

  clearDirectMediaSources();
  mediaSourceGeneration += 1;
  setNativeVideoActionsAvailable(true);
  const poster = file.thumbnailLink || generatedThumbnailCache.get(file.id) || '';
  if (poster) {
    el.videoPlayer.poster = poster;
    el.videoPlayer.classList.add('has-poster');
  }
  updateQualityDisplay();
  showMediaLoading();
  sendTokenToWorker();

  el.videoPlayer.hidden = false;
  el.videoPlayer.dataset.mediaSession = String(retrySession);
  beginQ0Playback(file, retrySession);
  el.videoPlayer.src = buildPinnedMediaUrl(file);
  restorePlaybackSnapshot(el.videoPlayer, snapshot, retrySession);
  el.videoPlayer.load();
  if (!snapshot || !snapshot.paused) {
    state.pendingPlay = true;
    attemptCurrentPlayback(retrySession);
  }
  return true;
}

