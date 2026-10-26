'use strict';

// Frame presentation, quality display, loading/error states and player close.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

function completeVideoFramePresentation(owner, confidence = 'decoded-frame') {
  const video = owner?.video;
  if (!video || video.hidden || !el.mediaLoading || !isCurrentMediaEvent(video)
    || state.selected?.id !== owner.fileId || state.mediaSession !== owner.session
    || state.playbackSession !== owner.playbackSession
    || state.accountId !== owner.accountId || state.authAccountKey !== owner.authAccountKey
    || state.driveSessionGeneration !== owner.accountGeneration
    || state.mediaAttempt !== owner.sourceAttempt || mediaSourceGeneration !== owner.sourceGeneration
    || mediaSeekGeneration !== owner.seekGeneration) {
    if (owner === completedMediaSeekPresentation) completedMediaSeekPresentation = null;
    return false;
  }
  if (isCurrentMediaSeekOwner() || state.isSeeking || video.seeking === true) return false;
  delete video.dataset.presentationSession;
  if (mediaDiagnosticTrace && !mediaDiagnosticTrace.firstFrameSeen) {
    mediaDiagnosticTrace.firstFrameSeen = true;
    emitMediaDiagnosticStage(
      confidence === 'decoded-frame' ? 'first-decoded-frame' : 'presentation-fallback',
      { currentTime: Number(video.currentTime) || 0, confidence }, owner.session);
  }
  video.classList.add('is-ready');
  video.classList.remove('has-poster');
  video.removeAttribute('poster');
  tryCaptureAmbientFrame();
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = true;
  scheduleNextFilePage();
  warmPlaybackNeighborhood(state.selected, { loadPopulation: true });
  prewarmNextPlaybackPin();
  updateQualityDisplay();
  hideSwipeNeighbor({ immediate: false });
  return true;
}

function scheduleVideoFramePresentation(video = el.videoPlayer, session = state.mediaSession) {
  if (!video || video.hidden || !isCurrentMediaEvent(video)) return;
  const completed = completedMediaSeekPresentation;
  if (completed?.video === video && completed.frameConfidence === 'decoded-frame'
    && mediaSeekTimesMatch(video.currentTime, completed.effectiveTarget ?? completed.targetTime, completed.tolerance)
    && completeVideoFramePresentation(completed, 'decoded-frame')) return;
  const sourceAttempt = state.mediaAttempt;
  const sourceGeneration = mediaSourceGeneration;
  const seekGeneration = mediaSeekGeneration;
  const presentationKey = `${session}:${sourceAttempt}:${sourceGeneration}`;
  if (video.dataset.presentationSession === presentationKey) return;
  video.dataset.presentationSession = presentationKey;
  const presentationOwner = { video, fileId: state.selected?.id, session,
    playbackSession: state.playbackSession, accountId: state.accountId,
    authAccountKey: state.authAccountKey, accountGeneration: state.driveSessionGeneration,
    sourceAttempt, sourceGeneration, seekGeneration };
  let presented = false;
  const reveal = (confidence = 'decoded-frame') => {
    if (presented) return;
    presented = true;
    if (
      state.mediaSession !== session || !isCurrentMediaEvent(video)
      || state.mediaAttempt !== sourceAttempt
      || mediaSourceGeneration !== sourceGeneration
      || video.dataset.presentationSession !== presentationKey
    ) return;
    completeVideoFramePresentation(presentationOwner, confidence);
  };

  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback((_now, metadata) => {
      noteMediaFrameProgress(
        video,
        metadata?.mediaTime,
        'decoded-frame',
        sourceGeneration,
        seekGeneration,
        sourceAttempt
      );
      reveal('decoded-frame');
    });
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => reveal('paint-only')));
  }
}

function onMediaReady() {
  el.mediaError.hidden = true;
  if (el.videoPlayer && !el.videoPlayer.hidden) {
    scheduleVideoFramePresentation(el.videoPlayer, state.mediaSession);
  }
  if (el.imageViewer && !el.imageViewer.hidden) {
    el.mediaLoading.hidden = true;
    el.imageViewer.classList.add('is-ready');
    scheduleNextFilePage();
    warmPlaybackNeighborhood(state.selected, { loadPopulation: true });
    prewarmNextPlaybackPin();
    scheduleImageViewedPresentation(el.imageViewer);
    requestAnimationFrame(() => hideSwipeNeighbor({ immediate: false }));
  }
  updateQualityDisplay();
}

function setStreamMode(mode, label) {
  if (el.streamModeLabel) el.streamModeLabel.dataset.mode = mode;
  if (el.streamModeText) el.streamModeText.textContent = label;
}

function getResolutionCategory(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return '';
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);
  if (maxDim >= 3840 || minDim >= 2160) return '4K 2160p';
  if (maxDim >= 2560 || minDim >= 1440) return 'QHD 1440p';
  if (maxDim >= 1920 || minDim >= 1080) return 'FHD 1080p';
  if (maxDim >= 1200 || minDim >= 700) return 'HD 720p';
  if (maxDim >= 800 || minDim >= 450) return 'SD 480p';
  return 'SD';
}

function getPlaybackQualityLabel(mode, verified) {
  if (mode === PLAYBACK_MODE.COMPATIBILITY) return 'Google 호환 재생 · 원본 화질 미확인';
  if (mode === PLAYBACK_MODE.VIDEO_COMPATIBILITY) return verified ? '호환 변환 · 영상 손실 압축' : '호환 변환 확인 중';
  if (!verified) return '원본 확인 중';
  if (mode === PLAYBACK_MODE.AUDIO_COMPATIBILITY) return '영상 원본 · 음성 호환 변환';
  if (mode === PLAYBACK_MODE.REPACKAGED) return '원본 스트림 · 재포장';
  if (mode === PLAYBACK_MODE.SEQUENTIAL) return 'Drive 원본 파일 · 연속 전송';
  if (mode === PLAYBACK_MODE.OPFS) return 'Drive 원본 파일 · 임시 디스크';
  if (mode === PLAYBACK_MODE.MEMORY) return 'Drive 원본 파일 · 메모리';
  return 'Drive 원본 파일 · Range 무변환 전송';
}

function updateQualityDisplay() {
  const file = state.selected;
  if (!file) return;
  updatePlayerNavigationLabels(file);

  const attempt = state.mediaAttempt;
  const playbackMode = state.mediaPlaybackMode;
  const qualityLabel = getPlaybackQualityLabel(playbackMode, state.mediaTransportVerified);
  const isVideo = isVideoPresentation(file);
  const meta = file.videoMediaMetadata || file.imageMediaMetadata;
  const metaW = Number(meta?.width) || 0;
  const metaH = Number(meta?.height) || 0;
  const metaCat = getResolutionCategory(metaW, metaH);

  let liveW = 0;
  let liveH = 0;
  if (isVideo && el.videoPlayer && !el.videoPlayer.hidden) {
    liveW = el.videoPlayer.videoWidth || 0;
    liveH = el.videoPlayer.videoHeight || 0;
  } else if (!isVideo && el.imageViewer && !el.imageViewer.hidden) {
    liveW = el.imageViewer.naturalWidth || 0;
    liveH = el.imageViewer.naturalHeight || 0;
  }

  const effectiveW = liveW || metaW;
  const effectiveH = liveH || metaH;
  const effectiveCat = getResolutionCategory(effectiveW, effectiveH);
  if (el.playerQuality) {
    const verified = state.mediaTransportVerified && !state.demo
      && playbackMode !== PLAYBACK_MODE.COMPATIBILITY && !attempt.startsWith('drive-preview');
    const original = verified && playbackMode !== PLAYBACK_MODE.VIDEO_COMPATIBILITY;
    const knownSize = liveW && liveH ? [liveW, liveH] : original && metaW && metaH ? [metaW, metaH] : null;
    const resolution = knownSize ? `${Math.min(...knownSize)}p` : '';
    const source = original ? (playbackMode === PLAYBACK_MODE.AUDIO_COMPATIBILITY ? '영상 원본' : '원본')
      : verified ? '호환 변환' : '미확인';
    el.playerQuality.textContent = [source, resolution].filter(Boolean).join(' · ');
    el.playerQuality.hidden = !isVideo;
  }

  if (el.mediaFileSizeType) {
    const sizeStr = formatBytes(file.size);
    const mimeStr = friendlyMime(currentVerifiedOriginalImage(file)?.mimeType || file.mimeType);
    el.mediaFileSizeType.textContent = [sizeStr, mimeStr].filter(Boolean).join(' · ') || '정보 없음';
  }

  if (state.demo) {
    setStreamMode('demo', '데모 미리보기 · 원본 재생 아님');
    if (el.qualityBadge) {
      el.qualityBadge.hidden = false;
      el.qualityBadge.dataset.quality = 'preview';
      el.qualityBadge.textContent = '· 원본 재생 아님';
    }
    if (el.mediaResolution) {
      el.mediaResolution.textContent = metaW && metaH
        ? `저장 파일 정보 ${metaW} × ${metaH}${metaCat ? ` (${metaCat})` : ''}`
        : '데모 미리보기';
    }
    return;
  }

  if (playbackMode === PLAYBACK_MODE.COMPATIBILITY || attempt.startsWith('drive-preview')) {
    setStreamMode('drive', qualityLabel);
    if (el.qualityBadge) {
      el.qualityBadge.hidden = false;
      el.qualityBadge.dataset.quality = 'preview';
      el.qualityBadge.textContent = '· 원본 화질 미확인';
    }
    if (el.mediaResolution) {
      el.mediaResolution.textContent = metaW && metaH
        ? `가변 해상도 (저장 파일 정보: ${metaW}×${metaH} ${metaCat})`
        : 'Drive 호환 변환 해상도';
    }
  } else {
    const buffered = playbackMode === PLAYBACK_MODE.OPFS || playbackMode === PLAYBACK_MODE.MEMORY;
    setStreamMode(
      buffered ? 'buffer' : playbackMode === PLAYBACK_MODE.SEQUENTIAL ? 'sequential' : 'range',
      qualityLabel
    );
    if (el.qualityBadge) {
      el.qualityBadge.hidden = !state.mediaTransportVerified;
      el.qualityBadge.dataset.quality = !state.mediaTransportVerified ? 'pending'
        : buffered ? 'buffer'
          : playbackMode === PLAYBACK_MODE.VIDEO_COMPATIBILITY ? 'video-transformed'
            : playbackMode === PLAYBACK_MODE.AUDIO_COMPATIBILITY ? 'audio-transformed' : 'original';
      el.qualityBadge.textContent = `· ${qualityLabel}`;
    }
    if (el.mediaResolution) {
      el.mediaResolution.textContent = effectiveW && effectiveH
        ? `${effectiveW} × ${effectiveH}${effectiveCat ? ` (${effectiveCat})` : ''}`
        : '원본 해상도 분석 중…';
    }
  }
}

function updatePlayerNavigationLabels(file) {
  const noun = isVideoPresentation(file) ? '영상' : '이미지';
  const controlsLabel = `${noun === '영상' ? '재생' : '이미지'} 제어 열기`;
  if (el.playerControlsEntry) {
    el.playerControlsEntry.setAttribute('aria-label', controlsLabel);
    const caption = el.playerControlsEntry.querySelector('span');
    if (caption) caption.textContent = controlsLabel;
  }
  el.mediaStage?.setAttribute('aria-label', noun === '영상'
    ? '영상 화면. Tab: 재생 제어, Space: 재생 또는 일시정지, Escape: 닫기'
    : '이미지 화면. Tab: 이미지 제어, Escape: 닫기');
  for (const [ids, label] of [
    [['topbarPrevBtn','ctrlPrevVideo'], `이전 ${noun}`],
    [['topbarNextBtn','ctrlNextVideo'], `다음 ${noun}`],
    [['topbarRandomBtn','ctrlRandomShorts'], `랜덤 ${noun}${noun === '영상' ? ' (쇼츠)' : ''}`]
  ]) for (const id of ids) {
    if (!el[id]) continue;
    el[id].title = label;
    el[id].setAttribute('aria-label', label);
  }
}

function showMediaLoading() {
  updateOriginalBufferProgress.lastUpdate = -Infinity;
  setMediaLoadingProgress(null);
  el.mediaLoading.hidden = false;
  el.mediaLoading.classList?.toggle('seek-loading', Boolean(state.isSeeking && state.mediaTransportStarted));
  el.mediaError.hidden = true;
}

function setMediaLoadingProgress(percent) {
  const measured = Number.isFinite(percent);
  const value = measured ? Math.max(0, Math.min(100, Math.floor(percent))) : null;
  if (el.mediaLoadingProgress) {
    el.mediaLoadingProgress.hidden = !measured;
    if (measured) el.mediaLoadingProgress.value = value;
    else el.mediaLoadingProgress.removeAttribute('value');
  }
  if (el.mediaLoadingPercent) {
    el.mediaLoadingPercent.textContent = measured ? `${value}%` : '';
    el.mediaLoadingPercent.hidden = !measured;
  }
}

function updateNativeLoadingProgress() {
  const video = el.videoPlayer;
  if (!video || video.hidden || el.mediaLoading?.hidden !== false || state.mediaAttempt === 'blob-loading'
    || !isCurrentMediaEvent(video)) return;
  const time = Number(video.currentTime);
  const duration = Number(video.duration);
  const target = Number.isFinite(duration) && duration > time ? Math.min(3, duration - time) : 3;
  if (!Number.isFinite(time) || !video.buffered) return;
  let ahead = 0;
  for (let i = 0; i < video.buffered.length; i += 1) {
    // Disjoint ranges elsewhere in the file cannot count toward this position.
    if (video.buffered.start(i) <= time && video.buffered.end(i) >= time) {
      ahead = video.buffered.end(i) - time;
      break;
    }
  }
  if (!video.buffered.length) return;
  setMediaLoadingProgress((ahead / target) * 100);
}

function showMediaError(message, { title = '이 파일을 재생할 수 없습니다', showDrive = false, showRetry = true } = {}) {
  cancelActiveTouchGesture();
  q3Choice=null;
  if(el.videoCompatButton)el.videoCompatButton.hidden=true;
  clearTimeout(controlsHideTimer);
  // The explicit recovery panel is independent of playback chrome.
  el.playerModal?.classList.add('media-recovery-mode');
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = false;
  if (el.mediaErrorTitle) el.mediaErrorTitle.textContent = title;
  el.mediaErrorMessage.textContent = message;
  el.openDriveButton.hidden = !showDrive;
  el.retryMediaButton.hidden = !showRetry;
  el.retryMediaButton.textContent = state.mediaAttempt === 'worker-update-required'
    || q1RetirementResult?.settled === false ? '앱 다시 열기' : '다시 시도';
  el.bufferOriginalButton.hidden = true;
  el.bufferOriginalButton.textContent = '원본 전체 임시 저장';
  el.compatPlayerButton.hidden = true;
  hideSwipeNeighbor({ immediate: false });
  requestAnimationFrame(() => el.mediaErrorTitle?.focus({ preventScroll: true }));
}

function retryMedia() {
  if (!state.selected) return;
  if (state.mediaAttempt === 'worker-update-required' || q1RetirementResult?.settled === false || playerTracksRetirementResult?.settled === false) {
    window.location.reload();
    return;
  }
  if (!hasUsableToken() && !state.demo) {
    state.retryAfterAuth = true;
    state.authRetryContext = { fileId: state.selected.id, mediaSession: state.mediaSession };
    requestSessionCredential({ background: false, force: true }).then((connected) => {
      if (!connected && state.retryAfterAuth) beginAuthorization();
    });
    return;
  }
  const snapshot = capturePlaybackSnapshot();
  if (snapshot?.selectedAudioTrackId !== undefined) state.resumePosition = {fileId: state.selected.id, time: snapshot.time, snapshot};
  openMediaSource(state.selected);
}

function closePlayer({ preserveHistory = false } = {}) {
  if (el.playerSheet.hidden) return;
  cancelActiveTouchGesture();
  cancelLibraryEdgeBack();
  if (!preserveHistory && hasOwnedPlayerEntry()) {
    const next = { ...history.state };
    delete next.driveOriginalPlayer;
    try { history.replaceState(next, '', location.href); } catch (_) {}
  }
  const returnFocus = playerReturnFocus;
  playerReturnFocus = null;
  state.playbackSession += 1;
  mediaTransitionCommitting = false;
  swipeCommitPending = false;
  playbackNavigationChain = Promise.resolve();
  clearTimeout(singleTapTimer);
  singleTapTimer = null;
  lastTapTime = 0;
  clearMediaTransition();
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  finishMediaDiagnosticTrace('closed');
  resetMediaElements();
  setPlayerMediaPriorityActive(false);
  closePlayerMoreMenu();
  collapseShortsExpand();
  resetVideoRotation();
  setStageImmersive(false);
  el.playerSheet.hidden = true;
  document.body.style.overflow = '';
  setPlayerBackgroundInert(false);
  state.selected = null;
  state.resumePosition = null;
  state.playbackOrderIds = [];
  state.playbackDeck = { anchorId: null, above: [], below: [] };
  state.playbackDeckComplete = false;
  scheduleNextFilePage();
  requestAnimationFrame(() => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
}

function clearDirectMediaSources() {
  cancelActiveTouchGesture();
  playerTracksOwner?.presentation?.clear();
  q3Choice=null;
  if(el.videoCompatButton)el.videoCompatButton.hidden=true;
  q0ControlWait?.controller.abort();
  retireQ0Playback();
  const q1 = q1Playback;
  q1Playback = null;
  retireQ1Playback(q1);
  pendingPlaybackRestore = null;
  clearMediaSeekWatchdog('source-cleared');
  state.isSeeking = false;
  mediaSourceGeneration += 1;
  clearMediaFrameWatchdog('source-cleared');
  cancelVideoFrameSampling();
  if (el.videoPlayer) {
    delete el.videoPlayer.dataset.mediaSession;
    delete el.videoPlayer.dataset.presentationSession;
    el.videoPlayer.pause();
    el.videoPlayer.removeAttribute('src');
    el.videoPlayer.removeAttribute('poster');
    el.videoPlayer.classList.remove('is-ready', 'has-poster');
    el.videoPlayer.load();
    el.videoPlayer.hidden = true;
  }
  if (el.imageViewer) {
    delete el.imageViewer.dataset.mediaSession;
    el.imageViewer.removeAttribute('src');
    el.imageViewer.alt = '';
    el.imageViewer.classList.remove('is-ready');
    el.imageViewer.hidden = true;
  }
  setNativeVideoActionsAvailable(false);
  if (state.mediaBlobUrl) {
    URL.revokeObjectURL(state.mediaBlobUrl);
    state.mediaBlobUrl = null;
  }
  cleanupOriginalTempStorage();
}

function resetMediaElements() {
  cancelActiveTouchGesture();
  resetMediaZoom();
  void retirePlayerTracks();
  q0PinnedSource = null;
  verifiedOriginalImage = null;
  mediaViewObservation = null;
  state.mediaSession += 1;
  state.pendingPlay = false;
  clearMediaSeekWatchdog('session-reset');
  clearMediaFrameWatchdog('session-reset');
  activeSeekCleanup?.();
  clearTimeout(singleTapTimer);
  singleTapTimer = null;
  lastTapTime = 0;
  lastTapX = 0;
  lastTapY = 0;
  clearTimeout(mediaRecoveryTimer);
  mediaRecoveryTimer = null;
  state.mediaAbortController?.abort();
  state.mediaAbortController = null;
  cancelVideoFrameSampling();
  state.lastPresentedMediaTime = null;
  state.frameDuration = DEFAULT_FRAME_DURATION;
  clearDirectMediaSources();
  // A paused video can leave the center play control visible while the next
  // item is an image/GIF. Recompute immediately after hiding the video.
  updatePlayPauseUI();
  clearDrivePreview();
  if (el.ambientBackdrop) {
    el.ambientBackdrop.classList.remove('active');
    el.ambientBackdrop.style.backgroundImage = '';
  }
  if (el.mobileShortsProgressBar) {
    el.mobileShortsProgressBar.style.transform = 'scaleX(0)';
  }
  if (el.favoriteFeedback) {
    clearTimeout(el.favoriteFeedback._hideTimer);
    el.favoriteFeedback.classList.remove('active', 'is-removing');
    el.favoriteFeedback.hidden = true;
  }
  if (el.seekBarPlayed) el.seekBarPlayed.style.transform = 'scaleX(0)';
  if (el.seekBarBuffered) el.seekBarBuffered.style.transform = 'scaleX(0)';
  if (el.seekBarThumb) el.seekBarThumb.style.setProperty('--seek-position', '0%');
  el.mediaError.hidden = true;
  el.playerModal?.classList.remove('media-recovery-mode');
  el.openDriveButton.hidden = false;
  el.retryMediaButton.hidden = false;
  el.bufferOriginalButton.hidden = true;
  el.compatPlayerButton.hidden = true;
  if (el.mediaErrorTitle) el.mediaErrorTitle.textContent = '이 파일을 재생할 수 없습니다';
  showMediaLoading();
  state.mediaAttempt = 'idle';
  state.mediaPlaybackMode = '';
  state.mediaTransportVerified = false;
  state.mediaTransportStarted = false;
  state.mediaRangeIntegrity = 'unknown';
  state.mediaDecodeVerified = false;
  state.mediaRetryCount = 0;
  state.mediaRangeRebuildCount = 0;
  state.mediaPermissionRetryCount = 0;
  state.mediaFullRequestCount = 0;
  state.mediaExhaustedOriginalModes.clear();
  state.mediaAbuseAcknowledged = false;
  state.pendingSecurityConfirmation = null;
  state.mediaBufferStorageMode = '';
  state.pendingOriginalBuffer = null;
  state.drivePreviewReason = '';
  state.lastProxyError = null;
  state.isSeeking = false;
  state.retryAfterAuth = false;
  state.authRetryContext = null;
}

